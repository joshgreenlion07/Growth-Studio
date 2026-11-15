import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { cssMix, fitToSize, inCell, scalyBark } from './shared-conifers';

/**
 * Colorado blue spruce, Picea pungens (glauca type): a strict central leader
 * with whorled tiers of stiff horizontal branches that dip and lift at the
 * tips, branched to the ground. Sharp 1 in needles stand all around every
 * twig; new growth is powder blue, older needles blue-green.
 */

const OLD = '#33453f', MID = '#4e666d', NEW = '#7b94a3', UNDER = '#1f2d28', TWIG = '#6e5a44';

/** A needle-clad twig (bottlebrush) from (x0, y0) to (x1, y1); `nl` is the needle length in px. */
function needleTwig(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, x1: number, y1: number, nl: number, age0: number, age1: number, tone = 1) {
  const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
  g.lineCap = 'butt';
  g.strokeStyle = cssMix(UNDER, OLD, 0.3, tone);
  g.lineWidth = nl * 0.6;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.lineCap = 'round';
  const n = Math.round(L / 0.8);
  const needle = (t: number, ang: number, len: number, lift: number) => {
    const px = lerp(x0, x1, t), py = lerp(y0, y1, t);
    const age = clamp(lerp(age0, age1, t) + (r() - 0.5) * 0.25);
    g.strokeStyle = age < 0.5 ? cssMix(OLD, MID, age * 2, tone * (0.8 + r() * 0.35 + lift)) : cssMix(MID, NEW, age * 2 - 1, tone * (0.85 + r() * 0.3 + lift));
    g.lineWidth = Math.max(1.6, nl * 0.1);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    g.stroke();
  };
  for (let i = 0; i < n; i++) needle(r(), a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.75), nl * (0.75 + r() * 0.35), 0);
  g.strokeStyle = cssMix(TWIG, UNDER, 0.2, tone);
  g.lineWidth = Math.max(1.5, nl * 0.12);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  // Needles on the near side of the twig, foreshortened, catching more light.
  for (let i = 0; i < n * 0.55; i++) needle(r(), a + (r() - 0.5) * 1.1, nl * (0.35 + r() * 0.4), 0.12);
  // The tip: a fan of needles around the terminal bud.
  for (let i = 0; i < 16; i++) needle(1, a + (r() - 0.5) * 2.2, nl * (0.7 + r() * 0.3), 0.1);
  g.fillStyle = cssMix(TWIG, '#c9a878', 0.5, tone);
  g.beginPath();
  g.arc(x1, y1, nl * 0.09, 0, 6.3);
  g.fill();
}

/** A branchlet with forward-angled side twigs, seen from above. Base at (x, y), heading `ang`. */
function spraySpruce(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, nl: number, level: number, tone: number) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  if (level < 1) {
    const n = 3;
    for (let k = 0; k < n; k++) {
      const t = lerp(0.1, 0.72, (k + 0.3 + r() * 0.4) / n);
      for (const s of [-1, 1]) {
        if (r() < 0.12) continue;
        const cl = len * lerp(0.6, 0.3, t) * (0.8 + r() * 0.4);
        spraySpruce(g, r, lerp(x, ex, t + s * 0.03), lerp(y, ey, t + s * 0.03), ang + s * (0.6 + r() * 0.25), cl, nl, level + 1, tone * (level === 0 ? 0.92 : 0.85));
      }
    }
  }
  needleTwig(g, r, x, y, ex, ey, nl, level === 0 ? 0.15 : 0.35, 1.05, tone);
}

function spruceAtlas(): THREE.Texture {
  return leafTexture('blue-spruce-needles', 1024, 1024, (g, W, H) => {
    const r = rng('blue-spruce-tex');
    const up = -Math.PI / 2;
    for (let cell = 0; cell < 2; cell++) inCell(g, W, H, 2, 2, cell, (w, h) => spraySpruce(g, r, w / 2, h - 8, up + (r() - 0.5) * 0.08, h * 0.84, 38, 0, 1));
    // A short dense fan of three twigs.
    inCell(g, W, H, 2, 2, 2, (w, h) => {
      for (const s of [-1, 1]) spraySpruce(g, r, w / 2, h - 8, up + s * (0.5 + r() * 0.15), h * 0.62, 42, 1, 0.88);
      spraySpruce(g, r, w / 2, h - 8, up, h * 0.82, 42, 1, 1);
    });
    // Two single bottlebrush twigs side by side.
    inCell(g, W, H, 2, 2, 3, (w, h) => {
      needleTwig(g, r, w * 0.25, h - 6, w * 0.25, h * 0.14, 84, 0.1, 1.05);
      needleTwig(g, r, w * 0.75, h - 6, w * 0.75, h * 0.14, 84, 0.3, 1.1);
    });
  });
}

