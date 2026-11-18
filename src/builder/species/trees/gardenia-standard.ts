import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha, tone } from '../shrubs/shared-shrubs-b';
import { bloom, leafFace, paintGlossLeaf, type GlossLeaf } from '../shrubs/shared-glossy';
import { WOOD_BEND, fitBuilders, limbAt, type Limb } from './shared-trees-a';
import { citrusBark, growHead, headWood, trunkWood, type Head } from './shared-standards';

/**
 * Gardenia jasminoides 'Veitchii' (everblooming gardenia) trained as a
 * standard ("patio tree", "tree form"): the common shrub grown on one clean,
 * staked gray-brown trunk under an open, rounded head. Leaves glossy deep
 * green, elliptic with a pointed tip, about 2 to 3 in, in opposite
 * pairs or whorls of three, held up and out at the shoot ends, with sunken
 * veins. Most outer shoots end in a tuft of bright lime to yellow-green young
 * leaves folded up around the bud, the look of the plant in the job photos
 * (new growth, yellowed further by cold soil and the lime of new concrete).
 * Shown in bloom, its in-season look: fully double, creamy white flowers
 * about 2 in across at a share of the shoot tips above the last whorl, a few
 * aging ivory-yellow, with pale green spiral buds.
 *
 * References:
 *  - Sunset, "Patio trees are best-sellers in Western nurseries"
 *    (https://sunset.com/?p=5074): Gardenia jasminoides 'August Beauty',
 *    'Mystery' and 'Veitchii' are sold as standards in Western nurseries.
 *  - Monrovia, Everblooming Gardenia (Grafted), shown as a potted patio
 *    standard (https://www.monrovia.com/plant-catalog/plants/1302/everblooming-gardenia-grafted/):
 *    4 to 5 ft tall, 3 ft wide; glossy evergreen leaves; fragrant white
 *    flowers spring through summer; moderate growth; zones 8 to 11.
 *  - Meadows Farms plant finder, Gardenia (tree form)
 *    (https://plants.meadowsfarms.com/12170013/Plant/16481/Gardenia_(tree_form)):
 *    about 6 ft tall and 3 ft wide, about 3 ft of clear trunk, a little
 *    leggy; dark green glossy leaves with pointed tips; double white flowers
 *    at the branch tips, early to late summer.
 *  - Urban Tree Farm (California wholesale), Gardenia jasminoides 'Veitchii'
 *    STD (https://www.urbantreefarm.com/product/gardenia-jasminoides-veitchii-std/):
 *    #5 container at 3 to 4 ft x 2 to 3 ft, single trunk, small dark green leaves.
 *  - NC State Extension Plant Toolbox, Gardenia jasminoides
 *    (https://plants.ces.ncsu.edu/plants/gardenia-jasminoides/): leaves
 *    opposite, whorled at the branch tips, 2 to 4 in, glossy and rugose with
 *    sunken veins, paler below; flowers 1 to 3 in, white aging to yellow.
 *  - Clemson HGIC, Gardenia (https://hgic.clemson.edu/factsheet/gardenia/):
 *    'Veitchii' 4 to 6 ft x 3 to 4 ft, double flowers, long bloom; yellowing
 *    of new foliage from iron deficiency, e.g. next to new concrete.
 * Photo plant (15 gal, three weeks after planting, measured against the
 * fountain column): about 4.75 ft tall, head about 3 ft across with its
 * stray shoots, trunk clear to about 1.8 ft. Catalog: 15 gal at
 * 1.45 x 0.95 m, mature 1.9 x 1.25 m (6.2 x 4.1 ft: Meadows Farms' 6 ft tree
 * form, the head at the top of Clemson's 3 to 4 ft 'Veitchii' width, left
 * untrimmed) in 6 years. Leaves about 3 in at maturity, 2.4 in at install
 * scale; flowers 2.4 to 2.8 in across at maturity, about 2 in at install.
 */

