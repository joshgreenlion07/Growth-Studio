import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, domeCard, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';
import { lantanaBud, lantanaFloret, lantanaLeaf, lantanaShoot, lantanaStemBark, type LantanaLeafShape } from './shared-lantana';

/**
 * Lantana 'Spreading White', the white trailing lantana: Lantana
 * montevidensis 'Spreading White' (also sold as 'Alba' and as white
 * groundcover lantana), in bloom.
 *
 * A low, wide, trailing mat: long, thin, square stems, hairy when young,
 * creep out from a woody crown, root where they touch and pile up a little
 * over the middle, so the plant is much wider than tall and thins to single
 * runners at the rim. Opposite pairs of small, pointed-ovate leaves with
 * coarse round teeth, dark green, dull and rough, strongly aromatic. Small
 * rounded heads of white four-lobed florets with a yellow eye ride on slender
 * stalks an inch or two over the leaves, the middle of each head still in
 * pale buds; in bloom they are scattered evenly over the whole mat.
 * (The catalog's 'New Gold' is a L. camara hybrid: taller, mounding, with
 * larger leaves and heads.)
 *
 * References and the numbers they give:
 * - Boething Treeland Farms, Lantana montevidensis 'Spreading White'
 *   (boethingtreeland.com/plants/lantana-montevidensis-white-trailing): a
 *   California grower, sold as #1 and #5; 1 to 2 ft tall, 4 to 6 ft wide;
 *   dark green toothed, fuzzy, pointed, aromatic leaves; white flowers year
 *   round where frost free.
 * - Rogers Gardens, Spreading White Lantana
 *   (plants.rogersgardens.com, plant 30259): L. montevidensis, 12 in tall x
 *   4 ft wide, fast, spaced 3 ft; blooms mid spring to mid fall.
 * - NC State Extension Plant Toolbox, Lantana montevidensis
 *   (plants.ces.ncsu.edu/plants/lantana-montevidensis): trailing, stems to
 *   about 3 ft, rooting at the nodes; 'Alba' white with a yellow eye; heads of
 *   up to about 20 florets, each under 1/2 in.
 * - PlantNET (NSW Flora), Lantana montevidensis: leaves 0.8 to 2.5 cm by 5 to
 *   16 mm, toothed; heads 1 to 2 cm across on stalks 2 to 8 cm; corolla 8 to
 *   12 mm long. NZPCN gives leaves 1.5 to 3 by 1 to 1.5 cm.
 * - Green Things Nursery (Arizona): to 2 ft x 5 ft; leaves freeze in the mid
 *   20s F, roots hardy to 20 F.
 * Size used: installed from a 1 gal (stems already trailing over the pot) at
 * 0.1 m tall x 0.36 m wide; 0.35 m
 * (14 in) tall x 1.4 m (4.5 ft) wide in two years in a zone 9 bed. Leaves
 * about 2.5 cm, heads about 2.5 cm across.
 */

const LW = 1024, LH = 1024, C = 512;
/** Leaf atlas, 2 x 2: two trailing shoots with opposite pairs, a shoot tip, a patch of older leaves. */
const cellUV = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, LW, LH);

/** L. montevidensis leaves: narrower and more pointed than the camara hybrids', with fewer, coarser teeth. */
const LEAF: LantanaLeafShape = { width: 0.5, widest: 0.33, teeth: 7, depth: 0.2 };
const GREENS = ['#28481c', '#2e521f', '#345a22', '#3a6224'];
const YOUNG = ['#44702a', '#4e7c30'];

const shoot = (g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number) => lantanaShoot(g, r, w, h, pairs, top, GREENS, YOUNG, LEAF);

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-lantana-spreading-white-leaves', LW, LH, (g) => {
    const r = rng('gc-lantana-spreading-white-leaves');
    inCell(g, 0, 0, C, C, (w, h) => shoot(g, r, w, h, 5, 0.14));
    inCell(g, C, 0, C, C, (w, h) => shoot(g, r, w, h, 4, 0.2));
    inCell(g, 0, C, C, C, (w, h) => shoot(g, r, w, h, 2, 0.42));
    inCell(g, C, C, C, C, (w, h) => {
      for (let k = 0; k < 40; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.28;
        lantanaLeaf(g, r, w * (0.5 + Math.cos(a) * d), h * (0.5 + Math.sin(a) * d), a + (r() - 0.5) * 2, w * (0.15 + r() * 0.06), GREENS[Math.floor(r() * 3)], r() * 0.25, LEAF);
      }
    });
  });
}

