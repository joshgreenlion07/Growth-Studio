import type { Vec2 } from '../siteplan/types';

/**
 * The straight skeleton of a simple polygon, as the roof it makes: every wall edge's roof plane rises inward at the same
 * pitch, and where planes meet they form hips (over convex corners), valleys (over reflex corners) and ridges. Pure plan
 * geometry (no three.js), so it can be tested on its own.
 *
 * It is found by moving the edges inward at unit speed (the wavefront) and handling the events as they come, all
 * recomputed from scratch after each one (polygons here have tens of corners, so that costs nothing and needs no event
 * queue to keep in step):
 * - edge event: an edge of the wavefront shrinks to nothing; its two ends become one corner;
 * - split event: a reflex corner runs into an edge across the polygon and cuts the wavefront in two;
 * - pinch: two edges that face each other meet along their whole shared length (a wing's two long sides at its ridge);
 *   the part where they overlap is a ridge and drops out at once.
 * Between events every wavefront edge sweeps a planar quad, which is emitted as is, so the faces never need tracing.
 *
 * Edges can carry a speed (`weights`): 0 makes an edge a gable end, a vertical triangle swept in its own plane.
 */

/** A piece of one edge's roof face: plan points with the offset time t (horizontal distance from the eave line). */
export interface SkelPiece { edge: number; pts: [number, number, number][] }
/** A hip, valley or ridge line, ends in (x, y, t). */
export interface SkelArc { kind: 'hip' | 'valley' | 'ridge'; a: [number, number, number]; b: [number, number, number] }
export interface Skeleton {
  /** False when the wavefront did not close up cleanly (then nothing else is to be used). */
  ok: boolean;
  pieces: SkelPiece[];
  arcs: SkelArc[];
  /** The largest t reached (the ridge's distance in from the eave). */
  maxT: number;
}

interface Vert {
  x: number; y: number;
  vx: number; vy: number;
  ePrev: number; eNext: number;
  reflex: boolean; pinch: boolean;
  /** Where and when this corner started (for the hip and valley lines). */
  bx: number; by: number; bt: number;
}


export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Drop repeated points and corners that are (nearly) straight, so the skeleton sees only real corners. `tolDeg` is how
 * far from straight a corner may be and still be dropped. Returns the kept points' indices into `poly` too.
 */
export function cleanOutline(poly: Vec2[], tolDeg = 0.6): { pts: Vec2[]; idx: number[] } {
  let idx = poly.map((_, i) => i);
  let changed = true;
  const tol = Math.sin((tolDeg * Math.PI) / 180);
  while (changed && idx.length > 3) {
    changed = false;
    for (let k = 0; k < idx.length && idx.length > 3; k++) {
      const p0 = poly[idx[(k - 1 + idx.length) % idx.length]], p1 = poly[idx[k]], p2 = poly[idx[(k + 1) % idx.length]];
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-4 || (lb > 1e-4 && Math.abs(ax * by - ay * bx) / (la * lb) < tol && ax * bx + ay * by > 0)) {
        idx.splice(k, 1);
        changed = true;
        k--;
      }
    }
  }
  idx = idx.slice();
  return { pts: idx.map((i) => poly[i]), idx };
}

/**
 * Offset a polygon outward by `d` (per edge, `d[i]` for edge i), mitered. Null when the offset outline crosses itself
 * (a notch narrower than twice the overhang).
 */
export function offsetOutline(poly: Vec2[], d: number[]): Vec2[] | null {
  const n = poly.length;
  const ccw = signedArea(poly) > 0;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const ux = (q[0] - p[0]) / l, uy = (q[1] - p[1]) / l;
    // Outward normal: right of the edge for a counter-clockwise outline.
    const nx = ccw ? uy : -uy, ny = ccw ? -ux : ux;
    return { px: p[0] + nx * d[i], py: p[1] + ny * d[i], ux, uy };
  });
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i - 1 + n) % n], B = lines[i];
    const det = A.ux * B.uy - A.uy * B.ux;
    if (Math.abs(det) < 1e-9) { out.push([B.px, B.py]); continue; }
    const t = ((B.px - A.px) * B.uy - (B.py - A.py) * B.ux) / det;
    out.push([A.px + A.ux * t, A.py + A.uy * t]);
  }
  // Each offset edge must keep its direction, and no two edges may cross.
  for (let i = 0; i < n; i++) {
    const a = out[i], b = out[(i + 1) % n];
    if ((b[0] - a[0]) * lines[i].ux + (b[1] - a[1]) * lines[i].uy <= 1e-6) return null;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(out[i], out[(i + 1) % n], out[j], out[(j + 1) % n])) return null;
    }
  }
  return out;
}

function segsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
}

/**
 * The skeleton of `poly` (any winding; it is made counter-clockwise inside, and edge numbers stay those of `poly`).
 * `weights[i]` is edge i's speed (1 a roof slope, 0 a gable end); left out, all 1.
 */
