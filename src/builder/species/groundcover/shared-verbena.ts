import * as THREE from 'three';
import { barkTexture, leafTexture, lerp, rng } from '../kit';
import { TAU, inCell, rect, type UV } from './shared-groundcovers';

/**
 * Painting shared by the mat-forming verbenas (Verbena canadensis
 * 'Homestead Purple' and the Tapien 'Blue Violet'): a trailing sprig of
 * opposite leaf pairs, the five-lobed salverform flower with notched lobes,
 * a closed bud, and the flower atlas of heads from above and from the side.
 */

/** Paints one leaf with its base at (x, y), pointing along `ang`, `len` long. */
export type LeafPainter = (g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, fill: string, dark: number) => void;

/** A trailing shoot growing up the cell: opposite pairs, each pair turned a quarter turn from the last. */
export function verbenaSprig(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number, leaf: LeafPainter, greens: string[], young: string[], stem: [string, string, string] = ['#5a4a3c', '#4f6a34', '#6a8a40']) {
  const x0 = w / 2, y0 = h * 0.995, x1 = w / 2 + (r() - 0.5) * w * 0.1, y1 = h * top;
  const sg = g.createLinearGradient(0, y0, 0, y1);
  sg.addColorStop(0, stem[0]);
  sg.addColorStop(0.5, stem[1]);
  sg.addColorStop(1, stem[2]);
  g.strokeStyle = sg;
  g.lineWidth = w * 0.014;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : 0.08 + (i / pairs) * 0.86;
    const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
    const flatPair = i % 2 === 0;
    for (const s of [-1, 1]) {
      // Pairs lying to the sides show full length; the pairs between them point up and down and look short.
      const a = -Math.PI / 2 + s * (flatPair ? 0.95 + r() * 0.3 : 0.35 + r() * 0.3);
      const len = w * (flatPair ? 0.33 : 0.22) * (0.88 + r() * 0.24) * lerp(1, 0.75, t);
      leaf(g, r, nx, ny, a, len, greens[Math.floor(r() * greens.length)], !flatPair ? 0.15 : r() < 0.3 ? 0.12 : 0);
    }
  }
  // Young leaves folded around the tip.
  for (const s of [-1, 1]) leaf(g, r, x1, y1, -Math.PI / 2 + s * (0.3 + r() * 0.25), w * 0.17, young[Math.floor(r() * 2)], 0);
}

/** Flower colors: lobe base colors (one picked per flower), the deep lobe base, the light lobe tip, the vein, the eye (null: none) and the throat. */
export interface VerbenaPalette {
  lobes: string[];
  deep: string;
  light: string;
  vein: string;
  eye: string | null;
  eyeR: number;
  throat: string;
  /** Two bud colors. */
  buds: [string, string];
}

/** One salverform flower from above: five notched lobes, an eye, a dark throat. `sq` flattens it for side views. */
export function verbenaFloret(g: CanvasRenderingContext2D, r: () => number, p: VerbenaPalette, x: number, y: number, s: number, sq = 1, rot = r() * TAU) {
  g.save();
  g.translate(x, y);
  g.scale(1, sq);
  g.rotate(rot);
  const base = p.lobes[Math.floor(r() * p.lobes.length)];
  for (let k = 0; k < 5; k++) {
    g.save();
    g.rotate((k / 5) * TAU);
    const pg = g.createLinearGradient(0, 0, s, 0);
    pg.addColorStop(0, p.deep);
    pg.addColorStop(0.45, base);
    pg.addColorStop(1, p.light);
    g.fillStyle = pg;
    // Each lobe is notched: two overlapping rounded halves.
    for (const q of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 0.56, q * s * 0.13, s * 0.44, s * 0.24, q * 0.28, 0, TAU);
      g.fill();
    }
    g.strokeStyle = p.vein;
    g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath();
    g.moveTo(s * 0.2, 0);
    g.lineTo(s * 0.86, 0);
    g.stroke();
    g.restore();
  }
  if (p.eye) {
    g.fillStyle = p.eye;
    g.beginPath();
    g.arc(0, 0, s * p.eyeR, 0, TAU);
    g.fill();
  }
  g.fillStyle = p.throat;
  g.beginPath();
  g.arc(0, 0, s * 0.07, 0, TAU);
  g.fill();
  g.restore();
}

