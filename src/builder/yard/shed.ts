import * as THREE from 'three';
import { SUNCAST_BMS7481 } from '../../siteplan/yard';
import type { Vec2 } from '../../siteplan/types';
import { swing, swings } from '../actions';
import { box, IN, rod, sidePanel, V, yardMat, type YardContext } from './kit';

/*
 * Suncast Modern 7 x 4 ft storage shed BMS7481, Brown option, to Suncast's published sizes: 85.5 in wide, 49.25 in deep,
 * 78.5 in tall, a 61 x 72 3/4 in double door opening. The parts not dimensioned by Suncast are read from the product
 * sheet's photo against those sizes:
 *  - a single-slope (lean-to) roof, high at the front and sloping to the back (about 7 1/2 in over the depth), dark
 *    ribbed panels with a thin front fascia, about 1 in over the sides and the back and 2 in over the doors;
 *  - Iron Ore charcoal resin walls with a fine horizontal woodgrain; at the front corners, pilasters about 12 in wide
 *    of horizontal shiplap bands with a plain jamb strip beside the doors;
 *  - Walnut woodcast doors of six vertical boards each, black lever handles at mid-height beside the center seam,
 *    three black hinges a door on the jambs;
 *  - a dark plinth (the floor's edge) under the walls.
 * No window or vents show on the product photo, so none are drawn. Local x runs across the front, +z out of the doors,
 * the floor at y = 0 (the paver pad's top). The doors open outward on their hinges (a Hand action and the `doorsOpen`
 * option).
 */

