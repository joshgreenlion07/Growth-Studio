/**
 * One-slab pads: a paver area that is a single small rectangle (a 3 ft x 3 ft stepping pad, a row of them in turf) is
 * one solid slab at its drawn size, not a field of pavers: no joints, no cut pieces, its texture one unit across.
 *
 * Only a product sold in that size can be a pad (a unit whose size equals the pad's, within `PAD_TOL_IN`). When nothing
 * in the catalog is sold that size, the pad is a generic large-format cast concrete slab (`padSlab` looks).
 */
import { MATERIALS, isOffered, materialById, type MaterialSpec } from './catalog';
import type { Vec2, Zone } from './types';

const IN = 0.0254;
/** A unit counts as the pad's size when each side is within this many inches (Premier Slab 23 1/2 in fits a 24 in pad). */
export const PAD_TOL_IN = 1;
/** The shortest and longest side a pad can have, inches. */
export const PAD_MIN_IN = 12;
export const PAD_MAX_IN = 54;
/** The longest side over the shortest. */
export const PAD_MAX_ASPECT = 3;

export interface PadRect {
  /** Center, meters. */
  center: Vec2;
  /** Unit vectors along the first side (a) and across it (b). */
  a: Vec2;
  b: Vec2;
  /** Side lengths along a and b, inches. */
  wIn: number;
  dIn: number;
}

/** The corners of a polygon with repeated and in-line points taken out. */
function corners(poly: Vec2[]): Vec2[] {
  let p = poly.filter((q, i) => i === 0 || Math.hypot(q[0] - poly[i - 1][0], q[1] - poly[i - 1][1]) > 1e-3);
  if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) <= 1e-3) p = p.slice(0, -1);
  let again = true;
  while (again && p.length > 3) {
    again = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) / Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1])) < 0.01) { p.splice(i, 1); again = true; break; }
    }
  }
  return p;
}

/** The rectangle of a polygon that is one (four right-angled corners, opposite sides equal), else null. */
export function rectOf(poly: Vec2[]): PadRect | null {
  const p = corners(poly);
  if (p.length !== 4) return null;
  const e = p.map((q, i) => { const r = p[(i + 1) % 4]; return [r[0] - q[0], r[1] - q[1]] as Vec2; });
  const L = e.map((v) => Math.hypot(v[0], v[1]));
  if (L.some((l) => l < 1e-3)) return null;
  for (let i = 0; i < 4; i++) {
    const n = e[(i + 1) % 4];
    if (Math.abs(e[i][0] * n[0] + e[i][1] * n[1]) / (L[i] * L[(i + 1) % 4]) > 0.035) return null;   // within 2 degrees of square
  }
  const tol = (l: number) => Math.max(0.5 * IN, l * 0.02);
  if (Math.abs(L[0] - L[2]) > tol(L[0]) || Math.abs(L[1] - L[3]) > tol(L[1])) return null;
  const wM = (L[0] + L[2]) / 2, dM = (L[1] + L[3]) / 2;
  return {
    center: [(p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4],
    a: [e[0][0] / L[0], e[0][1] / L[0]], b: [e[1][0] / L[1], e[1][1] / L[1]], wIn: wM / IN, dIn: dM / IN,
  };
}

/** True when a rectangle of these sides (inches) is small enough to be one slab. */
export function slabSized(wIn: number, dIn: number): boolean {
  const lo = Math.min(wIn, dIn), hi = Math.max(wIn, dIn);
  return lo >= PAD_MIN_IN && hi <= PAD_MAX_IN && hi / lo <= PAD_MAX_ASPECT;
}

/**
 * The pad a zone is, or null for ordinary paving. A paver (not concrete, porcelain or decking) hardscape zone that is one
 * small rectangle (a one-slab pad has no border, so a border on it is left out); `zone.pad` true makes any such rectangle a pad, false keeps it paving.
 */
export function padOf(z: Pick<Zone, 'kind' | 'polygon' | 'catalogId' | 'deck' | 'pad'>): PadRect | null {
  if (z.kind !== 'hardscape' || z.pad === false || z.deck) return null;
  const m = materialById.get(z.catalogId);
  if (!m || m.group !== 'Pavers' || m.use !== 'hardscape' || m.recipe !== 'paver') return null;
  const r = rectOf(z.polygon);
  return r && (z.pad === true || slabSized(r.wIn, r.dIn)) ? r : null;
}

/** True when this maker unit is sold in the pad's size: its only unit size equals the pad's, either way round. */
export function fitsPad(m: MaterialSpec, wIn: number, dIn: number): boolean {
  if (m.use !== 'hardscape' || m.group !== 'Pavers' || m.padSlab || !m.maker && !m.pattern) return false;
  const s = m.pattern?.sizes;
  if (!s || s.length !== 1) return false;
  const [a, b] = s[0];
  return (Math.abs(a - wIn) <= PAD_TOL_IN && Math.abs(b - dIn) <= PAD_TOL_IN) || (Math.abs(a - dIn) <= PAD_TOL_IN && Math.abs(b - wIn) <= PAD_TOL_IN);
}

/**
 * The looks a pad of this size offers: every offered product sold in that size, else (when none is) the generic
 * large-format slab colors. `keep` (the look in use) is not added here.
 */
export function padChoices(wIn: number, dIn: number): MaterialSpec[] {
  const real = MATERIALS.filter((m) => !m.auto && isOffered(m) && fitsPad(m, wIn, dIn));
  return real.length ? real : MATERIALS.filter((m) => m.padSlab && isOffered(m));
}

const lin = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: string, b: string) => { const x = lin(a), y = lin(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/**
 * The look a pad of this size is built in: the zone's own when it is sold in that size, else the closest of `padChoices`
 * (the same color name first, then the nearest color). The plan keeps its saved id; only the build is changed.
 */
export function padLook(spec: MaterialSpec, wIn: number, dIn: number): MaterialSpec {
  if (fitsPad(spec, wIn, dIn)) return spec;
  const list = padChoices(wIn, dIn);
  if (!list.length) return spec;
  const same = list.find((m) => m.color && m.color === spec.color);
  if (same) return same;
  const at = spec.palette[Math.min(1, spec.palette.length - 1)];
  return list.reduce((best, m) => (dist(m.palette[1] ?? m.palette[0], at) < dist(best.palette[1] ?? best.palette[0], at) ? m : best));
}
