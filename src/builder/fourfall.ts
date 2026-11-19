import * as THREE from 'three';
import { featureById, materialById, plantById, type FeatureSpec } from '../siteplan/catalog';
import { pointInPolygon } from '../siteplan/geometry';
import { FOUR_FALL_BACK_SLOPE, FOUR_FALL_SOIL_BEHIND, FOUR_FALL_SOIL_BESIDE, FOUR_FALL_WIDTH, FT, fourFallDepthFt, fourFallOutlineFt, fourFallParams, type FourFallParams } from '../siteplan/fourfall';
import type { FeaturePlacement, PlantPlacement, Vec2, Zone } from '../siteplan/types';
import type { Quality } from '../engine/post';
import { REFRACTION_LAYER, WATER_LAYER_SKIP } from '../engine/water';
import { createWaterfall, disposeWaterfallAssets, waterfallSize, type Waterfall, type WaterfallGround } from './fourfall/waterfall-feature.js';

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

/**
 * Without a bed to blend into (lawn, paving or nothing under its center): margins, feet, inside the module's soil
 * rectangle where its own soil is fully up (its edges tuck 0.3 ft under grade there), and the front edge of the ground
 * cut, feet from the rockwork's front, where the soil is back at grade (no groove).
 */
export const SOIL_MARGIN = 0.78;
export const CUT_FRONT = 0.12;

/** The module's soil rectangle (its `soil`), feet, without building it. */
export function soilRect(p: FourFallParams) {
  const w = p.width ?? FOUR_FALL_WIDTH;
  return { x0: -(w / 2 + FOUR_FALL_SOIL_BESIDE), x1: w / 2 + FOUR_FALL_SOIL_BESIDE, z0: -fourFallDepthFt(p) - FOUR_FALL_BACK_SLOPE - 0.8, z1: 0.4 };
}

/**
 * The topmost planting bed at a plan point, passing over any paving or lawn drawn above it; raised planters count.
 * The one bed lookup for a waterfall's soil (its mound's cover and the blend of its soil's edge, fourFallBedChoice).
 */
export function bedZoneAt(zones: Zone[]): (p: Vec2) => Zone | null {
  return (p) => {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (z.kind === 'bed' && pointInPolygon(p, z.polygon)) return z;
    }
    return null;
  };
}

/**
 * How far past a waterfall's soil rectangle the bed is levelled to its grade (ground.ts: flat for 0.25 m, then easing
 * back to the bed's own height by this distance), meters.
 */
export const LEVEL_REACH = 0.85;

/**
 * Plan points along a waterfall's soil rectangle border, where the blend into the bed shows: its corners and every
 * 0.4 m or so along each edge. `out` (meters) samples a ring that far outside the border instead.
 */
export function fourFallBorderPoints(f: FeaturePlacement, spec: FeatureSpec, out = 0): Vec2[] {
  const fr = fourFallFrame(f, spec), s = soilRect(fr.p);
  const x0 = s.x0 * FT - out, x1 = s.x1 * FT + out, z0 = fr.outline[1] / 2 + s.z0 * FT - out, z1 = fr.outline[1] / 2 + s.z1 * FT + out;
  const pts: Vec2[] = [];
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
    for (let i = 0; i < n; i++) pts.push(toPlan(fr, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n));
  };
  edge(x0, z0, x1, z0);
  edge(x1, z0, x1, z1);
  edge(x1, z1, x0, z1);
  edge(x0, z1, x0, z0);
  return pts;
}

/** A point of the feature's local frame (meters, centered on the placement) in plan meters. */
function toPlan(fr: FourFallFrame, lx: number, lz: number): Vec2 {
  return [fr.at[0] + lx * Math.cos(fr.a) + lz * Math.sin(fr.a), fr.at[1] - lx * Math.sin(fr.a) + lz * Math.cos(fr.a)];
}

/** Where a waterfall's module stands: the middle of its outline's front edge, in plan meters. */
export function fourFallFront(f: FeaturePlacement, spec: FeatureSpec): Vec2 {
  const fr = fourFallFrame(f, spec);
  return toPlan(fr, 0, fr.outline[1] / 2);
}

