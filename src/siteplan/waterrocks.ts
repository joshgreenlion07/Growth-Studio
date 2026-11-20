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

/**
 * How much of its box a moss rock fills, by shape: measured from the drawn rocks (builder/mossrock.ts) by
 * `scripts/moss-rock-weights.mjs`, whole rock, the buried fifth too.
 */
export const MOSS_FILL = { rounded: 0.489, tall: 0.511, flat: 0.516 };

/**
 * Rough weight, lb, of a boulder this big (length x depth x the height that shows, m): the whole rock, a fifth of it
 * below the ground, filling `fill` of its box, at 160 lb a cubic foot.
 */
export function boulderWeightLb(size: [number, number, number], fill = 0.5): number {
  const cuFt = ((size[0] / IN) * (size[1] / IN) * (size[2] / IN / 0.8) * fill) / 1728;
  return Math.round((cuFt * 160) / 10) * 10;
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
  'Drawn in fine detail: pores, pits and lichen down to a millimeter or two up close; the mesh is finest at the Max quality setting',
];

/* ---- The rock library ----------------------------------------------------------------------------------------- */

/**
 * Forty moss rocks, each one rock: 20 tan-brown (T01 to T20) and 20 dark gray (G01 to G20). Each has its own seed,
 * form and proportions, so it is the same rock wherever it is placed (the Library's picture is the rock you get).
 * Each scales from a quarter to three times its standard size, keeping its shape; its weight goes with its size.
 */
export type LibraryForm = 'rounded' | 'tall' | 'flat' | 'ridge' | 'wedge';

export interface LibraryRock {
  id: string;
  code: string;
  shade: 'tan' | 'gray';
  form: LibraryForm;
  /** Length, depth and height that shows, as shares of `nominal` (in). */
  ratio: [number, number, number];
  nominal: number;
  what: string;
}

const T: [string, LibraryForm, [number, number, number], number, string][] = [
  ['T01', 'rounded', [1.0, 0.8, 0.62], 24, 'low and wide'], ['T02', 'tall', [0.62, 0.52, 1.0], 26, 'tall pillar'],
  ['T03', 'flat', [1.25, 0.85, 0.45], 30, 'flat-top slab'], ['T04', 'rounded', [0.9, 0.85, 0.78], 20, 'blocky cube'],
  ['T05', 'ridge', [1.2, 0.7, 0.62], 28, 'ridge-top'], ['T06', 'wedge', [1.0, 0.8, 0.68], 24, 'sloped wedge'],
  ['T07', 'rounded', [1.4, 0.65, 0.5], 32, 'long and low'], ['T08', 'tall', [0.8, 0.6, 0.9], 22, 'upright chunk'],
  ['T09', 'flat', [1.0, 0.95, 0.5], 26, 'wide flat-top'], ['T10', 'rounded', [1.0, 0.85, 0.7], 16, 'head-size round'],
  ['T11', 'ridge', [0.9, 0.75, 0.88], 22, 'peaked'], ['T12', 'wedge', [1.3, 0.8, 0.58], 30, 'long wedge'],
  ['T13', 'rounded', [1.1, 0.9, 0.72], 36, 'big rounded boulder'], ['T14', 'tall', [0.7, 0.65, 1.05], 34, 'big standing stone'],
  ['T15', 'flat', [1.5, 0.9, 0.38], 40, 'big ledge slab'], ['T16', 'rounded', [0.95, 0.7, 0.6], 14, 'small chunk'],
  ['T17', 'wedge', [0.85, 0.85, 0.78], 20, 'chunky wedge'], ['T18', 'ridge', [1.4, 0.8, 0.58], 38, 'long ridge boulder'],
  ['T19', 'rounded', [1.2, 1.0, 0.8], 44, 'showpiece boulder'], ['T20', 'flat', [1.1, 0.7, 0.48], 18, 'step stone'],
];
const G: [string, LibraryForm, [number, number, number], number, string][] = [
  ['G01', 'wedge', [1.1, 0.85, 0.7], 26, 'sloped wedge'], ['G02', 'rounded', [1.0, 0.9, 0.66], 22, 'round pillow'],
  ['G03', 'tall', [0.6, 0.55, 1.1], 30, 'tall pillar'], ['G04', 'flat', [1.3, 0.9, 0.42], 34, 'flat-top slab'],
  ['G05', 'ridge', [1.1, 0.75, 0.7], 24, 'ridge-top'], ['G06', 'rounded', [1.35, 0.7, 0.52], 30, 'long and low'],
  ['G07', 'rounded', [0.85, 0.8, 0.8], 18, 'blocky cube'], ['G08', 'tall', [0.75, 0.6, 0.95], 24, 'upright chunk'],
  ['G09', 'wedge', [1.4, 0.75, 0.55], 36, 'long wedge'], ['G10', 'rounded', [1.0, 0.8, 0.68], 15, 'head-size round'],
  ['G11', 'flat', [1.05, 1.0, 0.48], 28, 'wide flat-top'], ['G12', 'ridge', [0.85, 0.7, 0.9], 20, 'peaked'],
  ['G13', 'rounded', [1.15, 0.95, 0.75], 40, 'big rounded boulder'], ['G14', 'tall', [0.72, 0.62, 1.0], 38, 'big standing stone'],
  ['G15', 'flat', [1.45, 0.85, 0.4], 44, 'big ledge slab'], ['G16', 'wedge', [0.9, 0.8, 0.75], 18, 'chunky wedge'],
  ['G17', 'rounded', [0.9, 0.7, 0.55], 13, 'small chunk'], ['G18', 'ridge', [1.35, 0.85, 0.6], 34, 'long ridge boulder'],
  ['G19', 'rounded', [1.25, 1.0, 0.82], 48, 'showpiece boulder'], ['G20', 'flat', [1.2, 0.75, 0.45], 20, 'step stone'],
];

