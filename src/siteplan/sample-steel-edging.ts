import type { SitePlan, Vec2 } from './types';

/**
 * The black steel edging Green Lion buys, in a lawn: the thin 1/8 in (Border Concepts BORDER Line) round a curved bark
 * bed, the thick 3/16 in along a straight-edged bed of Yosemite Tan pebble.
 */
export function sampleSteelEdging(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const BACK = 0.6;
  const curve: Vec2[] = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, x = 0.4 + 5.2 * t;
    curve.push([x, 1.7 + 1.3 * Math.sin(Math.PI * t) ** 0.7 + 0.35 * Math.sin(2 * Math.PI * t)]);
  }
  const bark: Vec2[] = [[0.4, BACK], ...curve, [5.6, BACK]];
  const straight: Vec2[] = [[6.4, 2.5], [11.6, 2.5]];
  const gravel: Vec2[] = [[6.4, BACK], ...straight, [11.6, BACK]];
  return {
    schemaVersion: 1,
    site: { name: 'Black steel edging: 1/8 in and 3/16 in', boundary: rect(0, 0, 12, 7.5), latitude: 38.58, longitude: -121.49, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0, 0, 12, 7.5) },
      { id: 'bed-bark', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: bark },
      { id: 'bed-pebble', source: S, kind: 'bed', catalogId: 'yosemite-tan-1-5', polygon: gravel },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, BACK - 0.05], [12, BACK - 0.05]], height: 1.85 },
      { id: 'edge-thin', source: S, kind: 'edging', catalogId: 'steel-edging-black-1-8', points: curve, height: 0.05 },
      { id: 'edge-thick', source: S, kind: 'edging', catalogId: 'steel-edging-black-3-16', points: straight, height: 0.05 },
    ],
    water: [],
    plants: [
      ...[[1.5, 1.4], [3.0, 2.2], [4.6, 1.5]].map((p, i) => ({ id: `pitt${i}`, source: S, catalogId: 'dwarf-pittosporum', position: p as Vec2 })),
      ...[[7.4, 1.5], [9.0, 1.6], [10.6, 1.5]].map((p, i) => ({ id: `fes${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
    ],
    features: [],
  };
}
