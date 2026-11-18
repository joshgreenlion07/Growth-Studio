import type { FeatureSpec } from './catalog';
import type { FeatureSize } from './decor';

/*
 * The rock Green Lion sets in water features, from its supplier bills and its finished-job photos: moss rock boulders
 * (Resource Building Materials: "Moss Rock Boulder, medium size, approx. 200 - 400 lbs" and "head size"; California
 * Landscape Supply: moss rock sold per pound and in baskets), Canyon Tech boulders (Resource Building Materials), and
 * the flagstones that lip and edge a fall (Cold Water Canyon, AZ Classic Oak 2 in, SUI Black Slate 1 in). Drawn by
 * `builder/waterrock.ts` and `builder/flagstone.ts`. Every one comes in sizes, set on the placement's `size`
 * (length, depth and height above the ground, meters); the height of a boulder is what shows, with about a fifth of
 * it buried under that.
 */

export type WaterRockKind = 'mossRock' | 'canyonBoulder' | 'flagLedge' | 'flagLip' | 'flagEdge';

const IN = 0.0254;

/** Rough weight, lb, of a boulder this big: about half the box it fits in is stone, 165 lb a cubic foot (an estimate). */
export function boulderWeightLb(size: [number, number, number]): number {
  const cuFt = (size[0] / IN) * (size[1] / IN) * (size[2] / IN) * 0.5 / 1728;
  return Math.round((cuFt * 165) / 10) * 10;
}

/**
 * The sizes of a boulder shape. Each step is a nominal length (in); the shape's ratios (length, depth and height as
 * shares of it) give the rock's own box. The medium is the "approx. 200 - 400 lb" piece on the bill.
 */
const STEPS: [number, string][] = [[12, 'Head size'], [22, 'Medium'], [30, 'Large'], [36, 'Boulder, 3 ft'], [48, 'Boulder, 4 ft'], [60, 'Boulder, 5 ft']];
const sizesOf = ([rl, rd, rh]: [number, number, number]): FeatureSize[] => STEPS.map(([n, name]) => {
  const l = Math.round(n * rl), d = Math.round(n * rd), h = Math.round(n * rh);
  return { label: `${name}, about ${l} x ${d} x ${h} in`, size: [l * IN, d * IN, h * IN] as [number, number, number] };
});

/** Rounded: wide and low, worn smooth on every side. Tall: stands on end. Flat-top: long and low with a flat top. */
export const MOSS_ROUNDED_SIZES = sizesOf([1, 0.82, 0.68]);
export const MOSS_TALL_SIZES = sizesOf([0.75, 0.6, 0.95]);
export const MOSS_FLAT_SIZES = sizesOf([1.1, 0.8, 0.5]);
export const CANYON_SIZES = sizesOf([1, 0.8, 0.62]).slice(1);

const MEDIUM = 1;

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

const mossFacts = (sizes: FeatureSize[]) => [
  'Head size and medium are the bill\'s sizes: "Moss Rock Boulder, medium size, approx. 200 - 400 lbs" and "Moss Rock Boulder, head size"',
  `Medium: about ${boulderWeightLb(sizes[MEDIUM].size)} lb at this shape (estimated from its size; the bill gives 200 - 400 lb); a 4 ft boulder about ${boulderWeightLb(sizes[4].size)} lb`,
  'Sizes are length x depth x the height that shows; about a fifth of the rock is set below the ground',
  'Moss and lichen can be switched off for clean stone',
];

/** Flagstone pieces (builder/flagstone.ts): the piece's own thickness is the size's height; the stone is the placement's. */
const flat = (l: number, d: number, t: number, label?: string): FeatureSize => ({ label: label ?? `${l} x ${d} x ${t} in`, size: [l * IN, d * IN, t * IN] });
export const FLAG_LIP_SIZES: FeatureSize[] = [flat(18, 9, 2), flat(24, 10, 2), flat(30, 12, 2), flat(36, 12, 2), flat(48, 14, 2)];
export const FLAG_LEDGE_SIZES: FeatureSize[] = [flat(30, 16, 6), flat(36, 18, 8), flat(48, 20, 10), flat(60, 22, 12), flat(72, 24, 14)];
export const FLAG_EDGE_SIZES: FeatureSize[] = [flat(12, 9, 2), flat(18, 12, 2), flat(24, 14, 2), flat(30, 16, 2)];

