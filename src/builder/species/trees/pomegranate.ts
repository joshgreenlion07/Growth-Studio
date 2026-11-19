import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, clamp, col, jitter, leafQuad, leafTexture, lerp, perp, rng, smoothstep, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, blobPath, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, rootFlare, tiled, type Limb } from './shared-trees-a';
import { bladePath, paintBlade, type LeafPaint, type LeafShape } from './shared-standards';
import { latheFruit, type FruitProfile } from './shared-citrus';
import { speckle } from './shared-trees-b';

/**
 * Pomegranate, Punica granatum, grown as a multi-trunk large shrub or small
 * tree and shown in leaf in mid summer: flowers still opening at the shoot
 * tips while the first fruit fill out and color.
 *
 * Habit: four or five slender, sinuous trunks from the base, gray-brown and
 * smooth (red-brown on young stems), rising in a vase and carrying a
 * rounded, fine-textured, rather dense crown whose stiff, twiggy outer
 * branches arch over and droop at their ends under the fruit. Leaves
 * opposite or in small whorls and clusters on short spurs, short-stalked,
 * narrow oblong-lanceolate, entire, 1 to 3 in, glossy bright green, new
 * growth tinged copper-red; a few short spines at the twig ends. Flowers at
 * the branch tips, singly or two to five together: a thick, fleshy, tubular
 * red-orange calyx like a small vase, with five to eight pointed sepals,
 * from which crumpled scarlet-orange petals spill around a tuft of gold
 * stamens; buds are glossy red urns. Fruit nearly round, a little angular,
 * about 3 to 4 in, leathery rind yellowish overlaid with pink to deep red,
 * crowned at the far end by the persistent calyx, hanging from the shoot
 * ends with the crown down.
 *
 * References and the numbers they give:
 *  - California Rare Fruit Growers, Pomegranate fruit facts (as reproduced
 *    at growables.com/information/TropicalFruit/PomegranateCRFG.htm): "a
 *    neat, rounded shrub or small tree that can grow to 20 or 30 ft., but
 *    more typically to 12 to 16 ft."; red-brown bark later gray; branches
 *    stiff, angular, often spiny; leaves "glossy, leathery", "narrow and
 *    lance-shaped"; flowers "over an inch across", 5 to 8 crumpled petals,
 *    a red, fleshy, tubular calyx that persists on the fruit, solitary or in
 *    twos and threes at the branch ends; fruit "nearly round, 2-1/2 to 5
 *    in. wide", crowned by the calyx; may bear 1 year after planting, 2 1/2
 *    to 3 more common; ripe 5 to 7 months after bloom.
 *  - J. Morton, Fruits of Warm Climates (1987), Pomegranate (growables.org):
 *    leaves "opposite or in whorls of 5 or 6, short-stemmed,
 *    oblong-lanceolate, 3/8 to 4 in (1-10 cm) long, leathery"; flowers 1 1/4
 *    in (3 cm) wide, singly or up to 5 at the branch tips, calyx with 5 to 8
 *    fleshy pointed sepals forming a vase; strong tendency to sucker.
 *  - UC Master Gardeners of Tulare and Kings Counties, "Pomegranates in the
 *    Valley" (March 2025, ccfruitandnuts.ucanr.edu): "deciduous rounded
 *    shrubs or multi-trunk trees which grow 15 to 20 feet tall"; brilliant
 *    orangish-red flowers of 5-8 crumpled petals in early summer; fruit
 *    borne at the tips of new growth; spines along the limbs; train 4 to 5
 *    shoots from a young plant.
 *  - UC Master Gardeners of Riverside County, Pomegranate fact sheet:
 *    "a small tree or shrub 15 to 20 feet tall, with shiny foliage and a
 *    long flowering season".
 *  - NC State Extension Plant Toolbox, Punica granatum
 *    (plants.ces.ncsu.edu/plants/punica-granatum/): 10-12 ft tall, 8-10 ft
 *    wide, multi-stemmed, oval to rounded, medium growth; lustrous dark
 *    green leaves 1 to 4 in, lanceolate to oblanceolate; flowers about 1 in,
 *    1 1/4 in wide with crepe-paper petals; fruit 2-4 in; bark light brown
 *    to gray, smooth.
 *  - Paradise Nursery, Persian pomegranate
 *    (paradisenursery.com/product/persian-pomegranate-tree): "15 gal - ~4ft
 *    tall & ~1" trunk"; Plant Clearance, Wonderful 15 gal: 6-7 ft tall,
 *    2-3 ft wide.
 *  - Photos (Wikimedia Commons): Starr, flowering habit at a Maui nursery
 *    (tubular calyces, ruffled petals, red buds, glossy narrow leaves in
 *    tufts), habit with fruit, Corn Creek NWR, Nevada (dormant: slender gray
 *    trunks in a vase, fruit at the twig tips); pomegranates in fruit at
 *    Krynychne (arching shoots weighed down at the ends); a multi-trunk tree
 *    at the National Botanic Garden of Wales (arching, weeping outer
 *    branches); flowers at Ponte de Sor (sepal star, gold stamens).
 * Catalog: 15 gal 1.5 m x 0.9 m (about 5 x 3 ft, the nurseries' 4 ft and
 * 6-7 ft x 2-3 ft listings bracketing it); mature 4.5 m x 4.0 m (about 15 x
 * 13 ft) in 10 years, inside the 12-20 ft range of the UC and CRFG sources
 * and a little wider than NC State's 8-10 ft, as a multi-trunk tree is grown
 * in a Central Valley yard. Deciduous in the valley (yellow in fall, bare in
 * winter); shown in leaf. The young plant carries leaves only: flowers come
 * from the first year after planting, fruit from about the second or third.
 */

