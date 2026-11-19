import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafQuad, leafTexture, lerp, perp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { cellClip, faceCard, hardenAlpha, stemBark, tone } from './shared-shrubs-b';
import { paintGlossLeaf, type GlossLeaf } from './shared-glossy';

/**
 * Star jasmine, Trachelospermum jasminoides, a 5 gal vine trained on its
 * nursery trellis and planted against a fence or wall, in bloom.
 *
 * The trellis is what the nurseries ship trellised and espaliered star jasmine
 * on: a flat panel of rough cedar lath, uprights with cross pieces nailed
 * over them, the canes tied on with green tie tape. Here four 1-1/2 x 3/8 in
 * uprights about 8 in apart and six cross pieces, about 28 in wide and 4 ft
 * above the soil, its legs pushed into the root ball. The vine: several
 * woody canes from the crown twine up the uprights, laterals run along the
 * cross pieces, and leafy shoots stand out toward the light. Leaves opposite,
 * elliptic, tapered at both ends, about 2 to 2.5 in, glossy dark green and
 * leathery, new growth lighter lime to bronze. Clusters (cymes) of five to a
 * dozen white flowers, about 1 in across, five petals twisted into a
 * pinwheel around a pale yellow throat, on stalks held out past the leaves,
 * with slender twisted buds; heaviest in late spring.
 *
 * As it grows it fills the trellis, then goes on past it: canes run out
 * sideways along the fence (tied to it, as installers do) and up over the
 * trellis top, until the plant is a screen about 7 ft tall and 8 ft wide with
 * the trellis lost inside it. The trellis keeps its size: the model is not
 * scaled with growth (SpeciesLook.trained); stems lengthen and new parts
 * appear as the plant reaches them.
 *
 * Orientation: a placement has no rotation of its own, so the plant stands
 * with its back (local -Z, the trellis side) to the nearest fence, wall or
 * building wall within 1.5 m, and faces plan +y when there is none.
 *
 * References:
 *  - Oregon State University Landscape Plants, Trachelospermum jasminoides:
 *    twining evergreen vine 10 to 20 ft (3 to 6 m) when supported, about 2 ft
 *    as a groundcover; leaves opposite, leathery, glossy dark green, tapered
 *    at both ends, petiole about 5 mm; flowers white, 2.5 cm wide, five
 *    petals, pinwheel shape, in small clusters, fragrant.
 *    https://landscapeplants.oregonstate.edu/plants/trachelospermum-jasminoides
 *  - NC State Extension Plant Toolbox: 3 to 20 ft; leaves elliptic to
 *    oval-lanceolate, juvenile bronze-purplish becoming lustrous dark green;
 *    flowers under 1 in, in cymes, spring with some through summer.
 *    https://plants.ces.ncsu.edu/plants/trachelospermum-jasminoides/
 *  - Monrovia, Star Jasmine: twining stems climb 18 to 20 ft with support;
 *    star-shaped white flowers with pale yellow centers in clusters, spring
 *    into summer. https://www.monrovia.com/star-jasmine.html
 *  - Grange Co-op, 5 gal Trachelospermum jasminoides on trellis: climbing
 *    vine 10 to 20 ft, spreading up to 20 ft; in a container with trellis 6
 *    to 10 ft. https://www.grangecoop.com/5-trach-jasminoides-trellis/
 *  - Plants Express, Star Jasmine Espalier (5 and 15 gal): espaliers are
 *    typically 4 to 6 ft tall at delivery and spread 6 to 10 ft wide over
 *    time. https://plantsexpress.com/products/star-jasmine-espalier
 *  - Trellis: product photos of trellised and espaliered star jasmine (One
 *    Plant Shop, 15 gal on a 5 x 5 ft cedar lath panel; Plants Express and
 *    Loen Nursery espaliers; Plant Clearance, 5 gal staked 4 to 5 ft on
 *    bamboo canes). No grower lists the 5 gal trellis size, so the panel is
 *    the 15 gal lath panel's build at the 5 gal height.
 * Catalog: the client's list gives no size, so 5 gal: on its trellis 1.3 m tall
 * x 0.75 m wide at install; mature 2.1 m tall x 2.4 m wide (7 x 8 ft: a little
 * over a 6 ft fence, the middle of Plants Express's 6 to 10 ft spread; kept
 * there, far under the 20 ft it can climb) in about 5 years.
 */

const TAU = Math.PI * 2;

const LEAF: GlossLeaf = {
  base: '#203f17', dark: '#0d2208', fresh: '#86a63a', aspect: 0.4, widest: 0.46, tip: 0.84,
  veins: 7, impressed: 0.14, gloss: 0.3, midrib: 'rgba(176,200,124,0.75)',
};
const BRONZE: GlossLeaf = { ...LEAF, fresh: '#7c7632' };

type UV = [number, number, number, number];

/**
 * Leaf atlas, 1024 x 768. Top row: 8 single leaves (128 x 256): 0-5 mature, 6 young lime, 7 young bronze. Below,
 * 8 sprays (256 x 256): a shoot of opposite pairs seen from the front, twig at the cell bottom; 0-3 mature, 4-5 with
 * young tips, 6-7 in shade.
 */
