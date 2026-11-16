import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, jitter, leafQuad, lerp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { arcPath, fitToSize, sheet, stemBark } from './shared-perennials';
import { coneFlowerMap, coneLeafMap, head, stemTint, type Stage } from './shared-coneflower';

/**
 * Purple coneflower, Echinacea purpurea, in midsummer bloom. A clump of
 * dark green, rough, toothed basal leaves on long petioles; stout hairy
 * stems with smaller alternate leaves, each carrying a daisy of drooping
 * rose-pink rays around a domed, spiny copper cone. Some heads are buds,
 * some past peak with a dark brown cone.
 */

interface HeadPlan { stage: Stage; size: number; birth: number }

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const swayAt = (y: number) => clamp(0.08 + (y / H) * 0.85, 0, 0.95);

  /* Basal rosette: inner leaves stand up, outer ones arch out and over. */
  const NL = 36;
  for (let i = 0; i < NL; i++) {
    const f = (i + 0.5) / NL;
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const L = lerp(0.2, 0.33, Math.pow(f, 0.8)) * (0.88 + r() * 0.24);
    const W = L * 0.3;
    const elev0 = lerp(1.35, 0.7, f) + (r() - 0.5) * 0.2;
    const droop = lerp(0.5, 1.15, f) + r() * 0.3;
    const base = V(Math.cos(az) * 0.012, 0.004, Math.sin(az) * 0.012);
    const birth = i % 2 === 0 ? 0 : clamp(0.08 + (1 - f) * 0.4 + r() * 0.3, 0, 0.85);
    const rows = 10, cols = 5;
    const out = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const twist = (r() - 0.5) * 0.5, ph = r() * 6.28, cup = 0.08 + r() * 0.1;
    const grid: THREE.Vector3[][] = [];
    const p = base.clone();
    for (let a = 0; a < rows; a++) {
      const t = a / (rows - 1);
      const e = elev0 - droop * Math.pow(t, 1.5);
      const d = out.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0));
      if (a > 0) p.addScaledVector(d, L / (rows - 1));
      const up = V().crossVectors(side, d).normalize();
      if (up.y < 0) up.multiplyScalar(-1);
      const blade = clamp((t - 0.3) / 0.15);
      const row: THREE.Vector3[] = [];
      for (let b = 0; b < cols; b++) {
        const x = b / (cols - 1) - 0.5, edge = Math.abs(x) * 2;
        const q = p.clone().addScaledVector(side, x * W * Math.cos(twist * t)).addScaledVector(up, x * W * Math.sin(twist * t));
        q.addScaledVector(up, (edge * edge * cup * W * 0.6 + Math.sin(t * 17 + ph + (x > 0 ? 1.3 : 0)) * W * 0.035 * edge * blade) * blade);
        row.push(q);
      }
      grid.push(row);
    }
    const tone = jitter(col('#ffffff', lerp(0.98, 0.82, f) * (0.92 + r() * 0.12)), r, 0.01, 0.04, 0.02);
    const dark = tone.clone().multiplyScalar(0.7);
    const cell = i % 2;
    sheet(leaves, grid, [cell * 0.25, 0, cell * 0.25 + 0.25, 1], (a) => dark.clone().lerp(tone, clamp(a / 3)), birth, base, (a) => clamp(Math.pow(a / (rows - 1), 1.5) * 0.4));
  }

  /* Flowering stems. */
  const heads: { c: THREE.Vector3; n: THREE.Vector3; plan: HeadPlan }[] = [];
  const stems: { az: number; L: number; lean: number; birth: number; tip?: HeadPlan; lat?: HeadPlan; latT?: number }[] = [
    { az: 0.4, L: 0.72, lean: 0.12, birth: 0.2, tip: { stage: 'open', size: 1.1, birth: 0.5 }, lat: { stage: 'spent', size: 1.05, birth: 0.55 }, latT: 0.55 },
    { az: 2.2, L: 0.6, lean: 0.3, birth: 0, tip: { stage: 'open', size: 1.1, birth: 0.4 }, lat: { stage: 'bud', size: 1, birth: 0 }, latT: 0.6 },
    { az: 3.9, L: 0.55, lean: 0.34, birth: 0.25, tip: { stage: 'opening', size: 1, birth: 0.35 } },
    { az: 5.1, L: 0.6, lean: 0.38, birth: 0.3, tip: { stage: 'open', size: 1.1, birth: 0.65 }, lat: { stage: 'open', size: 1, birth: 0.75 }, latT: 0.58 },
    { az: 1.3, L: 0.46, lean: 0.4, birth: 0.45, tip: { stage: 'spent', size: 1, birth: 0.5 }, lat: { stage: 'bud', size: 0.95, birth: 0.7 }, latT: 0.55 },
    { az: 4.5, L: 0.34, lean: 0.5, birth: 0 },
    { az: 0.0, L: 0.28, lean: 0.55, birth: 0 },
    { az: 2.9, L: 0.4, lean: 0.45, birth: 0.25 },
  ];
  const leafUV = (cell: number) => uvCell(4, 1, cell);
  const stemLeaf = (pts: THREE.Vector3[], t: number, side: number, len: number, birth: number, cell: number, upright = 0.9) => {
    const at = along(pts, t);
    const outDir = V(Math.cos(side), 0, Math.sin(side));
    const d = at.dir.clone().multiplyScalar(0.55 * upright).addScaledVector(outDir, 1).normalize();
    const fl = jitter(col('#ffffff', 0.85 + r() * 0.15), r, 0.01, 0.04, 0.03);
    leafQuad(leaves, at.p, d, at.dir.clone().add(V(0, 0.4, 0)), len, len * 0.3, leafUV(cell), fl, birth, at.p, { segs: 3, curl: 0.55 + r() * 0.3, fold: 0.18, sway0: swayAt(at.p.y), sway1: swayAt(at.p.y + len * 0.4), normalBend: 0 });
  };
  const tipDirOf = (pts: THREE.Vector3[]) => {
    const a = pts[pts.length - 2], e = pts[pts.length - 1];
    return e.clone().sub(a).normalize().multiplyScalar(0.6).add(V(0, 0.55, 0)).normalize();
  };
  stems.forEach((s, si) => {
    const base = V(Math.cos(s.az) * 0.025, 0, Math.sin(s.az) * 0.025);
    const pts = arcPath(base, s.az, s.lean, s.lean * 0.35, s.L, 8, r, 0.1);
    const sw = (i: number) => swayAt(pts[i].y);
    tube(wood, pts, 0.0046, 0.0032, 6, stemTint(1), s.birth, base, sw, 1);
    // alternate stem leaves, bigger low down, small near the head
    const nLeaf = s.tip ? 11 : 6;
    for (let k = 0; k < nLeaf; k++) {
      const t = 0.1 + (k / nLeaf) * 0.72;
      const len = lerp(0.15, 0.055, k / nLeaf) * (0.9 + r() * 0.2);
      stemLeaf(pts, t, s.az + k * 2.39996 * 1.3 + 0.5, len, clamp(s.birth + (t > 0.5 ? 0.15 : 0)), 2 + (k % 2));
    }
    const top = pts[pts.length - 1];
    const tn = tipDirOf(pts);
    if (s.tip) heads.push({ c: top.clone().addScaledVector(tn, 0.006), n: tn, plan: s.tip });
    else stemLeaf(pts, 1, s.az + 0.3, 0.06, s.birth, 3, 1.4);
    if (s.lat && s.latT) {
      const from = along(pts, s.latT);
      const laz = s.az + 1.1 + si * 0.9;
      const lpts = arcPath(from.p, laz, 0.95, 0.3, 0.17 + r() * 0.05, 5, r, 0.1);
      const lsw = (i: number) => swayAt(lpts[i].y);
      tube(wood, lpts, 0.0028, 0.0021, 5, stemTint(1), s.lat.birth, from.p, lsw, 1);
      stemLeaf(lpts, 0.18, laz + 0.7, 0.075, s.lat.birth, 3);
      stemLeaf(lpts, 0.45, laz - 1.2, 0.055, s.lat.birth, 2);
      const lt = lpts[lpts.length - 1];
      const ln = tipDirOf(lpts);
      heads.push({ c: lt.clone().addScaledVector(ln, 0.005), n: ln, plan: s.lat });
      // a small bract leaf at the fork
      stemLeaf(pts, s.latT, laz + 2.5, 0.07, s.lat.birth, 3);
    }
  });
  for (const h of heads) {
    const anchor = h.c;
    // flowers carry their own birth, collapsing to the head center
    head(flowers, h.c, h.n, { stage: h.plan.stage, size: h.plan.size * 1.22 }, h.plan.birth, swayAt(h.c.y), r);
    void anchor;
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: coneLeafMap(),
    flowerMap: coneFlowerMap(),
    bark: { map: stemBark() },
    look: { translucency: 0.3, leafRoughness: 0.7, bend: 0.06, flutter: 0.004, alphaTest: 0.45 },
  };
};
