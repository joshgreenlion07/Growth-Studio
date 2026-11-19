import type { SitePlan, Vec2 } from './types';

/**
 * A single-story ranch with a hip roof, as built across the Central Valley in the 1990s: a long main hip with the
 * garage wing and a front bay projecting at the front, each with its own lower hip; a recessed entry under a raised
 * crown, with tall sidelights and two concrete steps; a three-sided bay at the back with a faceted hip; a stucco
 * chimney; a covered patio; and a 9 ft step at the back wall beside the water feature, where a sliding glass door is
 * put by itself. Greige stucco, cream trim, white vinyl windows, flat concrete tile in a gray-brown blend. A sample to
 * show the house options, not a real job.
 */
export function sampleRanch(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // Plan y runs toward the street (y = 42): the back yard is at the top.
  const house: Vec2[] = [
    [5, 24], [9.5, 24], [10.5, 22.6], [12.5, 22.6], [13.5, 24], [25, 24], [25, 36], [18.5, 36], [18.5, 34],
    [15.6, 34], [15.6, 32.8], [13.0, 32.8], [13.0, 34], [11, 34], [11, 35.2], [6, 35.2], [6, 34], [5, 34],
  ];
  return {
    schemaVersion: 1,
    site: { name: 'Single-story ranch with hip roof', boundary: rect(0, 0, 30, 42), latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [
      {
        id: 'house', source: S, kind: 'house', polygon: house, height: 2.75, roof: 'hip', pitch: 5, eave: 0.55, crown: true, chimney: true,
        look: { wall: 'greige', trim: 'cream', window: 'white', roof: 'concrete-flat', roofColor: 'gray-brown', door: 'black', garage: 'white', garageStyle: 'raised' },
        // The entry and the garage door are marked; the windows and the sliding door at the back step come by themselves.
        openings: [
          { kind: 'door', at: [14.3, 32.8], width: 1.9, style: 'entry' },
          { kind: 'door', at: [21.75, 36], width: 4.88, style: 'garage', height: 2.13 },
        ],
      },
      { id: 'patio-cover', source: S, kind: 'cover', polygon: rect(18, 19, 24.5, 24), height: 2.7, roof: 'flat' },
    ],
    zones: [
      { id: 'back-lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, 0.3, 29.7, 24) },
      { id: 'pool-deck', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[5, 4], [23, 4], [23, 15], [25, 15], [25, 24], [5, 24]] },
      { id: 'front-lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: rect(0.3, 34, 29.7, 41.7) },
      { id: 'drive', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: rect(18.5, 36, 25, 42) },
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: [[13.5, 34.36], [15.1, 34.36], [15.1, 37.4], [18.5, 37.4], [18.5, 38.6], [13.5, 38.6]] },
      { id: 'front-bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[5, 34], [6, 34], [6, 35.2], [11, 35.2], [11, 34], [13.0, 34], [13.0, 36.6], [5, 36.6]] },
      { id: 'side-bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(15.8, 34, 18.5, 37.1) },
      { id: 'back-bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, 0.3, 29.7, 2.2) },
    ],
    lines: [
      // The 9 ft step at the back wall: its top edge along the wall, two 6 in risers (the house floor is its top).
      { id: 'back-step', source: S, kind: 'steps', catalogId: 'concrete-broom', points: [[14.2, 24], [16.94, 24]], height: 0.3, riser: 0.15, tread: 0.36 },
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: [[0, 30], [0, 0], [30, 0], [30, 30]], height: 1.83 },
    ],
    water: [
      { id: 'pool', source: S, kind: 'pool', polygon: [[8, 6.5], [20, 6.5], [20, 12.5], [8, 12.5]], depth: 1.5, coping: 0.3 },
    ],
    plants: [
      ...[3, 7, 11, 15, 19, 23, 27].map((x, i) => ({ id: `screen${i}`, source: S, catalogId: 'italian-cypress', position: [x, 1.2] as Vec2 })),
      { id: 'olive', source: S, catalogId: 'olive-tree', position: [27, 9] },
      { id: 'myrtle', source: S, catalogId: 'crape-myrtle', position: [3, 39] },
      ...[5.8, 7.4, 9.0, 10.6, 12.2].map((x, i) => ({ id: `pitt${i}`, source: S, catalogId: 'dwarf-pittosporum', position: [x, 35.9] as Vec2 })),
      ...[16.4, 17.7].map((x, i) => ({ id: `lom${i}`, source: S, catalogId: 'lomandra', position: [x, 35.2] as Vec2 })),
      ...[[16.4, 36.5], [17.7, 36.5]].map((p, i) => ({ id: `lav${i}`, source: S, catalogId: 'lavender', position: p as Vec2 })),
    ],
    features: [
      { id: 'water-feature', source: S, catalogId: 'three-pillar-water-feature', position: [11.2, 18.6], rotationDeg: 180 },
      { id: 'lounge', source: S, catalogId: 'lounge-set', position: [21.2, 21.4], rotationDeg: 0 },
    ],
  };
}
