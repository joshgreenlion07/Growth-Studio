import type { Vec2 } from '../siteplan/types';

/**
 * Board layout of a composite deck, in plan meters (no Three.js here, so it can be checked on its own).
 *
 * A deck is laid the way it is built: a picture frame of boards along the outside edge and around every cutout,
 * mitered at the corners; the field inside it in straight runs, on the diagonal, or as a chevron (two halves at 45
 * degrees meeting on a center seam, each board mitered to its twin across the seam); butt joints where a run is
 * longer than a board; a gap between all boards; fascia boards on the sides.
 *
 * Every piece is the exact shape of the board as cut: the board's strip clipped to what is left of the deck after
 * the frame, cutouts and gaps (see `region`), so cuts at the seam, the frame and around a spa follow those lines.
 */

export type DeckPattern = 'straight' | 'diagonal' | 'chevron';

export interface DeckLayoutInput {
  /** Outside edge of the deck. Either winding. */
  outline: Vec2[];
  /** Openings through the deck (a spa set into it, a tree). They may cross the outside edge. */
  holes: Vec2[][];
  pattern: DeckPattern;
  /** Direction of the boards (straight), or of the seam (chevron, diagonal: boards at 45 degrees to it), radians in plan. */
  angle: number;
  /** Board face width and the gap between boards, meters. */
  board: number;
  gap: number;
  /** Picture-frame border: one board along the outside edge and around each opening. */
  frame: boolean;
  /** Chevron: a straight divider board along the seam. */
  divider: boolean;
  /** Chevron: the seam's distance from the middle of the deck, meters (across the seam). */
  seamOffset: number;
  /** Longest board, meters: longer runs get staggered butt joints. */
  maxLength: number;
  /** How far the framing under the boards stays in from the edge, meters (behind the fascia). */
  underInset: number;
}

export interface BoardPiece {
  /** Outline, counter-clockwise in plan math (signedArea > 0), with any holes inside it. */
  ring: Vec2[];
  holes: Vec2[][];
  /** Unit vector along the board (its grain). */
  dir: Vec2;
  kind: 'field' | 'frame' | 'divider';
  /** Stable number for the board's own grain offset and tone. */
  id: number;
  /** Frame boards on a curve: where along the run this piece starts (meters), so the grain carries on. */
  along?: number;
}

/** A side of the deck that gets fascia: the edge from a to b and the direction its face looks. */
export interface FasciaRun {
  a: Vec2;
  b: Vec2;
  out: Vec2;
}

export interface DeckLayout {
  pieces: BoardPiece[];
  fascia: FasciaRun[];
  /** The area under the boards (deck minus openings), for the dark framing seen through the gaps. */
  under: { ring: Vec2[]; holes: Vec2[][] }[];
}

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                 */

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left normal in plan math (counter-clockwise quarter turn). */
const left = (a: Vec2): Vec2 => [-a[1], a[0]];
const rot = (a: Vec2, r: number): Vec2 => [a[0] * Math.cos(r) - a[1] * Math.sin(r), a[0] * Math.sin(r) + a[1] * Math.cos(r)];

export function ringArea(r: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += cross(r[i], r[(i + 1) % r.length]);
  return s / 2;
}

