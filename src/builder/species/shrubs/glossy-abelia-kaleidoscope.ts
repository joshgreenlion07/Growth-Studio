import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintLeaf, paintSprig, sampleSurface, shellSprigs, simpleBark, swayFn, tipOf, twigBirthLookup,
  type LeafStyle, type Shape, type SprigStyle, type UV,
} from './shared-shrubs-a';
import { cellClip, faceCard, hardenAlpha, tone } from './shared-shrubs-b';

/**
 * Glossy abelia 'Kaleidoscope', Abelia x grandiflora 'Kaleidoscope'
 * (PP16988), a sport of 'Little Richard'.
 *
 * A compact, rounded, dense mound, a little wider than tall, of many thin,
 * arching red stems; a few longer shoots arch out of the outline. Small
 * glossy leaves, ovate with a pointed tip and finely toothed edge, about
 * 3/4 to 1 in, in opposite pairs (sometimes threes) along the shoots, each
 * with a broad, irregular bright yellow margin around a green center. The
 * margins shift with the season: bright yellow and light green in spring,
 * golden and deeper green in summer, and orange to coral red as the weather
 * cools, so in fall and winter one plant shows yellow, orange, red and green
 * together, which is what the name refers to. Small white, faintly blushed,
 * funnel-shaped flowers (about 1/2 in long) sit in small clusters at the
 * shoot tips from summer into fall, over rosy calyces that stay on after the
 * petals drop. Modeled in its cool-season colors, with a light show of
 * flowers and calyces.
 *
 * References:
 *  - Monrovia, Kaleidoscope Abelia: reaches 2 to 3 ft tall, 3 to 4 ft wide;
 *    moderate growth; compact, low; medium green leaves with bright golden
 *    yellow variegation on brilliant red stems; white flowers summer to early
 *    fall. https://www.monrovia.com/kaleidoscope-abelia.html
 *  - Boething Treeland (California wholesale): 2 to 3 ft x 3 to 4 ft;
 *    mounding; foliage shifts from yellow-edged in spring to red and orange in
 *    fall; fragrant white flowers; grown in #1 and #5.
 *    https://boethingtreeland.com/plants/abelia-grandiflora-kaleidoscope-pp-16988
 *  - NC State Extension, Abelia x grandiflora: leaves opposite or in threes,
 *    ovate, glossy, serrate, up to 1.25 in; flowers tubular-funnel shaped,
 *    about 1/2 in long, white to pink, in terminal clusters, late spring to
 *    fall; reddish calyces persist into winter; thin reddish stems; rounded,
 *    dense, arching. 'Kaleidoscope' listed for its wide range of foliage
 *    color. https://plants.ces.ncsu.edu/plants/abelia-x-grandiflora/
 * Catalog: 5 gal at 0.45 x 0.5 m, mature 0.9 m tall x 1.2 m wide (3 x 4 ft,
 * the top of Monrovia's range for a Central Valley plant) in about 4 years.
 * Leaves are modeled 0.9 to 1.3 in at maturity (a touch long) so the
 * scaled-down 5 gal still shows half-inch leaves.
 */

const GOLD: LeafStyle = {
  p: 0.72, q: 0.9, aspect: 0.6,
  base: '#2f5c1a', dark: '#1d4012', light: '#6a9a30',
  margin: '#eaa806', marginIn: 0.68, center2: '#4f8226',
  midrib: 'rgba(214,214,120,0.55)', midribW: 0.02, gloss: 0.2, wavy: 0.025,
};
const ORANGE: LeafStyle = { ...GOLD, base: '#335a1c', dark: '#223c14', margin: '#ea8c1c', center2: '#527a26' };
const RED: LeafStyle = { ...GOLD, base: '#3e5220', dark: '#283614', light: '#7a7a30', margin: '#d4502a', center2: '#6a6a28', marginIn: 0.55 };
const FRESH: LeafStyle = { ...GOLD, base: '#6a9a30', dark: '#4a7a24', light: '#a8c848', margin: '#f6dc4a', center2: '#8ab83e', marginIn: 0.45 };
const SPRIG: SprigStyle = { twig: '#8e2c22', twigW: 0.015, leafLen: 0.24, arrangement: 'opposite', nodes: 5, angle: 0.95, height: 0.78, petiole: 0.008, side: 1 };