function leafAtlas(): { map: THREE.Texture; leaf: (i: number) => UV; spray: (i: number) => UV } {
  const map = leafTexture('star-jasmine-trellis-leaves', 1024, 768, (g) => {
    const r = rng('star-jasmine-trellis-leaf-tex');
    const fresh = [0, 0.04, 0.08, 0, 0.12, 0.05, 0.85, 0.8];
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, i === 7 ? BRONZE : { ...LEAF, aspect: 0.38 + r() * 0.05 }, { fresh: fresh[i], shade: (r() - 0.5) * 0.25 });
      g.restore();
    }
    for (let i = 0; i < 8; i++) {
      cellClip(g, i % 4, 1 + Math.floor(i / 4), 256, 256);
      paintPairs(g, r, i >= 4 && i < 6 ? 0.9 : 0.15, i >= 6 ? -0.5 : (r() - 0.5) * 0.25, i === 5);
      g.restore();
    }
    hardenAlpha(g, 1024, 768);
  });
  const e = 1.5 / 1024;
  return {
    map,
    leaf: (i) => [i / 8 + e, 2 / 3 + e * 1.5, (i + 1) / 8 - e, 1 - e * 1.5],
    spray: (i) => {
      const cx = i % 4, cy = 1 + Math.floor(i / 4);
      return [cx / 4 + e, 1 - (cy + 1) / 3 + e * 1.5, (cx + 1) / 4 - e, 1 - cy / 3 - e * 1.5];
    },
  };
}

/**
 * A shoot of opposite leaf pairs seen from the front in a 256 x 256 cell: the twig rises from the bottom center, a
 * pair at each node (every other pair turned, so one leaf of it is foreshortened), the last pair small and young.
 */
function paintPairs(g: CanvasRenderingContext2D, r: () => number, young: number, shade: number, bronze: boolean) {
  const S = 256;
  const nodes = 4;
  const pts: [number, number][] = [[S / 2, S - 2]];
  let x = S / 2, y = S - 2, a = -Math.PI / 2 + (r() - 0.5) * 0.25;
  const bend = (r() - 0.5) * 0.3;
  const jobs: { x: number; y: number; rot: number; len: number; fresh: number; shade: number; squash: number; back: boolean }[] = [];
  for (let k = 0; k < nodes; k++) {
    const t = (k + 1) / nodes;
    a += bend / nodes;
    const step = S * lerp(0.2, 0.15, t);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
    const turned = k % 2 === 1;
    const len = S * lerp(0.42, 0.3, Math.pow(t, 1.4)) * (0.9 + r() * 0.15);
    const fr = clamp(young * Math.pow(t, 2) * 1.1);
    for (const sd of [-1, 1]) {
      const spread = turned ? 0.45 + r() * 0.3 : 0.95 + r() * 0.35;
      jobs.push({ x, y, rot: a + sd * spread, len: len * (turned && sd > 0 ? 0.7 : 1), fresh: fr, shade: shade + (turned && sd < 0 ? -0.35 : (r() - 0.5) * 0.2), squash: turned ? 0.55 + r() * 0.2 : 0.85 + r() * 0.2, back: turned && sd < 0 });
    }
  }
  // The terminal pair, young and folded up together.
  x += Math.cos(a) * S * 0.05;
  y += Math.sin(a) * S * 0.05;
  pts.push([x, y]);
  for (const sd of [-1, 1]) jobs.push({ x, y, rot: a + sd * 0.3, len: S * 0.17, fresh: clamp(young + 0.4), shade: shade + 0.1, squash: 0.7, back: false });
  const draw = (j: (typeof jobs)[number]) => paintGlossLeaf(g, r, j.x + Math.cos(j.rot) * 3, j.y + Math.sin(j.rot) * 3, j.len, j.rot, bronze && j.fresh > 0.3 ? BRONZE : LEAF, { fresh: j.fresh, shade: j.shade, squash: j.squash });
  jobs.filter((j) => j.back).forEach(draw);
  g.strokeStyle = tone('#5d7036', '#6b4a30', 0.4);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.stroke();
  jobs.filter((j) => !j.back).sort((p, q) => q.y - p.y).forEach(draw);
}

/**
 * Flower atlas, 2 x 2 cells of 512: 0-2 cymes seen from the front (more and more open, on a stalk from the cell
 * bottom), 3 a cyme seen from the side. A flower is about 140 px across, so a cell is about 9 cm on the plant.
 */
