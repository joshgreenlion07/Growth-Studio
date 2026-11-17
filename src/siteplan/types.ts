/**
 * The SitePlan: the one contract between the plan reader, the plan editor,
 * the scene builder and the renderer.
 *
 * Units are meters. Plan coordinates are [x, y] with x to the right and y
 * down the page, the way a blueprint reads. In 3D, x stays x and plan y
 * becomes world z, so the bottom of the plan faces the default camera.
 */

export type Vec2 = [number, number];

/** Where an item came from. AI items carry a confidence the editor highlights. */
export type ItemSource = 'ai' | 'person' | 'sample';

export interface ItemBase {
  id: string;
  source?: ItemSource;
  /** 0 to 1. Only meaningful for AI items. Below 0.6 the editor flags it. */
  confidence?: number;
  /** Short note from the plan reader or the designer. */
  note?: string;
}

export type ZoneKind = 'turf' | 'bed' | 'hardscape';

export interface Zone extends ItemBase {
  kind: ZoneKind;
  /** Material catalog id (lawn, mulch, pavers, ...). */
  catalogId: string;
  polygon: Vec2[];
  /** Mass planting: fill this bed with one plant at a spacing (meters). */
  fill?: { catalogId: string; spacing: number };
  /** Hardscape: a soldier-course border band around the edge. */
  border?: { catalogId: string; width: number; /** soldier (default): long side across the band. sailor: long side along the edge. */ course?: 'soldier' | 'sailor' };
  /** Hardscape in a 3-piece paver set: the laying pattern (see LayingPattern in the catalog). Left out, Pattern A. */
  laying?: 'a' | 'b' | 'random';
  /** Small lights set into the border, every ~2.4 m. */
  borderLights?: boolean;
  /** Hardscape: top of the surface this far above grade (m), on solid sides. */
  elevation?: number;
  /** Beds: a raised planter with walls of this material and height (m). */
  raised?: { wallCatalogId: string; height: number };
}

/** steps: a flight of stairs whose top edge is the line, going down away from a raised zone. */
export type LineKind = 'wall' | 'fence' | 'edging' | 'steps';

export interface LineItem extends ItemBase {
  kind: LineKind;
  catalogId: string;
  /** A closed run repeats its first point as its last. */
  points: Vec2[];
  /** Height in meters, up to 6.5 for walls and 3.5 for fences. Edging ignores it. */
  height: number;
  /** Walls: cap color. 'same' matches the block, 'midnight' is a dark charcoal cap. Left out, the block's own cap. */
  cap?: 'same' | 'midnight';
  /** Fences: a topper added above the fence height. Left out, none. */
  topper?: 'lattice' | 'cap';
  /** Steps: riser height and tread depth, meters. `height` is the total rise. */
  riser?: number;
  tread?: number;
}

export type WaterKind = 'pond' | 'pool' | 'fountain' | 'stream' | 'pondless';

export interface WaterFeature extends ItemBase {
  kind: WaterKind;
  /** Outline for pond, pool and fountain basins. */
  polygon?: Vec2[];
  /** Centerline for a stream. */
  points?: Vec2[];
  /** Stream width in meters. */
  width?: number;
  /** Deepest point in meters. */
  depth: number;
  /** Pool: a shallow tanning ledge at the first edge. */
  ledge?: boolean;
  /** Stream or pondless: number of waterfall drops along the run. */
  falls?: number;
  /** Underwater lights at the falls, lit at dusk and night. */
  lights?: boolean;
  /** Pool: coping width in meters. 0 means no coping. Left out, the pool gets the standard 0.25 m coping. */
  coping?: number;
}

export interface PlantPlacement extends ItemBase {
  catalogId: string;
  position: Vec2;
  /** Existing plants stay at their current size on the growth slider. */
  existing?: boolean;
  /** Optional size multiplier, 0.6 to 1.4. */
  scale?: number;
  /** Nursery container it is installed from ('1g', '2g', '5g', '15g', '24b', '36b', '48b'). Left out, the catalog's own. */
  container?: '1g' | '2g' | '5g' | '15g' | '24b' | '36b' | '48b';
}

