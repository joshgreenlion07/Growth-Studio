import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { clamp01, fbm, smooth, vnoise } from './noise';

/**
 * Procedural PBR textures, drawn once on the CPU and cached. Every surface in
 * Growth Studio is generated here, so the app ships no image files.
 */

export interface PBRSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** Meters covered by one repeat of the texture. */
  tileMeters: number;
}

export type RGB = [number, number, number];

export function hexRGB(hex: string): RGB {
  // Paint in sRGB: the canvas textures are tagged sRGB. THREE.Color stores
  // linear values, so convert back before painting.
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return [c.r, c.g, c.b];
}

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

interface Sample {
  h: number;
  c: RGB;
  r: number;
}

let anisotropy = 8;
export function setMaxAnisotropy(n: number) {
  anisotropy = Math.min(8, n);
}

/**
 * Keys of the sets the texture worker can paint by itself (texture-recipes.ts
 * resolves each one). Small or one-off sets stay on the main thread.
 */
export const WORKER_KEYS = /^(?:mat:|cap:|cl5g-)|^(?:soil|corten|porcelainPanel|rock|stucco|roofTile|bark|asphalt|poolTile)$/;

/** Paints sets off the main thread; registered by texture-jobs.ts on the page. */
export interface TexturePainter {
  /** False when workers are unavailable or failed; recipes are then painted here. */
  available(): boolean;
  /** Paint `key` in a worker and swap the result into `set`, whose maps are stand-ins. `make` paints it here if the worker fails. */
  request(key: string, set: PBRSet, make: () => PBRSet): void;
  /** Sets requested from now on are newer than every earlier one (and painted first). Returns the new generation. */
  nextGeneration(): number;
  /**
   * A build that asked for sets in generation `gen` was cancelled (a newer plan came): its sets no yard has drawn
   * with are no longer wanted, so they are not painted at the top of the queue (one asked for again is revived).
   */
  cancelGeneration(gen: number): void;
  /** The texture sources `owner` (a built yard) draws with now; null when it is gone. */
  demand(owner: object, sources: Set<THREE.Source<unknown>> | null): void;
}
let painter: TexturePainter | null = null;
export function setTexturePainter(p: TexturePainter | null) {
  painter = p;
}

/** A new build or restyle starts: the sets it asks for are painted before any asked for earlier. */
export function newTextureGeneration(): number {
  return painter?.nextGeneration() ?? 0;
}

/** A build (or restyle) of generation `gen` was cancelled before it was shown (see TexturePainter.cancelGeneration). */
export function cancelTextureGeneration(gen: number) {
  if (gen) painter?.cancelGeneration(gen);
}

/**
 * Tell the painter which sets a yard draws with (null: the yard is gone). Sets no yard draws with any more (a color
 * previewed and then replaced) are dropped from the paint queue, so the newest pick is painted first.
 */
export function textureDemand(owner: object, root: THREE.Object3D | null) {
  if (!painter) return;
  if (!root) return painter.demand(owner, null);
  const out = new Set<THREE.Source<unknown>>();
  const add = (v: unknown) => {
    if (v && (v as THREE.Texture).isTexture) out.add((v as THREE.Texture).source);
  };
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) add(v);
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) (Array.isArray(x?.value) ? x.value : [x?.value]).forEach(add);
    }
  });
  painter.demand(owner, out);
}

/**
 * A stand-in map whose painted image arrives later. Materials clone their
 * maps (to set the repeat), so every clone is remembered and gets the image too.
 */
export class PendingTexture extends THREE.Texture {
  group: Set<THREE.Texture> | null = null;
  clone(): this {
    const c = super.clone();
    // Painted maps hold raw pixels (see texture-jobs.ts): a clone made after they arrived uploads them the same way.
    (c as { isDataTexture?: boolean }).isDataTexture = (this as { isDataTexture?: boolean }).isDataTexture;
    if (this.group) {
      (c as PendingTexture).group = this.group;
      this.group.add(c);
    }
    return c;
  }
}

