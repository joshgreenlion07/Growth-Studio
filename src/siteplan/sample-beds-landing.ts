import type { FeaturePlacement, SitePlan, Vec2 } from './types';

/**
 * Raised beds, deck planters and a clad entry landing (siteplan/planterbeds.ts, siteplan/coronado.ts,
 * builder/landing.ts). Behind the house: three Vego Garden Modern Pro 32 in beds, 27 x 83 in (Urban Charcoal, Midnight
 * Blue and Umber Brown, one of each), on 3/8 in Lodi crushed stone with Dimensions 24 x 24 slabs between and in front
 * of them; a Trex deck 8 in up against the house with a built cedar planter along each side (8 ft and 7 ft); a Basalite
 * Premier Smooth Midnight Terrace patio with a Charcoal border. In front: a 6 ft 6 in x 5 ft entry landing, 14 in up,
 * in Premier Smooth Midnight Terrace with a Charcoal border, its sides clad in Coronado Honey Ledge Huron under a
 * Coronado Chiseled Stone Sill coping, one clad step down to the walk, a Tru-Scapes A6000 step light in the step's
 * riser. Feet in the layout, meters in the plan.
 */
export function sampleBedsLanding(): SitePlan {
  const S = 'sample' as const;
  const F = 0.3048, IN = 0.0254;
  const ft = (pts: [number, number][]): Vec2[] => pts.map(([x, y]) => [x * F, y * F]);
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => ft([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const P = (x: number, y: number): Vec2 => [x * F, y * F];
  const pav = { catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3' as const, border: { catalogId: 'premier-smooth-border-charcoal', width: 9 * (11.79 / 12) * IN } };
  const clad = { veneer: 'coronado-honey-ledge-huron' };
  // The landing: 14 in above the walk (two 7 in risers), its paving's top 14 in over the walk's.
  const rise = 14 * IN;
  // Three beds side by side, long side along the plan's y, 2 ft apart; 24 in slabs between and a row in front.
  const bedX = [3.6, 7.85, 12.1], bedY = 6.6;
  const beds: FeaturePlacement[] = ['urban-charcoal', 'midnight-blue', 'umber-brown'].map((c, i) => ({ id: `vego-${i}`, source: S, catalogId: `vego-modern-pro-32-27x83-${c}`, position: P(bedX[i], bedY), rotationDeg: 90 }));
  const slab = (id: string, x: number, y: number): FeaturePlacement => ({ id, source: S, catalogId: 'stepping-stone-24', position: P(x, y), rotationDeg: 0, materialId: 'dimensions-slab-24-anthracite' });
  const slabs: FeaturePlacement[] = [];
  for (const [k, x] of [(bedX[0] + bedX[1]) / 2, (bedX[1] + bedX[2]) / 2].entries()) for (const [j, y] of [4.1, 6.6, 9.1].entries()) slabs.push(slab(`slab-${k}-${j}`, x, y));
  for (let k = 0; k < 6; k++) slabs.push(slab(`slab-front-${k}`, 1.9 + k * 2.5, 12.3));
  return {
    schemaVersion: 1,
    site: { name: 'Raised beds, deck planters and a clad entry landing', boundary: rect(0, 0, 48, 74), latitude: 37.64, longitude: -120.99, northAngleDeg: 0, streetEdge: 2 },
    structures: [
      {
        id: 'house', source: S, kind: 'house', polygon: rect(6, 26, 42, 52), height: 2.75, roof: 'hip',
        openings: [
          { kind: 'door', at: P(23, 52), width: 1.0, style: 'entry' },
          { kind: 'door', at: P(26, 26), width: 2.44, style: 'slider' },
          { kind: 'window', at: P(12, 26), width: 1.8 }, { kind: 'window', at: P(36, 26), width: 1.5 },
          { kind: 'window', at: P(12, 52), width: 2.4 }, { kind: 'window', at: P(34, 52), width: 2.4 },
        ],
      },
    ],
    zones: [
      { id: 'back-bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(0, 0, 48, 26) },
      // The beds' rock: Lodi crushed stone 3/8 in.
      { id: 'bed-rock', source: S, kind: 'bed', catalogId: 'crushed-gravel-3-8', polygon: rect(0.6, 0.8, 15.4, 14.2) },
      { id: 'patio', source: S, kind: 'hardscape', ...pav, polygon: ft([[15.4, 5], [44, 5], [44, 26], [36.5, 26], [36.5, 15.5], [15.4, 15.5]]) },
      {
        id: 'deck', source: S, kind: 'hardscape', catalogId: 'trex-enhance-naturals-rocky-harbor', polygon: rect(18.5, 15.5, 34.5, 26), elevation: 8 * IN,
        deck: { pattern: 'straight', frame: true },
      },
      { id: 'front-bed', source: S, kind: 'bed', catalogId: 'brown-mulch', polygon: rect(0, 52, 48, 74) },
      // The entry landing, clad, against the house; and the walk from its step to the street.
      { id: 'landing', source: S, kind: 'hardscape', ...pav, polygon: rect(19.75, 52, 26.25, 57), elevation: rise, clad },
      { id: 'walk', source: S, kind: 'hardscape', ...pav, polygon: rect(20.5, 57, 24.5, 73.5) },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: ft([[0, 0.3], [48, 0.3]]), height: 1.83 },
      // One step down from the landing to the walk, clad as the landing is.
      { id: 'step', source: S, kind: 'steps', catalogId: pav.catalogId, points: ft([[20.5, 57], [24.5, 57]]), height: rise, riser: rise / 2, tread: 12 * IN, clad },
    ],
    water: [],
    plants: [
      // Herbs in the first bed, grasses in the deck planters (plants put in a bed stand on its soil).
      { id: 'herb-0', source: S, catalogId: 'rosemary-pointe-du-raz', position: P(bedX[0], bedY - 2) },
      { id: 'herb-1', source: S, catalogId: 'lavender', position: P(bedX[0], bedY) },
      { id: 'herb-2', source: S, catalogId: 'nepeta-walkers-low', position: P(bedX[0], bedY + 2) },
      ...[17.5, 20.5, 23.5].map((y, k) => ({ id: `grass-l${k}`, source: S, catalogId: 'lomandra', position: P(17.75, y) })),
      ...[18.5, 21.5, 24.5].map((y, k) => ({ id: `grass-r${k}`, source: S, catalogId: 'lomandra', position: P(35.25, y) })),
      ...[16, 30].map((x, k) => ({ id: `shrub-${k}`, source: S, catalogId: 'westringia', position: P(x, 55) })),
    ],
    features: [
      ...beds,
      ...slabs,
      // Deck planters: one along each side of the deck, 16 in wide, from the house wall out.
      { id: 'planter-left', source: S, catalogId: 'deck-planter-cedar-2x12', position: P(17.75, 22), rotationDeg: 90, size: [84 * IN, 16 * IN, 24 * IN] },
      { id: 'planter-right', source: S, catalogId: 'deck-planter-cedar-2x12', position: P(35.25, 21.5), rotationDeg: 90 },
      // The step light, in the step's riser under its sill.
      { id: 'step-light', source: S, catalogId: 'truscapes-ts-a6000', position: P(22.5, 58.05), rotationDeg: 0, fixture: { mountHeight: 6.4 * IN } },
    ],
  };
}
