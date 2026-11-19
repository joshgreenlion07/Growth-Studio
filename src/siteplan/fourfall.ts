import type { FeatureSize } from './decor';

/*
 * The four-fall rock waterfall (builder/fourfall/): a 12 ft front with all its rockwork inside it, four falls, 7 to 8 ft
 * tall, the lowest level 5 to 6 ft front to back and each of the three upper levels 3 to 5 ft. Its plan outline is the
 * rockwork plus the planted soil it brings with it: 3.2 ft past each side and the back slope behind the top stones.
 *
 * A placement's `size` is [outline width, outline depth, height] in meters, like every feature that comes in sizes; the
 * level depths are read back from the outline depth (each half-foot pair gives a different depth). Its `position` is the
 * middle of that outline, as for every feature, with the front of the rockwork on the outline's front edge.
 *
 * The size math repeats `waterfallSize()` in builder/fourfall/waterfall-feature.js (this folder stays free of three.js);
 * builder/fourfall.ts checks the two agree.
 */

export const FT = 0.3048;
/** Front width of the rockwork, feet. */
export const FOUR_FALL_WIDTH = 12;
/** How far the planted soil runs behind the top stones (the module's default backSlope), feet. */
export const FOUR_FALL_BACK_SLOPE = 4.5;
/** Planted soil past each side and behind the back slope (waterfallSize's soilBeside and soilBehind), feet. */
export const FOUR_FALL_SOIL_BESIDE = 3.2;
export const FOUR_FALL_SOIL_BEHIND = FOUR_FALL_BACK_SLOPE + 0.8;

export interface FourFallParams {
  /** Patio level to the top head stone, feet (7 to 8). */
  height: number;
  /** Lowest level front to back, feet (5 to 6). */
  lowest: number;
  /** Each upper level front to back, feet (3 to 5). */
  level: number;
}

export const FOUR_FALL_DEFAULT: FourFallParams = { height: 7.5, lowest: 5.5, level: 3 };

/** Rockwork depth front to back, feet (waterfallSize().depth). */
export function fourFallDepthFt(p: FourFallParams): number {
  const head = 1.5 + (p.level - 3) * 0.25;
  return p.lowest + 3 * p.level + head;
}

/** The plan outline, feet: rockwork plus soil, [width, depth]. The rockwork's front is the outline's front edge. */
export function fourFallOutlineFt(p: FourFallParams): [number, number] {
  return [FOUR_FALL_WIDTH + 2 * FOUR_FALL_SOIL_BESIDE, fourFallDepthFt(p) + FOUR_FALL_SOIL_BEHIND];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ftText = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

/** The placement size for a set of choices: [outline width, outline depth, height], meters. */
export function fourFallSize(p: FourFallParams): [number, number, number] {
  const [w, d] = fourFallOutlineFt(p);
  return [r3(w * FT), r3(d * FT), r3(p.height * FT)];
}

/**
 * The choices offered (Area Planner shows at most 20 sizes in one list): each height with six level layouts, from the
 * shortest run (5 ft lowest, 3 ft levels) to the longest (6 ft lowest, 5 ft levels).
 */
const LEVELS: [number, number][] = [[5, 3], [5.5, 3], [6, 3], [5.5, 4], [6, 4], [6, 5]];
const HEIGHTS = [7, 7.5, 8];
export const FOUR_FALL_CHOICES: FourFallParams[] = HEIGHTS.flatMap((height) => LEVELS.map(([lowest, level]) => ({ height, lowest, level })));
export const FOUR_FALL_SIZES: FeatureSize[] = FOUR_FALL_CHOICES.map((p) => ({
  label: `${ftText(p.height)} ft tall, ${ftText(p.lowest)} ft base, ${ftText(p.level)} ft levels`,
  size: fourFallSize(p),
}));
export const FOUR_FALL_DEFAULT_SIZE = FOUR_FALL_CHOICES.findIndex((p) => p.height === FOUR_FALL_DEFAULT.height && p.lowest === FOUR_FALL_DEFAULT.lowest && p.level === FOUR_FALL_DEFAULT.level);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * The choices a placement's size stands for. The height is read directly (kept to 7 to 8 ft, quarter feet); the two
 * level depths are the half-foot steps (lowest 5 to 6, levels 3 to 5) whose outline depth is nearest the size's depth,
 * so any of those steps can be set, not only the ones listed. No size: the default.
 */
export function fourFallParams(size?: [number, number, number]): FourFallParams {
  if (!size) return { ...FOUR_FALL_DEFAULT };
  const height = clamp(Math.round((size[2] / FT) * 4) / 4, 7, 8);
  const want = size[1] / FT;
  let best = { ...FOUR_FALL_DEFAULT, height }, err = Infinity;
  for (let lowest = 5; lowest <= 6.001; lowest += 0.5) {
    for (let level = 3; level <= 5.001; level += 0.5) {
      const e = Math.abs(fourFallOutlineFt({ height, lowest, level })[1] - want);
      if (e < err - 1e-9) {
        err = e;
        best = { height, lowest, level };
      }
    }
  }
  return best;
}
