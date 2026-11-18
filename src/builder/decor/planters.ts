import * as THREE from 'three';
import { featureById } from '../../siteplan/catalog';
import { featureSize } from '../../siteplan/decor';
import { rng } from '../../siteplan/geometry';
import type { FeaturePlacement, PlantPlacement, Vec2 } from '../../siteplan/types';
import { box, IN, mat, type DecorContext } from './kit';
import { plainMaterial } from '../materials';
import { photoAlbedo } from '../../engine/surfaces';

/*
 * Tall rectangular corten planter, as set along the house on the job: 1/4 in weathering steel plate, long sides full
 * length with the ends set between them (a fine seam shows at each corner), a 7/8 in lip folded in at the top, soil an
 * inch and three quarters below the rim under a layer of 1-2 1/2 in gray river pebbles. Local x runs along its length,
 * z across it; +z is the open (walkway) side, -z the house side. Planted as in the photos unless `planted: false`.
 */

const PLATE = 0.25 * IN;
const LIP = 0.875 * IN;
/** Soil top below the rim. */
const SOIL_DROP = 1.75 * IN;

export function cortenPlanterTall(c: DecorContext) {
  const [W, D, H] = featureSize(c.spec, c.f.size, 24 * IN);
  const t = PLATE;
  const steel = mat.corten();
  // Long sides, then the ends between them, a hair in so the corner seam reads.
  for (const s of [-1, 1]) c.add(steel, box(W, H, t, 0, 0, s * (D / 2 - t / 2)));
  for (const s of [-1, 1]) c.add(steel, box(t, H, D - 2 * t - 0.001, s * (W / 2 - t / 2 - 0.0007), 0, 0));
  // The folded-in lip round the top.
  const inside = mat.cortenInside();
  for (const s of [-1, 1]) c.add(inside, box(W - 2 * t, t, LIP, 0, H - t, s * (D / 2 - t - LIP / 2)));
  for (const s of [-1, 1]) c.add(inside, box(LIP, t, D - 2 * t - 2 * LIP, s * (W / 2 - t - LIP / 2), H - t, 0));
  const soilTop = H - SOIL_DROP;
  c.add(mat.soil(), box(W - 2 * t, 0.02, D - 2 * t, 0, soilTop - 0.02, 0));
  if (c.f.planted !== false) {
    const pebbles = pebbleMulch(W - 2 * t - 0.01, D - 2 * t - 0.01, soilTop, `${c.f.id}-pebbles`);
    if (pebbles) c.add(pebbleMaterial(), pebbles);
  }
}

function pebbleMaterial() {
  return plainMaterial('decor:pebble-gray', { color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0 });
}

// Gray river pebble colors read from the job photos: blue-gray, slate and pale gray, a few warm.
// Photo colors, turned into the albedo that renders back to them on a sky-lit top (photoAlbedo).
const PEBBLE_TONES = ['#8e979f', '#7c858e', '#a3a9ae', '#646c74', '#99938b', '#b0b3b3'].map((h) => new THREE.Color(photoAlbedo(h)));

/** Smooth flattened stones packed over a w x d bed whose surface is at y. */
function pebbleMulch(w: number, d: number, y: number, seed: string): THREE.BufferGeometry | null {
  const r = rng(seed);
  const placed: { x: number; z: number; r: number }[] = [];
  const area = w * d;
  const tries = Math.round(area * 6000);
  const parts: THREE.BufferGeometry[] = [];
  const unit = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < tries && placed.length < area * 1400; i++) {
    // Mostly 1 1/4 - 2 1/2 in stones, a few smaller ones filling the gaps.
    const big = r() < 0.75;
    const rad = big ? 0.016 + r() * 0.016 : 0.009 + r() * 0.008;
    const x = (r() - 0.5) * (w - rad * 2);
    const z = (r() - 0.5) * (d - rad * 2);
    // Stones lie close and partly over each other, so the soil hardly shows.
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + rad) * 0.62)) continue;
    placed.push({ x, z, r: rad });
    const g = unit.clone();
    const sx = rad * (1 + r() * 0.35), sz = rad * (0.75 + r() * 0.25), sy = rad * (0.42 + r() * 0.18);
    g.scale(sx, sy, sz);
    g.rotateY(r() * Math.PI);
    g.rotateX((r() - 0.5) * 0.3);
    g.translate(x, y + sy * (0.35 + r() * 0.5), z);
    const col = PEBBLE_TONES[Math.floor(r() * PEBBLE_TONES.length)].clone().multiplyScalar(0.9 + r() * 0.2);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) cols.set([col.r, col.g, col.b], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(g);
  }
  unit.dispose();
  if (!parts.length) return null;
  const merged = mergeAll(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of parts) n += g.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of parts) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The planting                                                         */
