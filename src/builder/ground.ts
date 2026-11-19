import * as THREE from 'three';
import { featureById, materialById } from '../siteplan/catalog';
import { bounds, distToPolyline, fallProfile, projectOnPolyline, type Bounds } from '../siteplan/geometry';
import { PolygonIndex, PolygonSet, inBounds } from '../siteplan/spatial';
import type { SitePlan, Vec2, Zone } from '../siteplan/types';
import type { MaterialSpec } from '../siteplan/catalog';
import type { PBRSet } from '../engine/textures';
import { materialAverage, materialTextures, soilTextures } from '../engine/surfaces';
import { vnoise } from '../engine/noise';
import { CURB, ROAD, SIDEWALK, streetCoords, streetFrame } from './context';
import type { PoolLayout } from './pools';
import type { Quality } from '../engine/post';
import { LEVEL_REACH, bedZoneAt, fourFallBedChoice, fourFallCut, fourFallCutsOverlap, fourFallGroundCuts, type FourFallBedChoice, type GroundCut } from './fourfall';

/**
 * Terrain for the property and its surroundings, plus the ground surface
 * shader that paints lawn, mulch, decomposed granite and rock from the plan.
 */

export const WATER_LEVEL = -0.07;

export interface GroundModel {
  /** Site bounds plus margin, in plan coordinates. */
  area: Bounds;
  height(p: Vec2): number;
  /** The same, with pools left undug: the ground mesh stays level there and is opened over each pool instead. */
  grade(p: Vec2): number;
  /** The zone on top at a point (later zones win), or null. */
  zoneAt(p: Vec2): Zone | null;
  inWater(p: Vec2, pad?: number): boolean;
  /** Each four-fall waterfall's bed, by feature id (fourfall.ts fourFallBedChoice): decided here once, read by every part. */
  fourFalls: Map<string, FourFallBedChoice>;
}

/** Texture units a fragment shader may use on this GPU; the Studio sets it from the renderer (WebGL's minimum is 16). */
let maxTextureUnits = 16;
export function setGroundTextureUnits(n: number) {
  if (Number.isFinite(n) && n >= 16) maxTextureUnits = Math.floor(n);
}

/** Ground surfaces painted by the splat shader: soil plus up to 8 materials. */
export const MAX_GROUND_LAYERS = 8;

export function groundLayers(plan: SitePlan): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id) && ids.length < MAX_GROUND_LAYERS) ids.push(id);
  };
  for (const z of plan.zones) if (z.kind !== 'hardscape' && materialById.has(z.catalogId)) add(z.catalogId);
  if (plan.water.some((w) => w.kind === 'pond' || w.kind === 'stream' || w.kind === 'pondless')) add('river-rock');
  return ids;
}

function layerIndex(layers: string[], id: string): number {
  const i = layers.indexOf(id);
  return i < 0 ? 0 : i + 1;
}

