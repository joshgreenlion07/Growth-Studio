import type { DeckBoardSpec } from '../siteplan/decking';
import { paint, type PBRSet, type RGB } from './textures';

/**
 * The face of a composite deck board: grain running along u, painted as one seamless tile that every board takes its
 * own stretch of (builder/deck.ts sets board-local UVs in tiles of BOARD_TEX meters, at a random offset per board).
 *
 * Composite boards are embossed with a wood grain: fine, closely spaced lines along the board that bend into long
 * cathedral arches, and pores. A streaked line (Trex Enhance Naturals) also carries its tones in long streaks: lighter
 * and darker bands a few millimeters to a couple of centimeters wide that wander along the board and fade in and out.
 * A solid line (Enhance Basics) keeps one tone with the grain alone.
 */

/** One texture tile: meters along the grain (u) and across it (v). */
export const BOARD_TEX = { along: 2.4384, across: 0.4191 };

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function h2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Value noise in [0,1], seamless with its own whole-number period along each axis (px along x, py along y). */
function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const m = (a: number, n: number) => ((a % n) + n) % n;
  const xa = m(x0, px), xb = m(x0 + 1, px), ya = m(y0, py), yb = m(y0 + 1, py);
  const a = h2(xa, ya, seed), b = h2(xb, ya, seed), c = h2(xa, yb, seed), d = h2(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Seamless fBm on the tile: `fu` and `fv` lattice cells along u and v at the first octave. */
function pfbm(u: number, v: number, fu: number, fv: number, oct: number, seed: number): number {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    const k = 1 << o;
    s += a * pnoise(u * fu * k, v * fv * k, fu * k, fv * k, seed + o * 31);
    n += a;
    a *= 0.5;
  }
  return s / n;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** A color through the tones (light to dark) at t in [0, 1]. */
function ramp(tones: RGB[], t: number): RGB {
  const x = clamp(t) * (tones.length - 1), i = Math.min(tones.length - 2, Math.floor(x));
  return mix(tones[i], tones[i + 1], x - i);
}

/**
 * The board face texture. `tones` are albedo (sRGB 0..1), light to dark; `mean` (linear) is what the texture's average
 * is matched to. Tile: BOARD_TEX meters, so the PBR set covers 1 x 1 UV.
 *
 * Read from Trex's sample photo of an Enhance board (studio light, top down): a pale warm face cut by darker grain
 * grooves 2-5 mm apart, each a ragged line under a millimeter or two wide that wanders and fades in and out along the
 * board; small pits; broad streaks of the lighter and darker tones a few centimeters wide and most of a meter long.
 */
export function boardFaceSet(board: DeckBoardSpec, tones: RGB[], mean?: RGB): PBRSet {
  const A = BOARD_TEX.along, C = BOARD_TEX.across;
  // Whole lattice counts per tile, so every noise below wraps with the tile.
  const n = (meters: number, span: number) => Math.max(1, Math.round(span / meters));
  const streaked = board.grain === 'streak';
  const lines = n(0.0034, C);
  const warpU = n(0.22, A), warpV = n(0.07, C);
  const wigU = n(0.04, A), wigV = n(0.012, C);
  const ragU = n(0.006, A), ragV = n(0.0009, C);
  const bandU = n(0.9, A), bandV = n(0.028, C);
  const coolU = n(1.2, A), coolV = n(0.05, C);
  const pitU = n(0.005, A), pitV = n(0.0016, C);
  const fadeU = n(0.12, A);
  const groove = mix(tones[2], tones[3], 0.75);
  return paint(1024, 1, 2.4, (u, v) => {
    // The grain lines wander across the board along its length (in tile units across).
    const warp = (pfbm(u, v, warpU, warpV, 2, 41) - 0.5) * (0.005 / C) + (pnoise(u * wigU, v * wigV, wigU, wigV, 43) - 0.5) * (0.0012 / C);
    const ly = (v + warp + 1) * lines;
    const cell = Math.floor(ly), f = ly - cell, id = ((cell % lines) + lines) % lines;
    // Each groove: its own place in its cell, width and strength, all changing slowly along the board.
    const cen = 0.5 + (pnoise(u * 3, id, 3, lines, 47) - 0.5) * 0.5;
    const wid = 0.1 + 0.22 * pnoise(u * fadeU, id + 0.5, fadeU, lines, 53);
    const on = smooth(0.32, 0.62, pnoise(u * fadeU * 0.7, id * 1.7, Math.round(fadeU * 0.7), lines, 59));
    const rag = (pnoise(u * ragU, v * ragV, ragU, ragV, 61) - 0.5) * 0.9;
    const dist = Math.abs(f - cen) / wid + rag * 0.6;
    const g = on * (1 - smooth(0.55, 1.05, dist));
    // Pits: little dark flecks pressed into the face.
    const pit = smooth(0.8, 0.93, pnoise(u * pitU, v * pitV, pitU, pitV, 67)) * 0.8;
    // Broad tone streaks, and a slight cool (gray) cast in some of them.
    const band = pfbm(u, v, bandU, bandV, 3, 71);
    const cool = smooth(0.5, 0.8, pfbm(u, v, coolU, coolV, 2, 73));
    const bk = streaked ? 1 : 0.35;
    let c = ramp(tones, clamp(0.25 + (band - 0.5) * 1.6 * bk));
    c = mix(c, [c[0] * 0.95, c[1] * 0.98, c[2] * 1.04], cool * bk);
    c = mix(c, groove, Math.min(1, g * (streaked ? 0.9 : 0.65) + pit * 0.6));
    const h = 0.62 - g * 0.45 - pit * 0.3 + rag * 0.04 + (band - 0.5) * 0.04;
    const r = 0.7 + g * 0.12 + pit * 0.08;
    return { h, c, r };
  }, mean);
}