/** True inside the texture worker (no DOM): paint() then returns raw pixels for the worker to send. */
const IN_WORKER = typeof document === 'undefined';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function texFromCanvas(c: HTMLCanvasElement, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/* sRGB <-> linear lookups for whole-texture color work (4096 steps; plenty for 8-bit output). */
const LUT_N = 4096;
const TO_LIN = new Float32Array(LUT_N + 1).map((_, i) => {
  const v = i / LUT_N;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const TO_SRGB = new Float32Array(LUT_N + 1).map((_, i) => {
  const v = i / LUT_N;
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
});
const lutLin = (v: number) => TO_LIN[Math.round(clamp01(v) * LUT_N)];
const lutSrgb = (v: number) => TO_SRGB[Math.round(clamp01(v) * LUT_N)];

/**
 * Rescale painted sRGB colors (in place) so their average, taken in linear light, is `mean` (linear RGB). The pattern,
 * joints and stone-to-stone variation keep their proportions; only the overall color moves.
 */
function matchMean(C: Float32Array, mean: RGB) {
  const n = C.length / 3;
  const s = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s[k] += lutLin(C[i * 3 + k]);
  const g = s.map((v, k) => (v > 1e-6 ? (mean[k] * n) / v : 1));
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) C[i * 3 + k] = lutSrgb(lutLin(C[i * 3 + k]) * g[k]);
}

/** The three maps of a painted set as RGBA bytes, rows top first (as a canvas holds them). */
export interface PaintedPixels {
  size: number;
  albedo: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  rough: Uint8ClampedArray;
}

/**
 * Run a recipe over every texel and turn its height into a normal map. Pure: no DOM, runs in a worker too. With `mean`
 * (linear RGB) the colors are then rescaled so the texture's average color is exactly that (see matchMean).
 */
export function paintPixels(size: number, normalStrength: number, fn: (u: number, v: number) => Sample, mean?: RGB): PaintedPixels {
  const n = size * size;
  const H = new Float32Array(n);
  const C = new Float32Array(n * 3);
  const R = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = fn(x / size, y / size);
      const i = y * size + x;
      H[i] = s.h;
      C[i * 3] = s.c[0];
      C[i * 3 + 1] = s.c[1];
      C[i * 3 + 2] = s.c[2];
      R[i] = s.r;
    }
  }
  if (mean) matchMean(C, mean);
  const da = new Uint8ClampedArray(n * 4), dn = new Uint8ClampedArray(n * 4), dr = new Uint8ClampedArray(n * 4);
  // Height is in "pixels of relief" scaled by normalStrength.
  const k = normalStrength;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, y0 = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const i = y0 + x;
      const dx = (H[y0 + xp] - H[y0 + xm]) * k;
      const dy = (H[yp + x] - H[ym + x]) * k;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = i * 4;
      dn[o] = (nx * 0.5 + 0.5) * 255;
      dn[o + 1] = (ny * 0.5 + 0.5) * 255;
      dn[o + 2] = (nz * 0.5 + 0.5) * 255;
      dn[o + 3] = 255;
      da[o] = clamp01(C[i * 3]) * 255;
      da[o + 1] = clamp01(C[i * 3 + 1]) * 255;
      da[o + 2] = clamp01(C[i * 3 + 2]) * 255;
      da[o + 3] = 255;
      const r = clamp01(R[i]) * 255;
      dr[o] = r;
      dr[o + 1] = r;
      dr[o + 2] = r;
      dr[o + 3] = 255;
    }
  }
  return { size, albedo: da, normal: dn, rough: dr };
}

function canvasSet(px: PaintedPixels, tileMeters: number): PBRSet {
  const make = (data: Uint8ClampedArray, srgb: boolean) => {
    const c = canvas(px.size);
    const g = c.getContext('2d')!;
    const img = g.createImageData(px.size, px.size);
    img.data.set(data);
    g.putImageData(img, 0, 0);
    return texFromCanvas(c, srgb);
  };
  return { map: make(px.albedo, true), normalMap: make(px.normal, false), roughnessMap: make(px.rough, false), tileMeters };
}

/** In the worker the textures only carry the pixels; the worker posts them to the page. */
function pixelSet(px: PaintedPixels, tileMeters: number): PBRSet {
  const tex = (data: Uint8ClampedArray) => new THREE.Texture({ data, width: px.size, height: px.size, pixels: px });
  return { map: tex(px.albedo), normalMap: tex(px.normal), roughnessMap: tex(px.rough), tileMeters };
}