const FW = 1024, FH = 1024;
const fcell = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, FW, FH);

const WHITE = new THREE.Color('#f3f2ea'), CREAM = new THREE.Color('#e6e5d2'), RIM = new THREE.Color('#fcfcf8');
const css = (c: THREE.Color) => `#${c.getHexString()}`;

/** One floret from above: four white lobes, the lower one largest, a yellow eye spreading onto the lobe bases. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number, sq = 1, rot = r() * TAU) {
  const lobe = WHITE.clone().multiplyScalar(0.95 + r() * 0.05);
  lantanaFloret(g, x, y, s, { lobe, deep: lobe.clone().lerp(CREAM, 0.7), rim: RIM, throat: '#b88a10' }, sq, rot);
  g.save();
  g.translate(x, y);
  g.scale(1, sq);
  const eye = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.3);
  eye.addColorStop(0, css(new THREE.Color('#d9a414')));
  eye.addColorStop(0.5, css(new THREE.Color('#ecc63a')));
  eye.addColorStop(1, 'rgba(240,214,90,0)');
  g.fillStyle = eye;
  g.beginPath();
  g.arc(0, 0, s * 0.3, 0, TAU);
  g.fill();
  g.fillStyle = '#7a5a10';
  g.beginPath();
  g.arc(0, 0, s * 0.06, 0, TAU);
  g.fill();
  g.restore();
}

const bud = (g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number) => lantanaBud(g, r, x, y, s, '#e4e6cf', '#d6dcb4', 'rgba(120,140,70,0.6)');

function flowerAtlas(): THREE.Texture {
  return leafTexture('gc-lantana-spreading-white-flowers', FW, FH, (g) => {
    const r = rng('gc-lantana-spreading-white-flowers');
    // Cells 0, 1: a full head from above: an outer ring of open florets, a few inside, buds in the middle.
    // Cell 3: a young head, mostly buds.
    for (const c of [0, 1, 3]) {
      inCell(g, (c % 2) * C, Math.floor(c / 2) * C, C, C, (w, h) => {
        const cx = w / 2, cy = h / 2, young = c === 3;
        const n0 = young ? 7 : 10 + c;
        for (let k = 0; k < n0; k++) {
          const a = (k / n0) * TAU + r() * 0.2, d = w * (young ? 0.3 : 0.34) * (0.94 + r() * 0.1);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.13 + r() * 0.02), 1, a + Math.PI + (r() - 0.5) * 0.6);
        }
        const n1 = young ? 0 : 5;
        for (let k = 0; k < n1; k++) {
          const a = (k / n1) * TAU + 0.3 + r() * 0.3, d = w * 0.17 * (0.9 + r() * 0.2);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.12 + r() * 0.02), 1, a + Math.PI);
        }
        const nb = young ? 20 : 8;
        for (let k = 0; k < nb; k++) {
          const a = r() * TAU, d = Math.sqrt(r()) * w * (young ? 0.2 : 0.08);
          bud(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * 0.07);
        }
      });
    }
    // Cell 2: a head from the side on its slender stalk: a low dome of florets seen at a slant.
    inCell(g, 0, C, C, C, (w, h) => {
      const cx = w / 2, base = h * 0.5;
      g.strokeStyle = '#4e6432';
      g.lineWidth = w * 0.018;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, base);
      g.stroke();
      g.fillStyle = '#58703a';
      g.beginPath();
      g.ellipse(cx, base, w * 0.16, h * 0.03, 0, 0, TAU);
      g.fill();
      const rx = w * 0.36, ry = h * 0.24;
      for (let row = 0; row < 5; row++) {
        const v = 1 - row / 4;
        const y = base - ry * Math.sqrt(1 - v * v) - h * 0.02;
        const half = rx * Math.max(0.25, v);
        const n = Math.max(2, Math.round(half / (w * 0.07)));
        for (let k = 0; k < n; k++) {
          const x = cx + ((k + 0.5) / n - 0.5) * 2 * half + (r() - 0.5) * w * 0.02;
          floret(g, r, x, y + (r() - 0.5) * h * 0.02, w * (row === 4 ? 0.08 : 0.1), lerp(0.45, 0.9, row / 4));
        }
      }
      for (let k = 0; k < 6; k++) bud(g, r, cx + (r() - 0.5) * w * 0.14, base - ry - h * 0.01 + r() * h * 0.04, w * 0.06);
    });
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const wood = new GeoBuilder();
  const center = V(0, -Sp * 0.55, 0), radii = V(1, 1, 1);

  // A low, wide mat: stems pile up a little over the crown and trail out flat to single runners at the rim.
  const mound = (rho: number) => H * 0.74 * Math.pow(clamp(1 - rho * rho), 0.95);
  const runners = growRunners(r, {
    n: 14,
    R,
    step: 0.04,
    wander: 0.4,
    reachMin: 0.8,
    levels: [
      { every: 0.08, angle: 0.75, len: [0.14, 0.36] },
      { every: 0.08, angle: 0.85, len: [0.06, 0.16] },
    ],
    y: (rho, layer) => 0.01 + mound(rho) * (0.2 + 0.8 * layer),
  });

  const swayAt = (y: number) => clamp(y / H) * 0.7;
  const birthAt = (rho: number) => (rho < 0.5 || r() < 0.28 ? 0 : clamp((rho - 0.5) * 1.9 + r() * 0.15, 0.08, 0.85));
  const white = col('#ffffff');
  const fl = col('#ffffff', 0.84);

  const head = (tip: THREE.Vector3, dir: THREE.Vector3, birth: number, big = 0) => {
    // A slender axillary stalk holds the head an inch or two over the leaves.
    const rise = 0.026 + r() * 0.024;
    const out = V(dir.x, 0, dir.z).normalize();
    const c = tip.clone().addScaledVector(out, 0.008 + r() * 0.012).add(V(0, rise, 0));
    const size = (0.024 + r() * 0.007) * (1 + big);
    const n = V(out.x * (0.15 + r() * 0.3) + (r() - 0.5) * 0.3, 1, out.z * (0.15 + r() * 0.3) + (r() - 0.5) * 0.3).normalize();
    const q = r();
    const s1 = swayAt(c.y);
    domeCard(flowers, c, n, r() * TAU, size, 0.14, fcell(q < 0.45 ? 0 : q < 0.85 ? 1 : 3), fl, birth, tip, s1);
    const a = r() * TAU;
    const stalkDir = c.clone().sub(tip).normalize();
    const L = size * 1.3;
    leafQuad(flowers, c.clone().addScaledVector(stalkDir, -L * 0.88), stalkDir, V(Math.cos(a), 0, Math.sin(a)), L, L, fcell(2), fl.clone().multiplyScalar(0.94), birth, tip, { segs: 1, sway0: swayAt(tip.y), sway1: s1 });
  };

  for (const run of runners) {
    const n = Math.max(1, Math.round(run.length / 0.032));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const t = (k + r() * 0.5) / n;
      const at = along(run.pts, t);
      side = -side;
      const rho = Math.hypot(at.p.x, at.p.z) / R;
      const edge = clamp((rho - 0.72) / 0.28);
      const last = k === n - 1;
      const len = (last ? 0.075 : 0.095) * (0.85 + r() * 0.3);
      const pitch = lerp(0.12 + r() * 0.7 * (0.25 + run.layer), 0.04 + r() * 0.12, edge) + (last ? 0.25 : 0);
      const shade = lerp(0.58, 1.0, clamp(run.layer * 0.85 + edge * 0.5 + r() * 0.25)) * (0.9 + r() * 0.16);
      const b = birthAt(rho);
      const s0 = swayAt(at.p.y);
      lay(leaves, at.p, heading(at.dir) + (last ? 0 : side * (0.3 + r() * 0.6)), pitch, (r() - 0.5) * 0.7, len, len, cellUV(last ? 2 : Math.floor(r() * 2)), white.clone().multiplyScalar(shade), b, { segs: 2, curl: pitch * 1.2 + r() * 0.25, center, radii, normalBend: 0.5, sway0: s0, sway1: clamp(s0 + 0.15) });
      // Heads from the leaf axils all along the upper stems, scattered evenly over the mat.
      if (!last && run.layer > 0.15 && r() < 0.46) head(at.p.clone().add(V((r() - 0.5) * 0.03, 0.01, (r() - 0.5) * 0.03)), at.dir, clamp(b + r() * 0.1, 0, 0.9));
    }
    const end = along(run.pts, 1);
    const erho = Math.hypot(end.p.x, end.p.z) / R;
    if (r() < 0.8) head(end.p, end.dir, birthAt(erho));
    if (run.level === 0) {
      const pts = run.pts.filter((_, i) => i % 3 === 0 || i === run.pts.length - 1);
      tube(wood, pts, 0.0032, 0.0015, 4, white, 0, pts[0], (i) => swayAt(pts[i].y));
    }
  }

  // Upturned leafy shoot tips over the middle of the mat, most carrying a head.
  for (let k = 0; k < 44; k++) {
    const rho = Math.sqrt(r()) * 0.68, a = r() * TAU, az = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.01 + mound(rho) * (0.7 + r() * 0.3), Math.sin(a) * rho * R);
    const b = birthAt(rho);
    const len = 0.08 * (0.85 + r() * 0.3), pitch = 0.45 + r() * 0.5;
    const s0 = swayAt(p.y);
    const base = p.clone().add(V(-Math.cos(az) * len * 0.75 * Math.cos(pitch), -len * 0.75 * Math.sin(pitch), -Math.sin(az) * len * 0.75 * Math.cos(pitch)));
    lay(leaves, base, az, pitch, (r() - 0.5) * 0.5, len, len, cellUV(2), white.clone().multiplyScalar(0.9 + r() * 0.15), b, { segs: 2, curl: 0.5, center, radii, normalBend: 0.5, sway0: clamp(s0 - 0.2), sway1: s0 });
    if (r() < 0.8) head(p, V(Math.cos(az), 0, Math.sin(az)), b);
  }

  // The young plant's own heads over the crown, present from install: a 1 gal in a nursery pot is in flower. They
  // run a little large, since at install the whole plant is drawn at about a fifth of its mature width.
  for (let k = 0; k < 26; k++) {
    const rho = Math.sqrt((k + r()) / 26) * 0.6, a = k * 2.39996 + r() * 0.5;
    const p = V(Math.cos(a) * rho * R, 0.01 + mound(rho) * (0.88 + r() * 0.1), Math.sin(a) * rho * R);
    head(p, V(Math.cos(a), 0, Math.sin(a)), 0, 0.3);
  }

  // Older shaded leaves deep in the mat and on the soil under it.
  for (let k = 0; k < 70; k++) {
    const low = k < 28;
    const rho = Math.sqrt(r()) * (low ? 0.84 : 0.68), a = r() * TAU, az = r() * TAU, sz = 0.17 + r() * 0.05;
    const p = V(Math.cos(a) * rho * R, 0.005 + mound(rho) * (low ? 0.06 : 0.3 + r() * 0.4), Math.sin(a) * rho * R);
    const base = p.clone().add(V(-Math.cos(az) * sz * 0.5, 0, -Math.sin(az) * sz * 0.5));
    lay(leaves, base, az, 0.02, 0, sz, sz, cellUV(3), col('#ffffff', low ? 0.42 + r() * 0.12 : 0.6 + r() * 0.14), birthAt(rho), { segs: 1, center, radii, normalBend: 0.5, sway0: 0, sway1: 0 }, p);
  }

  // The woody crown.
  tube(wood, [V(0, 0, 0), V(0, 0.025, 0)], 0.01, 0.007, 6, white, 0, V(), () => 0);

  fitMat([leaves, flowers, wood], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    wood: wood.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    bark: { map: lantanaStemBark() },
    look: { leafRoughness: 0.8, translucency: 0.26, bend: 0.025, flutter: 0.004 },
  };
};
