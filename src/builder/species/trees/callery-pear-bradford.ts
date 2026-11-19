import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, clamp, col, jitter, leafPath, leafQuad, leafTexture, lerp, perp, rng, uvCell, type PlantSpec, type SpeciesBuilder, type SpeciesGeo } from '../kit';
import { WOOD_BEND, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, normalFromHeight, platePath, rootFlare, tiled } from './shared-trees-a';
import { cssMix } from './shared-conifers';

/**
 * Flowering pear, Pyrus calleryana 'Bradford', the ornamental Callery pear planted in front yards and along streets
 * across California subdivisions from the 1960s to the 1990s. One short trunk clear to about 6 ft, then many upright
 * limbs rising close together at narrow angles (the cultivar's well-known weak crotches) into a dense, broad oval to
 * teardrop crown. Leaves alternate and clustered on short spurs, broadly ovate with a short point and a finely
 * scalloped, wavy edge, glossy dark green on long stalks. In early spring, before and as the leaves unfold, it is
 * covered in dense clusters of five-petaled white flowers with purple-red anthers.
 *
 * There are two catalog plants on this builder: `callery-pear-bradford` in bloom (its signature look, and how the
 * designer's renders show it) and `callery-pear-bradford-leaf` in summer leaf. The studio has no seasons, so the
 * season is the plant's choice.
 *
 * References (numbers they give):
 *  - NC State Extension Plant Toolbox, Pyrus calleryana 'Bradford' (plants.ces.ncsu.edu/plants/pyrus-calleryana):
 *    30 to 50 ft tall, 20 to 35 ft wide; dense pyramidal with strongly ascending branches, tight crotches; leaves 1 to
 *    3 in long and wide, ovate, crenate and wavy, glossy dark green above, paler beneath, reddish-purple in fall;
 *    flowers creamy white, 0.75 to 1 in across, five petals, in dense corymbs about 3 in long, early spring, among
 *    the first trees to bloom; fruit round, 0.5 in; bark light brown to gray and smooth when young, ridged, furrowed
 *    and blocky with age.
 *  - Virginia Cooperative Extension 3010-1464, Bradford pear: about 35 ft tall and 25 ft wide; creamy white flowers in
 *    dense corymbs in early spring.
 *  - University of Florida IFAS, 'Aristocrat' (the usual alternative cultivar): 35 to 45 ft x 25 to 35 ft, a central
 *    leader with wider branch angles; flowers white with purple anthers before the leaves.
 * Catalog size: 35 ft x 28 ft (10.7 x 8.5 m), VA Tech's height and the 28 ft canopy circle Green Lion's blueprint
 * draws for an existing pear. Fast growing: about 20 years to that size from a 15 gal.
 */

const LEAF = { dark: '#17330e', mid: '#244c17', light: '#336222', young: '#86a84a', rib: 'rgba(150,180,105,0.24)', stalk: '#6f8a3a', twig: '#5e5246' };
const PETAL = { white: '#fbfaf4', cream: '#efecd8', shade: '#d8d8cc', anther: '#7b2636', pollen: '#d8c06a', pedicel: '#7f9a44' };

/** One leaf: stalk then a broad ovate glossy blade with a short point, from (x, y) along `rot`. */
function pearLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, rot: number, stalk: number, len: number, young: number, tone: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = cssMix(LEAF.stalk, LEAF.young, young, tone);
  g.lineWidth = Math.max(1.2, len * 0.03);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(stalk, 0);
  g.stroke();
  g.translate(stalk, 0);
  const wid = len * (0.78 + r() * 0.12);
  const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  const c0 = young > 0.5 ? LEAF.young : LEAF.mid;
  grad.addColorStop(0, cssMix(young > 0.5 ? LEAF.light : LEAF.dark, c0, 0.4, tone));
  grad.addColorStop(0.5, cssMix(c0, LEAF.light, 0.3, tone));
  grad.addColorStop(1, cssMix(young > 0.5 ? LEAF.light : LEAF.dark, c0, 0.6, tone));
  g.fillStyle = grad;
  leafPath(g, len, wid, 0.36, 0.78);
  g.fill();
  // Gloss: a soft highlight along one side of the midrib.
  g.fillStyle = `rgba(255,255,235,${0.03 + r() * 0.05})`;
  g.beginPath();
  g.ellipse(len * 0.45, -wid * 0.15, len * 0.3, wid * 0.16, -0.08, 0, Math.PI * 2);
  g.fill();
  // A pale midrib, and faint side veins (the blade is glossy and smooth, not ribbed).
  g.strokeStyle = 'rgba(170,200,120,0.45)';
  g.lineWidth = Math.max(0.8, len * 0.018);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.9, 0);
  g.stroke();
  g.strokeStyle = LEAF.rib;
  g.lineWidth = Math.max(0.6, len * 0.009);
  g.beginPath();
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    for (const s of [-1, 1]) {
      g.moveTo(len * t, 0);
      g.quadraticCurveTo(len * (t + 0.08), s * wid * 0.22, len * (t + 0.16), s * wid * 0.36 * Math.sin(Math.PI * Math.min(1, t + 0.1)));
    }
  }
  g.stroke();
  g.restore();
}

