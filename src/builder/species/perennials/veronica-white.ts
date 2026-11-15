import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { arcPath, crossCards, fitToSize, flatCard, stemBark, toothedLeafPath } from './shared-perennials';

/**
 * White spike speedwell, Veronica spicata (a white cultivar such as
 * 'Icicle' or 'Snow Candles'). A low clump of leafy stems: lance-shaped,
 * toothed, mid-green leaves in opposite pairs, each pair at right angles to
 * the last, topped by many slender tapering spikes of tiny four-lobed white
 * flowers that open from the bottom up, with green buds at the tip.
 */

/** Four single leaves side by side, each in a 128 x 512 column with its base at the bottom center. */
function veronicaLeaves(): THREE.Texture {
  return leafTexture('veronica-white-leaves', 512, 512, (g) => {
    const r = rng('veronica-leaf-tex');
    const tones: [string, string, string][] = [
      ['#3a6428', '#4c7a34', '#5d8c40'],
      ['#365d26', '#467230', '#58863c'],
      ['#406b2b', '#538238', '#669645'],
      ['#46722e', '#5b8a3c', '#70a04a'],
    ];
    for (let c = 0; c < 4; c++) {
      g.save();
      g.translate(c * 128 + 64, 509);
      g.rotate(-Math.PI / 2);
      const len = 500, wid = 104 + r() * 16;
      const [dk, md, lt] = tones[c];
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, dk);
      grad.addColorStop(0.5, md);
      grad.addColorStop(1, lt);
      g.fillStyle = grad;
      toothedLeafPath(g, len, wid, 0.36, 11, 0.2);
      g.fill();
      // Darker blade on one side of the midrib, as a folded leaf catches the light.
      g.save();
      g.clip();
      g.fillStyle = 'rgba(20,40,10,0.14)';
      g.fillRect(0, 0, len, wid);
      // Side veins sunk into the blade, then the pale midrib.
      g.strokeStyle = 'rgba(30,55,20,0.4)';
      g.lineWidth = 3;
      for (let k = 1; k <= 7; k++) {
        const x = (len * k) / 8.5;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.quadraticCurveTo(x + len * 0.07, s * wid * 0.2, x + len * 0.13, s * wid * 0.42);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(150,190,110,0.6)';
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.96, 0);
      g.stroke();
      g.restore();
      g.restore();
    }
  });
}