const LEAF_SHAPE: LeafShape = { widest: 0.56, base: 1.15, tipP: 1.75, tipQ: 0.95 };
const MATURE: LeafPaint = { dark: '#234f19', lit: '#306222', gloss: '#e8f2cc', shine: 0.3, rib: '#9ab868', vein: 'rgba(150,186,110,0.22)', veins: 3, shade: 0 };
const DEEP: LeafPaint = { dark: '#1c4215', lit: '#27521b', gloss: '#d8e8bc', shine: 0.26, rib: '#86a858', vein: 'rgba(130,170,96,0.22)', veins: 3, shade: 0 };
const BRIGHT: LeafPaint = { dark: '#346a1f', lit: '#437a27', gloss: '#eef6d0', shine: 0.28, rib: '#acc876', vein: 'rgba(170,200,120,0.2)', veins: 3, shade: 0 };
const FRESH: LeafPaint = { dark: '#6a9228', lit: '#7ea232', gloss: '#f2f6d2', shine: 0.22, rib: '#c0d47e', vein: 'rgba(200,220,140,0.2)', veins: 2, shade: 0 };
const COPPER: LeafPaint = { dark: '#7a4a22', lit: '#8e5a2a', gloss: '#f4dcc0', shine: 0.24, rib: '#c08a5a', vein: 'rgba(200,150,110,0.2)', veins: 2, shade: 0 };
const UNDER: LeafPaint = { dark: '#557c38', lit: '#628a40', gloss: '#d8e4bc', shine: 0.08, rib: '#a8c482', vein: 'rgba(180,204,140,0.3)', veins: 3, shade: 0 };

const withShade = (p: LeafPaint, r: () => number): LeafPaint => ({ ...p, shade: (r() - 0.5) * 1.5 });

interface ShootPaint {
  nodes: number;
  /** Leaf length in px. */
  leafLen: number;
  /** Chance a node carries a cluster (a short spur with three to six leaves) instead of an opposite pair. */
  cluster: number;
  /** Chance of a short spine at a node. */
  spine: number;
  stem: string;
  stemW: number;
  paint: (t: number, r: () => number) => LeafPaint;
}

/** One short-stalked leaf: a reddish petiole and a narrow, entire blade. */
function pomLeaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, p: LeafPaint) {
  const pl = len * 0.07;
  const c = Math.cos(a), s = Math.sin(a);
  g.strokeStyle = '#8a4a2c';
  g.lineWidth = Math.max(1.2, len * 0.035);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + c * pl, y + s * pl);
  g.stroke();
  paintBlade(g, x + c * pl, y + s * pl, a, len, wid, LEAF_SHAPE, p);
}

/** A shoot from (x0, y0) along `ang`, with opposite pairs (every other pair foreshortened: they are decussate) and spur clusters. */
function pomShoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, len: number, s: ShootPaint) {
  const bend = (r() - 0.5) * 0.4;
  const pt = (t: number) => ({ x: x0 + Math.cos(ang + bend * t * 0.5) * len * t, y: y0 + Math.sin(ang + bend * t * 0.5) * len * t, a: ang + bend * t });
  g.strokeStyle = s.stem;
  g.lineCap = 'round';
  g.lineWidth = s.stemW;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= 10; i++) { const q = pt(i / 10); g.lineTo(q.x, q.y); }
  g.stroke();
  for (let k = 0; k < s.nodes; k++) {
    const t = 0.08 + (k / s.nodes) * 0.84;
    const q = pt(t);
    const grow = lerp(0.85, 1, Math.sin(Math.PI * Math.min(1, t + 0.2))) * lerp(1, 0.7, t * t);
    if (r() < s.spine) {
      // A short, stiff spine off the node.
      const sa = q.a + (k % 2 ? 1 : -1) * (0.5 + r() * 0.3), sl = s.leafLen * (0.16 + r() * 0.1);
      g.fillStyle = '#6a4a36';
      g.beginPath();
      g.moveTo(q.x + Math.cos(sa + 1.57) * s.stemW * 0.4, q.y + Math.sin(sa + 1.57) * s.stemW * 0.4);
      g.lineTo(q.x + Math.cos(sa) * sl, q.y + Math.sin(sa) * sl);
      g.lineTo(q.x + Math.cos(sa - 1.57) * s.stemW * 0.4, q.y + Math.sin(sa - 1.57) * s.stemW * 0.4);
      g.closePath();
      g.fill();
    }
    if (r() < s.cluster) {
      // A spur: a tuft of three to six leaves fanning from one point.
      const n = 3 + Math.floor(r() * 4);
      const side = k % 2 ? 1 : -1;
      for (let j = 0; j < n; j++) {
        const a = q.a + side * (0.25 + (j / Math.max(1, n - 1)) * 1.3) + (r() - 0.5) * 0.3;
        const L = s.leafLen * grow * (0.6 + r() * 0.35);
        pomLeaf(g, q.x, q.y, a, L, L * (0.26 + r() * 0.06), s.paint(t, r));
      }
    } else {
      const fore = k % 2 ? 0.6 + r() * 0.2 : 1;
      for (const sg of [-1, 1]) {
        const a = q.a + sg * (0.65 + r() * 0.45) * (k % 2 ? 0.75 : 1);
        const L = s.leafLen * grow * (0.82 + r() * 0.3);
        pomLeaf(g, q.x, q.y, a, L * fore, L * (0.27 + r() * 0.06) * (k % 2 ? 1.15 : 1), s.paint(t, r));
      }
    }
  }
  // The tip: a pair of small young leaves.
  const e = pt(1);
  for (const sg of [-1, 1]) pomLeaf(g, e.x, e.y, e.a + sg * (0.3 + r() * 0.25), s.leafLen * 0.5, s.leafLen * 0.15, s.paint(1, r));
}

