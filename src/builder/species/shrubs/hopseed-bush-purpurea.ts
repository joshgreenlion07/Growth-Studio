import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import {
  buildFrame, frameWood, lumps, normalAt, sampleSurface, simpleBark, sprigCard, swayFn, tipOf, twigBirthLookup, type Br, type Shape, type UV,
} from './shared-shrubs-a';
import { cellClip, hardenAlpha, tone } from './shared-shrubs-b';
import { leafFace, paintGlossLeaf, paintSpray, type GlossLeaf, type SprayStyle } from './shared-glossy';

/**
 * Purple hopseed bush, Dodonaea viscosa 'Purpurea', unsheared, as installed
 * against a fence in part shade.
 *
 * An upright, fast, narrow shrub on a short trunk: a few stems rise steeply
 * and branch into many slender reddish-brown shoots, so the plant is a loose
 * oval column, pointed at the top while young. Leaves alternate, narrow and
 * willow-like (oblanceolate), 2.5 to 4 in long and about half an inch wide,
 * with a wavy edge and a resinous shine, crowded and held steeply up toward
 * the shoot tips. Color depends on light: in full sun and cold the whole
 * plant goes bronze-purple to burgundy; in part shade, as on the job (photos
 * in early February, at dusk), it stays olive green with a brownish-purple
 * cast and coppery-red to bronze-purple shoot tips. Inconspicuous flowers
 * are followed by clusters of papery, two- to three-winged capsules about
 * 0.6 in across, pinkish bronze ripening to tan; a modest show is modeled.
 *
 * References:
 *  - Monrovia, Purple Hopseed Bush: reaches 12 ft tall, 6 to 8 ft wide; fast
 *    growing; dense, narrow, lance-shaped bronze-green foliage turning deep
 *    purple-red in cold; pinkish papery seed pods.
 *    https://www.monrovia.com/purple-hopseed-bush.html
 *  - Boething Treeland (California wholesale): 10 to 15 ft x 8 to 12 ft;
 *    fast; narrow, leathery 3 to 4 in leaves, bronze-green to coppery-purple
 *    in summer, reddish purple to burgundy in winter; paper-thin, maple-like
 *    seed capsules in late summer; oval, upright habit; #5 and #15.
 *    https://www.boethingtreeland.com/plants/dodonaea-viscosa-purpurea/
 *  - Oregon State University Landscape Plants, Dodonaea viscosa: leaves
 *    alternate, 4 to 7 cm x 1 to 1.5 cm, obovate to lanceolate, willow-like,
 *    wavy margins, sticky resin on new leaves; capsule 1.5 cm wide with two to
 *    four papery wings, red, pink or green ripening brown; 'Purpurea' is the
 *    purple-leaved selection. https://landscapeplants.oregonstate.edu/plants/dodonaea-viscosa
 * Catalog: 15 gal at 1.5 x 0.75 m (5 x 2.5 ft, the plants in the job photos;
 * a 5 gal comes out near 0.9 m), mature 3.6 m tall x 1.8 m wide (12 x 6 ft,
 * Monrovia's height and the narrow end of its spread, for a fence-line
 * planting) in about 5 years. Leaves are modeled 3.3 to 4.9 in at maturity
 * so the scaled-down install plant still shows 1.5 to 2 in leaves.
 */

const OLIVE: GlossLeaf = {
  base: '#566a3b', dark: '#2c361c', fresh: '#885a38', aspect: 0.22, widest: 0.62, tip: 0.55,
  veins: 0, gloss: 0.34, midrib: 'rgba(196,170,120,0.55)',
};
const PURPLE: GlossLeaf = { ...OLIVE, base: '#4f5034', dark: '#2a261b', fresh: '#7e4434', midrib: 'rgba(200,150,120,0.5)' };
const SPRAY: SprayStyle = { twig: '#5c3a2c', twigW: 0.011, leafLen: 0.4, nodes: 12, angle: 0.42, height: 0.92, zigzag: 0.004, petiole: 0.006, side: 2 };

