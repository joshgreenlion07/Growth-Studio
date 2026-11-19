import * as THREE from 'three';
import { featureById, plantById, type FeatureSpec } from '../siteplan/catalog';
import { FOUR_FALL_BACK_SLOPE, FOUR_FALL_SOIL_BEHIND, FOUR_FALL_SOIL_BESIDE, FOUR_FALL_WIDTH, FT, fourFallDepthFt, fourFallOutlineFt, fourFallParams, type FourFallParams } from '../siteplan/fourfall';
import type { FeaturePlacement, PlantPlacement, Vec2 } from '../siteplan/types';
import type { Quality } from '../engine/post';
import { REFRACTION_LAYER, WATER_LAYER_SKIP } from '../engine/water';
import { createWaterfall, disposeWaterfallAssets, waterfallSize, type Waterfall } from './fourfall/waterfall-feature.js';

/**
 * The four-fall rock waterfall in a yard: the stand-alone module in fourfall/ (its own rocks, soil, water and falls,
 * modelled in feet), placed the way every feature is (its plan outline centered on the placement, the front facing +z
 * before the turn), plus what the rest of the yard needs from it: the patch of site ground it replaces, where plants
 * on its mound stand, its lights for the night-light pool, and the light and sky it is drawn under.
 */

/** One waterfall in a built yard; the studio feeds it the sky and ticks it every frame (engine/studio.ts). */
export interface FourFallInstance {
  itemId: string;
  wf: Waterfall;
  /** Its under-fall lights are on (the Fall lights switch). */
  lightsOn: boolean;
  /** It was in the view's frustum when last drawn (the studio keeps drawing every frame only while it is). */
  inView: boolean;
}

/** The module draws its water reading a copy of the scene: only Max and Balanced have room for that pass. */
export const fourFallRefraction = (q: Quality) => q === 'max' || q === 'balanced';
/** Light and Draft (phones and tablets) build the rocks with about a third of the triangles. */
export const fourFallDetail = (q: Quality): 'full' | 'light' => (q === 'light' || q === 'draft' ? 'light' : 'full');

/** Where a placement puts the module: its params, and the turn and offset from plan to the module's own feet. */
export interface FourFallFrame {
  p: FourFallParams;
  /** The plan outline, meters [width, depth], centered on the placement. */
  outline: [number, number];
  /** Rotation used by features.ts: local (x, z) goes to plan (x cos a + z sin a, -x sin a + z cos a) about the placement. */
  a: number;
  at: Vec2;
}

export function fourFallFrame(f: FeaturePlacement, spec: FeatureSpec): FourFallFrame {
  const size = f.size ?? spec.sizes?.[spec.size ?? 0]?.size;
  const p = fourFallParams(size);
  const [w, d] = fourFallOutlineFt(p);
  return { p, outline: [w * FT, d * FT], a: (-f.rotationDeg * Math.PI) / 180, at: f.position };
}

/** A plan point in the module's own space: feet from the middle of its front edge, x to the right, z toward the front. */
export function toModule(fr: FourFallFrame, q: Vec2): [number, number] {
  const dx = q[0] - fr.at[0], dy = q[1] - fr.at[1];
  const lx = dx * Math.cos(fr.a) - dy * Math.sin(fr.a), lz = dx * Math.sin(fr.a) + dy * Math.cos(fr.a);
  return [lx / FT, (lz - fr.outline[1] / 2) / FT];
}

/** Margins, feet, inside the module's soil rectangle where its own soil is fully up (its edges tuck under grade there). */
export const SOIL_MARGIN = 0.78;
/** The front edge of the ground cut, feet from the rockwork's front: the soil is back at grade by then (no groove). */
export const CUT_FRONT = 0.12;

/** The module's soil rectangle (its `soil`), feet, without building it. */
export function soilRect(p: FourFallParams) {
  return { x0: -(FOUR_FALL_WIDTH / 2 + FOUR_FALL_SOIL_BESIDE), x1: FOUR_FALL_WIDTH / 2 + FOUR_FALL_SOIL_BESIDE, z0: -fourFallDepthFt(p) - FOUR_FALL_BACK_SLOPE - 0.8, z1: 0.4 };
}

/**
 * The site ground is not drawn inside each waterfall's own soil (its basin sits below grade): a turned rectangle per
 * waterfall, in plan meters, for the ground shader (builder/ground.ts). The margins are the module's demo host's: the
 * soil's edges are tucked under grade, so the site ground overlaps them.
 */