/** Moss rock and Canyon Tech boulders: offered. */
export const WATER_ROCK_FEATURES: FeatureSpec[] = [
  F({ id: 'moss-rock-rounded', name: 'Moss rock boulder, rounded', group: 'Water', kind: 'mossRock', footprint: MOSS_ROUNDED_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_ROUNDED_SIZES, size: MEDIUM,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the wide, low, worn-smooth shape: tan, buff and brown stone with gray-green lichen, rust-orange patches and moss on the tops, set partly buried. The rock Green Lion buys from Resource Building Materials as Moss Rock Boulder (medium and head size) and from California Landscape Supply by the pound.',
    facts: mossFacts(MOSS_ROUNDED_SIZES) }),
  F({ id: 'moss-rock-tall', name: 'Moss rock boulder, tall', group: 'Water', kind: 'mossRock', footprint: MOSS_TALL_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_TALL_SIZES, size: MEDIUM,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the upright shape: a rock standing on its end, taller than it is wide, with the same tan and brown stone, lichen and moss. Good as the back or the side of a fall.',
    facts: mossFacts(MOSS_TALL_SIZES) }),
  F({ id: 'moss-rock-flat-top', name: 'Moss rock boulder, flat-top', group: 'Water', kind: 'mossRock', footprint: MOSS_FLAT_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_FLAT_SIZES, size: MEDIUM,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the long, low shape with a flat top: the rock a stream pours over, or a ledge a fall steps down. Same tan and brown stone, lichen and moss.',
    facts: mossFacts(MOSS_FLAT_SIZES) }),
  F({ id: 'canyon-tech-boulder', name: 'Canyon Tech boulder', group: 'Water', kind: 'canyonBoulder', footprint: CANYON_SIZES[0].size.slice(0, 2) as [number, number], sizes: CANYON_SIZES, size: 0,
    options: [{ key: 'moss', label: 'Lichen and rust', default: true }],
    about: 'Natural boulder, the second boulder type Green Lion sets: weathered, angular stone in warm gray and tan with rust-orange lichen patches and little moss, set partly buried. Bought from Resource Building Materials as Canyon Tech Boulders. Its color and shape are drawn from Green Lion\'s job photos; the supplier gave no description.',
    facts: ['Sizes are length x depth x the height that shows; about a fifth of the rock is set below the ground', `A 22 in boulder is about ${boulderWeightLb(CANYON_SIZES[0].size)} lb, a 4 ft boulder about ${boulderWeightLb(CANYON_SIZES[3].size)} lb (estimated from size)`] }),
];

/**
 * Flagstone pieces. Built and drawn (builder/flagstone.ts) but NOT in the catalog yet: each is drawn in one of Green Lion's
 * three flagstones (Cold Water Canyon, AZ Classic Oak, SUI Black Slate), whose looks come with the stepping stones'
 * flagstone looks; they are added to `FEATURES` when those land, so no stand-in stone is ever offered.
 */
export const FLAGSTONE_FEATURES: FeatureSpec[] = [
  F({ id: 'flagstone-lip-stone', name: 'Flagstone spillway lip stone', group: 'Water', kind: 'flagLip', footprint: FLAG_LIP_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_LIP_SIZES, size: 1,
    about: 'A long flagstone slab with a rounded, slightly drooping front edge: the stone a fall pours over. Set level across the top of a fall, its front edge toward the water (the front of the placement). Pick the flagstone in Look.',
    facts: ['Length x depth x thickness; AZ Classic Oak is 2 in thick, SUI Black Slate 1 in', 'Pick the stone: Cold Water Canyon, AZ Classic Oak or SUI Black Slate'] }),
  F({ id: 'flagstone-ledge', name: 'Flagstone ledge, stacked slabs', group: 'Water', kind: 'flagLedge', footprint: FLAG_LEDGE_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_LEDGE_SIZES, size: 1,
    about: 'Flagstone slabs stacked into a ledge a fall steps down, each one set a little back from the one below and a little off square, as a crew stacks them. Pick the flagstone in Look.',
    facts: ['Length x depth x the height of the stack; each slab is the stone\'s own thickness', 'Pick the stone: Cold Water Canyon, AZ Classic Oak or SUI Black Slate'] }),
  F({ id: 'flagstone-edge-piece', name: 'Flagstone edge piece', group: 'Water', kind: 'flagEdge', footprint: FLAG_EDGE_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_EDGE_SIZES, size: 1,
    about: 'One irregular flagstone, cut and broken along its sides, to set along the edge of a pond, stream or basin. Pick the flagstone in Look.',
    facts: ['Length x depth x thickness', 'Pick the stone: Cold Water Canyon, AZ Classic Oak or SUI Black Slate'] }),
];
