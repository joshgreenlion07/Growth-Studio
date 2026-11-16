import * as THREE from 'three';
import { materialById } from '../siteplan/catalog';
import { pointInPolygon } from '../siteplan/geometry';
import type { LineItem, Vec2, Zone } from '../siteplan/types';

/**
 * Where a wall or curb is built along its drawn line, and its body as one continuous mitered
 * ribbon. The drawn line usually is the edge of a surface (a patio's curved edge, a bed's outline);
 * the body moves sideways onto the surface that matters less so the other stays in view. The side
 * is decided per stretch along the whole line, not per segment, so a curve sampled every few inches
 * stays one smooth body instead of short pieces that each pick their own side.
 */

/** Thickness in meters of a line that is built as a solid body: a wall or a concrete curb. 0 for the rest. */
export function lineThickness(l: LineItem): number {
  const spec = materialById.get(l.catalogId);
  if (l.kind === 'wall') return (spec?.wall?.face ?? 'splitFace') === 'plaster' ? 0.25 : 0.3;
  if (l.kind === 'edging' && spec?.recipe === 'curb') return 0.15;
  return 0;
}

/**
 * How much a surface must stay in view at a point, for choosing the side of a boundary a wall
 * stands on: paving first (raised paving above lower paving), then lawn, then beds and gravel,
 * then bare ground. Paving is a slab that covers any zone drawn over it, so it counts wherever
 * it is; among the other zones the later one wins, as on the ground.
 */
function surfaceRank(zones: Zone[], p: Vec2): number {
  let paving = 0, top: Zone | null = null;
  for (const z of zones) {
    if (!pointInPolygon(p, z.polygon)) continue;
    if (z.kind === 'hardscape') paving = Math.max(paving, 3 + (z.elevation ?? 0));
    top = z;
  }
  return paving || (top ? (top.kind === 'turf' ? 2 : 1) : 0);
}

/**
 * A line ready to build: its points (the drawn points plus a few added where the body eases from
 * one side to the other) and, at each point, how far the body's center sits off the drawn line
 * along the left normal, arriving (dIn) and leaving (dOut). The two differ only at a sharp corner
 * where the body switches sides.
 */
export interface LinePath {
  pts: Vec2[];
  dIn: number[];
  dOut: number[];
  /** The run repeats its first point as its last, and is joined there. */
  closed: boolean;
  /** Body thickness, and the offset of a body moved fully to one side (its face just off the line). */
  thick: number;
  move: number;
}

const SHARP = Math.cos((30 * Math.PI) / 180); // a turn sharper than 30 degrees is a corner
const MITER_LIMIT = 2.5; // past this the outer corner is beveled
const INNER_LIMIT = 6;

/**
 * The path of a wall or curb (see LinePath). Fences, steel edging and other thin lines stay on the
 * drawn line. The sides are read a little off the line every few inches; runs of the same verdict
 * shorter than about a meter (3 m for runs that see the same surface on both sides) join their
 * neighbors (the longer one, or both when they agree), so a stretch that borders the same surfaces
 * is one decision. Where the verdict really changes, the body
 * eases across over most of a meter, or switches at once on a nearby sharp corner.
 */
