import type { SitePlan, Vec2 } from './types';

/**
 * An example setting for the three-pillar stucco water feature: against a west fence (gray boards, cedar lattice) facing
 * a patio of Catalina Grana pavers with a Midnight soldier border, planting beds with blue juniper columns, foxtail ferns
 * and lomandra on either side, and one bowl planter of each kind (planted and empty) on the patio.
 */
export function samplePillarFountain(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const fx = 6, fenceY = 1.0;
  // The pillars' fronts stand 1.55 m out from the fence, 3 in in front of the feature's center line.
  const fy = fenceY + 1.55 - 3 * IN;
  const half = 84 * IN, front = fy + 25 * IN, back = fy - 25 * IN, bedFront = front - 0.28;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Three-pillar water feature with bowl planters', boundary: rect(0, 0, 12, 11), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.3, front, 11.7, 10.6), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
      { id: 'patio-l', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.3, bedFront, fx - half, front) },
      { id: 'patio-r', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(fx + half, bedFront, 11.7, front) },
      { id: 'bed-l', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, fenceY + 0.05, fx - half, bedFront) },
      { id: 'bed-r', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(fx + half, fenceY + 0.05, 11.7, bedFront) },
      { id: 'bed-b', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(fx - half, fenceY + 0.05, fx + half, back) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, fenceY], [12, fenceY]], height: 2.0 },
      { id: 'curb-l', source: S, kind: 'edging', catalogId: 'melville-curb-anthracite', points: [[0.3, bedFront], [fx - half, bedFront]], height: 0.15 },
      { id: 'curb-r', source: S, kind: 'edging', catalogId: 'melville-curb-anthracite', points: [[fx + half, bedFront], [11.7, bedFront]], height: 0.15 },
    ],
    water: [],
    plants: [
      { id: 'juniper-l', source: S, catalogId: 'blue-juniper-column', position: [fx - 2.95, fenceY + 0.55] },
      { id: 'juniper-r', source: S, catalogId: 'blue-juniper-column', position: [fx + 2.95, fenceY + 0.55] },
      { id: 'fern-l', source: S, catalogId: 'foxtail-fern', position: [fx - 2.75, bedFront - 0.35] },
      { id: 'fern-r', source: S, catalogId: 'foxtail-fern', position: [fx + 2.6, bedFront - 0.4] },
      { id: 'grass-l', source: S, catalogId: 'lomandra', position: [fx - 74 * IN, front - 0.3] },
      { id: 'grass-r', source: S, catalogId: 'lomandra', position: [fx + 70 * IN, front - 0.3] },
      { id: 'grass-l2', source: S, catalogId: 'fountain-grass', position: [fx - 3.9, fenceY + 0.9] },
      { id: 'grass-r2', source: S, catalogId: 'fountain-grass', position: [fx + 3.9, fenceY + 0.9] },
    ],
    features: [
      { id: 'water-feature', source: S, catalogId: 'three-pillar-water-feature', position: [fx, fy], rotationDeg: 0 },
      { id: 'bowl-planted', source: S, catalogId: 'patina-bowl-planter', position: [fx + 3.2, front + 1.6], rotationDeg: 0 },
      { id: 'bowl-empty', source: S, catalogId: 'patina-bowl-planter', position: [fx + 4.2, front + 1.6], rotationDeg: 0, planted: false },
    ],
  };
}
