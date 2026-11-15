import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, deflect, leafTexture, lerp, perp, rng, tube } from '../kit';

/**
 * Shared code for the dense evergreen shrubs (boxwood, pittosporum, euonymus).
 *
 *  - leaf and sprig painters for the texture atlas
 *  - `Shape`: the outline of the shrub as an implicit surface, with sampling
 *  - `buildFrame`: stems, branches and twigs grown from the ground toward
 *    points on that surface, so the form is controlled and everything attaches
 *  - `shellSprigs`: the dense outer foliage layer
 */

/* ------------------------------------------------------------------ */
/* Colors                                                               */
/* ------------------------------------------------------------------ */

export function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), clamp(t)).getHexString();
}

/* ------------------------------------------------------------------ */
/* Leaf painter                                                         */
/* ------------------------------------------------------------------ */

export interface LeafStyle {
  /** Width profile along the leaf: w(t) ~ t^p (1-t)^q. Small q = rounded tip, big p = narrow base. */
  p: number;
  q: number;
  /** Width / length. */
  aspect: number;
  base: string;
  dark: string;
  /** New growth color. */
  light: string;
  midrib: string;
  midribW?: number;
  veins?: number;
  veinCol?: string;
  /** Edge waviness 0..0.2. */
  wavy?: number;
  /** Variegated margin color and how much of the half width the green center takes. */
  margin?: string;
  marginIn?: number;
  center2?: string;
  gloss?: number;
}

export interface LeafDraw {
  fresh?: number;
  /** -1 dark .. 1 light. */
  shade?: number;
  /** Width multiplier (a leaf seen partly edge-on). */
  squash?: number;
}

function trace(g: CanvasRenderingContext2D, len: number, hw: (t: number, side: number) => number, t0 = 0, t1 = 1) {
  const N = 26;
  g.beginPath();
  g.moveTo(len * t0, 0);
  for (let i = 1; i < N; i++) {
    const t = i / N;
    g.lineTo(len * lerp(t0, t1, t), -hw(t, -1));
  }
  g.lineTo(len * t1, 0);
  for (let i = N - 1; i >= 1; i--) {
    const t = i / N;
    g.lineTo(len * lerp(t0, t1, t), hw(t, 1));
  }
  g.closePath();
}

