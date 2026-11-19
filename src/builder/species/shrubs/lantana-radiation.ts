import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, mixCols, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, domeCard, inCell, rect, type UV } from '../groundcover/shared-groundcovers';
import { lantanaBud, lantanaFloret, lantanaLeaf, lantanaShoot, lantanaStemBark, type LantanaLeafShape } from '../groundcover/shared-lantana';
import { fitAll, growMound, moundWood, sprig, sprigDir } from './shared-shrubs-b';

/**
 * Lantana 'Radiation', Lantana camara 'Radiation', the upright shrub lantana
 * with bicolor orange-red heads, in summer bloom.
 *
 * A rounded, upright-mounding shrub: many square, rough stems rise from a
 * woody base, branch in opposite pairs and arch out at the edge, so the mound
 * reaches nearly to the ground. Leaves are opposite, ovate with a pointed tip
 * and a round-toothed margin, 2 to 4 in long, dark green, rough and
 * wrinkled between sunken veins. From the upper leaf axils rise stalks 2 to
 * 3 in long carrying flat-topped to domed heads about 2 in across of small
 * four-lobed salverform florets. The florets open from the rim of the head
 * inward and change color as they age: they open yellow-orange and turn
 * orange, then red-orange, so a head has a red-orange outer ring around a
 * yellow-orange center, with pinkish buds in the middle. Older heads are red
 * almost to the center. 'Radiation' is fertile: spent heads set small
 * clusters of green berries that ripen glossy blue-black.
 *
 * References and the numbers they give:
 * - Monrovia, Radiation Bush Lantana (monrovia.com/radiation-bush-lantana.html):
 *   Lantana camara 'Radiation', 4 to 6 ft tall and wide, upright habit,
 *   moderate growth; rich orange-red blooms with yellow accents, a color
 *   progression within each cluster; wrinkled dark green foliage; blooms
 *   spring and summer, longer where frost-free.
 * - Devil Mountain Nursery (devilmountainnursery.com/lantana-camara-radiation/):
 *   4 to 6 ft tall, 4 to 6 ft wide; a tender, rounded shrub with dense green
 *   foliage; yellow flowers age to orange-red in two-tone clusters, spring
 *   through fall. Its 5 gal photos show the heads, the leaves and the
 *   blue-black berries.
 * - Clemson HGIC 1162, "Lantana" (hgic.clemson.edu/factsheet/lantana/):
 *   'Radiation' a tall, upright cultivar about 4 to 5 ft high and wide,
 *   orange-red; lantana heads about 2 in across, disc-shaped, often several
 *   colors in one head; leaves coarse, slightly toothed, rough to the touch.
 * - NC State Extension Plant Toolbox, Lantana camara
 *   (plants.ces.ncsu.edu/plants/lantana-camara/): 'Radiation' to 4 to 6 ft
 *   tall and wide, dual-toned red-orange and yellow; leaves ovate, serrate,
 *   rough, opposite, 3 to 6 in on the species; florets under 1 in, four or
 *   five lobed, changing color with age.
 * - Wikimedia Commons, "Lantana camara 'Radiation'.jpg": a garden plant with
 *   red-orange rims around yellow-orange centers, dark green rugose leaves.
 * Size used: installed from a 1 gal at 0.3 m tall x 0.35 m wide; 1.2 m (4 ft)
 * tall x 1.5 m (5 ft) wide in three years. That is the low end of the 4 to
 * 6 ft range, since in the Central Valley frost cuts lantana back most winters.
 */

/* ---------------------------- leaf atlas ---------------------------- */

const LW = 1024, LH = 1024, C = 512;
/** Leaf atlas, 2 x 2: two shoots with opposite pairs, a shoot tip, a patch of older leaves. */
const cellUV = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, LW, LH);

const GREENS = ['#263f1a', '#2c4a1d', '#315321', '#375b24'];
const YOUNG = ['#466f28', '#517c2e'];
/** L. camara's leaf: narrower than the groundcover lantanas', with a pointed tip and more, finer round teeth. */
const CAMARA_LEAF: LantanaLeafShape = { width: 0.5, widest: 0.3, teeth: 12, depth: 0.13 };

