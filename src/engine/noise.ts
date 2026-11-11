/** Tileable value noise, fBm and Voronoi for procedural textures. */

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Value noise in [0,1], seamless with integer `period` along both axes. */
export function vnoise(x: number, y: number, period: number, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const a = hash2(mod(x0, period), mod(y0, period), seed);
  const b = hash2(mod(x0 + 1, period), mod(y0, period), seed);
  const c = hash2(mod(x0, period), mod(y0 + 1, period), seed);
  const d = hash2(mod(x0 + 1, period), mod(y0 + 1, period), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Tileable fBm in [0,1]. u, v in [0,1); `freq` is the base lattice count. */
export function fbm(u: number, v: number, freq: number, octaves = 5, seed = 0, gain = 0.5): number {
  let sum = 0, amp = 0.5, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * f, v * f, f, seed + o * 17);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

export interface VoronoiHit {
  f1: number;
  f2: number;
  /** Stable random value per cell, 0 to 1. */
  id: number;
  /** Offset to the nearest cell center, in cell units. */
  dx: number;
  dy: number;
}

/** Tileable Voronoi. u, v in [0,1); `cells` per side. */
export function voronoi(u: number, v: number, cells: number, seed = 0, jitter = 0.9): VoronoiHit {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, dx = 0, dy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const wx = mod(cx, cells), wy = mod(cy, cells);
      const px = cx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (hash2(wx, wy, seed + 9) - 0.5) * jitter;
      const ddx = px - x, ddy = py - y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, seed + 31);
        dx = ddx;
        dy = ddy;
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id, dx, dy };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
