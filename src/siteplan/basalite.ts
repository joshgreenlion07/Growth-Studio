/**
 * Basalite Concrete Products lines, from basalite.com (California region, read for the Sacramento region, 11/2026).
 * Color names are Basalite's.
 *
 * Premier Slab 24 x 24 ("smooth cleanlined paver"), from its California page, cut sheet and pattern brochure: one size,
 * 594 mm W x 594 mm L x 60 mm H, laid on a 23.54 in module (the cut sheet's US size: the face plus the spacer nubs on
 * its sides, so a 0.15 in joint), a 3 mm chamfer, 106 lb; 32 units and 123 sq ft per pallet, 3442 lb; pedestrian use
 * only. "Available by special order only in some regions." Northern California colors: Positano, Torino, Bodega Dunes,
 * Oceanside and Midnight Terrace (no SeaScape for this line). Basalite's brochure gives three patterns: Running Bond,
 * Stacked Bond and 45 degree Running Bond.
 *
 * Colors read from Basalite's swatch photo of each color (800 px; the slabs laid at 45 degrees, so the photo is turned
 * 45 degrees before the joints are found and masked, 9 px each side, with a 14 px inset from the photo's edge), in
 * 4 x 4 px cells: five tone groups by k-means in CIELAB, each tone its group's mean in linear light, with the share of the
 * face it covers, laid by the face-mix painter (blend 'mix', as Premier Smooth) in long, narrow, soft streaks that fray
 * into fine dragged lines (`mixScale`, `mixEdge`). Basalite's install photos show the streaks running parallel to one
 * edge of each slab (its swatch photos are turned 45 degrees). Each color's tones are then scaled per channel so a
 * top-down render in the default light reads back that color's photo mean (the photos run a little cooler and the
 * renderer's tone curve compresses the lightest and darkest colors; before the correction Torino read 3 b* warmer and
 * Oceanside 4.5 L* darker, and Oceanside, the lightest, took a second pass). The joint sand is the light half of the
 * photos' joint pixels: light warm gray with dark grains. No Basalite image ships with the app.
 */
export interface BasaliteLine {
  slug: string;
  name: string;
  /** The slab's module (its face plus the spacer joint) and the joint, inches. */
  size: [number, number];
  /** The size it is sold and listed as, nominal inches (24 x 24), when the module differs. */
  sold?: [number, number];
  joint: number;
  /** The chamfer on the face's edges, meters. */
  chamfer: number;
  /** Joint sand as Basalite's swatch photos show it: light gray with dark grains. */
  jointSand: string;
  /** Thickness, meters. */
  thickness: number;
  /** Name, its tones (most of the face first), and how much of the face each covers. */
  colors: [string, string[], number[]][];
}

export const BASALITE_LINES: BasaliteLine[] = [
  { slug: 'premier-slab', name: 'Premier Slab', size: [23.54, 23.54], sold: [24, 24], joint: 0.15, chamfer: 0.003, jointSand: '#cfc8be', thickness: 0.06, colors: [
    ['Midnight Terrace', ['#b4b1a9', '#a59d92', '#938678', '#7c7b77', '#93908a'], [0.269, 0.263, 0.251, 0.111, 0.107]],
    ['Bodega Dunes', ['#c6c8d0', '#c1bcbc', '#b9bcc5', '#a6abb7', '#9096a3'], [0.369, 0.257, 0.191, 0.111, 0.073]],
    ['Oceanside', ['#e6ebf2', '#dfe6eb', '#ecf1f8', '#d5dee4', '#f4fbff'], [0.3, 0.253, 0.224, 0.116, 0.108]],
    ['Positano', ['#a3a4a4', '#aeafae', '#aba59f', '#9e9b98', '#939699'], [0.325, 0.242, 0.162, 0.154, 0.117]],
    ['Torino', ['#a2a6b0', '#969ca6', '#abb1bb', '#8a8f9a', '#7a7f89'], [0.323, 0.23, 0.205, 0.15, 0.091]],
  ] },
];

