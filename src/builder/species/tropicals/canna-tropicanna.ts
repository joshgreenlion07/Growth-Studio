import * as THREE from 'three';
import { GeoBuilder, V, UP, clamp, col, deflect, leafTexture, lerp, perp, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { fitToSize, gridSurface, tubeVar } from '../trees/shared-trees-b';
import { stemBark } from '../perennials/shared-perennials';
import { spindle } from '../perennials/shared-daylily';

/**
 * Canna 'Phasion' (Tropicanna; the client's legend spells it 'Tropicana') in
 * summer: a clump of upright burgundy stems, each clasped by big paddle
 * leaves that leave the stem at a steep angle and arch out, the blade in a
 * shallow V along the midrib. The leaves are dark purple-burgundy striped
 * along the lateral veins in pink, red, orange, yellow and green; the
 * youngest (top) leaves are the darkest and reddest, older lower ones turn
 * bronze-green with yellow-orange stripes. They glow when backlit. The
 * tallest stems end in a stalk with a loose cluster of tangerine-orange
 * flowers and pointed buds above the leaves.
 *
 * References and the numbers they give:
 * - US Plant Patent PP10,569 ('Phasion'): leaf blade about 40 cm long and
 *   20-22 cm wide, ovate to broad elliptic; new leaves RHS 187A-B (dark
 *   purple-red) between the veins, midrib and veins 34A (red); older leaves
 *   146A-B (green) between the veins, midrib 19A (yellow), veins 26B
 *   (orange); terminal raceme 30-45 cm; flowers about 13 cm, yellow-orange.
 * - Monrovia (Tropicanna canna): stalks quickly reach 5 ft, clumps 3-4 ft
 *   wide; burgundy new leaves maturing striped red, pink, yellow and green.
 * - NC State Extension Plant Toolbox (Canna x generalis): Tropicanna 4-6 ft;
 *   canna leaves 18-36 in long, alternate, sheathing.
 * - Moana Nursery plant finder ('Phasion'): 4 ft in leaf, 6 ft in flower,
 *   24 in spread; tangerine-orange flowers summer to fall.
 * Targets here (Modesto, full sun, 2 years from a 1 gal): leaves 12-22 in
 * long, about half as wide, the top leaves near 4.9 ft, flower clusters to
 * 5.6 ft, clump 3.3 ft across, 14 stems (8 in flower). A 1 gal at install: two or three
 * young shoots, about 18 in, no flowers. Dies to the ground in winter
 * (the studio shows it in summer).
 */

type UV = [number, number, number, number];

/** Width of the blade along its length (0 base .. 1 tip), as a fraction of the widest. */
function bladeEnv(t: number) {
  return t < 0.42 ? Math.pow(lerp(0.1, 1, Math.sin((t / 0.42) * Math.PI * 0.5)), 0.85) : Math.max(0.02, Math.pow(Math.max(0, Math.cos(clamp((t - 0.42) / 0.58) * Math.PI * 0.5)), 0.72));
}

/* Leaf atlas: four cells 256 x 1024, base at the bottom: newest (dark red), young, mature, old (bronze-green). */
const LEAF_UV = (i: number): UV => [i / 4 + 0.003, 0.002, (i + 1) / 4 - 0.003, 0.998];

function leafMap(): THREE.Texture {
  return leafTexture('canna-tropicanna-leaves', 1024, 1024, (g) => {
    const r = rng('canna-tex');
    // Real proportions: 42 cm long (1024 px) by 21 cm wide (the cell's 256 px), so draw in leaf units.
    const W = 21, L = 42;
    const looks = [
      { ground: ['#2c0a18', '#3a0e1e'], rib: '#b02836', stripes: ['#a01a30', '#b82840', '#8a1428', '#b03a5a'], cover: 0.3 },
      { ground: ['#300c18', '#40121e'], rib: '#c03a34', stripes: ['#c03028', '#d8603e', '#c84a5a', '#e08a38', '#a82c30'], cover: 0.32 },
      { ground: ['#2e1216', '#3c1a1a'], rib: '#d87a2c', stripes: ['#d85a2a', '#e8902e', '#c84a6a', '#e8b040', '#6a7a32', '#c83c30'], cover: 0.36 },
      { ground: ['#2e1c14', '#3a2618'], rib: '#d8a038', stripes: ['#d8802a', '#e0a83c', '#6e7e32', '#d0602a', '#a03a2a'], cover: 0.34 },
    ];
    for (let cell = 0; cell < 4; cell++) {
      const lk = looks[cell];
      const X = (x: number) => cell * 256 + 128 + (x / W) * 256 * 0.96;
      const Y = (y: number) => 1024 - (y / L) * 1024;
      const outline = () => {
        g.beginPath();
        g.moveTo(X(0), Y(0));
        for (let i = 0; i <= 60; i++) g.lineTo(X(-bladeEnv(i / 60) * W * 0.5), Y((i / 60) * L));
        for (let i = 60; i >= 0; i--) g.lineTo(X(bladeEnv(i / 60) * W * 0.5), Y((i / 60) * L));
        g.closePath();
      };
      g.save();
      outline();
      const gg = g.createLinearGradient(cell * 256, 0, cell * 256 + 256, 0);
      gg.addColorStop(0, lk.ground[1]);
      gg.addColorStop(0.5, lk.ground[0]);
      gg.addColorStop(1, lk.ground[1]);
      g.fillStyle = gg;
      g.fill();
      g.clip();
      // Lateral veins: from the midrib out to the margin, toward the tip in a gentle S, each a colored stripe.
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        let y = -1;
        while (y < L * 0.98) {
          y += 0.22 + r() * 0.22;
          const c = lk.stripes[Math.floor(r() * lk.stripes.length)];
          const wide = r() < lk.cover;
          g.strokeStyle = c;
          g.globalAlpha = wide ? 0.75 : 0.25 + r() * 0.2;
          g.lineWidth = wide ? 1.6 + r() * 2 : 1;
          const reach = W * 0.55;
          g.beginPath();
          g.moveTo(X(0), Y(y));
          g.bezierCurveTo(X(s * reach * 0.25), Y(y + reach * 0.55), X(s * reach * 0.6), Y(y + reach * 0.85), X(s * reach), Y(y + reach * 1.05));
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      // Soft lengthwise light and dark bands (the blade's corrugation).
      for (let i = 0; i < 40; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,220,200,0.05)';
        const y = r() * L;
        g.beginPath();
        g.ellipse(X((r() - 0.5) * W), Y(y), 8 + r() * 20, 30 + r() * 60, 0.3 * (r() - 0.5), 0, Math.PI * 2);
        g.fill();
      }
      // Midrib: wide at the base, pale, narrowing to the tip.
      g.fillStyle = lk.rib;
      g.beginPath();
      g.moveTo(X(-0.55), Y(0));
      g.lineTo(X(-0.08), Y(L * 0.97));
      g.lineTo(X(0.08), Y(L * 0.97));
      g.lineTo(X(0.55), Y(0));
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(X(-0.1), Y(L * 0.9), X(0.1) - X(-0.1), Y(0) - Y(L * 0.9));
      g.restore();
      // Thin dark red margin.
      g.strokeStyle = cell === 3 ? 'rgba(110,60,30,0.8)' : 'rgba(120,20,30,0.85)';
      g.lineWidth = 2.5;
      outline();
      g.stroke();
    }
  });
}

/* Flower atlas: staminode (two variants), labellum, narrow petal; bottom row: bud, bract, swatches. */
const FL_UV = (i: number): UV => [i / 4 + 0.004, 0.5, (i + 1) / 4 - 0.004, 1];
const BUD_UV: UV = [0.004, 0.004, 0.246, 0.496];

function staminodeEnv(t: number) {
  return t < 0.6 ? lerp(0.22, 1, Math.sin((t / 0.6) * Math.PI * 0.5)) : Math.max(0.2, Math.pow(Math.max(0, Math.cos(clamp((t - 0.6) / 0.4) * Math.PI * 0.5)), 0.4));
}
function petalEnv(t: number) {
  return t < 0.3 ? lerp(0.5, 1, t / 0.3) : Math.max(0.05, 1 - Math.pow((t - 0.3) / 0.7, 1.6));
}

function flowerMap(): THREE.Texture {
  return leafTexture('canna-tropicanna-flowers', 1024, 1024, (g) => {
    const r = rng('canna-flower-tex');
    const shape = (x0: number, env: (t: number) => number, wob: number) => {
      const cx = x0 + 128, base = 510, H = 506;
      const ph = r() * 6;
      g.beginPath();
      g.moveTo(cx, base);
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        g.lineTo(cx - env(t) * 120 * (1 - wob * (0.5 + 0.5 * Math.sin(t * 30 + ph)) * smoothstep(0.3, 0.8, t)), base - t * H);
      }
      for (let i = 60; i >= 0; i--) {
        const t = i / 60;
        g.lineTo(cx + env(t) * 120 * (1 - wob * (0.5 + 0.5 * Math.sin(t * 27 + ph + 2)) * smoothstep(0.3, 0.8, t)), base - t * H);
      }
      g.closePath();
    };
    const cells: [number, (t: number) => number, string[], number][] = [
      [0, staminodeEnv, ['#dc4a12', '#ee6216', '#f47c22'], 0.08],
      [1, staminodeEnv, ['#d84410', '#ea5a14', '#f2741e'], 0.08],
      [2, staminodeEnv, ['#ea7418', '#ee6a16', '#f08a24'], 0.1],
      [3, petalEnv, ['#b8402a', '#d0602a', '#e07a30'], 0],
    ];
    for (const [cell, env, cs, wob] of cells) {
      const x0 = cell * 256, cx = x0 + 128;
      shape(x0, env, wob);
      const gr = g.createLinearGradient(0, 510, 0, 0);
      gr.addColorStop(0, cs[0]);
      gr.addColorStop(0.4, cs[1]);
      gr.addColorStop(1, cs[2]);
      g.fillStyle = gr;
      g.fill();
      g.save();
      shape(x0, env, wob);
      g.clip();
      // Fine darker veins and a paler, yellower edge.
      for (let k = -10; k <= 10; k++) {
        g.strokeStyle = `rgba(200,60,10,${0.15 + r() * 0.12})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(cx + k, 510);
        g.quadraticCurveTo(cx + k * 9, 260, cx + k * 11, 20);
        g.stroke();
      }
      const eg = g.createLinearGradient(x0, 0, x0 + 256, 0);
      eg.addColorStop(0, 'rgba(250,190,60,0.45)');
      eg.addColorStop(0.25, 'rgba(250,190,60,0)');
      eg.addColorStop(0.75, 'rgba(250,190,60,0)');
      eg.addColorStop(1, 'rgba(250,190,60,0.45)');
      g.fillStyle = eg;
      g.fillRect(x0, 0, 256, 512);
      if (cell === 2) {
        // Labellum: a yellow throat flecked with orange-red.
        const rg = g.createRadialGradient(cx, 470, 4, cx, 470, 160);
        rg.addColorStop(0, 'rgba(250,200,60,0.9)');
        rg.addColorStop(1, 'rgba(250,200,60,0)');
        g.fillStyle = rg;
        g.fillRect(x0, 300, 256, 212);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = 'rgba(210,70,20,0.6)';
          g.beginPath();
          g.arc(cx + (r() - 0.5) * 90, 500 - r() * 170, 2 + r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
    // Bud: maroon at the base, orange-red toward the tip.
    const bg = g.createLinearGradient(0, 1024, 0, 512);
    bg.addColorStop(0, '#5a1a24');
    bg.addColorStop(0.45, '#8a2a28');
    bg.addColorStop(1, '#d8582a');
    g.fillStyle = bg;
    g.fillRect(0, 512, 256, 512);
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(40,10,10,0.3)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(20 + i * 42, 1024);
      g.lineTo(28 + i * 42, 512);
      g.stroke();
    }
  });
}

/* ------------------------------------------------------------------ */

interface LeafOpts {
  base: THREE.Vector3;
  az: number;
  /** Elevation of the blade above horizontal where it leaves the stem, and how much it loses by the tip. */
  e0: number;
  droop: number;
  len: number;
  wid: number;
  fold: number;
  cell: number;
  tint: THREE.Color;
  birth: number;
  anchor: THREE.Vector3;
  sway0: number;
  sway1: number;
}

function cannaLeaf(G: GeoBuilder, r: () => number, o: LeafOpts) {
  const ROWS = 8, COLS = 4;
  const yaw = (r() - 0.5) * 0.4, ph = r() * 6, roll = (r() - 0.5) * 0.35;
  const spine: { p: THREE.Vector3; nrm: THREE.Vector3; sd: THREE.Vector3 }[] = [];
  const p = o.base.clone();
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    const e = o.e0 - o.droop * Math.pow(t, 1.5);
    const a = o.az + yaw * t;
    const ot = V(Math.cos(a), 0, Math.sin(a));
    const d = ot.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0));
    if (i > 0) {
      const em = o.e0 - o.droop * Math.pow(t - 0.5 / ROWS, 1.5);
      p.addScaledVector(ot.clone().multiplyScalar(Math.cos(em)).add(V(0, Math.sin(em), 0)), o.len / ROWS);
    }
    const sd0 = V(-Math.sin(a), 0, Math.cos(a));
    const sd = sd0.clone().applyAxisAngle(d, roll * t);
    const nrm = V().crossVectors(sd, d).normalize();
    spine.push({ p: p.clone(), nrm, sd });
  }
  const [u0, , u1] = LEAF_UV(o.cell);
  const um = (u0 + u1) / 2;
  gridSurface(G, ROWS, COLS, (i, j) => {
    const t = i / ROWS, x = j / COLS - 0.5, edge = Math.abs(x) * 2;
    const env = bladeEnv(t);
    const w = o.wid * env;
    const s = spine[i];
    const q = s.p.clone().addScaledVector(s.sd, x * w);
    // A shallow V along the midrib; the outer edges roll back down a little and wave.
    q.addScaledVector(s.nrm, edge * w * 0.5 * o.fold - edge * edge * edge * w * 0.08 + Math.sin(t * 13 + ph + (x > 0 ? 1.7 : 0)) * w * 0.035 * edge * smoothstep(0.15, 0.5, t));
    const shade = lerp(0.88, 1, smoothstep(0, 0.3, t));
    return {
      p: q,
      // The painted blade is 0.96 of the cell wide at its widest: u spans +-0.12 there.
      u: um + x * env * 0.24,
      v: lerp(0.002, 0.998, t),
      c: o.tint.clone().multiplyScalar(shade),
      sway: lerp(o.sway0, o.sway1, Math.pow(t, 1.3)) + edge * 0.05,
    };
  }, o.birth, o.anchor);
}

function staminode(F: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, az: number, len: number, wid: number, e0: number, e1: number, uv: UV, birth: number, anchor: THREE.Vector3, sway: number, r: () => number, rows = 3, cols = 3, env = staminodeEnv, ruffle = 0.12) {
  const radial = a.clone().multiplyScalar(Math.cos(az)).addScaledVector(b, Math.sin(az));
  const side0 = V().crossVectors(n, radial).normalize();
  const ph = r() * 6, twist = (r() - 0.5) * 0.7;
  const grid: THREE.Vector3[][] = [];
  const p = c.clone().addScaledVector(radial, len * 0.04);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const e = lerp(e0, e1, Math.pow(t, 0.9));
    const d = radial.clone().multiplyScalar(Math.cos(e)).addScaledVector(n, Math.sin(e));
    if (i > 0) p.addScaledVector(d, len / rows);
    const side = side0.clone().applyAxisAngle(d, twist * t);
    const up = V().crossVectors(d, side).normalize();
    const w = wid * env(t);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= cols; j++) {
      const x = j / cols - 0.5, edge = Math.abs(x) * 2;
      row.push(p.clone().addScaledVector(side, x * w).addScaledVector(up, edge * edge * w * 0.18 + Math.sin(t * 9 + ph + x * 5) * ruffle * w * edge * smoothstep(0.2, 0.8, t)));
    }
    grid.push(row);
  }
  gridSurface(F, rows, cols, (i, j) => {
    const t = i / rows, x = j / cols - 0.5;
    return { p: grid[i][j], u: lerp(uv[0], uv[2], 0.5 + x * env(t)), v: lerp(uv[1], uv[3], t), c: col('#ffffff').multiplyScalar(lerp(0.85, 1, t)), sway };
  }, birth, anchor);
}

/** One canna flower at `c`, facing `n`: three broad staminodes, a recurved labellum, three narrow reflexed petals. */
function cannaFlower(F: GeoBuilder, c: THREE.Vector3, n0: THREE.Vector3, size: number, birth: number, anchor: THREE.Vector3, sway: number, r: () => number) {
  const n = n0.clone().normalize();
  // Orient so `a` points up the flower (toward the sky) and the labellum hangs at the bottom.
  const upIn = UP.clone().addScaledVector(n, -n.y);
  const a = upIn.lengthSq() > 1e-4 ? upIn.normalize() : perp(n);
  const b = V().crossVectors(n, a).normalize();
  const L = 0.062 * size;
  for (let k = 0; k < 3; k++) {
    const az = (k - 1) * 0.95 + (r() - 0.5) * 0.35;
    staminode(F, c, n, a, b, az, L * (0.9 + r() * 0.2), L * 0.78, 0.9 + r() * 0.3, 0.15 + (r() - 0.5) * 0.4, FL_UV(k % 2), birth, anchor, sway, r);
  }
  staminode(F, c, n, a, b, Math.PI + (r() - 0.5) * 0.4, L * 0.95, L * 0.5, 0.5, -0.7, FL_UV(2), birth, anchor, sway, r);
  for (let k = 0; k < 3; k++) {
    const az = Math.PI / 3 + (k * Math.PI * 2) / 3 + (r() - 0.5) * 0.3;
    staminode(F, c.clone().addScaledVector(n, -L * 0.08), n, a, b, az, L * 0.65, L * 0.16, 0.2, -0.5, FL_UV(3), birth, anchor, sway, r, 2, 1, petalEnv, 0);
  }
}

function spindleBud(F: GeoBuilder, p: THREE.Vector3, d: THREE.Vector3, len: number, rad: number, birth: number, anchor: THREE.Vector3, sway: number) {
  const pts = [0, 0.33, 0.66, 1].map((t) => p.clone().addScaledVector(d, len * t));
  spindle(F, pts, (t) => rad * (t < 0.33 ? lerp(0.6, 1, t / 0.33) : lerp(1, 0.05, (t - 0.33) / 0.67)), 4, BUD_UV, col('#ffffff'), birth, anchor, () => sway);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), F = new GeoBuilder();

  // Stems: height to the top leaf, base offset, leaf count, flowering, birth. The first two are the 1 gal's shoots.
  const stems: { h: number; x: number; z: number; n: number; fl: boolean; birth: number }[] = [];
  const NS = 14;
  for (let i = 0; i < NS; i++) {
    const a = i * 2.39996 + 0.4, rr = 0.3 * Math.sqrt((i + 0.6) / NS);
    const fl = i >= 2 && i < 10;
    const h = fl ? lerp(1.15, 1.35, r()) : lerp(0.65, 1.1, r());
    stems.push({ h, x: Math.cos(a) * rr, z: Math.sin(a) * rr, n: fl ? 7 : 5 + Math.floor(r() * 2), fl, birth: i < 2 ? 0 : clamp(0.12 + (i / NS) * 0.6 + (r() - 0.5) * 0.1, 0.1, 0.8) });
  }
  // The 1 gal's shoots are tall leafy stems (the plant is scaled down from its mature size).
  stems[0].h = 1.32;
  stems[1].h = 1.25;
  const stemDark = col('#341220'), stemMid = col('#461826'), stemTop = col('#55222e');
  for (const st of stems) {
    const base = V(st.x, 0, st.z);
    // Shoots that come up later collapse to a point below the ground until then (leaves and flowers too).
    const root = V(st.x, -0.06, st.z);
    const anc = (p: THREE.Vector3) => (st.birth > 0 ? root : p);
    const leanAz = Math.atan2(st.z, st.x) + (r() - 0.5) * 0.8;
    const lean = 0.04 + r() * 0.06 + Math.hypot(st.x, st.z) * 0.8;
    const top = st.fl ? st.h + lerp(0.25, 0.38, r()) : st.h;
    const n = 10;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -0.05 + t * (top + 0.05);
      const off = Math.max(0, y) * Math.sin(lean);
      pts.push(V(base.x + Math.cos(leanAz) * off, y, base.z + Math.sin(leanAz) * off));
    }
    const R = 0.014 * (0.75 + 0.25 * st.h);
    const swayAt = (y: number) => 0.25 * Math.pow(Math.max(0, y) / 1.6, 1.4);
    const stemAt = (y: number) => {
      const t = clamp((y + 0.05) / (top + 0.05));
      const x = t * n, i = Math.min(n - 1, Math.floor(x));
      return pts[i].clone().lerp(pts[i + 1], x - i);
    };
    tubeVar(
      wood, pts, (i) => R * lerp(1.15, st.fl ? 0.38 : 0.55, Math.pow(i / n, 0.9)), 6,
      (i) => { const t = i / n; return (t < 0.4 ? stemDark.clone().lerp(stemMid, t / 0.4) : stemMid.clone().lerp(stemTop, (t - 0.4) / 0.6)).multiplyScalar(0.95 + r() * 0.1); },
      st.birth, anc(base), (i) => swayAt(pts[i].y), { uScale: 1, cap: true },
    );
    // Leaves up the stem, spiraling: low ones big and arching out, the top ones smaller, darker red and upright.
    let az = r() * Math.PI * 2;
    for (let j = 0; j < st.n; j++) {
      const f = st.n === 1 ? 1 : j / (st.n - 1); // 0 lowest .. 1 top
      const y = lerp(0.1, st.h * 0.92, Math.pow(f, 0.85));
      az += 2.5 + (r() - 0.5) * 0.4;
      const len = lerp(0.55, 0.32, Math.pow(f, 1.3)) * (0.9 + r() * 0.2) * (0.8 + 0.2 * st.h);
      const at = stemAt(y);
      const cell = f > 0.85 ? 0 : f > 0.55 ? 1 : f > 0.12 ? 2 : 3;
      const tint = col('#ffffff').multiplyScalar(0.92 + r() * 0.12);
      cannaLeaf(leaves, r, {
        base: at.clone().add(V(Math.cos(az) * R * 0.8, 0, Math.sin(az) * R * 0.8)),
        az,
        e0: lerp(0.5, 1.15, Math.pow(f, 1.5)) + (r() - 0.5) * 0.2,
        droop: lerp(1.0, 0.45, f) + (r() - 0.5) * 0.25,
        len, wid: len * (0.53 + r() * 0.05), fold: 0.18 + r() * 0.14, cell, tint,
        birth: clamp(st.birth + (j === st.n - 1 && st.birth === 0 ? 0 : 0)),
        anchor: anc(at), sway0: swayAt(y), sway1: clamp(swayAt(y) + 0.35 + 0.2 * f),
      });
    }
    // Rolled new leaf standing up out of the top of leafy stems.
    if (!st.fl) {
      const tp = pts[n];
      const cig = [tp.clone().add(V(0, -0.06, 0)), tp.clone().add(V(0.004, 0.06, 0.002)), tp.clone().add(V(0.01, 0.18, 0.004))];
      tubeVar(wood, cig, (i) => R * [0.5, 0.42, 0.06][i], 6, () => col('#8a3040'), st.birth, anc(tp), (i) => swayAt(cig[i].y), { uScale: 1 });
    }
    if (st.fl) {
      // Flower cluster at the top of the stalk: open flowers in pairs below, pointed buds above.
      const tp = pts[n];
      // Flowers come later than the shoot; the 1 gal's shoots are not yet in bloom (birth past the install reveal).
      const fb = st.birth === 0 ? 0.3 : clamp(st.birth + 0.15);
      const nf = 4 + Math.floor(r() * 3);
      let faz = r() * 6.28;
      for (let k = 0; k < nf; k++) {
        const y = top - 0.04 - k * 0.045 - r() * 0.02;
        const at = stemAt(y);
        faz += 2.1 + (r() - 0.5) * 0.6;
        const outd = V(Math.cos(faz), 0, Math.sin(faz));
        const fc = at.clone().addScaledVector(outd, 0.035).addScaledVector(UP, 0.015);
        const fd = outd.clone().multiplyScalar(0.8).add(V(0, 0.55 + r() * 0.3, 0)).normalize();
        cannaFlower(F, fc, fd, 0.92 + r() * 0.16, fb, anc(at), swayAt(y) + 0.05, r);
        // Purple bract under each flower.
        spindleBud(F, at, outd.clone().add(V(0, 0.8, 0)).normalize(), 0.035, 0.006, fb, anc(at), swayAt(y));
      }
      for (let k = 0; k < 3; k++) {
        const bd = deflect(V(0, 1, 0), 0.2 + r() * 0.3, r() * 6.28);
        spindleBud(F, tp.clone().add(V(0, -0.02 * k, 0)), bd, 0.05 + r() * 0.03, 0.007, fb, anc(tp), swayAt(tp.y) + 0.05);
      }
    }
  }

  fitToSize([wood, leaves, F], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: F.build(),
    leafMap: leafMap(),
    flowerMap: flowerMap(),
    bark: { map: stemBark() },
    look: { translucency: 0.55, leafRoughness: 0.62, bend: 0.1, flutter: 0.008, woodShadows: true, alphaTest: 0.4 },
  };
};
