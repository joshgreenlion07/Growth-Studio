import type { MossRockForm, MossRockLook } from './mossrock';

/*
 * The moss rock of a customer job's finished front yard (2026 video, clear late-morning sun), for the boulders and border
 * stones of siteplan/groundrock.ts, drawn in fine detail by builder/mossrock.ts. The boulders are a light tan-gray,
 * weathered smooth, speckled, with beige patches and small dark crust lichen; the border stones are that tan-gray, a
 * paler buff-tan, and (about a quarter) dark gray-green crusted with pale lichen and a little moss. Colors are the
 * stone's own (before the rock's shading), set so the rocks render at the tones measured from the video's sunlit faces.
 * Each look's rind is the weathered skin, its breaks the same stone a little warmer and lighter where it split. The
 * colors of a look stay close together: a wide range shows as dark round blotches a hand across, and two of them side
 * by side on a big face read as eyes.
 */

/** Light tan-gray moss rock (border stones): dark crust lichen in small patches, a few beige ones. */
export const MOSS_TAN_GRAY: MossRockLook = {
  rind: ['#5c5348', '#564d42', '#62584b', '#51493f', '#665b4d'],
  breakFace: ['#665948', '#605343', '#6a5c4b', '#5c4f40', '#6e5f4c'],
  iron: ['#94744f', '#5a4632'],
  ironAmount: 0.3,
  pore: '#221e1b',
  lichen: ['#a39c88', '#8a8778', '#3a3b35', '#9a6a3a'],
  moss: ['#4d5230', '#3c4226'],
  soil: '#4a3a2c',
  paleCrust: -0.1,
  darkCrust: 1.6,
  orangeDots: 0.3,
  mossCover: -0.04,
  porous: 0.6,
};

/** The garden and showpiece boulders: the same stone in bigger pieces, more weathered, with more dark crust lichen. */
export const MOSS_BOULDER: MossRockLook = {
  rind: ['#534b42', '#4c453c', '#585046', '#484239', '#5d5347'],
  breakFace: ['#5d5245', '#574c40', '#615548', '#52483c', '#655849'],
  iron: ['#94744f', '#5a4632'],
  ironAmount: 0.25,
  pore: '#1f1b18',
  lichen: ['#9c9584', '#858273', '#34352f', '#9a6a3a'],
  moss: ['#4d5230', '#3c4226'],
  soil: '#4a3a2c',
  paleCrust: -0.08,
  darkCrust: 2.2,
  orangeDots: 0.25,
  mossCover: -0.04,
  porous: 0.2,
};

/** Buff-tan moss rock, the palest of the border stones. */
export const MOSS_BUFF: MossRockLook = {
  rind: ['#7b6b56', '#746550', '#80705a', '#6e5f4b', '#84735d'],
  breakFace: ['#837159', '#7c6a53', '#88765d', '#76654e', '#8b795f'],
  iron: ['#94744f', '#5a4632'],
  ironAmount: 0.25,
  pore: '#2d261f',
  lichen: ['#b6af99', '#9d9a89', '#4a4a42', '#9a6a3a'],
  moss: ['#4d5230', '#3c4226'],
  soil: '#4a3a2c',
  paleCrust: -0.14,
  darkCrust: 1.1,
  orangeDots: 0.25,
  mossCover: -0.04,
  porous: 0.6,
};

/** Dark gray-green moss rock crusted with pale lichen (some of the border stones), a little more moss. */
export const MOSS_DARK_LICHEN: MossRockLook = {
  rind: ['#403d38', '#3c3934', '#43403a', '#383631'],
  breakFace: ['#48443d', '#44403a', '#4c4840', '#413d37'],
  iron: ['#8a6a4a', '#4a3828'],
  ironAmount: 0.15,
  pore: '#171614',
  lichen: ['#8e9282', '#7c7f74', '#2c2c2a', '#8a6a4a'],
  moss: ['#4d5230', '#3c4226'],
  soil: '#4a3a2c',
  paleCrust: 0.06,
  darkCrust: 0.6,
  orangeDots: 0.2,
  mossCover: 0.03,
  porous: 0.8,
};

/** The moss rock shape each sold-by-weight piece takes: border stones and garden boulders rounded, a showpiece on end. */
export const DOUBLE_HEAD_FORM: MossRockForm = 'rounded';
export const GARDEN_BOULDER_FORM: MossRockForm = 'rounded';
export const SHOWPIECE_FORM: MossRockForm = 'tall';

/** A border stone's look: about a quarter dark and lichen-crusted, the rest tan-gray and buff. `h` is a number in [0, 1). */
export const borderLook = (h: number): MossRockLook => (h < 0.28 ? MOSS_DARK_LICHEN : h < 0.64 ? MOSS_TAN_GRAY : MOSS_BUFF);
