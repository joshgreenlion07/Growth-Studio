import { type SpeciesBuilder } from '../kit';
import { buildUpright, fibrousBark } from './shared-conifers';

/**
 * Italian cypress, Cupressus sempervirens 'Stricta': a very narrow, dense,
 * dark green column with a pointed top. Branches leave the trunk and turn
 * straight up, carrying upright flattened sprays of tiny scale leaves.
 */
export const build: SpeciesBuilder = (spec) =>
  buildUpright(spec, {
    pal: { key: 'cypress', dark: '#131d11', mid: '#1f3119', light: '#2d4423', tip: '#3d572d', stem: '#5a4632' },
    style: { angle: 0.5, cord: 4.4, spacing: 24, sweep: 0.55, gaps: 0.15 },
    profile: (t) => Math.min(1, 0.62 + t * 3.2) * Math.pow(1 - Math.pow(t, 3.4), 0.72),
    branches: 300,
    rise: [1.0, 2.2],
    twigsPerM: 4,
    twigLen: 0.3,
    cardsPerM: 8,
    cardLen: [0.24, 0.38],
    cardAspect: 0.55,
    upright: 0.72,
    shag: 0.25,
    core: 0.5,
    trunkR: 0.14,
    clear: 0.25,
    tintInner: '#8f9a88',
    tintOuter: '#ffffff',
    bark: fibrousBark('cypress', '#6e6257', '#3f352c', '#9a8f80'),
  });
