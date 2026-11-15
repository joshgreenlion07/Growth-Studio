import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { bezPath, fitToSize, funnelFlower, stemBark } from './shared-perennials';

/**
 * Seasonal bedding color. Modeled on a compact mounding petunia /
 * calibrachoa (Million Bells) color mix as sold in 4 in pots: a low mound of
 * small, soft, elliptic green leaves almost hidden under open five-lobed
 * funnel flowers, some stems in hot pink with a yellow throat and some in
 * golden yellow (the catalog's two flower colors).
 */

function annualLeaves(): THREE.Texture {
  return leafTexture('annual-color-leaves', 512, 512, (g) => {
    const S = 256;
    const r = rng('annual-leaf-tex');
    const leaf = (x: number, y: number, a: number, len: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      const wid = len * (0.4 + r() * 0.08);
      const v = r();
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, v < 0.5 ? '#3d6a2c' : '#447232');
      grad.addColorStop(1, v < 0.33 ? '#5a8a3a' : v < 0.66 ? '#669842' : '#74a64c');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.25, -wid * 0.62, len * 0.75, -wid * 0.55, len, 0);
      g.bezierCurveTo(len * 0.75, wid * 0.55, len * 0.25, wid * 0.62, 0, 0);
      g.fill();
      g.strokeStyle = 'rgba(160,200,120,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.92, 0);
      g.stroke();
      g.restore();
    };
    for (let c = 0; c < 4; c++) {
      g.save();
      g.translate((c % 2) * S, Math.floor(c / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      // A short shoot: leaves alternate up a soft green stem, with a tuft at the tip.
      const x0 = S / 2, y0 = S - 2, y1 = S * 0.42, bend = (r() - 0.5) * 40;
      g.strokeStyle = '#6f9450';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + bend, (y0 + y1) / 2, x0 + bend * 0.6, y1);
      g.stroke();
      const n = 6 + c;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.4) / n;
        const s = i % 2 ? 1 : -1;
        const x = x0 + bend * t * 0.8, y = lerp(y0 - 8, y1, t);
        leaf(x, y, -Math.PI / 2 + s * (0.75 + r() * 0.5), S * (0.4 + r() * 0.1) * lerp(1, 0.75, t));
      }
      for (const a of [-0.5, 0.45, 0]) leaf(x0 + bend * 0.6, y1, -Math.PI / 2 + a + (r() - 0.5) * 0.2, S * (0.3 + r() * 0.08));
      g.restore();
    }
  });
}

