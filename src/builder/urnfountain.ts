import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import type { Vec2 } from '../siteplan/types';
import { fbm, smooth, vnoise, voronoi } from '../engine/noise';
import { mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from '../engine/textures';
import { GLOBAL } from '../engine/foliage';
import { pbrMaterial, plainMaterial } from './materials';
import { agedCopper, clearFallMaterial, ledMaterial, linkGlow, splashMaterial, type FountainSink } from './pillarfountain';
import { buildRock, type RockLook, type RockShape } from './stonegeo';
import { boulderMaterial } from './waterrock';
import type { UrnGlaze } from '../siteplan/yard';
import { photoAlbedo } from '../engine/surfaces';

/*
 * Urn fountains (pondless): a fountain urn standing on a hidden basin under a bed of loose pebbles, set off by boulders.
 * Two looks, from the owner's design boards (the plants on the boards are left out; plant the bed around them):
 *
 *   'glazed'   Blue Thumb Closed Top Fountain Kit FNT60036 (shopbluethumb.com): a 22 x 31 in glazed ceramic jar in
 *              glossy aqua-teal with darker blue-green drips, widest at the shoulder and tapering to its foot, a raised
 *              rolled collar (lighter, speckled) round a recessed top where a copper bubbler wells up, the water filling
 *              the top and running down every side. The kit's 36 in Achelous AquaBox basin (39.5 in across, 16 in deep)
 *              is hidden under the bed: California Landscape Supply's 1 1/2 in Yosemite Tan river pebble (tan, cream,
 *              gray and blue-gray), with a dark Canyon Tech boulder in front and a tan moss rock behind. Blue Thumb's
 *              vases are one of a kind: the drawn one is the photographed FNT60036. Top and foot sizes are read from
 *              Blue Thumb's photo (not published).
 *   'jar'      Blue Thumb Tuscany Vase Fountain Kit FNT40018 (shopbluethumb.com), the owner's pick for the second board
 *              (no maker sells the board's chiseled jar with a spray): a 22 x 39 in hand-glazed ceramic vase, tall and
 *              softly rounded, widest high on the shoulder and tapering to its foot, in warm sandy-yellow and creamy
 *              tones weathered darker toward the foot with brown marks and drips, under a terracotta rolled rim round
 *              its open mouth. The kit's standpipe lifts a bubbling plume in the mouth (its LED lights the water at
 *              night) and the vase brims over its rim down every side, into the kit's 48 in Achelous basin hidden under
 *              black Mexican beach pebble, ringed by three moss rocks as on the board (moss off: clean tan stone). The
 *              vase is one of a kind; the drawn one is the photographed FNT40018. Its foot, rim and widest height are
 *              read from Blue Thumb's photo (not published).
 *
 * The urns' sizes are the makers' (see URN). Local space: y up from grade, +z the front; the pebble bed's top is
 * `bedTop` in, the urn stands on the basin's grate an inch below it.
 */

const IN = 0.0254;

export type UrnStyle = 'glazed' | 'jar' | 'bubbler';

interface UrnSize {
  /** Height, widest diameter, foot and top / mouth diameters, inches. */
  h: number;
  max: number;
  foot: number;
  top: number;
  /** Height of the widest point, share of h. */
  belly: number;
  /** The pebble bed: half-widths across (x) and front to back (z), inches, and its top. */
  bed: [number, number];
  bedTop: number;
}

export const URN: Record<UrnStyle, UrnSize> = {
  glazed: { h: 31, max: 22, foot: 13.6, top: 12.8, belly: 0.7, bed: [34, 30], bedTop: 2 },
  jar: { h: 39, max: 22, foot: 11.3, top: 15, belly: 0.72, bed: [40, 32], bedTop: 1.5 },
  // The 24 in bubbling urn of a client's water feature sheet: 24 in across, 30 in tall (read from the sheet's photo),
  // in the plan's 7 ft pebble circle.
  bubbler: { h: 30, max: 24, foot: 15, top: 11.5, belly: 0.55, bed: [42, 42], bedTop: 1.5 },
};

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

/**
 * A reactive turquoise glaze: a deep teal ground clouded with lighter aqua where the glaze ran thin and pooled darker
 * green-blue where it gathered, flecked with dark iron spots, over a faintly pebbled body. Glossy.
 */
function turquoiseGlazeSet(): PBRSet {
  return textureSet('urn-glaze-fnt60036', () =>
    // One tile taller than the vase's whole surface, so the drips never repeat up it (they are not periodic up the tile).
    paint(2048, 1.2, 1.6, (u, v) => {
      // Tones read from Blue Thumb's photo of FNT60036: aqua-teal, a deeper teal, and dark blue-green drips running down.
      const cloud = fbm(u, v * 0.5, 4, 4, 301);
      const drip = fbm(u, v * 0.12, 52, 4, 307), drip2 = vnoise(u * 180, v * 8, 180, 309);
      const fleck = vnoise(u * 380, v * 380, 380, 313), fine = vnoise(u * 160, v * 160, 160, 317);
      let c: RGB = mixRGB([0.109, 0.262, 0.235], [0.162, 0.386, 0.352], smooth(0.3, 0.7, cloud));
      c = mixRGB(c, [0.07, 0.13, 0.13], smooth(0.58, 0.78, drip) * 0.6);
      c = mixRGB(c, [0.06, 0.12, 0.2], smooth(0.8, 0.95, drip2) * 0.45);
      if (fleck > 0.9) c = mulRGB(c, 1 - 0.4 * smooth(0.9, 0.96, fleck));
      c = mulRGB(c, 0.96 + fine * 0.08);
      return { h: 0.5 + (fine - 0.5) * 0.1 + smooth(0.6, 0.8, drip) * 0.08, c, r: 0.12 + fine * 0.05 };
    }),
  );
}

/** The collar's glaze: the same, broken lighter and speckled where it ran thin over the roll (Blue Thumb's photo). */
function rimGlazeSet(): PBRSet {
  return textureSet('urn-glaze-fnt60036-rim', () =>
    paint(512, 0.3, 1.6, (u, v) => {
      const cloud = fbm(u, v, 5, 4, 321), fleck = vnoise(u * 300, v * 300, 300, 323);
      let c: RGB = mixRGB([0.2, 0.33, 0.29], [0.27, 0.47, 0.42], smooth(0.3, 0.7, cloud));
      if (fleck > 0.84) c = mixRGB(c, [0.12, 0.09, 0.06], smooth(0.84, 0.92, fleck) * 0.7);
      return { h: 0.5, c, r: 0.16 };
    }),
  );
}

/**
 * FNT40018's glaze, from Blue Thumb's photo (tones taken through the wall calibration, so a vertical face renders at the
 * photo's color in the default light): warm cream and sandy yellow, paler where it pooled thick, going ochre and darker
 * over the lowest third, with sparse brown spots and thin brown drip lines running down. The tile is taller than the
 * vase's whole surface, so `v` is the height up it (1.2 m a tile) and the weathering keys off it. Satin.
 */
function tuscanyGlazeSet(): PBRSet {
  return textureSet('urn-glaze-fnt40018', () =>
    paint(2048, 1.2, 1.2, (u, v) => {
      // The painted tile's v runs down from its top row; the lathe's runs up from the foot.
      const up = (1 - v) * 1.2;
      const cloud = fbm(u, v, 5, 4, 351), pale = fbm(u + 2.3, v + 0.7, 9, 3, 353);
      const low = 1 - smooth(0.1, 0.45, up + (fbm(u, v, 12, 3, 355) - 0.5) * 0.14);
      // A little warmer than the calibrated tones: the sky fill grays a vertical face's yellow.
      let c: RGB = mixRGB([0.667, 0.565, 0.34], [0.702, 0.595, 0.385], smooth(0.3, 0.7, cloud));
      c = mixRGB(c, [0.75, 0.67, 0.49], smooth(0.6, 0.8, pale) * 0.6 * (1 - low));
      c = mixRGB(c, mixRGB([0.55, 0.44, 0.2], [0.46, 0.35, 0.13], smooth(0.4, 0.7, cloud)), low);
      // The foot's worn band and the brown marks: spots where the glaze skipped, drip lines below them.
      const foot = 1 - smooth(0.0, 0.05, up + (vnoise(u * 60, v * 60, 60, 357) - 0.5) * 0.03);
      const spot = voronoi(u, v, 22, 359);
      const mark = spot.id > 0.975 ? (1 - smooth(0.04, 0.2, spot.f1 + (vnoise(u * 90, v * 90, 90, 365) - 0.5) * 0.12)) * (0.4 + low * 0.6) : 0;
      const drip = smooth(0.94, 0.98, vnoise(u * 160, v * 4, 160, 361)) * (0.3 + low * 0.7);
      c = mixRGB(c, [0.388, 0.286, 0.122], Math.max(foot * 0.8, mark * 0.85, drip * 0.7));
      const fine = vnoise(u * 300, v * 300, 300, 363);
      c = mulRGB(c, 0.97 + fine * 0.06);
      return { h: 0.5 + (fine - 0.5) * 0.08 - mark * 0.1, c, r: 0.42 + low * 0.15 };
    }),
  );
}

/** The rolled rim: terracotta, unglazed, a little darker in the crease under the roll (Blue Thumb's photo). */
function tuscanyRimSet(): PBRSet {
  return textureSet('urn-rim-fnt40018', () =>
    paint(512, 0.3, 1.4, (u, v) => {
      const cloud = fbm(u, v, 5, 4, 371), grain = vnoise(u * 260, v * 260, 260, 373);
      let c: RGB = mixRGB([0.561, 0.365, 0.251], [0.694, 0.427, 0.251], smooth(0.3, 0.75, cloud));
      c = mixRGB(c, [0.576, 0.267, 0.094], smooth(0.62, 0.8, fbm(u + 1.1, v, 9, 3, 377)) * 0.5);
      return { h: 0.5 + grain * 0.1, c: mulRGB(c, 0.95 + grain * 0.08), r: 0.82 };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Shapes                                                               */
/* ------------------------------------------------------------------ */

/** A lathe of the outline (inches, from the foot up), UVs in meters round and up its surface. */
function lathe(pts: [number, number][], seg = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * IN, y * IN)), seg);
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Up the surface: the outline's length from the foot, so the texture is not stretched where the wall turns in.
  const along: number[] = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * IN);
  const rMax = Math.max(...pts.map((p) => p[0])) * IN;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(uv.getY(i) * (pts.length - 1));
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * rMax, along[k]);
  }
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

