import type { FeatureSpec, MaterialSpec } from './catalog';
import type { FeatureSize } from './decor';

/*
 * Ground covers and rock from a customer job's supplier bills and finished-yard video (2026): the bed bark bought from
 * SiteOne, the Noiya river cobble and pebble a dry creek and its beds are filled with, Salt & Pepper pebble, and moss rock
 * in the sizes a dry creek border, garden beds and an entry are set with, from a 5 lb border stone to a 1,500 lb boulder.
 * Bed fills are drawn piece by piece (builder/pebbles.ts), boulders by builder/waterrock.ts, a rock border along a drawn
 * edging line by builder/rockborder.ts.
 *
 * Colors are sRGB as photographed in sun (turned into albedo like every loose stone, engine/surfaces.ts rockAlbedo), read
 * from the finished yard on a clear late-morning day where the product is in it (bark, cobble, border stones, boulders)
 * and from the supplier's own product photo where it is not (Noiyo pebble, Salt & Pepper).
 */

const IN = 0.0254;
const M = (s: Omit<MaterialSpec, 'placeholder'>): MaterialSpec => ({ ...s, placeholder: true });
const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

/* ---- Bed fills ------------------------------------------------------ */

/**
 * Noiya river cobble as it lies in a finished dry creek, sunlit tops (the yard's video): cream and pale warm gray, light
 * and mid gray, a few buff-tan, blue-gray and charcoal stones. California Landscape Supply's own photos of its 2 x 4 and
 * 4 x 8 Noiya Cobble show the same blend (gray, blue-gray, tan, buff and cream, a few charcoal); GreenWaste describes its
 * Noiyo as "earth tones mixed with some dark grays and blues".
 */
const NOIYA_COLORS = [
  { c: '#e6dccd', share: 0.18 }, { c: '#d2c7b8', share: 0.18 }, { c: '#bdb7ae', share: 0.16 }, { c: '#a7a39c', share: 0.12 },
  { c: '#c2ad93', share: 0.07 }, { c: '#8e9294', share: 0.12 }, { c: '#737a7f', share: 0.1 }, { c: '#596064', share: 0.05 },
  { c: '#45494c', share: 0.02 },
];
/** River cobble: rounded, egg-shaped and water-worn, a little flatter than it is wide, piled two or three deep (the video). */
const COBBLE_SHAPE = { wide: [0.68, 0.9] as [number, number], thick: [0.52, 0.74] as [number, number] };

/** Noiya cobble weighs about 1.3 tons a cubic yard (Bee Green's Noiya Cobbles 2-4 and 4-8 listings; Earthstone's 4-8). */
const NOIYA_TONS = 1.3;

