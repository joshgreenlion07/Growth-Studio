import * as THREE from 'three';
import { GLOBAL } from './foliage';

/**
 * Water surface: planar reflections, depth-based clarity, sun glints,
 * flowing normals for streams and ring ripples for fountains.
 */

export const WATER_LAYER_SKIP = 1; // objects on this layer are left out of reflections
/** Objects on this layer show only in reflections (lower-detail stand-ins). */
export const REFLECTION_ONLY_LAYER = 2;
/** Shadow casters are also on this layer; the shadow map is drawn in a pass that sees only it. */
export const SHADOW_PASS_LAYER = 3;

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
  private vis: boolean[] = [];
  /**
   * How much the water shows the mirror (1) rather than the plain sky reflection (0), shared by every water
   * material. It eases to 0 while the water is too small on screen to be worth a reflection pass of its own.
   */
  readonly mix = { value: 1 };
  /** What the last call did, for the diagnostics readout. */
  status: 'drawn' | 'skipped (out of view)' | 'skipped (small)' | 'skipped (reduced rate)' | 'skipped (below the water)' | 'off' = 'off';
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private box = new THREE.Box3();
  private corner = new THREE.Vector3();
  /** Screen rectangle (0..1) the water covered when the mirror was last drawn, and the share of the target used. */
  private rect = new THREE.Vector4(0, 0, 1, 1);
  private rectNow = new THREE.Vector4();
  private drawnScale = 1;
  /** Frames since the reflection was last drawn (-1: it must be drawn next). */
  private lastDraw = -1;

  constructor(public height: number, scale = 0.5) {
    this.target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.target.texture.generateMipmaps = false;
    this.scale = scale;
  }
  scale: number;

  setSize(w: number, h: number) {
    this.target.setSize(Math.max(64, Math.round(w * this.scale)), Math.max(64, Math.round(h * this.scale)));
  }

  /**
   * Where the water is on screen: null when none of it is in view, else its rectangle in 0..1 screen coordinates
   * (the whole screen when part of it is behind the camera).
   */
  private screenRect(cam: THREE.PerspectiveCamera, surfaces: THREE.Object3D[], out: THREE.Vector4): THREE.Vector4 | null {
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let any = false;
    for (const o of surfaces) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) continue;
      // Only water that shows the mirror (a fountain bowl or a raised spa reflects the sky).
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      if (u && u.uUseMirror && !(u.uUseMirror.value > 0.5)) continue;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      this.box.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
      // Ripples bend the reflection a little past the surface's edge.
      this.box.expandByScalar(0.05);
      if (!this.frustum.intersectsBox(this.box)) continue;
      any = true;
      for (let k = 0; k < 8; k++) {
        const c = this.corner.set(k & 1 ? this.box.max.x : this.box.min.x, k & 2 ? this.box.max.y : this.box.min.y, k & 4 ? this.box.max.z : this.box.min.z);
        c.applyMatrix4(cam.matrixWorldInverse);
        if (c.z > -cam.near) return out.set(0, 0, 1, 1);
        c.applyMatrix4(cam.projectionMatrix);
        x0 = Math.min(x0, c.x);
        x1 = Math.max(x1, c.x);
        y0 = Math.min(y0, c.y);
        y1 = Math.max(y1, c.y);
      }
    }
    if (!any) return null;
    const cl = (v: number) => THREE.MathUtils.clamp(v * 0.5 + 0.5, 0, 1);
    return out.set(cl(x0), cl(y0), cl(x1), cl(y1));
  }

  /**
   * Render the reflection for `cam`, if the water is in view. `surfaces` are the water meshes (hidden during the
   * pass). `scale` is the live view's render scale (the mirror draws into that share of its target), `viewPx` the
   * view's height in device pixels, `dt` the frame time. The reflection is drawn on one frame in `every`; the frames
   * between keep the last one (its texture and its projection stay together, so it is never out of step), with
   * `moving` widening the drawn area for the camera's motion in between.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, hide: THREE.Object3D[], scale = 1, viewPx = 0, dt = 0, every = 1, moving = false) {
    if (!this.enabled) {
      this.status = 'off';
      return;
    }
    const live = viewPx > 0;
    const rect = this.screenRect(cam, hide, this.rectNow);
    if (live) {
      if (!rect) {
        // Out of view: nothing samples the reflection, so it can wait (it is redrawn before the water shows again).
        this.status = 'skipped (out of view)';
        this.lastDraw = -1;
        return;
      }
      // Water only a few pixels tall shows the sky's reflection instead; the change eases over a few frames.
      const tall = (rect.w - rect.y) * viewPx;
      const goal = tall > 28 ? 1 : 0;
      const step = Math.min(1, dt * 4);
      this.mix.value = goal > this.mix.value ? Math.min(goal, this.mix.value + step) : Math.max(goal, this.mix.value - step);
      if (this.mix.value <= 0) {
        this.status = 'skipped (small)';
        this.lastDraw = -1;
        return;
      }
      if (every > 1 && this.lastDraw >= 0 && this.lastDraw < every - 1) {
        this.lastDraw++;
        this.status = 'skipped (reduced rate)';
        return;
      }
      this.lastDraw = 0;
    } else {
      this.mix.value = 1;
      this.lastDraw = -1;
    }
    this.status = 'drawn';
    this.rect.copy(rect ?? this.rect.set(0, 0, 1, 1));
    this.drawnScale = THREE.MathUtils.clamp(scale, 0.25, 1);
    this.mirrorPos.set(0, this.height, 0);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.view.subVectors(this.mirrorPos, this.camPos);
    if (this.view.dot(this.normal) > 0) {
      this.status = 'skipped (below the water)';
      return;
    }
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
    mc.layers.enable(REFLECTION_ONLY_LAYER);

    // Clip space to the part of the target drawn into (its lower-left `drawnScale` share, in whole pixels).
    const T = this.target;
    const W = Math.max(1, Math.round(T.width * this.drawnScale)), H = Math.max(1, Math.round(T.height * this.drawnScale));
    const kx = W / T.width, ky = H / T.height;
    this.textureMatrix.set(0.5 * kx, 0, 0, 0.5 * kx, 0, 0.5 * ky, 0, 0.5 * ky, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
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

    const vis = this.vis;
    vis.length = hide.length;
    for (let i = 0; i < hide.length; i++) {
      vis[i] = hide[i].visible;
      hide[i].visible = false;
    }
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    // Only the part of the screen the water covers (plus a margin for ripple bending and, when a frame in two is
    // skipped, for the camera's motion in between) is drawn.
    const m = every > 1 && moving ? 0.08 : 0.03;
    const r = this.rect;
    const x0 = Math.floor(Math.max(0, r.x - m) * W), y0 = Math.floor(Math.max(0, r.y - m) * H);
    const x1 = Math.ceil(Math.min(1, r.z + m) * W), y1 = Math.ceil(Math.min(1, r.w + m) * H);
    T.viewport.set(0, 0, W, H);
    T.scissor.set(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    T.scissorTest = true;
    renderer.setRenderTarget(T);
    renderer.clear();
    renderer.render(scene, mc);
    T.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    for (let i = 0; i < hide.length; i++) hide[i].visible = vis[i];
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
uniform float uMirrorMix;
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
    refl = mix(refl, m, uMirrorMix);
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
  // Specular anti-aliasing: where the ripple normal changes a lot within a pixel (far off, grazing views) the
  // highlight widens and dims to the same total light instead of flashing single pixels on and off; it is also
  // capped so one glint cannot light a whole bloom halo.
  float nVar = clamp(length(fwidth(N)) * 4.0, 0.0, 1.0);
  float ex = mix(700.0, 80.0, nVar);
  float NdH = max(dot(N, H), 0.0);
  float spec = min(pow(NdH, ex) * 28.0 * (ex / 700.0), 8.0) + pow(NdH, 90.0) * 0.5;
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
    uMirrorMix: mirror ? mirror.mix : { value: 0 },
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
