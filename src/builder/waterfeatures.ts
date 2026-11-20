import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { area, bounds, centroid, distToEdge, distToPolyline, fallProfile, pointInPolygon, polylineLength, projectOnPolyline, rng, samplePolyline } from '../siteplan/geometry';
import type { SitePlan, Vec2, WaterFeature } from '../siteplan/types';
import { PlanarMirror, WATER_LOOKS, fallMaterial, waterMaterial, type WaterLook } from '../engine/water';
import type { NightLight } from './features';
import { poolTile } from '../engine/textures';
import { WATER_LEVEL, type GroundModel } from './ground';
import { catalogMaterial, pbrMaterial, segmentBox } from './materials';
import type { Quality } from '../engine/post';
import { rockField, type RockSpot } from './rocks';
import { boxMapWorld, insetPolygon, outsetPolygon, slab } from './hardscape';
import type { PoolLayout } from './pools';

/** Ponds, streams, pools and fountains. */

export interface WaterBuild {
  object: THREE.Group;
  /** Water surfaces, hidden while the reflection renders. */
  surfaces: THREE.Mesh[];
  materials: THREE.ShaderMaterial[];
  /** Lights under the falls, on at dusk and night. */
  lights: NightLight[];
  /** Falling-water sheets, which glow when their lights are on. */
  fallMats: THREE.ShaderMaterial[];
  dispose(): void;
}

interface SkyUniforms {
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uNight: { value: number };
}

