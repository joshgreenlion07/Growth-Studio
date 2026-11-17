import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type CrumbSpec } from '../siteplan/catalog';
import { bounds, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2, Zone } from '../siteplan/types';
import { vnoise } from '../engine/noise';
import { paint, textureSet } from '../engine/textures';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

/**
 * Beds of black humus (a material with spec.crumb), drawn as loose soil: crumbs, soft clumps and compost fibers in 3D
 * over the ground's matching humus texture (surfaces.ts), which carries the fines between them and the whole bed from
 * farther off.
 *
 * Three kinds of piece, each instanced in 1.5 m tiles:
 * - Crumb patches: a hand's width of 2-7 mm crumbs, a few pale specks and short fibers, merged into one shape (as lawn
 *   tufts are), laid about every 11 cm turned at random. Drawn only near the camera, where single crumbs show.
 * - Clumps: soft aggregates 1-3.5 cm across, each several lumpy blobs stuck together, crumbly and irregular, sunk into
 *   the fill. A single lumpy blob stands in for one farther off.
 * - Shreds: strands of shredded bark, wood and plant fiber, 1.5-5 cm, bent and twisted, mostly dark, some lighter brown.
 *
 * Every piece shrinks to nothing over the last stretch before its kind stops drawing (in the vertex shader, by its own
 * distance), so pieces sink into the texture rather than pop; a tile is hidden only once all of it is past that point,
 * and its near and far looks switch with a dead band so a still camera never flickers between them.
 */

const TILE = 1.5;
const PIECE_LIFT = 1.15;
const IN = 0.0254;
const PATCH_VARIANTS = 3;
const CLUMP_SHAPES = 4;
const shapeCache = new Map<string, THREE.BufferGeometry>();

type Pick = (h: number) => THREE.Color;

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

/** Vertex attributes every piece shares (so pieces merge): color shaded darker toward the bottom, UVs from above. */
function finish(g: THREE.BufferGeometry, tone: THREE.Color, ao: number, uvScale: number): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const up = (y - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
    const c = (1 - ao) + ao * up ** 0.7;
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

/** A strand of shredded bark or fiber along x (length 1): a flat, tapered ribbon, bent and twisted. */
function strand(seed: number, segs: number): THREE.BufferGeometry {
  const r = rng(`humus-strand${seed}`);
  const pos: number[] = [], idx: number[] = [];
  const bend = (r() - 0.5) * 0.35, curl = (r() - 0.5) * 0.4, twist = (r() - 0.5) * 2.2, w0 = 0.06 + r() * 0.05, t0 = 0.022;
  const SIDES = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t - 0.5;
    const cy = Math.sin(t * Math.PI) * bend * 0.3, cz = Math.sin(t * Math.PI * 1.3 + seed) * curl * 0.3;
    const taper = 0.35 + 0.65 * Math.sin(Math.PI * (0.08 + t * 0.84));
    const a = twist * t;
    for (let k = 0; k < SIDES; k++) {
      // A flattened diamond cross-section: wide across, thin up and down.
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

/** Flat-shaded copy (facets read as broken, crumbly soil rather than polished stone). */
function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const f = g.toNonIndexed();
  g.dispose();
  f.computeVertexNormals();
  return f;
}

/** Darken everything toward the bottom of a merged shape: shade in the gaps between crumbs and under them. */
function shadeLow(g: THREE.BufferGeometry, from: number, to: number, dark: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute, c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - from) / (to - from)));
    const k = 1 - dark + dark * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

/**
 * A soft clump (unit size): a lumpy core with nine to thirteen crumbs stuck over it, so its outline is broken and its
 * top granular, darker down where it sits in the fill; or (far) the lumpy core alone.
 */
