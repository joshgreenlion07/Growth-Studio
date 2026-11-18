import * as THREE from 'three';
import { leafTexture, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { citrusBark, paintBlossom, paintBud, paintCalyx, paintPeel, paintShoot, type LeafPaint, type ShootStyle } from './shared-standards';
import { buildCitrusVariety } from './shared-citrus';

/**
 * Eureka lemon, Citrus limon 'Eureka', sold as a 15 gal standard: a light
 * trunk under a spreading, open, sparsely foliated head (a lemon, so
 * lighter and yellower green than an orange), broad elliptic leaves about
 * 4 in long, less sharply pointed than a Lisbon's, with crenate margins and
 * near-wingless petioles; new shoots tinged red-bronze; buds purple-red
 * outside, opening to white flowers flushed purple on the back, in small
 * clusters at the shoot tips; nearly thornless. It is everbearing ("four
 * seasons"): flowers, green fruit and ripe fruit on the tree at once, which
 * is how it is shown. Fruit medium-small, elliptic to oblong with a short
 * neck at the stem end and a short nipple at the apex, bright lemon yellow,
 * finely pitted.
 *
 * References:
 *  - UC Riverside Citrus Variety Collection, Eureka lemon (CRC 3498),
 *    https://citrusvariety.ucr.edu/crc3498 : tree "medium in vigor and
 *    size, spreading and open in growth habit", "virtually thornless",
 *    "sparsely foliated" next to Lisbon, leaves darker, less sharply
 *    pointed and more crenate than Lisbon's; fruit "medium-small",
 *    "elliptical to oblong, sometimes obovate", "usually short but
 *    sometimes long apical mammilla or nipple", rind medium-thick, finely
 *    pitted, "yellow at maturity"; crop all year, mainly late winter to
 *    early summer.
 *  - Four Winds Growers, Eureka Semi-Dwarf Lemon,
 *    https://www.fourwindsgrowers.com/products/eureka-lemon-tree :
 *    "Height at maturity: 10'-15' in the ground / 6'-8' in pots"; fewer
 *    thorns than other lemons; heaviest crop fall into winter, some fruit
 *    all year.
 *  - SelecTree (Cal Poly UFEI), Citrus limon (tree 364): new growth light
 *    green and bronze, white flowers, smooth to scaly bark, rounded to vase
 *    crown, flowers spring and fall, fruit all year.
 *  - Wikipedia, Lemon: Eureka "grows year-round and abundantly", known as
 *    "Four Seasons" for bearing flowers and fruit together.
 *  - The finished job's tree three weeks after planting: about 4.2 ft tall,
 *    head about 2.5-3 ft across starting about 1.7 ft up, light green broad
 *    leaves, purple-tinged buds and white flowers at the tips.
 * Catalog: 15 gal 1.3 m x 1.2 m (about 4.25 ft tall; the young head itself is
 * about 3 ft across), mature 3.3 m x 3.3 m (about 11 x 11 ft) in 7 years, a
 * semi-dwarf lemon's open, spreading head. Lemons are shown on the grown
 * tree; the young tree carries flowers and buds, as in the job photo.
 */

const OLD: LeafPaint = { dark: '#2a481e', lit: '#385826', gloss: '#dbe8bc', shine: 0.24, rib: '#78a050', vein: 'rgba(130,170,90,0.32)', veins: 7, shade: 0 };
const LIGHT: LeafPaint = { dark: '#3a5a26', lit: '#48682c', gloss: '#e2eec6', shine: 0.22, rib: '#8cb060', vein: 'rgba(150,186,104,0.32)', veins: 7, shade: 0 };
const UNDER: LeafPaint = { dark: '#5a7f3c', lit: '#668a44', gloss: '#d0dcb0', shine: 0.06, rib: '#a2bc76', vein: 'rgba(170,196,130,0.4)', veins: 7, shade: 0 };
const FRESH: LeafPaint = { dark: '#6a9634', lit: '#7ca63e', gloss: '#eaf2c8', shine: 0.18, rib: '#acc87a', vein: 'rgba(180,206,130,0.32)', veins: 6, shade: 0 };
const BRONZE: LeafPaint = { dark: '#6c5a30', lit: '#7e6c38', gloss: '#e6d8b8', shine: 0.2, rib: '#a49064', vein: 'rgba(170,150,100,0.3)', veins: 5, shade: 0 };
const FLUSH: LeafPaint = { dark: '#6a4a36', lit: '#7a5a3e', gloss: '#ecd8c4', shine: 0.2, rib: '#a08060', vein: 'rgba(170,130,100,0.3)', veins: 4, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number): ShootStyle {
  return {
    stem: '#58783a', stemW: 6, leafLen, widRatio: 0.56, nodes, petiole: 0.08, wing: 0.04, spread: [0.65, 1.2],
    // Broad elliptic, blunt-acute tip, crenate margin.
    shape: { widest: 0.46, base: 0.72, tipP: 1.65, tipQ: 0.95, teeth: 10, toothDepth: 0.07 },
    thorn: 0.06, thornLen: 0.06, thornColor: '#4e6a30',
    size: (t) => (t > 0.85 ? 0.72 : 1 - t * 0.12),
    paint,
  };
}

function eurekaLeaves(): THREE.Texture {
  return leafTexture('eureka-lemon-leaves', 1024, 1024, (g) => {
    const r = rng('eureka-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : rr() < 0.45 ? LIGHT : OLD, rr);
    const flush = (t: number, rr: () => number) => withShade(t > 0.9 ? FLUSH : t > 0.76 ? BRONZE : t > 0.5 ? FRESH : LIGHT, rr);
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        // Sparse: two shoots and a short one, room between the leaves.
        paintShoot(g, r, S / 2, S - 4, up - 0.55, S * 0.52, shoot(old(0.1), 4, 156));
        paintShoot(g, r, S / 2, S - 4, up + 0.4, S * 0.66, shoot(old(0.08), 5, 160));
      } else if (cell === 1) {
        paintShoot(g, r, S / 2, S - 4, up + 0.5, S * 0.5, shoot(old(0.12), 4, 156));
        paintShoot(g, r, S / 2, S - 4, up - 0.2, S * 0.68, shoot(old(0.08), 5, 160));
      } else if (cell === 2) {
        paintShoot(g, r, S / 2, S - 4, up - 0.55, S * 0.46, shoot(old(0.06), 4, 152));
        paintShoot(g, r, S / 2, S - 4, up + 0.05, S * 0.74, shoot(flush, 7, 140));
      } else {
        paintShoot(g, r, S / 2, S - 4, up - 0.32, S * 0.6, shoot(old(0.4), 5, 156));
        paintShoot(g, r, S / 2, S - 4, up + 0.42, S * 0.52, shoot(old(0.3), 4, 150));
      }
      g.restore();
    }
  });
}

