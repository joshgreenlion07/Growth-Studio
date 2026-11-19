import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, paintSprig, rosette, shellSprigs, simpleBark, swayFn, tipOf, twigBirthLookup,
  type LeafStyle, type Shape, type SprigStyle,
} from './shared-shrubs-a';

/**
 * Little Ollie dwarf olive, Olea europaea 'Montra': a dwarf, nearly fruitless
 * olive grown as a shrub. Many stems branch low into a dense, rounded,
 * slightly upright mound with no trunk showing. Leaves opposite, small and
 * narrow (lance-shaped, about 1 to 2 in long and a quarter as wide), stiff,
 * deep dark green above with a pale midrib, silvery gray-green below; the
 * silver undersides show where leaves turn in the wind or stand up at the
 * shoot tips. Flowers are inconspicuous and it sets little or no fruit, so
 * neither is shown. Bark smooth gray on young stems.
 *
 * References and the numbers they give:
 * - Monrovia, Little Ollie Dwarf Olive (monrovia.com/little-ollie-dwarf-olive.html):
 *   dwarf, non-fruiting evergreen; deep green leaves with silvery green
 *   undersides; rounded, multi-branching habit; about 6 ft tall and wide;
 *   moderate growth; can be trained to topiary or a single trunk.
 * - UC Master Gardeners of Sonoma County, Olea europaea 'Little Ollie'
 *   (ucanr.edu/site/mg-sonoma/olea-europaea-little-ollie): compact, rounded,
 *   moderate growth, usually sold with many stems from the base; small, stiff,
 *   grayish green leaves with white undersides that show on windy days;
 *   silvery gray trunks; mostly fruitless; 10 to 12 ft if never pruned,
 *   kept smaller by shearing.
 * - Plantlust, Olea europaea 'Little Ollie' (plantlust.com/plants/17693): 4 to 6 ft tall and wide.
 * Size used: a 5 gal at 0.6 m tall x 0.5 m wide; 1.8 m (6 ft) tall and wide
 * in ten years: Monrovia's mature size, the size it is kept at in a planting
 * (unpruned it can pass 10 ft). Leaves about 1.5 in at maturity.
 */

const LEAF: LeafStyle = {
  p: 0.95, q: 0.85, aspect: 0.27,
  base: '#1e3219', dark: '#0e1c0b', light: '#3e5a2e',
  midrib: 'rgba(120,140,100,0.5)', midribW: 0.018, gloss: 0.1,
};
/** The underside: silvery gray-green, scaly, a little paler toward the tip. */
const UNDER: LeafStyle = {
  p: 0.95, q: 0.85, aspect: 0.24,
  base: '#6c776a', dark: '#525c50', light: '#859083',
  midrib: 'rgba(170,180,160,0.6)', midribW: 0.02, gloss: 0.05,
};
const SPRIG: SprigStyle = { twig: '#7d7a64', twigW: 0.014, leafLen: 0.34, arrangement: 'opposite', nodes: 6, angle: 0.55, height: 0.78, petiole: 0.008, side: 2 };

/**
 * Atlas 1024 x 1024: rows 0-1 sprigs seen from above (row 1 with some leaves turned to show the silver),
 * row 2 shaded sprigs, row 3 single leaves: cells 12-17 tops, 18-19 undersides.
 */
function ollieAtlas() {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    cells.push({
      x: (i % 4) * 256, y: row * 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) => {
        if (row === 1) {
          // A sprig with a few leaves flipped: paint the silver sprig, then the green one over most of it.
          paintSprig(g, r, w, UNDER, { ...SPRIG, nodes: 5 }, 0.1, 0);
          g.globalAlpha = 1;
        }
        paintSprig(g, r, w, LEAF, { ...SPRIG, nodes: 5 + Math.floor(r() * 2) }, row === 2 ? 0.02 : 0.1 + r() * 0.25, row === 2 ? -0.45 : 0);
      },
    });
  }
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 768, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h - 12, -Math.PI / 2, { ...(i >= 6 ? UNDER : LEAF), aspect: 0.22 + r() * 0.04 }, { fresh: [0, 0.05, 0.1, 0.2, 0.35, 0.6, 0, 0.2][i], shade: (r() - 0.5) * 0.2 }),
    });
  }
  return atlas('olive-little-ollie-atlas', 1024, 1024, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = ollieAtlas();

  // A full rounded mound, its widest a little above a third of the height, skirted nearly to the ground.
  const a = (Sp / 2) * 0.97, top = H * 0.97, yc = H * 0.4, c = V(0, yc, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const rho = Math.hypot(p.x, p.z);
      const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.2) + Math.pow((p.y - yc) / (top - yc), 2.2), 1 / 2.2) : rho / (a * (1 - 0.28 * ((yc - p.y) / yc) ** 2));
      return v * (1 + 0.05 * (1 + lumps(p, c, 5.1)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 9, stemBaseR: 0.12, stemR: 0.028, stemReach: 0.62, arch: 0.15, stemYMin: 0.3, secs: 120, twigs: 760, twigInset: 0.05, early: 0.85 });
  const sway = swayFn(H, Sp);
  const twigCol = col('#9a9884'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.3, color: (b) => (b.level === 2 ? twigCol : barkCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birth = twigBirthLookup(frame.twigs);
  shellSprigs(leaves, r, sh, {
    n: 4600, len: [0.15, 0.19], inset: 0.1, tangent: 0.5, up: 0.4, nb: 0.6, sway, birth, early: 0.78,
    cell: (depth, p) => (depth > 0.6 ? at.uv[8 + Math.floor(r() * 4)] : r() < 0.2 + 0.15 * clamp(p.y / H) ? at.uv[4 + Math.floor(r() * 4)] : at.uv[Math.floor(r() * 4)]),
    color: (depth, p) => white.clone().multiplyScalar(lerp(1, 0.6, depth) * lerp(0.78, 1, clamp(p.y / (H * 0.6))) * (0.86 + r() * 0.14)),
  });
  shellSprigs(leaves, r, sh, {
    n: 900, len: [0.17, 0.21], inset: Sp * 0.22, tangent: 0.5, up: 0.4, nb: 0.6, sway, early: 1, birth: () => 0,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.7, 0.42, depth)),
  });
  // Real leaves at the shoot tips: opposite pairs held up at a narrow angle, some showing their silver side.
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.55).addScaledVector(dir, 0.45).add(V(0, 0.5, 0)).normalize();
    const tip = p.clone().addScaledVector(axis, 0.02);
    const lit = 0.86 + r() * 0.14;
    rosette(leaves, r, tip, axis, n, {
      n: 6, len: [0.042, 0.03], tilt: [0.75, 0.35], aspect: 0.5, opposite: true, nb: 0.4,
      uv: () => at.uv[r() < 0.12 ? 18 + Math.floor(r() * 2) : 12 + Math.floor(r() * 6)],
      color: () => white.clone().multiplyScalar(lit),
      birth: clamp(tw.birth + r() * 0.08, 0, 0.9), sway: sway(p),
    });
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('olive-little-ollie-bark', '#8b8878', '#5e5b4e', '#b2afa0') },
    look: { leafRoughness: 0.62, translucency: 0.15, bend: 0.03, flutter: 0.006 },
  };
};
