import * as THREE from 'three';
import { area, bounds, fmtFeet, polylineLength, type Bounds } from '../siteplan/geometry';
import { materialById } from '../siteplan/catalog';
import { PolygonIndex } from '../siteplan/spatial';
import type { SitePlan, UtilityLine, UtilityPoint, Vec2 } from '../siteplan/types';
import {
  IN, UTILITY_KIND_NAME, UTILITY_PAINT, UTILITY_PIPE, UTILITY_POINT_NAME, cuyd, inches, trenchName, trenchSpec, zoneSection,
  type SectionLayerKind, type TrenchSpec, type ZoneSection,
} from '../siteplan/utilities';
import { buildLayerTextures, type BuildLayer } from '../engine/surfaces';
import type { Quality } from '../engine/post';
import { lineCenter, lineThickness } from './linepath';

/**
 * The yard as it is built, one stage at a time: demo and layout (marking paint), excavation, open trenches with the
 * pipes in them at their cover, backfill, base rock, the bedding layer, and the finished yard.
 *
 * Pits (dug-out areas and trenches) are cut from a fine distance field over the plan: a marching-squares mesh of
 * floors and vertical walls, one band per depth, and the same field (as a texture) opens the ground mesh above them.
 * Overlapping cuts merge, so a joint trench, a trench crossing a patio dig or two trenches meeting form one pit.
 */

export type BuildStage = 'demo' | 'excavate' | 'trench' | 'backfill' | 'base' | 'bedding' | 'finished';

export const BUILD_STAGES: { id: BuildStage; label: string; title: string }[] = [
  { id: 'demo', label: 'Demo', title: 'Demo and layout' },
  { id: 'excavate', label: 'Excavate', title: 'Excavation' },
  { id: 'trench', label: 'Trench', title: 'Trenches and pipes' },
  { id: 'backfill', label: 'Backfill', title: 'Backfill' },
  { id: 'base', label: 'Base rock', title: 'Base rock' },
  { id: 'bedding', label: 'Sand', title: 'Bedding layer' },
  { id: 'finished', label: 'Finished', title: 'Finished yard' },
];

export interface StageLabel {
  stages: BuildStage[];
  at: THREE.Vector3;
  title: string;
  sub?: string;
  kind: 'trench' | 'area' | 'point';
}

export interface ConstructionBuild {
  object: THREE.Group;
  /** Opens the ground over the pits: R the excavations alone, G with the trenches. Null when nothing is dug. */
  cut: { texture: THREE.DataTexture; box: THREE.Vector4 } | null;
  labels: StageLabel[];
  /** What each stage shows, in a sentence or two, from this plan. */
  notes: Record<BuildStage, string>;
  setStage(stage: BuildStage): void;
  /**
   * The cutaway face for a stage: a vertical slice of the ground along `plane` (whose kept side is where its normal
   * points), showing native soil, open trenches and pits, backfill, base, bedding and the surface as they are at that
   * stage, with the pipes cut through. The caller clips the rest of the yard with the same plane. Null when the plane
   * misses the site.
   */
  section(stage: BuildStage, plane: THREE.Plane): THREE.Group | null;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Distance fields on a grid                                             */

const BAND_CELLS = 3;

interface Cut {
  depth: number;
  poly?: PolygonIndex;
  path?: Vec2[];
  half?: number;
  /** Polygon distances cached over its box: [i0, j0, w, h]. */
  cache?: { i0: number; j0: number; w: number; h: number; data: Float32Array };
}

class Grid {
  readonly band: number;
  constructor(readonly x0: number, readonly y0: number, readonly c: number, readonly nx: number, readonly ny: number) {
    this.band = c * BAND_CELLS;
  }
  field(): Float32Array {
    return new Float32Array(this.nx * this.ny).fill(this.band);
  }
  span(minX: number, maxX: number, minY: number, maxY: number): [number, number, number, number] {
    const { x0, y0, c, nx, ny } = this;
    return [
      Math.max(0, Math.floor((minX - x0) / c)), Math.min(nx - 1, Math.ceil((maxX - x0) / c)),
      Math.max(0, Math.floor((minY - y0) / c)), Math.min(ny - 1, Math.ceil((maxY - y0) / c)),
    ];
  }
  /** Union a buffered polyline (round ends and corners) into F. */
  addPath(F: Float32Array, path: Vec2[], half: number) {
    const { x0, y0, c, nx, band: B } = this;
    for (let s = 0; s + 1 < path.length; s++) {
      const [ax, ay] = path[s], [bx, by] = path[s + 1];
      const r = half + B;
      const [i0, i1, j0, j1] = this.span(Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(ay, by) - r, Math.max(ay, by) + r);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + j * c;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + i * c;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
          const d = Math.hypot(x - ax - t * dx, y - ay - t * dy) - half;
          const k = j * nx + i;
          if (d < F[k]) F[k] = d < -B ? -B : d;
        }
      }
    }
  }
  /** Union a polygon into F (its distances are worked out once and kept on the cut). */
  addPolygon(F: Float32Array, cut: Cut) {
    const { x0, y0, c, nx, band: B } = this;
    if (!cut.cache) {
      const b = cut.poly!.box;
      const [i0, i1, j0, j1] = this.span(b.minX - B, b.maxX + B, b.minY - B, b.maxY + B);
      const w = i1 - i0 + 1, h = j1 - j0 + 1;
      const data = new Float32Array(Math.max(0, w * h));
      for (let j = 0; j < h; j++) {
        const y = y0 + (j0 + j) * c;
        for (let i = 0; i < w; i++) {
          const x = x0 + (i0 + i) * c;
          let d = cut.poly!.dist(x, y, B);
          if (!(d < B)) d = B;
          data[j * w + i] = cut.poly!.contains(x, y) ? -d : d;
        }
      }
      cut.cache = { i0, j0, w, h, data };
    }
    const { i0, j0, w, h, data } = cut.cache;
    for (let j = 0; j < h; j++) {
      const row = (j0 + j) * nx + i0;
      for (let i = 0; i < w; i++) {
        const v = data[j * w + i];
        if (v < F[row + i]) F[row + i] = v;
      }
    }
  }
  add(F: Float32Array, cut: Cut) {
    if (cut.poly) this.addPolygon(F, cut);
    else if (cut.path) this.addPath(F, cut.path, cut.half!);
  }
}

/* ------------------------------------------------------------------ */
/* Mesh building                                                        */

