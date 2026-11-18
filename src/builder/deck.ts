import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { featureById, materialById, type MaterialSpec } from '../siteplan/catalog';
import { DECK_DEFAULTS } from '../siteplan/decking';
import { deckTopOf, isBoardDeck } from '../siteplan/deckzone';
import { distToEdge, pointInPolygon, rng } from '../siteplan/geometry';
import type { FeaturePlacement, SitePlan, Vec2, Zone } from '../siteplan/types';
import { materialTextures } from '../engine/surfaces';
import { BOARD_TEX } from '../engine/deckboards';
import { deckLayout, longSideAngle, type BoardPiece, type DeckLayout } from './deck-layout';
import { dropDegenerate } from './hardscape';
import { pbrMaterial, plainMaterial } from './materials';

/**
 * Composite decks built board by board (a hardscape zone whose look is a maker's deck board, see siteplan/decking.ts):
 * the layout from deck-layout.ts, each board a solid with eased edges and its own run of grain, fascia on the sides,
 * the dark framing seen through the gaps, and framed openings for a hot tub. Anything else placed on a deck
 * stands on its boards (see `onDecks`); a hot tub in its opening stands at the deck's height unless the deck sets it down.
 */

const IN = 0.0254;

/**
 * Feature kinds that get their own framed opening in a deck (a hot tub). In it they stand on a pad at the deck's height,
 * the whole cabinet above the boards, as Green Lion builds them; a deck with `tub: 'sunk'` sets them down to the ground.
 */
const SET_IN: ReadonlySet<string> = new Set(['hotTub']);
/** Room left around a hot tub in its opening, meters (1/2 in). */
const TUB_CLEAR = 0.0127;

/** The footprint of a feature, turned as the features builder turns it. */
function footprintOf(f: FeaturePlacement, pad: number): Vec2[] | null {
  const spec = featureById.get(f.catalogId);
  if (!spec) return null;
  const [W, D] = spec.footprint;
  const a = (-f.rotationDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = W / 2 + pad, hd = D / 2 + pad;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Vec2[]).map(([x, z]) => [f.position[0] + x * c + z * s, f.position[1] - x * s + z * c] as Vec2);
}

/** The openings of a deck: its own cutouts and every hot tub whose center is on it. */
export function deckHoles(z: Zone, features: FeaturePlacement[]): Vec2[][] {
  return [...(z.deck?.holes ?? []).filter((h) => h.length >= 3), ...tubHoles(z, features)];
}

/** The opening of each hot tub whose center is on a deck: its footprint and the clearance around it. */
function tubHoles(z: Zone, features: FeaturePlacement[]): Vec2[][] {
  const out: Vec2[][] = [];
  for (const f of features) {
    const spec = featureById.get(f.catalogId);
    if (!spec || !SET_IN.has(spec.kind) || !pointInPolygon(f.position, z.polygon)) continue;
    const fp = footprintOf(f, TUB_CLEAR);
    if (fp) out.push(fp);
  }
  return out;
}

/** The board layout of a deck zone. */
export function layoutOf(z: Zone, features: FeaturePlacement[]): DeckLayout {
  const spec = materialById.get(z.catalogId)!;
  const b = spec.board!;
  const d = z.deck ?? {};
  return deckLayout({
    outline: z.polygon,
    holes: deckHoles(z, features),
    pattern: d.pattern ?? DECK_DEFAULTS.pattern,
    angle: d.angleDeg !== undefined ? (d.angleDeg * Math.PI) / 180 : longSideAngle(z.polygon),
    board: (d.boardIn ?? b.widthIn) * IN,
    gap: b.gapIn * IN,
    frame: d.frame ?? DECK_DEFAULTS.frame,
    divider: d.divider ?? false,
    seamOffset: d.seamOffset ?? 0,
    maxLength: Math.max(...b.lengthsFt) * 0.3048,
    underInset: (b.fasciaOverIn + b.fasciaIn[0]) * IN + 0.003,
  });
}

/**
 * A height function for things placed in the yard: on a deck it is the top of the boards, in one of its own cutouts and
 * elsewhere the ground's. A hot tub in its opening stands at the deck's height too, unless the deck sets it down
 * (`tub: 'sunk'`). Features and uploaded models stand on it.
 */
