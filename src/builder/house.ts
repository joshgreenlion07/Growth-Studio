import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointInPolygon } from '../siteplan/geometry';
import { DEFAULT_EAVE, DEFAULT_PITCH, resolveLook, shade, snapPitch, type ResolvedLook } from '../siteplan/houselooks';
import type { ExistingStructure, LineItem, Vec2, Zone } from '../siteplan/types';
import { houseRoof, houseStucco, windowInteriorMaps } from '../engine/house-surfaces';
import { boxUV, catalogMaterial, pbrMaterial, plainMaterial, segmentBox, touchLookMaterials } from './materials';
import { slab, zoneTop } from './hardscape';
import { ENTRY_RISE, openingBoxes, planOpenings, recessOf, type Landing, type OpeningPlan, type WallSide } from './openingplan';
import { cleanOutline, offsetOutline, signedArea, straightSkeleton, type Skeleton } from './roofskeleton';
import { COVER_FLOOR_ID } from './coverfloor';
import { isBoardDeck } from '../siteplan/deckzone';

/**
 * A house, garage or shed (not a cover): stucco walls, a straight-skeleton roof (hip, gable or flat) with eaves, fascia
 * and a soffit under the overhang, ridge and hip caps, an optional raised crown over the entry and a chimney chase, and
 * the windows and doors placed by openingplan.ts, drawn in detail, all in the colors of its look
 * (siteplan/houselooks.ts).
 */

export interface HouseOut {
  group: THREE.Group;
  surfaces: THREE.Mesh[];
  geos: THREE.BufferGeometry[];
  porchLights: THREE.Vector3[];
  solids: Vec2[][];
  glass: THREE.MeshStandardMaterial;
}

/** What a house can stand next to: the plan's zones (raised landings) and lines (steps). */
export interface HouseGround { zones: Zone[]; lines?: LineItem[] }

type Sub = 'walls' | 'roof' | 'trim' | 'windows' | 'door' | 'garage' | 'chimney' | 'steps';

/** The window glass for every house in a build: a dark room with blinds behind it, lit at night (house-surfaces.ts). */
export function houseGlass(): THREE.MeshStandardMaterial {
  const maps = windowInteriorMaps();
  // The color keeps the night glow on the glass branch of the studio's mood code (color.r below 0.5).
  return new THREE.MeshStandardMaterial({
    color: '#808080', map: maps.map, roughness: 0.03, metalness: 0, envMapIntensity: 1.9,
    emissive: new THREE.Color('#ffb46a'), emissiveMap: maps.glow, emissiveIntensity: 0,
  });
}

/** Where steps and small raised landings meet this house's walls. */
export function houseLandings(ground: HouseGround): Landing[] {
  const out: Landing[] = [];
  for (const l of ground.lines ?? []) {
    if (l.kind !== 'steps' || l.points.length < 2) continue;
    for (let i = 0; i < l.points.length - 1; i++) out.push({ a: l.points[i], b: l.points[i + 1], top: l.height, src: l.id, kind: 'steps' });
  }
  // A raised zone counts only when it is a stoop: paving (not a deck) 4 in to 2 1/2 ft up and no bigger than about
  // 130 sq ft. A raised patio or a deck along the house gets no door of its own; draw steps or mark the door for that.
  ground.zones.forEach((z, k) => {
    const e = z.elevation ?? 0;
    if (z.kind !== 'hardscape' || isBoardDeck(z) || e < 0.1 || e > 0.75 || Math.abs(signedArea(z.polygon)) > 12) return;
    const top = zoneTop(z, k);
    const n = z.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = z.polygon[i], b = z.polygon[(i + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 5.2) out.push({ a, b, top, src: z.id, kind: 'zone' });
    }
  });
  return out;
}