/**
 * Leaf atlas, 1024, 2 x 2 cells of 512 (a cell is a card about 0.3 m long). Cells 0 and 1: a spur cluster of five or
 * six leaves fanned from the bottom middle. Cell 2: a shoot with alternate leaves. Cell 3: young, half-grown pale
 * green leaves just unfolding (the leaves at bloom time).
 */
function pearLeaves(): THREE.Texture {
  return leafTexture('callery-pear-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('callery-pear-leaf-tex');
    const up = -Math.PI / 2;
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(3, 3, S - 6, S - 6);
      g.clip();
      const x0 = S / 2, y0 = S - 8;
      if (cell < 2 || cell === 3) {
        const young = cell === 3;
        const n = young ? 7 : cell === 0 ? 5 : 6;
        for (let i = 0; i < n; i++) {
          const a = up + lerp(-1.15, 1.15, i / (n - 1)) + (r() - 0.5) * 0.22;
          const len = young ? S * (0.17 + r() * 0.1) : S * (0.33 + r() * 0.08);
          pearLeaf(g, r, x0, y0, a, young ? S * 0.06 : S * (0.11 + r() * 0.05), len, young ? 1 : 0, 0.78 + r() * 0.36);
        }
        g.fillStyle = '#6a5c4c';
        g.beginPath();
        g.ellipse(x0, y0, 9, 7, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        // A shoot: twig up the cell, alternate leaves.
        g.strokeStyle = LEAF.twig;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x0, S - 4);
        g.lineTo(x0 + 6, S * 0.2);
        g.stroke();
        for (let i = 0; i < 7; i++) {
          const t = 0.08 + (i / 6) * 0.82, s = i % 2 ? 1 : -1;
          pearLeaf(g, r, lerp(x0, x0 + 6, t), lerp(S - 4, S * 0.2, t), up + s * (1.0 - 0.6 * t) + (r() - 0.5) * 0.2, S * 0.07, S * (0.25 + r() * 0.06), 0, 0.8 + r() * 0.35);
        }
        pearLeaf(g, r, x0 + 6, S * 0.22, up + (r() - 0.5) * 0.2, S * 0.05, S * 0.2, 0.3, 1);
      }
      g.restore();
    }
  });
}

/** One open flower seen from about above: five rounded white petals, a green center and purple-red anthers. */
function blossom(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rad: number, tilt: number, rot: number, tone: number) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(1, tilt);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + (r() - 0.5) * 0.2;
    const pr = rad * (0.46 + r() * 0.08);
    const px = Math.cos(a) * rad * 0.5, py = Math.sin(a) * rad * 0.5;
    const grad = g.createRadialGradient(0, 0, rad * 0.1, px, py, pr * 1.1);
    grad.addColorStop(0, cssMix(PETAL.cream, PETAL.shade, 0.3, tone));
    grad.addColorStop(0.45, cssMix(PETAL.white, PETAL.cream, 0.2, tone));
    grad.addColorStop(1, cssMix(PETAL.white, PETAL.shade, r() * 0.25, tone));
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px, py, pr, pr * 0.86, a, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(150,150,130,0.25)';
    g.lineWidth = 0.8;
    g.stroke();
  }
  g.fillStyle = '#9db058';
  g.beginPath();
  g.arc(0, 0, rad * 0.16, 0, Math.PI * 2);
  g.fill();
  // About twenty stamens with dark purple-red anthers.
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2, d = rad * (0.14 + r() * 0.16);
    g.fillStyle = r() < 0.8 ? PETAL.anther : PETAL.pollen;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(1.2, rad * 0.045), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A corymb: 7 to 12 flowers on stalks from one point, the outer ones opening first, a few still in bud. */
