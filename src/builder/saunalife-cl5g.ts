import * as THREE from 'three';
import { boxUV, pbrMaterial, plainMaterial } from './materials';
import { cl5gHash as hash, cl5gTextures, smooth } from './saunalife-cl5g-textures';

/*
 * SaunaLife Model CL5G "Cube Luxury" 4-person outdoor sauna, built to SaunaLife's drawings
 * (installation manual V1.1, 7/2024, and saunalife.com/saunas/cube-luxury-series-model-cl5g).
 *
 * Published sizes: outside 80.7 in W x 63 in D x 82.7 in H; inside 77.2 W x 55.1 D x 74.8 H. The shell is 64
 * thermo-spruce staves (63 x 4.6 x 1.65 in) round a rounded-square tube that runs front to back, held by two steel bands.
 * Each end has a ring of eight fascia boards (top, bottom, sides and four curved corners) painted black, with their inner
 * edges left natural, which reads as a thin cedar reveal inside the black frame. The front wall is tempered bronze
 * glass (8 mm): two D-shaped panes in black frames either side of a full-glass door (door frame 23.23 x 66.54 in) with a
 * square wooden handle, hinged on the right as seen from outside and opening out. The back wall is vertical boards with
 * a wooden upper vent and a metal lower vent. Hex shingles with drip rails cover the top and the upper half of the sides;
 * the lower sides show the natural staves. The base is two-by-four foundation beams.
 *
 * Inside (SaunaLife's bench sizes): upper bench 17.7 in deep, top 29.7 in above the floor, with a five-slat backrest;
 * lower bench 31.1 in deep (from the back wall), top 14.25 in above the floor, slats running front to back; a side bench
 * 23.6 x 17.3 in at the front left; the heater in its slatted guard at the front right (the heater itself is bought
 * apart; a black electric heater with stones is drawn). SaunaLife's LED light bars sit behind the backrest top and under
 * the bench fronts; the thermometer and hygrometer hang high on the back wall.
 *
 * Built in inches in local space (front +z, centered, ground y = 0) and converted to meters. The fascia rings and glass
 * wall fill the published outside size exactly; the stave tube is drawn 1 in inside the fascia all round (the photos
 * show the fascia standing proud), which puts the inside about 2 in narrower than the published 77.2 in.
 */

const IN = 0.0254;
/** Inside materials: the shell blocks most of the sky's light (the renderer has no occlusion of its own). */
const INSIDE = { envMapIntensity: 0.25 };

export interface CL5GOptions {
  /** The glass door swung open (about 115 degrees, as in the job photos). */
  doorOpen: boolean;
  /** The LED light bars lit (and the warm light they put out through the glass at night). */
  lightsOn: boolean;
}

export interface CL5GBuild {
  /** Opaque parts, merged by material by the caller. */
  parts: [THREE.Material, THREE.BufferGeometry][];
  /** Glass and light washes, added as they are (they have their own draw order). */
  extras: THREE.Mesh[];
  /** Night lights, in local meters. */
  lights: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[];
  /** Materials made here for this sauna only (disposed with the features). */
  owned: THREE.Material[];
  /**
   * The glass door, built closed around its hinge line: `pivot` (local meters) is on the hinge, `parts` and `glass`
   * are in the hinge's own space. Turning it by `openAngle` about y opens it (out, toward the right seen from outside).
   */
  door: { pivot: THREE.Vector3; openAngle: number; parts: [THREE.Material, THREE.BufferGeometry][]; glass: THREE.Mesh; handle: THREE.Vector3; mid: THREE.Vector3 };
  /** Switch the LED bars and their light on the wood (the night light is the caller's: it is `lights`). */
  setLights(on: boolean): void;
  /** The light switch (the LED remote in its cradle, inside by the door), and the middle of the room, local meters. */
  lightAnchors: THREE.Vector3[];
}

/* ------------------------------------------------------------------ */
/* Sizes (inches)                                                       */

const W_OUT = 80.71, D_OUT = 63, H_OUT = 82.68;
/** Foundation beams under the shell. */
const BASE_H = 3.0;
/** How far the fascia stands proud of the staves, its face width and depth. */
const PROUD = 1.0, FACE = 4.5, FASCIA_D = 2.75;
const STAVE_T = 1.65;
/** Corner radius of the fascia ring's outside. */
const R_FASCIA = 14;
/** Rounded-square profile: half width a, half height b, corner radius r, center height yc. */
interface RR { a: number; b: number; r: number; yc: number }
const YC = (BASE_H - PROUD + H_OUT) / 2;
const RIM_OUT: RR = { a: W_OUT / 2, b: (H_OUT - (BASE_H - PROUD)) / 2, r: R_FASCIA, yc: YC };
const RIM_IN: RR = { a: RIM_OUT.a - FACE, b: RIM_OUT.b - FACE, r: R_FASCIA - FACE, yc: YC };
const STAVE_OUT: RR = { a: RIM_OUT.a - PROUD, b: RIM_OUT.b - PROUD, r: R_FASCIA - PROUD, yc: YC };
const STAVE_IN: RR = { a: STAVE_OUT.a - STAVE_T, b: STAVE_OUT.b - STAVE_T, r: STAVE_OUT.r - STAVE_T, yc: YC };
/** The end walls sit in a groove in the staves. */
const GROOVE = 0.78;
const WALL_RR: RR = { a: STAVE_IN.a + GROOVE, b: STAVE_IN.b + GROOVE, r: STAVE_IN.r + GROOVE, yc: YC };
const WALL_T = 1.07;
/** z of the staves' ends (behind the fascia), the end walls' inner and outer faces. */
const Z_STAVE = D_OUT / 2 - FASCIA_D;
const Z_WALL_IN = Z_STAVE - 0.38 - WALL_T;
const Z_WALL_OUT = Z_STAVE - 0.38;
const FLOOR = STAVE_IN.yc - STAVE_IN.b;
/** Shingles come down the sides to this height. */
const SHINGLE_EDGE = 42;
const STAVES = 64;

