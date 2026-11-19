import type { SitePlan, Vec2 } from './types';

/**
 * Two Mirador 111 louvered pergolas in Charcoal on paver patios, as on a customer job: the 10 x 20 on a 24 x 16 ft
 * patio and the 10 x 10 on a 14 x 13 ft one, joined by a 4 ft walk, both in Basalite Premier Smooth Midnight Terrace
 * with a Charcoal 6 x 9 soldier border. Each has café string lights (the 100 ft set on the 10 x 20, the 48 ft set on
 * the 10 x 10) plugged into a weatherproof GFCI outlet under an in-use cover on its back right post, and a 4x4 cedar
 * outlet post stands by the walk. The outlets' stub-ups are 1 in Schedule 80 PVC turning at the 12 in trench depth
 * toward 3/4 in Schedule 40 underground runs, as a job's electrical notes call for. A board fence behind, bark beds with fountain grass and lomandra.
 */
export function sampleMirador(): SitePlan {
  const S = 'sample' as const;
  const FT = 0.3048, IN = 0.0254;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const border = { catalogId: 'premier-smooth-border-charcoal', width: 9 * (11.79 / 12) * IN };
  const fenceY = 1.0;
  // The 10 x 20's patio and the 10 x 10's, their backs 5 ft 3 in off the fence (as on the job's plan).
  const bx0 = 1.0, by0 = fenceY + 63 * IN, bx1 = bx0 + 24 * FT, by1 = by0 + 16 * FT;
  const sx0 = bx1 + 7 * FT, sy0 = by0, sx1 = sx0 + 14 * FT, sy1 = sy0 + 13 * FT;
  // Pergolas: their backs 2 ft in from the patio's back edge, centered along it.
  const big: Vec2 = [(bx0 + bx1) / 2, by0 + 2 * FT + (119.7 / 2) * IN];
  const small: Vec2 = [(sx0 + sx1) / 2, sy0 + 2 * FT + (119.7 / 2) * IN];
  const walkY = big[1];
  // The job's electrical notes: 1 in Schedule 80 stub-ups (3/4 in Schedule 40 underground).
  const stubUp = { conduit1in: true, schedule80: true };
  // Where each stub-up's underground tail ends (siteplan/mirador.ts, builder/mirador.ts): the back right posts' outlets
  // face the fence, their conduits 1.62 in off the post face; each run ends just past its elbow's bend (5.75 in sweep),
  // so its trench reaches the stub-up and its conduit slips into the elbow's tail.
  const reach = (5.75 + 0.5) * IN, post20: Vec2 = [big[0] + 114.25 * IN, big[1] - 57.1 * IN], post10: Vec2 = [small[0] + 57.1 * IN, small[1] - 57.1 * IN];
  const off = (2.75 + 1.62) * IN, hub = 0.95 * IN;
  const r20: Vec2 = [post20[0] - hub - reach, post20[1] - off], o20: Vec2 = [post20[0] + hub + reach, post20[1] - off];
  const r10: Vec2 = [post10[0] + hub - reach, post10[1] - off];
  const postAt: Vec2 = [(bx1 + sx0) / 2, walkY + 2 * FT + 0.25];
  const rp: Vec2 = [postAt[0] - hub - reach, postAt[1] + (1.75 + 1.21) * IN], op: Vec2 = [postAt[0] + hub + reach, postAt[1] + (1.75 + 1.21) * IN];
  const W = sx1 + 1.2, H = by1 + 3.5;
  const plants = [
    ...[0.9, 2.3, 3.7, 5.1, 6.5, 7.9].map((x, i) => ({ id: `fg${i}`, catalogId: 'fountain-grass', position: [bx0 + x, fenceY + 0.55 + (i % 2) * 0.25] as Vec2 })),
    ...[0.8, 2.1, 3.4].map((x, i) => ({ id: `lo${i}`, catalogId: 'lomandra', position: [sx0 + x, fenceY + 0.6 + (i % 2) * 0.2] as Vec2 })),
  ];
  return {
    schemaVersion: 1,
    site: { name: 'Mirador louvered pergolas, 10 x 20 and 10 x 10, with café lights', boundary: rect(0, 0, W, H), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'fir-bark', polygon: rect(0, fenceY + 0.05, W, H) },
      { id: 'patio-20', source: S, kind: 'hardscape', catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3', polygon: rect(bx0, by0, bx1, by1), border, note: 'Basalite Premier Smooth, Midnight Terrace, Charcoal border' },
      { id: 'patio-10', source: S, kind: 'hardscape', catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3', polygon: rect(sx0, sy0, sx1, sy1), border, note: 'Basalite Premier Smooth, Midnight Terrace, Charcoal border' },
      { id: 'walk', source: S, kind: 'hardscape', catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3', polygon: rect(bx1, walkY - 2 * FT, sx0, walkY + 2 * FT), border, note: '4 ft walk between the patios' },
    ],
    lines: [{ id: 'fence', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: [[0, fenceY], [W, fenceY]], height: 1.83 }],
    water: [],
    plants: plants.map((p) => ({ ...p, source: S })),
    // The 120 V run in a 12 in trench, 3/4 in Schedule 40 (centered 12 in down, where the stub-ups' elbows turn), from
    // off the plan to the 10 x 20's outlet, on to the outlet post and to the 10 x 10's. Each end comes in straight along
    // its elbow's tail and slips into it, so stub-up, elbow and run are one line in the Trench stage.
    utilities: {
      lines: [
        [[0.2, by0 + 0.15], [r20[0] - 0.5, by0 + 0.15], [r20[0] - 0.5, r20[1]], r20],
        [o20, [bx1 + 0.08, o20[1]], [bx1 + 0.08, rp[1]], rp],
        [op, [sx0 - 0.25, op[1]], [sx0 - 0.25, by0 + 0.15], [r10[0] - 0.5, by0 + 0.15], [r10[0] - 0.5, r10[1]], r10],
      ].map((points, i) => ({ id: `conduit-${i}`, source: S, points: points as Vec2[], runs: [{ kind: 'electrical' as const, label: '3/4 in Schedule 40 PVC conduit', od: 1.05 * IN, cover: (12 - 1.05 / 2) * IN, code: 'Trench 12 in deep (job notes)' }] })),
      points: [],
    },
    features: [
      { id: 'pergola-20', source: S, catalogId: 'mirador-111-10x20', position: big, rotationDeg: 0, options: { louversOpen: true, cafeLights: true, outletBR: true, ...stubUp, elbowLeft: true } },
      { id: 'pergola-10', source: S, catalogId: 'mirador-111-10x10', position: small, rotationDeg: 0, options: { louversOpen: true, cafeLights: true, outletBR: true, ...stubUp, singleConduit: true, elbowLeft: true } },
      { id: 'outlet-post', source: S, catalogId: 'outlet-post-4x4-in-use', position: postAt, rotationDeg: 0, options: { ...stubUp, elbowLeft: true } },
      { id: 'dining', source: S, catalogId: 'dining-set', position: [big[0] - 1.5, big[1]], rotationDeg: 0 },
      { id: 'bistro-a', source: S, catalogId: 'bistro-set', position: [big[0] + 1.5, big[1]], rotationDeg: 0 },
      { id: 'bistro-b', source: S, catalogId: 'bistro-set', position: small, rotationDeg: 0 },
    ],
  };
}
