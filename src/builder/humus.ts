import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type CrumbSpec, type MaterialSpec } from '../siteplan/catalog';
import { bounds, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2, Zone } from '../siteplan/types';
import { vnoise } from '../engine/noise';
import { CLOD_MAX, CLOD_TILE, clodField, macroHeight, type ClodStyle } from '../engine/humus-field';
import { materialTextures } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

/**
 * Beds of soil fill (a material with spec.crumb: black humus, compost, dirt), drawn as spread soil whose surface is made
 * of soft clods.
 *
 * The bed surface: a finely divided sheet over each bed, raised in the vertex shader by the clod relief of
 * humus-field.ts (lumps of 1-5 cm touching and overlapping, crumbs, loose heaps; the very relief the ground's texture for
 * the fill is painted from, read from that texture's roughness channel) and by the fill's larger lie (shovel and rake
 * heaps, ridges and hollows, a few mounds; baked with the ground height and the bed mask into a small per-bed texture). It
 * wears the ground's own humus texture, so its color and fine shading are the ground's. It is cut into 2 m tiles: near
 * ones finely divided (1.25 cm at High, 2 cm at Balanced; Light uses the coarse grid everywhere), the rest every
 * 4 cm, each tile with a short skirt so no crack shows where a fine tile meets a coarse one; past ~7 m the relief sinks smoothly into the ground (the sheet drops
 * just below it), where the texture alone carries the bed. At the bed's edge it dips under the ground, so the fill
 * settles against the edging.
 *
 * On it, a few loose clods (soft lumps 2-6 cm, crumbs stuck over a core) and short, dark shreds of bark, each shrinking
 * away into the surface over the last stretch before it stops drawing.
 *
 * Nothing pops: a fill's relief and pieces come in with its painted maps (uReady), every switch has a dead band, and a tile or piece hides only once its relief or size has shrunk to
 * nothing. Nothing is allocated per frame; programs are shared and warmed with the yard.
 */

const SHEET_TILE = 2;
/** Squares a side of a near and a far sheet tile, by quality (Light draws the far grid everywhere). */
const NEAR_SEGS: Record<Quality, number> = { max: 160, balanced: 100, light: 0, draft: 0 };
const MID_SEGS: Record<Quality, number> = { max: 56, balanced: 48, light: 40, draft: 0 };
/** How far a tile's rim hangs below its surface, meters: covers the cracks where a fine tile meets a coarse one. */
const SKIRT = 0.02;
/** Seconds over which a fill's relief and loose pieces come in once its painted maps have arrived. */
const READY_RAMP = 0.25;
/** The sheet sits this far down, so the deepest hollows and the faded-out sheet are just under the ground. */
const SINK = 0.006;
/** Base height and edge mask texel, meters. */
const BASE_STEP = 0.04;
const PIECE_TILE = 3;
const IN = 0.0254;
const CLUMP_SHAPES = 2;
const shapeCache = new Map<string, THREE.BufferGeometry>();

/** Distances (meters, balanced quality): the sheet's fine division, and where each kind fades out. */
const SHEET_NEAR = 2.2;
const SHEET_FADE: [number, number] = [7, 10];
const CLOD_NEAR = 2.2;
const CLOD_FADE: [number, number] = [5, 7];
const SHRED_FADE: [number, number] = [3, 4];

/* ------------------------------------------------------------------ */
/* The clod relief, as a texture for the vertex shader                  */
/* ------------------------------------------------------------------ */

/**
 * The clod relief at world (x, z), meters: where the GPU reads it from the painted texture's height channel (a canvas
 * texture, flipped on upload, so v runs the other way).
 */
function clodAt(x: number, z: number, st: ClodStyle): number {
  const u = x / CLOD_TILE, v = 1 - z / CLOD_TILE;
  return clodField(u - Math.floor(u), v - Math.floor(v), st).h;
}

/* ------------------------------------------------------------------ */
/* The bed surface                                                      */
/* ------------------------------------------------------------------ */

