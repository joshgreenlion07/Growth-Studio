import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Agave 'Blue Flame' (A. shawii x A. attenuata, made by David Verity at UCLA in the early 1960s): a stemless rosette of
 * broad, smooth, fleshy, glaucous blue-green leaves that sweep out and then curve up and in at the tip, twisting a
 * little, so the rosette looks like a blue flame. Each leaf tapers from a broad base to a sharp, slightly incurved dark
 * terminal spine; the margin is a thin red-brown line with teeth too small to see. Pups come freely, so a plant soon
 * becomes a clump of a main rosette and smaller ones around it.
 *
 * References:
 * - Pacific Horticulture, "Agave 'Blue Flame'" (pacifichorticulture.org/articles/iagavei-blue-flame/): blue-gray leaves,
 *   most intense on new growth; red-brown margins with teeth about 1/16 in; an inch-long incurved spine; pups produced so
 *   freely the clump keeps expanding; old botanic-garden clumps to 5 ft tall and 6 ft wide.
 * - Emerisa Gardens (Agave 'Blue Flame'): 2-3 ft tall x 3-4 ft wide, clump forming; soft fleshy blue-gray leaves edged
 *   with tiny teeth and red-brown margins and a terminal spine.
 * - Mahoney's Garden Center: 24 in x 24 in; Greenthumb: 30 in tall, 3 ft spread; Yerba Buena Nursery: each rosette to
 *   about 2.5 ft wide x 3 ft high, clumps spreading over time.
 * - Wikimedia Commons, Agave 'Blue Flame' at the Huntington and at the San Diego Botanic Garden (form and color): leaves
 *   about a fifth to a quarter as wide as long, gray-green more than blue in full sun, upturned and twisting tips, a light powdery bloom, greener at the base.
 *
 * Catalog size: 1 gal installed 0.22 m tall x 0.28 m wide; mature clump 0.75 m tall x 1.1 m wide (2.5 x 3.5 ft, inside
 * the nursery ranges for a residential bed) in six years: the main rosette's leaves about 0.45 m long, two pups at
 * install growing, a third appearing later.
 */

