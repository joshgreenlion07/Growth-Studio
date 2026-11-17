import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, jitter, leafPath, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, fitMat, inCell, rect, type UV } from './shared-groundcovers';
import { faceCard, hardenAlpha, stemBark, tone } from '../shrubs/shared-shrubs-b';

/**
 * Trailing rosemary, Rosmarinus officinalis (Salvia rosmarinus)
 * 'Pointe du Raz': a low, mounding, prostrate rosemary.
 *
 * Woody gray-brown stems rise a little from the crown, arch outward and run
 * down over the ground, branching as they go; their tips turn up. Every shoot
 * is a stiff bottlebrush of needle-like leaves about 1 in long, crowded in
 * opposite pairs: glossy dark green above, gray-white felted beneath with the
 * edges rolled under, so the plant reads dark green with a gray cast. Small
 * pale lilac-blue two-lipped flowers sit in clusters in the leaf axils along
 * the upper shoots, scattered rather than massed. Compared with coast
 * rosemary (westringia, a round gray-green ball) this is low, wide, darker,
 * coarser and made of visible arching, trailing branches.
 *
 * References and the numbers they give:
 * - RHS (rhs.org.uk/plants/181619): "vigorous, spreading evergreen shrub",
 *   trailing; ultimate height 0.1 to 0.5 m, spread 0.5 to 1 m, 2 to 5 years
 *   (UK); linear dark green leaves with pale felted undersides; small blue
 *   flowers in the leaf axils in late spring and early summer.
 * - French growers (Promesse de Fleurs and others, via search): 45 to 50 cm
 *   tall and up to 1.5 m wide; lilac-blue flowers veined dark blue, in spring,
 *   repeating in summer; darker blue than 'Prostratus'.
 * - San Marcos Growers, rosemary notes (smgrowers.com/info/rosemary.asp):
 *   California prostrate rosemaries ('Irene', 'Lockwood de Forest') reach
 *   about 2 ft by 6 to 8 ft; rosemary leaves are dark green above, grayish
 *   white beneath. (Pointe du Raz is the more compact selection.)
 * Size used (catalog): 0.5 m tall x 1.5 m wide in 3 years (Central Valley
 * heat and long season put it at the top of the European range).
 */

/* ---------------------------- leaf atlas ---------------------------- */

const SHOOT = (i: number): UV => rect(i * 256 + 1, 0, 254, 512, 1024, 1024);
const BRANCH = (i: number): UV => rect(i * 512, 512, 512, 512, 1024, 1024);