function leafAtlas(): THREE.Texture {
  return leafTexture('lantana-radiation-leaves', LW, LH, (g) => {
    const r = rng('lantana-radiation-leaves');
    inCell(g, 0, 0, C, C, (w, h) => lantanaShoot(g, r, w, h, 4, 0.16, GREENS, YOUNG, CAMARA_LEAF));
    inCell(g, C, 0, C, C, (w, h) => lantanaShoot(g, r, w, h, 3, 0.22, GREENS, YOUNG, CAMARA_LEAF));
    inCell(g, 0, C, C, C, (w, h) => lantanaShoot(g, r, w, h, 2, 0.4, GREENS, YOUNG, CAMARA_LEAF));
    inCell(g, C, C, C, C, (w, h) => {
      for (let k = 0; k < 30; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.26;
        lantanaLeaf(g, r, w * (0.5 + Math.cos(a) * d), h * (0.5 + Math.sin(a) * d), a + (r() - 0.5) * 2, w * (0.2 + r() * 0.08), GREENS[Math.floor(r() * 3)], r() * 0.28, CAMARA_LEAF);
      }
    });
  });
}

/* --------------------------- flower atlas --------------------------- */

/**
 * Flower atlas, 1024 x 1024: three heads from above in 512 cells (0 the
 * classic two-tone head, 1 a fresh head, 2 an old head) and four 256 cells in
 * the last quarter: 3 a head from the side on its stalk, 4 a head still in
 * bud, 5 a cluster of berries, 6 an older head from the side.
 */
const FW = 1024, FH = 1024;
const fcell = (i: number): UV =>
  i < 3 ? rect((i % 2) * 512, Math.floor(i / 2) * 512, 512, 512, FW, FH) : rect(512 + ((i - 3) % 2) * 256, 512 + Math.floor((i - 3) / 2) * 256, 256, 256, FW, FH);

/** Floret color by age: yellow-orange when it opens, then orange, red-orange and an old scarlet. */
function agedTone(r: () => number, ramp: THREE.Color[], x: number) {
  const lobe = mixCols(ramp, x).multiplyScalar(0.94 + r() * 0.08);
  const red = clamp((x - 0.35) / 0.4);
  // Red florets keep a yellow-orange eye; yellow ones deepen to orange at the throat.
  const deep = lobe.clone().lerp(red > 0.5 ? ramp[0] : new THREE.Color('#d86a06'), red > 0.5 ? 0.55 : 0.4);
  const rim = lobe.clone().lerp(new THREE.Color(red > 0.5 ? '#ff6a3c' : '#ffd04a'), 0.12);
  return { lobe, deep, rim, throat: red > 0.5 ? '#f2a822' : '#cf6406' };
}

/** A head from above: rings of florets from the rim (oldest) inward, buds in the middle. `age` 0 fresh .. 1 old. */
function headTop(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, ramp: THREE.Color[], age: number, inner: number, buds: number) {
  const cx = w / 2, cy = h / 2;
  const rings = [{ n: 16, d: 0.37, s: 0.118 }, { n: 11, d: 0.245, s: 0.112 }, { n: 6, d: 0.12, s: 0.1 }].slice(0, inner);
  rings.forEach((ring, ri) => {
    const t = ri / 2;
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * TAU + ri * 0.4 + r() * 0.25, d = w * ring.d * (0.93 + r() * 0.12);
      const x = clamp(0.22 + age * 0.95 - t * 0.72 + (r() - 0.5) * 0.16);
      lantanaFloret(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * ring.s * (0.92 + r() * 0.16), agedTone(r, ramp, x), 1, a + Math.PI + (r() - 0.5) * 0.7);
    }
  });
  for (let k = 0; k < buds; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * w * (inner === 1 ? 0.25 : inner < 3 ? 0.14 : 0.06);
    lantanaBud(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * 0.06, '#e8784a', '#d8604a', 'rgba(130,120,60,0.7)');
  }
}

/** A head from the side on its stalk: a low dome of florets, the oldest (reddest) round its base. */
function headSide(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, ramp: THREE.Color[], age: number) {
  const cx = w / 2, base = h * 0.56;
  g.strokeStyle = '#557236';
  g.lineWidth = w * 0.026;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx, h);
  g.lineTo(cx, base);
  g.stroke();
  g.fillStyle = '#58763a';
  g.beginPath();
  g.ellipse(cx, base, w * 0.2, h * 0.035, 0, 0, TAU);
  g.fill();
  // Rows evenly up a half-ellipse dome: wide at the rim, narrowing to the buds on top.
  const rx = w * 0.41, ry = h * 0.25;
  for (let row = 0; row < 6; row++) {
    const v = row / 5;
    const y = base - ry * v - h * 0.02;
    const half = rx * Math.max(0.22, Math.sqrt(1 - v * v));
    const n = Math.max(2, Math.round(half / (w * 0.055)));
    for (let k = 0; k < n; k++) {
      const x = cx + ((k + 0.5) / n - 0.5) * 2 * half + (r() - 0.5) * w * 0.02;
      const tone = agedTone(r, ramp, clamp(0.22 + age * 0.95 - (row / 5) * 0.72 + (r() - 0.5) * 0.16));
      lantanaFloret(g, x, y + (r() - 0.5) * h * 0.02, w * (row === 5 ? 0.08 : 0.095), tone, lerp(0.42, 0.85, row / 5), r() * TAU);
    }
  }
  for (let k = 0; k < 7; k++) lantanaBud(g, r, cx + (r() - 0.5) * w * 0.16, base - ry - h * 0.01 + r() * h * 0.05, w * 0.055, '#e8784a', '#d8604a', 'rgba(130,120,60,0.7)');
}

