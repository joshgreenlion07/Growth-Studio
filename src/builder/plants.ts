import * as THREE from 'three';
import { PLANTS, growthAt, plantById, sizeAt, type PlantSpec } from '../siteplan/catalog';
import { rng } from '../siteplan/geometry';
import type { PlantPlacement, Vec2 } from '../siteplan/types';
import { GLOBAL, foliageDepthMaterial, growthUniforms, patchFoliage, type FoliageOptions, type GrowthUniforms } from '../engine/foliage';
import { LEAF_CELL, aoDisc, bark, leafAtlas, leafCellUV } from '../engine/textures';
import { GeoBuilder, card, tube } from './geobuilder';

/**
 * Procedural plants. Each catalog plant becomes one geometry set at mature
 * size; every placement of it is an instance. Growth from install to
 * maturity happens in the vertex shader (see engine/foliage.ts).
 */

interface SpeciesGeo {
  wood?: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  flowers?: THREE.BufferGeometry;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function col(hex: string, k = 1) {
  return new THREE.Color(hex).multiplyScalar(k);
}

function tone(spec: PlantSpec, r: () => number, ao: number): THREE.Color {
  const c = col(spec.foliage).lerp(col(spec.foliage2), r());
  // Slight hue and value variety per cluster.
  c.multiplyScalar((0.85 + r() * 0.3) * ao);
  return c;
}

function randomQuat(r: () => number, outward?: THREE.Vector3, tilt = 1): THREE.Quaternion {
  const q = new THREE.Quaternion();
  if (outward) {
    // Face roughly outward, with a random spin and tilt.
    const z = outward.clone().normalize();
    const base = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), z);
    const spin = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), r() * Math.PI * 2);
    const wob = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * tilt, (r() - 0.5) * tilt, 0));
    return base.multiply(wob).multiply(spin);
  }
  return q.setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI));
}