/* ------------------------------------------------------------------ */
/* Profile geometry                                                     */

function rrLength(R: RR) {
  return 4 * (R.a - R.r) + 4 * (R.b - R.r) + 2 * Math.PI * R.r;
}

/** Point and outward normal at arc length s, starting at the bottom middle and going round toward +x. */
function rrAt(R: RR, s: number): { x: number; y: number; nx: number; ny: number } {
  const L = rrLength(R);
  s = ((s % L) + L) % L;
  const ax = R.a - R.r, by = R.b - R.r, q = (Math.PI * R.r) / 2;
  const segs: [number, (t: number) => [number, number, number, number]][] = [
    [ax, (t) => [t, -R.b, 0, -1]],
    [q, (t) => arc(ax, -by, -Math.PI / 2 + t / R.r)],
    [2 * by, (t) => [R.a, -by + t, 1, 0]],
    [q, (t) => arc(ax, by, t / R.r)],
    [2 * ax, (t) => [ax - t, R.b, 0, 1]],
    [q, (t) => arc(-ax, by, Math.PI / 2 + t / R.r)],
    [2 * by, (t) => [-R.a, by - t, -1, 0]],
    [q, (t) => arc(-ax, -by, Math.PI + t / R.r)],
    [ax, (t) => [-ax + t, -R.b, 0, -1]],
  ];
  function arc(cx: number, cy: number, th: number): [number, number, number, number] {
    return [cx + Math.cos(th) * R.r, cy + Math.sin(th) * R.r, Math.cos(th), Math.sin(th)];
  }
  for (const [len, f] of segs) {
    if (s <= len) {
      const [x, y, nx, ny] = f(s);
      return { x, y: y + R.yc, nx, ny };
    }
    s -= len;
  }
  const [x, y, nx, ny] = segs[segs.length - 1][1](segs[segs.length - 1][0]);
  return { x, y: y + R.yc, nx, ny };
}

/** Arc length on the right side where the profile reaches height y (y between the corners). */
function rrSideS(R: RR, y: number) {
  return R.a - R.r + (Math.PI * R.r) / 2 + (y - R.yc + (R.b - R.r));
}

/** Signed distance (inches) from (x, y) to a rounded square: negative inside. */
function rrDist(R: RR, x: number, y: number) {
  const qx = Math.abs(x) - (R.a - R.r), qy = Math.abs(y - R.yc) - (R.b - R.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R.r;
}

/**
 * A band along z through profile points: facets between consecutive points (flat normals when `flat`), facing out or
 * in. UVs in meters: u = z, v = `vAt(s)`.
 */
function ribbon(R: RR, ss: number[], z0: number, z1: number, inward: boolean, flat: boolean, vAt: (s: number) => number, offset = 0): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const P = ss.map((s) => {
    const p = rrAt(R, s);
    return { x: p.x + p.nx * offset, y: p.y + p.ny * offset, nx: p.nx, ny: p.ny, v: vAt(s) };
  });
  for (let i = 0; i < P.length - 1; i++) {
    const A = P[i], B = P[i + 1];
    let n0x = A.nx, n0y = A.ny, n1x = B.nx, n1y = B.ny;
    if (flat) {
      const tx = B.x - A.x, ty = B.y - A.y, l = Math.hypot(tx, ty) || 1;
      n0x = n1x = ty / l;
      n0y = n1y = -tx / l;
    }
    const sg = inward ? -1 : 1;
    const quad = [
      [A, z0, n0x, n0y], [B, z0, n1x, n1y], [B, z1, n1x, n1y],
      [A, z0, n0x, n0y], [B, z1, n1x, n1y], [A, z1, n0x, n0y],
    ] as const;
    const order = inward ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
    for (const k of order) {
      const [p, z, nx, ny] = quad[k];
      pos.push(p.x * IN, p.y * IN, z * IN);
      nor.push(nx * sg, ny * sg, 0);
      uv.push(z * IN, p.v * IN);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** A box in inches (size, then the middle of its bottom face), UVs in meters along its longest side. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const alongZ = d > w * 1.5;
  const g = alongZ ? new THREE.BoxGeometry(d * IN, h * IN, w * IN) : new THREE.BoxGeometry(w * IN, h * IN, d * IN);
  boxUV(g);
  if (alongZ) g.rotateY(Math.PI / 2);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return g.toNonIndexed();
}

function rrShape(R: RR): THREE.Shape {
  return rrPath(new THREE.Shape(), R);
}

function rrPath<T extends THREE.Path>(p: T, R: RR, ccw = true): T {
  const n = 64;
  const L = rrLength(R);
  const pts = range(0, L, n * 4).slice(0, -1).map((s) => rrAt(R, s));
  if (!ccw) pts.reverse();
  pts.forEach((q, i) => (i ? p.lineTo(q.x * IN, q.y * IN) : p.moveTo(q.x * IN, q.y * IN)));
  p.closePath();
  return p;
}

/** Extrude a shape (meters) between z0 and z1 (inches). */
function extrude(shape: THREE.Shape, z0: number, z1: number, bevel = 0): THREE.BufferGeometry {
  const d = (z1 - z0) * IN, bt = bevel * IN;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, d - 2 * bt),
    bevelEnabled: bevel > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelOffset: -bt,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, z0 * IN + bt);
  return g.index ? g.toNonIndexed() : g;
}

