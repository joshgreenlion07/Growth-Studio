import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, leafQuad, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, normalFromHeight, rootFlare, tiled, type LevelDef, type Limb } from './shared-trees-a';

/**
 * Red maple 'Autumn Blaze', Acer x freemanii 'Jeffersred' (red maple x
 * silver maple), shown in summer green.
 *
 * Habit: a strong central leader with ascending branches (about 45 degrees)
 * when young, filling out into a dense upright to broad oval crown, a little
 * taller than wide, limbed up to about head height on a lawn. A 15 gal is an
 * 8 ft whip carrying a narrow head of branches from about 40% of its height.
 * Leaves opposite, simple, 3 to 6 in long and nearly as wide (here 12 cm),
 * five lobes cut about halfway: the middle lobe widens toward its coarsely
 * toothed shoulders, two side lobes at about 47 degrees, two small basal
 * lobes. Upper side medium to dark green and smooth, a little glossy; the
 * underside paler, silvery green (it flashes when the long red petioles let
 * the leaves turn in the wind, and it is what you see from under the crown).
 * Branchlets red to red-brown; bark smooth light silver-gray on young wood,
 * the lower trunk starting to fissure by 15 years.
 *
 * References:
 * - Univ. of Minnesota, trees.umn.edu, Autumn Blaze Freeman's maple:
 *   40-55 ft tall, 30-40 ft wide, fast, upright with ascending branches,
 *   dense oval canopy, five deeply cut lobes, medium green, red petioles.
 *   https://trees.umn.edu/autumn-blaze%C2%AE-freemans-maple-acer-x-freemanii-%E2%80%98jeffersred%E2%80%99
 * - Morton Arboretum, Freeman's maple: 40-60 x 20-40 ft (species), Autumn
 *   Blaze 50-60 x 40-50 ft, rounded to broad oval, strong central leader;
 *   leaves 3-5 in, medium green above, silvery beneath; bark fairly smooth
 *   silver-gray, fissured with age.
 *   https://mortonarb.org/plant-and-protect/trees-and-plants/freemans-maple/
 * - NC State Extension Plant Toolbox, Acer x freemanii: 45-70 x 35-50 ft,
 *   rapid, dense erect oval; leaves 3-6 in, dark green glossy above, paler
 *   below; branchlets red to red-brown; bark smooth silver-gray when young,
 *   light gray. https://plants.ces.ncsu.edu/plants/acer-x-freemanii
 * - Univ. of Illinois woody plants, Autumn Blaze: 50-55 ft, dense
 *   oval-rounded, young branches ascend at about 45 degrees, fast.
 *   https://woodyplants.nres.uiuc.edu/plant/acefrab
 * - Minnesota Wildflowers, Freeman maple: blades 4-6 in, nearly as wide,
 *   middle lobe wider near the tip, sharp irregular teeth, petiole and
 *   underside veins red to reddish green.
 *   https://www.minnesotawildflowers.info/tree/freeman-maple
 * - Devil Mountain Nursery (Clements, San Joaquin Co.): 40-55 x 30-40 ft,
 *   fast, broad oval, Sunset 2-9, 14-23.
 *   https://devilmountainnursery.com/acer-x-freemanii-autumn-blaze/
 * Growth is 2-3 ft a year, so a Modesto yard tree is about 12 m x 9 m
 * (40 x 30 ft) at 15 years, toward 15 m x 12 m eventually.
 */

const LEAF = {
  dark: '#1f4216',
  mid: '#305f22',
  light: '#43762c',
  fresh: '#6f8f3c',
  bronze: '#8a5a34',
  vein: 'rgba(160,190,110,0.32)',
  under: '#506a4f',
  underLight: '#5c765a',
  underVein: 'rgba(170,186,160,0.45)',
  petiole: '#7c3a2e',
  twig: '#6e3a2a',
};

