import * as THREE from 'three';

/**
 * Sun position, light moods and an analytic sky dome with clouds, sun disc,
 * stars and a moon. The same sky function is used for the visible dome and
 * for the image-based lighting environment.
 */

export type Mood = 'afternoon' | 'golden' | 'blue' | 'night';

export const MOODS: { id: Mood; label: string }[] = [
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'blue', label: 'Blue hour' },
  { id: 'night', label: 'Night' },
];

const RAD = Math.PI / 180;

export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
}

/** Solar elevation and azimuth (degrees, azimuth clockwise from north) at local solar time. */
export function solarPosition(latDeg: number, doy: number, solarHour: number): { elevation: number; azimuth: number } {
  const decl = 23.44 * Math.sin(((360 / 365) * (284 + doy)) * RAD) * RAD;
  const lat = latDeg * RAD;
  const H = (15 * (solarHour - 12)) * RAD;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { elevation: el / RAD, azimuth: ((az / RAD) % 360 + 360) % 360 };
}

/** Local solar time of sunset. */
export function sunsetHour(latDeg: number, doy: number): number {
  const decl = 23.44 * Math.sin(((360 / 365) * (284 + doy)) * RAD) * RAD;
  // Sun center 0.83 degrees below the horizon at sunset.
  const c = (Math.sin(-0.83 * RAD) - Math.sin(latDeg * RAD) * Math.sin(decl)) / (Math.cos(latDeg * RAD) * Math.cos(decl));
  const H0 = Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
  return 12 + H0 / 15;
}

/** Solar hour that gives each mood on a given day. */
export function moodHour(mood: Mood, latDeg: number, doy: number): number {
  const set = sunsetHour(latDeg, doy);
  switch (mood) {
    case 'afternoon': return Math.min(15.5, set - 2.5);
    case 'golden': return set - 0.55;
    case 'blue': return set + 0.45;
    case 'night': return set + 2.2;
  }
}

/**
 * World direction toward an azimuth/elevation. World +x is plan-right,
 * world +z is plan-down. `northAngleDeg` is clockwise from plan-up to north.
 */
export function worldDir(azimuthDeg: number, elevationDeg: number, northAngleDeg: number): THREE.Vector3 {
  // Bearing measured clockwise from plan-up.
  const b = (azimuthDeg + northAngleDeg) * RAD;
  const el = elevationDeg * RAD;
  return new THREE.Vector3(Math.sin(b) * Math.cos(el), Math.sin(el), -Math.cos(b) * Math.cos(el)).normalize();
}

interface Key {
  el: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunI: number;
  exposure: number;
}

/** Palette keyed by sun elevation in degrees. */
const KEYS: Key[] = [
  { el: -24, zenith: '#04070f', horizon: '#0b1222', sun: '#000000', sunI: 0, exposure: 1.0 },
  { el: -12, zenith: '#0b1530', horizon: '#1d2846', sun: '#000000', sunI: 0, exposure: 1.0 },
  { el: -5, zenith: '#2a4a8c', horizon: '#7a7fa8', sun: '#000000', sunI: 0, exposure: 1.0 },
  { el: -1.5, zenith: '#2f4a85', horizon: '#c98a6c', sun: '#ff6a30', sunI: 0.15, exposure: 1.0 },
  { el: 2, zenith: '#3d5d99', horizon: '#eaa06a', sun: '#ff8640', sunI: 1.3, exposure: 1.0 },
  { el: 7, zenith: '#4a72b4', horizon: '#ebc39a', sun: '#ffb36e', sunI: 2.4, exposure: 1.0 },
  { el: 16, zenith: '#4f7fc4', horizon: '#d8d8d0', sun: '#ffdcb0', sunI: 3.0, exposure: 1.0 },
  { el: 35, zenith: '#4a82cc', horizon: '#c3d5e6', sun: '#fff1de', sunI: 3.3, exposure: 1.0 },
  { el: 70, zenith: '#3f79c8', horizon: '#bfd4ea', sun: '#fff8ee', sunI: 3.4, exposure: 1.0 },
];

function lerpKey(el: number) {
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (el - a.el) / (b.el - a.el)));
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return {
    zenith: c(a.zenith, b.zenith),
    horizon: c(a.horizon, b.horizon),
    sun: c(a.sun, b.sun),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
  };
}

export interface SkyState {
  sunDir: THREE.Vector3;
  sunElevation: number;
  /** Color and intensity of the key light (sun by day, moon at night). */
  keyColor: THREE.Color;
  keyIntensity: number;
  keyDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** 0 by day, 1 at full night: drives lamps, windows, stars. */
  night: number;
  exposure: number;
  fogDensity: number;
  envIntensity: number;
  cloudCover: number;
}

export function skyState(latDeg: number, doy: number, solarHour: number, northAngleDeg: number, cloudCover = 0.35): SkyState {
  const { elevation, azimuth } = solarPosition(latDeg, doy, solarHour);
  const sunDir = worldDir(azimuth, elevation, northAngleDeg);
  const k = lerpKey(elevation);
  const night = Math.max(0, Math.min(1, (-elevation - 1) / 9));
  // Moon: opposite side of the sky, fixed comfortable height.
  const moonDir = worldDir((azimuth + 160) % 360, 38, northAngleDeg);
  const moonMix = Math.max(0, Math.min(1, (-elevation - 2) / 6));
  const keyDir = elevation > 0 ? sunDir.clone() : moonDir;
  const keyColor = elevation > 0 ? k.sun.clone() : new THREE.Color('#9db3e6');
  const keyIntensity = elevation > 0 ? k.sunI : 0.32 * moonMix;
  // Exposure lifts dim scenes the way a camera's auto exposure would.
  const exposure = elevation > 8 ? 0.82 : elevation > 0 ? 0.82 + (8 - elevation) * 0.035 : 1.1 + Math.min(1, -elevation / 10) * 0.9;
  return {
    sunDir,
    sunElevation: elevation,
    keyColor,
    keyIntensity,
    keyDir,
    moonDir,
    zenith: k.zenith,
    horizon: k.horizon,
    night,
    exposure,
    fogDensity: 0.0042 + (elevation < 6 ? 0.002 : 0),
    envIntensity: elevation > 0 ? 4.2 : 2.2 + night * 1.0,
    cloudCover,
  };
}

