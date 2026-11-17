import { smooth } from '../noise';
import { hash, mulRGB } from '../textures';
import type { WallFaceRecipe } from './types';

/** Placeholder until this face is drawn: a plain face with dark joints. */
export const tumbledRough: WallFaceRecipe = {
  normal: 6,
  texel(t) {
    const J = 0.0025;
    if (t.edge < J) return { h: 0, c: mulRGB(t.joint, 0.6), r: 1 };
    const c = t.stone[Math.floor(hash(t.id, 1) * t.stone.length)];
    return { h: smooth(J, J + 0.004, t.edge), c, r: 0.85 };
  },
};