/**
 * FNT60036's outline (inches, from the foot up): a narrow foot, a straight-ish swell to the widest point high on the
 * body, a rounded shoulder in to the collar, the collar's rolled lip, and the recessed top round the bubbler.
 */
function glazedOutline(s: UrnSize): [number, number][] {
  const R = s.max / 2, F = s.foot / 2, yb = s.h * s.belly;
  const neckY = s.h - 2.2, neck = s.top / 2 + 0.15;
  const pts: [number, number][] = [[0, 0.3], [F - 0.4, 0], [F, 0.4]];
  for (let i = 1; i <= 18; i++) {
    const t = i / 18;
    pts.push([F + (R - F) * Math.sin((t * Math.PI) / 2), 0.4 + t * (yb - 0.4)]);
  }
  for (let i = 1; i <= 14; i++) {
    const a = ((i / 14) * Math.PI) / 2;
    pts.push([neck + (R - neck) * Math.cos(a), yb + (neckY - yb) * Math.sin(a)]);
  }
  return pts;
}

/** The collar over the shoulder: its rolled lip and the recessed top it holds (inches). */
function collarOutline(s: UrnSize): [number, number][] {
  const c = s.top / 2, neckY = s.h - 2.2;
  return [[c + 0.15, neckY - 0.3], [c - 0.1, neckY + 0.6], [c + 0.25, s.h - 0.8], [c + 0.1, s.h - 0.15], [c - 0.5, s.h], [c - 1.2, s.h - 0.2], [c - 1.6, s.h - 0.9], [c - 2.0, s.h - 1.1], [0, s.h - 1.1]];
}

