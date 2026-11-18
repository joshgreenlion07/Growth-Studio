import * as THREE from 'three';
import { GLOBAL } from '../engine/foliage';
import { rng } from '../siteplan/geometry';

/*
 * Fire. A gas fire is drawn as many small flame tongues standing along its burner's real shape: a straight line
 * burner, a ring, a round pan, or a grill's burner tubes. Each tongue is a card that faces the camera. Its shape,
 * height and sway are worked out per pixel from rising noise, so the flame licks, flickers and tears into separate
 * tips the way a gas flame does, and its top leans downwind with the scene's wind (gusting). The tongues of one
 * burner are one mesh and one draw call.
 *
 * Tongues overlap: where several meet, the fire's body is brighter and whiter, as a real flame's core is. The cards
 * add their light and dim what is behind them a little (more by day), so a flame reads orange against sunlit paving
 * and glows at night. A gas fire on glass or lava shows a little blue at its ports. A grill's flames are short and
 * blue with orange tips.
 */

export type FireStyle = 'gas' | 'grill';

/** One flame tongue: its base in the feature's local space and its width and height, meters. */
export interface Tongue {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

/**
 * A straight line burner `length` long along local x, centered on (x, y, z): one row of licks along it, tallest over
 * the middle (where the gas pressure is highest) and lower toward the ends, with a few wide, soft tongues behind them
 * for the flame's body. `height` is the tallest lick; `across` how far the ports wander off the line.
 */
export function lineBurner(length: number, y: number, height: number, seed: string, o: { x?: number; z?: number; across?: number } = {}): Tongue[] {
  const r = rng(`${seed}-line`);
  const x0 = o.x ?? 0, z0 = o.z ?? 0, across = o.across ?? 0.02;
  const out: Tongue[] = [];
  const crown = (u: number) => 0.6 + 0.4 * Math.cos((u * Math.PI) / 2);
  const step = Math.max(0.025, height * 0.12);
  const n = Math.max(2, Math.round(length / step));
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * 2 - 1;
    const h = height * crown(u) * (0.72 + r() * 0.4);
    out.push({ x: x0 + (u * length) / 2 + (r() - 0.5) * step * 0.6, y, z: z0 + (r() - 0.5) * across, w: h * (0.38 + r() * 0.12), h });
  }
  // The body: a low, unbroken sheet of flame along the whole burner that the licks rise out of.
  const m = Math.max(2, Math.round(length / (height * 0.6)));
  for (let i = 0; i < m; i++) {
    const u = ((i + 0.5) / m) * 2 - 1;
    const h = height * crown(u) * (0.5 + r() * 0.12);
    out.push({ x: x0 + ((u * length) / 2) * 0.92, y, z: z0 + (r() - 0.5) * across * 0.5, w: Math.min(h * 0.9, (length / m) * 1.15), h });
  }
  return out;
}

/**
 * A round ring burner of `radius` centered on (x, y, z) under lava rock or glass: licks around the ring, leaning in
 * a little toward the middle as a ring fire's flames gather, and a soft body over the center.
 */
export function ringBurner(radius: number, y: number, height: number, seed: string, o: { x?: number; z?: number } = {}): Tongue[] {
  const r = rng(`${seed}-ring`);
  const x0 = o.x ?? 0, z0 = o.z ?? 0;
  const out: Tongue[] = [];
  const n = Math.max(6, Math.round((2 * Math.PI * radius) / Math.max(0.03, height * 0.13)));
  for (let i = 0; i < n; i++) {
    const a = ((i + r() * 0.6) / n) * Math.PI * 2;
    const rr = radius * (0.85 + r() * 0.2);
    const h = height * (0.7 + r() * 0.4);
    out.push({ x: x0 + Math.cos(a) * rr, y, z: z0 + Math.sin(a) * rr, w: h * (0.36 + r() * 0.12), h });
  }
  // The body: the flames from all round the ring meet over the middle and stand tallest there.
  const m = Math.max(3, Math.round(radius / 0.06));
  for (let i = 0; i < m; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * radius * 0.55;
    const h = height * (0.85 + r() * 0.3);
    out.push({ x: x0 + Math.cos(a) * rr, y, z: z0 + Math.sin(a) * rr, w: h * 0.5, h });
  }
  return out;
}

