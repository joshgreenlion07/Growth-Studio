import type { FeatureKind, FeatureSpec } from './catalog';

/*
 * Three homeowner-supplied pieces from a customer job's design book, which shows them without a brand. Each is matched
 * to the maker product nearest the book's render in shape, proportions, material and color, and drawn to that maker's
 * published size (builder/waterfire/):
 *
 *   basaltFountain  Stone Forest Flat-Topped Natural Basalt Fountain NF81-FLT (stoneforest.com): a low section of a
 *                   natural basalt column, about 24-28 in across and 15 in tall, its weathered crust left on the sides
 *                   and its top sawn and polished flat; water wells up through a core-drilled hole, covers the top and
 *                   runs down every side into a hidden basin under pebbles.
 *   birdbath        Campania International Birdbath 6802 (campaniainternational.com), glazed ceramic, 20.5 in across
 *                   and 24 in tall on a 10.5 in base: a wide basin with a rolled rim on a tapered pedestal with a
 *                   ringed collar, a ringed band low down and a flared foot. Glazes Petrol and Antique Glaze.
 *   roundFirePit    The Outdoor Plus Florence GFRC Fire Pit, 12 in tall (OPT-FL42, theoutdoorplus.com): a 42 in
 *                   drum of glass fiber reinforced concrete on a recessed plinth, a 27 in opening over a 12 in
 *                   stainless burner under lava rock. Chocolate.
 */

export type WaterFireKind = 'basaltFountain' | 'birdbath' | 'roundFirePit';

/** The class each switches within (catalog SWAP_CLASS). */
export const WATER_FIRE_SWAP: Record<WaterFireKind, string> = {
  basaltFountain: 'Water features', birdbath: 'Water features', roundFirePit: 'Fire features',
};

/** The kinds above (for the feature builder's switch). */
export const WATER_FIRE_KINDS: readonly FeatureKind[] = ['basaltFountain', 'birdbath', 'roundFirePit'];

const IN = 0.0254;

/* ------------------------------------------------------------------ */
/* Maker sizes (inches)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Stone Forest NF81-FLT (product page and drawing "Basalt Natural Fountain w Flat Top", 2019): approximately 24-28 in
 * across and 15 in tall, 800-1100 lb; each one is unique, so it is drawn 26 in across (the middle of the range). The
 * basin is Stone Forest's Fountain Installation Kit, 44 in square (installation sheet: 44 x 44 x 11 in, 60 gal, holds
 * up to 3,000 lb), the one Stone Forest sells for its heavy fountains; it hides under the pebble bed, which runs a
 * little past it (`bed`, half-widths).
 */
export const BASALT_NF81 = { across: 26, h: 15, basin: 44, basinH: 11, bed: [32, 32] as [number, number], bedTop: 1.5 };

/** Campania International Birdbath 6802 (maker's specifications): 20.5 in W x 24 in H, base 10.5 in W, 35 lb each. */
export const CAMPANIA_6802 = { w: 20.5, h: 24, base: 10.5 };

/**
 * The Outdoor Plus Florence, low profile (spec sheet "Florence Concrete Fire Pit, low profile units - no doors",
 * 2025-01-13): A 42 in across, B 27 in opening, C 12 in tall, D 12 in burner, 65,000 BTU; the body stands on a plinth
 * set in 1 1/2 in, 1 1/2 in tall, with ventilation cut-outs; standard 2 in deep pan; key valve on the side.
 */
export const FLORENCE_42 = { d: 42, opening: 27, h: 12, burner: 12, plinthIn: 1.5, plinthH: 1.5, pan: 2 };

/** The birdbath's glazes (Campania's color names and their item numbers). */
export type BirdbathGlaze = 'petrol' | 'antique-glaze';
export const BIRDBATH_GLAZES: { id: BirdbathGlaze; name: string; sku: string; about: string }[] = [
  { id: 'petrol', name: 'Petrol', sku: '6802-4701', about: 'Petrol, a deep blue-green reactive glaze, paler where it runs thin over the rims and rings' },
  { id: 'antique-glaze', name: 'Antique Glaze', sku: '6802-1501', about: 'Antique Glaze, a near-black charcoal glaze with a soft pewter sheen, lighter on the rims and rings' },
];

