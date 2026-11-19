import { distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../siteplan/types';

/**
 * Where a house's windows and doors go. Pure plan geometry (no three.js), so it can be tested on its own.
 * Every opening is a run along ONE wall edge that is fully inside that edge, clear of its ends, and clear of any
 * other structure (a cover, a California room, another building) standing against that stretch of wall.
 */

export interface WallSide { a: Vec2; dir: Vec2; out: Vec2; len: number; edge: number }
/**
 * What an opening is: a horizontal slider or picture window, a tall narrow sidelight beside the entry, the entry
 * door, a sliding glass patio door, a garage door or a plain solid door.
 */
export type OpeningType = 'window' | 'picture' | 'sidelight' | 'entry' | 'slider' | 'garage' | 'door';
export interface Slot {
  t: number; w: number; h0: number; h1: number;
  /** A solid door (no glass): plain, entry and garage doors. */
  solid?: boolean;
  /** Left out: a window, or (with `solid`) a plain door, or (a door slot without it) a sliding glass door. */
  type?: OpeningType;
  /** Sliding glass doors: 2 or 3 panels. */
  panels?: 2 | 3;
  /** Interior blinds: the share of the glass they cover from the top (0 or left out: none). */
  blinds?: number;
}
export interface PlacedOpening extends Slot { edge: number }
/**
 * Where a step or a raised landing meets a house wall: a run in plan along the wall, the step's top above grade, the
 * plan item it comes from, and whether it is a drawn flight of steps (`steps`) or the edge of a raised zone (`zone`).
 */
export interface Landing { a: Vec2; b: Vec2; top: number; src?: string; kind?: 'steps' | 'zone' }
/** What else stands in front of the walls (house.ts): drawn zones, so the entry's own steps are not built over them. */
export interface OpeningGround { zones?: Vec2[][] }
export interface OpeningPlan {
  sides: WallSide[];
  /** Every opening that fit, by wall edge. */
  placed: PlacedOpening[];
  doorEdge: number;
  /** Centers of the door lights: (edge, t along it). */
  lights: { edge: number; t: number }[];
  /** The front entry (door and sidelights together): its wall, center, whole width, threshold height, and whether its own two steps are built (not when it stands on a landing, under a cover or where a zone is drawn). */
  entry: { edge: number; t: number; w: number; h0: number; steps: boolean } | null;
  /** A chimney chase on a wall (center and width along it), kept clear of the openings. */
  chimney: { edge: number; t: number; w: number } | null;
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

const SAMPLE = 0.05;

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

/** Move an opening of width w centered at t into the run that holds it (or the nearest run it fits in, moving it at most maxShift); null if none is wide enough or near enough. */
export function fitInRuns(runs: [number, number][], t: number, w: number, maxShift = Infinity): number | null {
  let best: number | null = null, bd = Infinity;
  for (const [lo, hi] of runs) {
    if (hi - lo < w - 1e-9) continue;
    const c = Math.max(lo + w / 2, Math.min(hi - w / 2, t));
    if (Math.abs(c - t) <= maxShift && Math.abs(c - t) < bd) { bd = Math.abs(c - t); best = c; }
  }
  return best;
}

const overlaps = (list: Slot[], t: number, w: number, gap: number) => list.some((o) => Math.abs(o.t - t) < o.w / 2 + w / 2 + gap);

/**
 * Heights of openings, kept under the eave: window heads at 6 ft 11 in; large windows (5 to 6 ft sliders and picture
 * windows) sit on a 2 1/2 ft sill, bedroom windows on a 3 1/2 ft one; doors top out at 6 ft 8 in over their sill.
 */
function heights(H: number) {
  const head = Math.min(2.13, H - 0.3);
  return { head, bigSill: Math.max(0.3, Math.min(0.76, head - 0.9)), smallSill: Math.max(0.3, Math.min(1.07, head - 0.6)), doorTop: Math.min(2.1, H - 0.15), doorMax: H - 0.15 };
}

/** Sliding door widths sold (6, 8, 9 and 12 ft) and the 5 ft one for tight spots. */
export const SLIDER_WIDTHS = [3.66, 2.74, 2.44, 1.83, 1.52];
/** The entry door (3 ft) and its sidelights (14 in). */
const ENTRY_DOOR = 0.91, SIDELIGHT = 0.36, SIDE_GAP = 0.06;
/** Two 6 in steps up to the entry. */
export const ENTRY_RISE = 0.3;

/** A steady pseudo-random number in [0, 1) for (a, b). */
const rnd = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + 0.5) * 43758.5453;
  return x - Math.floor(x);
};

