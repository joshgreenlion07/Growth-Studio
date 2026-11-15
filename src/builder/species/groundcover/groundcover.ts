import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, jitter, leafPath, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { TAU, flatCard, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';

/**
 * "Low groundcover", modeled on creeping myoporum (Myoporum parvifolium):
 * a dense, flat evergreen mat 3 to 6 in tall and about 5 ft wide. Trailing,
 * rooting stems radiate from the crown and branch alternately; they carry
 * crowded, narrow, slightly fleshy bright green leaves about 3/4 in long,
 * and the mat is dotted with 3/8 in white star-shaped flowers in summer.
 */

const LW = 1024, LH = 1024, CW = 256, CH = 512;
/** Leaf atlas: 4 x 2 cells, each a trailing sprig seen from above. 0..4 sprigs, 5 branched, 6 young tip, 7 dense under-mat. */
const cellUV = (i: number): UV => rect((i % 4) * CW, Math.floor(i / 4) * CH, CW, CH, LW, LH);

const GREENS = ['#2b5e1a', '#336a1e', '#3b7622', '#448226', '#4c8d2b'];
const YOUNG = ['#62a630', '#72b43a', '#80bd44'];

function leaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, fill: string, dark: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  // Oblanceolate: widest past the middle, blunt-pointed tip, narrowed to the base.
  leafPath(g, len, wid, 0.62, 0.7);
  g.fillStyle = fill;
  g.fill();
  if (dark > 0) {
    g.fillStyle = `rgba(8,30,6,${dark})`;
    g.fill();
  }
  // Fleshy leaf: a soft sheen along one flank, a darker rim, a faint pale midrib.
  g.save();
  g.clip();
  const sh = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  sh.addColorStop(0, 'rgba(215,245,150,0.22)');
  sh.addColorStop(0.45, 'rgba(215,245,150,0)');
  sh.addColorStop(1, 'rgba(0,25,0,0.3)');
  g.fillStyle = sh;
  g.fillRect(0, -wid, len, wid * 2);
  g.restore();
  g.strokeStyle = 'rgba(20,48,12,0.5)';
  g.lineWidth = Math.max(1, wid * 0.1);
  g.stroke();
  g.strokeStyle = 'rgba(185,225,120,0.32)';
  g.lineWidth = Math.max(1, wid * 0.09);
  g.beginPath();
  g.moveTo(len * 0.05, 0);
  g.lineTo(len * 0.86, 0);
  g.stroke();
  g.restore();
}

/** A trailing stem growing up the cell with crowded alternate leaves. */
function sprig(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, length: number, leafLen: number, young: number, depth = 0) {
  const n = Math.max(5, Math.round(length / (leafLen * 0.13)));
  const bend = (r() - 0.5) * 0.5;
  const pts: { x: number; y: number; a: number }[] = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= n; i++) {
    pts.push({ x, y, a });
    a += bend / n + (r() - 0.5) * 0.08;
    x += Math.cos(a) * (length / n);
    y += Math.sin(a) * (length / n);
  }
  // Stem: red-brown where older, green toward the tip.
  for (let i = 0; i < n; i++) {
    const t = i / n;
    g.strokeStyle = t < 0.55 - young * 0.4 ? '#6e4a32' : t < 0.8 ? '#7a7a3c' : '#86a84a';
    g.lineWidth = lerp(leafLen * 0.075, leafLen * 0.04, t);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pts[i].x, pts[i].y);
    g.lineTo(pts[i + 1].x, pts[i + 1].y);
    g.stroke();
  }
  let side = r() < 0.5 ? 1 : -1;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = pts[i];
    side = -side;
    const tipward = smooth(0.8, 1, t);
    // Leaves stand out from the stem at 40 to 75 degrees and close up toward the tip.
    // The leaves spiral around the stem, so from above some lie over it and look short.
    const over = r() < 0.3;
    const off = over ? r() * 0.35 : lerp(0.5 + r() * 0.75, 0.2 + r() * 0.3, tipward);
    const ll = leafLen * (0.75 + r() * 0.45) * (over ? 0.55 + r() * 0.3 : 1) * lerp(1, 0.6, tipward) * lerp(0.75, 1, smooth(0, 0.15, t));
    const yng = clamp(young + tipward * 0.8 + (r() - 0.6) * 0.3);
    const fill = yng > 0.6 ? YOUNG[Math.floor(r() * YOUNG.length)] : GREENS[Math.floor(r() * GREENS.length)];
    leaf(g, p.x, p.y, p.a + side * off, ll, ll * (0.24 + r() * 0.07), fill, r() < 0.3 ? 0.12 + r() * 0.18 : 0);
    if (depth === 0 && r() < 0.045 && t > 0.15 && t < 0.7) sprig(g, r, p.x, p.y, p.a - side * (0.6 + r() * 0.3), length * (0.25 + r() * 0.15), leafLen * 0.9, young + 0.2, 1);
  }
}
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-myoporum-leaves', LW, LH, (g) => {
    const r = rng('gc-myoporum-leaves');
    for (let c = 0; c < 8; c++) {
      inCell(g, (c % 4) * CW, Math.floor(c / 4) * CH, CW, CH, (w, h) => {
        if (c === 7) {
          // Under-mat: older shaded leaves and stems packed edge to edge.
          for (let k = 0; k < 34; k++) {
            // Keep clear of the cell border so the card never shows a straight edge.
            const a = r() * TAU, d = Math.sqrt(r());
            const x = w * (0.5 + Math.cos(a) * d * 0.2), y = h * (0.5 + Math.sin(a) * d * 0.3);
            sprig(g, r, x, y, a + (r() - 0.5) * 1.6, h * (0.1 + r() * 0.07), w * 0.26, -0.5, 1);
          }
          return;
        }
        if (c === 5) {
          // A forked shoot.
          sprig(g, r, w * 0.5, h * 0.99, -Math.PI / 2 - 0.2, h * 0.86, w * 0.3, 0, 1);
          sprig(g, r, w * 0.5, h * 0.62, -Math.PI / 2 + 0.42, h * 0.5, w * 0.29, 0.15, 1);
          return;
        }
        const tip = c === 6;
        sprig(g, r, w * 0.5, h * 0.99, -Math.PI / 2 + (r() - 0.5) * 0.12, h * (tip ? 0.7 : 0.9), w * (tip ? 0.3 : 0.32), tip ? 0.45 : 0);
      });
    }
  });
}

