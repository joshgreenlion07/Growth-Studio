import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fbm, vnoise } from '../engine/noise';
import { paint, textureSet, type PBRSet } from '../engine/textures';
import { pbrMaterial, plainMaterial } from './materials';
import { spaEffects, type SpaEffects } from './spa-effects';

/*
 * Cal Spas Tropical Plus PPZ-743BC (Patio Plus series), drawn to Cal Spas' spec sheet and product page:
 * 84 x 84 x 37 in, 43 stainless jets, six seats with a raised cool-off seat, LED cascade waterfall, 5 in multi-color
 * LED spa light and perimeter LEDs, TP500 control panel, four Y-pillows, Cal Edge horizontal cabinet panels and a
 * 4 in to 2.5 in tapered cover.
 *
 * The seat layout, jets and fittings are placed from the maker's top view of the shell. The finish is the one Green Lion
 * installs and photographed: the Sterling Silver shell, the Cal Edge cabinet in Taupe (a brushed silver top band over two
 * warm gray wood-grain boards) with black molded corners (each with a tall recessed grip and a round port), a grey cover that
 * folds onto a side-mounted lifter and stands up behind the spa, and a black two-step with wave-pattern treads.
 * Proportions not published (lip, boards, corners, steps, lifter) are read from the installed photos.
 *
 * Local space: front (+z) is the control-panel side, where the steps go; the waterfall and the lifted cover are at the
 * back (-z); the cool-off seat is on the left (-x) and the filter on the right (+x). y is up from grade.
 */

const IN = 0.0254;

export type SpaCover = 'open' | 'closed' | 'off';
export interface SpaOptions {
  /** 'open': folded up on the lifter behind the spa (as installed); 'closed': on the spa; 'off': no cover or lifter. */
  cover: SpaCover;
  steps: boolean;
}

export interface SpaSink {
  /** Opaque parts, merged by material by the caller (they cast and take shadows). */
  add(m: THREE.Material, g: THREE.BufferGeometry): void;
  /** The water surface: its own transparent mesh. */
  water(m: THREE.Material, g: THREE.BufferGeometry): void;
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number): void;
  /** Height (meters) of the ground or deck under a local point, above the spa's base. Left out, level ground. */
  under?(x: number, z: number): number;
  /**
   * A part that can be shown or hidden by hand (the cover closed, the cover folded up): its own adder, and the object
   * to show. Left out, only the cover state asked for is built, into `add`. With a `pivot` (meters, spa space) the part's
   * object sits there and its geometry is given in the spa's space (it is moved to the pivot), so it can turn about it;
   * `own` hands over a geometry the builder made itself (and put into the object) to be disposed with the feature.
   */
  part?(key: string, pivot?: [number, number, number]): { add(m: THREE.Material, g: THREE.BufferGeometry): void; object: THREE.Object3D; own(g: THREE.BufferGeometry, mesh?: THREE.Mesh): void };
  /** A moving effect (the jets' bubbles and steam): added as it is, hidden until the jets run. */
  effect?(m: THREE.Mesh): void;
}

/** What can be used by hand on the spa (builder/actions.ts). Anchors are local points in meters. */
export interface SpaControls {
  /** The cover: open (folded up on the lifter behind the spa) or closed on the spa. Null without a cover. */
  cover: { open: boolean; set(open: boolean, instant?: boolean): void; tick?(dt: number): boolean; anchors(open: boolean): [number, number, number][] } | null;
  /** The jets: bubbles on the water and steam off it while the cover is open. */
  jets: { set(on: boolean): void; frame(dt: number): void; anchors: [number, number, number][] };
  /** The spa light and its glow in the water (the night light itself is the caller's). */
  lights: { set(on: boolean): void; anchors: [number, number, number][] };
}

/* ------------------------------------------------------------------ */
/* Dimensions (inches)                                                  */
/* ------------------------------------------------------------------ */

const H = 37; // top of the shell lip
const HALF = 42; // shell lip, half of 84 in
const LIP_R = 4.5; // plan radius of the lip's corners
const OPEN = 37.5; // half width of the opening in the shell
const OPEN_R = 12; // plan radius of the opening's corners
const WATER = 4.5; // water line below the lip
const FLOOR = 33; // footwell floor below the lip
const CAB = 41.5; // outer face of the cabinet boards
const CAB_R = 5; // cabinet corner radius
const SKIRT = 3.6; // lip skirt depth at the middle of a side; deeper toward the corners

// Cover lifter, read from the installed photo: pivots on brackets at the back corners, 9 in under the lip, and 45.6 in
// arms. Closed, the bar lies across the cover at its fold; lifted, the cover hangs folded from the bar, its top about
// 38 in above the lip and its spa side just behind the lip. [z, y]
const PIVOT: [number, number] = [-43, H - 9];
const BAR_UP: [number, number] = [-46, H + 36.5];
const ARM = Math.hypot(BAR_UP[0] - PIVOT[0], BAR_UP[1] - PIVOT[1]);
const COVER_T0 = 4, COVER_T1 = 2.5; // taper: at the hinge, at the outer edge
const coverT = (d: number) => COVER_T0 - ((COVER_T0 - COVER_T1) * Math.min(Math.abs(d), HALF)) / HALF;

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Value noise in [0, 1] that tiles with its own whole period along each axis (vnoise shares one period for both). */
function tiled(x: number, y: number, px: number, py: number, seed: number): number {
  const h = (ix: number, iy: number) => {
    let k = (((ix % px) + px) % px) * 374761393 + (((iy % py) + py) % py) * 668265263 + seed * 2147483647;
    k = Math.imul(k ^ (k >>> 13), 1274126177);
    return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
  };
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const f = (t: number) => t * t * (3 - 2 * t);
  const fx = f(x - x0), fy = f(y - y0);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Sterling Silver acrylic: a pearly silver with soft, wide marbling. */
function shellSet(): PBRSet {
  return textureSet('ppz-sterling', () =>
    paint(512, 0.9, 0.6, (u, v) => {
      const w = fbm(u, v, 3, 5, 71);
      const band = 0.5 + 0.5 * Math.sin((u * 2 + v + w * 2.4) * Math.PI * 2);
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + w * 3.1 + v * 1) * Math.PI * 2)), 18);
      const k = 0.9 + band * 0.07 + vein * 0.08 - fbm(u, v, 8, 3, 5) * 0.05;
      return { h: band * 0.2, c: [0.42 * k, 0.43 * k, 0.445 * k], r: 0.11 + vein * 0.03 };
    }),
  );
}

/*
 * Cabinet colors from Cal Spas' Cal Edge swatches. Upright faces use the engine's wall calibration (WALL_GAIN in
 * engine/surfaces.ts: rendered linear = gain * albedo in the default light), so each texture's average albedo is the
 * swatch photo's average divided by that gain.
 */
const UPRIGHT_GAIN = [1.68, 1.77, 2.0];
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const uprightMean = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => lin(c / 255) / UPRIGHT_GAIN[i]) as [number, number, number];
};
/** The installed boards match the Taupe swatch (average #746861); the band is the brushed silver (#b2b2b4). */
const BOARD_SWATCH = '#746861', BAND_SWATCH = '#b2b2b4';

/** Cal Edge board: warm gray with a fine, long wood grain running along the board. */
function boardSet(): PBRSet {
  return textureSet('ppz-taupe', () =>
    paint(512, 1.6, 2.2, (u, v) => {
      const warp = fbm(u, v, 2, 3, 13) * 0.04;
      const grain = tiled(u * 6, (v + warp) * 160, 6, 160, 21) * 0.55 + tiled(u * 18, (v + warp) * 420, 18, 420, 22) * 0.45;
      const streak = fbm(u, v * 8, 4, 4, 23);
      const k = 0.86 + grain * 0.12 + (streak - 0.5) * 0.18;
      return { h: grain * 0.6 + streak * 0.4, c: [0.45 * k, 0.4 * k, 0.37 * k], r: 0.62 + grain * 0.18 };
    }, uprightMean(BOARD_SWATCH)),
  );
}

/** The brushed silver top band of the Cal Edge panel. */
function bandSet(): PBRSet {
  return textureSet('ppz-band', () =>
    paint(256, 0.8, 0.5, (u, v) => {
      const brush = tiled(u * 4, v * 96, 4, 96, 31) * 0.6 + tiled(u * 10, v * 160, 10, 160, 32) * 0.4;
      const k = 0.92 + brush * 0.1;
      return { h: brush * 0.15, c: [0.6 * k, 0.6 * k, 0.61 * k], r: 0.38 + brush * 0.1 };
    }, uprightMean(BAND_SWATCH)),
  );
}

