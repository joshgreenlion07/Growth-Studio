import * as THREE from 'three';
import type { PlantSpec } from '../../siteplan/catalog';
import { rng } from '../../siteplan/geometry';
import { GeoBuilder, card, tube } from '../geobuilder';

/**
 * Shared toolkit for the per-plant builders in this folder.
 *
 * Every catalog plant has its own file that exports `build(spec)`. A builder
 * returns geometry at MATURE size (spec.matureHeight x spec.matureSpread,
 * meters, base at the origin, +Y up). The vertex shader in engine/foliage.ts
 * scales it down for younger plants and reveals parts by their `birth`:
 *
 *  - birth  0..1  0 = present at install, 1 = appears only near maturity
 *  - anchor vec3  where the part grows out from (it collapses to this point
 *                 before its birth), usually the branch point or twig base
 *  - sway   0..1  wind bend weight: 0 at the ground, ~1 at the canopy edge
 *
 * Geometry is instanced: one build per catalog plant, any number of
 * placements. Keep it deterministic (seed `rng` from spec.id).
 */

export { GeoBuilder, card, tube, rng };
export type { PlantSpec };

export interface SpeciesLook {
  /** Leaf alpha cutoff, default 0.45. */
  alphaTest?: number;
  /** Leaf roughness, default 0.62. Waxy leaves (citrus, pittosporum) go lower. */
  leafRoughness?: number;
  /** Backlit glow through leaves, 0..1. Thin leaves ~0.45, succulents ~0.08. */
  translucency?: number;
  /** Wind bend at the canopy edge in meters, and leaf flutter in meters. */
  bend?: number;
  flutter?: number;
  /** Whether leaves and wood cast shadows (defaults: leaves yes, wood only for trees). */
  leafShadows?: boolean;
  woodShadows?: boolean;
  /**
   * Sheared hedge units: every placement is the same size (no random size)
   * and is turned so its local X axis runs along the row, toward its nearest
   * neighbor of the same plant, so a row reads as one clean hedge.
   */
  hedge?: boolean;
  /**
   * A vine trained on a support that is part of its model (a nursery trellis). The support keeps its own size, so
   * the model is not scaled up as the plant grows: it is shown at full size from the catalog's install size on and
   * grows only by its parts appearing at their birth (stems lengthening along the trellis, then past it). Below the
   * install size (a smaller container) it is scaled down. Every placement is the same size and stands with its back
   * (local -Z) to the nearest fence, wall or building wall (PlantBuildOptions.backing), else facing plan +y.
   */
  trained?: boolean;
}

export interface SpeciesGeo {
  wood?: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  flowers?: THREE.BufferGeometry;
  /**
   * Leaf texture with alpha. Vertex color multiplies it. `null` means no
   * texture (solid geometry such as grass blades or agave leaves).
   * Leaving it undefined uses the old shared atlas.
   */
  leafMap?: THREE.Texture | null;
  /** Texture for the `flowers` geometry (alpha cutout). */
  flowerMap?: THREE.Texture | null;
  /** Bark override for the `wood` geometry. Vertex color multiplies it. */
  bark?: { map: THREE.Texture; normalMap?: THREE.Texture };
  look?: SpeciesLook;
}

export type SpeciesBuilder = (spec: PlantSpec) => SpeciesGeo;

/* ------------------------------------------------------------------ */
/* Small math and color helpers                                         */
/* ------------------------------------------------------------------ */

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A THREE.Color from a hex string (sRGB), optionally scaled. */
export function col(hex: string, k = 1): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Pick between colors: t in 0..1 walks the list. */
export function mixCols(list: THREE.Color[], t: number): THREE.Color {
  if (list.length < 2) return list[0].clone();
  const x = clamp(t) * (list.length - 1);
  const i = Math.min(list.length - 2, Math.floor(x));
  return list[i].clone().lerp(list[i + 1], x - i);
}

/** Random hue, saturation and lightness shift, for natural leaf-to-leaf variety. */
export function jitter(c: THREE.Color, r: () => number, dh = 0.015, ds = 0.08, dl = 0.08): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h + (r() - 0.5) * 2 * dh + 1) % 1, clamp(hsl.s + (r() - 0.5) * 2 * ds), clamp(hsl.l + (r() - 0.5) * 2 * dl));
}

/** Any unit vector perpendicular to d. */
export function perp(d: THREE.Vector3): THREE.Vector3 {
  const a = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  return V().crossVectors(d, a).normalize();
}

