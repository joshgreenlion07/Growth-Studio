import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, deflect, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { fitGeo } from './shared-succulents';

/**
 * Blue sedum, modeled on Sedum reflexum (rupestre) 'Blue Spruce': a low,
 * dense, continuous cushion 4 to 6 in tall. Trailing stems lie along the
 * ground and every tip turns up 2 to 3 in, so the plant reads as a carpet of
 * small powdery blue-green bottle-brush tips packed shoulder to shoulder,
 * gently domed in the middle and thinning to prostrate runners at the rim.
 * Mass planted, so each tip is two crossed painted cards plus an end-on
 * rosette card; density carries the look.
 */

/** One plump needle leaf: a capsule with a lit upper side and a shaded lower side. */
function needle(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, shade: number, pink: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  const k = (v: number) => Math.round(v * shade);
  grad.addColorStop(0, `rgb(${k(136)},${k(170)},${k(166)})`);
  grad.addColorStop(0.5, `rgb(${k(100)},${k(135)},${k(133)})`);
  grad.addColorStop(1, `rgb(${k(72)},${k(103)},${k(105)})`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -wid * 0.32);
  g.quadraticCurveTo(len * 0.55, -wid * 0.62, len, 0);
  g.quadraticCurveTo(len * 0.55, wid * 0.62, 0, wid * 0.32);
  g.closePath();
  g.fill();
  if (pink > 0) {
    g.fillStyle = `rgba(186,120,128,${pink})`;
    g.beginPath();
    g.arc(len * 0.9, 0, wid * 0.3, 0, 6.3);
    g.fill();
  }
  g.restore();
}

function atlas(): THREE.Texture {
  return leafTexture('blue-sedum', 512, 512, (g) => {
    const r = rng('blue-sedum-tex');
    // Two side-view sprigs, 128 x 512 each: stem base at the bottom, tip at the top.
    for (let cell = 0; cell < 2; cell++) {
      const cx = cell * 128 + 64;
      g.strokeStyle = '#8fa89a';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx, 512);
      g.lineTo(cx, 40);
      g.stroke();
      const n = 150;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); // bottom to top
        const y = 506 - t * 470;
        const ph = i * 2.4 + cell;
        const sx = Math.sin(ph); // -1 left .. 1 right; cos is toward or away from the viewer
        const front = Math.cos(ph);
        const tipTight = clamp((t - 0.82) / 0.18);
        const open = lerp(1.0, 0.25, tipTight) * (0.85 + r() * 0.3);
        const len = lerp(40, 26, tipTight) * (0.8 + r() * 0.4) * lerp(0.75, 1, Math.min(1, t * 4));
        const a = -Math.PI / 2 + sx * open;
        const shade = lerp(0.8, 1.06, (front + 1) / 2) * lerp(0.86, 1.06, t) * (0.94 + r() * 0.12);
        needle(g, cx + sx * 5, y, a, len * lerp(1, 0.75, Math.abs(front) * (1 - Math.abs(sx))), 12, shade, t > 0.9 && r() < 0.3 ? 0.35 : 0);
      }
    }
    // Top-view rosette (a tip seen end-on), upper right.
    const rosette = (cx: number, cy: number, R: number) => {
      const n = 46;
      for (let i = 0; i < n; i++) {
        const f = 1 - i / (n - 1); // outer leaves first, the center last
        const a = i * 2.39996;
        const rad = R * 0.1 * f;
        const len = R * lerp(0.42, 0.98, f) * (0.85 + r() * 0.3);
        needle(g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, a, len, R * lerp(0.16, 0.2, f), lerp(1.1, 0.84, f) * (0.94 + r() * 0.12), f < 0.25 && r() < 0.3 ? 0.3 : 0);
      }
    };
    rosette(384, 128, 118);
    // Lower right: a patch of nine tips seen from above, the cushion's lower layer.
    g.save();
    g.beginPath();
    g.rect(256, 256, 256, 256);
    g.clip();
    for (let k = 0; k < 9; k++) rosette(256 + 46 + (k % 3) * 82 + (r() - 0.5) * 14, 256 + 46 + Math.floor(k / 3) * 82 + (r() - 0.5) * 14, 50);
    g.restore();
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  const R = Sp / 2;
  const tints = [col('#ffffff'), col('#f1f8f5'), col('#f8f8ee')];
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
  const surface = (rad: number) => H * lerp(0.98, 0.1, Math.pow(clamp(rad / R), 1.8));
  const wid = 0.036; // a 1 cm stem with 1.5 cm needles each side, true scale

  // Upturned tips, evenly packed over the whole footprint.
  const tips = 850;
  for (let i = 0; i < tips; i++) {
    const f = (i + 0.5) / tips;
    const rad = clamp(R * 0.95 * Math.sqrt(f) + (r() - 0.5) * 0.03, 0, R * 0.96), az = i * 2.39996 + (r() - 0.5) * 0.5;
    const edge = clamp(rad / R);
    const top = surface(rad) * (0.86 + r() * 0.14);
    const len = Math.min(top, 0.05 + r() * 0.025);
    // Tips stand up in the middle and lean outward more and more toward the rim.
    const outv = V(Math.cos(az), 0, Math.sin(az));
    const lean = lerp(0.12, 1.15, Math.pow(edge, 2)) + (r() - 0.5) * 0.35;
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

  fitGeo([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: atlas(),
    look: { leafRoughness: 0.7, translucency: 0.12, bend: 0.01, flutter: 0.0015, leafShadows: true },
  };
};
