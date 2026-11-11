import type { Vec2 } from './types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(points: Vec2[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export const area = (poly: Vec2[]) => Math.abs(signedArea(poly));

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const b = bounds(poly);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx, qy = a[1] + t * dy;
  return Math.hypot(p[0] - qx, p[1] - qy);
}

/** Distance from p to the polygon outline. */
export function distToEdge(p: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Distance from p to an open polyline. */
export function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(p, pts[i], pts[i + 1]));
  return d;
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

/** Points every `step` meters along a polyline, with direction. */
export function samplePolyline(pts: Vec2[], step: number): { p: Vec2; dir: Vec2; t: number }[] {
  const out: { p: Vec2; dir: Vec2; t: number }[] = [];
  const total = polylineLength(pts);
  if (total <= 0) return out;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= 0) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let s = i === 0 ? 0 : step - (acc % step);
    if (s >= step) s = 0;
    for (; s <= len + 1e-6; s += step) {
      out.push({ p: [a[0] + dir[0] * s, a[1] + dir[1] * s], dir, t: (acc + s) / total });
    }
    acc += len;
  }
  return out;
}

/** Deterministic random numbers from a string or number seed. */
export function rng(seed: string | number): () => number {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  let a = h || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Even, jittered points inside a polygon at roughly `spacing` apart. */
export function scatterInPolygon(poly: Vec2[], spacing: number, seed: string, margin = 0): Vec2[] {
  const b = bounds(poly);
  const r = rng(seed);
  const out: Vec2[] = [];
  const rowH = spacing * 0.866;
  let row = 0;
  for (let y = b.minY + rowH / 2; y < b.maxY; y += rowH, row++) {
    const off = row % 2 ? spacing / 2 : 0;
    for (let x = b.minX + off + spacing / 2; x < b.maxX; x += spacing) {
      const p: Vec2 = [x + (r() - 0.5) * spacing * 0.35, y + (r() - 0.5) * spacing * 0.35];
      if (pointInPolygon(p, poly) && distToEdge(p, poly) >= margin) out.push(p);
    }
  }
  return out;
}

export const feet = (m: number) => m * 3.28084;
export const meters = (ft: number) => ft / 3.28084;

export function fmtFeet(m: number): string {
  const ft = feet(m);
  if (ft < 3) return `${Math.round(ft * 12)} in`;
  if (ft < 20) return `${ft.toFixed(1).replace(/\.0$/, '')} ft`;
  return `${Math.round(ft)} ft`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Nearest point on a polyline: distance, fraction along it (0 at the start), and direction there. */
export function projectOnPolyline(p: Vec2, pts: Vec2[]): { d: number; t: number; dir: Vec2; along: number; total: number } {
  const total = polylineLength(pts) || 1;
  let best = { d: Infinity, t: 0, dir: [1, 0] as Vec2, along: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const l = Math.sqrt(l2) || 1;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
    if (d < best.d) best = { d, t: (acc + u * l) / total, dir: [dx / l, dy / l], along: acc + u * l };
    acc += l;
  }
  return { ...best, total };
}

/** Waterfall layout for a stream or pondless run: drop positions and the water level along it. */
export function fallProfile(w: { kind: string; falls?: number; points?: Vec2[] }, base: number) {
  const n = Math.max(0, Math.round(w.falls ?? (w.kind === 'pondless' ? 3 : 2)));
  const stepH = 0.26;
  const end = w.kind === 'pondless' ? 0.82 : 1;
  const at = Array.from({ length: n }, (_, k) => ((k + 0.6) / (n + 0.4)) * end * 0.92);
  const level = (t: number) => base + stepH * at.filter((x) => x > t).length + (w.kind === 'pondless' ? 0.12 : 0);
  return { n, at, stepH, end, level, top: level(0) };
}
