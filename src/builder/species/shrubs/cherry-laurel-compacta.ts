import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import {
  buildFrame, frameWood, lumps, normalAt, sampleSurface, simpleBark, sprigCard, swayFn, tipOf, twigBirthLookup, type Br, type Shape, type UV,
} from './shared-shrubs-a';
import { cellClip, hardenAlpha } from './shared-shrubs-b';
import { leafFace, paintGlossLeaf, paintSpray, type GlossLeaf, type SprayStyle } from './shared-glossy';

/**
 * Compact Carolina cherry laurel, Prunus caroliniana 'Compacta' (sold as
 * Bright 'N Tight, 'Monus'), an unsheared plant with its late-winter buds.
 *
 * Upright and multi-stemmed: several stiff stems rise from a short base and
 * carry ascending side shoots, so a young plant is an open, feathery column
 * you can see the fence through, tapering to a pointed top; with age it
 * fills to a dense oval column, leafy to the ground. Leaves alternate,
 * elliptic to lance-elliptic, 2 to 4 in, entire (now and then a wavy edge),
 * lustrous dark green above and paler below, held up at a steep angle along
 * the shoots; new tips flush light green with a bronze cast. Short axillary
 * racemes (about 1 in) of cream buds line the upper shoots from late winter
 * and open to small, fragrant white flowers in early spring; black fruit
 * follows in fall (not shown).
 *
 * References:
 *  - Monrovia, Bright 'N Tight Carolina Laurel (P. caroliniana 'Monus'):
 *    reaches 8 to 10 ft tall, 6 to 8 ft wide in 10 years; moderate growth;
 *    shiny deep green foliage; upright, compact, dense columnar habit;
 *    fragrant white flower clusters in spring.
 *    https://monrovia.com/bright-n-tight-carolina-laurel.html
 *  - Devil Mountain Nursery (California wholesale), 'Compacta': 8 to 10 ft
 *    tall, 6 to 8 ft wide; pointed oval, glossy deep green leaves; spikes of
 *    fragrant white flowers, small black fruit. Grown in 5 gal, 15 gal and
 *    24 in box. https://devilmountainnursery.com/prunus-caroliniana-compacta
 *  - Boething Treeland (California wholesale), 'Compacta': 8 to 10 ft x 6 to
 *    8 ft; lustrous leaves with wavy edges, 2 to 4 in long; branches more
 *    closely spaced than the species; racemes of small white flowers.
 *    https://boethingtreeland.com/plants/prunus-caroliniana-compacta
 *  - NC State Extension, Prunus caroliniana (species): leaves 2 to 3 in,
 *    elliptic to lance-elliptic, entire on adult growth, lustrous dark green;
 *    flowers to 5/16 in, in axillary racemes about 1 in long, late winter to
 *    early spring. https://plants.ces.ncsu.edu/plants/prunus-caroliniana/
 * Catalog: 15 gal at 1.8 x 0.9 m (6 x 3 ft, the staked plant in the job
 * photos, about three weeks after planting), mature 3.0 m tall x 1.8 m wide
 * (10 x 6 ft, Monrovia's and the wholesalers' size) in about 6 years. A
 * 5 gal comes out near 1.1 m. Leaves are modeled a little long (3.5 to
 * 4.8 in at maturity) so the scaled-down install plant still shows the
 * 2.5 in leaves seen in the photos.
 */

const LEAF: GlossLeaf = {
  base: '#25471a', dark: '#0e240a', fresh: '#7c6c30', aspect: 0.38, widest: 0.46, tip: 0.7,
  veins: 7, impressed: 0.06, gloss: 0.3, midrib: 'rgba(176,196,118,0.75)',
};
const SPRAY: SprayStyle = { twig: '#5a4a2c', twigW: 0.013, leafLen: 0.34, nodes: 8, angle: 0.6, height: 0.9, zigzag: 0.008, petiole: 0.016, side: 1 };

