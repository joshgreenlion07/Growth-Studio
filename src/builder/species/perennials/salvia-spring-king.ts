import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { arcPath, crossCards, fitToSize, flatCard, stemBark, toothedLeafPath } from './shared-perennials';

/**
 * Salvia nemorosa 'Spring King' (meadow sage, often sold with the
 * Salvia x sylvestris sages): a compact, upright clump. Square stems rise from
 * a low basal rosette of oblong-lance leaves, about 2 to 3 in, deep green,
 * crinkled between sunken veins, with a round-toothed edge, in opposite
 * pairs; the stem leaves shrink toward the top. Each stem ends in a dense,
 * upright spike (and usually a pair of shorter side spikes) of whorls of
 * small two-lipped violet-purple flowers, each whorl held in dark
 * burgundy-purple calyces and bracts that stay colored after the petals drop,
 * buds tight and nearly black-purple at the tip. Shown in its late spring
 * bloom.
 *
 * References and the numbers they give:
 * - Perennials.com (Darwin Perennials), Salvia nemorosa 'Spring King'
 *   (perennials.com/plants/salvia-nemorosa-spring-king.html): 30 to 40 cm
 *   (12 to 16 in) tall and wide; large deep purple panicles; the earliest
 *   flowering perennial sage; deep green foliage; deadhead to rebloom.
 * - Bluestone Perennials, Salvia Spring King (bluestoneperennials.com/SAKI.html):
 *   the earliest-flowering perennial sage; blooms bluer in a little shade.
 * - Sheridan Nurseries plant finder, Spring King Meadow Sage
 *   (plants.skh.com/12170005/Plant/26306/Spring_King_Meadow_Sage): 12 in tall,
 *   16 in in flower, 16 in wide; upright spreading habit; purple flowers with
 *   blue overtones and burgundy calyces; mid spring to late summer.
 * Leaf shape and the flower (square stems, opposite round-toothed
 * oblong-lance leaves, two-lipped flowers in whorls) are the species'.
 * Size used: a 1 gal at 0.25 m tall and wide; 0.4 m (16 in) tall and wide in
 * flower in two years. Herbaceous: it dies back in winter (deciduous here).
 */

/** Four leaves, each a 128 x 512 column with its base at the bottom center. */
function salviaLeaves(): THREE.Texture {
  return leafTexture('salvia-spring-king-leaves', 512, 512, (g) => {
    const r = rng('salvia-spring-king-leaf-tex');
    const tones: [string, string, string][] = [
      ['#2a4a20', '#38602a', '#4a7434'],
      ['#2d4e22', '#3d662c', '#527c3a'],
      ['#314f24', '#43692f', '#58803d'],
      ['#3a5c2a', '#4f7638', '#638c44'],
    ];
    for (let c = 0; c < 4; c++) {
      g.save();
      g.translate(c * 128 + 64, 509);
      g.rotate(-Math.PI / 2);
      const len = 500, wid = 118 + r() * 14;
      const [dk, md, lt] = tones[c];
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, dk);
      grad.addColorStop(0.5, md);
      grad.addColorStop(1, lt);
      g.fillStyle = grad;
      toothedLeafPath(g, len, wid, 0.32, 14, 0.14);
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = 'rgba(15,35,10,0.14)';
      g.fillRect(0, 0, len, wid);
      // Crinkled blade: a net of sunken veins with a pale puckered patch between them.
      g.strokeStyle = 'rgba(18,40,12,0.5)';
      g.lineWidth = 3;
      for (let k = 1; k <= 9; k++) {
        const x = (len * k) / 10.5;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.quadraticCurveTo(x + len * 0.06, s * wid * 0.22, x + len * 0.1, s * wid * 0.46);
          g.stroke();
        }
      }
      for (let k = 0; k < 90; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(160,190,120,0.16)' : 'rgba(10,30,8,0.16)';
        g.beginPath();
        g.ellipse(len * (0.05 + r() * 0.9), (r() - 0.5) * wid * 0.8, 9 + r() * 8, 5 + r() * 4, r(), 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(150,180,115,0.55)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.96, 0);
      g.stroke();
      g.restore();
      g.restore();
    }
  });
}

/** A two-lipped sage flower in side view: a hooded upper lip and a broad, notched lower lip, from a dark calyx. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number, side: number) {
  g.save();
  g.translate(x, y);
  g.scale(side, 1);
  g.rotate(-0.5 + (r() - 0.5) * 0.3);
  const violet = ['#5a34a6', '#6a3eb4', '#4e2c96', '#6440a8'][Math.floor(r() * 4)];
  // Calyx.
  g.fillStyle = '#3e1c46';
  g.beginPath();
  g.ellipse(s * 0.25, 0, s * 0.3, s * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  // Tube and hooded upper lip.
  g.fillStyle = violet;
  g.beginPath();
  g.moveTo(s * 0.4, -s * 0.06);
  g.quadraticCurveTo(s * 0.9, -s * 0.5, s * 1.25, -s * 0.18);
  g.quadraticCurveTo(s * 0.95, -s * 0.12, s * 0.45, s * 0.06);
  g.closePath();
  g.fill();
  // Lower lip, broad and spreading, a pale throat mark.
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.04);
  g.quadraticCurveTo(s * 1.05, s * 0.05, s * 1.2, s * 0.32);
  g.quadraticCurveTo(s * 0.9, s * 0.36, s * 0.48, s * 0.12);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(220,205,245,0.55)';
  g.beginPath();
  g.ellipse(s * 0.82, s * 0.14, s * 0.12, s * 0.05, 0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * 512 x 1024 flower atlas: three spikes in side view (128 px wide, full height, base at the bottom), and in the
 * last column whorls seen down the axis.
 */
