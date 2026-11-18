import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../siteplan/geometry';
import type { Vec2 } from '../siteplan/types';
import { GLOBAL } from '../engine/foliage';
import { clamp01, smooth, vnoise } from '../engine/noise';
import { ledgerStoneSet, patinaBowlSet, pillarStuccoSet } from '../engine/fountain-surfaces';
import { catalogMaterial, pbrMaterial, plainMaterial } from './materials';

/*
 * Three-pillar stucco water feature (pondless) and the patina bowl planter that sits on its pillars, drawn to a finished
 * Green Lion install. Sizes are read from the job photos (straight-on front view, side view along the yard, end view
 * with the copper scupper pouring) with the camera solved from them, checked against the engineer's perspective detail;
 * where the two disagree the photos win. Curb joints (Belgard Melville Curb, 24 in units) set the scale.
 *
 *   Basin       14 ft x 4 ft 2 in outside, a 4 in Belgard Melville Curb (Anthracite) showing 5 1/2 in, filled with
 *               black Mexican beach pebble 1-2 in to about 5 in above the paving, kept wet and dark. No open water.
 *   Pillars     three, 2 ft 8 in wide x 2 ft deep x 5 ft 6 in tall on 4 ft 8 in centers, CMU with a smooth-troweled
 *               (Santa Barbara) stucco in a mottled warm gray. (The detail drew the outer two 2 ft wide; the photos show
 *               all three the same.) The splash wets the stucco above the pebbles in a low dark arch.
 *   Panels      2 ft wide x 5 ft tall between the pillars, set back 1 ft 8 in from their fronts, faced with golden-tan
 *               split-face travertine ledger stone (the detail says porcelain tile; the stone is what was built).
 *   Spillways   a 12 in copper sheer descent in each panel, lip 31 in above the paving; the sheet narrows as it falls and
 *               lands about 6 in out from the stone. A warm LED in each lip glows at night.
 *   Scuppers    a 1 in copper pipe (1 1/4 in outside) centered low on the front of each outer pillar, 18 1/2 in up,
 *               standing out 5 1/2 in and tipped down a little, pouring a rope of water into the pebbles.
 *   Bowls       a 23 in x 9 in bowl planter centered on each pillar top: a verdigris-teal band on the upper shoulder and
 *               rim over a dark bronze body, planted with an Agave 'Blue Glow' (the catalog's) kept about 14 in across,
 *               in gray gravel top dressing.
 *
 * Local space: x along the feature, +z out of the front, y up from the paving; the footprint is centered on the basin.
 */

const IN = 0.0254;
/** The basin's curb and stone: Belgard Melville Curb in Anthracite (Green Lion's usual) and black Mexican beach pebble. */
const FOUNTAIN_CURB = 'melville-curb-anthracite';
const FOUNTAIN_PEBBLE = 'mexican-beach-pebble-1-2';
/** The basin's stones stay wet from the falls and splash: darker than the dry stone the pebble colors were taken from. */
const WET_PEBBLE: [number, number, number] = [0.72, 0.6, 0.5];

/** Sizes in inches. The basin's outside (length x depth) is the catalog footprint. */
const P = {
  length: 168,
  depth: 50,
  curbT: 4,
  curbTop: 5.5,
  curbBottom: -1,
  pebbleTop: 5,
  pillarW: 32,
  pillarD: 24,
  pillarH: 66,
  pitch: 56,
  /** Pillar front, from the basin's center line. */
  front: 3,
  panelW: 24,
  panelH: 60,
  /** Panel face set back from the pillar fronts. */
  recess: 20,
  spillW: 12,
  lipY: 31,
  scupperY: 18.5,
};

/* ------------------------------------------------------------------ */
/* Surfaces (textures in engine/fountain-surfaces.ts)                   */
/* ------------------------------------------------------------------ */

/** Aged copper: the spillways, scupper pipes and flanges. */
const agedCopper = () => plainMaterial('pf-aged-copper', { color: '#5a4636', roughness: 0.4, metalness: 0.7 });

/* ------------------------------------------------------------------ */
/* Water                                                                */
/* ------------------------------------------------------------------ */

