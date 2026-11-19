import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materialById, type MaterialSpec } from '../siteplan/catalog';
import { bounds, pointInPolygon, rng } from '../siteplan/geometry';
import { featureById } from '../siteplan/catalog';
import { steppingOf, stoneOutline, stoneTop } from '../siteplan/stepping';
import type { FeaturePlacement, SitePlan, Vec2 } from '../siteplan/types';
import { vnoise } from '../engine/noise';
import { rockAlbedo } from '../engine/surfaces';
import { paint, textureSet } from '../engine/textures';
import type { GroundModel } from './ground';
import type { Quality } from '../engine/post';

/**
 * Beds of loose stone or chips (a material with spec.pebble: Mexican beach pebble, river cobble, crushed gravel, bark and
 * wood chips), drawn piece by piece. `pebble.form` picks the pieces: smooth beach pebbles, rounded river rock and cobble,
 * angular crushed stone, flat wood chips, or bark nuggets (with a share of splinters among them).
 *
 * Every stone is one of a few smooth, slightly lopsided ovals, scaled to its own length, width and thickness from the
 * size range it is sold in, turned at random and tipped a little, and set in partly, so the bed reads as stones piled two
 * or three deep. Stones are grouped in 1.5 m tiles. Each frame (update) a tile shows its detailed stones close up, the
 * plainer shapes farther off, and nothing past the distance where its stones are only a pixel or two: there the
 * ground's own pebble texture (surfaces.ts) carries the bed, as it does in the gaps between stones.
 */

/** Stone shapes: icosphere detail for the near and the far look. */
const SHAPES = 6;
const TILE = 1.5;
const shapeCache = new Map<string, THREE.BufferGeometry>();

/**
 * A unit pebble (long side 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: an icosphere welded
 * into one smooth surface (so the shading has no facets) and pushed toward a rounded box, which after the stone's own
 * thinner scale gives the flat top, flatter bottom and full, rounded rim of a wave-worn beach pebble; a little egg-shaped
 * and lopsided, with the faintest dents. UVs are projected from above (no seam). Vertex color darkens toward the bottom,
 * where stones touch and shade each other, with very soft mottling.
 */
function pebbleShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`pebble${s}`);
  const egg = 0.04 + r() * 0.12, lop = (r() - 0.5) * 0.12, flatBottom = 0.12 + r() * 0.22, box = 2.2 + r() * 0.8;
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Onto a superellipsoid (exponent `box`): fuller where the rim turns, flatter across the faces.
    const sup = (Math.abs(v.x) ** box + Math.abs(v.y) ** box + Math.abs(v.z) ** box) ** (-1 / box);
    const k = sup * (1 + egg * v.x + lop * v.z * v.x + (vnoise(v.x * 2 + s * 7, v.z * 2 + v.y * 1.7, 1e6, s) - 0.5) * 0.035);
    let y = v.y * k;
    if (y < 0) y *= 1 - flatBottom;
    const x = v.x * 0.5 * k, z = v.z * 0.5 * k;
    y *= 0.5;
    p.setXYZ(i, x, y, z);
    uv[i * 2] = (x + y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (z + y * 0.7) * 1.4 + s * 0.17;
    const mott = vnoise(v.x * 3 + s, v.y * 3 + v.z * 2.5, 1e6, s + 3);
    const ao = 0.48 + 0.52 * Math.min(1, Math.max(0, (v.y + 0.45) / 1.0)) ** 0.8;
    const c = ao * (0.96 + mott * 0.06);
    col[i * 3] = c;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * A unit river rock or cobble (long side 1 along x before scaling), seed `s`: rounder and fuller than a beach pebble. An
 * icosphere welded smooth and pushed only a little toward a box (exponent near 2, an egg), egg-shaped and lopsided, with
 * broad lumps and a slightly flattened underside where it settled. Vertex color darkens toward the bottom, where stones
 * touch and shade each other, with soft mottling.
 */
function roundShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `river${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`river${s}`);
  const egg = 0.06 + r() * 0.14, lop = (r() - 0.5) * 0.18, flatBottom = 0.08 + r() * 0.14;
  const box = 2.0 + r() * 0.35;
  const lump = 0.05;
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const sup = (Math.abs(v.x) ** box + Math.abs(v.y) ** box + Math.abs(v.z) ** box) ** (-1 / box);
    const bumps = (vnoise(v.x * 1.6 + s * 5, v.z * 1.6 + v.y * 1.3, 1e6, s) - 0.5) * lump + (vnoise(v.x * 4 + s, v.y * 4 + v.z * 3, 1e6, s + 9) - 0.5) * 0.02;
    const k = sup * (1 + egg * v.x + lop * v.z * v.x + bumps);
    let y = v.y * k;
    if (y < 0) y *= 1 - flatBottom;
    const x = v.x * 0.5 * k, z = v.z * 0.5 * k;
    y *= 0.5;
    p.setXYZ(i, x, y, z);
    uv[i * 2] = (x + y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (z + y * 0.7) * 1.4 + s * 0.17;
    const mott = vnoise(v.x * 3 + s, v.y * 3 + v.z * 2.5, 1e6, s + 3);
    // Darker low down than a beach pebble: a fuller stone's lower half sits in the shade of the stones round it.
    const ao = 0.32 + 0.68 * Math.min(1, Math.max(0, (v.y + 0.5) / 1.05)) ** 1.1;
    const c = ao * (0.88 + mott * 0.2);
    col[i * 3] = c;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * River rock and cobble's skin, gray to multiply each stone's color: water-worn but not polished, a fine granular grain
 * with light and dark specks, faint bands of other mineral, matte to satin (dry stone).
 */
function riverMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('riverSkin2', () =>
    paint(512, 0.08, 1.5, (u, v) => {
      const fine = vnoise(u * 240, v * 240, 240, 41), coarse = vnoise(u * 40, v * 40, 40, 42), fleck = vnoise(u * 320, v * 320, 320, 43);
      const band = vnoise(u * 6 + coarse * 2, v * 22, 22, 44);
      // Granular stone: light and dark grains, broad blotches of weathering, and now and then a vein of other mineral.
      const light = fleck > 0.8 ? (fleck - 0.8) * 3.5 : 0, dark = fleck < 0.14 ? (0.14 - fleck) * 3 : 0;
      const vein = band > 0.8 ? (band - 0.8) * 1.2 : 0;
      const g = Math.min(1, 0.8 + fine * 0.1 + coarse * 0.14 + light * 0.4 - dark * 0.45 + vein * 0.5);
      return { h: 0.5 + fine * 0.16 + coarse * 0.12, c: [g, g, g], r: 0.68 + fine * 0.1 + coarse * 0.06 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.6, 0.6);
  return m;
}

/**
 * A unit bark nugget (long side 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: a flat plate
 * of bark broken along five to seven straight cracks (an angular outline), its top and bottom flat, the rim beveled a
 * little, the top a touch domed and tilted. Faceted (bark is rough, not worn smooth); the skin (nuggetMaterial) gives the
 * cork and fissures. Vertex color darkens toward the bottom.
 */
function nuggetShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `nugget${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const r = rng(`nugget${s}`);
  const K = 5 + Math.floor(r() * 3);
  let ring: [number, number][] = Array.from({ length: K }, (_, k) => {
    const a = ((k + (r() - 0.5) * 0.6) / K) * Math.PI * 2, rad = 0.36 + r() * 0.16;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  });
  // To a unit plate: 1 x 1 across.
  const xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
  const kx = 1 / (Math.max(...xs) - Math.min(...xs)), kz = 1 / (Math.max(...zs) - Math.min(...zs));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  ring = ring.map(([x, z]) => [(x - cx) * kx, (z - cz) * kz]);
  const tilt = (r() - 0.5) * 0.3, dome = 0.06 + r() * 0.1;
  // Rings from the bottom up: [inset, height]; the near shape bevels both rims, the far one only the top.
  const rings: [number, number][] = detail > 0 ? [[0.86, -0.5], [1, -0.28], [1, 0.3], [0.84, 0.5]] : [[1, -0.5], [1, 0.3], [0.84, 0.5]];
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  const P = (ri: number, k: number): [number, number, number] => {
    const [f, y] = rings[ri], [x, z] = ring[k % K];
    return [x * f, y + (y > 0 ? tilt * x : 0), z * f];
  };
  // Darker down the broken sides and underneath; the top's own tone wanders a little piece to piece.
  const topTone = 0.9 + r() * 0.15;
  const shade = (y: number) => (y > 0.4 ? topTone : 0.4 + 0.45 * Math.min(1, Math.max(0, (y + 0.55) / 1.1)) ** 0.8);
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    for (const q of [a, b, c]) {
      pos.push(q[0], q[1], q[2]);
      uv.push(q[0] * 1.3 + q[1] * 0.4 + s * 0.29, q[2] * 1.3 + q[1] * 0.7 + s * 0.13);
      const g = shade(q[1]);
      col.push(g, g, g);
    }
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < K; k++) {
      const a = P(ri, k), b = P(ri, k + 1), c = P(ri + 1, k + 1), d = P(ri + 1, k);
      tri(a, c, b);
      tri(a, d, c);
    }
  }
  const top: [number, number, number] = [0, 0.5 + dome, 0], bot: [number, number, number] = [0, -0.5, 0];
  for (let k = 0; k < K; k++) {
    tri(top, P(rings.length - 1, k + 1), P(rings.length - 1, k));
    tri(bot, P(0, k), P(0, k + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * The stones' skin, in gray to multiply each stone's color: wave-worn smooth with a soft satin sheen, fine light flecks
 * (the feldspar in the stone) and only a rare tiny pit. Hard and smooth, satin rather than glossy (dry stone).
 */
function pebbleMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('pebbleSkin3', () =>
    paint(512, 0.06, 1, (u, v) => {
      const fine = vnoise(u * 220, v * 220, 220, 12), fleck = vnoise(u * 300, v * 300, 300, 14), pit = vnoise(u * 90, v * 90, 90, 11);
      const light = fleck > 0.84 ? (fleck - 0.84) * 6 : 0, hole = pit > 0.93 ? 1 : 0;
      const g = Math.min(1, 0.86 + fine * 0.05 + light * 0.5 - hole * 0.12);
      return { h: 0.5 + fine * 0.08 - hole * 0.3, c: [g, g, g], r: 0.56 + fine * 0.08 + light * 0.08 + hole * 0.2 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.35, 0.35);
  return m;
}

/**
 * A unit piece of crushed stone (long side 1 along x before scaling), seed `s`: an icosphere broken by a handful of flat
 * cuts, so it has the flat fractured faces, sharp edges and blunt corners of quarried, crushed rock. Its faces stay flat
 * (no welding: crushed stone is faceted). Vertex color darkens toward the bottom, where pieces touch and shade each other.
 */
function crushedShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `crushed${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`crushed${s}`);
  // Each cut: a random direction and how far in from the surface the break runs.
  const cuts = Array.from({ length: 6 + Math.floor(r() * 4) }, () => {
    const n = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 1.3, r() - 0.5).normalize();
    return { n, d: 0.25 + r() * 0.15 };
  });
  const v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const c of cuts) {
      const t = v.dot(c.n) - c.d;
      if (t > 0) v.addScaledVector(c.n, -t);
    }
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.5; // a flatter underside, as a piece settles
    p.setXYZ(i, v.x, v.y, v.z);
    uv[i * 2] = (v.x + v.y * 0.4) * 1.4 + s * 0.31;
    uv[i * 2 + 1] = (v.z + v.y * 0.7) * 1.4 + s * 0.17;
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (v.y + 0.42) / 0.8)) ** 0.8;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/**
 * A unit wood chip (length 1 along x, width 1 along z, thickness 1 along y before scaling), seed `s`: a flat slab tapered
 * and torn at its ends, thinner at its edges, a little cupped and curled, with shallow ridges along the grain on top.
 * UVs run along its length, so the bark skin's grain follows the chip.
 */
function chipShape(s: number, detail: number): THREE.BufferGeometry {
  const key = `chip${s}:${detail}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const g = new THREE.BoxGeometry(1, 1, 1, detail > 0 ? 8 : 4, 1, detail > 0 ? 4 : 2);
  g.deleteAttribute('normal');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uvA = g.getAttribute('uv') as THREE.BufferAttribute;
  const r = rng(`chip${s}`);
  const curl = (r() - 0.5) * 0.3, cup = 0.04 + r() * 0.12, twist = (r() - 0.5) * 0.4, skew = (r() - 0.5) * 0.3;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(x * 2);
    // Blunt, torn ends (shredded wood is splintered square across, not pointed like a leaf), and sides that wander.
    const taper = 1 - 0.22 * ax ** 4;
    z *= taper * (0.82 + 0.36 * vnoise(x * 6 + s * 3.1, z * 2 + s, 1e6, s));
    if (ax > 0.7) x *= 1 + (vnoise(z * 9 + s * 1.7, s, 1e6, s + 2) - 0.5) * 0.45;
    x += z * skew;
    // Thinner toward the long edges; grain ridges on top.
    y *= 0.55 + 0.45 * (1 - (2 * z) ** 2);
    if (y > 0) y += Math.sin(z * Math.PI * (5 + (s % 3)) + s) * 0.06 * taper;
    // Cupped across, curled along its length, twisted a little.
    y += cup * (2 * z) ** 2 * 0.5 + curl * (2 * x) ** 2 * 0.5 + twist * x * z * 2;
    p.setXYZ(i, x, y, z);
    uvA.setXY(i, x * 1.2 + s * 0.37, z * 0.3 + s * 0.21);
    const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.5) / 1.0)) ** 0.7;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  shapeCache.set(key, g);
  return g;
}

/** Crushed stone's skin, gray to multiply each piece's color: a fresh, granular break with light and dark grains, matte. */
function crushedMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('crushedSkin1', () =>
    paint(512, 0.05, 2, (u, v) => {
      const grain = vnoise(u * 260, v * 260, 260, 21), coarse = vnoise(u * 60, v * 60, 60, 22), fleck = vnoise(u * 330, v * 330, 330, 23);
      const light = fleck > 0.86 ? (fleck - 0.86) * 5 : 0, dark = fleck < 0.1 ? (0.1 - fleck) * 4 : 0;
      const g = Math.min(1, 0.84 + grain * 0.08 + coarse * 0.06 + light * 0.5 - dark * 0.4);
      return { h: 0.5 + grain * 0.3 + coarse * 0.2, c: [g, g, g], r: 0.82 + grain * 0.1 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(0.7, 0.7);
  return m;
}

/** Wood chips' skin, gray to multiply each chip's color: fibrous grain along the chip, splintery, fully matte. */
function chipMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('chipSkin1', () =>
    paint(512, 0.08, 4, (u, v) => {
      const fiber = vnoise(u * 24, v * 320, 320, 31), fine = vnoise(u * 60, v * 900, 900, 32), blot = vnoise(u * 10, v * 30, 30, 33);
      const g = Math.min(1, 0.76 + fiber * 0.16 + fine * 0.08 + (blot - 0.5) * 0.12);
      return { h: fiber * 0.7 + fine * 0.3, c: [g, g, g], r: 0.9 + fine * 0.08 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.normalScale.set(0.8, 0.8);
  return m;
}

/**
 * Bark nuggets' skin, gray to multiply each piece's color: corky outer bark, blotchy and layered, with fine cracks
 * running one way and a few pale flecks where the cork is broken; fully matte.
 */
function nuggetMaterial(): THREE.MeshStandardMaterial {
  const set = textureSet('nuggetSkin2', () =>
    paint(512, 0.05, 3, (u, v) => {
      const cork = vnoise(u * 90, v * 90, 90, 51), layer = vnoise(u * 30, v * 160, 160, 52), crack = vnoise(u * 40, v * 420, 420, 53);
      const fleck = vnoise(u * 260, v * 260, 260, 54);
      const dark = crack < 0.18 ? (0.18 - crack) * 2.2 : 0, pale = fleck > 0.88 ? (fleck - 0.88) * 3 : 0;
      const g = Math.min(1, 0.78 + cork * 0.18 + (layer - 0.5) * 0.2 - dark * 1.4 + pale);
      return { h: 0.45 + cork * 0.3 + layer * 0.2 - dark * 0.8, c: [g, g, g], r: 0.93 + cork * 0.05 };
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0 });
  m.normalScale.set(1.3, 1.3);
  return m;
}

type Form = 'pebble' | 'crushed' | 'chip' | 'river' | 'nugget';
/**
 * Per form, on each piece's linear albedo (see placeStones). River rock is fuller than a beach pebble, so more of each
 * stone turns from the sun and they shade one another more: a little more gain (set by eye on the sample beds). Bark
 * nuggets lie flatter than shredded chips and shade one another less.
 */
const FORM_GAIN: Record<Form, [number, number, number]> = { pebble: [1, 1, 1], crushed: [1.45, 1.47, 1.6], chip: [2, 2, 2.2], river: [1.12, 1.12, 1.16], nugget: [2.6, 2.35, 2.5] };
const shapeOf = (form: Form, s: number, detail: number) => (form === 'crushed' ? crushedShape(s, detail) : form === 'chip' ? chipShape(s, detail) : form === 'river' ? roundShape(s, detail) : form === 'nugget' ? nuggetShape(s, detail) : pebbleShape(s, detail));
/** Bark splinters among nuggets: shapes past SHAPES, drawn as wood chips. */
const SPLINTER_SHAPES = 2;

export interface Stone {
  x: number;
  y: number;
  z: number;
  len: number;
  wid: number;
  thick: number;
  yaw: number;
  tipX: number;
  tipZ: number;
  color: THREE.Color;
  shape: number;
  /** How far the shape reaches from its center along an axis, as a share of its size, kept high (see pieceTop). */
  full?: number;
}

interface Tile {
  /** Nearest point of the tile to measure the camera from. */
  box: THREE.Box3;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  /** Past this the tile hides; under `nearTo` it shows its detailed stones. */
  nearTo: number;
  farTo: number;
}

/**
 * A bed of stones that is part of a feature (a water feature's pebble basin) rather than a plan zone: its outline and
 * holes in plan coordinates (meters), and the height of the surface the stones lie on.
 */
export interface PebbleBed {
  id: string;
  catalogId: string;
  polygon: Vec2[];
  holes: Vec2[][];
  y: number;
  /** Scale on the stones' colors, linear RGB (stone kept wet is darker). */
  tint?: [number, number, number];
  /** The surface's height at a point, when it is not flat at `y` (a poured pile). */
  heightAt?: (p: Vec2) => number;
}

/** Where one bed's stones go: inside test, surface height and extent. */
export interface BedArea {
  key: string;
  inside: (p: Vec2) => boolean;
  height: (p: Vec2) => number;
  polygon: Vec2[];
  tint: [number, number, number];
}

export interface PebbleBuild {
  object: THREE.Object3D | null;
  /** Show each tile's near or far stones, or none, for the camera about to draw. */
  update(cam: THREE.Camera): void;
  dispose(): void;
}

/**
 * Stones over every bed zone whose material has spec.pebble, where that zone is the top one, and over features' `beds`.
 * `onCurb(x, z, r)`, when given, is true where a piece of radius r centered at (x, z) would lie on a curb's body: those
 * pieces are left out (a curb is set on the bed side of a lawn edge, and its top stands above the chips).
 */
export function buildPebbles(plan: SitePlan, gm: GroundModel, quality: Quality, beds: PebbleBed[] = [], onCurb?: (x: number, z: number, r: number) => boolean): PebbleBuild {
  // Draft quality (the slowest devices) keeps the ground's pebble texture alone.
  const areas: { area: BedArea; catalogId: string }[] = quality === 'draft' ? [] : [
    ...plan.zones.filter((z) => materialById.get(z.catalogId)?.pebble).map((z) => ({
      catalogId: z.catalogId,
      area: { key: z.id, inside: (p: Vec2) => gm.zoneAt(p) === z, height: gm.height, polygon: z.polygon, tint: [1, 1, 1] as [number, number, number] },
    })),
    ...beds.filter((b) => materialById.get(b.catalogId)?.pebble).map((b) => ({
      catalogId: b.catalogId,
      area: { key: b.id, inside: (p: Vec2) => pointInPolygon(p, b.polygon) && !b.holes.some((h) => pointInPolygon(p, h)), height: b.heightAt ?? (() => b.y), polygon: b.polygon, tint: b.tint ?? ([1, 1, 1] as [number, number, number]) },
    })),
  ];
  if (!areas.length) return { object: null, update() {}, dispose() {} };
  const group = new THREE.Group();
  group.name = 'pebbles';
  const mats = new Map<Form, THREE.MeshStandardMaterial>();
  const matOf = (f: Form) => {
    let m = mats.get(f);
    if (!m) mats.set(f, (m = f === 'crushed' ? crushedMaterial() : f === 'chip' ? chipMaterial() : f === 'river' ? riverMaterial() : f === 'nugget' ? nuggetMaterial() : pebbleMaterial()));
    return m;
  };
  const tiles: Tile[] = [];
  const owned: THREE.InstancedMesh[] = [];
  const reach = quality === 'max' ? 1.25 : quality === 'balanced' ? 1 : 0.6;
  for (const { area, catalogId } of areas) {
    const spec = materialById.get(catalogId)!;
    const placed = clearOfSteppingStones(placeStones(area, spec), plan.features, gm.height);
    const stones = onCurb ? placed.filter((st) => !onCurb(st.x, st.z, Math.max(st.len, st.wid) * 0.5)) : placed;
    const P = spec.pebble!;
    const form: Form = P.form ?? 'pebble';
    const mat = matOf(form);
    // A bed of mixed sizes is drawn and faded by its typical stone (the sizes' middles, weighted by the area each covers).
    const avg = (P.mix ? P.mix.reduce((t, b) => t + b.share * (b.minIn + b.maxIn) / 2, 0) / P.mix.reduce((t, b) => t + b.share, 0) : (P.minIn + P.maxIn) / 2) * 0.0254;
    // Small stones get plainer shapes: their facets never show. Gravel under an inch is many pieces: the plainest shapes.
    const nearDetail = form === 'crushed' ? (avg < 0.015 ? 0 : 1) : avg < 0.03 ? 1 : 2;
    const farDetail = form === 'crushed' ? 0 : avg < 0.03 ? 0 : 1;
    const byTile = new Map<string, Stone[]>();
    for (const s of stones) {
      const k = `${Math.floor(s.x / TILE)},${Math.floor(s.z / TILE)}`;
      const list = byTile.get(k) ?? [];
      list.push(s);
      byTile.set(k, list);
    }
    for (const list of byTile.values()) {
      const box = new THREE.Box3();
      const near: THREE.InstancedMesh[] = [], far: THREE.InstancedMesh[] = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), e = new THREE.Euler();
      for (let sh = 0; sh < SHAPES + (P.splinters ? SPLINTER_SHAPES : 0); sh++) {
        const mine = list.filter((s) => s.shape === sh);
        if (!mine.length) continue;
        // Splinters among bark nuggets are wood chips.
        const splinter = sh >= SHAPES;
        const shapeAt = (detail: number) => (splinter ? chipShape(sh + 1, detail) : shapeOf(form, sh + 1, detail));
        const mt = splinter ? matOf('chip') : mat;
        // The near and the far mesh draw the same stones: they share one copy of the stones' places and colors.
        const a = new THREE.InstancedMesh(shapeAt(nearDetail), mt, mine.length);
        mine.forEach((s, i) => {
          e.set(s.tipX, s.yaw, s.tipZ, 'YXZ');
          q.setFromEuler(e);
          sc.set(s.len, s.thick, s.wid);
          t.set(s.x, s.y, s.z);
          m.compose(t, q, sc);
          a.setMatrixAt(i, m);
          a.setColorAt(i, s.color);
          box.expandByPoint(t);
        });
        const b = new THREE.InstancedMesh(shapeAt(farDetail), mt, mine.length);
        b.instanceMatrix = a.instanceMatrix;
        b.instanceColor = a.instanceColor;
        for (const [im, list2] of [[a, near], [b, far]] as [THREE.InstancedMesh, THREE.InstancedMesh[]][]) {
          im.name = `pebbles-${spec.id}`;
          // Cobble 2 in and up casts its own shadow (each stone shades the next, as the stones of a dry creek do);
          // smaller stones are too many and too small for the shadow map.
          im.castShadow = form === 'river' && avg >= 0.05;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          im.visible = false;
          group.add(im);
          owned.push(im);
          list2.push(im);
        }
      }
      box.expandByScalar(avg);
      // A stone stops showing at about 2 px on a 1,000 px view; the detailed shape matters only well inside that. Small
      // stones stay in 3D to 16 m at least: across a yard, at a low angle, the flat texture would read lighter than stones.
      // Gravel under an inch, and bark nuggets (a whole front yard of them), are too many pieces to draw across a yard:
      // they stay in 3D to about 7 m, then the texture.
      const farTo = (form === 'crushed' && avg < 0.015) || form === 'nugget' ? 7 : Math.max(avg * 520, 16);
      tiles.push({ box, near, far, nearTo: avg * 110 * reach, farTo: farTo * reach });
    }
  }
  const at = new THREE.Vector3();
  return {
    object: group,
    update(cam) {
      cam.getWorldPosition(at);
      for (const t of tiles) {
        const d = t.box.distanceToPoint(at);
        const showNear = d < t.nearTo, showFar = !showNear && d < t.farTo;
        for (const m of t.near) m.visible = showNear;
        for (const m of t.far) m.visible = showFar;
      }
    },
    dispose() {
      owned.forEach((m) => m.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/**
 * The stones of one bed: on a jittered grid about 0.7 of a stone apart (so they touch, overlap a little and pile, as poured stone
 * does), each with its own size from the sold range (more of the middle sizes), shape, turn, tip, color and how deep it
 * sits. Only where this zone is the top one. A bed of mixed sizes (spec.pebble.mix) is laid biggest first, each size on
 * its own grid over its share of the bed, the smaller stones then filling round the bigger ones.
 */
export function placeStones(z: BedArea, spec: MaterialSpec): Stone[] {
  const P = spec.pebble!;
  const form = P.form ?? 'pebble';
  const r = rng(`pebbles:${z.key}`);
  const IN = 0.0254;
  const flat = form === 'chip' || form === 'nugget';
  const bands = P.mix ? [...P.mix].sort((a, b) => b.maxIn - a.maxIn) : [{ minIn: P.minIn, maxIn: P.maxIn, share: 1 }];
  // Broken faces and stacked chips turn from the sun and shade one another far more than smooth pebbles do (the stone
  // grade was fitted on those): measured top-down in the default light, so the bed renders at its photo colors.
  // Gravel under half an inch shows more shaded gaps between its many pieces: a little more again.
  const avg0 = ((P.minIn + P.maxIn) / 2) * IN;
  const gain = FORM_GAIN[form].map((g) => g * (form === 'crushed' && avg0 < 0.012 ? 1.3 : 1)) as [number, number, number];
  const cols = P.colors.map((x) => new THREE.Color().setRGB(...(rockAlbedo(x.c).map((v, k) => v * gain[k]) as [number, number, number])));
  const cum: number[] = [];
  P.colors.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
  const out: Stone[] = [];
  // The bigger stones already laid, by cell, so the smaller ones fill round them rather than through them.
  const big = new Map<string, Stone[]>();
  const CELL = bands[0].maxIn * IN;
  const underBig = (p: Vec2) => {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const st of big.get(`${cx + i},${cy + j}`) ?? []) if (Math.hypot(p[0] - st.x, p[1] - st.z) < Math.min(st.len, st.wid) * 0.42) return true;
    }
    return false;
  };
  bands.forEach((band, bi) => {
    const last = bi === bands.length - 1;
    const avg = ((band.minIn + band.maxIn) / 2) * IN;
    // Pebbles and crushed stone: about 0.7 of a stone apart, so they touch and pile. Chips and bark are flat: spaced by
    // their area, a little overlapped, so they cover the ground in a layer or two.
    // River cobble (2 in and up) is fuller: a little farther apart, so the stones touch rather than run into one another.
    let step = flat ? avg * Math.sqrt((P.wide[0] + P.wide[1]) / 2) * 0.8 : avg * (form === 'river' && avg >= 0.05 ? 0.75 : 0.7);
    // At most about 400,000 pieces a bed (fine gravel over a big bed): past that they spread out and the ground texture,
    // the same pieces packed tight, fills between them.
    const b = bounds(z.polygon);
    const est = ((b.maxX - b.minX) * (b.maxY - b.minY)) / (step * step);
    if (est > 400000) step *= Math.sqrt(est / 400000);
    for (let y = b.minY; y < b.maxY; y += step) {
      for (let x = b.minX; x < b.maxX; x += step) {
        const p: Vec2 = [x + r() * step, y + r() * step];
        if (!z.inside(p)) continue;
        // A bigger size covers its share of the bed; the smallest fills the rest.
        if (bands.length > 1 && ((!last && r() > band.share) || (bi > 0 && underBig(p)))) continue;
        const u = (r() + r()) / 2;
        let len = (band.minIn + (band.maxIn - band.minIn) * u) * IN;
        // The whole stone stays inside the bed (behind its edging), not only its center.
        const reach = len * 0.45;
        if (!z.inside([p[0] + reach, p[1]]) || !z.inside([p[0] - reach, p[1]]) || !z.inside([p[0], p[1] + reach]) || !z.inside([p[0], p[1] - reach])) continue;
        let wid = len * (P.wide[0] + (P.wide[1] - P.wide[0]) * r());
        let thick = len * (P.thick[0] + (P.thick[1] - P.thick[0]) * r());
        const h = r();
        const ci = Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v));
        const color = cols[ci].clone().multiplyScalar(0.88 + r() * 0.24).multiply(new THREE.Color(...z.tint));
        // Pebbles lie flat-ish, a few stood on edge against their neighbors, sunk a fifth to a half of their thickness.
        // River rock tips more. Crushed stone lies any which way. Chips and bark lie flat in a loose layer, each at its own
        // height so none share a plane.
        const round = form === 'river';
        const steep = r() < (form === 'crushed' ? 0.35 : flat ? 0.06 : round ? 0.18 : 0.12);
        const tip = form === 'crushed' ? 1.4 : flat ? 0.3 : round ? 0.6 : 0.4;
        let shape = -1;
        // Bark: a share of long, thin splinters of wood among the nuggets.
        if (P.splinters && r() < P.splinters) {
          shape = SHAPES + Math.floor(r() * SPLINTER_SHAPES);
          len *= 1.6;
          wid = len * (0.1 + r() * 0.08);
          thick = len * (0.05 + r() * 0.03);
        }
        const py = flat ? z.height(p) + thick * 0.3 + r() * avg * 0.12 : z.height(p) + thick * (0.5 - (0.2 + r() * 0.3));
        const st: Stone = {
          x: p[0],
          y: py,
          z: p[1],
          len,
          wid,
          thick,
          yaw: r() * Math.PI * 2,
          tipX: (r() - 0.5) * (steep ? 1.1 : tip),
          tipZ: (r() - 0.5) * (steep ? 0.9 : tip * 0.9),
          color,
          shape: shape >= 0 ? shape : Math.floor(r() * SHAPES),
          // River rock is rounder and lumpier (roundShape): it reaches a little further out.
          ...(round ? { full: 0.68 } : {}),
        };
        out.push(st);
        if (!last) {
          const k = `${Math.floor(st.x / CELL)},${Math.floor(st.z / CELL)}`;
          const l = big.get(k) ?? [];
          l.push(st);
          big.set(k, l);
        }
      }
    }
  });
  return out;
}

/** A 24 in stepping pad's top above the ground (features.ts: a 0.06 m concrete pad on the ground). */
const PAD_TOP = 0.06;
/** How far in from the slab's edge a piece must reach to count as over its face (a pebble tucked under the edge stays). */
const FACE_INSET = 0.004;
/** Pieces centred inside the slab inset this far are always dropped. */
const CENTER_INSET = 0.01;

/**
 * Highest point of a piece, kept on the high side. The unit shapes reach 0.5 x their size times a fullness of up to about 1.12
 * (pebbleShape's superellipsoid, egg and lopsided terms) along each axis; they are drawn with the plain mesh (normal map
 * only: no displacement, no vertex or shader offset), so the mesh is the surface. The rise adds each axis's half-extent
 * times the sine of the tip about the other horizontal axis, with the thickness taken at its full tipped height.
 */
function pieceTop(st: Stone): number {
  const F = st.full ?? 0.56;
  const sx = Math.abs(Math.sin(st.tipX)), sz = Math.abs(Math.sin(st.tipZ));
  return st.y + F * (st.thick * Math.max(Math.cos(st.tipX) * Math.cos(st.tipZ), 0) + Math.max(st.len, st.wid) * (sx + sz));
}

/** Signed distance from a point to a closed outline: negative inside. */
function outlineDistance(x: number, z: number, pts: Vec2[]): number {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside;
    const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return inside ? -d : d;
}

/**
 * Drops the pieces that would show through a stepping stone's top: first every piece centred inside the stone's face
 * inset 1 cm (hidden under it when low, so dropping them costs nothing); then those whose footprint (a circle of the
 * piece's own reach, so it holds at any turn) overlaps the stone's face, inset a few mm, AND whose top rises above the
 * stone's top. Pieces lower than the stone that butt against or tuck under its edge stay, as do pieces centered outside
 * it that do not rise over its face. A slab or pad is its rectangle; a flagstone its own outline. Done after placing,
 * so every kept piece has exactly its place, size and color.
 */
export function clearOfSteppingStones(stones: Stone[], features: FeaturePlacement[], height: (p: Vec2) => number): Stone[] {
  const slabs = features.flatMap((f) => {
    const spec = featureById.get(f.catalogId);
    if (spec?.kind !== 'steppingStone' && spec?.kind !== 'steppingPad') return [];
    const a = (-f.rotationDeg * Math.PI) / 180;
    const outline: Vec2[] = spec.kind === 'steppingStone' ? stoneOutline(f, spec) : [[-spec.footprint[0] / 2, -spec.footprint[1] / 2], [spec.footprint[0] / 2, -spec.footprint[1] / 2], [spec.footprint[0] / 2, spec.footprint[1] / 2], [-spec.footprint[0] / 2, spec.footprint[1] / 2]];
    let far = 0;
    for (const [x, z] of outline) far = Math.max(far, Math.hypot(x, z));
    const top = height(f.position) + (spec.kind === 'steppingStone' ? stoneTop(steppingOf(spec).stone) : PAD_TOP);
    return [{ at: f.position, c: Math.cos(a), s: Math.sin(a), outline, far, top }];
  });
  if (!slabs.length) return stones;
  return stones.filter((st) => {
    const reach = Math.max(st.len, st.wid) * 0.5;
    let top: number | undefined;
    for (const k of slabs) {
      const dx = st.x - k.at[0], dy = st.z - k.at[1];
      if (Math.abs(dx) > k.far + reach || Math.abs(dy) > k.far + reach) continue;
      // Into the stone's own frame (the inverse of features.ts's local -> plan turn).
      const lx = dx * k.c - dy * k.s, lz = dx * k.s + dy * k.c;
      const d = outlineDistance(lx, lz, k.outline);
      if (d < -CENTER_INSET) return false;
      if (d + FACE_INSET >= reach) continue;
      if ((top ??= pieceTop(st)) > k.top) return false;
    }
    return true;
  });
}