/** Lobes around the petiole joint: axis angle and length (blade length = 1). */
const LOBES = [
  { a: -1.62, len: 0.58 },
  { a: -0.83, len: 0.88 },
  { a: 0, len: 1 },
  { a: 0.83, len: 0.88 },
  { a: 1.62, len: 0.58 },
];
/** Sinus depth (radius from the joint) between neighboring lobes. */
const SINUS = [0.42, 0.5, 0.5, 0.42];
/** One edge of a lobe, base to tip, in lobe lengths: coarse forward-pointing teeth at the shoulder. */
const EDGE: [number, number, number][] = [
  // x, y, tooth (1 = tooth tip whose size varies)
  [0.5, 0.2, 0],
  [0.6, 0.23, 0],
  [0.67, 0.3, 1],
  [0.685, 0.212, 0],
  [0.77, 0.168, 0],
  [0.815, 0.212, 1],
  [0.83, 0.128, 0],
  [0.9, 0.072, 0],
  [1, 0, 0],
];

/** Trace a Freeman maple blade, petiole joint at the origin, middle lobe along +x, `L` px long. */
function bladePath(g: CanvasRenderingContext2D, r: () => number, L: number) {
  const pt = (a: number, x: number, y: number, len: number): [number, number] => {
    const c = Math.cos(a), s = Math.sin(a);
    return [(x * c - y * s) * len * L, (x * s + y * c) * len * L];
  };
  g.beginPath();
  g.moveTo(-0.07 * L, 0);
  LOBES.forEach((lb, i) => {
    const small = lb.len < 0.7;
    const k = () => 0.65 + r() * 0.7;
    // -y side, base to tip.
    const side: [number, number][] = [];
    for (const [x, y, tooth] of EDGE) {
      if (small && x > 0.78 && tooth) continue;
      const yy = tooth ? lerp(EDGE[0][1], y, k()) : y;
      side.push([x, -(small ? yy * 1.15 : yy)]);
    }
    const first = pt(lb.a, side[0][0], side[0][1], lb.len);
    if (i === 0) g.lineTo(first[0], first[1]);
    for (const [x, y] of side) {
      const p = pt(lb.a, x, y, lb.len);
      g.lineTo(p[0], p[1]);
    }
    // +y side, tip back to base.
    for (let j = EDGE.length - 2; j >= 0; j--) {
      const [x, y, tooth] = EDGE[j];
      if (small && x > 0.78 && tooth) continue;
      const yy = tooth ? lerp(EDGE[0][1], y, k()) : y;
      const p = pt(lb.a, x, small ? yy * 1.15 : yy, lb.len);
      g.lineTo(p[0], p[1]);
    }
    if (i < LOBES.length - 1) {
      // A rounded sinus down to the next lobe.
      const nb = LOBES[i + 1];
      const mid = (lb.a + nb.a) / 2, s = SINUS[i] * (0.94 + r() * 0.12);
      const nx = pt(nb.a, EDGE[0][0], -(nb.len < 0.7 ? EDGE[0][1] * 1.15 : EDGE[0][1]), nb.len);
      const sx = Math.cos(mid) * s * L, sy = Math.sin(mid) * s * L;
      g.lineTo(sx, sy);
      g.quadraticCurveTo(lerp(sx, nx[0], 0.15), lerp(sy, nx[1], 0.15), nx[0], nx[1]);
    }
  });
  g.closePath();
}

interface LeafLook {
  /** 0 shaded .. 1 sunlit. */
  shade: number;
  /** New growth at a shoot tip, 0..1. */
  fresh: number;
  /** Seen from below: the pale silvery underside. */
  under: boolean;
}

