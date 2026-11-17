import * as THREE from 'three';
import { leafTexture, rng, type SpeciesBuilder } from '../kit';
import { buildCitrus, citrusBark, paintBlossom, paintBud, paintCalyx, paintPeel, paintShoot, type LeafPaint, type ShootStyle } from './shared-standards';

/**
 * Mexican lime (Key lime, West Indian lime), Citrus aurantiifolia, sold as a
 * 15 gal tree: a short trunk under a shrubby, bushy head, more irregular and
 * spreading than a lemon, dense with short twigs armed with small slender
 * spines; small pale to mid green leaves (2 to 3 in), broadly lanceolate and
 * blunt-pointed, on clearly winged petioles; small pure white flowers; and
 * many small round fruit, about 1.5 in, picked green (greenish-yellow when
 * fully ripe). Shown in fruit with a light bloom.
 *
 * References:
 *  - UC Riverside Citrus Variety Collection, Mexican lime (CRC 1710),
 *    https://citrusvariety.ucr.edu/crc1710 : trees "moderately-sized and
 *    bushy, almost shrub-like"; "medium in vigor and size, spreading and
 *    bushy"; branchlets "densely armed with small, slender spines"; leaves
 *    "small, pale green, broadly lanceolate, blunt-pointed" with "definitely
 *    winged petioles"; blossoms "pure white"; fruit "approximately one and
 *    one-half inches in diameter", "almost round", rind greenish-yellow.
 *  - Four Winds Growers, Mexican Key Lime,
 *    https://www.fourwindsgrowers.com/products/mexican-key-lime-bush :
 *    8 to 10 ft in the ground, 4 to 8 ft in pots; zones 8 to 11.
 *  - Older references cited with UCR: 6.5 to 13 ft (2 to 4 m), may be shrubby.
 * Catalog: 15 gal 1.5 m x 0.8 m (about 5 x 2.6 ft, trunk about 16 in),
 * mature 3.0 m x 3.0 m (about 10 x 10 ft) in 7 years; the head starts lower
 * and spreads wider than the Meyer lemon's.
 */

const OLD: LeafPaint = { dark: '#30592a', lit: '#3f6a30', gloss: '#dceac0', shine: 0.2, rib: '#86a85a', vein: 'rgba(140,176,100,0.3)', veins: 6, shade: 0 };
const PALE: LeafPaint = { dark: '#436e30', lit: '#517c38', gloss: '#e2eec8', shine: 0.18, rib: '#98b86a', vein: 'rgba(160,190,110,0.3)', veins: 6, shade: 0 };
const UNDER: LeafPaint = { dark: '#5f8240', lit: '#6c8e48', gloss: '#d0dcb0', shine: 0.06, rib: '#a6c07a', vein: 'rgba(170,196,130,0.4)', veins: 6, shade: 0 };
const FRESH: LeafPaint = { dark: '#6f9a34', lit: '#82ac3e', gloss: '#eaf2c8', shine: 0.16, rib: '#b2cc78', vein: 'rgba(190,214,130,0.3)', veins: 5, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number, thorn = 0.75): ShootStyle {
  return {
    stem: '#55753a', stemW: 4.5, leafLen, widRatio: 0.5, nodes, petiole: 0.17, wing: 0.3, spread: [0.6, 1.15],
    shape: { widest: 0.44, base: 0.6, tipP: 1.9, tipQ: 0.8 },
    thorn, thornLen: 0.13, thornColor: '#43602c',
    size: (t) => (t > 0.85 ? 0.7 : 1 - t * 0.2),
    paint,
  };
}

function limeLeaves(): THREE.Texture {
  return leafTexture('mexican-lime-leaves', 1024, 1024, (g) => {
    const r = rng('lime-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : rr() < 0.35 ? PALE : OLD, rr);
    const fresh = (t: number, rr: () => number) => withShade(t > 0.55 ? FRESH : rr() < 0.5 ? PALE : OLD, rr);
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        for (const [a, l] of [[-0.75, 0.42], [0.72, 0.42], [-0.3, 0.6], [0.3, 0.58], [0, 0.7]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.1), 6, 100));
      } else if (cell === 1) {
        for (const [a, l] of [[0.55, 0.5], [-0.45, 0.58], [0.08, 0.7]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.12), 7, 104));
      } else if (cell === 2) {
        for (const [a, l] of [[-0.6, 0.46], [0.55, 0.48]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.08), 6, 100));
        paintShoot(g, r, S / 2, S - 4, up + 0.05, S * 0.72, shoot(fresh, 8, 96, 0.4));
      } else {
        // Twiggy: short spiny side twigs with few leaves.
        for (const [a, l] of [[-0.85, 0.36], [0.8, 0.38], [-0.35, 0.52], [0.4, 0.5], [0, 0.68]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.3), 4, 98, 1));
      }
      g.restore();
    }
  });
}

