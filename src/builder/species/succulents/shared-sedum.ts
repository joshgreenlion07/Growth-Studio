import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, deflect, jitter, lerp } from '../kit';

/**
 * The cushion shared by the mat-forming stonecrops (blue sedum 'Blue Spruce', 'Lemon Ball'): trailing stems whose tips
 * turn up and pack shoulder to shoulder in a low dome, each tip two crossed side-view cards plus an end-on rosette card,
 * a lower layer of tips seen from above, and prostrate runners creeping out at the rim.
 *
 * The atlas (square): u 0..0.25 and 0.25..0.5 are two side-view sprigs, 1 : 4, stem base at the bottom; the upper right
 * quarter is a tip seen end-on (a rosette) and the lower right quarter a patch of tips seen from above.
 */
export interface CushionOpts {
  /** Vertex tints (sRGB hex), cycled over the tips. */
  tints: string[];
  /** Card width, m: the stem plus a needle each side, true scale. Default 0.036. */
  wid?: number;
  /** Upturned tips over the footprint. Default 850. */
  tips?: number;
  /** Tip length, m: min and random extra. Default 0.05 + 0.025. */
  tipLen?: [number, number];
  /** How fast the dome falls toward the rim (bigger = flatter top, steeper rim). Default 1.8. */
  dome?: number;
  /** Lean of the tips at the rim, radians. Default 1.15. */
  rimLean?: number;
}

