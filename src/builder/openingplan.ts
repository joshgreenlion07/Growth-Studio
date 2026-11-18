import { distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../siteplan/types';

/**
 * Where a house's windows and doors go. Pure plan geometry (no three.js), so it can be tested on its own.
 * Every opening is a run along ONE wall edge that is fully inside that edge, clear of its ends, and clear of any
 * other structure (a cover, a California room, another building) standing against that stretch of wall.
 */

export interface WallSide { a: Vec2; dir: Vec2; out: Vec2; len: number; edge: number }
export interface Slot { t: number; w: number; h0: number; h1: number; solid?: boolean }
export interface PlacedOpening extends Slot { edge: number }
export interface OpeningPlan {
  sides: WallSide[];
  /** Every opening that fit, by wall edge. */
  placed: PlacedOpening[];
  doorEdge: number;
  /** Centers of the door lights: (edge, t along it). */
  lights: { edge: number; t: number }[];
}

/** Gap kept between an opening and a wall end or a neighboring structure (m). */
export const CORNER_CLEAR = 0.4;
/** Gap used for openings the designer marked by hand. */
export const MARKED_CLEAR = 0.2;
/** How far the frame stands off the wall face (m). */
export const FRAME_OUT = 0.12;

function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The wall edges of a footprint with their outward normals. Degenerate (zero-length) edges and a repeated closing vertex are dropped. */
export function wallSides(poly: Vec2[]): WallSide[] {
  const out: WallSide[] = [];
  // The outward side is set by the winding, not by probing a point beside the wall, so a narrow notch cannot flip it.
  const ccw = signedArea(poly) >= 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const o: Vec2 = ccw ? [dir[1], -dir[0]] : [-dir[1], dir[0]];
    out.push({ a, dir, out: o, len, edge: i });
  }
  return out;
}

const SAMPLE = 0.025;

/**
 * What stands up from a cover's floor and could meet a house wall: its walls (every walled edge, even one along the
 * house wall) and a 0.6 m square at every corner (posts, wall ends and header ends). A cover's roof alone blocks nothing.
 */
export function coverSolids(c: ExistingStructure): Vec2[][] {
  const poly = c.polygon, n = poly.length, out: Vec2[][] = [];
  const ccw = signedArea(poly) >= 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const d: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const inn: Vec2 = ccw ? [-d[1], d[0]] : [d[1], -d[0]];
    if (c.walls?.[i]) out.push([a, b, [b[0] + inn[0] * 0.2, b[1] + inn[1] * 0.2], [a[0] + inn[0] * 0.2, a[1] + inn[1] * 0.2]]);
    if (c.posts) for (let j = 1, k = Math.ceil(l / 4.2); j < k; j++) {
      const q: Vec2 = [a[0] + d[0] * l * j / k, a[1] + d[1] * l * j / k];
      out.push([[q[0] - 0.3, q[1] - 0.3], [q[0] + 0.3, q[1] - 0.3], [q[0] + 0.3, q[1] + 0.3], [q[0] - 0.3, q[1] + 0.3]]);
    }
    out.push([[a[0] - 0.3, a[1] - 0.3], [a[0] + 0.3, a[1] - 0.3], [a[0] + 0.3, a[1] + 0.3], [a[0] - 0.3, a[1] + 0.3]]);
  }
  return out;
}

/**
 * Stretches [lo, hi] of wall `sd` where an opening may stand: nothing else (another structure, or this house's own
 * wing across a notch) within reach of the wall, and `clear` away from the wall ends and from anything that does.
 */
export function freeRuns(sd: WallSide, poly: Vec2[], others: Vec2[][], clear: number, solids: Vec2[][] = []): [number, number][] {
  const n = Math.max(1, Math.ceil(sd.len / SAMPLE));
  const blocked: boolean[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * sd.len;
    const base: Vec2 = [sd.a[0] + sd.dir[0] * t, sd.a[1] + sd.dir[1] * t];
    let bad = false;
    for (const d of [0.1, 0.3, 0.6]) {
      const p: Vec2 = [base[0] + sd.out[0] * d, base[1] + sd.out[1] * d];
      if (pointInPolygon(p, poly)) { bad = true; break; }
    }
    if (!bad) {
      for (const o of others) {
        // On the wall itself, just inside it (an overlapping cover), and out where a cover's wall, header or floor stands.
        if (distToEdge(base, o) < 0.05 || pointInPolygon(base, o)) { bad = true; break; }
        for (const d of [0.02, 0.1, 0.3, 0.6]) {
          const p: Vec2 = [base[0] + sd.out[0] * d, base[1] + sd.out[1] * d];
          if (pointInPolygon(p, o)) { bad = true; break; }
        }
        if (bad) break;
      }
    }
    // A cover's walls, posts and header ends: keep clear where they touch or come within 0.6 m of the wall.
    if (!bad) for (const q of solids) if (pointInPolygon(base, q) || distToEdge(base, q) < 0.6) { bad = true; break; }
    blocked.push(bad);
  }
  // Grow every blocked stretch by `clear`, then take the free runs inside the wall ends.
  const grow = Math.ceil(clear / (sd.len / n));
  const dil = blocked.map((_, k) => {
    for (let j = Math.max(0, k - grow); j <= Math.min(n, k + grow); j++) if (blocked[j]) return true;
    return false;
  });
  const runs: [number, number][] = [];
  let start = -1;
  for (let k = 0; k <= n + 1; k++) {
    const free = k <= n && !dil[k];
    if (free && start < 0) start = k;
    if (!free && start >= 0) {
      const lo = Math.max(clear, (start / n) * sd.len), hi = Math.min(sd.len - clear, ((k - 1) / n) * sd.len);
      if (hi - lo > 1e-6) runs.push([lo, hi]);
      start = -1;
    }
  }
  return runs;
}

