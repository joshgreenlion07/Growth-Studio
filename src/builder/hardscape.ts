import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type FenceStyle } from '../siteplan/catalog';
import { pointInPolygon, signedArea } from '../siteplan/geometry';
import type { LineItem, SitePlan, Vec2, Zone } from '../siteplan/types';
import { latticeAlpha, materialTextures, photoAlbedo, wallCapTextures } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import { catalogMaterial, pbrMaterial, plainMaterial, segmentBox } from './materials';
import { bandGeometry, extendPath, linePath } from './linepath';
import type { PoolLayout } from './pools';

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
/** True where the outline turns by more than about 20 degrees at vertex i: a real corner, not a point on a curve. */
function isCorner(pts: Vec2[], i: number): boolean {
  const n = pts.length, p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
  const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]), a2 = Math.atan2(r[1] - q[1], r[0] - q[0]);
  return Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) > 0.35;
}

/**
 * The mitre joint at each real corner of a border: a thin strip along the cut from the outer corner to the inner one,
 * where the two runs' pavers are cut to meet at 45 degrees (for a 90 degree corner), as a soldier course is laid.
 */
function mitreJoints(outer: Vec2[], inner: Vec2[], y: number): THREE.BufferGeometry | null {
  const pos: number[] = [], idx: number[] = [];
  const half = 0.0022;
  for (let i = 0; i < outer.length; i++) {
    if (!isCorner(outer, i)) continue;
    const a = outer[i], b = inner[i];
    const d = norm([b[0] - a[0], b[1] - a[1]]), nx = -d[1] * half, nz = d[0] * half;
    const base = pos.length / 3;
    pos.push(a[0] - nx, y + 0.0008, a[1] - nz, a[0] + nx, y + 0.0008, a[1] + nz, b[0] + nx, y + 0.0008, b[1] + nz, b[0] - nx, y + 0.0008, b[1] - nz);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/** Clip a polygon to a convex polygon (both in the same 2D frame), Sutherland-Hodgman. */
function clipConvex(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let area = 0;
  for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const C = area < 0 ? [...clip].reverse() : clip;
  let out = subject;
  for (let i = 0; i < C.length && out.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length];
    const inside = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9;
    const cross = (p: Vec2, q: Vec2): Vec2 => {
      const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      const t = d1 / (d1 - d2);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    const next: Vec2[] = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k], q = out[(k + 1) % out.length];
      if (inside(q)) { if (!inside(p)) next.push(cross(p, q)); next.push(q); }
      else if (inside(p)) next.push(cross(p, q));
    }
    out = next;
  }
  return out;
}

/**
 * Piece lengths for one straight run of the course between two corners: whole pavers from each corner, so the corners
 * stay clean (each starts with a whole paver cut only on its mitre), and whatever does not fit goes in the middle of
 * the run: one cut paver, or, when that would be a sliver under half a paver, two equal cut pavers that blend in.
 */
function runPieces(L: number, P: number): number[] {
  const n = Math.floor(L / P + 1e-6), r = L - n * P;
  if (r < 0.002) return Array(n).fill(P);
  if (n === 0) return [L];
  if (r >= P / 2) { const h = Math.floor(n / 2); return [...Array(h).fill(P), r, ...Array(n - h).fill(P)]; }
  const h = Math.floor((n - 1) / 2);
  return [...Array(h).fill(P), (P + r) / 2, (P + r) / 2, ...Array(n - 1 - h).fill(P)];
}

/**
 * The border band, paver by paver: a soldier course (`pieceIn` = the paver's short side along the edge, its long side
 * across) or a sailor course (long side along). Runs between real corners are laid by runPieces and meet on a mitre at
 * each corner; a border with no real corners (a curve) runs continuously. Each paver maps to its own cell of the
 * border texture, so its joints fall exactly where the pavers do. The outer face down to the base follows the same pieces.
 */
