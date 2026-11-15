import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type PlantSpec, type SpeciesGeo } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, paintSprig, shellSprigs, simpleBark, swayFn, twigBirthLookup, type LeafStyle, type Shape, type SprigStyle,
} from './shared-shrubs-a';

/**
 * Japanese boxwood, Buxus microphylla var. japonica 'Winter Gem'. Tiny glossy
 * oval leaves in opposite pairs on fine twigs, medium green with yellow-green
 * new growth, foliage to the ground. Built either as the natural rounded
 * shrub or as a sheared hedge unit.
 */

const LEAF: LeafStyle = {
  p: 0.75, q: 0.5, aspect: 0.56,
  base: '#2c5519', dark: '#1a3811', light: '#6f9a26',
  midrib: 'rgba(150,185,95,0.45)', midribW: 0.03, gloss: 0.1,
};
const SPRIG: SprigStyle = { twig: '#77733f', twigW: 0.012, leafLen: 0.165, arrangement: 'opposite', nodes: 7, angle: 0.95, side: 3, height: 0.78 };

function boxwoodAtlas() {
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const row = Math.floor(i / 4);
    cells.push({
      x: (i % 4) * 256, y: row * 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) =>
        row < 2 ? paintSprig(g, r, w, LEAF, SPRIG, 0.1 + r() * 0.3, 0)
          : row === 2 ? paintSprig(g, r, w, LEAF, SPRIG, 0.75 + r() * 0.25, 0.1)
            : paintSprig(g, r, w, LEAF, { ...SPRIG, side: 2 }, 0, -0.55),
    });
  }
  return atlas('boxwood-atlas', 1024, 1024, cells);
}

export function buildBoxwood(spec: PlantSpec, sheared: boolean): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = boxwoodAtlas();

  let sh: Shape;
  if (sheared) {
    // A squarish footprint with eased corners: the app turns every plant to a random heading,
    // and sharp box corners would stick out of the hedge line.
    const a = (Sp / 2) * 0.93, top = H * 0.965, yc = H * 0.55, n = 7, m = 7;
    sh = {
      c: V(0, H * 0.45, 0), bound: H + Sp,
      f: (p) => Math.pow(Math.pow(Math.pow(Math.abs(p.x) / a, m) + Math.pow(Math.abs(p.z) / a, m), n / m) + Math.pow(Math.max(0, p.y - yc) / (top - yc), n), 1 / n),
    };
  } else {
    const a = (Sp / 2) * 0.98, top = H * 0.98, yc = H * 0.42, c = V(0, yc, 0);
    sh = {
      c, bound: H + Sp,
      f: (p) => {
        const rho = Math.hypot(p.x, p.z);
        const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.5) + Math.pow((p.y - yc) / (top - yc), 2.5), 0.4) : rho / (a * (1 - 0.12 * ((yc - p.y) / yc) ** 2));
        return v * (1 + 0.045 * (1 + lumps(p, c, 1.7)));
      },
    };
  }

  const frame = buildFrame(r, sh, sheared
    ? { H, Sp, stems: 6, stemBaseR: 0.05, stemR: 0.009, arch: 0.25, stemYMin: 0.3, secs: 44, twigs: 300, twigInset: 0.03 }
    : { H, Sp, stems: 10, stemBaseR: 0.09, stemR: 0.011, arch: 0.15, stemYMin: 0.14, secs: 70, twigs: 420, twigInset: 0.04 });
  const sway = swayFn(H, Sp);
  const twigCol = col('#aeb27c'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: sheared ? 0.25 : 0.25, color: (b) => (b.level === 2 ? twigCol : b.level === 1 ? barkCol.clone().lerp(twigCol, 0.4) : barkCol), uvScale: 2 });

  const birth = twigBirthLookup(frame.twigs);
  const white = new THREE.Color(1, 1, 1);
  shellSprigs(leaves, r, sh, {
    n: sheared ? 3700 : 4500,
    len: sheared ? [0.08, 0.1] : [0.09, 0.12],
    inset: sheared ? 0.05 : 0.1,
    tangent: sheared ? 0.72 : 0.55,
    up: sheared ? 0.12 : 0.3,
    nb: sheared ? 0.7 : 0.6,
    sway, birth, early: 0.76,
    cell: (depth, p) => {
      if (depth > 0.55) return at.uv[12 + Math.floor(r() * 4)];
      const fresh = (sheared ? 0.12 : 0.14) + 0.22 * clamp(p.y / H);
      return r() < fresh ? at.uv[8 + Math.floor(r() * 4)] : at.uv[Math.floor(r() * 8)];
    },
    color: (depth, p) => white.clone().multiplyScalar(lerp(1, 0.6, depth) * lerp(0.78, 1, clamp(p.y / (H * 0.7))) * (0.8 + r() * 0.16)),
  });
  // Shaded inner foliage so the plant is never a hollow shell (it shows most on a young plant).
  shellSprigs(leaves, r, sh, {
    n: sheared ? 500 : 700,
    len: [0.12, 0.16],
    inset: Math.min(H, Sp) * 0.3,
    tangent: 0.5, up: 0.3, nb: 0.6, sway, early: 1,
    birth: () => 0,
    cell: () => at.uv[12 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.75, 0.45, depth)),
  });

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('boxwood-bark', '#8f8672', '#5b5344', '#bdb39c') },
    look: { leafRoughness: 0.66, translucency: 0.25, bend: 0.03, flutter: 0.006, hedge: sheared },
  };
}
