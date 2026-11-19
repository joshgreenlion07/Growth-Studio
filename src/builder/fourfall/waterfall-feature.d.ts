import type * as THREE from 'three';

/** All lengths are in feet unless noted. */
export interface WaterfallOptions {
  /** Front width. All rockwork stays inside it. Default 12. */
  width?: number;
  /** Patio level to the top head stone. Owner's range 7 to 8. Default 7.5. */
  height?: number;
  /** Lowest level, front to back. Owner's range 5 to 6. Default 5.5. */
  lowest?: number;
  /** Each of the three upper levels, front to back. Owner's range 3 to 5. Default 3. */
  level?: number;
  /** How far the planted soil runs behind the top stones before it is back at grade. Default 4.5. */
  backSlope?: number;
  /** Raise the whole feature. Use about 0.6 when the host cannot open its ground under it. Default 0. */
  lift?: number;
  /** World units per foot. 0.3048 for a scene in metres. Default 1. */
  unit?: number;
  /** Same seed, same rock placement. */
  seed?: number;
  /** The model's own generic planting. Leave off when the plan supplies real plants. Default false. */
  plants?: boolean;
  /** Moss cushions in the rock seams. Default true. */
  moss?: boolean;
  /** 'data': only report where the under-fall lights go. 'three': also add PointLights. false: none. Default 'data'. */
  lights?: 'data' | 'three' | false;
  /** Water reads a colour + depth copy of the scene (see setRefraction). Default true. Cannot change after creation. */
  refraction?: boolean;
  /** 'light': rocks with about a third of the triangles, for phones and tablets. Same layout. Default 'full'. */
  detail?: 'full' | 'light';
  /** Rock and cobble shading. 'light' drops the finest grain, speckle and lichen (about a quarter of the noise work). Left out, it follows detail. Cannot change after creation. */
  shading?: 'full' | 'light' | null;
  /** Blend the edge of the soil into the host's ground. See setGround. Default null (off). */
  ground?: WaterfallGround | null;
}

export interface WaterfallFall { i: number; x: number; z: number; w: number; top: number; bot: number; drop: number; land: number }
export interface WaterfallPool { cx: number; cz: number; rx: number; rz: number; wl: number; depth: number; basin?: boolean }
export interface WaterfallLayout { H: number; D: number; base: number; lvl: number; head: number; top: number; falls: WaterfallFall[]; pools: WaterfallPool[] }

export interface WaterfallGround {
  /** The host ground's average colour, unlit: THREE.Color in linear space, or a hex number / CSS string. */
  color: THREE.Color | number | string;
  /** Default 0.95. */
  roughness?: number;
  /** How far in from the border the blend reaches, feet. Default 2.5. */
  width?: number;
  /** 0 to 1: how much of the bark chip pattern and relief stays in the faded band. The pattern averages 1, so the band averages `color`. 0 fades to the colour flat. Default 1. */
  texture?: number;
  /** Spacing of the host's own bark chips, feet (for example 0.096). When given, the host side of the fade is drawn as round chips that far apart (joints falling to 0.55, about 20% chip-to-chip variation, average 1), dissolving into the feature's own shards. Left out, the band uses the feature's chips. */
  chipSize?: number;
  /** 0 to 1: how far the whole mound's bark is shifted toward that colour. Default 0. */
  tint?: number;
  /** How far below the host's ground the border of the soil sits, feet. Default 0.03 (0.3 when no ground is set). */
  sink?: number;
}

export interface WaterfallNightLight {
  /** Feature-local feet. Convert with wf.body.localToWorld(). */
  position: THREE.Vector3;
  color: number;
  /** For a scene in feet. Multiply by unit squared for other units. */
  intensity: number;
  /** Feet. */
  distance: number;
}

export interface WaterfallEnvironment {
  skyTop?: THREE.Color;
  skyHorizon?: THREE.Color;
  /** What low reflections show: dark foliage or fence. */
  treeline?: THREE.Color;
  /** Toward the sun, world space. */
  sunDir?: THREE.Vector3;
  sunColor?: THREE.Color;
  sunIntensity?: number;
  /** 0 to 1. 0 hides the sun glint and most of the caustics. */
  sunVisible?: number;
  /** Sky light on the white water: colour times strength. */
  ambient?: THREE.Color;
  /** Colour of the lights under the falls. */
  glowColor?: THREE.Color;
  /** Extra glow through leaves when facing a low sun (only matters with plants: true). */
  backlight?: THREE.Color;
}

export interface Waterfall {
  /** Add this to the scene, then position and rotate it. Its scale is set to `unit`. */
  group: THREE.Group;
  /** Child of group that holds everything, in feet. Use body.worldToLocal / localToWorld to convert points. */
  body: THREE.Group;
  /** Water surfaces, ribbons and spray. Hide during the refraction pre-pass. */
  water: THREE.Group;
  options: Required<WaterfallOptions>;
  layout: WaterfallLayout;
  nightLights: WaterfallNightLight[];
  /** Overall size in feet. */
  size: { width: number; depth: number; height: number };
  /** Rectangle of soil the feature brings with it, feature-local feet. The host should not draw its own ground inside it. */
  soil: { x0: number; x1: number; z0: number; z1: number };
  /** Soil height in feet above the feature origin at a feature-local point. */
  soilHeight(x: number, z: number): number;
  /** True when a plant of this radius can stand at a feature-local point (not in water, a fall, the beach or a rock). */
  canPlant(x: number, z: number, radius?: number): boolean;
  setEnvironment(e: WaterfallEnvironment): Waterfall;
  /** Pump on or off. Off hides the falling sheets and spray and stills the pools. Kept across rebuild(). */
  setFlowing(on: boolean): Waterfall;
  /** Blend the edge of the soil into the host's ground, or pass null to switch it off. A changed sink, or on/off, rebuilds. */
  setGround(g: Partial<WaterfallGround> | null): Waterfall;
  setRefraction(r: { color: THREE.Texture; depth: THREE.DepthTexture; width: number; height: number; near: number; far: number }): Waterfall;
  /** Every frame. pointScale = drawing-buffer height in px * 0.5 * camera.projectionMatrix.elements[5]. */
  update(timeSeconds: number, frame?: { lightLevel?: number; pointScale?: number }): Waterfall;
  rebuild(next?: Partial<WaterfallOptions>): Waterfall;
  dispose(): void;
}

export const WATERFALL_DEFAULTS: Required<WaterfallOptions>;
export function waterfallSize(options?: WaterfallOptions): { width: number; depth: number; height: number; soilBehind: number; soilBeside: number };
export function createWaterfall(options?: WaterfallOptions): Waterfall;
/** Frees the shared geometry of one detail level, or of every level when called with no argument. */
export function disposeWaterfallAssets(detail?: 'full' | 'light'): void;
