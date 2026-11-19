import * as THREE from 'three';
import {
  GeoBuilder, UP, V, barkTexture, clamp, col, jitter, leafQuad, lerp, perp, rng, smoothstep, uvCell,
  type PlantSpec, type SpeciesGeo, type SpeciesLook,
} from '../kit';
import { ball, speckle, tubeVar } from './shared-trees-b';
import { WOOD_BEND, emitWood, fitBuilders, growTree, limbAt, type LevelDef, type Limb } from './shared-trees-a';

/**
 * Helpers for the trees sold trained as standards in a client planting legend
 * (Meyer lemon, Mexican lime, photinia): one clean trunk and a head of
 * scaffold limbs grown inside a rounded envelope. The head is built at its
 * mature size; the trunk stays clean below it at install, and as the tree
 * ages the outer limbs settle lower so the mature head reaches further down
 * the trunk, as it does on an unpruned tree.
 *
 * Also the shared leaf and shoot painters, and the citrus builder used by
 * meyer-lemon.ts and mexican-lime.ts.
 */

/* ------------------------------------------------------------------ */
/* Leaf painting                                                        */
/* ------------------------------------------------------------------ */

export interface LeafShape {
  /** Where along the blade it is widest (0.35 ovate .. 0.6 obovate). */
  widest: number;
  /** Base roundness: 0.5 rounded .. 1.2 tapered (cuneate). */
  base: number;
  /** Tip profile: tipP 1.4 / tipQ 1.1 pointed, tipP 2 / tipQ 0.7 blunt. */
  tipP: number;
  tipQ: number;
  /** Shallow margin waves (crenate) or teeth (serrate), as a fraction of the half width, and how many. */
  teeth?: number;
  toothDepth?: number;
}

/** Half width of a blade at t (0 base .. 1 tip), as a fraction of the half width. */
function halfAt(s: LeafShape, t: number): number {
  let h = t < s.widest ? Math.pow(Math.sin((Math.PI / 2) * (t / s.widest)), s.base) : Math.pow(Math.max(0, 1 - Math.pow((t - s.widest) / (1 - s.widest), s.tipP)), s.tipQ);
  if (s.teeth && s.toothDepth) {
    const k = (t * s.teeth) % 1;
    // Saw-tooth: each tooth rises slowly and drops at its forward point.
    h *= 1 - s.toothDepth * (1 - k) * smoothstep(0.12, 0.25, t) * (1 - smoothstep(0.88, 0.98, t));
  }
  return h;
}

/** Trace a blade outline, base at the origin, tip at (len, 0). */
export function bladePath(g: CanvasRenderingContext2D, len: number, wid: number, s: LeafShape) {
  const N = s.teeth ? Math.max(40, s.teeth * 4) : 32;
  const hw = wid / 2;
  g.beginPath();
  g.moveTo(0, 0);
  for (let i = 1; i <= N; i++) g.lineTo((len * i) / N, -hw * halfAt(s, i / N));
  for (let i = N - 1; i >= 1; i--) g.lineTo((len * i) / N, hw * halfAt(s, i / N));
  g.closePath();
}

export interface LeafPaint {
  /** Blade colors: the darker half, the lit half, and the rim / gloss tint. */
  dark: string;
  lit: string;
  gloss: string;
  /** Strength of the glossy streak, 0..0.5. */
  shine: number;
  rib: string;
  vein: string;
  /** Lateral vein pairs (0 none). */
  veins: number;
  /** -1 shaded .. 1 sunlit. */
  shade: number;
}

