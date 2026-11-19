import * as THREE from 'three';
import { PLANTS, curveAt, plantById, sizeAt, type ContainerId, type PlantSpec } from '../siteplan/catalog';
import { rng } from '../siteplan/geometry';
import type { PlantPlacement, Vec2 } from '../siteplan/types';
import { GLOBAL, foliageDepthMaterial, growthUniforms, patchFoliage, type FoliageOptions, type GrowthUniforms } from '../engine/foliage';
import { LEAF_CELL, aoDisc, bark, leafAtlas, leafCellUV } from '../engine/textures';
import { GeoBuilder, card, tube } from './geobuilder';
import type { SpeciesGeo, SpeciesLook } from './species/kit';
import { SPECIES } from './species/registry';
import { settleLeafTextures } from './species/kit';
import { REFLECTION_ONLY_LAYER, SHADOW_PASS_LAYER, WATER_LAYER_SKIP } from '../engine/water';

/**
 * Procedural plants. Each catalog plant becomes one geometry set at mature
 * size; every placement of it is an instance. Growth from install to
 * maturity happens in the vertex shader (see engine/foliage.ts).
 *
 * Each catalog plant has its own builder under species/ (see
 * species/registry.ts). The form builders in this file are the fallback for
 * a catalog plant that has no file of its own yet.
 */

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
  settleLeafTextures();
  let g = geoCache.get(spec.id);
  if (g) return g;
  const own = SPECIES[spec.id];
  if (own) {
    g = own(spec);
    geoCache.set(spec.id, g);
    return g;
  }
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
  /** Nursery container these were installed from; undefined is the catalog's own. */
  container?: ContainerId;
  /** A trained vine's (SpeciesLook.trained) own growth uniforms for its model: `growth`'s fullness, its own scale. */
  frame?: GrowthUniforms;
}

/** Instances drawn at one level of detail: a shared matrix buffer and a mesh per plant part. */
interface Band {
  attr: THREE.InstancedBufferAttribute;
  meshes: THREE.InstancedMesh[];
  count: number;
}

/** One plant group's instances when built with levels of detail. */
interface LodSet {
  group: Group;
  n: number;
  /** Each instance's matrix. */
  base: Float32Array;
  /** Each instance's base point. */
  center: Float32Array;
  /** Each instance's scale (largest axis). */
  scale: Float32Array;
  /** Each instance's on-screen size factor for choosing its detail (RaisedPlacement.detail; 1 for most). */
  detail: Float32Array;
  /** In view, by level of detail (full, fewer leaves, fewest): matrices rewritten as the camera moves. */
  view: Band[];
  /** In reflections, by level (fewer leaves, fewest), for the instances near reflecting water only. */
  reflect: Band[];
  /** Which instances show in reflections. */
  reflects: Uint8Array;
  /** Each instance's last level in view and in reflections (255: not yet chosen), for the switching dead band. */
  level: Uint8Array;
  rlevel: Uint8Array;
  /** Shadow-map meshes: every instance, never rewritten. */
  staticMeshes: THREE.InstancedMesh[];
  /** Radius around the base that holds the mature plant at scale 1. */
  radius0: number;
  /** Triangles in one instance at full detail and at fewer leaves (every part), for the switch sizes below. */
  tris0: number;
  tris1: number;
  /** This plant's switch sizes in CSS pixels: full to fewer leaves, fewer to fewest (see lodSizes). */
  t1: number;
  t2: number;
}

export interface PlantLayer {
  /** With levels of detail: choose near, far and hidden plants for this camera (call before each frame). */
  update?(camera: THREE.PerspectiveCamera, viewHeight: number): void;
  object: THREE.Group;
  /** Update every plant for a number of years after install. */
  setYears(years: number): void;
  /** Proxy spheres for autofocus and picking. */
  proxies: THREE.Mesh[];
  dispose(): void;
}

