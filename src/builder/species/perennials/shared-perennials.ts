import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, lerp, leafQuad, perp, rng, type LeafOpts } from '../kit';

/**
 * Helpers shared by the perennial builders (veronica, statice, seasonal
 * color, foxtail fern): curved stems, sheets with real normals for big wavy
 * leaves, small funnel flowers, crossed cards, and an exact fit to the
 * catalog size.
 */

type UV = [number, number, number, number];

/**
 * A stem that leaves `base` leaning `lean0` radians from vertical toward
 * azimuth `az` and ends leaning `lean1` (smaller turns up, larger arches over).
 */
export function arcPath(base: THREE.Vector3, az: number, lean0: number, lean1: number, len: number, segs: number, r?: () => number, wobble = 0): THREE.Vector3[] {
  const pts = [base.clone()];
  const p = base.clone();
  let a = az;
  for (let i = 0; i < segs; i++) {
    const lean = lerp(lean0, lean1, (i + 0.5) / segs) + (r ? (r() - 0.5) * wobble : 0);
    if (r) a += (r() - 0.5) * wobble;
    p.add(V(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean)).multiplyScalar(len / segs));
    pts.push(p.clone());
  }
  return pts;
}

/** A quadratic curve from a to b, pulled toward `ctrl`, as a polyline. */
export function bezPath(a: THREE.Vector3, ctrl: THREE.Vector3, b: THREE.Vector3, segs: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    pts.push(a.clone().multiplyScalar(u * u).addScaledVector(ctrl, 2 * u * t).addScaledVector(b, t * t));
  }
  return pts;
}

/**
 * A sheet from a grid of points (rows run base to tip, columns across), with
 * normals computed from the surface itself. For big leaves that wave and cup.
 * UV: u across the columns, v from v0 at row 0 to v1 at the last row.
 */
export function sheet(
  g: GeoBuilder,
  grid: THREE.Vector3[][],
  uv: UV,
  color: (row: number, colT: number) => THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: (row: number) => number,
) {
  const rows = grid.length, cols = grid[0].length;
  const ids: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const a = grid[Math.max(0, i - 1)][j], b = grid[Math.min(rows - 1, i + 1)][j];
      const c = grid[i][Math.max(0, j - 1)], d = grid[i][Math.min(cols - 1, j + 1)];
      const n = V().crossVectors(d.clone().sub(c), b.clone().sub(a)).normalize();
      if (n.lengthSq() < 0.5) n.set(0, 1, 0);
      if (n.y < 0) n.multiplyScalar(-1);
      row.push(g.vert(grid[i][j], n, lerp(uv[0], uv[2], j / (cols - 1)), lerp(uv[1], uv[3], i / (rows - 1)), color(i, j / (cols - 1)), birth, anchor, sway(i)));
    }
    ids.push(row);
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) g.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]);
}

/** `n` cards sharing one axis, fanned around it (a spike or tuft that reads from every side). */
export function crossCards(
  g: GeoBuilder,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  wid: number,
  uv: UV,
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  n: number,
  roll: number,
  o: LeafOpts = {},
) {
  const a = perp(dir), b = V().crossVectors(dir, a).normalize();
  for (let k = 0; k < n; k++) {
    const ang = roll + (k / n) * Math.PI;
    const face = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
    leafQuad(g, base, dir, face, len, wid, uv, color, birth, anchor, o);
  }
}

/**
 * A small open flower seen as a shallow funnel: a fan of `sides` triangles
 * around a sunken center, facing `normal`. The texture cell holds the flower
 * face-on, centered.
 */
export function funnelFlower(
  g: GeoBuilder,
  c: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  depth: number,
  uv: UV,
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: number,
  sides = 8,
  spin = 0,
) {
  const n = normal.clone().normalize();
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
  const mid = g.vert(c.clone().addScaledVector(n, -depth), n, um, vm, color, birth, anchor, sway);
  const ring: number[] = [];
  for (let k = 0; k < sides; k++) {
    const ang = spin + (k / sides) * Math.PI * 2;
    const out = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
    // Rim normals lean outward so the flower catches light like a shallow cup.
    const nn = n.clone().addScaledVector(out, 0.45).normalize();
    ring.push(g.vert(c.clone().addScaledVector(out, radius), nn, um + Math.cos(ang) * ur, vm + Math.sin(ang) * vr, color, birth, anchor, sway));
  }
  for (let k = 0; k < sides; k++) g.tri(mid, ring[k], ring[(k + 1) % sides]);
}

