import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type FenceStyle } from '../siteplan/catalog';
import { pointInPolygon, signedArea } from '../siteplan/geometry';
import type { LineItem, SitePlan, Vec2, Zone } from '../siteplan/types';
import { latticeAlpha, materialTextures } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import { catalogMaterial, plainMaterial, segmentBox } from './materials';

/**
 * Patios with soldier borders and inset lights, raised planters, walls with
 * caps, fences in seven styles, curbs and steel edging.
 */

export function shapeFrom(poly: Vec2[], holes: Vec2[][] = []): THREE.Shape {
  const pts = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) {
    const hp = signedArea(h) > 0 ? [...h].reverse() : h;
    shape.holes.push(new THREE.Path(hp.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return shape;
}

/** A flat slab of a polygon from y0 to y1, top UVs in meters. */
export function slab(poly: Vec2[], y0: number, y1: number, bevel = 0.008, holes: Vec2[][] = []): THREE.BufferGeometry {
  const depth = Math.max(0.005, y1 - y0 - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shapeFrom(poly, holes), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1 - bevel, 0);
  g.computeVertexNormals();
  return g;
}

/** Grow a simple polygon outward by `d` meters (the mirror image of insetPolygon). */
export function outsetPolygon(poly: Vec2[], d: number): Vec2[] {
  if (!(d > 0)) return poly;
  const inner = insetPolygon(poly, d);
  return poly.map((p, i) => [2 * p[0] - inner[i][0], 2 * p[1] - inner[i][1]] as Vec2);
}

/** Pool width of coping in meters: the plan's own, or the standard 0.25 m. */
export function poolCoping(w: { coping?: number }): number {
  return w.coping === undefined ? 0.25 : Math.max(0, w.coping);
}

/** Inset a simple polygon by `d` meters (mitered corners, limited on sharp angles). */
export function insetPolygon(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const ccw = signedArea(poly) > 0;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    // Inward normals (plan y points down, so the sign flips with winding).
    const n1: Vec2 = ccw ? [-e1[1], e1[0]] : [e1[1], -e1[0]];
    const n2: Vec2 = ccw ? [-e2[1], e2[0]] : [e2[1], -e2[0]];
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const cos = Math.max(0.35, bis[0] * n1[0] + bis[1] * n1[1]);
    out.push([p1[0] + (bis[0] * d) / cos, p1[1] + (bis[1] * d) / cos]);
  }
  // Make sure we went inward; if not, flip.
  const test: Vec2 = [(out[0][0] + out[1][0]) / 2, (out[0][1] + out[1][1]) / 2];
  if (!pointInPolygon(test, poly)) return insetPolygonFlip(poly, d);
  return out;
}

function insetPolygonFlip(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const out: Vec2[] = [];
  const ccw = signedArea(poly) > 0;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const n1: Vec2 = ccw ? [e1[1], -e1[0]] : [-e1[1], e1[0]];
    const n2: Vec2 = ccw ? [e2[1], -e2[0]] : [-e2[1], e2[0]];
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const cos = Math.max(0.35, bis[0] * n1[0] + bis[1] * n1[1]);
    out.push([p1[0] + (bis[0] * d) / cos, p1[1] + (bis[1] * d) / cos]);
  }
  return out;
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/**
 * Soldier-course border: one quad per edge with UVs running along the edge,
 * so the pavers stand perpendicular to every side of the patio.
 */
function borderGeometry(outer: Vec2[], inner: Vec2[], y: number, y0: number, sailor = false): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  const n = outer.length;
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n], c = inner[(i + 1) % n], d = inner[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = norm([b[0] - a[0], b[1] - a[1]]);
    const across = (p: Vec2) => Math.abs((p[0] - a[0]) * dir[1] - (p[1] - a[1]) * dir[0]);
    const alongOf = (p: Vec2) => (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1];
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) {
      pos.push(p[0], y, p[1]);
      nor.push(0, 1, 0);
      // u runs along the edge, v across the band: the soldier texture's
      // long side (v) points into the patio.
      // Sailor course: turn the texture a quarter so the pavers' long side runs along the edge.
      if (sailor) uv.push(across(p), along + alongOf(p));
      else uv.push(along + alongOf(p), across(p));
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    // Outer face down to the base.
    const sb = pos.length / 3;
    const nrm = [-dir[1], dir[0]];
    for (const [p, yy] of [[a, y], [b, y], [b, y0], [a, y0]] as [Vec2, number][]) {
      pos.push(p[0], yy, p[1]);
      nor.push(nrm[0], 0, nrm[1]);
      if (sailor) uv.push(y - yy, along + alongOf(p));
      else uv.push(along + alongOf(p), y - yy);
    }
    idx.push(sb, sb + 1, sb + 2, sb, sb + 2, sb + 3);
    along += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Faces may wind either way; draw both sides via material.
  return g;
}

