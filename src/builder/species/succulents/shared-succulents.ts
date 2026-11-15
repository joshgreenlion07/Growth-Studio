import * as THREE from 'three';
import { GeoBuilder, V, clamp, lerp } from '../kit';

/**
 * Shared pieces for the succulents: a solid (thick, guttered) leaf mesher for
 * agave and yucca leaves, a size fitter, and canvas painters for the leaf
 * skin (bloom, streaks, bud imprints, margins).
 */

/* ------------------------------------------------------------------ */
/* Solid leaf                                                           */
/* ------------------------------------------------------------------ */

export interface SolidLeafSpec {
  base: THREE.Vector3;
  /** Compass direction the leaf points away from the rosette axis, radians. */
  az: number;
  /** Angle from vertical at the base: 0 straight up, PI / 2 level. */
  theta: number;
  /** Blade length (the tip or spine adds `tipLen`). */
  len: number;
  /** Half width, thickness (at the midrib) and cupping (edge rise as a fraction of half width) at t = 0..1. */
  halfWidth: (t: number) => number;
  thick: (t: number) => number;
  cup: (t: number) => number;
  /** Bend rate at t (radians per unit t). Positive droops outward and down, negative curves up and in. */
  bend?: (t: number) => number;
  /** Total roll about the leaf axis and sideways sweep over the length, radians. */
  twist?: number;
  yaw?: number;
  segs: number;
  /** Points across each face: 3 (V gutter) or 5 (rounded gutter and keel). */
  cols: 3 | 5;
  /** Length of the terminal spine or soft tip past the blade. */
  tipLen: number;
  /** u range of the upper and lower face in the texture. v runs base 0 to `vBlade` at the blade end, 1 at the tip. */
  uvTop: [number, number];
  uvBot: [number, number];
  vBlade?: number;
  color: THREE.Color;
  /** Brightness along the leaf (shade the base, deep in the rosette). */
  shade?: (t: number) => number;
  birth: number;
  anchor: THREE.Vector3;
  sway0: number;
  sway1: number;
}

export interface LeafStation {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  hw: number;
  t: number;
  sway: number;
}

/**
 * A thick leaf with a concave upper face and a keeled lower face, built as a
 * closed shell so its edges and tip read as solid. Returns the stations along
 * its midrib (for attaching threads, pups and the like).
 */
export function solidLeaf(g: GeoBuilder, o: SolidLeafSpec): LeafStation[] {
  const out = V(Math.cos(o.az), 0, Math.sin(o.az));
  const side = V(-Math.sin(o.az), 0, Math.cos(o.az));
  const d = V(0, 1, 0).multiplyScalar(Math.cos(o.theta)).addScaledVector(out, Math.sin(o.theta)).normalize();
  let n = V().crossVectors(side, d).normalize();
  const p = o.base.clone();
  const cols = o.cols;
  const vB = o.vBlade ?? 0.94;
  const v0 = g.count, i0 = g.idx.length;
  const top: number[][] = [], bot: number[][] = [];
  const stations: LeafStation[] = [];
  const step = o.len / o.segs;
  const c = new THREE.Color();
  const zero = V(0, 1, 0);
  for (let i = 0; i <= o.segs; i++) {
    const t = i / o.segs;
    if (i > 0) {
      const tm = (i - 0.5) / o.segs;
      if (o.bend) d.applyAxisAngle(side, -o.bend(tm) / o.segs);
      if (o.yaw) d.applyAxisAngle(n, o.yaw / o.segs);
      if (o.twist) side.applyAxisAngle(d, o.twist / o.segs);
      d.normalize();
      side.addScaledVector(d, -side.dot(d)).normalize();
      n = V().crossVectors(side, d).normalize();
      p.addScaledVector(d, step);
    }
    const hw = o.halfWidth(t), th = o.thick(t), cup = o.cup(t);
    const sw = lerp(o.sway0, o.sway1, t);
    c.copy(o.color).multiplyScalar(o.shade ? o.shade(t) : 1);
    stations.push({ p: p.clone(), dir: d.clone(), side: side.clone(), up: n.clone(), hw, t, sway: sw });
    const rt: number[] = [], rb: number[] = [];
    for (let k = 0; k < cols; k++) {
      const x = (k / (cols - 1)) * 2 - 1;
      const q = p.clone().addScaledVector(side, x * hw).addScaledVector(n, cup * hw * (x * x - 0.5));
      rt.push(g.vert(q, zero, lerp(o.uvTop[0], o.uvTop[1], (x + 1) / 2), t * vB, c, o.birth, o.anchor, sw));
      const qb = q.clone().addScaledVector(n, -th * Math.sqrt(Math.max(0, 1 - x * x)));
      rb.push(g.vert(qb, zero, lerp(o.uvBot[0], o.uvBot[1], (x + 1) / 2), t * vB, c, o.birth, o.anchor, sw));
    }
    top.push(rt);
    bot.push(rb);
  }
  for (let i = 0; i < o.segs; i++) {
    for (let k = 0; k < cols - 1; k++) {
      g.quad(top[i][k], top[i][k + 1], top[i + 1][k + 1], top[i + 1][k]);
      g.quad(bot[i][k + 1], bot[i][k], bot[i + 1][k], bot[i + 1][k + 1]);
    }
  }
  // Tip: a short cone (spine or soft point) closing the shell.
  const tipP = p.clone().addScaledVector(d, o.tipLen);
  c.copy(o.color).multiplyScalar(o.shade ? o.shade(1) : 1);
  const tt = g.vert(tipP, zero, (o.uvTop[0] + o.uvTop[1]) / 2, 1, c, o.birth, o.anchor, o.sway1);
  const tb = g.vert(tipP, zero, (o.uvBot[0] + o.uvBot[1]) / 2, 1, c, o.birth, o.anchor, o.sway1);
  const L = o.segs;
  for (let k = 0; k < cols - 1; k++) {
    g.tri(top[L][k], top[L][k + 1], tt);
    g.tri(bot[L][k + 1], bot[L][k], tb);
  }
  smoothNormals(g, v0, i0);
  return stations;
}

