import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, leafPath, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, domeCard, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';
import { verbenaFlowerAtlas, verbenaFlowerCell, verbenaSprig, verbenaStemBark, type VerbenaPalette } from './shared-verbena';

/**
 * Verbena 'Tapien Blue Violet' (Suntory's 'Sunmaref TP-V', PP 9,411), the
 * Tapien verbena first sold as 'Tapien Blue', in summer bloom.
 *
 * A low, dense, spreading mat: thin square stems trail out from the crown,
 * branch freely and turn up at the tips. They carry opposite pairs of small
 * leaves, under an inch long, cut almost to the midrib into narrow linear
 * lobes, so the mat has a fine, lacy, fern-like texture of fresh mid-green.
 * Nearly every shoot ends in a flat, rounded head about 1.5 in across of
 * small five-lobed salverform flowers, deep blue-violet with notched lobes
 * and a tiny pale ring at the throat; buds sit in the middle of the head and
 * it lengthens a little as it blooms. In full bloom the heads nearly cover the
 * mat. (The catalog's older 'verbena' is V. canadensis 'Homestead Purple', a
 * taller, coarser plant with lobed, toothed leaves.)
 *
 * References and the numbers they give:
 * - Proven Winners, Tapien Blue Violet Verbena
 *   (provenwinners.com/plants/verbena/tapien-blue-violet-verbena): 'SUNmaref
 *   TP-V', Tapien series; 3 to 7 in tall, 12 to 36 in spread, trailing to
 *   36 in; "elegant feathered leaves"; blue-violet blooms planting to frost;
 *   zones 8a to 11b.
 * - Devil Mountain Nursery (devilmountainnursery.com/verbena-tapien-blue-violet/):
 *   Verbena 'SUNmaref TP-V' PP 9,411, 3 to 7 in tall, 1 to 3 ft wide; a
 *   tender, spreading perennial groundcover forming a dense low mat; fine
 *   green leaves; blue-violet clusters late spring to frost.
 * - CFIA Plant Breeders' Rights, 'Sunmaref TP-V' (Tapien Violet Blue,
 *   certificate 1081): leaves deeply lobed, 2.1 cm long (1.5 to 2.5) by
 *   1.5 cm wide, finer than 'Babylon Lilac'; flat-topped terminal heads;
 *   florets violet, RHS 83B, no contrasting eye. CFIA's report on 'Tapien
 *   Blue-Violet Improved' gives this variety's heads as 4.0 cm across.
 * - Kaw Valley Greenhouses: 3 to 7 in tall, 20 to 24 in spread.
 * - Wikimedia Commons, Forest and Kim Starr's photos of Tapien Blue Violet
 *   (Kula, Maui): the finely cut foliage and the violet heads.
 * The name: the earliest Tapien release was sold as 'Tapien Blue', a flower
 * that reads deep purple; the same plant is now sold as Tapien Blue Violet,
 * and some growers list it as 'Tapien Blue/Purple'. Suntory's paler 'Tapien
 * Powder Blue' is a different plant.
 * Size used: installed from a 1 gal at 0.08 m tall x 0.25 m wide; 0.15 m
 * (6 in) tall x 0.75 m (2.5 ft) wide in one season. It is fast and blooms the
 * first summer.
 */

const LW = 1024, LH = 1024, C = 512;
/** Leaf atlas, 2 x 2: two trailing sprigs, a short tip sprig, a dense patch of older leaves. */
const cellUV = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, LW, LH);

const GREENS = ['#2f5622', '#365f26', '#3d6a2a', '#44732e'];
const YOUNG = ['#55843a', '#62923f'];

/**
 * A finely cut Tapien leaf: a winged midrib with three pairs of narrow, forward-pointing linear lobes, each split
 * again, and a three-cleft end lobe. Base at (x, y), pointing along `ang`.
 */
function cutLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, fill: string, dark: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const segs: { x: number; y: number; a: number; l: number }[] = [];
  const add = (sx: number, sy: number, a: number, l: number) => segs.push({ x: sx, y: sy, a, l });
  // End lobe, cleft in three.
  add(len * 0.58, 0, (r() - 0.5) * 0.1, len * 0.42);
  for (const s of [-1, 1]) add(len * 0.72, 0, s * (0.5 + r() * 0.15), len * 0.22);
  for (const [t, a, l] of [[0.14, 1.0, 0.36], [0.32, 0.82, 0.34], [0.48, 0.62, 0.26]]) {
    for (const s of [-1, 1]) {
      const aa = s * (a + (r() - 0.5) * 0.18), ll = len * l * (0.88 + r() * 0.24);
      add(len * t, 0, aa, ll);
      // Each lobe forks: a forward segment from its middle, and on the larger lobes one more on the back edge.
      const mx = len * t + Math.cos(aa) * ll * 0.45, my = Math.sin(aa) * ll * 0.45;
      add(mx, my, aa - s * (0.55 + r() * 0.15), ll * 0.5);
      if (l > 0.3) add(mx + Math.cos(aa) * ll * 0.15, my + Math.sin(aa) * ll * 0.15, aa + s * (0.5 + r() * 0.15), ll * 0.34);
    }
  }
  const trace = (sg: { x: number; y: number; a: number; l: number }, grow: number) => {
    g.save();
    g.translate(sg.x, sg.y);
    g.rotate(sg.a);
    leafPath(g, sg.l + grow, len * 0.06 + grow, 0.35, 0.85);
    g.restore();
  };
  g.lineCap = 'round';
  // The winged midrib, then every lobe: a dark rim first, then the blade.
  for (const pass of [0, 1]) {
    g.strokeStyle = pass ? fill : 'rgba(12,30,8,0.85)';
    g.lineWidth = len * (pass ? 0.04 : 0.062);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.62, 0);
    g.stroke();
    for (const sg of segs) {
      trace(sg, pass ? 0 : len * 0.02);
      g.fillStyle = pass ? fill : 'rgba(12,30,8,0.85)';
      g.fill();
      if (pass && dark > 0) {
        g.fillStyle = `rgba(6,20,6,${dark})`;
        g.fill();
      }
    }
  }
  // A pale midrib down the rachis and into the end lobe.
  g.strokeStyle = 'rgba(170,205,130,0.45)';
  g.lineWidth = len * 0.016;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.95, 0);
  g.stroke();
  g.restore();
}