function clumpShape(s: number, near: boolean): THREE.BufferGeometry {
  const key = `clump:${s}:${near}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const r = rng(`humus-clump${s}`);
  const core = (detail: number): THREE.BufferGeometry => {
    const c = blob(s * 7 + 1, detail, 1.2);
    c.scale(0.86, 0.8, 0.86);
    return facet(finish(c, new THREE.Color(1, 1, 1), 0.3, 1.6));
  };
  let g: THREE.BufferGeometry;
  if (!near) g = core(0);
  else {
    const parts: THREE.BufferGeometry[] = [core(1)];
    const n = 9 + Math.floor(r() * 5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // On the core's skin, more on top than below.
      d.set(r() - 0.5, r() * 0.9 - 0.25, r() - 0.5).normalize();
      const sz = 0.24 + r() * 0.28;
      const piece = blob(s * 31 + i * 7, 0, 1.4);
      e.set(r() * 6, r() * 6, r() * 6);
      q.setFromEuler(e);
      m.compose(d.multiply(new THREE.Vector3(0.4, 0.3, 0.4)), q, new THREE.Vector3(sz, sz * (0.7 + r() * 0.4), sz));
      piece.applyMatrix4(m);
      const t = 0.92 + r() * 0.26;
      parts.push(facet(finish(piece, new THREE.Color(t, t, t), 0.25, 1.6)));
    }
    g = mergeGeometries(parts)!;
    parts.forEach((x) => x.dispose());
  }
  g.computeBoundingBox();
  shadeLow(g, g.boundingBox!.min.y, g.boundingBox!.max.y * 0.5, 0.25);
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/** A shred of bark or fiber, unit length along x. */
function shredShape(): THREE.BufferGeometry {
  const hit = shapeCache.get('shred');
  if (hit) return hit;
  const g = finish(strand(3, 6), new THREE.Color(1, 1, 1), 0.35, 1.2);
  g.computeBoundingSphere();
  shapeCache.set('shred', g);
  return g;
}

/**
 * A crumb patch, about 12 cm square, in its bed's colors: crumbs of 2-7 mm (more small than large) in the soil tones,
 * most of them clustered in little aggregates, some loose; a few pale specks and short fiber bits. Crumbs sit a third to
 * a half sunk, and the low ones are shaded, so the gaps read dark. Colors are albedo (linear); the instance color only
 * shades a patch lighter or darker (drier or damper).
 */
function patchShape(key: string, v: number, soilOf: Pick, fiber: THREE.Color[], speck: THREE.Color[]): THREE.BufferGeometry {
  const ck = `patch:${key}:${v}`;
  const hit = shapeCache.get(ck);
  if (hit) return hit;
  const r = rng(`humus-patch${v}`);
  const crumbs = Array.from({ length: 8 }, (_, i) => blob(100 + i * 13 + v, 0, 1.4));
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), t = new THREE.Vector3(), sc = new THREE.Vector3();
  const put = (g: THREE.BufferGeometry, col: THREE.Color, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number, ao: number) => {
    e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
    q.setFromEuler(e);
    m.compose(t.set(x, y, z), q, sc.set(sx, sy, sz));
    g.applyMatrix4(m);
    parts.push(facet(finish(g, col, ao, 160)));
  };
  const crumb = (x: number, z: number, size: number, lift: number) => {
    const col = soilOf(r()).clone().multiplyScalar(0.85 + r() * 0.3);
    const sink = 0.3 + r() * 0.25;
    put(crumbs[Math.floor(r() * crumbs.length)].clone(), col, x, size * 0.39 * (1 - sink * 1.6) + lift, z, size, size * (0.75 + r() * 0.4), size * (0.85 + r() * 0.3), 1.2, 0.35);
  };
  // Aggregates: three to nine crumbs heaped round a point.
  for (let k = 0; k < 9; k++) {
    const cx = (r() - 0.5) * 0.11, cz = (r() - 0.5) * 0.11, rad = 0.004 + r() * 0.007, n = 3 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      crumb(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.003 + r() * r() * 0.005, (1 - d / rad) * 0.004);
    }
  }
  // Loose crumbs.
  for (let i = 0; i < 18; i++) crumb((r() - 0.5) * 0.12, (r() - 0.5) * 0.12, 0.002 + r() * r() * 0.005, 0);
  // Pale specks (perlite, sand) and short fiber bits.
  for (let i = 0; i < 2; i++) {
    if (r() < 0.7) continue;
    const size = 0.0015 + r() * 0.002;
    put(crumbs[Math.floor(r() * crumbs.length)].clone(), speck[Math.floor(r() * speck.length)], (r() - 0.5) * 0.12, size * 0.1, (r() - 0.5) * 0.12, size, size, size, 1, 0.3);
  }
  for (let i = 0; i < 3; i++) {
    const size = 0.006 + r() * 0.012;
    put(strand(20 + i + v * 50, 3), fiber[Math.floor(r() * fiber.length)], (r() - 0.5) * 0.12, size * 0.01, (r() - 0.5) * 0.12, size, size, size, 0.4, 0.3);
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((x) => x.dispose());
  crumbs.forEach((x) => x.dispose());
  shadeLow(g, -0.001, 0.004, 0.45);
  g.computeBoundingSphere();
  shapeCache.set(ck, g);
  return g;
}

/**
 * The humus skin, in gray to multiply each piece's color: fine granular grain with pores, a crumbly normal map, matte
 * (soil reflects almost nothing).
 */
function skinSet() {
  return textureSet('humusSkin1', () =>
    paint(256, 0.06, 6, (u, v) => {
      const a = vnoise(u * 64, v * 64, 64, 31), b = vnoise(u * 150, v * 150, 150, 32), pore = vnoise(u * 40, v * 40, 40, 33);
      const hole = pore > 0.8 ? (pore - 0.8) * 5 : 0;
      const g = Math.min(1, 0.9 + a * 0.08 + b * 0.05 - hole * 0.2);
      return { h: a * 0.5 + b * 0.35 - hole * 0.6, c: [g, g, g], r: 1 };
    }),
  );
}

/** A matte piece material whose pieces shrink away between uFade.x and uFade.y meters from the camera. */
function pieceMaterial(fade: THREE.Vector2): THREE.MeshPhysicalMaterial {
  const set = skinSet();
  // Physical only to turn the sky's reflection down (soil hardly reflects; the facets would otherwise catch a gray sheen).
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughness: 1, metalness: 0, specularIntensity: 0.25 });
  m.normalScale.set(0.9, 0.9);
  m.onBeforeCompile = (s) => {
    s.uniforms.uFade = { value: fade };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uFade;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 hPiece = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  transformed *= 1.0 - smoothstep(uFade.x, uFade.y, distance(hPiece, cameraPosition));
#endif`,
      );
  };
  // Every humus material compiles to one program; only the fade distances differ.
  m.customProgramCacheKey = () => 'humus-piece-1';
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
  /** The ground's slope under the piece (dh/dx, dh/dz): it is laid along the surface. */
  gx: number;
  gz: number;
  color: THREE.Color;
  shape: number;
}