/** Rotate `d` away from itself by `angle`, around a random or given azimuth. */
export function deflect(d: THREE.Vector3, angle: number, azimuth: number): THREE.Vector3 {
  const a = perp(d);
  const b = V().crossVectors(d, a).normalize();
  const side = a.multiplyScalar(Math.cos(azimuth)).addScaledVector(b, Math.sin(azimuth));
  return d.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle)).normalize();
}

/** Point and direction at fraction t along a polyline. */
export function along(pts: THREE.Vector3[], t: number): { p: THREE.Vector3; dir: THREE.Vector3; i: number } {
  const x = clamp(t) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(x));
  const p = pts[i].clone().lerp(pts[i + 1], x - i);
  const dir = pts[i + 1].clone().sub(pts[i]).normalize();
  return { p, dir, i };
}

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */

const texCache = new Map<string, THREE.Texture>();

/**
 * Paint a leaf or flower texture on a 2D canvas (transparent background) and
 * get a mipmapped cutout texture. Canvas top is v = 1, like any canvas
 * texture. Colors are bled outward into the transparent area so mipmaps and
 * the alpha cutout never show dark fringes.
 *
 * Paint either true colors (then use near-white vertex colors, which only
 * add shade and variety) or a light grayscale leaf that vertex color tints.
 */
export function leafTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  draw(g, w, h);
  const t = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  texCache.set(key, t);
  const finish = () => {
    const src = g.getImageData(0, 0, w, h).data;
    bleed(src, w, h, 12);
    // Flip rows so v = 1 is the canvas top.
    const out = t.image.data as Uint8Array;
    for (let y = 0; y < h; y++) out.set(src.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    t.needsUpdate = true;
  };
  // In a sliced yard build the readback and color bleed (the costly half) run as steps of their own (see
  // finishLeafTextures); anywhere else at once. Either way they are done before anything draws with the texture.
  if (deferring) unfinished.push(finish);
  else finish();
  return t;
}

let deferring = false;
const unfinished: (() => void)[] = [];

/**
 * While on, leaf textures painted by species builders leave their readback and color bleed for
 * finishLeafTextures, so building one species stays a short step. Turn it off before the yard is drawn.
 */
export function deferLeafTextures(on: boolean) {
  deferring = on;
}

/**
 * Finish every leaf texture still waiting, unless a sliced build is deferring them (it finishes them itself). Called
 * before a species model is handed out, so a model left by a cancelled build never draws with an unfinished texture.
 */
export function settleLeafTextures() {
  if (!deferring) while (unfinished.length) unfinished.shift()!();
}

/** Finish the leaf textures left by deferLeafTextures, one per step. */
export function* finishLeafTextures(): Generator<string, void, void> {
  while (unfinished.length) {
    unfinished.shift()!();
    yield 'leaf texture';
  }
}

/**
 * Spread the color of solid pixels into neighboring transparent and faint ones (alpha is kept): `passes` rings, each
 * taking the average color of its already filled 4-neighbors. Only the ring next to the filled area is visited on
 * each pass, not the whole image.
 */
function bleed(d: Uint8ClampedArray, w: number, h: number, passes: number) {
  const n = w * h;
  const filled = new Uint8Array(n);
  // Faint antialiased edge pixels hold unreliable color (canvas alpha is
  // premultiplied), so they take their color from solid neighbors too.
  for (let i = 0; i < n; i++) filled[i] = d[i * 4 + 3] >= 96 ? 1 : 0;
  // The first ring: unfilled pixels with a filled neighbor.
  const inRing = new Uint8Array(n);
  let ring: number[] = [];
  const consider = (i: number, list: number[]) => {
    if (filled[i] || inRing[i]) return;
    inRing[i] = 1;
    list.push(i);
  };
  for (let i = 0; i < n; i++) {
    if (!filled[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) consider(i - 1, ring);
    if (x < w - 1) consider(i + 1, ring);
    if (y > 0) consider(i - w, ring);
    if (y < h - 1) consider(i + w, ring);
  }
  for (let pass = 0; pass < passes && ring.length; pass++) {
    // Colors from the previous rings only: pixels filled in this ring are marked after it.
    for (const i of ring) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, gg = 0, b = 0, c = 0;
      if (x > 0 && filled[i - 1]) { r += d[(i - 1) * 4]; gg += d[(i - 1) * 4 + 1]; b += d[(i - 1) * 4 + 2]; c++; }
      if (x < w - 1 && filled[i + 1]) { r += d[(i + 1) * 4]; gg += d[(i + 1) * 4 + 1]; b += d[(i + 1) * 4 + 2]; c++; }
      if (y > 0 && filled[i - w]) { r += d[(i - w) * 4]; gg += d[(i - w) * 4 + 1]; b += d[(i - w) * 4 + 2]; c++; }
      if (y < h - 1 && filled[i + w]) { r += d[(i + w) * 4]; gg += d[(i + w) * 4 + 1]; b += d[(i + w) * 4 + 2]; c++; }
      d[i * 4] = r / c;
      d[i * 4 + 1] = gg / c;
      d[i * 4 + 2] = b / c;
    }
    for (const i of ring) filled[i] = 1;
    const next: number[] = [];
    for (const i of ring) {
      const x = i % w, y = (i / w) | 0;
      if (x > 0) consider(i - 1, next);
      if (x < w - 1) consider(i + 1, next);
      if (y > 0) consider(i - w, next);
      if (y < h - 1) consider(i + w, next);
    }
    ring = next;
  }
}