/** Area-weighted vertex normals for the triangles added since (v0, i0). */
export function smoothNormals(g: GeoBuilder, v0: number, i0: number) {
  const P = g.pos, N = g.nor;
  for (let i = v0 * 3; i < N.length; i++) N[i] = 0;
  for (let i = i0; i < g.idx.length; i += 3) {
    const a = g.idx[i] * 3, b = g.idx[i + 1] * 3, c = g.idx[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const k of [a, b, c]) {
      N[k] += nx;
      N[k + 1] += ny;
      N[k + 2] += nz;
    }
  }
  for (let i = v0 * 3; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l;
    N[i + 1] /= l;
    N[i + 2] /= l;
  }
}

/**
 * Blade outline as a fraction of the maximum width: `baseFrac` wide at the
 * base, widest at `tm`, tapering to `tipMin` at the end. `tipPow` above 1
 * keeps the blade wide longer and then narrows fast (a sword); below 1 gives
 * a long drawn-out point.
 */
export function bladeProfile(t: number, tm: number, baseFrac: number, tipPow: number, tipMin = 0.06): number {
  if (t < tm) return lerp(baseFrac, 1, Math.sin((Math.PI / 2) * (t / tm)));
  const u = (t - tm) / (1 - tm);
  return Math.max(tipMin, 1 - Math.pow(u, tipPow));
}

/** Scale finished geometry so its bounding box is exactly height x spread. */
export function fitGeo(parts: GeoBuilder[], height: number, spread: number) {
  let maxY = 0.001, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const g of parts) {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]);
      maxX = Math.max(maxX, g.pos[i]);
      maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]);
      maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sx = spread / Math.max(0.001, maxX - minX, maxZ - minZ), sy = height / maxY;
  for (const g of parts) {
    for (const arr of [g.pos, g.anchor]) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] *= sx;
        arr[i + 1] *= sy;
        arr[i + 2] *= sx;
      }
    }
  }
  return { sx, sy };
}

/* ------------------------------------------------------------------ */
/* Leaf skin painting                                                   */
/* ------------------------------------------------------------------ */

export interface SkinOpts {
  r: () => number;
  /** Colors from the leaf base to the blade end. */
  ramp: string[];
  /** Fine lengthwise fibers. */
  streaks?: { n: number; dark: string; light: string; alpha: number };
  /** Powdery bloom: soft pale blotches. */
  bloom?: { n: number; color: string; alpha: number; size: number };
  /** Bud imprints: pale and dark outlines left by the neighboring leaves in the bud. */
  imprints?: { n: number; light: string; dark: string; alpha: number };
  /** Margin bands from the edge inward: width as a fraction of the face width. */
  margin?: { w: number; color: string }[];
  /** How much the margin widens (relative to the narrowing blade) toward the tip. */
  marginFlare?: number;
  /** Tip or spine color, painted over the top `tipFrac` of the strip. */
  tip?: { color: string; frac: number; soft: number };
  /** Anything else, drawn before the margin and tip. */
  extra?: (g: CanvasRenderingContext2D, x0: number, w: number, h: number) => void;
}

