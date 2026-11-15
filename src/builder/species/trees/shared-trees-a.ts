import * as THREE from 'three';
import { GeoBuilder, UP, V, canopyDepth, clamp, deflect, jitter, lerp, perp } from '../kit';

/**
 * Tree engine shared by the broadleaf trees in this folder (Japanese maples,
 * Chinese pistache, crape myrtle).
 *
 * It differs from the kit's growSkeleton in four ways that matter for hero
 * trees seen from underneath:
 *  - limbs are grown inside a crown envelope and stop at its surface, so the
 *    silhouette is a full dome (or vase) with twigs reaching the outside;
 *  - limbs are smooth curves with a radius per point, a swollen collar where
 *    they leave the parent, and a root flare on the trunk;
 *  - twigs can be opposite (maple, crape myrtle) or alternate (pistache);
 *  - bark is mapped at a constant world scale, so the pattern does not
 *    stretch on thin branches.
 */

/** Wood bends 0.55 x as far as leaves in the wind shader. Leaves use sway * WOOD_BEND at their base so they stay attached. */
export const WOOD_BEND = 0.55;

export interface Limb {
  pts: THREE.Vector3[];
  /** Radius at each point. */
  rad: number[];
  level: number;
  birth: number;
  parent: number;
  length: number;
  /** Radius of the parent where this limb leaves it (0 for trunks). */
  rParent: number;
}

export interface TrunkDef {
  base: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  r0: number;
  r1: number;
  segs?: number;
  gnarl?: number;
  /** Positive bends toward vertical. */
  up?: number;
  birth?: number;
}

export interface LevelDef {
  /** Which earlier levels carry these children (default: the level before). */
  parents?: number[];
  count?: number | [number, number];
  /** Children per meter of parent (used when `count` is not given). */
  perMeter?: number;
  from?: number | ((parent: Limb) => number);
  to?: number;
  angle: number;
  angleVar?: number;
  /** Length as a fraction of the parent's length. */
  len: number;
  lenVar?: number;
  lenMin?: number;
  lenMax?: number;
  /** Length multiplier toward the parent's tip. */
  taperAlong?: number;
  /** Start radius as a fraction of the parent's radius at the joint. */
  radius?: number;
  /** Tip radius as a fraction of the start radius, and its floor in meters. */
  tip?: number;
  tipMin?: number;
  segs?: number;
  gnarl?: number;
  up?: number;
  /** Flatten toward horizontal, 0..1. */
  flatten?: number;
  /** Push away from the trunk axis, 0..1. */
  out?: number;
  early?: number;
  /** Opposite pairs, each pair turned 90 degrees from the last. */
  opposite?: boolean;
  /** Limbs stop when the envelope value passes a random limit in this range. */
  limit?: [number, number];
  smooth?: boolean;
  /** Drop a limb the envelope cut to less than this fraction of its length (default 0.2). */
  minKeep?: number;
}

export type Envelope = (p: THREE.Vector3) => number;

/**
 * A crown envelope: returns under 1 inside the crown, over 1 outside.
 * `base` and `wide` are fractions of the height where the crown starts and
 * where it is widest; `baseR` and `topR` are the radius fractions at the
 * crown base and at the very top; `lump` makes it irregular.
 */
export function crownEnvelope(o: { H: number; R: number; base: number; wide: number; baseR: number; topR?: number; pBot?: number; pTop?: number; lump?: number; phase?: number }): Envelope {
  const ph = o.phase ?? 0;
  return (p) => {
    const h = p.y / o.H;
    if (h > 1) return 1 + (h - 1) * 20;
    let f: number;
    // Below the crown the envelope narrows to a cone, so low stems can rise through it.
    if (h < o.base) f = o.baseR * (0.2 + 0.8 * Math.max(0, h) / o.base);
    else if (h < o.wide) f = o.baseR + (1 - o.baseR) * Math.sin((Math.PI / 2) * Math.pow((h - o.base) / (o.wide - o.base), o.pBot ?? 0.8));
    else {
      const u = (h - o.wide) / (1 - o.wide);
      f = (o.topR ?? 0) + (1 - (o.topR ?? 0)) * Math.sqrt(Math.max(0, 1 - Math.pow(u, o.pTop ?? 2)));
    }
    if (o.lump) {
      const az = Math.atan2(p.z, p.x);
      f *= 1 + o.lump * (Math.sin(3 * az + ph + 5 * h) + 0.6 * Math.sin(5 * az + ph * 2.3 - 8 * h)) / 1.6;
    }
    return Math.hypot(p.x, p.z) / Math.max(1e-4, o.R * f);
  };
}

