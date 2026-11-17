import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, stemBark, tone } from './shared-shrubs-b';
import { bloom, leafFace, paintGlossLeaf, type GlossLeaf } from './shared-glossy';

/**
 * Gardenia jasminoides 'Veitchii' (everblooming gardenia), in bloom.
 *
 * A compact, upright, rounded evergreen shrub, dense to the ground, on many
 * thin gray-brown stems. Leaves glossy deep green, elliptic with a pointed
 * tip, 2 to 4 in, in opposite pairs or whorls of three, held up and out at
 * the shoot ends, with deeply impressed veins; new leaves lighter green.
 * Fully double, creamy white flowers about 2 to 2.5 in across sit at the
 * shoot tips above the last whorl, the older ones aging to ivory-yellow, with
 * pale green spiral buds. Blooms late spring through summer, repeating.
 *
 * References (sizes in the landscape):
 *  - Monrovia, Everblooming Gardenia (Gardenia jasminoides 'Veitchii'):
 *    4 ft tall, 3 ft wide; moderate growth; glossy dark green leaves; double
 *    white flowers spring to summer. https://www.monrovia.com/everblooming-gardenia.html
 *  - NC State Extension Plant Toolbox, Gardenia jasminoides ('Veitchii'):
 *    4 to 6 ft tall, 3 to 4 ft wide; species leaves 2 to 4 in, opposite or
 *    whorled, glossy, leathery, with sunken veins; flowers 1 to 3 in, white
 *    aging to yellow. https://plants.ces.ncsu.edu/plants/gardenia-jasminoides/
 *  - Clemson HGIC, Gardenia: 'Veitchii' 4 to 6 ft x 3 to 4 ft, double flowers,
 *    long bloom period. https://hgic.clemson.edu/factsheet/gardenia/
 *  - Hirt's / Grange Co-op listings: 'Veitchii' double blooms 2 to 3 in across.
 * Catalog: 1 gal at 0.3 x 0.3 m, mature 1.2 m tall x 0.9 m wide (Monrovia's
 * 4 x 3 ft, the low end of NC State; gardenias stay compact in Central Valley
 * heat and alkaline soil) in about 5 years.
 */

const LEAF: GlossLeaf = {
  base: '#1b3a15', dark: '#0d230a', fresh: '#5f8f2e', aspect: 0.5, widest: 0.5, tip: 0.6,
  veins: 8, impressed: 0.5, gloss: 0.14, midrib: 'rgba(160,185,115,0.75)',
};

/** Leaf atlas: 8 single leaves (128 x 256; the last two young and light) on top, 4 whorls seen from above below. */
function leafAtlas(): { map: THREE.Texture; leaf: (i: number) => [number, number, number, number]; whorl: (i: number) => [number, number, number, number] } {
  const map = leafTexture('gardenia-veitchii-leaves', 1024, 512, (g) => {
    const r = rng('gardenia-veitchii-leaf-tex');
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      const fresh = [0, 0, 0.05, 0.1, 0.15, 0.25, 0.45, 0.8][i];
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...LEAF, aspect: 0.47 + r() * 0.04 }, { fresh, shade: (r() - 0.5) * 0.3 });
      g.restore();
    }
    for (let i = 0; i < 4; i++) {
      cellClip(g, i, 1, 256, 256);
      const n = 7 + Math.floor(r() * 3), a0 = r() * 6.3;
      for (let k = 0; k < n; k++) paintGlossLeaf(g, r, 128, 128, 112 + r() * 14, a0 + k * 2.39996, LEAF, { fresh: r() * 0.1, shade: -0.2 - r() * 0.35, squash: 0.85 + r() * 0.2 });
      for (let k = 0; k < 3; k++) paintGlossLeaf(g, r, 128, 128, 60 + r() * 14, a0 + 0.6 + k * 2.1, LEAF, { fresh: 0.35, shade: -0.05 });
      g.restore();
    }
    hardenAlpha(g, 1024, 512);
  });
  const e = 1.5 / 1024;
  return {
    map,
    leaf: (i) => [i / 8 + e, 0.5 + e * 2, (i + 1) / 8 - e, 1 - e * 2],
    whorl: (i) => [i / 4 + e, e * 2, (i + 1) / 4 - e, 0.5 - e * 2],
  };
}