/** A material set for one look. */
function lookMaterials(r: ResolvedLook) {
  const wall = pbrMaterial(`house-wall:${r.wall.sw}`, houseStucco(), { color: r.wall.sw });
  const roofSet = houseRoof(r.roof.id, r.roofColor.id);
  const metal = r.roof.id === 'metal';
  const roof = pbrMaterial(`house-roof:${r.roof.id}:${r.roofColor.id}`, roofSet, metal ? { metalness: r.roofColor.id === 'galvalume' ? 0.75 : 0.45 } : {});
  // Painted trim: flat paint, no whiter than the stucco. A near-white satin trim went past the bloom threshold in full
  // sun and read as a glowing bar along the eaves.
  const trim = plainMaterial(`house-trim:${r.trimSw}`, { color: r.trimSw, roughness: 0.92 });
  const frame = plainMaterial(`house-frame:${r.window.sw}`, { color: r.window.sw, roughness: 0.6, metalness: 0.02 });
  const track = plainMaterial(`house-track:${r.window.sw}`, { color: shade(r.window.sw, 0.82), roughness: 0.4, metalness: 0.45 });
  const door = plainMaterial(`house-door:${r.door.sw}`, { color: r.door.sw, roughness: 0.5 });
  const garage = plainMaterial(`house-garage:${r.garageSw}`, { color: r.garageSw, roughness: 0.62 });
  const groove = plainMaterial(`house-groove:${r.garageSw}`, { color: shade(r.garageSw, 0.62), roughness: 0.8 });
  const handle = plainMaterial('house-handle', { color: '#2e2a26', roughness: 0.35, metalness: 0.6 });
  const flue = plainMaterial('house-flue', { color: '#3a3936', roughness: 0.5, metalness: 0.5 });
  const wallKey = `house-wall:${r.wall.sw}`, roofKey = `house-roof:${r.roof.id}:${r.roofColor.id}`;
  touchLookMaterials(JSON.stringify([r.wall.id, r.trimSw, r.window.id, r.roof.id, r.roofColor.id, r.door.id, r.garageSw]),
    [wallKey, roofKey, `plain:house-trim:${r.trimSw}`, `plain:house-frame:${r.window.sw}`, `plain:house-track:${r.window.sw}`, `plain:house-door:${r.door.sw}`, `plain:house-garage:${r.garageSw}`, `plain:house-groove:${r.garageSw}`],
    [roofKey]);
  return { wall, roof, trim, frame, track, door, garage, groove, handle, flue, metal };
}

/** Collects geometry by material, then makes one mesh per material. */
class Buckets {
  /** By material, part and shadow, so each mesh carries the right part name and casts shadows as its pieces should. */
  private m = new Map<string, { mat: THREE.Material; sub: Sub; geos: THREE.BufferGeometry[]; shadow: boolean }>();
  put(mat: THREE.Material, sub: Sub, g: THREE.BufferGeometry, shadow = true) {
    const key = `${mat.uuid}|${sub}|${shadow}`;
    const b = this.m.get(key) ?? { mat, sub, geos: [], shadow };
    b.geos.push(g.index ? g.toNonIndexed() : g);
    this.m.set(key, b);
  }
  flush(out: HouseOut, id: string) {
    for (const b of this.m.values()) {
      const mat = b.mat;
      const keep = b.geos.map((g) => {
        // Every piece needs the same attributes to merge.
        if (!g.getAttribute('uv')) boxUV(g);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        return g;
      });
      const merged = keep.length ? mergeGeometries(keep, false) : null;
      for (const g of keep) g.dispose();
      if (!merged) continue;
      out.geos.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = true;
      mesh.userData.itemId = id;
      mesh.userData.sub = b.sub;
      out.group.add(mesh);
      out.surfaces.push(mesh);
    }
  }
}