/** 4 x 2 atlas of 256 cells: ripe peel, turning peel, green peel, calyx; flower, flower cluster, bud cluster, flowers and buds. */
function eurekaFruit(): THREE.Texture {
  return leafTexture('eureka-lemon-fruit', 1024, 512, (g) => {
    const r = rng('eureka-fruit');
    const S = 256;
    paintPeel(g, r, 0, 0, S, '#f2c800', '#eab800', '#ffe040', '#a08000');
    paintPeel(g, r, S, 0, S, '#d8c810', '#c8bc10', '#eee050', '#86860a');
    paintPeel(g, r, S * 2, 0, S, '#6e9a26', '#7aa02a', '#a8cc5a', '#3e6214');
    // Apex: the nipple a touch greener and darker.
    for (let k = 0; k < 3; k++) {
      const gr = g.createLinearGradient(0, S * 0.86, 0, S);
      gr.addColorStop(0, 'rgba(110,120,20,0)');
      gr.addColorStop(1, 'rgba(110,120,20,0.4)');
      g.fillStyle = gr;
      g.fillRect(S * k, S * 0.86, S, S * 0.14);
    }
    paintCalyx(g, S * 3.5, S * 0.5, S * 0.4);
    const purple = '#a03c6c';
    paintBlossom(g, r, S * 0.5, S * 1.5, S * 0.45, purple, 0.5);
    paintBlossom(g, r, S * 1.3, S * 1.36, S * 0.25, purple, 0.45);
    paintBlossom(g, r, S * 1.7, S * 1.42, S * 0.24, purple, 0.45);
    paintBud(g, S * 1.42, S * 1.82, -1.9, S * 0.17, '#eedce4', '#a43a6e');
    paintBud(g, S * 1.62, S * 1.8, -1.2, S * 0.15, '#ecd8e0', '#983464');
    paintBud(g, S * 1.2, S * 1.76, -2.4, S * 0.14, '#ecd8e0', '#a43a6e');
    for (let k = 0; k < 7; k++) paintBud(g, S * 2.5 + (r() - 0.5) * S * 0.34, S * 1.95, -Math.PI / 2 + (r() - 0.5) * 1.7, S * (0.18 + r() * 0.08), '#ead2dc', k % 2 ? '#9a3466' : '#b0487a');
    paintBlossom(g, r, S * 3.36, S * 1.4, S * 0.27, purple, 0.45);
    paintBud(g, S * 3.66, S * 1.7, -1.1, S * 0.17, '#eedce4', '#a43a6e');
    paintBud(g, S * 3.3, S * 1.82, -1.8, S * 0.16, '#ecd8e0', '#983464');
    paintBud(g, S * 3.12, S * 1.66, -2.3, S * 0.15, '#ecd8e0', '#a43a6e');
  });
}

