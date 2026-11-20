import type { FeaturePlacement, SitePlan, Vec2 } from './types';
import { samplePremierSlab } from './sample-premier-slab';
import { samplePremierSmooth } from './sample-premier-smooth';
import { samplePremierSlate } from './sample-premier-slate';
import { sampleWallVeneers } from './sample-wall-veneers';
import { sampleBedsLanding } from './sample-beds-landing';
import { sampleCompositeDeck } from './sample-deck';
import { samplePillarFountain } from './sample-pillar-fountain';
import { sampleCedarWaterWall } from './sample-cedar-water-wall';
import { samplePillarWaterWall } from './sample-pillar-water-wall';
import { sampleUrnFountains } from './sample-urn-fountains';
import { sampleMossRock, sampleMossRockMix, sampleRockLibrary } from './sample-moss-rock';
import { sampleSideYard } from './sample-side-yard';
import { sampleVista } from './sample-vista';
import { sampleMowCurb } from './sample-mow-curb';
import { sampleSteelEdging } from './sample-steel-edging';
import { sampleStrappyPlants } from './sample-strappy-plants';
import { sampleFourFall } from './sample-four-fall';
import { sampleStepping } from './sample-stepping';
import { sampleFire } from './sample-fire';
import { sampleWaterFire } from './sample-water-fire';
import { sampleKitchenIsland } from './sample-kitchen-island';
import { sampleHeatersGriddles } from './sample-heaters-griddles';
import { sampleRanch } from './sample-ranch';
import { sampleSoftPlants } from './sample-soft-plants';
import { sampleDryCreek } from './sample-dry-creek';
import { sampleLargeTrees } from './sample-large-trees';
import { sampleMirador } from './sample-mirador';

/**
 * Example yards in Green Lion's style, built from its finished-work photos.
 * These are samples to show the tool, not real customer jobs.
 */

function blob(cx: number, cy: number, rx: number, ry: number, n = 18, wobble = 0.1, seed = 1): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(a * 3 + seed) + wobble * 0.5 * Math.cos(a * 5 + seed * 2);
    out.push([+(cx + Math.cos(a) * rx * w).toFixed(2), +(cy + Math.sin(a) * ry * w).toFixed(2)]);
  }
  return out;
}

