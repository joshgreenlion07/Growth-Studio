/**
 * Growth Studio catalog: plants, surfaces, walls, fences and features.
 *
 * The defaults follow Green Lion's finished work (style photos in
 * reference/green-lion-style): gray multi-size pavers with charcoal borders,
 * black mulch, gray fences with cedar lattice, modern water walls, fire
 * tables, louvered pergolas, raised block planters with charcoal caps.
 *
 * Plant sizes are typical nursery and mature sizes for the Central Valley,
 * meant as a starting point. Replace them with Green Lion's own plant list
 * (names, container sizes, mature sizes) before quoting from the app.
 * `matches` names the manufacturer product line a surface is modeled after;
 * the app draws its own look-alike textures, not manufacturer images.
 */
import { BELGARD_LINES } from './belgard';
import { BASALITE_LINES } from './basalite';
import { DECK_LINES, type DeckBoardSpec } from './decking';
import { approvalOverride } from './approval';
import { truscapesFeatures, type FixtureSpec } from './truscapes';
import { DECOR_FEATURES, type DecorKind, type FeatureSize } from './decor';

export type PlantForm =
  | 'shadeTree'
  | 'accentTree'
  | 'multiTrunk'
  | 'standardTree'
  | 'columnarTree'
  | 'conifer'
  | 'shrub'
  | 'floweringShrub'
  | 'grass'
  | 'perennial'
  | 'groundcover'
  | 'annuals'
  | 'agave'
  | 'fern'
  | 'tropical';

export type PlantGroup = 'Trees' | 'Shrubs' | 'Grasses' | 'Perennials and color' | 'Succulents' | 'Tropicals' | 'Groundcover';

export interface PlantSpec {
  id: string;
  name: string;
  /** Botanical name, shown beside the common name. */
  botanical: string;
  group: PlantGroup;
  form: PlantForm;
  /** Size at install, meters. */
  installHeight: number;
  installSpread: number;
  /** Size at maturity, meters. */
  matureHeight: number;
  matureSpread: number;
  /** Years from install to roughly mature size. */
  yearsToMature: number;
  foliage: string;
  foliage2: string;
  flower?: string;
  flower2?: string;
  evergreen: boolean;
  /** Default spacing for mass planting, meters. */
  spacing: number;
  /** Nursery container, for the plant list. */
  container: string;
  placeholder: true;
}

export type MaterialUse = 'turf' | 'bed' | 'hardscape' | 'border' | 'wall' | 'fence' | 'edging';

export type MaterialGroup =
  | 'Pavers'
  | 'Porcelain'
  | 'Concrete'
  | 'Natural stone'
  | 'Decking'
  | 'Turf'
  | 'Mulch and rock'
  | 'Walls'
  | 'Fences'
  | 'Edging';

export interface PaverPattern {
  kind: 'running' | 'herringbone' | 'basket' | 'ashlar' | 'cobble' | 'grid' | 'plank' | 'soldier';
  /** Piece sizes in inches, [along, across]. */
  sizes: [number, number][];
  /** Joint width in inches. */
  joint: number;
  /** Tumbled: worn, rounded edges. */
  tumbled?: boolean;
  /** Face texture. */
  face?: 'smooth' | 'textured' | 'woodgrain' | 'slate' | 'antiqued';
  /**
   * How the colors blend inside a piece. Left out, each piece takes one tone mottled with a second. 'cloud': all the
   * tones drift through every piece in broad, soft streaks (Basalite Premier Slab colors such as Midnight Terrace).
   */
  blend?: 'cloud';
  /** The line's own joint sand as photographed (sRGB hex), when it differs from the usual sand (Premier Slab). */
  jointSand?: string;
}

/**
 * Laying pattern of a paver that offers Belgard's published patterns (see `layingsFor`). For the 6 x 12, 9 x 12 and
 * 12 x 12 set (Catalina Grana, Avalon Slate): 'a' and 'b' are Belgard's 3-Piece Pattern A and Pattern B, 'random' the
 * old random ashlar. For Antiqued Flat Top (6 x 9, 9 x 9 and 9 x 12): 'a' is its own 3-Piece Pattern A, 'running3' the
 * 3-Piece Running Bond, and 'running' and 'herringbone' the 1-Piece Running Bond and 45 degree Herringbone of 6 x 9.
 * Left out, the first pattern the paver offers.
 */
export type LayingPattern = 'a' | 'b' | 'random' | 'running3' | 'running' | 'herringbone';
export const LAYING_PATTERNS: LayingPattern[] = ['a', 'b', 'random', 'running3', 'running', 'herringbone'];
export const LAYING_NAMES: Record<LayingPattern, string> = { a: 'Pattern A (12 in courses)', b: 'Pattern B', random: 'Random ashlar', running3: '3-piece running bond', running: '1-piece running bond (6 x 9)', herringbone: '1-piece herringbone (6 x 9)' };
const sameSizes = (s: [number, number][] | undefined, want: number[][]) => !!s && s.length === want.length && want.every(([a, b], i) => s[i][0] === a && s[i][1] === b);
/** True for a paver whose pieces are the 6 x 12, 9 x 12 and 12 x 12 set Pattern A and B are drawn for. */
export function isThreePiece(spec: MaterialSpec | undefined): boolean {
  return !!spec?.pattern && spec.pattern.kind === 'ashlar' && sameSizes(spec.pattern.sizes, [[6, 12], [9, 12], [12, 12]]);
}
/** True for an Antiqued Flat Top main-course paver (its 3-piece set, or Midnight, sold only as 6 x 9). */
export function isAntiqued(spec: MaterialSpec | undefined): boolean {
  return !!spec && spec.use === 'hardscape' && spec.line === 'Antiqued Flat Top';
}
/** The laying patterns a paver offers, the default first; empty when it is laid one way only. */
export function layingsFor(spec: MaterialSpec | undefined): LayingPattern[] {
  if (isAntiqued(spec)) return spec!.pattern?.kind === 'ashlar' ? ['a', 'running3', 'running', 'herringbone'] : ['running', 'herringbone'];
  if (isThreePiece(spec)) return ['a', 'b', 'random'];
  return [];
}
/** The pattern a zone is laid in: its own choice when the paver offers it, else the paver's default. */
export function layingOf(spec: MaterialSpec | undefined, laying?: LayingPattern): LayingPattern | undefined {
  const all = layingsFor(spec);
  return laying && all.includes(laying) ? laying : all[0];
}
/** A pattern's name for one paver (Antiqued Flat Top's Pattern A has no 12 in courses). */
export function layingName(spec: MaterialSpec | undefined, k: LayingPattern): string {
  return isAntiqued(spec) && k === 'a' ? '3-piece Pattern A' : LAYING_NAMES[k];
}

export type FenceStyle = 'boardOnBoard' | 'grayLattice' | 'grayBoardLattice' | 'dogEar' | 'horizontal' | 'vinyl' | 'steelPicket' | 'chainlinkSlat' | 'metalPicket';
export type WallFace = 'splitFace' | 'smoothBlock' | 'plaster' | 'ledgestone' | 'stackedStone' | 'smoothUnit' | 'roughHewn' | UnitFace;
/**
 * Maker wall faces drawn by their own recipes in src/engine/wallfaces (one file each), laid in real units (WallUnit):
 * 'tumbled' (Castlemanor Grana), 'tumbledRough' (Castlemanor Rustic), 'ashlar' (Ashlar Tandem), 'lamina' (Lamina
 * Tandem), 'chiseled' (Brisa) and 'papyrus' (Papyrus Artforms).
 */
export type UnitFace = 'tumbled' | 'tumbledRough' | 'ashlar' | 'lamina' | 'chiseled' | 'papyrus';

/**
 * A maker's wall unit: course height and unit face lengths (inches), an optional virtual joint inside each unit (inches
 * from its left end, one picked per unit), and the cap's thickness and overhang (inches).
 * `bond` is how courses sit on each other: 'random' (default: lengths mixed at random, each course starting anywhere),
 * 'half' (one length, each course shifted half a unit, as Melville Wall and AB Classic are laid) or 'stack' (one length,
 * joints in line, as Artforms panels are set).
 */
export interface WallUnit {
  course: number;
  lengths: number[];
  split?: number[];
  capIn?: number;
  capOver?: number;
  bond?: 'random' | 'half' | 'stack';
  /**
   * A maker's laying pattern, overriding `bond`: courses from the bottom up, repeating, each with where its first joint
   * falls (inches along the wall) and its unit lengths in order. Every course must add up to the same length.
   */
  pattern?: { start: number; lengths: number[] }[];
  /** Units made of two half-height faces offset along the wall (Lamina's Z-shaped units): the upper half's offset, in. */
  halfShift?: number;
}
export type ConcreteFinish = 'broom' | 'smooth' | 'stamped' | 'exposed';
/** A stamp mat's pattern: random rectangular stone, European fan cobblestone, or wood plank. */
export type StampPattern = 'ashlar' | 'cobble' | 'plank';

/**
 * Loose stone sold by size (1/2-1 in, 1-2 in, ...), drawn as individual 3D stones over a matching ground texture. Sizes
 * are a stone's long side in inches. `wide` and `thick` are the other two sides as shares of the long side (ranges): beach
 * pebbles are flattened ovals. `colors` are sRGB as photographed, with how often each shows (`share`, summing to 1).
 */
export interface PebbleSpec {
  minIn: number;
  maxIn: number;
  wide: [number, number];
  thick: [number, number];
  colors: { c: string; share: number }[];
  /**
   * The pieces' form (builder/pebbles.ts): 'pebble' (default: a smooth, wave-worn beach pebble), 'crushed' (crushed
   * stone: angular, with flat broken faces and sharp edges) or 'chip' (bark and wood chips: flat, splintery, a little
   * curled, with the grain running their length).
   */
  form?: 'pebble' | 'crushed' | 'chip';
}

/**
 * Soft bed fill spread loose (black humus and compost mix), drawn as 3D crumbs, clumps and compost fibers over a matching
 * ground texture. Colors are albedo (sRGB hex), freshly spread and slightly damp, set so the bed renders in the default
 * light at the tones measured from photos of it; `share` is how often each soil tone shows (summing to 1). `mean` is the
 * bed's average albedo: the far texture is matched to it, so near and far read the same. (The default light is warm with a
 * blue sky fill, so a dark brown on screen is a slightly greener albedo.)
 */
export interface CrumbSpec {
  soil: { c: string; share: number }[];
  /** Shredded bark, wood and plant fibers from the compost: a few lighter brown strands. */
  fiber: string[];
  /** Tiny pale specks (perlite, sand). */
  speck: string[];
  mean: string;
  /** How high the spread fill crowns above grade toward the middle of a bed, meters. */
  mound: number;
  /**
   * The relief (engine/humus-field.ts ClodStyle): how much of the surface is clods (1 = clods everywhere, lower leaves
   * more fine, powdery soil), their size (1 = 3-5 cm), how many shreds of bark and wood show in the fines (0..1), and the
   * share of those that are lighter, drier fiber.
   */
  style: { clods: number; scale: number; fibers: number; lightFibers: number };
  /** Loose pieces lying on top, per square meter: soft clods, and shreds of bark or wood (length range, inches). */
  loose: { clods: number; shreds: number; shredIn: [number, number] };
}

/** What a bed fill is, for ordering and defaults: bark and mulch, soil (humus, compost, dirt), rock and gravel, or DG. */
export type FillType = 'bark' | 'humus' | 'rock' | 'dg';

/**
 * A synthetic turf product as its maker lists it. Colors are sRGB as photographed (turned into albedo like any maker
 * color). `yarn` is the two blade colors (field green, olive green), `thatch` the curled fibers near the backing. `mean`
 * is the lawn's average color in the maker's outdoor photos: the texture is matched to it on screen.
 */
export interface TurfSpec {
  /** Pile height, millimeters. */
  pileMm: number;
  /** Face weight, oz per square yard: how dense the blades are. */
  faceOz: number;
  yarn: [string, string];
  /** Blade tips, lighter where the sun catches them. */
  tip: string;
  thatch: [string, string];
  /** How much thatch shows from above, 0 to 1. */
  thatchShow: number;
  /** Blade cross-section: C, diamond and omega (mixed), D, or W. */
  blade: 'mixed' | 'D' | 'W';
  /** The lawn's average color in the maker's outdoor photos of it installed (sRGB): what the texture's tone is matched to. */
  mean: string;
}

export interface MaterialSpec {
  id: string;
  name: string;
  use: MaterialUse;
  group: MaterialGroup;
  recipe:
    | 'lawn'
    | 'turfArtificial'
    | 'mulch'
    | 'dg'
    | 'riverRock'
    | 'blackPebble'
    | 'cobble'
    | 'paver'
    | 'concrete'
    | 'flagstone'
    | 'deck'
    | 'wall'
    | 'fence'
    | 'steelEdging'
    | 'curb';
  /** Colors in the blend, light to dark. */
  palette: string[];
  pattern?: PaverPattern;
  finish?: ConcreteFinish;
  /** Stamped concrete made with a stamp mat (finish 'stamped'): its pattern. Without it, the older generic stamped look. */
  stamp?: StampPattern;
  /** Antiquing release (sRGB): the darker powder tossed on before stamping, which stays in the joints and low spots. */
  antique?: string;
  fence?: FenceStyle;
  /** Default height when this fence is drawn, meters (the plan's line keeps its own height afterwards). */
  fenceHeight?: number;
  wall?: { face: WallFace; cap: string; unit?: WallUnit };
  /** Hardscape thickness above grade, meters. */
  thickness?: number;
  /** Manufacturer line this look is modeled on, if any. */
  matches?: string;
  /** Catalogue tags for real product lines: who makes it, the line, and the shelf it sits on. */
  maker?: string;
  line?: string;
  shelf?: 'Concrete' | 'Pavers' | 'Retaining walls' | 'Garden walls' | 'Curb' | 'Paver edge' | 'Synthetic turf' | 'Rock' | 'Decking';
  /** A maker's composite deck board (siteplan/decking.ts): a deck in it is built board by board. */
  board?: DeckBoardSpec;
  /** Loose stone drawn stone by stone (beach pebble, river rock): its size range, shape and colors. */
  pebble?: PebbleSpec;
  /** Soft fill drawn as a bed of clods (black humus, compost, dirt): its soil, fiber and speck colors, relief and mound. */
  crumb?: CrumbSpec;
  /** Bed fills: what kind of fill it is, the depth it is usually spread (in), and for rock, DG and gravel its weight (tons per cubic yard). */
  fillType?: FillType;
  depthIn?: number;
  tonsPerCuYd?: number;
  /** Synthetic turf made to a maker's spec (pile, yarn and thatch colors, blade shape), drawn blade by blade. */
  turf?: TurfSpec;
  /** The color name alone, without the line name. */
  color?: string;
  /** A border made to go with a main-course color; not listed on its own. */
  auto?: boolean;
  /** A real flagstone (FLAGSTONES): the stone it is split from, which sets its cleft face, and its thickness (in). */
  flag?: { stone: FlagStone; thicknessIn: number };
  /**
   * A generic large-format cast concrete slab, poured to any size: the look a one-slab pad takes when no maker sells a
   * unit of its size (see siteplan/pads.ts). Offered for pads only; never in a paver area's own picker.
   */
  padSlab?: true;
  placeholder: true;
}