export interface HardscapeBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  /** Small inset lights that glow at night. */
  glow: THREE.MeshStandardMaterial[];
  dispose(): void;
}

export function buildHardscape(plan: SitePlan, height: (p: Vec2) => number): HardscapeBuild {
  const group = new THREE.Group();
  group.name = 'hardscape';
  const surfaces: THREE.Mesh[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const lightGeo: THREE.BufferGeometry[] = [];
  const glowMat = new THREE.MeshStandardMaterial({ color: '#d8d3c8', emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 });
  // Pools sit on top of paving: each pool (with its coping) is cut out of any paving that surrounds it.
  const poolCuts: Vec2[][] = [];
  for (const w of plan.water) if (w.kind === 'pool' && w.polygon) poolCuts.push(outsetPolygon(w.polygon, poolCoping(w)));

  plan.zones.forEach((z: Zone, i) => {
    if (z.kind === 'hardscape') {
      const spec = materialById.get(z.catalogId);
      const t = (spec?.thickness ?? 0.07) + i * 0.0015;
      const bev = spec?.recipe === 'deck' ? 0.004 : 0.006;
      let field = z.polygon;
      if (z.border && materialById.has(z.border.catalogId)) {
        const w = Math.max(0.08, Math.min(0.6, z.border.width));
        const inner = insetPolygon(z.polygon, w);
        field = inner;
        const bg = borderGeometry(z.polygon, inner, t, -0.06, z.border.course === 'sailor');
        geos.push(bg);
        const bm = new THREE.Mesh(bg, catalogMaterial(z.border.catalogId, { side: THREE.DoubleSide }));
        bm.receiveShadow = true;
        bm.userData.itemId = z.id;
        group.add(bm);
        surfaces.push(bm);
        if (z.borderLights) {
          // A small round light in the border every ~2.4 m.
          const n = z.polygon.length;
          for (let e = 0; e < n; e++) {
            const a = z.polygon[e], b = z.polygon[(e + 1) % n], c = inner[(e + 1) % n], d = inner[e];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const k = Math.max(1, Math.floor(len / 2.4));
            for (let j = 0; j < k; j++) {
              const f = (j + 0.5) / k;
              const p: Vec2 = [(a[0] + (b[0] - a[0]) * f + d[0] + (c[0] - d[0]) * f) / 2, (a[1] + (b[1] - a[1]) * f + d[1] + (c[1] - d[1]) * f) / 2];
              lightGeo.push(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12).translate(p[0], t + 0.003, p[1]));
            }
          }
        }
      }
      const holes = poolCuts.filter((h) => h.every((p) => pointInPolygon(p, field)));
      const g = slab(field, -0.06, t + 0.0005, bev, holes);
      geos.push(g);
      const mesh = new THREE.Mesh(g, catalogMaterial(z.catalogId));
      mesh.receiveShadow = true;
      mesh.castShadow = t > 0.15;
      mesh.name = `zone-${z.id}`;
      mesh.userData.itemId = z.id;
      group.add(mesh);
      surfaces.push(mesh);
    } else if (z.raised && materialById.has(z.raised.wallCatalogId)) {
      group.add(raisedPlanter(z, geos));
    }
  });
  if (lightGeo.length) {
    const lg = mergeGeometries(lightGeo, false)!;
    lightGeo.forEach((g) => g.dispose());
    geos.push(lg);
    group.add(new THREE.Mesh(lg, glowMat));
  }

  for (const l of plan.lines) group.add(buildLine(l, height, geos));

  return {
    object: group,
    surfaces,
    glow: [glowMat],
    dispose() {
      for (const g of geos) g.dispose();
      glowMat.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Raised planters and walls                                            */
/* ------------------------------------------------------------------ */

/** Midnight: the dark charcoal used for contrast caps and borders. */
const MIDNIGHT = '#4a4947';

function capMaterial(wallId: string, choice?: 'same' | 'midnight'): THREE.MeshStandardMaterial {
  const spec = materialById.get(wallId);
  const cap = choice === 'midnight' ? MIDNIGHT : choice === 'same' ? (spec?.palette[1] ?? spec?.palette[0] ?? '#8f8c87') : (spec?.wall?.cap ?? '#8f8c87');
  if (spec?.wall?.face === 'plaster') return catalogMaterial(wallId);
  return plainMaterial(`cap-${cap}`, { color: cap, roughness: 0.55 });
}

function raisedPlanter(z: Zone, geos: THREE.BufferGeometry[]): THREE.Object3D {
  const r = z.raised!;
  const g = new THREE.Group();
  const H = Math.max(0.2, Math.min(1.2, r.height));
  const inner = insetPolygon(z.polygon, 0.2);
  const wall = slab(z.polygon, -0.1, H - 0.05, 0, [inner]);
  // Wall faces: UVs from world position along each face (box mapping in meters).
  boxMapWorld(wall);
  geos.push(wall);
  const wm = new THREE.Mesh(wall, catalogMaterial(r.wallCatalogId));
  wm.castShadow = true;
  wm.receiveShadow = true;
  wm.userData.itemId = z.id;
  g.add(wm);
  const capOuter = insetPolygon(z.polygon, -0.035);
  const capInner = insetPolygon(z.polygon, 0.235);
  const cap = slab(capOuter, H - 0.05, H, 0.012, [capInner]);
  geos.push(cap);
  const cm = new THREE.Mesh(cap, capMaterial(r.wallCatalogId));
  cm.castShadow = true;
  cm.receiveShadow = true;
  g.add(cm);
  return g;
}

/** UVs in meters from world position, picked by face normal. */
export function boxMapWorld(geo: THREE.BufferGeometry) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.6) {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getZ(i);
    } else if (nx > 0.6) {
      uv[i * 2] = p.getZ(i);
      uv[i * 2 + 1] = p.getY(i);
    } else {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getY(i);
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

/* ------------------------------------------------------------------ */
/* Lines: walls, fences, edging                                         */
/* ------------------------------------------------------------------ */

function dogEarAlpha(): THREE.Texture {
  return textureSet('dogEar', () =>
    paint(256, 0.14, 1, (u, v) => {
      // One board per texture width; corners clipped in the top 40%.
      const x = Math.min(u, 1 - u);
      const solid = v < 0.6 || x > (v - 0.6) * 0.9;
      const c: [number, number, number] = solid ? [1, 1, 1] : [0, 0, 0];
      return { h: 0, c, r: solid ? 1 : 0 };
    }),
  ).roughnessMap;
}

function picketAlpha(): THREE.Texture {
  return textureSet('picket', () =>
    paint(128, 0.12, 1, (u) => {
      const solid = u > 0.4 && u < 0.6;
      return { h: 0, c: [1, 1, 1], r: solid ? 1 : 0 };
    }),
  ).roughnessMap;
}

const POST_SPACING = 2.4;

function postsAlong(a: Vec2, b: Vec2, size: number, y0: number, y1: number, out: THREE.BufferGeometry[], round = false) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / POST_SPACING));
  const dir = norm([b[0] - a[0], b[1] - a[1]]);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (round) {
      out.push(new THREE.CylinderGeometry(size / 2, size / 2, y1 - y0, 10).translate(p[0], (y0 + y1) / 2, p[1]));
    } else {
      out.push(segmentBox([p[0] - (dir[0] * size) / 2, p[1] - (dir[1] * size) / 2], [p[0] + (dir[0] * size) / 2, p[1] + (dir[1] * size) / 2], size, y0, y1));
    }
  }
}