class MeshBuf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, shade = 1): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(shade, shade, shade);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
  /** A triangle that faces up, whatever order its corners come in. */
  triUp(a: number, b: number, c: number) {
    const p = this.pos;
    // y of (b - a) x (c - a).
    const ax = p[a * 3], az = p[a * 3 + 2];
    const ny = (p[b * 3 + 2] - az) * (p[c * 3] - ax) - (p[b * 3] - ax) * (p[c * 3 + 2] - az);
    if (ny >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  get empty() {
    return this.idx.length === 0;
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The inside part of one grid cell (F < 0), walked around its corners v0 (i, j), v1 (i+1, j), v2 (i+1, j+1),
 * v3 (i, j+1): corners that are inside and the points where an edge crosses the outline. Fills P with x, z pairs
 * and C with whether each point is a crossing. Walking this way, the inside is always to the side (-dz, dx).
 */
function walkCell(f: number[], xa: number, za: number, c: number, P: number[], C: boolean[]) {
  P.length = 0;
  C.length = 0;
  const vx = [xa, xa + c, xa + c, xa], vz = [za, za, za + c, za + c];
  for (let e = 0; e < 4; e++) {
    const n = (e + 1) & 3, fa = f[e], fb = f[n];
    if (fa < 0) {
      P.push(vx[e], vz[e]);
      C.push(false);
    }
    if (fa < 0 !== fb < 0) {
      const t = fa / (fa - fb);
      P.push(vx[e] + (vx[n] - vx[e]) * t, vz[e] + (vz[n] - vz[e]) * t);
      C.push(true);
    }
  }
}

type Height = (x: number, z: number) => number;

/** F at a point between grid points (bilinear). */
function sampleField(g: Grid, F: Float32Array, x: number, z: number): number {
  const fx = (x - g.x0) / g.c, fz = (z - g.y0) / g.c;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.ny - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const k = j * g.nx + i;
  return (F[k] * (1 - u) + F[k + 1] * u) * (1 - v) + (F[k + g.nx] * (1 - u) + F[k + g.nx + 1] * u) * v;
}

/**
 * Up-facing surface over the region F < 0. Rows of whole cells are joined into longer quads. With `edge`, the
 * surface darkens toward the outline of edge < 0 (where it meets a wall), a little contact shadow.
 */
function fillRegion(g: Grid, F: Float32Array, buf: MeshBuf, y: Height, tile: number, shade: (x: number, z: number, y: number) => number, edge?: Float32Array) {
  const { nx, ny, x0, y0, c } = g;
  const f = [0, 0, 0, 0], P: number[] = [], C: boolean[] = [], ids: number[] = [];
  const v = (x: number, z: number) => {
    const h = y(x, z);
    const ao = edge ? 0.62 + 0.38 * Math.min(1, Math.max(0, -sampleField(g, edge, x, z) / g.band)) : 1;
    return buf.vert(x, h, z, 0, 1, 0, x / tile, z / tile, shade(x, z, h) * ao);
  };
  for (let j = 0; j < ny - 1; j++) {
    let i = 0;
    while (i < nx - 1) {
      const k = j * nx + i;
      f[0] = F[k]; f[1] = F[k + 1]; f[2] = F[k + nx + 1]; f[3] = F[k + nx];
      if (f[0] < 0 && f[1] < 0 && f[2] < 0 && f[3] < 0) {
        let e = i + 1;
        while (e < nx - 1 && e - i < 24 && F[j * nx + e + 1] < 0 && F[j * nx + e + nx + 1] < 0) e++;
        const xa = x0 + i * c, xb = x0 + e * c, za = y0 + j * c, zb = za + c;
        const a = v(xa, za), b = v(xb, za), cc = v(xa, zb), d = v(xb, zb);
        buf.tri(a, cc, b);
        buf.tri(b, cc, d);
        i = e;
        continue;
      }
      if (f[0] < 0 || f[1] < 0 || f[2] < 0 || f[3] < 0) {
        walkCell(f, x0 + i * c, y0 + j * c, c, P, C);
        ids.length = 0;
        for (let m = 0; m < P.length; m += 2) ids.push(v(P[m], P[m + 1]));
        for (let t = 1; t + 1 < ids.length; t++) buf.tri(ids[0], ids[t + 1], ids[t]);
      }
      i++;
    }
  }
}

/** Vertical walls along the outline of F < 0, facing in, from top(x, z) down to bottom(x, z). */
function wallRegion(g: Grid, F: Float32Array, buf: MeshBuf, top: Height, bottom: Height, tile: number, shade: (x: number, z: number, y: number) => number) {
  const { nx, ny, x0, y0, c } = g;
  const f = [0, 0, 0, 0], P: number[] = [], C: boolean[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      f[0] = F[k]; f[1] = F[k + 1]; f[2] = F[k + nx + 1]; f[3] = F[k + nx];
      const ins = (f[0] < 0 ? 1 : 0) + (f[1] < 0 ? 1 : 0) + (f[2] < 0 ? 1 : 0) + (f[3] < 0 ? 1 : 0);
      if (ins === 0 || ins === 4) continue;
      walkCell(f, x0 + i * c, y0 + j * c, c, P, C);
      const n = C.length;
      for (let m = 0; m < n; m++) {
        const q = (m + 1) % n;
        if (!C[m] || !C[q]) continue;
        const px = P[m * 2], pz = P[m * 2 + 1], qx = P[q * 2], qz = P[q * 2 + 1];
        const dx = qx - px, dz = qz - pz, L = Math.hypot(dx, dz);
        if (L < 1e-6) continue;
        const nx2 = -dz / L, nz2 = dx / L;
        const u = (x: number, z: number) => (x * nz2 - z * nx2) / tile;
        const pt = top(px, pz), pb = bottom(px, pz), qt = top(qx, qz), qb = bottom(qx, qz);
        const A = buf.vert(px, pt, pz, nx2, 0, nz2, u(px, pz), pt / tile, shade(px, pz, pt));
        const B = buf.vert(px, pb, pz, nx2, 0, nz2, u(px, pz), pb / tile, shade(px, pz, pb));
        const Q = buf.vert(qx, qb, qz, nx2, 0, nz2, u(qx, qz), qb / tile, shade(qx, qz, qb));
        const T = buf.vert(qx, qt, qz, nx2, 0, nz2, u(qx, qz), qt / tile, shade(qx, qz, qt));
        buf.tri(A, B, Q);
        buf.tri(A, Q, T);
      }
    }
  }
}

/** A round tube along a path, with end caps. */
function tubeAlong(buf: MeshBuf, path: THREE.Vector3[], r: number, radial = 8) {
  if (path.length < 2) return;
  const up = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), Bv = new THREE.Vector3(), R = new THREE.Vector3();
  const rings: number[][] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    up.set(0, 1, 0);
    if (Math.abs(T.y) > 0.9) up.set(1, 0, 0);
    N.crossVectors(up, T).normalize();
    Bv.crossVectors(T, N);
    const ring: number[] = [];
    for (let m = 0; m < radial; m++) {
      const th = (m / radial) * Math.PI * 2;
      R.copy(N).multiplyScalar(Math.cos(th)).addScaledVector(Bv, Math.sin(th));
      const p = path[i];
      ring.push(buf.vert(p.x + R.x * r, p.y + R.y * r, p.z + R.z * r, R.x, R.y, R.z, m / radial, i, 1));
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let m = 0; m < radial; m++) {
      const a = rings[i][m], b = rings[i][(m + 1) % radial], c = rings[i + 1][m], d = rings[i + 1][(m + 1) % radial];
      buf.tri(a, b, c);
      buf.tri(b, d, c);
    }
  }
  // Caps, facing out along the path.
  for (const [ring, from, to, flip] of [[rings[0], path[0], path[1], true], [rings[rings.length - 1], path[path.length - 1], path[path.length - 2], false]] as const) {
    T.subVectors(from, to).normalize();
    const center = buf.vert(from.x, from.y, from.z, T.x, T.y, T.z, 0.5, 0.5, 1);
    const p = buf.pos;
    const ids = ring.map((k) => buf.vert(p[k * 3], p[k * 3 + 1], p[k * 3 + 2], T.x, T.y, T.z, 0.5, 0.5, 1));
    for (let m = 0; m < radial; m++) {
      if (flip) buf.tri(center, ids[(m + 1) % radial], ids[m]);
      else buf.tri(center, ids[m], ids[(m + 1) % radial]);
    }
  }
}