function abeliaAtlas() {
  // Sprigs: 0-3 gold, 4-6 orange, 7 coral red, 8-9 shaded inner, 10-11 young tips. Then 8 single leaves.
  const styles = [GOLD, GOLD, GOLD, GOLD, ORANGE, ORANGE, ORANGE, RED, GOLD, ORANGE, FRESH, FRESH];
  const cells = [];
  for (let i = 0; i < 12; i++) {
    cells.push({
      x: (i % 4) * 256, y: Math.floor(i / 4) * 256, w: 256, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) =>
        paintSprig(g, r, w, styles[i], { ...SPRIG, nodes: 4 + Math.floor(r() * 3) }, i >= 10 ? 0.8 : 0.04 + r() * 0.12, i === 8 || i === 9 ? -0.5 : 0),
    });
  }
  const single = [GOLD, GOLD, GOLD, ORANGE, ORANGE, RED, RED, FRESH];
  for (let i = 0; i < 8; i++) {
    cells.push({
      x: i * 128, y: 768, w: 128, h: 256,
      draw: (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) =>
        paintLeaf(g, r, w / 2, h - 3, h - 12, -Math.PI / 2, { ...single[i], aspect: 0.5 + r() * 0.05 }, { fresh: i === 7 ? 0.6 : r() * 0.15, shade: (r() - 0.5) * 0.2 }),
    });
  }
  return atlas('glossy-abelia-kaleidoscope-atlas', 1024, 1024, cells);
}

/** Flowers: 0 a flower seen face-on (five rounded lobes, a faint blush, a yellowish throat), 1 one seen from the side
    (a slim funnel from its rosy calyx, base at the bottom), 2 the five-pointed calyx left after the petals drop. */
