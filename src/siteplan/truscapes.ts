import type { FeatureSpec } from './catalog';
import type { FixtureSetting } from './types';

/**
 * Tru-Scapes low-voltage landscape lighting (tru-scapes.com, Bucks County, PA), the line Green Lion installs on
 * nearly every job. Each fixture is drawn to the maker's spec sheet (sizes in inches) and lights the yard at night
 * with its published lumens, beam angle and color temperature (builder/landscapelights.ts, engine/landlights.ts).
 * Values the maker does not publish are read from its product photos and marked so.
 */

export type FinishId = 'black' | 'bronze' | 'brown' | 'white' | 'gray' | 'stainless';

export interface FixtureFinish {
  name: string;
  /** The maker's order code. */
  code: string;
  color: string;
  roughness: number;
  metalness: number;
}

/** Finishes as the maker names them, drawn as matte powder coats or brushed steel. */
export const FIXTURE_FINISHES: Record<FinishId, FixtureFinish> = {
  black: { name: 'Black powder coat', code: 'BLK', color: '#19191a', roughness: 0.55, metalness: 0.15 },
  bronze: { name: 'Antique brushed bronze', code: 'BRZ', color: '#3b2f27', roughness: 0.48, metalness: 0.55 },
  brown: { name: 'Brown', code: 'BWN', color: '#4a3a2e', roughness: 0.6, metalness: 0.05 },
  white: { name: 'White', code: 'WHT', color: '#e9e8e4', roughness: 0.5, metalness: 0.0 },
  gray: { name: 'Gray', code: 'GRY', color: '#7c7f82', roughness: 0.45, metalness: 0.35 },
  stainless: { name: 'Stainless steel', code: 'SS', color: '#babdc0', roughness: 0.3, metalness: 1.0 },
};

export type FixtureCategory = 'Path lights' | 'Accent lights' | 'Well lights' | 'Wash lights' | 'Hardscape lights' | 'Step lights' | 'Paver lights' | 'Dot lights' | 'Transformers';

export type FixtureFamily =
  | 'bullet'
  | 'flood'
  | 'wash'
  | 'pathHat'
  | 'pathClassic'
  | 'pathModernRound'
  | 'pathModernSquare'
  | 'well'
  | 'hardscape'
  | 'riser'
  | 'paver'
  | 'dot'
  | 'puck'
  | 'walkwayWash'
  | 'transformer';

export interface FixtureSpec {
  maker: 'Tru-Scapes';
  /** Model number without the finish suffix, e.g. 'TS-B301'. */
  model: string;
  /** The maker's product name. */
  series: string;
  category: FixtureCategory;
  /** The geometry builder in builder/landscapelights.ts. */
  family: FixtureFamily;
  /** stake: on its ground stake; grade: set in the ground; cap: under a wall cap; face: in or on a vertical face; wall: on a wall or post. */
  mount: 'stake' | 'grade' | 'cap' | 'face' | 'wall';
  /** Sizes for the builder, inches (see each builder for the keys); range is meters. */
  dims: Record<string, number>;
  /** Finishes offered; the first is the default. */
  finishes: FinishId[];
  /** Light output, lumens (0 for a transformer). */
  lumens: number;
  kelvin: number;
  kelvins?: number[];
  /** An RGBCW lamp: besides its whites it can be set to any RGB color. */
  rgb?: boolean;
  /** Beam angle, degrees (360 published for path lights is drawn as a wide downward spread under the hat). */
  beamDeg: number;
  beams?: number[];
  /** Default aim for an adjustable head, degrees from straight up toward the front. */
  tiltDeg: number;
  watts: number;
  /** Lamp as shipped. */
  lamp: string;
  construction: string;
  page: string;
  /** Size as the maker states it. */
  size: string;
  /** Facts for the material panel (filled from the fields above). */
  facts: string[];
  /** Footprint for the plan editor, meters. */
  footprint: [number, number];
}