/* ------------------------------------------------------------------ */
/* Sky dome                                                             */
/* ------------------------------------------------------------------ */

const SKY_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uSunVisible;
uniform float uNight;
uniform float uCloud;
uniform float uTime;
uniform float uEnvPass;
uniform vec3 uGround;

float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }

vec3 skyColor(vec3 dir){
  float y = dir.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
  // Warm band on the horizon toward the sun when it is low.
  vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4);
  vec3 dh = normalize(vec3(dir.x, 0.0, dir.z) + 1e-4);
  float low = 1.0 - smoothstep(0.0, 0.45, uSunDir.y);
  float toward = pow(max(dot(dh, sh), 0.0), 2.0);
  col += uSunColor * 0.35 * low * toward * exp(-abs(y) * 7.0) * (1.0 - uNight);
  // Sun glow.
  float mu = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(mu, 8.0) * 0.22 + pow(mu, 64.0) * 0.6) * uSunVisible;
  // Below the horizon: dim ground haze. For lighting, warm light bounced off the ground.
  if (y < 0.0) col = uEnvPass > 0.5 ? mix(uHorizon * 0.5, uGround, smoothstep(0.0, -0.15, y)) : mix(uHorizon * 0.62, uHorizon * 0.32, smoothstep(0.0, -0.4, y));

  // Clouds on a curved layer.
  if (y > 0.0 && uCloud > 0.01) {
    vec2 uv = dir.xz / (y + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv * 1.3);
    float d = smoothstep(1.0 - uCloud * 0.9, 1.15 - uCloud * 0.7, n);
    float lit = 0.6 + 0.4 * fbm(uv * 1.3 + uSunDir.xz * 0.12);
    vec3 cc = mix(uHorizon * 0.9, mix(vec3(1.0), uSunColor, 0.55) * 1.15, lit * (1.0 - uNight));
    cc = mix(cc, uZenith * 0.35, uNight * 0.85);
    cc += uSunColor * pow(mu, 6.0) * 0.6 * (1.0 - uNight);
    col = mix(col, cc, d * smoothstep(0.0, 0.12, y) * 0.85);
  }

  // Stars and moon at night (not in the lighting pass).
  if (uEnvPass < 0.5) {
    if (uNight > 0.0 && y > 0.0) {
      vec2 g = dir.xz / (y + 0.4) * 180.0;
      float s = h21(floor(g));
      float star = step(0.9965, s) * smoothstep(0.35, 0.0, length(fract(g) - 0.5));
      col += vec3(star) * uNight * 1.6 * smoothstep(0.02, 0.3, y);
    }
    float mm = dot(dir, uMoonDir);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.99985, 0.99992, mm) * 6.0 * uNight;
    col += vec3(0.5, 0.6, 0.8) * pow(max(mm, 0.0), 300.0) * 0.4 * uNight;
    // Sun disc, bright enough to bloom.
    col += uSunColor * smoothstep(0.99988, 0.99993, mu) * 40.0 * uSunVisible;
  }
  if (uEnvPass > 0.5 && y >= 0.0) {
    // Soften the blue cast of skylight on surfaces.
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(1.03, 1.0, 0.95), 0.55);
  }
  return col;
}
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunVisible: { value: 1 },
    uNight: { value: 0 },
    uCloud: { value: 0.35 },
    uTime: { value: 0 },
    uEnvPass: { value: 0 },
    uGround: { value: new THREE.Color(0.1, 0.09, 0.07) },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = (modelMatrix * vec4(position, 0.0)).xyz;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: SKY_GLSL + /* glsl */ `
        varying vec3 vDir;
        void main(){
          gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.scale.setScalar(1000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  apply(s: SkyState) {
    const u = this.uniforms;
    u.uZenith.value.copy(s.zenith);
    u.uHorizon.value.copy(s.horizon);
    u.uSunDir.value.copy(s.sunDir);
    u.uSunColor.value.copy(s.sunElevation > -2 ? lerpKey(Math.max(s.sunElevation, -1.5)).sun : new THREE.Color(0, 0, 0));
    u.uSunVisible.value = s.sunElevation > -1 ? 1 : 0;
    u.uMoonDir.value.copy(s.moonDir);
    u.uNight.value = s.night;
    u.uCloud.value = s.cloudCover;
    // Ground bounce: a warm, mid-gray yard lit by the key light and sky.
    u.uGround.value.setRGB(0.42, 0.37, 0.3).multiplyScalar(0.06 + 0.2 * s.keyIntensity).add(s.zenith.clone().multiplyScalar(0.12));
  }
}

/** Keeps the sky dome centered on the camera. */
export function followCamera(sky: SkyDome, cam: THREE.Camera) {
  sky.mesh.position.copy(cam.position);
}
