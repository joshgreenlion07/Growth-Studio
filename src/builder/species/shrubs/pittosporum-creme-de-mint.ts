import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, rosette, shellSprigs, simpleBark, swayFn, tipOf,
  type LeafStyle, type Shape,
} from './shared-shrubs-a';

/**
 * Dwarf variegated mock orange 'Creme de Mint', Pittosporum tobira 'Shima'
 * (Monrovia's Cream De Mint), sold as 'Creme de Mint' dwarf pittosporum.
 *
 * A slow, tight, rounded mound, about as wide as tall, foliage to the
 * ground. Like every tobira the leathery, spoon-shaped (obovate) leaves are
 * crowded in whorls at the branch tips, each whorl a little rosette; here
 * they are small, sage to mint green in the middle with a broad, uneven
 * creamy white margin, so the plant reads pale and cool from a distance. The
 * new growth comes in chartreuse to green-gold, so in spring the sunlit top of
 * the mound glows lime over the cream-and-mint older leaves underneath. It
 * rarely shows its small cream flowers; this model has none.
 *
 * References and the numbers they give:
 * - Monrovia, Cream De Mint Dwarf Pittosporum
 *   (monrovia.com/cream-de-mint-dwarf-pittosporum.html): P. tobira 'Shima',
 *   24 to 30 in tall and wide, slow growing, mounding; mint green leaves with
 *   creamy white edges; new growth green-gold; zones 8 to 11.
 * - Rogers Gardens, Cream de Mint Dwarf Mock Orange (plants.rogersgardens.com,
 *   plant 14125): 30 x 30 in, slow; chartreuse new growth.
 * - Clemson HGIC, Pittosporum (hgic.clemson.edu/factsheet/pittosporum/):
 *   'Cream de Mint' 2 to 2.5 ft; leaves turn silvery green with age;
 *   variegated forms flower less visibly.
 * - Devil Mountain Nursery, Pittosporum tobira 'Cream de Mint'
 *   (devilmountainnursery.com/pittosporum-tobira-cream-de-mint): 2 to 3 ft;
 *   sold in 1 gal, 3/5 gal and 10/15 gal.
 * - US PP6,449 ('Shimamoto', a dwarf variegated sport of 'Wheeler's Dwarf'):
 *   oblanceolate leaves 40 to 80 x 13 to 25 mm, whorled at the stem tips,
 *   cream-white margin 1 to 10 mm wide; 50 to 75 cm tall.
 * - The job video (a finished front yard, early April): a young plant in a
 *   new bed, its sunlit whorls lime-chartreuse and its shaded lower leaves
 *   gray-green with cream edges.
 * Leaves here 35 to 60 mm long, about 0.42 as wide.
 * Size used: installed from a 1 gal at 0.25 m tall x 0.28 m wide; 0.6 m
 * (24 in) tall x 0.75 m (30 in) wide in about five years (slow): a mound a
 * little wider than tall, as the grower photos show it.
 */

const LEAF: LeafStyle = {
  p: 1.4, q: 0.4, aspect: 0.43,
  base: '#5c7042', dark: '#36462a', light: '#a2b22e',
  midrib: 'rgba(220,226,186,0.75)', midribW: 0.016, gloss: 0.09,
  margin: '#c2c49c', marginIn: 0.82,
  veins: 4, veinCol: 'rgba(220,230,190,0.1)',
};
/** The spring flush: chartreuse leaves whose margins open pale yellow before they turn cream. */
const NEW_LEAF: LeafStyle = { ...LEAF, margin: '#c8cc70', marginIn: 0.9 };

