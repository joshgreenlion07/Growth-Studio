/**
 * Composite deck boards, as their makers sell them (sizes and colors from the makers' own pages and swatch photos).
 * A deck zone whose look is one of these is built board by board (builder/deck.ts): picture frame, field pattern,
 * openings and fascia. Colors per entry are four tones read from the maker's swatch photo of the board face, light to
 * dark (sRGB as photographed; turned into albedo like any maker color). No maker image ships with the app.
 */

/** A deck board line's board: real dimensions (inches, feet) and how its face reads. */
export interface DeckBoardSpec {
  /** Face width, in (a nominal 1 x 6 board is 5 1/2 in). */
  widthIn: number;
  thicknessIn: number;
  /** Lengths sold, feet: the longest sets where butt joints fall. */
  lengthsFt: number[];
  /** Gap between boards side to side and at miters, in (the maker's minimum). */
  gapIn: number;
  /** Eased top edge, in: the small round-over that reads as a soft line between boards. */
  easeIn: number;
  /**
   * The face: 'streak' (several tones in long streaks along the board, as Trex Enhance Naturals), 'solid' (one tone with
   * an embossed grain, as Trex Enhance Basics).
   */
  grain: 'streak' | 'solid';
  /** How much one board's overall tone differs from the next (0.06 = +-3%). */
  boardTone: number;
  /** Fascia board: thickness and height, in, and how far the deck boards overhang its face, in. */
  fasciaIn: [number, number];
  fasciaOverIn: number;
}

export interface DeckLine {
  maker: string;
  name: string;
  slug: string;
  board: DeckBoardSpec;
  /** Color name, its four tones (light to dark), and the maker's swatch photo of it (shown live in the material panel only). */
  colors: [string, string[], string?][];
  /** Where it is sold, for the panel. */
  sold?: string;
  /** The maker's product page. */
  page?: string;
}

/** Defaults for a deck zone's layout when the plan leaves them out. */
export const DECK_DEFAULTS = {
  pattern: 'straight' as const,
  frame: true,
  /** Top of the boards above grade, meters, when a deck zone has no elevation: a low deck on sleepers (8 in). */
  height: 0.2032,
};

/**
 * Trex Enhance boards (trex.com Enhance specifications, 11/2026): 0.94 x 5.5 in, 12, 16 and 20 ft, grooved or square
 * edge, scalloped underside; 3/16 in minimum gap side to side. Trex fascia 0.56 x 7.25 in (1 x 8) or 0.56 x 11.375 in
 * (1 x 12), 12 ft, in all Enhance colors.
 */
const TREX_ENHANCE: DeckBoardSpec = {
  widthIn: 5.5,
  thicknessIn: 0.94,
  lengthsFt: [12, 16, 20],
  gapIn: 0.1875,
  easeIn: 0.09,
  grain: 'streak',
  boardTone: 0.06,
  fasciaIn: [0.56, 7.25],
  fasciaOverIn: 0.75,
};

/*
 * Colors: four tones per color, the means (in linear light) of the four brightness quarters of Trex's own color swatch
 * photo of the board face (images.trex.com, central 60% of the 400 px swatch or of the board in the 1600 px sample shot),
 * light to dark. Home Depot (homedepot.com, 11/2026) sells Enhance Naturals and Basics; in a San Jose store Rocky Harbor
 * was stocked (1 x 6 x 16 grooved, RH010616E2G01) and most other colors were special order or online only.
 * Trex's Enhance page (11/2026) lists ten colors: Naturals Foggy Wharf, Rocky Harbor, Toasted Sand, Honey Grove, Cinnamon Cove, Golden
 * Hour; Basics Saddle, Clam Shell, Tide Pool, Pebble Beach. Coastal Bluff and Beach Dune are no longer on it; they stay for plans that use them.
 */
/** Trex's image server (swatch photos, loaded live by the material panel; never copied into the app). */
const T = 'https://images.trex.com/is/image/trexcompany/';

