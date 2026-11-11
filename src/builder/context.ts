import * as THREE from 'three';
import { bounds, distToEdge, pointInPolygon, rng } from '../siteplan/geometry';
import type { ExistingStructure, PlantPlacement, SitePlan, Vec2 } from '../siteplan/types';
import { asphalt } from '../engine/textures';
import { catalogMaterial, pbrMaterial } from './materials';
import { slab } from './hardscape';

/**
 * The neighborhood around the yard: the street, sidewalks, neighboring
 * houses and trees. It gives the scene real-world scale and context.
 */

export interface StreetFrame {
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  /** Unit vector from the property toward the street. */
  out: Vec2;
}

export function streetFrame(plan: SitePlan): StreetFrame | null {
  const e = plan.site.streetEdge;
  const B = plan.site.boundary;
  if (e === undefined || e < 0 || e >= B.length) return null;
  const a = B[e], b = B[(e + 1) % B.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dir: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  let out: Vec2 = [dir[1], -dir[0]];
  const mid: Vec2 = [(a[0] + b[0]) / 2 + out[0] * 0.2, (a[1] + b[1]) / 2 + out[1] * 0.2];
  if (pointInPolygon(mid, B)) out = [-out[0], -out[1]];
  return { a, b, dir, out };
}

/** Signed distance from the street edge toward the street, and position along it. */
export function streetCoords(f: StreetFrame, p: Vec2): { across: number; along: number } {
  const dx = p[0] - f.a[0], dy = p[1] - f.a[1];
  return { across: dx * f.out[0] + dy * f.out[1], along: dx * f.dir[0] + dy * f.dir[1] };
}

export const SIDEWALK = 1.5, CURB = 0.18, ROAD = 9.5;

export interface ContextBuild {
  object: THREE.Group;
  neighbors: ExistingStructure[];
  trees: PlantPlacement[];
  dispose(): void;
}

export function buildContext(plan: SitePlan): ContextBuild {
  const group = new THREE.Group();
  group.name = 'context';
  const geos: THREE.BufferGeometry[] = [];
  const f = streetFrame(plan);
  const neighbors: ExistingStructure[] = [];
  const B = plan.site.boundary;

  if (f) {
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const ext = 70;
    const strip = (d0: number, d1: number): Vec2[] => {
      const P = (along: number, across: number): Vec2 => [f.a[0] + f.dir[0] * along + f.out[0] * across, f.a[1] + f.dir[1] * along + f.out[1] * across];
      return [P(-ext, d0), P(len + ext, d0), P(len + ext, d1), P(-ext, d1)];
    };
    const walk = slab(strip(0, SIDEWALK), -0.2, 0.05, 0.004);
    const curb = slab(strip(SIDEWALK, SIDEWALK + CURB), -0.25, 0.06, 0.01);
    const road = slab(strip(SIDEWALK + CURB, SIDEWALK + CURB + ROAD), -0.3, -0.1, 0);
    const curb2 = slab(strip(SIDEWALK + CURB + ROAD, SIDEWALK + 2 * CURB + ROAD), -0.25, 0.06, 0.01);
    const walk2 = slab(strip(SIDEWALK + 2 * CURB + ROAD, 2 * SIDEWALK + 2 * CURB + ROAD), -0.2, 0.05, 0.004);
    geos.push(walk, curb, road, curb2, walk2);
    const conc = catalogMaterial('concrete');
    const asph = pbrMaterial('asphalt', asphalt());
    for (const [g, m] of [[walk, conc], [curb, conc], [road, asph], [curb2, conc], [walk2, conc]] as const) {
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Neighboring houses on the lots to each side.
    for (const s of plan.structures.filter((x) => x.kind === 'house')) {
      for (const side of [-1, 1]) {
        const shift: Vec2 = [f.dir[0] * (len + 2.5) * side, f.dir[1] * (len + 2.5) * side];
        neighbors.push({ id: `neighbor-${s.id}-${side}`, kind: 'house', polygon: s.polygon.map(([x, y]) => [x + shift[0], y + shift[1]] as Vec2), height: s.height + (side > 0 ? 0.3 : 0), roof: 'hip' });
      }
    }
  }

  // Trees in neighboring yards, outside the fence and off the street.
  const trees: PlantPlacement[] = [];
  const bb = bounds(B);
  const r = rng(`ctx-${plan.site.name}`);
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const R = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2;
  for (let tries = 0; tries < 400 && trees.length < 16; tries++) {
    const ang = r() * Math.PI * 2;
    const d = R + 3 + r() * 22;
    const p: Vec2 = [cx + Math.cos(ang) * d, cy + Math.sin(ang) * d];
    if (pointInPolygon(p, B) || distToEdge(p, B) < 2.5) continue;
    if (f) {
      const s = streetCoords(f, p);
      if (s.across > -1 && s.across < SIDEWALK * 2 + CURB * 2 + ROAD + 1.5) continue;
      // Behind the yard (away from the street) keep trees back: the overview camera sits there.
      if (s.across < 0 && distToEdge(p, B) < 9) continue;
    }
    if (neighbors.some((n) => pointInPolygon(p, n.polygon) || distToEdge(p, n.polygon) < 2)) continue;
    if (trees.some((t) => Math.hypot(t.position[0] - p[0], t.position[1] - p[1]) < 5)) continue;
    trees.push({ id: `ctx-tree-${trees.length}`, catalogId: r() < 0.7 ? 'shade-tree' : 'columnar-tree', position: p, existing: true, scale: 0.85 + r() * 0.35 });
  }

  return {
    object: group,
    neighbors,
    trees,
    dispose() {
      for (const g of geos) g.dispose();
    },
  };
}