/** Cream buds of a short raceme, painted in a leaf axil of a spray. */
function paintRaceme(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, open: number) {
  const n = 7 + Math.floor(r() * 5);
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  g.strokeStyle = '#6d7a3a';
  g.lineWidth = Math.max(1, len * 0.05);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(ex, ey);
  g.stroke();
  for (let i = 0; i < n; i++) {
    const t = 0.2 + (i / n) * 0.85;
    const sd = i % 2 ? 1 : -1;
    const px = lerp(x, ex, t) + Math.cos(ang + sd * 1.4) * len * 0.12, py = lerp(y, ey, t) + Math.sin(ang + sd * 1.4) * len * 0.12;
    const rad = len * lerp(0.13, 0.08, t) * (0.85 + r() * 0.3);
    const isOpen = r() < open * (1 - t);
    const grad = g.createRadialGradient(px - rad * 0.3, py - rad * 0.35, rad * 0.1, px, py, rad);
    grad.addColorStop(0, isOpen ? '#fffdf2' : '#efeac8');
    grad.addColorStop(0.7, isOpen ? '#f2eedc' : '#d6cf9c');
    grad.addColorStop(1, isOpen ? '#cfc8a6' : '#9a9a5e');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(px, py, rad * (isOpen ? 1.35 : 1), 0, 6.3);
    g.fill();
    if (isOpen) {
      g.fillStyle = '#d8c25a';
      g.beginPath();
      g.arc(px, py, rad * 0.35, 0, 6.3);
      g.fill();
    }
  }
}

