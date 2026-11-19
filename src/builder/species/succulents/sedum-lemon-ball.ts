import * as THREE from 'three';
import { GeoBuilder, clamp, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { sedumCushion } from './shared-sedum';
import { fitGeo } from './shared-succulents';

/**
 * Stonecrop 'Lemon Ball', Sedum 'Lemon Ball' (sold as S. rupestre or
 * S. x 'Lemon Ball'; RHS and Plant Delights place it under S. mexicanum).
 *
 * A low, dense dome of bright lemon-chartreuse: short trailing stems root as
 * they go and turn up at the tips, each tip a little starburst of slender,
 * fleshy, needle-like leaves, so the plant reads as a tight, glowing cushion
 * of tiny stars, highest in the middle, thinning to runners at the rim. The
 * sunlit tips run yellower, the shaded inner leaves lime green. Small yellow
 * star flowers sit just over the leaves in late spring and early summer;
 * this model shows the plant out of bloom, as it is most of the year (the
 * job video, early April, shows no flowers).
 *
 * References and the numbers they give:
 * - RHS, Sedum 'Lemon Ball' (rhs.org.uk/plants/350043): the accepted name,
 *   with S. mexicanum 'Lemon Ball' and 'Lemon Coral' as synonyms; to 10 cm
 *   tall, spreading 0.1 to 0.5 m; fleshy, linear, needle-like leaves densely
 *   packed on trailing, rooting stems; yellow flowers in summer.
 * - Plant Delights Nursery, Sedum mexicanum 'Lemon Ball': 6 in tall x 3 ft
 *   wide in three years; a brighter, more heat tolerant counterpart of
 *   'Angelina'; fireworks-like yellow heads over the patch in late spring.
 * - Rogers Gardens, Lemon Ball Stonecrop (plants.rogersgardens.com, plant
 *   14427): 8 in x 12 in, fast; golden yellow to chartreuse, bronzing in
 *   winter.
 * - NC Farms (plugs), Sedum rupestre 'Lemon Ball': 4 to 6 in x 9 to 12 in.
 * - NC State Extension, Sedum mexicanum 'Lemon Coral': leaves to 3/4 in;
 *   flowers yellow stars about 1/2 in in small terminal cymes.
 * - The job video (a finished front yard, early April): one 1 gal plant by
 *   the front walk, a bright lemon-lime ball about a foot across.
 * Leaves here about 1.2 to 1.8 cm long and 2 mm wide.
 * Size used: installed from a 1 gal (a full pot spills over its rim) at
 * 0.08 m tall x 0.28 m wide; 0.15 m (6 in) tall x 0.6 m (2 ft) wide in two
 * years.
 */

/** One slender fleshy leaf: a narrow capsule, lit on top, a shade darker beneath; `yellow` 0..1 turns it toward the lemon young leaves. */
function needle(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, shade: number, yellow: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  const mix = (c0: number[], c1: number[], t: number) => c0.map((v, i) => Math.round(Math.min(255, lerp(v, c1[i], t) * shade)));
  const lit = mix([138, 182, 26], [176, 190, 30], yellow), mid = mix([110, 152, 18], [150, 164, 22], yellow), dark = mix([70, 104, 12], [100, 118, 14], yellow);
  grad.addColorStop(0, `rgb(${lit.join(',')})`);
  grad.addColorStop(0.5, `rgb(${mid.join(',')})`);
  grad.addColorStop(1, `rgb(${dark.join(',')})`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -wid * 0.3);
  g.quadraticCurveTo(len * 0.5, -wid * 0.58, len, -wid * 0.05);
  g.quadraticCurveTo(len * 1.02, 0, len, wid * 0.05);
  g.quadraticCurveTo(len * 0.5, wid * 0.58, 0, wid * 0.3);
  g.closePath();
  g.fill();
  g.restore();
}

function atlas(): THREE.Texture {
  return leafTexture('sedum-lemon-ball', 512, 512, (g) => {
    const r = rng('sedum-lemon-ball-tex');
    // Two side-view shoots, 128 x 512 each: stem base at the bottom, the starburst tip at the top.
    for (let cell = 0; cell < 2; cell++) {
      const cx = cell * 128 + 64;
      g.strokeStyle = '#8aa23a';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx, 512);
      g.lineTo(cx, 46);
      g.stroke();
      const n = 120;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = 506 - t * 462;
        const ph = i * 2.4 + cell;
        const sx = Math.sin(ph), front = Math.cos(ph);
        // Leaves stand out wide along the shoot and gather into an open star at the tip.
        const tipTight = clamp((t - 0.86) / 0.14);
        const open = lerp(1.15, 0.55, tipTight) * (0.85 + r() * 0.3);
        const len = lerp(44, 34, tipTight) * (0.8 + r() * 0.4) * lerp(0.7, 1, Math.min(1, t * 4));
        const a = -Math.PI / 2 + sx * open;
        const shade = lerp(0.8, 1.05, (front + 1) / 2) * lerp(0.82, 1.05, t) * (0.94 + r() * 0.12);
        needle(g, cx + sx * 3, y, a, len * lerp(1, 0.72, Math.abs(front) * (1 - Math.abs(sx))), 9, shade, clamp(t * 1.2 - 0.3 + (r() - 0.5) * 0.3));
      }
    }
    // A tip seen end-on: an open star of needles, the yellow young leaves in the middle.
    const star = (cx: number, cy: number, R: number) => {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const f = 1 - i / (n - 1);
        const a = i * 2.39996;
        const rad = R * 0.08 * f;
        const len = R * lerp(0.36, 0.98, f) * (0.85 + r() * 0.3);
        needle(g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, a, len, R * lerp(0.12, 0.15, f), lerp(1.1, 0.82, f) * (0.94 + r() * 0.12), clamp(1 - f * 1.1 + (r() - 0.5) * 0.2));
      }
    };
    star(384, 128, 118);
    // A patch of tips from above, the cushion's lower layer.
    g.save();
    g.beginPath();
    g.rect(256, 256, 256, 256);
    g.clip();
    for (let k = 0; k < 9; k++) star(256 + 46 + (k % 3) * 82 + (r() - 0.5) * 14, 256 + 46 + Math.floor(k / 3) * 82 + (r() - 0.5) * 14, 50);
    g.restore();
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  // A rounder dome than 'Blue Spruce', the tips a little longer, slimmer and more open.
  sedumCushion(g, r, H, Sp, { tints: ['#ffffff', '#f4f8e8', '#fbf8e6'], wid: 0.034, tips: 900, tipLen: [0.035, 0.02], dome: 2.4, rimLean: 1.05 });
  fitGeo([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: atlas(),
    look: { leafRoughness: 0.78, translucency: 0.16, bend: 0.01, flutter: 0.0015, leafShadows: true },
  };
};