/**
 * FNT40018's outline (inches, from the foot up): a narrow, softly rounded foot, a long taper to the widest point high on
 * the body, a rounded shoulder in to a short neck under the rim.
 */
function tuscanyOutline(s: UrnSize): [number, number][] {
  const R = s.max / 2, F = s.foot / 2, yb = s.h * s.belly;
  const neckY = s.h - 2.1, neck = s.top / 2 - 0.65;
  const pts: [number, number][] = [[0, 0.3], [F - 0.8, 0], [F - 0.1, 0.5]];
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    pts.push([F + (R - F) * Math.sin((t * Math.PI) / 2), 0.5 + t * (yb - 0.5)]);
  }
  for (let i = 1; i <= 14; i++) {
    const a = ((i / 14) * Math.PI) / 2;
    pts.push([neck + (R - neck) * Math.cos(a), yb + (neckY - yb) * Math.sin(a)]);
  }
  return pts;
}

/** The terracotta rolled rim over the neck, and the inside of the mouth down below the water (inches). */
function tuscanyRim(s: UrnSize): [number, number][] {
  const c = s.top / 2, neckY = s.h - 2.1;
  return [[c - 0.6, neckY - 0.2], [c - 0.15, neckY + 0.3], [c, neckY + 1.0], [c - 0.15, s.h - 0.3], [c - 0.7, s.h], [c - 1.3, s.h - 0.25], [c - 1.5, s.h - 1.0], [c - 1.6, s.h - 3]];
}

/** The outline grown out along its normals by `off` inches (a film of water over the surface), from the outline's point `from` on. */
function offsetOutline(pts: [number, number][], off: number, from = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = from; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
    // Outward normal of a curve running up (r, y): (dy, -dr).
    out.push([pts[i][0] + (dy / l) * off, pts[i][1] - (dr / l) * off]);
  }
  return out;
}

/**
 * A film of water over a lathe surface (inches outline, from the top down), over angles a0..a0+len: its uv.y in meters
 * run down from the top, aEnd 0 at the top to 1 at the foot (the clear-water shader whitens it as it breaks up below).
 */
function filmGeometry(down: [number, number][], a0 = 0, len = Math.PI * 2, seg = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(down.map(([r, y]) => new THREE.Vector2(r * IN, y * IN)), seg, a0, len);
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const along: number[] = [0];
  for (let i = 1; i < down.length; i++) along.push(along[i - 1] + Math.hypot(down[i][0] - down[i - 1][0], down[i][1] - down[i - 1][1]) * IN);
  const total = along[along.length - 1] || 1;
  const end = new Float32Array(pos.count), edge = new Float32Array(pos.count);
  const rMax = Math.max(...down.map((p) => p[0])) * IN;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(uv.getY(i) * (down.length - 1));
    uv.setXY(i, uv.getX(i) * len * rMax, along[k]);
    end[i] = along[k] / total;
  }
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * A thin film of water running down a surface: nearly clear, so the urn shows through, with fine moving ripples that
 * catch the sky (fresnel) and the sun, a few brighter runnels, and a little white where it breaks up at the foot.
 */
