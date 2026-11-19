import type { RockLook, RockShape } from './stonegeo';

/*
 * The moss rock of a customer job's finished front yard (2026 video, clear late-morning sun), for the boulders and border
 * stones of siteplan/groundrock.ts. The boulders are a light tan-gray, weathered smooth, speckled, with beige patches
 * and small dark crust lichen; the border stones are that tan-gray, a paler buff-tan, and (about a quarter) dark
 * gray-green crusted with pale lichen and a little moss. Colors are the stone's own (before the rock's shading), set so
 * the rocks render at the tones measured from the video's sunlit faces.
 */

/** Light tan-gray moss rock (border stones). */
export const MOSS_TAN_GRAY: RockLook = {
  stone: ['#776b5d', '#655b4e', '#877967', '#574f45', '#94826c'],
  streak: '#3a3530',
  soil: '#4a3a2c',
  lichen: '#3a3b35',
  lichenAmount: 0.5,
  rust: '#94744f',
  rustAmount: 0.12,
  moss: ['#4d5230', '#3c4226'],
  mossAmount: 0.06,
};

/** The garden and showpiece boulders: the same stone in bigger pieces, more weathered, with more dark crust lichen. */
export const MOSS_BOULDER: RockLook = {
  stone: ['#6b6157', '#594f46', '#7a6e60', '#4d463e', '#877765'],
  streak: '#35302b',
  soil: '#4a3a2c',
  lichen: '#34352f',
  lichenAmount: 0.8,
  rust: '#94744f',
  rustAmount: 0.1,
  moss: ['#4d5230', '#3c4226'],
  mossAmount: 0.06,
};

/** Buff-tan moss rock, the palest of the border stones. */
export const MOSS_BUFF: RockLook = {
  stone: ['#a08c70', '#8b7860', '#ae997c', '#7a6851', '#baa384'],
  streak: '#584c3f',
  soil: '#4a3a2c',
  lichen: '#4a4a42',
  lichenAmount: 0.35,
  rust: '#94744f',
  rustAmount: 0.1,
  moss: ['#4d5230', '#3c4226'],
  mossAmount: 0.06,
};

/** Dark gray-green moss rock crusted with pale lichen (some of the border stones). */
export const MOSS_DARK_LICHEN: RockLook = {
  stone: ['#55514a', '#49463f', '#5f5a52', '#403d38'],
  streak: '#2c2c2a',
  soil: '#4a3a2c',
  lichen: '#7c7f74',
  lichenAmount: 0.55,
  rust: '#8a6a4a',
  rustAmount: 0.05,
  moss: ['#4d5230', '#3c4226'],
  mossAmount: 0.15,
};

/** A border stone: low, rounded, a few worn breaks. */
export const BORDER_STONE: RockShape = { squareness: 3.0, cuts: 5, cutDepth: [0.76, 0.93], edge: 0.07, flatTop: [0.78, 0.06], lump: 0.05, rough: 0.025, pocket: 0.05, lean: 5 };
/** A garden boulder: a weathered block worn smooth, its breaks soft. */
export const GARDEN_BOULDER: RockShape = { squareness: 2.9, cuts: 7, cutDepth: [0.66, 0.9], edge: 0.05, lump: 0.05, rough: 0.03, pocket: 0.03, lean: 4 };
/** A showpiece: a tall stone on end, broken along a few long planes. */
export const SHOWPIECE: RockShape = { squareness: 3.0, cuts: 8, cutDepth: [0.6, 0.86], edge: 0.04, lump: 0.06, rough: 0.03, pocket: 0.03, lean: 8 };

/** A border stone's look: about a quarter dark and lichen-crusted, the rest tan-gray and buff. `h` is a number in [0, 1). */
export const borderLook = (h: number): RockLook => (h < 0.28 ? MOSS_DARK_LICHEN : h < 0.64 ? MOSS_TAN_GRAY : MOSS_BUFF);