const PAGE = 'https://tru-scapes.com/product/';
const BB: FinishId[] = ['black', 'bronze'];
const COLOR_K = [2700, 3000, 4000, 5000, 6500];
const BRASS = 'Heavy-duty solid brass';
const ALU = 'Powder-coated aluminum';
const STAKE = "8 in heavy-duty ground stake";
const S = (m: number): [number, number] => [m, m];

/**
 * The line, in the order Green Lion uses it: path lights, up and accent lights, well lights, then wall, cap, step,
 * paver and dot lights, and the transformers. Sizes from each spec sheet's dimension drawing and the 2026 product
 * guide; lumens from the 2026 guide (newest) where sources differ. "Photo" marks a size read from product photos.
 */
export const TRUSCAPES: FixtureSpec[] = [
  /* Path lights */
  {
    maker: 'Tru-Scapes', model: 'TS-B301', series: 'Traditional Path Light', category: 'Path lights', family: 'pathHat', mount: 'stake',
    // 23-1/8 in overall with about an inch of stem in the stake; 6-1/8 in hat. Head parts from the photo.
    dims: { height: 22.1, stemD: 0.85, hatD: 6.125, hatH: 1.6, collarD: 2.1, collarH: 0.6, cupD: 2.1, cupH: 0.9, spread: 150 },
    finishes: BB, lumens: 190, kelvin: 2700, beamDeg: 360, tiltDeg: 0, watts: 3,
    lamp: 'G4 3 W 2700 K LED lamp, 190 lumens (included)', construction: BRASS,
    page: `${PAGE}traditional-path-light-ts-b301/`, size: '23-1/8 in tall, 6-1/8 in hat, 17 in stem', footprint: S(0.16), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B302', series: 'Classic Path Light', category: 'Path lights', family: 'pathClassic', mount: 'stake',
    dims: { height: 22.25, stemD: 1.0, hatD: 7.875, hatH: 2.0, bodyTopD: 1.9, bodyBotD: 1.0, bodyH: 1.9, finialD: 1.6, finialH: 0.65, spread: 150 },
    finishes: BB, lumens: 158, kelvin: 2700, beamDeg: 360, tiltDeg: 0, watts: 3,
    lamp: 'G4 3 W 2700 K LED lamp, 158 lumens (included)', construction: BRASS,
    page: `${PAGE}classic-path-light-ts-b302/`, size: '23-1/4 in tall, 7-7/8 in hat', footprint: S(0.2), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B306', series: 'Modern Path Light', category: 'Path lights', family: 'pathModernRound', mount: 'stake',
    dims: { height: 20.75, tube: 1.0, arm: 6.5, lensD: 0.8, spread: 130 },
    finishes: BB, lumens: 96, kelvin: 2700, beamDeg: 360, tiltDeg: 0, watts: 3,
    lamp: 'G4 3 W 2700 K LED lamp, 96 lumens (included)', construction: BRASS,
    page: `${PAGE}modern-path-light-ts-b306/`, size: '21-3/4 in tall, 6-1/2 in arm, 1 in round post', footprint: [0.05, 0.17], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B308', series: 'Modern Edge Path Light', category: 'Path lights', family: 'pathModernSquare', mount: 'stake',
    dims: { height: 21, tube: 1.25, arm: 6, lensD: 0.9, spread: 120 },
    finishes: BB, lumens: 215, kelvin: 2700, beamDeg: 120, tiltDeg: 0, watts: 3,
    lamp: 'Single-sided G4 3 W 2700 K LED lamp, 215 lumens (included)', construction: BRASS,
    page: `${PAGE}modern-path-light-ts-b308/`, size: '22 in tall, 6 in arm, 1-1/4 in square post', footprint: [0.05, 0.16], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-A6500C', series: 'Adjustable Walkway Wash Light', category: 'Path lights', family: 'walkwayWash', mount: 'stake',
    dims: { length: 7.125, headH: 3.5, headD: 1.5, legH: 0.75 },
    finishes: BB, lumens: 68, kelvin: 2700, kelvins: COLOR_K, rgb: true, beamDeg: 120, tiltDeg: 0, watts: 2,
    lamp: 'Replaceable Bluetooth RGBCW LED module (2700-6500 K), 68 lumens', construction: `${ALU}, 5 in stainless spikes`,
    page: `${PAGE}adjustable-walkway-wash-light-ts-a6500c/`, size: '7 in wide x 8-1/2 in tall x 1-1/2 in deep', footprint: [0.18, 0.05], facts: [],
  },

  /* Up and accent lights */
  {
    maker: 'Tru-Scapes', model: 'TS-B102', series: 'Traditional Accent Light', category: 'Accent lights', family: 'bullet', mount: 'stake',
    // 6-5/8 in long, 2-3/8 in body, knuckle 2-1/4 in above the stake; the bevel spans about 1-1/2 in on its long side.
    dims: { bodyD: 2.375, bodyL: 4.9, shroudLong: 1.75, shroudShort: 0.35, riser: 1.5, taper: 0.78 },
    finishes: BB, lumens: 382, kelvin: 2700, beamDeg: 40, beams: [40, 60], tiltDeg: 20, watts: 4,
    lamp: 'MR16 4 W 2700 K 40 degree LED lamp, 382 lumens (included); 5.5 W 60 degree lamp offered', construction: 'Solid die-cast brass',
    page: `${PAGE}traditional-accent-light-ts-b102/`, size: '6-5/8 in long, 2-3/8 in body', footprint: S(0.08), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B105', series: 'Wall Wash Light', category: 'Wash lights', family: 'wash', mount: 'stake',
    // Oval face 4-3/8 x 2-1/2 in, 5 in long, knuckle 1-5/8 in.
    dims: { headD: 4.375, faceH: 2.5, headL: 3.6, hoodLong: 1.4, hoodShort: 0.2, riser: 1.0 },
    finishes: BB, lumens: 383, kelvin: 2700, beamDeg: 60, beams: [60, 40], tiltDeg: 30, watts: 5.5,
    lamp: 'MR16 5.5 W 2700 K 60 degree LED lamp, 383 lumens (included)', construction: 'Heavy-duty die-cast brass',
    page: `${PAGE}wall-wash-light-ts-b105/`, size: '5 in long, 4-3/8 x 2-1/2 in oval face', footprint: S(0.12), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B106', series: 'High Power Accent Light', category: 'Accent lights', family: 'flood', mount: 'stake',
    dims: { headD: 4.625, headL: 4.0, hoodLong: 1.4, hoodShort: 0.25, riser: 1.6 },
    finishes: BB, lumens: 435, kelvin: 2700, beamDeg: 120, tiltDeg: 20, watts: 8,
    lamp: 'PAR36 8 W 2700 K 120 degree LED lamp, 435 lumens (included)', construction: 'Heavy-duty die-cast brass',
    page: `${PAGE}high-power-accent-light-ts-b106/`, size: '5-3/8 in long, 4-5/8 in can', footprint: S(0.13), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-A100C', series: 'Smart Integrated Accent Light', category: 'Accent lights', family: 'bullet', mount: 'stake',
    dims: { bodyD: 2.875, bodyL: 5.3, shroudLong: 1.45, shroudShort: 0.45, riser: 1.8, taper: 0.92, fins: 1 },
    finishes: BB, lumens: 980, kelvin: 2700, kelvins: COLOR_K, rgb: true, beamDeg: 36, tiltDeg: 15, watts: 16,
    lamp: 'Integrated Bluetooth RGBCW COB LED (2700-6500 K), 980 lumens', construction: 'Die-cast aluminum with a finned heat sink',
    page: `${PAGE}smart-integrated-accent-light/`, size: '6-3/4 in long, 2-7/8 in face, 7 in tall', footprint: S(0.1), facts: [],
  },

  /* Well lights */
  {
    maker: 'Tru-Scapes', model: 'TS-B201', series: 'High Power In-Ground Well Light', category: 'Well lights', family: 'well', mount: 'grade',
    dims: { flangeD: 5.5, lensD: 4.4, depth: 9.625, eyelid: 0 },
    finishes: BB, lumens: 560, kelvin: 2700, beamDeg: 120, tiltDeg: 0, watts: 8,
    lamp: 'PAR36 8 W 2700 K 120 degree LED lamp, 560 lumens (included), aimable in a brass gimbal', construction: 'PVC can, solid brass gimbal and flat top ring',
    page: `${PAGE}high-power-in-ground-well-light-ts-b201/`, size: '5-1/2 in top ring, 9-5/8 in deep', footprint: S(0.14), facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-B203', series: 'Sealed In-Ground Well Light', category: 'Well lights', family: 'well', mount: 'grade',
    dims: { flangeD: 4.0, lensD: 2.9, depth: 6.875, eyelid: 1.6, eyelidShort: 0.2 },
    finishes: BB, lumens: 308, kelvin: 2700, beamDeg: 60, beams: [60, 40], tiltDeg: 8, watts: 4,
    lamp: 'MR16 4 W 2700 K 60 degree LED lamp, 308 lumens (included)', construction: 'Brass half-cowl shroud on a sealed PVC housing',
    page: `${PAGE}sealed-in-ground-well-light-ts-b203/`, size: '4 in top, 6-7/8 in deep, half-cowl shroud', footprint: S(0.1), facts: [],
  },

  /* Hardscape (wall cap) lights */
  {
    maker: 'Tru-Scapes', model: 'TS-A6000', series: 'Traditional Hardscape Light', category: 'Hardscape lights', family: 'hardscape', mount: 'cap',
    dims: { length: 7.125, plateD: 3, plateT: 0.09, headH: 0.875, headD: 0.75, leds: 12 },
    finishes: BB, lumens: 85, kelvin: 2700, beamDeg: 120, tiltDeg: 0, watts: 1,
    lamp: 'Replaceable 2700 K LED module, 1 W, 85 lumens', construction: `${ALU}, aluminum bracket`,
    page: `${PAGE}traditional-hardscape-light-ts-a6000/`, size: '7-1/8 in wide x 7/8 in tall face, 3 in plate', footprint: [0.18, 0.08], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-A6000C', series: 'Color Changing Hardscape Light', category: 'Hardscape lights', family: 'hardscape', mount: 'cap',
    dims: { length: 7.125, plateD: 3, plateT: 0.09, headH: 0.875, headD: 0.75, leds: 12 },
    finishes: BB, lumens: 68, kelvin: 2700, kelvins: COLOR_K, rgb: true, beamDeg: 120, tiltDeg: 0, watts: 2,
    lamp: 'Replaceable Bluetooth RGBCW LED module (2700-6500 K), 68 lumens', construction: ALU,
    page: `${PAGE}color-changing-hardscape-light-ts-a6000c/`, size: '7-1/8 in wide x 7/8 in tall face, 3 in plate', footprint: [0.18, 0.08], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-MA6000', series: 'Modern Hardscape Light', category: 'Hardscape lights', family: 'hardscape', mount: 'cap',
    dims: { length: 7.125, plateD: 3, plateT: 0.09, headH: 0.875, headD: 0.75, leds: 8 },
    finishes: ['gray'], lumens: 92, kelvin: 4000, beamDeg: 120, tiltDeg: 0, watts: 1,
    lamp: 'Replaceable 4000 K LED module (8 SMD LEDs), 1 W, 92 lumens', construction: ALU,
    page: `${PAGE}modern-hardscape-light-ts-ma6000gry/`, size: '7.1 x 3.0 x 0.8 in', footprint: [0.18, 0.08], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-A3000C', series: 'Mini Color Changing Cap Wall Light', category: 'Hardscape lights', family: 'hardscape', mount: 'cap',
    dims: { length: 3.5, plateD: 3, plateT: 0.09, headH: 0.875, headD: 0.75, leds: 2 },
    finishes: ['black'], lumens: 18, kelvin: 2700, kelvins: COLOR_K, rgb: true, beamDeg: 120, tiltDeg: 0, watts: 0.8,
    lamp: 'Replaceable Bluetooth RGBCW LED module (2700-6500 K), 18 lumens', construction: ALU,
    page: `${PAGE}color-changing-cap-wall-hardscape-light-a3000c/`, size: '3-1/2 in wide x 7/8 in tall face, 3 in plate', footprint: [0.09, 0.08], facts: [],
  },

  /* Step and riser lights */
  {
    maker: 'Tru-Scapes', model: 'TS-A501', series: '3 in LED Deck Step Riser Light', category: 'Step lights', family: 'riser', mount: 'face',
    dims: { length: 3.5, height: 0.625, depth: 0.5, leds: 1 },
    finishes: ['black', 'brown', 'white'], lumens: 18, kelvin: 2700, beamDeg: 180, tiltDeg: 0, watts: 0.5,
    lamp: 'Integrated 2700 K LEDs, 0.5 W, 18 lumens', construction: ALU,
    page: `${PAGE}tru-scapes-3-led-deck-step-riser-light-ts-a501/`, size: '3-1/2 x 5/8 x 1/2 in', footprint: [0.09, 0.02], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-A1001', series: '6 in LED Deck Step Riser Light', category: 'Step lights', family: 'riser', mount: 'face',
    dims: { length: 6, height: 0.625, depth: 0.5, leds: 4 },
    finishes: ['black', 'brown', 'white'], lumens: 123, kelvin: 2700, beamDeg: 180, tiltDeg: 0, watts: 1.5,
    lamp: '4 integrated 2700 K LEDs, 1.5 W, 123 lumens', construction: ALU,
    page: `${PAGE}tru-scapes-6-led-deck-step-riser-light-ts-a1001/`, size: '6 x 5/8 x 1/2 in', footprint: [0.15, 0.02], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-25WMA', series: '2.5 in LED Slim Puck Light', category: 'Step lights', family: 'puck', mount: 'face',
    dims: { faceD: 2.5, depth: 0.75 },
    finishes: ['black', 'brown', 'white'], lumens: 44, kelvin: 2700, beamDeg: 180, tiltDeg: 0, watts: 2,
    lamp: 'Integrated 2700 K LEDs, 44 lumens', construction: ALU,
    page: `${PAGE}tru-scapes-2-5-led-slim-puck-light-ts-25wma/`, size: '2-1/2 in round x 3/4 in, eyebrow hood', footprint: [0.065, 0.02], facts: [],
  },

  /* Paver lights: set between pavers in the soldier or sailor course, the lens flush with the paving. */
  ...([6, 8, 9] as const).map((len, i): FixtureSpec => ({
    maker: 'Tru-Scapes', model: `TS-HPL-${len}`, series: `${len} in Paver Light`, category: 'Paver lights', family: 'paver', mount: 'grade',
    dims: { length: len, width: 0.75, height: 2.375, foot: 2 },
    finishes: ['black'], lumens: [26, 44, 52][i], kelvin: 2700, beamDeg: 120, tiltDeg: 0, watts: [1.5, 1.8, 2.5][i],
    lamp: `Integrated CREE 2700 K LEDs, ${[26, 44, 52][i]} lumens`, construction: `${ALU} with an acrylic lens`,
    page: `${PAGE}${len}-paver-light-ts-hpl-${len}/`, size: `${len} in long, 3/4 in lens, 2-3/8 in tall (needs 60 mm pavers)`, footprint: [len * 0.0254, 0.02], facts: [],
  })),
  ...([6, 8, 9] as const).map((len, i): FixtureSpec => ({
    maker: 'Tru-Scapes', model: `TS-MHPL-${len}`, series: `${len} in Modern Paver Light`, category: 'Paver lights', family: 'paver', mount: 'grade',
    dims: { length: len, width: 0.75, height: 2.375, foot: 2 },
    finishes: ['gray'], lumens: [32, 52, 62][i], kelvin: 4000, beamDeg: 120, tiltDeg: 0, watts: [1.5, 1.8, 2.5][i],
    lamp: `Integrated CREE 4000 K LEDs, ${[32, 52, 62][i]} lumens`, construction: `${ALU} with an acrylic lens`,
    page: `${PAGE}${len}-paver-light-ts-mhpl-${len}/`, size: `${len} in long, 3/4 in lens, 2-3/8 in tall (needs 60 mm pavers)`, footprint: [len * 0.0254, 0.02], facts: [],
  })),

  /* Dot lights: in a core-drilled hole in pavers, stone, decking or a riser face. */
  {
    maker: 'Tru-Scapes', model: 'TS-15DOT-BRZ', series: 'Traditional 1.5 in Dot Light', category: 'Dot lights', family: 'dot', mount: 'grade',
    dims: { faceD: 1.5, lensD: 0.75, eyebrow: 0.75 },
    finishes: ['bronze'], lumens: 10, kelvin: 2700, beamDeg: 60, tiltDeg: 0, watts: 0.25,
    lamp: 'Integrated 2700 K LED, 10 lumens', construction: 'Sealed composite housing, anodized bronze ring and eyebrow',
    page: `${PAGE}traditional-dot-light-ts-15dot-brz-2/`, size: '1-1/2 in ring, 1-5/8 in tall body (1 in core hole)', footprint: [0.04, 0.04], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-25DOT-BRZ', series: 'Traditional 2.5 in Dot Light', category: 'Dot lights', family: 'dot', mount: 'grade',
    dims: { faceD: 2.5, lensD: 1.25, eyebrow: 0.75 },
    finishes: ['bronze'], lumens: 90, kelvin: 2700, beamDeg: 60, tiltDeg: 0, watts: 1.2,
    lamp: 'Integrated 2700 K LED, 90 lumens', construction: 'Sealed composite housing, anodized bronze ring and eyebrow',
    page: `${PAGE}traditional-dot-light-ts-25dot-brz/`, size: '2-1/2 in ring, 1-5/8 in tall body (2 in core hole)', footprint: [0.065, 0.065], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-M15DOT-SS', series: 'Modern 1.5 in Dot Light', category: 'Dot lights', family: 'dot', mount: 'grade',
    dims: { faceD: 1.5, lensD: 0.75, eyebrow: 0 },
    finishes: ['stainless'], lumens: 12, kelvin: 4000, beamDeg: 60, tiltDeg: 0, watts: 0.25,
    lamp: 'Integrated 4000 K LED, 12 lumens', construction: 'Sealed composite housing, 316 stainless steel ring',
    page: `${PAGE}traditional-dot-light-ts-15dot-brz/`, size: '1-1/2 in ring, 1-5/8 in tall body (1 in core hole)', footprint: [0.04, 0.04], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-M25DOT-SS', series: 'Modern 2.5 in Dot Light', category: 'Dot lights', family: 'dot', mount: 'grade',
    dims: { faceD: 2.5, lensD: 1.25, eyebrow: 0 },
    finishes: ['stainless'], lumens: 105, kelvin: 4000, beamDeg: 60, tiltDeg: 0, watts: 1.2,
    lamp: 'Integrated 4000 K LED, 105 lumens', construction: 'Sealed composite housing, 316 stainless steel ring',
    page: `${PAGE}modern-dot-light-ts-25dot-ss/`, size: '2-1/2 in ring, 1-5/8 in tall body (2 in core hole)', footprint: [0.065, 0.065], facts: [],
  },

  /* Transformers: mounted on a wall or post with the bottom at least a foot above grade. */
  {
    maker: 'Tru-Scapes', model: 'TS-TBPT-100', series: '100 W Standard Transformer', category: 'Transformers', family: 'transformer', mount: 'wall',
    dims: { height: 6.5, width: 4.5, depth: 3.5, plastic: 1 },
    finishes: ['black'], lumens: 0, kelvin: 2700, beamDeg: 0, tiltDeg: 0, watts: 100,
    lamp: '100 W, one zone, 12 V / 15 V AC taps, built-in timer, photocell compatible, 6 ft cord', construction: 'Black UV-rated plastic housing',
    page: `${PAGE}tru-scapes-100w-transformer/`, size: '6-1/2 in tall x 4-1/2 in wide x 3-1/2 in deep', footprint: [0.12, 0.09], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-TSSA-200', series: '200 W Astronomical Transformer', category: 'Transformers', family: 'transformer', mount: 'wall',
    dims: { height: 8, width: 5.5, depth: 4.5, timer: 1 },
    finishes: ['stainless'], lumens: 0, kelvin: 2700, beamDeg: 0, tiltDeg: 0, watts: 200,
    lamp: '200 W, one zone, 12 V / 15 V AC, astronomical digital timer and photocell mode, 6 ft cord', construction: 'Stainless steel housing',
    page: `${PAGE}tru-scapes-200w-transformer/`, size: '8 in tall x 5-1/2 in wide x 4-1/2 in deep', footprint: [0.14, 0.12], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-T300', series: '300 W Transformer', category: 'Transformers', family: 'transformer', mount: 'wall',
    dims: { height: 10, width: 6.5, depth: 5.5 },
    finishes: ['stainless'], lumens: 0, kelvin: 2700, beamDeg: 0, tiltDeg: 0, watts: 300,
    lamp: '300 W, 12 V / 15 V multi-tap, timer and photocell compatible', construction: 'Stainless steel housing',
    page: `${PAGE}tru-scapes-300w-transformer/`, size: '10 in tall x 6-1/2 in wide x 5-1/2 in deep', footprint: [0.17, 0.14], facts: [],
  },
  {
    maker: 'Tru-Scapes', model: 'TS-TSSW-400', series: '400 W WiFi Dual Zone Transformer', category: 'Transformers', family: 'transformer', mount: 'wall',
    dims: { height: 18.5, width: 5, depth: 4.5, app: 1 },
    finishes: ['stainless'], lumens: 0, kelvin: 2700, beamDeg: 0, tiltDeg: 0, watts: 400,
    lamp: '400 W, two 200 W zones, 12 V / 15 V AC, WiFi app timer, 6 ft cord', construction: 'Stainless steel housing',
    page: `${PAGE}tru-scapes-400w-transformer/`, size: '18-1/2 in tall x 5 in wide x 4-1/2 in deep', footprint: [0.13, 0.12], facts: [],
  },
];

