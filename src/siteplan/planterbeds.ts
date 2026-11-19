import type { FeatureSpec } from './catalog';
import type { FeatureSize } from './decor';

/*
 * Tall raised beds and deck planters from a customer job's design (a homeowner-supplied set):
 *
 * - Vego Garden's 32" Extra Tall Modern Pro 27" x 83" Metal Raised Garden Bed, the one Vego bed sold at exactly the
 *   design's 32 x 27 x 83 in. Vego's corrugated Classic 9-in-1 and 10-in-1 kits cannot be built to 27 x 83: their widths
 *   are 2, 2 1/2, 3 1/2 ft and up, lengths in 1 1/2 ft steps (vegogarden.com, the kits' size tables). Facts from the
 *   product page https://vegogarden.com/products/32-tall-modern-raised-garden-beds-2783 (its spec block and product data:
 *   83" L x 27" W x 32" H, powder-coated galvanized steel panels and aluminum posts, 0.8 in double-walled panels, 130 lb,
 *   SKUs VBMT2783CH / BL / BR) and Vego's "General Manual for 32" Extra Tall Modern Metal Raised Garden Bed" (V3.0,
 *   06/26/2025): for this size two 24 x 32 in end panels (P3), four 39 x 32 in side panels (P4), four rounded aluminum
 *   corner posts 2 1/2 x 2 1/2 x 32 in (C4), two middle posts 2 1/2 x 4 x 32 in (C5), corner caps (S1) and middle caps
 *   (S2) tamped into the posts, 60 screws, two 24 in bracing bars across between the middle posts, and two aluminum
 *   logo plates. Bottomless (Vego FAQ). Built by builder/yard/vegobed.ts.
 * - Deck planters: the design's "deck-adjacent planter boxes" (one run along each side of the deck, 6 to 9 ft and 8 ft;
 *   type to be confirmed). The design's renders show a brown box of two board courses between corner posts under a
 *   flat top, about 2 ft tall and 16 in wide, which is what a planter built from standard lumber is; no maker's planter
 *   line matches those runs, so this is that build: 4x4 corner posts, two courses of 2x12 (11 1/4 in) a side and a
 *   mitered 2x6 cap, in western red cedar. Drawn by the cedar raised bed's builder (builder/yard/raisedbed.ts).
 */

const IN = 0.0254;
const S = (l: number, d: number, h: number, label: string): FeatureSize => ({ label, size: [l * IN, d * IN, h * IN] });

/** The Vego Modern Pro 27 x 83 (inches, from Vego's spec block and manual; see above). */
export const VEGO_MODERN_2783 = {
  L: 83, W: 27, H: 32,
  /** Double-walled panel thickness. */
  wall: 0.8,
  /** Corner post (C4) and middle post (C5) sizes. */
  post: 2.5, midAlong: 4,
  /** Outer corner radius of the rounded corner posts (read from Vego's photos against the 2 1/2 in post). */
  round: 1.1,
  /** The soil: filled "near the top" (Vego's FAQ), 2 in under the top edge. */
  soilDrop: 2,
};

/** Vego Modern colors: the color, its SKU for this bed, and the swatch: the end panel's color in Vego's end-on studio photo. */
export interface VegoColor { name: string; sku: string; swatch: string }
export const VEGO_MODERN_COLORS: Record<string, VegoColor> = {
  'urban-charcoal': { name: 'Urban Charcoal', sku: 'VBMT2783CH', swatch: '#504d44' },
  'midnight-blue': { name: 'Midnight Blue', sku: 'VBMT2783BL', swatch: '#3b3f3f' },
  'umber-brown': { name: 'Umber Brown', sku: 'VBMT2783BR', swatch: '#503f35' },
};
const VEGO_PREFIX = 'vego-modern-pro-32-27x83-';
/** A Vego Modern bed's color (by its feature id), or Urban Charcoal. */
export function vegoColorOf(spec: FeatureSpec): VegoColor {
  return VEGO_MODERN_COLORS[spec.id.slice(VEGO_PREFIX.length)] ?? VEGO_MODERN_COLORS['urban-charcoal'];
}

