import * as THREE from 'three';
import { leafTexture, rng, smoothstep, type SpeciesBuilder } from '../kit';
import { citrusBark, paintBlossom, paintBud, paintCalyx, paintPeel, paintShoot, type LeafPaint, type ShootStyle } from './shared-standards';
import { speckle } from './shared-trees-b';
import { buildCitrusVariety } from './shared-citrus';

/**
 * Washington navel orange, Citrus sinensis 'Washington', sold as a 15 gal
 * standard: a clean trunk under a round-topped, somewhat drooping head,
 * denser and darker than a lemon's, of glossy dark green pointed-oval leaves
 * (about 4 in) on narrowly winged petioles, light green new growth (no
 * purple, unlike a lemon), fragrant white flowers in clusters at the branch
 * ends with cream anthers (they carry no pollen), and big round deep-orange
 * fruit with a pebbled rind and the navel, a small second fruit, at the
 * apex. Shown in its winter look: ripe fruit, a few green ones, a light
 * bloom.
 *
 * References:
 *  - UC Riverside Citrus Variety Collection, Washington navel (CRC 1241B),
 *    https://citrusvariety.ucr.edu/crc1241b : tree "round-topped, somewhat
 *    drooping, and medium in size and vigor"; fruit "large, spherical to
 *    obovoid or ellipsoid", base sometimes slightly collared, apex broadly
 *    nippled, navel medium to large, sometimes protruding; rind "deep
 *    orange", medium-thick, "coarsely pitted, moderately pebbled"; anthers
 *    cream-colored, devoid of pollen; ripe November to January, holds for
 *    months on the tree.
 *  - Roger's Gardens plant library, Washington Navel Orange,
 *    https://plants.rogersgardens.com/12290002/Plant/20278/Washington_Navel_Orange :
 *    about 20 ft tall, 15 ft spread on standard stock, canopy clearance
 *    about 2 ft; "glossy oval leaves" that stay dark green through winter;
 *    fragrant white star-shaped flowers in clusters at the branch ends in
 *    early spring.
 *  - Four Winds Growers, Washington Navel Semi-Dwarf,
 *    https://www.fourwindsgrowers.com/products/washington-sweet-orange-tree :
 *    10-15 ft in the ground, 6-8 ft in pots; zones 8-11, protect below 28 F.
 *  - Sweet orange leaves are oval, 4 to 10 cm long, crenulate
 *    (Wikipedia, Orange (fruit)); SelecTree (Cal Poly) Citrus sinensis:
 *    ovate leaves, rounded crown.
 *  - The finished job's trees three weeks after planting: the far tree of
 *    the three along the side fence, about 4.4 ft tall with a round, dense,
 *    dark head about 3 ft across and pale new shoots on top, clear trunk
 *    about 2 ft.
 * Catalog: 15 gal 1.4 m x 1.1 m (about 4.6 x 3.6 ft overall; the young head
 * itself is about 3 ft across), mature 3.0 m x 3.0 m (10 x 10 ft) in 7
 * years: a semi-dwarf tree's round head, as wide as tall. Fruit is shown on
 * the grown tree only; the young tree carries buds and leaves (none of the
 * job's trees showed fruit).
 */

const OLD: LeafPaint = { dark: '#18361a', lit: '#244a20', gloss: '#d8e8c0', shine: 0.32, rib: '#5a7c3c', vein: 'rgba(96,136,70,0.3)', veins: 8, shade: 0 };
const DEEP: LeafPaint = { dark: '#142e16', lit: '#1d3e1b', gloss: '#c8dcb0', shine: 0.26, rib: '#4e7034', vein: 'rgba(86,122,62,0.3)', veins: 8, shade: 0 };
const UNDER: LeafPaint = { dark: '#3f6530', lit: '#4c7238', gloss: '#c4d4a8', shine: 0.08, rib: '#86a466', vein: 'rgba(140,172,108,0.4)', veins: 8, shade: 0 };
const FRESH: LeafPaint = { dark: '#5a8a2e', lit: '#6c9c38', gloss: '#e6f0c8', shine: 0.2, rib: '#a2c070', vein: 'rgba(170,200,120,0.32)', veins: 6, shade: 0 };
const PALE: LeafPaint = { dark: '#7aa63e', lit: '#8cb448', gloss: '#eef4d0', shine: 0.16, rib: '#b8d488', vein: 'rgba(196,220,140,0.3)', veins: 5, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number): ShootStyle {
  return {
    stem: '#46682c', stemW: 6, leafLen, widRatio: 0.5, nodes, petiole: 0.12, wing: 0.13, spread: [0.6, 1.1],
    // Pointed oval: widest below the middle, an acute tip, faintly crenulate.
    shape: { widest: 0.42, base: 0.78, tipP: 1.35, tipQ: 1.2, teeth: 12, toothDepth: 0.025 },
    size: (t) => (t > 0.85 ? 0.78 : 1 - t * 0.12),
    paint,
  };
}

