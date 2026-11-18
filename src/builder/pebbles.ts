import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type MaterialSpec } from '../siteplan/catalog';
import { bounds, pointInPolygon, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { vnoise } from '../engine/noise';
import { rockAlbedo } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

/**
 * Beds of loose stone (a material with spec.pebble, such as Mexican beach pebble), drawn as individual stones.
 *
 * Every stone is one of a few smooth, slightly lopsided ovals, scaled to its own length, width and thickness from the
 * size range it is sold in, turned at random and tipped a little, and set in partly, so the bed reads as stones piled two
 * or three deep. Stones are grouped in 1.5 m tiles. Each frame (update) a tile shows its detailed stones close up, the
 * plainer shapes farther off, and nothing past the distance where its stones are only a pixel or two: there the
 * ground's own pebble texture (surfaces.ts) carries the bed, as it does in the gaps between stones.
 */

/** Stone shapes: icosphere detail for the near and the far look. */
const SHAPES = 6;
const TILE = 1.5;
const shapeCache = new Map<string, THREE.BufferGeometry>();

/**
 * A unit pebble (long side 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: an icosphere welded
 * into one smooth surface (so the shading has no facets) and pushed toward a rounded box, which after the stone's own
 * thinner scale gives the flat top, flatter bottom and full, rounded rim of a wave-worn beach pebble; a little egg-shaped
 * and lopsided, with the faintest dents. UVs are projected from above (no seam). Vertex color darkens toward the bottom,
 * where stones touch and shade each other, with very soft mottling.
 */
function pebbleShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`pebble${s}`);
  const egg = 0.04 + r() * 0.12, lop = (r() - 0.5) * 0.12, flatBottom = 0.12 + r() * 0.22, box = 2.2 + r() * 0.8;
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Onto a superellipsoid (exponent `box`): fuller where the rim turns, flatter across the faces.
    const sup = (Math.abs(v.x) ** box + Math.abs(v.y) ** box + Math.abs(v.z) ** box) ** (-1 / box);
    const k = sup * (1 + egg * v.x + lop * v.z * v.x + (vnoise(v.x * 2 + s * 7, v.z * 2 + v.y * 1.7, 1e6, s) - 0.5) * 0.035);
    let y = v.y * k;
    if (y < 0) y *= 1 - flatBottom;
    const x = v.x * 0.5 * k, z = v.z * 0.5 * k;
    y *= 0.5;
    p.setXYZ(i, x, y, z);
    uv[i * 2] = (x + y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (z + y * 0.7) * 1.4 + s * 0.17;
    const mott = vnoise(v.x * 3 + s, v.y * 3 + v.z * 2.5, 1e6, s + 3);
    const ao = 0.48 + 0.52 * Math.min(1, Math.max(0, (v.y + 0.45) / 1.0)) ** 0.8;
    const c = ao * (0.96 + mott * 0.06);
    col[i * 3] = c;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * The stones' skin, in gray to multiply each stone's color: wave-worn smooth with a soft satin sheen, fine light flecks
 * (the feldspar in the stone) and only a rare tiny pit. Hard and smooth, satin rather than glossy (dry stone).
 */
function pebbleMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('pebbleSkin3', () =>
    paint(512, 0.06, 1, (u, v) => {
      const fine = vnoise(u * 220, v * 220, 220, 12), fleck = vnoise(u * 300, v * 300, 300, 14), pit = vnoise(u * 90, v * 90, 90, 11);
      const light = fleck > 0.84 ? (fleck - 0.84) * 6 : 0, hole = pit > 0.93 ? 1 : 0;
      const g = Math.min(1, 0.86 + fine * 0.05 + light * 0.5 - hole * 0.12);
      return { h: 0.5 + fine * 0.08 - hole * 0.3, c: [g, g, g], r: 0.56 + fine * 0.08 + light * 0.08 + hole * 0.2 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.35, 0.35);
  return m;
}

interface Stone {
  x: number;
  y: number;
  z: number;
  len: number;
  wid: number;
  thick: number;
  yaw: number;
  tipX: number;
  tipZ: number;
  color: THREE.Color;
  shape: number;
}

interface Tile {
  /** Nearest point of the tile to measure the camera from. */
  box: THREE.Box3;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  /** Past this the tile hides; under `nearTo` it shows its detailed stones. */
  nearTo: number;
  farTo: number;
}

/**
 * A bed of stones that is part of a feature (a water feature's pebble basin) rather than a plan zone: its outline and
 * holes in plan coordinates (meters), and the height of the surface the stones lie on.
 */
export interface PebbleBed {
  id: string;
  catalogId: string;
  polygon: Vec2[];
  holes: Vec2[][];
  y: number;
  /** Scale on the stones' colors, linear RGB (stone kept wet is darker). */
  tint?: [number, number, number];
}

/** Where one bed's stones go: inside test, surface height and extent. */
interface BedArea {
  key: string;
  inside: (p: Vec2) => boolean;
  height: (p: Vec2) => number;
  polygon: Vec2[];
  tint: [number, number, number];
}

export interface PebbleBuild {
  object: THREE.Object3D | null;
  /** Show each tile's near or far stones, or none, for the camera about to draw. */
  update(cam: THREE.Camera): void;
  dispose(): void;
}

/** Stones over every bed zone whose material has spec.pebble, where that zone is the top one, and over features' `beds`. */
export function buildPebbles(plan: SitePlan, gm: GroundModel, quality: Quality, beds: PebbleBed[] = []): PebbleBuild {
  // Draft quality (the slowest devices) keeps the ground's pebble texture alone.
  const areas: { area: BedArea; catalogId: string }[] = quality === 'draft' ? [] : [
    ...plan.zones.filter((z) => materialById.get(z.catalogId)?.pebble).map((z) => ({
      catalogId: z.catalogId,
      area: { key: z.id, inside: (p: Vec2) => gm.zoneAt(p) === z, height: gm.height, polygon: z.polygon, tint: [1, 1, 1] as [number, number, number] },
    })),
    ...beds.filter((b) => materialById.get(b.catalogId)?.pebble).map((b) => ({
      catalogId: b.catalogId,
      area: { key: b.id, inside: (p: Vec2) => pointInPolygon(p, b.polygon) && !b.holes.some((h) => pointInPolygon(p, h)), height: () => b.y, polygon: b.polygon, tint: b.tint ?? ([1, 1, 1] as [number, number, number]) },
    })),
  ];
  if (!areas.length) return { object: null, update() {}, dispose() {} };
  const group = new THREE.Group();
  group.name = 'pebbles';
  const mat = pebbleMaterial();
  const tiles: Tile[] = [];
  const owned: THREE.InstancedMesh[] = [];
  const reach = quality === 'max' ? 1.25 : quality === 'balanced' ? 1 : 0.6;
  for (const { area, catalogId } of areas) {
    const spec = materialById.get(catalogId)!;
    const stones = placeStones(area, spec);
    const P = spec.pebble!;
    const avg = ((P.minIn + P.maxIn) / 2) * 0.0254;
    // Small stones get plainer shapes: their facets never show.
    const nearDetail = avg < 0.03 ? 1 : 2, farDetail = avg < 0.03 ? 0 : 1;
    const byTile = new Map<string, Stone[]>();
    for (const s of stones) {
      const k = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
      const list = byTile.get(k) ?? [];
      list.push(s);
      byTile.set(k, list);
    }
    for (const list of byTile.values()) {
      const box = new THREE.Box3();
      const near: THREE.InstancedMesh[] = [], far: THREE.InstancedMesh[] = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), e = new THREE.Euler();
      for (let sh = 0; sh < SHAPES; sh++) {
        const mine = list.filter((s) => s.shape === sh);
        if (!mine.length) continue;
        // The near and the far mesh draw the same stones: they share one copy of the stones' places and colors.
        const a = new THREE.InstancedMesh(pebbleShape(sh + 1, nearDetail), mat, mine.length);
        mine.forEach((s, i) => {
          e.set(s.tipX, s.yaw, s.tipZ, 'YXZ');
          q.setFromEuler(e);
          sc.set(s.len, s.thick, s.wid);
          t.set(s.x, s.y, s.z);
          m.compose(t, q, sc);
          a.setMatrixAt(i, m);
          a.setColorAt(i, s.color);
          box.expandByPoint(t);
        });
        const b = new THREE.InstancedMesh(pebbleShape(sh + 1, farDetail), mat, mine.length);
        b.instanceMatrix = a.instanceMatrix;
        b.instanceColor = a.instanceColor;
        for (const [im, list2] of [[a, near], [b, far]] as [THREE.InstancedMesh, THREE.InstancedMesh[]][]) {
          im.name = `pebbles-${spec.id}`;
          im.castShadow = false;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          im.visible = false;
          group.add(im);
          owned.push(im);
          list2.push(im);
        }
      }
      box.expandByScalar(avg);
      // A stone stops showing at about 2 px on a 1,000 px view; the detailed shape matters only well inside that. Small
      // stones stay in 3D to 16 m at least: across a yard, at a low angle, the flat texture would read lighter than stones.
      tiles.push({ box, near, far, nearTo: avg * 110 * reach, farTo: Math.max(avg * 520, 16) * reach });
    }
  }
  const at = new THREE.Vector3();
  return {
    object: group,
    update(cam) {
      cam.getWorldPosition(at);
      for (const t of tiles) {
        const d = t.box.distanceToPoint(at);
        const showNear = d < t.nearTo, showFar = !showNear && d < t.farTo;
        for (const m of t.near) m.visible = showNear;
        for (const m of t.far) m.visible = showFar;
      }
    },
    dispose() {
      owned.forEach((m) => m.dispose());
      mat.dispose();
    },
  };
}

/**
 * The stones of one bed: on a jittered grid about 0.7 of a stone apart (so they touch, overlap a little and pile, as poured stone
 * does), each with its own size from the sold range (more of the middle sizes), shape, turn, tip, color and how deep it
 * sits. Only where this zone is the top one.
 */
function placeStones(z: BedArea, spec: MaterialSpec): Stone[] {
  const P = spec.pebble!;
  const r = rng(`pebbles:${z.key}`);
  const IN = 0.0254, avg = ((P.minIn + P.maxIn) / 2) * IN;
  const step = avg * 0.7;
  const b = bounds(z.polygon);
  const cols = P.colors.map((x) => new THREE.Color().setRGB(...rockAlbedo(x.c)));
  const cum: number[] = [];
  P.colors.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
  const out: Stone[] = [];
  for (let y = b.minY; y < b.maxY; y += step) {
    for (let x = b.minX; x < b.maxX; x += step) {
      const p: Vec2 = [x + r() * step, y + r() * step];
      if (!z.inside(p)) continue;
      const u = (r() + r()) / 2;
      const len = (P.minIn + (P.maxIn - P.minIn) * u) * IN;
      // The whole stone stays inside the bed (behind its edging), not only its center.
      const reach = len * 0.45;
      if (!z.inside([p[0] + reach, p[1]]) || !z.inside([p[0] - reach, p[1]]) || !z.inside([p[0], p[1] + reach]) || !z.inside([p[0], p[1] - reach])) continue;
      const wid = len * (P.wide[0] + (P.wide[1] - P.wide[0]) * r());
      const thick = len * (P.thick[0] + (P.thick[1] - P.thick[0]) * r());
      const h = r();
      const ci = Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v));
      const color = cols[ci].clone().multiplyScalar(0.88 + r() * 0.24).multiply(new THREE.Color(...z.tint));
      // Lying flat-ish, a few stood on edge against their neighbors; sunk between a fifth and a half of their thickness.
      const steep = r() < 0.12;
      out.push({
        x: p[0],
        y: z.height(p) + thick * (0.5 - (0.2 + r() * 0.3)),
        z: p[1],
        len,
        wid,
        thick,
        yaw: r() * Math.PI * 2,
        tipX: (r() - 0.5) * (steep ? 1.1 : 0.4),
        tipZ: (r() - 0.5) * (steep ? 0.9 : 0.35),
        color,
        shape: Math.floor(r() * SHAPES),
      });
    }
  }
  return out;
}
