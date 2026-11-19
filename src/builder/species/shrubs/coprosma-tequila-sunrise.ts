import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, stemBark, tone } from './shared-shrubs-b';
import { leafFace } from './shared-glossy';

/**
 * Coprosma repens 'Tequila Sunrise' (mirror plant, looking-glass plant), PP 18,392.
 *
 * A dense, freely branching, upright evergreen shrub, an oval a little wider
 * near the top, foliage to the ground. Short upright shoots carry the leaves
 * in crowded opposite pairs, each pair turned a quarter turn from the last,
 * so every shoot tip is a tight four-leaf rosette. Leaves sessile, obovate
 * with a blunt, rounded tip, about 1.4 x 0.6 in, the margin unevenly rolled
 * under and slightly wavy, thick and so glossy they read as lacquered. The
 * color is in zones: an irregular, feathered green center, a gold to orange
 * band around it and an orange-red margin. Young shoot tips are green and
 * gold with gold-orange edges; older leaves go orange and red, and in cool
 * weather the whole plant deepens to red, the oldest leaves to burgundy.
 * Twigs red-brown; flowers insignificant.
 *
 * References:
 *  - US plant patent PP18,392 (Coprosma 'Tequila Sunrise', a branch sport of
 *    'Yuanne'): freely branching, dense and bushy, broad upright form; leaves
 *    opposite, sessile, obovate, obtuse apex, rounded base, average 3.5 cm
 *    long x 1.6 cm wide, margin entire, unevenly recurved, slightly wavy,
 *    smooth and glossy. Mature upper side RHS 137A-139B (green) at the center,
 *    surrounded by 40B (orange-red), 43B (red) toward the margin; young leaves
 *    143A (yellow-green), 15A (gold) and 24B (orange-yellow). Spring green and
 *    yellow, summer orange and green, fall and winter burgundy and brown.
 *    https://patents.google.com/patent/USPP18392
 *  - Monrovia, Tequila Sunrise Mirror Plant: 3 to 5 ft tall and wide,
 *    pyramidal, moderate growth; new growth emerald green edged in gold, then
 *    orange and gold marbling; color intensifies in winter to orange and red.
 *    https://www.monrovia.com/plant-catalog/plants/2291/tequila-sunrise-mirror-plant/
 *  - Sunset Plant Collection (the cultivar's US introducer): 23 to 36 in high
 *    x 24 to 36 in wide, moderate growth, Sunset zones 14-24, hardy to 20-30 F;
 *    new growth emerald and gold, then orange with gold, finally orange and red.
 *    https://sunsetplantcollection.com/the-collection/plant/tequila-sunrise/
 *  - Roger's Gardens: 4 ft tall, 4 ft wide.
 *  - Photos used for the color zones and habit: Native Sons and Sunset Plant
 *    Collection foliage close-ups, Devil Mountain Nursery container plants.
 * Catalog: 5 gal at 0.5 x 0.4 m, mature 1.1 m tall x 1.1 m wide (3.5 ft, between
 * Sunset's 2 to 3 ft and Monrovia's 3 to 5 ft; Central Valley frosts keep it at
 * the lower end) in about 4 years.
 */

/** One leaf's color zones: the feathered center, the band around it and the margin. */
interface Zones {
  center: string;
  streak: string;
  band: string;
  margin: string;
}

// sRGB approximations of the patent's RHS colors, then the cool-weather and oldest leaves from the photos.
const YOUNG: Zones = { center: '#3f7410', streak: '#244c0a', band: '#d89006', margin: '#cc580a' };
const MATURE: Zones = { center: '#28480f', streak: '#142a0a', band: '#cc6a08', margin: '#a01a08' };
const AUTUMN: Zones = { center: '#30340c', streak: '#1c1e08', band: '#b03408', margin: '#860e08' };
const WINTER: Zones = { center: '#2e1008', streak: '#1a0604', band: '#62100a', margin: '#86120c' };

const TAU = Math.PI * 2;

/**
 * Paint one mirror-plant leaf, base at (x, y), pointing along `rot`: an obovate blade, widest about two thirds
 * up, with a rounded tip; the zones are drawn from the margin in, each with a ragged edge, and the center is
 * feathered out along the side veins.
 */
function paintLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, rot: number, z: Zones, o: { shade?: number; squash?: number } = {}) {
  const hw = (len * 0.46 * (o.squash ?? 1)) / 2;
  const W = 0.62;
  const ph = r() * TAU, ph2 = r() * TAU;
  // Half width along the blade: a rounded wedge to the widest point, then an elliptic rounded tip; slightly wavy.
  const prof = (t: number) => {
    t = clamp(t);
    const a = t < W ? Math.pow(Math.sin((Math.PI / 2) * (t / W)), 0.62) : Math.sqrt(Math.max(0, 1 - ((t - W) / (1 - W)) ** 2));
    return a * (1 + 0.035 * Math.sin(t * 11 + ph));
  };
  /** The outline scaled to `k` of the width, from t0 to t1 along the length, with a ragged edge of amplitude `rag`. */
  const zone = (k: number, t0: number, t1: number, rag: number, freq: number) => {
    const N = 48;
    const pts: [number, number][] = [];
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i <= N; i++) {
        const u = s < 0 ? i / N : 1 - i / N;
        const t = lerp(t0, t1, u);
        const ragged = 1 + rag * (Math.sin(u * freq + ph2 * s) * 0.6 + Math.sin(u * freq * 2.3 + ph * s) * 0.4);
        // An inner zone pinches to a point at both ends; the blade itself keeps its rounded tip.
        const env = k < 1 ? Math.pow(Math.sin(Math.PI * u), 0.45) : 1;
        pts.push([len * t, s * hw * prof(t) * k * ragged * env]);
      }
    }
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.closePath();
  };
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // The margin color fills the whole blade.
  zone(1, 0, 1, 0, 0);
  const gm = g.createLinearGradient(0, 0, len, 0);
  gm.addColorStop(0, tone(z.margin, z.band, 0.35));
  gm.addColorStop(0.5, z.margin);
  gm.addColorStop(1, tone(z.margin, '#000000', 0.08));
  g.fillStyle = gm;
  g.fill();
  g.save();
  zone(1, 0, 1, 0, 0);
  g.clip();
  // The band, then the feathered center.
  zone(0.8 + r() * 0.06, -0.02, 0.95, 0.07, 9 + r() * 5);
  g.fillStyle = z.band;
  g.fill();
  const ck = 0.5 + r() * 0.16;
  zone(ck, 0.02, 0.8 + r() * 0.1, 0.16, 13 + r() * 8);
  const gc = g.createLinearGradient(0, -hw, 0, hw);
  gc.addColorStop(0, z.center);
  gc.addColorStop(0.5, tone(z.center, z.streak, 0.45));
  gc.addColorStop(1, z.center);
  g.fillStyle = gc;
  g.fill();
  // Marbling: streaks of the center color run out along the side veins into the band, and dark flecks inside it.
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + (i / 9) * 0.7 + (r() - 0.5) * 0.05;
    const sd = i % 2 ? 1 : -1;
    const reach = hw * prof(t) * (ck + 0.1 + r() * 0.25);
    g.strokeStyle = r() < 0.5 ? z.center : tone(z.center, z.band, 0.35);
    g.lineWidth = Math.max(1, len * (0.012 + r() * 0.012));
    g.beginPath();
    g.moveTo(len * t, 0);
    g.quadraticCurveTo(len * (t + 0.05), sd * reach * 0.6, len * (t + 0.1 + r() * 0.05), sd * reach);
    g.stroke();
  }
  g.strokeStyle = z.streak;
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + r() * 0.6, w = len * (0.05 + r() * 0.08);
    const off = (r() - 0.5) * hw * prof(t) * ck * 0.9;
    g.lineWidth = Math.max(1, len * (0.008 + r() * 0.01));
    g.beginPath();
    g.moveTo(len * t, off);
    g.lineTo(len * t + w, off + (r() - 0.5) * hw * 0.2);
    g.stroke();
  }
  // The rolled-under margin: a darker rim with a lit lip just inside it on the sunny half.
  zone(1, 0, 1, 0, 0);
  g.strokeStyle = tone(z.margin, '#200000', 0.4);
  g.lineWidth = Math.max(1.5, hw * 0.16);
  g.stroke();
  zone(0.9, 0.03, 0.99, 0, 0);
  g.strokeStyle = 'rgba(255,225,190,0.16)';
  g.lineWidth = Math.max(1, hw * 0.05);
  g.stroke();
  // Lacquered gloss: a broad soft sheen and a hard bright streak, both on one side of the midrib.
  const gs = g.createRadialGradient(len * 0.55, -hw * 0.32, 0, len * 0.55, -hw * 0.32, len * 0.36);
  gs.addColorStop(0, 'rgba(255,250,235,0.16)');
  gs.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = gs;
  g.fillRect(0, -hw, len, hw * 2);
  g.fillStyle = 'rgba(255,252,240,0.28)';
  g.beginPath();
  g.ellipse(len * 0.56, -hw * 0.28, len * 0.2, hw * 0.07, -0.08, 0, TAU);
  g.fill();
  const sh = o.shade ?? 0;
  if (sh !== 0) {
    g.fillStyle = sh < 0 ? `rgba(12,0,0,${-sh * 0.5})` : `rgba(255,235,200,${sh * 0.14})`;
    g.fillRect(0, -hw, len, hw * 2);
  }
  g.restore();
  // Sunken midrib: a fine pale line in a dark groove.
  g.strokeStyle = 'rgba(20,10,0,0.35)';
  g.lineWidth = Math.max(1.2, len * 0.02);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.86, 0);
  g.stroke();
  g.strokeStyle = tone(z.band, '#fff2b0', 0.4);
  g.lineWidth = Math.max(0.8, len * 0.008);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.82, 0);
  g.stroke();
  g.restore();
}