function filmMaterial(strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uSunColor: GLOBAL.uSunColor, uK: { value: strength } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aEnd;
      varying vec2 vUv; varying float vEnd; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv; vEnd = aEnd;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; uniform float uK;
      varying vec2 vUv; varying float vEnd; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = uTime;
        float rip = n(vec2(vUv.x * 90.0, vUv.y * 26.0 - t * 5.0)) * 0.6 + n(vec2(vUv.x * 220.0, vUv.y * 60.0 - t * 9.0)) * 0.4;
        float run = smoothstep(0.62, 0.95, n(vec2(vUv.x * 24.0, vUv.y * 1.5 - t * 1.2)));
        vec3 N = normalize(vN), V = normalize(vV);
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        float glint = pow(max(0.0, rip - 0.55) * 2.2, 3.0);
        float brk = smoothstep(0.82, 1.0, vEnd) * n(vec2(vUv.x * 60.0, vUv.y * 30.0 - t * 8.0));
        float a = clamp((0.04 + fres * 0.1 + run * 0.1 + glint * 0.25 + brk * 0.3) * uK, 0.0, 0.6);
        float day = 0.22 + length(uSunColor) * 0.34;
        vec3 c = vec3(0.7, 0.78, 0.84) * day * (0.2 + fres * 0.4) + vec3(1.0) * day * (glint * 0.6 + run * 0.16 + brk * 0.4);
        gl_FragColor = vec4(c * a + vec3(1.0) * day * glint * 0.12, a);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** A mound of water welling up over the bubbler hole: a low dome, flowing out from the middle. */
function domeGeometry(r: number, h: number, y: number): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push([r * t, y + h * (1 - t * t)]);
  }
  return filmGeometry(pts);
}

/** A ring of foam where the water meets the pebbles. */
function foamRing(sink: FountainSink, r0: number, r1: number, y: number) {
  const splash = splashMaterial();
  sink.fall(splash);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rr = (r0 + r1) / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry((r1 - r0) * 2.2 * IN, (r1 - r0) * 2.2 * IN).rotateX(-Math.PI / 2), splash);
    m.position.set(Math.sin(a) * rr * IN, y * IN, Math.cos(a) * rr * IN);
    m.renderOrder = 3;
    sink.object(m);
  }
}

/* ------------------------------------------------------------------ */
/* Rocks and pebbles                                                    */
/* ------------------------------------------------------------------ */

const CLEAN_TAN: RockLook = {
  stone: ['#8b7656', '#74603f', '#9c865f', '#64533d', '#806b4b'],
  streak: '#4a3d2e',
  soil: '#3f3126',
  lichen: '#7d7f6e',
  lichenAmount: 0.2,
  rust: '#a8531f',
  rustAmount: 0.05,
  moss: ['#5c6828', '#435423'],
  mossAmount: 0,
};
const CANYON_DARK: RockLook = {
  stone: ['#4e4d4a', '#444340', '#58544e', '#3d3c3a', '#524e48'],
  streak: '#36373a',
  soil: '#3f3126',
  lichen: '#9a9e93',
  lichenAmount: 0.2,
  rust: '#8a5430',
  rustAmount: 0.25,
  moss: ['#6f7f3a', '#586b2f'],
  mossAmount: 0,
};
/** Tan granite, as the bubbler board's boulders: gray-tan with warmer patches, a little lichen. */
const GRANITE_TAN: RockLook = {
  stone: ['#7f7668', '#6e6559', '#8b8173', '#625a4f', '#786d5f'],
  streak: '#4a443c',
  soil: '#3f3126',
  lichen: '#8a8c7e',
  lichenAmount: 0.18,
  rust: '#9a6a3f',
  rustAmount: 0.08,
  moss: ['#5c6828', '#435423'],
  mossAmount: 0,
};
/** Rounded field boulders, split along a few planes and worn (moss rock's rounded shape, a little softer). */
const ROUND_BOULDER: RockShape = { squareness: 2.7, cuts: 6, cutDepth: [0.76, 0.93], edge: 0.08, lump: 0.05, rough: 0.025, pocket: 0.07, lean: 4 };

/** A boulder at (x, z) inches: size [across, deep, high] inches, a quarter of it set into the bed. */
function boulder(sink: FountainSink, look: RockLook, x: number, z: number, size: [number, number, number], turn: number, seed: string) {
  const geo = buildRock({ shape: ROUND_BOULDER, look, size: [size[0] * IN, size[1] * IN, size[2] * IN], buried: 0.22, seed, moss: false });
  geo.rotateY(turn);
  geo.translate(x * IN, 0, z * IN);
  sink.add(boulderMaterial(), geo);
}

/** An oval outline, inches, with a little wobble so it does not read as drawn with a compass. */
function ovalIn(rx: number, rz: number, seed: string, n = 36): Vec2[] {
  const r = rng(seed);
  const k = Array.from({ length: 3 }, () => r() * Math.PI * 2);
  return Array.from({ length: n }, (_, i): Vec2 => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + 0.05 * Math.sin(a * 2 + k[0]) + 0.035 * Math.sin(a * 3 + k[1]) + 0.02 * Math.sin(a * 5 + k[2]);
    return [Math.sin(a) * rx * w, Math.cos(a) * rz * w];
  });
}

const circleIn = (rad: number, n = 24): Vec2[] => Array.from({ length: n }, (_, i): Vec2 => [Math.sin((i / n) * Math.PI * 2) * rad, Math.cos((i / n) * Math.PI * 2) * rad]);

/* ------------------------------------------------------------------ */
/* The fountains                                                        */
/* ------------------------------------------------------------------ */

/** The bubbler urn's choices (its catalog glaze and the placement's options). */
export interface BubblerChoice {
  glaze?: UrnGlaze;
  ring: boolean;
  boulders: boolean;
  uplight: boolean;
}

/** Builds an urn fountain into the feature's parts (water through `sink`, so the Hand tool can turn it off). */
export function urnFountain(sink: FountainSink, style: UrnStyle, seed: string, choice?: BubblerChoice) {
  if (style === 'glazed') glazedUrn(sink, seed);
  else if (style === 'bubbler') bubblerUrn(sink, seed, choice ?? { ring: true, boulders: true, uplight: true });
  else jarUrn(sink, seed);
}