/** Mature leaf: deep glossy green; `fresh` is the lime of the young tip leaves. */
const LEAF: GlossLeaf = {
  base: '#1c3c16', dark: '#0d2309', fresh: '#c0d244', aspect: 0.47, widest: 0.48, tip: 0.7,
  veins: 8, impressed: 0.5, gloss: 0.16, midrib: 'rgba(160,185,115,0.75)',
};

/** Freshness of the 8 single-leaf cells: 0-4 mature, 5 half-grown, 6-7 young lime. */
const FRESH = [0, 0, 0.04, 0.08, 0.14, 0.5, 0.86, 1];

/** Leaf atlas: 8 single leaves (128 x 256) on top; 4 whorls seen from above below (2 dark, 2 with a lime tuft). */
function leafAtlas(): { map: THREE.Texture; leaf: (i: number) => [number, number, number, number]; whorl: (i: number) => [number, number, number, number] } {
  const map = leafTexture('gardenia-standard-leaves', 1024, 512, (g) => {
    const r = rng('gardenia-standard-leaf-tex');
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...LEAF, aspect: 0.45 + r() * 0.05 }, { fresh: FRESH[i], shade: (r() - 0.5) * 0.3 });
      g.restore();
    }
    for (let i = 0; i < 4; i++) {
      cellClip(g, i, 1, 256, 256);
      const n = 7 + Math.floor(r() * 3), a0 = r() * 6.3;
      for (let k = 0; k < n; k++) paintGlossLeaf(g, r, 128, 128, 106 + r() * 16, a0 + k * 2.39996, LEAF, { fresh: r() * 0.08, shade: -0.2 - r() * 0.35, squash: 0.85 + r() * 0.2 });
      const lime = i >= 2;
      for (let k = 0; k < 3; k++) paintGlossLeaf(g, r, 128, 128, 54 + r() * 14, a0 + 0.6 + k * 2.1, LEAF, { fresh: lime ? 0.92 : 0.3, shade: -0.05 });
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

/** Flowers (2 x 2): two fresh double blooms and an aging one seen from above, and a spiral bud from the side. */
function flowerTex(white: string, cream: string): THREE.Texture {
  return leafTexture('gardenia-standard-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('gardenia-standard-flower-tex');
    type Pal = { base: string; mid: string; tip: string };
    // A broad waxy petal, obovate with a soft point, a little twisted; a soft shadow falls on the petal below.
    const petal = (ang: number, len: number, wid: number, c: Pal, rim: number) => {
      g.save();
      g.rotate(ang);
      const tw = (r() - 0.5) * 0.3 * wid;
      const path = () => {
        g.beginPath();
        g.moveTo(0, -wid * 0.1);
        g.bezierCurveTo(len * 0.28, -wid * 0.64, len * 0.84, -wid * 0.6, len * 0.99, tw - wid * 0.04);
        g.quadraticCurveTo(len * 1.02, tw, len * 0.96, tw + wid * 0.09);
        g.bezierCurveTo(len * 0.84, wid * 0.6, len * 0.28, wid * 0.62, 0, wid * 0.1);
        g.closePath();
      };
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, c.base);
      grad.addColorStop(0.5, c.mid);
      grad.addColorStop(1, c.tip);
      path();
      g.fillStyle = grad;
      g.shadowColor = 'rgba(96,84,40,0.55)';
      g.shadowBlur = 16;
      g.shadowOffsetX = -3;
      g.fill();
      g.shadowColor = 'rgba(0,0,0,0)';
      g.shadowBlur = 0;
      g.shadowOffsetX = 0;
      g.save();
      g.clip();
      // Faint parallel veins, a shaded fold along one side, the curled rim catching light.
      g.strokeStyle = 'rgba(150,140,100,0.13)';
      g.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(len * 0.06, 0);
        g.quadraticCurveTo(len * 0.5, i * wid * 0.08, len * 0.94, i * wid * 0.12 + tw * 0.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(120,108,66,0.12)';
      g.beginPath();
      g.ellipse(len * 0.55, wid * 0.3, len * 0.4, wid * 0.16, 0.05, 0, 6.3);
      g.fill();
      g.strokeStyle = `rgba(255,255,250,${rim})`;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(len * 0.74, -wid * 0.42);
      g.quadraticCurveTo(len * 1.0, tw, len * 0.74, wid * 0.42);
      g.stroke();
      g.restore();
      g.restore();
    };
    // Fully double: five whorls of petals from the outside in, each turned against the one below, a rolled center.
    const double = (cx: number, cy: number, pal: Pal, deep: string) => {
      cellClip(g, cx, cy, S, S);
      g.translate(S / 2, S / 2);
      const R = S * 0.48, a0 = r() * 6.28;
      const layers: [number, number, number, number][] = [[7, 0.98, 0.84, 0], [7, 0.84, 0.72, 0.45], [6, 0.66, 0.6, 0.1], [5, 0.48, 0.48, 0.7], [4, 0.32, 0.36, 0.3]];
      layers.forEach(([n, len, wid, off], li) => {
        const c = li < 2 ? pal : { base: tone(pal.base, deep, 0.25 + li * 0.1), mid: tone(pal.mid, pal.base, 0.15 * li), tip: pal.tip };
        for (let i = 0; i < n; i++) petal(a0 + off + (i / n) * 6.2832 + (r() - 0.5) * 0.2, R * len * (0.92 + r() * 0.1), R * wid, c, li < 3 ? 0.35 : 0.2);
      });
      g.strokeStyle = tone(deep, '#9a8c5a', 0.4);
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(0, 0, R * (0.05 + i * 0.035), a0 + i * 2, a0 + i * 2 + 3.6);
        g.stroke();
      }
      g.restore();
    };
    double(0, 0, { base: tone(white, cream, 0.75), mid: white, tip: tone(white, '#ffffff', 0.5) }, cream);
    double(1, 0, { base: tone(white, cream, 0.9), mid: tone(white, cream, 0.2), tip: white }, cream);
    const old = tone(cream, '#f2dc8a', 0.45);
    double(0, 1, { base: tone(old, '#c4a458', 0.3), mid: old, tip: tone(old, '#fff4cc', 0.3) }, '#b8994a');
    // Bud: a pale green-white spindle twisted to a point, in a green calyx with thin lobes.
    cellClip(g, 1, 1, S, S);
    {
      const cx = S / 2, by = S * 0.86, top = S * 0.08, w = S * 0.17;
      const grad = g.createLinearGradient(cx - w, 0, cx + w, 0);
      grad.addColorStop(0, '#839e5a');
      grad.addColorStop(0.45, '#dfe8c0');
      grad.addColorStop(1, '#98b06c');
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

/** Birth for wood or leaves below the trunk top: the head settles lower as the tree ages. */
function laterBelow(head: Head): (y: number) => number {
  const span = Math.max(0.05, head.trunkTop - head.H * 0.39);
  return (y) => (y >= head.trunkTop - head.H * 0.02 ? 0 : lerp(0.3, 0.8, clamp((head.trunkTop - y) / span)));
}

/**
 * The head's wood, grown to fill its envelope evenly. Shoot tips are spread over the head's surface (a Fibonacci
 * lattice), each reached by a twig from a side branch, the side branches from the scaffolds that leave the trunk top.
 * (growHead's own branching left gaps and lopsided heads at this small size with single leaves; its envelope, trunk
 * and sway are kept.) Branch levels: 0 scaffolds, 1 side branches, 2 twigs, which end where the leafy shoot begins.
 */
function headSkeleton(head: Head, r: () => number, nTips: number, early: number): Limb[] {
  const { H, trunkTop, center } = head;
  const lowBirth = laterBelow(head);
  const limbs: Limb[] = [];
  const add = (pts: THREE.Vector3[], r0: number, r1: number, level: number, birth: number, parent: number, rParent: number) => {
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    limbs.push({ pts, rad: pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), level, birth, parent, length, rParent });
    return limbs.length - 1;
  };
  // A stem from a to b in `segs` segments, bowed sideways and a little up in the middle.
  const bent = (a: THREE.Vector3, b: THREE.Vector3, segs: number, bow: number) => {
    const d = b.clone().sub(a);
    const L = d.length();
    const side = perp(d.clone().normalize()).applyAxisAngle(d.clone().normalize(), r() * 6.28);
    const k = (r() - 0.3) * bow * L;
    return Array.from({ length: segs + 1 }, (_, i) => {
      const t = i / segs, w = Math.sin(Math.PI * t);
      return a.clone().addScaledVector(d, t).addScaledVector(side, w * k).add(V(0, w * Math.abs(k) * 0.5, 0));
    });
  };
  /** Distance from p along u to the envelope surface. */
  const reach = (p: THREE.Vector3, u: THREE.Vector3) => {
    let d = 0;
    while (d < H && head.depth(p.clone().addScaledVector(u, d)) < 0.96) d += 0.01;
    return d;
  };
  const nearest = (l: Limb, q: THREE.Vector3, from: number) => {
    let best = l.pts[l.pts.length - 1], bi = l.pts.length - 1, bd = Infinity;
    for (let i = Math.max(1, Math.floor(from * (l.pts.length - 1))); i < l.pts.length; i++) {
      const d = l.pts[i].distanceToSquared(q);
      if (d < bd) { bd = d; best = l.pts[i]; bi = i; }
    }
    return { p: best.clone(), r: l.rad[bi] };
  };

  // Scaffolds: evenly around the trunk top, the last a near-vertical leader; each reaches part way to the surface.
  const top = V(0, trunkTop, 0);
  const nS = 7, scaff: number[] = [];
  for (let i = 0; i < nS; i++) {
    const leader = i === nS - 1;
    const az = (i / (nS - 1)) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const lean = leader ? 0.1 + r() * 0.1 : lerp(0.5, 1.2, (i * 0.618 + r() * 0.15) % 1);
    const dir = V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean));
    const base = V(0, trunkTop - H * 0.01 + r() * H * 0.03, 0);
    const end = base.clone().addScaledVector(dir, reach(base, dir) * (leader ? 0.62 : 0.55));
    const r0 = head.trunkR * (leader ? 0.66 : 0.55 + r() * 0.1);
    scaff.push(add(bent(base, end, 5, 0.12), r0, r0 * 0.45, 0, 0, -1, head.trunkR));
  }

  // Shoot tips on the surface, a little inside it here and there; none on the underside next to the trunk.
  const tips: THREE.Vector3[] = [];
  for (let k = 0; k < nTips; k++) {
    const y = 1 - (2 * (k + 0.5)) / nTips;
    if (y < -0.72) continue;
    const ph = k * 2.39996 + (r() - 0.5) * 0.3, c = Math.sqrt(1 - y * y);
    const u = V(Math.cos(ph) * c, y, Math.sin(ph) * c).normalize();
    // A few leggy shoots stand out past the head, as on a standard a while after its last trim.
    const out = r() < 0.1 ? 1.02 + r() * 0.1 : 0.74 + 0.26 * Math.sqrt(r());
    tips.push(center.clone().addScaledVector(u, reach(center, u) * out));
  }
  // Each tip goes to the scaffold pointing most its way.
  const groups: THREE.Vector3[][] = scaff.map(() => []);
  for (const t of tips) {
    const u = t.clone().sub(top).normalize();
    let bi = 0, bd = -2;
    scaff.forEach((si, i) => {
      const l = limbs[si];
      const d = l.pts[l.pts.length - 1].clone().sub(top).normalize().dot(u);
      if (d > bd) { bd = d; bi = i; }
    });
    groups[bi].push(t);
  }
  groups.forEach((g, gi) => {
    if (!g.length) return;
    const sl = limbs[scaff[gi]];
    const sEnd = sl.pts[sl.pts.length - 1];
    const axis = sEnd.clone().sub(top).normalize();
    const e1 = perp(axis), e2 = V().crossVectors(axis, e1);
    // Side branches: the group's tips in runs around the scaffold, about five tips each.
    g.sort((a, b) => {
      const da = a.clone().sub(sEnd), db = b.clone().sub(sEnd);
      return Math.atan2(da.dot(e2), da.dot(e1)) - Math.atan2(db.dot(e2), db.dot(e1));
    });
    const nb = Math.max(1, Math.round(g.length / 5));
    for (let b = 0; b < nb; b++) {
      const run = g.slice(Math.floor((b * g.length) / nb), Math.floor(((b + 1) * g.length) / nb));
      if (!run.length) continue;
      const c = run.reduce((acc, t) => acc.add(t), V()).multiplyScalar(1 / run.length);
      const s = nearest(sl, c, 0.35);
      const e = s.p.clone().lerp(c, 0.62);
      const births = run.map((t) => Math.max(r() < early ? 0 : lerp(0.15, 0.85, r()), lowBirth(t.y)));
      const r0 = Math.min(s.r * 0.85, 0.009);
      const side = add(bent(s.p, e, 3, 0.16), r0, r0 * 0.55, 1, Math.min(...births), scaff[gi], s.r);
      run.forEach((t, k) => {
        const q = nearest(limbs[side], t, 0.3);
        add(bent(q.p, q.p.clone().lerp(t, 0.84), 2, 0.12), 0.0042, 0.0026, 2, births[k], side, q.r);
      });
    }
  });
  return limbs;
}