/** The soil of a Vego Modern bed a plant can stand in: outer length, width, the wall's thickness, and its soil height. */
export function vegoBedSoil(spec: FeatureSpec, own?: [number, number, number]): { W: number; D: number; inset: number; soil: number } | null {
  if (spec.kind !== 'vegoModernBed') return null;
  const v = VEGO_MODERN_2783;
  const [W, D, H] = own ?? [v.L * IN, v.W * IN, v.H * IN];
  return { W, D, inset: v.wall * IN, soil: H - v.soilDrop * IN };
}

/** Deck planter sizes (L x W x H, in): the design's runs, 6 to 9 ft, 16 in wide and 24 in tall (two 2x12 courses and the cap). */
export const DECK_PLANTER_SIZES: FeatureSize[] = [
  S(72, 16, 24, '6 ft long, 16 in wide, 24 in tall'), S(84, 16, 24, '7 ft long, 16 in wide, 24 in tall'),
  S(96, 16, 24, '8 ft long, 16 in wide, 24 in tall'), S(108, 16, 24, '9 ft long, 16 in wide, 24 in tall'),
];

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const PLANTER_BED_FEATURES: FeatureSpec[] = [
  ...Object.entries(VEGO_MODERN_COLORS).map(([slug, c]) => F({
    id: `${VEGO_PREFIX}${slug}`, name: `Vego Garden Modern Pro raised bed, 32 in tall, 27 x 83 in, ${c.name}`, group: 'Accents', kind: 'vegoModernBed',
    footprint: [VEGO_MODERN_2783.L * IN, VEGO_MODERN_2783.W * IN], maker: 'Vego Garden', page: 'https://vegogarden.com/products/32-tall-modern-raised-garden-beds-2783',
    about: `Vego Garden's 32 in extra tall Modern Pro metal raised bed, 27 x 83 in, in ${c.name}: smooth double-walled powder-coated steel panels, two to a long side meeting at a hidden middle post, between rounded aluminum corner posts with flat caps, a small aluminum logo plate near one corner, bottomless, filled with planting soil near the top. Plants set in it stand on its soil.`,
    facts: [
      `83 in L x 27 in W x 32 in H (Vego's spec), ${c.name}, SKU ${c.sku}`,
      'Powder-coated galvanized steel panels, 0.8 in double-walled; aluminum posts 2 1/2 x 2 1/2 in (corners) and 2 1/2 x 4 in (middle), with caps',
      'Two 24 x 32 in end panels and four 39 x 32 in side panels; two 24 in bracing bars across the middle',
      'Bottomless; filled 2 in under the top, about 36 cu ft of soil (inside about 81 x 25 1/2 in)',
      'Its plants are placed like any plant',
    ],
  })),
  F({
    id: 'deck-planter-cedar-2x12', name: 'Deck planter, built cedar, 2x12 sides, 24 in tall', group: 'Accents', kind: 'raisedBedCedar',
    footprint: [96 * IN, 16 * IN], sizes: DECK_PLANTER_SIZES, size: 2,
    about: 'A long planter box built from western red cedar lumber, set along a deck\'s side: 4x4 corner posts flush with the sides, two courses of 2x12 boards a side, a flat 2x6 cap mitered at the corners and running 1 in over the outside, screwed together, lined and filled with planting soil. Plants set in it stand on its soil.',
    facts: ['8 ft long as drawn (also 6, 7 and 9 ft), 16 in wide, 24 in tall', '4x4 corner posts; two 2x12 courses (11 1/4 in) a side', '2x6 cap, mitered, 1 in over the outside', 'Western red cedar, exterior screws', 'Soil 2 in under the cap; its plants are placed like any plant'],
  }),
];
