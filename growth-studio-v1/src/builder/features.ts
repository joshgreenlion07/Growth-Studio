import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { featureById, type FeatureKind } from '../siteplan/catalog';
import { rng } from '../siteplan/geometry';
import type { FeaturePlacement, Vec2 } from '../siteplan/types';
import { GLOBAL } from '../engine/foliage';
import { cortenSet, porcelainPanelSet } from '../engine/surfaces';
import { fallMaterial } from '../engine/water';
import { boxUV, catalogMaterial, pbrMaterial, plainMaterial } from './materials';
import { rockField, type RockSpot } from './rocks';

/**
 * Every placeable feature: fire, shade, kitchens, spas, saunas, water walls,
 * planters, screens, lighting and furniture. Built in local space with the
 * front facing +z, then placed and rotated from the SitePlan.
 */

export interface NightLight {
  position: THREE.Vector3;
  color: string;
  intensity: number;
  distance: number;
  flicker: boolean;
}

export interface FeatureBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  lights: NightLight[];
  /** Emissive parts that glow at night. */
  glow: THREE.MeshStandardMaterial[];
  flames: THREE.Mesh[];
  fallMats: THREE.ShaderMaterial[];
  dispose(): void;
}

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 20): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uOn: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOn; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        float t = uTime * 2.2;
        float w = n(vec2(uv.x * 9.0, uv.y * 3.0 - t)) * 0.6 + n(vec2(uv.x * 19.0, uv.y * 7.0 - t * 1.7)) * 0.4;
        float lick = 0.5 + 0.5 * sin(uv.x * 40.0 + t * 3.0);
        float f = clamp((1.0 - uv.y * 1.25) * (0.7 + lick * 0.3) + (w - 0.5) * 0.9, 0.0, 1.0);
        f *= smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x);
        vec3 c = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.78, 0.35), f);
        gl_FragColor = vec4(c * f * 5.0 * uOn, 1.0);
      }`,
  });
}

export function buildFeatures(features: FeaturePlacement[], height: (p: Vec2) => number): FeatureBuild {
  const group = new THREE.Group();
  group.name = 'features';
  const surfaces: THREE.Mesh[] = [];
  const lights: NightLight[] = [];
  const flames: THREE.Mesh[] = [];
  const fallMats: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const rocks: RockSpot[] = [];
  const owned: THREE.Material[] = [];

  // Shared materials.
  const mat = {
    cedar: catalogMaterial('wood-deck', { color: new THREE.Color('#ecdccb') }),
    teak: plainMaterial('teak', { color: '#a88765', roughness: 0.75 }),
    stone: catalogMaterial('wall-gray-block'),
    stacked: catalogMaterial('wall-stacked-stone'),
    ledge: catalogMaterial('wall-ledgestone'),
    darkLedge: catalogMaterial('wall-dark-stacked'),
    plaster: catalogMaterial('wall-plaster'),
    stucco: catalogMaterial('wall-stucco'),
    granite: plainMaterial('granite', { color: '#3a3532', roughness: 0.25, metalness: 0.05 }),
    graniteLight: plainMaterial('granite-light', { color: '#8a7f73', roughness: 0.3 }),
    steel: plainMaterial('stainless', { color: '#c4c8cc', roughness: 0.22, metalness: 0.95 }),
    black: plainMaterial('powder-black', { color: '#1d1d1e', roughness: 0.45, metalness: 0.5 }),
    alum: plainMaterial('alum-dark', { color: '#2c2d2f', roughness: 0.4, metalness: 0.6 }),
    bronze: plainMaterial('bronze', { color: '#3a2f27', roughness: 0.4, metalness: 0.75 }),
    brass: plainMaterial('brass', { color: '#8c7444', roughness: 0.35, metalness: 0.85 }),
    copper: plainMaterial('copper', { color: '#9a5a36', roughness: 0.35, metalness: 0.9 }),
    patina: plainMaterial('patina', { color: '#3f6e63', roughness: 0.55, metalness: 0.4 }),
    concrete: catalogMaterial('concrete-smooth'),
    glassFire: plainMaterial('fire-glass', { color: '#24384a', roughness: 0.1, metalness: 0.3 }),
    lava: plainMaterial('lava', { color: '#2a2422', roughness: 0.95 }),
    shell: plainMaterial('spa-shell', { color: '#d9dcdc', roughness: 0.2 }),
    spaCab: plainMaterial('spa-cabinet', { color: '#4a4542', roughness: 0.7 }),
    spaWater: plainMaterial('spa-water', { color: '#2f8aa0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }),
    saunaWood: plainMaterial('sauna-wood', { color: '#b5875c', roughness: 0.7 }),
    shingle: catalogMaterial('composite-gray', { color: new THREE.Color('#6a6a6a') }),
    glass: plainMaterial('sauna-glass', { color: '#1d2a30', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }),
    corten: pbrMaterial('corten', cortenSet()),
    porcelain: pbrMaterial('porcelainPanel', porcelainPanelSet()),
    pebble: catalogMaterial('black-pebble'),
    fabric: plainMaterial('fabric-gray', { color: '#8d8a84', roughness: 0.95 }),
    cushion: plainMaterial('cushion', { color: '#d8d2c6', roughness: 0.95 }),
    canvas: plainMaterial('umbrella', { color: '#e6dfd2', roughness: 0.9, side: THREE.DoubleSide }),
    soil: plainMaterial('planter-soil', { color: '#2b241f', roughness: 1 }),
    whiteMetal: plainMaterial('white-metal', { color: '#e9e9e6', roughness: 0.4, metalness: 0.2 }),
  };
  const lampGlow = new THREE.MeshStandardMaterial({ color: '#f3e7cf', emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, roughness: 0.4 });
  const spaGlow = new THREE.MeshStandardMaterial({ color: '#7fd0e0', emissive: new THREE.Color('#5ec8ff'), emissiveIntensity: 0, roughness: 0.1, transparent: true, opacity: 0.85 });
  owned.push(lampGlow, spaGlow);
  const flameMat = flameMaterial();
  owned.push(flameMat);
  const falls = fallMaterial();
  fallMats.push(falls);

  for (const f of features) {
    const spec = featureById.get(f.catalogId);
    if (!spec) continue;
    const o = new THREE.Group();
    const parts: Parts = new Map();
    const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
      const list = parts.get(m) ?? [];
      list.push(g.index ? g.toNonIndexed() : g);
      parts.set(m, list);
    };
    const y0 = height(f.position);
    const local = (x: number, y: number, z: number) => {
      const a = (-f.rotationDeg * Math.PI) / 180;
      return new THREE.Vector3(f.position[0] + x * Math.cos(a) + z * Math.sin(a), y0 + y, f.position[1] - x * Math.sin(a) + z * Math.cos(a));
    };
    const light = (x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker = false) =>
      lights.push({ position: local(x, y, z), color, intensity, distance, flicker });
    const flame = (w: number, h: number, x: number, y: number, z: number, ry = 0) => {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), flameMat);
      fl.position.set(x, y, z);
      fl.rotation.y = ry;
      fl.renderOrder = 3;
      geos.push(fl.geometry);
      o.add(fl);
      flames.push(fl);
    };
    const sheet = (w: number, h: number, x: number, y: number, z: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), falls);
      s.position.set(x, y, z);
      s.renderOrder = 3;
      geos.push(s.geometry);
      o.add(s);
    };
    const r = rng(f.id);
    const kind: FeatureKind = spec.kind;
    const [W, D] = spec.footprint;

    switch (kind) {
      case 'firePit': {
        const ring = new THREE.CylinderGeometry(0.62, 0.66, 0.4, 28, 1, true).translate(0, 0.2, 0);
        const inner = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 28, 1, true).translate(0, 0.2, 0);
        inner.scale(-1, 1, 1);
        const top = new THREE.RingGeometry(0.44, 0.68, 28, 1).rotateX(-Math.PI / 2).translate(0, 0.4, 0);
        for (const g of [ring, inner]) {
          const uv = g.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 0.4);
        }
        add(mat.stacked, ring);
        add(mat.stacked, inner);
        add(mat.graniteLight, top);
        add(mat.lava, cyl(0.46, 0.46, 0.18, 0, 0, 0, 24));
        for (let k = 0; k < 3; k++) flame(0.6, 0.62, 0, 0.18, 0, (k / 3) * Math.PI);
        light(0, 0.8, 0, '#ff9a4a', 9, 9, true);
        break;
      }
      case 'fireTable': {
        add(mat.alum, box(W, 0.5, D, 0, 0, 0));
        add(mat.granite, box(W + 0.04, 0.04, D + 0.04, 0, 0.5, 0));
        add(mat.glassFire, box(W * 0.62, 0.02, 0.18, 0, 0.53, 0));
        flame(W * 0.6, 0.32, 0, 0.54, 0);
        flame(W * 0.6, 0.28, 0, 0.54, 0, Math.PI / 2 - 0.0001);
        light(0, 0.75, 0, '#ff9a4a', 6, 7, true);
        break;
      }
      case 'pergolaWood': {
        const H = 2.7;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.cedar, box(0.15, H, 0.15, sx * (W / 2 - 0.15), 0, sz * (D / 2 - 0.15)));
        for (const sz of [-1, 1]) add(mat.cedar, box(W + 0.5, 0.24, 0.08, 0, H - 0.12, sz * (D / 2 - 0.15)));
        for (let x = -W / 2 - 0.1; x <= W / 2 + 0.1; x += 0.42) add(mat.cedar, box(0.06, 0.18, D + 0.5, x, H + 0.12, 0));
        for (let z = -D / 2; z <= D / 2; z += 0.3) add(mat.cedar, box(W + 0.3, 0.05, 0.05, 0, H + 0.3, z));
        break;
      }
      case 'pergolaLouvered': {
        const H = 2.75;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.alum, box(0.18, H, 0.18, sx * (W / 2 - 0.09), 0, sz * (D / 2 - 0.09)));
        for (const sz of [-1, 1]) add(mat.alum, box(W, 0.26, 0.12, 0, H, sz * (D / 2 - 0.06)));
        for (const sx of [-1, 1]) add(mat.alum, box(0.12, 0.26, D, sx * (W / 2 - 0.06), H, 0));
        // Louvers, tilted half open.
        for (let x = -W / 2 + 0.2; x < W / 2 - 0.1; x += 0.2) {
          const g = new THREE.BoxGeometry(0.17, 0.02, D - 0.24);
          g.rotateZ(0.6);
          g.translate(x, H + 0.15, 0);
          add(mat.alum, g.toNonIndexed());
        }
        light(0, H - 0.1, 0, '#ffd1a0', 2.5, 6);
        break;
      }
      case 'gazebo': {
        const H = 2.5;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          add(mat.black, box(0.12, H, 0.12, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1)));
          add(mat.fabric, box(0.04, H - 0.2, 0.5, sx * (W / 2 - 0.12), 0.1, sz * (D / 2 - 0.4)));
        }
        add(mat.black, box(W, 0.12, D, 0, H, 0));
        const roof = new THREE.ConeGeometry(W * 0.78, 0.7, 4, 1).rotateY(Math.PI / 4).translate(0, H + 0.47, 0);
        add(mat.alum, roof.toNonIndexed());
        const cap = new THREE.ConeGeometry(W * 0.22, 0.25, 4, 1).rotateY(Math.PI / 4).translate(0, H + 0.95, 0);
        add(mat.alum, cap.toNonIndexed());
        light(0, H - 0.2, 0, '#ffd1a0', 2.2, 5);
        break;
      }
      case 'bistroSet': {
        add(mat.black, cyl(0.03, 0.03, 0.72, 0, 0, 0, 8));
        add(plainMaterial('mosaic', { color: '#c9a77d', roughness: 0.4 }), cyl(0.32, 0.32, 0.03, 0, 0.72, 0, 20));
        for (const a of [0.6, 0.6 + Math.PI]) {
          const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
          add(mat.black, box(0.4, 0.03, 0.4, x, 0.45, z));
          add(mat.black, box(0.04, 0.45, 0.04, x, 0, z));
          add(mat.black, box(0.4, 0.45, 0.03, x + Math.cos(a) * 0.2, 0.48, z + Math.sin(a) * 0.2).rotateY(0));
        }
        break;
      }
      case 'umbrella': {
        add(mat.black, cyl(0.025, 0.025, 2.4, 0, 0, 0, 8));
        add(mat.black, cyl(0.3, 0.3, 0.06, 0, 0, 0, 16));
        const cone = new THREE.ConeGeometry(W / 2, 0.55, 8, 1, true).translate(0, 2.25, 0);
        add(mat.canvas, cone.toNonIndexed());
        break;
      }
      case 'kitchenStraight':
      case 'kitchenL': {
        const depth = 0.75, Hc = 0.9;
        const runs: { x: number; z: number; w: number; d: number }[] = [{ x: 0, z: -(D - depth) / 2, w: W, d: depth }];
        if (kind === 'kitchenL') runs.push({ x: W / 2 - depth / 2, z: depth / 2 - 0.05, w: depth, d: D - depth + 0.1 });
        for (const rn of runs) {
          add(mat.stacked, box(rn.w, Hc, rn.d, rn.x, 0, rn.z));
          add(mat.granite, box(rn.w + 0.05, 0.04, rn.d + 0.05, rn.x, Hc, rn.z));
        }
        if (kind === 'kitchenL') {
          // Raised bar on the outside of the short leg.
          add(mat.stacked, box(0.22, 0.25, D - depth, W / 2 - 0.11, Hc + 0.04, depth / 2 - 0.05));
          add(mat.granite, box(0.45, 0.04, D - depth + 0.1, W / 2 + 0.06, Hc + 0.29, depth / 2 - 0.05));
        }
        const fz = -(D - depth) / 2 + depth / 2 + 0.005;
        // Grill, doors, drawers, fridge, sink.
        add(mat.steel, box(0.85, 0.2, depth * 0.85, -W * 0.18, Hc, -(D - depth) / 2));
        add(mat.steel, box(0.85, 0.03, depth * 0.6, -W * 0.18, Hc + 0.35, -(D - depth) / 2 - 0.08));
        add(mat.steel, box(0.8, 0.55, 0.02, -W * 0.18, 0.15, fz));
        add(mat.steel, box(0.55, 0.65, 0.02, W * 0.12, 0.1, fz));
        add(mat.steel, box(0.42, 0.55, 0.02, -W * 0.42, 0.15, fz));
        add(mat.steel, box(0.42, 0.15, 0.02, W * 0.36, 0.55, fz));
        add(mat.steel, box(0.42, 0.15, 0.02, W * 0.36, 0.35, fz));
        add(mat.steel, box(0.45, 0.03, 0.36, W * 0.25, Hc + 0.01, -(D - depth) / 2));
        add(mat.steel, cyl(0.012, 0.012, 0.3, W * 0.25, Hc, -(D - depth) / 2 - 0.22, 8));
        light(-W * 0.18, Hc + 0.6, -(D - depth) / 2 + 0.5, '#ffd1a0', 1.5, 4);
        break;
      }
      case 'hotTub': {
        const H = 0.92;
        add(mat.spaCab, box(W, H, D, 0, 0, 0));
        add(mat.shell, box(W + 0.04, 0.06, D + 0.04, 0, H, 0));
        const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.25, D - 0.25).rotateX(-Math.PI / 2).translate(0, H + 0.04, 0), spaGlow);
        geos.push(water.geometry);
        o.add(water);
        add(mat.shell, box(W - 0.6, 0.02, 0.35, 0, H - 0.1, D / 2 - 0.35));
        light(0, H + 0.3, 0, '#7fd8ff', 1.8, 3.5);
        break;
      }
      case 'saunaBarrel': {
        const R = W / 2, L = D;
        const barrel = new THREE.CylinderGeometry(R, R, L, 28, 1, true).rotateX(Math.PI / 2).translate(0, R + 0.12, 0);
        const uv = barrel.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * L);
        add(mat.saunaWood, barrel);
        const ends = [L / 2, -L / 2].map((z) => new THREE.CircleGeometry(R * 0.96, 28).translate(0, R + 0.12, z));
        add(mat.saunaWood, ends[1]);
        add(mat.glass, ends[0]);
        for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) add(mat.black, new THREE.TorusGeometry(R + 0.01, 0.015, 6, 32).translate(0, R + 0.12, z).toNonIndexed());
        for (const z of [-L / 2 + 0.35, L / 2 - 0.35]) add(mat.saunaWood, box(W * 0.9, 0.12, 0.12, 0, 0, z));
        add(mat.saunaWood, box(0.08, 1.7, 0.04, 0, 0.15, L / 2 + 0.01));
        light(0, 1.1, L / 2 + 0.3, '#ffcf8a', 1.4, 3);
        break;
      }
      case 'saunaCube': {
        const Hh = 2.1;
        add(mat.saunaWood, box(W - 0.16, Hh - 0.2, D - 0.16, 0, 0.1, 0));
        // Rounded black frame: four corner posts and a perimeter frame.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.black, cyl(0.1, 0.1, Hh, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1), 12));
        add(mat.black, box(W, 0.12, D, 0, Hh - 0.12, 0));
        add(mat.black, box(W, 0.1, D, 0, 0, 0));
        add(mat.shingle, box(W + 0.1, 0.06, D + 0.1, 0, Hh, 0));
        add(mat.glass, box(W - 0.3, Hh - 0.35, 0.02, 0, 0.12, D / 2 - 0.07));
        add(mat.black, box(0.04, Hh - 0.35, 0.03, 0, 0.12, D / 2 - 0.06));
        light(0, 1.2, D / 2 + 0.2, '#ffcf8a', 1.4, 3);
        break;
      }
      case 'waterWallPlaster': {
        // Two plaster columns, a split-face travertine panel with a sheer spillway,
        // copper spouts, copper bowls on top, black pebble basin with a charcoal border.
        const colW = 0.8, colH = 2.4, panelW = W - colW * 2 - 0.1;
        for (const sx of [-1, 1]) {
          add(mat.plaster, box(colW, colH, 0.7, sx * (W / 2 - colW / 2), 0, -D / 2 + 0.35));
          add(mat.patina, cyl(0.22, 0.32, 0.22, sx * (W / 2 - colW / 2), colH, -D / 2 + 0.35, 20));
          add(mat.soil, cyl(0.29, 0.29, 0.02, sx * (W / 2 - colW / 2), colH + 0.19, -D / 2 + 0.35, 16));
          add(mat.copper, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8).rotateX(Math.PI / 2).translate(sx * (panelW / 2 + 0.05), 0.9, -D / 2 + 0.78).toNonIndexed());
          sheet(0.05, 0.85, sx * (panelW / 2 + 0.05), 0.88, -D / 2 + 0.85);
        }
        add(mat.ledge, box(panelW, 2.0, 0.4, 0, 0, -D / 2 + 0.2));
        add(mat.copper, box(0.7, 0.04, 0.18, 0, 1.25, -D / 2 + 0.47));
        sheet(0.66, 1.18, 0, 1.24, -D / 2 + 0.56);
        add(mat.pebble, box(W - 0.2, 0.05, D - 0.75, 0, 0, D / 2 - (D - 0.75) / 2 - 0.1));
        for (const [w, d, x, z] of [[W, 0.15, 0, D / 2 - 0.075], [0.15, D - 0.6, -W / 2 + 0.075, 0.15], [0.15, D - 0.6, W / 2 - 0.075, 0.15]] as const) add(catalogMaterial('border-charcoal-wide'), box(w, 0.2, d, x, 0, z));
        light(0, 0.15, -D / 2 + 0.7, '#ffcf8a', 2.5, 3.5);
        break;
      }
      case 'waterWallPorcelain': {
        add(mat.alum, box(W, 1.9, 0.25, 0, 0, -D / 2 + 0.125));
        add(mat.porcelain, box(W - 0.12, 1.78, 0.02, 0, 0.06, -D / 2 + 0.26));
        add(mat.steel, box(W * 0.6, 0.03, 0.12, 0, 1.55, -D / 2 + 0.32));
        sheet(W * 0.58, 1.5, 0, 1.54, -D / 2 + 0.35);
        add(mat.pebble, box(W, 0.04, D - 0.3, 0, 0, 0.15));
        add(catalogMaterial('border-charcoal-wide'), box(W + 0.15, 0.18, 0.15, 0, 0, D / 2));
        light(0, 0.12, -D / 2 + 0.5, '#ffd8a8', 2, 3);
        break;
      }
      case 'waterWallStucco': {
        // Stucco side walls with up-down sconces, dark stacked-stone center, raised spill basin.
        const colW = 0.9, H = 2.2;
        for (const sx of [-1, 1]) {
          add(mat.stucco, box(colW, H, 0.6, sx * (W / 2 - colW / 2), 0, -D / 2 + 0.3));
          add(mat.black, cyl(0.04, 0.04, 0.32, sx * (W / 2 - colW / 2), 1.5, -D / 2 + 0.64, 10));
          light(sx * (W / 2 - colW / 2), 1.8, -D / 2 + 0.8, '#ffc27a', 1.6, 2.6);
          light(sx * (W / 2 - colW / 2), 1.3, -D / 2 + 0.8, '#ffc27a', 1.6, 2.6);
        }
        add(mat.darkLedge, box(W - colW * 2, H - 0.1, 0.4, 0, 0, -D / 2 + 0.2));
        add(mat.stucco, box(W - 0.2, 0.75, 0.55, 0, 0, -D / 2 + 0.75));
        add(mat.steel, box(0.55, 0.03, 0.1, 0, 1.4, -D / 2 + 0.44));
        sheet(0.52, 0.66, 0, 1.4, -D / 2 + 0.48);
        sheet(0.4, 0.62, 0, 0.72, -D / 2 + 1.04);
        add(mat.pebble, box(W - 0.3, 0.05, 0.5, 0, 0, D / 2 - 0.3));
        add(mat.concrete, box(W, 0.3, 0.12, 0, 0, D / 2 - 0.06));
        light(0, 0.3, -D / 2 + 1.1, '#ffcf8a', 2.4, 3);
        break;
      }
      case 'cortenScreen': {
        add(mat.corten, box(W, 1.8, 0.01, 0, 0.05, 0));
        add(mat.black, box(0.05, 1.9, 0.05, -W / 2, 0, 0));
        add(mat.black, box(0.05, 1.9, 0.05, W / 2, 0, 0));
        break;
      }
      case 'cortenPlanter': {
        add(mat.corten, box(W, 0.7, D, 0, 0, 0));
        add(mat.soil, box(W - 0.04, 0.02, D - 0.04, 0, 0.66, 0));
        break;
      }
      case 'blackPlanter': {
        add(mat.black, box(W, 0.6, D, 0, 0, 0));
        add(mat.soil, box(W - 0.04, 0.02, D - 0.04, 0, 0.56, 0));
        break;
      }
      case 'copperBowl': {
        const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.12, 0), new THREE.Vector2(0.3, 0.04), new THREE.Vector2(0.37, 0.22), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.33, 0.29)], 24);
        add(mat.copper, bowl.toNonIndexed());
        add(mat.pebble, cyl(0.33, 0.33, 0.02, 0, 0.26, 0, 20));
        light(0.5, 0.05, 0.5, '#ffc27a', 1.2, 2);
        break;
      }
      case 'trellisCable': {
        for (const sx of [-1, 1]) add(mat.black, box(0.08, 2.0, 0.08, sx * W / 2, 0, 0));
        for (let k = 0; k < 6; k++) add(mat.steel, box(W, 0.006, 0.006, 0, 0.35 + k * 0.28, 0));
        break;
      }
      case 'trellisGrid': {
        for (let k = 0; k <= 4; k++) add(mat.black, box(0.02, 1.8, 0.02, -W / 2 + (k * W) / 4, 0.1, 0));
        for (let k = 0; k <= 8; k++) add(mat.black, box(W, 0.02, 0.02, 0, 0.1 + k * 0.22, 0));
        break;
      }
      case 'steppingPad': {
        add(catalogMaterial('concrete-smooth'), box(W, 0.06, D, 0, 0, 0));
        break;
      }
      case 'puttingCup': {
        add(mat.whiteMetal, cyl(0.055, 0.055, 0.01, 0, 0.005, 0, 16));
        add(plainMaterial('cup-hole', { color: '#0c0c0c', roughness: 1 }), cyl(0.05, 0.05, 0.012, 0, 0.006, 0, 16));
        break;
      }
      case 'boulder': {
        rocks.push({ x: f.position[0], y: y0 - 0.08, z: f.position[1], size: 1.0 + r() * 0.5, rot: (f.rotationDeg * Math.PI) / 180, seed: f.id });
        continue;
      }
      case 'pathLight': {
        add(mat.brass, cyl(0.02, 0.02, 0.55, 0, 0, 0, 10));
        const hat = new THREE.ConeGeometry(0.16, 0.1, 18, 1, true).translate(0, 0.62, 0);
        add(mat.brass, hat.toNonIndexed());
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10).translate(0, 0.56, 0), lampGlow);
        geos.push(lamp.geometry);
        o.add(lamp);
        light(0, 0.45, 0, '#ffc98a', 1.4, 3.5);
        break;
      }
      case 'spotLight': {
        add(mat.bronze, new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10).rotateX(-0.5).translate(0, 0.12, 0).toNonIndexed());
        add(mat.bronze, cyl(0.01, 0.01, 0.1, 0, 0, 0, 6));
        light(0, 0.4, -0.15, '#ffd29a', 3, 4);
        break;
      }
      case 'bench': {
        for (let k = 0; k < 4; k++) add(mat.teak, box(1.5, 0.04, 0.1, 0, 0.42, -0.17 + k * 0.115));
        for (const sx of [-0.6, 0.6]) add(mat.teak, box(0.08, 0.42, 0.4, sx, 0, 0));
        break;
      }
      case 'loungeSet': {
        // Sofa plus two chairs around a low table.
        add(mat.fabric, box(2.2, 0.4, 0.85, 0, 0, -D / 2 + 0.43));
        add(mat.fabric, box(2.2, 0.35, 0.2, 0, 0.4, -D / 2 + 0.1));
        add(mat.cushion, box(2.0, 0.12, 0.65, 0, 0.4, -D / 2 + 0.5));
        for (const sx of [-1, 1]) {
          add(mat.fabric, box(0.85, 0.4, 0.85, sx * (W / 2 - 0.43), 0, 0.5));
          add(mat.cushion, box(0.7, 0.12, 0.7, sx * (W / 2 - 0.43), 0.4, 0.5));
        }
        add(mat.granite, box(1.1, 0.38, 0.6, 0, 0, 0.1));
        break;
      }
      case 'diningSet': {
        add(mat.alum, box(1.9, 0.04, 0.95, 0, 0.72, 0));
        for (const sx of [-0.85, 0.85]) for (const sz of [-0.4, 0.4]) add(mat.alum, box(0.05, 0.72, 0.05, sx, 0, sz));
        for (let k = 0; k < 6; k++) {
          const side = k < 3 ? -1 : 1;
          const x = -0.6 + (k % 3) * 0.6;
          add(mat.alum, box(0.48, 0.05, 0.48, x, 0.45, side * 0.75));
          add(mat.alum, box(0.48, 0.45, 0.04, x, 0.5, side * 0.98));
          for (const lx of [-0.2, 0.2]) for (const lz of [-0.2, 0.2]) add(mat.alum, box(0.03, 0.45, 0.03, x + lx, 0, side * 0.75 + lz));
        }
        break;
      }
    }
    for (const [m, list] of parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      geos.push(merged);
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = !(m as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      o.add(mesh);
      surfaces.push(mesh);
    }
    o.position.set(f.position[0], y0, f.position[1]);
    o.rotation.y = (-f.rotationDeg * Math.PI) / 180;
    o.userData.itemId = f.id;
    o.name = `feature-${f.id}`;
    group.add(o);
  }
  group.add(rockField(rocks, 'boulders'));

  return {
    object: group,
    surfaces,
    lights,
    glow: [lampGlow, spaGlow],
    flames,
    fallMats,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of owned) m.dispose();
      for (const m of fallMats) m.dispose();
    },
  };
}

export function setFlames(fb: FeatureBuild, on: number) {
  for (const f of fb.flames) {
    f.visible = on > 0.02;
    (f.material as THREE.ShaderMaterial).uniforms.uOn.value = on;
  }
}