/** A round pan burner (a bowl's fire): flames over the whole disc of `radius`, tallest in the middle. */
export function panBurner(radius: number, y: number, height: number, seed: string, o: { x?: number; z?: number } = {}): Tongue[] {
  const r = rng(`${seed}-pan`);
  const x0 = o.x ?? 0, z0 = o.z ?? 0;
  const out: Tongue[] = [];
  const n = Math.max(6, Math.round((Math.PI * radius * radius) / (height * height * 0.03)));
  for (let i = 0; i < n; i++) {
    // Sunflower spread: even over the disc without rows.
    const rr = radius * Math.sqrt((i + 0.5) / n) * (0.9 + r() * 0.1);
    const a = i * 2.39996 + r() * 0.3;
    const h = height * (1 - 0.45 * (rr / radius) ** 2) * (0.75 + r() * 0.35);
    out.push({ x: x0 + Math.cos(a) * rr, y, z: z0 + Math.sin(a) * rr, w: h * (0.3 + r() * 0.12), h });
  }
  return out;
}

/**
 * A grill burner tube's ports from `a` to `b` (local points on the tube's top): two rows of short blue flames, one
 * each side of the tube's crown, a port every `spacing` meters.
 */
export function tubeBurner(a: THREE.Vector3, b: THREE.Vector3, height: number, seed: string, spacing = 0.022, side = 0.011): Tongue[] {
  const r = rng(`${seed}-tube`);
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  d.normalize();
  const across = new THREE.Vector3(-d.z, 0, d.x);
  const n = Math.max(2, Math.round(len / spacing));
  const out: Tongue[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const h = height * (0.8 + r() * 0.35);
      out.push({ x: a.x + d.x * len * t + across.x * s * side, y: a.y + d.y * len * t, z: a.z + d.z * len * t + across.z * s * side, w: h * 0.55, h });
    }
  }
  return out;
}

const VERT = /* glsl */ `
  attribute vec2 aCorner;
  attribute vec4 aTongue;
  uniform float uTime;
  uniform float uWind;
  uniform vec2 uWindDir;
  varying vec2 vUv;
  varying float vSeed;
  varying float vWeight;
  float hash1(float n){ return fract(sin(n) * 43758.5453); }
  float noise1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash1(i), hash1(i + 1.0), f); }
  void main(){
    float s = aTongue.z;
    float t = uTime;
    // Flicker: each tongue's height breathes slowly and jumps quickly, on its own beat.
    float breathe = noise1(t * 1.6 + s * 31.0);
    float jump = noise1(t * 5.7 + s * 17.0);
    float h = aTongue.y * (0.62 + 0.24 * breathe + 0.34 * jump * jump);
    float w = aTongue.x * (0.85 + 0.15 * noise1(t * 2.9 + s * 11.0));
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    // Turned to the camera about the vertical, and tipped back from it when seen from above, so a tongue never shows
    // edge on: the view straight down sees short flames, as one does looking down into a fire.
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 right = vec3(camRight.x, 0.0, camRight.z);
    right = dot(right, right) > 1e-8 ? normalize(right) : vec3(1.0, 0.0, 0.0);
    vec3 up = normalize(vec3(0.0, 1.0, 0.0) + vec3(camUp.x, 0.0, camUp.z) * 0.6);
    // The top leans downwind, more toward the tip, with gusts.
    float gust = 0.55 + 0.45 * noise1(t * 0.9 + s * 3.0);
    vec3 lean = vec3(uWindDir.x, 0.0, uWindDir.y) * uWind * 0.5 * gust;
    float y = aCorner.y;
    vec3 p = base + right * aCorner.x * w + up * y * h + lean * h * y * y;
    vUv = aCorner;
    vSeed = s;
    vWeight = aTongue.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOn;
  uniform vec3 uSunColor;
  varying vec2 vUv;
  varying float vSeed;
  varying float vWeight;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  void main(){
    float t = uTime;
    float y = vUv.y;
    // Turbulence rising through the flame faster than the flame itself, so shapes run up it and off the tip.
    float n1 = fbm(vec2(vUv.x * 1.3 + vSeed * 13.0, y * 1.8 - t * 2.6));
    float n2 = fbm(vec2(vUv.x * 3.1 - vSeed * 7.0, y * 3.6 - t * 4.2));
    // Sway: the upper flame is pushed side to side, with a quicker lick on top.
    float x = vUv.x + (n1 - 0.47) * 1.1 * y + sin(t * 4.7 + vSeed * 40.0 + y * 3.0) * 0.07 * y;
    // A teardrop, full just above the ports and narrowing to the tip.
    float hw = 0.42 * (0.55 + 0.45 * smoothstep(0.0, 0.18, y)) * pow(max(0.0, 1.0 - y), 0.8);
    float body = smoothstep(hw, hw * 0.25, abs(x));
    // The upper flame tears into separate licks and loose tips.
    float tear = smoothstep(0.1 + y * 0.5, 0.36 + y * 0.45, n2 + (1.0 - y) * 0.45);
    float d = body * mix(1.0, tear, smoothstep(0.2, 0.75, y)) * smoothstep(0.0, 0.06, y);
    if (d < 0.004) discard;
    float day = smoothstep(0.1, 1.2, length(uSunColor));
  #if GRILL
    // A grill's gas flame: a blue cone, lighter at its core, with an orange flick at the tip now and then.
    float heat = clamp(d * (1.2 - y * 0.6), 0.0, 1.0);
    vec3 c = mix(vec3(0.04, 0.1, 0.9), vec3(0.22, 0.42, 1.0), heat);
    c = mix(c, vec3(1.0, 0.42, 0.06), smoothstep(0.55, 0.95, y) * smoothstep(0.4, 0.65, n2));
    float e = d * vWeight * mix(0.9, 1.3, day);
    float a = d * vWeight * mix(0.15, 0.35, day);
  #else
    // Color by heat: a pale yellow core low in the flame, then yellow, orange, and a red edge at the tips.
    float heat = clamp(d * (1.1 - y * 0.8), 0.0, 1.0);
    vec3 c = mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.28, 0.03), smoothstep(0.0, 0.3, heat));
    c = mix(c, vec3(1.0, 0.55, 0.12), smoothstep(0.28, 0.65, heat));
    c = mix(c, vec3(1.0, 0.76, 0.4), smoothstep(0.7, 1.0, heat));
    // Blue where the gas leaves the ports.
    c = mix(c, vec3(0.22, 0.36, 1.0), (1.0 - smoothstep(0.0, 0.12, y)) * body * 0.5);
    float e = d * vWeight * mix(1.9, 2.8, day);
    float a = d * vWeight * mix(0.2, 0.5, day);
  #endif
    gl_FragColor = vec4(c * e * uOn, a * uOn);
  }`;

