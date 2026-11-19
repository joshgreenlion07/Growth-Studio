import type { SitePlan, Vec2 } from './types';

/**
 * An example setting for the two-pillar stucco water wall, as in the owner's design drawing: the wall 2 ft off a back
 * fence, planting beds on either side (fountain grass and lomandra behind, red yucca by the pillars, white fortnight
 * lilies and dead nettle at the front) edged with Belgard Melville Curb in Pearl, and a paver patio up to the basin.
 */
export function samplePillarWaterWall(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const fx = 5, fenceY = 0.8;
  // The pillars' backs stand 2 ft in front of the fence; the footprint is 47 in deep, centered on its position.
  const back = fenceY + 24 * IN, fy = back + 23.5 * IN;
  const pillarFront = back + 24 * IN, bedFront = pillarFront + 0.6, half = 78 * IN;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const side = (sx: -1 | 1, d: number, y: number): Vec2 => [fx + sx * (half + d), y];
  const beds = ([-1, 1] as const).flatMap((sx) => [
    { id: `grass-a${sx}`, catalogId: 'fountain-grass', position: side(sx, 0.95, fenceY + 0.5) },
    { id: `grass-b${sx}`, catalogId: 'fountain-grass', position: side(sx, 0.35, fenceY + 0.42) },
    { id: `lomandra${sx}`, catalogId: 'lomandra', position: side(sx, 1.55, fenceY + 0.75) },
    { id: `yucca${sx}`, catalogId: 'red-yucca', position: side(sx, 0.4, pillarFront - 0.1) },
    { id: `lily-a${sx}`, catalogId: 'fortnight-lily', position: side(sx, 1.05, pillarFront + 0.05) },
    { id: `lily-b${sx}`, catalogId: 'fortnight-lily', position: side(sx, 0.55, bedFront - 0.3) },
    { id: `lamium-a${sx}`, catalogId: 'lamium-white-nancy', position: side(sx, 0.2, bedFront - 0.2) },
    { id: `lamium-b${sx}`, catalogId: 'lamium-white-nancy', position: side(sx, 1.25, bedFront - 0.25) },
  ]);
  return {
    schemaVersion: 1,
    site: { name: 'Two-pillar stucco water wall, Silver Travertine', boundary: rect(0, 0, 10, 8), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.3, bedFront, 9.7, 7.7), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
      { id: 'patio-c', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(fx - half, pillarFront, fx + half, bedFront) },
      { id: 'bed-l', source: S, kind: 'bed', catalogId: 'fir-bark', polygon: rect(0.3, fenceY + 0.05, fx - half, bedFront) },
      { id: 'bed-r', source: S, kind: 'bed', catalogId: 'fir-bark', polygon: rect(fx + half, fenceY + 0.05, 9.7, bedFront) },
      { id: 'bed-b', source: S, kind: 'bed', catalogId: 'fir-bark', polygon: rect(fx - half, fenceY + 0.05, fx + half, back) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, fenceY], [10, fenceY]], height: 2.0 },
      { id: 'curb-l', source: S, kind: 'edging', catalogId: 'melville-curb-pearl', points: [[0.3, bedFront], [fx - half, bedFront]], height: 0.15, reveal: 5.5 * IN },
      { id: 'curb-r', source: S, kind: 'edging', catalogId: 'melville-curb-pearl', points: [[fx + half, bedFront], [9.7, bedFront]], height: 0.15, reveal: 5.5 * IN },
    ],
    water: [],
    plants: beds.map((p) => ({ ...p, source: S })),
    features: [{ id: 'water-wall', source: S, catalogId: 'two-pillar-travertine-water-wall', position: [fx, fy], rotationDeg: 0 }],
  };
}