/** Paint one leaf with its base at (x, y), pointing along `rot`. */
export function paintLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, rot: number, st: LeafStyle, d: LeafDraw = {}) {
  const fresh = d.fresh ?? 0, shade = d.shade ?? 0;
  const hw = (len * st.aspect * (d.squash ?? 1)) / 2;
  const peak = Math.pow(st.p / (st.p + st.q), st.p) * Math.pow(st.q / (st.p + st.q), st.q);
  const prof = (t: number) => (Math.pow(t, st.p) * Math.pow(1 - t, st.q)) / peak;
  const ph1 = r() * 6.3, ph2 = r() * 6.3, wv = st.wavy ?? 0;
  const edge = (t: number, s: number) => hw * prof(t) * (1 + wv * Math.sin(t * 17 + (s > 0 ? ph1 : ph2)) + wv * 0.5 * Math.sin(t * 31 + ph1 * s));
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const body = mixHex(st.base, st.light, fresh);
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, mixHex(st.dark, body, 0.35));
  grad.addColorStop(0.45, body);
  grad.addColorStop(1, mixHex(body, st.light, 0.22));
  trace(g, len, edge);
  if (st.margin) {
    g.fillStyle = mixHex(st.margin, '#fff0a0', r() * 0.12 + fresh * 0.15);
    g.fill();
    g.save();
    g.clip();
    const k = (st.marginIn ?? 0.6) * (0.85 + r() * 0.3);
    const inner = (t: number, s: number) => hw * prof(lerp(0.02, 0.93, t)) * k * (1 + 0.16 * Math.sin(t * 9 + ph1 * s) + 0.1 * Math.sin(t * 23 + ph2));
    trace(g, len, inner, 0, 0.9);
    g.fillStyle = grad;
    g.fill();
    if (st.center2) {
      g.clip();
      g.fillStyle = st.center2;
      for (let i = 0; i < 5; i++) {
        g.globalAlpha = 0.35 + r() * 0.35;
        g.beginPath();
        g.ellipse(len * (0.15 + r() * 0.7), (r() - 0.5) * hw * 1.2, len * (0.06 + r() * 0.1), hw * (0.08 + r() * 0.14), (r() - 0.5) * 1.2, 0, 6.3);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    g.restore();
    trace(g, len, edge);
  } else {
    g.fillStyle = grad;
    g.fill();
  }
  g.save();
  g.clip();
  // One half slightly darker (the blade folds along the midrib), a gloss streak on the other.
  g.fillStyle = 'rgba(0,0,0,0.07)';
  g.fillRect(0, 0, len, hw * 1.3);
  const gl = st.gloss ?? 0.16;
  const gg = g.createLinearGradient(0, -hw * 0.95, 0, 0);
  gg.addColorStop(0, 'rgba(255,255,255,0)');
  gg.addColorStop(0.5, `rgba(255,255,240,${gl})`);
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gg;
  g.fillRect(len * 0.12, -hw, len * 0.76, hw);
  if (wv > 0) {
    // Ripples across a wavy leaf.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
      g.fillRect(len * (0.14 + i * 0.16), -hw, len * 0.08, hw * 2);
    }
  }
  if (st.veins) {
    g.strokeStyle = st.veinCol ?? 'rgba(255,255,255,0.12)';
    g.lineWidth = Math.max(0.6, len * 0.008);
    g.beginPath();
    for (let i = 1; i <= st.veins; i++) {
      const t = i / (st.veins + 1.2);
      for (const s of [-1, 1]) {
        g.moveTo(len * t, 0);
        g.quadraticCurveTo(len * (t + 0.08), s * hw * prof(t) * 0.5, len * (t + 0.16), s * hw * prof(Math.min(0.97, t + 0.16)) * 0.92);
      }
    }
    g.stroke();
  }
  if (shade !== 0) {
    g.fillStyle = shade < 0 ? `rgba(0,10,0,${-shade * 0.45})` : `rgba(235,255,170,${shade * 0.12})`;
    g.fillRect(0, -hw * 1.3, len, hw * 2.6);
  }
  g.restore();
  g.strokeStyle = st.midrib;
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.8, len * (st.midribW ?? 0.022));
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.93, 0);
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* Sprig painter                                                        */
/* ------------------------------------------------------------------ */

export interface SprigStyle {
  twig: string;
  /** Twig width and leaf length as fractions of the cell size. */
  twigW: number;
  leafLen: number;
  arrangement: 'opposite' | 'alternate' | 'whorl';
  /** Nodes on the main twig. */
  nodes: number;
  /** Leaf angle away from the twig, radians. */
  angle: number;
  /** Side twiglets. */
  side?: number;
  /** Twig length as a fraction of the cell (default 0.76). */
  height?: number;
  petiole?: number;
}

interface LeafJob { x: number; y: number; len: number; rot: number; d: LeafDraw }

/**
 * Paint a sprig in an S x S cell: twig base at the bottom center, growing up.
 * `fresh` 0..1 is how much new growth it carries, `shade` darkens the whole sprig.
 */
