import type { SpeciesBuilder } from '../kit';
import { buildBoxwood } from './shared-shrubs-a-boxwood';

/** Buxus microphylla var. japonica 'Winter Gem', sheared into a formal hedge unit. */
export const build: SpeciesBuilder = (spec) => buildBoxwood(spec, true);