/** A birdbath entry's glaze (its id ends in the glaze's id). */
export function birdbathGlazeOf(spec: FeatureSpec): BirdbathGlaze {
  return BIRDBATH_GLAZES.find((g) => spec.id === `campania-birdbath-6802-${g.id}`)?.id ?? 'petrol';
}

/* ------------------------------------------------------------------ */
/* The catalog entries                                                   */
/* ------------------------------------------------------------------ */

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const WATER_FIRE_FEATURES: FeatureSpec[] = [
  F({
    id: 'stone-forest-nf81-flat-top-basalt-fountain', name: 'Stone Forest flat-topped natural basalt fountain NF81-FLT', group: 'Water', kind: 'basaltFountain',
    footprint: [BASALT_NF81.bed[0] * 2 * IN, BASALT_NF81.bed[1] * 2 * IN], maker: 'Stone Forest', page: 'https://stoneforest.com/products/flat-topped-natural-basalt-fountain',
    options: [{ key: 'bed', label: 'Pebble bed over the basin (off when it stands in a pebble bed of the plan)', default: true }],
    about: 'A pondless bubbling stone: a low section of a natural basalt column, its weathered rust-brown and dark crust left on the faceted sides and its top sawn and polished flat. Water wells up through a core-drilled hole in the middle, covers the polished top in a thin moving sheet and runs down every side into Stone Forest\'s 44 in fountain basin, hidden under black Mexican beach pebble.',
    facts: ['About 24-28 in across x 15 in tall (each one is unique; drawn 26 in), 800-1,100 lb (Stone Forest NF81-FLT)', 'Solid natural basalt column (Stone Forest\'s Inner Mongolia quarry): weathered crust sides, polished flat top; thin white lines in the stone are natural inclusions', 'Core drilled for the bubbler; a submersible pump in the basin, on a 110-120 V GFCI outlet', 'Basin: Stone Forest Fountain Installation Kit, 44 in square x 11 in, 60 gal, holds up to 3,000 lb', 'Bed: black Mexican beach pebble 1-2 in, about 5 1/2 ft across (as in Stone Forest\'s photos)'],
  }),
  ...BIRDBATH_GLAZES.map(({ id, name, sku, about }) => F({
    id: `campania-birdbath-6802-${id}`, name: `Campania International glazed birdbath 6802, ${name}`, group: 'Water', kind: 'birdbath',
    footprint: [CAMPANIA_6802.w * IN, CAMPANIA_6802.w * IN], maker: 'Campania International', page: `https://www.campaniainternational.com/products/birdbath-${id}-s-2`,
    about: `A glazed ceramic pedestal birdbath: a wide shallow basin with a rolled rim on a tapered pedestal with a ringed collar under the basin, a ringed band low down and a flared foot, in ${about}. Still water, filled by hand (Hand tool: empty or fill it).`,
    facts: [`20.5 in across x 24 in tall, base 10.5 in; 35 lb (Campania ${sku})`, 'Glazed ceramic (glazed terra cotta), two pieces: basin and pedestal', `Glaze: ${name}; hand applied, so tone and run vary piece to piece`, 'Basin about 2 in deep; still water, no pump'],
  })),
  F({
    id: 'top-florence-fire-pit-42-chocolate', name: 'The Outdoor Plus Florence fire pit, 42 x 12 in GFRC, Chocolate', group: 'Fire', kind: 'roundFirePit',
    footprint: [FLORENCE_42.d * IN, FLORENCE_42.d * IN], maker: 'The Outdoor Plus', page: 'https://theoutdoorplus.com/product/florence-fire-pit-12-gfrc/',
    about: 'The Outdoor Plus Florence in its occasional (12 in) height: a round drum of GFRC concrete in the smooth Chocolate finish on a plinth set in under it, a wide flat ledge round a 27 in opening, and a 12 in stainless burner in a stainless pan under natural lava rock.',
    facts: ['42 in across x 12 in tall; 27 in opening; plinth set in 1 1/2 in with vents (OPT-FL42, spec sheet 2025)', 'GFRC concrete, smooth finish, Chocolate (-CHC); 18 colors', '12 in 304 stainless burner, 304 stainless pan 2 in deep, 65,000 BTU; natural lava rock included', 'Natural gas assumed: match lit OPT-FL42-CHC-NG or 110 V electronic ignition OPT-FL42EKIT-CHC-NG (propane -LP also made: no door, so the tank stands outside it)', 'Key valve on the side'],
  }),
];
