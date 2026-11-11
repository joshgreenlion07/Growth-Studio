import * as THREE from 'three';
import { materialById } from '../siteplan/catalog';
import { paint, textureSet, type PBRSet } from '../engine/textures';
import { fbm, vnoise } from '../engine/noise';

/** Standard materials whose textures are scaled in meters (UVs in meters). */

const cache = new Map<string, THREE.MeshStandardMaterial>();

function scaled(t: THREE.Texture, tile: number) {
  const c = t.clone();
  c.repeat.set(1 / tile, 1 / tile);
  c.needsUpdate = true;
  return c;
}

export function pbrMaterial(key: string, set: PBRSet, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    map: scaled(set.map, set.tileMeters),
    normalMap: scaled(set.normalMap, set.tileMeters),
    roughnessMap: scaled(set.roughnessMap, set.tileMeters),
    roughness: 1,
    metalness: 0,
    ...extra,
  });
  cache.set(key, m);
  return m;
}

export function catalogMaterial(id: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const spec = materialById.get(id) ?? materialById.get('concrete-broom')!;
  return pbrMaterial(`cat:${spec.id}:${JSON.stringify(extra)}`, matSet(spec.id), extra);
}

import { materialTextures } from '../engine/surfaces';
function matSet(id: string) {
  return materialTextures(materialById.get(id)!);
}

export function rockSet(): PBRSet {
  return textureSet('rock', () =>
    paint(512, 1.2, 9, (u, v) => {
      const n = fbm(u, v, 6, 6, 41);
      const speck = vnoise(u * 300, v * 300, 300, 2);
      const vein = Math.abs(fbm(u, v, 3, 4, 7) - 0.5) < 0.02 ? 1 : 0;
      // Weathered granite boulder: warm tan-gray with dark lichen patches.
      const lichen = fbm(u, v, 4, 4, 12) > 0.62 ? 1 : 0;
      const base: [number, number, number] = [0.44 + n * 0.1, 0.4 + n * 0.09, 0.35 + n * 0.08];
      const k = (0.8 + speck * 0.28 - vein * 0.15) * (lichen ? 0.62 : 1);
      return { h: n * 0.8 + speck * 0.2, c: [base[0] * k, base[1] * k, base[2] * k], r: 0.75 + speck * 0.15 };
    }),
  );
}

export function rockMaterial(): THREE.MeshStandardMaterial {
  return pbrMaterial('rock', rockSet(), { vertexColors: true });
}

export function plainMaterial(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  let m = cache.get(`plain:${key}`);
  if (!m) {
    m = new THREE.MeshStandardMaterial(params);
    cache.set(`plain:${key}`, m);
  }
  return m;
}

/** Box-mapped UVs in meters from local position and normal. */
export function boxUV(geo: THREE.BufferGeometry) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.6) {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getZ(i);
    } else if (nx > 0.6) {
      uv[i * 2] = p.getZ(i);
      uv[i * 2 + 1] = p.getY(i);
    } else {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getY(i);
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** A box from a to b (plan points) with thickness and height, UVs in meters. */
export function segmentBox(a: [number, number], b: [number, number], thick: number, y0: number, y1: number, extend = 0): THREE.BufferGeometry {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) + extend * 2;
  const g = new THREE.BoxGeometry(len, y1 - y0, thick);
  g.translate(0, (y1 - y0) / 2, 0);
  boxUV(g);
  const m = new THREE.Matrix4().makeRotationY(-Math.atan2(dz, dx));
  m.setPosition((a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2);
  g.applyMatrix4(m);
  return g;
}

export function disposeMaterialCache() {
  for (const m of cache.values()) {
    m.map?.dispose();
    m.normalMap?.dispose();
    m.roughnessMap?.dispose();
    m.dispose();
  }
  cache.clear();
}
