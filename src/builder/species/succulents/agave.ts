import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Agave 'Blue Glow' (A. attenuata x A. ocahui), a solitary, very regular rosette of stiff, smooth, lance-shaped
 * blue-green leaves. Each leaf is thick, slightly concave above and keeled below, widest a little above its base and
 * tapering evenly to a short dark red-brown terminal spine. The margin is a thin red line with a narrow yellow band
 * just inside it, which glows when the sun is behind the plant. The youngest leaves stand pressed together in an
 * upright central cone; the oldest ones reach out nearly level. It does not make pups.
 *
 * References:
 * - Monrovia, Blue Glow Agave (monrovia.com/blue-glow-agave.html): slow growing rosette, 18 in tall x 24 in wide;
 *   smooth blue-green leaves with yellow-edged red margins, a single symmetrical rosette, short red terminal spine.
 * - Everde Growers and Star Nursery (Blue Glow Agave): solitary rosettes slowly growing to 2 ft tall x 3 ft wide.
 * - Emerisa Gardens: leaves about 12 in long x 1-1.5 in wide. World of Succulents: leaves to 18 in x 1.5 in.
 *   LLIFLE encyclopedia: leaves to 40 cm long x 2.5-3.5 cm wide.
 * - Flora Grubb plant guide: 18-30 in tall, generally solitary. Monrovia's close-up photos: leaves lance-shaped,
 *   widest about a third of the way up, the margin a fine red line with a narrow yellow band inside it.
 *
 * Targets: mature 2 ft x 3 ft (catalog 0.6 x 0.9 m), about 52 leaves, each about 6 times as long as wide at its
 * widest; about four fifths of them already there at install from a 5 gal (catalog 1 ft x 1.3 ft).
 */

function skin(): THREE.Texture {
  return leafTexture('agave-blue-glow-v2', 512, 1024, (g, w, h) => {
    const r = rng('agave-blue-glow-skin-v2');
    const half = w / 2;
    // Thin red edge, a hair of orange, then a narrow yellow band inside it.
    const margin = [{ w: 0.022, color: '#6c1a16' }, { w: 0.007, color: '#8e4a26' }, { w: 0.013, color: '#a99a52' }];
    // Upper face: blue-green with a light waxy bloom; the clasping base is paler and yellower (it grows in shade).
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#646c52', '#384639', '#2b392f', '#29372e', '#2b392f'],
      bloom: { n: 160, color: 'rgba(160,184,176,1)', alpha: 0.06, size: 18 },
      streaks: { n: 380, dark: '#2a4339', light: '#8aa89c', alpha: 0.18 },
      imprints: { n: 3, light: '#9ab6aa', dark: '#263e35', alpha: 0.3 },
      margin,
      marginFlare: 2,
      tip: { color: '#3a1410', frac: 0.06, soft: 0.014 },
    });
    // Lower face: the keel side, a touch grayer and paler.
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#6c7258', '#3f4d41', '#324137', '#303f36', '#324137'],
      bloom: { n: 180, color: 'rgba(170,192,184,1)', alpha: 0.07, size: 20 },
      streaks: { n: 380, dark: '#2e483e', light: '#94b0a4', alpha: 0.16 },
      imprints: { n: 4, light: '#a2bcb0', dark: '#2a4239', alpha: 0.36 },
      margin,
      marginFlare: 2,
      tip: { color: '#3a1410', frac: 0.06, soft: 0.014 },
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const N = 52;
  // Built at a natural scale (leaf length 1) and fitted to the catalog size at the end.
  const L = 1, W = 0.16;
  const thetaMax = 1.45;
  const fresh = col('#ffffff'), old = col('#e4e6d8'), young = col('#f2f6ea');

  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0 the youngest leaf in the center, 1 the oldest at the outside
    const az = i * GOLDEN + (r() - 0.5) * 0.08;
    // The youngest leaves stand pressed together in a cone; the rest spread evenly over a ball, the oldest nearly level.
    const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
    const cone = f < 0.12;
    const theta = cone ? lerp(0.04, 0.24, f / 0.12) + r() * 0.03 : lerp(f * thetaMax, even, 0.85) + (r() - 0.5) * 0.06;
    const len = L * (cone ? lerp(0.8, 0.95, f / 0.12) : 1) * lerp(1, 0.78, smoothstep(0.5, 1, f)) * (0.96 + r() * 0.08);
    // Center leaves are still folded around each other, so they read narrower.
    const wid = W * (len / L) * (cone ? lerp(0.62, 0.85, f / 0.12) : lerp(0.88, 1, smoothstep(0.1, 0.35, f))) * (0.95 + r() * 0.1);
    // The crown is a low dome: inner leaves spring from higher up.
    const coreR = lerp(0.01, 0.15, Math.pow(f, 0.7));
    const base = V(Math.cos(az) * coreR, lerp(0.22, 0.02, Math.pow(f, 0.7)), Math.sin(az) * coreR);
    const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.2, f)).lerp(old, smoothstep(0.6, 1, f) * 0.7), r, 0.006, 0.03, 0.03);
    // About three quarters of the leaves are there at install; the rest fill in as the rosette grows.
    const birth = f < 0.12 || r() < 0.8 ? 0 : clamp(0.15 + r() * 0.7);
    // Stiff and almost straight, a little incurved; the oldest leaves just start to relax at the tip.
    const curve = cone ? -0.04 : lerp(-0.12, 0.04, smoothstep(0.55, 1, f)) + (r() - 0.5) * 0.05;
    const swT = tipSway(base.y + Math.cos(theta) * len, coreR + Math.sin(theta) * len, 1.1, 1.8);
    solidLeaf(leaves, {
      base, az, theta, len,
      // Widest a little above the base, then an even taper to the spine (lance-shaped, not a sword).
      halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.34, 0.62, 1.7, 0.04),
      thick: (t) => wid * lerp(0.46, 0.1, Math.pow(t, 0.7)),
      // Slightly concave above; folded more in the center cone.
      cup: (t) => (cone ? 0.75 : lerp(0.14, 0.32, smoothstep(0, 0.6, t))) * lerp(1, 1.3, smoothstep(0.8, 1, t)),
      bend: () => curve,
      twist: (r() - 0.5) * 0.1,
      yaw: (r() - 0.5) * 0.04,
      segs: cone ? 7 : 10,
      cols: 5,
      tipLen: len * 0.028,
      uvTop: [0.012, 0.488],
      uvBot: [0.512, 0.988],
      color: tint,
      shade: (t) => lerp(0.45, 1, smoothstep(0, 0.45, t)) * (cone ? 0.96 : 1),
      birth,
      anchor: base,
      sway0: 0,
      sway1: swT,
    });
  }

  // The short woody core the leaves clasp, mostly hidden.
  const core = [V(0, -0.03, 0), V(0, 0.05, 0), V(0, 0.15, 0)];
  tube(leaves, core, 0.07, 0.02, 8, col('#6a5a48', 0.45), 0, V(), () => 0, 1);
  // Point the core's texture lookups at the dull leaf base.
  for (let i = leaves.uv.length - 9 * 3 * 2; i < leaves.uv.length; i += 2) {
    leaves.uv[i] = 0.25;
    leaves.uv[i + 1] = 0.02;
  }

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.8, translucency: 0.1, bend: 0.01, flutter: 0 },
  };
};
