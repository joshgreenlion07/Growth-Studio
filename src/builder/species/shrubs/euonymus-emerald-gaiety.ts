import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, paintSprig, rosette, shellSprigs, simpleBark, swayFn, tipOf, twigBirthLookup,
  type LeafStyle, type Shape, type SprigStyle,
} from './shared-shrubs-a';

/**
 * Euonymus fortunei 'Emerald Gaiety', the white-edged wintercreeper grown as a
 * free-standing shrub: a dense, rounded, slightly wider-than-tall mound of
 * many fine green stems that lean out and touch down at the edge. Leaves in
 * opposite pairs, small (1 to 1 3/4 in), broadly oval to nearly round with a
 * blunt tip and a faintly round-toothed edge, glossy deep emerald green with
 * an irregular creamy-white margin of uneven width. In cold weather the white
 * margins flush pink; a share of leaves here carry that tinge. Flowers are
 * tiny and greenish and are not shown.
 *
 * References and the numbers they give:
 * - Monrovia, Emerald Gaiety Wintercreeper (monrovia.com/emerald-gaiety-wintercreeper.html):
 *   mounding evergreen shrub with a dense, erect habit; deep emerald green
 *   leaves edged in sparkling white, tinged pink in winter; 2 to 3 ft tall in
 *   10 years, eventually 4 to 5 ft tall and about 3 ft wide; moderate growth;
 *   stems root where they touch the ground.
 * - RHS, Euonymus fortunei 'Emerald Gaiety' (v) (rhs.org.uk/plants/97545):
 *   small bushy evergreen shrub, climbing against a wall; leaves rounded, with
 *   an irregular white margin, tinged pink in winter.
 * - NC State Extension Plant Toolbox, Euonymus fortunei 'Emerald Gaiety'
 *   (plants.ces.ncsu.edu/plants/euonymus-fortunei-emerald-gaiety/): bushy,
 *   dense, rounded to erect; slowly to about 5 ft, 3 to 5 ft wide; leaves
 *   opposite, ovate, glossy, finely toothed, about 1 3/4 in across, with
 *   white margins tinged pink in fall and winter; small greenish-white
 *   flowers in early summer.
 * Size used: a 1 gal at 0.25 m tall x 0.3 m wide; 0.9 m (3 ft) tall x 1.0 m
 * wide in eight years, Monrovia's 2 to 3 ft at 10 years with a little more
 * for the Central Valley's long season. Leaves 1.3 in average at maturity.
 */

const LEAF: LeafStyle = {
  p: 0.75, q: 0.55, aspect: 0.66,
  base: '#18401a', dark: '#0c2a0c', light: '#3a7226',
  margin: '#f1efe0', marginIn: 0.74, center2: '#3b6a2a',
  midrib: 'rgba(200,214,150,0.55)', midribW: 0.02, gloss: 0.18, wavy: 0.03,
  veins: 4, veinCol: 'rgba(255,255,230,0.07)',
};
/** The same leaf in winter color: the white edge flushed rose. */
const PINK: LeafStyle = { ...LEAF, margin: '#ecd2cc', center2: '#3f5e2a' };
const SPRIG: SprigStyle = { twig: '#6c8a3a', twigW: 0.018, leafLen: 0.24, arrangement: 'opposite', nodes: 5, angle: 0.95, height: 0.7, petiole: 0.01, side: 1 };

/**
 * Atlas 1024 x 1024: rows 0-1 sprigs (row 1 brighter new growth, one cell pink-edged), row 2 shaded sprigs,
 * row 3 single leaves (cells 12-19), the last two of those pink-edged.
 */