/** A smooth curve through control points (Catmull-Rom), for lawn and bed edges. */
function curve(pts: Vec2[], per = 5, closed = false): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([+f(p0[0], p1[0], p2[0], p3[0]).toFixed(2), +f(p0[1], p1[1], p2[1], p3[1]).toFixed(2)]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Modern backyard: paver patio with charcoal border, water wall, fire table, kitchen, turf. */
export function sampleBackyard(): SitePlan {
  const S = 'sample' as const;
  // Lot 20 m wide x 24 m deep; house along the bottom (plan y 16-24).
  const lawnEdge = curve([[1.6, 4.2], [5, 3.2], [9.5, 3.9], [13, 3.1], [16.4, 4.6], [16.6, 8.5], [15.4, 10.4]], 6);
  const lawn: Vec2[] = [...lawnEdge, [9.2, 10.4], [1.6, 10.4]];
  return {
    schemaVersion: 1,
    site: {
      name: 'Sample backyard: modern patio, water wall and fire table',
      boundary: [[0, 0], [20, 0], [20, 24], [0, 24]],
      latitude: 37.64,
      longitude: -120.99,
      northAngleDeg: 0,
      streetEdge: 2,
    },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: [[1.5, 16.5], [18.5, 16.5], [18.5, 24], [1.5, 24]], height: 3.0, roof: 'hip' }],
    zones: [
      { id: 'beds', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[0, 0], [20, 0], [20, 16.5], [0, 16.5]] },
      { id: 'turf', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: lawn },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'paver-ashlar-gray', polygon: [[1.5, 10.4], [15.4, 10.4], [15.4, 16.5], [1.5, 16.5]], border: { catalogId: 'border-charcoal', width: 0.2 }, borderLights: true },
      { id: 'kitchen-pad', source: S, kind: 'hardscape', catalogId: 'paver-ashlar-gray', polygon: [[15.4, 11.6], [19.4, 11.6], [19.4, 16.5], [15.4, 16.5]], border: { catalogId: 'border-charcoal', width: 0.2 } },
      { id: 'step-path', source: S, kind: 'bed', catalogId: 'black-pebble', polygon: [[8.4, 8.2], [10.2, 8.2], [10.2, 10.4], [8.4, 10.4]] },
      { id: 'planter-l', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[1.6, 12.2], [2.8, 12.2], [2.8, 15.2], [1.6, 15.2]], raised: { wallCatalogId: 'wall-tan-charcoal-cap', height: 0.6 }, fill: { catalogId: 'foxtail-fern', spacing: 0.75 } },
      { id: 'creek-bed', source: S, kind: 'bed', catalogId: 'river-rock', polygon: blob(16.6, 2.3, 2.6, 1.6, 22, 0.08, 3) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 16.5], [0, 0], [20, 0], [20, 16.5]], height: 1.85 },
      { id: 'curb', source: S, kind: 'edging', catalogId: 'curb-charcoal', points: lawnEdge, height: 0.1 },
    ],
    water: [
      { id: 'falls', source: S, kind: 'pondless', points: [[18.6, 0.9], [17.6, 2.0], [16.4, 2.7], [15.2, 3.0]], width: 0.7, depth: 0.12, falls: 3, lights: true },
    ],
    plants: [
      // Italian cypress row along the back fence.
      ...[2.2, 4.0, 5.8, 7.6, 9.4].map((x, i) => ({ id: `cy${i}`, source: S, catalogId: 'italian-cypress', position: [x, 0.9] as Vec2 })),
      { id: 'olive', source: S, catalogId: 'olive-tree', position: [12.6, 1.5] },
      { id: 'maple', source: S, catalogId: 'japanese-maple-red', position: [1.2, 7.0] },
      { id: 'citrus1', source: S, catalogId: 'citrus-standard', position: [19.2, 6.5] },
      { id: 'citrus2', source: S, catalogId: 'citrus-standard', position: [19.2, 9.4] },
      ...[[3.2, 2.2], [6.6, 2.0], [10.8, 2.4], [14.4, 1.0]].map((p, i) => ({ id: `pitt${i}`, source: S, catalogId: 'dwarf-pittosporum', position: p as Vec2 })),
      ...[[2.0, 3.0], [5.0, 2.4], [8.2, 2.6], [11.8, 2.6], [0.9, 9.3], [17.6, 9.0], [18.9, 4.8]].map((p, i) => ({ id: `fes${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
      ...[[13.8, 3.6], [15.0, 4.3], [18.8, 3.4]].map((p, i) => ({ id: `fern${i}`, source: S, catalogId: 'foxtail-fern', position: p as Vec2 })),
      { id: 'agave1', source: S, catalogId: 'foxtail-agave', position: [17.4, 7.4] },
      { id: 'agave2', source: S, catalogId: 'agave', position: [0.9, 4.4] },
      { id: 'yucca', source: S, catalogId: 'variegated-yucca', position: [19.0, 1.2] },
      ...[[16.0, 0.6], [17.4, 0.5], [14.6, 1.9]].map((p, i) => ({ id: `fg${i}`, source: S, catalogId: 'fountain-grass', position: p as Vec2 })),
      ...[[13.2, 2.5], [15.6, 3.8], [17.2, 3.6]].map((p, i) => ({ id: `ver${i}`, source: S, catalogId: 'verbena', position: p as Vec2 })),
      ...[[0.8, 1.8], [19.3, 0.6], [0.8, 12.0], [0.8, 14.8]].map((p, i) => ({ id: `rose${i}`, source: S, catalogId: 'rose', position: p as Vec2 })),
      { id: 'carex1', source: S, catalogId: 'gold-carex', position: [9.0, 9.4] },
      { id: 'carex2', source: S, catalogId: 'gold-carex', position: [9.7, 8.6] },
    ],
    features: [
      { id: 'water-wall', source: S, catalogId: 'water-wall-plaster', position: [5.6, 0.75], rotationDeg: 0 },
      { id: 'fire', source: S, catalogId: 'fire-table', position: [8.4, 12.4], rotationDeg: 0 },
      { id: 'lounge', source: S, catalogId: 'lounge-set', position: [8.4, 12.6], rotationDeg: 180 },
      { id: 'pergola', source: S, catalogId: 'pergola-louvered', position: [4.4, 14.2], rotationDeg: 0 },
      { id: 'dining', source: S, catalogId: 'dining-set', position: [4.4, 14.3], rotationDeg: 0 },
      { id: 'kitchen', source: S, catalogId: 'kitchen-l', position: [17.4, 15.0], rotationDeg: 180 },
      { id: 'spa', source: S, catalogId: 'hot-tub', position: [13.6, 14.8], rotationDeg: 0 },
      { id: 'pad1', source: S, catalogId: 'stepping-pad', position: [9.3, 8.6], rotationDeg: 0 },
      { id: 'pad2', source: S, catalogId: 'stepping-pad', position: [9.3, 9.6], rotationDeg: 0 },
      { id: 'b1', source: S, catalogId: 'boulder', position: [14.2, 2.4], rotationDeg: 40 },
      { id: 'b2', source: S, catalogId: 'boulder', position: [18.2, 2.6], rotationDeg: 140 },
      { id: 'b3', source: S, catalogId: 'boulder', position: [16.0, 1.2], rotationDeg: 260 },
      { id: 'bowl1', source: S, catalogId: 'copper-bowl', position: [11.4, 3.2], rotationDeg: 0 },
      { id: 'screen', source: S, catalogId: 'corten-screen', position: [12.6, 0.3], rotationDeg: 0 },
      ...[[3.6, 9.6], [12.6, 9.6], [16.2, 5.6], [7.0, 3.0]].map((p, i) => ({ id: `pl${i}`, source: S, catalogId: 'path-light', position: p as Vec2, rotationDeg: 0 })),
      ...[[12.2, 2.4], [1.6, 6.6], [19.0, 7.8]].map((p, i) => ({ id: `up${i}`, source: S, catalogId: 'spot-light', position: p as Vec2, rotationDeg: 0 })),
    ],
  };
}

/** Front yard: dry creek, boulders, red-brown mulch, turf, brass path lights. */
export function sampleFrontYard(): SitePlan {
  const S = 'sample' as const;
  // Lot 19 m wide x 15 m deep; house at the top (plan y 0-6), street at the bottom.
  const creek = curve([[2.0, 6.4], [3.4, 8.2], [3.0, 10.4], [4.6, 12.6], [5.6, 14.8]], 6);
  const creekPoly: Vec2[] = [...creek.map(([x, y]) => [x - 0.75, y] as Vec2), ...[...creek].reverse().map(([x, y]) => [x + 0.75, y] as Vec2)];
  const turfEdge = curve([[8.4, 15], [8.0, 12.6], [9.0, 10.0], [11.6, 8.8], [12.5, 8.6]], 6);
  return {
    schemaVersion: 1,
    site: {
      name: 'Sample front yard: dry creek and drought-tolerant planting',
      boundary: [[0, 0], [19, 0], [19, 15], [0, 15]],
      latitude: 37.64,
      longitude: -120.99,
      northAngleDeg: 180,
      streetEdge: 2,
    },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: [[1.5, 0], [17.5, 0], [17.5, 6], [1.5, 6]], height: 3.0, roof: 'hip' }],
    zones: [
      { id: 'beds', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: [[0, 6], [12.5, 6], [12.5, 15], [0, 15]] },
      { id: 'turf', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [...turfEdge, [12.5, 15]] },
      { id: 'creek', source: S, kind: 'bed', catalogId: 'white-cobble', polygon: creekPoly },
      { id: 'driveway', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[12.5, 6], [17.5, 6], [17.5, 15], [12.5, 15]] },
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[8.6, 6], [9.8, 6], [9.8, 8.0], [12.5, 8.0], [12.5, 8.6], [8.6, 8.6]] },
      { id: 'hedge-bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: [[1.5, 6], [8.6, 6], [8.6, 6.6], [1.5, 6.6]], fill: { catalogId: 'boxwood-hedge', spacing: 0.5 } },
      { id: 'side', source: S, kind: 'bed', catalogId: 'river-rock', polygon: [[17.5, 0], [19, 0], [19, 15], [17.5, 15]] },
    ],
    lines: [
      { id: 'edge', source: S, kind: 'edging', catalogId: 'steel-edging', points: turfEdge, height: 0.05 },
    ],
    water: [],
    plants: [
      { id: 'olive', source: S, catalogId: 'olive-tree', position: [6.2, 8.0] },
      { id: 'maple', source: S, catalogId: 'japanese-maple-green', position: [11.4, 6.9] },
      ...[[1.4, 9.0], [7.4, 10.4], [5.6, 7.4], [1.2, 13.2]].map((p, i) => ({ id: `fern${i}`, source: S, catalogId: 'foxtail-fern', position: p as Vec2 })),
      ...[[2.2, 11.8], [6.4, 12.6], [7.6, 14.0], [1.0, 7.2], [4.8, 9.4], [6.8, 9.0]].map((p, i) => ({ id: `fes${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
      ...[[0.9, 10.8], [5.0, 11.0], [7.0, 7.2]].map((p, i) => ({ id: `pitt${i}`, source: S, catalogId: 'dwarf-pittosporum', position: p as Vec2 })),
      ...[[2.0, 14.0], [6.0, 14.2], [4.2, 7.0]].map((p, i) => ({ id: `art${i}`, source: S, catalogId: 'artemisia', position: p as Vec2 })),
      ...[[7.0, 11.6], [0.8, 12.2]].map((p, i) => ({ id: `ver${i}`, source: S, catalogId: 'verbena', position: p as Vec2 })),
      { id: 'agave', source: S, catalogId: 'foxtail-agave', position: [7.6, 12.6] },
      { id: 'sedum', source: S, catalogId: 'blue-sedum', position: [5.6, 13.4] },
      { id: 'statice', source: S, catalogId: 'statice', position: [2.6, 9.8] },
    ],
    features: [
      ...[[2.6, 7.6], [4.4, 9.6], [2.0, 10.6], [3.8, 12.0], [5.8, 13.6], [6.8, 11.0], [1.2, 8.4]].map((p, i) => ({ id: `b${i}`, source: S, catalogId: 'boulder', position: p as Vec2, rotationDeg: i * 53 })),
      ...[[8.2, 9.2], [8.0, 11.6], [8.2, 13.8]].map((p, i) => ({ id: `pl${i}`, source: S, catalogId: 'path-light', position: p as Vec2, rotationDeg: 0 })),
      ...[[6.6, 8.8], [10.8, 7.6], [3.0, 13.4]].map((p, i) => ({ id: `up${i}`, source: S, catalogId: 'spot-light', position: p as Vec2, rotationDeg: 0 })),
    ],
  };
}

/** Putting green and lounge corner on artificial turf. */
export function samplePuttingGreen(): SitePlan {
  const S = 'sample' as const;
  const green = curve([[3, 4], [9, 3.4], [12.6, 5.2], [11.6, 9.4], [6, 10.2], [2.6, 8.2]], 6, true);
  return {
    schemaVersion: 1,
    site: { name: 'Sample backyard: putting green and seating platform', boundary: [[0, 0], [16, 0], [16, 18], [0, 18]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: [[1, 13], [15, 13], [15, 18], [1, 18]], height: 3.0, roof: 'hip' }],
    zones: [
      { id: 'beds', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[0, 0], [16, 0], [16, 13], [0, 13]] },
      { id: 'fringe', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [[1.2, 1.4], [14.8, 1.4], [14.8, 11.2], [1.2, 11.2]] },
      { id: 'green', source: S, kind: 'turf', catalogId: 'putting-green', polygon: green },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'concrete-stamped-tan', polygon: [[1, 11.2], [15, 11.2], [15, 13], [1, 13]] },
      { id: 'pebble', source: S, kind: 'bed', catalogId: 'black-pebble', polygon: [[12.8, 1.4], [14.8, 1.4], [14.8, 11.2], [13.6, 11.2], [12.8, 6]] },
      { id: 'platform', source: S, kind: 'hardscape', catalogId: 'concrete-stamped-light', polygon: blob(14.2, 1.8, 2.2, 1.7, 20, 0, 1).filter(([x, y]) => x <= 16 && y >= 0), border: { catalogId: 'border-tan', width: 0.15 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-dark-stained', points: [[0, 13], [0, 0], [16, 0], [16, 13]], height: 1.8 },
      { id: 'curb', source: S, kind: 'edging', catalogId: 'curb-charcoal', points: [[1.2, 11.2], [1.2, 1.4], [12.8, 1.4]], height: 0.1 },
    ],
    water: [],
    plants: [
      ...[1.8, 4.6, 7.4, 10.2].map((x, i) => ({ id: `pitt${i}`, source: S, catalogId: 'pittosporum', position: [x, 0.6] as Vec2 })),
      ...[2.4, 5.0, 8.4, 11.0].map((x, i) => ({ id: `fes${i}`, source: S, catalogId: 'blue-fescue', position: [x, 1.0] as Vec2 })),
      ...[3.0, 6.0, 9.0].map((y, i) => ({ id: `jun${i}`, source: S, catalogId: 'blue-juniper-column', position: [0.6, y] as Vec2 })),
      ...[[13.4, 4.4], [14.2, 7.6], [13.6, 9.8]].map((p, i) => ({ id: `fg${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
    ],
    features: [
      { id: 'c1', source: S, catalogId: 'putting-cup', position: [5.0, 6.0], rotationDeg: 0 },
      { id: 'c2', source: S, catalogId: 'putting-cup', position: [9.6, 5.0], rotationDeg: 0 },
      { id: 'c3', source: S, catalogId: 'putting-cup', position: [8.0, 8.6], rotationDeg: 0 },
      { id: 'b1', source: S, catalogId: 'boulder', position: [13.4, 6.0], rotationDeg: 30 },
      { id: 'b2', source: S, catalogId: 'boulder', position: [14.4, 9.0], rotationDeg: 120 },
      { id: 'pad1', source: S, catalogId: 'stepping-pad', position: [14.0, 4.8], rotationDeg: 0 },
      { id: 'pad2', source: S, catalogId: 'stepping-pad', position: [14.0, 6.6], rotationDeg: 0 },
      { id: 'pad3', source: S, catalogId: 'stepping-pad', position: [14.0, 8.4], rotationDeg: 0 },
      { id: 'umb', source: S, catalogId: 'umbrella', position: [14.4, 1.6], rotationDeg: 0 },
      { id: 'bench', source: S, catalogId: 'bench', position: [14.4, 2.4], rotationDeg: 200 },
    ],
  };
}

/**
 * Four 10 x 10 ft patios to compare paver lines and laying patterns: Avalon Slate on the left, Catalina Grana on the
 * right, both Sonoran Gray; Belgard Pattern A in the front row and Pattern B behind; each with an Anthracite border.
 */
export function samplePaverCompare(): SitePlan {
  const S = 'sample' as const;
  const F = 3.048; // 10 ft
  const sq = (x: number, y: number): Vec2[] => [[x, y], [x + F, y], [x + F, y + F], [x, y + F]];
  const border = { catalogId: 'catalina-grana-border-anthracite', width: 0.229 };
  const patio = (id: string, catalogId: string, laying: 'a' | 'b', x: number, y: number, note: string) =>
    ({ id, source: S, kind: 'hardscape' as const, catalogId, laying, polygon: sq(x, y), border, note });
  return {
    schemaVersion: 1,
    site: { name: 'Paver comparison: Avalon Slate and Catalina Grana, Patterns A and B', boundary: [[0, 0], [9, 0], [9, 9.6], [0, 9.6]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [[0, 0], [9, 0], [9, 9.6], [0, 9.6]] },
      patio('avalon-b', 'avalon-slate-sonoran-gray', 'b', 0.9, 1.2, 'Avalon Slate, Sonoran Gray, Pattern B'),
      patio('catalina-b', 'catalina-grana-sonoran-gray', 'b', 5.05, 1.2, 'Catalina Grana, Sonoran Gray, Pattern B'),
      patio('avalon-a', 'avalon-slate-sonoran-gray', 'a', 0.9, 5.4, 'Avalon Slate, Sonoran Gray, Pattern A'),
      patio('catalina-a', 'catalina-grana-sonoran-gray', 'a', 5.05, 5.4, 'Catalina Grana, Sonoran Gray, Pattern A'),
    ],
    lines: [],
    water: [],
    plants: [],
    features: [],
  };
}

/**
 * Two 5 ft sections of Belgard wall, both in Rio, to compare a smooth and a rough face: Melville Tandem Wall (left,
 * three 7 in courses with its 2 in cap) and Highland Stone (right, four 6 in courses with its 3 in cap).
 */
export function sampleWallCompare(): SitePlan {
  const S = 'sample' as const;
  const L = 1.524; // 5 ft
  return {
    schemaVersion: 1,
    site: { name: 'Wall comparison: Melville Tandem Wall and Highland Stone, Rio', boundary: [[0, 0], [8, 0], [8, 6], [0, 6]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [{ id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [[0, 0], [8, 0], [8, 6], [0, 6]] }],
    lines: [
      { id: 'melville', source: S, kind: 'wall', catalogId: 'melville-tandem-wall-rio', points: [[1.6, 3], [1.6 + L, 3]], height: 0.5334, note: 'Melville Tandem Wall, Rio: 3 courses (21 in) + 2 in cap' },
      { id: 'highland', source: S, kind: 'wall', catalogId: 'highland-stone-rio', points: [[4.9, 3], [4.9 + L, 3]], height: 0.6096, note: 'Highland Stone, Rio: 4 courses (24 in) + 3 in cap' },
    ],
    water: [],
    plants: [],
    features: [],
  };
}

/** Mexican beach pebble in the three sizes Green Lion uses: a 10 x 10 ft bed of each, steel-edged, a walk in front. */
export function samplePebbleSizes(): SitePlan {
  const S = 'sample' as const;
  const F = 3.048; // 10 ft
  const x0 = 0.8, gap = 0.9, y0 = 1.2;
  const beds = (['half-1', '1-2', '2-3'] as const).map((k, i) => {
    const x = x0 + i * (F + gap);
    return { k, poly: [[x, y0], [x + F, y0], [x + F, y0 + F], [x, y0 + F]] as Vec2[], label: ['1/2-1 in', '1-2 in', '2-3 in'][i] };
  });
  const W = x0 * 2 + 3 * F + 2 * gap, walkY = y0 + F + 0.3;
  return {
    schemaVersion: 1,
    site: { name: 'Mexican beach pebble: 1/2-1, 1-2 and 2-3 in, 10 x 10 ft beds', boundary: [[0, 0], [W, 0], [W, walkY + 2.2], [0, walkY + 2.2]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      ...beds.map((b) => ({ id: `pebble-${b.k}`, source: S, kind: 'bed' as const, catalogId: `mexican-beach-pebble-${b.k}`, polygon: b.poly, note: `Mexican beach pebble, black, ${b.label}` })),
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[0.4, walkY], [W - 0.4, walkY], [W - 0.4, walkY + 1.2], [0.4, walkY + 1.2]] },
    ],
    lines: beds.map((b) => ({ id: `edge-${b.k}`, source: S, kind: 'edging' as const, catalogId: 'steel-edging', points: [...b.poly, b.poly[0]], height: 0.05 })),
    water: [],
    plants: [],
    features: [],
  };
}

/**
 * Ground covers to compare: the soil fills (black humus, compost, dirt), the bark Green Lion buys (Walk On Bark and
 * small black wood chips) and crushed gravel in its three sizes (3/8, 3/4 and 1 1/2 in), a 6 x 6 ft steel-edged bed of
 * each in three rows (soil at the back, bark in the middle, gravel in front), with a walk along the front.
 */
export function sampleGroundCovers(): SitePlan {
  const S = 'sample' as const;
  const F = 1.8288; // 6 ft
  const gap = 0.75, x0 = 0.8, y0 = 1.0;
  const rows: { id: string; note: string }[][] = [
    [{ id: 'humus', note: 'Black humus (compost mix)' }, { id: 'compost', note: 'Compost' }, { id: 'topsoil', note: 'Dirt / topsoil' }],
    [{ id: 'walk-on-bark', note: 'Walk On Bark, natural brown' }, { id: 'black-wood-chips', note: 'Black wood chips, small' }],
    [{ id: 'crushed-gravel-3-8', note: 'Crushed gravel, 3/8 in' }, { id: 'crushed-gravel-3-4', note: 'Crushed gravel, 3/4 in' }, { id: 'crushed-gravel-1-1-2', note: 'Crushed gravel, 1 1/2 in' }],
  ];
  const beds = rows.flatMap((row, ri) => row.map((b, ci) => {
    const x = x0 + ci * (F + gap), y = y0 + ri * (F + gap);
    return { ...b, poly: [[x, y], [x + F, y], [x + F, y + F], [x, y + F]] as Vec2[] };
  }));
  const W = x0 * 2 + 3 * F + 2 * gap, walkY = y0 + 3 * F + 2 * gap + 0.3;
  return {
    schemaVersion: 1,
    site: { name: 'Ground covers: soil, bark and gravel, 6 x 6 ft beds', boundary: [[0, 0], [W, 0], [W, walkY + 2.2], [0, walkY + 2.2]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: [[0, 0], [W, 0], [W, walkY], [0, walkY]] },
      ...beds.map((b) => ({ id: `bed-${b.id}`, source: S, kind: 'bed' as const, catalogId: b.id, polygon: b.poly, note: b.note })),
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[0.4, walkY], [W - 0.4, walkY], [W - 0.4, walkY + 1.2], [0.4, walkY + 1.2]] },
    ],
    lines: beds.map((b) => ({ id: `edge-${b.id}`, source: S, kind: 'edging' as const, catalogId: 'steel-edging', points: [...b.poly, b.poly[0]], height: 0.05 })),
    water: [],
    plants: [],
    features: [],
  };
}

/**
 * The soil fills side by side: black humus (compost mix), compost and dirt / topsoil, a 10 x 10 ft bed of each, steel
 * edged, with a long curving bed of black humus behind them along a lawn (about 30 m2, for the look across a yard), and a
 * walk in front.
 */
export function sampleHumus(): SitePlan {
  const S = 'sample' as const;
  const F = 3.048; // 10 ft
  const x0 = 0.8, gap = 0.9;
  // The long bed at the back, a gentle curve along its lawn.
  const ly0 = 1.0, lw = 3 * F + 2 * gap, n = 14;
  const front: Vec2[] = Array.from({ length: n + 1 }, (_, i): Vec2 => [x0 + (lw * i) / n, ly0 + 0.4 + 0.4 * Math.sin((i / n) * Math.PI * 2)]);
  const back: Vec2[] = Array.from({ length: n + 1 }, (_, i): Vec2 => [x0 + lw - (lw * i) / n, ly0 + 3.2 + 0.3 * Math.cos((i / n) * Math.PI * 1.5)]);
  const long = [...front, ...back];
  const y0 = ly0 + 4.6;
  const beds = (['humus', 'compost', 'topsoil'] as const).map((id, i) => {
    const x = x0 + i * (F + gap);
    return { id, poly: [[x, y0], [x + F, y0], [x + F, y0 + F], [x, y0 + F]] as Vec2[] };
  });
  const W = x0 * 2 + lw, walkY = y0 + F + 0.3;
  return {
    schemaVersion: 1,
    site: { name: 'Soil fills: black humus, compost and dirt, 10 x 10 ft beds', boundary: [[0, 0], [W, 0], [W, walkY + 2.2], [0, walkY + 2.2]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: [[0.3, 0.3], [W - 0.3, 0.3], [W - 0.3, ly0 + 4.1], [0.3, ly0 + 4.1]] },
      { id: 'humus-long', source: S, kind: 'bed', catalogId: 'humus', polygon: long, note: 'Black humus (compost mix), long bed along the lawn' },
      ...beds.map((b) => ({ id: `fill-${b.id}`, source: S, kind: 'bed' as const, catalogId: b.id, polygon: b.poly, note: `${b.id === 'humus' ? 'Black humus (compost mix)' : b.id === 'compost' ? 'Compost' : 'Dirt / topsoil'}, 10 x 10 ft` })),
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[0.4, walkY], [W - 0.4, walkY], [W - 0.4, walkY + 1.2], [0.4, walkY + 1.2]] },
    ],
    lines: [
      ...beds.map((b) => ({ id: `edge-${b.id}`, source: S, kind: 'edging' as const, catalogId: 'steel-edging', points: [...b.poly, b.poly[0]], height: 0.05 })),
      { id: 'edge-long', source: S, kind: 'edging', catalogId: 'steel-edging', points: [...long, long[0]], height: 0.05 },
    ],
    water: [],
    plants: [],
    features: [],
  };
}

/** A small backyard with every kind of buried run, for the build stages. */
export function sampleUtilities(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  return {
    schemaVersion: 1,
    site: { name: 'Build stages: trenches and layers', boundary: [[0, 0], [14, 0], [14, 11], [0, 11]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: [[0.5, 0.4], [11, 0.4], [11, 3.5], [0.5, 3.5]], height: 3, roof: 'hip' }],
    zones: [
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'paver-ashlar-gray', polygon: [[1, 3.5], [7, 3.5], [7, 7], [1, 7]] },
      { id: 'turf', source: S, kind: 'turf', catalogId: 'synthetic-turf', polygon: [[7.5, 4.6], [13.2, 4.6], [13.2, 10], [7.5, 10]] },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[0.5, 8.1], [7, 8.1], [7, 10.5], [0.5, 10.5]] },
    ],
    lines: [{ id: 'wall', source: S, kind: 'wall', catalogId: 'wall-gray-block', points: [[0.5, 7.9], [7, 7.9]], height: 0.6 }],
    water: [],
    plants: [],
    features: [],
    utilities: {
      points: [
        { id: 'panel', source: S, kind: 'panel', position: [9.7, 3.8], label: 'Main panel' },
        { id: 'meter', source: S, kind: 'gas-meter', position: [10.5, 3.8] },
        { id: 'stub', source: S, kind: 'gas-stub', position: [7.25, 7.75], label: 'BBQ gas' },
        { id: 'gfci', source: S, kind: 'outlet', position: [7.55, 7.75], label: 'BBQ outlet' },
        { id: 'bf', source: S, kind: 'backflow', position: [1.2, 3.9] },
        { id: 'clock', source: S, kind: 'controller', position: [2.2, 3.85] },
        { id: 'valves', source: S, kind: 'valves', position: [0.95, 7.55] },
        { id: 'xfmr', source: S, kind: 'transformer', position: [12.6, 3.85] },
      ],
      lines: [
        {
          id: 'bbq-run', source: S, points: [[10.1, 3.8], [10.1, 7.75], [7.4, 7.75]], gap: 6 * IN,
          runs: [
            { kind: 'gas', label: '3/4 in PE gas pipe', od: 1.05 * IN, cover: 18 * IN, code: 'CPC 1210.1.1', tracer: true },
            { kind: 'electrical', label: '3/4 in PVC conduit', od: 1.05 * IN, cover: 18 * IN, code: 'CEC Table 300.5' },
          ],
        },
        { id: 'main', source: S, points: [[1.2, 3.9], [1.2, 7.3], [0.95, 7.55]], runs: [{ kind: 'irrigation', label: '1 in mainline', od: 1.315 * IN, cover: 12 * IN, code: 'CPC 609.1' }] },
        { id: 'lateral', source: S, points: [[0.95, 7.55], [0.95, 9.2], [6.8, 9.2]], runs: [{ kind: 'irrigation', label: '3/4 in lateral', od: 1.05 * IN, cover: 6 * IN, code: 'Green Lion standard' }] },
        { id: 'lights', source: S, points: [[12.6, 3.85], [13.5, 4.3], [13.5, 10.4], [7.6, 10.4]], runs: [{ kind: 'lighting', label: 'Low-voltage cable', od: 0.4 * IN, cover: 6 * IN, code: 'CEC Table 300.5' }] },
      ],
    },
  };
}

/**
 * Two real products together: a SunVilla Stratus 10 x 13 ft louvered pergola on a patio of Basalite Premier Slab
 * 24 x 24 in Midnight Terrace (12 x 9 slabs, about 23 1/2 x 17 1/2 ft), lawn around it and a bed of fountain grass
 * behind. No house and no street, the way Area Planner plans arrive.
 */
export function sampleStratusPremier(): SitePlan {
  const S = 'sample' as const;
  const slab = (23.5 * 0.0254); // one slab with its joint
  const x0 = 2.2, y0 = 3.0, x1 = x0 + 12 * slab, y1 = y0 + 9 * slab;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return {
    schemaVersion: 1,
    site: { name: 'SunVilla Stratus on Basalite Premier Slab, Midnight Terrace', boundary: [[0, 0], [12, 0], [12, 11], [0, 11]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: [[0, 0], [12, 0], [12, 11], [0, 11]] },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[0.6, 0.6], [11.4, 0.6], [11.4, 2.2], [0.6, 2.2]] },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'premier-slab-midnight-terrace', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], note: 'Basalite Premier Slab 24 x 24, Midnight Terrace' },
    ],
    lines: [],
    water: [],
    plants: [
      ...[1.4, 2.6, 3.8, 5.0, 6.2, 7.4, 8.6, 9.8].map((x, i) => ({ id: `fg${i}`, source: S, catalogId: 'fountain-grass', position: [x, 1.5 + (i % 2) * 0.35] as Vec2 })),
      { id: 'olive', source: S, catalogId: 'olive-tree', position: [10.8, 1.4] },
    ],
    features: [
      { id: 'stratus', source: S, catalogId: 'sunvilla-stratus-10x13', position: [cx, cy], rotationDeg: 0 },
      { id: 'lounge', source: S, catalogId: 'lounge-set', position: [cx, cy + 0.1], rotationDeg: 0 },
    ],
  };
}

/**
 * The modern backyard lit at night with Tru-Scapes fixtures the way Green Lion lays out a lighting plan: bullet up
 * lights at the cypresses, maple and citrus, floods into the olive, well lights at the water wall, a wash on the
 * corten screen, path lights along the lawn and beds, hardscape lights under the raised planter's cap, paver
 * lights in the patio border, and the transformer on the house. Best seen in the Night or Blue hour mood.
 */
export function sampleTruscapes(): SitePlan {
  const S = 'sample' as const;
  const plan = sampleBackyard();
  plan.site.name = 'Night lighting: Tru-Scapes fixtures in the modern backyard';
  const ts = (id: string, catalog: string, position: Vec2, rotationDeg = 0, fixture?: FeaturePlacement['fixture']): FeaturePlacement => ({
    id, source: S, catalogId: `truscapes-${catalog}`, position, rotationDeg, ...(fixture ? { fixture } : {}),
  });
  // Rotation turns a fixture's front (an aimed head's aim): 0 faces +y, 180 faces -y (the back fence), 90 faces -x.
  const lights: FeaturePlacement[] = [
    // Up lights (set just outside the canopy, aimed in): a bullet in front of each end cypress, two floods crossing into the olive, one at the maple and the citrus.
    ts('up-cy0', 'ts-b102', [2.2, 1.55], 180, { tiltDeg: 8, finish: 'bronze' }),
    ts('up-cy4', 'ts-b102', [9.4, 1.55], 180, { tiltDeg: 8, finish: 'bronze' }),
    ts('up-olive1', 'ts-b106', [11.9, 2.4], 150, { tiltDeg: 18, finish: 'bronze' }),
    ts('up-olive2', 'ts-b106', [13.4, 2.3], 215, { tiltDeg: 18, finish: 'bronze' }),
    ts('up-maple', 'ts-b102', [2.0, 7.3], 105, { tiltDeg: 14, beamDeg: 60, finish: 'bronze' }),
    ts('up-citrus1', 'ts-b102', [18.5, 6.7], 260, { tiltDeg: 12, beamDeg: 60, finish: 'bronze' }),
    ts('up-citrus2', 'ts-b102', [18.5, 9.6], 260, { tiltDeg: 12, beamDeg: 60, finish: 'bronze' }),
    // Well lights in the bed grazing the water wall, and a wash on the corten screen.
    ts('well1', 'ts-b201', [4.7, 1.8], 180, { tiltDeg: 12 }),
    ts('well2', 'ts-b201', [6.5, 1.8], 180, { tiltDeg: 12 }),
    ts('wash-screen', 'ts-b105', [12.6, 1.1], 180, { tiltDeg: 28, finish: 'bronze' }),
    // Path lights along the lawn and the beds, and a modern one at the stepping pads.
    ts('path1', 'ts-b301', [3.6, 9.75], 0, { finish: 'bronze' }),
    ts('path2', 'ts-b301', [12.6, 9.75], 0, { finish: 'bronze' }),
    ts('path3', 'ts-b302', [16.2, 5.6], 0, { finish: 'bronze' }),
    ts('path4', 'ts-b302', [7.0, 3.0], 0, { finish: 'bronze' }),
    ts('path5', 'ts-b308', [10.55, 8.9], 90),
    // Hardscape lights under the raised planter's cap, facing the patio.
    ts('cap1', 'ts-a6000', [2.8, 12.9], 270, { mountHeight: 0.55, finish: 'bronze' }),
    ts('cap2', 'ts-a6000', [2.8, 13.7], 270, { mountHeight: 0.55, finish: 'bronze' }),
    ts('cap3', 'ts-a6000', [2.8, 14.5], 270, { mountHeight: 0.55, finish: 'bronze' }),
    // Paver lights in the patio's soldier border where the lawn meets it.
    ts('paver1', 'ts-hpl-9', [5.4, 10.5], 0),
    ts('paver2', 'ts-hpl-9', [11.4, 10.5], 0),
    // The transformer on the house wall by the spa, bottom a foot above the patio.
    ts('transformer', 'ts-tssa-200', [15.0, 16.49], 180, { mountHeight: 0.38 }),
  ];
  // The generic path and up lights give way to the Tru-Scapes ones; the fire table is left out so the lighting reads.
  plan.features = [...plan.features.filter((f) => !['path-light', 'spot-light', 'fire-table'].includes(f.catalogId)), ...lights];
  return plan;
}

export const SAMPLES = [
  { id: 'backyard', name: 'Modern backyard', make: sampleBackyard },
  { id: 'frontyard', name: 'Front yard dry creek', make: sampleFrontYard },
  { id: 'putting', name: 'Putting green', make: samplePuttingGreen },
  { id: 'pavers', name: 'Paver comparison', make: samplePaverCompare },
  { id: 'premier-smooth', name: 'Basalite Premier Smooth: six colors, two patterns', make: samplePremierSmooth },
  { id: 'premier-slate', name: 'Basalite Premier Slate: six colors, two patterns', make: samplePremierSlate },
  { id: 'premier-slab', name: 'Basalite Premier Slab: five colors, three patterns', make: samplePremierSlab },
  { id: 'stratus', name: 'SunVilla Stratus on Basalite Midnight Terrace', make: sampleStratusPremier },
  { id: 'mirador', name: 'Mirador louvered pergolas, 10 x 20 and 10 x 10, café lights', make: sampleMirador },
  { id: 'walls', name: 'Wall comparison', make: sampleWallCompare },
  { id: 'wall-veneers', name: 'Wall veneers: stacked stone and stucco, with columns', make: sampleWallVeneers },
  { id: 'pebbles', name: 'Mexican beach pebble sizes', make: samplePebbleSizes },
  { id: 'humus', name: 'Soil fills: black humus, compost, dirt', make: sampleHumus },
  { id: 'ground-covers', name: 'Ground covers: soil, bark and gravel', make: sampleGroundCovers },
  { id: 'dry-creek', name: 'Dry creek bed: cobble, moss rock border, boulders, pebble and bark', make: sampleDryCreek },
  { id: 'utilities', name: 'Build stages: trenches and layers', make: sampleUtilities },
  { id: 'truscapes', name: 'Night lighting: Tru-Scapes', make: sampleTruscapes },
  { id: 'vista', name: 'Night lighting: Vista bollards and up lights', make: sampleVista },
  { id: 'deck', name: 'Composite deck: chevron, picture frame, spa set in', make: sampleCompositeDeck },
  { id: 'pillar-fountain', name: 'Three-pillar water feature with bowl planters', make: samplePillarFountain },
  { id: 'cedar-water-wall', name: 'Cedar slat water wall, Silver Travertine', make: sampleCedarWaterWall },
  { id: 'pillar-water-wall', name: 'Two-pillar stucco water wall, Silver Travertine', make: samplePillarWaterWall },
  { id: 'urn-fountains', name: 'Urn fountains: Blue Thumb aqua-teal and Tuscany vases', make: sampleUrnFountains },
  { id: 'moss-rock', name: 'Moss rock boulders up close: rounded, tall and flat-top', make: () => sampleMossRock('tan') },
  { id: 'moss-rock-gray', name: 'Dark gray moss rock boulders up close: rounded, tall and flat-top', make: () => sampleMossRock('gray') },
  { id: 'moss-rock-mix', name: 'Moss rock bed: ten boulders, every one its own', make: sampleMossRockMix },
  { id: 'rock-library-tan', name: 'Rock library: 20 tan-brown moss rocks', make: () => sampleRockLibrary('tan') },
  { id: 'rock-library-gray', name: 'Rock library: 20 dark gray moss rocks', make: () => sampleRockLibrary('gray') },
  { id: 'side-yard', name: 'Side yard with shed, raised bed and urn fountain', make: sampleSideYard },
  { id: 'beds-landing', name: 'Vego raised beds, deck planters and a clad entry landing', make: sampleBedsLanding },
  { id: 'mow-curb', name: 'Poured concrete mow curb: slant, mower and block', make: sampleMowCurb },
  { id: 'steel-edging', name: 'Black steel edging: 1/8 in and 3/16 in', make: sampleSteelEdging },
  { id: 'strappy-plants', name: 'Strap-leaf accents: cordyline, agaves, lomandras, dwarf fountain grass', make: sampleStrappyPlants },
  { id: 'four-fall', name: 'Four-fall rock waterfall', make: sampleFourFall },
  { id: 'fire', name: 'Fire: fire pits, fire table, fire and water bowl, grill', make: sampleFire },
  { id: 'water-fire', name: 'Water and fire: basalt fountain, glazed birdbaths, Florence fire pit', make: sampleWaterFire },
  { id: 'kitchen-island', name: 'Outdoor kitchen: ledgerstone griddle island', make: sampleKitchenIsland },
  { id: 'heaters-griddles', name: 'Infratech patio heaters and Blackstone griddles', make: sampleHeatersGriddles },
  { id: 'stepping', name: 'Stepping stones: slabs, poured pads, flagstone', make: sampleStepping },
  { id: 'ranch', name: 'Single-story ranch with hip roof', make: sampleRanch },
  { id: 'soft-plants', name: 'Front-yard soft plants: verbena, lantana, sedum, pittosporum, box honeysuckle', make: sampleSoftPlants },
  { id: 'large-trees', name: 'Large trees: coast redwood, ginkgo, flowering pear', make: sampleLargeTrees },
];