function inRing(p: Vec2, r: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The ring without repeated points, points in line, and a closing copy of the first point; counter-clockwise. */
export function cleanRing(r: Vec2[]): Vec2[] {
  let pts = r.filter((p, i) => i === 0 || len(sub(p, r[i - 1])) > 1e-6);
  if (pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) < 1e-6) pts.pop();
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ab = sub(b, a), bc = sub(c, b);
      if (Math.abs(cross(unit(ab), unit(bc))) < 1e-7 && dot(ab, bc) > 0) {
        pts.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  if (ringArea(pts) < 0) pts = pts.reverse();
  return pts;
}

/**
 * The ring moved by d meters on every edge: inward for d > 0 (counter-clockwise ring), outward for d < 0. Corners are
 * mitered (each vertex where the two moved edges meet), held to 4 d on very sharp corners.
 */
export function offsetRing(r: Vec2[], d: number): Vec2[] {
  const n = r.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = r[(i - 1 + n) % n], p1 = r[i], p2 = r[(i + 1) % n];
    const e1 = unit(sub(p1, p0)), e2 = unit(sub(p2, p1));
    const n1 = left(e1), n2 = left(e2);
    const a1 = add(p0, mul(n1, d)), a2 = add(p1, mul(n2, d));
    const den = cross(e1, e2);
    let q: Vec2;
    if (Math.abs(den) < 1e-9) q = add(p1, mul(n2, d));
    else {
      const t = cross(sub(a2, a1), e2) / den;
      q = add(a1, mul(e1, t));
    }
    const m = sub(q, p1);
    if (len(m) > 4 * Math.abs(d)) q = add(p1, mul(unit(m), 4 * Math.abs(d)));
    out.push(q);
  }
  return out;
}

/** A rectangle around the segment a-b, `w` wide and reaching `ext` past both ends (counter-clockwise). */
function bar(a: Vec2, b: Vec2, w: number, ext: number): Vec2[] {
  const d = unit(sub(b, a)), n = left(d);
  const a2 = sub(a, mul(d, ext)), b2 = add(b, mul(d, ext));
  return [add(a2, mul(n, -w / 2)), add(b2, mul(n, -w / 2)), add(b2, mul(n, w / 2)), add(a2, mul(n, w / 2))];
}

