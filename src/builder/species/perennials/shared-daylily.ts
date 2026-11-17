import * as THREE from 'three';
import { GeoBuilder, V, UP, clamp, col, deflect, jitter, leafTexture, lerp, perp, rng, smoothstep, tube, type SpeciesGeo, type PlantSpec } from '../kit';
import { archPath, blade, bladeMap, fitClump, STRIP } from '../grasses/shared-grasses';
import { arcPath, stemBark } from './shared-perennials';

/**
 * Daylilies (Hemerocallis): a clump of fans of keeled, arching strap leaves
 * and leafless scapes that branch near the top into short arms, each with a
 * cluster of club-shaped buds. Flowers open one day each: six tepals in two
 * whorls (three broad, ruffled inner petals over three narrower outer
 * sepals) flaring from a short tube into a trumpet with recurved tips, six
 * stamens and a longer style lying along the lower tepals and curving up.
 *
 * Each tepal is a small curved sheet painted in true color (throat, midrib,
 * veins, ruffled edge); buds are spindles; spent flowers hang shriveled.
 * The cultivar files set sizes and colors in a DaylilyLook. The fortnight
 * lily borrows the flower-part helpers (tepal sheets, spindles, ribbons).
 */

export interface DaylilyLook {
  /** Texture cache key prefix (unique per cultivar). */
  key: string;
  /* Foliage */
  fans: number;
  /** Fans present at install (the center ones). */
  installFans: number;
  leavesPerFan: [number, number];
  /** Leaf length and width, meters, at maturity. */
  leafLen: [number, number];
  leafWid: [number, number];
  /** Crown radius the fans rise from. */
  crownR: number;
  /** Extra outward lean of the outer fans, radians. */
  fanLean: number;
  /** Splay of the outer leaves of a fan from its axis, radians. */
  splay: number;
  /** Arch of the leaves: [inner, outer] extra bend by the tip, radians. */
  arch: [number, number];
  leafMid: string[];
  leafBase: string;
  leafTip: string;
  /* Scapes */
  scapes: number;
  installScapes: number;
  /** Scape length (ground to the first fork), meters. */
  scapeLen: [number, number];
  /** Extra outward lean of the outer scapes, radians. */
  scapeLean: number;
  scapeR: number;
  scapeCol: string;
  scapeTop: string;
  /** Arms at the top of each scape. */
  arms: [number, number];
  armLen: [number, number];
  /** Buds per arm (besides the open flower). */
  buds: [number, number];
  /** Chance an arm carries an open flower, and a spent one. */
  openChance: number;
  spentChance: number;
  /* Flower */
  /** Face-on diameter, meters. */
  dia: number;
  /** Tepal angle from the flower's face plane: steep at the throat, flaring or recurved at the tip (radians). */
  flare: [number, number];
  /** Ruffle amplitude (fraction of tepal width) for petals, and petal width / length. */
  ruffle: number;
  petalW: number;
  sepalW: number;
  /** Texture colors: petal throat, mid, main, edge shading; sepal main; midrib; edge line. */
  throat: string;
  mid: string;
  main: string;
  shade: string;
  sepal: string;
  rib: string;
  ribAlpha: number;
  edge?: string;
  /** Throat length as a fraction of the tepal (where the throat color fades into the main color). */
  throatLen: number;
  /** Fine vein color (rgba). */
  vein: string;
  budBase: string;
  budMid: string;
  budTip: string;
  spent: [string, string];
  filament: string;
  anther: string;
  /* Look */
  roughness: number;
}

type UV = [number, number, number, number];
/* Flower atlas: top row four tepal cells (petal, petal, sepal, sepal), base at the bottom;
   bottom row: bud cell, spent cell, then four swatches. */
