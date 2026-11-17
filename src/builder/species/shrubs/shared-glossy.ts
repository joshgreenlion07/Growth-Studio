import * as THREE from 'three';
import { GeoBuilder, V, clamp, lerp, perp } from '../kit';
import { serratePath, tone } from './shared-shrubs-b';

/**
 * Shared code for the glossy-leaved shrubs: gardenia, sasanqua camellia and
 * xylosma.
 *
 *  - `paintGlossLeaf`: one leathery, glossy leaf on a canvas, with a sunken
 *    midrib, impressed (quilted) side veins, optional fine teeth and a
 *    specular streak.
 *  - `bloom`: a round flower as a few rings of geometry (a raised center, a
 *    cup or a flat disk) mapped onto a top-view flower painting.
 */

export interface GlossLeaf {
  /** Mature upper-side color, a darker shade (base and edges) and the new-growth color. */
  base: string;
  dark: string;
  fresh: string;
  /** Width / length. */
  aspect: number;
  /** Where along the length the leaf is widest (0.3 ovate .. 0.5 elliptic). */
  widest?: number;
  /** 0 blunt .. 1 drawn-out point. */
  tip?: number;
  /** Teeth per side and their depth (fraction of the half width); 0 for an entire margin. */
  teeth?: number;
  toothDepth?: number;
  /** Side vein pairs and how strongly they are sunken (0 flat .. 1 deeply quilted). */
  veins?: number;
  impressed?: number;
  /** Specular streak strength, 0..0.4. */
  gloss?: number;
  midrib?: string;
}

export interface LeafPaint {
  /** 0 mature .. 1 new growth. */
  fresh?: number;
  /** -1 dark .. 1 light. */
  shade?: number;
  /** Width multiplier (a leaf turned partly edge-on). */
  squash?: number;
}

