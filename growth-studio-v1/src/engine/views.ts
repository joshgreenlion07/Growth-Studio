import * as THREE from 'three';
import { featureById } from '../siteplan/catalog';
import { bounds, centroid, distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { SIDEWALK, streetFrame } from '../builder/context';

/** Camera views generated from the SitePlan instead of typed coordinates. */

export interface CameraView {
  id: string;
  label: string;
  eye: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function generateViews(plan: SitePlan, height: (p: Vec2) => number): CameraView[] {
  const B = plan.site.boundary;
  const b = bounds(B);
  const c = centroid(B);
  const R = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
  const views: CameraView[] = [];
  const street = streetFrame(plan);
  const house = plan.structures.find((s) => s.kind === 'house');

  // The open yard: where people will stand. If a house is on the lot, the
  // yard center is the lot center pushed away from the house.
  let yard: Vec2 = c;
  if (house) {
    const hc = centroid(house.polygon);
    const d: Vec2 = [c[0] - hc[0], c[1] - hc[1]];
    const l = Math.hypot(...d) || 1;
    yard = [c[0] + (d[0] / l) * R * 0.25, c[1] + (d[1] / l) * R * 0.25];
  }

  // Look across the yard from the house side when there is a house.
  let from: Vec2 = [0, 1];
  if (house) {
    const hc = centroid(house.polygon);
    const d: Vec2 = [hc[0] - yard[0], hc[1] - yard[1]];
    const l = Math.hypot(...d) || 1;
    from = [d[0] / l, d[1] / l];
  } else if (street) from = street.out;

  const side: Vec2 = [-from[1], from[0]];
  views.push({
    id: 'overview',
    label: 'Overview',
    // From the back corner, looking toward the house: the way a client sees their yard.
    eye: V(yard[0] - from[0] * R * 0.9 + side[0] * R * 0.55, R * 0.8 + 2.5, yard[1] - from[1] * R * 0.9 + side[1] * R * 0.55),
    target: V(yard[0] + from[0] * R * 0.15, 0.8, yard[1] + from[1] * R * 0.15),
    fov: 45,
  });

  if (house) {
    // Stand just outside the back door, looking out.
    const poly = house.polygon;
    let best: { mid: Vec2; out: Vec2; score: number } | null = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], e = poly[(i + 1) % poly.length];
      const mid: Vec2 = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
      let out: Vec2 = [e[1] - a[1], -(e[0] - a[0])];
      const l = Math.hypot(...out) || 1;
      out = [out[0] / l, out[1] / l];
      if (pointInPolygon([mid[0] + out[0] * 0.1, mid[1] + out[1] * 0.1], poly)) out = [-out[0], -out[1]];
      const probe: Vec2 = [mid[0] + out[0] * 1.5, mid[1] + out[1] * 1.5];
      if (!pointInPolygon(probe, B)) continue;
      const score = (yard[0] - mid[0]) * out[0] + (yard[1] - mid[1]) * out[1];
      if (!best || score > best.score) best = { mid, out, score };
    }
    if (best) {
      const p: Vec2 = [best.mid[0] + best.out[0] * 1.6, best.mid[1] + best.out[1] * 1.6];
      views.push({ id: 'house', label: 'From the house', eye: V(p[0], height(p) + 1.65, p[1]), target: V(yard[0], 0.9, yard[1]), fov: 55 });
    }
  }

  if (street) {
    const mid: Vec2 = [(street.a[0] + street.b[0]) / 2, (street.a[1] + street.b[1]) / 2];
    const p: Vec2 = [mid[0] + street.out[0] * (SIDEWALK * 0.5), mid[1] + street.out[1] * (SIDEWALK * 0.5)];
    const p2: Vec2 = [p[0] + street.dir[0] * R * 0.35, p[1] + street.dir[1] * R * 0.35];
    views.push({ id: 'street', label: 'From the street', eye: V(p2[0], 1.65, p2[1]), target: V(c[0], 1.4, c[1]), fov: 52 });
  }

  // Close views of what was designed: water, fire, shade.
  const focusItems: { p: Vec2; label: string; id: string; r: number }[] = [];
  for (const w of plan.water) {
    const pc = w.polygon ? centroid(w.polygon) : w.points ? w.points[Math.floor(w.points.length / 2)] : null;
    if (!pc) continue;
    const rr = w.polygon ? Math.max(1.2, Math.sqrt(bounds(w.polygon).maxX - bounds(w.polygon).minX) * 1.4) : 1.2;
    focusItems.push({ p: pc, label: w.kind === 'pool' ? 'By the pool' : w.kind === 'fountain' ? 'The fountain' : w.kind === 'stream' ? 'The stream' : w.kind === 'pondless' ? 'The waterfall' : 'By the pond', id: `w-${w.id}`, r: rr });
  }
  for (const f of plan.features) {
    const spec = featureById.get(f.catalogId);
    if (spec?.kind === 'firePit' || spec?.kind === 'fireTable') focusItems.push({ p: f.position, label: 'Fire feature', id: `f-${f.id}`, r: 1.4 });
    if (spec?.kind === 'pergolaWood' || spec?.kind === 'pergolaLouvered') focusItems.push({ p: f.position, label: 'Under the pergola', id: `f-${f.id}`, r: 2.2 });
    if (spec?.kind === 'waterWallPlaster' || spec?.kind === 'waterWallPorcelain' || spec?.kind === 'waterWallStucco') focusItems.unshift({ p: f.position, label: 'Water wall', id: `f-${f.id}`, r: 2.2 });
    if (spec?.kind === 'kitchenL' || spec?.kind === 'kitchenStraight') focusItems.push({ p: f.position, label: 'Outdoor kitchen', id: `f-${f.id}`, r: 1.8 });
    if (spec?.kind === 'hotTub') focusItems.push({ p: f.position, label: 'Hot tub', id: `f-${f.id}`, r: 1.5 });
  }
  const seen = new Set<string>();
  for (const it of focusItems) {
    if (seen.has(it.label) || views.length > 7) continue;
    seen.add(it.label);
    // Approach from the yard center side, at seated eye height.
    const d: Vec2 = [yard[0] - it.p[0], yard[1] - it.p[1]];
    const l = Math.hypot(...d) || 1;
    const ang = 0.5;
    const dx = (d[0] / l) * Math.cos(ang) - (d[1] / l) * Math.sin(ang);
    const dz = (d[0] / l) * Math.sin(ang) + (d[1] / l) * Math.cos(ang);
    const dist = it.r + 2.6;
    let e: Vec2 = [it.p[0] + dx * dist, it.p[1] + dz * dist];
    if (!pointInPolygon(e, B) || distToEdge(e, B) < 0.6) e = [it.p[0] + (d[0] / l) * dist, it.p[1] + (d[1] / l) * dist];
    views.push({ id: it.id, label: it.label, eye: V(e[0], height(e) + 1.3, e[1]), target: V(it.p[0], height(it.p) + 0.2, it.p[1]), fov: 50 });
  }

  views.push({ id: 'low', label: 'Ground level', eye: V(yard[0] + from[0] * R * 0.75, 0.55, yard[1] + from[1] * R * 0.75), target: V(yard[0] - from[0] * R, 1.0, yard[1] - from[1] * R), fov: 58 });
  views.push({ id: 'plan', label: 'Top down', eye: V(c[0], R * 2.6 + 6, c[1] + 0.01), target: V(c[0], 0, c[1]), fov: 45 });
  return views;
}
