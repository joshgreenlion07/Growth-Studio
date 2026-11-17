import { clamp01, vnoise } from './noise';

/**
 * The relief of a bed of spread black humus, shared by the ground texture (surfaces.ts, painted in the texture worker)
 * and the 3D bed surface (builder/humus.ts), so the two always agree.
 *
 * - clodField: the clods themselves, one seamless tile CLOD_TILE meters square: soft, irregular lumps of 1-5 cm touching
 *   and overlapping, smaller crumbs between and on them, and here and there a loose heap a hand across, over fine,
 *   velvety soil.
 * - macroHeight: the larger lie of the spread fill in world meters (shovel and rake heaps, small ridges and hollows, a few
 *   higher mounds), not tiled. builder/humus.ts bakes it into each bed's base texture, and places loose pieces on it.
 */

export const CLOD_TILE = 1.6;
/** The clod relief spans 0 to this many meters. */
export const CLOD_MAX = 0.034;

/** Smooth maximum (k in meters): overlapping clods merge with a soft crease, not a hard line. */
function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (a - b)) / k);
  return b + (a - b) * h + k * h * (1 - h);
}

/**
 * Lumps on a jittered grid of `cells` per tile (seamless): every lump within reach is summed by a soft maximum, so the
 * field is continuous across cell borders (the nearest-cell Voronoi is not: a lump wider than its cell would end in a
 * step). Each lump has its own id in [0, 1); `shape` gives its radius (cell units, at most 0.6) and height, or null for
 * none.
 */
function lumps(u: number, v: number, cells: number, seed: number, shape: (id: number) => [number, number] | null): { h: number; id: number } {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  let h = 0, id = -1, best = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      // Reach is at most 0.6 cell: most neighbors are out of it, so test the distance before anything else.
      const px = cx + 0.5 + (cellHash(wx, wy, seed) - 0.5) * 0.9, py = cy + 0.5 + (cellHash(wx, wy, seed + 9) - 0.5) * 0.9;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (d2 >= 0.36) continue;
      const lid = cellHash(wx, wy, seed + 31);
      const sh = shape(lid);
      if (!sh) continue;
      const t = 1 - d2 / (sh[0] * sh[0]);
      if (t <= 0) continue;
      // t^1.25: a soft, gently shouldered lump.
      const k = t * Math.sqrt(Math.sqrt(t)) * sh[1];
      if (k > best) {
        best = k;
        id = lid;
      }
      h = smax(h, k, 0.0025);
    }
  }
  return { h, id };
}
function cellHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface ClodSample {
  /** Height, meters, 0..CLOD_MAX. */
  h: number;
  /** 1 on an exposed clod top, toward 0 down in the fines between: for soft shading in the color. */
  top: number;
  /** Which big clod (0..1, for its tone), or -1 in the fines. */
  id: number;
}

/** A fill's relief: how much is clods (0..1), their size (1 = 3-5 cm). See CrumbSpec.style. */
export interface ClodStyle {
  clods: number;
  scale: number;
}
const PLAIN: ClodStyle = { clods: 1, scale: 1 };
/** Cells per tile for a lump layer of `n` cells at size 1, at this size (whole, so the tile stays seamless). */
const cellsAt = (n: number, scale: number) => Math.max(4, Math.round(n / scale));

