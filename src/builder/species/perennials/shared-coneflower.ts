import * as THREE from 'three';
import { GeoBuilder, V, UP, clamp, col, leafTexture, lerp, perp, rng } from '../kit';
import { sheet, toothedLeafPath } from './shared-perennials';

/** Textures and head geometry for the purple coneflower (Echinacea purpurea). */

/* ------------------------------------------------------------------ */
/* Leaf atlas: 4 cells, each 256 wide x 1024 tall, base at the bottom.  */
/* 0, 1 basal leaves with long petioles; 2, 3 stem leaves.              */
/* ------------------------------------------------------------------ */

function paintLeaf(g: CanvasRenderingContext2D, r: () => number, cx: number, baseY: number, len: number, wid: number, petiole: number, teeth: number, tone: number, basal: boolean) {
  // Petiole: pale green, often flushed with purple-brown at the very base.
  if (petiole > 0) {
    const grad = g.createLinearGradient(0, 1024, 0, baseY);
    grad.addColorStop(0, '#7a6a52');
    grad.addColorStop(0.3, '#6f8a52');
    grad.addColorStop(1, '#6a8f4c');
    g.strokeStyle = grad;
    g.lineWidth = 16;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx, 1024);
    g.lineTo(cx, baseY + 4);
    g.stroke();
  }
  g.save();
  g.translate(cx, baseY);
  g.rotate(-Math.PI / 2);
  const grad = g.createLinearGradient(0, 0, len, 0);
  const a = tone;
  grad.addColorStop(0, `rgb(${52 + a * 10},${96 + a * 12},${44})`);
  grad.addColorStop(0.5, `rgb(${44 + a * 8},${86 + a * 10},${38})`);
  grad.addColorStop(1, `rgb(${56 + a * 8},${100 + a * 10},${46})`);
  toothedLeafPath(g, len, wid, 0.3, teeth, 0.1);
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // Rough, hairy surface: dense speckle and small blotches.
  for (let i = 0; i < 1400; i++) {
    const x = r() * len, y = (r() - 0.5) * wid;
    g.fillStyle = r() < 0.5 ? `rgba(22,52,22,${0.1 + r() * 0.16})` : `rgba(150,185,110,${0.07 + r() * 0.12})`;
    g.fillRect(x, y, 1.5 + r() * 3, 1.5 + r() * 3);
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(30,62,28,${0.05 + r() * 0.07})` : `rgba(120,160,80,${0.04 + r() * 0.06})`;
    g.beginPath();
    g.ellipse(r() * len, (r() - 0.5) * wid, 10 + r() * 24, 6 + r() * 14, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Fine net of side veins, dark, running off the midrib and the two lateral veins.
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(22,50,22,0.28)';
  g.lineWidth = 1.5;
  const pairs = basal ? 16 : 12;
  for (let i = 1; i <= pairs; i++) {
    const t = 0.06 + (i / (pairs + 1)) * 0.86;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(len * t, 0);
      g.quadraticCurveTo(len * (t + 0.05), s * wid * 0.2, len * (t + 0.1), s * wid * 0.44 * Math.sin(Math.PI * Math.min(1, t + 0.1)) * 0.95);
      g.stroke();
    }
  }
  // Three prominent parallel veins from the base: midrib plus two arching laterals.
  g.strokeStyle = 'rgba(120,160,88,0.7)';
  g.lineWidth = basal ? 5.5 : 4;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.96, 0);
  g.stroke();
  g.lineWidth = basal ? 3.6 : 2.6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(len * 0.02, s * 3);
    g.bezierCurveTo(len * 0.22, s * wid * 0.3, len * 0.55, s * wid * 0.3, len * 0.9, s * wid * 0.03);
    g.stroke();
  }
  g.restore();
  // A thin lighter edge so serrations read.
  g.strokeStyle = 'rgba(70,110,55,0.5)';
  g.lineWidth = 2;
  toothedLeafPath(g, len, wid, 0.3, teeth, 0.1);
  g.stroke();
  g.restore();
}

export function coneLeafMap(): THREE.Texture {
  return leafTexture('coneflower-leaves', 1024, 1024, (g) => {
    const r = rng('coneflower-leaf-tex');
    // Basal leaves: long petiole (bottom 36%), ovate blade.
    paintLeaf(g, r, 128, 650, 620, 252, 1, 11, 0, true);
    paintLeaf(g, r, 384, 640, 610, 240, 1, 10, 1, true);
    // Stem leaves: narrower, ovate-lanceolate, nearly stalkless.
    paintLeaf(g, r, 640, 980, 950, 246, 0, 9, 0.5, false);
    paintLeaf(g, r, 896, 985, 940, 222, 0, 7, 1.5, false);
  });
}

/* ------------------------------------------------------------------ */
/* Flower atlas 1024 x 1024.                                            */
/*  top row (y 0..512): four petal cells 256 x 512, base at the bottom  */
/*  bottom row: cone disc 512x512 | spent cone 256x256 | green 256x256  */
/* ------------------------------------------------------------------ */

export const PETAL_UV = (i: number): [number, number, number, number] => [i / 4, 0.5, (i + 1) / 4, 1];
export const CONE_UV: [number, number, number, number] = [0, 0, 0.5, 0.5];
export const SPENT_UV: [number, number, number, number] = [0.5, 0.25, 0.75, 0.5];
export const GREEN_UV: [number, number, number, number] = [0.75, 0.25, 1, 0.5];

function paintPetal(g: CanvasRenderingContext2D, r: () => number, x0: number, v: number) {
  const cx = x0 + 128, base = 510, top = 6;
  const hwMax = 94;
  const hw = (t: number) => {
    const s = t < 0.68 ? Math.pow(Math.sin((t / 0.68) * Math.PI * 0.5), 1.05) : Math.pow(Math.cos(((t - 0.68) / 0.32) * Math.PI * 0.5 * 0.82), 0.7);
    return 12 + (hwMax - 12) * s;
  };
  const N = 40;
  g.beginPath();
  g.moveTo(cx - 12, base);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    g.lineTo(cx - hw(t) + (t > 0.97 ? 3 : 0), lerp(base, top + 26, t));
  }
  // notched tip with teeth
  g.lineTo(cx - 40, top + 10);
  g.lineTo(cx - 24, top + 3);
  g.lineTo(cx - 8, top + 24);
  g.lineTo(cx + 8, top + 3);
  g.lineTo(cx + 24, top + 3);
  g.lineTo(cx + 40, top + 10);
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    g.lineTo(cx + hw(t) - (t > 0.97 ? 3 : 0), lerp(base, top + 26, t));
  }
  g.lineTo(cx + 12, base);
  g.closePath();
  // rose-pink to magenta-purple, deeper at the base
  const grad = g.createLinearGradient(0, base, 0, top);
  const tones = [
    ['#a0306f', '#c8489a', '#df70b2'],
    ['#a8347a', '#cf4fa0', '#e47cb8'],
    ['#9c2e6e', '#c0428e', '#d862a8'],
    ['#ae3a80', '#d6559f', '#e886bd'],
  ][v];
  grad.addColorStop(0, tones[0]);
  grad.addColorStop(0.35, tones[1]);
  grad.addColorStop(1, tones[2]);
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // fine parallel veins, converging at the base
  g.lineCap = 'round';
  for (let k = -5; k <= 5; k++) {
    g.strokeStyle = k === 0 ? 'rgba(110,25,75,0.55)' : `rgba(120,30,82,${0.22 + r() * 0.12})`;
    g.lineWidth = k === 0 ? 3.2 : 1.8;
    g.beginPath();
    g.moveTo(cx + k * 1.4, base);
    g.quadraticCurveTo(cx + k * 12, lerp(base, top, 0.55), cx + k * 14.5, top + 28 + Math.abs(k) * 2);
    g.stroke();
  }
  // soft light streaks and a darker crease along the midline
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(255,190,225,${0.05 + r() * 0.07})`;
    g.lineWidth = 2 + r() * 3;
    const x = cx + (r() - 0.5) * 150;
    g.beginPath();
    g.moveTo(x * 0.3 + cx * 0.7, lerp(base, top, 0.1));
    g.lineTo(x, lerp(base, top, 0.9));
    g.stroke();
  }
  g.restore();
}

