import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The camera look: depth of field with autofocus, bloom on bright light,
 * filmic tone mapping, a gentle grade and vignette. Rendered in HDR.
 */

export interface LensSettings {
  /** Depth of field on or off. */
  dof: boolean;
  /** f-number feel: lower blurs more. 1.4 to 16. */
  fStop: number;
  bloom: number;
  vignette: number;
  contrast: number;
  saturation: number;
  /** -1 cool to +1 warm. */
  warmth: number;
  grain: number;
}

export const DEFAULT_LENS: LensSettings = {
  dof: true,
  fStop: 4,
  bloom: 0.35,
  vignette: 0.3,
  contrast: 1.08,
  saturation: 1.04,
  warmth: 0.05,
  grain: 0.012,
};

/**
 * Cleans a color read from the HDR scene buffer. One overflowed speck there (an Inf or NaN from a single sliver of
 * geometry, one or two pixels for one frame) is enough to black out most of the screen: every blur that reads it
 * spreads it (the focus gather, then the bloom's five cascaded levels, about 1150 pixels of reach each way), and what
 * it touches tone-maps to black. A guard after the blurs is too late, so every pass cleans the scene color where it
 * reads it: a pixel with an Inf or NaN in it becomes black (one dark pixel instead of a black square), and the rest
 * is capped so sums inside the blurs cannot overflow the half-float buffers either.
 * Written with plain comparisons: any comparison with NaN is false, and unlike isnan() or min/max a compiler does
 * not drop them.
 */
const HDR_CLEAN = /* glsl */ `
vec3 hdr(vec3 c){
  vec3 a = abs(c);
  bool ok = a.r < 6.0e4 && a.g < 6.0e4 && a.b < 6.0e4;
  return ok ? clamp(c, vec3(0.0), vec3(1000.0)) : vec3(0.0);
}`;

/**
 * Depth of field, gathered at half resolution (a quarter of the pixels, the costliest pass by far). Sizes are in
 * full-resolution pixels. Alpha carries how much of the result is blur spilled over from out-of-focus things in
 * front, so the full-resolution composite can keep sharp pixels sharp and still show that spill.
 */