export interface GroundCut {
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  hx: number;
  hz: number;
}
export function fourFallGroundCuts(features: FeaturePlacement[]): GroundCut[] {
  const out: GroundCut[] = [];
  for (const f of features) {
    const spec = featureById.get(f.catalogId);
    if (spec?.kind !== 'fourFall') continue;
    const fr = fourFallFrame(f, spec), s = soilRect(fr.p), m = SOIL_MARGIN;
    const x0 = (s.x0 + m) * FT, x1 = (s.x1 - m) * FT;
    const z0 = fr.outline[1] / 2 + (s.z0 + m) * FT, z1 = fr.outline[1] / 2 + CUT_FRONT * FT;
    // Center of the cut in the feature's local frame, then in plan space.
    const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
    const cx = f.position[0] + lx * Math.cos(fr.a) + lz * Math.sin(fr.a), cy = f.position[1] - lx * Math.sin(fr.a) + lz * Math.cos(fr.a);
    out.push({ cx, cy, cos: Math.cos(fr.a), sin: Math.sin(fr.a), hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 });
  }
  return out;
}

/** True when a plan point is inside one of the cuts: the same turned-rectangle test as the ground shader. */
export function inGroundCut(cuts: GroundCut[], p: Vec2): boolean {
  for (const c of cuts) {
    const dx = p[0] - c.cx, dy = p[1] - c.cy;
    if (Math.abs(dx * c.cos - dy * c.sin) < c.hx && Math.abs(dx * c.sin + dy * c.cos) < c.hz) return true;
  }
  return false;
}

/** Shared rock and cobble shapes are kept per detail level; a level no built waterfall uses any more is freed. */
export function releaseFourFallAssets(inUse: Iterable<FourFallInstance>) {
  const used = new Set<string>();
  for (const ff of inUse) used.add(ff.wf.options.detail);
  for (const d of ['full', 'light'] as const) if (!used.has(d)) disposeWaterfallAssets(d);
}
export { disposeWaterfallAssets };

/* ------------------------------------------------------------------ */
/* r186 check                                                           */

/**
 * The module patches MeshStandardMaterial shaders by replacing these chunks. String.replace does nothing when a chunk
 * is missing, which would quietly drop an effect (moss, wet band, mulch relief) after a three.js upgrade: every patched
 * material is checked before its patch runs, and a missing chunk is reported once.
 */
const PATCHED = {
  vertex: ['common', 'begin_vertex'],
  fragment: ['common', 'color_fragment', 'roughnessmap_fragment', 'normal_fragment_begin', 'normal_fragment_maps', 'emissivemap_fragment'],
};
const reported = new Set<string>();
function guardPatches(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || m.userData.fourFallGuard) return;
    m.userData.fourFallGuard = true;
    const patch = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      const key = m.customProgramCacheKey();
      for (const [stage, names] of Object.entries(PATCHED)) {
        const src = stage === 'vertex' ? sh.vertexShader : sh.fragmentShader;
        for (const n of names) {
          if (!src.includes(`#include <${n}>`) && !reported.has(`${key}:${n}`)) {
            reported.add(`${key}:${n}`);
            console.error(`Four-fall waterfall: the ${stage} shader of ${key} has no #include <${n}>; that part of its look is missing.`);
          }
        }
      }
      patch.call(m, sh, r);
    };
  });
}
// The water and fall shaders include these whole; three stops with an error if one is gone, but say which.
for (const n of ['packing', 'tonemapping_fragment', 'colorspace_fragment']) if (!(n in THREE.ShaderChunk)) console.error(`Four-fall waterfall: three.js has no shader chunk ${n}.`);
if (!THREE.ShaderChunk.packing.includes('perspectiveDepthToViewZ')) console.error('Four-fall waterfall: perspectiveDepthToViewZ is missing from <packing>.');

/* ------------------------------------------------------------------ */
/* Building                                                             */

export interface FourFallBuilt {
  inst: FourFallInstance;
  /** The module's group placed in the feature's local frame (meters; add to the feature's group). */
  group: THREE.Group;
  /** Lights under the falls, in the feature's local frame (meters, y from the placement's ground). */
  lights: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[];
  /** Points on each fall (feature local), for the Water switch's anchors. */
  falls: THREE.Vector3[];
  /** The soil mound, for autofocus and camera collision. */
  surfaces: THREE.Mesh[];
  /** Feature-local height (m) of the module's origin above the placement's ground. */
  originY: number;
  frame: FourFallFrame;
}

