import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway } from './shared-succulents';

/**
 * Foxtail agave (Agave attenuata): a soft, spineless rosette of broad, pale
 * jade to gray-green leaves dusted with a powdery bloom, smooth-edged with a
 * soft pointed tip. The rosette sits on a short, thick, curving stem ringed
 * with old leaf scars; the oldest leaves droop and a couple of pups sit at
 * the base. Leaves are solid geometry: thick at the neck, cupped, thin-edged.
 */

function skin(): THREE.Texture {
  return leafTexture('foxtail-agave', 512, 1024, (g, w, h) => {
    const r = rng('foxtail-agave-skin');
    const half = w / 2;
    const margin = [{ w: 0.014, color: '#a9bf94' }];
    paintSkin(g, 0, half, h, {
      r,
      ramp: ['#8fa26c', '#62906c', '#52856a', '#50836a', '#56876e', '#5e8a6e'],
      bloom: { n: 420, color: 'rgba(214,232,226,1)', alpha: 0.085, size: 30 },
      streaks: { n: 300, dark: '#5c8a70', light: '#c4dccc', alpha: 0.14 },
      imprints: { n: 3, light: '#cfe2d6', dark: '#5f8c74', alpha: 0.32 },
      margin,
      marginFlare: 1,
      tip: { color: '#6f8a5e', frac: 0.02, soft: 0.05 },
    });
    paintSkin(g, half, half, h, {
      r,
      ramp: ['#93a672', '#689472', '#588a70', '#568870', '#5a8b72', '#628e72'],
      bloom: { n: 520, color: 'rgba(222,236,230,1)', alpha: 0.1, size: 32 },
      streaks: { n: 300, dark: '#638f76', light: '#cce0d2', alpha: 0.14 },
      imprints: { n: 4, light: '#d6e6da', dark: '#648f78', alpha: 0.4 },
      margin,
      marginFlare: 1,
      tip: { color: '#6f8a5e', frac: 0.02, soft: 0.05 },
    });
  });
}

