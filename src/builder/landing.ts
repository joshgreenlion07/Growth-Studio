import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById } from '../siteplan/catalog';
import { COPING_PROFILES, type CopingProfile } from '../siteplan/coronado';
import { pointInPolygon, signedArea } from '../siteplan/geometry';
import type { Clad, Vec2 } from '../siteplan/types';
import { chiseledCopingSet } from '../engine/coping-surfaces';
import { catalogMaterial, pbrMaterial } from './materials';

/*
 * A clad raised landing or flight of steps (Zone.clad, LineItem.clad): the paving stands on a block riser whose
 * exposed sides are faced in a wall veneer, and a coping runs along the top of each clad side, its back flush with the
 * paving's top and its nose the coping maker's overhang past the veneer (Coronado's Chiseled Stone Sill: 1 in). The
 * drawn outline is the veneer's face, as a landing is measured on site. Sides along a house, or against paving that is
 * as high or higher (the next riser up), are left plain: the paving runs to the edge there.
 *
 * The veneer is one upright face per clad side, its texture running on around the corners (u along the outline, v up,
 * in meters, as a wall's face); the riser behind it is never seen. The coping is swept along the clad sides to its
 * maker's profile, mitered where two clad sides meet and cut square where it stops, its rock face a little uneven along
 * its length, and its texture one 24 in piece per repeat from each corner, with a mortar joint at each piece's end.
 */

const IN = 0.0254;

/** A clad face resolved: the veneer look and its thickness (m), and the coping look and profile, if any. */
export interface CladLook {
  veneerId: string;
  veneerT: number;
  copingId?: string;
  coping: CopingProfile | null;
}

/** The look a Clad names (its coping, else the veneer's own edge coping), or null when the veneer is unknown. */
export function cladLook(c: Clad | undefined): CladLook | null {
  const v = c && materialById.get(c.veneer);
  if (!c || !v?.veneer) return null;
  const copingId = c.coping ?? v.veneer.edge;
  const coping = copingId && COPING_PROFILES[copingId] && materialById.has(copingId) ? COPING_PROFILES[copingId] : null;
  return { veneerId: v.id, veneerT: v.veneer.thicknessIn * IN, copingId: coping ? copingId : undefined, coping };
}

/** Something a side can stand against: a footprint and the top of what stands on it (a house: Infinity). */
export interface Blocker {
  poly: Vec2[];
  top: number;
}

/** Inward unit normals of a polygon's edges (edge i runs from poly[i] to poly[i + 1]). */
function inwardNormals(poly: Vec2[]): Vec2[] {
  const n = poly.length, ccw = signedArea(poly) > 0;
  const out = poly.map((a, i) => {
    const b = poly[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return (ccw ? [-t[1], t[0]] : [t[1], -t[0]]) as Vec2;
  });
  // The plan's y runs down the page: check the convention on the longest edge and flip every normal if it points out.
  let k = 0, best = 0;
  poly.forEach((a, i) => { const b = poly[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; k = i; } });
  const a = poly[k], b = poly[(k + 1) % n];
  const probe: Vec2 = [(a[0] + b[0]) / 2 + out[k][0] * 0.01, (a[1] + b[1]) / 2 + out[k][1] * 0.01];
  return pointInPolygon(probe, poly) ? out : out.map(([x, y]) => [-x, -y] as Vec2);
}

/** Where the lines of edges e0 and e1 (meeting at `p`), each moved inward by its own distance, cross. */
function offsetCorner(p: Vec2, t0: Vec2, n0: Vec2, d0: number, t1: Vec2, n1: Vec2, d1: number): Vec2 {
  const P: Vec2 = [p[0] + n0[0] * d0, p[1] + n0[1] * d0], Q: Vec2 = [p[0] + n1[0] * d1, p[1] + n1[1] * d1];
  const cr = t0[0] * t1[1] - t0[1] * t1[0];
  if (Math.abs(cr) < 1e-6) return Q;
  const s = ((Q[0] - P[0]) * t1[1] - (Q[1] - P[1]) * t1[0]) / cr;
  return [P[0] + t0[0] * s, P[1] + t0[1] * s];
}

/** The polygon with each edge moved inward by its own distance d[i] (mitered corners). */
export function offsetEdges(poly: Vec2[], d: number[]): Vec2[] {
  const n = poly.length, N = inwardNormals(poly);
  const T = poly.map((a, i) => { const b = poly[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as Vec2; });
  return poly.map((p, i) => { const e0 = (i - 1 + n) % n; return offsetCorner(p, T[e0], N[e0], d[e0], T[i], N[i], d[i]); });
}

/**
 * Which sides of a raised outline (top `top`, m) are exposed: those whose outside, just past the side's middle, is not
 * inside a house or inside paving at least as high.
 */
export function exposedEdges(poly: Vec2[], top: number, blockers: Blocker[]): boolean[] {
  const n = poly.length, N = inwardNormals(poly);
  return poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) return false;
    // Three probes along the side, 5 cm out: plain when most of it stands against something as high.
    let hit = 0;
    for (const f of [0.25, 0.5, 0.75]) {
      const q: Vec2 = [a[0] + (b[0] - a[0]) * f - N[i][0] * 0.05, a[1] + (b[1] - a[1]) * f - N[i][1] * 0.05];
      if (blockers.some((k) => k.top >= top - 0.01 && pointInPolygon(q, k.poly))) hit++;
    }
    return hit < 2;
  });
}

