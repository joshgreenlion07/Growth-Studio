// Draws the material panel's picture of a bulk bed fill (bark, mulch, soil, gravel, rock): about two cubic yards of it
// just poured from a truck onto a driveway, in the fill's own 3D look (its painted ground texture and, for loose stone
// and chips, the pieces themselves). Loaded on demand by swatches.ts. Nothing ships as an image file.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MaterialSpec } from '../siteplan/catalog';
import type { Vec2 } from '../siteplan/types';
import { materialTextures } from '../engine/surfaces';
import { onTexturesChanged, wantForSwatch } from '../engine/texture-jobs';
import { vnoise } from '../engine/noise';
import { buildPebbles } from '../builder/pebbles';
import type { GroundModel } from '../builder/ground';
import type { SitePlan } from '../siteplan/types';

export const PILE_W = 1200;
export const PILE_H = 900;
const SKY = '#dfe3dc';
const DRIVE = '#8f8b83';

/*
 * The pile: two cubic yards (1.53 m3) poured in one load is a rounded heap about 2.7 m across and 0.85 m high (a cone of
 * that volume at the fill's angle of repose), a little long in the direction the truck pulled away, with slumps and a
 * spilled toe. Heights in meters at a point, in the pile's own frame (center at the origin).
 */
const R0 = 1.25, H0 = 0.95;
function outline(a: number): number {
  return R0 * (1 + 0.1 * Math.cos(a) + 0.06 * Math.cos(2 * a + 0.7) + 0.08 * (vnoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 1e6, 5) - 0.5));
}
function pileHeight(x: number, z: number): number {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const t = r / outline(a);
  if (t >= 1.07) return 0;
  // A rounded heap: a soft crown, steep flanks, and a spilled toe.
  const core = t < 1 ? (1 - t ** 1.8) ** 1.15 : 0;
  const toe = Math.max(0, 1 - Math.abs(t - 1) / 0.07) * 0.03;
  // Slumps where the load slid, and small lumps a hand across (soil and bark lie lumpy, not smooth).
  const slump = (vnoise(x * 2.2 + 11, z * 2.2 + 5, 1e6, 7) - 0.5) * 0.12 + (vnoise(x * 6 + 3, z * 6 + 9, 1e6, 8) - 0.5) * 0.05;
  const lumps = (vnoise(x * 16 + 1, z * 16 + 2, 1e6, 9) - 0.5) * 0.02 + (vnoise(x * 34 + 4, z * 34 + 6, 1e6, 10) - 0.5) * 0.008;
  return Math.max(0, H0 * core * (1 + slump) + toe + lumps * Math.min(1, core * 4));
}

function pileGeometry(tile: number): THREE.BufferGeometry {
  // A polar grid over the pile's own footprint (out to its toe), finer toward the rim where the flanks curve.
  const rings = 120, segs = 220;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pos.push(0, pileHeight(0, 0), 0);
  uv.push(0, 0);
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const r = outline(a) * 1.07 * (i / rings) ** 0.9;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      // A hair above the drive, and just below it at the rim, so the pile meets it without a seam or flicker.
      pos.push(x, i === rings ? -0.01 : pileHeight(x, z) + 0.004, z);
      uv.push(x / tile, z / tile);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The fill's average color as photographed (sRGB hex): what the picture's pile is matched to. */
function photoMean(spec: MaterialSpec): [number, number, number] {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const parts: { c: string; share: number }[] = spec.pebble?.colors ?? (spec.crumb ? [{ c: spec.crumb.mean, share: 1 }] : spec.palette.map((c) => ({ c, share: 1 })));
  const tot = parts.reduce((s, x) => s + x.share, 0);
  return [0, 1, 2].map((k) => parts.reduce((s, x) => s + (x.share / tot) * lin(parseInt(x.c.slice(1 + 2 * k, 3 + 2 * k), 16) / 255), 0)) as [number, number, number];
}

/** Resolves once every map of the set is painted (a stand-in carries `userData.flat`), or after 20 s. */
function painted(sets: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }[]): Promise<void> {
  const ready = () => sets.every((s) => !s.map.userData.flat && !s.normalMap.userData.flat && !s.roughnessMap.userData.flat);
  return new Promise((res) => {
    if (ready()) return res();
    const timer = window.setTimeout(() => { off(); res(); }, 20000);
    const off = onTexturesChanged(() => {
      if (!ready()) return;
      clearTimeout(timer);
      off();
      res();
    });
  });
}