/** A rectangle in a (d, n) frame at `o`: s0..s1 along d, t0..t1 along n (counter-clockwise when d x n > 0). */
function rect(o: Vec2, d: Vec2, n: Vec2, s0: number, s1: number, t0: number, t1: number): Vec2[] {
  const P = (s: number, t: number): Vec2 => add(o, add(mul(d, s), mul(n, t)));
  const r = [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
  return ringArea(r) < 0 ? r.reverse() : r;
}

/* ------------------------------------------------------------------ */
/* Region clipping                                                      */

export interface Piece {
  ring: Vec2[];
  holes: Vec2[][];
}

/**
 * The area inside every ring of `include` and outside every ring of `exclude`, as pieces (outline plus holes).
 *
 * Every ring edge is split where it crosses any other, and each part is kept where the area lies on exactly one side
 * of it (turned so the area is on its left); the kept parts are then chained into loops. Rings may cross each other
 * anywhere, and edges that run along each other are split at each other's ends and kept once.
 */
export function region(include: Vec2[][], exclude: Vec2[][], minArea = 2e-5): Piece[] {
  const rings = [...include, ...exclude].filter((r) => r.length >= 3);
  if (!include.length) return [];
  // Only edges near the box common to every include ring can bound the result.
  let bx0 = -Infinity, by0 = -Infinity, bx1 = Infinity, by1 = Infinity;
  for (const r of include) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of r) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    bx0 = Math.max(bx0, x0); by0 = Math.max(by0, y0); bx1 = Math.min(bx1, x1); by1 = Math.min(by1, y1);
  }
  if (bx0 > bx1 || by0 > by1) return [];
  const pad = 1e-4;
  const edges: [Vec2, Vec2][] = [];
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (len(sub(b, a)) < 1e-9) continue;
      if (Math.max(a[0], b[0]) < bx0 - pad || Math.min(a[0], b[0]) > bx1 + pad || Math.max(a[1], b[1]) < by0 - pad || Math.min(a[1], b[1]) > by1 + pad) continue;
      edges.push([a, b]);
    }
  }
  const inside = (p: Vec2) => include.every((r) => inRing(p, r)) && !exclude.some((r) => inRing(p, r));
  const EPS = 1e-7;
  const segs: { a: Vec2; b: Vec2 }[] = [];
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const e = sub(b, a), L = len(e);
    const ts = [0, 1];
    const ex0 = Math.min(a[0], b[0]) - pad, ex1 = Math.max(a[0], b[0]) + pad, ey0 = Math.min(a[1], b[1]) - pad, ey1 = Math.max(a[1], b[1]) + pad;
    for (let j = 0; j < edges.length; j++) {
      if (j === i) continue;
      const [c, d] = edges[j];
      if (Math.max(c[0], d[0]) < ex0 || Math.min(c[0], d[0]) > ex1 || Math.max(c[1], d[1]) < ey0 || Math.min(c[1], d[1]) > ey1) continue;
      const f = sub(d, c);
      const den = cross(e, f);
      if (Math.abs(den) < 1e-12 * L * len(f)) {
        // Parallel: when the two run along each other, split at the other's ends.
        if (Math.abs(cross(sub(c, a), e)) / L < 1e-7) {
          for (const q of [c, d]) {
            const t = dot(sub(q, a), e) / (L * L);
            if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
          }
        }
        continue;
      }
      const t = cross(sub(c, a), f) / den, u = cross(sub(c, a), e) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u > -1e-9 && u < 1 + 1e-9) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const nl = mul(left(e), 1 / L);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if ((t1 - t0) * L < 1e-8) continue;
      const p = add(a, mul(e, t0)), q = add(a, mul(e, t1)), m = add(a, mul(e, (t0 + t1) / 2));
      const inL = inside(add(m, mul(nl, EPS))), inR = inside(add(m, mul(nl, -EPS)));
      if (inL && !inR) segs.push({ a: p, b: q });
      else if (inR && !inL) segs.push({ a: q, b: p });
    }
  }
  // The same boundary part can come from two rings that run along each other: keep one.
  const TOL = 1e-6;
  const near = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < TOL && Math.abs(p[1] - q[1]) < TOL;
  const uniq: typeof segs = [];
  for (const s of segs) if (!uniq.some((u) => near(u.a, s.a) && near(u.b, s.b))) uniq.push(s);
  // Chain into loops.
  const used = new Array(uniq.length).fill(false);
  const loops: Vec2[][] = [];
  for (let s = 0; s < uniq.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const loop: Vec2[] = [uniq[s].a];
    let cur = uniq[s].b;
    let ok = false;
    for (let guard = 0; guard < uniq.length + 2; guard++) {
      if (near(cur, loop[0])) {
        ok = true;
        break;
      }
      let best = -1, bd = 1e-5;
      for (let k = 0; k < uniq.length; k++) {
        if (used[k]) continue;
        const dd = Math.abs(uniq[k].a[0] - cur[0]) + Math.abs(uniq[k].a[1] - cur[1]);
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      }
      if (best < 0) break;
      used[best] = true;
      loop.push(uniq[best].a);
      cur = uniq[best].b;
    }
    if (ok && loop.length >= 3) loops.push(loop);
  }
  const outers: Piece[] = [];
  const holes: Vec2[][] = [];
  for (const l of loops) {
    const r = cleanRing(l.slice()), a = ringArea(l);
    if (a > 0) {
      if (a >= minArea) outers.push({ ring: r, holes: [] });
    } else if (-a >= 1e-6) holes.push(r.reverse());
  }
  for (const h of holes) {
    const o = outers.find((p) => inRing(h[0], p.ring));
    if (o) o.holes.push(h);
  }
  return outers;
}

/* ------------------------------------------------------------------ */
/* The layout                                                           */

/** True where the outline turns by more than ~12 degrees: a corner the frame is mitered at, not a point on a curve. */
function cornerAt(r: Vec2[], i: number): boolean {
  const n = r.length, a = sub(r[i], r[(i - 1 + n) % n]), b = sub(r[(i + 1) % n], r[i]);
  return Math.abs(Math.atan2(cross(a, b), dot(a, b))) > 0.21;
}

/** Extent of a piece along a direction. */
function extent(ring: Vec2[], d: Vec2): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const p of ring) {
    const s = dot(p, d);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return [lo, hi];
}

