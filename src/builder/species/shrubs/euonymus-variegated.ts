import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, paintSprig, rosette, shellSprigs, simpleBark, swayFn, tipOf, twigBirthLookup,
  type LeafStyle, type Shape, type SprigStyle,
} from './shared-shrubs-a';

/**
 * Golden euonymus, Euonymus japonicus 'Aureo-marginatus': an upright dense
 * shrub. Glossy oval leaves 1.5 to 3 in, in opposite pairs on green stems,
 * dark green centers with broad bright yellow margins (painted in the texture).
 */

const LEAF: LeafStyle = {
  p: 0.8, q: 0.62, aspect: 0.56,
  base: '#235018', dark: '#14360e', light: '#4d8526',
  margin: '#e8b400', marginIn: 0.6, center2: '#6a9040',
  midrib: 'rgba(196,214,120,0.6)', midribW: 0.022, gloss: 0.12,
  veins: 5, veinCol: 'rgba(255,255,220,0.08)',
};
const SPRIG: SprigStyle = { twig: '#5c8632', twigW: 0.02, leafLen: 0.27, arrangement: 'opposite', nodes: 4, angle: 0.85, height: 0.66, petiole: 0.02 };

function euonymusAtlas() {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    cells.push({
      x: (i % 4) * 256, y: row * 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) =>
        row === 2 ? paintSprig(g, r, w, LEAF, { ...SPRIG, nodes: 3 }, 0.05, -0.5) : paintSprig(g, r, w, LEAF, { ...SPRIG, nodes: 3 + Math.floor(r() * 2) }, row === 1 ? 0.6 + r() * 0.3 : 0.1 + r() * 0.25, 0),
    });
  }
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 768, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h - 12, -Math.PI / 2, { ...LEAF, aspect: 0.46 + r() * 0.05 }, { fresh: [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1][i], shade: (r() - 0.5) * 0.2 }),
    });
  }
  return atlas('euonymus-aureo-atlas', 1024, 1024, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = euonymusAtlas();

  const a = (Sp / 2) * 0.96, top = H * 0.96, sPeak = 0.45, c = V(0, H * 0.45, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.66 + 0.34 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.sqrt(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 2.5)));
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.085 * (1 + lumps(p, c, 2.9)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 8, stemBaseR: 0.1, stemR: 0.015, stemReach: 0.68, arch: 0.3, stemYMin: 0.35, secs: 90, twigs: 520, twigInset: 0.06 });
  const sway = swayFn(H, Sp);
  const green = col('#8fb556'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.5, color: (b) => (b.level === 2 ? green : b.level === 1 ? barkCol.clone().lerp(green, 0.6) : barkCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birth = twigBirthLookup(frame.twigs);
  shellSprigs(leaves, r, sh, {
    n: 3500, len: [0.19, 0.24], inset: 0.13, tangent: 0.5, up: 0.4, nb: 0.6, sway, birth, early: 0.75,
    cell: (depth, p) => (depth > 0.6 ? at.uv[8 + Math.floor(r() * 4)] : r() < 0.15 + 0.25 * clamp(p.y / H) ? at.uv[4 + Math.floor(r() * 4)] : at.uv[Math.floor(r() * 4)]),
    color: (depth, p) => white.clone().multiplyScalar(lerp(1, 0.62, depth) * lerp(0.8, 1, clamp(p.y / (H * 0.6))) * (0.84 + r() * 0.16)),
  });
  shellSprigs(leaves, r, sh, {
    n: 600, len: [0.22, 0.28], inset: Sp * 0.3, tangent: 0.5, up: 0.4, nb: 0.6, sway, early: 1, birth: () => 0,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.75, 0.45, depth)),
  });
  // Real leaves at the shoot tips: two opposite pairs, the upper pair young and brighter.
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.6).addScaledVector(dir, 0.4).add(V(0, 0.5, 0)).normalize();
    const tip = p.clone().addScaledVector(axis, 0.03);
    const lit = 0.88 + r() * 0.12;
    rosette(leaves, r, tip, axis, n, {
      n: 4, len: [0.068, 0.05], tilt: [1.05, 0.6], aspect: 0.5, opposite: true, nb: 0.4,
      uv: () => at.uv[12 + Math.floor(r() * 8)],
      color: () => white.clone().multiplyScalar(lit),
      birth: clamp(tw.birth + r() * 0.08, 0, 0.9), sway: sway(p),
    });
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('euonymus-bark', '#857c68', '#575040', '#aaa28c') },
    look: { leafRoughness: 0.55, translucency: 0.3, bend: 0.05, flutter: 0.01 },
  };
};
