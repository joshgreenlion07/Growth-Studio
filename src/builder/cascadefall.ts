import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import type { Vec2 } from '../siteplan/types';
import { GLOBAL } from '../engine/foliage';
import { smooth } from '../engine/noise';
import { catalogMaterial, pbrMaterial, plainMaterial } from './materials';
import { ROCK_GRAIN_MEAN, rockPittedSet } from '../engine/rock-surfaces';
import { clearFallMaterial, ledMaterial, linkGlow, sheetGeometry, splashMaterial, type FountainSink } from './pillarfountain';
import { boulderGeometry, boulderMaterial } from './waterrock';

/*
 * Twin cascade boulder waterfall (pondless): a mound of boulders with a small pool at the back center, fed by a spill
 * from the top stone, and two channels that leave the pool and wind down to the left and to the right, each stepping
 * down four falls over irregular boulder lips, to one shallow river rock basin at the front, at the patio edge. River rock lines
 * the channels and the basin (1 1/2-3 in on the floors, 3-5 in along the sides, 4-8 in round the basin), large
 * boulders (the library's moss rock and Canyon Tech boulders) make the outside banks, and planting pockets in the rock
 * hold a few grasses and perennials (an option). A warm light sits under the water at the foot of every fall.
 *
 * Drawn from a design rendering of the feature (no built job yet): the proportions are read from it. Default 16 ft wide
 * x 14 ft deep, 7 1/2 ft to the top of the back stone; the sizes scale the whole layout (siteplan/catalog.ts).
 *
 * Local space: x across, +z out the front (toward the patio), y up from the ground at the feature's spot; centered on
 * the footprint.
 */

const FT = 0.3048;
/** The medium size the layout below is drawn at, meters (W x D x H). */
export const CASCADE_MEDIUM: [number, number, number] = [16 * FT, 14 * FT, 7.5 * FT];

/** The stone lining the water. */
const FLOOR_ROCK = 'river-rock-1-half-3';
const SIDE_ROCK = 'river-rock-3-5';
const RIM_ROCK = 'river-rock-4-8';
const MOUND_ROCK = 'river-cobble-4-8';
/** River rock kept wet by the water is darker than the dry stone its colors were taken from. */
const WET: [number, number, number] = [0.62, 0.56, 0.5];
const DAMP: [number, number, number] = [0.8, 0.76, 0.72];
const DARK_WET: [number, number, number] = [0.42, 0.39, 0.36];

/** What the waterfall needs besides the fountain sink: stone beds on a shaped surface and aimed lights. */
export interface CascadeSink extends FountainSink {
  /**
   * A loose-stone bed over part of the feature: an outline (local meters) holding it, where in it stones go and the
   * surface they lie on (local meters), and the stones' color scale (wet stone).
   */
  stones(catalogId: string, outline: Vec2[], inside: (x: number, z: number) => boolean, height: (x: number, z: number) => number, tint: [number, number, number]): void;
  /** An aimed light (engine/landlights.ts) at a local point, along a local direction. */
  beam(x: number, y: number, z: number, dir: THREE.Vector3, lumens: number, beamDeg: number): void;
}

/* ------------------------------------------------------------------ */
/* Water surfaces                                                       */
/* ------------------------------------------------------------------ */

/**
 * Shallow running water over stone: clear and a little brown-dark, so the river rock shows through, with the sky's sheen
 * at a glancing angle and small ripples running downstream (uv.y in meters along the flow), whiter just below a fall
 * (aFoam), and a warm glow from the fall's light at night (uGlow). `uAlpha` thins it (water among the basin's stones).
 */
