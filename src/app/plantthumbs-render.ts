// Draws one small picture of a catalog plant with the app's own plant builder.
// Loaded on demand by plantthumbs.ts. Nothing here ships as an image file: each
// picture is rendered at runtime from the same procedural geometry as the 3D view.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlantSpec } from '../siteplan/catalog';
import { buildPlants, GLOBAL } from '../builder/plants';
import { onTexturesChanged } from '../engine/texture-jobs';

const SIZE = 176;
const SKY = '#dfe5da';
const MULCH = '#6b5a48';

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  camera: THREE.PerspectiveCamera;
}
let rig: Rig | null = null;

function makeRig(): Rig {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x6b6a4e, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: MULCH, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  return { renderer, scene, sun, camera: new THREE.PerspectiveCamera(30, 1, 0.05, 200) };
}

/**
 * A rendered picture of the plant at roughly mature size, as a JPEG data URL: the small square picture for the plant
 * lists by default, or `w` x `h` (the material panel's large 4:3 picture).
 */
export async function renderThumb(spec: PlantSpec, w = SIZE, h = SIZE): Promise<string> {
  const layer = buildPlants([{ id: `thumb-${spec.id}`, catalogId: spec.id, position: [0, 0] }], () => 0, true);
  // Leaves, flowers and bark are painted in the texture worker: drawn before they arrive, a plant shows bare stalks.
  await texturesReady(layer.object);
  rig ??= makeRig();
  const { renderer, scene, sun, camera } = rig;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // The foliage shader reads these shared values; put them back exactly as the 3D view had them.
  const saved = { dir: GLOBAL.uSunDir.value.clone(), color: GLOBAL.uSunColor.value.clone(), wind: GLOBAL.uWind.value, time: GLOBAL.uTime.value };
  try {
    GLOBAL.uSunDir.value.set(6, 10, 4).normalize();
    GLOBAL.uSunColor.value.set(1, 0.95, 0.86).multiplyScalar(0.8);
    GLOBAL.uWind.value = 0;
    GLOBAL.uTime.value = 0;
    layer.setYears(spec.yearsToMature);
    scene.add(layer.object);

    const ph = spec.matureHeight, pw = spec.matureSpread;
    const r = Math.max(ph * 0.6, pw * 0.55);
    camera.position.set(0, ph * 0.45, 0).addScaledVector(new THREE.Vector3(1, 0.5, 1.1).normalize(), (r / Math.sin(THREE.MathUtils.degToRad(15))) * 0.92);
    camera.lookAt(0, ph * 0.42, 0);
    const cd = camera.position.length();
    camera.near = Math.max(0.02, cd * 0.02);
    camera.far = cd * 20 + 100;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(SKY, cd * 2.5, cd * 9);

    const s = Math.max(ph, pw) * 1.2 + 0.5;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -s;
    sc.right = sc.top = s;
    sc.near = 0.5;
    sc.far = 40;
    sun.position.set(s * 0.9 + 3, s * 1.6 + 6, s * 0.6 + 2);
    sc.updateProjectionMatrix();

    // Large pictures get a finer shadow map, so the leaves' shade stays crisp at panel size.
    const big = Math.max(w, h) > 400;
    if (sun.shadow.mapSize.x !== (big ? 4096 : 2048)) {
      sun.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', big ? 0.9 : 0.88);
  } finally {
    scene.remove(layer.object);
    layer.dispose();
    GLOBAL.uSunDir.value.copy(saved.dir);
    GLOBAL.uSunColor.value.copy(saved.color);
    GLOBAL.uWind.value = saved.wind;
    GLOBAL.uTime.value = saved.time;
  }
}

/** Resolves once no material under `root` still wears a stand-in map (`userData.flat`), or after 8 s. */
function texturesReady(root: THREE.Object3D): Promise<void> {
  const maps = new Set<THREE.Texture>();
  root.traverse((o) => {
    const ms = (o as THREE.Mesh).material;
    for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) {
      for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap'] as const) {
        const t = (m as THREE.MeshStandardMaterial)[k];
        if (t) maps.add(t);
      }
      // The foliage shader keeps its leaf and flower atlases among its uniforms.
      for (const u of Object.values((m as THREE.ShaderMaterial).uniforms ?? {})) if ((u as { value?: unknown })?.value instanceof THREE.Texture) maps.add((u as { value: THREE.Texture }).value);
      const extra = (m as { userData?: { shader?: { uniforms?: Record<string, { value?: unknown }> } } }).userData?.shader?.uniforms;
      for (const u of Object.values(extra ?? {})) if (u?.value instanceof THREE.Texture) maps.add(u.value);
    }
  });
  const ready = () => [...maps].every((t) => !t.userData.flat);
  if (ready()) return Promise.resolve();
  return new Promise((res) => {
    const timer = window.setTimeout(() => { off(); res(); }, 8000);
    const off = onTexturesChanged(() => {
      if (!ready()) return;
      clearTimeout(timer);
      off();
      res();
    });
  });
}

/** Free the extra WebGL context once the queue is empty. */
export function releaseThumbRenderer() {
  if (!rig) return;
  rig.renderer.dispose();
  rig.renderer.forceContextLoss();
  rig = null;
}
