import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Lomandra longifolia 'Breeze' (dwarf mat rush): a dense evergreen fountain
 * of fine, glossy, bright mid-green strappy blades that arch over evenly to
 * the ground. No showy flowers.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const straw = col('#b9a26a');
  // Old outer blades: darker, lying lower, some with dry tips.
  bladeGroup(g, r, {
    count: 150, len: [0.4, 0.55], wid: [0.009, 0.012], tilt: [0.8, 1.2], bend: [0.6, 1.2], bendPow: 1.4, segs: 6, fold: 0.22, taper: 2.4,
    crownR: Sp * 0.1, cBase: col('#8d8a4e'), cMid: [col('#3f6a26'), col('#4d7a2c')], cTip: [col('#5c8a30'), col('#8a8a44')],
    dryTip: 0.35, cDry: straw, early: 0.75, sway: 0.7, ao: 0.5,
  });
  // The main fountain.
  bladeGroup(g, r, {
    count: 380, len: [0.85, 1.05], rimLen: 0.7, wid: [0.009, 0.0125], tilt: [0.08, 0.85], tiltPow: 0.85, bend: [1.5, 2.3], bendPow: 1.4, segs: 9, fold: 0.22, taper: 2.4,
    crownR: Sp * 0.09, cBase: col('#a3a860'), cMid: [col('#4a8029'), col('#5a9230'), col('#68a036')], cTip: [col('#5f9a32'), col('#74a83c')],
    dryTip: 0.12, cDry: straw, early: 0.55, sway: 0.9, ao: 0.5,
  });
  // New growth in the center: brighter, more upright, shorter.
  bladeGroup(g, r, {
    count: 110, len: [0.85, 1.0], wid: [0.008, 0.011], tilt: [0.02, 0.3], bend: [1.3, 2.0], bendPow: 1.6, segs: 8, fold: 0.24, taper: 2.4,
    crownR: Sp * 0.05, cBase: col('#b4bb6c'), cMid: [col('#6aa636'), col('#7ab53e')], cTip: [col('#8cc248')],
    early: 0.4, sway: 0.9, ao: 0.6,
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: bladeMap('plain'),
    look: { leafRoughness: 0.38, translucency: 0.3, bend: 0.14, flutter: 0.01 },
  };
};
