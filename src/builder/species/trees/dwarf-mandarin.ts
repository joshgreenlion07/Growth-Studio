import * as THREE from 'three';
import { leafTexture, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { citrusBark, paintCalyx, paintPeel, paintShoot, type LeafPaint, type ShootStyle } from './shared-standards';
import { speckle } from './shared-trees-b';
import { buildCitrusVariety } from './shared-citrus';

/**
 * Mandarin orange on dwarfing rootstock, Citrus reticulata, sold as a 15 gal
 * standard. The species is kept generic (no cultivar): what the common
 * mandarins share. A clean trunk under a dense, rounded, compact head, closer
 * and finer-textured than an orange's, of narrow lanceolate leaves (about
 * 2 1/2 to 3 in) with acute tips, glossy and very dark green above, paler
 * beneath, on short, narrowly winged petioles; nearly thornless. Fruit small
 * and flattened (oblate), about 2 1/4 in across, the stem end and the apex a
 * little sunken, the thin rind smooth and glossy, finely pitted with oil
 * glands, deep reddish orange, hanging singly and in small clusters at the
 * outside of the head. Shown in its winter look: ripe fruit, no bloom (it
 * flowers in spring).
 *
 * References and the numbers they give:
 *  - UC Master Gardeners of Santa Clara County, Citrus
 *    (ucanr.edu/site/uc-master-gardeners-santa-clara-county/citrus): the only
 *    true dwarfing rootstock is Flying Dragon, "a 4 to 8-foot-tall tree";
 *    semi-dwarf trees need an 8 x 8 ft space; Satsuma mandarin is naturally
 *    small.
 *  - UC ANR Sacramento County citrus guide (via UC ANR search): dwarf trees
 *    6 to 10 ft, spaced 8 to 10 ft; San Diego Master Gardeners, Citrus for
 *    the home garden: Flying Dragon trees grow slowly to about 6 to 8 ft.
 *  - Four Winds Growers, Page Mandarin and Owari Satsuma
 *    (fourwindsgrowers.com/products/page-mandarin-tree,
 *    .../owari-satsuma-mandarin-tree): semi-dwarf, "Height at maturity:
 *    10'-15' in the ground/ 6'-8' in pots"; round, deep orange, thin rind.
 *  - Devil Mountain Nursery, Clementine Mandarin
 *    (devilmountainnursery.com/mandarin-clementine/): sold as a bush in 3/5
 *    gal and as a standard in 10/15 and 20/25 gal; "Leaves are dark green
 *    and waxy"; fruit "small, somewhat flattened".
 *  - Paradise Nursery (Los Angeles County Nursery), Tango Mandarin
 *    (paradisenursery.com/products/tango-mandarin-tree): "15 gal Standard -
 *    ~3ft tall & ~1" trunk"; 15 gal semi-dwarf about 2 ft.
 *  - UC Riverside Citrus Variety Collection, Dancy mandarin
 *    (citrusvariety.ucr.edu/crc3026): "densely-foliated", nearly thornless;
 *    fruit "oblate to obovoid", average "2 1/4 to 2 1/2 inches in diameter",
 *    apex usually depressed, rind thin, smooth and glossy, "deep
 *    reddish-orange"; CRC 3851 (a common mandarin): "dense foliage
 *    comprised of medium-sized, lanceolate leaves", fruit slightly oblate.
 *  - PROSEA Handbook 2, Citrus reticulata (prosea.prota4u.org, record
 *    1494): "small spiny tree with slender twigs; leaves broadly to narrowly
 *    lanceolate or elliptic with acute tip and base"; fruit "a depressed
 *    globose or subglobose berry, with thin, loose peel".
 *  - Australian Tropical Rainforest Plants (CSIRO), Citrus reticulata
 *    (apps.lucidcentral.org/rainforest): petioles narrowly winged, blades
 *    about 4.5-10 x 2.8-4 cm; fruit orange-red, depressed globose.
 *  - Photos (Wikimedia Commons): mandarins on the tree in Sochi and in
 *    Nordbaden, a young Satsuma in Maui (Starr), a market pile in Bangladesh:
 *    clusters of two to four, flattened, finely pitted bright orange rind,
 *    dark glossy pointed leaves.
 * Catalog: 15 gal standard 1.05 m x 0.8 m (about 3.4 x 2.6 ft, clear trunk
 * about 16 in and 1 in thick), between the nursery's ~3 ft and the 4.3-5 ft
 * of the other 15 gal citrus here; mature 2.4 m x 2.4 m (8 x 8 ft) in 8
 * years, the dwarf's 4-10 ft range at about its middle, the head as wide as
 * tall. The young tree carries leaves only: fruit comes with the grown head.
 */

const OLD: LeafPaint = { dark: '#15321a', lit: '#20451f', gloss: '#dcecc4', shine: 0.3, rib: '#557a3a', vein: 'rgba(92,132,66,0.28)', veins: 7, shade: 0 };
const DEEP: LeafPaint = { dark: '#112a14', lit: '#19391a', gloss: '#cce0b4', shine: 0.3, rib: '#4a6c32', vein: 'rgba(82,118,58,0.28)', veins: 7, shade: 0 };
const UNDER: LeafPaint = { dark: '#3d6230', lit: '#4a6f37', gloss: '#c4d4a8', shine: 0.08, rib: '#86a466', vein: 'rgba(140,172,108,0.4)', veins: 7, shade: 0 };
const FRESH: LeafPaint = { dark: '#4e7f2a', lit: '#5f9034', gloss: '#e2eec6', shine: 0.24, rib: '#98b866', vein: 'rgba(160,196,110,0.32)', veins: 6, shade: 0 };
const PALE: LeafPaint = { dark: '#6f9c3a', lit: '#80aa44', gloss: '#eaf2cc', shine: 0.18, rib: '#b0cc80', vein: 'rgba(190,214,136,0.3)', veins: 5, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number): ShootStyle {
  return {
    stem: '#41622a', stemW: 5, leafLen, widRatio: 0.41, nodes, petiole: 0.11, wing: 0.11, spread: [0.55, 1.05],
    // Lanceolate: widest a little below the middle, tapering to an acute tip and a wedge base; faintly crenulate.
    shape: { widest: 0.42, base: 0.92, tipP: 1.3, tipQ: 1.3, teeth: 11, toothDepth: 0.02 },
    thorn: 0.06, thornLen: 0.08, thornColor: '#3c5a26',
    size: (t) => (t > 0.85 ? 0.74 : 1 - t * 0.16),
    paint,
  };
}

function mandarinLeaves(): THREE.Texture {
  return leafTexture('dwarf-mandarin-leaves', 1024, 1024, (g) => {
    const r = rng('mandarin-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : rr() < 0.32 ? DEEP : OLD, rr);
    const flush = (t: number, rr: () => number) => withShade(t > 0.82 ? PALE : t > 0.55 ? FRESH : OLD, rr);
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      // Small leaves, closely set: four or five shoots to a spray.
      if (cell === 0) {
        for (const [a, l] of [[-0.72, 0.44], [0.7, 0.44], [-0.3, 0.6], [0.32, 0.58], [0.02, 0.7]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.05), 7, 122));
      } else if (cell === 1) {
        // Drooping: shoots arching over to one side.
        for (const [a, l] of [[0.6, 0.5], [-0.42, 0.6], [0.16, 0.68], [-0.8, 0.4]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.06), 8, 124));
      } else if (cell === 2) {
        for (const [a, l] of [[-0.62, 0.46], [0.58, 0.48], [-0.25, 0.56]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.06), 7, 120));
        paintShoot(g, r, S / 2, S - 4, up + 0.06, S * 0.72, shoot(flush, 9, 112));
      } else {
        for (const [a, l] of [[-0.4, 0.6], [0.42, 0.56], [0, 0.66]]) paintShoot(g, r, S / 2, S - 4, up + a, S * l, shoot(old(0.2), 7, 124));
      }
      g.restore();
    }
  });
}