/** 1024 atlas, 2 x 2: two leafy shoot sprays, a spray tipped with copper-red new growth, and a spur twig with leaf tufts. */
function pomegranateLeaves(): THREE.Texture {
  return leafTexture('pomegranate-leaves', 1024, 1024, (g) => {
    const r = rng('pomegranate-tex');
    const S = 512, up = -Math.PI / 2;
    const old = (under: number) => (_t: number, rr: () => number) => withShade(rr() < under ? UNDER : rr() < 0.3 ? DEEP : rr() < 0.4 ? BRIGHT : MATURE, rr);
    const flush = (t: number, rr: () => number) => withShade(t > 0.88 ? COPPER : t > 0.72 ? (rr() < 0.5 ? COPPER : FRESH) : t > 0.5 ? FRESH : MATURE, rr);
    const sh = (paint: ShootPaint['paint'], nodes: number, leafLen: number, cluster: number, spine = 0.08): ShootPaint => ({ nodes, leafLen, cluster, spine, stem: '#7a5a44', stemW: 4.5, paint });
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell === 0) {
        for (const [a, l] of [[-0.62, 0.5], [0.6, 0.52], [-0.2, 0.68], [0.22, 0.64]]) pomShoot(g, r, S / 2, S - 4, up + a, S * l, sh(old(0.08), 6, 112, 0.25));
      } else if (cell === 1) {
        // Arching: the shoots lean over to one side.
        for (const [a, l] of [[0.75, 0.5], [0.3, 0.66], [-0.2, 0.6], [-0.7, 0.42]]) pomShoot(g, r, S / 2, S - 4, up + a, S * l, sh(old(0.12), 6, 118, 0.2));
      } else if (cell === 2) {
        for (const [a, l] of [[-0.6, 0.48], [0.56, 0.5]]) pomShoot(g, r, S / 2, S - 4, up + a, S * l, sh(old(0.06), 5, 110, 0.2));
        pomShoot(g, r, S / 2, S - 4, up + 0.04, S * 0.74, sh(flush, 8, 104, 0.1, 0.02));
      } else {
        // An older spur twig: gray, spiny, leaves in tufts.
        for (const [a, l] of [[-0.45, 0.62], [0.4, 0.66], [0.02, 0.5]]) pomShoot(g, r, S / 2, S - 4, up + a, S * l, { ...sh(old(0.25), 5, 104, 0.75, 0.3), stem: '#6e665a', stemW: 5.5 });
      }
      g.restore();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Flowers and fruit                                                    */
/* ------------------------------------------------------------------ */

const PETALS = ['#f2481c', '#fb5524', '#e63c16', '#ff6430', '#f04e1e'];

/** The fleshy calyx tube seen from the side: an urn from (0, y0) narrow to the rim at y1 (canvas y up is negative), `w` wide at the rim. */
function calyxTube(g: CanvasRenderingContext2D, y0: number, y1: number, w: number, base: string, edge: string, hi: string) {
  const h = y1 - y0;
  g.beginPath();
  g.moveTo(-w * 0.2, y0);
  g.bezierCurveTo(-w * 0.62, y0 + h * 0.35, -w * 0.5, y0 + h * 0.8, -w * 0.5, y1);
  g.lineTo(w * 0.5, y1);
  g.bezierCurveTo(w * 0.5, y0 + h * 0.8, w * 0.62, y0 + h * 0.35, w * 0.2, y0);
  g.closePath();
  const gr = g.createLinearGradient(-w * 0.55, 0, w * 0.55, 0);
  gr.addColorStop(0, edge);
  gr.addColorStop(0.3, base);
  gr.addColorStop(0.45, hi);
  gr.addColorStop(0.7, base);
  gr.addColorStop(1, edge);
  g.fillStyle = gr;
  g.fill();
}

/** Pointed sepals around a rim at y, `w` wide, spreading outward; n of them across the visible half. */
function sepals(g: CanvasRenderingContext2D, r: () => number, y: number, w: number, len: number, n: number, color: string, spread: number) {
  g.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0.5 : k / (n - 1);
    const x = lerp(-w * 0.46, w * 0.46, f);
    const a = -Math.PI / 2 + (f - 0.5) * spread + (r() - 0.5) * 0.15;
    const bw = (w / n) * 0.75;
    g.beginPath();
    g.moveTo(x - bw, y + 2);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - bw * 0.3, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + bw * 0.3, y + Math.sin(a) * len * 0.5, x + bw, y + 2);
    g.closePath();
    g.fill();
  }
}

