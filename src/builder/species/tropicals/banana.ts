import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { fitToSize, gridSurface, speckle, tubeVar } from '../trees/shared-trees-b';

/**
 * Hardy banana, Musa basjoo: a clump of green pseudostems with brown dried
 * sheath bases, each crowned with huge paddle leaves. The leaves are real
 * curved sheets: a pale midrib, parallel side veins, and the blade torn into
 * strips that hang at their own angles. Older leaves droop, newer ones stand
 * up, and one rolled new leaf rises from the center of each crown.
 */

/** Leaf atlas: three leaf blades (fresh, mature, old) in 256 px columns, base at the bottom. */
function bananaLeaves(): THREE.Texture {
  return leafTexture('banana-basjoo', 1024, 1024, (g) => {
    const r = rng('banana-tex');
    const CW = 256, CH = 1024;
    for (let cell = 0; cell < 3; cell++) {
      g.save();
      g.translate(cell * CW, 0);
      g.beginPath();
      g.rect(0, 0, CW, CH);
      g.clip();
      const gr = g.createLinearGradient(0, 0, CW, 0);
      const edge = ['#6fae3c', '#5f9e34', '#6f9c36'][cell], mid = ['#58982e', '#4a8a28', '#5a8a2c'][cell];
      gr.addColorStop(0, edge);
      gr.addColorStop(0.3, mid);
      gr.addColorStop(0.7, mid);
      gr.addColorStop(1, edge);
      g.fillStyle = gr;
      g.fillRect(0, 0, CW, CH);
      // Soft corrugation bands, then fine parallel veins sweeping toward the tip.
      for (let y = -40; y < CH + 60; y += 26 + r() * 30) {
        for (const s of [0, 1]) {
          g.strokeStyle = r() < 0.5 ? 'rgba(200,230,130,0.13)' : 'rgba(20,60,14,0.12)';
          g.lineWidth = 8 + r() * 12;
          g.beginPath();
          g.moveTo(CW / 2, y);
          g.quadraticCurveTo(s ? CW * 0.8 : CW * 0.2, y - 16, s ? CW : 0, y - 22);
          g.stroke();
        }
      }
      for (let y = -10; y < CH + 40; y += 5) {
        g.strokeStyle = (y / 5) % 2 ? 'rgba(206,232,140,0.26)' : 'rgba(24,66,16,0.2)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(CW / 2, y);
        g.quadraticCurveTo(CW * 0.2, y - 16, 0, y - 22);
        g.moveTo(CW / 2, y);
        g.quadraticCurveTo(CW * 0.8, y - 16, CW, y - 22);
        g.stroke();
      }
      // Yellowing and brown scorch on older blades.
      if (cell > 0) {
        for (let i = 0; i < (cell === 2 ? 46 : 16); i++) {
          const left = r() < 0.5, y = r() * CH, w = 10 + r() * (cell === 2 ? 46 : 22);
          const x = left ? 0 : CW;
          const rg = g.createRadialGradient(x, y, 1, x, y, w);
          rg.addColorStop(0, cell === 2 ? 'rgba(132,96,48,0.9)' : 'rgba(150,120,60,0.7)');
          rg.addColorStop(0.5, 'rgba(196,186,84,0.5)');
          rg.addColorStop(1, 'rgba(196,196,90,0)');
          g.fillStyle = rg;
          g.fillRect(x - w, y - w, w * 2, w * 2);
        }
      }
      // Thin dark margin.
      g.fillStyle = 'rgba(96,70,36,0.55)';
      g.fillRect(0, 0, 3, CH);
      g.fillRect(CW - 3, 0, 3, CH);
      // Pale midrib, wide at the base and narrowing to the tip.
      g.beginPath();
      g.moveTo(CW / 2 - 13, CH);
      g.lineTo(CW / 2 - 4, 0);
      g.lineTo(CW / 2 + 4, 0);
      g.lineTo(CW / 2 + 13, CH);
      g.closePath();
      const mg = g.createLinearGradient(CW / 2 - 13, 0, CW / 2 + 13, 0);
      mg.addColorStop(0, '#9dbd5c');
      mg.addColorStop(0.5, '#d4e29a');
      mg.addColorStop(1, '#9dbd5c');
      g.fillStyle = mg;
      g.fill();
      // Fine wind slits cut in from the margin along the veins, brown at the edges.
      const slits = [10, 22, 40][cell];
      for (let i = 0; i < slits; i++) {
        const left = r() < 0.5, y = 60 + r() * (CH - 110), len = 22 + r() * (cell === 0 ? 50 : 96);
        const x0 = left ? 0 : CW, x1 = left ? len : CW - len;
        const rise = (len / (CW / 2)) * 20;
        const wdt = 3 + r() * 4;
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(120,88,44,0.8)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(x0, y - 22 - wdt);
        g.lineTo(x1, y - 22 + rise);
        g.lineTo(x0, y - 22 + wdt);
        g.stroke();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.beginPath();
        g.moveTo(x0, y - 22 - wdt);
        g.lineTo(x1, y - 22 + rise);
        g.lineTo(x0, y - 22 + wdt);
        g.closePath();
        g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
    // Column 3: plain pale leaf (the rolled new leaf uses the wood mesh; this is spare fill).
    g.fillStyle = '#7fb044';
    g.fillRect(768, 0, 256, 1024);
  });
}

/** Light fibrous sheath texture; vertex color tints it green above and brown at the base. */
function bananaStem(): THREE.Texture {
  return barkTexture('banana-stem', 256, (g, S) => {
    const r = rng('banana-stem');
    g.fillStyle = '#d6d6c4';
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 500, ['rgba(120,100,70,0.16)', 'rgba(255,255,240,0.2)'], 4, 16);
    for (let i = 0; i < 420; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.6 ? `rgba(80,70,44,${0.08 + r() * 0.16})` : `rgba(255,255,244,${0.12 + r() * 0.2})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + 30 + r() * 90);
      g.stroke();
    }
    // Overlapping sheath edges.
    for (let i = 0; i < 5; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = 'rgba(70,52,30,0.5)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 14, y + 60, x + 30, y + 130, x + 36, y + 220);
      g.stroke();
    }
  });
}

interface LeafSpec {
  base: THREE.Vector3;
  az: number;
  /** Angle from vertical where the petiole leaves the crown, and how much further the leaf bends over. */
  tilt: number;
  droop: number;
  petiole: number;
  len: number;
  wid: number;
  /** V-fold of the blade about the midrib, radians. */
  fold: number;
  tears: number;
  cell: number;
  tint: THREE.Color;
  birth: number;
  anchor: THREE.Vector3;
  sway0: number;
  sway1: number;
}

const profile = (t: number) => Math.min(1, Math.sqrt(clamp(t / 0.16))) * Math.pow(clamp((1 - t) / 0.2), 0.62) * (0.9 + 0.1 * Math.sin(Math.PI * t));

function bananaLeaf(leaves: GeoBuilder, wood: GeoBuilder, r: () => number, o: LeafSpec) {
  const ROWS = 24, COLS = 4;
  const total = o.petiole + o.len;
  const yaw = (r() - 0.5) * 0.35;
  // Spine: petiole then midrib, bending over more toward the tip.
  const frame = (s: number) => {
    const f = s / total;
    const th = o.tilt + o.droop * Math.pow(f, 1.7);
    const az = o.az + yaw * f;
    return {
      d: V(Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)),
      up: V(-Math.cos(th) * Math.cos(az), Math.sin(th), -Math.cos(th) * Math.sin(az)),
      side: V(-Math.sin(az), 0, Math.cos(az)),
    };
  };
  const STEPS = 60;
  const spine: THREE.Vector3[] = [o.base.clone()];
  for (let i = 1; i <= STEPS; i++) spine.push(spine[i - 1].clone().addScaledVector(frame(((i - 0.5) / STEPS) * total).d, total / STEPS));
  const at = (s: number) => {
    const x = clamp(s / total) * STEPS, i = Math.min(STEPS - 1, Math.floor(x));
    return spine[i].clone().lerp(spine[i + 1], x - i);
  };
  const swayAt = (s: number) => lerp(o.sway0, o.sway1, Math.pow(s / total, 1.3));

  // Midrib and petiole (wood mesh): a pale rib under the blade.
  const ribN = 16;
  const ribPts: THREE.Vector3[] = [];
  const rb = 0.03 * (o.len / 1.6) + 0.006;
  const ribR = (i: number) => lerp(rb, 0.004, Math.pow(i / ribN, 0.8));
  for (let i = 0; i <= ribN; i++) {
    const s = (i / ribN) * total * 0.98;
    ribPts.push(at(s).addScaledVector(frame(s).up, -ribR(i) * 0.85));
  }
  const ribCol = col('#c2d88a').multiply(o.tint);
  tubeVar(wood, ribPts, ribR, 5, () => ribCol, o.birth, o.anchor, (i) => swayAt((i / ribN) * total), { uScale: 1 });

  // Blade: each side is torn into strips; every strip hangs at its own angle.
  const u0 = o.cell * 0.25 + 0.006, u1 = (o.cell + 1) * 0.25 - 0.006, uc = (u0 + u1) / 2;
  for (const sgn of [-1, 1]) {
    const cuts = [0];
    for (let k = 0; k < o.tears; k++) cuts.push(0.1 + r() * 0.86);
    cuts.push(1);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k++) {
      const ta = cuts[k], tb = cuts[k + 1];
      if (tb - ta < 0.012) continue;
      const rows = Math.max(1, Math.round((tb - ta) * ROWS));
      const fold = o.fold + (r() - 0.5) * 0.16 - (o.tears > 2 ? r() * 0.5 * clamp(1 - o.fold) : 0);
      const sag = 0.25 + r() * 0.5;
      const lag = (r() - 0.5) * 0.03;
      const shade = 0.92 + r() * 0.14;
      const c = o.tint.clone().multiplyScalar(shade);
      gridSurface(leaves, rows, COLS, (i, j) => {
        const x = j / COLS;
        let t = lerp(ta, tb, i / rows);
        // Torn corners pull back a little at the margin, opening the tear.
        if (x > 0.7 && k > 0 && i === 0) t += 0.006 * x;
        if (x > 0.7 && k < cuts.length - 2 && i === rows) t -= 0.006 * x;
        const s = o.petiole + t * o.len;
        const f = frame(s);
        const w = (o.wid / 2) * profile(t) * x;
        const a = fold - sag * x * 0.5;
        const p = at(s + lag * o.len * x)
          .addScaledVector(f.side, sgn * w * Math.cos(a))
          .addScaledVector(f.up, w * Math.sin(a) + Math.sin(t * 46 + sgn) * 0.006 * x);
        return { p, u: uc + sgn * x * (u1 - u0) * 0.5, v: lerp(0.004, 0.996, t), c, sway: clamp(swayAt(s) + x * 0.08) };
      }, o.birth, o.anchor);
    }
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();

  // Pseudostems: height, base offset, leaf scale, leaf count, birth.
  const stems = [
    { h: 2.2, x: 0.0, z: 0.0, k: 1, n: 10, birth: 0 },
    { h: 1.65, x: 0.34, z: 0.2, k: 0.84, n: 8, birth: 0 },
    { h: 1.15, x: -0.3, z: 0.28, k: 0.68, n: 7, birth: 0.15 },
    { h: 0.62, x: -0.08, z: -0.42, k: 0.46, n: 5, birth: 0.45 },
    { h: 0.34, x: 0.42, z: -0.2, k: 0.3, n: 3, birth: 0.7 },
  ];
  const brown = col('#7a5c3c'), tan = col('#b49a66'), yg = col('#a9bb62'), green = col('#84a84a');
  stems.forEach((st, si) => {
    const base = V(st.x, 0, st.z);
    const leanAz = Math.atan2(st.z, st.x) + (r() - 0.5) * 0.6;
    const lean = si === 0 ? 0.03 : 0.08 + r() * 0.06;
    const R = 0.14 * Math.pow(st.k, 0.8);
    const n = 9;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -0.1 + t * (st.h + 0.1);
      const off = Math.max(0, y) * Math.sin(lean) * (1 + 0.3 * t);
      pts.push(V(base.x + Math.cos(leanAz) * off, y, base.z + Math.sin(leanAz) * off));
    }
    const stemSway = (i: number) => 0.3 * Math.pow(i / n, 1.5) * (st.h / 2.25);
    tubeVar(
      wood, pts, (i) => R * lerp(1.25, 0.62, Math.pow(i / n, 0.8)) * (i === 0 ? 1.1 : 1), 12,
      (i) => {
        const t = i / n;
        const c = t < 0.22 ? brown.clone().lerp(tan, t / 0.22) : t < 0.5 ? tan.clone().lerp(yg, (t - 0.22) / 0.28) : yg.clone().lerp(green, (t - 0.5) / 0.5);
        return c.multiplyScalar(0.92 + r() * 0.12);
      },
      st.birth, base, stemSway, { uScale: 2, cap: true, lump: (th, i) => 1 + 0.05 * Math.sin(th * 3 + i * 0.8 + si) },
    );
    const top = pts[n];
    const topSway = stemSway(n);
    // Crown of leaves: oldest lowest and most bent over, newest nearly upright.
    const az0 = r() * Math.PI * 2;
    for (let j = 0; j < st.n; j++) {
      const age = 1 - j / (st.n - 1); // 1 oldest .. 0 newest
      const len = 1.5 * st.k * lerp(1, 0.82, Math.pow(age, 2)) * (0.92 + r() * 0.16);
      const lateBirth = j === st.n - 1 && st.n > 4 ? 0.5 : j > 0 && j % 3 === 1 ? 0.15 + r() * 0.4 : 0;
      const tint = age > 0.85 ? col('#f2efc8') : age < 0.2 ? col('#fbffe6') : col('#ffffff');
      bananaLeaf(leaves, wood, r, {
        base: top.clone().add(V(0, -0.02 - age * 0.1 * st.k, 0)),
        az: az0 + j * 2.4 + (r() - 0.5) * 0.3,
        tilt: lerp(0.22, 1.2, Math.pow(age, 0.85)) + (r() - 0.5) * 0.12,
        droop: lerp(0.55, 1.5, age) + (r() - 0.5) * 0.25,
        petiole: 0.34 * st.k * (0.85 + r() * 0.3),
        len, wid: len * (0.37 + r() * 0.05),
        fold: lerp(0.55, 0.12, Math.pow(age, 0.6)),
        tears: Math.round(lerp(1, 9, age) + r() * 2),
        cell: age > 0.8 ? 2 : age > 0.3 ? 1 : 0,
        tint: tint.multiplyScalar(0.94 + r() * 0.1),
        birth: clamp(Math.max(st.birth, lateBirth), 0, 0.85),
        anchor: top, sway0: topSway, sway1: clamp(topSway + 0.45 + 0.25 * (1 - age)),
      });
    }
    // The rolled new leaf (cigar) standing in the center.
    const cl = 1.0 * st.k, ca = az0 + 1.1;
    const cig: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      cig.push(top.clone().add(V(Math.cos(ca) * t * t * cl * 0.1, -0.05 + t * cl, Math.sin(ca) * t * t * cl * 0.1)));
    }
    const cr = [0.5, 0.62, 0.7, 0.62, 0.45, 0.25, 0.04];
    const cigC = col('#b9d877');
    tubeVar(wood, cig, (i) => R * 0.62 * cr[i], 7, () => cigC, clamp(st.birth + 0.05), top, (i) => clamp(topSway + (i / 6) * 0.3), { uScale: 1, twist: 0.5 });
  });

  fitToSize([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: bananaLeaves(),
    bark: { map: bananaStem() },
    look: { translucency: 0.6, leafRoughness: 0.6, bend: 0.14, flutter: 0.012, woodShadows: true },
  };
};