/** One kind of piece in one tile: its meshes near and far (far may be absent) and where they show. */
interface Slot {
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  /** Under this the near look shows (with a dead band either side); past `hideAt` the slot hides. */
  nearTo: number;
  hideAt: number;
  /** 0 hidden, 1 near, 2 far. */
  state: number;
}

interface Tile {
  box: THREE.Box3;
  slots: Slot[];
}

export interface HumusBuild {
  object: THREE.Object3D | null;
  /** Show each tile's near or far pieces, or none, for the camera about to draw. */
  update(cam: THREE.Camera): void;
  /** Instances built, by kind, for the diagnostics readout and tests. */
  counts: { patches: number; clumps: number; shreds: number };
  dispose(): void;
}

/** Reach of each kind (meters, balanced quality) before it starts to shrink away, and where it is gone. */
const PATCH_FADE: [number, number] = [1.6, 2.2];
const CLUMP_NEAR = 2.6;
const CLUMP_FADE: [number, number] = [6, 8];
const SHRED_FADE: [number, number] = [4, 5.5];

/** Humus over every bed zone whose material has spec.crumb, where that zone is the top one. */
export function buildHumus(plan: SitePlan, gm: GroundModel, surface: (p: Vec2) => number, quality: Quality): HumusBuild {
  const counts = { patches: 0, clumps: 0, shreds: 0 };
  // Draft quality (the slowest devices) keeps the ground's humus texture alone.
  const zones = quality === 'draft' ? [] : plan.zones.filter((z) => materialById.get(z.catalogId)?.crumb);
  if (!zones.length) return { object: null, update() {}, counts, dispose() {} };
  const reach = quality === 'max' ? 1.25 : quality === 'balanced' ? 1 : 0.65;
  const fadeP = new THREE.Vector2(PATCH_FADE[0] * reach, PATCH_FADE[1] * reach);
  const fadeC = new THREE.Vector2(CLUMP_FADE[0] * reach, CLUMP_FADE[1] * reach);
  const fadeS = new THREE.Vector2(SHRED_FADE[0] * reach, SHRED_FADE[1] * reach);
  const matP = pieceMaterial(fadeP), matC = pieceMaterial(fadeC), matS = pieceMaterial(fadeS);
  const group = new THREE.Group();
  group.name = 'humus';
  const tiles: Tile[] = [];
  const owned: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), e = new THREE.Euler();
  const qa = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();

  const meshes = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Piece[], name: string, share?: THREE.InstancedMesh): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    if (share) {
      im.instanceMatrix = share.instanceMatrix;
      im.instanceColor = share.instanceColor;
    } else {
      list.forEach((s, i) => {
        e.set(s.tipX, s.yaw, s.tipZ, 'YXZ');
        q.setFromEuler(e);
        qa.setFromUnitVectors(up, n.set(-s.gx, 1, -s.gz).normalize());
        q.premultiply(qa);
        sc.set(s.sx, s.sy, s.sz);
        t.set(s.x, s.y, s.z);
        m.compose(t, q, sc);
        im.setMatrixAt(i, m);
        im.setColorAt(i, s.color);
      });
    }
    im.name = name;
    im.castShadow = false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    // Shown at first so the yard's warm-up compiles the program; update() sets the real state before the first draw.
    im.visible = true;
    group.add(im);
    owned.push(im);
    return im;
  };

  for (const z of zones) {
    const spec = materialById.get(z.catalogId)!;
    const C = spec.crumb!;
    const lin = (h: string) => new THREE.Color(h);
    // Pieces show their shaded sides and undersides as well as their tops: a touch lighter than the flat ground's
    // albedo, so a bed of them averages to the same tone.
    const soil = C.soil.map((x) => lin(x.c).multiplyScalar(PIECE_LIFT));
    const cum: number[] = [];
    C.soil.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
    const soilOf: Pick = (h) => soil[Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v))];
    const fiber = C.fiber.map(lin), speck = C.speck.map(lin);
    const pieces = placePieces(z, gm, surface, C, soilOf, fiber);
    counts.patches += pieces.patches.length;
    counts.clumps += pieces.clumps.length;
    counts.shreds += pieces.shreds.length;
    const byTile = new Map<string, { box: THREE.Box3; p: Piece[]; c: Piece[]; s: Piece[] }>();
    const into = (list: Piece[], k: 'p' | 'c' | 's') => {
      for (const s of list) {
        const key = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
        let b = byTile.get(key);
        if (!b) byTile.set(key, (b = { box: new THREE.Box3(), p: [], c: [], s: [] }));
        b[k].push(s);
        b.box.expandByPoint(t.set(s.x, s.y, s.z));
      }
    };
    into(pieces.patches, 'p');
    into(pieces.clumps, 'c');
    into(pieces.shreds, 's');
    const name = `humus-${spec.id}`;
    for (const b of byTile.values()) {
      b.box.expandByScalar(0.08);
      const slots: Slot[] = [];
      if (b.p.length) {
        const near: THREE.InstancedMesh[] = [];
        for (let v = 0; v < PATCH_VARIANTS; v++) {
          const mine = b.p.filter((s) => s.shape === v);
          if (mine.length) near.push(meshes(patchShape(spec.id, v, soilOf, fiber, speck), matP, mine, name));
        }
        slots.push({ near, far: [], nearTo: fadeP.y, hideAt: fadeP.y, state: -1 });
      }
      if (b.c.length) {
        const near: THREE.InstancedMesh[] = [], far: THREE.InstancedMesh[] = [];
        for (let v = 0; v < CLUMP_SHAPES; v++) {
          const mine = b.c.filter((s) => s.shape === v);
          if (!mine.length) continue;
          const a = meshes(clumpShape(v + 1, true), matC, mine, name);
          near.push(a);
          // The far look draws the same clumps: it shares their places and colors.
          far.push(meshes(clumpShape(v + 1, false), matC, mine, name, a));
        }
        slots.push({ near, far, nearTo: CLUMP_NEAR * reach, hideAt: fadeC.y, state: -1 });
      }
      if (b.s.length) slots.push({ near: [meshes(shredShape(), matS, b.s, name)], far: [], nearTo: fadeS.y, hideAt: fadeS.y, state: -1 });
      tiles.push({ box: b.box, slots });
    }
  }

  const at = new THREE.Vector3();
  return {
    object: group,
    counts,
    update(cam) {
      cam.getWorldPosition(at);
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
          for (const im of s.near) im.visible = st === 1;
          for (const im of s.far) im.visible = st === 2;
        }
      }
    },
    dispose() {
      owned.forEach((x) => x.dispose());
      matP.dispose();
      matC.dispose();
      matS.dispose();
    },
  };
}