/** 4 x 2 atlas of 256 cells: green peel, light green peel, yellow-green peel, calyx; flower, flower cluster, bud cluster, flowers and buds. */
function limeFruit(): THREE.Texture {
  return leafTexture('mexican-lime-fruit', 1024, 512, (g) => {
    const r = rng('lime-fruit');
    const S = 256;
    paintPeel(g, r, 0, 0, S, '#62a02a', '#70a42c', '#a0cc60', '#3a6418');
    paintPeel(g, r, S, 0, S, '#8cb434', '#9cb838', '#bcd870', '#567a1c');
    paintPeel(g, r, S * 2, 0, S, '#c4c840', '#d0c23c', '#e4e480', '#7e861e');
    paintCalyx(g, S * 3.5, S * 0.5, S * 0.4);
    const tint = '#d8dcb0';
    paintBlossom(g, r, S * 0.5, S * 1.5, S * 0.44, tint, 0.3);
    paintBlossom(g, r, S * 1.3, S * 1.36, S * 0.24, tint, 0.3);
    paintBlossom(g, r, S * 1.7, S * 1.44, S * 0.23, tint, 0.3);
    paintBud(g, S * 1.45, S * 1.82, -1.9, S * 0.15, '#eef0e0', '#f8f8ee');
    paintBud(g, S * 1.62, S * 1.8, -1.2, S * 0.14, '#eef0e0', '#f8f8ee');
    for (let k = 0; k < 6; k++) paintBud(g, S * 2.5 + (r() - 0.5) * S * 0.3, S * 1.95, -Math.PI / 2 + (r() - 0.5) * 1.6, S * (0.17 + r() * 0.07), '#e6ecd2', '#fafaf2');
    paintBlossom(g, r, S * 3.36, S * 1.4, S * 0.26, tint, 0.3);
    paintBud(g, S * 3.66, S * 1.7, -1.1, S * 0.15, '#eef0e0', '#f8f8ee');
    paintBud(g, S * 3.3, S * 1.82, -1.8, S * 0.14, '#eef0e0', '#f8f8ee');
  });
}

export const build: SpeciesBuilder = (spec) =>
  buildCitrus(spec, {
    key: 'mexican-lime',
    head: {
      trunk: 0.27, bottom: 0.1, round: 2.2, lump: 0.08, shift: -0.1, scaffolds: 7, lean: [0.75, 1.15], low: 6, reach: 0.6, trunkR: 0.048,
      levels: [
        { count: [5, 6], from: 0.2, to: 1, angle: 0.8, angleVar: 0.3, len: 0.75, lenVar: 0.3, taperAlong: 0.8, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.45, up: 0.02, out: 0.3, early: 1, limit: [0.8, 0.92], minKeep: 0.3 },
        { perMeter: 10, from: 0.12, to: 1, angle: 0.85, angleVar: 0.3, len: 0.5, lenVar: 0.35, lenMin: 0.1, lenMax: 0.5, radius: 0.6, tip: 0.4, tipMin: 0.004, segs: 3, gnarl: 0.5, up: -0.02, out: 0.15, early: 0.92, limit: [0.9, 1.0], smooth: false },
        { perMeter: 13, from: 0.1, to: 1, angle: 0.9, angleVar: 0.35, len: 0.45, lenMin: 0.05, lenMax: 0.2, radius: 0.6, tip: 0.5, tipMin: 0.0025, segs: 2, gnarl: 0.45, up: -0.05, early: 0.88, limit: [0.93, 1.07], smooth: false },
      ],
    },
    leaves: limeLeaves,
    flush: 0.3,
    surface: 0.1,
    card: [0.24, 0.3],
    step: [0.036, 0.048],
    fruit: { rad: [0.017, 0.021], squash: 0.98, count: 130, top: 0.75, early: 18, cells: [[0, 6], [1, 3], [2, 1]], segs: [7, 5] },
    blooms: 30,
    bloomSize: [0.045, 0.065],
    fruitMap: limeFruit,
    bark: () => citrusBark('lime-bark', '#5f5a4a'),
    barkTint: '#ffffff',
    twigTint: '#94b068',
    look: { translucency: 0.3, leafRoughness: 0.85, bend: 0.12, flutter: 0.014 },
  });