/** Where a landing runs along a wall: [t0, t1] along the side, or null when it does not lie along it. */
function landingOn(sd: WallSide, l: Landing): [number, number] | null {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], len = Math.hypot(dx, dy);
  if (len < 0.5 || Math.abs((dx * sd.dir[0] + dy * sd.dir[1]) / len) < 0.95) return null;
  const along = (p: Vec2) => (p[0] - sd.a[0]) * sd.dir[0] + (p[1] - sd.a[1]) * sd.dir[1];
  const off = (p: Vec2) => (p[0] - sd.a[0]) * sd.out[0] + (p[1] - sd.a[1]) * sd.out[1];
  for (const p of [l.a, l.b]) { const o = off(p); if (o < -0.25 || o > 0.45) return null; }
  const t0 = Math.max(0, Math.min(along(l.a), along(l.b))), t1 = Math.min(sd.len, Math.max(along(l.a), along(l.b)));
  return t1 - t0 >= 0.9 ? [t0, t1] : null;
}

/** How deep the recess is when a wall is the back of one (the corners at both its ends turn outward), else 0. */
export function recessOf(sd: WallSide, sides: WallSide[]): number {
  const i = sides.indexOf(sd), n = sides.length;
  if (i < 0 || n < 4) return 0;
  const prev = sides[(i - 1 + n) % n], next = sides[(i + 1) % n];
  // A side wall of a recess runs out from this wall, so its outward normal is along this wall's direction.
  const pOut = prev.out[0] * sd.dir[0] + prev.out[1] * sd.dir[1], nOut = next.out[0] * sd.dir[0] + next.out[1] * sd.dir[1];
  const pRun = -(prev.dir[0] * sd.out[0] + prev.dir[1] * sd.out[1]), nRun = next.dir[0] * sd.out[0] + next.dir[1] * sd.out[1];
  if (pOut > 0.9 && nOut < -0.9 && pRun > 0.9 && nRun > 0.9) return Math.min(prev.len, next.len);
  return 0;
}