/** Smooth glossy mandarin rind: fine oil-gland pits, a sunken, darker stem end at the top of the cell and a slightly sunken apex at the bottom. */
function mandarinPeel(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, S: number, base: string, blush: string, light: string, dark: string, stemGreen = 0) {
  paintPeel(g, r, x, y, S, base, blush, light, dark);
  // Fine pitting: small soft pits, lit on their upper rim.
  for (let i = 0; i < 1400; i++) {
    const px = x + r() * S, py = y + r() * S, s = 1.2 + r() * 2.2;
    g.fillStyle = 'rgba(110,40,0,0.12)';
    g.beginPath(); g.arc(px, py + s * 0.3, s, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(255,200,120,0.08)';
    g.beginPath(); g.arc(px, py - s * 0.3, s * 0.6, 0, 6.3); g.fill();
  }
  // Radial puckers toward the stem end, where the rind gathers.
  g.strokeStyle = 'rgba(120,46,0,0.14)';
  g.lineWidth = 1.4;
  for (let k = 0; k < 18; k++) {
    const px = x + ((k + r() * 0.6) / 18) * S;
    g.beginPath(); g.moveTo(px, y); g.lineTo(px + (r() - 0.5) * 6, y + S * (0.08 + r() * 0.07)); g.stroke();
  }
  if (stemGreen > 0) {
    // Fruit just colored: a green-yellow cap left at the stem end.
    const gr = g.createLinearGradient(x, y, x, y + S * 0.4);
    gr.addColorStop(0, `rgba(120,150,40,${stemGreen})`);
    gr.addColorStop(1, 'rgba(120,150,40,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, S, S * 0.4);
  }
  // The apex: a small darker style scar in a faint dimple.
  const ag = g.createLinearGradient(0, y + S * 0.9, 0, y + S);
  ag.addColorStop(0, 'rgba(140,50,0,0)');
  ag.addColorStop(1, 'rgba(120,48,6,0.5)');
  g.fillStyle = ag;
  g.fillRect(x, y + S * 0.9, S, S * 0.1);
  speckle(g, r, x, y + S * 0.95, S, S * 0.05, 120, ['rgba(90,40,0,0.4)', 'rgba(255,190,120,0.25)'], 1, 2.5);
}

/** 4 x 2 atlas of 256 cells: ripe peel, ripe peel (redder), peel just colored, calyx; the bottom row is unused (no bloom). */
function mandarinFruit(): THREE.Texture {
  return leafTexture('dwarf-mandarin-fruit', 1024, 512, (g) => {
    const r = rng('mandarin-fruit');
    const S = 256;
    mandarinPeel(g, r, 0, 0, S, '#ee5c00', '#dc4800', '#ff8a1c', '#9c3600');
    mandarinPeel(g, r, S, 0, S, '#e64e00', '#cc3c00', '#f87a12', '#902e00');
    mandarinPeel(g, r, S * 2, 0, S, '#f47e0a', '#e86a06', '#ffa636', '#a05006', 0.4);
    paintCalyx(g, S * 3.5, S * 0.5, S * 0.36);
  });
}

/** Oblate, about 0.8 times as tall as wide, with full shoulders, a sunken stem end and a slightly depressed apex. */
const mandarinProfile = (t: number): [number, number] => {
  const ph = t * Math.PI;
  // Fuller sides than a ball: the top and bottom flatten.
  const rr = Math.pow(Math.sin(ph), 0.82);
  const y = Math.cos(ph) * 0.8 - 0.09 * (1 - smoothstep(0, 0.16, t)) + 0.06 * smoothstep(0.86, 1, t);
  return [rr, y];
};

export const build: SpeciesBuilder = (spec) =>
  buildCitrusVariety(spec, {
    key: 'dwarf-mandarin',
    head: {
      trunk: 0.38, bottom: 0.12, round: 2.2, lump: 0.04, shift: -0.06, scaffolds: 6, lean: [0.7, 1.1], low: 6, reach: 0.58, trunkR: 0.045,
      levels: [
        { count: [5, 6], from: 0.25, to: 1, angle: 0.7, angleVar: 0.25, len: 0.8, lenVar: 0.25, taperAlong: 0.8, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.3, up: 0.02, out: 0.25, early: 1, limit: [0.82, 0.92], minKeep: 0.3 },
        { perMeter: 11, from: 0.15, to: 1, angle: 0.8, angleVar: 0.25, len: 0.55, lenVar: 0.3, lenMin: 0.1, lenMax: 0.5, radius: 0.6, tip: 0.4, tipMin: 0.004, segs: 3, gnarl: 0.35, up: -0.05, out: 0.15, early: 0.92, limit: [0.9, 0.98], smooth: false },
        { perMeter: 17, from: 0.12, to: 1, angle: 0.85, angleVar: 0.3, len: 0.45, lenMin: 0.05, lenMax: 0.2, radius: 0.6, tip: 0.5, tipMin: 0.0025, segs: 2, gnarl: 0.3, up: -0.08, early: 0.88, limit: [0.93, 1.0], smooth: false },
      ],
    },
    leaves: mandarinLeaves,
    flush: 0.22,
    surface: 0.1,
    card: [0.25, 0.32],
    step: [0.034, 0.044],
    fruit: { rad: [0.027, 0.031], squash: 0.8, count: 96, top: 0.62, early: 0, cells: [[0, 5], [1, 3], [2, 1.2]], segs: [11, 8] },
    fruitProfile: mandarinProfile,
    blooms: 0,
    bloomSize: [0.05, 0.07],
    young: { depth: 0.88, scale: 2.5, step: 0.1, keep: 0.88, flat: 1.7 },
    youngBlooms: 0,
    fruitMap: mandarinFruit,
    bark: () => citrusBark('dwarf-mandarin-bark', '#5c584a'),
    barkTint: '#ffffff',
    twigTint: '#789e52',
    look: { translucency: 0.2, leafRoughness: 0.82, bend: 0.1, flutter: 0.011 },
  });