/** `ground`: the yard's ground height at a point of the feature's local frame (meters), relative to the placement's. */
export function buildFourFall(f: FeaturePlacement, spec: FeatureSpec, quality: Quality, ground: (x: number, z: number) => number): FourFallBuilt {
  const frame = fourFallFrame(f, spec), { p } = frame;
  const opts = { unit: FT, height: p.height, lowest: p.lowest, level: p.level, refraction: fourFallRefraction(quality), plants: false, lights: 'data' as const, detail: fourFallDetail(quality) };
  const wf = createWaterfall(opts);
  // The plan outline and the module must agree on the size.
  const ms = waterfallSize(opts), [ow, od] = fourFallOutlineFt(p);
  if (Math.abs(ms.width + 2 * ms.soilBeside - ow) > 1e-6 || Math.abs(ms.depth + ms.soilBehind - od) > 1e-6 || ms.soilBehind !== FOUR_FALL_SOIL_BEHIND) {
    console.error('Four-fall waterfall: the plan outline and the module disagree on its size.', ms, [ow, od]);
  }
  guardPatches(wf.group);
  // The module's origin is the middle of its front edge at finished grade: the outline's front edge, at the ground there.
  const originZ = frame.outline[1] / 2;
  const originY = ground(0, originZ);
  wf.group.position.set(0, originY, originZ);
  const toLocal = (v: THREE.Vector3) => new THREE.Vector3(v.x * FT, originY + v.y * FT, originZ + v.z * FT);
  const lights = wf.nightLights.map((n) => {
    const q = toLocal(n.position);
    return { x: q.x, y: q.y, z: q.z, color: `#${new THREE.Color(n.color).getHexString()}`, intensity: n.intensity * FT * FT, distance: n.distance * FT };
  });
  const falls = wf.layout.falls.map((fl) => toLocal(new THREE.Vector3(fl.x, (fl.top + fl.bot) / 2, fl.z + 0.3)));
  const surfaces: THREE.Mesh[] = [];
  // Its rock, soil and cobbles are what its water looks through (the studio's refraction pass draws only this layer).
  // Its water is left out of the yard's pool reflections: drawn there it would show its look-through copy scrambled.
  wf.body.traverse((o) => {
    let w: THREE.Object3D | null = o;
    while (w && w !== wf.water) w = w.parent;
    if (!w) o.layers.enable(REFRACTION_LAYER);
    else o.layers.set(WATER_LAYER_SKIP);
  });
  wf.body.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.geometry.getAttribute('aMat')) surfaces.push(o);
  });
  return { inst: { itemId: f.id, wf, lightsOn: true, inView: true }, group: wf.group, lights, falls, surfaces, originY, frame };
}

/* ------------------------------------------------------------------ */
/* Plants on the mound                                                  */

/**
 * Plants that fall on a waterfall's soil: each stands on the mound's soil, out of its rock and water. One placed in
 * rock, water or the cobble beach moves to the nearest spot it can stand (within 6 ft, never onto the beach or the
 * patio side); a bed fill plant there is left out. `built`: each waterfall's instance and the world height of its
 * placement's ground (y0) and of its origin above that (originY).
 */
export function plantsOnFourFalls<P extends PlantPlacement>(placements: P[], features: FeaturePlacement[], built: Map<string, { inst: FourFallInstance; originY: number; y0: number }>): (P & { baseY?: number })[] {
  const falls = features.flatMap((f) => {
    const spec = featureById.get(f.catalogId), b = built.get(f.id);
    if (spec?.kind !== 'fourFall' || !b) return [];
    const fr = fourFallFrame(f, spec);
    return [{ fr, soil: soilRect(fr.p), wf: b.inst.wf, baseY: b.y0 + b.originY }];
  });
  if (!falls.length) return placements;
  const out: (P & { baseY?: number })[] = [];
  for (const pl of placements) {
    if ((pl as { baseY?: number }).baseY !== undefined) {
      out.push(pl);
      continue;
    }
    const hit = falls.find((w) => {
      const [x, z] = toModule(w.fr, pl.position);
      return x > w.soil.x0 + SOIL_MARGIN && x < w.soil.x1 - SOIL_MARGIN && z > w.soil.z0 + SOIL_MARGIN && z < CUT_FRONT;
    });
    if (!hit) {
      out.push(pl);
      continue;
    }
    const spec = plantById.get(pl.catalogId);
    const r = Math.min(1.5, ((spec?.installSpread ?? 0.4) / 2) / FT);
    let [x, z] = toModule(hit.fr, pl.position);
    if (!hit.wf.canPlant(x, z, r)) {
      if (pl.id.includes('-fill-')) continue;
      let found: [number, number] | null = null;
      for (let d = 0.25; d <= 6 && !found; d += 0.25) {
        for (let k = 0; k < 16; k++) {
          const t = (k / 16) * Math.PI * 2, nx = x + Math.cos(t) * d, nz = z + Math.sin(t) * d;
          if (nx > hit.soil.x0 + SOIL_MARGIN && nx < hit.soil.x1 - SOIL_MARGIN && nz > hit.soil.z0 + SOIL_MARGIN && nz < -0.25 && hit.wf.canPlant(nx, nz, r)) {
            found = [nx, nz];
            break;
          }
        }
      }
      if (found) [x, z] = found;
      else console.warn(`Four-fall waterfall: no spot on the mound near plant ${pl.id}; it stays where it was placed.`);
    }
    // Back to plan meters: module feet to the feature's local frame, then turned and moved like features.ts places it.
    const lx = x * FT, lz = hit.fr.outline[1] / 2 + z * FT, a = hit.fr.a;
    const position: Vec2 = [hit.fr.at[0] + lx * Math.cos(a) + lz * Math.sin(a), hit.fr.at[1] - lx * Math.sin(a) + lz * Math.cos(a)];
    out.push({ ...pl, position, baseY: hit.baseY + hit.wf.soilHeight(x, z) * FT - 0.01 });
  }
  return out;
}
