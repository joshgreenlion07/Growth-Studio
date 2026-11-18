import { fbm, smooth, voronoi, vnoise } from './noise';
import { paint, textureSet, type PBRSet, type RGB } from './textures';

/**
 * The grain of a boulder (builder/stonegeo.ts, builder/waterrock.ts): small pits, mineral specks, a soft blotch and fine
 * relief, in neutral gray. The boulder's own colors (stone, lichen, moss) live in its vertices and multiply this, so one
 * set serves every rock; the map's average is `ROCK_GRAIN_MEAN`, and the material scales it back up. Painted in the
 * texture worker (key `rk-grain`, see WORKER_KEYS and texture-recipes.ts). 0.9 m repeat.
 */
export const ROCK_GRAIN_MEAN = 0.5;
const MEAN: RGB = [ROCK_GRAIN_MEAN, ROCK_GRAIN_MEAN, ROCK_GRAIN_MEAN];

export function rockGrainSet(): PBRSet {
  return textureSet('rk-grain', () =>
    paint(512, 0.9, 3.5, (u, v) => {
      const blotch = fbm(u, v, 4, 5, 71);
      const fine = vnoise(u * 180, v * 180, 180, 5);
      const mid = fbm(u, v, 9, 3, 73);
      // Pits and bubbles: small dark cells, a few of them large.
      // Their outlines are warped, so none is a neat round dot.
      const wu = u + (fbm(u, v, 9, 3, 91) - 0.5) * 0.05, wv = v + (fbm(u, v, 9, 3, 93) - 0.5) * 0.05;
      const a = voronoi(wu, wv, 20, 77, 0.95);
      const b = voronoi(wu, wv, 56, 79, 0.95);
      const pitA = (1 - smooth(0.04, 0.14 + a.id * 0.14, a.f1)) * (a.id > 0.86 ? 1 : 0);
      const pitB = (1 - smooth(0.03, 0.1 + b.id * 0.06, b.f1)) * (b.id > 0.85 ? 0.6 : 0);
      const pit = Math.min(1, pitA + pitB);
      // Mineral specks, light and dark.
      const speck = fine > 0.86 ? 1.14 : fine < 0.12 ? 0.8 : 1;
      const lum = (0.94 + (blotch - 0.5) * 0.3 + (mid - 0.5) * 0.2) * speck * (1 - pit * 0.18);
      const h = 0.5 + (blotch - 0.5) * 0.2 + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.2 - pit * 0.35;
      return { h, c: [lum, lum * 0.992, lum * 0.985], r: 0.86 + (fine - 0.5) * 0.1 + pit * 0.05 };
    }, MEAN),
  );
}

/**
 * A more weathered grain for the boulders of a boulder waterfall (builder/cascadefall.ts): the same specks and blotch,
 * with many more pits and pockmarks, deeper and darker, some large, as on long-weathered stone. Same mean as
 * rockGrainSet, so the boulder material's scale holds. Painted in the texture worker (key `rk-pitted`).
 */
export function rockPittedSet(): PBRSet {
  return textureSet('rk-pitted', () =>
    paint(512, 0.9, 6, (u, v) => {
      const blotch = fbm(u, v, 4, 5, 171);
      const fine = vnoise(u * 180, v * 180, 180, 105);
      const mid = fbm(u, v, 9, 3, 173);
      const wu = u + (fbm(u, v, 9, 3, 191) - 0.5) * 0.06, wv = v + (fbm(u, v, 9, 3, 193) - 0.5) * 0.06;
      const a = voronoi(wu, wv, 14, 177, 0.95);
      const b = voronoi(wu, wv, 34, 179, 0.95);
      const c = voronoi(wu, wv, 80, 181, 0.95);
      const pitA = (1 - smooth(0.05, 0.2 + a.id * 0.16, a.f1)) * (a.id > 0.72 ? 1 : 0);
      const pitB = (1 - smooth(0.04, 0.16 + b.id * 0.1, b.f1)) * (b.id > 0.6 ? 0.85 : 0);
      const pitC = (1 - smooth(0.03, 0.12, c.f1)) * (c.id > 0.55 ? 0.5 : 0);
      const pit = Math.min(1, pitA + pitB + pitC);
      // A lighter worn rim round the bigger pits.
      const rim = smooth(0.18, 0.3, a.f1) * (1 - smooth(0.3, 0.42, a.f1)) * (a.id > 0.72 ? 1 : 0);
      const speck = fine > 0.86 ? 1.14 : fine < 0.12 ? 0.8 : 1;
      const lum = (0.96 + (blotch - 0.5) * 0.34 + (mid - 0.5) * 0.22 + rim * 0.08) * speck * (1 - pit * 0.42);
      const h = 0.5 + (blotch - 0.5) * 0.2 + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.2 - pit * 0.7 + rim * 0.06;
      return { h, c: [lum, lum * 0.99, lum * 0.98], r: 0.86 + (fine - 0.5) * 0.1 + pit * 0.08 };
    }, MEAN),
  );
}