const TEPAL_UV = (i: number): UV => [i / 4 + 0.004, 0.5, (i + 1) / 4 - 0.004, 1];
const BUD_UV: UV = [0.004, 0.004, 0.246, 0.496];
const SPENT_UV: UV = [0.254, 0.004, 0.496, 0.496];
const SW = (i: number): UV => {
  const x = 0.5 + (i % 2) * 0.25, y = i < 2 ? 0.25 : 0;
  return [x + 0.06, y + 0.06, x + 0.19, y + 0.19];
};
const FILAMENT = 0, ANTHER = 1, GREEN = 2, THROAT = 3;

/** Width envelope of a tepal along its length (0 base .. 1 tip), as a fraction of its widest. */
function petalEnv(t: number) {
  return t < 0.58 ? lerp(0.22, 1, Math.sin((t / 0.58) * Math.PI * 0.5)) : Math.max(0.12, Math.pow(Math.max(0, Math.cos(clamp((t - 0.58) / 0.42) * Math.PI * 0.5)), 0.42));
}
function sepalEnv(t: number) {
  return t < 0.45 ? lerp(0.3, 1, Math.sin((t / 0.45) * Math.PI * 0.5)) : Math.max(0.06, Math.pow(Math.max(0, Math.cos(clamp((t - 0.45) / 0.55) * Math.PI * 0.5)), 0.8));
}

function paintTepal(g: CanvasRenderingContext2D, L: DaylilyLook, cell: number, petal: boolean, r: () => number) {
  const cw = 256, x0 = cell * cw, cx = x0 + cw / 2, base = 510, top = 4, H = base - top;
  const env = petal ? petalEnv : sepalEnv;
  const N = 60;
  const ph = r() * 6;
  const hw = (t: number, s: number) => {
    let w = env(t) * cw * 0.47;
    if (petal) w *= 1 - L.ruffle * 0.55 * (0.5 + 0.5 * Math.sin(t * 46 + ph + s * 1.7)) * smoothstep(0.3, 0.75, t);
    else w *= 1 - 0.03 * (0.5 + 0.5 * Math.sin(t * 30 + ph + s));
    return w;
  };
  const outline = () => {
    g.beginPath();
    g.moveTo(cx, base);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      g.lineTo(cx - hw(t, -1), base - t * H);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      g.lineTo(cx + hw(t, 1), base - t * H);
    }
    g.closePath();
  };
  outline();
  const grad = g.createLinearGradient(0, base, 0, top);
  const tl = L.throatLen;
  grad.addColorStop(0, L.throat);
  grad.addColorStop(tl * 0.55, L.throat);
  grad.addColorStop(tl, L.mid);
  grad.addColorStop(Math.min(0.95, tl + 0.13), petal ? L.main : L.sepal);
  grad.addColorStop(1, petal ? L.main : L.sepal);
  g.fillStyle = grad;
  g.fill();
  g.save();
  outline();
  g.clip();
  // Edge shading across the tepal (velvet on the reds, a soft fold on the yellows).
  const sg = g.createLinearGradient(x0, 0, x0 + cw, 0);
  sg.addColorStop(0, L.shade);
  sg.addColorStop(0.28, 'rgba(0,0,0,0)');
  sg.addColorStop(0.72, 'rgba(0,0,0,0)');
  sg.addColorStop(1, L.shade);
  g.fillStyle = sg;
  g.fillRect(x0, top, cw, H * (1 - tl * 0.6));
  // Fine veins fanning from the base.
  g.lineCap = 'round';
  for (let k = -9; k <= 9; k++) {
    if (k === 0) continue;
    g.strokeStyle = L.vein;
    g.globalAlpha = 0.5 + r() * 0.5;
    g.lineWidth = 1.2 + r() * 0.8;
    const ex = cx + (k / 9) * cw * 0.42 * (petal ? 1 : 0.7);
    g.beginPath();
    g.moveTo(cx + k * 0.8, base);
    g.quadraticCurveTo(cx + (k / 9) * cw * 0.36, base - H * 0.45, ex, top + H * 0.08 + Math.abs(k) * 6);
    g.stroke();
  }
  g.globalAlpha = 1;
  // Midrib band, paler, fading toward the tip.
  const mg = g.createLinearGradient(0, base, 0, top);
  mg.addColorStop(0, 'rgba(0,0,0,0)');
  mg.addColorStop(tl * 0.8, L.rib);
  mg.addColorStop(0.7, L.rib);
  mg.addColorStop(0.95, 'rgba(0,0,0,0)');
  g.globalAlpha = L.ribAlpha;
  g.fillStyle = mg;
  const rw = petal ? 11 : 8;
  g.beginPath();
  g.moveTo(cx - 3, base);
  g.quadraticCurveTo(cx - rw, base - H * 0.5, cx - 2, top + 20);
  g.lineTo(cx + 2, top + 20);
  g.quadraticCurveTo(cx + rw, base - H * 0.5, cx + 3, base);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // Soft streaks.
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    g.lineWidth = 2 + r() * 4;
    const x = cx + (r() - 0.5) * cw * 0.8;
    g.beginPath();
    g.moveTo(lerp(cx, x, 0.3), base - H * 0.2);
    g.lineTo(x, base - H * 0.95);
    g.stroke();
  }
  g.restore();
  if (L.edge) {
    g.strokeStyle = L.edge;
    g.lineWidth = 3;
    outline();
    g.stroke();
  }
}