export function verbenaBud(g: CanvasRenderingContext2D, r: () => number, p: VerbenaPalette, x: number, y: number, s: number) {
  g.fillStyle = r() < 0.5 ? p.buds[0] : p.buds[1];
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.34, r() * TAU, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(70,100,50,0.8)';
  g.beginPath();
  g.arc(x, y, s * 0.16, 0, TAU);
  g.fill();
}

const FW = 1024, FH = 1024, C = 512;
/** Flower atlas cells, 2 x 2: 0 and 1 a full head from above, 2 a head from the side on its stalk, 3 a younger head, half in bud. */
export const verbenaFlowerCell = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, FW, FH);

/**
 * The flower atlas (see verbenaFlowerCell). `sideLeaf` paints the pair of small leaves under the head in the side view,
 * `stalk` is the stalk color and `tube` the color of the flower tubes there.
 */
export function verbenaFlowerAtlas(key: string, p: VerbenaPalette, sideLeaf: (g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number) => void, stalk = '#4c6a36', tube = 'rgba(92,60,110,0.95)'): THREE.Texture {
  return leafTexture(key, FW, FH, (g) => {
    const r = rng(key);
    const floret = (x: number, y: number, s: number, sq = 1) => verbenaFloret(g, r, p, x, y, s, sq);
    // Cells 0, 1: a full head from above. Cell 3: a younger head, half in bud.
    for (const c of [0, 1, 3]) {
      inCell(g, (c % 2) * C, Math.floor(c / 2) * C, C, C, (w, h) => {
        const cx = w / 2, cy = h / 2, young = c === 3;
        const n0 = young ? 8 : 10 + c;
        for (let k = 0; k < n0; k++) {
          const a = (k / n0) * TAU + r() * 0.2, d = w * (young ? 0.3 : 0.335) * (0.94 + r() * 0.1);
          floret(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.125 + r() * 0.02));
        }
        const n1 = young ? 0 : 6;
        for (let k = 0; k < n1; k++) {
          const a = (k / n1) * TAU + 0.4 + r() * 0.3, d = w * 0.17 * (0.9 + r() * 0.2);
          floret(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.115 + r() * 0.02));
        }
        const nb = young ? 22 : 7;
        for (let k = 0; k < nb; k++) {
          const a = r() * TAU, d = Math.sqrt(r()) * w * (young ? 0.19 : 0.06);
          verbenaBud(g, r, p, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * 0.07);
        }
        if (!young) floret(cx + w * 0.02, cy - h * 0.01, w * 0.1);
      });
    }
    // Cell 2: the head from the side on its stalk: a low dome of flowers on slender tubes.
    inCell(g, 0, C, C, C, (w, h) => {
      const cx = w / 2, hub = h * 0.62;
      g.strokeStyle = stalk;
      g.lineWidth = w * 0.022;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, hub);
      g.stroke();
      // A pair of small leaves below the head.
      for (const s of [-1, 1]) sideLeaf(g, r, cx, h * 0.88, -Math.PI / 2 + s * 1.15, w * 0.3);
      const rows = [{ n: 6, y: 0.2, sp: 0.36, sq: 0.5 }, { n: 7, y: 0.31, sp: 0.42, sq: 0.62 }, { n: 6, y: 0.43, sp: 0.4, sq: 0.8 }];
      for (const row of rows) {
        for (let k = 0; k < row.n; k++) {
          const u = (k + 0.5) / row.n - 0.5;
          const fx = cx + u * 2 * row.sp * w, fy = h * (row.y + Math.abs(u) * Math.abs(u) * 0.5);
          g.strokeStyle = tube;
          g.lineWidth = w * 0.012;
          g.beginPath();
          g.moveTo(cx + u * w * 0.12, hub);
          g.lineTo(fx, fy);
          g.stroke();
          floret(fx, fy, w * 0.12, row.sq);
        }
      }
    });
  });
}

/** Square verbena stems: green with a faint purple flush. */
export function verbenaStemBark(): THREE.Texture {
  return barkTexture('gc-verbena-stem', 32, (g, S) => {
    g.fillStyle = '#3c5428';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(110,70,80,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 8, 0, 3, S);
  });
}
