import * as THREE from 'three';
import { area, signedArea } from '../siteplan/geometry';
import { PolygonIndex, PolygonSet, inBounds } from '../siteplan/spatial';
import type { ExistingStructure, Vec2, WaterFeature, Zone } from '../siteplan/types';
import { insetPolygon } from './hardscape';

/*
 * The plain concrete floor every cover (California patio or room) stands on, and where it gives way to what is
 * drawn there. The floor is the cover's footprint minus every layer the plan draws over it:
 * - paving (hardscape zones, decks) is drawn its thickness above grade, so it simply sits on top of the floor;
 * - beds (mulch, rock, humus, planters) and water (pools, ponds, fountains, streams) always cut the floor away;
 * - turf (sod, synthetic grass) cuts it when the area is drawn for the cover: at least half of the turf area lies
 *   under it. A lawn that only runs on under the roof from the yard stays under the floor, so a room does not show
 *   lawn indoors.
 * The cut is exact: the footprint and each cut are split into triangles and the cuts taken away piece by piece,
 * which leaves the floor as a set of convex pieces.
 */

/** The concrete floor every cover stands on. */
export const COVER_FLOOR_ID = 'concrete-broom';
/**
 * Top of a cover's floor above grade. Under the thinnest paving (4 cm, plus its elevation) so an area drawn over the
 * floor is always on top, and clear of the lawn at grade so the two never flicker.
 */
export const COVER_FLOOR_TOP = 0.02;
/** How far the floor's edge stays inside the cover's outline, so its sides are never coplanar with paving drawn to the same edge. */
export const FLOOR_INSET = 0.01;
/** Turf with at least this share of its area under a cover is the cover's own floor finish. */
const TURF_SHARE = 0.5;
const EPS = 1e-7;

export interface FloorGround {
  zones: Zone[];
  water: WaterFeature[];
}

/** Triangles of a simple polygon, each counter-clockwise. */
function triangles(poly: Vec2[]): Vec2[][] {
  if (poly.length < 3 || area(poly) < EPS) return [];
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const out: Vec2[][] = [];
  for (const [a, b, c] of tris) {
    const t: Vec2[] = [poly[a], poly[b], poly[c]];
    const s = signedArea(t);
    if (Math.abs(s) < EPS) continue;
    out.push(s > 0 ? t : [t[0], t[2], t[1]]);
  }
  return out;
}

/** The part of a convex polygon on one side of the line a -> b: left (keepLeft) or right. */
function clipHalf(poly: Vec2[], a: Vec2, b: Vec2, keepLeft: boolean): Vec2[] {
  const out: Vec2[] = [];
  const side = (p: Vec2) => {
    const s = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return keepLeft ? s : -s;
  };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out.length >= 3 && area(out) > EPS ? out : [];
}

