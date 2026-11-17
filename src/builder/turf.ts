import * as THREE from 'three';
import { materialById, type MaterialSpec } from '../siteplan/catalog';
import { bounds, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { GLOBAL, foliageDepthMaterial, patchFoliage } from '../engine/foliage';
import { GeoBuilder } from './geobuilder';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';
import { TURF_GRAIN, turfAlbedo } from '../engine/surfaces';

/** Instanced lawn blades over every turf zone. */

function tuftGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const r = rng('tuft');
  const up = new THREE.Vector3(0, 1, 0);
  for (let b = 0; b < 7; b++) {
    const a = r() * Math.PI * 2, rr = r() * 0.055;
    const base = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    const lean = new THREE.Vector3(Math.cos(a) * (0.2 + r() * 0.35), 1, Math.sin(a) * (0.2 + r() * 0.35)).normalize();
    const len = 0.07 + r() * 0.05;
    const side = new THREE.Vector3(-Math.sin(a + r()), 0, Math.cos(a + r())).normalize();
    const w0 = 0.0065;
    let prev: number[] | null = null;
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const p = base.clone().addScaledVector(lean, len * t);
      p.y -= len * 0.25 * t * t;
      const w = w0 * (1 - t * 0.9);
      const c = new THREE.Color(0.55, 0.55, 0.55).lerp(new THREE.Color(1.08, 1.08, 1.0), t);
      const ia = g.vert(p.clone().addScaledVector(side, -w), up, 0, t, c, 0, base, t * t);
      const ib = g.vert(p.clone().addScaledVector(side, w), up, 1, t, c, 0, base, t * t);
      if (prev) g.quad(prev[0], prev[1], ib, ia);
      prev = [ia, ib];
    }
  }
  return g.build();
}

/**
 * A patch of a maker's synthetic turf (spec.turf), about 10 cm across: blades at the real pile height in the two yarn
 * colors, leaning along the grain (TURF_GRAIN) with a slight droop, dark at the base and lighter toward the tip, with a
 * crease down each blade (the normals turn across its width, so the sun catches one side as on a C, W or D blade), and
 * a few curled thatch fibers near the backing. Colors are the maker's, as albedo; the instance color only varies them.
 */
function makerTuftGeometry(spec: MaterialSpec): THREE.BufferGeometry {
  const T = spec.turf!;
  const g = new GeoBuilder();
  const r = rng(`tuft:${spec.id}`);
  const col = (h: string) => new THREE.Color().setRGB(...turfAlbedo(h));
  const yarn = T.yarn.map(col), tip = col(T.tip), thatch = T.thatch.map(col);
  const pile = T.pileMm / 1000;
  const nBlades = Math.round(16 * (T.faceOz / 70)), half = T.blade === 'W' ? 0.0011 : T.blade === 'D' ? 0.0009 : 0.001;
  const blade = (base: THREE.Vector3, a: number, lean: number, len: number, w: number, c0: THREE.Color, curl: number, segs: number, tipC: THREE.Color | null) => {
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const out = new THREE.Vector3().crossVectors(side, dir).normalize();
    let prev: number[] | null = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Droop: the blade falls further over toward its tip; a thatch fiber curls round.
      const p = base.clone().addScaledVector(dir, len * t);
      p.addScaledVector(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), len * 0.18 * t * t);
      p.y -= len * 0.12 * t * t;
      if (curl) p.addScaledVector(side, Math.sin(t * curl) * len * 0.25);
      const ww = w * (1 - t * 0.75);
      const c = c0.clone().multiplyScalar(0.45 + 0.6 * t);
      if (tipC && t > 0.6) c.lerp(tipC, (t - 0.6) * 1.1);
      // Normals turned across the width: one half faces left of the blade's face, the other right.
      const nl = out.clone().addScaledVector(side, -0.55).normalize(), nr = out.clone().addScaledVector(side, 0.55).normalize();
      const ia = g.vert(p.clone().addScaledVector(side, -ww), nl, 0, t, c, 0, base, t * t);
      const ib = g.vert(p.clone().addScaledVector(side, ww), nr, 1, t, c, 0, base, t * t);
      if (prev) g.quad(prev[0], prev[1], ib, ia);
      prev = [ia, ib];
    }
  };
  for (let b = 0; b < nBlades; b++) {
    const ang = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.05;
    const base = new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
    const a = TURF_GRAIN + (r() - 0.5) * 1.4 + (r() < 0.12 ? Math.PI : 0);
    blade(base, a, 0.15 + r() * 0.45, pile * (0.92 + r() * 0.16), half * (0.9 + r() * 0.3), yarn[b % 2].clone().multiplyScalar(0.9 + r() * 0.2), 0, 3, tip);
  }
  const nThatch = Math.max(2, Math.round(10 * T.thatchShow));
  for (let b = 0; b < nThatch; b++) {
    const ang = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.05;
    const base = new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
    blade(base, r() * Math.PI * 2, 0.6 + r() * 0.5, pile * (0.3 + r() * 0.2), 0.0006, thatch[b % 2].clone(), 5 + r() * 4, 3, null);
  }
  return g.build();
}

export interface TurfBuild {
  object: THREE.Object3D | null;
  dispose(): void;
}

