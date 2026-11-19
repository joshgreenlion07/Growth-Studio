import { fbm, smooth, vnoise, voronoi } from './noise';
import { hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from './textures';

/**
 * Cast stone coping laid along a clad landing's edge (builder/landing.ts): one 24 in piece per repeat along u, a mortar
 * joint at each piece's end, and the profile unwrapped along v (meters of profile from the back's bottom). Coronado's
 * Chiseled Stone Sill as photographed: a fine-grained gray cast stone, chiseled into shallow overlapping facets with
 * small dark pits, soft lighter and darker clouds. Matte.
 */
const IN = 0.0254;

/*
 * Upright faces use the engine's wall calibration (WALL_GAIN in engine/surfaces.ts: rendered linear = gain * albedo in
 * the default light), so the texture's average albedo is the photo's mean divided by that gain.
 */
const GAIN: RGB = [1.68, 1.77, 2.0];
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function uprightMean(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => toLin(c / 255) / GAIN[i]) as RGB;
}

/**
 * A chiseled cast stone coping in `tones` (light to dark, sRGB hex), its average the photo's `swatch` color, pieces
 * `pieceIn` long with `jointIn` mortar joints. Keyed by `key` (painted on the page, not in the texture worker).
 */
export function chiseledCopingSet(key: string, tones: string[], swatch: string, pieceIn: number, jointIn: number): PBRSet {
  return textureSet(key, () => {
    const T = pieceIn * IN;
    const t = tones.map(hexRGB);
    const mortar = hexRGB('#77736d');
    return paint(512, T, 3, (u, v) => {
      // Inches along the piece from its joint, and down the profile.
      const x = u * pieceIn;
      const jx = Math.min(x, pieceIn - x);
      const joint = 1 - smooth(jointIn / 2 - 0.05, jointIn / 2 + 0.05, jx);
      // Chisel facets: overlapping cells about 1/2 to 1 in, each a flat tilted facet (its own shade), split by ridges.
      const f = voronoi(u, v, Math.round(pieceIn * 1.3), 151);
      const g = voronoi(u, v, Math.round(pieceIn * 3.1), 152);
      const facet = (f.id - 0.5) * 0.12 + (g.id - 0.5) * 0.06;
      const ridge = smooth(0.06, 0, f.f2 - f.f1) * 0.5 + smooth(0.05, 0, g.f2 - g.f1) * 0.3;
      const cloud = fbm(u, v, 3, 4, 153);
      const grain = vnoise(u * 520, v * 520, 520, 154);
      const pit = vnoise(u * 260, v * 260, 260, 155);
      let c = mixRGB(t[2] ?? t[0], t[0], smooth(0.3, 0.75, cloud));
      c = mixRGB(c, t[1] ?? t[0], smooth(0.55, 0.85, fbm(u, v, 7, 3, 156)) * 0.5);
      c = mulRGB(c, 1 + facet + ridge * 0.08 + (grain - 0.5) * 0.06 - (pit > 0.9 ? 0.35 * smooth(0.9, 0.96, pit) : 0));
      c = mixRGB(c, t[3] ?? t[t.length - 1], (pit > 0.93 ? 0.5 : 0));
      c = mixRGB(c, mortar, joint);
      const h = (1 - joint) * (0.55 + facet * 2 + ridge * 0.25 + grain * 0.06 - (pit > 0.9 ? 0.2 : 0));
      return { h, c, r: 0.9 - grain * 0.06 };
    }, uprightMean(swatch));
  });
}