/** Flowers: two fresh double blooms and an aging one (top views), and a spiral bud (side view). */
function flowerTex(white: string, cream: string): THREE.Texture {
  return leafTexture('gardenia-veitchii-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('gardenia-veitchii-flower-tex');
    const petal = (ang: number, r0: number, len: number, wid: number, c: { base: string; mid: string; tip: string }, curl: number) => {
      g.save();
      g.rotate(ang);
      g.translate(r0, 0);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, c.base);
      grad.addColorStop(0.45, c.mid);
      grad.addColorStop(1, c.tip);
      g.fillStyle = grad;
      // Broad obovate petal with a softly pointed, slightly twisted tip.
      const tw = (r() - 0.5) * 0.25 * wid;
      g.beginPath();
      g.moveTo(0, -wid * 0.12);
      g.bezierCurveTo(len * 0.25, -wid * 0.62, len * 0.82, -wid * 0.62, len * 0.98, tw - wid * 0.05);
      g.quadraticCurveTo(len * 1.02, tw, len * 0.97, tw + wid * 0.08);
      g.bezierCurveTo(len * 0.82, wid * 0.6, len * 0.25, wid * 0.6, 0, wid * 0.12);
      g.closePath();
      g.shadowColor = 'rgba(90,78,30,0.6)';
      g.shadowBlur = 18;
      g.shadowOffsetX = -3;
      g.fill();
      g.shadowBlur = 0;
      g.shadowOffsetX = 0;
      g.save();
      g.clip();
      // Waxy texture: faint parallel veins, a curled rim catching light, a shaded fold.
      g.strokeStyle = 'rgba(150,140,100,0.12)';
      g.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(len * 0.05, 0);
        g.quadraticCurveTo(len * 0.5, i * wid * 0.08, len * 0.95, i * wid * 0.12 + tw * 0.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(120,110,70,0.12)';
      g.beginPath();
      g.ellipse(len * 0.55, wid * 0.3, len * 0.4, wid * 0.16, 0.05, 0, 6.3);
      g.fill();
      if (curl > 0) {
        g.strokeStyle = `rgba(255,255,250,${curl})`;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(len * 0.75, -wid * 0.42);
        g.quadraticCurveTo(len * 1.0, tw, len * 0.75, wid * 0.42);
        g.stroke();
      }
      g.restore();
      g.restore();
    };
    const double = (pal: { base: string; mid: string; tip: string }, deep: string) => {
      g.translate(S / 2, S / 2);
      const R = S * 0.48;
      const a0 = r() * 6.28;
      // Outer to inner whorls of petals, each turned against the one below.
      const layers: [number, number, number, number][] = [[7, 0.98, 0.84, 0], [7, 0.84, 0.72, 0.45], [6, 0.66, 0.6, 0.1], [5, 0.48, 0.48, 0.7], [4, 0.32, 0.36, 0.3]];
      layers.forEach(([n, len, wid, off], li) => {
        const c = li < 2 ? pal : { base: tone(pal.base, deep, 0.25 + li * 0.1), mid: tone(pal.mid, pal.base, 0.15 * li), tip: pal.tip };
        for (let i = 0; i < n; i++) petal(a0 + off + (i / n) * 6.2832 + (r() - 0.5) * 0.2, R * 0.03, R * len * (0.92 + r() * 0.1), R * wid, c, li < 3 ? 0.35 : 0.2);
      });
      // Tight center: the last petals rolled around each other.
      g.strokeStyle = tone(deep, '#9a8c5a', 0.4);
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(0, 0, R * (0.05 + i * 0.035), a0 + i * 2, a0 + i * 2 + 3.6);
        g.stroke();
      }
    };
    cellClip(g, 0, 0, S, S); double({ base: tone(white, cream, 0.75), mid: white, tip: tone(white, '#ffffff', 0.5) }, cream); g.restore();
    cellClip(g, 1, 0, S, S); double({ base: tone(white, cream, 0.9), mid: tone(white, cream, 0.2), tip: white }, cream); g.restore();
    // Aging bloom: ivory-yellow with tan petal edges.
    const old = tone(cream, '#f2dc8a', 0.45);
    cellClip(g, 0, 1, S, S); double({ base: tone(old, '#c4a458', 0.3), mid: old, tip: tone(old, '#fff4cc', 0.3) }, '#b8994a'); g.restore();
    // Bud: a pale green-white spindle twisted to a point, in a green calyx with thin lobes.
    cellClip(g, 1, 1, S, S);
    {
      const cx = S / 2, by = S * 0.86, top = S * 0.08, w = S * 0.17;
      const grad = g.createLinearGradient(cx - w, 0, cx + w, 0);
      grad.addColorStop(0, '#7f9c58');
      grad.addColorStop(0.45, '#d4e0b0');
      grad.addColorStop(1, '#93ad68');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, by);
      g.bezierCurveTo(cx - w * 1.25, by - S * 0.2, cx - w * 0.7, top + S * 0.18, cx + w * 0.1, top);
      g.bezierCurveTo(cx + w * 0.8, top + S * 0.2, cx + w * 1.2, by - S * 0.22, cx, by);
      g.fill();
      g.strokeStyle = 'rgba(110,130,80,0.55)';
      g.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - w * 0.9 + i * w * 0.55, by - S * 0.1);
        g.quadraticCurveTo(cx - w * 0.5 + i * w * 0.4, by - S * 0.4, cx + w * 0.1, top + S * 0.02);
        g.stroke();
      }
      g.fillStyle = '#5f8a34';
      g.beginPath();
      g.ellipse(cx, by + S * 0.02, w * 0.62, S * 0.07, 0, 0, 6.3);
      g.fill();
      g.strokeStyle = '#5a8432';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = lerp(-0.6, 0.6, i / 4);
        g.beginPath();
        g.moveTo(cx + a * w, by);
        g.quadraticCurveTo(cx + a * w * 1.6, by - S * 0.12, cx + a * w * 1.3, by - S * 0.26);
        g.stroke();
      }
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(cx, by + S * 0.05);
      g.lineTo(cx, S - 2);
      g.stroke();
    }
    g.restore();
    hardenAlpha(g, 1024, 1024);
  });
}

