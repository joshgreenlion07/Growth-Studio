import * as THREE from 'three';
import { GLOBAL } from './foliage';

/**
 * Water surface: planar reflections, depth-based clarity, sun glints,
 * flowing normals for streams and ring ripples for fountains.
 */

export const WATER_LAYER_SKIP = 1; // objects on this layer are left out of reflections

export class PlanarMirror {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  readonly camera = new THREE.PerspectiveCamera();
  enabled = true;
  private plane = new THREE.Plane();
  private normal = new THREE.Vector3(0, 1, 0);
  private mirrorPos = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private rot = new THREE.Matrix4();
  private lookAt = new THREE.Vector3(0, 0, -1);
  private target3 = new THREE.Vector3();
  private view = new THREE.Vector3();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();

  constructor(public height: number, scale = 0.5) {
    this.target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.target.texture.generateMipmaps = false;
    this.scale = scale;
  }
  scale: number;

  setSize(w: number, h: number) {
    this.target.setSize(Math.max(64, Math.round(w * this.scale)), Math.max(64, Math.round(h * this.scale)));
  }

  /** Render the reflection for `cam`. `hide` objects are hidden during the pass. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
    if (!this.enabled) return;
    this.mirrorPos.set(0, this.height, 0);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.view.subVectors(this.mirrorPos, this.camPos);
    if (this.view.dot(this.normal) > 0) return; // camera below the water
    this.view.reflect(this.normal).negate();
    this.view.add(this.mirrorPos);
    this.rot.extractRotation(cam.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rot).add(this.camPos);
    this.target3.subVectors(this.mirrorPos, this.lookAt).reflect(this.normal).negate().add(this.mirrorPos);
    const mc = this.camera;
    mc.position.copy(this.view);
    mc.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.normal);
    mc.lookAt(this.target3);
    mc.far = cam.far;
    mc.near = cam.near;
    mc.fov = cam.fov;
    mc.aspect = cam.aspect;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    mc.layers.set(0);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);

    // Oblique near plane so nothing under the water shows in the reflection.
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.mirrorPos);
    this.plane.applyMatrix4(mc.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = mc.projectionMatrix;
    this.q.x = (Math.sign(this.clip.x) + pm.elements[8]) / pm.elements[0];
    this.q.y = (Math.sign(this.clip.y) + pm.elements[9]) / pm.elements[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    this.clip.multiplyScalar(2.0 / this.clip.dot(this.q));
    pm.elements[2] = this.clip.x;
    pm.elements[6] = this.clip.y;
    pm.elements[10] = this.clip.z + 1.0 - 0.003;
    pm.elements[14] = this.clip.w;

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    hide.forEach((o, i) => (o.visible = vis[i]));
  }

  dispose() {
    this.target.dispose();
  }
}

export interface WaterLook {
  deep: string;
  shallow: string;
  /** Absorption per meter: higher is murkier. */
  absorb: number;
  /** Ripple strength. */
  ripple: number;
  /** 0 for still water; streams use their flow speed. */
  flowSpeed: number;
  /** Fountain ring ripples: center x, z and strength. */
  rings?: [number, number, number];
  useMirror: boolean;
}

export const WATER_LOOKS = {
  pond: { deep: '#0e2a24', shallow: '#4b6b4e', absorb: 2.4, ripple: 0.55, flowSpeed: 0, useMirror: true },
  stream: { deep: '#123029', shallow: '#5d7a5c', absorb: 2.0, ripple: 0.9, flowSpeed: 0.45, useMirror: true },
  pool: { deep: '#0a4f73', shallow: '#4fb3c8', absorb: 0.45, ripple: 0.35, flowSpeed: 0, useMirror: true },
  fountain: { deep: '#1a2d2a', shallow: '#56706a', absorb: 1.6, ripple: 0.5, flowSpeed: 0, useMirror: false },
} satisfies Record<string, WaterLook>;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform mat4 uTexMatrix;
attribute float aShore;
attribute float aDepth;
attribute vec3 aFlow; // xy: flow direction, z: distance along the stream
varying vec3 vW;
varying vec4 vRefl;
varying float vShore;
varying float vDepth;
varying vec3 vFlow;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vRefl = uTexMatrix * w;
  vShore = aShore;
  vDepth = aDepth;
  vFlow = aFlow;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform sampler2D uReflection;
uniform float uUseMirror;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uAbsorb;
uniform float uRipple;
uniform float uFlowSpeed;
uniform vec3 uRings;
uniform float uNight;
varying vec3 vW;
varying vec4 vRefl;
varying float vShore;
varying float vDepth;
varying vec3 vFlow;