/** Move an opening of width w centered at t into the run that holds it (or the nearest run it fits in); null if none is wide enough. */
export function fitInRuns(runs: [number, number][], t: number, w: number): number | null {
  let best: number | null = null, bd = Infinity;
  for (const [lo, hi] of runs) {
    if (hi - lo < w - 1e-9) continue;
    const c = Math.max(lo + w / 2, Math.min(hi - w / 2, t));
    if (Math.abs(c - t) < bd) { bd = Math.abs(c - t); best = c; }
  }
  return best;
}

const overlaps = (list: Slot[], t: number, w: number, gap: number) => list.some((o) => Math.abs(o.t - t) < o.w / 2 + w / 2 + gap);

/** Tops of openings, kept under the eave. */
function heights(H: number) {
  const top = Math.min(2.15, H - 0.25);
  return { winTop: top, winBottom: Math.min(0.95, top - 0.6), doorTop: Math.min(2.1, H - 0.15) };
}

export function planOpenings(s: ExistingStructure, all: ExistingStructure[], siteCenter: Vec2): OpeningPlan {
  const poly = s.polygon, H = s.height;
  const sides = wallSides(poly);
  // Other buildings block the wall they stand against; a cover only blocks where its walls and posts are.
  const nb = all.filter((o) => o !== s && o.polygon !== poly);
  const others = nb.filter((o) => o.kind !== 'cover').map((o) => o.polygon);
  const solids = nb.filter((o) => o.kind === 'cover').flatMap(coverSolids);
  const hts = heights(H);
  const placed: PlacedOpening[] = [];
  const lights: { edge: number; t: number }[] = [];
  const bySide = new Map<number, WallSide>();
  sides.forEach((sd) => bySide.set(sd.edge, sd));
  const autoRuns = new Map<number, [number, number][]>();
  const runsOf = (sd: WallSide) => {
    let r = autoRuns.get(sd.edge);
    if (!r) autoRuns.set(sd.edge, (r = freeRuns(sd, poly, others, CORNER_CLEAR, solids)));
    return r;
  };
  const winOk = hts.winTop - Math.max(0.02, hts.winBottom) >= 0.5;
  const doorW = s.kind === 'house' ? 2.4 : 1.0;
  const doorOk = hts.doorTop >= 1.7;

  // Doors and windows the designer marked: each goes on the wall nearest its mark, if it fits there.
  const marked = new Map<number, Slot[]>();
  let lit = false;
  for (const op of s.openings ?? []) {
    let bestSide: WallSide | null = null, bd = 3.0, bt = 0;
    for (const sd of sides) {
      const t = Math.max(0, Math.min(sd.len, (op.at[0] - sd.a[0]) * sd.dir[0] + (op.at[1] - sd.a[1]) * sd.dir[1]));
      const d = Math.hypot(op.at[0] - sd.a[0] - sd.dir[0] * t, op.at[1] - sd.a[1] - sd.dir[1] * t);
      if (d < bd) { bd = d; bestSide = sd; bt = t; }
    }
    if (!bestSide) continue;
    const sd = bestSide;
    const w = Math.min(op.width, sd.len - 2 * MARKED_CLEAR);
    if (w < 0.3) continue;
    const isDoor = op.kind === 'door';
    if (isDoor ? hts.doorTop < 1.2 : hts.winTop - hts.winBottom < 0.3) continue;
    const t = fitInRuns(freeRuns(sd, poly, others, MARKED_CLEAR, solids), bt, w);
    if (t === null) continue;
    const list = marked.get(sd.edge) ?? [];
    if (overlaps(list, t, w, 0.05)) continue;
    // A door up to 1.5 m wide is a solid door; wider ones are sliding glass.
    list.push(isDoor ? { t, w, h0: 0.02, h1: hts.doorTop, solid: w <= 1.5 } : { t, w, h0: Math.max(0.02, hts.winBottom), h1: hts.winTop });
    marked.set(sd.edge, list);
    if (isDoor && !lit) {
      lit = true;
      for (const d of [-1, 1]) lights.push({ edge: sd.edge, t: t + d * (w / 2 + 0.4) });
    }
  }

  // The automatic door goes on the wall facing the yard that has room for it.
  let doorEdge = -1, doorT = 0;
  if (!s.openings && doorOk) {
    let best = -Infinity;
    for (const sd of sides) {
      const mid: Vec2 = [sd.a[0] + sd.dir[0] * sd.len / 2, sd.a[1] + sd.dir[1] * sd.len / 2];
      const toSite: Vec2 = [siteCenter[0] - mid[0], siteCenter[1] - mid[1]];
      const score = toSite[0] * sd.out[0] + toSite[1] * sd.out[1] + sd.len * 0.1;
      if (score <= best) continue;
      const t = fitInRuns(runsOf(sd), sd.len / 2, doorW);
      if (t === null) continue;
      best = score;
      doorEdge = sd.edge;
      doorT = t;
    }
  }

  for (const sd of sides) {
    if (!s.openings && s.kind === 'shed' && sd.edge !== doorEdge) continue;
    const slots: Slot[] = [];
    if (s.openings) {
      slots.push(...(marked.get(sd.edge) ?? []));
    } else {
      if (sd.edge === doorEdge) {
        slots.push({ t: doorT, w: doorW, h0: 0.02, h1: hts.doorTop });
        for (const d of [-1, 1]) lights.push({ edge: sd.edge, t: doorT + d * (doorW / 2 + 0.4) });
      }
      if ((sd.edge === doorEdge || s.kind === 'house') && winOk) {
        const n = Math.max(1, Math.floor((sd.len - 1.2) / 3.4));
        for (let k = 0; k < n; k++) {
          const w = sd.edge === doorEdge ? 1.5 : 1.4;
          const tt = fitInRuns(runsOf(sd), ((k + 0.5) / n) * sd.len, w);
          if (tt === null || overlaps(slots, tt, w, 0.25)) continue;
          slots.push({ t: tt, w, h0: Math.max(0.02, hts.winBottom), h1: hts.winTop });
        }
      }
    }
    for (const sl of slots) placed.push({ ...sl, edge: sd.edge });
  }
  return { sides, placed, doorEdge, lights };
}

