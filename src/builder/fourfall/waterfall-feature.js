/**
 * Four-fall boulder waterfall: a placeable Three.js feature, built in code with no image or model files.
 *
 * Everything is modelled in FEET in the feature's own space:
 *   origin = the middle of the front edge, at finished patio / ground level (y = 0)
 *   +X = right when you face the feature, +Y = up, the feature runs back along -Z, the front faces +Z
 * The returned group is scaled by `unit` (world units per foot, 0.3048 for a scene in metres) and can be
 * moved and turned freely: every shader works in feature-local feet.
 *
 * Quick use:
 *   const wf = createWaterfall({ unit: 0.3048 });
 *   scene.add(wf.group); wf.group.position.set(x, y, z); wf.group.rotation.y = turn;
 *   wf.setEnvironment({ ... });                       // once, and whenever the light changes
 *   each frame: wf.update(seconds, { lightLevel, pointScale });
 *   with refraction (default): before the main render, hide wf.water, render the scene into a colour + depth
 *   target, show wf.water again, and pass the target with wf.setRefraction({ color, depth, width, height, near, far }).
 *   Pass { refraction: false } to skip all of that: the water is then drawn as a simple see-through film.
 *
 * See HANDOFF.md next to this file for the rules it follows and what a host scene has to provide.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const G = 32.2, V0 = 2.1, GRADE = -0.05;
// Newer three builds (seen in r186, not in r170) keep a second copy of the sheen colour, material.specularColorBlended, which
// direct light reads instead of specularColor. Looked up in the build's own shader text, so no revision number is assumed.
const SPEC_BLENDED = THREE.ShaderChunk.lights_physical_fragment.includes('specularColorBlended');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lin = c => Math.pow(clamp(c, 0, 1), 2.2);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- Perlin noise
const PERM = new Uint8Array(512);
{ const r = mulberry32(90210); const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y, z) { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }
function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255; x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return mix(
    mix(mix(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), mix(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    mix(mix(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u), mix(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
function fbm3(x, y, z, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.02; a *= 0.5; } return s; }
function ridged3(x, y, z, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * (1 - Math.abs(noise3(x * f, y * f, z * f))); f *= 2.03; a *= 0.5; } return s; }
const fbm2 = (x, z) => fbm3(x, 0.37, z, 4);

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// ============================================================ shader pieces shared by rock, cobble and soil
const NOISE3 = `
float rkH1(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rkN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH1(i), rkH1(i + vec3(1,0,0)), f.x), mix(rkH1(i + vec3(0,1,0)), rkH1(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkH1(i + vec3(0,0,1)), rkH1(i + vec3(1,0,1)), f.x), mix(rkH1(i + vec3(0,1,1)), rkH1(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 rkPerturb(vec3 sp, vec3 sn, vec2 dh, float fd){ vec3 sx = dFdx(sp), sy = dFdy(sp); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd; vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2); vec3 o = abs(det) * sn - gr;
  return dot(o, o) > 1e-20 ? normalize(o) : sn; }
`;
const VORO2 = `
vec2 vh2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec4 voro(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 h = vh2(i + o); vec2 r = o + h - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) { d2 = d; } }
  return vec4(sqrt(d1), sqrt(d2), id); }
`;
const GCHIPS = `
// bark chip pattern for a flat coordinate: x = chip height, y = which chip (for its colour)
vec2 gChips(vec2 q){
  vec4 a = voro(vec2(q.x * 7.0 + q.y * 3.0, q.y * 17.0 - q.x * 4.0));
  vec4 b = voro(vec2(q.x * 5.0 - q.y * 13.0, q.y * 6.0 + q.x * 11.0) + 17.0);
  return vec2(max(1.0 - a.x * 1.35, (1.0 - b.x * 1.35) * 0.92), a.x < b.x ? a.z : b.z);
}
`;
// x = wet (0..1), y = depth under the water surface in feet, z = damp (close to water)
const WATER_INFO = `
uniform vec4 uPool[5]; uniform float uPoolWL[5]; uniform vec4 uFallA[4]; uniform vec4 uFallB[4];
uniform sampler2D uHmap; uniform vec4 uHmapRect; uniform vec3 uSoil; uniform float uUnit;
vec3 waterInfo(vec3 p, float n){
  float wet = 0.0, sub = 0.0, damp = 0.0;
  for (int i = 0; i < 5; i++) {
    float q = length((p.xz - uPool[i].xy) / uPool[i].zw);
    float inside = 1.0 - smoothstep(1.0, 1.12, q);
    float h = p.y - uPoolWL[i] - (n - 0.5) * 0.14;
    wet = max(wet, inside * (1.0 - smoothstep(0.02, 0.2, h)));
    sub = max(sub, inside * max(uPoolWL[i] - p.y, 0.0));
    damp = max(damp, (1.0 - smoothstep(0.95, 1.75, q)) * (1.0 - smoothstep(0.3, 1.8, h)) * step(-1.2, h));
  }
  for (int i = 0; i < 4; i++) {
    float dx = abs(p.x - uFallA[i].x) - uFallA[i].z;
    float inz = smoothstep(uFallA[i].y - 1.3, uFallA[i].y - 0.5, p.z) * (1.0 - smoothstep(uFallB[i].x + 0.3, uFallB[i].x + 1.2, p.z));
    float iny = (1.0 - smoothstep(uFallA[i].w + 0.05, uFallA[i].w + 0.45, p.y)) * step(uFallB[i].y - 0.6, p.y);
    float s = (1.0 - smoothstep(0.0, 0.7 + 0.5 * n, dx)) * inz * iny;
    wet = max(wet, s); damp = max(damp, s);
  }
  return vec3(wet, sub, damp);
}
float groundAt(vec3 p){ return texture2D(uHmap, (p.xz - uHmapRect.xy) * uHmapRect.zw).r; }
`;

// ============================================================ shared geometry and textures (built once, on first use)
// One set per detail level ('full', or 'light' for phones and tablets: rocks with about a third of the triangles).
const ASSET_SETS = {};
function assets(detail = 'full') {
  if (ASSET_SETS[detail]) return ASSET_SETS[detail];
  const rockK = detail === 'light' ? 0.55 : 1;
  const waterNrm = canvasTex(256, (g, s) => {
    const r = mulberry32(17), waves = [];
    for (let i = 0; i < 16; i++) { let kx = Math.round((r() - 0.5) * 12), ky = Math.round((r() - 0.5) * 12); if (!kx && !ky) kx = 1; waves.push([kx, ky, r() * 6.283, 1 / Math.hypot(kx, ky)]); }
    const H = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { let h = 0; for (const [kx, ky, ph, a] of waves) h += a * Math.sin(6.283 * (kx * x + ky * y) / s + ph); H[y * s + x] = h; }
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (H[y * s + (x + 1) % s] - H[y * s + (x - 1 + s) % s]) * 4, dy = (H[((y + 1) % s) * s + x] - H[((y - 1 + s) % s) * s + x]) * 4;
      const l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  waterNrm.repeat.set(1, 1);
  // Rocks are grown, not sculpted: a rounded lump is cut by random fracture planes, and the cuts are
  // blended so every edge is worn. Few soft cuts give a river-rounded stone, many tight cuts a blocky
  // granite boulder, and two flat cuts with stepped sides give a layered lip slab.
  function rockGeo(seed, o) {
    const R = mulberry32(seed * 7919 + 13);
    let g = new THREE.IcosahedronGeometry(1, Math.max(6, Math.round((o.detail || 22) * rockK)));
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, n = p.count;
    const ox = R() * 40, oy = R() * 40, oz = R() * 40, k = o.k;
    const pw = o.p || 2, er = (x, y, z) => Math.pow(Math.pow(Math.abs(x / o.sx), pw) + Math.pow(Math.abs(y / o.sy), pw) + Math.pow(Math.abs(z / o.sz), pw), -1 / pw);
    const planes = [];
    if (o.slab) {
      planes.push([0, 1, 0, o.th * (0.9 + 0.2 * R())], [0, -1, 0, o.th * (0.95 + 0.3 * R())]);
      const ns = 5 + Math.floor(R() * 3), a0 = R() * 6.283;
      for (let i = 0; i < ns; i++) {
        const a = a0 + i / ns * 6.283 + (R() - 0.5) * 0.5, tilt = (R() - 0.5) * 0.45, c = Math.cos(tilt);
        const nx = Math.cos(a) * c, ny = Math.sin(tilt), nz = Math.sin(a) * c;
        planes.push([nx, ny, nz, er(nx, 0, nz) * (0.8 + 0.2 * R())]);
      }
    } else {
      for (let i = 0; i < o.planes; i++) {
        let x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        planes.push([x, y, z, er(x, y, z) * (i < (o.deep || 0) ? 0.44 + 0.34 * R() : o.cut[0] + (o.cut[1] - o.cut[0]) * R())]);
      }
    }
    const sPhase = R() * 10, sStep = v => { const i = Math.floor(v), f = sstep(0.3, 0.7, v - i); const h = j => { const s = Math.sin(j * 12.9898 + sPhase) * 43758.5453; return s - Math.floor(s); }; return mix(h(i), h(i + 1), f); };
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const e = er(x, y, z);
      let acc = Math.exp(-e / k);
      for (const pl of planes) { const dn = x * pl[0] + y * pl[1] + z * pl[2]; if (dn > 0.04) { const t = pl[3] / dn; if (t < e * 3) acc += Math.exp(-t / k); } }
      let r = -k * Math.log(acc);
      const wx = x + o.warp * fbm3(x * 1.3 + ox, y * 1.3 + oy, z * 1.3 + oz, 2), wy = y + o.warp * fbm3(x * 1.3 + oy, y * 1.3 + oz, z * 1.3 + ox, 2), wz = z + o.warp * fbm3(x * 1.3 + oz, y * 1.3 + ox, z * 1.3 + oy, 2);
      r *= 1 + o.n1 * fbm3(wx * 1.4 + ox, wy * 1.4 + oy, wz * 1.4 + oz, 3) + o.n2 * (ridged3(wx * 3.6 + oy, wy * 3.6 + oz, wz * 3.6 + ox, 3) - 0.55) + 0.5 * o.n2 * (ridged3(wx * 8.5 + oz, wy * 8.5 + ox, wz * 8.5 + oy, 2) - 0.55) + 0.006 * fbm3(x * 11 + oz, y * 11 + ox, z * 11 + oy, 2);
      if (o.slab) r *= 1 + o.strata * (sStep(y * r / 0.085) - 0.5) * sstep(0.75, 0.35, Math.abs(y));
      p.setXYZ(i, x * r, y * r, z * r);
    }
    g.computeVertexNormals();
    const col = new Float32Array(n * 3), A = o.colA, B = o.colB;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = clamp(fbm3(x * 1.1 + oz, y * 1.1 + ox, z * 1.1 + oy, 3) * 1.1 + 0.5, 0, 1);
      let r = mix(A[0], B[0], t), gg = mix(A[1], B[1], t), b = mix(A[2], B[2], t);
      const band = noise3(x * 0.9 + ox, y * 3.6 + oy, z * 0.9) * 0.5 + 0.5;
      r *= 0.92 + band * 0.14; gg *= 0.93 + band * 0.12; b *= 0.94 + band * 0.1;
      const rust = sstep(0.26, 0.5, fbm3(x * 1.5 + oy + 9, y * 1.5 + oz, z * 1.5 + ox, 3)) * o.rust * 0.7;
      r = mix(r, 0.56, rust); gg = mix(gg, 0.39, rust); b = mix(b, 0.24, rust);
      const low = sstep(0.1 * o.sy, -0.7 * o.sy, y);
      r *= 1 - 0.22 * low; gg *= 1 - 0.24 * low; b *= 1 - 0.24 * low;
      col[i * 3] = lin(r); col[i * 3 + 1] = lin(gg); col[i * 3 + 2] = lin(b);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  const TAN = [[0.63, 0.55, 0.44], [0.5, 0.44, 0.37]], BROWN = [[0.55, 0.44, 0.33], [0.43, 0.35, 0.28]], GRAY = [[0.6, 0.58, 0.54], [0.47, 0.46, 0.44]], LEDGE = [[0.44, 0.4, 0.35], [0.32, 0.29, 0.26]];
  const ROCKSET = {
    // blocky granite boulders: flat fracture faces, weathered edges
    b: [
      { sx: 1.0, sy: 0.8, sz: 0.9, planes: 13, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.25, n1: 0.07, n2: 0.063, rust: 0.55, col: TAN },
      { sx: 1.1, sy: 0.7, sz: 0.85, planes: 12, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.2, n1: 0.06, n2: 0.054, rust: 0.15, col: GRAY },
      { sx: 0.92, sy: 0.9, sz: 0.95, planes: 14, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.3, n1: 0.08, n2: 0.072, rust: 0.7, col: BROWN },
      { sx: 1.15, sy: 0.62, sz: 1.0, planes: 11, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.2, n1: 0.06, n2: 0.054, rust: 0.3, col: TAN },
      { sx: 1.0, sy: 0.85, sz: 0.8, planes: 15, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.28, n1: 0.07, n2: 0.072, rust: 0.4, col: GRAY },
      { sx: 1.2, sy: 0.72, sz: 0.9, planes: 12, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.22, n1: 0.07, n2: 0.054, rust: 0.85, col: TAN },
      { sx: 0.95, sy: 0.78, sz: 1.05, planes: 13, deep: 5, p: 3.0, cut: [0.8, 0.96], k: 0.045, warp: 0.25, n1: 0.08, n2: 0.063, rust: 0.25, col: BROWN },
    ],
    // river-worn stones: few cuts, heavily rounded, smooth
    r: [
      { sx: 1.05, sy: 0.66, sz: 0.9, planes: 4, cut: [0.8, 1.0], k: 0.2, warp: 0.15, n1: 0.045, n2: 0.01, rust: 0.2, col: GRAY },
      { sx: 1.0, sy: 0.72, sz: 0.85, planes: 5, cut: [0.78, 1.0], k: 0.17, warp: 0.18, n1: 0.05, n2: 0.012, rust: 0.5, col: TAN },
      { sx: 1.15, sy: 0.58, sz: 0.95, planes: 4, cut: [0.82, 1.0], k: 0.22, warp: 0.12, n1: 0.04, n2: 0.008, rust: 0.1, col: BROWN },
    ],
    // lip and ledge slabs: flat top and bottom, stepped layered edges
    s: [
      { slab: true, sx: 1.0, sy: 0.9, sz: 0.8, th: 0.27, k: 0.05, warp: 0.15, n1: 0.035, n2: 0.02, strata: 0.07, rust: 0.3, col: LEDGE, detail: 16 },
      { slab: true, sx: 1.0, sy: 0.9, sz: 0.85, th: 0.3, k: 0.055, warp: 0.18, n1: 0.04, n2: 0.02, strata: 0.09, rust: 0.15, col: BROWN, detail: 16 },
      { slab: true, sx: 1.0, sy: 0.9, sz: 0.75, th: 0.25, k: 0.045, warp: 0.15, n1: 0.035, n2: 0.025, strata: 0.06, rust: 0.45, col: LEDGE, detail: 16 },
    ],
  };
  const KINDS = {};
  { let s = 1; for (const k in ROCKSET) KINDS[k] = ROCKSET[k].map(o => rockGeo(s++, { ...o, colA: o.col[0], colB: o.col[1] })); }
  function cobbleGeo(seed, detail) {
    let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, o = seed * 3.1, fy = 0.5 + 0.12 * (seed % 3);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const r = 1 + 0.11 * fbm3(x * 1.1 + o, y * 1.1, z * 1.1 - o, 2); p.setXYZ(i, x * r * (1 + (seed % 2) * 0.12), y * r * fy, z * r); }
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
  const COBBLE_HI = [cobbleGeo(0, 2), cobbleGeo(1, 2), cobbleGeo(2, 2)], COBBLE_LO = [cobbleGeo(3, 1), cobbleGeo(4, 1), cobbleGeo(5, 1)];

  function grassGeo(seed, blades, o) {
    const Rr = mulberry32(seed); const P = [], C = [], N = [], I = []; const seg = 6; let v = 0;
    for (let b = 0; b < blades; b++) {
      const a = Rr() * Math.PI * 2, r0 = Math.sqrt(Rr()) * 0.1, lean = 0.1 + Math.pow(Rr(), 0.8) * 1.1, Lb = 0.62 + 0.38 * Rr(), w = 0.022 + 0.016 * Rr();
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca, jit = 0.85 + 0.3 * Rr();
      for (let s = 0; s <= seg; s++) {
        const t = s / seg, out = r0 + Lb * lean * 0.55 * t * t, up = Lb * t * (1 - 0.38 * lean * t), ww = w * Math.pow(1 - t, 0.75) + 0.002;
        const cx = ca * out, cz = sa * out, k = Math.pow(t, 1.2);
        P.push(cx + px * ww, up, cz + pz * ww, cx - px * ww, up, cz - pz * ww);
        const c = [lin(mix(o.base[0], o.tip[0], k) * jit), lin(mix(o.base[1], o.tip[1], k) * jit), lin(mix(o.base[2], o.tip[2], k) * jit)];
        C.push(...c, ...c);
        const nx = ca * 0.45, ny = 0.9, nz = sa * 0.45; N.push(nx, ny, nz, nx, ny, nz);
        if (s < seg) I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        v += 2;
      }
    }
    return buildGeo(P, N, C, I);
  }
  function frondGeo(seed, n, o) {
    const Rr = mulberry32(seed); const P = [], C = [], N = [], I = []; const seg = o.seg; let vi = 0;
    const rr = (a, b) => a + (b - a) * Rr();
    for (let f = 0; f < n; f++) {
      const a = f / n * Math.PI * 2 + Rr() * 0.5, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
      const len = rr(...o.len), e0 = rr(...o.e0), jit = 0.88 + 0.24 * Rr();
      let h = 0, y = 0.02; const ds = len / seg;
      for (let s = 0; s <= seg; s++) {
        const t = s / seg, e = e0 - (e0 + o.droop) * Math.pow(t, 1.15);
        if (s > 0) { h += Math.cos(e) * ds; y += Math.sin(e) * ds; }
        let w = o.w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), o.wp);
        if (o.lobes) w *= 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * o.lobes));
        const cx = ca * h, cz = sa * h, k = Math.pow(t, 1.1);
        const cr = mix(o.c0[0], o.c1[0], k) * jit, cg = mix(o.c0[1], o.c1[1], k) * jit, cb = mix(o.c0[2], o.c1[2], k) * jit, e2 = o.margin || 1;
        P.push(cx + px * w, y, cz + pz * w, cx, y + w * 0.3, cz, cx - px * w, y, cz - pz * w);
        C.push(lin(cr * e2), lin(cg * e2), lin(cb * e2), lin(cr), lin(cg), lin(cb), lin(cr * e2), lin(cg * e2), lin(cb * e2));
        const nx = ca * 0.35, nz = sa * 0.35; N.push(nx, 0.9, nz, nx * 0.3, 1, nz * 0.3, nx, 0.9, nz);
        if (s < seg) { const b = vi; I.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        vi += 3;
      }
    }
    return buildGeo(P, N, C, I);
  }
  function shrubGeo(seed, leaves, flowers, o) {
    const Rr = mulberry32(seed); const P = [], N = [], C = [];
    const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tmp = new THREE.Vector3();
    const push = (v, nn, col) => { P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); C.push(col[0], col[1], col[2]); };
    const core = new THREE.IcosahedronGeometry(0.8, 2), cp = core.attributes.position, cn = core.attributes.normal;
    const cc = [lin(o.core[0]), lin(o.core[1]), lin(o.core[2])];
    for (let i = 0; i < cp.count; i++) { c.set(cp.getX(i), Math.max(cp.getY(i) * o.h, -0.04) + 0.05, cp.getZ(i)); n.set(cn.getX(i), cn.getY(i), cn.getZ(i)); push(c, n, cc); }
    core.dispose();
    for (let i = 0; i < leaves; i++) {
      const th = Rr() * Math.PI * 2, ph = Math.acos(1 - Rr() * 1.1), rr = 0.78 + 0.3 * Rr();
      c.set(Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr * o.h + 0.05, Math.sin(ph) * Math.sin(th) * rr);
      if (c.y < 0.03) continue;
      n.set(c.x, c.y / o.h, c.z).normalize(); n.x += (Rr() - 0.5) * 0.8; n.y += (Rr() - 0.2) * 0.6; n.z += (Rr() - 0.5) * 0.8; n.normalize();
      tmp.set(Rr() - 0.5, Rr() - 0.5, Rr() - 0.5); t.crossVectors(n, tmp).normalize(); b.crossVectors(n, t);
      const Ll = o.leaf * (0.75 + 0.5 * Rr()), Wd = Ll * 0.5, k = 0.75 + 0.45 * Rr();
      const col = [lin(o.leafCol[0] * k), lin(o.leafCol[1] * k), lin(o.leafCol[2] * k)];
      const v0 = c.clone().addScaledVector(t, Ll * 0.5), v1 = c.clone().addScaledVector(b, Wd * 0.5), v2 = c.clone().addScaledVector(t, -Ll * 0.5), v3 = c.clone().addScaledVector(b, -Wd * 0.5);
      push(v0, n, col); push(v1, n, col); push(v2, n, col); push(v0, n, col); push(v2, n, col); push(v3, n, col);
    }
    if (flowers) {
      const ico = new THREE.IcosahedronGeometry(1, 0), ip = ico.attributes.position, inn = ico.attributes.normal;
      for (let i = 0; i < flowers; i++) {
        const th = Rr() * Math.PI * 2, ph = Math.acos(1 - Rr() * 0.95), rr = 0.98 + 0.08 * Rr();
        const cx = Math.sin(ph) * Math.cos(th) * rr, cy = Math.cos(ph) * rr * o.h + 0.05, cz = Math.sin(ph) * Math.sin(th) * rr;
        if (cy < 0.15) continue;
        const fs = o.fsize * (0.7 + 0.6 * Rr()), k = 0.85 + 0.3 * Rr(), col = [lin(o.flower[0] * k), lin(o.flower[1] * k), lin(o.flower[2] * k)];
        for (let j = 0; j < ip.count; j++) { c.set(cx + ip.getX(j) * fs, cy + ip.getY(j) * fs * 0.7, cz + ip.getZ(j) * fs); n.set(inn.getX(j), inn.getY(j), inn.getZ(j)); push(c, n, col); }
      }
      ico.dispose();
    }
    return buildGeo(P, N, C, null);
  }
  function buildGeo(P, N, C, I) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const nn = new Float32Array(N); for (let i = 0; i < nn.length; i += 3) { const l = Math.hypot(nn[i], nn[i + 1], nn[i + 2]) || 1; nn[i] /= l; nn[i + 1] /= l; nn[i + 2] /= l; }
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    if (I) g.setIndex(I);
    g.computeBoundingSphere(); return g;
  }
  // a leafy mound with flower spikes standing out of it (lavender)
  function spikeShrubGeo(seed, base, spikes, o) {
    const g0 = shrubGeo(seed, base.leaves, 0, base);
    const P = Array.from(g0.attributes.position.array), N = Array.from(g0.attributes.normal.array), C = Array.from(g0.attributes.color.array);
    g0.dispose();
    const Rr = mulberry32(seed * 31 + 7), V = THREE.Vector3;
    const d = new V(), t = new V(), b = new V(), tmp = new V(), up = new V(0, 1, 0);
    const tri = (a, b2, c2, nn, col) => { for (const v of [a, b2, c2]) { P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z); C.push(col[0], col[1], col[2]); } };
    const sc = [lin(o.stemCol[0]), lin(o.stemCol[1]), lin(o.stemCol[2])];
    for (let i = 0; i < spikes; i++) {
      const th = Rr() * 6.283, ph = Math.acos(1 - Rr() * 0.75), rr = 0.85;
      const bx = Math.sin(ph) * Math.cos(th) * rr, by = Math.cos(ph) * rr * base.h + 0.05, bz = Math.sin(ph) * Math.sin(th) * rr;
      d.set(bx * 0.55 + (Rr() - 0.5) * 0.25, 1, bz * 0.55 + (Rr() - 0.5) * 0.25).normalize();
      const stem = o.stem * (0.7 + 0.6 * Rr()), fl = o.flen * (0.7 + 0.6 * Rr()), fr = o.frad * (0.8 + 0.4 * Rr()), sw = 0.012;
      tmp.set(Rr() - 0.5, Rr() - 0.5, Rr() - 0.5); t.crossVectors(d, tmp).normalize(); b.crossVectors(d, t);
      const p0 = new V(bx, by, bz), p1 = p0.clone().addScaledVector(d, stem), p2 = p1.clone().addScaledVector(d, fl * 0.5), p3 = p1.clone().addScaledVector(d, fl);
      const a1 = p0.clone().addScaledVector(t, sw), a2 = p0.clone().addScaledVector(t, -sw), a3 = p1.clone().addScaledVector(t, -sw * 0.6), a4 = p1.clone().addScaledVector(t, sw * 0.6);
      tri(a1, a2, a3, up, sc); tri(a1, a3, a4, up, sc);
      const k = 0.8 + 0.4 * Rr(), fc = [lin(o.flower[0] * k), lin(o.flower[1] * k), lin(o.flower[2] * k)];
      const m = [p2.clone().addScaledVector(t, fr), p2.clone().addScaledVector(b, fr), p2.clone().addScaledVector(t, -fr), p2.clone().addScaledVector(b, -fr)];
      for (let j = 0; j < 4; j++) { const mj = m[j], mk = m[(j + 1) % 4], nn = mj.clone().add(mk).sub(p2).sub(p2).normalize(); tri(p1, mj, mk, nn, fc); tri(p3, mk, mj, nn, fc); }
    }
    return buildGeo(P, N, C, null);
  }
  const PLANTS = {
    grass: [
      grassGeo(1, 64, { base: [0.2, 0.3, 0.07], tip: [0.64, 0.72, 0.2] }),
      grassGeo(2, 72, { base: [0.22, 0.32, 0.08], tip: [0.74, 0.68, 0.27] }),
      grassGeo(3, 56, { base: [0.17, 0.29, 0.1], tip: [0.5, 0.63, 0.22] }),
    ],
    vgrass: [grassGeo(11, 120, { base: [0.33, 0.44, 0.16], tip: [0.86, 0.88, 0.62] }), grassGeo(12, 104, { base: [0.3, 0.42, 0.15], tip: [0.8, 0.84, 0.52] })],
    fern: [
      frondGeo(4, 13, { seg: 22, len: [0.8, 1.0], e0: [0.8, 1.15], droop: 0.5, w: 0.17, wp: 0.8, lobes: 11, c0: [0.22, 0.4, 0.08], c1: [0.48, 0.68, 0.18] }),
      frondGeo(5, 11, { seg: 22, len: [0.75, 1.0], e0: [0.9, 1.25], droop: 0.4, w: 0.16, wp: 0.8, lobes: 9, c0: [0.25, 0.43, 0.1], c1: [0.55, 0.7, 0.22] }),
    ],
    hosta: [frondGeo(6, 9, { seg: 8, len: [0.55, 0.75], e0: [0.7, 1.0], droop: 0.55, w: 0.24, wp: 0.75, c0: [0.2, 0.36, 0.17], c1: [0.33, 0.5, 0.22], margin: 1.35 })],
    lavender: [spikeShrubGeo(13, { leaves: 520, h: 0.7, leaf: 0.16, leafCol: [0.36, 0.43, 0.3], core: [0.12, 0.16, 0.1] }, 95, { stem: 0.45, flen: 0.34, frad: 0.042, stemCol: [0.4, 0.46, 0.3], flower: [0.52, 0.35, 0.82] })],
    catmint: [shrubGeo(14, 700, 260, { h: 0.6, leaf: 0.15, leafCol: [0.33, 0.45, 0.25], core: [0.1, 0.16, 0.08], flower: [0.64, 0.54, 0.88], fsize: 0.03 })],
    pink: [shrubGeo(7, 650, 170, { h: 0.72, leaf: 0.2, leafCol: [0.18, 0.3, 0.1], core: [0.07, 0.13, 0.05], flower: [0.93, 0.33, 0.56], fsize: 0.055 })],
    white: [shrubGeo(8, 620, 150, { h: 0.7, leaf: 0.2, leafCol: [0.2, 0.32, 0.12], core: [0.07, 0.13, 0.05], flower: [0.96, 0.94, 0.84], fsize: 0.05 })],
    box: [shrubGeo(10, 900, 0, { h: 0.8, leaf: 0.17, leafCol: [0.2, 0.35, 0.1], core: [0.06, 0.12, 0.04] })],
    moss: [shrubGeo(15, 520, 0, { h: 0.55, leaf: 0.11, leafCol: [0.42, 0.62, 0.12], core: [0.2, 0.34, 0.06] })],
    cypress: [shrubGeo(16, 1100, 0, { h: 1.0, leaf: 0.16, leafCol: [0.13, 0.26, 0.11], core: [0.05, 0.1, 0.04] })],
  };
  ASSET_SETS[detail] = { waterNrm, KINDS, COBBLE_HI, COBBLE_LO, PLANTS };
  return ASSET_SETS[detail];
}
/** Free the shared rock, cobble and plant geometry (one detail level, or all). Only when no waterfall left uses it. */
export function disposeWaterfallAssets(detail) {
  for (const d in ASSET_SETS) {
    if (detail && d !== detail) continue;
    const A = ASSET_SETS[d];
    A.waterNrm.dispose();
    for (const k in A.KINDS) for (const g of A.KINDS[k]) g.dispose();
    for (const g of [...A.COBBLE_HI, ...A.COBBLE_LO]) g.dispose();
    for (const k in A.PLANTS) for (const g of A.PLANTS[k]) g.dispose();
    delete ASSET_SETS[d];
  }
}