function polyLength(pts: THREE.Vector3[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += pts[i].distanceTo(pts[i - 1]);
  return s;
}

function growStem(r: () => number, base: THREE.Vector3, dir: THREE.Vector3, length: number, segs: number, gnarl: number, up: number, env: Envelope | null, limit: number): THREE.Vector3[] {
  const pts = [base.clone()];
  const d = dir.clone().normalize();
  const p = base.clone();
  const step = length / segs;
  for (let i = 0; i < segs; i++) {
    d.x += (r() - 0.5) * gnarl;
    d.z += (r() - 0.5) * gnarl;
    d.y += (r() - 0.5) * gnarl * 0.6 + up / segs;
    d.normalize();
    const q = p.clone().addScaledVector(d, step);
    if (env && env(q) > limit) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) / 2;
        if (env(p.clone().addScaledVector(d, step * mid)) > limit) hi = mid;
        else lo = mid;
      }
      if (lo > 0.12) pts.push(p.clone().addScaledVector(d, step * lo));
      break;
    }
    p.copy(q);
    pts.push(q);
  }
  return pts;
}

function smoothPts(pts: THREE.Vector3[], n: number): THREE.Vector3[] {
  if (pts.length < 3) return pts;
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(n);
}

/** Point, direction and radius at fraction t along a limb. */
export function limbAt(l: Limb, t: number): { p: THREE.Vector3; dir: THREE.Vector3; r: number } {
  const x = clamp(t) * (l.pts.length - 1);
  const i = Math.min(l.pts.length - 2, Math.floor(x));
  const f = x - i;
  return { p: l.pts[i].clone().lerp(l.pts[i + 1], f), dir: l.pts[i + 1].clone().sub(l.pts[i]).normalize(), r: lerp(l.rad[i], l.rad[i + 1], f) };
}