/**
 * An opaque, tiling bark texture painted on a canvas. `draw` should fill the
 * whole canvas; u wraps around the trunk, v runs up it.
 */
export function barkTexture(key: string, size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

/** UV rectangle [u0, v0, u1, v1] of cell i in a cols x rows atlas, cell 0 at the canvas top-left. */
export function uvCell(cols: number, rows: number, i: number): [number, number, number, number] {
  const cx = i % cols, cy = Math.floor(i / cols);
  return [cx / cols, 1 - (cy + 1) / rows, (cx + 1) / cols, 1 - cy / rows];
}

/**
 * Trace a leaf outline on a canvas, base at the origin, tip at (len, 0).
 * `widest` is where along the length the leaf is widest (0.3 ovate, 0.5
 * elliptic, 0.65 obovate). Fill or stroke it yourself.
 */
export function leafPath(g: CanvasRenderingContext2D, len: number, wid: number, widest = 0.4, tipSharp = 0.5) {
  const hw = wid / 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * widest * 0.5, -hw * 1.15, len * lerp(widest, 1, 0.35), -hw * 1.1, len, -hw * 0.02 * (1 - tipSharp));
  g.bezierCurveTo(len * lerp(widest, 1, 0.35), hw * 1.1, len * widest * 0.5, hw * 1.15, 0, 0);
  g.closePath();
}

/** Midrib and side veins for a leaf drawn with `leafPath`. Set strokeStyle and lineWidth first. */
export function leafVeins(g: CanvasRenderingContext2D, len: number, wid: number, pairs = 6, widest = 0.4) {
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.97, 0);
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1);
    const x = len * t;
    const reach = (wid / 2) * 0.85 * Math.sin(Math.PI * Math.pow(t, widest < 0.5 ? 0.7 : 1.3));
    for (const s of [-1, 1]) {
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + len * 0.07, s * reach * 0.6, x + len * 0.12, s * reach);
    }
  }
  g.stroke();
}

/* ------------------------------------------------------------------ */
/* Leaves as geometry                                                   */
/* ------------------------------------------------------------------ */

export interface LeafOpts {
  /** Lengthwise segments, 1 flat, 2+ lets the leaf curl. */
  segs?: number;
  /** Droop of the tip, in radians over the leaf length (positive bends down). */
  curl?: number;
  /** V-fold along the midrib, 0 flat .. 0.5 strongly folded. Uses 3 verts per row. */
  fold?: number;
  /** Blend the normal toward the direction from `center` (soft, rounded canopy shading). */
  center?: THREE.Vector3 | null;
  radii?: THREE.Vector3 | null;
  normalBend?: number;
  /** Sway at the base and tip of the leaf. */
  sway0?: number;
  sway1?: number;
}

/**
 * A leaf (or a sprig card) attached at its base: it starts at `base`, runs
 * `len` along `dir`, is `wid` wide, and faces `face` (roughly the leaf's upper
 * side). `uv` is [u0, v0, u1, v1] with the leaf base at v0 and the tip at v1.
 */
