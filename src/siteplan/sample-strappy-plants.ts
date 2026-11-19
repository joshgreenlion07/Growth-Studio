import type { SitePlan, Vec2 } from './types';

/**
 * Strap-leaf and rosette accents in a bark bed along a small dry creek of cobble and boulders, as Green Lion plants
 * them: a variegated Cordyline 'Torbay Dazzler', Agave 'Snow Glow' and 'Blue Flame', Lomandra 'Leading Lime Tight'
 * and 'Miner's Gold', 'Little Bunny' dwarf fountain grass, with blue fescue and sea lavender between them.
 */
export function sampleStrappyPlants(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // A creek winding across the bed: a band about 1 m wide.
  const mid = (t: number): Vec2 => [0.4 + 11.2 * t, 3.4 + 0.7 * Math.sin(Math.PI * 1.6 * t + 0.4)];
  const top: Vec2[] = [], bot: Vec2[] = [];
  for (let k = 0; k <= 32; k++) {
    const t = k / 32, [x, y] = mid(t), w = 0.45 + 0.15 * Math.sin(Math.PI * 3 * t);
    top.push([x, y + w]);
    bot.push([x, y - w]);
  }
  const creek: Vec2[] = [...top, ...bot.reverse()];
  const P = (id: string, catalogId: string, position: Vec2) => ({ id, source: S, catalogId, position });
  return {
    schemaVersion: 1,
    site: { name: 'Strap-leaf accents: cordyline, agaves, lomandras, dwarf fountain grass', boundary: rect(0, 0, 12, 8), latitude: 38.58, longitude: -121.49, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bark', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: rect(0, 0, 12, 8) },
      { id: 'creek', source: S, kind: 'bed', catalogId: 'white-cobble', polygon: creek },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: [[0, 0.4], [12, 0.4]], height: 1.83 },
    ],
    water: [],
    plants: [
      // Behind the creek, against the fence.
      P('cordyline', 'cordyline-torbay-dazzler', [2.0, 1.4]),
      P('lime1', 'lomandra-leading-lime', [3.4, 1.3]),
      P('lime2', 'lomandra-leading-lime', [4.1, 1.8]),
      P('lime3', 'lomandra-leading-lime', [6.6, 1.3]),
      P('gold1', 'lomandra-miners-gold', [5.2, 1.4]),
      P('gold2', 'lomandra-miners-gold', [8.8, 1.5]),
      P('snow1', 'agave-snow-glow', [7.6, 2.2]),
      P('snow2', 'agave-snow-glow', [10.4, 1.6]),
      P('bunny1', 'fountain-grass-little-bunny', [9.6, 2.3]),
      P('fescue1', 'blue-fescue', [5.8, 2.3]),
      P('fescue2', 'blue-fescue', [6.2, 2.0]),
      // In front of the creek.
      P('flame1', 'agave-blue-flame', [3.0, 5.0]),
      P('flame2', 'agave-blue-flame', [8.2, 5.4]),
      P('bunny2', 'fountain-grass-little-bunny', [4.4, 5.3]),
      P('bunny3', 'fountain-grass-little-bunny', [4.9, 5.8]),
      P('statice1', 'statice', [6.0, 4.9]),
      P('statice2', 'statice', [9.6, 5.1]),
      P('gold3', 'lomandra-miners-gold', [10.8, 4.8]),
      P('fescue3', 'blue-fescue', [1.6, 4.8]),
      P('fescue4', 'blue-fescue', [7.0, 5.6]),
      P('lime4', 'lomandra-leading-lime', [1.0, 5.6]),
    ],
    features: [
      { id: 'b1', source: S, catalogId: 'boulder', position: [2.6, 3.0], rotationDeg: 30 },
      { id: 'b2', source: S, catalogId: 'boulder', position: [7.2, 4.4], rotationDeg: 160 },
    ],
  };
}
