import type { SitePlan, Vec2 } from './types';

/**
 * The two urn fountains from the owner's design boards, without the boards' plants: the glazed turquoise urn in a bark
 * bed against a cedar fence, and the chiseled stone jar in its black pebble basin beside a paver patio.
 */
export function sampleUrnFountains(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Urn fountains: glazed urn and stone jar', boundary: rect(0, 0, 12, 9), latitude: 38.58, longitude: -121.49, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: rect(0, 0, 12, 9) },
      { id: 'bark', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: rect(0.3, 1.0, 5.6, 5.2) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(6.2, 5.6, 11.7, 8.7), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.9], [6, 0.9]], height: 1.9 },
    ],
    water: [],
    plants: [],
    features: [
      { id: 'urn-glazed', source: S, catalogId: 'urn-fountain-glazed', position: [3.0, 3.0], rotationDeg: 0 },
      { id: 'urn-jar', source: S, catalogId: 'urn-fountain-jar', position: [9.0, 3.4], rotationDeg: 0 },
    ],
  };
}