function salviaFlowers(): THREE.Texture {
  return leafTexture('salvia-spring-king-flowers', 512, 1024, (g) => {
    const r = rng('salvia-spring-king-flower-tex');
    for (let s = 0; s < 3; s++) {
      const cx = 64 + s * 128;
      const openTo = 0.62 + s * 0.08;
      g.strokeStyle = '#4a3040';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(cx, 1024);
      g.lineTo(cx, 16);
      g.stroke();
      const whorls = 15;
      for (let i = 0; i < whorls; i++) {
        const t = i / (whorls - 1);
        const y = 1010 - Math.pow(t, 0.92) * 985;
        const hw = lerp(40, 14, Math.pow(t, 1.2));
        // Bracts and calyces: dark burgundy-purple, a pair per whorl.
        g.fillStyle = t < openTo ? '#4a2258' : '#3a1a46';
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + sd * hw * 0.45, y, hw * 0.5, lerp(10, 6, t), sd * 0.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#2e1236';
        g.beginPath();
        g.ellipse(cx, y, hw * 0.35, lerp(11, 6, t), 0, 0, Math.PI * 2);
        g.fill();
        if (t < openTo) {
          // Open flowers stand out both ways from the whorl, a few facing the viewer.
          const n = 4 + Math.floor(r() * 2);
          for (let k = 0; k < n; k++) {
            const sd = k % 2 ? 1 : -1;
            const fx = cx + sd * hw * (0.2 + r() * 0.3);
            floret(g, r, fx, y + (r() - 0.5) * 8, lerp(42, 30, t / openTo) * (0.85 + r() * 0.25), sd);
          }
        } else {
          // Buds: tight purple ovals in the calyces.
          for (let k = 0; k < 3; k++) {
            g.fillStyle = r() < 0.5 ? '#4b2a7a' : '#3d2360';
            g.beginPath();
            g.ellipse(cx + (k - 1) * hw * 0.4, y - 3, lerp(7, 4, t), lerp(11, 6, t), (k - 1) * 0.4, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    for (let c = 0; c < 4; c++) {
      const cx = 448, cy = 64 + c * 128;
      g.fillStyle = '#3a1a46';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + c;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 22, 10, a, 0, Math.PI * 2);
        g.fill();
      }
      const n = c < 2 ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r();
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        floret(g, r, 10, 0, 44 + r() * 8, 1);
        g.restore();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const k = H / 0.45;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const stemCol = col('#5d6a3c'), stemTop = col('#5a3a4c'), white = col('#f4f2f4');
  const leafUV = (i: number): [number, number, number, number] => [i * 0.25, 0, (i + 1) * 0.25, 1];
  const spikeUV = (i: number): [number, number, number, number] => [i * 0.25 + 0.004, 0, (i + 1) * 0.25 - 0.004, 1];
  const whorlUV = (i: number): [number, number, number, number] => [0.75, 1 - (i + 1) * 0.125, 1, 1 - i * 0.125];

  /** Opposite pairs up a stem, each pair a quarter turn from the last, smaller toward the top. */
  const leafyStem = (pts: THREE.Vector3[], t0: number, t1: number, nodes: number, size: number, birth: number, anchor: THREE.Vector3 | null, swayTop: number) => {
    let roll = r() * 6.28;
    for (let n = 0; n < nodes; n++) {
      const t = lerp(t0, t1, (n + 0.2 + r() * 0.3) / nodes);
      const at = along(pts, t);
      roll += Math.PI / 2 + (r() - 0.5) * 0.3;
      const a = perp(at.dir), b = V().crossVectors(at.dir, a).normalize();
      const up = n / Math.max(1, nodes - 1);
      const len = size * lerp(1, 0.45, Math.pow(up, 1.1)) * (0.85 + r() * 0.3);
      for (const s of [-1, 1]) {
        const out = a.clone().multiplyScalar(Math.cos(roll) * s).addScaledVector(b, Math.sin(roll) * s);
        const dir = at.dir.clone().multiplyScalar(lerp(0.2, 0.6, up) + r() * 0.2).add(out).normalize();
        const face = at.dir.clone().addScaledVector(out, -0.5).normalize();
        const shade = lerp(0.62, 0.9, clamp(at.p.y / (H * 0.5))) * (0.9 + r() * 0.16);
        const c = jitter(col('#ffffff', shade), r, 0.012, 0.05, 0.03);
        const sw = swayTop * t;
        leafQuad(leaves, at.p, dir, face, len, len * 0.36, leafUV(Math.floor(r() * 4)), c, birth, anchor ?? at.p, { segs: 2, curl: 0.4 + r() * 0.5, sway0: sw, sway1: clamp(sw + 0.08) });
      }
    }
  };

  // The basal rosette: bigger leaves lying out over the soil.
  for (let i = 0; i < 50; i++) {
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const br = (0.01 + r() * 0.05) * k;
    const base = V(Math.cos(az) * br, 0.004, Math.sin(az) * br);
    const pitch = 0.35 + r() * 0.5;
    const dir = V(Math.cos(az) * Math.cos(pitch), Math.sin(pitch), Math.sin(az) * Math.cos(pitch));
    const len = (0.07 + r() * 0.025) * k;
    const birth = i < 28 ? 0 : clamp(0.1 + r() * 0.6, 0, 0.85);
    const c = jitter(col('#ffffff', 0.64 + r() * 0.14), r, 0.01, 0.04, 0.03);
    leafQuad(leaves, base, dir, V(0, 1, 0), len, len * 0.4, leafUV(Math.floor(r() * 3)), c, birth, base, { segs: 2, curl: 0.5 + r() * 0.4, sway0: 0.02, sway1: 0.12 });
  }

  // Flowering stems, upright, the outer ones leaning a little out.
  const N = 26;
  for (let i = 0; i < N; i++) {
    const f = Math.sqrt((i + 0.5) / N);
    const az = i * 2.39996 + (r() - 0.5) * 0.6;
    const br = (0.008 + f * 0.04) * k;
    const base = V(Math.cos(az) * br, 0, Math.sin(az) * br);
    const lean0 = lerp(0.04, 0.5, f) + (r() - 0.5) * 0.12;
    const lean1 = lerp(0.0, 0.12, f) + (r() - 0.5) * 0.06;
    const L = lerp(0.44, 0.36, f) * (0.88 + r() * 0.16) * k;
    const pts = arcPath(base, az, lean0, lean1, L, 8, r, 0.08);
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + r() * 0.7, 0, 0.85);
    const anchor = birth > 0 ? base : null;
    const swayTop = 0.5 + r() * 0.3;
    const spikeLen = (0.15 + r() * 0.05) * k;
    const tSpike = 1 - spikeLen / L;
    // The stem as wood up to the spike's base; inside the spike its painted axis takes over.
    const stemPts = [0, 0.25, 0.5, 0.75, 1].map((q) => along(pts, q * tSpike).p);
    tube(wood, stemPts, 0.0022 * k, 0.0013 * k, 4, stemCol.clone().lerp(stemTop, 0.5), birth, base, (q) => swayTop * tSpike * [0, 0.25, 0.5, 0.75, 1][q], 1);
    leafyStem(pts, 0.05, tSpike - 0.03, 6, 0.06 * k, birth, anchor, swayTop);

    const at = along(pts, tSpike);
    const tip = pts[pts.length - 1];
    const dir = tip.clone().sub(at.p).normalize();
    const tone = jitter(white.clone(), r, 0.01, 0.03, 0.04);
    const sBirth = anchor ? birth : i % 4 === 0 ? 0 : clamp(0.1 + r() * 0.3, 0, 0.85);
    crossCards(flowers, at.p, dir, spikeLen, 0.026 * k, spikeUV(i % 3), tone, sBirth, anchor ?? at.p, 3, r() * 3, { segs: 2, curl: (r() - 0.5) * 0.15, sway0: swayTop * tSpike, sway1: swayTop });
    for (let w = 0; w < 3; w++) {
      const tt = 0.1 + w * 0.2 + r() * 0.05;
      const p = at.p.clone().addScaledVector(dir, spikeLen * tt);
      flatCard(flowers, p, deflect(dir, 0.25 * r(), r() * 6.28), 0.03 * k, whorlUV(w < 2 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)), tone, sBirth, anchor ?? at.p, swayTop * lerp(tSpike, 1, tt), r() * 6.28);
    }
    // A pair of shorter side spikes from the top leaf pair, as on a branched sage panicle.
    if (i % 2 === 0) {
      const a2 = along(pts, tSpike - 0.03);
      for (const sd of [0, Math.PI]) {
        const d2 = deflect(a2.dir, 0.42, az + sd + (r() - 0.5) * 0.6);
        d2.y = Math.max(d2.y, 0.8);
        d2.normalize();
        crossCards(flowers, a2.p, d2, spikeLen * (0.5 + r() * 0.15), 0.022 * k, spikeUV(2), tone, clamp(Math.max(birth, 0.25 + r() * 0.3)), anchor ?? a2.p, 2, r() * 3, { sway0: swayTop * tSpike, sway1: swayTop * tSpike });
      }
    }
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: salviaLeaves(),
    flowerMap: salviaFlowers(),
    bark: { map: stemBark() },
    look: { translucency: 0.3, leafRoughness: 0.78, bend: 0.06, flutter: 0.007, leafShadows: true },
  };
};
