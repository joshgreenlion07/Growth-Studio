import { fbm, smooth, vnoise, voronoi } from '../noise';
import { hash, mixRGB, mulRGB, type RGB } from '../textures';
import type { WallFaceRecipe, WallSample, WallTexel } from './types';

const IN = 0.0254;

/**
 * Stone layouts of the 7 in Ashlar Tandem faces: [x0, x1, y0, y1] in inches from the face's top-left, traced from
 * Belgard's Riviera swatch and unit photos (research/ashlar-tandem-wall.json), plus a few built by the same rules
 * (horizontal virtual joints 2 1/3, 3 1/2 or 4 2/3 in from the top, one to four stones a face).
 */
const LAYOUTS: { len: number; stones: number[][] }[] = [
  { len: 18.4375, stones: [[0, 7.2, 0, 2.33], [0, 7.2, 2.33, 7], [7.2, 18.44, 0, 4.67], [7.2, 18.44, 4.67, 7]] },
  { len: 18.4375, stones: [[0, 13.8, 0, 4.7], [13.8, 18.44, 0, 4.7], [0, 18.44, 4.7, 7]] },
  { len: 18.4375, stones: [[0, 10.6, 0, 7], [10.6, 18.44, 0, 2.33], [10.6, 18.44, 2.33, 7]] },
  { len: 15.8125, stones: [[0, 15.81, 0, 4.67], [0, 9.1, 4.67, 7], [9.1, 15.81, 4.67, 7]] },
  { len: 15.8125, stones: [[0, 10.9, 0, 4.7], [10.9, 15.81, 0, 4.7], [0, 7.3, 4.7, 7], [7.3, 15.81, 4.7, 7]] },
  { len: 15.8125, stones: [[0, 15.81, 0, 3.5], [0, 15.81, 3.5, 7]] },
  { len: 13.1875, stones: [[0, 13.19, 0, 7]] },
  { len: 13.1875, stones: [[0, 13.19, 0, 4.5], [0, 13.19, 4.5, 7]] },
  { len: 13.1875, stones: [[0, 5.9, 0, 7], [5.9, 13.19, 0, 2.33], [5.9, 13.19, 2.33, 7]] },
];
const SIZES = [13.1875, 15.8125, 18.4375];
const BY_SIZE = SIZES.map((l) => LAYOUTS.filter((s) => s.len === l));

/**
 * Ashlar Tandem Wall: each 7 in unit face scored by virtual joints into one to four ashlar stones (a traced layout per
 * unit, mirrored or turned at random), with real and virtual joints alike: about 0.2 in, dark, softly chipped. Each
 * stone is chiseled (see chiseledStone).
 */
export const ashlar: WallFaceRecipe = {
  normal: 9,
  // The Tandem cap has a smooth, flat top (only its front edge is chiseled): a plain cap reads truer than the rough one.
  roughCap: false,
  texel(t) {
    // The unit's layout, scaled to its face (the last unit of a tile row can be longer or shorter than the sizes).
    const wi = t.w / IN;
    let si = 0;
    for (let k = 1; k < SIZES.length; k++) if (Math.abs(wi - SIZES[k]) < Math.abs(wi - SIZES[si])) si = k;
    const group = BY_SIZE[si];
    const lay = group[Math.floor(hash(t.id, 11) * group.length)];
    const sx = t.w / (lay.len * IN), sy = t.h / (7 * IN);
    const xi = (hash(t.id, 12) < 0.5 ? t.x : t.w - t.x) / sx / IN;
    const yi = (hash(t.id, 13) < 0.7 ? t.h - t.y : t.y) / sy / IN; // inches from the top (or bottom, turned)
    let e = t.edge, k = 0;
    for (let s = 0; s < lay.stones.length; s++) {
      const [x0, x1, y0, y1] = lay.stones[s];
      if (xi >= x0 && xi < x1 + 0.01 && yi >= y0 && yi < y1 + 0.01) {
        k = s;
        e = Math.min(e, Math.min(xi - x0, x1 - xi) * sx * IN, Math.min(yi - y0, y1 - yi) * sy * IN);
        break;
      }
    }
    return chiseledStone(t, t.id * 7 + k, e, ASHLAR_STONE, 0);
  },
};

