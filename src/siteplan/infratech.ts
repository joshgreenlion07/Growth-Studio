import type { FeatureSpec } from './catalog';
import type { FeatureSize } from './decor';

/*
 * Infratech W and WD series electric infrared heaters, as Infratech publishes them:
 *
 *   [S1] W-Series Heater CAD Drawing, Aug 1 2024 (W and WD share the housing):
 *        https://www.infratech.com/wp-content/uploads/2026/10/W-Series-Heater-CAD-Drawing.pdf
 *   [S2] W/WD Series Installation, Use & Care Manual IN038 (2024), p. 4-6:
 *        https://www.infratech.com/wp-content/uploads/2026/10/IN038_W-series_instructions_prod_jul24.pdf
 *   [S3] W / WD series product page: https://www.infratech.com/heaters/wd-series/
 *   [S4] Getting Started chart ("WIDTH: 8.19""): https://www.infratech.com/wp-content/uploads/2026/10/IN999_gettingstarted_chart_012825_dj.pdf
 *   [S6] Color chips: https://www.infratech.com/wp-content/uploads/2026/10/IN999_colorchips_02-03-25_dj.pdf
 *
 * The housing, every model [S1, S2]: 8 3/16 in across the face, 3 in deep from the face to the flat back, the face
 * 9 3/8 in from the ceiling (or wall) on the standard swivel brackets, whose feet are 6 in wide with a 1 in flange; a
 * 4 x 2 in junction box on the back, its top 5 3/8 in from the face, its knock-out 4 7/8 in from one end. Lengths are
 * printed only as 33, 39, 48 and 61 1/4 in [S1, S3]. A W has one quartz element, a WD two [S1, S3]; elements glow
 * "visibly orange" [S2]. Weights are not published by Infratech; the ones given are dealer listings (Flame Authority).
 *
 * Finishes [S3, S6]: brushed 304 stainless, or one of eight standard powder coats baked over it. On a colored heater
 * the housing, end plates and brackets are coated while the polished end bands, the badge, the reflector and the wire
 * guard stay bright metal; on Black the end bands are black too and the name is printed white on them (Infratech's
 * finish photos). The swatch colors are Infratech's chip fills [S6].
 *
 * Built by builder/decor/infratech.ts. The heater hangs from the roof of the cover it is under (else 9 ft), its face
 * tilted 30 degrees toward the placement's front, the most Infratech allows on a ceiling [S2].
 */

const IN = 0.0254;

/** One W or WD model [S1 table, S2 p. 5-6]: length A, watts, volts, amps, heat area (average, ft), mounting height (ft). */
export interface InfratechModel {
  model: string;
  dual: boolean;
  lengthIn: number;
  watts: number;
  volts: number;
  amps: number;
  /** Average heat coverage, ft [S2 p. 6]. */
  areaFt: [number, number];
  /** Recommended mounting height, ft [S2 p. 6]. */
  mountFt: [number, number];
  /** Dealer listing weight, lb (Infratech publishes none). */
  lb: number;
}

