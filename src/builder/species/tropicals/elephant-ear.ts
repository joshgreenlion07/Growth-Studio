import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { fitToSize, gridSurface, tubeVar } from '../trees/shared-trees-b';

/**
 * Elephant ear, Colocasia esculenta: a clump of long arching petioles from
 * the ground, each holding one big heart-shaped (sagittate, peltate) leaf
 * that hangs with its tip down. Matte mid-green with paler radiating veins
 * and wavy margins. The blades are curved sheets; the outline and veins are
 * painted.
 */

/** Where the petiole joins the blade, as a fraction of the length from the tip. */
const ATTACH = 0.68;

function earOutline(g: CanvasRenderingContext2D, X: (a: number) => number, Y: (b: number) => number, k = 1) {
  const x = (a: number) => X(a * k), y = (b: number) => Y(ATTACH + (b - ATTACH) * k);
  g.beginPath();
  g.moveTo(x(0), y(0));
  g.bezierCurveTo(x(0.04), y(0.08), x(0.44), y(0.24), x(0.495), y(0.58));
  g.bezierCurveTo(x(0.52), y(0.84), x(0.46), y(1), x(0.29), y(1));
  g.bezierCurveTo(x(0.15), y(1), x(0.05), y(0.9), x(0), y(0.775));
  g.bezierCurveTo(x(-0.05), y(0.9), x(-0.15), y(1), x(-0.29), y(1));
  g.bezierCurveTo(x(-0.46), y(1), x(-0.52), y(0.84), x(-0.495), y(0.58));
  g.bezierCurveTo(x(-0.44), y(0.24), x(-0.04), y(0.08), x(0), y(0));
  g.closePath();
}