/** The clod relief at (u, v), both in [0, 1) across one CLOD_TILE, for a fill's style. Seamless. */
export function clodField(u: number, v: number, st: ClodStyle = PLAIN): ClodSample {
  const k = Math.min(1.3, st.scale);
  // Warp so no clod is round: gently (a steep warp folds the lumps into ripples).
  const wu = u + (vnoise(u * 24, v * 24, 24, 51) - 0.5) * 0.012, wv = v + (vnoise(u * 24 + 7.3, v * 24 + 3.1, 24, 52) - 0.5) * 0.012;
  // (Nothing finer than ~4 texels of the 1024 px ground texture: finer noise moirés into stripes.)
  const skin = (vnoise(u * 160, v * 160, 160, 54) - 0.5) * 0.0008;
  // Some stretches are mostly clods, others mostly fines, as a shovelful lands.
  const region = vnoise(u * 4, v * 4, 4, 68) * 0.6 + vnoise(u * 9, v * 9, 9, 69) * 0.4;
  // Lumpy, not domed: each clod's top broken up by its own swells.
  const lumpy = 0.75 + 0.25 * vnoise(u * 45, v * 45, 45, 70);
  // Big clods, 3-5 cm, in two overlapping layers so they touch and pile; middling ones, 1.5-2.5 cm; crumbs.
  // Fewer clods (a finer, more powdery fill) raise every cut.
  const few = (cut: number) => 1 - (1 - cut) * st.clods;
  const bigCut = few(0.12 + 0.6 * (1 - region) ** 1.5), big2Cut = few(0.45 + 0.5 * (1 - region)), midCut = few(0.2);
  const b = lumps(wu, wv, cellsAt(34, st.scale), 55, (id) => (id > bigCut ? [0.36 + 0.22 * id, (0.007 + 0.011 * id) * k] : null));
  const b2 = lumps(wu + 0.21, wv + 0.43, cellsAt(26, st.scale), 67, (id) => (id > big2Cut ? [0.32 + 0.2 * id, (0.007 + 0.01 * id) * k] : null));
  const m = lumps(wu + 0.37, wv + 0.11, cellsAt(78, st.scale), 56, (id) => (id > midCut ? [0.32 + 0.26 * id, (0.0035 + 0.005 * id) * k] : null));
  const s1 = lumps(wu, wv, 100, 57, (id) => [0.38 + 0.22 * id, 0.0012 + 0.0024 * id]);
  const s2 = lumps(wu + 0.5, wv + 0.5, 150, 71, (id) => [0.4 + 0.2 * id, 0.0005 + 0.0011 * id]);
  // Loose heaps, a hand across: a few soft rises the clods sit on.
  const heap = lumps(wu, wv, 10, 58, (id) => (id > 0.7 ? [0.55, 0.027 * (id - 0.6)] : null)).h;
  // Fine, velvety soil between: only a soft, low swell.
  const fines = 0.0025 * vnoise(u * 22, v * 22, 22, 59) + 0.0012 * vnoise(u * 60, v * 60, 60, 60);
  const bigH = smax(b.h * lumpy, b2.h * lumpy, 0.004), midH = m.h * (0.7 + 0.3 * lumpy);
  // Crumbs lie on the clods as well as between them.
  let h = smax(bigH, midH, 0.003) + fines + (s1.h + s2.h) * 0.9 + heap + skin;
  h = Math.min(CLOD_MAX, Math.max(0, h));
  const clods = Math.max(bigH, midH);
  const id = bigH >= midH && bigH > 0 ? (b.h >= b2.h ? b.id : b2.id) : midH > 0 ? m.id : -1;
  return { h, top: clamp01(clods / 0.012 + s1.h / 0.01), id };
}

/* Integer-hash value noise. */
function ihash(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function inoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = ihash(ix, iy, seed), b = ihash(ix + 1, iy, seed), c = ihash(ix, iy + 1, seed), d = ihash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The spread fill's larger lie at world (x, z), meters above the bed's base (0 to about 6 cm, mostly 1-2.5 cm). */
export function macroHeight(x: number, z: number): number {
  return (
    0.0165 +
    (inoise(x * 3.2, z * 3.2, 1) - 0.5) * 0.022 +
    (inoise(x * 7.5, z * 7.5, 2) - 0.5) * 0.011 +
    sstep(0.62, 0.92, inoise(x * 11, z * 11, 3)) * 0.014 +
    sstep(0.6, 0.95, inoise(x * 1.1, z * 1.1, 4)) * 0.022
  );
}
