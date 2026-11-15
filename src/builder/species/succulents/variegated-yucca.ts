import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { GOLDEN, bladeProfile, fitGeo, paintSkin, solidLeaf, tipSway, type LeafStation } from './shared-succulents';

/**
 * Variegated yucca, modeled on Yucca filamentosa 'Color Guard': a stemless
 * clump of sword-shaped leaves, each with a broad creamy-gold center stripe
 * between dark green margins, with curly white threads peeling off the leaf
 * edges. Leaves in the center stand stiff and upright; the outer ones arch
 * over. A mature clump is a main rosette with a couple of offsets beside it.
 */

const TOP: [number, number] = [0.008, 0.367];
const BOT: [number, number] = [0.383, 0.742];

function skin(): THREE.Texture {
  return leafTexture('yucca-color-guard', 512, 1024, (g, w, h) => {
    const r = rng('yucca-color-guard-skin');
    const fw = 192;
    const face = (x0: number, green: string[], gold: string[], fiber: string) =>
      paintSkin(g, x0, fw, h, {
        r,
        ramp: green,
        extra: (c, x, fwid, hh) => {
          // Center stripe: gold, a little wider mid-leaf, feathering into the green as fine lines.
          const grad = c.createLinearGradient(0, hh, 0, 0);
          gold.forEach((s, i) => grad.addColorStop(i / (gold.length - 1), s));
          c.fillStyle = grad;
          c.beginPath();
          const rows = 48;
          const edge = (v: number, k: number) => 0.24 - 0.035 * Math.sin(v * Math.PI) + Math.sin(v * 23 + k * 2) * 0.006;
          for (let k = 0; k <= rows; k++) c.lineTo(x + fwid * edge(k / rows, 0), hh * (1 - k / rows));
          for (let k = rows; k >= 0; k--) c.lineTo(x + fwid * (1 - edge(k / rows, 1)), hh * (1 - k / rows));
          c.closePath();
          c.fill();
          // Thin green pinstripes inside the gold and gold ones in the green, as on the real leaf.
          for (let i = 0; i < 26; i++) {
            const inGold = r() < 0.6;
            const u = inGold ? 0.26 + r() * 0.48 : r() < 0.5 ? 0.14 + r() * 0.1 : 0.76 + r() * 0.1;
            const y0 = hh * r(), len = hh * (0.2 + r() * 0.6);
            c.strokeStyle = inGold ? green[2] : gold[1];
            c.globalAlpha = inGold ? 0.3 + r() * 0.35 : 0.35 + r() * 0.3;
            c.lineWidth = 1 + r() * 2.2;
            c.beginPath();
            c.moveTo(x + fwid * u, y0);
            c.lineTo(x + fwid * (u + (r() - 0.5) * 0.02), y0 - len);
            c.stroke();
          }
          c.globalAlpha = 1;
        },
        streaks: { n: 240, dark: fiber, light: '#fff6c8', alpha: 0.16 },
        margin: [{ w: 0.022, color: '#b9b08a' }],
        marginFlare: 1.5,
        tip: { color: '#6b4a2c', frac: 0.03, soft: 0.02 },
      });
    face(0, ['#35602c', '#2c5a2a', '#2a5a2c', '#2e6030', '#356634'], ['#dcc858', '#ecdc70', '#f2e584', '#efe07a', '#e2d266'], '#3c5a24');
    face(fw, ['#3c6532', '#356030', '#346132', '#386636', '#3e6a3a'], ['#cfc264', '#dccf74', '#dfd47e', '#dcd078', '#d2c66a'], '#44602c');
    // Threads: curly white fibers peeling from the margin. Four cells stacked in the right-hand strip.
    const tx = 2 * fw, tw = w - tx, th = h / 4;
    g.lineCap = 'round';
    for (let cell = 0; cell < 4; cell++) {
      const y0 = cell * th;
      const n = 2 + (cell % 2);
      for (let k = 0; k < n; k++) {
        // Each thread leaves the left edge (the leaf margin) and curls away.
        let x = tx + 3, y = y0 + th * (0.25 + 0.5 * (k / Math.max(1, n - 1)) + (r() - 0.5) * 0.1);
        let a = (r() - 0.5) * 1.2, turn = (r() - 0.5) * 0.25;
        g.strokeStyle = k % 2 ? '#f4f0e2' : '#e6dfc8';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x, y);
        const steps = 36 + Math.floor(r() * 24);
        for (let s = 0; s < steps; s++) {
          turn = clamp(turn + (r() - 0.5) * 0.09, -0.3, 0.3);
          a += turn;
          x += Math.cos(a) * 5;
          y += Math.sin(a) * 5;
          // Stay inside the cell: steer back toward its middle near the walls.
          if (x > tx + tw - 8 || x < tx + 6 || y < y0 + 8 || y > y0 + th - 8) a = Math.atan2(y0 + th / 2 - y, tx + tw / 2 - x) + (r() - 0.5);
          x = clamp(x, tx + 4, tx + tw - 5);
          y = clamp(y, y0 + 5, y0 + th - 5);
          g.lineTo(x, y);
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
  const fresh = col('#ffffff'), old = col('#d8d0a8'), young = col('#f4f6e6');
  const white = col('#ffffff');

  const thread = (st: LeafStation, sgn: number, size: number, birth: number, anchor: THREE.Vector3) => {
    // A small card standing off the leaf margin, in a plane tilted between the leaf face and its normal.
    const o = st.p.clone().addScaledVector(st.side, sgn * st.hw * 0.96);
    const outv = st.side.clone().multiplyScalar(sgn).addScaledVector(st.up, (r() - 0.3) * 1.2).addScaledVector(st.dir, (r() - 0.5) * 0.5).normalize();
    const along = st.dir.clone().addScaledVector(st.up, (r() - 0.5) * 0.6).normalize();
    const n = V().crossVectors(outv, along).normalize();
    const cell = Math.floor(r() * 4);
    const u0 = 0.756, u1 = 0.996, v1 = 1 - cell / 4 - 0.004, v0 = 1 - (cell + 1) / 4 + 0.004;
    const flip = r() < 0.5;
    const hh = size * 1.0, ww = size * 0.5;
    const a = o.clone().addScaledVector(along, -hh / 2), b = o.clone().addScaledVector(along, hh / 2);
    const c = b.clone().addScaledVector(outv, ww), d = a.clone().addScaledVector(outv, ww);
    const va = flip ? v1 : v0, vb = flip ? v0 : v1;
    const i0 = leaves.vert(a, n, u0, va, white, birth, anchor, st.sway);
    const i1 = leaves.vert(b, n, u0, vb, white, birth, anchor, st.sway);
    const i2 = leaves.vert(c, n, u1, vb, white, birth, anchor, st.sway);
    const i3 = leaves.vert(d, n, u1, va, white, birth, anchor, st.sway);
    leaves.quad(i0, i1, i2, i3);
  };

  const rosette = (center: THREE.Vector3, scale: number, N: number, birth0: number, lean: number, leanAz: number) => {
    const L = Sp * 0.56 * scale, W = Sp * 0.05 * lerp(0.8, 1, scale);
    const thetaMax = 1.42;
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const az = i * GOLDEN + (r() - 0.5) * 0.25;
      const even = Math.acos(1 - f * (1 - Math.cos(thetaMax)));
      let theta = lerp(f * thetaMax, even, 0.45) + (r() - 0.5) * 0.1 + 0.02;
      // Offsets lean away from the main crown.
      theta = clamp(theta + lean * Math.cos(az - leanAz), 0.02, 1.5);
      const len = L * lerp(0.62, 1, smoothstep(0, 0.25, f)) * lerp(1, 0.8, smoothstep(0.7, 1, f)) * (0.88 + r() * 0.24);
      const wid = W * lerp(0.7, 1, smoothstep(0, 0.3, f)) * (0.9 + r() * 0.2);
      const coreR = Sp * 0.035 * scale * Math.pow(f, 0.6);
      const base = center.clone().add(V(Math.cos(az) * coreR, H * lerp(0.1, 0.01, Math.pow(f, 0.7)) * scale, Math.sin(az) * coreR));
      const outer = smoothstep(0.35, 1, f);
      const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.25, f)).lerp(old, smoothstep(0.75, 1, f) * 0.7), r, 0.01, 0.05, 0.04);
      const birth = f < 0.15 || r() < 0.52 ? birth0 : clamp(birth0 + 0.1 + r() * 0.7, 0, 0.9);
      // Outer leaves arch over; a few fold down sharply past the middle, as old yucca leaves do.
      const arch = outer * (0.35 + r() * 0.75);
      const kink = f > 0.55 && r() < 0.22 ? 0.9 + r() * 0.9 : 0;
      const kinkAt = 0.45 + r() * 0.3;
      const swT = tipSway(base.y + Math.cos(theta) * len, Math.hypot(base.x, base.z) + Math.sin(theta) * len, H, Sp);
      const st = solidLeaf(leaves, {
        base, az, theta, len,
        halfWidth: (t) => (wid / 2) * bladeProfile(t, 0.35, 0.62, 2.6, 0.06),
        thick: (t) => wid * lerp(0.2, 0.05, Math.pow(t, 0.5)),
        cup: (t) => lerp(0.9, 0.45, smoothstep(0, 0.6, t)) * lerp(1, 1.6, smoothstep(0.8, 1, t)),
        bend: (t) => arch * 2 * t + (kink ? kink * 6 * Math.exp(-Math.pow((t - kinkAt) / 0.14, 2)) * 0.65 : 0),
        twist: (r() - 0.5) * 0.5 * (0.3 + outer),
        yaw: (r() - 0.5) * 0.14,
        segs: f < 0.25 ? 5 : 8,
        cols: 3,
        tipLen: len * 0.03,
        uvTop: TOP,
        uvBot: BOT,
        vBlade: 0.96,
        color: tint,
        shade: (t) => lerp(0.45, 1, smoothstep(0, 0.4, t)),
        birth,
        anchor: base,
        sway0: 0,
        sway1: swT,
      });
      // Curly threads along both margins, mostly on the mature leaves.
      const nThreads = f < 0.12 ? 0 : 1 + Math.floor(r() * 2.6);
      for (let k = 0; k < nThreads; k++) {
        const s = st[1 + Math.floor(r() * (st.length - 3))];
        thread(s, r() < 0.5 ? -1 : 1, Sp * (0.07 + r() * 0.06), birth, base);
      }
    }
  };

  rosette(V(0, 0, 0), 1, 78, 0, 0, 0);
  const a0 = r() * 6.28;
  rosette(V(Math.cos(a0) * Sp * 0.13, 0, Math.sin(a0) * Sp * 0.13), 0.72, 34, 0, 0.3, a0);
  rosette(V(Math.cos(a0 + 2.5) * Sp * 0.12, 0, Math.sin(a0 + 2.5) * Sp * 0.12), 0.6, 26, 0.25, 0.3, a0 + 2.5);

  fitGeo([leaves], H, Sp);
  return {
    leaves: leaves.build(),
    leafMap: skin(),
    look: { leafRoughness: 0.55, translucency: 0.22, bend: 0.03, flutter: 0.002, alphaTest: 0.35 },
  };
};