function paintCone(g: CanvasRenderingContext2D, r: () => number, ox: number, oy: number, S: number, spent: boolean) {
  const R = S / 2;
  g.save();
  g.translate(ox + R, oy + R);
  const bg = g.createRadialGradient(0, 0, 0, 0, 0, R);
  if (spent) {
    bg.addColorStop(0, '#2a160c');
    bg.addColorStop(0.7, '#3a1e10');
    bg.addColorStop(1, '#2a160c');
  } else {
    bg.addColorStop(0, '#7a4c1e');
    bg.addColorStop(0.5, '#8a4a1a');
    bg.addColorStop(1, '#5e3014');
  }
  g.fillStyle = bg;
  g.fillRect(-R, -R, S, S);
  const N = spent ? 520 : 620;
  for (let i = 0; i < N; i++) {
    const rr = R * 0.97 * Math.sqrt((i + 0.5) / N), a = i * 2.39996;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    const sz = (S / 512) * (6 + (rr / R) * 5);
    // dark pit around each spiny palea
    g.fillStyle = spent ? 'rgba(14,6,3,0.7)' : 'rgba(36,16,6,0.7)';
    g.beginPath();
    g.arc(x, y, sz * 1.25, 0, Math.PI * 2);
    g.fill();
    // bronze to copper spine tip, pointing outward from the middle
    const hot = !spent && rr / R < 0.82 && r() < 0.55;
    g.fillStyle = spent ? (r() < 0.5 ? '#5a3320' : '#4a2616') : hot ? (r() < 0.5 ? '#e08a2c' : '#cf6f22') : r() < 0.5 ? '#a8581c' : '#c06a20';
    g.beginPath();
    g.ellipse(x + Math.cos(a) * sz * 0.2, y + Math.sin(a) * sz * 0.2, sz * 0.9, sz * 0.62, a, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = spent ? 'rgba(80,50,34,0.7)' : 'rgba(245,170,70,0.65)';
    g.lineWidth = Math.max(1, sz * 0.22);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * sz * 0.9, y + Math.sin(a) * sz * 0.9);
    g.stroke();
  }
  // a ring of tiny yellow-orange florets in bloom
  if (!spent) {
    for (let i = 0; i < 90; i++) {
      const a = r() * 6.28, rr = R * (0.45 + r() * 0.3);
      g.fillStyle = `rgba(240,170,50,${0.5 + r() * 0.4})`;
      g.beginPath();
      g.arc(Math.cos(a) * rr, Math.sin(a) * rr, S / 512 * (2 + r() * 2.5), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

export function coneFlowerMap(): THREE.Texture {
  return leafTexture('coneflower-flowers', 1024, 1024, (g) => {
    const r = rng('coneflower-flower-tex');
    for (let i = 0; i < 4; i++) paintPetal(g, r, i * 256, i);
    paintCone(g, r, 0, 512, 512, false);
    paintCone(g, r, 512, 512, 256, true);
    g.fillStyle = '#cf7a2c';
    g.fillRect(0, 1004, 20, 20);
    g.fillStyle = '#4e2c1a';
    g.fillRect(512, 512, 20, 20);
    // green phyllaries and receptacle
    const gx = 768, gy = 512;
    const gg = g.createLinearGradient(gx, gy, gx + 256, gy + 256);
    gg.addColorStop(0, '#5a8a3a');
    gg.addColorStop(1, '#4a7a32');
    g.fillStyle = gg;
    g.fillRect(gx, gy, 256, 256);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = r() < 0.5 ? 'rgba(130,170,90,0.4)' : 'rgba(40,80,30,0.35)';
      g.lineWidth = 1.5 + r() * 2.5;
      const x = gx + r() * 256;
      g.beginPath();
      g.moveTo(x, gy);
      g.lineTo(x + (r() - 0.5) * 20, gy + 256);
      g.stroke();
    }
    // dull purple flush on the phyllary tips
    g.fillStyle = 'rgba(120,70,100,0.25)';
    g.fillRect(gx, gy, 256, 40);
  });
}

/* ------------------------------------------------------------------ */
/* Flower heads                                                         */
/* ------------------------------------------------------------------ */

export type Stage = 'open' | 'opening' | 'bud' | 'spent';

const tmpA = V(), tmpB = V();

function basis(n: THREE.Vector3) {
  const a = perp(n);
  const b = V().crossVectors(n, a).normalize();
  return { a, b };
}

/** A dome of rings around axis n with base center c; planar uv from above in the cone disc. */
function dome(g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, Rc: number, Hc: number, rings: number, sides: number, uv: [number, number, number, number], color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number, r: () => number) {
  const { a, b } = basis(n);
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
  const ids: number[][] = [];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI * 0.5 * 0.96;
    const rad = Rc * Math.cos(phi) , h = Hc * Math.pow(Math.sin(phi), 0.85);
    const row: number[] = [];
    const nsd = i === rings ? 1 : sides;
    for (let s = 0; s < nsd; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const p = c.clone().addScaledVector(a, dx * rad).addScaledVector(b, dy * rad).addScaledVector(n, h);
      const nn = a.clone().multiplyScalar(dx * Math.cos(phi) * Hc).addScaledVector(b, dy * Math.cos(phi) * Hc).addScaledVector(n, Math.sin(phi) * Rc * 0.9).normalize();
      const shade = 0.85 + r() * 0.25;
      const cc = color.clone().multiplyScalar(shade);
      row.push(g.vert(p, nn, um + (dx * rad / Rc) * ur, vm + (dy * rad / Rc) * vr, cc, birth, anchor, sway));
    }
    ids.push(row);
  }
  for (let i = 0; i < rings; i++) {
    const A = ids[i], B = ids[i + 1];
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      if (B.length === 1) g.tri(A[s], A[s2], B[0]);
      else {
        g.quad(A[s], A[s2], B[s2], B[s]);
      }
    }
  }
}

/** Spiky paleae over the dome. */
function spikes(g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, Rc: number, Hc: number, count: number, len: number, uv: [number, number, number, number], birth: number, anchor: THREE.Vector3, sway: number, r: () => number, tint: number) {
  const { a, b } = basis(n);
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
  for (let i = 0; i < count; i++) {
    const f = Math.sqrt((i + 0.5) / count);
    const ang = i * 2.39996;
    const phi = (1 - f) * 1.45; // 0 at the rim .. top
    const rad = Rc * Math.cos(phi) * 0.97, h = Hc * Math.pow(Math.sin(phi), 0.85);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const p = c.clone().addScaledVector(a, dx * rad).addScaledVector(b, dy * rad).addScaledVector(n, h);
    const out = tmpA.copy(a).multiplyScalar(dx * Math.cos(phi)).addScaledVector(b, dy * Math.cos(phi)).addScaledVector(n, Math.sin(phi) * 1.4).normalize().clone();
    const tip = p.clone().addScaledVector(out, len * (0.8 + r() * 0.5));
    const tan = tmpB.crossVectors(out, n).normalize().clone();
    const w = len * 0.2;
    const swatch = uv === SPENT_UV ? [0.506, 0.494] : [0.01, 0.01];
    const u = swatch[0], v = swatch[1];
    void ur; void vr; void um; void vm;
    const k = tint * (0.9 + r() * 0.2);
    const cb = new THREE.Color(k * 0.8, k * 0.75, k * 0.7), ct = new THREE.Color(k * 1.15, k * 1.1, k * 1.0);
    const i0 = g.vert(p.clone().addScaledVector(tan, -w), out, u, v, cb, birth, anchor, sway);
    const i1 = g.vert(p.clone().addScaledVector(tan, w), out, u, v, cb, birth, anchor, sway);
    const i2 = g.vert(tip, out, u, v, ct, birth, anchor, sway);
    g.tri(i0, i1, i2);
  }
}

/** One ray petal: a short curved sheet, base near the cone, drooping or lifted. */
function petal(g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, az: number, Rbase: number, len: number, wid: number, e0: number, e1: number, cell: number, color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number, r: () => number, curlSide = 0.12) {
  const { a, b } = basis(n);
  const radial = a.clone().multiplyScalar(Math.cos(az)).addScaledVector(b, Math.sin(az));
  const side = V().crossVectors(n, radial).normalize();
  const rows = 5, cols = 3;
  const grid: THREE.Vector3[][] = [];
  const p = c.clone().addScaledVector(radial, Rbase).addScaledVector(n, -0.004);
  const twist = (r() - 0.5) * 0.5;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const e = lerp(e0, e1, Math.pow(t, 1.15));
    const d = radial.clone().multiplyScalar(Math.cos(e)).addScaledVector(n, Math.sin(e));
    if (i > 0) p.addScaledVector(d, len / (rows - 1));
    const up = V().crossVectors(side, d).normalize();
    if (up.dot(n) < 0) up.multiplyScalar(-1);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j < cols; j++) {
      const x = j / (cols - 1) - 0.5;
      const edge = Math.abs(x) * 2;
      const q = p.clone().addScaledVector(side, x * wid * Math.cos(twist * t)).addScaledVector(up, x * wid * Math.sin(twist * t));
      // the rays are a little keeled: edges roll down
      q.addScaledVector(up, -edge * edge * wid * curlSide * Math.sin(Math.PI * Math.min(1, t * 1.2)));
      row.push(q);
    }
    grid.push(row);
  }
  sheet(g, grid, PETAL_UV(cell), (i) => color.clone().multiplyScalar(lerp(0.78, 1, i / (rows - 1))), birth, anchor, () => sway);
}

