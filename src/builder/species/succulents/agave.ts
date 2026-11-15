import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Agave, modeled on Agave 'Blue Glow' (A. attenuata x A. ocahui): a solitary,
 * very regular rosette, about 2 ft tall by 3 ft wide, of many stiff, narrow,
 * sword-shaped blue-green leaves. Each leaf has a thin red edge with a yellow
 * line just inside it (it glows when backlit) and a short dark red terminal
 * spine. Leaves are solid geometry: guttered above, keeled below.
 */

function skin(): THREE.Texture {
  return leafTexture('agave-blue-glow', 512, 1024, (g, w, h) => {
    const r = rng('agave-blue-glow-skin');
    const half = w / 2;
    const margin = [{ w: 0.026, color: '#8a1d1a' }, { w: 0.012, color: '#c8832c' }, { w: 0.02, color: '#d8c860' }];
    // Upper face.
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#84a67c', '#4f8778', '#3f7a72', '#3c7772', '#457b7c'],
      bloom: { n: 260, color: 'rgba(196,222,222,1)', alpha: 0.13, size: 22 },
      streaks: { n: 420, dark: '#2f5f5e', light: '#a9cfca', alpha: 0.22 },
      imprints: { n: 3, light: '#c2dedb', dark: '#2c5a5a', alpha: 0.4 },
      margin,
      marginFlare: 2.2,
      tip: { color: '#4a1210', frac: 0.058, soft: 0.012 },
    });
    // Lower face: a touch paler and grayer, with stronger imprints.
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#8eae86', '#5c9080', '#4b827a', '#49807a', '#4e8380'],
      bloom: { n: 300, color: 'rgba(206,228,226,1)', alpha: 0.16, size: 24 },
      streaks: { n: 420, dark: '#33625f', light: '#b4d4ce', alpha: 0.2 },
      imprints: { n: 4, light: '#cbe3df', dark: '#2f5c5b', alpha: 0.5 },
      margin,
      marginFlare: 2.2,
      tip: { color: '#4a1210', frac: 0.058, soft: 0.012 },
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const N = 96;
  const L = Sp * 0.47, W = Sp * 0.058;
  const thetaMax = 1.5;
  const fresh = col('#ffffff'), old = col('#d9dccb'), young = col('#eef6ee');

  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0 the youngest leaf in the center, 1 the oldest at the outside
    const az = i * GOLDEN + (r() - 0.5) * 0.12;
    // Leaves fill a ball evenly: upright and tight in the center, level and just below level outside.
    const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
    const theta = lerp(f * thetaMax, even, 0.65) + (r() - 0.5) * 0.06 + 0.03;
    const len = L * lerp(0.7, 1, smoothstep(0, 0.22, f)) * lerp(1, 0.86, smoothstep(0.7, 1, f)) * (0.95 + r() * 0.1);
    const wid = W * lerp(0.72, 1, smoothstep(0, 0.3, f)) * (0.94 + r() * 0.12);
    const coreR = Sp * lerp(0.008, 0.05, Math.pow(f, 0.7));
    const base = V(Math.cos(az) * coreR, H * lerp(0.2, 0.035, Math.pow(f, 0.8)), Math.sin(az) * coreR);
    const inner = f < 0.3;
    const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.25, f)).lerp(old, smoothstep(0.6, 1, f) * 0.8), r, 0.008, 0.04, 0.035);
    const birth = f < 0.14 || r() < 0.5 ? 0 : clamp(0.1 + r() * 0.75);
    const curve = lerp(-0.1, -0.24, f) + (r() - 0.5) * 0.08;
    const swT = tipSway(base.y + Math.cos(theta) * len, Math.sin(theta) * len, H, Sp);
    solidLeaf(leaves, {
      base, az, theta, len,
      halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.42, 0.74, 1.9, 0.045),
      thick: (t) => wid * lerp(0.42, 0.07, Math.pow(t, 0.55)),
      cup: (t) => lerp(0.2, 0.62, smoothstep(0, 0.5, t)) * lerp(1, 1.25, smoothstep(0.75, 1, t)),
      bend: (t) => curve * (0.5 + t),
      twist: (r() - 0.5) * 0.12,
      yaw: (r() - 0.5) * 0.05,
      segs: inner ? 6 : 9,
      cols: inner ? 3 : 5,
      tipLen: len * 0.04,
      uvTop: [0.012, 0.488],
      uvBot: [0.512, 0.988],
      color: tint,
      shade: (t) => lerp(0.42, 1, smoothstep(0, 0.4, t)) * (inner ? 0.94 : 1),
      birth,
      anchor: base,
      sway0: 0,
      sway1: swT,
    });
  }

  // The short woody core the leaves clasp, mostly hidden.
  const core = [V(0, -0.03, 0), V(0, H * 0.03, 0), V(0, H * 0.08, 0)];
  tube(leaves, core, Sp * 0.045, Sp * 0.012, 8, col('#6a5a48', 0.45), 0, V(), () => 0, 1);
  // Point the core's texture lookups at the dull leaf base.
  for (let i = leaves.uv.length - 9 * 3 * 2; i < leaves.uv.length; i += 2) {
    leaves.uv[i] = 0.25;
    leaves.uv[i + 1] = 0.02;
  }

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.5, translucency: 0.16, bend: 0.012, flutter: 0 },
  };
};