/** A picture of two yards of this bed fill, poured on a driveway, as a JPEG data URL (PILE_W x PILE_H). */
export async function renderPile(spec: MaterialSpec): Promise<string> {
  const set = materialTextures(spec);
  wantForSwatch(set);
  await painted([set]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(PILE_W, PILE_H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xeef4ff, 0x6b6a4e, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
    sun.position.set(3.5, 6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.015;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -3.2;
    sc.right = sc.top = 3.2;
    sc.near = 0.5;
    sc.far = 20;
    scene.add(sun, sun.target);
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: DRIVE, roughness: 0.95 }));
    drive.receiveShadow = true;
    scene.add(drive);

    const mat = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
    const pile = new THREE.Mesh(pileGeometry(set.tileMeters), mat);
    pile.castShadow = pile.receiveShadow = true;
    scene.add(pile);

    // Loose stone and chips: the pieces themselves, poured over the heap.
    const camera = new THREE.PerspectiveCamera(34, PILE_W / PILE_H, 0.05, 100);
    camera.position.set(2.9, 2.05, 3.55);
    camera.lookAt(0, 0.28, 0);
    let pieces: ReturnType<typeof buildPebbles> | null = null;
    if (spec.pebble) {
      const ring: Vec2[] = Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2, r = outline(a) * 1.1;
        return [r * Math.cos(a), r * Math.sin(a)] as Vec2;
      });
      const none = { schemaVersion: 1, site: { name: 'pile', boundary: [], latitude: 0, longitude: 0, northAngleDeg: 0 }, structures: [], zones: [], lines: [], water: [], plants: [], features: [] } as unknown as SitePlan;
      pieces = buildPebbles(none, {} as GroundModel, 'max', [{ id: `pile:${spec.id}`, catalogId: spec.id, polygon: ring, holes: [], y: 0, heightAt: ([x, z]) => pileHeight(x, z) }]);
      if (pieces.object) {
        pieces.object.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
        scene.add(pieces.object);
        pieces.update(camera);
      }
    }

    renderer.render(scene, camera);
    const shot = document.createElement('canvas');
    shot.width = PILE_W;
    shot.height = PILE_H;
    const g = shot.getContext('2d')!;
    g.drawImage(renderer.domElement, 0, 0);

    // Match the pile to the fill's photographed color: a mask pass (the pile and its pieces white, all else black), the
    // pile's mean in linear light, and one gain per channel over the whole picture (the drive is a neutral backdrop).
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    drive.visible = false;
    scene.background = new THREE.Color(0x000000);
    scene.overrideMaterial = white;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera);
    const mask = document.createElement('canvas');
    mask.width = PILE_W;
    mask.height = PILE_H;
    const mg = mask.getContext('2d')!;
    mg.drawImage(renderer.domElement, 0, 0);
    white.dispose();
    const img = g.getImageData(0, 0, PILE_W, PILE_H), m = mg.getImageData(0, 0, PILE_W, PILE_H).data, d = img.data;
    const toLin = new Float32Array(256).map((_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (m[i] < 200) continue;
      sum[0] += toLin[d[i]];
      sum[1] += toLin[d[i + 1]];
      sum[2] += toLin[d[i + 2]];
      n++;
    }
    if (n > 1000) {
      const want = photoMean(spec);
      const gain = want.map((w, k) => Math.min(2.5, Math.max(0.4, w / Math.max(1e-4, sum[k] / n))));
      const lut = [0, 1, 2].map((k) => Uint8ClampedArray.from({ length: 256 }, (_, i) => {
        const v = Math.min(1, toLin[i] * gain[k]);
        return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
      }));
      // Only the pile and its pieces take the gain (blended by the mask's soft edge): the drive and sky stay neutral.
      for (let i = 0; i < d.length; i += 4) {
        const w = m[i] / 255;
        if (w <= 0) continue;
        d[i] = d[i] + (lut[0][d[i]] - d[i]) * w;
        d[i + 1] = d[i + 1] + (lut[1][d[i + 1]] - d[i + 1]) * w;
        d[i + 2] = d[i + 2] + (lut[2][d[i + 2]] - d[i + 2]) * w;
      }
      g.putImageData(img, 0, 0);
    }
    pieces?.dispose();
    pile.geometry.dispose();
    mat.dispose();
    return shot.toDataURL('image/jpeg', 0.9);
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
