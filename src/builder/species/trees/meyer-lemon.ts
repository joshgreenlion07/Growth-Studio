import * as THREE from 'three';
import { leafTexture, rng, type SpeciesBuilder } from '../kit';
import { buildCitrus, citrusBark, paintBlossom, paintBud, paintCalyx, paintPeel, paintShoot, type LeafPaint, type ShootStyle } from './shared-standards';

/**
 * Meyer lemon, Citrus x meyeri 'Improved Meyer', sold as a 15 gal standard:
 * one clean trunk with the head starting about 2 ft up, a dense rounded head
 * of dark glossy elliptic leaves (2.5 to 4 in) whose new growth comes in
 * tinged purple-bronze, purple-tinted buds opening to white flowers, and
 * fruit rounder than a true lemon, 2 to 3 in, smooth thin rind ripening deep
 * yellow to egg-yolk yellow-orange. Nearly thornless. Shown with ripe fruit,
 * a few green ones and a light bloom (it flowers nearly all year).
 *
 * References:
 *  - UC Riverside Citrus Variety Collection, Improved Meyer (CRC 3737),
 *    https://citrusvariety.ucr.edu/crc3737 : "shrubby, relatively small at
 *    maturity", "small to medium in size, spreading", "nearly thornless",
 *    "flowers and new shoots purple-tinted", fruit "short-elliptical",
 *    rind "smooth, thin, yellow-orange".
 *  - Rogers Gardens plant library, Improved Meyer Lemon,
 *    https://plants.rogersgardens.com/12290002/Plant/17810/Improved_Meyer_Lemon :
 *    about 10 ft tall, 12 ft spread at maturity, canopy clearance about 2 ft,
 *    glossy oval dark green leaves, white star-shaped flowers.
 *  - Simply Trees / Fast Growing Trees / Eden Brothers listings: 5 (6) to
 *    10 ft tall in the ground, kept smaller by pruning.
 *  - UF/IFAS Gardening Solutions, Meyer Lemon: dark green leaves, rich
 *    orange-yellow fruit, mostly fall and winter.
 * Catalog: 15 gal standard 1.5 m x 0.75 m (about 5 x 2.5 ft, trunk about
 * 21 in), mature 3.0 m x 2.7 m (about 10 x 9 ft) in 7 years, a standard kept
 * from sprawling to the full 12 ft spread of an unpruned bush.
 */

const OLD: LeafPaint = { dark: '#1d3c18', lit: '#2a5122', gloss: '#d4e4b8', shine: 0.26, rib: '#5d8040', vein: 'rgba(100,140,72,0.32)', veins: 7, shade: 0 };
const UNDER: LeafPaint = { dark: '#46692e', lit: '#557a36', gloss: '#c8d8a8', shine: 0.08, rib: '#89a860', vein: 'rgba(150,180,110,0.4)', veins: 7, shade: 0 };
const FRESH: LeafPaint = { dark: '#557f2c', lit: '#6b9636', gloss: '#e0ecc0', shine: 0.2, rib: '#9cbc68', vein: 'rgba(160,196,110,0.35)', veins: 6, shade: 0 };
const FLUSH: LeafPaint = { dark: '#5e4232', lit: '#70503a', gloss: '#e6d0c0', shine: 0.22, rib: '#a07060', vein: 'rgba(170,120,100,0.3)', veins: 5, shade: 0 };
const BRONZE: LeafPaint = { dark: '#5c6230', lit: '#6e7638', gloss: '#e0d8b8', shine: 0.2, rib: '#9a9060', vein: 'rgba(160,150,100,0.3)', veins: 6, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number): ShootStyle {
  return {
    stem: '#4f6e30', stemW: 6, leafLen, widRatio: 0.48, nodes, petiole: 0.1, wing: 0.16, spread: [0.55, 1.05],
    shape: { widest: 0.42, base: 0.72, tipP: 1.5, tipQ: 1.15, teeth: 10, toothDepth: 0.05 },
    size: (t) => (t > 0.85 ? 0.75 : 1 - t * 0.15),
    paint,
  };
}

function meyerLeaves(): THREE.Texture {
  return leafTexture('meyer-lemon-leaves', 1024, 1024, (g) => {
    const r = rng('meyer-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : OLD, rr);
    const flush = (t: number, rr: () => number) => withShade(t > 0.88 ? FLUSH : t > 0.7 ? BRONZE : t > 0.5 ? FRESH : OLD, rr);
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        paintShoot(g, r, S / 2, S - 4, up - 0.5, S * 0.5, shoot(old(0.08), 6, 140));
        paintShoot(g, r, S / 2, S - 4, up + 0.48, S * 0.5, shoot(old(0.08), 6, 140));
        paintShoot(g, r, S / 2, S - 4, up + 0.04, S * 0.68, shoot(old(0.05), 7, 146));
      } else if (cell === 1) {
        paintShoot(g, r, S / 2, S - 4, up + 0.32, S * 0.56, shoot(old(0.12), 6, 142));
        paintShoot(g, r, S / 2, S - 4, up - 0.22, S * 0.66, shoot(old(0.08), 7, 146));
      } else if (cell === 2) {
        paintShoot(g, r, S / 2, S - 4, up - 0.45, S * 0.48, shoot(old(0.06), 6, 138));
        paintShoot(g, r, S / 2, S - 4, up + 0.42, S * 0.5, shoot(old(0.06), 6, 138));
        paintShoot(g, r, S / 2, S - 4, up, S * 0.72, shoot(flush, 8, 130));
      } else {
        paintShoot(g, r, S / 2, S - 4, up - 0.3, S * 0.6, shoot(old(0.35), 6, 146));
        paintShoot(g, r, S / 2, S - 4, up + 0.36, S * 0.56, shoot(old(0.3), 6, 140));
      }
      g.restore();
    }
  });
}