const UV4 = (i: number): [number, number, number, number] => {
  const e = 1.5 / 1024, cx = i % 2, cy = Math.floor(i / 2);
  return [cx / 2 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 2 - e, 1 - cy / 2 - e];
};

export const build: SpeciesBuilder = (spec) => {
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = leafAtlas();

  // growHead gives the envelope, trunk and sway; the branches are grown by headSkeleton.
  const head = growHead(spec, r, { trunk: 0.43, bottom: 0.39, round: 2.2, lump: 0.1, shift: 0.15, scaffolds: 1, lean: [0, 0], reach: 0.5, trunkR: 0.019, levels: [] });
  head.limbs = headSkeleton(head, r, 300, 0.7);
  const { H } = head;
  const lowBirth = laterBelow(head);
  trunkWood(wood, head, r, { lean: 0.003, sides: 10 });
  headWood(wood, head, col('#e2dcd2'), col('#7a8452'), 0.2, 2);

  const white = new THREE.Color(1, 1, 1);
  const lowY = head.trunkTop * 0.85;
  const shade = (p: THREE.Vector3, inner: number) => {
    const d = head.depth(p);
    const low = lerp(0.8, 1, clamp((p.y - lowY) / (H - lowY)));
    return jitter(white, r, 0.012, 0.04, 0.04).multiplyScalar(lerp(0.5, 1.02, Math.pow(d, 1.5)) * low * (1 - inner * 0.25) * (0.9 + r() * 0.12));
  };
  const sway = (p: THREE.Vector3) => head.sway(p) * WOOD_BEND;
  /** One leaf: 'flat' (2 tris), 'curl' (tip droops, 4) or 'fold' (V-folded at the midrib and curled, 8). */
  type Form = 'flat' | 'curl' | 'fold';
  const leaf = (base: THREE.Vector3, dir: THREE.Vector3, axis: THREE.Vector3, len: number, cell: number, c: THREE.Color, birth: number, form: Form) => {
    const face = leafFace(dir, axis, head.outward(base), 0.85);
    const s = sway(base);
    leafQuad(leaves, base, dir, face, len, len * 0.5, at.leaf(cell), c, birth, base, {
      segs: form === 'flat' ? 1 : 2, curl: form === 'flat' ? 0 : 0.15 + r() * 0.3, fold: form === 'fold' ? 0.12 : 0, center: head.center, radii: head.radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.06),
    });
  };
  /** A pair or whorl of three leaves at p, `ang` away from the shoot axis. */
  const whorl = (p: THREE.Vector3, axis: THREE.Vector3, az: number, ang: number, len: number, cells: () => number, c: THREE.Color, birth: number, form: Form) => {
    const n = r() < 0.35 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      const dir = deflect(axis, ang + (r() - 0.5) * 0.25, az + (j / n) * Math.PI * 2 + (r() - 0.5) * 0.3);
      leaf(p, dir, axis, len * (0.88 + r() * 0.24), cells(), c, birth, form);
    }
  };
  const oldCell = () => Math.floor(r() * 5);
  const pedC = col('#7d9452'), twigC = col('#64703f');

  for (const l of head.limbs) {
    if (l.level !== 2) continue;
    const endP = l.pts[l.pts.length - 1];
    const prev = l.pts[l.pts.length - 2];
    const out = head.outward(endP);
    const tdir = endP.clone().sub(prev).normalize();
    const d = head.depth(endP);
    const birth = clamp(l.birth + r() * 0.04, 0, 0.9);
    // Shoots turn up toward the light.
    const axis = out.clone().multiplyScalar(0.6).addScaledVector(tdir, 0.3).add(V((r() - 0.5) * 0.3, 0.42 + r() * 0.2, (r() - 0.5) * 0.3)).normalize();
    const shootLen = 0.038 + r() * 0.022;
    const tip = endP.clone().addScaledVector(axis, shootLen);
    const s = sway(endP);
    tube(wood, [endP, tip], 0.0022, 0.0014, 3, twigC, birth, endP, () => s, 2);
    let az = r() * 6.28;
    // Older pairs further down the twig: darker, flatter.
    for (const t of l.length > 0.09 ? [0.3, 0.68] : l.length > 0.04 ? [0.5] : []) {
      const p = limbAt(l, t).p;
      az += Math.PI / 2;
      whorl(p, tdir, az, 1.1, 0.08, oldCell, shade(p, 0.5), birth, 'flat');
    }
    // What the shoot ends in: a flower, a bud, a lime tuft of young leaves, or (inside the head) plain leaves.
    const outer = d > 0.8, up = out.y > -0.4;
    const roll = r();
    const kind = outer && up && roll < 0.2 ? 'flower' : outer && up && roll < 0.28 ? 'bud' : roll < (outer ? 0.92 : 0.3) ? 'lime' : 'plain';
    const lit = shade(endP, 0);
    az += Math.PI / 2;
    whorl(endP, axis, az, 1.05, 0.08, oldCell, lit.clone().multiplyScalar(0.94), birth, 'curl');
    const mid = endP.clone().lerp(tip, 0.55);
    az += Math.PI / 2 + (r() - 0.5) * 0.3;
    whorl(mid, axis, az, 0.88, 0.072, oldCell, lit, birth, 'flat');
    az += Math.PI / 2 + (r() - 0.5) * 0.3;
    if (kind === 'flower') {
      // The last whorl spreads wide as a collar under the bloom.
      whorl(tip, axis, az, 1.2, 0.062, oldCell, lit, birth, 'flat');
      const n = axis.clone().multiplyScalar(0.5).addScaledVector(out, 0.5).add(V(0, 0.12, 0)).normalize();
      const R = 0.03 + r() * 0.006;
      const c = tip.clone().addScaledVector(axis, 0.014);
      const aging = r() < 0.18;
      const tint = col('#ffffff', aging ? 0.9 : 0.82 + r() * 0.06);
      tube(wood, [tip, c], 0.0024, 0.002, 3, pedC, clamp(birth + 0.02), tip, () => s, 1);
      bloom(flowers, c, n, R, [{ r: 0.3, h: 0.46 }, { r: 0.62, h: 0.3 }, { r: 1.0, h: 0.02 }], 0.4, 9, UV4(aging ? 2 : r() < 0.5 ? 0 : 1), tint, birth, tip, s, r() * 6.28);
    } else if (kind === 'bud') {
      whorl(tip, axis, az, 0.75, 0.058, () => (r() < 0.4 ? 5 : oldCell()), lit, birth, 'flat');
      const len = 0.02 + r() * 0.008;
      const bd = axis.clone().lerp(UP, 0.3).normalize();
      const f1 = perp(bd), f2 = V().crossVectors(bd, f1).normalize();
      for (const f of [f1, f2]) leafQuad(flowers, tip.clone().addScaledVector(bd, -0.004), bd, f, len, len * 0.62, UV4(3), col('#ffffff', 0.9), clamp(birth + 0.03), tip, { sway0: s, sway1: s });
    } else if (kind === 'lime') {
      // Young leaves: the top whorl half grown and lighter, then pairs of lime leaves folded up around the bud.
      for (let j = 0; j < 3; j++) leaf(tip, deflect(axis, 0.5 + (r() - 0.5) * 0.2, az + (j / 3) * Math.PI * 2 + (r() - 0.5) * 0.3), axis, 0.058 * (0.9 + r() * 0.2), r() < 0.4 ? 6 : r() < 0.6 ? 5 : oldCell(), lit, birth, 'fold');
      az += Math.PI / 3;
      const tuft = tip.clone().addScaledVector(axis, 0.006);
      for (const sd of [0, Math.PI]) leaf(tuft, deflect(axis, 0.26 + r() * 0.1, az + sd), axis, 0.05 + r() * 0.01, r() < 0.75 ? 7 : 6, lit, birth, 'fold');
      az += Math.PI / 2;
      for (const sd of [0, Math.PI]) leaf(tuft.clone().addScaledVector(axis, 0.004), deflect(axis, 0.15 + r() * 0.1, az + sd), axis, 0.034 + r() * 0.008, 7, lit, birth, 'flat');
    } else {
      whorl(tip, axis, az, 0.7, 0.058, () => (r() < 0.3 ? 5 : oldCell()), lit, birth, 'flat');
    }
  }

  // Older leaves along the branches, and shaded whorls inside the head, so it reads dense and dark between the shoots.
  for (const l of head.limbs) {
    if (l.level > 1) continue;
    const n = Math.max(1, Math.round(l.length / (l.level === 0 ? 0.08 : 0.06)));
    for (let k = 0; k < n; k++) {
      const t = lerp(l.level === 0 ? 0.12 : 0.3, 1, (k + r() * 0.7) / n);
      const a = limbAt(l, t);
      const d = head.depth(a.p);
      if (d < 0.35 + r() * 0.15) continue;
      const o = head.outward(a.p);
      const b = clamp(l.birth + lowBirth(a.p.y) * 0.4 + (r() < 0.85 ? 0 : 0.1 + r() * 0.4), 0, 0.9);
      if (r() < 0.45) {
        const face = o.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();
        const dir = perp(face).applyAxisAngle(face, r() * 6.28);
        const size = 0.18 + r() * 0.06;
        const base = a.p.clone().addScaledVector(dir, -size * 0.5);
        const sw = sway(a.p);
        const cell = d > 0.8 && o.y > 0 && r() < 0.35 ? 2 + Math.floor(r() * 2) : Math.floor(r() * 2);
        leafQuad(leaves, base, dir, face, size, size, at.whorl(cell), shade(a.p, 1).multiplyScalar(0.78), b, a.p, { segs: 1, center: head.center, radii: head.radii, normalBend: 0.6, sway0: sw, sway1: sw });
      } else {
        whorl(a.p, a.dir, r() * 6.28, 1.2, 0.082, oldCell, shade(a.p, 0.7), b, 'flat');
      }
    }
  }

  fitBuilders([wood, leaves, flowers], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(spec.flower ?? '#fbf8ee', spec.flower2 ?? '#efe6c4'),
    bark: { map: citrusBark('gardenia-standard-bark', '#4f4236') },
    look: { leafRoughness: 0.7, translucency: 0.18, bend: 0.07, flutter: 0.008 },
  };
};
