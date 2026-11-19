import type { SitePlan, Vec2 } from './types';

/**
 * Wall veneers side by side: three 8 ft seat walls, 30 in tall, on a paver patio, each with a veneer column at both
 * ends in the same finish: MSI Arctic Golden stacked stone, Santa Barbara smooth trowel stucco and sand finish stucco
 * (Green Lion's warm gray from the three-pillar job). The columns are 40 in of column block under a 2 in cap.
 */
export function sampleWallVeneers(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const finishes = ['msi-arctic-golden-ledger', 'stucco-santa-barbara-warm-gray', 'stucco-sand-finish-warm-gray'];
  const L = 96 * IN, col = 24 * IN, gap = 1.1, y = 3.0;
  const lines = finishes.map((id, i) => {
    const x0 = 1.0 + i * (L + 2 * col + gap) + col;
    return { id: `wall-${i}`, source: S, kind: 'wall' as const, catalogId: id, points: [[x0, y], [x0 + L, y]] as Vec2[], height: 30 * IN };
  });
  const features = finishes.flatMap((id, i) => {
    const x0 = 1.0 + i * (L + 2 * col + gap) + col;
    return [0, 1].map((e) => ({ id: `col-${i}-${e}`, source: S, catalogId: `veneer-column-${id}`, position: [e ? x0 + L + col / 2 : x0 - col / 2, y] as Vec2, rotationDeg: 0, ...(i === 1 && e === 1 ? { options: { pewterCap: true } } : {}) }));
  });
  const W = 1.0 * 2 + 3 * (L + 2 * col) + 2 * gap;
  return {
    schemaVersion: 1,
    site: { name: 'Wall veneers: Arctic Golden stacked stone, Santa Barbara and sand finish stucco', boundary: rect(0, 0, W, 7), latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: rect(0, 0, W, 7) },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.6, 1.6, W - 0.6, y - 0.2) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.6, y + 0.25, W - 0.6, 6.4), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines,
    water: [],
    plants: [],
    features,
  };
}