function foliageOpts(spec: PlantSpec, growth: GrowthUniforms, part: 'leaf' | 'wood' | 'flower', look: SpeciesLook = {}): FoliageOptions {
  const tree = spec.group === 'Trees';
  const grassy = spec.form === 'grass' || spec.form === 'perennial' || spec.form === 'fern';
  const stiff = spec.form === 'agave';
  return {
    growth,
    bend: look.bend !== undefined ? (part === 'wood' ? look.bend * 0.55 : look.bend) : part === 'wood' ? (tree ? 0.12 : 0.1) : stiff ? 0.01 : tree ? 0.22 : grassy ? 0.16 : spec.form === 'tropical' ? 0.12 : 0.07,
    flutter: part === 'wood' ? 0 : look.flutter !== undefined ? look.flutter : stiff ? 0 : grassy ? 0.012 : 0.02,
    translucency: part === 'wood' ? 0 : part === 'flower' ? 0.25 : look.translucency !== undefined ? look.translucency : stiff ? 0.08 : spec.form === 'grass' ? 0.2 : 0.4,
  };
}

function makeLeafMaterial(spec: PlantSpec, growth: GrowthUniforms, part: 'leaf' | 'flower', map: THREE.Texture | null, look: SpeciesLook = {}) {
  const o = foliageOpts(spec, growth, part, look);
  const textured = !!map;
  const cut = look.alphaTest ?? 0.45;
  const m = new THREE.MeshStandardMaterial({
    map,
    vertexColors: true,
    alphaTest: textured ? cut : 0,
    alphaToCoverage: textured,
    side: THREE.DoubleSide,
    roughness: part === 'flower' ? 0.75 : look.leafRoughness ?? 0.62,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  patchFoliage(m, o);
  const depth = foliageDepthMaterial(o, map ?? undefined, textured ? cut : 0);
  return { m, depth };
}

function makeWoodMaterial(spec: PlantSpec, growth: GrowthUniforms, geo: SpeciesGeo) {
  const o = foliageOpts(spec, growth, 'wood', geo.look);
  const b = geo.bark ?? bark();
  // A plant's own bark texture carries its true color; the shared bark is warmed slightly.
  const m = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap ?? null, roughness: 0.95, vertexColors: true, color: new THREE.Color(geo.bark ? '#ffffff' : '#d9d2c8') });
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

/* ------------------------------------------------------------------ */
/* Lower-detail plants                                                  */
/* ------------------------------------------------------------------ */

/** Layers used by the scene's plants when built with levels of detail. */
export const PLANT_LAYERS = {
  /** Seen by the main camera only (left out of reflections). */
  view: WATER_LAYER_SKIP,
  /** Seen by the reflection camera only. */
  reflection: REFLECTION_ONLY_LAYER,
  /** Drawn only into the sun's shadow map (see Studio.renderShadows). */
  shadow: SHADOW_PASS_LAYER,
};

/**
 * On screen, plants smaller than this many CSS pixels tall (or wide) are drawn
 * with fewer leaves, and below LOD2_PIXELS with the fewest.
 */
export const LOD_PIXELS = 100;
export const LOD2_PIXELS = 32;
/** Triangles in one plant at which the switch sizes start to grow (see lodSizes). */
const LOD_TRIS = 9000;
const LOD2_TRIS = 4000;

/**
 * Switch sizes for one plant. A dense plant (a Japanese maple or a yew pine has 40 to 60 thousand triangles at full
 * detail, a perennial a few thousand) goes to fewer leaves while still larger on screen: up to 2.2 times LOD_PIXELS
 * and 2 times LOD2_PIXELS. At those sizes each kept leaf card is still several pixels across, so the crown reads
 * the same, and most of the yard's triangles are in these few plants.
 */
function lodSizes(tris0: number, tris1: number): [number, number] {
  return [LOD_PIXELS * THREE.MathUtils.clamp(Math.sqrt(tris0 / LOD_TRIS), 1, 2.2), LOD2_PIXELS * THREE.MathUtils.clamp(Math.sqrt(tris1 / LOD2_TRIS), 1, 2)];
}
/**
 * A plant switches detail only once its size is this share past a threshold (either way), so a plant
 * sitting near one while the camera glides does not flip back and forth between levels.
 */
const LOD_HYSTERESIS = 0.15;

/**
 * The detail level for a plant `px` tall on screen, kept at `prev` while inside the dead band around a threshold.
 * `s1` and `s2` are the plant's switch sizes (lodSizes).
 */
function lodLevel(px: number, prev: number, minLevel: number, s1 = LOD_PIXELS, s2 = LOD2_PIXELS): number {
  const lo = 1 - LOD_HYSTERESIS, hi = 1 + LOD_HYSTERESIS;
  // Thresholds move away from the current level: harder to leave it than to enter it.
  const t1 = prev === 255 ? s1 : prev === 0 ? s1 * lo : s1 * hi;
  const t2 = prev === 255 ? s2 : prev === 2 ? s2 * hi : s2 * lo;
  const l = px >= t1 ? 0 : px >= t2 ? 1 : 2;
  return Math.max(minLevel, l);
}

/**
 * Detail levels: share of leaf cards kept (each grown to keep the crown about as full: the kept cards cover about
 * the same area at level 1, and about 60% of it at level 2, where a plant is a few dozen pixels tall), share of
 * larger pieces kept, share of twigs kept; for wood, the size (share of the largest piece) from which a limb counts
 * as large, the share of large limbs kept and of smaller ones. The trunk (80% of the largest piece or more) is
 * always kept. Wood is mostly hidden inside the crown, so far copies keep little of it.
 */
const LEVELS = {
  1: { keep: 0.34, grow: 1 / Math.sqrt(0.34), keepBig: 1, twigs: 0.12, limb: 0.2, limbBig: 1, limbKeep: 0.3 },
  2: { keep: 0.11, grow: Math.sqrt(0.62 / 0.11), keepBig: 0.5, twigs: 0, limb: 0.4, limbBig: 0.5, limbKeep: 0.05 },
};

const lodCache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();

/**
 * A lower-detail copy of a plant part for shadows, reflections and far plants.
 * Plant geometry is made of small separate pieces (leaf cards, blades, branch
 * tubes). At level 1, leaf and flower parts keep about 40% of their cards, each
 * grown so the crown stays about as dense, and every larger piece (blades, broad
 * leaves); wood keeps its trunk and limbs and drops most twigs. Level 2, for
 * plants only a few dozen pixels tall, keeps far fewer (see LEVELS).
 */
export function lodGeometry(geo: THREE.BufferGeometry, part: 'leaf' | 'wood' | 'flower', level: 1 | 2 = 1): THREE.BufferGeometry {
  let levels = lodCache.get(geo);
  if (!levels) lodCache.set(geo, (levels = new Map()));
  const hit = levels.get(level);
  if (hit) return hit;
  const L = LEVELS[level];
  const index = geo.index;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!index || pos.count < 64) {
    levels.set(level, geo);
    return geo;
  }
  const n = pos.count, I = index.array;
  // Pieces: vertices joined by triangles.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const root = new Int32Array(n);
  const verts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    root[i] = find(i);
    verts.set(root[i], (verts.get(root[i]) ?? 0) + 1);
  }
  // Each piece's center and size.
  const cx = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = root[i];
    let c = cx.get(r);
    if (!c) cx.set(r, (c = [0, 0, 0, Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    c[0] += x;
    c[1] += y;
    c[2] += z;
    c[3] = Math.min(c[3], x);
    c[4] = Math.max(c[4], x);
    c[5] = Math.min(c[5], y);
    c[6] = Math.max(c[6], y);
    c[7] = Math.min(c[7], z);
    c[8] = Math.max(c[8], z);
  }
  const extent = (c: number[]) => Math.hypot(c[4] - c[3], c[6] - c[5], c[8] - c[7]);
  let maxExtent = 0;
  for (const c of cx.values()) maxExtent = Math.max(maxExtent, extent(c));
  // The same rolls at every level, so the fewest-leaves copy keeps a subset of the fewer-leaves one.
  const r = rng(`lod-${n}-${I.length}`);
  const CARD = 8;
  const keep = new Map<number, number>(); // piece -> scale (pieces left out are absent)
  for (const [k, c] of cx) {
    const nv = verts.get(k)!;
    const roll = r();
    if (part === 'wood') {
      const e = extent(c) / maxExtent;
      if (nv <= CARD ? roll < L.twigs : e >= 0.8 || (e >= L.limb && roll < L.limbBig) || roll < L.limbKeep) keep.set(k, 1);
    } else if (nv <= CARD) {
      if (roll < L.keep) keep.set(k, L.grow);
    } else if (roll < L.keepBig) keep.set(k, 1);
  }
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < n; i++) if (keep.has(root[i])) remap[i] = m++;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    const sz = a.itemSize;
    const arr = new Float32Array(m * sz);
    for (let i = 0; i < n; i++) {
      const j = remap[i];
      if (j < 0) continue;
      for (let k = 0; k < sz; k++) arr[j * sz + k] = a.array[i * sz + k] as number;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz, a.normalized));
  }
  // Grow kept cards about their centers so the crown stays about as full.
  const op = out.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const j = remap[i];
    if (j < 0) continue;
    const sc = keep.get(root[i])!;
    if (sc === 1) continue;
    const c = cx.get(root[i])!, nv = verts.get(root[i])!;
    const mx = c[0] / nv, my = c[1] / nv, mz = c[2] / nv;
    op.setXYZ(j, mx + (op.getX(j) - mx) * sc, my + (op.getY(j) - my) * sc, mz + (op.getZ(j) - mz) * sc);
  }
  const idx: number[] = [];
  for (let t = 0; t < I.length; t += 3) if (remap[I[t]] >= 0) idx.push(remap[I[t]], remap[I[t + 1]], remap[I[t + 2]]);
  out.setIndex(idx);
  out.computeBoundingSphere();
  out.computeBoundingBox();
  levels.set(level, out);
  return out;
}