/** Step tread: black molded plastic with long raised waves. 0.45 m tile: 8 waves deep (about 2 1/4 in apart), one slow swing across. */
function treadSet(): PBRSet {
  return textureSet('ppz-tread', () =>
    paint(512, 0.45, 1.3, (u, v) => {
      const s = Math.sin((v * 8 + 0.38 * Math.sin(u * Math.PI * 2) + 0.06 * Math.sin(u * 3 * Math.PI * 2)) * Math.PI * 2);
      const ridge = smooth(-0.5, 0.8, s);
      const speck = vnoise(u * 120, v * 120, 120, 41);
      const k = 0.92 + ridge * 0.12 + speck * 0.04;
      return { h: ridge, c: [0.14 * k, 0.145 * k, 0.155 * k], r: 0.5 };
    }),
  );
}

/** Step riser: black with the vertical slat grooves of the step's sides. */
function riserSet(): PBRSet {
  return textureSet('ppz-riser', () =>
    paint(256, 0.3, 3, (u, v) => {
      const slat = (u * 3) % 1;
      const groove = slat < 0.025 ? 0 : 1;
      const grain = tiled(u * 8, v * 60, 8, 60, 51);
      const k = (0.85 + grain * 0.1) * (groove ? 1 : 0.82);
      return { h: groove, c: [0.13 * k, 0.13 * k, 0.135 * k], r: 0.6 };
    }),
  );
}

interface Mats {
  shell: THREE.MeshStandardMaterial;
  board: THREE.MeshStandardMaterial;
  band: THREE.MeshStandardMaterial;
  corner: THREE.MeshStandardMaterial;
  port: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  pillow: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  nozzle: THREE.MeshStandardMaterial;
  bezel: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  filter: THREE.MeshStandardMaterial;
  recess: THREE.MeshStandardMaterial;
  badge: THREE.MeshStandardMaterial;
  cover: THREE.MeshStandardMaterial;
  skirt: THREE.MeshStandardMaterial;
  lifter: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  riser: THREE.MeshStandardMaterial;
  stepFrame: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  led: THREE.MeshStandardMaterial;
}

/** The spa's light: Cal Spas' multi-color LEDs, shown in their blue. */
const LED = '#3aa6ff';

function waterGlowMap(): THREE.DataTexture {
  // Brightest over the 5 in spa light in the footwell's back wall, falling off toward the walls, with a faint ripple.
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      const d = Math.hypot(u - 0.5, (v - 0.4) * 1.1);
      const core = Math.exp(-((d / 0.2) ** 2));
      const edge = smooth(0.62, 0.44, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 1.25);
      const ripple = vnoise(u * 9, v * 9, 9, 61) * 0.12;
      const k = Math.min(1, (0.22 + 0.62 * core + ripple) * (0.5 + 0.5 * edge));
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(k * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

let glowMap: THREE.DataTexture | null = null;

function materials(): Mats {
  const water = plainMaterial('ppz-water', {
    color: '#2e4146', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.3,
    emissive: new THREE.Color('#2b8fe0'), emissiveIntensity: 0,
  });
  if (!water.emissiveMap) {
    glowMap ??= waterGlowMap();
    water.emissiveMap = glowMap;
    water.needsUpdate = true;
  }
  return {
    shell: pbrMaterial('ppz-shell', shellSet(), { metalness: 0.86 }),
    board: pbrMaterial('ppz-board', boardSet()),
    band: pbrMaterial('ppz-band', bandSet(), { metalness: 0.15 }),
    corner: plainMaterial('ppz-corner', { color: '#1b1b1d', roughness: 0.5, metalness: 0.05 }),
    port: plainMaterial('ppz-port', { color: '#18181a', roughness: 0.3, metalness: 0.2 }),
    grip: plainMaterial('ppz-grip', { color: '#121213', roughness: 0.85 }),
    pillow: plainMaterial('ppz-pillow', { color: '#1c1c1e', roughness: 0.42 }),
    steel: plainMaterial('ppz-steel', { color: '#c9cdd1', roughness: 0.2, metalness: 0.95 }),
    nozzle: plainMaterial('ppz-nozzle', { color: '#2c2e31', roughness: 0.35, metalness: 0.6 }),
    bezel: plainMaterial('ppz-bezel', { color: '#2f3134', roughness: 0.35, metalness: 0.3 }),
    screen: plainMaterial('ppz-screen', { color: '#7f9aa6', roughness: 0.15, metalness: 0.1 }),
    filter: plainMaterial('ppz-filter', { color: '#c4c7c8', roughness: 0.5 }),
    recess: plainMaterial('ppz-recess', { color: '#55585b', roughness: 0.25, metalness: 0.3 }),
    badge: plainMaterial('ppz-badge', { color: '#2b5aa6', roughness: 0.3, metalness: 0.3 }),
    cover: plainMaterial('ppz-cover', { color: '#8f9294', roughness: 0.8 }),
    skirt: plainMaterial('ppz-skirt', { color: '#46494c', roughness: 0.8, side: THREE.DoubleSide }),
    lifter: plainMaterial('ppz-lifter', { color: '#1d1e20', roughness: 0.42, metalness: 0.55 }),
    tread: pbrMaterial('ppz-tread', treadSet()),
    riser: pbrMaterial('ppz-riser', riserSet()),
    stepFrame: plainMaterial('ppz-step', { color: '#242527', roughness: 0.6 }),
    water,
    led: plainMaterial('ppz-led', { color: '#6ab4e2', emissive: new THREE.Color('#7cc8ff'), emissiveIntensity: 0, roughness: 0.25 }),
  };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (inches in, meters out)                             */
/* ------------------------------------------------------------------ */

interface PathPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** 1 on a corner, falling off along the sides. */
  corner: number;
}

/**
 * A closed path round a rounded square (half size h, corner radius r), counterclockwise from +x toward +z, starting at
 * the middle of the +x side. Every side is sampled the same way (nS points on each half side, nA on the corner), so two
 * paths of different sizes have matching points.
 */
function squarePath(h: number, r: number, nS: number, nA: number, fall = 9): PathPt[] {
  const a = h - r;
  const out: PathPt[] = [];
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 2, c = Math.cos(t), s = Math.sin(t);
    const put = (lx: number, lz: number, nx: number, nz: number, corner: number) =>
      out.push({ x: lx * c - lz * s, z: lx * s + lz * c, nx: nx * c - nz * s, nz: nx * s + nz * c, corner });
    for (let i = 0; i < nS; i++) {
      const lz = (a * i) / nS;
      put(h, lz, 1, 0, Math.exp(-(((a - lz) / fall) ** 2)));
    }
    for (let i = 0; i < nA; i++) {
      const p = ((i / nA) * Math.PI) / 2;
      put(a + r * Math.cos(p), a + r * Math.sin(p), Math.cos(p), Math.sin(p), 1);
    }
    for (let i = 0; i < nS; i++) {
      const lx = a - (a * i) / nS;
      put(lx, h, 0, 1, Math.exp(-(((a - lx) / fall) ** 2)));
    }
  }
  return out;
}

/**
 * An indexed grid surface: `cols` points round (closed when `closed`) by `rows` points, positions in inches. The face
 * normal is d/dcol x d/drow; `flip` reverses it. UVs come from `uv` (meters).
 */
function gridSurface(
  cols: number,
  rows: number,
  closed: boolean,
  at: (i: number, j: number) => [number, number, number],
  uv: (p: [number, number, number], i: number, j: number) => [number, number],
  flip = false,
  skip?: (i: number, j: number) => boolean,
): THREE.BufferGeometry {
  const pos = new Float32Array(cols * rows * 3), uvs = new Float32Array(cols * rows * 2);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = at(i, j), k = j * cols + i;
      pos.set([p[0] * IN, p[1] * IN, p[2] * IN], k * 3);
      uvs.set(uv(p, i, j), k * 2);
    }
  }
  const idx: number[] = [];
  const ic = closed ? cols : cols - 1;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < ic; i++) {
      if (skip?.(i, j)) continue;
      const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + ((i + 1) % cols), d = (j + 1) * cols + i;
      if (flip) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const planUV = (p: [number, number, number]): [number, number] => [p[0] * IN, p[2] * IN];

/** A tube between two points (inches). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 10): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r * IN, r * IN, d.length() * IN, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(((a.x + b.x) / 2) * IN, ((a.y + b.y) / 2) * IN, ((a.z + b.z) / 2) * IN);
  return g;
}

/** A disc-like part (cylinder of radius r, thickness t) standing out of a surface at p along normal n (inches). */
function boss(p: THREE.Vector3, n: THREE.Vector3, r: number, t: number, seg = 16, r1 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1 * IN, r * IN, t * IN, seg, 1);
  g.translate(0, (t / 2) * IN, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize()));
  g.translate(p.x * IN, p.y * IN, p.z * IN);
  return g;
}

