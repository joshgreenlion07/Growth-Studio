import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Ophiopogon japonicus 'Nana' (dwarf mondo grass): a very low, dense, dark
 * green tuft of short recurving blades, mass planted as a carpet. Kept light:
 * it is planted by the hundred.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  bladeGroup(g, r, {
    count: 300, len: [0.085, 0.12], rimLen: 0.6, wid: [0.0042, 0.0055], tilt: [0.15, 1.1], tiltPow: 0.8, bend: [1.4, 2.4], bendPow: 1.1, segs: 5, fold: 0.3, crownR: Sp * 0.2,
    cBase: col('#5a6a3a'), cMid: [col('#122b16'), col('#183418'), col('#1f3f1b')], cTip: [col('#1c3a1a'), col('#24461e')],
    early: 0.62, sway: 0.5, ao: 0.45, taper: 3.4, baseW: 0.7,
  });
  // Fresh blades in the heart, a little lighter.
  bladeGroup(g, r, {
    count: 70, len: [0.08, 0.11], wid: [0.0038, 0.005], tilt: [0.05, 0.6], bend: [1.2, 2.0], bendPow: 1.2, segs: 5, fold: 0.3, crownR: Sp * 0.12,
    cBase: col('#6c7c44'), cMid: [col('#22461d'), col('#2a5022')], cTip: [col('#305a26')], early: 0.5, sway: 0.5, ao: 0.55, taper: 3.4, baseW: 0.7,
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: bladeMap('plain'),
    look: { leafRoughness: 0.42, translucency: 0.15, bend: 0.03, flutter: 0.003, leafShadows: true },
  };
};
