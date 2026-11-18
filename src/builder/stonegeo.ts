import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../siteplan/geometry';
import { smooth } from '../engine/noise';
import { boxUV } from './materials';

/*
 * One boulder, shaped and painted: a cube-sphere pushed out to a blocky, cut and weathered form, then colored by hand
 * (stone, dark streaks, gray-green and rust lichen, moss on the tops, soil at the ground line). Every rock is its own
 * geometry, so each placed boulder is different; the triangle count follows its size (about 2,400 for a 20 in rock,
 * about 5,800 for a 5 ft one). The color lives in the vertices; the texture (engine/rock-surfaces.ts) is only grain,
 * pits and relief, so a boulder is one draw per material when it is merged into its feature.
 */

/* ---- 3D value noise ------------------------------------------------ */

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = fade(x - x0), fy = fade(y - y0), fz = fade(z - z0);
  const c = (i: number, j: number, k: number) => hash3(x0 + i, y0 + j, z0 + k, seed);
  const a = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx;
  const b = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx;
  const d = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx;
  const e = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx;
  const lo = a + (b - a) * fy, hi = d + (e - d) * fy;
  return lo + (hi - lo) * fz;
}

/** Fractal value noise in [0, 1]. */
export function fbm3(x: number, y: number, z: number, octaves: number, seed = 0): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/* ---- Looks ---------------------------------------------------------- */

export interface RockLook {
  /** Stone colors (sRGB hex) the body wanders between, and the dark of its streaks and weathered pockets. */
  stone: string[];
  streak: string;
  /** Soil splashed on the foot of the rock. */
  soil: string;
  /** Gray-green crust lichen: its color, and how much of the rock it covers (0 to 1). */
  lichen: string;
  lichenAmount: number;
  /** Rust-orange lichen patches, mostly on the faces that look out. */
  rust: string;
  rustAmount: number;
  /** Moss: two greens it varies between, and the most of the rock it covers. */
  moss: [string, string];
  mossAmount: number;
}

/** What shapes a boulder: how blocky it is, the flat cuts it was split along and how worn the cuts are. */
export interface RockShape {
  /** 2 is an egg, 3 a pillow, 5 a block. */
  squareness: number;
  /** Split planes: how many, how deep they cut (0.5 cuts a lot, 1 not at all) and how worn their edges are (0 crisp). */
  cuts: number;
  cutDepth: [number, number];
  edge: number;
  /** A flat top at this share of the half height (0: none), and how crisp its edge is. */
  flatTop?: [number, number];
  /** Big and small lumps of the surface, as a share of the radius. */
  lump: number;
  rough: number;
  /** Weathered pockets, as a share of the radius. */
  pocket: number;
  /** Leaning, in degrees, at most. */
  lean: number;
}

export interface RockSpec {
  shape: RockShape;
  look: RockLook;
  /** Length (x), depth (z) and the height above the ground (y), meters. */
  size: [number, number, number];
  /** Share of its full height that is buried. */
  buried: number;
  seed: string;
  /** Moss and lichen on (false: clean stone). */
  moss: boolean;
}

const col = (hex: string) => new THREE.Color(hex);
const lerpC = (out: THREE.Color, b: THREE.Color, t: number) => out.lerp(b, Math.min(1, Math.max(0, t)));
const smin = (a: number, b: number, k: number) => {
  if (!(k > 1e-6)) return Math.min(a, b);
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

/** Cube-sphere segments per edge: more for a bigger rock, so a bump stays about 3 cm across. */
export function rockSegments(longest: number): number {
  return Math.round(Math.min(22, Math.max(12, 9 + longest * 9)));
}

let sphereCache = new Map<number, { pos: Float32Array; index: ArrayLike<number> }>();

/** The welded cube-sphere's unit directions and triangles (shared by every rock of that many segments). */
function unitSphere(n: number) {
  let s = sphereCache.get(n);
  if (s) return s;
  const box = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const w = mergeVertices(box, 1e-5);
  const p = w.getAttribute('position') as THREE.BufferAttribute;
  const pos = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    pos.set([v.x, v.y, v.z], i * 3);
  }
  s = { pos, index: w.index!.array };
  sphereCache.set(n, s);
  box.dispose();
  w.dispose();
  return s;
}

export function disposeRockCache() {
  sphereCache = new Map();
}

/**
 * Build a boulder with its base at the bottom of its buried part: x and z centered, the ground at y = 0, the top at
 * `size[2]` above it, so a placed rock needs only to be set at the grade.
 */