/** One leaf, petiole joint at (x, y), middle lobe along `rot`, blade `L` px long. */
function freemanLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, L: number, rot: number, o: LeafLook) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  bladePath(g, r, L);
  const grad = g.createRadialGradient(0, 0, L * 0.05, 0, 0, L * 1.05);
  if (o.under) {
    grad.addColorStop(0, LEAF.underLight);
    grad.addColorStop(1, LEAF.under);
  } else {
    grad.addColorStop(0, LEAF.light);
    grad.addColorStop(0.55, LEAF.mid);
    grad.addColorStop(1, LEAF.dark);
  }
  g.fillStyle = grad;
  g.fill();
  if (o.fresh > 0.02 && !o.under) {
    g.globalAlpha = o.fresh * 0.4;
    g.fillStyle = LEAF.fresh;
    g.fill();
    // Very young leaves carry a faint bronze-red flush.
    g.globalAlpha = o.fresh * 0.18;
    g.fillStyle = LEAF.bronze;
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = o.shade < 0.5 ? `rgba(0,0,0,${(0.5 - o.shade) * 0.42})` : `rgba(255,255,230,${(o.shade - 0.5) * 0.1})`;
  g.fill();
  // Palmate main veins to each lobe tip, then side veins toward the teeth.
  g.save();
  g.clip();
  g.strokeStyle = o.under ? LEAF.underVein : LEAF.vein;
  for (const lb of LOBES) {
    const c = Math.cos(lb.a), s = Math.sin(lb.a);
    const len = lb.len * L;
    g.lineWidth = Math.max(0.8, L * (lb.len > 0.7 ? 0.018 : 0.012) * (o.under ? 1.4 : 1));
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(c * len * 0.95, s * len * 0.95);
    g.stroke();
    g.lineWidth = Math.max(0.5, L * 0.007 * (o.under ? 1.4 : 1));
    g.beginPath();
    const pairs = lb.len > 0.7 ? 5 : 2;
    for (let v = 1; v <= pairs; v++) {
      const t = 0.2 + (v / (pairs + 1)) * 0.7;
      for (const sd of [-1, 1]) {
        const bx = c * len * t, by = s * len * t;
        const ex = bx + (c * 0.12 - sd * s * 0.17) * len, ey = by + (s * 0.12 + sd * c * 0.17) * len;
        g.moveTo(bx, by);
        g.lineTo(ex, ey);
      }
    }
    g.stroke();
  }
  g.restore();
  g.restore();
}

/** A petiole from (x0, y0) to the leaf joint (x1, y1), slightly bowed. */
function petiole(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, bow: number) {
  g.strokeStyle = LEAF.petiole;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + bow * (y1 - y0) * 0.15, (y0 + y1) / 2 - bow * (x1 - x0) * 0.15, x1, y1);
  g.stroke();
}

/**
 * 1024 atlas, 2 x 2 cells. Cells 0 and 1: shoot ends (red-brown twig,
 * opposite pairs of leaves on long red petioles, a terminal pair). Cell 2:
 * a shoot seen partly from below (several silvery undersides). Cell 3: four
 * single leaves on petioles, 256 px each: two mature, one young, one
 * underside.
 */