function paintSpindle(g: CanvasRenderingContext2D, x0: number, colors: [number, string][], seams: string, r: () => number) {
  // Cell 256 x 512 in the bottom row (canvas y 512..1024), base at the bottom.
  const gr = g.createLinearGradient(0, 1024, 0, 512);
  for (const [t, c] of colors) gr.addColorStop(t, c);
  g.fillStyle = gr;
  g.fillRect(x0, 512, 256, 512);
  g.strokeStyle = seams;
  g.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const x = x0 + 40 + k * 85 + (r() - 0.5) * 10;
    g.beginPath();
    g.moveTo(x, 1024);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, 760, x + (r() - 0.5) * 20, 512);
    g.stroke();
  }
  for (let i = 0; i < 200; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    g.fillRect(x0 + r() * 256, 512 + r() * 512, 2 + r() * 3, 10 + r() * 30);
  }
}

export function daylilyFlowerMap(L: DaylilyLook): THREE.Texture {
  return leafTexture(`daylily-flowers-${L.key}`, 1024, 1024, (g) => {
    const r = rng(`daylily-tex-${L.key}`);
    paintTepal(g, L, 0, true, r);
    paintTepal(g, L, 1, true, r);
    paintTepal(g, L, 2, false, r);
    paintTepal(g, L, 3, false, r);
    paintSpindle(g, 0, [[0, L.budBase], [0.45, L.budMid], [1, L.budTip]], 'rgba(40,50,20,0.25)', r);
    paintSpindle(g, 256, [[0, L.budBase], [0.3, L.spent[0]], [1, L.spent[1]]], 'rgba(0,0,0,0.3)', r);
    const sw: string[] = [L.filament, L.anther, '#6f8e40', L.throat];
    sw.forEach((c, i) => {
      const x = 512 + (i % 2) * 256, y = i < 2 ? 512 : 768;
      g.fillStyle = c;
      g.fillRect(x, y, 256, 256);
    });
  });
}

export function daylilyLeafMap(key: string): THREE.Texture {
  return bladeMap(`daylily-${key}`, { fill: '#f1f3ea', rib: 0.14, veins: 0.06 });
}

/* ------------------------------------------------------------------ */
/* Flower parts                                                         */
/* ------------------------------------------------------------------ */

export interface TepalOpts {
  len: number;
  wid: number;
  e0: number;
  e1: number;
  rb: number;
  depth: number;
  cup: number;
  ruffle: number;
  twist: number;
  env: (t: number) => number;
  uv: UV;
  color: THREE.Color;
  rows: number;
  cols: number;
}