/**
 * Clear falling water: mostly see-through, with streaks running down, the bright rolled edges of a sheer sheet (aEdge)
 * or the silhouette of a stream (fresnel), whiter where it breaks up near the bottom (uv.y in meters fallen, aEnd 0..1),
 * and a warm glow when its LED is on (uGlow, set by the light it is linked to).
 */
function clearFallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor, uGlow: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aEdge;
      attribute float aEnd;
      varying vec2 vUv; varying float vEdge; varying float vEnd; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv; vEdge = aEdge; vEnd = aEnd;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; uniform float uGlow;
      varying vec2 vUv; varying float vEdge; varying float vEnd; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = uTime;
        float s1 = n(vec2(vUv.x * 55.0, vUv.y * 5.0 - t * 7.5));
        float s2 = n(vec2(vUv.x * 150.0, vUv.y * 11.0 - t * 12.0));
        float streak = smoothstep(0.35, 1.0, s1 * 0.55 + s2 * 0.45);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        float rim = smoothstep(0.7, 1.0, vEdge);
        float brk = smoothstep(0.75, 1.0, vEnd) * (0.4 + 0.6 * n(vec2(vUv.x * 40.0, vUv.y * 20.0 - t * 9.0))) * 0.45;
        // Clear water: it dims what is behind a little (alpha) and adds the sky's sheen, bright streaks and rolled edges.
        float a = clamp(0.2 + fres * 0.35 + rim * 0.35 + brk * 0.25, 0.0, 0.85);
        float day = 0.22 + length(uSunColor) * 0.34;
        vec3 sheen = vec3(0.62, 0.7, 0.78) * day * (0.1 + fres * 0.5 + (1.0 - vEnd) * 0.06);
        vec3 lit = vec3(0.92, 0.95, 0.97) * day * (streak * 0.16 + rim * 0.36 + brk * 0.35);
        vec3 glow = vec3(1.0, 0.66, 0.3) * uGlow * (0.2 + streak * 0.8 + rim * 0.6) * (1.0 - vEnd * 0.6);
        gl_FragColor = vec4(sheen * a + lit + glow * 0.95, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** Foam where the water lands in the pebbles: soft white churn, moving. */
function splashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        float churn = n(p * 6.0 + vec2(uTime * 2.3, -uTime * 1.7)) * 0.6 + n(p * 14.0 - vec2(uTime * 3.1, uTime * 2.2)) * 0.4;
        float a = smoothstep(1.0, 0.2, d) * smoothstep(0.45, 0.8, churn) * 0.55;
        vec3 c = vec3(0.86, 0.9, 0.92) * (0.22 + length(uSunColor) * 0.34);
        gl_FragColor = vec4(c * a, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/**
 * A sheer-descent sheet leaving a lip at `top` (center of the lip's front edge), falling to `bottomY`: a ribbon that
 * curves out from the wall as it falls (exit speed `out` m/s) and narrows from `w0` to `w1`, with a slight belly.
 */
function sheetGeometry(top: THREE.Vector3, bottomY: number, w0: number, w1: number, out: number): THREE.BufferGeometry {
  const drop = top.y - bottomY, nx = 12, ny = 24;
  const pos: number[] = [], uv: number[] = [], edge: number[] = [], end: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    const t = j / ny, fall = drop * t;
    const z = out * Math.sqrt((2 * fall) / 9.81);
    const w = w1 + (w0 - w1) * Math.pow(1 - t, 1.8);
    for (let i = 0; i <= nx; i++) {
      const s = i / nx - 0.5;
      // The sheet's edges roll back toward the wall a touch and its middle bellies out.
      const belly = (0.25 - s * s) * 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.4));
      pos.push(top.x + s * w, top.y - fall, top.z + z + belly);
      uv.push(s * w, fall);
      edge.push(Math.abs(s) * 2);
      end.push(t);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A rope of water from a pipe mouth at `p0` leaving along `dir` at `speed` m/s and falling to `bottomY`: a thin tube
 * along the parabola, a little thicker as it slows at the top and frayed near the bottom.
 */
function streamGeometry(p0: THREE.Vector3, dir: THREE.Vector3, speed: number, bottomY: number, radius: number): THREE.BufferGeometry {
  const v = dir.clone().normalize().multiplyScalar(speed);
  // Time to fall to bottomY: p0.y + v.y t - g t^2 / 2 = bottomY.
  const g = 9.81, a = -g / 2, b = v.y, c = p0.y - bottomY;
  const tEnd = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const pts: THREE.Vector3[] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = (tEnd * i) / n;
    pts.push(new THREE.Vector3(p0.x + v.x * t, p0.y + v.y * t - (g * t * t) / 2, p0.z + v.z * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, n, radius, 8, false);
  // Narrow as it speeds up (the same flow through a smaller section), down to about 60%.
  const pos = tube.getAttribute('position') as THREE.BufferAttribute;
  const uvA = tube.getAttribute('uv') as THREE.BufferAttribute;
  const end = new Float32Array(pos.count), edge = new Float32Array(pos.count);
  const len = curve.getLength();
  for (let i = 0; i < pos.count; i++) {
    const t = uvA.getX(i);
    const k = Math.min(n, Math.round(t * n));
    const ctr = curve.getPointAt(Math.min(1, k / n));
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    const sh = 1 - 0.4 * Math.sqrt(t);
    p.sub(ctr).multiplyScalar(sh).add(ctr);
    pos.setXYZ(i, p.x, p.y, p.z);
    uvA.setXY(i, uvA.getY(i) * radius * 6, t * len);
    end[i] = t;
    edge[i] = 0;
  }
  tube.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  tube.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  tube.computeVertexNormals();
  return tube;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

/** Box from inches: size w x h x d, x and z its center, y0 its bottom; UVs in meters shifted by (du, dv) meters. */
function boxIn(w: number, h: number, d: number, x: number, y0: number, z: number, du = 0, dv = 0, round = 0): THREE.BufferGeometry {
  const g = round > 0 ? new RoundedBoxGeometry(w * IN, h * IN, d * IN, 2, round * IN) : new THREE.BoxGeometry(w * IN, h * IN, d * IN);
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const [a, b] = ay > 0.6 ? [px, pz] : ax > 0.6 ? [pz, py] : [px, py];
    uv[i * 2] = a + du;
    uv[i * 2 + 1] = b + dv;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.translate(x * IN, (y0 + h / 2) * IN, z * IN);
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A soft dark arch of wet stucco above the pebbles, as a decal just off a face: `w` x `h` inches, its alpha painted once.
 * The darker color is laid over the face, so it takes the face's own light.
 */
let wetTex: THREE.Texture | null = null;
function wetTexture(): THREE.Texture {
  if (wetTex) return wetTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = 1 - y / S; // v up
    const dx = (u - 0.5) * 2;
    // A dome over a band: full along the bottom, rising to the arch at the middle.
    const arch = Math.sqrt(Math.max(0, 1 - dx * dx));
    const wav = (vnoise(u * 18, v * 4, 1e6, 91) - 0.5) * 0.12 + (vnoise(u * 60, v * 10, 1e6, 93) - 0.5) * 0.05;
    const lim = 0.18 + arch * 0.82 + wav;
    // Darkest at the pebbles, fading over the upper part of the arch, with a soft wandering edge.
    const a = clamp01((lim - v) / 0.08) * (1 - 0.45 * smooth(0, 1, v / Math.max(0.2, lim))) * (0.88 + vnoise(u * 12, v * 8, 1e6, 95) * 0.12) * smooth(0, 0.08, u) * smooth(1, 0.92, u);
    const o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(a * 255);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  wetTex = new THREE.CanvasTexture(c);
  wetTex.colorSpace = THREE.NoColorSpace;
  return wetTex;
}

/** Wet stone under a spillway: dark at the pebbles, fading out unevenly upward, full width. */
let wetBand: THREE.Texture | null = null;
function wetBandTexture(): THREE.Texture {
  if (wetBand) return wetBand;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = 1 - y / S;
    const reach = 0.65 + (vnoise(u * 7, 0.5, 1e6, 97) - 0.5) * 0.5 + (vnoise(u * 23, 0.5, 1e6, 98) - 0.5) * 0.15;
    const a = clamp01(1 - v / Math.max(0.2, reach)) ** 0.7 * (0.85 + vnoise(u * 16, v * 9, 1e6, 99) * 0.15);
    const o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(a * 255);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  wetBand = new THREE.CanvasTexture(c);
  wetBand.colorSpace = THREE.NoColorSpace;
  return wetBand;
}

function wetMaterial(): THREE.MeshStandardMaterial {
  return plainMaterial('pf-wet-stucco', {
    color: '#141110',
    roughness: 0.65,
    transparent: true,
    opacity: 0.95,
    alphaMap: wetTexture(),
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** A face-on decal quad, w x h inches, its bottom center at (x, y0, z) inches, facing +z (or turned by `ry`). */
function decalIn(w: number, h: number, x: number, y0: number, z: number, ry = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w * IN, h * IN);
  g.translate(0, (h * IN) / 2, 0);
  g.rotateY(ry);
  g.translate(x * IN, y0 * IN, z * IN);
  return g.toNonIndexed();
}

/**
 * Profile of the bowl (inches: radius, height), foot to rim, over the lip and down the inside to the soil (filled to 1
 * in below the rim), measured from the photos: 23 in across the rim, 9 in tall, an 11 in foot.
 */
const BOWL_PROFILE: [number, number][] = [
  [0.01, 0.35], [5.1, 0.35], [5.6, 0], [6.3, 0.5], [7.6, 1.5], [8.9, 3.0], [9.8, 4.5], [10.5, 6.0], [11.0, 7.2],
  [11.35, 8.1], [11.45, 8.6], [11.35, 8.95], [11.1, 9.0], [10.85, 8.85], [10.7, 8.4], [10.55, 7.9],
];
/** Index of the rim's top in BOWL_PROFILE. */
const BOWL_RIM = 12;
/** The bowl's agave, as a scale on Agave 'Blue Glow''s mature 2 x 3 ft: about 14 in across and 10 in tall. */
const BOWL_AGAVE_SIZE = 0.42;
/** Soil (and top dressing) level inside the bowl, inches above its foot. */
const BOWL_SOIL = 7.9;

/**
 * The bowl as a lathe: u around, v up the outside by height (0.02 at the foot to 0.8 at the rim's top), then on down the
 * inside wall by length to 0.99 at the soil line.
 */
function bowlGeometry(): THREE.BufferGeometry {
  const pts = BOWL_PROFILE.map(([r, y]) => new THREE.Vector2(r * IN, y * IN));
  const g = new THREE.LatheGeometry(pts, 56);
  const top = BOWL_PROFILE[BOWL_RIM][1];
  const vs = BOWL_PROFILE.map(([, y]) => 0.02 + (Math.max(0, y) / top) * 0.78);
  vs[0] = 0.01;
  let inside = 0;
  const run: number[] = [0];
  for (let j = BOWL_RIM + 1; j < pts.length; j++) run.push((inside += pts[j].distanceTo(pts[j - 1])));
  for (let j = BOWL_RIM + 1; j < pts.length; j++) vs[j] = 0.8 + (run[j - BOWL_RIM] / inside) * 0.19;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const segs = 56;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < pts.length; j++) uv.setXY(i * pts.length + j, i / segs, vs[j]);
  return g.toNonIndexed();
}

export interface FountainSink {
  /** A static part, merged by material. */
  add(m: THREE.Material, g: THREE.BufferGeometry): void;
  /** An object of its own (water), in the feature's local space. */
  object(o: THREE.Object3D): void;
  /** A night light in local space (meters). */
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number): void;
  /** An emissive part that glows at night. */
  glow(m: THREE.MeshStandardMaterial): void;
  /** Animated water (keeps the frame loop drawing). */
  fall(m: THREE.ShaderMaterial): void;
  /** A material made here, disposed with the yard. */
  own(m: THREE.Material): void;
  /** A bed of loose pebbles: outline and holes in local inches, surface height in inches, stone color scale (wet stone). */
  pebbles(catalogId: string, outline: Vec2[], holes: Vec2[][], topIn: number, tint: [number, number, number]): void;
  /**
   * A plant standing on part of the feature: local position in meters. `size` (a scale on the catalog's mature size)
   * holds it at that size on the growth slider, as a plant kept in a container is.
   */
  plant(catalogId: string, x: number, y: number, z: number, size: number): void;
}

/** A warm LED strip material whose night glow also lights the water it is linked to (see linkGlow). */
function ledMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#f1e4cc', emissive: new THREE.Color('#ffb466'), emissiveIntensity: 0, roughness: 0.4 });
}

/**
 * The studio turns night accents up by setting each glow material's emissiveIntensity (to 7 at full night for a light
 * colored one). The water lit by this LED follows it through its uGlow uniform.
 */
function linkGlow(led: THREE.MeshStandardMaterial, water: THREE.ShaderMaterial) {
  let v = led.emissiveIntensity;
  Object.defineProperty(led, 'emissiveIntensity', {
    configurable: true,
    get: () => v,
    set: (x: number) => {
      v = x;
      water.uniforms.uGlow.value = Math.min(1, x / 7);
    },
  });
}

/** The bowl planter: bowl, soil, light gravel top dressing, and its plant. Base at (x, y, z) meters, local space. */
export function patinaBowl(sink: FountainSink, seed: string, x: number, y: number, z: number, planted: boolean) {
  const bowl = bowlGeometry();
  bowl.translate(x, y, z);
  sink.add(pbrMaterial('pf-bowl', patinaBowlSet(), { metalness: 0.12 }), bowl);
  const soilY = y + BOWL_SOIL * IN;
  const soil = new THREE.CircleGeometry(10.6 * IN, 36).rotateX(-Math.PI / 2).translate(x, soilY, z).toNonIndexed();
  // Under the gravel: the same gravel's tone, so gaps between stones read as more gravel, not bare soil.
  sink.add(plainMaterial('pf-bowl-gravel', { color: '#716d66', roughness: 1 }), soil);
  // Top dressing: a layer of light gray gravel, 3/8 to 3/4 in, in a few tones, over most of the soil.
  const r = rng(`${seed}-dressing`);
  const tones = ['#9e998f', '#8a857d', '#aaa59c', '#7a766f'].map((h) => plainMaterial(`pf-dressing-${h}`, { color: h, roughness: 0.75 }));
  for (let k = 0; k < 260; k++) {
    const a = r() * Math.PI * 2, rr = (planted ? 2.8 + Math.sqrt(r()) * 7.2 : Math.sqrt(r()) * 10) * IN;
    const s = (0.38 + r() * 0.4) * IN;
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    g.scale(s * (1 + r() * 0.4), s * 0.6, s);
    g.rotateY(r() * 6.28);
    g.translate(x + Math.cos(a) * rr, soilY + s * 0.12 + r() * 0.1 * IN, z + Math.sin(a) * rr);
    sink.add(tones[Math.floor(r() * tones.length)], g);
  }
  // Agave 'Blue Glow' as in the photos: a full rosette about 14 in across and 10 in tall, held there by the bowl.
  if (planted) sink.plant('agave', x, soilY - 0.01, z, BOWL_AGAVE_SIZE);
}

/** The three-pillar water feature, built into `sink` in local space (front +z). */
export function pillarFountain(sink: FountainSink, seed: string, bowls: boolean) {
  const stucco = pbrMaterial('pf-stucco', pillarStuccoSet());
  const ledger = pbrMaterial('pf-ledger', ledgerStoneSet());
  const copper = agedCopper();
  const curb = catalogMaterial(FOUNTAIN_CURB);
  const pebbleGround = catalogMaterial(FOUNTAIN_PEBBLE, { color: new THREE.Color(...WET_PEBBLE) });
  const L = P.length, D = P.depth;
  const zFront = D / 2, zBack = -D / 2;
  const pz = P.front - P.pillarD / 2; // pillar center line
  const xs = [-P.pitch, 0, P.pitch];

  // Curb: the front run in seven full 24 in units (joints 12 in either side of center), returns and a back run.
  const cH = P.curbTop - P.curbBottom;
  sink.add(curb, boxIn(L, cH, P.curbT, 0, P.curbBottom, zFront - P.curbT / 2, 12 * IN, 0));
  for (const sx of [-1, 1]) sink.add(curb, boxIn(P.curbT, cH, D - P.curbT, sx * (L / 2 - P.curbT / 2), P.curbBottom, -P.curbT / 2, 0.3 * sx, 0));
  sink.add(curb, boxIn(L - 2 * P.curbT, cH, P.curbT, 0, P.curbBottom, zBack + P.curbT / 2, 0, 0));
  // The basin's floor under the stones, in the pebbles' own ground texture.
  const inX = L / 2 - P.curbT, inZ0 = zBack + P.curbT, inZ1 = zFront - P.curbT;
  sink.add(pebbleGround, boxIn(inX * 2, P.pebbleTop - 1 - P.curbBottom, inZ1 - inZ0, 0, P.curbBottom, (inZ0 + inZ1) / 2));

  // Pillars, each with its own patch of the stucco, a 3/8 in round on the edges.
  xs.forEach((x, k) => {
    sink.add(stucco, boxIn(P.pillarW, P.pillarH + 2, P.pillarD, x, -2, pz, 0.41 * k + 0.2, 0.67 * k, 0.375));
  });
  // Panels between them: ledger stone 1 1/2 in thick on a stucco-finished wall whose back is flush with the pillars'.
  const panelZ0 = P.front - P.recess, panelZ1 = P.front - P.pillarD, veneer = 1.5;
  for (const sx of [-1, 1]) {
    const x = (sx * P.pitch) / 2;
    sink.add(ledger, boxIn(P.panelW + 0.5, P.panelH + 2, veneer, x, -2, panelZ0 - veneer / 2, 0.29 * (sx + 1), 0.13));
    sink.add(stucco, boxIn(P.panelW + 0.5, P.panelH + 2, panelZ0 - veneer - panelZ1, x, -2, (panelZ0 - veneer + panelZ1) / 2, 0.83 + sx * 0.2, 0.31));
  }

  // Wet arches above the pebbles: on each pillar's front (the outer ones under their scupper), low bands on the inner
  // faces beside the falls.
  const wet = wetMaterial();
  xs.forEach((x, k) => {
    const outer = k !== 1;
    sink.add(wet, decalIn(outer ? 27 : 31, outer ? 11 : 5, x, P.pebbleTop - 0.5, P.front + 0.02));
  });
  for (const sx of [-1, 1]) for (const side of [-1, 1]) {
    // Inner faces of the pillars that frame each panel.
    const faceX = (sx * P.pitch) / 2 + (side * P.panelW) / 2;
    sink.add(wet, decalIn(P.recess - 1, 6, faceX - side * 0.02, P.pebbleTop - 0.5, P.front - P.recess / 2, (-side * Math.PI) / 2));
  }

  // The stone below each spillway is darker where the splash keeps it wet.
  const wetStone = plainMaterial('pf-wet-stone', { color: '#2b2018', roughness: 0.4, transparent: true, opacity: 0.6, alphaMap: wetBandTexture(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const sx of [-1, 1]) sink.add(wetStone, decalIn(P.panelW, 26, (sx * P.pitch) / 2, P.pebbleTop - 0.5, P.front - P.recess + 0.03));

  // Spillways: 12 in copper sheer descents, a warm LED in each lip, and the sheet.
  const splash = splashMaterial();
  sink.fall(splash);
  for (const sx of [-1, 1]) {
    const x = (sx * P.pitch) / 2;
    const face = P.front - P.recess;
    sink.add(copper, boxIn(P.spillW + 0.5, 1.5, 3, x, P.lipY, face + 1.5));
    sink.add(copper, boxIn(P.spillW + 0.5, 0.25, 0.6, x, P.lipY - 0.1, face + 3.1));
    sink.add(plainMaterial('pf-spill-mouth', { color: '#0c0b0a', roughness: 0.9 }), boxIn(P.spillW - 0.5, 0.2, 0.15, x, P.lipY + 0.12, face + 3.0));
    const led = ledMaterial();
    sink.own(led);
    sink.glow(led);
    sink.add(led, boxIn(P.spillW - 1, 0.18, 0.8, x, P.lipY - 0.28, face + 2.6));
    const water = clearFallMaterial();
    linkGlow(led, water);
    sink.fall(water);
    const top = new THREE.Vector3(x * IN, (P.lipY + 0.05) * IN, (face + 3.2) * IN);
    const sheet = new THREE.Mesh(sheetGeometry(top, (P.pebbleTop + 0.4) * IN, (P.spillW - 0.5) * IN, 6.8 * IN, 0.42), water);
    sheet.renderOrder = 3;
    sink.object(sheet);
    sheet.geometry.computeBoundingBox();
    const land = sheet.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(10 * IN, 4.5 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(x * IN, (P.pebbleTop + 0.6) * IN, land.max.z - 0.5 * IN);
    foam.renderOrder = 3;
    sink.object(foam);
    sink.light(x * IN, (P.lipY - 2) * IN, (face + 8) * IN, '#ffc27a', 1.7, 2.2);
  }

  // Scuppers: copper pipe centered low on each outer pillar, a flange at the stucco, tipped 5 degrees down, pouring.
  for (const sx of [-1, 1]) {
    const x = sx * P.pitch, y = P.scupperY;
    const tilt = (5 * Math.PI) / 180, len = 5.5;
    const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    const pipe = new THREE.CylinderGeometry(0.625 * IN, 0.625 * IN, len * IN, 14, 1, true);
    pipe.rotateX(Math.PI / 2 + tilt);
    const mid = new THREE.Vector3(x, y, P.front).multiplyScalar(IN).addScaledVector(dir, (len / 2) * IN);
    pipe.translate(mid.x, mid.y, mid.z);
    sink.add(copper, pipe.toNonIndexed());
    const flange = new THREE.CylinderGeometry(0.95 * IN, 0.95 * IN, 0.2 * IN, 18).rotateX(Math.PI / 2).translate(x * IN, y * IN, (P.front + 0.1) * IN);
    sink.add(copper, flange.toNonIndexed());
    const mouth = new THREE.Vector3(x, y, P.front).multiplyScalar(IN).addScaledVector(dir, len * IN);
    const bore = new THREE.CircleGeometry(0.5 * IN, 12);
    bore.lookAt(dir);
    bore.translate(mouth.x, mouth.y, mouth.z);
    sink.add(plainMaterial('pf-spill-mouth', { color: '#0c0b0a', roughness: 0.9 }), bore.toNonIndexed());
    const water = clearFallMaterial();
    sink.fall(water);
    const stream = new THREE.Mesh(streamGeometry(mouth.clone().addScaledVector(dir, -0.002), dir, 0.45, (P.pebbleTop + 0.3) * IN, 0.42 * IN), water);
    stream.renderOrder = 3;
    sink.object(stream);
    stream.geometry.computeBoundingBox();
    const bb = stream.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(4 * IN, 4 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(x * IN, (P.pebbleTop + 0.6) * IN, bb.max.z);
    foam.renderOrder = 3;
    sink.object(foam);
  }

  // Pebbles: the whole basin floor, around the pillars and in front of the panels.
  const pad = 0.25;
  const holes: Vec2[][] = xs.map((x) => rectIn(x - P.pillarW / 2 - pad, P.front - P.pillarD - pad, x + P.pillarW / 2 + pad, P.front + pad));
  for (const sx of [-1, 1]) holes.push(rectIn((sx * P.pitch) / 2 - P.panelW / 2 - pad, P.front - P.pillarD - pad, (sx * P.pitch) / 2 + P.panelW / 2 + pad, P.front - P.recess + pad));
  sink.pebbles(FOUNTAIN_PEBBLE, rectIn(-inX, inZ0, inX, inZ1), holes, P.pebbleTop, WET_PEBBLE);

  if (bowls) xs.forEach((x, k) => patinaBowl(sink, `${seed}-bowl${k}`, x * IN, P.pillarH * IN, pz * IN, true));
}

function rectIn(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}