export function paintSprig(g: CanvasRenderingContext2D, r: () => number, S: number, leaf: LeafStyle, s: SprigStyle, fresh = 0.3, shade = 0) {
  const back: LeafJob[] = [], front: LeafJob[] = [];
  const strokes: { pts: number[]; w: number }[] = [];
  const twig = (x0: number, y0: number, ang: number, length: number, nodes: number, depth: number, w: number) => {
    const bend = (r() - 0.5) * 0.35;
    const mx = x0 + Math.cos(ang + bend) * length * 0.5, my = y0 + Math.sin(ang + bend) * length * 0.5;
    const x1 = x0 + Math.cos(ang) * length, y1 = y0 + Math.sin(ang) * length;
    strokes.push({ pts: [x0, y0, mx, my, x1, y1], w });
    const at = (t: number) => {
      const a = 1 - t;
      return [a * a * x0 + 2 * a * t * mx + t * t * x1, a * a * y0 + 2 * a * t * my + t * t * y1];
    };
    const sideAt = new Set<number>();
    if (depth === 0 && s.side) for (let i = 0; i < s.side; i++) sideAt.add(1 + Math.floor(r() * Math.max(1, nodes * 0.55)));
    const tipAng = Math.atan2(y1 - my, x1 - mx);
    for (let k = 0; k < nodes; k++) {
      const t = s.arrangement === 'whorl' ? 1 : (k + 0.9) / (nodes + 0.4);
      const [nx, ny] = at(t);
      const a0 = lerp(ang, tipAng, t);
      const fr = clamp(fresh * (0.25 + 1.1 * t * t) + (r() - 0.5) * 0.25);
      const L = S * s.leafLen * (0.8 + r() * 0.35) * lerp(0.9, 1, t) * (depth ? 0.9 : 1);
      const sh = shade + (r() - 0.5) * 0.3;
      if (s.arrangement === 'opposite') {
        if (k % 2 === 0) {
          for (const sd of [-1, 1]) front.push({ x: nx, y: ny, len: L, rot: a0 + sd * (s.angle + (r() - 0.5) * 0.3), d: { fresh: fr, shade: sh, squash: 0.7 + r() * 0.3 } });
        } else {
          back.push({ x: nx, y: ny, len: L * 0.62, rot: a0 + (r() - 0.5) * 1.6, d: { fresh: fr * 0.6, shade: sh - 0.45, squash: 1.15 } });
          front.push({ x: nx, y: ny, len: L * 0.6, rot: a0 + (r() - 0.5) * 1.2, d: { fresh: fr, shade: sh + 0.15, squash: 1.2 } });
        }
        if (sideAt.has(k)) for (const sd of r() < 0.5 ? [-1] : [1]) twig(nx, ny, a0 + sd * (0.6 + r() * 0.3), length * (0.34 + r() * 0.16), Math.max(2, Math.round(nodes * 0.45)), 1, w * 0.7);
      } else if (s.arrangement === 'alternate') {
        const sd = k % 2 ? 1 : -1;
        const fore = r();
        (fore < 0.25 ? back : front).push({ x: nx, y: ny, len: L * (fore < 0.25 ? 0.75 : 1), rot: a0 + sd * (s.angle + (r() - 0.5) * 0.5), d: { fresh: fr, shade: fore < 0.25 ? sh - 0.4 : sh, squash: 0.55 + r() * 0.5 } });
        if (sideAt.has(k)) twig(nx, ny, a0 - sd * (0.55 + r() * 0.35), length * (0.36 + r() * 0.2), Math.max(3, Math.round(nodes * 0.5)), 1, w * 0.7);
      } else {
        const n = 7 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const f = (i + r() * 0.5) / n - 0.5;
          const fore = Math.cos(f * Math.PI);
          (i % 3 === 0 ? back : front).push({ x: nx, y: ny, len: L * lerp(1, 0.72, fore * r()), rot: a0 + f * 3.6, d: { fresh: fr * (0.4 + 0.6 * r()), shade: sh - (i % 3 === 0 ? 0.35 : 0), squash: 0.75 + r() * 0.25 } });
        }
        for (let i = 0; i < 3; i++) front.push({ x: nx, y: ny, len: L * 0.5, rot: a0 + (r() - 0.5) * 1.6, d: { fresh: clamp(fresh + 0.3), shade: sh + 0.2, squash: 1 } });
      }
    }
    if (s.arrangement !== 'whorl') {
      // Terminal pair of young leaves.
      for (const sd of [-1, 1]) front.push({ x: x1, y: y1, len: S * s.leafLen * 0.72, rot: tipAng + sd * (0.3 + r() * 0.25), d: { fresh: clamp(fresh * 1.5), shade: shade + 0.15, squash: 0.8 } });
    }
  };
  twig(S / 2, S * 0.995, -Math.PI / 2 + (r() - 0.5) * 0.16, S * (s.height ?? 0.76), s.nodes, 0, S * s.twigW);
  const pet = S * (s.petiole ?? 0);
  const draw = (j: LeafJob) => paintLeaf(g, r, j.x + Math.cos(j.rot) * pet, j.y + Math.sin(j.rot) * pet, j.len, j.rot, leaf, j.d);
  back.forEach(draw);
  g.strokeStyle = s.twig;
  g.lineCap = 'round';
  for (const st of strokes) {
    g.lineWidth = Math.max(1, st.w);
    g.beginPath();
    g.moveTo(st.pts[0], st.pts[1]);
    g.quadraticCurveTo(st.pts[2], st.pts[3], st.pts[4], st.pts[5]);
    g.stroke();
  }
  if (pet > 0) {
    g.lineWidth = Math.max(1, S * s.twigW * 0.5);
    g.beginPath();
    for (const j of [...back, ...front]) {
      g.moveTo(j.x, j.y);
      g.lineTo(j.x + Math.cos(j.rot) * pet * 1.1, j.y + Math.sin(j.rot) * pet * 1.1);
    }
    g.stroke();
  }
  // Paint the front leaves from the twig base upward so the young tip leaves end on top.
  front.sort((a, b) => b.y - a.y).forEach(draw);
}

