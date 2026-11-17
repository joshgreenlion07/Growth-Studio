import { fbm, smooth, vnoise } from '../noise';
import { hash, mixRGB, mulRGB, type RGB } from '../textures';
import type { WallFaceRecipe, WallTexel } from './types';

const IN = 0.0254;
/** Normal-map strength; heights below are physical (meters) and converted with the texel size. */
const K = 8;
/** Per scar: center x, y (m, unit-local), cos, sin of its axis, 1 / half-axes (m), depth (m), rim power, ripple. */
const STRIDE = 10;
const MAX_SCARS = 8;

// One-unit memo of the scar layout: texels of a unit arrive mostly in a row, and the layout depends only on the unit.
let memoKey = NaN;
let memoN = 0;
const memo = new Float64Array(MAX_SCARS * STRIDE);

/**
 * The chisel scars of one unit: a few broad, shallow shell-like scoops struck from its long edges and ends, and a chip or
 * two at its corners. Each is an elliptical bowl, deepest at its strike point (on or just outside the arris), whose
 * steep rim meets the face, or the next scar, at a crisp ridge.
 */
function scars(t: WallTexel): number {
  const key = t.id * 4096 + Math.round(t.w / IN) * 64 + Math.round(t.h / IN);
  if (key === memoKey) return memoN;
  memoKey = key;
  const w = t.w, h = t.h, s = t.id * 7.31 + 3;
  const big = 1 + Math.floor(w / IN / 8) + (hash(s, 1) < 0.5 ? 1 : 0);
  const n = Math.min(MAX_SCARS, big + 1 + (hash(s, 2) < 0.4 ? 1 : 0));
  for (let i = 0; i < n; i++) {
    const r = (k: number) => hash(s + i * 13.7, k);
    const chip = i >= big;
    let cx: number, cy: number, ang: number, rn: number, ra: number, D: number;
    if (!chip) {
      // A broad scoop struck from a long edge (or now and then an end), centered on or just outside the arris.
      const side = r(2), out = (r(3) * 0.4 - 0.05) * h;
      if (side < 0.36) { cx = r(4) * w; cy = -out; ang = (r(5) - 0.5) * 1.5; }
      else if (side < 0.72) { cx = r(4) * w; cy = h + out; ang = (r(5) - 0.5) * 1.5; }
      else if (side < 0.86) { cx = -out; cy = r(4) * h; ang = Math.PI / 2 + (r(5) - 0.5) * 1.2; }
      else { cx = w + out; cy = r(4) * h; ang = Math.PI / 2 + (r(5) - 0.5) * 1.2; }
      rn = (0.65 + r(7) * 0.8) * h;
      ra = Math.min(w * 0.8, rn * (1.1 + r(8) * 1.2));
      D = (0.35 + r(9) * 0.55) * IN;
    } else {
      // A small chip off a corner.
      const k = Math.floor(r(2) * 4);
      cx = k & 1 ? w : 0;
      cy = k & 2 ? h : 0;
      ang = r(5) * Math.PI;
      rn = (0.25 + r(7) * 0.3) * h;
      ra = rn * (1 + r(8) * 0.8);
      D = (0.15 + r(9) * 0.25) * IN;
    }
    const o = i * STRIDE;
    memo[o] = cx;
    memo[o + 1] = cy;
    memo[o + 2] = Math.cos(ang);
    memo[o + 3] = Math.sin(ang);
    memo[o + 4] = 1 / ra;
    memo[o + 5] = 1 / rn;
    memo[o + 6] = D;
    memo[o + 7] = 1.8 + r(10) * 1.8;
    memo[o + 8] = 10 + r(11) * 10;
    memo[o + 9] = r(12) * 6.28;
  }
  memoN = n;
  return n;
}

/**
 * Belgard Brisa: crisp-edged chiseled-stone units in tight hairline joints. Each face is mostly flat and finely sandy,
 * cut by a few broad, shallow, shell-like chisel scoops (deepest at the edges they were struck from, with faint
 * conchoidal ripples) that meet at crisp ridges; soft clouds of the blend's tones run across each unit.
 */