export function tepal(F: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, az: number, o: TepalOpts, birth: number, anchor: THREE.Vector3, sway: number, r: () => number) {
  const ROWS = o.rows, COLS = o.cols;
  const radial = a.clone().multiplyScalar(Math.cos(az)).addScaledVector(b, Math.sin(az));
  const side0 = V().crossVectors(n, radial).normalize();
  const p = c.clone().addScaledVector(radial, o.rb).addScaledVector(n, -o.depth);
  const ph = r() * 6;
  const ids: number[][] = [];
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    const em = lerp(o.e0, o.e1, Math.pow(Math.max(0, t - 0.5 / ROWS), 0.85));
    if (i > 0) p.addScaledVector(radial.clone().multiplyScalar(Math.cos(em)).addScaledVector(n, Math.sin(em)), o.len / ROWS);
    const e = lerp(o.e0, o.e1, Math.pow(t, 0.85));
    const d = radial.clone().multiplyScalar(Math.cos(e)).addScaledVector(n, Math.sin(e));
    const side = side0.clone().applyAxisAngle(d, o.twist * t);
    const up = V().crossVectors(d, side).normalize();
    const w = o.wid * o.env(t);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= COLS; j++) {
      const x = j / COLS - 0.5, edge = Math.abs(x) * 2;
      const q = p.clone().addScaledVector(side, x * w);
      // Cupped toward the throat, grooved along the midrib, ruffled at the edges toward the tip.
      q.addScaledVector(up, edge * edge * o.cup * w * (1 - t * 0.6));
      if (COLS % 2 === 0 && j === COLS / 2) q.addScaledVector(up, -0.05 * w * Math.sin(Math.PI * t));
      q.addScaledVector(up, Math.sin(t * 15 + ph + (x > 0 ? 2 : 0)) * o.ruffle * w * edge * edge * smoothstep(0.3, 0.8, t));
      row.push(q);
    }
    grid.push(row);
  }
  // Normals from the sheet, flipped to face out of the flower.
  for (let i = 0; i <= ROWS; i++) {
    const row: number[] = [];
    const t = i / ROWS;
    for (let j = 0; j <= COLS; j++) {
      const A = grid[Math.max(0, i - 1)][j], B = grid[Math.min(ROWS, i + 1)][j];
      const C = grid[i][Math.max(0, j - 1)], D = grid[i][Math.min(COLS, j + 1)];
      // The inner face (toward the flower's axis) is the front face; normals agree with the winding below.
      const nn = V().crossVectors(B.clone().sub(A), D.clone().sub(C)).normalize();
      const x = j / COLS - 0.5;
      const u = lerp(o.uv[0], o.uv[2], 0.5 + x * o.env(t));
      const shade = o.color.clone().multiplyScalar(lerp(0.82, 1, smoothstep(0, 0.35, t)));
      row.push(F.vert(grid[i][j], nn, u, lerp(o.uv[1], o.uv[3], t), shade, birth, anchor, sway));
    }
    ids.push(row);
  }
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) F.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
}