/** A flat band of paint along a path, lying on the ground: solid, or dashed (on, off in meters), shifted sideways by `offset`. */
function paintAlong(buf: MeshBuf, path: Vec2[], width: number, y: Height, dash: [number, number] | null, offset = 0) {
  let run = 0;
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s], [bx, by] = path[s + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    const dx = (bx - ax) / L, dy = (by - ay) / L, nx = -dy, ny = dx;
    const steps = Math.max(1, Math.ceil(L / 0.15));
    for (let k = 0; k < steps; k++) {
      const t0 = (k / steps) * L, t1 = ((k + 1) / steps) * L;
      if (dash && (run + (t0 + t1) / 2) % (dash[0] + dash[1]) > dash[0]) continue;
      const corner = (t: number, side: number): number => {
        const x = ax + dx * t + nx * (offset + (side * width) / 2), z = ay + dy * t + ny * (offset + (side * width) / 2);
        return buf.vert(x, y(x, z), z, 0, 1, 0, 0, 0, 1);
      };
      const a = corner(t0, 1), b = corner(t0, -1), c = corner(t1, 1), d = corner(t1, -1);
      buf.triUp(a, b, c);
      buf.triUp(b, d, c);
    }
    run += L;
  }
}

/** Points along a path no farther apart than `step`. */
function densify(path: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s], [bx, by] = path[s + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (path.length) out.push(path[path.length - 1]);
  return out;
}

/** The point halfway along a path. */
function midway(path: Vec2[]): Vec2 {
  const half = polylineLength(path) / 2;
  let run = 0;
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s], [bx, by] = path[s + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (run + L >= half && L > 0) {
      const t = (half - run) / L;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    run += L;
  }
  return path[0];
}

/* ------------------------------------------------------------------ */
/* Equipment                                                            */

interface EquipMats {
  metal: THREE.MeshStandardMaterial;
  galv: THREE.MeshStandardMaterial;
  meter: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  lid: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  pvc: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
}

