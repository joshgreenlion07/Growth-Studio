import type { SitePlan, Vec2 } from './types';

/**
 * A corner-lot front yard with the large trees: three existing coast redwoods (about 70 ft, 30 ft canopies) just
 * outside the dark-stained side fence, an existing Bradford flowering pear in bloom at the street corner, an existing
 * ginkgo 'Princeton Sentry' in the narrow side yard, and a new 15 gal pear (in leaf) so the growth slider shows one
 * growing in. Existing trees stay at their mature size (`existing`), sized with `scale`. Meters.
 */
export function sampleLargeTrees(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    schemaVersion: 1,
    site: { name: 'Large trees: coast redwood, ginkgo, flowering pear', boundary: rect(0, 0, 34, 28), latitude: 38.58, longitude: -121.49, northAngleDeg: 0 },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: rect(4.5, 2, 21, 13), height: 2.8, roof: 'hip' }],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0, 0, 34, 28) },
      { id: 'front-bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(0, 13, 28, 26) },
      { id: 'side-bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(0, 2, 4.5, 13) },
      { id: 'street-strip', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(28.2, 0, 34, 26) },
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: rect(11, 13, 12.4, 26) },
    ],
    lines: [
      { id: 'side-fence', source: S, kind: 'fence', catalogId: 'fence-dark-stained', points: [[28, 0], [28, 13]], height: 1.83 },
      { id: 'yard-fence', source: S, kind: 'fence', catalogId: 'fence-dark-stained', points: [[21, 13], [28, 13]], height: 1.83 },
      { id: 'side-yard-fence', source: S, kind: 'fence', catalogId: 'fence-dark-stained', points: [[0, 13], [4.5, 13]], height: 1.83 },
    ],
    water: [],
    plants: [
      { id: 'redwood-1', source: S, catalogId: 'coast-redwood', position: [31, 2.5], existing: true },
      { id: 'redwood-2', source: S, catalogId: 'coast-redwood', position: [31.3, 11], existing: true, scale: 1.1 },
      { id: 'redwood-3', source: S, catalogId: 'coast-redwood', position: [30.8, 19.5], existing: true, scale: 0.9 },
      { id: 'pear-corner', source: S, catalogId: 'callery-pear-bradford', position: [24.5, 22.5], existing: true },
      { id: 'ginkgo-side', source: S, catalogId: 'ginkgo-princeton-sentry', position: [2.2, 7.5], existing: true, scale: 0.65 },
      { id: 'pear-new', source: S, catalogId: 'callery-pear-bradford-leaf', position: [5.5, 21], container: '15g' },
    ],
    features: [],
  };
}