function earLeaves(): THREE.Texture {
  return leafTexture('elephant-ear', 1024, 1024, (g) => {
    const r = rng('ear-tex');
    for (let cell = 0; cell < 2; cell++) {
      const X = (a: number) => cell * 512 + 256 + a * 496;
      const Y = (b: number) => 1016 - b * 1008;
      g.save();
      earOutline(g, X, Y);
      g.clip();
      const rg = g.createRadialGradient(X(0), Y(ATTACH), 10, X(0), Y(0.5), 620);
      rg.addColorStop(0, cell ? '#5c9442' : '#4b8438');
      rg.addColorStop(0.5, cell ? '#4a8437' : '#3b722f');
      rg.addColorStop(1, cell ? '#407a32' : '#32662a');
      g.fillStyle = rg;
      g.fillRect(cell * 512, 0, 512, 1024);
      // Velvet mottling.
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(20,50,16,0.05)' : 'rgba(150,200,110,0.05)';
        g.beginPath();
        g.arc(cell * 512 + r() * 512, r() * 1024, 3 + r() * 9, 0, Math.PI * 2);
        g.fill();
      }
      const vein = (pts: [number, number][], w0: number, w1: number, alpha: number) => {
        const n = 14;
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          const q = (t: number): [number, number] => {
            const u = 1 - t;
            return [u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]];
          };
          const a = q(t0), b = q(t1);
          g.strokeStyle = `rgba(150,196,112,${alpha * 0.72})`;
          g.lineWidth = lerp(w0, w1, t0);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(X(a[0]), Y(a[1]));
          g.lineTo(X(b[0]), Y(b[1]));
          g.stroke();
        }
      };
      // Fine net veins between the laterals.
      for (let i = 0; i < 90; i++) {
        const a0 = (r() - 0.5) * 0.96, b0 = r();
        const ang = Math.atan2(b0 - ATTACH, a0) + Math.PI / 2 + (r() - 0.5) * 0.5;
        vein([[a0, b0], [a0 + Math.cos(ang) * 0.04, b0 + Math.sin(ang) * 0.03], [a0 + Math.cos(ang) * 0.09, b0 + Math.sin(ang) * 0.06]], 1.6, 1, 0.22);
      }
      // Laterals off the midrib, curving up toward the margin.
      for (let i = 0; i < 7; i++) {
        const b0 = ATTACH - 0.06 - i * 0.085;
        const reach = 0.46 * Math.sin(Math.PI * clamp(b0 / 0.9) * 0.62 + 0.25);
        for (const s of [-1, 1]) vein([[0, b0], [s * reach * 0.55, b0 + 0.02], [s * reach, b0 + 0.13 + i * 0.012]], 6, 1.6, 0.75);
      }
      // Veins radiating from the petiole junction: sides and the two lobes.
      for (const s of [-1, 1]) {
        vein([[0, ATTACH], [s * 0.26, ATTACH - 0.02], [s * 0.47, ATTACH + 0.06]], 7, 1.8, 0.8);
        vein([[0, ATTACH], [s * 0.22, ATTACH + 0.09], [s * 0.43, ATTACH + 0.2]], 6, 1.6, 0.75);
        vein([[0, ATTACH], [s * 0.13, ATTACH + 0.16], [s * 0.25, ATTACH + 0.3]], 9, 2, 0.85);
        vein([[s * 0.1, ATTACH + 0.13], [s * 0.07, ATTACH + 0.2], [s * 0.1, ATTACH + 0.29]], 4, 1.4, 0.6);
        vein([[s * 0.16, ATTACH + 0.19], [s * 0.26, ATTACH + 0.22], [s * 0.36, ATTACH + 0.27]], 4, 1.4, 0.6);
      }
      vein([[0, ATTACH], [0, 0.4], [0, 0.015]], 11, 2.5, 0.92);
      // Collecting vein just inside the margin, and a slightly paler edge.
      g.strokeStyle = 'rgba(170,206,132,0.5)';
      g.lineWidth = 2;
      earOutline(g, X, Y, 0.95);
      g.stroke();
      g.strokeStyle = 'rgba(120,160,84,0.6)';
      g.lineWidth = 5;
      earOutline(g, X, Y);
      g.stroke();
      // Junction spot.
      g.fillStyle = 'rgba(196,224,160,0.9)';
      g.beginPath();
      g.arc(X(0), Y(ATTACH), 9, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

function earStem(): THREE.Texture {
  return barkTexture('elephant-ear-stem', 128, (g, S) => {
    const r = rng('ear-stem');
    g.fillStyle = '#dcdcd0';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.5 ? `rgba(90,110,70,${0.06 + r() * 0.1})` : `rgba(255,255,250,${0.1 + r() * 0.15})`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 2, y + 20 + r() * 60);
      g.stroke();
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const N = 19;
  const stemTop = col('#8fba62'), stemBase = col('#bccf94');

  for (let k = 0; k < N; k++) {
    // k = 0 newest (center, upright) .. N - 1 oldest (outside, leaning out).
    const age = k / (N - 1);
    const az = k * 2.39996 + (r() - 0.5) * 0.5;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const base = out.clone().multiplyScalar(0.03 + age * 0.1);
    const size = lerp(0.8, 1, Math.sin(Math.PI * clamp(0.15 + age * 0.75))) * (0.9 + r() * 0.2);
    const Lp = lerp(1.3, 0.72, Math.pow(age, 1.2)) * (0.92 + r() * 0.16);
    const lean = lerp(0.1, 0.5, Math.pow(age, 0.9)) + (r() - 0.5) * 0.12;
    const bend = 0.3 + r() * 0.3;
    const birth = k % 5 === 0 || age > 0.45 && r() < 0.75 ? 0 : clamp(0.15 + (1 - age) * 0.6 + (r() - 0.5) * 0.2, 0.1, 0.85);

    // Petiole: rises from the crown, arching outward toward its tip.
    const n = 10;
    const pts: THREE.Vector3[] = [base.clone().add(V(0, -0.04, 0))];
    let p = base.clone();
    for (let i = 1; i <= n; i++) {
      const th = lean + bend * Math.pow((i - 0.5) / n, 2.2);
      p = p.clone().addScaledVector(out, Math.sin(th) * Lp / n).add(V(0, Math.cos(th) * Lp / n, 0));
      pts.push(p);
    }
    const swayAt = (i: number) => 0.62 * Math.pow(i / n, 1.4);
    const tint = 0.9 + r() * 0.2;
    tubeVar(
      wood, pts, (i) => lerp(0.02, 0.0085, Math.pow(i / n, 0.7)) * size * (i <= 1 ? 1.7 - i * 0.45 : 1), 6,
      (i) => stemBase.clone().lerp(stemTop, clamp(i / 3)).multiplyScalar(tint), birth, base, swayAt, { uScale: 1 },
    );

    // Blade: hangs from the petiole tip, face turned outward and up, tip pointing down.
    const A = pts[n];
    const L = 0.6 * size, W = L * 0.86;
    const e = lerp(1.15, 0.5, Math.pow(age, 0.7)) + (r() - 0.5) * 0.4; // elevation of the face normal
    const roll = (r() - 0.5) * 0.5, yaw = (r() - 0.5) * 0.6;
    const o2 = out.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(side, Math.sin(yaw));
    const s2 = V(-o2.z, 0, o2.x);
    const nrm = o2.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0));
    const tip = o2.clone().multiplyScalar(Math.sin(e)).add(V(0, -Math.cos(e), 0));
    const sd = s2.clone().multiplyScalar(Math.cos(roll)).addScaledVector(nrm, Math.sin(roll));
    const nn = V().crossVectors(sd, tip).normalize().multiplyScalar(-1);
    if (nn.dot(nrm) < 0) nn.multiplyScalar(-1);
    const cell = age < 0.25 ? 1 : 0;
    const u0 = cell * 0.5, phase = r() * 6, waves = 6 + Math.floor(r() * 3);
    const tipCurl = 0.1 + r() * 0.25, lobeCurl = 0.1 + r() * 0.3, vfold = 0.1 + r() * 0.16;
    const shade = (age > 0.8 ? 0.86 : 1) * (0.9 + r() * 0.18);
    const c = new THREE.Color(shade * (age < 0.25 ? 1.04 : 1), shade, shade * (0.94 + r() * 0.08));
    const ROWS = 14, COLS = 12;
    gridSurface(leaves, ROWS, COLS, (i, j) => {
      const b = lerp(-0.005, 1.005, i / ROWS), a = lerp(-0.515, 0.515, j / COLS);
      const x = a * W, y = (b - ATTACH) * L;
      const rho = Math.min(1.2, Math.hypot(a / 0.5, y / (L * (y > 0 ? 1 - ATTACH : ATTACH))));
      let z = W * (vfold * Math.abs(a) * 2 - 0.5 * a * a * 2 * (0.6 + vfold));
      if (y < 0) z -= L * tipCurl * Math.pow(-y / (L * ATTACH), 2.2);
      else z -= L * lobeCurl * Math.pow(y / (L * (1 - ATTACH)), 2) * 0.5;
      z += W * 0.06 * Math.sin(Math.atan2(y, x) * waves + phase) * rho * rho * rho;
      const q = A.clone().addScaledVector(sd, x).addScaledVector(tip, -y).addScaledVector(nn, z + 0.012);
      return { p: q, u: u0 + (256 + a * 496) / 1024, v: clamp((8 + b * 1008) / 1024), c, sway: clamp(0.62 + rho * 0.22) };
    }, birth, base);
  }

  // A rolled new leaf spear in the middle.
  const spear = [0, 0.2, 0.42, 0.62, 0.8].map((y, i) => V(0.02 + i * 0.006, y - 0.03, 0.01));
  const sr = [0.016, 0.02, 0.022, 0.016, 0.003];
  const sc = col('#b4d684');
  tubeVar(wood, spear, (i) => sr[i], 6, () => sc, 0.2, V(), (i) => i * 0.12, { uScale: 1 });

  fitToSize([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: earLeaves(),
    bark: { map: earStem() },
    look: { translucency: 0.5, leafRoughness: 0.82, bend: 0.1, flutter: 0.01, woodShadows: true },
  };
};
