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