export function groundModel(plan: SitePlan): GroundModel {
  const b = bounds(plan.site.boundary);
  const area = { minX: b.minX - 4, minY: b.minY - 4, maxX: b.maxX + 4, maxY: b.maxY + 4 };
  const water = plan.water;
  const beds = plan.zones.filter((z) => z.kind === 'bed');
  const street = streetFrame(plan);
  const streetW = SIDEWALK * 2 + CURB * 2 + ROAD;

  // Spatial lookups: every ground vertex asks which zone it is in and how far it is from edges.
  const zoneSet = new PolygonSet(plan.zones.map((z) => z.polygon));
  const zoneAt = (p: Vec2): Zone | null => {
    const i = zoneSet.lastContaining(p[0], p[1]);
    return i < 0 ? null : plan.zones[i];
  };
  // A four-fall waterfall blended into its bed meets the bed's ground flush along the edge of its soil (fourfall.ts):
  // the bed's mound is levelled to the waterfall's own grade there (`levels`, filled in below once terrain exists).
  const levels: (GroundCut & { y: number })[] = [];
  const fourFalls = new Map<string, FourFallBedChoice>();
  let levelOn = false;
  const siteIdx = new PolygonIndex(plan.site.boundary);
  const bedIdx = new Map(beds.map((z) => [z, zoneSet.items[plan.zones.indexOf(z)]]));
  // Water, each with the box beyond which it has no effect on the ground or on inWater.
  const waterIdx = water.map((w) => {
    const poly = w.polygon && w.polygon.length >= 3 ? new PolygonIndex(w.polygon) : null;
    const half = (w.width ?? 0.8) / 2;
    const run = w.points && w.points.length ? bounds(w.points) : null;
    const prof = (w.kind === 'stream' || w.kind === 'pondless') && w.points ? fallProfile(w, WATER_LEVEL) : null;
    const reach = Math.max(half + 1.6, 1.8);
    return { w, poly, half, run, prof, reach };
  });

  const inWater = (p: Vec2, pad = 0) => {
    for (const { w, poly, half, run } of waterIdx) {
      if (poly && inBounds(poly.box, p[0], p[1], pad) && (poly.contains(p[0], p[1]) || (pad > 0 && poly.dist(p[0], p[1], pad) < pad))) return true;
      if (w.points && run && inBounds(run, p[0], p[1], half + pad) && distToPolyline(p, w.points) < half + pad) return true;
    }
    return false;
  };

  const terrain = (p: Vec2, dig: boolean): number => {
    let h = 0;
    // Gentle relief outside the property.
    const outside = !siteIdx.contains(p[0], p[1]);
    if (outside) {
      const d = siteIdx.dist(p[0], p[1]);
      let k = Math.min(1, Math.max(0, (d - 5) / 15));
      if (street) {
        const c = streetCoords(street, p);
        if (c.across > -0.3 && c.across < streetW + 0.3) return c.across > SIDEWALK && c.across < SIDEWALK + 2 * CURB + ROAD ? -0.26 : -0.03;
        // Keep the ground flat near the street.
        if (c.across > -3 && c.across < streetW + 3) k *= 0.2;
      }
      h += (vnoise(p[0] * 0.08, p[1] * 0.08, 1e6, 3) - 0.5) * 0.5 * k;
    } else {
      // Planting beds are mounded slightly; raised planters are filled near the top.
      const top = zoneAt(p);
      if (top && top.kind === 'bed') {
        if (top.raised) h = Math.max(h, top.raised.height - 0.07);
        else {
          // The mound levels off 1.2 m in, so edges farther than that need not be found.
          const d = Math.min(1.2, bedIdx.get(top)!.dist(p[0], p[1], 1.2));
          const spec = materialById.get(top.catalogId);
          if (spec?.crumb) {
            // Spread humus: crowned a little, rising quickly off the edging where it settles, then soft rake lumps.
            const t = Math.min(1, d / 0.55);
            const lump = (vnoise(p[0] * 2.6, p[1] * 2.6, 1e6, 41) - 0.5) * 0.014 + (vnoise(p[0] * 6.5, p[1] * 6.5, 1e6, 42) - 0.5) * 0.006;
            h = Math.max(h, spec.crumb.mound * (t * (2 - t)) * (0.75 + 0.25 * Math.min(1, d / 1.2)) + lump * t);
          } else {
            const k = spec?.recipe === 'mulch' ? 0.07 : 0.025;
            h = Math.max(h, k * (d / 1.2));
          }
          if (levels.length) h = levelled(h, p);
        }
      }
    }
    for (const { w, poly, half, run, prof: wprof, reach } of waterIdx) {
      if (w.kind === 'pond' && poly && poly.contains(p[0], p[1])) {
        const d = Math.min(1.3, poly.dist(p[0], p[1], 1.3));
        h = Math.min(h, WATER_LEVEL - 0.04 - w.depth * Math.pow(d / 1.3, 0.8));
      } else if (w.kind === 'pool' && poly && poly.contains(p[0], p[1])) {
        if (dig) h = Math.min(h, -w.depth - 0.15);
      } else if ((w.kind === 'stream' || w.kind === 'pondless') && w.points && run && wprof && inBounds(run, p[0], p[1], reach)) {
        const pr = projectOnPolyline(p, w.points);
        const prof = wprof;
        const lvl = prof.level(pr.t);
        // A planted berm carries the raised run; it fades out 1.6 m from the bank.
        const bank = Math.max(0, lvl + 0.08);
        const k = Math.min(1, Math.max(0, (pr.d - half) / 1.6));
        if (pr.d < half + 1.6) h = Math.max(h, bank * (1 - k * k * (3 - 2 * k)));
        // Head of the run: a rock mound the first fall spills from.
        const dh = Math.hypot(p[0] - w.points[0][0], p[1] - w.points[0][1]);
        if (dh < 1.8) h = Math.max(h, (prof.top + 0.3) * Math.pow(1 - dh / 1.8, 0.7));
        if (pr.d < half && (w.kind === 'stream' || pr.t < prof.end)) {
          const t = 1 - pr.d / half;
          h = lvl - 0.03 - w.depth * Math.sqrt(t);
        } else if (w.kind === 'pondless' && pr.t >= prof.end && pr.d < half + 0.4) {
          // Gravel basin at the bottom: water disappears into rock.
          h = Math.min(h, -0.02);
        }
      }
    }
    return h;
  };

  // Level the bed to each waterfall's grade on its soil and 0.25 m past it (more than a ground grid cell, so the ground
  // mesh is exactly level where it is cut), then back to the bed's own height over the next 0.6 m.
  function levelled(h: number, p: Vec2): number {
    if (!levelOn) return h;
    for (const a of levels) {
      const dx = p[0] - a.cx, dy = p[1] - a.cy;
      const lx = Math.abs(dx * a.cos - dy * a.sin) - a.hx, lz = Math.abs(dx * a.sin + dy * a.cos) - a.hz;
      if (lx > LEVEL_REACH || lz > LEVEL_REACH) continue;
      const out = Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
      const t = Math.min(1, Math.max(0, (out - 0.25) / (LEVEL_REACH - 0.25)));
      h = a.y + (h - a.y) * t * t * (3 - 2 * t);
    }
    return h;
  }
  // Each waterfall's bed, and the grade it is set at: the ground's own height at its front middle, where the module stands.
  const bedAt = bedZoneAt(plan.zones);
  const blended: { id: string; cut: GroundCut; y: number }[] = [];
  for (const f of plan.features) {
    const spec = featureById.get(f.catalogId);
    if (spec?.kind !== 'fourFall') continue;
    const choice = fourFallBedChoice(f, spec, bedAt, zoneAt, (p) => terrain(p, false));
    fourFalls.set(f.id, choice);
    if (choice.blend) blended.push({ id: f.id, cut: fourFallCut(f, spec, 'exact'), y: choice.y });
  }
  // Two blended waterfalls within each other's levelling reach, set at different grades, would each level the other's
  // ground: both keep their edges tucked instead.
  for (let i = 0; i < blended.length; i++) {
    for (let j = i + 1; j < blended.length; j++) {
      const a = blended[i], b = blended[j];
      if (Math.abs(a.y - b.y) >= 0.01 && fourFallCutsOverlap(a.cut, b.cut, LEVEL_REACH)) {
        fourFalls.get(a.id)!.blend = false;
        fourFalls.get(b.id)!.blend = false;
      }
    }
  }
  for (const b of blended) if (fourFalls.get(b.id)!.blend) levels.push({ ...b.cut, y: b.y });
  levelOn = true;

  return { area, height: (p) => terrain(p, true), grade: (p) => terrain(p, false), zoneAt, inWater, fourFalls };
}