export const LIBRARY_ROCKS: LibraryRock[] = [
  ...T.map(([code, form, ratio, nominal, what]) => ({ id: `moss-rock-${code.toLowerCase()}`, code, shade: 'tan' as const, form, ratio, nominal, what })),
  ...G.map(([code, form, ratio, nominal, what]) => ({ id: `moss-rock-${code.toLowerCase()}`, code, shade: 'gray' as const, form, ratio, nominal, what })),
];
export const libraryRockById = new Map(LIBRARY_ROCKS.map((r) => [r.id, r]));

/**
 * Each library rock's weight at its standard size, lb: the volume of the whole rock (the part set in the ground too)
 * as drawn, at 160 lb a cubic foot. Measured by `scripts/moss-rock-weights.mjs`; run it again if builder/mossrock.ts
 * changes the shapes.
 */
const ROCK_LB: Record<string, number> = {
  'moss-rock-t01': 440, 'moss-rock-t02': 351, 'moss-rock-t03': 814, 'moss-rock-t04': 278, 'moss-rock-t05': 595,
  'moss-rock-t06': 404, 'moss-rock-t07': 897, 'moss-rock-t08': 255, 'moss-rock-t09': 460, 'moss-rock-t10': 131,
  'moss-rock-t11': 333, 'moss-rock-t12': 839, 'moss-rock-t13': 2076, 'moss-rock-t14': 1076, 'moss-rock-t15': 1926,
  'moss-rock-t16': 51, 'moss-rock-t17': 237, 'moss-rock-t18': 1777, 'moss-rock-t19': 4421, 'moss-rock-t20': 140,
  'moss-rock-g01': 629, 'moss-rock-g02': 377, 'moss-rock-g03': 604, 'moss-rock-g04': 1127, 'moss-rock-g05': 396,
  'moss-rock-g06': 725, 'moss-rock-g07': 161, 'moss-rock-g08': 359, 'moss-rock-g09': 1297, 'moss-rock-g10': 105,
  'moss-rock-g11': 654, 'moss-rock-g12': 239, 'moss-rock-g13': 2975, 'moss-rock-g14': 1671, 'moss-rock-g15': 2747,
  'moss-rock-g16': 176, 'moss-rock-g17': 41, 'moss-rock-g18': 1432, 'moss-rock-g19': 5778, 'moss-rock-g20': 193,
};

/** Pounds, rounded as a yard weighs: to 5 lb under 100, 10 lb under 1,000, 50 lb above. */
export function roundLb(lb: number): number {
  const q = lb < 100 ? 5 : lb < 1000 ? 10 : 50;
  return Math.max(q, Math.round(lb / q) * q);
}

/** A rock's weight at another size: the standard weight times the change in length x depth x height. */
export function scaledLb(lb: number, standard: [number, number, number], size: [number, number, number]): number {
  return lb * ((size[0] * size[1] * size[2]) / (standard[0] * standard[1] * standard[2]));
}

const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const fmtLb = (lb: number) => roundLb(lb).toLocaleString('en-US');

