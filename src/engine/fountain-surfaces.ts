import { rng } from '../siteplan/geometry';
import { clamp01, fbm, smooth, vnoise } from './noise';
import { hexRGB, mixRGB, mulRGB, paint, paintPreviewing, textureSet, type PBRSet, type RGB } from './textures';

/**
 * Surfaces of the three-pillar water feature and its bowl planters (builder/pillarfountain.ts): the pillars' smooth
 * trowel stucco, the panels' split-face ledger stone and the bowls' patina. Painted in the texture worker like the
 * other surfaces (their keys are in WORKER_KEYS and texture-recipes.ts).
 */

const IN = 0.0254;

/*
 * Average albedos (linear), fitted so a render from the front photo's camera, graded to the photo's exposure and white
 * balance by the paving (which matches its Belgard swatch), shows the pillars, stone and bowls as photographed.
 */
const STUCCO_MEAN: RGB = [0.14, 0.118, 0.097];
const LEDGER_MEAN: RGB = [0.215, 0.146, 0.088];

/**
 * Smooth trowel (Santa Barbara) stucco: soft cloudy mottling in light and darker warm gray, curved trowel sweeps that
 * leave a burnished, lighter smear with a fine ridge at the blade's edge, and a few dark flecks. Low relief, a soft
 * sheen where it was burnished. 1.5 m repeat.
 */
export function pillarStuccoSet(): PBRSet {
  return textureSet('pf-stucco', () => {
    const N = 1024, T = 1.5;
    const tone = new Float32Array(N * N), ridge = new Float32Array(N * N);
    const r = rng('pf-stucco-strokes');
    // Sampled only for its stand-in color (see paintPreviewing): the strokes average out, skip them.
    const strokes = paintPreviewing() ? 0 : 300;
    // Trowel sweeps: arcs of 10-40 cm radius, 4-10 cm wide, painted in their own parameter space so each costs only its
    // area. Darker smears (where the trowel dragged) read more than the burnished lighter ones.
    for (let k = 0; k < strokes; k++) {
      const cx = r() * N, cy = r() * N;
      const R = (0.1 + r() * 0.3) * (N / T), w = (0.04 + r() * 0.06) * (N / T);
      const a0 = r() * Math.PI * 2, span = 0.35 + r() * 1.1;
      const s = (r() < 0.5 ? 1 : -1) * (0.35 + r() * 0.65);
      const steps = Math.ceil(span * R * 1.6), across = Math.ceil(w * 1.6);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, a = a0 + span * t;
        const ends = smooth(0, 0.18, t) * smooth(1, 0.7, t);
        const ca = Math.cos(a), sa = Math.sin(a);
        for (let j = 0; j <= across; j++) {
          const q = j / across; // 0 inner edge .. 1 blade edge
          const rr = R - w / 2 + q * w;
          const x = ((Math.round(cx + ca * rr) % N) + N) % N, y = ((Math.round(cy + sa * rr) % N) + N) % N;
          const o = y * N + x;
          // The smear fades in from the inside and stops at the blade edge, where a hairline ridge is left.
          const prof = smooth(0, 0.7, q) * (1 - smooth(0.85, 1, q));
          const v = s * prof * ends * (s < 0 ? 1.25 : 0.8);
          if (Math.abs(v) > Math.abs(tone[o])) tone[o] = v;
          if (q > 0.88 && s > 0) ridge[o] = Math.max(ridge[o], ends * smooth(0.88, 0.96, q) * (1 - smooth(0.96, 1, q)));
        }
      }
    }
    // Tones only: the average is set by STUCCO_MEAN. A taupe gray, a little cooler in the darker smudges.
    const light = hexRGB('#bfb9b4'), dark = hexRGB('#98938f'), cool = hexRGB('#a09f9f');
    return paint(N, T, 2.5, (u, v) => {
      const o = Math.min(N - 1, Math.floor(v * N)) * N + Math.min(N - 1, Math.floor(u * N));
      const cloud = fbm(u, v, 3, 5, 31);
      const blot = fbm(u, v, 9, 3, 37);
      const wisp = fbm(u, v, 14, 3, 39);
      const fine = vnoise(u * 420, v * 420, 420, 41);
      const fleck = vnoise(u * 700, v * 700, 700, 43);
      let c = mixRGB(dark, light, smooth(0.25, 0.75, cloud * 0.65 + blot * 0.35));
      c = mixRGB(c, cool, smooth(0.55, 0.8, fbm(u, v, 5, 3, 47)) * 0.3);
      c = mulRGB(c, 1 + tone[o] * 0.045 - smooth(0.6, 0.85, wisp) * 0.035 + (fine - 0.5) * 0.02 - (fleck > 0.94 ? 0.07 : 0));
      const h = 0.5 + blot * 0.1 + fine * 0.04 + ridge[o] * 0.06 - (fleck > 0.94 ? 0.15 : 0);
      return { h, c, r: 0.8 - Math.max(0, tone[o]) * 0.08 + fine * 0.05 };
    }, STUCCO_MEAN);
  });
}