/** How a chiseled stone meets its joints (lengths in inches), and how deep its face is worked. */
export interface StoneStyle {
  /** Half the joint's width. */
  J: number;
  /** The joint's color, as a multiple of the swatch's joint tone. */
  dark: number;
  /** How far the edge wanders in and out (a softly broken edge, a wavy strip). */
  wave: number;
  /** How far in from the joint the face rolls over its edge (the pitch), at the least; up to twice that. */
  roll: number;
  /** Depth of the broad facets, 1 for Ashlar's nearly flat faces. */
  relief: number;
}

const ASHLAR_STONE: StoneStyle = { J: 0.11, dark: 0.36, wave: 0.05, roll: 0.1, relief: 1 };

/**
 * One chiseled Tandem stone at a texel (shared with Lamina Tandem), `sid` the stone's id and `e` its distance to the
 * stone's edge (m). The edge is softly chipped and wanders, falling into a dark joint (see StoneStyle) over a rolled,
 * pitched arris. The face has broad, shallow facets and here and there a chisel scoop, a fine sandy grain with light
 * and dark flecks and a few pores, and its own tone from the blend with cloudy mottling. `lift` is added to the face's
 * height (a stone set a little proud or tipped).
 */
export function chiseledStone(t: WallTexel, sid: number, e: number, st: StoneStyle, lift: number): WallSample {
  const { u, v, T } = t;
  // Softly chipped arrises: a coarse wobble and small chips move the edge in and out; the joint's edge is blended over
  // about a texel (the textures are 1024 across the tile) so it does not stair-step.
  const nE = Math.max(1, Math.round(T / (0.6 * IN)));
  const chip = vnoise(u * nE, v * nE, nE, 3);
  const nW = Math.max(1, Math.round(T / (2 * IN)));
  const wob = vnoise(u * nW, v * nW, nW, 5);
  const px = T / 1024, J = st.J * IN;
  const ee = e + (smooth(0.6, 0.85, chip) * -0.06 + (wob - 0.5) * st.wave) * IN;
  const jc = mulRGB(t.joint, st.dark * (0.92 + chip * 0.14));
  if (ee < J - px * 0.6) return { h: 0, c: jc, r: 1 };
  const open = smooth(J - px * 0.6, J + px * 0.6, ee);
  // Broad, shallow facets (an undulation creased where it crosses its middle), and here and there a chisel scoop: a
  // shallow dish in a Voronoi cell (about 3 1/2 in, the cells bent by noise), wider than tall, tipped a little and
  // steeper at one rim (mostly the upper), so it lights as the dark crescent over a lighter streak of Belgard's photos.
  const und = fbm(u + hash(sid, 14) * 5, v + hash(sid, 15) * 5, Math.max(2, Math.round(T / (4 * IN))), 3, 19);
  const ridge = 1 - Math.abs(und * 2 - 1);
  const nF = Math.max(2, Math.round(T / (3.6 * IN)));
  const nWarp = Math.max(1, Math.round(T / (2.4 * IN)));
  const wu = vnoise(u * nWarp, v * nWarp, nWarp, 21) - 0.5, wv = vnoise(u * nWarp, v * nWarp, nWarp, 23) - 0.5;
  const f = voronoi(u + (wu * 0.8) / nF, v + (wv * 0.5) / nF, nF, 29 + (sid % 7), 0.8);
  const fid = f.id * 977;
  let scoop = 0, rim = 0;
  if (hash(fid, 5) < 0.26) {
    const a = (hash(fid, 8) - 0.5) * 1.0, ca = Math.cos(a), sa = Math.sin(a);
    const rx = -f.dx * ca - f.dy * sa, ry = f.dx * sa - f.dy * ca; // from the cell's center, y down the wall
    const sz = 0.65 + hash(fid, 9) * 0.6;
    const sharp = hash(fid, 10) < 0.75 ? ry < 0 : ry > 0; // the steep rim mostly at the top
    const ex = rx / ((0.38 + hash(fid, 6) * 0.25) * sz), ey = ry / ((sharp ? 0.16 : 0.38) * sz);
    const r2 = ex * ex + ey * ey;
    if (r2 < 1) {
      const k2 = 0.5 + hash(fid, 7) * 0.5;
      scoop = (1 - r2) * k2;
      rim = sharp ? smooth(0.35, 0.9, r2) * k2 : 0;
    }
  }
  const pitch = smooth(J, J + st.roll * (1 + wob) * IN, ee);
  // Sandy grain, light and dark aggregate flecks and a few small pores.
  const nG = Math.max(1, Math.round(T / (0.05 * IN)));
  const grit = vnoise(u * nG, v * nG, nG, 31);
  const fl = voronoi(u, v, Math.max(1, Math.round(T / (0.16 * IN))), 37);
  const flid = fl.id * 977;
  const fleck = fl.f1 < 0.17 ? (hash(flid, 6) < 0.55 ? 1 : -1) : 0;
  const pit = fleck === 0 && fl.f1 < 0.28 && hash(flid, 7) < 0.05 ? 1 : 0;
  const face = 0.5 + lift + (und * 0.3 + ridge * 0.1) * st.relief - scoop * 0.2 + grit * 0.03;
  const h = (0.1 + pitch * face - pit * 0.04) * open;
  // Color: the stone's own tone from the blend (pushed a little apart: the photos span more than the swatch tones),
  // cloudy mottling toward another tone, charcoal clouds and (in warm blends) a warmer tan beyond the swatch tones, the
  // grain and flecks, the upper rims of the scoops a little darker.
  const n = t.stone.length;
  const base = t.stone[Math.floor(hash(sid, 1) * n)];
  const other = t.stone[Math.floor(hash(sid, 2) * n)];
  const mean: RGB = [0, 0, 0];
  for (const s of t.stone) for (let ch = 0; ch < 3; ch++) mean[ch] += s[ch] / n;
  const warmth = Math.min(1, Math.max(0, (mean[0] - mean[2]) / Math.max(0.05, mean[0])) * 4);
  let c = mixRGB(mean, base, 1.4);
  const m = fbm(u + hash(sid, 3) * 7, v + hash(sid, 4) * 7, Math.max(2, Math.round(T / (7 * IN))), 3, 41 + (sid % 11));
  c = mixRGB(c, other, smooth(0.3, 0.8, m) * 0.65);
  const b = fbm(u + hash(sid, 5) * 7, v + hash(sid, 6) * 7, Math.max(2, Math.round(T / (5 * IN))), 3, 53 + (sid % 13));
  const dark = t.stone[n - 1], light = t.stone[0];
  const gray = (dark[0] + dark[1] + dark[2]) / 3;
  const charcoal = mulRGB(mixRGB(dark, [gray, gray, gray], 0.4), 0.72);
  const tan: RGB = [light[0] * 1.08, light[1] * 0.98, light[2] * 0.84];
  c = mixRGB(c, charcoal, smooth(0.45, 0.85, b) * (0.2 + hash(sid, 7) * 0.5));
  c = mixRGB(c, tan, smooth(0.42, 0.2, b) * warmth * (0.15 + hash(sid, 9) * 0.5));
  c = mulRGB(c, (0.9 + hash(sid, 8) * 0.16) * (0.93 + grit * 0.1 - rim * 0.14) * (0.9 + pitch * 0.1));
  if (fleck > 0) c = mixRGB(c, [0.86, 0.84, 0.8], 0.13);
  else if (fleck < 0) c = mulRGB(c, 0.88);
  if (pit) c = mulRGB(c, 0.72);
  return { h, c: mixRGB(jc, c, open), r: 0.88 + pit * 0.1 + (1 - open) * 0.12 };
}
