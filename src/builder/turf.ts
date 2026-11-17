import * as THREE from 'three';
import { materialById } from '../siteplan/catalog';
import { bounds, rng } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { GLOBAL, foliageDepthMaterial, patchFoliage } from '../engine/foliage';
import { GeoBuilder } from './geobuilder';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

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
  if (!pts.length) return { object: null, dispose() {} };
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
  return {
    object: im,
    dispose() {
      im.dispose();
      geo.dispose();
      mat.dispose();
      im.customDepthMaterial?.dispose();
    },
  };
}