/** Flat-shaded quads (inches), each turned to face `out`. */
function quads(list: { p: THREE.Vector3[]; out: THREE.Vector3 }[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  for (const { p, out } of list) {
    const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
    const q = n.dot(out) < 0 ? [p[0], p[3], p[2], p[1]] : p;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(q[k].x * IN, q[k].y * IN, q[k].z * IN);
      uv.push((q[k].x + q[k].z) * IN, q[k].y * IN);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Signed volume of a closed non-indexed mesh: positive when its faces turn outward. */
function signedVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.cross(c));
  }
  return v / 6;
}

/** Reverse every triangle of a non-indexed mesh (positions and UVs). */
function flipFaces(g: THREE.BufferGeometry) {
  for (const name of ['position', 'uv']) {
    const at = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!at) continue;
    const n = at.itemSize, arr = at.array as Float32Array;
    for (let i = 0; i + 2 < at.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
    at.needsUpdate = true;
  }
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w * IN, h * IN, d * IN);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return g;
}

/** Box UVs in meters for a box built by boxAt (local axes). */
function boxUVm(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.6) uv.set([p.getX(i), p.getZ(i)], i * 2);
    else if (ax > 0.6) uv.set([p.getZ(i), p.getY(i)], i * 2);
    else uv.set([p.getX(i), p.getY(i)], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/* ------------------------------------------------------------------ */
/* The shell's seats: depth below the lip as a field over the opening  */
/* ------------------------------------------------------------------ */

// The seats as set out on the maker's top view (inches; x right toward the filter, z toward the control panel). Each is a
// pan sunk into a ring of armrests about 12 1/2 in under the lip: four corner buckets, a bench under the waterfall and
// one in front, the raised cool-off seat on the left, and a step round the filter on the right.
interface Seat {
  /** Center and half sizes of the pan in plan, and how far its edge rounds off. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  soft: number;
  /** Depth of the pan below the lip. */
  pan: number;
  /** Round (bucket) or rectangular (platform). */
  round: boolean;
}
const RING = 13;
const SEATS: Seat[] = [
  { x: -23, z: -23, hx: 10, hz: 10, soft: 5.5, pan: 19, round: true },
  { x: 23, z: -23, hx: 10, hz: 10, soft: 5.5, pan: 19, round: true },
  { x: -23, z: 23, hx: 10, hz: 10, soft: 5.5, pan: 19, round: true },
  { x: 23, z: 23, hx: 10, hz: 10, soft: 5.5, pan: 19, round: true },
  { x: 0, z: -24, hx: 8, hz: 6.5, soft: 5, pan: 17, round: true },
  { x: 0, z: 24, hx: 8, hz: 6.5, soft: 5, pan: 17.5, round: true },
  { x: -31, z: 0.3, hx: 6.5, hz: 8.4, soft: 3, pan: 10, round: false },
  { x: 29, z: 0, hx: 9.5, hz: 9.5, soft: 3, pan: 14, round: false },
];
// Back slope of the walls (inches of depth per inch in from the lip): reclined seat backs in the corners and behind the
// benches, nearly upright behind the cool-off seat and the filter.
const BACKS: { at: number; back: number }[] = [
  { at: 0, back: 2.4 },
  { at: Math.PI / 2, back: 1.35 },
  { at: Math.PI, back: 3.2 },
  { at: -Math.PI / 2, back: 1.35 },
];
const CORNER_BACK = 1.15;
const SIDE_HALF = (20 * Math.PI) / 180;
// The footwell: its floor 13 in in radius, its wall reaching the seats at 15 in (about 30 in across, as on the maker's view).
const WELL_IN = 13, WELL_OUT = 15.2;

const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/** Depth below the lip (inches) at (x, z), `e` inches in from the opening's edge. */
function seatDepth(x: number, z: number, e: number): number {
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  let surf = RING;
  for (const s of SEATS) {
    const dx = Math.abs(x - s.x) - s.hx, dz = Math.abs(z - s.z) - s.hz;
    const sd = s.round
      ? Math.hypot((x - s.x) / s.hx, (z - s.z) / s.hz) * Math.min(s.hx, s.hz) - Math.min(s.hx, s.hz)
      : Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
    const w = smooth(s.soft, 0, sd);
    // Buckets dish a little deeper toward their middle.
    const dish = s.round ? 1.2 * smooth(0, -Math.min(s.hx, s.hz), sd) : 0;
    surf += (s.pan + dish - surf) * w;
  }
  const well = FLOOR + (surf - FLOOR) * smooth(WELL_IN, WELL_OUT, r);
  let back = CORNER_BACK;
  for (const b of BACKS) back += (b.back - back) * smooth(SIDE_HALF + 0.07, SIDE_HALF - 0.07, Math.abs(angDiff(th, b.at)));
  // The walls drop steeply for the first couple of inches under the lip, then lean back as seat backs.
  return smin(well, 0.5 + 4.2 * (1 - Math.exp(-e / 0.8)) + e * back, 2.5);
}

/** The opening's edge as a closed path (points match the lip's inner edge). */
const NS = 18, NA = 12;
function openingPath(): PathPt[] {
  return squarePath(OPEN, OPEN_R, NS, NA);
}

interface Basin {
  /** Shell surface point and normal (inches) at a plan point inside the opening. */
  at(x: number, z: number): { p: THREE.Vector3; n: THREE.Vector3 };
}

function basinField(edge: PathPt[]): Basin {
  // Distance in from the edge, measured along the ray from the center (as the basin mesh is built).
  const rayLen = (th: number) => {
    // The edge path is convex and star-shaped about the center: find the point nearest in angle.
    let best = edge[0], bd = 9;
    for (const q of edge) {
      const d = Math.abs(angDiff(Math.atan2(q.z, q.x), th));
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return Math.hypot(best.x, best.z);
  };
  const depth = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    return seatDepth(x, z, Math.max(0, rayLen(Math.atan2(z, x)) - r));
  };
  return {
    at(x, z) {
      const d = depth(x, z), h = 0.15;
      const dx = (depth(x + h, z) - depth(x - h, z)) / (2 * h);
      const dz = (depth(x, z + h) - depth(x, z - h)) / (2 * h);
      // Surface y = H - depth: the normal is (d depth/dx, 1, d depth/dz) normalized.
      return { p: new THREE.Vector3(x, H - d, z), n: new THREE.Vector3(dx, 1, dz).normalize() };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Builder                                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds the spa into `sink` (W x D footprint in meters, 84 in square). Returns the materials that glow at night and the
 * controls for using it by hand.
 */
export function calSpaTropicalPlus(W: number, D: number, opt: SpaOptions, sink: SpaSink): { glow: THREE.MeshStandardMaterial[]; controls: SpaControls } {
  const m = materials();
  // The spa is drawn at its catalog size; a footprint changed in the catalog scales it.
  const sx = W / (2 * HALF * IN), sz = D / (2 * HALF * IN);
  const add = (mat: THREE.Material, g: THREE.BufferGeometry) => {
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
    sink.add(mat, g);
  };
  const edge = openingPath();
  const basin = basinField(edge);

  shellLip(m, add, edge);
  shellBasin(m, add, edge);
  fittings(m, add, basin);
  cabinet(m, add);
  if (opt.steps) {
    // The steps stand on whatever is in front of the spa: the ground, or the boards of a deck the spa is set into.
    const lift = Math.max(0, sink.under?.(STEP_CX * IN * sx, (CAB + 13) * IN * sz) ?? 0);
    steps(m, (mat, g) => add(mat, g.translate(0, lift, 0)));
  }
  // The jets' bubbles and steam (made with the water below) show while the jets run and the cover is open.
  let jetsOn = false;
  let coverFade = opt.cover === 'closed' ? 0 : 1; // how far the cover has cleared the water (0 on it, 1 well clear): the jets' effects fade with it
  let effects: SpaEffects | null = null;
  // The cover: with parts to show and hide, both states are built (the closed cover and the folded one) and the hand
  // switches between them; the lifter's brackets stay put.
  let coverOpen = opt.cover !== 'closed';
  let cover: SpaControls['cover'] = null;
  if (opt.cover !== 'off' && sink.part) {
    const pts = (list: [number, number, number][]): [number, number, number][] => list.map(([x, y, z]) => [x * IN * sx, y * IN, z * IN * sz]);
    const anchors: NonNullable<SpaControls['cover']>['anchors'] = (open) => open
      ? pts([[0, H + 18, -46], [0, H + 36.5, -46], [-30, H + 18, -46], [30, H + 18, -46]])
      : pts([-28, 0, 28].flatMap((x) => [-28, 0, 28].map((z): [number, number, number] => [x, H + 4.5, z])));
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sz - 1) < 1e-6) {
      // The cover moves: it folds about its hinge and lifts on the lifter arms (see coverRig).
      lifterBrackets(m, add);
      const rig = coverRig(m, sink, coverOpen, (level) => {
        coverFade = level;
        effects?.level(jetsOn ? level : 0);
      });
      cover = {
        open: coverOpen,
        set(open, instant) {
          coverOpen = open;
          cover!.open = open;
          rig.set(open, instant);
        },
        tick: (dt) => rig.tick(dt),
        anchors,
      };
    } else {
      // A resized footprint (the pose is not rigid when the plan is stretched): both poses built, the hand switches them.
      const scaled = (to: (m: THREE.Material, g: THREE.BufferGeometry) => void) => (mat: THREE.Material, g: THREE.BufferGeometry) => {
        if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
        to(mat, g);
      };
      const up = sink.part('cover-open'), down = sink.part('cover-closed');
      coverAndLifter(m, scaled(up.add), true, add);
      coverAndLifter(m, scaled(down.add), false, null);
      cover = {
        open: coverOpen,
        set(open) {
          coverOpen = open;
          cover!.open = open;
          coverFade = open ? 1 : 0;
          up.object.visible = open;
          down.object.visible = !open;
          effects?.level(jetsOn ? coverFade : 0);
        },
        anchors,
      };
    }
    cover.set(coverOpen, true);
  } else if (opt.cover !== 'off') coverAndLifter(m, add, opt.cover === 'open');

  // Water, a little below the lip, glowing from the spa light at night: a fan from the middle out to the opening's edge.
  const wp = squarePath(OPEN - 0.05, OPEN_R, NS, NA);
  const wy = (H - WATER) * IN;
  const wpos = [0, wy, 0, ...wp.flatMap((q) => [q.x * IN, wy, q.z * IN])];
  const wuv = [0.5, 0.5, ...wp.flatMap((q) => [q.x / (2 * OPEN) + 0.5, q.z / (2 * OPEN) + 0.5])];
  const widx: number[] = [];
  for (let i = 0; i < wp.length; i++) widx.push(0, 1 + ((i + 1) % wp.length), 1 + i);
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  water.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  water.setIndex(widx);
  water.computeVertexNormals();
  if (sx !== 1 || sz !== 1) water.scale(sx, 1, sz);
  // The jets' bubbles and steam, on the water.
  effects = sink.effect ? spaEffects(water, new THREE.Vector3(0, wy, 0), OPEN * IN * Math.min(sx, sz)) : null;
  for (const e of effects?.meshes ?? []) sink.effect!(e);
  sink.water(m.water, water);
  // The 5 in spa light, low in the footwell: lights the shell and the water from inside.
  sink.light(0, (H - 24) * IN, -10 * IN * sz, LED, 1.9, 3.2);
  const ring = (r: number, y: number) => Array.from({ length: 8 }, (_, k): [number, number, number] => [Math.cos((k * Math.PI) / 4) * r * IN * sx, y * IN, Math.sin((k * Math.PI) / 4) * r * IN * sz]);
  const controls: SpaControls = {
    cover,
    jets: {
      set(on) {
        jetsOn = on;
        effects?.level(on ? coverFade : 0);
      },
      frame: (dt) => effects?.frame(dt),
      anchors: ring(27, H - 16),
    },
    lights: {
      set(on) {
        m.water.userData.off = !on;
        m.led.userData.off = !on;
      },
      anchors: [[0, (H - FLOOR) * IN, 0], [0, (H - 24) * IN, -10 * IN * sz], [0, (H - 26) * IN, 10 * IN * sz]],
    },
  };
  return { glow: [m.water, m.led], controls };
}

/** The shell's lip: inner round-over, flat deck, outer bullnose and the skirt that dips over the cabinet corners. */
function shellLip(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void, inner: PathPt[]) {
  const outer = squarePath(HALF, LIP_R, NS, NA, 10);
  type Prof = (q: PathPt, p: PathPt) => [number, number, number];
  const lerpP = (q: PathPt, p: PathPt, t: number, y: number): [number, number, number] => [q.x + (p.x - q.x) * t, y, q.z + (p.z - q.z) * t];
  const off = (p: PathPt, o: number, y: number): [number, number, number] => [p.x + p.nx * o, y, p.z + p.nz * o];
  const skirt = (p: PathPt) => SKIRT + 1.9 * p.corner;
  const R = 1.1;
  const prof: Prof[] = [
    (q, p) => lerpP(q, p, 0, H - 0.5),
    (q, p) => lerpP(q, p, 0.035, H - 0.12),
    (q, p) => lerpP(q, p, 0.1, H),
    (q, p) => lerpP(q, p, 0.5, H + 0.05),
    (_q, p) => off(p, -R, H),
    ...[0.25, 0.5, 0.75, 1].map((t) => (_q: PathPt, p: PathPt) => {
      const a = (t * Math.PI) / 2;
      return off(p, -R + R * Math.sin(a), H - R + R * Math.cos(a));
    }),
    (_q, p) => off(p, 0.04, H - R - 0.4 * (skirt(p) - R)),
    (_q, p) => off(p, 0, H - skirt(p) + 0.3),
    (_q, p) => off(p, -0.12, H - skirt(p)),
    (_q, p) => off(p, -0.5, H - skirt(p) + 0.06),
  ];
  add(m.shell, gridSurface(outer.length, prof.length, true, (i, j) => prof[j](inner[i], outer[i]), planUV));
}

/** The seats, footwell and inner walls, as one surface from the center out to the lip's inner edge. */
function shellBasin(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void, edge: PathPt[]) {
  // Rings from the center out: closer together across the footwell's wall and the seats' fronts (about a quarter to
  // three fifths of the way out) and near the lip where the walls are.
  const set = new Set<number>();
  for (let k = 1; k <= 44; k++) set.add(+(Math.pow(k / 44, 0.9) * 0.965).toFixed(4));
  for (let k = 0; k <= 48; k++) set.add(+(0.24 + (0.38 * k) / 48).toFixed(4));
  for (const u of [0.975, 0.984, 0.991, 0.996, 1]) set.add(u);
  const rings = [...set].sort((p, q) => p - q).filter((u, i, a) => i === 0 || u - a[i - 1] > 0.002);
  const n = edge.length;
  const len = edge.map((q) => Math.hypot(q.x, q.z));
  // Round rings out to just past the footwell (so its wall runs along them, with no facets across it in the mirror-like
  // acrylic), then blending out to the opening's rounded square.
  const RC = 17, UC = 0.45;
  const at = (i: number, j: number): [number, number, number] => {
    const u = rings[j], q = edge[i], L = len[i];
    const r = u <= UC ? (u / UC) * RC : RC + ((u - UC) / (1 - UC)) * (L - RC);
    const x = (q.x / L) * r, z = (q.z / L) * r;
    return [x, H - seatDepth(x, z, L - r), z];
  };
  const uv = (p: [number, number, number]): [number, number] => [(p[0] - (H - p[1]) * 0.7) * IN, (p[2] - (H - p[1]) * 0.7) * IN];
  const g = gridSurface(n, rings.length, true, at, uv);
  // Close the middle with a fan round the center point.
  const pos = g.getAttribute('position') as THREE.BufferAttribute, uvA = g.getAttribute('uv') as THREE.BufferAttribute;
  const cY = (H - seatDepth(0, 0, 99)) * IN;
  const P = new Float32Array(pos.count * 3 + 3), U = new Float32Array(uvA.count * 2 + 2);
  P.set(pos.array as Float32Array);
  P.set([0, cY, 0], pos.count * 3);
  U.set(uvA.array as Float32Array);
  const idx = Array.from(g.getIndex()!.array);
  const c = pos.count;
  for (let i = 0; i < n; i++) idx.push(c, (i + 1) % n, i);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  g.dispose();
  add(m.shell, out);
}

/** Jets, pillows, waterfall, spa light, perimeter LEDs, filter, control panel, valves and the corner drink holders. */
function fittings(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void, basin: Basin) {
  // Jets as placed on the maker's top view (pixels on a 1000 px view of the 84 in shell, 11.55 px per inch).
  const px = (a: number, b: number): [number, number] => [(a - 500) / 11.55, (b - 500) / 11.55];
  const small: [number, number][] = [
    // back-left corner seat
    [205, 140], [170, 135], [140, 160], [225, 175], [150, 200], [180, 222], [228, 215], [265, 220], [310, 242], [228, 262], [276, 272], [246, 302], [140, 132],
    // front-right corner seat
    [760, 680], [730, 720], [785, 725], [695, 750], [740, 775], [785, 775], [825, 770], [855, 790], [785, 820], [800, 850], [860, 830], [835, 860],
    // front-left corner seat
    [180, 770], [175, 820], [140, 830], [170, 860],
    // back bench, under the waterfall; the cool-off seat's sloped front
    [470, 140], [535, 140], [272, 465], [272, 535],
  ];
  const large: [number, number][] = [
    // back-right corner seat
    [775, 175], [720, 210], [820, 220], [780, 275], [835, 140], [865, 165],
    // front-left corner seat
    [220, 715], [280, 780], [230, 815],
    // footwell
    [620, 500],
  ];
  const jet = (xy: [number, number], r: number) => {
    const [x, z] = px(xy[0], xy[1]);
    const s = basin.at(x, z);
    if (H - s.p.y < WATER + 1) return;
    add(m.steel, boss(s.p.clone().addScaledVector(s.n, -0.1), s.n, r, 0.35, 16, r * 0.92));
    add(m.nozzle, boss(s.p.clone().addScaledVector(s.n, 0.2), s.n, r * 0.45, 0.22, 10, r * 0.4));
  };
  small.forEach((p) => jet(p, 1.05));
  large.forEach((p) => jet(p, 1.65));

  // Four Y-pillows on the corner seat backs, bent round the corner, their tops just under the lip.
  const a = OPEN - OPEN_R;
  const Rb = (OPEN_R - 1.85) * IN;
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 2 + Math.PI / 4;
    const g = new RoundedBoxGeometry(10 * IN, 6 * IN, 2.4 * IN, 3, 1.1 * IN);
    // Bend round a circle about (0, 0, Rb): local x runs along the arc, +z faces the circle's middle.
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i), ph = lx / Rb;
      p.setXYZ(i, (Rb - lz) * Math.sin(ph), p.getY(i), Rb - (Rb - lz) * Math.cos(ph));
    }
    g.rotateX(-0.28); // lean back with the wall
    g.translate(0, 0, -Rb); // the corner's center at the origin, the pillow on its -z side
    // Turn local -z to point out along the corner's diagonal.
    g.rotateY(Math.atan2(-Math.cos(t), -Math.sin(t)));
    g.translate(Math.sign(Math.cos(t)) * a * IN, (H - 3.5) * IN, Math.sign(Math.sin(t)) * a * IN);
    g.computeVertexNormals();
    add(m.pillow, g);
  }

  // LED cascade waterfall: a curved spout set into the back lip, its LED strip under the lip of the spout.
  add(m.steel, boxAt(12.5, 1.6, 3.2, 0, H - 1.1, -(OPEN + 0.2)));
  add(m.nozzle, boxAt(11.6, 0.5, 0.6, 0, H - 1.4, -(OPEN - 1.6)));
  add(m.led, boxAt(10.8, 0.25, 0.4, 0, H - 1.5, -(OPEN - 1.55)));

  // The 5 in spa light in the footwell's back wall, and eight perimeter LEDs just under the lip.
  const sl = basin.at(0, -14.1);
  add(m.led, boss(sl.p, sl.n, 2.5, 0.25, 24));
  add(m.steel, boss(sl.p.clone().addScaledVector(sl.n, -0.05), sl.n, 2.95, 0.22, 24));
  const lw = OPEN - 0.7;
  const leds: [number, number][] = [[lw, -16], [lw, 16], [-lw, -16], [-lw, 16], [-16, lw], [16, lw], [-16, -lw], [16, -lw]];
  for (const [x, z] of leds) {
    const s = basin.at(x, z);
    add(m.led, boss(s.p, s.n, 0.45, 0.2, 10));
  }

  // Filter: the skimmer basket on the right step, its grille top at the water line.
  const fx = 28;
  const fs = basin.at(fx, 0);
  const fy0 = fs.p.y - 0.5, fy1 = H - WATER + 0.4;
  add(m.filter, tube(new THREE.Vector3(fx, fy0, 0), new THREE.Vector3(fx, fy1, 0), 2.9, 28));
  add(m.recess, boss(new THREE.Vector3(fx, fy1, 0), new THREE.Vector3(0, 1, 0), 2.4, 0.2, 28));
  add(m.filter, boss(new THREE.Vector3(fx, fy1 + 0.15, 0), new THREE.Vector3(0, 1, 0), 1.2, 0.6, 20, 1.0));

  // TP500 control panel on the front lip, with an air control either side.
  const pz = OPEN + 1.9;
  add(m.bezel, boxAt(7.2, 0.45, 2.6, 0, H - 0.1, pz));
  add(m.screen, boxAt(3.2, 0.1, 1.3, -1.1, H + 0.34, pz));
  for (const bx of [1.4, 2.4]) add(m.steel, boss(new THREE.Vector3(bx, H + 0.34, pz), new THREE.Vector3(0, 1, 0), 0.3, 0.12, 10));
  // Valves and air controls round the lip (as on the top view), and a drink holder in each corner.
  const knobs: [number, number][] = [[-7.1, pz], [7.1, pz], [-15, -(OPEN + 1.9)], [12.1, -(OPEN + 2.1)], [16.5, -(OPEN + 1.8)], [-(OPEN + 1.9), -12], [-(OPEN + 1.9), 12], [OPEN + 1.9, -7.8], [OPEN + 1.9, 8.7]];
  for (const [x, z] of knobs) {
    add(m.steel, boss(new THREE.Vector3(x, H - 0.05, z), new THREE.Vector3(0, 1, 0), 1.45, 0.3, 20, 1.3));
    add(m.nozzle, boss(new THREE.Vector3(x, H + 0.2, z), new THREE.Vector3(0, 1, 0), 0.75, 0.25, 14, 0.6));
  }
  const cupAt = OPEN - OPEN_R + (OPEN_R + 4.3) / Math.SQRT2;
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx * cupAt, z = cz * cupAt;
    add(m.shell, boss(new THREE.Vector3(x, H - 0.05, z), new THREE.Vector3(0, 1, 0), 1.75, 0.2, 24));
    add(m.recess, boss(new THREE.Vector3(x, H + 0.08, z), new THREE.Vector3(0, 1, 0), 1.45, 0.1, 24));
  }
}