/**
 * A designer's own rendering of a feature (a water wall, a rock waterfall),
 * placed on a footprint drawn in the plan. The file is not part of the plan:
 * `asset` names it, and the page that owns the plan hands it over separately
 * (see "Embedding" in the README).
 */
export interface ModelPlacement extends ItemBase {
  /** The drawn footprint. The model is sized to the box this sits in. */
  polygon: Vec2[];
  /** Id of the uploaded file. */
  asset: string;
  /** glb: a 3D model. image: a picture, shown as a standing board across the footprint. */
  kind: 'glb' | 'image';
  /** Overall height in meters. Left out, it follows the model's own proportions. */
  height?: number;
  /** Quarter turns clockwise from above. 0 puts the front on the long side that faces down the page. */
  turn: 0 | 1 | 2 | 3;
  /** contain (default): keep the model's proportions inside the footprint. stretch: fill the drawn size exactly. */
  fit: 'contain' | 'stretch';
}

export interface FeaturePlacement extends ItemBase {
  catalogId: string;
  position: Vec2;
  rotationDeg: number;
  /** A stepping stone's material (a `dimensions-slab-24-*` look). Left out, the default slab color. */
  materialId?: string;
}

/** A door or window the designer marked on a wall. */
export interface StructureOpening {
  kind: 'door' | 'window';
  /** Center of the opening, on or near a wall. It is moved onto the nearest wall. */
  at: Vec2;
  /** Width in meters. */
  width: number;
}

export interface ExistingStructure extends ItemBase {
  /** A cover is a roofed patio on posts (a California patio). With `walls` it becomes a California room. */
  kind: 'house' | 'garage' | 'shed' | 'cover';
  polygon: Vec2[];
  /** Wall height in meters. For a cover, the height of the underside of the roof. */
  height: number;
  roof: 'hip' | 'flat';
  /** Marked doors and windows. When present, no automatic ones are added. */
  openings?: StructureOpening[];
  /**
   * Covers only: one entry per polygon edge, edge i running from polygon[i] to polygon[(i + 1) % n].
   * true is a solid stucco wall along that edge from the ground to the roof; false (or left out) is open,
   * on posts. An edge against a house wall is never walled. Left out, the cover is open on every side.
   */
  walls?: boolean[];
}

export interface SiteInfo {
  name: string;
  /** Property boundary, clockwise or counter-clockwise. */
  boundary: Vec2[];
  latitude: number;
  longitude: number;
  /** Degrees clockwise from plan-up to true north. 0 means north is up. */
  northAngleDeg: number;
  /** Index of the boundary edge that faces the street, if any. */
  streetEdge?: number;
}

/** A dimension drawn with the ruler: a measured straight run between two points, with an optional name. */
export interface Ruler {
  id: string;
  a: Vec2;
  b: Vec2;
  /** What the person called it, such as "Patio width". Empty means the length alone. */
  label?: string;
}

export interface SitePlan {
  schemaVersion: 1;
  site: SiteInfo;
  structures: ExistingStructure[];
  zones: Zone[];
  lines: LineItem[];
  water: WaterFeature[];
  plants: PlantPlacement[];
  features: FeaturePlacement[];
  /** Uploaded models. Left out of plans saved before they existed. */
  models?: ModelPlacement[];
  /** Dimensions drawn with the ruler. Left out of plans saved before they existed. */
  rulers?: Ruler[];
}

export const EMPTY_PLAN = (): SitePlan => ({
  schemaVersion: 1,
  site: {
    name: 'New yard',
    boundary: [[0, 0], [18, 0], [18, 14], [0, 14]],
    latitude: 37.64,
    longitude: -120.99,
    northAngleDeg: 0,
    streetEdge: 2,
  },
  structures: [],
  zones: [],
  lines: [],
  water: [],
  plants: [],
  features: [],
});