/** Paint one leaf, base at (x, y), pointing along `rot` (canvas radians). */
export function paintGlossLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, rot: number, s: GlossLeaf, d: LeafPaint = {}) {
  const fr = clamp(d.fresh ?? 0), sh = d.shade ?? 0;
  const wid = len * s.aspect * (d.squash ?? 1);
  const hw = wid / 2;
  const widest = s.widest ?? 0.45, tip = s.tip ?? 0.6;
  const body = tone(s.base, s.fresh, fr);
  const dark = tone(s.dark, s.fresh, fr * 0.7);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const outline = () => serratePath(g, len, wid, widest, s.teeth || 40, s.teeth ? s.toothDepth ?? 0.05 : 0, tip);
  // Body: darker at the base and along the margins, one half a touch darker (the blade folds at the midrib).
  const gl = g.createLinearGradient(0, 0, len, 0);
  gl.addColorStop(0, tone(dark, body, 0.4));
  gl.addColorStop(0.35, body);
  gl.addColorStop(1, tone(body, s.fresh, 0.12 + fr * 0.2));
  outline();
  g.fillStyle = gl;
  g.fill();
  g.save();
  g.clip();
  const gw = g.createLinearGradient(0, -hw, 0, hw);
  gw.addColorStop(0, 'rgba(0,12,0,0.22)');
  gw.addColorStop(0.3, 'rgba(0,12,0,0)');
  gw.addColorStop(0.5, 'rgba(0,12,0,0)');
  gw.addColorStop(0.52, 'rgba(0,12,0,0.08)');
  gw.addColorStop(0.75, 'rgba(0,12,0,0.03)');
  gw.addColorStop(1, 'rgba(0,12,0,0.24)');
  g.fillStyle = gw;
  g.fillRect(0, -hw, len, wid);
  // Impressed side veins: a dark groove with a lit ridge beside it, and a soft bulge between veins.
  const pairs = s.veins ?? 0, imp = s.impressed ?? 0;
  if (pairs > 0) {
    const prof = (t: number) => (t < widest ? Math.pow(Math.sin((Math.PI / 2) * (t / widest)), 0.75) : Math.pow(Math.cos((Math.PI / 2) * ((t - widest) / (1 - widest))), lerp(0.6, 1.2, tip)));
    const vein = (t: number, side: number, off: number) => {
      const x0 = len * t, reach = hw * prof(Math.min(0.95, t + 0.12)) * 0.86;
      g.moveTo(x0 + off, 0);
      g.quadraticCurveTo(x0 + len * 0.05 + off, side * reach * 0.55, x0 + len * 0.14 + off, side * reach);
    };
    if (imp > 0) {
      // Bulges between the veins catch the light.
      for (let i = 0; i < pairs; i++) {
        const t = (i + 0.75) / (pairs + 0.6);
        for (const side of [-1, 1]) {
          g.fillStyle = `rgba(230,255,200,${0.07 * imp})`;
          g.beginPath();
          g.ellipse(len * (t + 0.06), side * hw * prof(t) * 0.45, len * 0.05, hw * prof(t) * 0.26, side * -0.5, 0, 6.3);
          g.fill();
        }
      }
    }
    g.lineCap = 'round';
    g.strokeStyle = `rgba(0,14,0,${0.18 + 0.4 * imp})`;
    g.lineWidth = Math.max(0.8, len * 0.011 * (0.6 + imp));
    g.beginPath();
    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.5) / (pairs + 0.6);
      for (const side of [-1, 1]) vein(t, side, 0);
    }
    g.stroke();
    if (imp > 0) {
      g.strokeStyle = `rgba(220,245,190,${0.16 * imp})`;
      g.lineWidth = Math.max(0.6, len * 0.006);
      g.beginPath();
      for (let i = 0; i < pairs; i++) {
        const t = (i + 0.5) / (pairs + 0.6);
        for (const side of [-1, 1]) vein(t, side, len * 0.012);
      }
      g.stroke();
    }
  }
  // Gloss: a broad soft highlight along one half and a thin sharp one near the midrib.
  const gs = s.gloss ?? 0.2;
  g.fillStyle = `rgba(245,255,235,${gs * 0.55})`;
  g.beginPath();
  g.ellipse(len * 0.55, -hw * 0.38, len * 0.34, hw * 0.2, -0.04, 0, 6.3);
  g.fill();
  g.fillStyle = `rgba(250,255,245,${gs * 0.5})`;
  g.beginPath();
  g.ellipse(len * 0.5, -hw * 0.12, len * 0.3, hw * 0.05, 0, 0, 6.3);
  g.fill();
  if (sh !== 0) {
    g.fillStyle = sh < 0 ? `rgba(0,8,0,${-sh * 0.5})` : `rgba(235,255,190,${sh * 0.14})`;
    g.fillRect(0, -hw, len, wid);
  }
  g.restore();
  // Rim.
  outline();
  g.strokeStyle = 'rgba(8,20,6,0.45)';
  g.lineWidth = Math.max(0.8, len * 0.008);
  g.stroke();
  // Sunken midrib: a dark groove and a pale rib in it.
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,12,0,0.35)';
  g.lineWidth = Math.max(1, len * 0.022);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.94, 0);
  g.stroke();
  g.strokeStyle = s.midrib ?? 'rgba(190,210,140,0.8)';
  g.lineWidth = Math.max(0.8, len * 0.011);
  g.beginPath();
  g.moveTo(-len * 0.02, 0);
  g.lineTo(len * 0.9, 0);
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* Flowers as geometry                                                  */
/* ------------------------------------------------------------------ */

export interface Ring {
  /** Radius as a fraction of R. Rings go from the center outward. */
  r: number;
  /** Height along the flower's normal, as a fraction of R. */
  h: number;
  /** Texture radius as a fraction of the painted flower radius (default = r). */
  uvR?: number;
}

