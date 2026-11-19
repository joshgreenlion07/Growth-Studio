import type { SitePlan, Vec2 } from './types';

/**
 * Basalite Premier Slate in all six Northern California colors, 8 x 8 ft each: the top row in Basalite's 3 Piece Combo
 * Pattern, the bottom row in 4 Piece Pattern #4 (with the 12 x 18). Each patch has a 6 x 9 soldier border: Charcoal on
 * the left two, the field's own color on the rest.
 */
export function samplePremierSlate(): SitePlan {
  const S = 'sample' as const;
  const F = 2.4384; // 8 ft
  const sq = (x: number, y: number): Vec2[] => [[x, y], [x + F, y], [x + F, y + F], [x, y + F]];
  // The border band: the 6 x 9 laid long side across, 8.84 in on the module.
  const W = 9 * (11.79 / 12) * 0.0254;
  const colors: [string, string][] = [['positano', 'Positano'], ['torino', 'Torino'], ['bodega-dunes', 'Bodega Dunes'], ['midnight-terrace', 'Midnight Terrace'], ['oceanside', 'Oceanside'], ['seascape', 'SeaScape']];
  const zones = colors.map(([slug, name], i) => {
    const row = i < 3 ? 0 : 1, col = i % 3;
    const laying = row === 0 ? 'combo3' as const : 'combo4' as const;
    const border = col === 0 ? 'premier-slate-border-charcoal' : `premier-slate-border-${slug}`;
    return { id: `pt-${slug}`, source: S, kind: 'hardscape' as const, catalogId: `premier-slate-${slug}`, laying, polygon: sq(0.8 + col * (F + 0.9), 1.0 + row * (F + 1.1)), border: { catalogId: border, width: W }, note: `Premier Slate, ${name}, ${row === 0 ? '3 Piece Combo Pattern' : '4 Piece Pattern #4'}` };
  });
  return {
    schemaVersion: 1,
    site: { name: 'Basalite Premier Slate: six colors, 3 Piece Combo and Pattern #4', boundary: [[0, 0], [10.5, 0], [10.5, 8], [0, 8]], latitude: 38.45, longitude: -121.82, northAngleDeg: 0, streetEdge: 2 },
    structures: [],
    zones: [{ id: 'lawn', source: S, kind: 'turf', catalogId: 'artificial-turf', polygon: [[0, 0], [10.5, 0], [10.5, 8], [0, 8]] }, ...zones],
    lines: [],
    water: [],
    plants: [],
    features: [],
  };
}
