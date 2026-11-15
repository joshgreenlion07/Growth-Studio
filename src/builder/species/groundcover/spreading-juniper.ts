import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { fibrousBark, fitToSize, frondStyle, inCell, paintFrond, type ScalePal } from '../trees/shared-conifers';

/**
 * Spreading juniper, Juniperus sabina 'Tamariscifolia' (tam juniper) type: a
 * dense layered mat. Long main branches radiate just above the ground; all
 * along them small feathery sprays angle up and forward, so the surface is a
 * fine, slightly bristly texture of upturned tips that hides the wood and
 * the center. Rich green to blue-green with lighter tips.
 */

const PAL: ScalePal = { key: 'tam2', dark: '#1c3020', mid: '#2e5433', light: '#406c45', tip: '#56855c', stem: '#5e4a34' };

/** 4 x 4 atlas of small sprays (each a few inches long), base at the bottom of each cell. */
function tamAtlas(): THREE.Texture {
  return leafTexture('tam-juniper-sprays2', 1024, 1024, (g, W, H) => {
    const r = rng('tam-tex2');
    for (let cell = 0; cell < 16; cell++) {
      inCell(g, W, H, 4, 4, cell, (w, h) => {
        const st = (tone: number) => frondStyle(PAL, { cord: 5.2, angle: 0.6, angleVar: 0.18, spacing: 19, ratio: 0.55, taper: 0.38, minLen: 26, maxLevel: 2, awl: 0.6, wave: 0.3, sweep: 0.4, gaps: 0.08, tone });
        const up = -Math.PI / 2, s1 = r() < 0.5 ? -1 : 1;
        paintFrond(g, r, w / 2, h - 5, up + s1 * (0.4 + r() * 0.2), h * (0.5 + r() * 0.15), st(0.6));
        paintFrond(g, r, w / 2, h - 5, up - s1 * (0.3 + r() * 0.2), h * (0.55 + r() * 0.15), st(0.8));
        paintFrond(g, r, w / 2, h - 5, up + s1 * (r() * 0.12), h * (0.8 + r() * 0.12), st(1), 0, 0.75);
      }, 3);
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const sway = (p: THREE.Vector3) => clamp((Math.hypot(p.x, p.z) / R) * 0.3 + (p.y / H) * 0.35);
  const barkCol = col('#6f645b');
  const tIn = col('#93a394'), tOut = col('#ffffff');

  /** One small spray standing off the wood at `tilt` radians above horizontal. */
  const spray = (at: THREE.Vector3, heading: THREE.Vector3, tilt: number, len: number, birth: number) => {
    const d = V(heading.x, 0, heading.z).normalize().multiplyScalar(Math.cos(tilt));
    d.y = Math.sin(tilt);
    const sun = clamp(0.3 + tilt * 0.5 + (at.y / H) * 0.6 + r() * 0.25);
    const c = jitter(tIn.clone().lerp(tOut, sun), r, 0.014, 0.05, 0.05).multiplyScalar(lerp(0.74, 1.0, sun));
    const s = sway(at);
    // Rolled at random about its own axis: a bristly volume, never one flat sheet.
    leafQuad(leaves, at, d, UP.clone().applyAxisAngle(d, (r() - 0.5) * 1.7), len, len * (0.72 + r() * 0.25), uvCell(4, 4, Math.floor(r() * 16)), c, birth, at, {
      segs: 1, center: V(0, -1.2, 0), radii: V(1, 1, 1), normalBend: 0.8, sway0: s, sway1: clamp(s + 0.12),
    });
  };
  /** Tufts of sprays down both sides of a branch, angled up and forward. */
  const dress = (pts: THREE.Vector3[], from: number, birth: number) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(1, Math.round((L * (1 - from)) / 0.042));
    for (let k = 0; k < n; k++) {
      const a = along(pts, lerp(from, 1, (k + r() * 0.8) / n));
      const lat = V().crossVectors(a.dir, UP).normalize();
      const b = r() < 0.72 ? birth : clamp(birth + 0.1 + r() * 0.55, 0, 0.88);
      for (const sgn of [-1, 1, 0]) {
        const ang = sgn * (0.55 + r() * 0.6) + (r() - 0.5) * 0.3;
        const h = a.dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(lat, Math.sin(ang));
        spray(a.p, h, sgn === 0 ? 0.45 + r() * 0.4 : 0.2 + r() * 0.4, 0.13 + r() * 0.08, b);
      }
    }
    // Low sprays fanned over the growing tip.
    const e = along(pts, 1);
    const el = V().crossVectors(e.dir, UP).normalize();
    for (const sgn of [-1, 0, 1]) spray(e.p, e.dir.clone().addScaledVector(el, sgn * 0.6), 0.08 + r() * 0.2, 0.15 + r() * 0.05, birth);
  };

  const N = 14;
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.3;
    // Uneven lengths feather the outer edge.
    const L = R * (i % 2 ? 0.58 + r() * 0.2 : 0.8 + r() * 0.12);
    const ca = Math.cos(az), sa = Math.sin(az), wig = (r() - 0.5) * 0.3;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const s = k / 4, side = Math.sin(s * Math.PI * 1.3) * wig * L * 0.4;
      pts.push(V(ca * L * s - sa * side, 0.035 + 0.11 * Math.sin(Math.PI * Math.pow(s, 0.5)) * (1 - 0.5 * s) + r() * 0.015, sa * L * s + ca * side));
    }
    const birth = i % 2 ? 0.15 + r() * 0.3 : 0;
    tube(wood, pts, 0.013, 0.004, 3, barkCol, birth, V(), (k) => sway(pts[k]), 1);
    dress(pts, 0.06, birth);
    const ns = 3;
    for (let k = 0; k < ns; k++) {
      const a = along(pts, lerp(0.22, 0.8, (k + r() * 0.7) / ns));
      const lat = V().crossVectors(a.dir, UP).normalize().multiplyScalar((k + i) % 2 ? 1 : -1);
      const ang = 0.5 + r() * 0.4;
      const d = a.dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(lat, Math.sin(ang)).setY(0).normalize();
      const l2 = Math.min(L * lerp(0.6, 0.32, k / ns) * (0.75 + r() * 0.5), (R - Math.hypot(a.p.x, a.p.z)) * 1.1);
      const e = a.p.clone().addScaledVector(d, l2);
      e.y = 0.04 + r() * 0.04;
      const sp = [a.p, a.p.clone().lerp(e, 0.5).add(V(0, 0.02, 0)), e];
      const b2 = r() < 0.6 ? birth : clamp(birth + 0.15 + r() * 0.5, 0, 0.85);
      tube(wood, sp, 0.006, 0.002, 3, barkCol, b2, a.p, (j) => sway(sp[j]), 1);
      dress(sp, 0.1, b2);
    }
  }
  // Upright sprays over the hub.
  for (let k = 0; k < 60; k++) {
    const az = k * 2.39996, rr = 0.02 + Math.sqrt(k / 60) * 0.24;
    spray(V(Math.cos(az) * rr, 0.08 + r() * 0.08, Math.sin(az) * rr), V(Math.cos(az + (r() - 0.5)), 0, Math.sin(az + (r() - 0.5))), 0.35 + r() * 0.55, 0.14 + r() * 0.07, 0);
  }

  fitToSize([leaves, wood], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: tamAtlas(),
    bark: { map: fibrousBark('juniper', '#6b5446', '#3d2c22', '#9c8672') },
    look: { translucency: 0.15, leafRoughness: 0.78, bend: 0.03, flutter: 0.006 },
  };
};
