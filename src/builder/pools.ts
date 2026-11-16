import * as THREE from 'three';
import { bounds, signedArea, type Bounds } from '../siteplan/geometry';
import { PolygonIndex } from '../siteplan/spatial';
import type { SitePlan, Vec2, WaterFeature } from '../siteplan/types';
import { outsetPolygon, poolCoping, zoneTop } from './hardscape';

/**
 * Where each pool sits and what it cuts away. A pool takes its level from the
 * paving around it, and the paving and the ground are opened over it in the
 * shader from a distance map of the pool outlines, so a pool shows through
 * however its outline meets the paving's (inside it, on shared points and
 * edges, or across it).
 */

/** Half-width of the rim a pool without coping gets, in meters (the shell wall's outer half). */
const RIM = 0.03;
/** How far the paving runs in under the coping or rim before it is cut, in meters. */
const TUCK = 0.02;
/** Distances in the map are stored within plus or minus this many meters. */
const RANGE = 0.24;

export interface PoolPlace {
  water: WaterFeature;
  poly: Vec2[];
  /** Coping width in meters, 0 for none. */
  coping: number;
  /** Outline of the pool with its coping, or with its rim when it has none. */
  outer: Vec2[];
  /** Height of the paving the pool is set in: the elevation of a raised area, else 0. */
  lift: number;
  /** Top of the coping, or of the rim when there is none. */
  top: number;
  /** Water surface height. */
  level: number;
}

export interface PoolLayout {
  pools: PoolPlace[];
  byId: Map<string, PoolPlace>;
  /** True when a paving outline comes near a pool, so its meshes need the cut. */
  touches(poly: Vec2[]): boolean;
  /** True where paving is cut away for a pool. */
  cutAt(p: Vec2): boolean;
  /** The outlines the paving is cut along (just inside each pool's coping or rim). */
  cutLines: Vec2[][];
  /** A copy of a paving material that leaves out everything over a pool. */
  cutMaterial(mat: THREE.Material): THREE.Material;
  /** Shadow material to go with it, so cut-away paving casts no shadow on the water. */
  cutDepth: THREE.MeshDepthMaterial | null;
  /** Adds the pool opening to the ground shader (which carries world position in vGW). */
  patchGround(shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }): void;
  dispose(): void;
}

/** Signed distance to a polygon outline, negative inside; beyond `max` it is plus or minus Infinity. */
function signedDist(x: number, y: number, poly: PolygonIndex, max: number): number {
  const d = poly.dist(x, y, max);
  return poly.contains(x, y) ? -d : d;
}

/**
 * The level a pool is set at: the highest hardscape area that covers at least a
 * fifth of the pool, its coping and a 0.3 m band around them. `deck` is the top
 * of the paving at that level which reaches the pool.
 */
function poolLevel(plan: SitePlan, outer: Vec2[]): { lift: number; deck: number } {
  const band = 0.3;
  const b = bounds(outer);
  const step = Math.max(0.08, Math.sqrt(Math.abs(signedArea(outer))) / 24);
  const pts: Vec2[] = [];
  const oi = new PolygonIndex(outer);
  for (let y = b.minY - band + step / 2; y < b.maxY + band; y += step) {
    for (let x = b.minX - band + step / 2; x < b.maxX + band; x += step) {
      if (oi.contains(x, y) || oi.dist(x, y, band) < band) pts.push([x, y]);
    }
  }
  const pb = bounds(pts.length ? pts : outer);
  const share: number[] = plan.zones.map((z) => {
    if (z.kind !== 'hardscape' || !pts.length) return 0;
    const zi = new PolygonIndex(z.polygon);
    const zb = zi.box;
    if (zb.maxX < pb.minX || zb.minX > pb.maxX || zb.maxY < pb.minY || zb.minY > pb.maxY) return 0;
    let n = 0;
    for (const p of pts) if (zi.contains(p[0], p[1])) n++;
    return n / pts.length;
  });
  let lift = 0, deck = 0;
  plan.zones.forEach((z, i) => {
    if (share[i] >= 0.2) lift = Math.max(lift, z.elevation ?? 0);
  });
  plan.zones.forEach((z, i) => {
    if (share[i] > 0.01 && (z.elevation ?? 0) <= lift + 0.005) deck = Math.max(deck, zoneTop(z, i));
  });
  return { lift, deck };
}

