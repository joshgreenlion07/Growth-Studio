import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, canopyDepth, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, crownEnvelope, emitWood, fitBuilders, growTree, limbAt, rootFlare, tiled, type Limb } from './shared-trees-a';
import { palmateLeaf, type PalmateColors } from './shared-maples';

/**
 * Coral bark Japanese maple, Acer palmatum 'Sango-kaku', shown in summer.
 *
 * Habit: vigorous and upright when young, a few ascending stems from a short
 * trunk making a vase that rounds off at the top with age; finer, more
 * upright branching than the species and less layered. Its signature is the
 * color of the young wood: twigs and stems up to a few years old are coral
 * pink-red (brightest in winter, still clearly coral-red in summer), the
 * older trunk and the bases of the main stems gray-green to light gray.
 * Leaves small, about 2 to 3 in across, five to seven narrow, pointed,
 * toothed lobes, light green with a yellow tint in summer, unfolding
 * pinkish-yellow with red edges at the shoot tips; petioles crimson.
 *
 * References:
 * - NC State Extension Plant Toolbox, 'Sangokaku': 20-25 ft x 15-20 ft,
 *   slow to moderate, rounded multi-trunk; 7 narrow pointed lobes, light
 *   green-yellow in spring and summer; crimson petioles; red stems, light
 *   gray bark on older trunks. https://plants.ces.ncsu.edu/plants/acer-palmatum-sangokaku/
 * - RHS, 'Sango-kaku': 4-8 m x 2.5-4 m in 10-20 years; small five-lobed
 *   coarsely toothed leaves, pinkish-yellow opening, green in summer; young
 *   branches coral-red. https://www.rhs.org.uk/plants/56417/acer-palmatum-sango-kaku-(p)/details
 * - Monrovia, Coral Bark Japanese Maple: 15-25 ft x 15-20 ft eventually,
 *   moderate; pale green deeply cut leaves with red margins; young branches
 *   brilliant coral-red. https://www.monrovia.com/coral-bark-japanese-maple.html
 * In the Modesto heat (afternoon shade, slower growth) a 15 gal (about
 * 6 ft) reaches about 5 m x 3.6 m (16 x 12 ft) in 12 years.
 */

const LEAF: PalmateColors = {
  dark: '#5a8a2a',
  mid: '#77a536',
  light: '#97bf45',
  fresh: '#c8d256',
  edge: '#c2504a',
  vein: 'rgba(214,232,150,0.45)',
};
const PETIOLE = '#b23a3c';
const TWIG = '#c4553f';

/**
 * 1024 atlas, 2 x 2 cells. Cells 0 to 2: upright shoot ends (coral twig,
 * opposite leaf pairs on crimson petioles, the tip pair young and
 * yellow with red edges). Cell 3: four single leaves, 256 px each.
 */
export function paintCoralBarkLeaves(g: CanvasRenderingContext2D) {
  const S = 512;
  const r = rng('coral-bark-tex');
  g.lineCap = 'round';
  for (let cell = 0; cell < 3; cell++) {
    g.save();
    g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    const nodes = cell === 2 ? 2 : 3;
    const x0 = S / 2, y0 = S, x1 = S / 2 + (r() - 0.5) * S * 0.06, y1 = S * (cell === 2 ? 0.42 : 0.3);
    g.strokeStyle = TWIG;
    g.lineWidth = S * 0.011;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(S / 2 + (r() - 0.5) * S * 0.05, (y0 + y1) / 2, x1, y1);
    g.stroke();
    const leaf = S * 0.2;
    for (let n = 0; n <= nodes; n++) {
      const tip = n === nodes;
      const t = tip ? 1 : 0.1 + (n / nodes) * 0.82;
      const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
      for (const s of [-1, 1]) {
        const a = -Math.PI / 2 + s * (tip ? 0.4 + r() * 0.2 : 0.95 + r() * 0.3 - t * 0.2);
        const pl = S * (tip ? 0.035 + r() * 0.02 : 0.07 + r() * 0.035);
        const lx = nx + Math.cos(a) * pl, ly = ny + Math.sin(a) * pl;
        g.strokeStyle = PETIOLE;
        g.lineWidth = S * 0.005;
        g.beginPath();
        g.moveTo(nx, ny);
        g.lineTo(lx, ly);
        g.stroke();
        palmateLeaf(g, r, lx, ly, leaf * (tip ? 0.75 : 0.88 + r() * 0.22), a + (r() - 0.5) * 0.4, LEAF, { lobes: 7, width: 0.2, cut: 0.66, teeth: 0.13, shade: 0.3 + r() * 0.7, fresh: tip ? 0.6 + r() * 0.3 : t > 0.6 ? r() * 0.3 : 0 });
      }
    }
    g.restore();
  }
  for (let q = 0; q < 4; q++) {
    const Q = 256;
    g.save();
    g.translate(S + (q % 2) * Q, S + Math.floor(q / 2) * Q);
    g.beginPath();
    g.rect(0, 0, Q, Q);
    g.clip();
    const bend = (r() - 0.5) * 0.3;
    const jx = Q / 2 + bend * Q * 0.2, jy = Q * 0.7;
    g.strokeStyle = PETIOLE;
    g.lineWidth = Q * 0.014;
    g.beginPath();
    g.moveTo(Q / 2, Q);
    g.lineTo(jx, jy);
    g.stroke();
    palmateLeaf(g, r, jx, jy, Q * 0.4, -Math.PI / 2 + bend, LEAF, { lobes: q === 1 ? 5 : 7, width: 0.2, cut: 0.66, teeth: 0.13, shade: 0.4 + r() * 0.55, fresh: q === 3 ? 0.75 : q === 2 ? 0.25 : 0 });
    g.restore();
  }
}

