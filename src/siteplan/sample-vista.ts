import type { FeaturePlacement, SitePlan, Vec2 } from './types';

/**
 * A front walk lit with Vista Professional fixtures (siteplan/vista.ts): a short Basalite Premier Smooth walk in
 * Midnight Terrace with its Charcoal border, lined both sides with BR-2500 bollards, up to a raised entry landing with
 * a Tru-Scapes TS-A6000 bronze hardscape light under its front edge as the step light; two GR-5006 up lights, one on
 * a red Japanese maple and one grazing a garden wall; the TCS-300 WiFi transformer on the house wall, its bottom 18 in
 * up. Best seen at night, about an hour after sunset. Feet in the layout, meters in the plan.
 */
export function sampleVista(): SitePlan {
  const S = 'sample' as const;
  const F = 0.3048;
  const ft = (pts: [number, number][]): Vec2[] => pts.map(([x, y]) => [x * F, y * F]);
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => ft([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const P = (x: number, y: number): Vec2 => [x * F, y * F];
  const pav = { catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3' as const, border: { catalogId: 'premier-smooth-border-charcoal', width: 0.23 } };
  const fx = (id: string, catalogId: string, position: Vec2, rotationDeg: number, fixture?: FeaturePlacement['fixture']): FeaturePlacement => ({
    id, source: S, catalogId, position, rotationDeg, ...(fixture ? { fixture } : {}),
  });
  // Rotation turns a fixture's front (an up light's aim): 0 faces +y (toward the house), 180 faces -y.
  const bollards = [5, 10, 15].flatMap((y, i) => [
    fx(`bollard-l${i}`, 'vista-br-2500', P(12.75, y), 0),
    fx(`bollard-r${i}`, 'vista-br-2500', P(17.25, y), 0),
  ]);
  return {
    schemaVersion: 1,
    site: { name: 'Night lighting: Vista bollards, up lights and WiFi transformer', boundary: rect(0, 0, 32, 34), latitude: 37.95, longitude: -121.29, northAngleDeg: 0 },
    structures: [{ id: 'house', source: S, kind: 'house', polygon: rect(2, 22, 30, 34), height: 2.75, roof: 'hip' }],
    zones: [
      { id: 'bed-left', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: ft([[0, 0], [13.5, 0], [13.5, 19], [12.5, 19], [12.5, 22], [0, 22]]) },
      { id: 'bed-right', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: ft([[16.5, 0], [32, 0], [32, 22], [17.5, 22], [17.5, 19], [16.5, 19]]) },
      { id: 'walk', source: S, kind: 'hardscape', ...pav, polygon: rect(13.5, 0, 16.5, 19) },
      // The entry landing, 7 in up (one step), its front edge the step the hardscape light sits under.
      { id: 'landing', source: S, kind: 'hardscape', ...pav, polygon: rect(12.5, 19, 17.5, 22), elevation: 7 * 0.0254 },
    ],
    lines: [
      // A 30 in garden wall for the second up light to graze.
      { id: 'garden-wall', source: S, kind: 'wall', catalogId: 'melville-wall-scandina-gray', points: ft([[21, 12], [29, 12]]), height: 30 * 0.0254 },
    ],
    water: [],
    plants: [
      { id: 'maple', source: S, catalogId: 'japanese-maple-red', position: P(6, 13) },
      ...[7.5, 12.5].flatMap((y, i) => [
        { id: `fescue-l${i}`, source: S, catalogId: 'blue-fescue', position: P(11.6, y) },
        { id: `fescue-r${i}`, source: S, catalogId: 'blue-fescue', position: P(18.4, y) },
      ]),
      { id: 'lomandra-l', source: S, catalogId: 'lomandra', position: P(10.8, 17.5) },
      { id: 'lomandra-r', source: S, catalogId: 'lomandra', position: P(19.2, 17.5) },
    ],
    features: [
      ...bollards,
      // Up lights: one in front of the maple's canopy aimed into it, one 8 to 9 in off the wall's face grazing it.
      fx('up-maple', 'vista-gr-5006', P(6, 9.4), 0, { tiltDeg: 14 }),
      fx('up-wall', 'vista-gr-5006', P(25, 12 - 14 / 12), 0, { tiltDeg: 22 }),
      // The step light: Tru-Scapes TS-A6000 in bronze, 2700 K, placed as Area Planner places it (no mount height): it
      // moves onto the landing's front face, faces out and slides under its 60 mm front course.
      fx('step-light', 'truscapes-ts-a6000', P(15, 18.6), 0, { finish: 'bronze' }),
      // The TCS-300 on the house wall past the window right of the entry (its bottom at Vista's 18 in minimum by default).
      fx('transformer', 'vista-tcs-300', P(27, 22 - 0.01), 180),
    ],
  };
}