export const chiseled: WallFaceRecipe = {
  normal: K,
  roughCap: true,
  texel(t) {
    const px = t.T / 1024;
    const S = 1 / (2 * K * px); // height units per meter
    const n = scars(t);
    // Warp the scars' outlines a little, so they read as chiseled rather than drawn with a compass.
    const wn = Math.max(1, Math.round(t.T / 0.03));
    const wx = t.x + (vnoise(t.u * wn, t.v * wn, wn, 3) - 0.5) * 0.5 * IN;
    const wy = t.y + (vnoise(t.u * wn, t.v * wn, wn, 4) - 0.5) * 0.5 * IN;
    let dep = 0;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const dx = wx - memo[o], dy = wy - memo[o + 1];
      const a = (dx * memo[o + 2] + dy * memo[o + 3]) * memo[o + 4];
      const b = (dy * memo[o + 2] - dx * memo[o + 3]) * memo[o + 5];
      const r2 = a * a + b * b;
      if (r2 >= 1) continue;
      const r = Math.sqrt(r2);
      const ripple = 0.04 * Math.sin(r * memo[o + 8] + memo[o + 9]) * r * (1 - r) * 4;
      const d = memo[o + 6] * (1 - Math.pow(r, memo[o + 7]) + ripple);
      if (d > dep) dep = d;
    }
    // Faint waviness of the cast face, and its sand.
    const wave = (fbm(t.u, t.v, Math.max(1, Math.round(t.T / 0.08)), 3, 5) - 0.5) * 0.04 * IN;
    const sand = vnoise(t.u * 1024, t.v * 1024, 1024, 7);
    const z = 1.0 * IN - dep + wave + sand * 0.01 * IN;
    // Hairline joint: about one texel of shadow (its ink the same wherever the joint falls between texels), a shallow notch.
    const jc = Math.max(0, 1 - t.edge / px);
    const h = Math.max(0, (z - jc * 0.15 * IN) * S);

    // Color: the unit's tone, cloudy shade streaked along the course, blotches a little lighter and warmer than the
    // lightest tone (Newport Gray's tan in its charcoal) as strong as the blend's own spread, a darker cavity in deep
    // scoops, and sand flecks.
    const st = t.stone, ns = st.length, lt = st[0], dk = st[ns - 1];
    const i0 = Math.floor(hash(t.id, 1) * ns);
    let c = mixRGB(st[i0], st[(i0 + 1) % ns], hash(t.id, 2) * 0.5);
    const fq = Math.max(1, Math.round(t.T / 0.12));
    const cl = fbm(t.u + hash(t.id, 3) * 9, t.v * 2 + hash(t.id, 4) * 9, fq, 4, 11);
    c = mixRGB(c, mulRGB(dk, 0.95), smooth(0.45, 0.7, cl) * 0.6);
    const lum = (x: RGB) => x[0] + x[1] + x[2];
    const spread = Math.min(1, Math.max(0, ((lum(lt) - lum(dk)) / lum(lt) - 0.05) / 0.08));
    if (spread > 0) {
      const bl = fbm(t.u + hash(t.id, 5) * 9, t.v * 3 + hash(t.id, 6) * 9, fq, 5, 23, 0.6);
      // Soft clouds, as in Belgard's Newport Gray photo: a modest tan, wide soft edges, never covering a stone.
      const tan = mixRGB(lt, dk, -0.6);
      const amt = smooth(0.45, 0.78, bl + (sand - 0.5) * 0.12) * (0.25 + hash(t.id, 7) * 0.35) * spread;
      c = mixRGB(c, [tan[0] * 1.04, tan[1], tan[2] * 0.92], amt);
    }
    c = mulRGB(c, 1 - (dep / IN) * 0.06);
    const g = vnoise(t.u * 1024, t.v * 1024, 1024, 13);
    c = mulRGB(c, 0.97 + sand * 0.05 - (g > 0.985 ? 0.08 : 0) + (g < 0.01 ? 0.06 : 0));
    if (jc > 0) c = mixRGB(c, mulRGB(t.joint, 0.5), jc * 0.85);
    return { h, c, r: 0.86 + sand * 0.06 };
  },
};
