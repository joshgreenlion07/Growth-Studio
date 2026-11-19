import type { SpeciesBuilder } from '../kit';
import type { VerbenaPalette } from './shared-verbena';
import { tapienBuilder } from './verbena-tapien-blue';

/**
 * Verbena 'Tapien Purple' (Suntory's 'Suntapipa', US PP18,963), a trailing
 * Tapien verbena, in bloom.
 *
 * The same low, dense, spreading mat as 'Tapien Blue Violet' (see
 * verbena-tapien-blue.ts, whose builder this shares): thin square stems trail
 * out from the crown and turn up at the tips, with opposite pairs of deeply
 * cut, fern-like mid-green leaves, and nearly every shoot ends in a rounded
 * head of small five-lobed florets. Tapien Purple's florets are a vivid
 * purple (RHS N81A, Purple-Violet group: redder than Blue Violet's 83B),
 * paler on the back, with a tiny purplish-white eye; the leaves run a little
 * larger than Blue Violet's.
 *
 * References and the numbers they give:
 * - US Plant Patent PP18,963, Verbena plant named 'Suntapipa'
 *   (patents.google.com/patent/USPP18963): creeping, 5.6 cm tall and 38.8 cm
 *   across at about four months in a 13.5 cm pot, about 48 trailing side
 *   shoots; leaves opposite, pinnately parted, serrate, 3.6 x 2.5 cm, RHS 137A
 *   above, 138B below; heads hemispherical, 4.6 cm across, 3.3 cm tall, about
 *   15 florets 1.6 cm across; corolla upper side RHS N81A, lower N81C; throat
 *   near white (155C); blooms spring to late autumn.
 * - CFIA Plant Breeders' Rights, 'Suntapipa' (Tapien Purple)
 *   (active.inspection.gc.ca, crop report ver/app00006431): 8.6 cm tall,
 *   creeping; leaf 25.6 mm long, light to medium green; heads 3.4 cm across;
 *   florets 15.0 mm, N81A, a very small purplish-white eye.
 * - Proven Winners and Devil Mountain Nursery (Tapien series): 3 to 7 in
 *   tall, 1 to 3 ft wide, late spring to frost; sold in 4 in and 1 gal.
 * - The job video (a finished front yard, early April): a 1 gal plant at the
 *   edge of a cobble creek, its heads a bright magenta-purple.
 * Size used: installed from a 1 gal at 0.08 m tall x 0.25 m wide; 0.15 m
 * (6 in) tall x 0.75 m (2.5 ft) wide in one season.
 */

/** RHS N81A purple: a red-violet that reads magenta-purple in sun, the backs paler (N81C), a tiny pale eye. */
const PURPLE: VerbenaPalette = {
  lobes: ['#86289c', '#8e2ca4', '#7c2494', '#9634aa'],
  deep: '#4c0c66',
  light: '#a85cc4',
  vein: 'rgba(60,6,80,0.45)',
  eye: 'rgba(222,196,232,0.9)',
  eyeR: 0.07,
  throat: '#30063e',
  buds: ['#5c1a78', '#6c2a80'],
};

export const build: SpeciesBuilder = tapienBuilder(PURPLE, 'gc-verbena-tapien-purple-flowers', 1.12);