/** A bent branch polyline from a, heading dir, of length len. */
function branchPts(a: THREE.Vector3, dir: THREE.Vector3, len: number, r: () => number, segs = 4, droop = 0.15): THREE.Vector3[] {
  const pts = [a.clone()];
  const d = dir.clone().normalize();
  const step = len / segs;
  const p = a.clone();
  for (let i = 0; i < segs; i++) {
    d.x += (r() - 0.5) * 0.35;
    d.z += (r() - 0.5) * 0.35;
    d.y += (r() - 0.5) * 0.2 - droop * (i / segs);
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* Trees                                                                */
/* ------------------------------------------------------------------ */

interface TreeShape {
  /** Conifers and columns: one central leader, foliage packed around it, no visible limbs. */
  spire?: boolean;
  trunks: number;
  trunkFrac: number;
  limbs: number;
  limbAngle: number;
  canopyCenter: number;
  canopyRy: number;
  clusters: number;
  cardSize: number;
  cell: number;
  cardsPerCluster: number;
}

function tree(spec: PlantSpec, shape: TreeShape): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const barkCol = col('#ffffff');
  const center = V(0, H * shape.canopyCenter, 0);
  const radii = V(Sp / 2, H * shape.canopyRy, Sp / 2);
  const tips: { p: THREE.Vector3; birth: number }[] = [];
  const trunkTop = H * shape.trunkFrac;
  const swayAt = (y: number) => Math.pow(Math.max(0, y) / H, 2) * 1.2;

  if (shape.spire) {
    const pts = [V(0, -0.15, 0), V(0, H * 0.45, 0), V(0, H * 0.9, 0)];
    const r0 = Math.max(0.03, H * 0.012);
    tube(wood, pts, r0, r0 * 0.3, 7, barkCol, 0, V(0, 0, 0), (i) => swayAt(pts[i].y) * 0.4, 2);
    for (let k = 0; k <= 12; k++) tips.push({ p: V(0, H * (0.08 + 0.85 * (k / 12)), 0), birth: 0 });
  }
  for (let t = 0; t < (shape.spire ? 0 : shape.trunks); t++) {
    const lean = shape.trunks > 1 ? V(Math.cos((t / shape.trunks) * 6.28 + 0.4) * 0.28, 1, Math.sin((t / shape.trunks) * 6.28 + 0.4) * 0.28) : V((r() - 0.5) * 0.06, 1, (r() - 0.5) * 0.06);
    const pts = branchPts(V(0, -0.15, 0), lean, trunkTop + 0.15, r, 5, 0);
    const r0 = H * (shape.trunks > 1 ? 0.014 : 0.024);
    tube(wood, pts, r0, r0 * 0.7, 9, barkCol, 0, V(0, 0, 0), (i) => swayAt(pts[i].y) * 0.4, 2);
    const top = pts[pts.length - 1];
    for (let l = 0; l < shape.limbs; l++) {
      const az = (l / shape.limbs) * Math.PI * 2 + r() * 0.8 + t;
      const ang = shape.limbAngle * (0.8 + r() * 0.4);
      const dir = V(Math.cos(az) * Math.sin(ang), Math.cos(ang), Math.sin(az) * Math.sin(ang));
      const len = Math.max(Sp * 0.32, (H - trunkTop) * 0.55) * (0.75 + r() * 0.4);
      const lp = branchPts(top, dir, len, r, 4, 0.1);
      tube(wood, lp, r0 * 0.62, r0 * 0.22, 7, barkCol, 0.02, top, (i) => swayAt(lp[i].y) * 0.6, 1.5);
      // Second-order branches.
      for (let k = 1; k < lp.length; k++) {
        if (r() < 0.25) continue;
        const sdir = dir.clone().add(V((r() - 0.5) * 1.4, 0.3 + r() * 0.5, (r() - 0.5) * 1.4)).normalize();
        const slen = len * (0.35 + r() * 0.35);
        const sp = branchPts(lp[k], sdir, slen, r, 3, 0.2);
        const birth = r() < 0.6 ? 0 : 0.1 + (k / lp.length) * 0.3 + r() * 0.15;
        tube(wood, sp, r0 * 0.2, r0 * 0.06, 5, barkCol, birth, lp[k], (i) => swayAt(sp[i].y) * 0.8, 1);
        tips.push({ p: sp[sp.length - 1], birth });
      }
      tips.push({ p: lp[lp.length - 1], birth: 0.05 });
    }
  }

  // Leaf clusters fill the canopy volume, inner ones first.
  const [u0, v0, u1, v1] = leafCellUV(shape.cell);
  for (let i = 0; i < shape.clusters; i++) {
    // Point in the ellipsoid shell, biased outward.
    let p = V();
    let d = 0;
    for (let tries = 0; tries < 8; tries++) {
      p = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      d = p.length();
      if (d <= 1 && d > 0.25) break;
    }
    const rs = Math.min(1, d);
    const out = p.clone().normalize();
    const world = V(p.x * radii.x, p.y * radii.y, p.z * radii.z).add(center);
    if (spec.form === 'conifer' || spec.form === 'columnarTree') {
      // Taper toward the top: a cone for conifers, a narrow spire for columns.
      const h01 = THREE.MathUtils.clamp((world.y - center.y) / radii.y * 0.5 + 0.5, 0, 1);
      const k = spec.form === 'conifer' ? 1.05 - h01 : 1.1 - h01 * h01 * 0.8;
      world.x *= k;
      world.z *= k;
    }
    if (world.y < trunkTop * 0.85) world.y = trunkTop * 0.85 + r() * 0.3;
    // Nearest branch tip is where this cluster grows from.
    let best = tips[0];
    let bd = Infinity;
    for (const t of tips) {
      const dd = t.p.distanceToSquared(world);
      if (dd < bd) {
        bd = dd;
        best = t;
      }
    }
    // Most foliage is there at install (a small but full nursery canopy);
    // about a third fills in as the tree grows, outer clusters last.
    const birth = r() < 0.66 ? 0 : Math.min(0.85, 0.15 + rs * 0.5 + r() * 0.2);
    const anchor = best ? best.p.clone().lerp(world, 0.25) : center.clone();
    const ao = 0.48 + 0.52 * Math.pow(rs, 1.4);
    const under = 0.78 + 0.22 * THREE.MathUtils.clamp((world.y - center.y) / radii.y * 0.5 + 0.5, 0, 1);
    const c = tone(spec, r, ao * under);
    for (let k = 0; k < shape.cardsPerCluster; k++) {
      const off = V((r() - 0.5), (r() - 0.5), (r() - 0.5)).multiplyScalar(shape.cardSize * 0.7);
      const q = randomQuat(r, out.clone().add(V((r() - 0.5) * 1.2, (r() - 0.2) * 0.8, (r() - 0.5) * 1.2)), 1.2);
      const s = shape.cardSize * (0.75 + r() * 0.5);
      card(leaves, world.clone().add(off), q, s, s, [u0, v0, u1, v1], c, birth, anchor, swayAt(world.y) + 0.35, center, radii);
    }
  }
  return { wood: wood.build(), leaves: leaves.build() };
}

/* ------------------------------------------------------------------ */
/* Shrubs and groundcover                                              */
/* ------------------------------------------------------------------ */

function shrub(spec: PlantSpec, flowers: boolean, flat = false): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flw = new GeoBuilder();
  const wood = new GeoBuilder();
  const center = V(0, flat ? H * 0.4 : H * 0.52, 0);
  const radii = V(Sp / 2, flat ? H * 0.6 : H * 0.52, Sp / 2);
  const cardSize = flat ? Sp * 0.28 : Math.max(0.22, Sp * 0.36);
  const clusters = flat ? 48 : Math.round(36 + Sp * 30);
  const [u0, v0, u1, v1] = leafCellUV(LEAF_CELL.small);
  const [fu0, fv0, fu1, fv1] = leafCellUV(LEAF_CELL.flower);
  const swayAt = (y: number) => Math.min(1, Math.max(0, y) / H) * 0.6;

  // A few stems so the base doesn't float.
  if (!flat) {
    for (let s = 0; s < 6; s++) {
      const az = r() * Math.PI * 2;
      const pts = branchPts(V(0, -0.02, 0), V(Math.cos(az) * 0.5, 1, Math.sin(az) * 0.5), H * 0.55, r, 3, 0);
      tube(wood, pts, 0.012, 0.004, 4, col('#ffffff'), 0, V(), (i) => swayAt(pts[i].y), 1);
    }
  }

  for (let i = 0; i < clusters; i++) {
    let p = V();
    let d = 0;
    for (let tries = 0; tries < 10; tries++) {
      p = V(r() * 2 - 1, flat ? r() * 1.6 - 1 : r() * 2 - 1, r() * 2 - 1);
      d = p.length();
      if (d <= 1 && d > 0.2) break;
    }
    const world = V(p.x * radii.x, Math.max(0.03, p.y * radii.y + center.y), p.z * radii.z);
    const out = p.clone().normalize();
    const ao = 0.5 + 0.5 * Math.pow(Math.min(1, d), 1.3);
    const c = tone(spec, r, ao);
    const birth = r() < 0.7 ? 0 : Math.min(0.8, 0.15 + d * 0.4 + r() * 0.2);
    const anchor = world.clone().multiplyScalar(0.3);
    const n = flat ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const q = flat
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (r() - 0.5) * 0.9, r() * 6.28, (r() - 0.5) * 0.9, 'YXZ'))
        : randomQuat(r, out.clone().add(V((r() - 0.5), (r() - 0.3), (r() - 0.5))), 1.3);
      const s = cardSize * (0.7 + r() * 0.6);
      card(leaves, world.clone().add(V((r() - 0.5) * s * 0.5, (r() - 0.5) * s * 0.4, (r() - 0.5) * s * 0.5)), q, s, s, [u0, v0, u1, v1], c, birth, anchor, swayAt(world.y) + 0.2, center, radii);
    }
    if (flowers && spec.flower && d > 0.55 && (flat ? r() < 0.35 : r() < 0.55) && world.y > H * 0.25) {
      const fc = col(spec.flower, 0.9 + r() * 0.2);
      const q = randomQuat(r, out, 0.8);
      const s = cardSize * (flat ? 0.5 : 0.65);
      card(flw, world.clone().addScaledVector(out, s * 0.25), q, s, s, [fu0, fv0, fu1, fv1], fc, Math.max(0.15, birth), anchor, swayAt(world.y) + 0.25, center, radii, 0.5);
    }
  }
  return { wood: flat ? undefined : wood.build(), leaves: leaves.build(), flowers: flw.count ? flw.build() : undefined };
}

