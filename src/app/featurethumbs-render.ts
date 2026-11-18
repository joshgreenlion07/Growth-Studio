// Draws one small picture of a catalog feature with the app's own feature builder. Loaded on demand by
// featurethumbs.ts. Nothing here ships as an image file: each picture is rendered at runtime from the same procedural
// geometry as the 3D view. Textures painted in the background may not be ready for the first picture.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FeatureGroup, FeatureSpec } from '../siteplan/catalog';
import { buildFeatures, setFlames } from '../builder/features';

const SIZE = 176;
const SKY = '#dfe5da';
const GROUND = '#b9b4a9';

/** A height guess per group, used when the built object has no size. */
const HEIGHT_GUESS: Record<FeatureGroup, number> = {
  Shade: 3, Kitchens: 1.1, Fire: 0.8, Water: 2, 'Spa and sauna': 2, Accents: 1, Lighting: 1, Furniture: 1,
};

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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1 }));
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  scene.add(ground);
  return { renderer, scene, sun, camera: new THREE.PerspectiveCamera(30, 1, 0.05, 300) };
}

/** A rendered picture of the feature, as a JPEG data URL. */
export function renderFeatureThumb(spec: FeatureSpec): string {
  rig ??= makeRig();
  const { renderer, scene, sun, camera } = rig;
  const fb = buildFeatures([{ id: `thumb-${spec.id}`, catalogId: spec.id, position: [0, 0], rotationDeg: 0 }], () => 0);
  try {
    setFlames(fb, 0);
    fb.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(fb.object);

    // Frame the built object's box; fall back to the footprint and a height guess by group.
    const bb = new THREE.Box3().setFromObject(fb.object);
    const [fw, fd] = spec.footprint;
    const ok = !bb.isEmpty() && Number.isFinite(bb.max.y);
    const center = ok ? bb.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, HEIGHT_GUESS[spec.group] / 2, 0);
    const size = ok ? bb.getSize(new THREE.Vector3()) : new THREE.Vector3(fw, HEIGHT_GUESS[spec.group], fd);
    // Very thin or tiny things (lights, cups, trellis cables) still get a readable frame.
    const radius = Math.max(spec.fixture ? 0.07 : 0.35, 0.5 * Math.hypot(size.x, size.y, size.z));
    const look = new THREE.Vector3(center.x, Math.max(center.y, size.y * 0.42), center.z);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.95;
    camera.position.copy(look).addScaledVector(new THREE.Vector3(0.75, 0.6, 1.1).normalize(), dist);
    camera.lookAt(look);
    camera.near = Math.max(0.02, dist * 0.02);
    camera.far = dist * 20 + 100;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(SKY, dist * 2.5, dist * 9);

    const s = radius * 1.6 + 0.5;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -s;
    sc.right = sc.top = s;
    sc.near = 0.5;
    sc.far = s * 8 + 40;
    sun.target.position.copy(center);
    sun.position.set(center.x + s * 0.9 + 3, s * 1.6 + 6, center.z + s * 0.6 + 2);
    sun.target.updateMatrixWorld();
    sc.updateProjectionMatrix();

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.88);
  } finally {
    scene.remove(fb.object);
    fb.dispose();
  }
}

/** Free the extra WebGL context once the queue is empty. */
export function releaseFeatureThumbRenderer() {
  if (!rig) return;
  rig.renderer.dispose();
  rig.renderer.forceContextLoss();
  rig = null;
}