const MOUNT_WORDS: Record<FixtureSpec['mount'], string> = {
  stake: STAKE,
  grade: 'Set in the ground or paving, lens at grade',
  cap: 'Slides under a wall cap or step tread',
  face: 'Mounts on a step riser or wall face',
  wall: 'Wall or post mount, bottom at least 1 ft above grade',
};

for (const fx of TRUSCAPES) {
  const light = fx.lumens > 0
    ? `${fx.lumens} lumens, ${fx.rgb ? '2700-6500 K white or RGB color (2700 K default)' : fx.kelvins ? '2700-6500 K color changing (2700 K default)' : `${fx.kelvin} K`}, ${fx.beamDeg === 360 ? '360 degree beam under the hat' : `${fx.beamDeg} degree beam`}${fx.beams && fx.beams.length > 1 ? ` (${fx.beams.join(' or ')} degree lamps)` : ''}`
    : `${fx.watts} W low-voltage transformer`;
  fx.facts = [fx.size, light, fx.lamp, `${fx.construction}; ${fx.finishes.map((f) => FIXTURE_FINISHES[f].name.toLowerCase()).join(' or ')}`, MOUNT_WORDS[fx.mount]];
}

/** The catalog entries for the line, in the Lighting group. */
export function truscapesFeatures(): Omit<FeatureSpec, 'placeholder'>[] {
  return TRUSCAPES.map((fx) => ({
    id: `truscapes-${fx.model.toLowerCase()}`,
    name: `Tru-Scapes ${fx.series} ${fx.model}`,
    group: 'Lighting',
    kind: 'landscapeLight',
    footprint: fx.footprint,
    maker: 'Tru-Scapes',
    page: fx.page,
    about: `Tru-Scapes ${fx.series} (${fx.model}): ${fx.construction}. ${fx.lamp}.`,
    facts: fx.facts,
    fixture: fx,
  }));
}

