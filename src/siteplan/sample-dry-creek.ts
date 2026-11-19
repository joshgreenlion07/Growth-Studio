import { DOUBLE_HEAD_SIZES, GARDEN_BOULDER_SIZES, SHOWPIECE_SIZES } from './groundrock';
import type { FeaturePlacement, PlantPlacement, SitePlan, Vec2 } from './types';

/**
 * A dry creek bed in a bark front yard, as a customer job was built (generic layout): a 35 ft creek of Noiya cobble mixed
 * 3 to 1 (2 x 4 and 4 x 8 in), 4 to 7 ft wide, edged both sides with double-head moss rock and a few flat moss rocks in
 * its bed; SiteOne small decorative bark over the rest; a showpiece boulder group at the entry walk; garden boulders in
 * the bark; and steel-edged beds of the other rock side by side along the front: Noiyo pebble 1 1/2 in, Salt & Pepper
 * 1 1/2 in, and Noiya cobble 2 x 4 and 4 x 8 in.
 */
export function sampleDryCreek(): SitePlan {
  const S = 'sample' as const;
  const FT = 0.3048;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const W = 15, D = 11.5;
  // The creek: a gentle S down the yard, 35 ft along its middle, 4 to 7 ft wide (widest at the bends).
  const mid: Vec2[] = [], half: number[] = [];
  const N = 28;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    mid.push([2.2 + 10.4 * t, 2.6 + 3.2 * t + 0.85 * Math.sin(t * Math.PI * 2.1)]);
    half.push(((5 + 1.6 * Math.sin(t * Math.PI * 2.3 + 0.6) + 0.6 * Math.sin(t * 9.1)) * FT) / 2 * Math.min(1, 0.55 + t * 4, 0.55 + (1 - t) * 4));
  }
  const left: Vec2[] = [], right: Vec2[] = [];
  mid.forEach((p, k) => {
    const a = mid[Math.max(0, k - 1)], b = mid[Math.min(N, k + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L;
    left.push([p[0] + nx * half[k], p[1] + ny * half[k]]);
    right.push([p[0] - nx * half[k], p[1] - ny * half[k]]);
  });
  const creek: Vec2[] = [...left, ...right.reverse()];
  // The rock beds along the front, 6 x 5 ft each, and the walk in front of them.
  const by = 8.2, bw = 6 * FT, bd = 5 * FT, gap = 0.5;
  const beds = [
    { id: 'noiyo-pebble-1-1-2', note: 'Noiyo pebble, 1 1/2 in (GreenWaste)' },
    { id: 'salt-and-pepper-1-1-2', note: 'Salt & Pepper pebble, 1 1/2 in (California Landscape Supply)' },
    { id: 'noiya-cobble-2-4', note: 'Noiya cobble, 2 x 4 in (California Landscape Supply)' },
    { id: 'noiya-cobble-4-8', note: 'Noiya cobble, 4 x 8 in (California Landscape Supply)' },
  ].map((b, i) => ({ ...b, poly: rect(1.2 + i * (bw + gap), by, 1.2 + i * (bw + gap) + bw, by + bd) }));
  const walkY = by + bd + 0.35;
  const boulder = (id: string, catalogId: string, at: Vec2, rot: number, size: [number, number, number]): FeaturePlacement => ({ id, source: S, catalogId, position: at, rotationDeg: rot, size });
  const plants: PlantPlacement[] = [
    ...[[3.0, 1.2], [6.6, 2.0], [10.8, 3.6], [12.4, 7.6], [4.6, 6.4], [8.0, 6.8]].map((p, i) => ({ id: `fescue${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
    ...[[5.2, 2.0], [9.4, 3.0], [2.4, 5.6]].map((p, i) => ({ id: `agave${i}`, source: S, catalogId: 'blue-agave', position: p as Vec2 })),
    ...[[7.6, 1.4], [11.6, 5.8], [3.6, 7.0]].map((p, i) => ({ id: `lomandra${i}`, source: S, catalogId: 'lomandra', position: p as Vec2 })),
    ...[[8.8, 5.6], [6.2, 3.4]].map((p, i) => ({ id: `verbena${i}`, source: S, catalogId: 'verbena-tapien-blue', position: p as Vec2 })),
  ];
  return {
    schemaVersion: 1,
    site: { name: 'Dry creek bed: Noiya cobble, moss rock border, boulders, pebble and bark', boundary: rect(0, 0, W, D), latitude: 37.64, longitude: -120.99, northAngleDeg: 45, streetEdge: 2 },
    structures: [],
    zones: [
      { id: 'bark', source: S, kind: 'bed', catalogId: 'siteone-small-decorative-bark', polygon: rect(0, 0, W, walkY), note: 'Small decorative bark (SiteOne)' },
      { id: 'creek', source: S, kind: 'bed', catalogId: 'noiya-cobble-dry-creek-mix', polygon: creek, note: 'Dry creek: Noiya cobble, 75% 2 x 4 and 25% 4 x 8 in' },
      ...beds.map((b) => ({ id: `bed-${b.id}`, source: S, kind: 'bed' as const, catalogId: b.id, polygon: b.poly, note: b.note })),
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: rect(0.4, walkY, W - 0.4, walkY + 1.4) },
      { id: 'entry', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: rect(W - 1.9, 0.4, W - 0.6, walkY) },
    ],
    lines: [
      // Double-head moss rock along both banks (one closed run round the creek).
      { id: 'creek-border', source: S, kind: 'edging', catalogId: 'moss-rock-border-double-head', points: [...creek, creek[0]], height: 0.1 },
      ...beds.map((b) => ({ id: `edge-${b.id}`, source: S, kind: 'edging' as const, catalogId: 'steel-edging-black-3-16', points: [...b.poly, b.poly[0]], height: 0.05 })),
    ],
    water: [],
    plants,
    features: [
      // The showpiece group at the entry: a 1,000 lb stone on end with garden boulders at its foot.
      boulder('show', 'moss-rock-showpiece-boulder', [W - 3.0, 2.2], 20, SHOWPIECE_SIZES[1].size),
      boulder('show-b1', 'moss-rock-garden-boulder', [W - 2.55, 2.75], 140, GARDEN_BOULDER_SIZES[3].size),
      boulder('show-b2', 'moss-rock-garden-boulder', [W - 3.55, 2.6], 70, GARDEN_BOULDER_SIZES[2].size),
      // Garden boulders in the bark.
      boulder('gb1', 'moss-rock-garden-boulder', [1.6, 3.6], 30, GARDEN_BOULDER_SIZES[1].size),
      boulder('gb2', 'moss-rock-garden-boulder', [7.4, 7.3], 200, GARDEN_BOULDER_SIZES[0].size),
      boulder('gb3', 'moss-rock-garden-boulder', [12.6, 4.6], 110, GARDEN_BOULDER_SIZES[2].size),
      // Flat moss rocks set in the creek bed.
      boulder('cr1', 'moss-rock-double-head', [5.0, 4.0], 60, DOUBLE_HEAD_SIZES[4].size),
      boulder('cr2', 'moss-rock-double-head', [8.6, 4.5], 10, DOUBLE_HEAD_SIZES[3].size),
      boulder('cr3', 'moss-rock-double-head', [10.9, 5.5], 150, DOUBLE_HEAD_SIZES[4].size),
    ],
  };
}