export function paintAutumnBlazeLeaves(g: CanvasRenderingContext2D) {
  const S = 512;
  const r = rng('autumn-blaze-tex');
  g.lineCap = 'round';
  for (let cell = 0; cell < 3; cell++) {
    g.save();
    g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    const nodes = cell === 1 ? 3 : 2;
    const x0 = S / 2, y0 = S, x1 = S / 2 + (r() - 0.5) * S * 0.06, y1 = S * (cell === 1 ? 0.42 : 0.48);
    g.strokeStyle = LEAF.twig;
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(S / 2 + (r() - 0.5) * S * 0.05, (y0 + y1) / 2, x1, y1);
    g.stroke();
    const L = S * 0.2;
    // Lower pairs first so the younger leaves near the tip overlap them.
    for (let n = 0; n <= nodes; n++) {
      const tip = n === nodes;
      const t = tip ? 1 : 0.12 + (n / nodes) * 0.8;
      const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
      for (const s of [-1, 1]) {
        const a = -Math.PI / 2 + s * (tip ? 0.38 + r() * 0.2 : 1.05 + r() * 0.3 - t * 0.25);
        const pl = S * (tip ? 0.08 + r() * 0.03 : 0.12 + r() * 0.04);
        const jx = nx + Math.cos(a) * pl, jy = ny + Math.sin(a) * pl;
        petiole(g, nx, ny, jx, jy, S * 0.0045, s * (r() - 0.3));
        const under = cell === 2 ? r() < 0.55 : r() < 0.08;
        const size = L * (tip ? 0.78 : 0.9 + r() * 0.22);
        freemanLeaf(g, r, jx, jy, size, a + (r() - 0.5) * 0.5, { shade: 0.25 + r() * 0.75, fresh: tip ? 0.5 + r() * 0.3 : t > 0.6 ? r() * 0.25 : 0, under });
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
    const bend = (r() - 0.5) * 0.25;
    const jx = Q / 2 + bend * Q * 0.2, jy = Q * 0.6;
    petiole(g, Q / 2, Q, jx, jy, Q * 0.016, bend * 3);
    freemanLeaf(g, r, jx, jy, Q * 0.42, -Math.PI / 2 + bend, { shade: 0.4 + r() * 0.5, fresh: q === 2 ? 0.8 : 0, under: q === 3 });
    g.restore();
  }
}

function autumnBlazeLeaves(): THREE.Texture {
  return leafTexture('autumn-blaze-leaves', 1024, 1024, (g) => paintAutumnBlazeLeaves(g));
}

/** UV of single leaf q (0..3) in the atlas. */
function singleUV(q: number): [number, number, number, number] {
  const u0 = 0.5 + (q % 2) * 0.25, v1 = 0.5 - Math.floor(q / 2) * 0.25;
  return [u0, v1 - 0.25, u0 + 0.25, v1];
}

/**
 * Smooth light silver-gray bark: faint vertical streaks, pale lenticel
 * flecks and soft greenish-gray patches, with a few shallow fissures that
 * start to break the surface on the lower trunk of an older tree.
 */
function autumnBlazeBark(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const S = 512;
  const fr = rng('autumn-blaze-fissures');
  const fissures: { x: number; y: number; len: number; w: number; dx: number }[] = [];
  for (let i = 0; i < 44; i++) fissures.push({ x: fr() * S, y: fr() * S, len: 60 + fr() * 180, w: 2.2 + fr() * 3.5, dx: (fr() - 0.5) * 16 });
  const map = barkTexture('autumn-blaze-bark', S, (g) => {
    const r = rng('autumn-blaze-bark');
    g.fillStyle = '#5b5247';
    g.fillRect(0, 0, S, S);
    // Soft blotches: greener and lighter patches of the smooth young bark.
    for (let i = 0; i < 60; i++) {
      const x = r() * S, y = r() * S, rx = 10 + r() * 40, ry = rx * (1.2 + r() * 1.6), tone = r();
      tiled(g, S, () => {
        g.globalAlpha = 0.25 + r() * 0.25;
        g.fillStyle = tone < 0.4 ? '#59604f' : tone < 0.75 ? '#6e6a61' : '#47443e';
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    // Fine vertical streaks.
    for (let i = 0; i < 700; i++) {
      const x = r() * S, y = r() * S, len = 10 + r() * 70, dx = (r() - 0.5) * 3, dark = r() < 0.5, a = 0.05 + r() * 0.12, w = 0.6 + r() * 1.6;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = dark ? '#3e3d38' : '#908e85';
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + len);
        g.stroke();
      });
    }
    // Lenticels: short pale horizontal flecks.
    for (let i = 0; i < 140; i++) {
      const x = r() * S, y = r() * S, w = 2 + r() * 6, a = 0.25 + r() * 0.3;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.fillStyle = '#a3a198';
        g.fillRect(x, y, w, 1.3);
      });
    }
    // Shallow fissures.
    for (const f of fissures) {
      tiled(g, S, () => {
        g.globalAlpha = 0.7;
        g.strokeStyle = '#2a2925';
        g.lineWidth = f.w;
        g.beginPath();
        g.moveTo(f.x, f.y);
        g.quadraticCurveTo(f.x + f.dx * 0.8, f.y + f.len * 0.5, f.x + f.dx, f.y + f.len);
        g.stroke();
        g.globalAlpha = 0.25;
        g.strokeStyle = '#8a887f';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(f.x + f.w, f.y + 2);
        g.quadraticCurveTo(f.x + f.w + f.dx * 0.8, f.y + f.len * 0.5, f.x + f.w + f.dx, f.y + f.len - 2);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
  const normalMap = normalFromHeight('autumn-blaze-bark-n', S, 2.2, (g) => {
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, S, S);
    for (const f of fissures) {
      tiled(g, S, () => {
        g.strokeStyle = '#202020';
        g.lineWidth = f.w * 1.6;
        g.beginPath();
        g.moveTo(f.x, f.y);
        g.quadraticCurveTo(f.x + f.dx * 0.8, f.y + f.len * 0.5, f.x + f.dx, f.y + f.len);
        g.stroke();
      });
    }
  });
  return { map, normalMap };
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const crownBase = 0.18;

  // Upright to broad oval: widest a little above half height, a rounded top.
  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.47, baseR: 0.7, pBot: 0.6, pTop: 1.75, lump: 0.04, phase: r() * 6 });
  const r0 = H * 0.016;
  // The central leader runs well up into the crown. It has no random wander,
  // so the two scaffold bands below can each grow from an identical copy.
  const leader = { base: V(0, -0.15, 0), dir: V(0.03, 1, -0.02), length: H * 0.84, r0, r1: r0 * 0.12, segs: 8, gnarl: 0, up: 0.12 };
  const L2: LevelDef = { parents: [0, 1], perMeter: 2.1, from: (l) => (l.level === 0 ? 0.8 : 0.22), to: 0.97, angle: 0.75, angleVar: 0.2, len: 0.55, lenVar: 0.25, lenMin: 1.0, taperAlong: 0.7, radius: 0.55, tip: 0.25, segs: 4, gnarl: 0.3, up: 0.06, out: 0.3, early: 0.95, opposite: true, smooth: false, limit: [0.94, 1], minKeep: 0.4 };
  const L3: LevelDef = { perMeter: 3.0, from: 0.15, to: 0.97, angle: 0.72, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.5, lenMax: 1.6, taperAlong: 0.7, radius: 0.5, tip: 0.3, tipMin: 0.005, segs: 3, gnarl: 0.36, up: 0.12, out: 0.12, early: 0.9, opposite: true, smooth: false, limit: [0.94, 1.01], minKeep: 0.3 };
  const L4: LevelDef = { perMeter: 3.1, from: 0.12, to: 0.97, angle: 0.7, angleVar: 0.25, len: 0.5, lenVar: 0.35, lenMin: 0.22, lenMax: 0.6, taperAlong: 0.75, radius: 0.5, tip: 0.5, tipMin: 0.003, segs: 1, gnarl: 0.2, up: 0.1, early: 0.85, opposite: true, smooth: false, limit: [0.95, 1.03] };
  // Lower scaffolds leave the leader wide (about 60 degrees) and turn up at
  // their ends; upper ones ascend at about 40 degrees.
  const low = growTree(r, [leader], [
    { count: [5, 6], from: 0.21, to: 0.46, angle: 1.08, angleVar: 0.12, len: 0.6, lenVar: 0.12, taperAlong: 0.85, radius: 0.6, tip: 0.2, segs: 6, gnarl: 0.2, up: 0.3, out: 0.2, early: 1, limit: [0.97, 1], minKeep: 0.45 },
    { ...L2, parents: [1] }, L3, L4,
  ], env);
  const high = growTree(r, [leader], [
    { count: [7, 8], from: 0.46, to: 0.92, angle: 0.72, angleVar: 0.15, len: 0.55, lenVar: 0.15, taperAlong: 0.55, radius: 0.56, tip: 0.2, segs: 6, gnarl: 0.22, up: 0.2, out: 0.2, early: 1, limit: [0.97, 1], minKeep: 0.45 },
    L2, L3, L4,
  ], env);
  // One leader: drop the second copy and re-point its children.
  const all: Limb[] = [...low, ...high.slice(1).map((l) => ({ ...l, parent: l.parent <= 0 ? 0 : l.parent - 1 + low.length }))];
  // The tree is limbed up: no shoots hanging below the crown base.
  const limbs: Limb[] = [];
  const remap = new Map<number, number>();
  all.forEach((l, i) => {
    if (l.level > 0 && !remap.has(l.parent)) return;
    if (l.level >= 2 && l.pts[l.pts.length - 1].y < H * crownBase * 0.85) return;
    remap.set(i, limbs.length);
    limbs.push({ ...l, parent: l.level > 0 ? remap.get(l.parent)! : -1 });
  });
  rootFlare(limbs[0], 0.32, r0 * 1.1);

  // A 15 gal whip carries its head from about 40% of its height; the lower
  // scaffolds of the mature crown come later, as the crown base drops from
  // about 40% to 20% of the height.
  limbs.forEach((l: Limb) => {
    if (l.level === 1) {
      const h = l.pts[0].y / H;
      if (h < 0.4) l.birth = Math.max(l.birth, lerp(0.55, 0.2, clamp((h - crownBase) / (0.4 - crownBase))));
    }
    if (l.parent >= 0) l.birth = Math.max(l.birth, limbs[l.parent].birth);
  });

  const center = V(0, H * lerp(crownBase, 1, 0.45), 0), radii = V(R, H * (1 - crownBase) * 0.56, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#7a9468'), tOuter: col('#ffffff'), tNew: col('#f2f6d0') });
  const barkCol = col('#ffffff'), youngCol = col('#c9b2a6'), twigCol = col('#b0725e');
  // The finest twigs are painted into the leaf sprays; only the longer ones get wood.
  emitWood(wood, limbs.filter((l) => l.level < 4 || l.length > 0.4), {
    tile: 0.6,
    sway: T.sway,
    color: (l) => (l.level >= 4 ? twigCol : l.level === 3 ? youngCol : barkCol),
    sides: (l) => (l.level >= 3 ? 3 : l.level === 2 ? 5 : l.level === 1 ? 9 : 16),
  });

  /** Share of leaves that show their silvery underside: more low in the crown, where you look up at them. */
  const underShare = (at: THREE.Vector3) => lerp(0.18, 0.07, clamp((at.y - H * crownBase) / (H * (1 - crownBase))));
  /** A shoot end: twig with opposite pairs of leaves. */
  const shoot = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const cell = r() < underShare(at) * 0.8 ? 2 : r() < 0.5 ? 1 : 0;
    leafQuad(leaves, at, dir, T.face(at, 0.4, 0.85), size, size, uvCell(2, 2, cell), T.tint(at, tipness), T.birth(birth, at), at, { segs: 2, curl: 0.25 + r() * 0.5, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.14) });
  };
  /** One leaf on its long petiole, hanging out and a little down. */
  const leaf = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const size = 0.25 + r() * 0.06;
    const q = r() < underShare(at) ? 3 : tipness > 0.85 && r() < 0.4 ? 2 : r() < 0.5 ? 0 : 1;
    leafQuad(leaves, at, dir, T.face(at, 0.5, 1.3), size, size, singleUV(q), T.tint(at, tipness), T.birth(birth, at), at, { segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.12) });
  };

  for (const l of limbs) {
    if (l.level < 2) continue;
    const twig = l.level === 4;
    const from = twig ? 0.2 : l.level === 3 ? 0.35 : 0.6;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / (twig ? 0.11 : l.level === 3 ? 0.18 : 0.26)));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (at.p.y < H * crownBase * 0.85) continue;
      // The shaded inside of the crown is mostly bare wood.
      if (T.depth(at.p) < 0.22 + r() * 0.22) continue;
      const sgn = i % 2 ? 1 : -1;
      shoot(at.p, T.side(at.dir, sgn, 0.6, (r() - 0.6) * 0.5), l.birth, t * (twig ? 1 : 0.5), 0.5 + r() * 0.12);
      leaf(at.p, T.side(at.dir, -sgn, 0.4, (r() - 0.75) * 0.7), l.birth, t);
      if (r() < 0.3) leaf(at.p, T.side(at.dir, sgn, 0.2, (r() - 0.8) * 0.7), l.birth, t);
    }
    if (l.level < 3) continue;
    const end = limbAt(l, 1);
    const back = limbAt(l, twig ? 0.55 : 0.9);
    shoot(back.p, end.dir.clone().add(V(0, -0.08, 0)).normalize(), l.birth, 1, 0.54 + r() * 0.1);
    for (let i = 0; i < 3; i++) leaf(end.p, T.side(end.dir, i % 2 ? 1 : -1, 0.3 + r() * 0.9, (r() - 0.6) * 0.6), l.birth, 1);
  }

  fitBuilders([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: autumnBlazeLeaves(),
    bark: autumnBlazeBark(),
    look: { alphaTest: 0.35, translucency: 0.4, leafRoughness: 0.72, bend: 0.32, flutter: 0.034 },
  };
};