export function straightSkeleton(poly: Vec2[], weights?: number[]): Skeleton {
  const fail: Skeleton = { ok: false, pieces: [], arcs: [], maxT: 0 };
  const n0 = poly.length;
  if (n0 < 3) return fail;
  const flip = signedArea(poly) < 0;
  // Work counter-clockwise; edge k of the worked outline is edge map[k] of the given one.
  const P: Vec2[] = flip ? poly.slice().reverse() : poly.slice();
  const map = P.map((_, k) => (flip ? (n0 - 2 - k + n0) % n0 : k));
  const n = P.length;
  const E = P.map((p, i) => {
    const q = P[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0]) / l, uy = (q[1] - p[1]) / l;
    return { px: p[0], py: p[1], ux, uy, nx: -uy, ny: ux, w: weights ? Math.max(0, weights[map[i]] ?? 1) : 1, len: l };
  });
  if (E.some((e) => !(e.len > 1e-6))) return fail;

  let T = 0;
  const pieces: SkelPiece[] = [];
  const arcs: SkelArc[] = [];

  const make = (x: number, y: number, ePrev: number, eNext: number): Vert => {
    const a = E[ePrev], b = E[eNext];
    const det = a.nx * b.ny - a.ny * b.nx;
    const cross = a.ux * b.uy - a.uy * b.ux;
    const v: Vert = { x, y, vx: 0, vy: 0, ePrev, eNext, reflex: false, pinch: false, bx: x, by: y, bt: T };
    if (Math.abs(det) < 1e-9) {
      if (a.nx * b.nx + a.ny * b.ny > 0) {
        // Straight on: the corner rides along with the edges.
        const w = (a.w + b.w) / 2;
        v.vx = a.nx * w;
        v.vy = a.ny * w;
      } else v.pinch = true;
    } else {
      v.vx = (a.w * b.ny - b.w * a.ny) / det;
      v.vy = (a.nx * b.w - b.nx * a.w) / det;
      v.reflex = cross < -1e-9;
    }
    return v;
  };
  /** A corner's line ends here: a hip over a convex corner, a valley over a reflex one (straight-on corners draw none). */
  const retire = (v: Vert) => {
    const len = Math.hypot(v.x - v.bx, v.y - v.by) + Math.abs(T - v.bt);
    if (len < 1e-5 || v.pinch) return;
    const a = E[v.ePrev], b = E[v.eNext];
    if (Math.abs(a.ux * b.uy - a.uy * b.ux) < 1e-6) return;
    if (a.w === 0 || b.w === 0) return;
    arcs.push({ kind: v.reflex ? 'valley' : 'hip', a: [v.bx, v.by, v.bt], b: [v.x, v.y, T] });
  };

  let lavs: Vert[][] = [P.map((p, i) => make(p[0], p[1], (i - 1 + n) % n, i))];
  /** Drop the parts of the wavefront that have closed (fewer than 3 corners), ending their corners' hip lines first. */
  const prune = () => {
    for (const l of lavs) if (l.length < 3) for (const v of l) retire(v);
    lavs = lavs.filter((l) => l.length >= 3);
  };

  /** Settle every pinch at once: the overlapping part of two facing edges is a ridge and leaves the wavefront. */
  const settle = (): boolean => {
    for (let guard = 0; guard < 4 * n + 20; guard++) {
      let found = false;
      prune();
      for (const lav of lavs) {
        const k = lav.findIndex((v) => v.pinch);
        if (k < 0) continue;
        found = true;
        const m = lav.length;
        const p = lav[k], A = lav[(k - 1 + m) % m], B = lav[(k + 1) % m];
        const dA = Math.hypot(A.x - p.x, A.y - p.y), dB = Math.hypot(B.x - p.x, B.y - p.y);
        const ridge = (q: Vert) => {
          if (Math.hypot(q.x - p.x, q.y - p.y) > 1e-5 && E[p.ePrev].w > 0) arcs.push({ kind: 'ridge', a: [p.x, p.y, T], b: [q.x, q.y, T] });
        };
        if (m <= 3) {
          // The last of this part of the wavefront: whatever is left is the ridge's other end.
          ridge(dA > dB ? A : B);
          for (const v of lav) retire(v);
          lav.length = 0;
          break;
        }
        if (Math.abs(dA - dB) < 1e-6) {
          ridge(A);
          retire(A);
          retire(B);
          const nv = make(A.x, A.y, A.ePrev, B.eNext);
          // Remove p, A and B; the new corner takes their place (cyclic order: B's next around to A's previous).
          const order: Vert[] = [nv];
          for (let i = 2; i < m - 1; i++) order.push(lav[(k + i) % m]);
          lav.splice(0, lav.length, ...order);
        } else if (dA < dB) {
          ridge(A);
          retire(A);
          const nv = make(A.x, A.y, A.ePrev, p.eNext);
          const order: Vert[] = [nv];
          for (let i = 1; i < m - 1; i++) order.push(lav[(k + i) % m]);
          lav.splice(0, lav.length, ...order);
        } else {
          ridge(B);
          retire(B);
          const nv = make(B.x, B.y, p.ePrev, B.eNext);
          const order: Vert[] = [nv];
          for (let i = 2; i < m; i++) order.push(lav[(k + i) % m]);
          lav.splice(0, lav.length, ...order);
        }
        break;
      }
      if (!found) return true;
    }
    return false;
  };

  for (let iter = 0; iter < 60 * n + 200; iter++) {
    if (!settle()) return fail;
    prune();
    if (!lavs.length) {
      const maxT = T;
      // Check: the swept pieces must cover the outline's area.
      let got = 0;
      for (const pc of pieces) got += Math.abs(signedArea(pc.pts.map((q) => [q[0], q[1]] as Vec2)));
      const want = Math.abs(signedArea(P));
      if (Math.abs(got - want) > want * 0.01 + 1e-4) return fail;
      for (const pc of pieces) pc.edge = map[pc.edge];
      return { ok: true, pieces, arcs, maxT };
    }
    // The next event.
    let best = Infinity, kind: 'edge' | 'split' = 'edge', bl = -1, bk = -1, bj = -1;
    for (let li = 0; li < lavs.length; li++) {
      const lav = lavs[li], m = lav.length;
      for (let k = 0; k < m; k++) {
        const a = lav[k], b = lav[(k + 1) % m], e = E[a.eNext];
        const L = (b.x - a.x) * e.ux + (b.y - a.y) * e.uy;
        const rate = (b.vx - a.vx) * e.ux + (b.vy - a.vy) * e.uy;
        let t = Infinity;
        if (L < 1e-7) t = T;
        else if (rate < -1e-12) t = T + L / -rate;
        if (t < best - 1e-9 || (kind === 'split' && t < best + 1e-9)) { best = t; kind = 'edge'; bl = li; bk = k; }
      }
      for (let r = 0; r < m; r++) {
        const R = lav[r];
        if (!R.reflex) continue;
        for (let k = 0; k < m; k++) {
          const a = lav[k], b = lav[(k + 1) % m];
          if (a === R || b === R) continue;
          const e = E[a.eNext];
          const d0 = e.nx * (R.x - e.px) + e.ny * (R.y - e.py) - e.w * T;
          const den = e.w - (e.nx * R.vx + e.ny * R.vy);
          if (den <= 1e-12 || d0 < -1e-7) continue;
          const dt = Math.max(0, d0 / den);
          const t = T + dt;
          if (t > best + 1e-9) continue;
          // Is the hit point inside the edge's stretch of wavefront at that time?
          const ax = a.x + a.vx * dt, ay = a.y + a.vy * dt, bx = b.x + b.vx * dt, by = b.y + b.vy * dt;
          const rx = R.x + R.vx * dt, ry = R.y + R.vy * dt;
          const L = (bx - ax) * e.ux + (by - ay) * e.uy;
          const s = (rx - ax) * e.ux + (ry - ay) * e.uy;
          if (L < -1e-7 || s < -1e-6 || s > L + 1e-6) continue;
          if (t < best - 1e-9) { best = t; kind = 'split'; bl = li; bk = k; bj = r; }
        }
      }
    }
    if (!Number.isFinite(best) || bl < 0) return fail;
    // Sweep every wavefront edge up to the event, then move every corner there.
    const dt = best - T;
    if (dt > 0) {
      for (const lav of lavs) {
        const m = lav.length;
        for (let k = 0; k < m; k++) {
          const a = lav[k], b = lav[(k + 1) % m];
          const a1: [number, number, number] = [a.x + a.vx * dt, a.y + a.vy * dt, best];
          const b1: [number, number, number] = [b.x + b.vx * dt, b.y + b.vy * dt, best];
          pieces.push({ edge: a.eNext, pts: [[a.x, a.y, T], [b.x, b.y, T], b1, a1] });
        }
      }
      for (const lav of lavs) for (const v of lav) { v.x += v.vx * dt; v.y += v.vy * dt; }
    }
    T = best;
    const lav = lavs[bl], m = lav.length;
    if (kind === 'edge') {
      const a = lav[bk], b = lav[(bk + 1) % m];
      retire(a);
      retire(b);
      const nv = make((a.x + b.x) / 2, (a.y + b.y) / 2, a.ePrev, b.eNext);
      const order: Vert[] = [nv];
      for (let i = 2; i < m; i++) order.push(lav[(bk + i) % m]);
      lav.splice(0, lav.length, ...order);
    } else {
      const R = lav[bj], a = lav[bk];
      retire(R);
      const e = a.eNext;
      const v1 = make(R.x, R.y, e, R.eNext);
      const v2 = make(R.x, R.y, R.ePrev, e);
      // lav from R: R, rn, ..., a, b, ..., rp.
      const ring: Vert[] = [];
      for (let i = 0; i < m; i++) ring.push(lav[(bj + i) % m]);
      const ia = ring.indexOf(a);
      const one = [v1, ...ring.slice(1, ia + 1)];
      const two = [v2, ...ring.slice(ia + 1)];
      lavs.splice(bl, 1, one, two);
    }
  }
  return fail;
}
