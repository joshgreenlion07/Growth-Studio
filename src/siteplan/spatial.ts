import { bounds, type Bounds } from './geometry';
import type { Vec2 } from './types';

/**
 * Lookup structures for the builders, which ask "is this point inside?" and
 * "how far to the edge?" for hundreds of thousands of points per build.
 * Answers are exactly those of pointInPolygon, distToEdge and distToSegment in
 * geometry.ts; only the edges that can matter are looked at.
 *
 * Build one per plan build. The polygons must not change while it is in use.
 */

export const inBounds = (b: Bounds, x: number, y: number, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Segments bucketed into a uniform grid. Each segment carries a tag (an index
 * the caller defines). `nearest` finds the exact closest segment by searching
 * rings of cells outward.
 */
export class SegmentGrid {
  readonly box: Bounds;
  private cell: number;
  private nx: number;
  private ny: number;
  /** Segment coordinates: ax, ay, bx, by. */
  private seg: Float64Array;
  private tags: Int32Array;
  private start: Int32Array;
  private items: Int32Array;
  private stamp: Int32Array;
  private query = 0;

  constructor(segments: { a: Vec2; b: Vec2; tag?: number }[], cell?: number) {
    const n = segments.length;
    this.seg = new Float64Array(n * 4);
    this.tags = new Int32Array(n);
    this.stamp = new Int32Array(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0;
    segments.forEach((s, i) => {
      this.seg.set([s.a[0], s.a[1], s.b[0], s.b[1]], i * 4);
      this.tags[i] = s.tag ?? 0;
      minX = Math.min(minX, s.a[0], s.b[0]);
      minY = Math.min(minY, s.a[1], s.b[1]);
      maxX = Math.max(maxX, s.a[0], s.b[0]);
      maxY = Math.max(maxY, s.a[1], s.b[1]);
      len += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    });
    if (!n) minX = minY = maxX = maxY = 0;
    this.box = { minX, minY, maxX, maxY };
    const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY);
    // About two segments per cell, never so many cells that building the grid costs more than it saves.
    const c = cell ?? Math.max(0.25, len / Math.max(1, n) * 2, Math.sqrt((w * h) / 65536));
    this.cell = c;
    this.nx = Math.max(1, Math.min(1024, Math.ceil(w / c) + 1));
    this.ny = Math.max(1, Math.min(1024, Math.ceil(h / c) + 1));
    const count = new Int32Array(this.nx * this.ny + 1);
    const each = (i: number, f: (k: number) => void) => {
      const o = i * 4;
      const [i0, j0] = this.cellOf(Math.min(this.seg[o], this.seg[o + 2]), Math.min(this.seg[o + 1], this.seg[o + 3]));
      const [i1, j1] = this.cellOf(Math.max(this.seg[o], this.seg[o + 2]), Math.max(this.seg[o + 1], this.seg[o + 3]));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) f(j * this.nx + k);
    };
    for (let i = 0; i < n; i++) each(i, (k) => count[k + 1]++);
    for (let k = 0; k < this.nx * this.ny; k++) count[k + 1] += count[k];
    this.start = count;
    this.items = new Int32Array(count[this.nx * this.ny]);
    const fill = count.slice();
    for (let i = 0; i < n; i++) each(i, (k) => (this.items[fill[k]++] = i));
  }

  private cellOf(x: number, y: number): [number, number] {
    const i = Math.floor((x - this.box.minX) / this.cell), j = Math.floor((y - this.box.minY) / this.cell);
    return [Math.max(0, Math.min(this.nx - 1, i)), Math.max(0, Math.min(this.ny - 1, j))];
  }

  get size() {
    return this.tags.length;
  }

  /**
   * The closest segment to (x, y), searched out to `max` meters (Infinity for
   * no limit). `accept` can rule segments out by tag. Returns the distance
   * (Infinity when none is within `max`) and the segment's tag.
   */
  nearest(x: number, y: number, max = Infinity, accept?: (tag: number) => boolean): { d: number; tag: number; index: number } {
    let best = Infinity, tag = -1, index = -1;
    const n = this.tags.length;
    if (!n) return { d: best, tag, index };
    // Cheap reject: the box of all segments is farther than max.
    const ox = Math.max(this.box.minX - x, 0, x - this.box.maxX), oy = Math.max(this.box.minY - y, 0, y - this.box.maxY);
    if (Math.hypot(ox, oy) > max) return { d: best, tag, index };
    const q = ++this.query;
    const ci = Math.floor((x - this.box.minX) / this.cell), cj = Math.floor((y - this.box.minY) / this.cell);
    // Rings are counted from the point's (possibly outside) cell; ring r covers cells at Chebyshev distance r.
    const far = Math.max(Math.abs(ci), Math.abs(cj), Math.abs(this.nx - 1 - ci), Math.abs(this.ny - 1 - cj));
    const visit = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return;
      const k = j * this.nx + i;
      for (let s = this.start[k], e = this.start[k + 1]; s < e; s++) {
        const id = this.items[s];
        if (this.stamp[id] === q) continue;
        this.stamp[id] = q;
        if (accept && !accept(this.tags[id])) continue;
        const o = id * 4;
        const d = segDist(x, y, this.seg[o], this.seg[o + 1], this.seg[o + 2], this.seg[o + 3]);
        if (d < best) {
          best = d;
          tag = this.tags[id];
          index = id;
        }
      }
    };
    // Cells at ring r are at least (r - 1) * cell away; the point's own cell
    // may be outside the grid, so start from the first ring that touches it.
    const r0 = Math.max(0, -ci, -cj, ci - (this.nx - 1), cj - (this.ny - 1));
    for (let r = r0; r <= far; r++) {
      if ((r - 1) * this.cell > Math.min(best, max)) break;
      if (r === 0) visit(ci, cj);
      else {
        const i0 = Math.max(ci - r, -1), i1 = Math.min(ci + r, this.nx);
        for (let i = i0; i <= i1; i++) {
          visit(i, cj - r);
          visit(i, cj + r);
        }
        const j0 = Math.max(cj - r + 1, -1), j1 = Math.min(cj + r - 1, this.ny);
        for (let j = j0; j <= j1; j++) {
          visit(ci - r, j);
          visit(ci + r, j);
        }
      }
    }
    return best <= max ? { d: best, tag, index } : { d: Infinity, tag: -1, index: -1 };
  }

  /**
   * True when some segment within `reach` of (x, y) passes `test`, which gets
   * the segment's tag and its distance from the point.
   */
  someWithin(x: number, y: number, reach: number, test: (tag: number, d: number) => boolean): boolean {
    if (!this.tags.length || !inBounds(this.box, x, y, reach)) return false;
    const q = ++this.query;
    const [i0, j0] = this.cellOf(x - reach, y - reach);
    const [i1, j1] = this.cellOf(x + reach, y + reach);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.nx + i;
        for (let s = this.start[k], e = this.start[k + 1]; s < e; s++) {
          const id = this.items[s];
          if (this.stamp[id] === q) continue;
          this.stamp[id] = q;
          const o = id * 4;
          const d = segDist(x, y, this.seg[o], this.seg[o + 1], this.seg[o + 2], this.seg[o + 3]);
          if (d <= reach && test(this.tags[id], d)) return true;
        }
      }
    }
    return false;
  }

  /** Distance to the closest segment, or Infinity when none is within `max`. */
  dist(x: number, y: number, max = Infinity, accept?: (tag: number) => boolean): number {
    return this.nearest(x, y, max, accept).d;
  }
}

