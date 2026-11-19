import type { SitePlan, Vec2 } from './types';

/**
 * Poured concrete mow curb in its three shapes, each edging a bark bed against a lawn: the slant on a curved bed, the
 * mower edge on a square-cornered one, the block on a kidney curve. Natural gray, desert tan and charcoal.
 */
export function sampleMowCurb(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const BACK = 0.6;
  // A bed's lawn-side edge from its back at x0 round to its back at x1, bulging out to depth y at the middle.
  const bulge = (x0: number, x1: number, y: number, y0: number, steps = 28): Vec2[] => {
    const pts: Vec2[] = [[x0, BACK]];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = x0 + (x1 - x0) * t;
      pts.push([x, y0 + (y - y0) * Math.sin(Math.PI * t) ** 0.6]);
    }
    pts.push([x1, BACK]);
    return pts;
  };
  const kidney = (x0: number, x1: number, steps = 32): Vec2[] => {
    const pts: Vec2[] = [[x0, BACK]];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = x0 + (x1 - x0) * t;
      pts.push([x, 1.9 + 0.75 * Math.sin(Math.PI * t) - 0.55 * Math.sin(Math.PI * t) ** 6 * Math.cos(2 * Math.PI * t) ** 2 + 0.35 * Math.sin(2 * Math.PI * t)]);
    }
    pts.push([x1, BACK]);
    return pts;
  };
  const slant = bulge(0.4, 4.0, 3.1, 1.9);
  const mower: Vec2[] = [[4.6, BACK], [4.6, 2.6], [7.8, 2.6], [7.8, BACK]];
  const block = kidney(8.4, 11.8);
  const bed = (edge: Vec2[]): Vec2[] => edge.concat([[edge[edge.length - 1][0], BACK - 0.01], [edge[0][0], BACK - 0.01]]).slice(0, -2);
  return {
    schemaVersion: 1,
    site: { name: 'Poured concrete mow curb: slant, mower and block', boundary: rect(0, 0, 12.2, 8), latitude: 38.58, longitude: -121.49, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0, 0, 12.2, 8) },
      { id: 'bed-slant', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: bed(slant) },
      { id: 'bed-mower', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: bed(mower) },
      { id: 'bed-block', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: bed(block) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, BACK - 0.05], [12.2, BACK - 0.05]], height: 1.85 },
      { id: 'curb-slant', source: S, kind: 'edging', catalogId: 'mow-curb-slant-natural-gray', points: slant.slice(1, -1), height: 0.1 },
      { id: 'curb-mower', source: S, kind: 'edging', catalogId: 'mow-curb-mower-desert-tan', points: mower.slice(1, -1).concat(), height: 0.1 },
      { id: 'curb-block', source: S, kind: 'edging', catalogId: 'mow-curb-block-charcoal', points: block.slice(1, -1), height: 0.1 },
    ],
    water: [],
    plants: [
      ...[[1.3, 1.5], [2.2, 2.2], [3.1, 1.5]].map((p, i) => ({ id: `pitt${i}`, source: S, catalogId: 'dwarf-pittosporum', position: p as Vec2 })),
      ...[[5.4, 1.6], [6.2, 2.0], [7.0, 1.6]].map((p, i) => ({ id: `fes${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
      ...[[9.3, 1.6], [10.1, 2.3], [10.9, 1.7]].map((p, i) => ({ id: `fern${i}`, source: S, catalogId: 'foxtail-fern', position: p as Vec2 })),
    ],
    features: [],
  };
}
