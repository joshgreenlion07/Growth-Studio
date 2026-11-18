import { vnoise } from '../../engine/noise';
import { mulRGB, paint, textureSet } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import { box, IN, rbox, type DecorContext } from './kit';

/*
 * The job's deck box (its photo, against the house by the lawn): a store-bought resin storage box in taupe gray with
 * resin wicker panels set in a smooth frame (corner posts, top and bottom rails), a flat lid overhanging a little, and
 * a hand grip under the lid's front edge. About 48 x 22 x 28 in, read from its end against the lawn and the house's
 * siding; boxes of this kind hold about 100 gallons. Local x runs along it, +z is the front (lid opening side).
 */

/** Resin wicker: flat strands about 1/2 in wide in a basket weave, horizontal over vertical in a checker. */
const wicker = () => textureSet('decor:resin-wicker', () =>
  paint(256, 0.1016, 2.4, (u, v) => {
    const n = 8;
    const cx = Math.floor(u * n), cy = Math.floor(v * n);
    const fx = u * n - cx, fy = v * n - cy;
    const across = (cx + cy) % 2 === 0;
    // The strand on top in this cell, bowed toward its middle; dark where the strands dive under each other.
    const f = across ? fy : fx;
    const bow = Math.sin(Math.PI * (across ? fx : fy));
    const edge = Math.min(f, 1 - f);
    const h = Math.min(1, edge * 6) * (0.65 + 0.35 * bow);
    const tone = 0.9 + vnoise(u * 40, v * 40, 40, 41) * 0.12;
    const c = mulRGB([0.37, 0.345, 0.325], tone * (0.62 + 0.38 * h));
    return { h, c, r: 0.62 };
  }),
);

export function deckBox(c: DecorContext) {
  const [L, D] = c.spec.footprint;
  const H = 28 * IN;
  const resin = plainMaterial('decor:resin-taupe', { color: '#5d5753', roughness: 0.6 });
  const lidMat = plainMaterial('decor:resin-taupe-lid', { color: '#655f5a', roughness: 0.55 });
  const weave = pbrMaterial('decor:resin-wicker', wicker());
  const post = 3 * IN, rail = 2.75 * IN, lidT = 1.75 * IN;
  const bodyH = H - lidT;
  // Corner posts and the rails round the top and bottom.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(resin, rbox(post, bodyH, post, 0.006, sx * (L / 2 - post / 2), 0, sz * (D / 2 - post / 2)));
  for (const sz of [-1, 1]) for (const y of [0, bodyH - rail]) c.add(resin, box(L - 2 * post, rail, post * 0.8, 0, y, sz * (D / 2 - post * 0.4)));
  for (const sx of [-1, 1]) for (const y of [0, bodyH - rail]) c.add(resin, box(post * 0.8, rail, D - 2 * post, sx * (L / 2 - post * 0.4), y, 0));
  // Wicker panels set back in the frame, a solid core behind them.
  const inset = 0.35 * IN;
  c.add(resin, box(L - 2 * inset - 0.004, bodyH - 2 * rail + 0.01, D - 2 * inset - 0.004, 0, rail - 0.005, 0));
  const ph = bodyH - 2 * rail;
  for (const sz of [-1, 1]) c.add(weave, box(L - 2 * post, ph, 0.006, 0, rail, sz * (D / 2 - inset)));
  for (const sx of [-1, 1]) c.add(weave, box(0.006, ph, D - 2 * post, sx * (L / 2 - inset), rail, 0));
  // The lid, with the grip as a dark slot under its front edge.
  c.add(lidMat, rbox(L + 0.03, lidT, D + 0.03, 0.008, 0, bodyH, 0, 2));
  c.add(plainMaterial('decor:grip-shadow', { color: '#2e2b29', roughness: 0.9 }), box(L * 0.3, 0.012, 0.01, 0, bodyH - rail * 0.6, D / 2 - post * 0.35));
}
