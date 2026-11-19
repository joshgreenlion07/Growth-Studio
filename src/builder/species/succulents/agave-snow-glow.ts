import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Agave 'Snow Glow': a variegated sport of Agave 'Blue Glow' (A. attenuata x A. ocahui), found by Kelly Griffin in 2005.
 * It keeps its parent's habit, a solitary, very regular, nearly ball-shaped rosette of stiff, smooth, lance-shaped
 * leaves ending in a short dark red spine, but its leaves read a little broader and the ball denser in the growers'
 * photos than the catalog's 'Blue Glow'. Each blue-green leaf has a creamy-yellow margin band, feathered where it meets
 * the blue-green, outlined by a thin mahogany-red edge that glows when the sun is behind the plant.
 *
 * References:
 * - Monrovia, #49155 (sold there as 'California Glow'; monrovia.com/snow-glow-agave-49155.html): 1-2 ft tall, 2-3 ft
 *   wide, moderate growth; long lance-like blue-green leaves with creamy white margins and a thin mahogany-brown edge in
 *   a nearly ball-shaped rosette.
 * - Plant Delights Nursery (Agave x ocahuata 'Snow Glow'): eventually a 2 ft tall x 3 ft wide specimen (8 years).
 * - Planet Desert (planetdesert.com/products/snow-glow-agave): 2 ft tall x 3 ft wide; photo of a mature plant used for
 *   the colors: blue-green center with a light bloom, cream-yellow band about a sixth of the leaf width on each side,
 *   the red edge a hairline.
 * - Happy Valley Plants (Agave x 'Snow Glow'): potted plant photo, the young leaves narrower and the bands brighter.
 *
 * Targets: about 54 leaves, each about 4 times as long as wide (the growers' photos); the youngest pressed together in a central cone, the
 * oldest reaching out nearly level and lifting at the tip.
 *
 * Catalog size: 5 gal installed 0.33 m tall x 0.45 m wide (a little over the catalog's 5 gal 'Blue Glow'); mature
 * 0.6 m x 0.9 m (2 ft x 3 ft, Plant Delights and Planet Desert) in six years. A 3 gal plant is about 0.28 m x 0.38 m.
 */

function skin(): THREE.Texture {
  return leafTexture('agave-snow-glow-v1', 512, 1024, (g, w, h) => {
    const r = rng('agave-snow-glow-skin');
    const half = w / 2;
    // From the edge in: mahogany hairline, a touch of amber, then the broad cream band.
    const margin = [{ w: 0.02, color: '#5e1c16' }, { w: 0.008, color: '#9a6a3c' }, { w: 0.085, color: '#d0bf6c' }];
    // Fine cream streaks where the band meets the blue-green: the variegation's feathered inner edge.
    const feather = (gg: CanvasRenderingContext2D, x0: number, fw: number, hh: number) => {
      for (let i = 0; i < 260; i++) {
        const side = r() < 0.5 ? 0 : 1;
        const d = fw * (0.12 + r() * 0.05);
        const x = side ? x0 + fw - d : x0 + d;
        const y = r() * hh, len = hh * (0.04 + r() * 0.18);
        gg.strokeStyle = r() < 0.7 ? '#c8bc78' : '#9aa486';
        gg.globalAlpha = 0.25 + r() * 0.5;
        gg.lineWidth = 0.8 + r() * 1.6;
        gg.beginPath();
        gg.moveTo(x, y);
        gg.lineTo(x + (r() - 0.5) * 2, y - len);
        gg.stroke();
      }
      gg.globalAlpha = 1;
    };
    // Upper face: blue-green with a waxy bloom, paler and yellower at the clasping base.
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#7a7c5c', '#4a5c52', '#3c524c', '#3a504a', '#3d534c'],
      bloom: { n: 180, color: 'rgba(170,196,190,1)', alpha: 0.08, size: 18 },
      streaks: { n: 380, dark: '#2f4a42', light: '#94b2a8', alpha: 0.16 },
      imprints: { n: 3, light: '#a8c2b8', dark: '#2c4640', alpha: 0.3 },
      extra: feather,
      margin,
      marginFlare: 1.1,
      tip: { color: '#3a1410', frac: 0.06, soft: 0.014 },
    });
    // Lower face: the keel side, grayer and paler.
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#80826a', '#53645a', '#465a54', '#445852', '#475b54'],
      bloom: { n: 200, color: 'rgba(180,200,194,1)', alpha: 0.09, size: 20 },
      streaks: { n: 380, dark: '#334e46', light: '#9cb6ac', alpha: 0.15 },
      imprints: { n: 4, light: '#b0c8be', dark: '#304a44', alpha: 0.34 },
      extra: feather,
      margin,
      marginFlare: 1.1,
      tip: { color: '#3a1410', frac: 0.06, soft: 0.014 },
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const N = 54;
  // Built at a natural scale (leaf length 1) and fitted to the catalog size at the end.
  const L = 1, W = 0.27;
  const thetaMax = 1.42;
  const fresh = col('#ffffff'), old = col('#e6e6d6'), young = col('#f4f6ee');
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0 the youngest leaf in the center, 1 the oldest at the outside
    const az = i * GOLDEN + (r() - 0.5) * 0.08;
    const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
    const cone = f < 0.12;
    const theta = cone ? lerp(0.05, 0.28, f / 0.12) + r() * 0.03 : lerp(f * thetaMax, even, 0.8) + (r() - 0.5) * 0.06;
    const len = L * (cone ? lerp(0.62, 0.85, f / 0.12) : 1) * lerp(1, 0.8, smoothstep(0.5, 1, f)) * (0.95 + r() * 0.1);
    const wid = W * (len / L) * (cone ? lerp(0.6, 0.85, f / 0.12) : lerp(0.88, 1, smoothstep(0.1, 0.35, f))) * (0.94 + r() * 0.12);
    const coreR = lerp(0.01, 0.16, Math.pow(f, 0.7));
    const base = V(Math.cos(az) * coreR, lerp(0.2, 0.02, Math.pow(f, 0.7)), Math.sin(az) * coreR);
    const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.2, f)).lerp(old, smoothstep(0.6, 1, f) * 0.7), r, 0.006, 0.03, 0.03);
    const birth = f < 0.12 || r() < 0.82 ? 0 : clamp(0.15 + r() * 0.7);
    // Stiff and a little incurved, so the rosette closes into a ball; the oldest lift their tips.
    const curve = cone ? -0.1 : lerp(-0.5, -0.2, smoothstep(0.4, 1, f)) + (r() - 0.5) * 0.06;
    const swT = tipSway(base.y + Math.cos(theta) * len, coreR + Math.sin(theta) * len, 1.0, 1.8);
    solidLeaf(leaves, {
      base, az, theta, len,
      halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.45, 0.6, 2.3, 0.04),
      thick: (t) => wid * lerp(0.42, 0.1, Math.pow(t, 0.7)),
      cup: (t) => (cone ? 0.75 : lerp(0.16, 0.34, smoothstep(0, 0.6, t))) * lerp(1, 1.3, smoothstep(0.8, 1, t)),
      bend: () => curve,
      twist: (r() - 0.5) * 0.1,
      yaw: (r() - 0.5) * 0.05,
      segs: cone ? 7 : 10,
      cols: 5,
      tipLen: len * 0.035,
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
  // The short woody core the leaves clasp, mostly hidden; its texture lookups point at the dull leaf base.
  const core = [V(0, -0.03, 0), V(0, 0.05, 0), V(0, 0.15, 0)];
  tube(leaves, core, 0.07, 0.02, 8, col('#6a5a48', 0.45), 0, V(), () => 0, 1);
  for (let i = leaves.uv.length - 9 * 3 * 2; i < leaves.uv.length; i += 2) {
    leaves.uv[i] = 0.25;
    leaves.uv[i + 1] = 0.02;
  }
  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.8, translucency: 0.12, bend: 0.01, flutter: 0 },
  };
};