export const INFRATECH_MODELS: InfratechModel[] = [
  { model: 'W-1512', dual: false, lengthIn: 33, watts: 1500, volts: 120, amps: 12.5, areaFt: [5, 5], mountFt: [6, 7], lb: 12 },
  { model: 'W-2024', dual: false, lengthIn: 39, watts: 2000, volts: 240, amps: 8.3, areaFt: [6, 6], mountFt: [7, 8], lb: 13 },
  { model: 'W-2624', dual: false, lengthIn: 48, watts: 2600, volts: 240, amps: 10.8, areaFt: [7, 8], mountFt: [7, 8], lb: 13 },
  { model: 'W-3024', dual: false, lengthIn: 61.25, watts: 3000, volts: 240, amps: 12.5, areaFt: [8, 8], mountFt: [7, 9], lb: 20 },
  { model: 'W-4024', dual: false, lengthIn: 61.25, watts: 4000, volts: 240, amps: 16.7, areaFt: [10, 10], mountFt: [8, 10], lb: 20 },
  { model: 'WD-3024', dual: true, lengthIn: 33, watts: 3000, volts: 240, amps: 12.5, areaFt: [7, 7], mountFt: [7, 8], lb: 13 },
  { model: 'WD-4024', dual: true, lengthIn: 39, watts: 4000, volts: 240, amps: 16.7, areaFt: [8, 10], mountFt: [8, 10], lb: 14 },
  { model: 'WD-5224', dual: true, lengthIn: 48, watts: 5200, volts: 240, amps: 21.6, areaFt: [10, 10], mountFt: [8, 10], lb: 14 },
  { model: 'WD-6024', dual: true, lengthIn: 61.25, watts: 6000, volts: 240, amps: 25, areaFt: [11, 11], mountFt: [8, 12], lb: 21 },
];

/** The housing [S1, S2], inches. */
export const INFRATECH_HOUSING = {
  /** Across the face (8 3/16 in). */
  faceIn: 8.1875,
  /** Face to the flat back. */
  depthIn: 3,
  /** Face to the ceiling on the standard swivel brackets. */
  mountIn: 9.375,
  /** The bracket feet: width and flange. */
  footIn: 6,
  flangeIn: 1,
  /** Junction box: along the heater, across, its top from the face, the knock-out from the end. */
  box: { lengthIn: 4, acrossIn: 2, topIn: 5.375, koFromEndIn: 4.875 },
  /** Ceiling mounts tilt at most 30 degrees [S2]. */
  tiltDeg: 30,
};

/** Infratech's four lengths [S1]: one size each; the WD option picks single or dual element. */
const LENGTHS: { lengthIn: number; label: string }[] = [
  { lengthIn: 33, label: '33 in (W-1512 / WD-3024)' },
  { lengthIn: 39, label: '39 in (W-2024 / WD-4024)' },
  { lengthIn: 48, label: '48 in (W-2624 / WD-5224)' },
  { lengthIn: 61.25, label: '61 1/4 in (W-3024, W-4024 / WD-6024)' },
];
export const INFRATECH_SIZES: FeatureSize[] = LENGTHS.map(({ lengthIn, label }) => ({ label, size: [lengthIn * IN, INFRATECH_HOUSING.faceIn * IN, INFRATECH_HOUSING.mountIn * IN] }));

/** The model a placed heater is: its length (the nearest of the four) and single or dual element. */
export function infratechModel(lengthM: number, dual: boolean): InfratechModel {
  const L = lengthM / IN;
  const len = LENGTHS.reduce((b, x) => (Math.abs(x.lengthIn - L) < Math.abs(b - L) ? x.lengthIn : b), 39);
  // At 61 1/4 in a single-element heater is the W-4024 (4000 W) or W-3024 (3000 W): the same housing. Drawn as the W-4024.
  const list = INFRATECH_MODELS.filter((m) => m.lengthIn === len && m.dual === dual);
  return list[list.length - 1];
}

export type InfratechFinishId = 'stainless' | 'white' | 'biscuit' | 'almond' | 'beige' | 'grey' | 'copper' | 'bronze' | 'black';