/** Grow trunks, then each level of children, inside the envelope. */
export function growTree(r: () => number, trunks: TrunkDef[], levels: LevelDef[], env: Envelope): Limb[] {
  const limbs: Limb[] = [];
  for (const t of trunks) {
    const segs = t.segs ?? 7;
    const pts = smoothPts(growStem(r, t.base, t.dir, t.length, segs, t.gnarl ?? 0.15, t.up ?? 0, null, 1), segs * 3);
    limbs.push({ pts, rad: pts.map((_, i) => lerp(t.r0, t.r1, Math.pow(i / (pts.length - 1), 0.9))), level: 0, birth: t.birth ?? 0, parent: -1, length: polyLength(pts), rParent: 0 });
  }
  levels.forEach((L, li) => {
    const level = li + 1;
    const parentLevels = L.parents ?? [li];
    const parents = limbs.map((l, i) => (parentLevels.includes(l.level) ? i : -1)).filter((i) => i >= 0);
    for (const bi of parents) {
      const parent = limbs[bi];
      const want = L.count !== undefined ? (typeof L.count === 'number' ? L.count : Math.round(lerp(L.count[0], L.count[1], r()))) : Math.max(1, Math.round(parent.length * (L.perMeter ?? 3) * (0.8 + r() * 0.4)));
      const from = typeof L.from === 'function' ? L.from(parent) : L.from ?? 0.3;
      const to = L.to ?? 0.97;
      const nodes = L.opposite ? Math.max(1, Math.ceil(want / 2)) : want;
      let az = r() * Math.PI * 2;
      for (let k = 0; k < nodes; k++) {
        const t = nodes === 1 ? lerp(from, to, 0.35 + r() * 0.5) : lerp(from, to, (k + 0.15 + r() * 0.7) / nodes);
        const at = limbAt(parent, t);
        az += L.opposite ? Math.PI / 2 + (r() - 0.5) * 0.5 : 2.39996 + (r() - 0.5) * 0.7;
        for (let s = 0; s < (L.opposite ? 2 : 1); s++) {
          const ang = L.angle + (r() - 0.5) * 2 * (L.angleVar ?? 0.15);
          const dir = deflect(at.dir, ang, az + s * Math.PI);
          if (L.flatten) dir.y = lerp(dir.y, 0.04, L.flatten);
          if (L.out) {
            const rr = Math.hypot(at.p.x, at.p.z);
            if (rr > 0.02) dir.add(V((at.p.x / rr) * L.out, 0, (at.p.z / rr) * L.out));
          }
          dir.normalize();
          // The weaker twin of an opposite pair is often much shorter.
          const twin = L.opposite && s === 1 ? 0.55 + r() * 0.45 : 1;
          let length = parent.length * L.len * (1 + (r() - 0.5) * 2 * (L.lenVar ?? 0.2)) * lerp(1, L.taperAlong ?? 0.7, t) * twin;
          length = clamp(length, L.lenMin ?? 0, L.lenMax ?? 1e9);
          const r0 = Math.min(at.r * 0.92, at.r * (L.radius ?? 0.55) * (0.85 + twin * 0.15));
          const r1 = Math.min(r0, Math.max(r0 * (L.tip ?? 0.3), L.tipMin ?? 0));
          const birth = r() < (L.early ?? 0.8) ? parent.birth : clamp(parent.birth + 0.1 + t * 0.25 + r() * 0.35, 0, 0.85);
          const lim = L.limit ? lerp(L.limit[0], L.limit[1], r()) : lerp(0.9, 1, r());
          const segs = L.segs ?? 4;
          let pts = growStem(r, at.p, dir, length, segs, L.gnarl ?? 0.25, L.up ?? 0, env, lim);
          if (pts.length < 2) continue;
          const len = polyLength(pts);
          if (len < Math.max(0.04, length * (L.minKeep ?? 0.2))) continue;
          if (L.smooth !== false && pts.length > 2) pts = smoothPts(pts, (pts.length - 1) * 2);
          limbs.push({ pts, rad: pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), level, birth, parent: bi, length: len, rParent: at.r });
        }
      }
    }
  });
  return limbs;
}

/** Widen the bottom of a trunk into a root flare. */
export function rootFlare(l: Limb, amount: number, height: number) {
  l.pts.forEach((p, i) => {
    l.rad[i] *= 1 + amount * Math.exp(-Math.max(0, p.y) / height);
  });
}

export interface WoodOpts {
  sides?: (l: Limb) => number;
  color: (l: Limb, t: number) => THREE.Color;
  sway: (p: THREE.Vector3) => number;
  /** Meters of bark covered by one texture tile. */
  tile: number;
  /** Extra radius at the joint with the parent, as a fraction (default 0.4). */
  collar?: number;
}

export function sidesFor(radius: number): number {
  return radius > 0.09 ? 14 : radius > 0.045 ? 10 : radius > 0.022 ? 7 : radius > 0.011 ? 5 : radius > 0.0045 ? 4 : 3;
}