/** A flat grid over one sheet tile (x and z from 0 to SHEET_TILE), `segs` squares a side. */
function gridShape(segs: number): THREE.BufferGeometry {
  // Built per yard (not cached): each yard sets its own bounding sphere on it.
  const n = segs + 1;
  // The grid, then a skirt: each rim vertex again, marked to hang SKIRT below (aSkirt), joined to the rim both ways round.
  const rim: number[] = [];
  for (let i = 0; i < segs; i++) rim.push(i);
  for (let j = 0; j < segs; j++) rim.push(j * n + segs);
  for (let i = segs; i > 0; i--) rim.push(segs * n + i);
  for (let j = segs; j > 0; j--) rim.push(j * n);
  const total = n * n + rim.length;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), skirt = new Float32Array(total);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = (i / segs) * SHEET_TILE;
      pos[k * 3 + 2] = (j / segs) * SHEET_TILE;
      nor[k * 3 + 1] = 1;
      uv[k * 2] = i / segs;
      uv[k * 2 + 1] = j / segs;
    }
  }
  rim.forEach((v, r) => {
    const k = n * n + r;
    pos[k * 3] = pos[v * 3];
    pos[k * 3 + 2] = pos[v * 3 + 2];
    nor[k * 3 + 1] = 1;
    uv[k * 2] = uv[v * 2];
    uv[k * 2 + 1] = uv[v * 2 + 1];
    skirt[k] = 1;
  });
  const idx = new (total > 65535 ? Uint32Array : Uint16Array)(segs * segs * 6 + rim.length * 12);
  let o = 0;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  for (let r = 0; r < rim.length; r++) {
    const a = rim[r], b = rim[(r + 1) % rim.length], c = n * n + r, d = n * n + ((r + 1) % rim.length);
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = d; idx[o++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aSkirt', new THREE.BufferAttribute(skirt, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

interface SheetUniforms {
  uBase: { value: THREE.DataTexture };
  uBaseBox: { value: THREE.Vector4 };
  uBaseRef: { value: number };
  uBaseStep: { value: number };
  uFade: { value: THREE.Vector2 };
  /** 0 while the fill's painted maps are still on their way (its relief would show as a flat plate), then 1. */
  uReady: { value: number };
}

/**
 * The sheet's material: the ground's humus maps (map, normal map) at the ground's own world coordinates, with the same
 * dull sheen as the ground; the vertex shader raises it by the base height, the clods and the macro lie, and gives it
 * the base and macro slope as its normal (the clods' shading comes from the normal map, as on the ground). `lod` is the
 * clod texture's mip level: the coarse sheet reads a smoother relief, so its 3 cm steps do not alias.
 */
function sheetMaterial(spec: MaterialSpec, shared: SheetUniforms, lod: number): THREE.MeshPhysicalMaterial {
  const set = materialTextures(spec);
  const m = new THREE.MeshPhysicalMaterial({ map: set.map, normalMap: set.normalMap, roughness: 0.99, metalness: 0, specularIntensity: 0.45 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, {
      // The humus texture's roughness channel holds the clod height (surfaces.ts humusGroundSet).
      uClod: { value: set.roughnessMap },
      uClodScale: { value: 1 / CLOD_TILE },
      uClodMax: { value: CLOD_MAX },
      uLod: { value: lod },
    });
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uClod; uniform sampler2D uBase; uniform vec4 uBaseBox; uniform float uBaseRef; uniform float uBaseStep;
uniform float uClodScale; uniform float uClodMax; uniform vec2 uFade; uniform float uLod; uniform float uReady;
attribute float aSkirt;
// The bed's base texture: r ground height (above uBaseRef), g bed mask, b the fill's larger lie (humus-field macroHeight).
vec4 hS(vec2 xz) { return textureLod(uBase, (xz - uBaseBox.xy) * uBaseBox.zw, 0.0); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 hXZ = (modelMatrix * vec4(position, 1.0)).xz;
vec4 hB = hS(hXZ), hBx = hS(hXZ + vec2(uBaseStep, 0.0)), hBz = hS(hXZ + vec2(0.0, uBaseStep));
float hMask = clamp(hB.g, 0.0, 1.0);
float hBase = hB.r + uBaseRef;
float hK = hMask * (1.0 - smoothstep(uFade.x, uFade.y, distance(vec3(hXZ.x, hBase, hXZ.y), cameraPosition)));
float hY = hBase - ${SINK.toFixed(4)} + (textureLod(uClod, hXZ * uClodScale, uLod).g * uClodMax * uReady + hB.b) * hK - (1.0 - hMask) * 0.03;
// The normal follows the ground and the larger lie; the clods' own shading comes from the normal map, as on the ground.
vec3 objectNormal = normalize(vec3(-(hBx.r - hB.r + (hBx.b - hB.b) * hK), uBaseStep, -(hBz.r - hB.r + (hBz.b - hB.b) * hK)));
#ifdef USE_MAP
  vMapUv = hXZ * uClodScale;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = hXZ * uClodScale;
#endif`,
      )
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, hY - modelMatrix[3][1] - aSkirt * ${SKIRT.toFixed(3)}, position.z);`);
  };
  // The near and the far sheet compile to one program; only the clod mip level differs.
  m.customProgramCacheKey = () => 'humus-sheet-3';
  return m;
}

/* ------------------------------------------------------------------ */
/* Loose clods and shreds                                               */
/* ------------------------------------------------------------------ */

/** A lumpy blob of soil, radius ~0.5: an icosphere welded smooth and pushed in and out at two scales, flatter below. */
function blob(seed: number, detail: number, rough: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const big = vnoise(v.x * 1.6 + seed * 3.1, v.z * 1.6 + v.y * 1.3, 1e6, seed) - 0.5;
    const small = vnoise(v.x * 4.5 + v.y * 2.1 + seed, v.z * 4.5 - v.y * 1.7, 1e6, seed + 5) - 0.5;
    let k = 0.5 * (1 + big * 0.55 * rough + small * 0.32 * rough);
    if (v.y < 0) k *= 1 - 0.3 * -v.y;
    p.setXYZ(i, v.x * k, v.y * k * 0.78, v.z * k);
  }
  return g;
}

/** Vertex colors (`tone`, darker toward the bottom by `ao`) and UVs from above, so pieces merge. */
function finish(g: THREE.BufferGeometry, tone: THREE.Color, ao: number, uvScale: number): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const up = (y - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
    const c = 1 - ao + ao * up ** 0.7;
    col[i * 3] = tone.r * c;
    col[i * 3 + 1] = tone.g * c;
    col[i * 3 + 2] = tone.b * c;
    uv[i * 2] = (x + y * 0.5) * uvScale;
    uv[i * 2 + 1] = (z - y * 0.5) * uvScale;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Normals bent toward straight up: a soft, wrapped light, so a clod's shaded side stays dark brown and its outline reads
 * by its lumps, not by a black shadow side.
 */
function softenNormals(g: THREE.BufferGeometry, k: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    v.y += k;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** Shade a merged shape darker toward its bottom (soft contact shading where it sits in the fill). */
function shadeLow(g: THREE.BufferGeometry, from: number, to: number, dark: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute, c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - from) / (to - from)));
    const k = 1 - dark + dark * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

/** A strand of shredded bark along x (length 1): a flat, tapered ribbon, curled and twisted. */
function strand(seed: number, segs: number): THREE.BufferGeometry {
  const r = rng(`humus-strand${seed}`);
  const pos: number[] = [], idx: number[] = [];
  const bend = (r() - 0.5) * 0.5, curl = 0.25 + r() * 0.5, twist = (r() - 0.5) * 2.4, w0 = 0.07 + r() * 0.06, t0 = 0.025;
  const SIDES = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t - 0.5;
    const cy = Math.sin(t * Math.PI) * bend * 0.3, cz = Math.sin(t * Math.PI * 1.6 + seed) * curl * 0.3;
    const taper = 0.35 + 0.65 * Math.sin(Math.PI * (0.08 + t * 0.84));
    const a = twist * t;
    for (let k = 0; k < SIDES; k++) {
      const ang = (k / SIDES) * Math.PI * 2;
      const lw = Math.cos(ang) * w0 * taper, lt = Math.sin(ang) * t0 * taper;
      pos.push(x, cy + lw * Math.sin(a) + lt * Math.cos(a), cz + lw * Math.cos(a) - lt * Math.sin(a));
    }
    if (i > 0) {
      for (let k = 0; k < SIDES; k++) {
        const a0 = (i - 1) * SIDES + k, a1 = (i - 1) * SIDES + ((k + 1) % SIDES), b0 = i * SIDES + k, b1 = i * SIDES + ((k + 1) % SIDES);
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A loose clod (unit size): a soft lumpy core with eight to twelve crumbs stuck over it, so its outline is broken and its
 * top crumbly; or (far) the core alone. Softly shaded all round (bent normals, gentle contact shading).
 */
function clumpShape(s: number, near: boolean): THREE.BufferGeometry {
  const key = `clod:${s}:${near}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const r = rng(`humus-clump${s}`);
  const core = (): THREE.BufferGeometry => {
    const c = blob(s * 7 + 1, 1, 1.3);
    c.scale(0.86, 0.75, 0.86);
    return finish(c, new THREE.Color(1, 1, 1), 0.15, 1.6);
  };
  let g: THREE.BufferGeometry;
  if (!near) g = core();
  else {
    const parts: THREE.BufferGeometry[] = [core()];
    const n = 8 + Math.floor(r() * 5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      d.set(r() - 0.5, r() * 0.9 - 0.2, r() - 0.5).normalize();
      const sz = 0.26 + r() * 0.28;
      const piece = blob(s * 31 + i * 7, 0, 1.4);
      e.set(r() * 6, r() * 6, r() * 6);
      q.setFromEuler(e);
      m.compose(d.multiply(new THREE.Vector3(0.4, 0.28, 0.4)), q, new THREE.Vector3(sz, sz * (0.7 + r() * 0.4), sz));
      piece.applyMatrix4(m);
      const t = 0.94 + r() * 0.14;
      parts.push(finish(piece, new THREE.Color(t, t, t), 0.1, 1.6));
    }
    g = mergeGeometries(parts)!;
    parts.forEach((x) => x.dispose());
  }
  g.computeBoundingBox();
  shadeLow(g, g.boundingBox!.min.y, g.boundingBox!.max.y * 0.4, 0.22);
  softenNormals(g, 0.9);
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/** A shred of bark, unit length along x. */
function shredShape(): THREE.BufferGeometry {
  const hit = shapeCache.get('shred');
  if (hit) return hit;
  const g = finish(strand(5, 6), new THREE.Color(1, 1, 1), 0.25, 1.2);
  softenNormals(g, 0.6);
  g.computeBoundingSphere();
  shapeCache.set('shred', g);
  return g;
}

/** The pieces' skin, gray to multiply each piece's color: soft grain, a gentle crumbly normal map. */
function skinSet() {
  return textureSet('humusSkin2', () =>
    paint(256, 0.06, 3, (u, v) => {
      const a = vnoise(u * 32, v * 32, 32, 31), b = vnoise(u * 90, v * 90, 90, 32);
      const g = 0.92 + a * 0.06 + b * 0.03;
      return { h: a * 0.6 + b * 0.3, c: [g, g, g], r: 1 };
    }),
  );
}

/** A matte piece material whose pieces shrink away between uFade.x and uFade.y meters from the camera. */
function pieceMaterial(fade: THREE.Vector2, ready: { value: number }): THREE.MeshPhysicalMaterial {
  const set = skinSet();
  // Physical only to turn the sky's reflection down to the ground's: soil has no glint.
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughness: 1, metalness: 0, specularIntensity: 0.3 });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = (s) => {
    s.uniforms.uFade = { value: fade };
    s.uniforms.uReady = ready;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uFade; uniform float uReady;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 hPiece = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // Pieces come in with their fill's relief (uReady) and shrink away with distance.
  transformed *= uReady * (1.0 - smoothstep(uFade.x, uFade.y, distance(hPiece, cameraPosition)));
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'humus-piece-3';
  return m;
}

interface Piece {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  tipX: number;
  tipZ: number;
  color: THREE.Color;
  shape: number;
}

/** One kind of thing in one tile: its near and far meshes (far may be absent) and where they show. */
interface Slot {
  near: THREE.Mesh[];
  far: THREE.Mesh[];
  /** Under this the near look shows (with a dead band either side); past `hideAt` the slot hides. */
  nearTo: number;
  hideAt: number;
  /** -1 not yet set, 0 hidden, 1 near, 2 far. */
  state: number;
}

interface Tile {
  box: THREE.Box3;
  slots: Slot[];
}

export interface HumusBuild {
  object: THREE.Object3D | null;
  /**
   * Show each tile's near or far look, or none, for the camera about to draw, and bring each fill's relief in once its
   * painted maps arrive. True while that is still under way: draw another frame.
   */
  update(cam: THREE.Camera): boolean;
  /** What was built, for the diagnostics readout and tests. */
  counts: { sheetTiles: number; clods: number; shreds: number };
  /** What the last update() left showing (before frustum culling): tiles, loose pieces, triangles, draw calls. */
  shown: { near: number; far: number; pieces: number; triangles: number; draws: number };
  dispose(): void;
}

/** Humus over every bed zone whose material has spec.crumb, where that zone is the top one. */
export function buildHumus(plan: SitePlan, gm: GroundModel, surface: (p: Vec2) => number, quality: Quality): HumusBuild {
  const counts = { sheetTiles: 0, clods: 0, shreds: 0 };
  const shown = { near: 0, far: 0, pieces: 0, triangles: 0, draws: 0 };
  // Draft quality (the slowest devices) keeps the ground's humus texture alone.
  const zones = quality === 'draft' ? [] : plan.zones.filter((z) => materialById.get(z.catalogId)?.crumb);
  if (!zones.length) return { object: null, update: () => false, counts, shown, dispose() {} };
  const reach = quality === 'max' ? 1.25 : quality === 'balanced' ? 1 : 0.65;
  const group = new THREE.Group();
  group.name = 'humus';
  const tiles: Tile[] = [];
  const owned: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  const baseTexes: THREE.DataTexture[] = [];
  // Light quality draws the coarse grid everywhere, and half the loose pieces.
  const nearGeo = NEAR_SEGS[quality] ? gridShape(NEAR_SEGS[quality]) : null, farGeo = gridShape(MID_SEGS[quality]);
  const fewer = quality === 'light' ? 0.5 : 1;
  let spreadMax = 0;
  const fadeC = new THREE.Vector2(CLOD_FADE[0] * reach, CLOD_FADE[1] * reach), fadeS = new THREE.Vector2(SHRED_FADE[0] * reach, SHRED_FADE[1] * reach);
  // Per fill: its relief's readiness (0 until its painted maps arrive) and the loose pieces' materials, which share it.
  const readies: { ready: { value: number }; tex: THREE.Texture }[] = [];
  const pieceMats = new Map<string, { c: THREE.Material; s: THREE.Material }>();
  // One surface per fill (black humus, compost, dirt): its own maps, base height and bed mask.
  for (const id of new Set(zones.map((z) => z.catalogId))) {
    const spec = materialById.get(id)!;
    const mine = zones.filter((z) => z.catalogId === id);
    const tex = materialTextures(spec).roughnessMap;
    // Maps already painted (cached) count as ready at once: only maps still on their way bring the relief in.
    const ready = { value: tex.userData.flat ? 0 : 1 };
    readies.push({ ready, tex });
    const pm = { c: pieceMaterial(fadeC, ready), s: pieceMaterial(fadeS, ready) };
    pieceMats.set(id, pm);
    mats.push(pm.c, pm.s);
    const isFill = (p: Vec2) => {
      const z = gm.zoneAt(p);
      return !!z && z.catalogId === id && mine.includes(z);
    };

    // Base height (the ground mesh's own surface) and the bed mask, over every bed of this fill.
    const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const z of mine) {
      const b = bounds(z.polygon);
      bb.minX = Math.min(bb.minX, b.minX - 0.1);
      bb.minY = Math.min(bb.minY, b.minY - 0.1);
      bb.maxX = Math.max(bb.maxX, b.maxX + 0.1);
      bb.maxY = Math.max(bb.maxY, b.maxY + 0.1);
    }
    const step = Math.max(BASE_STEP, (bb.maxX - bb.minX) / 1024, (bb.maxY - bb.minY) / 1024);
    const W = Math.ceil((bb.maxX - bb.minX) / step), H = Math.ceil((bb.maxY - bb.minY) / step);
    // Ground height, bed mask (softened over a texel at the edge) and the larger lie, per texel; kept in floats here
    // for placing tiles, sent as half floats (linear filtering everywhere) relative to the lowest point.
    const inside = new Uint8Array(W * H), hgt = new Float32Array(W * H);
    const p: Vec2 = [0, 0];
    let ref = Infinity;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        p[0] = bb.minX + (i + 0.5) * step;
        p[1] = bb.minY + (j + 0.5) * step;
        inside[j * W + i] = isFill(p) ? 1 : 0;
        hgt[j * W + i] = surface(p);
        ref = Math.min(ref, hgt[j * W + i]);
      }
    }
    const at = (i: number, j: number) => inside[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
    const mask = new Float32Array(W * H);
    const half = new Uint16Array(W * H * 4);
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        mask[k] = inside[k] ? (2 + at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1)) / 6 : 0;
        half[k * 4] = toHalf(hgt[k] - ref);
        half[k * 4 + 1] = toHalf(mask[k]);
        half[k * 4 + 2] = toHalf(macroHeight(bb.minX + (i + 0.5) * step, bb.minY + (j + 0.5) * step));
        half[k * 4 + 3] = 0;
      }
    }
    const baseTex = new THREE.DataTexture(half, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    baseTex.minFilter = baseTex.magFilter = THREE.LinearFilter;
    baseTex.wrapS = baseTex.wrapT = THREE.ClampToEdgeWrapping;
    baseTex.needsUpdate = true;
    baseTexes.push(baseTex);
    const shared: SheetUniforms = {
      uBase: { value: baseTex },
      uBaseBox: { value: new THREE.Vector4(bb.minX, bb.minY, 1 / (W * step), 1 / (H * step)) },
      uBaseRef: { value: ref },
      uBaseStep: { value: step },
      uFade: { value: new THREE.Vector2(SHEET_FADE[0] * reach, SHEET_FADE[1] * reach) },
      uReady: ready,
    };
    const sheetNear = sheetMaterial(spec, shared, 0), sheetFar = sheetMaterial(spec, shared, 1.6);
    mats.push(sheetNear, sheetFar);

    // Sheet tiles: 2 m squares wherever a bed of this fill is.
    const per = Math.ceil(SHEET_TILE / step);
    for (let tz = bb.minY; tz < bb.maxY; tz += SHEET_TILE) {
      for (let tx = bb.minX; tx < bb.maxX; tx += SHEET_TILE) {
        let lo = Infinity, hi = -Infinity, any = false;
        const i0 = Math.floor((tx - bb.minX) / step), j0 = Math.floor((tz - bb.minY) / step);
        for (let j = j0; j < Math.min(H, j0 + per + 1); j++) {
          for (let i = i0; i < Math.min(W, i0 + per + 1); i++) {
            const o = j * W + i;
            if (mask[o] > 0) any = true;
            lo = Math.min(lo, hgt[o]);
            hi = Math.max(hi, hgt[o]);
          }
        }
        if (!any) continue;
        spreadMax = Math.max(spreadMax, (hi - lo) / 2);
        const mid = (lo + hi) / 2;
        const make = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
          const mesh = new THREE.Mesh(geo, mat);
          mesh.userData.tris = geo.index!.count / 3;
          mesh.position.set(tx, mid, tz);
          mesh.receiveShadow = true;
          mesh.castShadow = false;
          mesh.name = `humus-${spec.id}`;
          // Shown at first so the yard's warm-up compiles the program; update() sets the real state before the first draw.
          group.add(mesh);
          owned.push(mesh);
          return mesh;
        };
        tiles.push({
          box: new THREE.Box3(new THREE.Vector3(tx, lo - 0.05, tz), new THREE.Vector3(tx + SHEET_TILE, hi + CLOD_MAX + 0.08, tz + SHEET_TILE)),
          slots: [nearGeo
            ? { near: [make(nearGeo, sheetNear)], far: [make(farGeo, sheetFar)], nearTo: SHEET_NEAR * reach, hideAt: shared.uFade.value.y, state: -1 }
            : { near: [make(farGeo, sheetFar)], far: [], nearTo: 0, hideAt: shared.uFade.value.y, state: -1 }],
        });
        counts.sheetTiles++;
      }
    }
  }
  // The tiles share this yard's two grids (and so one bounding sphere each, set to hold the tallest tile's relief).
  for (const g of nearGeo ? [nearGeo, farGeo] : [farGeo]) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(SHEET_TILE / 2, 0, SHEET_TILE / 2), Math.hypot(SHEET_TILE / 2, SHEET_TILE / 2, spreadMax + CLOD_MAX + 0.1));

  // Loose clods and shreds, instanced in 3 m tiles (two clod shapes and the shreds: at most three draws a tile).
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), eu = new THREE.Euler();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Piece[], name: string, share?: THREE.InstancedMesh) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    if (share) {
      im.instanceMatrix = share.instanceMatrix;
      im.instanceColor = share.instanceColor;
    } else {
      list.forEach((s, i) => {
        eu.set(s.tipX, s.yaw, s.tipZ, 'YXZ');
        q.setFromEuler(eu);
        m4.compose(t.set(s.x, s.y, s.z), q, sc.set(s.sx, s.sy, s.sz));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, s.color);
      });
    }
    im.name = name;
    im.castShadow = false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.userData.tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    im.userData.pieces = list.length;
    group.add(im);
    owned.push(im);
    return im;
  };
  for (const z of zones) {
    const zs = materialById.get(z.catalogId)!;
    const pieces = placePieces(z, gm, surface, zs.crumb!, fewer);
    const { c: matC, s: matS } = pieceMats.get(zs.id)!;
    counts.clods += pieces.clods.length;
    counts.shreds += pieces.shreds.length;
    const byTile = new Map<string, { box: THREE.Box3; c: Piece[]; s: Piece[] }>();
    const into = (list: Piece[], k: 'c' | 's') => {
      for (const s of list) {
        const key = `${Math.floor(s.x / PIECE_TILE)},${Math.floor(s.z / PIECE_TILE)}`;
        let b = byTile.get(key);
        if (!b) byTile.set(key, (b = { box: new THREE.Box3(), c: [], s: [] }));
        b[k].push(s);
        b.box.expandByPoint(t.set(s.x, s.y, s.z));
      }
    };
    into(pieces.clods, 'c');
    into(pieces.shreds, 's');
    const name = `humus-${zs.id}`;
    for (const b of byTile.values()) {
      b.box.expandByScalar(0.08);
      const slots: Slot[] = [];
      if (b.c.length) {
        const near: THREE.Mesh[] = [], far: THREE.Mesh[] = [];
        for (let v = 0; v < CLUMP_SHAPES; v++) {
          const mine = b.c.filter((s) => s.shape === v);
          if (!mine.length) continue;
          const a = instanced(clumpShape(v + 1, true), matC, mine, name);
          near.push(a);
          // The far look draws the same clods: it shares their places and colors.
          far.push(instanced(clumpShape(v + 1, false), matC, mine, name, a));
        }
        slots.push({ near, far, nearTo: CLOD_NEAR * reach, hideAt: fadeC.y, state: -1 });
      }
      if (b.s.length) slots.push({ near: [instanced(shredShape(), matS, b.s, name)], far: [], nearTo: fadeS.y, hideAt: fadeS.y, state: -1 });
      tiles.push({ box: b.box, slots });
    }
  }

  const at = new THREE.Vector3();
  let last = performance.now();
  return {
    object: group,
    counts,
    shown,
    update(cam) {
      cam.getWorldPosition(at);
      let changed = false;
      for (const tile of tiles) {
        const d = tile.box.distanceToPoint(at);
        for (const s of tile.slots) {
          // A dead band of 6% either side of each switch: a camera resting on one never flips the tile back and forth.
          let st: number;
          if (d > s.hideAt * (s.state === 0 ? 0.97 : 1.03)) st = 0;
          else if (!s.far.length) st = 1;
          else st = d < s.nearTo * (s.state === 1 ? 1.06 : 0.94) ? 1 : 2;
          if (st === s.state) continue;
          s.state = st;
          changed = true;
          for (const m of s.near) m.visible = st === 1;
          for (const m of s.far) m.visible = st === 2;
        }
      }
      if (changed) {
        shown.near = shown.far = shown.pieces = shown.triangles = shown.draws = 0;
        for (const o of group.children) {
          if (!o.visible) continue;
          const im = o as THREE.InstancedMesh;
          shown.draws++;
          shown.triangles += im.isInstancedMesh ? im.userData.tris * im.count : o.userData.tris;
          if (im.isInstancedMesh) shown.pieces += im.userData.pieces;
          else if ((o as THREE.Mesh).geometry === nearGeo) shown.near++;
          else shown.far++;
        }
      }
      // A fill whose painted maps have just arrived brings its relief and pieces in over READY_RAMP seconds, together.
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let pending = false;
      for (const r of readies) {
        if (r.ready.value >= 1 || r.tex.userData.flat) continue;
        r.ready.value = Math.min(1, r.ready.value + dt / READY_RAMP);
        pending = true;
      }
      return pending;
    },
    dispose() {
      owned.forEach((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
      mats.forEach((m) => m.dispose());
      baseTexes.forEach((t) => t.dispose());
      nearGeo?.dispose();
      farGeo.dispose();
    },
  };
}

/**
 * The loose pieces of one bed, each set on the bed surface exactly as the GPU raises it (base, clods and macro lie), kept
 * inside the bed: soft clods of 2-6 cm, a few per square foot, and short shreds of bark, mostly dark, partly buried.
 */
function placePieces(z: Zone, gm: GroundModel, surface: (p: Vec2) => number, C: CrumbSpec, fewer: number) {
  const r = rng(`humus:${z.id}`);
  const b = bounds(z.polygon);
  const inside = (x: number, y: number, pad: number) =>
    gm.zoneAt([x, y]) === z && gm.zoneAt([x + pad, y]) === z && gm.zoneAt([x - pad, y]) === z && gm.zoneAt([x, y + pad]) === z && gm.zoneAt([x, y - pad]) === z;
  const top = (x: number, y: number) => surface([x, y]) - SINK + clodAt(x, y, C.style) + macroHeight(x, y);
  const soil = C.soil.map((x) => new THREE.Color(x.c));
  const cum: number[] = [];
  C.soil.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
  const soilOf = (h: number) => soil[Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v))];
  const fiber = C.fiber.map((h) => new THREE.Color(h));
  const mean = new THREE.Color(C.mean);
  const damp = (x: number, y: number) => 0.9 + 0.2 * vnoise(x * 1.7, y * 1.7, 1e6, 77);
  const area = Math.abs(z.polygon.reduce((s, p, i) => {
    const q = z.polygon[(i + 1) % z.polygon.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
  const clods: Piece[] = [], shreds: Piece[] = [];
  const nClods = Math.round(area * C.loose.clods * fewer), nShreds = Math.round(area * C.loose.shreds * fewer);
  for (let i = 0; i < nClods * 3 && clods.length < nClods; i++) {
    const px = b.minX + r() * (b.maxX - b.minX), py = b.minY + r() * (b.maxY - b.minY);
    const u = r() * r();
    const w = (0.8 + u * 1.6) * IN;
    if (!inside(px, py, w * 0.6)) continue;
    const h = w * (0.5 + r() * 0.25);
    clods.push({
      x: px, y: top(px, py) - h * (0.2 + r() * 0.2), z: py,
      sx: w, sy: h, sz: w * (0.7 + r() * 0.3),
      yaw: r() * Math.PI * 2, tipX: (r() - 0.5) * 0.35, tipZ: (r() - 0.5) * 0.35,
      // The bed's own average tone (the surface's texture is matched to it), a touch lighter on a loose clod's dry top.
      color: mean.clone().lerp(soilOf(r()), 0.25).multiplyScalar(damp(px, py) * (1.0 + r() * 0.15)), shape: Math.floor(r() * CLUMP_SHAPES),
    });
  }
  for (let i = 0; i < nShreds * 3 && shreds.length < nShreds; i++) {
    const px = b.minX + r() * (b.maxX - b.minX), py = b.minY + r() * (b.maxY - b.minY);
    const len = (C.loose.shredIn[0] + r() * r() * (C.loose.shredIn[1] - C.loose.shredIn[0])) * IN;
    if (!inside(px, py, len * 0.55)) continue;
    // Dark, damp bark; some lighter, drier fiber (see style.lightFibers).
    const base = r() < 0.1 + C.style.lightFibers * 0.6 ? fiber[1 + Math.floor(r() * 2)] : fiber[0];
    const wid = len * (0.45 + r() * 0.35);
    shreds.push({
      x: px, y: top(px, py) - wid * 0.12, z: py,
      sx: len, sy: wid * 0.6, sz: wid * 0.55,
      yaw: r() * Math.PI * 2, tipX: (r() - 0.5) * 0.4, tipZ: (r() - 0.5) * 0.3,
      color: base.clone().multiplyScalar(0.9 + r() * 0.2), shape: 0,
    });
  }
  return { clods, shreds };
}
