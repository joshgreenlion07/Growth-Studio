import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, leafQuad, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, normalFromHeight, rootFlare, tiled } from './shared-trees-a';
import { cssMix } from './shared-conifers';

/**
 * Ginkgo, Ginkgo biloba 'Princeton Sentry': the narrow, upright male (fruitless) selection. One strong central leader
 * with fairly straight side limbs climbing at a steep angle, so the crown is a tall, narrow pyramid that tapers to a
 * point. Ginkgo carries most of its leaves on short spur shoots along two-year and older wood: tufts of three to five
 * fan-shaped leaves on long stalks, evenly spaced along otherwise bare-looking branches, which gives the tree its
 * clumped, airy texture. New long shoots at the branch ends carry single, deeply notched leaves. Leaves 2 to 3 in
 * across, bright emerald green in summer (they turn butter yellow in fall), with fine forking veins that run out to the
 * wavy outer edge. Bark gray-brown, rough and ridged with age.
 *
 * Why 'Princeton Sentry': the tree on the customer job's plan stands in a side yard about 10 ft wide, with a canopy drawn
 * about 12 ft across, and the designer's renders show a narrow upright crown beside the house. A broad cultivar such
 * as 'Autumn Gold' (45 to 50 ft x 30 to 35 ft) would not fit there; 'Princeton Sentry' is the common narrow male sold
 * in California.
 *
 * References (numbers they give):
 *  - NC State Extension Plant Toolbox, Ginkgo biloba (plants.ces.ncsu.edu/plants/ginkgo-biloba): 50 to 80 ft x 30 to
 *    40 ft for the species, medium growth; leaves fan-shaped, two-lobed, 2 to 3 in, alternate on long shoots and in
 *    clusters of three to five on spurs; emerald green, golden yellow in fall; bark gray-brown, ridged and furrowed.
 *  - University of Florida IFAS fact sheet ST-278, 'Princeton Sentry': 50 to 65 ft tall, 15 to 20 ft spread.
 *  - Morton Arboretum, ginkgo: 'Princeton Sentry' is a nonfruiting male, upright and nearly columnar, narrowing to a
 *    point.
 *  - Plant Me Green (nursery), 'Princeton Sentry': 40 to 60 ft x 10 to 15 ft.
 * Catalog size: 40 ft x 17 ft (12 x 5.2 m), the low end of the heights and the middle of the spreads, as a ginkgo
 * grows slowly in a Central Valley yard. An existing tree is placed with `existing: true` and `scale` (0.62 gives
 * about 24 x 11 ft, the size of the tree in that side yard).
 */

const LEAF = { dark: '#1f4217', mid: '#30621c', light: '#447824', edge: '#588c30', vein: 'rgba(170,205,110,0.4)', stalk: '#7a9446' };

/**
 * One fan-shaped leaf, stalk base at (x, y), heading `ang` (canvas radians). `stalk` is the petiole length and `w` the
 * blade's width across, in px; `notch` 0..1 how deep the cleft in the middle of the outer edge is.
 */