/** Tubes for every limb, with twist-free frames and world-scale bark mapping. */
export function emitWood(g: GeoBuilder, limbs: Limb[], o: WoodOpts) {
  const t = V(), n = V(), b = V();
  for (const l of limbs) {
    const sides = o.sides ? o.sides(l) : sidesFor(l.rad[0]);
    const N = l.pts.length;
    const uRep = Math.max(1, Math.round((2 * Math.PI * l.rad[0]) / o.tile));
    // The collar never grows wider than the parent, or it would poke out the far side.
    const collar = l.level === 0 ? 0 : clamp(Math.min(o.collar ?? 0.4, (l.rParent * 0.97) / l.rad[0] - 1), 0, 1);
    const anchor = l.level === 0 ? V(l.pts[0].x, 0, l.pts[0].z) : l.pts[0];
    let s = 0;
    let prev: number[] | null = null;
    for (let i = 0; i < N; i++) {
      if (i > 0) s += l.pts[i].distanceTo(l.pts[i - 1]);
      t.subVectors(l.pts[Math.min(N - 1, i + 1)], l.pts[Math.max(0, i - 1)]).normalize();
      if (i === 0) n.copy(perp(t));
      else n.addScaledVector(t, -n.dot(t)).normalize();
      b.crossVectors(t, n).normalize();
      // The first ring sits on the parent's axis; keep it slim so its rim never breaks the parent's surface.
      const rad = l.rad[i] * (1 + collar * Math.exp(-s / (3 * l.rad[0] + 1e-4))) * (l.level > 0 && i === 0 ? 0.2 : 1);
      const c = o.color(l, i / (N - 1));
      const sw = o.sway(l.pts[i]);
      const ring: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const nn = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        ring.push(g.vert(l.pts[i].clone().addScaledVector(nn, rad), nn, (k / sides) * uRep, s / o.tile, c, l.birth, anchor, sw));
      }
      if (prev) for (let k = 0; k < sides; k++) g.quad(prev[k], ring[k], ring[k + 1], prev[k + 1]);
      prev = ring;
    }
  }
}

/** Scale finished geometry so its bounding box is exactly height x spread. */
export function fitBuilders(parts: GeoBuilder[], height: number, spread: number) {
  let maxY = 1e-3, minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const g of parts) {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]);
      maxX = Math.max(maxX, g.pos[i]);
      maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]);
      maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sx = spread / Math.max(1e-3, maxX - minX, maxZ - minZ), sy = height / maxY;
  for (const g of parts) {
    for (const arr of [g.pos, g.anchor]) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] *= sx;
        arr[i + 1] *= sy;
        arr[i + 2] *= sx;
      }
    }
  }
}

/** Fraction of vertices with birth 0 (for tuning how full the install plant is). */
export function earlyShare(g: GeoBuilder): number {
  let n = 0;
  for (const b of g.birth) if (b === 0) n++;
  return n / Math.max(1, g.birth.length);
}

/* ------------------------------------------------------------------ */
/* Bark painting                                                        */
/* ------------------------------------------------------------------ */

/** Run `fn` nine times, offset by the tile size, so shapes crossing an edge wrap around. */
export function tiled(g: CanvasRenderingContext2D, S: number, fn: () => void) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      g.save();
      g.translate(ox * S, oy * S);
      fn();
      g.restore();
    }
  }
}

const normalCache = new Map<string, THREE.Texture>();

/** A tiling normal map from a height painting (white = raised). */
export function normalFromHeight(key: string, S: number, strength: number, draw: (g: CanvasRenderingContext2D, S: number) => void): THREE.Texture {
  const hit = normalCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  draw(g, S);
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = d[i * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x + S - 1) % S)], rr = h[y * S + ((x + 1) % S)];
      const u = h[((y + S - 1) % S) * S + x], dn = h[((y + 1) % S) * S + x];
      const nx = -(rr - l) * strength, ny = (dn - u) * strength;
      const k = 1 / Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      d[i] = (nx * k * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * k * 0.5 + 0.5) * 255;
      d[i + 2] = (k * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  normalCache.set(key, t);
  return t;
}

/** An irregular closed blob path (bark plates, flakes, petals). */
export function blobPath(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rx: number, ry: number, rough = 0.25, n = 9) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * rough;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (i === 0) g.moveTo(mx, my);
    const c = pts[(i + 1) % n], e = pts[(i + 2) % n];
    g.quadraticCurveTo(c[0], c[1], (c[0] + e[0]) / 2, (c[1] + e[1]) / 2);
  }
  g.closePath();
}