/* ------------------------------------------------------------------ */
/* Splat map                                                            */
/* ------------------------------------------------------------------ */

function rasterPolygon(buf: Uint8Array, W: number, Hh: number, poly: Vec2[], toPx: (p: Vec2) => [number, number], value: number) {
  const pts = poly.map(toPx);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(Hh - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, c) => a - c);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), c = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      buf.fill(value, y * W + a, y * W + c + 1);
    }
  }
}

function splatTextures(plan: SitePlan, area: Bounds, ppm: number, layers: string[]): THREE.DataTexture[] {
  const W = Math.min(2048, Math.ceil((area.maxX - area.minX) * ppm));
  const Hh = Math.min(2048, Math.ceil((area.maxY - area.minY) * ppm));
  const sx = W / (area.maxX - area.minX), sy = Hh / (area.maxY - area.minY);
  const toPx = (p: Vec2): [number, number] => [(p[0] - area.minX) * sx, (p[1] - area.minY) * sy];
  const idx = new Uint8Array(W * Hh);
  for (const z of plan.zones) {
    const layer = z.kind === 'hardscape' ? 0 : layerIndex(layers, z.catalogId);
    rasterPolygon(idx, W, Hh, z.polygon, toPx, layer);
  }
  const rock = layerIndex(layers, 'river-rock');
  for (const w of plan.water) {
    if (w.kind === 'pond' && w.polygon) rasterPolygon(idx, W, Hh, w.polygon, toPx, rock);
    if ((w.kind === 'stream' || w.kind === 'pondless') && w.points) {
      const half = (w.width ?? 0.8) / 2 + (w.kind === 'pondless' ? 0.6 : 0.22);
      for (let i = 0; i < w.points.length - 1; i++) {
        const a = w.points[i], c = w.points[i + 1];
        const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * half, ny = (dx / l) * half;
        rasterPolygon(idx, W, Hh, [[a[0] + nx, a[1] + ny], [c[0] + nx, c[1] + ny], [c[0] - nx, c[1] - ny], [a[0] - nx, a[1] - ny]], toPx, rock);
        for (const q of [a, c]) {
          const circ: Vec2[] = [];
          for (let k = 0; k < 14; k++) circ.push([q[0] + Math.cos((k / 14) * 6.283) * half, q[1] + Math.sin((k / 14) * 6.283) * half]);
          rasterPolygon(idx, W, Hh, circ, toPx, rock);
        }
      }
    }
  }
  // Weights with a 3x3 box filter for soft, anti-aliased edges.
  const A = new Uint8Array(W * Hh * 4), B = new Uint8Array(W * Hh * 4);
  const acc = new Float32Array(MAX_GROUND_LAYERS + 1);
  for (let y = 0; y < Hh; y++) {
    const r0 = Math.max(0, y - 1) * W, r1 = y * W, r2 = Math.min(Hh - 1, y + 1) * W;
    for (let x = 0; x < W; x++) {
      // Most texels sit inside one area: all nine neighbors the same layer, so that layer's weight is full.
      if (x > 0 && x < W - 1) {
        const l = idx[r1 + x];
        if (
          idx[r1 + x - 1] === l && idx[r1 + x + 1] === l &&
          idx[r0 + x - 1] === l && idx[r0 + x] === l && idx[r0 + x + 1] === l &&
          idx[r2 + x - 1] === l && idx[r2 + x] === l && idx[r2 + x + 1] === l
        ) {
          if (l >= 1 && l <= 4) A[(r1 + x) * 4 + l - 1] = 255;
          else if (l >= 5 && l <= 8) B[(r1 + x) * 4 + l - 5] = 255;
          continue;
        }
      }
      acc.fill(0);
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(Hh - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(W - 1, Math.max(0, x + i));
          acc[idx[yy * W + xx]]++;
        }
      }
      const o = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) {
        A[o + k] = (acc[k + 1] / 9) * 255;
        B[o + k] = (acc[k + 5] / 9) * 255;
      }
    }
  }
  return [A, B].map((data) => {
    const t = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  });
}