export function linePath(l: LineItem, zones: Zone[]): LinePath {
  const thick = lineThickness(l);
  const move = thick ? thick / 2 + 0.004 : 0;
  const pts: Vec2[] = [];
  for (const p of l.points) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) pts.push([p[0], p[1]]);
  }
  const n = pts.length;
  const closed = n > 3 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.01;
  if (closed) pts[n - 1] = [pts[0][0], pts[0][1]];
  if (n < 2 || !thick) return { pts, dIn: pts.map(() => 0), dOut: pts.map(() => 0), closed, thick, move };

  // Arc length at each point, segment directions and the sharp corners.
  const S = [0];
  const dirs: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    S.push(S[i] + len);
    dirs.push([(b[0] - a[0]) / len, (b[1] - a[1]) / len]);
  }
  const total = S[n - 1];
  const sharp: number[] = [];
  for (let i = 1; i < n - 1; i++) if (dirs[i - 1][0] * dirs[i][0] + dirs[i - 1][1] * dirs[i][1] < SHARP) sharp.push(S[i]);
  if (closed && dirs[n - 2][0] * dirs[0][0] + dirs[n - 2][1] * dirs[0][1] < SHARP) sharp.push(0, total);

  // Read both sides every ~6 inches, skipping the readings right at a sharp corner, where the
  // point off the line on the outer side can land past the corner on the wrong surface.
  const off = thick / 2 + 0.06;
  const count = Math.max(4, Math.ceil(total / 0.15));
  const ds = total / count;
  const reads: { s: number; v: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (k + 0.5) * ds;
    if (sharp.some((c) => Math.abs(c - s) < off)) continue;
    while (j < n - 2 && S[j + 1] < s) j++;
    const d = dirs[j], t = s - S[j];
    const q: Vec2 = [pts[j][0] + d[0] * t, pts[j][1] + d[1] * t];
    const left = surfaceRank(zones, [q[0] - d[1] * off, q[1] + d[0] * off]);
    const right = surfaceRank(zones, [q[0] + d[1] * off, q[1] - d[0] * off]);
    // Move away from the side that must stay in view: -1 to the right, +1 to the left.
    reads.push({ s, v: left > right + 0.02 ? -1 : right > left + 0.02 ? 1 : 0 });
  }

  // Runs of one verdict, split halfway between readings, covering the whole line.
  type Run = { v: number; a: number; b: number };
  let runs: Run[] = [];
  let lastS = 0;
  for (const r of reads) {
    const last = runs[runs.length - 1];
    if (!last || last.v !== r.v) {
      const mid = last ? (lastS + r.s) / 2 : 0;
      if (last) last.b = mid;
      runs.push({ v: r.v, a: mid, b: total });
    }
    lastS = r.s;
  }
  if (!runs.length) runs = [{ v: 0, a: 0, b: total }];

  // Hysteresis: fold short runs into their neighbors until every run is long enough to stand. A
  // stretch that sees the same surface on both sides has no say of its own unless it is long: a
  // line drawn a couple of inches off a patio's edge reads bed on both sides here and there, and
  // the wall should stay moved through those spots rather than step back and forth.
  const minRun = Math.max(1, thick * 4), minLevel = Math.max(3, minRun * 2.5);
  const short = (r: Run) => r.b - r.a < (r.v ? minRun : minLevel);
  const fuse = () => {
    const out: Run[] = [];
    for (const r of runs) {
      const last = out[out.length - 1];
      if (last && last.v === r.v) last.b = r.b;
      else out.push({ ...r });
    }
    runs = out;
  };
  while (runs.length > 1) {
    let k = -1;
    for (let i = 0; i < runs.length; i++) if (short(runs[i]) && (k < 0 || runs[i].b - runs[i].a < runs[k].b - runs[k].a)) k = i;
    if (k < 0) break;
    const prev = runs[k - 1], next = runs[k + 1];
    runs[k].v = prev && next ? (prev.v === next.v || prev.b - prev.a >= next.b - next.a ? prev.v : next.v) : (prev ?? next).v;
    fuse();
  }

  // Where the verdict changes: a step at a nearby sharp corner, else an eased crossing.
  const ease = Math.max(0.6, thick * 3);
  const changes: { c: number; w: number; from: number; to: number }[] = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const c = runs[i].b, from = runs[i].v * move, to = runs[i + 1].v * move;
    const w = Math.min(ease, runs[i].b - runs[i].a, runs[i + 1].b - runs[i + 1].a);
    const corner = sharp.filter((x) => x > 0 && x < total).reduce<number | null>((best, x) => (Math.abs(x - c) < Math.max(w / 2, off) + ds && (best === null || Math.abs(x - c) < Math.abs(best - c)) ? x : best), null);
    changes.push(corner !== null ? { c: corner, w: 0, from, to } : { c, w, from, to });
  }
  const at = (s: number): number => {
    let v = runs[0].v * move;
    for (const ch of changes) {
      if (s >= ch.c + ch.w / 2) v = ch.to;
      else if (ch.w > 0 && s > ch.c - ch.w / 2) {
        const t = (s - (ch.c - ch.w / 2)) / ch.w;
        return ch.from + (ch.to - ch.from) * t * t * (3 - 2 * t);
      } else return v;
    }
    return v;
  };

  // The drawn points plus a few through each eased crossing, in order along the line.
  const marks: { s: number; p: Vec2 | null }[] = pts.map((p, i) => ({ s: S[i], p }));
  for (const ch of changes) if (ch.w > 0) for (let k = 0; k <= 8; k++) marks.push({ s: ch.c - ch.w / 2 + (k / 8) * ch.w, p: null });
  marks.sort((x, y) => x.s - y.s || (x.p ? -1 : 1));
  const out: Vec2[] = [], dIn: number[] = [], dOut: number[] = [];
  let seg = 0;
  for (const m of marks) {
    let p = m.p;
    if (!p) {
      while (seg < n - 2 && S[seg + 1] < m.s) seg++;
      const t = m.s - S[seg];
      p = [pts[seg][0] + dirs[seg][0] * t, pts[seg][1] + dirs[seg][1] * t];
    }
    const prev = out[out.length - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-4) continue;
    out.push(p);
    dIn.push(at(m.s - 1e-6));
    dOut.push(at(m.s + 1e-6));
  }
  if (closed) {
    // One join where the run closes: both ends carry the offsets on either side of it.
    dIn[0] = dIn[dIn.length - 1];
    dOut[dOut.length - 1] = dOut[0];
    out[out.length - 1] = [out[0][0], out[0][1]];
  }
  return { pts: out, dIn, dOut, closed, thick, move };
}

