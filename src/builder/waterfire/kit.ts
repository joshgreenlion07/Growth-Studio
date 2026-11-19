import * as THREE from 'three';
import type { FeatureSpec } from '../../siteplan/catalog';
import type { FeaturePlacement } from '../../siteplan/types';
import type { FeatureAction } from '../actions';
import type { Tongue } from '../fire';
import type { FountainSink } from '../pillarfountain';

/*
 * Shared pieces for the maker water and fire builders (siteplan/waterfire.ts): what a builder is handed, the lift onto
 * paving, a lathe with seamless wrap-around UVs, and the wall-face color calibration. Local feature space: front +z,
 * meters, base at y = 0 (the grade, or the paving's top once lifted).
 */

export const IN = 0.0254;

export interface WaterFireContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  /** Static parts, water objects, night lights, glow, animated water, owned materials and pebble beds (local space). */
  sink: FountainSink;
  /** Flame tongues of a gas fire (one burner per call); its Hand action is made for it. */
  fire: (tongues: Tongue[]) => void;
  /** The fire's flickering night light. */
  fireLight: (x: number, y: number, z: number, color: string, intensity: number, distance: number) => void;
  /** Something to use by hand, registered for this placement. */
  act: (a: Omit<FeatureAction, 'itemId'>) => void;
  /** An action's anchor at a local point. */
  anchor: (x: number, y: number, z: number) => THREE.Object3D;
  /** The placement's choice for one of the catalog's on/off options. */
  option: (key: string) => boolean;
}

/**
 * The context with everything moved up by `up` meters: a piece set on paving stands on the paving's top, not on the
 * grade under it (paving is drawn its thickness above grade), with its water, lights, flames, pebbles and anchors.
 */
export function lifted(c: WaterFireContext, up: number): WaterFireContext {
  if (!up) return c;
  const s = c.sink;
  const sink: FountainSink = {
    ...s,
    add: (m, g) => s.add(m, g.translate(0, up, 0)),
    object: (o) => {
      o.position.y += up;
      s.object(o);
    },
    light: (x, y, z, ...rest) => s.light(x, y + up, z, ...rest),
    pebbles: (id, outline, holes, topIn, tint) => s.pebbles(id, outline, holes, topIn + up / IN, tint),
    plant: (id, x, y, z, size) => s.plant(id, x, y + up, z, size),
  };
  return {
    ...c,
    sink,
    fire: (t) => c.fire(t.map((k) => ({ ...k, y: k.y + up }))),
    fireLight: (x, y, z, ...rest) => c.fireLight(x, y + up, z, ...rest),
    anchor: (x, y, z) => c.anchor(x, y + up, z),
  };
}

/**
 * A lathe of a profile (inches: radius, height, from the bottom up), with three's own smooth normals (they average each
 * point's two segments and close the seam; repeat a point for a crisp edge). UVs in meters: v the length along
 * the profile from its first point, u the arc length round at the profile's widest radius, rounded to a whole number
 * of `tile` meter repeats so the texture closes without a seam.
 */
export function lathe(profile: [number, number][], tile: number, seg = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * IN, y * IN)), seg);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const along: number[] = [0];
  for (let i = 1; i < profile.length; i++) along.push(along[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]) * IN);
  const rMax = Math.max(...profile.map((p) => p[0])) * IN;
  const round = Math.max(1, Math.round((Math.PI * 2 * rMax) / tile)) * tile;
  for (let i = 0; i < uv.count; i++) {
    const k = Math.round(uv.getY(i) * (profile.length - 1));
    uv.setXY(i, uv.getX(i) * round, along[k]);
  }
  return g;
}

/** Length along a profile (meters) to each of its points: where a lathe's v reaches them. */
export function alongProfile(profile: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < profile.length; i++) out.push(out[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]) * IN);
  return out;
}

/*
 * Colors read from a maker's photo of an upright face, turned into the albedo (linear) that renders back as that color
 * on an upright face in the default afternoon light (engine/surfaces.ts measures rendered = WALL_GAIN x albedo there).
 */
const WALL_GAIN = [1.68, 1.77, 2.0];
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** Linear albedo for a photographed upright color (sRGB 0..255); `gloss` takes off what a glossy face's sheen adds. */
export function uprightAlbedo(rgb: [number, number, number], gloss = 1): [number, number, number] {
  return rgb.map((v, i) => (toLin(v / 255) / WALL_GAIN[i]) * gloss) as [number, number, number];
}