/** A spent head's fruit: a tight cluster of round drupes, green and ripening glossy blue-black, on its stalk. */
function berries(g: CanvasRenderingContext2D, r: () => number, w: number, h: number) {
  const cx = w / 2, cy = h * 0.42;
  g.strokeStyle = '#5a6e36';
  g.lineWidth = w * 0.03;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx, h);
  g.lineTo(cx, cy + h * 0.08);
  g.stroke();
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * w * 0.24;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
    const ripe = r() < 0.55;
    const s = w * (0.07 + r() * 0.015);
    const gg = g.createRadialGradient(x - s * 0.35, y - s * 0.35, s * 0.1, x, y, s);
    gg.addColorStop(0, ripe ? '#4a5470' : '#8fa858');
    gg.addColorStop(0.5, ripe ? '#1c1e34' : '#5d7a2e');
    gg.addColorStop(1, ripe ? '#0c0c18' : '#3e5a20');
    g.fillStyle = gg;
    g.beginPath();
    g.arc(x, y, s, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(x - s * 0.35, y - s * 0.38, s * 0.16, 0, TAU);
    g.fill();
  }
}

function flowerAtlas(red: string, yellow: string): THREE.Texture {
  return leafTexture(`lantana-radiation-flowers-${red}-${yellow}`, FW, FH, (g) => {
    const r = rng('lantana-radiation-flowers');
    // Open, then aging: yellow-orange, orange, red-orange, scarlet.
    const Y = new THREE.Color(yellow), R = new THREE.Color(red);
    const ramp = [Y, Y.clone().lerp(R, 0.45).lerp(new THREE.Color('#f46a10'), 0.4), R, R.clone().lerp(new THREE.Color('#b8141a'), 0.45)];
    const cell = (i: number, draw: (w: number, h: number) => void) => {
      const [u0, v0, u1, v1] = fcell(i);
      inCell(g, u0 * FW, (1 - v1) * FH, (u1 - u0) * FW, (v1 - v0) * FH, draw);
    };
    cell(0, (w, h) => headTop(g, r, w, h, ramp, 0.5, 3, 8));
    cell(1, (w, h) => headTop(g, r, w, h, ramp, 0.12, 2, 26));
    cell(2, (w, h) => headTop(g, r, w, h, ramp, 0.85, 3, 4));
    cell(3, (w, h) => headSide(g, r, w, h, ramp, 0.4));
    cell(4, (w, h) => headTop(g, r, w, h, ramp, 0.0, 1, 46));
    cell(5, (w, h) => berries(g, r, w, h));
    cell(6, (w, h) => headSide(g, r, w, h, ramp, 0.85));
  });
}