const boxOf = (poly: Vec2[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
};
const overlaps = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/** A convex polygon minus a counter-clockwise triangle: the convex pieces left. */
function subtractTri(piece: Vec2[], tri: Vec2[]): Vec2[][] {
  const out: Vec2[][] = [];
  let rest = piece;
  for (let i = 0; i < 3 && rest.length; i++) {
    const a = tri[i], b = tri[(i + 1) % 3];
    const outside = clipHalf(rest, a, b, false);
    if (outside.length) out.push(outside);
    rest = clipHalf(rest, a, b, true);
  }
  return out;
}

/** Area of a polygon's overlap with another, both simple. */
function overlapArea(p: Vec2[], q: Vec2[]): number {
  const tq = triangles(q);
  let s = 0;
  for (const t of triangles(p)) {
    for (const u of tq) {
      let r: Vec2[] = t;
      for (let i = 0; i < 3 && r.length; i++) r = clipHalf(r, u[i], u[(i + 1) % 3], true);
      if (r.length) s += area(r);
    }
  }
  return s;
}

/** The outlines a stream or pondless run takes up on the ground (as its bed is painted, builder/ground.ts). */
function runOutlines(w: WaterFeature): Vec2[][] {
  if (!w.points || w.points.length < 2) return [];
  const half = (w.width ?? 0.8) / 2 + (w.kind === 'pondless' ? 0.6 : 0.22);
  const out: Vec2[][] = [];
  for (let i = 0; i < w.points.length - 1; i++) {
    const a = w.points[i], c = w.points[i + 1];
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * half, ny = (dx / l) * half;
    out.push([[a[0] + nx, a[1] + ny], [c[0] + nx, c[1] + ny], [c[0] - nx, c[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  for (const q of w.points) {
    const circ: Vec2[] = [];
    for (let k = 0; k < 14; k++) circ.push([q[0] + Math.cos((k / 14) * 2 * Math.PI) * half, q[1] + Math.sin((k / 14) * 2 * Math.PI) * half]);
    out.push(circ);
  }
  return out;
}

/** What the plan draws over a cover's footprint that replaces its floor there. */
export function floorCuts(cover: Vec2[], ground: FloorGround): Vec2[][] {
  const box = boxOf(cover);
  const cuts: Vec2[][] = [];
  for (const z of ground.zones) {
    if (z.kind === 'hardscape' || z.polygon.length < 3 || !overlaps(box, boxOf(z.polygon))) continue;
    if (z.kind === 'turf') {
      const a = area(z.polygon);
      if (a < EPS || overlapArea(z.polygon, cover) < a * TURF_SHARE) continue;
    }
    cuts.push(z.polygon);
  }
  for (const w of ground.water) {
    const outlines = w.polygon && w.polygon.length >= 3 ? [w.polygon] : runOutlines(w);
    for (const o of outlines) if (overlaps(box, boxOf(o))) cuts.push(o);
  }
  return cuts;
}

/** The floor's footprint: the cover's outline (inset a hair) minus the cuts, as convex pieces. */
export function floorPieces(cover: Vec2[], cuts: Vec2[][]): Vec2[][] {
  const inset = insetPolygon(cover, FLOOR_INSET);
  let pieces = triangles(inset.length >= 3 && area(inset) > EPS ? inset : cover);
  for (const cut of cuts) {
    for (const tri of triangles(cut)) {
      const tb = boxOf(tri);
      const next: Vec2[][] = [];
      for (const p of pieces) {
        if (!overlaps(tb, boxOf(p))) next.push(p);
        else next.push(...subtractTri(p, tri));
      }
      pieces = next;
      if (!pieces.length) return pieces;
    }
  }
  return pieces;
}

/**
 * The floor slab over convex pieces, from y0 to y1: a flat top (UVs in meters, as `slab` gives) and sides on every
 * piece's edges. Sides between two pieces sit inside the slab, where nothing sees them.
 */
export function floorGeometry(pieces: Vec2[][], y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    uv.push(u, w);
  };
  for (const piece of pieces) {
    // Counter-clockwise in plan (x, z) faces down in three.js (y up), so the top is laid clockwise.
    const p = signedArea(piece) > 0 ? [...piece].reverse() : piece;
    for (let i = 1; i + 1 < p.length; i++) {
      // Clipping leaves points in line along a cut: their zero-area triangles are left out (see dropDegenerate).
      if (area([p[0], p[i], p[i + 1]]) < 1e-9) continue;
      for (const q of [p[0], p[i], p[i + 1]]) v(q[0], y1, q[1], 0, 1, 0, q[0], q[1]);
    }
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-5) continue;
      // Outward of a clockwise outline (x, z) is to the left of a -> b in plan terms: (-dz, dx) flipped.
      const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      v(a[0], y0, a[1], nx, 0, nz, 0, y0); v(b[0], y1, b[1], nx, 0, nz, len, y1); v(a[0], y1, a[1], nx, 0, nz, 0, y1);
      v(a[0], y0, a[1], nx, 0, nz, 0, y0); v(b[0], y0, b[1], nx, 0, nz, len, y0); v(b[0], y1, b[1], nx, 0, nz, len, y1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * Where a cover's floor is the finished surface: inside a cover's floor and not under anything drawn there (a cut,
 * or paving and decks, which have their own top). Decor and in-grade lights stand on it; turf blades stay off it.
 */
export function coverFloorAt(structures: ExistingStructure[], ground: FloorGround): (p: Vec2) => boolean {
  const covers = structures.filter((s) => s.kind === 'cover' && s.polygon.length >= 3).map((s) => ({ idx: new PolygonIndex(s.polygon), cuts: new PolygonSet(floorCuts(s.polygon, ground)) }));
  if (!covers.length) return () => false;
  const hard = new PolygonSet(ground.zones.filter((z) => z.kind === 'hardscape' && z.polygon.length >= 3).map((z) => z.polygon));
  return (p) => {
    for (const c of covers) {
      if (!inBounds(c.idx.box, p[0], p[1], 0) || !c.idx.contains(p[0], p[1])) continue;
      if (c.cuts.items.length && c.cuts.any(p[0], p[1])) continue;
      return !hard.any(p[0], p[1]);
    }
    return false;
  };
}