/* ------------------------------------------------------------------ */
/* Grasses and perennials                                              */
/* ------------------------------------------------------------------ */

function blade(g: GeoBuilder, base: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, arch: number, c0: THREE.Color, c1: THREE.Color, birth: number, segs = 5) {
  const side = V().crossVectors(dir, UP).normalize();
  if (side.lengthSq() < 0.1) side.set(1, 0, 0);
  let prev: number[] | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = base.clone().addScaledVector(dir, len * t);
    p.y = base.y + len * t * (1 - arch * t * 0.9);
    const out = V(dir.x, 0, dir.z).normalize().multiplyScalar(len * arch * t * t * 0.6);
    p.add(out);
    const w = width * (1 - t * 0.85);
    const c = c0.clone().lerp(c1, t * t);
    const n = V().crossVectors(side, dir).normalize().lerp(UP, 0.6).normalize();
    const a = g.vert(p.clone().addScaledVector(side, -w / 2), n, 0, t, c, birth, base, t * t);
    const b = g.vert(p.clone().addScaledVector(side, w / 2), n, 1, t, c, birth, base, t * t);
    if (prev) g.quad(prev[0], prev[1], b, a);
    prev = [a, b];
  }
}

function grass(spec: PlantSpec): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const plumes = new GeoBuilder();
  const base0 = col(spec.foliage2, 0.55), tip0 = col(spec.foliage, 1.05);
  for (let i = 0; i < 220; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * Sp * 0.12;
    const base = V(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    const lean = 0.15 + (rr / (Sp * 0.12)) * 0.55 + r() * 0.2;
    const dir = V(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    const len = H * (0.55 + r() * 0.45);
    const tint = r();
    blade(g, base, dir, len, 0.014, 0.35 + lean * 0.5, base0.clone().multiplyScalar(0.8 + tint * 0.4), tip0.clone().lerp(col('#d8cf98'), tint * 0.35), 0);
  }
  if (spec.flower) {
    const [u0, v0, u1, v1] = leafCellUV(LEAF_CELL.needle);
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const lean = 0.1 + r() * 0.25;
      const dir = V(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
      const len = H * (1.0 + r() * 0.2);
      blade(g, V(), dir, len * 0.85, 0.006, 0.1, col(spec.foliage2, 0.7), col(spec.flower, 0.9), 0.55, 4);
      const top = V().addScaledVector(dir, len);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.28, (r() - 0.5) * 0.3));
      card(plumes, top, q, H * 0.07, H * 0.3, [u0, v0, u1, v1], col(spec.flower).multiplyScalar(0.8), 0.6, V(0, top.y * 0.6, 0), 1.0, null, null);
    }
  }
  return { leaves: g.build(), flowers: plumes.count ? plumes.build() : undefined };
}