/** One needle leaf from (x, y) heading `ang` (0 = up), seen from above (dark, glossy) or below (gray felt). */
function needle(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, wid: number, under: boolean, shade: number) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 2 + ang);
  // A gentle curve: the leaf is drawn in two straight halves.
  const bend = (r() - 0.5) * 0.25;
  const grad = g.createLinearGradient(0, 0, len, 0);
  if (under) {
    grad.addColorStop(0, tone('#727c74', '#858e85', shade));
    grad.addColorStop(1, tone('#8c948b', '#9fa69c', shade));
  } else {
    grad.addColorStop(0, tone('#2a3c1e', '#364b26', shade));
    grad.addColorStop(0.6, tone('#33491f', '#43592c', shade));
    grad.addColorStop(1, tone('#3d5426', '#526a35', shade));
  }
  g.fillStyle = grad;
  g.save();
  g.rotate(bend * 0.5);
  leafPath(g, len, wid, 0.45, 0.55);
  g.fill();
  if (under) {
    // The green midrib down the felted underside.
    g.strokeStyle = 'rgba(52,78,46,0.75)';
    g.lineWidth = Math.max(1.2, wid * 0.22);
    g.beginPath();
    g.moveTo(len * 0.04, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
  } else {
    // Sunken midrib, a glossy highlight beside it and the pale rolled edge.
    g.strokeStyle = 'rgba(14,28,14,0.6)';
    g.lineWidth = Math.max(1, wid * 0.14);
    g.beginPath();
    g.moveTo(len * 0.05, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.strokeStyle = 'rgba(200,215,205,0.12)';
    g.lineWidth = Math.max(1, wid * 0.16);
    g.beginPath();
    g.moveTo(len * 0.1, -wid * 0.18);
    g.lineTo(len * 0.85, -wid * 0.12);
    g.stroke();
    if (r() < 0.6) {
      g.strokeStyle = 'rgba(150,160,152,0.5)';
      g.lineWidth = Math.max(1, wid * 0.12);
      g.beginPath();
      g.moveTo(len * 0.08, wid * 0.42);
      g.lineTo(len * 0.86, wid * 0.22);
      g.stroke();
    }
  }
  g.restore();
  g.restore();
}

/** A bottlebrush shoot: stiff needles in crowded opposite pairs, a tight tuft at the tip. */
function shoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, length: number, ll: number, sw: number) {
  const bend = (r() - 0.5) * 0.3;
  const pt = (t: number) => {
    const a = ang + bend * t;
    return [x0 + Math.sin(a) * length * t, y0 - Math.cos(a) * length * t, a] as const;
  };
  const nodes = Math.max(5, Math.round(length / (ll * 0.2)));
  const info = Array.from({ length: nodes }, (_, i) => {
    const t = 0.03 + (i / nodes) * 0.92;
    return { t, len: ll * lerp(1, 0.6, Math.pow(t, 2)) * (0.85 + r() * 0.3), sh: r() };
  });
  // Pairs seen end-on: one needle behind the stem, gray side showing.
  for (const [i, w] of info.entries()) {
    if (i % 2 === 0) continue;
    const [x, y, a] = pt(w.t);
    needle(g, r, x, y, a + (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.3), w.len * 0.7, ll * 0.13, r() < 0.3, w.sh * 0.5);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const [xa, ya] = pt(i / 8), [xb, yb] = pt((i + 1) / 8);
    g.strokeStyle = tone('#5c5844', '#55633f', i / 8);
    g.lineWidth = lerp(sw, sw * 0.55, i / 8);
    g.beginPath();
    g.moveTo(xa, ya);
    g.lineTo(xb, yb);
    g.stroke();
  }
  for (const [i, w] of info.entries()) {
    const [x, y, a] = pt(w.t);
    if (i % 2 === 0) {
      for (const s of [-1, 1]) needle(g, r, x, y, a + s * (0.75 + (r() - 0.5) * 0.45 - w.t * 0.35), w.len, ll * (0.12 + r() * 0.03), r() < 0.12, clamp(w.sh + (r() - 0.5) * 0.4));
    } else {
      needle(g, r, x, y, a + (r() - 0.5) * 0.5, w.len * 0.55, ll * 0.13, r() < 0.1, w.sh);
    }
  }
  const [xe, ye, ae] = pt(1);
  for (let i = 0; i < 6; i++) needle(g, r, xe, ye, ae + (i - 2.5) * 0.24 + (r() - 0.5) * 0.15, ll * (0.4 + r() * 0.2), ll * 0.11, r() < 0.15, 0.7 + r() * 0.3);
}

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-rosemary-pdr-leaves', 1024, 1024, (g) => {
    const r = rng('gc-rosemary-pdr-leaves');
    // Four single shoots, about 6.5 x 13 cm.
    for (let c = 0; c < 4; c++) inCell(g, c * 256, 0, 256, 512, () => shoot(g, r, 128, 510, (r() - 0.5) * 0.08, 512 * (c === 3 ? 0.62 : 0.86 + r() * 0.06), 96, 9));
    // Two branchlets: a shoot with side shoots, about 16 cm square.
    for (let c = 0; c < 2; c++) {
      inCell(g, c * 512, 512, 512, 512, () => {
        const S = 512;
        for (let i = 0; i < 3; i++) {
          const y = S * lerp(0.84, 0.48, i / 2);
          for (const s of [-1, 1]) {
            if (r() < 0.25) continue;
            shoot(g, r, S / 2 + (r() - 0.5) * 6, y, s * (0.55 + r() * 0.35), S * lerp(0.46, 0.3, i / 2) * (0.8 + r() * 0.35), 74, 6);
          }
        }
        shoot(g, r, S / 2, S - 2, (r() - 0.5) * 0.1, S * 0.9, 80, 10);
      });
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/* --------------------------- flower atlas --------------------------- */

/** 512 x 128: four clusters of two or three small two-lipped flowers, face-on, about 2.5 cm across. */
function flowerAtlas(blue: string): THREE.Texture {
  return leafTexture('gc-rosemary-pdr-flowers', 512, 128, (g) => {
    const r = rng('gc-rosemary-pdr-flowers');
    const flower = (x: number, y: number, s: number, rot: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      const lt = tone(blue, '#e4ecfa', 0.45), dk = tone(blue, '#3a4c9a', 0.45);
      // Upper lip: two small erect lobes.
      g.fillStyle = tone(blue, lt, 0.1 + r() * 0.2);
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * s * 0.17, -s * 0.42, s * 0.2, s * 0.34, sx * 0.2, 0, TAU);
        g.fill();
      }
      // Lower lip: two small side lobes and a broad, cupped middle lobe, spotted and veined dark blue.
      g.fillStyle = tone(blue, lt, r() * 0.15);
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * s * 0.38, s * 0.05, s * 0.22, s * 0.15, sx * 0.4, 0, TAU);
        g.fill();
      }
      g.fillStyle = tone(blue, lt, 0.05 + r() * 0.15);
      g.beginPath();
      g.ellipse(0, s * 0.3, s * 0.32, s * 0.3, 0, 0, TAU);
      g.fill();
      g.strokeStyle = dk;
      g.globalAlpha = 0.6;
      g.lineWidth = Math.max(1, s * 0.04);
      g.beginPath();
      for (let k = -2; k <= 2; k++) {
        g.moveTo(k * s * 0.05, s * 0.08);
        g.lineTo(k * s * 0.11, s * 0.48);
      }
      g.stroke();
      g.globalAlpha = 1;
      // Two long stamens arching out of the throat.
      g.strokeStyle = tone(blue, '#6a4a9a', 0.5);
      g.lineWidth = Math.max(1, s * 0.035);
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -s * 0.05);
        g.quadraticCurveTo(sx * s * 0.25, -s * 0.6, sx * s * 0.12, -s * 0.85);
        g.stroke();
      }
      g.fillStyle = '#efeaf6';
      g.beginPath();
      g.arc(0, -s * 0.02, s * 0.08, 0, TAU);
      g.fill();
      g.restore();
    };
    for (let c = 0; c < 4; c++) {
      inCell(g, c * 128, 0, 128, 128, () => {
        const n = c === 3 ? 2 : 3;
        // Felted gray-green calyces behind the flowers.
        for (let k = 0; k < n + 1; k++) {
          g.fillStyle = '#76846d';
          g.beginPath();
          g.ellipse(64 + (r() - 0.5) * 70, 64 + (r() - 0.5) * 70, 7, 11, r() * TAU, 0, TAU);
          g.fill();
        }
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + r() * 0.8, d = n === 2 ? 20 : 24;
          flower(64 + Math.cos(a) * d, 66 + Math.sin(a) * d, 40 + r() * 8, (r() - 0.5) * 0.9);
        }
      });
    }
    hardenAlpha(g, 512, 128);
  });
}