export type UV = [number, number, number, number];

/** An atlas of freely placed cells. Each cell is painted in its own clipped, translated frame. */
export function atlas(key: string, W: number, H: number, cells: { x: number; y: number; w: number; h: number; draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void }[]): { map: THREE.Texture; uv: UV[] } {
  const map = leafTexture(key, W, H, (g) => {
    const r = rng(key);
    for (const c of cells) {
      g.save();
      g.translate(c.x, c.y);
      g.beginPath();
      g.rect(1, 1, c.w - 2, c.h - 2);
      g.clip();
      c.draw(g, c.w, c.h, r);
      g.restore();
    }
  });
  const e = 1.5;
  return { map, uv: cells.map((c) => [(c.x + e) / W, 1 - (c.y + c.h - e) / H, (c.x + c.w - e) / W, 1 - (c.y + e) / H] as UV) };
}

export function simpleBark(key: string, base: string, dark: string, light: string, streaks = 700): THREE.Texture {
  return barkTexture(key, 256, (g, S) => {
    const r = rng(key);
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < streaks; i++) {
      const x = r() * S, y = r() * S, len = 6 + r() * 50;
      g.strokeStyle = r() < 0.55 ? dark : light;
      g.globalAlpha = 0.1 + r() * 0.25;
      g.lineWidth = 0.6 + r() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 5, y + len);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/* ------------------------------------------------------------------ */
/* Shape: the outline of the shrub                                      */
/* ------------------------------------------------------------------ */

/** `f(p) < 1` inside. Must be star-shaped around `c` (every ray from c leaves once). */
export interface Shape {
  f: (p: THREE.Vector3) => number;
  c: THREE.Vector3;
  /** Any distance from c that is surely outside. */
  bound: number;
}

export function surfAt(sh: Shape, d: THREE.Vector3): THREE.Vector3 {
  let a = 0, b = sh.bound;
  const p = V();
  for (let i = 0; i < 20; i++) {
    const m = (a + b) / 2;
    p.copy(sh.c).addScaledVector(d, m);
    if (sh.f(p) < 1) a = m;
    else b = m;
  }
  return sh.c.clone().addScaledVector(d, a);
}

export function normalAt(sh: Shape, p: THREE.Vector3): THREE.Vector3 {
  const e = 0.006, q = p.clone();
  const dx = sh.f(q.set(p.x + e, p.y, p.z)) - sh.f(q.set(p.x - e, p.y, p.z));
  const dy = sh.f(q.set(p.x, p.y + e, p.z)) - sh.f(q.set(p.x, p.y - e, p.z));
  const dz = sh.f(q.set(p.x, p.y, p.z + e)) - sh.f(q.set(p.x, p.y, p.z - e));
  const n = V(dx, dy, dz);
  return n.lengthSq() < 1e-12 ? p.clone().sub(sh.c).normalize() : n.normalize();
}

export interface SurfPt { p: THREE.Vector3; n: THREE.Vector3 }

/** `n` points spread evenly (by area) over the surface, above y = yMin. */
export function sampleSurface(r: () => number, sh: Shape, n: number, yMin = 0.02, jit = 0.05): SurfPt[] {
  const M = n * 3 + 40;
  const cand: { d: THREE.Vector3; w: number }[] = [];
  let total = 0;
  const off = r() * 6.2832;
  for (let i = 0; i < M; i++) {
    const y = 1 - (2 * (i + 0.5)) / M, rad = Math.sqrt(1 - y * y), az = i * 2.39996323 + off;
    const d = V(Math.cos(az) * rad, y, Math.sin(az) * rad);
    const p = surfAt(sh, d);
    if (p.y < yMin) continue;
    const t = p.distanceTo(sh.c);
    const w = (t * t) / Math.max(0.2, Math.abs(normalAt(sh, p).dot(d)));
    cand.push({ d, w });
    total += w;
  }
  const out: SurfPt[] = [];
  const step = total / n;
  let acc = 0, next = r() * step;
  for (const c of cand) {
    acc += c.w;
    while (next < acc && out.length < n) {
      next += step;
      const d = c.d.clone().add(V((r() - 0.5) * jit, (r() - 0.5) * jit, (r() - 0.5) * jit)).normalize();
      const p = surfAt(sh, d);
      if (p.y < yMin) p.y = yMin;
      out.push({ p, n: normalAt(sh, p) });
    }
  }
  return out;
}

/** Gentle bumps for natural (unsheared) outlines: about -1..1 as a function of direction. */
export function lumps(p: THREE.Vector3, c: THREE.Vector3, seed: number): number {
  const az = Math.atan2(p.z - c.z, p.x - c.x), y = p.y;
  return 0.55 * Math.sin(az * 3 + seed + y * 2.1) * Math.cos(y * 3.3 + seed * 1.7) + 0.45 * Math.sin(az * 5 - seed * 2.3 + y * 4.7);
}

/* ------------------------------------------------------------------ */
/* Frame: stems, branches, twigs                                        */
/* ------------------------------------------------------------------ */

export interface Br {
  pts: THREE.Vector3[];
  r0: number;
  r1: number;
  level: number;
  birth: number;
}

export interface FrameOpts {
  H: number;
  Sp: number;
  stems: number;
  /** Radius on the ground the stems come up within. */
  stemBaseR: number;
  stemR: number;
  /** How far toward the surface the stems run (0.6). */
  stemReach?: number;
  /** 0 straight, 0.3 rises first then leans out, negative spreads first. */
  arch?: number;
  /** Lowest surface height stems aim at, as a fraction of H. */
  stemYMin?: number;
  secs: number;
  secReach?: number;
  twigs: number;
  /** Twigs stop this far inside the surface (m). */
  twigInset?: number;
  early?: number;
  wobble?: number;
  /** Thickest a twig may be (m). */
  twigMaxR?: number;
  /** How freely branches pick an attach point other than the nearest (0 = always nearest). */
  attachSpread?: number;
}

function bez(r: () => number, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, n: number, wob: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const len = a.distanceTo(b);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const p = V().addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
    if (i > 0 && i < n) p.add(V((r() - 0.5) * wob * len, (r() - 0.5) * wob * len * 0.5, (r() - 0.5) * wob * len));
    pts.push(p);
  }
  return pts;
}

/** Index of the branch point nearest to `t` (skipping each branch's first `skip` points). */
function nearest(brs: Br[], t: THREE.Vector3, skip: number, r: () => number, spread: number): { b: number; i: number } {
  let best = Infinity, bb = 0, bi = 1;
  for (let b = 0; b < brs.length; b++) {
    const pts = brs[b].pts;
    for (let i = skip; i < pts.length; i++) {
      const d = pts[i].distanceToSquared(t) * (1 + spread * r());
      if (d < best) { best = d; bb = b; bi = i; }
    }
  }
  return { b: bb, i: bi };
}

export function buildFrame(r: () => number, sh: Shape, o: FrameOpts): { stems: Br[]; secs: Br[]; twigs: Br[] } {
  const late = (p: THREE.Vector3) => clamp(0.1 + 0.75 * (0.35 * r() + 0.65 * clamp((0.6 * p.y) / o.H + (0.4 * Math.hypot(p.x, p.z)) / (o.Sp / 2))), 0, 0.85);
  const wob = o.wobble ?? 0.08, arch = o.arch ?? 0.2;
  const stems: Br[] = [];
  for (const s of sampleSurface(r, sh, o.stems, o.H * (o.stemYMin ?? 0.2), 0.3)) {
    const hz = V(s.p.x, 0, s.p.z);
    const hl = hz.length() || 1;
    const b = hz.multiplyScalar((o.stemBaseR * (0.35 + r() * 0.65)) / hl).setY(-0.03);
    const e = b.clone().lerp(s.p, (o.stemReach ?? 0.6) * (0.9 + r() * 0.2));
    const c = V(lerp(b.x, e.x, 0.5 - arch), lerp(b.y, e.y, 0.5 + arch), lerp(b.z, e.z, 0.5 - arch));
    const rr = o.stemR * (0.75 + r() * 0.5);
    stems.push({ pts: bez(r, b, c, e, 6, wob), r0: rr, r1: rr * 0.42, level: 0, birth: 0 });
  }
  const grow = (parents: Br[], n: number, level: number, reach: number, inset: number, segs: number, skip: number, early: number): Br[] => {
    const out: Br[] = [];
    for (const s of sampleSurface(r, sh, n, 0.03, 0.08)) {
      const tgt = s.p.clone().addScaledVector(s.n, -inset);
      const hit = nearest(parents, tgt, skip, r, o.attachSpread ?? 0.5);
      const par = parents[hit.b];
      const i = Math.max(1, hit.i - 1);
      const a = par.pts[i];
      const e = a.clone().lerp(tgt, reach * (0.92 + r() * 0.16));
      e.y = Math.max(e.y, 0.02);
      // Leave the parent along its own direction, then turn toward the target.
      const pd = par.pts[i].clone().sub(par.pts[i - 1]).normalize();
      const c = a.clone().lerp(e, 0.5).addScaledVector(pd, a.distanceTo(e) * 0.22);
      c.y += a.distanceTo(e) * 0.08;
      const rAt = lerp(par.r0, par.r1, i / (par.pts.length - 1));
      const r0 = Math.min(level === 2 ? o.twigMaxR ?? 1 : 1, Math.max(0.0011, rAt * (level === 1 ? 0.62 : 0.6)));
      const birth = r() < early ? par.birth : Math.max(par.birth, late(e));
      out.push({ pts: bez(r, a, c, e, segs, wob * 1.3), r0, r1: Math.max(0.0008, r0 * 0.45), level, birth });
    }
    return out;
  };
  const secs = grow(stems, o.secs, 1, o.secReach ?? 0.72, 0, 3, 2, o.early ?? 0.82);
  const twigs = grow(secs, o.twigs, 2, 1, o.twigInset ?? 0.03, 2, 1, o.early ?? 0.82);
  return { stems, secs, twigs };
}

export function frameWood(
  g: GeoBuilder,
  fr: { stems: Br[]; secs: Br[]; twigs: Br[] },
  o: { color: (b: Br) => THREE.Color; sway: (p: THREE.Vector3) => number; twigFrac?: number; r: () => number; uvScale?: number; secSides?: number },
) {
  for (const b of [...fr.stems, ...fr.secs, ...fr.twigs]) {
    if (b.level === 2 && o.r() > (o.twigFrac ?? 1)) continue;
    tube(g, b.pts, b.r0, b.r1, b.level === 0 ? 6 : b.level === 1 ? o.secSides ?? 4 : 3, o.color(b), b.birth, b.pts[0], (i) => o.sway(b.pts[i]), o.uvScale ?? 1);
  }
}

/* ------------------------------------------------------------------ */
/* Foliage                                                              */
/* ------------------------------------------------------------------ */

/**
 * A sprig card (or single leaf) attached at `base`, running along `dir`,
 * facing `face`. Its shading normal is blended toward `nrm` by `nb`.
 */
export function sprigCard(
  g: GeoBuilder, base: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, len: number, wid: number, uv: UV,
  color: THREE.Color, birth: number, anchor: THREE.Vector3, nrm: THREE.Vector3, nb: number, s0: number, s1: number, curl = 0,
) {
  const d = dir.clone().normalize();
  const side = V().crossVectors(d, face);
  if (side.lengthSq() < 1e-4) side.copy(perp(d));
  side.normalize();
  const segs = curl ? 2 : 1;
  const p = base.clone();
  let pa = 0, pb = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    if (i > 0) {
      if (curl) d.applyAxisAngle(side, -curl / segs);
      p.addScaledVector(d, len / segs);
    }
    const n = V().crossVectors(side, d).multiplyScalar(1 - nb).addScaledVector(nrm, nb).normalize();
    const v = lerp(uv[1], uv[3], t), s = lerp(s0, s1, t);
    const a = g.vert(p.clone().addScaledVector(side, -wid / 2), n, uv[0], v, color, birth, anchor, s);
    const b = g.vert(p.clone().addScaledVector(side, wid / 2), n, uv[2], v, color, birth, anchor, s);
    if (i > 0) g.quad(pa, pb, b, a);
    pa = a;
    pb = b;
  }
}

