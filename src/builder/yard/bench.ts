import * as THREE from 'three';
import { featureSize } from '../../siteplan/decor';
import { boxUV } from '../materials';
import { box, IN, rbox, swapUV, yardMat, type YardContext } from './kit';

/*
 * The 5 ft wooden garden bench of the bench sheet's photo (no maker given), in an oiled honey teak or acacia tone:
 *  - four square legs about 1 3/4 in; the front legs run up to carry the arms, the back legs run up as the back posts,
 *    leaning back about 9 degrees above the seat;
 *  - a seat of five slats about 3 1/4 in wide on front, back and side aprons, its top 18 in up (the plan's "1'6" high");
 *  - side stretchers low between the legs;
 *  - the back: a lower back rail, 13 vertical slats about 1 1/2 in wide, and a gently arched top rail;
 *  - flat arms about 3 1/2 in wide, 25 in up, with rounded front ends.
 * Overall about 60 x 24 x 35 in, the usual size of a 5 ft bench (the plan's rectangle is drawn about 13 in deep, which
 * is too shallow for a bench with a back). Local x along the bench, +z the front (the seat side), base at y = 0.
 */

/** A square stick from a to b (inches), grain along it. */
function stick(a: THREE.Vector3, b: THREE.Vector3, w: number, t: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(w * IN, d.length() * IN, t * IN);
  boxUV(g);
  swapUV(g);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(((a.x + b.x) / 2) * IN, ((a.y + b.y) / 2) * IN, ((a.z + b.z) / 2) * IN);
  return g.toNonIndexed();
}

export function gardenBench(c: YardContext) {
  const [Lm, Dm, Hm] = featureSize(c.spec, c.f.size, 35 * IN);
  const L = Lm / IN, D = Dm / IN, H = Hm / IN;
  const wood = yardMat.hardwood();
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const i = (x: number) => x * IN;
  const leg = 1.75, seatY = 18, armY = 25, xL = L / 2 - 1.4;
  const zF = D / 2 - 3.2, zB = -D / 2 + 3.5;
  // Legs: front to the arm, back to just over the seat (the back post continues it, leaning).
  for (const sx of [-1, 1]) {
    c.add(wood, stick(V3(sx * xL, 0, zF), V3(sx * xL, armY, zF), leg, leg));
    c.add(wood, stick(V3(sx * xL, 0, zB), V3(sx * xL, seatY - 0.5, zB), leg, leg));
    // Side apron under the seat and a low stretcher.
    c.add(wood, box(i(1), i(2.75), i(zF - zB), sx * i(xL), i(seatY - 3.6), i((zF + zB) / 2)));
    c.add(wood, box(i(1), i(1.6), i(zF - zB), sx * i(xL), i(4), i((zF + zB) / 2)));
  }
  // Front and back aprons, and the seat slats.
  const inner = 2 * xL - leg;
  c.add(wood, box(i(inner), i(2.75), i(0.9), 0, i(seatY - 3.6), i(zF)));
  c.add(wood, box(i(inner), i(2.75), i(0.9), 0, i(seatY - 3.6), i(zB)));
  const front = zF + 1.4, back = zB - 0.6, sw = 3.25, n = 5, gap = (front - back - n * sw) / (n - 1);
  for (let k = 0; k < n; k++) {
    const z = back + sw / 2 + k * (sw + gap);
    c.add(wood, rbox(i(2 * xL + leg - 0.3), i(0.9), i(sw), i(0.12), 0, i(seatY - 0.9), i(z), 2));
  }

  // The back, built upright about the back legs' top and leaned back as one.
  const lean = -0.16;
  const pivot = V3(0, seatY - 0.5, zB);
  const back3 = (g: THREE.BufferGeometry) => g.translate(0, -i(pivot.y), -i(pivot.z)).rotateX(lean).translate(0, i(pivot.y), i(pivot.z));
  const top = H - 0.6;
  for (const sx of [-1, 1]) c.add(wood, back3(stick(V3(sx * xL, pivot.y, zB), V3(sx * xL, top, zB), leg, leg)));
  c.add(wood, back3(box(i(inner), i(2.4), i(0.9), 0, i(seatY + 3), i(zB))));
  // The arched top rail: its middle 1 1/2 in higher than its ends.
  const rise = 1.5, railH = 3, ends = top - railH - rise;
  const shape = new THREE.Shape();
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const x = -inner / 2 - leg / 2 + ((inner + leg) * k) / N;
    const y = ends + railH + rise * (1 - Math.pow((2 * x) / (inner + leg), 2));
    if (k === 0) shape.moveTo(i(x), i(y));
    else shape.lineTo(i(x), i(y));
  }
  for (let k = N; k >= 0; k--) {
    const x = -inner / 2 - leg / 2 + ((inner + leg) * k) / N;
    shape.lineTo(i(x), i(ends + rise * (1 - Math.pow((2 * x) / (inner + leg), 2))));
  }
  const arch = new THREE.ExtrudeGeometry(shape, { depth: i(1), bevelEnabled: true, bevelThickness: i(0.1), bevelSize: i(0.1), bevelSegments: 1, curveSegments: 1 });
  arch.translate(0, 0, i(zB - 0.5));
  const archN = arch.toNonIndexed();
  arch.dispose();
  archN.computeVertexNormals();
  c.add(wood, back3(archN));
  // Thirteen slats between the rails, spread evenly.
  const slats = 13, span = inner - 3, pitch = span / slats;
  for (let k = 0; k < slats; k++) {
    const x = -span / 2 + pitch * (k + 0.5);
    const yTop = ends + rise * (1 - Math.pow((2 * x) / (inner + leg), 2)) + 0.2;
    c.add(wood, back3(stick(V3(x, seatY + 5.2, zB), V3(x, yTop, zB), 1.5, 0.65)));
  }

  // Arms: from the back post to past the front leg, a rounded front end.
  for (const sx of [-1, 1]) {
    const z0 = zB - 1.8, z1 = zF + 2.6;
    const arm = rbox(i(3.5), i(1), i(z1 - z0), i(0.9), sx * i(xL + 0.3), i(armY), i((z0 + z1) / 2), 3);
    c.add(wood, swapUV(arm));
  }
}
