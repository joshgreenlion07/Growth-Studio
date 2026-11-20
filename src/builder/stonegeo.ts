/*
 * Shared stone helpers: 3D value noise (also the basalt fountain's, builder/waterfire/basalt.ts) and footSink, which sets
 * a boulder or flagstone piece into a slope. The boulders themselves are drawn by builder/mossrock.ts.
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

/** The ground height (relative to the feature's own spot) at a point in the feature's local x, z. */
export type GroundAt = (x: number, z: number) => number;

/**
 * How far to sink a stone so no gap shows on the downhill side: the drop from the feature's spot to the lowest ground
 * under its foot (eight points about a box `length` x `depth`), at most `max`.
 */
export function footSink(ground: GroundAt | undefined, length: number, depth: number, max: number): number {
  if (!ground) return 0;
  let low = 0;
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) low = Math.min(low, ground(sx * length * 0.42, sz * depth * 0.42));
  return Math.min(-low, max);
}