function libraryFeature(r: LibraryRock): FeatureSpec {
  const std = r.ratio.map((k) => Math.round(r.nominal * k)) as [number, number, number];
  const lb = ROCK_LB[r.id] ?? boulderWeightLb([std[0] * IN, std[1] * IN, std[2] * IN]);
  const sizes: FeatureSize[] = SCALES.map((k) => {
    const d = std.map((v) => Math.max(4, Math.round(v * k)));
    return { label: `${Math.round(k * 100)}%: ${d[0]} x ${d[1]} x ${d[2]} in, about ${fmtLb(lb * k ** 3)} lb`, size: [d[0] * IN, d[1] * IN, d[2] * IN] as [number, number, number] };
  });
  const shade = r.shade === 'tan' ? 'tan-brown' : 'dark gray';
  return F({
    id: r.id, name: `Moss rock ${r.code} (${shade}): ${r.what}`, group: 'Rock library', kind: 'mossRock',
    footprint: [std[0] * IN, std[1] * IN], sizes, size: 2, scale: { lb },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: `One moss rock from the rock library, ${r.what}: ${r.shade === 'tan' ? 'weathered tan-brown stone with iron stain' : 'charcoal-gray stone with lighter gray breaks and a little rust'}, broken along a few faces, its edges chipped and corners knocked off, porous and pitted all over, with pale yellow-green crust lichen, set partly buried. It is the same rock wherever it is placed; scale it from a quarter to three times its standard size and its weight goes with it.`,
    facts: [
      `Standard size ${std[0]} x ${std[1]} x ${std[2]} in (length x depth x the height that shows), about ${fmtLb(lb)} lb`,
      'Weight is the whole rock, the fifth set below the ground too, at 160 lb a cubic foot',
      'Scales from 25 to 300 % (the size list steps from 50 to 200 %): twice the size is eight times the weight',
      'Moss and lichen can be switched off for clean stone',
    ],
  });
}

export const ROCK_LIBRARY_FEATURES: FeatureSpec[] = LIBRARY_ROCKS.map(libraryFeature);

/**
 * Flagstone pieces (builder/flagstone.ts): length x depth (a lip stone or an edge piece is as thick as its stone, so its
 * height here is only the default 2 in); a ledge's height is its stack.
 */
const flat = (l: number, d: number, t: number, label?: string): FeatureSize => ({ label: label ?? `${l} x ${d} x ${t} in`, size: [l * IN, d * IN, t * IN] });
export const FLAG_LIP_SIZES: FeatureSize[] = [18, 24, 30, 36, 48].map((l, i) => flat(l, [9, 10, 12, 12, 14][i], 2, `${l} x ${[9, 10, 12, 12, 14][i]} in`));
export const FLAG_LEDGE_SIZES: FeatureSize[] = [flat(30, 16, 6), flat(36, 18, 8), flat(48, 20, 10), flat(60, 22, 12), flat(72, 24, 14)];
export const FLAG_EDGE_SIZES: FeatureSize[] = [[12, 9], [18, 12], [24, 14], [30, 16]].map(([l, d]) => flat(l, d, 2, `${l} x ${d} in`));