function perennial(spec: PlantSpec): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const fl = new GeoBuilder();
  const c0 = col(spec.foliage2, 0.6), c1 = col(spec.foliage);
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * Sp * 0.2;
    const lean = 0.5 + r() * 0.6;
    const dir = V(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    blade(g, V(Math.cos(a) * rr, 0, Math.sin(a) * rr), dir, H * (0.3 + r() * 0.25), 0.012, 0.35, c0, c1, 0, 3);
  }
  if (spec.flower) {
    const [u0, v0, u1, v1] = leafCellUV(LEAF_CELL.flower);
    const fc = col(spec.flower);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * Sp * 0.15;
      const lean = 0.25 + r() * 0.5;
      const dir = V(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
      const len = H * (0.75 + r() * 0.3);
      const base = V(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      blade(g, base, dir, len, 0.006, 0.12, c0, c1, 0.3, 3);
      // Flower spike: small cards stacked up the top quarter.
      for (let k = 0; k < 6; k++) {
        const t = 0.72 + k * 0.05;
        const p = base.clone().addScaledVector(dir, len * t);
        p.y = base.y + len * t * (1 - 0.12 * t * 0.9);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.6, r() * 6.28, 0));
        const s = 0.055 * (1.1 - k * 0.08);
        card(fl, p, q, s, s * 1.4, [u0, v0, u1, v1], fc.clone().multiplyScalar(0.8 + r() * 0.35), 0.35, base, t * t, null, null);
      }
    }
  }
  return { leaves: g.build(), flowers: fl.count ? fl.build() : undefined };
}