const CELL = (i: number): [number, number, number, number] => (i === 0 ? [0, 0.5, 0.5, 1] : i === 1 ? [0.5, 0.5, 1, 1] : i === 2 ? [0, 0, 0.5, 0.5] : i === 3 ? [0.5, 0, 0.75, 0.5] : [0.75, 0, 1, 0.5]);

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const prof = (y: number) => {
    const t = clamp(y / H);
    return R * Math.max(0.03, t < 0.07 ? lerp(0.84, 1, t / 0.07) : Math.pow(1 - (t - 0.07) / 0.93, 0.92));
  };
  const sway = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / H, 1.6) * 0.6 + (Math.hypot(p.x, p.z) / R) * 0.3);
  const white = col('#ffffff'), limbCol = col('#8f867c');
  const tIn = col('#6f7a74'), tOut = col('#ffffff'), tNew = col('#ffffff').multiplyScalar(1.04);

  const trunk = [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1].map((t) => V(0, lerp(-0.12, H * 0.93, t), 0));
  tube(wood, trunk, 0.115, 0.012, 10, white, 0, V(), (i) => sway(trunk[i]), 4);
  tube(wood, [V(0, -0.1, 0), V(0, 0.03, 0), V(0, 0.22, 0)], 0.19, 0.112, 10, white, 0, V(), () => 0, 2);

  const card = (base: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, len: number, wid: number, cell: number, birth: number, segs: number, curl: number, fresh: number) => {
    const tip = base.clone().addScaledVector(dir, len * 0.7);
    const depth = clamp(Math.hypot(tip.x, tip.z) / prof(tip.y));
    const shade = lerp(0.42, 1, Math.pow(depth, 1.5)) * lerp(0.88, 1.03, clamp(base.y / H));
    const c = jitter(tIn.clone().lerp(tOut, depth).lerp(tNew, fresh * depth), r, 0.01, 0.04, 0.045).multiplyScalar(shade);
    const s0 = sway(base);
    leafQuad(leaves, base, dir, face, len, wid, CELL(cell), c, birth, base, {
      segs, curl, center: V(0, base.y - 1.4, 0), radii: V(1, 1, 1), normalBend: 0.45, sway0: s0, sway1: clamp(s0 + 0.06),
    });
  };
  /** Needles clothing a woody axis: crossed bottlebrush cards in short lengths. */
  const brush = (pts: THREE.Vector3[], from: number, birth: number, wid: number) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(1, Math.round((L * (1 - from)) / 0.3));
    for (let k = 0; k < n; k++) {
      const a = along(pts, lerp(from, 1, k / n)), b = along(pts, lerp(from, 1, (k + 1) / n));
      const d = b.p.clone().sub(a.p), len = d.length() * 1.08;
      d.normalize();
      const side = V().crossVectors(d, UP).normalize();
      const roll = r() * 0.8;
      card(a.p, d, UP.clone().applyAxisAngle(d, roll), len, wid, 3 + (k % 2), birth, 1, 0, k === n - 1 ? 0.8 : 0.2);
      card(a.p, d, side.applyAxisAngle(d, roll), len, wid, 4 - (k % 2), birth, 1, 0, k === n - 1 ? 0.8 : 0.2);
    }
  };

  const limb = (y0: number, az: number, L: number, birth: number) => {
    const t = clamp(y0 / H);
    const slope = lerp(-0.07, 0.5, Math.pow(t, 1.5)), sag = lerp(0.19, 0.02, t), tipUp = 0.15;
    const ca = Math.cos(az), sa = Math.sin(az), wig = (r() - 0.5) * 0.12 * L;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const s = i / 5, side = Math.sin(s * Math.PI) * wig;
      const y = Math.max(0.07, y0 + L * (slope * s - sag * Math.sin(Math.PI * s * 0.85) + tipUp * s * s * s));
      pts.push(V(ca * L * s - sa * side, y, sa * L * s + ca * side));
    }
    const r0 = Math.max(0.007, L * 0.017);
    tube(wood, pts, r0, r0 * 0.22, L > 1.2 ? 4 : 3, limbCol, birth, pts[0], (i) => sway(pts[i]), 1.5);
    brush(pts, 0.3, birth, 0.11);
    // The leading shoot.
    const e = along(pts, 1);
    for (const roll of [0.3, 1.9]) card(e.p, e.dir, UP.clone().applyAxisAngle(e.dir, roll), 0.26, 0.2, 2, birth, 2, -0.15, 1);

    // Side branchlets, alternating, angled forward, longest near the middle of the limb.
    const n = Math.max(2, Math.round(L / 0.062));
    for (let k = 0; k < n; k++) {
      const s = lerp(0.2, 0.97, (k + 0.3 + r() * 0.4) / n);
      const at = along(pts, s);
      const sgn = k % 2 ? 1 : -1;
      const lat = V().crossVectors(at.dir, UP).normalize().multiplyScalar(sgn);
      const l2 = clamp(L * 0.6 * (1.04 - s) * (0.75 + r() * 0.5), 0.1, 0.8);
      const ang = 0.85 + r() * 0.3;
      const d2 = at.dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(lat, Math.sin(ang));
      d2.y += (r() - 0.62) * lerp(0.5, 0.3, t);
      d2.normalize();
      const mid = at.p.clone().addScaledVector(d2, l2 * 0.5).add(V(0, -l2 * 0.05, 0));
      const end = at.p.clone().addScaledVector(d2, l2).add(V(0, l2 * 0.04, 0));
      end.y = Math.max(0.05, end.y); mid.y = Math.max(0.05, mid.y);
      const lp = [at.p, mid, end];
      const b2 = birth > 0 || r() < 0.7 ? birth : 0.1 + r() * 0.6;
      if (l2 > 0.4) tube(wood, lp, Math.max(0.004, l2 * 0.012), 0.002, 3, limbCol, b2, at.p, (i) => sway(lp[i]), 1);
      brush(lp, 0.1, b2, 0.095);
      const lat2 = V().crossVectors(d2, UP).normalize();
      // Twigs off the branchlet.
      const m = Math.round(l2 / 0.05);
      for (let j = 0; j < m; j++) {
        const u = lerp(0.12, 0.9, (j + r() * 0.8) / m);
        const q = along(lp, u);
        const a3 = 0.7 + r() * 0.35, s3 = j % 2 ? 1 : -1;
        const d3 = d2.clone().multiplyScalar(Math.cos(a3)).addScaledVector(lat2, Math.sin(a3) * s3).add(V(0, (r() - 0.55) * 0.5, 0)).normalize();
        const l3 = clamp(l2 * 0.62 * (1.08 - u), 0.11, 0.34) * (0.85 + r() * 0.3);
        const big = l3 > 0.2;
        const roll = (r() - 0.5) * 1.6, b3 = r() < 0.85 ? b2 : clamp(b2 + 0.15 + r() * 0.4, 0, 0.9);
        card(q.p, d3, UP.clone().applyAxisAngle(d3, roll), l3, l3 * (big ? 0.85 : 0.7), big ? (r() < 0.5 ? 0 : 1) : 2, b3, big ? 2 : 1, 0.1 + r() * 0.25, u);
        if (big) card(q.p, d3.clone().add(V(0, 0.35, 0)).normalize(), UP.clone().applyAxisAngle(d3, roll + 1.3), l3 * 0.8, l3 * 0.6, 2, b3, 1, 0, u);
      }
      const le = along(lp, 1);
      card(le.p, le.dir, UP.clone().applyAxisAngle(le.dir, (r() - 0.5) * 1.2), 0.2 + r() * 0.08, 0.2, 2, b2, 1, 0, 1);
    }
  };

  // Whorls of limbs up the trunk, one per year of growth, plus a few weaker limbs between them.
  const nW = Math.max(8, Math.round((H - 0.6) / 0.42));
  for (let w = 0; w < nW; w++) {
    const y = lerp(0.2, H - 0.42, w / (nW - 1));
    const nb = w < nW * 0.6 ? 5 + (r() < 0.5 ? 1 : 0) : 4 + (r() < 0.6 ? 1 : 0);
    const az0 = r() * 6.28;
    const wb = 0;
    const reach = 0.86 + r() * 0.12;
    for (let b = 0; b < nb; b++) limb(y + (r() - 0.5) * 0.06, az0 + ((b + (r() - 0.5) * 0.35) / nb) * 6.283, Math.max(0.16, prof(y) * reach * (0.9 + r() * 0.14)), wb);
    if (w < nW - 2) for (let e = 0; e < 4; e++) limb(y + 0.1 + r() * 0.24, az0 + ((e + 0.5 + (r() - 0.5) * 0.5) / 4) * 6.283, Math.max(0.14, prof(y + 0.2) * (0.55 + r() * 0.32)), 0.25 + r() * 0.55);
  }
  // The leader.
  const top = [V(0, H * 0.9, 0), V(0, H * 0.95, 0), V(0, H, 0)];
  brush(top, 0, 0, 0.11);
  for (let k = 0; k < 4; k++) {
    const az = k * 1.6 + 0.4;
    card(V(0, H - 0.2, 0), V(Math.cos(az) * 0.8, 0.6, Math.sin(az) * 0.8).normalize(), UP, 0.2, 0.16, 2, 0, 1, 0, 1);
  }

  fitToSize([leaves, wood], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: spruceAtlas(),
    bark: { map: scalyBark('spruce', '#6a6058', '#3a332d', '#8d857a') },
    look: { alphaTest: 0.42, translucency: 0.1, leafRoughness: 0.7, bend: 0.1, flutter: 0.004 },
  };
};
