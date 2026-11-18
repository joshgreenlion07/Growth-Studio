import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, jitter, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { arcPath, bezPath, fitToSize, sheet, stemBark } from './shared-perennials';
import { inCell, rect, type UV } from '../groundcover/shared-groundcovers';

/**
 * Florist's cyclamen, Cyclamen persicum, a red-flowered standard type as
 * sold in 6 in pots for winter color.
 *
 * A low mound of heart-shaped leaves on long reddish stalks, all rising from
 * a flat tuber at the soil line. The blades are dark green with a broad
 * silver band (the "hastate" or Christmas-tree pattern) around a dark green
 * center, finely toothed, held nearly level and overlapping. Above them,
 * slender reddish flower stalks rise straight up and hook over at the top,
 * so each flower hangs mouth-down while its five petals sweep back and up
 * (reflexed), each petal twisted like a propeller blade. A darker crimson
 * eye at the base of the petals; nodding, spindle-shaped buds among them.
 *
 * References and the numbers they give:
 * - NC State Extension Plant Toolbox, Cyclamen persicum
 *   (plants.ces.ncsu.edu/plants/cyclamen-persicum/): mounded, 6 to 9 in
 *   tall and wide; heart-shaped leaves 1 to 5.5 in long, dark green, often
 *   with a silvery pattern above, pale or purplish below; one 2 in flower
 *   (1 to 3 in) per stalk, stalks 6 to 9 in, straight from the tuber.
 * - University of Wisconsin-Madison Extension, "Cyclamen"
 *   (hort.extension.wisc.edu/articles/cyclamen): a mound up to 8 in tall;
 *   1 to 5 in rounded or heart-shaped leaves, dark green or marbled with
 *   silver; five petals that "curve back and twist", held above the
 *   foliage on slender stems.
 * - Clemson HGIC 1555, "Cyclamen" (hgic.clemson.edu/factsheet/cyclamen/):
 *   6 to 16 in tall, mounded; green foliage mottled with silver; petals
 *   reflex back from the center; red among the colors.
 * - The job photo (a finished job, early February, dusk): one plant beside
 *   the water feature, an 8 to 9 in mound of strongly silvered leaves with
 *   five or six red flowers standing just above it.
 * Size used: installed from a 6 in pot at 0.22 m tall (with flowers) x
 * 0.25 m wide; 0.25 x 0.3 m by the end of its first season.
 */

/* ---------------------------- leaf atlas ---------------------------- */

const LS = 512;
/** Leaf atlas, 2 x 2 cells of 512: the leaf's sinus (stalk attachment) sits at v = 0.258 of its cell, the tip at the top. */
const leafCell = (i: number): UV => rect((i % 2) * LS, Math.floor(i / 2) * LS, LS, LS, LS * 2, LS * 2);
const SINUS_V = (LS - 380) / LS, TIP_V = (LS - 14) / LS;

type Pt = [number, number];
const cubic = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};

/** Right half of a heart-shaped blade, sinus to tip, in a 512 cell (x from the midline). */
function halfHeart(round: number): Pt[] {
  const S: Pt = [0, 380], lobe: Pt = [128 + round * 10, 496], wide: Pt = [236, 318 - round * 10], tip: Pt = [0, 14];
  const segs: [Pt, Pt, Pt, Pt][] = [
    [S, [14, 430], [60, 500], lobe],
    [lobe, [210, 490], [244, 400], wide],
    [wide, [236, 170 - round * 25], [130, 34], tip],
  ];
  const out: Pt[] = [];
  for (const sg of segs) for (let k = 0; k < 40; k++) out.push(cubic(sg[0], sg[1], sg[2], sg[3], k / 40));
  out.push(tip);
  return out;
}

/** Full outline with fine teeth, closed, as canvas points around (cx, 0). */
function heartOutline(cx: number, round: number, teeth: number, r: () => number): Pt[] {
  const h = halfHeart(round);
  const side = (s: number) => h.map(([x, y], i): Pt => {
    const t = i / (h.length - 1);
    // Small forward teeth along the lobes and sides; none at the sinus or the tip.
    const k = t > 0.08 && t < 0.94 ? teeth * (1 - ((t * 46) % 1)) * (0.7 + r() * 0.6) : 0;
    const nx = x - 0, ny = y - 300;
    const n = Math.hypot(nx, ny) || 1;
    return [cx + s * (x + (nx / n) * k), y + (ny / n) * k];
  });
  const right = side(1), left = side(-1).reverse();
  return [...right, ...left];
}