export function planOpenings(s: ExistingStructure, all: ExistingStructure[], siteCenter: Vec2, landings: Landing[] = [], ground: OpeningGround = {}): OpeningPlan {
  const poly = s.polygon, H = s.height;
  const sides = wallSides(poly);
  // Other buildings block the wall they stand against; a cover only blocks where its walls and posts are.
  const nb = all.filter((o) => o !== s && o.polygon !== poly);
  const others = nb.filter((o) => o.kind !== 'cover').map((o) => o.polygon);
  const solids = nb.filter((o) => o.kind === 'cover').flatMap(coverSolids);
  const hts = heights(H);
  const placed: PlacedOpening[] = [];
  const lights: { edge: number; t: number }[] = [];
  // Free runs are computed once per wall and clearance, shared by the automatic and the marked openings.
  const runCache = new Map<string, [number, number][]>();
  const runsFor = (sd: WallSide, clear: number) => {
    const key = `${sd.edge}:${clear}`;
    let r = runCache.get(key);
    if (!r) runCache.set(key, (r = freeRuns(sd, poly, others, clear, solids)));
    return r;
  };
  const runsOf = (sd: WallSide) => runsFor(sd, CORNER_CLEAR);
  // Under a cover, openings stay below its beam or header (its roof underside less the deepest header, and 0.1 m).
  const covers = nb.filter((o) => o.kind === 'cover');
  const capAt = (sd: WallSide, t: number, w: number) => {
    let cap = Infinity;
    for (const c of covers) {
      const under = c.height - (c.room || c.walls?.some(Boolean) ? 0.55 : 0.42) - 0.1;
      for (const tt of [t - w / 2, t, t + w / 2]) {
        const p: Vec2 = [sd.a[0] + sd.dir[0] * tt + sd.out[0] * 0.3, sd.a[1] + sd.dir[1] * tt + sd.out[1] * 0.3];
        if (pointInPolygon(p, c.polygon)) { cap = Math.min(cap, under); break; }
      }
    }
    return cap;
  };
  const MAX_MARK_SHIFT = 1.0;
  const MIN_WIN = 0.6, MIN_DOOR = 1.6;
  const isHouse = s.kind === 'house';
  /** A window slot at t, lowered under any cover beam; null if it would be too short. */
  const winSlot = (sd: WallSide, t: number, w: number, sill: number, type: OpeningType = 'window', blinds = 0): Slot | null => {
    const h1 = Math.min(hts.head, capAt(sd, t, w)), h0 = Math.max(0.02, Math.min(sill, h1 - MIN_WIN));
    return h1 - h0 >= MIN_WIN ? { t, w, h0, h1, type, blinds } : null;
  };
  /** A door slot at t on sill h0, `tall` high where the eave and any cover allow; null if it would be too short. */
  const doorSlot = (sd: WallSide, t: number, w: number, h0: number, tall: number, type: OpeningType, extra: Partial<Slot> = {}): Slot | null => {
    // A garage door keeps room for its trim head under the eave.
    const h1 = Math.min(h0 + tall, hts.doorMax - (type === 'garage' ? 0.1 : 0), capAt(sd, t, w));
    if (h1 - h0 < MIN_DOOR) return null;
    return { t, w, h0, h1, type, solid: type === 'entry' || type === 'garage' || type === 'door', ...extra };
  };
  /** Blinds on about half the windows, each let down its own way. */
  const blindsAt = (a: number, b: number) => (s.look?.blinds === false ? 0 : rnd(a, b) < 0.55 ? 0.22 + rnd(b, a) * 0.45 : 0);
  const slotsOn = new Map<number, Slot[]>();
  const add = (sd: WallSide, sl: Slot) => { const l = slotsOn.get(sd.edge) ?? []; l.push(sl); slotsOn.set(sd.edge, l); };
  const busy = (sd: WallSide, t: number, w: number, gap: number) => overlaps(slotsOn.get(sd.edge) ?? [], t, w, gap);
  const facing = (sd: WallSide) => {
    const mid: Vec2 = [sd.a[0] + sd.dir[0] * sd.len / 2, sd.a[1] + sd.dir[1] * sd.len / 2];
    const to: Vec2 = [siteCenter[0] - mid[0], siteCenter[1] - mid[1]];
    const l = Math.hypot(to[0], to[1]) || 1;
    return (to[0] * sd.out[0] + to[1] * sd.out[1]) / l;
  };
  let entry: OpeningPlan['entry'] = null, chimney: OpeningPlan['chimney'] = null;
  let doorEdge = -1;

  /** The entry: the door with a sidelight each side when the run holds them (two steps up to it). */
  const placeEntry = (sd: WallSide, tWant: number, total: number, runs: [number, number][], maxShift: number): boolean => {
    for (const W of total >= ENTRY_DOOR + 2 * (SIDELIGHT + SIDE_GAP) ? [total, ENTRY_DOOR + 2 * (SIDELIGHT + SIDE_GAP), ENTRY_DOOR] : [Math.min(total, 1.07), ENTRY_DOOR]) {
      const t = fitInRuns(runs, tWant, W, maxShift);
      if (t === null || busy(sd, t, W, 0.25)) continue;
      // On a landing or drawn steps: its top, and no steps of its own. Under a cover or where a zone is drawn: at grade.
      const land = landingAt(sd, t, W);
      const front: Vec2 = [sd.a[0] + sd.dir[0] * t + sd.out[0] * 0.3, sd.a[1] + sd.dir[1] * t + sd.out[1] * 0.3];
      const flat = covers.some((c) => pointInPolygon(front, c.polygon)) || (ground.zones ?? []).some((z) => pointInPolygon(front, z));
      const own = !land && !flat;
      const h0 = land ? land.top : own ? Math.max(0.02, Math.min(ENTRY_RISE, hts.doorMax - 2.03)) : 0.02;
      const sideW = W >= ENTRY_DOOR + 2 * (0.25 + SIDE_GAP) ? Math.min(0.45, (W - ENTRY_DOOR - 2 * SIDE_GAP) / 2) : 0;
      const dw = W - 2 * (sideW ? sideW + SIDE_GAP : 0);
      const door = doorSlot(sd, t, dw, h0, 2.03, 'entry');
      if (!door) continue;
      add(sd, door);
      if (sideW) for (const d of [-1, 1]) add(sd, { t: t + d * (dw / 2 + SIDE_GAP + sideW / 2), w: sideW, h0: door.h0, h1: door.h1, type: 'sidelight' });
      entry = { edge: sd.edge, t, w: W, h0: door.h0, steps: own };
      if (land) land.used = true;
      for (const d of [-1, 1]) lights.push({ edge: sd.edge, t: t + d * (W / 2 + 0.35) });
      return true;
    }
    return false;
  };
  /** A sliding glass door: the widest of `widths` that fits near tWant. */
  const placeSlider = (sd: WallSide, tWant: number, widths: number[], h0: number, tall: number, runs: [number, number][], maxShift: number, panels?: 2 | 3): Slot | null => {
    for (const w of widths) {
      const t = fitInRuns(runs, tWant, w, maxShift);
      if (t === null || busy(sd, t, w, 0.25)) continue;
      const sl = doorSlot(sd, t, w, h0, tall, 'slider', { panels: panels ?? (w >= 3.5 ? 3 : 2), blinds: blindsAt(sd.edge + 7, t) });
      if (!sl) continue;
      add(sd, sl);
      return sl;
    }
    return null;
  };

  // Steps and landings against the walls: the door at each one stands on its top.
  // Runs on one wall at the same top that touch or overlap are one landing (a flight drawn in several segments, a
  // zone edge split at a point); each remembers the plan items it came from.
  type Landed = { sd: WallSide; t0: number; t1: number; top: number; srcs: Set<string>; steps: boolean; used: boolean };
  const landed: Landed[] = [];
  if (isHouse) for (const l of landings) for (const sd of sides) {
    const r = landingOn(sd, l);
    if (!r) continue;
    const top = Math.max(0.02, Math.min(0.9, l.top)), src = l.src ?? `${l.a}`;
    const hit = landed.find((x) => x.sd.edge === sd.edge && Math.abs(x.top - top) < 0.01 && r[0] <= x.t1 + 0.1 && r[1] >= x.t0 - 0.1);
    if (hit) { hit.t0 = Math.min(hit.t0, r[0]); hit.t1 = Math.max(hit.t1, r[1]); hit.srcs.add(src); hit.steps ||= l.kind !== 'zone'; }
    else landed.push({ sd, t0: r[0], t1: r[1], top, srcs: new Set([src]), steps: l.kind !== 'zone', used: false });
  }
  const landingAt = (sd: WallSide, t: number, w: number) => landed.find((x) => x.sd.edge === sd.edge && t + w / 2 > x.t0 + 0.1 && t - w / 2 < x.t1 - 0.1);

  if (s.openings) {
    // Doors and windows the designer marked: each goes on the wall nearest its mark, if it fits there.
    let lit = false;
    for (const op of s.openings) {
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
      const runs = runsFor(sd, MARKED_CLEAR);
      if (op.kind === 'window') {
        const t = fitInRuns(runs, bt, w, MAX_MARK_SHIFT);
        if (t === null || busy(sd, t, w, 0.05)) continue;
        const sl = winSlot(sd, t, w, w >= 1.4 ? hts.bigSill : hts.smallSill, op.style === 'picture' ? 'picture' : 'window', blindsAt(sd.edge, t));
        if (sl) add(sd, sl);
        continue;
      }
      // A door up to 1.5 m wide is a solid door; wider ones are sliding glass, unless the mark says what it is.
      const style = op.style ?? (w <= 1.5 ? 'door' : 'slider');
      if (style === 'entry') {
        if (isHouse && !entry && placeEntry(sd, bt, w, runs, MAX_MARK_SHIFT)) continue;
      }
      const t = fitInRuns(runs, bt, w, MAX_MARK_SHIFT);
      if (t === null || busy(sd, t, w, 0.05)) continue;
      const land = landingAt(sd, t, w);
      const h0 = land ? land.top : 0.02;
      let sl: Slot | null;
      if (style === 'slider') sl = doorSlot(sd, t, w, h0, op.height ?? 2.03, 'slider', { panels: op.panels ?? (w >= 3.5 ? 3 : 2), blinds: blindsAt(sd.edge + 7, t) });
      else if (style === 'garage') sl = doorSlot(sd, t, w, 0.02, op.height ?? 2.13, 'garage');
      else sl = doorSlot(sd, t, w, h0, 2.03, style === 'entry' ? 'entry' : 'door');
      if (!sl) continue;
      add(sd, sl);
      if (land) land.used = true;   // the marked door takes the landing
      if (style === 'entry' && !entry) entry = { edge: sd.edge, t, w, h0: sl.h0, steps: false };
      if (!lit && style !== 'garage') {
        lit = true;
        for (const d of [-1, 1]) lights.push({ edge: sd.edge, t: t + d * (w / 2 + 0.4) });
      }
      if (doorEdge < 0 && style !== 'garage') doorEdge = sd.edge;
    }
  }

  // Marked windows replace the automatic ones; marked doors replace the automatic doors (a garage door alone does not).
  const auto = !s.openings?.some((o) => o.kind === 'window');
  const autoDoors = !s.openings?.some((o) => o.kind === 'door' && o.style !== 'garage');

  // A door at every step or landing left: a sliding glass door centered on it, as wide as it allows, else a plain door.
  // Drawn steps always get one; a raised landing only while no door is marked. At most one per plan item and wall.
  if (isHouse && s.stepDoors !== false) {
    const usedSrc = new Set<string>();
    for (const ld of landed) {
      if (ld.used || ld.t1 - ld.t0 < 0.9 || (!ld.steps && !autoDoors)) continue;
      if ([...ld.srcs].some((x) => usedSrc.has(`${ld.sd.edge}|${x}`))) continue;
      const span = ld.t1 - ld.t0, mid = (ld.t0 + ld.t1) / 2, runs = runsFor(ld.sd, MARKED_CLEAR);
      let sl = placeSlider(ld.sd, mid, SLIDER_WIDTHS.filter((w) => w <= span + 0.2), ld.top, 2.03, runs, 0.6);
      if (!sl) {
        const t = fitInRuns(runs, mid, 0.91, 0.6);
        sl = t === null || busy(ld.sd, t, 0.91, 0.25) ? null : doorSlot(ld.sd, t, 0.91, ld.top, 2.03, 'door');
        if (sl) add(ld.sd, sl);
      }
      if (!sl) continue;
      ld.used = true;
      for (const x of ld.srcs) usedSrc.add(`${ld.sd.edge}|${x}`);
      if (doorEdge < 0) {
        doorEdge = ld.sd.edge;
        for (const d of [-1, 1]) lights.push({ edge: ld.sd.edge, t: sl.t + d * (sl.w / 2 + 0.4) });
      }
    }
  }
  if (autoDoors && hts.doorTop >= MIN_DOOR) {
    if (isHouse) {
      // The patio door goes on the wall facing the yard that has room for it (unless a step already has one).
      if (doorEdge < 0) {
        let best = -Infinity, bsd: WallSide | null = null;
        for (const sd of sides) {
          const score = facing(sd) * 10 + sd.len * 0.1;
          if (score <= best || fitInRuns(runsOf(sd), sd.len / 2, 1.83) === null) continue;
          best = score;
          bsd = sd;
        }
        if (bsd) {
          const sl = placeSlider(bsd, bsd.len / 2, [2.44, 1.83], 0.02, 2.03, runsOf(bsd), Infinity);
          if (sl) {
            doorEdge = bsd.edge;
            for (const d of [-1, 1]) lights.push({ edge: bsd.edge, t: sl.t + d * (sl.w / 2 + 0.4) });
          }
        }
        if (doorEdge < 0) {
          // No run for a sliding door anywhere: a plain door on the yard side.
          for (const sd of [...sides].sort((a, b) => facing(b) - facing(a))) {
            const t = fitInRuns(runsOf(sd), sd.len / 2, 0.9);
            const sl = t === null ? null : doorSlot(sd, t, 0.9, 0.02, 2.03, 'door');
            if (sl) { add(sd, sl); doorEdge = sd.edge; for (const d of [-1, 1]) lights.push({ edge: sd.edge, t: t! + d * 0.85 }); break; }
          }
        }
      }
      // The front entry: the wall facing away from the yard, with the door and its sidelights.
      if (sides.length >= 4) {
        // A wall set back in a recess is where an entry is; a wall with a garage door never is.
        const rank = (sd: WallSide) => facing(sd) - sd.len * 0.02 - (recessOf(sd, sides) > 0.4 ? 1 : 0);
        const cand = sides.filter((sd) => sd.edge !== doorEdge && facing(sd) < -0.3 && !(slotsOn.get(sd.edge) ?? []).some((x) => x.type === 'garage')).sort((a, b) => rank(a) - rank(b));
        for (const sd of cand) if (placeEntry(sd, sd.len / 2, ENTRY_DOOR + 2 * (SIDELIGHT + SIDE_GAP), runsOf(sd), Infinity)) break;
      }
    } else {
      // Sheds and garages: one door on the yard side; a garage gets its garage door on the side facing away.
      let dEdge = -1;
      for (const w of [1.0, 0.9]) {
        let best = -Infinity, pick: { sd: WallSide; t: number; h: number } | null = null;
        for (const sd of sides) {
          const mid: Vec2 = [sd.a[0] + sd.dir[0] * sd.len / 2, sd.a[1] + sd.dir[1] * sd.len / 2];
          const score = (siteCenter[0] - mid[0]) * sd.out[0] + (siteCenter[1] - mid[1]) * sd.out[1] + sd.len * 0.1;
          if (score <= best) continue;
          const t = fitInRuns(runsOf(sd), sd.len / 2, w);
          if (t === null) continue;
          const h = Math.min(hts.doorTop, capAt(sd, t, w));
          if (h < MIN_DOOR) continue;
          best = score;
          pick = { sd, t, h };
        }
        if (pick) {
          add(pick.sd, { t: pick.t, w, h0: 0.02, h1: pick.h, solid: true, type: 'door' });
          dEdge = doorEdge = pick.sd.edge;
          for (const d of [-1, 1]) lights.push({ edge: pick.sd.edge, t: pick.t + d * (w / 2 + 0.4) });
          break;
        }
      }
      if (s.kind === 'garage') {
        for (const sd of [...sides].sort((a, b) => facing(a) - facing(b))) {
          if (sd.edge === dEdge || sd.len < 3.4) continue;
          const w = sd.len >= 5.8 ? 4.88 : 2.74;
          const t = fitInRuns(runsOf(sd), sd.len / 2, w);
          const sl = t === null ? null : doorSlot(sd, t, w, 0.02, 2.13, 'garage');
          if (sl) { add(sd, sl); break; }
        }
      }
    }
  }

  // The chimney: on a side wall (not the entry or the patio door wall), clear of what is there.
  if (s.chimney && s.kind !== 'cover') {
    const front = entry ? sides.find((x) => x.edge === entry!.edge) : null;
    let best = -Infinity;
    for (const sd of sides) {
      if (sd.len < 2.4 || sd.edge === entry?.edge || sd.edge === doorEdge) continue;
      const side = front ? 1 - Math.abs(front.out[0] * sd.out[0] + front.out[1] * sd.out[1]) : 1 - Math.abs(facing(sd));
      const score = side * 4 + Math.min(sd.len, 10) * 0.1;
      if (score <= best) continue;
      for (const f of [0.5, 0.3, 0.7]) {
        const t = fitInRuns(runsOf(sd), sd.len * f, 1.5, 1.0);
        if (t === null || busy(sd, t, 1.5, 0.3)) continue;
        best = score;
        chimney = { edge: sd.edge, t, w: 1.5 };
        break;
      }
    }
  }

  // Windows: large sliders and picture windows on the yard and the front, bedroom windows on the sides.
  if (auto) for (const sd of sides) {
    if (s.kind !== 'house' && sd.edge !== doorEdge) continue;
    if (sd.len < 1.4) continue;
    const runs = runsOf(sd);
    const role = !isHouse ? 'side' : sd.edge === doorEdge || facing(sd) > 0.5 ? 'yard' : sd.edge === entry?.edge || facing(sd) < -0.5 ? 'front' : 'side';
    // An entry set in a recess: the recess's short side walls stay plain.
    if (entry && sd.edge !== entry.edge && sd.len < 2.6) {
      const e = sides.find((x) => x.edge === entry!.edge)!;
      const touches = Math.hypot(sd.a[0] - e.a[0] - e.dir[0] * e.len, sd.a[1] - e.a[1] - e.dir[1] * e.len) < 1e-6 ||
        Math.hypot(sd.a[0] + sd.dir[0] * sd.len - e.a[0], sd.a[1] + sd.dir[1] * sd.len - e.a[1]) < 1e-6;
      if (touches) continue;
    }
    const big = role !== 'side';
    const widths = big ? [1.83, 1.52, 1.22, 0.91] : [1.22, 0.91, 0.61];
    const chim = chimney && chimney.edge === sd.edge ? [{ t: chimney.t, w: chimney.w, h0: 0, h1: 0 }] : [];
    const taken = (t: number, w: number) => busy(sd, t, w, 0.3) || overlaps(chim, t, w, 0.3);
    if (sd.len < 2.6) {
      // A short wall (a bay window's facet): one window as wide as it allows.
      const w = Math.min(1.22, sd.len - 2 * CORNER_CLEAR - 0.05);
      const t = w >= 0.6 ? fitInRuns(runs, sd.len / 2, w) : null;
      const sl = t === null || taken(t, w) ? null : winSlot(sd, t, w, hts.bigSill, 'window', blindsAt(sd.edge, 1));
      if (sl) add(sd, sl);
      continue;
    }
    const n = Math.max(1, Math.floor((sd.len - 0.8) / (widths[0] + 1.9)));
    for (let k = 0; k < n; k++) {
      for (const w0 of widths) {
        const tt = fitInRuns(runs, ((k + 0.5) / n) * sd.len, w0, 1.2);
        if (tt === null || taken(tt, w0)) continue;
        const type: OpeningType = role === 'yard' && w0 >= 1.8 && k % 2 === 1 ? 'picture' : 'window';
        const sl = winSlot(sd, tt, w0, big ? hts.bigSill : hts.smallSill, type, blindsAt(sd.edge, k));
        if (sl) { add(sd, sl); break; }
      }
    }
  }
  for (const sd of sides) for (const sl of slotsOn.get(sd.edge) ?? []) placed.push({ ...sl, edge: sd.edge });
  return { sides, placed, doorEdge, lights, entry, chimney };
}