/** Infratech's finishes [S3, S6]: name, the chip color (sRGB), and the dealer order suffix. */
export const INFRATECH_FINISHES: { id: InfratechFinishId; name: string; chip: string; suffix: string }[] = [
  { id: 'stainless', name: 'Brushed stainless', chip: '#b6b6b6', suffix: 'SS' },
  { id: 'white', name: 'White', chip: '#f9faf9', suffix: 'WH' },
  { id: 'biscuit', name: 'Biscuit', chip: '#d9d9d7', suffix: 'BI' },
  { id: 'almond', name: 'Almond', chip: '#d6d2c5', suffix: 'AL' },
  { id: 'beige', name: 'Beige', chip: '#babab0', suffix: 'BE' },
  { id: 'grey', name: 'Grey', chip: '#707271', suffix: 'GR' },
  { id: 'copper', name: 'Copper', chip: '#85422c', suffix: 'CP' },
  { id: 'bronze', name: 'Bronze', chip: '#5e5047', suffix: 'BR' },
  { id: 'black', name: 'Black', chip: '#2d2a26', suffix: 'BL' },
];
export const infratechFinish = (id: string | undefined) => INFRATECH_FINISHES.find((f) => f.id === id) ?? INFRATECH_FINISHES[0];
/** A heater feature's finish, from its id (`infratech-heater-39` is the stainless one). */
export const infratechFinishOf = (featureId: string) => infratechFinish(featureId.replace(/^infratech-heater-/, ''));

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });
const ft = (a: [number, number]) => `${a[0]} x ${a[1]} ft`;

/**
 * One feature a finish. The brushed stainless one keeps the id the first (39 in WD-4024) heater was saved with, so
 * saved plans load as before: 39 in, dual element.
 */
export const INFRATECH_FEATURES: FeatureSpec[] = INFRATECH_FINISHES.map((fin) => F({
  id: fin.id === 'stainless' ? 'infratech-heater-39' : `infratech-heater-${fin.id}`,
  name: `Infratech W / WD series heater, ${fin.name.toLowerCase()}`,
  group: 'Shade',
  kind: 'patioHeater',
  footprint: [39 * IN, INFRATECH_HOUSING.faceIn * IN],
  sizes: INFRATECH_SIZES,
  size: 1,
  maker: 'Infratech',
  page: 'https://www.infratech.com/heaters/wd-series/',
  options: [
    { key: 'dual', label: 'Dual element (WD series); off: single element (W series)', default: true },
    { key: 'on', label: 'Heater on (elements glowing orange)', default: false },
  ],
  about: `An Infratech W or WD series electric infrared heater in ${fin.name.toLowerCase()}${fin.id === 'stainless' ? ' (304)' : ' powder coat baked over 304 stainless'}, hung on its swivel brackets under the patio roof: a trapezoid housing 8 3/16 in across the face and 3 in deep, a faceted mirror reflector, one (W) or two (WD) quartz elements that glow orange behind a wire guard, ${fin.id === 'black' ? 'black end bands with the INFRATECH name printed in white' : 'polished end bands and the polished INFRATECH badge on the left end'}, and a junction box on the back. The 39 in dual-element WD-4024 is the default.`,
  facts: [
    'Lengths 33, 39, 48 and 61 1/4 in; every model 8 3/16 in across the face, 3 in deep, 9 3/8 in from the ceiling on the swivel brackets (feet 6 in wide) (Infratech W-Series CAD drawing)',
    ...INFRATECH_MODELS.map((m) => `${m.model}: ${m.lengthIn === 61.25 ? '61 1/4' : m.lengthIn} in, ${m.dual ? 'two elements' : 'one element'}, ${m.watts} W, ${m.volts} V, ${m.amps} A; heats about ${ft(m.areaFt)}; mount ${m.mountFt[0]}-${m.mountFt[1]} ft up${m.model === 'W-3024' ? ' (same housing as the W-4024)' : ''}`),
    `Finish: ${fin.name} (order suffix ${fin.suffix}); also stainless, White, Biscuit, Almond, Beige, Grey, Copper, Bronze, Black`,
    'Clearances to combustibles 18 in at the sides and ends and 36 in in front; on a ceiling at least 6 in below it and 18 in from walls, tilted up to 30 degrees; at least 6 ft above the floor (IN038 manual)',
    'Weights 12 to 21 lb (dealer listings; Infratech publishes none)',
    'Hung from the roof of the cover it is under (9 ft without one), tilted 30 degrees toward its front',
    'Hand tool: switch the heater on or off',
  ],
}));
