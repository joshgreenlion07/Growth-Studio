import type { SitePlan, Vec2 } from './types';

/**
 * Front-yard soft plants: a red-brown bark bed along a fence with a cobble dry creek through it. Along the back, box
 * honeysuckle 'Baggesen's Gold' with natural boxwood between; at the creek, dwarf pittosporum 'Creme de Mint',
 * stonecrop 'Lemon Ball', verbena 'Tapien Purple', white trailing lantana and sea lavender.
 */
export function sampleSoftPlants(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // The creek: a gentle S across the bed, about 0.9 m wide.
  const mid: Vec2[] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    mid.push([0.6 + 10.8 * t, 3.3 + 0.55 * Math.sin(t * Math.PI * 1.6)]);
  }
  const creek: Vec2[] = [...mid.map(([x, y]) => [x, y - 0.45] as Vec2), ...mid.slice().reverse().map(([x, y]) => [x, y + 0.45] as Vec2)];
  const plant = (id: string, catalogId: string, p: Vec2) => ({ id, source: S, catalogId, position: p });
  return {
    schemaVersion: 1,
    site: { name: 'Front-yard soft plants: verbena, lantana, sedum, pittosporum, box honeysuckle', boundary: rect(0, 0, 12, 7.5), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0, 0, 12, 7.5) },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(0.3, 0.6, 11.7, 5.6) },
      { id: 'creek', source: S, kind: 'bed', catalogId: 'white-cobble', polygon: creek },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.5], [12, 0.5]], height: 1.83 },
    ],
    water: [],
    plants: [
      plant('lon1', 'lonicera-baggesens-gold', [1.6, 1.5]),
      plant('box1', 'boxwood', [3.3, 1.35]),
      plant('box2', 'boxwood', [4.7, 1.35]),
      plant('box3', 'boxwood', [6.1, 1.35]),
      plant('lon2', 'lonicera-baggesens-gold', [7.9, 1.5]),
      plant('box4', 'boxwood', [9.6, 1.35]),
      plant('cdm1', 'pittosporum-creme-de-mint', [5.0, 4.6]),
      plant('cdm2', 'pittosporum-creme-de-mint', [9.2, 2.2]),
      plant('sed1', 'sedum-lemon-ball', [2.2, 4.7]),
      plant('ver1', 'verbena-tapien-purple', [3.6, 2.6]),
      plant('ver2', 'verbena-tapien-purple', [6.6, 4.3]),
      plant('lan1', 'lantana-spreading-white', [1.4, 2.7]),
      plant('lan2', 'lantana-spreading-white', [10.6, 4.6]),
      plant('lim1', 'statice', [7.4, 2.6]),
      plant('lim2', 'statice', [3.8, 4.9]),
    ],
    features: [
      { id: 'rock1', source: S, catalogId: 'moss-rock-rounded', position: [4.4, 3.1], rotationDeg: 30 },
      { id: 'rock2', source: S, catalogId: 'moss-rock-tall', position: [8.4, 3.9], rotationDeg: 120 },
    ],
  };
}