function corymb(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, size: number, ang: number, tone: number) {
  const n = 7 + Math.floor(r() * 6);
  const pts: [number, number, number, boolean][] = [];
  for (let i = 0; i < n; i++) {
    const a = ang + (r() - 0.5) * 2.4;
    const d = size * (0.25 + r() * 0.42);
    pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, a, r() < 0.12]);
  }
  g.strokeStyle = PETAL.pedicel;
  g.lineWidth = Math.max(1, size * 0.02);
  for (const [px, py] of pts) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(px, py);
    g.stroke();
  }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [px, py, a, bud] of pts) {
    if (bud) {
      g.fillStyle = cssMix(PETAL.white, PETAL.cream, 0.5, tone);
      g.beginPath();
      g.arc(px, py, size * 0.07, 0, Math.PI * 2);
      g.fill();
    } else blossom(g, r, px, py, size * (0.2 + r() * 0.05), 0.75 + r() * 0.25, a, tone * (0.85 + r() * 0.2));
  }
}

/**
 * Flower atlas, 1024, 2 x 2 cells of 512 (a cell is a card about 0.3 m: a corymb 3 in across is about 130 px).
 * Cells 0 to 2: a short spur shoot with three to five corymbs and a few unfolding leaves. Cell 3: one big corymb.
 */
function pearFlowers(): THREE.Texture {
  return leafTexture('callery-pear-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('callery-pear-flower-tex');
    const up = -Math.PI / 2;
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(3, 3, S - 6, S - 6);
      g.clip();
      if (cell < 3) {
        g.strokeStyle = LEAF.twig;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(S / 2, S - 4);
        g.lineTo(S / 2 + (r() - 0.5) * 30, S * 0.3);
        g.stroke();
        const n = 3 + cell;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const s = i % 2 ? 1 : -1;
          const x = S / 2 + s * S * (0.12 + r() * 0.12), y = lerp(S * 0.78, S * 0.24, t) + (r() - 0.5) * 30;
          // Young leaves tucked under the cluster.
          for (let k = 0; k < 2; k++) pearLeaf(g, r, x, y + S * 0.05, up + s * (1.3 + r() * 0.5), S * 0.03, S * (0.1 + r() * 0.05), 1, 0.9);
          corymb(g, r, x, y, S * (0.2 + r() * 0.05), up + s * 0.4, 1);
        }
      } else corymb(g, r, S / 2, S * 0.5, S * 0.42, up, 1);
      g.restore();
    }
  });
}

interface Plate { x: number; y: number; rx: number; ry: number; tone: number; seed: number }

