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
  face?: 'smooth' | 'textured' | 'woodgrain' | 'slate';
}

export type FenceStyle = 'boardOnBoard' | 'grayLattice' | 'dogEar' | 'horizontal' | 'vinyl' | 'steelPicket' | 'chainlinkSlat';
export type WallFace = 'splitFace' | 'smoothBlock' | 'plaster' | 'ledgestone' | 'stackedStone';
export type ConcreteFinish = 'broom' | 'smooth' | 'stamped' | 'exposed';

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
  fence?: FenceStyle;
  wall?: { face: WallFace; cap: string };
  /** Hardscape thickness above grade, meters. */
  thickness?: number;
  /** Manufacturer line this look is modeled on, if any. */
  matches?: string;
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
  | 'spotLight'
  | 'steppingPad'
  | 'puttingCup'
  | 'cortenScreen'
  | 'cortenPlanter'
  | 'blackPlanter'
  | 'boulder'
  | 'pathLight'
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
  placeholder: true;
}

/* ------------------------------------------------------------------ */
/* Plants                                                               */
/* ------------------------------------------------------------------ */

const P = (s: Omit<PlantSpec, 'placeholder'>): PlantSpec => ({ ...s, placeholder: true });

export const PLANTS: PlantSpec[] = [
  // Trees
  P({ id: 'shade-tree', name: 'Shade tree', group: 'Trees', form: 'shadeTree', installHeight: 3.0, installSpread: 1.4, matureHeight: 9.5, matureSpread: 8.5, yearsToMature: 12, foliage: '#4f7a34', foliage2: '#6c8f3a', evergreen: false, spacing: 7, container: '24" box' }),
  P({ id: 'japanese-maple-red', name: 'Japanese maple, red', group: 'Trees', form: 'accentTree', installHeight: 1.8, installSpread: 1.1, matureHeight: 4.2, matureSpread: 4.5, yearsToMature: 10, foliage: '#8e2b22', foliage2: '#b0412b', evergreen: false, spacing: 4, container: '15 gal' }),
  P({ id: 'japanese-maple-green', name: 'Japanese maple, green', group: 'Trees', form: 'accentTree', installHeight: 1.8, installSpread: 1.1, matureHeight: 4.5, matureSpread: 4.5, yearsToMature: 10, foliage: '#7da23a', foliage2: '#9fc04a', evergreen: false, spacing: 4, container: '15 gal' }),
  P({ id: 'crape-myrtle', name: 'Crape myrtle', group: 'Trees', form: 'multiTrunk', installHeight: 2.4, installSpread: 0.8, matureHeight: 5.5, matureSpread: 4.0, yearsToMature: 8, foliage: '#4c6f34', foliage2: '#6a8c3c', flower: '#b45ca8', evergreen: false, spacing: 3.5, container: '15 gal' }),
  P({ id: 'olive-tree', name: 'Olive tree', group: 'Trees', form: 'multiTrunk', installHeight: 2.4, installSpread: 1.2, matureHeight: 6.0, matureSpread: 5.0, yearsToMature: 12, foliage: '#7b8a6a', foliage2: '#97a585', evergreen: true, spacing: 4.5, container: '24" box' }),
  P({ id: 'citrus-standard', name: 'Citrus standard', group: 'Trees', form: 'standardTree', installHeight: 1.5, installSpread: 0.6, matureHeight: 2.6, matureSpread: 1.5, yearsToMature: 6, foliage: '#3f6b2c', foliage2: '#557f34', flower: '#f0a33a', evergreen: true, spacing: 2, container: '15 gal' }),
  P({ id: 'italian-cypress', name: 'Italian cypress', group: 'Trees', form: 'columnarTree', installHeight: 2.0, installSpread: 0.45, matureHeight: 9.0, matureSpread: 1.4, yearsToMature: 10, foliage: '#2f4f2c', foliage2: '#3d5e33', evergreen: true, spacing: 1.5, container: '15 gal' }),
  P({ id: 'blue-point-juniper', name: 'Blue point juniper', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.6, matureHeight: 4.0, matureSpread: 1.8, yearsToMature: 8, foliage: '#5f7a72', foliage2: '#7b948a', evergreen: true, spacing: 1.6, container: '15 gal' }),
  P({ id: 'blue-juniper-column', name: 'Blue juniper, columnar', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.5, matureHeight: 4.5, matureSpread: 1.2, yearsToMature: 8, foliage: '#7e9aa0', foliage2: '#97b0b3', evergreen: true, spacing: 1.2, container: '15 gal' }),
  P({ id: 'blue-spruce', name: 'Blue spruce', group: 'Trees', form: 'conifer', installHeight: 1.5, installSpread: 0.8, matureHeight: 6.0, matureSpread: 3.0, yearsToMature: 12, foliage: '#6c8a95', foliage2: '#86a3a8', evergreen: true, spacing: 3, container: '15 gal' }),
  // Shrubs
  P({ id: 'boxwood', name: 'Boxwood', group: 'Shrubs', form: 'shrub', installHeight: 0.4, installSpread: 0.4, matureHeight: 0.9, matureSpread: 0.9, yearsToMature: 5, foliage: '#3f6534', foliage2: '#57793b', evergreen: true, spacing: 0.8, container: '5 gal' }),
  P({ id: 'westringia', name: 'Coast rosemary (westringia)', group: 'Shrubs', form: 'shrub', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.5, yearsToMature: 4, foliage: '#7e9177', foliage2: '#9aab90', evergreen: true, spacing: 1.3, container: '5 gal' }),
  P({ id: 'euonymus-variegated', name: 'Variegated euonymus', group: 'Shrubs', form: 'shrub', installHeight: 0.6, installSpread: 0.4, matureHeight: 1.8, matureSpread: 1.0, yearsToMature: 5, foliage: '#a7b347', foliage2: '#d8d66a', evergreen: true, spacing: 1, container: '5 gal' }),
  P({ id: 'rose', name: 'Rose', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.6, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.2, yearsToMature: 3, foliage: '#3e6330', foliage2: '#4f7438', flower: '#c8203a', flower2: '#e15a7d', evergreen: false, spacing: 1.1, container: '5 gal' }),
  P({ id: 'flowering-shrub', name: 'Flowering shrub', group: 'Shrubs', form: 'floweringShrub', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.5, yearsToMature: 4, foliage: '#4c7136', foliage2: '#668a3f', flower: '#d9739a', evergreen: false, spacing: 1.3, container: '5 gal' }),
  P({ id: 'dwarf-pittosporum', name: 'Dwarf pittosporum', group: 'Shrubs', form: 'shrub', installHeight: 0.35, installSpread: 0.4, matureHeight: 0.9, matureSpread: 1.2, yearsToMature: 4, foliage: '#3c6b2c', foliage2: '#4f8236', evergreen: true, spacing: 1, container: '5 gal' }),
  P({ id: 'gold-cypress', name: 'Gold mop cypress', group: 'Shrubs', form: 'shrub', installHeight: 0.4, installSpread: 0.45, matureHeight: 1.2, matureSpread: 1.5, yearsToMature: 6, foliage: '#c9c13a', foliage2: '#e0d552', evergreen: true, spacing: 1.3, container: '5 gal' }),
  P({ id: 'artemisia', name: 'Silver artemisia', group: 'Shrubs', form: 'shrub', installHeight: 0.35, installSpread: 0.4, matureHeight: 0.9, matureSpread: 1.1, yearsToMature: 3, foliage: '#aab8a8', foliage2: '#c3cfc0', evergreen: true, spacing: 1, container: '5 gal' }),
  P({ id: 'boxwood-hedge', name: 'Boxwood hedge (sheared)', group: 'Shrubs', form: 'shrub', installHeight: 0.5, installSpread: 0.45, matureHeight: 0.9, matureSpread: 0.75, yearsToMature: 4, foliage: '#3a6030', foliage2: '#4c7237', evergreen: true, spacing: 0.5, container: '5 gal' }),
  P({ id: 'pittosporum', name: 'Pittosporum', group: 'Shrubs', form: 'shrub', installHeight: 0.7, installSpread: 0.5, matureHeight: 2.4, matureSpread: 1.5, yearsToMature: 5, foliage: '#4a6b3a', foliage2: '#62824a', evergreen: true, spacing: 1.3, container: '5 gal' }),
  // Grasses
  P({ id: 'blue-fescue', name: 'Blue fescue', group: 'Grasses', form: 'grass', installHeight: 0.15, installSpread: 0.15, matureHeight: 0.3, matureSpread: 0.35, yearsToMature: 2, foliage: '#8fa6b0', foliage2: '#6f8a93', evergreen: true, spacing: 0.35, container: '1 gal' }),
  P({ id: 'ornamental-grass', name: 'Ornamental grass', group: 'Grasses', form: 'grass', installHeight: 0.35, installSpread: 0.3, matureHeight: 1.1, matureSpread: 0.9, yearsToMature: 3, foliage: '#a3a46a', foliage2: '#7e8c4d', flower: '#d8c99a', evergreen: false, spacing: 0.8, container: '1 gal' }),
  P({ id: 'lomandra', name: 'Lomandra', group: 'Grasses', form: 'grass', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.8, matureSpread: 0.9, yearsToMature: 3, foliage: '#5d7f3a', foliage2: '#7e9a48', evergreen: true, spacing: 0.75, container: '5 gal' }),
  P({ id: 'fountain-grass', name: 'Fountain grass', group: 'Grasses', form: 'grass', installHeight: 0.4, installSpread: 0.35, matureHeight: 1.0, matureSpread: 1.0, yearsToMature: 2, foliage: '#6f8d55', foliage2: '#8aa36a', flower: '#e8e1e6', evergreen: false, spacing: 0.9, container: '1 gal' }),
  P({ id: 'gold-carex', name: 'Gold carex', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.5, matureSpread: 0.6, yearsToMature: 2, foliage: '#c3d23a', foliage2: '#9cb52e', evergreen: true, spacing: 0.5, container: '1 gal' }),
  P({ id: 'flax-lily', name: 'Variegated flax lily', group: 'Grasses', form: 'grass', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.6, yearsToMature: 2, foliage: '#7c9a6a', foliage2: '#d8dcc0', evergreen: true, spacing: 0.5, container: '1 gal' }),
  P({ id: 'mondo-grass', name: 'Dwarf mondo grass', group: 'Grasses', form: 'grass', installHeight: 0.08, installSpread: 0.1, matureHeight: 0.15, matureSpread: 0.25, yearsToMature: 3, foliage: '#2a4428', foliage2: '#355330', evergreen: true, spacing: 0.25, container: '4" pot' }),
  // Perennials and color
  P({ id: 'lavender', name: 'Lavender', group: 'Perennials and color', form: 'perennial', installHeight: 0.25, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.75, yearsToMature: 3, foliage: '#8a9a7b', foliage2: '#a2ae8f', flower: '#7a63b8', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'veronica-white', name: 'White veronica', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.55, matureSpread: 0.5, yearsToMature: 2, foliage: '#4a7034', foliage2: '#5c8240', flower: '#f2f2ec', evergreen: false, spacing: 0.45, container: '1 gal' }),
  P({ id: 'statice', name: 'Statice', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.3, matureHeight: 0.5, matureSpread: 0.6, yearsToMature: 2, foliage: '#6f9157', foliage2: '#86a56b', flower: '#5b3db4', evergreen: true, spacing: 0.5, container: '1 gal' }),
  P({ id: 'annual-color', name: 'Seasonal color', group: 'Perennials and color', form: 'annuals', installHeight: 0.15, installSpread: 0.2, matureHeight: 0.3, matureSpread: 0.35, yearsToMature: 1, foliage: '#4f7c3a', foliage2: '#6a9645', flower: '#f2c12e', flower2: '#e8508a', evergreen: false, spacing: 0.3, container: '4" pot' }),
  P({ id: 'foxtail-fern', name: 'Foxtail fern', group: 'Perennials and color', form: 'fern', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 3, foliage: '#8cbf3a', foliage2: '#a8d04c', evergreen: true, spacing: 0.7, container: '5 gal' }),
  // Succulents
  P({ id: 'variegated-yucca', name: 'Variegated yucca', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 0.8, matureSpread: 1.0, yearsToMature: 5, foliage: '#c7c24a', foliage2: '#4e7a3a', evergreen: true, spacing: 1, container: '5 gal' }),
  P({ id: 'blue-sedum', name: 'Blue sedum', group: 'Succulents', form: 'groundcover', installHeight: 0.08, installSpread: 0.15, matureHeight: 0.15, matureSpread: 0.45, yearsToMature: 2, foliage: '#8fa8a2', foliage2: '#a9beb7', evergreen: true, spacing: 0.35, container: '1 gal' }),
  P({ id: 'foxtail-agave', name: 'Foxtail agave', group: 'Succulents', form: 'agave', installHeight: 0.35, installSpread: 0.45, matureHeight: 1.0, matureSpread: 1.3, yearsToMature: 5, foliage: '#8fb0a6', foliage2: '#a8c4b6', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'agave', name: 'Agave', group: 'Succulents', form: 'agave', installHeight: 0.3, installSpread: 0.4, matureHeight: 0.7, matureSpread: 1.0, yearsToMature: 6, foliage: '#7f9c92', foliage2: '#9bb5a9', evergreen: true, spacing: 1, container: '5 gal' }),
  // Tropicals
  P({ id: 'banana', name: 'Banana', group: 'Tropicals', form: 'tropical', installHeight: 1.2, installSpread: 0.8, matureHeight: 3.2, matureSpread: 2.2, yearsToMature: 3, foliage: '#6e9a3a', foliage2: '#8db148', evergreen: true, spacing: 2, container: '15 gal' }),
  P({ id: 'elephant-ear', name: 'Elephant ear', group: 'Tropicals', form: 'tropical', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.4, matureSpread: 1.3, yearsToMature: 2, foliage: '#4f7f33', foliage2: '#6a9a40', evergreen: false, spacing: 1.2, container: '5 gal' }),
  // Groundcover
  P({ id: 'ajuga', name: 'Ajuga, bronze', group: 'Groundcover', form: 'groundcover', installHeight: 0.06, installSpread: 0.2, matureHeight: 0.12, matureSpread: 0.6, yearsToMature: 2, foliage: '#4a3a3e', foliage2: '#3a4a33', flower: '#5b5bb5', evergreen: true, spacing: 0.35, container: 'Flat' }),
  P({ id: 'spreading-juniper', name: 'Spreading juniper', group: 'Groundcover', form: 'groundcover', installHeight: 0.2, installSpread: 0.5, matureHeight: 0.45, matureSpread: 1.8, yearsToMature: 6, foliage: '#4f6f52', foliage2: '#62836a', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'verbena', name: 'Purple verbena', group: 'Groundcover', form: 'groundcover', installHeight: 0.1, installSpread: 0.25, matureHeight: 0.25, matureSpread: 0.7, yearsToMature: 2, foliage: '#3f6a33', foliage2: '#4f7c3a', flower: '#6a2fb5', evergreen: false, spacing: 0.5, container: '1 gal' }),
  P({ id: 'groundcover', name: 'Low groundcover', group: 'Groundcover', form: 'groundcover', installHeight: 0.08, installSpread: 0.25, matureHeight: 0.15, matureSpread: 0.9, yearsToMature: 2, foliage: '#4f7c3a', foliage2: '#6a9645', flower: '#f1e3a6', evergreen: true, spacing: 0.45, container: 'Flat' }),
];

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