function fan(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, stalk: number, w: number, notch: number, tone: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  // Stalk along +x.
  g.strokeStyle = cssMix(LEAF.stalk, LEAF.mid, 0.3, tone);
  g.lineWidth = Math.max(1.4, w * 0.022);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(stalk * 0.5, (r() - 0.5) * stalk * 0.12, stalk, 0);
  g.stroke();
  g.translate(stalk * 0.96, 0);
  // The blade: a wedge opening about 120 degrees from the stalk tip, its outer edge an arc that is wavy and cleft.
  const spread = 0.95 + r() * 0.25, rad = w * 0.62;
  const N = 28;
  const edge: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = -spread + 2 * spread * t;
    const cleft = notch * Math.exp(-Math.pow((t - 0.5) / 0.035, 2)) * 0.55;
    const wave = 0.035 * Math.sin(t * Math.PI * 7 + r() * 0.6) + (r() - 0.5) * 0.02;
    const rr = rad * (1 - cleft + wave) * (0.94 + 0.06 * Math.cos((t - 0.5) * Math.PI));
    edge.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  g.beginPath();
  g.moveTo(0, -w * 0.02);
  // The sides run nearly straight, a little concave, from the stalk to the edge.
  g.quadraticCurveTo(edge[0][0] * 0.45, edge[0][1] * 0.3, edge[0][0], edge[0][1]);
  for (let i = 1; i <= N; i++) g.lineTo(edge[i][0], edge[i][1]);
  g.quadraticCurveTo(edge[N][0] * 0.45, edge[N][1] * 0.3, 0, w * 0.02);
  g.closePath();
  const grad = g.createRadialGradient(0, 0, rad * 0.05, 0, 0, rad);
  grad.addColorStop(0, cssMix(LEAF.dark, LEAF.mid, 0.5, tone));
  grad.addColorStop(0.55, cssMix(LEAF.mid, LEAF.light, 0.35, tone));
  grad.addColorStop(1, cssMix(LEAF.light, LEAF.edge, 0.4, tone));
  g.fillStyle = grad;
  g.fill();
  // Light and shade across the blade (it is gently cupped).
  const sh = r();
  g.fillStyle = sh < 0.5 ? `rgba(0,0,0,${(0.5 - sh) * 0.3})` : `rgba(255,255,210,${(sh - 0.5) * 0.14})`;
  g.fill();
  // Fine forking veins running out to the edge.
  g.save();
  g.clip();
  g.strokeStyle = LEAF.vein;
  g.lineWidth = Math.max(0.6, w * 0.008);
  for (let k = 0; k < 18; k++) {
    const a = -spread * 0.98 + (2 * spread * 0.98 * (k + 0.5)) / 18;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * rad * 1.05, Math.sin(a) * rad * 1.05);
    g.stroke();
  }
  g.restore();
  g.restore();
}

/**
 * 1024 atlas, 2 x 2 cells of 512. A cell is one card about 0.22 m long (a fan 2.5 in wide is 140 px).
 * Cells 0 to 2: spur tufts of three, four and five leaves fanned up and out from a spur at the bottom middle. Cell 3:
 * two single long-shoot leaves, deeply notched, each 256 x 512.
 */
function ginkgoLeaves(): THREE.Texture {
  return leafTexture('ginkgo-princeton-sentry-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('ginkgo-tex');
    const up = -Math.PI / 2;
    for (let cell = 0; cell < 3; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(3, 3, S - 6, S - 6);
      g.clip();
      const n = 3 + cell;
      const x0 = S / 2, y0 = S - 10;
      // The spur: a short knobby stub.
      g.fillStyle = '#7d7568';
      g.beginPath();
      g.ellipse(x0, y0 - 4, 7, 10, 0, 0, Math.PI * 2);
      g.fill();
      const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
      for (const i of order) {
        const a = up + lerp(-1.05, 1.05, n === 1 ? 0.5 : i / (n - 1)) + (r() - 0.5) * 0.25;
        const st = S * (0.17 + r() * 0.1);
        fan(g, r, x0, y0 - 6, a, st, S * (0.27 + r() * 0.06), r() < 0.3 ? 0.25 + r() * 0.3 : r() * 0.12, 0.8 + r() * 0.35);
      }
      g.restore();
    }
    for (let q = 0; q < 2; q++) {
      g.save();
      g.translate(S + q * 256, S);
      g.beginPath();
      g.rect(3, 3, 250, S - 6);
      g.clip();
      fan(g, r, 128, S - 8, up + (r() - 0.5) * 0.1, S * 0.32, 226, 0.75 + r() * 0.2, q ? 0.9 : 1.05);
      g.restore();
    }
  });
}

