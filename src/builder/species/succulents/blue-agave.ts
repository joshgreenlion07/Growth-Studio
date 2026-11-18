import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Blue agave, Agave tequilana 'Weber Azul' (Weber's blue agave): a dense, nearly round rosette of many rigid, narrow,
 * sword-shaped leaves held straight out from the core, from upright in the middle to about level outside. The leaves
 * are blue-gray under a waxy bloom, shallowly guttered above, with small brown teeth along the margins and a sharp
 * dark brown terminal spine.
 *
 * References (sizes for a Central Valley landscape planting):
 * - Devil Mountain Nursery, Agave tequilana 'Weber Blue': mature about 5 ft tall and 5 ft wide.
 * - Gardenia.net, Agave tequilana (blue agave): 5-8 ft tall and wide; blue-gray; offsets freely.
 * - Dimensions.com, blue agave: 5-8 ft tall, 6-10 ft across.
 * - Gardentags / World of Succulents: leaves 3-4 ft (to about 4 1/2 ft) long, narrow, rigid, blue-gray, marginal teeth
 *   and a sharp brown terminal spine.
 * Catalog: 5 x 6 ft at maturity (about 8 years); a 5 gal plant about 16 x 20 in.
 */

function skin(): THREE.Texture {
  return leafTexture('agave-tequilana-weber-blue', 512, 1024, (g, w, h) => {
    const r = rng('agave-tequilana-skin');
    const half = w / 2;
    // Small brown teeth along each margin, about every 3/4 in on a 4 ft leaf, curved a little toward the tip.
    const teeth = (gg: CanvasRenderingContext2D, x0: number, ww: number, hh: number) => {
      gg.fillStyle = '#5b3a26';
      for (const s of [0, 1]) {
        const edge = s ? x0 + ww : x0, sgn = s ? -1 : 1;
        for (let y = hh * 0.08; y < hh * 0.9; y += hh * (0.016 + r() * 0.006)) {
          const d = ww * 0.05 * (0.7 + r() * 0.5);
          gg.beginPath();
          gg.moveTo(edge, y + d * 0.9);
          gg.lineTo(edge + sgn * d * 0.55, y - d * 0.15);
          gg.lineTo(edge, y - d * 0.5);
          gg.closePath();
          gg.fill();
        }
      }
    };
    const face = (x0: number, upper: boolean) =>
      paintSkin(g, x0, half, h, {
        r,
        // Pale and greener where the leaf clasps the core, blue-gray along the blade.
        // Darker than it looks: the foliage light lifts a leaf skin a good deal (compare 'Blue Glow').
        ramp: upper ? ['#66705a', '#455f69', '#3a5664', '#3b5866', '#405e6b'] : ['#6d785f', '#4c666e', '#41606b', '#425f6c', '#486672'],
        bloom: { n: 300, color: 'rgba(170,190,198,1)', alpha: upper ? 0.14 : 0.18, size: 24 },
        streaks: { n: 380, dark: '#36505a', light: '#86a0a8', alpha: 0.18 },
        imprints: { n: upper ? 2 : 3, light: '#9db3b8', dark: '#344d56', alpha: 0.3 },
        margin: [{ w: 0.014, color: '#4a3a2c' }, { w: 0.012, color: '#6b7a66' }],
        marginFlare: 1.6,
        extra: teeth,
        tip: { color: '#3b2418', frac: 0.05, soft: 0.02 },
      });
    face(0, true);
    face(half, false);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const N = 92;
  const L = Sp * 0.5, W = Sp * 0.066;
  const thetaMax = 1.42;
  const fresh = col('#ffffff'), old = col('#d6dacd'), young = col('#eef4f2');

  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0 the youngest leaf in the center, 1 the oldest at the outside
    const az = i * GOLDEN + (r() - 0.5) * 0.1;
    // A fuller ball than 'Blue Glow': more leaves held steeply, the outer ones just above level.
    const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
    const theta = lerp(f * thetaMax, even, 0.75) + (r() - 0.5) * 0.07 + 0.02;
    const len = L * lerp(0.62, 1, smoothstep(0, 0.25, f)) * lerp(1, 0.9, smoothstep(0.75, 1, f)) * (0.94 + r() * 0.12);
    const wid = W * lerp(0.7, 1, smoothstep(0, 0.3, f)) * (0.92 + r() * 0.14);
    const coreR = Sp * lerp(0.008, 0.045, Math.pow(f, 0.7));
    const base = V(Math.cos(az) * coreR, H * lerp(0.16, 0.03, Math.pow(f, 0.8)), Math.sin(az) * coreR);
    const inner = f < 0.3;
    const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.25, f)).lerp(old, smoothstep(0.65, 1, f) * 0.7), r, 0.006, 0.03, 0.03);
    const birth = f < 0.16 || r() < 0.55 ? 0 : clamp(0.1 + r() * 0.75);
    // Rigid: almost straight, the outer leaves only a touch upturned at the tip.
    const curve = lerp(-0.03, -0.1, f) + (r() - 0.5) * 0.05;
    const swT = tipSway(base.y + Math.cos(theta) * len, Math.sin(theta) * len, H, Sp);
    solidLeaf(leaves, {
      base, az, theta, len,
      halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.32, 0.72, 1.35, 0.04),
      thick: (t) => wid * lerp(0.4, 0.06, Math.pow(t, 0.55)),
      cup: (t) => lerp(0.14, 0.38, smoothstep(0, 0.5, t)),
      bend: (t) => curve * (0.4 + t),
      twist: (r() - 0.5) * 0.1,
      yaw: (r() - 0.5) * 0.04,
      segs: inner ? 6 : 9,
      cols: inner ? 3 : 5,
      tipLen: len * 0.035,
      uvTop: [0.012, 0.488],
      uvBot: [0.512, 0.988],
      color: tint,
      shade: (t) => lerp(0.45, 1, smoothstep(0, 0.4, t)) * (inner ? 0.95 : 1),
      birth,
      anchor: base,
      sway0: 0,
      sway1: swT,
    });
  }

  // The short core the leaves clasp, mostly hidden.
  const core = [V(0, -0.03, 0), V(0, H * 0.03, 0), V(0, H * 0.07, 0)];
  tube(leaves, core, Sp * 0.04, Sp * 0.012, 8, col('#6f6352', 0.45), 0, V(), () => 0, 1);
  // Point the core's texture lookups at the dull leaf base.
  for (let i = leaves.uv.length - 9 * 3 * 2; i < leaves.uv.length; i += 2) {
    leaves.uv[i] = 0.25;
    leaves.uv[i + 1] = 0.02;
  }

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.6, translucency: 0.1, bend: 0.008, flutter: 0 },
  };
};