export function buildRock(spec: RockSpec): THREE.BufferGeometry {
  const { shape, look, size } = spec;
  const r = rng(`rock:${spec.seed}`);
  const seedN = Math.floor(r() * 1e6);
  const n = rockSegments(Math.max(size[0], size[1], size[2]));
  const sph = unitSphere(n);
  const count = sph.pos.length / 3;

  // The cuts: planes (unit normal, distance) the rock was split along. Mostly sideways and up, a few below.
  const planes: { n: THREE.Vector3; h: number; k: number }[] = [];
  const plane = (h: number, k: number) => {
    const a = r() * Math.PI * 2;
    const el = (r() - 0.35) * 1.3;
    planes.push({ n: new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize(), h, k });
  };
  for (let k = 0; k < shape.cuts; k++) plane(shape.cutDepth[0] + r() * (shape.cutDepth[1] - shape.cutDepth[0]), shape.edge);
  // Chips: shallow flat spalls along the edges, crisper than the big cuts.
  for (let k = 0; k < shape.cuts * 2; k++) plane(0.9 + r() * 0.07, shape.edge * 0.3);
  const top = shape.flatTop;
  const lean = (shape.lean * Math.PI) / 180;
  const tiltX = (r() - 0.5) * 2 * lean, tiltZ = (r() - 0.5) * 2 * lean;
  const p = shape.squareness;
  const half = [size[0] / 2, size[2] / (1 - spec.buried) / 2, size[1] / 2];
  const ox = r() * 50, oy = r() * 50, oz = r() * 50;

  const pos = new Float32Array(count * 3);
  const pocket = new Float32Array(count);
  const d = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    d.set(sph.pos[i * 3], sph.pos[i * 3 + 1], sph.pos[i * 3 + 2]);
    // A block with rounded corners.
    let rad = Math.pow(Math.pow(Math.abs(d.x), p) + Math.pow(Math.abs(d.y), p) + Math.pow(Math.abs(d.z), p), -1 / p);
    // Split planes, joined softly so a worn edge is rounded.
    for (const pl of planes) {
      const dn = pl.n.dot(d);
      if (dn > 1e-3) rad = smin(rad, pl.h / dn, pl.k);
    }
    if (top && d.y > 1e-3) rad = smin(rad, top[0] / d.y, top[1]);
    // Lumps (the big shape) and roughness (the small).
    const px = d.x * rad * half[0], py = d.y * rad * half[1], pz = d.z * rad * half[2];
    const lump = fbm3(d.x * 1.7 + ox, d.y * 1.7 + oy, d.z * 1.7 + oz, 3, seedN) - 0.5;
    const rough = fbm3(px * 9 + ox, py * 9 + oy, pz * 9 + oz, 2, seedN + 5) - 0.5;
    // Weathered pockets: broad, shallow dimples where the noise runs high.
    const pk = smooth(0.62, 0.9, fbm3(px * 5 + oz, py * 5 + ox, pz * 5 + oy, 2, seedN + 11));
    pocket[i] = pk;
    rad *= 1 + shape.lump * lump * 2 + shape.rough * rough * 2 - shape.pocket * pk;
    let x = d.x * rad * half[0], y = d.y * rad * half[1], z = d.z * rad * half[2];
    // Lean.
    const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX), z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
    const x2 = x * Math.cos(tiltZ) - y1 * Math.sin(tiltZ), y2 = x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ);
    x = x2;
    y = y2;
    z = z1;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  }

  // Fit the leaned, lumpy form back to the asked size: top at `size[2]`, the buried foot below the ground.
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, pos[i * 3]); maxX = Math.max(maxX, pos[i * 3]);
    minY = Math.min(minY, pos[i * 3 + 1]); maxY = Math.max(maxY, pos[i * 3 + 1]);
    minZ = Math.min(minZ, pos[i * 3 + 2]); maxZ = Math.max(maxZ, pos[i * 3 + 2]);
  }
  const total = size[2] / (1 - spec.buried);
  const kx = size[0] / (maxX - minX), kz = size[1] / (maxZ - minZ), ky = total / (maxY - minY);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (pos[i * 3] - (minX + maxX) / 2) * kx;
    pos[i * 3 + 1] = (pos[i * 3 + 1] - minY) * ky - (total - size[2]);
    pos[i * 3 + 2] = (pos[i * 3 + 2] - (minZ + maxZ) / 2) * kz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(sph.index as ArrayLike<number>), 1));
  geo.computeVertexNormals();

  // Moss is puffy: pushed out along the normal where it grows, then the normals are redone.
  const mossAmt = spec.moss ? look.mossAmount * (0.55 + r() * 0.8) : 0;
  const mask = mossMask(geo, size[2], mossAmt, seedN);
  if (mossAmt > 0) {
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const puff = mask[i] * (0.006 + 0.014 * fbm3(pos[i * 3] * 22, pos[i * 3 + 1] * 22, pos[i * 3 + 2] * 22, 2, seedN + 3));
      pos[i * 3] += nrm.getX(i) * puff;
      pos[i * 3 + 1] += nrm.getY(i) * puff;
      pos[i * 3 + 2] += nrm.getZ(i) * puff;
    }
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    geo.computeVertexNormals();
  }

  paintRock(geo, look, spec.moss, mask, pocket, seedN);
  boxUV(geo);
  return geo;
}