/** What a box of an opening is made of (builder/house.ts gives each its material). */
export type BoxKind = 'frame' | 'pane' | 'door' | 'trim' | 'track' | 'handle' | 'garage' | 'groove';
/** One box of an opening: a segment a-b in plan (thickness centered on it), y0..y1, optionally lengthened at both ends. */
export interface OpeningBox { kind: BoxKind; a: Vec2; b: Vec2; thick: number; y0: number; y1: number; extend: number; blinds?: number }

/**
 * The boxes that make up an opening, all standing on the wall face (outward offsets 0 to 0.12 m): thin vinyl frames
 * and sashes for windows, a framed door with a glass insert and panels for the entry, panels on two tracks with a
 * handle, threshold and rails for a sliding door, and a sectional panel door for a garage.
 */
export function openingBoxes(sd: WallSide, sl: Slot, garageStyle = 'raised'): OpeningBox[] {
  const at = (t: number, d: number): Vec2 => [sd.a[0] + sd.dir[0] * t + sd.out[0] * d, sd.a[1] + sd.dir[1] * t + sd.out[1] * d];
  const t0 = sl.t - sl.w / 2, t1 = sl.t + sl.w / 2;
  const boxes: OpeningBox[] = [];
  /** A box from t a to t b along the wall, from offset d0 to d1 out of it, y0 to y1. */
  const box = (kind: BoxKind, a: number, b: number, d0: number, d1: number, y0: number, y1: number, extend = 0, blinds?: number) => {
    const d = (d0 + d1) / 2;
    boxes.push({ kind, a: at(a, d), b: at(b, d), thick: d1 - d0, y0, y1, extend, ...(blinds !== undefined ? { blinds } : {}) });
  };
  const type: OpeningType = sl.type ?? (sl.solid ? 'door' : sl.h0 < 0.1 && sl.h1 - sl.h0 > 1.5 ? 'slider' : 'window');
  const { h0, h1 } = sl;

  if (type === 'window' || type === 'picture' || type === 'sidelight') {
    // Thin white vinyl: a 2 in frame; a slider has two sashes, the moving one on the inner track, meeting at a rail.
    const F = type === 'sidelight' ? 0.05 : 0.055;
    box('pane', t0, t1, 0.006, 0.016, h0, h1, 0, sl.blinds ?? 0);
    box(type === 'sidelight' ? 'trim' : 'frame', t0, t1, 0.01, 0.065, h1 - F, h1, F);
    box(type === 'sidelight' ? 'trim' : 'frame', t0, t1, 0.01, 0.065, h0, h0 + F, F);
    for (const q of [t0, t1]) box(type === 'sidelight' ? 'trim' : 'frame', q - F / 2, q + F / 2, 0.01, 0.065, h0, h1);
    if (type === 'window' && sl.w >= 0.9) {
      const m = sl.t;
      // The two sashes' meeting stiles, side by side on their tracks, and each sash's top and bottom rail.
      box('frame', m - 0.035, m, 0.03, 0.058, h0 + F, h1 - F);
      box('frame', m, m + 0.035, 0.016, 0.044, h0 + F, h1 - F);
      box('frame', t0 + F / 2, m, 0.03, 0.058, h0 + F, h0 + F + 0.03);
      box('frame', t0 + F / 2, m, 0.03, 0.058, h1 - F - 0.03, h1 - F);
      box('frame', m, t1 - F / 2, 0.016, 0.044, h0 + F, h0 + F + 0.03);
      box('frame', m, t1 - F / 2, 0.016, 0.044, h1 - F - 0.03, h1 - F);
    }
    // A slim sill under windows that stand off the ground.
    if (h0 > 0.5) box('trim', t0, t1, 0.01, 0.075, h0 - 0.035, h0, 0.04);
    return boxes;
  }

  if (type === 'slider') {
    // Sliding glass door: the outer frame, the threshold with its two rails, and the panels: the fixed ones on the outer
    // track, the sliding one (the middle of three) on the inner track, overlapping its neighbors at the interlock.
    const F = 0.06, OV = 0.05;
    const n = sl.panels ?? (sl.w >= 3.5 ? 3 : 2);
    box('frame', t0, t1, 0.004, 0.085, h1 - F, h1, F);
    for (const q of [t0, t1]) box('frame', q - F / 2, q + F / 2, 0.004, 0.085, h0, h1);
    box('track', t0, t1, 0.0, 0.11, h0 - 0.02, h0 + 0.025, F / 2);
    for (const d of [0.028, 0.06]) box('track', t0, t1, d - 0.004, d + 0.004, h0 + 0.025, h0 + 0.04);
    const inner0 = t0 + F / 2, inner1 = t1 - F / 2;
    const pw = (inner1 - inner0 + OV * (n - 1)) / n;
    const top = h1 - F, bot = h0 + 0.04;
    for (let i = 0; i < n; i++) {
      const a = inner0 + i * (pw - OV), b = a + pw;
      const slide = n === 3 ? i === 1 : i === 0;
      const [d0, d1] = slide ? [0.012, 0.046] : [0.048, 0.082];
      box('pane', a + 0.03, b - 0.03, (d0 + d1) / 2 - 0.004, (d0 + d1) / 2 + 0.004, bot + 0.06, top - 0.05, 0, sl.blinds ?? 0);
      const SW = 0.055, IL = 0.07;   // stile, interlock stile
      const leftW = i === 0 ? SW : IL, rightW = i === n - 1 ? SW : IL;
      box('frame', a, a + leftW, d0, d1, bot, top);
      box('frame', b - rightW, b, d0, d1, bot, top);
      box('frame', a + leftW, b - rightW, d0, d1, top - 0.06, top);
      box('frame', a + leftW, b - rightW, d0, d1, bot, bot + 0.095);
      if (slide) {
        // The pull: a tall handle on the sliding panel's latch stile, standing off the glass.
        const hx = i === 0 ? a + 0.03 : b - 0.03;
        box('handle', hx - 0.012, hx + 0.012, d0 - 0.012, d0, h0 + 0.85, h0 + 1.13);
        box('handle', hx - 0.012, hx + 0.012, d1, d1 + 0.03, h0 + 0.85, h0 + 1.13);
      }
    }
    return boxes;
  }

  if (type === 'garage') {
    // Sectional garage door in four sections, with the style's panels or grooves; trim around the opening.
    const T = 0.09;
    box('trim', t0 - T, t1 + T, 0.01, 0.07, h1, h1 + T);
    for (const q of [t0 - T / 2, t1 + T / 2]) box('trim', q - T / 2, q + T / 2, 0.01, 0.07, h0 - 0.02, h1);
    box('garage', t0, t1, 0.0, 0.035, h0, h1);
    const secs = 4, sh = (h1 - h0) / secs;
    for (let k = 1; k < secs; k++) box('groove', t0, t1, 0.035, 0.04, h0 + k * sh - 0.006, h0 + k * sh + 0.006);
    const style = garageStyle;
    for (let k = 0; k < secs; k++) {
      const y0 = h0 + k * sh, y1 = y0 + sh;
      if (style === 'raised' || style === 'long') {
        const cols = style === 'long' ? (sl.w > 3.5 ? 4 : 2) : Math.max(4, Math.round(sl.w / 0.6));
        const gap = 0.07, cw = (sl.w - gap * (cols + 1)) / cols;
        for (let c = 0; c < cols; c++) {
          const a = t0 + gap + c * (cw + gap), b = a + cw, p0 = y0 + 0.07, p1 = y1 - 0.07;
          box('garage', a + 0.02, b - 0.02, 0.035, 0.05, p0 + 0.02, p1 - 0.02);
          // The panel's sunk outline, so the pattern reads in full sun.
          box('groove', a, b, 0.035, 0.042, p0, p0 + 0.012);
          box('groove', a, b, 0.035, 0.042, p1 - 0.012, p1);
          box('groove', a, a + 0.012, 0.035, 0.042, p0, p1);
          box('groove', b - 0.012, b, 0.035, 0.042, p0, p1);
        }
      } else if (style === 'ribbed') {
        for (let r = 1; r < 6; r++) box('groove', t0 + 0.03, t1 - 0.03, 0.035, 0.041, y0 + (r * sh) / 6 - 0.004, y0 + (r * sh) / 6 + 0.004);
      } else if (style === 'carriage') {
        // Vertical boards, the top section glazed in small lites, and black strap handles.
        const boards = Math.round(sl.w / 0.15);
        for (let c = 1; c < boards; c++) { const x = t0 + (c * sl.w) / boards; box('groove', x - 0.004, x + 0.004, 0.035, 0.04, y0 + 0.01, y1 - 0.01); }
        if (k === secs - 1) {
          const lites = Math.max(4, Math.round(sl.w / 0.6)), lw = (sl.w - 0.08 * (lites + 1)) / lites;
          for (let c = 0; c < lites; c++) { const a = t0 + 0.08 + c * (lw + 0.08); box('pane', a, a + lw, 0.04, 0.046, y0 + 0.1, y1 - 0.1); }
        }
      }
    }
    if (style === 'carriage') for (const q of [t0 + sl.w * 0.42, t1 - sl.w * 0.42]) box('handle', q - 0.1, q + 0.1, 0.04, 0.055, h0 + sh * 1.5 - 0.02, h0 + sh * 1.5 + 0.02);
    return boxes;
  }

  // Doors: the entry has a glass insert and two raised panels under it, set in a trim frame with a threshold and a
  // lever; a plain door is a slab in its frame.
  const F = 0.07;
  box('trim', t0, t1, 0.01, 0.075, h1 - F, h1, F);
  for (const q of [t0, t1]) box('trim', q - F / 2, q + F / 2, 0.01, 0.075, h0, h1);
  box('door', t0, t1, 0.0, 0.045, h0, h1);
  box('track', t0, t1, 0.0, 0.08, h0 - 0.02, h0 + 0.01, F / 2);
  if (type === 'entry') {
    const m = 0.11, gy0 = h0 + (h1 - h0) * 0.42, gy1 = h1 - 0.16;
    box('pane', t0 + m + 0.02, t1 - m - 0.02, 0.044, 0.05, gy0 + 0.02, gy1 - 0.02);
    // The insert's frame.
    box('door', t0 + m, t1 - m, 0.045, 0.058, gy1 - 0.025, gy1);
    box('door', t0 + m, t1 - m, 0.045, 0.058, gy0, gy0 + 0.025);
    for (const q of [t0 + m, t1 - m - 0.025]) box('door', q, q + 0.025, 0.045, 0.058, gy0, gy1);
    // Two raised panels below.
    const pw = (sl.w - 3 * m) / 2;
    for (const a of [t0 + m, t0 + 2 * m + pw]) box('door', a, a + pw, 0.045, 0.056, h0 + 0.16, gy0 - 0.12);
  }
  const lx = t1 - 0.09;
  box('handle', lx - 0.02, lx + 0.02, 0.045, 0.06, h0 + 0.92, h0 + 0.98);
  box('handle', lx - 0.12, lx + 0.02, 0.06, 0.08, h0 + 0.94, h0 + 0.965);
  if (type === 'entry') box('handle', lx - 0.02, lx + 0.02, 0.045, 0.06, h0 + 1.12, h0 + 1.17);
  return boxes;
}
