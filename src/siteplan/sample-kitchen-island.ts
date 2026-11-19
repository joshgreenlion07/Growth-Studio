import type { SitePlan, Vec2 } from './types';

/**
 * The ledgerstone griddle island (siteplan/kitchen.ts) on a paver patio, set as on the design it was drawn from: its
 * back 2 ft off a fence, a planting strip along the fence. Best seen in the afternoon for the stone and the stainless,
 * and at night for the LED strip under the counter (Hand tool: griddle hood, doors, drawers, light).
 */
export function sampleKitchenIsland(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const fenceY = 1.0;
  const ix = 6, iy = fenceY + 24 * IN + 15 * IN;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Outdoor kitchen: ledgerstone griddle island', boundary: rect(0, 0, 12, 10), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, fenceY + 0.05, 11.7, fenceY + 0.55) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-sonoran-gray', polygon: rect(0.3, fenceY + 0.55, 11.7, 9.7), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, fenceY], [12, fenceY]], height: 1.8 },
    ],
    water: [],
    plants: [
      ...[0.9, 2.9, 9.1, 11.1].map((x, i) => ({ id: `grass${i}`, source: S, catalogId: 'lomandra', position: [x, fenceY + 0.3] as Vec2 })),
    ],
    features: [
      { id: 'island', source: S, catalogId: 'kitchen-island-ledgerstone-griddle-126', position: [ix, iy], rotationDeg: 0 },
    ],
  };
}
