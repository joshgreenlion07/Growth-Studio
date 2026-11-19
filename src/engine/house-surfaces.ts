import * as THREE from 'three';
import { ROOFS, type RoofBlend, type RoofMaterial } from '../siteplan/houselooks';
import { fbm, smooth, vnoise } from './noise';
import { hash, hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from './textures';

/**
 * House surfaces (builder/house.ts): a neutral stucco tinted to the wall color by the material, and one painted set per
 * roof covering and color blend (siteplan/houselooks.ts). Roof maps are laid with u along the eave and v up the slope,
 * in meters, so courses run level and seams run up the roof.
 *
 * Painted in the texture worker: keys `house-stucco` and `house-roof:<covering>:<blend>` (texture-recipes.ts).
 */

/** Stucco with a light sand-float texture, near white: the material's color is the wall color. */
function paintNeutralStucco(): PBRSet {
  return paint(512, 2, 7, (u, v) => {
    const n = fbm(u, v, 8, 5, 3);
    const fine = vnoise(u * 300, v * 300, 300, 2);
    const trowel = fbm(u, v, 3, 3, 17);
    const g = 0.9 + n * 0.06 + fine * 0.05 - trowel * 0.03;
    return { h: n * 0.4 + fine * 0.6, c: [g, g * 0.997, g * 0.99], r: 0.93 };
  });
}

/** One color of a blend for a tile (or shingle), picked by its hash, with a slight shift of its own. */
function tileColor(mix: RGB[], id: number, shift: number): RGB {
  // Halfway to the blend's mean: a blend reads as one roof color with tile-to-tile variety, not a patchwork.
  const mean = mix.reduce((a, c) => [a[0] + c[0] / mix.length, a[1] + c[1] / mix.length, a[2] + c[2] / mix.length] as RGB, [0, 0, 0] as RGB);
  const c = mixRGB(mix[Math.floor(id * mix.length) % mix.length], mean, 0.45);
  return mulRGB(c, 0.96 + shift * 0.08);
}

/**
 * Flat concrete tile, slate profile: 13 in courses of 13 in wide tiles, every course half a tile over. Each tile's
 * butt edge stands proud of the course below and throws a thin shadow on it; the faces carry a slate-like grain and
 * the cement speckle of a concrete tile.
 */
function flatTile(blend: RoofBlend): PBRSet {
  const mix = blend.mix.map(hexRGB);
  const CW = 0.33, RH = 0.33, T = 2.64;
  return paint(1024, T, 9, (u, v) => {
    const x = u * T, y = (1 - v) * T;   // y up the slope
    const row = Math.floor(y / RH);
    const xs = x + (row % 2 ? CW / 2 : 0);
    const col = Math.floor(xs / CW);
    const ly = (y - row * RH) / RH;   // 0 at the butt edge, 1 under the next course
    const lx = (xs - col * CW) / CW;
    const id = hash(((col % 8) + 8) % 8, ((row % 8) + 8) % 8);
    const grain = fbm(u * 1.0, v * 3.0, 24, 3, 5);
    const speck = vnoise(u * 700, v * 700, 700, 9);
    const joint = Math.min(lx, 1 - lx) * CW;   // m to the side joint
    let c = tileColor(mix, id, hash(col + 31, row + 7));
    c = mixRGB(c, mulRGB(c, 0.86), grain * 0.5);
    c = mulRGB(c, 0.94 + speck * 0.1);
    // The butt edge of the course above throws its shadow on the top of this one; the joint is a thin dark line.
    const under = smooth(0.84, 1.0, ly);
    c = mulRGB(c, 1 - under * 0.42);
    if (joint < 0.004) c = mulRGB(c, 0.55);
    else if (joint < 0.008) c = mulRGB(c, 0.82);
    // Height: the tile thins from its butt edge upward; the next course sits on top.
    const h = (1 - ly) * 0.55 + grain * 0.08 + speck * 0.03 - (joint < 0.006 ? 0.25 : 0);
    return { h, c, r: 0.82 + speck * 0.1 };
  });
}

/** S-tile (barrel profile): rows of rounded pans and caps, 12 in courses, each tile its own shade of the blend. */
function sTile(blend: RoofBlend): PBRSet {
  const mix = blend.mix.map(hexRGB);
  const CW = 0.3, RH = 0.3, T = 2.4;
  return paint(1024, T, 12, (u, v) => {
    const x = u * T, y = (1 - v) * T;
    const row = Math.floor(y / RH);
    const col = Math.floor(x / CW);
    const ly = (y - row * RH) / RH;
    const lx = (x - col * CW) / CW;
    const id = hash(((col % 8) + 8) % 8, ((row % 8) + 8) % 8);
    // One S across each tile: a high round cap, then the pan.
    const prof = 0.5 + 0.5 * Math.cos(lx * Math.PI * 2);
    const speck = vnoise(u * 600, v * 600, 600, 4);
    const mottle = fbm(u, v, 10, 3, 21);
    let c = tileColor(mix, id, hash(col + 5, row + 13));
    c = mixRGB(c, mulRGB(c, 0.8), mottle * 0.6);
    c = mulRGB(c, (0.7 + prof * 0.35) * (0.95 + speck * 0.08));
    const under = smooth(0.8, 1.0, ly);
    c = mulRGB(c, 1 - under * 0.45);
    const h = prof * 0.9 + (1 - ly) * 0.35 + speck * 0.03;
    return { h, c, r: 0.78 + speck * 0.1 };
  });
}

/**
 * Architectural (laminated) shingle: 5 5/8 in courses of tabs of different widths, two layers so the shadow bands
 * vary, the granules speckled in the blend's colors.
 */
function shingle(blend: RoofBlend): PBRSet {
  const mix = blend.mix.map(hexRGB);
  const T = 2.0, RH = T / 14;
  return paint(1024, T, 6, (u, v) => {
    const x = u * T, y = (1 - v) * T;
    const row = Math.floor(y / RH);
    const ly = (y - row * RH) / RH;
    // Tabs: cut points along the row from the row's own hash.
    const off = hash(row, 3) * 0.3;
    let xx = x + off, tab = 0, w = 0.15 + hash(row, 0) * 0.25;
    while (xx > w) { xx -= w; tab++; w = 0.15 + hash(row * 7 + tab, tab) * 0.25; }
    const tid = hash(row * 13 + tab, 11);
    const dark = tid < 0.35;   // a dark shadow-band tab
    const speck = vnoise(u * 900, v * 900, 900, 3);
    const gran = vnoise(u * 300, v * 300, 300, 8);
    let c = mixRGB(mix[Math.floor(hash(tab + row * 3, 2) * mix.length) % mix.length], mix[Math.floor(speck * mix.length) % mix.length], 0.45);
    c = mulRGB(c, (dark ? 0.7 : 1) * (0.9 + gran * 0.2));
    const under = smooth(0.78, 1.0, ly);
    c = mulRGB(c, 1 - under * 0.5);
    const edge = Math.min(xx, w - xx) < 0.004;
    if (edge && ly < 0.6) c = mulRGB(c, 0.6);
    return { h: (1 - ly) * 0.6 + (dark ? -0.1 : 0) + gran * 0.05 - (edge ? 0.2 : 0), c, r: 0.92 };
  });
}

/** Standing-seam metal: 16 in panels, a raised seam up the slope between each, light striation in the panels. */
function metal(blend: RoofBlend): PBRSet {
  const base = hexRGB(blend.mix[0]);
  const PW = 0.406, T = 1.624;
  return paint(512, T, 14, (u, v) => {
    const x = u * T;
    const lx = (x % PW) / PW;
    const d = Math.min(lx, 1 - lx) * PW;   // m to the seam
    const seam = d < 0.012 ? 1 - d / 0.012 : 0;
    const stri = vnoise(u * 4, v * 60, 4, 6) * 0.5 + vnoise(u * 2, v * 200, 2, 9) * 0.5;
    const flute = Math.cos(lx * Math.PI * 2 * 3) * 0.5 + 0.5;
    let c = mulRGB(base, 0.94 + stri * 0.08);
    if (seam > 0) c = mulRGB(c, 1.06);
    return { h: seam * 1.4 + flute * 0.04, c, r: 0.42 + stri * 0.1 };
  });
}

function roofOf(id: string): { mat: RoofMaterial; blend: RoofBlend } {
  const [mid, bid] = id.split(':');
  const mat = ROOFS.find((r) => r.id === mid) ?? ROOFS[0];
  return { mat, blend: mat.blends.find((b) => b.id === bid) ?? mat.blends[0] };
}

/** `id` is "<covering>:<blend>". */
export function roofRecipe(id: string): PBRSet {
  const { mat, blend } = roofOf(id);
  switch (mat.id) {
    case 'concrete-s': return sTile(blend);
    case 'shingle': return shingle(blend);
    case 'metal': return metal(blend);
    default: return flatTile(blend);
  }
}

export const houseStucco = () => textureSet('house-stucco', paintNeutralStucco);
export const houseRoof = (covering: string, blend: string) => textureSet(`house-roof:${covering}:${blend}`, () => roofRecipe(`${covering}:${blend}`));

/**
 * What shows through a window: a dark room in the lower half of the map and horizontal blinds (slats, their gaps and
 * a bottom rail) in the upper half, with a lit version for night (the emissive map). Pane UVs put the blinds' bottom
 * rail at v = 0.5 and run 3 m of height per unit of v (house.ts), so each window shows its own share of blinds.
 */
let blindMaps: { map: THREE.Texture; glow: THREE.Texture } | null = null;
export function windowInteriorMaps(): { map: THREE.Texture; glow: THREE.Texture } {
  if (blindMaps) return blindMaps;
  const W = 64, H = 1024;
  const make = (night: boolean) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = 1 - (y + 0.5) / H;   // 0 bottom, 1 top
      for (let x = 0; x < W; x++) {
        let r: number, gg: number, b: number;
        if (v < 0.5) {
          // The room: dark, a little lighter low down where daylight falls on the floor.
          const k = night ? 0.78 + (0.5 - v) * 0.3 : 1 + (0.5 - v) * 0.5;
          r = 64 * k; gg = 62 * k; b = 60 * k;
          if (night) { r = 200 * k; gg = 160 * k; b = 110 * k; }
        } else {
          // Slats every 2.5 cm (1/120 of v), each a light band with a thin dark gap; the bottom rail is a bar.
          const m = (v - 0.5) * 3;   // m above the rail
          const p = (m / 0.025) % 1;
          const rail = m < 0.03;
          const gap = !rail && p > 0.82;
          const shade = rail ? 0.92 : gap ? 0.35 : 0.78 + 0.18 * (1 - p);
          if (night) { r = 255 * (gap ? 0.75 : 1) * 0.95; gg = 205 * (gap ? 0.75 : 1); b = 150 * (gap ? 0.75 : 1); }
          else { r = 215 * shade; gg = 210 * shade; b = 200 * shade; }
        }
        const o = (y * W + x) * 4;
        img.data[o] = Math.min(255, r);
        img.data[o + 1] = Math.min(255, gg);
        img.data[o + 2] = Math.min(255, b);
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  blindMaps = { map: make(false), glow: make(true) };
  return blindMaps;
}
