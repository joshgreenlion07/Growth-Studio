import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bounds } from '../siteplan/geometry';
import type { ModelPlacement, Vec2 } from '../siteplan/types';

/**
 * Uploaded models: a designer's own rendering of a feature (a water wall, a
 * rock waterfall) placed on a footprint drawn in the plan.
 *
 * The file itself never travels inside the SitePlan. A placement names an
 * asset by id, and the asset (a .glb model, or a picture shown as a standing
 * board) is handed to `ModelAssets` separately. Until it arrives, the
 * footprint shows as a plain block.
 */

export type AssetKind = 'glb' | 'image';

interface LoadedAsset {
  kind: AssetKind;
  /** glb: the model, moved so it stands on y = 0 and is centered on x and z. */
  object?: THREE.Object3D;
  /** glb: its size before any scaling. */
  size?: THREE.Vector3;
  /** image: the picture and its width divided by its height. */
  texture?: THREE.Texture;
  aspect?: number;
  dispose(): void;
}

/** The uploaded files that have been read so far, by asset id. */
export class ModelAssets {
  private map = new Map<string, LoadedAsset>();

  has(id: string) {
    return this.map.has(id);
  }

  get(id: string) {
    return this.map.get(id);
  }

  /** Read a file. Rejects with a plain reason when the file cannot be used. */
  async add(id: string, kind: AssetKind, data: Blob): Promise<void> {
    const next = kind === 'glb' ? await readGlb(data) : await readImage(data);
    this.map.get(id)?.dispose();
    this.map.set(id, next);
  }

  /** Forget every file the current plan no longer uses. */
  prune(keep: Set<string>) {
    for (const [id, a] of this.map) {
      if (keep.has(id)) continue;
      a.dispose();
      this.map.delete(id);
    }
  }

  dispose() {
    this.prune(new Set());
  }
}

const OUTSIDE_FILE = 'This 3D file points to other files or web addresses. Export it again as a single self-contained .glb.';

/** The glTF JSON of a .glb (or a .gltf text file), or null when it is neither. */
function gltfJson(buf: ArrayBuffer): unknown {
  const dv = new DataView(buf);
  let text: string;
  if (buf.byteLength >= 20 && dv.getUint32(0, true) === 0x46546c67) {
    // GLB: 12-byte header, then the JSON chunk (length, type 'JSON', bytes).
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > buf.byteLength) return null;
    text = new TextDecoder().decode(new Uint8Array(buf, 20, len));
  } else {
    text = new TextDecoder().decode(buf);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every `uri` in the file must be embedded data; anything else would make the browser fetch it. */
function onlyEmbedded(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(onlyEmbedded);
  if (!node || typeof node !== 'object') return true;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'uri' && (typeof v !== 'string' || !/^data:/i.test(v))) return false;
    if (typeof v === 'object' && !onlyEmbedded(v)) return false;
  }
  return true;
}

async function readGlb(data: Blob): Promise<LoadedAsset> {
  let scene: THREE.Object3D;
  const buf = await data.arrayBuffer();
  const json = gltfJson(buf);
  if (json && !onlyEmbedded(json)) throw new Error(OUTSIDE_FILE);
  // Second line of defence: the loader itself may only read the file's own data
  // (data: URIs, and the blob: URLs it makes for embedded pictures).
  let blocked = false;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    blocked = true;
    return 'data:,';
  });
  try {
    const gltf = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, '');
    if (blocked) throw new Error(OUTSIDE_FILE);
    scene = gltf.scene;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (blocked || why === OUTSIDE_FILE) throw new Error(OUTSIDE_FILE);
    if (/draco/i.test(why)) throw new Error('This 3D file uses Draco compression. Export it again as a plain .glb.');
    throw new Error('This file could not be read as a .glb 3D model.');
  }
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error('This 3D file has nothing in it to show.');
  const c = box.getCenter(new THREE.Vector3());
  scene.position.set(-c.x, -box.min.y, -c.z);
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const object = new THREE.Group();
  object.add(scene);
  return {
    kind: 'glb',
    object,
    size,
    dispose() {
      const seen = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (seen.has(mat)) continue;
          seen.add(mat);
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
    },
  };
}