/** In the texture worker: paint no map larger than this (a quick first copy of a large set); 0 paints full size. */
let sizeCap = 0;
let cappedFrom = 0;
export function setPaintSizeCap(n: number) {
  sizeCap = n;
  cappedFrom = 0;
}
/** The full size of the largest map painted smaller than its recipe asks for since setPaintSizeCap (0: none was). */
export function paintCappedFrom(): number {
  return cappedFrom;
}

/** Set while textureSet() runs a recipe only to learn its average color (see previewSet). */
let previewing = false;
/** True while a recipe is only being sampled for its stand-in color (see previewSet): a costly recipe can skip its setup. */
export function paintPreviewing(): boolean {
  return previewing;
}

/**
 * Paint a seamless PBR set from a per-pixel function of (u, v) in [0,1). With `mean` (linear RGB), the painted colors
 * are rescaled so the texture's average color is exactly that (see matchMean); the preview stand-in shows it too.
 */
export function paint(size: number, tileMeters: number, normalStrength: number, fn: (u: number, v: number) => Sample, mean?: RGB): PBRSet {
  if (previewing) return previewSet(tileMeters, fn, mean);
  let k = normalStrength;
  if (sizeCap && size > sizeCap) {
    // A quick low-resolution copy: relief is in texels, so it is scaled to keep the same slopes.
    k = (normalStrength * sizeCap) / size;
    cappedFrom = Math.max(cappedFrom, size);
    size = sizeCap;
  }
  const px = paintPixels(size, k, fn, mean);
  return IN_WORKER ? pixelSet(px, tileMeters) : canvasSet(px, tileMeters);
}

/** Texels sampled (per side) to find a recipe's average color: 1,024 calls, about a millisecond. */
const PREVIEW_SAMPLES = 32;

/**
 * The stand-in shown while the worker paints: the recipe's average color,
 * a flat normal and its average roughness, as tiny textures that are swapped
 * for the painted ones in place (see texture-jobs.ts).
 */
function previewSet(tileMeters: number, fn: (u: number, v: number) => Sample, mean?: RGB): PBRSet {
  const N = PREVIEW_SAMPLES;
  let r = 0, g = 0, b = 0, ro = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const s = fn((x + 0.5) / N, (y + 0.5) / N);
      r += clamp01(s.c[0]);
      g += clamp01(s.c[1]);
      b += clamp01(s.c[2]);
      ro += clamp01(s.r);
    }
  }
  const k = 255 / (N * N);
  const avg: [number, number, number, number] = [Math.round(r * k), Math.round(g * k), Math.round(b * k), Math.round(ro * k)];
  if (mean) for (let i = 0; i < 3; i++) avg[i] = Math.round(lutSrgb(mean[i]) * 255);
  return {
    map: pendingTexture([avg[0], avg[1], avg[2]], true),
    normalMap: pendingTexture([128, 128, 255], false),
    roughnessMap: pendingTexture([avg[3], avg[3], avg[3]], false),
    tileMeters,
  };
}

function pendingTexture(rgb: [number, number, number], srgb: boolean): PendingTexture {
  const c = canvas(2);
  const g = c.getContext('2d')!;
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, 2, 2);
  const t = new PendingTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.userData.flat = rgb;
  t.group = new Set([t]);
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* Surface recipes                                                     */
/* ------------------------------------------------------------------ */

export const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function paintStucco(): PBRSet {
  const a: RGB = [0.86, 0.82, 0.74], b: RGB = [0.8, 0.76, 0.68];
  return paint(512, 2, 7, (u, v) => {
    const n = fbm(u, v, 8, 5, 3);
    const fine = vnoise(u * 300, v * 300, 300, 2);
    return { h: n * 0.4 + fine * 0.6, c: mulRGB(mixRGB(a, b, n), 0.95 + fine * 0.07), r: 0.92 };
  });
}

