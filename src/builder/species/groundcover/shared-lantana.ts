import * as THREE from 'three';
import { barkTexture, lerp } from '../kit';
import { toothedLeafPath } from '../perennials/shared-perennials';
import { TAU } from './shared-groundcovers';

/**
 * Painting shared by the lantanas (the groundcover 'New Gold' and the shrub
 * 'Radiation'): the rough, round-toothed opposite leaf, a shoot of opposite
 * pairs, the four-lobed salverform floret, a closed bud, and the stem bark.
 */

/** Outline of a lantana leaf: width as a share of the length, where it is widest, teeth per side and their depth. */
export interface LantanaLeafShape {
  width: number;
  widest: number;
  teeth: number;
  depth: number;
}

/** The low groundcover lantanas' leaf: a broad ovate blade with nine round teeth a side. */
export const LANTANA_LEAF: LantanaLeafShape = { width: 0.56, widest: 0.36, teeth: 9, depth: 0.16 };

/** One ovate lantana leaf: short stalk, round teeth, rough puckered surface between sunken veins. */
export function lantanaLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, fill: string, dark: number, shape = LANTANA_LEAF) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = '#4a5e2e';
  g.lineWidth = len * 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.12, 0);
  g.stroke();
  g.translate(len * 0.1, 0);
  const L = len * 0.9, W = L * (shape.width + r() * 0.06);
  toothedLeafPath(g, L, W, shape.widest, shape.teeth, shape.depth);
  g.fillStyle = fill;
  g.fill();
  g.save();
  g.clip();
  if (dark > 0) {
    g.fillStyle = `rgba(6,20,6,${dark})`;
    g.fillRect(-L, -L, L * 3, L * 2);
  }
  // Puckered cushions between the veins.
  for (let i = 0; i < 70; i++) {
    const px = L * (0.08 + r() * 0.85), py = (r() - 0.5) * W * 0.85, rr = L * (0.025 + r() * 0.035);
    g.fillStyle = `rgba(10,30,8,${0.1 + r() * 0.1})`;
    g.beginPath();
    g.arc(px + rr * 0.3, py + rr * 0.3, rr, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(150,190,110,${0.06 + r() * 0.08})`;
    g.beginPath();
    g.arc(px - rr * 0.2, py - rr * 0.2, rr * 0.6, 0, TAU);
    g.fill();
  }
  // Sunken veins: midrib and five pairs curving toward the tip.
  g.strokeStyle = 'rgba(12,30,8,0.6)';
  g.lineWidth = L * 0.022;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(L * 0.94, 0);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6.3;
    for (const s of [-1, 1]) {
      g.moveTo(L * t, 0);
      g.quadraticCurveTo(L * (t + 0.08), s * W * 0.22, L * (t + 0.2), s * W * 0.36 * Math.sin(Math.PI * Math.min(0.95, t + 0.15)));
    }
  }
  g.stroke();
  g.strokeStyle = 'rgba(140,175,100,0.3)';
  g.lineWidth = L * 0.012;
  g.beginPath();
  g.moveTo(0, -L * 0.012);
  g.lineTo(L * 0.9, -L * 0.012);
  g.stroke();
  g.restore();
  g.restore();
}

/**
 * A shoot growing up the atlas cell: opposite pairs, each pair turned a quarter turn from the last, so every other
 * pair lies flat and the pairs between point toward and away from the viewer (shorter and darker). Two young leaves
 * fold together at the tip.
 */
export function lantanaShoot(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number, greens: string[], young: string[], shape = LANTANA_LEAF) {
  const x0 = w / 2, y0 = h * 0.995, x1 = w / 2 + (r() - 0.5) * w * 0.08, y1 = h * top;
  const sg = g.createLinearGradient(0, y0, 0, y1);
  sg.addColorStop(0, '#5e5236');
  sg.addColorStop(0.5, '#4f6233');
  sg.addColorStop(1, '#5f8438');
  g.strokeStyle = sg;
  g.lineWidth = w * 0.016;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : 0.07 + (i / pairs) * 0.86;
    const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
    const flat = i % 2 === 0;
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * (flat ? 1.05 + r() * 0.3 : 0.35 + r() * 0.25);
      const len = w * (flat ? 0.36 : 0.24) * (0.88 + r() * 0.24) * lerp(1, 0.8, t);
      lantanaLeaf(g, r, nx, ny, a, len, greens[Math.floor(r() * greens.length)], !flat ? 0.14 : r() < 0.3 ? 0.1 : 0, shape);
    }
  }
  for (const s of [-1, 1]) lantanaLeaf(g, r, x1, y1, -Math.PI / 2 + s * (0.3 + r() * 0.25), w * 0.17, young[Math.floor(r() * 2)], 0, shape);
}

/** The colors of one floret: its lobes, the deep shade at the lobe bases, the lighter lobe rims, and the throat. */
export interface FloretTone {
  lobe: THREE.Color;
  deep: THREE.Color;
  rim: THREE.Color;
  throat: string;
}

const css = (c: THREE.Color) => `#${c.getHexString()}`;

/** One salverform floret from above: four rounded lobes, the lower one largest, around a small throat. `sq` flattens it for side views. */
export function lantanaFloret(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: FloretTone, sq: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.scale(1, sq);
  g.rotate(rot);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const big = k === 0 ? 1.18 : 1;
    const pg = g.createRadialGradient(0, 0, s * 0.1, 0, 0, s);
    pg.addColorStop(0, css(t.deep));
    pg.addColorStop(0.45, css(t.lobe));
    pg.addColorStop(1, css(t.rim));
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(Math.cos(a) * s * 0.5 * big, Math.sin(a) * s * 0.5 * big, s * 0.48 * big, s * 0.42 * big, a, 0, TAU);
    g.fill();
  }
  g.fillStyle = t.throat;
  g.beginPath();
  g.arc(0, 0, s * 0.09, 0, TAU);
  g.fill();
  g.restore();
}

/** A closed bud from above: one of two colors, with the green tip of its bract showing. */
export function lantanaBud(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number, a: string, b: string, tip = 'rgba(120,130,40,0.7)') {
  g.fillStyle = r() < 0.5 ? a : b;
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.42, r() * TAU, 0, TAU);
  g.fill();
  g.fillStyle = tip;
  g.beginPath();
  g.arc(x, y, s * 0.16, 0, TAU);
  g.fill();
}

/** Square, rough lantana stems: olive brown with faint green ridges. */
export function lantanaStemBark(): THREE.Texture {
  return barkTexture('gc-lantana-stem', 32, (g, S) => {
    g.fillStyle = '#5a5638';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(80,100,50,0.4)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 8, 0, 3, S);
  });
}