/** Cuts a long piece into boards no longer than `maxLength`, with a gap at each butt joint, joints staggered by `stagger`. */
function buttJoints(p: Piece, d: Vec2, maxLength: number, gap: number, stagger: number): Piece[] {
  const [s0, s1] = extent(p.ring, d);
  if (s1 - s0 <= maxLength) return [p];
  const n = left(d);
  const [t0, t1] = extent(p.ring, n);
  const cuts: number[] = [];
  // First joint somewhere in the first board length, then every board length.
  for (let c = s0 + maxLength * (0.45 + 0.55 * stagger); c < s1 - 0.3; c += maxLength) cuts.push(c);
  const out: Piece[] = [];
  let from = s0 - 1;
  for (const c of [...cuts, s1 + 1]) {
    const w = rect([0, 0], d, n, from + (from < s0 ? 0 : gap / 2), c - (c > s1 ? 0 : gap / 2), t0 - 1, t1 + 1);
    out.push(...region([p.ring, w], p.holes));
    from = c;
  }
  return out;
}

/** The board layout of a deck. */
export function deckLayout(inp: DeckLayoutInput): DeckLayout {
  const outline = cleanRing(inp.outline);
  const holes = inp.holes.map(cleanRing).filter((h) => h.length >= 3 && ringArea(h) > 1e-4);
  const B = inp.board, g = inp.gap;
  const pieces: BoardPiece[] = [];
  let id = 0;
  const push = (ps: Piece[], dir: Vec2, kind: BoardPiece['kind'], along?: number) => {
    for (const p of ps) pieces.push({ ...p, dir, kind, id: id++, ...(along !== undefined ? { along } : {}) });
  };

  // Openings with the small gap around them, and the frame bands around them.
  const holeGap = holes.map((h) => offsetRing(h, -g));
  const frameW = inp.frame ? B : 0;
  const inner = inp.frame ? offsetRing(outline, B + g) : outline;

  if (inp.frame) {
    // Outside frame: one board per edge, mitered at the corners (a gap along each miter), butt joints on long runs.
    const ring = outline, iring = offsetRing(outline, B), n = ring.length;
    const miters: Vec2[][] = [];
    for (let i = 0; i < n; i++) if (cornerAt(ring, i)) miters.push(bar(ring[i], iring[i], g, B * 0.5));
    let along = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      const d = unit(sub(b, a));
      const quad = [a, b, iring[(i + 1) % n], iring[i]];
      const parts = region([quad], [...miters, ...holeGap]);
      for (const part of parts) push(buttJoints(part, d, inp.maxLength, g, ((i * 0.37) % 1)), d, 'frame', along);
      along += len(sub(b, a));
    }
    // A frame around each opening, inside the outside frame.
    for (const h of holes) {
      const hg = offsetRing(h, -g), ho = offsetRing(h, -g - B), m = h.length;
      const hm: Vec2[][] = [];
      for (let i = 0; i < m; i++) if (cornerAt(h, i)) hm.push(bar(hg[i], ho[i], g, B * 0.5));
      for (let i = 0; i < m; i++) {
        const a = hg[i], b = hg[(i + 1) % m];
        const d = unit(sub(b, a));
        const quad = [ho[i], ho[(i + 1) % m], b, a];
        const parts = region([ringArea(quad) < 0 ? quad.reverse() : quad, inner], [...hm, ...holeGap]);
        for (const part of parts) push(buttJoints(part, d, inp.maxLength, g, 0.5), d, 'frame');
      }
    }
  }

  // The field: what is left inside the frame, away from the openings and their frames.
  const keepOut = holes.map((h) => offsetRing(h, -(g + frameW + g * (inp.frame ? 1 : 0))));
  const fieldOut = inp.frame ? keepOut : holeGap;
  const sd = unit([Math.cos(inp.angle), Math.sin(inp.angle)]);
  const sn = left(sd);
  // Middle of the deck across the seam, and a reach long enough to cover it from there.
  const [tn0, tn1] = extent(inner, sn);
  const [ts0, ts1] = extent(inner, sd);
  const c: Vec2 = add(mul(sd, (ts0 + ts1) / 2), mul(sn, (tn0 + tn1) / 2 + inp.seamOffset));
  const R = (ts1 - ts0) + (tn1 - tn0) + 2;
  const pitch = B + g;

  /**
   * Strips of boards running along `d` across the area `zone` (include rings), stepped along `n`: the first flush with
   * the zone's edge, or (fromSeam) on a grid from the seam point, so the two chevron halves meet board to board.
   */
  const strips = (zone: Vec2[][], d: Vec2, n: Vec2, fromSeam: boolean) => {
    const [a0, a1] = extent(zone[0], n);
    const t0 = a0 - dot(c, n), t1 = a1 - dot(c, n);
    let o = fromSeam ? 0 : t0 - 0.001;
    o -= Math.ceil((o - t0) / pitch) * pitch;
    for (let t = o; t < t1; t += pitch) {
      const w = rect(c, d, n, -R, R, t, t + B);
      const ps = region([...zone, w], fieldOut);
      const k = Math.round((t - o) / pitch);
      for (const p of ps) {
        const narrow = Math.abs(ringArea(p.ring)) / Math.max(1e-6, extent(p.ring, d)[1] - extent(p.ring, d)[0]);
        if (narrow < 0.012) continue; // a sliver thinner than half an inch is not laid
        push(buttJoints(p, d, inp.maxLength, g, ((k * 0.618) % 1)), d, 'field');
      }
    }
  };

  if (inp.pattern === 'straight') strips([inner], sd, sn, false);
  else if (inp.pattern === 'diagonal') {
    const d = rot(sd, Math.PI / 4);
    strips([inner], d, left(d), false);
  } else {
    // Chevron: the two halves either side of the seam, boards at +-45 degrees, mirrored so they meet board to board.
    const half = inp.divider ? B / 2 + g : g / 2;
    if (inp.divider) {
      const w = rect(c, sd, sn, -R, R, -B / 2, B / 2);
      push(region([inner, w], fieldOut).flatMap((p) => buttJoints(p, sd, inp.maxLength, g, 0.3)), sd, 'divider');
    }
    const hA = rect(c, sd, sn, -R, R, half, R), hB = rect(c, sd, sn, -R, R, -R, -half);
    // Half B is the mirror image of half A across the seam: its boards and its strip steps are A's reflected.
    const reflect = (v: Vec2): Vec2 => sub(mul(sd, 2 * dot(v, sd)), v);
    const dA = rot(sd, Math.PI / 4), nA = left(dA);
    strips([inner, hA], dA, nA, true);
    strips([inner, hB], reflect(dA), reflect(nA), true);
  }

  // Fascia: along the outside edge where it is not an opening, and around each opening inside the deck.
  const fascia: FasciaRun[] = [];
  const runsAlong = (a: Vec2, b: Vec2, keep: (p: Vec2) => boolean, out: Vec2) => {
    const L = len(sub(b, a));
    const N = Math.max(1, Math.ceil(L / 0.05));
    let from = -1;
    for (let k = 0; k <= N; k++) {
      const ok = k < N && keep(add(a, mul(sub(b, a), (k + 0.5) / N)));
      if (ok && from < 0) from = k;
      if (!ok && from >= 0) {
        fascia.push({ a: add(a, mul(sub(b, a), from / N)), b: add(a, mul(sub(b, a), k / N)), out });
        from = -1;
      }
    }
  };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const out = mul(left(unit(sub(b, a))), -1);
    runsAlong(a, b, (p) => !holeGap.some((h) => inRing(add(p, mul(out, -0.02)), h)), out);
  }
  for (const h of holeGap) {
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length];
      // The fascia face looks into the opening.
      const into = left(unit(sub(b, a)));
      runsAlong(a, b, (p) => inRing(add(p, mul(into, -0.02)), outline) && !holeGap.some((o) => o !== h && inRing(p, o)), into);
    }
  }

  const under = region([offsetRing(outline, inp.underInset)], holes.map((h) => offsetRing(h, -(g + inp.underInset))));
  return { pieces, fascia, under };
}

/** The direction of the longest edge of an outline, radians: boards and seams run along a deck's long side by default. */
export function longSideAngle(outline: Vec2[]): number {
  let best = 0, ang = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const l = len(sub(b, a));
    if (l > best) {
      best = l;
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  return ang;
}