function flowerAtlas(white: string, throat: string): THREE.Texture {
  return leafTexture('star-jasmine-trellis-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('star-jasmine-trellis-flower-tex');
    const cream = tone(white, throat, 0.35);
    /** One open pinwheel flower at (x, y), `R` to the petal tips, squashed to `sq` when tilted away. */
    const flower = (x: number, y: number, R: number, rot: number, sq: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(1, sq);
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate((i / 5) * TAU);
        // A strap petal widening outward, its tip cut off at a slant and the whole petal twisted the same way
        // as the others: the pinwheel.
        const w = R * 0.42;
        const grad = g.createLinearGradient(0, 0, R, 0);
        grad.addColorStop(0, cream);
        grad.addColorStop(0.3, white);
        grad.addColorStop(1, tone(white, '#ffffff', 0.5));
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(R * 0.08, -R * 0.06);
        g.bezierCurveTo(R * 0.4, -w * 0.55, R * 0.8, -w * 0.62, R * 0.98, -w * 0.18);
        g.quadraticCurveTo(R * 1.02, w * 0.1, R * 0.9, w * 0.32);
        g.lineTo(R * 0.62, w * 0.5);
        g.bezierCurveTo(R * 0.42, w * 0.42, R * 0.22, w * 0.22, R * 0.08, R * 0.06);
        g.closePath();
        g.shadowColor = 'rgba(70,70,40,0.45)';
        g.shadowBlur = 8;
        g.fill();
        g.shadowBlur = 0;
        // The twist: one half of the petal in a soft shade, a crease down its length.
        g.save();
        g.clip();
        g.fillStyle = 'rgba(120,120,90,0.13)';
        g.beginPath();
        g.moveTo(R * 0.1, 0);
        g.bezierCurveTo(R * 0.5, w * 0.1, R * 0.8, w * 0.25, R, w * 0.4);
        g.lineTo(R, w);
        g.lineTo(0, w);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(150,150,110,0.25)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(R * 0.15, 0);
        g.quadraticCurveTo(R * 0.55, -w * 0.05, R * 0.95, -w * 0.02);
        g.stroke();
        g.restore();
        g.restore();
      }
      // The throat: the mouth of the corolla tube, pale yellow, with a darker ring.
      const tg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
      tg.addColorStop(0, tone(throat, '#c8a840', 0.4));
      tg.addColorStop(0.55, throat);
      tg.addColorStop(1, tone(throat, white, 0.7));
      g.fillStyle = tg;
      g.beginPath();
      g.arc(0, 0, R * 0.2, 0, TAU);
      g.fill();
      g.restore();
    };
    /** A bud: a slender pale tube with a twisted, pointed tip, base at (x, y) pointing along `ang`. */
    const bud = (x: number, y: number, len: number, ang: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      const w = len * 0.17;
      const grad = g.createLinearGradient(0, -w, 0, w);
      grad.addColorStop(0, '#d9dfc0');
      grad.addColorStop(0.5, '#fbfaf0');
      grad.addColorStop(1, '#c7cfa8');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -w * 0.5);
      g.lineTo(len * 0.55, -w * 0.45);
      g.quadraticCurveTo(len * 0.8, -w * 1.2, len, 0);
      g.quadraticCurveTo(len * 0.8, w * 1.1, len * 0.55, w * 0.45);
      g.lineTo(0, w * 0.5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(120,130,90,0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(len * 0.62, -w * 0.6);
      g.lineTo(len * 0.95, w * 0.2);
      g.stroke();
      // Green calyx at the base.
      g.fillStyle = '#6f8a3a';
      g.beginPath();
      g.ellipse(0, 0, w * 0.7, w * 0.75, 0, 0, TAU);
      g.fill();
      g.restore();
    };
    const stalk = '#7d9446';
    /** A cyme: a stalk from the cell bottom forks into pedicels ending in flowers and buds. */
    const cyme = (cx: number, cy: number, nOpen: number, nBud: number, side: boolean) => {
      const fork = { x: S / 2 + (r() - 0.5) * 30, y: S * 0.62 };
      g.strokeStyle = stalk;
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(S / 2, S - 2);
      g.quadraticCurveTo(S / 2 + (r() - 0.5) * 40, S * 0.8, fork.x, fork.y);
      g.stroke();
      const items: { x: number; y: number; open: boolean }[] = [];
      for (let tries = 0; tries < 900 && items.length < nOpen + nBud; tries++) {
        const open = items.filter((q) => q.open).length < nOpen;
        const a = -Math.PI / 2 + (r() - 0.5) * (side ? 2.2 : 3.4);
        const d = (side ? 0.18 : 0.12) * S + r() * S * (side ? 0.2 : 0.26);
        const x = cx + Math.cos(a) * d * (side ? 1.2 : 1), y = cy + Math.sin(a) * d * (side ? 0.55 : 0.85) + (side ? 0 : S * 0.05);
        const need = open ? S * 0.2 : S * 0.07;
        if (items.every((q) => Math.hypot(q.x - x, q.y - y) > (q.open && open ? S * 0.21 : need))) items.push({ x, y, open });
      }
      g.lineWidth = 3;
      for (const q of items) {
        g.beginPath();
        g.moveTo(fork.x, fork.y);
        g.quadraticCurveTo((fork.x + q.x) / 2 + (r() - 0.5) * 20, (fork.y + q.y) / 2 + 12, q.x, q.y + (q.open ? 0 : 8));
        g.stroke();
      }
      // Buds behind, flowers over them, lower ones first.
      for (const q of items.filter((p) => !p.open)) bud(q.x, q.y + 8, S * (0.09 + r() * 0.05), -Math.PI / 2 + (q.x - fork.x) / S * 1.6 + (r() - 0.5) * 0.4);
      items.filter((p) => p.open).sort((p, q) => p.y - q.y).forEach((q) => flower(q.x, q.y, S * (0.125 + r() * 0.02), r() * TAU, side ? 0.35 + r() * 0.25 : 0.72 + r() * 0.28));
    };
    cellClip(g, 0, 0, S, S); cyme(S / 2, S * 0.42, 5, 5, false); g.restore();
    cellClip(g, 1, 0, S, S); cyme(S / 2, S * 0.42, 8, 3, false); g.restore();
    cellClip(g, 0, 1, S, S); cyme(S / 2, S * 0.4, 2, 7, false); g.restore();
    cellClip(g, 1, 1, S, S); cyme(S / 2, S * 0.42, 5, 4, true); g.restore();
    hardenAlpha(g, 1024, 1024);
  });
}

