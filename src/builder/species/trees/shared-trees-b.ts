import * as THREE from 'three';
import { GeoBuilder, V, perp, type Branch } from '../kit';

/**
 * Geometry helpers shared by the trees-b plants (olive, citrus standard,
 * banana, elephant ear).
 */

export interface TubeVarOpts {
  /** How many times the texture wraps around (integer keeps it seamless). */
  uScale?: number;
  /** Radius multiplier by angle around the tube and ring index: flutes, lumps, root flare. */
  lump?: (theta: number, i: number) => number;
  /** Twist of the cross-section, radians per ring. */
  twist?: number;
  /** Close the far end with a cap. */
  cap?: boolean;
}

/**
 * A tube along a polyline with a radius and color per ring, a twist-free
 * (parallel transported) frame, and optional lumps. Texture density stays
 * even along the length whatever the radius.
 */
export function tubeVar(
  g: GeoBuilder,
  pts: THREE.Vector3[],
  radius: (i: number) => number,
  sides: number,
  color: (i: number) => THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: (i: number) => number,
  o: TubeVarOpts = {},
) {
  const uS = o.uScale ?? 1;
  const n = pts.length;
  let nrm = V();
  let v = 0;
  const rings: number[][] = [];
  const t = V(), bin = V();
  for (let i = 0; i < n; i++) {
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (i === 0) nrm = perp(t);
    else {
      nrm.addScaledVector(t, -nrm.dot(t));
      if (nrm.lengthSq() < 1e-6) nrm = perp(t);
      nrm.normalize();
    }
    bin.crossVectors(t, nrm).normalize();
    const rad = radius(i);
    if (i > 0) v += (pts[i].distanceTo(pts[i - 1]) / (2 * Math.PI * Math.max(0.004, rad))) * uS;
    const ring: number[] = [];
    const c = color(i);
    for (let s = 0; s <= sides; s++) {
      const th = (s / sides) * Math.PI * 2;
      const a = th + (o.twist ?? 0) * i;
      const dir = nrm.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      const k = o.lump ? o.lump(th, i) : 1;
      ring.push(g.vert(pts[i].clone().addScaledVector(dir, rad * k), dir, (s / sides) * uS, v, c, birth, anchor, sway(i)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) g.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]);
  if (o.cap) {
    const c = g.vert(pts[n - 1], t.clone(), 0.5, v, color(n - 1), birth, anchor, sway(n - 1));
    for (let s = 0; s < sides; s++) g.tri(rings[n - 1][s], rings[n - 1][s + 1], c);
  }
}

export interface SurfVert {
  p: THREE.Vector3;
  u: number;
  v: number;
  c: THREE.Color;
  sway: number;
}

/**
 * A curved sheet: (rows + 1) x (cols + 1) vertices from `f(i, j)`, with
 * smooth normals computed from the sheet itself (true normals, for big
 * individual leaves). Double-sided materials flip them for the back.
 */
export function gridSurface(g: GeoBuilder, rows: number, cols: number, f: (i: number, j: number) => SurfVert, birth: number, anchor: THREE.Vector3) {
  const vs: SurfVert[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) vs.push(f(i, j));
  const W = cols + 1;
  const nor = vs.map(() => V());
  const a = V(), b = V(), fn = V();
  const tris: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const q = [i * W + j, i * W + j + 1, (i + 1) * W + j + 1, (i + 1) * W + j];
      for (const [x, y, z] of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
        a.subVectors(vs[y].p, vs[x].p);
        b.subVectors(vs[z].p, vs[x].p);
        fn.crossVectors(a, b);
        nor[x].add(fn); nor[y].add(fn); nor[z].add(fn);
        tris.push(x, y, z);
      }
    }
  }
  const ids = vs.map((s, k) => {
    const nn = nor[k].lengthSq() > 1e-12 ? nor[k].normalize() : V(0, 1, 0);
    return g.vert(s.p, nn, s.u, s.v, s.c, birth, anchor, s.sway);
  });
  for (let k = 0; k < tris.length; k += 3) g.tri(ids[tris[k]], ids[tris[k + 1]], ids[tris[k + 2]]);
}

/** A low-poly ball (fruit). UVs wrap the given rectangle around it. */
export function ball(
  g: GeoBuilder, c: THREE.Vector3, rad: number, squash: number, uv: [number, number, number, number], color: THREE.Color,
  birth: number, anchor: THREE.Vector3, sway: number, segU = 9, segV = 6, spin = 0,
) {
  const rows: number[][] = [];
  for (let j = 0; j <= segV; j++) {
    const ph = (j / segV) * Math.PI;
    const row: number[] = [];
    for (let i = 0; i <= segU; i++) {
      const th = (i / segU) * Math.PI * 2 + spin;
      const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const p = V(c.x + n.x * rad, c.y + n.y * rad * squash, c.z + n.z * rad);
      row.push(g.vert(p, n, uv[0] + (uv[2] - uv[0]) * (i / segU), uv[3] + (uv[1] - uv[3]) * (j / segV), color, birth, anchor, sway));
    }
    rows.push(row);
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    if (j > 0) g.tri(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1]);
    if (j < segV - 1) g.tri(rows[j][i], rows[j + 1][i + 1], rows[j + 1][i]);
  }
}

/**
 * Scale finished geometry (positions and anchors) so its bounding box is
 * exactly `height` tall and `spread` wide. Use for plants built from big
 * individual leaves, where no skeleton can be fitted in advance.
 */
export function fitToSize(builders: GeoBuilder[], height: number, spread: number) {
  let maxY = 0.001, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const g of builders) {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]); maxX = Math.max(maxX, g.pos[i]);
      maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]); maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sx = spread / Math.max(0.001, maxX - minX, maxZ - minZ), sy = height / maxY;
  for (const g of builders) {
    for (const arr of [g.pos, g.anchor]) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] *= sx; arr[i + 1] *= arr[i + 1] > 0 ? sy : 1; arr[i + 2] *= sx;
      }
    }
  }
  return { sx, sy };
}

/** The ancestor of a branch at the given level (or the branch itself if it is lower). */
export function ancestor(branches: Branch[], b: Branch, level: number): Branch {
  let x = b;
  while (x.level > level && x.parent >= 0) x = branches[x.parent];
  return x;
}

/** Paint value noise speckle over a canvas area: cheap mottling for bark and leaves. */
export function speckle(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, n: number, colors: string[], min: number, max: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = min + r() * (max - min);
    g.fillRect(x + r() * w, y + r() * h, s, s * (0.6 + r() * 0.8));
  }
}