export function buildTurf(plan: SitePlan, gm: GroundModel, quality: Quality, blocked: (p: Vec2) => boolean): TurfBuild {
  const turf = plan.zones.filter((z) => z.kind === 'turf');
  if (!turf.length) return { object: null, dispose() {} };
  const step = quality === 'draft' ? 0.17 : quality === 'light' ? 0.14 : quality === 'balanced' ? 0.115 : 0.085;
  const r = rng('turf');
  const pts: { p: Vec2; c: THREE.Color; k: number; even: boolean }[] = [];
  // A maker's turf (spec.turf) gets its own blades, one instanced mesh per product.
  const maker = new Map<string, { spec: MaterialSpec; pts: Vec2[] }>();
  for (const z of turf) {
    const spec = materialById.get(z.catalogId);
    const pal = spec?.palette ?? ['#6f9a3c', '#4d7a2e'];
    const acc = new THREE.Color(pal[0]), base = new THREE.Color(pal[pal.length - 1]);
    // Artificial turf and putting greens are shorter and more even.
    const synthetic = spec?.recipe === 'turfArtificial';
    const putting = z.catalogId === 'putting-green';
    if (putting) continue;
    // Synthetic grass: every tuft the same green and height, so it reads as artificial turf.
    const even = z.catalogId === 'synthetic-turf';
    const b = bounds(z.polygon);
    if (spec?.turf) {
      const mk = maker.get(spec.id) ?? { spec, pts: [] };
      maker.set(spec.id, mk);
      for (let y = b.minY; y < b.maxY; y += step) {
        for (let x = b.minX; x < b.maxX; x += step) {
          // Jittered a whole step, so the patches do not line up in rows (real tuft rows are a 3/8 in gauge, far finer).
          const p: Vec2 = [x + (r() - 0.5) * step * 1.2, y + (r() - 0.5) * step * 1.2];
          if (gm.zoneAt(p) !== z || blocked(p)) continue;
          mk.pts.push(p);
        }
      }
      continue;
    }
    for (let y = b.minY; y < b.maxY; y += step) {
      for (let x = b.minX; x < b.maxX; x += step) {
        const p: Vec2 = [x + (r() - 0.5) * step, y + (r() - 0.5) * step];
        // The zone on top at p is this one only when p is inside it.
        if (gm.zoneAt(p) !== z) continue;
        if (blocked(p)) continue;
        const c = even
          ? base.clone().lerp(acc, 0.55 + r() * 0.1).multiplyScalar(0.98 + r() * 0.05)
          : base.clone().lerp(acc, synthetic ? 0.4 + r() * 0.3 : r()).multiplyScalar(synthetic ? 0.92 + r() * 0.12 : 0.8 + r() * 0.35);
        pts.push({ p, c, k: even ? 0.75 : synthetic ? 0.6 : 1, even });
      }
    }
  }
  const makerMeshes = [...maker.values()].filter((m) => m.pts.length).map((m) => makerTurfMesh(m.spec, m.pts, gm, r));
  if (!pts.length && !makerMeshes.length) return { object: null, dispose() {} };
  if (!pts.length) {
    const grp = new THREE.Group();
    grp.name = 'turf';
    makerMeshes.forEach((m) => grp.add(m.mesh));
    return { object: grp, dispose() { makerMeshes.forEach((m) => m.dispose()); } };
  }
  const geo = tuftGeometry();
  // No flutter: a blade is about a pixel wide a few meters out, and fast sub-pixel motion only sparkles.
  // Blades fade into the ground farther off, where the ground's own lawn texture carries the color.
  const opts = { bend: 0.035, flutter: 0, translucency: 0.35, fade: true };
  const mat = patchFoliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide }), opts);
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  im.name = 'turf';
  im.receiveShadow = true;
  im.castShadow = false;
  im.customDepthMaterial = foliageDepthMaterial(opts);
  im.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  pts.forEach(({ p, c, k: hk, even }, i) => {
    t.set(p[0], gm.height(p), p[1]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
    const k = even ? 0.95 + r() * 0.12 : 0.8 + r() * 0.5;
    s.set(k, k * hk * (even ? 0.96 + r() * 0.08 : 0.85 + r() * 0.3), k);
    m.compose(t, q, s);
    im.setMatrixAt(i, m);
    im.setColorAt(i, c);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  void GLOBAL;
  let object: THREE.Object3D = im;
  if (makerMeshes.length) {
    const grp = new THREE.Group();
    grp.name = 'turf';
    grp.add(im);
    makerMeshes.forEach((m) => grp.add(m.mesh));
    object = grp;
  }
  return {
    object,
    dispose() {
      im.dispose();
      geo.dispose();
      mat.dispose();
      im.customDepthMaterial?.dispose();
      makerMeshes.forEach((m) => m.dispose());
    },
  };
}

/** One maker turf's blades over its points: a patch at each, turned at random, the same height (the pile is even). */
function makerTurfMesh(spec: MaterialSpec, pts: Vec2[], gm: GroundModel, r: () => number): { mesh: THREE.InstancedMesh; dispose(): void } {
  const geo = makerTuftGeometry(spec);
  // Polyethylene blades: a soft sheen, no flutter (blades a millimeter wide only sparkle when they move).
  const opts = { bend: 0.01, flutter: 0, translucency: 0.3, fade: true };
  const mat = patchFoliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), opts);
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  im.name = `turf-${spec.id}`;
  im.receiveShadow = true;
  im.castShadow = false;
  im.customDepthMaterial = foliageDepthMaterial(opts);
  im.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Color();
  // The patch keeps its grain: turned only a little, so the whole lawn leans one way, as rolls are laid.
  pts.forEach((p, i) => {
    t.set(p[0], gm.height(p), p[1]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 0.5);
    const k = 0.95 + r() * 0.1;
    s.set(k, 0.97 + r() * 0.06, k);
    m.compose(t, q, s);
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.setScalar(0.94 + r() * 0.1));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return {
    mesh: im,
    dispose() {
      im.dispose();
      geo.dispose();
      mat.dispose();
      im.customDepthMaterial?.dispose();
    },
  };
}
