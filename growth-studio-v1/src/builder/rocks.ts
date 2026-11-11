import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { vnoise } from '../engine/noise';
import { rockMaterial } from './materials';

/** Procedural stones: a few shared shapes, placed as instances. */

const variants: THREE.BufferGeometry[] = [];

function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`rock${seed}`);
  const sx = 0.8 + r() * 0.5, sy = 0.45 + r() * 0.3, sz = 0.7 + r() * 0.4;
  const v = new THREE.Vector3();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d =
      vnoise(n.x * 2.2 + seed, n.y * 2.2 + n.z * 1.7, 1e6, seed) * 0.35 +
      vnoise(n.x * 6 + seed * 3, n.z * 6 + n.y * 2, 1e6, seed + 1) * 0.12;
    // Flatten into facets for a fractured look.
    const facet = Math.round(d * 6) / 6;
    const k = 0.75 + (d * 0.6 + facet * 0.4);
    v.set(v.x * sx * k, v.y * sy * k, v.z * sz * k);
    if (v.y < -0.1) v.y = -0.1 + (v.y + 0.1) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
    const c = 0.72 + d * 0.35;
    colors[i * 3] = c * (0.98 + r() * 0.04);
    colors[i * 3 + 1] = c * (0.95 + r() * 0.04);
    colors[i * 3 + 2] = c * 0.9;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function rockVariant(i: number): THREE.BufferGeometry {
  if (!variants.length) for (let k = 0; k < 5; k++) variants.push(rockGeometry(k + 1));
  return variants[((i % variants.length) + variants.length) % variants.length];
}

export interface RockSpot {
  x: number;
  y: number;
  z: number;
  size: number;
  rot: number;
  seed: string;
}

/** One instanced mesh per rock shape. */
export function rockField(spots: RockSpot[], name = 'rocks'): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  if (!spots.length) return group;
  const buckets: RockSpot[][] = [[], [], [], [], []];
  spots.forEach((s) => buckets[Math.floor(rng(s.seed)() * 5)].push(s));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3();
  buckets.forEach((list, vi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(rockVariant(vi), rockMaterial(), list.length);
    im.castShadow = true;
    im.receiveShadow = true;
    list.forEach((s, i) => {
      const r = rng(s.seed);
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, s.rot, (r() - 0.5) * 0.3));
      sc.set(s.size * (0.8 + r() * 0.4), s.size * (0.7 + r() * 0.5), s.size * (0.8 + r() * 0.4));
      t.set(s.x, s.y, s.z);
      m.compose(t, q, sc);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  });
  return group;
}
