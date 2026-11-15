import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, jitter, leafPath, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha, faceCard, fitAll, growMound, moundWood, sprig, sprigDir, stemBark, tone } from './shared-shrubs-b';

/**
 * Coast rosemary, Westringia fruticosa. A dense, rounded, fine-textured
 * gray-green shrub. Narrow rosemary-like leaves, 0.5 to 1 in long, sit in
 * whorls of four along pale felted twigs: gray-green above, white-felted
 * beneath. Small white to palest-lavender two-lipped flowers with
 * orange-brown throat spots are scattered over the whole plant.
 */

/** UV rects: 0..1 are branchlets (square), 2..5 are single sprigs (tall). */
const CELLS: [number, number, number, number][] = [
  [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1],
  [0, 0, 0.25, 0.5], [0.25, 0, 0.5, 0.5], [0.5, 0, 0.75, 0.5], [0.75, 0, 1, 0.5],
];

function leafTex(): THREE.Texture {
  return leafTexture('westringia-leaves', 1024, 1024, (g) => {
    const r = rng('westringia-tex');
    const leaf = (x: number, y: number, ang: number, len: number, wid: number, kind: 'top' | 'under' | 'new', shade: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const grad = g.createLinearGradient(0, 0, len, 0);
      if (kind === 'under') {
        grad.addColorStop(0, tone('#93a08c', '#b4bfab', shade));
        grad.addColorStop(1, tone('#a5b09c', '#c4ccba', shade));
      } else if (kind === 'new') {
        grad.addColorStop(0, tone('#71866a', '#8fa184', shade));
        grad.addColorStop(1, tone('#879a7c', '#a6b599', shade));
      } else {
        grad.addColorStop(0, tone('#3f5540', '#5c7257', shade));
        grad.addColorStop(0.6, tone('#4c634a', '#6a8063', shade));
        grad.addColorStop(1, tone('#586f55', '#788d70', shade));
      }
      g.fillStyle = grad;
      leafPath(g, len, wid, 0.5, 0.75);
      g.fill();
      // Pale felted margin (the leaf edge rolls under) and a fine midrib groove.
      g.strokeStyle = kind === 'under' ? 'rgba(120,138,112,0.7)' : 'rgba(170,184,160,0.5)';
      g.lineWidth = 1;
      g.stroke();
      g.strokeStyle = kind === 'under' ? 'rgba(100,118,95,0.8)' : 'rgba(40,58,42,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(len * 0.04, 0);
      g.lineTo(len * 0.92, 0);
      g.stroke();
      g.restore();
    };
    /** A leafy shoot from (x0, y0) heading `ang` from straight up, `length` px long; leaves `ll` px long. */
    const shoot = (x0: number, y0: number, ang: number, length: number, ll: number, sw: number) => {
      const bend = (r() - 0.5) * 0.35;
      const whorls = Math.max(4, Math.round(length / (ll * 0.3)));
      const pt = (t: number) => {
        const a = ang + bend * t;
        return [x0 + Math.sin(a) * length * t, y0 - Math.cos(a) * length * t, a] as const;
      };
      const info = Array.from({ length: whorls }, (_, i) => {
        const t = 0.04 + (i / whorls) * 0.96;
        return { t, len: ll * lerp(1, 0.55, Math.pow(t, 1.8)) * (0.85 + r() * 0.3), twist: (r() - 0.5) * 0.5, sh: r() };
      });
      for (const w of info) {
        const [x, y, a] = pt(w.t);
        leaf(x, y, a + w.twist + (r() - 0.5) * 0.6, w.len * 0.62, ll * 0.16, w.t > 0.85 ? 'new' : r() < 0.5 ? 'under' : 'top', w.sh * 0.6);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const [xa, ya] = pt(i / 10), [xb, yb] = pt((i + 1) / 10);
        g.strokeStyle = tone('#7c765e', '#98a38a', (i / 10) * 1.5);
        g.lineWidth = lerp(sw, sw * 0.5, i / 10);
        g.beginPath();
        g.moveTo(xa, ya);
        g.lineTo(xb, yb);
        g.stroke();
      }
      for (const w of info) {
        const [x, y, a] = pt(w.t);
        const kind = w.t > 0.86 ? 'new' : 'top';
        for (const s of [-1, 1]) {
          const la = a + s * (0.85 + (r() - 0.5) * 0.75 - w.t * 0.3) + w.twist * 0.5;
          leaf(x, y, la, w.len * (0.9 + r() * 0.2), ll * (0.15 + r() * 0.035), r() < 0.07 ? 'under' : kind, clamp(w.sh + (r() - 0.5) * 0.4));
        }
        leaf(x, y, a + w.twist + (r() - 0.5) * 0.9, w.len * (0.5 + r() * 0.35), ll * 0.17, kind, clamp(w.sh * 0.6 + 0.4));
      }
      const [xe, ye, ae] = pt(1);
      for (let i = 0; i < 5; i++) leaf(xe, ye, ae + (i - 2) * 0.32 + (r() - 0.5) * 0.2, ll * (0.36 + r() * 0.18), ll * 0.12, 'new', 0.5 + r() * 0.5);
    };
    // Two branchlets: a twig with opposite side shoots, 16 cm square.
    for (let cell = 0; cell < 2; cell++) {
      cellClip(g, cell, 0, 512, 512);
      const S = 512, ll = 62;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y = S * lerp(0.9, 0.42, i / (n - 1));
        for (const s of [-1, 1]) {
          if (i === n - 1 && r() < 0.5) continue;
          shoot(S / 2 + (r() - 0.5) * 6, y, s * (0.5 + r() * 0.35), S * lerp(0.5, 0.3, i / (n - 1)) * (0.8 + r() * 0.35), ll, 5);
        }
      }
      shoot(S / 2, S - 2, (r() - 0.5) * 0.1, S * 0.88, ll, 7);
      g.restore();
    }
    // Four single shoots, 6.5 x 13 cm.
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell, 1, 256, 512);
      shoot(128, 510, (r() - 0.5) * 0.08, 512 * (cell === 3 ? 0.6 : 0.82 + r() * 0.06), 78, 7);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

function flowerTex(): THREE.Texture {
  return leafTexture('westringia-flowers', 256, 256, (g) => {
    const S = 128;
    const r = rng('westringia-flower-tex');
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      g.translate(S / 2, S / 2 + 4);
      g.rotate((r() - 0.5) * 0.4);
      const tint = cell === 3 ? '#e3daf0' : cell === 2 ? '#f1ecf5' : '#f6f5f0';
      const lobe = (ang: number, len: number, wid: number) => {
        g.save();
        g.rotate(ang);
        const grad = g.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, '#e9e6da');
        grad.addColorStop(0.35, tint);
        grad.addColorStop(1, '#ffffff');
        g.fillStyle = grad;
        leafPath(g, len, wid, 0.62, 0.1);
        g.fill();
        g.strokeStyle = 'rgba(170,165,180,0.5)';
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      };
      // Lower lip: three spreading lobes. Upper lip: two erect lobes.
      for (const a of [Math.PI / 2 - 0.85, Math.PI / 2 + 0.85, Math.PI / 2]) lobe(a + (r() - 0.5) * 0.1, 54, 30);
      for (const a of [-Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42]) lobe(a + (r() - 0.5) * 0.1, 50, 27);
      // Throat and its spots.
      g.fillStyle = '#d8d6a8';
      g.beginPath();
      g.arc(0, 0, 7, 0, 6.3);
      g.fill();
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 2 + (r() - 0.5) * 2.2, d = 9 + r() * 20;
        g.fillStyle = r() < 0.6 ? 'rgba(176,104,52,0.85)' : 'rgba(128,82,150,0.8)';
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, 1.3 + r() * 1.2, 0, 6.3);
        g.fill();
      }
      g.restore();
    }
    hardenAlpha(g, 256, 256);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const L = 0.13, W = 0.065;

  const m = growMound(r, { H: H - 0.05, Sp: Sp - 0.12, points: 430, stems: 13, perLimb: 7, centerY: 0.44, under: -0.82, power: 2.3, lump: 0.07, lumpFreq: 3.2, rough: 0.07, stemRadius: 0.011, arch: 0.05, gnarl: 0.14, twigSegs: 1, early: 0.62 });
  const stemC = col('#6f6656'), limbC = col('#8a8470'), twigC = col('#a4aa92');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.5, 1, Math.pow(d, 2.2)) * lerp(0.8, 1, clamp(p.y / (H * 0.5))) * (1 - inner * 0.3);
    return jitter(col('#f4f6ee'), r, 0.02, 0.05, 0.05).multiplyScalar(shade * (0.9 + r() * 0.16));
  };
  const flowerAt = (base: THREE.Vector3, dir: THREE.Vector3, len: number, birth: number) => {
    const p = base.clone().addScaledVector(dir, len * (0.35 + r() * 0.6));
    const out = m.out(p);
    p.addScaledVector(out, 0.006 + r() * 0.006);
    const n = out.clone().add(V((r() - 0.5) * 0.9, (r() - 0.5) * 0.9 + 0.2, (r() - 0.5) * 0.9)).normalize();
    const c = col('#ffffff', 0.9 + r() * 0.1);
    faceCard(flowers, p, n, 0.018 + r() * 0.005, r() * 6.28, uvCell(2, 2, r() < 0.2 ? 3 : Math.floor(r() * 3)), c, clamp(birth + 0.02), base, m.sway(p), n.clone().lerp(V(0, 1, 0), 0.4).normalize());
  };

  const BL = 0.165;
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.8 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    // Branchlets: the bulk of the shell.
    for (let k = 0; k < 3; k++) {
      const at = along(tw.pts, lerp(0.35, 0.95, (k + r() * 0.8) / 3)).p;
      const dir = sprigDir(r, out, 0.7 + r() * 0.7, 0.22);
      const birth = born();
      const len = BL * (0.8 + r() * 0.4);
      sprig(leaves, r, m, at, dir, len, len, CELLS[Math.floor(r() * 2)], tint(at, 0.2), birth, { curl: (r() - 0.3) * 0.5, faceOut: 0.85 });
      for (let f = 0; f < 2; f++) if (r() < 0.5) flowerAt(at, dir.clone().add(V((r() - 0.5) * 0.6, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6)).normalize(), len, birth);
    }
    // Single shoots standing out of the surface.
    for (let k = 0; k < 2; k++) {
      const at = along(tw.pts, 0.6 + r() * 0.4).p;
      const dir = sprigDir(r, out, 0.3 + r() * 0.6, 0.25);
      const len = L * (0.75 + r() * 0.4);
      sprig(leaves, r, m, at, dir, len, W * (len / L), CELLS[2 + Math.floor(r() * 4)], tint(at, 0), born(), { cross: k === 0, curl: (r() - 0.3) * 0.4, faceOut: 0.7 });
    }
    // The leader at the twig end.
    const dir = out.clone().lerp(V(0, 1, 0), 0.25).add(V((r() - 0.5) * 0.5, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5)).normalize();
    sprig(leaves, r, m, end, dir, L * (0.7 + r() * 0.3), W, CELLS[2 + Math.floor(r() * 4)], tint(end, 0), tw.birth, { cross: true, curl: 0.1, faceOut: 0.5 });
    if (r() < 0.4) flowerAt(end, dir, L * 0.6, tw.birth);
  }
  // Inner foliage along the limbs, so the shrub is not hollow where the shell parts.
  for (const b of m.limbs) {
    for (let k = 0; k < 6; k++) {
      const at = along(b.pts, 0.3 + r() * 0.7).p;
      const dir = sprigDir(r, m.out(at), 0.8 + r() * 0.7, 0.3);
      sprig(leaves, r, m, at, dir, BL * 1.25, BL * 1.25, CELLS[Math.floor(r() * 2)], tint(at, 1), b.birth === 0 ? (r() < 0.75 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(),
    bark: { map: stemBark('gray') },
    look: { translucency: 0.25, leafRoughness: 0.8, bend: 0.06, flutter: 0.012 },
  };
};