/** One leaf blade (no petiole) at (x, y) pointing along `ang`. */
export function paintBlade(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, s: LeafShape, p: LeafPaint) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const gr = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  gr.addColorStop(0, p.dark);
  gr.addColorStop(0.46, p.dark);
  gr.addColorStop(0.54, p.lit);
  gr.addColorStop(1, p.lit);
  g.fillStyle = gr;
  bladePath(g, len, wid, s);
  g.fill();
  if (p.shade < 0) g.fillStyle = `rgba(6,14,4,${-p.shade * 0.32})`;
  else g.fillStyle = `rgba(230,240,200,${p.shade * 0.1})`;
  g.fill();
  g.save();
  g.clip();
  // Gloss: a soft pale band along one half, brightest a third of the way up.
  if (p.shine > 0) {
    const gl = g.createRadialGradient(len * 0.42, -wid * 0.16, 0, len * 0.42, -wid * 0.16, len * 0.42);
    gl.addColorStop(0, withAlpha(p.gloss, p.shine));
    gl.addColorStop(1, withAlpha(p.gloss, 0));
    g.fillStyle = gl;
    g.save();
    g.scale(1, 0.42);
    g.fillRect(0, -wid * 1.3, len, wid * 1.3);
    g.restore();
  }
  // A thin bright rim where the waxy edge catches the light.
  g.strokeStyle = withAlpha(p.gloss, p.shine * 0.8);
  g.lineWidth = Math.max(1, wid * 0.05);
  bladePath(g, len, wid, s);
  g.stroke();
  g.restore();
  // Midrib and side veins.
  g.strokeStyle = p.rib;
  g.lineWidth = Math.max(1, len * 0.016);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, wid * 0.03, len * 0.95, 0);
  g.stroke();
  if (p.veins) {
    g.strokeStyle = p.vein;
    g.lineWidth = Math.max(0.7, len * 0.006);
    g.beginPath();
    for (let i = 1; i <= p.veins; i++) {
      const t = i / (p.veins + 1.4), px = len * t;
      const reach = (wid / 2) * 0.8 * halfAt(s, Math.min(1, t + 0.12));
      for (const sg of [-1, 1]) {
        g.moveTo(px, 0);
        g.quadraticCurveTo(px + len * 0.05, sg * reach * 0.55, px + len * 0.12, sg * reach);
      }
    }
    g.stroke();
  }
  g.restore();
}

