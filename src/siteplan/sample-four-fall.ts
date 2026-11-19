import { FOUR_FALL_DEFAULT, FT, fourFallOutlineFt } from './fourfall';
import type { SitePlan, Vec2 } from './types';

/**
 * An example setting for the four-fall rock waterfall (default size: 7 1/2 ft tall, 5 1/2 ft base, 3 ft levels): the
 * waterfall in a fir bark bed against a back fence, a patio of Catalina Grana pavers in front of its basin, lawn either
 * side, and catalog plants on and beside its mound (one is set in the basin on purpose: it moves onto the bank).
 */
export function sampleFourFall(): SitePlan {
  const S = 'sample' as const;
  const [ow, od] = fourFallOutlineFt(FOUR_FALL_DEFAULT).map((v) => v * FT);
  const cx = 8, cy = 2.2 + od / 2;
  const front = cy + od / 2;
  // A point given in the waterfall's own feet (x right, z toward the patio from its front edge), in plan meters.
  const at = (x: number, z: number): Vec2 => [cx + x * FT, front + z * FT];
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Four-fall rock waterfall', boundary: rect(0, 0, 16, 15), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0, 0, 16, 15) },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'fir-bark', polygon: rect(cx - ow / 2 - 0.9, 1.3, cx + ow / 2 + 0.9, front) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(cx - 4.6, front, cx + 4.6, front + 4.2), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0.5, 1.0], [15.5, 1.0]], height: 1.83 },
    ],
    water: [],
    plants: [
      { id: 'maple', source: S, catalogId: 'japanese-maple-green', position: at(-8.2, -15) },
      { id: 'grass-l', source: S, catalogId: 'maiden-grass-morning-light', position: at(-7.6, -8.5) },
      { id: 'grass-r', source: S, catalogId: 'maiden-grass-morning-light', position: at(7.4, -10.5) },
      { id: 'fern-l', source: S, catalogId: 'foxtail-fern', position: at(-4.6, -6.2) },
      { id: 'fern-r', source: S, catalogId: 'foxtail-fern', position: at(4.2, -9.4) },
      { id: 'lomandra-l', source: S, catalogId: 'lomandra', position: at(-6.8, -3.2) },
      { id: 'lomandra-r', source: S, catalogId: 'lomandra', position: at(6.6, -4.0) },
      { id: 'daylily-l', source: S, catalogId: 'daylily-stella-de-oro', position: at(-3.2, -12.5) },
      { id: 'daylily-r', source: S, catalogId: 'daylily-stella-de-oro', position: at(3.0, -13.0) },
      { id: 'fescue-top', source: S, catalogId: 'blue-fescue', position: at(-1.8, -17.2) },
      { id: 'westringia-r', source: S, catalogId: 'westringia', position: at(8.6, -16) },
      // Set in the basin on purpose: it is moved onto the nearest bank it can stand on.
      { id: 'in-basin', source: S, catalogId: 'lomandra', position: at(0.4, -2.5) },
      { id: 'box-l', source: S, catalogId: 'boxwood', position: at(-9.4, -0.8) },
      { id: 'box-r', source: S, catalogId: 'boxwood', position: at(9.4, -0.8) },
    ],
    features: [
      { id: 'waterfall', source: S, catalogId: 'rock-waterfall-4-fall', position: [cx, cy], rotationDeg: 0 },
    ],
  };
}
