import * as THREE from 'three';

/**
 * Shared shader patches for anything that grows or moves in the wind.
 *
 * Plant geometry is built once at mature size. Each vertex carries:
 *  - aBirth  (0..1)  when on the growth curve this part appears
 *  - aAnchor (vec3)  where it grows out from (its branch point)
 *  - aSway   (0..1)  how much it bends in the wind (0 at the base)
 * The growth slider only changes uniforms, so it is instant.
 */

export const GLOBAL = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
};

export interface GrowthUniforms {
  /** 0 at install, 1 at maturity. */
  uGrow: { value: number };
  /** Size relative to mature size: x = spread, y = height. */
  uSize: { value: THREE.Vector2 };
}

export function growthUniforms(): GrowthUniforms {
  return { uGrow: { value: 1 }, uSize: { value: new THREE.Vector2(1, 1) } };
}

export interface FoliageOptions {
  growth?: GrowthUniforms;
  /** Wind bend in meters at full sway and full wind. */
  bend: number;
  /** Leaf flutter in meters. */
  flutter: number;
  /** Light passing through leaves when backlit, 0..1. */
  translucency: number;
}

const VERT_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform float uGrow;
uniform vec2 uSize;
uniform float uBend;
uniform float uFlutter;
attribute float aBirth;
attribute vec3 aAnchor;
attribute float aSway;
`;

const VERT_BEGIN = /* glsl */ `
vec3 transformed = vec3(position);
{
  // Parts with birth 0 are present at install; later parts fill in as the plant grows.
  float b = aBirth * 0.75;
  float gReveal = smoothstep(b - 0.12, b + 0.02, uGrow);
  transformed = mix(aAnchor, transformed, gReveal);
  transformed.xz *= uSize.x;
  transformed.y *= uSize.y;
}
`;

const VERT_PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 gsWorld = modelMatrix * mvPosition;
{
  vec4 baseW = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    baseW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  float ph = dot(baseW.xz, vec2(0.37, 0.21));
  float gust = 0.55 + 0.45 * sin(uTime * 0.31 + baseW.x * 0.05 + baseW.z * 0.04);
  float sway = (sin(uTime * 1.25 + ph) * 0.55 + sin(uTime * 2.6 + ph * 1.7) * 0.22 + 0.35) * gust;
  float b = aSway * uBend * uWind * sway * uSize.y;
  gsWorld.xz += uWindDir * b;
  gsWorld.y -= abs(b) * 0.15 * aSway;
  float fl = sin(uTime * 7.3 + dot(position, vec3(3.1, 1.7, 2.3)) * 3.0) * uFlutter * uWind * aSway;
  gsWorld.xyz += vec3(fl, fl * 0.6, -fl * 0.8);
}
mvPosition = viewMatrix * gsWorld;
gl_Position = projectionMatrix * mvPosition;
`;

function bindCommon(shader: THREE.WebGLProgramParametersWithUniforms, o: FoliageOptions) {
  const g = o.growth ?? growthUniforms();
  shader.uniforms.uTime = GLOBAL.uTime;
  shader.uniforms.uWind = GLOBAL.uWind;
  shader.uniforms.uWindDir = GLOBAL.uWindDir;
  shader.uniforms.uGrow = g.uGrow;
  shader.uniforms.uSize = g.uSize;
  shader.uniforms.uBend = { value: o.bend };
  shader.uniforms.uFlutter = { value: o.flutter };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERT_HEAD)
    .replace('#include <begin_vertex>', VERT_BEGIN)
    .replace('#include <project_vertex>', VERT_PROJECT);
}

/** Patch a standard material for growth, wind and backlit leaves. */
export function patchFoliage<M extends THREE.MeshStandardMaterial>(mat: M, o: FoliageOptions): M {
  mat.onBeforeCompile = (shader) => {
    bindCommon(shader, o);
    shader.uniforms.uSunDir = GLOBAL.uSunDir;
    shader.uniforms.uSunColor = GLOBAL.uSunColor;
    shader.uniforms.uTranslucency = { value: o.translucency };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTranslucency;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         {
           vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
           float back = pow(max(dot(-Lv, normalize(vViewPosition)), 0.0), 3.0);
           float wrap = max(dot(-normal, Lv), 0.0);
           reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uTranslucency * (back * 0.9 + wrap * 0.25);
         }`,
      );
  };
  mat.customProgramCacheKey = () => `foliage-${o.bend}-${o.flutter}-${o.translucency}-${mat.alphaTest}`;
  return mat;
}

/** Depth material for shadows that matches the patched vertex motion. */
export function foliageDepthMaterial(o: FoliageOptions, map?: THREE.Texture, alphaTest = 0): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map ?? null, alphaTest });
  m.onBeforeCompile = (shader) => bindCommon(shader, o);
  m.customProgramCacheKey = () => `foliage-depth-${o.bend}-${o.flutter}-${alphaTest}`;
  return m;
}

/** Fill in the growth and wind attributes for a geometry if missing. */
export function ensureFoliageAttributes(geo: THREE.BufferGeometry, sway: (y: number) => number = () => 0) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  if (!geo.getAttribute('aBirth')) geo.setAttribute('aBirth', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (!geo.getAttribute('aAnchor')) {
    geo.setAttribute('aAnchor', new THREE.Float32BufferAttribute(new Float32Array(pos.array as ArrayLike<number>), 3));
  }
  if (!geo.getAttribute('aSway')) {
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = sway(pos.getY(i));
    geo.setAttribute('aSway', new THREE.Float32BufferAttribute(s, 1));
  }
}
