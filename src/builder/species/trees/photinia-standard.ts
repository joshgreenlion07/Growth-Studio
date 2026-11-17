import * as THREE from 'three';
import { GeoBuilder, barkTexture, col, leafTexture, rng, type SpeciesBuilder } from '../kit';
import { fitBuilders } from './shared-trees-a';
import { speckle } from './shared-trees-b';
import { growHead, headCards, headWood, paintShoot, trunkWood, type LeafPaint, type ShootStyle } from './shared-standards';

/**
 * Red tip photinia, Photinia x fraseri, trained as a standard: one straight
 * gray-brown trunk under a dense rounded to oval head of glossy dark green
 * elliptic leaves (3 to 4 in, finely toothed), with its signature flush of
 * bright red to bronze-red new growth clustered upright at the branch tips,
 * so the dark head reads flecked with red. Shown in that spring flush,
 * without the brief white flower show.
 *
 * References:
 *  - Monrovia, Fraser's Photinia,
 *    https://www.monrovia.com/plant-catalog/plants/1962/frasers-photinia :
 *    dense and upright, fast (3 to 5 ft a year), 8 to 10 ft tall and 5 to
 *    7 ft wide as a shrub; new growth lustrous burgundy-red; can be trained
 *    into a small tree.
 *  - UF/IFAS fact sheet ST-447 (Gilman and Watson), Photinia x fraseri:
 *    12 to 18 ft high, 8 to 12 ft wide, upright, glossy evergreen leaves,
 *    new foliage red.
 *  - Oregon State University Landscape Plants, Photinia x fraseri,
 *    https://landscapeplants.oregonstate.edu/plants/photinia-fraseri :
 *    15 to 20 ft, very upright; leaves elliptic to obovate, 7 to 9 cm,
 *    finely serrate, deep glossy green; new leaves bright red or
 *    orange-copper, fading over 2 to 4 weeks; flowers small, white, in
 *    clusters 10 to 12 cm wide.
 *  - Kwantlen Polytechnic University plant database, Photinia x fraseri,
 *    https://plantdatabase.kpu.ca/PlantPrint/phfr : 3 to 5 m tall, 4 to 5 m
 *    wide, oval form, leaves 8 to 12 cm x 4 to 7 cm, new growth red maturing
 *    to dark glossy green.
 *  - Texas Tech landscape sheet: leaves 2 to 4 in, bright red new growth.
 * Catalog: 15 gal standard 1.8 m x 0.7 m (about 6 x 2.3 ft, trunk about
 * 2.5 ft), mature 4.5 m x 3.6 m (about 15 x 12 ft) in 10 years.
 */

const OLD: LeafPaint = { dark: '#1b3618', lit: '#284a20', gloss: '#d4e0c4', shine: 0.26, rib: '#6a8650', vein: 'rgba(110,140,90,0.3)', veins: 9, shade: 0 };
const UNDER: LeafPaint = { dark: '#3e5c30', lit: '#4a6a38', gloss: '#c8d4b8', shine: 0.06, rib: '#8aa070', vein: 'rgba(150,170,120,0.35)', veins: 9, shade: 0 };
const TURNING: LeafPaint = { dark: '#5a3a20', lit: '#6c4a26', gloss: '#e8d4c0', shine: 0.2, rib: '#a07050', vein: 'rgba(170,120,90,0.3)', veins: 8, shade: 0 };
const RED: LeafPaint = { dark: '#5c1110', lit: '#741a16', gloss: '#f0c0b4', shine: 0.26, rib: '#d06048', vein: 'rgba(210,110,90,0.35)', veins: 8, shade: 0 };
const COPPER: LeafPaint = { dark: '#6a2416', lit: '#80321e', gloss: '#f2c8b4', shine: 0.22, rib: '#d8805a', vein: 'rgba(220,140,100,0.35)', veins: 8, shade: 0 };
/** An old leaf colored red before it drops (a few through the head). */
const OLDRED: LeafPaint = { dark: '#9a2a18', lit: '#b03a20', gloss: '#f0c8b0', shine: 0.2, rib: '#c86848', vein: 'rgba(200,120,90,0.3)', veins: 9, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.6 });

function shoot(paint: (t: number, r: () => number) => LeafPaint, nodes: number, leafLen: number, stem: string, spread: [number, number] = [0.45, 0.85]): ShootStyle {
  return {
    stem, stemW: 5, leafLen, widRatio: 0.42, nodes, petiole: 0.13, wing: 0, spread,
    shape: { widest: 0.55, base: 1.0, tipP: 1.4, tipQ: 1.25, teeth: 24, toothDepth: 0.05 },
    size: (t) => 1 - t * 0.1,
    paint,
  };
}

/** A young red shoot: leaves of the same broad elliptic shape as the old ones, a little smaller toward the tip, held open. */
function redShoot(): ShootStyle {
  return {
    stem: '#7a2216', stemW: 5, leafLen: 140, widRatio: 0.44, nodes: 6, petiole: 0.12, wing: 0, spread: [0.4, 0.8],
    shape: { widest: 0.55, base: 1.0, tipP: 1.4, tipQ: 1.3, teeth: 22, toothDepth: 0.05 },
    size: (t) => 1.05 - t * 0.35,
    paint: (t, r) => withShade(t < 0.2 && r() < 0.5 ? TURNING : r() < 0.22 ? COPPER : RED, r),
  };
}