/**
 * The pieces of one bed: crumb patches on a jittered 11.5 cm grid, clumps and shreds scattered at random, each set on the
 * ground mesh's own surface (so nothing floats where the mesh cuts across a rake lump), kept inside the bed. Damp and dry
 * patches drift across the bed (a slow noise shades patches and clumps alike).
 */
function placePieces(z: Zone, gm: GroundModel, surface: (p: Vec2) => number, C: CrumbSpec, soilOf: Pick, fiber: THREE.Color[]) {
  const r = rng(`humus:${z.id}`);
  const b = bounds(z.polygon);
  const inside = (x: number, y: number, pad: number) =>
    gm.zoneAt([x, y]) === z && gm.zoneAt([x + pad, y]) === z && gm.zoneAt([x - pad, y]) === z && gm.zoneAt([x, y + pad]) === z && gm.zoneAt([x, y - pad]) === z;
  const slope = (x: number, y: number): [number, number] => {
    const e = 0.04;
    return [(surface([x + e, y]) - surface([x - e, y])) / (2 * e), (surface([x, y + e]) - surface([x, y - e])) / (2 * e)];
  };
  const damp = (x: number, y: number) => 0.84 + 0.32 * vnoise(x * 1.7, y * 1.7, 1e6, 77);
  const patches: Piece[] = [], clumps: Piece[] = [], shreds: Piece[] = [];
  const step = 0.115;
  for (let y = b.minY; y < b.maxY; y += step) {
    for (let x = b.minX; x < b.maxX; x += step) {
      const px = x + r() * step, py = y + r() * step;
      if (!inside(px, py, 0.05)) continue;
      const k = damp(px, py) * (0.92 + r() * 0.16);
      const [gx, gz] = slope(px, py);
      patches.push({ x: px, y: surface([px, py]) - 0.0012, z: py, sx: 1, sy: 1, sz: 1, yaw: r() * Math.PI * 2, tipX: 0, tipZ: 0, gx, gz, color: new THREE.Color(k, k, k), shape: Math.floor(r() * PATCH_VARIANTS) });
    }
  }
  const area = Math.abs(z.polygon.reduce((s, p, i) => {
    const q = z.polygon[(i + 1) % z.polygon.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
  const nClumps = Math.round(area * 220), nShreds = Math.round(area * 22);
  for (let i = 0; i < nClumps * 3 && clumps.length < nClumps; i++) {
    const px = b.minX + r() * (b.maxX - b.minX), py = b.minY + r() * (b.maxY - b.minY);
    // Mostly small: 1 to 3.5 cm across.
    const u = r() * r();
    const w = (0.45 + u * 1.35) * IN;
    if (!inside(px, py, w * 0.6)) continue;
    // Clumps' tops face the sun squarely: kept at the fill's own tone, or they read as pale stones.
    const c = soilOf(r()).clone().multiplyScalar(damp(px, py) * (0.8 + r() * 0.2));
    const h = w * (0.55 + r() * 0.25);
    const [gx, gz] = slope(px, py);
    clumps.push({
      gx, gz,
      x: px, y: surface([px, py]) - h * (0.08 + r() * 0.22), z: py,
      sx: w, sy: h, sz: w * (0.7 + r() * 0.3),
      yaw: r() * Math.PI * 2, tipX: (r() - 0.5) * 0.35, tipZ: (r() - 0.5) * 0.35, color: c, shape: Math.floor(r() * CLUMP_SHAPES),
    });
  }
  for (let i = 0; i < nShreds * 3 && shreds.length < nShreds; i++) {
    const px = b.minX + r() * (b.maxX - b.minX), py = b.minY + r() * (b.maxY - b.minY);
    const len = (0.6 + r() * r() * 1.4) * IN;
    if (!inside(px, py, len * 0.55)) continue;
    // Most strands are dark, wet bark; about one in seven a lighter, drier fiber.
    const light = r() < 0.15;
    const base = light ? fiber[1 + Math.floor(r() * 2)] : r() < 0.5 ? fiber[3] : fiber[0];
    const c = base.clone().multiplyScalar(0.85 + r() * 0.3);
    const wid = len * (0.5 + r() * 0.5);
    const [gx, gz] = slope(px, py);
    shreds.push({
      gx, gz,
      x: px, y: surface([px, py]) + 0.0005, z: py,
      sx: len, sy: wid * 0.6, sz: wid * 0.55,
      yaw: r() * Math.PI * 2, tipX: (r() - 0.5) * 0.3, tipZ: (r() - 0.5) * 0.25, color: c, shape: 0,
    });
  }
  return { patches, clumps, shreds };
}