function band(n: number): Band {
  return { attr: new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16).setUsage(THREE.DynamicDrawUsage), meshes: [], count: 0 };
}

/** A plant standing on part of a feature (a bowl planter on a pillar): the height of its base, which the ground does not give. */
export interface RaisedPlacement extends PlantPlacement {
  baseY: number;
  /**
   * Picks detail as if the plant were this many times its size on screen: a small plant always seen close up as part of
   * its feature (an agave in a bowl planter) keeps its full rosette, where fewer leaves would show as gaps.
   */
  detail?: number;
  /** A vine trained on its feature's support (a pot's trellis): its heading, so it stands with the feature, not the nearest fence. */
  heading?: number;
}

export interface PlantBuildOptions {
  /**
   * Build with levels of detail for the 3D view: near plants in full detail,
   * far ones (and every plant in the shadow map and reflections) with fewer
   * leaves, and plants out of view skipped. `update` must then be called
   * before each frame.
   */
  lod?: boolean;
  /** With lod: which plants show in water reflections (near a mirror-like water surface). */
  reflects?: (p: Vec2, height: number) => boolean;
  /** With lod: shadow map texel size in meters. Plants only a few texels across cast their shadow from the fewest-leaves copy. */
  shadowTexel?: number;
  /**
   * For vines trained on a support (SpeciesLook.trained): the heading that turns a plant at `p` to stand with its
   * back to the nearest fence or wall (see backToNearest), or null when there is none near. Left out, or null, the
   * plant faces plan +y.
   */
  backing?: (p: Vec2) => number | null;
}

