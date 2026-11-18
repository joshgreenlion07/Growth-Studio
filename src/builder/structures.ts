import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { centroid, distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../siteplan/types';
import { roofTile, stucco } from '../engine/textures';
import { boxUV, catalogMaterial, pbrMaterial, plainMaterial, segmentBox } from './materials';
import { insetPolygon, slab } from './hardscape';
import { openingBoxes, planOpenings } from './openingplan';
import { COVER_FLOOR_ID, COVER_FLOOR_TOP, floorCuts, floorGeometry, floorPieces, type FloorGround } from './coverfloor';

/** Houses, garages and sheds: stucco walls, windows, doors and a tile roof. Covers: a patio roof on posts, on a concrete floor. */

export interface StructureBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  /** Window glass materials, lit at night. */
  glass: THREE.MeshStandardMaterial[];
  /** Porch light positions for night lighting. */
  porchLights: THREE.Vector3[];
  /** The covers' concrete floors: finished work, hidden with the paving in the construction views. */
  floors: THREE.Mesh[];
  /** Plan footprints of the covers' posts and walls (what stands on the floor), for keeping turf blades off them. */
  solids: Vec2[][];
  dispose(): void;
}

/** Oriented rectangle if the polygon is (close to) one. */
function asRect(poly: Vec2[]): { c: Vec2; ax: Vec2; w: number; d: number } | null {
  if (poly.length !== 4) return null;
  const e = (i: number): Vec2 => [poly[(i + 1) % 4][0] - poly[i][0], poly[(i + 1) % 4][1] - poly[i][1]];
  for (let i = 0; i < 4; i++) {
    const a = e(i), b = e((i + 1) % 4);
    const cos = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    if (Math.abs(cos) > 0.05) return null;
  }
  const a = e(0), b = e(1);
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const c = centroid(poly);
  return la >= lb ? { c, ax: [a[0] / la, a[1] / la], w: la, d: lb } : { c, ax: [b[0] / lb, b[1] / lb], w: lb, d: la };
}

/** Hip roof over an oriented rectangle, UVs in meters along the slope. */
function hipRoof(r: { c: Vec2; ax: Vec2; w: number; d: number }, y: number, overhang: number, pitch: number): THREE.BufferGeometry {
  const W = r.w / 2 + overhang, D = r.d / 2 + overhang;
  const rise = D * pitch;
  const ridge = Math.max(0, W - D);
  const P = (u: number, v: number, h: number) => new THREE.Vector3(r.c[0] + r.ax[0] * u - r.ax[1] * v, y + h, r.c[1] + r.ax[1] * u + r.ax[0] * v);
  const e = [P(-W, -D, 0), P(W, -D, 0), P(W, D, 0), P(-W, D, 0)];
  const k = [P(-ridge, 0, rise), P(ridge, 0, rise)];
  const pos: number[] = [], uv: number[] = [];
  const slope = Math.hypot(D, rise);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: [number, number], ub: [number, number], uc: [number, number]) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uv.push(...ua, ...ub, ...uc);
  };
  // Long faces (two triangles each), short faces (one triangle each).
  tri(e[0], k[0], e[1], [0, 0], [W - ridge, slope], [2 * W, 0]);
  tri(e[1], k[0], k[1], [2 * W, 0], [W - ridge, slope], [W + ridge, slope]);
  tri(e[2], k[1], e[3], [0, 0], [W - ridge, slope], [2 * W, 0]);
  tri(e[3], k[1], k[0], [2 * W, 0], [W - ridge, slope], [W + ridge, slope]);
  const sl2 = Math.hypot(W - ridge, rise);
  tri(e[1], k[1], e[2], [0, 0], [D, sl2], [2 * D, 0]);
  tri(e[3], k[0], e[0], [0, 0], [D, sl2], [2 * D, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // Make every face point up.
  const n = g.getAttribute('normal');
  if (n.getY(0) < 0) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), yy = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, yy, z);
      const uvA = g.getAttribute('uv') as THREE.BufferAttribute;
      const u1 = uvA.getX(i + 1), v1 = uvA.getY(i + 1);
      uvA.setXY(i + 1, uvA.getX(i + 2), uvA.getY(i + 2));
      uvA.setXY(i + 2, u1, v1);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** `ground`: the plan's zones and water, which replace a cover's concrete floor where drawn over it (coverfloor.ts). */
