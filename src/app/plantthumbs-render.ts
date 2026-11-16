// Draws one small picture of a catalog plant with the app's own plant builder.
// Loaded on demand by plantthumbs.ts. Nothing here ships as an image file: each
// picture is rendered at runtime from the same procedural geometry as the 3D view.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PlantSpec } from '../siteplan/catalog';
import { buildPlants, GLOBAL } from '../builder/plants';

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

/** A rendered picture of the plant at roughly mature size, as a JPEG data URL. */
export function renderThumb(spec: PlantSpec): string {
  rig ??= makeRig();
  const { renderer, scene, sun, camera } = rig;
  // The foliage shader reads these shared values; put them back exactly as the 3D view had them.
  const saved = { dir: GLOBAL.uSunDir.value.clone(), color: GLOBAL.uSunColor.value.clone(), wind: GLOBAL.uWind.value, time: GLOBAL.uTime.value };
  const layer = buildPlants([{ id: `thumb-${spec.id}`, catalogId: spec.id, position: [0, 0] }], () => 0, true);
  try {
    GLOBAL.uSunDir.value.set(6, 10, 4).normalize();
    GLOBAL.uSunColor.value.set(1, 0.95, 0.86).multiplyScalar(0.8);
    GLOBAL.uWind.value = 0;
    GLOBAL.uTime.value = 0;
    layer.setYears(spec.yearsToMature);
    scene.add(layer.object);

    const h = spec.matureHeight, w = spec.matureSpread;
    const r = Math.max(h * 0.6, w * 0.55);
    camera.position.set(0, h * 0.45, 0).addScaledVector(new THREE.Vector3(1, 0.5, 1.1).normalize(), (r / Math.sin(THREE.MathUtils.degToRad(15))) * 0.92);
    camera.lookAt(0, h * 0.42, 0);
    const cd = camera.position.length();
    camera.near = Math.max(0.02, cd * 0.02);
    camera.far = cd * 20 + 100;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(SKY, cd * 2.5, cd * 9);

    const s = Math.max(h, w) * 1.2 + 0.5;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -s;
    sc.right = sc.top = s;
    sc.near = 0.5;
    sc.far = 40;
    sun.position.set(s * 0.9 + 3, s * 1.6 + 6, s * 0.6 + 2);
    sc.updateProjectionMatrix();

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.88);
  } finally {
    scene.remove(layer.object);
    layer.dispose();
    GLOBAL.uSunDir.value.copy(saved.dir);
    GLOBAL.uSunColor.value.copy(saved.color);
    GLOBAL.uWind.value = saved.wind;
    GLOBAL.uTime.value = saved.time;
  }
}

/** Free the extra WebGL context once the queue is empty. */
export function releaseThumbRenderer() {
  if (!rig) return;
  rig.renderer.dispose();
  rig.renderer.forceContextLoss();
  rig = null;
}