export type FeatureKind =
  | 'firePit'
  | 'fireTable'
  | 'pergolaWood'
  | 'pergolaLouvered'
  | 'kitchenStraight'
  | 'kitchenL'
  | 'hotTub'
  | 'saunaBarrel'
  | 'saunaCube'
  | 'waterWallPlaster'
  | 'waterWallPorcelain'
  | 'waterWallStucco'
  | 'copperBowl'
  | 'pillarFountain'
  | 'patinaBowl'
  | 'fireWaterBowl'
  | 'spotLight'
  | 'steppingPad'
  | 'steppingStone'
  | 'puttingCup'
  | 'cortenScreen'
  | 'cortenPlanter'
  | DecorKind
  | 'blackPlanter'
  | 'boulder'
  | 'pathLight'
  | 'landscapeLight'
  | 'bench'
  | 'loungeSet'
  | 'diningSet'
  | 'umbrella'
  | 'gazebo'
  | 'bistroSet'
  | 'trellisCable'
  | 'trellisGrid';

export type FeatureGroup = 'Fire' | 'Shade' | 'Kitchens' | 'Spa and sauna' | 'Water' | 'Accents' | 'Lighting' | 'Furniture';

export interface FeatureSpec {
  id: string;
  name: string;
  group: FeatureGroup;
  kind: FeatureKind;
  /** Footprint in meters [width, depth] for the plan editor. */
  footprint: [number, number];
  /** Sizes a placed one can be set to (its `size`), and which of them it draws at when it has none (index). */
  sizes?: FeatureSize[];
  size?: number;
  /** It holds plants of its own (a planter): drawn planted unless its placement says `planted: false`. */
  plantable?: boolean;
  /** A maker's product, drawn to its published size: the maker, its product page, and plain facts for the panel. */
  maker?: string;
  page?: string;
  about?: string;
  facts?: string[];
  /** The builder's model for a maker's product of this kind ('stratus': SunVilla Stratus louvered pergola; 'ppz-743bc': Cal Spas Tropical Plus; 'saunalife-cl5g': SaunaLife CL5G sauna). */
  model?: 'stratus' | 'ppz-743bc' | 'saunalife-cl5g';
  /** On/off choices a placement can make (`FeaturePlacement.options`), with their defaults. */
  options?: FeatureOption[];
  /** A lighting fixture's maker spec (kind 'landscapeLight', siteplan/truscapes.ts). */
  fixture?: FixtureSpec;
  /** A stepping stone (kind 'steppingStone'): what it is and its size in inches, [across (local x), along (local z)]. A
   *  flagstone's size is the range its pieces are picked from, [smallest, largest]. */
  stepping?: { stone: SteppingStoneType; sizeIn: [number, number] };
  placeholder: true;
}

/** A stepping stone: one Belgard Dimensions Slab, a pad of Green Lion's poured concrete, or one natural flagstone piece. */
export type SteppingStoneType = 'slab' | 'pad' | 'flagstone';

export interface FeatureOption {
  key: string;
  label: string;
  default: boolean;
}

/** A placement's choice for one of its feature's options, or the option's default. */
export function featureOption(spec: FeatureSpec, options: Record<string, boolean> | undefined, key: string): boolean {
  const o = spec.options?.find((x) => x.key === key);
  return options?.[key] ?? o?.default ?? false;
}

/* ------------------------------------------------------------------ */
/* Plants                                                               */
/* ------------------------------------------------------------------ */

const P = (s: Omit<PlantSpec, 'placeholder'>): PlantSpec => ({ ...s, placeholder: true });