/** 2 x 2, all face-on: pink and yellow flowers on the top row, deeper versions of each below. */
function annualFlowers(pink: string, yellow: string): THREE.Texture {
  return leafTexture(`annual-color-flowers-${pink}-${yellow}`, 512, 512, (g) => {
    const S = 256;
    const P = new THREE.Color(pink), Y = new THREE.Color(yellow);
    const css = (c: THREE.Color, k = 1) => `#${c.clone().multiplyScalar(k).getHexString()}`;
    const face = (cx: number, cy: number, main: THREE.Color, edge: string, deep: string, throat: string, vein: string) => {
      const R = S * 0.47;
      // Five broad lobes, shallowly notched, fused into one wavy-edged disc.
      g.beginPath();
      for (let k = 0; k <= 100; k++) {
        const a = (k / 100) * Math.PI * 2;
        const rr = R * (0.9 + 0.1 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.6)) * (1 + 0.012 * Math.sin(a * 23));
        if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      const grad = g.createRadialGradient(cx, cy, R * 0.08, cx, cy, R);
      grad.addColorStop(0, throat);
      grad.addColorStop(0.2, deep);
      grad.addColorStop(0.5, css(main));
      grad.addColorStop(1, edge);
      g.fillStyle = grad;
      g.fill();
      g.save();
      g.clip();
      // Veins fanning from the throat; the folds between lobes are darker.
      g.strokeStyle = vein;
      for (let k = 0; k < 5; k++) {
        const a0 = (k / 5) * Math.PI * 2 + Math.PI / 5;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
        g.stroke();
        g.lineWidth = 1.5;
        for (const d of [-0.36, -0.2, 0.2, 0.36]) {
          const a = a0 + Math.PI / 5 + d;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * R * 0.14, cy + Math.sin(a) * R * 0.14);
          g.lineTo(cx + Math.cos(a + d * 0.3) * R * 0.85, cy + Math.sin(a + d * 0.3) * R * 0.85);
          g.stroke();
        }
      }
      g.restore();
      const th = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.2);
      th.addColorStop(0, throat);
      th.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = th;
      g.beginPath();
      g.arc(cx, cy, R * 0.2, 0, Math.PI * 2);
      g.fill();
    };
    face(S / 2, S / 2, P.clone().multiplyScalar(0.74), css(P, 0.82), css(P, 0.45), '#f0c22a', 'rgba(110,5,55,0.32)');
    face(S + S / 2, S / 2, Y.clone().multiplyScalar(0.8), css(Y, 0.86), css(Y.clone().lerp(new THREE.Color('#d9780a'), 0.6)), '#a8540a', 'rgba(170,90,5,0.32)');
    // Bottom row: the same two flowers, a shade deeper, for variety.
    face(S / 2, S + S / 2, P.clone().multiplyScalar(0.64), css(P, 0.74), css(P, 0.4), '#e8b824', 'rgba(110,5,55,0.36)');
    face(S + S / 2, S + S / 2, Y.clone().lerp(new THREE.Color('#d8900c'), 0.4).multiplyScalar(0.85), css(Y, 0.8), '#c9780c', '#a04e08', 'rgba(170,90,5,0.36)');
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const R = Sp / 2;
  const k = Sp / 0.3;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const center = V(0, 0, 0), radii = V(R, H, R);
  const stemCol = col('#6d9150');
  const crown = V(0, 0.004, 0);

  /** A point on the mound: `u` 0 at the top .. 1 at the rim, `depth` 1 on the surface. */
  const onDome = (az: number, u: number, depth: number) => {
    const ph = Math.pow(u, 0.85) * 1.45; // angle down from the top; the rim sits just above the ground
    return V(Math.cos(az) * Math.sin(ph) * R * depth, Math.max(0.006, Math.cos(ph) * H * depth), Math.sin(az) * Math.sin(ph) * R * depth);
  };
  const outward = (p: THREE.Vector3) => V(p.x / (R * R), p.y / (H * H), p.z / (R * R)).normalize();
  const sway = (p: THREE.Vector3) => clamp((p.y / H) * 0.5 + (Math.hypot(p.x, p.z) / R) * 0.25);
  // Two color lots share the pot: stems on about three fifths of the mound are pink, the rest yellow.
  const isPink = (az: number) => Math.sin(az * 2 + 0.6) + Math.sin(az * 3 + 2) * 0.5 > -0.35;

  // Leafy shoots: a dense shell just under the flowers, and a darker fill inside.
  const NL = 300;
  for (let i = 0; i < NL; i++) {
    const inner = i % 5 === 4;
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const u = Math.sqrt((i + 0.5) / NL);
    const depth = inner ? 0.42 + r() * 0.2 : 0.66 + r() * 0.16;
    const at = onDome(az, u, depth);
    const out = outward(at);
    const tangent = V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(r() < 0.5 ? 1 : -1);
    const dir = out.clone().multiplyScalar(0.55).addScaledVector(tangent, 0.5 + r() * 0.5).add(V(0, (r() - 0.3) * 0.5, 0)).normalize();
    const shade = inner ? 0.45 + r() * 0.1 : lerp(0.6, 0.84, clamp(at.y / (H * 0.7))) * (0.9 + r() * 0.14);
    const c = jitter(col('#ffffff', shade), r, 0.015, 0.06, 0.03);
    const face = out.clone().add(V((r() - 0.5) * 0.9, 0.3, (r() - 0.5) * 0.9)).normalize();
    const size = (0.042 + r() * 0.016) * k;
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + u * 0.45 + r() * 0.3, 0, 0.85);
    const s = sway(at);
    leafQuad(leaves, at, dir, face, size, size, uvCell(2, 2, Math.floor(r() * 4)), c, birth, birth > 0 ? crown : at, { segs: 2, curl: 0.3 + r() * 0.6, center, radii, normalBend: 0.55, sway0: s, sway1: clamp(s + 0.08) });
  }

  // Open flowers all over the mound, each on its own short stalk, facing up and out.
  const NF = 92;
  for (let i = 0; i < NF; i++) {
    const az = i * 2.39996 + 0.5 + (r() - 0.5) * 0.5;
    const u = clamp(Math.sqrt((i + 0.5) / NF) * 0.97 + (r() - 0.5) * 0.06);
    const at = onDome(az, u, lerp(0.84, 0.96, clamp(u * 2)) + r() * 0.04);
    const out = outward(at);
    const nrm = out.clone().add(V((r() - 0.5) * 0.5, 0.75, (r() - 0.5) * 0.5)).normalize();
    const pink = isPink(az);
    const rad = (0.0175 + r() * 0.004) * k;
    const c = jitter(col('#ffffff', 0.93 + r() * 0.07), r, 0.01, 0.03, 0.02);
    const birth = i % 2 === 0 ? 0 : clamp(0.1 + u * 0.4 + r() * 0.35, 0, 0.85);
    const s = sway(at);
    const foot = at.clone().addScaledVector(out, -0.035 * k);
    funnelFlower(flowers, at, nrm, rad, rad * 0.4, uvCell(2, 2, (pink ? 0 : 1) + (r() < 0.35 ? 2 : 0)), c, birth, birth > 0 ? crown : foot, s, 8, r() * 6.28);
    tube(wood, [foot, at.clone().addScaledVector(nrm, -rad * 0.4)], 0.0009 * k, 0.0007 * k, 3, stemCol, birth, birth > 0 ? crown : foot, () => s, 1);
  }

  // Main stems from the crown out into the mound (seen through gaps and at the base).
  for (let i = 0; i < 14; i++) {
    const az = i * 2.39996 + 0.2;
    const u = 0.25 + 0.75 * Math.sqrt((i + 0.5) / 14);
    const end = onDome(az, u, 0.8);
    const base = V(Math.cos(az) * 0.006, 0, Math.sin(az) * 0.006);
    const ctrl = V(end.x * 0.55, end.y * 0.25, end.z * 0.55);
    const birth = i % 2 === 0 ? 0 : 0.15 + r() * 0.5;
    tube(wood, bezPath(base, ctrl, end, 4), 0.0024 * k, 0.0012 * k, 3, stemCol, birth, base, (q) => sway(end) * (q / 4), 1);
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: annualLeaves(),
    flowerMap: annualFlowers(spec.flower2 ?? '#e8508a', spec.flower ?? '#f2c12e'),
    bark: { map: stemBark() },
    look: { translucency: 0.45, leafRoughness: 0.7, bend: 0.03, flutter: 0.006 },
  };
};
