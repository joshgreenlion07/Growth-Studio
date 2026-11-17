import { clamp01, fbm, smooth, vnoise } from '../noise';
import { hash, mixRGB, mulRGB } from '../textures';
import type { WallFaceRecipe } from './types';

const IN = 0.0254;
/** Normal-map strength; heights below are physical (inches) and converted with the texel size. */
const K = 6;

/** A fast integer hash of three integers, 0..1. */
function ih(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Ink (0..1, the share of the texel a groove covers) of one set of parallel incised strokes, at `a` across the strokes
 * and `b` along them (inches in the panel). Strokes sit one per lane of `pitch`, broken along the lane into runs of a
 * length set per lane; a run is cut where its hash falls under the cluster density `dens`. Each stroke is a little
 * slanted and wavy, tapers at its ends and skips now and then, and is drawn with its coverage of the texel (`pxIn`
 * wide) so hairline grooves keep their weight wherever they fall between texels.
 */
function strokes(a: number, b: number, pitch: number, run0: number, run1: number, dens: number, pxIn: number, seed: number): number {
  if (dens <= 0) return 0;
  const ci = Math.floor(a / pitch);
  let ink = 0;
  for (let k = ci - 1; k <= ci + 1; k++) {
    const L = run0 + ih(k, seed, 1) * (run1 - run0);
    const bb = b + ih(k, seed, 2) * L;
    const sj = Math.floor(bb / L);
    const sb = bb - sj * L;
    const hs = ih(k, sj, seed);
    if (hs > dens) continue;
    const s0 = ih(k, sj, seed + 1) * 0.2 * L;
    const s1 = L - ih(k, sj, seed + 2) * 0.2 * L;
    if (sb < s0 || sb > s1) continue;
    // A skip in the groove now and then.
    if (ih(k, Math.floor(bb / 0.6), seed + 3) < 0.06) continue;
    const ac = (k + 0.2 + 0.6 * ih(k, sj, seed + 4)) * pitch + (ih(k, sj, seed + 5) - 0.5) * 0.06 * (sb - (s0 + s1) / 2)
      + 0.03 * Math.sin(sb * 2.3 + hs * 40);
    const hw = (0.035 + 0.035 * ih(k, sj, seed + 6)) * Math.min(1, (sb - s0) / 0.4, (s1 - sb) / 0.4);
    const cov = clamp01((hw + pxIn / 2 - Math.abs(a - ac)) / pxIn);
    if (cov > ink) ink = cov;
  }
  return ink;
}

/**
 * Belgard Papyrus Artforms: smooth 3 in panels set upright, butted at hairline joints with crisp square edges. The face is
 * a shallow incised crosshatch like papyrus or reed fibers: loose clusters of thin vertical strokes 1 to 6 in long,
 * crossed by fewer, shorter horizontal ones, on a fine sandy face clouded in the blend's tones.
 */
export const papyrus: WallFaceRecipe = {
  normal: K,
  texel(t) {
    const px = t.T / 1024, pxIn = px / IN;
    const S = IN / (2 * K * px); // height units per inch
    const X = t.x / IN, Y = t.y / IN;
    // Where the strokes gather: loose clusters, taller than wide, different on every panel.
    const cf = Math.max(1, Math.round(t.T / 0.2));
    const cl = fbm(t.u * 2 + hash(t.id, 1) * 7, t.v + hash(t.id, 2) * 7, cf, 2, 31, 0.4);
    const dens = 0.05 + 0.95 * smooth(0.56, 0.7, cl);
    const vi = strokes(X, Y, 0.32, 1.5, 7, dens * 0.7, pxIn, 101 + t.id * 3);
    const hi = strokes(Y, X, 0.45, 1.2, 4.5, dens * 0.5 - 0.04, pxIn, 517 + t.id * 3);
    const ink = Math.max(vi, hi);
    const sand = vnoise(t.u * 1024, t.v * 1024, 1024, 7);
    const z = 0.3 - ink * 0.12 + sand * 0.006;
    // Hairline butt joint: about one texel of shadow (its ink the same wherever the joint falls), a shallow notch.
    const jc = Math.max(0, 1 - t.edge / px);
    const h = Math.max(0, (z - jc * 0.12) * S);

    // Color: the panel's tone, soft clouds of the blend's tones, grooves in shadow, sand flecks.
    const st = t.stone, ns = st.length;
    // Panels of one blend differ only a little (the swatch render's lightest tone is partly its lit edges).
    let c = mixRGB(st[Math.min(1, ns - 1)], st[Math.floor(hash(t.id, 3) * ns)], 0.15 + hash(t.id, 4) * 0.2);
    const mf = Math.max(1, Math.round(t.T / 0.15));
    const m = fbm(t.u + hash(t.id, 5) * 9, t.v + hash(t.id, 6) * 9, mf, 4, 41);
    c = mixRGB(c, st[ns - 1], smooth(0.45, 0.72, m) * 0.45);
    c = mixRGB(c, st[0], smooth(0.45, 0.25, m) * 0.4);
    const g = vnoise(t.u * 1024, t.v * 1024, 1024, 13);
    const gn = Math.max(1, Math.round(t.T / 0.015));
    const grain = vnoise(t.u * gn, t.v * gn, gn, 17);
    c = mulRGB(c, (0.95 + sand * 0.05 + grain * 0.05 + (g > 0.99 ? 0.08 : 0)) * (1 - ink * 0.55));
    if (jc > 0) c = mixRGB(c, mulRGB(t.joint, 0.5), jc * 0.85);
    return { h, c, r: 0.82 + sand * 0.06 + ink * 0.08 };
  },
};