/* ------------------------------ builder ------------------------------ */

export const build: SpeciesBuilder = (spec) => {
  // R is the reach of the branches; the shoots on their ends stick out past it to the full spread.
  const H = spec.matureHeight, Sp = spec.matureSpread, R = (Sp / 2) * 0.85;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  // Shading center well below the ground, so normals lean up like a low mound.
  const center = V(0, -R * 0.5, 0), radii = V(R, R * 0.75, R);
  /** Height of the mound's surface at distance rho from the crown. */
  const env = (rho: number) => H * 0.9 * Math.pow(clamp(1 - Math.pow(rho / R, 2.2)), 0.75);
  const swayAt = (p: THREE.Vector3) => clamp((p.y / H) * 0.5 + (Math.hypot(p.x, p.z) / R) * 0.45);
  const shade = (p: THREE.Vector3) => {
    const rho = Math.hypot(p.x, p.z);
    const e = Math.max(0.02, env(rho));
    // Deep in the mound and low under the branches is darker.
    return lerp(0.55, 1, clamp(p.y / e)) * lerp(0.85, 1, clamp(rho / R));
  };
  const barkOld = col('#8a7b68'), barkYoung = col('#7f7a5e');
  const leafWhite = col('#ffffff');

  /** A smooth branch through control points. */
  const path = (ctrl: THREE.Vector3[], segs: number) => new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(segs);

  const cardAt = (at: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, uv: UV, birth: number, anchor: THREE.Vector3, cross: boolean) => {
    // Cards lie with their face to the sky (rolled a little), so the shoot reads from above like a real mat.
    const side = V().crossVectors(dir, V(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const roll = (r() - 0.5) * 0.9;
    const face = V().crossVectors(side, dir).normalize().multiplyScalar(Math.cos(roll)).addScaledVector(side, Math.sin(roll)).normalize();
    if (face.y < 0) face.negate();
    const c = jitter(leafWhite.clone().multiplyScalar(shade(at) * (0.88 + r() * 0.18)), r, 0.012, 0.04, 0.05);
    const s0 = swayAt(at);
    const o = { segs: 2, curl: -0.15 + r() * 0.35, center, radii, normalBend: 0.45, sway0: s0, sway1: clamp(s0 + 0.12) };
    leafQuad(leaves, at, dir, face, len, wid, uv, c, birth, anchor, o);
    if (cross) {
      const f2 = V().crossVectors(dir, face).normalize();
      leafQuad(leaves, at, dir, f2, len, wid, uv, c.clone().multiplyScalar(0.9), birth, anchor, { ...o, curl: 0 });
    }
  };

  const flowerAt = (p: THREE.Vector3, birth: number, anchor: THREE.Vector3) => {
    const n = V((r() - 0.5) * 0.9, 1, (r() - 0.5) * 0.9).add(V(p.x, 0, p.z).normalize().multiplyScalar(0.5)).normalize();
    const c = col('#ffffff', 0.92 + r() * 0.1);
    faceCard(flowers, p.clone().addScaledVector(n, 0.012), n, 0.028 + r() * 0.006, r() * TAU, rect(Math.floor(r() * 4) * 128, 0, 128, 128, 512, 128), c, birth, anchor, swayAt(p), n.clone().lerp(V(0, 1, 0), 0.4).normalize());
  };

  /** Foliage along a branch: shoots every few centimeters turned up toward the light, branchlets, crossed tips, scattered flowers. */
  const clothe = (pts: THREE.Vector3[], t0: number, birth: number, anchor: THREE.Vector3, flowerRate: number) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(2, Math.round((len * (1 - t0)) / 0.032));
    for (let k = 0; k < n; k++) {
      const t = lerp(t0, 0.97, (k + r() * 0.8) / n);
      const at = along(pts, t);
      const sideH = V(-at.dir.z, 0, at.dir.x).normalize().multiplyScalar(k % 2 === 0 ? 1 : -1);
      // Shoots over the crown turn up; out at the edge they lie nearly flat, tips just lifting.
      const edge = clamp(Math.hypot(at.p.x, at.p.z) / R);
      const dir = at.dir.clone().multiplyScalar(0.75).addScaledVector(sideH, 0.4 + r() * 0.5).add(V(0, lerp(0.45, 0.12, edge) + r() * lerp(0.45, 0.2, edge), 0)).normalize();
      const L = (0.105 + r() * 0.05) * lerp(1, 0.85, t);
      const b = birth > 0 ? birth : t > 0.55 && r() < 0.4 ? clamp(0.15 + r() * 0.6) : 0;
      const anc = birth > 0 ? anchor : at.p;
      cardAt(at.p, dir, L, L * 0.5, SHOOT(Math.floor(r() * 4)), b, anc, r() < 0.35);
      if (r() < 0.5) {
        // A branchlet lying along the slope of the mound.
        const bd = at.dir.clone().addScaledVector(sideH, (r() - 0.3) * 0.8).add(V(0, 0.2 + r() * 0.2, 0)).normalize();
        const BL = 0.15 + r() * 0.05;
        cardAt(at.p, bd, BL, BL, BRANCH(r() < 0.5 ? 0 : 1), b, anc, false);
      }
      if (r() < flowerRate) flowerAt(at.p.clone().addScaledVector(dir, L * (0.3 + r() * 0.5)), clamp(b + 0.02), anc);
    }
    // The tip turns up: a crossed shoot along the branch.
    const e = pts[pts.length - 1], ed = e.clone().sub(pts[pts.length - 2]).normalize();
    cardAt(e, ed.clone().add(V(0, 0.3, 0)).normalize(), 0.12 + r() * 0.03, 0.06, SHOOT(Math.floor(r() * 3)), birth, birth > 0 ? anchor : e, true);
  };

  // Main stems: out from the crown at a low angle, over in a low arch, down to the ground, tips turning up.
  const N = 18;
  for (let i = 0; i < N; i++) {
    const az = (i / N) * TAU + (r() - 0.5) * 0.35;
    const out = V(Math.cos(az), 0, Math.sin(az));
    // Every third stem is a long runner trailing over the ground past the mound; the edge is ragged.
    const reach = R * (i % 3 === 0 ? lerp(0.95, 1.0, r()) : lerp(0.72, 0.88, r()));
    const peak = reach * lerp(0.25, 0.4, r());
    const h = env(peak) * (0.5 + r() * 0.25);
    const wob = V(-out.z, 0, out.x).multiplyScalar((r() - 0.5) * reach * 0.25);
    const at = (rho: number, y: number) => out.clone().multiplyScalar(rho).add(V(0, y, 0)).addScaledVector(wob, rho / reach);
    const r0 = 0.03 + r() * 0.03;
    const ctrl = [at(r0, 0.0), at(lerp(r0, peak, 0.5), h * 0.7), at(peak, h), at(lerp(peak, reach, 0.55), Math.max(0.04, env(lerp(peak, reach, 0.55)) * 0.4)), at(reach * 0.93, 0.02), at(reach, 0.045 + r() * 0.03)];
    const pts = path(ctrl, 12);
    const birth = i % 3 === 2 ? clamp(0.1 + r() * 0.5) : 0;
    const anchor = V(0, 0, 0);
    tube(wood, pts, 0.006 + r() * 0.0015, 0.002, 5, barkOld, birth, anchor, (q) => swayAt(pts[q]), 2);
    clothe(pts, 0.2, birth, anchor, 0.18);

    // Side branches: alternate, spreading sideways and down the slope of the mound.
    const nb = 5 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const t = lerp(0.15, 0.85, (k + r() * 0.7) / nb);
      const p = along(pts, t).p;
      const rho = Math.hypot(p.x, p.z);
      const side = (k % 2 === 0 ? 1 : -1) * (0.45 + r() * 0.6);
      const bo = V(Math.cos(az + side), 0, Math.sin(az + side));
      let bl = Math.max(0.08, (R - rho) * (0.5 + r() * 0.5) + 0.05);
      // Keep the branch end inside the reach, so the edge is even.
      for (let it = 0; it < 6 && Math.hypot(p.x + bo.x * bl, p.z + bo.z * bl) > R * (0.93 + r() * 0.07); it++) bl *= 0.85;
      const endRho = Math.hypot(p.x + bo.x * bl, p.z + bo.z * bl);
      const ey = Math.max(0.03, env(Math.min(endRho, R * 0.99)) * (0.35 + r() * 0.5));
      const midP = p.clone().addScaledVector(bo, bl * 0.45);
      midP.y = Math.max(ey, lerp(p.y, ey, 0.4) + bl * 0.08);
      const bpts = path([p.clone(), midP, p.clone().addScaledVector(bo, bl).setY(ey)], 5);
      const bb = birth > 0 ? clamp(birth + r() * 0.15) : rho / R > 0.45 || r() < 0.3 ? clamp(0.1 + r() * 0.6 + (rho / R) * 0.2) : 0;
      tube(wood, bpts, 0.003, 0.0012, 3, barkYoung, bb, p, (q) => swayAt(bpts[q]), 2);
      clothe(bpts, 0.08, bb, p, 0.22);
    }
  }

  // Upright shoots over the crown build the top of the mound.
  for (let i = 0; i < 56; i++) {
    const a = r() * TAU, rho = (i < 14 ? r() * 0.18 : Math.sqrt(r()) * 0.55) * R;
    const base = V(Math.cos(a) * rho, Math.max(0.03, env(rho) * (0.45 + r() * 0.35)), Math.sin(a) * rho);
    const dir = V(Math.cos(a) * 0.45 + (r() - 0.5) * 0.5, 1, Math.sin(a) * 0.45 + (r() - 0.5) * 0.5).normalize();
    const birth = r() < 0.6 ? 0 : clamp(0.1 + r() * 0.6);
    cardAt(base, dir, 0.12 + r() * 0.05, 0.065, SHOOT(Math.floor(r() * 4)), birth, base, true);
    if (r() < 0.5) cardAt(base, dir.clone().lerp(V(Math.cos(a), 0.3, Math.sin(a)), 0.5).normalize(), 0.16, 0.16, BRANCH(r() < 0.5 ? 0 : 1), birth, base, false);
    if (r() < 0.3) flowerAt(base.clone().addScaledVector(dir, 0.08), clamp(birth + 0.02), base);
  }

  // Branchlets lying over the top of the crown, so it is closed when seen from above.
  for (let i = 0; i < 24; i++) {
    const a = r() * TAU, rho = Math.sqrt(r()) * R * 0.3;
    const base = V(Math.cos(a) * rho, env(rho) * (0.62 + r() * 0.25), Math.sin(a) * rho);
    // Any heading: the ones near the middle reach across the crown.
    const h = i % 2 === 0 ? a + Math.PI + (r() - 0.5) * 1.2 : a + (r() - 0.5) * 0.8;
    const dir = V(Math.cos(h), 0.3 + r() * 0.35, Math.sin(h)).normalize();
    const birth = r() < 0.5 ? 0 : clamp(0.1 + r() * 0.6);
    cardAt(base, dir, 0.16 + r() * 0.05, 0.16, BRANCH(r() < 0.5 ? 0 : 1), birth, base, false);
  }

  fitMat([leaves, flowers, wood], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    wood: wood.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(spec.flower ?? '#8aa4d8'),
    bark: { map: stemBark('rosemary-pdr', 0.35) },
    look: { leafRoughness: 0.8, translucency: 0.08, bend: 0.04, flutter: 0.006 },
  };
};
