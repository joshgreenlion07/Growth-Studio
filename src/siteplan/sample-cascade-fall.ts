import type { SitePlan, Vec2 } from './types';

/**
 * An example setting for the twin cascade boulder waterfall: a black mulch bed held by a curved, horseshoe-shaped
 * retaining wall at the back (18 in tall), opening 18 ft 4 in wide onto a concrete patio at the front, about 28 1/2 ft
 * from the patio edge to the back of the wall, with paver walks outside the wall. The waterfall's basin meets the patio
 * edge; cannas, grasses, gaura, lavender, verbena and roses stand in the bed around it, and lawn beyond.
 */
export function sampleCascadeFall(): SitePlan {
  const S = 'sample' as const;
  const FT = 0.3048;
  const cx = 8, front = 10.4;
  // The wall: a half circle at the back, straight sides, and short returns toward the patio.
  const R = 3.9, cy = 5.6;
  const arc: Vec2[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI + (k / 16) * Math.PI;
    arc.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  const half = (18 * FT + 4 * 0.0254) / 2;
  const wall: Vec2[] = [[cx - half - 0.15, front - 0.25], [cx - R, cy + 2.9], ...arc, [cx + R, cy + 2.9], [cx + half + 0.15, front - 0.25]];
  const bed: Vec2[] = [[cx - half, front], [cx - half - 0.2, front - 0.2], [cx - R - 0.05, cy + 2.9], ...arc.map(([x, y]): Vec2 => [cx + (x - cx) * 1.012, cy + (y - cy) * 1.012]), [cx + R + 0.05, cy + 2.9], [cx + half + 0.2, front - 0.2], [cx + half, front]];
  // The waterfall at its medium size (16 x 14 ft), its basin's front at the patio edge.
  const D = 14 * FT;
  const fy = front - D / 2 - 0.04;
  return {
    schemaVersion: 1,
    site: { name: 'Twin cascade boulder waterfall', boundary: [[0, 0], [16, 0], [16, 16], [0, 16]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: [[0, 0], [16, 0], [16, 16], [0, 16]] },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: bed },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[cx - half, front], [cx + half, front], [cx + half + 1.1, 15.2], [cx - half - 1.1, 15.2]] },
      { id: 'walk-l', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: [[cx - R - 1.75, 3.2], [cx - R - 0.3, 3.2], [cx - R - 0.3, cy + 2.9], [cx - half - 0.35, front], [cx - half - 1.1, 15.2], [cx - R - 1.75, 15.2]] },
      { id: 'walk-r', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: [[cx + R + 0.3, 3.2], [cx + R + 1.75, 3.2], [cx + R + 1.75, 15.2], [cx + half + 1.1, 15.2], [cx + half + 0.35, front], [cx + R + 0.3, cy + 2.9]] },
    ],
    lines: [
      { id: 'wall', source: S, kind: 'wall', catalogId: 'melville-tandem-wall-rio', points: wall, height: 18 * 0.0254 },
    ],
    water: [],
    plants: [
      { id: 'canna-1', source: S, catalogId: 'canna-tropicanna', position: [cx - 1.6, 2.6] },
      { id: 'canna-2', source: S, catalogId: 'canna-tropicanna', position: [cx, 2.2] },
      { id: 'canna-3', source: S, catalogId: 'canna-tropicanna', position: [cx + 1.6, 2.6] },
      { id: 'grass-1', source: S, catalogId: 'fountain-grass', position: [cx - 2.9, 3.9] },
      { id: 'grass-2', source: S, catalogId: 'fountain-grass', position: [cx + 2.9, 3.9] },
      { id: 'grass-3', source: S, catalogId: 'fountain-grass', position: [cx - 3.1, 5.6] },
      { id: 'grass-4', source: S, catalogId: 'fountain-grass', position: [cx + 3.1, 5.6] },
      { id: 'gaura-1', source: S, catalogId: 'gaura', position: [cx - 3.2, 7.2] },
      { id: 'rose-1', source: S, catalogId: 'rose-flower-carpet-red', position: [cx + 3.2, 7.2] },
      { id: 'lavender-1', source: S, catalogId: 'lavender', position: [cx - 3.0, 8.9] },
      { id: 'verbena-1', source: S, catalogId: 'verbena', position: [cx + 3.0, 8.9] },
      { id: 'westringia-1', source: S, catalogId: 'westringia', position: [cx + 2.3, 2.9] },
      { id: 'westringia-2', source: S, catalogId: 'westringia', position: [cx - 2.3, 2.9] },
    ],
    features: [
      { id: 'waterfall', source: S, catalogId: 'twin-cascade-boulder-waterfall', position: [cx, fy], rotationDeg: 0 },
    ],
  };
}
