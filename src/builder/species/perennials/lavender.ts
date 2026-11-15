import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafPath, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, sprig, sprigDir, stemBark, tone } from '../shrubs/shared-shrubs-b';

/**
 * Lavender, modeled on lavandin (Lavandula x intermedia 'Provence' or
 * 'Grosso' type), in full bloom. A rounded gray-green mound of narrow linear
 * leaves in opposite pairs on upright shoots. Many straight, thin, leafless
 * flower stems rise well above the mound, radiating like a pincushion, each
 * topped with a 2 to 3 in spike: whorls of gray-violet calyces and small
 * violet-purple florets, the lowest whorl often set apart.
 */

function leafTex(): THREE.Texture {
  return leafTexture('lavender-leaves', 1024, 1024, (g) => {
    const cw = 256, ch = 512;
    const r = rng('lavender-leaf-tex');
    const leaf = (x: number, y: number, ang: number, len: number, wid: number, young: number, sh: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, tone(tone('#55684f', '#6d8064', sh), '#8c9c84', young));
      grad.addColorStop(1, tone(tone('#6a7d60', '#84967a', sh), '#a3b09a', young));
      g.fillStyle = grad;
      leafPath(g, len, wid, 0.55, 0.3);
      g.fill();
      g.strokeStyle = 'rgba(52,68,50,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(len * 0.03, 0);
      g.lineTo(len * 0.94, 0);
      g.stroke();
      g.restore();
    };
    for (let cell = 0; cell < 8; cell++) {
      cellClip(g, cell % 4, Math.floor(cell / 4), cw, ch);
      const x0 = cw / 2, y0 = ch - 2, top = ch * (cell === 7 ? 0.5 : 0.3 + r() * 0.08);
      const bend = (r() - 0.5) * 22;
      const sx = (t: number) => x0 + bend * t * t, sy = (t: number) => lerp(y0, top, t);
      const nodes = cell === 7 ? 6 : 9;
      const info = Array.from({ length: nodes }, (_, i) => ({ t: 0.06 + (i / nodes) * 0.94, len: (150 - i * 6) * (0.8 + r() * 0.35), sh: r() }));
      // Pairs set at right angles alternate: every other pair points toward and away from the viewer.
      for (const w of info.filter((_, i) => i % 2 === 1)) leaf(sx(w.t), sy(w.t), (r() - 0.5) * 0.3, w.len * 0.7, 15, 0, w.sh * 0.5);
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = tone('#8c8468', '#a3ad94', (i / 10) * 1.6);
        g.lineWidth = lerp(8, 4.5, i / 10);
        g.beginPath();
        g.moveTo(sx(i / 10), sy(i / 10));
        g.lineTo(sx((i + 1) / 10), sy((i + 1) / 10));
        g.stroke();
      }
      for (const w of info) {
        const young = w.t > 0.8 ? 0.8 : 0;
        for (const s of [-1, 1]) {
          leaf(sx(w.t), sy(w.t), s * (0.5 + (r() - 0.5) * 0.3 - w.t * 0.15), w.len * (0.9 + r() * 0.2), 13 + r() * 4, young, clamp(w.sh + (r() - 0.5) * 0.3));
          // Short tuft of leaves in the axil.
          if (r() < 0.7) leaf(sx(w.t), sy(w.t), s * (0.25 + r() * 0.2), w.len * 0.45, 10, 0.5, r());
        }
      }
      for (let i = 0; i < 4; i++) leaf(sx(1), sy(1), (i - 1.5) * 0.28 + (r() - 0.5) * 0.15, 70 + r() * 30, 11, 0.9, 0.5 + r() * 0.5);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

function flowerTex(violet: string): THREE.Texture {
  return leafTexture('lavender-flowers', 512, 512, (g) => {
    const cw = 128, ch = 512;
    const r = rng('lavender-flower-tex');
    const deep = tone(violet, '#2c1a66', 0.5), light = tone(violet, '#b9a6f0', 0.45);
    const whorl = (cx: number, y: number, halfW: number, open: number) => {
      const n = Math.max(3, Math.round(halfW / 7));
      // Calyces: ribbed gray-violet tubes, packed side by side.
      for (let i = 0; i < n * 2; i++) {
        const x = cx + lerp(-halfW, halfW, (i + r() * 0.6) / (n * 2 - 0.4)) * 0.85;
        const hgt = 20 + r() * 7;
        g.save();
        g.translate(x, y + (r() - 0.5) * 6);
        g.rotate(((x - cx) / halfW) * 0.6 + (r() - 0.5) * 0.2);
        const grad = g.createLinearGradient(0, 4, 0, -hgt);
        grad.addColorStop(0, tone('#6f7a66', '#5a5378', r()));
        grad.addColorStop(1, tone('#5b4c8c', deep, r()));
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(0, -hgt / 2, 5.4, hgt / 2 + 2, 0, 0, 6.3);
        g.fill();
        // The open floret: a small two-lipped corolla at the calyx mouth.
        if (r() < open) {
          g.translate(0, -hgt + 1);
          const s = 7.5 + r() * 3;
          g.fillStyle = tone(violet, light, r());
          for (const a of [-0.9, -0.3, 0.3, 0.9]) {
            g.beginPath();
            g.ellipse(Math.sin(a) * s, -Math.cos(a) * s * 0.8, s * 0.52, s * 0.72, a, 0, 6.3);
            g.fill();
          }
          g.fillStyle = deep;
          g.beginPath();
          g.arc(0, 0, 2.3, 0, 6.3);
          g.fill();
        }
        g.restore();
      }
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell, 0, cw, ch);
      const cx = cw / 2;
      g.strokeStyle = '#8a9a76';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, ch - 2);
      g.lineTo(cx, ch * 0.1);
      g.stroke();
      const n = 9 + (cell % 2);
      const gap = cell === 3 ? 0 : 0.1 + r() * 0.06;
      for (let i = 0; i < n; i++) {
        // The lowest whorl sits apart from the rest of the spike.
        const t = i === 0 ? 0 : gap + (1 - gap) * (i / (n - 1));
        const y = lerp(ch * 0.9, ch * 0.09, t);
        const fat = Math.sin(Math.PI * clamp(0.18 + t * 0.72));
        whorl(cx, y, lerp(22, 50, fat), i >= n - 2 ? 0.25 : 0.5 + r() * 0.3);
      }
      g.restore();
    }
    hardenAlpha(g, 512, 512);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const L = 0.11, W = 0.055;

  // The foliage mound is about 60% of the height; the flower stems make up the rest.
  const m = growMound(r, { H: H * 0.6, Sp: Sp * 0.72, points: 210, stems: 10, perLimb: 8, centerY: 0.45, under: -0.78, power: 2.2, lump: 0.06, rough: 0.1, stemRadius: 0.006, crown: 0.05, arch: -0.03, gnarl: 0.14, twigSegs: 1, early: 0.7 });
  const stemC = col('#7a6c58'), limbC = col('#8f8770'), twigC = col('#a2aa92');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.55, 1, Math.pow(d, 2)) * lerp(0.8, 1, clamp(p.y / (m.H * 0.5))) * (1 - inner * 0.3);
    return jitter(col('#f6f7f0'), r, 0.02, 0.05, 0.04).multiplyScalar(shade * (0.9 + r() * 0.14));
  };
  const stalkC = col('#93a07c');
  const flowerStem = (base: THREE.Vector3, birth: number) => {
    // Stems radiate from the crown like a pincushion, the upper ones nearly upright.
    const dir = base.clone().sub(V(0, -0.1, 0)).normalize().lerp(UP, 0.18).add(V((r() - 0.5) * 0.16, (r() - 0.5) * 0.08, (r() - 0.5) * 0.16)).normalize();
    const len = H * (0.33 + r() * 0.13);
    const tip = base.clone().addScaledVector(dir, len);
    const s0 = m.sway(base);
    const sw = [s0, clamp(s0 + 0.2), clamp(s0 + 0.4)];
    tube(wood, [base, tip], 0.0013, 0.001, 3, stalkC, birth, base, (i) => sw[i * 2], 1);
    const sl = 0.058 + r() * 0.03;
    const sb = tip.clone().addScaledVector(dir, -sl * 0.78);
    const uv = uvCell(4, 1, Math.floor(r() * 4));
    const c = col('#ffffff', 0.86 + r() * 0.14);
    const f1 = perp(dir).applyAxisAngle(dir, r() * 3.14), f2 = V().crossVectors(dir, f1).normalize();
    for (const f of [f1, f2]) leafQuad(flowers, sb, dir, f, sl, sl / 4, uv, c, birth, base, { sway0: sw[2], sway1: sw[2], center: m.center, radii: m.radii, normalBend: 0.5 });
  };

  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    for (let k = 0; k < 6; k++) {
      const at = along(tw.pts, lerp(0.3, 1, (k + r() * 0.8) / 6)).p;
      const dir = sprigDir(r, out, 0.25 + r() * 0.6, 0.45);
      const len = L * (0.75 + r() * 0.45);
      sprig(leaves, r, m, at, dir, len, W * (len / L), uvCell(4, 2, Math.floor(r() * 8)), tint(at, 0.1), born(), { cross: k % 3 === 0, curl: (r() - 0.4) * 0.4, faceOut: 0.75 });
    }
    const dir = out.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    sprig(leaves, r, m, end, dir, L * (0.8 + r() * 0.3), W, uvCell(4, 2, Math.floor(r() * 7)), tint(end, 0), tw.birth, { cross: true, curl: 0.1, faceOut: 0.4 });
    if (out.y > -0.05) {
      const n = out.y > 0.25 ? (r() < 0.5 ? 3 : 2) : r() < 0.8 ? 1 : 0;
      for (let k = 0; k < n; k++) flowerStem(along(tw.pts, 0.75 + r() * 0.25).p.add(V((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02)), clamp(tw.birth + (k ? 0.1 + r() * 0.3 : 0.02), 0, 0.9));
    }
  }
  for (const b of m.limbs) {
    for (let k = 0; k < 6; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.6 + r() * 0.7, 0.4);
      sprig(leaves, r, m, at, dir, L * 1.2, W * 1.3, uvCell(4, 2, Math.floor(r() * 7)), tint(at, 1), b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower ?? '#7a63b8'),
    bark: { map: stemBark('lavender', 0.2) },
    look: { translucency: 0.25, leafRoughness: 0.85, bend: 0.1, flutter: 0.012 },
  };
};
