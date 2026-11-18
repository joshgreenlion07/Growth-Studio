import * as THREE from 'three';
import { pointInPolygon } from '../../siteplan/geometry';
import type { LineItem, Vec2, Zone } from '../../siteplan/types';
import { segmentBox } from '../materials';
import { cedarNatural, IN, mat } from './kit';

/*
 * Green Lion's gray fence with a cedar lattice topper, as built on the job (its photos): board-on-board of 1x6 boards
 * painted a medium gray, two layers so no gap shows through, nailed to gray 2x4 rails between 4x4 natural cedar posts
 * at up to 8 ft. Above the boards (the fence height) a 1 ft band of diagonal cedar lattice in a cedar frame, and a flat
 * cedar 2x6 cap over posts and lattice. Posts and rails face the yard; the yard side is the side of the line the plan's
 * areas lie on (the left of the drawn direction when none do).
 */

type Put = (key: string, mat: THREE.Material, geo: THREE.BufferGeometry, shadow?: boolean) => void;

const POST = 3.5 * IN;
const BAY = 8 * 0.3048;
const BOARD_W = 5.5 * IN, BOARD_T = 0.625 * IN;
/** Board-on-board: each layer's boards on 8 in centers, the second layer over the first one's gaps. */
const BOARD_PITCH = 8 * IN;
const RAIL_H = 3.5 * IN, RAIL_T = 1.5 * IN;
export const TOPPER = 12 * IN;
const STOP = 1.5 * IN;
const CAP_W = 5.5 * IN, CAP_T = 1.5 * IN;

/** +1 when the yard (the plan's areas) is on the left of the line's drawn direction, -1 when on its right. */
export function yardSide(l: LineItem, zones: Zone[]): 1 | -1 {
  let vote = 0;
  for (let i = 0; i < l.points.length - 1; i++) {
    const a = l.points[i], b = l.points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    for (const t of [0.25, 0.5, 0.75]) {
      const m: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const inAny = (p: Vec2) => zones.some((z) => z.polygon.length >= 3 && pointInPolygon(p, z.polygon));
      if (inAny([m[0] + n[0] * 0.5, m[1] + n[1] * 0.5])) vote += len;
      if (inAny([m[0] - n[0] * 0.5, m[1] - n[1] * 0.5])) vote -= len;
    }
  }
  return vote < 0 ? -1 : 1;
}

let latticeTile: THREE.DataTexture | null = null;
/** Lattice alpha: 1 1/2 in strips at 45 degrees on 4 in centers both ways (green = solid), one 11.3 in tile. */
const LAT_TILE = 2 * 4 * Math.SQRT2 * IN;
function latticeAlpha(): THREE.DataTexture {
  if (latticeTile) return latticeTile;
  const N = 256, data = new Uint8Array(N * N * 4);
  const f = 1.5 / 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    const d1 = ((u + v) * 2) % 1, d2 = ((u - v + 2) * 2) % 1;
    const on = d1 < f || d2 < f;
    const o = (y * N + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = on ? 255 : 0;
    data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / LAT_TILE, 1 / LAT_TILE);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  latticeTile = t;
  return t;
}

let latticeMat: THREE.MeshStandardMaterial | null = null;
function latticeMaterial(): THREE.MeshStandardMaterial {
  if (latticeMat) return latticeMat;
  const set = cedarNatural();
  const map = set.map.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / set.tileMeters, 1 / set.tileMeters);
  map.needsUpdate = true;
  latticeMat = new THREE.MeshStandardMaterial({ map, alphaMap: latticeAlpha(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  return latticeMat;
}

/** One straight run a -> b of the fence, base at y0 (a little below grade), boards to `l.height`; `joined` when a run comes before it. */
export function grayBoardLattice(l: LineItem, a: Vec2, b: Vec2, y0: number, put: Put, side: 1 | -1, joined: boolean) {
  const H = l.height;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return;
  const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  // Across the run, + is toward the yard.
  const n: Vec2 = [-d[1] * side, d[0] * side];
  const P = (u: number, w: number): Vec2 => [a[0] + d[0] * u + n[0] * w, a[1] + d[1] * u + n[1] * w];
  const run = (u0: number, u1: number, w: number, thick: number, ya: number, yb: number) => segmentBox(P(u0, w), P(u1, w), thick, ya, yb);
  const gray = mat.painted(), board = mat.board(), cedar = mat.cedar();
  const top = H + TOPPER;
  const bays = Math.max(1, Math.ceil(len / BAY - 0.02));
  const posts: number[] = [];
  for (let k = 0; k <= bays; k++) posts.push((k / bays) * len);
  // Posts, centered on the line, to the underside of the cap.
  // A run after the first shares its first post with the run before.
  for (const u of posts) if (u > 0 || !joined) put('post', cedar, run(u - POST / 2, u + POST / 2, 0, POST, y0, top));
  // Boards: two layers on the neighbor's face of the rails.
  const wBack = -POST / 2 - BOARD_T / 2, wFront = wBack - BOARD_T;
  const yb0 = y0 + 0.1;
  for (let layer = 0; layer < 2; layer++) {
    const w = layer ? wFront : wBack;
    const start = layer ? BOARD_PITCH / 2 : 0;
    for (let u = start; u < len; u += BOARD_PITCH) {
      const u0 = Math.max(0, u), u1 = Math.min(len, u + BOARD_W);
      if (u1 - u0 > 0.01) put('boards', board, run(u0, u1, w, BOARD_T, yb0 + (((u * 97) % 1) * 0.004), H));
    }
  }
  // Gray rails between the posts on the yard side of the boards: low, middle and under the topper.
  for (let k = 0; k < bays; k++) {
    const u0 = posts[k] + POST / 2, u1 = posts[k + 1] - POST / 2;
    if (u1 - u0 < 0.05) continue;
    for (const y of [0.22, H * 0.5 - RAIL_H / 2, H - RAIL_H - 0.02]) put('rails', gray, run(u0, u1, -POST / 2 + RAIL_T / 2, RAIL_T, y, y + RAIL_H));
    // The lattice in its frame: a gray 2x4 trim on flat over the boards, cedar stops round the panel on both faces.
    put('lattice-sill', gray, run(u0, u1, -POST / 2 + 0.004, POST + 0.035, H, H + STOP));
    put('lattice-head', cedar, run(u0, u1, -0.01, STOP, top - STOP, top));
    put('lattice', latticeMaterial(), run(u0, u1, -0.012, 0.012, H + STOP, top - STOP), true);
    for (const w of [0.006, -0.03]) for (const u of [u0 + STOP / 2, u1 - STOP / 2]) put('lattice-stop', cedar, run(u - STOP / 2, u + STOP / 2, w, 0.019, H + STOP, top - STOP));
  }
  // The cap, one 2x6 on flat along the whole run.
  put('cap', cedar, run(0, len, -0.012, CAP_W, top, top + CAP_T));
}