// ============================================================ the feature
export const WATERFALL_DEFAULTS = {
  width: 12,        // front width in feet; all rockwork stays inside it
  height: 7.5,      // patio level to the top head stone, feet (7 to 8)
  lowest: 5.5,      // lowest level front to back, feet (5 to 6)
  level: 3,         // each of the three upper levels front to back, feet (3 to 5)
  backSlope: 4.5,   // how far the planted soil runs behind the top stones before it is back at grade, feet
  lift: 0,          // raise the whole feature this many feet (use about 0.6 if the host cannot open its ground under it)
  unit: 1,          // world units per foot (0.3048 in a scene measured in metres)
  seed: 20261118,   // same seed, same rock placement
  plants: false,    // the model's own generic planting; leave off when the plan supplies real plants
  moss: true,       // moss cushions in the rock seams
  lights: 'data',   // 'data': only report where the under-fall lights go; 'three': also add PointLights; false: none
  refraction: true, // water reads a colour + depth copy of the scene (see setRefraction)
  detail: 'full',   // 'light': rocks with about a third of the triangles (phones, tablets); same layout, sizes within a percent or so
  shading: null,    // 'full' | 'light'. Left out, it follows `detail`. 'light' drops the finest grain, speckle and lichen from rock and cobble (set at creation)
  ground: null,     // { color, roughness, width, tint, sink }: blend the edge of the soil into the host's ground (see setGround)
  topFall: null,    // feet: the top fall's drop (head pool to the next pool) when shorter than the model's own share;
                    // the lower pools stay where `height` puts them and the top stones come down with the head pool
  mulch: null,      // { dark, light, grain }: the soil cover's two tones (linear RGB arrays) and how fine it is (1 = bark chips;
                    // higher is finer), to match the bed around it; null keeps the model's own shredded bark
};
// the feature's own shredded bark (linear): its dark and light tones, and its average colour once the chips are drawn.
// The average is what setGround's tint works from; with options.mulch it is rescaled to the tones given.
const MULCH_DARK = [0.085, 0.036, 0.02], MULCH_LIGHT = [0.27, 0.125, 0.06], MULCH_MEAN = [0.15, 0.068, 0.034];
/** Overall size in feet for a set of options, without building anything. */
export function waterfallSize(options = {}) {
  const o = { ...WATERFALL_DEFAULTS, ...options }, head = 1.5 + (o.level - 3) * 0.25;
  return { width: o.width, depth: o.lowest + 3 * o.level + head, height: topHeight(o.height, o.topFall), soilBehind: o.backSlope + 0.8, soilBeside: 3.2 };
}
/** Patio level to the top stones: `height`, or with a short top fall, the next pool's level plus that fall plus the head stones. */
function topHeight(height, topFall) {
  if (!topFall) return height;
  const top = height - 0.95, wl1 = top - 0.30 * (top + 0.15);
  return wl1 + topFall + 0.95;
}
export function createWaterfall(options = {}) {
  const o = { ...WATERFALL_DEFAULTS, ...options };
  let W = o.width;
  const { waterNrm, KINDS, COBBLE_HI, COBBLE_LO, PLANTS } = assets(o.detail);
  const DEF = o.refraction ? { REFRACT: 1 } : {};
  const LIGHT = (o.shading ?? o.detail) === 'light';   // cheaper rock and cobble shading for phones and tablets
  let rnd = mulberry32(1);
  const R2 = (a, b) => a + (b - a) * rnd();
  // light and sky, set by the host through setEnvironment()
  const U = {
    time: { value: 0 }, amb: { value: new THREE.Color(0.55, 0.6, 0.65) }, sunC: { value: new THREE.Color(0.5, 0.45, 0.4) },
    glow: { value: new THREE.Color(1.0, 0.7, 0.4) }, glowAmt: { value: 0 }, pscale: { value: 600 }, trans: { value: new THREE.Color(0, 0, 0) },
  };
  const skyU = {
    uTop: { value: new THREE.Color(0.05, 0.19, 0.53) }, uHor: { value: new THREE.Color(0.62, 0.75, 0.87) },
    uSunDir: { value: new THREE.Vector3(-0.3, 0.8, 0.5).normalize() }, uSunCol: { value: new THREE.Color(1, 0.9, 0.75) }, uDisc: { value: 1 },
  };
  const WU = {
    tRefr: { value: null }, tDepth: { value: null }, tNrm: { value: waterNrm },
    uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    uTree: { value: new THREE.Color(0.02, 0.03, 0.015) }, uCaust: { value: 0.5 },
    uLand: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, -99)) },
    uModel: { value: new THREE.Matrix4() }, uInv: { value: new THREE.Matrix4() },
    uFlow: { value: 1 },   // 1 while the pump runs; 0 stills the falls' churn and foam (setFlowing)
  };
  // what every surface knows about the water around it, all in feature-local feet
  const WI = {
    uPool: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4(0, 0, 1, 1)) }, uPoolWL: { value: [0, 0, 0, 0, 0] },
    uFallA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uFallB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uHmap: { value: null }, uHmapRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uSoil: { value: new THREE.Color(0.1, 0.058, 0.034) },
    uUnit: { value: o.unit },
  };
  const bindWI = sh => { for (const k in WI) sh.uniforms[k] = WI[k]; };
  // how the soil meets the host's ground (setGround): off until a colour is given
  const GU = {
    uEdgeCol: { value: new THREE.Color(0.15, 0.068, 0.034) }, uEdgeRough: { value: 0.95 }, uEdgeAmt: { value: 0 }, uEdgeW: { value: 2.5 },
    uTintK: { value: new THREE.Vector3(1, 1, 1) }, uSoilRect: { value: new THREE.Vector4(-1, -1, 1, 1) }, uEdgeTex: { value: 1 }, uEdgeChip: { value: 0 }, uEdgeSpec: { value: 1 },
    uEdgePat: { value: new THREE.Vector2(0.46, 1.539) },   // the cover's dark and light tone over its middle tone (see below)
  };
  // the soil cover: the model's own shredded bark unless the host matches it to the bed around it (options.mulch)
  const MU = { uMulchA: { value: new THREE.Color(...MULCH_DARK) }, uMulchB: { value: new THREE.Color(...MULCH_LIGHT) }, uGrain: { value: 1 } };
  let mulchMean = MULCH_MEAN;
  if (o.mulch) {
    MU.uMulchA.value.setRGB(...o.mulch.dark); MU.uMulchB.value.setRGB(...o.mulch.light); MU.uGrain.value = o.mulch.grain || 1;
    // the dirt line at the foot of the rocks takes the same soil
    WI.uSoil.value.copy(MU.uMulchA.value).lerp(MU.uMulchB.value, 0.35);
    // the edge blend (setGround) follows the new cover: its average colour for the tint, and the contrast of its two
    // tones for the chips drawn in the faded band (the pair still averages 1, so the band still averages the host's colour)
    const A = MU.uMulchA.value, B = MU.uMulchB.value, lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    mulchMean = ['r', 'g', 'b'].map((k, i) => Math.max(1e-4, MULCH_MEAN[i] * (A[k] + B[k]) / (MULCH_DARK[i] + MULCH_LIGHT[i])));
    const mid = Math.max((lum(A) + lum(B)) / 2, 1e-6);
    GU.uEdgePat.value.set(lum(A) / mid, lum(B) / mid);
  }
  const group = new THREE.Group(); group.name = 'four-fall-waterfall';
  const body = new THREE.Group(); group.add(body);
  let soil = null;

  // ---- rock: granite speckle and hairline cracks, world-space moss and lichen, soil at the base,
  //      a wet band above the water line and an algae tint below it
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  rockMat.onBeforeCompile = sh => {
    bindWI(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRk; varying vec3 vRkW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 rkS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vRkW = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vec3 rkS = vec3(1.0);
          vRkW = transformed;
        #endif
        vRk = position * rkS;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRk; varying vec3 vRkW;\n' + NOISE3 + WATER_INFO)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rkFade = 1.0 - smoothstep(18.0, 46.0, length(vViewPosition) / uUnit);
        #ifdef WF_LIGHT
          float rkG = rkN(vRk * 24.0);
          float rkMott = rkN(vRk * 5.5 + 2.0);
          float rkDark = 0.0, rkLight = 0.0;
          float rkNz = rkN(vRkW * 2.6);
        #else
          float rkG = rkN(vRk * 24.0) * 0.6 + rkN(vRk * 61.0) * 0.4;
          float rkMott = rkN(vRk * 5.5 + 2.0) * 0.6 + rkN(vRk * 12.0 + 7.0) * 0.4;
          float rkDark = smoothstep(0.74, 0.84, rkN(vRk * 140.0)) * rkFade;
          float rkLight = smoothstep(0.74, 0.88, rkN(vRk * 190.0 + 3.7)) * rkFade;
          float rkNz = rkN(vRkW * 2.6) * 0.6 + rkN(vRkW * 8.5) * 0.4;
        #endif
        vec3 rkWI = waterInfo(vRkW, rkNz);
        float rkHt = (0.008 * rkG + 0.02 * rkMott - 0.002 * rkDark) * rkFade * (1.0 - 0.8 * rkWI.x);
        diffuseColor.rgb *= (0.88 + 0.22 * rkG) * (0.86 + 0.28 * rkMott) * (1.0 - 0.2 * rkDark);
        diffuseColor.rgb += 0.03 * rkLight;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = rkPerturb(-vViewPosition, normal, vec2(dFdx(rkHt), dFdy(rkHt)) * uUnit, faceDirection);
        vec3 rkWN = inverseTransformDirection(normal, viewMatrix);
        float rkAbove = vRkW.y - groundAt(vRkW);
        float rkDry = 1.0 - rkWI.x;
        #ifdef WF_LIGHT
          float rkMt = 0.6 - 0.27 * rkWI.z, rkMf = 0.5;
        #else
          float rkLi = smoothstep(0.78, 0.9, rkN(vRkW * 13.0 + 21.0)) * smoothstep(0.5, 0.68, rkN(vRkW * 1.6 + 3.0)) * rkDry * smoothstep(-0.2, 0.4, rkWN.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.32, 0.25), rkLi * 0.22);
          float rkMt = 0.6 - 0.27 * rkWI.z, rkMf = rkN(vRkW * 34.0);
        #endif
        float rkMoss = smoothstep(0.42, 0.86, rkWN.y + 0.25 * (rkNz - 0.5)) * smoothstep(rkMt, rkMt + 0.15, rkNz + (rkMf - 0.5) * 0.14) * step(rkWI.y, 0.0001) * (1.0 - smoothstep(0.3, 0.8, rkWI.x));
        #ifdef WF_LIGHT
          vec3 rkMossC = mix(vec3(0.045, 0.062, 0.012), vec3(0.15, 0.165, 0.035), rkG);
        #else
          vec3 rkMossC = mix(vec3(0.045, 0.062, 0.012), vec3(0.15, 0.165, 0.035), rkN(vRkW * 19.0)) * (0.7 + 0.6 * rkMf);
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, rkMossC, rkMoss * 0.9);
        float rkDirt = (1.0 - smoothstep(0.01, 0.15 + 0.16 * rkNz, rkAbove)) * (1.0 - smoothstep(0.0, 0.05, rkWI.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSoil * (0.7 + 0.6 * rkG), rkDirt * 0.88);
        diffuseColor.rgb *= mix(0.58, 1.0, smoothstep(-0.05, 0.6, rkAbove));
        diffuseColor.rgb *= mix(1.0, 0.58, rkWI.x);
        float rkSub = smoothstep(0.0, 0.3, rkWI.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.72, 0.4), rkSub * 0.55);
        roughnessFactor = clamp(mix(roughnessFactor, 0.2, rkWI.x * (1.0 - rkMoss)) + rkMoss * 0.1 + rkDirt * 0.1, 0.05, 1.0);`);
  };
  if (LIGHT) rockMat.defines = { ...rockMat.defines, WF_LIGHT: 1 };
  rockMat.customProgramCacheKey = () => 'wf-rock-v5' + (LIGHT ? '-light' : '');

  // ---- cobbles and pebbles: dry and matte on the bank, dark and glossy where the water reaches them
  const pebbleMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  pebbleMat.onBeforeCompile = sh => {
    bindWI(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vPbW = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vPbW = transformed;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbW;\n' + NOISE3 + WATER_INFO)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef WF_LIGHT
          float pbG = rkN(vPbW * 38.0), pbB = 0.5, pbS = 0.0;
        #else
          float pbG = rkN(vPbW * 38.0), pbB = rkN(vPbW * vec3(9.0, 26.0, 9.0) + 4.0), pbS = smoothstep(0.7, 0.85, rkN(vPbW * 120.0));
        #endif
        vec3 pbWI = waterInfo(vPbW, pbG);
        float pbAbove = vPbW.y - groundAt(vPbW);
        diffuseColor.rgb *= (0.8 + 0.3 * pbG) * (0.85 + 0.3 * pbB) * (1.0 - 0.25 * pbS) * mix(1.0, 0.56, pbWI.x) * mix(0.4, 1.0, smoothstep(-0.03, 0.07, pbAbove));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.78, 0.5), smoothstep(0.0, 0.3, pbWI.y) * 0.4);
        roughnessFactor = mix(roughnessFactor, 0.16, pbWI.x);`);
  };
  if (LIGHT) pebbleMat.defines = { ...pebbleMat.defines, WF_LIGHT: 1 };
  pebbleMat.customProgramCacheKey = () => 'wf-pebble-v5' + (LIGHT ? '-light' : '');

  // ---- ground: shredded bark mulch, stream gravel and lawn drawn in world space; darker and mossier near water
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  groundMat.onBeforeCompile = sh => {
    bindWI(sh);
    for (const k in GU) sh.uniforms[k] = GU[k];
    for (const k in MU) sh.uniforms[k] = MU[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat; varying vec2 vMat; varying vec3 vTW; varying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vGN = normal; vTW = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat; varying vec3 vTW; varying vec3 vGN;\nuniform vec3 uEdgeCol, uTintK; uniform float uEdgeRough, uEdgeAmt, uEdgeW, uEdgeTex, uEdgeChip, uEdgeSpec; uniform vec4 uSoilRect;\nuniform vec3 uMulchA, uMulchB; uniform float uGrain; uniform vec2 uEdgePat;\n' + NOISE3 + VORO2 + WATER_INFO + GCHIPS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gFade = 1.0 - smoothstep(22.0, 60.0, length(vViewPosition) / uUnit);
        // bark chips are drawn from above on flat soil and from the side on steep banks, and the drawings are blended;
        // bending a single drawing round the bank made stripes
        vec2 gp = vTW.xz;
        vec3 gTw = pow(abs(normalize(vGN)), vec3(4.0)); gTw /= gTw.x + gTw.y + gTw.z;
        vec2 gChip = vec2(0.0); float gCw = 0.0;
        if (gTw.y > 0.02) { gChip += gTw.y * gChips(gp * uGrain); gCw += gTw.y; }
        if (gTw.x > 0.02) { gChip += gTw.x * gChips(vTW.zy * uGrain + 3.7); gCw += gTw.x; }
        if (gTw.z > 0.02) { gChip += gTw.z * gChips(vTW.xy * uGrain + 9.1); gCw += gTw.z; }
        gChip /= max(gCw, 0.001);
        float chipH = mix(0.55, gChip.x, gFade);
        float chipC = mix(0.5, gChip.y, gFade);
        vec3 mulch = mix(uMulchA, uMulchB, chipC) * (0.5 + 0.7 * chipH) * uTintK;
        #ifdef WF_LIGHT
          // same pixels, less work: gravel is only worked out where there is gravel, and the unused lawn layer is skipped
          vec4 g1 = vMat.x > 0.002 ? voro(gp * 10.0) : vec4(1.0, 1.0, 0.0, 0.0);
        #else
          vec4 g1 = voro(gp * 10.0);
        #endif
        vec3 gcol = mix(vec3(0.3, 0.25, 0.19), vec3(0.4, 0.22, 0.1), step(0.62, g1.z));
        gcol = mix(gcol, vec3(0.2, 0.2, 0.2), step(0.8, g1.w)) * (0.45 + 0.75 * (1.0 - g1.x));
        float gravH = mix(0.5, 1.0 - g1.x, gFade);
        #ifdef WF_LIGHT
          vec3 base = mix(mulch, gcol, vMat.x);
        #else
          float lawnN = rkN(vec3(gp * 13.0, 1.7)) * 0.6 + rkN(vec3(gp * 41.0, 4.1)) * 0.4;
          vec3 lawn = vec3(0.055, 0.115, 0.022) * (0.6 + 0.8 * lawnN);
          vec3 base = mix(mix(mulch, gcol, vMat.x), lawn, vMat.y);
        #endif
        float gNz = rkN(vTW * 2.3) * 0.6 + rkN(vTW * 7.0) * 0.4;
        vec3 gWI = waterInfo(vTW, gNz);
        float gDamp = gWI.z * (1.0 - vMat.y);
        base *= mix(1.0, 0.55, max(gDamp * 0.8, gWI.x));
        base = mix(base, vec3(0.05, 0.085, 0.018) * (0.7 + 0.6 * gNz), gDamp * smoothstep(0.45, 0.7, gNz) * (1.0 - smoothstep(0.0, 0.02, gWI.y)) * 0.75);
        // toward the border of the soil, fade into the host's own ground colour so no line shows where the two meet (setGround)
        float gEdgeD = min(min(vTW.x - uSoilRect.x, uSoilRect.z - vTW.x), min(vTW.z - uSoilRect.y, uSoilRect.w - vTW.z));
        // the first quarter of the width stays fully the host's colour, then it fades: next to a dark bed even a little of
        // this lighter bark would show as a pale band
        float gEdge = uEdgeAmt * (1.0 - smoothstep(uEdgeW * 0.25, uEdgeW, gEdgeD * (0.6 + 0.8 * gNz))) * (1.0 - vMat.x);
        // the fade keeps the bark chips: their light and dark (scaled to average 1) multiply the host's colour, so the band
        // reads as bark in that colour and not as a smooth strip. uEdgeTex 0 gives a flat colour instead.
        float gPat = mix(uEdgePat.x, uEdgePat.y, chipC) * (0.5 + 0.7 * chipH) / 0.883;
        float gBandHt = chipH * 0.035;   // chip relief inside the band, feet
        vec2 gHp = vTW.xz / max(uEdgeChip, 0.001);
        float gHpW = max(fwidth(gHp.x), fwidth(gHp.y));   // how many host chips one pixel covers
        vec3 gOwn = diffuseColor.rgb * base;
        if (gEdge > 0.0) {
          if (uEdgeChip > 0.0) {
            // the host's own bark, when its chip size is given (setGround chipSize): round chips that spacing apart, each
            // darkening to 0.55 at its joint and varying about 20% chip to chip, scaled to average 1. The fade then
            // dissolves from these, at the border, into this feature's shards further in. Where the chips get too
            // small on screen to draw cleanly they settle to their average, so the joints do not shimmer.
            float hF = gFade * (1.0 - smoothstep(0.3, 0.8, gHpW));
            vec4 hc = voro(gHp);
            float hE = mix(0.786, smoothstep(0.0, 0.18, hc.y - hc.x), hF), hId = mix(0.5, hc.z, hF);
            gPat = (0.55 + 0.525 * hE) * (0.8 + 0.4 * hId) / 0.9625;
            // relief in proportion to the chip: about an eighth of its width
            gBandHt = mix(gBandHt, hE * 0.775 * (0.6 + 0.4 * hId) * 0.12 * uEdgeChip, gEdge);
          }
          // mixed on a square-root scale, which steps evenly to the eye between a dark colour and a light one
          vec3 gHost = uEdgeCol * mix(1.0, gPat, uEdgeTex);
          vec3 gMix = mix(sqrt(max(gOwn, vec3(0.0))), sqrt(max(gHost, vec3(0.0))), gEdge);
          diffuseColor.rgb = gMix * gMix;
        } else {
          diffuseColor.rgb = gOwn;
        }
        float gHt = mix(gBandHt, gravH * 0.03, vMat.x) * (1.0 - vMat.y) * gFade * (1.0 - gEdge * (1.0 - uEdgeTex));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        // the sheen of the soil fades toward the host ground's own across the band (setGround specular); on a dark bed
        // the standard sheen reflects enough sky to show the band as a bluish strip
        float gSpecK = mix(1.0, uEdgeSpec, gEdge);
        material.specularColor *= gSpecK; material.specularF90 *= gSpecK;` + (SPEC_BLENDED ? `
        material.specularColorBlended *= gSpecK;` : ''))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(roughnessFactor, 0.3, gWI.x * 0.8), uEdgeRough, gEdge);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = rkPerturb(-vViewPosition, normal, vec2(dFdx(gHt), dFdy(gHt)) * uUnit, faceDirection);`);
  };
  if (LIGHT) groundMat.defines = { ...groundMat.defines, WF_LIGHT: 1 };
  groundMat.customProgramCacheKey = () => 'wf-ground-v5' + (LIGHT ? '-light' : '');

  function plantMaterial(o) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: !o.map, map: o.map || null, alphaTest: o.map ? 0.5 : 0, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time; sh.uniforms.uTrans = U.trans;
      sh.uniforms.uWind = { value: o.wind }; sh.uniforms.uTk = { value: o.tk }; sh.uniforms.uCard = { value: o.card ? 1 : 0 }; sh.uniforms.uTA = { value: o.ta };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uTk, uCard; varying float vTk;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sw = sin(uTime * 1.7 + ip.x * 0.8 + ip.z * 0.6) + 0.5 * sin(uTime * 2.9 + ip.x * 1.7 + ip.z);
          float amt = mix(pow(max(position.y, 0.0), 1.6), 0.5 + 0.5 * position.x, uCard);
          transformed.xz += vec2(0.06, 0.035) * sw * amt * uWind;
          vTk = mix(1.0, clamp(position.y, 0.0, 1.0), uTk);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uTrans; uniform float uTA; varying float vTk;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uTrans * vTk * uTA;');
    };
    m.customProgramCacheKey = () => 'wf-plant-' + (o.map ? 'map' : 'vc');
    return m;
  }
  const grassMat = plantMaterial({ wind: 1, tk: 1, ta: 1.2 });
  const leafyMat = plantMaterial({ wind: 0.5, tk: 0.6, ta: 0.9 });
  const shrubMat = plantMaterial({ wind: 0.18, tk: 0, ta: 0.45 });
  const MATS = { grass: grassMat, vgrass: grassMat, fern: leafyMat, hosta: leafyMat, lavender: shrubMat, catmint: shrubMat, pink: shrubMat, white: shrubMat, box: shrubMat, moss: shrubMat, cypress: shrubMat };

  let L = null;
  function makeLayout(H, base, lvl, topFall) {
    const head = 1.5 + (lvl - 3) * 0.25, lv = [lvl * 1.08, lvl * 0.92, lvl];   // source pool, then three upper levels, a little unequal
    const D = base + lv[0] + lv[1] + lv[2] + head;
    let top = H - 0.95;
    const basin = -0.15, total = top - basin, fr = [0.30, 0.18, 0.27, 0.25];
    const wl = [top]; for (let i = 0; i < 4; i++) wl.push(wl[i] - fr[i] * total); wl[4] = basin;
    // a short top fall: the head pool only topFall above the next pool, the top stones the same height above it as before
    if (topFall) { wl[0] = wl[1] + topFall; top = wl[0]; H = topHeight(H, topFall); }
    // lips from the front: fall 4 at the back of the lowest level, then one level further back each time
    const z4 = -base, z3 = z4 - lv[2], z2 = z3 - lv[1], z1 = z2 - lv[0], fzs = [z1, z2, z3, z4];
    const wander = 1 + clamp((lvl - 3) / 2, 0, 1) * 0.35;
    const fxs = [-0.9, 0.8, -0.55, 0.25].map(v => v * wander), fw = [1.5, 1.9, 2.3, 3.2];
    const falls = fzs.map((z, i) => { const drop = wl[i] - wl[i + 1], t = Math.sqrt(2 * drop / G); return { i, x: fxs[i], z, w: fw[i], top: wl[i], bot: wl[i + 1], drop, t, land: z + V0 * t }; });
    const pools = [], hrz = (head - 0.6) / 2;
    pools.push({ cx: falls[0].x - 0.1, cz: z1 - 0.1 - hrz, rx: 1.2, rz: hrz, wl: wl[0], depth: 0.4, seed: 1.3 });
    for (let i = 1; i < 4; i++) {
      const a = falls[i - 1], b = falls[i], p0 = a.z + 0.3, p1 = b.z - 0.1;
      pools.push({ cx: (a.x + b.x) / 2, cz: (p0 + p1) / 2, rx: Math.max(a.w, b.w) / 2 + 0.55 + Math.abs(a.x - b.x) * 0.2, rz: (p1 - p0) / 2, wl: wl[i], depth: 0.42, seed: i * 2.1 });
    }
    const bz0 = z4 + 0.3, bz1 = -0.8;
    pools.push({ cx: 0.1, cz: (bz0 + bz1) / 2, rx: W * 0.34, rz: (bz1 - bz0) / 2, wl: basin, depth: 0.38, seed: 7.7, basin: true });
    const path = [[pools[0].cx, pools[0].cz]];
    for (let i = 0; i < 4; i++) { path.push([falls[i].x, falls[i].z]); path.push([pools[i + 1].cx, pools[i + 1].cz]); }
    return { H, D, base, lvl, head, wl, falls, pools, path, top, backZ: pools[0].cz - pools[0].rz - 0.8, fenceZ: -D - 5.5 };
  }
  function poolWob(p, a) { return 1 + 0.09 * Math.sin(3 * a + p.seed) + 0.06 * Math.sin(5 * a + p.seed * 2.3); }
  function poolQ(p, x, z) { const dx = (x - p.cx) / p.rx, dz = (z - p.cz) / p.rz; return Math.hypot(dx, dz) / poolWob(p, Math.atan2(dz, dx)); }
  function distPath(x, z) {
    let best = 1e9; const P = L.path;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0], az = P[i][1], vx = P[i + 1][0] - ax, vz = P[i + 1][1] - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1), dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  // soil before any rock is set
  function heightBase(x, z) {
    let s = L.wl[4];
    for (const f of L.falls) s += f.drop * sstep(f.z + 0.35, f.z - 0.05, z);
    s = mix(s, GRADE, sstep(L.backZ, L.backZ - o.backSlope, z));
    const d = distPath(x, z), front = sstep(0.3, -1.4, z), lump = fbm2(x * 0.33 + 3.1, z * 0.33 + 7.7);
    let h = s + (0.55 * sstep(0.6, 2.3, d) + 0.45 * sstep(2.0, 4.4, d)) * front + 0.35 * lump * sstep(1.2, 2.8, d) * front;
    const lat = Math.max(Math.pow(sstep(2.0, W * 0.58, d), 0.85), sstep(W * 0.42, W * 0.64, Math.abs(x)));
    h = mix(h, GRADE + 0.25 * lump * front, lat);
    h = Math.max(h, GRADE + 0.08 * lump);
    for (const f of L.falls) { const q = Math.hypot((x - f.x) / (f.w / 2 + 0.35), (z - (f.z - 0.45)) / 0.5); if (q < 1.2) h = Math.min(h, mix(f.top - 0.4, h, sstep(0.85, 1.2, q))); }
    for (const p of L.pools) { const q = poolQ(p, x, z); if (q < 1.15) { const tz = clamp((p.cz + p.rz - z) / (2 * p.rz), 0, 1), bed = p.wl - 0.04 - p.depth * (1 - 0.6 * q * q) * (p.basin ? 1 : 0.45 + 1.0 * tz); h = Math.min(h, mix(bed, h, sstep(0.8, 1.15, q))); } }
    return h;
  }
  // soil after the rocks are set: it is pushed up a little around each buried stone
  let bermRocks = [];
  function heightAt(x, z) {
    let h = heightBase(x, z);
    for (const r of bermRocks) { const dx = x - r.x, dz = z - r.z, d2 = dx * dx + dz * dz, R = r.rad; if (d2 > R * R * 4.4) continue; const u = (Math.sqrt(d2) - R * 0.95) / (R * 0.42); h += r.bermH * Math.exp(-u * u); }
    return h;
  }
  function bedness(x, z) {
    const edge = W / 2 + 2.8 + 0.9 * fbm2(z * 0.3, 4.4);
    const side = sstep(edge + 0.4, edge - 0.4, Math.abs(x)) * sstep(0.7, 0.4, z);
    const back = sstep(L.fenceZ + 3.6, L.fenceZ + 2.9, z);
    return Math.max(side, back);
  }
  function inFall(x, z, m = 0.2) { for (const f of L.falls) if (Math.abs(x - f.x) < f.w / 2 + m && z > f.z - 1.3 && z < f.land + 0.55) return true; return false; }

  const fx = new THREE.Group();   // water, falls and spray: kept out of the refraction copy
  let trash = [], labelObjs = [], rocks = [], plantSpots = [], ribbons = [], flowObjs = [];
  let fallLights = [], spotLights = [], dimGroup = null;
  function track(...xs) { trash.push(...xs); return xs[0]; }
  function clearWorld() {
    for (const o of labelObjs) o.element.remove();
    labelObjs = [];
    for (const t of trash) t.dispose();
    trash = []; flowObjs = []; fx.clear(); body.clear(); body.add(fx);
    fallLights = []; spotLights = [];
  }

  // ---------- rocks
  // kind: 'b' blocky granite boulder, 'r' river-worn stone, 's' layered slab
  function addRock(kind, x, z, size, o = {}) {
    const list = KINDS[kind], v = o.v ?? Math.floor(rnd() * list.length), bb = list[v].boundingBox, bbH = bb.max.y - bb.min.y, s = size / 2;
    let sx, sy, sz;
    if (o.scale) [sx, sy, sz] = o.scale; else { sx = s * (o.ax ?? R2(0.9, 1.15)); sz = s * (o.az ?? R2(0.88, 1.12)); sy = s * (o.ay ?? R2(0.9, 1.2)); }
    if (o.height !== undefined) sy = o.height / bbH;
    { const lim = W / 2 - Math.max(sx, sz) * 0.88; x = clamp(x, -lim, lim); }
    const gb = heightBase(x, z);
    let y;
    if (o.top !== undefined) y = o.top - bb.max.y * sy;
    else if (o.bottom !== undefined) y = o.bottom - bb.min.y * sy;
    else y = gb - bb.min.y * sy - (o.bury ?? 0.4) * bbH * sy;
    if (o.minTop !== undefined) { const t = y + bb.max.y * sy; if (t < o.minTop) y += o.minTop - t; }
    let tx = o.level ? 0 : (rnd() - 0.5) * 0.16, tz = o.level ? 0 : (rnd() - 0.5) * 0.16;
    if (o.lean) { // lean into the slope, the way a stone settles in a bank
      const gx = (heightBase(x + 0.4, z) - heightBase(x - 0.4, z)) / 0.8, gz = (heightBase(x, z + 0.4) - heightBase(x, z - 0.4)) / 0.8, m = Math.hypot(gx, gz);
      if (m > 0.05) { const ang = Math.min(0.22, m * 0.18); tx += gz / m * ang; tz -= gx / m * ang; }
    }
    const rad = Math.max(sx, sz) * 0.92;
    const r = { kind, v, x, y, z, sx, sy, sz, ry: o.ry ?? rnd() * 6.283, tx, tz, rad, tint: R2(0.88, 1.1), warm: R2(-0.04, 0.05), berm: o.bury !== undefined || o.lean ? 1 : 0, bermH: Math.min(0.2, rad * 0.16) };
    rocks.push(r); return r;
  }
  function free(x, z, rad, k = 0.8) { for (const r of rocks) { const dx = x - r.x, dz = z - r.z, m = (r.rad + rad) * k; if (dx * dx + dz * dz < m * m) return false; } return true; }
  function ellipseWalk(p, a0, a1, sx, sz, fn) { let a = a0, guard = 0; while (a < a1 && guard++ < 200) { const step = fn(a); const ds = Math.hypot(p.rx * sx * Math.sin(a), p.rz * sz * Math.cos(a)) || 0.1; a += step / ds; } }
  function placeRocks() {
    const { falls, pools, H } = L;
    ribbons = [];
    for (const f of falls) {
      const low = pools[f.i + 1], bedLow = low.wl - low.depth;
      // lip: two or three flat stones at slightly different heights, so the water finds the low spots
      const n = f.w > 2.6 ? 3 : 2, parts = []; let tot = 0;
      for (let k = 0; k < n; k++) { const pw = R2(0.8, 1.25); parts.push(pw); tot += pw; }
      let x0 = f.x - f.w / 2 - 0.15; const span = f.w + 0.3;
      for (let k = 0; k < n; k++) {
        const ws = span * parts[k] / tot, cx = x0 + ws / 2; x0 += ws;
        const dep = R2(1.15, 1.5), front = f.z + R2(-0.06, 0.12);
        addRock('s', cx, front - dep / 2, 0, { scale: [(ws + 0.24) / 2, 1, dep / 1.6], height: R2(0.34, 0.46), top: f.top - R2(0.02, 0.07), ry: R2(-0.1, 0.1), level: true });
        ribbons.push({ f, x: cx + R2(-0.04, 0.04) * ws, w: ws * R2(0.8, 0.97), lip: front, top: f.top, bot: f.bot, v0: R2(1.5, 2.6), brk: R2(0.7, 1.3), seed: rnd() * 50 });
        if (k < n - 1 && rnd() < 0.75) ribbons.push({ f, x: x0 + R2(-0.05, 0.05), w: R2(0.14, 0.3), lip: front - 0.03, top: f.top, bot: f.bot, v0: R2(0.9, 1.5), brk: 1.9, seed: rnd() * 50 });
      }
      // the face behind the water: dark layered ledge stone in two courses, the lip overhanging
      const faceH = f.top - 0.4 - bedLow, h1 = faceH * R2(0.5, 0.6);
      addRock('s', f.x + R2(-0.15, 0.15), f.z - 0.12, 0, { scale: [f.w * 0.62, 1, R2(0.42, 0.52)], height: h1 + 0.15, bottom: bedLow - 0.12, ry: R2(-0.08, 0.08), level: true });
      for (const sd of [-1, 1]) addRock('s', f.x + sd * f.w * R2(0.24, 0.32), f.z - 0.26 + R2(-0.05, 0.05), 0, { scale: [f.w * R2(0.34, 0.42), 1, R2(0.42, 0.5)], height: faceH - h1 + 0.12, bottom: bedLow + h1 - 0.08, ry: R2(-0.12, 0.12), level: true });
      // each side is framed by stacked stones: a footing stone in the lower pool, a cap stone above the lip, small stones in the joints
      for (const sd of [-1, 1]) {
        const topY = f.top + R2(0.25, 0.6), botY = bedLow - 0.25, hh = (topY - botY) * R2(0.5, 0.6);
        const s1 = clamp(f.drop * 0.9 + R2(0.2, 0.6), 1.3, 2.1), s2 = R2(1.0, 1.6);
        const r1 = addRock('b', f.x + sd * (f.w / 2 + 0.2 + s1 * 0.38), f.z + R2(0.05, 0.3), s1, { bottom: botY, height: hh + 0.25 });
        const r2 = addRock('b', f.x + sd * (f.w / 2 + 0.25 + s2 * 0.4), f.z - R2(0.1, 0.4), s2, { top: topY, height: topY - botY - hh + 0.3 });
        for (let k = 0; k < 3; k++) {
          const base = k === 0 ? r1 : r2, a = rnd() * 6.283, sm = R2(0.4, 0.8), x = base.x + Math.cos(a) * (base.rad + sm * 0.3), z = base.z + Math.sin(a) * (base.rad + sm * 0.3);
          if (!inFall(x, z, 0.1) && free(x, z, sm * 0.5, 0.55)) addRock(rnd() < 0.35 ? 'r' : 'b', x, z, sm, { bury: R2(0.35, 0.5) });
        }
        // stones step out from the frame into the bank and die away into planting
        let off = f.w / 2 + 0.3 + Math.max(s1, s2) * 0.8; const ns = 1 + Math.floor(rnd() * 2.2);
        for (let k = 0; k < ns; k++) {
          const s3 = R2(0.7, 1.3) * (1 - k * 0.15), x = f.x + sd * (off + s3 * 0.4), z = f.z + R2(-0.9, 0.6);
          if (free(x, z, s3 * 0.5, 0.7)) addRock('b', x, z, s3, { bury: R2(0.36, 0.5), lean: true });
          off += s3 * R2(0.8, 1.5);
        }
      }
    }
    // head stones: the water comes out from between them
    const hp = pools[0];
    addRock('b', hp.cx + 0.1, hp.cz - hp.rz - 0.45, 2.0, { top: H, height: 1.7 });
    addRock('b', hp.cx - 1.3, hp.cz - hp.rz - 0.05, 1.6, { top: H - R2(0.35, 0.6), height: 1.4 });
    addRock('b', hp.cx + 1.35, hp.cz - hp.rz - 0.15, 1.5, { top: H - R2(0.5, 0.85), height: 1.3 });
    addRock('b', hp.cx - 0.8, hp.cz - hp.rz - 1.3, 1.3, { bury: 0.45, lean: true });
    addRock('b', hp.cx + 1.0, hp.cz - hp.rz - 1.4, 1.1, { bury: 0.45, lean: true });
    // anchor boulders at the front corners
    for (const sd of [-1, 1]) {
      addRock('b', sd * (W / 2 - 1.05), -1.3, sd < 0 ? 2.0 : 1.8, { bury: 0.36 });
      addRock('b', sd * (W / 2 - 0.9), -3.2, 1.4, { bury: 0.4 });
      addRock('b', sd * (W / 2 - 1.9), -2.3, 0.75, { bury: 0.42 });
      addRock('r', sd * (W / 2 - 2.5), -0.6, 0.85, { bury: 0.42 });
    }
    // each pool: one stone standing in the water, then an uneven rim with gaps left for soil and plants
    pools.forEach((p, pi) => {
      const bed = p.wl - p.depth;
      if (pi > 0) {
        const a = rnd() * 6.283, rr = R2(0.25, 0.55), x = p.cx + Math.cos(a) * p.rx * rr, z = p.cz + Math.sin(a) * p.rz * rr * 0.6 + p.rz * 0.15, s = p.basin ? R2(1.0, 1.4) : R2(0.7, 1.1);
        if (!inFall(x, z, 0.1) && free(x, z, s * 0.5, 0.9)) { const cr = addRock('r', x, z, s, { bottom: bed - 0.12, height: p.depth + R2(0.2, 0.5) + 0.12 }); cr.wake = 1; }
      }
      ellipseWalk(p, p.basin ? Math.PI * 0.85 : 0, p.basin ? Math.PI * 2.15 : Math.PI * 2, 1.03, 1.05, a => {
        const t = rnd(), size = t < 0.15 ? R2(1.1, 1.5) : t < 0.6 ? R2(0.7, 1.0) : R2(0.4, 0.65);
        const wob = poolWob(p, a), x = p.cx + Math.cos(a) * p.rx * 1.03 * wob, z = p.cz + Math.sin(a) * p.rz * 1.05 * wob;
        if (!inFall(x, z, 0.2) && free(x, z, size * 0.5, 0.78)) addRock(rnd() < 0.3 ? 'r' : 'b', x, z, size, { bottom: bed + R2(-0.1, 0.15), minTop: p.wl + 0.15 });
        return size * R2(0.85, 1.9);
      });
    });
    // outcrops on the flanks, in threes: an anchor, a companion and a small stone
    let groups = 0;
    for (let t = 0; t < 900 && groups < 11; t++) {
      const sd = groups % 2 ? 1 : -1, x = sd * R2(2.6, W * 0.5 - 0.6), z = R2(-L.D * 0.95, -1.8);
      if (distPath(x, z) < 2.6 || heightBase(x, z) < 0.3) continue;
      const s = R2(1.2, 2.0); if (!free(x, z, s * 0.5, 1.05)) continue;
      addRock('b', x, z, s, { bury: R2(0.38, 0.5), lean: true });
      const a = rnd() * 6.283, s2 = s * R2(0.5, 0.65), x2 = x + Math.cos(a) * (s + s2) * 0.42, z2 = z + Math.sin(a) * (s + s2) * 0.42;
      if (free(x2, z2, s2 * 0.5, 0.6)) addRock('b', x2, z2, s2, { bury: R2(0.4, 0.5), lean: true });
      const a3 = a + R2(1.6, 2.8), s3 = s * R2(0.28, 0.4), x3 = x + Math.cos(a3) * (s + s3) * 0.45, z3 = z + Math.sin(a3) * (s + s3) * 0.45;
      if (free(x3, z3, s3 * 0.5, 0.6)) addRock(rnd() < 0.2 ? 'r' : 'b', x3, z3, s3, { bury: R2(0.4, 0.55) });
      groups++;
    }
    for (const r of rocks.slice()) {
      if (r.kind === 's' || r.rad < 0.55) continue;
      const k = Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) { const a = rnd() * 6.283, sm = R2(0.3, 0.6), x = r.x + Math.cos(a) * (r.rad + sm * 0.25), z = r.z + Math.sin(a) * (r.rad + sm * 0.25);
        let wet = false; for (const p of L.pools) if (poolQ(p, x, z) < 0.95) wet = true;
        if (!wet && !inFall(x, z, 0.1) && free(x, z, sm * 0.5, 0.5)) addRock(rnd() < 0.3 ? 'r' : 'b', x, z, sm, { bury: R2(0.4, 0.55) }); }
    }
    bermRocks = rocks.filter(r => r.berm);
  }
  function buildRockMeshes() {
    const groups = new Map();
    for (const r of rocks) { const k = r.kind + r.v; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const list of groups.values()) {
      const mesh = track(new THREE.InstancedMesh(KINDS[list[0].kind][list[0].v], rockMat, list.length));
      list.forEach((r, i) => {
        e.set(r.tx, r.ry, r.tz); q.setFromEuler(e); pos.set(r.x, r.y, r.z); sc.set(r.sx, r.sy, r.sz);
        mesh.setMatrixAt(i, m4.compose(pos, q, sc));
        mesh.setColorAt(i, col.setRGB(r.tint * (1 + r.warm), r.tint, r.tint * (1 - r.warm)));
      });
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); body.add(mesh);
    }
  }

  // ---------- what the shaders need to know about this layout
  function publishLayout() {
    L.pools.forEach((p, i) => { WI.uPool.value[i].set(p.cx, p.cz, p.rx * (p.basin ? 1.22 : 1.16), p.rz * (p.basin ? 1.3 : 1.1)); WI.uPoolWL.value[i] = p.wl; });
    L.falls.forEach((f, i) => { WI.uFallA.value[i].set(f.x, f.z, f.w / 2, f.top); WI.uFallB.value[i].set(f.land, f.bot, 0, 0); WU.uLand.value[i].set(f.x, f.land, f.w / 2, f.bot); });
    const N = 256, x0 = -(W / 2 + 6), x1 = W / 2 + 6, z0 = -L.D - o.backSlope - 1.5, z1 = 3, data = new Uint16Array(N * N);
    for (let j = 0; j < N; j++) { const z = z0 + (j + 0.5) / N * (z1 - z0); for (let i = 0; i < N; i++) data[j * N + i] = THREE.DataUtils.toHalfFloat(heightAt(x0 + (i + 0.5) / N * (x1 - x0), z)); }
    const tex = track(new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType));
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    WI.uHmap.value = tex; WI.uHmapRect.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
  }

  // ---------- soil
  function buildTerrain() {
    const x0 = -(W / 2 + 3.2), x1 = W / 2 + 3.2, z0 = -L.D - o.backSlope - 0.8, z1 = 0.4, nx = Math.round((x1 - x0) / 0.18), nz = Math.round((z1 - z0) / 0.18);
    soil = { x0, x1, z0, z1 };
    GU.uSoilRect.value.set(x0, z0, x1, z1);
    // the border of the soil: tucked 0.3 ft under the host's ground, or (with setGround) brought up to meet it almost flush
    builtSink = groundSink();
    const rim = (o.ground ? 0 : GRADE) - builtSink - o.lift;
    // with setGround the soil also runs a little past its rectangle as a low apron, so the host's ground, cut on the
    // rectangle, always has soil under its edge and never a gap
    const ap = o.ground ? 0.6 : 0, apN = ap ? 3 : 0;
    const g = track(new THREE.PlaneGeometry(x1 - x0 + 2 * ap, z1 - z0 + 2 * ap, nx + 2 * apN, nz + 2 * apN));
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), mat = new Float32Array(p.count * 2), bp = L.pools[4];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), inset = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      const edge = Math.min(sstep(0, 0.8, Math.min(x - x0, x1 - x, z - z0)), sstep(0, 0.25, z1 - z));
      p.setY(i, ap > 0 && inset < 0 ? rim - 0.35 * sstep(0, ap, -inset) : mix(rim, heightAt(x, z), edge));
      let ao = 1;   // soil is shaded where a stone sits on it
      for (const r of rocks) { const dx = x - r.x, dz = z - r.z, d2 = dx * dx + dz * dz, R = r.rad; if (d2 < R * R * 2.6) ao = Math.min(ao, mix(0.5, 1, sstep(R * 0.75, R * 1.6, Math.sqrt(d2)))); }
      let grav = 0;
      for (const pl of L.pools) { const q = poolQ(pl, x, z); if (q < 1.25) grav = Math.max(grav, sstep(1.22, 1.02, q)); }
      if (z > bp.cz && z < 0.1 && Math.abs(x) < W * 0.45) grav = Math.max(grav, sstep(W * 0.45, W * 0.45 - 0.5, Math.abs(x)) * sstep(0.1, -0.05, z));
      const v = (0.82 + 0.36 * (fbm2(x * 0.8 + 11, z * 0.8 - 4) * 0.5 + 0.5)) * ao;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
      mat[i * 2] = grav; mat[i * 2 + 1] = 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; body.add(m);
  }

  // ---------- water
  const NOISE2 = `
  float hs(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), u.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return s; }
  `;
  const SKY_REF = `
  uniform vec3 uTop, uHor, uTree, uSunDir, uSunCol; uniform float uDisc;
  vec3 skyRef(vec3 r){ float h = r.y; vec3 c = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.6)); return mix(uTree, c, smoothstep(0.1, 0.42, h)); }
  `;
  const WATER_VS = `attribute vec2 aFlow; varying vec3 vW; varying vec3 vL; varying vec3 vVp; varying vec2 vFlow;
  void main(){ vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vVp = mv.xyz; vFlow = aFlow; gl_Position = projectionMatrix * mv; }`;
  const WATER_FS = `
  #include <packing>
  uniform sampler2D tRefr, tDepth, tNrm; uniform vec2 uRes; uniform float uNear, uFar, uTime, uGlowAmt, uCaust, uUnit;
  uniform mat4 uModel, uInv; uniform vec3 uAmb, uSunC, uGlow; uniform vec4 uLand[4]; uniform float uFlow;
  varying vec3 vW; varying vec3 vL; varying vec3 vVp; varying vec2 vFlow;
  ${NOISE2}${SKY_REF}
  float sceneZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
  float caust(vec2 uv, float t){
    vec2 p = mod(uv * 6.2832, 6.2832) - 250.0, i = p; float c = 1.0;
    for (int n = 0; n < 4; n++) { float tt = t * (1.0 - 3.5 / float(n + 1)); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005))); }
    c = 1.17 - pow(c / 4.0, 1.4); return pow(abs(c), 8.0);
  }
  void main(){
    vec2 suv = gl_FragCoord.xy / uRes;
    float zW = -vVp.z, rl = length(vVp);
    vec2 wuv = vL.xz, fl = vFlow * uTime;
    // where the falls land: churned water, drifting foam, extra ripple
    float boil = 0.0, drift = 0.0, turb = 0.0, glowN = 0.0;
    for (int i = 0; i < 4; i++) { vec4 Ld = uLand[i]; if (abs(vL.y - Ld.w) > 0.2) continue;
      float dx = abs(vL.x - Ld.x) / Ld.z, dz = vL.z - Ld.y, s = max(dz, 0.0);
      boil = max(boil, (1.0 - smoothstep(0.7, 1.25, dx)) * exp(-pow(dz / 0.36, 2.0)));
      float wx = 1.0 - smoothstep(0.9 + s * 0.25, 1.5 + s * 0.5, dx);
      drift = max(drift, wx * exp(-s / 1.25) * smoothstep(-0.1, 0.25, dz));
      turb = max(turb, wx * exp(-s / 2.0) * step(-0.6, dz));
      glowN = max(glowN, exp(-(dx * dx * 0.6 + dz * dz * 1.2))); }
    boil *= uFlow; drift *= uFlow; turb *= uFlow;
    vec3 a = texture2D(tNrm, wuv * 0.6 - fl * 0.14).xyz * 2.0 - 1.0;
    vec3 b = texture2D(tNrm, wuv * 1.5 + vec2(0.31, 0.17) - fl * 0.26).xyz * 2.0 - 1.0;
    vec3 c3 = texture2D(tNrm, wuv * 4.1 + vec2(0.7, 0.4) - fl * 0.5).xyz * 2.0 - 1.0;
    vec2 nxy = (a.xy * 0.45 + b.xy * 0.35 + c3.xy * (0.2 + 0.5 * turb)) * (0.5 + 1.3 * turb);
    vec3 N = normalize(mat3(uModel) * vec3(nxy.x, 1.0, nxy.y));
    vec3 ray = normalize(vW - cameraPosition);
  #ifdef REFRACT
    // look through the surface: bend the view, then read how deep the bed is there
    float z0 = sceneZ(suv), d0 = max(z0 - zW, 0.0) / uUnit;
    vec2 off = N.xz * 0.5 * min(d0, 0.6) / max(zW / uUnit, 0.5) * vec2(uRes.y / uRes.x, 1.0);
    vec2 ruv = suv + off; float zS = sceneZ(ruv);
    if (zS < zW) { ruv = suv; zS = z0; }
    vec3 bed = texture2D(tRefr, ruv).rgb;
    float path = max(zS - zW, 0.0) * rl / zW / uUnit;
    vec3 bedL = (uInv * vec4(cameraPosition + ray * (rl * zS / zW), 1.0)).xyz;
    float vd = max(vL.y - bedL.y, 0.0);
    bed *= 1.0 + caust(bedL.xz * 0.55 + nxy * 0.2, uTime * 0.7) * uCaust * smoothstep(0.0, 0.08, vd) * exp(-vd * 0.9);
    vec3 T = exp(-vec3(0.20, 0.13, 0.30) * (path + vd) * 0.7);   // clear water over stone: a faint warm-green cast with depth
    vec3 refr = bed * T + vec3(0.10, 0.13, 0.07) * (uAmb + uSunC * 2.0) * (1.0 - T);
    float edgeA = smoothstep(0.0, 0.012, path + 0.004);
  #else
    // no copy of the scene to read: draw the water as a dark, see-through film
    float path = 1.0;
    vec3 refr = vec3(0.05, 0.062, 0.045) * (uAmb + uSunC * 2.0);
    float edgeA = 0.6;
  #endif
    refr += uGlow * uGlowAmt * glowN * 0.3;
    vec3 V = -ray; float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    vec3 R = reflect(ray, N); R.y = abs(R.y);
    vec3 col = mix(refr, skyRef(R), F);
    float sdot = max(dot(R, normalize(uSunDir)), 0.0);
    col += uSunCol * (pow(sdot, 900.0) * 14.0 + pow(sdot, 60.0) * 0.3) * uDisc;
    // foam only where the water is disturbed: a white boil under each fall, soft clumps drifting downstream, thin edges where current meets stone
    vec2 fperp = vec2(-vFlow.y, vFlow.x);
    vec2 fuv = vec2(dot(wuv, fperp) * 5.5, dot(wuv, vFlow) * 2.4 - uTime * 1.3);
    fuv += 0.6 * vec2(fb(wuv * 1.9 + 3.0), fb(wuv * 1.9 + 11.0));
    float clump = fb(fuv), bub = vn(fuv * 7.0 + 2.0);
    float cover = drift * (0.55 + 0.6 * fb(wuv * 1.3 - vFlow * uTime * 0.5));
    float thr = 0.95 - cover * 0.95;
    float driftFoam = smoothstep(thr, thr + 0.14, clump) * (0.55 + 0.45 * bub) * smoothstep(0.02, 0.15, cover);
    float boilFoam = smoothstep(0.25, 0.7, boil * (0.6 + 0.8 * fb(wuv * 6.0 + vec2(0.0, -uTime * 2.0))));
    float contact = (1.0 - smoothstep(0.0, 0.07, path)) * turb * smoothstep(0.4, 0.62, vn(wuv * 9.0 + uTime * 0.7));
    float foam = clamp(max(boilFoam, driftFoam * 0.9) + contact * 0.6, 0.0, 1.0);
    vec3 foamCol = (uAmb * 1.0 + uSunC * 1.6) * 0.92 + uGlow * uGlowAmt * glowN * 0.9;
    col = mix(col, foamCol, foam);
  #ifdef REFRACT
    gl_FragColor = vec4(max(col, vec3(0.0)), edgeA);
  #else
    gl_FragColor = vec4(max(col, vec3(0.0)), clamp(max(edgeA, max(F, foam)), 0.0, 1.0));
  #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
  const FALL_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const FALL_FS = `
  uniform sampler2D tRefr; uniform vec2 uRes; uniform float uTime, uW, uLen, uFlat, uSeed, uBreak, uTf, uGlowAmt; uniform vec3 uAmb, uSunC, uGlow;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  ${NOISE2}${SKY_REF}
  void main(){
    vec2 suv = gl_FragCoord.xy / uRes;
    float yy = clamp(vUv.y, 0.0, 1.0), x = vUv.x * uW + uSeed * 7.3;
    float fall = smoothstep(uFlat * 0.7, uFlat + 0.12, yy);
    // time since this bit of water left the lip: the pattern rides down at the real speed of falling water
    float tau = sqrt(clamp((yy - uFlat) / (1.0 - uFlat), 0.0, 1.0));
    float fl = (yy < uFlat ? (yy - uFlat) * uLen * 0.5 : tau * uTf) - uTime;
    float prof = pow(max(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159), 0.0), 0.5);
    float strands = fb(vec2(x * 4.5, fl * 2.2)), fine = vn(vec2(x * 26.0, fl * 9.0)), streak = fb(vec2(x * 11.0, fl * 5.0));
    // whole at the lip, opening into strands lower down
    float ex = min(vUv.x, 1.0 - vUv.x) * uW;
    float slit = smoothstep(0.36, 0.27, fb(vec2(x * 13.0, fl * 0.9))) * tau * uBreak;
    float thick = smoothstep(0.0, 0.07 + 0.1 * tau, ex + (vn(vec2(x * 30.0, fl * 6.0)) - 0.5) * 0.08) * (0.55 + 0.45 * prof) - slit * 1.1 + (strands - 0.5) * 0.25 * tau;
    float cover = smoothstep(0.12, 0.3, thick);
    // a thin sheet stays glassy; air gets in at the thin edges and near the plunge
    float thin = 1.0 - smoothstep(0.25, 0.7, thick);
    float white = clamp(thin * 0.6 * fall + smoothstep(0.72, 1.0, tau) * (0.15 + 0.85 * streak) + pow(streak, 3.0) * 0.45 * fall, 0.0, 1.0);
    vec3 V = normalize(vV), n = normalize(vN); n *= sign(dot(n, V) + 1e-5);
    vec3 n2 = normalize(n + vec3((fine - 0.5) * 1.1 + (strands - 0.5) * 0.7, 0.0, 0.0) * fall);
    float ndv = clamp(dot(n2, V), 0.0, 1.0);
  #ifdef REFRACT
    vec3 refr = texture2D(tRefr, suv + (n2.xy - n.xy) * 0.02).rgb * vec3(0.88, 0.94, 0.92);
    float thinA = 0.9;
  #else
    vec3 refr = (uAmb * 0.22 + uSunC * 0.2) * vec3(0.5, 0.6, 0.6);
    float thinA = 0.42;
  #endif
    float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    vec3 R = reflect(-V, n2);
    vec3 glassy = mix(refr, skyRef(vec3(R.x, abs(R.y), R.z)), clamp(F + 0.1 * fall, 0.0, 1.0));
    glassy += uSunCol * pow(max(dot(R, normalize(uSunDir)), 0.0), 200.0) * 3.0 * uDisc;
    glassy += (uAmb * 0.5 + uSunC * 0.5) * pow(vn(vec2(x * 46.0, fl * 3.0)), 5.0) * 0.9 * fall;   // fine bright threads
    vec3 whitec = (uAmb * 0.5 + uSunC * 0.6) * (0.75 + 0.35 * streak) + uGlow * uGlowAmt * (0.05 + 0.6 * pow(yy, 2.2));
    whitec += uSunCol * 0.2 * pow(max(dot(-V, normalize(uSunDir)), 0.0), 4.0) * uDisc;
    vec3 col = mix(glassy, whitec, smoothstep(0.15, 0.85, white));
    gl_FragColor = vec4(max(col, vec3(0.0)), clamp(cover * mix(thinA, 1.0, white), 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
  const SPRAY_VS = `attribute vec3 aVel; attribute vec4 aLife; uniform float uTime, uScale; varying float vA; varying float vK;
  float h1(float n){ return fract(sin(n) * 43758.5453); }
  void main(){
    float cyc = uTime / aLife.x + aLife.y, k = fract(cyc), id = floor(cyc), t = k * aLife.x;
    float j = 0.65 + 0.7 * h1(id * 1.37 + aLife.y * 91.0);
    float g = mix(-14.0, 0.25, aLife.w);
    vec3 p = position + vec3((h1(id + aLife.y * 17.0) - 0.5) * 0.25 * (1.0 - aLife.w), 0.0, 0.0) + aVel * j * t + vec3(0.0, 0.5 * g * t * t, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife.z * (1.0 + aLife.w * k * 1.5) * uScale / max(0.1, -mv.z);
    vA = (1.0 - k) * smoothstep(0.0, 0.12, k) * mix(1.0, 0.1, aLife.w); vK = aLife.w;
  }`;
  const SPRAY_FS = `uniform vec3 uAmb, uSunC, uGlow; uniform float uGlowAmt; varying float vA; varying float vK;
  void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, mix(0.15, 0.0, vK), d) * vA; if (a < 0.003) discard;
    gl_FragColor = vec4(uAmb * 1.1 + uSunC * 0.5 + uGlow * uGlowAmt * 1.2, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
  const skyRefU = () => ({ uTop: skyU.uTop, uHor: skyU.uHor, uTree: WU.uTree, uSunDir: skyU.uSunDir, uSunCol: skyU.uSunCol, uDisc: skyU.uDisc });
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { ...skyRefU(), tRefr: WU.tRefr, tDepth: WU.tDepth, tNrm: WU.tNrm, uRes: WU.uRes, uNear: WU.uNear, uFar: WU.uFar, uCaust: WU.uCaust, uLand: WU.uLand, uModel: WU.uModel, uInv: WU.uInv, uFlow: WU.uFlow, uUnit: WI.uUnit, uTime: U.time, uAmb: U.amb, uSunC: U.sunC, uGlow: U.glow, uGlowAmt: U.glowAmt },
    defines: { ...DEF }, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  function buildWater() {
    const { pools, falls } = L;
    pools.forEach((p, pi) => {
      // the current runs from where the fall above lands to the lip below
      let fxv = 0, fzv = 1;
      if (pi === 0) { fxv = falls[0].x - p.cx; fzv = falls[0].z - p.cz; }
      else if (pi < 4) { fxv = falls[pi].x - falls[pi - 1].x; fzv = falls[pi].z - falls[pi - 1].land; }
      const fl = Math.hypot(fxv, fzv) || 1; fxv /= fl; fzv /= fl;
      const rings = 8, segs = 64, P = [p.cx, p.wl, p.cz], F = [fxv, fzv], I = [], sx = p.basin ? 1.22 : 1.16, sz = p.basin ? 1.3 : 1.1;
      for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) {
        const a = s / segs * 6.283185, w = poolWob(p, a), k = r / rings;
        P.push(p.cx + Math.cos(a) * p.rx * sx * w * k, p.wl, p.cz + Math.sin(a) * p.rz * sz * w * k); F.push(fxv, fzv);
      }
      for (let s = 0; s < segs; s++) I.push(0, 1 + (s + 1) % segs, 1 + s);
      for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) { const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + (s + 1) % segs, c = a + segs, d = b + segs; I.push(a, b, c, b, d, c); }
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(F, 2)); g.setIndex(I);
      const m = new THREE.Mesh(g, waterMat); m.renderOrder = 1; fx.add(m);
    });
  }
  // one ribbon of falling water: it slides over the lip stone, then drops in a free arc
  function sheetGeo(rb) {
    const nu = 10, nv = 28, flatN = 6, tEnd = Math.sqrt(2 * (rb.top - rb.bot + 0.02) / G), pts = [];
    for (let j = 0; j <= nv; j++) {
      if (j <= flatN) { const t = j / flatN; pts.push([rb.top + 0.012 - 0.03 * t * t, rb.lip - 0.35 + 0.35 * t]); }
      else { const t = (j - flatN) / (nv - flatN) * tEnd; pts.push([rb.top - 0.018 - 0.5 * G * t * t, rb.lip + rb.v0 * t]); }
    }
    const acc = [0]; for (let j = 1; j <= nv; j++) acc.push(acc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    const total = acc[nv], P = [], UV = [], I = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, spread = 1 - 0.08 * acc[j] / total, wob = 0;
      P.push(rb.x + wob + (u - 0.5) * rb.w * spread, pts[j][0], pts[j][1] + 0.04 * Math.cos((u - 0.5) * Math.PI) * Math.min(1, j / flatN));
      UV.push(u, acc[j] / total);
      if (i < nu && j < nv) { const a = j * (nu + 1) + i; I.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    return { g, len: total, flat: acc[flatN] / total, land: rb.lip + rb.v0 * tEnd, tf: tEnd };
  }
  function buildFalls() {
    const spray = { P: [], V: [], A: [] };
    for (const rb of ribbons) {
      const { g, len, flat, land, tf } = sheetGeo(rb); track(g);
      const mat = track(new THREE.ShaderMaterial({
        uniforms: { ...skyRefU(), tRefr: WU.tRefr, uRes: WU.uRes, uTime: U.time, uAmb: U.amb, uSunC: U.sunC, uGlow: U.glow, uGlowAmt: U.glowAmt, uW: { value: rb.w }, uLen: { value: len }, uFlat: { value: flat }, uSeed: { value: rb.seed }, uBreak: { value: rb.brk }, uTf: { value: tf } },
        defines: { ...DEF }, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      const m = new THREE.Mesh(g, mat); m.renderOrder = 2; fx.add(m); flowObjs.push(m);
      const n = Math.round(30 + rb.w * 70);
      for (let i = 0; i < n; i++) {
        const mist = i > n * 0.85;
        spray.P.push(rb.x + (rnd() - 0.5) * rb.w * 0.9, rb.bot + 0.02, land + R2(-0.08, 0.12));
        spray.V.push(R2(-0.5, 0.5), mist ? R2(0.3, 0.8) : R2(1.2, 3.2), mist ? R2(0.1, 0.4) : R2(0.2, 1.5));
        spray.A.push(mist ? R2(1.0, 2.0) : R2(0.25, 0.6), rnd(), mist ? R2(0.2, 0.4) : R2(0.014, 0.035), mist ? 1 : 0);
      }
    }
    const sg = track(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute(spray.P, 3));
    sg.setAttribute('aVel', new THREE.Float32BufferAttribute(spray.V, 3));
    sg.setAttribute('aLife', new THREE.Float32BufferAttribute(spray.A, 4));
    const sm = track(new THREE.ShaderMaterial({ uniforms: { uTime: U.time, uScale: U.pscale, uAmb: U.amb, uSunC: U.sunC, uGlow: U.glow, uGlowAmt: U.glowAmt }, vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS, transparent: true, depthWrite: false }));
    const pts = new THREE.Points(sg, sm); pts.frustumCulled = false; pts.renderOrder = 3; fx.add(pts); flowObjs.push(pts);
  }

  // ---------- stream cobbles: the bed, the beach at the patio, and the small stones that gather at the foot of bank rocks
  function buildCobbles() {
    const items = [], inside = (x, z, k) => !free(x, z, 0, k), bp = L.pools[4];
    for (const p of L.pools) {
      const want = Math.round(Math.PI * p.rx * p.rz * (p.basin ? 30 : 34)); let got = 0;
      for (let i = 0; i < want * 2 && got < want; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 1.14, x = p.cx + Math.cos(a) * p.rx * r, z = p.cz + Math.sin(a) * p.rz * r;
        if (inside(x, z, 0.8)) continue;
        items.push({ x, z, s: Math.pow(rnd(), 1.7) * 0.17 + 0.06, bed: 1 }); got++;
      }
    }
    for (let i = 0; i < 1500; i++) {
      const x = R2(-W * 0.44, W * 0.44), z = R2(bp.cz + bp.rz * 0.4, 0.0);
      if (poolQ(bp, x, z) < 1.0 || inside(x, z, 0.85) || Math.abs(x) > W * 0.44 - 0.5 * Math.max(0, z + 0.5)) continue;
      items.push({ x, z, s: Math.pow(rnd(), 1.4) * 0.1 + 0.04 });
    }
    for (const r of rocks) {
      if (r.wake) for (let k = 0; k < 9; k++) { const x = r.x + R2(-0.5, 0.5) * r.rad, z = r.z + r.rad * R2(0.9, 1.7); if (!inside(x, z, 0.9)) items.push({ x, z, s: R2(0.035, 0.07) }); }
      if (!r.berm) continue;
      const n = 2 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) { const a = rnd() * 6.283, d = r.rad * R2(0.95, 1.3), x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d; if (!inside(x, z, 0.9)) items.push({ x, z, s: R2(0.04, 0.11) }); }
    }
    const PAL = [[0.62, 0.52, 0.4], [0.6, 0.54, 0.46], [0.52, 0.5, 0.47], [0.4, 0.33, 0.27], [0.56, 0.42, 0.3], [0.7, 0.66, 0.58], [0.3, 0.29, 0.28], [0.47, 0.41, 0.34], [0.56, 0.49, 0.4], [0.44, 0.43, 0.41], [0.63, 0.47, 0.32]];
    const hi = items.filter(it => it.s >= 0.14), lo = items.filter(it => it.s < 0.14);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const [list, geos] of [[hi, COBBLE_HI], [lo, COBBLE_LO]]) {
      const meshes = geos.map(g => track(new THREE.InstancedMesh(g, pebbleMat, Math.ceil(list.length / geos.length) + 1))), counts = geos.map(() => 0);
      list.forEach((it, i) => {
        const k = i % geos.length, mesh = meshes[k];
        if (it.bed) e.set(-R2(0.2, 0.6), R2(-0.45, 0.45), (rnd() - 0.5) * 0.3, 'YXZ'); else e.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5, 'XYZ');
        q.setFromEuler(e);
        pos.set(it.x, heightAt(it.x, it.z) + it.s * 0.14, it.z); sc.set(it.s * R2(1.05, 1.45), it.s, it.s * R2(0.75, 1.0));
        mesh.setMatrixAt(counts[k], m4.compose(pos, q, sc));
        const c = PAL[Math.floor(rnd() * PAL.length)], j = R2(0.85, 1.15);
        { const gr = (c[0] + c[1] + c[2]) / 3, sat = 0.75, d = 0.88; mesh.setColorAt(counts[k], col.setRGB(lin(mix(gr, c[0], sat) * j * d), lin(mix(gr, c[1], sat) * j * d), lin(mix(gr, c[2], sat) * j * d))); }
        counts[k]++;
      });
      meshes.forEach((m, k) => { m.count = counts[k]; m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); body.add(m); });
    }
  }

  // ---------- plants
  function buildPlants() {
    plantSpots = [];
    const placed = [];
    const ok = (x, z, r, rockK = 0.78) => {
      if (z > -0.25) return false;
      { const bp = L.pools[4]; if (z > bp.cz - bp.rz * 0.2 && Math.abs(x) < W * 0.4) return false; }
      for (const p of L.pools) if (poolQ(p, x, z) < 1.12) return false;
      if (inFall(x, z, 0.3)) return false;
      for (const rk of rocks) { const dx = x - rk.x, dz = z - rk.z, m = rk.rad * rockK + r * 0.25; if (dx * dx + dz * dz < m * m) return false; }
      for (const p of placed) { const dx = x - p.x, dz = z - p.z, m = (p.r + r) * 0.62; if (dx * dx + dz * dz < m * m) return false; }
      return true;
    };
    const fz = L.fenceZ, bed = (x, z) => bedness(x, z) > 0.6, D = L.D;
    const specs = !o.plants ? [] : [
      { t: 'vgrass', n: 9, size: [2.2, 3.1], rf: 0.42, x: [-W * 0.6, W * 0.6], z: [-D, -0.5], zone: (x, z, d) => bed(x, z) && d > 1.7 && d < 4.6 },
      { t: 'lavender', n: 12, size: [1.5, 2.2], rf: 0.5, x: [-W * 0.72, W * 0.72], z: [-D - 1, -0.3], zone: (x, z, d) => bed(x, z) && d > 2.2 },
      { t: 'catmint', n: 14, size: [1.4, 2.2], rf: 0.5, x: [-W * 0.7, W * 0.7], z: [-D - 0.5, -0.3], zone: (x, z, d) => bed(x, z) && d > 1.3 && d < 5.2 },
      { t: 'grass', n: 34, size: [1.4, 2.2], rf: 0.45, x: [-W * 0.75, W * 0.75], z: [-D - 1.5, -0.3], zone: (x, z, d) => bed(x, z) && d > 1.4 },
      { t: 'pink', n: 6, size: [1.2, 1.8], rf: 0.5, x: [-W * 0.7, W * 0.7], z: [-D, -0.3], zone: (x, z, d) => bed(x, z) && d > 2.0 },
      { t: 'white', n: 5, size: [1.1, 1.6], rf: 0.5, x: [-W * 0.7, W * 0.7], z: [-D, -0.3], zone: (x, z, d) => bed(x, z) && d > 2.0 },
      { t: 'box', n: 6, size: [1.2, 1.9], rf: 0.5, x: [-W * 0.7, W * 0.7], z: [-D - 2, -D * 0.45], zone: (x, z, d) => bed(x, z) && d > 2.2 },
      { t: 'fern', n: 30, size: [0.9, 1.4], rf: 0.5, x: [-5.5, 5.5], z: [-D - 0.5, -0.3], zone: (x, z, d) => d > 0.9 && d < 3.6 },
      { t: 'hosta', n: 10, size: [0.9, 1.3], rf: 0.5, x: [-6, 6], z: [-D - 0.5, -0.3], zone: (x, z, d) => d > 1.0 && d < 4.2 },
      { t: 'box', n: 34, size: [0.6, 1.0], rf: 0.5, x: [-W * 0.7, W * 0.7], z: [-D - 1.5, -0.3], zone: (x, z, d) => bed(x, z) && d > 1.2 },
    ];
    const groups = new Map();
    const put = (t, x, z, size, extra) => {
      const v = Math.floor(rnd() * PLANTS[t].length), key = t + v;
      if (!groups.has(key)) groups.set(key, { t, v, list: [] });
      const item = { x, z, size, y: heightAt(x, z) - 0.03, ...extra };
      groups.get(key).list.push(item); plantSpots.push({ t, ...item });
    };
    for (const sp of specs) {
      let n = 0;
      for (let t = 0; t < sp.n * 40 && n < sp.n; t++) {
        const x = R2(...sp.x), z = R2(...sp.z), d = distPath(x, z);
        if (!sp.zone(x, z, d)) continue;
        const size = R2(...sp.size), r = size * sp.rf;
        if (!ok(x, z, r)) continue;
        placed.push({ x, z, r }); put(sp.t, x, z, size, sp.t === 'cypress' ? { tall: R2(6, 8.5) } : null); n++;
      }
    }
    // moss cushions tucked into the seams where damp stone meets soil
    for (const r of o.moss ? rocks : []) {
      if (r.kind === 's' || distPath(r.x, r.z) > 3.6) continue;
      const n = Math.floor(rnd() * 2.6);
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.283, x = r.x + Math.cos(a) * r.rad * 0.98, z = r.z + Math.sin(a) * r.rad * 0.98, size = R2(0.35, 0.75);
        if (heightAt(x, z) < r.y - r.sy * 0.2) continue;   // the seam is under water or far below the stone there
        if (ok(x, z, size * 0.4, 0.86)) { placed.push({ x, z, r: size * 0.3 }); put('moss', x, z, size); }
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    for (const { t, v, list } of groups.values()) {
      const mesh = track(new THREE.InstancedMesh(PLANTS[t][v], MATS[t], list.length));
      list.forEach((it, i) => {
        q.setFromAxisAngle(Y, rnd() * 6.283); pos.set(it.x, it.y, it.z);
        if (t === 'grass' || t === 'vgrass' || t === 'fern' || t === 'hosta') sc.set(it.size * R2(0.9, 1.2), it.size, it.size * R2(0.9, 1.2));
        else if (t === 'cypress') sc.set(it.size / 2, it.tall / 1.05, it.size / 2);
        else { const s = it.size / 2; sc.set(s * R2(0.9, 1.1), s * R2(0.85, 1.05), s * R2(0.9, 1.1)); }
        mesh.setMatrixAt(i, m4.compose(pos, q, sc));
        const j = R2(0.85, 1.1); mesh.setColorAt(i, col.setRGB(j, j, j * R2(0.92, 1.05)));
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); body.add(mesh);
    }
  }

  // ---------- lights under the falls
  let nightLights = [];
  function buildNightLights() {
    nightLights = L.falls.map(f => ({ position: new THREE.Vector3(f.x, f.bot + 0.2, f.land + 0.38), color: 0xffa955, intensity: 3.4, distance: 5.5 }));
    if (o.lights === 'three') for (const n of nightLights) { const pl = new THREE.PointLight(n.color, 0, n.distance, 2); pl.position.copy(n.position); body.add(pl); fallLights.push(pl); }
  }

  const api = { group, body, water: fx, options: o, layout: null, nightLights: [], size: null, soil: null, soilHeight, canPlant, setEnvironment, setRefraction, setFlowing, setGround, update, rebuild, dispose };
  // ---------- meeting the host's ground
  let builtSink = 0.3;
  function groundSink() { return o.ground ? (o.ground.sink ?? 0.03) : 0.3; }
  function applyGround() {
    const g = o.ground, on = !!(g && g.color !== undefined && g.color !== null);
    GU.uEdgeAmt.value = on ? 1 : 0;
    if (on) GU.uEdgeCol.value.set(g.color);
    GU.uEdgeRough.value = g?.roughness ?? 0.95;
    GU.uEdgeW.value = Math.max(0.2, g?.width ?? 2.5);
    GU.uEdgeTex.value = clamp(g?.texture ?? 1, 0, 1);
    GU.uEdgeChip.value = on && g.chipSize > 0 ? g.chipSize : 0;
    GU.uEdgeSpec.value = on ? Math.max(0, g.specular ?? 1) : 1;
    const t = on ? clamp(g.tint ?? 0, 0, 1) : 0, c = GU.uEdgeCol.value;
    GU.uTintK.value.set(mix(1, clamp(c.r / mulchMean[0], 0.2, 5), t), mix(1, clamp(c.g / mulchMean[1], 0.2, 5), t), mix(1, clamp(c.b / mulchMean[2], 0.2, 5), t));
  }
  /**
   * Blend the edge of the feature's soil into the host's ground, so no line shows where the two meet. Pass null to switch it off.
   *   color : the host ground's average colour, unlit (THREE.Color in linear space, or a hex number / CSS string)
   *   roughness : the host ground's roughness, default 0.95        width : how far in the blend reaches, feet, default 2.5
   *   specular : the host ground's specular intensity (the specularIntensity of a MeshPhysicalMaterial, for example 0.45),
   *             default 1, which is a standard material's full sheen. The soil's sheen fades toward it across the band.
   *   texture : 0..1, how much of the bark chip pattern and relief stays in the faded band, default 1. The pattern averages 1,
   *             so the band averages the colour given. 0 fades to that colour flat, with no chips.
   *   chipSize : spacing of the host's own bark chips, feet (for example 0.096). When given, the host side of the fade is drawn
   *             as round chips that far apart, dissolving into this feature's shards. Left out, the band uses this feature's chips.
   *   tint : 0..1, how far the whole mound's bark is shifted toward that colour (0 keeps the feature's own bark), default 0.
   *          With options.mulch it works from that cover's average colour, not from the feature's own bark.
   *   sink : how far below the host's ground level the border of the soil sits, feet, default 0.03 (it is 0.3 with no ground set)
   * The first quarter of the width stays fully that colour, then it fades into the feature's own bark.
   * Colour, roughness, specular, width, texture, chipSize and tint apply at once. A changed sink, or switching the blend on or off, rebuilds the feature.
   */
  function setGround(g) {
    o.ground = g ? { ...(o.ground || {}), ...g } : null;
    applyGround();
    if (L && groundSink() !== builtSink) rebuild();
    return api;
  }
  /** Soil height in feet above the feature origin at a feature-local point (x, z in feet). Use it to stand plan plants on the mound. */
  function soilHeight(x, z) { return heightAt(x, z) + o.lift; }
  /** True when a plant of this radius (feet) can stand at a feature-local point: not in water, under a fall, on the cobble beach or inside a rock. */
  function canPlant(x, z, r = 0.5) {
    for (const p of L.pools) if (poolQ(p, x, z) < 1.12) return false;
    if (inFall(x, z, 0.3)) return false;
    const bp = L.pools[4]; if (z > bp.cz - bp.rz * 0.2 && z < 0.4 && Math.abs(x) < W * 0.4) return false;
    for (const rk of rocks) { const dx = x - rk.x, dz = z - rk.z, m = rk.rad * 0.78 + r * 0.25; if (dx * dx + dz * dz < m * m) return false; }
    return true;
  }
  /** Build, or build again with changed options (width, height, lowest, level, backSlope, lift, seed, plants, moss, unit). */
  function rebuild(next) {
    if (next) Object.assign(o, next);
    W = o.width;
    L = makeLayout(o.height, o.lowest, o.level, o.topFall);
    clearWorld();
    rnd = mulberry32(o.seed);
    rocks = []; bermRocks = [];
    applyGround();
    placeRocks(); publishLayout(); buildTerrain(); buildRockMeshes(); buildWater(); buildFalls(); buildCobbles(); buildPlants(); buildNightLights();
    group.scale.setScalar(o.unit); body.position.y = o.lift;
    api.layout = L; api.nightLights = nightLights; api.soil = soil;
    api.size = { width: W, depth: L.D, height: L.H + o.lift };
    setFlowing(flowing);
    update(U.time.value);
    return api;
  }
  /**
   * Tell the feature about the light. Colours are THREE.Color in linear space. Any subset may be passed.
   *   skyTop, skyHorizon : sky colours the water mirrors      treeline : what low reflections show (dark foliage)
   *   sunDir (Vector3 toward the sun, world space), sunColor, sunIntensity, sunVisible (0..1: 0 hides the glint)
   *   ambient : sky light falling on the white water, colour times strength
   *   glowColor : colour of the lights under the falls         backlight : extra glow through leaves when facing a low sun
   */
  function setEnvironment(e = {}) {
    if (e.skyTop) skyU.uTop.value.copy(e.skyTop);
    if (e.skyHorizon) skyU.uHor.value.copy(e.skyHorizon);
    if (e.treeline) WU.uTree.value.copy(e.treeline);
    if (e.sunDir) skyU.uSunDir.value.copy(e.sunDir).normalize();
    if (e.sunColor) skyU.uSunCol.value.copy(e.sunColor);
    if (e.sunColor || e.sunIntensity !== undefined) U.sunC.value.copy(skyU.uSunCol.value).multiplyScalar((e.sunIntensity ?? 2.5) * 0.22);
    if (e.sunVisible !== undefined) { skyU.uDisc.value = e.sunVisible; WU.uCaust.value = 0.12 + 0.45 * clamp((e.sunIntensity ?? 2.5) / 2.5, 0, 1) * e.sunVisible; }
    if (e.ambient) U.amb.value.copy(e.ambient);
    if (e.glowColor) U.glow.value.copy(e.glowColor);
    if (e.backlight) U.trans.value.copy(e.backlight);
    return api;
  }
  /**
   * Hand over the copy of the scene the water looks through (only used when options.refraction is true).
   *   color, depth : the textures of a render target that holds the scene WITHOUT wf.water
   *   width, height : size in pixels of the buffer the water itself is drawn into (gl_FragCoord range)
   *   near, far : the camera planes used for that copy
   */
  function setRefraction(r) {
    WU.tRefr.value = r.color; WU.tDepth.value = r.depth; WU.uRes.value.set(r.width, r.height);
    WU.uNear.value = r.near; WU.uFar.value = r.far;
    return api;
  }
  /**
   * Pump on or off. Off: the falling sheets and their spray are hidden and the pools go still (no churn or foam under
   * the falls); the pools keep their water, as they do when a real pump is switched off. Kept across rebuild().
   */
  let flowing = true;
  function setFlowing(on) {
    flowing = !!on; WU.uFlow.value = flowing ? 1 : 0;
    for (const m of flowObjs) m.visible = flowing;
    return api;
  }
  const _s = new THREE.Vector3();
  /**
   * Call every frame, after the group has been placed.
   *   time : seconds, drives the water
   *   lightLevel : 0..1, how strongly the under-fall lights show (0 by day, 1 at night)
   *   pointScale : drawing-buffer height in pixels * 0.5 * camera.projectionMatrix.elements[5]  (sizes the spray)
   */
  function update(time, f = {}) {
    U.time.value = time;
    body.updateWorldMatrix(true, false);
    WU.uModel.value.copy(body.matrixWorld); WU.uInv.value.copy(body.matrixWorld).invert();
    const unit = _s.setFromMatrixScale(body.matrixWorld).x || 1; WI.uUnit.value = unit;
    if (f.lightLevel !== undefined) { U.glowAmt.value = f.lightLevel * 1.5; for (const l of fallLights) { l.intensity = f.lightLevel * 3.4 * unit * unit; l.distance = 5.5 * unit; } }
    if (f.pointScale !== undefined) U.pscale.value = f.pointScale * unit;
    return api;
  }
  function dispose() {
    clearWorld();
    for (const m of [rockMat, pebbleMat, groundMat, waterMat, grassMat, leafyMat, shrubMat]) m.dispose();
    group.removeFromParent();
  }
  return rebuild();
}