function laurelAtlas(): { map: THREE.Texture; spray: (i: number) => UV; leaf: (i: number) => UV } {
  const map = leafTexture('cherry-laurel-compacta-leaves', 1024, 1024, (g) => {
    const r = rng('cherry-laurel-compacta-leaf-tex');
    // Sprays: 0-5 plain, 6-7 in shade (inner foliage), 8-10 with bud racemes in the upper axils, 11 a bronze new shoot.
    for (let i = 0; i < 12; i++) {
      cellClip(g, i % 4, Math.floor(i / 4), 256, 256);
      const shaded = i === 6 || i === 7;
      const buds = i >= 8 && i <= 10;
      paintSpray(g, r, 256, 256, LEAF, { ...SPRAY, nodes: 7 + Math.floor(r() * 3) }, {
        fresh: i === 11 ? 1 : shaded ? 0 : r() * 0.22,
        shade: shaded ? -0.55 : (r() - 0.5) * 0.25,
        axil: buds ? (x, y, a, k, n) => { if (k >= n - 4 && r() < 0.5) paintRaceme(g, r, x, y, a + (k % 2 ? 1 : -1) * 0.35, 24 + r() * 8, 0.1); } : undefined,
      });
      g.restore();
    }
    // Single leaves for the shoots: 0-5 mature, 6 young, 7 bronze-flushed.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 768);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...LEAF, aspect: 0.33 + r() * 0.05 }, { fresh: [0, 0, 0.04, 0.08, 0.1, 0.15, 0.55, 0.95][i], shade: (r() - 0.5) * 0.25 });
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
  const e = 1.5 / 1024;
  return {
    map,
    spray: (i) => {
      const cx = i % 4, cy = Math.floor(i / 4);
      return [cx / 4 + e, 1 - (cy + 1) / 4 + e, (cx + 1) / 4 - e, 1 - cy / 4 - e];
    },
    leaf: (i) => [i / 8 + e, e, (i + 1) / 8 - e, 0.25 - e],
  };
}

/** Racemes seen from the side: 0 all in bud, 1 opening. Axis base at the bottom of the cell. */
function racemeTex(): THREE.Texture {
  return leafTexture('cherry-laurel-compacta-racemes', 256, 256, (g) => {
    const r = rng('cherry-laurel-compacta-raceme-tex');
    for (let i = 0; i < 2; i++) {
      cellClip(g, i, 0, 128, 256);
      paintRaceme(g, r, 64, 250, -Math.PI / 2 + (r() - 0.5) * 0.1, 230, i === 0 ? 0.1 : 0.8);
      g.restore();
    }
    hardenAlpha(g, 256, 256);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = laurelAtlas();
  const e = 1.5 / 256;
  const rac = (i: number): UV => [i / 2 + e, e, (i + 1) / 2 - e, 1 - e];

  // Oval column: widest a little below the middle, drawn in toward the base, tapering to a blunt point.
  const a = (Sp / 2) * 0.94, top = H * 0.97, sPeak = 0.4, c = V(0, H * 0.45, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.72 + 0.28 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.pow(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 1.7)), 0.62);
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.12 * (1 + lumps(p, c, 4.2)) + 0.06 * lumps(p, c, 9.3));
    },
  };

  // Stiff upright stems from a short base, ascending side branches, many short twigs.
  const frame = buildFrame(r, sh, { H, Sp, stems: 7, stemBaseR: 0.07, stemR: 0.028, stemReach: 0.78, arch: 0.12, stemYMin: 0.5, secs: 140, secReach: 0.78, twigs: 520, twigInset: 0.12, wobble: 0.07, early: 0.74, twigMaxR: 0.0055, attachSpread: 1.0 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#ffffff', 0.4), twigCol = col('#4a4232');
  frameWood(wood, frame, { r, sway, twigFrac: 0.4, color: (b) => (b.level === 2 ? twigCol : b.level === 1 ? stemCol.clone().lerp(twigCol, 0.35) : stemCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birthAt = twigBirthLookup(frame.twigs);
  const radii = V(a, H * 0.55, a);
  const lightAt = (p: THREE.Vector3) => lerp(0.74, 1, clamp(p.y / (H * 0.65)));

  // Leafy shoots: each twig ends in a shoot of alternate leaves held steeply up, the top ones young; a third carry
  // bud racemes in the upper axils.
  const shoot = (p0: THREE.Vector3, dir0: THREE.Vector3, birth: number, nLeaves: number, L: number, racemes: boolean) => {
    const n = normalAt(sh, p0);
    const axis = dir0.clone().multiplyScalar(0.4).addScaledVector(n, 0.35).add(V(0, 0.75, 0)).normalize();
    const p1 = p0.clone().addScaledVector(axis, L);
    const s0 = sway(p0), s1 = clamp(sway(p1) + 0.06);
    tube(wood, [p0, p0.clone().lerp(p1, 0.5).add(V(0, L * 0.02, 0)), p1], 0.0026, 0.0012, 3, twigCol, birth, p0, (i) => lerp(s0, s1, i / 2), 2);
    let az = r() * 6.2832;
    const lit = lightAt(p0) * (0.86 + r() * 0.14);
    for (let k = 0; k < nLeaves; k++) {
      const t = (k + 0.6) / (nLeaves + 0.2);
      const q = p0.clone().lerp(p1, t);
      az += 2.51 + (r() - 0.5) * 0.4;
      const young = t > 0.82;
      const d = deflect(axis, (young ? 0.38 : 0.62) + (r() - 0.5) * 0.3, az).add(V(0, 0.05, 0)).normalize();
      const len = (young ? 0.08 : 0.097 + r() * 0.025) * (spec.matureHeight / 3);
      const face = leafFace(d, axis, n, 0.45);
      const cell = young && r() < 0.35 ? (r() < 0.4 ? 7 : 6) : Math.floor(r() * 6);
      const sw = lerp(s0, s1, t);
      leafQuad(leaves, q, d, face, len, len * 0.5, at.leaf(cell), white.clone().multiplyScalar(lit), birth, q, { segs: 2, curl: 0.3 + r() * 0.25, center: c, radii, normalBend: 0.3, sway0: sw, sway1: clamp(sw + 0.08) });
      if (racemes && !young && t > 0.4 && r() < 0.45) {
        // A raceme of buds from the axil, standing between the leaf and the shoot.
        const rd = d.clone().lerp(axis, 0.55).add(V(0, 0.1, 0)).normalize();
        const rl = (0.03 + r() * 0.012) * (spec.matureHeight / 3);
        const f1 = perp(rd), f2 = V().crossVectors(rd, f1).normalize();
        const cell2 = r() < 0.75 ? 0 : 1;
        for (const f of [f1, f2]) leafQuad(flowers, q, rd, f, rl, rl * 0.42, rac(cell2), col('#ffffff', 0.8), birth, q, { sway0: sw, sway1: sw });
      }
    }
  };
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    shoot(p, dir, clamp(tw.birth + r() * 0.04, 0, 0.9), 5 + Math.floor(r() * 2), 0.13 + r() * 0.05, r() < 0.3);
  }

  // Leaves straight off the stems and branches: a young laurel is leafy along its stems from low down, which hides the wood.
  const stemLeaves = (b: Br, from: number, step: number) => {
    const L = b.pts.reduce((acc, p, i) => (i ? acc + p.distanceTo(b.pts[i - 1]) : 0), 0);
    let az = r() * 6.2832;
    for (let t = from + r() * (step / L); t < 0.97; t += (step / L) * (0.8 + r() * 0.4)) {
      const at2 = along(b.pts, t);
      if (at2.p.y < 0.12) continue;
      az += 2.51 + (r() - 0.5) * 0.5;
      const n = normalAt(sh, at2.p);
      const d = deflect(at2.dir, 0.75 + (r() - 0.5) * 0.35, az).add(V(0, 0.15, 0)).normalize();
      const len = (0.09 + r() * 0.025) * (spec.matureHeight / 3);
      const sw = sway(at2.p);
      const birth = r() < 0.85 ? b.birth : clamp(b.birth + 0.1 + r() * 0.3, 0, 0.9);
      leafQuad(leaves, at2.p, d, leafFace(d, at2.dir, n, 0.5), len, len * 0.5, at.leaf(Math.floor(r() * 6)), white.clone().multiplyScalar(lightAt(at2.p) * (0.72 + r() * 0.18)), birth, at2.p, { segs: 2, curl: 0.35 + r() * 0.25, center: c, radii, normalBend: 0.3, sway0: sw, sway1: clamp(sw + 0.08) });
    }
  };
  for (const b of frame.stems) stemLeaves(b, 0.12, 0.075);
  for (const b of frame.secs) stemLeaves(b, 0.2, 0.08);

  // An unsheared plant is never a clean column: vigorous shoots stand out of the top and sides, and a few low
  // branches reach out sideways and turn up, each leafy along its length (as on the plant in the job photos).
  const outShoot = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, birth: number) => {
    const p2 = p0.clone().addScaledVector(dir, len);
    const p1 = p0.clone().lerp(p2, 0.5).add(V(0, len * 0.06, 0));
    const pts = [p0, p1, p2];
    const s0 = sway(p0), s1 = clamp(sway(p2) + 0.12);
    tube(wood, pts, 0.005, 0.0016, 3, twigCol, birth, p0, (i) => lerp(s0, s1, i / 2), 2);
    stemLeaves({ pts, r0: 0.005, r1: 0.0016, level: 2, birth }, 0.25, 0.07);
    shoot(p2, dir, birth, 4 + Math.floor(r() * 2), 0.1 + r() * 0.04, r() < 0.4);
  };
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    if (p.y > H * 0.55 && r() < 0.05) {
      const d = n.clone().multiplyScalar(0.35).addScaledVector(dir, 0.2).add(V(0, 0.9, 0)).normalize();
      outShoot(p, d, (0.22 + r() * 0.2) * (H / 3), clamp(tw.birth + r() * 0.1, 0, 0.9));
    }
  }
  // Side branches reaching past the outline at mid height and turning up, so the young plant is ragged, not a column.
  for (const b of frame.secs) {
    const at2 = along(b.pts, 0.65 + r() * 0.25);
    if (at2.p.y < H * 0.18 || at2.p.y > H * 0.68 || r() > 0.28) continue;
    const out = V(at2.p.x, 0, at2.p.z);
    if (out.lengthSq() < 1e-6) out.set(r() - 0.5, 0, r() - 0.5);
    out.normalize().applyAxisAngle(UP, (r() - 0.5) * 0.8);
    const d = out.multiplyScalar(0.75).add(V(0, 0.7, 0)).normalize();
    outShoot(at2.p, d, (0.3 + r() * 0.18) * (Sp / 1.8), b.birth);
  }
  for (const b of frame.stems) {
    if (r() < 0.45) continue;
    const at2 = along(b.pts, 0.12 + r() * 0.2);
    const out = V(at2.p.x, 0, at2.p.z);
    if (out.lengthSq() < 1e-6) out.set(r() - 0.5, 0, r() - 0.5);
    out.normalize().applyAxisAngle(UP, (r() - 0.5) * 1.2);
    const d = out.multiplyScalar(0.8).add(V(0, 0.75, 0)).normalize();
    outShoot(at2.p, d, (0.55 + r() * 0.25) * (Sp / 1.8), 0);
  }

  // Leaf sprays along the branches, held up along them: the young plant's leafy stems you can see into.
  const alongSprays = (b: Br, ts: number[], size: [number, number], dark: boolean) => {
    for (const t of ts) {
      const at2 = along(b.pts, t);
      const n = normalAt(sh, at2.p);
      const dir = deflect(at2.dir, 0.35 + r() * 0.45, r() * 6.2832).add(V(0, 0.45, 0)).normalize();
      const face = n.clone().add(V((r() - 0.5) * 0.8, 0.1, (r() - 0.5) * 0.8)).normalize();
      const len = lerp(size[0], size[1], r());
      const s = sway(at2.p);
      const birth = r() < 0.8 ? b.birth : clamp(Math.max(b.birth, 0.1) + r() * 0.4, 0, 0.9);
      const depth = 1 - clamp(Math.hypot(at2.p.x, at2.p.z) / a);
      const cell = dark || depth > 0.7 ? 6 + Math.floor(r() * 2) : r() < 0.1 ? 8 + Math.floor(r() * 3) : Math.floor(r() * 6);
      sprigCard(leaves, at2.p, dir, face, len, len, at.spray(cell), white.clone().multiplyScalar(lightAt(at2.p) * lerp(1, 0.6, depth) * (0.86 + r() * 0.14)), birth, at2.p, n, 0.3, s, clamp(s + 0.12), 0.3);
    }
  };
  for (const b of frame.secs) alongSprays(b, [0.45 + r() * 0.1, 0.8], [0.24, 0.3], false);
  for (const b of frame.twigs) if (r() < 0.35) alongSprays(b, [0.4 + r() * 0.3], [0.22, 0.28], false);

  // The outer shell of sprays fills in with age (a few are there at install), so the mature plant is a dense column.
  for (const s of sampleSurface(r, sh, 1050, 0.04, 0.03)) {
    const depth = Math.pow(r(), 1.6);
    const tip = s.p.clone().addScaledVector(s.n, -depth * 0.2);
    const ta = perp(s.n), tb = V().crossVectors(s.n, ta);
    const az = r() * 6.2832;
    const tan = ta.multiplyScalar(Math.cos(az)).addScaledVector(tb, Math.sin(az));
    const dir = s.n.clone().multiplyScalar(0.3).addScaledVector(tan, 0.45).add(V(0, 0.6, 0)).normalize();
    const L = 0.24 + r() * 0.07;
    const base = tip.clone().addScaledVector(dir, -L * 0.8);
    if (base.y < 0.02) base.y = 0.02;
    const face = s.n.clone().multiplyScalar(0.9).add(V((r() - 0.5) * 0.4, 0.2, (r() - 0.5) * 0.4)).normalize();
    const b0 = birthAt(tip);
    const birth = r() < 0.6 ? b0 : clamp(Math.max(b0, 0.12) + r() * 0.55, 0, 0.9);
    const sw = sway(base);
    const cell = depth > 0.6 ? 6 + Math.floor(r() * 2) : r() < 0.12 ? 8 + Math.floor(r() * 3) : r() < 0.06 ? 11 : Math.floor(r() * 6);
    sprigCard(leaves, base, dir, face, L, L, at.spray(cell), jitter(white, r, 0.01, 0.04, 0.04).multiplyScalar(lightAt(tip) * lerp(1, 0.66, depth) * (0.86 + r() * 0.14)), birth, base, s.n, 0.3, sw, clamp(sw + 0.12), 0.3);
  }
  // Deep shaded foliage that closes the middle of the mature plant (none at install: the young plant is see-through).
  for (const s of sampleSurface(r, sh, 320, 0.05, 0.05)) {
    const tip = s.p.clone().addScaledVector(s.n, -Sp * (0.14 + r() * 0.16));
    const dir = s.n.clone().multiplyScalar(0.4).add(V((r() - 0.5) * 0.6, 0.7, (r() - 0.5) * 0.6)).normalize();
    const L = 0.22 + r() * 0.06;
    const base = tip.clone().addScaledVector(dir, -L * 0.8);
    if (base.y < 0.02) base.y = 0.02;
    const sw = sway(base);
    sprigCard(leaves, base, dir, s.n.clone().add(V(0, 0.3, 0)).normalize(), L, L, at.spray(6 + Math.floor(r() * 2)), white.clone().multiplyScalar(0.42 + r() * 0.16), clamp(0.25 + r() * 0.45, 0, 0.9), base, s.n, 0.6, sw, clamp(sw + 0.1));
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: racemeTex(),
    bark: { map: simpleBark('cherry-laurel-compacta-bark', '#6f6458', '#463b31', '#968b7c') },
    look: { leafRoughness: 0.65, translucency: 0.18, bend: 0.06, flutter: 0.008, woodShadows: true },
  };
};