/** One polygon, with its outline edges bucketed by row for fast inside tests and distances. */
export class PolygonIndex {
  readonly poly: Vec2[];
  readonly box: Bounds;
  private rows: number;
  private rowH: number;
  private rowStart: Int32Array;
  private rowItems: Int32Array;
  private edges: SegmentGrid | null = null;

  constructor(poly: Vec2[]) {
    this.poly = poly;
    this.box = bounds(poly);
    const n = poly.length;
    const h = Math.max(1e-9, this.box.maxY - this.box.minY);
    this.rows = Math.max(1, Math.min(256, Math.ceil(n / 2)));
    this.rowH = h / this.rows;
    const count = new Int32Array(this.rows + 1);
    const span = (i: number): [number, number] => {
      const j = (i + n - 1) % n;
      const y0 = Math.min(poly[i][1], poly[j][1]), y1 = Math.max(poly[i][1], poly[j][1]);
      return [this.row(y0), this.row(y1)];
    };
    for (let i = 0; i < n; i++) {
      const [r0, r1] = span(i);
      for (let r = r0; r <= r1; r++) count[r + 1]++;
    }
    for (let r = 0; r < this.rows; r++) count[r + 1] += count[r];
    this.rowStart = count;
    this.rowItems = new Int32Array(count[this.rows]);
    const fill = count.slice();
    for (let i = 0; i < n; i++) {
      const [r0, r1] = span(i);
      for (let r = r0; r <= r1; r++) this.rowItems[fill[r]++] = i;
    }
  }