/* ------------------------------------------------------------------ */

/**
 * The job's planting for a 36 x 16 in planter, from its photos (local x along the length, z toward the open side):
 * a red yucca in the middle, then at each end a blue fescue, red primroses toward the house, an echeveria and a blue
 * sedum spilling over the open side. Positions scale with the planter; one shorter than 30 in keeps one end's set.
 */
const PLANTING: { id: string; x: number; z: number; container?: PlantPlacement['container'] }[] = [
  { id: 'red-yucca', x: -0.06, z: -0.03 },
  // The end seen in the photos (+x, with the house on its right as you face it): fescue in the middle, primroses on
  // the house side, an echeveria and blue sedum spilling over the open side.
  { id: 'blue-fescue', x: 0.28, z: 0.04 },
  { id: 'primrose-red', x: 0.34, z: -0.11 },
  { id: 'primrose-red', x: 0.19, z: -0.12 },
  { id: 'echeveria', x: 0.17, z: 0.12 },
  { id: 'blue-sedum', x: 0.37, z: 0.13 },
  // The other end, turned the other way round.
  { id: 'blue-fescue', x: -0.33, z: -0.06 },
  { id: 'primrose-red', x: -0.35, z: 0.1 },
  { id: 'echeveria', x: -0.24, z: 0.12 },
  { id: 'blue-sedum', x: -0.38, z: -0.13 },
];
const BASE_W = 36 * IN, BASE_D = 16 * IN;

function planterOf(f: FeaturePlacement) {
  const spec = featureById.get(f.catalogId);
  if (!spec || spec.kind !== 'cortenPlanterTall') return null;
  const [W, D, H] = featureSize(spec, f.size, 24 * IN);
  const a = (-f.rotationDeg * Math.PI) / 180;
  return { W, D, H, cos: Math.cos(a), sin: Math.sin(a) };
}

/** The plants of every planted planter, as plant placements in plan space. */
export function planterPlants(features: FeaturePlacement[]): PlantPlacement[] {
  const out: PlantPlacement[] = [];
  for (const f of features) {
    const p = planterOf(f);
    if (!p || f.planted === false) continue;
    const sx = p.W / BASE_W, sz = p.D / BASE_D;
    const short = p.W < 30 * IN - 1e-6;
    PLANTING.forEach((it, k) => {
      if (short && it.x < -0.2) return;
      const lx = short && it.id === 'red-yucca' ? -0.08 * sx : it.x * sx, lz = it.z * sz;
      out.push({ id: `${f.id}-plant-${k}`, catalogId: it.id, source: f.source, position: [f.position[0] + lx * p.cos + lz * p.sin, f.position[1] - lx * p.sin + lz * p.cos] });
    });
  }
  return out;
}

/**
 * Ground height for plants: inside a planter (planted or not, so plants a designer puts in one sit on its soil) the
 * planter's soil, else the ground.
 */
export function plantGround(features: FeaturePlacement[], height: (p: Vec2) => number): (p: Vec2) => number {
  const boxes = features.map((f) => ({ f, p: planterOf(f) })).filter((b) => b.p);
  if (!boxes.length) return height;
  return (q: Vec2) => {
    for (const { f, p } of boxes) {
      const dx = q[0] - f.position[0], dz = q[1] - f.position[1];
      const lx = dx * p!.cos - dz * p!.sin, lz = dx * p!.sin + dz * p!.cos;
      if (Math.abs(lx) < p!.W / 2 - PLATE && Math.abs(lz) < p!.D / 2 - PLATE) return height(f.position) + p!.H - SOIL_DROP + 0.012;
    }
    return height(q);
  };
}