/** Cabinet: black core, Cal Edge boards with the brushed band on top, molded black corners, base, badge, drain. */
function cabinet(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void) {
  // Core behind the boards, seen only through the board joints.
  const core = squarePath(CAB - 0.7, CAB_R, 8, 6);
  add(m.corner, gridSurface(core.length, 2, true, (i, j) => [core[i].x, j ? 0.3 : 35.6, core[i].z], (p) => [p[0] * IN, p[1] * IN]));
  // Boards on each side: two wood-grain boards and the band. Their ends run under the corners.
  const rows: [number, number, THREE.Material][] = [
    [1.0, 13.32, m.board],
    [13.42, 25.74, m.board],
    [25.84, 35.4, m.band],
  ];
  const len = 2 * (CAB - CAB_R - 5.2);
  for (let k = 0; k < 4; k++) {
    for (const [y0, y1, mat] of rows) {
      const g = boxUVm(boxAt(len, y1 - y0, 0.7, 0, y0, CAB - 0.35));
      g.rotateY((-k * Math.PI) / 2);
      add(mat, g);
    }
    const base = boxUVm(boxAt(len, 1.0, 0.9, 0, 0, CAB - 0.5));
    base.rotateY((-k * Math.PI) / 2);
    add(m.corner, base);
  }
  for (let k = 0; k < 4; k++) cornerPiece(m, add, k);

  // A round Cal Spas badge on the band near the front-right corner, and the drain cap low on the front.
  const badge = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  badge.scale(1.7 * IN, 0.12 * IN, 0.85 * IN);
  badge.rotateX(Math.PI / 2);
  badge.translate((CAB - 15.5) * IN, 30.6 * IN, (CAB + 0.02) * IN);
  add(m.badge, badge);
  add(m.port, boss(new THREE.Vector3(-(CAB - 13.5), 3.6, CAB), new THREE.Vector3(0, 0, 1), 1.25, 0.35, 20, 1.1));
  add(m.corner, boss(new THREE.Vector3(-(CAB - 13.5), 3.6, CAB + 0.3), new THREE.Vector3(0, 0, 1), 0.5, 0.2, 12));
}