function buildLine(l: LineItem, height: (p: Vec2) => number, geos: THREE.BufferGeometry[]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `line-${l.id}`;
  const spec = materialById.get(l.catalogId);
  const buckets = new Map<string, { mat: THREE.Material; parts: THREE.BufferGeometry[]; shadow: boolean }>();
  const put = (key: string, mat: THREE.Material, geo: THREE.BufferGeometry, shadow = true) => {
    const b = buckets.get(key) ?? { mat, parts: [], shadow };
    b.parts.push(geo.index ? geo.toNonIndexed() : geo);
    if (geo.index) geo.dispose();
    buckets.set(key, b);
  };

  for (let i = 0; i < l.points.length - 1; i++) {
    const a = l.points[i], b = l.points[i + 1];
    const y0 = Math.min(height(a), height(b), 0) - 0.08;
    if (l.kind === 'wall') {
      const face = spec?.wall?.face ?? 'splitFace';
      const thick = face === 'plaster' ? 0.25 : 0.3;
      put('wall', catalogMaterial(l.catalogId), segmentBox(a, b, thick, y0, l.height, thick / 2));
      if (face !== 'plaster') put('cap', capMaterial(l.catalogId, l.cap), segmentBox(a, b, thick + 0.07, l.height, l.height + 0.06, thick / 2 + 0.035));
      else put('cap', catalogMaterial(l.catalogId), segmentBox(a, b, thick + 0.04, l.height, l.height + 0.05, thick / 2 + 0.02));
    } else if (l.kind === 'fence') {
      fenceSegment(spec?.fence ?? 'boardOnBoard', l, a, b, y0, put);
    } else {
      const top = Math.max(height(a), height(b));
      if (spec?.recipe === 'curb') {
        put('curb', catalogMaterial(l.catalogId), segmentBox(a, b, 0.15, y0, top + 0.07, 0.075));
      } else {
        put('edge', plainMaterial('steel-edging', { color: '#3e2e24', roughness: 0.55, metalness: 0.6 }), segmentBox(a, b, 0.008, y0 + 0.02, top + 0.03, 0.004), false);
      }
    }
  }
  for (const [, b] of buckets) {
    const merged = mergeGeometries(b.parts, false);
    b.parts.forEach((x) => x.dispose());
    if (!merged) continue;
    geos.push(merged);
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.shadow;
    m.receiveShadow = true;
    m.userData.itemId = l.id;
    g.add(m);
  }
  return g;
}