const M = (s: Omit<MaterialSpec, 'placeholder'>): MaterialSpec => ({ ...s, placeholder: true });
const ASHLAR: [number, number][] = [[6, 9], [9, 9], [9, 12], [12, 12], [6, 12]];
const LARGE_ASHLAR: [number, number][] = [[12, 12], [12, 18], [18, 24], [12, 24]];

export const MATERIALS: MaterialSpec[] = [
  // Turf
  M({ id: 'lawn', name: 'Natural lawn', use: 'turf', group: 'Turf', recipe: 'lawn', palette: ['#5f8a38', '#3f6328'] }),
  M({ id: 'putting-green', name: 'Putting green turf', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#8fb53a', '#729a2c'] }),
  M({ id: 'artificial-turf', name: 'Artificial turf', use: 'turf', group: 'Turf', recipe: 'turfArtificial', palette: ['#567a30', '#355322'] }),
  // Mulch and rock
  M({ id: 'black-mulch', name: 'Black mulch', use: 'bed', group: 'Mulch and rock', recipe: 'mulch', palette: ['#3a342f', '#221e1b'] }),
  M({ id: 'brown-mulch', name: 'Red-brown bark', use: 'bed', group: 'Mulch and rock', recipe: 'mulch', palette: ['#6e4a2f', '#4a3121'] }),
  M({ id: 'decomposed-granite', name: 'Decomposed granite', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#b39a78', '#8f7a5d'] }),
  M({ id: 'river-rock', name: 'River rock', use: 'bed', group: 'Mulch and rock', recipe: 'riverRock', palette: ['#a8a399', '#8d8a83', '#5f5b55'] }),
  M({ id: 'black-pebble', name: 'Black beach pebble', use: 'bed', group: 'Mulch and rock', recipe: 'blackPebble', palette: ['#4a4a48', '#2a2a29', '#151515'] }),
  M({ id: 'lava-rock', name: 'Black lava rock', use: 'bed', group: 'Mulch and rock', recipe: 'dg', palette: ['#3a3836', '#252322'] }),
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
  // Concrete
  M({ id: 'concrete-broom', name: 'Broom-finish concrete', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#c7c3ba', '#b5b1a8'], finish: 'broom', thickness: 0.1 }),
  M({ id: 'concrete-smooth', name: 'Smooth-trowel concrete', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#bebbb4', '#aaa79f'], finish: 'smooth', thickness: 0.1 }),
  M({ id: 'concrete-stamped-light', name: 'Stamped concrete, light slate', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#d6d1c6', '#c4beb2'], finish: 'stamped', thickness: 0.1 }),
  M({ id: 'concrete-stamped-tan', name: 'Stamped concrete, tan tile', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#d3bf9c', '#bba783'], finish: 'stamped', thickness: 0.1 }),
  M({ id: 'concrete-stamped', name: 'Stamped concrete, slate', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#a99a86', '#8a7c6b'], finish: 'stamped', thickness: 0.1 }),
  M({ id: 'concrete-exposed', name: 'Exposed aggregate', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#a59a8c', '#857a6d'], finish: 'exposed', thickness: 0.1 }),
  M({ id: 'concrete-tan', name: 'Colored concrete, tan', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#c9b89c', '#b6a487'], finish: 'broom', thickness: 0.1 }),
  M({ id: 'concrete-red', name: 'Colored concrete, terracotta', use: 'hardscape', group: 'Concrete', recipe: 'concrete', palette: ['#a5604f', '#8f5244'], finish: 'smooth', thickness: 0.1 }),
  // Natural stone
  M({ id: 'flagstone-dg', name: 'Flagstone set in DG', use: 'hardscape', group: 'Natural stone', recipe: 'flagstone', palette: ['#c3b39a', '#a99a82', '#8e7f69'], thickness: 0.04 }),
  M({ id: 'flagstone', name: 'Flagstone', use: 'hardscape', group: 'Natural stone', recipe: 'flagstone', palette: ['#b3a088', '#9b8a72', '#7c6c58'], thickness: 0.06 }),
  // Decking
  M({ id: 'composite-gray', name: 'Composite deck, gray', use: 'hardscape', group: 'Decking', recipe: 'deck', palette: ['#8f8a84', '#77726c', '#615d58'], thickness: 0.3 }),
  M({ id: 'wood-deck', name: 'Cedar deck', use: 'hardscape', group: 'Decking', recipe: 'deck', palette: ['#a5714a', '#8a5d3b', '#6f4a2f'], thickness: 0.35 }),
  // Borders (soldier course along hardscape edges)
  M({ id: 'border-charcoal', name: 'Charcoal soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#55534f', '#4a4845', '#3e3c3a'], pattern: { kind: 'soldier', sizes: [[4, 8]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-charcoal-wide', name: 'Charcoal border, 6x12', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#55534f', '#4a4845', '#3e3c3a'], pattern: { kind: 'soldier', sizes: [[6, 12]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-tan', name: 'Tan soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#a8916f', '#97805f', '#86704f'], pattern: { kind: 'soldier', sizes: [[4, 8]], joint: 0.15 }, thickness: 0.06 }),
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
  M({ id: 'fence-dog-ear', name: 'Dog-ear picket, natural', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#c4a47e', '#b0906a', '#9a7b57'], fence: 'dogEar' }),
  M({ id: 'fence-horizontal', name: 'Horizontal slat, cedar', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#a5714a', '#8a5d3b', '#76502f'], fence: 'horizontal' }),
  M({ id: 'fence-vinyl', name: 'Vinyl privacy, white', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#ecebe6', '#e2e0da'], fence: 'vinyl' }),
  M({ id: 'fence-chainlink-slat', name: 'Chain-link with privacy slats, tan', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#b3a68f', '#a3967f'], fence: 'chainlinkSlat' }),
  M({ id: 'fence-dark-stained', name: 'Dog-ear, dark stain', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#5a3f30', '#4c3427', '#40291f'], fence: 'dogEar' }),
  M({ id: 'fence-weathered', name: 'Dog-ear, weathered', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#9a8a78', '#887868', '#766758'], fence: 'dogEar' }),
  M({ id: 'fence-iron-view', name: 'Iron view fence, black', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1e1e1e', '#2a2a2a'], fence: 'steelPicket' }),
  M({ id: 'fence-steel-picket', name: 'Steel picket, black', use: 'fence', group: 'Fences', recipe: 'fence', palette: ['#1e1e1e', '#2a2a2a'], fence: 'steelPicket' }),
  // Edging
  M({ id: 'curb-charcoal', name: 'Charcoal curb', use: 'edging', group: 'Edging', recipe: 'curb', palette: ['#55534f', '#4a4845'], matches: 'Belgard Melville curb style' }),
  M({ id: 'steel-edging', name: 'Steel edging', use: 'edging', group: 'Edging', recipe: 'steelEdging', palette: ['#4a3a2e', '#3a2d24'] }),
];

/* ------------------------------------------------------------------ */
/* Features                                                             */
/* ------------------------------------------------------------------ */

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

export const FEATURES: FeatureSpec[] = [
  F({ id: 'fire-table', name: 'Fire table, rectangular', group: 'Fire', kind: 'fireTable', footprint: [1.5, 0.75] }),
  F({ id: 'fire-pit', name: 'Fire pit, round stone', group: 'Fire', kind: 'firePit', footprint: [1.3, 1.3] }),
  F({ id: 'pergola-louvered', name: 'Louvered pergola, aluminum', group: 'Shade', kind: 'pergolaLouvered', footprint: [4.3, 3.7] }),
  F({ id: 'pergola-wood', name: 'Wood pergola', group: 'Shade', kind: 'pergolaWood', footprint: [3.6, 3.0] }),
  F({ id: 'gazebo', name: 'Hardtop gazebo', group: 'Shade', kind: 'gazebo', footprint: [3.6, 3.6] }),
  F({ id: 'umbrella', name: 'Market umbrella', group: 'Shade', kind: 'umbrella', footprint: [2.7, 2.7] }),
  F({ id: 'kitchen-l', name: 'Outdoor kitchen, L-shaped', group: 'Kitchens', kind: 'kitchenL', footprint: [3.6, 2.6] }),
  F({ id: 'kitchen-straight', name: 'Outdoor kitchen, straight', group: 'Kitchens', kind: 'kitchenStraight', footprint: [3.0, 0.8] }),
  F({ id: 'hot-tub', name: 'Hot tub', group: 'Spa and sauna', kind: 'hotTub', footprint: [2.3, 2.3] }),
  F({ id: 'sauna-barrel', name: 'Barrel sauna', group: 'Spa and sauna', kind: 'saunaBarrel', footprint: [2.0, 2.4] }),
  F({ id: 'sauna-cube', name: 'Cube sauna', group: 'Spa and sauna', kind: 'saunaCube', footprint: [2.2, 2.2] }),
  F({ id: 'water-wall-plaster', name: 'Water wall, plaster and ledgestone', group: 'Water', kind: 'waterWallPlaster', footprint: [4.2, 1.2] }),
  F({ id: 'water-wall-porcelain', name: 'Water wall, porcelain panel', group: 'Water', kind: 'waterWallPorcelain', footprint: [2.6, 0.9] }),
  F({ id: 'water-wall-stucco', name: 'Water wall, stucco and dark stone', group: 'Water', kind: 'waterWallStucco', footprint: [3.4, 1.4] }),
  F({ id: 'copper-bowl', name: 'Copper bowl planter', group: 'Accents', kind: 'copperBowl', footprint: [0.75, 0.75] }),
  F({ id: 'corten-screen', name: 'Corten screen panel', group: 'Accents', kind: 'cortenScreen', footprint: [1.8, 0.1] }),
  F({ id: 'corten-planter', name: 'Corten planter', group: 'Accents', kind: 'cortenPlanter', footprint: [0.6, 0.6] }),
  F({ id: 'black-planter', name: 'Black square planter', group: 'Accents', kind: 'blackPlanter', footprint: [0.5, 0.5] }),
  F({ id: 'boulder', name: 'Boulder', group: 'Accents', kind: 'boulder', footprint: [1.0, 0.8] }),
  F({ id: 'trellis-cable', name: 'Cable trellis', group: 'Accents', kind: 'trellisCable', footprint: [1.8, 0.05] }),
  F({ id: 'trellis-grid', name: 'Steel grid trellis', group: 'Accents', kind: 'trellisGrid', footprint: [0.9, 0.05] }),
  F({ id: 'stepping-pad', name: 'Stepping pad, 24 in', group: 'Accents', kind: 'steppingPad', footprint: [0.6, 0.6] }),
  F({ id: 'putting-cup', name: 'Putting cup', group: 'Accents', kind: 'puttingCup', footprint: [0.15, 0.15] }),
  F({ id: 'path-light', name: 'Path light, brass mushroom', group: 'Lighting', kind: 'pathLight', footprint: [0.25, 0.25] }),
  F({ id: 'spot-light', name: 'Uplight, bronze', group: 'Lighting', kind: 'spotLight', footprint: [0.12, 0.12] }),
  F({ id: 'bench', name: 'Bench', group: 'Furniture', kind: 'bench', footprint: [1.5, 0.45] }),
  F({ id: 'lounge-set', name: 'Lounge set', group: 'Furniture', kind: 'loungeSet', footprint: [3.2, 2.6] }),
  F({ id: 'bistro-set', name: 'Bistro set', group: 'Furniture', kind: 'bistroSet', footprint: [1.4, 1.4] }),
  F({ id: 'dining-set', name: 'Dining set, 6 seats', group: 'Furniture', kind: 'diningSet', footprint: [2.6, 2.0] }),
];

export const plantById = new Map(PLANTS.map((p) => [p.id, p]));
export const materialById = new Map(MATERIALS.map((m) => [m.id, m]));
export const featureById = new Map(FEATURES.map((f) => [f.id, f]));

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

export function materialsFor(use: MaterialUse): MaterialSpec[] {
  return MATERIALS.filter((m) => m.use === use);
}

/** Growth fraction (0 at install, 1 at maturity) after `years`. */
export function growthAt(spec: PlantSpec, years: number): number {
  const t = Math.max(0, years) / spec.yearsToMature;
  return 1 - Math.pow(1 - Math.min(t, 1), 1.6);
}

/** Height and spread in meters after `years`. */
export function sizeAt(spec: PlantSpec, years: number): { height: number; spread: number } {
  const g = growthAt(spec, years);
  return {
    height: spec.installHeight + (spec.matureHeight - spec.installHeight) * g,
    spread: spec.installSpread + (spec.matureSpread - spec.installSpread) * g,
  };
}
