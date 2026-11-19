import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Lomandra longifolia 'Miner's Gold' ('KM-MG24', a gold selection by Keith and Jennifer Miner): a compact, weeping
 * mound of narrow, smooth, bright golden-yellow to chartreuse blades. The center blades stand up; the ones around them
 * rise, spill outward and arch down to lay their tips on the ground. Older blades low in the clump turn more green, and
 * a few tips dry to straw. Flowers are small and held down inside the foliage.
 *
 * References:
 * - US Plant Patent PP33,984 ('KM-MG24', patents.google.com/patent/USPP33984): 15-month plants grown from 1 gal
 *   containers, 50 cm tall and 76 cm across in the landscape; leaves linear, 4 mm wide, smooth, slightly glossy becoming
 *   matte; color RHS 7A, 10A (yellow) and 143A (green); compact with arching, weeping leaves; panicles 8 cm, inside the
 *   foliage.
 * - Flora Grubb Gardens and Native Sons (Lomandra longifolia 'Miner's Gold'): 2-3 ft tall and wide; foliage chartreuse
 *   yellow; yellow summer blooms.
 * - Promesse de Fleurs: leaves 40-60 cm long, chartreuse to golden yellow in full sun, softer golden green in shade.
 * - Concept Plants and El Nativo Growers photos (1 gal and planted rows): bright gold-yellow fountains, greener at the
 *   base.
 *
 * Catalog size: 1 gal installed 0.25 m tall x 0.3 m wide; mature 0.55 m x 0.8 m (the patent's 50 x 76 cm, a touch
 * over it at full size) in two years. Blades are drawn 6.5-8 mm wide (the patent's 4 mm) so the clump fills on screen.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const straw = col('#c2a868');
  // Old outer blades: greener gold, lying over the mulch, some dry tips.
  bladeGroup(g, r, {
    count: 170, len: [0.44, 0.58], wid: [0.0065, 0.0075], tilt: [0.85, 1.3], bend: [0.7, 1.4], bendPow: 1.4, segs: 7, fold: 0.22, taper: 2.4,
    crownR: Sp * 0.08, cBase: col('#6e6a24'), cMid: [col('#6e7c08'), col('#7c840a')], cTip: [col('#94900e'), col('#8a8024')],
    dryTip: 0.3, cDry: straw, early: 0.65, sway: 0.7, ao: 0.5,
  });
  // The weeping mound: blades rise, then spill out and down.
  bladeGroup(g, r, {
    count: 520, len: [0.6, 0.72], rimLen: 0.75, wid: [0.0065, 0.008], tilt: [0.1, 0.95], tiltPow: 0.85, bend: [1.2, 2.1], bendPow: 1.5, segs: 9, fold: 0.22, taper: 2.4,
    crownR: Sp * 0.075, cBase: col('#86841e'), cMid: [col('#9e8a00'), col('#968c02'), col('#a69202')], cTip: [col('#b29e06'), col('#a69804')],
    dryTip: 0.08, cDry: straw, early: 0.5, sway: 0.85, ao: 0.5, vary: [0.01, 0.05, 0.05],
  });
  // New blades in the heart: the brightest gold, upright.
  bladeGroup(g, r, {
    count: 130, len: [0.56, 0.66], wid: [0.005, 0.006], tilt: [0.0, 0.3], bend: [0.6, 1.3], bendPow: 2.0, segs: 8, fold: 0.24, taper: 2.4,
    crownR: Sp * 0.04, cBase: col('#9a9628'), cMid: [col('#bca600'), col('#c2aa04')], cTip: [col('#c8b00a')],
    early: 0.4, sway: 0.85, ao: 0.6, vary: [0.008, 0.04, 0.04],
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: bladeMap('plain'),
    look: { leafRoughness: 0.5, translucency: 0.4, bend: 0.1, flutter: 0.007 },
  };
};