  private row(y: number) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.box.minY) / this.rowH)));
  }

  /** Same answer as pointInPolygon(p, poly). */
  contains(x: number, y: number): boolean {
    const b = this.box;
    // Outside the box no edge is crossed, or (left of it) every crossed edge is, an even number.
    if (x < b.minX || x > b.maxX || y < b.minY || y >= b.maxY) return false;
    const poly = this.poly, n = poly.length;
    let inside = false;
    const r = this.row(y);
    for (let s = this.rowStart[r], e = this.rowStart[r + 1]; s < e; s++) {
      const i = this.rowItems[s], j = (i + n - 1) % n;
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
    }
    return inside;
  }

  /** Same answer as distToEdge(p, poly), or Infinity when farther than `max`. */
  dist(x: number, y: number, max = Infinity): number {
    if (!this.edges) {
      const poly = this.poly;
      this.edges = new SegmentGrid(poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] })));
    }
    return this.edges.dist(x, y, max);
  }
}

/**
 * Many polygons, answering "which ones contain this point" in list order.
 * Polygons are bucketed by their boxes into a coarse grid.
 */
export class PolygonSet {
  readonly items: PolygonIndex[];
  private box: Bounds;
  private cell: number;
  private nx: number;
  private ny: number;
  private start: Int32Array;
  private list: Int32Array;

  constructor(polys: Vec2[][]) {
    this.items = polys.map((p) => new PolygonIndex(p));
    const all = this.items.length ? this.items.map((i) => i.box) : [{ minX: 0, minY: 0, maxX: 0, maxY: 0 }];
    this.box = { minX: Math.min(...all.map((b) => b.minX)), minY: Math.min(...all.map((b) => b.minY)), maxX: Math.max(...all.map((b) => b.maxX)), maxY: Math.max(...all.map((b) => b.maxY)) };
    const w = Math.max(1e-6, this.box.maxX - this.box.minX), h = Math.max(1e-6, this.box.maxY - this.box.minY);
    this.cell = Math.max(0.5, Math.sqrt((w * h) / 16384));
    this.nx = Math.ceil(w / this.cell) + 1;
    this.ny = Math.ceil(h / this.cell) + 1;
    const count = new Int32Array(this.nx * this.ny + 1);
    const each = (b: Bounds, f: (k: number) => void) => {
      const i0 = this.ci(b.minX), i1 = this.ci(b.maxX), j0 = this.cj(b.minY), j1 = this.cj(b.maxY);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * this.nx + i);
    };
    this.items.forEach((it) => each(it.box, (k) => count[k + 1]++));
    for (let k = 0; k < this.nx * this.ny; k++) count[k + 1] += count[k];
    this.start = count;
    this.list = new Int32Array(count[this.nx * this.ny]);
    const fill = count.slice();
    // Filled in list order, so each cell's list is ascending.
    this.items.forEach((it, idx) => each(it.box, (k) => (this.list[fill[k]++] = idx)));
  }

  private ci(x: number) {
    return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.box.minX) / this.cell)));
  }
  private cj(y: number) {
    return Math.max(0, Math.min(this.ny - 1, Math.floor((y - this.box.minY) / this.cell)));
  }

  /** Index of the last polygon (in list order) that contains the point, or -1. */
  lastContaining(x: number, y: number): number {
    if (!inBounds(this.box, x, y)) return -1;
    const k = this.cj(y) * this.nx + this.ci(x);
    for (let s = this.start[k + 1] - 1; s >= this.start[k]; s--) {
      const idx = this.list[s];
      if (this.items[idx].contains(x, y)) return idx;
    }
    return -1;
  }

  /** Whether any polygon contains the point. */
  any(x: number, y: number): boolean {
    return this.lastContaining(x, y) >= 0;
  }
}

/** Points hashed into square cells, for "is anything closer than r?" tests. */
export class PointGrid {
  private cells = new Map<number, number[]>();
  constructor(private cell: number) {}

  private key(i: number, j: number) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  add(x: number, y: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const list = this.cells.get(k);
    if (list) list.push(x, y);
    else this.cells.set(k, [x, y]);
  }

  /** True when a point is strictly closer than r to (x, y). */
  anyWithin(x: number, y: number, r: number): boolean {
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((y - r) / this.cell), j1 = Math.floor((y + r) / this.cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (let s = 0; s < list.length; s += 2) if (Math.hypot(list[s] - x, list[s + 1] - y) < r) return true;
      }
    }
    return false;
  }
}
