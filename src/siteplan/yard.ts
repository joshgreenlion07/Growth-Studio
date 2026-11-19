import type { FeatureKind, FeatureSpec } from './catalog';
import { featureSize, type FeatureSize } from './decor';
import { vegoBedSoil } from './planterbeds';

/*
 * Side-yard pieces from a client job's plan set and its product sheets: a Suncast resin storage shed, a 5 ft wooden
 * garden bench, a free-standing custom cedar raised bed, a tall brown pot with a metal trellis and a star jasmine
 * trained up it, a cedar slat screen for an A/C unit, and a 24 in glazed urn bubbling over into a pebble circle. The
 * shed is a maker's product drawn to its published size; the others are custom or store-bought pieces drawn from the
 * sheets' photos and the plan's dimensions, so they carry no maker. Built by `builder/yard/` (the urn by
 * `builder/urnfountain.ts`, the jasmine by its species file).
 */

export type YardKind = 'shedResin' | 'gardenBench' | 'raisedBedCedar' | 'potTrellis' | 'slatScreen' | 'vegoModernBed';

/** The class each switches within (catalog SWAP_CLASS). */
export const YARD_SWAP: Record<YardKind, string> = {
  shedResin: 'Sheds', gardenBench: 'Seating', raisedBedCedar: 'Raised beds', potTrellis: 'Planters', slatScreen: 'Screens and trellises', vegoModernBed: 'Raised beds',
};

const IN = 0.0254;
const S = (l: number, d: number, h: number, label: string): FeatureSize => ({ label, size: [l * IN, d * IN, h * IN] });

/* ------------------------------------------------------------------ */
/* Sizes and parts the builders and the plants share                    */
/* ------------------------------------------------------------------ */

/** Suncast Modern 7 x 4 ft shed BMS7481 (Suncast's spec): exterior, door opening, inches. */
export const SUNCAST_BMS7481 = { w: 85.5, d: 49.25, h: 78.5, doorW: 61, doorH: 72.75 };

/** Garden bench sizes (L x D x H, in): 5 ft as on the plan, and the 4 ft of the same bench. */
export const BENCH_SIZES: FeatureSize[] = [S(60, 24, 35, '5 ft (60 x 24 x 35 in), seat 18 in'), S(48, 24, 35, '4 ft (48 x 24 x 35 in), seat 18 in')];

/** Cedar raised bed sizes (L x W x H, in): 6 x 3 ft as on the product sheet, and the 8 x 4 ft the plan's box draws. */
export const RAISED_BED_SIZES: FeatureSize[] = [S(72, 36, 18, '6 x 3 ft, 18 in tall'), S(96, 48, 18, '8 x 4 ft, 18 in tall')];
/** The bed's boards (2x, 1 1/2 in) and its soil, 2 in under the top of the cap. */
export const RAISED_BED = { board: 1.5, soilDrop: 2 };

/** A/C screen sizes (L x D x H, in): 5 1/2 ft is the plan's run along the A/C pad. */
export const SLAT_SCREEN_SIZES: FeatureSize[] = [S(48, 3.5, 48, '4 ft long, 4 ft tall'), S(66, 3.5, 48, '5 1/2 ft long, 4 ft tall'), S(72, 3.5, 48, '6 ft long, 4 ft tall')];

/** The tall tapered pot (in): height, top and base square, wall, and the soil under the rim. */
export const TALL_POT = { h: 24, top: 15, base: 10.5, wall: 0.6, soilDrop: 1.5 };

/**
 * The metal pot trellis (meters, in the vine's frame: x across, y up from the soil, z toward the front, the trellis's
 * plane `z` just behind the crown): a 48 in piece, stake included, of 3/8 x 1/8 in flat bar. Two nested rectangular
 * frames, the rear one taller and narrower, and between the rear frame's uprights two arcs that cross and cross again
 * into a chain of pointed ovals. Sizes read from the pot sheet's photo against the pot's 15 in top.
 */
