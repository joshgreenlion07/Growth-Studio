import { GeoBuilder, col, rng, type SpeciesBuilder } from '../kit';
import { bladeGroup, bladeMap, fitClump } from './shared-grasses';

/**
 * Lomandra longifolia 'Platinum Beauty' ('Roma 13', variegated dwarf mat rush):
 * a dense, upright-then-arching tuft of very narrow, stiff blades, each gray-green
 * with a cream-white stripe down the middle and cream-white margins, so the
 * whole clump reads pale cream-green. The inner blades stand nearly straight up;
 * the outer ones arch out and lay their tips on the ground. No showy flowers
 * (the patent saw none; small cream spikes hide among the leaves when they come).
 *
 * References:
 * - US Plant Patent PP25,962 ('Roma 13'), https://patents.google.com/patent/USPP25962 :
 *   height 70 cm, spread 105 cm; leaf 65 cm long, 4.5 mm wide; gray-green (RHS 191A) with a
 *   yellow-white (RHS 158A) center stripe and margins; upright and arching, compact tufting habit.
 * - Sunset Plant Collection, https://sunsetplantcollection.com/the-collection/plant/platinum-beauty/ :
 *   3-4 ft tall x 3-5 ft wide; long green leaves with thin white striping; Sunset zones 8, 9, 12-24.
 * - Devil Mountain Nursery (N. California), https://devilmountainnursery.com/lomandra-longifolia-platinum-beauty :
 *   3-4 ft x 3-4 ft; arching green leaves with bright white stripes; evergreen soft mound.
 * - Retail listings put it at 2-3 ft x 2-3 ft and note more yellow (cream) variegation than 'Arctic Frost'.
 *
 * Size used: 5 gal installed at about 0.55 m tall x 0.75 m wide (the finished job's photos, three
 * weeks after planting: about 1.8-2 ft tall against the 6 ft fence boards, blades splayed to about
 * 2.5 ft); mature 0.75 m x 1.0 m in three years (patent size, a little under the Sunset figure for a
 * Central Valley bed). Blades are drawn 6-8.5 mm wide, a little over the patent's 4.5 mm (the photo
 * blades look 5-8 mm), so the fine texture still covers the clump on screen.
 */

/** Blade strips in true color: gray-green with cream margins and a cream center stripe. */
function stripes() {
  return bladeMap('lomandra-platinum-beauty', {
    fill: '#3a6c20',
    rib: 0.04,
    veins: 0.05,
    extra: (g, x0, x1, h, strip) => {
      const w = x1 - x0;
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, '#366820');
      grad.addColorStop(0.5, '#447a28');
      grad.addColorStop(1, '#386a22');
      g.fillStyle = grad;
      g.fillRect(x0, 0, w, h);
      // Margins and center stripe (strip 0 broad, strip 1 narrower), a little irregular along the blade.
      const m = strip === 0 ? 0.095 : 0.07, c = strip === 0 ? 0.09 : 0.06;
      const rows = 32;
      g.fillStyle = '#e8e2a6';
      for (let k = 0; k < rows; k++) {
        const y = (h * k) / rows, hh = h / rows + 1;
        const wob = 1 + Math.sin(k * 0.7 + strip * 2) * 0.12;
        g.fillRect(x0, y, w * m * wob, hh);
        g.fillRect(x1 - w * m * (2 - wob), y, w * m * (2 - wob), hh);
        g.fillRect(x0 + w * (0.5 - (c / 2) * wob), y, w * c * wob, hh);
      }
      // Fine yellow-white pinstripes in the green bands, as on the real leaf.
      g.fillStyle = 'rgba(232,226,166,0.4)';
      g.fillRect(x0 + w * (strip === 0 ? 0.3 : 0.27), 0, 2, h);
      if (strip === 1) g.fillRect(x0 + w * 0.71, 0, 2, h);
    },
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const straw = col('#c4ae7a');
  const base = col('#efe9cf'); // pale clasping leaf bases
  // Old outer blades: lower, lying out over the mulch, a little dimmer, some dry tips.
  bladeGroup(g, r, {
    count: 130, len: [0.42, 0.58], wid: [0.007, 0.0085], tilt: [0.75, 1.15], bend: [0.7, 1.3], bendPow: 1.5, segs: 7, fold: 0.22, taper: 2.6,
    crownR: Sp * 0.09, cBase: base, cMid: [col('#e2e4d6'), col('#d6dacb')], cTip: [col('#e4e6d8')],
    dryTip: 0.3, cDry: straw, early: 0.55, sway: 0.7, ao: 0.5, vary: [0.006, 0.03, 0.06],
  });
  // The main tuft: stiff blades standing up, the outer ones arching over near the tip.
  bladeGroup(g, r, {
    count: 400, len: [0.62, 0.76], rimLen: 0.78, wid: [0.007, 0.0086], tilt: [0.04, 0.78], tiltPow: 0.9, bend: [0.5, 1.6], bendPow: 2.0, segs: 9, fold: 0.22, taper: 2.6,
    crownR: Sp * 0.08, cBase: base, cMid: [col('#f2f4ea'), col('#eaeee0'), col('#f6f6ec')], cTip: [col('#f4f6ec'), col('#ecf0e0')],
    dryTip: 0.08, cDry: straw, early: 0.45, sway: 0.85, ao: 0.5, vary: [0.006, 0.03, 0.05],
  });
  // New blades in the heart: the straightest and brightest.
  bladeGroup(g, r, {
    count: 110, len: [0.6, 0.72], wid: [0.006, 0.0075], tilt: [0.0, 0.22], bend: [0.25, 0.9], bendPow: 2.2, segs: 8, fold: 0.24, taper: 2.6,
    crownR: Sp * 0.045, cBase: base, cMid: [col('#fafbf0'), col('#f6f8ea')], cTip: [col('#fbfcf2')],
    early: 0.4, sway: 0.85, ao: 0.6, vary: [0.005, 0.03, 0.04],
  });
  fitClump([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: stripes(),
    look: { leafRoughness: 0.42, translucency: 0.32, bend: 0.12, flutter: 0.008 },
  };
};