/** '#rrggbb' or 'rgb(...)' with an alpha. */
function withAlpha(c: string, a: number): string {
  const k = new THREE.Color(c);
  return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a.toFixed(3)})`;
}

export interface ShootStyle {
  stem: string;
  stemW: number;
  shape: LeafShape;
  /** Leaf length (px) and width ratio. */
  leafLen: number;
  widRatio: number;
  /** Leaves along the shoot. */
  nodes: number;
  /** Petiole length as a fraction of the leaf, and its wing width as a fraction of the leaf width. */
  petiole: number;
  wing: number;
  /** Angle between leaf and shoot, radians [min, max]. */
  spread: [number, number];
  /** Chance of a thorn at a node, and its length as a fraction of the leaf. */
  thorn?: number;
  thornLen?: number;
  thornColor?: string;
  /** Paint for leaf i of n (t 0 base .. 1 tip). */
  paint: (t: number, r: () => number) => LeafPaint;
  /** Leaf size along the shoot (t 0 base .. 1 tip). */
  size?: (t: number) => number;
}

/** A shoot with alternate leaves from (x0, y0) along `ang`, `len` px long. Returns the tip point and direction. */
export function paintShoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, len: number, st: ShootStyle) {
  const bend = (r() - 0.5) * 0.35;
  const pt = (t: number) => {
    const a = ang + bend * t;
    return { x: x0 + Math.cos(ang + bend * t * 0.5) * len * t, y: y0 + Math.sin(ang + bend * t * 0.5) * len * t, a };
  };
  g.strokeStyle = st.stem;
  g.lineCap = 'round';
  g.lineWidth = st.stemW;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= 10; i++) { const q = pt(i / 10); g.lineTo(q.x, q.y); }
  g.stroke();
  for (let k = 0; k < st.nodes; k++) {
    const t = 0.08 + (k / st.nodes) * 0.88;
    const q = pt(t);
    const sg = k % 2 ? 1 : -1;
    const a = q.a + sg * lerp(st.spread[0], st.spread[1], r());
    const L = st.leafLen * (st.size ? st.size(t) : 1) * (0.86 + r() * 0.28);
    if (st.thorn && r() < st.thorn) {
      // A slender spine in the leaf axil, pointing forward.
      const ta = q.a - sg * (0.45 + r() * 0.3);
      const tl = st.leafLen * (st.thornLen ?? 0.1) * (0.7 + r() * 0.6);
      g.fillStyle = st.thornColor ?? st.stem;
      g.beginPath();
      g.moveTo(q.x + Math.cos(ta + 1.57) * st.stemW * 0.45, q.y + Math.sin(ta + 1.57) * st.stemW * 0.45);
      g.lineTo(q.x + Math.cos(ta) * tl, q.y + Math.sin(ta) * tl);
      g.lineTo(q.x + Math.cos(ta - 1.57) * st.stemW * 0.45, q.y + Math.sin(ta - 1.57) * st.stemW * 0.45);
      g.closePath();
      g.fill();
    }
    paintLeaf(g, q.x, q.y, a, L, st, st.paint(t, r));
  }
  const e = pt(1);
  paintLeaf(g, e.x, e.y, e.a + (r() - 0.5) * 0.3, st.leafLen * (st.size ? st.size(1) : 0.8), st, st.paint(1, r));
  return e;
}

/** Petiole (with its wing, citrus) and blade. */
function paintLeaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, L: number, st: ShootStyle, p: LeafPaint) {
  const W = L * st.widRatio;
  const pl = L * st.petiole;
  const c = Math.cos(a), s = Math.sin(a);
  g.strokeStyle = p.rib;
  g.lineWidth = Math.max(1.2, st.stemW * 0.55);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + c * pl, y + s * pl);
  g.stroke();
  if (st.wing > 0) {
    // Winged petiole: a narrow obovate flange, set off from the blade by a small joint.
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = p.dark;
    bladePath(g, pl * 0.9, W * st.wing, { widest: 0.7, base: 1.2, tipP: 2, tipQ: 0.6 });
    g.fill();
    g.restore();
  }
  paintBlade(g, x + c * pl * 1.04, y + s * pl * 1.04, a, L, W, st.shape, p);
}

/* ------------------------------------------------------------------ */
/* The standard: trunk, scaffolds and head                              */
/* ------------------------------------------------------------------ */

export interface HeadSpec {
  /** Top of the clean trunk, where the scaffolds leave it, as a fraction of the height. */
  trunk: number;
  /** Lowest foliage of the mature head, fraction of the height (below `trunk`: the head settles lower with age). */
  bottom: number;
  /** Envelope roundness: 2 ellipsoid, 2.5 fuller and squarer. */
  round: number;
  /** Envelope irregularity, 0 smooth .. 0.2 lumpy. */
  lump: number;
  /** Where the head is widest, -1 bottom .. 1 top of the envelope (0 ellipsoid). */
  shift?: number;
  scaffolds: number;
  /** Scaffold lean from vertical, radians [min, max]; the last scaffold is a near-vertical leader. */
  lean: [number, number];
  /** Low limbs that leave the trunk top outward and down: they fill the bottom of the mature head (late birth). */
  low?: number;
  /** Scaffold length as a fraction of the way to the envelope. */
  reach: number;
  /** Trunk radius at maturity, meters. */
  trunkR: number;
  levels: LevelDef[];
}

export interface Head {
  H: number;
  R: number;
  center: THREE.Vector3;
  radii: THREE.Vector3;
  trunkTop: number;
  /** Trunk radius at maturity, meters. */
  trunkR: number;
  limbs: Limb[];
  /** Envelope value: 0 at the center .. 1 at the surface. */
  depth: (p: THREE.Vector3) => number;
  outward: (p: THREE.Vector3) => THREE.Vector3;
  sway: (p: THREE.Vector3) => number;
  /** Extra birth for a point below the trunk top: lower foliage appears as the head settles. */
  lowBirth: (y: number) => number;
}

/** Grow the head of a standard: scaffolds from the trunk top, then `levels` of branches inside the envelope. */
export function growHead(spec: PlantSpec, r: () => number, h: HeadSpec): Head {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const bottom = H * h.bottom;
  const cy = (H + bottom) / 2, ry = (H - bottom) / 2;
  const center = V(0, cy, 0), radii = V(R, ry, R);
  const ph = r() * 6.28;
  const shift = h.shift ?? 0;
  const raw = (p: THREE.Vector3) => {
    let dy = (p.y - cy) / ry;
    // Shift the widest point up or down by stretching one half.
    dy = dy > 0 ? dy * (1 - shift * 0.35) : dy * (1 + shift * 0.35);
    const rr = Math.hypot(p.x, p.z) / R;
    const az = Math.atan2(p.z, p.x);
    const k = 1 + h.lump * (Math.sin(3 * az + ph + 2.2 * dy) + 0.6 * Math.sin(5 * az + ph * 2.3 - 3.1 * dy) + 0.45 * Math.sin(2 * az - ph + 4.2 * dy)) / 2.05;
    return Math.pow(Math.pow(rr, h.round) + Math.pow(Math.abs(dy), h.round), 1 / h.round) / k;
  };
  const trunkTop = H * h.trunk;

  // Scaffolds: evenly around, each reaching part of the way to the envelope; then the low limbs.
  const nLow = h.low ?? 0;
  const trunks = Array.from({ length: h.scaffolds + nLow }, (_, i) => {
    const low = i >= h.scaffolds;
    const leader = i === h.scaffolds - 1;
    const az = low ? ((i - h.scaffolds + 0.5) / nLow) * Math.PI * 2 + (r() - 0.5) * 0.5 : (i / Math.max(1, h.scaffolds - 1)) * Math.PI * 2 + (r() - 0.5) * 0.6;
    // Leans spread evenly over the range (in a scrambled order), so no band of the head is left empty.
    const lean = low ? 1.45 + r() * 0.35 : leader ? 0.1 + r() * 0.1 : lerp(h.lean[0], h.lean[1], ((i * 0.618 + r() * 0.15) % 1));
    const dir = V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean));
    const base = V(0, trunkTop - (i % 3) * H * 0.012, 0);
    let d = 0;
    while (d < H && raw(base.clone().addScaledVector(dir, d)) < 0.95) d += 0.02;
    const rad = h.trunkR * (low ? 0.4 : leader ? 0.62 : 0.55 + r() * 0.1);
    return { base, dir, length: Math.max(0.2, d * (low ? h.reach * 1.15 : leader ? h.reach * 1.05 : h.reach)), r0: rad, r1: rad * 0.45, segs: 5, gnarl: 0.22, up: low ? -0.15 : leader ? 0.05 : 0.12 };
  });
  const limbs = growTree(r, trunks, h.levels, raw);

  // Limbs that reach below the trunk top belong to the settled, older head: they come later.
  const span = Math.max(0.05, trunkTop - bottom);
  const lowBirth = (y: number) => (y >= trunkTop - H * 0.02 ? 0 : lerp(0.3, 0.8, clamp((trunkTop - y) / span)));
  for (const l of limbs) {
    let minY = Infinity;
    for (const p of l.pts) minY = Math.min(minY, p.y);
    l.birth = Math.max(l.birth, lowBirth(minY), l.parent >= 0 ? limbs[l.parent].birth : 0);
  }

  return {
    H, R, center, radii, trunkTop, trunkR: h.trunkR, limbs,
    depth: (p) => clamp(raw(p)),
    outward: (p) => V(p.x, (p.y - cy) * 0.7, p.z).normalize(),
    sway: (q) => clamp(Math.pow(Math.max(0, q.y) / H, 1.6) * 0.7 + (Math.hypot(q.x, q.z) / R) * 0.3),
    lowBirth,
  };
}

/** Birth for wood or leaves below the trunk top: the head settles lower as the tree ages. */
export function laterBelow(head: Head): (y: number) => number {
  const span = Math.max(0.05, head.trunkTop - head.H * 0.39);
  return (y) => (y >= head.trunkTop - head.H * 0.02 ? 0 : lerp(0.3, 0.8, clamp((head.trunkTop - y) / span)));
}

/**
 * The head's wood, grown to fill its envelope evenly. Shoot tips are spread over the head's surface (a Fibonacci
 * lattice), each reached by a twig from a side branch, the side branches from the scaffolds that leave the trunk top.
 * (growHead's own branching left gaps and lopsided heads at this small size with single leaves; its envelope, trunk
 * and sway are kept.) Branch levels: 0 scaffolds, 1 side branches, 2 twigs, which end where the leafy shoot begins.
 * Sizes are the gardenia's unless `o` gives others (a bigger tree: thicker side branches and twigs, more scaffolds).
 */
export function headSkeleton(head: Head, r: () => number, nTips: number, early: number, o: { sideR?: number; twigR?: [number, number]; scaffolds?: number } = {}): Limb[] {
  const sideMax = o.sideR ?? 0.009, twigR = o.twigR ?? [0.0042, 0.0026];
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
  const nS = o.scaffolds ?? 7, scaff: number[] = [];
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
      const r0 = Math.min(s.r * 0.85, sideMax);
      const side = add(bent(s.p, e, 3, 0.16), r0, r0 * 0.55, 1, Math.min(...births), scaff[gi], s.r);
      run.forEach((t, k) => {
        const q = nearest(limbs[side], t, 0.3);
        add(bent(q.p, q.p.clone().lerp(t, 0.84), 2, 0.12), twigR[0], twigR[1], 2, births[k], side, q.r);
      });
    }
  });
  return limbs;
}

/** The clean trunk: root flare at the soil, an optional graft swelling, and a slight lean. */
export function trunkWood(g: GeoBuilder, head: Head, r: () => number, o: { graft?: number; sides?: number; lean?: number }) {
  const top = head.trunkTop + head.H * 0.03;
  const lean = o.lean ?? 0.01;
  const ts = [-0.06, 0, 0.03, 0.07, 0.12, 0.2, 0.35, 0.55, 0.75, 1];
  const ph = r() * 6;
  const pts = ts.map((t) => V(Math.sin(t * 4 + ph) * lean * head.H, t <= 0 ? t * head.H : t * top, Math.cos(t * 3 + ph) * lean * head.H));
  const gy = o.graft ?? 0;
  const R0 = head.trunkR;
  const rad = (i: number) => {
    const y = pts[i].y;
    let k = 1 + 0.6 * Math.exp(-Math.max(0, y) / (head.H * 0.025));
    if (gy) k *= 1 + 0.12 * Math.exp(-Math.pow((y - gy) / (head.H * 0.025), 2));
    return R0 * k * lerp(1, 0.85, clamp(y / top));
  };
  tubeVar(g, pts, rad, o.sides ?? 12, () => col('#ffffff'), 0, V(), (i) => head.sway(pts[i]) * 0.3, { uScale: 1, cap: true });
}

/** Limbs as tubes, with green young wood toward the twigs. */
export function headWood(g: GeoBuilder, head: Head, bark: THREE.Color, twig: THREE.Color, tile: number, maxLevel = 2) {
  emitWood(g, head.limbs.filter((l) => l.level <= maxLevel), {
    tile,
    sway: (p) => head.sway(p) * WOOD_BEND,
    // Wood inside the head is in the leaves' shade.
    color: (l, t) => {
      const c = l.level >= 3 ? twig.clone() : l.level === 2 ? bark.clone().lerp(twig, 0.35 + t * 0.5) : l.level === 1 ? bark.clone().lerp(twig, t * 0.3) : bark.clone();
      return c.multiplyScalar(lerp(0.45, 1, Math.pow(head.depth(limbAt(l, t).p), 2)));
    },
    sides: (l) => (l.level >= 2 ? 3 : l.level === 1 ? 5 : 8),
  });
}

export interface CardOpts {
  /** Card size range, meters at maturity. */
  card: [number, number];
  /** Spacing of cards along twigs and along branches, meters. */
  step: [number, number];
  /** Atlas cell (2 x 2) for a card; `tip` is the card at a twig end. */
  cell: (tip: boolean, depth: number, out: THREE.Vector3) => number;
  /** Direction of the card at a twig end (default: the twig, turned outward). */
  tipDir?: (end: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;
  /** Size multiplier for tip cards. */
  tipScale?: number;
  normalBend?: number;
}

export interface TwigTip {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  birth: number;
}

/**
 * Leaf cards (2 x 2 atlas of sprays) along the branches and twigs of a head,
 * shaded darker inside it. Returns the twig tips (for fruit and flowers).
 */
export function headCards(g: GeoBuilder, head: Head, r: () => number, o: CardOpts): TwigTip[] {
  const { H, center, radii } = head;
  const cardAt = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tip: boolean) => {
    const d = head.depth(at);
    const out = head.outward(at);
    const lowLight = lerp(0.8, 1, clamp((at.y - head.trunkTop) / (H - head.trunkTop)));
    const shade = lerp(0.32, 1.04, Math.pow(d, 1.5)) * lowLight * (0.9 + r() * 0.18);
    const c = new THREE.Color(shade * (0.96 + r() * 0.08), shade, shade * (0.94 + r() * 0.08));
    // Cards face out of the head (a little up), so from outside their front faces show: a back face seen
    // from outside would light like a mirror of the sky.
    const face = out.clone().add(V(0, 0.15, 0)).add(V((r() - 0.5) * 0.7, (r() - 0.5) * 0.5, (r() - 0.5) * 0.7)).normalize();
    const cell = o.cell(tip, d, out);
    const size = lerp(o.card[0], o.card[1], r()) * (tip ? o.tipScale ?? 1 : 1);
    const s = head.sway(at) * WOOD_BEND;
    leafQuad(g, at, dir, face, size, size, uvCell(2, 2, cell), c, clamp(birth, 0, 0.9), at, {
      segs: 2, curl: (r() - 0.3) * 0.7, center, radii, normalBend: o.normalBend ?? 0.6, sway0: s, sway1: clamp(s + 0.14),
    });
  };
  const tips: TwigTip[] = [];
  for (const l of head.limbs) {
    if (l.level < 2) continue;
    const twig = l.level >= 3;
    const step = twig ? o.step[0] : o.step[1];
    const from = twig ? 0.1 : 0.3;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / step));
    for (let k = 0; k < n; k++) {
      const t = lerp(from, 1, (k + r() * 0.7) / n);
      const at = limbAt(l, t);
      const d = head.depth(at.p);
      // Deep inside the head nothing shows: thin it out.
      if (d < 0.26 + r() * 0.2) continue;
      const lat = V().crossVectors(at.dir, UP);
      if (lat.lengthSq() < 0.01) lat.set(1, 0, 0);
      lat.normalize().multiplyScalar(k % 2 ? 1 : -1);
      // Sprays lie along the surface of the head like shingles, tipped a little outward.
      const dir = at.dir.clone().multiplyScalar(0.55).addScaledVector(lat, 0.7).addScaledVector(head.outward(at.p), 0.35).add(V(0, (r() - 0.45) * 0.5, 0)).normalize();
      cardAt(at.p, dir, l.birth + head.lowBirth(at.p.y) * 0.5 + (r() < 0.86 ? 0 : 0.1 + r() * 0.4 * d), false);
    }
    if (twig || (l.level === 2 && head.depth(l.pts[l.pts.length - 1]) > 0.85)) {
      const end = limbAt(l, 1);
      const out = head.outward(end.p);
      const dir = o.tipDir ? o.tipDir(end.p, end.dir, out) : end.dir.clone().addScaledVector(out, 0.6).normalize();
      cardAt(end.p, dir, l.birth + 0.03, true);
      tips.push({ p: end.p, dir: end.dir, birth: l.birth });
    }
  }
  return tips;
}

/* ------------------------------------------------------------------ */
/* Citrus                                                               */
/* ------------------------------------------------------------------ */

export interface CitrusStyle {
  key: string;
  head: HeadSpec;
  /** Leaf atlas painter (1024 x 1024, 2 x 2 cells; cell 2 is the new-growth spray). */
  leaves: () => THREE.Texture;
  /** Share of outer shoot tips in new growth (atlas cell 2). */
  flush: number;
  /** How far the leaf surface sits outside the twig envelope, meters (fruit and flowers sit there). */
  surface: number;
  /** Card size range, meters at maturity. */
  card: [number, number];
  /** Spacing of cards along twigs and branches, meters. */
  step: [number, number];
  /** Fruit: radius range (m), height / width, how many, how many on the tree at install, colors (weights). */
  fruit: { rad: [number, number]; squash: number; count: number; top: number; early: number; cells: [number, number][]; segs: [number, number] };
  /** Blossom and bud clusters. */
  blooms: number;
  bloomSize: [number, number];
  /** Fruit and flower atlas painter (1024 x 512, 4 x 2 cells: 0-2 peels, 3 calyx, 4 open flower, 5 flower cluster, 6 bud cluster, 7 flower cluster). */
  fruitMap: () => THREE.Texture;
  bark: () => THREE.Texture;
  barkTint: string;
  twigTint: string;
  look: SpeciesLook;
}

/** Peel: oil glands as fine dimples, lighter and darker, over a base color with a faint blush. */
export function paintPeel(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, S: number, base: string, blush: string, light: string, dark: string) {
  g.fillStyle = base;
  g.fillRect(x, y, S, S);
  const gr = g.createLinearGradient(x, y, x, y + S);
  gr.addColorStop(0, withAlpha(blush, 0));
  gr.addColorStop(0.55, withAlpha(blush, 0.12));
  gr.addColorStop(1, withAlpha(blush, 0.35));
  g.fillStyle = gr;
  g.fillRect(x, y, S, S);
  speckle(g, r, x, y, S, S, 2600, [withAlpha(dark, 0.22), withAlpha(light, 0.25), withAlpha(dark, 0.12)], 1, 3);
  // Stem end: a slightly darker ring at the top (v near 1 is the top of the ball).
  const sg = g.createLinearGradient(x, y, x, y + S * 0.16);
  sg.addColorStop(0, withAlpha(dark, 0.35));
  sg.addColorStop(1, withAlpha(dark, 0));
  g.fillStyle = sg;
  g.fillRect(x, y, S, S * 0.16);
}

/** A citrus flower seen from the front: five thick waxy petals, yellow anthers. `tint` washes the petal bases. */
export function paintBlossom(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rad: number, tint: string, tintAmt: number) {
  const a0 = r() * 6.28;
  for (let k = 0; k < 5; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate(a0 + (k / 5) * Math.PI * 2 + (r() - 0.5) * 0.25);
    const pg = g.createLinearGradient(0, 0, rad, 0);
    pg.addColorStop(0, withAlpha(tint, tintAmt));
    pg.addColorStop(0.5, '#f4f1e6');
    pg.addColorStop(1, '#fdfcf6');
    g.fillStyle = '#f6f3ea';
    bladePath(g, rad, rad * 0.42, { widest: 0.6, base: 0.8, tipP: 2, tipQ: 0.6 });
    g.fill();
    g.fillStyle = pg;
    g.fill();
    g.restore();
  }
  g.fillStyle = '#dcd27a';
  g.beginPath();
  g.arc(cx, cy, rad * 0.24, 0, 6.3);
  g.fill();
  g.fillStyle = '#e9c43c';
  for (let k = 0; k < 14; k++) {
    const a = r() * 6.28, d = rad * (0.12 + r() * 0.16);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.2, rad * 0.045), 0, 6.3);
    g.fill();
  }
  g.fillStyle = '#b8c860';
  g.beginPath();
  g.arc(cx, cy, rad * 0.07, 0, 6.3);
  g.fill();
}

/** A closed bud: plump oblong, `tip` colored toward its end. */
export function paintBud(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, base: string, tip: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = '#5f7f34';
  g.lineWidth = Math.max(1.5, len * 0.12);
  g.beginPath();
  g.moveTo(-len * 0.5, 0);
  g.lineTo(0, 0);
  g.stroke();
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, base);
  gr.addColorStop(1, tip);
  g.fillStyle = gr;
  bladePath(g, len, len * 0.55, { widest: 0.55, base: 0.6, tipP: 2, tipQ: 0.55 });
  g.fill();
  g.fillStyle = '#6d8c3c';
  bladePath(g, len * 0.22, len * 0.42, { widest: 0.8, base: 0.6, tipP: 2, tipQ: 0.6 });
  g.fill();
  g.restore();
}

/** Green calyx star with a short stalk, seen from above. */
export function paintCalyx(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number) {
  g.fillStyle = '#56722e';
  for (let k = 0; k < 5; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((k / 5) * Math.PI * 2);
    bladePath(g, rad, rad * 0.62, { widest: 0.4, base: 0.6, tipP: 1.5, tipQ: 1 });
    g.fill();
    g.restore();
  }
  g.fillStyle = '#4a6428';
  g.beginPath();
  g.arc(cx, cy, rad * 0.22, 0, 6.3);
  g.fill();
}

/** Build a citrus standard from a style. */
export function buildCitrus(spec: PlantSpec, st: CitrusStyle): SpeciesGeo {
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), extra = new GeoBuilder();
  const head = growHead(spec, r, st.head);
  const { H } = head;

  trunkWood(wood, head, r, { graft: H * 0.07, lean: 0.006 });
  headWood(wood, head, col(st.barkTint), col(st.twigTint), 0.25);

  const tips = headCards(leaves, head, r, {
    card: st.card,
    step: st.step,
    cell: (tip, d, out) => (tip && d > 0.78 && out.y > -0.2 && r() < st.flush ? 2 : r() < 0.18 ? 3 : r() < 0.5 ? 0 : 1),
  });

  // Fruit hangs at the outside of the head, mostly low; blossoms and buds sit on the surface.
  const inset = (u: [number, number, number, number]): [number, number, number, number] => [u[0] + 0.012, u[1] + 0.02, u[2] - 0.012, u[3] - 0.02];
  const fruitCells = st.fruit.cells;
  const wsum = fruitCells.reduce((a, c) => a + c[1], 0);
  // Spread them evenly around the head: aim at a direction, take the outer twig tip that faces it best.
  const outer = tips.filter((t) => head.depth(t.p) > 0.75);
  const tipToward = (az: number, rel: number) => {
    const ce = Math.sqrt(Math.max(0, 1 - rel * rel));
    const want = V(Math.cos(az) * ce, rel, Math.sin(az) * ce);
    let best = outer[0], bd = -2;
    for (let k = 0; k < 60; k++) {
      const t = outer[Math.floor(r() * outer.length)];
      const d = head.outward(t.p).dot(want);
      if (d > bd) { bd = d; best = t; }
    }
    return best;
  };
  let nFruit = 0, nBloom = 0;
  for (let i = 0; nFruit < st.fruit.count && outer.length && i < st.fruit.count; i++) {
    const t = tipToward(i * 2.39996 + r() * 0.5, lerp(-0.85, st.fruit.top, Math.pow(r(), 1.3)));
    const d = head.depth(t.p);
    const s = head.sway(t.p) * WOOD_BEND;
    const out = head.outward(t.p);
    // Clusters of one to three.
    const k = r() < 0.55 ? 1 : r() < 0.7 ? 2 : 3;
    let pick = r() * wsum, cell = fruitCells[0][0];
    for (const [ci, w] of fruitCells) { if ((pick -= w) <= 0) { cell = ci; break; } }
    const low = head.lowBirth(t.p.y);
    const birth = nFruit < st.fruit.early && low === 0 ? 0 : clamp(Math.max(t.birth, low + 0.05, 0.08 + r() * 0.7), 0, 0.85);
    const hz = V(out.x, 0, out.z).normalize();
    const c0 = t.p.clone();
    // Out from the twig tip to the leaf surface, then hanging below it.
    for (let m = 0; m < 30 && head.depth(c0) < 0.97; m++) c0.addScaledVector(hz, 0.02);
    for (let j = 0; j < k && nFruit < st.fruit.count; j++) {
      const rad = lerp(st.fruit.rad[0], st.fruit.rad[1], r());
      const c = c0.clone().addScaledVector(hz, st.surface - rad).add(V((r() - 0.5) * rad * 3, -rad * (1.3 + j * 1.6) - r() * 0.04, (r() - 0.5) * rad * 3));
      const tint = new THREE.Color(1, 0.96 + r() * 0.06, 0.94 + r() * 0.08).multiplyScalar(lerp(0.85, 1.02, d));
      ball(extra, c, rad, st.fruit.squash, inset(uvCell(4, 2, cell)), tint, birth, t.p, s, st.fruit.segs[0], st.fruit.segs[1], r() * 6);
      // Calyx and stalk on top.
      leafQuad(extra, c.clone().add(V(-rad * 0.55, rad * st.fruit.squash * 0.97, 0)), V(1, 0, 0), UP, rad * 1.1, rad * 1.1, inset(uvCell(4, 2, 3)), col('#ffffff'), birth, t.p, { sway0: s, sway1: s });
      nFruit++;
    }
  }
  for (let i = 0; nBloom < st.blooms && outer.length; i++) {
    const t = tipToward(i * 2.39996 + 1 + r() * 0.5, lerp(-0.5, 0.95, r()));
    const s = head.sway(t.p) * WOOD_BEND;
    const out = head.outward(t.p);
    const p = t.p.clone();
    for (let m = 0; m < 30 && head.depth(p) < 0.97; m++) p.addScaledVector(out, 0.02);
    p.addScaledVector(out, st.surface * (0.6 + r() * 0.6)).add(V((r() - 0.5) * 0.1, (r() - 0.5) * 0.08, (r() - 0.5) * 0.1));
    const side = V().crossVectors(out, UP);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    const face = out.clone().add(V(0, 0.5, 0)).normalize();
    const size = lerp(st.bloomSize[0], st.bloomSize[1], r());
    const cell = r() < 0.35 ? 4 : r() < 0.5 ? 5 : r() < 0.6 ? 6 : 7;
    const kk = cell === 4 ? 0.6 : 1;
    leafQuad(extra, p.clone().addScaledVector(side, (-size * kk) / 2), side, face, size * kk, size * kk, inset(uvCell(4, 2, cell)), jitter(col('#ffffff'), r, 0, 0, 0.03), clamp(Math.max(t.birth, head.lowBirth(t.p.y)) + r() * 0.5, 0, 0.85), t.p, { sway0: s, sway1: s });
    nBloom++;
  }

  fitBuilders([wood, leaves, extra], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: extra.build(),
    leafMap: st.leaves(),
    flowerMap: st.fruitMap(),
    bark: { map: st.bark() },
    look: st.look,
  };
}

/** Smooth gray-brown citrus bark with fine vertical striations. */
export function citrusBark(key: string, base: string): THREE.Texture {
  return barkTexture(key, 256, (g, S) => {
    const r = rng(key);
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 900, ['rgba(170,166,150,0.22)', 'rgba(80,74,60,0.2)', 'rgba(118,126,96,0.2)'], 3, 12);
    for (let i = 0; i < 380; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.55 ? `rgba(58,52,42,${0.1 + r() * 0.2})` : `rgba(196,192,176,${0.08 + r() * 0.14})`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + 14 + r() * 50);
      g.stroke();
    }
  });
}