/** Birth of the twig whose tip is nearest to p. */
export function twigBirthLookup(twigs: Br[]): (p: THREE.Vector3) => number {
  const n = twigs.length;
  const xs = new Float32Array(n * 3);
  twigs.forEach((t, i) => {
    const e = t.pts[t.pts.length - 1];
    xs[i * 3] = e.x; xs[i * 3 + 1] = e.y; xs[i * 3 + 2] = e.z;
  });
  return (p) => {
    let best = Infinity, bi = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i * 3] - p.x, dy = xs[i * 3 + 1] - p.y, dz = xs[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    return twigs[bi].birth;
  };
}

export interface ShellOpts {
  n: number;
  len: [number, number];
  /** Card width / length. */
  aspect?: number;
  /** Deepest a sprig sits under the surface (m). */
  inset: number;
  /** 0 = sprigs point straight out, 1 = they lie along the surface. */
  tangent: number;
  /** Lean of the sprigs toward the sky. */
  up?: number;
  /** Pick an atlas cell and a color from the depth (0 surface .. 1 deepest) and the position. */
  cell: (depth: number, p: THREE.Vector3) => UV;
  color: (depth: number, p: THREE.Vector3) => THREE.Color;
  nb?: number;
  curl?: number;
  yMin?: number;
  sway: (p: THREE.Vector3) => number;
  birth: (p: THREE.Vector3) => number;
  /** Share of sprigs that keep the birth of their twig (the rest come in later). */
  early?: number;
}