/** Where moss grows: the upward faces, damp low places, and patches of noise. 0 to 1 per vertex. */
function mossMask(geo: THREE.BufferGeometry, height: number, amount: number, seed: number): Float32Array {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  if (amount <= 0) return out;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nrm.getY(i);
    const patch = fbm3(x * 6.5 + 31, y * 6.5, z * 6.5 + 7, 4, seed + 41);
    // Low and damp (just above the soil) grows moss on every face; the tops catch it too.
    const damp = 1 - smooth(0.0, 0.35 * height, y);
    const v = 0.35 * Math.max(0, up) + 1.15 * patch + 0.3 * damp - 0.62 - (1 - amount) * 0.55;
    out[i] = smooth(0.0, 0.1, v) * smooth(-0.04, 0.02, y);
  }
  return out;
}

function paintRock(geo: THREE.BufferGeometry, look: RockLook, moss: boolean, mask: Float32Array, pocket: Float32Array, seed: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const stone = look.stone.map(col), streak = col(look.streak), soil = col(look.soil);
  const lichen = col(look.lichen), rust = col(look.rust), m0 = col(look.moss[0]), m1 = col(look.moss[1]);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nrm.getY(i);
    const side = 1 - Math.abs(up);
    // The stone: a slow drift between its colors, then dark streaks running down it and dark weathered pockets.
    const t = fbm3(x * 2.6 + 5, y * 2.6, z * 2.6 + 9, 3, seed + 1) * (stone.length - 1) * 0.999;
    const k = Math.floor(t);
    c.copy(stone[k]);
    lerpC(c, stone[Math.min(stone.length - 1, k + 1)], smooth(0, 1, t - k));
    const streaks = smooth(0.52, 0.78, fbm3(x * 2.2 + 13, y * 0.7, z * 2.2 + 3, 3, seed + 2));
    // Broad dark weathering (patina) on the shaded and the low faces, so no rock reads as one clean color.
    const patina = smooth(0.45, 0.8, fbm3(x * 1.4 + 70, y * 1.4, z * 1.4 + 20, 3, seed + 7)) * (0.35 + 0.4 * (1 - Math.max(0, up)));
    lerpC(c, streak, Math.min(0.8, streaks * 0.5 + patina * 0.45 + pocket[i] * 0.45));
    if (moss) {
      // Gray-green crust lichen in blotches on the tops and shoulders; rust-orange patches on the faces looking out.
      const lich = smooth(0.56, 0.66, fbm3(x * 6.5 + 17, y * 6.5, z * 6.5 + 23, 3, seed + 3)) * look.lichenAmount * (0.5 + 0.5 * Math.max(0, up) + 0.3 * side);
      lerpC(c, lichen, lich * 0.85);
      const rus = smooth(0.64, 0.74, fbm3(x * 11 + 41, y * 11, z * 11 + 5, 3, seed + 4)) * look.rustAmount * (0.35 + 0.65 * side);
      lerpC(c, rust, rus * 0.65);
      // Moss: two greens, patchy.
      const mc = m0.clone();
      lerpC(mc, m1, fbm3(x * 14, y * 14, z * 14, 2, seed + 6));
      lerpC(c, mc, Math.min(1, mask[i] * 1.15));
    }
    // Soil splashed up the foot, and the dark of the earth below the ground line.
    lerpC(c, soil, (1 - smooth(0.0, 0.07, y)) * 0.6);
    // Pockets and the shade of a deep cut read darker still.
    // Faces turned from the sky read darker.
    c.multiplyScalar((0.72 + 0.28 * (up * 0.5 + 0.5)) * (1 - pocket[i] * 0.12));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