/** Grid mesh over a region with per-vertex shore distance, depth and flow. */
function surfaceGrid(
  inside: (p: Vec2) => boolean,
  b: { minX: number; minY: number; maxX: number; maxY: number },
  y: number | ((p: Vec2) => number),
  step: number,
  shore: (p: Vec2) => number,
  depth: (p: Vec2) => number,
  flow: (p: Vec2) => [number, number, number],
): THREE.BufferGeometry {
  const nx = Math.ceil((b.maxX - b.minX) / step) + 1, ny = Math.ceil((b.maxY - b.minY) / step) + 1;
  const pos: number[] = [], sh: number[] = [], dp: number[] = [], fl: number[] = [], idx: number[] = [];
  const map = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const vid = (i: number, j: number) => {
    const k = j * (nx + 1) + i;
    if (map[k] >= 0) return map[k];
    const p: Vec2 = [b.minX + i * step, b.minY + j * step];
    pos.push(p[0], typeof y === 'number' ? y : y(p), p[1]);
    sh.push(shore(p));
    dp.push(Math.max(0.01, depth(p)));
    fl.push(...flow(p));
    map[k] = pos.length / 3 - 1;
    return map[k];
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c: Vec2 = [b.minX + (i + 0.5) * step, b.minY + (j + 0.5) * step];
      if (!inside(c)) continue;
      const a = vid(i, j), bb = vid(i + 1, j), cc = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, cc, bb, bb, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShore', new THREE.Float32BufferAttribute(sh, 1));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dp, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * A water surface that follows an outline exactly: the polygon cut into triangles, which are then
 * split until no edge is longer than `maxEdge`, so depth that changes across the pool (a ledge)
 * is carried per vertex.
 */
function outlineSurface(poly: Vec2[], y: number, maxEdge: number, depth: (p: Vec2) => number): THREE.BufferGeometry {
  let tris: Vec2[][] = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []).map((f) => f.map((i) => poly[i]));
  const longest = (t: Vec2[]) => Math.max(...t.map((p, i) => Math.hypot(t[(i + 1) % 3][0] - p[0], t[(i + 1) % 3][1] - p[1])));
  for (let pass = 0; pass < 6 && tris.length < 20000 && tris.some((t) => longest(t) > maxEdge); pass++) {
    // Every triangle splits in four at its edge midpoints, so neighbors keep sharing whole edges.
    tris = tris.flatMap(([a, b, c]) => {
      const ab: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc: Vec2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca: Vec2 = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]];
    });
  }
  const pos: number[] = [], sh: number[] = [], dp: number[] = [], fl: number[] = [];
  for (const t of tris) {
    // Wind each triangle to face up.
    const up = (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) - (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) > 0;
    const c: Vec2 = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];
    for (const p of up ? t : [t[0], t[2], t[1]]) {
      pos.push(p[0], y, p[1]);
      sh.push(1);
      // Read depth a touch toward the triangle's middle, so a vertex on the ledge line takes its own side's depth.
      dp.push(Math.max(0.01, depth([p[0] + (c[0] - p[0]) * 0.05, p[1] + (c[1] - p[1]) * 0.05])));
      fl.push(0, 0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShore', new THREE.Float32BufferAttribute(sh, 1));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dp, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(fl, 3));
  g.computeBoundingSphere();
  return g;
}

function edgeRocks(poly: Vec2[], gm: GroundModel, seed: string, size: number, spacing: number): RockSpot[] {
  const out: RockSpot[] = [];
  const loop = [...poly, poly[0]];
  for (const s of samplePolyline(loop, spacing)) {
    const r = rng(`${seed}-${s.p[0].toFixed(2)}-${s.p[1].toFixed(2)}`);
    if (r() < 0.12) continue;
    // Nudge slightly outward so stones sit on the bank.
    const nx = -s.dir[1], ny = s.dir[0];
    const c = centroid(poly);
    const sign = (s.p[0] + nx - c[0]) ** 2 + (s.p[1] + ny - c[1]) ** 2 > (s.p[0] - c[0]) ** 2 + (s.p[1] - c[1]) ** 2 ? 1 : -1;
    const off = (r() - 0.3) * size * 0.6;
    const p: Vec2 = [s.p[0] + nx * sign * off, s.p[1] + ny * sign * off];
    const sz = size * (0.55 + r() * 0.8);
    out.push({ x: p[0], y: Math.max(gm.height(p), WATER_LEVEL - 0.05) - sz * 0.08, z: p[1], size: sz, rot: r() * 6.28, seed: `${seed}-${out.length}` });
  }
  return out;
}

/** `quality`: how fine the boulders round the water are (builder/rocks.ts). */
export function buildWater(plan: SitePlan, gm: GroundModel, mirror: PlanarMirror | null, sky: SkyUniforms, pools: PoolLayout, quality: Quality = 'balanced'): WaterBuild {
  const group = new THREE.Group();
  group.name = 'water';
  const surfaces: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const rocks: RockSpot[] = [];
  const lights: NightLight[] = [];
  const fallMats: THREE.ShaderMaterial[] = [];

  // Water that reflects the scene, with its height and size, for choosing the one reflection plane.
  const mirrored: { mat: THREE.ShaderMaterial; level: number; size: number }[] = [];
  const addSurface = (geo: THREE.BufferGeometry, look: WaterLook, name: string, id: string, level = WATER_LEVEL, size = 0) => {
    const mat = waterMaterial(look, mirror, sky);
    if (look.useMirror) mirrored.push({ mat, level, size });
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.renderOrder = 2;
    m.userData.itemId = id;
    group.add(m);
    surfaces.push(m);
    materials.push(mat);
    geos.push(geo);
  };

  for (const w of plan.water) {
    if (w.kind === 'pond' && w.polygon) {
      const poly = w.polygon;
      const b = bounds(poly);
      const pad = 0.25;
      const geo = surfaceGrid(
        (p) => pointInPolygon(p, poly) || distToEdge(p, poly) < pad,
        { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad },
        WATER_LEVEL, 0.12,
        (p) => (pointInPolygon(p, poly) ? distToEdge(p, poly) + 0.05 : Math.max(0, 0.05 - distToEdge(p, poly))),
        (p) => WATER_LEVEL - gm.height(p),
        () => [0, 0, 0],
      );
      addSurface(geo, WATER_LOOKS.pond, `pond-${w.id}`, w.id, WATER_LEVEL, area(poly));
      rocks.push(...edgeRocks(poly, gm, w.id, 0.42, 0.42));
    } else if ((w.kind === 'stream' || w.kind === 'pondless') && w.points) {
      const pts = w.points;
      const half = (w.width ?? 0.8) / 2;
      const prof = fallProfile(w, WATER_LEVEL);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const b = { minX: Math.min(...xs) - half - 0.3, minY: Math.min(...ys) - half - 0.3, maxX: Math.max(...xs) + half + 0.3, maxY: Math.max(...ys) + half + 0.3 };
      const geo = surfaceGrid(
        (p) => {
          const pr = projectOnPolyline(p, pts);
          return pr.d < half + 0.1 && pr.t < prof.end;
        },
        b,
        (p) => prof.level(projectOnPolyline(p, pts).t),
        0.08,
        (p) => Math.max(0, half - distToPolyline(p, pts)) + 0.04,
        (p) => Math.max(0.02, prof.level(projectOnPolyline(p, pts).t) - gm.height(p)),
        (p) => {
          const pr = projectOnPolyline(p, pts);
          return [pr.dir[0], pr.dir[1], pr.along];
        },
      );
      addSurface(geo, WATER_LOOKS.stream, `${w.kind}-${w.id}`, w.id, WATER_LEVEL, polylineLength(pts) * half * 2);
      // Boulders along both banks, bigger near the falls.
      for (const side of [-1, 1]) {
        const bank: Vec2[] = [];
        for (const s2 of samplePolyline(pts, 0.32)) {
          if (s2.t > prof.end + 0.05) continue;
          bank.push([s2.p[0] - s2.dir[1] * (half + 0.14) * side, s2.p[1] + s2.dir[0] * (half + 0.14) * side]);
        }
        rocks.push(
          ...bank.map((p, i) => {
            const r = rng(`${w.id}${side}${i}`);
            const pr = projectOnPolyline(p, pts);
            const nearFall = prof.at.some((t) => Math.abs(t - pr.t) * pr.total < 0.5);
            const sz = (nearFall ? 0.62 : 0.36) * (0.6 + r() * 0.8);
            return { x: p[0], y: Math.max(gm.height(p), prof.level(pr.t)) - sz * 0.15, z: p[1], size: sz, rot: r() * 6.28, seed: `${w.id}-b${side}-${i}` };
          }),
        );
      }
      // Falls: a flat spill stone, a water sheet and an optional light at each drop.
      const fm = fallMaterial();
      fallMats.push(fm);
      const drops = [0, ...prof.at];
      drops.forEach((t, k) => {
        const s2 = samplePolyline(pts, 0.05).reduce((best, c) => (Math.abs(c.t - t) < Math.abs(best.t - t) ? c : best));
        const upper = prof.level(t - 0.001) + (k === 0 ? 0.25 : 0);
        const lower = prof.level(t + 0.001);
        const drop = Math.max(0.12, upper - lower);
        const perp: Vec2 = [-s2.dir[1], s2.dir[0]];
        const width = half * 1.4;
        const sheet = new THREE.PlaneGeometry(width, drop, 1, 1);
        sheet.translate(0, lower + drop / 2, 0);
        const m = new THREE.Mesh(sheet, fm);
        m.position.set(s2.p[0] + s2.dir[0] * 0.03, 0, s2.p[1] + s2.dir[1] * 0.03);
        m.rotation.y = Math.atan2(-perp[1], perp[0]);
        m.renderOrder = 3;
        geos.push(sheet);
        group.add(m);
        // Spill stone the water pours over.
        rocks.push({ x: s2.p[0] - s2.dir[0] * 0.2, y: upper - 0.12, z: s2.p[1] - s2.dir[1] * 0.2, size: width * 0.95, rot: Math.atan2(perp[1], perp[0]), seed: `${w.id}-spill-${k}`, kind: 'flat' });
        for (const sd of [-1, 1]) {
          rocks.push({ x: s2.p[0] + perp[0] * (width / 2 + 0.25) * sd, y: lower, z: s2.p[1] + perp[1] * (width / 2 + 0.25) * sd, size: 0.7 + drop, rot: k + sd, seed: `${w.id}-cheek-${k}-${sd}` });
        }
        if (w.lights !== false) {
          lights.push({ position: new THREE.Vector3(s2.p[0] + s2.dir[0] * 0.25, lower + 0.08, s2.p[1] + s2.dir[1] * 0.25), color: '#ffb35c', intensity: 2.2, distance: 2.6, flicker: false });
        }
      });
      // Head stones: a stack the first fall comes out of.
      const s0 = pts[0];
      for (let k = 0; k < 4; k++) {
        const r = rng(`${w.id}-head-${k}`);
        const a = r() * Math.PI * 2;
        rocks.push({ x: s0[0] + Math.cos(a) * 0.6, y: prof.top + 0.05 + r() * 0.2, z: s0[1] + Math.sin(a) * 0.6, size: 0.8 + r() * 0.5, rot: a, seed: `${w.id}-head-${k}` });
      }
      if (w.kind === 'pondless') {
        // Cobble basin where the water disappears.
        const end = pts[pts.length - 1];
        for (let k = 0; k < 9; k++) {
          const r = rng(`${w.id}-basin-${k}`);
          const a = r() * Math.PI * 2, rr = r() * (half + 0.3);
          rocks.push({ x: end[0] + Math.cos(a) * rr, y: -0.04, z: end[1] + Math.sin(a) * rr, size: 0.18 + r() * 0.2, rot: a, seed: `${w.id}-basin-${k}`, kind: 'cobble' });
        }
      }
    } else if (w.kind === 'pool' && w.polygon && pools.byId.has(w.id)) {
      const poly = w.polygon;
      // The pool stands at the level of the paving it is set in: water, coping and shell top rise with a raised area.
      const place = pools.byId.get(w.id)!;
      const level = place.level, bottom = level - w.depth;
      // Tanning ledge: a 30 cm deep shelf along the first edge.
      const ledgeDepth = (p: Vec2) => {
        if (!w.ledge) return w.depth;
        const a0 = poly[0], a1 = poly[1];
        const d = distToPolyline(p, [a0, a1]);
        return d < 1.6 ? 0.3 : w.depth;
      };
      addSurface(outlineSurface(poly, level, w.ledge ? 0.35 : Infinity, ledgeDepth), WATER_LOOKS.pool, `pool-${w.id}`, w.id, level, area(poly));
      const tile = pbrMaterial('poolTile', poolTile());
      if (w.ledge) {
        const a0 = poly[0], a1 = poly[1];
        const dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1;
        let nx = -dy / l, ny = dx / l;
        const mid: Vec2 = [(a0[0] + a1[0]) / 2 + nx * 0.3, (a0[1] + a1[1]) / 2 + ny * 0.3];
        if (!pointInPolygon(mid, poly)) {
          nx = -nx;
          ny = -ny;
        }
        const shelf = slab([a0, a1, [a1[0] + nx * 1.6, a1[1] + ny * 1.6], [a0[0] + nx * 1.6, a0[1] + ny * 1.6]], bottom, level - 0.3, 0);
        geos.push(shelf);
        const sm = new THREE.Mesh(shelf, tile);
        sm.receiveShadow = true;
        group.add(sm);
      }
      // Shell: one tiled wall ring around the outline, mitered at the corners, from under the floor
      // up to the coping (or, with no coping, up to the rim at the paving's level), and the floor.
      const cw = place.coping;
      const wall = slab(outsetPolygon(poly, 0.03), bottom - 0.1, cw ? place.top - 0.03 : place.top, 0, [insetPolygon(poly, 0.03)]);
      boxMapWorld(wall);
      const floor = slab(poly, bottom - 0.1, bottom, 0);
      for (const g of [wall, floor]) {
        geos.push(g);
        const m = new THREE.Mesh(g, tile);
        m.receiveShadow = true;
        // The wall shades the floor below it, so the coping's shadow does not float in the water.
        m.castShadow = g === wall;
        group.add(m);
      }
      // Coping: a ring from the water's edge out to the coping width, solid down to the ground so
      // a raised pool has closed sides. A pool can have none.
      if (cw) {
        const cop = slab(place.outer, -0.02, place.top, 0.006, [poly]);
        geos.push(cop);
        const m = new THREE.Mesh(cop, catalogMaterial('concrete-smooth'));
        m.receiveShadow = true;
        m.castShadow = true;
        group.add(m);
      }
    } else if (w.kind === 'fountain' && w.polygon) {
      const poly = w.polygon;
      const c = centroid(poly);
      const rim = 0.42;
      const walls: THREE.BufferGeometry[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], d = poly[(i + 1) % poly.length];
        walls.push(segmentBox(a, d, 0.22, -0.05, rim, 0.1));
      }
      const wg = mergeGeometries(walls, false);
      if (wg) {
        geos.push(wg);
        const m = new THREE.Mesh(wg, catalogMaterial('wall-gray-block'));
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.itemId = w.id;
        group.add(m);
      }
      const floor = slab(poly, 0, 0.05, 0);
      geos.push(floor);
      const fm = new THREE.Mesh(floor, catalogMaterial('black-pebble'));
      fm.receiveShadow = true;
      group.add(fm);
      const b = bounds(poly);
      const look = { ...WATER_LOOKS.fountain, rings: [c[0], c[1], 1] as [number, number, number] };
      const geo = surfaceGrid((p) => pointInPolygon(p, poly), b, rim - 0.07, 0.08, (p) => distToEdge(p, poly) + 0.1, () => rim - 0.12, () => [0, 0, 0]);
      addSurface(geo, look, `fountain-${w.id}`, w.id);
      rocks.push({ x: c[0], y: rim - 0.18, z: c[1], size: 0.45, rot: 1.1, seed: `${w.id}-bubbler` });
    }
  }
  group.add(rockField(rocks, 'water-rocks', quality));

  // The scene is reflected about one height only. It is set to the level that carries the most
  // water; water more than 5 cm off it (a raised spa beside a pool at grade) reflects the sky instead.
  if (mirror) {
    const total = (level: number) => mirrored.reduce((s, m) => s + (Math.abs(m.level - level) <= 0.05 ? m.size : 0), 0);
    const main = mirrored.reduce((best, m) => (total(m.level) > total(best) ? m.level : best), WATER_LEVEL);
    mirror.height = main;
    for (const m of mirrored) if (Math.abs(m.level - main) > 0.05) m.mat.uniforms.uUseMirror.value = 0;
  }

  return {
    object: group,
    surfaces,
    materials,
    lights,
    fallMats,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of materials) m.dispose();
      for (const m of fallMats) m.dispose();
    },
  };
}

export type { WaterFeature };