vec2 h22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(h22(i), f), dot(h22(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(h22(i + vec2(0, 1)), f - vec2(0, 1)), dot(h22(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float waves(vec2 p){
  float t = uTime;
  vec2 flow = vFlow.xy * uFlowSpeed * t;
  float h = gnoise((p - flow) * 1.6 + vec2(t * 0.11, t * 0.07)) * 0.5;
  h += gnoise((p - flow * 1.3) * 3.7 - vec2(t * 0.17, -t * 0.13)) * 0.25;
  h += gnoise((p - flow * 1.6) * 8.3 + vec2(-t * 0.31, t * 0.23)) * 0.12;
  if (uRings.z > 0.0) {
    float d = length(p - uRings.xy);
    h += sin(d * 22.0 - t * 5.0) * 0.06 * uRings.z * exp(-d * 1.2);
  }
  return h;
}
vec3 skyRefl(vec3 r){
  float up = clamp(r.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.55));
  c += uSunColor * pow(max(dot(r, uSunDir), 0.0), 64.0) * 0.6;
  return c;
}
void main(){
  vec2 p = vW.xz;
  float e = 0.03;
  float amp = uRipple * 0.08;
  float h0 = waves(p);
  float hx = waves(p + vec2(e, 0.0));
  float hz = waves(p + vec2(0.0, e));
  vec3 N = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
  vec3 V = normalize(cameraPosition - vW);
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

  vec3 R = reflect(-V, N);
  vec3 refl = skyRefl(R);
  if (uUseMirror > 0.5) {
    vec4 rc = vRefl;
    rc.xy += N.xz * 0.06 * rc.w;
    vec3 m = texture2DProj(uReflection, rc).rgb;
    refl = m;
  }

  // Light travels down to the bed and back: longer at grazing angles.
  float path = vDepth * (1.0 + 1.0 / max(NdV, 0.15));
  float T = exp(-uAbsorb * path);
  float shallowMix = exp(-vDepth * 3.0);
  vec3 body = mix(uDeep, uShallow, shallowMix);
  float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0);
  body *= 0.35 + 0.65 * sunUp + 0.2 * (1.0 - uNight);
  // Light scattered back from the water body.
  vec3 scatter = body * (1.0 - T);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 700.0) * 28.0 + pow(max(dot(N, H), 0.0), 90.0) * 0.5;
  vec3 sun = uSunColor * spec * sunUp;

  float a = (1.0 - F) * (1.0 - T) + F;
  vec3 col = scatter * (1.0 - F) + refl * F + sun;
  float edge = smoothstep(0.0, 0.08, vShore);
  a *= edge;
  col *= edge;
  a = clamp(a + length(sun) * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor );
  #endif
}`;

export interface WaterMaterialHandles {
  material: THREE.ShaderMaterial;
}

export function waterMaterial(look: WaterLook, mirror: PlanarMirror | null, sky: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uNight: { value: number } }): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]) as Record<string, THREE.IUniform>;
  Object.assign(uniforms, {
    uTime: GLOBAL.uTime,
    uSunDir: GLOBAL.uSunDir,
    uSunColor: GLOBAL.uSunColor,
    uZenith: sky.uZenith,
    uHorizon: sky.uHorizon,
    uNight: sky.uNight,
    uReflection: { value: mirror ? mirror.target.texture : null },
    uTexMatrix: { value: mirror ? mirror.textureMatrix : new THREE.Matrix4() },
    uUseMirror: { value: mirror && look.useMirror ? 1 : 0 },
    uDeep: { value: new THREE.Color(look.deep) },
    uShallow: { value: new THREE.Color(look.shallow) },
    uAbsorb: { value: look.absorb },
    uRipple: { value: look.ripple },
    uFlowSpeed: { value: look.flowSpeed },
    uRings: { value: new THREE.Vector3(...(look.rings ?? [0, 0, 0])) },
  });
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: true,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  return m;
}

/** A sheet of falling water: bright streaks moving down, glowing when lit at night. */
export function fallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor, uGlow: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; uniform float uGlow;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = uTime * 1.6;
        float s = n(vec2(vUv.x * 38.0, vUv.y * 3.0 + t * 2.2)) * 0.6 + n(vec2(vUv.x * 90.0, vUv.y * 6.0 + t * 3.1)) * 0.4;
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float foam = smoothstep(0.25, 0.0, vUv.y);
        float a = (0.28 + s * 0.45 + foam * 0.35) * edge;
        vec3 base = vec3(0.82, 0.88, 0.9) * (0.25 + length(uSunColor) * 0.35);
        vec3 glow = vec3(1.0, 0.72, 0.38) * uGlow * (0.6 + s);
        gl_FragColor = vec4((base + glow) * a, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}
