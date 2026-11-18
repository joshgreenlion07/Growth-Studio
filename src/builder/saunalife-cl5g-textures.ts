import { paint, textureSet, hexRGB, mixRGB, mulRGB, type PBRSet, type RGB } from '../engine/textures';
import { vnoise } from '../engine/noise';

/*
 * Surfaces of the SaunaLife CL5G sauna (see saunalife-cl5g.ts), painted from their cache key alone so the texture
 * worker can paint them (`cl5g-<name>:<tile meters>`, routed by texture-recipes.ts).
 */

const IN = 0.0254;

export const cl5gHash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface WoodLook {
  /** dark (latewood), mid, light (earlywood), knot */
  tones: [string, string, string, string];
  boards: number;
  /** Groove width as a fraction of a board (0: none). */
  groove: number;
  knots: number;
  /** Per-board tint spread. */
  tint: number;
  rings: number;
  /** How dark the latewood streaks are (0..1). */
  ringMix?: number;
  rough: number;
}

/** Boards side by side across v, grain along u; `tile` meters per repeat. Seamless along u; board edges break v. */
function woodSet(tile: number, L: WoodLook): PBRSet {
  {
    const [dark, mid, light, knot] = L.tones.map(hexRGB) as [RGB, RGB, RGB, RGB];
    const boardW = tile / L.boards;
    return paint(512, tile, 3, (u, v) => {
      const yb = v * L.boards;
      const b = Math.floor(yb);
      const ly = yb - b;
      const hb = cl5gHash(b, 3);
      // Growth rings across the board, wandering slowly along it.
      const wander = vnoise(u * 5, b * 3.7, 5, 11) * 1.6 + vnoise(u * 13, b * 1.3, 13, 12) * 0.35;
      const ring = (ly * L.rings + wander + hb * 7) % 1;
      const late = 1 - smooth(0.0, 0.22, Math.abs(ring - 0.5) * 2);
      // Grain: streaks long along the board, fine across it.
      const fine = vnoise(u * 10 + b * 3.1, ly * 46 + b * 17, 10, 13) * 0.6 + vnoise(u * 40 + b * 1.7, ly * 140 + b * 5, 40, 14) * 0.4;
      let k = 0;
      let kDist = 9;
      for (let i = 0; i < L.knots; i++) {
        if (cl5gHash(b, 40 + i) > 0.55) continue;
        const ku = cl5gHash(b, 50 + i), kv = 0.25 + 0.5 * cl5gHash(b, 60 + i);
        let du = Math.abs(u - ku);
        du = Math.min(du, 1 - du) * tile;
        const dv = (ly - kv) * boardW;
        const r = (0.006 + 0.008 * cl5gHash(b, 70 + i)) * (L.boards > 4 ? 1 : 1.4);
        const d = Math.hypot(du * 0.42, dv) / r;
        kDist = Math.min(kDist, d);
        if (d < 1) k = Math.max(k, 1 - d * d);
      }
      // Grain bends round knots: rings darken near them.
      const near = kDist < 3 ? (1 - kDist / 3) * 0.35 : 0;
      let c = mixRGB(light, mid, smooth(0.2, 0.8, fine) * 0.6 + near);
      c = mixRGB(c, dark, late * (L.ringMix ?? 0.55) + near * 0.4);
      c = mixRGB(c, knot, k * 0.8);
      c = mulRGB(c, 1 + (hb - 0.5) * L.tint);
      let h = 0.6 + fine * 0.15 - late * 0.1 - k * 0.2;
      if (L.groove > 0) {
        const e = Math.min(ly, 1 - ly) / L.groove;
        if (e < 1) {
          h *= e;
          c = mulRGB(c, 0.45 + 0.55 * e);
        }
      }
      return { h, c, r: L.rough + fine * 0.08 };
    });
  }
}

/** Thermo-spruce staves outside: pale honey, a little pink, with dark knots (job photos, SaunaLife's side view). */
const spruceOut = (tile: number) => woodSet(tile, { tones: ['#87562e', '#a8723f', '#bb8752', '#4f2f18'], boards: 8, groove: 0.035, knots: 2, tint: 0.14, rings: 6, ringMix: 0.45, rough: 0.72 });
/** Thermo-spruce inside: warmer orange (interior photo). */
const spruceIn = (tile: number) => woodSet(tile, { tones: ['#8a4f28', '#b06d3c', '#c4844f', '#4f2c15'], boards: 8, groove: 0.03, knots: 2, tint: 0.12, rings: 5, ringMix: 0.45, rough: 0.66 });
/** The back wall's boards read paler and pinker than the staves in the interior photo. */
const spruceBack = (tile: number) => woodSet(tile, { tones: ['#7f604e', '#9a7a68', '#ab8b78', '#5b3f2c'], boards: 8, groove: 0.03, knots: 2, tint: 0.1, rings: 5, ringMix: 0.4, rough: 0.66 });
/** Fascia and front details: spruce painted black, the grain still showing (job photos). */
const stained = () => woodSet(0.6, { tones: ['#34312e', '#46423e', '#635e58', '#24221f'], boards: 5, groove: 0, knots: 2, tint: 0.1, rings: 7, ringMix: 0.5, rough: 0.72 });
/** Thermo-aspen benches and backrest: knotless, satin, taupe brown (interior photo). */
const aspen = () => woodSet(0.8, { tones: ['#6f5a4c', '#8c7362', '#9e8473', '#6f5a4c'], boards: 6, groove: 0, knots: 0, tint: 0.08, rings: 9, ringMix: 0.25, rough: 0.7 });
/** The lower bench slats read lighter and warmer in the photos (lit by the bar under the upper bench). */
const aspenLight = () => woodSet(0.8, { tones: ['#93623a', '#b07a4c', '#c08b5c', '#93623a'], boards: 6, groove: 0, knots: 0, tint: 0.08, rings: 9, ringMix: 0.25, rough: 0.7 });