/**
 * One molded corner, standing a little proud of the boards: it wraps the cabinet's rounded corner and reaches onto
 * both sides, wider at the top and foot than at mid height, with a tall recessed grip on the corner and a round port
 * above it. k: 0 front-right, 1 front-left, 2 back-left, 3 back-right.
 */
function cornerPiece(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void, k: number) {
  const proud = 0.28, a = CAB - CAB_R, R = CAB_R + proud;
  const reach = (y: number) => (y > 17 ? 5.7 + 2.1 * ((y - 17) / 18) ** 2 : 5.7 + 1.1 * ((17 - y) / 17) ** 2);
  const sw = 1.0 / R / (Math.PI / 2); // half width of the grip, as a fraction of the corner's quarter turn
  const slot0 = 3.2, slot1 = 25.6, slotDepth = 0.6;
  // Columns: the inner edge and face on side A, the arc (with the grip's two edges), the face and inner edge on side B.
  const cols: { side: -1 | 0 | 1; t: number }[] = [];
  cols.push({ side: -1, t: -1 }, { side: -1, t: -0.97 }, { side: -1, t: -0.6 }, { side: -1, t: -0.25 });
  for (const t of [0, 0.12, 0.25, 0.37, 0.5 - sw, 0.5, 0.5 + sw, 0.63, 0.75, 0.88, 1]) cols.push({ side: 0, t });
  cols.push({ side: 1, t: 0.25 }, { side: 1, t: 0.6 }, { side: 1, t: 0.97 }, { side: 1, t: 1 });
  const ys: number[] = [];
  for (let y = 35.6; y > 0; y -= 1.4) ys.push(y);
  ys.push(slot1, slot0, 0);
  const rowsY = [...new Set(ys.map((y) => +y.toFixed(3)))].sort((p, q) => q - p);
  const iL = cols.findIndex((c) => c.side === 0 && c.t === 0.5 - sw), iR = cols.findIndex((c) => c.side === 0 && c.t === 0.5 + sw);
  const jT = rowsY.indexOf(slot1), jB = rowsY.indexOf(slot0);
  const arcPt = (t: number, y: number, r: number) => new THREE.Vector3(a + r * Math.cos((t * Math.PI) / 2), y, a + r * Math.sin((t * Math.PI) / 2));
  const at = (i: number, j: number): [number, number, number] => {
    const y = rowsY[j], c = cols[i], e = reach(y);
    if (c.side === 0) {
      const p = arcPt(c.t, y, R);
      return [p.x, y, p.z];
    }
    // On a side: |t| is how far out along the reach; the end column steps back in under the board face.
    const back = Math.abs(c.t) === 1 ? -0.55 : 0;
    const s = a - e * Math.abs(c.t);
    return c.side === -1 ? [CAB + proud + back, y, s] : [s, y, CAB + proud + back];
  };
  // Local corner is the front-right one (+x, +z); turn it to corner k (a quarter turn each, counterclockwise from above).
  const g = gridSurface(cols.length, rowsY.length, false, at, (p) => [(p[0] - p[2]) * IN * 0.7, p[1] * IN], false, (i, j) => i >= iL && i < iR && j >= jT && j < jB);
  g.rotateY((-k * Math.PI) / 2);
  add(m.corner, g);
  // The grip: a recess with crisp edges, its floor in shadow-dark plastic.
  const ts = [0.5 - sw, 0.5 - sw / 2, 0.5, 0.5 + sw / 2, 0.5 + sw];
  const walls: { p: THREE.Vector3[]; out: THREE.Vector3 }[] = [];
  const mid = arcPt(0.5, 0, 1).sub(arcPt(0.5, 0, 0));
  for (let q = 0; q < ts.length - 1; q++) {
    const t0 = ts[q], t1 = ts[q + 1];
    walls.push({ p: [arcPt(t0, slot1, R - slotDepth), arcPt(t1, slot1, R - slotDepth), arcPt(t1, slot0, R - slotDepth), arcPt(t0, slot0, R - slotDepth)], out: mid });
    walls.push({ p: [arcPt(t0, slot1, R), arcPt(t1, slot1, R), arcPt(t1, slot1, R - slotDepth), arcPt(t0, slot1, R - slotDepth)], out: new THREE.Vector3(0, -1, 0) });
    walls.push({ p: [arcPt(t0, slot0, R), arcPt(t1, slot0, R), arcPt(t1, slot0, R - slotDepth), arcPt(t0, slot0, R - slotDepth)], out: new THREE.Vector3(0, 1, 0) });
  }
  const side = (t: number, sgn: number) => {
    const tan = arcPt(t + 0.001 * sgn, 0, R).sub(arcPt(t, 0, R));
    return { p: [arcPt(t, slot1, R), arcPt(t, slot1, R - slotDepth), arcPt(t, slot0, R - slotDepth), arcPt(t, slot0, R)], out: tan };
  };
  walls.push(side(0.5 - sw, 1), side(0.5 + sw, -1));
  const grip = quads(walls);
  grip.rotateY((-k * Math.PI) / 2);
  add(m.grip, grip);
  // The round port above the grip.
  const t = Math.PI / 4;
  const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
  const p = new THREE.Vector3(a + R * Math.cos(t), 29.2, a + R * Math.sin(t));
  const port = boss(p, dir, 0.95, 0.18, 20);
  port.rotateY((-k * Math.PI) / 2);
  add(m.port, port);
}