export function buildStructures(structures: ExistingStructure[], siteCenter: Vec2, ground: FloorGround = { zones: [], water: [] }): StructureBuild {
  const group = new THREE.Group();
  group.name = 'structures';
  const surfaces: THREE.Mesh[] = [];
  const glassMats: THREE.MeshStandardMaterial[] = [];
  const porchLights: THREE.Vector3[] = [];
  const floors: THREE.Mesh[] = [];
  const solids: Vec2[][] = [];
  const geos: THREE.BufferGeometry[] = [];
  const wallMat = pbrMaterial('stucco', stucco());
  const roofMat = pbrMaterial('roof', roofTile());
  // Painted fascia and soffit: flat paint, no whiter than the stucco. A near-white satin trim went past the bloom
  // threshold in full sun and read as a glowing bar along the eaves.
  const trimMat = plainMaterial('trim-matte', { color: '#d9d3c8', roughness: 0.92 });
  const frameMat = plainMaterial('frame', { color: '#2d2c2a', roughness: 0.5, metalness: 0.3 });
  const doorMat = plainMaterial('door', { color: '#4a3524', roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1b2226', roughness: 0.04, metalness: 0.0, envMapIntensity: 1.4, emissive: new THREE.Color('#ffb46a'), emissiveIntensity: 0 });
  glassMats.push(glass);

  const houses = structures.filter((x) => x.kind !== 'cover');
  for (const s of structures) {
    const poly = s.polygon;
    const H = s.height;
    if (s.kind === 'cover') {
      // A California patio: stucco columns at the corners away from the house, beams, and a solid flat roof.
      // With `walls`, a California room: solid stucco walls on the chosen edges, open (a header) on the rest.
      // Extra posts (`posts`) are optional. Without them, mid-span posts are left out (the header or beam spans the
      // open side) and only corners where both sides are open keep a column, so no roof corner is left floating.
      const c = centroid(poly);
      const n = poly.length;
      const free = poly.map((p) => !houses.some((h) => pointInPolygon(p, h.polygon) || distToEdge(p, h.polygon) < 0.45));
      const allOpen = !free.some((f) => f);   // nothing free: treat every corner as a post corner
      const isFree = (i: number) => allOpen || free[i];
      // An edge against a house wall never gets its own wall: the house's wall is already there.
      const againstHouse = (i: number) => {
        const a = poly[i], b = poly[(i + 1) % n];
        const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return !isFree(i) && !isFree((i + 1) % n) && houses.some((h) => pointInPolygon(m, h.polygon) || distToEdge(m, h.polygon) < 0.45);
      };
      const wall = (i: number) => !!s.walls?.[((i % n) + n) % n] && !againstHouse(((i % n) + n) % n);
      const room = s.room === true || poly.some((_, i) => wall(i));
      const openEdgeAt = (i: number) => isFree(((i % n) + n) % n) || isFree((((i + 1) % n) + n) % n);
      // Walls and headers are mitered into whichever neighbor along the outline is one too.
      const hasBand = (i: number) => wall(i) || (room && openEdgeAt(i));
      const posts = s.posts === true;
      const edgeLen = (i: number) => Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
      // With no posts along it, a room's header is deeper the farther it spans (0.4 m up to 4 m, about 0.55 m at 9 m).
      let longestOpen = 0;
      for (let i = 0; i < n; i++) if (!wall(i) && openEdgeAt(i)) longestOpen = Math.max(longestOpen, edgeLen(i));
      const headerD = posts ? 0.4 : Math.min(0.55, Math.max(0.4, 0.4 + (longestOpen - 4) * 0.03));
      const parts: THREE.BufferGeometry[] = [];
      const beams: THREE.BufferGeometry[] = [];
      const post = (p: Vec2) => {
        const d: Vec2 = [c[0] - p[0], c[1] - p[1]];
        const l = Math.hypot(d[0], d[1]) || 1;
        const q: Vec2 = [p[0] + (d[0] / l) * 0.22, p[1] + (d[1] / l) * 0.22];
        parts.push(segmentBox([q[0] - 0.15, q[1]], [q[0] + 0.15, q[1]], 0.3, -0.05, H - 0.26));
        solids.push([[q[0] - 0.15, q[1] - 0.15], [q[0] + 0.15, q[1] - 0.15], [q[0] + 0.15, q[1] + 0.15], [q[0] - 0.15, q[1] + 0.15]]);
      };
      // Room walls and headers sit inside the outline, their outer face on the edge.
      const WT = 0.2;
      const inner = room ? insetPolygon(poly, WT) : [];
      const inward = (i: number): Vec2 => {
        const a = poly[i], b = poly[(i + 1) % n];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        let o: Vec2 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
        if (!pointInPolygon([(a[0] + b[0]) / 2 + o[0] * 0.05, (a[1] + b[1]) / 2 + o[1] * 0.05], poly)) o = [-o[0], -o[1]];
        return o;
      };
      /** A prism along edge i, inside the outline: mitered where the next piece along the outline is one too, square otherwise. */
      const band = (i: number, joinPrev: boolean, joinNext: boolean, y0: number, y1: number) => {
        const j = (i + 1) % n, a = poly[i], b = poly[j], o = inward(i);
        const ai: Vec2 = joinPrev ? inner[i] : [a[0] + o[0] * WT, a[1] + o[1] * WT];
        const bi: Vec2 = joinNext ? inner[j] : [b[0] + o[0] * WT, b[1] + o[1] * WT];
        const g = slab([a, b, bi, ai], y0, y1, 0);
        if (y0 < 0.5) solids.push([a, b, bi, ai]);
        return boxUV(g.index ? g.toNonIndexed() : g);
      };
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (wall(i)) {
          // Ground to the roof deck. Corners where two walls meet are mitered into one.
          parts.push(band(i, hasBand(i - 1), hasBand(i + 1), -0.05, H));
          continue;
        }
        // A wall end stands in for the column at that corner; a corner open on both sides always keeps one.
        if (isFree(i) && !wall(i - 1)) post(a);
        if (!openEdgeAt(i)) continue;
        // A deeper header over the open side of a room, flush with the walls and joined to them. A patio beam with no
        // posts along it gets deeper with its span too.
        if (room) parts.push(band(i, hasBand(i - 1), hasBand(i + 1), H - headerD, H));
        else beams.push(segmentBox(a, b, 0.16, H - (posts ? 0.28 : Math.min(0.42, Math.max(0.28, len / 16))), H));
        // With posts on, long open sides get one about every 4 m.
        if (posts && isFree(i) && isFree((i + 1) % n)) {
          const k = Math.ceil(len / 4.2);
          for (let j = 1; j < k; j++) post([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
        }
      }
      const pg = parts.length ? mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false) : null;
      if (pg) {
        geos.push(pg);
        const pm = new THREE.Mesh(pg, wallMat);
        pm.castShadow = true;
        pm.receiveShadow = true;
        pm.userData.itemId = s.id;
        group.add(pm);
        surfaces.push(pm);
      }
      // A plain concrete floor over the footprint, just above grade: under the room it reads as a slab, not lawn.
      // Paving drawn there (an overlay, pavers, a deck) sits on top of it; beds, water and turf drawn for the cover
      // replace it (coverfloor.ts). Inside a house it is hidden in the walls.
      const floorGeo = floorGeometry(floorPieces(poly, floorCuts(poly, ground)), -0.05, COVER_FLOOR_TOP);
      geos.push(floorGeo);
      const floor = new THREE.Mesh(floorGeo, catalogMaterial(COVER_FLOOR_ID));
      floor.receiveShadow = true;
      floor.name = `cover-floor-${s.id}`;
      floor.userData.itemId = s.id;
      // The pointer reports the floor as concrete, not as the structure.
      floor.userData.part = 'floor';
      floor.userData.catalogId = COVER_FLOOR_ID;
      group.add(floor);
      surfaces.push(floor);
      floors.push(floor);
      // The roof deck is tiled like the house roof; the beams are painted stucco like the columns.
      const roofGeo = slab(poly, H, H + 0.16, 0);
      geos.push(roofGeo);
      const deck = new THREE.Mesh(roofGeo, roofMat);
      deck.castShadow = true;
      deck.receiveShadow = true;
      deck.userData.itemId = s.id;
      group.add(deck);
      surfaces.push(deck);
      const bg = beams.length ? mergeGeometries(beams.map((g) => g.toNonIndexed()), false) : null;
      if (bg) {
        geos.push(bg);
        const bm = new THREE.Mesh(bg, wallMat);
        bm.castShadow = true;
        bm.receiveShadow = true;
        bm.userData.itemId = s.id;
        group.add(bm);
        surfaces.push(bm);
      }
      continue;
    }
    const walls = slab(poly, -0.1, H, 0);
    geos.push(walls);
    const wm = new THREE.Mesh(walls, wallMat);
    wm.castShadow = true;
    wm.receiveShadow = true;
    wm.userData.itemId = s.id;
    group.add(wm);
    surfaces.push(wm);

    // Roof.
    const rect = asRect(poly);
    let roof: THREE.BufferGeometry;
    if (rect && s.roof === 'hip') roof = hipRoof(rect, H, 0.55, s.kind === 'shed' ? 0.4 : 0.36);
    else roof = slab(poly, H, H + 0.25, 0);
    geos.push(roof);
    // Every roof is tiled, flat ones too: a pale flat roof glares in full sun and washes out the view.
    const rm = new THREE.Mesh(roof, roofMat);
    rm.castShadow = true;
    rm.receiveShadow = true;
    group.add(rm);
    if (rect && s.roof === 'hip') {
      // Fascia and soffit.
      const W = rect.w / 2 + 0.55, D = rect.d / 2 + 0.55;
      const P = (u: number, v: number): Vec2 => [rect.c[0] + rect.ax[0] * u - rect.ax[1] * v, rect.c[1] + rect.ax[1] * u + rect.ax[0] * v];
      const ring = [P(-W, -D), P(W, -D), P(W, D), P(-W, D)];
      const fascia: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) fascia.push(segmentBox(ring[i], ring[(i + 1) % 4], 0.05, H - 0.2, H + 0.02, 0.03));
      const soffit = slab(ring, H - 0.2, H - 0.18, 0);
      fascia.push(soffit.toNonIndexed());
      const fg = mergeGeometries(fascia.map((g) => g.toNonIndexed()), false);
      if (fg) {
        geos.push(fg);
        const fm = new THREE.Mesh(fg, trimMat);
        fm.castShadow = true;
        group.add(fm);
      }
    }

    // Windows and a sliding door on the wall facing the yard, placed by openingplan.ts: each one flush on a wall face,
    // inside its edge with corner clearance, and never where a cover or another building stands against the wall.
    const plan = planOpenings(s, structures, siteCenter);
    const frames: THREE.BufferGeometry[] = [];
    const panes: THREE.BufferGeometry[] = [];
    const doors: THREE.BufferGeometry[] = [];
    const sideOf = new Map(plan.sides.map((sd) => [sd.edge, sd]));
    for (const l of plan.lights) {
      const sd = sideOf.get(l.edge)!;
      porchLights.push(new THREE.Vector3(sd.a[0] + sd.dir[0] * l.t + sd.out[0] * 0.08, 2.0, sd.a[1] + sd.dir[1] * l.t + sd.out[1] * 0.08));
    }
    for (const op of plan.placed) {
      for (const b of openingBoxes(sideOf.get(op.edge)!, op)) {
        const g = segmentBox(b.a, b.b, b.thick, b.y0, b.y1, b.extend);
        (b.kind === 'frame' ? frames : b.kind === 'door' ? doors : panes).push(g);
      }
    }
    // A house can have only doors, only windows, or no openings at all: merge only what exists.
    const fg = frames.length ? mergeGeometries(frames, false) : null;
    if (fg) {
      geos.push(fg);
      const fm = new THREE.Mesh(fg, frameMat);
      fm.castShadow = true;
      group.add(fm);
    }
    const pg = panes.length ? mergeGeometries(panes, false) : null;
    if (pg) {
      geos.push(pg);
      group.add(new THREE.Mesh(pg, glass));
    }
    const dg = doors.length ? mergeGeometries(doors, false) : null;
    if (dg) {
      geos.push(dg);
      group.add(new THREE.Mesh(dg, doorMat));
    }
  }

  return {
    object: group,
    surfaces,
    glass: glassMats,
    porchLights,
    floors,
    solids,
    dispose() {
      for (const g of geos) g.dispose();
      glass.dispose();
    },
  };
}