function glazedUrn(sink: FountainSink, seed: string) {
  const s = URN.glazed;
  const base = s.bedTop - 1;
  const outline = glazedOutline(s), collar = collarOutline(s);
  // The lathes' seams (where their textures wrap) turned to the back.
  sink.add(pbrMaterial('urn-glaze-fnt60036', turquoiseGlazeSet()), lathe(outline).rotateY(Math.PI).translate(0, base * IN, 0));
  sink.add(pbrMaterial('urn-glaze-fnt60036-rim', rimGlazeSet()), lathe(collar).rotateY(Math.PI).translate(0, base * IN, 0));
  const top = base + s.h;
  // The copper bubbler fitting in the recessed top.
  const copper = agedCopper();
  sink.add(copper, new THREE.CylinderGeometry(0.55 * IN, 0.7 * IN, 0.7 * IN, 16).translate(0, (top - 1.1 + 0.35) * IN, 0).toNonIndexed());

  // Water: welling over the fitting, filling the recessed top, over the lip and down every side; foam at the foot.
  const water = clearFallMaterial();
  sink.fall(water);
  const thin = filmMaterial();
  sink.fall(thin);
  const dome = new THREE.Mesh(domeGeometry(1.8 * IN, 0.7 * IN, (top - 0.35) * IN), water);
  dome.renderOrder = 3;
  sink.object(dome);
  sink.add(plainMaterial('urn-top-pool', { color: '#16302e', roughness: 0.04, metalness: 0.2 }), new THREE.CircleGeometry((s.top / 2 - 1.3) * IN, 32).rotateX(-Math.PI / 2).translate(0, (top - 0.4) * IN, 0).toNonIndexed());
  // The film from the lip's top out and down the collar, the shoulder and the body to the bed.
  const lipDown = offsetOutline(collar.slice(0, 5), 0.1).reverse();
  const bodyDown = offsetOutline(outline, 0.1, 3).reverse().filter(([, y]) => y > 0.6);
  const down = [...lipDown, ...bodyDown].map(([r, y]): [number, number] => [r, y + base]);
  const film = new THREE.Mesh(filmGeometry(down), thin);
  film.renderOrder = 3;
  sink.object(film);
  foamRing(sink, s.foot / 2 + 0.5, s.foot / 2 + 4, s.bedTop + 0.4);

  // The bed over the AquaBox: Yosemite Tan; the jar's foot stands in it.
  sink.add(plainMaterial('urn-basin-floor', { color: '#141311', roughness: 1 }), new THREE.CircleGeometry(s.bed[0] * IN, 40).rotateX(-Math.PI / 2).translate(0, (s.bedTop - 1.5) * IN, 0).toNonIndexed());
  sink.pebbles(GLAZED_PEBBLE, ovalIn(s.bed[0], s.bed[1], `${seed}-bed`), [circleIn(s.foot / 2 + 0.3)], s.bedTop, [0.85, 0.8, 0.76]);

  // Boulders: a dark one in front, off to the side, and a tan one behind on the other side.
  boulder(sink, CANYON_DARK, 13, 19, [20, 16, 11], 0.6, `${seed}-front`);
  boulder(sink, CLEAN_TAN, -20, -12, [18, 15, 12], 2.1, `${seed}-back`);
}

function jarUrn(sink: FountainSink, seed: string) {
  const s = URN.jar;
  const base = s.bedTop - 1;
  const outline = tuscanyOutline(s), rim = tuscanyRim(s);
  sink.add(pbrMaterial('urn-glaze-fnt40018', tuscanyGlazeSet()), lathe(outline).rotateY(Math.PI).translate(0, base * IN, 0));
  sink.add(pbrMaterial('urn-rim-fnt40018', tuscanyRimSet()), lathe(rim).rotateY(Math.PI).translate(0, base * IN, 0));
  const top = base + s.h;
  // The vase brims: the water stands at the rim's inner edge, the standpipe's plume welling in the middle.
  const waterY = top - 0.35;
  sink.add(plainMaterial('urn-top-pool', { color: '#16302e', roughness: 0.04, metalness: 0.2 }), new THREE.CircleGeometry((s.top / 2 - 1.4) * IN, 36).rotateX(-Math.PI / 2).translate(0, waterY * IN, 0).toNonIndexed());
  const water = clearFallMaterial();
  sink.fall(water);
  const thin = filmMaterial();
  sink.fall(thin);
  const plume = new THREE.Mesh(domeGeometry(2.4 * IN, 1.2 * IN, (waterY + 0.02) * IN), water);
  plume.renderOrder = 3;
  sink.object(plume);
  // The standpipe's LED, under the water at the top of the pipe: it lights the plume at night.
  const led = ledMaterial();
  sink.own(led);
  sink.glow(led);
  linkGlow(led, water);
  sink.add(led, new THREE.CircleGeometry(0.9 * IN, 18).rotateX(-Math.PI / 2).translate(0, (waterY - 1.5) * IN, 0).toNonIndexed());
  sink.light(0, (top + 4) * IN, 0, '#ffd9a0', 0.9, 1.6);
  // The overflow: over the rim's top, down the roll, the shoulder and the body to the pebbles, all round.
  const rimDown = offsetOutline(rim.slice(0, 5), 0.1).reverse();
  const bodyDown = offsetOutline(outline, 0.1, 3).reverse().filter(([, y]) => y > 0.6);
  const down = [...rimDown, ...bodyDown].map(([r0, y]): [number, number] => [r0, y + base]);
  const film = new THREE.Mesh(filmGeometry(down), thin);
  film.renderOrder = 3;
  sink.object(film);
  foamRing(sink, s.foot / 2 + 0.5, s.foot / 2 + 4, s.bedTop + 0.3);

  // The bed over the 48 in Achelous basin: black Mexican beach pebble, wet round the vase.
  sink.add(plainMaterial('urn-basin-floor', { color: '#141311', roughness: 1 }), new THREE.CircleGeometry(s.bed[0] * IN, 40).scale(1, s.bed[1] / s.bed[0], 1).rotateX(-Math.PI / 2).translate(0, (s.bedTop - 1.5) * IN, 0).toNonIndexed());
  sink.pebbles('mexican-beach-pebble-1-2', ovalIn(s.bed[0], s.bed[1], `${seed}-bed`), [circleIn(s.foot / 2 + 0.3)], s.bedTop, [0.72, 0.6, 0.5]);

  // Three clean tan boulders round the basin, as on the board: a big one front left, a small one in front of it, one
  // back right.
  boulder(sink, CLEAN_TAN, -25, 14, [26, 21, 16], 0.4, `${seed}-left`);
  boulder(sink, CLEAN_TAN, -9, 25, [16, 13, 9], 1.7, `${seed}-front`);
  boulder(sink, CLEAN_TAN, 27, -6, [24, 19, 15], 2.6, `${seed}-right`);
}