function runMaterial(alpha = 1, sheenK = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor, uGlow: { value: 0 }, uAlpha: { value: alpha }, uSheen: { value: sheenK } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aFoam;
      varying vec2 vUv; varying float vFoam; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv; vFoam = aFoam;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; uniform float uGlow; uniform float uAlpha; uniform float uSheen;
      varying vec2 vUv; varying float vFoam; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = uTime;
        float r1 = n(vec2(vUv.x * 9.0, vUv.y * 7.0 - t * 1.9));
        float r2 = n(vec2(vUv.x * 23.0 + 3.1, vUv.y * 17.0 - t * 3.2));
        float rip = r1 * 0.6 + r2 * 0.4;
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        float churn = vFoam * smoothstep(0.42, 0.78, n(vec2(vUv.x * 14.0 - t * 0.7, vUv.y * 12.0 - t * 2.6)) * 0.6 + n(vec2(vUv.x * 31.0, vUv.y * 27.0 - t * 4.0)) * 0.4);
        float day = 0.22 + length(uSunColor) * 0.34;
        float a = clamp(0.16 + fres * 0.5 + smoothstep(0.55, 0.95, rip) * 0.12 + churn * 0.5, 0.0, 0.85) * uAlpha;
        vec3 sheen = vec3(0.6, 0.68, 0.76) * day * (0.12 + fres * 0.7) * uSheen;
        vec3 lit = vec3(0.92, 0.95, 0.97) * day * (smoothstep(0.62, 1.0, rip) * 0.18 + churn * 0.55);
        vec3 glow = vec3(1.0, 0.64, 0.28) * uGlow * (0.12 + rip * 0.35 + churn * 0.9) * (0.35 + vFoam * 0.65);
        gl_FragColor = vec4(sheen * a + lit * uAlpha + glow * uAlpha, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** A ribbon along `pts` (local x, z) at height y, `half` wide each side; uv in meters (across, along); foam fades in `foamLen` below its start. */
function ribbon(pts: THREE.Vector2[], half: (i: number) => number, y: number, foamLen: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], foam: number[] = [], idx: number[] = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.y - a.y, l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    if (i > 0) run += pts[i].distanceTo(pts[i - 1]);
    const w = half(i);
    for (const s of [-1, 1]) {
      pos.push(pts[i].x + nx * w * s, y, pts[i].y + nz * w * s);
      uv.push(s * w, run);
      foam.push(Math.max(0, 1 - run / foamLen) ** 1.5);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat disc or ellipse of water at y, uv in meters; foam near `foamAt` (local x, z) within `foamR`. */
function pondSurface(cx: number, cz: number, ax: number, az: number, y: number, foamAt: Vec2[], foamR: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const foam = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = cx + p.getX(i) * ax, z = cz + p.getZ(i) * az;
    p.setXYZ(i, x, y, z);
    uv.setXY(i, x, z);
    let f = 0;
    for (const [fx, fz] of foamAt) f = Math.max(f, 1 - Math.hypot(x - fx, z - fz) / foamR);
    foam[i] = Math.max(0, f) ** 1.3;
  }
  g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* Layout                                                               */
/* ------------------------------------------------------------------ */

interface Channel {
  /** Evenly spaced points along the path (local x, z), pool to basin, and their arc length share 0..1. */
  pts: THREE.Vector2[];
  len: number;
  /** Closest point on the path: distance, share along it, tangent. */
  near(x: number, z: number): { d: number; s: number; tx: number; tz: number };
  /** Half width at a share along it. */
  half(s: number): number;
  /** Point and tangent at a share along it. */
  at(s: number): { x: number; z: number; tx: number; tz: number };
}

function channel(ctrl: [number, number][], halfAt: (s: number) => number): Channel {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const N = 90;
  const pts = curve.getSpacedPoints(N).map((v) => new THREE.Vector2(v.x, v.z));
  const len = curve.getLength();
  return {
    pts,
    len,
    half: halfAt,
    at(s) {
      const q = curve.getPointAt(Math.min(1, Math.max(0, s))), t = curve.getTangentAt(Math.min(1, Math.max(0, s)));
      const l = Math.hypot(t.x, t.z) || 1;
      return { x: q.x, z: q.z, tx: t.x / l, tz: t.z / l };
    },
    near(x, z) {
      let best = Infinity, bs = 0, btx = 0, btz = 1;
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[i + 1];
        const ex = b.x - a.x, ez = b.y - a.y, L = ex * ex + ez * ez;
        const t = L > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.y) * ez) / L)) : 0;
        const d = Math.hypot(x - a.x - ex * t, z - a.y - ez * t);
        if (d < best) {
          best = d;
          bs = (i + t) / N;
          const l = Math.sqrt(L) || 1;
          btx = ex / l;
          btz = ez / l;
        }
      }
      return { d: best, s: bs, tx: btx, tz: btz };
    },
  };
}

/** A placed boulder: plan circle (for spacing) and its geometry. */
interface Placed {
  x: number;
  z: number;
  r: number;
}

/** The plants of the rock pockets, from the beds the feature is set in: grasses, lavender and salvia, verbena, gaura, a rose. */
const POCKETS: { at: [number, number]; plant: string; size: number }[] = [
  // Behind the pool, either side of the top stone.
  { at: [-1.0, -1.55], plant: 'fountain-grass', size: 0.62 },
  { at: [1.02, -1.5], plant: 'fountain-grass', size: 0.62 },
  // On the rock between the two channels.
  { at: [0.0, -0.4], plant: 'blue-fescue', size: 0.85 },
  { at: [0.02, 0.18], plant: 'salvia-hot-lips', size: 0.5 },
  // The slopes outside the channels.
  { at: [-1.75, -0.85], plant: 'lavender', size: 0.6 },
  { at: [1.78, -0.8], plant: 'gaura', size: 0.6 },
  { at: [-1.88, 0.18], plant: 'rose-flower-carpet-red', size: 0.6 },
  { at: [1.9, 0.24], plant: 'blue-fescue', size: 0.85 },
  // Low at the basin's ends.
  { at: [-2.08, 1.05], plant: 'verbena', size: 0.55 },
  { at: [2.08, 1.05], plant: 'lavender', size: 0.55 },
];