/** Gray-brown bark, rough with irregular, interlacing corky ridges and darker fissures. */
function ginkgoBark(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const S = 512;
  const r = rng('ginkgo-bark');
  const lines: { x: number; a: number; k: number; ph: number; w: number }[] = [];
  for (let i = 0; i < 22; i++) lines.push({ x: (i / 22) * S + (r() - 0.5) * 14, a: 6 + r() * 10, k: 1 + Math.floor(r() * 3), ph: r() * 6.28, w: 2 + r() * 4 });
  const fissure = (g: CanvasRenderingContext2D, L: (typeof lines)[number]) => {
    g.beginPath();
    for (let i = 0; i <= 32; i++) {
      const y = (i / 32) * S;
      const x = L.x + L.a * Math.sin((y / S) * Math.PI * 2 * L.k + L.ph);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  const map = barkTexture('ginkgo-bark', S, (g) => {
    g.fillStyle = '#4b453c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, w = 4 + r() * 16, h = 10 + r() * 40;
      const c = r() < 0.5 ? '#5a5348' : r() < 0.5 ? '#3e3831' : '#655d52';
      tiled(g, S, () => {
        g.globalAlpha = 0.35;
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
      });
    }
    g.globalAlpha = 1;
    for (const L of lines) {
      tiled(g, S, () => {
        fissure(g, L);
        g.strokeStyle = '#2c2721';
        g.lineWidth = L.w;
        g.stroke();
        g.strokeStyle = 'rgba(160,150,135,0.35)';
        g.lineWidth = 1;
        g.translate(L.w * 0.7, 0);
        fissure(g, L);
        g.stroke();
      });
    }
  });
  const normalMap = normalFromHeight('ginkgo-bark-n', S, 2.2, (g) => {
    g.fillStyle = '#bbb';
    g.fillRect(0, 0, S, S);
    for (const L of lines) {
      tiled(g, S, () => {
        fissure(g, L);
        g.strokeStyle = '#000';
        g.lineWidth = L.w * 1.4;
        g.stroke();
        g.strokeStyle = '#555';
        g.lineWidth = L.w * 2.6;
        g.globalAlpha = 0.4;
        g.stroke();
        g.globalAlpha = 1;
      });
    }
  });
  return { map, normalMap };
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const crownBase = 0.12;
  // A narrow pyramid: widest a third of the way up, tapering almost straight to the point.
  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.34, baseR: 0.78, topR: 0.05, pBot: 0.6, pTop: 1.25, lump: 0.08, phase: r() * 6 });
  const r0 = H * 0.016;
  const limbs = growTree(
    r,
    [{ base: V(0, -0.15, 0), dir: V(0.01, 1, 0.015), length: H * 0.97, r0, r1: r0 * 0.07, segs: 9, gnarl: 0.03, up: 0.1 }],
    [
      // Side limbs off the leader in loose tiers, climbing steeply, shorter toward the top.
      { perMeter: 3.6, from: 0.1, to: 0.96, angle: 0.68, angleVar: 0.14, len: 0.4, lenVar: 0.22, taperAlong: 0.22, radius: 0.36, tip: 0.22, segs: 5, gnarl: 0.12, up: 0.16, out: 0.18, early: 0.92, limit: [0.95, 1.02], minKeep: 0.35 },
      // Secondary limbs, also upright.
      { perMeter: 2.6, from: 0.15, to: 0.95, angle: 0.55, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.4, lenMax: 2.2, taperAlong: 0.7, radius: 0.55, tip: 0.3, tipMin: 0.006, segs: 3, gnarl: 0.2, up: 0.12, out: 0.25, early: 0.88, limit: [0.94, 1.02], minKeep: 0.35 },
      // This year's long shoots.
      { perMeter: 3, from: 0.3, to: 0.97, angle: 0.5, angleVar: 0.2, len: 0.42, lenVar: 0.35, lenMin: 0.18, lenMax: 0.6, taperAlong: 0.8, radius: 0.55, tip: 0.55, tipMin: 0.003, segs: 1, gnarl: 0.15, up: 0.1, early: 0.85, smooth: false, limit: [0.95, 1.04] },
    ],
    env,
  );
  rootFlare(limbs[0], 0.45, r0 * 1.6);

  const center = V(0, H * lerp(crownBase, 1, 0.38), 0), radii = V(R, H * (1 - crownBase) * 0.62, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#74806a'), tOuter: col('#ffffff'), tNew: col('#f2f8c8') });
  const barkCol = col('#d6cec4'), limbCol = col('#a49c90'), shootCol = col('#8c8670');
  emitWood(wood, limbs, {
    tile: 0.5,
    sway: T.sway,
    color: (l) => (l.level >= 3 ? shootCol : l.level === 2 ? limbCol : barkCol),
    sides: (l) => (l.level >= 3 ? 3 : l.level === 2 ? 4 : l.level === 1 ? 6 : 14),
  });

  const SPUR = [uvCell(2, 2, 0), uvCell(2, 2, 1), uvCell(2, 2, 2)];
  const SINGLE: [number, number, number, number][] = [[0.5, 0, 0.75, 0.5], [0.75, 0, 1, 0.5]];
  /** A spur tuft: the card starts at the spur and fans up and out from the branch. */
  const tuft = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const len = 0.3 + r() * 0.07;
    leafQuad(leaves, at, dir, T.face(at, 0.55, 0.9), len, len, SPUR[Math.floor(r() * 3)], T.tint(at, tipness), T.birth(birth, at, 0.88), at, {
      segs: 2, curl: 0.2 + r() * 0.5, center, radii, normalBend: 0.45, sway0: s, sway1: clamp(s + 0.12),
    });
  };
  const single = (at: THREE.Vector3, dir: THREE.Vector3, birth: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const len = 0.17 + r() * 0.03;
    leafQuad(leaves, at, dir, T.face(at, 0.5, 1.1), len, len * 0.5, SINGLE[Math.floor(r() * 2)], T.tint(at, 1), T.birth(birth, at, 0.8), at, {
      segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.1),
    });
  };

  for (const l of limbs) {
    if (l.level < 1) continue;
    if (l.level === 3) {
      // Long shoots: single leaves, alternate, and a tuft at the tip.
      const n = Math.max(1, Math.round(l.length / 0.055));
      for (let i = 0; i < n; i++) {
        const at = limbAt(l, lerp(0.15, 0.95, (i + r() * 0.5) / n));
        single(at.p, T.side(at.dir, i % 2 ? 1 : -1, 0.55, 0.15 + (r() - 0.5) * 0.4), l.birth);
      }
      const e = limbAt(l, 1);
      tuft(e.p, e.dir, l.birth, 1);
      continue;
    }
    // Spurs along the older wood, every 6 to 10 cm, on all sides of the limb; none on the inner part of big limbs.
    const from = l.level === 1 ? 0.15 : 0.05;
    const step = l.level === 1 ? 0.06 : 0.034;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / step));
    let az = r() * 6.28;
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.98, (i + r() * 0.6) / n);
      const at = limbAt(l, t);
      if (T.depth(at.p) < 0.1 + r() * 0.2) continue;
      az += 2.4 + (r() - 0.5) * 0.6;
      const side = T.side(at.dir, Math.cos(az) > 0 ? 1 : -1, 0.35, 0.45 + Math.sin(az) * 0.4);
      tuft(at.p, side, l.birth, t * 0.4);
    }
    const e = limbAt(l, 1);
    tuft(e.p, e.dir.clone().add(V(0, 0.2, 0)).normalize(), l.birth, 0.8);
  }

  fitBuilders([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: ginkgoLeaves(),
    bark: ginkgoBark(),
    look: { alphaTest: 0.4, translucency: 0.3, leafRoughness: 0.66, bend: 0.3, flutter: 0.03 },
  };
};