/** One box of an opening: a segment a-b in plan (thickness centered on it), y0..y1, optionally lengthened at both ends. */
export interface OpeningBox { kind: 'frame' | 'pane' | 'door'; a: Vec2; b: Vec2; thick: number; y0: number; y1: number; extend: number }

/** The boxes that make up an opening, all standing on the wall face (outward offsets 0.01 to 0.11 m). */
export function openingBoxes(sd: WallSide, sl: Slot): OpeningBox[] {
  const at = (t: number, d: number): Vec2 => [sd.a[0] + sd.dir[0] * t + sd.out[0] * d, sd.a[1] + sd.dir[1] * t + sd.out[1] * d];
  const t0 = sl.t - sl.w / 2, t1 = sl.t + sl.w / 2;
  const boxes: OpeningBox[] = [];
  boxes.push({ kind: sl.solid ? 'door' : 'pane', a: at(t0, 0.01), b: at(t1, 0.01), thick: 0.02, y0: sl.h0, y1: sl.h1, extend: 0 });
  const bar = 0.06;
  boxes.push({ kind: 'frame', a: at(t0, 0.04), b: at(t1, 0.04), thick: 0.06, y0: sl.h1 - bar, y1: sl.h1, extend: bar });
  boxes.push({ kind: 'frame', a: at(t0, 0.04), b: at(t1, 0.04), thick: 0.06, y0: sl.h0, y1: sl.h0 + bar, extend: bar });
  for (const q of sl.solid ? [t0, t1] : [t0, sl.t, t1]) {
    boxes.push({ kind: 'frame', a: at(q - bar / 2, 0.04), b: at(q + bar / 2, 0.04), thick: 0.06, y0: sl.h0, y1: sl.h1, extend: 0 });
  }
  if (sl.h0 > 0.5) boxes.push({ kind: 'frame', a: at(t0, 0.06), b: at(t1, 0.06), thick: 0.1, y0: sl.h0 - 0.05, y1: sl.h0, extend: 0.08 });
  return boxes;
}
