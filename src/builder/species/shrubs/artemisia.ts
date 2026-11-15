import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha, fitAll, growMound, moundWood, sprig, sprigDir, stemBark, tone } from './shared-shrubs-b';

/**
 * Artemisia 'Powis Castle'. A soft, billowing, silver-gray mound, wider than
 * tall, woody only at the base. The foliage is finely dissected and
 * feathery: each leaf, 2 to 3 in long, is cut twice into narrow linear lobes
 * and covered in silky silver hairs. No showy flowers.
 */

function leafTex(): THREE.Texture {
  return leafTexture('artemisia-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('artemisia-leaf-tex');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const seg = (x0: number, y0: number, ang: number, len: number, w: number, color: string) => {
      const x1 = x0 + Math.sin(ang) * len, y1 = y0 - Math.cos(ang) * len;
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      return [x1, y1] as const;
    };
    /** One twice-cut leaf: rachis, pinnae, and narrow lobes on each pinna. */
    const leaf = (x: number, y: number, ang: number, len: number, sh: number) => {
      const lobeW = 8;
      const c0 = tone('#5f6e66', '#7b8a80', sh), c1 = tone('#74837a', '#929f95', sh), c2 = tone('#87958b', '#a8b3a8', sh);
      const curve = (r() - 0.5) * 0.5;
      const n = 6;
      let px = x, py = y;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        const a = ang + curve * t;
        const [nx, ny] = seg(px, py, a, len / n, lerp(5, 3.4, t), c0);
        if (i >= 1) {
          for (const s of [-1, 1]) {
            const pa = a + s * (0.95 - t * 0.35 + (r() - 0.5) * 0.2);
            const pl = len * 0.34 * Math.sin(Math.PI * Math.pow(t, 0.8) * 0.92 + 0.12) * (0.8 + r() * 0.4);
            const [qx, qy] = seg(px, py, pa, pl * 0.55, lobeW * 0.8, c1);
            // Lobes fan from the pinna.
            const [ex, ey] = seg(qx, qy, pa + (r() - 0.5) * 0.2, pl * 0.5, lobeW, c2);
            seg(qx, qy, pa - s * 0.55, pl * 0.4, lobeW, c1);
            seg(qx, qy, pa + s * 0.6, pl * 0.36, lobeW, c2);
            if (pl > 40) seg((px + qx) / 2, (py + qy) / 2, pa + s * 0.7, pl * 0.3, lobeW * 0.9, c1);
            g.fillStyle = c2;
            g.beginPath();
            g.arc(ex, ey, lobeW * 0.45, 0, 6.3);
            g.fill();
          }
        }
        px = nx; py = ny;
      }
      const a = ang + curve;
      seg(px, py, a, len * 0.14, lobeW, c2);
      seg(px, py, a - 0.5, len * 0.11, lobeW, c2);
      seg(px, py, a + 0.5, len * 0.11, lobeW, c2);
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      const x0 = S / 2, y0 = S - 3, y1 = S * 0.3;
      const bend = (r() - 0.5) * 40;
      const tx = (t: number) => x0 + bend * t * t, ty = (t: number) => lerp(y0, y1, t);
      const n = cell === 3 ? 7 : 10;
      const LL = S * 0.4;
      const list = Array.from({ length: n }, (_, i) => {
        const t = 0.12 + 0.88 * (i / (n - 1));
        return { t, ang: (i % 2 ? 1 : -1) * lerp(1.15, 0.3, t * t) + (r() - 0.5) * 0.35, len: LL * lerp(1, 0.6, t * t) * (0.8 + r() * 0.35) };
      });
      for (const l of list.filter((_, i) => i % 3 === 0)) leaf(tx(l.t), ty(l.t), l.ang * 0.4, l.len * 0.8, 0.1 + r() * 0.3);
      g.strokeStyle = '#8f9a8c';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(tx(0), ty(0));
      for (let i = 1; i <= 8; i++) g.lineTo(tx(i / 8), ty(i / 8));
      g.stroke();
      for (const l of list) leaf(tx(l.t), ty(l.t), l.ang, l.len, 0.35 + r() * 0.65);
      for (let i = 0; i < 3; i++) leaf(tx(1), ty(1), (i - 1) * 0.45, LL * 0.42, 0.8 + r() * 0.2);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const L = 0.14;

  const m = growMound(r, { H: H - 0.05, Sp: Sp - 0.12, points: 300, stems: 12, perLimb: 8, centerY: 0.4, under: -0.75, power: 2.3, lump: 0.2, lumpFreq: 4.2, rough: 0.12, stemRadius: 0.007, crown: 0.09, arch: 0.07, gnarl: 0.2, twigSegs: 1, early: 0.72 });
  const stemC = col('#8a7c66'), limbC = col('#a39d88'), twigC = col('#a3ab9c');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.68, 1, Math.pow(d, 2)) * lerp(0.82, 1, clamp(p.y / (H * 0.5))) * (1 - inner * 0.25);
    return jitter(col('#eef2ee'), r, 0.02, 0.03, 0.04).multiplyScalar(shade * (0.9 + r() * 0.14));
  };
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    for (let k = 0; k < 6; k++) {
      const at = along(tw.pts, lerp(0.3, 1, (k + r() * 0.8) / 6)).p;
      const dir = sprigDir(r, out, 0.45 + r() * 0.8, 0.3);
      const len = L * (0.8 + r() * 0.45);
      sprig(leaves, r, m, at, dir, len, len, uvCell(2, 2, Math.floor(r() * 4)), tint(at, 0.1), born(), { cross: k % 3 === 0, curl: 0.1 + r() * 0.5, faceOut: 0.8, swayTip: 0.2, normalBend: 0.85 });
    }
    const dir = out.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.5, (r() - 0.5) * 0.2, (r() - 0.5) * 0.5)).normalize();
    sprig(leaves, r, m, end, dir, L * (0.8 + r() * 0.3), L, uvCell(2, 2, Math.floor(r() * 4)), tint(end, 0), tw.birth, { cross: true, curl: 0.2, faceOut: 0.4, swayTip: 0.2, normalBend: 0.85 });
  }
  for (const b of m.limbs) {
    for (let k = 0; k < 9; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.7 + r() * 0.7, 0.3);
      sprig(leaves, r, m, at, dir, L * 1.25, L * 1.25, uvCell(2, 2, Math.floor(r() * 3)), tint(at, 1), b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8, normalBend: 0.85 });
    }
  }

  fitAll([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: leafTex(),
    bark: { map: stemBark('artemisia', 0.25) },
    look: { translucency: 0.45, leafRoughness: 0.9, bend: 0.09, flutter: 0.02, alphaTest: 0.5 },
  };
};
