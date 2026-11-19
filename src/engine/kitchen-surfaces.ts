import { counterFinish, veneerFinish, type CounterFinish } from '../siteplan/kitchen';
import { ledgerPaint } from './fountain-surfaces';
import { clamp01, fbm, smooth, vnoise, voronoi } from './noise';
import { hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from './textures';

/*
 * Surfaces of the outdoor kitchen parts (builder/kitchen/): brushed stainless, the countertop slabs (granite, exterior
 * quartz, concrete) and the island veneers that have no fitted texture of their own. Keys start `kit:` and are painted
 * in the texture worker (texture-recipes.ts runs kitchenRecipe).
 */

/** The worker's side: a `kit:` key back to its set, or null. */
export function kitchenRecipe(key: string): PBRSet | null {
  if (key === 'kit:stainless') return paintStainless();
  const c = /^kit:counter:(.+)$/.exec(key);
  if (c) return paintCounter(counterFinish(c[1]));
  const v = /^kit:veneer:(.+)$/.exec(key);
  if (v) return paintVeneer(v[1]);
  return null;
}

/**
 * Brushed (No. 4) stainless: fine straight grain lines along u, a few deeper scratches, and a slow cloud where the
 * brushing pressure changed. Mostly in the roughness and a faint normal; the color stays near even (a metal's color is
 * its reflection). 25 cm repeat; the grain runs along a face's u (along x on fronts and tops).
 */
export const stainlessSet = () => textureSet('kit:stainless', paintStainless);
function paintStainless(): PBRSet {
  return paint(512, 0.25, 1.6, (u, v) => {
    // Grain: noise along v only (one value a row), so every line runs the full width.
    const g1 = vnoise(3.3, v * 640, 640, 11), g2 = vnoise(7.7, v * 210, 210, 13), g3 = vnoise(1.9, v * 1280, 1280, 17);
    const cloud = fbm(u, v, 3, 3, 19);
    // Lines that break off along their length.
    const breakup = smooth(0.35, 0.7, vnoise(u * 24, v * 24, 24, 23));
    const scratch = vnoise(5.1, v * 900, 900, 29) > 0.985 ? breakup : 0;
    const grain = g1 * 0.45 + g2 * 0.3 + g3 * 0.25;
    const k = 0.93 + (grain - 0.5) * 0.08 + (cloud - 0.5) * 0.05 - scratch * 0.06;
    const c: RGB = [k, k, k * 1.01];
    return { h: 0.5 + (grain - 0.5) * 0.6 - scratch * 0.3, c, r: 0.26 + grain * 0.26 + (cloud - 0.5) * 0.1 + scratch * 0.15 };
  });
}

/** A countertop finish's set. */
export const counterSet = (id: string) => textureSet(`kit:counter:${counterFinish(id).id}`, () => paintCounter(counterFinish(id)));

function paintCounter(f: CounterFinish): PBRSet {
  const t = f.tones.map(hexRGB);
  if (f.kind === 'granite') {
    // Polished granite, 60 cm repeat: interlocking crystals 2 to 6 mm (two Voronoi layers), each a mineral picked by
    // share: the ground tone, light feldspar and quartz, a mid gray, dark hornblende and small black biotite flecks;
    // quartz grains are a little glassy (darker, smoother). A slow cloud shifts the mix across the slab.
    return paint(1024, 0.6, 0.4, (u, v) => {
      const cloud = fbm(u, v, 3, 4, 41);
      const big = voronoi(u, v, 110, 43), fine = voronoi(u, v, 240, 47), fleck = voronoi(u, v, 330, 53, 1);
      const q = clamp01(big.id + (cloud - 0.5) * 0.25);
      let c = q < 0.42 ? t[0] : q < 0.66 ? t[1] : q < 0.84 ? t[2] : t[3];
      // Finer crystals break up the large ones.
      const fq = fine.id;
      if (fq < 0.2) c = mixRGB(c, t[1], 0.7);
      else if (fq > 0.86) c = mixRGB(c, t[3], 0.75);
      const black = fleck.id < 0.07 && fleck.f1 < 0.42;
      if (black) c = t[4];
      const glassy = q >= 0.42 && q < 0.66 && fq > 0.5;
      c = mulRGB(c, 0.97 + (vnoise(u * 700, v * 700, 700, 59) - 0.5) * 0.06 - (glassy ? 0.06 : 0));
      // Crystal boundaries: faint dark lines.
      c = mulRGB(c, 1 - smooth(0.06, 0, big.f2 - big.f1) * 0.12);
      const pit = vnoise(u * 900, v * 900, 900, 61) > 0.992;
      return { h: 0.5 - (pit ? 0.4 : 0), c, r: f.roughness + (glassy ? -0.05 : 0) + (pit ? 0.4 : 0) + (black ? -0.04 : 0) };
    });
  }
  if (f.kind === 'quartz') {
    // Exterior quartz, 1.2 m repeat: an even white ground with a soft cloud and long, branching gray veins.
    return paint(1024, 1.2, 0.2, (u, v) => {
      const warp = fbm(u, v, 2, 4, 71);
      const vein = Math.abs(fbm(u + warp * 0.35, v * 0.6 + warp * 0.2, 3, 5, 73) - 0.5);
      const fineVein = Math.abs(fbm(u * 2 + warp, v * 2, 5, 4, 79) - 0.5);
      let c = mixRGB(t[0], t[1], fbm(u, v, 4, 3, 83));
      c = mixRGB(c, t[2], smooth(0.03, 0.0, vein) * 0.8);
      c = mixRGB(c, t[3], smooth(0.012, 0.0, fineVein) * 0.5);
      c = mulRGB(c, 0.99 + (vnoise(u * 600, v * 600, 600, 89) - 0.5) * 0.03);
      return { h: 0.5, c, r: f.roughness };
    });
  }
  // Sealed concrete, 1 m repeat: trowel clouds, fine sand, a few pinholes and small aggregate showing.
  return paint(1024, 1, 1.2, (u, v) => {
    const cloud = fbm(u, v, 4, 5, 91);
    const trowel = fbm(u * 0.6, v * 1.4, 6, 3, 93);
    const sand = vnoise(u * 800, v * 800, 800, 97);
    const agg = voronoi(u, v, 120, 101);
    const pin = vnoise(u * 500, v * 500, 500, 103) > 0.985;
    let c = mixRGB(t[2], t[1], smooth(0.25, 0.75, cloud * 0.7 + trowel * 0.3));
    if (agg.id < 0.05 && agg.f1 < 0.3) c = mixRGB(c, t[3], 0.5);
    c = mulRGB(c, 0.97 + (sand - 0.5) * 0.06 - (pin ? 0.3 : 0));
    return { h: 0.5 + sand * 0.1 - (pin ? 0.5 : 0), c, r: f.roughness + (sand - 0.5) * 0.08 + (pin ? 0.3 : 0) };
  });
}

/** A ledger veneer drawn from its own tones (the MSI colors without a fitted texture). */
export const veneerSet = (id: string) => textureSet(`kit:veneer:${veneerFinish(id).id}`, () => paintVeneer(id));

function paintVeneer(id: string): PBRSet {
  const v = veneerFinish(id);
  const tones = v.tones ?? ['#b0aca4'];
  return ledgerPaint(`kit-veneer-${v.id}`, {
    tones,
    weights: v.weights ?? tones.map(() => 1 / tones.length),
    rowIn: v.rowIn ?? [1.4, 2],
    pieceIn: v.pieceIn ?? [4, 12],
    rust: v.rust,
    quartz: v.quartz,
  }, v.mean ?? [0.2, 0.19, 0.17]);
}
