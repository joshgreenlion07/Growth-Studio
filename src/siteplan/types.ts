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
  /** Hardscape in a paver that offers laying patterns (see LayingPattern and layingsFor in the catalog). Left out, the paver's first. */
  laying?: 'a' | 'b' | 'random' | 'running3' | 'running' | 'herringbone';
  /** Small lights set into the border, every ~2.4 m. */
  borderLights?: boolean;
  /** Hardscape: top of the surface this far above grade (m), on solid sides. */
  elevation?: number;
  /** Beds: a raised planter with walls of this material and height (m). */
  raised?: { wallCatalogId: string; height: number };
  /**
   * What goes under the surface, for the build stages (meters): compacted base rock and the bedding
   * layer (sand under pavers, fines under synthetic grass). Left out, the material's usual depths.
   */
  layers?: { base?: number; bedding?: number };
  /**
   * Hardscape in a maker's composite deck boards (see siteplan/decking.ts): how the boards are laid. The deck's height
   * is `elevation` (top of the boards above grade; left out, 8 in). Left out, straight boards with a picture frame.
   */
  deck?: DeckLayout;
}

/** How a composite deck is laid (all optional). */
export interface DeckLayout {
  /** straight: boards along the deck. diagonal: at 45 degrees. chevron: two halves at 45 degrees meeting on a center seam. */
  pattern?: 'straight' | 'diagonal' | 'chevron';
  /** Direction of the boards (straight), or of the seam (diagonal, chevron: boards at 45 degrees to it), degrees from plan x toward plan y. Left out, the deck's longest side. */
  angleDeg?: number;
  /** Board face width, inches. Left out, the board's own (5 1/2 in). */
  boardIn?: number;
  /** Picture-frame border: one board along the outside edge and around each opening, mitered at the corners. Left out, true. */
  frame?: boolean;
  /** Chevron: a straight divider board along the seam. Left out, none (the halves meet board to board). */
  divider?: boolean;
  /** Chevron: the seam's distance from the middle of the deck, meters, across the seam. */
  seamOffset?: number;
  /** Fascia boards on the sides. Left out, true. */
  fascia?: boolean;
  /**
   * A hot tub on the deck, in its framed opening: 'level' (default) stands it on a pad at the deck's height, its whole
   * cabinet above the boards; 'sunk' sets it down on the ground, so the deck covers the lower part of its cabinet.
   */
  tub?: 'level' | 'sunk';
  /** Openings through the deck (a tree, an access hatch), framed like the edge. A hot tub placed on a deck is set into its own opening without being listed. */
  holes?: Vec2[][];
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
  /** Curbs: how much of the curb shows above grade, meters (Melville Curb is 6 1/2 in tall). Left out, 3 in. */
  reveal?: number;
  /**
   * Paver edging (an edging line whose catalogId is a paver border look, use 'border'): one row of 6 x 9 pavers along
   * the line, centered on it. soldier (default): long side across the run. sailor: long side along it.
   */
  course?: 'soldier' | 'sailor';
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
  /** Choices for the feature's on/off options (its catalog `options`, e.g. a sauna's door and lights). Left out, the defaults. */
  options?: Record<string, boolean>;
  /** Features that come in sizes (the catalog's `sizes`): length, depth and height in meters. Left out, the catalog's size. */
  size?: [number, number, number];
  /** A planter's own planting: false draws it empty (soil only). Left out, planted. */
  planted?: boolean;
  /** A maker's hot tub: its cover folded up on the lifter ('open', the default), on the spa ('closed'), or none ('off'). */
  cover?: 'open' | 'closed' | 'off';
  /** A maker's hot tub: its steps. Left out, they are shown. */
  steps?: boolean;
  /** A lighting fixture's options (a `landscapeLight` feature). Each left out takes the fixture's default. */
  fixture?: FixtureSetting;
}

/** How a lighting fixture is ordered and aimed: only choices its maker offers are kept. */
export interface FixtureSetting {
  /** Finish id ('black', 'bronze', 'brown', 'white', 'gray', 'stainless'). */
  finish?: string;
  /** Beam angle in degrees (fixtures with a choice of optics or lamps). */
  beamDeg?: number;
  /** Color temperature in kelvin (fixtures with a choice). */
  kelvin?: number;
  /** Aim of an adjustable head, degrees from straight up, tipped toward the placement's front. */
  tiltDeg?: number;
  /** Meters above grade for a fixture on a wall, cap, riser or post (the underside of the cap for cap lights). */
  mountHeight?: number;
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
  /** A cover is a roofed patio on posts (a California patio). With `walls` it becomes a California room. Every cover has a concrete floor. */
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
  /**
   * Covers only: mid-span posts. Left out (or false), each open side is spanned by its header (a room) or beam (a
   * patio), and only free corners open on both sides keep a column. true adds a post about every 4 m along long
   * open sides as well.
   */
  posts?: boolean;
  /** Covers only: a California room (the planner's category), even with no wall on any side. */
  room?: boolean;
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

/* ------------------------------------------------------------------ */
/* Underground utilities                                                */

/** What a buried run carries. Paint and pipe colors follow it (APWA marking colors for paint). */
export type UtilityKind = 'electrical' | 'lighting' | 'gas' | 'irrigation' | 'water' | 'drain';

/** One pipe, conduit or cable in a trench. */
export interface UtilityRun {
  kind: UtilityKind;
  /** What it is, for labels, such as "3/4 in PVC conduit". */
  label: string;
  /** Outside diameter of the pipe, conduit or cable, meters. */
  od: number;
  /** Cover: top of the pipe to finished grade, meters. */
  cover: number;
  /** Where the cover comes from, for labels, such as "CEC Table 300.5". */
  code?: string;
  /** Plastic gas pipe: an 18 AWG copper tracer wire laid on top of it. */
  tracer?: boolean;
}

/** A trench route. One run is a single trench; two or more share a joint trench. */
export interface UtilityLine extends ItemBase {
  /** Route, in order. */
  points: Vec2[];
  runs: UtilityRun[];
  /**
   * Joint trench: clear space kept between runs stacked in it, meters. Runs keep their own cover; the
   * deeper one is pushed down when it would come closer than this. Left out, 0.15 (6 in).
   */
  gap?: number;
}

export type UtilityPointKind =
  | 'panel' | 'subpanel' | 'outlet' | 'junction' | 'transformer'
  | 'gas-meter' | 'gas-stub'
  | 'water-meter' | 'backflow' | 'controller' | 'valves' | 'hose-bib'
  | 'stub';

/** Equipment a run starts or ends at: an electrical panel, a gas meter, a valve box. */
export interface UtilityPoint extends ItemBase {
  kind: UtilityPointKind;
  position: Vec2;
  /** The designer's name for it, such as "Main panel". Left out, the kind's own name. */
  label?: string;
  /** Degrees clockwise from facing down the page. */
  rotationDeg?: number;
}

export interface Utilities {
  lines: UtilityLine[];
  points: UtilityPoint[];
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
  /** Underground utilities: trench routes and the equipment they connect. Left out, none. */
  utilities?: Utilities;
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
