import type { SpeciesBuilder } from '../kit';
import { buildBoxwood } from './shared-shrubs-a-boxwood';

/** Buxus microphylla var. japonica 'Winter Gem', natural rounded form. */
export const build: SpeciesBuilder = (spec) => buildBoxwood(spec, false);