/** A hash in 0..1 of a grid cell, for sparse scatters. */
const cellHash = (i: number, j: number) => {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The waterfall's boulders: weathered, deeper pits and pockets, a little lumpier than the library stones. */
const WEATHERED = { pocket: 0.12, rough: 0.035, lump: 0.065 };
/** A lip: a broad, irregular, low boulder with a rounded, broken front edge (not a slab). */
const LIP_SHAPE = { squareness: 3.2, cuts: 6, flatTop: [0.82, 0.14] as [number, number], lump: 0.07, rough: 0.035, pocket: 0.1, lean: 2 };

/**
 * The twin cascade boulder waterfall at `size` (width x depth x the height of its top stone, meters), built into `sink`
 * in local space (front +z). `pockets`: plants in the rock pockets (else more rock there).
 */
export function cascadeFall(sink: CascadeSink, seed: string, size: [number, number, number], pockets: boolean) {
  const [W, D, H] = size;
  const kx = W / CASCADE_MEDIUM[0], kz = D / CASCADE_MEDIUM[1], ky = H / CASCADE_MEDIUM[2];
  const ks = (kx + kz) / 2;
  const r = rng(`cascade:${seed}`);

  // Levels: the pool's water, three treads down each channel, and the basin; four even falls to the basin (about 11 in
  // each at the medium size). The hill stays low: the top stone stands well above the pool.
  const L0 = 0.5 * H;
  const LB = 0.03;
  const levels = [0, 1, 2, 3, 4].map((k) => L0 - (k * (L0 - LB)) / 4);
  const spillTop = L0 + 0.3 * ky;
  /** Each fall's width, top to bottom: 24, 27, 31 and 36 in. */
  const FALL_W = [0.61, 0.69, 0.79, 0.91].map((w) => w * ks);

  // The pool at the back center; the basin broad across the front, its front edge at the patio.
  const zP = -D / 2 + 0.9 * kz, rp = 0.5 * ks;
  const zB = D / 2 - 0.85 * kz, ax = 0.4 * W, az = 0.85 * kz;
  const basinE = (x: number, z: number) => Math.hypot(x / ax, (z - zB) / az);
  const Hm = L0 + 0.15 * ky;

  // The two channels: gentle S-curves fanning out from the pool to the basin, inside the middle of the width.
  const endX = 1.15 * kx;
  const endZ = zB - az * Math.sqrt(1 - (endX / ax) ** 2);
  const halfAt = (s: number) => (0.32 + 0.18 * s) * ks;
  const chans = [-1, 1].map((sx) => channel([
    [sx * 0.4 * kx, zP + rp * 0.72],
    [sx * 0.98 * kx, -0.62 * kz],
    [sx * 0.6 * kx, -0.2 * kz],
    [sx * 0.68 * kx, 0.22 * kz],
    [sx * endX, endZ],
  ], halfAt));
  /** Lips at these shares along a channel: the pool's edge, between the treads, and the basin's edge. */
  const LIPS = [0, 1 / 3, 2 / 3, 1];
  /** Past the line of a channel's first lip (its exit from the pool): only there is the channel's floor below the pool. */
  const exits = chans.map((c) => c.at(0));
  const pastExit = (i: number, x: number, z: number) => (x - exits[i].x) * exits[i].tx + (z - exits[i].z) * exits[i].tz > 0.02;
  const levelAt = (s: number) => (s <= 0.001 ? levels[0] : s >= 1 ? levels[4] : levels[1 + Math.min(2, Math.floor(s * 3))]);

  /**
   * The ground of the feature: a broad, low hillside, highest at the back center and sloping gently to both sides and
   * to the front, with the banks the channels are cut in, and the water's floors.
   */
  const field = (x: number, z: number): { h: number; wet: boolean } => {
    const q = (Math.abs(x) / (W / 2)) ** 2.4 + (Math.abs(z) / (D / 2)) ** 2.4;
    if (q >= 1) return { h: -0.03, wet: false };
    const edge = smooth(1, 0.82, q);
    const side = 1 - Math.min(1, Math.abs(x) / (0.5 * W)) ** 2.2;
    const front = 1 - smooth(zP - 0.2 * kz, zB, z);
    let base = Hm * side * front * edge;
    const near = chans.map((c) => c.near(x, z));
    const dp = Math.hypot(x, z - zP);
    const eb = basinE(x, z);
    near.forEach((n, i) => {
      const lv = levelAt(n.s), w = chans[i].half(n.s);
      const bank = lv - 0.07 + 0.25 * ky * smooth(w - 0.06, w + 0.3 * ks, n.d);
      base = Math.max(base, bank * (1 - smooth(w + 0.45 * ks, w + 1.2 * ks, n.d)) * Math.max(edge, 0.5));
    });
    base = Math.max(base, (L0 + 0.22 * ky) * (1 - smooth(rp + 0.2, rp + 1.0 * ks, dp)));
    base = Math.max(base, 0.1 * (1 - smooth(1.0, 1.3, eb)) * edge);
    // No cliffs at the water: the hill climbs from the channels, the pool and the basin no steeper than about 45 degrees,
    // so every face beside the water is a slope the boulders sit on.
    near.forEach((n, i) => {
      if (pastExit(i, x, z)) base = Math.min(base, levelAt(n.s) - 0.07 + Math.max(0, n.d - chans[i].half(n.s) + 0.06) * 1.05);
    });
    base = Math.min(base, L0 - 0.08 + Math.max(0, dp - rp + 0.06) * 1.05, LB + Math.max(0, eb - 0.95) * az * 1.05);
    let h = base, wet = false;
    if (eb < 1) {
      h = h + (LB - 0.035 - h) * smooth(1, 0.92, eb);
      wet = true;
    } else {
      near.forEach((n, i) => {
        const w = chans[i].half(n.s);
        if (n.s > 0.001 && n.d < w && pastExit(i, x, z)) {
          h = Math.min(h, h + (levelAt(n.s) - 0.07 - h) * smooth(w, w - 0.07, n.d));
          wet = true;
        }
      });
    }
    if (dp < rp && !near.some((n, i) => n.d < chans[i].half(n.s) && pastExit(i, x, z))) {
      h = h + (L0 - 0.08 - h) * smooth(rp, rp - 0.08, dp);
      wet = true;
    }
    return { h, wet };
  };
  const hAt = (x: number, z: number) => field(x, z).h;
  /** The slope at a point (rise over run). */
  const slope = (x: number, z: number) => {
    const e = 0.05;
    return Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
  };
  const reserved = pockets ? POCKETS.map((p) => ({ x: p.at[0] * kx, z: p.at[1] * kz, r: 0.26 * ks })) : [];

  // The hill: a height grid over the footprint, in the cobble's own ground (shadowed rock between the stones, so no
  // soil shows) where it is dry and wet river rock ground where the water runs; mulch only in the planting pockets.
  {
    const cell = 0.05;
    const nx = Math.ceil(W / cell), nz = Math.ceil(D / cell);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2);
    const wetV = new Uint8Array((nx + 1) * (nz + 1)), outV = new Uint8Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + (i * W) / nx, z = -D / 2 + (j * D) / nz;
      const f = field(x, z);
      const k = j * (nx + 1) + i;
      pos.set([x, f.h, z], k * 3);
      uv.set([x, z], k * 2);
      wetV[k] = f.wet ? 1 : 0;
      outV[k] = (Math.abs(x) / (W / 2)) ** 2.4 + (Math.abs(z) / (D / 2)) ** 2.4 >= 1 ? 1 : 0;
    }
    const dry: number[] = [], wetI: number[] = [], steep: number[] = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (outV[a] && outV[b] && outV[c] && outV[d]) continue;
      const rise = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) - Math.min(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]);
      const list = wetV[a] + wetV[b] + wetV[c] + wetV[d] >= 2 ? wetI : rise > cell * 0.6 ? steep : dry;
      list.push(a, c, b, b, c, d);
    }
    const dryMat = catalogMaterial(MOUND_ROCK, { color: new THREE.Color(0.5, 0.48, 0.45) });
    // Steep dry faces read as the weathered face of the stone the boulders are set in.
    const steepMat = pbrMaterial('cascade-rock-face', rockPittedSet(), { color: new THREE.Color('#6f5d48').multiplyScalar(1 / ROCK_GRAIN_MEAN) });
    for (const [list, mat] of [[dry, dryMat], [steep, steepMat], [wetI, catalogMaterial(FLOOR_ROCK, { color: new THREE.Color(...WET) })]] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv.slice(), 2));
      g.setIndex(list as number[]);
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      // Steep faces take their texture side on, so it is not stretched down them.
      const fp = flat.getAttribute('position') as THREE.BufferAttribute, fu = flat.getAttribute('uv') as THREE.BufferAttribute;
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), v0 = new THREE.Vector3();
      for (let t = 0; t < fp.count; t += 3) {
        v0.fromBufferAttribute(fp, t);
        e1.fromBufferAttribute(fp, t + 1).sub(v0);
        e2.fromBufferAttribute(fp, t + 2).sub(v0);
        nrm.crossVectors(e1, e2).normalize();
        if (Math.abs(nrm.y) > 0.85) continue;
        for (let k = 0; k < 3; k++) fu.setXY(t + k, Math.abs(nrm.x) > Math.abs(nrm.z) ? fp.getZ(t + k) : fp.getX(t + k), fp.getY(t + k));
      }
      sink.add(mat, flat);
    }
    // The pockets: a disc of black mulch draped on the hill round each plant.
    const mulch = catalogMaterial('black-mulch');
    for (const p of reserved) {
      const g = new THREE.CircleGeometry(p.r * 1.15, 18, 0, Math.PI * 2);
      g.rotateX(-Math.PI / 2);
      const gp = g.getAttribute('position') as THREE.BufferAttribute, gu = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < gp.count; i++) {
        const x = p.x + gp.getX(i), z = p.z + gp.getZ(i);
        gp.setXYZ(i, x, hAt(x, z) + 0.012, z);
        gu.setXY(i, x, z);
      }
      g.computeVertexNormals();
      sink.add(mulch, g.toNonIndexed());
    }
  }

  // Boulders: weathered moss rock everywhere the water is not, a few Canyon Tech for variety; each set into the hill.
  const rockMat = boulderMaterial(true);
  const placed: Placed[] = [];
  const boulder = (style: string, x: number, z: number, l: number, d: number, top: number, yaw: number, opts: { base?: number; moss?: boolean; shape?: object } = {}) => {
    const base = opts.base ?? Math.min(hAt(x, z), hAt(x + Math.cos(yaw) * l * 0.4, z - Math.sin(yaw) * l * 0.4), hAt(x - Math.cos(yaw) * l * 0.4, z + Math.sin(yaw) * l * 0.4));
    const hgt = Math.max(0.16 * ky, top - base);
    const g = boulderGeometry(style, [l, d, hgt], `${seed}-b${placed.length}`, opts.moss ?? false, 0.22, { ...WEATHERED, ...(opts.shape ?? {}) });
    g.rotateY(yaw);
    g.translate(x, base - 0.03, z);
    sink.add(rockMat, g);
    placed.push({ x, z, r: Math.max(l, d) * 0.5 });
  };
  const clear = (x: number, z: number, rad: number, gap = 0.82) =>
    placed.every((p) => Math.hypot(p.x - x, p.z - z) > (p.r + rad) * gap) && reserved.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad * 0.55);
  const yawAlong = (tx: number, tz: number) => Math.atan2(-tz, tx);

  // The back: the top stone at the full height, stones stepping down from it to both sides, the spill stone.
  const zBack = zP - rp - 0.25 * kz;
  // (Its top set 3 cm high: every boulder is set 3 cm into the hill.)
  boulder('moss-rock-rounded', 0, zBack, 1.35 * ks, 0.85 * ks, H + 0.03, (r() - 0.5) * 0.3);
  for (const sx of [-1, 1]) {
    boulder('moss-rock-rounded', sx * 0.95 * kx, zBack + 0.1, 1.1 * ks, 0.85 * ks, H - 0.42 * ky, sx * 0.5 + (r() - 0.5) * 0.3);
    boulder('canyon-tech-boulder', sx * 1.65 * kx, zBack + 0.28 * kz, 1.0 * ks, 0.8 * ks, H - 0.85 * ky, sx * 0.8);
    boulder('moss-rock-rounded', sx * 2.15 * kx, zBack + 0.7 * kz, 0.85 * ks, 0.7 * ks, 0.72 * ky, sx * 1.1);
    // Beside the pool, behind each channel's exit.
    boulder('moss-rock-rounded', sx * (rp + 0.28 * ks), zP - 0.15 * kz, 0.72 * ks, 0.58 * ks, L0 + 0.3 * ky, sx * 0.9);
  }
  // The spill: a lip boulder at the back of the pool, the top stone behind it.
  const spillZ = zP - rp * 0.8;
  // Between the channels' exits, the head of the rock that divides them.
  boulder('moss-rock-rounded', 0, zP + rp + 0.16 * ks, 0.62 * ks, 0.5 * ks, L0 + 0.24 * ky, (r() - 0.5) * 0.4);
  // Down the rock between the channels.
  for (const [z, l, up] of [[-0.1, 0.55, 0.2], [0.45, 0.6, 0.22]] as const) {
    boulder(r() < 0.3 ? 'canyon-tech-boulder' : 'moss-rock-rounded', (r() - 0.5) * 0.06, z * kz, l * ks, l * 0.8 * ks, hAt(0, z * kz) + up * ky, (r() - 0.5) * 0.8);
  }

  // Lips, falls, white water, lights; banks of boulders either side of each fall.
  const splash = splashMaterial();
  sink.fall(splash);
  const ledBody = plainMaterial('cascade-led-body', { color: '#2b2620', roughness: 0.5, metalness: 0.6 });
  const landings: Vec2[] = [];
  /** A fall leaving a lip whose front edge is at (x, z) heading (tx, tz), water level `up` above, `down` below. */
  const fall = (x: number, z: number, tx: number, tz: number, up: number, down: number, width: number, key: string, lit: boolean) => {
    const yaw = Math.atan2(tx, tz);
    const nx = -tz, nz = tx;
    // The lip: a broad, low, irregular boulder across the water, its worn front edge what the water pours over and its
    // face the face of the fall; a small stone at each end of it.
    boulder('moss-rock-rounded', x - tx * 0.2, z - tz * 0.2, width + 0.3 * ks, 0.5 * ks, up - 0.012, yawAlong(-tz, tx) + (r() - 0.5) * 0.12, { base: down - 0.08, moss: false, shape: LIP_SHAPE });
    for (const sd of [-1, 1]) {
      const ex = x + nx * sd * (width / 2 + 0.1 * ks) - tx * 0.06, ez = z + nz * sd * (width / 2 + 0.1 * ks) - tz * 0.06;
      boulder('moss-rock-rounded', ex, ez, 0.36 * ks, 0.3 * ks, up + (0.06 + r() * 0.08) * ky, r() * 6.28, { base: down - 0.05 });
    }
    // The sheet, thick and white: two layers leaving the lip a little apart, the outer one falling further out.
    const water = clearFallMaterial(0.42);
    sink.fall(water);
    const out = 0.34;
    for (const [wk, o, lift] of [[1, out, 0], [0.92, out * 1.28, 0.006]] as const) {
      const g = sheetGeometry(new THREE.Vector3(0, up - 0.014 + lift, 0), down - 0.02, width * wk, width * wk * 0.86, o);
      g.rotateY(yaw);
      g.translate(x + tx * 0.05, 0, z + tz * 0.05);
      const sheet = new THREE.Mesh(g, water);
      sheet.renderOrder = 3;
      sink.object(sheet);
    }
    // White water where it lands: churn on the water and spray rising off it.
    const land = 0.05 + out * 1.15 * Math.sqrt((2 * Math.max(0.05, up - down)) / 9.81);
    const lx = x + tx * land, lz = z + tz * land;
    landings.push([lx, lz]);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.3, 0.6 * ks).rotateX(-Math.PI / 2).rotateY(yaw), splash);
    foam.position.set(lx + tx * 0.08, down + 0.004, lz + tz * 0.08);
    foam.renderOrder = 3;
    sink.object(foam);
    for (const [ry, sw, sh] of [[0, 1.15, 0.24], [Math.PI / 2, 0.45, 0.2], [0.4, 0.8, 0.16]] as const) {
      const spray = new THREE.Mesh(new THREE.PlaneGeometry(width * sw, sh * ks).translate(0, (sh * ks) / 2 - 0.02, 0).rotateY(yaw + ry), splash);
      spray.position.set(lx, down, lz);
      spray.renderOrder = 4;
      sink.object(spray);
    }
    // The light: a small bronze fixture under the water at the foot of the fall, aimed back up at the sheet, warm white;
    // its beam is wide enough to spill onto the stones beside the fall.
    const fx = x + tx * (land + 0.22), fz = z + tz * (land + 0.22), fy = down - 0.045;
    sink.add(ledBody, new THREE.CylinderGeometry(0.03, 0.034, 0.03, 14).translate(fx, fy, fz).toNonIndexed());
    // A dull lens by day (its glow at night is the studio's, set by the lens color: see ledMaterial).
    const led = ledMaterial();
    led.color.set('#8f8676');
    sink.own(led);
    sink.glow(led);
    linkGlow(led, water);
    sink.add(led, new THREE.CylinderGeometry(0.021, 0.021, 0.005, 14).translate(fx, fy + 0.017, fz).toNonIndexed());
    const aim = new THREE.Vector3(x - fx, (up + down) / 2 - fy, z - fz).normalize();
    sink.beam(fx, fy + 0.03, fz, aim, 180, 80);
    if (lit) sink.light(lx, down + 0.3, lz, '#ffc27a', 1.1, 2.0);
  };

  // The spill into the pool.
  fall(0, spillZ, 0, 1, spillTop, L0, 0.55 * ks, 'spill', true);

  chans.forEach((c, ci) => {
    const outerSign = ci === 0 ? -1 : 1;
    LIPS.forEach((s, k) => {
      const p = c.at(s);
      fall(p.x, p.z, p.tx, p.tz, levels[k], levels[k + 1], FALL_W[k], `c${ci}l${k}`, k === 1);
      // Boulders framing the fall: big outside, smaller on the inside (the rock between the channels).
      const nx = -p.tz, nz = p.tx;
      for (const side of [-1, 1]) {
        const outer = Math.sign(nx * side) === outerSign;
        const l = (outer ? 0.85 + r() * 0.25 : 0.55 + r() * 0.15) * ks;
        const dd = l * (0.72 + r() * 0.12);
        const off = c.half(s) + dd * 0.42;
        const bx = p.x + nx * side * off - p.tx * 0.08, bz = p.z + nz * side * off - p.tz * 0.08;
        if (!clear(bx, bz, l * 0.5, 0.55)) continue;
        boulder(k === 3 && outer ? 'canyon-tech-boulder' : 'moss-rock-rounded', bx, bz, l, dd, levels[k] + (outer ? 0.26 + r() * 0.12 : 0.08 + r() * 0.06) * ky, yawAlong(p.tx, p.tz) + (r() - 0.5) * 0.5);
      }
      // Along the tread below this fall: boulders on both banks.
      if (k < 3) {
        for (const t of [0.35, 0.7]) {
          const sm = s + (LIPS[k + 1] - s) * t;
          const m = c.at(sm);
          const mx = -m.tz, mz = m.tx;
          for (const side of [-1, 1]) {
            const outer = Math.sign(mx * side) === outerSign;
            // The inside bank is kept low below the top tread, so the falls show from the patio.
            if (!outer && k > 0 && t > 0.5) continue;
            const l = (outer ? 0.75 + r() * 0.3 : 0.45 + r() * 0.15) * ks;
            const dd = l * (0.7 + r() * 0.15);
            const off = c.half(sm) + dd * 0.4;
            const bx = m.x + mx * side * off, bz = m.z + mz * side * off;
            if (!clear(bx, bz, l * 0.5, 0.65)) continue;
            boulder('moss-rock-rounded', bx, bz, l, dd, levels[k + 1] + (outer ? 0.3 : 0.08) * ky, yawAlong(m.tx, m.tz) + (r() - 0.5) * 0.6);
          }
        }
      }
    });
    // Water on the treads: from each lip to the next.
    for (let k = 0; k < 3; k++) {
      const i0 = Math.round(LIPS[k] * 90), i1 = Math.round(LIPS[k + 1] * 90);
      const pts = c.pts.slice(i0, i1 + 1);
      const run = runMaterial();
      sink.fall(run);
      const m = new THREE.Mesh(ribbon(pts, (i) => c.half((i0 + i) / 90) * 0.98, levels[k + 1] - 0.01, 0.45), run);
      m.renderOrder = 2;
      sink.object(m);
    }
  });

  // Water in the pool, and a thin, glassy film over the basin's stones (pondless: no open water).
  {
    const pool = runMaterial();
    sink.fall(pool);
    const pm = new THREE.Mesh(pondSurface(0, zP, rp * 0.99, rp * 0.99, L0 - 0.01, [landings[0]], 0.35), pool);
    pm.renderOrder = 2;
    sink.object(pm);
    const film = runMaterial(1, 2.2);
    sink.fall(film);
    const basinFoam = landings.filter(([x, z]) => basinE(x, z) < 1.05);
    const bm = new THREE.Mesh(pondSurface(0, zB - 0.04 * kz, ax * 0.95, az * 0.9, LB - 0.006, basinFoam, 0.5), film);
    bm.renderOrder = 2;
    sink.object(bm);
    sink.light(0, 0.4, zB - 0.15, '#ffc27a', 1.6, 3.4);
  }

  // The basin's ends: big boulders at the front corners, kept readable at night by a low wash from the basin's lights.
  for (const sx of [-1, 1]) {
    const cx = sx * (ax + 0.22 * kx), cz = zB + 0.12 * kz;
    boulder('moss-rock-rounded', cx, cz, 1.15 * ks, 0.95 * ks, 0.6 * ky, sx * 0.4 + (r() - 0.5) * 0.3);
    const bx = sx * ax * 0.62, bz = zB - 0.05;
    sink.beam(bx, 0.06, bz, new THREE.Vector3(cx - bx, 0.35, cz - bz).normalize(), 120, 110);
    for (const a of [0.45, 0.85]) {
      const px = sx * Math.cos(a) * (ax + 0.26 * ks), pz = zB - Math.sin(a) * (az + 0.24 * ks);
      if (clear(px, pz, 0.3 * ks, 0.8)) boulder('moss-rock-rounded', px, pz, 0.6 * ks, 0.5 * ks, 0.36 * ky, sx * a);
    }
  }
  // The front edge, at the patio: a row of smaller rounded boulders among the river rock, gaps between them.
  for (let a = 0.22; a < Math.PI - 0.2; a += 0.3) {
    if (r() < 0.5) continue;
    const px = Math.cos(a) * ax * 0.96, pz = zB + Math.sin(a) * az * 0.92;
    const l = (0.22 + r() * 0.12) * ks;
    if (clear(px, pz, l * 0.5, 0.8)) boulder('moss-rock-rounded', px, pz, l, l * 0.8, (0.12 + r() * 0.08) * ky, r() * 6.28, { base: 0, moss: false });
  }

  // The rest of the hill: boulders wherever there is room, clear of the water, smaller stones filling the gaps.
  for (const [step, big] of [[0.72 * ks, 1.1], [0.5 * ks, 0.8], [0.36 * ks, 0.55], [0.26 * ks, 0.4]] as const) for (let z = -D / 2 + 0.25; z < D / 2 - 0.3; z += step) {
    for (let x = -W / 2 + 0.25; x < W / 2 - 0.25; x += step) {
      const px = x + (r() - 0.5) * step * 0.7, pz = z + (r() - 0.5) * step * 0.7;
      const q = (Math.abs(px) / (W / 2)) ** 2.4 + (Math.abs(pz) / (D / 2)) ** 2.4;
      if (q > 0.92) continue;
      const g = hAt(px, pz);
      if (g < 0.03) continue;
      const l = (0.5 + r() * 0.35) * ks * (pz < 0 ? 1.1 : 0.9) * big;
      // Its inner edge may just reach the channel's side (the bank), never into the water.
      if (chans.some((c) => { const n = c.near(px, pz); return n.d - l * 0.38 < c.half(n.s) - 0.02; })) continue;
      if (Math.hypot(px, pz - zP) - l * 0.38 < rp || basinE(px, pz) < 1.1) continue;
      if (!clear(px, pz, l * 0.5, 0.68)) continue;
      boulder(r() < 0.2 ? 'canyon-tech-boulder' : r() < 0.35 ? 'moss-rock-flat-top' : 'moss-rock-rounded', px, pz, l, l * (0.7 + r() * 0.2), g + (0.22 + r() * 0.2) * ky * (big < 0.6 ? 0.6 : 1), r() * Math.PI * 2);
    }
  }

  // River rock: 1 1/2-3 in on the floors of the pool, channels and basin, 3-5 in along the channels' sides, 4-8 in
  // round the basin's edge, all kept wet; a scatter of darker wet 4-8 in stones through the basin.
  const box: Vec2[] = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  // Not on the face of a drop (the lip boulder is there).
  const nearLip = (c: Channel, s: number) => LIPS.some((l) => Math.abs(s - l) * c.len < 0.12);
  const inChannel = (x: number, z: number, lo: number, hi: number) =>
    chans.some((c, i) => { const n = c.near(x, z); const w = c.half(n.s); return n.s > 0.001 && n.d >= w * lo && n.d < w * hi && !nearLip(c, n.s) && pastExit(i, x, z); });
  const inPool = (x: number, z: number) => Math.hypot(x, z - zP) < rp - 0.04 && !chans.some((c, i) => { const n = c.near(x, z); return n.d < c.half(n.s) && pastExit(i, x, z); });
  sink.stones(FLOOR_ROCK, box, (x, z) => basinE(x, z) < 0.9 || inPool(x, z) || (basinE(x, z) >= 1 && !inPool(x, z) && inChannel(x, z, 0, 0.72)), hAt, WET);
  sink.stones(SIDE_ROCK, box, (x, z) => basinE(x, z) >= 1 && Math.hypot(x, z - zP) >= rp - 0.04 && inChannel(x, z, 0.72, 1.12) && slope(x, z) < 0.5, hAt, WET);
  sink.stones(RIM_ROCK, box, (x, z) => { const e = basinE(x, z); return e >= 0.88 && e < 1.12 && !inChannel(x, z, 0, 1.0); }, hAt, DAMP);
  sink.stones(RIM_ROCK, box, (x, z) => basinE(x, z) < 0.84 && cellHash(Math.floor(x / 0.2), Math.floor(z / 0.2)) > 0.8, (x, z) => hAt(x, z) + 0.01, DARK_WET);

  // Between the boulders on the gentler parts of the hill: river cobble, 4-8 in. Steep faces are left to the boulders.
  sink.stones(MOUND_ROCK, box, (x, z) => {
    const f = field(x, z);
    if (f.wet || f.h < 0.04 || slope(x, z) > 0.55) return false;
    if (chans.some((c) => { const n = c.near(x, z); return n.d < c.half(n.s) * 1.1; }) || basinE(x, z) < 1.12 || Math.hypot(x, z - zP) < rp + 0.05) return false;
    return reserved.every((p) => Math.hypot(p.x - x, p.z - z) > p.r * 1.1);
  }, hAt, [1, 1, 1]);

  // Plants in the rock pockets.
  if (pockets) {
    for (const p of POCKETS) {
      const x = p.at[0] * kx, z = p.at[1] * kz;
      const f = field(x, z);
      if (f.wet) continue;
      sink.plant(p.plant, x, f.h - 0.01, z, p.size);
    }
  }
}
