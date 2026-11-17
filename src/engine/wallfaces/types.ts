import type { RGB } from '../textures';

/**
 * One texel of a maker wall face, as the unit layout (unitWallSet in surfaces.ts) sees it. Lengths are in meters.
 * The face's overall color is set afterwards from the swatch photo (the painted texture is rescaled so its average
 * matches), so a recipe only has to get the pattern, relief and the variation between and within stones right.
 */
export interface WallTexel {
  /** Texture coordinates in [0, 1) and the tile size. Noise must tile: use a whole-number period, e.g. vnoise(u * n, v * n, n). */
  u: number;
  v: number;
  T: number;
  /** A stable id for this unit (or half-unit) in the tile: per-unit randomness via hash(id, k). */
  id: number;
  /** Position inside the unit from its left end and from its bottom, and the unit's face width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Distance to the unit's nearest edge. */
  edge: number;
  /** The unit's virtual joint from its left end (WallUnit.split), or -1. */
  split: number;
  /** For units with two offset halves (WallUnit.halfShift): 0 lower half, 1 upper half; otherwise -1. */
  half: number;
  /** Tones as photographed (sRGB 0..1): the stone tones (the swatch's lighter three) and the joint tone (its darkest). */
  stone: RGB[];
  joint: RGB;
}

/** A texel's height (0..1, 0 = bottom of a joint), sRGB color and roughness (0..1). */
export interface WallSample {
  h: number;
  c: RGB;
  r: number;
}

export interface WallFaceRecipe {
  /** Normal-map strength for the painted height (as paint()'s normalStrength): smoothUnit uses 6, roughHewn 18. */
  normal: number;
  /** One texel. Joints between units are the recipe's to draw too (edge is the distance to the unit's edge). */
  texel(t: WallTexel): WallSample;
  /** The cap is the textured stone cap (rough or chiseled edges) rather than a plain colored slab. */
  roughCap?: boolean;
  /**
   * Brightens the face's matched average color (1 = none): deep relief and wide dark joints shade darker in the renderer
   * than in the swatch photo, so such a face is lifted until it renders as the photo (measured in the 3D view).
   */
  lift?: number;
}
