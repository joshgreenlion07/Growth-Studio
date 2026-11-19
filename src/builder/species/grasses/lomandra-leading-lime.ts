import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Lomandra confertifolia 'Limtigra', sold as Leading Lime Tight mat rush (the bill: "Lomandra c. 'Leading Lime Dwarf
 * Bright Green Mat Rush Tight'"): a compact, tight, upright tuft of very fine, stiff, bright lime-green blades, the
 * outer ones arching over at the tip, with a few older darker and straw-tipped blades low in the skirt. Flowers are
 * male and sit down in the base, hidden; it is grown for the foliage.
 *
 * References:
 * - Monrovia, Leading Lime Tight Mat Rush (monrovia.com/leadingtm-lime-tighttm-mat-rush.html): Lomandra confertifolia
 *   'Limtigra'; 1 to 2 ft tall and wide; bright green upright foliage in a compact clump; moderate growth; evergreen;
 *   male flowers form near the base where they are not seen.
 * - Emerisa Gardens (Lomandra confertifolia Leading Lime Tight): 1-2 ft x 1-2 ft.
 * - Starr Roses and Plants: the bright green foliage of Lime Tough in a smaller size.
 * - Wikimedia Commons, "Lomandra confertifolia 'Limtigra' Leading Lime Tight - San Francisco Botanical Garden"
 *   (form and color): dense upright fountains of fine blades about 3 mm wide, glossy grass green with lime light on the
 *   upper blades, darker green and brown at the base.
 *
 * Catalog size: 1 gal installed 0.23 m tall x 0.28 m wide; mature 0.45 m tall x 0.6 m wide (in Monrovia's 1-2 ft,
 * a little wider than tall as in the garden photo) in three years. Blades are drawn 4.5-6.5 mm wide (the real ones about 3 mm) so the fine texture
 * still fills the clump on screen.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const straw = col('#b8a36c');
  // Old blades in the skirt: darker, lying lower, some dry tips.
  bladeGroup(g, r, {
    count: 200, len: [0.34, 0.44], wid: [0.005, 0.006], tilt: [1.0, 1.4], bend: [0.7, 1.3], bendPow: 1.5, segs: 6, fold: 0.25, taper: 2.4,
    crownR: Sp * 0.08, cBase: col('#6a6a34'), cMid: [col('#2e5a12'), col('#38621a')], cTip: [col('#4a7418'), col('#7a7a34')],
    dryTip: 0.35, cDry: straw, early: 0.7, sway: 0.6, ao: 0.45,
  });
  // The tuft: stiff and upright, arching only near the tip.
  bladeGroup(g, r, {
    count: 720, len: [0.46, 0.56], rimLen: 0.85, wid: [0.005, 0.0065], tilt: [0.06, 1.3], tiltPow: 0.7, bend: [0.8, 1.8], bendPow: 1.7, segs: 8, fold: 0.24, taper: 2.4,
    crownR: Sp * 0.07, cBase: col('#8a904a'), cMid: [col('#346c10'), col('#3c7414'), col('#2f6410')], cTip: [col('#58901c'), col('#4e861a')],
    dryTip: 0.05, cDry: straw, early: 0.5, sway: 0.75, ao: 0.5, vary: [0.01, 0.05, 0.05],
  });
  // New growth in the heart: the brightest lime, straight up.
  bladeGroup(g, r, {
    count: 160, len: [0.44, 0.54], wid: [0.0045, 0.0055], tilt: [0.0, 0.25], bend: [0.15, 0.6], bendPow: 2.4, segs: 7, fold: 0.26, taper: 2.4,
    crownR: Sp * 0.04, cBase: col('#9aa456'), cMid: [col('#4a8a18'), col('#54941c')], cTip: [col('#6eaa24'), col('#78b028')],
    early: 0.4, sway: 0.75, ao: 0.6, vary: [0.008, 0.04, 0.04],
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: bladeMap('plain'),
    look: { leafRoughness: 0.45, translucency: 0.35, bend: 0.06, flutter: 0.005 },
  };
};