/* ------------------------------------------------------------------ */
/* Rosettes, plumes and broad leaves                                    */
/* ------------------------------------------------------------------ */

/** A thick, tapered, slightly cupped leaf from base along dir. */
function strap(g: GeoBuilder, base: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, arch: number, c0: THREE.Color, c1: THREE.Color, edge: THREE.Color | null, birth: number, sway: number) {
  const side = V().crossVectors(dir, UP).normalize();
  if (side.lengthSq() < 0.1) side.set(1, 0, 0);
  const segs = 6;
  let prev: number[] | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = base.clone().addScaledVector(dir, len * t);
    p.y = base.y + len * t * dir.y * (1 - arch * t);
    const w = width * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (1 - t * 0.6);
    const up = V().crossVectors(side, dir).normalize();
    const n = up.clone().lerp(UP, 0.4).normalize();
    const c = c0.clone().lerp(c1, t);
    const ce = edge ? edge.clone() : c;
    const a = g.vert(p.clone().addScaledVector(side, -w / 2).addScaledVector(up, w * 0.12), n, 0, t, ce, birth, base, t * sway);
    const m = g.vert(p, n, 0.5, t, c, birth, base, t * sway);
    const b = g.vert(p.clone().addScaledVector(side, w / 2).addScaledVector(up, w * 0.12), n, 1, t, ce, birth, base, t * sway);
    if (prev) {
      g.quad(prev[0], prev[1], m, a);
      g.quad(prev[1], prev[2], b, m);
    }
    prev = [a, m, b];
  }
}

function rosette(spec: PlantSpec): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const yucca = spec.id.includes('yucca');
  const soft = spec.id.includes('foxtail');
  const rings = yucca ? 5 : 4;
  for (let ring = 0; ring < rings; ring++) {
    const n = yucca ? 12 : 9 + ring * 2;
    const tilt = 0.18 + (ring / rings) * (yucca ? 1.1 : 1.15);
    const len = (Sp / 2) * (0.55 + (ring / rings) * 0.6) / Math.max(0.35, Math.sin(tilt) * 0.9 + 0.1);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.37 + r() * 0.2;
      const dir = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
      const c0 = col(spec.foliage2, 0.75);
      const c1 = col(spec.foliage, 0.9 + r() * 0.2);
      const edge = yucca ? col('#e3d65a') : soft ? null : col(spec.foliage2, 1.1);
      const l = Math.min(len, H * 1.2) * (0.85 + r() * 0.3);
      strap(g, V(0, 0.02 + ring * 0.01, 0), dir, l, yucca ? 0.05 : soft ? Sp * 0.16 : Sp * 0.12, yucca ? 0.15 : soft ? 0.55 : 0.25, c0, c1, edge, Math.max(0, 0.6 - ring * 0.18), 0.15);
    }
  }
  return { leaves: g.build() };
}

/** Foxtail fern: dense upright plumes, each a fluffy tapered column. */
function plumes(spec: PlantSpec): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const [u0, v0, u1, v1] = leafCellUV(LEAF_CELL.needle);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.7;
    const dir = V(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    const len = H * (0.65 + r() * 0.4) * (1 - lean * 0.25);
    const birth = Math.max(0, lean * 0.6 - 0.1);
    const c = col(spec.foliage, 0.8 + r() * 0.3).lerp(col(spec.foliage2), r() * 0.5);
    // Stack cards up the plume, widest at the base.
    for (let k = 0; k < 9; k++) {
      const t = k / 9;
      const p = V().addScaledVector(dir, len * t);
      p.y = len * t * (1 - lean * 0.35 * t);
      p.x += Math.cos(a) * lean * len * 0.4 * t * t;
      p.z += Math.sin(a) * lean * len * 0.4 * t * t;
      const w = Sp * 0.1 * (1 - t * 0.7);
      for (let q = 0; q < 2; q++) {
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, a + q * Math.PI / 2, (r() - 0.5) * 0.5));
        card(g, p, quat, w, len / 6, [u0, v0, u1, v1], c, birth, V(), t * 0.9, null, null);
      }
    }
  }
  return { leaves: g.build() };
}

