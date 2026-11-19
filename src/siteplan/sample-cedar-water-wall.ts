import type { SitePlan, Vec2 } from './types';

/**
 * An example setting for the cedar slat water wall with its Silver Travertine panel, as in the owner's design rendering:
 * the wall backed by a fence with yew pines behind, its pebbles meeting a band of white cobble, a poured concrete step
 * pad in front of the stone, and a paver patio beyond.
 */
export function sampleCedarWaterWall(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const fx = 6, fenceY = 0.9;
  // The wall's back stands 2 in in front of the fence; its footprint is 30 in deep, centered on its position.
  const fy = fenceY + 2 * IN + 15 * IN;
  const front = fy + 15 * IN, half = 72 * IN;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Cedar slat water wall, Silver Travertine', boundary: rect(0, 0, 12, 10), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'cobble', source: S, kind: 'bed', catalogId: 'white-cobble', polygon: rect(0.3, fenceY + 0.05, 11.7, front + 1.1) },
      { id: 'pad', source: S, kind: 'hardscape', catalogId: 'concrete-smooth', polygon: rect(fx - 0.9, front + 0.12, fx + 0.9, front + 1.0) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.3, front + 1.1, 11.7, 9.7), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, fenceY], [12, fenceY]], height: 2.0 },
    ],
    water: [],
    plants: [
      ...[-2.4, -1.2, 0, 1.2, 2.4].map((d, i) => ({ id: `yew-${i}`, source: S, catalogId: 'yew-pine-column', position: [fx + d, fenceY - 0.45] as Vec2 })),
      { id: 'cypress-l', source: S, catalogId: 'italian-cypress', position: [fx - half - 1.4, fenceY - 0.5] as Vec2 },
      { id: 'cypress-r', source: S, catalogId: 'italian-cypress', position: [fx + half + 1.4, fenceY - 0.5] as Vec2 },
    ],
    features: [{ id: 'water-wall', source: S, catalogId: 'cedar-slat-travertine-water-wall', position: [fx, fy], rotationDeg: 0 }],
  };
}