/** Paint one face of a leaf into the strip x0..x0+w, base at the canvas bottom, tip at the top. */
export function paintSkin(g: CanvasRenderingContext2D, x0: number, w: number, h: number, o: SkinOpts) {
  const r = o.r;
  g.save();
  g.beginPath();
  g.rect(x0, 0, w, h);
  g.clip();
  const grad = g.createLinearGradient(0, h, 0, 0);
  o.ramp.forEach((c, i) => grad.addColorStop(i / (o.ramp.length - 1), c));
  g.fillStyle = grad;
  g.fillRect(x0, 0, w, h);
  if (o.bloom) {
    for (let i = 0; i < o.bloom.n; i++) {
      const x = x0 + r() * w, y = r() * h, s = o.bloom.size * (0.4 + r() * 1.2);
      const rg = g.createRadialGradient(x, y, 0, x, y, s);
      rg.addColorStop(0, o.bloom.color);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = o.bloom.alpha * (0.4 + r() * 0.6);
      g.fillStyle = rg;
      g.save();
      g.translate(x, y);
      g.scale(1, 2.5 + r() * 3);
      g.translate(-x, -y);
      g.fillRect(x - s, y - s, s * 2, s * 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  if (o.streaks) {
    for (let i = 0; i < o.streaks.n; i++) {
      const x = x0 + r() * w, y = r() * h, len = h * (0.05 + r() * 0.3);
      g.strokeStyle = r() < 0.5 ? o.streaks.dark : o.streaks.light;
      g.globalAlpha = o.streaks.alpha * (0.3 + r() * 0.7);
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - len);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (o.imprints) {
    // Each imprint is the outline of a neighbor leaf's edge and tip pressed into this one.
    for (let i = 0; i < o.imprints.n; i++) {
      const yTip = h * (0.12 + ((i + r() * 0.8) / o.imprints.n) * 0.7);
      const cx = x0 + w * (0.5 + (r() - 0.5) * 0.5);
      const reach = h * (0.25 + r() * 0.25), spread = w * (0.55 + r() * 0.5);
      for (const [colr, off, lw] of [[o.imprints.light, 0, 2.2], [o.imprints.dark, 2.5, 1.4]] as [string, number, number][]) {
        g.strokeStyle = colr;
        g.globalAlpha = o.imprints.alpha * (0.5 + r() * 0.5);
        g.lineWidth = lw * (w / 256);
        g.beginPath();
        g.moveTo(cx - spread, yTip + reach + off);
        g.bezierCurveTo(cx - spread * 0.55, yTip + reach * 0.35 + off, cx - spread * 0.12, yTip + reach * 0.05 + off, cx, yTip + off);
        g.bezierCurveTo(cx + spread * 0.12, yTip + reach * 0.05 + off, cx + spread * 0.55, yTip + reach * 0.35 + off, cx + spread, yTip + reach + off);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  if (o.extra) o.extra(g, x0, w, h);
  if (o.margin) {
    const flare = o.marginFlare ?? 2;
    const rows = 64;
    let acc = 0;
    const total = o.margin.reduce((s, m) => s + m.w, 0);
    for (let mi = o.margin.length - 1; mi >= 0; mi--) {
      // Paint inner bands first so the outer ones lie over them.
      const inner = total - acc;
      acc += o.margin[mi].w;
      g.fillStyle = o.margin[mi].color;
      for (const s of [0, 1]) {
        g.beginPath();
        const edge = s ? x0 + w : x0, sgn = s ? -1 : 1;
        g.moveTo(edge, h);
        for (let k = 0; k <= rows; k++) {
          const v = k / rows;
          const wob = 1 + Math.sin(k * 0.9 + mi * 3 + s * 5) * 0.05;
          g.lineTo(edge + sgn * w * Math.min(0.5, inner * (1 + flare * Math.pow(v, 4)) * wob), h * (1 - v));
        }
        g.lineTo(edge, 0);
        g.closePath();
        g.fill();
      }
    }
  }
  if (o.tip) {
    const y1 = h * o.tip.frac, y2 = h * (o.tip.frac + o.tip.soft);
    g.fillStyle = o.tip.color;
    g.fillRect(x0, 0, w, y1 + 1);
    // Fade out in bands below the solid tip.
    for (let k = 0; k < 16; k++) {
      g.globalAlpha = 1 - (k + 0.5) / 16;
      g.fillRect(x0, y1 + ((y2 - y1) * k) / 16, w, (y2 - y1) / 16 + 1);
    }
    g.globalAlpha = 1;
  }
  g.restore();
}

/** Golden angle, the divergence between successive leaves in a spiral rosette. */
export const GOLDEN = 2.399963;

/** Wind weight for a stiff rosette: nothing at the core, a little at the leaf tips. */
export function tipSway(y: number, rad: number, H: number, Sp: number): number {
  return clamp(0.35 * (y / H) + 0.45 * (rad / (Sp / 2)));
}