/** A leaf outline with forward-pointing teeth, base at the origin, tip at (len, 0). */
export function serratePath(g: CanvasRenderingContext2D, len: number, wid: number, widest: number, teeth: number, depth = 0.14, tipPow = 1.35) {
  const half = (t: number) => (wid / 2) * (t < widest ? Math.pow(t / widest, 0.75) : Math.pow(1 - (t - widest) / (1 - widest), tipPow));
  const side: [number, number][] = [[len * 0.08, half(0.08)]];
  for (let k = 0; k < teeth; k++) {
    const t0 = lerp(0.16, 0.96, k / teeth), t1 = lerp(0.16, 0.96, (k + 0.92) / teeth);
    side.push([len * t0, half(t0) * (1 - depth)], [len * t1, half(t1) * (1 + depth)]);
  }
  g.beginPath();
  g.moveTo(0, 0);
  for (const [x, y] of side) g.lineTo(x, -y);
  g.lineTo(len, 0);
  for (let i = side.length - 1; i >= 0; i--) g.lineTo(side[i][0], side[i][1]);
  g.closePath();
}

/* ------------------------------------------------------------------ */
/* Foliage placement helpers                                            */
/* ------------------------------------------------------------------ */

export interface Crown {
  H: number;
  R: number;
  crownBase: number;
  center: THREE.Vector3;
  radii: THREE.Vector3;
  tInner: THREE.Color;
  tOuter: THREE.Color;
  tNew: THREE.Color;
}

/** Shared tint, facing, birth and direction rules for leaf cards in a crown. */
export function crownTools(r: () => number, c: Crown) {
  const depth = (at: THREE.Vector3) => canopyDepth(at, c.center, c.radii);
  const outward = (at: THREE.Vector3) => V(at.x, (at.y - c.center.y) * 0.6, at.z).normalize();
  return {
    depth,
    outward,
    /** Wind weight of the wood at a point. */
    sway: (q: THREE.Vector3) => clamp(Math.pow(Math.max(0, q.y) / c.H, 1.6) * 0.7 + (Math.hypot(q.x, q.z) / c.R) * 0.3),
    /** Vertex tint: darker and duller inside the crown, new-growth color at sunlit tips. */
    tint: (at: THREE.Vector3, tipness: number) => {
      const d = depth(at);
      const shade = lerp(0.5, 1, Math.pow(d, 1.6)) * lerp(0.8, 1, clamp((at.y - c.H * c.crownBase) / (c.H * 0.5)));
      return jitter(c.tInner.clone().lerp(c.tOuter, Math.pow(d, 1.3)).lerp(c.tNew, tipness * d * r() * 0.8), r, 0.012, 0.05, 0.05).multiplyScalar(shade);
    },
    /** Most leaves are as old as their twig; some outer ones fill in later. */
    birth: (b: number, at: THREE.Vector3, share = 0.84) => clamp(b + (r() < share ? 0 : 0.1 + r() * 0.5 * depth(at)), 0, 0.9),
    /** Upper side of a leaf card: up, leaning outward, with scatter. */
    face: (at: THREE.Vector3, lean: number, scatter: number) => UP.clone().addScaledVector(outward(at), lean).add(V((r() - 0.5) * scatter, 0, (r() - 0.5) * scatter)).normalize(),
    /** A direction leaving a twig sideways: `fwd` along the twig, `drop` up or down. */
    side: (d: THREE.Vector3, sgn: number, fwd: number, drop: number) => {
      const lat = V().crossVectors(d, UP);
      if (lat.lengthSq() < 0.01) lat.set(1, 0, 0);
      lat.normalize().multiplyScalar(sgn);
      return d.clone().multiplyScalar(fwd).addScaledVector(lat, 0.85).add(V(0, drop, 0)).normalize();
    },
  };
}

/** An irregular four-sided plate with slightly broken edges (scaly bark). */
export function platePath(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rx: number, ry: number, rough = 0.18) {
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    pts.push([a[0] * (1 + (r() - 0.5) * rough * 2), a[1] * (1 + (r() - 0.5) * rough * 2)]);
    for (const f of [0.35, 0.7]) pts.push([lerp(a[0], b[0], f) * (1 + (r() - 0.5) * rough), lerp(a[1], b[1], f) * (1 + (r() - 0.5) * rough)]);
  }
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * rx, cy + y * ry) : g.moveTo(cx + x * rx, cy + y * ry)));
  g.closePath();
}
