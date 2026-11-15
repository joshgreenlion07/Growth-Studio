import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, rosette, shellSprigs, simpleBark, swayFn, tipOf,
  type LeafStyle, type Shape,
} from './shared-shrubs-a';

/**
 * Pittosporum tobira 'Wheeler's Dwarf': a low, wide, dense cushion. Leathery
 * glossy dark green spoon-shaped leaves, 2 to 3 in, with a pale midrib, held
 * in whorls at the branch tips. Every whorl here is real leaf geometry.
 */

const LEAF: LeafStyle = {
  p: 1.45, q: 0.42, aspect: 0.4,
  base: '#21451a', dark: '#12290c', light: '#55842a',
  midrib: 'rgba(170,198,112,0.8)', midribW: 0.017, gloss: 0.08,
  veins: 5, veinCol: 'rgba(200,225,150,0.1)',
};

function tobiraAtlas() {
  const cells = [];
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 0, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h - 12, -Math.PI / 2, { ...LEAF, aspect: 0.4 + r() * 0.06 }, { fresh: [0, 0.05, 0.12, 0.2, 0.3, 0.45, 0.7, 0.95][i], shade: (r() - 0.5) * 0.3 }),
    });
  }
  for (let i = 0; i < 4; i++) {
    cells.push({
      x: i * 256, y: 256, w: 256, h: 256,
      // A whole whorl seen from above, for the shaded layer under the real leaves.
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) => {
        const n = 9 + Math.floor(r() * 2), a0 = r() * 6.3;
        for (let k = 0; k < n; k++) paintLeaf(g, r, w / 2, w / 2, w * (0.4 + r() * 0.07), a0 + k * 2.39996, LEAF, { fresh: r() * 0.15, shade: -0.15 - r() * 0.3 });
        for (let k = 0; k < 4; k++) paintLeaf(g, r, w / 2, w / 2, w * (0.2 + r() * 0.06), a0 + 1 + k * 1.7, LEAF, { fresh: 0.3, shade: -0.1 });
      },
    });
  }
  return atlas('tobira-atlas', 1024, 512, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = tobiraAtlas();

  const a = (Sp / 2) * 1.0, top = H * 0.97, yc = H * 0.3, c = V(0, yc, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const rho = Math.hypot(p.x, p.z);
      const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.3) + Math.pow((p.y - yc) / (top - yc), 2.3), 1 / 2.3) : rho / (a * (1 - 0.1 * ((yc - p.y) / yc) ** 2));
      return v * (1 + 0.035 * (1 + lumps(p, c, 4.2)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 9, stemBaseR: 0.1, stemR: 0.013, arch: 0.1, stemYMin: 0.3, secs: 70, twigs: 520, twigInset: 0.045, early: 0.9 });
  const sway = swayFn(H, Sp);
  const twigCol = col('#b3a780'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.2, color: (b) => (b.level === 2 ? twigCol : barkCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.75).addScaledVector(dir, 0.35).add(V(0, 0.35, 0)).normalize();
    const lit = lerp(0.74, 1, clamp(p.y / (H * 0.6))) * (0.85 + r() * 0.15);
    const fresh = r() < 0.3;
    rosette(leaves, r, p, axis, n, {
      n: 7, len: [0.074, 0.046], tilt: [1.3, 0.45], aspect: 0.5, curled: 1, curl: 0.55, nb: 0.4,
      uv: () => at.uv[Math.floor(r() * 5)],
      color: (i) => white.clone().multiplyScalar(lit * lerp(0.8, 1, i / 6)),
      birth: clamp(tw.birth + r() * 0.06, 0, 0.9), sway: sway(p),
    });
    // The young leaves in the middle of the whorl.
    rosette(leaves, r, p.clone().addScaledVector(axis, 0.004), axis, n, {
      n: 2, len: [0.036, 0.028], tilt: [0.5, 0.25], aspect: 0.5, nb: 0.4,
      uv: () => at.uv[fresh ? 6 + Math.floor(r() * 2) : 4 + Math.floor(r() * 2)],
      color: () => white.clone().multiplyScalar(lit),
      birth: clamp(tw.birth + 0.05, 0, 0.9), sway: sway(p),
    });
  }
  // Older whorls underneath, in shade, so the cushion reads solid.
  shellSprigs(leaves, r, sh, {
    n: 1300, len: [0.17, 0.21], inset: 0.13, tangent: 0.9, up: 0.04, nb: 0.6, sway, birth: () => 0, early: 1,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.9, 0.5, depth)),
  });

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('tobira-bark', '#7d7362', '#4d4538', '#a69c86') },
    look: { leafRoughness: 0.72, translucency: 0.15, bend: 0.025, flutter: 0.004 },
  };
};