function borderGeometry(outer: Vec2[], inner: Vec2[], y: number, y0: number, sailor = false, pieceIn = sailor ? 9 : 6): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  const n = outer.length;
  const P = pieceIn * 0.0254;
  const S: number[] = [0];
  for (let i = 0; i < n; i++) { const a = outer[i], b = outer[(i + 1) % n]; S.push(S[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = S[n];
  // The pavers along the whole outline: [start, end] in arc length from vertex 0 (may run past `total` and wrap).
  const pieces: [number, number][] = [];
  const corners = outer.map((_, i) => i).filter((i) => isCorner(outer, i));
  if (!corners.length) {
    let s0 = 0;
    for (const l of runPieces(total, P)) { pieces.push([s0, s0 + l]); s0 += l; }
  } else {
    for (let k = 0; k < corners.length; k++) {
      const a = S[corners[k]];
      let b = S[corners[(k + 1) % corners.length]];
      if (b <= a + 1e-9) b += total;
      let s0 = a;
      for (const l of runPieces(b - a, P)) { pieces.push([s0, s0 + l]); s0 += l; }
    }
  }
  const tri = (pts: Vec2[], toWorld: (p: Vec2) => Vec2, tex: (p: Vec2) => [number, number]) => {
    if (pts.length < 3) return;
    const base = pos.length / 3;
    const ws = pts.map(toWorld);
    for (let k = 0; k < pts.length; k++) { pos.push(ws[k][0], y, ws[k][1]); nor.push(0, 1, 0); uv.push(...tex(pts[k])); }
    // Wind every top face to face up: a face seen from its back is shaded with its normal turned down.
    let ar = 0;
    for (let k = 0; k < ws.length; k++) { const p = ws[k], q = ws[(k + 1) % ws.length]; ar += p[0] * q[1] - q[0] * p[1]; }
    for (let k = 1; k < pts.length - 1; k++) {
      if (ar > 0) idx.push(base, base + k + 1, base + k);
      else idx.push(base, base + k, base + k + 1);
    }
  };
  for (let i = 0; i < n; i++) {
    const a = outer[i], b = outer[(i + 1) % n], c = inner[(i + 1) % n], d = inner[i];
    const len = S[i + 1] - S[i];
    if (len < 1e-6) continue;
    const dir = norm([b[0] - a[0], b[1] - a[1]]);
    let nin: Vec2 = [-dir[1], dir[0]];
    if ((d[0] - a[0]) * nin[0] + (d[1] - a[1]) * nin[1] < 0) nin = [dir[1], -dir[0]];
    const local = (p: Vec2): Vec2 => [(p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1], (p[0] - a[0]) * nin[0] + (p[1] - a[1]) * nin[1]];
    const world = (q: Vec2): Vec2 => [a[0] + dir[0] * q[0] + nin[0] * q[1], a[1] + dir[1] * q[0] + nin[1] * q[1]];
    const trap = [local(a), local(b), local(c), local(d)];
    const W = Math.max(trap[2][1], trap[3][1]) + 0.01;
    const nrm = [-nin[0], -nin[1]];
    pieces.forEach(([ps, pe], j) => {
      for (const shift of [0, total, -total]) {
        const s0 = ps - shift, s1 = pe - shift;
        if (s1 <= S[i] + 1e-7 || s0 >= S[i + 1] - 1e-7) continue;
        // The parts at this edge's ends reach past it so the mitre clip, not the edge, decides where they stop.
        const u0 = s0 <= S[i] + 1e-7 ? -1 : s0 - S[i];
        const u1 = s1 >= S[i + 1] - 1e-7 ? len + 1 : s1 - S[i];
        const along = (u: number) => j * P + (u + S[i] - s0);
        const tex = (q: Vec2): [number, number] => (sailor ? [q[1], along(q[0])] : [along(q[0]), q[1]]);
        tri(clipConvex([[u0, -0.01], [u1, -0.01], [u1, W], [u0, W]], trap), world, tex);
        // Outer face of this paver, down to the base.
        const o0 = Math.max(0, u0), o1 = Math.min(len, u1);
        if (o1 - o0 > 1e-5) {
          const sb = pos.length / 3;
          for (const [u, yy] of [[o0, y], [o1, y], [o1, y0], [o0, y0]] as [number, number][]) {
            const w = world([u, 0]);
            pos.push(w[0], yy, w[1]);
            nor.push(nrm[0], 0, nrm[1]);
            uv.push(...((sailor ? [y - yy, along(u)] : [along(u), y - yy]) as [number, number]));
          }
          idx.push(sb, sb + 1, sb + 2, sb, sb + 2, sb + 3);
        }
      }
    });
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

/** Top of a hardscape zone above grade: its material's thickness, its elevation when raised, and a
    hair per zone so overlapping paving does not flicker. `index` is the zone's place in plan.zones. */
export function zoneTop(z: Zone, index: number): number {
  return (materialById.get(z.catalogId)?.thickness ?? 0.07) + index * 0.0015 + (z.elevation ?? 0);
}

/**
 * The cut face of a paving zone where a pool opens it: a wall from the base to the zone's top along
 * each cut outline, only where that outline runs inside the zone. It closes the side of a raised
 * area that stands above the pool beside it; at a pool on the zone's own level it sits hidden
 * inside the coping.
 */
function cutFaces(lines: Vec2[][], zone: Vec2[], y0: number, y1: number): THREE.BufferGeometry | null {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const line of lines) {
    let along = 0;
    for (let i = 0; i < line.length; i++) {
      const a = line[i], b = line[(i + 1) % line.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const at = (s: number): Vec2 => [a[0] + d[0] * s, a[1] + d[1] * s];
      // Walk the edge in short pieces and join the ones inside the zone into runs.
      const n = Math.max(1, Math.ceil(len / 0.05));
      let from = -1;
      for (let k = 0; k <= n; k++) {
        const inside = k < n && pointInPolygon(at(((k + 0.5) / n) * len), zone);
        if (inside && from < 0) from = k;
        if (!inside && from >= 0) {
          const s0 = (from / n) * len, s1 = (k / n) * len, p = at(s0), q = at(s1), base = pos.length / 3;
          for (const [c, y, s] of [[p, y0, s0], [q, y0, s1], [q, y1, s1], [p, y1, s0]] as [Vec2, number, number][]) {
            pos.push(c[0], y, c[1]);
            nor.push(-d[1], 0, d[0]);
            uv.push(along + s, y);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          from = -1;
        }
      }
      along += len;
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildHardscape(plan: SitePlan, height: (p: Vec2) => number, pools: PoolLayout): HardscapeBuild {
  const group = new THREE.Group();
  group.name = 'hardscape';
  const surfaces: THREE.Mesh[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const lightGeo: THREE.BufferGeometry[] = [];
  const glowMat = new THREE.MeshStandardMaterial({ color: '#d8d3c8', emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 });
  plan.zones.forEach((z: Zone, i) => {
    if (z.kind === 'hardscape') {
      const spec = materialById.get(z.catalogId);
      // A raised area: the whole surface lifts by its elevation and sits on solid sides of the same material.
      const t = zoneTop(z, i);
      // Pools show through paving: near a pool the zone's materials leave out everything over the
      // pool and its coping, and so do the shadows they cast.
      const cut = pools.touches(z.polygon);
      const mat = (m: THREE.Material) => (cut ? pools.cutMaterial(m) : m);
      const bev = spec?.recipe === 'deck' ? 0.004 : 0.006;
      let field = z.polygon;
      if (z.border && materialById.has(z.border.catalogId)) {
        const w = Math.max(0.08, Math.min(0.6, z.border.width));
        const inner = insetPolygon(z.polygon, w);
        field = inner;
        const sailor = z.border.course === 'sailor';
        const pz = materialById.get(z.border.catalogId)?.pattern?.sizes?.[0] ?? [6, 9];
        const bg = borderGeometry(z.polygon, inner, t, -0.06, sailor, sailor ? Math.max(pz[0], pz[1]) : Math.min(pz[0], pz[1]));
        geos.push(bg);
        const bm = new THREE.Mesh(bg, mat(catalogMaterial(z.border.catalogId, { side: THREE.DoubleSide })));
        bm.receiveShadow = true;
        bm.userData.itemId = z.id;
        bm.userData.part = 'border';
        bm.userData.catalogId = z.border.catalogId;
        group.add(bm);
        const mj = mitreJoints(z.polygon, inner, t);
        if (mj) {
          geos.push(mj);
          group.add(new THREE.Mesh(mj, mat(plainMaterial('mitre-joint', { color: '#5f584e', roughness: 1 }))));
        }
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
              if (!pools.cutAt(p)) lightGeo.push(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12).translate(p[0], t + 0.003, p[1]));
            }
          }
        }
      }
      const g = slab(field, -0.06, t + 0.0005, bev);
      geos.push(g);
      const mesh = new THREE.Mesh(g, mat(catalogMaterial(z.catalogId, {}, z.laying)));
      mesh.receiveShadow = true;
      mesh.castShadow = t > 0.15;
      if (cut && pools.cutDepth) mesh.customDepthMaterial = pools.cutDepth;
      if (cut) {
        const fg = cutFaces(pools.cutLines, z.polygon, -0.06, t - 0.001);
        if (fg) {
          geos.push(fg);
          const fm = new THREE.Mesh(fg, catalogMaterial(z.catalogId, { side: THREE.DoubleSide }, z.laying));
          fm.receiveShadow = true;
          fm.userData.itemId = z.id;
          fm.userData.part = 'main';
          fm.userData.catalogId = z.catalogId;
          group.add(fm);
        }
      }
      mesh.name = `zone-${z.id}`;
      mesh.userData.itemId = z.id;
      mesh.userData.part = 'main';
      mesh.userData.catalogId = z.catalogId;
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

  for (const l of plan.lines) group.add(l.kind === 'steps' ? buildSteps(l, plan.zones, height, geos) : buildLine(l, plan.zones, height, geos));

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
  // A rough-hewn wall's own cap: the same porous stone, unless a Midnight cap was chosen.
  if (spec?.wall?.face === 'roughHewn' && choice !== 'midnight') return pbrMaterial(`cap:${wallId}`, wallCapTextures(spec));
  // A maker's cap color comes from its swatch photo, like its wall: render it at that color.
  const capColor = spec?.maker && choice !== 'midnight' ? photoAlbedo(cap) : cap;
  return plainMaterial(`cap-${capColor}`, { color: capColor, roughness: 0.55 });
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
  wm.userData.part = 'wall';
  wm.userData.catalogId = r.wallCatalogId;
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

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

/** Risers for a flight with total rise `rise`: each a full `riser`, and any remainder (over 1/8 in)
    as one shorter riser at the bottom. `last` is that bottom riser's height. */
export function stepCount(rise: number, riser = 0.1524): { n: number; r: number; full: number; last: number } {
  const r = Math.max(0.05, riser);
  const full = Math.floor(rise / r + 1e-6);
  const rest = rise - full * r;
  const last = rest > 0.0032 ? rest : 0;
  const n = Math.max(1, full + (last ? 1 : 0));
  return { n, r, full, last: full ? last : rise };
}

/** Which way a flight goes down: the unit normal of its first edge that points away from a raised zone. */
function stepsDown(l: LineItem, zones: Zone[]): Vec2 {
  const a = l.points[0], b = l.points[1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const up = (p: Vec2) => zones.some((z) => (z.elevation ?? 0) > 0 && pointInPolygon(p, z.polygon));
  const probe = (s: number): Vec2 => [mid[0] + n[0] * 0.3 * s, mid[1] + n[1] * 0.3 * s];
  return up(probe(1)) && !up(probe(-1)) ? [-n[0], -n[1]] : n;
}

/** The ground footprint of a flight of steps (each segment of the line, carried down and out). */
export function stepsFootprint(l: LineItem, zones: Zone[]): Vec2[][] {
  if (l.kind !== 'steps' || l.points.length < 2) return [];
  const { n } = stepCount(l.height, l.riser);
  const d = stepsDown(l, zones), run = (n - 1) * (l.tread ?? 0.3) + 0.02;
  const out: Vec2[][] = [];
  for (let i = 0; i < l.points.length - 1; i++) {
    const a = l.points[i], b = l.points[i + 1];
    out.push([a, b, [b[0] + d[0] * run, b[1] + d[1] * run], [a[0] + d[0] * run, a[1] + d[1] * run]]);
  }
  return out;
}

/** A flight of steps: its top edge is the line, at `height` above grade, and each step drops one riser
    and steps out one tread, away from the raised area. Built of the line's hardscape material. */
function buildSteps(l: LineItem, zones: Zone[], height: (p: Vec2) => number, geos: THREE.BufferGeometry[]): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `steps-${l.id}`;
  if (l.points.length < 2) return g;
  const { n, r } = stepCount(l.height, l.riser);
  const T = l.tread ?? 0.3, d = stepsDown(l, zones);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < l.points.length - 1; i++) {
    const a = l.points[i], b = l.points[i + 1];
    const y0 = Math.min(height(a), height(b), 0) - 0.06;
    // Step j (1 = just below the top) has its top j risers down and sits j treads out from the edge.
    for (let j = 1; j < n; j++) {
      const top = l.height - j * r;
      const off = (j - 0.5) * T;
      const pa: Vec2 = [a[0] + d[0] * off, a[1] + d[1] * off], pb: Vec2 = [b[0] + d[0] * off, b[1] + d[1] * off];
      parts.push(segmentBox(pa, pb, T, y0, top, 0));
    }
  }
  const merged = parts.length ? mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false) : null;
  if (merged) {
    geos.push(merged);
    const m = new THREE.Mesh(merged, catalogMaterial(l.catalogId));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.itemId = l.id;
    m.userData.part = 'steps';
    m.userData.catalogId = l.catalogId;
    g.add(m);
  }
  return g;
}

function buildLine(l: LineItem, zones: Zone[], height: (p: Vec2) => number, geos: THREE.BufferGeometry[]): THREE.Object3D {
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

  // Walls and curbs are one continuous mitered body along the path linePath gives them (moved off
  // the line onto the surface that matters less); fences and steel edging go segment by segment.
  if (l.kind === 'wall' || (l.kind === 'edging' && spec?.recipe === 'curb')) {
    const path = linePath(l, zones);
    if (path.pts.length < 2) return g;
    const y0 = path.pts.map((p) => Math.min(height(p), 0) - 0.08);
    const half = path.thick / 2;
    if (l.kind === 'wall') {
      const face = spec?.wall?.face ?? 'splitFace';
      const unit = spec?.wall?.unit;
      // A maker's cap has its own thickness and overhang; otherwise the usual 2.4 in cap with a 1.4 in overhang.
      const over = face === 'plaster' ? 0.02 : unit?.capOver !== undefined ? unit.capOver * 0.0254 : 0.035;
      put('wall', catalogMaterial(l.catalogId), bandGeometry(path, (d) => d - half, (d) => d + half, y0, path.pts.map(() => l.height)));
      // The cap overhangs both faces of a centered wall, and the wall's open ends; as the wall
      // moves off the line its overhang shifts to the far side, so the near edge stays flush.
      const f = (d: number) => Math.max(-1, Math.min(1, path.move ? d / path.move : 0));
      const capTop = l.height + (face === 'plaster' ? 0.05 : unit?.capIn !== undefined ? unit.capIn * 0.0254 : 0.06);
      const cap = bandGeometry(extendPath(path, over), (d) => d - half - over * (1 - f(d)), (d) => d + half + over * (1 + f(d)), path.pts.map(() => l.height), path.pts.map(() => capTop));
      put('cap', face === 'plaster' ? catalogMaterial(l.catalogId) : capMaterial(l.catalogId, l.cap), cap);
    } else {
      put('curb', catalogMaterial(l.catalogId), bandGeometry(path, (d) => d - half, (d) => d + half, y0, path.pts.map((p) => height(p) + 0.07), true));
    }
  } else {
    for (let i = 0; i < l.points.length - 1; i++) {
      const a = l.points[i], b = l.points[i + 1];
      const y0 = Math.min(height(a), height(b), 0) - 0.08;
      if (l.kind === 'fence') fenceSegment(spec?.fence ?? 'boardOnBoard', l, a, b, y0, put);
      else put('edge', plainMaterial('steel-edging', { color: '#3e2e24', roughness: 0.55, metalness: 0.6 }), segmentBox(a, b, 0.008, y0 + 0.02, Math.max(height(a), height(b)) + 0.03, 0.004), false);
    }
  }
  for (const [key, b] of buckets) {
    const merged = mergeGeometries(b.parts, false);
    b.parts.forEach((x) => x.dispose());
    if (!merged) continue;
    geos.push(merged);
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.shadow;
    m.receiveShadow = true;
    m.userData.itemId = l.id;
    // What the material pointer reports: the wall face or its cap, a curb, or a fence.
    m.userData.part = l.kind === 'wall' ? (key === 'cap' ? 'cap' : 'wall') : l.kind === 'fence' ? 'fence' : 'curb';
    m.userData.catalogId = l.catalogId;
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
  // Topper above the fence height: a 1 ft cedar lattice band with a cap, or a plain cap rail.
  // Styles that already carry one (lattice top, board-on-board cap) are left as they are.
  if (l.topper === 'lattice' && style !== 'grayLattice') {
    const lat = 0.3, top = H + lat;
    const latticeMat = plainMaterial('lattice-cedar', { color: '#b47a46', roughness: 0.8, alphaMap: latticeAlpha(), alphaTest: 0.5, side: THREE.DoubleSide });
    const lg = segmentBox(a, b, 0.02, H + 0.03, top, 0);
    const uv = lg.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.3, uv.getY(i) / 0.3);
    put('topper-lattice', latticeMat, lg, true);
    put('topper-rail', cedar, segmentBox(a, b, 0.09, H, H + 0.04, 0.03));
    put('topper-cap', cedar, segmentBox(a, b, 0.12, top, top + 0.04, 0.05));
    const posts: THREE.BufferGeometry[] = [];
    postsAlong(a, b, 0.1, H, top + 0.02, posts);
    posts.forEach((p) => put('topper-post', cedar, p));
  } else if (l.topper === 'cap' && style !== 'boardOnBoard' && style !== 'grayLattice') {
    put('topper-cap', cedar, segmentBox(a, b, 0.14, H, H + 0.04, 0.05));
  }
}

export { materialTextures };