/** 4 x 2 atlas of 256 cells: ripe peel, lemon-yellow peel, green peel, calyx; flower, flower cluster, bud cluster, flowers and buds. */
function meyerFruit(): THREE.Texture {
  return leafTexture('meyer-lemon-fruit', 1024, 512, (g) => {
    const r = rng('meyer-fruit');
    const S = 256;
    paintPeel(g, r, 0, 0, S, '#ec9c12', '#e07e0a', '#ffcc50', '#a0640a');
    paintPeel(g, r, S, 0, S, '#efb21a', '#e49412', '#ffda6a', '#a87c10');
    paintPeel(g, r, S * 2, 0, S, '#9aa834', '#c0b030', '#d0d870', '#5a6a1c');
    paintCalyx(g, S * 3.5, S * 0.5, S * 0.4);
    const purple = '#9a4f86';
    paintBlossom(g, r, S * 0.5, S * 1.5, S * 0.46, purple, 0.45);
    paintBlossom(g, r, S * 1.3, S * 1.36, S * 0.25, purple, 0.4);
    paintBlossom(g, r, S * 1.7, S * 1.42, S * 0.24, purple, 0.4);
    paintBud(g, S * 1.42, S * 1.82, -1.9, S * 0.17, '#f1e6ea', '#a85488');
    paintBud(g, S * 1.62, S * 1.8, -1.2, S * 0.15, '#efe2e6', '#9c4a7e');
    for (let k = 0; k < 6; k++) paintBud(g, S * 2.5 + (r() - 0.5) * S * 0.3, S * 1.95, -Math.PI / 2 + (r() - 0.5) * 1.6, S * (0.2 + r() * 0.08), '#efe2e8', k % 2 ? '#a24f84' : '#b46a94');
    paintBlossom(g, r, S * 3.36, S * 1.4, S * 0.27, purple, 0.42);
    paintBud(g, S * 3.66, S * 1.7, -1.1, S * 0.17, '#f1e6ea', '#a85488');
    paintBud(g, S * 3.3, S * 1.82, -1.8, S * 0.16, '#efe2e6', '#9c4a7e');
  });
}

export const build: SpeciesBuilder = (spec) =>
  buildCitrus(spec, {
    key: 'meyer-lemon',
    head: {
      trunk: 0.4, bottom: 0.2, round: 2.3, lump: 0.03, shift: 0, scaffolds: 6, lean: [0.6, 0.95], low: 5, reach: 0.55, trunkR: 0.05,
      levels: [
        { count: [5, 6], from: 0.25, to: 1, angle: 0.65, angleVar: 0.25, len: 0.8, lenVar: 0.25, taperAlong: 0.8, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.3, up: 0.05, out: 0.25, early: 1, limit: [0.82, 0.92], minKeep: 0.3 },
        { perMeter: 9, from: 0.15, to: 1, angle: 0.75, angleVar: 0.25, len: 0.55, lenVar: 0.3, lenMin: 0.12, lenMax: 0.6, radius: 0.6, tip: 0.4, tipMin: 0.005, segs: 3, gnarl: 0.35, up: 0, out: 0.15, early: 0.92, limit: [0.9, 0.98], smooth: false },
        { perMeter: 14, from: 0.15, to: 1, angle: 0.8, angleVar: 0.3, len: 0.45, lenMin: 0.06, lenMax: 0.25, radius: 0.6, tip: 0.5, tipMin: 0.003, segs: 2, gnarl: 0.3, up: -0.05, early: 0.88, limit: [0.93, 1.0], smooth: false },
      ],
    },
    leaves: meyerLeaves,
    flush: 0.3,
    surface: 0.12,
    card: [0.28, 0.36],
    step: [0.04, 0.05],
    fruit: { rad: [0.028, 0.036], squash: 1.1, count: 56, top: 0.55, early: 10, cells: [[0, 6], [1, 3], [2, 1.2]], segs: [9, 6] },
    blooms: 40,
    bloomSize: [0.06, 0.09],
    fruitMap: meyerFruit,
    bark: () => citrusBark('meyer-bark', '#5f5a4b'),
    barkTint: '#ffffff',
    twigTint: '#8fae64',
    look: { translucency: 0.25, leafRoughness: 0.85, bend: 0.1, flutter: 0.012 },
  });