/** Add the cushion to `g` at mature size (H x Sp); call fitGeo after. */
export function sedumCushion(g: GeoBuilder, r: () => number, H: number, Sp: number, o: CushionOpts) {
  const R = Sp / 2;
  const tints = o.tints.map((t) => col(t));
  const up = V(0, 1, 0);
  const ROS: [number, number, number, number] = [0.502, 0.502, 0.998, 0.998];

  /** A textured strip from a to b, `wid` wide across `across`. v runs v0 at a to v1 at b. */
  const strip = (a: THREE.Vector3, b: THREE.Vector3, across: THREE.Vector3, wid: number, n: THREE.Vector3, cell: number, v0: number, v1: number, c0: THREE.Color, c1: THREE.Color, birth: number, anchor: THREE.Vector3, s0: number, s1: number) => {
    const u0 = cell * 0.25 + 0.004, u1 = cell * 0.25 + 0.246;
    const i0 = g.vert(a.clone().addScaledVector(across, -wid / 2), n, u0, v0, c0, birth, anchor, s0);
    const i1 = g.vert(a.clone().addScaledVector(across, wid / 2), n, u1, v0, c0, birth, anchor, s0);
    const i2 = g.vert(b.clone().addScaledVector(across, wid / 2), n, u1, v1, c1, birth, anchor, s1);
    const i3 = g.vert(b.clone().addScaledVector(across, -wid / 2), n, u0, v1, c1, birth, anchor, s1);
    g.quad(i0, i1, i2, i3);
  };

  // Height of the cushion surface: highest in the middle, down to the ground at the rim.
  const surface = (rad: number) => H * lerp(0.98, 0.1, Math.pow(clamp(rad / R), o.dome ?? 1.8));
  const wid = o.wid ?? 0.036; // Blue Spruce: a 1 cm stem with 1.5 cm needles each side, true scale

  // Upturned tips, evenly packed over the whole footprint.
  const tips = o.tips ?? 850;
  for (let i = 0; i < tips; i++) {
    const f = (i + 0.5) / tips;
    const rad = clamp(R * 0.95 * Math.sqrt(f) + (r() - 0.5) * 0.03, 0, R * 0.96), az = i * 2.39996 + (r() - 0.5) * 0.5;
    const edge = clamp(rad / R);
    const top = surface(rad) * (0.86 + r() * 0.14);
    const len = Math.min(top, (o.tipLen?.[0] ?? 0.05) + r() * (o.tipLen?.[1] ?? 0.025));
    // Tips stand up in the middle and lean outward more and more toward the rim.
    const outv = V(Math.cos(az), 0, Math.sin(az));
    const lean = lerp(0.12, o.rimLean ?? 1.15, Math.pow(edge, 2)) + (r() - 0.5) * 0.35;
    const dir = deflect(up.clone().multiplyScalar(Math.cos(lean)).addScaledVector(outv, Math.sin(lean)).normalize(), 0.18 * r(), r() * 6.28);
    const base = V(Math.cos(az) * rad, Math.max(0.002, top - len * dir.y), Math.sin(az) * rad);
    const tip = base.clone().addScaledVector(dir, len);
    const spin = r() * Math.PI;
    const a1 = deflect(dir, Math.PI / 2, spin), a2 = V().crossVectors(dir, a1).normalize();
    const cl = jitter(tints[i % 3], r, 0.008, 0.03, 0.03);
    const dark = cl.clone().multiplyScalar(lerp(0.78, 0.88, edge));
    const birth = edge < 0.5 || r() < 0.38 ? 0 : clamp(0.08 + edge * 0.6 + (r() - 0.5) * 0.25, 0.05, 0.85);
    const anchor = V(base.x * 0.7, 0.004, base.z * 0.7);
    const s0 = 0.15, s1 = 0.6;
    const cell = i % 2;
    const v0 = 1 - (len / wid) * 0.25; // texture cell is 1 : 4, so this keeps the needles at true scale
    const n1 = a2.clone().lerp(up, 0.65).normalize(), n2 = a1.clone().lerp(up, 0.65).normalize();
    strip(base, tip, a1, wid, n1, cell, v0, 0.998, dark, cl, birth, anchor, s0, s1);
    strip(base, tip, a2, wid, n2, cell, v0, 0.998, dark, cl, birth, anchor, s0, s1);
    // The rosette seen end-on, just below the very tip.
    const c = tip.clone().addScaledVector(dir, -len * 0.22);
    const e1 = a1.clone().multiplyScalar(wid * 0.5), e2 = a2.clone().multiplyScalar(wid * 0.5);
    const nn = dir.clone().lerp(up, 0.6).normalize();
    const j0 = g.vert(c.clone().sub(e1).sub(e2), nn, ROS[0], ROS[1], cl, birth, anchor, s1);
    const j1 = g.vert(c.clone().add(e1).sub(e2), nn, ROS[2], ROS[1], cl, birth, anchor, s1);
    const j2 = g.vert(c.clone().add(e1).add(e2), nn, ROS[2], ROS[3], cl, birth, anchor, s1);
    const j3 = g.vert(c.clone().sub(e1).add(e2), nn, ROS[0], ROS[3], cl, birth, anchor, s1);
    g.quad(j0, j1, j2, j3);
  }

  // Lower layer: patches of tips seen from above, lying on the dome just under the upright tips.
  const patches = 56;
  for (let i = 0; i < patches; i++) {
    const rad = R * 0.8 * Math.sqrt((i + 0.5) / patches), az = i * 2.39996 + r();
    const outv = V(Math.cos(az), 0, Math.sin(az));
    const c = outv.clone().multiplyScalar(rad).setY(Math.max(0.008, surface(rad) * 0.74));
    const slope = (surface(rad + 0.01) - surface(rad - 0.01)) / 0.02;
    const radial = V(outv.x, slope * 0.6, outv.z).normalize();
    const tang = V(-outv.z, 0, outv.x);
    const rot = r() * 6.28, s = 0.058;
    const ex = radial.clone().multiplyScalar(Math.cos(rot) * s).addScaledVector(tang, Math.sin(rot) * s);
    const ez = radial.clone().multiplyScalar(-Math.sin(rot) * s).addScaledVector(tang, Math.cos(rot) * s);
    const cl = jitter(tints[i % 3], r, 0.008, 0.03, 0.03);
    const edge = rad / R;
    const birth = edge < 0.5 ? 0 : clamp(0.1 + edge * 0.6, 0, 0.8);
    const anchor = V(c.x * 0.7, 0.004, c.z * 0.7);
    const j0 = g.vert(c.clone().sub(ex).sub(ez), up, 0.502, 0.002, cl, birth, anchor, 0.1);
    const j1 = g.vert(c.clone().add(ex).sub(ez), up, 0.998, 0.002, cl, birth, anchor, 0.1);
    const j2 = g.vert(c.clone().add(ex).add(ez), up, 0.998, 0.498, cl, birth, anchor, 0.1);
    const j3 = g.vert(c.clone().sub(ex).add(ez), up, 0.502, 0.498, cl, birth, anchor, 0.1);
    g.quad(j0, j1, j2, j3);
  }

  // Prostrate runners creeping out past the cushion at the rim.
  const runners = 44;
  for (let i = 0; i < runners; i++) {
    const az = (i / runners) * Math.PI * 2 + (r() - 0.5) * 0.12;
    const head = az + (r() - 0.5) * 0.8;
    const a = V(Math.cos(az) * R * 0.8, 0.012, Math.sin(az) * R * 0.8);
    const len = R * (0.14 + r() * 0.07);
    const b = a.clone().add(V(Math.cos(head) * len, 0.006 + r() * 0.012, Math.sin(head) * len));
    const dir = b.clone().sub(a).normalize();
    const across = V().crossVectors(dir, up).normalize();
    const cl = jitter(tints[i % 3], r, 0.008, 0.03, 0.03);
    const birth = clamp(0.45 + r() * 0.4);
    strip(a, b, across, wid, up, i % 2, 1 - (len / wid) * 0.25, 0.998, cl.clone().multiplyScalar(0.85), cl, birth, a.clone().multiplyScalar(0.8), 0.05, 0.15);
  }

}