export const POT_TRELLIS = {
  z: -0.035,
  bar: 0.375 * IN,
  thick: 0.125 * IN,
  /** Each frame's half width, top above the soil, and how far behind or in front of the plane it is. */
  rear: { half: 3.25 * IN, top: 34 * IN, dz: -0.004 },
  front: { half: 4.75 * IN, top: 30 * IN, dz: 0.004 },
  /** The stake below the soil (48 in in all with the rear frame's 34). */
  stake: 14 * IN,
  /** The bottom rail and the arcs' run (from, to) and their number of ovals. */
  rail: 3 * IN,
  arcs: { from: 3 * IN, to: 31 * IN, ovals: 3 },
};

/** The soil of a raised bed a plant can stand in: outer length, width, the wall's thickness, and its soil height. */
export function raisedBedSoil(spec: FeatureSpec, own?: [number, number, number]): { W: number; D: number; inset: number; soil: number } | null {
  // A Vego Garden metal bed (siteplan/planterbeds.ts).
  if (spec.kind === 'vegoModernBed') return vegoBedSoil(spec, own);
  if (spec.kind !== 'raisedBedCedar') return null;
  const [W, D, H] = featureSize(spec, own, 18 * IN);
  return { W, D, inset: RAISED_BED.board * IN, soil: H - RAISED_BED.soilDrop * IN };
}

/* ------------------------------------------------------------------ */
/* The catalog entries                                                   */
/* ------------------------------------------------------------------ */

