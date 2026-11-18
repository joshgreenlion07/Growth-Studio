import type { FeaturePlacement, SitePlan, Vec2 } from './types';

/**
 * Every stepping stone side by side: Belgard Dimensions Slabs in their three sizes (12 x 24, 24 x 24, 24 x 36) in a
 * pebble bed, 3 x 3 ft and 4 x 4 ft poured concrete pads in a lawn, and flagstone steppers (18 to 24 in and 24 to
 * 36 in) in the three flagstones Green Lion buys, in decomposed granite. Each path runs along x with a 6 in gap
 * (pads 4 in), long stones lying across the walk.
 */
export function sampleStepping(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const features: FeaturePlacement[] = [];
  /** Lays stones along x from x0 at height y: each [catalogId, materialId, length along the path in inches]. */
  const path = (name: string, x0: number, y: number, gapIn: number, stones: [string, string, number][]) => {
    let x = x0;
    stones.forEach(([catalogId, materialId, len], i) => {
      x += (len * IN) / 2;
      features.push({ id: `${name}${i}`, source: S, catalogId, position: [Math.round(x * 1000) / 1000, y], rotationDeg: 0, materialId });
      x += (len * IN) / 2 + gapIn * IN;
    });
  };
  path('slab', 0.9, 2.2, 6, [
    ['stepping-stone-12x24', 'dimensions-slab-24-anthracite', 12], ['stepping-stone-12x24', 'dimensions-slab-24-anthracite', 12], ['stepping-stone-12x24', 'dimensions-slab-24-anthracite', 12],
    ['stepping-stone-24', 'dimensions-slab-24-pearl', 24], ['stepping-stone-24', 'dimensions-slab-24-pearl', 24], ['stepping-stone-24', 'dimensions-slab-24-pearl', 24],
    ['stepping-stone-24x36', 'dimensions-slab-24-scandina-gray', 24], ['stepping-stone-24x36', 'dimensions-slab-24-scandina-gray', 24], ['stepping-stone-24x36', 'dimensions-slab-24-scandina-gray', 24],
  ]);
  path('pad', 0.9, 4.9, 4, [
    ['stepping-pad-36', 'concrete-broom', 36], ['stepping-pad-36', 'concrete-smooth-charcoal', 36],
    ['stepping-pad-48', 'concrete-exposed-sandstone', 48], ['stepping-pad-48', 'concrete-broom-desert-tan', 48],
  ]);
  path('flag', 0.9, 7.4, 6, [
    ['flagstone-stepper-18-24', 'flagstone-az-classic-oak', 21], ['flagstone-stepper-18-24', 'flagstone-az-classic-oak', 21], ['flagstone-stepper-24-36', 'flagstone-az-classic-oak', 30],
    ['flagstone-stepper-18-24', 'flagstone-cold-water-canyon', 21], ['flagstone-stepper-18-24', 'flagstone-cold-water-canyon', 21], ['flagstone-stepper-24-36', 'flagstone-cold-water-canyon', 30],
    ['flagstone-stepper-18-24', 'flagstone-sui-black-slate', 21], ['flagstone-stepper-18-24', 'flagstone-sui-black-slate', 21], ['flagstone-stepper-24-36', 'flagstone-sui-black-slate', 30],
  ]);
  return {
    schemaVersion: 1,
    site: { name: 'Stepping stones: slabs, poured pads, flagstone', boundary: rect(0, 0, 12, 9.4), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.2, 0.2, 11.8, 1.1) },
      { id: 'pebbles', source: S, kind: 'bed', catalogId: 'black-pebble', polygon: rect(0.2, 1.1, 11.8, 3.4) },
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.2, 3.4, 11.8, 6.3) },
      { id: 'dg', source: S, kind: 'bed', catalogId: 'decomposed-granite', polygon: rect(0.2, 6.3, 11.8, 9.2) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.1], [12, 0.1]], height: 1.8 },
      { id: 'edge1', source: S, kind: 'edging', catalogId: 'curb-charcoal', points: [[0.2, 3.4], [11.8, 3.4]], height: 0.1 },
      { id: 'edge2', source: S, kind: 'edging', catalogId: 'curb-charcoal', points: [[0.2, 6.3], [11.8, 6.3]], height: 0.1 },
    ],
    water: [],
    plants: [
      ...[1.0, 3.6, 6.2, 8.8, 11.2].map((x, i) => ({ id: `jun${i}`, source: S, catalogId: 'blue-juniper-column', position: [x, 0.6] as Vec2 })),
      ...[2.3, 4.9, 7.5, 10.0].map((x, i) => ({ id: `grass${i}`, source: S, catalogId: 'lomandra', position: [x, 0.7] as Vec2 })),
    ],
    features,
  };
}
