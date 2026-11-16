import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, growStem, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { arcPath, fitToSize, stemBark } from './shared-perennials';

/**
 * Gaura (wand flower), Gaura lindheimeri / Oenothera lindheimeri, a pink
 * selection ('Siskiyou Pink' type). A loose clump of narrow lance leaves with
 * many tall, wiry, arching wands branched in the upper half. Each wand carries
 * a spike of flowers: tight pink buds at the tip, a few open four-petal
 * "butterfly" flowers (petals swept up, long curved stamens and style), and
 * deeper-pink spent flowers lower down.
 */

/* ---------------------------- leaf atlas ---------------------------- */

/** 1024 x 512, four cells 256 wide: 0 basal leaf, 1 basal with maroon flecks, 2 small stem leaf, 3 stem leaf flushed red. Base at the bottom. */
function gauraLeaves(): THREE.Texture {
  return leafTexture('gaura-leaves', 1024, 512, (g) => {
    const r = rng('gaura-leaf-tex');
    for (let c = 0; c < 4; c++) {
      const cx = 128 + c * 256;
      const base = 506, tip = 8, hw = c < 2 ? 52 : 46;
      const N = 50;
      const left: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // Narrow lance: widest about 40% up, pointed tip, slightly wavy and toothed margin.
        const prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85);
        const tooth = 1 + 0.06 * Math.sin(t * 60 + c) + 0.05 * Math.sin(t * 17 + c * 2);
        left.push([Math.max(1.5, hw * prof * tooth) * (t < 0.04 ? 0.5 : 1), lerp(base, tip, t)]);
      }
      g.beginPath();
      g.moveTo(cx, base + 4);
      for (const [w, y] of left) g.lineTo(cx - w, y);
      for (let i = left.length - 1; i >= 0; i--) g.lineTo(cx + left[i][0], left[i][1]);
      g.closePath();
      const grad = g.createLinearGradient(0, base, 0, tip);
      if (c === 3) { grad.addColorStop(0, '#56693a'); grad.addColorStop(0.5, '#5c6e3c'); grad.addColorStop(1, '#8a6a4a'); }
      else { grad.addColorStop(0, '#486a30'); grad.addColorStop(0.5, '#557838'); grad.addColorStop(1, '#648545'); }
      g.fillStyle = grad;
      g.fill();
      g.save();
      g.clip();
      for (let i = 0; i < 160; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(35,60,25,${0.04 + r() * 0.06})` : `rgba(170,200,120,${0.04 + r() * 0.06})`;
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * 100, r() * 500, 4 + r() * 10, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      if (c === 1 || c === 3) {
        for (let i = 0; i < (c === 1 ? 26 : 12); i++) {
          g.fillStyle = `rgba(110,40,50,${0.35 + r() * 0.35})`;
          g.beginPath();
          g.ellipse(cx + (r() - 0.5) * 70, 60 + r() * 420, 2 + r() * 4, 2 + r() * 5, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = 'rgba(190,215,150,0.45)';
      g.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const y = lerp(base - 40, tip + 80, k / 6);
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx, y);
          g.quadraticCurveTo(cx + s * 18, y - 14, cx + s * hw * 0.7, y - 46);
          g.stroke();
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(205,225,170,0.85)';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx, tip + 40);
      g.stroke();
    }
  });
}

/* --------------------------- flower atlas --------------------------- */

const PETAL_EDGE = ['#e0608f', '#e8709c', '#d9507f', '#ea7fa6'];

function petal(g: CanvasRenderingContext2D, ang: number, len: number, wid: number, edge: string, white: number) {
  g.save();
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.25, -wid * 0.18, len * 0.62, -wid * 0.62, len * 0.86, -wid * 0.5);
  g.bezierCurveTo(len * 1.04, -wid * 0.3, len * 1.04, wid * 0.3, len * 0.86, wid * 0.5);
  g.bezierCurveTo(len * 0.62, wid * 0.62, len * 0.25, wid * 0.18, 0, 0);
  g.closePath();
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, '#fcecf0');
  gr.addColorStop(white, '#f7c4d3');
  gr.addColorStop(0.8, '#ee86ab');
  gr.addColorStop(1, edge);
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(216,70,120,0.55)';
  g.lineWidth = 2.5;
  g.stroke();
  g.strokeStyle = 'rgba(225,110,150,0.4)';
  g.lineWidth = 1.5;
  for (const o of [-0.2, 0, 0.2]) {
    g.beginPath();
    g.moveTo(len * 0.12, o * wid * 0.2);
    g.quadraticCurveTo(len * 0.5, o * wid * 0.7, len * 0.9, o * wid * 0.45);
    g.stroke();
  }
  g.restore();
}

/** An open flower in a cell (x0, y0, S): hypanthium from the bottom edge, four petals swept up, curved stamens and style hanging down. */
function openFlower(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, S: number, k: number) {
  const cx = x0 + S / 2, cy = y0 + S * 0.56;
  g.save();
  g.lineCap = 'round';
  // Hypanthium (long pink-green tube) from the attach point.
  const hy = g.createLinearGradient(0, y0 + S, 0, cy);
  hy.addColorStop(0, '#9c9a5a');
  hy.addColorStop(1, '#d58a96');
  g.strokeStyle = hy;
  g.lineWidth = S * 0.035;
  g.beginPath();
  g.moveTo(cx, y0 + S - 2);
  g.lineTo(cx, cy + S * 0.02);
  g.stroke();
  g.translate(cx, cy);
  g.rotate((r() - 0.5) * 0.35);
  const sc = 0.95 + r() * 0.1;
  g.scale(sc, sc);
  const edge = PETAL_EDGE[k % PETAL_EDGE.length];
  const D = Math.PI / 180;
  // Four petals over the upper half; the inner pair larger.
  petal(g, -150 * D + (r() - 0.5) * 0.15, S * 0.33, S * 0.15, edge, 0.5);
  petal(g, -28 * D + (r() - 0.5) * 0.15, S * 0.33, S * 0.15, edge, 0.5);
  petal(g, -112 * D + (r() - 0.5) * 0.15, S * 0.41, S * 0.17, edge, 0.45);
  petal(g, -68 * D + (r() - 0.5) * 0.15, S * 0.41, S * 0.17, edge, 0.45);
  // Eight stamens curving down and out, anthers at the tips, with the long style.
  for (let i = 0; i < 8; i++) {
    const a = (62 + i * 8 + (r() - 0.5) * 4) * D + (i % 2 ? 0.08 : -0.02);
    const L = S * (0.3 + r() * 0.1);
    const ex = Math.cos(a) * L * 1.0, ey = Math.sin(a) * L;
    g.strokeStyle = '#c2365f';
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.moveTo(0, S * 0.01);
    g.quadraticCurveTo(Math.cos(a) * L * 0.3, Math.sin(a) * L * 0.9, ex, ey);
    g.stroke();
    g.fillStyle = r() < 0.5 ? '#d8b25a' : '#b5834a';
    g.save();
    g.translate(ex, ey);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, S * 0.032, S * 0.01, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.strokeStyle = '#e2527f';
  g.lineWidth = S * 0.016;
  g.beginPath();
  g.moveTo(0, S * 0.01);
  g.quadraticCurveTo(S * 0.03, S * 0.2, S * 0.1, S * 0.37);
  g.stroke();
  g.fillStyle = '#f7e9cf';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(S * 0.1 + (i - 1.5) * S * 0.012, S * 0.375, S * 0.012, S * 0.03, 0.5 + i * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A tight pink bud: long twisted spindle from the bottom edge, pink-red toward the tip. */
function bud(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, S: number, k: number) {
  const cx = x0 + S / 2, by = y0 + S - 2;
  const len = S * (0.55 + k * 0.08 + r() * 0.05), w = S * (0.07 + k * 0.012);
  const bend = (r() - 0.5) * S * 0.12;
  g.save();
  g.beginPath();
  g.moveTo(cx - w * 0.35, by);
  g.bezierCurveTo(cx - w * 1.0 + bend, by - len * 0.4, cx - w * 0.8 + bend, by - len * 0.8, cx + bend * 1.4, by - len);
  g.bezierCurveTo(cx + w * 0.9 + bend, by - len * 0.8, cx + w * 1.0 + bend, by - len * 0.4, cx + w * 0.35, by);
  g.closePath();
  const gr = g.createLinearGradient(0, by, 0, by - len);
  gr.addColorStop(0, '#9aa05e');
  gr.addColorStop(0.3, '#c98a8c');
  gr.addColorStop(0.65, '#e0668f');
  gr.addColorStop(1, k > 1 ? '#f2a6bf' : '#d9467a');
  g.fillStyle = gr;
  g.fill();
  g.clip();
  g.strokeStyle = 'rgba(165,40,90,0.55)';
  g.lineWidth = S * 0.012;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(cx + i * w * 0.2, by);
    g.bezierCurveTo(cx + i * w * 0.7 + bend, by - len * 0.4, cx - i * w * 0.4 + bend, by - len * 0.75, cx + bend * 1.4, by - len);
    g.stroke();
  }
  g.restore();
}

/** A faded flower: crumpled deep-pink petals bunched together on a swollen green-pink ovary. */
function spent(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, S: number, k: number) {
  const cx = x0 + S / 2, by = y0 + S - 2;
  g.save();
  g.lineCap = 'round';
  const hy = g.createLinearGradient(0, by, 0, by - S * 0.5);
  hy.addColorStop(0, '#8f9a56');
  hy.addColorStop(1, '#c47886');
  g.strokeStyle = hy;
  g.lineWidth = S * 0.05;
  g.beginPath();
  g.moveTo(cx, by);
  g.lineTo(cx + (r() - 0.5) * 10, by - S * 0.45);
  g.stroke();
  const top = by - S * 0.45;
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(cx + (r() - 0.5) * 10, top);
    g.rotate(-1.57 + (i - 1.5) * 0.35 + (r() - 0.5) * 0.3 + (k - 1) * 0.15);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(S * 0.1, -S * 0.07, S * 0.2, -S * 0.06, S * 0.27, -S * 0.01 + (r() - 0.5) * 4);
    g.bezierCurveTo(S * 0.2, S * 0.07, S * 0.1, S * 0.07, 0, 0);
    g.fillStyle = ['#c23a74', '#b02d66', '#cf4f84', '#a8285e'][i];
    g.fill();
    g.strokeStyle = 'rgba(100,15,55,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
  }
  g.fillStyle = '#9d3a5c';
  g.beginPath();
  g.arc(cx, top, S * 0.03, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 1024 x 1024 flower atlas, 4 x 4 cells: open flowers (0-5, 13-15), buds (6-9), spent flowers (10-12). */
function gauraFlowers(): THREE.Texture {
  return leafTexture('gaura-flowers', 1024, 1024, (g) => {
    const r = rng('gaura-flower-tex');
    const S = 256;
    for (let i = 0; i < 16; i++) {
      const x0 = (i % 4) * S, y0 = Math.floor(i / 4) * S;
      if (i <= 5 || i >= 13) openFlower(g, r, x0, y0, S, i);
      else if (i <= 9) bud(g, r, x0, y0, S, i - 6);
      else spent(g, r, x0, y0, S, i - 10);
    }
  });
}

/* ------------------------------ builder ------------------------------ */

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const sw = (p: THREE.Vector3) => clamp(Math.pow(p.y / H, 1.3) * 0.95);
  const stemCol = col('#8c5c52'), stemGreen = col('#7f7a4c');
  const OPEN = [0, 1, 2, 3, 4, 5, 13, 14, 15], BUD = [6, 7, 8, 9], SPENT = [10, 11, 12];

  const leafAt = (b: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, len: number, wid: number, cell: number, tone: number, birth: number, anchor: THREE.Vector3, curl: number) => {
    const c = jitter(col('#ffffff', tone), r, 0.01, 0.04, 0.05);
    const tip = b.clone().addScaledVector(dir, len);
    leafQuad(leaves, b, dir, face, len, wid, uvCell(4, 1, cell), c, birth, anchor, { segs: 2, curl, sway0: sw(b), sway1: sw(tip), normalBend: 0 });
  };

  /** Spike of buds, open flowers and spent flowers along a wand, tip first. */
  const spike = (pts: THREE.Vector3[], len: number, birth: number, anchor: THREE.Vector3, span: number, dense: number) => {
    const n = pts.length - 1;
    let dist = 0, az = r() * 6.28;
    const budLen = 0.07 + r() * 0.05;
    for (let t = 0.985; t > 0; t -= (0.015 + r() * 0.017) / dense / len * 1) {
      dist = (1 - t) * len;
      if (dist > span) break;
      const x = t * n, i = Math.min(n - 1, Math.floor(x));
      const p = pts[i].clone().lerp(pts[i + 1], x - i);
      const T = pts[i + 1].clone().sub(pts[i]).normalize();
      az += 2.4 + (r() - 0.5) * 0.5;
      const O = deflect(T, Math.PI / 2, az);
      // Position along the spike decides the stage.
      let kind: 'bud' | 'open' | 'spent' | 'none';
      const u = dist / span;
      const rv = r();
      if (dist < budLen) kind = 'bud';
      else if (u < 0.55) kind = rv < 0.34 ? 'open' : rv < 0.85 ? 'bud' : 'none';
      else if (u < 0.8) kind = rv < 0.22 ? 'open' : rv < 0.75 ? 'spent' : 'none';
      else kind = rv < 0.55 ? 'spent' : 'none';
      if (kind === 'none') continue;
      const tone = 0.93 + r() * 0.1;
      if (kind === 'open') {
        const a = 0.55 + r() * 0.5;
        const dir = T.clone().multiplyScalar(Math.cos(a)).addScaledVector(O, Math.sin(a)).normalize();
        const face = O.clone().multiplyScalar(Math.cos(a)).addScaledVector(T, -Math.sin(a));
        const size = 0.064 + r() * 0.01;
        leafQuad(flowers, p, dir, face, size, size, uvCell(4, 4, OPEN[Math.floor(r() * OPEN.length)]), jitter(col('#ffffff', tone), r, 0.008, 0.03, 0.03), birth, anchor, { segs: 1, sway0: sw(p), sway1: sw(p), normalBend: 0 });
      } else if (kind === 'bud') {
        const a = 0.35 + r() * 0.4;
        const dir = T.clone().multiplyScalar(Math.cos(a)).addScaledVector(O, Math.sin(a)).normalize();
        const bl = (0.03 + r() * 0.008) * (dist < budLen * 0.5 ? 0.75 : 1);
        const f1 = O.clone(), f2 = V().crossVectors(dir, O).normalize();
        const cell = BUD[dist < budLen ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)];
        for (const f of [f1, f2]) leafQuad(flowers, p, dir, f, bl, bl * 0.9, uvCell(4, 4, cell), jitter(col('#ffffff', tone), r, 0.01, 0.03, 0.04), birth, anchor, { segs: 1, sway0: sw(p), sway1: sw(p), normalBend: 0 });
      } else {
        const a = 0.5 + r() * 0.6;
        const dir = T.clone().multiplyScalar(Math.cos(a)).addScaledVector(O, Math.sin(a)).normalize();
        const bl = 0.026 + r() * 0.008;
        const f1 = O.clone(), f2 = V().crossVectors(dir, O).normalize();
        const cell = SPENT[Math.floor(r() * 3)];
        for (const f of [f1, f2]) leafQuad(flowers, p, dir, f, bl, bl, uvCell(4, 4, cell), jitter(col('#ffffff', tone * 0.95), r, 0.01, 0.03, 0.04), birth, anchor, { segs: 1, sway0: sw(p), sway1: sw(p), normalBend: 0 });
      }
    }
  };

  /** Small alternate leaves along a wand between fractions t0 and t1. */
  const stemLeaves = (pts: THREE.Vector3[], len: number, t0: number, t1: number, size: number, birth: number, anchor: THREE.Vector3, step: number) => {
    const n = pts.length - 1;
    let az = r() * 6.28;
    for (let t = t0; t < t1; t += step / len) {
      const x = t * n, i = Math.min(n - 1, Math.floor(x));
      const p = pts[i].clone().lerp(pts[i + 1], x - i);
      const T = pts[i + 1].clone().sub(pts[i]).normalize();
      az += 2.4 + (r() - 0.5) * 0.4;
      const O = deflect(T, Math.PI / 2, az);
      const a = 0.65 + r() * 0.5;
      const dir = T.clone().multiplyScalar(Math.cos(a)).addScaledVector(O, Math.sin(a)).normalize();
      const sz = size * (0.8 + r() * 0.4) * lerp(1, 0.55, t);
      const face = V().crossVectors(dir, perp(dir)).normalize();
      if (face.y < 0) face.multiplyScalar(-1);
      face.lerp(UP, 0.5).normalize();
      leafAt(p, dir, face, sz, sz * (0.26 + r() * 0.05), (r() < 0.55 ? 2 : 3) as number, 0.85 + r() * 0.12, birth, anchor, 0.25 + r() * 0.4);
    }
  };

  // Basal rosette: narrow lance leaves arching out of the crown.
  const NB = 80;
  for (let i = 0; i < NB; i++) {
    const f = (i + 0.5) / NB;
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const len = lerp(0.07, 0.12, r()) * (1 + 0.15 * (1 - f));
    const elev = lerp(1.3, 0.5, f * f) + (r() - 0.5) * 0.3;
    const rad = 0.012 + r() * 0.02;
    const b = V(Math.cos(az) * rad, 0.008 + r() * 0.015, Math.sin(az) * rad);
    const O = V(Math.cos(az), 0, Math.sin(az));
    const dir = O.clone().multiplyScalar(Math.cos(elev)).add(V(0, Math.sin(elev), 0)).normalize();
    const face = V(0, 1, 0).lerp(dir, -0.2).normalize();
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + r() * 0.6, 0, 0.85);
    leafAt(b, dir, face, len, len * (0.26 + r() * 0.05), r() < 0.5 ? 0 : 1, 0.85 + r() * 0.15, birth, V(b.x * 0.3, 0, b.z * 0.3), 0.3 + r() * 0.5);
  }

  // Wands.
  const NW = 30;
  for (let i = 0; i < NW; i++) {
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const f = r();
    const L = H * lerp(0.62, 1.0, Math.pow(f, 0.7)) * 1.06;
    const lean0 = lerp(0.1, 0.4, r()) + (1 - f) * 0.2;
    const lean1 = lean0 + lerp(0.25, 0.6, r());
    const base = V(Math.cos(az) * 0.02, 0, Math.sin(az) * 0.02);
    const pts = arcPath(base, az, lean0, lean1, L, 9, r, 0.12);
    const birth = i < 20 ? 0 : clamp(0.1 + r() * 0.7, 0, 0.85);
    const anchor = base;
    const r0 = 0.0017 + r() * 0.0006;
    tube(wood, pts, r0, r0 * 0.4, 4, stemCol.clone().lerp(stemGreen, 0.25), birth, anchor, (q) => sw(pts[q]), 1);

    stemLeaves(pts, L, 0.04, 0.72, 0.085, birth, anchor, 0.028);
    // Branches in the upper half, each with its own spike.
    const nbr = 2 + Math.floor(r() * 2);
    for (let b = 0; b < nbr; b++) {
      const tb = lerp(0.4, 0.8, (b + r() * 0.6) / nbr);
      const x = tb * 9, ii = Math.min(8, Math.floor(x));
      const p = pts[ii].clone().lerp(pts[ii + 1], x - ii);
      const T = pts[ii + 1].clone().sub(pts[ii]).normalize();
      const dir = deflect(T, 0.55 + r() * 0.4, r() * 6.28);
      const Lb = L * lerp(0.18, 0.34, r()) * lerp(1, 0.7, tb);
      const bpts = growStem(r, { base: p, dir, length: Lb, radius: 0.001, segs: 5, gnarl: 0.15, gravity: -0.35 });
      const bb = r() < 0.7 ? birth : clamp(birth + 0.2 + r() * 0.3, 0, 0.85);
      tube(wood, bpts, r0 * 0.55, r0 * 0.25, 3, stemCol, bb, anchor, (q) => sw(bpts[q]), 1);
      stemLeaves(bpts, Lb, 0.05, 0.4, 0.045, bb, anchor, 0.025);
      spike(bpts, Lb, bb, anchor, Lb * 0.85, 1.0);
    }
    spike(pts, L, birth, anchor, L * 0.34, 1.0);
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: gauraLeaves(),
    flowerMap: gauraFlowers(),
    bark: { map: stemBark() },
    look: { translucency: 0.3, leafRoughness: 0.6, bend: 0.08, flutter: 0.006 },
  };
};