const sprig = (g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number) =>
  verbenaSprig(g, r, w, h, pairs, top, cutLeaf, GREENS, YOUNG, ['#4c5a34', '#55703a', '#6a8a44']);

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-verbena-tapien-leaves', LW, LH, (g) => {
    const r = rng('gc-verbena-tapien-leaves');
    inCell(g, 0, 0, C, C, (w, h) => sprig(g, r, w, h, 5, 0.16));
    inCell(g, C, 0, C, C, (w, h) => sprig(g, r, w, h, 4, 0.2));
    inCell(g, 0, C, C, C, (w, h) => sprig(g, r, w, h, 2, 0.42));
    inCell(g, C, C, C, C, (w, h) => {
      for (let k = 0; k < 46; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.28;
        cutLeaf(g, r, w * (0.5 + Math.cos(a) * d), h * (0.5 + Math.sin(a) * d), a + (r() - 0.5) * 2, w * (0.17 + r() * 0.07), GREENS[Math.floor(r() * 3)], r() * 0.25);
      }
    });
  });
}

const fcell = verbenaFlowerCell;
/** RHS 83B violet with the blue cast the photos show, a thin pale ring at the throat (no real eye). */
const BLUE_VIOLET: VerbenaPalette = {
  lobes: ['#62309e', '#6a34a6', '#5c2c96', '#7038ac'],
  deep: '#3e1474',
  light: '#8052bc',
  vein: 'rgba(40,10,80,0.45)',
  eye: 'rgba(196,184,230,0.9)',
  eyeR: 0.088,
  throat: '#26084a',
  buds: ['#4a2286', '#563078'],
};

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const wood = new GeoBuilder();
  const center = V(0, -Sp * 0.6, 0), radii = V(1, 1, 1);

  // A low, even mat: stems pile up a little over the crown and thin to single runners at the edge.
  const mound = (rho: number) => H * 0.62 * Math.pow(clamp(1 - rho * rho), 0.45);
  const runners = growRunners(r, {
    n: 14,
    R,
    step: 0.025,
    wander: 0.5,
    reachMin: 0.76,
    levels: [
      { every: 0.06, angle: 0.8, len: [0.08, 0.22] },
      { every: 0.06, angle: 0.85, len: [0.04, 0.1] },
    ],
    y: (rho, layer) => 0.006 + mound(rho) * (0.18 + 0.82 * layer),
  });

  const swayAt = (y: number) => clamp(y / H) * 0.85;
  const birthAt = (rho: number) => (rho < 0.55 || r() < 0.3 ? 0 : clamp((rho - 0.55) * 2 + r() * 0.15, 0.08, 0.85));
  const white = col('#ffffff');
  const fl = col('#ffffff', 0.74);

  const head = (tip: THREE.Vector3, dir: THREE.Vector3, birth: number) => {
    // The shoot turns up and holds its head an inch or two over the mat.
    const rise = 0.022 + r() * 0.022;
    const out = V(dir.x, 0, dir.z).normalize();
    const c = tip.clone().addScaledVector(out, 0.008 + r() * 0.012).add(V(0, rise, 0));
    const size = 0.034 + r() * 0.009;
    const n = V(out.x * (0.1 + r() * 0.3) + (r() - 0.5) * 0.25, 1, out.z * (0.1 + r() * 0.3) + (r() - 0.5) * 0.25).normalize();
    const q = r();
    const s1 = swayAt(c.y);
    domeCard(flowers, c, n, r() * TAU, size, 0.13, fcell(q < 0.42 ? 0 : q < 0.84 ? 1 : 3), fl, birth, tip, s1);
    const a = r() * TAU;
    const stalkDir = c.clone().sub(tip).normalize();
    const L = size * 1.25;
    leafQuad(flowers, c.clone().addScaledVector(stalkDir, -L * 0.9), stalkDir, V(Math.cos(a), 0, Math.sin(a)), L, L, fcell(2), fl.clone().multiplyScalar(0.92), birth, tip, { segs: 1, sway0: swayAt(tip.y), sway1: s1 });
  };

  for (const run of runners) {
    const n = Math.max(1, Math.round(run.length / 0.024));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const t = (k + r() * 0.5) / n;
      const at = along(run.pts, t);
      side = -side;
      const rho = Math.hypot(at.p.x, at.p.z) / R;
      const edge = clamp((rho - 0.74) / 0.26);
      const last = k === n - 1;
      const len = (last ? 0.06 : 0.075) * (0.85 + r() * 0.3);
      const pitch = lerp(0.12 + r() * 0.8 * (0.25 + run.layer), 0.03 + r() * 0.12, edge) + (last ? 0.3 : 0);
      const shade = lerp(0.6, 1.0, clamp(run.layer * 0.85 + edge * 0.5 + r() * 0.25)) * (0.92 + r() * 0.16);
      const b = birthAt(rho);
      const s0 = swayAt(at.p.y);
      lay(leaves, at.p, heading(at.dir) + (last ? 0 : side * (0.3 + r() * 0.6)), pitch, (r() - 0.5) * 0.7, len, len, cellUV(last ? 2 : Math.floor(r() * 2)), white.clone().multiplyScalar(shade), b, { segs: 2, curl: pitch * 1.2 + r() * 0.25, center, radii, normalBend: 0.5, sway0: s0, sway1: clamp(s0 + 0.2) });
      // Side shoots all along the upper stems flower too, so the heads nearly cover the mat.
      if (!last && run.layer > 0.35 && r() < 0.1) head(at.p.clone().add(V((r() - 0.5) * 0.02, 0.008, (r() - 0.5) * 0.02)), at.dir, clamp(b + r() * 0.1, 0, 0.9));
    }
    const end = along(run.pts, 1);
    const erho = Math.hypot(end.p.x, end.p.z) / R;
    if (r() < 0.86) head(end.p, end.dir, birthAt(erho));
    if (run.level === 0) {
      const pts = run.pts.filter((_, i) => i % 3 === 0 || i === run.pts.length - 1);
      tube(wood, pts, 0.0018, 0.0011, 4, white, 0, pts[0], (i) => swayAt(pts[i].y));
    }
  }

  // Upright flowering shoots over the middle of the mat, each with its own leafy sprig.
  for (let k = 0; k < 22; k++) {
    const rho = Math.sqrt(r()) * 0.66, a = r() * TAU, az = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.006 + mound(rho) * (0.7 + r() * 0.3), Math.sin(a) * rho * R);
    const b = birthAt(rho);
    const len = 0.065 * (0.85 + r() * 0.3), pitch = 0.5 + r() * 0.5;
    const s0 = swayAt(p.y);
    const base = p.clone().add(V(-Math.cos(az) * len * 0.75 * Math.cos(pitch), -len * 0.75 * Math.sin(pitch), -Math.sin(az) * len * 0.75 * Math.cos(pitch)));
    lay(leaves, base, az, pitch, (r() - 0.5) * 0.5, len, len, cellUV(2), white.clone().multiplyScalar(0.9 + r() * 0.15), b, { segs: 2, curl: 0.5, center, radii, normalBend: 0.5, sway0: clamp(s0 - 0.2), sway1: s0 });
    head(p, V(Math.cos(az), 0, Math.sin(az)), b);
  }

  // Older shaded leaves on the soil under the mat.
  for (let k = 0; k < 60; k++) {
    const low = k < 26;
    const rho = Math.sqrt(r()) * (low ? 0.82 : 0.66), a = r() * TAU, az = r() * TAU, sz = 0.13 + r() * 0.05;
    const p = V(Math.cos(a) * rho * R, 0.004 + mound(rho) * (low ? 0.08 : 0.3 + r() * 0.4), Math.sin(a) * rho * R);
    const base = p.clone().add(V(-Math.cos(az) * sz * 0.5, 0, -Math.sin(az) * sz * 0.5));
    lay(leaves, base, az, 0.02, 0, sz, sz, cellUV(3), col('#ffffff', low ? 0.42 + r() * 0.12 : 0.62 + r() * 0.14), birthAt(rho), { segs: 1, center, radii, normalBend: 0.5, sway0: 0, sway1: 0 }, p);
  }

  // The crown: a short stub where the stems meet.
  tube(wood, [V(0, 0, 0), V(0, 0.015, 0)], 0.005, 0.0035, 5, white, 0, V(), () => 0);

  fitMat([leaves, flowers, wood], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    wood: wood.build(),
    leafMap: leafAtlas(),
    flowerMap: verbenaFlowerAtlas('gc-verbena-tapien-flowers', BLUE_VIOLET, (g, r, x, y, ang, len) => cutLeaf(g, r, x, y, ang, len, GREENS[2], 0), '#55703a', 'rgba(80,60,110,0.95)'),
    bark: { map: verbenaStemBark() },
    look: { leafRoughness: 0.72, translucency: 0.32, bend: 0.025, flutter: 0.005 },
  };
};