async function readImage(data: Blob): Promise<LoadedAsset> {
  const url = URL.createObjectURL(data);
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const img = texture.image as { width: number; height: number };
    if (!(img.width > 0 && img.height > 0)) throw new Error('empty');
    return { kind: 'image', texture, aspect: img.width / img.height, dispose: () => texture.dispose() };
  } catch {
    throw new Error('This picture could not be read. Use a PNG, JPG or WebP file.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface FootprintBox {
  center: Vec2;
  /** The long side and the short side, in meters. */
  w: number;
  d: number;
  /** Plan direction the front faces (unit vector). The long side runs across it. */
  front: Vec2;
}

/**
 * The box a drawn footprint sits in. A shape with few corners (a box drawn at
 * an angle) gets the tightest box along one of its own edges. Round and
 * free-drawn shapes get the box square to the plan. The front is the long
 * side that faces down the page, toward the first camera.
 */
export function footprintBox(poly: Vec2[]): FootprintBox {
  const fit = (a: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of poly) {
      const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    return { a, w: u1 - u0, d: v1 - v0, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
  };
  let best = fit(0);
  if (poly.length <= 12) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue;
      const f = fit(Math.atan2(q[1] - p[1], q[0] - p[0]));
      if (f.w * f.d < best.w * best.d * 0.98) best = f;
    }
  }
  const c = Math.cos(best.a), s = Math.sin(best.a);
  const center: Vec2 = [best.cu * c - best.cv * s, best.cu * s + best.cv * c];
  // the long side is the width; the front is square to it
  let w = best.w, d = best.d, front: Vec2 = [-s, c];
  if (d > w * 1.001) {
    w = best.d; d = best.w; front = [c, s];
  }
  if (front[1] < -1e-6 || (Math.abs(front[1]) <= 1e-6 && front[0] < 0)) front = [-front[0], -front[1]];
  return { center, w, d, front };
}

export interface ModelBuild {
  object: THREE.Group;
  surfaces: THREE.Object3D[];
  /** Asset ids the plan uses that have not been handed over yet. */
  missing: string[];
  dispose(): void;
}

export function buildModels(models: ModelPlacement[], height: (p: Vec2) => number, assets: ModelAssets | null): ModelBuild {
  const object = new THREE.Group();
  object.name = 'models';
  const surfaces: THREE.Object3D[] = [];
  const missing = new Set<string>();
  const owned: { dispose(): void }[] = [];

  for (const m of models) {
    const box = footprintBox(m.polygon);
    const odd = m.turn % 2 === 1;
    // the model's own width and depth, after quarter turns
    const mw = odd ? box.d : box.w, md = odd ? box.w : box.d;
    const g = new THREE.Group();
    g.userData.itemId = m.id;
    g.position.set(box.center[0], height(box.center), box.center[1]);
    // a model's front is its +z side; turn it to face the footprint's front, plus the quarter turns
    g.rotation.y = Math.atan2(box.front[0], box.front[1]) + (m.turn * Math.PI) / 2;

    const asset = assets?.get(m.asset);
    if (asset?.kind === 'glb' && asset.object && asset.size) {
      const sx = mw / asset.size.x, sz = md / asset.size.z, sy = m.height ? m.height / asset.size.y : 0;
      const inner = asset.object.clone(true);
      if (m.fit === 'stretch') inner.scale.set(sx, sy || (sx + sz) / 2, sz);
      else inner.scale.setScalar(Math.min(sx, sz, sy || Infinity));
      g.add(inner);
    } else if (asset?.kind === 'image' && asset.texture && asset.aspect) {
      const h = m.height ?? Math.min(mw / asset.aspect, 6);
      const geo = new THREE.PlaneGeometry(mw, h);
      const mat = new THREE.MeshStandardMaterial({ map: asset.texture, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.95, metalness: 0 });
      const board = new THREE.Mesh(geo, mat);
      board.position.y = h / 2;
      board.castShadow = true;
      g.add(board);
      owned.push(geo, mat);
    } else {
      // not handed over yet: a plain block marks the spot
      missing.add(m.asset);
      const h = m.height ?? 0.4;
      const geo = new THREE.BoxGeometry(mw, h, md);
      const mat = new THREE.MeshStandardMaterial({ color: '#b9b4a8', roughness: 0.9, metalness: 0 });
      const block = new THREE.Mesh(geo, mat);
      block.position.y = h / 2;
      block.castShadow = true;
      block.receiveShadow = true;
      g.add(block);
      owned.push(geo, mat);
    }
    object.add(g);
    surfaces.push(g);
  }

  return {
    object,
    surfaces,
    missing: [...missing],
    // models share their geometry and materials with ModelAssets, which outlives a rebuild
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

/** Every point of every model footprint, for framing the camera. */
export const modelPoints = (models: ModelPlacement[] | undefined): Vec2[] => (models ?? []).flatMap((m) => m.polygon);

/** Rough height of a placed model, for framing. */
export function modelHeight(m: ModelPlacement): number {
  const b = bounds(m.polygon);
  return m.height ?? Math.max(0.6, Math.min(3, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.5));
}