/** 2 x 2 atlas: two green sprays, a green spray with a red flush at the tip, and a red flush. */
function photiniaLeaves(): THREE.Texture {
  return leafTexture('photinia-standard-leaves', 1024, 1024, (g) => {
    const r = rng('photinia-tex');
    const S = 512, up = -Math.PI / 2;
    const green = (under: number) => (_t: number, rr: () => number) => withShade(rr() < 0.025 ? OLDRED : rr() < under ? UNDER : OLD, rr);
    const greenStem = '#5a5232';
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        paintShoot(g, r, S / 2, S - 4, up - 0.55, S * 0.5, shoot(green(0.08), 5, 150, greenStem, [0.6, 1.0]));
        paintShoot(g, r, S / 2, S - 4, up + 0.5, S * 0.5, shoot(green(0.08), 5, 150, greenStem, [0.6, 1.0]));
        paintShoot(g, r, S / 2, S - 4, up + 0.02, S * 0.66, shoot(green(0.06), 6, 156, greenStem));
      } else if (cell === 1) {
        paintShoot(g, r, S / 2, S - 4, up + 0.35, S * 0.56, shoot(green(0.15), 5, 152, greenStem, [0.6, 1.0]));
        paintShoot(g, r, S / 2, S - 4, up - 0.25, S * 0.64, shoot(green(0.1), 6, 156, greenStem));
      } else if (cell === 2) {
        // Green leaves below, a red flush standing up from the tip.
        paintShoot(g, r, S / 2, S - 4, up - 0.6, S * 0.42, shoot(green(0.06), 4, 146, greenStem, [0.6, 1.0]));
        paintShoot(g, r, S / 2, S - 4, up + 0.58, S * 0.42, shoot(green(0.06), 4, 146, greenStem, [0.6, 1.0]));
        const e = paintShoot(g, r, S / 2, S - 4, up, S * 0.36, shoot(green(0.04), 3, 150, greenStem));
        paintShoot(g, r, e.x, e.y, up + 0.25, S * 0.4, redShoot());
        paintShoot(g, r, e.x, e.y, up - 0.15, S * 0.48, redShoot());
      } else {
        paintShoot(g, r, S / 2, S - 4, up - 0.55, S * 0.5, redShoot());
        paintShoot(g, r, S / 2, S - 4, up + 0.5, S * 0.52, redShoot());
        paintShoot(g, r, S / 2, S - 4, up - 0.2, S * 0.66, redShoot());
        paintShoot(g, r, S / 2, S - 4, up + 0.15, S * 0.74, redShoot());
      }
      g.restore();
    }
  });
}

/** Smooth gray-brown bark with small pale lenticels and faint vertical lines. */
function photiniaBark(): THREE.Texture {
  return barkTexture('photinia-bark', 256, (g, S) => {
    const r = rng('photinia-bark');
    g.fillStyle = '#564c44';
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 800, ['rgba(150,140,128,0.22)', 'rgba(70,60,52,0.22)', 'rgba(120,96,80,0.18)'], 3, 12);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.6 ? `rgba(56,48,40,${0.1 + r() * 0.18})` : `rgba(180,172,160,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 2, y + 10 + r() * 40);
      g.stroke();
    }
    // Lenticels: short pale horizontal dashes.
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(196,186,170,${0.25 + r() * 0.25})`;
      g.fillRect(r() * S, r() * S, 2 + r() * 4, 1 + r() * 1.2);
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const head = growHead(spec, r, {
    trunk: 0.5, bottom: 0.3, round: 2.2, lump: 0.05, shift: 0, scaffolds: 7, lean: [0.35, 1.2], low: 5, reach: 0.55, trunkR: 0.07,
    levels: [
      { count: [4, 5], from: 0.25, to: 1, angle: 0.55, angleVar: 0.2, len: 0.8, lenVar: 0.25, taperAlong: 0.8, radius: 0.65, tip: 0.35, segs: 4, gnarl: 0.25, up: 0.12, out: 0.2, early: 1, limit: [0.82, 0.92], minKeep: 0.3 },
      { perMeter: 9, from: 0.15, to: 1, angle: 0.6, angleVar: 0.25, len: 0.55, lenVar: 0.3, lenMin: 0.15, lenMax: 0.7, radius: 0.6, tip: 0.4, tipMin: 0.005, segs: 3, gnarl: 0.3, up: 0.1, out: 0.12, early: 0.92, limit: [0.9, 0.98], smooth: false },
      { perMeter: 13, from: 0.15, to: 1, angle: 0.6, angleVar: 0.3, len: 0.45, lenMin: 0.08, lenMax: 0.32, radius: 0.6, tip: 0.5, tipMin: 0.003, segs: 2, gnarl: 0.25, up: 0.08, early: 0.88, limit: [0.93, 1.01], smooth: false },
    ],
  });
  trunkWood(wood, head, r, { lean: 0.004 });
  headWood(wood, head, col('#e8e8e8'), col('#b88a74'), 0.3);
  // Red flush on the outer shoot tips, most on the sunlit top and sides; upright, as new shoots stand.
  headCards(leaves, head, r, {
    card: [0.34, 0.42],
    step: [0.045, 0.055],
    tipScale: 1.1,
    normalBend: 0.2,
    cell: (tip, d, out) => {
      if (tip && d > 0.75) {
        const red = 0.42 + 0.35 * Math.max(0, out.y);
        const x = r();
        if (x < red * 0.5) return 3;
        if (x < red) return 2;
      }
      return r() < 0.5 ? 0 : 1;
    },
    tipDir: (_p, dir, out) => dir.clone().multiplyScalar(0.4).addScaledVector(out, 0.6).add(new THREE.Vector3(0, 0.35, 0)).normalize(),
  });

  fitBuilders([wood, leaves], spec.matureHeight, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: photiniaLeaves(),
    bark: { map: photiniaBark() },
    look: { translucency: 0.3, leafRoughness: 0.8, bend: 0.12, flutter: 0.014 },
  };
};
