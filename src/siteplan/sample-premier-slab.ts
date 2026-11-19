import type { SitePlan, Vec2 } from './types';

/**
 * Basalite Premier Slab 24 x 24 in its five Northern California colors and Basalite's three patterns, 10 x 10 ft
 * each: Stacked Bond, Running Bond and 45 degree Running Bond along the top row, the other two colors in Running Bond
 * and Stacked Bond below.
 */
export function samplePremierSlab(): SitePlan {
  const S = 'sample' as const;
  const F = 3.048; // 10 ft
  const sq = (x: number, y: number): Vec2[] => [[x, y], [x + F, y], [x + F, y + F], [x, y + F]];
  const patches: [string, string, 'stack' | 'halfBond' | 'halfBond45', number, number][] = [
    ['positano', 'Positano', 'stack', 0, 0], ['torino', 'Torino', 'halfBond', 1, 0], ['bodega-dunes', 'Bodega Dunes', 'halfBond45', 2, 0],
    ['midnight-terrace', 'Midnight Terrace', 'halfBond', 0.5, 1], ['oceanside', 'Oceanside', 'stack', 1.5, 1],
  ];
  const names = { stack: 'Stacked Bond', halfBond: 'Running Bond', halfBond45: '45° Running Bond' };
  const zones = patches.map(([slug, name, laying, c, r]) => ({ id: `slab-${slug}`, source: S, kind: 'hardscape' as const, catalogId: `premier-slab-${slug}`, laying, polygon: sq(0.8 + c * (F + 0.8), 0.9 + r * (F + 1.0)), note: `Premier Slab, ${name}, ${names[laying]}` }));
  return {
    schemaVersion: 1,
    site: { name: 'Basalite Premier Slab: five colors, three patterns', boundary: [[0, 0], [12.4, 0], [12.4, 8.9], [0, 8.9]], latitude: 38.45, longitude: -121.82, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [{ id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [[0, 0], [12.4, 0], [12.4, 8.9], [0, 8.9]] }, ...zones],
    lines: [],
    water: [],
    plants: [],
    features: [],
  };
}