const STEP_CX = 7.5;

/** Two-step: a top step against the front of the cabinet and a lower step in front, wave treads on a black frame. */
function steps(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void) {
  // Size and place read from the installed photo: 35 in wide, an 18 in top step, a little right of the middle.
  const w = 35, cx = STEP_CX, back = CAB + 0.35;
  const tread = (depth: number, z0: number, top: number) => {
    // Rounded tread, its front edge bowed out a little.
    const s = new THREE.Shape();
    const hw = w / 2, r = 3;
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, depth - r);
    s.quadraticCurveTo(hw, depth, hw - r, depth + 0.3);
    s.quadraticCurveTo(0, depth + 1.2, -hw + r, depth + 0.3);
    s.quadraticCurveTo(-hw, depth, -hw, depth - r);
    s.lineTo(-hw, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 8 });
    g.scale(IN, IN, IN);
    g.rotateX(Math.PI / 2); // shape depth now runs out along +z, the slab hangs below y = 0
    g.translate(cx * IN, top * IN, z0 * IN);
    // Tread UVs from plan position so the waves run across the step.
    const p = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    add(m.tread, g);
  };
  // As in the photo: the lower step runs back under the top step, and the top tread stands on a box under its left
  // part only, so its right part is open beneath, over the lower tread.
  const topY = 18, lowY = 9;
  const d1 = 13.5, d2 = 13;
  add(m.riser, boxUVm(boxAt(w - 1.6, lowY - 1.0 - 1.8, d1 + d2 - 1.4, cx, 1.8, back + (d1 + d2 - 1.4) / 2)));
  tread(d1 + d2 - 0.4, back, lowY);
  const bw = 21;
  add(m.riser, boxUVm(boxAt(bw, topY - lowY - 0.9, d1 - 1.4, cx - w / 2 + 0.8 + bw / 2, lowY - 0.1, back + (d1 - 1.4) / 2)));
  add(m.riser, boxUVm(boxAt(1.2, topY - lowY - 0.9, 3, cx + w / 2 - 1.4, lowY - 0.1, back + 1.5)));
  // The top tread's front right corner stands on a leg on the lower tread, as in the photo (without it the tread's
  // open right part looked broken, floating over the lower step).
  add(m.riser, boxUVm(boxAt(1.6, topY - lowY - 0.9, 1.8, cx + w / 2 - 1.6, lowY - 0.1, back + d1 - 1.6)));
  tread(d1, back, topY);
  // Base frame round the bottom.
  add(m.stepFrame, boxUVm(boxAt(w + 0.2, 1.8, d1 + d2, cx, 0, back + (d1 + d2) / 2)));
}

/** Gap between the cover's two halves at the hinge (in). */
const COVER_GAP = 0.6;

/** One cover half: plan outline in (x, d), d from the hinge out to the edge, extruded to a unit thickness. */
function coverHalfGeo(): THREE.BufferGeometry {
  const gap = COVER_GAP;
  const s = new THREE.Shape();
  const hw = HALF - 0.3, r = LIP_R, rh = 1;
  const d1 = HALF - gap / 2 - 0.6;
  s.moveTo(-hw + rh, 0);
  s.lineTo(hw - rh, 0);
  s.quadraticCurveTo(hw, 0, hw, rh);
  s.lineTo(hw, d1 - r);
  s.quadraticCurveTo(hw, d1, hw - r, d1);
  s.lineTo(-hw + r, d1);
  s.quadraticCurveTo(-hw, d1, -hw, d1 - r);
  s.lineTo(-hw, rh);
  s.quadraticCurveTo(-hw, 0, -hw + rh, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.3, bevelSegments: 3, curveSegments: 10 });
  g.computeBoundingBox();
  return g;
}

