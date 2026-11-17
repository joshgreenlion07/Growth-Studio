import { clamp01, fbm, smooth, vnoise, voronoi } from '../noise';
import { hash, mixRGB, mulRGB, type RGB } from '../textures';
import type { WallFaceRecipe, WallTexel } from './types';

const IN = 0.0254;

/** A whole-number frequency across the tile for features about `m` meters across (noise must tile). */
export const per = (T: number, m: number) => Math.max(1, Math.round(T / m));

/** Saturation scaled by k about the color's own gray (k < 1 grayer, k > 1 stronger hue). */
export const sat = (c: RGB, k: number): RGB => {
  const g = (c[0] + c[1] + c[2]) / 3;
  return [g + (c[0] - g) * k, g + (c[1] - g) * k, g + (c[2] - g) * k];
};

/** How a tumbled unit's outline wears: lengths in meters. */
export interface TumbledEdge {
  /** Corner radius seen face-on (varies per corner from 0.6x to 1.4x). */
  corner: number;
  /** The most a unit's end stands off its neighbor (head joints open from 0 to this, per end). */
  endGap: number;
  /** How far the worn outline wanders in from the unit's edge, broadly and finely. */
  wobble: number;
  ragged: number;
  /** How far in from the edge the largest chips reach, their size, and the share of chip cells that are chipped. */
  chip: number;
  chipCell: number;
  chipOdds: number;
}

/**
 * The distance (m) from a texel to its unit's tumbled outline, corners rounded off and the arrises wavy, and how deep
 * in a chip it lies (0 outside chips, 1 at the arris inside one), for the dent and fresh, rougher fracture of a chip.
 */
export function tumbledOutline(t: WallTexel, s: TumbledEdge): { d: number; chip: number } {
  const dx = Math.min(t.x - hash(t.id, 27) ** 2 * s.endGap, t.w - t.x - hash(t.id, 28) ** 2 * s.endGap);
  const dy = Math.min(t.y, t.h - t.y);
  const corner = (t.x < t.w / 2 ? 0 : 1) + (t.y < t.h / 2 ? 0 : 2);
  const R = s.corner * (0.6 + 0.8 * hash(t.id, 20 + corner));
  const d = dx < R && dy < R ? R - Math.hypot(R - dx, R - dy) : Math.min(dx, dy);
  // Wobble and chips only reach a little way in; past that the face is untouched by them.
  if (d > s.chip + s.wobble + s.ragged + 0.012) return { d, chip: 0 };
  const n = per(t.T, 0.04), m = per(t.T, 0.008);
  // The outline only ever wears inward, so the joint stays closed where the units touch.
  const dw = d - vnoise((t.u + hash(t.id, 21)) * n, (t.v + hash(t.id, 22)) * n, n, 5) * s.wobble
    - vnoise((t.u + hash(t.id, 25)) * m, (t.v + hash(t.id, 26)) * m, m, 6) * s.ragged;
  const vc = voronoi(t.u + hash(t.id, 23), t.v + hash(t.id, 24), per(t.T, s.chipCell), 9, 0.8);
  let chip = 0;
  if (hash(vc.id * 97.3, t.id) < s.chipOdds) {
    const reach = s.chip * (0.35 + 0.65 * hash(vc.id, 3));
    chip = smooth(0.7, 0.25, vc.f1) * (1 - smooth(reach * 0.4, reach, dw));
  }
  return { d: dw, chip };
}

/**
 * Faint tumbling scratches: short, nearly straight light strokes, a few per stone, roughly aligned on each stone.
 * Returns 0..1 (1 on a stroke).
 */
export function scratches(t: WallTexel, density: number): number {
  const n = per(t.T, 0.03);
  const gx = t.u * n, gy = t.v * n;
  const cx = Math.floor(gx), cy = Math.floor(gy);
  const fx = gx - cx, fy = gy - cy;
  const key = cx + cy * n * 1.37 + t.id * 7.31;
  const lean = hash(t.id, 40) * Math.PI;
  let s = 0;
  for (let k = 0; k < 2; k++) {
    if (hash(key, 41 + k) > density) continue;
    const a = lean + (hash(key, 43 + k) - 0.5) * 1.1;
    const ox = 0.5 + (hash(key, 45 + k) - 0.5) * 0.35, oy = 0.5 + (hash(key, 47 + k) - 0.5) * 0.35;
    const L = 0.06 + 0.2 * hash(key, 49 + k);
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = fx - ox, py = fy - oy;
    const along = Math.max(-L, Math.min(L, px * ca + py * sa));
    const dist = Math.hypot(px - along * ca, py - along * sa);
    s = Math.max(s, (1 - smooth(0.02, 0.055, dist)) * (0.5 + 0.5 * hash(key, 51 + k)));
  }
  return s;
}