const UV4 = (i: number): UV => {
  const e = 1.5 / 1024, cx = i % 2, cy = Math.floor(i / 2);
  return [cx / 2 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 2 - e, 1 - cy / 2 - e];
};

/**
 * A rectangular board from `a` to `b` (its center line), `w` wide and `t` thick, its broad face toward `front`. Its
 * vertices anchor to themselves, so it is there at every growth stage and never moves.
 */
function board(g: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, front: THREE.Vector3, c: THREE.Color, uvScale = 1) {
  const d = b.clone().sub(a);
  const len = d.length();
  d.normalize();
  const f = front.clone().addScaledVector(d, -front.dot(d)).normalize();
  const s = V().crossVectors(d, f).normalize();
  const corner = (end: THREE.Vector3, i: number, j: number) => end.clone().addScaledVector(s, (i - 0.5) * w).addScaledVector(f, (j - 0.5) * t);
  const face = (n: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, uw: number, vl: number) => {
    const i0 = g.vert(p0, n, 0, 0, c, 0, p0, 0);
    const i1 = g.vert(p1, n, uw, 0, c, 0, p1, 0);
    const i2 = g.vert(p2, n, uw, vl, c, 0, p2, 0);
    const i3 = g.vert(p3, n, 0, vl, c, 0, p3, 0);
    g.quad(i0, i1, i2, i3);
  };
  const v = len * 6 * uvScale, cw = w * 6 * uvScale, ct = t * 6 * uvScale;
  const sh = c.clone().multiplyScalar(0.8);
  face(f, corner(a, 0, 1), corner(a, 1, 1), corner(b, 1, 1), corner(b, 0, 1), cw, v);
  face(f.clone().negate(), corner(a, 1, 0), corner(a, 0, 0), corner(b, 0, 0), corner(b, 1, 0), cw, v);
  const i = g.count;
  face(s, corner(a, 1, 1), corner(a, 1, 0), corner(b, 1, 0), corner(b, 1, 1), ct, v);
  face(s.clone().negate(), corner(a, 0, 0), corner(a, 0, 1), corner(b, 0, 1), corner(b, 0, 0), ct, v);
  // The sawn edges a touch darker.
  for (let k = i; k < g.count; k++) {
    g.col[k * 3] = sh.r;
    g.col[k * 3 + 1] = sh.g;
    g.col[k * 3 + 2] = sh.b;
  }
  face(d.clone().negate(), corner(a, 0, 0), corner(a, 1, 0), corner(a, 1, 1), corner(a, 0, 1), cw, ct);
  face(d, corner(b, 0, 1), corner(b, 1, 1), corner(b, 1, 0), corner(b, 0, 0), cw, ct);
}

/** A node on a stem: where a leaf pair, a lateral or a flower cluster can grow from. */
interface Node {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  /** Growth fraction at which this part of the stem is there (0 at install, 1 at maturity). */
  g: number;
  rad: number;
  /** Free (not tied to the trellis or fence): sways more. */
  free: boolean;
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = leafAtlas();

  /* ---------------------------------------------------------------- */
  /* The nursery trellis                                                */
  /* ---------------------------------------------------------------- */

  // Local frame: x along the trellis, y up, +z the front (away from the fence). The trellis stands just behind the crown.
  const ZT = -0.06, LW = 0.038, LT = 0.0095;
  const ups = [-0.315, -0.105, 0.105, 0.315];
  const rails = [0.16, 0.37, 0.58, 0.79, 1.0, 1.21];
  const TOP = 1.235, HALF = 0.355;
  const FRONT = V(0, 0, 1);
  const cedar = col('#c79466');
  ups.forEach((x) => board(wood, V(x, -0.12, ZT), V(x + (r() - 0.5) * 0.004, TOP, ZT), LW, LT, FRONT, jitter(cedar, r, 0.01, 0.04, 0.05), 1));
  // Cross pieces nailed over the uprights' front faces.
  for (const y of rails) board(wood, V(-HALF, y, ZT + LT), V(HALF, y + (r() - 0.5) * 0.006, ZT + LT), LW, LT, FRONT, jitter(cedar, r, 0.01, 0.04, 0.05), 1);
  const tieC = col('#4f8f3a');