/**
 * Headings for plants that stand with their back to a fence or wall: for a point, the turn about +Y that points the
 * plant's front (local +Z) away from the nearest of `segments` within `reach` meters, or null when none is that near.
 * A point right on a segment faces the side toward plan +y (or +x for a segment that runs along y).
 */
export function backToNearest(segments: [Vec2, Vec2][], reach = 1.5): (p: Vec2) => number | null {
  return (p) => {
    let best = reach * reach, dx = 0, dy = 0, found = false;
    for (const [a, b] of segments) {
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
      const t = l2 > 1e-12 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0;
      const qx = a[0] + ex * t, qy = a[1] + ey * t;
      const d2 = (p[0] - qx) ** 2 + (p[1] - qy) ** 2;
      if (d2 >= best) continue;
      best = d2;
      found = true;
      if (d2 > 1e-4) {
        dx = p[0] - qx;
        dy = p[1] - qy;
      } else {
        // On the line: its normal, on the +y side.
        dx = -ey;
        dy = ex;
        if (dy < 0 || (Math.abs(dy) < 1e-9 && dx < 0)) {
          dx = -dx;
          dy = -dy;
        }
      }
    }
    // Local +Z turned by heading h about +Y points along (sin h, cos h) in plan x, y.
    return found ? Math.atan2(dx, dy) : null;
  };
}