/**
 * Split-face travertine ledger stone in 6 x 24 in panels: courses of strips 1 1/4 to 2 1/2 in tall, each strip a piece 2
 * 1/2 to 7 1/2 in long that stands proud of its neighbors by up to 3/4 in, with a rough cleft face, travertine bedding
 * lines and tight joints in shadow. Beige, tan, honey and taupe gray, a few cream and brown pieces. One 24 in repeat.
 */
export function ledgerStoneSet(): PBRSet {
  return textureSet('pf-ledger', () => {
    const T = 24 * IN, N = 1024;
    const r = rng('pf-ledger');
    // Courses: heights in inches summing to the 24 in repeat.
    const rows: { y0: number; y1: number; off: number; pieces: { x0: number; len: number; id: number }[] }[] = [];
    let y = 0;
    while (y < 24 - 0.5) {
      let h = 1.3 + r() * 1.2;
      if (24 - (y + h) < 1.3) h = 24 - y;
      // Pieces around the 24 in repeat from a random start, the last one cut to close the loop.
      const pieces: { x0: number; len: number; id: number }[] = [];
      let x = 0;
      while (x < 24) {
        let len = 2.5 + r() * 5;
        if (24 - (x + len) < 2) len = 24 - x;
        pieces.push({ x0: x, len, id: r() });
        x += len;
      }
      rows.push({ y0: y, y1: y + h, off: r() * 24, pieces });
      y += h;
    }
    // Tones only (the average is LEDGER_MEAN): beige, tan, honey, taupe gray, a few cream and a few brown pieces.
    const tones = ['#c9b8a2', '#c0a88c', '#b39a7e', '#aaa092', '#d3cbbf', '#a39282', '#94806c', '#bcab98'].map(hexRGB);
    const weights = [0.2, 0.18, 0.13, 0.13, 0.08, 0.1, 0.06, 0.12];
    const pick = (q: number) => {
      let s = 0;
      for (let i = 0; i < weights.length; i++) if ((s += weights[i]) >= q) return tones[i];
      return tones[0];
    };
    // The cleft face: rough relief at 1/4 to 3 in, sampled twice to light it from the sky above (the photos' look).
    const cleftAt = (u: number, v: number) => fbm(u, v, 8, 5, 61) * 0.75 + vnoise(u * 72, v * 30, 72, 63) * 0.25;
    return paint(N, T, 7, (u, v) => {
      // Canvas rows run top down and are flipped on upload: height in the panel is 1 - v.
      const X = u * 24, Y = (1 - v) * 24;
      // Ragged split edges: the joint lines wander with a coarse noise, up to about 1/4 in.
      const ragY = (vnoise(u * 48, v * 24, 48, 69) - 0.5) * 0.45, ragX = (vnoise(u * 30, v * 60, 30, 70) - 0.5) * 0.5;
      const Yr = Y + ragY;
      const row = rows.find((rw) => Yr >= rw.y0 && Yr < rw.y1) ?? (Yr < 0 ? rows[rows.length - 1] : rows[0]);
      const lxAll = (((X + ragX - row.off) % 24) + 24) % 24;
      const piece = row.pieces.find((p) => lxAll >= p.x0 && lxAll < p.x0 + p.len) ?? row.pieces[row.pieces.length - 1];
      const lx = lxAll - piece.x0;
      const rowH = row.y1 - row.y0;
      const ly = clamp01((Yr - row.y0) / rowH);
      const jy = Math.min(ly * rowH, (1 - ly) * rowH);
      const jx = Math.min(lx, piece.len - lx);
      const gap = 1 - smooth(0.04, 0.16, Math.min(jy, jx * 1.2));
      const d = 1 / N;
      const cl = cleftAt(u + piece.id * 0.37, v), up = cleftAt(u + piece.id * 0.37, v - d * 2), dn = cleftAt(u + piece.id * 0.37, v + d * 2);
      // Facets turned up to the sky are lighter, turned down darker.
      const slope = (up - dn) * 9;
      const pit = vnoise(u * 300, v * 300, 300, 65);
      const bed = vnoise(u * 6 + piece.id * 13, v * 160, 1e6, 67);
      let c = pick(piece.id);
      // Travertine shades within a piece as much as between pieces: honey and gray clouds, bedding streaks, pits.
      const swirl = fbm(u + piece.id, v, 8, 3, 66);
      c = mixRGB(c, pick(hashQ(piece.id * 7.3)), 0.5 * smooth(0.3, 0.75, swirl));
      c = mulRGB(c, 0.88 + (cl - 0.5) * 0.24 + (bed - 0.5) * 0.12 + Math.max(-0.14, Math.min(0.14, slope)) - (pit > 0.88 ? 0.25 * smooth(0.88, 0.94, pit) : 0));
      // Each strip's top edge catches the sky, its underside is in shade; joints are dark.
      c = mulRGB(c, 0.96 + smooth(0.6, 0.95, ly) * 0.07 - smooth(0.2, 0, ly) * 0.14);
      c = mixRGB(c, mulRGB([0.36, 0.32, 0.29], c[1] / 0.6), gap * 0.6);
      const h = (piece.id * 0.75 + cl * 0.6) * (1 - gap) + 0.02 - (pit > 0.88 ? 0.12 : 0);
      return { h, c, r: 0.88 - cl * 0.08 };
    }, LEDGER_MEAN);
  });
}