/**
 * Premier Smooth ("Pavers / Smooth"), from Basalite's California product page and its cut sheet (BA-CA 5/24/2024) and
 * pattern brochure, read for the Sacramento region (Northern California; made in Dixon, Tracy and Selma). 60 mm thick.
 *
 *   Sizes     nominal 6 x 12, 9 x 12, 12 x 12 (the 3-piece combo, sold only as a combo pallet: 96, 64 and 32 pieces,
 *             121.9 sq ft, one layer 12 + 8 + 4), the 12 x 18 (palletized separately, 64, 92 sq ft) and the 6 x 9
 *             border (280, 100 sq ft). Real faces 5.83 x 11.73, 8.78 x 11.73, 11.73 x 11.73, 11.73 x 17.64 and 5.83 x
 *             8.78 in; spacer nubs add 0.06 in (1.5 mm) each way, so the pieces lay out on an 11.79 in module for a
 *             nominal 12 (`module`), every size a whole number of 2.95 in steps.
 *   Colors    six face-mix blends: a base tone with drifts of three or four others through each piece, crisp with
 *             powdery edges (Basalite's swatch photos), and Charcoal, sold as the 6 x 9 border only. The field colors are
 *             also sold as the 6 x 9 border.
 *   Face      smooth: a fine, sandy matte paste with no texture pressed in, square arrises with a hairline chamfer.
 *
 * Colors read from Basalite's swatch photos of each color (3-piece combo pattern, top down, 800 px) with the joints
 * found and masked out (straight lines through the whole photo, 9 px each side) and a 12 px inset, in 4 x 4 px cells:
 * the cells split into five tone groups (k-means in CIELAB, so a mocha drift and a gray one of the same lightness stay
 * apart), each tone the group's mean in linear light, with the share of the face it covers. The face-mix painter
 * (blend 'mix') lays the tones at those shares, so a patio averages back to the photo (checked: a top-down render of
 * Midnight Terrace reads L* 68.1 against the photo's 68.3). Charcoal from Basalite's photo of the Premier Smooth border
 * (the course of 6 x 9 in front of the field, mean #636363); the cut sheet's printed swatch agrees to about 5%. The
 * joint sand is the light gray-tan of the photos' joints.
 */
export const PREMIER_SMOOTH = {
  slug: 'premier-smooth',
  name: 'Premier Smooth',
  /** Real module per nominal inch: 11.73 in faces + 0.06 in of spacer joint on a nominal 12. */
  module: 11.79 / 12,
  joint: 0.06,
  jointSand: '#cdc6bd',
  thickness: 0.06,
  /** The combo's three sizes and the 12 x 18, nominal inches. */
  sizes: [[6, 12], [9, 12], [12, 12], [12, 18]] as [number, number][],
  border: [6, 9] as [number, number],
  /** Name, its tones (most of the face first), and how much of the face each covers. */
  colors: [
    ['Positano', ['#bfb4a9', '#afaca8', '#c3c0ba', '#c7b2a0', '#999b9d'], [0.293, 0.241, 0.225, 0.142, 0.099]],
    ['Torino', ['#a0a4a7', '#95999e', '#abaeb1', '#8a8e93', '#7b8085'], [0.276, 0.251, 0.216, 0.17, 0.087]],
    ['Bodega Dunes', ['#bdbcbc', '#cfcdcc', '#a8a8a9', '#c0b2a9', '#8d9092'], [0.276, 0.26, 0.209, 0.156, 0.099]],
    ['Midnight Terrace', ['#c2baae', '#b2a495', '#a9a59c', '#a4917e', '#8f8d86'], [0.311, 0.223, 0.202, 0.162, 0.103]],
    ['Oceanside', ['#d3d5d4', '#c9cac8', '#dfe0e0', '#ecedee', '#bdbdbc'], [0.268, 0.227, 0.212, 0.195, 0.098]],
    ['SeaScape', ['#d3cec5', '#c8c1b8', '#bdb3a9', '#afa49a', '#9e9490'], [0.299, 0.256, 0.223, 0.162, 0.06]],
  ] as [string, string[], number[]][],
  /** Sold as the 6 x 9 border only. */
  // Charcoal is nearly even in the photo: a soft mottle a few percent either side of its mean.
  borderOnly: [['Charcoal', ['#636363', '#686868', '#5f5f5f', '#5b5b5b'], [0.45, 0.25, 0.2, 0.1]]] as [string, string[], number[]][],
};