/** Crumpled petals bunched over a rim at y, `w` wide, flaring to `flare` times that. */
function petalPuff(g: CanvasRenderingContext2D, r: () => number, y: number, w: number, h: number, flare: number) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 9; i++) {
      const f = (i + r() * 0.8) / 9;
      const x = lerp(-w * flare * 0.5, w * flare * 0.5, f) * (pass ? 0.75 : 1);
      const py = y - h * (0.2 + r() * 0.55) * (1 - Math.abs(f - 0.5) * 0.6) - (pass ? h * 0.08 : 0);
      g.fillStyle = PETALS[Math.floor(r() * PETALS.length)];
      blobPath(g, r, x, py, w * (0.2 + r() * 0.1), h * (0.24 + r() * 0.12), 0.48, 11);
      g.fill();
      // Creases in the crumpled petal.
      g.strokeStyle = 'rgba(150,24,8,0.4)';
      g.lineWidth = Math.max(1, w * 0.02);
      g.beginPath();
      g.moveTo(x - w * 0.1, py + h * 0.1);
      g.quadraticCurveTo(x + (r() - 0.5) * w * 0.15, py - h * 0.05, x + w * 0.06, py - h * 0.18);
      g.stroke();
      if (pass === 1 && r() < 0.5) {
        g.fillStyle = 'rgba(255,150,110,0.28)';
        blobPath(g, r, x, py - h * 0.05, w * 0.1, h * 0.1, 0.4, 7);
        g.fill();
      }
    }
  }
}

/** A flower from the side: stalk at (cx, by), opening upward, `h` tall, leaning by `lean`. */
function flowerSide(g: CanvasRenderingContext2D, r: () => number, cx: number, by: number, h: number, lean: number) {
  g.save();
  g.translate(cx, by);
  g.rotate(lean);
  g.strokeStyle = '#6e4428';
  g.lineWidth = h * 0.045;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -h * 0.12);
  g.stroke();
  const w = h * 0.36;
  petalPuff(g, r, -h * 0.6, w, h * 0.42, 1.35);
  calyxTube(g, -h * 0.1, -h * 0.62, w, '#d83a1e', '#9a1c10', '#f27448');
  sepals(g, r, -h * 0.6, w, h * 0.16, 4, '#e2502a', 1.3);
  // A few gold stamens showing at the mouth.
  g.fillStyle = '#f0c03a';
  for (let k = 0; k < 8; k++) {
    g.beginPath();
    g.arc((r() - 0.5) * w * 0.55, -h * (0.66 + r() * 0.08), Math.max(1.2, h * 0.012), 0, 6.3);
    g.fill();
  }
  g.restore();
}

/** A flower face-on: the sepal star behind, crumpled petals, a ring of gold stamens. */
function flowerFront(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, R: number) {
  const a0 = r() * 6.28;
  g.fillStyle = '#d4441e';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate(a0 + (k / 6) * Math.PI * 2);
    bladePath(g, R * 1.05, R * 0.34, { widest: 0.3, base: 0.6, tipP: 1.2, tipQ: 1.3 });
    g.fill();
    g.restore();
  }
  for (let k = 0; k < 7; k++) {
    const a = a0 + 0.4 + (k / 7) * Math.PI * 2 + (r() - 0.5) * 0.3, d = R * (0.4 + r() * 0.1);
    g.fillStyle = PETALS[Math.floor(r() * PETALS.length)];
    blobPath(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * 0.42, R * 0.36, 0.45, 11);
    g.fill();
    g.strokeStyle = 'rgba(150,24,8,0.35)';
    g.lineWidth = Math.max(1, R * 0.03);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * d * 0.5, cy + Math.sin(a) * d * 0.5);
    g.lineTo(cx + Math.cos(a + 0.2) * d * 1.3, cy + Math.sin(a + 0.2) * d * 1.3);
    g.stroke();
  }
  // The throat and the stamen ring.
  g.fillStyle = '#b8281a';
  g.beginPath();
  g.arc(cx, cy, R * 0.3, 0, 6.3);
  g.fill();
  for (let k = 0; k < 70; k++) {
    const a = r() * 6.28, d = R * (0.1 + r() * 0.24);
    g.fillStyle = r() < 0.7 ? '#f4c840' : '#dc9e22';
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.2, R * 0.035), 0, 6.3);
    g.fill();
  }
  g.fillStyle = '#efe0a8';
  g.beginPath();
  g.arc(cx, cy, R * 0.06, 0, 6.3);
  g.fill();
}

/** A closed bud: a glossy red urn with its sepals drawn together into a point, on a short stalk from (x, y) along `ang`. */
function bud(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.strokeStyle = '#6e4428';
  g.lineWidth = Math.max(1.5, len * 0.07);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -len * 0.18);
  g.stroke();
  calyxTube(g, -len * 0.16, -len * 0.72, len * 0.46, '#d23a20', '#961c10', '#f6805a');
  g.fillStyle = '#da4424';
  g.beginPath();
  g.moveTo(-len * 0.23, -len * 0.7);
  g.quadraticCurveTo(-len * 0.12, -len * 0.92, 0, -len);
  g.quadraticCurveTo(len * 0.12, -len * 0.92, len * 0.23, -len * 0.7);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(120,20,10,0.5)';
  g.lineWidth = Math.max(1, len * 0.02);
  for (const f of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.moveTo(f * len * 0.2, -len * 0.72);
    g.lineTo(f * len * 0.05, -len * 0.96);
    g.stroke();
  }
  if (r() < 0.6) {
    // Petals just showing at the tip.
    g.fillStyle = PETALS[1];
    blobPath(g, r, 0, -len * 0.88, len * 0.08, len * 0.08, 0.3, 7);
    g.fill();
  }
  g.restore();
}

