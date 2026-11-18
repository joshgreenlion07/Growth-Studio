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

/** Melville Curb unit, meters: thickness, height and length (4 x 24 x 6 1/2 in, belgard.com). */
export const CURB_THICK = 0.1016, CURB_TALL = 0.1651, CURB_UNIT = 0.6096;
/** How much of a curb shows above grade when the plan does not say: 3 in. */
export const CURB_REVEAL = 0.0762;

/** Thickness in meters of a line that is built as a solid body: a wall or a concrete curb. 0 for the rest. */
export function lineThickness(l: LineItem): number {
  const spec = materialById.get(l.catalogId);
  if (l.kind === 'wall') return (spec?.wall?.face ?? 'splitFace') === 'plaster' ? 0.25 : 0.3;
  // Curbs are Belgard Melville Curb units: 4 in thick (24 in long, 6 1/2 in tall).
  if (l.kind === 'edging' && spec?.recipe === 'curb') return CURB_THICK;
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

type Box = [number, number, number, number];
const boxOf = (pts: Vec2[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) (x0 = Math.min(x0, p[0])), (y0 = Math.min(y0, p[1])), (x1 = Math.max(x1, p[0])), (y1 = Math.max(y1, p[1]));
  return [x0, y0, x1, y1];
};
const inBox = (b: Box, p: Vec2) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** The zone whose surface shows at a point: the highest paving there, else the last zone drawn over it; -1 for none. */
function visibleZone(zones: Zone[], boxes: Box[], p: Vec2): number {
  let pave = -1, top = -1;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!inBox(boxes[i], p) || !pointInPolygon(p, z.polygon)) continue;
    if (z.kind === 'hardscape' && (pave < 0 || (z.elevation ?? 0) >= (zones[pave].elevation ?? 0))) pave = i;
    top = i;
  }
  return pave >= 0 ? pave : top;
}

/** How far a drawn curb may be off the edge it follows and still be built on it: 1 ft. */
export const SEAM_SNAP = 0.3;

/**
 * A curb's drawn line moved onto the seams it follows. A curb separates two surfaces (lawn from
 * pavers, pebble from lawn), and it is drawn by hand a few inches off their seam, or across a
 * corner. Wherever the line runs along a zone's outline, within SEAM_SNAP of it and roughly
 * parallel, where that outline is a real seam (the zone shows on one side of it and something else
 * on the other), the stretch is replaced by the outline itself, corners included, so the body later
 * moved off it (linePath) lies with one face on the seam: flush with a patio's soldier course,
 * never over it, never off it. A higher seam (paving over lawn over beds) wins over a slightly
 * nearer lower one, and the choice holds along the line (a seam is given up only for another one
 * followed for a meter or more). A line that crosses an edge, cuts across a notch in it, or follows
 * no seam stays as drawn.
 */