/* ------------------------------ builder ------------------------------ */

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();

  // The leafy mound; the heads ride a little above it on their stalks.
  const m = growMound(r, { H: H * 0.9, Sp: Sp * 0.95, points: 340, stems: 16, perLimb: 7, centerY: 0.34, under: -0.62, power: 2.35, lump: 0.12, lumpFreq: 2.6, rough: 0.14, stemRadius: 0.011, crown: 0.09, arch: 0.1, gnarl: 0.2, stemReach: 0.55, limbReach: 0.62, early: 0.58 });
  const oldC = col('#5f523c'), limbC = col('#626040'), twigC = col('#5a6e3a');
  moundWood(wood, m, (b) => (b.level === 0 ? oldC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.48, 1, Math.pow(d, 1.8)) * lerp(0.82, 1, clamp(p.y / (m.H * 0.6))) * (1 - inner * 0.28);
    return jitter(col('#ffffff'), r, 0.012, 0.04, 0.04).multiplyScalar(shade * (0.9 + r() * 0.14));
  };

  const L = 0.2;
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    // Leafy shoots of opposite pairs along the twig, held out flat toward the light.
    for (let k = 0; k < 4; k++) {
      const at = along(tw.pts, lerp(0.25, 1, (k + r() * 0.8) / 4)).p;
      const dir = sprigDir(r, out, 0.3 + r() * 0.6, 0.25);
      const len = L * (0.75 + r() * 0.4);
      sprig(leaves, r, m, at, dir, len, len, cellUV(r() < 0.5 ? 0 : 1), tint(at, 0.1), born(), { cross: k % 3 === 0, curl: 0.25 + r() * 0.35, faceOut: 0.72, normalBend: 0.5 });
    }
    // The leafy tip of the shoot.
    const tipDir = out.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    sprig(leaves, r, m, end, tipDir, L * (0.6 + r() * 0.2), L * 0.7, cellUV(2), tint(end, 0), tw.birth, { cross: true, curl: 0.2, faceOut: 0.5 });
  }
  // Inner foliage along the limbs and older leaves deep in the mound, so it is not hollow.
  for (const b of m.limbs) {
    for (let k = 0; k < 5; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.6 + r() * 0.7, 0.3);
      const birth = b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth;
      sprig(leaves, r, m, at, dir, L * 1.1, L * 1.1, cellUV(k % 2 ? 3 : Math.floor(r() * 2)), tint(at, 0.8), birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  // Flower heads on stalks from the upper leaf axils, held just clear of the leaves, over the whole mound.
  const stalkC = col('#5e7a3a');
  const fl = col('#ffffff', 0.86);
  const head = (base: THREE.Vector3, out: THREE.Vector3, birth: number, cellPick: number) => {
    const d = out.clone().lerp(UP, 0.45 + r() * 0.3).add(V((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35)).normalize();
    const stalk = 0.05 + r() * 0.035;
    const c = base.clone().addScaledVector(d, stalk);
    const s0 = m.sway(base), s1 = clamp(s0 + 0.2);
    tube(wood, [base, base.clone().lerp(c, 0.5).add(V(0, stalk * 0.08, 0)), c], 0.0016, 0.0011, 3, stalkC, birth, base, (i) => lerp(s0, s1, i / 2), 1);
    if (cellPick === 5) {
      // A spent head's berries: a small cluster card pair on the stalk.
      const sz = 0.03 + r() * 0.006;
      const f1 = perp(d), f2 = V().crossVectors(d, f1).normalize();
      const b0 = c.clone().addScaledVector(d, -sz * 0.45);
      for (const f of [f1, f2]) leafQuad(flowers, b0, d, f, sz, sz, fcell(5), col('#ffffff', 0.92), birth, base, { segs: 1, sway0: s1, sway1: s1 });
      return;
    }
    // Heads present in the nursery can run to the large end (about 2.3 in), so a 1 gal still reads in flower.
    const size = (0.05 + r() * 0.012) * (birth === 0 ? 1.1 : 1);
    const n = d.clone().lerp(UP, 0.55).add(V((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25)).normalize();
    domeCard(flowers, c, n, r() * TAU, size, 0.17, fcell(cellPick), jitter(fl, r, 0.01, 0.03, 0.03), birth, base, s1);
    // The dome's side, so a head seen from the side has depth and the oldest florets round its base.
    const a = r() * TAU;
    const side = V(Math.cos(a), 0, Math.sin(a));
    const sl = size * 1.0;
    leafQuad(flowers, c.clone().addScaledVector(d, -sl * 0.85), d, side, sl, sl, fcell(cellPick === 2 ? 6 : 3), fl.clone().multiplyScalar(0.9), birth, base, { segs: 1, sway0: s1, sway1: s1 });
  };
  const pickHead = () => {
    const q = r();
    return q < 0.4 ? 0 : q < 0.62 ? 1 : q < 0.84 ? 2 : q < 0.93 ? 4 : 5;
  };
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    if (out.y < -0.4) continue;
    const n = out.y > 0.35 ? 2 + (r() < 0.45 ? 1 : 0) : out.y > -0.05 ? (r() < 0.7 ? 2 : 1) : r() < 0.75 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const base = along(tw.pts, 0.72 + r() * 0.28).p.add(V((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.03));
      const birth = k === 0 ? tw.birth : clamp(tw.birth + 0.05 + r() * 0.3, 0, 0.9);
      head(base, out, birth, pickHead());
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(spec.flower ?? '#e8501c', spec.flower2 ?? '#f7a823'),
    bark: { map: lantanaStemBark() },
    look: { leafRoughness: 0.8, translucency: 0.3, bend: 0.06, flutter: 0.008 },
  };
};