/** Split a non-indexed geometry's triangles by a test on (centroid, normal). */
function split(g: THREE.BufferGeometry, test: (c: THREE.Vector3, n: THREE.Vector3) => boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const p = g.getAttribute('position'), nA = g.getAttribute('normal'), uA = g.getAttribute('uv');
  const out = [[], []].map(() => ({ p: [] as number[], n: [] as number[], u: [] as number[] }));
  const c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    c.set(0, 0, 0);
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      c.x += p.getX(t + k) / 3; c.y += p.getY(t + k) / 3; c.z += p.getZ(t + k) / 3;
      n.x += nA.getX(t + k); n.y += nA.getY(t + k); n.z += nA.getZ(t + k);
    }
    n.normalize();
    const o = out[test(c, n) ? 0 : 1];
    for (let k = 0; k < 3; k++) {
      o.p.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
      o.n.push(nA.getX(t + k), nA.getY(t + k), nA.getZ(t + k));
      o.u.push(uA.getX(t + k), uA.getY(t + k));
    }
  }
  return out.map((o) => {
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    r.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    return r;
  }) as [THREE.BufferGeometry, THREE.BufferGeometry];
}

/** Rewrite UVs (meters): faces toward z get (along, across), the rest (along, z). */
function boardUV(g: THREE.BufferGeometry, along: (x: number, y: number) => [number, number]) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [a, c] = along(p.getX(i) / IN, p.getY(i) / IN);
    const face = Math.abs(n.getZ(i)) > 0.7;
    uv[i * 2] = a * IN;
    uv[i * 2 + 1] = face ? c * IN : p.getZ(i);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

/* ------------------------------------------------------------------ */
/* Light washes                                                         */

