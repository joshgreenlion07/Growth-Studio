import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { arcPath, bezPath, fitToSize, flatCard, sheet, stemBark } from './shared-perennials';

/**
 * Sea lavender (statice), Limonium perezii. A basal rosette of large,
 * leathery, wavy-edged rounded leaves on long stalks; above it wiry,
 * repeatedly forking stems carry broad flat-topped clouds of papery
 * purple-violet calyces, each holding a tiny white flower.
 */

/** Leaf atlas, 2 leaves side by side (512 x 1024 each cell 256 wide): stalk at the bottom, broad blade above. */
function staticeLeaves(): THREE.Texture {
  return leafTexture('statice-leaves', 512, 1024, (g) => {
    const r = rng('statice-leaf-tex');
    for (let c = 0; c < 2; c++) {
      const cx = 128 + c * 256;
      const bladeBase = 700, top = 14, hw = 118;
      // Outline: stalk, then a blade that runs down into it, widest above the middle, rounded tip.
      const pts: [number, number][] = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const t = i / N; // 0 at the blade base .. 1 at the tip
        const w = hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72) * 0.94 + 0.06), 0.62) * (t > 0.93 ? Math.sqrt(Math.max(0, (1 - t) / 0.07)) : 1);
        const wave = 1 + 0.045 * Math.sin(t * 19 + c * 2) + 0.02 * Math.sin(t * 43);
        pts.push([Math.max(9, w * wave), lerp(bladeBase, top, t)]);
      }
      g.beginPath();
      g.moveTo(cx - 9, 1024);
      g.lineTo(cx - 9, bladeBase);
      for (const [w, y] of pts) g.lineTo(cx - w, y);
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx + pts[i][0], pts[i][1]);
      g.lineTo(cx + 9, bladeBase);
      g.lineTo(cx + 9, 1024);
      g.closePath();
      const grad = g.createLinearGradient(0, 1024, 0, 0);
      grad.addColorStop(0, c ? '#5f7d48' : '#65834e');
      grad.addColorStop(0.3, c ? '#3a5f30' : '#416836');
      grad.addColorStop(1, c ? '#44703a' : '#4d7a40');
      g.fillStyle = grad;
      g.fill();
      g.save();
      g.clip();
      // Leathery mottling.
      for (let i = 0; i < 500; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(30,55,30,${0.03 + r() * 0.05})` : `rgba(160,190,120,${0.03 + r() * 0.05})`;
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * 240, r() * 760, 6 + r() * 22, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // Side veins curving toward the margin.
      g.strokeStyle = 'rgba(130,170,100,0.4)';
      g.lineWidth = 2.5;
      for (let k = 0; k < 9; k++) {
        const y = lerp(bladeBase - 20, 130, k / 8);
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx, y);
          g.quadraticCurveTo(cx + s * 60, y - 40, cx + s * 112, y - 120);
          g.stroke();
        }
      }
      // Thin reddish-pale margin and a stout pale midrib running out of the stalk.
      g.restore();
      g.strokeStyle = 'rgba(150,120,80,0.5)';
      g.lineWidth = 3;
      g.stroke();
      const mid = g.createLinearGradient(0, 1024, 0, 0);
      mid.addColorStop(0, '#8fa672');
      mid.addColorStop(0.35, '#8eb070');
      mid.addColorStop(1, 'rgba(120,165,90,0.5)');
      g.strokeStyle = mid;
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, 1020);
      g.lineTo(cx, 40);
      g.stroke();
    }
  });
}

const VIOLETS = ['#6a45c9', '#5a38b8', '#7a52d6', '#6540c0', '#8660dc', '#4e30a8'];

/** One papery calyx face-on: a crinkled five-angled funnel, some holding a small white flower. */
function calyxTop(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, rad: number, open: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(r() * 6.28);
  g.beginPath();
  for (let k = 0; k <= 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const rr = rad * (0.86 + 0.14 * Math.cos(a * 5)) * (0.96 + r() * 0.08);
    if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  const grad = g.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad);
  const base = VIOLETS[Math.floor(r() * VIOLETS.length)];
  grad.addColorStop(0, '#3c2488');
  grad.addColorStop(0.45, base);
  grad.addColorStop(1, r() < 0.5 ? '#8e6ce0' : '#7a56d2');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(50,28,120,0.5)';
  g.lineWidth = Math.max(1, rad * 0.06);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * rad * 0.2, Math.sin(a) * rad * 0.2);
    g.lineTo(Math.cos(a) * rad * 0.95, Math.sin(a) * rad * 0.95);
    g.stroke();
  }
  if (open) {
    g.fillStyle = '#fbfaf2';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.ellipse(Math.cos(a) * rad * 0.3, Math.sin(a) * rad * 0.3, rad * 0.27, rad * 0.17, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e8dc9a';
    g.beginPath();
    g.arc(0, 0, rad * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** One calyx side-on: a narrow green-violet tube flaring to a violet rim. */
function calyxSide(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, open: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const w = len * 0.5;
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, '#6f7f5a');
  grad.addColorStop(0.35, '#5a3cae');
  grad.addColorStop(1, VIOLETS[Math.floor(r() * VIOLETS.length)]);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(-len * 0.07, 0);
  g.quadraticCurveTo(-len * 0.1, -len * 0.55, -w, -len);
  g.quadraticCurveTo(0, -len * 1.12, w, -len);
  g.quadraticCurveTo(len * 0.1, -len * 0.55, len * 0.07, 0);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(150,120,230,0.6)';
  g.beginPath();
  g.ellipse(0, -len, w, len * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  if (open) {
    g.fillStyle = '#fbfaf2';
    g.beginPath();
    g.ellipse(0, -len * 1.08, w * 0.45, len * 0.13, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** 1024 x 1024 flower atlas, 2 x 2: two clusters from above (top row), two sprays from the side (bottom row, stalk at the bottom center). */
function staticeFlowers(): THREE.Texture {
  return leafTexture('statice-flowers', 1024, 1024, (g) => {
    const r = rng('statice-flower-tex');
    const S = 512;
    for (let c = 0; c < 2; c++) {
      const cx = S / 2 + c * S, cy = S / 2;
      // Fine stalks under the cloud.
      g.strokeStyle = '#6f7d54';
      g.lineWidth = 5;
      for (let k = 0; k < 7; k++) {
        const a = r() * 6.28, d = 120 + r() * 90;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        g.stroke();
      }
      for (let i = 0; i < 95; i++) {
        const a = r() * 6.28, d = Math.pow(r(), 0.6) * 205;
        // Lumpy outline: a few lobes rather than a clean disc.
        const lobe = 0.78 + 0.22 * Math.sin(a * 3 + c * 1.7);
        calyxTop(g, r, cx + Math.cos(a) * d * lobe, cy + Math.sin(a) * d * lobe, 27 + r() * 9, r() < 0.4);
      }
    }
    for (let c = 0; c < 2; c++) {
      const cx = S / 2 + c * S, by = 1022;
      g.strokeStyle = '#6f7d54';
      g.lineCap = 'round';
      const tips: [number, number, number][] = [];
      for (let k = 0; k < 7; k++) {
        const u = (k + r() * 0.6) / 7 - 0.46;
        const tx = cx + u * 400, ty = by - 250 - r() * 60 + Math.abs(u) * 120;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(cx, by);
        g.quadraticCurveTo(cx + u * 150, by - 130, tx, ty);
        g.stroke();
        tips.push([tx, ty, u]);
      }
      for (const [tx, ty, u] of tips) {
        for (let i = 0; i < 9; i++) {
          const ox = (r() - 0.5) * 120, oy = -r() * 150;
          calyxSide(g, r, clamp(tx + ox, c * S + 30, (c + 1) * S - 30), Math.max(S + 80, ty + oy + 30), u * 0.9 + (r() - 0.5) * 0.7, 62 + r() * 22, r() < 0.4);
        }
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const k = Sp / 0.75, ky = H / 0.6;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();

  // Rosette: young leaves stand up in the middle, older ones lie out and down.
  const NL = 34;
  for (let i = 0; i < NL; i++) {
    const f = (i + 0.5) / NL; // 0 inner/young .. 1 outer/old
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const len = lerp(0.22, 0.4, Math.pow(f, 0.7)) * (0.9 + r() * 0.2) * k;
    const wid = len * (0.36 + r() * 0.06);
    const elev0 = lerp(1.25, 0.5, f) + (r() - 0.5) * 0.2; // radians above horizontal at the base
    const droop = lerp(0.5, 1.0, f) + r() * 0.3;
    const base = V(Math.cos(az) * 0.012, 0.005, Math.sin(az) * 0.012);
    const birth = i % 2 === 0 ? 0 : clamp(0.08 + (1 - f) * 0.5 + r() * 0.25, 0, 0.85);
    const rows = 9, cols = 5;
    const out = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const twist = (r() - 0.5) * 0.5, ph = r() * 6.28, cup = 0.1 + r() * 0.12, waveAmp = wid * (0.07 + r() * 0.05);
    const grid: THREE.Vector3[][] = [];
    const p = base.clone();
    for (let a = 0; a < rows; a++) {
      const t = a / (rows - 1);
      const e = elev0 - droop * Math.pow(t, 1.4);
      const d = out.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0));
      if (a > 0) p.addScaledVector(d, len / (rows - 1));
      const up = V().crossVectors(side, d).normalize().multiplyScalar(-1);
      if (up.y < 0) up.multiplyScalar(-1);
      // Width follows the painted leaf: stalk for the first third, then the blade.
      const row: THREE.Vector3[] = [];
      const tw = twist * t;
      for (let b = 0; b < cols; b++) {
        const x = b / (cols - 1) - 0.5;
        const edge = Math.abs(x) * 2;
        const blade = clamp((t - 0.28) / 0.2);
        const q = p.clone().addScaledVector(side, x * wid * Math.cos(tw)).addScaledVector(up, x * wid * Math.sin(tw));
        q.addScaledVector(up, (edge * edge * cup * wid * 0.5 + Math.sin(t * 13 + ph + (x > 0 ? 1.7 : 0)) * waveAmp * edge * edge) * blade);
        row.push(q);
      }
      grid.push(row);
    }
    const tone = jitter(col('#ffffff', lerp(0.95, 0.8, f) * (0.93 + r() * 0.12)), r, 0.012, 0.05, 0.02);
    const dark = tone.clone().multiplyScalar(0.62);
    const anchor = base.clone();
    sheet(leaves, grid, [(i % 2) * 0.5, 0, (i % 2) * 0.5 + 0.5, 1], (a) => dark.clone().lerp(tone, clamp(a / 3)), birth, anchor, (a) => clamp(Math.pow(a / (rows - 1), 1.5) * 0.35));
  }

  // Flowering stems: wiry, forking into a flat-topped head.
  const stemCol = col('#70805a'), twigCol = col('#7d8a66');
  const NS = 9;
  for (let i = 0; i < NS; i++) {
    const az = i * 2.39996 + 0.7 + (r() - 0.5) * 0.4;
    const f = i === 0 ? 0 : 0.35 + 0.65 * (i / (NS - 1));
    const lean = f * 0.75 + r() * 0.08;
    const L = (i === 0 ? 0.57 : lerp(0.56, 0.4, r()) * lerp(1, 0.9, f)) * ky;
    const base = V(Math.cos(az) * 0.015, 0, Math.sin(az) * 0.015);
    const pts = arcPath(base, az, lean * 1.25, lean * 0.6, L, 6, r, 0.1);
    const birth = i < 4 ? 0 : clamp(0.15 + r() * 0.65, 0, 0.85);
    const anchor = base;
    const sw = (t: number) => clamp(Math.pow(t, 1.5) * 0.7);
    tube(wood, pts, 0.003 * k, 0.0018 * k, 4, stemCol, birth, anchor, (q) => sw(q / 6), 1);
    const top = pts[pts.length - 1];
    const Rh = (0.085 + r() * 0.035) * k;
    const headY = top.y + 0.03 * ky;
    const n1 = 5 + Math.floor(r() * 2);
    const cluster = (c: THREE.Vector3, size: number) => {
      const tone = jitter(col('#ffffff', 0.9 + r() * 0.1), r, 0.015, 0.04, 0.03);
      const nrm = V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
      flatCard(flowers, c, nrm, size, [r() < 0.5 ? 0 : 0.5, 0.5, r() < 0.5 ? 0.5 : 1, 1], tone, birth, anchor, sw(1), r() * 6.28);
      // Side sprays under the top, crossed, so the head has depth from eye level.
      const roll = r() * 3.14;
      for (let q = 0; q < 2; q++) {
        const a = roll + q * 1.57;
        const face = V(Math.cos(a), 0.15, Math.sin(a)).normalize();
        const cu = q ? 0 : 0.5;
        leafQuad(flowers, c.clone().add(V(0, -size * 0.55, 0)), V(0, 1, 0), face, size * 0.72, size * 1.05, [cu, 0, cu + 0.5, 0.5], tone.clone().multiplyScalar(0.92), birth, anchor, { sway0: sw(1), sway1: sw(1), normalBend: 0 });
      }
    };
    let a1 = r() * 6.28;
    for (let b = 0; b < n1; b++) {
      a1 += (Math.PI * 2) / n1 + (r() - 0.5) * 0.4;
      const from = along(pts, 0.6 + (b / n1) * 0.36);
      const rad = b === 0 ? 0 : Rh * (0.55 + r() * 0.2);
      const tgt = V(top.x + Math.cos(a1) * rad, headY - (b === 0 ? 0 : 0.035 * ky) - r() * 0.02, top.z + Math.sin(a1) * rad);
      const ctrl = from.p.clone().lerp(tgt, 0.5).add(V(Math.cos(a1) * rad * 0.35, -0.02, Math.sin(a1) * rad * 0.35));
      const bp = bezPath(from.p, ctrl, tgt, 3);
      tube(wood, bp, 0.0016 * k, 0.001 * k, 3, twigCol, birth, anchor, () => sw(0.9), 1);
      cluster(tgt.clone().add(V(0, 0.022 * ky, 0)), (0.075 + r() * 0.02) * k);
      const n2 = 2 + Math.floor(r() * 2);
      for (let c = 0; c < n2; c++) {
        const a2 = a1 + (c - (n2 - 1) / 2) * 1.1 + (r() - 0.5) * 0.4;
        const st = bp[2];
        const rr = Rh * (0.4 + r() * 0.2);
        const t2 = V(tgt.x + Math.cos(a2) * rr, tgt.y - 0.012 - r() * 0.03, tgt.z + Math.sin(a2) * rr);
        tube(wood, bezPath(st, st.clone().lerp(t2, 0.5).add(V(0, -0.012, 0)), t2, 2), 0.0011 * k, 0.0007 * k, 3, twigCol, birth, anchor, () => sw(1), 1);
        cluster(t2.clone().add(V(0, 0.02 * ky, 0)), (0.065 + r() * 0.02) * k);
      }
    }
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: staticeLeaves(),
    flowerMap: staticeFlowers(),
    bark: { map: stemBark() },
    look: { translucency: 0.18, leafRoughness: 0.5, bend: 0.06, flutter: 0.004 },
  };
};
