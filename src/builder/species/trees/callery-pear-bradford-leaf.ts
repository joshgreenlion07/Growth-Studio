import type { SpeciesBuilder } from '../kit';
import { buildPear } from './callery-pear-bradford';

/**
 * Flowering pear, Pyrus calleryana 'Bradford', in summer leaf: the same tree as `callery-pear-bradford` (see that file
 * for the form and the references), with its glossy dark green leaves full grown and no flowers.
 */
export const build: SpeciesBuilder = (spec) => buildPear(spec, false);