/** A spindle (bud, floral tube, spent flower) along a polyline; radius by fraction along it. u wraps around, v runs base to tip. */
export function spindle(F: GeoBuilder, pts: THREE.Vector3[], radius: (t: number) => number, sides: number, uv: UV, color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: (t: number) => number, twist = 0) {
  const n = pts.length;
  let nrm = V();
  const rings: number[][] = [];
  const t = V(), bin = V();
  for (let i = 0; i < n; i++) {
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (i === 0) nrm = perp(t);
    else {
      nrm.addScaledVector(t, -nrm.dot(t));
      if (nrm.lengthSq() < 1e-6) nrm = perp(t);
      nrm.normalize();
    }
    bin.crossVectors(t, nrm).normalize();
    const f = i / (n - 1);
    const rad = radius(f);
    const ring: number[] = [];
    for (let s = 0; s <= sides; s++) {
      const th = (s / sides) * Math.PI * 2 + twist * f;
      const dir = nrm.clone().multiplyScalar(Math.cos(th)).addScaledVector(bin, Math.sin(th));
      ring.push(F.vert(pts[i].clone().addScaledVector(dir, rad), dir, lerp(uv[0], uv[2], s / sides), lerp(uv[1], uv[3], f), color, birth, anchor, sway(f)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) F.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]);
}

/** A thin flat ribbon (filament, style) along a polyline, facing `face`. */
export function ribbon(F: GeoBuilder, pts: THREE.Vector3[], w: number, face: THREE.Vector3, uv: UV, color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number) {
  let prev: number[] | null = null;
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2;
  for (let i = 0; i < pts.length; i++) {
    const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const s = V().crossVectors(d, face).normalize();
    if (s.lengthSq() < 0.5) s.copy(perp(d));
    const nn = V().crossVectors(s, d).normalize();
    const a = F.vert(pts[i].clone().addScaledVector(s, -w / 2), nn, um - 0.01, vm, color, birth, anchor, sway);
    const b = F.vert(pts[i].clone().addScaledVector(s, w / 2), nn, um + 0.01, vm, color, birth, anchor, sway);
    if (prev) F.quad(prev[0], prev[1], b, a);
    prev = [a, b];
  }
}

/** One open daylily flower with its base at `c`, facing `n`. */
function flower(F: GeoBuilder, L: DaylilyLook, c: THREE.Vector3, n0: THREE.Vector3, birth: number, anchor: THREE.Vector3, sway: number, r: () => number, scale = 1) {
  const n = n0.clone().normalize();
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const D = L.dia * scale * (0.92 + r() * 0.16);
  const len = D * 0.56;
  const spin = r() * Math.PI * 2;
  const white = col('#ffffff');
  const depth = D * 0.1;
  // Floral tube: from the pedicel into the throat.
  const tubeBase = c.clone().addScaledVector(n, -depth - D * 0.16);
  spindle(F, [tubeBase, tubeBase.clone().addScaledVector(n, D * 0.08), c.clone().addScaledVector(n, -depth * 0.6)], (t) => lerp(D * 0.028, D * 0.05, t), 5, SW(THROAT), col('#c8d890'), birth, anchor, () => sway);
  // Outer sepals first (behind), then the broad inner petals.
  for (let k = 0; k < 3; k++) {
    const az = spin + Math.PI / 3 + (k * Math.PI * 2) / 3 + (r() - 0.5) * 0.15;
    tepal(F, c, n, a, b, az, {
      len: len * (0.95 + r() * 0.08), wid: len * L.sepalW, e0: L.flare[0] - 0.08, e1: L.flare[1] - 0.12 - r() * 0.15, rb: D * 0.02, depth: depth * 1.05,
      cup: 0.12, ruffle: L.ruffle * 0.3, twist: (r() - 0.5) * 0.5, env: sepalEnv, uv: TEPAL_UV(2 + (k % 2)), color: white.clone().multiplyScalar(0.92 + r() * 0.08), rows: 4, cols: 2,
    }, birth, anchor, sway, r);
  }
  for (let k = 0; k < 3; k++) {
    const az = spin + (k * Math.PI * 2) / 3 + (r() - 0.5) * 0.15;
    tepal(F, c, n, a, b, az, {
      len: len * (0.98 + r() * 0.06), wid: len * L.petalW, e0: L.flare[0], e1: L.flare[1] - r() * 0.15, rb: D * 0.025, depth,
      cup: 0.2, ruffle: L.ruffle, twist: (r() - 0.5) * 0.4, env: petalEnv, uv: TEPAL_UV(k % 2), color: white.clone().multiplyScalar(0.95 + r() * 0.05), rows: 5, cols: 3,
    }, birth, anchor, sway, r);
  }
  // Stamens and style: along the lower side of the flower, curving up at the ends.
  const low = UP.clone().multiplyScalar(-1).addScaledVector(n, n.y);
  if (low.lengthSq() < 1e-4) low.copy(a);
  low.normalize();
  const hi = low.clone().multiplyScalar(-1);
  const sideL = V().crossVectors(n, low).normalize();
  const fil = col('#ffffff'), anth = col('#ffffff');
  for (let k = 0; k < 7; k++) {
    const style = k === 6;
    const off = style ? 0 : (k - 2.5) / 2.5;
    const sl = len * (style ? 0.82 : 0.66 + r() * 0.08);
    const p0 = c.clone().addScaledVector(n, -depth * 0.8).addScaledVector(sideL, off * D * 0.012);
    const pts: THREE.Vector3[] = [p0];
    for (let i = 1; i <= 2; i++) {
      const t = i / 2;
      pts.push(p0.clone().addScaledVector(n, sl * t * 0.92).addScaledVector(low, sl * 0.16 * Math.sin(Math.PI * t * 0.8)).addScaledVector(hi, sl * 0.22 * t * t * t).addScaledVector(sideL, off * sl * 0.18 * t));
    }
    ribbon(F, pts, D * (style ? 0.012 : 0.009), low, SW(FILAMENT), fil, birth, anchor, sway);
    if (!style) {
      const tip = pts[2];
      const dir = sideL.clone().multiplyScalar(0.3).add(n).normalize();
      ribbon(F, [tip.clone().addScaledVector(dir, -D * 0.025), tip.clone().addScaledVector(dir, D * 0.025)], D * 0.018, hi, SW(ANTHER), anth, birth, anchor, sway);
    }
  }
}

/** A closed bud: club shaped, pointed, from `p` along `d`. */
function bud(F: GeoBuilder, p: THREE.Vector3, d: THREE.Vector3, len: number, rad: number, bendDir: THREE.Vector3, birth: number, anchor: THREE.Vector3, sway: number, r: () => number, uv: UV = BUD_UV, bendAmt = 0.08) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    pts.push(p.clone().addScaledVector(d, len * t).addScaledVector(bendDir, len * bendAmt * t * t));
  }
  const prof = (t: number) => rad * Math.max(0.04, Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.78 + 0.08)), 0.9) * (t > 0.85 ? (1 - t) / 0.15 * 0.7 + 0.1 : 1));
  spindle(F, pts, prof, 4, uv, col('#ffffff').multiplyScalar(0.9 + r() * 0.15), birth, anchor, () => sway, (r() - 0.5) * 1.5);
}