/**
 * The light colors offered for an RGBCW fixture in the editors (Area Planner keeps a copy as TS_LIGHT_COLORS): four
 * whites and six colors. Any other '#rrggbb' is a custom color.
 */
export const LIGHT_COLORS: { label: string; kelvin?: number; color?: string }[] = [
  { label: 'Warm white 2700 K', kelvin: 2700 },
  { label: 'Soft white 3000 K', kelvin: 3000 },
  { label: 'Cool white 4000 K', kelvin: 4000 },
  { label: 'Daylight 5000 K', kelvin: 5000 },
  { label: 'Red', color: '#ff2a1a' },
  { label: 'Amber', color: '#ffa31a' },
  { label: 'Green', color: '#22e04a' },
  { label: 'Blue', color: '#2a5cff' },
  { label: 'Purple', color: '#8a3dff' },
  { label: 'Pink', color: '#ff2ad0' },
];

/** A placement's options resolved against what the fixture offers. */
export function fixtureSetting(fx: FixtureSpec, s?: FixtureSetting): Required<Omit<FixtureSetting, 'mountHeight' | 'color'>> & { finish: FinishId; mountHeight?: number; color?: string } {
  const finish = (s?.finish && fx.finishes.includes(s.finish as FinishId) ? s.finish : fx.finishes[0]) as FinishId;
  const nearest = (list: number[] | undefined, v: number | undefined, d: number) =>
    v === undefined || !list?.length ? d : list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), list[0]);
  return {
    finish,
    beamDeg: nearest(fx.beams, s?.beamDeg, fx.beamDeg),
    kelvin: nearest(fx.kelvins, s?.kelvin, fx.kelvin),
    tiltDeg: Math.max(0, Math.min(fx.family === 'well' ? 20 : 90, s?.tiltDeg ?? fx.tiltDeg)),
    ...(s?.mountHeight !== undefined ? { mountHeight: Math.max(0, Math.min(4, s.mountHeight)) } : {}),
    // Only an RGBCW lamp takes a color; a white-only fixture keeps its kelvin.
    ...(fx.rgb && s?.color && cleanHex(s.color) ? { color: cleanHex(s.color)! } : {}),
  };
}