function gaietyAtlas() {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    const leaf = i === 7 || i === 3 ? PINK : LEAF;
    cells.push({
      x: (i % 4) * 256, y: row * 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) =>
        row === 2 ? paintSprig(g, r, w, leaf, { ...SPRIG, nodes: 4 }, 0.05, -0.45) : paintSprig(g, r, w, leaf, { ...SPRIG, nodes: 4 + Math.floor(r() * 2) }, row === 1 ? 0.45 + r() * 0.3 : 0.08 + r() * 0.2, 0),
    });
  }
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 768, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h * 0.78, -Math.PI / 2, { ...(i >= 6 ? PINK : LEAF), aspect: 0.6 + r() * 0.06 }, { fresh: [0, 0.08, 0.16, 0.3, 0.5, 0.75, 0.1, 0.3][i], shade: (r() - 0.5) * 0.2 }),
    });
  }
  return atlas('euonymus-emerald-gaiety-atlas', 1024, 1024, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = gaietyAtlas();

  // A dome a little wider than tall that comes down to the ground at the edge (the stems lean out and lie down).
  const a = (Sp / 2) * 0.97, top = H * 0.97, yc = H * 0.46, c = V(0, yc, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const rho = Math.hypot(p.x, p.z);
      const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.1) + Math.pow((p.y - yc) / (top - yc), 2.1), 1 / 2.1) : rho / (a * (1 - 0.2 * ((yc - p.y) / yc) ** 2));
      return v * (1 + 0.06 * (1 + lumps(p, c, 3.7)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 12, stemBaseR: 0.12, stemR: 0.009, stemReach: 0.6, arch: -0.05, stemYMin: 0.2, secs: 110, twigs: 640, twigInset: 0.035, early: 0.85 });
  const sway = swayFn(H, Sp);
  const green = col('#93ad5c'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.35, color: (b) => (b.level === 2 ? green : b.level === 1 ? barkCol.clone().lerp(green, 0.5) : barkCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birth = twigBirthLookup(frame.twigs);
  // The outer shell of leafy sprigs; new growth brighter toward the top.
  shellSprigs(leaves, r, sh, {
    n: 3400, len: [0.1, 0.13], inset: 0.07, tangent: 0.55, up: 0.35, nb: 0.6, sway, birth, early: 0.78,
    cell: (depth, p) => (depth > 0.6 ? at.uv[8 + Math.floor(r() * 4)] : r() < 0.18 + 0.25 * clamp(p.y / H) ? at.uv[4 + Math.floor(r() * 4)] : at.uv[Math.floor(r() * 4)]),
    color: (depth, p) => white.clone().multiplyScalar(lerp(1, 0.62, depth) * lerp(0.78, 1, clamp(p.y / (H * 0.6))) * (0.85 + r() * 0.15)),
  });
  // Shaded sprigs deep inside so the mound reads solid.
  shellSprigs(leaves, r, sh, {
    n: 700, len: [0.12, 0.15], inset: Sp * 0.25, tangent: 0.5, up: 0.35, nb: 0.6, sway, early: 1, birth: () => 0,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.72, 0.42, depth)),
  });
  // Real leaves at the shoot tips: two opposite pairs, crossing, the upper pair young and brighter.
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.6).addScaledVector(dir, 0.4).add(V(0, 0.45, 0)).normalize();
    const tip = p.clone().addScaledVector(axis, 0.015);
    const lit = 0.88 + r() * 0.12;
    const pinkTip = r() < 0.12;
    rosette(leaves, r, tip, axis, n, {
      n: 4, len: [0.046, 0.034], tilt: [1.1, 0.65], aspect: 0.5, opposite: true, nb: 0.4,
      uv: () => at.uv[pinkTip ? 18 + Math.floor(r() * 2) : 12 + Math.floor(r() * 6)],
      color: () => white.clone().multiplyScalar(lit),
      birth: clamp(tw.birth + r() * 0.08, 0, 0.9), sway: sway(p),
    });
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('euonymus-fortunei-bark', '#7f7a5e', '#535038', '#a8a488') },
    look: { leafRoughness: 0.5, translucency: 0.3, bend: 0.04, flutter: 0.008 },
  };
};