/** Elliptic-oblong, about 1.35 times as long as wide, a short neck at the stem end and a short nipple at the apex. */
const lemonProfile = (t: number): [number, number] => {
  const ph = t * Math.PI;
  let rr = Math.sin(ph);
  // Neck: the shoulders slope in toward the stem.
  rr *= 1 - 0.14 * (1 - smoothstep(0.04, 0.32, t));
  // Nipple: the apex pulls in and out into a short teat.
  rr *= 1 - 0.42 * smoothstep(0.8, 0.97, t);
  const y = Math.cos(ph) * 1.3 - 0.3 * smoothstep(0.76, 1, t) + 0.06 * (1 - smoothstep(0, 0.15, t));
  return [rr, y];
};

export const build: SpeciesBuilder = (spec) =>
  buildCitrusVariety(spec, {
    key: 'eureka-lemon',
    head: {
      trunk: 0.38, bottom: 0.2, round: 2.1, lump: 0.13, shift: 0.12, scaffolds: 5, lean: [0.85, 1.25], low: 4, reach: 0.66, trunkR: 0.055,
      levels: [
        { count: [4, 5], from: 0.25, to: 1, angle: 0.75, angleVar: 0.3, len: 0.85, lenVar: 0.3, taperAlong: 0.85, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.35, up: 0.06, out: 0.35, early: 1, limit: [0.84, 0.94], minKeep: 0.3 },
        { perMeter: 6, from: 0.18, to: 1, angle: 0.8, angleVar: 0.3, len: 0.55, lenVar: 0.35, lenMin: 0.12, lenMax: 0.65, radius: 0.6, tip: 0.4, tipMin: 0.005, segs: 3, gnarl: 0.4, up: 0.02, out: 0.2, early: 0.9, limit: [0.9, 0.99], smooth: false },
        { perMeter: 9, from: 0.15, to: 1, angle: 0.85, angleVar: 0.3, len: 0.45, lenMin: 0.06, lenMax: 0.26, radius: 0.6, tip: 0.5, tipMin: 0.003, segs: 2, gnarl: 0.35, up: -0.04, early: 0.88, limit: [0.93, 1.02], smooth: false },
      ],
    },
    leaves: eurekaLeaves,
    flush: 0.2,
    surface: 0.12,
    card: [0.32, 0.4],
    step: [0.058, 0.075],
    fruit: { rad: [0.029, 0.034], squash: 1.3, count: 46, top: 0.6, early: 0, cells: [[0, 5], [1, 2], [2, 2.2]], segs: [10, 12] },
    fruitProfile: lemonProfile,
    blooms: 46,
    bloomSize: [0.06, 0.09],
    young: { depth: 0.88, scale: 2.5, step: 0.14, keep: 0.78, flat: 1.35 },
    youngBlooms: 22,
    fruitMap: eurekaFruit,
    bark: () => citrusBark('eureka-bark', '#6c6858'),
    barkTint: '#ffffff',
    twigTint: '#8cae62',
    look: { translucency: 0.28, leafRoughness: 0.82, bend: 0.12, flutter: 0.014 },
  });