/** The glazed urn's pebble bed. */
export const GLAZED_PEBBLE = 'yosemite-tan-1-5';

/* ------------------------------------------------------------------ */
/* The 24 in bubbling urn                                               */
/* ------------------------------------------------------------------ */

/**
 * The glazes (sRGB, as painted): a ground tone, the lighter tone where the glaze broke thin over the texture, the
 * darker tone where it pooled, a fleck color, and how glossy it is. 'rust' is the design board's urn: a rough, pebbly
 * stoneware glazed tan and cream, broken rust and brown down the body. The others are the usual reactive glazes.
 */
const GLAZES: Record<UrnGlaze, { ground: RGB; light: RGB; dark: RGB; fleck: RGB; rough: number; pebbly: number }> = {
  rust: { ground: [0.33, 0.27, 0.19], light: [0.45, 0.38, 0.28], dark: [0.31, 0.17, 0.08], fleck: [0.26, 0.18, 0.12], rough: 0.62, pebbly: 1 },
  charcoal: { ground: [0.2, 0.2, 0.21], light: [0.33, 0.34, 0.35], dark: [0.11, 0.11, 0.12], fleck: [0.45, 0.42, 0.38], rough: 0.3, pebbly: 0.35 },
  cobalt: { ground: [0.13, 0.25, 0.47], light: [0.27, 0.42, 0.63], dark: [0.07, 0.13, 0.27], fleck: [0.55, 0.5, 0.4], rough: 0.22, pebbly: 0.3 },
  celadon: { ground: [0.49, 0.6, 0.5], light: [0.64, 0.73, 0.63], dark: [0.33, 0.45, 0.37], fleck: [0.3, 0.27, 0.2], rough: 0.26, pebbly: 0.3 },
};

/**
 * The urn's glaze over a pebbly stoneware body: cells of slightly raised grain, the glaze breaking lighter over them
 * and pooling darker between, broad clouds and runs down the body, sparse dark iron flecks. One tile taller than the
 * urn's surface, so the runs do not repeat up it.
 */
function bubblerGlazeSet(glaze: UrnGlaze): PBRSet {
  const G = GLAZES[glaze];
  return textureSet(`urn-glaze-bubbler-${glaze}`, () =>
    paint(1024, 1.0, 1.2, (u, v) => {
      const cell = voronoi(u, v, 90, 401);
      const bump = smooth(0.0, 0.5, cell.f2 - cell.f1);
      const cloud = fbm(u, v, 4, 4, 403);
      const run = fbm(u, v * 0.25, 18, 3, 405);
      const fine = vnoise(u * 300, v * 300, 300, 407);
      let c: RGB = mixRGB(G.ground, G.light, smooth(0.35, 0.75, cloud) * 0.8);
      c = mixRGB(c, G.dark, smooth(0.55, 0.8, run) * 0.75);
      // Over the pebbly grain the glaze breaks thin (light) on the bumps and pools (dark) between them.
      c = mixRGB(c, G.light, bump * 0.12 * G.pebbly);
      c = mixRGB(c, G.dark, (1 - bump) * 0.16 * G.pebbly);
      if (fine > 0.93) c = mixRGB(c, G.fleck, smooth(0.93, 0.98, fine) * 0.8);
      return { h: 0.5 + (bump - 0.5) * 0.3 * G.pebbly + (fine - 0.5) * 0.05, c: mulRGB(c, 0.97 + fine * 0.06), r: G.rough + (1 - bump) * 0.08 };
    }),
  );
}

/**
 * The board's urn (inches, from the foot up): a 15 in foot, swelling to 24 in a little above half its height, a
 * full rounded shoulder in to a short neck, and a rolled lip round the mouth; then down inside the mouth to below
 * the water.
 */
