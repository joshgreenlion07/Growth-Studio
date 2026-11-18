import type { SitePlan, Vec2 } from './types';

/**
 * A raised composite deck laid the way Green Lion builds them: an 11 x 21 ft deck 8 in above the pavers in Trex Enhance
 * Naturals Rocky Harbor, a one-board picture frame, the field in a chevron whose seam runs across the deck beside the
 * spa, a hot tub set into the deck at one end and a cube sauna standing on it at the other, gray pavers with a charcoal
 * border all round and a fence behind. No house and no street, the way Area Planner plans arrive.
 */
export function sampleCompositeDeck(): SitePlan {
  const S = 'sample' as const;
  const ft = 0.3048;
  const x0 = 3, y0 = 2.4, x1 = x0 + 21 * ft, y1 = y0 + 11 * ft;
  const spa: Vec2 = [x0 + 0.04 + 1.15, y0 + 0.04 + 1.15];
  const deck: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // The seam runs across the deck just past the spa's frame.
  const seamX = spa[0] + 1.15 + 0.16;
  return {
    schemaVersion: 1,
    site: { name: 'Composite deck: Trex Rocky Harbor chevron with a picture frame, spa set in', boundary: [[0, 0], [16, 0], [16, 10], [0, 10]], latitude: 37.74, longitude: -121.43, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: [[0, 0], [16, 0], [16, 10], [0, 10]] },
      { id: 'pavers', source: S, kind: 'hardscape', catalogId: 'catalina-grana-scandina-gray', polygon: [[x0 - 1.8, y0 - 0.2], [x1 + 1.8, y0 - 0.2], [x1 + 1.8, y1 + 1.6], [x0 - 1.8, y1 + 1.6]], border: { catalogId: 'catalina-grana-border-anthracite', width: 0.2286 } },
      {
        id: 'deck', source: S, kind: 'hardscape', catalogId: 'trex-enhance-naturals-rocky-harbor', polygon: deck, elevation: 8 * 0.0254,
        deck: { pattern: 'chevron', frame: true, angleDeg: 90, seamOffset: seamX - (x0 + x1) / 2 },
        note: 'Trex Enhance Naturals, Rocky Harbor: 5 1/2 in boards, picture frame, chevron field, 8 in high on the pavers',
      },
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: [[0.4, 0.5], [15.6, 0.5], [15.6, 1.6], [0.4, 1.6]] },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: [[0.2, 0.3], [15.8, 0.3]], height: 1.83, topper: 'lattice' }],
    water: [],
    plants: [3, 6, 9, 12].map((x, i) => ({ id: `p${i}`, source: S, catalogId: 'italian-cypress', position: [x, 1.05] as Vec2 })),
    features: [
      { id: 'spa', source: S, catalogId: 'hot-tub', position: spa, rotationDeg: 0 },
      { id: 'sauna', source: S, catalogId: 'sauna-cube', position: [x1 - 1.35, y0 + 1.25], rotationDeg: 0 },
    ],
  };
}
