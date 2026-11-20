import type { SitePlan, Vec2 } from './types';

/**
 * Moss rock up close: the three moss rock boulder shapes (rounded in the middle, tall at the left, flat-top at the
 * right), medium size, set in a black mulch bed with blue fescue and a variegated yucca, as Green Lion sets them in beds.
 */
export function sampleMossRock(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rx = 3, ry = 2.6;
  return {
    schemaVersion: 1,
    site: { name: 'Moss rock boulders up close: rounded, tall and flat-top', boundary: rect(0, 0, 6, 5), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, 0.85, 5.7, 4.0) },
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, 4.0, 5.7, 4.8) },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.8], [6, 0.8]], height: 1.8 }],
    water: [],
    plants: ([
      { id: 'yucca', catalogId: 'variegated-yucca', position: [rx - 0.15, ry - 0.75] },
      { id: 'fescue-a', catalogId: 'blue-fescue', position: [rx + 0.62, ry - 0.05] },
      { id: 'fescue-b', catalogId: 'blue-fescue', position: [rx + 0.95, ry - 0.45] },
      { id: 'fescue-c', catalogId: 'blue-fescue', position: [rx - 0.75, ry - 0.3] },
    ] as { id: string; catalogId: string; position: Vec2 }[]).map((p) => ({ ...p, source: S })),
    features: [
      { id: 'moss-rock', source: S, catalogId: 'moss-rock-rounded', position: [rx, ry], rotationDeg: 0 },
      { id: 'moss-rock-tall', source: S, catalogId: 'moss-rock-tall', position: [1.35, 2.9], rotationDeg: 15 },
      { id: 'moss-rock-flat', source: S, catalogId: 'moss-rock-flat-top', position: [4.75, 3.0], rotationDeg: -10 },
    ],
  };
}