/**
 * A round flower facing `n`: a center vertex at height `centerH` (fraction
 * of R) and rings of `segs` vertices. The texture is a top-view painting of
 * the flower filling the uv cell; each ring samples it at its own radius.
 */
export function bloom(
  g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, R: number, rings: Ring[], centerH: number, segs: number,
  uv: [number, number, number, number], color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number, roll: number,
) {
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
  const ci = g.vert(c.clone().addScaledVector(n, centerH * R), n, um, vm, color.clone().multiplyScalar(0.9), birth, anchor, sway);
  let prev: number[] | null = null;
  rings.forEach((ring, k) => {
    const row: number[] = [];
    const shade = lerp(0.86, 1, k / Math.max(1, rings.length - 1));
    for (let i = 0; i < segs; i++) {
      const t = roll + (i / segs) * Math.PI * 2;
      const rad = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t));
      const p = c.clone().addScaledVector(rad, ring.r * R).addScaledVector(n, ring.h * R);
      const tt = (i / segs) * Math.PI * 2, ruv = ring.uvR ?? ring.r;
      const nn = n.clone().multiplyScalar(0.8).addScaledVector(rad, 0.35).normalize();
      row.push(g.vert(p, nn, um + Math.cos(tt) * ur * ruv, vm + Math.sin(tt) * vr * ruv, color.clone().multiplyScalar(shade), birth, anchor, sway));
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      if (!prev) g.tri(ci, row[i], row[j]);
      else g.quad(prev[i], row[i], row[j], prev[j]);
    }
    prev = row;
  });
}

/** Leaf face for a leaf leaving a shoot along `dir`: its upper side turns toward the shoot axis (and the sky). */
export function leafFace(dir: THREE.Vector3, axis: THREE.Vector3, out: THREE.Vector3, outW = 0.3): THREE.Vector3 {
  const f = axis.clone().addScaledVector(dir, -axis.dot(dir));
  if (f.lengthSq() < 1e-4) f.copy(perp(dir));
  f.normalize().addScaledVector(out, outW).add(V(0, 0.2, 0));
  const d = f.addScaledVector(dir, -f.dot(dir));
  return d.lengthSq() < 1e-6 ? perp(dir) : d.normalize();
}

/* ------------------------------------------------------------------ */
/* Leafy sprays                                                         */
/* ------------------------------------------------------------------ */

export interface SprayStyle {
  twig: string;
  /** Twig width and leaf length, as fractions of the cell height. */
  twigW: number;
  leafLen: number;
  /** Leaves on the main twig (alternate, two-ranked). */
  nodes: number;
  /** Leaf angle away from the twig, radians. */
  angle: number;
  /** Twig length as a fraction of the cell height (default 0.85). */
  height?: number;
  /** Zigzag of the twig between nodes, as a fraction of the cell width. */
  zigzag?: number;
  /** Side shoots off the main twig. */
  side?: number;
  petiole?: number;
}

export interface SprayPaint {
  /** New growth toward the tip, 0..1. */
  fresh?: number;
  /** -1 dark .. 1 light, for the whole spray. */
  shade?: number;
  /** Extra things painted on top at each leaf axil near the tip (buds, prickles). */
  axil?: (x: number, y: number, ang: number, k: number, n: number) => void;
}

/**
 * A spray of alternate leaves on a twig, seen from above, painted in a W x H
 * cell: twig base at the bottom center, growing up. The leaves spread in one
 * plane like a real two-ranked spray; some lie behind the twig, darker.
 */