export const GROUND_ROCK_MATERIALS: MaterialSpec[] = [
  // SiteOne BUMU-0065 "Small Decorative Bark Bulk (per cu. yd.)" (siteone.com/en/bumu-0065-small-decorative-bark-bulk-per-cu-yd/p/523697):
  // SiteOne lists it as bark, brown, wood, for beds, and gives no size or wood. Its own product photo (a quarter for
  // scale) shows flat bark nuggets 3/8 to 1 1/2 in with a few longer splinters of wood, the size the yard's video shows.
  // The color is the finished beds' in sun: a warm red-brown, the paler pieces orange-tan, a few weathered gray ones.
  M({
    id: 'siteone-small-decorative-bark', name: 'Small decorative bark', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#b87a5a', '#9a5c40', '#834c34', '#5e3527'],
    pebble: { form: 'nugget', minIn: 0.375, maxIn: 1.5, wide: [0.5, 0.82], thick: [0.14, 0.26], splinters: 0.1, colors: [
      { c: '#b06d4e', share: 0.24 }, { c: '#9a5c40', share: 0.22 }, { c: '#834c34', share: 0.2 }, { c: '#c48565', share: 0.14 },
      { c: '#6b3d2b', share: 0.1 }, { c: '#d8a07c', share: 0.06 }, { c: '#8f7468', share: 0.04 },
    ] },
    fillType: 'bark', depthIn: 3,
    matches: 'Small Decorative Bark, bulk (SiteOne BUMU-0065)', maker: 'SiteOne', line: 'Small Decorative Bark', color: 'Brown',
  }),
  // California Landscape Supply's "2 x 4 Noiya Cobble" and "4 x 8 Noiya Cobble" (californialandscapesupply.com/bulk-materials,
  // Rocks & Sand). Also sold as Noiyo or Noya (GreenWaste Noiyo 2 x 4 and 4 x 8; Bee Green "Noiya Cobbles ... sometimes
  // referred to as Noiyo or Noya"): smooth river cobble, matte, from California rivers.
  ...([[2, 4, '2-4', '2 x 4 in'], [4, 8, '4-8', '4 x 8 in']] as const).map(([lo, hi, key, label]) => M({
    id: `noiya-cobble-${key}`, name: `Noiya cobble, ${label}`, use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#cdc2b3', '#b0aaa1', '#8f8f8d', '#686c6f'],
    pebble: { form: 'river', minIn: lo, maxIn: hi, ...COBBLE_SHAPE, colors: NOIYA_COLORS },
    fillType: 'rock', depthIn: hi <= 4 ? 3 : 5, tonsPerCuYd: NOIYA_TONS,
    matches: `${label.replace(' in', '')} Noiya Cobble (California Landscape Supply)`, maker: 'California Landscape Supply', line: 'Noiya cobble', shelf: 'Rock', color: label,
  })),
  // A dry creek bed's mix, as a designer specs it: about 75% 2 x 4 in and 25% 4 in and up (the 4 x 8), mixed in the bed.
  // The shares are of the bed's area each size covers.
  M({
    id: 'noiya-cobble-dry-creek-mix', name: 'Noiya cobble, dry creek mix (75% 2 x 4, 25% 4 x 8 in)', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#cdc2b3', '#b0aaa1', '#8f8f8d', '#686c6f'],
    pebble: { form: 'river', minIn: 2, maxIn: 8, ...COBBLE_SHAPE, mix: [{ minIn: 4, maxIn: 8, share: 0.25 }, { minIn: 2, maxIn: 4, share: 0.75 }], colors: NOIYA_COLORS },
    fillType: 'rock', depthIn: 4, tonsPerCuYd: NOIYA_TONS,
    matches: '2 x 4 and 4 x 8 Noiya Cobble, mixed 3 to 1 (California Landscape Supply)', maker: 'California Landscape Supply', line: 'Noiya cobble', shelf: 'Rock', color: 'Dry creek mix',
  }),
  // GreenWaste's Noiyo in its 1 1/2 x 1 in size (greenwaste.com/products/decorative-rocks/noiyo/: Noiyo pebbles and
  // cobbles in 3/4 x 1/2, 1 1/2 x 1, 2 x 4 and 4 x 8 in): smooth matte pebble, the colors of GreenWaste's own photo of it
  // (olive and blue-gray, tan and beige, charcoal, a few pale and speckled stones).
  M({
    id: 'noiyo-pebble-1-1-2', name: 'Noiyo pebble, 1 1/2 in', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#a39c8a', '#8a8475', '#6f6b60', '#55524a'],
    pebble: { form: 'river', minIn: 1, maxIn: 1.5, wide: [0.62, 0.86], thick: [0.45, 0.65], colors: [
      { c: '#9e9786', share: 0.16 }, { c: '#8a8475', share: 0.18 }, { c: '#787367', share: 0.18 }, { c: '#686358', share: 0.16 },
      { c: '#a39278', share: 0.1 }, { c: '#5a5d5c', share: 0.1 }, { c: '#46443d', share: 0.07 }, { c: '#b7b09f', share: 0.05 },
    ] },
    fillType: 'rock', depthIn: 2.5, tonsPerCuYd: 1.4,
    matches: 'Noiyo 1 1/2 x 1 in (GreenWaste)', maker: 'GreenWaste', line: 'Noiyo', shelf: 'Rock', color: '1 1/2 in',
  }),
  // California Landscape Supply's "1 1/2 in Salt & Pepper" (californialandscapesupply.com/bulk-materials, Rocks & Sand; also
  // 1/2 in): a mixed river pebble, water-worn but not polished, some flat and blocky, in white and cream, tan, grays and
  // charcoal with a few rust-brown stones; the "Black-N-White" a design spec names. Colors from CLS's own photo of it.
  M({
    id: 'salt-and-pepper-1-1-2', name: 'Salt & Pepper pebble, 1 1/2 in', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#cfc5b3', '#a39888', '#7a746b', '#4e4c48'],
    pebble: { form: 'river', minIn: 0.75, maxIn: 1.75, wide: [0.58, 0.85], thick: [0.38, 0.6], colors: [
      { c: '#dcd2c0', share: 0.15 }, { c: '#c0b39b', share: 0.13 }, { c: '#a39887', share: 0.15 }, { c: '#8a8780', share: 0.15 },
      { c: '#6c706d', share: 0.14 }, { c: '#4b4b48', share: 0.14 }, { c: '#8c6a51', share: 0.08 }, { c: '#e8e0d0', share: 0.06 },
    ] },
    fillType: 'rock', depthIn: 2.5, tonsPerCuYd: 1.4,
    matches: '1 1/2 in Salt & Pepper (California Landscape Supply)', maker: 'California Landscape Supply', line: 'Salt & Pepper', shelf: 'Rock', color: '1 1/2 in',
  }),
];

