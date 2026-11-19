/**
 * Basalite Concrete Products lines, from basalite.com (California region, 11/2026). Color names are Basalite's.
 *
 * Premier Slab: "smooth cleanlined paver", one size, 24 x 24: 594 mm W x 594 mm L x 60 mm H (23 1/2 x 23 1/2 in x 60 mm),
 * square arrises, with small spacer nubs on the sides that set the joint (Basalite's dimension drawing). 32 units and
 * 123 sq ft per pallet, 3442 lb. Five colors, every one a clouded blend: two or three tones drifting through the face
 * in soft streaks (Basalite's swatch photos), drawn with the 'cloud' blend. "Available by special order only in some
 * regions."
 *
 * The four colors per entry are read from Basalite's full-size swatch photos (120 px, 12 px inset, linear light): the
 * mean of the lightest quarter of the pixels, the warmest quarter, the coolest quarter and the darkest quarter, light to
 * dark. A blend of tan and gray streaks keeps its two hues this way (plain 4-means splits it by lightness only and
 * averages the tan and the gray together); the four tones average to within 2% of the photo's mean. No Basalite image
 * ships with the app.
 */
export interface BasaliteLine {
  slug: string;
  name: string;
  /** Piece face size and joint, inches: the 594 mm slab with its spacer joint (about 4 mm). */
  size: [number, number];
  joint: number;
  /** Joint sand as Basalite's swatch photos show it: light gray with dark grains. */
  jointSand: string;
  /** Thickness, meters. */
  thickness: number;
  colors: [string, string[]][];
}

export const BASALITE_LINES: BasaliteLine[] = [
  { slug: 'premier-slab', name: 'Premier Slab', size: [23.5, 23.5], joint: 0.16, jointSand: '#cdc9c1', thickness: 0.06, colors: [
    ['Midnight Terrace', ['#bdb9b0', '#a49888', '#979691', '#8c857b']],
    ['Bodega Dunes', ['#c8c9cc', '#c1bbb5', '#a6aab2', '#a3a5a9']],
    ['Oceanside', ['#dddede', '#d3d2d1', '#ced1d4', '#c9cacb']],
    ['Positano', ['#b7b5b1', '#b2aba2', '#a6a8a9', '#9f9e9c']],
    ['Torino', ['#b4b7bb', '#a9adb2', '#a5a6aa', '#8c8f95']],
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