/** Cells 0-3: older single leaves (sage, cream-edged); 4-7: new chartreuse leaves; 8-11: whole whorls from above, in shade. */
function cremeAtlas() {
  const cells = [];
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 0, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h - 12, -Math.PI / 2, { ...(i < 4 ? LEAF : NEW_LEAF), aspect: 0.41 + r() * 0.06 }, { fresh: [0, 0.04, 0.1, 0.18, 0.55, 0.7, 0.85, 1][i], shade: (r() - 0.5) * 0.3 }),
    });
  }
  for (let i = 0; i < 4; i++) {
    cells.push({
      x: i * 256, y: 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) => {
        const n = 9 + Math.floor(r() * 2), a0 = r() * 6.3;
        for (let k = 0; k < n; k++) paintLeaf(g, r, w / 2, w / 2, w * (0.4 + r() * 0.07), a0 + k * 2.39996, LEAF, { fresh: r() * 0.12, shade: -0.15 - r() * 0.3 });
        for (let k = 0; k < 4; k++) paintLeaf(g, r, w / 2, w / 2, w * (0.2 + r() * 0.06), a0 + 1 + k * 1.7, LEAF, { fresh: 0.5, shade: -0.1 });
      },
    });
  }
  return atlas('creme-de-mint-atlas', 1024, 512, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = cremeAtlas();

  // A tight, round mound with foliage to the ground.
  const a = (Sp / 2) * 0.99, top = H * 0.97, yc = H * 0.25, c = V(0, yc, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const rho = Math.hypot(p.x, p.z);
      const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.2) + Math.pow((p.y - yc) / (top - yc), 2.2), 1 / 2.2) : rho / (a * (1 - 0.14 * ((yc - p.y) / yc) ** 2));
      return v * (1 + 0.03 * (1 + lumps(p, c, 6.1)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 7, stemBaseR: 0.06, stemR: 0.011, arch: 0.12, stemYMin: 0.3, secs: 48, twigs: 330, twigInset: 0.045, early: 0.9 });
  const sway = swayFn(H, Sp);
  const twigCol = col('#b0a684'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.2, color: (b) => (b.level === 2 ? twigCol : barkCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.75).addScaledVector(dir, 0.35).add(V(0, 0.35, 0)).normalize();
    const up = clamp(p.y / (H * 0.75));
    const lit = lerp(0.55, 0.84, up) * (0.85 + r() * 0.15);
    // Spring flush: the upper, sunnier whorls carry chartreuse new leaves; the lower ones are the older cream-and-sage.
    const flush = r() < lerp(0.12, 0.92, Math.pow(up, 1.5));
    // On the crown of the mound the whorls open flatter, so no leaves stand up against the sky.
    const crown = clamp((p.y - H * 0.78) / (H * 0.18));
    rosette(leaves, r, p, axis, n, {
      n: 8, len: [0.056, 0.036], tilt: [lerp(1.3, 1.5, crown), lerp(0.45, 1.05, crown)], aspect: 0.5, curled: 1, curl: 0.5, nb: 0.4,
      uv: () => at.uv[flush ? 4 + Math.floor(r() * 4) : Math.floor(r() * 4)],
      color: (i) => white.clone().multiplyScalar(lit * lerp(0.8, 1, i / 7)),
      birth: clamp(tw.birth + r() * 0.06, 0, 0.9), sway: sway(p),
    });
    // The young leaves in the middle of the whorl.
    rosette(leaves, r, p.clone().addScaledVector(axis, 0.004), axis, n, {
      n: 3, len: [0.03, 0.022], tilt: [lerp(0.55, 0.95, crown), lerp(0.25, 0.7, crown)], aspect: 0.5, nb: 0.4,
      uv: () => at.uv[flush ? 6 + Math.floor(r() * 2) : 4 + Math.floor(r() * 2)],
      color: () => white.clone().multiplyScalar(lit),
      birth: clamp(tw.birth + 0.05, 0, 0.9), sway: sway(p),
    });
  }
  // Older whorls underneath, in shade, so the mound reads solid. Over the crown they sit a little deeper (a shape
  // shrunk at the top), so none of these dark cards shows against the sky over the lit whorls.
  const under: Shape = { c, bound: sh.bound, f: (p) => sh.f(p) * (1 + 0.22 * clamp((p.y - H * 0.7) / (H * 0.27))) };
  shellSprigs(leaves, r, under, {
    n: 900, len: [0.1, 0.13], inset: 0.08, tangent: 0.92, up: 0.04, nb: 0.6, sway, birth: () => 0, early: 1,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.8, 0.45, depth)),
  });

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('creme-de-mint-bark', '#7d7362', '#4d4538', '#a69c86') },
    look: { leafRoughness: 0.66, translucency: 0.12, bend: 0.025, flutter: 0.004 },
  };
};
