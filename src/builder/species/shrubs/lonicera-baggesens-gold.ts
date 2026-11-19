import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, deflect, lerp, rng, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, shellSprigs, simpleBark, sprigCard, swayFn, tipOf, twigBirthLookup,
  type LeafStyle, type Shape,
} from './shared-shrubs-a';

/**
 * Box honeysuckle 'Baggesen's Gold', Lonicera nitida (L. ligustrina var.
 * yunnanensis) 'Baggesen's Gold'.
 *
 * A broad, loose, billowing mound of long, arching shoots. Each shoot carries
 * tiny oval leaves, a quarter to five eighths of an inch long, in opposite
 * pairs set in two flat ranks, with shorter side shoots in the same plane, so
 * the foliage hangs in fine, flat, fishbone-like sprays that catch the light
 * leaf by leaf and give the plant its soft, feathery texture. The leaves are
 * golden yellow to chartreuse in sun, lime green on the shaded inside and
 * lower down; the slender young shoots are purplish tan. Unclipped, the
 * sprays stick out past the mound here and there. The tiny paired creamy
 * flowers and the rare blue-purple berries are too small to read; none are
 * modeled.
 *
 * References and the numbers they give:
 * - Oregon State University Landscape Plants, Lonicera nitida and
 *   'Baggesen's Gold' (landscapeplants.oregonstate.edu): leaves opposite,
 *   simple, ovate to roundish, 6 to 16 mm on a 1 mm stalk; new leaves golden,
 *   fading to yellowish green; 'Baggesen's Gold' 3 to 4 ft.
 * - Devil Mountain Nursery, Lonicera nitida 'Baggesen's Gold'
 *   (devilmountainnursery.com/lonicera-nitida-baggesens-gold): 4 to 6 ft tall
 *   and wide; golden foliage, bronze tint in winter; sold in 1 and 5 gal.
 * - Rogers Gardens, Baggesen's Gold Box Honeysuckle (plants.rogersgardens.com,
 *   plant 9473): 5 x 5 ft, medium growth rate.
 * - RHS, Lonicera nitida 'Baggesen's Gold' (rhs.org.uk/plants/78340): long
 *   arching shoots covered in small golden leaves; 1.5 to 2.5 m in 10 to 20
 *   years (in England).
 * - Trees and Shrubs Online, Lonicera ligustrina: leaves 1/4 to 5/8 in,
 *   normally in two ranks; young shoots slender, purplish, downy.
 * - The job video (a finished front yard, early April): two established
 *   plants along the house, about 3 ft tall and 4 ft wide, chartreuse-yellow in
 *   sun and green with chartreuse spray tips in part shade.
 * Leaves here about 12 mm.
 * Size used: installed from a 5 gal at 0.45 m tall x 0.5 m wide; 1.0 m
 * (3.3 ft) tall x 1.5 m (5 ft) wide in about five years: a broad mound, within
 * the growers' 3 to 6 ft, wider than tall as the job's plants grow.
 */

const LEAF: LeafStyle = {
  p: 0.7, q: 0.55, aspect: 0.56,
  base: '#8c9a16', dark: '#4a5e10', light: '#bcac16',
  midrib: 'rgba(190,200,90,0.45)', midribW: 0.03, gloss: 0.07,
};

/**
 * A two-ranked spray growing up a W x H cell: an arching shoot with opposite pairs of tiny oval leaves lying flat
 * either side, and alternate side shoots in the same plane, each with its own pairs (the fishbone look). `gold` 0..1
 * is how sunlit and golden the spray is, `shade` darkens it.
 */
function paintSpray(g: CanvasRenderingContext2D, r: () => number, W: number, H: number, gold: number, shade: number) {
  const leafLen = W * 0.2;
  const jobs: { x: number; y: number; len: number; rot: number; fresh: number; sh: number; sq: number }[] = [];
  const stems: number[][] = [];
  const shoot = (x0: number, y0: number, ang: number, len: number, pairs: number, depth: number) => {
    const bend = (r() - 0.5) * 0.25 + (depth ? 0 : 0.12);
    const pts: number[] = [];
    let x = x0, y = y0, a = ang;
    const steps = pairs * 2;
    pts.push(x, y);
    for (let i = 1; i <= steps; i++) {
      a += bend / steps;
      x += Math.cos(a) * (len / steps);
      y += Math.sin(a) * (len / steps);
      pts.push(x, y);
      if (i % 2 === 0) {
        const t = i / steps;
        const L = leafLen * lerp(1, 0.6, t * t) * (0.85 + r() * 0.3) * (depth ? 0.85 : 1);
        for (const s of [-1, 1]) {
          jobs.push({ x, y, len: L, rot: a + s * (0.95 + (r() - 0.5) * 0.35), fresh: clamp(gold * lerp(0.6, 1.05, t) + (r() - 0.5) * 0.2), sh: shade + (r() - 0.5) * 0.25, sq: 0.8 + r() * 0.2 });
        }
        // Alternate side shoots from the lower two thirds of the main shoot.
        if (depth === 0 && t > 0.1 && t < 0.75 && r() < 0.6) {
          const sd = (i / 2) % 2 ? 1 : -1;
          shoot(x, y, a + sd * (0.55 + r() * 0.2), len * (0.32 + r() * 0.16), Math.max(3, Math.round(pairs * 0.42)), 1);
        }
      }
    }
    // The tip: a small folded pair of the youngest, most golden leaves.
    for (const s of [-1, 1]) jobs.push({ x, y, len: leafLen * 0.5, rot: a + s * 0.35, fresh: clamp(gold * 1.2), sh: shade + 0.1, sq: 0.8 });
    stems.push(pts.concat([depth]));
  };
  shoot(W / 2, H * 0.995, -Math.PI / 2 + (r() - 0.5) * 0.1, H * 0.9, 12, 0);
  g.lineCap = 'round';
  for (const st of stems) {
    const depth = st.pop()!;
    g.strokeStyle = depth ? '#8c7458' : '#7a6048';
    g.lineWidth = W * (depth ? 0.016 : 0.022);
    g.beginPath();
    g.moveTo(st[0], st[1]);
    for (let i = 2; i < st.length; i += 2) g.lineTo(st[i], st[i + 1]);
    g.stroke();
  }
  for (const j of jobs) paintLeaf(g, r, j.x + Math.cos(j.rot) * W * 0.01, j.y + Math.sin(j.rot) * W * 0.01, j.len, j.rot, LEAF, { fresh: j.fresh, shade: j.sh, squash: j.sq });
}