/** A cluster of winged capsules on short stalks, centered at (x, y), about `R` across. */
function paintCapsules(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, R: number, n: number, age: number) {
  g.strokeStyle = '#6a4434';
  g.lineWidth = Math.max(1, R * 0.03);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2, d = R * (0.2 + r() * 0.28);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    pts.push([px, py, R * (0.2 + r() * 0.06)]);
    g.beginPath();
    g.moveTo(x, y + R * 0.35);
    g.quadraticCurveTo(x, py + R * 0.1, px, py);
    g.stroke();
  }
  for (const [px, py, rad] of pts) {
    const old = r() < age;
    const wingC = old ? tone('#a08462', '#bca07c', r()) : tone('#8a5848', '#a07262', r());
    const rimC = old ? '#cdb994' : '#c09482';
    const wings = r() < 0.6 ? 3 : 2;
    const a0 = r() * 6.28;
    for (let k = 0; k < wings; k++) {
      const a = a0 + (k / wings) * 6.2832;
      g.save();
      g.translate(px + Math.cos(a) * rad * 0.55, py + Math.sin(a) * rad * 0.55);
      g.rotate(a);
      const grad = g.createRadialGradient(-rad * 0.3, 0, rad * 0.05, 0, 0, rad * 0.75);
      grad.addColorStop(0, tone(wingC, '#5a2a24', 0.35));
      grad.addColorStop(0.6, wingC);
      grad.addColorStop(1, rimC);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, 0, rad * 0.62, rad * 0.5, 0, 0, 6.3);
      g.fill();
      g.strokeStyle = 'rgba(80,30,20,0.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-rad * 0.5, 0);
      g.lineTo(rad * 0.5, 0);
      g.stroke();
      g.restore();
    }
    g.fillStyle = old ? '#6a5034' : '#5e2a26';
    g.beginPath();
    g.arc(px, py, rad * 0.16, 0, 6.3);
    g.fill();
  }
}