/** A fire's material: one per feature and style, so each fire is lit and put out on its own (uOn). */
export function fireMaterial(style: FireStyle = 'gas'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uWind: GLOBAL.uWind, uWindDir: GLOBAL.uWindDir, uSunColor: GLOBAL.uSunColor, uOn: { value: 0 } },
    defines: { GRILL: style === 'grill' ? 1 : 0 },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Premultiplied: the flame adds its light and dims what is behind it by its alpha.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/**
 * The tongues as one mesh, placed at their middle (so the mesh's position is the fire's, for the Hand tool's anchor).
 * The cards are opened in the vertex shader; the bounds are set by hand to hold the tallest flame.
 */
export function fireMesh(tongues: Tongue[], material: THREE.ShaderMaterial): THREE.Mesh {
  const c = new THREE.Vector3();
  let y0 = Infinity, hMax = 0;
  for (const t of tongues) {
    c.x += t.x;
    c.z += t.z;
    y0 = Math.min(y0, t.y);
    hMax = Math.max(hMax, t.h);
  }
  c.x /= tongues.length;
  c.z /= tongues.length;
  c.y = y0;
  const n = tongues.length;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), tg = new Float32Array(n * 16);
  const idx: number[] = [];
  const corners = [-1, 0, 1, 0, 1, 1, -1, 1];
  let reach = 0;
  // Each tongue's share of the light: where many stand together (the body of a line or ring fire) each gives less, so
  // a fire is as bright with many tongues as with few and only its core, where they overlap most, burns whitest.
  const weight = tongues.map((a) => {
    let k = 0;
    for (const b of tongues) k += Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / (0.5 * (a.w + b.w)));
    return 1 / Math.pow(k, 0.75);
  });
  tongues.forEach((t, i) => {
    const seed = (i * 0.6180339 + t.x * 3.7 + t.z * 5.3) % 1;
    reach = Math.max(reach, Math.hypot(t.x - c.x, t.z - c.z) + t.w);
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set([t.x - c.x, t.y - c.y, t.z - c.z], v * 3);
      corner.set([corners[k * 2], corners[k * 2 + 1]], v * 2);
      tg.set([t.w, t.h, seed, weight[i]], v * 4);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aTongue', new THREE.BufferAttribute(tg, 4));
  g.setIndex(idx);
  // Room for the tallest flame, its sway and a strong wind's lean.
  const top = hMax * 1.25;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-reach - top * 0.6, 0, -reach - top * 0.6), new THREE.Vector3(reach + top * 0.6, top, reach + top * 0.6));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(g, material);
  mesh.position.copy(c);
  mesh.renderOrder = 3;
  // Flames are light, not stuff: they cast no shadow and the pointer passes through them.
  mesh.castShadow = false;
  mesh.raycast = () => {};
  return mesh;
}