export function poolLayout(plan: SitePlan, waterLevel: number): PoolLayout {
  const pools: PoolPlace[] = [];
  plan.water.forEach((w) => {
    if (w.kind !== 'pool' || !w.polygon || w.polygon.length < 3) return;
    const coping = poolCoping(w) > 0.02 ? poolCoping(w) : 0;
    const outer = outsetPolygon(w.polygon, coping || RIM);
    const { lift, deck } = poolLevel(plan, outer);
    // Coping stands a little proud of the paving; a bare rim sits flush with it. Each pool is a
    // hair higher than the one before, so copings that overlap do not flicker.
    const top = (coping ? Math.max(lift + 0.085, deck + 0.015) : Math.max(lift + 0.02, deck + 0.004)) + pools.length * 0.0015;
    pools.push({ water: w, poly: w.polygon, coping, outer, lift, top, level: lift + waterLevel - 0.03 });
  });
  const byId = new Map(pools.map((p) => [p.water.id, p]));
  const outerIdx = pools.map((pl) => new PolygonIndex(pl.outer));
  const cutAt = (p: Vec2) => outerIdx.some((o) => o.contains(p[0], p[1]) && o.dist(p[0], p[1], TUCK) > TUCK);

  if (!pools.length) {
    return { pools, byId, touches: () => false, cutAt, cutLines: [], cutMaterial: (m) => m, cutDepth: null, patchGround() {}, dispose() {} };
  }

  // Distance map in plan space. R: distance to the pool-with-coping outlines (cuts the paving).
  // G: distance to the pool outlines themselves (opens the ground). 0.5 is on the outline.
  const all = bounds(pools.flatMap((p) => p.outer));
  const pad = RANGE + 0.1;
  const area: Bounds = { minX: all.minX - pad, minY: all.minY - pad, maxX: all.maxX + pad, maxY: all.maxY + pad };
  const texel = Math.max(0.02, Math.max(area.maxX - area.minX, area.maxY - area.minY) / 1536);
  const W = Math.ceil((area.maxX - area.minX) / texel), H = Math.ceil((area.maxY - area.minY) / texel);
  area.maxX = area.minX + W * texel;
  area.maxY = area.minY + H * texel;
  const data = new Uint8Array(W * H * 2).fill(255);
  const enc = (d: number) => Math.round((Math.max(-1, Math.min(1, d / RANGE)) * 0.5 + 0.5) * 255);
  pools.forEach((pl, k) => {
    const outerI = outerIdx[k], polyI = new PolygonIndex(pl.poly);
    const b = outerI.box;
    const i0 = Math.max(0, Math.floor((b.minX - RANGE - area.minX) / texel)), i1 = Math.min(W - 1, Math.ceil((b.maxX + RANGE - area.minX) / texel));
    const j0 = Math.max(0, Math.floor((b.minY - RANGE - area.minY) / texel)), j1 = Math.min(H - 1, Math.ceil((b.maxY + RANGE - area.minY) / texel));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = area.minX + (i + 0.5) * texel, y = area.minY + (j + 0.5) * texel;
        const o = (j * W + i) * 2;
        // Stored distances stop at RANGE, so edges farther away are not searched for.
        data[o] = Math.min(data[o], enc(signedDist(x, y, outerI, RANGE)));
        data[o + 1] = Math.min(data[o + 1], enc(signedDist(x, y, polyI, RANGE)));
      }
    }
  });
  const map = new THREE.DataTexture(data, W, H, THREE.RGFormat);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  const uniforms = {
    uPoolMap: { value: map },
    uPoolRect: { value: new THREE.Vector4(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY) },
  };
  // Meters from the outline at a plan point, read from one channel of the map.
  const dist = (xz: string, ch: 'r' | 'g') => `((texture2D(uPoolMap, (${xz} - uPoolRect.xy) / uPoolRect.zw).${ch} - 0.5) * ${(RANGE * 2).toFixed(3)})`;

  const patch = (m: THREE.Material) => {
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPoolXZ;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPoolXZ;\nuniform sampler2D uPoolMap; uniform vec4 uPoolRect;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (${dist('vPoolXZ', 'r')} < ${(-TUCK).toFixed(3)}) discard;`);
    };
    m.customProgramCacheKey = () => 'pool-cut';
    return m;
  };
  const copies = new Map<THREE.Material, THREE.Material>();
  const cutDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })) as THREE.MeshDepthMaterial;

  return {
    pools,
    byId,
    touches(poly) {
      const b = bounds(poly);
      return b.maxX > area.minX && b.minX < area.maxX && b.maxY > area.minY && b.minY < area.maxY;
    },
    cutAt,
    cutLines: pools.map((p) => outsetPolygon(p.poly, (p.coping || RIM) - TUCK)),
    cutMaterial(mat) {
      let c = copies.get(mat);
      if (!c) {
        // The copy shares the original's textures; only the copy itself is disposed with the scene.
        c = patch(mat.clone());
        copies.set(mat, c);
      }
      return c;
    },
    cutDepth,
    patchGround(s) {
      Object.assign(s.uniforms, uniforms);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPoolMap; uniform vec4 uPoolRect;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (${dist('vGW.xz', 'g')} < 0.0) discard;`);
    },
    dispose() {
      map.dispose();
      cutDepth.dispose();
      for (const c of copies.values()) c.dispose();
    },
  };
}