/**
 * One edge of a band along a path: at each point of the path, the point (or two, at a beveled
 * outer corner) at offset `e(d)` from the drawn line, where d is the body's center offset there.
 * Neighboring segments' offset lines meet at their crossing (a miter); past the miter limit the
 * outer corner is cut by a bevel, and the inner corner is held to a sane reach.
 */
export function pathEdge(path: LinePath, e: (d: number) => number): Vec2[][] {
  const { pts, closed } = path;
  const n = pts.length;
  const nor = (i: number): Vec2 => {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const groups: Vec2[][] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const eIn = e(path.dIn[i]), eOut = e(path.dOut[i]);
    const n1 = i > 0 ? nor(i - 1) : closed ? nor(n - 2) : null;
    const n2 = i < n - 1 ? nor(i) : closed ? nor(0) : null;
    if (!n1 || !n2) {
      const m = (n1 ?? n2)!, d = n1 ? eIn : eOut;
      groups.push([[p[0] + m[0] * d, p[1] + m[1] * d]]);
      continue;
    }
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    if (Math.abs(det) < 1e-6 && dot > 0) {
      const d = (eIn + eOut) / 2;
      groups.push([[p[0] + n1[0] * d, p[1] + n1[1] * d]]);
      continue;
    }
    const ref = Math.max(Math.abs(eIn), Math.abs(eOut), path.thick / 2, 1e-3);
    // det > 0: the line turns left, so the outer side of the corner is the right (negative) one.
    const outer = Math.abs(det) < 1e-6 || (eIn + eOut) * det < 0;
    let u: Vec2 | null = null;
    if (Math.abs(det) > 1e-6) u = [(eIn * n2[1] - n1[1] * eOut) / det, (n1[0] * eOut - eIn * n2[0]) / det];
    const reach = u ? Math.hypot(u[0], u[1]) : Infinity;
    if (outer && reach > MITER_LIMIT * ref) {
      groups.push([[p[0] + n1[0] * eIn, p[1] + n1[1] * eIn], [p[0] + n2[0] * eOut, p[1] + n2[1] * eOut]]);
    } else if (u) {
      const k = reach > INNER_LIMIT * ref ? (INNER_LIMIT * ref) / reach : 1;
      groups.push([[p[0] + u[0] * k, p[1] + u[1] * k]]);
    } else groups.push([[p[0] + n1[0] * eIn, p[1] + n1[1] * eIn]]);
  }
  return groups;
}

/** The same path with its open ends pushed out by `by` meters along the line (a cap's overhang at the ends). */
export function extendPath(path: LinePath, by: number): LinePath {
  const pts = path.pts.map((p): Vec2 => [p[0], p[1]]), n = pts.length;
  if (path.closed || n < 2 || !by) return { ...path, pts };
  const push = (i: number, j: number) => {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) || 1;
    pts[i] = [pts[i][0] + ((pts[i][0] - pts[j][0]) / d) * by, pts[i][1] + ((pts[i][1] - pts[j][1]) / d) * by];
  };
  push(0, 1);
  push(n - 1, n - 2);
  return { ...path, pts };
}

/** The body's center line: the drawn line for thin lines, the moved, mitered line for walls and curbs. */
export function lineCenter(l: LineItem, zones: Zone[]): Vec2[] {
  if (!lineThickness(l)) return l.points;
  const path = linePath(l, zones);
  if (path.pts.length < 2) return l.points;
  return pathEdge(path, (d) => d).flatMap((g, i) => (path.closed && i === 0 ? g.slice(-1) : g));
}

/**
 * A solid band along a path between edges `lo(d)` and `hi(d)` (hi the left one), from yLo to yHi
 * at each path point: two side faces, a top, a bottom and end faces where the run does not close.
 * UVs are in meters. Sides run along each face's own length (or, with `pathU`, along the drawn
 * line, so a thin curb's saw cuts on its faces line up with those on its top) and up in world
 * height, so block coursing carries on unbroken through curves and corners. Top and bottom run
 * along the drawn line and across it, so joints cross the body square wherever it turns.
 */