export function buildPlants(placements: PlantPlacement[], groundHeight: (p: Vec2) => number, castShadows: boolean, options: PlantBuildOptions = {}): PlantLayer {
  const root = new THREE.Group();
  root.name = 'plants';
  const groups: Group[] = [];
  const proxies: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(proxyMat);
  const proxyGeo = new THREE.SphereGeometry(1, 8, 6);
  disposables.push(proxyGeo);
  const lod = !!options.lod;
  const lodSets: LodSet[] = [];

  const byKey = new Map<string, PlantPlacement[]>();
  for (const p of placements) {
    const spec = plantById.get(p.catalogId);
    if (!spec) continue;
    const key = `${spec.id}|${p.existing ? 1 : 0}|${p.container ?? ''}`;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  for (const [key, list] of byKey) {
    const [id, ex, cont] = key.split('|');
    const spec = plantById.get(id)!;
    const geo = speciesGeometry(spec);
    const growth = growthUniforms();
    const group: Group = { spec, existing: ex === '1', growth, container: (cont || undefined) as ContainerId | undefined };
    groups.push(group);
    const mats: THREE.InstancedMesh[] = [];
    const n = list.length;
    // With levels of detail: matrices for near and for far plants in view, rewritten as the camera moves.
    const set: LodSet | null = lod
      ? {
          group,
          n,
          base: new Float32Array(n * 16),
          center: new Float32Array(n * 3),
          scale: new Float32Array(n),
          detail: new Float32Array(n).fill(1),
          view: [band(n), band(n), band(n)],
          reflect: [band(n), band(n)],
          reflects: new Uint8Array(n),
          level: new Uint8Array(n).fill(255),
          rlevel: new Uint8Array(n).fill(255),
          staticMeshes: [],
          radius0: 0,
          tris0: 0,
          tris1: 0,
          t1: LOD_PIXELS,
          t2: LOD2_PIXELS,
        }
      : null;

    const addMesh = (g: THREE.BufferGeometry, mat: THREE.Material, depth: THREE.Material | null, cast: boolean, name: string, part: 'leaf' | 'wood' | 'flower') => {
      disposables.push(mat);
      if (depth) disposables.push(depth);
      if (!set) {
        const im = new THREE.InstancedMesh(g, mat, n);
        im.name = `${spec.id}-${name}`;
        im.castShadow = cast && castShadows;
        im.receiveShadow = true;
        if (depth) im.customDepthMaterial = depth;
        im.frustumCulled = false;
        root.add(im);
        mats.push(im);
        return;
      }
      const lo = lodGeometry(g, part, 1), lo2 = lodGeometry(g, part, 2);
      const tris = (gg: THREE.BufferGeometry) => (gg.index ? gg.index.count : (gg.getAttribute('position') as THREE.BufferAttribute).count) / 3;
      set.tris0 += tris(g);
      set.tris1 += tris(lo);
      [set.t1, set.t2] = lodSizes(set.tris0, set.tris1);
      g.boundingSphere ?? g.computeBoundingSphere();
      const bs = g.boundingSphere!;
      set.radius0 = Math.max(set.radius0, bs.center.length() + bs.radius);
      const banded = (geos: THREE.BufferGeometry[], bands: Band[], layer: number, tag: string) =>
        geos.forEach((gg, k) => {
          const im = new THREE.InstancedMesh(gg, mat, n);
          im.name = `${spec.id}-${name}-${tag}${k}`;
          im.instanceMatrix = bands[k].attr;
          im.count = 0;
          im.visible = false;
          im.receiveShadow = true;
          im.frustumCulled = false;
          im.layers.set(layer);
          root.add(im);
          bands[k].meshes.push(im);
        });
      // In view: full detail near, fewer leaves farther, fewest far off. None cast shadows.
      banded([g, lo, lo2], set.view, PLANT_LAYERS.view, 'view');
      // In reflections, plants near reflecting water: fewer or fewest leaves.
      banded([lo, lo2], set.reflect, PLANT_LAYERS.reflection, 'reflection');
      // Every plant into the shadow map, from a lower-detail copy: wood (mostly inside the crown) and any plant only a
      // couple of dozen shadow texels across from the fewest-leaves copy; the leaves of larger plants from the
      // fewer-leaves copy, whose cards cover as much as the full crown, so dappled shade keeps its density.
      if (cast && castShadows) {
        const tiny = options.shadowTexel !== undefined && Math.max(spec.matureHeight, spec.matureSpread) < options.shadowTexel * 24;
        const im = new THREE.InstancedMesh(tiny || part === 'wood' ? lo2 : lo, mat, n);
        im.name = `${spec.id}-${name}-shadow`;
        im.castShadow = true;
        if (depth) im.customDepthMaterial = depth;
        im.layers.set(PLANT_LAYERS.shadow);
        root.add(im);
        set.staticMeshes.push(im);
      }
    };

    const isTree = spec.group === 'Trees';
    const look = geo.look ?? {};
    // A trained vine's model keeps its support's size: its materials grow by their own uniforms (see setYears).
    if (look.trained) group.frame = { uGrow: growth.uGrow, uSize: { value: new THREE.Vector2(1, 1) } };
    const grows = group.frame ?? growth;
    const legacyTextured = spec.form !== 'grass' && spec.form !== 'perennial' && spec.form !== 'agave' && spec.form !== 'tropical';
    const leafMap = geo.leafMap !== undefined ? geo.leafMap : legacyTextured ? leafAtlas() : null;
    const lm = makeLeafMaterial(spec, grows, 'leaf', leafMap, look);
    addMesh(geo.leaves, lm.m, lm.depth, look.leafShadows ?? (spec.form !== 'groundcover' && spec.form !== 'annuals'), 'leaves', 'leaf');
    if (geo.wood) {
      const wm = makeWoodMaterial(spec, grows, geo);
      addMesh(geo.wood, wm.m, wm.depth, look.woodShadows ?? isTree, 'wood', 'wood');
    }
    if (geo.flowers) {
      const fm = makeLeafMaterial(spec, grows, 'flower', geo.flowerMap !== undefined ? geo.flowerMap : leafAtlas(), look);
      addMesh(geo.flowers, fm.m, fm.depth, false, 'flowers', 'flower');
    }
    const aoGeo = new THREE.PlaneGeometry(spec.matureSpread * 1.25, spec.matureSpread * 1.25).rotateX(-Math.PI / 2);
    disposables.push(aoGeo);
    const ao = new THREE.InstancedMesh(aoGeo, makeAOMaterial(growth), n);
    ao.renderOrder = 1;
    ao.frustumCulled = false;
    root.add(ao);

    list.forEach((p, i) => {
      const r = rng(p.id);
      const y = (p as Partial<RaisedPlacement>).baseY ?? groundHeight(p.position);
      const same = look.hedge || look.trained;
      const sc = (p.scale ?? 1) * (same ? 1 : 0.9 + r() * 0.2);
      t.set(p.position[0], y, p.position[1]);
      let heading = r() * Math.PI * 2;
      const tall = same ? 1 : 0.92 + r() * 0.16;
      // A trained vine stands with its trellis's flat side to the nearest fence or wall, else facing plan +y.
      if (look.trained) heading = (p as Partial<RaisedPlacement>).heading ?? options.backing?.(p.position) ?? 0;
      if (look.hedge) {
        // Face along the row: toward the nearest placement of the same plant.
        let best = Infinity;
        heading = 0;
        for (const o of list) {
          if (o === p) continue;
          const dx = o.position[0] - p.position[0], dz = o.position[1] - p.position[1];
          const d = dx * dx + dz * dz;
          if (d < best && d > 1e-6) {
            best = d;
            heading = -Math.atan2(dz, dx);
          }
        }
      }
      q.setFromAxisAngle(UP, heading);
      s.set(sc, sc * tall, sc);
      m4.compose(t, q, s);
      for (const im of mats) im.setMatrixAt(i, m4);
      if (set) {
        m4.toArray(set.base, i * 16);
        set.center[i * 3] = t.x;
        set.center[i * 3 + 1] = t.y;
        set.center[i * 3 + 2] = t.z;
        set.scale[i] = sc * Math.max(1, tall);
        set.detail[i] = (p as Partial<RaisedPlacement>).detail ?? 1;
        for (const im of set.staticMeshes) im.setMatrixAt(i, m4);
        set.reflects[i] = !options.reflects || options.reflects(p.position, spec.matureHeight * sc) ? 1 : 0;
      }
      // A trained vine is a flat screen: its contact shade is a narrow ellipse along it.
      m4.compose(t.clone().setY(y + 0.012), q, V(sc, 1, look.trained ? sc * 0.3 : sc));
      ao.setMatrixAt(i, m4);
      const proxy = new THREE.Mesh(proxyGeo, proxyMat);
      proxy.userData = { plantId: p.id, spec, growth, scale: sc, part: 'plant', catalogId: `plant:${spec.id}` };
      proxy.position.set(p.position[0], y, p.position[1]);
      proxies.push(proxy);
      root.add(proxy);
    });
    for (const im of mats) im.instanceMatrix.needsUpdate = true;
    ao.instanceMatrix.needsUpdate = true;
    if (set) {
      for (const im of set.staticMeshes) {
        im.instanceMatrix.needsUpdate = true;
        // Culled against the sun's view as a whole; the sphere is padded for wind sway.
        im.computeBoundingSphere();
        im.boundingSphere!.radius += 1;
      }
      lodSets.push(set);
    }
  }

  // Per-frame selection of near, far and out-of-view plants.
  const putBand = (b: Band, base: Float32Array, i: number) => (b.attr.array as Float32Array).set(base.subarray(i * 16, i * 16 + 16), 16 * b.count++);
  const flushBands = (bands: Band[]) => {
    for (const b of bands) {
      for (const im of b.meshes) {
        im.count = b.count;
        im.visible = b.count > 0;
      }
      if (b.count) {
        b.attr.clearUpdateRanges();
        b.attr.addUpdateRange(0, b.count * 16);
        b.attr.needsUpdate = true;
      }
    }
  };
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere(), last = new THREE.Matrix4();
  let lastPx = 0, sizeVersion = 0, lastSizeVersion = -1;

  const layer: PlantLayer = {
    object: root,
    proxies,
    setYears(years: number) {
      for (const g of groups) {
        const yrs = g.existing ? g.spec.yearsToMature : years;
        // Fullness follows the plant's place on its growth curve, so a boxed tree starts fuller than a 5 gal.
        g.growth.uGrow.value = Math.max(0, curveAt(g.spec, yrs, g.container));
        const sz = sizeAt(g.spec, yrs, g.container);
        g.growth.uSize.value.set(sz.spread / g.spec.matureSpread, sz.height / g.spec.matureHeight);
        // A trained vine's model is full size from the catalog's install size on (it grows by its parts appearing).
        if (g.frame) g.frame.uSize.value.set(Math.min(1, sz.spread / g.spec.installSpread), Math.min(1, sz.height / g.spec.installHeight));
      }
      sizeVersion++;
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
    update(camera: THREE.PerspectiveCamera, viewHeight: number) {
      if (!lodSets.length) return;
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      // Only when the view, the screen size or the plant sizes changed.
      if (pv.equals(last) && viewHeight === lastPx && sizeVersion === lastSizeVersion) return;
      last.copy(pv);
      lastPx = viewHeight;
      lastSizeVersion = sizeVersion;
      frustum.setFromProjectionMatrix(pv);
      const cam = camera.position;
      // Screen pixels per meter at 1 m distance.
      const pxPerM = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      for (const set of lodSets) {
        const { spec, growth } = set.group;
        const grow = Math.max(1, growth.uSize.value.x, growth.uSize.value.y);
        const size = Math.max(spec.matureHeight * growth.uSize.value.y, spec.matureSpread * growth.uSize.value.x);
        for (const b of set.view) b.count = 0;
        for (const b of set.reflect) b.count = 0;
        for (let i = 0; i < set.n; i++) {
          const k = set.scale[i];
          // A sphere around the plant's base that holds it at any size up to mature, plus wind sway.
          sphere.center.set(set.center[i * 3], set.center[i * 3 + 1], set.center[i * 3 + 2]);
          const d = Math.max(0.1, Math.hypot(cam.x - sphere.center.x, cam.y - sphere.center.y - size * k * 0.5, cam.z - sphere.center.z));
          const px = (size * k * pxPerM * set.detail[i]) / d;
          // A reflection is about as large on screen as the plant, wherever the plant itself is.
          if (set.reflects[i]) {
            // Reflections use the fewer and fewest levels only (0 and 1 here are levels 1 and 2).
            const rl = lodLevel(px, set.rlevel[i], 1, set.t1, set.t2);
            set.rlevel[i] = rl;
            putBand(set.reflect[rl - 1], set.base, i);
          }
          sphere.radius = set.radius0 * k * grow + 0.4;
          if (!frustum.intersectsSphere(sphere)) continue;
          const vl = lodLevel(px, set.level[i], 0, set.t1, set.t2);
          set.level[i] = vl;
          putBand(set.view[vl], set.base, i);
        }
        flushBands(set.view);
        flushBands(set.reflect);
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