/** One clad face built: the paving's outline (inside the coping), and the veneer and coping meshes. */
export interface CladBuild {
  field: Vec2[];
  meshes: THREE.Mesh[];
  geos: THREE.BufferGeometry[];
}

/** A small smooth wobble (inches) for the coping's rock face along its length. */
const wobble = (s: number, y: number) => (Math.sin(s * 1.91 + y * 5.3) + Math.sin(s * 4.37 - y * 11.9) * 0.5 + Math.sin(s * 9.7 + y * 2.1) * 0.25) * 0.045;

/**
 * Clads a raised outline: the veneer on its exposed sides from just below the ground up to the coping's underside (or
 * the paving's, with no coping), and the coping along their tops. `top` is the paving's top (m), `paverT` the paving's
 * thickness, `ground` the grade under a point. Returns the outline the paving fills.
 */
export function cladFace(poly: Vec2[], exposed: boolean[], top: number, ground: (p: Vec2) => number, look: CladLook, paverT: number, itemId: string): CladBuild {
  const n = poly.length, N = inwardNormals(poly);
  const T = poly.map((a, i) => { const b = poly[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as Vec2; });
  const cp = look.coping;
  const back = cp ? (cp.depthIn - cp.overIn) * IN : look.veneerT;
  const field = offsetEdges(poly, exposed.map((e) => (e ? back : 0)));
  const vTop = cp ? top - cp.backIn * IN : top - paverT;

  // The veneer: one upright face per exposed side, facing out, u running on around the outline.
  const vPos: number[] = [], vNor: number[] = [], vUv: number[] = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (exposed[i]) {
      const y0 = Math.min(ground(a), ground(b)) - 0.03;
      const o: Vec2 = [-N[i][0], -N[i][1]];
      // A, B at the bottom, C, D at the top; wound so the face looks out.
      const quad: [Vec2, number, number][] = [[a, y0, along], [b, y0, along + len], [b, vTop, along + len], [a, vTop, along]];
      const order = (-T[i][1] * o[0] + T[i][0] * o[1]) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) {
        const [p, y, u] = quad[k];
        vPos.push(p[0], y, p[1]);
        vNor.push(o[0], 0, o[1]);
        vUv.push(u, y);
      }
    }
    along += len;
  }
  const meshes: THREE.Mesh[] = [], geos: THREE.BufferGeometry[] = [];
  if (vPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(vNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(vUv, 2));
    geos.push(g);
    const m = new THREE.Mesh(g, catalogMaterial(look.veneerId));
    m.castShadow = true;
    m.receiveShadow = true;
    Object.assign(m.userData, { itemId, part: 'riser', catalogId: look.veneerId });
    meshes.push(m);
  }

  // The coping, swept along each exposed side to its profile.
  if (cp && look.copingId) {
    const prof = cp.outline;
    // Profile arc length (m) for v; and which points are on the rock face (they wobble along the length).
    const arcV: number[] = [0];
    for (let k = 1; k < prof.length; k++) arcV.push(arcV[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]) * IN);
    const rock = prof.map(([x, y]) => x > 2.7 && y < 1.9 && y > -0.5);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      if (!exposed[i]) continue;
      const a = poly[i], b = poly[(i + 1) % n];
      const prev = (i - 1 + n) % n, next = (i + 1) % n;
      const o = (px: number) => -(px - (cp.depthIn - cp.overIn)) * IN; // inward distance of a profile point
      // Each profile point's line along the side: from its start (mitered with a clad side before, else square) to its end.
      const ends = prof.map(([px]) => {
        const d = o(px);
        const s = exposed[prev] ? offsetCorner(a, T[prev], N[prev], d, T[i], N[i], d) : ([a[0] + N[i][0] * d, a[1] + N[i][1] * d] as Vec2);
        const e = exposed[next] ? offsetCorner(b, T[i], N[i], d, T[next], N[next], d) : ([b[0] + N[i][0] * d, b[1] + N[i][1] * d] as Vec2);
        return [s, e] as [Vec2, Vec2];
      });
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len / IN));
      const P = prof.length, cols = steps + 1;
      const pos = new Float32Array(P * cols * 3), uv = new Float32Array(P * cols * 2);
      for (let j = 0; j <= steps; j++) {
        const f = j / steps;
        for (let k = 0; k < P; k++) {
          const [s, e] = ends[k];
          let x = s[0] + (e[0] - s[0]) * f, z = s[1] + (e[1] - s[1]) * f;
          const y = top + (prof[k][1] - cp.backIn) * IN;
          // Along the face (in), measured on the veneer's face line from the side's start.
          const at = len * f / IN;
          if (rock[k] && j > 0 && j < steps) {
            const w = wobble(at, prof[k][1]) * IN;
            x -= N[i][0] * w;
            z -= N[i][1] * w;
          }
          const q = (j * P + k) * 3;
          pos[q] = x; pos[q + 1] = y; pos[q + 2] = z;
          uv[(j * P + k) * 2] = at * IN;
          uv[(j * P + k) * 2 + 1] = arcV[k];
        }
      }
      const idx: number[] = [];
      // Wound so the outside of the profile faces out: the profile runs back-bottom, up the back, over the top, down the
      // front and back along the underside; with the side running along +T, that order is clockwise seen from its start.
      const flip = (-T[i][1] * -N[i][0] + T[i][0] * -N[i][1]) > 0;
      for (let j = 0; j < steps; j++) for (let k = 0; k < P; k++) {
        const k2 = (k + 1) % P;
        const A = j * P + k, B = j * P + k2, C = (j + 1) * P + k2, D = (j + 1) * P + k;
        if (flip) idx.push(A, B, C, A, C, D);
        else idx.push(A, C, B, A, D, C);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g.toNonIndexed());
      g.dispose();
      // Square ends (where the coping stops against a plain side): the profile filled.
      const tri = THREE.ShapeUtils.triangulateShape(prof.map(([x, y]) => new THREE.Vector2(x, y)), []);
      for (const [end, j] of [[!exposed[prev], 0], [!exposed[next], steps]] as [boolean, number][]) {
        if (!end) continue;
        const cpPos: number[] = [], cpUv: number[] = [];
        // Facing out of the end: back along the side at its start, on along it at its end.
        const want = j === 0 ? -1 : 1;
        const at = (k: number) => new THREE.Vector3(pos[(j * P + k) * 3], pos[(j * P + k) * 3 + 1], pos[(j * P + k) * 3 + 2]);
        for (const t3 of tri) {
          const [p0, p1, p2] = t3.map(at);
          const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
          const ks = (nrm.x * T[i][0] + nrm.z * T[i][1]) * want >= 0 ? t3 : [t3[0], t3[2], t3[1]];
          for (const k of ks) {
            const q = (j * P + k) * 3;
            cpPos.push(pos[q], pos[q + 1], pos[q + 2]);
            cpUv.push(prof[k][0] * IN, prof[k][1] * IN);
          }
        }
        const cg = new THREE.BufferGeometry();
        cg.setAttribute('position', new THREE.Float32BufferAttribute(cpPos, 3));
        cg.setAttribute('uv', new THREE.Float32BufferAttribute(cpUv, 2));
        cg.computeVertexNormals();
        parts.push(cg);
      }
    }
    const merged = parts.length ? mergeGeometries(parts, false) : null;
    parts.forEach((p) => p.dispose());
    if (merged) {
      geos.push(merged);
      const spec = materialById.get(look.copingId)!;
      const set = chiseledCopingSet(`coping-stone:${spec.id}`, spec.palette, cp.swatch, cp.lengthIn, cp.jointIn);
      const m = new THREE.Mesh(merged, pbrMaterial(`coping-stone:${spec.id}`, set));
      m.castShadow = true;
      m.receiveShadow = true;
      Object.assign(m.userData, { itemId, part: 'coping', catalogId: spec.id });
      meshes.push(m);
    }
  }
  return { field, meshes, geos };
}