/** The lifter's L brackets on the sides, reaching back past the corners to the arms' pivots (they stay put). `side` is one of the two sides, or both. */
function lifterBrackets(m: Mats, brackets: (m: THREE.Material, g: THREE.BufferGeometry) => void, side?: number) {
  const ax = CAB + 1.6;
  for (const sx of side ? [side] : [-1, 1]) {
    brackets(m.lifter, boxAt(0.45, 4.5, 9, sx * (CAB + 0.5), PIVOT[1] - 2.6, PIVOT[0] + 3.4));
    brackets(m.lifter, boxAt(0.45, 7.5, 2.4, sx * (CAB + 0.5), PIVOT[1] - 4.8, PIVOT[0]));
    brackets(m.lifter, tube(new THREE.Vector3(sx * (CAB + 0.5), PIVOT[1], PIVOT[0]), new THREE.Vector3(sx * (ax + 0.8), PIVOT[1], PIVOT[0]), 1.0, 16));
  }
}

/* ------------------------------------------------------------------ */
/* Cover motion                                                         */
/* ------------------------------------------------------------------ */

/** Whole opening or closing, seconds (at full pace: starting, stopping and turning round add a little). */
const COVER_SECONDS = 4.1;
/** Seconds to get up to pace or to turn round, so a toggle in mid-motion reverses without a jerk. */
const COVER_RAMP = 0.45;
/** On the 0 (closed) to 1 (open) timeline: the fold ends at FOLD_END, the lift starts at LIFT_START (they overlap). */
const FOLD_END = 0.55, LIFT_START = 0.43;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Ease in and out with zero speed at both ends (sine). */
const easeIO = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

/**
 * The cover and its lifter as moving parts. Three turning parts: the lifter (arms and bar) about its pivots behind the
 * spa; the cover as a whole, hanging from the bar (it settles to hang straight down as the arms swing up); and the front
 * half about the hinge (it folds over onto the back half, turning about the bar). The halves are built as they lie
 * closed, and carry a morph to the shape the folded cover has (top to top, flat where they meet; the closed halves are
 * flat underneath and tapered on top), so both end poses are the ones drawn before, exactly. The skirts ride with their
 * halves.
 *
 * One number `s` (0 closed, 1 open) is the progress; it moves toward its target at a pace that changes smoothly, so
 * reversing in mid-motion turns round without a jump.
 */
function coverRig(m: Mats, sink: SpaSink, openNow: boolean, onFade: (level: number) => void) {
  const base = H + 0.15;
  const yc = base + COVER_T0 + 0.25 + 0.62;
  const bz = PIVOT[0] + Math.sqrt(Math.max(0, ARM ** 2 - (yc - PIVOT[1]) ** 2));
  const top = BAR_UP[1] + 1.5, zb = BAR_UP[0];
  const ax = CAB + 1.6;
  const part = sink.part!;
  const lift = part('cover-lifter', [0, PIVOT[1] * IN, PIVOT[0] * IN]);
  const cov = part('cover-halves', [0, yc * IN, bz * IN]);
  const fold = part('cover-fold', [0, yc * IN, bz * IN]);
  lift.object.add(cov.object);
  cov.object.add(fold.object);
  const covBase = new THREE.Vector3(0, (yc - PIVOT[1]) * IN, (bz - PIVOT[0]) * IN);
  cov.object.position.copy(covBase);
  fold.object.position.set(0, 0, 0);

  // Lifter arms and bar, as they lie closed (the arms' length from the pivots to the bar).
  for (const sx of [-1, 1]) lift.add(m.lifter, tube(new THREE.Vector3(sx * ax, PIVOT[1], PIVOT[0]), new THREE.Vector3(sx * ax, yc, bz), 0.6, 10));
  lift.add(m.lifter, tube(new THREE.Vector3(-ax - 0.5, yc, bz), new THREE.Vector3(ax + 0.5, yc, bz), 0.62, 12));
  // The hinge's vinyl across the fold.
  cov.add(m.skirt, boxAt(2 * HALF - 1.2, 0.25, 1.6, 0, base + COVER_T0 - 0.05, 0));

  // Poses. Angles about x (the lifter and the cover turn so that the cover's back half, lying toward -z, hangs down).
  const A1 = Math.atan2(BAR_UP[1] - PIVOT[1], BAR_UP[0] - PIVOT[0]), A0 = Math.atan2(yc - PIVOT[1], bz - PIVOT[0]);
  const ALPHA = -(A1 - A0); // the arms swing up
  const BETA = -Math.PI / 2 - ALPHA; // the cover hangs straight down from the bar
  const tau = new THREE.Vector3();
  const hingeC = new THREE.Vector3(0, (base + COVER_T0 - yc) * IN, (0 - bz) * IN); // the hinge's top, relative to the bar
  const tmpR = new THREE.Matrix4();
  const place = (s: number) => {
    const fo = easeIO(s / FOLD_END);
    const l = clamp01((s - LIFT_START) / (1 - LIFT_START));
    const settle = easeIO((l - 0.12) / 0.88);
    lift.object.rotation.x = ALPHA * easeIO(l);
    cov.object.rotation.x = BETA * settle;
    cov.object.position.copy(covBase).addScaledVector(tau, settle);
    // The front half turns about the bar, and over its last part the turn slides to be about the hinge's top, so the two
    // halves close flat on each other.
    const phi = -Math.PI * fo;
    const c = hingeC.clone().multiplyScalar(easeIO((fo - 0.55) / 0.45));
    const rc = c.clone().applyMatrix4(tmpR.makeRotationX(phi));
    fold.object.rotation.x = phi;
    fold.object.position.copy(c).sub(rc);
    return { fo, l };
  };
  // Where the cover hangs when open: matched to the old static pose at the hinge's inner edge (the first point of the back half).
  const finalMatrices = () => {
    for (const o of [lift.object, cov.object, fold.object]) o.updateMatrix();
    const mc = lift.object.matrix.clone().multiply(cov.object.matrix);
    return { mc, mf: mc.clone().multiply(fold.object.matrix) };
  };
  place(1);
  {
    const q = new THREE.Vector3(0, (base + coverT(COVER_GAP)) * IN, -COVER_GAP * IN).sub(new THREE.Vector3(0, yc * IN, bz * IN));
    const w0 = q.clone().applyMatrix4(finalMatrices().mc);
    const want = new THREE.Vector3(0, (top - COVER_GAP) * IN, zb * IN);
    const rl = new THREE.Matrix4().extractRotation(lift.object.matrix).invert();
    tau.copy(want.sub(w0).applyMatrix4(rl));
    tau.x = 0;
  }
  place(1);
  const { mc, mf } = finalMatrices();
  const mcInv = mc.clone().invert(), mfInv = mf.clone().invert();
  const rotC = new THREE.Matrix3().setFromMatrix4(mcInv), rotF = new THREE.Matrix3().setFromMatrix4(mfInv);
  const origin = new THREE.Vector3(0, yc * IN, bz * IN);

  // Mapping (x, d, h) of a half, closed (as it lies on the spa) and folded (as it hangs, as drawn before).
  const maps = {
    B: {
      closed: (x: number, d: number, h: number): [number, number, number] => [-x, base + h * coverT(d), -d],
      folded: (x: number, d: number, h: number): [number, number, number] => [-x, top - d, zb + coverT(d) * (1 - h)],
      group: cov, inv: mcInv, rot: rotC,
    },
    F: {
      closed: (x: number, d: number, h: number): [number, number, number] => [x, base + h * coverT(d), d],
      folded: (x: number, d: number, h: number): [number, number, number] => [x, top - d, zb - coverT(d) * (1 - h)],
      group: fold, inv: mfInv, rot: rotF,
    },
  };
  const unit = (to: [number, number, number]) => new THREE.Vector3(to[0] * IN, to[1] * IN, to[2] * IN);
  /** How far the folded shape is from where the closed one has been carried to, in the world (spa space, meters). */
  const worldGap = (k: 'B' | 'F', d: number, h: number) => {
    const mp = maps[k], mat = k === 'B' ? mc : mf;
    const rigid = unit(mp.closed(0, d, h)).sub(origin).applyMatrix4(mat);
    return unit(mp.folded(0, d, h)).sub(rigid);
  };

  const morphed: THREE.Mesh[] = [];
  const own = (g: THREE.BufferGeometry, k: 'B' | 'F', mat: THREE.Material) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    maps[k].group.object.add(mesh);
    maps[k].group.own(g, mesh);
    morphed.push(mesh);
  };

  // The halves.
  const g0 = coverHalfGeo();
  const bb = g0.boundingBox!;
  const sp = g0.getAttribute('position');
  for (const k of ['B', 'F'] as const) {
    const mp = maps[k];
    let prm = Array.from({ length: sp.count }, (_, i): [number, number, number] => [sp.getX(i), sp.getY(i) + COVER_GAP / 2 + 0.3, (sp.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z)]);
    const build = (f: typeof mp.closed, arr: [number, number, number][]) => {
      const out = new Float32Array(arr.length * 3);
      arr.forEach(([x, d, h], i) => out.set(unit(f(x, d, h)).toArray(), i * 3));
      return out;
    };
    const vol = (pos: Float32Array) => {
      const t = new THREE.BufferGeometry();
      t.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return signedVolume(t);
    };
    if (vol(build(mp.closed, prm)) < 0) {
      prm = prm.slice();
      for (let i = 0; i + 2 < prm.length; i += 3) [prm[i + 1], prm[i + 2]] = [prm[i + 2], prm[i + 1]];
    }
    const closed = build(mp.closed, prm), folded = build(mp.folded, prm);
    const normals = (pos: Float32Array) => {
      const t = new THREE.BufferGeometry();
      t.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      t.computeVertexNormals();
      return t.getAttribute('normal').array as Float32Array;
    };
    const n0 = normals(closed), n1 = normals(folded);
    const local = new Float32Array(closed.length), target = new Float32Array(closed.length), tn = new Float32Array(closed.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < closed.length; i += 3) {
      local.set(v.set(closed[i], closed[i + 1], closed[i + 2]).sub(origin).toArray(), i);
      target.set(v.set(folded[i], folded[i + 1], folded[i + 2]).applyMatrix4(mp.inv).toArray(), i);
      tn.set(v.set(n1[i], n1[i + 1], n1[i + 2]).applyMatrix3(mp.rot).normalize().toArray(), i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(local, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n0, 3));
    g.morphAttributes.position = [new THREE.BufferAttribute(target, 3)];
    g.morphAttributes.normal = [new THREE.BufferAttribute(tn, 3)];
    own(g, k, m.cover);
  }
  g0.dispose();

  // The skirts: the edge skirt split at the hinge, each part riding on its half, moved with the half's underside.
  const sk = squarePath(HALF, LIP_R, 10, 8);
  const prof: [number, number][] = [[-0.1, base + 1.4], [0.3, base - 0.3], [0.32, H - 4.1], [0.2, H - 4.1], [0.18, base - 0.3], [-0.22, base + 1.4]];
  const half = sk.length / 2;
  for (const k of ['F', 'B'] as const) {
    const idx = (i: number) => (k === 'F' ? i : i + half) % sk.length;
    const g = gridSurface(half + 1, prof.length, false, (i, j) => {
      const p = sk[idx(i)];
      return [p.x + p.nx * prof[j][0], prof[j][1], p.z + p.nz * prof[j][0]];
    }, planUV);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const target = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = Math.min(HALF - 0.3, Math.max(COVER_GAP / 2 + 0.3, Math.abs(v.z) / IN));
      const delta = worldGap(k, d, 0).applyMatrix3(maps[k].rot);
      target.set(v.sub(origin).add(delta).toArray(), i * 3);
      v.fromBufferAttribute(pos, i).sub(origin);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    g.morphAttributes.position = [new THREE.BufferAttribute(target, 3)];
    g.morphAttributes.normal = [new THREE.BufferAttribute(new Float32Array(n.array), 3)];
    own(g, k, m.skirt);
  }

  // Progress: it moves toward its target at a pace that eases up and down.
  let s = openNow ? 1 : 0, target = s, vel = 0;
  const apply = () => {
    const { fo, l } = place(s);
    const w = easeIO((fo - 0.55) / 0.45);
    for (const mesh of morphed) mesh.morphTargetInfluences![0] = w;
    // The jets' bubbles and steam come in as the cover clears the water, and go as it comes back over.
    onFade(easeIO(l / 0.5));
  };
  apply();
  return {
    set(open: boolean, instant?: boolean) {
      target = open ? 1 : 0;
      if (instant) {
        s = target;
        vel = 0;
        apply();
      }
    },
    /** Advance dt seconds; true while still moving. */
    tick(dt: number): boolean {
      if (s === target) return false;
      const dir = Math.sign(target - s), pace = 1 / COVER_SECONDS;
      const dv = (pace / COVER_RAMP) * dt;
      vel += Math.min(dv, Math.max(-dv, dir * pace - vel));
      s += vel * dt;
      if ((dir > 0 && s >= target) || (dir < 0 && s <= target)) {
        s = target;
        vel = 0;
      }
      apply();
      return s !== target;
    },
  };
}