function tropical(spec: PlantSpec): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const wood = new GeoBuilder();
  const banana = spec.id === 'banana';
  const n = banana ? 9 : 7;
  const trunkH = banana ? H * 0.45 : 0;
  if (banana) tube(wood, [V(0, -0.05, 0), V(0, trunkH * 0.5, 0), V(0, trunkH, 0)], 0.09, 0.07, 10, col('#c7d29a'), 0, V(), (i) => i * 0.05, 1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4;
    const tilt = banana ? 0.5 + r() * 0.6 : 0.6 + r() * 0.5;
    const dir = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    const stemLen = banana ? H * 0.2 : H * 0.55;
    const base = V(0, trunkH, 0);
    const tip = base.clone().addScaledVector(dir, stemLen);
    tube(wood, [base, base.clone().lerp(tip, 0.5).add(V(0, stemLen * 0.08, 0)), tip], 0.015, 0.01, 5, col(spec.foliage2), 0.1, base, (i) => i * 0.3, 1);
    const ldir = dir.clone().add(V(0, banana ? 0.1 : -0.45, 0)).normalize();
    strap(g, tip, ldir, banana ? Sp * 0.6 : Sp * 0.45, banana ? Sp * 0.3 : Sp * 0.42, banana ? 0.55 : 0.4, col(spec.foliage, 0.85), col(spec.foliage2, 1.05), null, Math.min(0.7, k / n), 0.6);
  }
  return { wood: wood.build(), leaves: g.build() };
}

/** Annual color: low mounds covered in flowers. */
function annuals(spec: PlantSpec): SpeciesGeo {
  const geo = shrub(spec, true, true);
  return geo;
}

/* ------------------------------------------------------------------ */
/* Species registry                                                     */
/* ------------------------------------------------------------------ */

const geoCache = new Map<string, SpeciesGeo>();

export function speciesGeometry(spec: PlantSpec): SpeciesGeo {
  let g = geoCache.get(spec.id);
  if (g) return g;
  switch (spec.form) {
    case 'shadeTree':
      g = tree(spec, { trunks: 1, trunkFrac: 0.32, limbs: 5, limbAngle: 0.75, canopyCenter: 0.62, canopyRy: 0.36, clusters: 420, cardSize: 0.62, cell: LEAF_CELL.broad, cardsPerCluster: 5 });
      break;
    case 'accentTree':
      g = tree(spec, { trunks: 3, trunkFrac: 0.28, limbs: 3, limbAngle: 1.0, canopyCenter: 0.62, canopyRy: 0.34, clusters: 240, cardSize: 0.42, cell: LEAF_CELL.broad, cardsPerCluster: 5 });
      break;
    case 'multiTrunk':
      // Olive, crape myrtle: several slender trunks, an open airy crown.
      g = tree(spec, { trunks: 4, trunkFrac: 0.42, limbs: 3, limbAngle: 0.7, canopyCenter: 0.7, canopyRy: 0.3, clusters: 220, cardSize: Math.max(0.32, spec.matureSpread * 0.08), cell: LEAF_CELL.broad, cardsPerCluster: 5 });
      break;
    case 'standardTree':
      // Lollipop standard: one clean trunk and a round ball head.
      g = tree(spec, { trunks: 1, trunkFrac: 0.45, limbs: 5, limbAngle: 0.9, canopyCenter: 0.72, canopyRy: 0.28, clusters: 110, cardSize: 0.4, cell: LEAF_CELL.small, cardsPerCluster: 6 });
      break;
    case 'columnarTree':
      g = tree(spec, { spire: true, trunks: 1, trunkFrac: 0.06, limbs: 0, limbAngle: 0.25, canopyCenter: 0.52, canopyRy: 0.5, clusters: 260, cardSize: Math.max(0.35, spec.matureSpread * 0.42), cell: LEAF_CELL.needle, cardsPerCluster: 6 });
      break;
    case 'conifer':
      g = tree(spec, { spire: true, trunks: 1, trunkFrac: 0.05, limbs: 0, limbAngle: 0.6, canopyCenter: 0.47, canopyRy: 0.48, clusters: 260, cardSize: Math.max(0.35, spec.matureSpread * 0.3), cell: LEAF_CELL.needle, cardsPerCluster: 6 });
      break;
    case 'agave':
      g = rosette(spec);
      break;
    case 'fern':
      g = plumes(spec);
      break;
    case 'tropical':
      g = tropical(spec);
      break;
    case 'annuals':
      g = annuals(spec);
      break;
    case 'shrub':
      g = shrub(spec, false);
      break;
    case 'floweringShrub':
      g = shrub(spec, true);
      break;
    case 'groundcover':
      g = shrub(spec, true, true);
      break;
    case 'grass':
      g = grass(spec);
      break;
    case 'perennial':
      g = perennial(spec);
      break;
  }
  geoCache.set(spec.id, g!);
  return g!;
}