function paintRoofTile(): PBRSet {
  const a: RGB = [0.36, 0.33, 0.31], b: RGB = [0.45, 0.4, 0.36];
  const RH = 0.33, CW = 0.42, T = 1.68;
  return paint(512, T, 10, (u, v) => {
    const x = u * T, y = v * T;
    const row = Math.floor(y / RH);
    const xs = x + (row % 2 ? CW / 2 : 0);
    const col = Math.floor(xs / CW);
    const ly = (y - row * RH) / RH;
    const lx = (xs - col * CW) / CW;
    const id = hash(((col % 4) + 4) % 4, row);
    const n = vnoise(u * 200, v * 200, 200, 3);
    const lap = smooth(0.0, 0.85, ly);
    const seam = Math.min(lx, 1 - lx) < 0.025;
    let c = mixRGB(a, b, id * 0.8 + n * 0.2);
    c = mulRGB(c, (0.6 + lap * 0.45) * (seam ? 0.7 : 1));
    return { h: lap * 0.8 + n * 0.1, c, r: 0.85 };
  });
}

function paintBark(): PBRSet {
  const a: RGB = [0.27, 0.22, 0.18], b: RGB = [0.45, 0.4, 0.34];
  return paint(256, 0.8, 9, (u, v) => {
    const furrow = vnoise(u * 10, v * 2, 10, 4) * 0.6 + vnoise(u * 26, v * 5, 26, 5) * 0.4;
    const ridge = smooth(0.35, 0.65, furrow);
    const n = vnoise(u * 90, v * 60, 90, 6);
    return { h: ridge, c: mulRGB(mixRGB(a, b, ridge * 0.8 + n * 0.2), 0.75 + ridge * 0.4), r: 0.95 };
  });
}

function paintAsphalt(): PBRSet {
  return paint(512, 3, 4, (u, v) => {
    const agg = vnoise(u * 600, v * 600, 600, 1);
    const n = fbm(u, v, 4, 4, 3);
    const g = 0.17 + n * 0.05 + (agg > 0.86 ? 0.08 : 0);
    return { h: agg, c: [g, g, g * 1.02], r: 0.9 };
  });
}

function paintPoolTile(): PBRSet {
  const T = 1.2, S = 0.15;
  return paint(512, T, 3, (u, v) => {
    const x = u * T, y = v * T;
    const lx = x % S, ly = y % S;
    const grout = Math.min(lx, S - lx, ly, S - ly) < 0.004;
    const id = hash(Math.floor(x / S), Math.floor(y / S));
    const c: RGB = grout ? [0.8, 0.82, 0.82] : mixRGB([0.55, 0.74, 0.8], [0.62, 0.8, 0.84], id);
    return { h: grout ? 0 : 1, c, r: grout ? 0.8 : 0.2 };
  });
}

const cache = new Map<string, PBRSet>();

/**
 * One cached PBR set per key. On the page, recipes the texture worker knows
 * (see WORKER_KEYS) are painted off the main thread: the set comes back at
 * once with the material's flat average color, and the painted maps replace
 * it in place a moment later with a short crossfade. Elsewhere (and when
 * workers are unavailable) the recipe is painted here, synchronously.
 */
export function textureSet(key: string, make: () => PBRSet): PBRSet {
  let t = cache.get(key);
  if (t) return t;
  if (previewing) return make();
  if (!IN_WORKER && painter && WORKER_KEYS.test(key) && painter.available()) {
    previewing = true;
    try {
      t = make();
    } finally {
      previewing = false;
    }
    if (t.map instanceof PendingTexture && t.normalMap instanceof PendingTexture && t.roughnessMap instanceof PendingTexture) {
      cache.set(key, t);
      painter.request(key, t, make);
      return t;
    }
  }
  t = make();
  cache.set(key, t);
  return t;
}

/** Shared house, roof, bark, road and pool textures: painted once (in the worker) and kept. */
/** Forget every cached set. The worker calls it after each job so it holds no pixels. */
export function clearTextureSets() {
  cache.clear();
}

const cached = (key: string, make: () => PBRSet) => () => textureSet(key, make);
export const stucco = cached('stucco', paintStucco);
export const roofTile = cached('roofTile', paintRoofTile);
export const bark = cached('bark', paintBark);
export const asphalt = cached('asphalt', paintAsphalt);
export const poolTile = cached('poolTile', paintPoolTile);

/* ------------------------------------------------------------------ */
/* Foliage                                                              */
/* ------------------------------------------------------------------ */