/**
 * Hexagonal bitumen shingles, black with gray granules: flat-topped hexagons about 12.9 in apart in a row, rows 5.2 in
 * apart (measured from SaunaLife's side view). u runs along the sauna, v up the slope from the drip edge.
 */
const HEX_A = 12.9, HEX_B = 5.16;
function shingleSet(): PBRSet {
  {
    const tileIn = HEX_A * 4;
    const s = HEX_A / 3;
    const k = (Math.sqrt(3) * s) / (2 * HEX_B);
    const base = hexRGB('#403e3c'), grit = hexRGB('#5a5754'), deep = hexRGB('#1c1b1a');
    return paint(512, tileIn * IN, 4, (u, v) => {
      const x = u * tileIn, y = (1 - v) * tileIn;
      let best = 9, cy = 0;
      for (const [ox, oy] of [[0, 0], [HEX_A / 2, HEX_B]]) {
        const i = Math.round((x - ox) / HEX_A), j = Math.round((y - oy) / (2 * HEX_B));
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const cx0 = (i + di) * HEX_A + ox, cy0 = (j + dj) * 2 * HEX_B + oy;
          const dx = Math.abs(x - cx0), dy = Math.abs(y - cy0) * k;
          const d = Math.max(dy * (2 / Math.sqrt(3)), dx + dy / Math.sqrt(3));
          if (d < best) { best = d; cy = cy0; }
        }
      }
      const edge = (s - best) / s;
      // Each tab is thicker at its lower edge (the next row laps over its top).
      const rel = (y - cy) / (2 * HEX_B) + 0.5;
      const g = vnoise(u * 400, v * 400, 400, 5);
      const g2 = vnoise(u * 90, v * 90, 90, 6);
      let c = mixRGB(base, grit, g * 0.55 + g2 * 0.2);
      if (rel > 0.78) c = mulRGB(c, 1.06);
      // Only a tab's lower edges show as a dark step (its upper edges are under the next row), with a soft shadow below.
      const line = edge < 0.035 ? 1 : 0;
      if (line) c = mixRGB(c, deep, rel < 0.5 ? 0.85 : 0.18);
      else if (rel > 0.5 && edge < 0.12) c = mulRGB(c, 0.8 + 0.2 * (edge / 0.12));
      const h = line && rel < 0.5 ? 0 : 0.4 + (1 - rel) * 0.35 + g * 0.08;
      return { h, c, r: 0.88 + g * 0.08 };
    });
  }
}

/** Thermometer / hygrometer face: dark slate dial, white ticks and needle. UVs 0..1 across the face. */
function dialSet(): PBRSet {
  {
    const face = hexRGB('#283240'), rim = hexRGB('#323a46'), tick = hexRGB('#d8dcdf');
    return paint(128, 1, 1, (u, v) => {
      const x = u - 0.5, y = v - 0.5;
      const r = Math.hypot(x, y) * 2;
      const a = Math.atan2(y, x);
      let c = r > 0.92 ? rim : face;
      const tk = Math.abs(((a / (Math.PI * 2)) * 24 + 24) % 1 - 0.5) > 0.44;
      if (r > 0.66 && r < 0.8 && tk && Math.sin(a) > -0.6) c = tick;
      // Needle from the middle toward 10 o'clock.
      const na = 2.4;
      const t = x * Math.cos(na) + y * Math.sin(na), n = Math.abs(-x * Math.sin(na) + y * Math.cos(na));
      if (t > 0 && t < 0.3 && n < 0.012) c = tick;
      if (r < 0.06) c = tick;
      return { h: 0.5, c, r: 0.4 };
    });
  }
}

const PAINTERS: Record<string, (tile: number) => PBRSet> = {
  'spruce-out': spruceOut,
  'spruce-in': spruceIn,
  'spruce-back': spruceBack,
  'black-spruce': () => stained(),
  'thermo-aspen': () => aspen(),
  'thermo-aspen-light': () => aspenLight(),
  'hex-shingle': () => shingleSet(),
  dial: () => dialSet(),
};

export type CL5GTexture = 'spruce-out' | 'spruce-in' | 'spruce-back' | 'black-spruce' | 'thermo-aspen' | 'thermo-aspen-light' | 'hex-shingle' | 'dial';

/** A CL5G surface; `tile` (meters per repeat) is for the stave and board surfaces, whose repeat follows the staves. */
export function cl5gTextures(name: CL5GTexture, tile = 0): PBRSet {
  const key = `cl5g-${name}:${tile.toFixed(4)}`;
  return textureSet(key, () => PAINTERS[name](tile));
}

/** The worker's side: rebuild a set from its key, or null when the key is not one of these. */
export function cl5gRecipe(key: string): PBRSet | null {
  const m = /^cl5g-([a-z-]+):([0-9.]+)$/.exec(key);
  return m && PAINTERS[m[1]] ? cl5gTextures(m[1] as CL5GTexture, +m[2]) : null;
}