export const DECK_LINES: DeckLine[] = [
  { maker: 'Trex', name: 'Enhance Naturals', slug: 'trex-enhance-naturals', board: TREX_ENHANCE, page: 'https://www.trex.com/products/decking/enhance/', sold: 'Home Depot, Lowe\'s, Trex dealers', colors: [
    ['Rocky Harbor', ['#afa69c', '#a39a90', '#9c9289', '#898077'], T + 'trex-enhance-naturals-decking-rocky-harbor-board-grain-detail-pattern-color-selector-3'],
    ['Foggy Wharf', ['#c2c4c0', '#b7bab6', '#aeb1ae', '#999c99'], T + 'trex-enhance-naturals-decking-foggy-wharf-board-grain-detail-pattern-color-selector-1'],
    ['Toasted Sand', ['#9e8167', '#92765d', '#886f57', '#735c46'], T + 'trex-enhance-naturals-decking-toasted-sand-board-grain-detail-pattern-color-selector-1'],
    ['Coastal Bluff', ['#938272', '#857464', '#7b6b5c', '#67594b'], T + 'trex-enhance-naturals-decking-coastal-bluff-board-grain-detail-pattern-color-selector-1'],
    ['Honey Grove', ['#af9a7f', '#a28e74', '#96836a', '#7d6b54'], T + 'enh-001-hg-decking-swatch-HY010608E2S56'],
    ['Cinnamon Cove', ['#8d6b5c', '#805f51', '#765546', '#614133'], T + 'enh-trex-002-cc-decking-swatch-CC0106202S01'],
    ['Golden Hour', ['#c9a17c', '#c09875', '#b58d6d', '#97745a'], T + 'enh-3halfinch-002-gh-square-swatch'],
  ] },
  { maker: 'Trex', name: 'Enhance Basics', slug: 'trex-enhance-basics', page: 'https://www.trex.com/products/decking/enhance/', board: { ...TREX_ENHANCE, grain: 'solid', boardTone: 0.04 }, sold: 'Home Depot, Lowe\'s, Trex dealers', colors: [
    ['Clam Shell', ['#7f7d77', '#72706b', '#6b6863', '#585550'], T + 'trex-enhance-basic-decking-clam-shell-board-grain-detail-pattern-color-selector-1'],
    ['Saddle', ['#977963', '#8b6d56', '#82644e', '#70533d'], T + 'trex-enhance-basic-decking-saddle-board-grain-detail-pattern-color-selector-1'],
    ['Beach Dune', ['#b28a69', '#a67e5c', '#9f7655', '#8a6242'], T + 'trex-enhance-basic-decking-beach-dune-board-grain-detail-pattern-color-selector-1'],
    ['Tide Pool', ['#a49a91', '#988e86', '#8e847b', '#756b62'], T + 'enh-001-tp-decking-swatch-TP010608E2S56'],
    ['Pebble Beach', ['#b0adac', '#a6a3a1', '#9a9795', '#807c7a'], T + 'enh-lowes-square-001-pb-swatch-PB010616E2S56'],
  ] },
  // Trex Transcend: the same board size; only Island Mist is mapped (a gray with mauve and charcoal streaks).
  { maker: 'Trex', name: 'Transcend', slug: 'trex-transcend', page: 'https://www.trex.com/products/decking/transcend/', board: { ...TREX_ENHANCE, boardTone: 0.07 }, sold: 'Trex dealers; Home Depot special order', colors: [
    ['Island Mist', ['#b3a29e', '#9c8b87', '#887774', '#635451'], T + 'trex-transcend-island-mist-swatch-1'],
  ] },
];

/** The line a deck look belongs to and its color's swatch photo, by catalog id (see the catalog's deck looks). */
export function deckMedia(id: string): { line: DeckLine; image?: string } | null {
  for (const L of DECK_LINES) for (const [n, , image] of L.colors) if (`${L.slug}-${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` === id) return { line: L, image };
  return null;
}