/** A soft falloff for an LED's light on a surface: v runs away from the strip, u fades at both ends. */
function washTexture(peak: number, back: number, fwd: number): THREE.DataTexture {
  const N = 64;
  const d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    const v = j / (N - 1);
    const t = v < peak ? (peak - v) / Math.max(1e-3, back) : (v - peak) / Math.max(1e-3, fwd);
    const a = Math.exp(-t * t * 2.2);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const e = smooth(0, 0.05, u) * smooth(1, 0.95, u);
      const k = Math.round(255 * a * e);
      const o = (j * N + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = k;
      d[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function washMaterial(tex: THREE.DataTexture, strength: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.color.setRGB(1.0 * strength, 0.56 * strength, 0.24 * strength);
  m.addEventListener('dispose', () => tex.dispose());
  return m;
}

/** Rectangles (inches) on a plane, UVs from their place in the wash's frame [u0..u1] x [v0..v1]. */
function washRects(rects: { x0: number; x1: number; a0: number; a1: number }[], plane: (x: number, a: number) => [number, number, number], frame: [number, number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  const [u0, u1, v0, v1] = frame;
  for (const r of rects) {
    const c = [[r.x0, r.a0], [r.x1, r.a0], [r.x1, r.a1], [r.x0, r.a0], [r.x1, r.a1], [r.x0, r.a1]];
    for (const [x, a] of c) {
      const [px, py, pz] = plane(x, a);
      pos.push(px * IN, py * IN, pz * IN);
      uv.push((x - u0) / (u1 - u0), (a - v0) / (v1 - v0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* The sauna                                                            */

export function buildSaunaLifeCL5G(opts: CL5GOptions): CL5GBuild {
  const parts: [THREE.Material, THREE.BufferGeometry][] = [];
  const extras: THREE.Mesh[] = [];
  const owned: THREE.Material[] = [];
  const lights: CL5GBuild['lights'] = [];
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => parts.push([m, g.index ? g.toNonIndexed() : g]);

  const Lo = rrLength(STAVE_OUT), Li = rrLength(STAVE_IN);
  const wo = Lo / STAVES, wi = Li / STAVES;
  const mat = {
    out: pbrMaterial('cl5g-spruce-out', cl5gTextures('spruce-out', 8 * wo * IN)),
    // The fascia's unpainted inner edges: the same spruce, weathered darker.
    reveal: pbrMaterial('cl5g-reveal', cl5gTextures('spruce-out', 8 * wo * IN), { color: new THREE.Color(0.62, 0.5, 0.42) }),
    // Inside, the shell hides most of the sky: those materials take a quarter of the sky light.
    in: pbrMaterial('cl5g-spruce-in', cl5gTextures('spruce-in', 8 * wi * IN), INSIDE),
    back: pbrMaterial('cl5g-spruce-back', cl5gTextures('spruce-back', 8 * wi * IN), INSIDE),
    black: pbrMaterial('cl5g-black-spruce', cl5gTextures('black-spruce')),
    aspen: pbrMaterial('cl5g-thermo-aspen', cl5gTextures('thermo-aspen'), INSIDE),
    aspenLight: pbrMaterial('cl5g-thermo-aspen-light', cl5gTextures('thermo-aspen-light'), INSIDE),
    shingle: pbrMaterial('cl5g-hex-shingle', cl5gTextures('hex-shingle')),
    dial: pbrMaterial('cl5g-dial', cl5gTextures('dial'), INSIDE),
    handle: plainMaterial('cl5g-handle', { color: '#bfa688', roughness: 0.6 }),
    ventWood: plainMaterial('cl5g-vent-wood', { color: '#c8a17a', roughness: 0.65, envMapIntensity: 0.3 }),
    paint: plainMaterial('cl5g-black-paint', { color: '#1b1b1b', roughness: 0.6 }),
    metal: plainMaterial('cl5g-band', { color: '#8a8e93', roughness: 0.42, metalness: 0.85 }),
    drip: plainMaterial('cl5g-drip-rail', { color: '#1e1f21', roughness: 0.5, metalness: 0.6 }),
    hinge: plainMaterial('cl5g-hinge', { color: '#161616', roughness: 0.35, metalness: 0.7 }),
    heater: plainMaterial('cl5g-heater', { color: '#1a1a1b', roughness: 0.45, metalness: 0.55, envMapIntensity: 0.3 }),
    stoneA: plainMaterial('cl5g-stone-a', { color: '#6c6965', roughness: 0.92, envMapIntensity: 0.3 }),
    stoneB: plainMaterial('cl5g-stone-b', { color: '#4f4c48', roughness: 0.92, envMapIntensity: 0.3 }),
    white: plainMaterial('cl5g-white', { color: '#e9e8e4', roughness: 0.5, envMapIntensity: 0.3 }),
    vent: plainMaterial('cl5g-vent-zinc', { color: '#9a9ea2', roughness: 0.5, metalness: 0.7 }),
    bucket: plainMaterial('cl5g-bucket', { color: '#1d1d1e', roughness: 0.4, metalness: 0.5, envMapIntensity: 0.3 }),
  };
  const glass = new THREE.MeshStandardMaterial({ color: '#3a2f27', roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const led = new THREE.MeshStandardMaterial({ color: '#ffe6c8', emissive: new THREE.Color('#ffae66'), emissiveIntensity: 0, roughness: 0.4 });
  owned.push(glass, led);

  /* Foundation beams. */
  add(mat.paint, box(50, BASE_H, 55, 0, 0, 0));

  /* Stave tube: 64 staves, faceted at the corners, grooves from the texture. */
  const so = range(0, Lo, STAVES), si = range(0, Li, STAVES);
  add(mat.out, ribbon(STAVE_OUT, so, -Z_STAVE, Z_STAVE, false, true, (s) => s));
  add(mat.in, ribbon(STAVE_IN, si, -Z_STAVE, Z_STAVE, true, true, (s) => s));

  /* Fascia rings: eight boards each end, painted black, inner edges natural. */
  const ax = RIM_OUT.a - RIM_OUT.r, by = RIM_OUT.b - RIM_OUT.r, gap = 0.08;
  const boards: { shape: THREE.Shape; along: (x: number, y: number) => [number, number] }[] = [];
  for (const sy of [-1, 1]) {
    const s = new THREE.Shape();
    const y0 = YC + sy * RIM_IN.b, y1 = YC + sy * RIM_OUT.b;
    s.moveTo((-ax + gap) * IN, y0 * IN); s.lineTo((ax - gap) * IN, y0 * IN); s.lineTo((ax - gap) * IN, y1 * IN); s.lineTo((-ax + gap) * IN, y1 * IN); s.closePath();
    boards.push({ shape: s, along: (x, y) => [x, y] });
  }
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    const x0 = sx * RIM_IN.a, x1 = sx * RIM_OUT.a;
    s.moveTo(x0 * IN, (YC - by + gap) * IN); s.lineTo(x1 * IN, (YC - by + gap) * IN); s.lineTo(x1 * IN, (YC + by - gap) * IN); s.lineTo(x0 * IN, (YC + by - gap) * IN); s.closePath();
    boards.push({ shape: s, along: (x, y) => [y, x] });
  }
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const cx = sx * ax, cy = YC + sy * by;
    const t0 = Math.atan2(sy, sx) - Math.PI / 4, t1 = t0 + Math.PI / 2;
    const ga = gap / RIM_OUT.r;
    const s = new THREE.Shape();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ga + ((t1 - t0 - 2 * ga) * i) / n;
      const p = [(cx + Math.cos(t) * RIM_OUT.r) * IN, (cy + Math.sin(t) * RIM_OUT.r) * IN] as const;
      i ? s.lineTo(...p) : s.moveTo(...p);
    }
    for (let i = n; i >= 0; i--) {
      const t = t0 + ga + ((t1 - t0 - 2 * ga) * i) / n;
      s.lineTo((cx + Math.cos(t) * RIM_IN.r) * IN, (cy + Math.sin(t) * RIM_IN.r) * IN);
    }
    s.closePath();
    const rm = (RIM_OUT.r + RIM_IN.r) / 2;
    boards.push({ shape: s, along: (x, y) => [Math.atan2(y - cy, x - cx) * rm, Math.hypot(x - cx, y - cy)] });
  }
  for (const zEnd of [-1, 1]) {
    const z0 = zEnd > 0 ? Z_STAVE : -D_OUT / 2, z1 = zEnd > 0 ? D_OUT / 2 : -Z_STAVE;
    for (const b of boards) {
      const g = extrude(b.shape, z0, z1, 0.14);
      boardUV(g, b.along);
      // The edge facing the opening is left natural.
      const [edge, rest] = split(g, (c, n) => {
        const d = rrDist(RIM_IN, c.x / IN, c.y / IN);
        if (Math.abs(d) > 0.35 || Math.abs(n.z) > 0.6) return false;
        return n.x * c.x / IN + n.y * (c.y / IN - YC) < 0;
      });
      add(mat.reveal, edge);
      add(mat.black, rest);
    }
  }

  /* Shingles over the top and the upper sides, with drip rails, and a ridge strip. */
  const SH: RR = { a: STAVE_OUT.a + 0.25, b: STAVE_OUT.b + 0.25, r: STAVE_OUT.r + 0.25, yc: YC };
  const Ls = rrLength(SH), sEdge = rrSideS(SH, SHINGLE_EDGE), top = Ls / 2;
  add(mat.shingle, ribbon(SH, range(sEdge, top, 40), -Z_STAVE, Z_STAVE, false, false, (s) => s - sEdge));
  add(mat.shingle, ribbon(SH, range(top, Ls - sEdge, 40), -Z_STAVE, Z_STAVE, false, false, (s) => Ls - sEdge - s));
  add(mat.shingle, ribbon({ ...SH, a: SH.a + 0.12, b: SH.b + 0.12, r: SH.r + 0.12 }, range(top - 4.5, top + 4.5, 4), -Z_STAVE, Z_STAVE, false, false, (s) => s));
  for (const sx of [-1, 1]) add(mat.drip, box(0.7, 1.0, 2 * Z_STAVE, sx * (SH.a + 0.2), SHINGLE_EDGE - 0.7, 0));

  /* Steel bands just inside the fascia, visible on the lower sides and under the shell, with their tension bolts. */
  const sBand = rrSideS(STAVE_OUT, SHINGLE_EDGE + 1);
  for (const zb of [-1, 1]) {
    const zc = zb * (Z_STAVE - 1.3);
    add(mat.metal, ribbon(STAVE_OUT, range(-sBand, sBand, 48), zc - 0.65, zc + 0.65, false, false, (s) => s, 0.06));
    for (const sx of [-1, 1]) {
      add(mat.metal, box(0.6, 1.4, 1.5, sx * (STAVE_OUT.a + 0.35), 17.5, zc));
      add(mat.metal, box(0.6, 1.4, 1.5, sx * (STAVE_OUT.a + 0.35), 24.5, zc));
      add(mat.metal, box(0.3, 6.0, 0.3, sx * (STAVE_OUT.a + 0.5), 18.5, zc));
    }
  }

  /* Back wall: vertical boards, natural outside and inside, set in the staves' groove. Vents. */
  {
    const g = extrude(rrShape(WALL_RR), -Z_WALL_OUT, -Z_WALL_IN);
    boardUV(g, (x, y) => [y, x]);
    const [inside, outside] = split(g, (_c, n) => n.z > 0.5);
    add(mat.back, inside);
    add(mat.out, outside);
    // Wooden upper vent (inside, top left seen from the door) and metal lower vent (inside, low right).
    const disc = (r: number, t: number, x: number, y: number, z: number) => new THREE.CylinderGeometry(r * IN, r * 0.96 * IN, t * IN, 28).rotateX(Math.PI / 2).translate(x * IN, y * IN, z * IN);
    add(mat.ventWood, disc(2.9, 1.0, -21.5, 71.5, -Z_WALL_IN + 0.5));
    add(mat.vent, disc(2.6, 0.5, 24, 12, -Z_WALL_IN + 0.25));
    add(mat.vent, disc(2.8, 0.5, 21.5, 71.5, -Z_WALL_OUT - 0.25));
    add(mat.vent, disc(2.8, 0.5, -24, 12, -Z_WALL_OUT - 0.25));
    // Thermometer and hygrometer.
    for (const x of [-5.2, 4.4]) add(mat.dial, disc(2.75, 0.8, x, 73, -Z_WALL_IN + 0.4));
    // Heater sensor on its white lead, hanging from the ceiling.
    add(mat.white, new THREE.SphereGeometry(0.85 * IN, 14, 10).scale(1, 1.45, 1).translate(12.9 * IN, 75.4 * IN, (-Z_WALL_IN + 1.1) * IN));
    add(mat.white, new THREE.CylinderGeometry(0.09 * IN, 0.09 * IN, 25 * IN, 6).translate(12.9 * IN, 61.6 * IN, (-Z_WALL_IN + 1.1) * IN));
  }

  /* Front wall: two D-shaped bronze panes in black frames, the door frame, the glass door. */
  const zg0 = Z_WALL_IN, zg1 = Z_WALL_OUT;
  const glassMeshes: THREE.BufferGeometry[] = [];
  const doorParts: [THREE.Material, THREE.BufferGeometry][] = [];
  const doorGlass: THREE.BufferGeometry[] = [];
  const doorPivot = new THREE.Vector3(), doorHandle = new THREE.Vector3(), doorMid = new THREE.Vector3(), switchAt = new THREE.Vector3();
  const GX0 = 33.95, GX1 = 13.9, GY0 = 9.8, GY1 = 74.9, GR = 7.5, COL = 12;
  for (const sx of [-1, 1]) {
    // The panel: the wall outline on the outer side, straight at the middle column.
    const frame = new THREE.Shape();
    const L = rrLength(WALL_RR);
    const sideS = range(L / 2, L, 64).map((s) => rrAt(WALL_RR, s)).filter((p) => p.x <= -COL + 0.01);
    const pts = sideS.map((p) => [-sx * p.x, p.y]);
    frame.moveTo(sx * COL * IN, (WALL_RR.yc + WALL_RR.b) * IN);
    for (const [x, y] of pts) frame.lineTo(x * IN, y * IN);
    frame.lineTo(sx * COL * IN, (WALL_RR.yc - WALL_RR.b) * IN);
    frame.closePath();
    // The glass opening: rounded on the outer corners.
    const hole = new THREE.Path();
    const xo = sx * GX0, xi = sx * GX1;
    const q = 10;
    const corner = (cx: number, cy: number, t0: number) => {
      for (let i = 0; i <= q; i++) {
        const t = t0 + (Math.PI / 2) * (i / q);
        hole.lineTo((cx + Math.cos(t) * GR) * IN, (cy + Math.sin(t) * GR) * IN);
      }
    };
    if (sx < 0) {
      hole.moveTo(xi * IN, GY0 * IN);
      hole.lineTo(xi * IN, GY1 * IN);
      corner(xo + GR, GY1 - GR, Math.PI / 2);
      corner(xo + GR, GY0 + GR, Math.PI);
    } else {
      hole.moveTo(xi * IN, GY1 * IN);
      hole.lineTo(xi * IN, GY0 * IN);
      corner(xo - GR, GY0 + GR, -Math.PI / 2);
      corner(xo - GR, GY1 - GR, 0);
    }
    hole.closePath();
    frame.holes.push(hole);
    const fg = extrude(frame, zg0, zg1);
    add(mat.black, fg);
    const pane = new THREE.ShapeGeometry(new THREE.Shape(hole.getPoints()), 1);
    pane.translate(0, 0, ((zg0 + zg1) / 2) * IN);
    glassMeshes.push(pane);
  }
  // Middle column: Tb under the door, Ta above it, the door frame (1.73 in members, standing 0.9 in proud).
  const DF_W = 24, DF_Y0 = 7.75, DF_Y1 = DF_Y0 + 66.54, M = 1.73, DFZ0 = zg0, DFZ1 = zg1 + 0.93;
  add(mat.black, box(DF_W, DF_Y0 - (WALL_RR.yc - WALL_RR.b), zg1 - zg0, 0, WALL_RR.yc - WALL_RR.b, (zg0 + zg1) / 2));
  add(mat.black, box(DF_W, WALL_RR.yc + WALL_RR.b - DF_Y1, zg1 - zg0, 0, DF_Y1, (zg0 + zg1) / 2));
  add(mat.black, box(DF_W, M, DFZ1 - DFZ0, 0, DF_Y0, (DFZ0 + DFZ1) / 2));
  add(mat.black, box(DF_W, M, DFZ1 - DFZ0, 0, DF_Y1 - M, (DFZ0 + DFZ1) / 2));
  for (const sx of [-1, 1]) add(mat.black, box(M, DF_Y1 - DF_Y0, DFZ1 - DFZ0, sx * (DF_W / 2 - M / 2), DF_Y0, (DFZ0 + DFZ1) / 2));
  // The door: 8 mm bronze glass lapping the frame, hinged on the right (seen from outside), square wooden handle.
  {
    const DW = 22.2, DY0 = DF_Y0 + 0.85, DY1 = DF_Y1 - 0.85, T = 0.315;
    const hx = DF_W / 2 - 0.4, hz = DFZ1 + 0.1 + T / 2;
    doorPivot.set(hx * IN, 0, hz * IN);
    const doorAdd = (m: THREE.Material, g: THREE.BufferGeometry) => doorParts.push([m, g.index ? g.toNonIndexed() : g]);
    const door = (g: THREE.BufferGeometry) => g;
    // Door space: hinge line at x = 0, the glass toward -x.
    const pane = new THREE.PlaneGeometry(DW * IN, (DY1 - DY0) * IN).translate(-hx * IN, ((DY0 + DY1) / 2) * IN, 0);
    doorGlass.push(pane);
    doorHandle.set((-hx - DW / 2 + 4.6) * IN, 38 * IN, 0);
    doorMid.set(-hx * IN, ((DY0 + DY1) / 2) * IN, 0);
    for (const y of [65.6, 15.1]) {
      doorAdd(mat.hinge, door(new THREE.BoxGeometry(1.5 * IN, 3.2 * IN, 0.9 * IN).translate((-hx + DW / 2 - 0.9) * IN, y * IN, 0)));
      // The hinge's other leaf on the frame (stays put).
      add(mat.hinge, box(0.9, 3.2, 0.5, DF_W / 2 - M / 2, y - 1.6, DFZ1 + 0.25));
    }
    for (const side of [-1, 1]) {
      const hb = new THREE.BoxGeometry(7.2 * IN, 2.7 * IN, 1.25 * IN);
      boxUV(hb);
      hb.translate((-hx - DW / 2 + 4.6) * IN, 38 * IN, side * (T / 2 + 0.85) * IN);
      doorAdd(mat.handle, door(hb.toNonIndexed()));
      doorAdd(mat.hinge, door(new THREE.CylinderGeometry(0.28 * IN, 0.28 * IN, 0.9 * IN, 10).rotateX(Math.PI / 2).translate((-hx - DW / 2 + 4.6) * IN, 38 * IN, side * 0.45 * IN)));
    }
    // The LED bars' wireless remote in its wall cradle: inside, on the door frame's left jamb at shoulder height.
    const sx = -(DF_W / 2 - M / 2), sz = DFZ0 - 0.35;
    add(mat.hinge, box(1.6, 5.2, 0.45, sx, 46, sz));
    add(mat.white, box(1.3, 4.6, 0.35, sx, 46.3, sz - 0.3));
    add(mat.hinge, box(0.7, 0.7, 0.1, sx, 49.1, sz - 0.5));
    switchAt.set(sx * IN, 48.6 * IN, (sz - 0.5) * IN);
  }
  const doorGlassMesh = new THREE.Mesh(mergeAll(doorGlass), glass);
  doorGlassMesh.renderOrder = 2;
  doorGlassMesh.castShadow = false;
  const glassGeo = mergeAll(glassMeshes);
  const gm = new THREE.Mesh(glassGeo, glass);
  gm.renderOrder = 2;
  gm.receiveShadow = false;
  gm.castShadow = false;
  extras.push(gm);

  /* Benches, backrest, side bench (thermo-aspen). */
  const IW = STAVE_IN.a; // half the inside width
  const zBack = -Z_WALL_IN;
  // Upper bench: top 29.72 in above the floor, 17.72 in deep, a nose board and four slats.
  const UB_TOP = FLOOR + 29.72, UB_D = 17.72, UB_L = 2 * IW - 0.4, UB_F = zBack + UB_D;
  add(mat.aspen, box(UB_L, 2.84, 3.4, 0, UB_TOP - 2.84, UB_F - 1.7));
  for (let i = 0; i < 4; i++) add(mat.aspen, box(UB_L, 1.1, 3.1, 0, UB_TOP - 1.1, zBack + 0.5 + 1.55 + i * 3.55));
  for (const x of [-IW + 1.5, 0, IW - 1.5]) add(mat.aspen, box(1.73, 1.73, UB_D - 1, x, UB_TOP - 2.84, zBack + (UB_D - 1) / 2 + 0.3));
  // Backrest: five slats, leaning back, on three battens; the LED bar behind the top slat.
  const BR0 = UB_TOP + 1.4, pitch = 3.05, lean = 0.13;
  for (let i = 0; i < 5; i++) {
    const y = BR0 + i * pitch;
    add(mat.aspen, box(UB_L - 1, 2.2, 0.9, 0, y, zBack + 3.4 - (y - BR0) * lean));
  }
  for (const x of [-30, 0, 30]) {
    const g = new THREE.BoxGeometry(1.73 * IN, 15 * IN, 1.1 * IN);
    boxUV(g);
    g.rotateX(-lean).translate(x * IN, (BR0 + 7.2) * IN, (zBack + 2.3 - 7.2 * lean) * IN);
    add(mat.aspen, g.toNonIndexed());
  }
  const LED_A_Y = BR0 + 4 * pitch + 2.0, LED_A_Z = zBack + 1.1;
  add(led, box(UB_L - 3, 0.35, 0.5, 0, LED_A_Y, LED_A_Z));
  // Lower bench: top 14.25 in above the floor, 31.14 in from the back wall, slats front to back on three bearers.
  const LB_TOP = FLOOR + 14.25, LB_F = zBack + 31.14, LB_L = 73.2;
  const nS = 20, sw = 3.2, sg = (LB_L - nS * sw) / (nS - 1);
  const lbSlats: { x0: number; x1: number }[] = [];
  for (let i = 0; i < nS; i++) {
    const x = -LB_L / 2 + sw / 2 + i * (sw + sg);
    add(mat.aspenLight, box(sw, 1.1, LB_F - zBack - 0.5, x, LB_TOP - 1.1, (zBack + 0.5 + LB_F) / 2));
    lbSlats.push({ x0: x - sw / 2, x1: x + sw / 2 });
  }
  for (const z of [zBack + 3, zBack + 16, LB_F - 2]) add(mat.aspen, box(2 * IW - 0.2, 1.73, 1.73, 0, LB_TOP - 1.1 - 1.73, z));
  // Center posts: lower bench to the upper bench nose, and floor to the lower bench's front bearer.
  add(mat.aspen, box(1.73, UB_TOP - 2.84 - LB_TOP, 1.73, 0, LB_TOP, UB_F - 1.7));
  add(mat.aspen, box(1.73, LB_TOP - 2.84 - FLOOR, 1.73, 0, FLOOR, LB_F - 2));
  // LED bars under the upper bench nose and the lower bench front.
  const LED_B_Y = UB_TOP - 2.84 - 0.35, LED_C_Y = LB_TOP - 2.84 - 0.35;
  add(led, box(UB_L - 4, 0.35, 0.5, 0, LED_B_Y, UB_F - 2.6));
  add(led, box(LB_L - 6, 0.35, 0.5, 0, LED_C_Y, LB_F - 3.2));
  // Side bench: front left, 17.32 in wide, slats across, from the lower bench to the glass.
  const SB_X0 = -IW, SB_X1 = -IW + 17.32, SB_Z0 = LB_F + 0.2, SB_Z1 = Z_WALL_IN - 1.4;
  for (let i = 0; i < 6; i++) {
    const z = SB_Z0 + 1.6 + i * ((SB_Z1 - SB_Z0 - 3.2) / 5);
    add(mat.aspen, box(SB_X1 - SB_X0 - 0.3, 1.1, 3.0, (SB_X0 + SB_X1) / 2, LB_TOP - 1.1, z));
  }
  add(mat.aspen, box(1.73, 1.73, SB_Z1 - SB_Z0, SB_X1 - 1.2, LB_TOP - 2.84, (SB_Z0 + SB_Z1) / 2));
  add(mat.aspen, box(1.73, LB_TOP - 2.84 - FLOOR, 1.73, SB_X1 - 1.2, FLOOR, SB_Z1 - 1.5));
  // A black bucket and wooden ladle on the side bench (as in the job photos).
  {
    const pr = [[0, 0], [3.0, 0], [3.4, 7.2], [3.6, 7.6], [3.3, 7.6], [3.05, 0.5], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x * IN, y * IN));
    const bx = SB_X0 + 7, bz = SB_Z0 + 12;
    add(mat.bucket, new THREE.LatheGeometry(pr, 24).translate(bx * IN, LB_TOP * IN, bz * IN));
    const ladle = new THREE.CylinderGeometry(0.35 * IN, 0.35 * IN, 16 * IN, 8);
    ladle.rotateZ(0.55).translate((bx + 2.6) * IN, (LB_TOP + 9.5) * IN, bz * IN);
    add(mat.aspen, ladle);
  }

  /*
   * Heater at the front right, standing on the floor between the lower bench and the glass: a black electric heater
   * with stones heaped in its top. Its guard (manual step 17): DET 16, six boards across the front toward the glass
   * (wall ends cut to the curve of the staves, kept clear of the glass), and the top rails 15a on the bench side and
   * 15b on the room side, on a corner post.
   */
  {
    const HW = 15.5, HD = 12, HH = 23.5, LIFT = 3.0;
    const zPanel = Z_WALL_IN - 1.4 - 0.55, hz = zPanel - 0.55 - 3.4 - HD / 2, hx = IW - 13.2;
    add(mat.heater, box(HW, HH, HD, hx, FLOOR + LIFT, hz));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(mat.heater, box(1, LIFT + 0.6, 1, hx + dx * (HW / 2 - 1.5), FLOOR, hz + dz * (HD / 2 - 1.5)));
    // Control panel on the room side.
    add(mat.hinge, box(0.3, 2.4, 4, hx - HW / 2 - 0.15, FLOOR + LIFT + 4, hz));
    const r = (k: number) => hash(k, 91);
    const stoneTop = FLOOR + LIFT + HH;
    for (let i = 0; i < 46; i++) {
      const sx = hx + (r(i) - 0.5) * (HW - 3), sz = hz + (r(i + 100) - 0.5) * (HD - 3);
      const hump = 1 - Math.hypot((sx - hx) / (HW / 2), (sz - hz) / (HD / 2)) * 0.6;
      const rad = 1.3 + r(i + 200) * 0.9;
      const g = new THREE.IcosahedronGeometry(rad * IN, 1);
      g.scale(1, 0.62 + r(i + 300) * 0.25, 0.85 + r(i + 400) * 0.3);
      g.rotateY(r(i + 500) * 6.28).rotateZ((r(i + 600) - 0.5) * 0.8);
      g.translate(sx * IN, (stoneTop - 2.2 + hump * 3.2 + r(i + 700) * 1.2) * IN, sz * IN);
      add(i % 3 ? mat.stoneA : mat.stoneB, g);
    }
    const gx0 = IW - 24.88;
    for (let i = 0; i < 6; i++) {
      const y = FLOOR + 0.3 + i * 4.23;
      const xw = wallX(y) - 0.2;
      add(mat.aspen, box(xw - gx0, 3.55, 1.1, (gx0 + xw) / 2, y, zPanel));
    }
    const top = FLOOR + 0.3 + 5 * 4.23;
    const zRail = hz - HD / 2 - 3.2;
    add(mat.aspen, box(IW - 0.2 - gx0, 3.55, 1.1, (gx0 + IW - 0.2) / 2, top, zRail));
    add(mat.aspen, box(1.1, 2.76, zPanel - zRail, gx0 + 0.55, top + 0.8, (zPanel + zRail) / 2));
    add(mat.aspen, box(1.73, top + 3.55 - FLOOR, 1.73, gx0 + 0.9, FLOOR, zRail + 0.9));
  }

  /* The LED bars' light on the wood: soft washes, shown while the lights are on. */
  const washes: THREE.Mesh[] = [];
  {
    const wallTex = washTexture(0, 0.01, 0.3);
    const w1 = washRects([{ x0: -IW + 0.5, x1: IW - 0.5, a0: LED_A_Y, a1: LED_A_Y + 22 }], (x, a) => [x, a, zBack + 0.06], [-IW + 0.5, IW - 0.5, LED_A_Y, LED_A_Y + 22]);
    const m1 = washMaterial(wallTex, 0.4);
    // On the lower bench slat tops: strongest under the upper bench nose, fading to the front edge and into the back.
    const benchTex = washTexture(0.55, 0.35, 0.42);
    const z0 = zBack + 0.5;
    const w2 = washRects(lbSlats.map((s) => ({ x0: s.x0, x1: s.x1, a0: z0, a1: LB_F })), (x, a) => [x, LB_TOP + 0.04, a], [-LB_L / 2, LB_L / 2, z0, LB_F]);
    const m2 = washMaterial(benchTex, 0.45);
    // On the floor in front of the lower bench.
    const floorTex = washTexture(0.3, 0.25, 0.4);
    const w3 = washRects([{ x0: -IW + 12, x1: IW - 12, a0: LB_F - 10, a1: LB_F + 16 }], (x, a) => [x, FLOOR + 0.04, a], [-IW + 12, IW - 12, LB_F - 10, LB_F + 16]);
    const m3 = washMaterial(floorTex, 0.7);
    // On the back wall under the upper bench (the bar under the nose lights it from the front).
    const lowTex = washTexture(1, 0.6, 0.01);
    const w4 = washRects([{ x0: -IW + 0.5, x1: IW - 0.5, a0: LB_TOP + 0.2, a1: UB_TOP - 2.9 }], (x, a) => [x, a, zBack + 0.06], [-IW + 0.5, IW - 0.5, LB_TOP + 0.2, UB_TOP - 2.9]);
    const m4 = washMaterial(lowTex, 0.15);
    for (const [g, m] of [[w1, m1], [w2, m2], [w3, m3], [w4, m4]] as const) {
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 1;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      extras.push(mesh);
      washes.push(mesh);
      owned.push(m);
    }
    // At night the bars light the room and spill out through the glass.
    lights.push({ x: 0, y: 30 * IN, z: 6 * IN, color: '#ffb47a', intensity: 1.6, distance: 3.2 });
  }
  const setLights = (on: boolean) => {
    led.emissiveIntensity = on ? 3 : 0;
    for (const w of washes) w.visible = on;
  };
  setLights(opts.lightsOn);

  return {
    parts,
    extras,
    lights,
    owned,
    door: { pivot: doorPivot, openAngle: (115 * Math.PI) / 180, parts: doorParts, glass: doorGlassMesh, handle: doorHandle, mid: doorMid },
    setLights,
    lightAnchors: [switchAt, new THREE.Vector3(0, 45 * IN, 0), new THREE.Vector3(0, 50 * IN, zBack * IN)],
  };
}

/** x of the inside right wall at height y (the staves curve in at the bottom and top corners). */
function wallX(y: number) {
  const R = STAVE_IN, cy0 = R.yc - (R.b - R.r), cy1 = R.yc + (R.b - R.r);
  const dy = y < cy0 ? cy0 - y : y > cy1 ? y - cy1 : 0;
  return R.a - R.r + Math.sqrt(Math.max(0, R.r * R.r - dy * dy));
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