const equipMats = (): EquipMats => ({
  metal: new THREE.MeshStandardMaterial({ color: '#8f9597', metalness: 0.55, roughness: 0.45 }),
  galv: new THREE.MeshStandardMaterial({ color: '#a7abab', metalness: 0.7, roughness: 0.5 }),
  meter: new THREE.MeshStandardMaterial({ color: '#c9c7bd', metalness: 0.2, roughness: 0.55 }),
  brass: new THREE.MeshStandardMaterial({ color: '#b48a3a', metalness: 0.85, roughness: 0.35 }),
  green: new THREE.MeshStandardMaterial({ color: '#2f5a2c', roughness: 0.75 }),
  lid: new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2c2b', roughness: 0.6 }),
  pvc: new THREE.MeshStandardMaterial({ color: '#ebe9e3', roughness: 0.45 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#e3b41a', roughness: 0.45 }),
  copper: new THREE.MeshStandardMaterial({ color: '#b56b3e', metalness: 0.8, roughness: 0.35 }),
});

/** A simple model of a piece of equipment, front facing down the page, standing on the ground. */
function equipment(pt: UtilityPoint, y0: number, m: EquipMats): THREE.Group {
  const g = new THREE.Group();
  g.name = `utility-${pt.kind}`;
  g.position.set(pt.position[0], y0, pt.position[1]);
  g.rotation.y = (-(pt.rotationDeg ?? 0) * Math.PI) / 180;
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  const rod = (r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, horizontal = false) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
    if (horizontal) {
      o.rotation.z = Math.PI / 2;
      o.position.set(x, y, z);
    } else o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  switch (pt.kind) {
    case 'panel':
    case 'subpanel': {
      const big = pt.kind === 'panel';
      const w = big ? 0.5 : 0.36, h = big ? 0.8 : 0.55, bottom = big ? 0.85 : 0.95;
      box(0.04, 1.85, 0.04, m.galv, -w / 2 + 0.06, 0, -0.08);
      box(0.04, 1.85, 0.04, m.galv, w / 2 - 0.06, 0, -0.08);
      box(w, h, 0.13, m.metal, 0, bottom, 0);
      box(w * 0.9, 0.02, 0.15, m.metal, 0, bottom + h - 0.02, 0.01);
      rod(0.022, bottom, m.dark, 0, 0, -0.01);
      break;
    }
    case 'outlet':
      box(0.09, 0.55, 0.09, m.pvc, 0, 0, 0);
      box(0.12, 0.15, 0.08, m.metal, 0, 0.38, 0.07);
      break;
    case 'transformer':
      box(0.09, 0.75, 0.09, m.galv, 0, 0, -0.06);
      box(0.24, 0.34, 0.15, m.metal, 0, 0.4, 0.05);
      break;
    case 'controller':
      box(0.09, 1.45, 0.09, m.galv, 0, 0, -0.07);
      box(0.25, 0.32, 0.11, m.meter, 0, 1.1, 0.03);
      break;
    case 'gas-meter':
      rod(0.022, 0.55, m.galv, 0, 0, 0);
      box(0.32, 0.36, 0.24, m.meter, 0, 0.5, 0.04);
      rod(0.05, 0.12, m.metal, 0.22, 0.62, 0.04, true);
      break;
    case 'gas-stub':
      rod(0.017, 0.32, m.galv, 0, 0, 0);
      box(0.12, 0.012, 0.03, m.yellow, 0.05, 0.26, 0);
      break;
    case 'backflow':
      rod(0.022, 0.62, m.copper, -0.2, 0, 0);
      rod(0.022, 0.62, m.copper, 0.2, 0, 0);
      rod(0.035, 0.48, m.brass, 0, 0.6, 0, true);
      box(0.12, 0.1, 0.09, m.brass, 0, 0.55, 0);
      box(0.08, 0.012, 0.02, m.yellow, -0.12, 0.66, 0.05);
      box(0.08, 0.012, 0.02, m.yellow, 0.12, 0.66, 0.05);
      break;
    case 'hose-bib':
      rod(0.018, 0.45, m.copper, 0, 0, 0);
      rod(0.02, 0.1, m.brass, 0, 0.42, 0.04, true).rotation.set(Math.PI / 2, 0, 0);
      break;
    case 'stub':
      rod(0.022, 0.3, m.pvc, 0, 0, 0);
      rod(0.028, 0.04, m.pvc, 0, 0.3, 0);
      break;
    case 'valves':
      box(0.52, 0.03, 0.38, m.green, 0, -0.005, 0);
      break;
    case 'water-meter':
      box(0.36, 0.03, 0.56, m.lid, 0, -0.005, 0);
      break;
    case 'junction':
      box(0.28, 0.03, 0.42, m.lid, 0, -0.005, 0);
      break;
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** Height above ground that a run rises to where it reaches a piece of equipment. */
const RISER_TOP: Record<UtilityPoint['kind'], number> = {
  panel: 0.85, subpanel: 0.95, outlet: 0.38, junction: -0.05, transformer: 0.4, 'gas-meter': 0.5, 'gas-stub': 0.3,
  'water-meter': -0.08, backflow: 0.05, controller: 1.1, valves: -0.12, 'hose-bib': 0.4, stub: 0.3,
};

/* ------------------------------------------------------------------ */

interface Dig {
  /** Plan item it is under. */
  id: string;
  cut: Cut;
  /** Paving, synthetic grass: its section. Wall footings: base pad thickness under the buried course. */
  section?: ZoneSection;
  footing?: { width: number; base: number; bury: number; path: Vec2[] };
  polygon?: Vec2[];
  /** The finished surface on top, for the cutaway: thickness above grade and color. */
  surface?: { thickness: number; color: string };
}

const STAGE_LIST = BUILD_STAGES.map((s) => s.id);

/**
 * The utility equipment alone (meters, panels, valves...), which stands in every stage including the finished yard:
 * cheap to build, so the finished yard shows it without building the rest of the construction views.
 */
export function buildEquipment(plan: SitePlan, ground: (p: Vec2) => number): { object: THREE.Group | null; dispose(): void } {
  const points = plan.utilities?.points ?? [];
  if (!points.length) return { object: null, dispose() {} };
  const mats = equipMats();
  const grp = new THREE.Group();
  grp.name = 'utility-equipment';
  for (const p of points) grp.add(equipment(p, ground(p.position), mats));
  return {
    object: grp,
    dispose() {
      Object.values(mats).forEach((m) => m.dispose());
      grp.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

/** `withEquipment` false leaves the utility equipment out (the caller shows it from buildEquipment). */
export function buildConstruction(plan: SitePlan, ground: (p: Vec2) => number, quality: Quality, withEquipment = true): ConstructionBuild {
  const root = new THREE.Group();
  root.name = 'construction';
  const disposables: { dispose(): void }[] = [];
  const parts: Partial<Record<'paint' | 'pitA' | 'pitB' | 'pipes' | 'stripsIn' | 'stripsOut' | 'base' | 'bed' | 'equipment', THREE.Object3D>> = {};
  const labels: StageLabel[] = [];
  const H: Height = (x, z) => ground([x, z]);
  const lines = plan.utilities?.lines ?? [];
  const points = plan.utilities?.points ?? [];

  // What gets dug: paving and synthetic grass to subgrade, wall footings, and trenches.
  const digs: Dig[] = [];
  for (const z of plan.zones) {
    const section = zoneSection(z);
    if (!section) continue;
    const spec = materialById.get(z.catalogId);
    const surface = z.kind === 'turf' ? { thickness: 1.25 * IN, color: spec?.palette[1] ?? '#5c8f30' } : { thickness: spec?.thickness ?? 0.07, color: spec?.palette[0] ?? '#a3a09a' };
    digs.push({ id: z.id, cut: { depth: section.depth, poly: new PolygonIndex(z.polygon) }, section, polygon: z.polygon, surface });
  }
  for (const l of plan.lines) {
    if (l.kind !== 'wall') continue;
    // A segmental wall's leveling pad: 6 in of base, 6 in wider than the block on each side, under a buried course
    // (an eighth of the wall height, 6 in at least).
    const path = lineCenter(l, plan.zones);
    if (path.length < 2) continue;
    const width = lineThickness(l) + 12 * IN, base = 6 * IN, bury = Math.max(6 * IN, l.height / 8);
    digs.push({ id: l.id, cut: { depth: base + bury, path, half: width / 2 }, footing: { width, base, bury, path } });
  }
  const trenches = lines.map((line) => ({ line, spec: trenchSpec(line), cut: null as unknown as Cut }));
  for (const t of trenches) t.cut = { depth: t.spec.depth, path: t.line.points, half: t.spec.width / 2 };

  // The grid: every cut's box, about 1 in a cell (coarser on a very large site, and in draft quality).
  const boxes: Bounds[] = [
    ...digs.map((d) => (d.cut.poly ? d.cut.poly.box : pad(bounds(d.cut.path!), d.cut.half!))),
    ...trenches.map((t) => pad(bounds(t.line.points), t.spec.width / 2)),
  ];
  let cut: ConstructionBuild['cut'] = null;
  if (boxes.length) {
    const all = pad({ minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)), maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)) }, 0.25);
    const w = all.maxX - all.minX, h = all.maxY - all.minY;
    const c = Math.max(quality === 'draft' ? 0.04 : 0.025, w / 2047, h / 2047, Math.sqrt((w * h) / 3.2e6));
    const g = new Grid(all.minX, all.minY, c, Math.ceil(w / c) + 1, Math.ceil(h / c) + 1);

    const cutTex = buildLayerTextures('cut');
    // Pushed back a hair, so a house wall standing on the edge of a dig wins where the two meet.
    const pitMat = new THREE.MeshStandardMaterial({ map: cutTex.map, normalMap: cutTex.normalMap, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    disposables.push(pitMat);
    // Deeper soil is darker and damper.
    const pitShade = (x: number, z: number, y: number) => 1 - 0.38 * Math.min(1, Math.max(0, (H(x, z) - y) / 0.7));

    const buildPit = (cuts: Cut[], name: string): { mesh: THREE.Mesh | null; union: Float32Array } => {
      const levels: number[] = [];
      for (const d of [...cuts.map((k) => k.depth)].sort((a, b) => a - b)) if (!levels.length || d - levels[levels.length - 1] > 0.003) levels.push(d);
      const fieldAt = (d: number) => {
        const F = g.field();
        for (const k of cuts) if (k.depth >= d - 0.003) g.add(F, k);
        return F;
      };
      const buf = new MeshBuf();
      const union = fieldAt(levels[0]);
      let Fk = union;
      const G = new Float32Array(g.nx * g.ny);
      for (let k = 0; k < levels.length; k++) {
        const above = k ? levels[k - 1] : 0, d = levels[k];
        const Fn = k + 1 < levels.length ? fieldAt(levels[k + 1]) : null;
        wallRegion(g, Fk, buf, (x, z) => H(x, z) - above, (x, z) => H(x, z) - d, cutTex.tileMeters, pitShade);
        if (Fn) for (let q = 0; q < G.length; q++) G[q] = Math.max(Fk[q], -Fn[q]);
        fillRegion(g, Fn ? G : Fk, buf, (x, z) => H(x, z) - d, cutTex.tileMeters, pitShade, Fk);
        if (Fn) Fk = Fn;
      }
      if (buf.empty) return { mesh: null, union };
      const mesh = new THREE.Mesh(buf.geometry(), pitMat);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      disposables.push(mesh.geometry);
      root.add(mesh);
      return { mesh, union };
    };

    const cutsA = digs.map((d) => d.cut), cutsB = [...cutsA, ...trenches.map((t) => t.cut)];
    const empty = g.field();
    const pitA = cutsA.length ? buildPit(cutsA, 'pit-excavation') : { mesh: null, union: empty };
    const pitB = trenches.length ? buildPit(cutsB, 'pit-trenches') : pitA;
    if (pitA.mesh) parts.pitA = pitA.mesh;
    if (pitB.mesh) parts.pitB = pitB.mesh;

    // The ground opening, as an encoded distance map lined up with the grid points.
    const data = new Uint8Array(g.nx * g.ny * 2);
    const enc = (v: number) => Math.round(Math.max(0, Math.min(1, 0.5 + v / (2 * g.band))) * 255);
    for (let q = 0; q < g.nx * g.ny; q++) {
      data[q * 2] = enc(pitA.union[q]);
      data[q * 2 + 1] = enc(pitB.union[q]);
    }
    const tex = new THREE.DataTexture(data, g.nx, g.ny, THREE.RGFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    disposables.push(tex);
    cut = { texture: tex, box: new THREE.Vector4(g.x0 - c / 2, g.y0 - c / 2, g.nx * c, g.ny * c) };

    // How deep the excavation is at a point (0 outside every dig).
    const digDepth = (x: number, z: number) => {
      let d = 0;
      for (const dg of digs) {
        if (dg.cut.depth <= d) continue;
        if (dg.cut.poly ? dg.cut.poly.contains(x, z) : distToPath(x, z, dg.cut.path!) < dg.cut.half!) d = dg.cut.depth;
      }
      return d;
    };

    // Trench backfill: compacted spoil, flush with the dig floor or the ground.
    if (trenches.length) {
      const fillTex = buildLayerTextures('backfill');
      const fillMat = new THREE.MeshStandardMaterial({ map: fillTex.map, normalMap: fillTex.normalMap, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      disposables.push(fillMat);
      const T = g.field();
      for (const t of trenches) g.add(T, t.cut);
      const inBuf = new MeshBuf();
      fillRegion(g, T, inBuf, (x, z) => H(x, z) - digDepth(x, z) + 0.004, fillTex.tileMeters, () => 0.95);
      const out = new Float32Array(T.length);
      for (let q = 0; q < out.length; q++) out[q] = Math.max(T[q], -pitA.union[q]);
      const outBuf = new MeshBuf();
      fillRegion(g, out, outBuf, (x, z) => H(x, z) + 0.004, fillTex.tileMeters, () => 0.95);
      for (const [key, buf] of [['stripsIn', inBuf], ['stripsOut', outBuf]] as const) {
        if (buf.empty) continue;
        const mesh = new THREE.Mesh(buf.geometry(), fillMat);
        mesh.name = `trench-backfill-${key === 'stripsIn' ? 'all' : 'outside'}`;
        mesh.receiveShadow = true;
        disposables.push(mesh.geometry);
        root.add(mesh);
        parts[key] = mesh;
      }
    }

    // Base rock and the bedding layer, area by area (later areas a hair higher, so they win where they overlap).
    const layerMats = new Map<BuildLayer, { mat: THREE.MeshStandardMaterial; tile: number }>();
    const layerMat = (kind: BuildLayer) => {
      let lm = layerMats.get(kind);
      if (!lm) {
        const t = buildLayerTextures(kind);
        lm = { mat: new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 1, vertexColors: true }), tile: t.tileMeters };
        disposables.push(lm.mat);
        layerMats.set(kind, lm);
      }
      return lm;
    };
    const slabs: Record<'base' | 'bed', Map<SectionLayerKind, MeshBuf>> = { base: new Map(), bed: new Map() };
    const slabBuf = (group: 'base' | 'bed', kind: SectionLayerKind) => {
      let b = slabs[group].get(kind);
      if (!b) slabs[group].set(kind, (b = new MeshBuf()));
      return b;
    };
    digs.forEach((dg, n) => {
      const lift = n * 0.0006;
      if (dg.section && dg.polygon) {
        for (const layer of dg.section.layers) {
          const buf = slabBuf(layer.kind === 'base' ? 'base' : 'bed', layer.kind);
          const tile = layerMat(layer.kind).tile;
          const contour = dg.polygon.map(([x, z]) => new THREE.Vector2(x, z));
          const tris = THREE.ShapeUtils.triangulateShape(contour, []);
          const ids = dg.polygon.map(([x, z]) => {
            const y = H(x, z) - layer.top + lift;
            return buf.vert(x, y, z, 0, 1, 0, x / tile, z / tile, 1);
          });
          for (const [a, b, c2] of tris) buf.triUp(ids[a], ids[b], ids[c2]);
        }
      } else if (dg.footing) {
        const F = g.field();
        g.add(F, dg.cut);
        const tile = layerMat('base').tile;
        fillRegion(g, F, slabBuf('base', 'base'), (x, z) => H(x, z) - dg.footing!.bury + lift, tile, () => 1);
      }
    });
    for (const group of ['base', 'bed'] as const) {
      const grp = new THREE.Group();
      grp.name = group === 'base' ? 'base-rock' : 'bedding';
      for (const [kind, buf] of slabs[group]) {
        if (buf.empty) continue;
        const mesh = new THREE.Mesh(buf.geometry(), layerMat(kind).mat);
        mesh.receiveShadow = true;
        disposables.push(mesh.geometry);
        grp.add(mesh);
      }
      if (grp.children.length) {
        root.add(grp);
        parts[group] = grp;
      }
    }
  }

  // Pipes, conduit and cable in the open trenches, with tracer wire on plastic gas pipe and risers to equipment.
  if (trenches.length) {
    const grp = new THREE.Group();
    grp.name = 'pipes';
    const bufs = new Map<string, MeshBuf>();
    const bufFor = (key: string) => {
      let b = bufs.get(key);
      if (!b) bufs.set(key, (b = new MeshBuf()));
      return b;
    };
    for (const { line, spec } of trenches) {
      const route = densify(line.points, 0.3);
      for (const pr of spec.runs) {
        const path = route.map(([x, z]) => new THREE.Vector3(x, H(x, z) - pr.center, z));
        tubeAlong(bufFor(pr.run.kind), path, pr.run.od / 2, pr.run.od > 0.02 ? 10 : 6);
        if (pr.run.tracer) tubeAlong(bufFor('tracer'), path.map((p) => p.clone().setY(p.y + pr.run.od / 2 + 0.0015)), 0.0012, 4);
        // A riser where the run reaches a piece of equipment.
        for (const end of [line.points[0], line.points[line.points.length - 1]]) {
          const near = points.find((p) => Math.hypot(p.position[0] - end[0], p.position[1] - end[1]) < 0.9);
          if (!near) continue;
          const top = H(end[0], end[1]) + RISER_TOP[near.kind];
          const bottom = H(end[0], end[1]) - pr.center;
          if (top - bottom < 0.05) continue;
          tubeAlong(bufFor(pr.run.kind), [new THREE.Vector3(end[0], bottom, end[1]), new THREE.Vector3(end[0], top, end[1])], pr.run.od / 2, 10);
        }
      }
    }
    for (const [key, buf] of bufs) {
      const look = key === 'tracer' ? { color: '#c06a35', roughness: 0.35 } : UTILITY_PIPE[key as keyof typeof UTILITY_PIPE];
      const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: look.roughness, metalness: key === 'tracer' ? 0.8 : 0 });
      const mesh = new THREE.Mesh(buf.geometry(), mat);
      mesh.name = `pipe-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      disposables.push(mesh.geometry, mat);
      grp.add(mesh);
    }
    root.add(grp);
    parts.pipes = grp;
  }

  // Marking paint for demo and layout: white around every dig, each trench in its APWA color (dashed).
  {
    const white = new MeshBuf();
    const colored = new Map<string, MeshBuf>();
    const lift = (x: number, z: number) => H(x, z) + 0.005;
    for (const dg of digs) {
      if (dg.polygon) paintAlong(white, [...dg.polygon, dg.polygon[0]], 0.05, lift, null);
      else if (dg.footing) {
        paintAlong(white, dg.footing.path, 0.05, lift, null, dg.footing.width / 2);
        paintAlong(white, dg.footing.path, 0.05, lift, null, -dg.footing.width / 2);
      }
    }
    for (const { line, spec } of trenches) {
      const kinds = [...new Set(spec.runs.map((r) => r.run.kind))];
      kinds.forEach((k, n) => {
        const color = UTILITY_PAINT[k];
        let b = colored.get(color);
        if (!b) colored.set(color, (b = new MeshBuf()));
        paintAlong(b, line.points, 0.05, lift, [0.45, 0.2], (n - (kinds.length - 1) / 2) * 0.09);
      });
    }
    const grp = new THREE.Group();
    grp.name = 'marking-paint';
    const add = (buf: MeshBuf, color: string) => {
      if (buf.empty) return;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const mesh = new THREE.Mesh(buf.geometry(), mat);
      mesh.receiveShadow = true;
      disposables.push(mesh.geometry, mat);
      grp.add(mesh);
    };
    add(white, '#cfccc4');
    for (const [color, buf] of colored) add(buf, color);
    if (grp.children.length) {
      root.add(grp);
      parts.paint = grp;
    }
  }

  // Equipment, in every stage.
  if (points.length && withEquipment) {
    const mats = equipMats();
    disposables.push(...Object.values(mats));
    const grp = new THREE.Group();
    grp.name = 'utility-equipment';
    for (const p of points) grp.add(equipment(p, H(p.position[0], p.position[1]), mats));
    root.add(grp);
    parts.equipment = grp;
    disposables.push({ dispose: () => grp.traverse((o) => (o as THREE.Mesh).geometry?.dispose()) });
  }

  /* ---------------- Labels and notes ---------------- */

  const at = (p: Vec2, up = 0.05) => new THREE.Vector3(p[0], H(p[0], p[1]) + up, p[1]);
  const sqft = (m2: number) => `${Math.round(m2 * 10.7639).toLocaleString('en-US')} sq ft`;
  for (const p of points) labels.push({ stages: ['demo'], at: at(p.position, 0.6), title: p.label || UTILITY_POINT_NAME[p.kind], kind: 'point' });
  for (const { line, spec } of trenches) {
    const mid = midway(line.points);
    const len = fmtFeet(polylineLength(line.points));
    const joint = spec.runs.length > 1;
    labels.push({
      stages: ['demo'],
      at: at(mid),
      title: trenchName(line),
      sub: `${spec.runs.map((r) => r.run.label).join(' + ')} · ${len}`,
      kind: 'trench',
    });
    labels.push({
      stages: ['trench'],
      at: at(mid, -spec.depth + 0.05),
      title: joint ? `Joint trench · ${trenchName(line)}` : `${trenchName(line)} · ${spec.runs[0].run.label}`,
      sub: joint
        ? `${spec.runs.map((r) => `${UTILITY_KIND_NAME[r.run.kind]} ${inches(r.cover)}`).join(' · ')} cover · ${inches(spec.gap)} apart · ${len}`
        : `${inches(spec.runs[0].cover)} cover · ${inches(spec.depth)} deep · ${len}`,
      kind: 'trench',
    });
    labels.push({ stages: ['backfill'], at: at(mid), title: `${trenchName(line)} backfilled`, sub: len, kind: 'trench' });
  }
  for (const dg of digs) {
    if (dg.section && dg.polygon) {
      const a = area(dg.polygon);
      const c = centroidOf(dg.polygon);
      labels.push({ stages: ['excavate'], at: at(c, -dg.section.depth + 0.05), title: `${dg.section.surface} · dig ${inches(dg.section.depth)}`, sub: sqft(a), kind: 'area' });
      for (const layer of dg.section.layers) {
        const th = layer.bottom - layer.top;
        labels.push({
          stages: layer.kind === 'base' ? ['base'] : ['bedding'],
          at: at(c, -layer.top + 0.05),
          title: `${layer.name} · ${inches(th)}`,
          sub: `${dg.section.surface} · ${cuyd(a * th)}`,
          kind: 'area',
        });
      }
    } else if (dg.footing) {
      const mid = midway(dg.footing.path);
      labels.push({ stages: ['excavate'], at: at(mid, -dg.cut.depth + 0.05), title: 'Wall footing', sub: `${inches(dg.footing.width)} wide · ${inches(dg.cut.depth)} deep`, kind: 'area' });
      labels.push({ stages: ['base', 'bedding'], at: at(mid, -dg.footing.bury + 0.05), title: `Base pad · ${inches(dg.footing.base)}`, sub: `Under the buried course (${inches(dg.footing.bury)})`, kind: 'area' });
    }
  }

  const notes = stageNotes(digs, trenches.map((t) => ({ line: t.line, spec: t.spec })), points.length);

  /* ---------------- Cutaway face ---------------- */

  const siteBox = pad(bounds(plan.site.boundary), 4);
  const deepest = Math.max(0.9, ...digs.map((d) => d.cut.depth), ...trenches.map((t) => t.spec.depth)) + 0.6;
  const sectionMats = new Map<string, THREE.MeshStandardMaterial>();
  const sectionMat = (key: string): { mat: THREE.MeshStandardMaterial; tile: number } => {
    const layer = key === 'soil' || key === 'fill' ? 'cut' : key === 'backfill' || key === 'base' || key === 'sand' || key === 'fines' ? key : null;
    const tile = layer ? buildLayerTextures(layer).tileMeters : 1;
    let mat = sectionMats.get(key);
    if (!mat) {
      if (layer) {
        const t = buildLayerTextures(layer);
        mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 1, side: THREE.DoubleSide, color: key === 'soil' ? '#d9cfc2' : '#ffffff' });
      } else mat = new THREE.MeshStandardMaterial({ color: key, roughness: 0.85, side: THREE.DoubleSide });
      sectionMats.set(key, mat);
      disposables.push(mat);
    }
    return { mat, tile };
  };
  const trenchCuts = trenches.map((t) => ({ ...t, box: pad(bounds(t.line.points), t.spec.width / 2) }));

  const section = (stage: BuildStage, plane: THREE.Plane): THREE.Group | null => {
    const nl = Math.hypot(plane.normal.x, plane.normal.z);
    if (nl < 1e-6) return null;
    const nx = plane.normal.x / nl, nz = plane.normal.z / nl;
    const o = plane.coplanarPoint(new THREE.Vector3());
    const tx = nz, tz = -nx;
    // The stretch of the slice line inside the site and its margin.
    let s0 = -Infinity, s1 = Infinity;
    for (const [oo, tt, lo, hi] of [[o.x, tx, siteBox.minX, siteBox.maxX], [o.z, tz, siteBox.minY, siteBox.maxY]]) {
      if (Math.abs(tt) < 1e-9) {
        if (oo < lo || oo > hi) return null;
        continue;
      }
      const a = (lo - oo) / tt, b = (hi - oo) / tt;
      s0 = Math.max(s0, Math.min(a, b));
      s1 = Math.min(s1, Math.max(a, b));
    }
    if (!(s1 > s0 + 0.1)) return null;
    const order = STAGE_LIST.indexOf(stage);
    const N = Math.min(4000, Math.ceil((s1 - s0) / 0.02) + 1);
    const K = 5; // soil, backfill, base, bedding, surface
    const bot = new Float32Array(N * K), top = new Float32Array(N * K);
    const sub: string[] = new Array(N * K).fill('');
    const X = new Float32Array(N), Z = new Float32Array(N), S = new Float32Array(N);
    const lift = 0.003;
    for (let i = 0; i < N; i++) {
      const sv = s0 + ((s1 - s0) * i) / (N - 1);
      const x = o.x + tx * sv + nx * lift, z = o.z + tz * sv + nz * lift;
      X[i] = x;
      Z[i] = z;
      S[i] = sv;
      const h = H(x, z);
      let dig: Dig | null = null;
      for (const dg of digs) {
        if (dig && dg.cut.depth < dig.cut.depth) continue;
        if (dg.cut.poly ? dg.cut.poly.contains(x, z) : distToPath(x, z, dg.cut.path!) < dg.cut.half!) dig = dg;
      }
      let tr: (typeof trenchCuts)[number] | null = null;
      for (const t of trenchCuts) {
        if (x < t.box.minX || x > t.box.maxX || z < t.box.minY || z > t.box.maxY) continue;
        if ((!tr || t.spec.depth > tr.spec.depth) && distToPath(x, z, t.line.points) < t.spec.width / 2) tr = t;
      }
      const digD = dig ? dig.cut.depth : 0;
      let y = h - deepest;
      const put = (k: number, to: number, kind: string) => {
        const q = i * K + k;
        bot[q] = y;
        if (to > y) y = to;
        top[q] = y;
        sub[q] = kind;
      };
      let soil = h;
      if (order >= 1) soil = h - digD;
      if (order >= 2 && tr) soil = Math.min(soil, h - tr.spec.depth);
      put(0, soil, 'soil');
      put(1, order >= 3 && tr ? h - digD : y, 'backfill');
      const base = dig?.section?.layers.find((l) => l.kind === 'base');
      const bed = dig?.section?.layers.find((l) => l.kind !== 'base');
      put(2, order >= 4 ? (base ? h - base.top : dig?.footing ? h - dig.footing.bury : y) : y, 'base');
      put(3, order >= 5 && bed ? h - bed.top : y, bed?.kind ?? 'sand');
      if (order >= 6 && dig?.surface) put(4, h + dig.surface.thickness, dig.surface.color);
      else if (order >= 6 && dig?.footing) put(4, h, 'fill');
      else put(4, y, 'fill');
    }
    const grp = new THREE.Group();
    grp.name = 'cutaway';
    grp.userData.noClip = true;
    // Labels on the face: each layer once per stretch (at its middle), and each pipe where it is cut.
    const faceLabels: StageLabel[] = [];
    const LAYER_NAME: Record<string, string> = { backfill: 'Backfill', base: 'Class II base', sand: 'Bedding sand', fines: 'Leveling fines' };
    for (let k = 1; k <= 3; k++) {
      let start = -1;
      for (let i = 0; i <= N; i++) {
        const q = i * K + k;
        const on = i < N && top[q] - bot[q] > 0.008;
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          const len = (i - start) * ((s1 - s0) / (N - 1));
          if (len > 0.35) {
            const m = Math.floor((start + i - 1) / 2), qm = m * K + k;
            const name = LAYER_NAME[sub[qm]] ?? sub[qm];
            faceLabels.push({ stages: [stage], at: new THREE.Vector3(X[m], (bot[qm] + top[qm]) / 2, Z[m]), title: `${name} · ${inches(top[qm] - bot[qm])}`, kind: 'area' });
          }
          start = -1;
        }
      }
    }
    const bufs = new Map<string, MeshBuf>();
    const nrm = [-nx, 0, -nz];
    for (let k = 0; k < K; k++) {
      for (let i = 0; i + 1 < N; i++) {
        const a = i * K + k, b = (i + 1) * K + k;
        if (top[a] - bot[a] < 1e-4 && top[b] - bot[b] < 1e-4) continue;
        const key = sub[a] || sub[b];
        let buf = bufs.get(key);
        if (!buf) bufs.set(key, (buf = new MeshBuf()));
        const tile = sectionMat(key).tile;
        const v = (j: number, yy: number) => buf!.vert(X[j], yy, Z[j], nrm[0], 0, nrm[2], S[j] / tile, yy / tile, 1);
        const p = v(i, bot[a]), q = v(i, top[a]), r = v(i + 1, top[b]), w = v(i + 1, bot[b]);
        buf.tri(p, q, r);
        buf.tri(p, r, w);
      }
    }
    // Pipes where the slice crosses them: a ring in the pipe's color around a dark bore (cable is solid).
    if (order >= 2) {
      const ring = new Map<string, MeshBuf>();
      for (const { line, spec } of trenches) {
        const pts = line.points;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
          const da = (ax - o.x) * nx + (az - o.z) * nz, db = (bx - o.x) * nx + (bz - o.z) * nz;
          if (da > 0 === db > 0 || da === db) continue;
          const f = da / (da - db);
          const qx = ax + (bx - ax) * f, qz = az + (bz - az) * f;
          const L = Math.hypot(bx - ax, bz - az) || 1;
          const stretch = 1 / Math.max(0.3, Math.abs(((bx - ax) * nx + (bz - az) * nz) / L));
          for (const pr of spec.runs) {
            const r = pr.run.od / 2, cy = H(qx, qz) - pr.center;
            faceLabels.push({
              stages: [stage],
              at: new THREE.Vector3(qx + tx * 0.32, cy, qz + tz * 0.32),
              title: `${UTILITY_KIND_NAME[pr.run.kind]} · ${inches(pr.cover)} cover`,
              sub: pr.run.label,
              kind: 'trench',
            });
            const cx = qx + nx * lift * 0.5, cz = qz + nz * lift * 0.5;
            const solid = pr.run.od < 0.015;
            const disk = (key: string, r0: number, r1: number) => {
              let buf = ring.get(key);
              if (!buf) ring.set(key, (buf = new MeshBuf()));
              const seg = 20;
              const pt = (th: number, rr: number) => buf!.vert(cx + tx * Math.cos(th) * rr * stretch, cy + Math.sin(th) * rr, cz + tz * Math.cos(th) * rr * stretch, nrm[0], 0, nrm[2], 0, 0, 1);
              for (let m = 0; m < seg; m++) {
                const t0 = (m / seg) * Math.PI * 2, t1 = ((m + 1) / seg) * Math.PI * 2;
                const a = pt(t0, r1), b = pt(t1, r1), c2 = pt(t1, r0), d = pt(t0, r0);
                buf.tri(a, b, c2);
                buf.tri(a, c2, d);
              }
            };
            disk(UTILITY_PIPE[pr.run.kind].color, solid ? 0 : r * 0.76, r);
            if (!solid) disk('#151515', 0, r * 0.76);
            if (pr.run.tracer) disk('#c06a35', 0, 0.0022);
          }
        }
      }
      for (const [color, buf] of ring) bufs.set(`pipe:${color}`, buf);
    }
    const made: THREE.BufferGeometry[] = [];
    for (const [key, buf] of bufs) {
      if (buf.empty) continue;
      const mat = key.startsWith('pipe:') ? sectionMat(key.slice(5)).mat : sectionMat(key).mat;
      const mesh = new THREE.Mesh(buf.geometry(), mat);
      mesh.userData.noClip = true;
      mesh.receiveShadow = true;
      made.push(mesh.geometry);
      grp.add(mesh);
    }
    grp.userData.dispose = () => made.forEach((g) => g.dispose());
    grp.userData.labels = faceLabels;
    return grp.children.length ? grp : null;
  };

  const show = (stage: BuildStage) => {
    const on: Record<keyof typeof parts, BuildStage[]> = {
      paint: ['demo'],
      pitA: ['excavate', 'backfill', 'base', 'bedding'],
      pitB: ['trench'],
      pipes: ['trench'],
      stripsIn: ['backfill'],
      stripsOut: ['base', 'bedding'],
      base: ['base', 'bedding'],
      bed: ['bedding'],
      equipment: STAGE_LIST,
    };
    for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
      const o = parts[key];
      if (o) o.visible = on[key].includes(stage);
    }
    // The same mesh serves both pits when nothing is trenched.
    if (parts.pitA && parts.pitA === parts.pitB) parts.pitA.visible = on.pitA.includes(stage) || on.pitB.includes(stage);
  };
  show('finished');

  return {
    object: root,
    cut,
    labels,
    notes,
    setStage: show,
    section,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function pad(b: Bounds, r: number): Bounds {
  return { minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r };
}

function distToPath(x: number, y: number, path: Vec2[]): number {
  let best = Infinity;
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s], [bx, by] = path[s + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** A point inside the polygon near its middle (the box center when that is inside, else the inside point nearest it). */
function centroidOf(poly: Vec2[]): Vec2 {
  const b = bounds(poly);
  const c: Vec2 = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const idx = new PolygonIndex(poly);
  if (idx.contains(c[0], c[1])) return c;
  let best = poly[0], bd = Infinity;
  const step = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 24;
  for (let y = b.minY + step / 2; y < b.maxY; y += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      if (!idx.contains(x, y)) continue;
      const d = Math.hypot(x - c[0], y - c[1]);
      if (d < bd) {
        bd = d;
        best = [x, y];
      }
    }
  }
  return best;
}

function stageNotes(digs: Dig[], trenches: { line: UtilityLine; spec: TrenchSpec }[], equipment: number): Record<BuildStage, string> {
  const list = (items: string[]) => [...new Set(items)].join(', ');
  const surfaces = digs.filter((d) => d.section).map((d) => d.section!);
  const footing = digs.find((d) => d.footing)?.footing;
  const kinds = [...new Set(trenches.flatMap((t) => t.spec.runs.map((r) => r.run.kind)))];
  const paint = kinds.length ? ` Trench routes in APWA marking colors (${list(kinds.map((k) => `${UTILITY_PAINT_NAME[k]} ${UTILITY_KIND_NAME[k].toLowerCase()}`))}).` : '';
  const covers = list(trenches.flatMap((t) => t.spec.runs.map((r) => {
    const own = `${UTILITY_KIND_NAME[r.run.kind]} ${inches(r.run.cover)}${r.run.code ? ` (${r.run.code})` : ''}`;
    return r.cover > r.run.cover + 0.003 ? `${own}, lowered to ${inches(r.cover)} (joint trench)` : own;
  })));
  const joint = trenches.find((t) => t.spec.runs.length > 1);
  const area = (k: SectionLayerKind) => list(surfaces.flatMap((s) => s.layers.filter((l) => l.kind === k).map((l) => `${inches(l.bottom - l.top)} under ${s.surface.toLowerCase()}`)));
  const base = area('base'), sand = area('sand'), fines = area('fines');
  return {
    demo: `Old surfaces removed and the site cleared, then laid out: white paint around every dig.${paint}${equipment ? ' Equipment marked where runs start and end.' : ''} Call 811 at least two working days before digging.`,
    excavate: surfaces.length || footing
      ? `Dug to subgrade: ${list([...surfaces.map((s) => `${s.surface.toLowerCase()} ${inches(s.depth)}`), ...(footing ? [`wall footings ${inches(footing.width)} wide × ${inches(footing.base + footing.bury)}`] : [])])}. Subgrade compacted.`
      : 'No paving or synthetic grass areas to dig out in this plan.',
    trench: trenches.length
      ? `Trenches open with the pipes in. Cover is the top of the pipe to finished grade: ${covers}.${joint ? ` Joint trench: runs stacked ${inches(joint.spec.gap)} apart.` : ''} Check local amendments with the building department.`
      : 'No utility routes in this plan. Draw irrigation, gas, electrical or lighting lines in Area Planner to see their trenches.',
    backfill: trenches.length
      ? `After inspection, trenches backfilled and compacted in lifts.${trenches.some((t) => t.spec.runs.some((r) => r.run.tracer)) ? ' Plastic gas pipe keeps its 18 AWG tracer wire.' : ''}`
      : 'No trenches to backfill.',
    base: base ? `Class II road base, compacted: ${base}.${footing ? ` Wall footings: ${inches(footing.base)} base pad.` : ''}` : footing ? `Wall footings: ${inches(footing.base)} base pad.` : 'No base rock in this plan.',
    bedding: sand || fines ? list([...(sand ? [`Bedding sand ${sand}`] : []), ...(fines ? [`leveling fines ${fines}`] : [])]) + '.' : 'No bedding layer in this plan.',
    finished: 'The finished yard.',
  };
}

const UTILITY_PAINT_NAME: Record<keyof typeof UTILITY_PAINT, string> = {
  electrical: 'red', lighting: 'red', gas: 'yellow', irrigation: 'purple', water: 'blue', drain: 'green',
};

