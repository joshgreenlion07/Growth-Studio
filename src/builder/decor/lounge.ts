import * as THREE from 'three';
import { rng } from '../../siteplan/geometry';
import { clamp01, vnoise } from '../../engine/noise';
import { mixRGB, paint, textureSet } from '../../engine/textures';
import { pbrMaterial } from '../materials';
import { box, IN, mat, rbox, type DecorContext } from './kit';

/*
 * The job's lounge set (photo of the fire pit patio): deep seating sofas on white powder-coated aluminum sled frames,
 * 1 1/2 in square tube. Each arm is a rectangle standing on its own floor rail, with a light wood-look panel filling
 * it from the seat rail up to the top rail; the back is framed and paneled the same way to arm height. A seat rail runs
 * along the front with a center leg. Light gray cushions: three seats, three back cushions leaning on the back, an arm
 * bolster standing against each arm, and two yellow accent pillows. Sizes read from the photo: arm and back 25 in,
 * seat 17 in, back cushions to about 31 in, 32 in deep. Local x runs along the sofa, +z is the seat front.
 */

const TUBE = 1.5 * IN;
const ARM_H = 25 * IN;
const RAIL_Y = 10 * IN;
const SEAT_TOP = 17 * IN;

/** Yellow accent pillow fabric: mustard with a soft white ikat diamond lattice. */
const pillowSet = () => textureSet('decor:pillow-ikat', () =>
  paint(256, 0.46, 1, (u, v) => {
    const a = Math.abs(((u + v) * 6) % 1 - 0.5), b = Math.abs(((u - v + 8) * 6) % 1 - 0.5);
    const blur = (vnoise(u * 60, v * 8, 60, 31) - 0.5) * 0.05;
    const line = clamp01(1 - (Math.min(a, b) + blur - 0.012) / 0.03);
    const c = mixRGB([0.68, 0.49, 0.1], [0.78, 0.75, 0.66], line * 0.75);
    return { h: 0.5, c, r: 0.95 };
  }),
);

function sledEnd(c: DecorContext, x: number, D: number, white: THREE.Material, wood: THREE.Material) {
  const zf = D / 2 - TUBE / 2, zb = -D / 2 + TUBE / 2;
  c.add(white, box(TUBE, TUBE, D, x, 0, 0));
  c.add(white, box(TUBE, TUBE, D, x, ARM_H - TUBE, 0));
  c.add(white, box(TUBE, TUBE * 0.9, D - 2 * TUBE, x, RAIL_Y, 0));
  for (const z of [zf, zb]) c.add(white, box(TUBE, ARM_H, TUBE, x, 0, z));
  const y0 = RAIL_Y + TUBE * 0.9, y1 = ARM_H - TUBE;
  c.add(wood, box(0.014, y1 - y0, D - 2 * TUBE, x, y0, 0));
}

export function loungeSofa(c: DecorContext) {
  const [L, D] = c.spec.footprint;
  const white = mat.whiteFrame(), wood = mat.wood(), fabric = mat.fabric();
  const r = rng(c.f.id);
  const xe = L / 2 - TUBE / 2;
  for (const s of [-1, 1]) sledEnd(c, s * xe, D, white, wood);
  // Back: floor rail, seat rail and top rail along the back, a paneled band between, and a center post.
  const zb = -D / 2 + TUBE / 2;
  const inner = L - 2 * TUBE;
  c.add(white, box(inner, TUBE, TUBE, 0, 0, zb));
  c.add(white, box(inner, TUBE, TUBE, 0, ARM_H - TUBE, zb));
  c.add(white, box(inner, TUBE * 0.9, TUBE, 0, RAIL_Y, zb));
  c.add(white, box(TUBE, ARM_H, TUBE, 0, 0, zb));
  c.add(wood, box((inner - TUBE) / 2, ARM_H - TUBE - RAIL_Y - TUBE * 0.9, 0.014, -(inner + TUBE) / 4, RAIL_Y + TUBE * 0.9, zb));
  c.add(wood, box((inner - TUBE) / 2, ARM_H - TUBE - RAIL_Y - TUBE * 0.9, 0.014, (inner + TUBE) / 4, RAIL_Y + TUBE * 0.9, zb));
  // Front seat rail with a center leg; the seat deck under the cushions.
  const zf = D / 2 - TUBE / 2;
  c.add(white, box(inner, TUBE, TUBE, 0, RAIL_Y, zf));
  c.add(white, box(TUBE, RAIL_Y, TUBE, 0, 0, zf));
  c.add(white, box(inner, 0.02, D - 2 * TUBE, 0, RAIL_Y + TUBE - 0.02, 0));
  // Seat cushions.
  const deck = RAIL_Y + TUBE;
  const seatT = SEAT_TOP - deck;
  const seatD = D - 2 * TUBE - 0.01;
  const n = 3, gap = 0.006;
  const cw = (inner - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) c.add(fabric, rbox(cw, seatT, seatD, 0.035, -inner / 2 + cw / 2 + i * (cw + gap), deck, 0, 4));
  // Back cushions, leaning back about 10 degrees on the back frame.
  const backT = 0.165, backH = 0.375;
  const lean = 0.17;
  for (let i = 0; i < n; i++) {
    const g = rbox(cw - 0.01, backH, backT, 0.045, 0, 0, 0, 4);
    g.rotateX(-lean);
    g.translate(-inner / 2 + cw / 2 + i * (cw + gap), SEAT_TOP - 0.01, -D / 2 + TUBE + backT / 2 + 0.03);
    c.add(fabric, g);
  }
  // Arm bolsters standing on the seat against each arm.
  const bolT = 0.14, bolD = seatD - backT - 0.06;
  for (const s of [-1, 1]) c.add(fabric, rbox(bolT, backH - 0.03, bolD, 0.05, s * (inner / 2 - bolT / 2 - 0.004), SEAT_TOP - 0.01, (seatD - bolD) / 2 - 0.004, 4));
  // Two yellow accent pillows leaning on the back cushions.
  const pillow = pbrMaterial('decor:pillow', pillowSet());
  for (const px of [-inner * 0.2 + (r() - 0.5) * 0.05, inner * 0.32 + (r() - 0.5) * 0.05]) {
    const g = rbox(0.38, 0.38, 0.11, 0.05, 0, 0, 0, 4);
    g.rotateZ((r() - 0.5) * 0.18);
    g.rotateX(-0.3);
    g.translate(px, SEAT_TOP - 0.02, -D / 2 + TUBE + backT + 0.1);
    c.add(pillow, g);
  }
}

/** The set's ottoman: sled ends, perimeter rails under a deck, and one cushion, 16 1/2 in to the top. */
export function loungeOttoman(c: DecorContext) {
  const [L, D] = c.spec.footprint;
  const white = mat.whiteFrame(), fabric = mat.fabric();
  const top = 12 * IN;
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - TUBE / 2);
    c.add(white, box(TUBE, TUBE, D, x, 0, 0));
    for (const z of [-1, 1]) c.add(white, box(TUBE, top, TUBE, x, 0, z * (D / 2 - TUBE / 2)));
    c.add(white, box(TUBE, TUBE, D - 2 * TUBE, x, top - TUBE, 0));
  }
  for (const z of [-1, 1]) c.add(white, box(L - 2 * TUBE, TUBE, TUBE, 0, top - TUBE, z * (D / 2 - TUBE / 2)));
  c.add(white, box(L - 2 * TUBE, 0.02, D - 2 * TUBE, 0, top - 0.02, 0));
  c.add(fabric, rbox(L - 0.012, 4.5 * IN, D - 0.012, 0.035, 0, top, 0, 4));
}

