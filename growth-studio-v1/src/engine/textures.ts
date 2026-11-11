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

/** Paint a seamless PBR set from a per-pixel function of (u, v) in [0,1). */
export function paint(size: number, tileMeters: number, normalStrength: number, fn: (u: number, v: number) => Sample): PBRSet {
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
  const ca = canvas(size), cn = canvas(size), cr = canvas(size);
  const da = ca.getContext('2d')!.createImageData(size, size);
  const dn = cn.getContext('2d')!.createImageData(size, size);
  const dr = cr.getContext('2d')!.createImageData(size, size);
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
      dn.data[o] = (nx * 0.5 + 0.5) * 255;
      dn.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      dn.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      dn.data[o + 3] = 255;
      da.data[o] = clamp01(C[i * 3]) * 255;
      da.data[o + 1] = clamp01(C[i * 3 + 1]) * 255;
      da.data[o + 2] = clamp01(C[i * 3 + 2]) * 255;
      da.data[o + 3] = 255;
      const r = clamp01(R[i]) * 255;
      dr.data[o] = r;
      dr.data[o + 1] = r;
      dr.data[o + 2] = r;
      dr.data[o + 3] = 255;
    }
  }
  ca.getContext('2d')!.putImageData(da, 0, 0);
  cn.getContext('2d')!.putImageData(dn, 0, 0);
  cr.getContext('2d')!.putImageData(dr, 0, 0);
  return { map: texFromCanvas(ca, true), normalMap: texFromCanvas(cn, false), roughnessMap: texFromCanvas(cr, false), tileMeters };
}

/* ------------------------------------------------------------------ */
/* Surface recipes                                                     */
/* ------------------------------------------------------------------ */

export const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function stucco(): PBRSet {
  const a: RGB = [0.86, 0.82, 0.74], b: RGB = [0.8, 0.76, 0.68];
  return paint(512, 2, 7, (u, v) => {
    const n = fbm(u, v, 8, 5, 3);
    const fine = vnoise(u * 300, v * 300, 300, 2);
    return { h: n * 0.4 + fine * 0.6, c: mulRGB(mixRGB(a, b, n), 0.95 + fine * 0.07), r: 0.92 };
  });
}

export function roofTile(): PBRSet {
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

export function bark(): PBRSet {
  const a: RGB = [0.27, 0.22, 0.18], b: RGB = [0.45, 0.4, 0.34];
  return paint(256, 0.8, 9, (u, v) => {
    const furrow = vnoise(u * 10, v * 2, 10, 4) * 0.6 + vnoise(u * 26, v * 5, 26, 5) * 0.4;
    const ridge = smooth(0.35, 0.65, furrow);
    const n = vnoise(u * 90, v * 60, 90, 6);
    return { h: ridge, c: mulRGB(mixRGB(a, b, ridge * 0.8 + n * 0.2), 0.75 + ridge * 0.4), r: 0.95 };
  });
}

export function asphalt(): PBRSet {
  return paint(512, 3, 4, (u, v) => {
    const agg = vnoise(u * 600, v * 600, 600, 1);
    const n = fbm(u, v, 4, 4, 3);
    const g = 0.17 + n * 0.05 + (agg > 0.86 ? 0.08 : 0);
    return { h: agg, c: [g, g, g * 1.02], r: 0.9 };
  });
}

export function poolTile(): PBRSet {
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

export function textureSet(key: string, make: () => PBRSet): PBRSet {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

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