function navelLeaves(): THREE.Texture {
  return leafTexture('navel-orange-leaves', 1024, 1024, (g) => {
    const r = rng('navel-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : rr() < 0.3 ? DEEP : OLD, rr);
    const flush = (t: number, rr: () => number) => withShade(t > 0.82 ? PALE : t > 0.55 ? FRESH : OLD, rr);
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        paintShoot(g, r, S / 2, S - 4, up - 0.55, S * 0.48, shoot(old(0.08), 5, 150));
        paintShoot(g, r, S / 2, S - 4, up + 0.5, S * 0.5, shoot(old(0.08), 5, 150));
        paintShoot(g, r, S / 2, S - 4, up + 0.02, S * 0.66, shoot(old(0.05), 6, 156));
      } else if (cell === 1) {
        // Drooping: leaves on a shoot arching over.
        paintShoot(g, r, S / 2, S - 4, up + 0.36, S * 0.56, shoot(old(0.1), 6, 152));
        paintShoot(g, r, S / 2, S - 4, up - 0.28, S * 0.64, shoot(old(0.08), 6, 154));
      } else if (cell === 2) {
        paintShoot(g, r, S / 2, S - 4, up - 0.5, S * 0.46, shoot(old(0.06), 5, 148));
        paintShoot(g, r, S / 2, S - 4, up + 0.46, S * 0.48, shoot(old(0.06), 5, 148));
        paintShoot(g, r, S / 2, S - 4, up, S * 0.72, shoot(flush, 7, 138));
      } else {
        paintShoot(g, r, S / 2, S - 4, up - 0.32, S * 0.6, shoot(old(0.35), 6, 152));
        paintShoot(g, r, S / 2, S - 4, up + 0.38, S * 0.56, shoot(old(0.3), 5, 148));
      }
      g.restore();
    }
  });
}

/** Pebbled deep-orange peel with the navel at the apex (the bottom of the cell). */
function navelPeel(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, S: number, base: string, blush: string, light: string, dark: string) {
  paintPeel(g, r, x, y, S, base, blush, light, dark);
  // Coarse pebbling: soft pits a few pixels across, lit on top.
  for (let i = 0; i < 900; i++) {
    const px = x + r() * S, py = y + r() * S, s = 2 + r() * 3.5;
    g.fillStyle = 'rgba(70,30,0,0.13)';
    g.beginPath(); g.arc(px, py + s * 0.3, s, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(255,190,90,0.07)';
    g.beginPath(); g.arc(px, py - s * 0.3, s * 0.7, 0, 6.3); g.fill();
  }
  // The navel: a puckered ring and darker scar right at the apex.
  const nb = y + S * 0.9;
  const gr = g.createLinearGradient(0, nb, 0, y + S);
  gr.addColorStop(0, 'rgba(120,52,0,0)');
  gr.addColorStop(0.45, 'rgba(120,52,0,0.35)');
  gr.addColorStop(0.7, 'rgba(255,190,110,0.35)');
  gr.addColorStop(1, 'rgba(96,52,10,0.75)');
  g.fillStyle = gr;
  g.fillRect(x, nb, S, S * 0.1);
  speckle(g, r, x, y + S * 0.93, S, S * 0.07, 220, ['rgba(80,36,0,0.45)', 'rgba(255,200,130,0.3)'], 1, 3);
}

/** 4 x 2 atlas of 256 cells: ripe peel, ripe peel (redder), green peel, calyx; flower, flower cluster, bud cluster, flowers and buds. */
function navelFruit(): THREE.Texture {
  return leafTexture('navel-orange-fruit', 1024, 512, (g) => {
    const r = rng('navel-fruit');
    const S = 256;
    navelPeel(g, r, 0, 0, S, '#ee6c00', '#e05800', '#ff9418', '#a04600');
    navelPeel(g, r, S, 0, S, '#e86000', '#d84c00', '#fc8a14', '#963e00');
    navelPeel(g, r, S * 2, 0, S, '#8aa02c', '#b09a28', '#c4d066', '#526418');
    paintCalyx(g, S * 3.5, S * 0.5, S * 0.4);
    const tint = '#e8e4c8';
    const cream = (cx: number, cy: number, rad: number) => {
      // Cream anthers: no pollen.
      g.fillStyle = '#ece4bc';
      for (let k = 0; k < 12; k++) {
        const a = r() * 6.28, d = rad * (0.1 + r() * 0.16);
        g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.2, rad * 0.045), 0, 6.3); g.fill();
      }
    };
    paintBlossom(g, r, S * 0.5, S * 1.5, S * 0.45, tint, 0.3);
    cream(S * 0.5, S * 1.5, S * 0.45);
    for (const [cx, cy, rd] of [[1.3, 1.36, 0.25], [1.7, 1.44, 0.24]]) { paintBlossom(g, r, S * cx, S * cy, S * rd, tint, 0.3); cream(S * cx, S * cy, S * rd); }
    paintBud(g, S * 1.44, S * 1.82, -1.9, S * 0.16, '#f2f0e4', '#fbfaf2');
    paintBud(g, S * 1.62, S * 1.8, -1.2, S * 0.15, '#f2f0e4', '#fbfaf2');
    for (let k = 0; k < 6; k++) paintBud(g, S * 2.5 + (r() - 0.5) * S * 0.3, S * 1.95, -Math.PI / 2 + (r() - 0.5) * 1.6, S * (0.18 + r() * 0.07), '#e8ecd6', '#fbfaf2');
    paintBlossom(g, r, S * 3.36, S * 1.4, S * 0.27, tint, 0.3);
    cream(S * 3.36, S * 1.4, S * 0.27);
    paintBud(g, S * 3.66, S * 1.7, -1.1, S * 0.16, '#f2f0e4', '#fbfaf2');
    paintBud(g, S * 3.3, S * 1.82, -1.8, S * 0.15, '#f2f0e4', '#fbfaf2');
  });
}