/** A flat card centered at `c` facing `normal` (flower heads seen from above). */
export function flatCard(g: GeoBuilder, c: THREE.Vector3, normal: THREE.Vector3, size: number, uv: UV, color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number, spin = 0) {
  const n = normal.clone().normalize();
  const a0 = perp(n), b0 = V().crossVectors(n, a0).normalize();
  const a = a0.clone().multiplyScalar(Math.cos(spin)).addScaledVector(b0, Math.sin(spin));
  const b = V().crossVectors(n, a).normalize();
  const h = size / 2;
  const i0 = g.vert(c.clone().addScaledVector(a, -h).addScaledVector(b, -h), n, uv[0], uv[1], color, birth, anchor, sway);
  const i1 = g.vert(c.clone().addScaledVector(a, h).addScaledVector(b, -h), n, uv[2], uv[1], color, birth, anchor, sway);
  const i2 = g.vert(c.clone().addScaledVector(a, h).addScaledVector(b, h), n, uv[2], uv[3], color, birth, anchor, sway);
  const i3 = g.vert(c.clone().addScaledVector(a, -h).addScaledVector(b, h), n, uv[0], uv[3], color, birth, anchor, sway);
  g.quad(i0, i1, i2, i3);
}

/**
 * Scale finished geometry so its bounding box is exactly the catalog size
 * (height from the ground, spread as the wider of x and z). Builders aim for
 * the right size already; this takes out the last few percent.
 */
export function fitToSize(parts: GeoBuilder[], height: number, spread: number) {
  let maxY = 1e-4, minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const g of parts) {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]); maxX = Math.max(maxX, g.pos[i]);
      maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]); maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sy = height / maxY, sx = spread / Math.max(1e-4, Math.max(maxX - minX, maxZ - minZ));
  for (const g of parts) {
    for (const arr of [g.pos, g.anchor]) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] *= sx;
        arr[i + 1] *= arr[i + 1] > 0 ? sy : 1;
        arr[i + 2] *= sx;
      }
    }
  }
}

/** Pale, faintly streaked stem surface; vertex color gives the stem its color. */
export function stemBark(): THREE.Texture {
  return barkTexture('perennial-stem', 64, (g, S) => {
    const r = rng('perennial-stem');
    g.fillStyle = '#e9e9e2';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 + r() * 0.3})` : `rgba(120,120,105,${0.1 + r() * 0.2})`;
      g.lineWidth = 0.6 + r();
      const x = r() * S;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (r() - 0.5) * 3, S);
      g.stroke();
    }
  });
}

/**
 * Trace a leaf with a toothed (serrate or wavy) edge, base at the origin and
 * tip at (len, 0). `teeth` per side; `depth` is tooth depth as a fraction of
 * the half width.
 */
export function toothedLeafPath(g: CanvasRenderingContext2D, len: number, wid: number, widest: number, teeth: number, depth: number) {
  const hw = wid / 2;
  const prof = (t: number) => {
    // Rises to 1 at `widest`, falls to a point at the tip.
    const a = t < widest ? Math.sin((t / widest) * Math.PI * 0.5) : Math.cos(((t - widest) / (1 - widest)) * Math.PI * 0.5);
    return Math.pow(Math.max(0, a), t < widest ? 0.8 : 1.15);
  };
  const N = teeth * 6;
  g.beginPath();
  g.moveTo(0, 0);
  for (const s of [-1, 1]) {
    for (let k = 1; k <= N; k++) {
      const t = s < 0 ? k / N : 1 - k / N;
      const ph = (t * teeth) % 1;
      const tooth = t > 0.1 && t < 0.95 ? 1 - depth * ph : 1;
      g.lineTo(len * t, s * hw * prof(t) * tooth);
    }
  }
  g.closePath();
}
