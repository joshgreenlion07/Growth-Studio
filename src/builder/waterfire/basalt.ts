import * as THREE from 'three';
import { rng } from '../../siteplan/geometry';
import type { Vec2 } from '../../siteplan/types';
import { BASALT_NF81 } from '../../siteplan/waterfire';
import { fbm, smooth, vnoise, voronoi } from '../../engine/noise';
import { hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from '../../engine/textures';
import { GLOBAL } from '../../engine/foliage';
import { pbrMaterial, plainMaterial } from '../materials';
import { clearFallMaterial, splashMaterial } from '../pillarfountain';
import { domeGeometry, filmGeometry, filmMaterial } from '../urnfountain';
import { fbm3, noise3 } from '../stonegeo';
import { IN, uprightAlbedo, type WaterFireContext } from './kit';

/*
 * Stone Forest Flat-Topped Natural Basalt Fountain NF81-FLT (stoneforest.com; drawing "Basalt Natural Fountain w Flat
 * Top", 2019): a section of a natural basalt column, about 24-28 in across and 15 in tall (BASALT_NF81). Columnar
 * basalt is "predominantly hexagonal in cross-section" (Stone Forest's basalt page), so the stone is an irregular
 * hexagon whose six faces bulge a little and whose edges are weathered round, as in the maker's two photos; each
 * placement is its own stone (seeded by its id), 24 to 27 in across its flats and corners. The sides keep the column's
 * natural crust: ochre and rust brown with darker brown to near-black patches, mottled and pitted, a few paler spalled
 * flakes and the thin white inclusion lines Stone Forest notes; each face weathered to its own tone. The top is sawn
 * flat and polished near black, with a narrow polished arris round it.
 *
 * Water: a pump in the basin feeds the core-drilled hole in the middle of the top. It wells up in a short, frothy crown,
 * spreads over the whole polished top in a thin sheet rippling outward (the maker's photos), runs over the arris and down
 * every face and slips into the pebbles without foam, as in the photos. The basin is Stone Forest's 44 in square
 * Fountain Installation Kit under black Mexican beach pebble (`bed` option; off when the plan has a pebble bed there).
 * Local space: y up from grade, the stone stands on the basin's grate an inch below the pebbles' top.
 */

const S = BASALT_NF81;

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

/*
 * The crust's tones, read from Stone Forest's photos of NF81-FLT (sRGB): sunlit ochre, mid brown, dark brown and the
 * near-black patches, a rust stain. The photos are warm (late sun off an orange stucco wall), so the average is set a
 * little cooler than the photos' mean (89, 64, 32), toward the design book's render: the albedo is the wall
 * calibration of (92, 72, 48).
 */
const OCHRE = hexRGB('#7a5a33'), BROWN = hexRGB('#5a4430'), DARK = hexRGB('#382e25'), BLACK = hexRGB('#25211d'), RUST = hexRGB('#82543a');
const CRUST_MEAN = uprightAlbedo([92, 72, 48]);
/** Polished basalt: near black (Stone Forest: polished faces "polish to a deep black"). */
const POLISH_MEAN: RGB = [0.021, 0.021, 0.022];

function crustSet(): PBRSet {
  return textureSet('wf-basalt-crust', () =>
    paint(1024, 1.0, 2.4, (u, v) => {
      // The colors run in long patches down the faces (the noise stretched along v, which is up the stone), as weathering
      // stains a column: ochre, mid brown, dark brown to near black, a rust stain here and there.
      const patch = fbm(u, v * 0.6, 5, 4, 501), patch2 = fbm(u + 0.37, v * 0.5 + 0.11, 7, 4, 503), stain = fbm(u, v * 0.7, 11, 3, 513);
      // Mottling of the crust at hand scale, faint streaks up the faces, pitting, and flakes where the skin has spalled
      // off to a paler, grayer stone under it.
      const mottle = fbm(u + 0.9, v + 0.2, 22, 3, 517);
      const streak = fbm(u, v * 0.3, 44, 3, 505);
      const fine = vnoise(u * 420, v * 420, 420, 507);
      const pit = voronoi(u, v, 170, 509);
      const flake = fbm(u + 0.5, v + 0.3, 12, 4, 519), flakeEdge = fbm(u, v, 40, 3, 523);
      let c: RGB = mixRGB(OCHRE, BROWN, smooth(0.3, 0.7, patch));
      c = mixRGB(c, DARK, smooth(0.55, 0.78, patch2) * 0.85);
      c = mixRGB(c, BLACK, smooth(0.72, 0.9, patch2) * 0.6);
      c = mixRGB(c, RUST, smooth(0.62, 0.86, stain) * 0.35);
      c = mulRGB(c, 0.84 + mottle * 0.32);
      c = mulRGB(c, 0.92 + streak * 0.16);
      const flaked = smooth(0.7, 0.74, flake + (flakeEdge - 0.5) * 0.08);
      c = mixRGB(c, [0.36, 0.33, 0.29], flaked * 0.45);
      // Pits of every size, in clusters (a cell's own size and the cluster noise), not an even dotting.
      const pr = 0.06 + pit.id * 0.12, cluster = smooth(0.45, 0.7, fbm(u + 2.2, v + 1.4, 8, 3, 521));
      const pitD = pit.id > 0.35 && pit.f1 < pr ? (1 - pit.f1 / pr) * cluster : 0;
      c = mulRGB(c, 1 - pitD * 0.4);
      // Thin white inclusion lines (non-structural, the maker notes them): rare and faint.
      const vein = Math.abs(fbm(u + 1.3, v * 0.6 + 0.4, 3, 3, 511) - 0.5);
      const line = (1 - smooth(0.0006, 0.0018, vein)) * smooth(0.55, 0.7, fbm(u, v, 2, 2, 515));
      if (line > 0) c = mixRGB(c, [0.6, 0.58, 0.54], line * 0.3);
      c = mulRGB(c, 0.95 + fine * 0.1);
      return { h: 0.5 + (mottle - 0.5) * 0.3 + (streak - 0.5) * 0.15 + (fine - 0.5) * 0.15 - pitD * 0.5 - flaked * 0.15, c, r: 0.74 + fine * 0.1 };
    }, CRUST_MEAN),
  );
}

function polishSet(): PBRSet {
  return textureSet('wf-basalt-polish', () =>
    paint(512, 0.8, 0.3, (u, v) => {
      const cloud = fbm(u, v, 4, 4, 521), fine = vnoise(u * 300, v * 300, 300, 523);
      let c: RGB = mixRGB([0.1, 0.1, 0.105], [0.17, 0.17, 0.175], smooth(0.3, 0.75, cloud));
      if (fine > 0.94) c = mixRGB(c, [0.42, 0.42, 0.4], smooth(0.94, 0.99, fine) * 0.6);
      const vein = Math.abs(fbm(u + 0.7, v + 2.1, 2, 3, 525) - 0.5);
      const line = (1 - smooth(0.0005, 0.0015, vein)) * smooth(0.5, 0.65, fbm(u, v, 2, 2, 527));
      if (line > 0) c = mixRGB(c, [0.5, 0.49, 0.47], line * 0.3);
      return { h: 0.5, c, r: 0.07 + fine * 0.03 };
    }, POLISH_MEAN),
  );
}

/**
 * The thin sheet of water over the polished top: rings spreading out from the bubbler (strongest near it), broken by
 * moving noise, catching the sky at a low angle (fresnel) and the sun in glints. Nearly clear: the polished stone's
 * own mirror of the sky shows through it.
 */
function sheetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vP; varying vec3 vV;
      void main(){
        vP = position.xz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor;
      varying vec2 vP; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = uTime, r = length(vP);
        float wob = n(vP * 60.0 + vec2(t * 0.7, -t * 0.5)) * 2.6;
        float ring = sin(r * 240.0 - t * 8.0 + wob) * 0.5 + 0.5;
        float ring2 = sin(r * 470.0 - t * 13.0 + wob * 1.7) * 0.5 + 0.5;
        float near = exp(-r * 6.0);
        float rip = mix(ring, ring2, 0.45) * (0.45 + 0.55 * near) + n(vP * 180.0 - vec2(t * 2.0)) * 0.25;
        vec3 V = normalize(vV);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        float glint = pow(max(0.0, rip - 0.62) * 2.6, 3.0);
        float a = clamp(0.035 + fres * 0.22 + glint * 0.3, 0.0, 0.55);
        float day = 0.22 + length(uSunColor) * 0.34;
        vec3 c = vec3(0.68, 0.76, 0.84) * day * (0.12 + fres * 0.5) + vec3(1.0) * day * glint * 0.55;
        gl_FragColor = vec4(c * a + vec3(1.0) * day * glint * 0.1, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/* ------------------------------------------------------------------ */
/* The stone                                                            */
/* ------------------------------------------------------------------ */

interface Ring {
  /** Points round the stone's base outline (inches, CCW in x, z), their outward normals and the length round to each. */
  p: Vec2[];
  n: Vec2[];
  s: number[];
  perimeter: number;
  /** Each point's tone (a multiplier on the crust): each face has its own, blending round the rounded corners. */
  tint: RGB[];
}

/*
 * Each face of a column weathers on its own: in Stone Forest's photos one face is mostly sunny ochre, the next dark
 * brown to near black, another mid brown. The faces' tones, as multipliers on the crust (averaging about 1).
 */
const FACE_TONES: RGB[] = [[1.32, 1.26, 1.12], [1.0, 0.98, 0.96], [0.52, 0.5, 0.48], [1.18, 1.12, 1.04], [0.74, 0.72, 0.7], [1.08, 1.05, 1.0]];

/**
 * The column's cross-section: six corners at roughly even turns and radii, filleted round (weathered edges, 2.4 in),
 * the faces bulging a little between them; resampled evenly and scaled so the stone is 27 in across at its widest.
 */
function columnOutline(seed: string, n = 168): Ring {
  const r = rng(`${seed}-basalt`);
  const rot = r() * Math.PI * 2;
  const corners: Vec2[] = [];
  for (let k = 0; k < 6; k++) {
    const a = rot + (k / 6) * Math.PI * 2 + (r() - 0.5) * 0.32;
    const rad = 14 * (0.93 + r() * 0.12);
    corners.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const rc = 2.4;
  const path: Vec2[] = [];
  // Which face each path point is on (k for face k; a corner's arc runs from the face before it to the one after).
  const fid: number[] = [];
  const norm = (v: Vec2): Vec2 => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };
  const fil = corners.map((c, k) => {
    const prev = corners[(k + 5) % 6], next = corners[(k + 1) % 6];
    const d1 = norm([prev[0] - c[0], prev[1] - c[1]]), d2 = norm([next[0] - c[0], next[1] - c[1]]);
    const half = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) / 2;
    const t = rc / Math.tan(half), bis = norm([d1[0] + d2[0], d1[1] + d2[1]]);
    const ctr: Vec2 = [c[0] + bis[0] * (rc / Math.sin(half)), c[1] + bis[1] * (rc / Math.sin(half))];
    return { t1: [c[0] + d1[0] * t, c[1] + d1[1] * t] as Vec2, t2: [c[0] + d2[0] * t, c[1] + d2[1] * t] as Vec2, ctr };
  });
  for (let k = 0; k < 6; k++) {
    const { t1, t2, ctr } = fil[k];
    let a0 = Math.atan2(t1[1] - ctr[1], t1[0] - ctr[0]), a1 = Math.atan2(t2[1] - ctr[1], t2[0] - ctr[0]);
    while (a1 < a0) a1 += Math.PI * 2;
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      path.push([ctr[0] + Math.cos(a) * rc, ctr[1] + Math.sin(a) * rc]);
      fid.push(k - 1 + i / 6);
    }
    // The face to the next corner, bulging out a little in the middle.
    const b = fil[(k + 1) % 6].t1, bulge = 0.15 + r() * 0.3;
    const d = norm([b[0] - t2[0], b[1] - t2[1]]), out: Vec2 = [d[1], -d[0]];
    for (let i = 1; i < 12; i++) {
      const s = i / 12, w = Math.sin(Math.PI * s) * bulge;
      path.push([t2[0] + (b[0] - t2[0]) * s + out[0] * w, t2[1] + (b[1] - t2[1]) * s + out[1] * w]);
      fid.push(k);
    }
  }
  // The faces' tones, dealt out in a seeded order (each stone its own).
  const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5);
  const toneOf = (f: number): RGB => {
    const f0 = Math.floor(f), t = f - f0;
    const a = FACE_TONES[order[((f0 % 6) + 6) % 6]], b = FACE_TONES[order[(((f0 + 1) % 6) + 6) % 6]];
    const e = smooth(0, 1, t);
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  };
  // Resample evenly by length round.
  const acc = [0];
  for (let i = 1; i <= path.length; i++) {
    const a = path[i - 1], b = path[i % path.length];
    acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = acc[acc.length - 1];
  const p: Vec2[] = [], tint: RGB[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * total;
    while (acc[j + 1] < s) j++;
    const a = path[j], b = path[(j + 1) % path.length], f = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    p.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    // The last face runs on into the first corner's arc: unwrap its face number.
    let fb = fid[(j + 1) % path.length];
    if (fb < fid[j] - 3) fb += 6;
    tint.push(toneOf(fid[j] + (fb - fid[j]) * f));
  }
  // Scale so the widest of a dozen widths is 27 in (the maker's range is 24-28).
  let wide = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const pr = p.map(([x, z]) => x * ca + z * sa);
    wide = Math.max(wide, Math.max(...pr) - Math.min(...pr));
  }
  const k = 27 / wide;
  const pts = p.map(([x, z]): Vec2 => [x * k, z * k]);
  const nrm = pts.map((_, i): Vec2 => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const d = norm([b[0] - a[0], b[1] - a[1]]);
    return [d[1], -d[0]];
  });
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { p: pts, n: nrm, s, perimeter: s[n - 1] + Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]), tint };
}