/**
 * The bed a waterfall is set in, decided once per waterfall by the ground model (ground.ts) and read by everything else.
 * - `mulch`: the bed material its mound's soil cover is recoloured to (fourFallMulch): the material most points of its
 *   soil border lie in, by bedZoneAt (so a bed drawn as several shapes of one material still counts as one), or with
 *   none on the border, the material most of five points inside its outline lie in (the center and four points 0.4 of
 *   the way to its corners).
 * - `bed`, `blend`: the edge of its soil fades into the bed zone `bed` and comes up flush with it (setGround), the site
 *   ground and the bed's loose stones, humus and turf are cut on its soil rectangle, and the bed is levelled to the
 *   waterfall's grade `y` around it (ground.ts). `bed` is the zone of that material on top at most border points; the
 *   blend holds only when it is on the ground (not a raised planter), in a catalog material, and:
 *   - every border point has that very zone on top (the ground model's zoneAt), or is already at the grade within 1 cm
 *     (paving or lawn drawn over the bed or beside it is never levelled, so anything else leaves a step);
 *   - every point of a ring LEVEL_REACH outside the border has a planting bed on the ground on top, or is at the grade,
 *     so the levelling never reaches a bed edge that meets ground at another height (a cliff);
 *   - it does not come within its levelling reach of another blended waterfall set at another grade (ground.ts).
 *   Any other waterfall keeps its edges tucked under grade and the inset cut.
 */
export interface FourFallBedChoice {
  mulch?: string;
  bed: Zone | null;
  blend: boolean;
  /** The grade it stands at: the ground's own height at its front middle (fourFallFront). */
  y: number;
}

/**
 * `bedAt`: bedZoneAt over the plan's zones (for the material); `zoneAt`: the ground model's top zone at a point;
 * `grade`: the ground's height before any levelling.
 */