/** '#rgb' or '#rrggbb' (the '#' optional) as lowercase '#rrggbb', else null. */
export function cleanHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
}

/** Clean an incoming fixture setting: keep only numbers in range and choices the fixture offers. */
export function cleanFixtureSetting(fx: FixtureSpec, o: Record<string, unknown>): FixtureSetting | null {
  const out: FixtureSetting = {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : undefined);
  if (typeof o.finish === 'string') {
    const f = o.finish.toLowerCase();
    const hit = fx.finishes.find((id) => id === f || FIXTURE_FINISHES[id].code.toLowerCase() === f || FIXTURE_FINISHES[id].name.toLowerCase() === f);
    if (hit) out.finish = hit;
  }
  const beam = n(o.beamDeg);
  if (beam !== undefined && fx.beams?.length) out.beamDeg = fixtureSetting(fx, { beamDeg: beam }).beamDeg;
  const k = n(o.kelvin);
  if (k !== undefined && fx.kelvins?.length) out.kelvin = fixtureSetting(fx, { kelvin: k }).kelvin;
  const color = fx.rgb ? cleanHex(o.color) : null;
  if (color) out.color = color;
  const tilt = n(o.tiltDeg);
  if (tilt !== undefined) out.tiltDeg = Math.max(0, Math.min(90, tilt));
  const mh = n(o.mountHeight);
  if (mh !== undefined) out.mountHeight = Math.max(0, Math.min(4, mh));
  return Object.keys(out).length ? out : null;
}
