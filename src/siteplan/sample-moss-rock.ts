import type { SitePlan, Vec2 } from './types';
import { LIBRARY_ROCKS } from './waterrocks';

/**
 * Moss rock up close: the three moss rock boulder shapes (rounded in the middle, tall at the left, flat-top at the
 * right), medium size, in tan-brown or dark gray stone, set in a black mulch bed with blue fescue and a variegated yucca, as Green Lion sets them in beds.
 */
export function sampleMossRock(shade: 'tan' | 'gray' = 'tan'): SitePlan {
  const g = shade === 'gray' ? '-gray' : '';
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rx = 3, ry = 2.6;
  return {
    schemaVersion: 1,
    site: { name: shade === 'gray' ? 'Dark gray moss rock boulders up close: rounded, tall and flat-top' : 'Moss rock boulders up close: rounded, tall and flat-top', boundary: rect(0, 0, 6, 5), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, 0.85, 5.7, 4.0) },
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, 4.0, 5.7, 4.8) },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.8], [6, 0.8]], height: 1.8 }],
    water: [],
    plants: ([
      { id: 'yucca', catalogId: 'variegated-yucca', position: [rx - 0.15, ry - 0.75] },
      { id: 'fescue-a', catalogId: 'blue-fescue', position: [rx + 0.62, ry - 0.05] },
      { id: 'fescue-b', catalogId: 'blue-fescue', position: [rx + 0.95, ry - 0.45] },
      { id: 'fescue-c', catalogId: 'blue-fescue', position: [rx - 0.75, ry - 0.3] },
    ] as { id: string; catalogId: string; position: Vec2 }[]).map((p) => ({ ...p, source: S })),
    features: [
      { id: 'moss-rock', source: S, catalogId: `moss-rock-rounded${g}`, position: [rx, ry], rotationDeg: 0 },
      { id: 'moss-rock-tall', source: S, catalogId: `moss-rock-tall${g}`, position: [1.35, 2.9], rotationDeg: 15 },
      { id: 'moss-rock-flat', source: S, catalogId: `moss-rock-flat-top${g}`, position: [4.75, 3.0], rotationDeg: -10 },
    ],
  };
}

/**
 * A bed of moss rock as a crew sets it: ten boulders, tan-brown and dark gray, in the three shapes and three sizes,
 * each turned its own way. No two are alike: each rock has its own breaks, tone, roughness, pockets and lichen.
 */
export function sampleMossRockMix(): SitePlan {
  const S = 'sample' as const;
  const IN = 0.0254;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // [shape, gray?, nominal size in (12 head, 22 medium, 30 large), x, y, turn]
  const rocks: ['rounded' | 'tall' | 'flat-top', boolean, number, number, number, number][] = [
    ['tall', false, 22, 1.2, 2.0, 20], ['rounded', true, 30, 2.6, 2.1, -35], ['flat-top', false, 22, 4.1, 1.9, 10], ['tall', true, 22, 5.5, 2.0, 70], ['rounded', false, 30, 6.9, 2.1, 140],
    ['rounded', false, 12, 1.7, 3.3, 60], ['flat-top', true, 22, 3.1, 3.4, -15], ['rounded', false, 22, 4.6, 3.3, 200], ['rounded', true, 12, 5.6, 3.5, 30], ['flat-top', false, 30, 6.8, 3.4, -50],
  ];
  const ratio = { rounded: [1, 0.82, 0.68], tall: [0.75, 0.6, 0.95], 'flat-top': [1.1, 0.8, 0.5] } as const;
  return {
    schemaVersion: 1,
    site: { name: 'Moss rock bed: ten boulders, every one its own', boundary: rect(0, 0, 8, 5.4), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, 0.85, 7.7, 4.3) },
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, 4.3, 7.7, 5.2) },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.8], [8, 0.8]], height: 1.8 }],
    water: [],
    plants: ([
      { id: 'fescue-a', catalogId: 'blue-fescue', position: [2.0, 2.7] },
      { id: 'fescue-b', catalogId: 'blue-fescue', position: [5.0, 2.6] },
      { id: 'yucca', catalogId: 'variegated-yucca', position: [3.4, 1.35] },
    ] as { id: string; catalogId: string; position: Vec2 }[]).map((p) => ({ ...p, source: S })),
    features: rocks.map(([shape, gray, n, x, y, turn], k) => {
      const [l, d, h] = ratio[shape];
      return {
        id: `mix-rock-${k}`,
        source: S,
        catalogId: `moss-rock-${shape}${gray ? '-gray' : ''}`,
        position: [x, y] as Vec2,
        rotationDeg: turn,
        size: [Math.round(n * l) * IN, Math.round(n * d) * IN, Math.round(n * h) * IN] as [number, number, number],
      };
    }),
  };
}

/**
 * The rock library laid out: the 20 tan-brown (T01 to T20) or the 20 dark gray (G01 to G20) moss rocks at their
 * standard sizes, in four rows of five from the fence (01 to 05 in the back row, left to right), on black mulch.
 */
export function sampleRockLibrary(shade: 'tan' | 'gray'): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rocks = LIBRARY_ROCKS.filter((r) => r.shade === shade);
  const W = 11.5, D = 9.4;
  return {
    schemaVersion: 1,
    site: { name: `Rock library, ${shade === 'tan' ? 'tan-brown' : 'dark gray'} moss rock: 20 rocks`, boundary: rect(0, 0, W, D), latitude: 37.64, longitude: -120.99, northAngleDeg: 90 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, 0.85, W - 0.3, D - 1.0) },
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, D - 1.0, W - 0.3, D - 0.2) },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, 0.8], [W, 0.8]], height: 1.8 }],
    water: [],
    plants: [],
    features: rocks.map((r, k) => ({ id: `library-${r.code}`, source: S, catalogId: r.id, position: [1.45 + (k % 5) * 2.15, 2.0 + Math.floor(k / 5) * 1.75] as Vec2, rotationDeg: 0 })),
  };
}