  /* ---------------------------------------------------------------- */
  /* Growth: when the plant reaches a point                              */
  /* ---------------------------------------------------------------- */

  const WM = Sp / 2, W0 = spec.installSpread / 2 - 0.02, H0 = spec.installHeight - 0.03;
  const bulge = [r() * TAU, r() * TAU];
  /** Half width of the mature screen at height y: a little narrower at the ground, a flattened dome on top. */
  const halfW = (y: number) => {
    const foot = lerp(0.8, 1, smoothstep(0, 0.4, y));
    const top = y > 1.5 ? Math.cbrt(Math.max(0, 1 - Math.pow(clamp((y - 1.5) / (H - 1.5)), 3))) : 1;
    // Its sides bulge and dip where canes ran out farther or shorter.
    return WM * foot * top * (0.95 + 0.04 * Math.sin(y * 4.3 + bulge[0]) + 0.025 * Math.sin(y * 9.1 + bulge[1]));
  };
  /**
   * The growth fraction at which the plant has spread to a point (0 inside the nursery plant's size). A vine climbs
   * first, so it gets up over the trellis sooner than out to the sides; out and up at once it gets there later
   * (rounded corners); and the edge of new growth is ragged, as canes run out unevenly.
   */
  const rag = [0, 1, 2].map(() => ({ kx: 2.5 + r() * 3, ky: 2 + r() * 3, ph: r() * TAU }));
  const gOf = (p: THREE.Vector3) => {
    const ax = Math.max(0, (Math.abs(p.x) - W0) / (WM - W0)), ay = Math.max(0, (p.y - H0) / (H - H0)) * 0.85;
    if (ax + ay <= 0) return 0;
    const n = rag.reduce((acc, k) => acc + Math.sin(p.x * k.kx + k.ph) * Math.sin(p.y * k.ky + k.ph * 1.7), 0) / 1.5;
    return clamp(Math.hypot(ax, ay) * (1 + 0.2 * n) + 0.05 * n, 0.002, 1);
  };
  /** The birth for a part that should be there once the plant has grown `g` of the way (see engine/foliage.ts). */
  const born = (g: number) => (g <= 0.001 ? 0 : (Math.min(g, 0.96) + 0.02) / 0.75);

  const swayAt = (p: THREE.Vector3, free: boolean) => clamp((free ? 0.12 : 0.02) + (p.y / H) * (free ? 0.25 : 0.05) + Math.max(0, p.z - ZT) * (free ? 0.8 : 0.3));
  const nodes: Node[] = [];
  const caneOld = col('#6b5240'), caneMid = col('#6e5a3a'), caneYoung = col('#66803c');