export const PLANTS: PlantSpec[] = [
  // Trees
  P({ id: 'shade-tree', name: 'Shade tree', botanical: 'Pistacia chinensis', group: 'Trees', form: 'shadeTree', installHeight: 3.4, installSpread: 1.8, matureHeight: 10.5, matureSpread: 9.0, yearsToMature: 15, foliage: '#2c501b', foliage2: '#3f6a26', evergreen: false, spacing: 8, container: '24" box' }),
  P({ id: 'japanese-maple-red', name: 'Japanese maple, red', botanical: 'Acer palmatum \'Bloodgood\'', group: 'Trees', form: 'accentTree', installHeight: 1.8, installSpread: 1.2, matureHeight: 4.5, matureSpread: 4.5, yearsToMature: 12, foliage: '#5a0f1b', foliage2: '#a3121c', evergreen: false, spacing: 4, container: '15 gal' }),
  P({ id: 'japanese-maple-green', name: 'Japanese maple, green', botanical: 'Acer palmatum', group: 'Trees', form: 'accentTree', installHeight: 1.8, installSpread: 1.2, matureHeight: 5.5, matureSpread: 5.5, yearsToMature: 12, foliage: '#4a7c24', foliage2: '#8db63a', evergreen: false, spacing: 4.5, container: '15 gal' }),
  P({ id: 'crape-myrtle', name: 'Crape myrtle', botanical: 'Lagerstroemia \'Muskogee\'', group: 'Trees', form: 'multiTrunk', installHeight: 2.4, installSpread: 0.9, matureHeight: 6.0, matureSpread: 4.5, yearsToMature: 8, foliage: '#365f22', foliage2: '#4d7a2c', flower: '#cf9bd4', flower2: '#c288c9', evergreen: false, spacing: 4, container: '15 gal' }),
  P({ id: 'olive-tree', name: 'Olive tree', botanical: 'Olea europaea \'Swan Hill\'', group: 'Trees', form: 'multiTrunk', installHeight: 2.7, installSpread: 1.5, matureHeight: 7.5, matureSpread: 6.0, yearsToMature: 15, foliage: '#586a45', foliage2: '#98a38b', evergreen: true, spacing: 5.5, container: '24" box' }),
  P({ id: 'citrus-standard', name: 'Citrus standard', botanical: 'Citrus sinensis', group: 'Trees', form: 'standardTree', installHeight: 1.5, installSpread: 0.7, matureHeight: 3.0, matureSpread: 2.4, yearsToMature: 7, foliage: '#2b5524', foliage2: '#6d9838', flower: '#ea7a12', flower2: '#ffffff', evergreen: true, spacing: 2.4, container: '15 gal' }),
  P({ id: 'italian-cypress', name: 'Italian cypress', botanical: 'Cupressus sempervirens \'Stricta\'', group: 'Trees', form: 'columnarTree', installHeight: 2.1, installSpread: 0.4, matureHeight: 12.0, matureSpread: 1.5, yearsToMature: 15, foliage: '#2f4a2c', foliage2: '#466340', evergreen: true, spacing: 1.5, container: '15 gal' }),
  P({ id: 'yew-pine-column', name: 'Yew pine (columnar)', botanical: 'Podocarpus gracilior', group: 'Trees', form: 'columnarTree', installHeight: 1.5, installSpread: 0.5, matureHeight: 6.0, matureSpread: 1.2, yearsToMature: 12, foliage: '#2b5a3a', foliage2: '#7fa046', evergreen: true, spacing: 1.2, container: '15 gal' }),
  P({ id: 'blue-point-juniper', name: 'Blue point juniper', botanical: 'Juniperus chinensis \'Blue Point\'', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.6, matureHeight: 3.6, matureSpread: 2.4, yearsToMature: 10, foliage: '#5f7d74', foliage2: '#86a297', evergreen: true, spacing: 2, container: '15 gal' }),
  P({ id: 'blue-juniper-column', name: 'Blue juniper, columnar', botanical: 'Juniperus scopulorum \'Blue Arrow\'', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.4, matureHeight: 4.3, matureSpread: 0.7, yearsToMature: 10, foliage: '#7d9aa6', foliage2: '#a3bcc6', evergreen: true, spacing: 0.9, container: '15 gal' }),
  P({ id: 'blue-spruce', name: 'Blue spruce', botanical: 'Picea pungens', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.9, matureHeight: 7.5, matureSpread: 3.6, yearsToMature: 15, foliage: '#6f8c9a', foliage2: '#a4bcc8', evergreen: true, spacing: 3.5, container: '15 gal' }),
  // Lambert legend plants (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'photinia-standard', name: 'Photinia, tree standard', botanical: 'Photinia x fraseri', group: 'Trees', form: 'standardTree', installHeight: 1.8, installSpread: 0.7, matureHeight: 4.5, matureSpread: 3.6, yearsToMature: 10, foliage: '#2d4a24', foliage2: '#b02a26', flower: '#f1ecd8', flower2: '#e2dcc0', evergreen: true, spacing: 3.5, container: '15 gal' }),
  P({ id: 'red-maple-autumn-blaze', name: 'Red maple \'Autumn Blaze\'', botanical: 'Acer x freemanii \'Jeffersred\'', group: 'Trees', form: 'shadeTree', installHeight: 2.4, installSpread: 0.9, matureHeight: 12.0, matureSpread: 9.0, yearsToMature: 15, foliage: '#3a6526', foliage2: '#5d8a3a', evergreen: false, spacing: 9, container: '15 gal' }),
  P({ id: 'meyer-lemon', name: 'Meyer lemon, tree', botanical: 'Citrus x meyeri \'Improved Meyer\'', group: 'Trees', form: 'standardTree', installHeight: 1.5, installSpread: 0.75, matureHeight: 3.0, matureSpread: 2.7, yearsToMature: 7, foliage: '#2a5224', foliage2: '#6d9838', flower: '#f2c418', flower2: '#ffffff', evergreen: true, spacing: 3, container: '15 gal' }),
  P({ id: 'mexican-lime', name: 'Mexican lime, tree', botanical: 'Citrus aurantiifolia', group: 'Trees', form: 'standardTree', installHeight: 1.5, installSpread: 0.8, matureHeight: 3.0, matureSpread: 3.0, yearsToMature: 7, foliage: '#3c6a2c', foliage2: '#7aa04a', flower: '#7fa83a', flower2: '#ffffff', evergreen: true, spacing: 3, container: '15 gal' }),
  P({ id: 'japanese-maple-coral-bark', name: 'Japanese maple \'Sango Kaku\'', botanical: 'Acer palmatum \'Sango-kaku\'', group: 'Trees', form: 'accentTree', installHeight: 1.8, installSpread: 0.9, matureHeight: 6.0, matureSpread: 4.5, yearsToMature: 12, foliage: '#7fa83c', foliage2: '#c4cf52', evergreen: false, spacing: 4.5, container: '15 gal' }),
  // Plants from a finished job's photos (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'skyrocket-juniper', name: 'Juniper \'Skyrocket\'', botanical: 'Juniperus scopulorum \'Skyrocket\'', group: 'Trees', form: 'conifer', installHeight: 1.75, installSpread: 0.36, matureHeight: 6.0, matureSpread: 0.9, yearsToMature: 12, foliage: '#6f857f', foliage2: '#a3b4ad', evergreen: true, spacing: 1.2, container: '15 gal' }),
  P({ id: 'navel-orange', name: 'Navel orange, tree', botanical: 'Citrus sinensis \'Washington\'', group: 'Trees', form: 'standardTree', installHeight: 1.4, installSpread: 1.1, matureHeight: 3.0, matureSpread: 3.0, yearsToMature: 7, foliage: '#2b5524', foliage2: '#6d9838', flower: '#ee7f12', flower2: '#ffffff', evergreen: true, spacing: 3, container: '15 gal' }),
  P({ id: 'eureka-lemon', name: 'Eureka lemon, tree', botanical: 'Citrus limon \'Eureka\'', group: 'Trees', form: 'standardTree', installHeight: 1.3, installSpread: 1.2, matureHeight: 3.3, matureSpread: 3.3, yearsToMature: 7, foliage: '#3a6a2c', foliage2: '#86ad4a', flower: '#f0d21c', flower2: '#ffffff', evergreen: true, spacing: 3.5, container: '15 gal' }),
  P({ id: 'gardenia-standard', name: 'Gardenia, tree standard', botanical: 'Gardenia jasminoides \'Veitchii\'', group: 'Trees', form: 'standardTree', installHeight: 1.45, installSpread: 0.95, matureHeight: 1.9, matureSpread: 1.25, yearsToMature: 6, foliage: '#1f4520', foliage2: '#a8c03c', flower: '#fbf8ee', flower2: '#efe6c4', evergreen: true, spacing: 1.2, container: '15 gal' }),
  // Shrubs
  P({ id: 'boxwood', name: 'Boxwood', botanical: 'Buxus microphylla var. japonica \'Winter Gem\'', group: 'Shrubs', form: 'shrub', installHeight: 0.4, installSpread: 0.4, matureHeight: 1.2, matureSpread: 1.2, yearsToMature: 6, foliage: '#3f7029', foliage2: '#6f9a35', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'westringia', name: 'Coast rosemary (westringia)', botanical: 'Westringia fruticosa', group: 'Shrubs', form: 'shrub', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.8, yearsToMature: 4, foliage: '#6f8468', foliage2: '#a3b09a', flower: '#f4f2ee', evergreen: true, spacing: 1.5, container: '5 gal' }),
  P({ id: 'euonymus-variegated', name: 'Variegated euonymus', botanical: 'Euonymus japonicus \'Aureo-marginatus\'', group: 'Shrubs', form: 'shrub', installHeight: 0.6, installSpread: 0.45, matureHeight: 1.8, matureSpread: 1.2, yearsToMature: 5, foliage: '#3f7a2a', foliage2: '#e2c23a', evergreen: true, spacing: 1.0, container: '5 gal' }),
  P({ id: 'rose', name: 'Rose', botanical: 'Rosa \'Radrazz\' (Knock Out)', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.6, installSpread: 0.5, matureHeight: 1.2, matureSpread: 1.2, yearsToMature: 3, foliage: '#35582c', foliage2: '#6b4032', flower: '#c8203a', flower2: '#e15a7d', evergreen: false, spacing: 1.1, container: '5 gal' }),
  P({ id: 'flowering-shrub', name: 'Flowering shrub', botanical: 'Rhaphiolepis indica', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.45, installSpread: 0.5, matureHeight: 1.2, matureSpread: 1.5, yearsToMature: 5, foliage: '#2f4f2a', foliage2: '#6a4630', flower: '#d9739a', flower2: '#eba6c0', evergreen: true, spacing: 1.3, container: '5 gal' }),
  P({ id: 'dwarf-pittosporum', name: 'Dwarf pittosporum', botanical: 'Pittosporum tobira \'Wheeler\'s Dwarf\'', group: 'Shrubs', form: 'shrub', installHeight: 0.35, installSpread: 0.45, matureHeight: 0.9, matureSpread: 1.5, yearsToMature: 7, foliage: '#2f5a24', foliage2: '#4f7f34', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'gold-cypress', name: 'Gold mop cypress', botanical: 'Chamaecyparis pisifera \'Golden Mop\'', group: 'Shrubs', form: 'shrub', installHeight: 0.4, installSpread: 0.45, matureHeight: 1.1, matureSpread: 1.4, yearsToMature: 8, foliage: '#c9b238', foliage2: '#e4cf52', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'artemisia', name: 'Silver artemisia', botanical: 'Artemisia \'Powis Castle\'', group: 'Shrubs', form: 'shrub', installHeight: 0.3, installSpread: 0.4, matureHeight: 0.9, matureSpread: 1.5, yearsToMature: 2, foliage: '#a9b5ab', foliage2: '#c9d2c8', evergreen: true, spacing: 1.2, container: '1 gal' }),
  P({ id: 'boxwood-hedge', name: 'Boxwood hedge (sheared)', botanical: 'Buxus microphylla var. japonica \'Winter Gem\'', group: 'Shrubs', form: 'shrub', installHeight: 0.45, installSpread: 0.4, matureHeight: 0.9, matureSpread: 0.75, yearsToMature: 4, foliage: '#3d6e28', foliage2: '#679332', evergreen: true, spacing: 0.5, container: '5 gal' }),
  P({ id: 'pittosporum', name: 'Pittosporum', botanical: 'Pittosporum tenuifolium \'Silver Sheen\'', group: 'Shrubs', form: 'shrub', installHeight: 0.9, installSpread: 0.5, matureHeight: 3.6, matureSpread: 1.8, yearsToMature: 6, foliage: '#8fae88', foliage2: '#b4c9a6', evergreen: true, spacing: 1.5, container: '5 gal' }),
  P({ id: 'gardenia-veitchii', name: 'Gardenia \'Veitchii\'', botanical: 'Gardenia jasminoides \'Veitchii\'', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.3, installSpread: 0.3, matureHeight: 1.2, matureSpread: 0.9, yearsToMature: 5, foliage: '#1f4a1f', foliage2: '#3d6b2c', flower: '#fbf8ee', flower2: '#efe6c4', evergreen: true, spacing: 0.9, container: '1 gal' }),
  P({ id: 'camellia-yuletide', name: 'Camellia \'Yuletide\'', botanical: 'Camellia sasanqua \'Yuletide\'', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.75, installSpread: 0.45, matureHeight: 2.4, matureSpread: 1.8, yearsToMature: 8, foliage: '#1e3f1c', foliage2: '#2f5a26', flower: '#c4161c', flower2: '#f2c230', evergreen: true, spacing: 1.5, container: '5 gal' }),
  P({ id: 'xylosma', name: 'Xylosma', botanical: 'Xylosma congestum', group: 'Shrubs', form: 'shrub', installHeight: 0.9, installSpread: 0.5, matureHeight: 3.0, matureSpread: 3.0, yearsToMature: 8, foliage: '#4f7a2a', foliage2: '#9c5a2c', evergreen: true, spacing: 1.8, container: '5 gal' }),
  P({ id: 'bougainvillea', name: 'Bougainvillea', botanical: 'Bougainvillea \'Barbara Karst\'', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.9, installSpread: 0.6, matureHeight: 1.8, matureSpread: 2.4, yearsToMature: 4, foliage: '#3f6d2a', foliage2: '#5b8a3a', flower: '#cf1f5a', flower2: '#9c1447', evergreen: true, spacing: 2, container: '5 gal' }),
  P({ id: 'rose-flower-carpet-red', name: 'Rose \'Flower Carpet Red\'', botanical: 'Rosa \'Noare\' (Flower Carpet Red)', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.35, installSpread: 0.4, matureHeight: 0.75, matureSpread: 1.0, yearsToMature: 3, foliage: '#2f5a26', foliage2: '#4c7a34', flower: '#c8102e', flower2: '#e8404f', evergreen: false, spacing: 0.9, container: '2 gal' }),
  // Plants from a finished job's photos (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'cherry-laurel-compacta', name: 'Carolina cherry laurel \'Compacta\'', botanical: 'Prunus caroliniana \'Compacta\'', group: 'Shrubs', form: 'shrub', installHeight: 1.8, installSpread: 0.9, matureHeight: 3.0, matureSpread: 1.8, yearsToMature: 6, foliage: '#22401e', foliage2: '#4f7a34', flower: '#f1eedc', flower2: '#e2e0c4', evergreen: true, spacing: 1.8, container: '15 gal' }),
  P({ id: 'hopseed-bush-purpurea', name: 'Purple hopseed bush', botanical: 'Dodonaea viscosa \'Purpurea\'', group: 'Shrubs', form: 'shrub', installHeight: 1.5, installSpread: 0.75, matureHeight: 3.6, matureSpread: 1.8, yearsToMature: 5, foliage: '#4e4a30', foliage2: '#7a3e3a', flower: '#a8603a', flower2: '#c9a066', evergreen: true, spacing: 1.8, container: '15 gal' }),
  P({ id: 'glossy-abelia-kaleidoscope', name: 'Glossy abelia \'Kaleidoscope\'', botanical: 'Abelia x grandiflora \'Kaleidoscope\'', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.45, installSpread: 0.5, matureHeight: 0.9, matureSpread: 1.2, yearsToMature: 4, foliage: '#7c9a2e', foliage2: '#e0c23a', flower: '#f4f0ea', flower2: '#e9d4dc', evergreen: true, spacing: 1.0, container: '5 gal' }),
  // Grasses
  P({ id: 'blue-fescue', name: 'Blue fescue', botanical: 'Festuca glauca', group: 'Grasses', form: 'grass', installHeight: 0.15, installSpread: 0.15, matureHeight: 0.3, matureSpread: 0.35, yearsToMature: 2, foliage: '#7f9fb2', foliage2: '#98b4c2', flower: '#c9b27c', evergreen: true, spacing: 0.35, container: '1 gal' }),
  P({ id: 'ornamental-grass', name: 'Ornamental grass', botanical: 'Calamagrostis x acutiflora \'Karl Foerster\'', group: 'Grasses', form: 'grass', installHeight: 0.4, installSpread: 0.3, matureHeight: 1.5, matureSpread: 0.75, yearsToMature: 2, foliage: '#628e3a', foliage2: '#7fa648', flower: '#d2b676', evergreen: false, spacing: 0.7, container: '5 gal' }),
  P({ id: 'lomandra', name: 'Lomandra', botanical: 'Lomandra longifolia \'Breeze\'', group: 'Grasses', form: 'grass', installHeight: 0.35, installSpread: 0.35, matureHeight: 0.9, matureSpread: 1.1, yearsToMature: 3, foliage: '#5a9230', foliage2: '#74a83c', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'fountain-grass', name: 'Fountain grass', botanical: 'Pennisetum alopecuroides', group: 'Grasses', form: 'grass', installHeight: 0.35, installSpread: 0.3, matureHeight: 0.9, matureSpread: 0.9, yearsToMature: 2, foliage: '#528a34', foliage2: '#6ea040', flower: '#e2d2b0', flower2: '#b79a7c', evergreen: false, spacing: 0.8, container: '1 gal' }),
  P({ id: 'gold-carex', name: 'Gold carex', botanical: 'Carex oshimensis \'Everillo\'', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.4, matureSpread: 0.5, yearsToMature: 2, foliage: '#b4c40c', foliage2: '#86a408', evergreen: true, spacing: 0.45, container: '1 gal' }),
  P({ id: 'flax-lily', name: 'Variegated flax lily', botanical: 'Dianella tasmanica \'Variegata\'', group: 'Grasses', form: 'grass', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.75, matureSpread: 0.75, yearsToMature: 2, foliage: '#5d8a3e', foliage2: '#f1edcf', flower: '#6f78d6', flower2: '#3b3fa6', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'mondo-grass', name: 'Dwarf mondo grass', botanical: 'Ophiopogon japonicus \'Nana\'', group: 'Grasses', form: 'grass', installHeight: 0.05, installSpread: 0.1, matureHeight: 0.08, matureSpread: 0.2, yearsToMature: 3, foliage: '#183418', foliage2: '#2a5022', evergreen: true, spacing: 0.1, container: '4" pot' }),
  P({ id: 'liriope', name: 'Lilyturf (liriope)', botanical: 'Liriope muscari', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.4, matureSpread: 0.5, yearsToMature: 3, foliage: '#1d4220', foliage2: '#2f6030', flower: '#8a62c4', flower2: '#4a2f7a', evergreen: true, spacing: 0.45, container: '1 gal' }),
  P({ id: 'maiden-grass-morning-light', name: 'Maiden grass \'Morning Light\'', botanical: 'Miscanthus sinensis \'Morning Light\'', group: 'Grasses', form: 'grass', installHeight: 0.6, installSpread: 0.45, matureHeight: 1.5, matureSpread: 1.2, yearsToMature: 3, foliage: '#8fa784', foliage2: '#c9d4bf', flower: '#b78a73', flower2: '#d8cfc2', evergreen: false, spacing: 1.2, container: '5 gal' }),
  // Plants from a finished job's photos (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'lomandra-platinum-beauty', name: 'Lomandra \'Platinum Beauty\'', botanical: 'Lomandra longifolia \'Platinum Beauty\'', group: 'Grasses', form: 'grass', installHeight: 0.55, installSpread: 0.75, matureHeight: 0.75, matureSpread: 1.0, yearsToMature: 3, foliage: '#5f8a3e', foliage2: '#e4e2b8', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'liriope-silvery-sunproof', name: 'Liriope \'Silvery Sunproof\'', botanical: 'Liriope muscari \'Silvery Sunproof\'', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.3, matureHeight: 0.38, matureSpread: 0.45, yearsToMature: 3, foliage: '#3f6a2e', foliage2: '#e8e6c4', flower: '#a98fd6', flower2: '#7a5fb4', evergreen: true, spacing: 0.4, container: '1 gal' }),
  // Perennials and color
  P({ id: 'lavender', name: 'Lavender', botanical: 'Lavandula x intermedia', group: 'Perennials and color', form: 'perennial', installHeight: 0.25, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 3, foliage: '#7f9076', foliage2: '#a3b09a', flower: '#7a63b8', flower2: '#4f3c94', evergreen: true, spacing: 0.75, container: '1 gal' }),
  P({ id: 'veronica-white', name: 'White veronica', botanical: 'Veronica spicata', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.45, matureSpread: 0.45, yearsToMature: 2, foliage: '#4c7a34', foliage2: '#669645', flower: '#f4f4ee', flower2: '#a9c77c', evergreen: false, spacing: 0.4, container: '1 gal' }),
  P({ id: 'statice', name: 'Statice', botanical: 'Limonium perezii', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.75, yearsToMature: 2, foliage: '#416836', foliage2: '#5f7d48', flower: '#6a45c9', flower2: '#8660dc', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'gaura', name: 'Gaura (wand flower)', botanical: 'Gaura lindheimeri', group: 'Perennials and color', form: 'perennial', installHeight: 0.35, installSpread: 0.35, matureHeight: 0.9, matureSpread: 0.9, yearsToMature: 2, foliage: '#587a3a', foliage2: '#8a6a52', flower: '#f4c4d3', flower2: '#d9507f', evergreen: false, spacing: 0.75, container: '1 gal' }),
  P({ id: 'purple-coneflower', name: 'Purple coneflower', botanical: 'Echinacea purpurea', group: 'Perennials and color', form: 'perennial', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.8, matureSpread: 0.55, yearsToMature: 2, foliage: '#35622b', foliage2: '#4f7d38', flower: '#c8489a', flower2: '#c9722a', evergreen: false, spacing: 0.5, container: '1 gal' }),
  P({ id: 'daylily-stella-de-oro', name: 'Daylily \'Stella de Oro\'', botanical: 'Hemerocallis \'Stella de Oro\'', group: 'Perennials and color', form: 'perennial', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.45, matureSpread: 0.5, yearsToMature: 2, foliage: '#4f7d34', foliage2: '#6e9a45', flower: '#f4b300', flower2: '#e08a00', evergreen: false, spacing: 0.45, container: '1 gal' }),
  P({ id: 'daylily-red', name: 'Daylily, red', botanical: 'Hemerocallis hybrid, red', group: 'Perennials and color', form: 'perennial', installHeight: 0.35, installSpread: 0.3, matureHeight: 0.8, matureSpread: 0.65, yearsToMature: 2, foliage: '#4a7a32', foliage2: '#68954a', flower: '#a3121c', flower2: '#d6c23a', evergreen: false, spacing: 0.5, container: '1 gal' }),
  P({ id: 'fortnight-lily', name: 'Fortnight lily', botanical: 'Dietes vegeta', group: 'Perennials and color', form: 'perennial', installHeight: 0.5, installSpread: 0.45, matureHeight: 1.0, matureSpread: 0.9, yearsToMature: 3, foliage: '#3e6a35', foliage2: '#567f45', flower: '#f7f6f2', flower2: '#e8c43a', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'salvia-hot-lips', name: 'Salvia \'Hot Lips\'', botanical: 'Salvia microphylla \'Hot Lips\'', group: 'Perennials and color', form: 'perennial', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.9, matureSpread: 1.3, yearsToMature: 2, foliage: '#4f7a34', foliage2: '#6c9248', flower: '#d81f3a', flower2: '#ffffff', evergreen: true, spacing: 0.9, container: '1 gal' }),
  P({ id: 'spanish-lavender-otto-quast', name: 'Spanish lavender \'Otto Quast\'', botanical: 'Lavandula stoechas \'Otto Quast\'', group: 'Perennials and color', form: 'perennial', installHeight: 0.4, installSpread: 0.45, matureHeight: 0.75, matureSpread: 0.9, yearsToMature: 3, foliage: '#5f7752', foliage2: '#8a9c7c', flower: '#3a1f4e', flower2: '#8e4ab8', evergreen: true, spacing: 0.75, container: '5 gal' }),
  P({ id: 'annual-color', name: 'Seasonal color', botanical: 'Petunia x hybrida', group: 'Perennials and color', form: 'annuals', installHeight: 0.12, installSpread: 0.15, matureHeight: 0.2, matureSpread: 0.3, yearsToMature: 1, foliage: '#447232', foliage2: '#669842', flower: '#f2c12e', flower2: '#e8508a', evergreen: false, spacing: 0.25, container: '4" pot' }),
  P({ id: 'primrose-red', name: 'Primrose, red', botanical: 'Primula x polyantha', group: 'Perennials and color', form: 'annuals', installHeight: 0.1, installSpread: 0.18, matureHeight: 0.13, matureSpread: 0.22, yearsToMature: 1, foliage: '#4c7a32', foliage2: '#6e9a45', flower: '#c3141c', flower2: '#f3c22e', evergreen: false, spacing: 0.25, container: '4" pot' }),
  P({ id: 'foxtail-fern', name: 'Foxtail fern', botanical: 'Asparagus densiflorus \'Myersii\'', group: 'Perennials and color', form: 'fern', installHeight: 0.5, installSpread: 0.75, matureHeight: 0.75, matureSpread: 1.05, yearsToMature: 3, foliage: '#6f9a34', foliage2: '#a0b84e', evergreen: true, spacing: 0.9, container: '5 gal' }),
  // Plants from a finished job's photos (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'cyclamen-red', name: 'Cyclamen, red', botanical: 'Cyclamen persicum, red', group: 'Perennials and color', form: 'perennial', installHeight: 0.22, installSpread: 0.25, matureHeight: 0.25, matureSpread: 0.3, yearsToMature: 1, foliage: '#26401f', foliage2: '#a9b49a', flower: '#c4122e', flower2: '#8e0a22', evergreen: false, spacing: 0.25, container: '6" pot' }),
  // Succulents
  P({ id: 'variegated-yucca', name: 'Variegated yucca', botanical: 'Yucca filamentosa \'Color Guard\'', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 0.75, matureSpread: 0.9, yearsToMature: 4, foliage: '#e6d874', foliage2: '#2e5c2c', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'blue-sedum', name: 'Blue sedum', botanical: 'Sedum reflexum \'Blue Spruce\'', group: 'Succulents', form: 'groundcover', installHeight: 0.08, installSpread: 0.15, matureHeight: 0.15, matureSpread: 0.6, yearsToMature: 2, foliage: '#7fa3a0', foliage2: '#a6c6c2', evergreen: true, spacing: 0.3, container: '1 gal' }),
  P({ id: 'foxtail-agave', name: 'Foxtail agave', botanical: 'Agave attenuata', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 1.2, matureSpread: 1.2, yearsToMature: 6, foliage: '#7fa890', foliage2: '#a9cbb6', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'agave', name: 'Agave', botanical: 'Agave \'Blue Glow\'', group: 'Succulents', form: 'agave', installHeight: 0.3, installSpread: 0.4, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 6, foliage: '#4f8a80', foliage2: '#7fb0a6', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'blue-agave', name: 'Blue agave', botanical: 'Agave tequilana \'Weber Azul\'', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.8, yearsToMature: 8, foliage: '#7d99a2', foliage2: '#a7bcc0', evergreen: true, spacing: 1.8, container: '5 gal' }),
  P({ id: 'red-yucca', name: 'Red yucca', botanical: 'Hesperaloe parviflora', group: 'Succulents', form: 'agave', installHeight: 1.3, installSpread: 0.85, matureHeight: 1.5, matureSpread: 1.25, yearsToMature: 4, foliage: '#5f7868', foliage2: '#7d9184', flower: '#c9493f', flower2: '#e48a6a', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'echeveria', name: 'Echeveria', botanical: 'Echeveria \'Lola\'', group: 'Succulents', form: 'agave', installHeight: 0.065, installSpread: 0.12, matureHeight: 0.08, matureSpread: 0.16, yearsToMature: 2, foliage: '#a8a2b3', foliage2: '#c9bfc6', flower: '#e9895a', evergreen: true, spacing: 0.2, container: '4" pot' }),
  // Tropicals
  P({ id: 'banana', name: 'Banana', botanical: 'Musa basjoo', group: 'Tropicals', form: 'tropical', installHeight: 1.5, installSpread: 1.0, matureHeight: 4.0, matureSpread: 3.0, yearsToMature: 3, foliage: '#58982e', foliage2: '#6fae3c', evergreen: false, spacing: 2.5, container: '15 gal' }),
  P({ id: 'elephant-ear', name: 'Elephant ear', botanical: 'Colocasia esculenta', group: 'Tropicals', form: 'tropical', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.5, yearsToMature: 2, foliage: '#3b722f', foliage2: '#5c9442', evergreen: false, spacing: 1.2, container: '5 gal' }),
  P({ id: 'canna-tropicanna', name: 'Canna \'Tropicanna\'', botanical: 'Canna \'Phasion\' (Tropicanna, Tropicana)', group: 'Tropicals', form: 'tropical', installHeight: 0.45, installSpread: 0.35, matureHeight: 1.7, matureSpread: 1.0, yearsToMature: 2, foliage: '#5a2a2a', foliage2: '#c8762a', flower: '#f26a1b', flower2: '#f39a2a', evergreen: false, spacing: 0.6, container: '1 gal' }),
  // Groundcover
  P({ id: 'ajuga', name: 'Ajuga, bronze', botanical: 'Ajuga reptans \'Bronze Beauty\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.06, installSpread: 0.2, matureHeight: 0.12, matureSpread: 0.6, yearsToMature: 2, foliage: '#4a2e3a', foliage2: '#34422c', flower: '#5a52cc', flower2: '#4338b0', evergreen: true, spacing: 0.35, container: 'Flat' }),
  P({ id: 'spreading-juniper', name: 'Spreading juniper', botanical: 'Juniperus sabina \'Tamariscifolia\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.2, installSpread: 0.6, matureHeight: 0.45, matureSpread: 2.4, yearsToMature: 6, foliage: '#3f6347', foliage2: '#5a8062', evergreen: true, spacing: 1.5, container: '5 gal' }),
  P({ id: 'verbena', name: 'Purple verbena', botanical: 'Verbena canadensis \'Homestead Purple\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.1, installSpread: 0.25, matureHeight: 0.25, matureSpread: 0.9, yearsToMature: 2, foliage: '#2f5a24', foliage2: '#4a7c30', flower: '#7a30c4', flower2: '#5c1aa4', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'rosemary-pointe-du-raz', name: 'Rosemary \'Pointe du Raz\'', botanical: 'Rosmarinus officinalis \'Pointe du Raz\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.15, installSpread: 0.3, matureHeight: 0.5, matureSpread: 1.5, yearsToMature: 3, foliage: '#3f5530', foliage2: '#868d74', flower: '#7a90d4', flower2: '#5a6fb8', evergreen: true, spacing: 1.0, container: '1 gal' }),
  P({ id: 'groundcover', name: 'Low groundcover', botanical: 'Myoporum parvifolium', group: 'Groundcover', form: 'groundcover', installHeight: 0.08, installSpread: 0.3, matureHeight: 0.15, matureSpread: 1.5, yearsToMature: 2, foliage: '#4a8a2b', foliage2: '#72b43a', flower: '#fbfbf3', flower2: '#e9ecd2', evergreen: true, spacing: 0.9, container: '1 gal' }),
  // Plants from a finished job's photos (2026-11-17). Sizes and colors from nursery and extension references cited in each builder file.
  P({ id: 'lantana-new-gold', name: 'Lantana \'New Gold\'', botanical: 'Lantana x hybrida \'New Gold\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.2, installSpread: 0.3, matureHeight: 0.45, matureSpread: 1.2, yearsToMature: 2, foliage: '#3d6a2a', foliage2: '#5c8a3a', flower: '#f6c21a', flower2: '#ffd94a', evergreen: true, spacing: 0.9, container: '1 gal' }),
];

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

const M = (s: Omit<MaterialSpec, 'placeholder'>): MaterialSpec => ({ ...s, placeholder: true });
const ASHLAR: [number, number][] = [[6, 9], [9, 9], [9, 12], [12, 12], [6, 12]];
const LARGE_ASHLAR: [number, number][] = [[12, 12], [12, 18], [18, 24], [12, 24]];


/*
 * Green Lion concrete: six finishes, each in six integral colors (mixed through the slab). The three stamped patterns
 * also come antiqued: a darker release powder left in the joints and low spots, as stamped concrete is usually finished.
 * Looks are made here, one per line and color; the older concrete ids are kept as members of the lines (or hidden
 * aliases) so saved plans still load.
 */
export const CONCRETE_COLORS: { id: string; name: string; palette: [string, string]; release: string }[] = [
  { id: 'natural-gray', name: 'Natural gray', palette: ['#c7c3ba', '#b5b1a8'], release: '#5b5953' },
  { id: 'sandstone', name: 'Sandstone', palette: ['#b9a684', '#a6916b'], release: '#6a563d' },
  { id: 'desert-tan', name: 'Desert tan', palette: ['#a98a62', '#94764f'], release: '#5e432b' },
  { id: 'terracotta', name: 'Terracotta', palette: ['#b2654f', '#9a5442'], release: '#4f2a20' },
  { id: 'charcoal', name: 'Charcoal', palette: ['#6a6866', '#575553'], release: '#201f1e' },
  { id: 'walnut', name: 'Walnut brown', palette: ['#85634b', '#6e5039'], release: '#2d1e14' },
];
const CONCRETE_LINES: { id: string; line: string; finish: ConcreteFinish; stamp?: StampPattern }[] = [
  { id: 'smooth', line: 'Smooth concrete', finish: 'smooth' },
  { id: 'broom', line: 'Broom concrete', finish: 'broom' },
  { id: 'exposed', line: 'Exposed aggregate', finish: 'exposed' },
  { id: 'stamped-ashlar', line: 'Stamped ashlar slate', finish: 'stamped', stamp: 'ashlar' },
  { id: 'stamped-cobble', line: 'Stamped European fan cobblestone', finish: 'stamped', stamp: 'cobble' },
  { id: 'stamped-plank', line: 'Stamped wood plank', finish: 'stamped', stamp: 'plank' },
];
/** Ids that existed before the concrete lines; each now stands in for its line's look in that color. */
const CONCRETE_OLD: Record<string, string> = { 'broom:natural-gray': 'concrete-broom' };
function concreteLooks(): MaterialSpec[] {
  const out: MaterialSpec[] = [];
  for (const L of CONCRETE_LINES) {
    for (const c of CONCRETE_COLORS) {
      for (const antiqued of L.stamp ? [false, true] : [false]) {
        const color = antiqued ? `${c.name}, antiqued` : c.name;
        const base = `${L.line}, ${c.name.toLowerCase()}${antiqued ? ', antiqued' : ''}`;
        const id = CONCRETE_OLD[`${L.id}:${c.id}`] ?? `concrete-${L.id}-${c.id}${antiqued ? '-antiqued' : ''}`;
        out.push(M({
          id, name: base[0].toUpperCase() + base.slice(1), use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: c.palette.slice(), finish: L.finish,
          ...(L.stamp ? { stamp: L.stamp } : {}), ...(antiqued ? { antique: c.release } : {}),
          thickness: 0.1, maker: 'Green Lion', line: L.line, shelf: 'Concrete', color,
        }));
      }
    }
  }
  // Older looks with no place in the lines: kept for saved plans, hidden from the Library and the pickers.
  const old = (id: string, name: string, palette: string[], finish: ConcreteFinish) => out.push(M({ id, name, use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette, finish, thickness: 0.1, auto: true }));
  old('concrete-stamped-light', 'Stamped concrete, light slate', ['#d6d1c6', '#c4beb2'], 'stamped');
  old('concrete-stamped-tan', 'Stamped concrete, tan tile', ['#d3bf9c', '#bba783'], 'stamped');
  old('concrete-stamped', 'Stamped concrete, slate', ['#a99a86', '#8a7c6b'], 'stamped');
  // Kept with their old colors so saved plans look the same; the lines' Natural gray smooth and Desert tan broom are new looks.
  old('concrete-smooth', 'Smooth-trowel concrete', ['#bebbb4', '#aaa79f'], 'smooth');
  old('concrete-tan', 'Colored concrete, tan', ['#c9b89c', '#b6a487'], 'broom');
  old('concrete-exposed', 'Exposed aggregate', ['#a59a8c', '#857a6d'], 'exposed');
  old('concrete-red', 'Colored concrete, terracotta', ['#a5604f', '#8f5244'], 'smooth');
  return out;
}

export const MATERIALS: MaterialSpec[] = [
  // Turf
  M({ id: 'lawn', name: 'Natural lawn', use: 'turf', group: 'Turf', recipe: 'lawn', palette: ['#5f8a38', '#3f6328'] }),
  M({ id: 'putting-green', name: 'Putting green turf', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#8fb53a', '#729a2c'] }),
  M({ id: 'artificial-turf', name: 'Artificial turf', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#567a30', '#355322'] }),
  // Area Planner's synthetic grass: one even, bright green blade, no patches or thatch, so it reads as artificial.
  M({ id: 'synthetic-turf', name: 'Synthetic grass', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#76a63e', '#5c8f30'] }),
  // MSI Evergrass, the turf Green Lion installs most (msisurfaces.com, read 2026-11-17). Colors from MSI's swatch and
  // pile-height photos; the overall tone (`mean`) is read from MSI's outdoor photos of each, installed: Summer Gold is a deep two-tone green, Viridian a brighter
  // olive yellow-green. All three are 3/8 in gauge with field green + olive green yarn.
  M({ id: 'msi-summer-gold-96', name: 'MSI Evergrass Summer Gold 96', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#4f7a33', '#445d31', '#2f4a24', '#203518'],
    turf: { pileMm: 45, faceOz: 70, yarn: ['#4c7a30', '#5f7434'], tip: '#8fae55', thatch: ['#a18f73', '#5b6a3a'], thatchShow: 0.12, blade: 'mixed', mean: '#2c3d1c' },
    matches: 'MSI Evergrass Summer Gold 96', maker: 'MSI', line: 'Evergrass', shelf: 'Synthetic turf', color: 'Summer Gold 96' }),
  M({ id: 'msi-viridian-91', name: 'MSI Evergrass Viridian 91', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#869146', '#74823c', '#55672c', '#314116'],
    turf: { pileMm: 45, faceOz: 65, yarn: ['#5d7a30', '#7d8a40'], tip: '#a7aa5f', thatch: ['#bfae7c', '#7b8048'], thatchShow: 0.2, blade: 'W', mean: '#6a7d38' },
    matches: 'MSI Evergrass Viridian Turf 91', maker: 'MSI', line: 'Evergrass', shelf: 'Synthetic turf', color: 'Viridian 91' }),
  M({ id: 'msi-viridian-pet-96', name: 'MSI Evergrass Viridian Pet 96', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#7d8c45', '#697035', '#5d6735', '#4b5225'],
    turf: { pileMm: 30, faceOz: 70, yarn: ['#5d7a30', '#7d8a40'], tip: '#a7aa5f', thatch: ['#bfae7c', '#7b8048'], thatchShow: 0.24, blade: 'D', mean: '#646f36' },
    matches: 'MSI Evergrass Viridian Pet Turf 96', maker: 'MSI', line: 'Evergrass', shelf: 'Synthetic turf', color: 'Viridian Pet 96' }),
  // Mulch and rock
  M({ id: 'black-mulch', name: 'Black mulch', use: 'bed', group: 'Mulch and rock', recipe: 'mulch', palette: ['#3a342f', '#221e1b'] }),
  M({ id: 'brown-mulch', name: 'Red-brown bark', use: 'bed', group: 'Mulch and rock', recipe: 'mulch', palette: ['#6e4a2f', '#4a3121'] }),
  // Natural fir bark (the plain brown bark most beds get). Palettes are typical bagged and bulk colors, not a maker's.
  M({ id: 'fir-bark', name: 'Fir bark mulch, natural brown', use: 'bed', group: 'Mulch and rock', recipe: 'mulch', palette: ['#8a5c3a', '#5e3d27'] }),
  // Soil fills, drawn as a bed of soft clods (builder/humus.ts, engine/humus-field.ts). Colors are albedo, set so each
  // renders in the default light at the tones measured from photos of it spread in beds.
  // Black humus, the compost mix Green Lion spreads in beds: near-black, crumbly and a little damp when fresh, lumpy with
  // soft clods, a few short shreds of dark bark, a very rare pale fleck. The id stays `humus` so saved plans keep it.
  M({ id: 'humus', name: 'Black humus (compost mix)', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#3a302a', '#211b18'],
    crumb: {
      soil: [{ c: '#3b3027', share: 0.3 }, { c: '#46392d', share: 0.28 }, { c: '#31281f', share: 0.2 }, { c: '#514133', share: 0.16 }, { c: '#5d4c3b', share: 0.06 }],
      fiber: ['#4f3f2d', '#65523d', '#7f6a4f', '#3c3024'],
      speck: ['#bdb8aa', '#9c9482'],
      mean: '#43372c',
      mound: 0.02,
      style: { clods: 0.55, scale: 0.32, fibers: 0.6, lightFibers: 0.12 },
      loose: { clods: 0, shreds: 3, shredIn: [0.3, 0.9] },
    } }),
  // Compost: dark brown, a little lighter and coarser than black humus, with plenty of woody bits and shredded fiber,
  // some of it lighter brown.
  M({ id: 'compost', name: 'Compost', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#4a3a2c', '#2e241b'],
    crumb: {
      soil: [{ c: '#3f3427', share: 0.3 }, { c: '#4a3c2d', share: 0.28 }, { c: '#342b20', share: 0.2 }, { c: '#554535', share: 0.16 }, { c: '#62503c', share: 0.06 }],
      fiber: ['#5a4630', '#7a6044', '#97795a', '#46362a'],
      speck: ['#b0a690', '#928872'],
      mean: '#4a3d30',
      mound: 0.025,
      style: { clods: 0.6, scale: 0.42, fibers: 1, lightFibers: 0.4 },
      loose: { clods: 0, shreds: 16, shredIn: [0.5, 1.6] },
    } }),
  // Dirt / topsoil: medium brown, fine, drier and more powdery, few clods and hardly a fiber.
  M({ id: 'topsoil', name: 'Dirt / topsoil', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#6e5a46', '#4c3d2f'],
    crumb: {
      soil: [{ c: '#6e5843', share: 0.3 }, { c: '#7a6349', share: 0.28 }, { c: '#614d3b', share: 0.2 }, { c: '#86705a', share: 0.16 }, { c: '#937d65', share: 0.06 }],
      fiber: ['#5a4636', '#6e5946', '#7f6a55', '#4e3d2f'],
      speck: ['#b3a690', '#988a74'],
      mean: '#705a45',
      mound: 0.015,
      style: { clods: 0.35, scale: 0.28, fibers: 0.1, lightFibers: 0 },
      loose: { clods: 0, shreds: 0, shredIn: [0.4, 0.8] },
    } }),
  M({ id: 'decomposed-granite', name: 'Decomposed granite', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#b39a78', '#8f7a5d'] }),
  M({ id: 'river-rock', name: 'River rock', use: 'bed', group: 'Mulch and rock', recipe: 'riverRock', palette: ['#a8a399', '#8d8a83', '#5f5b55'] }),
  M({ id: 'black-pebble', name: 'Black beach pebble', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble', palette: ['#4a4a48', '#2a2a29', '#151515'] }),
  M({ id: 'lava-rock', name: 'Black lava rock', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#3a3836', '#252322'] }),
  // Mexican beach pebble, the "black" grade Green Lion buys, unpolished: dry it is a cool blue-green gray to charcoal
  // (colors from photos of the dry stone), smooth flattened ovals with fine light flecks, a few warm gray and rust-stained
  // stones. Sold by size; drawn stone by stone (builder/pebbles.ts).
  ...([[0.5, 1, 'half-1', '1/2-1 in'], [1, 2, '1-2', '1-2 in'], [2, 3, '2-3', '2-3 in']] as const).map(([lo, hi, key, label]) => M({
    id: `mexican-beach-pebble-${key}`, name: `Mexican beach pebble, ${label}`, use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#6c7578', '#5d6669', '#4f585b', '#424a4d'],
    pebble: { minIn: lo, maxIn: hi, wide: [0.62, 0.86], thick: [0.34, 0.52], colors: [
      { c: '#7d8586', share: 0.1 }, { c: '#6b7374', share: 0.18 }, { c: '#5d6566', share: 0.22 }, { c: '#4f5759', share: 0.2 },
      { c: '#424a4d', share: 0.14 }, { c: '#33393c', share: 0.1 }, { c: '#6e6a62', share: 0.04 }, { c: '#7a6b58', share: 0.02 },
    ] },
    matches: `Mexican beach pebble, black, ${label}`, maker: 'Natural stone', line: 'Mexican beach pebble', shelf: 'Rock', color: label,
  })),
  // Bark and wood chips Green Lion buys by the yard (California Landscape Supply), drawn chip by chip (builder/pebbles.ts,
  // form 'chip'). Walk On Bark: shredded fir and pine chips, 1-3 in, natural tan to red-brown with some fresh, paler wood.
  M({ id: 'walk-on-bark', name: 'Walk On Bark, natural brown', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#9a6b47', '#83593a', '#6d4a31', '#563a27'],
    pebble: { form: 'chip', minIn: 1, maxIn: 3, wide: [0.18, 0.38], thick: [0.12, 0.24], colors: [
      { c: '#93653f', share: 0.23 }, { c: '#7f5636', share: 0.25 }, { c: '#6b472d', share: 0.2 }, { c: '#a87a52', share: 0.13 },
      { c: '#583a25', share: 0.12 }, { c: '#b08660', share: 0.02 }, { c: '#46301f', share: 0.05 },
    ] },
    matches: 'Walk On Bark (California Landscape Supply)' }),
  // Small black wood chips: dyed wood chips, 1/2-1 1/2 in, charcoal black with a little brown wood showing at the breaks.
  M({ id: 'black-wood-chips', name: 'Black wood chips, small', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#4a433d', '#403a35', '#36312d', '#2c2826'],
    pebble: { form: 'chip', minIn: 0.5, maxIn: 1.5, wide: [0.3, 0.55], thick: [0.12, 0.22], colors: [
      { c: '#403a35', share: 0.28 }, { c: '#36312d', share: 0.26 }, { c: '#4a433d', share: 0.2 }, { c: '#2c2826', share: 0.14 },
      { c: '#5a4b3e', share: 0.07 }, { c: '#6b5847', share: 0.05 },
    ] },
    matches: 'Small Black Wood Chips (California Landscape Supply)' }),
  // Crushed gravel in the three sizes Green Lion buys (3/8 in Lodi crushed stone, 3/4 in crushed rock, 1 1/2 in gravel),
  // drawn stone by stone (form 'crushed'), in one valley tan-gray blend so the sizes compare: warm tan, gray and
  // brown-gray pieces, a few rust-stained and pale ones.
  ...([[0.25, 0.5, '3-8', '3/8 in', 'Lodi crushed stone 3/8 in (SiteOne)'], [0.45, 0.85, '3-4', '3/4 in', '3/4 in crushed rock (California Landscape Supply)'], [1, 1.6, '1-1-2', '1 1/2 in', '1 1/2 in gravel (Resource Building Materials)']] as const).map(([lo, hi, key, label, buys]) => M({
    id: `crushed-gravel-${key}`, name: `Crushed gravel, ${label}`, use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble',
    palette: ['#a99c8a', '#928676', '#7d7366', '#665e54'],
    pebble: { form: 'crushed', minIn: lo, maxIn: hi, wide: [0.62, 0.9], thick: [0.45, 0.75], colors: [
      { c: '#a69a88', share: 0.2 }, { c: '#918677', share: 0.2 }, { c: '#7d7467', share: 0.17 }, { c: '#b8ac99', share: 0.12 },
      { c: '#6b635a', share: 0.12 }, { c: '#9c8168', share: 0.1 }, { c: '#cbc0ae', share: 0.05 }, { c: '#575049', share: 0.04 },
    ] },
    matches: buys, maker: 'Natural stone', line: 'Crushed gravel', shelf: 'Rock', color: label,
  })),
  M({ id: 'white-cobble', name: 'White and tan cobble', use: 'bed', group: 'Mulch and rock', recipe: 'cobble', palette: ['#e3ddd1', '#cfc5b4', '#b5a993'] }),
  M({ id: 'cobble', name: 'River cobble', use: 'bed', group: 'Mulch and rock', recipe: 'cobble', palette: ['#c2b8a6', '#8f8679', '#6d675e'] }),
  // Pavers
  M({ id: 'paver-ashlar-gray', name: 'Multi-size paver, gray blend', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#b9b6af', '#a3a09a', '#8f8c87', '#7c7a76'], pattern: { kind: 'ashlar', sizes: ASHLAR, joint: 0.2, face: 'textured' }, thickness: 0.06, matches: 'Belgard Catalina / Dimensions style' }),
  M({ id: 'paver-ashlar-light', name: 'Multi-size paver, light blend', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#d6d0c4', '#c6bfb2', '#b3ab9e', '#a1998c'], pattern: { kind: 'ashlar', sizes: ASHLAR, joint: 0.2, face: 'textured' }, thickness: 0.06 }),
  M({ id: 'paver-ashlar-tan', name: 'Multi-size paver, tan blend', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#d5c6a8', '#c2ae8a', '#a8916f', '#8d7a60'], pattern: { kind: 'ashlar', sizes: ASHLAR, joint: 0.2, face: 'textured' }, thickness: 0.06 }),
  M({ id: 'paver-large-gray', name: 'Large-format paver, gray', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#b5b2ab', '#a19e98', '#8d8a85'], pattern: { kind: 'ashlar', sizes: LARGE_ASHLAR, joint: 0.15, face: 'smooth' }, thickness: 0.07 }),
  M({ id: 'paver-holland-charcoal', name: 'Holland-style 4x8, charcoal', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#5e5c59', '#504e4b', '#43413f'], pattern: { kind: 'running', sizes: [[8, 4]], joint: 0.15 }, thickness: 0.06, matches: 'Belgard Holland style' }),
  M({ id: 'paver-herringbone-tan', name: 'Herringbone 4x8, tan', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#c9a982', '#b38f69', '#9c7b5a'], pattern: { kind: 'herringbone', sizes: [[8, 4]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'paver-cobble', name: 'Tumbled cobble, 3-piece', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#b39c84', '#9a8673', '#7e6e60', '#a5927c'], pattern: { kind: 'cobble', sizes: [[6, 6], [9, 6], [12, 6]], joint: 0.3, tumbled: true }, thickness: 0.06, matches: 'Belgard Cambridge Cobble style' }),
  M({ id: 'slab-24', name: '24x24 slab, light gray', use: 'hardscape', group: 'Pavers', recipe: 'paver', palette: ['#bdbab3', '#b1aea7'], pattern: { kind: 'grid', sizes: [[24, 24]], joint: 0.12, face: 'smooth' }, thickness: 0.07 }),
  // Porcelain
  M({ id: 'porcelain-plank-gray', name: 'Porcelain plank, mixed gray', use: 'hardscape', group: 'Porcelain', recipe: 'paver', palette: ['#d9d6cf', '#bfbbb3', '#a6a29b', '#8d8a85'], pattern: { kind: 'plank', sizes: [[48, 8]], joint: 0.08, face: 'woodgrain' }, thickness: 0.05 }),
  M({ id: 'porcelain-plank-light', name: 'Porcelain plank, light', use: 'hardscape', group: 'Porcelain', recipe: 'paver', palette: ['#e2ddd2', '#d4cdbf', '#c6beaf'], pattern: { kind: 'plank', sizes: [[48, 12]], joint: 0.08, face: 'woodgrain' }, thickness: 0.05 }),
  M({ id: 'porcelain-24-light', name: 'Porcelain 24x48, light stone', use: 'hardscape', group: 'Porcelain', recipe: 'paver', palette: ['#e4e1da', '#d9d5cc'], pattern: { kind: 'grid', sizes: [[48, 24]], joint: 0.08, face: 'smooth' }, thickness: 0.05 }),
  // Concrete: Green Lion's own lines (CONCRETE_LINES below), one look per integral color. The old ids stay: saved plans use them.
  ...concreteLooks(),
  // Natural stone
  M({ id: 'flagstone-dg', name: 'Flagstone set in DG', use: 'hardscape', group: 'Natural stone', recipe: 'flagstone', palette: ['#c3b39a', '#a99a82', '#8e7f69'], thickness: 0.04 }),
  M({ id: 'flagstone', name: 'Flagstone', use: 'hardscape', group: 'Natural stone', recipe: 'flagstone', palette: ['#b3a088', '#9b8a72', '#7c6c58'], thickness: 0.06 }),
  // Decking
  M({ id: 'composite-gray', name: 'Composite deck, gray', use: 'hardscape', group: 'Decking', recipe: 'deck', palette: ['#8f8a84', '#77726c', '#615d58'], thickness: 0.3 }),
  M({ id: 'wood-deck', name: 'Cedar deck', use: 'hardscape', group: 'Decking', recipe: 'deck', palette: ['#a5714a', '#8a5d3b', '#6f4a2f'], thickness: 0.35 }),
  // Borders (soldier course along hardscape edges)
  M({ id: 'border-charcoal', name: 'Charcoal soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#55534f', '#4a4845', '#3e3c3a'], pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-charcoal-wide', name: 'Charcoal border, 6x12', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#55534f', '#4a4845', '#3e3c3a'], pattern: { kind: 'soldier', sizes: [[6, 12]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-tan', name: 'Tan soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#a8916f', '#97805f', '#86704f'], pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-gray', name: 'Gray soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#8f8c87', '#7c7a76', '#6a6865'], pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-light', name: 'Light soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#d6d0c4', '#c6bfb2', '#b3ab9e'], pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06 }),
  // Walls
  M({ id: 'wall-tan-charcoal-cap', name: 'Tan block, charcoal cap', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#d2c3a4', '#c4b392', '#b5a383'], wall: { face: 'smoothBlock', cap: '#3d3d3d' } }),
  M({ id: 'wall-gray-block', name: 'Gray block, gray cap', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#a3a09a', '#8f8c87', '#7c7a76'], wall: { face: 'splitFace', cap: '#9c9a95' } }),
  M({ id: 'wall-plaster', name: 'Smooth plaster, gray', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#9c958c', '#8a837a'], wall: { face: 'plaster', cap: '#9c958c' } }),
  M({ id: 'wall-ledgestone', name: 'Ledgestone veneer, travertine', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#d9c8ab', '#c3ad8c', '#a99273'], wall: { face: 'ledgestone', cap: '#c9bca5' } }),
  M({ id: 'wall-stucco', name: 'Stucco wall, tan', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#b3a58f', '#a29480'], wall: { face: 'plaster', cap: '#a89a84' } }),
  M({ id: 'wall-dark-stacked', name: 'Dark stacked stone veneer', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#3d3b39', '#2e2d2c', '#24231f', '#46423d'], wall: { face: 'ledgestone', cap: '#2e2d2c' } }),
  M({ id: 'wall-stacked-stone', name: 'Stacked stone veneer, brown', use: 'wall', group: 'Walls', recipe: 'wall', palette: ['#a88a6c', '#8a6e55', '#6e5745', '#b9a184'], wall: { face: 'stackedStone', cap: '#b9a58a' } }),
  // Fences
  M({ id: 'fence-board-on-board', name: 'Board-on-board, natural cedar', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#b08a63', '#9a7552', '#86643f'], fence: 'boardOnBoard' }),
  M({ id: 'fence-gray-lattice', name: 'Gray board, cedar lattice top', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#7d8083', '#6d7073', '#5d6063'], fence: 'grayLattice' }),
  // Green Lion's own build (builder/decor/fence-gray-lattice.ts): gray-painted board-on-board to the fence height, a 1 ft cedar lattice topper above it, natural cedar posts and cap.
  M({ id: 'fence-gray-board-cedar-lattice', name: 'Gray board-on-board, cedar lattice topper', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#7c8083', '#74787b', '#6c7073'], fence: 'grayBoardLattice' }),
  M({ id: 'fence-dog-ear', name: 'Dog-ear picket, natural', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#c4a47e', '#b0906a', '#9a7b57'], fence: 'dogEar' }),
  M({ id: 'fence-horizontal', name: 'Horizontal slat, cedar', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#a5714a', '#8a5d3b', '#76502f'], fence: 'horizontal' }),
  M({ id: 'fence-vinyl', name: 'Vinyl privacy, white', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#ecebe6', '#e2e0da'], fence: 'vinyl' }),
  M({ id: 'fence-chainlink-slat', name: 'Chain-link with privacy slats, tan', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#b3a68f', '#a3967f'], fence: 'chainlinkSlat' }),
  M({ id: 'fence-dark-stained', name: 'Dog-ear, dark stain', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#5a3f30', '#4c3427', '#40291f'], fence: 'dogEar' }),
  M({ id: 'fence-weathered', name: 'Dog-ear, weathered', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#9a8a78', '#887868', '#766758'], fence: 'dogEar' }),
  M({ id: 'fence-iron-view', name: 'Iron view fence, black', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1e1e1e', '#2a2a2a'], fence: 'steelPicket' }),
  // Black powder-coated ornamental metal picket on a low concrete mow curb (builder/decor/fence-metal-picket.ts): flush-top pickets 4 in on center, two rails, posts every 6 ft.
  M({ id: 'fence-black-metal-picket', name: 'Black metal picket, 5 ft', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1b1b1d'], fence: 'metalPicket', fenceHeight: 1.52 }),
  M({ id: 'fence-black-metal-picket-4ft', name: 'Black metal picket, 4 ft', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1b1b1d'], fence: 'metalPicket', fenceHeight: 1.22 }),
  M({ id: 'fence-bronze-metal-picket', name: 'Bronze metal picket, 5 ft', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#4a3a2c'], fence: 'metalPicket', fenceHeight: 1.52 }),
  M({ id: 'fence-steel-picket', name: 'Steel picket, black', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1e1e1e', '#2a2a2a'], fence: 'steelPicket' }),
  // Edging
  M({ id: 'curb-charcoal', name: 'Charcoal curb', use: 'edging', group: 'Edging', recipe: 'curb', palette: ['#55534f', '#4a4845'], matches: 'Belgard Melville curb style' }),
  M({ id: 'steel-edging', name: 'Steel edging', use: 'edging', group: 'Edging', recipe: 'steelEdging', palette: ['#4a3a2e', '#3a2d24'] }),
];

/* ------------------------------------------------------------------ */
/* Belgard lines Green Lion installs                                    */
/* ------------------------------------------------------------------ */
/* Color names are Belgard's. The four colors per entry are averages read from Belgard's own swatch
   thumbnails (lightest to darkest), so they are close, not exact; no Belgard image ships with the app.
   Catalina Grana: 3-piece large set for the main course, and its 6 x 9 border piece for the edge, both with a smooth face. */
type Blend = [string, string[]];
const CATALINA_GRANA: Blend[] = [
  ['Amaretto', ['#bda58c', '#b1977f', '#a48a73', '#967c67']],
  ['Anthracite', ['#64615d', '#5a5754', '#504e4d', '#4a4947']],
  ['Aspen', ['#bba284', '#b49c7f', '#ab9479', '#a08b72']],
  ['Bella', ['#846f5c', '#7d6a5a', '#756557', '#685f57']],
  ['Brown Beige Charcoal', ['#97887f', '#8b7e76', '#81746e', '#746c69']],
  ['Cream Tan Brown', ['#9a8672', '#907a68', '#887260', '#7d695a']],
  ['Gray Charcoal', ['#868581', '#7f7e7a', '#757471', '#696866']],
  ['Gray Charcoal Tan', ['#86817a', '#7d7771', '#857566', '#736d68']],
  ['Hickory', ['#7f766b', '#7c7267', '#796e62', '#74695f']],
  ['Linen', ['#a08f7d', '#9a8a78', '#948574', '#8c7e6e']],
  ['Midnight', ['#4d4c4a', '#4c4b49', '#4a4947', '#484745']],
  ['Montecito', ['#a99471', '#a28d6a', '#9c8664', '#927f60']],
  ['Napoli', ['#b6a394', '#a69183', '#958275', '#7e7067']],
  ['Rainier', ['#7f7163', '#796d60', '#73695e', '#6c645b']],
  ['Rio', ['#847c6f', '#7b7369', '#736c63', '#6c655e']],
  ['Riviera', ['#a19b8f', '#969086', '#8c867d', '#817b74']],
  ['Scandina Gray', ['#cbc4bc', '#b9b3ae', '#aca8a4', '#9d9a96']],
  ['Sepia', ['#ac9a84', '#a8937c', '#a38e77', '#998671']],
  ['Shaded Gray', ['#8e8982', '#89847e', '#86807a', '#7f7a74']],
  ['Sierra', ['#776359', '#725f57', '#6c5c55', '#665852']],
  ['Slate', ['#706e6a', '#696763', '#63615e', '#5b5957']],
  ['Sonoran Gray', ['#7e7570', '#746b67', '#6d6360', '#645b58']],
  ['Tan Brown Charcoal', ['#8c745f', '#816e60', '#786a60', '#6f655e']],
  ['Tan Red Charcoal', ['#8f705a', '#8d6754', '#846451', '#7c6050']],
  ['Titanium', ['#c0b8a8', '#aaa59b', '#95928c', '#80807b']],
  ['Toscana', ['#90765d', '#867059', '#7d6956', '#736353']],
  ['Victorian', ['#83796b', '#8f765b', '#83705a', '#776e61']],
];
const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const CATALINA_SIZES: [number, number][] = [[6, 12], [9, 12], [12, 12]];
const BELGARD: MaterialSpec[] = [
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `catalina-grana-${slugOf(n)}`, name: `Catalina Grana, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'ashlar', sizes: CATALINA_SIZES, joint: 0.2, face: 'smooth' }, thickness: 0.06, matches: 'Belgard Catalina Grana', maker: 'Belgard', line: 'Catalina Grana', shelf: 'Pavers', color: n })),
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `border-of-catalina-grana-${slugOf(n)}`, name: `Catalina Grana border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15, face: 'smooth' }, thickness: 0.06, auto: true })),
  // Every Catalina Grana color as its own 6 x 9 border, offered on its own (not only as "same as the main course").
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `catalina-grana-border-${slugOf(n)}`, name: `Catalina Grana border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15, face: 'smooth' }, thickness: 0.06, matches: 'Belgard Catalina Grana', maker: 'Belgard', line: 'Catalina Grana', shelf: 'Pavers', color: n })),
  // The generated lines (belgard.ts): pavers with a matching border each, walls and curb.
  ...BELGARD_LINES.flatMap((L): MaterialSpec[] => L.colors.flatMap(([n, palette]): MaterialSpec[] => {
    const id = `${L.slug}-${slugOf(n)}`;
    const tags = { matches: `Belgard ${L.name}`, maker: 'Belgard', line: L.name, shelf: L.shelf, color: n };
    if (L.shelf === 'Pavers') {
      const sizes = L.colorSizes?.[n] ?? L.sizes ?? CATALINA_SIZES;
      return [
        M({ id, name: `${L.name}, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: sizes.length > 1 ? 'ashlar' : 'running', sizes, joint: L.joint ?? 0.2, face: L.face ?? 'textured' }, thickness: 0.06, ...tags }),
        M({ id: `border-of-${id}`, name: `${L.name} border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15, ...(L.face ? { face: L.face } : {}) }, thickness: 0.06, auto: true }),
        // A line that sells its own border stone (Avalon Slate) offers every color as a border on its own too.
        ...(L.border ? [M({ id: `${L.slug}-border-${slugOf(n)}`, name: `${L.name} border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: L.joint ?? 0.15, face: L.face ?? 'textured' }, thickness: 0.06, matches: `Belgard ${L.name}`, maker: 'Belgard', line: L.name, shelf: 'Pavers', color: n })] : []),
      ];
    }
    if (L.shelf === 'Curb') return [M({ id, name: `${L.name}, ${n}`, use: 'edging', group: 'Edging', recipe: 'curb', palette: palette.slice(1, 3), ...tags })];
    return [M({ id, name: `${L.name}, ${n}`, use: 'wall', group: 'Walls', recipe: 'wall', palette, wall: { face: L.wall?.face ?? 'splitFace', cap: palette[1], ...(L.wall ? { unit: L.wall.unit } : {}) }, ...tags })];
  })),
];
MATERIALS.push(...BELGARD);

/*
 * Belgard Dimensions Slabs, 2 3/8 in thick, used one at a time as stepping stones in the line's three sizes (12 x 24,
 * 24 x 24 and 24 x 36; the stepping stone features carry the size). Smooth face, the Dimensions Slabs colors: one look
 * per color, named for the 24 x 24 it was first mapped as. A stepping stone placement names one of these as its
 * materialId; laid as a field they read as a 24 x 24 grid.
 */
export const SLAB_24_PREFIX = 'dimensions-slab-24-';
const SLABS = BELGARD_LINES.find((l) => l.slug === 'dimensions-slabs');
MATERIALS.push(...(SLABS?.colors ?? []).map(([n, palette]): MaterialSpec => M({ id: `${SLAB_24_PREFIX}${slugOf(n)}`, name: `Dimensions Slab 24 x 24, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'grid', sizes: [[24, 24]], joint: 0.15, face: 'smooth' }, thickness: 0.06, matches: 'Belgard Dimensions Slabs', maker: 'Belgard', line: 'Dimensions Slabs 24 x 24', shelf: 'Pavers', color: n })));

/*
 * Flagstone Green Lion buys, for stepping stones (and the flagstone pieces of water features). Each is natural stone
 * split along its bedding, so every piece has its own outline; the colors follow the yards' own descriptions:
 *   Cold Water Canyon (Resource Building Materials): a porous rhyolite (lava) flagstone, reddish brown to black, with
 *     dark and pale lichen on its top; flat, semi rounded to irregular pieces.
 *   AZ Classic Oak (California Landscape Supply, sold Select, 2 in thick): Arizona sandstone, pale cream to buff with
 *     tan swirls and a faint pink mottle.
 *   SUI Black Slate (Stone Universe, via California Landscape Supply, 1 in thick): charcoal gray to black, lightly riven.
 * Cold Water Canyon's thickness is not given (sold by the pound): drawn 2 in, as flagstone steppers usually are.
 * Not offered as paving areas yet (auto): they are used one piece at a time.
 */
export type FlagStone = 'rhyolite' | 'sandstone' | 'slate';
export const FLAGSTONE_PREFIX = 'flagstone-';
export const FLAGSTONES: { id: string; name: string; sold: string; stone: FlagStone; thicknessIn: number; palette: string[] }[] = [
  { id: 'flagstone-cold-water-canyon', name: 'Cold Water Canyon', sold: 'Resource Building Materials', stone: 'rhyolite', thicknessIn: 2, palette: ['#6a4a3b', '#553d32', '#3a2f2b', '#7a5845'] },
  { id: 'flagstone-az-classic-oak', name: 'AZ Classic Oak', sold: 'California Landscape Supply', stone: 'sandstone', thicknessIn: 2, palette: ['#e3cfae', '#d6bb95', '#c7a47e', '#dfc0a8'] },
  { id: 'flagstone-sui-black-slate', name: 'SUI Black Slate', sold: 'Stone Universe, through California Landscape Supply', stone: 'slate', thicknessIn: 1, palette: ['#5b5954', '#504e4a', '#464541', '#64605a'] },
];
MATERIALS.push(...FLAGSTONES.map((g): MaterialSpec => M({ id: g.id, name: `${g.name} flagstone`, use: 'hardscape', group: 'Natural stone', recipe: 'flagstone', palette: g.palette, thickness: g.thicknessIn * 0.0254, matches: `${g.name} flagstone (${g.sold})`, line: `${g.name} flagstone`, color: g.name, auto: true, flag: { stone: g.stone, thicknessIn: g.thicknessIn } })));

/*
 * Basalite lines (basalite.ts): Premier Slab, a smooth 594 mm (23 1/2 in) square slab, 60 mm thick, laid in a grid on
 * its spacer joints. Its colors are clouded blends. Basalite sells no border stone for it, so it has no matching border.
 */
// Composite deck boards (siteplan/decking.ts), one look per color.
for (const L of DECK_LINES) {
  for (const [n, palette] of L.colors) {
    MATERIALS.push(M({ id: `${L.slug}-${slugOf(n)}`, name: `${L.maker} ${L.name}, ${n}`, use: 'hardscape', group: 'Decking', recipe: 'deck', palette, thickness: L.board.thicknessIn * 0.0254, matches: `${L.maker} ${L.name}`, maker: L.maker, line: L.name, shelf: 'Decking', color: n, board: L.board }));
  }
}
for (const L of BASALITE_LINES) {
  for (const [n, palette] of L.colors) {
    MATERIALS.push(M({ id: `${L.slug}-${slugOf(n)}`, name: `${L.name} 24 x 24, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'grid', sizes: [L.size], joint: L.joint, face: 'smooth', blend: 'cloud', jointSand: L.jointSand }, thickness: L.thickness, matches: `Basalite ${L.name}`, maker: 'Basalite', line: L.name, shelf: 'Pavers', color: n }));
  }
}

/*
 * Large-format cast concrete slab: a generic slab poured or cast to the size of a one-slab pad (a 3 ft x 3 ft stepping
 * pad, say), in the same six integral colors as Green Lion concrete. No maker sells a unit of such a size in the
 * catalog, so this is the only look offered for a pad no real product fits (siteplan/pads.ts). Smooth face, 2 in thick.
 */
export const PAD_SLAB_LINE = 'Large-format slab';
export const PAD_SLAB_PREFIX = 'pad-slab-';
MATERIALS.push(...CONCRETE_COLORS.map((c): MaterialSpec => M({
  id: `${PAD_SLAB_PREFIX}${c.id}`, name: `Large-format slab, ${c.name.toLowerCase()}`, use: 'hardscape', group: 'Pavers', recipe: 'paver',
  palette: [c.palette[0], c.palette[1], c.palette[1], c.palette[1]], pattern: { kind: 'grid', sizes: [[36, 36]], joint: 0.15, face: 'smooth' }, thickness: 0.05,
  maker: 'Green Lion', line: PAD_SLAB_LINE, shelf: 'Pavers', color: c.name, padSlab: true,
})));

/*
 * Paver edging: a single row of 6 x 9 pavers laid along a drawn line (a soldier course, or a sailor course), in any color
 * Belgard sells as a 6 x 9 unit where Green Lion orders (Belgard's Pacific Stockton region, read from belgard.com):
 * Dimensions Single Unit 6 x 9 x 2 3/8 in, and Antiqued Flat Top (its 6 x 9 border stone). Catalina Grana's border and
 * Avalon Slate's 6 x 9 are listed for other regions only, so they are not offered here. Belgard's pages list colors per
 * region, not per size, so a color here is one the region carries for that line.
 */
export const PAVER_EDGE_PREFIX = 'paver-edge-';
const PAVER_EDGE_6X9: { slug: string; colors: string[] }[] = [
  { slug: 'dimensions-single-units', colors: ['Anthracite', 'Aspen', 'Bella', 'Bourbon', 'Brown Beige Charcoal', 'Cream Tan Brown', 'Fog', 'Graphite', 'Gray Charcoal', 'Gray Charcoal Tan', 'Hickory', 'Iron Bay', 'Midnight', 'Pearl', 'Riviera', 'Rosewood', 'Scandina Gray', 'Sepia', 'Shaded Gray', 'Tan Brown Charcoal', 'Tan Red Charcoal', 'Toscana', 'Victorian'] },
  { slug: 'antiqued-flat-top', colors: ['Cream Tan Brown', 'Gray Charcoal Tan', 'Gray Charcoal', 'Midnight', 'Shaded Gray', 'Tan Brown Charcoal'] },
];
/** The paver edging look used when none is picked: Dimensions Single Unit 6 x 9 in Anthracite. */
export const PAVER_EDGE_DEFAULT = `${PAVER_EDGE_PREFIX}dimensions-single-units-anthracite`;
for (const E of PAVER_EDGE_6X9) {
  const L = BELGARD_LINES.find((l) => l.slug === E.slug);
  if (!L) continue;
  const name = L.slug === 'dimensions-single-units' ? 'Dimensions Single Unit' : L.name;
  for (const c of E.colors) {
    // Color names are matched without punctuation ("Gray/Charcoal" on one page is "Gray Charcoal" on another).
    const hit = L.colors.find(([n]) => slugOf(n) === slugOf(c));
    if (!hit) continue;
    MATERIALS.push(M({ id: `${PAVER_EDGE_PREFIX}${L.slug}-${slugOf(c)}`, name: `${name} 6 x 9, ${c}`, use: 'border', group: 'Pavers', recipe: 'paver', palette: hit[1], pattern: { kind: 'soldier', sizes: [[6, 9]], joint: L.joint ?? 0.15, face: L.face ?? 'textured' }, thickness: 0.06, matches: `Belgard ${name} 6 x 9`, maker: 'Belgard', line: L.name, shelf: 'Paver edge', color: c }));
  }
}

/* ------------------------------------------------------------------ */
/* Features                                                             */
/* ------------------------------------------------------------------ */

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const FEATURES: FeatureSpec[] = [
  F({ id: 'fire-table', name: 'Fire table, rectangular', group: 'Fire', kind: 'fireTable', footprint: [1.5, 0.75] }),
  F({ id: 'fire-pit', name: 'Fire pit, round stone', group: 'Fire', kind: 'firePit', footprint: [1.3, 1.3] }),
  // The Outdoor Plus Cazo Fire & Water Bowl, GFRC, 31 in (maker's spec sheet and product page): built by
  // builder/cazo-fire-water-bowl.ts. The scupper faces the placement's front.
  F({ id: 'top-cazo-fire-water-bowl-31', name: 'The Outdoor Plus Cazo fire and water bowl, 31 in GFRC', group: 'Fire', kind: 'fireWaterBowl', footprint: [31 * 0.0254, 34 * 0.0254],
    maker: 'The Outdoor Plus', page: 'https://theoutdoorplus.com/product/cazo-fire-water-bowl/',
    about: 'The Outdoor Plus Cazo: a round GFRC concrete bowl with a 12 in stainless ring burner under lava rock and a copper scupper in the rim that pours a smooth sheet of water. Shown in Natural Gray.',
    facts: ['31 in across x 10 in tall, 10 in flat base, 3 in flat rim (also 24, 36 and 48 in)', 'Match lit OPT-31RFW or 12 V electronic ignition OPT-31RFWE12V; natural gas or propane, 65,000 BTU', '12 in 304 stainless ring burner in a stainless fire pan; lava rock included', 'Copper scupper with a 3/4 in inlet, 7-10 GPM', '18 GFRC colors, smooth, rustic and metallic'] }),
  F({ id: 'pergola-louvered', name: 'Louvered pergola, aluminum', group: 'Shade', kind: 'pergolaLouvered', footprint: [4.3, 3.7] }),
  // SunVilla Stratus 10 x 13 ft motorized pergola (sunvilla.com): overall 157.3 in L x 118.7 in W x 98.6 in H, aluminum
  // frame in a matte charcoal finish, battery-driven louvered roof, an integrated gutter and LED lighting in the roof.
  F({ id: 'sunvilla-stratus-10x13', name: 'SunVilla Stratus 10 x 13 ft louvered pergola', group: 'Shade', kind: 'pergolaLouvered', model: 'stratus', footprint: [157.3 * 0.0254, 118.7 * 0.0254],
    maker: 'SunVilla', page: 'https://sunvilla.com/products/sunvilla-stratus-10-x-13-motorized-pergola',
    about: 'SunVilla Stratus: a freestanding aluminum pergola with a motorized louvered roof that turns from open sky to full cover, an integrated gutter, and LED lighting built into the roof.',
    facts: ['Overall 157.3 in L x 118.7 in W x 98.6 in H (about 13 x 10 ft, 8 ft 2 in tall)', 'Aluminum frame, charcoal finish; square posts on base plates', 'Louvers driven by a 20 V battery motor (two batteries and charger included)', 'Integrated gutter; LED lighting in the roof'] }),
  F({ id: 'pergola-wood', name: 'Wood pergola', group: 'Shade', kind: 'pergolaWood', footprint: [3.6, 3.0] }),
  F({ id: 'gazebo', name: 'Hardtop gazebo', group: 'Shade', kind: 'gazebo', footprint: [3.6, 3.6] }),
  F({ id: 'umbrella', name: 'Market umbrella', group: 'Shade', kind: 'umbrella', footprint: [2.7, 2.7] }),
  F({ id: 'kitchen-l', name: 'Outdoor kitchen, L-shaped', group: 'Kitchens', kind: 'kitchenL', footprint: [3.6, 2.6] }),
  F({ id: 'kitchen-straight', name: 'Outdoor kitchen, straight', group: 'Kitchens', kind: 'kitchenStraight', footprint: [3.0, 0.8] }),
  F({ id: 'hot-tub', name: 'Hot tub', group: 'Spa and sauna', kind: 'hotTub', footprint: [2.3, 2.3] }),
  // Cal Spas Tropical Plus PPZ-743BC, Patio Plus series (Cal Spas spec sheet and product page): 84 x 84 x 37 in, 43 jets,
  // 6 seats with a cool-off seat. Built by builder/spa-ppz743bc.ts in the finish Green Lion installs; a placement's
  // `cover` and `steps` choose the cover state and the steps.
  F({ id: 'calspas-ppz-743bc', name: 'Cal Spas Tropical Plus PPZ-743BC hot tub', group: 'Spa and sauna', kind: 'hotTub', model: 'ppz-743bc', footprint: [84 * 0.0254, 84 * 0.0254],
    maker: 'Cal Spas', page: 'https://www.calspas.com/hot-tubs-spas-for-sale/patio-plus/tropical-plus-ppz-743bc',
    about: 'Cal Spas Tropical Plus PPZ-743BC (Patio Plus series): a 7 ft, six-seat bench spa with 43 stainless jets, a raised cool-off seat, an LED cascade waterfall and a 5 in multi-color LED spa light. Shown with the Sterling Silver shell, the Taupe Cal Edge cabinet with black corners, a grey cover on a lifter and a two-step.',
    facts: ['84 x 84 x 37 in', '43 stainless jets; 6 seats with a cool-off seat; 4 Y-pillows', 'Pumps: 6.0 BHP and 4.0 BHP Eliminator; 5.5 kW WhisperHot titanium heater; 240 V', 'LED cascade waterfall, 5 in multi-color LED spa light, TP500 control panel', '50 sq ft Teleweir filter', 'Cal Edge horizontal cabinet panels (Smoke, Mist, Taupe)', '4 in to 2.5 in tapered cover (Dark Brown, Grey)', 'About 425 gallons; about 800 lb empty, 4,340 lb filled (dealer listing)'] }),
  F({ id: 'sauna-barrel', name: 'Barrel sauna', group: 'Spa and sauna', kind: 'saunaBarrel', footprint: [2.0, 2.4] }),
  F({ id: 'sauna-cube', name: 'Cube sauna', group: 'Spa and sauna', kind: 'saunaCube', footprint: [2.2, 2.2] }),
  // SaunaLife Model CL5G Cube Luxury (saunalife.com, installation manual V1.1): outside 80.7 in W x 63 in D x 82.7 in H.
  F({ id: 'saunalife-cl5g', name: 'SaunaLife CL5G Cube Luxury sauna, 4 person', group: 'Spa and sauna', kind: 'saunaCube', model: 'saunalife-cl5g', footprint: [80.71 * 0.0254, 63 * 0.0254],
    maker: 'SaunaLife', page: 'https://saunalife.com/saunas/cube-luxury-series-model-cl5g/',
    about: 'SaunaLife Cube-Series Model CL5G: a rounded-cube outdoor sauna for up to 4 people, thermo-spruce staves with black front details, a full bronze-glass front with a glass door, shingled roof, thermo-aspen benches and LED light bars.',
    facts: ['Outside 80.7 in W x 63 in D x 82.7 in H; inside 77.2 W x 55.1 D x 74.8 H', 'Thermo-spruce walls (42 mm), front and back walls 28 mm; shingle roof with drip rails', 'Tempered bronze glass front and door (8 mm), door 23.2 x 66.5 in, square wooden handle', 'Thermo-aspen benches: upper 17.7 in deep, lower 31.1 in, side 23.6 in; white LED light bars', 'Heater bought separately'],
    options: [{ key: 'doorOpen', label: 'Door open', default: false }, { key: 'lightsOn', label: 'Interior lights on', default: true }] }),
  F({ id: 'water-wall-plaster', name: 'Water wall, plaster and ledgestone', group: 'Water', kind: 'waterWallPlaster', footprint: [4.2, 1.2] }),
  F({ id: 'water-wall-porcelain', name: 'Water wall, porcelain panel', group: 'Water', kind: 'waterWallPorcelain', footprint: [2.6, 0.9] }),
  F({ id: 'water-wall-stucco', name: 'Water wall, stucco and dark stone', group: 'Water', kind: 'waterWallStucco', footprint: [3.4, 1.4] }),
  F({ id: 'copper-bowl', name: 'Copper bowl planter', group: 'Accents', kind: 'copperBowl', footprint: [0.75, 0.75] }),
  // Three-pillar stucco pondless water feature and its bowl planters, drawn to a finished Green Lion install
  // (builder/pillarfountain.ts has the sizes and how they were measured). The bowls on the pillars are an option; a
  // bowl planter on its own is planted unless its placement says `planted: false`.
  F({
    id: 'three-pillar-water-feature', name: 'Three-pillar stucco water feature', group: 'Water', kind: 'pillarFountain', footprint: [168 * 0.0254, 50 * 0.0254],
    options: [{ key: 'bowls', label: 'Bowl planters on the pillars', default: true }],
    about: 'A pondless water feature: three smooth-troweled stucco pillars with golden split-face ledger stone panels between them, a 12 in copper sheer spillway in each panel, copper scuppers pouring from the outer pillars, and a black Mexican beach pebble basin edged with a charcoal curb. A patina bowl planter with a blue agave sits on each pillar (an option).',
    facts: ['Basin 14 ft x 4 ft 2 in, Belgard Melville Curb, Anthracite, showing 5 1/2 in, black Mexican beach pebble 1-2 in, no open water', 'Pillars 2 ft 8 in wide x 2 ft deep x 5 ft 6 in tall, Santa Barbara smooth trowel stucco, warm gray', 'Panels 2 ft wide x 5 ft tall, set back 1 ft 8 in, split-face travertine ledger stone', 'Two 12 in copper sheer spillways (lip 31 in up, LED lit) and two 1 in copper scuppers', 'Option: three 23 in patina bowl planters with blue agave (Agave tequilana)'],
  }),
  F({
    id: 'patina-bowl-planter', name: 'Patina bowl planter, 23 in', group: 'Accents', kind: 'patinaBowl', plantable: true, footprint: [23 * 0.0254, 23 * 0.0254],
    about: 'A wide, shallow bowl planter, 23 in across and 9 in tall: a verdigris-teal band over the shoulder and rim, a dark bronze body, gray gravel top dressing, planted with a blue agave (or left empty).',
    facts: ['23 in across x 9 in tall, 11 in foot', 'Verdigris-teal rim band, dark bronze body', 'Blue agave (Agave tequilana \'Weber Azul\'), kept about 14 in across'],
  }),
  F({ id: 'corten-screen', name: 'Corten screen panel', group: 'Accents', kind: 'cortenScreen', footprint: [1.8, 0.1] }),
  F({ id: 'corten-planter', name: 'Corten planter', group: 'Accents', kind: 'cortenPlanter', footprint: [0.6, 0.6] }),
  ...DECOR_FEATURES,
  F({ id: 'black-planter', name: 'Black square planter', group: 'Accents', kind: 'blackPlanter', footprint: [0.5, 0.5] }),
  F({ id: 'boulder', name: 'Boulder', group: 'Accents', kind: 'boulder', footprint: [1.0, 0.8] }),
  F({ id: 'trellis-cable', name: 'Cable trellis', group: 'Accents', kind: 'trellisCable', footprint: [1.8, 0.05] }),
  F({ id: 'trellis-grid', name: 'Steel grid trellis', group: 'Accents', kind: 'trellisGrid', footprint: [0.9, 0.05] }),
  F({ id: 'stepping-pad', name: 'Stepping pad, 24 in', group: 'Accents', kind: 'steppingPad', footprint: [0.6, 0.6] }),
  // A single Belgard Dimensions Slab 24 x 24 set as a stepping stone; its placement's materialId picks the color.
  F({ id: 'stepping-stone-24', name: 'Stepping stone, 24 x 24 slab', group: 'Accents', kind: 'steppingStone', footprint: [0.6096, 0.6096], stepping: { stone: 'slab', sizeIn: [24, 24] } }),
  // Stepping stones in the sizes usually set (the placement's materialId picks the color; sizes are across x along z,
  // and a path turns x along the path, so a long stone lies across the walk):
  // the Dimensions Slabs line's other two sizes,
  F({ id: 'stepping-stone-12x24', name: 'Stepping stone, 12 x 24 slab', group: 'Accents', kind: 'steppingStone', footprint: [0.3048, 0.6096], stepping: { stone: 'slab', sizeIn: [12, 24] } }),
  F({ id: 'stepping-stone-24x36', name: 'Stepping stone, 24 x 36 slab', group: 'Accents', kind: 'steppingStone', footprint: [0.6096, 0.9144], stepping: { stone: 'slab', sizeIn: [24, 36] } }),
  // 3 x 3 ft and 4 x 4 ft pads of Green Lion's poured concrete (no maker sells a precast stepping slab this big: pads
  // this size are formed and poured in place, 4 in thick, top 1 in above grade, in a concrete line's finish and color),
  F({ id: 'stepping-pad-36', name: 'Stepping pad, 3 x 3 ft poured concrete', group: 'Accents', kind: 'steppingStone', footprint: [0.9144, 0.9144], stepping: { stone: 'pad', sizeIn: [36, 36] } }),
  F({ id: 'stepping-pad-48', name: 'Stepping pad, 4 x 4 ft poured concrete', group: 'Accents', kind: 'steppingStone', footprint: [1.2192, 1.2192], stepping: { stone: 'pad', sizeIn: [48, 48] } }),
  // and flagstone steppers, one natural piece each, in the yards' two stepper sizes (the footprint is the middle size).
  F({ id: 'flagstone-stepper-18-24', name: 'Flagstone stepper, 18 to 24 in', group: 'Accents', kind: 'steppingStone', footprint: [0.5334, 0.5334], stepping: { stone: 'flagstone', sizeIn: [18, 24] } }),
  F({ id: 'flagstone-stepper-24-36', name: 'Flagstone stepper, 24 to 36 in', group: 'Accents', kind: 'steppingStone', footprint: [0.762, 0.762], stepping: { stone: 'flagstone', sizeIn: [24, 36] } }),
  F({ id: 'putting-cup', name: 'Putting cup', group: 'Accents', kind: 'puttingCup', footprint: [0.15, 0.15] }),
  F({ id: 'path-light', name: 'Path light, brass mushroom', group: 'Lighting', kind: 'pathLight', footprint: [0.25, 0.25] }),
  F({ id: 'spot-light', name: 'Uplight, bronze', group: 'Lighting', kind: 'spotLight', footprint: [0.12, 0.12] }),
  // Tru-Scapes low-voltage LED fixtures and transformers, drawn and lit to the maker's specs (siteplan/truscapes.ts).
  ...truscapesFeatures().map(F),
  F({ id: 'bench', name: 'Bench', group: 'Furniture', kind: 'bench', footprint: [1.5, 0.45] }),
  F({ id: 'lounge-set', name: 'Lounge set', group: 'Furniture', kind: 'loungeSet', footprint: [3.2, 2.6] }),
  F({ id: 'bistro-set', name: 'Bistro set', group: 'Furniture', kind: 'bistroSet', footprint: [1.4, 1.4] }),
  F({ id: 'dining-set', name: 'Dining set, 6 seats', group: 'Furniture', kind: 'diningSet', footprint: [2.6, 2.0] }),
];

export const plantById = new Map(PLANTS.map((p) => [p.id, p]));
/**
 * Bed fills, as Area Planner orders them: the kind of fill, the depth it is usually spread (in), and for rock, gravel
 * and DG the weight of a cubic yard (tons; bark and soil are ordered by the yard). DG is its own kind: it is compacted
 * and ordered by the ton like gravel, but laid as a surface, not a loose bed.
 */
function bedFill(m: MaterialSpec): Pick<MaterialSpec, 'fillType' | 'depthIn' | 'tonsPerCuYd'> {
  if (m.recipe === 'mulch') return { fillType: 'bark', depthIn: 3 };
  if (m.crumb) return { fillType: 'humus', depthIn: m.id === 'topsoil' ? 3 : 2.5 };
  if (m.id === 'decomposed-granite') return { fillType: 'dg', depthIn: 3, tonsPerCuYd: 1.4 };
  // Lava rock is porous and light.
  if (m.id === 'lava-rock') return { fillType: 'rock', depthIn: 2.5, tonsPerCuYd: 0.7 };
  if (m.pebble?.form === 'chip') return { fillType: 'bark', depthIn: 3 };
  if (m.pebble) return { fillType: 'rock', depthIn: m.pebble.maxIn <= 1 ? 2 : m.pebble.maxIn <= 2 ? 2.5 : 3, tonsPerCuYd: 1.45 };
  if (m.recipe === 'blackPebble') return { fillType: 'rock', depthIn: 2.5, tonsPerCuYd: 1.45 };
  if (m.recipe === 'cobble') return { fillType: 'rock', depthIn: 3.5, tonsPerCuYd: 1.4 };
  return { fillType: 'rock', depthIn: 3, tonsPerCuYd: 1.4 };
}
for (const m of MATERIALS) if (m.use === 'bed') Object.assign(m, bedFill(m));

export const materialById = new Map(MATERIALS.map((m) => [m.id, m]));
export const featureById = new Map(FEATURES.map((f) => [f.id, f]));

/**
 * The kind of thing a feature is, as a plural noun the parent shows ("Pergolas and gazebos"): a placed feature can be
 * switched for any other approved feature of the same class (same spot and turn, sized to it) and for none of another.
 * Lighting follows the maker's fixture category (path lights switch for path lights, never for a well light).
 */
const SWAP_CLASS: Record<FeatureKind, string> = {
  pergolaWood: 'Pergolas and gazebos', pergolaLouvered: 'Pergolas and gazebos', gazebo: 'Pergolas and gazebos', umbrella: 'Umbrellas',
  firePit: 'Fire features', fireTable: 'Fire features', firePitLinear: 'Fire features', fireWaterBowl: 'Fire features',
  kitchenStraight: 'Outdoor kitchens', kitchenL: 'Outdoor kitchens',
  hotTub: 'Hot tubs', saunaBarrel: 'Saunas', saunaCube: 'Saunas',
  waterWallPlaster: 'Water walls', waterWallPorcelain: 'Water walls', waterWallStucco: 'Water walls', pillarFountain: 'Water features',
  copperBowl: 'Planters', patinaBowl: 'Planters', cortenPlanter: 'Planters', cortenPlanterTall: 'Planters', blackPlanter: 'Planters',
  cortenScreen: 'Screens and trellises', cortenTreePanel: 'Screens and trellises', trellisCable: 'Screens and trellises', trellisGrid: 'Screens and trellises',
  boulder: 'Boulders', steppingPad: 'Stepping pads', steppingStone: 'Stepping stones', puttingCup: 'Putting cups',
  pathLight: 'Path lights', spotLight: 'Accent lights', landscapeLight: 'Landscape lights',
  bench: 'Seating', loungeSofa: 'Seating', loungeOttoman: 'Ottomans', deckBox: 'Deck boxes',
  loungeSet: 'Furniture sets', bistroSet: 'Furniture sets', diningSet: 'Furniture sets', diningSling: 'Furniture sets',
  patioHeater: 'Patio heaters', ceilingFan: 'Ceiling fans',
};

/** The class a feature switches within (see SWAP_CLASS). */
export function swapClassOf(f: FeatureSpec): string {
  return f.fixture ? f.fixture.category : SWAP_CLASS[f.kind];
}

/** Old ids from earlier saved plans. */
export const LEGACY_IDS: Record<string, string> = {
  'accent-tree-red': 'japanese-maple-red',
  'columnar-tree': 'italian-cypress',
  'rounded-shrub': 'boxwood',
  'lavender-perennial': 'lavender',
  'bark-mulch': 'black-mulch',
  'paver-charcoal': 'paver-holland-charcoal',
  'paver-tan': 'paver-ashlar-tan',
  'slab-large': 'slab-24',
  concrete: 'concrete-broom',
  'block-wall': 'wall-gray-block',
  'wood-fence': 'fence-board-on-board',
  pergola: 'pergola-wood',
  'bbq-island': 'kitchen-straight',
};

/**
 * Maker paver and wall lines a person can pick. A maker line is offered once it is mapped in depth from the maker's
 * specs: sizes, faces, colors, patterns. Every other maker paver or wall line stays in the catalog, so saved plans that
 * use it still load and render, but it is not listed in any picker, in the looks sent to Area Planner, or to the plan
 * reader. To offer a line once it is mapped, add its `line` name here. Generic looks (no maker), curbs and edging,
 * concrete, fences and everything else are always offered.
 */
export const OFFERED_LINES = new Set<string>([
  'Large-format slab',
  'Dimensions Slabs 24 x 24',
  'Premier Slab',
  'Catalina Grana',
  'Avalon Slate',
  'Melville Tandem Wall',
  'Highland Stone',
  'Antiqued Flat Top',
  'Melville Wall',
  'Easton Stone',
  'Belair Wall',
  'Belair Wall 2.0',
  'Coventry Wall III',
  'Artforms',
  'AB Classic',
  'Ashlar Tandem Wall',
  'Lamina Tandem',
  'Brisa',
  'Papyrus Artforms',
  'Castlemanor Grana',
  'Castlemanor Rustic',
  'Enhance Naturals',
  'Enhance Basics',
  'Transcend',
]);

/*
 * Approvals (see approval.ts). Every catalog item has an approval key; the Library turns keys on and off and Area
 * Planner saves those choices for the team. Without an override, a maker line on the paver or wall shelves is approved
 * when it is in OFFERED_LINES (mapped in depth); everything else is approved.
 */
const GATED_SHELVES = new Set(['Pavers', 'Retaining walls', 'Garden walls', 'Decking']);
/** Groups whose looks without a maker are generic testers, to be removed as real product lines replace them. */
const TESTER_GROUPS = new Set<MaterialGroup>(['Pavers', 'Porcelain', 'Natural stone', 'Decking', 'Walls', 'Edging']);

/** A generic paver, wall or curb look (no maker): a tester, kept so saved plans still draw, removable in the Library. */
export function isTester(m: MaterialSpec): boolean {
  return !m.maker && !m.auto && !m.id.startsWith('border-of-') && TESTER_GROUPS.has(m.group);
}

/** The approval key of a look: its maker's line, or the look itself. A `border-of-<paver>` follows its paver. */
export function approvalKeyOf(m: MaterialSpec): string {
  if (m.id.startsWith('border-of-')) {
    const base = materialById.get(m.id.slice('border-of-'.length));
    if (base) return approvalKeyOf(base);
  }
  // A line's 6 x 9 paver edge is approved on its own: it is often offered where the line's pavers are not.
  if (m.maker && m.line && m.shelf === 'Paver edge') return `line:${m.maker}|${m.line} 6 x 9 edge`;
  return m.maker && m.line ? `line:${m.maker}|${m.line}` : `mat:${m.id}`;
}

let gatedLines: Set<string> | null = null;
/** Approved when nothing overrides it. */
function approvedByDefault(key: string): boolean {
  if (!key.startsWith('line:')) return true;
  gatedLines ??= new Set(MATERIALS.filter((m) => m.maker && m.line && GATED_SHELVES.has(m.shelf ?? '')).map((m) => approvalKeyOf(m)));
  if (!gatedLines.has(key)) return true;
  return OFFERED_LINES.has(key.slice(key.indexOf('|') + 1));
}

/** True when this key is approved: the Library's override if there is one, else the default. */
export function isApproved(key: string): boolean {
  return approvalOverride(key) ?? approvedByDefault(key);
}

/** True when a person can pick this material: its line or look is approved (see `isApproved`). */
export function isOffered(m: MaterialSpec): boolean {
  return isApproved(approvalKeyOf(m));
}

/** Offered materials for a use; `keep` (the current value) is listed too even when hidden, so it never silently changes. */
export function materialsFor(use: MaterialUse, keep?: string): MaterialSpec[] {
  return MATERIALS.filter((m) => m.use === use && ((isOffered(m) && !(m.auto && m.group === 'Concrete')) || m.id === keep));
}

/* ------------------------------------------------------------------ */
/* Nursery container sizes                                              */
/* ------------------------------------------------------------------ */
/* A plant can be installed from a smaller or larger container than the one its catalog entry lists.
   The catalog's install size is for its own `container`; other containers scale from it:
   - Trees follow typical trade sizes for a standard tree, in feet (height, spread):
     1 gal 2.5 x 0.8, 2 gal 3.5 x 1, 5 gal 5 x 1.5, 15 gal 8 x 3, 24" box 10.5 x 5, 36" box 13 x 7,
     48" box 16 x 9. (ANSI Z60.1 pairs a 24" box with 1.5-2.5" caliper, 36" with 2.5-3.5", 48" with 3.5-5".)
   - Everything else scales by container: 1 gal 1.0, 2 gal 1.3, 5 gal 1.8, 15 gal 3.0 (a 1 gal shrub is
     roughly 8-24" tall, a 5 gal about twice that).
   No container starts above 90% of the mature size. A bigger container is an older plant: it starts
   further along the same growth curve, so it reaches mature size sooner, and a smaller one later. */
export type ContainerId = 'pot' | '1g' | '2g' | '5g' | '15g' | '24b' | '36b' | '48b';
export const CONTAINERS: { id: ContainerId; label: string }[] = [
  { id: '1g', label: '1 gal' }, { id: '2g', label: '2 gal' }, { id: '5g', label: '5 gal' }, { id: '15g', label: '15 gal' },
  { id: '24b', label: '24" box' }, { id: '36b', label: '36" box' }, { id: '48b', label: '48" box' },
];
const TREE_FT: Record<string, [number, number]> = { '1g': [2.5, 0.8], '2g': [3.5, 1], '5g': [5, 1.5], '15g': [8, 3], '24b': [10.5, 5], '36b': [13, 7], '48b': [16, 9] };
const POT_SCALE: Record<string, number> = { pot: 0.6, '1g': 1, '2g': 1.3, '5g': 1.8, '15g': 3, '24b': 3.8, '36b': 4.6, '48b': 5.4 };

/** The container the catalog's install size is for. Pots and flats are 'pot'. */
export function defaultContainer(spec: PlantSpec): ContainerId {
  const c = spec.container.toLowerCase();
  if (c.includes('48')) return '48b';
  if (c.includes('36')) return '36b';
  if (c.includes('24')) return '24b';
  if (c.startsWith('15')) return '15g';
  if (c.startsWith('5')) return '5g';
  if (c.startsWith('2 ')) return '2g';
  if (c.startsWith('1 ')) return '1g';
  return 'pot';
}

/** Containers a plant is offered in: trees up to a 48" box, shrubs, succulents and tropicals up to
    15 gal, and grasses, perennials and groundcover up to 5 gal. */
export function containersFor(spec: PlantSpec): ContainerId[] {
  const ids: ContainerId[] = spec.group === 'Trees' ? ['1g', '2g', '5g', '15g', '24b', '36b', '48b']
    : spec.group === 'Shrubs' || spec.group === 'Succulents' || spec.group === 'Tropicals' ? ['1g', '2g', '5g', '15g'] : ['1g', '2g', '5g'];
  return defaultContainer(spec) === 'pot' ? ['pot', ...ids] : ids;
}

/** Height and spread in meters at install from a given container. */
export function installSize(spec: PlantSpec, container?: ContainerId): { height: number; spread: number } {
  const def = defaultContainer(spec);
  const c = container ?? def;
  if (c === def) return { height: spec.installHeight, spread: spec.installSpread };
  let rh: number, rs: number;
  if (spec.group === 'Trees' && TREE_FT[c] && TREE_FT[def]) {
    rh = TREE_FT[c][0] / TREE_FT[def][0];
    rs = TREE_FT[c][1] / TREE_FT[def][1];
  } else {
    rh = rs = (POT_SCALE[c] ?? 1) / (POT_SCALE[def] ?? 1);
  }
  return {
    height: Math.min(spec.installHeight * rh, Math.max(spec.installHeight, spec.matureHeight * 0.9)),
    spread: Math.min(spec.installSpread * rs, Math.max(spec.installSpread, spec.matureSpread * 0.9)),
  };
}

/** Where a container's install height sits on the catalog growth curve, as a fraction of yearsToMature
    (0 = the catalog container, below 0 = younger, above 0 = older) and its curve value. */
function headStart(spec: PlantSpec, container?: ContainerId): { t0: number; g0: number } {
  const span = spec.matureHeight - spec.installHeight;
  if (!container || !(span > 0)) return { t0: 0, g0: 0 };
  const g0 = Math.min(0.97, (installSize(spec, container).height - spec.installHeight) / span);
  return { t0: 1 - Math.pow(1 - g0, 1 / 1.6), g0 };
}

/** Position on the catalog growth curve after `years` from install: 0 at the catalog container's
    install size, 1 at maturity. It can start below 0 (a smaller container) or above 0 (a larger one). */
export function curveAt(spec: PlantSpec, years: number, container?: ContainerId): number {
  const t = headStart(spec, container).t0 + Math.max(0, years) / spec.yearsToMature;
  return 1 - Math.pow(1 - Math.min(t, 1), 1.6);
}

/** Growth fraction (0 at install, 1 at maturity) after `years`. */
export function growthAt(spec: PlantSpec, years: number, container?: ContainerId): number {
  const { g0 } = headStart(spec, container);
  return Math.max(0, Math.min(1, (curveAt(spec, years, container) - g0) / (1 - g0)));
}

/** Years from install to roughly mature size, for a given container. */
export function yearsToMatureFrom(spec: PlantSpec, container?: ContainerId): number {
  return spec.yearsToMature * (1 - headStart(spec, container).t0);
}

/** Height and spread in meters after `years`. */
export function sizeAt(spec: PlantSpec, years: number, container?: ContainerId): { height: number; spread: number } {
  const g = growthAt(spec, years, container);
  const at = installSize(spec, container);
  return {
    height: at.height + (spec.matureHeight - at.height) * g,
    spread: at.spread + (spec.matureSpread - at.spread) * g,
  };
}