export function leafQuad(
  g: GeoBuilder,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  face: THREE.Vector3,
  len: number,
  wid: number,
  uv: [number, number, number, number],
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  o: LeafOpts = {},
) {
  const segs = o.segs ?? 1;
  const d = dir.clone().normalize();
  const side = V().crossVectors(d, face).normalize();
  if (side.lengthSq() < 0.01) side.copy(perp(d));
  let up = V().crossVectors(side, d).normalize();
  const fold = o.fold ?? 0;
  const cols = fold > 0 ? 3 : 2;
  const nb = o.normalBend ?? 0.6;
  const s0 = o.sway0 ?? 0.5, s1 = o.sway1 ?? s0;
  const p = base.clone();
  let prev: number[] | null = null;
  const step = len / segs;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    if (i > 0) {
      if (o.curl) {
        d.applyAxisAngle(side, -o.curl / segs).normalize();
        up = V().crossVectors(side, d).normalize();
      }
      p.addScaledVector(d, step);
    }
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const x = cols === 3 ? c / 2 - 0.5 : c - 0.5;
      const q = p.clone().addScaledVector(side, x * wid);
      if (fold > 0) q.addScaledVector(up, (Math.abs(x) * 2 - 0.5) * wid * fold);
      let n = up.clone();
      if (fold > 0 && x !== 0) n.addScaledVector(side, -Math.sign(x) * fold).normalize();
      if (o.center && o.radii) {
        const out = q.clone().sub(o.center);
        out.set(out.x / o.radii.x, out.y / o.radii.y, out.z / o.radii.z).normalize();
        n = n.multiplyScalar(1 - nb).addScaledVector(out, nb).normalize();
      }
      row.push(g.vert(q, n, lerp(uv[0], uv[2], x + 0.5), lerp(uv[1], uv[3], t), color, birth, anchor, lerp(s0, s1, t)));
    }
    if (prev) for (let c = 0; c < cols - 1; c++) g.quad(prev[c], prev[c + 1], row[c + 1], row[c]);
    prev = row;
  }
}

/* ------------------------------------------------------------------ */
/* Branch skeletons                                                     */
/* ------------------------------------------------------------------ */

export interface Branch {
  pts: THREE.Vector3[];
  /** Radius at the start and the end. */
  r0: number;
  r1: number;
  level: number;
  birth: number;
  length: number;
  parent: number;
}

export interface Tip {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  birth: number;
  level: number;
  radius: number;
  branch: number;
}

export interface StemSpec {
  base: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
  /** Tip radius as a fraction of the base radius, default 0.35. */
  taper?: number;
  segs?: number;
  /** Random wander per segment, 0 straight .. 0.6 gnarled. */
  gnarl?: number;
  /** Positive droops, negative turns up toward the light. */
  gravity?: number;
  birth?: number;
}

export interface LevelSpec {
  /** Children per parent branch (a number or [min, max]). */
  count: number | [number, number];
  /** Children attach between these fractions of the parent's length. */
  from?: number;
  to?: number;
  /** Angle away from the parent's direction, radians, and its random spread. */
  angle: number;
  angleVar?: number;
  /** Length as a fraction of the parent's length, with random spread. */
  length: number;
  lengthVar?: number;
  /** Length multiplier toward the parent's tip (1 = same, 0.4 = much shorter near the tip). */
  taperAlong?: number;
  /** Start radius as a fraction of the parent's radius where it attaches, default 0.55. */
  radius?: number;
  taper?: number;
  segs?: number;
  gnarl?: number;
  gravity?: number;
  /** Flatten children toward horizontal (0 none .. 1 fully level), for layered trees. */
  flatten?: number;
  /**
   * Chance a child is as old as its parent (so it exists at install when the
   * parent does). The rest fill in as the plant grows. Default 0.75.
   */
  early?: number;
}

/** Grow one bent stem as a polyline. */
export function growStem(r: () => number, s: StemSpec): THREE.Vector3[] {
  const segs = s.segs ?? 5;
  const pts = [s.base.clone()];
  const d = s.dir.clone().normalize();
  const p = s.base.clone();
  const gn = s.gnarl ?? 0.2, gr = s.gravity ?? 0;
  for (let i = 0; i < segs; i++) {
    d.x += (r() - 0.5) * gn;
    d.z += (r() - 0.5) * gn;
    d.y += (r() - 0.5) * gn * 0.6 - gr / segs;
    d.normalize();
    p.addScaledVector(d, s.length / segs);
    pts.push(p.clone());
  }
  return pts;
}

/**
 * Grow a branching skeleton: trunks first, then each level of children off
 * the level before it. Children are spaced along the parent and spiral
 * around it by the golden angle, like real branching. Returns every branch
 * plus the tips (ends of branches) where foliage goes.
 */
