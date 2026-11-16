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
  /** Catalogue tags for real product lines: who makes it, the line, and the shelf it sits on. */
  maker?: string;
  line?: string;
  shelf?: 'Pavers' | 'Retaining walls' | 'Garden walls' | 'Curb';
  /** The color name alone, without the line name. */
  color?: string;
  /** A border made to go with a main-course color; not listed on its own. */
  auto?: boolean;
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
  // Grasses
  P({ id: 'blue-fescue', name: 'Blue fescue', botanical: 'Festuca glauca', group: 'Grasses', form: 'grass', installHeight: 0.15, installSpread: 0.15, matureHeight: 0.3, matureSpread: 0.35, yearsToMature: 2, foliage: '#7f9fb2', foliage2: '#98b4c2', flower: '#c9b27c', evergreen: true, spacing: 0.35, container: '1 gal' }),
  P({ id: 'ornamental-grass', name: 'Ornamental grass', botanical: 'Calamagrostis x acutiflora \'Karl Foerster\'', group: 'Grasses', form: 'grass', installHeight: 0.4, installSpread: 0.3, matureHeight: 1.5, matureSpread: 0.75, yearsToMature: 2, foliage: '#628e3a', foliage2: '#7fa648', flower: '#d2b676', evergreen: false, spacing: 0.7, container: '5 gal' }),
  P({ id: 'lomandra', name: 'Lomandra', botanical: 'Lomandra longifolia \'Breeze\'', group: 'Grasses', form: 'grass', installHeight: 0.35, installSpread: 0.35, matureHeight: 0.9, matureSpread: 1.1, yearsToMature: 3, foliage: '#5a9230', foliage2: '#74a83c', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'fountain-grass', name: 'Fountain grass', botanical: 'Pennisetum alopecuroides', group: 'Grasses', form: 'grass', installHeight: 0.35, installSpread: 0.3, matureHeight: 0.9, matureSpread: 0.9, yearsToMature: 2, foliage: '#528a34', foliage2: '#6ea040', flower: '#e2d2b0', flower2: '#b79a7c', evergreen: false, spacing: 0.8, container: '1 gal' }),
  P({ id: 'gold-carex', name: 'Gold carex', botanical: 'Carex oshimensis \'Everillo\'', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.4, matureSpread: 0.5, yearsToMature: 2, foliage: '#b4c40c', foliage2: '#86a408', evergreen: true, spacing: 0.45, container: '1 gal' }),
  P({ id: 'flax-lily', name: 'Variegated flax lily', botanical: 'Dianella tasmanica \'Variegata\'', group: 'Grasses', form: 'grass', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.75, matureSpread: 0.75, yearsToMature: 2, foliage: '#5d8a3e', foliage2: '#f1edcf', flower: '#6f78d6', flower2: '#3b3fa6', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'mondo-grass', name: 'Dwarf mondo grass', botanical: 'Ophiopogon japonicus \'Nana\'', group: 'Grasses', form: 'grass', installHeight: 0.05, installSpread: 0.1, matureHeight: 0.08, matureSpread: 0.2, yearsToMature: 3, foliage: '#183418', foliage2: '#2a5022', evergreen: true, spacing: 0.1, container: '4" pot' }),
  P({ id: 'liriope', name: 'Lilyturf (liriope)', botanical: 'Liriope muscari', group: 'Grasses', form: 'grass', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.4, matureSpread: 0.5, yearsToMature: 3, foliage: '#1d4220', foliage2: '#2f6030', flower: '#8a62c4', flower2: '#4a2f7a', evergreen: true, spacing: 0.45, container: '1 gal' }),
  // Perennials and color
  P({ id: 'lavender', name: 'Lavender', botanical: 'Lavandula x intermedia', group: 'Perennials and color', form: 'perennial', installHeight: 0.25, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 3, foliage: '#7f9076', foliage2: '#a3b09a', flower: '#7a63b8', flower2: '#4f3c94', evergreen: true, spacing: 0.75, container: '1 gal' }),
  P({ id: 'veronica-white', name: 'White veronica', botanical: 'Veronica spicata', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.25, matureHeight: 0.45, matureSpread: 0.45, yearsToMature: 2, foliage: '#4c7a34', foliage2: '#669645', flower: '#f4f4ee', flower2: '#a9c77c', evergreen: false, spacing: 0.4, container: '1 gal' }),
  P({ id: 'statice', name: 'Statice', botanical: 'Limonium perezii', group: 'Perennials and color', form: 'perennial', installHeight: 0.2, installSpread: 0.3, matureHeight: 0.6, matureSpread: 0.75, yearsToMature: 2, foliage: '#416836', foliage2: '#5f7d48', flower: '#6a45c9', flower2: '#8660dc', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'gaura', name: 'Gaura (wand flower)', botanical: 'Gaura lindheimeri', group: 'Perennials and color', form: 'perennial', installHeight: 0.35, installSpread: 0.35, matureHeight: 0.9, matureSpread: 0.9, yearsToMature: 2, foliage: '#587a3a', foliage2: '#8a6a52', flower: '#f4c4d3', flower2: '#d9507f', evergreen: false, spacing: 0.75, container: '1 gal' }),
  P({ id: 'purple-coneflower', name: 'Purple coneflower', botanical: 'Echinacea purpurea', group: 'Perennials and color', form: 'perennial', installHeight: 0.3, installSpread: 0.3, matureHeight: 0.8, matureSpread: 0.55, yearsToMature: 2, foliage: '#35622b', foliage2: '#4f7d38', flower: '#c8489a', flower2: '#c9722a', evergreen: false, spacing: 0.5, container: '1 gal' }),
  P({ id: 'annual-color', name: 'Seasonal color', botanical: 'Petunia x hybrida', group: 'Perennials and color', form: 'annuals', installHeight: 0.12, installSpread: 0.15, matureHeight: 0.2, matureSpread: 0.3, yearsToMature: 1, foliage: '#447232', foliage2: '#669842', flower: '#f2c12e', flower2: '#e8508a', evergreen: false, spacing: 0.25, container: '4" pot' }),
  P({ id: 'foxtail-fern', name: 'Foxtail fern', botanical: 'Asparagus densiflorus \'Myersii\'', group: 'Perennials and color', form: 'fern', installHeight: 0.3, installSpread: 0.4, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 3, foliage: '#4a8d25', foliage2: '#69b031', evergreen: true, spacing: 0.75, container: '5 gal' }),
  // Succulents
  P({ id: 'variegated-yucca', name: 'Variegated yucca', botanical: 'Yucca filamentosa \'Color Guard\'', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 0.75, matureSpread: 0.9, yearsToMature: 4, foliage: '#e6d874', foliage2: '#2e5c2c', evergreen: true, spacing: 0.9, container: '5 gal' }),
  P({ id: 'blue-sedum', name: 'Blue sedum', botanical: 'Sedum reflexum \'Blue Spruce\'', group: 'Succulents', form: 'groundcover', installHeight: 0.08, installSpread: 0.15, matureHeight: 0.15, matureSpread: 0.6, yearsToMature: 2, foliage: '#7fa3a0', foliage2: '#a6c6c2', evergreen: true, spacing: 0.3, container: '1 gal' }),
  P({ id: 'foxtail-agave', name: 'Foxtail agave', botanical: 'Agave attenuata', group: 'Succulents', form: 'agave', installHeight: 0.4, installSpread: 0.5, matureHeight: 1.2, matureSpread: 1.2, yearsToMature: 6, foliage: '#7fa890', foliage2: '#a9cbb6', evergreen: true, spacing: 1.2, container: '5 gal' }),
  P({ id: 'agave', name: 'Agave', botanical: 'Agave \'Blue Glow\'', group: 'Succulents', form: 'agave', installHeight: 0.3, installSpread: 0.4, matureHeight: 0.6, matureSpread: 0.9, yearsToMature: 6, foliage: '#4f8a80', foliage2: '#7fb0a6', evergreen: true, spacing: 0.9, container: '5 gal' }),
  // Tropicals
  P({ id: 'banana', name: 'Banana', botanical: 'Musa basjoo', group: 'Tropicals', form: 'tropical', installHeight: 1.5, installSpread: 1.0, matureHeight: 4.0, matureSpread: 3.0, yearsToMature: 3, foliage: '#58982e', foliage2: '#6fae3c', evergreen: false, spacing: 2.5, container: '15 gal' }),
  P({ id: 'elephant-ear', name: 'Elephant ear', botanical: 'Colocasia esculenta', group: 'Tropicals', form: 'tropical', installHeight: 0.5, installSpread: 0.5, matureHeight: 1.5, matureSpread: 1.5, yearsToMature: 2, foliage: '#3b722f', foliage2: '#5c9442', evergreen: false, spacing: 1.2, container: '5 gal' }),
  // Groundcover
  P({ id: 'ajuga', name: 'Ajuga, bronze', botanical: 'Ajuga reptans \'Bronze Beauty\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.06, installSpread: 0.2, matureHeight: 0.12, matureSpread: 0.6, yearsToMature: 2, foliage: '#4a2e3a', foliage2: '#34422c', flower: '#5a52cc', flower2: '#4338b0', evergreen: true, spacing: 0.35, container: 'Flat' }),
  P({ id: 'spreading-juniper', name: 'Spreading juniper', botanical: 'Juniperus sabina \'Tamariscifolia\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.2, installSpread: 0.6, matureHeight: 0.45, matureSpread: 2.4, yearsToMature: 6, foliage: '#3f6347', foliage2: '#5a8062', evergreen: true, spacing: 1.5, container: '5 gal' }),
  P({ id: 'verbena', name: 'Purple verbena', botanical: 'Verbena canadensis \'Homestead Purple\'', group: 'Groundcover', form: 'groundcover', installHeight: 0.1, installSpread: 0.25, matureHeight: 0.25, matureSpread: 0.9, yearsToMature: 2, foliage: '#2f5a24', foliage2: '#4a7c30', flower: '#7a30c4', flower2: '#5c1aa4', evergreen: true, spacing: 0.6, container: '1 gal' }),
  P({ id: 'groundcover', name: 'Low groundcover', botanical: 'Myoporum parvifolium', group: 'Groundcover', form: 'groundcover', installHeight: 0.08, installSpread: 0.3, matureHeight: 0.15, matureSpread: 1.5, yearsToMature: 2, foliage: '#4a8a2b', foliage2: '#72b43a', flower: '#fbfbf3', flower2: '#e9ecd2', evergreen: true, spacing: 0.9, container: '1 gal' }),
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
  M({ id: 'border-gray', name: 'Gray soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#8f8c87', '#7c7a76', '#6a6865'], pattern: { kind: 'soldier', sizes: [[4, 8]], joint: 0.15 }, thickness: 0.06 }),
  M({ id: 'border-light', name: 'Light soldier border', use: 'border', group: 'Pavers', recipe: 'paver', palette: ['#d6d0c4', '#c6bfb2', '#b3ab9e'], pattern: { kind: 'soldier', sizes: [[4, 8]], joint: 0.15 }, thickness: 0.06 }),
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
/* Belgard lines Green Lion installs                                    */
/* ------------------------------------------------------------------ */
/* Color names are Belgard's. The four colors per entry are averages read from Belgard's own swatch
   thumbnails (lightest to darkest), so they are close, not exact; no Belgard image ships with the app.
   Catalina Grana: 3-piece large set for the main course, and its 6 x 9 border piece for the edge. */
type Blend = [string, string[]];
const CATALINA_GRANA: Blend[] = [
  ['Amaretto', ['#b89f88', '#ac937b', '#a38972', '#997e67']],
  ['Anthracite', ['#5e5a59', '#555150', '#504c4b', '#4c4847']],
  ['Aspen', ['#b8a083', '#b39c7f', '#af987b', '#a89074']],
  ['Bella', ['#7f6e5e', '#7a695a', '#776657', '#6e6053']],
  ['Brown Beige Charcoal', ['#92857e', '#877b74', '#80746e', '#786d67']],
  ['Cream Tan Brown', ['#917c6a', '#897463', '#85705e', '#7f6a59']],
  ['Gray Charcoal', ['#83827e', '#7b7a76', '#747370', '#6a6966']],
  ['Gray Charcoal Tan', ['#867f77', '#817870', '#7d746b', '#766e67']],
  ['Hickory', ['#7d7369', '#7b7066', '#796e64', '#766b62']],
  ['Linen', ['#9e8e7d', '#998979', '#968676', '#928272']],
  ['Midnight', ['#4c4b49', '#4a4947', '#484745', '#474644']],
  ['Montecito', ['#a6906f', '#a18b69', '#9d8766', '#988261']],
  ['Napoli', ['#ac998c', '#9f8c7e', '#958375', '#857468']],
  ['Rainier', ['#7b6f63', '#766b60', '#73685d', '#70655b']],
  ['Rio', ['#7e766c', '#776e65', '#736a61', '#6e655c']],
  ['Riviera', ['#9c958b', '#938c83', '#8d867c', '#847d74']],
  ['Scandina Gray', ['#bfbbb6', '#b2aea9', '#aca8a3', '#a3a09a']],
  ['Sepia', ['#aa977f', '#a6927b', '#a48f78', '#a08b74']],
  ['Shaded Gray', ['#8b8680', '#88837d', '#86817b', '#827d77']],
  ['Sierra', ['#74625a', '#705f57', '#6e5d55', '#6a5952']],
  ['Slate', ['#6d6966', '#676361', '#635f5d', '#5d5957']],
  ['Sonoran Gray', ['#7a706c', '#716763', '#6d635f', '#675d5a']],
  ['Tan Brown Charcoal', ['#837264', '#7c6c60', '#78685e', '#73645a']],
  ['Tan Red Charcoal', ['#8d6d59', '#876754', '#846350', '#80604d']],
  ['Titanium', ['#b2aea3', '#9d9a91', '#8e8c85', '#807f78']],
  ['Toscana', ['#89735d', '#826d58', '#7d6954', '#776450']],
  ['Victorian', ['#887a67', '#857663', '#827462', '#7b6e5d']],
];
const AB_CLASSIC: Blend[] = [
  ['Brown Beige Charcoal', ['#8f7f74', '#807166', '#75675c', '#66594f']],
  ['Buff', ['#8b7b67', '#847560', '#7f705b', '#776854']],
  ['Charcoal', ['#6f675f', '#655d55', '#5e574e', '#544d45']],
  ['Dakota Blend', ['#b29482', '#a48674', '#987b6a', '#856a5c']],
  ['Danville Blend', ['#b09882', '#a28871', '#967d67', '#826c5a']],
  ['Driftwood', ['#7f756a', '#776e63', '#72695e', '#675f55']],
  ['Granite Gray', ['#74706b', '#64605b', '#595551', '#433f3b']],
  ['Gray', ['#a1a2a3', '#989998', '#919393', '#85888a']],
  ['Gray Charcoal Tan', ['#8f8473', '#7f7466', '#746a5d', '#635b50']],
  ['Grey', ['#8d8d8b', '#838481', '#7d7d7a', '#727370']],
  ['Mocha', ['#988774', '#8f7d6a', '#887664', '#7a6959']],
  ['Pewter Blend', ['#b5b3a8', '#a19e95', '#8d8a83', '#74726c']],
  ['Rocky Mountain', ['#89786a', '#6f5e53', '#5f4f44', '#47392f']],
  ['Sable', ['#979289', '#827d75', '#716d66', '#58544d']],
  ['Sable Blend', ['#979289', '#817c75', '#716c66', '#58544d']],
  ['Silverado', ['#838382', '#797979', '#727273', '#68696a']],
  ['Tan', ['#a28b74', '#947d65', '#89735d', '#7a654f']],
  ['Tan Brown Charcoal', ['#948271', '#837363', '#77695a', '#66584c']],
  ['Thunderhead', ['#9c9488', '#8d857b', '#837b72', '#746d64']],
  ['Toccoa', ['#8e7e69', '#837562', '#786d60', '#6b6359']],
];
const EASTON_STONE: Blend[] = [
  ['Amaretto', ['#d7bba1', '#ccaf96', '#bea38b', '#aa8d76']],
  ['Anthracite', ['#605c58', '#5b5754', '#575350', '#4f4b48']],
  ['Bella', ['#97816d', '#887665', '#7a6c60', '#675d56']],
  ['Danville Beige', ['#a69485', '#a08d7e', '#9a8777', '#8e7b6d']],
  ['Hickory', ['#80756a', '#786c61', '#72665c', '#695d52']],
  ['Lueders Gray', ['#958e84', '#8c867d', '#868077', '#7e786f']],
  ['Midnight', ['#6b6864', '#5f5b58', '#5a5653', '#54504d']],
  ['Napoli', ['#a6978a', '#97897d', '#8e8175', '#7e736a']],
  ['Rainier', ['#82776a', '#7b7063', '#766c60', '#6d6256']],
  ['Rio', ['#92918a', '#888881', '#81817b', '#75756f']],
  ['Shaded Gray', ['#807b74', '#7a746d', '#766f69', '#6c665f']],
  ['Sierra', ['#8f7a6a', '#867264', '#816e60', '#796659']],
  ['Slate', ['#a39f96', '#928e89', '#898580', '#7e7a77']],
  ['Victorian', ['#9a8d78', '#928571', '#8d806d', '#786c5a']],
];
const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const CATALINA_SIZES: [number, number][] = [[6, 12], [9, 12], [12, 12]];
const BELGARD: MaterialSpec[] = [
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `catalina-grana-${slugOf(n)}`, name: `Catalina Grana, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'ashlar', sizes: CATALINA_SIZES, joint: 0.2, face: 'textured' }, thickness: 0.06, matches: 'Belgard Catalina Grana', maker: 'Belgard', line: 'Catalina Grana', shelf: 'Pavers', color: n })),
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `border-of-catalina-grana-${slugOf(n)}`, name: `Catalina Grana border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06, auto: true })),
  ...CATALINA_GRANA.map(([n, palette]) => M({ id: `catalina-grana-border-${slugOf(n)}`, name: `Catalina Grana border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06, matches: 'Belgard Catalina Grana', auto: n !== 'Midnight' })),
  ...AB_CLASSIC.map(([n, palette]) => M({ id: `ab-classic-${slugOf(n)}`, name: `AB Classic, ${n}`, use: 'wall', group: 'Walls', recipe: 'wall', palette, wall: { face: 'splitFace', cap: palette[1] }, matches: 'Belgard AB Classic', maker: 'Belgard', line: 'AB Classic', shelf: 'Retaining walls', color: n })),
  ...EASTON_STONE.map(([n, palette]) => M({ id: `easton-stone-${slugOf(n)}`, name: `Easton Stone, ${n}`, use: 'wall', group: 'Walls', recipe: 'wall', palette, wall: { face: 'splitFace', cap: palette[1] }, matches: 'Belgard Easton Stone', maker: 'Belgard', line: 'Easton Stone', shelf: 'Garden walls', color: n })),
  // The generated lines (belgard.ts): pavers with a matching border each, walls and curb.
  ...BELGARD_LINES.flatMap((L): MaterialSpec[] => L.colors.flatMap(([n, palette]): MaterialSpec[] => {
    const id = `${L.slug}-${slugOf(n)}`;
    const tags = { matches: `Belgard ${L.name}`, maker: 'Belgard', line: L.name, shelf: L.shelf, color: n };
    if (L.shelf === 'Pavers') {
      const sizes = L.sizes ?? CATALINA_SIZES;
      return [
        M({ id, name: `${L.name}, ${n}`, use: 'hardscape', group: 'Pavers', recipe: 'paver', palette, pattern: sizes.length > 1 ? { kind: 'ashlar', sizes, joint: 0.2, face: 'textured' } : { kind: 'running', sizes, joint: 0.2, face: 'textured' }, thickness: 0.06, ...tags }),
        M({ id: `border-of-${id}`, name: `${L.name} border, ${n}`, use: 'border', group: 'Pavers', recipe: 'paver', palette, pattern: { kind: 'soldier', sizes: [[6, 9]], joint: 0.15 }, thickness: 0.06, auto: true }),
      ];
    }
    if (L.shelf === 'Curb') return [M({ id, name: `${L.name}, ${n}`, use: 'edging', group: 'Edging', recipe: 'curb', palette: palette.slice(1, 3), ...tags })];
    return [M({ id, name: `${L.name}, ${n}`, use: 'wall', group: 'Walls', recipe: 'wall', palette, wall: { face: 'splitFace', cap: palette[1] }, ...tags })];
  })),
];
MATERIALS.push(...BELGARD);

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