const GRANA_EDGE: TumbledEdge = {
  corner: 0.55 * IN, endGap: 0.12 * IN, wobble: 0.05 * IN, ragged: 0.025 * IN, chip: 0.4 * IN, chipCell: 0.9 * IN, chipOdds: 0.4,
};

/**
 * Castlemanor Grana (Adams / GMS): tumbled cut stone. A fairly smooth, flat, fine-sanded face with soft clouds of the
 * blend (charcoal and rust over the stone's own tone), light tumbling scuffs and scratches; strongly rounded, wavy,
 * chipped arrises and corners, worn lighter, that meet the next unit in a thin dark V-groove.
 */
export const tumbled: WallFaceRecipe = {
  normal: 12,
  texel(t) {
    const T = t.T, id = t.id;
    const e = tumbledOutline(t, GRANA_EDGE);
    const J = 0.02 * IN; // half the dry joint's open gap where the units touch
    if (e.d < J) return { h: 0, c: mulRGB(t.joint, 0.3), r: 1 };
    // Face relief: a slight undulation, fine sand, and chips: a dent with a rough fracture at the arris.
    const und = fbm(t.u + hash(id, 31) * 3, t.v + hash(id, 32) * 3, per(T, 0.07), 3, 40 + (id % 17));
    const ng = per(T, 0.0022);
    const grain = vnoise(t.u * ng, t.v * ng, ng, 51);
    // The arris: rounded over about half an inch, more or less from stone to stone and along each edge.
    const p = clamp01((e.d - J) / (0.5 * IN * (0.7 + 0.4 * hash(id, 30) + 0.5 * und)));
    const round = Math.sin(p * Math.PI * 0.5) + (grain - 0.5) * 0.08 * (1 - p);
    const scr = scratches(t, 0.06 + 0.45 * hash(id, 11) ** 2) * smooth(0.3, 0.6, und + hash(id, 12) * 0.3);
    const h = round * (0.55 + (und - 0.5) * 0.25) + grain * 0.018 - scr * 0.005 - e.chip * (0.3 + grain * 0.2);
    // Color: the stone's tone (stones differ in tone, warmth and depth), then soft clouds of charcoal and rust in it.
    const S = t.stone;
    const base = mixRGB(S[Math.floor(hash(id, 1) * S.length)], S[Math.floor(hash(id, 2) * S.length)], 0.25);
    let c = sat(mulRGB(base, 0.9 + 0.2 * hash(id, 3)), 0.6 + hash(id, 4) * 0.8);
    const nb = per(T, 0.12);
    const b1 = fbm(t.u + hash(id, 5) * 7, t.v + hash(id, 6) * 7, nb, 4, 70 + (id % 31));
    const b2 = fbm(t.u + hash(id, 7) * 7, t.v + hash(id, 8) * 7, nb, 4, 90 + (id % 29));
    c = mixRGB(c, mulRGB(sat(c, 0.4), 0.72), smooth(0.38, 0.8, b1) * (0.35 + 0.45 * hash(id, 9)));
    c = mixRGB(c, mulRGB(sat(c, 1.5), 1.05), smooth(0.42, 0.72, b2) * (0.3 + 0.55 * hash(id, 10)));
    // Fine mottle, and light scuffs where the tumbling rubbed the face.
    const nf = per(T, 0.006), nf2 = per(T, 0.0035);
    const fine = vnoise(t.u * nf, t.v * nf, nf, 53) + vnoise(t.u * nf2, t.v * nf2, nf2, 55);
    c = mulRGB(c, 0.86 + fine * 0.1 + grain * 0.08);
    const rub = fbm(t.u + hash(id, 13) * 5, t.v, per(T, 0.05), 2, 110 + (id % 23));
    const scuff = smooth(0.55, 0.75, rub) * hash(id, 14) ** 2;
    const light = mulRGB(sat(c, 0.45), 1.3);
    const chalk = mulRGB(sat(c, 0.3), 1.45);
    c = mixRGB(c, chalk, Math.min(1, scr * 0.6 + scuff * smooth(0.35, 0.8, grain) * 0.5));
    c = mixRGB(c, light, e.chip * (0.3 + grain * 0.3));
    // The arris is worn lighter, then rolls into the groove's shade.
    c = mixRGB(c, light, smooth(0.2, 0.6, p) * (1 - smooth(0.6, 1, p)) * 0.3);
    c = mulRGB(c, 0.6 + 0.4 * smooth(0, 0.35, p));
    return { h, c, r: 0.84 + grain * 0.06 + (1 - p) * 0.08 };
  },
};