export function fourFallBedChoice(f: FeaturePlacement, spec: FeatureSpec, bedAt: (p: Vec2) => Zone | null, zoneAt: (p: Vec2) => Zone | null, grade: (p: Vec2) => number): FourFallBedChoice {
  const fr = fourFallFrame(f, spec), y = grade(fourFallFront(f, spec));
  const vote = (pts: Vec2[]) => {
    const n = new Map<string, number>();
    for (const p of pts) {
      const id = bedAt(p)?.catalogId;
      if (id) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const border = fourFallBorderPoints(f, spec);
  const [w, d] = fr.outline;
  const mulch = vote(border) ?? vote([[0, 0], [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([sx, sz]) => toPlan(fr, sx * w, sz * d)));
  // The bed zone of that material on top at most border points.
  const tops = border.map(zoneAt);
  const n = new Map<Zone, number>();
  for (const z of tops) if (z && z.kind === 'bed' && z.catalogId === mulch) n.set(z, (n.get(z) ?? 0) + 1);
  const bed = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const atGrade = (p: Vec2) => Math.abs(grade(p) - y) < 0.01;
  const blend = !!bed && !bed.raised && materialById.has(bed.catalogId) &&
    tops.every((z, i) => z === bed || atGrade(border[i])) &&
    fourFallBorderPoints(f, spec, LEVEL_REACH).every((p) => {
      const z = zoneAt(p);
      return (z?.kind === 'bed' && !z.raised) || atGrade(p);
    });
  return { mulch, bed, blend, y };
}

/** True when two waterfalls' soil rectangles, each grown by `pad` meters, overlap (turned rectangles, separating axes). */
export function fourFallCutsOverlap(a: GroundCut, b: GroundCut, pad: number): boolean {
  const axes: [number, number][] = [[a.cos, -a.sin], [a.sin, a.cos], [b.cos, -b.sin], [b.sin, b.cos]];
  const half = (c: GroundCut, [ux, uy]: [number, number]) => (c.hx + pad) * Math.abs(c.cos * ux - c.sin * uy) + (c.hz + pad) * Math.abs(c.sin * ux + c.cos * uy);
  for (const ax of axes) {
    const dist = Math.abs((b.cx - a.cx) * ax[0] + (b.cy - a.cy) * ax[1]);
    if (dist > half(a, ax) + half(b, ax)) return false;
  }
  return true;
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
/**
 * How far, meters, the cut of a waterfall set in a bed stays inside its soil rectangle on every side: the site ground
 * (9 mm above the soil's border there) overlaps the border by this much, so from low inside the soil no sky shows in
 * the gap between the border and the site ground's edge. The overlapped strip is the bed's own color anyway.
 */
export const BED_CUT_OVERLAP = 0.04;

/**
 * One waterfall's cut, a turned rectangle in plan meters: 'inset' (no blend: its soil's edges are tucked under grade, so
 * the cut stays SOIL_MARGIN inside and CUT_FRONT past the rockwork), 'bed' (blend: the soil rectangle less
 * BED_CUT_OVERLAP on every side) or 'exact' (the whole soil rectangle).
 */
export function fourFallCut(f: FeaturePlacement, spec: FeatureSpec, mode: 'inset' | 'bed' | 'exact'): GroundCut {
  const fr = fourFallFrame(f, spec), s = soilRect(fr.p), inset = mode === 'inset', m = inset ? SOIL_MARGIN : 0;
  const x0 = (s.x0 + m) * FT, x1 = (s.x1 - m) * FT;
  const z0 = fr.outline[1] / 2 + (s.z0 + m) * FT, z1 = fr.outline[1] / 2 + (inset ? CUT_FRONT : s.z1) * FT;
  // Center of the cut in the feature's local frame, then in plan space.
  const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
  const cx = f.position[0] + lx * Math.cos(fr.a) + lz * Math.sin(fr.a), cy = f.position[1] - lx * Math.sin(fr.a) + lz * Math.cos(fr.a);
  const lap = mode === 'bed' ? BED_CUT_OVERLAP : 0;
  return { cx, cy, cos: Math.cos(fr.a), sin: Math.sin(fr.a), hx: (x1 - x0) / 2 - lap, hz: (z1 - z0) / 2 - lap };
}

/** The site ground's (and the beds' loose stones' and humus') cut for each waterfall, by its bed choice (the ground model's fourFalls). */
export function fourFallGroundCuts(features: FeaturePlacement[], choices: Map<string, FourFallBedChoice>): GroundCut[] {
  const out: GroundCut[] = [];
  for (const f of features) {
    const spec = featureById.get(f.catalogId);
    if (spec?.kind !== 'fourFall') continue;
    out.push(fourFallCut(f, spec, choices.get(f.id)?.blend ? 'bed' : 'inset'));
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

/**
 * The mound's soil cover matched to the bed the waterfall stands in (`bed`, a bed look's id), so it reads as the same
 * fill: black humus, compost or dirt as their crumbs' darkest and lightest soil tones, finer than bark; bark mulch as
 * its own palette. Any other bed (rock, gravel) or none keeps the module's own shredded bark.
 */
export function fourFallMulch(bed: string | undefined): { dark: [number, number, number]; light: [number, number, number]; grain: number } | null {
  const m = bed ? materialById.get(bed) : undefined;
  if (!m) return null;
  const lin = (hex: string): [number, number, number] => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  const lum = (hex: string) => {
    const c = new THREE.Color(hex);
    return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  };
  const span = (hexes: string[]) => {
    const s = [...hexes].sort((a, b) => lum(a) - lum(b));
    return { dark: lin(s[0]), light: lin(s[s.length - 1]) };
  };
  if (m.crumb) return { ...span(m.crumb.soil.map((x) => x.c)), grain: 1.7 };
  if (m.recipe === 'mulch' && m.palette.length) return { ...span(m.palette), grain: 1 };
  return null;
}

/**
 * `ground`: the yard's ground height at a point of the feature's local frame (meters), relative to the placement's.
 * `mulch`: the bed look the waterfall stands in, for its soil cover (fourFallMulch).
 * `bedGround`: the look of the bed its soil border fades into (setGround), or null to keep its edges tucked under grade.
 */
export function buildFourFall(f: FeaturePlacement, spec: FeatureSpec, quality: Quality, ground: (x: number, z: number) => number, mulch?: string, bedGround: WaterfallGround | null = null): FourFallBuilt {
  const frame = fourFallFrame(f, spec), { p } = frame;
  const opts = { unit: FT, width: p.width ?? FOUR_FALL_WIDTH, topFall: p.topFall ?? null, height: p.height, lowest: p.lowest, level: p.level, refraction: fourFallRefraction(quality), plants: false, lights: 'data' as const, detail: fourFallDetail(quality), mulch: fourFallMulch(mulch), ground: bedGround };
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