/** A tiny four-lobed speedwell flower, face-on. */
function floret(g: CanvasRenderingContext2D, x: number, y: number, rad: number, rot: number, shade: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const v = Math.round(lerp(214, 255, shade));
  for (let k = 0; k < 4; k++) {
    g.save();
    g.rotate((k * Math.PI) / 2);
    // The lower lobe of a speedwell flower is narrower than the other three.
    const w = k === 1 ? 0.36 : 0.5;
    g.fillStyle = `rgb(${v},${v},${Math.round(v * 0.975)})`;
    g.beginPath();
    g.ellipse(rad * 0.55, 0, rad * 0.5, rad * w, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = 'rgba(196,208,150,0.9)';
  g.beginPath();
  g.arc(0, 0, rad * 0.2, 0, Math.PI * 2);
  g.fill();
  // Two stamens standing out past the petals.
  g.strokeStyle = 'rgba(250,250,245,1)';
  g.lineWidth = Math.max(1, rad * 0.09);
  for (const s of [-1, 1]) {
    const a = -0.9 * s - 0.4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 1.15);
    g.stroke();
    g.fillStyle = '#b9b3c9';
    g.beginPath();
    g.arc(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 1.15, rad * 0.11, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * 512 x 1024 flower atlas. Three spikes in side view (128 px wide, full
 * height, base at the bottom), and in the last column whorls of florets seen
 * down the spike's axis.
 */
function veronicaFlowers(): THREE.Texture {
  return leafTexture('veronica-white-flowers', 512, 1024, (g) => {
    const r = rng('veronica-flower-tex');
    for (let s = 0; s < 3; s++) {
      const cx = 64 + s * 128;
      const openTo = 0.6 + s * 0.07; // fraction of the spike in open flower, from the base
      // Rachis.
      g.strokeStyle = '#7b9a50';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(cx, 1024);
      g.lineTo(cx, 20);
      g.stroke();
      const halfAt = (t: number) => (t < openTo ? lerp(46, 40, t / openTo) : lerp(28, 4, Math.pow((t - openTo) / (1 - openTo), 0.8)));
      // Buds first (upper part), then the open flowers over them.
      for (let i = 0; i < 150; i++) {
        const t = lerp(openTo - 0.06, 0.995, r());
        const hw = halfAt(Math.max(t, openTo + 0.001));
        const x = cx + (r() * 2 - 1) * hw * 0.8, y = 1024 - t * 1010;
        const k = clamp((t - openTo) / (1 - openTo));
        const rad = lerp(11, 4.5, k);
        // Buds: pale, nearly white where about to open, green toward the tip.
        g.fillStyle = k < 0.25 ? (r() < 0.5 ? '#e4ecd2' : '#d3e2b8') : r() < 0.5 ? '#a9c77c' : '#8fb462';
        g.beginPath();
        g.ellipse(x, y, rad * 0.62, rad, (x - cx) * 0.012, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(95,130,60,0.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y + rad * 0.5, rad * 0.6, 0.1, Math.PI - 0.1);
        g.stroke();
      }
      const rows = Math.round(openTo * 44);
      for (let i = 0; i < rows; i++) {
        const t = ((i + 0.5) / rows) * openTo;
        const hw = halfAt(t);
        const y = 1024 - 14 - t * 1000;
        const n = 4;
        for (let k = 0; k < n; k++) {
          const u = (k + r() * 0.8 + (i % 2) * 0.5) / n - 0.5;
          const x = cx + clamp(u * 2, -1, 1) * (hw - 12);
          // Flowers at the edge are seen side-on and read slightly grayer.
          floret(g, x, y + (r() - 0.5) * 12, 12.5 + r() * 2.5, r() * 6.28, 1 - Math.abs(u) * 0.9 * r());
        }
      }
    }
    // Whorls seen from above: column 3, four 128 px cells.
    for (let c = 0; c < 4; c++) {
      const cx = 448, cy = 64 + c * 128;
      const n = c < 2 ? 7 : 6;
      g.fillStyle = '#86a85a';
      g.beginPath();
      g.arc(cx, cy, 9, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r();
        const d = c < 2 ? 36 : 30;
        floret(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 17 + r() * 3, r() * 6.28, 0.8 + r() * 0.2);
      }
      if (c >= 2) for (let k = 0; k < 5; k++) {
        const a = r() * 6.28;
        g.fillStyle = '#b7d08e';
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 7, 9, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const k = H / 0.45;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const stemCol = col('#6f8f4a'), white = col('#f4f4ee');
  const leafUV = (i: number): [number, number, number, number] => [i * 0.25, 0, (i + 1) * 0.25, 1];
  const spikeUV = (i: number): [number, number, number, number] => [i * 0.25 + 0.004, 0, (i + 1) * 0.25 - 0.004, 1];
  const whorlUV = (i: number): [number, number, number, number] => [0.75, 1 - (i + 1) * 0.125, 1, 1 - i * 0.125];

  /** Opposite pairs up a stem, each pair turned a quarter turn from the last. */
  const leafyStem = (pts: THREE.Vector3[], t0: number, t1: number, nodes: number, size: number, birth: number, anchor: THREE.Vector3 | null, swayTop: number, lateFrom: number) => {
    let roll = r() * 6.28;
    for (let n = 0; n < nodes; n++) {
      const t = lerp(t0, t1, (n + 0.2 + r() * 0.3) / nodes);
      const at = along(pts, t);
      roll += Math.PI / 2 + (r() - 0.5) * 0.3;
      const a = perp(at.dir), b = V().crossVectors(at.dir, a).normalize();
      const up = n / Math.max(1, nodes - 1);
      const len = size * lerp(1, 0.5, Math.pow(up, 1.3)) * (0.85 + r() * 0.3);
      // On a stem that is there from the start, the upper pairs come in as it matures.
      const bth = anchor ? birth : n >= lateFrom ? clamp(0.15 + up * 0.5 + r() * 0.2, 0, 0.85) : 0;
      for (const s of [-1, 1]) {
        const out = a.clone().multiplyScalar(Math.cos(roll) * s).addScaledVector(b, Math.sin(roll) * s);
        const dir = at.dir.clone().multiplyScalar(lerp(0.25, 0.7, up) + r() * 0.2).add(out).normalize();
        const face = at.dir.clone().multiplyScalar(1).addScaledVector(out, -0.5).normalize();
        const shade = lerp(0.72, 1, clamp(at.p.y / (H * 0.5))) * (0.92 + r() * 0.16);
        const c = jitter(col('#ffffff', shade), r, 0.012, 0.05, 0.03);
        const sw = swayTop * t;
        leafQuad(leaves, at.p, dir, face, len, len * 0.27, leafUV(Math.floor(r() * 4)), c, bth, anchor ?? at.p, { segs: 2, curl: 0.35 + r() * 0.55, sway0: sw, sway1: clamp(sw + 0.08) });
      }
    }
  };

  // Flowering stems: the outer ones lean out from the crown, then turn up.
  const N = 30;
  for (let i = 0; i < N; i++) {
    const f = Math.sqrt((i + 0.5) / N); // 0 center .. 1 edge
    const az = i * 2.39996 + (r() - 0.5) * 0.6;
    const br = (0.01 + f * 0.05) * k;
    const base = V(Math.cos(az) * br, 0, Math.sin(az) * br);
    const lean0 = Math.min(0.95, lerp(0.1, 1.0, f) + (r() - 0.5) * 0.2);
    const lean1 = lerp(0.02, 0.16, f) + (r() - 0.5) * 0.1;
    const L = lerp(0.44, 0.36, f) * (0.86 + r() * 0.18) * k;
    const pts = arcPath(base, az, lean0, lean1, L, 8, r, 0.1);
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + r() * 0.7, 0, 0.85);
    const anchor = birth > 0 ? base : null;
    const swayTop = 0.55 + r() * 0.3;
    const spikeLen = (0.1 + r() * 0.06) * k;
    const tSpike = 1 - spikeLen / L;
    tube(wood, [0, 2, 4, 6, 7].map((q) => pts[q]), 0.0017 * k, 0.001 * k, 4, stemCol, birth, base, (q) => swayTop * [0, 0.25, 0.5, 0.75, 0.875][q], 1);
    leafyStem(pts, 0.04, tSpike - 0.02, 10, 0.06 * k, birth, anchor, swayTop, 9);

    // The spike: three crossed planes, plus whorls across the axis so it also reads from above.
    const at = along(pts, tSpike);
    const tip = pts[pts.length - 1];
    const dir = tip.clone().sub(at.p).normalize();
    const tone = jitter(white.clone(), r, 0.01, 0.02, 0.03);
    const sBirth = anchor ? birth : i % 4 === 0 ? 0 : clamp(0.1 + r() * 0.3, 0, 0.85);
    crossCards(flowers, at.p, dir, spikeLen, 0.022 * k, spikeUV(i % 3), tone, sBirth, anchor ?? at.p, 3, r() * 3, { segs: 2, curl: (r() - 0.5) * 0.25, sway0: swayTop * tSpike, sway1: swayTop });
    for (let w = 0; w < 3; w++) {
      const tt = 0.12 + w * 0.2 + r() * 0.05;
      const p = at.p.clone().addScaledVector(dir, spikeLen * tt);
      flatCard(flowers, p, deflect(dir, 0.25 * r(), r() * 6.28), 0.021 * k, whorlUV(w < 2 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)), tone, sBirth, anchor ?? at.p, swayTop * lerp(tSpike, 1, tt), r() * 6.28);
    }
    // Some stems carry a shorter side spike from an upper leaf pair.
    if (i % 3 === 0) {
      const a2 = along(pts, tSpike - 0.08);
      const d2 = deflect(a2.dir, 0.5, r() * 6.28);
      d2.y = Math.max(d2.y, 0.75);
      d2.normalize();
      const l2 = spikeLen * 0.55;
      crossCards(flowers, a2.p, d2, l2, 0.02 * k, spikeUV(2), tone, clamp(Math.max(birth, 0.3 + r() * 0.3)), anchor ?? a2.p, 2, r() * 3, { sway0: swayTop * tSpike, sway1: swayTop * tSpike });
    }
  }

  // Short leafy shoots that fill the base of the clump.
  for (let i = 0; i < 22; i++) {
    const az = i * 2.39996 + 1 + (r() - 0.5) * 0.8;
    const f = 0.35 + r() * 0.65;
    const br = f * 0.07 * k;
    const base = V(Math.cos(az) * br, 0, Math.sin(az) * br);
    const L = (0.09 + r() * 0.08) * k;
    const pts = arcPath(base, az, 0.3 + f * 0.9, 0.2 + f * 0.3, L, 4, r, 0.15);
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + r() * 0.6, 0, 0.85);
    tube(wood, [pts[0], pts[2], pts[4]], 0.0018 * k, 0.001 * k, 3, stemCol, birth, base, (q) => q * 0.15, 1);
    leafyStem(pts, 0.1, 1, 5, 0.062 * k, birth, birth > 0 ? base : null, 0.3, 99);
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: veronicaLeaves(),
    flowerMap: veronicaFlowers(),
    bark: { map: stemBark() },
    look: { translucency: 0.4, leafRoughness: 0.7, bend: 0.07, flutter: 0.008, leafShadows: true },
  };
};