/**
 * How far the face stands out from the outline at height y (inches up the stone) at point k: the crust's lumps and
 * fine vertical grooves, a slight swell at mid height, and the foot rounding in at the bottom.
 */
function faceOffset(ring: Ring, k: number, y: number, seed: number): number {
  const [x, z] = ring.p[k];
  const lump = (fbm3(x * 0.16, y * 0.16, z * 0.16, 4, seed) - 0.5) * 1.0 + (fbm3(x * 0.55, y * 0.55, z * 0.55, 3, seed + 3) - 0.5) * 0.3;
  const groove = (noise3(ring.s[k] * 0.85, y * 0.09, 0, seed + 7) - 0.5) * 0.3;
  const swell = Math.sin((Math.PI * Math.min(y, S.h)) / S.h) * 0.18;
  const foot = -0.6 * (1 - smooth(0, 1.4, y));
  return lump + groove + swell + foot;
}

/** The arris round the polished top: how far in from the face the top's edge is, and how far down it starts. */
const ARRIS = 0.35;

export function basaltFountain(c: WaterFireContext) {
  const { sink, f } = c;
  const bed = c.option('bed');
  const base = bed ? S.bedTop - 1 : 0;
  const top = base + S.h;
  const ring = columnOutline(f.id);
  const N = ring.p.length;
  const seed = Math.floor(rng(`${f.id}-crust`)() * 1000);

  // The faces: rows up the stone to the arris, the grid closed round (indexed, so the normals are smooth).
  const rows = [0, 0.25, 0.6, 1.1, 1.8, 2.7, 3.8, 5.0, 6.3, 7.6, 8.9, 10.2, 11.4, 12.5, 13.4, 14.1, S.h - ARRIS];
  const pos: number[] = [], uv: number[] = [], col: number[] = [];
  const tiles = 2;
  const face = (k: number, y: number, extra = 0): Vec2 => {
    const o = faceOffset(ring, k, y, seed) + extra;
    return [ring.p[k][0] + ring.n[k][0] * o, ring.p[k][1] + ring.n[k][1] * o];
  };
  for (const y of rows) {
    for (let k = 0; k <= N; k++) {
      const kk = k % N;
      const [x, z] = face(kk, y);
      pos.push(x * IN, (base + y) * IN, z * IN);
      uv.push(((k === N ? ring.perimeter : ring.s[kk]) / ring.perimeter) * tiles, y * IN);
      col.push(...ring.tint[kk]);
    }
  }
  const idx: number[] = [];
  const W = N + 1;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < N; k++) {
      const a = j * W + k, b = a + 1, c2 = a + W, d = c2 + 1;
      // Outward faces: k runs counterclockwise seen from below (+x toward +z), rows run up.
      idx.push(a, d, b, a, c2, d);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  side.setIndex(idx);
  side.computeVertexNormals();
  // The seam column (k = N repeats k = 0 with u closed at the perimeter): give both the same normal.
  const nAttr = side.getAttribute('normal') as THREE.BufferAttribute;
  for (let j = 0; j < rows.length; j++) {
    const a = j * W, b = j * W + N;
    const nx = nAttr.getX(a) + nAttr.getX(b), ny = nAttr.getY(a) + nAttr.getY(b), nz = nAttr.getZ(a) + nAttr.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
    nAttr.setXYZ(a, nx / l, ny / l, nz / l);
    nAttr.setXYZ(b, nx / l, ny / l, nz / l);
  }
  sink.add(pbrMaterial('wf-basalt-crust', crustSet(), { vertexColors: true }), side);

  // The polished top and its arris: from the faces' top row in and up to the flat top.
  const yr = S.h - ARRIS;
  const rim = Array.from({ length: N }, (_, k) => face(k, yr));
  const capEdge = Array.from({ length: N }, (_, k) => face(k, yr, -ARRIS));
  const polish = pbrMaterial('wf-basalt-polish', polishSet());
  const ap: number[] = [], au: number[] = [], ai: number[] = [];
  for (let k = 0; k <= N; k++) {
    const kk = k % N;
    ap.push(rim[kk][0] * IN, (base + yr) * IN, rim[kk][1] * IN, capEdge[kk][0] * IN, top * IN, capEdge[kk][1] * IN);
    au.push(rim[kk][0] * IN, rim[kk][1] * IN, capEdge[kk][0] * IN, capEdge[kk][1] * IN);
  }
  for (let k = 0; k < N; k++) {
    const a = k * 2, b = a + 1, c2 = a + 2, d = a + 3;
    ai.push(a, d, c2, a, b, d);
  }
  const arris = new THREE.BufferGeometry();
  arris.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
  arris.setAttribute('uv', new THREE.Float32BufferAttribute(au, 2));
  arris.setIndex(ai);
  arris.computeVertexNormals();
  sink.add(polish, arris);
  const shape = new THREE.Shape(capEdge.map(([x, z]) => new THREE.Vector2(x * IN, -z * IN)));
  const cap = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, top * IN, 0);
  sink.add(polish, cap);
  // The core-drilled hole (1 1/4 in, Stone Forest's installation guide) the bubbler wells up through.
  sink.add(plainMaterial('wf-basalt-hole', { color: '#070707', roughness: 1 }), new THREE.CircleGeometry(0.62 * IN, 18).rotateX(-Math.PI / 2).translate(0, (top + 0.01) * IN, 0));

  // Water. The sheet over the top, a hair above it, out to the arris.
  const sheet = sheetMaterial();
  sink.fall(sheet);
  const sheetMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, (top + 0.06) * IN, 0), sheet);
  sheetMesh.renderOrder = 3;
  sink.object(sheetMesh);
  // The crown welling out of the hole: a low dome and a short frothy plume in it.
  const water = clearFallMaterial();
  sink.fall(water);
  const dome = new THREE.Mesh(domeGeometry(1.9, 0.5, top + 0.06), water);
  dome.renderOrder = 3;
  sink.object(dome);
  const crownMat = filmMaterial(3.0);
  sink.fall(crownMat);
  const crown = new THREE.Mesh(filmGeometry([[0.2, top + 2.5], [0.75, top + 2.0], [1.05, top + 1.1], [0.95, top + 0.35]], 0, Math.PI * 2, 24), crownMat);
  crown.renderOrder = 3;
  sink.object(crown);
  const splash = splashMaterial();
  sink.fall(splash);
  const froth = new THREE.Mesh(new THREE.PlaneGeometry(2.8 * IN, 2.8 * IN).rotateX(-Math.PI / 2).translate(0, (top + 0.14) * IN, 0), splash);
  froth.renderOrder = 3;
  sink.object(froth);

  // The film over the arris and down every face, a hair out from the stone, to the pebbles.
  const land = bed ? S.bedTop : 0.6;
  const filmRows: { y: number; o: number }[] = [{ y: S.h, o: -ARRIS + 0.05 }, { y: yr, o: 0.06 }, ...rows.filter((y) => y < yr - 0.01 && y > land - base).reverse().map((y) => ({ y, o: 0.06 })), { y: land - base, o: 0.06 }];
  const fp: number[] = [], fu: number[] = [], fe: number[] = [], fd: number[] = [];
  let down = 0;
  const downAt: number[] = [0];
  for (let j = 1; j < filmRows.length; j++) {
    down += Math.hypot(filmRows[j].y - filmRows[j - 1].y, filmRows[j].o - filmRows[j - 1].o) * IN;
    downAt.push(down);
  }
  filmRows.forEach(({ y, o }, j) => {
    for (let k = 0; k <= N; k++) {
      const kk = k % N;
      const [x, z] = face(kk, Math.min(y, yr), o);
      fp.push(x * IN, (base + y) * IN, z * IN);
      fu.push(((k === N ? ring.perimeter : ring.s[kk]) * IN), downAt[j]);
      fe.push(downAt[j] / down);
      fd.push(0);
    }
  });
  const fi: number[] = [];
  for (let j = 0; j < filmRows.length - 1; j++) {
    for (let k = 0; k < N; k++) {
      const a = j * W + k, b = a + 1, c2 = a + W, d = c2 + 1;
      fi.push(a, d, c2, a, b, d);
    }
  }
  const filmGeo = new THREE.BufferGeometry();
  filmGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  filmGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  filmGeo.setAttribute('aEnd', new THREE.Float32BufferAttribute(fe, 1));
  filmGeo.setAttribute('aEdge', new THREE.Float32BufferAttribute(fd, 1));
  filmGeo.setIndex(fi);
  filmGeo.computeVertexNormals();
  const filmMat = filmMaterial(0.45);
  sink.fall(filmMat);
  const film = new THREE.Mesh(filmGeo, filmMat);
  film.renderOrder = 3;
  sink.object(film);
  // The basin under the pebbles: Stone Forest's 44 in square kit, the bed of black Mexican beach pebble over it.
  if (bed) {
    sink.add(plainMaterial('urn-basin-floor', { color: '#141311', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      new THREE.PlaneGeometry(S.basin * IN, S.basin * IN).rotateX(-Math.PI / 2).translate(0, (S.bedTop - 1.2) * IN, 0));
    const wob = rng(`${f.id}-bed`);
    const ph = [wob() * 6.28, wob() * 6.28, wob() * 6.28];
    const outline: Vec2[] = Array.from({ length: 40 }, (_, i): Vec2 => {
      const a = (i / 40) * Math.PI * 2;
      const w = 1 + 0.04 * Math.sin(a * 2 + ph[0]) + 0.03 * Math.sin(a * 3 + ph[1]) + 0.02 * Math.sin(a * 5 + ph[2]);
      return [Math.sin(a) * S.bed[0] * w, Math.cos(a) * S.bed[1] * w];
    });
    const hole = Array.from({ length: N / 4 }, (_, i) => face(i * 4, 1, 0.3));
    sink.pebbles('mexican-beach-pebble-1-2', outline, [hole], S.bedTop, [0.78, 0.72, 0.66]);
  }
}