export function onDecks(plan: SitePlan, height: (p: Vec2) => number): (p: Vec2) => number {
  const decks = plan.zones
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => isBoardDeck(z))
    .map(({ z, i }) => ({ poly: z.polygon, holes: deckHoles(z, plan.features), tubs: z.deck?.tub === 'sunk' ? [] : tubHoles(z, plan.features), top: deckTopOf(z, i) }));
  if (!decks.length) return height;
  const inside = (p: Vec2, rings: Vec2[][]) => rings.some((o) => pointInPolygon(p, o));
  return (p) => {
    const h = height(p);
    for (const d of decks) {
      if (!pointInPolygon(p, d.poly)) continue;
      if (inside(p, d.tubs)) return Math.max(h, d.top);
      return inside(p, d.holes) ? h : Math.max(h, d.top);
    }
    return h;
  };
}

/** Narrowest width of a piece, roughly: its area over its length along the grain. */
function widthOf(p: BoardPiece): number {
  let lo = Infinity, hi = -Infinity, a = 0;
  for (let i = 0; i < p.ring.length; i++) {
    const q = p.ring[i], r = p.ring[(i + 1) % p.ring.length];
    const s = q[0] * p.dir[0] + q[1] * p.dir[1];
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
    a += q[0] * r[1] - r[0] * q[1];
  }
  return Math.abs(a / 2) / Math.max(1e-6, hi - lo);
}

/**
 * Board-local UVs (texture tiles: BOARD_TEX.along meters along the grain, BOARD_TEX.across across it) and one tint.
 * With `cavity`, the sides and eased edges of a board inside the deck are darkened by how far they face away from the
 * sky: they look into a 3/16 in gap between boards, which the renderer would otherwise light like an open face (the
 * gaps then read pale instead of as the dark lines the job photos show). Sides on the deck's outside edge (`exposed`
 * says which points are there) stay as they are.
 */
function boardUV(g: THREE.BufferGeometry, dir: Vec2, offU: number, offV: number, tint: number, vertical = false, cavity?: (p: Vec2) => boolean) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const along = x * dir[0] + z * dir[1];
    const across = vertical ? y : -x * dir[1] + z * dir[0];
    uv[i * 2] = (along + offU) / BOARD_TEX.along;
    uv[i * 2 + 1] = (across + offV) / BOARD_TEX.across;
    let k = tint;
    if (cavity && nor) {
      const ny = nor.getY(i);
      if (ny < 0.97 && !cavity([x, z])) k *= 0.22 + 0.78 * Math.max(0, Math.min(1, (ny - 0.3) / 0.67)) ** 1.5;
    }
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

/** One board: its piece outline from yTop down by its thickness, with eased (rounded) top edges. */
function boardGeometry(p: BoardPiece, yTop: number, T: number, ease: number): THREE.BufferGeometry | null {
  const shape = new THREE.Shape(p.ring.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = Math.min(ease, widthOf(p) / 4);
  if (!(b > 0.0002)) return null;
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.002, T - b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 1, steps: 1 });
  g.clearGroups();
  g.rotateX(Math.PI / 2);
  g.translate(0, yTop - b, 0);
  dropDegenerate(g);
  g.computeVertexNormals();
  return g;
}

/** A fascia board along a side: its face `over` meters in from the deck edge, from `y0` to `y1`, mitered by overlap. */
function fasciaGeometry(a: Vec2, b: Vec2, out: Vec2, over: number, thick: number, y0: number, y1: number): THREE.BufferGeometry {
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(d[0], d[1]);
  const ext = over + thick;
  const g = new THREE.BoxGeometry(L + 2 * ext, y1 - y0, thick).toNonIndexed();
  // Box local: x along the side, z out of the face. Placed with its outer face `over` in from the edge.
  const ang = Math.atan2(d[1], d[0]);
  const m = new THREE.Matrix4().makeRotationY(-ang);
  // Local +z must look outward: flip the box when the side's outward normal is the other way.
  const zDir = new THREE.Vector3(0, 0, 1).applyMatrix4(m);
  if (zDir.x * out[0] + zDir.z * out[1] < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const mid: Vec2 = [(a[0] + b[0]) / 2 - out[0] * (over + thick / 2), (a[1] + b[1]) / 2 - out[1] * (over + thick / 2)];
  m.setPosition(mid[0], (y0 + y1) / 2, mid[1]);
  g.applyMatrix4(m);
  return g;
}

export interface DeckBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  geos: THREE.BufferGeometry[];
}