/** The cover, closed on the spa or folded and stood up behind it on the lifter, and the lifter's brackets, arms and bar. */
function coverAndLifter(m: Mats, add: (m: THREE.Material, g: THREE.BufferGeometry) => void, open: boolean, brackets: ((m: THREE.Material, g: THREE.BufferGeometry) => void) | null = add) {
  const gap = COVER_GAP;
  const halfGeo = coverHalfGeo;
  /** Place one half by mapping (x, d, h in 0..1 of its thickness) to inches, keeping its faces turned out. */
  const place = (f: (x: number, d: number, h: number) => [number, number, number], mat: THREE.Material) => {
    const g = halfGeo();
    const bb = g.boundingBox!;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const h = (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
      const [x, y, z] = f(p.getX(i), p.getY(i) + gap / 2 + 0.3, h);
      p.setXYZ(i, x * IN, y * IN, z * IN);
    }
    if (signedVolume(g) < 0) flipFaces(g);
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    add(mat, g);
  };
  const base = H + 0.15;
  let bar: [number, number];
  if (!open) {
    // Closed: both halves on the lip, the hinge across the middle, the skirt round the edge.
    place((x, d, h) => [x, base + h * coverT(d), d], m.cover);
    place((x, d, h) => [-x, base + h * coverT(d), -d], m.cover);
    add(m.skirt, boxAt(2 * HALF - 1.2, 0.25, 1.6, 0, base + COVER_T0 - 0.05, 0));
    // Sewn to the cover's edge, hanging over the lip's bullnose.
    const sk = squarePath(HALF, LIP_R, 10, 8);
    const prof: [number, number][] = [[-0.1, base + 1.4], [0.3, base - 0.3], [0.32, H - 4.1], [0.2, H - 4.1], [0.18, base - 0.3], [-0.22, base + 1.4]];
    add(m.skirt, gridSurface(sk.length, prof.length, true, (i, j) => [sk[i].x + sk[i].nx * prof[j][0], prof[j][1], sk[i].z + sk[i].nz * prof[j][0]], planUV));
    // The bar rests across the cover, the arms' length away from the pivots.
    const yc = base + COVER_T0 + 0.25 + 0.62;
    bar = [PIVOT[0] + Math.sqrt(Math.max(0, ARM ** 2 - (yc - PIVOT[1]) ** 2)), yc];
  } else {
    // Open: folded top to top with the hinge (and the bar inside it) at the top, hanging behind the spa.
    const [zb, yb] = BAR_UP;
    const top = yb + 1.5;
    place((x, d, h) => [x, top - d, zb + coverT(d) * (1 - h)], m.cover);
    place((x, d, h) => [-x, top - d, zb - coverT(d) * (1 - h)], m.cover);
    // The skirt flaps hang down the folded cover's two ends, reaching a little past its spa side; the hinge's vinyl
    // runs across the top.
    for (const sx of [-1, 1]) add(m.skirt, boxAt(0.25, HALF - 1.2, 2 * COVER_T0 + 4.8, sx * (HALF + 0.1), top - HALF + 0.4, zb + 2.0));
    add(m.skirt, boxAt(2 * HALF - 1, 0.5, 2 * COVER_T0 + 0.6, 0, top - 0.3, zb));
    bar = BAR_UP;
  }
  // Lifter: a bracket on each side near the back, an arm from its pivot up to the bar, and the bar across.
  const ax = CAB + 1.6;
  for (const sx of [-1, 1]) {
    // An L bracket on the side, reaching back past the corner to the pivot (it stays put when the cover moves).
    if (brackets) lifterBrackets(m, brackets, sx);
    add(m.lifter, tube(new THREE.Vector3(sx * ax, PIVOT[1], PIVOT[0]), new THREE.Vector3(sx * ax, bar[1], bar[0]), 0.6, 10));
  }
  add(m.lifter, tube(new THREE.Vector3(-ax - 0.5, bar[1], bar[0]), new THREE.Vector3(ax + 0.5, bar[1], bar[0]), 0.62, 12));
}
