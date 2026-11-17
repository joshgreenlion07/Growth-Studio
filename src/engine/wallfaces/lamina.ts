import { hash } from '../textures';
import { chiseledStone, type StoneStyle } from './ashlar';
import type { WallFaceRecipe } from './types';

const IN = 0.0254;

/** Lamina's joints are wider and blacker than Ashlar's, its strips' edges wavier and rounder, its faces deeper. */
const LAMINA_STONE: StoneStyle = { J: 0.14, dark: 0.28, wave: 0.12, roll: 0.16, relief: 1.7 };

/**
 * Lamina Tandem: a layered, stacked-stone face. Each 7 in unit is two 3 1/2 in halves offset 2 5/8 in (the layout
 * draws the halves); each half is either one 3 1/2 in stone (two in five) or two strips of about 1 3/4 in, and about
 * half the strips, and some whole stones, are broken by a vertical joint, the two strips' joints never in line. Every
 * joint, real or cast, is a deep, near-black gap of about 1/4 in. The stones are chiseled like Ashlar Tandem's
 * (chiseledStone), each tipped a little and set at its own depth so the courses read as layered slabs.
 */
export const lamina: WallFaceRecipe = {
  normal: 9,
  // The Tandem cap has a smooth, flat top (only its front edge is chiseled): a plain cap reads truer than the rough one.
  roughCap: false,
  // Measured in the 3D view: the deep joints and tipped strips rendered Sienna and Pewter 20 to 30% darker than their photos.
  lift: 1.25,
  texel(t) {
    const w = t.w, x = t.x, y = t.y;
    const single = hash(t.id, 21) < 0.4;
    // The strips' line, a little off the middle; which strip (or the whole stone) the texel is in, from the bottom.
    const ys = single ? t.h : t.h / 2 + (hash(t.id, 22) - 0.5) * 0.3 * IN;
    const strip = y < ys ? 0 : 1;
    const y0 = strip ? ys : 0, y1 = strip ? t.h : ys;
    // A vertical joint across about half the strips (and a quarter of the whole stones), 4 in or more from either
    // end; the two strips' joints are kept apart along the face.
    let e = Math.min(t.edge, y - y0, y1 - y), k = strip;
    const room = w - 8 * IN;
    if (room > 0) {
      const p = hash(t.id, 23);
      const at = single ? 0.25 + p * 0.5 : strip ? p : (p + 0.35 + hash(t.id, 24) * 0.3) % 1;
      const cut = 4 * IN + at * room;
      if (hash(t.id, 25 + k) < (single ? 0.25 : 0.55)) {
        e = Math.min(e, Math.abs(x - cut));
        if (x > cut) k += 2;
      }
    }
    const sid = t.id * 5 + k;
    // Each stone tipped a little (its top edge proud or shy of its bottom) and set at its own depth.
    const ry = (y - y0) / Math.max(1e-6, y1 - y0);
    const lift = (hash(sid, 26) - 0.5) * 0.14 + (ry - 0.5) * (hash(sid, 27) - 0.5) * 0.24;
    return chiseledStone(t, sid, e, LAMINA_STONE, lift);
  },
};