/* ------------------------------------------------------------------ */
/* The plant                                                            */
/* ------------------------------------------------------------------ */

export function buildDaylily(spec: PlantSpec, L: DaylilyLook): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), F = new GeoBuilder();
  const mids = L.leafMid.map((h) => col(h));
  const cBase = col(L.leafBase), cTip = col(L.leafTip);
  const crowns: { p: THREE.Vector3; fanAz: number; birth: number }[] = [];

  /* Fans of keeled, arching leaves. */
  for (let f = 0; f < L.fans; f++) {
    const u = (f + 0.5) / L.fans;
    const a0 = f * 2.39996 + (r() - 0.5) * 0.4, rr = L.crownR * Math.sqrt(u);
    // Fans that come later start below the ground, so their collapsed leaves (before they appear) stay hidden.
    const crown = V(Math.cos(a0) * rr, f < L.installFans ? -0.004 : -0.03, Math.sin(a0) * rr);
    const fanAz = a0 + Math.PI / 2 + (r() - 0.5) * 1.6;
    const lean = 0.1 + u * L.fanLean;
    const nl = Math.round(lerp(L.leavesPerFan[0], L.leavesPerFan[1], r()));
    const fanBirth = f < L.installFans ? 0 : clamp(0.12 + ((f - L.installFans) / Math.max(1, L.fans - L.installFans)) * 0.6 + (r() - 0.5) * 0.15, 0.1, 0.8);
    crowns.push({ p: crown, fanAz, birth: fanBirth });
    const ranks = Math.ceil(nl / 2);
    for (let j = 0; j < nl; j++) {
      // Leaves alternate left and right in the fan; the outer ones are older, splay wider and arch over further.
      const rank = Math.floor(j / 2), sgn = j % 2 ? 1 : -1;
      const k = rank / Math.max(1, ranks - 1);
      const inPlane = sgn * (0.12 + k * L.splay + r() * 0.12);
      const dx = Math.cos(fanAz) * Math.sin(inPlane) + Math.cos(a0) * Math.sin(lean);
      const dz = Math.sin(fanAz) * Math.sin(inPlane) + Math.sin(a0) * Math.sin(lean);
      const tilt = clamp(Math.hypot(dx, dz), 0.04, 1.35);
      const az = Math.atan2(dz, dx);
      const len = lerp(L.leafLen[0], L.leafLen[1], r()) * (1 - 0.18 * k) * (rank === 0 ? 0.72 : 1);
      const base = crown.clone().add(V(Math.cos(fanAz) * sgn * rank * 0.004, 0, Math.sin(fanAz) * sgn * rank * 0.004));
      const path = archPath(base, {
        az, tilt, bend: lerp(L.arch[0], L.arch[1], k) * (0.75 + r() * 0.5), bendPow: 1.1 + r() * 0.4, len, segs: 8,
        azCurl: (r() - 0.5) * 0.5, roll: (r() - 0.5) * 0.35, twist: (r() - 0.5) * 0.9, floor: 0.008 + r() * 0.01,
      });
      const mid = jitter(mids[Math.floor(r() * mids.length)], r, 0.01, 0.05, 0.04).multiplyScalar(lerp(1.02, 0.86, k));
      const old = k > 0.6 && r() < 0.3;
      blade(leaves, path, {
        wid: lerp(L.leafWid[0], L.leafWid[1], r()), cols: 3, fold: 0.2, baseW: 0.85, widest: 0.4, taper: 3,
        cBase: cBase.clone().lerp(mid, 0.6), cMid: mid, cTip: old ? mid.clone().lerp(cTip, 0.9) : mid.clone().lerp(cTip, 0.25),
        cEnd: old ? col('#9c8452') : undefined, ao: 0.5, uv: STRIP[r() < 0.5 ? 0 : 1],
        birth: clamp(fanBirth + (rank === ranks - 1 && f >= L.installFans ? 0.08 : 0)), sway: 0.7, nUp: 0.18,
      });
    }
  }

  /* Scapes: round, leafless, forking near the top into short arms of buds and flowers. */
  const swayAt = (y: number) => clamp(0.1 + (y / H) * 0.85, 0, 0.95);
  const sc0 = col(L.scapeCol), sc1 = col(L.scapeTop);
  const bark = stemBark();
  // Scapes come up from fans all over the clump (a shuffled order of the fans).
  const order = crowns.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let s = 0; s < L.scapes; s++) {
    const cr = crowns[order[s % order.length]];
    const birth = s < L.installScapes ? 0 : clamp(Math.max(cr.birth, 0.15 + ((s - L.installScapes) / Math.max(1, L.scapes - L.installScapes)) * 0.6 + (r() - 0.5) * 0.1), 0.1, 0.85);
    const outAz = Math.atan2(cr.p.z, cr.p.x) + (r() - 0.5) * 0.8;
    const lean = 0.06 + r() * 0.12 + (Math.hypot(cr.p.x, cr.p.z) / Math.max(0.01, L.crownR)) * L.scapeLean;
    const SL = lerp(L.scapeLen[0], L.scapeLen[1], r());
    const base = cr.p.clone().setY(-0.01);
    // A scape that appears later collapses (with its buds and flowers) to a point below the ground until then.
    const root = V(base.x, -0.05, base.z);
    const anc = (p: THREE.Vector3) => (birth > 0 ? root : p);
    const pts = arcPath(base, outAz, lean, lean * 0.55, SL, 7, r, 0.05);
    tube(wood, pts, L.scapeR, L.scapeR * 0.7, 6, sc0.clone().lerp(sc1, 0.3), birth, anc(base), (i) => swayAt(pts[i].y), 1);
    const top = pts[pts.length - 1];
    const dTop = top.clone().sub(pts[pts.length - 2]).normalize();
    const na = Math.round(lerp(L.arms[0], L.arms[1], r()));
    let az = r() * 6.28;
    for (let k = 0; k < na; k++) {
      az += 2.39996 + (r() - 0.5) * 0.5;
      // Arms zigzag out of the top: the first continues the scape, the rest fork off it.
      const from = k === 0 ? top : pts[pts.length - 1 - Math.min(2, k)].clone().lerp(top, 0.5 + r() * 0.3);
      const ad = k === 0 ? deflect(dTop, 0.25 + r() * 0.2, az) : deflect(dTop, 0.55 + r() * 0.35, az);
      const al = lerp(L.armLen[0], L.armLen[1], r()) * (k === 0 ? 0.8 : 1);
      const ap = [from, from.clone().addScaledVector(ad, al * 0.5).addScaledVector(UP, al * 0.08), from.clone().addScaledVector(ad, al).addScaledVector(UP, al * 0.2)];
      tube(wood, ap, L.scapeR * 0.72, L.scapeR * 0.5, 5, sc1, birth, anc(from), (i) => swayAt(ap[i].y), 1);
      // Small pale green bract at the fork.
      const bractDir = deflect(ad, 0.6, r() * 6);
      const bl = L.dia * 0.18;
      ribbon(F, [from, from.clone().addScaledVector(bractDir, bl * 0.5), from.clone().addScaledVector(bractDir, bl).addScaledVector(UP, -bl * 0.15)], L.scapeR * 2.2, perp(bractDir), SW(GREEN), col('#e8ecd0'), birth, anc(from), swayAt(from.y));
      const tip = ap[2];
      const tipDir = tip.clone().sub(ap[1]).normalize();
      const sw = swayAt(tip.y);
      const outH = V(ad.x, 0, ad.z).normalize();
      // Buds: a cluster of different sizes, the biggest about to open.
      const nb = Math.round(lerp(L.buds[0], L.buds[1], r()));
      for (let q = 0; q < nb; q++) {
        const sz = q === 0 ? 0.85 + r() * 0.15 : 0.3 + r() * 0.45;
        const bd = deflect(tipDir.clone().add(V(0, 0.6, 0)).normalize(), 0.25 + r() * 0.5, r() * 6.28);
        const bl = L.dia * 0.62 * sz;
        bud(F, tip.clone().addScaledVector(bd, L.dia * 0.02), bd, bl, bl * 0.17, outH, clamp(birth + 0.02), anc(tip), sw, r);
      }
      // The day's open flower, on a short pedicel, facing out and up.
      if (r() < L.openChance) {
        const fd = outH.clone().multiplyScalar(0.75).add(V(0, 0.75 + r() * 0.35, 0)).normalize();
        const pc = tip.clone().addScaledVector(fd, L.dia * 0.26);
        flower(F, L, pc, fd, clamp(birth + 0.02), anc(tip), sw, r);
      }
      // Yesterday's flower, shriveled and hanging.
      if (r() < L.spentChance) {
        const hd = outH.clone().multiplyScalar(0.8).add(V(0, -0.5, 0)).normalize();
        bud(F, tip.clone().addScaledVector(hd, L.dia * 0.03), hd, L.dia * 0.3, L.dia * 0.055, V(0, -1, 0), clamp(birth + 0.04), anc(tip), sw, r, SPENT_UV, 0.45);
      }
    }
  }

  fitClump([leaves, wood, F], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: F.build(),
    leafMap: daylilyLeafMap(L.key),
    flowerMap: daylilyFlowerMap(L),
    bark: { map: bark },
    look: { leafRoughness: L.roughness, translucency: 0.35, bend: 0.07, flutter: 0.004, alphaTest: 0.45 },
  };
}

