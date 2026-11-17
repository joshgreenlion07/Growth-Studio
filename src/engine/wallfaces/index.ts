import type { UnitFace } from '../../siteplan/catalog';
import { ashlar } from './ashlar';
import { chiseled } from './chiseled';
import { lamina } from './lamina';
import { papyrus } from './papyrus';
import { tumbled } from './tumbled';
import { tumbledRough } from './tumbledRough';
import type { WallFaceRecipe } from './types';

export type { WallFaceRecipe, WallSample, WallTexel } from './types';

/** The maker wall faces with a recipe of their own (see UnitFace in the catalog). */
export const WALL_FACES: Record<UnitFace, WallFaceRecipe> = { tumbled, tumbledRough, ashlar, lamina, chiseled, papyrus };