export function growSkeleton(r: () => number, trunks: StemSpec[], levels: LevelSpec[]): { branches: Branch[]; tips: Tip[] } {
  const branches: Branch[] = [];
  const tips: Tip[] = [];
  let current: number[] = [];
  for (const t of trunks) {
    const pts = growStem(r, t);
    branches.push({ pts, r0: t.radius, r1: t.radius * (t.taper ?? 0.35), level: 0, birth: t.birth ?? 0, length: t.length, parent: -1 });
    current.push(branches.length - 1);
  }
  levels.forEach((L, li) => {
    const next: number[] = [];
    for (const bi of current) {
      const parent = branches[bi];
      const n = typeof L.count === 'number' ? L.count : Math.round(lerp(L.count[0], L.count[1], r()));
      const from = L.from ?? 0.3, to = L.to ?? 0.95;
      let az = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? lerp(from, to, 0.5 + (r() - 0.5) * 0.5) : lerp(from, to, (k + r() * 0.7) / n);
        const at = along(parent.pts, t);
        az += 2.39996 + (r() - 0.5) * 0.6;
        const ang = L.angle + (r() - 0.5) * 2 * (L.angleVar ?? 0.15);
        const dir = deflect(at.dir, ang, az);
        if (L.flatten) dir.y = lerp(dir.y, 0.05, L.flatten);
        dir.normalize();
        const length = parent.length * L.length * (1 + (r() - 0.5) * 2 * (L.lengthVar ?? 0.2)) * lerp(1, L.taperAlong ?? 0.7, t);
        const rAt = lerp(parent.r0, parent.r1, t);
        const r0 = Math.min(rAt * 0.95, rAt * (L.radius ?? 0.55));
        // Most branches are as old as their parent; the rest fill in as the plant grows, outer ones last.
        const birth = r() < (L.early ?? 0.75) ? parent.birth : clamp(parent.birth + 0.12 + t * 0.3 + r() * 0.3, 0, 0.85);
        const pts = growStem(r, { base: at.p, dir, length, radius: r0, segs: L.segs ?? 4, gnarl: L.gnarl ?? 0.25, gravity: L.gravity ?? 0 });
        branches.push({ pts, r0, r1: r0 * (L.taper ?? 0.3), level: li + 1, birth, length, parent: bi });
        next.push(branches.length - 1);
      }
    }
    current = next;
  });
  branches.forEach((b, i) => {
    const a = b.pts[b.pts.length - 2], e = b.pts[b.pts.length - 1];
    tips.push({ p: e.clone(), dir: e.clone().sub(a).normalize(), birth: b.birth, level: b.level, radius: b.r1, branch: i });
  });
  return { branches, tips };
}

/**
 * Scale a skeleton so it fits the catalog size: the farthest branch end sits
 * `margin` meters inside spread / 2 and the highest `margin` below height
 * (leave the margin for the leaves that stick out past the twigs).
 */
export function fitSkeleton(sk: { branches: Branch[]; tips: Tip[] }, height: number, spread: number, margin = 0.1) {
  let maxR = 0.001, maxY = 0.001;
  for (const b of sk.branches) for (const p of b.pts) {
    maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    maxY = Math.max(maxY, p.y);
  }
  const sx = Math.max(0.05, spread / 2 - margin) / maxR, sy = Math.max(0.05, height - margin) / maxY;
  for (const b of sk.branches) {
    for (const p of b.pts) p.set(p.x * sx, p.y * sy, p.z * sx);
    b.length *= (sx + sy) / 2;
  }
  for (const t of sk.tips) {
    t.p.set(t.p.x * sx, t.p.y * sy, t.p.z * sx);
    t.dir.set(t.dir.x * sx, t.dir.y * sy, t.dir.z * sx).normalize();
  }
}

/** Turn a skeleton into tube geometry. `sway(p)` is the wind weight at a point. */
export function skeletonWood(
  g: GeoBuilder,
  branches: Branch[],
  o: { color?: THREE.Color | ((b: Branch) => THREE.Color); sides?: (b: Branch) => number; sway: (p: THREE.Vector3) => number; uvScale?: number; minRadius?: number },
) {
  for (const b of branches) {
    if (b.r0 < (o.minRadius ?? 0)) continue;
    const c = typeof o.color === 'function' ? o.color(b) : o.color ?? new THREE.Color(1, 1, 1);
    const sides = o.sides ? o.sides(b) : b.level === 0 ? 10 : b.level === 1 ? 7 : b.level === 2 ? 5 : 4;
    tube(g, b.pts, b.r0, b.r1, sides, c, b.birth, b.pts[0], (i) => o.sway(b.pts[i]), o.uvScale ?? 1);
  }
}

/** 0 deep inside an ellipsoid canopy .. 1 at its surface. Use it to darken inner leaves. */
export function canopyDepth(p: THREE.Vector3, center: THREE.Vector3, radii: THREE.Vector3): number {
  const x = (p.x - center.x) / radii.x, y = (p.y - center.y) / radii.y, z = (p.z - center.z) / radii.z;
  return clamp(Math.sqrt(x * x + y * y + z * z));
}

/** Triangle count of a geometry. */
export function triCount(g: THREE.BufferGeometry | undefined): number {
  if (!g) return 0;
  return (g.getIndex()?.count ?? 0) / 3;
}
