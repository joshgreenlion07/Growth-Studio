import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { centroid, distToEdge, pointInPolygon } from '../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../siteplan/types';
import { roofTile, stucco } from '../engine/textures';
import { pbrMaterial, plainMaterial, segmentBox } from './materials';
import { slab } from './hardscape';

/** Houses, garages and sheds: stucco walls, windows, doors and a tile roof. Covers: a patio roof on posts. */

export interface StructureBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  /** Window glass materials, lit at night. */
  glass: THREE.MeshStandardMaterial[];
  /** Porch light positions for night lighting. */
  porchLights: THREE.Vector3[];
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

/** Window positions along each wall: every ~3.4 m, skipping the corners. */
function openings(poly: Vec2[]): { a: Vec2; dir: Vec2; out: Vec2; len: number; edge: number }[] {
  const out: { a: Vec2; dir: Vec2; out: Vec2; len: number; edge: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Outward normal: whichever side of the wall's midpoint is outside.
    let o: Vec2 = [dir[1], -dir[0]];
    const mid: Vec2 = [(a[0] + b[0]) / 2 + o[0] * 0.05, (a[1] + b[1]) / 2 + o[1] * 0.05];
    if (pointInPolygon(mid, poly)) o = [-o[0], -o[1]];
    out.push({ a, dir, out: o, len, edge: i });
  }
  return out;
}

