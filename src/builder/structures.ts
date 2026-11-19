import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { centroid, distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../siteplan/types';
import { resolveLook } from '../siteplan/houselooks';
import { houseRoof, houseStucco } from '../engine/house-surfaces';
import { boxUV, catalogMaterial, pbrMaterial, segmentBox } from './materials';
import { insetPolygon, slab } from './hardscape';
import { buildHouse, houseGlass, type HouseGround, type HouseOut } from './house';
import { COVER_FLOOR_ID, COVER_FLOOR_TOP, floorCuts, floorGeometry, floorPieces, type FloorGround } from './coverfloor';

/** Houses, garages and sheds (house.ts): stucco walls, windows, doors and a roof in their look. Covers: a patio roof on posts, on a concrete floor. */

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

/** `ground`: the plan's zones and water, which replace a cover's concrete floor where drawn over it (coverfloor.ts). */
export function buildStructures(structures: ExistingStructure[], siteCenter: Vec2, ground: FloorGround & Partial<HouseGround> = { zones: [], water: [] }): StructureBuild {
  const group = new THREE.Group();
  group.name = 'structures';
  const surfaces: THREE.Mesh[] = [];
  const glassMats: THREE.MeshStandardMaterial[] = [];
  const porchLights: THREE.Vector3[] = [];
  const floors: THREE.Mesh[] = [];
  const solids: Vec2[][] = [];
  const geos: THREE.BufferGeometry[] = [];
  // A cover takes the stucco and the roof of the house it is drawn with (the first one), so the two match.
  const host = resolveLook(structures.find((x) => x.kind === 'house')?.look);
  const wallMat = pbrMaterial(`house-wall:${host.wall.sw}`, houseStucco(), { color: host.wall.sw });
  const roofMat = pbrMaterial(`house-roof:${host.roof.id}:${host.roofColor.id}`, houseRoof(host.roof.id, host.roofColor.id), host.roof.id === 'metal' ? { metalness: host.roofColor.id === 'galvalume' ? 0.75 : 0.45 } : {});
  const glass = houseGlass();
  glassMats.push(glass);
  const houseOut: HouseOut = { group, surfaces, geos, porchLights, solids, glass };

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
    buildHouse(s, structures, siteCenter, { zones: ground.zones, lines: ground.lines }, glass, houseOut);
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