export function paintSpray(g: CanvasRenderingContext2D, r: () => number, W: number, H: number, leaf: GlossLeaf, s: SprayStyle, o: SprayPaint = {}) {
  type Job = { x: number; y: number; len: number; rot: number; fresh: number; shade: number; squash: number };
  const back: Job[] = [], front: Job[] = [];
  const strokes: { pts: [number, number][]; w: number }[] = [];
  const axils: { x: number; y: number; ang: number; k: number; n: number }[] = [];
  const fresh = o.fresh ?? 0, shade0 = o.shade ?? 0;
  const twig = (x0: number, y0: number, ang: number, length: number, nodes: number, depth: number, w: number) => {
    const pts: [number, number][] = [[x0, y0]];
    const bend = (r() - 0.5) * 0.5;
    const zz = (s.zigzag ?? 0) * W;
    let x = x0, y = y0, a = ang;
    const step = length / (nodes + 0.6);
    const sideAt = new Set<number>();
    if (depth === 0) for (let i = 0; i < (s.side ?? 0); i++) sideAt.add(1 + Math.floor(r() * Math.max(1, nodes * 0.6)));
    for (let k = 0; k < nodes; k++) {
      const sd = k % 2 ? 1 : -1;
      a += (bend / nodes) + sd * (zz ? 0.12 : 0);
      x += Math.cos(a) * step + sd * zz * 0.5;
      y += Math.sin(a) * step;
      pts.push([x, y]);
      const t = (k + 1) / nodes;
      const fr = clamp(fresh * Math.pow(t, 2.2) * 1.15 + (r() - 0.5) * 0.12);
      const L = H * s.leafLen * (0.82 + r() * 0.3) * lerp(1, 0.72, Math.pow(t, 1.5)) * (depth ? 0.88 : 1);
      const rot = a + sd * (s.angle + (r() - 0.5) * 0.35) * lerp(1, 0.75, t);
      const behind = r() < 0.22;
      (behind ? back : front).push({ x, y, len: L * (behind ? 0.85 : 1), rot, fresh: fr, shade: shade0 + (behind ? -0.45 : (r() - 0.5) * 0.3), squash: 0.65 + r() * 0.4 });
      axils.push({ x, y, ang: a, k, n: nodes });
      if (sideAt.has(k)) twig(x, y, a - sd * (0.6 + r() * 0.3), length * (0.4 + r() * 0.15), Math.max(2, Math.round(nodes * 0.45)), 1, w * 0.7);
    }
    // A terminal leaf and bud.
    x += Math.cos(a) * step * 0.4;
    y += Math.sin(a) * step * 0.4;
    pts.push([x, y]);
    front.push({ x, y, len: H * s.leafLen * 0.6, rot: a + (r() - 0.5) * 0.3, fresh: clamp(fresh * 1.2), shade: shade0 + 0.1, squash: 0.8 });
    strokes.push({ pts, w });
  };
  twig(W / 2, H - 2, -Math.PI / 2 + (r() - 0.5) * 0.2, H * (s.height ?? 0.85), s.nodes, 0, H * s.twigW);
  const pet = H * (s.petiole ?? 0.02);
  const draw = (j: Job) => paintGlossLeaf(g, r, j.x + Math.cos(j.rot) * pet, j.y + Math.sin(j.rot) * pet, j.len, j.rot, leaf, { fresh: j.fresh, shade: j.shade, squash: j.squash });
  back.forEach(draw);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const st of strokes) {
    g.strokeStyle = s.twig;
    g.lineWidth = Math.max(1.2, st.w);
    g.beginPath();
    g.moveTo(st.pts[0][0], st.pts[0][1]);
    for (const [x, y] of st.pts.slice(1)) g.lineTo(x, y);
    g.stroke();
  }
  g.strokeStyle = s.twig;
  g.lineWidth = Math.max(1, H * s.twigW * 0.55);
  g.beginPath();
  for (const j of [...back, ...front]) {
    g.moveTo(j.x, j.y);
    g.lineTo(j.x + Math.cos(j.rot) * pet * 1.2, j.y + Math.sin(j.rot) * pet * 1.2);
  }
  g.stroke();
  // Front leaves from the base up, so the young tip leaves end on top.
  front.sort((a, b) => b.y - a.y).forEach(draw);
  if (o.axil) for (const a of axils) o.axil(a.x, a.y, a.ang, a.k, a.n);
}
