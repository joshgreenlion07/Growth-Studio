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
  border?: { catalogId: string; width: number };
  /** Small lights set into the border, every ~2.4 m. */
  borderLights?: boolean;
  /** Beds: a raised planter with walls of this material and height (m). */
  raised?: { wallCatalogId: string; height: number };
}

export type LineKind = 'wall' | 'fence' | 'edging';

export interface LineItem extends ItemBase {
  kind: LineKind;
  catalogId: string;
  /** A closed run repeats its first point as its last. */
  points: Vec2[];
  /** Height in meters, up to 6.5 for walls and 3.5 for fences. Edging ignores it. */
  height: number;
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
}

export interface FeaturePlacement extends ItemBase {
  catalogId: string;
  position: Vec2;
  rotationDeg: number;
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
  /** A cover is a roofed patio on posts (a California patio): no walls. */
  kind: 'house' | 'garage' | 'shed' | 'cover';
  polygon: Vec2[];
  /** Wall height in meters. For a cover, the height of the underside of the roof. */
  height: number;
  roof: 'hip' | 'flat';
  /** Marked doors and windows. When present, no automatic ones are added. */
  openings?: StructureOpening[];
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

export interface SitePlan {
  schemaVersion: 1;
  site: SiteInfo;
  structures: ExistingStructure[];
  zones: Zone[];
  lines: LineItem[];
  water: WaterFeature[];
  plants: PlantPlacement[];
  features: FeaturePlacement[];
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