const UV4 = (i: number): [number, number, number, number] => {
  const e = 1.5 / 1024, cx = i % 2, cy = Math.floor(i / 2);
  return [cx / 2 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 2 - e, 1 - cy / 2 - e];
};

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = leafAtlas();

  // Upright rounded: widest a little above the middle, foliage nearly to the ground.
  const m = growMound(r, { H: H - 0.04, Sp: Sp - 0.08, points: 200, stems: 11, perLimb: 6, centerY: 0.44, under: -0.85, power: 2.05, lump: 0.07, lumpFreq: 3, rough: 0.12, stemRadius: 0.0085, crown: 0.06, arch: 0.02, gnarl: 0.14, early: 0.62, stemReach: 0.55, limbReach: 0.6 });
  const stemC = col('#575045'), limbC = col('#5f584a'), twigC = col('#5d6644');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const white = new THREE.Color(1, 1, 1);
  const shade = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    return jitter(white, r, 0.012, 0.04, 0.04).multiplyScalar(lerp(0.5, 1, Math.pow(d, 1.6)) * lerp(0.78, 1, clamp(p.y / (H * 0.55))) * (1 - inner * 0.25) * (0.9 + r() * 0.12));
  };
  const leaf = (base: THREE.Vector3, dir: THREE.Vector3, axis: THREE.Vector3, len: number, cell: number, c: THREE.Color, birth: number, fold: boolean) => {
    const face = leafFace(dir, axis, m.out(base), 0.35);
    const s = m.sway(base);
    leafQuad(leaves, base, dir, face, len, len * 0.5, at.leaf(cell), c, birth, base, { segs: fold ? 2 : 1, curl: fold ? 0.2 + r() * 0.3 : 0, fold: fold ? 0.1 : 0, center: m.center, radii: m.radii, normalBend: 0.35, sway0: s, sway1: clamp(s + 0.06) });
  };

  const pedC = col('#7d9452');
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1], prev = tw.pts[tw.pts.length - 2];
    const out = m.out(end);
    const tdir = end.clone().sub(prev).normalize();
    // Shoots turn up toward the light.
    const axis = out.clone().multiplyScalar(0.65).addScaledVector(tdir, 0.25).add(V((r() - 0.5) * 0.3, 0.4 + r() * 0.2, (r() - 0.5) * 0.3)).normalize();
    const birth = clamp(tw.birth + r() * 0.05, 0, 0.9);
    const shootLen = 0.035 + r() * 0.02;
    const tip = end.clone().addScaledVector(axis, shootLen);
    const s = m.sway(end);
    tube(wood, [end, end.clone().lerp(tip, 0.5), tip], 0.0022, 0.0014, 3, twigC, birth, end, () => s, 2);
    const lit = shade(end, 0);
    // Older pairs further down the twig, darker and flatter.
    let az = r() * 6.28;
    for (const t of [0.5, 0.8]) {
      const p = along(tw.pts, t).p;
      az += Math.PI / 2;
      for (const sd of [0, Math.PI]) leaf(p, deflect(tdir, 1.1 + (r() - 0.5) * 0.3, az + sd), tdir, 0.082 + r() * 0.014, Math.floor(r() * 4), shade(p, 0.6), birth, false);
    }
    // Pairs or whorls of three up the shoot, smaller and more upright toward the tip.
    // The shoot tip: a flower, a bud, or a pair of young light leaves.
    const up = out.y > -0.25;
    const roll = r();
    const flowering = up && roll < 0.4;
    // Under a flower the last whorl spreads wide, as a collar below the bloom.
    const nodes = [[0.0, 0.084, 1.12], [0.5, 0.074, 0.95], flowering ? [1.0, 0.06, 1.2] : [1.0, 0.056, 0.72]];
    nodes.forEach(([t, len, ang], k) => {
      const p = end.clone().lerp(tip, t);
      const whorl = r() < 0.35 ? 3 : 2;
      az += Math.PI / 2 + (r() - 0.5) * 0.3;
      for (let j = 0; j < whorl; j++) {
        const dir = deflect(axis, ang + (r() - 0.5) * 0.25, az + (j / whorl) * Math.PI * 2 + (r() - 0.5) * 0.3);
        leaf(p, dir, axis, len * (0.88 + r() * 0.24), k === 2 && r() < 0.3 ? 5 + Math.floor(r() * 2) : Math.floor(r() * 5), lit.clone().multiplyScalar(0.92 + 0.04 * k), birth, k === 0);
      }
    });
    if (flowering) {
      const n = axis.clone().multiplyScalar(0.55).addScaledVector(out, 0.45).add(V(0, 0.15, 0)).normalize();
      const R = 0.028 + r() * 0.007;
      const c = tip.clone().addScaledVector(axis, 0.014);
      const old = r() < 0.15;
      const tint = col('#ffffff', old ? 0.9 : 0.8 + r() * 0.06);
      tube(wood, [tip, c], 0.0025, 0.0022, 3, pedC, clamp(birth + 0.02), tip, () => s, 1);
      bloom(flowers, c, n, R, [{ r: 0.3, h: 0.46 }, { r: 0.62, h: 0.3 }, { r: 1.0, h: 0.02 }], 0.4, 9, UV4(old ? 2 : r() < 0.5 ? 0 : 1), tint, birth, tip, s, r() * 6.28);
    } else if (up && roll < 0.5) {
      const len = 0.022 + r() * 0.008;
      const d = axis.clone().lerp(UP, 0.3).normalize();
      const f1 = perp(d), f2 = V().crossVectors(d, f1).normalize();
      const tint = col('#ffffff', 0.9);
      for (const f of [f1, f2]) leafQuad(flowers, tip.clone().addScaledVector(d, -0.004), d, f, len, len * 0.62, UV4(3), tint, clamp(birth + 0.03), tip, { sway0: s, sway1: s });
    } else {
      for (const sd of [0, Math.PI]) leaf(tip, deflect(axis, 0.32 + r() * 0.15, az + Math.PI / 2 + sd), axis, 0.036 + r() * 0.01, r() < 0.75 ? 6 : 7, lit, birth, false);
    }
  }
  // Shaded whorls inside the bush, so it reads dense and dark between the shoots.
  for (const b of [...m.limbs, ...m.stems]) {
    const n = b.level === 0 ? 5 : 7;
    for (let k = 0; k < n; k++) {
      const at2 = along(b.pts, 0.3 + r() * 0.7);
      const o = m.out(at2.p);
      const face = o.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();
      const dir = perp(face).applyAxisAngle(face, r() * 6.28);
      const size = 0.17 + r() * 0.05;
      const base = at2.p.clone().addScaledVector(dir, -size * 0.5);
      const sw = m.sway(at2.p);
      leafQuad(leaves, base, dir, face, size, size, at.whorl(Math.floor(r() * 4)), shade(at2.p, 1).multiplyScalar(0.75), b.birth === 0 ? (r() < 0.85 ? 0 : r() * 0.4) : b.birth, at2.p, { segs: 1, center: m.center, radii: m.radii, normalBend: 0.6, sway0: sw, sway1: sw });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(spec.flower ?? '#fbf8ee', spec.flower2 ?? '#efe6c4'),
    bark: { map: stemBark('gardenia', 0.25) },
    look: { leafRoughness: 0.6, translucency: 0.16, bend: 0.035, flutter: 0.006 },
  };
};