/** Gray-brown bark broken by shallow furrows into small, blocky, slightly scaly plates. */
function pearBark(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const S = 512;
  const r = rng('callery-pear-plates');
  const plates: Plate[] = [];
  // Plates in loose vertical strips between furrows, of uneven length: more ridged than tiled.
  const cols = 12;
  for (let i = 0; i < cols; i++) {
    let y = r() * S * 0.3;
    const x = ((i + 0.5 + (r() - 0.5) * 0.5) / cols) * S;
    while (y < S * 1.3) {
      const ry = (S / 9) * (0.4 + r() * 0.9);
      plates.push({ x: x + (r() - 0.5) * 10, y: y + ry, rx: (S / cols) * (0.34 + r() * 0.14), ry, tone: r(), seed: Math.floor(r() * 1e6) });
      y += ry * 2 + 3 + r() * 6;
    }
  }
  const map = barkTexture('callery-pear-bark', S, (g) => {
    g.fillStyle = '#26211d';
    g.fillRect(0, 0, S, S);
    for (const p of plates) {
      const base = p.tone < 0.33 ? '#4a433b' : p.tone < 0.66 ? '#544c43' : '#423b34';
      tiled(g, S, () => {
        g.fillStyle = base;
        platePath(g, rng(`pp${p.seed}`), p.x, p.y, p.rx, p.ry, 0.22);
        g.fill();
        g.fillStyle = 'rgba(150,140,126,0.16)';
        platePath(g, rng(`pq${p.seed}`), p.x, p.y - p.ry * 0.15, p.rx * 0.7, p.ry * 0.6, 0.3);
        g.fill();
      });
    }
    const q = rng('callery-pear-bark-grain');
    for (let i = 0; i < 1200; i++) {
      const x = q() * S, y = q() * S, len = 3 + q() * 12, light = q() < 0.5;
      tiled(g, S, () => {
        g.globalAlpha = 0.15;
        g.strokeStyle = light ? '#a49a8c' : '#25201b';
        g.lineWidth = 0.8 + q();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (q() - 0.5) * 3, y + len);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
  const normalMap = normalFromHeight('callery-pear-bark-n', S, 1.8, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    for (const p of plates) {
      [1, 0.82, 0.62].forEach((k, i) => {
        const v = Math.round(255 * (0.45 + i * 0.27));
        tiled(g, S, () => {
          g.fillStyle = `rgb(${v},${v},${v})`;
          platePath(g, rng(`pp${p.seed}`), p.x, p.y, p.rx * k, p.ry * k, 0.22);
          g.fill();
        });
      });
    }
  });
  return { map, normalMap };
}

/** The tree, in bloom (spring) or in summer leaf. */
export function buildPear(spec: PlantSpec, bloom: boolean): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id.replace(/-leaf$/, ''));
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const crownBase = 0.16;
  // A dense broad oval, a little fuller above the middle (teardrop).
  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.5, baseR: 0.72, pBot: 0.6, pTop: 1.9, lump: 0.05, phase: r() * 6 });
  const r0 = H * 0.019;
  const limbs = growTree(
    r,
    [{ base: V(0, -0.15, 0), dir: V(0.02, 1, -0.02), length: H * 0.5, r0, r1: r0 * 0.3, segs: 7, gnarl: 0.05, up: 0.2 }],
    [
      // Many upright limbs from close together above head height: the cultivar's crowded, narrow-angled scaffolds.
      { count: [9, 11], from: 0.32, to: 0.66, angle: 0.55, angleVar: 0.22, len: 1.15, lenVar: 0.12, taperAlong: 0.85, radius: 0.62, tip: 0.2, segs: 6, gnarl: 0.22, up: 0.22, out: 0.28, early: 1, limit: [0.97, 1], minKeep: 0.5 },
      { parents: [0, 1], perMeter: 1.7, from: (l) => (l.level === 0 ? 0.72 : 0.22), to: 0.97, angle: 0.62, angleVar: 0.2, len: 0.55, lenVar: 0.25, lenMin: 1.0, taperAlong: 0.7, radius: 0.55, tip: 0.25, segs: 4, gnarl: 0.3, up: 0.16, out: 0.28, early: 0.96, limit: [0.94, 1], minKeep: 0.4 },
      { perMeter: 2.6, from: 0.15, to: 0.97, angle: 0.7, angleVar: 0.22, len: 0.5, lenVar: 0.3, lenMin: 0.5, lenMax: 1.5, taperAlong: 0.7, radius: 0.5, tip: 0.3, tipMin: 0.005, segs: 3, gnarl: 0.35, up: 0.12, out: 0.15, early: 0.92, smooth: false, limit: [0.94, 1.01], minKeep: 0.3 },
      { perMeter: 4.2, from: 0.12, to: 0.97, angle: 0.72, angleVar: 0.25, len: 0.5, lenVar: 0.35, lenMin: 0.2, lenMax: 0.55, taperAlong: 0.75, radius: 0.5, tip: 0.5, tipMin: 0.003, segs: 1, gnarl: 0.2, up: 0.12, early: 0.88, smooth: false, limit: [0.95, 1.03] },
    ],
    env,
  );
  rootFlare(limbs[0], 0.5, r0 * 1.5);

  const center = V(0, H * lerp(crownBase, 1, 0.48), 0), radii = V(R, H * (1 - crownBase) * 0.56, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#8e9a86'), tOuter: col('#ffffff'), tNew: col('#eef4c4') });
  // Most twigs are hidden in the crown: draw about two in three of them.
  emitWood(wood, limbs.filter((l) => l.level < 4 || r() < (bloom ? 0.75 : 0.55)), {
    tile: 0.6,
    sway: T.sway,
    color: (l) => (l.level >= 4 ? col('#4e463e') : l.level === 3 ? col('#645b51') : col('#b4aca2')),
    sides: (l) => (l.level >= 3 ? 3 : l.level === 2 ? 5 : l.level === 1 ? 8 : 14),
  });

  const SPUR = [uvCell(2, 2, 0), uvCell(2, 2, 1)];
  const SHOOT = uvCell(2, 2, 2), YOUNG = uvCell(2, 2, 3);
  const leafCard = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number, uv: [number, number, number, number]) => {
    const s = T.sway(at) * WOOD_BEND;
    leafQuad(leaves, at, dir, T.face(at, 0.45, 0.85), size, size, uv, T.tint(at, tipness), T.birth(birth, at), at, { segs: 2, curl: 0.25 + r() * 0.5, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.1) });
  };
  const fTint = [col('#ffffff'), col('#f8f8f2'), col('#f2f2ea')];
  const flowerCard = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, size: number, cellI: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const shade = lerp(0.62, 1, T.depth(at)) * (0.92 + r() * 0.1);
    const c = jitter(fTint[Math.floor(r() * 3)], r, 0.01, 0.03, 0.03).multiplyScalar(shade);
    const d = dir.clone().lerp(UP, 0.35).normalize();
    leafQuad(flowers, at, d, T.face(at, 0.6, 0.8), size, size, uvCell(2, 2, cellI), c, birth, at, { segs: 1, center, radii, normalBend: 0.7, sway0: s, sway1: clamp(s + 0.08) });
    // A cross card so a cluster has body from the side.
    if (r() < 0.45) {
      const f2 = V().crossVectors(d, perp(d)).normalize();
      leafQuad(flowers, at, d, f2.addScaledVector(T.outward(at), 0.6).normalize(), size * 0.8, size * 0.8, uvCell(2, 2, 3), c, birth, at, { segs: 1, center, radii, normalBend: 0.7, sway0: s, sway1: clamp(s + 0.08) });
    }
  };

  for (const l of limbs) {
    // Flowers and leaf spurs sit along the outer limbs too, not only on the twigs.
    if (l.level < 2) continue;
    const twig = l.level === 4;
    const from = twig ? 0.15 : l.level === 2 ? 0.45 : 0.3;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / (twig ? (bloom ? 0.085 : 0.17) : l.level === 2 ? (bloom ? 0.2 : 0.3) : bloom ? 0.13 : 0.28)));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (T.depth(at.p) < (bloom ? 0.26 : 0.32) + r() * 0.22) continue;
      const sgn = i % 2 ? 1 : -1;
      const dir = T.side(at.dir, sgn, 0.55, (r() - 0.55) * 0.6);
      if (bloom) {
        // In bloom: a spur shoot of corymbs nearly everywhere, and a few young leaves.
        flowerCard(at.p, dir, l.birth, 0.38 + r() * 0.12, Math.floor(r() * 3));
        if (r() < 0.22) leafCard(at.p, T.side(at.dir, -sgn, 0.4, (r() - 0.5) * 0.5), l.birth, t, 0.2 + r() * 0.05, YOUNG);
      } else {
        leafCard(at.p, dir, l.birth, t * (twig ? 1 : 0.5), 0.3 + r() * 0.06, SPUR[Math.floor(r() * 2)]);
        if (r() < 0.45) leafCard(at.p, T.side(at.dir, -sgn, 0.4, (r() - 0.7) * 0.6), l.birth, t, 0.27 + r() * 0.05, r() < 0.5 ? SHOOT : SPUR[Math.floor(r() * 2)]);
      }
    }
    const end = limbAt(l, 1);
    if (l.level < 3) continue;
    if (bloom) {
      flowerCard(end.p, end.dir, l.birth, 0.32 + r() * 0.06, Math.floor(r() * 3));
      if (r() < 0.5) leafCard(end.p, end.dir, l.birth, 1, 0.2, YOUNG);
    } else {
      leafCard(limbAt(l, twig ? 0.6 : 0.9).p, end.dir, l.birth, 1, 0.34 + r() * 0.06, SHOOT);
      for (const sgn of [-1, 1]) leafCard(end.p, T.side(end.dir, sgn, 0.6, (r() - 0.5) * 0.4), l.birth, 1, 0.26, SPUR[Math.floor(r() * 2)]);
    }
  }

  fitBuilders(bloom ? [wood, leaves, flowers] : [wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    ...(bloom ? { flowers: flowers.build(), flowerMap: pearFlowers() } : {}),
    leafMap: pearLeaves(),
    bark: pearBark(),
    look: { alphaTest: 0.38, translucency: 0.34, leafRoughness: 0.56, bend: 0.3, flutter: 0.026 },
  };
}

export const build: SpeciesBuilder = (spec) => buildPear(spec, true);