export function bandGeometry(path: LinePath, lo: (d: number) => number, hi: (d: number) => number, yLo: number[], yHi: number[], pathU = false): THREE.BufferGeometry {
  const L = pathEdge(path, hi), R = pathEdge(path, lo);
  const n = path.pts.length, closed = path.closed;
  const S = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(path.pts[i][0] - path.pts[i - 1][0], path.pts[i][1] - path.pts[i - 1][1]));
  // Up the faces from a little below grade, as the boxes did, so no texture joint lands at grade.
  const V0 = 0.08;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  type V = { p: [number, number, number]; n: [number, number, number]; uv: [number, number] };
  const tri = (a: V, b: V, c: V, want: [number, number, number]) => {
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    const list = cx * want[0] + cy * want[1] + cz * want[2] >= 0 ? [a, b, c] : [a, c, b];
    for (const v of list) {
      pos.push(...v.p);
      nrm.push(...v.n);
      uv.push(...v.uv);
    }
  };
  const quad = (a: V, b: V, c: V, d: V, want: [number, number, number]) => {
    tri(a, b, c, want);
    tri(a, c, d, want);
  };

  // A side: the edge's points in order (at the closing point only once), each with its path index.
  const side = (G: Vec2[][], sign: number) => {
    const P: { p: Vec2; i: number }[] = [];
    G.forEach((g, i) => (closed && i === 0 ? g.slice(-1) : g).forEach((p) => P.push({ p, i })));
    const segN: Vec2[] = [];
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k].p, b = P[k + 1].p, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      segN.push([(-(b[1] - a[1]) / len) * sign, ((b[0] - a[0]) / len) * sign]);
    }
    const smooth = Math.cos((35 * Math.PI) / 180);
    const vn = (k: number, end: 0 | 1): [number, number, number] => {
      // The normal at the end of piece k: shared with the neighbor there when the turn is gentle.
      const o = end ? k + 1 : k - 1, m = segN[k];
      const q = end ? (o < segN.length ? segN[o] : closed ? segN[0] : null) : o >= 0 ? segN[o] : closed ? segN[segN.length - 1] : null;
      if (!q || m[0] * q[0] + m[1] * q[1] < smooth) return [m[0], 0, m[1]];
      const x = m[0] + q[0], z = m[1] + q[1], l = Math.hypot(x, z);
      return [x / l, 0, z / l];
    };
    let u = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k], b = P[k + 1];
      const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
      if (len < 1e-6) continue;
      const na = vn(k, 0), nb = vn(k, 1), w: [number, number, number] = [segN[k][0], 0, segN[k][1]];
      const ua = pathU ? S[a.i] : u, ub = pathU ? S[b.i] : u + len;
      const v = (q: { p: Vec2; i: number }, y: number, nn: [number, number, number], uu: number): V => ({ p: [q.p[0], y, q.p[1]], n: nn, uv: [uu, y + V0] });
      quad(v(a, yLo[a.i], na, ua), v(b, yLo[b.i], nb, ub), v(b, yHi[b.i], nb, ub), v(a, yHi[a.i], na, ua), w);
      u += len;
    }
  };
  side(L, 1);
  side(R, -1);

  // Top and bottom, strip by strip between the two edges.
  // Across: the edge's offset from the drawn line, shifted so no joint runs down the middle.
  const across = (i: number, e: (d: number) => number, first: boolean) => e(first ? path.dIn[i] : path.dOut[i]) + 0.75;
  for (const [ys, up] of [[yHi, 1], [yLo, -1]] as [number[], number][]) {
    const nn: [number, number, number] = [0, up, 0];
    const v = (p: Vec2, i: number, e: (d: number) => number, first: boolean): V => ({ p: [p[0], ys[i], p[1]], n: nn, uv: [S[i], across(i, e, first)] });
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      if (!(closed && i === 0)) quad(v(l[0], i, hi, true), v(l[l.length - 1], i, hi, false), v(r[r.length - 1], i, lo, false), v(r[0], i, lo, true), nn);
      if (i + 1 < n) quad(v(l[l.length - 1], i, hi, false), v(L[i + 1][0], i + 1, hi, true), v(R[i + 1][0], i + 1, lo, true), v(r[r.length - 1], i, lo, false), nn);
    }
  }

  // Ends.
  if (!closed) {
    for (const [i, g] of [[0, 0], [n - 1, 1]] as [number, number][]) {
      const a = g ? L[i][L[i].length - 1] : L[i][0], b = g ? R[i][R[i].length - 1] : R[i][0];
      const j = g ? i - 1 : i, d = path.pts[j + 1], c = path.pts[j];
      const len = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
      const w: [number, number, number] = [((d[0] - c[0]) / len) * (g ? 1 : -1), 0, ((d[1] - c[1]) / len) * (g ? 1 : -1)];
      const wide = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const v = (p: Vec2, y: number, uu: number): V => ({ p: [p[0], y, p[1]], n: w, uv: [uu, y + V0] });
      quad(v(a, yLo[i], 0), v(b, yLo[i], wide), v(b, yHi[i], wide), v(a, yHi[i], 0), w);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
