import * as THREE from 'three';
import { GeoBuilder, V, col, jitter, leafTexture, lerp, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { GOLDEN, fitGeo, paintSkin, solidLeaf } from './shared-succulents';

/**
 * Echeveria 'Lola' (E. lilacina x E. 'Deresina'): a tight, symmetrical,
 * cup-shaped rosette of thick spoon-shaped leaves, broad at the shoulder and
 * ending in a short sharp point, flat to slightly hollowed above and keeled
 * below. Pale lavender-gray under a powdery bloom, faintly green at the base,
 * blushing pink at the edges and the tip. The inner leaves stand up and fold
 * over the heart; the outer ones spread and turn up at the ends. An older
 * plant has a pup or two tucked against its base.
 *
 * References and the numbers they give:
 * - Mountain Crest Gardens (Echeveria 'Lola'): rosettes 5-6 in across at
 *   most, 3-5 in tall; pale gray-green with a blush of lavender pink, farina
 *   like pearlescent marble; pink spring flowers.
 * - Desert Tropicals (Echeveria 'Lola'): compact pink-toned rosette about
 *   4 in (10 cm) across.
 * - NC State Extension Plant Toolbox (Echeveria): 'Lola' is E. lilacina x
 *   E. 'Deresina'; rosettes of thick, fleshy, waxy leaves.
 * - Green Lion job photo (corten planter, 4 in pot): one rosette about
 *   4-5 in across, gray-lavender.
 * Targets here: at maturity a main rosette about 15 cm across and 8 cm high
 * of 44 leaves (outer ones about 7 cm long, 4.5 cm wide and 7 mm thick),
 * with two pups at its foot; from a 4 in pot about 11-12 cm across and
 * 6.5 cm high.
 */

const TOP: [number, number] = [0.01, 0.49];
const BOT: [number, number] = [0.51, 0.99];

function skin(): THREE.Texture {
  return leafTexture('echeveria-lola', 512, 512, (g, w, h) => {
    const r = rng('echeveria-lola-skin');
    const half = w / 2;
    // Upper face: lavender-gray over a faint green base, powdery, pink edge and point.
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#6a725c', '#6e7068', '#726e6e', '#766e71', '#7c7075'],
      bloom: { n: 50, color: 'rgba(172,174,176,1)', alpha: 0.16, size: 18 },
      streaks: { n: 60, dark: '#5c5868', light: '#9c98a8', alpha: 0.08 },
      margin: [{ w: 0.014, color: '#806670' }, { w: 0.025, color: '#766c76' }],
      marginFlare: 1.8,
      tip: { color: '#7a636c', frac: 0.025, soft: 0.035 },
    });
    // Lower face: a little grayer and greener at the base, pinker toward the keel tip.
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#626a56', '#676862', '#6a6668', '#6e666b', '#74686f'],
      bloom: { n: 55, color: 'rgba(170,172,174,1)', alpha: 0.16, size: 18 },
      streaks: { n: 50, dark: '#58546a', light: '#9a96a6', alpha: 0.07 },
      margin: [{ w: 0.018, color: '#7a626c' }],
      marginFlare: 1.8,
      tip: { color: '#765e68', frac: 0.03, soft: 0.04 },
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const base0 = col('#ffffff');

  /** One rosette, `D` across at the outer leaves, tipped `tilt` radians toward `tiltAz`. */
  const rosette = (center: THREE.Vector3, D: number, N: number, birth0: number, tilt: number, tiltAz: number) => {
    const k = D / 0.15;
    const axis = V(Math.sin(tilt) * Math.cos(tiltAz), Math.cos(tilt), Math.sin(tilt) * Math.sin(tiltAz)).normalize();
    // Build upright, then tip the whole rosette about its foot.
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
    const v0 = leaves.count;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1); // 0 the youngest, in the heart .. 1 the oldest, outside
      const az = i * GOLDEN + (r() - 0.5) * 0.06;
      const len = k * lerp(0.026, 0.064, smoothstep(0, 0.7, f)) * lerp(1, 0.94, smoothstep(0.85, 1, f)) * (0.96 + r() * 0.08);
      const wid = k * lerp(0.024, 0.044, smoothstep(0, 0.6, f)) * (0.95 + r() * 0.1);
      const theta = lerp(0.12, 1.36, Math.pow(f, 0.8)) + (r() - 0.5) * 0.05;
      const coreR = k * lerp(0.003, 0.014, Math.pow(f, 0.8));
      const base = V(Math.cos(az) * coreR, k * lerp(0.048, 0.007, Math.pow(f, 0.6)), Math.sin(az) * coreR);
      // Inner leaves fold in over the heart; outer ones only turn up at the ends.
      const curl = lerp(0.82, 0.22, Math.pow(f, 0.5)) * (0.92 + r() * 0.16);
      const inner = f < 0.3;
      const tint = jitter(base0.clone(), r, 0.01, 0.03, 0.025).multiplyScalar(lerp(0.86, 1, smoothstep(0, 0.4, f)));
      // A potted rosette is already whole: it just grows. Only the pups come later.
      const birth = birth0;
      solidLeaf(leaves, {
        base, az, theta, len,
        halfWidth: (t) => {
          const hw = wid / 2;
          if (t < 0.74) return hw * lerp(0.42, 1, Math.sin((Math.PI / 2) * (t / 0.74)));
          const u = (t - 0.74) / 0.26;
          return hw * Math.max(0.16, Math.sqrt(Math.max(0, 1 - u * u)));
        },
        thick: (t) => wid * lerp(0.34, 0.2, t) * (1 - 0.6 * smoothstep(0.85, 1, t)),
        cup: (t) => lerp(0.2, 0.1, t),
        bend: (t) => -curl * (0.5 + t),
        twist: (r() - 0.5) * 0.06,
        yaw: (r() - 0.5) * 0.04,
        segs: inner ? 3 : 6,
        cols: inner ? 3 : 5,
        tipLen: len * 0.028,
        uvTop: TOP,
        uvBot: BOT,
        vBlade: 0.93,
        color: tint,
        shade: (t) => lerp(inner ? 0.55 : 0.45, 1, smoothstep(0, 0.5, t)),
        birth,
        anchor: V(0, 0, 0),
        sway0: 0,
        sway1: 0.04,
      });
    }
    // Tip and place the rosette (positions, normals and anchors).
    const n = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = v0; i < leaves.count; i++) {
      p.fromArray(leaves.pos, i * 3).applyQuaternion(q).add(center).toArray(leaves.pos, i * 3);
      n.fromArray(leaves.nor, i * 3).applyQuaternion(q).toArray(leaves.nor, i * 3);
      center.toArray(leaves.anchor, i * 3);
    }
  };

  rosette(V(0, 0, 0), 0.145, 44, 0, 0.04, r() * 6.28);
  // Pups tucked under the outer leaves, leaning out.
  const pa = r() * 6.28;
  rosette(V(Math.cos(pa) * 0.052, 0.003, Math.sin(pa) * 0.052), 0.056, 15, 0.4, 0.55, pa);
  rosette(V(Math.cos(pa + 2.4) * 0.05, 0.003, Math.sin(pa + 2.4) * 0.05), 0.046, 13, 0.65, 0.6, pa + 2.4);

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.74, translucency: 0.1, bend: 0.002, flutter: 0, leafShadows: true },
  };
};