function hopseedAtlas(): { map: THREE.Texture; spray: (i: number) => UV; leaf: (i: number) => UV } {
  const map = leafTexture('hopseed-bush-purpurea-leaves', 1024, 1024, (g) => {
    const r = rng('hopseed-bush-purpurea-leaf-tex');
    // Sprays: 0-3 olive with coppery tips, 4-5 purple-cast, 6-7 in shade, 8-9 carrying capsules, 10-11 coppery new shoots.
    for (let i = 0; i < 12; i++) {
      cellClip(g, i % 4, Math.floor(i / 4), 256, 256);
      const leaf = i === 4 || i === 5 || i === 9 || i === 11 ? PURPLE : OLIVE;
      const shaded = i === 6 || i === 7;
      const caps = i === 8 || i === 9;
      paintSpray(g, r, 256, 256, leaf, { ...SPRAY, nodes: 11 + Math.floor(r() * 4) }, {
        fresh: i >= 10 ? 0.95 : shaded ? 0.05 : 0.2 + r() * 0.3,
        shade: shaded ? -0.55 : (r() - 0.5) * 0.25,
      });
      if (caps) paintCapsules(g, r, 128, 46, 70, 6 + Math.floor(r() * 3), 0.25);
      g.restore();
    }
    // Single leaves for the shoots: 0-3 olive, 4-5 purple-cast, 6 bronze, 7 coppery-red tip.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 768);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      const leaf = i === 4 || i === 5 || i === 7 ? PURPLE : OLIVE;
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...leaf, aspect: 0.24 + r() * 0.05 }, { fresh: [0.02, 0.06, 0.1, 0.15, 0.08, 0.2, 0.6, 1][i], shade: (r() - 0.5) * 0.25 });
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

/** Capsule clusters seen from the side, stalks at the bottom of each cell (0, 1 fresh pink-bronze, 2 aging tan). */
function capsuleTex(): THREE.Texture {
  return leafTexture('hopseed-bush-purpurea-capsules', 384, 128, (g) => {
    const r = rng('hopseed-bush-purpurea-capsule-tex');
    for (let i = 0; i < 3; i++) {
      cellClip(g, i, 0, 128, 128);
      paintCapsules(g, r, 64, 78, 92, 5 + Math.floor(r() * 3), i === 2 ? 0.8 : 0.15);
      g.restore();
    }
    hardenAlpha(g, 384, 128);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), fruit = new GeoBuilder();
  const at = hopseedAtlas();
  const e3 = 1.5 / 384;
  const capUV = (i: number): UV => [i / 3 + e3, 0.02, (i + 1) / 3 - e3, 0.98];
  const k = H / 3.6;

  // Loose oval column on a short trunk: narrow at the base, widest a little below the middle, a pointed top.
  const a = (Sp / 2) * 0.95, top = H * 0.97, sPeak = 0.36, c = V(0, H * 0.48, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.6 + 0.4 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.pow(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 1.5)), 0.7);
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.16 * (1 + lumps(p, c, 2.2)) + 0.08 * lumps(p, c, 7.7));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 6, stemBaseR: 0.03, stemR: 0.024, stemReach: 0.8, arch: 0.1, stemYMin: 0.45, secs: 120, secReach: 0.8, twigs: 560, twigInset: 0.14, wobble: 0.12, early: 0.74, twigMaxR: 0.005, attachSpread: 1.4 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#ffffff', 0.45), twigCol = col('#5a3e30');
  frameWood(wood, frame, { r, sway, twigFrac: 0.3, color: (b) => (b.level === 2 ? twigCol : b.level === 1 ? stemCol.clone().lerp(twigCol, 0.5) : stemCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birthAt = twigBirthLookup(frame.twigs);
  const radii = V(a, H * 0.55, a);
  const lightAt = (p: THREE.Vector3) => lerp(0.72, 1, clamp(p.y / (H * 0.65)));

  // Leafy shoots at the twig ends: narrow leaves crowded and held steeply up, the top ones coppery; some end in capsules.
  const shoot = (p0: THREE.Vector3, dir0: THREE.Vector3, birth: number, nLeaves: number, L: number, capsules: boolean) => {
    const n = normalAt(sh, p0);
    const axis = dir0.clone().multiplyScalar(0.35).addScaledVector(n, 0.3).add(V(0, 0.85, 0)).normalize();
    const p1 = p0.clone().addScaledVector(axis, L);
    const s0 = sway(p0), s1 = clamp(sway(p1) + 0.08);
    tube(wood, [p0, p1], 0.002, 0.001, 3, twigCol, birth, p0, (i) => (i ? s1 : s0), 2);
    let az = r() * 6.2832;
    const lit = lightAt(p0) * (0.86 + r() * 0.14);
    const purple = r() < 0.22;
    for (let j = 0; j < nLeaves; j++) {
      const t = (j + 0.5) / nLeaves;
      const q = p0.clone().lerp(p1, t);
      az += 2.4 + (r() - 0.5) * 0.4;
      const tipLeaf = t > 0.7;
      const d = deflect(axis, (tipLeaf ? 0.32 : 0.5) + (r() - 0.5) * 0.25, az).normalize();
      const len = (tipLeaf ? 0.085 : 0.105 + r() * 0.02) * k;
      const cell = tipLeaf && r() < 0.45 ? (r() < 0.5 ? 7 : 6) : purple ? 4 + Math.floor(r() * 2) : Math.floor(r() * 4);
      const sw = lerp(s0, s1, t);
      leafQuad(leaves, q, d, leafFace(d, axis, n, 0.4), len, len * 0.5, at.leaf(cell), white.clone().multiplyScalar(lit), birth, q, { segs: 2, curl: 0.15 + r() * 0.2, center: c, radii, normalBend: 0.3, sway0: sw, sway1: clamp(sw + 0.08) });
    }
    if (capsules) {
      const cd = axis.clone().add(V((r() - 0.5) * 0.4, 0.2, (r() - 0.5) * 0.4)).normalize();
      const sz = (0.06 + r() * 0.02) * k;
      const f1 = perp(cd), f2 = V().crossVectors(cd, f1).normalize();
      const cell = r() < 0.25 ? 2 : r() < 0.5 ? 1 : 0;
      for (const f of [f1, f2]) leafQuad(fruit, p1.clone().addScaledVector(cd, -sz * 0.15), cd, f, sz, sz, capUV(cell), col('#ffffff', 0.9), birth, p1, { sway0: s1, sway1: s1 });
    }
  };
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    shoot(p, dir, clamp(tw.birth + r() * 0.04, 0, 0.9), 6 + Math.floor(r() * 3), 0.1 + r() * 0.05, p.y > H * 0.45 && r() < 0.09);
  }

  // Leaves along the stems and branches, which a young hopseed carries nearly to the base.
  const stemLeaves = (b: Br, from: number, step: number) => {
    const L = b.pts.reduce((acc, p, i) => (i ? acc + p.distanceTo(b.pts[i - 1]) : 0), 0);
    let az = r() * 6.2832;
    for (let t = from + r() * (step / L); t < 0.97; t += (step / L) * (0.8 + r() * 0.4)) {
      const at2 = along(b.pts, t);
      if (at2.p.y < H * 0.06) continue;
      az += 2.4 + (r() - 0.5) * 0.5;
      const n = normalAt(sh, at2.p);
      const d = deflect(at2.dir, 0.6 + (r() - 0.5) * 0.3, az).add(V(0, 0.2, 0)).normalize();
      const len = (0.1 + r() * 0.02) * k;
      const sw = sway(at2.p);
      const birth = r() < 0.85 ? b.birth : clamp(b.birth + 0.1 + r() * 0.3, 0, 0.9);
      leafQuad(leaves, at2.p, d, leafFace(d, at2.dir, n, 0.5), len, len * 0.5, at.leaf(r() < 0.22 ? 4 + Math.floor(r() * 2) : Math.floor(r() * 4)), white.clone().multiplyScalar(lightAt(at2.p) * (0.72 + r() * 0.18)), birth, at2.p, { segs: 1, center: c, radii, normalBend: 0.3, sway0: sw, sway1: clamp(sw + 0.08) });
    }
  };
  for (const b of frame.stems) stemLeaves(b, 0.08, 0.05);
  for (const b of frame.secs) stemLeaves(b, 0.15, 0.055);

  // Sprays along the branches and over the outer shell; the shell fills in with age to a dense oval.
  for (const b of frame.secs) {
    for (const t of [0.5 + r() * 0.1, 0.85]) {
      const at2 = along(b.pts, t);
      const n = normalAt(sh, at2.p);
      const dir = deflect(at2.dir, 0.3 + r() * 0.35, r() * 6.2832).add(V(0, 0.6, 0)).normalize();
      const len = (0.24 + r() * 0.06) * k;
      const s = sway(at2.p);
      const depth = 1 - clamp(Math.hypot(at2.p.x, at2.p.z) / a);
      const cell = depth > 0.7 ? 6 + Math.floor(r() * 2) : r() < 0.22 ? 4 + Math.floor(r() * 2) : Math.floor(r() * 4);
      sprigCard(leaves, at2.p, dir, n.clone().add(V((r() - 0.5) * 0.8, 0.1, (r() - 0.5) * 0.8)).normalize(), len, len, at.spray(cell), white.clone().multiplyScalar(lightAt(at2.p) * lerp(1, 0.6, depth) * (0.86 + r() * 0.14)), b.birth, at2.p, n, 0.3, s, clamp(s + 0.12), 0.2);
    }
  }
  for (const s of sampleSurface(r, sh, 1050, H * 0.05, 0.03)) {
    const depth = Math.pow(r(), 1.6);
    const tip = s.p.clone().addScaledVector(s.n, -depth * 0.22);
    const ta = perp(s.n), tb = V().crossVectors(s.n, ta);
    const az = r() * 6.2832;
    const tan = ta.multiplyScalar(Math.cos(az)).addScaledVector(tb, Math.sin(az));
    const dir = s.n.clone().multiplyScalar(0.25).addScaledVector(tan, 0.35).add(V(0, 0.75, 0)).normalize();
    const L = (0.24 + r() * 0.07) * k;
    const base = tip.clone().addScaledVector(dir, -L * 0.8);
    if (base.y < 0.03) base.y = 0.03;
    const face = s.n.clone().multiplyScalar(0.9).add(V((r() - 0.5) * 0.4, 0.2, (r() - 0.5) * 0.4)).normalize();
    const b0 = birthAt(tip);
    const birth = r() < 0.7 ? b0 : clamp(Math.max(b0, 0.12) + r() * 0.55, 0, 0.9);
    const sw = sway(base);
    const hi = clamp(tip.y / H);
    const cell = depth > 0.6 ? 6 + Math.floor(r() * 2) : r() < 0.06 * hi ? 8 + Math.floor(r() * 2) : r() < 0.05 + 0.08 * hi ? 10 + Math.floor(r() * 2) : r() < 0.22 ? 4 + Math.floor(r() * 2) : Math.floor(r() * 4);
    sprigCard(leaves, base, dir, face, L, L, at.spray(cell), jitter(white, r, 0.01, 0.04, 0.04).multiplyScalar(lightAt(tip) * lerp(1, 0.66, depth) * (0.86 + r() * 0.14)), birth, base, s.n, 0.3, sw, clamp(sw + 0.12), 0.2);
  }
  // Deep shaded foliage that closes the middle of the older plant.
  for (const s of sampleSurface(r, sh, 280, H * 0.08, 0.05)) {
    const tip = s.p.clone().addScaledVector(s.n, -Sp * (0.14 + r() * 0.16));
    const dir = s.n.clone().multiplyScalar(0.3).add(V((r() - 0.5) * 0.6, 0.8, (r() - 0.5) * 0.6)).normalize();
    const L = (0.24 + r() * 0.06) * k;
    const base = tip.clone().addScaledVector(dir, -L * 0.8);
    if (base.y < 0.03) base.y = 0.03;
    const sw = sway(base);
    sprigCard(leaves, base, dir, s.n.clone().add(V(0, 0.3, 0)).normalize(), L, L, at.spray(6 + Math.floor(r() * 2)), white.clone().multiplyScalar(0.42 + r() * 0.16), clamp(0.25 + r() * 0.45, 0, 0.9), base, s.n, 0.6, sw, clamp(sw + 0.1));
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: fruit.build(),
    leafMap: at.map,
    flowerMap: capsuleTex(),
    bark: { map: simpleBark('hopseed-bush-purpurea-bark', '#6a5a50', '#3e322c', '#8e7e70') },
    look: { leafRoughness: 0.72, translucency: 0.22, bend: 0.1, flutter: 0.014, woodShadows: true },
  };
};