/** Leaf atlas: 8 single leaves (128 x 256) on top: 0-1 young, 2-4 mature, 5-6 cool-weather red, 7 the oldest burgundy;
 * below, 4 shoot tips seen from above (decussate pairs, young at the center). */
function leafAtlas(): { map: THREE.Texture; leaf: (i: number) => [number, number, number, number]; tip: (i: number) => [number, number, number, number] } {
  const map = leafTexture('coprosma-tequila-sunrise-leaves', 1024, 512, (g) => {
    const r = rng('coprosma-tequila-sunrise-leaf-tex');
    const zones = [YOUNG, YOUNG, MATURE, MATURE, MATURE, AUTUMN, AUTUMN, WINTER];
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      paintLeaf(g, r, 64, 252, 244, -Math.PI / 2, zones[i], { squash: 0.98 + r() * 0.04, shade: (r() - 0.5) * 0.2 });
      g.restore();
    }
    // Shoot tips: three or four pairs, each a quarter turn from the last, smaller and younger toward the center.
    const tipZones = [[MATURE, MATURE, YOUNG, YOUNG], [AUTUMN, MATURE, MATURE, YOUNG], [AUTUMN, AUTUMN, MATURE, YOUNG], [WINTER, AUTUMN, AUTUMN, MATURE]];
    for (let i = 0; i < 4; i++) {
      cellClip(g, i, 1, 256, 256);
      let a = r() * TAU;
      const pairs = tipZones[i];
      pairs.forEach((zz, k) => {
        const len = lerp(118, 52, k / (pairs.length - 1)) * (0.94 + r() * 0.1);
        for (const s of [0, Math.PI]) paintLeaf(g, r, 128, 128, len, a + s + (r() - 0.5) * 0.2, zz, { squash: lerp(0.95, 0.75, k / 3), shade: i === 3 ? -0.3 : -0.15 + k * 0.08 });
        a += Math.PI / 2 + (r() - 0.5) * 0.25;
      });
      g.restore();
    }
    hardenAlpha(g, 1024, 512);
  });
  const e = 1.5 / 1024;
  return {
    map,
    leaf: (i) => [i / 8 + e, 0.5 + e * 2, (i + 1) / 8 - e, 1 - e * 2],
    tip: (i) => [i / 4 + e, e * 2, (i + 1) / 4 - e, 0.5 - e * 2],
  };
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = leafAtlas();

  // Upright and dense: an oval a little wider above the middle, foliage to the ground, shoots turning up.
  const m = growMound(r, { H: H - 0.03, Sp: Sp - 0.06, points: 560, stems: 12, perLimb: 8, centerY: 0.55, under: -0.86, power: 2.1, lump: 0.12, lumpFreq: 3.4, rough: 0.16, stemRadius: 0.009, crown: 0.07, arch: -0.03, gnarl: 0.16, early: 0.76, stemReach: 0.55, limbReach: 0.62 });
  const stemC = col('#5b4a3e'), limbC = col('#6a4434'), twigC = col('#7a3a26');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const white = new THREE.Color(1, 1, 1);
  const shade = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    return jitter(white, r, 0.01, 0.04, 0.04).multiplyScalar(lerp(0.4, 0.86, Math.pow(d, 1.5)) * lerp(0.75, 1, clamp(p.y / (H * 0.6))) * (1 - inner * 0.3) * (0.9 + r() * 0.12));
  };
  /** One sessile leaf from `base` along `dir`, its face turned toward the shoot axis and the light, cupped a little. */
  const leaf = (base: THREE.Vector3, dir: THREE.Vector3, axis: THREE.Vector3, len: number, cell: number, c: THREE.Color, birth: number) => {
    const face = leafFace(dir, axis, m.out(base), 0.4);
    const s = m.sway(base);
    leafQuad(leaves, base, dir, face, len, len * 0.5, at.leaf(cell), c, birth, base, { segs: 2, curl: 0.15 + r() * 0.35, center: m.center, radii: m.radii, normalBend: 0.32, sway0: s, sway1: clamp(s + 0.03) });
  };
  // Older leaves are redder: the cell for a pair `age` pairs down from the shoot tip.
  const cellFor = (age: number) => {
    const x = r();
    if (age <= 0) return x < 0.8 ? Math.floor(r() * 2) : 2;
    if (age === 1) return x < 0.35 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 3);
    if (age === 2) return x < 0.3 ? Math.floor(r() * 2) : x < 0.8 ? 2 + Math.floor(r() * 3) : 5 + Math.floor(r() * 2);
    if (age <= 3) return x < 0.68 ? 2 + Math.floor(r() * 3) : 5 + Math.floor(r() * 2);
    return x < 0.45 ? 2 + Math.floor(r() * 3) : x < 0.85 ? 5 + Math.floor(r() * 2) : 7;
  };

  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1], prev = tw.pts[tw.pts.length - 2];
    const out = m.out(end);
    const tdir = end.clone().sub(prev).normalize();
    // Shoots stand up: the habit is upright, each shoot a short spire of crowded pairs.
    const axis = out.clone().multiplyScalar(0.45).addScaledVector(tdir, 0.2).add(V((r() - 0.5) * 0.25, 0.75 + r() * 0.2, (r() - 0.5) * 0.25)).normalize();
    const birth = clamp(tw.birth + r() * 0.04, 0, 0.9);
    const shootLen = 0.035 + r() * 0.025;
    const tip = end.clone().addScaledVector(axis, shootLen);
    const s = m.sway(end);
    tube(wood, [end, end.clone().lerp(tip, 0.5), tip], 0.0014, 0.0009, 3, twigC, birth, end, () => s, 2);
    // Older pairs further down the twig, darker, held out flat.
    let az = r() * TAU;
    for (const t of [0.4, 0.62, 0.84]) {
      const p = along(tw.pts, t).p;
      az += Math.PI / 2;
      const c = shade(p, 0.55);
      for (const sd of [0, Math.PI]) leaf(p, deflect(tdir, 1.15 + (r() - 0.5) * 0.3, az + sd), tdir, 0.036 + r() * 0.007, cellFor(5), c, birth);
    }
    // Pairs up the shoot, each a quarter turn from the last, smaller and more erect toward the tip.
    const lit = shade(end, 0);
    const N = 5;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const p = end.clone().lerp(tip, Math.pow(t, 0.8));
      az += Math.PI / 2 + (r() - 0.5) * 0.2;
      const len = lerp(0.037, 0.024, Math.pow(t, 1.3)) * (0.9 + r() * 0.2);
      const ang = lerp(1.1, 0.62, t) + (r() - 0.5) * 0.15;
      const c = lit.clone().multiplyScalar(lerp(0.9, 1.02, t));
      for (const sd of [0, Math.PI]) leaf(p, deflect(axis, ang, az + sd), axis, len, cellFor(N - 1 - k), c, birth);
    }
  }
  // Shoot tips seen from above, packed inside the bush and just under its surface, so it reads dense between the shoots.
  for (const b of [...m.limbs, ...m.stems]) {
    const n = b.level === 0 ? 6 : 9;
    for (let k = 0; k < n; k++) {
      const a2 = along(b.pts, 0.3 + r() * 0.7);
      const o = m.out(a2.p);
      const face = o.clone().lerp(UP, 0.45).add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();
      const dir = perp(face).applyAxisAngle(face, r() * TAU);
      const size = 0.09 + r() * 0.04;
      const base = a2.p.clone().addScaledVector(dir, -size * 0.5);
      const sw = m.sway(a2.p);
      const inner = m.depth(a2.p) < 0.6;
      leafQuad(leaves, base, dir, face, size, size, at.tip(inner ? 3 : Math.floor(r() * 3)), shade(a2.p, 1).multiplyScalar(0.8), b.birth === 0 ? (r() < 0.85 ? 0 : r() * 0.4) : b.birth, a2.p, { segs: 1, center: m.center, radii: m.radii, normalBend: 0.6, sway0: sw, sway1: sw });
    }
  }
  for (const tw of m.twigs) {
    const p = along(tw.pts, 0.6 + r() * 0.3).p;
    const o = m.out(p);
    const face = o.clone().lerp(UP, 0.25).add(V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)).normalize();
    const dir = perp(face).applyAxisAngle(face, r() * TAU);
    const size = 0.085 + r() * 0.035;
    const sw = m.sway(p);
    leafQuad(leaves, p.clone().addScaledVector(dir, -size * 0.5), dir, face, size, size, at.tip(Math.floor(r() * 3)), shade(p, 0.4).multiplyScalar(0.9), tw.birth, p, { segs: 1, center: m.center, radii: m.radii, normalBend: 0.55, sway0: sw, sway1: sw });
  }

  fitAll([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: stemBark('coprosma', 0.25) },
    look: { leafRoughness: 0.7, translucency: 0.14, bend: 0.03, flutter: 0.004 },
  };
};