const DOF_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uBlur;
uniform float uMaxCoc;
/** The drawn part of the scene buffers (see PostPipeline.scale): uv scale and the largest uv inside it. */
uniform vec2 uUvScale;
uniform vec2 uUvMax;
varying vec2 vUv;
#ifndef SAMPLES
#define SAMPLES 32
#endif
float linDepth(float d){ return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
vec2 suv(vec2 uv){ return min(uv * uUvScale, uUvMax); }
${HDR_CLEAN}
vec2 cocAt(vec2 uv){
  float z = linDepth(texture2D(tDepth, suv(uv)).x);
  float c = uBlur * abs(1.0 / uFocus - 1.0 / z) * uRes.y;
  return vec2(clamp(c, 0.0, uMaxCoc), z);
}
void main(){
  vec2 cz = cocAt(vUv);
  float c0 = cz.x;
  vec3 sum = hdr(texture2D(tColor, suv(vUv)).rgb);
  float wsum = 1.0;
  float wFront = 0.0;
  if (uMaxCoc > 0.0) {
    float ga = 2.39996323;
    for (int i = 1; i < SAMPLES; i++) {
      float fi = float(i);
      float r = sqrt(fi / float(SAMPLES)) * uMaxCoc;
      float a = fi * ga;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
      vec2 s = cocAt(uv);
      // Samples behind us can't blur wider than we do (no halos on sharp edges);
      // blurred samples in front spill over us.
      float cs = s.y > cz.y ? min(s.x, c0) : s.x;
      float w = smoothstep(r - 1.0, r + 1.0, cs);
      sum += hdr(texture2D(tColor, suv(uv)).rgb) * w;
      wsum += w;
      if (s.y < cz.y) wFront += w * smoothstep(1.0, 3.0, s.x);
    }
  }
  gl_FragColor = vec4(sum / wsum, clamp(wFront / wsum * 2.0, 0.0, 1.0));
}`;

/** Full resolution: the sharp image where in focus, the half-resolution blur where not (or where blur spills over). */
const COMPOSE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBlur;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uBlur;
uniform float uDof;
uniform vec2 uUvScale;
uniform vec2 uUvMax;
uniform vec2 uHalfScale;
uniform vec2 uHalfMax;
uniform vec2 uTexel;
uniform float uSharpen;
varying vec2 vUv;
float linDepth(float d){ return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
${HDR_CLEAN}
void main(){
  // The scene may be drawn into only part of its buffer (a lower render scale while the camera moves): this pass
  // scales it up to the full size, with a light sharpen so the picture does not go soft.
  vec2 uv = min(vUv * uUvScale, uUvMax);
  vec3 sharp = hdr(texture2D(tColor, uv).rgb);
  if (uSharpen > 0.0) {
    vec3 n = hdr(texture2D(tColor, min(uv + vec2(uTexel.x, 0.0), uUvMax)).rgb) + hdr(texture2D(tColor, max(uv - vec2(uTexel.x, 0.0), vec2(0.0))).rgb)
      + hdr(texture2D(tColor, min(uv + vec2(0.0, uTexel.y), uUvMax)).rgb) + hdr(texture2D(tColor, max(uv - vec2(0.0, uTexel.y), vec2(0.0))).rgb);
    // Limited so a bright edge (a sun glint) does not ring.
    sharp = max(sharp + (sharp - n * 0.25) * uSharpen, sharp * 0.5);
  }
  if (uDof <= 0.0) { gl_FragColor = vec4(sharp, 1.0); return; }
  float z = linDepth(texture2D(tDepth, uv).x);
  float c = uBlur * abs(1.0 / uFocus - 1.0 / z) * uRes.y;
  vec4 b = texture2D(tBlur, min(vUv * uHalfScale, uHalfMax));
  float k = max(smoothstep(0.75, 2.5, c), b.a) * uDof;
  gl_FragColor = vec4(mix(sharp, b.rgb, k), 1.0);
}`;

const OUT_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uUvScale;
uniform vec2 uUvMax;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color){
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${HDR_CLEAN}
void main(){
  // Cleaned here too: at Draft quality this pass reads the scene buffer directly (see HDR_CLEAN).
  vec3 c = hdr(texture2D(tColor, min(vUv * uUvScale, uUvMax)).rgb) * uExposure / 0.6;
  // A last check on the finished color (after the bloom was added). Tested before the clamp (clamp of NaN is
  // undefined), and also as c != c, which a compiler that drops isnan still keeps.
  if (any(isnan(c)) || any(isinf(c)) || any(notEqual(c, c))) c = vec3(0.0);
  c = clamp(c, vec3(0.0), vec3(6.0e4));
  // Warmth before tone mapping, like a white-balance shift.
  c *= vec3(1.0 + uWarmth * 0.08, 1.0, 1.0 - uWarmth * 0.1);
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = 1.0 - uVignette * smoothstep(0.35, 1.05, length(q) * 1.15);
  c *= v;
  c = srgb(c);
  c += (h(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** draft < light (phones and tablets) < balanced < max. */
export type Quality = 'draft' | 'light' | 'balanced' | 'max';

export class PostPipeline {
  sceneRT: THREE.WebGLRenderTarget;
  private rtA: THREE.WebGLRenderTarget;
  /** Half-resolution depth-of-field gather. */
  private rtHalf: THREE.WebGLRenderTarget;
  private dofQuad: FullScreenQuad;
  private composeQuad: FullScreenQuad;
  private composeMat: THREE.ShaderMaterial;
  private outQuad: FullScreenQuad;
  private dofMat: THREE.ShaderMaterial;
  private outMat: THREE.ShaderMaterial;
  private bloom: UnrealBloomPass;
  private w = 1;
  private h = 1;
  lens: LensSettings = { ...DEFAULT_LENS };
  focus = 10;
  exposure = 1;
  quality: Quality = 'balanced';
  /**
   * Share of the full size (each axis) the scene is drawn at, 0.5 to 1. The buffers keep their full size (resizing
   * them would clear the canvas); the scene and the depth of field fill only the lower-left part, and the compose
   * pass scales that up to the full size. Studio lowers it while the camera moves on a slow GPU.
   */
  scale = 1;
  /** How much depth of field shows, 0 to 1 (Studio fades it out while the camera moves). At 0 its pass is skipped. */
  dofAmount = 1;
  /**
   * While the camera and the focus hold perfectly still (only leaves and water move), the blur is gathered on every
   * other frame and the frame between reuses it: it is out of focus, so a one-frame-old blur of a swaying leaf cannot
   * be told apart. The sharp image and the focus mask are always current.
   */
  dofHalfRate = false;
  private lastDof = { view: new THREE.Matrix4(), proj: new THREE.Matrix4(), key: '', reused: true };

  constructor(private renderer: THREE.WebGLRenderer) {
    this.sceneRT = this.makeSceneRT(4);
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.rtHalf = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.dofMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uFocus: { value: 10 },
        uBlur: { value: 0.003 },
        uMaxCoc: { value: 14 },
        uUvScale: { value: new THREE.Vector2(1, 1) },
        uUvMax: { value: new THREE.Vector2(1, 1) },
      },
      defines: { SAMPLES: 32 },
      vertexShader: VERT,
      fragmentShader: DOF_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.outMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        uExposure: { value: 1 },
        uContrast: { value: 1 },
        uSaturation: { value: 1 },
        uWarmth: { value: 0 },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uUvScale: { value: new THREE.Vector2(1, 1) },
        uUvMax: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: OUT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.composeMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tBlur: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uFocus: { value: 10 },
        uBlur: { value: 0.003 },
        uDof: { value: 1 },
        uUvScale: { value: new THREE.Vector2(1, 1) },
        uUvMax: { value: new THREE.Vector2(1, 1) },
        uHalfScale: { value: new THREE.Vector2(1, 1) },
        uHalfMax: { value: new THREE.Vector2(1, 1) },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uSharpen: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.composeQuad = new FullScreenQuad(this.composeMat);
    this.dofQuad = new FullScreenQuad(this.dofMat);
    this.outQuad = new FullScreenQuad(this.outMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 1.6);
    // A soft knee: light fades into the bloom over a range instead of switching on at the threshold, so a small
    // highlight that brightens and dims (a ripple glint, a metal edge) does not blink a whole halo on and off.
    (this.bloom.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth.value = 0.9;
  }

  private makeSceneRT(samples: number) {
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.FloatType;
    return new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture: depth, depthBuffer: true });
  }

  setQuality(q: Quality) {
    this.quality = q;
    const samples = q === 'draft' ? 0 : 4;
    if (this.sceneRT.samples !== samples) {
      this.sceneRT.dispose();
      this.sceneRT.depthTexture?.dispose();
      this.sceneRT = this.makeSceneRT(samples);
      this.sceneRT.setSize(this.w, this.h);
    }
    this.dofMat.defines.SAMPLES = q === 'max' ? 64 : q === 'light' ? 16 : 32;
    this.dofMat.needsUpdate = true;
  }

  setSize(w: number, h: number) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.lastDof.reused = true;
    this.sceneRT.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtHalf.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
    this.bloom.setSize(w, h);
    this.composeMat.uniforms.uRes.value.set(w, h);
    this.outMat.uniforms.uRes.value.set(w, h);
  }

  /** The scene buffer's full size, and the share of it (each axis) the next render() draws into. */
  drawArea(toTarget: boolean) {
    return { w: this.w, h: this.h, scale: toTarget ? 1 : THREE.MathUtils.clamp(this.scale, 0.5, 1) };
  }

  /** The drawn size at the current scale, and the uv transform from full-size coordinates into it. */
  private applyScale(s: number) {
    const w = this.w, h = this.h;
    const sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
    this.sceneRT.viewport.set(0, 0, sw, sh);
    const hw = this.rtHalf.width, hh = this.rtHalf.height;
    const shw = Math.max(1, Math.ceil(sw / 2)), shh = Math.max(1, Math.ceil(sh / 2));
    this.rtHalf.viewport.set(0, 0, shw, shh);
    // Samples stay half a texel inside the drawn area, so nothing from outside it (stale pixels) bleeds in.
    const d = this.dofMat.uniforms, c = this.composeMat.uniforms, o = this.outMat.uniforms;
    d.uRes.value.set(sw, sh);
    d.uUvScale.value.set(sw / w, sh / h);
    d.uUvMax.value.set((sw - 0.5) / w, (sh - 0.5) / h);
    c.uUvScale.value.copy(d.uUvScale.value);
    c.uUvMax.value.copy(d.uUvMax.value);
    c.uHalfScale.value.set(shw / hw, shh / hh);
    c.uHalfMax.value.set((shw - 0.5) / hw, (shh - 0.5) / hh);
    c.uTexel.value.set(1 / w, 1 / h);
    // Sharpen in proportion to how far the picture is scaled up.
    c.uSharpen.value = s < 0.999 ? Math.min(0.5, (1 - s) * 1.4) : 0;
    o.uUvScale.value.copy(d.uUvScale.value);
    o.uUvMax.value.copy(d.uUvMax.value);
    return sh;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, toTarget: THREE.WebGLRenderTarget | null = null) {
    const r = this.renderer;
    const scale = toTarget ? 1 : THREE.MathUtils.clamp(this.scale, 0.5, 1);
    const sh = this.applyScale(scale);
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    let src: THREE.WebGLRenderTarget = this.sceneRT;
    const L = this.lens;
    const dofAmount = toTarget ? 1 : THREE.MathUtils.clamp(this.dofAmount, 0, 1);
    const useDof = L.dof && this.quality !== 'draft' && dofAmount > 0.001;
    const useBloom = L.bloom > 0.01 && this.quality !== 'draft';
    const c = this.composeMat.uniforms;
    c.tColor.value = this.sceneRT.texture;
    c.tDepth.value = this.sceneRT.depthTexture;
    c.uDof.value = 0;
    if (useDof) {
      const u = this.dofMat.uniforms;
      u.tColor.value = this.sceneRT.texture;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uFocus.value = Math.max(0.3, this.focus);
      // Aperture diameter in meters for a ~35 mm lens, scaled to the frame.
      const focal = 0.012 / Math.tan((camera.fov * Math.PI) / 360);
      const aperture = focal / L.fStop;
      u.uBlur.value = (aperture * focal) / 0.024 * 0.5;
      u.uMaxCoc.value = (this.quality === 'max' ? 22 : 15) * (sh / 1080);
      const last = this.lastDof;
      const key = `${scale}|${u.uFocus.value}|${u.uBlur.value}|${u.uNear.value}|${u.uFar.value}|${u.uMaxCoc.value}|${this.quality}`;
      const still = !toTarget && this.dofHalfRate && !last.reused && key === last.key && camera.matrixWorld.equals(last.view) && camera.projectionMatrix.equals(last.proj);
      if (still) last.reused = true;
      else {
        r.setRenderTarget(this.rtHalf);
        this.dofQuad.render(r);
        if (!toTarget) {
          last.view.copy(camera.matrixWorld);
          last.proj.copy(camera.projectionMatrix);
          last.key = key;
          last.reused = false;
        }
      }
      c.tBlur.value = this.rtHalf.texture;
      c.uNear.value = u.uNear.value;
      c.uFar.value = u.uFar.value;
      c.uFocus.value = u.uFocus.value;
      c.uBlur.value = u.uBlur.value;
      c.uDof.value = dofAmount;
    }
    // A frame without the gather leaves nothing to reuse next time.
    if (!useDof && !toTarget) this.lastDof.reused = true;
    if (useDof || useBloom || scale < 1) {
      // Into a plain full-size buffer: the focus blend, or only a copy out of the multisampled target for bloom.
      r.setRenderTarget(this.rtA);
      this.composeQuad.render(r);
      src = this.rtA;
    }
    if (useBloom) {
      // Bloom adds onto the source buffer.
      this.bloom.strength = L.bloom;
      this.bloom.renderToScreen = false;
      this.bloom.render(r, src, src, 0, false);
    }
    const o = this.outMat.uniforms;
    o.tColor.value = src.texture;
    if (src !== this.sceneRT) {
      // Already scaled up to the full size by the compose pass.
      o.uUvScale.value.set(1, 1);
      o.uUvMax.value.set(1, 1);
    }
    o.uExposure.value = this.exposure;
    o.uContrast.value = L.contrast;
    o.uSaturation.value = L.saturation;
    o.uWarmth.value = L.warmth;
    o.uVignette.value = L.vignette;
    o.uGrain.value = L.grain;
    o.uTime.value = time;
    r.setRenderTarget(toTarget);
    this.outQuad.render(r);
  }

  dispose() {
    this.sceneRT.dispose();
    this.rtA.dispose();
    this.rtHalf.dispose();
    this.composeMat.dispose();
    this.composeQuad.dispose();
    this.bloom.dispose();
    this.dofMat.dispose();
    this.outMat.dispose();
    this.dofQuad.dispose();
    this.outQuad.dispose();
  }
}