function tracePts(g: CanvasRenderingContext2D, pts: Pt[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** The same outline shrunk toward (cx, cy) with a ragged, feathery edge, for the silver band and the dark center. */
function inset(pts: Pt[], cx: number, cy: number, k: number, jag: number, freq: number, ph: number): Pt[] {
  return pts.map(([x, y], i) => {
    const a = (i / pts.length) * Math.PI * 2;
    const j = 1 + jag * (Math.sin(a * freq + ph) * 0.6 + Math.sin(a * freq * 2.7 + ph * 1.3) * 0.4);
    return [cx + (x - cx) * k * j, cy + (y - cy) * k * j];
  });
}

function cyclamenLeaves(): THREE.Texture {
  return leafTexture('cyclamen-red-leaves', LS * 2, LS * 2, (g) => {
    const r = rng('cyclamen-leaf-tex');
    // [margin green, silver, center green, silver width]
    const looks: [string, string, string, number][] = [
      ['#253f17', '#7f8a6c', '#2c4a20', 0.76],
      ['#284419', '#76826a', '#30501f', 0.7],
      ['#223a15', '#87917a', '#2a4720', 0.82],
      ['#2f5020', '#7c886c', '#365a24', 0.68],
    ];
    for (let c = 0; c < 4; c++) {
      inCell(g, (c % 2) * LS, Math.floor(c / 2) * LS, LS, LS, () => {
        const [edge, silver, centre, sw] = looks[c];
        const cx = LS / 2;
        const out = heartOutline(cx, c === 3 ? 1 : r(), 3.5, r);
        tracePts(g, out);
        g.fillStyle = edge;
        g.fill();
        g.save();
        g.clip();
        // Silver band following the margin, feathered at both edges.
        const ph = r() * 6;
        tracePts(g, inset(out, cx, 300, sw, 0.05, 9, ph));
        g.fillStyle = silver;
        g.fill();
        // Pale flecks spilling into the dark margin and the silver.
        for (let i = 0; i < 260; i++) {
          const a = r() * Math.PI * 2, d = 120 + r() * 120;
          g.fillStyle = r() < 0.6 ? `rgba(196,202,178,${0.25 + r() * 0.35})` : `rgba(28,48,18,${0.2 + r() * 0.3})`;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * d, 270 + Math.sin(a) * d * 0.95, 2 + r() * 5, 1.5 + r() * 3, a, 0, Math.PI * 2);
          g.fill();
        }
        // Dark "tree" in the middle, pointing to the tip.
        tracePts(g, inset(out, cx, 250, sw * 0.5, 0.14, 7, ph + 1));
        g.fillStyle = centre;
        g.fill();
        // A soft sheen on the waxy surface.
        const sh = g.createRadialGradient(cx - 40, 200, 10, cx, 260, 260);
        sh.addColorStop(0, 'rgba(255,255,255,0.06)');
        sh.addColorStop(1, 'rgba(0,0,0,0.12)');
        g.fillStyle = sh;
        g.fillRect(0, 0, LS, LS);
        // Palmate veins from the sinus: pale through the dark parts.
        g.lineCap = 'round';
        for (let k = -4; k <= 4; k++) {
          const a = -Math.PI / 2 + k * 0.42;
          g.strokeStyle = k === 0 ? 'rgba(150,175,135,0.55)' : 'rgba(140,165,128,0.32)';
          g.lineWidth = k === 0 ? 5 : 2.5;
          g.beginPath();
          g.moveTo(cx, 380);
          g.quadraticCurveTo(cx + Math.cos(a) * 120, 380 + Math.sin(a) * 140, cx + Math.cos(a * 1.04) * 230, 380 + Math.sin(a) * 300);
          g.stroke();
        }
        g.restore();
        // Thin dark rim.
        tracePts(g, out);
        g.strokeStyle = 'rgba(30,45,22,0.45)';
        g.lineWidth = 1.5;
        g.stroke();
      });
    }
  });
}

/* --------------------------- flower atlas --------------------------- */

const FW = 512, FH = 256;
/** Flower atlas, four 128 x 256 cells: two petals, a bud, a third petal. Base of each at the cell bottom. */
const fCell = (i: number): UV => rect(i * 128, 0, 128, 256, FW, FH);

function petalShape(g: CanvasRenderingContext2D, x: number, w: number, h: number, r: () => number) {
  // Narrow claw at the base, widest about 60 % up, a rounded, slightly pointed tip.
  const N = 40;
  const prof = (t: number) => (t < 0.6 ? 0.22 + 0.78 * Math.sin((t / 0.6) * Math.PI * 0.5) : Math.pow(Math.cos(((t - 0.6) / 0.4) * Math.PI * 0.5), 0.75));
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([x + (w / 2) * prof(t) * (1 + 0.025 * Math.sin(t * 23 + r())), h - 4 - t * (h - 10)]);
  }
  g.beginPath();
  g.moveTo(x, h - 4);
  for (const p of pts) g.lineTo(p[0], p[1]);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(2 * x - pts[i][0], pts[i][1]);
  g.closePath();
}