/* ------------------------------------------------------------------ */
/* Placing plants in the scene                                          */
/* ------------------------------------------------------------------ */

interface Group {
  spec: PlantSpec;
  existing: boolean;
  growth: GrowthUniforms;
}

export interface PlantLayer {
  object: THREE.Group;
  /** Update every plant for a number of years after install. */
  setYears(years: number): void;
  /** Proxy spheres for autofocus and picking. */
  proxies: THREE.Mesh[];
  dispose(): void;
}

function foliageOpts(spec: PlantSpec, growth: GrowthUniforms, part: 'leaf' | 'wood' | 'flower'): FoliageOptions {
  const tree = spec.group === 'Trees';
  const grassy = spec.form === 'grass' || spec.form === 'perennial' || spec.form === 'fern';
  const stiff = spec.form === 'agave';
  return {
    growth,
    bend: part === 'wood' ? (tree ? 0.12 : 0.1) : stiff ? 0.01 : tree ? 0.22 : grassy ? 0.16 : spec.form === 'tropical' ? 0.12 : 0.07,
    flutter: part === 'wood' || stiff ? 0 : grassy ? 0.012 : 0.02,
    translucency: part === 'wood' ? 0 : part === 'flower' ? 0.25 : stiff ? 0.08 : spec.form === 'grass' ? 0.2 : 0.4,
  };
}

function makeLeafMaterial(spec: PlantSpec, growth: GrowthUniforms, part: 'leaf' | 'flower', textured: boolean) {
  const o = foliageOpts(spec, growth, part);
  const m = new THREE.MeshStandardMaterial({
    map: textured ? leafAtlas() : null,
    vertexColors: true,
    alphaTest: textured ? 0.45 : 0,
    alphaToCoverage: textured,
    side: THREE.DoubleSide,
    roughness: part === 'flower' ? 0.75 : 0.62,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  patchFoliage(m, o);
  const depth = foliageDepthMaterial(o, textured ? leafAtlas() : undefined, textured ? 0.45 : 0);
  return { m, depth };
}

function makeWoodMaterial(spec: PlantSpec, growth: GrowthUniforms) {
  const o = foliageOpts(spec, growth, 'wood');
  const b = bark();
  const m = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, roughness: 0.95, color: new THREE.Color('#d9d2c8') });
  patchFoliage(m, o);
  return { m, depth: foliageDepthMaterial(o) };
}

/** Ground contact shade that grows with the plant's spread. */
function makeAOMaterial(growth: GrowthUniforms) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoDisc(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uSize = growth.uSize;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSize;')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.xz *= uSize.x;');
  };
  m.customProgramCacheKey = () => 'plant-ao';
  return m;
}

