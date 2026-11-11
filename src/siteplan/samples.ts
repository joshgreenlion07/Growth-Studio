import type { SitePlan, Vec2 } from './types';

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

export const SAMPLES = [
  { id: 'backyard', name: 'Modern backyard', make: sampleBackyard },
  { id: 'frontyard', name: 'Front yard dry creek', make: sampleFrontYard },
  { id: 'putting', name: 'Putting green', make: samplePuttingGreen },
];