/** The dense outer foliage: sprig cards whose tips reach the surface of the shape. */
export function shellSprigs(g: GeoBuilder, r: () => number, sh: Shape, o: ShellOpts) {
  for (const s of sampleSurface(r, sh, o.n, o.yMin ?? 0.015, 0.03)) {
    const depth = o.early === 1 ? 0.25 + 0.75 * r() : Math.pow(r(), 1.8);
    const tip = s.p.clone().addScaledVector(s.n, -depth * o.inset);
    const ta = perp(s.n), tb = V().crossVectors(s.n, ta);
    const az = r() * 6.2832;
    const tan = ta.multiplyScalar(Math.cos(az)).addScaledVector(tb, Math.sin(az));
    const dir = s.n.clone().multiplyScalar(1 - o.tangent).addScaledVector(tan, o.tangent).add(V(0, o.up ?? 0.25, 0)).normalize();
    const len = lerp(o.len[0], o.len[1], r());
    const base = tip.clone().addScaledVector(dir, -len * 0.8);
    if (base.y < 0.008) base.y = 0.008;
    const face = s.n.clone().add(V((r() - 0.5) * 0.7, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7)).normalize();
    const b0 = o.birth(tip);
    const birth = r() < (o.early ?? 0.68) ? b0 : clamp(Math.max(b0, 0.1) + r() * 0.5, 0, 0.9);
    const sw = o.sway(base);
    sprigCard(g, base, dir, face, len, len * (o.aspect ?? 1), o.cell(depth, tip), o.color(depth, tip), birth, base, s.n, o.nb ?? 0.6, sw, clamp(sw + 0.12), o.curl ? o.curl * (0.4 + r()) : 0);
  }
}