/** Twelve 128 x 384 cells in a row: 0-3 sunlit golden sprays, 4-7 half-shaded lime sprays, 8-11 deep inner sprays. */
function honeysuckleAtlas() {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    cells.push({
      x: i * 128, y: 0, w: 128, h: 384,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintSpray(g, r, w, h, row === 0 ? 0.8 + r() * 0.2 : row === 1 ? 0.35 + r() * 0.2 : 0.1, row === 0 ? 0.05 : row === 1 ? -0.1 : -0.5),
    });
  }
  return atlas('lonicera-baggesens-gold-atlas', 1536, 384, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = honeysuckleAtlas();

  // A broad, loose dome, billowing in big soft lumps.
  const a = (Sp / 2) * 0.95, top = H * 0.93, yc = H * 0.24, c = V(0, yc, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const rho = Math.hypot(p.x, p.z);
      const v = p.y >= yc ? Math.pow(Math.pow(rho / a, 2.3) + Math.pow((p.y - yc) / (top - yc), 2.3), 1 / 2.3) : rho / (a * (1 - 0.2 * ((yc - p.y) / yc) ** 2));
      return v * (1 + 0.07 * (1 + lumps(p, c, 3.3)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 12, stemBaseR: 0.1, stemR: 0.012, arch: 0.3, stemYMin: 0.2, secs: 70, twigs: 420, twigInset: 0.06, early: 0.82 });
  const sway = swayFn(H, Sp);
  const twigCol = col('#a08a70'), barkCol = col('#ffffff');
  frameWood(wood, frame, { r, sway, twigFrac: 0.25, color: (b) => (b.level === 2 ? twigCol : barkCol), uvScale: 2 });
  const birth = twigBirthLookup(frame.twigs);

  const white = new THREE.Color(1, 1, 1);
  const lightAt = (p: THREE.Vector3) => clamp(0.45 * clamp(p.y / (H * 0.8)) + 0.55 * clamp(normalAt(sh, p).y * 0.5 + 0.5));
  const cellFor = (sun: number) => at.uv[(sun > 0.62 ? 0 : sun > 0.35 ? 4 : 8) + Math.floor(r() * 4)];

  // The body: sprays reaching the surface, lying fairly flat along it and arching over at the tips.
  shellSprigs(leaves, r, sh, {
    n: 3400, len: [0.16, 0.24], aspect: 0.4, inset: 0.14, tangent: 0.66, up: 0.08, nb: 0.6, curl: 0.55, sway, birth, early: 0.74,
    cell: (depth, p) => cellFor(lightAt(p) * (1 - depth * 0.8)),
    color: (depth, p) => white.clone().multiplyScalar(lerp(1, 0.45, depth) * lerp(0.78, 1, clamp(p.y / (H * 0.7))) * (0.76 + r() * 0.28)),
  });
  // Long arching shoots from the twig tips, sticking out past the mound here and there: the ragged, feathery outline.
  for (const tw of frame.twigs) {
    if (r() > 0.3) continue;
    const { p } = tipOf(tw);
    const n = normalAt(sh, p);
    const dir = deflect(n.clone().add(V(0, 0.35, 0)).normalize(), 0.3 + r() * 0.3, r() * 6.28);
    const len = 0.18 + r() * 0.14;
    const face = n.clone().add(V(0, 0.8, 0)).normalize();
    const s0 = sway(p);
    sprigCard(leaves, p.clone().addScaledVector(n, -0.04), dir, face, len, len * 0.4, cellFor(lightAt(p) + 0.1), white.clone().multiplyScalar(0.9 + r() * 0.12), clamp(tw.birth + r() * 0.15, 0, 0.9), p, n, 0.55, s0, clamp(s0 + 0.2), 0.9 + r() * 0.5);
  }
  // Shaded inner sprays so the young plant is never a hollow shell.
  shellSprigs(leaves, r, sh, {
    n: 1000, len: [0.18, 0.24], aspect: 0.4, inset: Math.min(H, Sp) * 0.3, tangent: 0.5, up: 0.3, nb: 0.6, curl: 0.3, sway, early: 1,
    birth: () => 0,
    cell: () => at.uv[8 + Math.floor(r() * 4)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.75, 0.45, depth)),
  });

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('lonicera-nitida-bark', '#8a7660', '#5a4a3a', '#b09a80') },
    look: { leafRoughness: 0.62, translucency: 0.22, bend: 0.05, flutter: 0.008 },
  };
};
