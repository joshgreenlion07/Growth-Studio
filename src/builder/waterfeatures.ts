import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bounds, centroid, distToEdge, distToPolyline, fallProfile, pointInPolygon, projectOnPolyline, rng, samplePolyline } from '../siteplan/geometry';
import type { SitePlan, Vec2, WaterFeature } from '../siteplan/types';
import { PlanarMirror, WATER_LOOKS, fallMaterial, waterMaterial, type WaterLook } from '../engine/water';
import type { NightLight } from './features';
import { poolTile } from '../engine/textures';
import { WATER_LEVEL, type GroundModel } from './ground';
import { catalogMaterial, pbrMaterial, segmentBox } from './materials';
import { rockField, type RockSpot } from './rocks';
import { slab } from './hardscape';

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

export function buildWater(plan: SitePlan, gm: GroundModel, mirror: PlanarMirror | null, sky: SkyUniforms): WaterBuild {
  const group = new THREE.Group();
  group.name = 'water';
  const surfaces: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const rocks: RockSpot[] = [];
  const lights: NightLight[] = [];
  const fallMats: THREE.ShaderMaterial[] = [];

  const addSurface = (geo: THREE.BufferGeometry, look: WaterLook, name: string, id: string) => {
    const mat = waterMaterial(look, mirror, sky);
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
      addSurface(geo, WATER_LOOKS.pond, `pond-${w.id}`, w.id);
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
      addSurface(geo, WATER_LOOKS.stream, `${w.kind}-${w.id}`, w.id);
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
        rocks.push({ x: s2.p[0] - s2.dir[0] * 0.2, y: upper - 0.12, z: s2.p[1] - s2.dir[1] * 0.2, size: width * 0.95, rot: Math.atan2(perp[1], perp[0]), seed: `${w.id}-spill-${k}` });
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
          rocks.push({ x: end[0] + Math.cos(a) * rr, y: -0.04, z: end[1] + Math.sin(a) * rr, size: 0.18 + r() * 0.2, rot: a, seed: `${w.id}-basin-${k}` });
        }
      }
    } else if (w.kind === 'pool' && w.polygon) {
      const poly = w.polygon;
      const b = bounds(poly);
      // Tanning ledge: a 30 cm deep shelf along the first edge.
      const ledgeDepth = (p: Vec2) => {
        if (!w.ledge) return w.depth;
        const a0 = poly[0], a1 = poly[1];
        const d = distToPolyline(p, [a0, a1]);
        return d < 1.6 ? 0.3 : w.depth;
      };
      const geo = surfaceGrid((p) => pointInPolygon(p, poly), b, WATER_LEVEL - 0.03, 0.2, (p) => distToEdge(p, poly) + 0.2, ledgeDepth, () => [0, 0, 0]);
      addSurface(geo, WATER_LOOKS.pool, `pool-${w.id}`, w.id);
      if (w.ledge) {
        const a0 = poly[0], a1 = poly[1];
        const dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1;
        let nx = -dy / l, ny = dx / l;
        const mid: Vec2 = [(a0[0] + a1[0]) / 2 + nx * 0.3, (a0[1] + a1[1]) / 2 + ny * 0.3];
        if (!pointInPolygon(mid, poly)) {
          nx = -nx;
          ny = -ny;
        }
        const shelf = slab([a0, a1, [a1[0] + nx * 1.6, a1[1] + ny * 1.6], [a0[0] + nx * 1.6, a0[1] + ny * 1.6]], -w.depth - 0.1, WATER_LEVEL - 0.33, 0);
        geos.push(shelf);
        const sm = new THREE.Mesh(shelf, pbrMaterial('poolTile', poolTile()));
        sm.receiveShadow = true;
        group.add(sm);
      }
      const tile = pbrMaterial('poolTile', poolTile());
      const shellParts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        shellParts.push(segmentBox(a, c, 0.06, -w.depth - 0.1, 0.02, 0.03));
      }
      const floor = slab(poly, -w.depth - 0.2, -w.depth - 0.1, 0);
      shellParts.push(floor);
      const shell = mergeGeometries(shellParts.map((g) => g.toNonIndexed()), false);
      if (shell) {
        geos.push(shell);
        const m = new THREE.Mesh(shell, tile);
        m.receiveShadow = true;
        group.add(m);
      }
      // Coping around the edge.
      const coping: THREE.BufferGeometry[] = [];
      for (let i = 0; i < poly.length; i++) coping.push(segmentBox(poly[i], poly[(i + 1) % poly.length], 0.5, -0.02, 0.06, 0.25));
      const cop = mergeGeometries(coping, false);
      if (cop) {
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
  group.add(rockField(rocks, 'water-rocks'));

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