function cyclamenFlowers(main: string, deep: string): THREE.Texture {
  return leafTexture(`cyclamen-red-flowers-${main}-${deep}`, FW, FH, (g) => {
    const r = rng('cyclamen-flower-tex');
    const M = new THREE.Color(main), D = new THREE.Color(deep);
    const css = (c: THREE.Color) => `#${c.getHexString()}`;
    for (const c of [0, 1, 3]) {
      inCell(g, c * 128, 0, 128, 256, (w, h) => {
        petalShape(g, w / 2, w * 0.9, h, r);
        const gr = g.createLinearGradient(0, h, 0, 0);
        const body = M.clone().multiplyScalar(c === 1 ? 0.88 : 1);
        gr.addColorStop(0, css(D.clone().multiplyScalar(0.55)));
        gr.addColorStop(0.12, css(D));
        gr.addColorStop(0.3, css(body.clone().lerp(D, 0.25)));
        gr.addColorStop(0.75, css(body));
        gr.addColorStop(1, css(body.clone().lerp(new THREE.Color('#ff4a5a'), 0.12)));
        g.fillStyle = gr;
        g.fill();
        g.save();
        g.clip();
        // Fine veins running the length of the petal, and a slight satin streak.
        for (let k = 0; k < 9; k++) {
          const x = w / 2 + (k - 4) * w * 0.09;
          g.strokeStyle = `rgba(90,0,20,${0.12 + r() * 0.1})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(w / 2 + (k - 4) * 2, h);
          g.quadraticCurveTo(x, h * 0.5, x * 1.02 - w * 0.01, 4);
          g.stroke();
        }
        g.fillStyle = 'rgba(255,140,150,0.08)';
        g.fillRect(w * 0.3, 0, w * 0.12, h);
        g.restore();
      });
    }
    // A bud: a slim twisted red spindle in a short green calyx.
    inCell(g, 256, 0, 128, 256, (w, h) => {
      const x = w / 2;
      g.beginPath();
      g.moveTo(x - 7, h - 4);
      g.quadraticCurveTo(x - w * 0.28, h * 0.45, x, 10);
      g.quadraticCurveTo(x + w * 0.28, h * 0.45, x + 7, h - 4);
      g.closePath();
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, '#3d5a2c');
      gr.addColorStop(0.2, css(D.clone().multiplyScalar(0.7)));
      gr.addColorStop(0.6, css(M.clone().multiplyScalar(0.85)));
      gr.addColorStop(1, css(M));
      g.fillStyle = gr;
      g.fill();
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(70,0,15,0.45)';
      g.lineWidth = 3;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.moveTo(x - 30 + k * 15, h);
        g.quadraticCurveTo(x - 10 + k * 8, h * 0.5, x + 20 - k * 4, 0);
        g.stroke();
      }
      g.restore();
      g.fillStyle = '#4a6a34';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, h - 2);
        g.quadraticCurveTo(x + s * 18, h - 30, x + s * 8, h - 52);
        g.quadraticCurveTo(x + s * 4, h - 30, x, h - 2);
        g.fill();
      }
    });
  });
}

/* ----------------------------- geometry ----------------------------- */

/**
 * A petal card that leaves `base` along `dir`, its flat side facing `face`,
 * twisting by `twist` radians and bending toward `face` by `curl` radians
 * over its length.
 */
function twistedPetal(
  g: GeoBuilder, base: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, len: number, wid: number, twist: number, curl: number,
  uv: UV, color: THREE.Color, birth: number, anchor: THREE.Vector3, sway0: number, sway1: number,
) {
  const rows = 4;
  const d = dir.clone().normalize();
  const side0 = V().crossVectors(d, face).normalize();
  const p = base.clone();
  let prev: number[] | null = null;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    if (i > 0) {
      d.applyAxisAngle(side0, curl / rows).normalize();
      p.addScaledVector(d, len / rows);
    }
    const s = side0.clone().applyAxisAngle(d, twist * t).normalize();
    const n = V().crossVectors(s, d).normalize();
    // A slight cup across the petal near its base.
    const cup = (1 - t) * wid * 0.12;
    const row = [-0.5, 0, 0.5].map((x) => {
      const q = p.clone().addScaledVector(s, x * wid).addScaledVector(n, Math.abs(x) * 2 * cup);
      return g.vert(q, n.clone().addScaledVector(s, -x * 0.5).normalize(), lerp(uv[0], uv[2], x + 0.5), lerp(uv[1], uv[3], t), color, birth, anchor, lerp(sway0, sway1, t));
    });
    if (prev) for (let c = 0; c < 2; c++) g.quad(prev[c], prev[c + 1], row[c + 1], row[c]);
    prev = row;
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const k = Sp / 0.3, ky = H / 0.25;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const crown = V(0, 0.012 * ky, 0);
  const petioleCol = col('#4c4a2c'), pedicelCol = col('#5a3426');

  // Leaves: inner ones stand higher and tilt up, outer ones lie out low over the soil and dip at the tip.
  const NL = 36;
  for (let i = 0; i < NL; i++) {
    const f = (i + 0.5) / NL;
    const az = i * 2.39996 + (r() - 0.5) * 0.35;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const L = lerp(0.044, 0.058, Math.pow(f, 0.7)) * (0.9 + r() * 0.2) * k;
    const rr = lerp(0.03, 0.088, Math.pow(f, 0.8)) * (0.92 + r() * 0.16) * k;
    const y = (lerp(0.112, 0.035, Math.pow(f, 1.3)) + (r() - 0.5) * 0.01) * ky;
    const A = out.clone().multiplyScalar(rr).add(V(0, y, 0));
    const elev = lerp(0.3, -0.18, Math.pow(f, 1.1)) + (r() - 0.5) * 0.2;
    const yaw = (r() - 0.5) * 0.5;
    const d = out.clone().applyAxisAngle(UP, yaw).multiplyScalar(Math.cos(elev)).add(V(0, Math.sin(elev), 0)).normalize();
    const s = V().crossVectors(UP, d).normalize().multiplyScalar(-1);
    const roll = (r() - 0.5) * 0.35;
    const up = V().crossVectors(s, d).normalize().applyAxisAngle(d, roll);
    const sr = s.clone().applyAxisAngle(d, roll);
    const W = L * (LS / 366);
    const cup = 0.08 + r() * 0.1, droop = lerp(0.05, 0.22, f) + r() * 0.08, wave = r() * 6.28;
    const birth = i % 5 === 4 ? clamp(0.25 + (1 - f) * 0.3 + r() * 0.3, 0, 0.85) : 0;
    const anchor = birth > 0 ? crown : A;
    // Grid: rows from behind the sinus (lobes) to the tip, columns across.
    const t0 = -SINUS_V / (TIP_V - SINUS_V), t1 = (1 - SINUS_V) / (TIP_V - SINUS_V);
    const rows = 6, cols = 5;
    const grid: THREE.Vector3[][] = [];
    for (let a = 0; a < rows; a++) {
      const t = lerp(t0, t1, a / (rows - 1));
      const row: THREE.Vector3[] = [];
      for (let b = 0; b < cols; b++) {
        const x = b / (cols - 1) - 0.5;
        const e = Math.abs(x) * 2;
        const lift = e * e * cup * W * 0.5 + Math.sin(t * 5 + wave + x * 3) * 0.004 * k * e - droop * Math.max(0, t) * Math.max(0, t) * L;
        row.push(A.clone().addScaledVector(d, t * L).addScaledVector(sr, x * W).addScaledVector(up, lift));
      }
      grid.push(row);
    }
    const tone = jitter(col('#ffffff', lerp(0.92, 0.78, f) * (0.92 + r() * 0.12)), r, 0.01, 0.04, 0.03);
    const cell = i % 7 === 0 ? 3 : Math.floor(r() * 3);
    const lsw = clamp(0.1 + f * 0.15);
    sheet(leaves, grid, leafCell(cell), (a) => tone.clone().multiplyScalar(lerp(0.85, 1, a / (rows - 1))), birth, anchor, (a) => lsw + 0.08 * (a / (rows - 1)));
    // The stalk: up out of the tuber, then over to the sinus.
    const base = V(Math.cos(az) * 0.008 * k, 0.01 * ky, Math.sin(az) * 0.008 * k);
    const ctrl = V(A.x * 0.3, A.y * 1.05 + 0.01 * ky, A.z * 0.3);
    tube(wood, bezPath(base, ctrl, A.clone().addScaledVector(up, -0.002), 4), 0.0012 * k, 0.001 * k, 3, petioleCol, birth, birth > 0 ? crown : base, (q) => lsw * (q / 4), 1);
  }

  // Flowers: stalks straight up from the tuber, hooked over at the top; petals swept back up past the hook.
  const NF = 13;
  for (let i = 0; i < NF; i++) {
    const bud = i % 4 === 3;
    const az = i * 2.39996 + 1.1 + (r() - 0.5) * 0.4;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const lean = 0.12 + r() * 0.26 + (i / NF) * 0.1;
    const hTop = (bud ? 0.13 + r() * 0.03 : 0.155 + r() * 0.035) * ky;
    const base = V(Math.cos(az) * 0.006 * k, 0.01 * ky, Math.sin(az) * 0.006 * k);
    const pts = arcPath(base, az, lean * 0.5, lean, hTop - base.y, 6, r, 0.06);
    const P = pts[pts.length - 1];
    const hookOut = out.clone().applyAxisAngle(UP, (r() - 0.5) * 1.2);
    const hook = [P.clone().add(hookOut.clone().multiplyScalar(0.004 * k)).add(V(0, 0.005 * ky, 0)), P.clone().add(hookOut.clone().multiplyScalar(0.009 * k)).add(V(0, 0.003 * ky, 0))];
    const M = P.clone().add(hookOut.clone().multiplyScalar(0.011 * k)).add(V(0, -0.003 * ky, 0));
    const birth = i < 9 ? 0 : clamp(0.3 + r() * 0.5, 0, 0.85);
    const anchor = birth > 0 ? crown : base;
    const swTop = 0.75 + r() * 0.2;
    const path = [...pts, ...hook, M];
    tube(wood, path, 0.0011 * k, 0.0009 * k, 3, pedicelCol, birth, anchor, (q) => swTop * Math.pow(q / (path.length - 1), 1.3), 1);
    const tone = jitter(col('#ffffff', 0.92 + r() * 0.08), r, 0.008, 0.03, 0.02);
    if (bud) {
      // A nodding bud hangs from the hook.
      const d = V(hookOut.x * 0.35, -1, hookOut.z * 0.35).normalize();
      const len = 0.022 * k, wid = 0.011 * k;
      const f0 = V().crossVectors(d, UP).normalize();
      for (let q = 0; q < 2; q++) {
        const face = f0.clone().applyAxisAngle(d, q * Math.PI * 0.5);
        twistedPetal(flowers, M, d, face, len, wid, 0.4, 0, fCell(2), tone, birth, anchor, swTop, swTop);
      }
      continue;
    }
    // A short dark nose below the petals.
    tube(wood, [M, M.clone().add(V(hookOut.x * 0.002, -0.006 * ky, hookOut.z * 0.002))], 0.0032 * k, 0.0018 * k, 4, col('#7a0c1e'), birth, anchor, () => swTop, 1);
    // Petals: the flower's axis points up and a little outward; each petal flares off it and twists.
    const axis = V(hookOut.x * 0.22, 1, hookOut.z * 0.22).normalize();
    const spin = r() * 6.28, twistDir = r() < 0.5 ? 1 : -1;
    const len = (0.036 + r() * 0.01) * k, wid = (0.017 + r() * 0.003) * k / 0.9;
    for (let p = 0; p < 5; p++) {
      const phi = spin + (p / 5) * Math.PI * 2 + (r() - 0.5) * 0.3;
      const dir = deflect(axis, 0.24 + r() * 0.2, phi);
      const radial = dir.clone().cross(V().crossVectors(axis, dir)).normalize().multiplyScalar(-1);
      const face = radial.lengthSq() > 0.5 ? radial : deflect(axis, Math.PI / 2, phi);
      const pb = M.clone().addScaledVector(face, 0.0025 * k).add(V(0, 0.002 * ky, 0));
      twistedPetal(flowers, pb, dir, face, len, wid, twistDir * (0.5 + r() * 0.6), 0.25 + r() * 0.2, fCell(p === 2 ? 3 : p % 2), tone, birth, anchor, swTop, clamp(swTop + 0.1));
    }
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: cyclamenLeaves(),
    flowerMap: cyclamenFlowers(spec.flower ?? '#c4122e', spec.flower2 ?? '#8e0a22'),
    bark: { map: stemBark() },
    look: { translucency: 0.3, leafRoughness: 0.64, bend: 0.035, flutter: 0.004 },
  };
};