/* ---- Moss rock by weight -------------------------------------------- */

/**
 * Moss rock is weathered fieldstone (granite and sandstone run about 160 to 170 lb a cubic foot, 2.6 to 2.7 g/cm3): 165
 * lb a cubic foot, the stone filling about half the box it fits in (a rounded block sits between an ellipsoid, 0.52 of
 * its box, and the box). Yards sell it by the pound, so a size is set from a weight: `ratio` is the rock's length, depth
 * and whole height (buried part included) as shares of its length; `buried` the share of that height below the ground.
 */
export const MOSS_LB_PER_CUFT = 165;
const FILL = 0.5;

/** [length, depth, height that shows], inches, of a moss rock of `lb` at these proportions. */
export function mossSizeIn(lb: number, ratio: [number, number, number], buried: number): [number, number, number] {
  const n = Math.cbrt((lb * 1728) / (FILL * MOSS_LB_PER_CUFT * ratio[0] * ratio[1] * ratio[2]));
  return [n * ratio[0], n * ratio[1], n * ratio[2] * (1 - buried)];
}

/** A moss rock's weight, lb, from its [length, depth, height that shows] (m) at a buried share. */
export function mossWeightLb(size: [number, number, number], buried: number): number {
  const cuIn = (size[0] / IN) * (size[1] / IN) * (size[2] / IN / (1 - buried));
  return (cuIn * FILL * MOSS_LB_PER_CUFT) / 1728;
}

const sizesByWeight = (lbs: number[], ratio: [number, number, number], buried: number, name: (lb: number) => string): FeatureSize[] => lbs.map((lb) => {
  const [l, d, h] = mossSizeIn(lb, ratio, buried).map(Math.round);
  return { label: `${name(lb)}, about ${l} x ${d} x ${h} in`, size: [l * IN, d * IN, h * IN] };
});

/** Border stones lie flatter and are set a quarter into the bed; boulders a fifth. */
export const BORDER_STONE_RATIO: [number, number, number] = [1, 0.78, 0.62];
export const BORDER_BURIED = 0.25;
export const GARDEN_BOULDER_RATIO: [number, number, number] = [1, 0.82, 0.8];
export const SHOWPIECE_RATIO: [number, number, number] = [0.8, 0.5, 1.2];
export const BOULDER_BURIED = 0.2;

const lbs = (lb: number) => `${lb.toLocaleString('en-US')} lb`;
export const DOUBLE_HEAD_SIZES = sizesByWeight([10, 20, 30, 50, 80], BORDER_STONE_RATIO, BORDER_BURIED, lbs);
export const GARDEN_BOULDER_SIZES = sizesByWeight([50, 100, 200, 300], GARDEN_BOULDER_RATIO, BOULDER_BURIED, lbs);
export const SHOWPIECE_SIZES = sizesByWeight([800, 1000, 1200, 1500], SHOWPIECE_RATIO, BOULDER_BURIED, lbs);

const weightFacts = [
  'Sizes are set from the weight: moss rock is about 165 lb a cubic foot, the stone filling about half the box it fits in (an estimate; yards sell it by the pound)',
  'Length x depth x the height that shows',
  'Moss and lichen can be switched off for clean stone',
];