function flowerTex(white: string, blush: string): THREE.Texture {
  return leafTexture('glossy-abelia-kaleidoscope-flowers', 384, 128, (g) => {
    const r = rng('glossy-abelia-kaleidoscope-flower-tex');
    const star = (x: number, y: number, R: number, w: number) => {
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * 6.2832 + (r() - 0.5) * 0.15;
        g.fillStyle = tone('#9a3a32', '#c8645a', r());
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.ellipse(R * 0.5, 0, R * 0.5, w, 0, 0, 6.3);
        g.fill();
        g.restore();
      }
    };
    // Face view.
    cellClip(g, 0, 0, 128, 128);
    {
      const x = 64, y = 64, R = 58;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * 6.2832;
        const grad = g.createRadialGradient(x, y, R * 0.1, x, y, R);
        grad.addColorStop(0, tone(white, blush, 0.5));
        grad.addColorStop(0.5, white);
        grad.addColorStop(1, tone(white, k % 2 ? blush : '#ffffff', 0.25));
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5, R * 0.5, R * 0.4, a, 0, 6.3);
        g.fill();
      }
      g.fillStyle = 'rgba(210,180,90,0.75)';
      g.beginPath();
      g.arc(x, y, R * 0.24, 0, 6.3);
      g.fill();
      g.fillStyle = 'rgba(120,90,40,0.8)';
      g.beginPath();
      g.arc(x, y, R * 0.1, 0, 6.3);
      g.fill();
    }
    g.restore();
    // Side view: calyx at the bottom, a slim funnel flaring to the lobes at the top.
    cellClip(g, 1, 0, 128, 128);
    {
      const grad = g.createLinearGradient(0, 124, 0, 8);
      grad.addColorStop(0, tone(white, blush, 0.7));
      grad.addColorStop(0.45, white);
      grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(56, 112);
      g.quadraticCurveTo(52, 50, 30, 18);
      g.quadraticCurveTo(64, 4, 98, 18);
      g.quadraticCurveTo(76, 50, 72, 112);
      g.closePath();
      g.fill();
      g.fillStyle = tone(white, blush, 0.2);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.ellipse(36 + k * 28, 16, 17, 10, 0, 0, 6.3);
        g.fill();
      }
      star(64, 116, 22, 4);
    }
    g.restore();
    // The rosy calyx alone, face-on.
    cellClip(g, 2, 0, 128, 128);
    star(64, 64, 52, 9);
    g.fillStyle = '#7a2a24';
    g.beginPath();
    g.arc(64, 64, 8, 0, 6.3);
    g.fill();
    g.restore();
    hardenAlpha(g, 384, 128);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = abeliaAtlas();
  const e3 = 1.5 / 384;
  const flUV = (i: number): UV => [i / 3 + e3, 0.02, (i + 1) / 3 - e3, 0.98];
  const k = H / 0.9;

  // A rounded mound, wider than tall, full to the ground.
  const a = (Sp / 2) * 0.95, top = H * 0.96, sPeak = 0.38, c = V(0, H * 0.4, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.74 + 0.26 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.pow(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 2.2)), 0.5);
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.1 * (1 + lumps(p, c, 3.1)) + 0.05 * lumps(p, c, 8.4));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 12, stemBaseR: 0.08, stemR: 0.011, stemReach: 0.7, arch: 0.32, stemYMin: 0.3, secs: 90, twigs: 440, twigInset: 0.05, wobble: 0.12, early: 0.78, twigMaxR: 0.0028, attachSpread: 1.5 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#ffffff', 0.62), red = col('#b04a3a');
  frameWood(wood, frame, { r, sway, twigFrac: 0.45, color: (b) => (b.level === 0 ? stemCol : b.level === 1 ? stemCol.clone().lerp(red, 0.6) : red), uvScale: 3 });

  const white = new THREE.Color(1, 1, 1);
  const birth = twigBirthLookup(frame.twigs);
  const lightAt = (p: THREE.Vector3) => lerp(0.8, 1, clamp(p.y / (H * 0.6)));
  // Cooler colors toward the top and outside, where the cold reaches first.
  const outerCell = (p: THREE.Vector3) => {
    const hi = clamp(p.y / H);
    const x = r();
    return x < 0.05 + 0.08 * hi ? 7 : x < 0.22 + 0.12 * hi ? 4 + Math.floor(r() * 3) : x < 0.3 + 0.12 * hi ? 10 + Math.floor(r() * 2) : Math.floor(r() * 4);
  };
  shellSprigs(leaves, r, sh, {
    n: 2600, len: [0.105, 0.135].map((v) => v * k) as [number, number], inset: 0.1 * k, tangent: 0.5, up: 0.35, nb: 0.3, sway, birth, early: 0.74,
    cell: (depth, p) => at.uv[depth > 0.65 ? 8 + Math.floor(r() * 2) : outerCell(p)],
    color: (depth, p) => white.clone().multiplyScalar(lerp(0.94, 0.6, depth) * lightAt(p) * (0.86 + r() * 0.14)),
  });
  shellSprigs(leaves, r, sh, {
    n: 420, len: [0.12, 0.15].map((v) => v * k) as [number, number], inset: Sp * 0.24, tangent: 0.5, up: 0.35, nb: 0.6, sway, early: 1, birth: () => 0,
    cell: () => at.uv[8 + Math.floor(r() * 2)],
    color: (depth) => white.clone().multiplyScalar(lerp(0.72, 0.45, depth)),
  });

  // Shoot tips: two opposite pairs of single leaves; some end in a flower cluster or its rosy calyces.
  const leafAt = (cellBase: number) => at.uv[12 + cellBase];
  const tipCell = (p: THREE.Vector3) => {
    const x = r(), hi = clamp(p.y / H);
    return x < 0.08 ? 7 : x < 0.18 + 0.12 * hi ? 5 + Math.floor(r() * 2) : x < 0.4 ? 3 + Math.floor(r() * 2) : Math.floor(r() * 3);
  };
  const pair = (q: THREE.Vector3, axis: THREE.Vector3, n: THREE.Vector3, az: number, len: number, b0: number, s: number, lit: number, cell: number) => {
    for (const sd of [0, Math.PI]) {
      const d = deflect(axis, 0.95 + (r() - 0.5) * 0.3, az + sd).add(V(0, 0.08, 0)).normalize();
      const face = n.clone().multiplyScalar(0.5).add(V(0, 0.8, 0)).normalize();
      leafQuad(leaves, q, d, face, len, len * 0.5, leafAt(cell), white.clone().multiplyScalar(lit), b0, q, { segs: 1, center: c, radii: V(a, H * 0.6, a), normalBend: 0.35, sway0: s, sway1: clamp(s + 0.05) });
    }
  };
  // A small terminal cluster: a few flowers turned outward, face-on or side-on, or (after bloom) their rosy calyces.
  const flowerAt = (p: THREE.Vector3, axis: THREE.Vector3, b0: number, s: number, calyx: boolean) => {
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const d = deflect(axis.clone().lerp(UP, 0.3).normalize(), 0.5 + r() * 0.5, r() * 6.28);
      const q = p.clone().addScaledVector(d, 0.006 * k);
      const sz = (0.013 + r() * 0.003) * k;
      if (calyx) faceCard(flowers, q, d, sz * 0.8, r() * 6.28, flUV(2), col('#ffffff', 0.9), b0, p, s);
      else if (r() < 0.55) faceCard(flowers, q.clone().addScaledVector(d, sz * 0.8), d, sz, r() * 6.28, flUV(0), col('#ffffff', 0.94), b0, p, s);
      else {
        const f = perp(d);
        leafQuad(flowers, q, d, f, sz * 1.5, sz * 1.5, flUV(1), col('#ffffff', 0.92), b0, p, { sway0: s, sway1: s });
      }
    }
  };
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.55).addScaledVector(dir, 0.45).add(V(0, 0.35, 0)).normalize();
    const tip = p.clone().addScaledVector(axis, 0.03 * k);
    const b0 = clamp(tw.birth + r() * 0.06, 0, 0.9);
    const s = sway(p);
    const lit = lightAt(p) * (0.88 + r() * 0.12);
    tube(wood, [p, tip], 0.0016, 0.001, 3, red, b0, p, () => s, 2);
    const az = r() * 6.28;
    const cell = tipCell(p);
    pair(p.clone().lerp(tip, 0.4), axis, n, az, (0.028 + r() * 0.004) * k, b0, s, lit, cell);
    pair(tip, axis, n, az + Math.PI / 2, (0.022 + r() * 0.004) * k, b0, s, lit, r() < 0.25 ? 7 : cell);
    if (n.y > -0.2 && r() < 0.1) flowerAt(tip, axis, b0, s, r() < 0.35);
  }

  // Long shoots arching out of the mound, leafy in opposite pairs, tipped with flowers or bright young leaves.
  for (const s0 of sampleSurface(r, sh, 46, H * 0.35, 0.2)) {
    const p0 = s0.p.clone().addScaledVector(s0.n, -0.06 * k);
    const out = V(s0.n.x, 0, s0.n.z);
    if (out.lengthSq() < 1e-4) out.set(r() - 0.5, 0, r() - 0.5);
    out.normalize();
    const L = (0.16 + r() * 0.16) * k;
    const p1 = p0.clone().addScaledVector(s0.n, L * 0.5).add(V(0, L * 0.3, 0));
    const p2 = p1.clone().addScaledVector(out, L * 0.45).add(V(0, -L * (0.2 + r() * 0.2), 0));
    const N = 6;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      pts.push(V().addScaledVector(p0, u * u).addScaledVector(p1, 2 * u * t).addScaledVector(p2, t * t));
    }
    const b0 = clamp(birth(p0) + r() * 0.3, 0, 0.85);
    const sw = (i: number) => clamp(sway(pts[Math.min(N, i)]) + i * 0.03);
    tube(wood, pts, 0.0024, 0.0012, 3, red, b0, p0, sw, 2);
    let az = r() * 6.28;
    for (let i = 2; i <= N; i++) {
      const q = pts[i];
      const d = pts[Math.min(N, i + 1)].clone().sub(pts[i - 1]).normalize();
      az += Math.PI / 2;
      pair(q, d, s0.n, az, (0.026 + r() * 0.005) * k, clamp(b0 + i * 0.01), sw(i), lightAt(q) * (0.9 + r() * 0.1), tipCell(q));
    }
    if (r() < 0.45) flowerAt(pts[N], pts[N].clone().sub(pts[N - 1]).normalize(), b0, sw(N), r() < 0.3);
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(spec.flower ?? '#f4f0ea', spec.flower2 ?? '#e9d4dc'),
    bark: { map: simpleBark('glossy-abelia-kaleidoscope-bark', '#8a7466', '#5a463c', '#b09a88') },
    look: { leafRoughness: 0.6, translucency: 0.22, bend: 0.05, flutter: 0.01 },
  };
};