function bubblerOutline(s: UrnSize): [number, number][] {
  const R = s.max / 2, F = s.foot / 2, yb = s.h * s.belly;
  const neckY = s.h - 2.4, neck = s.top / 2 + 0.2;
  const pts: [number, number][] = [[0, 0.3], [F - 0.5, 0], [F, 0.5]];
  for (let i = 1; i <= 18; i++) {
    const t = i / 18;
    pts.push([F + (R - F) * Math.sin((t * Math.PI) / 2), 0.5 + t * (yb - 0.5)]);
  }
  for (let i = 1; i <= 18; i++) {
    const a = ((i / 18) * Math.PI) / 2;
    pts.push([neck + (R - neck) * Math.cos(a), yb + (neckY - yb) * Math.pow(Math.sin(a), 0.85)]);
  }
  return pts;
}

/** The rolled lip over the neck and the mouth's inside down to below the water (inches). */
function bubblerLip(s: UrnSize): [number, number][] {
  const c = s.top / 2, neckY = s.h - 2.4;
  return [[c + 0.2, neckY - 0.2], [c + 0.35, neckY + 0.8], [c + 0.75, s.h - 0.9], [c + 0.7, s.h - 0.25], [c + 0.25, s.h], [c - 0.4, s.h - 0.2], [c - 0.75, s.h - 0.9], [c - 1.0, s.h - 3]];
}

/** Soft vertical facets round the body, as the board's urn shows (a hair over a tenth of an inch deep). */
function flute(g: THREE.BufferGeometry, y0: number, y1: number, n = 14, depth = 0.012) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const w = smooth(y0, y0 + (y1 - y0) * 0.25, y) * (1 - smooth(y1 - (y1 - y0) * 0.2, y1, y));
    if (w <= 0) continue;
    const k = 1 - depth * w * (0.5 - 0.5 * Math.cos(Math.atan2(z, x) * n));
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
}

/** A tall dome of water thrown up by the copper bubbler: a bell from its crown down and out to the mouth. */
function bellGeometry(top: number, waterY: number, mouth: number): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([0.15 + (mouth - 0.15) * Math.sin((t * Math.PI) / 2) * (0.75 + 0.25 * t), waterY + (top - waterY) * (1 - t * t)]);
  }
  return filmGeometry(pts, 0, Math.PI * 2, 40);
}

/** The soldier ring round the pebbles: 6 x 9 pavers laid radially (9 in across the band), wedge joints, at paver height. */
function paverRing(sink: FountainSink, r0: number, seed: string) {
  const band = 9, thick = 2.36, joint = 0.15;
  const n = Math.round((2 * Math.PI * (r0 + band / 2)) / 6.1);
  const r = rng(`${seed}-ring`);
  // Catalina Grana Scandina Gray's tones (the border the plan rings it with), each piece one of them.
  const tones = ['#cbc4bc', '#b9b3ae', '#aca8a4', '#9d9a96'].map((h) => new THREE.Color(photoAlbedo(h)));
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2 + joint / 2 / r0, a1 = ((k + 1) / n) * Math.PI * 2 - joint / 2 / r0;
    const pts = [[r0, a0], [r0 + band, a0 + (joint / 2) * (1 / r0 - 1 / (r0 + band))], [r0 + band, a1 - (joint / 2) * (1 / r0 - 1 / (r0 + band))], [r0, a1]]
      .map(([rr, a]) => new THREE.Vector2(Math.sin(a) * rr * IN, -Math.cos(a) * rr * IN));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: thick * IN - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelOffset: -0.002, bevelSegments: 1, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.002, 0);
    const out = g.toNonIndexed();
    g.dispose();
    out.computeVertexNormals();
    const col = tones[Math.floor(r() * tones.length)].clone().multiplyScalar(0.94 + r() * 0.1);
    const cols = new Float32Array(out.getAttribute('position').count * 3);
    for (let i = 0; i < cols.length; i += 3) cols.set([col.r, col.g, col.b], i);
    out.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(out);
  }
  const grain = textureSet('urn-ring-grana', () =>
    paint(256, 0.3, 1.2, (u, v) => {
      const f = vnoise(u * 200, v * 200, 200, 411), m = fbm(u, v, 3, 3, 413);
      const speck = f > 0.9 ? 1.25 : f < 0.08 ? 0.7 : 1;
      return { h: f * 0.3, c: mulRGB([0.92, 0.92, 0.92], (0.9 + m * 0.14) * speck), r: 0.84 };
    }),
  );
  const mat = pbrMaterial('urn-ring-grana', grain, { vertexColors: true });
  for (const g of parts) sink.add(mat, g);
}

