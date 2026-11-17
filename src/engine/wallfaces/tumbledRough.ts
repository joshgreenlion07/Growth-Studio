import { clamp01, fbm, smooth, voronoi } from '../noise';
import { hash, mixRGB, mulRGB } from '../textures';
import { per, sat, tumbledOutline, type TumbledEdge } from './tumbled';
import type { WallFaceRecipe } from './types';

const IN = 0.0254;

/** Rustic wears like Grana but rougher: a raggeder outline and more, deeper chips. */
const RUSTIC_EDGE: TumbledEdge = {
  corner: 0.6 * IN, endGap: 0.15 * IN, wobble: 0.04 * IN, ragged: 0.025 * IN, chip: 0.45 * IN, chipCell: 0.8 * IN, chipOdds: 0.35,
};

/**
 * Castlemanor Rustic: rough-hewn and tumbled. A coarse, porous face of exposed grit and small pebbles, pitted and gently
 * lumpy, blotched in the blend's tones (charcoal and rust over the stone's own) with light and dark grains; the arrises
 * and corners rounded off by the tumbling, ragged and chipped, meeting the next unit in a thin dark gap.
 */
export const tumbledRough: WallFaceRecipe = {
  normal: 16,
  texel(t) {
    const T = t.T, id = t.id;
    const e = tumbledOutline(t, RUSTIC_EDGE);
    const J = 0.025 * IN; // half the dry joint's open gap where the units touch
    if (e.d < J) return { h: 0, c: mulRGB(t.joint, 0.3), r: 1 };
    // Broad lumps and the stone's rough skin: lumpy grit and small pebbles standing proud, the odd pore between.
    const lump = fbm(t.u + hash(id, 31) * 3, t.v + hash(id, 32) * 3, per(T, 0.05), 2, 40 + (id % 17));
    const knob = fbm(t.u, t.v, per(T, 0.02), 3, 44, 0.6);
    const g = voronoi(t.u, t.v, per(T, 0.005), 61, 1);
    const peb = 1 - smooth(0.05, 0.75, g.f1);
    const pebH = peb * (0.25 + 0.75 * g.id);
    const q = voronoi(t.u, t.v, per(T, 0.009), 63);
    const pr = 0.18 + 0.2 * hash(q.id, 2);
    const pore = hash(q.id, 1) < 0.2 ? 1 - smooth(pr * 0.45, pr, q.f1) : 0;
    // The arris: rounded over about 0.45 in, unevenly, its skin as rough as the face.
    const p = clamp01((e.d - J) / (0.45 * IN * (0.6 + 0.4 * hash(id, 30) + 0.6 * lump)));
    const round = Math.sin(p * Math.PI * 0.5);
    const skin = knob * 0.36 + pebH * 0.09 - pore * 0.08;
    const h = round * (0.5 + (lump - 0.5) * 0.25) + skin * (0.4 + 0.6 * p) - e.chip * (0.2 + g.id * 0.1);
    // Color: the stone's tone, blotched with charcoal and rust; grains lighter or darker than the paste around them.
    const S = t.stone;
    const base = mixRGB(S[Math.floor(hash(id, 1) * S.length)], S[Math.floor(hash(id, 2) * S.length)], 0.25);
    let c = sat(mulRGB(base, 0.88 + 0.24 * hash(id, 3)), 0.55 + hash(id, 4) * 0.8);
    const nb = per(T, 0.09);
    const b1 = fbm(t.u + hash(id, 5) * 7, t.v + hash(id, 6) * 7, nb, 3, 70 + (id % 31), 0.6);
    const b2 = fbm(t.u + hash(id, 7) * 7, t.v + hash(id, 8) * 7, nb, 3, 90 + (id % 29), 0.6);
    c = mixRGB(c, mulRGB(sat(c, 0.35), 0.72), smooth(0.3, 0.78, b1) * (0.45 + 0.5 * hash(id, 9)));
    c = mixRGB(c, mulRGB(sat(c, 1.45), 1.06), smooth(0.4, 0.72, b2) * (0.3 + 0.5 * hash(id, 10)));
    const gk = hash(g.id, 7);
    const light = mulRGB(sat(c, 0.5), 1.28);
    if (gk < 0.3) c = mixRGB(c, light, peb * (0.15 + gk * 1.5));
    else if (gk < 0.45) c = mixRGB(c, mulRGB(sat(c, 1.8), 1.05), peb * 0.5);
    else if (gk > 0.75) c = mixRGB(c, mulRGB(sat(c, 0.3), 0.75), peb * 0.6);
    // Grime settles in the hollows, the knobs are worn lighter.
    c = mulRGB(c, 0.78 + knob * 0.32 + pebH * 0.1);
    c = mulRGB(c, 1 - pore * 0.3);
    // Fresh fracture in the chips is lighter; the arris rolls into the gap's shade.
    c = mixRGB(c, light, e.chip * 0.3);
    c = mulRGB(c, 0.62 + 0.38 * smooth(0, 0.22, p));
    return { h, c, r: 0.93 + pore * 0.07 };
  },
};