/**
 * Rind for the lathe-turned fruit (top of the cell at the stem end, bottom at the crown): yellowish skin washed and
 * streaked with red, fine pale lenticels; the bottom 28 percent the calyx tube, cut at the very bottom into its
 * pointed sepals (transparent between them, so the crown reads toothed).
 */
function pomPeel(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, S: number, skin: string, red: string, redAmt: number, crown: string) {
  const body = S * 0.72;
  g.fillStyle = skin;
  g.fillRect(x, y, S, body + 2);
  // Red overlay in soft vertical streaks (meridians of the fruit), thicker on one side.
  const k = new THREE.Color(red);
  const rgb = `${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)}`;
  for (let i = 0; i < 70; i++) {
    const px = x + r() * S, w = 4 + r() * 18;
    const side = 0.65 + 0.35 * Math.cos(((px - x) / S) * Math.PI * 2);
    g.fillStyle = `rgba(${rgb},${(redAmt * side * (0.25 + r() * 0.35)).toFixed(3)})`;
    g.fillRect(px - w / 2, y, w, body + 2);
  }
  g.fillStyle = `rgba(${rgb},${(redAmt * 0.45).toFixed(3)})`;
  g.fillRect(x, y, S, body + 2);
  // Fine lenticels and blemishes.
  speckle(g, r, x, y, S, body, 900, ['rgba(255,230,190,0.22)', 'rgba(90,20,10,0.16)', 'rgba(255,210,170,0.14)'], 0.8, 2.2);
  // Stem end: a small dark ring at the top.
  const sg = g.createLinearGradient(x, y, x, y + S * 0.08);
  sg.addColorStop(0, 'rgba(70,30,14,0.55)');
  sg.addColorStop(1, 'rgba(70,30,14,0)');
  g.fillStyle = sg;
  g.fillRect(x, y, S, S * 0.08);
  // The crown: the calyx tube, a little duller than the rind, darkening toward its sepals.
  const cg = g.createLinearGradient(x, y + body - S * 0.04, x, y + S);
  cg.addColorStop(0, `rgba(${rgb},0)`);
  cg.addColorStop(0.12, crown);
  cg.addColorStop(1, '#7a3018');
  g.fillStyle = cg;
  g.fillRect(x, y + body - S * 0.04, S, S - body + S * 0.04);
  g.clearRect(x, y + S * 0.88, S, S * 0.12);
  // Six sepals around (u wraps once around the fruit).
  for (let t = 0; t < 6; t++) {
    const x0 = x + (t / 6) * S, x1 = x + ((t + 1) / 6) * S;
    g.fillStyle = t % 2 ? crown : '#8a3a1c';
    g.beginPath();
    g.moveTo(x0 + 2, y + S * 0.875);
    g.lineTo((x0 + x1) / 2 + (r() - 0.5) * 6, y + S * 0.998);
    g.lineTo(x1 - 2, y + S * 0.875);
    g.closePath();
    g.fill();
  }
}

/**
 * 4 x 2 atlas of 256 cells: 0 flower from the side, 1 flower face-on, 2 buds, 3 flower and bud;
 * 4-6 fruit rinds (ripe red, rose over yellow, young green-yellow), 7 a young fruit with its big crown.
 */
function pomegranateFlowers(): THREE.Texture {
  return leafTexture('pomegranate-flowers', 1024, 512, (g) => {
    const r = rng('pomegranate-fl');
    const S = 256;
    flowerSide(g, r, S * 0.5, S - 6, S * 0.9, 0.05);
    flowerFront(g, r, S * 1.5, S * 0.5, S * 0.4);
    // Buds: three on short stalks from a common point.
    bud(g, r, S * 2.5, S - 8, -Math.PI / 2 - 0.45, S * 0.5);
    bud(g, r, S * 2.5, S - 8, -Math.PI / 2 + 0.4, S * 0.44);
    bud(g, r, S * 2.5, S - 8, -Math.PI / 2 - 0.02, S * 0.62);
    flowerSide(g, r, S * 3.42, S - 6, S * 0.82, -0.2);
    bud(g, r, S * 3.5, S - 6, -Math.PI / 2 + 0.6, S * 0.4);
    pomPeel(g, r, 0, S, S, '#c87a5a', '#a00c16', 1, '#a8382a');
    pomPeel(g, r, S, S, S, '#d8946c', '#b81a26', 0.95, '#b84a30');
    pomPeel(g, r, S * 2, S, S, '#b8b452', '#c04a30', 0.32, '#a86a34');
    // A young fruit, standing up, its crown still large for its size.
    g.save();
    g.translate(S * 3.5, S * 2 - 6);
    g.strokeStyle = '#6e4428';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -S * 0.12);
    g.stroke();
    const gr = g.createRadialGradient(-S * 0.08, -S * 0.42, S * 0.02, 0, -S * 0.36, S * 0.26);
    gr.addColorStop(0, '#e8a060');
    gr.addColorStop(0.5, '#c4522c');
    gr.addColorStop(1, '#8a2a18');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, -S * 0.36, S * 0.24, S * 0.25, 0, 0, 6.3);
    g.fill();
    calyxTube(g, -S * 0.54, -S * 0.8, S * 0.2, '#c24228', '#8a2414', '#e2704a');
    sepals(g, r, -S * 0.78, S * 0.2, S * 0.14, 4, '#c8482a', 1.4);
    g.restore();
  });
}