export interface HeadOpts {
  stage: Stage;
  size: number; // petal reach radius scale (1 = 4.3 cm radius)
}

export function head(F: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, o: HeadOpts, birth: number, sway: number, r: () => number) {
  const anchor = c;
  const s = o.size;
  const white = new THREE.Color(1, 1, 1);
  const nn = n.clone().normalize();
  const { a, b } = basis(nn);
  const green = col('#ffffff', 0.95);

  // Green phyllary cup under the head: a fan of pointed bracts.
  const nb = o.stage === 'bud' ? 14 : 12;
  const cupR = (o.stage === 'bud' ? 0.0115 : 0.0105) * s;
  for (let k = 0; k < nb; k++) {
    const ang = (k / nb) * Math.PI * 2 + (r() - 0.5) * 0.25;
    const out = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
    const side = V().crossVectors(nn, out).normalize();
    const spread = o.stage === 'bud' ? 0.15 : o.stage === 'opening' ? 0.45 : 0.9;
    const bl = (o.stage === 'bud' ? 0.017 : 0.013) * s * (0.85 + r() * 0.3);
    const tipDir = out.clone().multiplyScalar(spread).addScaledVector(nn, o.stage === 'bud' ? 1 : 0.15).normalize();
    const w = 0.0034 * s;
    const bp = c.clone().addScaledVector(out, cupR * 0.55).addScaledVector(nn, -0.006 * s);
    const mid = bp.clone().addScaledVector(out, cupR * 0.5).addScaledVector(nn, bl * 0.5);
    const tip = bp.clone().addScaledVector(tipDir, bl).addScaledVector(out, cupR * 0.25);
    const gk = green.clone().multiplyScalar(0.85 + r() * 0.2);
    const nrm = out.clone().multiplyScalar(0.7).addScaledVector(nn, 0.3).normalize();
    const u = (GREEN_UV[0] + GREEN_UV[2]) / 2, v = (GREEN_UV[1] + GREEN_UV[3]) / 2;
    const i0 = F.vert(bp.clone().addScaledVector(side, -w * 0.9), nrm, u - 0.05, v - 0.05, gk, birth, anchor, sway);
    const i1 = F.vert(bp.clone().addScaledVector(side, w * 0.9), nrm, u + 0.05, v - 0.05, gk, birth, anchor, sway);
    const i2 = F.vert(mid.clone().addScaledVector(side, -w * 0.8), nrm, u - 0.05, v, gk, birth, anchor, sway);
    const i3 = F.vert(mid.clone().addScaledVector(side, w * 0.8), nrm, u + 0.05, v, gk, birth, anchor, sway);
    const i4 = F.vert(tip, nrm, u, v + 0.06, gk.clone().multiplyScalar(1.05), birth, anchor, sway);
    F.quad(i0, i1, i3, i2);
    F.tri(i2, i3, i4);
  }

  if (o.stage === 'bud') {
    // closed bud: green dome with a hint of purple at the crown
    dome(F, c.clone().addScaledVector(nn, -0.004 * s), nn, 0.0105 * s, 0.014 * s, 4, 9, GREEN_UV, green, birth, anchor, sway, r);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const out = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      petal(F, c.clone().addScaledVector(nn, 0.007 * s), nn, ang, 0.002 * s, 0.01 * s, 0.006 * s, 1.35, 1.5, k % 4, new THREE.Color(0.9, 0.9, 0.9), birth, anchor, sway, r, 0.05);
      void out;
    }
    return;
  }

  const Rc = (o.stage === 'spent' ? 0.0155 : 0.0165) * s;
  const Hc = (o.stage === 'spent' ? 0.024 : 0.021) * s;
  const spent = o.stage === 'spent';
  // Receptacle plate under the cone (dark green-brown) so petals have a base.
  dome(F, c.clone().addScaledVector(nn, -0.001 * s), nn, Rc * 1.02, Hc, 5, 14, spent ? SPENT_UV : CONE_UV, spent ? new THREE.Color(0.95, 0.95, 0.95) : new THREE.Color(1, 0.98, 0.96), birth, anchor, sway, r);
  spikes(F, c.clone().addScaledVector(nn, -0.001 * s), nn, Rc * 1.02, Hc, spent ? 70 : 64, 0.0058 * s, spent ? SPENT_UV : CONE_UV, birth, anchor, sway, r, spent ? 1 : 1.05);

  if (o.stage === 'spent') {
    // a couple of faded petals clinging, dry brownish, hanging down
    const left = 2 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < left; k++) {
      const az = r() * 6.28;
      petal(F, c, nn, az, Rc * 0.8, 0.026 * s, 0.009 * s, -0.5, -1.6, 3, new THREE.Color(0.4, 0.3, 0.28), birth, anchor, sway, r, 0.2);
    }
    return;
  }

  const n1 = o.stage === 'opening' ? 14 : 17;
  let az = r() * 6.28;
  for (let k = 0; k < n1; k++) {
    az += (Math.PI * 2) / n1 + (r() - 0.5) * 0.18;
    const len = 0.04 * s * (0.88 + r() * 0.24);
    const wid = 0.0145 * s * (0.9 + r() * 0.25);
    const tone = new THREE.Color().copy(white).multiplyScalar(0.9 + r() * 0.15);
    const droop = o.stage === 'opening' ? [0.95 + r() * 0.2, 0.25 + r() * 0.25] : [0.05 + (r() - 0.5) * 0.3, -0.75 - r() * 0.3];
    petal(F, c, nn, az, Rc * 0.78, len, wid, droop[0], droop[1], k % 4, tone, birth, anchor, sway, r);
  }
}

export function stemTint(t: number): THREE.Color {
  return col('#6f7e4a').lerp(col('#7a5a4c'), clamp(1 - t * 2.2));
}

export { UP, GeoBuilder };