export function buildStructures(structures: ExistingStructure[], siteCenter: Vec2): StructureBuild {
  const group = new THREE.Group();
  group.name = 'structures';
  const surfaces: THREE.Mesh[] = [];
  const glassMats: THREE.MeshStandardMaterial[] = [];
  const porchLights: THREE.Vector3[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const wallMat = pbrMaterial('stucco', stucco());
  const roofMat = pbrMaterial('roof', roofTile());
  const trimMat = plainMaterial('trim', { color: '#ece8e0', roughness: 0.6 });
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
      const c = centroid(poly);
      const free = poly.map((p) => !houses.some((h) => pointInPolygon(p, h.polygon) || distToEdge(p, h.polygon) < 0.45));
      const allOpen = !free.some((f) => f);   // nothing free: treat every corner as a post corner
      const isFree = (i: number) => allOpen || free[i];
      const parts: THREE.BufferGeometry[] = [];
      const beams: THREE.BufferGeometry[] = [];
      const post = (p: Vec2) => {
        const d: Vec2 = [c[0] - p[0], c[1] - p[1]];
        const l = Math.hypot(d[0], d[1]) || 1;
        const q: Vec2 = [p[0] + (d[0] / l) * 0.22, p[1] + (d[1] / l) * 0.22];
        parts.push(segmentBox([q[0] - 0.15, q[1]], [q[0] + 0.15, q[1]], 0.3, -0.05, H - 0.26));
      };
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        if (isFree(i)) post(a);
        const openEdge = isFree(i) || isFree((i + 1) % n);
        if (!openEdge) continue;
        beams.push(segmentBox(a, b, 0.16, H - 0.28, H));
        // Long open sides get a post about every 4 m.
        if (isFree(i) && isFree((i + 1) % n)) {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const k = Math.ceil(len / 4.2);
          for (let j = 1; j < k; j++) post([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
        }
      }
      const pg = parts.length ? mergeGeometries(parts, false) : null;
      if (pg) {
        geos.push(pg);
        const pm = new THREE.Mesh(pg, wallMat);
        pm.castShadow = true;
        pm.receiveShadow = true;
        pm.userData.itemId = s.id;
        group.add(pm);
        surfaces.push(pm);
      }
      // The roof deck is tiled like the house roof; the beams keep the house trim color.
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
        const bm = new THREE.Mesh(bg, trimMat);
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

    // Windows and a sliding door on the wall facing the yard.
    const sides = openings(poly);
    let doorEdge = -1, best = -Infinity;
    sides.forEach((sd, i) => {
      const mid: Vec2 = [sd.a[0] + sd.dir[0] * sd.len / 2, sd.a[1] + sd.dir[1] * sd.len / 2];
      const toSite: Vec2 = [siteCenter[0] - mid[0], siteCenter[1] - mid[1]];
      const score = (toSite[0] * sd.out[0] + toSite[1] * sd.out[1]) + sd.len * 0.1;
      if (score > best) {
        best = score;
        doorEdge = i;
      }
    });
    const frames: THREE.BufferGeometry[] = [];
    const panes: THREE.BufferGeometry[] = [];
    const doors: THREE.BufferGeometry[] = [];
    // Doors and windows the designer marked: each goes on the wall nearest its mark.
    const marked = new Map<number, { t: number; w: number; h0: number; h1: number; solid?: boolean }[]>();
    let lit = false;
    for (const op of s.openings ?? []) {
      let bestSide = -1, bd = 3.0, bt = 0;
      sides.forEach((sd, i) => {
        const t = Math.max(0, Math.min(sd.len, (op.at[0] - sd.a[0]) * sd.dir[0] + (op.at[1] - sd.a[1]) * sd.dir[1]));
        const d = Math.hypot(op.at[0] - sd.a[0] - sd.dir[0] * t, op.at[1] - sd.a[1] - sd.dir[1] * t);
        if (d < bd) {
          bd = d;
          bestSide = i;
          bt = t;
        }
      });
      if (bestSide < 0) continue;
      const sd = sides[bestSide];
      const w = Math.min(op.width, sd.len - 0.3);
      if (w < 0.3) continue;
      const t = Math.max(w / 2 + 0.15, Math.min(sd.len - w / 2 - 0.15, bt));
      const top = Math.min(2.15, H - 0.25);
      const list = marked.get(bestSide) ?? [];
      // A door up to 1.5 m wide is a solid door; wider ones are sliding glass.
      list.push(op.kind === 'door' ? { t, w, h0: 0.02, h1: Math.min(2.1, top), solid: w <= 1.5 } : { t, w, h0: Math.min(0.95, top - 0.6), h1: top });
      marked.set(bestSide, list);
      if (op.kind === 'door' && !lit) {
        lit = true;
        for (const d of [-1, 1]) {
          const lp: Vec2 = [sd.a[0] + sd.dir[0] * (t + d * (w / 2 + 0.4)) + sd.out[0] * 0.08, sd.a[1] + sd.dir[1] * (t + d * (w / 2 + 0.4)) + sd.out[1] * 0.08];
          porchLights.push(new THREE.Vector3(lp[0], 2.0, lp[1]));
        }
      }
    }
    for (const sd of sides) {
      if (!s.openings && s.kind === 'shed' && sd.edge !== doorEdge) continue;
      const n = Math.max(1, Math.floor((sd.len - 1.2) / 3.4));
      const slots: { t: number; w: number; h0: number; h1: number; solid?: boolean }[] = [];
      if (s.openings) {
        slots.push(...(marked.get(sd.edge) ?? []));
      } else if (sd.edge === doorEdge) {
        slots.push({ t: sd.len / 2, w: s.kind === 'house' ? 2.4 : 1.0, h0: 0.02, h1: 2.1 });
        for (const d of [-1, 1]) {
          const lp: Vec2 = [sd.a[0] + sd.dir[0] * (sd.len / 2 + d * 1.6) + sd.out[0] * 0.08, sd.a[1] + sd.dir[1] * (sd.len / 2 + d * 1.6) + sd.out[1] * 0.08];
          porchLights.push(new THREE.Vector3(lp[0], 2.0, lp[1]));
        }
        for (let k = 0; k < n; k++) {
          const t = ((k + 0.5) / n) * sd.len;
          if (Math.abs(t - sd.len / 2) > 2.2) slots.push({ t, w: 1.5, h0: 0.95, h1: 2.15 });
        }
      } else if (s.kind === 'house') {
        for (let k = 0; k < n; k++) slots.push({ t: ((k + 0.5) / n) * sd.len, w: 1.4, h0: 0.95, h1: 2.15 });
      }
      for (const sl of slots) {
        const p0: Vec2 = [sd.a[0] + sd.dir[0] * (sl.t - sl.w / 2), sd.a[1] + sd.dir[1] * (sl.t - sl.w / 2)];
        const p1: Vec2 = [sd.a[0] + sd.dir[0] * (sl.t + sl.w / 2), sd.a[1] + sd.dir[1] * (sl.t + sl.w / 2)];
        const off = (p: Vec2, d: number): Vec2 => [p[0] + sd.out[0] * d, p[1] + sd.out[1] * d];
        (sl.solid ? doors : panes).push(segmentBox(off(p0, 0.01), off(p1, 0.01), 0.02, sl.h0, sl.h1));
        // Frame: four bars plus a center mullion.
        const bar = 0.06;
        frames.push(segmentBox(off(p0, 0.04), off(p1, 0.04), 0.06, sl.h1 - bar, sl.h1, bar));
        frames.push(segmentBox(off(p0, 0.04), off(p1, 0.04), 0.06, sl.h0, sl.h0 + bar, bar));
        const mid: Vec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        for (const q of sl.solid ? [p0, p1] : [p0, mid, p1]) {
          const qa: Vec2 = [q[0] - sd.dir[0] * bar / 2, q[1] - sd.dir[1] * bar / 2];
          const qb: Vec2 = [q[0] + sd.dir[0] * bar / 2, q[1] + sd.dir[1] * bar / 2];
          frames.push(segmentBox(off(qa, 0.04), off(qb, 0.04), 0.06, sl.h0, sl.h1));
        }
        if (sl.h0 > 0.5) frames.push(segmentBox(off(p0, 0.06), off(p1, 0.06), 0.1, sl.h0 - 0.05, sl.h0, 0.08));
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
    dispose() {
      for (const g of geos) g.dispose();
      glass.dispose();
    },
  };
}
