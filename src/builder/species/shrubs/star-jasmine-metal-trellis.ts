import { POT_TRELLIS as T } from '../../../siteplan/yard';
import { V, col, type GeoBuilder, type SpeciesBuilder } from '../kit';
import { board, buildStarJasmine, type JasmineSupport } from './star-jasmine-trellis';

/**
 * Star jasmine, Trachelospermum jasminoides, as a 2 gal staked vine trained on a 48 in metal pot trellis: the pot
 * and trellis sheet's planting (the tall brown pot, and the same trellis at a fence for a jasmine in the ground).
 * The vine is star-jasmine-trellis's (leaves, flowers, canes twining up the uprights, laterals tied along it, shoots
 * filling a flat screen); only its support and reach differ.
 *
 * The trellis (siteplan/yard.ts POT_TRELLIS, read from the sheet's photo): dark bronze 3/8 in flat bar, two nested
 * rectangular frames, the rear one taller and narrower (6 1/2 in wide, 34 in above the soil) and the front one wider
 * and lower (9 1/2 in, 30 in), and between the rear frame's uprights two arcs crossing into a chain of three pointed
 * ovals. Its legs run 14 in down into the soil as the stake. It is drawn with the plant, anchored, so it stands at
 * every growth stage.
 *
 * Size: 2 gal staked, about 28 in above the soil at install; kept pruned to about 6 in over the trellis and 20 in
 * wide (1.0 x 0.5 m) in about 3 years, an open screen the trellis shows through, as on the sheet's photo. In a container it stays there; trained on a fence it could be let run.
 * Orientation: like the lath-panel jasmine, back (local -Z) to the nearest fence or wall, unless the pot it stands in
 * turns it.
 */

const bronze = col('#3a2f26');

const METAL: JasmineSupport = {
  ZT: T.z,
  LW: T.bar,
  LT: T.thick,
  // Canes climb the front frame's uprights (outside) and the rear frame's (inside).
  ups: [-T.front.half, -T.rear.half, T.rear.half, T.front.half],
  // Laterals are trained along the bottom rail and at the ovals' crossings.
  rails: [T.rail, T.arcs.from + (T.arcs.to - T.arcs.from) / 3, T.arcs.from + (2 * (T.arcs.to - T.arcs.from)) / 3, T.front.top],
  TOP: T.rear.top,
  HALF: T.front.half,
  k: 1.0 / 2.1,
  // A staked vine kept trained to its trellis: an open screen the trellis shows through, as on the sheet's photo.
  fill: 0.22,
  loose: 10,
  spray: 0.3,
  draw(wood: GeoBuilder) {
    const FRONT = V(0, 0, 1);
    const bar = (x0: number, y0: number, x1: number, y1: number, z: number) => board(wood, V(x0, y0, z), V(x1, y1, z), T.bar, T.thick, FRONT, bronze, 2);
    for (const f of [T.rear, T.front]) {
      const z = T.z + f.dz;
      for (const sx of [-1, 1]) bar(sx * f.half, -T.stake, sx * f.half, f.top + T.bar / 2, z);
      bar(-f.half - T.bar / 2, f.top, f.half + T.bar / 2, f.top, z);
      bar(-f.half, T.rail, f.half, T.rail, z);
    }
    // The chain of ovals: x = +/- A sin(pi n t) up the run, crossing at the middle at every node.
    const A = T.rear.half - T.bar / 2, n = T.arcs.ovals, steps = 36;
    const z = T.z + T.rear.dz;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const y0 = T.arcs.from + (T.arcs.to - T.arcs.from) * t0, y1 = T.arcs.from + (T.arcs.to - T.arcs.from) * t1;
        bar(sd * A * Math.sin(Math.PI * n * t0), y0, sd * A * Math.sin(Math.PI * n * t1), y1, z);
      }
    }
  },
};

export const build: SpeciesBuilder = (spec) => buildStarJasmine(spec, METAL);