function coralBarkLeaves(): THREE.Texture {
  return leafTexture('coral-bark-leaves', 1024, 1024, (g) => paintCoralBarkLeaves(g));
}

/** UV of single leaf q (0..3) in the atlas. */
function singleUV(q: number): [number, number, number, number] {
  const u0 = 0.5 + (q % 2) * 0.25, v1 = 0.5 - Math.floor(q / 2) * 0.25;
  return [u0, v1 - 0.25, u0 + 0.25, v1];
}

/** Smooth, light, nearly neutral bark with faint streaks; vertex color turns it gray on old wood and coral on young wood. */
function coralBark(): THREE.Texture {
  return barkTexture('coral-bark-bark', 256, (g, S) => {
    const r = rng('coral-bark-bark');
    g.fillStyle = '#a8a39b';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      const x = r() * S, y = r() * S, len = 14 + r() * 80, dx = (r() - 0.5) * 4, dark = r() < 0.55, a = 0.06 + r() * 0.14, w = 0.6 + r() * 2;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = dark ? '#6c675f' : '#d2cec6';
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + len);
        g.stroke();
      });
    }
    // Pale lenticels.
    for (let i = 0; i < 80; i++) {
      const x = r() * S, y = r() * S, w = 2 + r() * 5;
      tiled(g, S, () => {
        g.globalAlpha = 0.35;
        g.fillStyle = '#e4e0d6';
        g.fillRect(x, y, w, 1.2);
      });
    }
    g.globalAlpha = 1;
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const crownBase = 0.16;

  // A vase: narrow low down, widest high up, rounded top.
  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.7, baseR: 0.4, pBot: 0.9, pTop: 2.1, lump: 0.06, phase: r() * 6 });
  const r0 = H * 0.017;
  const sc = H / 4.5;
  const limbs = growTree(
    r,
    [{ base: V(0, -0.12, 0), dir: V(0.04, 1, -0.03), length: H * 0.8, r0, r1: r0 * 0.15, segs: 7, gnarl: 0.18, up: 0.15 }],
    [
      // Upright co-dominant stems from a short trunk.
      { count: [4, 5], from: 0.1, to: 0.3, angle: 0.4, angleVar: 0.1, len: 0.9, lenVar: 0.1, taperAlong: 1, radius: 0.72, tip: 0.18, segs: 6, gnarl: 0.22, up: 0.24, out: 0.12, early: 1, limit: [0.97, 1], minKeep: 0.6 },
      // Ascending branches.
      { parents: [0, 1], perMeter: 2.6 / sc, from: (l) => (l.level === 0 ? 0.4 : 0.25), to: 0.97, angle: 0.62, angleVar: 0.2, len: 0.6, lenVar: 0.25, lenMin: 0.5 * sc, taperAlong: 0.7, radius: 0.5, tip: 0.22, segs: 5, gnarl: 0.3, up: 0.16, flatten: 0.12, out: 0.25, early: 0.96, limit: [0.94, 1], minKeep: 0.45 },
      { perMeter: 5 / sc, from: 0.14, to: 0.97, angle: 0.62, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.25 * sc, lenMax: 0.8 * sc, taperAlong: 0.7, radius: 0.5, tip: 0.3, tipMin: 0.003, segs: 3, gnarl: 0.34, up: 0.14, flatten: 0.1, out: 0.1, early: 0.92, opposite: true, smooth: false, limit: [0.94, 1.01], minKeep: 0.35 },
      { perMeter: 7.5 / sc, from: 0.12, to: 0.97, angle: 0.55, angleVar: 0.2, len: 0.5, lenVar: 0.35, lenMin: 0.1 * sc, lenMax: 0.32 * sc, taperAlong: 0.7, radius: 0.5, tip: 0.5, tipMin: 0.0016, segs: 1, gnarl: 0.2, up: 0.12, early: 0.88, opposite: true, smooth: false, limit: [0.95, 1.03] },
    ],
    env,
  );
  rootFlare(limbs[0], 0.4, r0 * 1.4);

  const center = V(0, H * lerp(crownBase, 1, 0.5), 0), radii = V(R, H * (1 - crownBase) * 0.55, R);
  const sway = (q: THREE.Vector3) => clamp(Math.pow(Math.max(0, q.y) / H, 1.6) * 0.7 + (Math.hypot(q.x, q.z) / R) * 0.3);
  // Old wood gray-green, young wood coral: the trunk and the lower parts of
  // the main stems are gray, turning coral up the stems; branches and twigs coral.
  const gray = col('#d6d8cc'), oldCoral = col('#e8a08c'), coral = col('#ff9a7e'), twig = col('#ffa184');
  emitWood(wood, limbs, {
    tile: 0.42,
    sway,
    color: (l: Limb, t: number) => {
      if (l.level === 0) return gray.clone().lerp(oldCoral, smoothY(t, 0.55, 1));
      if (l.level === 1) return gray.clone().lerp(oldCoral, smoothY(t, 0.15, 0.6)).lerp(coral, smoothY(t, 0.6, 1));
      if (l.level === 2) return oldCoral.clone().lerp(coral, t);
      return twig;
    },
    sides: (l) => (l.level >= 4 ? 3 : l.level === 3 ? 4 : l.level === 2 ? 6 : l.level === 1 ? 8 : 12),
  });

  const tInner = col('#93a07e'), tOuter = col('#ffffff'), tNew = col('#fff4cc');
  const leafSize = 0.065;
  const k = Math.sqrt((leafSize / 0.08) * sc);
  const tint = (at: THREE.Vector3, tipness: number) => {
    const depth = canopyDepth(at, center, radii);
    const shade = lerp(0.55, 1, Math.pow(depth, 1.6)) * lerp(0.82, 1, clamp((at.y - H * crownBase) / (H * 0.5)));
    return jitter(tInner.clone().lerp(tOuter, Math.pow(depth, 1.3)).lerp(tNew, tipness * depth * r() * 0.8), r, 0.012, 0.05, 0.05).multiplyScalar(shade);
  };
  const outward = (at: THREE.Vector3) => V(at.x, (at.y - center.y) * 0.6, at.z).normalize();
  const leafBirth = (b: number, at: THREE.Vector3) => clamp(b + (r() < 0.84 ? 0 : 0.1 + r() * 0.5 * canopyDepth(at, center, radii)), 0, 0.9);
  const spray = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const face = UP.clone().addScaledVector(outward(at), 0.45).add(V((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)).normalize();
    const s = sway(at) * WOOD_BEND;
    leafQuad(leaves, at, dir, face, size, size * 0.98, uvCell(2, 2, Math.floor(r() * 3)), tint(at, tipness), leafBirth(birth, at), at, { segs: 2, curl: 0.15 + r() * 0.45, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.12) });
  };
  const single = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const face = UP.clone().addScaledVector(outward(at), 0.5).add(V((r() - 0.5) * 1.1, 0, (r() - 0.5) * 1.1)).normalize();
    const s = sway(at) * WOOD_BEND;
    const size = leafSize * 2.3 * (0.8 + r() * 0.4);
    const q = tipness > 0.8 && r() < 0.5 ? 3 : Math.floor(r() * 3);
    leafQuad(leaves, at, dir, face, size, size, singleUV(q), tint(at, tipness), leafBirth(birth, at), at, { segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.1) });
  };
  const side = (d: THREE.Vector3, sgn: number, fwd: number, drop: number) => {
    const lat = V().crossVectors(d, UP);
    if (lat.lengthSq() < 0.01) lat.set(1, 0, 0);
    lat.normalize().multiplyScalar(sgn);
    return d.clone().multiplyScalar(fwd).addScaledVector(lat, 0.85).add(V(0, drop, 0)).normalize();
  };

  for (const l of limbs) {
    if (l.level < 2) continue;
    const twigL = l.level === 4;
    const from = twigL ? 0.12 : l.level === 3 ? 0.3 : 0.55;
    const gap = (twigL ? 0.06 : l.level === 3 ? 0.082 : 0.13) * k;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / gap));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (canopyDepth(at.p, center, radii) < 0.25 + r() * 0.25) continue;
      const sgn = i % 2 ? 1 : -1;
      // Shoots held up and out more than on the layered maples.
      spray(at.p, side(at.dir, sgn, 0.75, (r() - 0.5) * 0.4), l.birth, t * (twigL ? 1 : 0.5), (0.34 + r() * 0.1) * k);
      if (r() < 0.45) single(at.p, side(at.dir, -sgn, 0.4, (r() - 0.7) * 0.6), l.birth, t);
    }
    if (l.level >= 3) {
      const end = limbAt(l, 1);
      const back = limbAt(l, twigL ? 0.6 : 0.9);
      spray(back.p, end.dir.clone().add(V(0, 0.05, 0)).normalize(), l.birth, 1, (0.36 + r() * 0.06) * k);
      for (const sgn of [-1, 1]) single(end.p, side(end.dir, sgn, 0.9, -0.15 * r()), l.birth, 1);
    }
  }

  fitBuilders([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: coralBarkLeaves(),
    bark: { map: coralBark() },
    look: { translucency: 0.48, leafRoughness: 0.76, bend: 0.3, flutter: 0.03 },
  };
};

/** 0 below a, 1 above b, smooth between (for color along a limb). */
function smoothY(t: number, a: number, b: number) {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}
