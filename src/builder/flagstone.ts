import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import type { FeatureSpec } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import type { FeaturePlacement } from '../siteplan/types';
import { fbm3 } from './stonegeo';

/*
 * Flagstone pieces for water features (siteplan/waterrocks.ts): a spillway lip stone, a ledge of stacked slabs and an
 * edge piece. Each slab is an irregular, hand-broken outline (a rounded rectangle pushed about by noise, with chips)
 * with a gently undulating cleft top, a small chamfer and a nearly square edge, built from the center outward so the
 * top can ripple. The stone's look (color, cleft texture) is the placement's material, drawn by the same recipes as
 * the stepping stones; the piece's thickness is the size's height.
 */

export interface SlabSpec {
  length: number;
  depth: number;
  thick: number;
  seed: string;
  /** 0 (cut true) to 1 (broken all round). */
  irregular: number;
  /** 2 is oval, 4 a rounded rectangle. */
  squareness: number;
  /** A rounded front lip (toward +z) that drops a little: a spillway lip stone. */
  lip?: boolean;
}

const RINGS = [0, 0.34, 0.62, 0.84, 0.96];
const SEG = 48;

/** One slab with its underside at y = 0 and its top at `thick`, centered on x and z. UVs are meters on the top and along the edge. */
export function flagSlab(s: SlabSpec): THREE.BufferGeometry {
  const r = rng(`flag:${s.seed}`);
  const a = s.length / 2, b = s.depth / 2;
  const off = r() * 40;
  const seedN = Math.floor(r() * 1e6);
  const p = s.squareness;
  // The outline: a rounded rectangle, pushed about by noise, with a few chips knocked off the corners.
  const chips = Math.round(1 + s.irregular * 3);
  const chipAt = Array.from({ length: chips }, () => ({ t: r() * Math.PI * 2, w: 0.25 + r() * 0.4, d: 0.05 + r() * 0.16 * (0.4 + s.irregular) }));
  // Hand-broken flagstone has straight, angular edges: a polygon of 6 to 9 corners about the rounded rectangle, the
  // outline running straight between them, a little worn at the corners. A cut stone (the lip) stays a rounded rectangle.
  const K = s.irregular > 0.5 ? 6 + Math.floor(r() * 4) : 0;
  const corners: [number, number][] = [];
  for (let k = 0; k < K; k++) {
    const t = ((k + (r() - 0.5) * 0.7) / K) * Math.PI * 2;
    const c = Math.cos(t), si = Math.sin(t);
    const rr = Math.pow(Math.pow(Math.abs(c) / a, p) + Math.pow(Math.abs(si) / b, p), -1 / p) * (0.82 + r() * 0.2);
    corners.push([c * rr, si * rr]);
  }
  const polyRadius = (t: number) => {
    const dx = Math.cos(t), dz = Math.sin(t);
    let best = 0;
    for (let k = 0; k < K; k++) {
      const P = corners[k], Q = corners[(k + 1) % K];
      const ex = Q[0] - P[0], ez = Q[1] - P[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const rr = (P[0] * ez - P[1] * ex) / den;
      const u = (P[0] * dz - P[1] * dx) / den;
      if (rr > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, rr);
    }
    return best;
  };
  const radius = (t: number) => {
    const c = Math.cos(t), si = Math.sin(t);
    let rad = K ? polyRadius(t) : Math.pow(Math.pow(Math.abs(c) / a, p) + Math.pow(Math.abs(si) / b, p), -1 / p);
    rad *= 1 + (fbm3(Math.cos(t) * 3 + off, Math.sin(t) * 3 + off, 0, 3, seedN) - 0.5) * (K ? 0.05 : 0.28 * s.irregular);
    if (!K) {
      for (const ch of chipAt) {
        const dt = Math.abs(Math.atan2(Math.sin(t - ch.t), Math.cos(t - ch.t)));
        rad *= 1 - ch.d * (1 - Math.min(1, dt / ch.w)) ** 1.5;
      }
    }
    return rad;
  };
  const rad = Array.from({ length: SEG }, (_, i) => radius((i / SEG) * Math.PI * 2));
  // A slight lean, as a stone settles.
  const tiltX = (r() - 0.5) * 0.03, tiltZ = (r() - 0.5) * 0.03;
  const chamfer = Math.min(s.thick * (s.lip ? 0.55 : 0.2), 0.012);
  const top = (x: number, z: number, edge: number) => {
    // The cleft face ripples a few millimeters; a lip drops away toward its front.
    let y = s.thick + (fbm3(x * 5 + off, z * 5 + off, 0, 3, seedN + 9) - 0.5) * Math.min(0.012, s.thick * 0.22) + x * tiltX + z * tiltZ;
    if (s.lip) y -= 0.012 * Math.max(0, (z / b - 0.35) / 0.65) ** 2;
    return y - edge * chamfer;
  };

  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, u: number, v: number) => {
    pos.push(x, y, z);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };
  // Top: a center vertex and the rings out to the chamfer.
  const centre = push(0, top(0, 0, 0), 0, 0, 0);
  const ringStart: number[] = [];
  for (let k = 1; k < RINGS.length; k++) {
    ringStart.push(pos.length / 3);
    for (let i = 0; i < SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      const x = Math.cos(t) * rad[i] * RINGS[k], z = Math.sin(t) * rad[i] * RINGS[k];
      push(x, top(x, z, k === RINGS.length - 1 ? 0.5 : 0), z, x, z);
    }
  }
  // Edge ring at the full outline (top of the wall), and the foot.
  const wallTop = pos.length / 3;
  let perimeter = 0;
  for (let i = 0; i < SEG; i++) {
    const t = (i / SEG) * Math.PI * 2, t1 = ((i + 1) / SEG) * Math.PI * 2;
    const x = Math.cos(t) * rad[i], z = Math.sin(t) * rad[i];
    push(x, top(x, z, 1), z, perimeter, 0);
    perimeter += Math.hypot(Math.cos(t1) * rad[(i + 1) % SEG] - x, Math.sin(t1) * rad[(i + 1) % SEG] - z);
  }
  const wallFoot = pos.length / 3;
  for (let i = 0; i < SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const k = 0.985;
    const x = Math.cos(t) * rad[i] * k, z = Math.sin(t) * rad[i] * k;
    const j = wallTop + i;
    push(x, 0, z, uv[j * 2], -pos[j * 3 + 1]);
  }
  for (let i = 0; i < SEG; i++) {
    const n = (i + 1) % SEG;
    // Center fan, outward, so the faces point up (counter-clockwise seen from above is +y for x, z and this winding).
    idx.push(centre, ringStart[0] + n, ringStart[0] + i);
    for (let k = 0; k < ringStart.length - 1; k++) {
      const A = ringStart[k] + i, B = ringStart[k] + n, C = ringStart[k + 1] + i, D = ringStart[k + 1] + n;
      idx.push(A, B, C, B, D, C);
    }
    const last = ringStart[ringStart.length - 1];
    idx.push(last + i, last + n, wallTop + i, last + n, wallTop + n, wallTop + i);
    idx.push(wallTop + i, wallTop + n, wallFoot + i, wallTop + n, wallFoot + n, wallFoot + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The outline ring is welded at the seam of the wall's UVs only by position; normals above are already smooth.
  return g;
}

export interface FlagContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  /** Add a part (merged per material). */
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void;
  /** The material of the stone the placement names. */
  material: THREE.Material;
  /** The top of paving the piece is set on (0 on turf, beds and bare ground). */
  lift?: number;
}

/** Spillway lip stone, ledge of stacked slabs, or edge piece, at the feature's spot. */
export function buildFlagstone(c: FlagContext) {
  const [L, D, T] = featureSize(c.spec, c.f.size, 0.05);
  const r = rng(`flagplace:${c.f.id}`);
  const lift = c.lift ?? 0;
  if (c.spec.kind === 'flagLedge') {
    // Slabs stacked to the height asked, each a little back from the one below and a little off square.
    const parts: THREE.BufferGeometry[] = [];
    const unit = 0.0508;
    let y = 0, i = 0;
    while (y < T - 0.004) {
      const t = Math.min(T - y, unit * (0.8 + r() * 0.5));
      const last = T - y - t < 0.01;
      const th = last ? T - y : t;
      const shrink = 1 - 0.07 * i;
      const g = flagSlab({ length: L * shrink * (0.92 + r() * 0.12), depth: D * (1 - 0.09 * i) * (0.9 + r() * 0.15), thick: th, seed: `${c.f.id}-${i}`, irregular: 0.7, squareness: 3.4 });
      g.rotateY((r() - 0.5) * 0.16);
      g.translate((r() - 0.5) * L * 0.08, y, -0.06 * D * i + (r() - 0.5) * D * 0.04);
      parts.push(g);
      y += th;
      i++;
      if (i > 24) break;
    }
    for (const g of parts) c.add(c.material, g.translate(0, lift, 0));
    return;
  }
  const lip = c.spec.kind === 'flagLip';
  const g = flagSlab({ length: L, depth: D, thick: T, seed: c.f.id, irregular: lip ? 0.35 : 0.8, squareness: lip ? 4.2 : 3.2, lip });
  g.translate(0, lift, 0);
  c.add(c.material, g);
}