export const GROUND_ROCK_FEATURES: FeatureSpec[] = [
  F({
    id: 'moss-rock-double-head', name: 'Moss rock, double-head', group: 'Accents', kind: 'mossRock',
    footprint: DOUBLE_HEAD_SIZES[2].size.slice(0, 2) as [number, number], sizes: DOUBLE_HEAD_SIZES, size: 2,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'A double-head moss rock: a border stone about twice the size of a head, low and rounded, set a quarter into the bed. Tan-gray weathered stones and dark gray-green ones crusted with lichen and moss, as they edge a dry creek. Sold by the pound (California Landscape Supply moss rock; Resource Building Materials moss rock boulder, head size).',
    facts: [...weightFacts, 'A designer\'s dry creek border called for 1 to 30 lb stones; the stones set on that job run about 9 to 15 in (15 to 80 lb)', `Set a quarter into the bed`],
  }),
  F({
    id: 'moss-rock-garden-boulder', name: 'Moss rock garden boulder', group: 'Accents', kind: 'mossRock',
    footprint: GARDEN_BOULDER_SIZES[2].size.slice(0, 2) as [number, number], sizes: GARDEN_BOULDER_SIZES, size: 2,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'A moss rock garden boulder, 50 to 300 lb: a rounded, weathered block in light tan-gray with dark crust lichen, set a fifth into a bed. The 200 lb size is the small end of Resource Building Materials\' "Moss Rock Boulder, medium size, approx. 200 - 400 lbs".',
    facts: [...weightFacts, 'Set a fifth into the ground'],
  }),
  F({
    id: 'moss-rock-showpiece-boulder', name: 'Moss rock showpiece boulder', group: 'Accents', kind: 'mossRock',
    footprint: SHOWPIECE_SIZES[1].size.slice(0, 2) as [number, number], sizes: SHOWPIECE_SIZES, size: 1,
    options: [{ key: 'moss', label: 'Moss and lichen', default: true }],
    about: 'A showpiece boulder, 800 to 1,500 lb: a tall, slab-like weathered stone standing on end as the focal point at an entry, light tan-gray with beige patches and dark crust lichen, set in a group with garden boulders at its foot. Set by machine.',
    facts: [...weightFacts, 'Stands taller than it is wide; set a fifth into the ground'],
  }),
];

/* ---- Rock border along a line ---------------------------------------- */

/**
 * A border of stones laid along an edging line (builder/rockborder.ts): one at a time down the run, each a weight from
 * `lb` (more of the middle weights), turned roughly along the line, a gap of `gapIn` between neighbors, wandering
 * `wanderIn` either side of it, and now and then a smaller stone tucked beside a big one (`pairs`, a share of stones).
 */
export interface RockBorderSpec {
  /** The feature whose stones these are (its looks): 'moss-rock-double-head'. */
  stone: string;
  lb: [number, number];
  gapIn: [number, number];
  wanderIn: number;
  pairs: number;
}

/**
 * About how many stones a border takes a linear foot, and their weight (lb): the middle weight's stone and the middle
 * gap, with the tucked-in smaller stones (`pairs`, about a third of the weight of the stone they sit by).
 */
export function rockBorderPerFoot(B: RockBorderSpec): { stones: number; lb: number } {
  const lb = (B.lb[0] + B.lb[1]) / 2;
  const each = mossSizeIn(lb, BORDER_STONE_RATIO, BORDER_BURIED)[0] + (B.gapIn[0] + B.gapIn[1]) / 2;
  const per = 12 / each;
  return { stones: per * (1 + B.pairs), lb: per * lb * (1 + B.pairs * 0.35) };
}

const DOUBLE_HEAD_BORDER: RockBorderSpec = { stone: 'moss-rock-double-head', lb: [15, 80], gapIn: [1, 7], wanderIn: 3, pairs: 0.15 };

