import * as THREE from 'three';
import { GeoBuilder, V, UP, clamp, col, deflect, jitter, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { archPath, blade, bladeMap, fitClump, STRIP } from '../grasses/shared-grasses';
import { arcPath, stemBark } from './shared-perennials';
import { ribbon, spindle, tepal } from './shared-daylily';

/**
 * Fortnight lily, Dietes vegeta as the trade sells it (D. iridioides; the
 * name is also used for D. grandiflora): an evergreen clump of stiff,
 * upright, iris-like fans of flat, narrow sword leaves, dark dull green, a
 * few dry brown ones low in the clump. Wiry, branched flower stems as tall
 * as the leaves or a little taller carry sheathing green spathes; a few flat
 * white flowers are open at a time, each with three broad outer tepals
 * marked by a yellow-orange blotch, three narrower plain inner tepals, and
 * three pale violet-blue petal-like style branches arching over the center.
 *
 * References and the numbers they give:
 * - NC State Extension Plant Toolbox (Dietes iridioides, fortnight lily):
 *   2-4 ft tall, fan-shaped clumps; flowers about 3 in wide, white with
 *   yellow and blue markings, on branched stalks above the foliage.
 * - Boething Treeland Farms (California grower, Dietes vegeta / Moraea
 *   iridioides): 3-4 ft x 3-4 ft; stiff, narrow, sword-like dull green
 *   leaves; bloom bursts about every 2 weeks, spring to fall.
 * - Royal Botanic Gardens Victoria, Horticultural Flora (D. iridioides):
 *   leaves to 45 cm x 2 cm with no prominent midrib; flowering stems
 *   1-1.2 m, sparsely branched; flowers 3.5-5 cm, each lasting a day;
 *   style branches pale blue-mauve, to 1 cm.
 * - San Marcos Growers (Dietes grandiflora, sold as D. vegeta): leaves to
 *   4 ft, 3-4 ft x 2-3 ft; D. iridioides has pale violet style arms and
 *   unmarked inner tepals.
 * Targets here (a Modesto bed, 3 years): leaves 27-35 in, about 0.75 in
 * wide, the foliage about 31 in high; stems to 3.3 ft; flowers 2.75 in;
 * clump 3.3 ft tall in flower and 3 ft across. A
 * 5 gal at install: about 20 in tall, a dozen fans, one or two stems.
 */

type UV = [number, number, number, number];
const CELL = (i: number): UV => [i / 4 + 0.004, 0.5, (i + 1) / 4 - 0.004, 1];
const BUD_UV: UV = [0.004, 0.004, 0.246, 0.496];
const GREEN_UV: UV = [0.56, 0.06, 0.69, 0.19];

function outerEnv(t: number) {
  return t < 0.62 ? lerp(0.24, 1, Math.sin((t / 0.62) * Math.PI * 0.5)) : Math.max(0.16, Math.pow(Math.max(0, Math.cos(clamp((t - 0.62) / 0.38) * Math.PI * 0.5)), 0.45));
}
function innerEnv(t: number) {
  return t < 0.58 ? lerp(0.16, 1, Math.sin((t / 0.58) * Math.PI * 0.5)) : Math.max(0.12, Math.pow(Math.max(0, Math.cos(clamp((t - 0.58) / 0.42) * Math.PI * 0.5)), 0.55));
}
function styleEnv(t: number) {
  return t < 0.25 ? lerp(0.55, 1, t / 0.25) : 1;
}

function paintShape(g: CanvasRenderingContext2D, x0: number, env: (t: number) => number, frac = 0.47) {
  const cw = 256, cx = x0 + cw / 2, base = 510, top = 4, H = base - top;
  g.beginPath();
  g.moveTo(cx, base);
  for (let i = 0; i <= 50; i++) g.lineTo(cx - env(i / 50) * cw * frac, base - (i / 50) * H);
  for (let i = 50; i >= 0; i--) g.lineTo(cx + env(i / 50) * cw * frac, base - (i / 50) * H);
  g.closePath();
}

function flowerMap(): THREE.Texture {
  return leafTexture('dietes-flowers', 1024, 1024, (g) => {
    const r = rng('dietes-tex');
    const base = 510, H = 506;
    // Outer tepals (two variants) and inner tepals: white with faint grey-lilac veins.
    const cells: [number, (t: number) => number, boolean][] = [[0, outerEnv, true], [1, outerEnv, true], [2, innerEnv, false]];
    for (const [cell, env, outer] of cells) {
      const x0 = cell * 256, cx = x0 + 128;
      paintShape(g, x0, env);
      const wg = g.createLinearGradient(0, base, 0, 0);
      wg.addColorStop(0, outer ? '#d8d0b0' : '#e8e4d8');
      wg.addColorStop(0.12, '#f4f3ee');
      wg.addColorStop(1, '#f7f7f4');
      g.fillStyle = wg;
      g.fill();
      g.save();
      paintShape(g, x0, env);
      g.clip();
      g.lineCap = 'round';
      for (let k = -8; k <= 8; k++) {
        g.strokeStyle = `rgba(150,150,175,${0.1 + r() * 0.08})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx + k, base);
        g.quadraticCurveTo(cx + k * 9, base - H * 0.5, cx + k * 12, base - H * 0.95);
        g.stroke();
      }
      // Brown speckled claw.
      for (let i = 0; i < (outer ? 70 : 30); i++) {
        const t = r() * (outer ? 0.2 : 0.14);
        const w = env(t) * 120 * (r() - 0.5) * 1.6;
        g.fillStyle = `rgba(${110 + r() * 40},${70 + r() * 30},${40 + r() * 20},${0.6 + r() * 0.3})`;
        g.beginPath();
        g.ellipse(cx + w, base - t * H, 2 + r() * 2.5, 2.5 + r() * 3.5, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (outer) {
        // The yellow-orange nectar guide: a hairy blotch a quarter of the way up.
        const by = base - H * 0.27, bw = 52, bh = 62;
        const rg = g.createRadialGradient(cx, by, 4, cx, by, bh);
        rg.addColorStop(0, '#f09a18');
        rg.addColorStop(0.55, '#f2b628');
        rg.addColorStop(1, 'rgba(244,200,60,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.ellipse(cx, by, bw, bh, 0, 0, Math.PI * 2);
        g.fill();
        for (let i = 0; i < 140; i++) {
          const a = r() * Math.PI * 2, rr = Math.sqrt(r());
          const x = cx + Math.cos(a) * bw * 0.8 * rr, y = by + Math.sin(a) * bh * 0.8 * rr;
          g.strokeStyle = r() < 0.75 ? `rgba(240,${140 + r() * 50},20,0.8)` : 'rgba(150,80,30,0.7)';
          g.lineWidth = 1.5 + r() * 1.5;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8);
          g.stroke();
        }
        // Brown dots fringing the blotch toward the claw.
        for (let i = 0; i < 26; i++) {
          g.fillStyle = 'rgba(120,70,36,0.75)';
          g.beginPath();
          g.arc(cx + (r() - 0.5) * 70, by + bh * (0.55 + r() * 0.5), 2 + r() * 2, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
    // Style branch: pale violet-blue, a darker center line, a bifid fringed crest at the tip.
    {
      const x0 = 768, cx = x0 + 128;
      paintShape(g, x0, styleEnv, 0.44);
      const sg = g.createLinearGradient(x0, 0, x0 + 256, 0);
      sg.addColorStop(0, '#c9bce8');
      sg.addColorStop(0.5, '#a996dc');
      sg.addColorStop(1, '#c9bce8');
      g.fillStyle = sg;
      g.fill();
      g.strokeStyle = 'rgba(120,96,190,0.6)';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx, base - H * 0.85);
      g.stroke();
      // Notch the tip into two lobes.
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.moveTo(cx - 22, 0);
      g.lineTo(cx, H * 0.14);
      g.lineTo(cx + 22, 0);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    // Bud: slender, greenish white with purple-brown streaks.
    const bg = g.createLinearGradient(0, 1024, 0, 512);
    bg.addColorStop(0, '#7a8a52');
    bg.addColorStop(0.35, '#c8ccb0');
    bg.addColorStop(1, '#ecece2');
    g.fillStyle = bg;
    g.fillRect(0, 512, 256, 512);
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = 'rgba(110,80,110,0.35)';
      g.lineWidth = 3;
      const x = 20 + k * 42;
      g.beginPath();
      g.moveTo(x, 1024);
      g.lineTo(x + 8, 512);
      g.stroke();
    }
    g.fillStyle = '#5f7a3c';
    g.fillRect(512, 768, 256, 256);
  });
}

function leafMap(): THREE.Texture {
  return bladeMap('dietes', { fill: '#f2f4ee', rib: 0.04, veins: 0.09 });
}

/** One open flower centered at `c`, facing `n`. */
function flower(F: GeoBuilder, c: THREE.Vector3, n0: THREE.Vector3, birth: number, anchor: THREE.Vector3, sway: number, r: () => number) {
  const n = n0.clone().normalize();
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const D = 0.07 * (0.92 + r() * 0.16);
  const spin = r() * Math.PI * 2;
  const white = col('#ffffff');
  for (let k = 0; k < 3; k++) {
    const az = spin + (k * Math.PI * 2) / 3 + (r() - 0.5) * 0.12;
    const len = D * 0.5;
    tepal(F, c, n, a, b, az, {
      len, wid: len * 0.64, e0: 0.5, e1: -0.28 - r() * 0.15, rb: D * 0.03, depth: D * 0.02, cup: 0.06, ruffle: 0.02, twist: (r() - 0.5) * 0.3,
      env: outerEnv, uv: CELL(k % 2), color: white.clone().multiplyScalar(0.9 + r() * 0.06), rows: 4, cols: 2,
    }, birth, anchor, sway, r);
    // Inner tepal between the outer ones, a little smaller and more upright.
    const azi = az + Math.PI / 3;
    tepal(F, c, n, a, b, azi, {
      len: len * 0.86, wid: len * 0.5, e0: 0.65, e1: -0.05 - r() * 0.1, rb: D * 0.025, depth: D * 0.015, cup: 0.05, ruffle: 0.015, twist: (r() - 0.5) * 0.3,
      env: innerEnv, uv: CELL(2), color: white.clone().multiplyScalar(0.92 + r() * 0.05), rows: 3, cols: 2,
    }, birth, anchor, sway, r);
    // Petal-like style branch arching out over the outer tepal.
    tepal(F, c, n, a, b, az + (r() - 0.5) * 0.1, {
      len: D * 0.25, wid: D * 0.085, e0: 0.75, e1: 0.25, rb: D * 0.012, depth: -D * 0.035, cup: 0.18, ruffle: 0, twist: 0,
      env: styleEnv, uv: CELL(3), color: white.clone(), rows: 3, cols: 2,
    }, birth, anchor, sway, r);
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), F = new GeoBuilder();
  const greens = ['#30563a', '#345b38', '#2d5134', '#3a603c'].map((h) => col(h));
  const cBase = col('#7c8a52');
  const dry = col('#8a7a5a'), dryDark = col('#6e6248');
  const FANS = 44, INSTALL = 15, crownR = 0.33;
  const crowns: { p: THREE.Vector3; birth: number; az: number }[] = [];

  /* Fans of flat sword leaves, edge-on to the fan, stiffly upright. */
  for (let f = 0; f < FANS; f++) {
    const u = (f + 0.5) / FANS;
    const a0 = f * 2.39996 + (r() - 0.5) * 0.4, rr = crownR * Math.sqrt(u);
    const crown = V(Math.cos(a0) * rr, f < INSTALL ? -0.02 : -0.04, Math.sin(a0) * rr);
    const fanAz = a0 + Math.PI / 2 + (r() - 0.5) * 1.4;
    const lean = 0.02 + u * 0.16 + r() * 0.05;
    const nl = 6 + Math.floor(r() * 4);
    const fanBirth = f < INSTALL ? 0 : clamp(0.1 + ((f - INSTALL) / (FANS - INSTALL)) * 0.65 + (r() - 0.5) * 0.12, 0.08, 0.82);
    crowns.push({ p: crown, birth: fanBirth, az: a0 });
    const ranks = Math.ceil(nl / 2);
    for (let j = 0; j < nl; j++) {
      const rank = Math.floor(j / 2), sgn = j % 2 ? 1 : -1;
      const k = rank / Math.max(1, ranks - 1);
      const inPlane = sgn * (0.02 + k * 0.26 + r() * 0.05);
      const dx = Math.cos(fanAz) * Math.sin(inPlane) + Math.cos(a0) * Math.sin(lean);
      const dz = Math.sin(fanAz) * Math.sin(inPlane) + Math.sin(a0) * Math.sin(lean);
      const tilt = clamp(Math.hypot(dx, dz), 0.02, 1.2);
      const az = Math.atan2(dz, dx);
      const len = lerp(0.7, 0.9, r()) * (1 - 0.22 * k) * (rank === 0 ? 0.78 : 1);
      // A few leaves are kinked and flop over across their flat; the rest arch a little edgewise, like a saber.
      const flop = k > 0.4 && r() < 0.1;
      const base = crown.clone().add(V(Math.cos(fanAz) * sgn * rank * 0.006, 0, Math.sin(fanAz) * sgn * rank * 0.006));
      const path = archPath(base, {
        az, tilt, bend: flop ? 0.9 + r() * 0.7 : 0.08 + r() * 0.25 + k * 0.2, bendPow: flop ? 3.2 : 2, len, segs: 7,
        azCurl: (r() - 0.5) * 0.2, roll: flop ? (r() - 0.5) * 0.4 : Math.PI / 2 + (r() - 0.5) * 0.5, twist: (r() - 0.5) * 0.5, floor: 0.01,
      });
      const old = k > 0.6 && r() < 0.1;
      const mid = old ? dry.clone().lerp(dryDark, r()) : jitter(greens[Math.floor(r() * greens.length)], r, 0.01, 0.04, 0.04).multiplyScalar(lerp(1, 0.86, k));
      blade(leaves, path, {
        wid: lerp(0.017, 0.022, r()), cols: 2, fold: 0.1, baseW: 0.8, widest: 0.3, taper: 3.2,
        cBase: cBase.clone().lerp(mid, 0.45), cMid: mid, cTip: old ? mid : mid.clone().lerp(col('#46703c'), 0.3),
        cEnd: !old && r() < 0.25 ? col('#a08a5c') : undefined, ao: 0.55, uv: STRIP[r() < 0.5 ? 0 : 1],
        birth: fanBirth, sway: 0.45, nUp: 0.1,
      });
    }
  }

  /* Wiry branched flower stems with green spathes, buds and a few open flowers. */
  const swayAt = (y: number) => clamp(0.08 + (y / H) * 0.8, 0, 0.9);
  const bark = stemBark();
  const stemCol = col('#5d7238'), spatheCol = col('#e4ecd2'), spatheTip = col('#f0e2b8');
  const NS = 11, INSTALL_S = 2;
  for (let s = 0; s < NS; s++) {
    const cr = crowns[(s * 7 + 2) % FANS];
    const birth = s < INSTALL_S ? 0 : clamp(Math.max(cr.birth, 0.15 + (s / NS) * 0.6), 0.1, 0.85);
    const az = cr.az + (r() - 0.5) * 0.6;
    const L = lerp(0.8, 0.98, r());
    const lean = 0.08 + r() * 0.18 + (Math.hypot(cr.p.x, cr.p.z) / crownR) * 0.15;
    const base = cr.p.clone().setY(-0.01);
    // A stem that appears later collapses, with its spathes, buds and flowers, to a point below the ground until then.
    const root = V(base.x, -0.06, base.z);
    const anc = (p: THREE.Vector3) => (birth > 0 ? root : p);
    const pts = arcPath(base, az, lean, lean + 0.12, L, 8, r, 0.06);
    tube(wood, pts, 0.0024, 0.0016, 5, stemCol, birth, anc(base), (i) => swayAt(pts[i].y), 1);
    // Green sheathing spathe at a node, its tip papery: two short folded ribbons.
    const spathe = (p: THREE.Vector3, d: THREE.Vector3, len: number, w: number, anchor: THREE.Vector3, sw: number) => {
      const face = perp(d);
      const pts2 = [p, p.clone().addScaledVector(d, len * 0.55), p.clone().addScaledVector(d, len).addScaledVector(face, len * 0.12)];
      ribbon(F, pts2, w, face, GREEN_UV, spatheCol, birth, anchor, sw);
      ribbon(F, pts2.map((q, i) => q.clone().addScaledVector(face, w * 0.25 * i)), w * 0.7, face.clone().applyAxisAngle(d, 1.2), GREEN_UV, spatheTip, birth, anchor, sw);
    };
    const dirAt = (i: number) => pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    // Nodes: a spathe at each, a short side branch at some.
    const tips: { p: THREE.Vector3; d: THREE.Vector3 }[] = [{ p: pts[pts.length - 1], d: dirAt(pts.length - 1) }];
    for (const ni of [5, 6]) {
      if (r() < 0.65) {
        const bd = deflect(dirAt(ni), 0.35 + r() * 0.3, r() * 6.28);
        const bl = 0.06 + r() * 0.08;
        const bp = [pts[ni], pts[ni].clone().addScaledVector(bd, bl * 0.5), pts[ni].clone().addScaledVector(bd, bl).addScaledVector(UP, bl * 0.15)];
        tube(wood, bp, 0.0017, 0.0013, 4, stemCol, birth, anc(pts[ni]), (i) => swayAt(bp[i].y), 1);
        tips.push({ p: bp[2], d: bp[2].clone().sub(bp[1]).normalize() });
      }
      // Spathe hugging the node.
      const sd = deflect(dirAt(ni), 0.15, r() * 6.28);
      spathe(pts[ni], sd, 0.045, 0.008, anc(pts[ni]), swayAt(pts[ni].y));
    }
    tips.forEach((tp, ti) => {
      const sw = swayAt(tp.p.y);
      // Terminal spathe, then buds and maybe the day's flower from it.
      const sd = tp.d.clone().add(V(0, 0.3, 0)).normalize();
      spathe(tp.p, sd, 0.05, 0.009, anc(tp.p), sw);
      const nb = 1 + Math.floor(r() * 2);
      for (let q = 0; q < nb; q++) {
        const bd = deflect(sd, 0.15 + r() * 0.35, r() * 6.28);
        const bl = 0.028 + r() * 0.012;
        const p0 = tp.p.clone().addScaledVector(sd, 0.02);
        spindle(F, [p0, p0.clone().addScaledVector(bd, bl * 0.5), p0.clone().addScaledVector(bd, bl)], (t) => 0.004 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) + 0.0006, 4, BUD_UV, col('#ffffff'), clamp(birth + 0.02), anc(tp.p), () => sw);
      }
      if (r() < (ti === 0 ? 0.75 : 0.45)) {
        // Short pedicel up out of the spathe, the flower facing the sky and a little outward.
        const fd = V(Math.cos(az), 0, Math.sin(az)).multiplyScalar(0.35 + r() * 0.3).add(V(0, 1, 0)).normalize();
        const pc = tp.p.clone().addScaledVector(sd, 0.03).addScaledVector(UP, 0.012);
        spindle(F, [tp.p.clone().addScaledVector(sd, 0.01), pc], () => 0.0013, 3, GREEN_UV, col('#ffffff'), clamp(birth + 0.02), anc(tp.p), () => sw);
        flower(F, pc, fd, clamp(birth + 0.02), anc(tp.p), sw, r);
      }
    });
  }

  fitClump([leaves, wood, F], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: F.build(),
    leafMap: leafMap(),
    flowerMap: flowerMap(),
    bark: { map: bark },
    look: { leafRoughness: 0.66, translucency: 0.25, bend: 0.05, flutter: 0.003, alphaTest: 0.45 },
  };
};