export function buildPlants(placements: PlantPlacement[], groundHeight: (p: Vec2) => number, castShadows: boolean): PlantLayer {
  const root = new THREE.Group();
  root.name = 'plants';
  const groups: Group[] = [];
  const proxies: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(proxyMat);
  const proxyGeo = new THREE.SphereGeometry(1, 8, 6);
  disposables.push(proxyGeo);

  const byKey = new Map<string, PlantPlacement[]>();
  for (const p of placements) {
    const spec = plantById.get(p.catalogId);
    if (!spec) continue;
    const key = `${spec.id}|${p.existing ? 1 : 0}`;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  for (const [key, list] of byKey) {
    const [id, ex] = key.split('|');
    const spec = plantById.get(id)!;
    const geo = speciesGeometry(spec);
    const growth = growthUniforms();
    const group: Group = { spec, existing: ex === '1', growth };
    groups.push(group);
    const mats: THREE.InstancedMesh[] = [];

    const addMesh = (g: THREE.BufferGeometry, mat: THREE.Material, depth: THREE.Material | null, cast: boolean, name: string) => {
      const im = new THREE.InstancedMesh(g, mat, list.length);
      im.name = `${spec.id}-${name}`;
      im.castShadow = cast && castShadows;
      im.receiveShadow = true;
      if (depth) im.customDepthMaterial = depth;
      im.frustumCulled = false;
      root.add(im);
      mats.push(im);
      disposables.push(mat);
      if (depth) disposables.push(depth);
    };

    const isTree = spec.group === 'Trees';
    const lm = makeLeafMaterial(spec, growth, 'leaf', spec.form !== 'grass' && spec.form !== 'perennial' && spec.form !== 'agave' && spec.form !== 'tropical');
    addMesh(geo.leaves, lm.m, lm.depth, spec.form !== 'groundcover' && spec.form !== 'annuals', 'leaves');
    if (geo.wood) {
      const wm = makeWoodMaterial(spec, growth);
      addMesh(geo.wood, wm.m, wm.depth, isTree, 'wood');
    }
    if (geo.flowers) {
      const fm = makeLeafMaterial(spec, growth, 'flower', true);
      addMesh(geo.flowers, fm.m, fm.depth, false, 'flowers');
    }
    const aoGeo = new THREE.PlaneGeometry(spec.matureSpread * 1.25, spec.matureSpread * 1.25).rotateX(-Math.PI / 2);
    disposables.push(aoGeo);
    const ao = new THREE.InstancedMesh(aoGeo, makeAOMaterial(growth), list.length);
    ao.renderOrder = 1;
    ao.frustumCulled = false;
    root.add(ao);
    mats.push(ao);

    list.forEach((p, i) => {
      const r = rng(p.id);
      const y = groundHeight(p.position);
      const sc = (p.scale ?? 1) * (0.9 + r() * 0.2);
      t.set(p.position[0], y, p.position[1]);
      q.setFromAxisAngle(UP, r() * Math.PI * 2);
      s.set(sc, sc * (0.92 + r() * 0.16), sc);
      m4.compose(t, q, s);
      for (const im of mats) {
        if (im === ao) {
          m4.compose(t.clone().setY(y + 0.012), q, V(sc, 1, sc));
          im.setMatrixAt(i, m4);
          m4.compose(t, q, s);
        } else im.setMatrixAt(i, m4);
      }
      const proxy = new THREE.Mesh(proxyGeo, proxyMat);
      proxy.userData = { plantId: p.id, spec, growth, scale: sc };
      proxy.position.set(p.position[0], y, p.position[1]);
      proxies.push(proxy);
      root.add(proxy);
    });
    for (const im of mats) im.instanceMatrix.needsUpdate = true;
  }

  const layer: PlantLayer = {
    object: root,
    proxies,
    setYears(years: number) {
      for (const g of groups) {
        const yrs = g.existing ? g.spec.yearsToMature : years;
        g.growth.uGrow.value = growthAt(g.spec, yrs);
        const sz = sizeAt(g.spec, yrs);
        g.growth.uSize.value.set(sz.spread / g.spec.matureSpread, sz.height / g.spec.matureHeight);
      }
      // Keep proxies sized for autofocus.
      for (const p of proxies) {
        const { growth, spec, scale } = p.userData as { growth: GrowthUniforms; spec: PlantSpec; scale: number };
        const h = spec.matureHeight * growth.uSize.value.y * scale;
        const w = spec.matureSpread * growth.uSize.value.x * scale;
        p.scale.set(w / 2, h / 2, w / 2);
        p.position.y = (p.position.y - (p.userData.lastHalf ?? 0)) + h / 2;
        p.userData.lastHalf = h / 2;
      }
    },
    dispose() {
      root.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
  return layer;
}

/** Preview size text for a plant at a number of years. */
export function describeSize(id: string, years: number): string {
  const spec = plantById.get(id);
  if (!spec) return '';
  const s = sizeAt(spec, years);
  const ft = (m: number) => `${Math.round(m * 3.28084 * 10) / 10} ft`;
  return `${ft(s.height)} tall, ${ft(s.spread)} wide`;
}

export const ALL_PLANTS = PLANTS;
export { GLOBAL };
