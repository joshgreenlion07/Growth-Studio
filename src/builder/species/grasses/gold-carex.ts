import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Carex oshimensis 'Everillo' (EverColor sedge): a low mop of arching,
 * weeping blades, glowing lime-gold to chartreuse, greener where shaded and
 * on the oldest leaves.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  // Oldest blades at the skirt: greener, lying on the ground, some dry tips.
  bladeGroup(g, r, {
    count: 90, len: [0.16, 0.22], wid: [0.006, 0.008], tilt: [0.8, 1.2], bend: [0.5, 1.2], bendPow: 1.3, segs: 5, fold: 0.26, crownR: Sp * 0.1,
    cBase: col('#8f9440'), cMid: [col('#6c8c12'), col('#80a010')], cTip: [col('#94a814')], dryTip: 0.4, cDry: col('#c2a868'),
    early: 0.8, sway: 0.6, ao: 0.5, taper: 2.2,
  });
  // The weeping mop.
  bladeGroup(g, r, {
    count: 300, len: [0.4, 0.5], rimLen: 0.5, wid: [0.006, 0.0085], tilt: [0.08, 0.8], tiltPow: 0.85, bend: [1.7, 2.5], bendPow: 1.15, segs: 8, fold: 0.26, crownR: Sp * 0.09,
    cBase: col('#9aa630'), cMid: [col('#86a408'), col('#9cb20a'), col('#acb80c'), col('#b8bc0e')], cTip: [col('#bcbc10'), col('#a8b40c')], dryTip: 0.08, cDry: col('#c8b070'),
    early: 0.55, sway: 0.85, ao: 0.55, taper: 2.2,
  });
  // New blades in the heart: the brightest gold.
  bladeGroup(g, r, {
    count: 70, len: [0.4, 0.48], wid: [0.0055, 0.0075], tilt: [0.03, 0.3], bend: [1.5, 2.1], bendPow: 1.5, segs: 7, fold: 0.28, crownR: Sp * 0.05,
    cBase: col('#a8ae34'), cMid: [col('#bcc00e'), col('#c8c412')], cTip: [col('#ccc414')], early: 0.4, sway: 0.85, ao: 0.65, taper: 2.2,
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: bladeMap('plain'),
    look: { leafRoughness: 0.5, translucency: 0.4, bend: 0.1, flutter: 0.008 },
  };
};
