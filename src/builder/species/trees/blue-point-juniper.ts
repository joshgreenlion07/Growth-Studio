import { smoothstep, type SpeciesBuilder } from '../kit';
import { buildUpright, fibrousBark } from './shared-conifers';

/**
 * Blue Point juniper, Juniperus chinensis 'Blue Point': a dense, broad
 * teardrop branched to the ground, blue-green scale and awl foliage, with a
 * slightly shaggy outline of upswept spray tips.
 */
export const build: SpeciesBuilder = (spec) =>
  buildUpright(spec, {
    pal: { key: 'bluepoint', dark: '#25332c', mid: '#3a4f45', light: '#566f63', tip: '#7f978b', stem: '#6a4a36' },
    style: { angle: 0.55, cord: 4.2, spacing: 24, sweep: 0.4, gaps: 0.18, awl: 0.5 },
    profile: (t) => (t < 0.2 ? 0.72 + 0.28 * smoothstep(0, 0.2, t) : Math.pow(1 - Math.pow((t - 0.2) / 0.8, 1.45), 0.9)),
    branches: 380,
    rise: [0.3, 0.85],
    twigsPerM: 7,
    twigLen: 0.4,
    cardsPerM: 9,
    cardLen: [0.2, 0.32],
    cardAspect: 0.6,
    upright: 0.42,
    shag: 0.6,
    core: 0.55,
    trunkR: 0.07,
    clear: 0.06,
    tintInner: '#8d978f',
    tintOuter: '#ffffff',
    bark: fibrousBark('juniper', '#6b5446', '#3d2c22', '#9c8672'),
    look: { bend: 0.1 },
  });