/* ------------------------------------------------------------------ */
/* Ground meshes                                                        */
/* ------------------------------------------------------------------ */

/** A grid mesh over `area`; it pauses (yields) every few rows so a sliced build can let frames through. */
function* gridGeometry(area: Bounds, step: number, height: (p: Vec2) => number, hole?: Bounds): Generator<string, THREE.BufferGeometry, void> {
  const nx = Math.ceil((area.maxX - area.minX) / step), ny = Math.ceil((area.maxY - area.minY) / step);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uv = new Float32Array((nx + 1) * (ny + 1) * 2);
  const p: Vec2 = [0, 0];
  for (let j = 0, v = 0; j <= ny; j++) {
    if (j % 16 === 15) yield 'ground grid';
    for (let i = 0; i <= nx; i++, v++) {
      const x = area.minX + ((area.maxX - area.minX) * i) / nx;
      const z = area.minY + ((area.maxY - area.minY) * j) / ny;
      p[0] = x;
      p[1] = z;
      pos[v * 3] = x;
      pos[v * 3 + 1] = height(p);
      pos[v * 3 + 2] = z;
      // World-space UVs keep the normal-map tangent frame aligned with x and z.
      uv[v * 2] = x;
      uv[v * 2 + 1] = z;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (hole) {
        // Leave out only cells that sit fully inside the hole. Cells that straddle its
        // edge stay, so no gap opens between this mesh and the one that fills the hole.
        const x0 = area.minX + ((area.maxX - area.minX) * i) / nx, x1 = area.minX + ((area.maxX - area.minX) * (i + 1)) / nx;
        const z0 = area.minY + ((area.maxY - area.minY) * j) / ny, z1 = area.minY + ((area.maxY - area.minY) * (j + 1)) / ny;
        if (x0 >= hole.minX && x1 <= hole.maxX && z0 >= hole.minY && z1 <= hole.maxY) continue;
      }
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.grid = { nx, ny };
  return g;
}

/**
 * Ray hits on a grid mesh from gridGeometry, walking only the cells under the ray (in order,
 * so the first cell with a hit holds the nearest one) instead of testing every triangle.
 * Autofocus and picking cast a ray at the ground several times a second.
 */
function gridRaycast(mesh: THREE.Mesh, area: Bounds, nx: number, ny: number) {
  const ray = new THREE.Ray(), inv = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), hit = new THREE.Vector3();
  const sx = (area.maxX - area.minX) / nx, sz = (area.maxY - area.minY) / ny;
  mesh.raycast = (raycaster, intersects) => {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    inv.copy(mesh.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inv);
    const o = ray.origin, dir = ray.direction;
    // Where the ray's ground track enters and leaves the grid.
    let t0 = 0, t1 = Infinity;
    for (const [oo, dd, lo, hi] of [[o.x, dir.x, area.minX, area.maxX], [o.z, dir.z, area.minY, area.maxY]]) {
      if (Math.abs(dd) < 1e-12) {
        if (oo < lo || oo > hi) return;
      } else {
        const ta = (lo - oo) / dd, tb = (hi - oo) / dd;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
    }
    if (t0 > t1) return;
    const vx = (i: number, j: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, j * (nx + 1) + i);
    const cellHit = (i: number, j: number): number => {
      vx(i, j, a);
      vx(i + 1, j, b);
      vx(i, j + 1, c);
      vx(i + 1, j + 1, d);
      let best = Infinity;
      if (ray.intersectTriangle(a, c, b, false, hit)) best = Math.min(best, hit.distanceTo(o));
      if (ray.intersectTriangle(b, c, d, false, hit)) best = Math.min(best, hit.distanceTo(o));
      return best;
    };
    // Step through the cells under the ray (Amanatides and Woo).
    const ex = o.x + dir.x * t0, ez = o.z + dir.z * t0;
    let i = Math.max(0, Math.min(nx - 1, Math.floor((ex - area.minX) / sx)));
    let j = Math.max(0, Math.min(ny - 1, Math.floor((ez - area.minY) / sz)));
    const stepI = dir.x > 0 ? 1 : -1, stepJ = dir.z > 0 ? 1 : -1;
    const dtx = Math.abs(dir.x) > 1e-12 ? sx / Math.abs(dir.x) : Infinity, dtz = Math.abs(dir.z) > 1e-12 ? sz / Math.abs(dir.z) : Infinity;
    let tx = Math.abs(dir.x) > 1e-12 ? (area.minX + (i + (stepI > 0 ? 1 : 0)) * sx - o.x) / dir.x : Infinity;
    let tz = Math.abs(dir.z) > 1e-12 ? (area.minY + (j + (stepJ > 0 ? 1 : 0)) * sz - o.z) / dir.z : Infinity;
    for (let guard = 0; guard < nx + ny + 2; guard++) {
      const dist = cellHit(i, j);
      if (dist < Infinity) {
        // Distances are along the local ray; the mesh is only translated, so they hold in world space too.
        const point = ray.at(dist, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        const dw = raycaster.ray.origin.distanceTo(point);
        if (dw >= raycaster.near && dw <= raycaster.far) intersects.push({ distance: dw, point, object: mesh });
        return;
      }
      if (Math.min(tx, tz) > t1) return;
      if (tx < tz) {
        i += stepI;
        tx += dtx;
      } else {
        j += stepJ;
        tz += dtz;
      }
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
    }
  };
}

/**
 * Build-stage controls for the ground, shared with the shader: `uSoil` 1 paints bare soil everywhere (the plan's
 * surfaces are not in yet), and `uCut` opens the ground over the dug-out areas. `uCut` is an encoded distance map
 * (0.5 on the outline, below it inside): R holds the excavations alone, G the excavations and trenches. `uCutCh`
 * picks the channel ((1, 0), (0, 1), or (0, 0) for none); `uCutBox` is the map's place in plan space.
 */
export interface GroundStageUniforms {
  uSoil: { value: number };
  uCut: { value: THREE.Texture | null };
  uCutBox: { value: THREE.Vector4 };
  uCutCh: { value: THREE.Vector2 };
}

const stageUniforms = (): GroundStageUniforms => ({
  uSoil: { value: 0 },
  uCut: { value: null },
  uCutBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uCutCh: { value: new THREE.Vector2(0, 0) },
});

/** The ground's specular intensity (its sky reflection, toned down from a standard material's 1). */
export const GROUND_SPECULAR = 0.45;

/** Roughness of the bare soil layer of the ground shader. */
const SOIL_ROUGHNESS = 0.97;

/** The roughness the ground shader gives a material's layer. */
export function groundRoughness(spec: MaterialSpec): number {
  const r = spec.recipe;
  // Loose stone drawn stone by stone (spec.pebble): its ground is the bed seen from afar, satin like the stones.
  if (spec.pebble) return 0.92;
  // Black humus: soft, damp-dark soil, the most matte surface in the yard.
  if (spec.crumb) return 0.99;
  return r === 'blackPebble' ? 0.55 : r === 'riverRock' || r === 'cobble' ? 0.7 : r === 'turfArtificial' ? 0.8 : 0.93;
}

/**
 * How a material reads on the ground from a few feet away: its painted texture's average albedo (linear) and the
 * roughness its ground layer is drawn with. A four-fall waterfall fades the edge of its soil into this (fourfall.ts).
 */
export function groundLook(spec: MaterialSpec): { color: THREE.Color; roughness: number } {
  const avg = materialAverage(spec);
  let color: THREE.Color;
  if (avg) color = new THREE.Color(avg.color[0], avg.color[1], avg.color[2]);
  else {
    // A recipe that paints nothing: the palette's average, taken in linear light.
    color = new THREE.Color(0, 0, 0);
    for (const hex of spec.palette) color.add(new THREE.Color(hex));
    color.multiplyScalar(1 / Math.max(1, spec.palette.length));
  }
  return { color, roughness: groundRoughness(spec) };
}

/** Ground material: a splat blend of soil plus the plan's surfaces, in world space. */
function splatMaterial(layerIds: string[], area: Bounds, splats: THREE.DataTexture[], pools: PoolLayout, stage: GroundStageUniforms, cuts: GroundCut[] = []): THREE.MeshPhysicalMaterial {
  const soil = soilTextures();
  const sets: PBRSet[] = [soil, ...layerIds.map((id) => materialTextures(materialById.get(id)!))];
  const roughK = [SOIL_ROUGHNESS, ...layerIds.map((id) => groundRoughness(materialById.get(id)!))];
  const n = sets.length;
  // Texture units: many GPUs (Apple's among them) have only WebGL's minimum of 16 per fragment shader. Besides the
  // layers the ground samples the first splat map, the dig-out map, the environment map and its lookup table, the
  // sun's shadow map, the second splat map (only with more than four materials) and a pool map (only with pools).
  // Every layer needs its color map; normal maps go to as many layers as still fit (soil and the first layers), the
  // rest shading flat. Without this, a yard with six or more ground materials failed to compile and lost its ground.
  const splatB = n - 1 > 4;
  const fixed = 5 + (splatB ? 1 : 0) + (pools.pools.length ? 1 : 0);
  const withNormal = Math.max(0, Math.min(n, maxTextureUnits - fixed - n));
  // Physical material so the ground's sky reflection can be toned down:
  // rough mulch and soil reflect far less than the default 4%.
  const mat = new THREE.MeshPhysicalMaterial({ map: soil.map, normalMap: soil.normalMap, roughness: 1, metalness: 0, specularIntensity: GROUND_SPECULAR });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uSplatA = { value: splats[0] };
    if (splatB) s.uniforms.uSplatB = { value: splats[1] };
    s.uniforms.uArea = { value: new THREE.Vector4(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY) };
    sets.forEach((l, i) => {
      s.uniforms[`uA${i}`] = { value: l.map };
      if (i < withNormal) s.uniforms[`uN${i}`] = { value: l.normalMap };
      s.uniforms[`uT${i}`] = { value: 1 / l.tileMeters };
    });
    Object.assign(s.uniforms, stage);
    if (cuts.length) {
      s.uniforms.uFfCut = { value: cuts.map((c) => new THREE.Vector4(c.cx, c.cy, c.cos, c.sin)) };
      s.uniforms.uFfExt = { value: cuts.map((c) => new THREE.Vector2(c.hx, c.hz)) };
    }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const decl = sets.map((_, i) => `uniform sampler2D uA${i};${i < withNormal ? ` uniform sampler2D uN${i};` : ''} uniform float uT${i};`).join('\n');
    const comps = ['a.r', 'a.g', 'a.b', 'a.a', 'b.r', 'b.g', 'b.b', 'b.a'];
    const w = (i: number) => (i === 0 ? 'g0' : `gw${i}`);
    const weights = Array.from({ length: n - 1 }, (_, i) => `float gw${i + 1} = ${comps[i]};`).join(' ');
    const sum = n > 1 ? Array.from({ length: n - 1 }, (_, i) => `gw${i + 1}`).join(' + ') : '0.0';
    const albedo = sets.map((_, i) => `texture2D(uA${i}, wp * uT${i}).rgb * ${w(i)}`).join(' + ');
    const normal = sets.map((_, i) => (i < withNormal ? `texture2D(uN${i}, wp * uT${i}).xyz * ${w(i)}` : `vec3(0.5, 0.5, 1.0) * ${w(i)}`)).join(' + ');
    const rough = sets.map((_, i) => `${roughK[i].toFixed(3)} * ${w(i)}`).join(' + ');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vGW;
         uniform sampler2D uSplatA;${splatB ? ' uniform sampler2D uSplatB;' : ''} uniform vec4 uArea;
         uniform float uSoil; uniform sampler2D uCut; uniform vec4 uCutBox; uniform vec2 uCutCh;
         ${cuts.length ? `uniform vec4 uFfCut[${cuts.length}]; uniform vec2 uFfExt[${cuts.length}];` : ''}
         ${decl}`,
      )
      .replace(
        '#include <map_fragment>',
        `${cuts.length ? `// A four-fall waterfall brings its own soil (builder/fourfall.ts): the site ground is not drawn under it.
         for (int i = 0; i < ${cuts.length}; i++) {
           vec2 fd = vGW.xz - uFfCut[i].xy;
           vec2 fl = vec2(fd.x * uFfCut[i].z - fd.y * uFfCut[i].w, fd.x * uFfCut[i].w + fd.y * uFfCut[i].z);
           if (abs(fl.x) < uFfExt[i].x && abs(fl.y) < uFfExt[i].y) discard;
         }` : ''}
         if (uCutCh.x + uCutCh.y > 0.5) {
           vec2 cuv = (vGW.xz - uCutBox.xy) / uCutBox.zw;
           if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0 && dot(texture2D(uCut, cuv).rg, uCutCh) < 0.5) discard;
         }
         vec2 suv = (vGW.xz - uArea.xy) / uArea.zw;
         float siteIn = step(0.0, suv.x) * step(0.0, suv.y) * step(suv.x, 1.0) * step(suv.y, 1.0);
         float inside = siteIn * (1.0 - uSoil);
         vec4 a = texture2D(uSplatA, suv) * inside;
         ${splatB ? 'vec4 b = texture2D(uSplatB, suv) * inside;' : ''}
         ${weights}
         float g0 = max(0.0, 1.0 - (${sum}));
         vec2 wp = vGW.xz;
         vec3 alb = ${albedo};
         float macro = texture2D(uA0, wp * 0.023).g;
         alb *= mix(1.0, 0.86 + macro * 0.3, g0);
         // Build stages: graded bare dirt, browner than the dry-grass soil around the yard.
         alb *= mix(vec3(1.0), vec3(1.12, 0.94, 0.76), uSoil * siteIn);
         diffuseColor.rgb *= alb;`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * (${rough});`)
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 nmap = (${normal}) * 2.0 - 1.0;
         nmap.xy *= normalScale;
         normal = normalize(tbn * nmap);`,
      );
    // The ground is opened along each pool's outline, so the pool's tiled shell shows.
    pools.patchGround(s);
  };
  mat.customProgramCacheKey = () => `ground-splat-stage-${layerIds.join(',')}${pools.pools.length ? '-pools' : ''}-n${withNormal}-ff${cuts.length}`;
  return mat;
}

export interface GroundBuild {
  object: THREE.Group;
  /** Surfaces for autofocus and camera collision. */
  surfaces: THREE.Mesh[];
  /** Height of the site ground mesh itself at a point (its triangles, not the terrain function), so pits meet it exactly. */
  surface(p: Vec2): number;
  /** Build-stage look: bare soil, and the ground opened over the pits (see GroundStageUniforms). */
  stage: GroundStageUniforms;
  dispose(): void;
}

/** Height on a grid mesh from gridGeometry, read from its own triangles. */
function gridSampler(g: THREE.BufferGeometry, area: Bounds): (p: Vec2) => number {
  const { nx, ny } = g.userData.grid as { nx: number; ny: number };
  const pos = (g.getAttribute('position') as THREE.BufferAttribute).array;
  const sx = (area.maxX - area.minX) / nx, sz = (area.maxY - area.minY) / ny;
  const h = (i: number, j: number) => pos[(j * (nx + 1) + i) * 3 + 1];
  return (p) => {
    const fx = (p[0] - area.minX) / sx, fz = (p[1] - area.minY) / sz;
    const i = Math.max(0, Math.min(nx - 1, Math.floor(fx))), j = Math.max(0, Math.min(ny - 1, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    // Cells are split along the b-c diagonal: triangles (a, c, b) and (b, c, d).
    if (u + v <= 1) {
      const a = h(i, j);
      return a + (h(i + 1, j) - a) * u + (h(i, j + 1) - a) * v;
    }
    const d = h(i + 1, j + 1);
    return d + (h(i, j + 1) - d) * (1 - u) + (h(i + 1, j) - d) * (1 - v);
  };
}

export function buildGround(plan: SitePlan, gm: GroundModel, quality: Quality, pools: PoolLayout): GroundBuild {
  const steps = groundSteps(plan, gm, quality, pools);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** buildGround a piece at a time: each `yield` is a place a sliced build may pause. */
export function* groundSteps(plan: SitePlan, gm: GroundModel, quality: Quality, pools: PoolLayout): Generator<string, GroundBuild, void> {
  const group = new THREE.Group();
  group.name = 'ground';
  const area = gm.area;
  const layers = groundLayers(plan);
  const splats = splatTextures(plan, area, quality === 'draft' ? 30 : 60, layers);
  yield 'ground splats';
  const stage = stageUniforms();
  const mat = splatMaterial(layers, area, splats, pools, stage, fourFallGroundCuts(plan.features, gm.fourFalls));
  yield 'ground material';
  const step = quality === 'draft' ? 0.3 : 0.18;
  const site = new THREE.Mesh(yield* gridGeometry(area, step, gm.grade), mat);
  yield 'ground normals';
  site.receiveShadow = true;
  site.name = 'site-ground';
  gridRaycast(site, area, site.geometry.userData.grid.nx, site.geometry.userData.grid.ny);
  group.add(site);

  // Surroundings: coarser terrain that fades into the haze.
  const far = { minX: area.minX - 80, minY: area.minY - 80, maxX: area.maxX + 80, maxY: area.maxY + 80 };
  const surroundMat = mat; // Splat weights are zero outside, which leaves the soil and dry grass layer.
  const ring = new THREE.Mesh(yield* gridGeometry(far, 2.0, gm.grade, area), surroundMat);
  ring.receiveShadow = true;
  ring.name = 'surround-ground';
  // The ring tucks a few millimeters under the site ground where the two overlap.
  ring.position.y = -0.004;
  group.add(ring);
  const surface = gridSampler(site.geometry, area);
  yield 'ground sampler';

  return {
    object: group,
    surfaces: [site],
    surface,
    stage,
    dispose() {
      site.geometry.dispose();
      ring.geometry.dispose();
      mat.dispose();
      splats.forEach((t) => t.dispose());
    },
  };
}