/** Flower atlas, 2 x 2: two open stars, a star with a bud, a pair. */
function flowerAtlas(): THREE.Texture {
  return leafTexture('gc-myoporum-flowers', 256, 256, (g) => {
    const r = rng('gc-myoporum-flowers');
    const star = (x: number, y: number, s: number, rot: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      for (let k = 0; k < 5; k++) {
        g.save();
        g.rotate((k / 5) * TAU + (r() - 0.5) * 0.12);
        leafPath(g, s, s * 0.5, 0.5, 0.75);
        const gr = g.createLinearGradient(0, 0, s, 0);
        gr.addColorStop(0, '#e9ecd2');
        gr.addColorStop(0.3, '#fbfbf3');
        gr.addColorStop(1, '#ffffff');
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = 'rgba(150,160,150,0.5)';
        g.lineWidth = 1;
        g.stroke();
        // The tiny purple spots near the throat.
        g.fillStyle = 'rgba(140,90,160,0.75)';
        for (let d = 0; d < 3; d++) {
          g.beginPath();
          g.arc(s * (0.3 + d * 0.13), (r() - 0.5) * s * 0.14, s * 0.028, 0, TAU);
          g.fill();
        }
        g.restore();
      }
      g.fillStyle = '#c9d27c';
      g.beginPath();
      g.arc(0, 0, s * 0.15, 0, TAU);
      g.fill();
      g.fillStyle = '#7d6a3a';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.5;
        g.beginPath();
        g.arc(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, s * 0.045, 0, TAU);
        g.fill();
      }
      g.restore();
    };
    const bud = (x: number, y: number, s: number) => {
      g.fillStyle = '#eef0dc';
      g.beginPath();
      g.ellipse(x, y, s * 0.5, s * 0.36, r() * 3, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(160,190,110,0.8)';
      g.beginPath();
      g.arc(x, y, s * 0.2, 0, TAU);
      g.fill();
    };
    star(64, 64, 56, 0.3);
    star(192, 64, 54, 1.1);
    star(56, 184, 46, 0.7);
    bud(100, 222, 34);
    star(168, 164, 36, 0.2);
    star(214, 216, 36, 1.4);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const center = V(0, -Sp, 0), radii = V(1, 1, 1);

  // The mat is a shallow cushion: thickest near the crown, running out to bare stems on the soil.
  const cushion = (rho: number) => H * 0.6 * Math.pow(clamp(1 - Math.pow(rho, 2.4)), 0.75);
  const runners = growRunners(r, {
    n: 13,
    R,
    step: 0.045,
    wander: 0.42,
    reachMin: 0.82,
    levels: [
      { every: 0.1, angle: 0.75, len: [0.16, 0.5] },
      { every: 0.11, angle: 0.8, len: [0.08, 0.2] },
    ],
    y: (rho, layer) => 0.008 + cushion(rho) * (0.2 + 0.8 * layer),
  });

  const swayAt = (y: number) => clamp(y / H) * 0.8;
  const birthAt = (rho: number) => (rho < 0.62 || r() < 0.3 ? 0 : clamp((rho - 0.62) * 2.1 + r() * 0.15, 0.08, 0.85));
  const tops: { p: THREE.Vector3; birth: number }[] = [];
  const white = col('#ffffff');

  const place = (p: THREE.Vector3, az: number, layer: number, tip: boolean, len: number) => {
    const rho = Math.hypot(p.x, p.z) / R;
    const edge = clamp((rho - 0.7) / 0.3);
    const pitch = lerp(0.1 + r() * 0.38 * (0.4 + layer), 0.02 + r() * 0.1, edge);
    const roll = (r() - 0.5) * lerp(0.8, 0.25, edge);
    const shade = lerp(0.6, 1.0, clamp(layer * 0.8 + edge * 0.5 + r() * 0.25));
    const c = jitter(white, r, 0, 0, 0).multiplyScalar(shade * (0.92 + r() * 0.16));
    c.r *= 0.96 + r() * 0.1;
    const cell = tip ? 6 : r() < 0.14 ? 5 : Math.floor(r() * 5);
    const b = birthAt(rho);
    const s0 = swayAt(p.y);
    lay(leaves, p, az, pitch, roll, len, len * 0.5, cellUV(cell), c, b, { segs: 2, curl: pitch * 1.5 + r() * 0.2, center, radii, normalBend: 0.55, sway0: s0, sway1: clamp(s0 + 0.2) });
    if (layer > 0.35) tops.push({ p: p.clone().add(V(Math.cos(az) * len * 0.5, len * Math.sin(pitch) * 0.25 + 0.004, Math.sin(az) * len * 0.5)), birth: b });
  };

  for (const run of runners) {
    const n = Math.max(1, Math.round(run.length / 0.064));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const at = along(run.pts, (k + r() * 0.5) / n);
      side = -side;
      const last = k === n - 1;
      place(at.p, heading(at.dir) + (last ? (r() - 0.5) * 0.3 : side * (0.25 + r() * 0.55)), run.layer, last, (last ? 0.15 : 0.13) * (0.85 + r() * 0.35));
    }
  }

  // Shaded older growth under the top layer, so the middle of the mat is solid.
  for (let k = 0; k < 110; k++) {
    const low = k < 60;
    const rho = Math.sqrt(r()) * (low ? 0.86 : 0.76), a = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.006 + cushion(rho) * (low ? 0.1 : 0.45), Math.sin(a) * rho * R);
    const len = 0.4 * (0.8 + r() * 0.4);
    const base = p.clone().add(V(-Math.cos(a + 1) * len * 0.5, 0, -Math.sin(a + 1) * len * 0.5));
    lay(leaves, base, a + 1, 0.02, 0, len, len * 0.5, cellUV(7), col('#ffffff', low ? 0.4 + r() * 0.15 : 0.66 + r() * 0.14), birthAt(rho), { segs: 1, center, radii, normalBend: 0.5, sway0: 0, sway1: 0 }, p);
  }

  // White stars sit just above the foliage, a few to each flowering shoot.
  const fwhite = col('#ffffff');
  for (const t of tops) {
    if (r() > 0.3) continue;
    const many = 1 + Math.floor(r() * 2.2);
    for (let k = 0; k < many; k++) {
      const p = t.p.clone().add(V((r() - 0.5) * 0.07, r() * 0.006, (r() - 0.5) * 0.07));
      const n = V((r() - 0.5) * 0.7, 1, (r() - 0.5) * 0.7);
      const cell = Math.floor(r() * 4);
      const uv: UV = rect((cell % 2) * 128, Math.floor(cell / 2) * 128, 128, 128, 256, 256);
      const size = (cell < 2 ? 0.014 : 0.026) * (0.85 + r() * 0.3);
      flatCard(flowers, p, n, r() * TAU, size, uv, fwhite, clamp(t.birth + r() * 0.1, 0, 0.9), t.p, swayAt(p.y));
    }
  }

  fitMat([leaves, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    look: { leafRoughness: 0.45, translucency: 0.3, bend: 0.02, flutter: 0.004 },
  };
};