function bubblerUrn(sink: FountainSink, seed: string, choice: BubblerChoice) {
  const s = URN.bubbler;
  const glaze = choice.glaze ?? 'rust';
  const base = s.bedTop - 1;
  const outline = bubblerOutline(s), lip = bubblerLip(s);
  const body = lathe(outline, 96).rotateY(Math.PI).translate(0, base * IN, 0);
  flute(body, (base + 3) * IN, (base + s.h - 3.5) * IN);
  sink.add(pbrMaterial(`urn-glaze-bubbler-${glaze}`, bubblerGlazeSet(glaze)), body);
  sink.add(pbrMaterial(`urn-glaze-bubbler-${glaze}`, bubblerGlazeSet(glaze)), lathe(lip, 96).rotateY(Math.PI).translate(0, base * IN, 0));
  const top = base + s.h;
  const waterY = top - 0.45;
  sink.add(plainMaterial('urn-top-pool', { color: '#16302e', roughness: 0.04, metalness: 0.2 }), new THREE.CircleGeometry((s.top / 2 - 0.9) * IN, 36).rotateX(-Math.PI / 2).translate(0, waterY * IN, 0).toNonIndexed());
  // The copper bubbler stub standing an inch and a half out of the water.
  const copper = agedCopper();
  sink.add(copper, new THREE.CylinderGeometry(0.42 * IN, 0.5 * IN, 2 * IN, 16).translate(0, (waterY + 0.6) * IN, 0).toNonIndexed());
  sink.add(plainMaterial('urn-bubbler-bright', { color: '#9a6040', roughness: 0.3, metalness: 0.85 }), new THREE.CylinderGeometry(0.5 * IN, 0.5 * IN, 0.25 * IN, 16).translate(0, (waterY + 1.55) * IN, 0).toNonIndexed());

  // Water: a dome thrown about 7 in up from the stub, falling back as a bell to the mouth, the mouth brimming, the
  // overflow sheeting down every side to the pebbles; foam where it lands.
  const water = clearFallMaterial();
  sink.fall(water);
  const thin = filmMaterial();
  sink.fall(thin);
  const bell = new THREE.Mesh(bellGeometry(waterY + 8.5, waterY + 0.1, s.top / 2 - 1.2), water);
  bell.renderOrder = 3;
  sink.object(bell);
  const core = new THREE.Mesh(filmGeometry([[0.2, waterY + 8.8], [0.45, waterY + 7.5], [0.55, waterY + 4], [0.5, waterY + 1.7]], 0, Math.PI * 2, 18), filmMaterial(3.5));
  sink.fall(core.material as THREE.ShaderMaterial);
  core.renderOrder = 3;
  sink.object(core);
  const boil = new THREE.Mesh(domeGeometry(2.6 * IN, 0.6 * IN, (waterY + 0.02) * IN), water);
  boil.renderOrder = 3;
  sink.object(boil);
  const lipDown = offsetOutline(lip.slice(0, 5), 0.12).reverse();
  const bodyDown = offsetOutline(outline, 0.3, 3).reverse().filter(([, y]) => y > 0.6);
  const down = [...lipDown, ...bodyDown].map(([r0, y]): [number, number] => [r0, y + base]);
  // A thin, even sheet over the glaze: kept faint so the glaze reads through it, wet.
  const sheet = filmMaterial(0.55);
  sink.fall(sheet);
  const film = new THREE.Mesh(filmGeometry(down, 0, Math.PI * 2, 96), sheet);
  film.renderOrder = 3;
  sink.object(film);
  foamRing(sink, s.foot / 2 + 0.5, s.foot / 2 + 4.5, s.bedTop + 0.4);

  // The 7 ft circle of black Mexican beach pebble over the hidden 4 ft vault.
  sink.add(plainMaterial('urn-basin-floor', { color: '#141311', roughness: 1 }), new THREE.CircleGeometry((s.bed[0] + 0.5) * IN, 48).rotateX(-Math.PI / 2).translate(0, (s.bedTop - 1.5) * IN, 0).toNonIndexed());
  sink.pebbles('mexican-beach-pebble-1-2', circleIn(s.bed[0], 64), [circleIn(s.foot / 2 + 0.3)], s.bedTop, [0.8, 0.74, 0.68]);
  if (choice.ring) paverRing(sink, s.bed[0], seed);

  // Tan granite boulders, as on the board: a big one and a smaller one at the front left, one at the back right.
  if (choice.boulders) {
    boulder(sink, GRANITE_TAN, -27, 16, [30, 24, 17], 0.5, `${seed}-big`);
    boulder(sink, GRANITE_TAN, -10, 30, [20, 16, 10], 1.9, `${seed}-small`);
    boulder(sink, GRANITE_TAN, 26, -16, [24, 19, 14], 2.7, `${seed}-back`);
  }

  // A warm uplight in the pebbles in front, aimed up the urn: a bronze bullet on its stake, its lens glowing at night.
  if (choice.uplight) {
    const bronze = plainMaterial('urn-uplight-bronze', { color: '#3a2f27', roughness: 0.4, metalness: 0.75 });
    const z0 = 21, y0 = s.bedTop + 1.2, tilt = 0.55;
    const dir = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt));
    const body = new THREE.CylinderGeometry(1.1 * IN, 1.1 * IN, 4 * IN, 16);
    body.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    body.translate(0, y0 * IN, z0 * IN);
    sink.add(bronze, body.toNonIndexed());
    sink.add(bronze, new THREE.CylinderGeometry(0.35 * IN, 0.35 * IN, 2 * IN, 8).translate(0, (y0 - 1.6) * IN, z0 * IN).toNonIndexed());
    const led = ledMaterial();
    sink.own(led);
    sink.glow(led);
    const lens = new THREE.CircleGeometry(0.9 * IN, 16);
    lens.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    lens.translate(dir.x * 2.02 * IN, (y0 + dir.y * 2.02) * IN, (z0 + dir.z * 2.02) * IN);
    sink.add(led, lens.toNonIndexed());
    // Its light on the urn's face, from just in front of it, warm 2700 K.
    sink.light(0, (s.bedTop + 14) * IN, 13 * IN, '#ffc283', 0.9, 2.2);
  }
}