/** Atlas cells, each a quarter of the texture. */
export const LEAF_CELL = { broad: 0, small: 1, needle: 2, flower: 3 } as const;

/** UV rectangle [u0, v0, u1, v1] for an atlas cell. */
export function leafCellUV(cell: number): [number, number, number, number] {
  const cx = cell % 2, cy = Math.floor(cell / 2);
  return [cx * 0.5, 1 - (cy + 1) * 0.5, (cx + 1) * 0.5, 1 - cy * 0.5];
}

function drawLeaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number, shade: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const grad = g.createLinearGradient(0, 0, len, 0);
  const s = Math.round(170 + shade * 70);
  grad.addColorStop(0, `rgb(${s - 30},${s - 25},${s - 30})`);
  grad.addColorStop(1, `rgb(${s},${s},${s - 8})`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 0.8, len, 0);
  g.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.25, wid, 0, 0);
  g.fill();
  g.strokeStyle = `rgba(90,90,80,0.55)`;
  g.lineWidth = Math.max(1, wid * 0.08);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.92, 0);
  g.stroke();
  g.restore();
}

export function leafAtlas(): THREE.Texture {
  const key = 'leafAtlas';
  const hit = cache.get(key);
  if (hit) return hit.map;
  const S = 1024, C = 512;
  const cv = canvas(S);
  const g = cv.getContext('2d')!;
  const r = rng('leaves');

  // Broad leaf cluster: leaves fanning from a twig at the cell's bottom.
  g.save();
  g.translate(0, 0);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const d = 40 + r() * 170;
    const x = C / 2 + Math.cos(a) * d * 0.9, y = C * 0.86 + Math.sin(a) * d * 1.6;
    drawLeaf(g, x, y, 70 + r() * 60, 22 + r() * 14, a + (r() - 0.5) * 0.9, r());
  }
  g.restore();

  // Small leaves for shrubs: dense rounded leaves filling the cell.
  g.save();
  g.translate(C, 0);
  for (let i = 0; i < 120; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * C * 0.44;
    drawLeaf(g, C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 28 + r() * 22, 11 + r() * 6, r() * Math.PI * 2, r());
  }
  g.restore();

  // Needle and scale foliage for conifers.
  g.save();
  g.translate(0, C);
  for (let i = 0; i < 70; i++) {
    const x0 = C / 2 + (r() - 0.5) * C * 0.6, y0 = C * 0.95;
    const x1 = x0 + (r() - 0.5) * C * 0.5, y1 = C * (0.08 + r() * 0.3);
    const s = Math.round(150 + r() * 90);
    g.strokeStyle = `rgb(${s},${s},${s - 10})`;
    g.lineWidth = 5 + r() * 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 60, (y0 + y1) / 2, x1, y1);
    g.stroke();
    for (let k = 0; k < 9; k++) {
      const t = 0.2 + k * 0.09;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      drawLeaf(g, px, py, 26 + r() * 14, 7, (r() - 0.5) * 2.6 - Math.PI / 2, r());
    }
  }
  g.restore();

  // Flower clusters: white five-petal flowers that vertex color tints.
  g.save();
  g.translate(C, C);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * C * 0.36;
    const fx = C / 2 + Math.cos(a) * d, fy = C / 2 + Math.sin(a) * d;
    const rad = 30 + r() * 22;
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + r() * 0.3;
      g.fillStyle = `rgb(${235 + r() * 20},${235 + r() * 20},${235 + r() * 20})`;
      g.beginPath();
      g.ellipse(fx + Math.cos(pa) * rad * 0.5, fy + Math.sin(pa) * rad * 0.5, rad * 0.5, rad * 0.32, pa, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgb(200,170,90)';
    g.beginPath();
    g.arc(fx, fy, rad * 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  const t = texFromCanvas(cv, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, { map: t, normalMap: t, roughnessMap: t, tileMeters: 1 });
  return t;
}

/** Soft dark disc used for contact shade under plants and objects. */
export function aoDisc(): THREE.Texture {
  const key = 'aoDisc';
  const hit = cache.get(key);
  if (hit) return hit.map;
  const cv = canvas(128);
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = texFromCanvas(cv, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, { map: t, normalMap: t, roughnessMap: t, tileMeters: 1 });
  return t;
}