/** Round, a touch fuller toward the apex, slightly flattened over the navel. */
const navelProfile = (t: number): [number, number] => {
  const ph = t * Math.PI;
  const rr = Math.sin(ph) * (1 + 0.05 * (t - 0.5)) * (1 - 0.08 * smoothstep(0.9, 1, t));
  // A shallow dip at the stem end too (the slight collar).
  const y = Math.cos(ph) * 0.97 + 0.07 * smoothstep(0.85, 1, t) - 0.05 * (1 - smoothstep(0, 0.12, t));
  return [rr, y];
};

export const build: SpeciesBuilder = (spec) =>
  buildCitrusVariety(spec, {
    key: 'navel-orange',
    head: {
      trunk: 0.4, bottom: 0.14, round: 2.15, lump: 0.05, shift: -0.08, scaffolds: 6, lean: [0.75, 1.15], low: 6, reach: 0.58, trunkR: 0.055,
      levels: [
        { count: [5, 6], from: 0.25, to: 1, angle: 0.7, angleVar: 0.25, len: 0.8, lenVar: 0.25, taperAlong: 0.8, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.3, up: 0.02, out: 0.25, early: 1, limit: [0.82, 0.92], minKeep: 0.3 },
        { perMeter: 9, from: 0.15, to: 1, angle: 0.8, angleVar: 0.25, len: 0.55, lenVar: 0.3, lenMin: 0.12, lenMax: 0.6, radius: 0.6, tip: 0.4, tipMin: 0.005, segs: 3, gnarl: 0.35, up: -0.06, out: 0.15, early: 0.92, limit: [0.9, 0.98], smooth: false },
        { perMeter: 14, from: 0.15, to: 1, angle: 0.85, angleVar: 0.3, len: 0.45, lenMin: 0.06, lenMax: 0.25, radius: 0.6, tip: 0.5, tipMin: 0.003, segs: 2, gnarl: 0.3, up: -0.1, early: 0.88, limit: [0.93, 1.0], smooth: false },
      ],
    },
    leaves: navelLeaves,
    flush: 0.3,
    surface: 0.12,
    card: [0.3, 0.38],
    step: [0.04, 0.05],
    fruit: { rad: [0.04, 0.047], squash: 1, count: 44, top: 0.5, early: 0, cells: [[0, 5], [1, 3], [2, 0.8]], segs: [11, 8] },
    fruitProfile: navelProfile,
    blooms: 22,
    bloomSize: [0.06, 0.09],
    young: { depth: 0.88, scale: 2.4, step: 0.12, keep: 0.85, flat: 1.6 },
    youngBlooms: 0,
    fruitMap: navelFruit,
    bark: () => citrusBark('navel-bark', '#5c5a4a'),
    barkTint: '#ffffff',
    twigTint: '#7fa458',
    look: { translucency: 0.22, leafRoughness: 0.8, bend: 0.1, flutter: 0.012 },
  });