export function suncastShed(c: YardContext) {
  const i = (x: number) => x * IN;
  const S = SUNCAST_BMS7481;
  const W = S.w, D = S.d, Hf = S.h;
  const Hb = Hf - 7.5;
  const P = 1.75; // floor top (the plinth)
  const t = 1.5; // wall
  const slab = 1.75; // roof panel
  const zb = -D / 2 - 1, zf = D / 2 + 2;
  const roofTop = (z: number) => Hb + ((Hf - Hb) * (z - zb)) / (zf - zb);
  const under = (z: number) => roofTop(z) - slab / Math.cos(Math.atan((Hf - Hb) / (zf - zb)));
  const resin = yardMat.resin(), plinth = yardMat.plinth(), iron = yardMat.iron();

  // Plinth and floor.
  c.add(plinth, box(i(W + 0.4), i(P), i(D + 0.4), 0, 0, 0));
  c.add(yardMat.inside(), box(i(W - 2 * t), 0.004, i(D - 2 * t - 2.5), 0, i(P), i(-1.25)));

  // Side walls (trapezoids under the roof) and the back wall.
  const front = D / 2 - 2.5;
  for (const sx of [-1, 1]) {
    const outline: Vec2[] = [[-D / 2, 0], [front, 0], [front, under(front)], [-D / 2, under(-D / 2)]].map(([z, y]): Vec2 => [i(z), i(y)]);
    c.add(resin, sidePanel(outline, i(t), sx * i(W / 2 - t / 2)));
  }
  c.add(resin, box(i(W - 2 * t), i(under(-D / 2)), i(t), 0, 0, i(-D / 2 + t / 2)));
  // Back corner trims.
  for (const sx of [-1, 1]) c.add(resin, box(i(2.2), i(under(-D / 2) - 0.2), i(2.2), sx * i(W / 2 - 1), 0, i(-D / 2 + 1)));

  // Front: pilasters of shiplap bands, a jamb strip beside each door, and the header over the doors.
  const open = S.doorW / 2; // 30.5
  const pz0 = D / 2 - 2.5, pz1 = D / 2;
  const pTop = under(pz1);
  const doorTop = P + S.doorH;
  for (const sx of [-1, 1]) {
    const x0 = open, x1 = W / 2;
    // Core, set back a little so the bands stand proud of it.
    c.add(yardMat.inside(), box(i(x1 - x0), i(pTop), i(pz1 - pz0 - 0.4), sx * i((x0 + x1) / 2), 0, i((pz0 + pz1 - 0.4) / 2)));
    // Bands about 5 1/4 in tall with a 3/8 in shadow line between them.
    const bx0 = x0 + 1.7, bx1 = x1 - 0.2;
    for (let y = P + 0.3; y + 4.8 < pTop; y += 5.55) c.add(resin, box(i(bx1 - bx0), i(Math.min(5.2, pTop - y - 0.2)), i(0.9), sx * i((bx0 + bx1) / 2), i(y), i(pz1 - 0.45)));
    // The plain jamb strip beside the door.
    c.add(resin, box(i(1.7), i(pTop), i(1.2), sx * i(x0 + 0.85), 0, i(pz1 - 0.5)));
    // Hinges: a black leaf on the jamb and its knuckle at the door's edge.
    for (const hy of [8, 37, 66]) {
      c.add(iron, box(i(1.3), i(3.2), i(0.2), sx * i(x0 + 0.8), i(P + hy), i(pz1 + 0.12)));
      c.add(iron, rod(V(sx * i(x0 + 0.05), i(P + hy - 0.2), i(pz1 - 0.1)), V(sx * i(x0 + 0.05), i(P + hy + 3.4), i(pz1 - 0.1)), i(0.28), 8));
    }
  }
  c.add(resin, box(i(2 * open), i(pTop - doorTop), i(2.5), 0, i(doorTop), i(D / 2 - 1.25)));

  // Roof: the panel, ribs down the slope, the front fascia.
  const ang = Math.atan((Hf - Hb) / (zf - zb));
  const len = Math.hypot(zf - zb, Hf - Hb);
  const zc = (zf + zb) / 2, yc = (Hf + Hb) / 2;
  const roof = yardMat.roof();
  const sloped = (w: number, h: number, d: number, x: number, lift: number) => {
    const g = box(i(w), i(h), i(d), 0, -i(h) / 2, 0).rotateX(-ang);
    return g.translate(x, i(yc + lift), i(zc));
  };
  c.add(roof, sloped(W + 2, slab, len, 0, -slab / 2 / Math.cos(ang)));
  for (let x = -W / 2 + 7; x < W / 2 - 3; x += 14.2) c.add(roof, sloped(0.9, 0.55, len - 0.5, i(x), 0.27));
  c.add(roof, box(i(W + 2.2), i(2.6), i(0.9), 0, i(Hf - 2.4), i(zf + 0.2)));

  // Doors: Walnut woodcast leaves, each on its hinge line at the opening's outer edges, with a black lever by the seam.
  const leafW = open - 0.15, leafH = S.doorH - 0.3, leafT = 1.25;
  const zFace = D / 2 - 0.55;
  const walnut = yardMat.walnut();
  const leaves: ReturnType<typeof swing>[] = [];
  const anchors: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const h = c.hinge(sx * i(open), 0, i(zFace));
    const cx = sx * (open - leafW / 2);
    h.add(walnut, box(i(leafW), i(leafH), i(leafT), i(cx), i(P + 0.15), i(zFace - leafT / 2)));
    // Its back face, plain resin.
    h.add(resin, box(i(leafW - 1), i(leafH - 1), 0.003, i(cx), i(P + 0.65), i(zFace - leafT - 0.06)));
    // The lever handle: a round rose and a lever pointing away from the seam.
    const hx = sx * 2.3, hy = P + 38, zf0 = zFace;
    h.add(iron, rod(V(i(hx), i(hy), i(zf0)), V(i(hx), i(hy), i(zf0 + 0.35)), i(1.05), 18));
    h.add(iron, rod(V(i(hx), i(hy), i(zf0 + 0.3)), V(i(hx), i(hy), i(zf0 + 1.1)), i(0.3), 10));
    h.add(iron, box(i(4.3), i(0.6), i(0.55), i(hx + sx * 2.0), i(hy - 0.3), i(zf0 + 1.15)));
    // A matching rose inside.
    h.add(iron, rod(V(i(hx), i(hy), i(zFace - leafT - 0.3)), V(i(hx), i(hy), i(zFace - leafT)), i(0.9), 14));
    leaves.push(swing(h.group, 'y', sx * 1.75, false, 1.1));
    anchors.push(h.anchor(i(hx), i(hy), i(zf0 + 1.2)), h.anchor(i(cx), i(P + 50), i(zFace + 0.1)));
  }
  const openNow = c.option('doorsOpen');
  const drive = swings(leaves);
  drive.set(openNow, true);
  c.act({ key: 'doors', label: 'Shed doors', words: ['Open', 'Closed'], anchors, on: openNow, planOn: openNow, option: 'doorsOpen', ...drive });
}
