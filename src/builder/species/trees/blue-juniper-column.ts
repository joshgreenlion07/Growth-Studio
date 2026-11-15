import { type SpeciesBuilder } from '../kit';
import { buildUpright, fibrousBark } from './shared-conifers';

/**
 * Blue Arrow juniper, Juniperus scopulorum 'Blue Arrow': a very tight, narrow
 * column of silvery powder-blue scale foliage on upright branches that hug
 * the trunk, clothed to the ground.
 */
export const build: SpeciesBuilder = (spec) =>
  buildUpright(spec, {
    pal: { key: 'bluearrow', dark: '#2c3d42', mid: '#48626b', light: '#6a8791', tip: '#93adb6', stem: '#6a4a36' },
    style: { angle: 0.45, cord: 4.0, spacing: 22, sweep: 0.55, gaps: 0.15, awl: 0.25 },
    profile: (t) => Math.min(1, 0.7 + t * 2.4) * Math.pow(1 - Math.pow(t, 3), 0.75),
    branches: 420,
    rise: [0.35, 0.9],
    twigsPerM: 6,
    twigLen: 0.12,
    cardsPerM: 14,
    cardLen: [0.12, 0.2],
    cardAspect: 0.55,
    upright: 0.84,
    shag: 0.1,
    core: 0.5,
    trunkR: 0.05,
    clear: 0.05,
    tintInner: '#8e989a',
    tintOuter: '#ffffff',
    bark: fibrousBark('juniper', '#6b5446', '#3d2c22', '#9c8672'),
    look: { bend: 0.12 },
  });
