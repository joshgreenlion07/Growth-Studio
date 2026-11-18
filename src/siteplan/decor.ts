import type { FeatureSpec } from './catalog';

/*
 * Decor and furniture from a finished Green Lion backyard, drawn to its job photos: tall rectangular corten planters
 * set against the house (planted, over gray pebble mulch), a corten "tree of life" screen on the back fence, a
 * rectangular charcoal concrete gas fire pit, a white aluminum lounge set with wood-look side panels, and a gray resin
 * deck box. Sizes were measured from the photos against known sizes in them (paver joints, the sofas, the fence) and
 * the plan's notes; each is a custom or store-bought piece, not a maker's line, so none carries a maker. Built by
 * `builder/decor/`.
 */

export type DecorKind = 'cortenPlanterTall' | 'cortenTreePanel' | 'firePitLinear' | 'loungeSofa' | 'loungeOttoman' | 'deckBox' | 'diningSling' | 'patioHeater' | 'ceilingFan';
/** Decor hung from a cover's ceiling: placed in plan like any feature, but it does not stand on the ground. */
export const CEILING_KINDS: readonly DecorKind[] = ['patioHeater', 'ceilingFan'];

/** A size a placed feature can be set to: length (x), depth (z) and height, meters. */
export interface FeatureSize {
  label: string;
  size: [number, number, number];
}

const IN = 0.0254;
const S = (l: number, d: number, h: number, label = `${l} x ${d} x ${h} in`): FeatureSize => ({ label, size: [l * IN, d * IN, h * IN] });

/** The tall corten planter's sizes (L x D x H, inches). 36 x 16 x 24 is the one along the house in the job photos. */
export const PLANTER_SIZES: FeatureSize[] = [S(24, 12, 24), S(30, 14, 24), S(36, 16, 24), S(48, 16, 24), S(36, 16, 30), S(48, 18, 30)];
/** Fire pit sizes (L x W x H, inches): 60 x 30 is the job's, measured from its photo against the lounge set. */
export const FIRE_PIT_SIZES: FeatureSize[] = [S(48, 24, 12.5), S(60, 20, 12.5), S(60, 30, 12.5), S(72, 30, 12.5)];
/** The tree of life screen, 7 ft square as built (three sheets on a steel frame), or 6 ft. */
export const TREE_PANEL_SIZES: FeatureSize[] = [S(72, 3, 72, '6 x 6 ft'), S(84, 3, 84, '7 x 7 ft')];

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const DECOR_FEATURES: FeatureSpec[] = [
  F({ id: 'corten-planter-tall', name: 'Corten planter, tall rectangle', group: 'Accents', kind: 'cortenPlanterTall', footprint: [36 * IN, 16 * IN], sizes: PLANTER_SIZES, size: 2, plantable: true,
    about: 'A tall rectangular planter of weathering (corten) steel plate with a folded top lip, set against the house. Planted as on the job: red yucca, blue fescue, red primroses, an echeveria and blue sedum over gray pebble mulch.',
    facts: ['Standard 36 x 16 x 24 in; also 24 x 12, 30 x 14, 48 x 16 (24 in tall), 36 x 16 and 48 x 18 (30 in tall)', '1/4 in weathering steel plate, 7/8 in folded lip', 'Soil 1 3/4 in below the rim under 1-2 1/2 in gray river pebbles', 'Its plants are counted with the plan\'s plants'] }),
  F({ id: 'corten-screen-tree-of-life', name: 'Corten screen, tree of life', group: 'Accents', kind: 'cortenTreePanel', footprint: [84 * IN, 3 * IN], sizes: TREE_PANEL_SIZES, size: 1,
    about: 'A laser-cut weathering steel screen: a tree with its branches and roots inside a circle, on three sheets bolted to a steel frame, set in front of the fence.',
    facts: ['7 x 7 ft as built (also 6 x 6 ft), 2 in off the ground', 'Three sheets on 2 in steel posts with rails at the thirds'] }),
  F({ id: 'fire-pit-concrete-linear', name: 'Fire pit, rectangular charcoal concrete', group: 'Fire', kind: 'firePitLinear', footprint: [60 * IN, 30 * IN], sizes: FIRE_PIT_SIZES, size: 2,
    about: 'A low rectangular gas fire pit in charcoal concrete on a recessed plinth, with a linear burner under reflective fire glass.',
    facts: ['60 x 30 x 12 1/2 in as built (measured from its photo); also 48 x 24, 60 x 20, 72 x 30', 'Burner pan about 39 x 12 1/2 in, 1 3/4 in deep', 'Plan note: custom 5 ft fire pit, 300,000 BTU'] }),
  F({ id: 'lounge-sofa-white-aluminum', name: 'Lounge sofa, white aluminum and wood-look panels', group: 'Furniture', kind: 'loungeSofa', footprint: [92 * IN, 32 * IN],
    about: 'A three-seat deep seating sofa on a white powder-coated aluminum sled frame, light wood-look panels in the arms and back, light gray cushions and two yellow accent pillows.' }),
  F({ id: 'lounge-ottoman-white-aluminum', name: 'Lounge ottoman, white aluminum', group: 'Furniture', kind: 'loungeOttoman', footprint: [36 * IN, 28 * IN],
    about: 'The lounge set\'s ottoman: a white aluminum frame with a light gray cushion.' }),
  F({ id: 'deck-box-gray-resin', name: 'Deck box, gray resin wicker', group: 'Furniture', kind: 'deckBox', footprint: [48 * IN, 22 * IN],
    about: 'A lidded resin storage box in taupe gray, resin wicker panels in a smooth frame, about 48 x 22 x 28 in.' }),
  F({ id: 'dining-set-sling-8', name: 'Dining set, white table and 8 gray sling chairs', group: 'Furniture', kind: 'diningSling', footprint: [3.3, 2.1],
    about: 'An 84 x 40 in white aluminum dining table with eight stacking sling chairs: dark gray aluminum frames, gray textilene slings.' }),
  F({ id: 'infratech-heater-39', name: 'Infratech patio heater, 39 in, ceiling mounted', group: 'Shade', kind: 'patioHeater', footprint: [39 * IN, 6 * IN], maker: 'Infratech',
    about: 'An Infratech electric infrared patio heater hung under the patio roof, as on the plan\'s spec sheet.',
    facts: ['39 in long, 8.19 in high, 6 in deep, 14 lb', '4000 W, 240 V, 16.67 A, medium wave infrared; heats about 80 sq ft', 'Stainless steel; mounted 96 to 120 in above the floor', 'Hung from the roof of the cover it is under (9 ft without one)'] }),
  F({ id: 'ceiling-fan-8-blade', name: 'Ceiling fan, 8 blade, 60 in', group: 'Shade', kind: 'ceilingFan', footprint: [60 * IN, 60 * IN],
    about: 'An eight-blade outdoor ceiling fan in oil-rubbed bronze with a light kit, on a short downrod under the patio roof.' }),
];

/** The size a placed feature draws at: its own, else the catalog's default size, else its footprint and `h`. */
export function featureSize(spec: FeatureSpec, own: [number, number, number] | undefined, h: number): [number, number, number] {
  if (own) return own;
  const def = spec.sizes?.[spec.size ?? 0]?.size;
  return def ?? [spec.footprint[0], spec.footprint[1], h];
}