/**
 * Nearly round, a touch flattened at the stem end, narrowing at the far end into the calyx tube, which flares into
 * the crown. t: 0 stem end .. 0.72 base of the crown .. 0.86 its neck .. 1 the sepal tips.
 */
const pomProfile: FruitProfile = (t) => {
  if (t <= 0.72) {
    const ph = (t / 0.72) * Math.PI * 0.93;
    return [Math.pow(Math.sin(ph), 0.9), Math.cos(ph) * 0.95 - 0.04 * (1 - smoothstep(0, 0.12, t))];
  }
  const r0 = Math.pow(Math.sin(Math.PI * 0.93), 0.9), y0 = Math.cos(Math.PI * 0.93) * 0.95;
  if (t <= 0.86) {
    const u = (t - 0.72) / 0.14;
    return [lerp(r0, r0 * 0.78, u), y0 - u * 0.16];
  }
  const u = (t - 0.86) / 0.14;
  return [lerp(r0 * 0.78, r0 * 1.35, Math.pow(u, 0.7)), y0 - 0.16 - u * 0.2];
};

/** Bark: smooth gray-brown with fine twisted streaks and a few thin flakes; young stems take a red-brown vertex tint. */
function pomegranateBark(): THREE.Texture {
  return barkTexture('pomegranate-bark', 512, (g, S) => {
    const r = rng('pomegranate-bark');
    g.fillStyle = '#5c5044';
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 2200, ['rgba(132,126,116,0.2)', 'rgba(52,44,38,0.22)', 'rgba(104,86,70,0.22)'], 2, 10);
    // Long, slightly spiraling striations (old pomegranate trunks twist).
    for (let i = 0; i < 520; i++) {
      const x = r() * S, y = r() * S, len = 20 + r() * 90, light = r() < 0.45, a = 0.05 + r() * 0.12, w = 0.6 + r() * 1.6;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = light ? '#a49c90' : '#342c26';
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + len * 0.12, y + len);
        g.stroke();
      });
    }
    // Thin flakes lifting here and there.
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, rx = 4 + r() * 8, ry = rx * (2.5 + r() * 2);
      const seed = `pf${i}`;
      tiled(g, S, () => {
        g.globalAlpha = 0.5;
        g.fillStyle = r() < 0.5 ? '#78706a' : '#4c423a';
        blobPath(g, rng(seed), x, y, rx, ry, 0.4, 9);
        g.fill();
        g.globalAlpha = 0.25;
        g.strokeStyle = '#3a2e26';
        g.lineWidth = 1;
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const crownBase = 0.12;

  // A rounded vase: narrow at the crown base, widest a little above the middle, a full round top.
  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.58, baseR: 0.6, pBot: 0.9, pTop: 2.2, lump: 0.06, phase: r() * 6 });
  const nTrunks = 5;
  const az0 = r() * 6.28;
  const grown = growTree(
    r,
    Array.from({ length: nTrunks }, (_, i) => {
      const az = az0 + (i / nTrunks) * Math.PI * 2 + (r() - 0.5) * 0.8;
      const lean = 0.2 + r() * 0.26;
      const rad = H * (0.0095 + r() * 0.0035);
      const b = 0.06 + r() * 0.07;
      return { base: V(Math.cos(az) * b, -0.12, Math.sin(az) * b), dir: V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean)), length: H * (0.56 + r() * 0.16), r0: rad, r1: rad * 0.22, segs: 7, gnarl: 0.5, up: 0.1 };
    }),
    [
      // Scaffolds: ascending, spreading out of the vase.
      { perMeter: 1.6, from: 0.3, to: 0.95, angle: 0.55, angleVar: 0.18, len: 0.55, lenVar: 0.2, lenMin: 0.7, taperAlong: 0.75, radius: 0.6, tip: 0.25, segs: 5, gnarl: 0.32, up: 0.12, out: 0.22, early: 1, limit: [0.95, 1], minKeep: 0.5 },
      // Shoots: stiff, opposite, arching over at their ends.
      { perMeter: 4.2, from: 0.2, to: 0.97, angle: 0.62, angleVar: 0.22, len: 0.5, lenVar: 0.3, lenMin: 0.35, lenMax: 1.1, taperAlong: 0.75, radius: 0.55, tip: 0.3, tipMin: 0.004, segs: 4, gnarl: 0.36, up: -0.1, out: 0.12, early: 0.8, opposite: true, limit: [0.94, 1.01], minKeep: 0.35 },
      // Twigs: short, drooping a little, many of them.
      { perMeter: 10, from: 0.15, to: 0.97, angle: 0.65, angleVar: 0.25, len: 0.5, lenVar: 0.3, lenMin: 0.15, lenMax: 0.42, taperAlong: 0.8, radius: 0.55, tip: 0.5, tipMin: 0.0025, segs: 2, gnarl: 0.3, up: -0.16, early: 0.55, opposite: true, smooth: false, limit: [0.95, 1.04] },
    ],
    env,
  );
  // Cleaned up as a nursery multi-trunk is: no side limbs low on the trunks.
  const limbs: Limb[] = [];
  const keep = new Map<number, number>();
  grown.forEach((l, i) => {
    if (l.level > 0 && (!keep.has(l.parent) || (l.level === 1 && l.pts[0].y < H * crownBase * 1.7))) return;
    keep.set(i, limbs.length);
    limbs.push({ ...l, parent: l.level > 0 ? keep.get(l.parent)! : -1 });
  });
  for (const l of limbs) if (l.level === 0) rootFlare(l, 0.45, l.rad[0] * 1.6);

  const center = V(0, H * lerp(crownBase, 1, 0.52), 0), radii = V(R, H * (1 - crownBase) * 0.55, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#7f9472'), tOuter: col('#ffffff'), tNew: col('#ffe8cc') });
  const barkCol = col('#e6dccf'), stemCol = col('#a8785e'), twigCol = col('#94604a');
  emitWood(wood, limbs, {
    tile: 0.42,
    sway: T.sway,
    // Old wood gray-brown, young stems red-brown.
    color: (l, t) => (l.level >= 3 ? twigCol : l.level === 2 ? barkCol.clone().lerp(stemCol, 0.3 + t * 0.6) : l.level === 1 ? barkCol.clone().lerp(stemCol, t * 0.4) : barkCol),
    sides: (l) => (l.level >= 3 ? 3 : l.level === 2 ? 4 : l.level === 1 ? 7 : 10),
  });

  /** Sprays face out of the crown and a little up: a back face seen from outside would light like a mirror of the sky. */
  const faceOut = (at: THREE.Vector3) => T.outward(at).add(V(0, 0.2, 0)).add(V((r() - 0.5) * 0.7, (r() - 0.5) * 0.5, (r() - 0.5) * 0.7)).normalize();
  /** A leafy spray card along a shoot. */
  const spray = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const cell = tipness > 0.85 && T.depth(at) > 0.7 && r() < 0.32 ? 2 : r() < 0.22 ? 3 : r() < 0.55 ? 0 : 1;
    leafQuad(leaves, at, dir, faceOut(at), size, size, uvCell(2, 2, cell), T.tint(at, tipness), T.birth(birth, at), at, {
      segs: 2, curl: 0.2 + r() * 0.5, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.12),
    });
  };
  const tips: { p: THREE.Vector3; dir: THREE.Vector3; birth: number; level: number }[] = [];
  for (const l of limbs) {
    if (l.level < 2) continue;
    const twig = l.level === 3;
    const from = twig ? 0.1 : 0.3;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / (twig ? 0.052 : 0.08)));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (at.p.y < H * crownBase * 0.7) continue;
      // The shaded inside of the crown is mostly bare, twiggy wood.
      if (T.depth(at.p) < 0.26 + r() * 0.2) continue;
      spray(at.p, T.side(at.dir, i % 2 ? 1 : -1, 0.7, (r() - 0.55) * 0.6), l.birth, t * (twig ? 1 : 0.5), 0.24 + r() * 0.08);
    }
    const end = limbAt(l, 1);
    spray(limbAt(l, twig ? 0.55 : 0.88).p, end.dir, l.birth, 1, 0.24 + r() * 0.07);
    tips.push({ p: end.p, dir: end.dir, birth: l.birth, level: l.level });
  }
  // The grown crown's sprays come in as the tree grows (6 vertices a card); the young plant wears its own.
  for (let v = 0; v < leaves.birth.length; v += 6) {
    const b = Math.max(leaves.birth[v], 0.12 + r() * 0.3);
    for (let k = 0; k < 6 && v + k < leaves.birth.length; k++) leaves.birth[v + k] = b;
  }

  // The young plant: the growth shader shrinks the grown crown to the 15 gal's size, which would leave its leaves a
  // fifth of their size. Instead, along the stems present at install, larger sprays that shrink to about real size;
  // deep inside the grown crown they sit in its shade, and toward its outside they stay within the leaves' 1-4 in.
  for (const l of limbs) {
    if (l.birth > 0.02 || l.level > 2) continue;
    const n = Math.max(1, Math.round(l.length / (l.level === 2 ? 0.09 : 0.12)));
    for (let k = 0; k < n; k++) {
      const t = lerp(l.level === 0 ? 0.4 : 0.15, 1, (k + r() * 0.8) / n);
      const at = limbAt(l, t);
      if (at.p.y < H * crownBase * 0.8 || r() > 0.85) continue;
      const d = T.depth(at.p);
      if (d > 0.95) continue;
      let size = lerp(0.24, 0.31, r()) * lerp(2.5, 1.45, smoothstep(0.45, 0.9, d));
      const dir = T.side(at.dir, k % 2 ? 1 : -1, 0.6, (r() - 0.45) * 0.7).addScaledVector(T.outward(at.p), 0.35).normalize();
      for (let m = 0; m < 6 && T.depth(at.p.clone().addScaledVector(dir, size)) > 0.98; m++) size *= 0.82;
      const shade = lerp(0.84, 1.03, r()) * lerp(0.86, 1, smoothstep(0.2, 0.7, d));
      const c = new THREE.Color(shade * (0.96 + r() * 0.08), shade, shade * (0.93 + r() * 0.08));
      const s = T.sway(at.p) * WOOD_BEND;
      const cell = r() < 0.12 ? 2 : r() < 0.2 ? 3 : r() < 0.5 ? 0 : 1;
      leafQuad(leaves, at.p, dir, faceOut(at.p), size, size, uvCell(2, 2, cell), c, 0, at.p, {
        segs: 2, curl: 0.2 + r() * 0.5, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.12),
      });
    }
  }

  // Flowers, buds and fruit at the shoot tips of the sunlit outside of the crown.
  const inset = (u: [number, number, number, number]): [number, number, number, number] => [u[0] + 0.01, u[1] + 0.015, u[2] - 0.01, u[3] - 0.015];
  const fTint = () => jitter(col('#ffffff'), r, 0.008, 0.04, 0.03);
  /** Two crossed cards standing along `d` from `at` (a flower or buds from the side). */
  const crossed = (at: THREE.Vector3, d: THREE.Vector3, len: number, wid: number, cell: number, birth: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const a = perp(d), b = V().crossVectors(d, a).normalize();
    const rot = r() * Math.PI, c = fTint().multiplyScalar(lerp(0.8, 1, T.depth(at)));
    for (let k = 0; k < 2; k++) {
      const ang = rot + (k / 2) * Math.PI;
      const face = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      leafQuad(flowers, at, d, face, len, wid, inset(uvCell(4, 2, cell)), c, birth, at, { segs: 1, center, radii, normalBend: 0.6, sway0: s, sway1: clamp(s + 0.05) });
    }
  };
  const fruitCells: [number, number][] = [[4, 5], [5, 3], [6, 0.8]];
  const fsum = fruitCells.reduce((a, c) => a + c[1], 0);
  let nFruit = 0;
  const maxFruit = 70;
  for (const tip of tips) {
    const d = T.depth(tip.p);
    if (d < 0.62) continue;
    const o = T.outward(tip.p);
    if (o.y < -0.5 && r() < 0.7) continue;
    const roll = r();
    const s = T.sway(tip.p) * WOOD_BEND;
    // Out to the leaf surface: the shoot ends carry their flowers and fruit clear of the leaves.
    const at = tip.p.clone();
    for (let m = 0; m < 12 && T.depth(at) < 0.95; m++) at.addScaledVector(o, 0.02);
    if (roll < 0.36) {
      // An open flower, pointing out of the crown and a little up, or nodding.
      const dir = tip.dir.clone().lerp(o, 0.5).add(V(0, 0.3 + (r() - 0.5) * 0.8, 0)).normalize();
      const len = 0.055 + r() * 0.02;
      const birth = clamp(Math.max(tip.birth, 0.17) + r() * 0.3, 0, 0.85);
      if (r() < 0.72) crossed(at, dir, len, len * 0.95, r() < 0.7 ? 0 : 3, birth);
      else {
        // Seen face-on: a card facing out of the crown.
        const face = o.clone().add(V((r() - 0.5) * 0.5, 0.25, (r() - 0.5) * 0.5)).normalize();
        const side = V().crossVectors(face, UP);
        if (side.lengthSq() < 0.01) side.set(1, 0, 0);
        side.normalize();
        const w = 0.042 + r() * 0.012;
        const up2 = V().crossVectors(side, face).normalize();
        leafQuad(flowers, at.clone().addScaledVector(up2, -w * 0.5), up2, face, w, w, inset(uvCell(4, 2, 1)), fTint(), birth, tip.p, { segs: 1, center, radii, normalBend: 0.5, sway0: s, sway1: s });
      }
    } else if (roll < 0.5) {
      const dir = tip.dir.clone().lerp(o, 0.4).add(V(0, 0.4, 0)).normalize();
      crossed(at, dir, 0.05 + r() * 0.015, 0.05, r() < 0.75 ? 2 : 7, clamp(Math.max(tip.birth, 0.17) + r() * 0.3, 0, 0.85));
    } else if (roll < 0.7 && nFruit < maxFruit) {
      // A fruit hanging from the shoot end, crown down and a little out.
      let pick = r() * fsum, cell = fruitCells[0][0];
      for (const [ci, w] of fruitCells) { if ((pick -= w) <= 0) { cell = ci; break; } }
      const rad = lerp(0.036, 0.047, r()) * (cell === 6 ? 0.75 : 1);
      const hz = V(o.x, 0, o.z).normalize();
      const c = at.clone().addScaledVector(hz, rad * 0.3).add(V(0, -rad * 1.05, 0));
      const tilt = hz.clone().multiplyScalar(0.25 + r() * 0.35).add(V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3)).negate();
      const tint = new THREE.Color(1, 0.97 + r() * 0.05, 0.95 + r() * 0.06).multiplyScalar(lerp(0.85, 1.02, d));
      const birth = clamp(Math.max(tip.birth, 0.3) + r() * 0.45, 0, 0.85);
      latheFruit(flowers, c, rad, pomProfile, inset(uvCell(4, 2, cell)), tint, birth, tip.p, s, 10, 14, r() * 6, tilt);
      nFruit++;
    }
  }

  fitBuilders([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: pomegranateLeaves(),
    flowerMap: pomegranateFlowers(),
    bark: { map: pomegranateBark() },
    look: { translucency: 0.32, leafRoughness: 0.66, bend: 0.26, flutter: 0.022 },
  };
};
