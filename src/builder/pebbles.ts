import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type MaterialSpec } from '../siteplan/catalog';
import { bounds, pointInPolygon, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { vnoise } from '../engine/noise';
import { rockAlbedo } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

/**
 * Beds of loose stone or chips (a material with spec.pebble: Mexican beach pebble, crushed gravel, bark and wood chips),
 * drawn piece by piece. `pebble.form` picks the pieces: smooth beach pebbles, angular crushed stone, or flat wood chips.
 *
 * Every stone is one of a few smooth, slightly lopsided ovals, scaled to its own length, width and thickness from the
 * size range it is sold in, turned at random and tipped a little, and set in partly, so the bed reads as stones piled two
 * or three deep. Stones are grouped in 1.5 m tiles. Each frame (update) a tile shows its detailed stones close up, the
 * plainer shapes farther off, and nothing past the distance where its stones are only a pixel or two: there the
 * ground's own pebble texture (surfaces.ts) carries the bed, as it does in the gaps between stones.
 */

/** Stone shapes: icosphere detail for the near and the far look. */
const SHAPES = 6;
const TILE = 1.5;
const shapeCache = new Map<string, THREE.BufferGeometry>();

/**
 * A unit pebble (long side 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: an icosphere welded
 * into one smooth surface (so the shading has no facets) and pushed toward a rounded box, which after the stone's own
 * thinner scale gives the flat top, flatter bottom and full, rounded rim of a wave-worn beach pebble; a little egg-shaped
 * and lopsided, with the faintest dents. UVs are projected from above (no seam). Vertex color darkens toward the bottom,
 * where stones touch and shade each other, with very soft mottling.
 */
function pebbleShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`pebble${s}`);
  const egg = 0.04 + r() * 0.12, lop = (r() - 0.5) * 0.12, flatBottom = 0.12 + r() * 0.22, box = 2.2 + r() * 0.8;
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Onto a superellipsoid (exponent `box`): fuller where the rim turns, flatter across the faces.
    const sup = (Math.abs(v.x) ** box + Math.abs(v.y) ** box + Math.abs(v.z) ** box) ** (-1 / box);
    const k = sup * (1 + egg * v.x + lop * v.z * v.x + (vnoise(v.x * 2 + s * 7, v.z * 2 + v.y * 1.7, 1e6, s) - 0.5) * 0.035);
    let y = v.y * k;
    if (y < 0) y *= 1 - flatBottom;
    const x = v.x * 0.5 * k, z = v.z * 0.5 * k;
    y *= 0.5;
    p.setXYZ(i, x, y, z);
    uv[i * 2] = (x + y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (z + y * 0.7) * 1.4 + s * 0.17;
    const mott = vnoise(v.x * 3 + s, v.y * 3 + v.z * 2.5, 1e6, s + 3);
    const ao = 0.48 + 0.52 * Math.min(1, Math.max(0, (v.y + 0.45) / 1.0)) ** 0.8;
    const c = ao * (0.96 + mott * 0.06);
    col[i * 3] = c;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * The stones' skin, in gray to multiply each stone's color: wave-worn smooth with a soft satin sheen, fine light flecks
 * (the feldspar in the stone) and only a rare tiny pit. Hard and smooth, satin rather than glossy (dry stone).
 */
function pebbleMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('pebbleSkin3', () =>
    paint(512, 0.06, 1, (u, v) => {
      const fine = vnoise(u * 220, v * 220, 220, 12), fleck = vnoise(u * 300, v * 300, 300, 14), pit = vnoise(u * 90, v * 90, 90, 11);
      const light = fleck > 0.84 ? (fleck - 0.84) * 6 : 0, hole = pit > 0.93 ? 1 : 0;
      const g = Math.min(1, 0.86 + fine * 0.05 + light * 0.5 - hole * 0.12);
      return { h: 0.5 + fine * 0.08 - hole * 0.3, c: [g, g, g], r: 0.56 + fine * 0.08 + light * 0.08 + hole * 0.2 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.35, 0.35);
  return m;
}

/**
 * A unit piece of crushed stone (long side 1 along x before scaling), seed `s`: an icosphere broken by a handful of flat
 * cuts, so it has the flat fractured faces, sharp edges and blunt corners of quarried, crushed rock. Its faces stay flat
 * (no welding: crushed stone is faceted). Vertex color darkens toward the bottom, where pieces touch and shade each other.
 */
function crushedShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `crushed${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`crushed${s}`);
  // Each cut: a random direction and how far in from the surface the break runs.
  const cuts = Array.from({ length: 6 + Math.floor(r() * 4) }, () => {
    const n = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 1.3, r() - 0.5).normalize();
    return { n, d: 0.25 + r() * 0.15 };
  });
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const c of cuts) {
      const t = v.dot(c.n) - c.d;
      if (t > 0) v.addScaledVector(c.n, -t);
    }
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.5; // a flatter underside, as a piece settles
    p.setXYZ(i, v.x, v.y, v.z);
    uv[i * 2] = (v.x + v.y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (v.z + v.y * 0.7) * 1.4 + s * 0.17;
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (v.y + 0.42) / 0.8)) ** 0.8;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * A unit wood chip (length 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: a flat slab tapered
 * and torn at its ends, thinner at its edges, a little cupped and curled, with shallow ridges along the grain on top.
 * UVs run along its length, so the bark skin's grain follows the chip.
 */
function chipShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `chip${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const g = new THREE.BoxGeometry(1, 1, 1, detail > 0 ? 8 : 4, 1, detail > 0 ? 4 : 2);
  g.deleteAttribute('normal');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uvA = g.getAttribute('uv') as THREE.BufferAttribute;
  const r = rng(`chip${s}`);
  const curl = (r() - 0.5) * 0.3, cup = 0.04 + r() * 0.12, twist = (r() - 0.5) * 0.4, skew = (r() - 0.5) * 0.3;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(x * 2);
    // Blunt, torn ends (shredded wood is splintered square across, not pointed like a leaf), and sides that wander.
    const taper = 1 - 0.22 * ax ** 4;
    z *= taper * (0.82 + 0.36 * vnoise(x * 6 + s * 3.1, z * 2 + s, 1e6, s));
    if (ax > 0.7) x *= 1 + (vnoise(z * 9 + s * 1.7, s, 1e6, s + 2) - 0.5) * 0.45;
    x += z * skew;
    // Thinner toward the long edges; grain ridges on top.
    y *= 0.55 + 0.45 * (1 - (2 * z) ** 2);
    if (y > 0) y += Math.sin(z * Math.PI * (5 + (s % 3)) + s) * 0.06 * taper;
    // Cupped across, curled along its length, twisted a little.
    y += cup * (2 * z) ** 2 * 0.5 + curl * (2 * x) ** 2 * 0.5 + twist * x * z * 2;
    p.setXYZ(i, x, y, z);
    uvA.setXY(i, x * 1.2 + s * 0.37, z * 0.3 + s * 0.21);
    const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.5) / 1.0)) ** 0.7;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/** Crushed stone's skin, gray to multiply each piece's color: a fresh, granular break with light and dark grains, matte. */
function crushedMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('crushedSkin1', () =>
    paint(512, 0.05, 2, (u, v) => {
      const grain = vnoise(u * 260, v * 260, 260, 21), coarse = vnoise(u * 60, v * 60, 60, 22), fleck = vnoise(u * 330, v * 330, 330, 23);
      const light = fleck > 0.86 ? (fleck - 0.86) * 5 : 0, dark = fleck < 0.1 ? (0.1 - fleck) * 4 : 0;
      const g = Math.min(1, 0.84 + grain * 0.08 + coarse * 0.06 + light * 0.5 - dark * 0.4);
      return { h: 0.5 + grain * 0.3 + coarse * 0.2, c: [g, g, g], r: 0.82 + grain * 0.1 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.7, 0.7);
  return m;
}

/** Wood chips' skin, gray to multiply each chip's color: fibrous grain along the chip, splintery, fully matte. */
function chipMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('chipSkin1', () =>
    paint(512, 0.08, 4, (u, v) => {
      const fiber = vnoise(u * 24, v * 320, 320, 31), fine = vnoise(u * 60, v * 900, 900, 32), blot = vnoise(u * 10, v * 30, 30, 33);
      const g = Math.min(1, 0.76 + fiber * 0.16 + fine * 0.08 + (blot - 0.5) * 0.12);
      return { h: fiber * 0.7 + fine * 0.3, c: [g, g, g], r: 0.9 + fine * 0.08 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.normalScale.set(0.8, 0.8);
  return m;
}

type Form = 'pebble' | 'crushed' | 'chip';
/** Per form, on each piece's linear albedo (see placeStones). */
const FORM_GAIN: Record<Form, [number, number, number]> = { pebble: [1, 1, 1], crushed: [1.45, 1.47, 1.6], chip: [2, 2, 2.2] };
const shapeOf = (form: Form, s: number, detail: number) => (form === 'crushed' ? crushedShape(s, detail) : form === 'chip' ? chipShape(s, detail) : pebbleShape(s, detail));

interface Stone {
  x: number;
  y: number;
  z: number;
  len: number;
  wid: number;
  thick: number;
  yaw: number;
  tipX: number;
  tipZ: number;
  color: THREE.Color;
  shape: number;
}

interface Tile {
  /** Nearest point of the tile to measure the camera from. */
  box: THREE.Box3;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  /** Past this the tile hides; under `nearTo` it shows its detailed stones. */
  nearTo: number;
  farTo: number;
}

/**
 * A bed of stones that is part of a feature (a water feature's pebble basin) rather than a plan zone: its outline and
 * holes in plan coordinates (meters), and the height of the surface the stones lie on.
 */
export interface PebbleBed {
  id: string;
  catalogId: string;
  polygon: Vec2[];
  holes: Vec2[][];
  y: number;
  /** Scale on the stones' colors, linear RGB (stone kept wet is darker). */
  tint?: [number, number, number];
}

/** Where one bed's stones go: inside test, surface height and extent. */
interface BedArea {
  key: string;
  inside: (p: Vec2) => boolean;
  height: (p: Vec2) => number;
  polygon: Vec2[];
  tint: [number, number, number];
}

export interface PebbleBuild {
  object: THREE.Object3D | null;
  /** Show each tile's near or far stones, or none, for the camera about to draw. */
  update(cam: THREE.Camera): void;
  dispose(): void;
}

/** Stones over every bed zone whose material has spec.pebble, where that zone is the top one, and over features' `beds`. */
export function buildPebbles(plan: SitePlan, gm: GroundModel, quality: Quality, beds: PebbleBed[] = []): PebbleBuild {
  // Draft quality (the slowest devices) keeps the ground's pebble texture alone.
  const areas: { area: BedArea; catalogId: string }[] = quality === 'draft' ? [] : [
    ...plan.zones.filter((z) => materialById.get(z.catalogId)?.pebble).map((z) => ({
      catalogId: z.catalogId,
      area: { key: z.id, inside: (p: Vec2) => gm.zoneAt(p) === z, height: gm.height, polygon: z.polygon, tint: [1, 1, 1] as [number, number, number] },
    })),
    ...beds.filter((b) => materialById.get(b.catalogId)?.pebble).map((b) => ({
      catalogId: b.catalogId,
      area: { key: b.id, inside: (p: Vec2) => pointInPolygon(p, b.polygon) && !b.holes.some((h) => pointInPolygon(p, h)), height: () => b.y, polygon: b.polygon, tint: b.tint ?? ([1, 1, 1] as [number, number, number]) },
    })),
  ];
  if (!areas.length) return { object: null, update() {}, dispose() {} };
  const group = new THREE.Group();
  group.name = 'pebbles';
  const mats = new Map<Form, THREE.MeshStandardMaterial>();
  const matOf = (f: Form) => {
    let m = mats.get(f);
    if (!m) mats.set(f, (m = f === 'crushed' ? crushedMaterial() : f === 'chip' ? chipMaterial() : pebbleMaterial()));
    return m;
  };
  const tiles: Tile[] = [];
  const owned: THREE.InstancedMesh[] = [];
  const reach = quality === 'max' ? 1.25 : quality === 'balanced' ? 1 : 0.6;
  for (const { area, catalogId } of areas) {
    const spec = materialById.get(catalogId)!;
    const stones = placeStones(area, spec);
    const P = spec.pebble!;
    const form: Form = P.form ?? 'pebble';
    const mat = matOf(form);
    const avg = ((P.minIn + P.maxIn) / 2) * 0.0254;
    // Small stones get plainer shapes: their facets never show. Gravel under an inch is many pieces: the plainest shapes.
    const nearDetail = form === 'crushed' ? (avg < 0.015 ? 0 : 1) : avg < 0.03 ? 1 : 2;
    const farDetail = form === 'crushed' ? 0 : avg < 0.03 ? 0 : 1;
    const byTile = new Map<string, Stone[]>();
    for (const s of stones) {
      const k = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
      const list = byTile.get(k) ?? [];
      list.push(s);
      byTile.set(k, list);
    }
    for (const list of byTile.values()) {
      const box = new THREE.Box3();
      const near: THREE.InstancedMesh[] = [], far: THREE.InstancedMesh[] = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), e = new THREE.Euler();
      for (let sh = 0; sh < SHAPES; sh++) {
        const mine = list.filter((s) => s.shape === sh);
        if (!mine.length) continue;
        // The near and the far mesh draw the same stones: they share one copy of the stones' places and colors.
        const a = new THREE.InstancedMesh(shapeOf(form, sh + 1, nearDetail), mat, mine.length);
        mine.forEach((s, i) => {
          e.set(s.tipX, s.yaw, s.tipZ, 'YXZ');
          q.setFromEuler(e);
          sc.set(s.len, s.thick, s.wid);
          t.set(s.x, s.y, s.z);
          m.compose(t, q, sc);
          a.setMatrixAt(i, m);
          a.setColorAt(i, s.color);
          box.expandByPoint(t);
        });
        const b = new THREE.InstancedMesh(shapeOf(form, sh + 1, farDetail), mat, mine.length);
        b.instanceMatrix = a.instanceMatrix;
        b.instanceColor = a.instanceColor;
        for (const [im, list2] of [[a, near], [b, far]] as [THREE.InstancedMesh, THREE.InstancedMesh[]][]) {
          im.name = `pebbles-${spec.id}`;
          im.castShadow = false;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          im.visible = false;
          group.add(im);
          owned.push(im);
          list2.push(im);
        }
      }
      box.expandByScalar(avg);
      // A stone stops showing at about 2 px on a 1,000 px view; the detailed shape matters only well inside that. Small
      // stones stay in 3D to 16 m at least: across a yard, at a low angle, the flat texture would read lighter than stones.
      // Gravel under an inch is too many pieces to draw across a yard: it stays in 3D to about 7 m, then the texture.
      const farTo = form === 'crushed' && avg < 0.015 ? 7 : Math.max(avg * 520, 16);
      tiles.push({ box, near, far, nearTo: avg * 110 * reach, farTo: farTo * reach });
    }
  }
  const at = new THREE.Vector3();
  return {
    object: group,
    update(cam) {
      cam.getWorldPosition(at);
      for (const t of tiles) {
        const d = t.box.distanceToPoint(at);
        const showNear = d < t.nearTo, showFar = !showNear && d < t.farTo;
        for (const m of t.near) m.visible = showNear;
        for (const m of t.far) m.visible = showFar;
      }
    },
    dispose() {
      owned.forEach((m) => m.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/**
 * The stones of one bed: on a jittered grid about 0.7 of a stone apart (so they touch, overlap a little and pile, as poured stone
 * does), each with its own size from the sold range (more of the middle sizes), shape, turn, tip, color and how deep it
 * sits. Only where this zone is the top one.
 */
function placeStones(z: BedArea, spec: MaterialSpec): Stone[] {
  const P = spec.pebble!;
  const form = P.form ?? 'pebble';
  const r = rng(`pebbles:${z.key}`);
  const IN = 0.0254, avg = ((P.minIn + P.maxIn) / 2) * IN;
  // Pebbles and crushed stone: about 0.7 of a stone apart, so they touch and pile. Chips are flat and narrow: spaced by
  // their area, a little overlapped, so they cover the ground in a layer or two.
  let step = form === 'chip' ? avg * Math.sqrt((P.wide[0] + P.wide[1]) / 2) * 0.8 : avg * 0.7;
  // At most about 400,000 pieces a bed (fine gravel over a big bed): past that they spread out and the ground texture,
  // the same pieces packed tight, fills between them.
  const b0 = bounds(z.polygon);
  const est = ((b0.maxX - b0.minX) * (b0.maxY - b0.minY)) / (step * step);
  if (est > 400000) step *= Math.sqrt(est / 400000);
  const b = b0;
  // Broken faces and stacked chips turn from the sun and shade one another far more than smooth pebbles do (the stone
  // grade was fitted on those): measured top-down in the default light, so the bed renders at its photo colors.
  // Gravel under half an inch shows more shaded gaps between its many pieces: a little more again.
  const gain = FORM_GAIN[form].map((g) => g * (form === 'crushed' && avg < 0.012 ? 1.3 : 1)) as [number, number, number];
  const cols = P.colors.map((x) => new THREE.Color().setRGB(...(rockAlbedo(x.c).map((v, k) => v * gain[k]) as [number, number, number])));
  const cum: number[] = [];
  P.colors.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
  const out: Stone[] = [];
  for (let y = b.minY; y < b.maxY; y += step) {
    for (let x = b.minX; x < b.maxX; x += step) {
      const p: Vec2 = [x + r() * step, y + r() * step];
      if (!z.inside(p)) continue;
      const u = (r() + r()) / 2;
      const len = (P.minIn + (P.maxIn - P.minIn) * u) * IN;
      // The whole stone stays inside the bed (behind its edging), not only its center.
      const reach = len * 0.45;
      if (!z.inside([p[0] + reach, p[1]]) || !z.inside([p[0] - reach, p[1]]) || !z.inside([p[0], p[1] + reach]) || !z.inside([p[0], p[1] - reach])) continue;
      const wid = len * (P.wide[0] + (P.wide[1] - P.wide[0]) * r());
      const thick = len * (P.thick[0] + (P.thick[1] - P.thick[0]) * r());
      const h = r();
      const ci = Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v));
      const color = cols[ci].clone().multiplyScalar(0.88 + r() * 0.24).multiply(new THREE.Color(...z.tint));
      // Pebbles lie flat-ish, a few stood on edge against their neighbors, sunk a fifth to a half of their thickness.
      // Crushed stone lies any which way. Chips lie flat in a loose layer, each at its own height so none share a plane.
      const steep = r() < (form === 'crushed' ? 0.35 : form === 'chip' ? 0.06 : 0.12);
      const tip = form === 'crushed' ? 1.4 : form === 'chip' ? 0.3 : 0.4;
      const py = form === 'chip' ? z.height(p) + thick * 0.3 + r() * avg * 0.12 : z.height(p) + thick * (0.5 - (0.2 + r() * 0.3));
      out.push({
        x: p[0],
        y: py,
        z: p[1],
        len,
        wid,
        thick,
        yaw: r() * Math.PI * 2,
        tipX: (r() - 0.5) * (steep ? 1.1 : tip),
        tipZ: (r() - 0.5) * (steep ? 0.9 : tip * 0.9),
        color,
        shape: Math.floor(r() * SHAPES),
      });
    }
  }
  return out;
}