const hashQ = (x: number) => {
  const s = Math.sin(x * 91.3458) * 47453.5453;
  return s - Math.floor(s);
};

/**
 * The bowl's finish, painted around (u) and up (v: 0.02 at the foot, 0.8 at the rim's top, then down the inside wall to
 * 0.99 at the soil): a smooth dark slate bronze body, and a verdigris band over the upper third (from about 6 in up), the
 * rim and the inside, running a little way down the body in drips, with a lighter line along the rolled lip.
 */
export function patinaBowlSet(): PBRSet {
  return textureSet('pf-bowl', () => {
    // Verdigris in the photos reads as a soft gray-green teal, the body as near-black bronze.
    const body = hexRGB('#262628'), bodyLight = hexRGB('#323336'), teal = hexRGB('#435a4f'), tealLight = hexRGB('#5f7a6c'), tealDark = hexRGB('#2d3d36'), crust = hexRGB('#829487'), rimLight = hexRGB('#7f9488');
    return paint(512, 1, 3, (u, vr) => {
      const v = 1 - vr;
      const col = Math.floor(u * 96);
      const drip = hashQ(col * 1.7 + 3) < 0.3 ? hashQ(col * 3.1 + 1) * 0.12 : 0;
      const dripW = smooth(0.5, 0.15, Math.abs((u * 96 - col) - 0.5) * 2) * smooth(0.5, 0.9, fbm(u, v, 40, 2, 81));
      const edge = 0.54 + (fbm(u, 0.5, 8, 3, 71) - 0.5) * 0.05 - drip * dripW * 0.4;
      const patina = smooth(edge - 0.02, edge + 0.025, v);
      const mott = fbm(u, v, 12, 4, 73);
      const fleck = vnoise(u * 300, v * 140, 300, 75);
      let pc = mixRGB(tealDark, teal, smooth(0.25, 0.6, mott));
      pc = mixRGB(pc, tealLight, smooth(0.6, 0.85, mott) * 0.7);
      if (fleck > 0.9) pc = mixRGB(pc, crust, (fleck - 0.9) * 2.5);
      // The body: a smooth dark slate bronze, faintly clouded.
      let bc = mixRGB(body, bodyLight, smooth(0.3, 0.8, fbm(u, v, 6, 3, 77)));
      bc = mulRGB(bc, 0.95 + vnoise(u * 200, v * 60, 200, 79) * 0.08);
      // The rolled lip at the top catches the sky: a lighter line around the rim (v 0.74-0.8 along the profile).
      pc = mixRGB(pc, rimLight, smooth(0.755, 0.785, v) * smooth(0.83, 0.8, v) * 0.6);
      const c = mixRGB(bc, pc, patina);
      return { h: patina * (0.4 + mott * 0.25), c, r: 0.56 + patina * (0.18 + mott * 0.1) };
    });
  });
}