export const swayFn = (H: number, Sp: number) => (p: THREE.Vector3) => clamp(0.75 * Math.pow(clamp(p.y / H), 1.4) + 0.25 * clamp(Math.hypot(p.x, p.z) / (Sp / 2)) * clamp(p.y / (H * 0.3)));

/**
 * A cluster of single leaves radiating from a twig tip: a whorl (golden-angle
 * spiral) or opposite pairs. Outer leaves come first and lie flatter.
 */
export function rosette(
  g: GeoBuilder, r: () => number, tip: THREE.Vector3, axis: THREE.Vector3, nrm: THREE.Vector3,
  o: { n: number; len: [number, number]; tilt: [number, number]; aspect: number; opposite?: boolean; curled?: number; curl?: number; nb?: number;
    uv: () => UV; color: (i: number) => THREE.Color; birth: number; sway: number },
) {
  const az0 = r() * 6.2832;
  for (let i = 0; i < o.n; i++) {
    const t = o.n > 1 ? i / (o.n - 1) : 0;
    const az = az0 + (o.opposite ? (i % 2) * Math.PI + Math.floor(i / 2) * 1.5708 : i * 2.39996) + (r() - 0.5) * 0.35;
    const dir = deflect(axis, lerp(o.tilt[0], o.tilt[1], t) + (r() - 0.5) * 0.25, az);
    const len = lerp(o.len[0], o.len[1], t) * (0.88 + r() * 0.24);
    const base = o.opposite ? tip.clone().addScaledVector(axis, -Math.floor((o.n - 1 - i) / 2) * o.len[0] * 0.35) : tip;
    sprigCard(g, base, dir, axis, len, len * o.aspect, o.uv(), o.color(i), o.birth, base, nrm, o.nb ?? 0.35, o.sway, clamp(o.sway + 0.05), i < (o.curled ?? 0) ? (o.curl ?? 0.5) * (0.6 + r() * 0.8) : 0);
  }
}

/** Tip position and direction of a branch. */
export function tipOf(b: Br): { p: THREE.Vector3; dir: THREE.Vector3 } {
  const e = b.pts[b.pts.length - 1];
  return { p: e, dir: e.clone().sub(b.pts[b.pts.length - 2]).normalize() };
}
