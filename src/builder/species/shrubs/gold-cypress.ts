import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, smoothstep, tube, uvCell, type SpeciesBuilder } from '../kit';
import { arc, fibrousBark, fitToSize, frondStyle, inCell, paintCore, paintFrond, type ScalePal } from '../trees/shared-conifers';

/**
 * Gold mop cypress, Chamaecyparis pisifera 'Golden Mop' (threadleaf Sawara
 * cypress): a low, wide, irregular mound, wider than tall. Many short limbs
 * arch out from a low center and droop at the tips; each carries short
 * hanging tassels of cord-like thread foliage, so the surface is layers of
 * drooping tufts. Bright gold to chartreuse outside, lime green inside.
 */

const PAL: ScalePal = { key: 'goldmop2', dark: '#4f7018', mid: '#8f8a10', light: '#b08e00', tip: '#c9a400', stem: '#6b5a2a' };

/** 2 x 2 atlas: three short tassels (a few cords with side cordlets, base at the bottom) and an opaque patch for the shaded core. */
function mopAtlas(): THREE.Texture {
  return leafTexture('goldmop-tassels', 1024, 1024, (g, W, H) => {
    const r = rng('goldmop-tex2');
    for (let cell = 0; cell < 3; cell++) {
      inCell(g, W, H, 2, 2, cell, (w, h) => {
        const tuft = (tone: number, spread: number, n: number, cord: number) => {
          const st = frondStyle(PAL, { cord, angle: 0.36, angleVar: 0.16, spacing: 78, ratio: 0.42, taper: 0.7, minLen: 90, maxLevel: 2, wave: 0.55, sweep: 0.75, gaps: 0.2, tone });
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + ((i + 0.2 + r() * 0.6) / n - 0.5) * 2 * spread;
            paintFrond(g, r, w / 2 + (r() - 0.5) * 20, h - 8, a, h * (0.5 + r() * 0.42), st, 0, 0.45 + r() * 0.55);
          }
        };
        tuft(0.55, 0.3, 5, 14);
        tuft(0.8, 0.27, 4, 13);
        tuft(1, 0.24, 5, 12);
      });
    }
    inCell(g, W, H, 2, 2, 3, (w, h) => paintCore(g, r, w, h, PAL, 0.6), 0);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();

  // Outline: widest low (30% of the height), a broad flattish dome on top.
  const f = (t: number) => (t < 0.3 ? lerp(0.8, 1, smoothstep(0, 0.3, t)) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.3) / 0.7, 2.4))));
  const lump = (az: number) => 1 + 0.1 * Math.sin(az * 3 + 1.3) + 0.06 * Math.sin(az * 5 + 0.4);
  const surf = (az: number, t: number, k: number) => V(Math.cos(az) * R * f(t) * lump(az) * k, t * H * lerp(1, 0.9 + 0.1 * lump(az + 2), t), Math.sin(az) * R * f(t) * lump(az) * k);
  /** 0 at the center .. 1 at the outline. */
  const depth = (p: THREE.Vector3) => {
    const rad = Math.hypot(p.x, p.z) / R, t = clamp(p.y / H);
    return clamp(t < 0.3 ? rad / f(t) : Math.sqrt(rad * rad + Math.pow((t - 0.3) / 0.7, 2.4)));
  };
  const sway = (p: THREE.Vector3) => clamp((Math.max(0, p.y) / H) * 0.45 + (Math.hypot(p.x, p.z) / R) * 0.4);
  const limbCol = col('#7d6e5e'), twigCol = col('#8f8048');
  const tIn = col('#6c9338'), tOut = col('#ffffff');

  // Shaded core: an opaque dome well inside the outline, so gaps between tassels read as depth.
  {
    const rings = 7, sides = 10;
    let prev: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const t = lerp(0.02, 0.9, i / rings);
      const row: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const az = (k / sides) * Math.PI * 2;
        const p = surf(az, t, i === rings ? 0.05 : 0.46);
        p.y *= 0.55;
        const tri = (x: number) => 1 - Math.abs((x % 2) - 1);
        row.push(leaves.vert(p, V(Math.cos(az) * 0.3, -0.95, Math.sin(az) * 0.3).normalize(), lerp(0.52, 0.98, tri(k * 0.6)), lerp(0.02, 0.48, tri(i * 0.7)), tIn.clone().multiplyScalar(0.6), 0, V(0, p.y, 0), sway(p)));
      }
      if (i > 0) for (let k = 0; k < sides; k++) leaves.quad(prev[k], prev[k + 1], row[k + 1], row[k]);
      prev = row;
    }
  }

  const tassel = (at: THREE.Vector3, birth: number, scale: number) => {
    const rad = Math.hypot(at.x, at.z);
    const top = clamp((at.y / H - 0.6) / 0.3);
    const oa = Math.atan2(at.z, at.x) + (r() - 0.5) * lerp(2.6, 6.28, Math.max(top, rad < R * 0.2 ? 1 : 0));
    const dir = V(Math.cos(oa), lerp(0.15 - r() * 0.6, 0.12 - r() * 0.3, top), Math.sin(oa)).normalize();
    const len = (0.12 + r() * 0.08) * scale;
    const d = depth(at.clone().addScaledVector(dir, len * 0.6).add(V(0, -len * 0.2, 0)));
    const sun = Math.pow(d, 2.4) * lerp(0.72, 1, clamp(at.y / (H * 0.5)));
    const c = jitter(tIn.clone().lerp(tOut, sun), r, 0.012, 0.05, 0.05).multiplyScalar(lerp(0.45, 1.04, sun));
    const s = sway(at);
    leafQuad(leaves, at, dir, UP.clone().add(V((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7)).normalize(), len, len * (0.55 + r() * 0.2), uvCell(2, 2, Math.floor(r() * 3)), c, birth, at, {
      segs: 2, curl: lerp(0.8, 0.5, top) + r() * 0.8, center: V(0, -H * 0.3, 0), radii: V(R, H, R), normalBend: 0.5, sway0: s, sway1: clamp(s + 0.25),
    });
  };

  // Main limbs arch out from a low center.
  const NP = 12;
  const limbs: { pts: THREE.Vector3[]; az: number; birth: number }[] = [];
  for (let i = 0; i < NP; i++) {
    const az = (i / NP) * Math.PI * 2 + (r() - 0.5) * 0.3;
    const T = surf(az, i % 2 ? 0.3 + r() * 0.15 : 0.62 + r() * 0.2, 0.6);
    const base = V(Math.cos(az) * 0.05, 0.01, Math.sin(az) * 0.05);
    const pts = arc(base, V(T.x * 0.6, T.y * 1.1 + 0.06, T.z * 0.6), T, 5);
    const birth = 0;
    tube(wood, pts, 0.011, 0.004, 4, limbCol, birth, base, (k) => sway(pts[k]), 1);
    limbs.push({ pts, az, birth });
  }
  // Short branches reach every part of the outline, arch over and droop; each ends in a cluster of tassels.
  const M = 200, CAP = 30;
  for (let i = 0; i < M + CAP; i++) {
    const az = i * 2.39996 + (r() - 0.5) * 0.3;
    // The last few fill in the flattish top of the dome.
    const t = i >= M ? 0.84 + r() * 0.15 : 0.03 + 0.95 * Math.pow((i + r()) / M, 1.2);
    let best = limbs[0], bd = 9;
    for (const l of limbs) {
      const dd = Math.abs(Math.atan2(Math.sin(az - l.az), Math.cos(az - l.az)));
      if (dd < bd) { bd = dd; best = l; }
    }
    const a = along(best.pts, clamp(0.15 + t * 0.85 + (r() - 0.5) * 0.15, 0.1, 1));
    const E = surf(az, t, (0.74 + r() * 0.2) * (t > 0.8 ? Math.sqrt(r()) * (i >= M ? 0.8 : 1) : 1));
    const mid = a.p.clone().lerp(E, 0.6).add(V(0, (0.05 + r() * 0.07) * (t > 0.8 ? 0.3 : 1), 0));
    const sp = arc(a.p, mid, E, 2);
    const b2 = r() < 0.72 ? best.birth : clamp(best.birth + 0.12 + r() * 0.5, 0, 0.85);
    tube(wood, sp, 0.004, 0.0018, 3, twigCol, b2, a.p, (k) => sway(sp[k]), 1);
    for (let k = 0; k < 12; k++) {
      const q = along(sp, lerp(0.4, 1, Math.pow(r(), 0.7)));
      tassel(q.p, r() < 0.9 ? b2 : clamp(b2 + 0.1 + r() * 0.5, 0, 0.88), 1);
    }
    tassel(E, b2, 1.1);
  }

  fitToSize([leaves, wood], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: mopAtlas(),
    bark: { map: fibrousBark('mop', '#6e5544', '#3f2d22', '#9a8470') },
    look: { translucency: 0.3, leafRoughness: 0.7, bend: 0.06, flutter: 0.012 },
  };
};