/** Stem skin: gray-tan, ringed with close, slightly wavy leaf scars. */
function stemBark(): THREE.Texture {
  return barkTexture('foxtail-agave-stem', 256, (g, S) => {
    const r = rng('foxtail-agave-stem');
    g.fillStyle = '#8f8873';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(70,62,48,${0.05 + r() * 0.1})` : `rgba(196,190,168,${0.05 + r() * 0.1})`;
      g.fillRect(r() * S, r() * S, 2 + r() * 10, 1 + r() * 3);
    }
    const rings = 9;
    for (let k = 0; k < rings; k++) {
      const y = ((k + 0.5) / rings) * S;
      const ph = r() * 6.28;
      for (const [dy, c, lw] of [[0, 'rgba(58,50,38,0.75)', 3.2], [4, 'rgba(206,200,176,0.5)', 2]] as [number, string, number][]) {
        g.strokeStyle = c;
        g.lineWidth = lw;
        g.beginPath();
        for (let x = 0; x <= S; x += 4) {
          // Whole sine periods so the ring tiles around the stem.
          const yy = y + dy + Math.sin((x / S) * Math.PI * 2 + ph) * 0.8;
          if (x === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const wood = new GeoBuilder();
  const fresh = col('#ffffff'), old = col('#d6d6aa'), young = col('#f2faf0');

  /** One rosette on a stem. `scale` 1 is the main plant; pups are smaller, with fewer and simpler leaves. */
  const rosette = (stem: THREE.Vector3[], stemR: number, scale: number, N: number, birth0: number, pup: boolean) => {
    const top = stem[stem.length - 1];
    const axis = top.clone().sub(stem[stem.length - 2]).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
    const L = Sp * 0.5 * scale, W = Sp * 0.165 * scale;
    const thetaMax = pup ? 1.4 : 1.66;
    const sw = (p: THREE.Vector3) => tipSway(p.y, Math.hypot(p.x, p.z), H, Sp) * 0.6;
    tube(wood, stem, stemR * 1.08, stemR * 0.9, pup ? 7 : 12, col('#ffffff'), birth0, stem[0], (i) => sw(stem[i]) * 0.5, pup ? 2 : 4);

    const g0 = leaves.count;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const az = i * GOLDEN + (r() - 0.5) * 0.15;
      const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
      const theta = lerp(f * thetaMax, even, 0.5) + (r() - 0.5) * 0.08 + 0.02;
      const len = L * lerp(0.55, 1, smoothstep(0, 0.3, f)) * lerp(1, 0.88, smoothstep(0.75, 1, f)) * (0.94 + r() * 0.12);
      const wid = W * lerp(0.55, 1, smoothstep(0, 0.35, f)) * (0.92 + r() * 0.16);
      const coreR = stemR * lerp(0.15, 0.95, Math.pow(f, 0.6));
      // Local frame: leaves spiral down the top of the stem, oldest lowest.
      const base = V(Math.cos(az) * coreR, -stemR * 2.2 * Math.pow(f, 1.3) + stemR * 0.5, Math.sin(az) * coreR);
      const droop = smoothstep(0.72, 1, f); // the oldest leaves arch over and hang
      const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.3, f)).lerp(old, Math.pow(droop, 2) * 0.7), r, 0.01, 0.04, 0.035);
      const birth = f < 0.2 || r() < 0.5 ? birth0 : clamp(birth0 + 0.1 + r() * 0.7, 0, 0.9);
      const arch = lerp(0.12, 0.42, f) + droop * 0.3 + (r() - 0.5) * 0.12;
      const inner = f < 0.22;
      const v0 = leaves.count;
      solidLeaf(leaves, {
        base, az, theta, len,
        halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.5, 0.42, 1.55, 0.05),
        thick: (t) => wid * lerp(0.2, 0.025, Math.pow(t, 0.5)),
        cup: (t) => lerp(0.1, 0.5, smoothstep(0, 0.45, t)) * lerp(1, 1.5, smoothstep(0.8, 1, t)) * lerp(1, 0.7, droop),
        // Arch out from the neck, then lift the tip a little (the oldest just hang).
        bend: (t) => arch * (t < 0.6 ? 1.5 : lerp(-0.8, 0.5, droop)),
        twist: (r() - 0.5) * 0.25,
        yaw: (r() - 0.5) * 0.12,
        segs: pup || inner ? 6 : 9,
        cols: pup || inner ? 3 : 5,
        tipLen: len * 0.03,
        uvTop: [0.012, 0.488],
        uvBot: [0.512, 0.988],
        vBlade: 0.97,
        color: tint,
        shade: (t) => lerp(0.5, 1, smoothstep(0, 0.35, t)),
        birth,
        anchor: base,
        sway0: 0,
        sway1: 0,
      });
      // Move the leaf from the local frame onto the stem top; set sway from the final position.
      const q = V();
      for (let k = v0; k < leaves.count; k++) {
        for (const arr of [leaves.pos, leaves.anchor]) {
          q.set(arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]).applyQuaternion(tilt).add(top);
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
      const a = V(leaves.anchor[k * 3], leaves.anchor[k * 3 + 1], leaves.anchor[k * 3 + 2]);
      const p = V(leaves.pos[k * 3], leaves.pos[k * 3 + 1], leaves.pos[k * 3 + 2]);
      leaves.sway[k] = sw(a) * 0.5 + sw(p) * clamp(p.distanceTo(a) / (Sp * 0.5));
    }
  };

  // Main stem: short, thick, leaning and curving back up.
  const sh = H * 0.36, sr = Sp * 0.05;
  const leanAz = r() * 6.28, lx = Math.cos(leanAz), lz = Math.sin(leanAz);
  const stem = [V(0, -0.05, 0), V(lx * 0.02, sh * 0.3, lz * 0.02), V(lx * 0.05, sh * 0.65, lz * 0.05), V(lx * 0.065, sh, lz * 0.065)];
  rosette(stem, sr, 1, 38, 0, false);

  // Pups at the base, leaning out from under the mother plant.
  for (let k = 0; k < 2; k++) {
    const az = leanAz + 2.2 + k * 2.3 + r() * 0.4;
    const ox = Math.cos(az), oz = Math.sin(az);
    const d = Sp * (0.13 + r() * 0.03), ph = H * (0.035 + r() * 0.02);
    const ps = [V(ox * sr * 0.6, 0.0, oz * sr * 0.6), V(ox * d * 0.7, ph * 0.45, oz * d * 0.7), V(ox * d, ph, oz * d)];
    rosette(ps, sr * 0.42, k ? 0.3 : 0.38, k ? 11 : 13, k ? 0.3 : 0, true);
  }

  fitGeo([leaves, wood], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    leafMap: skin(),
    bark: { map: stemBark() },
    look: { leafRoughness: 0.8, translucency: 0.14, bend: 0.03, flutter: 0, woodShadows: true },
  };
};