/** Triangles of a convex or star-shaped planar polygon (fan), as a non-indexed geometry with the given UVs. */
function fanGeometry(pts: THREE.Vector3[], uvs: [number, number][], up: boolean): THREE.BufferGeometry | null {
  const pos: number[] = [], uv: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    const flip = up ? n.y < 0 : false;
    const tri = flip ? [0, i + 1, i] : [0, i, i + 1];
    for (const k of tri) { pos.push(pts[k].x, pts[k].y, pts[k].z); uv.push(...uvs[k]); }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A capping ridge along a 3D line: a low triangular prism, its peak `h` up and `w` wide, sitting on the roof. */
function capPrism(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry | null {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return null;
  dir.divideScalar(len);
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-6) return null;
  side.normalize();
  const upv = new THREE.Vector3().crossVectors(side, dir).normalize();
  if (upv.y < 0) upv.negate();
  const P = (o: THREE.Vector3, s: number, u: number) => o.clone().addScaledVector(side, s).addScaledVector(upv, u);
  // Profile: left foot, peak, right foot (feet a little into the roof so no gap shows).
  const A = [P(a, -w / 2, -0.03), P(a, 0, h), P(a, w / 2, -0.03)], B = [P(b, -w / 2, -0.03), P(b, 0, h), P(b, w / 2, -0.03)];
  const pos: number[] = [], uv: number[] = [];
  const quad = (p: THREE.Vector3[], q: [number, number][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(p[k].x, p[k].y, p[k].z); uv.push(...q[k]); }
  };
  const sl = Math.hypot(w / 2, h);
  quad([A[0], B[0], B[1], A[1]], [[0, 0], [len, 0], [len, sl], [0, sl]]);
  quad([A[1], B[1], B[2], A[2]], [[0, sl], [len, sl], [len, 0], [0, 0]]);
  for (const [E, s] of [[A, -1], [B, 1]] as const) {
    const t = s > 0 ? [E[0], E[1], E[2]] : [E[0], E[2], E[1]];
    for (const p of t) { pos.push(p.x, p.y, p.z); uv.push(0, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Which edges of a footprint become gable ends: the ends of wings, found from the hip roof itself. An edge is a wing end
 * when its corners are square, it is at least 8 ft long, and its hip face is a triangle that peaks at half its length
 * (a hip end); never two side by side. `sk` is the hip skeleton of the eave outline (same edge numbers).
 */
function gableEdges(poly: Vec2[], sk: Skeleton): boolean[] {
  const n = poly.length, ccw = signedArea(poly) > 0;
  const len = (i: number) => Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
  const dir = (i: number): Vec2 => { const l = len(i) || 1; return [(poly[(i + 1) % n][0] - poly[i][0]) / l, (poly[(i + 1) % n][1] - poly[i][1]) / l]; };
  const square = (i: number) => {
    // The corner at the start of edge i: convex and about 90 degrees.
    const a = dir((i - 1 + n) % n), b = dir(i);
    const cross = a[0] * b[1] - a[1] * b[0], dot = a[0] * b[0] + a[1] * b[1];
    return (ccw ? cross > 0 : cross < 0) && Math.abs(dot) < 0.17;
  };
  const top = poly.map(() => ({ t: 0, pts: [] as [number, number][] }));
  for (const pc of sk.pieces) for (const q of pc.pts) {
    const e = top[pc.edge];
    if (q[2] > e.t + 1e-6) { e.t = q[2]; e.pts = [[q[0], q[1]]]; }
    else if (q[2] > e.t - 1e-6) e.pts.push([q[0], q[1]]);
  }
  const apex = (i: number) => {
    const e = top[i];
    let spread = 0;
    for (const a of e.pts) for (const b of e.pts) spread = Math.max(spread, Math.hypot(a[0] - b[0], a[1] - b[1]));
    return spread < 0.15 && Math.abs(e.t - (len(i) / 2 + 0)) < len(i) * 0.15 + 0.6;
  };
  const cand = poly.map((_, i) => square(i) && square((i + 1) % n) && len(i) >= 2.4 && apex(i));
  const out = poly.map(() => false);
  for (const i of poly.map((_, i) => i).sort((a, b) => len(a) - len(b))) {
    if (!cand[i] || out[(i - 1 + n) % n] || out[(i + 1) % n]) continue;
    out[i] = true;
  }
  return out;
}

export interface RoofResult {
  ok: boolean;
  /** Eave height (the fascia's top). */
  eaveY: number;
  /** Roof surface (for heights under a point, e.g. the chimney). */
  mesh: THREE.Mesh | null;
}

/**
 * A roof over `footprint` with its walls `H` high: the straight skeleton of the eave outline (the footprint pushed out
 * by the overhang), every face at `pitch` (rise per run), so its eave line passes the walls at exactly H. Adds the
 * covering, ridge and hip caps, fascia, the soffit under the overhang and gable walls to `bk`.
 */
export function buildRoof(footprint: Vec2[], H: number, pitch: number, eave: number, gable: boolean, look: ResolvedLook, mats: ReturnType<typeof lookMaterials>, bk: Buckets): RoofResult {
  const poly = cleanOutline(footprint).pts;
  const fail: RoofResult = { ok: false, eaveY: H, mesh: null };
  if (poly.length < 3) return fail;
  const RAKE = 0.18;
  const n0 = poly.length, ccw0 = signedArea(poly) > 0;
  const plen = (i: number) => Math.hypot(poly[(i + 1) % n0][0] - poly[i][0], poly[(i + 1) % n0][1] - poly[i][1]);
  const reflex = (i: number) => {
    const a = poly[(i - 1 + n0) % n0], b = poly[i], c = poly[(i + 1) % n0];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return ccw0 ? cr < 0 : cr > 0;
  };
  /** Each edge's overhang at scale k: a narrow slot (a short edge with reflex corners at both ends) only narrows the eaves of its own two sides, so they cannot cross. */
  const eaves = (k: number, local: boolean) => poly.map((_, i) => {
    let d = eave * k;
    if (local) for (const j of [(i - 1 + n0) % n0, (i + 1) % n0]) {
      if (reflex(j) && reflex((j + 1) % n0) && plen(j) < 2 * d + 0.1) d = Math.min(d, Math.max(0, (plen(j) - 0.1) / 2));
    }
    return d;
  });
  let sk: Skeleton | null = null, outer: Vec2[] | null = null, weights = poly.map(() => 1), dUsed: number[] = poly.map(() => eave);
  search: for (const asGable of gable ? [true, false] : [false]) {
    for (const [k, local] of [[1, false], [1, true], [0.6, true], [0.3, true], [0, false]] as const) {
      const d = eaves(k, local);
      weights = poly.map(() => 1);
      if (asGable) {
        // Gable ends are picked from the hip roof of the first outline that offsets at this overhang.
        const o = offsetOutline(poly, d);
        const hip = o ? straightSkeleton(o) : null;
        if (!hip?.ok) continue;
        weights = gableEdges(o!, hip).map((g) => (g ? 0 : 1));
      }
      dUsed = d.map((x, i) => (weights[i] ? x : Math.min(RAKE, x)));
      outer = offsetOutline(poly, dUsed);
      if (!outer) continue;
      sk = straightSkeleton(outer, weights);
      if (sk.ok) break search;
    }
  }
  if (!sk?.ok || !outer) return fail;
  // The roof meets the walls at H where the overhang is least; where it is deeper the roof rides a little above the wall
  // top, which the soffit (the roof's underside, 0.16 m down) closes.
  const sloped = dUsed.filter((_, i) => weights[i]);
  const e = sloped.length ? Math.min(...sloped) : 0;
  const n = outer.length;
  const eaveY = H - e * pitch;
  const slopeK = Math.sqrt(1 + pitch * pitch);
  const E = outer.map((p, i) => {
    const q = outer![(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return { p, ux: (q[0] - p[0]) / l, uy: (q[1] - p[1]) / l, len: l };
  });
  const roofGeos: THREE.BufferGeometry[] = [];
  const gablePts = new Map<number, [number, number][]>();
  for (const pc of sk.pieces) {
    const ed = E[pc.edge];
    if (weights[pc.edge] === 0) {
      const list = gablePts.get(pc.edge) ?? [];
      for (const q of pc.pts) list.push([(q[0] - ed.p[0]) * ed.ux + (q[1] - ed.p[1]) * ed.uy, eaveY + q[2] * pitch]);
      gablePts.set(pc.edge, list);
      continue;
    }
    const pts = pc.pts.map((q) => new THREE.Vector3(q[0], eaveY + q[2] * pitch, q[1]));
    const uvs = pc.pts.map((q) => [(q[0] - ed.p[0]) * ed.ux + (q[1] - ed.p[1]) * ed.uy, q[2] * slopeK] as [number, number]);
    const g = fanGeometry(pts, uvs, true);
    if (g) roofGeos.push(g);
  }
  const roof = roofGeos.length ? mergeGeometries(roofGeos, false) : null;
  for (const g of roofGeos) g.dispose();
  if (!roof) return fail;
  // The soffit: the roof's own underside a board's depth below it (it shows only under the overhang; inside the walls
  // it is hidden).
  const under = roof.clone();
  {
    const p = under.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - 0.16);
    under.deleteAttribute('uv');
    boxUV(under);
    under.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(roof.clone(), mats.roof);
  bk.put(mats.roof, 'roof', roof);
  bk.put(mats.trim, 'trim', under, false);

  // Caps over hips and ridges, the size of the covering's own ridge pieces.
  const [cw, ch] = look.roof.id === 'metal' ? [0.2, 0.035] : look.roof.id === 'shingle' ? [0.26, 0.025] : look.roof.id === 'concrete-s' ? [0.3, 0.1] : [0.28, 0.075];
  for (const a of sk.arcs) {
    if (a.kind === 'valley') continue;
    const A = new THREE.Vector3(a.a[0], eaveY + a.a[2] * pitch, a.a[1]), B = new THREE.Vector3(a.b[0], eaveY + a.b[2] * pitch, a.b[1]);
    // A hip's cap stops short of the eave corner, as the starter cap does, so it never hangs past the fascia.
    for (const [P, Q, t] of [[A, B, a.a[2]], [B, A, a.b[2]]] as const) {
      if (t < 0.05) { const d = P.distanceTo(Q); if (d > 0.5) P.lerp(Q, 0.22 / d); }
    }
    const g = capPrism(A, B, cw, ch);
    if (g) bk.put(mats.roof, 'roof', g);
  }
  // Fascia along the eaves (a 1 x 8 board whose top meets the covering).
  for (let i = 0; i < n; i++) {
    if (weights[i] === 0) continue;
    bk.put(mats.trim, 'trim', segmentBox(outer[i], outer[(i + 1) % n], 0.04, eaveY - 0.2, eaveY + 0.025, 0.02));
  }
  // Gable ends: the stucco triangle in the wall's plane above the wall, and a rake board along the roof's edge.
  const ccw = signedArea(outer) > 0;
  for (const [i, list] of gablePts) {
    const ed = E[i];
    // The gable's outline in (u along the edge, height): its upper hull.
    const us = list.map((q) => q[0]);
    const u0 = Math.min(...us), u1 = Math.max(...us);
    let apex = list[0];
    for (const q of list) if (q[1] > apex[1]) apex = q;
    if (apex[1] - eaveY < 0.2) continue;
    const inward: Vec2 = ccw ? [-ed.uy, ed.ux] : [ed.uy, -ed.ux];
    const off = Math.min(RAKE, e);
    const P3 = (u: number, y: number, d: number) => new THREE.Vector3(ed.p[0] + ed.ux * u + inward[0] * d, y, ed.p[1] + ed.uy * u + inward[1] * d);
    // Clip the triangle (u0, eave) - apex - (u1, eave) to the wall's length and to above the wall top.
    const w0 = u0 + e, w1 = u1 - e;
    const tri: [number, number][] = [[u0, eaveY], [u1, eaveY], apex];
    const clip = (pts: [number, number][], f: (p: [number, number]) => number) => {
      const o: [number, number][] = [];
      for (let k = 0; k < pts.length; k++) {
        const A = pts[k], B = pts[(k + 1) % pts.length], fa = f(A), fb = f(B);
        if (fa >= 0) o.push(A);
        if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); o.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      return o;
    };
    let g2 = clip(tri, (p) => p[0] - w0);
    g2 = clip(g2, (p) => w1 - p[0]);
    g2 = clip(g2, (p) => p[1] - (H - 0.05));
    if (g2.length >= 3) {
      const wallG = fanGeometry(g2.map((q) => P3(q[0], q[1], off)), g2.map((q) => [q[0], q[1]]), false);
      if (wallG) {
        // Face it outward.
        const nrm = wallG.getAttribute('normal');
        if (nrm.getX(0) * inward[0] + nrm.getZ(0) * inward[1] > 0) {
          const p = wallG.getAttribute('position') as THREE.BufferAttribute, uv = wallG.getAttribute('uv') as THREE.BufferAttribute;
          for (let k = 0; k < p.count; k += 3) {
            const x = p.getX(k + 1), y = p.getY(k + 1), z = p.getZ(k + 1), a = uv.getX(k + 1), b = uv.getY(k + 1);
            p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2));
            uv.setXY(k + 1, uv.getX(k + 2), uv.getY(k + 2));
            p.setXYZ(k + 2, x, y, z);
            uv.setXY(k + 2, a, b);
          }
          wallG.computeVertexNormals();
        }
        bk.put(mats.wall, 'walls', wallG);
      }
    }
    for (const [A, B] of [[[u0, eaveY], apex], [apex, [u1, eaveY]]] as [number, number][][]) {
      const a3 = P3(A[0], A[1] + 0.02, 0.0), b3 = P3(B[0], B[1] + 0.02, 0.0);
      const g = rakeBoard(a3, b3, 0.04, 0.2);
      if (g) bk.put(mats.trim, 'trim', g);
    }
  }
  return { ok: true, eaveY, mesh };
}

/** A board along a sloped 3D line (its top on the line), `t` thick and `h` deep. */
function rakeBoard(a: THREE.Vector3, b: THREE.Vector3, t: number, h: number): THREE.BufferGeometry | null {
  const len = a.distanceTo(b);
  if (len < 0.05) return null;
  const g = new THREE.BoxGeometry(len, h, t);
  g.translate(0, -h / 2, 0);
  boxUV(g);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const m = new THREE.Matrix4().makeBasis(dir, up, side);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

/** A rectangle in a wall's frame: t along it, o out of it (negative inward). */
function wallRect(sd: WallSide, t0: number, t1: number, o0: number, o1: number): Vec2[] {
  const P = (t: number, o: number): Vec2 => [sd.a[0] + sd.dir[0] * t + sd.out[0] * o, sd.a[1] + sd.dir[1] * t + sd.out[1] * o];
  return [P(t0, o0), P(t1, o0), P(t1, o1), P(t0, o1)];
}

export function buildHouse(s: ExistingStructure, structures: ExistingStructure[], siteCenter: Vec2, ground: HouseGround, glass: THREE.MeshStandardMaterial, out: HouseOut) {
  const poly = s.polygon;
  const H = s.height;
  const look = resolveLook(s.look);
  const mats = lookMaterials(look);
  const bk = new Buckets();
  const pitch = snapPitch(s.pitch ?? DEFAULT_PITCH) / 12;
  const eave = s.eave ?? DEFAULT_EAVE;

  bk.put(mats.wall, 'walls', slab(poly, -0.1, H, 0));
  const plan: OpeningPlan = planOpenings(s, structures, siteCenter, houseLandings(ground), { zones: ground.zones.map((z) => z.polygon) });
  const sideOf = new Map(plan.sides.map((sd) => [sd.edge, sd]));

  // The roof.
  let roof: RoofResult = { ok: false, eaveY: H, mesh: null };
  if (s.roof !== 'flat') roof = buildRoof(poly, H, pitch, eave, s.roof === 'gable', look, mats, bk);
  if (!roof.ok) {
    // A flat roof (or a footprint the skeleton could not close): tiled like the rest, with a fascia band.
    bk.put(mats.roof, 'roof', slab(poly, H, H + 0.25, 0));
    roof.eaveY = H + 0.25;
  }

  // The raised entry crown: a taller box over the entry (over the whole recess when the entry is set back in one), with
  // its own hip roof at the same pitch.
  if (s.crown && plan.entry && s.roof !== 'flat') {
    const sd = sideOf.get(plan.entry.edge)!;
    const depth = recessOf(sd, plan.sides);
    let t0: number, t1: number, o1: number;
    if (depth > 0.4 && sd.len <= 6) { t0 = -0.3; t1 = sd.len + 0.3; o1 = depth; }
    else {
      const w = Math.min(sd.len, Math.max(2.8, plan.entry.w + 1.4));
      t0 = Math.max(0, Math.min(sd.len - w, plan.entry.t - w / 2));
      t1 = t0 + w;
      o1 = 0;
    }
    let D = 2.6;
    const inside = (q: Vec2) => pointInPolygon(q, poly);
    while (D > 1.2) {
      const r = wallRect(sd, t0 + 0.05, t1 - 0.05, -D, -D + 0.01);
      if (inside(r[0]) && inside(r[1])) break;
      D -= 0.2;
    }
    if (D > 1.2) {
      const Hc = H + 1.0;
      const rect = wallRect(sd, t0, t1, -D, o1);
      bk.put(mats.wall, 'walls', slab(rect, H - 0.45, Hc, 0));
      buildRoof(rect, Hc, pitch, Math.min(eave, 0.4), false, look, mats, bk);
    }
  }

  // The chimney chase: stucco from the ground to a meter above the roof, a cap and a spark arrestor.
  if (plan.chimney) {
    const sd = sideOf.get(plan.chimney.edge)!;
    const c = plan.chimney;
    const depthOut = Math.max(0.75, eave + 0.25);
    const rect = wallRect(sd, c.t - c.w / 2, c.t + c.w / 2, -0.35, depthOut);
    const ray = new THREE.Raycaster();
    let top = Math.max(H, roof.eaveY);
    if (roof.mesh) {
      roof.mesh.updateMatrixWorld();
      for (const q of [...rect, ...wallRect(sd, c.t - c.w / 2, c.t + c.w / 2, -0.9, -0.9)]) {
        ray.set(new THREE.Vector3(q[0], 50, q[1]), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(roof.mesh, false)[0];
        if (hit) top = Math.max(top, hit.point.y);
      }
    }
    top += 0.9;
    bk.put(mats.wall, 'chimney', slab(rect, -0.05, top, 0));
    const capR = wallRect(sd, c.t - c.w / 2 - 0.05, c.t + c.w / 2 + 0.05, -0.4, depthOut + 0.05);
    bk.put(mats.trim, 'chimney', slab(capR, top, top + 0.08, 0.005));
    const fl = wallRect(sd, c.t - 0.22, c.t + 0.22, depthOut / 2 - 0.35 - 0.17, depthOut / 2 - 0.35 + 0.17);
    bk.put(mats.flue, 'chimney', slab(fl, top + 0.08, top + 0.42, 0));
    const flc = wallRect(sd, c.t - 0.28, c.t + 0.28, depthOut / 2 - 0.35 - 0.23, depthOut / 2 - 0.35 + 0.23);
    bk.put(mats.flue, 'chimney', slab(flc, top + 0.42, top + 0.47, 0));
  }

  // Openings, drawn in detail; glass gets the room-and-blinds map laid so each window shows its own blinds.
  for (const op of plan.placed) {
    const sd = sideOf.get(op.edge)!;
    for (const b of openingBoxes(sd, op, look.garageStyle.id)) {
      const g = segmentBox(b.a, b.b, b.thick, b.y0, b.y1, b.extend);
      if (b.kind === 'pane') {
        const f = b.blinds ?? 0;
        const yb = f > 0 ? b.y1 - f * (b.y1 - b.y0) : b.y1 + 0.02;
        const p = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - sd.a[0]) * sd.dir[0] + (p.getZ(i) - sd.a[1]) * sd.dir[1], 0.5 + (p.getY(i) - yb) / 3);
        bk.put(glass, 'windows', g, false);
        continue;
      }
      const sub: Sub = op.type === 'garage' ? 'garage' : op.type === 'entry' || op.type === 'door' ? 'door' : 'windows';
      const mat = b.kind === 'frame' ? mats.frame : b.kind === 'door' ? mats.door : b.kind === 'trim' ? mats.trim : b.kind === 'track' ? mats.track
        : b.kind === 'handle' ? mats.handle : b.kind === 'garage' ? mats.garage : mats.groove;
      bk.put(mat, sub, g, b.kind === 'frame' || b.kind === 'trim' || b.kind === 'garage');
    }
  }

  // Two concrete steps up to the entry: a landing at the door's sill (filling a recess) and a step below it.
  if (plan.entry && plan.entry.steps && plan.entry.h0 >= ENTRY_RISE - 0.05) {
    const sd = sideOf.get(plan.entry.edge)!;
    const depth = recessOf(sd, plan.sides);
    const recess = depth > 0.4;
    const w = recess ? sd.len : Math.min(sd.len, plan.entry.w + 0.7);
    const t0 = recess ? 0 : Math.max(0, Math.min(sd.len - w, plan.entry.t - w / 2));
    const d1 = recess ? Math.max(depth, 0.9) : 1.0;
    const conc = catalogMaterial(COVER_FLOOR_ID);
    const land = wallRect(sd, t0, t0 + w, 0, d1);
    const step = wallRect(sd, t0 - (recess ? 0.2 : 0.15), t0 + w + (recess ? 0.2 : 0.15), d1, d1 + 0.36);
    bk.put(conc, 'steps', slab(land, -0.05, plan.entry.h0, 0.006));
    bk.put(conc, 'steps', slab(step, -0.05, plan.entry.h0 / 2, 0.006));
    out.solids.push(land, step);
  }

  // Porch lights by the entry and the patio door: a small coach light on the wall, where no opening is.
  for (const l of plan.lights) {
    const sd = sideOf.get(l.edge)!;
    const y = Math.min(1.95, H - 0.5);
    const at = (t: number, d: number): Vec2 => [sd.a[0] + sd.dir[0] * t + sd.out[0] * d, sd.a[1] + sd.dir[1] * t + sd.out[1] * d];
    const lp = at(l.t, 0.2);
    out.porchLights.push(new THREE.Vector3(lp[0], y, lp[1]));
    if (l.t < 0.3 || l.t > sd.len - 0.3) continue;
    if (plan.placed.some((o) => o.edge === l.edge && Math.abs(o.t - l.t) < o.w / 2 + 0.16)) continue;
    if (plan.chimney && plan.chimney.edge === l.edge && Math.abs(plan.chimney.t - l.t) < plan.chimney.w / 2 + 0.1) continue;
    bk.put(mats.handle, 'walls', segmentBox(at(l.t - 0.07, 0.07), at(l.t + 0.07, 0.07), 0.12, y - 0.16, y + 0.16), false);
    bk.put(glass, 'walls', segmentBox(at(l.t - 0.055, 0.135), at(l.t + 0.055, 0.135), 0.006, y - 0.12, y + 0.1), false);
  }
  roof.mesh?.geometry.dispose();
  bk.flush(out, s.id);
}