type Put = (key: string, mat: THREE.Material, geo: THREE.BufferGeometry, shadow?: boolean) => void;

function fenceSegment(style: FenceStyle, l: LineItem, a: Vec2, b: Vec2, y0: number, put: Put) {
  const H = l.height;
  const id = l.catalogId;
  const cedar = plainMaterial('cedar-post', { color: '#9a6a42', roughness: 0.8 });
  const darkPost = plainMaterial('dark-post', { color: '#4d3a2b', roughness: 0.85 });
  switch (style) {
    case 'boardOnBoard': {
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.04, y0 + 0.12, H, 0));
      put('kick', catalogMaterial(id, { color: new THREE.Color('#d8cbbb') }), segmentBox(a, b, 0.06, y0 + 0.06, y0 + 0.22, 0));
      put('cap', catalogMaterial(id, { color: new THREE.Color('#e4d8c8') }), segmentBox(a, b, 0.14, H, H + 0.04, 0.05));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.1, y0, H, posts);
      posts.forEach((p) => put('post', darkPost, p));
      break;
    }
    case 'grayLattice': {
      const lat = 0.32;
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.035, y0 + 0.1, H - lat, 0));
      put('rail', cedar, segmentBox(a, b, 0.09, H - lat - 0.04, H - lat, 0.03));
      const latticeMat = plainMaterial('lattice-cedar', { color: '#b47a46', roughness: 0.8, alphaMap: latticeAlpha(), alphaTest: 0.5, side: THREE.DoubleSide });
      const lg = segmentBox(a, b, 0.02, H - lat, H, 0);
      // Lattice UVs: repeat every 0.3 m along and up.
      const uv = lg.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.3, uv.getY(i) / 0.3);
      put('lattice', latticeMat, lg, true);
      put('cap', cedar, segmentBox(a, b, 0.12, H, H + 0.04, 0.05));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.1, y0, H + 0.02, posts);
      posts.forEach((p) => put('post', cedar, p));
      break;
    }
    case 'dogEar': {
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.02, y0 + 0.08, H - 0.08, 0));
      const top = segmentBox(a, b, 0.02, H - 0.08, H, 0);
      const uv = top.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.14, (uv.getY(i) - (H - 0.08)) / 0.08);
      put('ears', catalogMaterial(id, { alphaMap: dogEarAlpha(), alphaTest: 0.5, side: THREE.DoubleSide }), top);
      for (const yy of [y0 + 0.4, H - 0.45]) put('rail', catalogMaterial(id, { color: new THREE.Color('#cdb9a0') }), segmentBox(a, b, 0.05, yy, yy + 0.09, 0));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.09, y0, H - 0.1, posts);
      posts.forEach((p) => put('post', catalogMaterial(id, { color: new THREE.Color('#c9b39a') }), p));
      break;
    }
    case 'horizontal': {
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.03, y0 + 0.1, H, 0));
      put('cap', plainMaterial('slat-cap', { color: '#2b2b2b', roughness: 0.5, metalness: 0.4 }), segmentBox(a, b, 0.06, H, H + 0.03, 0.02));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.08, y0, H + 0.03, posts);
      posts.forEach((p) => put('post', plainMaterial('slat-post', { color: '#2b2b2b', roughness: 0.5, metalness: 0.4 }), p));
      break;
    }
    case 'vinyl': {
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.03, y0 + 0.08, H, 0));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.13, y0, H + 0.05, posts);
      posts.forEach((p) => put('post', catalogMaterial(id), p));
      break;
    }
    case 'steelPicket': {
      const black = plainMaterial('steel-black', { color: '#1c1c1c', roughness: 0.4, metalness: 0.6 });
      const bars = segmentBox(a, b, 0.016, y0 + 0.1, H, 0);
      const uv = bars.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.12, uv.getY(i));
      put('bars', plainMaterial('steel-bars', { color: '#1c1c1c', roughness: 0.4, metalness: 0.6, alphaMap: picketAlpha(), alphaTest: 0.5, side: THREE.DoubleSide }), bars);
      for (const yy of [y0 + 0.2, H - 0.12]) put('rail', black, segmentBox(a, b, 0.03, yy, yy + 0.03, 0));
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.06, y0, H + 0.04, posts);
      posts.forEach((p) => put('post', black, p));
      break;
    }
    case 'chainlinkSlat': {
      put('panel', catalogMaterial(id), segmentBox(a, b, 0.02, y0 + 0.05, H, 0));
      const galv = plainMaterial('galvanized', { color: '#9ea3a6', roughness: 0.35, metalness: 0.85 });
      const top = new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(b[0] - a[0], b[1] - a[1]), 8);
      top.rotateZ(Math.PI / 2);
      top.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
      top.translate((a[0] + b[0]) / 2, H, (a[1] + b[1]) / 2);
      put('rail', galv, top);
      const posts: THREE.BufferGeometry[] = [];
      postsAlong(a, b, 0.06, y0, H + 0.05, posts, true);
      posts.forEach((p) => put('post', galv, p));
      break;
    }
  }
}

export { materialTextures };
