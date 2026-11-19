import * as THREE from 'three';
import { MOW_CURB_SHAPES, type MowCurbShape } from '../siteplan/catalog';
import type { Vec2 } from '../siteplan/types';
import { pathEdge, type LinePath } from './linepath';

/*
 * A poured concrete mow curb (catalog `mow-curb-*`, shapes in MOW_CURB_SHAPES): its mold's cross-section swept along
 * the curb's path, the low side (the slant's front, the mower lip) toward the drawn line: the side of the surface that
 * matters more (the lawn), as linePath sets the body on the bed side of a lawn edge.
 */

const IN = 0.0254;
/** Segments in a rounded corner of the profile. */
const ARC_STEPS = 6;

/** A mold's outline in meters, [across from the front face, up from the base], foot of the front face to foot of the back, corners rounded. */
export function mowCurbOutline(shape: MowCurbShape): Vec2[] {
  const pts = MOW_CURB_SHAPES[shape].pts;
  const out: Vec2[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [x, y, r] = pts[k];
    if (!r || k === 0 || k === pts.length - 1) {
      out.push([x * IN, y * IN]);
      continue;
    }
    const P = [x, y], A = pts[k - 1], B = pts[k + 1];
    const la = Math.hypot(P[0] - A[0], P[1] - A[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const u1 = [(P[0] - A[0]) / la, (P[1] - A[1]) / la], u2 = [(B[0] - P[0]) / lb, (B[1] - P[1]) / lb];
    const turn = u1[0] * u2[1] - u1[1] * u2[0];
    const inner = Math.acos(Math.max(-1, Math.min(1, -(u1[0] * u2[0] + u1[1] * u2[1]))));
    // The tangent points sit t from the corner on each side, held to half of each side so neighboring roundings never cross.
    const t = Math.min(r / Math.tan(inner / 2), la / 2, lb / 2);
    const rr = t * Math.tan(inner / 2);
    const T1 = [P[0] - u1[0] * t, P[1] - u1[1] * t], T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
    const nl = turn > 0 ? [-u1[1], u1[0]] : [u1[1], -u1[0]];
    const C = [T1[0] + nl[0] * rr, T1[1] + nl[1] * rr];
    const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let j = 0; j <= ARC_STEPS; j++) {
      const a = a1 + (da * j) / ARC_STEPS;
      out.push([(C[0] + Math.cos(a) * rr) * IN, (C[1] + Math.sin(a) * rr) * IN]);
    }
  }
  return out;
}

/**
 * A solid of one cross-section swept along a path. `outline` is the section [across, up] in meters from the foot of the
 * front face over the top to the foot of the back face (the base, underground, is left open); across runs from the front,
 * the side toward the drawn line, to the back. `base[i]` is the height of the section's base at path point i. Normals are
 * smooth round the rounded corners and hard at sharp ones. UVs are meters: u along the drawn line (so control joints
 * cross the curb square on curves), v round the outline.
 */
export function profileGeometry(path: LinePath, outline: Vec2[], base: number[]): THREE.BufferGeometry {
  const n = path.pts.length, closed = path.closed, W = path.thick;
  const S = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(path.pts[i][0] - path.pts[i - 1][0], path.pts[i][1] - path.pts[i - 1][1]));

  // Which way the front faces: toward the drawn line, the opposite side from the body's offset. Where the body is centered
  // on the line (the same surface both sides) the front keeps the side it has nearest along the run, else the right side.
  const offs = path.dOut.concat(path.dIn).filter((d) => Math.abs(d) > 1e-4);
  const s0 = offs.length ? (offs[0] > 0 ? -1 : 1) : -1;
  const side = (d: number) => (d > 1e-4 ? -1 : d < -1e-4 ? 1 : s0);

  // The outline's rails: each vertex once where the section is smooth there, twice (one per face) at a sharp corner.
  type Rail = { x: number; y: number; v: number; n: [number, number] };
  const segN: [number, number][] = [];
  for (let k = 0; k + 1 < outline.length; k++) {
    const dx = outline[k + 1][0] - outline[k][0], dy = outline[k + 1][1] - outline[k][1], l = Math.hypot(dx, dy) || 1;
    segN.push([-dy / l, dx / l]);
  }
  const rails: Rail[] = [];
  let vlen = 0;
  const sharp = Math.cos((35 * Math.PI) / 180);
  for (let k = 0; k < outline.length; k++) {
    if (k > 0) vlen += Math.hypot(outline[k][0] - outline[k - 1][0], outline[k][1] - outline[k - 1][1]);
    const [x, y] = outline[k];
    const a = segN[k - 1], b = segN[k];
    if (a && b && a[0] * b[0] + a[1] * b[1] >= sharp) {
      const nx = a[0] + b[0], ny = a[1] + b[1], l = Math.hypot(nx, ny);
      rails.push({ x, y, v: vlen, n: [nx / l, ny / l] });
    } else {
      if (a) rails.push({ x, y, v: vlen, n: a });
      if (b) rails.push({ x, y, v: vlen, n: b });
    }
  }
  const edges = rails.map((r) => pathEdge(path, (d) => d + side(d) * (W / 2 - r.x)));

  // The drawn line's left normal arriving at and leaving each point.
  const segL = (i: number): Vec2 => {
    const a = path.pts[i], b = path.pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  const leftAt = (i: number, j: number, count: number): Vec2 => {
    const n1 = i > 0 ? segL(i - 1) : closed ? segL(n - 2) : null;
    const n2 = i < n - 1 ? segL(i) : closed ? segL(0) : null;
    if (count > 1) return (j === 0 ? n1 : n2) ?? (n1 ?? n2)!;
    if (n1 && n2) {
      const x = n1[0] + n2[0], z = n1[1] + n2[1], l = Math.hypot(x, z);
      return l > 1e-6 ? [x / l, z / l] : n2;
    }
    return (n1 ?? n2)!;
  };

  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  type V = { p: [number, number, number]; n: [number, number, number]; uv: [number, number] };
  const tri = (a: V, b: V, c: V) => {
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    const w = [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
    for (const q of cx * w[0] + cy * w[1] + cz * w[2] >= 0 ? [a, b, c] : [a, c, b]) {
      pos.push(...q.p);
      nrm.push(...q.n);
      uv.push(...q.uv);
    }
  };
  const quad = (a: V, b: V, c: V, d: V) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const vert = (k: number, i: number, j: number): V => {
    const g = edges[k][i], jj = j < 0 ? g.length - 1 : j, p = g[jj], r = rails[k];
    const L = leftAt(i, jj, g.length);
    const sd = side(jj === 0 && g.length > 1 ? path.dIn[i] : path.dOut[i]);
    // Across, front to back, is against the side the front faces.
    const ax = -sd * L[0], az = -sd * L[1];
    return { p: [p[0], base[i] + r.y, p[1]], n: [ax * r.n[0], r.n[1], az * r.n[0]], uv: [S[i], r.v] };
  };

  for (let k = 0; k + 1 < rails.length; k++) {
    const A = rails[k], B = rails[k + 1];
    if (Math.abs(A.x - B.x) < 1e-9 && Math.abs(A.y - B.y) < 1e-9) continue; // the two faces of a sharp corner
    for (let i = 0; i < n; i++) {
      if (!(closed && i === 0)) quad(vert(k, i, 0), vert(k, i, -1), vert(k + 1, i, -1), vert(k + 1, i, 0));
      if (i + 1 < n) quad(vert(k, i, -1), vert(k, i + 1, 0), vert(k + 1, i + 1, 0), vert(k + 1, i, -1));
    }
  }

  // The open ends: the section's face, the outline closed by its base.
  if (!closed) {
    const contour = outline.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const onRail = outline.map((_, k) => rails.findIndex((r) => Math.abs(r.x - outline[k][0]) < 1e-9 && Math.abs(r.y - outline[k][1]) < 1e-9));
    for (const [i, last] of [[0, false], [n - 1, true]] as [number, boolean][]) {
      const j = last ? i - 1 : i, c = path.pts[j], d = path.pts[j + 1];
      const len = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
      const out: [number, number, number] = [((d[0] - c[0]) / len) * (last ? 1 : -1), 0, ((d[1] - c[1]) / len) * (last ? 1 : -1)];
      const at = (k: number): V => {
        const g = edges[onRail[k]][i], p = last ? g[g.length - 1] : g[0];
        return { p: [p[0], base[i] + outline[k][1], p[1]], n: out, uv: [outline[k][0], outline[k][1]] };
      };
      for (const [a, b, c2] of tris) tri(at(a), at(b), at(c2));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** How far below grade a mow curb's base sits: its trench, or as much as leaves `reveal` (the plan's) of its top above grade. */
export function mowCurbSink(shape: MowCurbShape, reveal?: number): number {
  const S = MOW_CURB_SHAPES[shape];
  if (reveal === undefined || !isFinite(reveal)) return S.sinkIn * IN;
  return Math.max(0, Math.min(S.heightIn * IN - 0.004, S.heightIn * IN - reveal));
}