export function snapToSeams(points: Vec2[], zones: Zone[]): Vec2[] {
  const src: Vec2[] = [];
  for (const p of points) {
    const q = src[src.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) src.push([p[0], p[1]]);
  }
  if (src.length < 2 || !zones.length) return points;
  const closed = src.length > 3 && Math.hypot(src[0][0] - src[src.length - 1][0], src[0][1] - src[src.length - 1][1]) < 0.01;
  if (closed) src[src.length - 1] = [src[0][0], src[0][1]];

  const R = SEAM_SNAP;
  const lb = boxOf(src), reach: Box = [lb[0] - R, lb[1] - R, lb[2] + R, lb[3] + R];
  const zb = zones.map((z) => boxOf(z.polygon));
  const rk = (zi: number) => (zi < 0 ? 0 : zones[zi].kind === 'hardscape' ? 3 : zones[zi].kind === 'turf' ? 2 : 1);

  // Zone outlines near the line, with the perimeter distance at each corner, and their sides in a
  // grid of cells: each side is listed in every cell within reach of it.
  type Outline = { zi: number; v: Vec2[]; T: number[]; P: number };
  const outs: Outline[] = [];
  const CELL = 0.5, grid = new Map<number, number[]>(), segs: { k: number; i: number }[] = [];
  const key = (ix: number, iy: number) => (ix + 32768) * 65536 + (iy + 32768);
  zones.forEach((z, zi) => {
    const b = zb[zi];
    if (b[0] > reach[2] || b[2] < reach[0] || b[1] > reach[3] || b[3] < reach[1]) return;
    const v = z.polygon.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4);
    if (v.length > 2 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < 1e-4) v.pop();
    if (v.length < 3) return;
    const T = [0];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], c = v[(i + 1) % v.length];
      T.push(T[i] + Math.hypot(c[0] - a[0], c[1] - a[1]));
    }
    const k = outs.length;
    outs.push({ zi, v, T, P: T[v.length] });
    for (let i = 0; i < v.length; i++) {
      const a = v[i], c = v[(i + 1) % v.length];
      const x0 = Math.max(Math.min(a[0], c[0]) - R, reach[0]), x1 = Math.min(Math.max(a[0], c[0]) + R, reach[2]);
      const y0 = Math.max(Math.min(a[1], c[1]) - R, reach[1]), y1 = Math.min(Math.max(a[1], c[1]) + R, reach[3]);
      if (x0 > x1 || y0 > y1) continue;
      const id = segs.length;
      segs.push({ k, i });
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
        for (let iy = Math.floor(y0 / CELL); iy <= Math.floor(y1 / CELL); iy++) {
          const c2 = key(ix, iy), list = grid.get(c2);
          if (list) list.push(id);
          else grid.set(c2, [id]);
        }
    }
  });
  if (!outs.length) return points;

  // The line every 5 cm (and at every drawn point), with its direction there.
  const STEP = 0.05;
  type Sample = { p: Vec2; s: number; orig: boolean; d: Vec2 };
  const smp: Sample[] = [];
  let run = 0;
  for (let i = 0; i + 1 < src.length; i++) {
    const a = src[i], b = src[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    if (!i) smp.push({ p: a, s: 0, orig: true, d });
    const k = Math.max(1, Math.ceil(len / STEP));
    for (let j = 1; j <= k; j++) smp.push({ p: j === k ? b : [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k], s: run + (len * j) / k, orig: j === k, d });
    run += len;
  }
  const N = smp.length;

  // Whether a side is a seam, read a little to either side of it, a little in from its corners so it
  // reads this side only; once per 25 cm of each side.
  const seamAt = new Map<number, { seam: boolean; high: number }>();
  const seamOf = (sid: number, f: number) => {
    const { k, i } = segs[sid], o = outs[k];
    const a = o.v[i], b = o.v[(i + 1) % o.v.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const nb = Math.max(1, Math.ceil(len / 0.25)), bucket = Math.min(nb - 1, Math.floor(f * nb));
    const ck = sid * 4096 + Math.min(bucket, 4095);
    let r = seamAt.get(ck);
    if (!r) {
      const g = Math.max(Math.min((bucket + 0.5) / nb, 1 - 0.03 / len), Math.min(0.03 / len, 0.5));
      const c: Vec2 = [a[0] + dx * g, a[1] + dy * g], nx = -dy / len, ny = dx / len;
      const one = visibleZone(zones, zb, [c[0] + nx * 0.03, c[1] + ny * 0.03]), two = visibleZone(zones, zb, [c[0] - nx * 0.03, c[1] - ny * 0.03]);
      r = { seam: one !== two && (one === o.zi || two === o.zi), high: Math.max(rk(one), rk(two)) };
      seamAt.set(ck, r);
    }
    return r;
  };

  // For each sample, the nearest point on each outline in reach: on a seam, and the line running
  // along it there (within 25 degrees, or at a corner of the outline)?
  type Hit = { q: Vec2; t: number; d: number; ok: boolean; high: number };
  const ALIGN = Math.cos((25 * Math.PI) / 180);
  const hits: Map<number, Hit>[] = smp.map((m) => {
    const best = new Map<number, { sid: number; f: number; d: number }>();
    for (const sid of grid.get(key(Math.floor(m.p[0] / CELL), Math.floor(m.p[1] / CELL))) ?? []) {
      const { k, i } = segs[sid], o = outs[k];
      const a = o.v[i], b = o.v[(i + 1) % o.v.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const f = Math.max(0, Math.min(1, ((m.p[0] - a[0]) * dx + (m.p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(m.p[0] - a[0] - dx * f, m.p[1] - a[1] - dy * f);
      const was = best.get(k);
      if (d <= R && (!was || d < was.d)) best.set(k, { sid, f, d });
    }
    const h = new Map<number, Hit>();
    for (const [k, { sid, f, d }] of best) {
      const o = outs[k], i = segs[sid].i, a = o.v[i], b = o.v[(i + 1) % o.v.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const along = f <= 1e-6 || f >= 1 - 1e-6 || Math.abs(((b[0] - a[0]) * m.d[0] + (b[1] - a[1]) * m.d[1]) / len) >= ALIGN;
      const s = seamOf(sid, f);
      h.set(k, { q: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: o.T[i] + len * f, d, ok: s.seam && along, high: s.high });
    }
    return h;
  });
  // The best seam at each sample, held while it stays nearly as good: two seams a few inches
  // apart (a strip between two patios) must not trade places as the drawn line wobbles.
  const score = (r: Hit) => r.d - 0.1 * r.high;
  let held = -1;
  const pick = hits.map((h) => {
    let best = -1, top = Infinity;
    for (const [k, r] of h) if (r.ok && score(r) < top) (top = score(r)), (best = k);
    const keep = held >= 0 ? h.get(held) : undefined;
    if (keep?.ok && score(keep) <= top + 0.15) return held;
    return (held = best);
  });

  // Runs of one outline (or none), made to hold along the line: a run shorter than a meter joins a
  // neighbor (the one on both sides, else the longer) when that outline is in reach all along it.
  type Run = { k: number; a: number; b: number };
  const runsOf = (): Run[] => {
    const r: Run[] = [];
    for (let i = 0; i < N; i++) {
      const last = r[r.length - 1];
      if (last && last.k === pick[i]) last.b = i;
      else r.push({ k: pick[i], a: i, b: i });
    }
    return r;
  };
  const lenOf = (r: Run) => smp[Math.min(r.b + 1, N - 1)].s - smp[r.a].s;
  let runs = runsOf();
  const stuck = new Set<string>();
  for (;;) {
    let r: Run | null = null, ri = -1;
    runs.forEach((x, i) => {
      if (runs.length > 1 && lenOf(x) < 1 && !stuck.has(`${x.a}:${x.k}`) && (!r || lenOf(x) < lenOf(r))) (r = x), (ri = i);
    });
    if (!r) break;
    const cur: Run = r, prev = runs[ri - 1], next = runs[ri + 1];
    const cands = prev && next ? (prev.k === next.k ? [prev.k] : lenOf(prev) >= lenOf(next) ? [prev.k, next.k] : [next.k, prev.k]) : [(prev ?? next).k];
    const k = cands.find((c) => {
      if (c < 0) return true;
      for (let j = cur.a; j <= cur.b; j++) if (!hits[j].has(c)) return false;
      return true;
    });
    if (k === undefined) {
      stuck.add(`${cur.a}:${cur.k}`);
      continue;
    }
    for (let j = cur.a; j <= cur.b; j++) pick[j] = k;
    runs = runsOf();
  }

  // The walk through the samples: on a closed line whose both ends follow the same outline, it
  // starts where that run starts.
  const wrap = closed && runs.length > 1 && runs[0].k >= 0 && runs[0].k === runs[runs.length - 1].k;
  const order: number[] = [];
  if (wrap) {
    const from = runs[runs.length - 1].a;
    for (let i = from; i < N - 1; i++) order.push(i);
    for (let i = 0; i < from; i++) order.push(i);
    order.push(order[0]);
  } else for (let i = 0; i < N; i++) order.push(i);
  const W = order.length;
  const walkS = [0];
  for (let j = 1; j < W; j++) walkS.push(walkS[j - 1] + Math.hypot(smp[order[j]].p[0] - smp[order[j - 1]].p[0], smp[order[j]].p[1] - smp[order[j - 1]].p[1]));

  // Stretches to snap: a run is cut where the nearest point jumps along the outline (the line passes
  // the mouth of a notch: the outline's way round it is not the curb's), its ends are trimmed where
  // the line leaves the outline (the nearest point stops moving), and a stretch is kept only when it
  // is 0.3 m or more, follows the outline (moves along it at least half as far as the line does) and
  // does not cross it (from well inside to well outside).
  type Snap = { j0: number; j1: number; k: number; u: number[] };
  const snaps: Snap[] = [];
  const pieces: { k: number; js: number[] }[] = [];
  for (let j = 0; j < W; j++) {
    const k = pick[order[j]], last = pieces[pieces.length - 1];
    if (k < 0) continue;
    const prevJ = last?.js[last.js.length - 1];
    if (last && last.k === k && prevJ === j - 1) {
      const o = outs[k];
      const h0 = hits[order[j - 1]].get(k)!, h1 = hits[order[j]].get(k)!;
      let dt = h1.t - h0.t;
      dt -= Math.round(dt / o.P) * o.P;
      // Inside a corner the nearest point steps from one side to the other: twice the offset.
      if (Math.abs(dt) <= 3 * (walkS[j] - walkS[j - 1]) + 2 * Math.min(h0.d, h1.d) + 0.02) {
        last.js.push(j);
        continue;
      }
    }
    pieces.push({ k, js: [j] });
  }
  const whole = closed && pieces.length === 1 && pieces[0].js.length === W;
  for (const { k, js } of pieces) {
    const o = outs[k], u = [hits[order[js[0]]].get(k)!.t];
    for (let j = 1; j < js.length; j++) {
      let dt = hits[order[js[j]]].get(k)!.t - hits[order[js[j - 1]]].get(k)!.t;
      dt -= Math.round(dt / o.P) * o.P;
      u.push(u[j - 1] + dt);
    }
    let a = 0, b = js.length - 1;
    if (!whole) {
      while (b > a && Math.abs(u[b] - u[b - 1]) < STEP * 0.2) b--;
      while (a < b && Math.abs(u[a + 1] - u[a]) < STEP * 0.2) a++;
    }
    const len = walkS[js[b]] - walkS[js[a]];
    if (b - a < 2 || len < 0.3 || Math.abs(u[b] - u[a]) < 0.5 * len) continue;
    // A line drifting steadily across or away from the edge (more than 15 cm, at more than 1 in 6)
    // passes it rather than following it.
    const side = (j: number) => (pointInPolygon(smp[order[j]].p, zones[o.zi].polygon) ? -1 : 1) * hits[order[j]].get(k)!.d;
    const drift = Math.abs(side(js[b]) - side(js[a]));
    if (!whole && drift > 0.15 && drift > len / 6) continue;
    snaps.push({ j0: js[a], j1: js[b], k, u: u.slice(a, b + 1) });
  }
  if (!snaps.length) return points;

  // The walk: outline stretches where snapped, the drawn points elsewhere. Next to a stretch the
  // drawn line is picked up again only 0.4 m on, so the step back to it is a gentle slant; a drawn
  // end closer than that to a stretch carries the stretch on straight instead of stepping back.
  const out: Vec2[] = [];
  const push = (p: Vec2) => {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push([p[0], p[1]]);
  };
  const snapAt = new Map<number, Snap>();
  for (const sn of snaps) snapAt.set(sn.j0, sn);
  const nearSnap = (s: number) => snaps.some((sn) => (s > walkS[sn.j0] - 0.4 && s < walkS[sn.j0]) || (s > walkS[sn.j1] && s < walkS[sn.j1] + 0.4));
  let head: Vec2 | null = null, tail: Vec2 | null = null;
  for (let j = 0; j < W; j++) {
    const sn = snapAt.get(j);
    if (sn) {
      const o = outs[sn.k], ua = sn.u[0], ub = sn.u[sn.u.length - 1];
      push(hits[order[j]].get(sn.k)!.q);
      // The outline's corners passed on the way, in the order the line passes them.
      const lo = Math.min(ua, ub), hi = Math.max(ua, ub), cs: { t: number; i: number }[] = [];
      for (let i = 0; i < o.v.length; i++)
        for (let m = Math.floor((lo - o.T[i]) / o.P); o.T[i] + m * o.P < hi; m++) {
          const t = o.T[i] + m * o.P;
          if (t > lo + 1e-4 && t < hi - 1e-4) cs.push({ t, i });
        }
      cs.sort((x, y) => (ub >= ua ? x.t - y.t : y.t - x.t));
      for (const c of cs) push(o.v[c.i]);
      push(hits[order[sn.j1]].get(sn.k)!.q);
      j = sn.j1;
      continue;
    }
    const m = smp[order[j]], s = walkS[j], near = nearSnap(s);
    if (!closed && near && (j === 0 || j === W - 1)) {
      if (j === 0) head = m.p;
      else tail = m.p;
    } else if (j === 0 || j === W - 1 || (m.orig && !near) || (!near && (nearSnap(s - STEP * 1.01) || nearSnap(s + STEP * 1.01)))) push(m.p);
  }
  const carry = (from: Vec2, to: Vec2, end: Vec2): Vec2 | null => {
    const dx = from[0] - to[0], dy = from[1] - to[1], l = Math.hypot(dx, dy);
    const along = l ? ((end[0] - from[0]) * dx + (end[1] - from[1]) * dy) / l : 0;
    return along > 1e-3 ? [from[0] + (dx / l) * along, from[1] + (dy / l) * along] : null;
  };
  if (head && out.length > 1) {
    const p = carry(out[0], out[1], head);
    if (p) out.unshift(p);
  }
  if (tail && out.length > 1) {
    const p = carry(out[out.length - 1], out[out.length - 2], tail);
    if (p) out.push(p);
  }
  if (closed && out.length > 2) {
    if (Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) > 1e-4) out.push([out[0][0], out[0][1]]);
    out[out.length - 1] = [out[0][0], out[0][1]];
  }
  return out.length >= 2 ? out : points;
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
  // One build asks for the same line's path several times (its body, the ground and planting kept
  // clear of it, the build stages); it is worked out once for each version of the line and zones.
  const sig = planSig(l, zones), hit = pathMemo.get(l);
  if (hit && hit.zones === zones && hit.sig === sig) return hit.path;
  const path = computeLinePath(l, zones);
  pathMemo.set(l, { zones, sig, path });
  return path;
}

const pathMemo = new WeakMap<LineItem, { zones: Zone[]; sig: number; path: LinePath }>();

/** A hash of everything linePath reads (lines and zones are edited in place, so their identity is not enough). */
function planSig(l: LineItem, zones: Zone[]): number {
  let h = 0x811c9dc5;
  const mix = (x: number) => (h = Math.imul(h ^ (Math.round(x * 1e5) | 0), 0x01000193));
  const str = (t: string) => {
    for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i));
  };
  str(l.kind);
  str(l.catalogId);
  for (const p of l.points) mix(p[0]), mix(p[1]);
  mix(zones.length);
  for (const z of zones) {
    str(z.kind);
    mix(z.elevation ?? 0);
    mix(z.polygon.length);
    for (const p of z.polygon) mix(p[0]), mix(p[1]);
  }
  return h;
}

/** The line as built, for lengths and outlines: a curb's line moved onto the seams it follows, other lines as drawn. */
export function builtLine(l: LineItem, zones: Zone[]): Vec2[] {
  return l.kind === 'edging' && lineThickness(l) ? linePath(l, zones).pts : l.points;
}

function computeLinePath(l: LineItem, zones: Zone[]): LinePath {
  const thick = lineThickness(l);
  const move = thick ? thick / 2 + 0.004 : 0;
  const pts: Vec2[] = [];
  // A curb is drawn by hand along the edge it separates; it is built on that edge exactly.
  const drawn = l.kind === 'edging' && thick ? snapToSeams(l.points, zones) : l.points;
  for (const p of drawn) {
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