export const WATER_ROCK_FEATURES: FeatureSpec[] = [
  F({ id: 'moss-rock-rounded', name: 'Moss rock boulder, rounded', group: 'Water', kind: 'mossRock', footprint: MOSS_ROUNDED_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_ROUNDED_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_ROUNDED_SIZES[MEDIUM].size, MOSS_FILL.rounded) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the wide, low shape: weathered tan-brown stone broken along a few faces, its edges chipped and corners knocked off, porous and pitted all over, with iron stain, pale yellow-green crust lichen on the tops and a little moss, set partly buried. The rock Green Lion buys from Resource Building Materials as Moss Rock Boulder (medium and head size) and from California Landscape Supply by the pound.',
    facts: mossFacts(MOSS_ROUNDED_SIZES) }),
  F({ id: 'moss-rock-tall', name: 'Moss rock boulder, tall', group: 'Water', kind: 'mossRock', footprint: MOSS_TALL_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_TALL_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_TALL_SIZES[MEDIUM].size, MOSS_FILL.tall) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the upright shape: a rock standing on its end, taller than it is wide, with steep broken sides; the same porous, chipped tan-brown stone and crust lichen. Good as the back or the side of a fall.',
    facts: mossFacts(MOSS_TALL_SIZES) }),
  F({ id: 'moss-rock-flat-top', name: 'Moss rock boulder, flat-top', group: 'Water', kind: 'mossRock', footprint: MOSS_FLAT_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_FLAT_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_FLAT_SIZES[MEDIUM].size, MOSS_FILL.flat) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder, the long, low shape with a flat top: the rock a stream pours over, or a ledge a fall steps down. The same porous, chipped tan-brown stone and crust lichen.',
    facts: mossFacts(MOSS_FLAT_SIZES) }),
  // The same three shapes in dark gray moss rock.
  F({ id: 'moss-rock-rounded-gray', name: 'Moss rock boulder, rounded, dark gray', group: 'Water', kind: 'mossRock', footprint: MOSS_ROUNDED_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_ROUNDED_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_ROUNDED_SIZES[MEDIUM].size, MOSS_FILL.rounded) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder in dark gray, the wide, low shape: charcoal-gray stone broken along a few faces, its breaks a lighter gray, edges chipped and corners knocked off, porous and pitted all over, with a little rust and pale yellow-green crust lichen on the tops, set partly buried. The darker moss rock in the same supply yards\' moss rock.',
    facts: mossFacts(MOSS_ROUNDED_SIZES) }),
  F({ id: 'moss-rock-tall-gray', name: 'Moss rock boulder, tall, dark gray', group: 'Water', kind: 'mossRock', footprint: MOSS_TALL_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_TALL_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_TALL_SIZES[MEDIUM].size, MOSS_FILL.tall) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder in dark gray, the upright shape: a rock standing on its end, taller than it is wide, with steep broken sides; porous, chipped charcoal-gray stone with crust lichen. Good as the back or the side of a fall.',
    facts: mossFacts(MOSS_TALL_SIZES) }),
  F({ id: 'moss-rock-flat-top-gray', name: 'Moss rock boulder, flat-top, dark gray', group: 'Water', kind: 'mossRock', footprint: MOSS_FLAT_SIZES[MEDIUM].size.slice(0, 2) as [number, number], sizes: MOSS_FLAT_SIZES, size: MEDIUM, scale: { lb: boulderWeightLb(MOSS_FLAT_SIZES[MEDIUM].size, MOSS_FILL.flat) },
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'Moss rock boulder in dark gray, the long, low shape with a flat top: the rock a stream pours over, or a ledge a fall steps down. Porous, chipped charcoal-gray stone with crust lichen.',
    facts: mossFacts(MOSS_FLAT_SIZES) }),
  F({ id: 'canyon-tech-boulder', name: 'Canyon Tech boulder', group: 'Water', kind: 'canyonBoulder', footprint: CANYON_SIZES[0].size.slice(0, 2) as [number, number], sizes: CANYON_SIZES, size: 0,
    options: [{ key: 'moss', label: 'Lichen and rust', default: true }],
    about: 'Natural boulder, the second boulder type Green Lion sets: weathered, angular stone in warm gray and tan with rust-orange lichen patches and little moss, set partly buried. Bought from Resource Building Materials as Canyon Tech Boulders. Its color and shape are drawn from Green Lion\'s job photos; the supplier gave no description.',
    facts: ['Sizes are length x depth x the height that shows; about a fifth of the rock is set below the ground', `A 22 in boulder is about ${boulderWeightLb(CANYON_SIZES[0].size)} lb, a 4 ft boulder about ${boulderWeightLb(CANYON_SIZES[3].size)} lb (estimated from size)`] }),
];

/** Flagstone pieces, each cut from one of Green Lion's three flagstones (the placement's `materialId`; default AZ Classic Oak). */
export const FLAGSTONE_FEATURES: FeatureSpec[] = [
  F({ id: 'flagstone-lip-stone', name: 'Flagstone spillway lip stone', group: 'Water', kind: 'flagLip', footprint: FLAG_LIP_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_LIP_SIZES, size: 1,
    about: 'A long flagstone slab with a rounded, slightly drooping front edge: the stone a fall pours over. Set level across the top of a fall, its front edge toward the water (the front of the placement). Pick the flagstone in its look.',
    facts: ['Length x depth; a piece is as thick as its stone: Cold Water Canyon 2 in, AZ Classic Oak 2 in, SUI Black Slate 1 in', 'The stone is the placement\'s look: Cold Water Canyon, AZ Classic Oak (the default) or SUI Black Slate'] }),
  F({ id: 'flagstone-ledge', name: 'Flagstone ledge, stacked slabs', group: 'Water', kind: 'flagLedge', footprint: FLAG_LEDGE_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_LEDGE_SIZES, size: 1,
    about: 'Flagstone slabs stacked into a ledge a fall steps down, each one set a little back from the one below and a little off square, as a crew stacks them. Pick the flagstone in its look.',
    facts: ['Length x depth x the height of the stack; each slab is the stone\'s own thickness (2 in, or 1 in for SUI Black Slate)', 'The stone is the placement\'s look: Cold Water Canyon, AZ Classic Oak (the default) or SUI Black Slate'] }),
  F({ id: 'flagstone-edge-piece', name: 'Flagstone edge piece', group: 'Water', kind: 'flagEdge', footprint: FLAG_EDGE_SIZES[1].size.slice(0, 2) as [number, number], sizes: FLAG_EDGE_SIZES, size: 1,
    about: 'One irregular flagstone, cut and broken along its sides, to set along the edge of a pond, stream or basin. Pick the flagstone in its look.',
    facts: ['Length x depth; as thick as its stone', 'The stone is the placement\'s look: Cold Water Canyon, AZ Classic Oak (the default) or SUI Black Slate'] }),
];