function skin(): THREE.Texture {
  return leafTexture('agave-blue-flame-v1', 512, 1024, (g, w, h) => {
    const r = rng('agave-blue-flame-skin');
    const half = w / 2;
    // Thin red-brown edge, then a faint pale line inside it.
    const margin = [{ w: 0.016, color: '#6a3424' }, { w: 0.01, color: '#93a28a' }];
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#6c7052', '#4a5a48', '#435442', '#415241', '#445443'],
      bloom: { n: 200, color: 'rgba(174,194,184,1)', alpha: 0.07, size: 20 },
      streaks: { n: 320, dark: '#3a5c54', light: '#9cb4a8', alpha: 0.12 },
      imprints: { n: 2, light: '#a8beb2', dark: '#3e5a4e', alpha: 0.14 },
      margin,
      marginFlare: 1,
      tip: { color: '#3c2418', frac: 0.035, soft: 0.03 },
    });
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#74785a', '#505e4c', '#485846', '#465645', '#495847'],
      bloom: { n: 240, color: 'rgba(180,198,190,1)', alpha: 0.08, size: 22 },
      streaks: { n: 320, dark: '#40625a', light: '#a4bab0', alpha: 0.12 },
      imprints: { n: 2, light: '#b0c4b8', dark: '#44604f', alpha: 0.16 },
      margin,
      marginFlare: 1,
      tip: { color: '#3c2418', frac: 0.035, soft: 0.03 },
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const fresh = col('#ffffff'), old = col('#dcdcc0'), young = col('#eef6f4');

  /** One stemless rosette at `at`, `scale` 1 the main plant, leaning slightly out by `lean`. */
  const rosette = (at: THREE.Vector3, scale: number, N: number, birth0: number, lean: THREE.Vector3) => {
    const L = 0.45 * scale, W = 0.2 * scale;
    const thetaMax = 1.58;
    const tilt = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 1, 0).add(lean).normalize());
    const g0 = leaves.count;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1); // 0 the youngest, in the middle, 1 the oldest at the outside
      const az = i * GOLDEN + (r() - 0.5) * 0.12;
      const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
      const cone = f < 0.1;
      const theta = cone ? lerp(0.1, 0.4, f / 0.1) + r() * 0.04 : lerp(f * thetaMax, even, 0.75) + 0.22 + (r() - 0.5) * 0.1;
      const len = L * (cone ? lerp(0.55, 0.8, f / 0.1) : 1) * lerp(1, 0.82, smoothstep(0.6, 1, f)) * (0.93 + r() * 0.14);
      // Broad leaves; the center ones are still folded together and read narrower.
      const wid = W * (len / L) * (cone ? lerp(0.55, 0.8, f / 0.1) : lerp(0.85, 1, smoothstep(0.1, 0.35, f))) * (0.92 + r() * 0.16);
      const coreR = 0.07 * scale * Math.pow(f, 0.7);
      const base = V(Math.cos(az) * coreR, lerp(0.07, 0.008, Math.pow(f, 0.6)) * scale, Math.sin(az) * coreR);
      const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.25, f)).lerp(old, smoothstep(0.7, 1, f) * 0.6), r, 0.008, 0.035, 0.03);
      const birth = f < 0.18 || r() < 0.62 ? birth0 : clamp(birth0 + 0.1 + r() * 0.6, 0, 0.88);
      // The flame: the leaf sweeps out from its base, then curves up and in toward the tip (older leaves curve less).
      const curl = lerp(1.0, 0.5, smoothstep(0.2, 1, f)) * (0.85 + r() * 0.3);
      const v0 = leaves.count;
      solidLeaf(leaves, {
        base, az, theta, len,
        halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.45, 0.62, 2.1, 0.03),
        thick: (t) => wid * lerp(0.32, 0.05, Math.pow(t, 0.6)),
        cup: (t) => (cone ? 0.55 : lerp(0.12, 0.28, smoothstep(0, 0.55, t))) * lerp(1, 1.4, smoothstep(0.75, 1, t)),
        bend: (t) => (cone ? -0.35 : t < 0.35 ? 0.75 : -curl * smoothstep(0.35, 0.95, t)),
        twist: (r() - 0.5) * 0.9,
        yaw: (r() - 0.5) * 0.25,
        segs: cone ? 7 : 10,
        cols: 5,
        tipLen: len * 0.05,
        uvTop: [0.012, 0.488],
        uvBot: [0.512, 0.988],
        vBlade: 0.95,
        color: tint,
        shade: (t) => lerp(0.5, 1, smoothstep(0, 0.4, t)),
        birth,
        anchor: base,
        sway0: 0,
        sway1: 0,
      });
      const q = V();
      for (let k = v0; k < leaves.count; k++) {
        for (const arr of [leaves.pos, leaves.anchor]) {
          q.set(arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]).applyQuaternion(tilt).add(at);
          arr[k * 3] = q.x;
          arr[k * 3 + 1] = Math.max(0.004, q.y);
          arr[k * 3 + 2] = q.z;
        }
        q.set(leaves.nor[k * 3], leaves.nor[k * 3 + 1], leaves.nor[k * 3 + 2]).applyQuaternion(tilt);
        leaves.nor[k * 3] = q.x;
        leaves.nor[k * 3 + 1] = q.y;
        leaves.nor[k * 3 + 2] = q.z;
      }
    }
    for (let k = g0; k < leaves.count; k++) {
      const p = V(leaves.pos[k * 3], leaves.pos[k * 3 + 1], leaves.pos[k * 3 + 2]);
      leaves.sway[k] = tipSway(p.y, Math.hypot(p.x - at.x, p.z - at.z), 0.75, 1.1) * 0.35;
    }
  };

  // The main rosette, a little off the clump's center, and its pups around it (the third comes later).
  rosette(V(0, 0, 0), 1, 34, 0, V(0, 0, 0));
  const az0 = r() * 6.28;
  const pups: [number, number, number, number][] = [
    [az0, 0.3, 0.6, 0],
    [az0 + 2.3, 0.27, 0.48, 0],
    [az0 + 4.2, 0.3, 0.42, 0.45],
  ];
  for (const [az, d, sc, b] of pups) {
    const dir = V(Math.cos(az), 0, Math.sin(az));
    rosette(dir.clone().multiplyScalar(d), sc, sc > 0.5 ? 22 : 18, b, dir.clone().multiplyScalar(0.22));
  }

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.78, translucency: 0.12, bend: 0.02, flutter: 0 },
  };
};