export const ROCK_BORDER_MATERIALS: MaterialSpec[] = [
  // Double-head moss rock laid as a dry creek's edge: the stones a designer specs at "1 - 30 lbs" set as Green Lion set
  // them on that job (the video): 9 to 15 in stones, about 15 to 80 lb, a few inches apart, wandering a little off the line.
  M({
    id: 'moss-rock-border-double-head', name: 'Moss rock border, double-head', use: 'edging', group: 'Edging', recipe: 'cobble',
    palette: ['#a2978a', '#7e7870', '#5d5b57', '#454a4b'],
    rockBorder: DOUBLE_HEAD_BORDER,
    matches: 'Moss rock, double-head, laid as a border (California Landscape Supply moss rock by the pound)', maker: 'California Landscape Supply', line: 'Moss rock border', shelf: 'Rock border', color: 'Double-head',
  }),
];

/** Notes for the material panel (siteplan/material-info.ts), by id. */
export const GROUND_ROCK_NOTES: Record<string, { about: string; spec: string[] }> = {
  'siteone-small-decorative-bark': {
    about: 'Small decorative bark from SiteOne, sold in bulk by the yard: flat red-brown bark nuggets 3/8 to 1 1/2 in with a few splinters of paler wood. A neat, fine-textured bed cover that holds moisture and keeps weeds down.',
    spec: ['3 in deep, raked even and watered in', 'Kept 2 to 3 in back from stems and trunks', 'Steel edging where it meets rock or lawn', 'Top up about 1 in a year'],
  },
  'noiya-cobble-2-4': {
    about: 'Noiya river cobble, 2 x 4 in (California Landscape Supply; also sold as Noiyo or Noya): smooth, matte, rounded stones in cream, gray, blue-gray, tan and charcoal. The classic dry creek bed and a low-water bed cover that never needs replacing.',
    spec: ['About 3 in deep, one to two stones', 'Over commercial weed fabric', 'About 1.3 tons a cubic yard', 'Held by edging along lawns and paths'],
  },
  'noiya-cobble-4-8': {
    about: 'Noiya river cobble, 4 x 8 in (California Landscape Supply): the big rounded stones, in the same cream, gray, blue-gray and tan blend. For the bottom and banks of a dry creek, under trees where nothing grows and along a street edge.',
    spec: ['About 5 in deep, one stone', 'Over commercial weed fabric', 'About 1.3 tons a cubic yard', 'Steel edging along walks'],
  },
  'noiya-cobble-dry-creek-mix': {
    about: 'A dry creek bed of Noiya cobble mixed about 3 to 1: 2 x 4 in stones with 4 x 8 in stones scattered through them, as a creek leaves them. Usually edged with double-head moss rock.',
    spec: ['About 75% 2 x 4 in and 25% 4 x 8 in, mixed in the bed', 'About 4 in deep, the bed dished a little toward its middle', 'Over commercial weed fabric', 'About 1.3 tons a cubic yard'],
  },
  'noiyo-pebble-1-1-2': {
    about: 'Noiyo pebble, 1 1/2 in (GreenWaste\'s 1 1/2 x 1 in Noiyo): smooth matte river pebble in olive and blue-gray, tan, beige and charcoal. A decorative ground cover between plants and stepping stones.',
    spec: ['2 1/2 to 3 in deep, flush with the paving next to it', 'Over commercial weed fabric', 'Steel edging where it meets bark or lawn'],
  },
  'salt-and-pepper-1-1-2': {
    about: 'Salt & Pepper pebble, 1 1/2 in (California Landscape Supply): mixed river pebble in white and cream, tan, grays and charcoal, a few rust-brown. A bright, speckled ground cover; the "Black-N-White" a design calls for.',
    spec: ['2 1/2 to 3 in deep, flush with the paving next to it', 'Over commercial weed fabric', 'Steel edging where it meets bark or lawn'],
  },
  'moss-rock-border-double-head': {
    about: 'A border of double-head moss rock laid along a line: tan-gray and dark lichen-crusted stones 9 to 15 in long, set a quarter into the bed a few inches apart, the classic edge of a dry creek bed.',
    spec: [
      `About 15 to 80 lb a stone, about ${rockBorderPerFoot(DOUBLE_HEAD_BORDER).stones.toFixed(1)} stones a linear foot`,
      'Set a quarter into the bed, on weed fabric under the cobble',
      `Sold by the pound (moss rock): about ${Math.round(rockBorderPerFoot(DOUBLE_HEAD_BORDER).lb)} lb a linear foot`,
    ],
  },
};