  /**
   * A stem along `pts`: tube pieces that each appear when the plant reaches them (anchored at their start, so the
   * stem lengthens), with a node every `step` meters. `delay` holds a whole stem back (filling in).
   */
  const cane = (pts: THREE.Vector3[], r0: number, r1: number, free: boolean, delay = 0, step = 0.05, sides = 4) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
    let run = 0, next = step * (0.4 + r() * 0.6);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = a.distanceTo(b);
      const ra = lerp(r0, r1, run / total), rb = lerp(r0, r1, (run + seg) / total);
      const gs = clamp(Math.max(gOf(a.clone().lerp(b, 0.5)), delay));
      const c = ra > 0.0035 ? caneOld.clone().lerp(caneMid, clamp((0.006 - ra) / 0.0025)) : caneMid.clone().lerp(caneYoung, clamp((0.0035 - ra) / 0.0015));
      tube(wood, [a, b], ra, rb, ra < 0.003 ? 3 : sides, c, born(gs), a, (k) => swayAt(k ? b : a, free), 2);
      const dir = b.clone().sub(a).normalize();
      while (next <= run + seg) {
        const p = a.clone().lerp(b, (next - run) / seg);
        nodes.push({ p, dir, g: clamp(Math.max(gOf(p), delay)), rad: lerp(ra, rb, (next - run) / seg), free });
        next += step * (0.85 + r() * 0.3);
      }
      run += seg;
    }
  };

  /* ---------------------------------------------------------------- */
  /* The nursery plant: canes twining up the uprights                   */
  /* ---------------------------------------------------------------- */

  const crown = V(0, 0.015, 0.005);
  // Two canes on each inner upright, one on each outer.
  const canes = [0, 1, 1, 2, 2, 3];
  canes.forEach((u, k) => {
    const x = ups[u];
    const base = crown.clone().add(V((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.03));
    const meet = 0.16 + r() * 0.12;
    const pts: THREE.Vector3[] = [base];
    // From the crown out to the upright, rising.
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      pts.push(V(lerp(base.x, x, Math.pow(t, 0.8)), lerp(base.y, meet, t), lerp(base.z, ZT + 0.016, t)));
    }
    // Then twining up it: a loose helix around the lath, about one turn every 9 in.
    const ph = r() * TAU + (k % 2) * Math.PI, pitch = 0.2 + r() * 0.05;
    const topY = TOP + 0.02 + r() * 0.03;
    for (let y = meet + 0.02; y < topY; y += 0.03) {
      const th = ph + ((y - meet) / pitch) * TAU;
      pts.push(V(x + Math.cos(th) * (LW / 2 + 0.006), y, ZT + Math.sin(th) * (LT / 2 + 0.007)));
    }
    // Past the top it leans out and up, free.
    const last = pts[pts.length - 1];
    const lean = V((r() - 0.5) * 0.25 + Math.sign(x) * 0.08, 1, 0.25 + r() * 0.2).normalize();
    for (let i = 1; i <= 4; i++) pts.push(last.clone().addScaledVector(lean, i * 0.025).add(V(0, 0, -0.003 * i * i)));
    cane(pts, 0.0052, 0.0016, false);
    // Green tie tape where the cane is tied to the upright.
    for (const y of [0.3, 0.62, 0.95]) {
      const yy = y + (r() - 0.5) * 0.06;
      if (yy < meet + 0.03) continue;
      board(wood, V(x, yy - 0.007, ZT + 0.003), V(x, yy + 0.007, ZT + 0.003), LW + 0.008, LT + 0.022, FRONT, tieC);
    }
  });
  // Laterals trained along the cross pieces, tied on just in front of them.
  for (const y of rails) {
    for (let u = 0; u < 4; u++) {
      if (r() < 0.3) continue;
      const x0 = ups[u];
      const sd = u < 2 ? -1 : 1;
      const dir = r() < 0.7 ? sd : -sd;
      const len = 0.1 + r() * 0.08;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        pts.push(V(x0 + dir * len * t, y + 0.022 + Math.sin(t * 3 + y * 7) * 0.006 + t * 0.01, ZT + LT + 0.012 + t * 0.006));
      }
      cane(pts, 0.0024, 0.0013, false, r() < 0.3 ? 0.1 + r() * 0.15 : 0, 0.045, 3);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Mature growth: canes run out along the fence and over the top       */
  /* ---------------------------------------------------------------- */

  /** A cane from `a` heading toward `b`, wandering and lying near the fence plane (z close to the trellis). */
  const runner = (a: THREE.Vector3, b: THREE.Vector3, r0: number, waves = 2, zLift = 0.02) => {
    const n = Math.max(6, Math.round(a.distanceTo(b) / 0.06));
    const side = V().crossVectors(b.clone().sub(a).normalize(), FRONT).normalize();
    const ph = r() * TAU, amp = 0.025 + r() * 0.03;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t).addScaledVector(side, Math.sin(t * waves * Math.PI + ph) * amp * Math.sin(Math.PI * t));
      p.z = lerp(a.z, ZT + zLift + Math.sin(t * 7 + ph) * 0.012, smoothstep(0, 0.3, t));
      pts.push(p);
    }
    cane(pts, r0, 0.0014, false);
  };
  for (const sd of [-1, 1]) {
    // Arms along the fence from the outer uprights, at several heights, some rising as they go.
    for (const y of [0.22, 0.5, 0.82, 1.12]) {
      const a = V(sd * ups[3], y + (r() - 0.5) * 0.05, ZT + 0.012);
      const reach = halfW(y) * (0.84 + r() * 0.1);
      const b = V(sd * reach, y + (r() - 0.2) * 0.25, ZT + 0.02);
      runner(a, b, 0.0042, 2 + Math.floor(r() * 2));
      // Side arms climbing off them.
      for (let k = 0; k < 2; k++) {
        const t = 0.3 + k * 0.35 + r() * 0.1;
        const s0 = a.clone().lerp(b, t);
        const yb = Math.min(H - 0.15, s0.y + 0.35 + r() * 0.45);
        const s1 = V(s0.x + sd * (0.1 + r() * 0.25), yb, ZT + 0.03);
        s1.x = sd * Math.min(Math.abs(s1.x), halfW(yb) * 0.9);
        runner(s0, s1, 0.0026, 1);
      }
    }
  }
  // Over the top of the trellis: canes fanning up onto the fence and beyond it.
  for (let k = 0; k < 9; k++) {
    const x0 = ups[k % 4] + (r() - 0.5) * 0.05;
    const a = V(x0, TOP - 0.04, ZT + 0.01);
    const ang = lerp(-1.05, 1.05, (k + r() * 0.6) / 9);
    const len = 0.55 + r() * 0.35;
    const b = V(x0 + Math.sin(ang) * len, TOP + Math.cos(ang) * len * 0.95, ZT + 0.035);
    b.y = Math.min(b.y, H - 0.08);
    b.x = Math.sign(b.x) * Math.min(Math.abs(b.x), halfW(b.y) * 0.92);
    runner(a, b, 0.0034, 2);
  }

  /* ---------------------------------------------------------------- */
  /* Foliage                                                             */
  /* ---------------------------------------------------------------- */

  const center = V(0, H * 0.45, ZT - 0.9), radii = V(WM + 0.4, H, 1.0);
  const white = new THREE.Color(1, 1, 1);
  /** Leaf tint: darker deep in the screen (near the fence) and low down. */
  const shadeAt = (p: THREE.Vector3, extra = 1) => {
    const depth = clamp((p.z - ZT + 0.02) / 0.28);
    return jitter(white, r, 0.012, 0.04, 0.05).multiplyScalar(lerp(0.5, 1, Math.pow(depth, 0.8)) * lerp(0.8, 1, clamp(p.y / (H * 0.5))) * extra * (0.85 + r() * 0.12));
  };
  /** Leaves face out from the screen and up to the light, each a little differently. */
  const faceOut = (lift = 0.35) => V((r() - 0.5) * 0.9, lift + (r() - 0.5) * 0.4, 1).normalize();
  const leafAt = (p: THREE.Vector3, dir: THREE.Vector3, len: number, cell: number, c: THREE.Color, g: number, free: boolean, anchor = p) => {
    const s = swayAt(p, free);
    // Leaves deep in the screen are flat cards; those out front curve.
    leafQuad(leaves, p, dir, faceOut(), len, len * 0.42, at.leaf(cell), c, born(g), anchor, { segs: p.z - ZT > 0.06 ? 2 : 1, curl: 0.2 + r() * 0.35, center, radii, normalBend: 0.25, sway0: s, sway1: clamp(s + 0.05) });
  };
  /** An opposite pair at a node, held out to both sides of the stem and toward the front. */
  const pairAt = (p: THREE.Vector3, dir: THREE.Vector3, len: number, g: number, free: boolean, young = false) => {
    const side = V().crossVectors(dir, FRONT);
    if (side.lengthSq() < 1e-4) side.copy(perp(dir));
    side.normalize();
    for (const sd of [-1, 1]) {
      const d = dir.clone().multiplyScalar(0.45).addScaledVector(side, sd * 0.85).add(V(0, 0.12, 0.35 + r() * 0.3)).normalize();
      const cell = young ? 6 + (r() < 0.12 ? 1 : 0) : Math.floor(r() * 6);
      leafAt(p.clone().addScaledVector(d, 0.004), d, len * (0.88 + r() * 0.24), cell, shadeAt(p), g, free, p);
    }
  };
  const sprayAt = (p: THREE.Vector3, dir: THREE.Vector3, len: number, cell: number, c: THREE.Color, g: number, free: boolean) => {
    const s = swayAt(p, free);
    leafQuad(leaves, p, dir, faceOut(0.25), len, len, at.spray(cell), c, born(g), p, { segs: 2, curl: 0.15 + r() * 0.25, center, radii, normalBend: 0.3, sway0: s, sway1: clamp(s + 0.08) });
  };
  const flowerTint = () => jitter(col('#ffffff'), r, 0.005, 0.02, 0.03).multiplyScalar(0.88 + r() * 0.1);
  /** A flower cluster on its stalk, held out from `p` past the leaves. */
  const cymeAt = (p: THREE.Vector3, g: number, size = 1) => {
    const out = V((r() - 0.5) * 0.7, 0.35 + r() * 0.4, 1).normalize();
    const c = p.clone().addScaledVector(out, 0.035 + r() * 0.02);
    const s = clamp(swayAt(p, true) + 0.08);
    const sz = (0.085 + r() * 0.025) * size;
    const n = out.clone().lerp(FRONT, 0.4).normalize();
    // A cluster is in bloom a little after its shoot is there.
    const b = born(clamp(g + (g > 0 ? 0.03 : 0)));
    faceCard(flowers, c.clone().add(V(0, sz * 0.25, 0)), n, sz, (r() - 0.5) * 0.7, UV4(r() < 0.3 ? 0 : r() < 0.75 ? 1 : 2), flowerTint(), b, p, s, n.clone().lerp(V(0, 1, 0), 0.25).normalize());
    if (r() < 0.4) {
      const n2 = n.clone().applyAxisAngle(V(0, 1, 0), (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.4));
      faceCard(flowers, c.clone().add(V(0, sz * 0.2, 0)), n2, sz * 0.9, (r() - 0.5) * 0.5, UV4(3), flowerTint(), b, p, s, n.clone());
    }
  };

  // Leaf pairs at every node of every cane; on the young end of a cane, the young pairs and often a cluster.
  const stemNodes = nodes.slice();
  for (const nd of stemNodes) {
    pairAt(nd.p, nd.dir, 0.05 + r() * 0.012, nd.g, nd.free, nd.rad < 0.0019);
    if (nd.rad < 0.0024 && r() < 0.22) cymeAt(nd.p, nd.g, 0.9);
    // Along the canes out on the fence, short shoots lie flat against it: the dark inner layer of the screen.
    if (nd.g > 0 && r() < 0.7) {
      const d = nd.dir.clone().add(V((r() - 0.5) * 1.2, 0.5 + r() * 0.5, 0.1)).normalize();
      sprayAt(nd.p, d, 0.17 + r() * 0.05, 6 + Math.floor(r() * 2), shadeAt(nd.p, 0.85), nd.g, false);
    }
  }

  // Shoots out to the whole screen: from the nearest cane node to evenly spread points over the mature shape, each
  // a short lateral with leaf pairs, a leafy spray at its end and often a flower cluster. Inside the nursery plant's
  // size a share of them fill in over the first year.
  const lateral = (q: THREE.Vector3, back: boolean) => {
    let best = -1, bd = 0.34 * 0.34;
    for (let i = 0; i < stemNodes.length; i++) {
      const nd = stemNodes[i];
      if (nd.p.y > q.y + 0.1) continue;
      const d = nd.p.distanceToSquared(q);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    const nd = stemNodes[best];
    const v = q.clone().sub(nd.p);
    const L = v.length();
    if (L < 0.03) return;
    const inside = gOf(q) <= 0;
    const fill = inside && r() < (back ? 0.25 : 0.4) ? 0.06 + r() * 0.22 : 0;
    const g0 = Math.max(nd.g, gOf(q), fill);
    const g = g0 > 0 ? clamp(g0 + (r() - 0.5) * 0.08, 0.002, 1) : 0;
    const mid = nd.p.clone().lerp(q, 0.5).add(V(0, L * 0.12, L * 0.1));
    const pts = L > 0.2 ? [nd.p, mid, q] : [nd.p, q];
    const sw = (i: number) => swayAt(pts[i], true);
    // The back layer lies against the fence, its stems hidden: only the front shoots get a stem of their own.
    if (!back) tube(wood, pts, Math.max(0.0012, nd.rad * 0.5), 0.0011, 3, caneYoung, born(g), nd.p, sw, 2);
    const dir = v.clone().normalize();
    const pairs = back ? 1 : Math.max(1, Math.round(L / 0.055));
    for (let k = 0; k < pairs; k++) {
      const t = (k + 0.7) / (pairs + 0.4);
      pairAt(nd.p.clone().lerp(q, t), dir, (0.052 + r() * 0.01) * (back ? 0.95 : 1), g, true, false);
    }
    const sdir = dir.clone().lerp(V(0, 1, 0.3), 0.35).normalize();
    const cell = back ? 6 + Math.floor(r() * 2) : r() < 0.25 ? (r() < 0.7 ? 4 : 5) : Math.floor(r() * 4);
    sprayAt(q.clone().addScaledVector(sdir, -0.03), sdir, 0.16 + r() * 0.06, cell, shadeAt(q, back ? 0.75 : 1), g, true);
    if (!back && r() < 0.62) cymeAt(q, g);
  };
  const step = 0.07;
  for (let y = 0.06; y < H; y += step * 0.87) {
    for (let x = -WM; x <= WM; x += step) {
      const px = x + (r() - 0.5) * step * 0.9, py = y + (r() - 0.5) * step * 0.8;
      if (Math.abs(px) > halfW(py) * (0.94 + r() * 0.08) || py < 0.04) continue;
      // Front shoots stand out to the light; a sparser back layer hides the fence behind.
      lateral(V(px, py, ZT + 0.07 + Math.sqrt(r()) * 0.2), false);
      if (r() < 0.8) lateral(V(px + (r() - 0.5) * step, py + (r() - 0.5) * step, ZT + 0.015 + r() * 0.06), true);
    }
  }
  // Loose shoots waving out past the edge of the screen and over the top, ending in young leaves.
  for (let k = 0; k < 46; k++) {
    const y = 0.2 + r() * (H - 0.3);
    const sd = r() < 0.5 ? -1 : 1;
    const edgeTop = r() < 0.35;
    const x = edgeTop ? (r() - 0.5) * 2 * halfW(H - 0.2) * 0.8 : sd * halfW(y) * (0.88 + r() * 0.06);
    const yy = edgeTop ? H * (0.9 + r() * 0.05) : y;
    const base = V(x, edgeTop ? yy - 0.1 : yy, ZT + 0.05 + r() * 0.08);
    const outD = edgeTop ? V((r() - 0.5) * 0.8, 1, 0.3 + r() * 0.4).normalize() : V(sd, (r() - 0.3) * 0.8, 0.3 + r() * 0.4).normalize();
    const L = 0.14 + r() * 0.2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(base.clone().addScaledVector(outD, L * t).add(V(0, -t * t * L * 0.35, 0)));
    }
    const end = pts[4];
    if (end.y > H || end.y < 0.05 || Math.abs(end.x) > WM) continue;
    const g = clamp(Math.max(gOf(base), gOf(end) * 0.97));
    tube(wood, pts, 0.0019, 0.0011, 3, caneYoung, born(g), base, (i) => swayAt(pts[i], true) + i * 0.05, 2);
    for (let i = 1; i <= 4; i++) {
      const d = pts[Math.min(4, i)].clone().sub(pts[i - 1]).normalize();
      pairAt(pts[i], d, lerp(0.05, 0.03, i / 4), g, true, i >= 3);
    }
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerAtlas(spec.flower ?? '#fbfaf2', spec.flower2 ?? '#f0e2a0'),
    bark: { map: stemBark('star-jasmine', 0.22) },
    look: { trained: true, leafRoughness: 0.5, translucency: 0.22, bend: 0.045, flutter: 0.006, woodShadows: true },
  };
};