/** Builds one composite deck zone. `index` is its place in plan.zones (for its top, see deckTopOf). */
export function buildDeck(z: Zone, index: number, plan: SitePlan): DeckBuild {
  const spec = materialById.get(z.catalogId) as MaterialSpec;
  const b = spec.board!;
  const group = new THREE.Group();
  group.name = `deck-${z.id}`;
  const geos: THREE.BufferGeometry[] = [];
  const top = deckTopOf(z, index);
  const T = b.thicknessIn * IN;
  const L = layoutOf(z, plan.features);
  const r = rng(`deck:${z.id}`);

  // Points on the deck's outside edge: the board sides there are open to the light (see boardUV).
  const edge = z.polygon;
  const exposed = (p: Vec2) => distToEdge(p, edge) < 0.004;
  // Boards: every piece its own solid, with its own stretch of grain and a slight tone of its own.
  const boards: THREE.BufferGeometry[] = [];
  for (const p of L.pieces) {
    const g = boardGeometry(p, top, T, b.easeIn * IN);
    if (!g) continue;
    const tone = 1 + (r() - 0.5) * b.boardTone;
    // Frame boards on a curve continue one board's grain from piece to piece.
    const offU = p.along !== undefined ? p.along : r() * BOARD_TEX.along;
    boardUV(g, p.dir, offU, r() * BOARD_TEX.across, tone, false, exposed);
    boards.push(g);
  }
  // Fascia: boards on edge along the open sides, under the frame's overhang, down to just below grade.
  if ((z.deck?.fascia ?? true) && top > T + 0.03) {
    const fh = top - T - 0.002;
    for (const f of L.fascia) {
      const fl = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      if (fl < 0.02) continue;
      const g = fasciaGeometry(f.a, f.b, f.out, b.fasciaOverIn * IN, b.fasciaIn[0] * IN, -0.02, fh);
      const dir: Vec2 = [(f.b[0] - f.a[0]) / fl, (f.b[1] - f.a[1]) / fl];
      boardUV(g, dir, r() * BOARD_TEX.along, r() * BOARD_TEX.across, 1 + (r() - 0.5) * b.boardTone, true);
      boards.push(g);
    }
  }
  if (boards.length) {
    const merged = mergeGeometries(boards, false);
    boards.forEach((g) => g.dispose());
    if (merged) {
      geos.push(merged);
      const mat = pbrMaterial(`deck:${spec.id}`, materialTextures(spec), { vertexColors: true });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `zone-${z.id}`;
      mesh.userData.itemId = z.id;
      mesh.userData.part = 'deck';
      mesh.userData.catalogId = z.catalogId;
      group.add(mesh);
    }
  }
  // The framing under the boards: dark, seen only through the gaps.
  const under: THREE.BufferGeometry[] = [];
  const uy = top - T - 0.004;
  if (uy > 0.004) {
    for (const u of L.under) {
      const shape = new THREE.Shape(u.ring.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const h of u.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: uy, bevelEnabled: false, curveSegments: 1 });
      g.clearGroups();
      g.rotateX(Math.PI / 2);
      g.translate(0, uy, 0);
      dropDegenerate(g);
      g.computeVertexNormals();
      under.push(g);
    }
  }
  if (under.length) {
    const ug = mergeGeometries(under, false);
    under.forEach((g) => g.dispose());
    if (ug) {
      geos.push(ug);
      const um = new THREE.Mesh(ug, plainMaterial('deck-under', { color: '#16120f', roughness: 1 }));
      um.receiveShadow = true;
      um.userData.itemId = z.id;
      um.userData.part = 'deck';
      um.userData.catalogId = z.catalogId;
      group.add(um);
    }
  }
  const surfaces = group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh && o.userData.part === 'deck');
  return { object: group, surfaces: surfaces.slice(0, 1), geos };
}