/** Glaze colors of the bubbling urn: the board's rust and tan, and three other glazes urns of this kind come in. */
export type UrnGlaze = 'rust' | 'charcoal' | 'cobalt' | 'celadon';
export const URN_GLAZES: { id: UrnGlaze; name: string }[] = [
  { id: 'rust', name: 'rust and tan' },
  { id: 'charcoal', name: 'charcoal' },
  { id: 'cobalt', name: 'cobalt blue' },
  { id: 'celadon', name: 'celadon green' },
];

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const YARD_FEATURES: FeatureSpec[] = [
  F({
    id: 'suncast-bms7481-brown', name: 'Suncast Modern 7 x 4 ft resin shed BMS7481, Brown', group: 'Shade', kind: 'shedResin',
    footprint: [SUNCAST_BMS7481.w * IN, SUNCAST_BMS7481.d * IN], maker: 'Suncast',
    options: [{ key: 'doorsOpen', label: 'Doors open', default: false }],
    about: 'Suncast Modern 7 ft x 4 ft storage shed (BMS7481) in the Brown option: an Iron Ore charcoal resin body with a fine horizontal woodgrain, shiplap pilasters at the front corners, a black ribbed lean-to roof high at the front, and Walnut woodcast double doors with black lever handles and three black hinges each. Set level on a paver pad.',
    facts: ['Exterior 7 ft 1 1/2 in W x 4 ft 1 1/4 in D x 6 ft 6 1/2 in H (85.5 x 49.25 x 78.5 in)', 'Interior 6 ft 10 in W x 3 ft 10 in D x 6 ft 4 1/2 in H', 'Double doors, opening 61 in W x 72 3/4 in H', 'Resin walls and floor; single-slope roof sloping to the back', 'Brown option: Iron Ore body, black roof, Walnut woodcast doors', 'Stands on a level paver pad'],
  }),
  F({
    id: 'garden-bench-wood-5ft', name: 'Garden bench, 5 ft wood with back and arms', group: 'Furniture', kind: 'gardenBench',
    footprint: [60 * IN, 24 * IN], sizes: BENCH_SIZES, size: 0,
    about: 'A hardwood garden bench in an oiled honey teak tone: an arched top rail over 13 vertical back slats, flat arms with rounded front ends on square front posts, a slatted seat and four square legs, the back legs running up as the back posts.',
    facts: ['5 ft long, 24 in deep, 35 in tall; seat 18 in high (also 4 ft)', '13 back slats about 1 1/2 in wide between an arched top rail and a lower back rail', 'Five seat slats; side stretchers low between the legs', 'Acacia or teak, oiled; set on DG or paving against the fence'],
  }),
  F({
    id: 'raised-bed-cedar', name: 'Raised bed, custom cedar, free standing', group: 'Accents', kind: 'raisedBedCedar',
    footprint: [72 * IN, 36 * IN], sizes: RAISED_BED_SIZES, size: 0,
    about: 'A free-standing custom cedar raised planting bed: 4x4 corner posts flush with the sides, two courses of cedar boards on each side, a flat 2x6 cap mitered at the corners and overhanging the outside, screwed together, filled with planting soil. Plants set in it stand on its soil.',
    facts: ['6 ft L x 3 ft W x 18 in H as drawn (also 8 x 4 ft)', '4x4 corner posts; two 2x boards about 8 1/4 in tall a side', '2x6 cap, mitered corners, 1 in over the outside', 'Natural western red cedar, exterior screws', 'Soil 2 in under the cap; its plants are placed like any plant'],
  }),
  F({
    id: 'pot-trellis-star-jasmine', name: 'Tall brown pot, metal trellis and star jasmine', group: 'Accents', kind: 'potTrellis', plantable: true,
    footprint: [TALL_POT.top * IN, TALL_POT.top * IN],
    about: 'A tall square tapered pot in a smooth matte milk-chocolate brown, wider at the top, with a dark bronze metal trellis of two nested frames and a chain of pointed ovals, and a star jasmine (Trachelospermum jasminoides) trained up it, in bloom. Planted unless set empty.',
    facts: ['Pot 24 in tall, 15 in square at the top, 10 1/2 in at the base', 'Trellis 48 in with its stake (about 34 in above the soil), 3/8 in dark bronze flat bar', 'Star jasmine, 2 gal staked, trained on the trellis (the plant is counted with the plan\'s plants)', 'For a jasmine in the ground, place the star jasmine on a metal trellis plant in the bed: it stands with its back to the nearest fence'],
  }),
  F({
    id: 'ac-screen-cedar-slat', name: 'A/C screen, cedar slat', group: 'Accents', kind: 'slatScreen',
    footprint: [66 * IN, 3.5 * IN], sizes: SLAT_SCREEN_SIZES, size: 1,
    about: 'A simple screen for an A/C unit: horizontal clear cedar 1x4 slats with 1/2 in gaps on 4x4 cedar posts, under a flat cedar cap.',
    facts: ['4 ft tall; 4, 5 1/2 (the plan\'s run) or 6 ft long', '1x4 slats, 1/2 in gaps, so air still moves through', '4x4 posts set in concrete, 1x4 cap'],
  }),
  ...URN_GLAZES.map(({ id, name }) => F({
    id: `urn-fountain-bubbler-24-${id}`, name: `Urn bubbler fountain, 24 in glazed urn, ${name}`, group: 'Water', kind: 'urnFountain', urn: 'bubbler', glaze: id,
    footprint: [102 * IN, 102 * IN],
    options: [{ key: 'ring', label: 'Paver ring (when no paving borders it)', default: false }, { key: 'boulders', label: 'Boulders', default: true }, { key: 'uplight', label: 'Uplight', default: true }],
    about: `A pondless bubbling urn: a 24 in glazed ceramic urn${id === 'rust' ? ', a rough mottled rust and tan glaze as on the design board' : `, glazed ${name}`}, drilled for a copper bubbler that throws a short dome of water. The water fills the mouth and sheets down every side into a 7 ft circle of black Mexican beach pebble over a hidden 4 ft vault, ringed by the paving\'s soldier border (or a ring of its own, an option). Tan boulders and a warm uplight are options.`,
    facts: ['Urn 24 in across x 30 in tall, glazed ceramic, pre-drilled (the board gives 24 in; the height is read from its photo)', 'Hidden vault about 4 ft round with a grate and mesh; submersible pump, 400-800 GPH; copper bubbler; auto-fill optional', 'Black Mexican beach pebble 1-2 in, a 7 ft circle', 'Paver ring: Belgard Catalina Grana 6 x 9 border, Scandina Gray, as a soldier course (option, off: on a plan the paving\'s own border rings it)', 'Three tan boulders, about 30, 24 and 20 in (option)', 'A warm 2700 K LED uplight in the pebbles (option)'],
  })),
];

/** The kinds above (for the feature builder's switch). */
export const YARD_KINDS: readonly FeatureKind[] = ['shedResin', 'gardenBench', 'raisedBedCedar', 'potTrellis', 'slatScreen', 'vegoModernBed'];
