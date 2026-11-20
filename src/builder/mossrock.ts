import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { smooth } from '../engine/noise';
import type { Quality } from '../engine/post';

/*
 * A moss rock boulder in fine detail, drawn from the moss rock Northern California yards sell (double-head size and
 * boulders, as stacked in their baskets) and Green Lion's own job photos. Moss rock is weathered surface stone: a
 * blocky piece broken along several faces, its corners knocked off and its edges chipped and crumbled, its old outer
 * skin (the rind) grayed and crusted with lichen, its breaks and chips warmer (buff and orange-tan) with iron stain.
 * The breaks are hackly, with small stepped ledges where the split ran in steps. Up close the stone is porous: a
 * sandpaper of pin pits all over, small pores, a few deeper pockets and broad shallow dimples. Three forms: rounded,
 * tall (on end) and flat (a level top). The lichen is the pale
 * yellow-green and gray-green crust that gives the rock its name, in lacy, broken patches over the tops and the faces
 * that look out, with a few dark crusts and orange dots.
 *
 * The shape (the breaks, dimples, pockets and chipped edges) is real geometry, fine enough on a medium rock (about
 * 3.5 mm between points) for a pocket to be a dent in the stone. The lichen, the pin pits, small pores and sand grain
 * are drawn by the material's shader from 3D noise in world space: crisp at a few millimeters close up, and fading to
 * their average color where a pixel is bigger than them, so nothing shimmers at a distance. Sizes are in meters, so
 * pores and lichen are the same size on a head-size rock and on a 5 ft boulder. The mesh is coarser at lower quality
 * settings (MOSS_ROCK_SPACING), and finished rocks are kept in a small cache (mossRock), so a yard rebuilt for an edit
 * elsewhere does not work them out again.
 */

/* ---- Cellular noise --------------------------------------------------------------- */

const HX = 374761393, HY = 668265263, HZ = 1274126177, HS = 2147483647;

/**
 * A cell's hash from the sum of its coordinates' and seed's products (imul by HX, HY, HZ and HS): each product is
 * worked out once and reused across the cells that share it.
 */
function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ---- Value noise (its own, fast: this file calls it some fifty times a point) ---------- */

/** 3D value noise in [0, 1]. */
function noise3f(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  let fx = x - x0, fy = y - y0, fz = z - z0;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  fz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  // The eight corners' hashes, each axis' product worked out once.
  const X0 = Math.imul(x0, HX), X1 = Math.imul(x0 + 1, HX), Y0 = Math.imul(y0, HY), Y1 = Math.imul(y0 + 1, HY);
  const Z0 = Math.imul(z0, HZ) + Math.imul(seed, HS), Z1 = Math.imul(z0 + 1, HZ) + Math.imul(seed, HS);
  const a = mix32((X0 + Y0 + Z0) | 0), b = mix32((X1 + Y0 + Z0) | 0), c = mix32((X0 + Y1 + Z0) | 0), d = mix32((X1 + Y1 + Z0) | 0);
  const e = mix32((X0 + Y0 + Z1) | 0), f = mix32((X1 + Y0 + Z1) | 0), g = mix32((X0 + Y1 + Z1) | 0), h = mix32((X1 + Y1 + Z1) | 0);
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx;
  const lo = ab + (cd - ab) * fy, hi = ef + (gh - ef) * fy;
  return lo + (hi - lo) * fz;
}

/** Fractal value noise in [0, 1]. */
function fbm3f(x: number, y: number, z: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3f(x * f, y * f, z * f, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Results of the last `worley3` call: distance to the nearest and second-nearest cell point, and the nearest's id. */
let wF1 = 0, wId = 0;

/** 3D cellular (Worley) noise in cell units. */
function worley3(x: number, y: number, z: number, seed: number, jitter = 0.9) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let f1 = 99, id = 0;
  for (let k = -1; k <= 1; k++) {
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k;
        // The cell's hashes for seed to seed + 3, its coordinates' part worked out once.
        const P = Math.imul(cx, HX) + Math.imul(cy, HY) + Math.imul(cz, HZ);
        const dx = cx + 0.5 + (mix32((P + Math.imul(seed, HS)) | 0) - 0.5) * jitter - x;
        const dy = cy + 0.5 + (mix32((P + Math.imul(seed + 1, HS)) | 0) - 0.5) * jitter - y;
        const dz = cz + 0.5 + (mix32((P + Math.imul(seed + 2, HS)) | 0) - 0.5) * jitter - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < f1) {
          f1 = d2;
          id = mix32((P + Math.imul(seed + 3, HS)) | 0);
        }
      }
    }
  }
  wF1 = Math.sqrt(f1);
  wId = id;
}

const fract = (x: number) => x - Math.floor(x);

/**
 * Round pits in cells of `cell` meters: a share `present` of the cells hold one, radius between `r0` and `r1` of the
 * cell, as deep as `deep` times its radius, with a bowl's profile and a crisp rim. Returns the depth in meters.
 */
function pits(x: number, y: number, z: number, cell: number, present: number, r0: number, r1: number, deep: number, seed: number): number {
  // A wobble so no pit is a neat circle.
  const u = x / cell, v = y / cell, s = z / cell;
  const wx = (noise3f(u * 1.7, v * 1.7, s * 1.7, seed + 7) - 0.5) * 0.4;
  const wy = (noise3f(u * 1.7 + 9, v * 1.7, s * 1.7, seed + 8) - 0.5) * 0.4;
  const wz = (noise3f(u * 1.7, v * 1.7 + 5, s * 1.7, seed + 9) - 0.5) * 0.4;
  worley3(u + wx, v + wy, s + wz, seed);
  if (fract(wId * 7.31) >= present) return 0;
  const r = r0 + (r1 - r0) * fract(wId * 13.7);
  const t = wF1 / r;
  if (t >= 1) return 0;
  return deep * r * cell * Math.sqrt(1 - t * t);
}

/* ---- Looks ------------------------------------------------------------------------- */

export interface MossRockLook {
  /** The old weathered skin: grayed tan and brown. */
  rind: string[];
  /** Breaks: buff, tan and orange-tan. */
  breakFace: string[];
  /** Iron stain, and its darker rim; how much of it (1 the tan rock's, less for a stone with little iron). */
  iron: [string, string];
  ironAmount?: number;
  /** The dark inside a pocket. */
  pore: string;
  /** Lichens: the pale yellow-green crust, the gray-green crust, the dark brown-black crust and the orange dots. */
  lichen: [string, string, string, string];
  moss: [string, string];
  soil: string;
  /**
   * How much of each lichen a stone of this kind carries, against the tan moss rock's (left out: as the tan rock):
   * `paleCrust` shifts the pale crust's cover (about -0.2 nearly bare to +0.15 crusted), `darkCrust` and `orangeDots`
   * scale the dark crust and the orange lichen, and `mossCover` shifts the moss cushions' cover. `porous` scales how
   * many pockets the stone has (below 1 for a stone weathered smooth).
   */
  paleCrust?: number;
  darkCrust?: number;
  orangeDots?: number;
  mossCover?: number;
  porous?: number;
}

/** Tan moss rock: warm tan-brown stone, pale yellow-green lichen. */
export const MOSS_ROCK_TAN: MossRockLook = {
  rind: ['#584a39', '#4d4131', '#61523f', '#463b2d', '#554633'],
  breakFace: ['#6d5940', '#604d35', '#745f44', '#57432b', '#69533a'],
  iron: ['#744627', '#4e2f1b'],
  pore: '#2c241d',
  lichen: ['#8f9566', '#737a5a', '#34302a', '#99592a'],
  moss: ['#5b6a26', '#414f1d'],
  soil: '#3f3126',
};

/**
 * Dark gray moss rock: charcoal-gray stone (the darker moss rock stacked in the yards' bins, and about a quarter of the
 * moss rock in a customer job's finished yard), its breaks a lighter, slightly warm gray, a little rust, and the same
 * pale yellow-green crust lichen, which stands out more on the dark stone.
 */
export const MOSS_ROCK_GRAY: MossRockLook = {
  rind: ['#32322e', '#2a2b27', '#3a3a35', '#252522', '#34332f'],
  breakFace: ['#403f3a', '#383632', '#47453f', '#302f2a', '#3f3d37'],
  iron: ['#55402a', '#2b1f14'],
  ironAmount: 0.6,
  pore: '#141312',
  lichen: ['#868b68', '#6c725a', '#1f1e1c', '#99592a'],
  moss: ['#5b6a26', '#414f1d'],
  soil: '#3f3126',
};

/**
 * Canyon Tech boulder (Resource Building Materials): weathered, angular stone in warm gray and tan, its breaks a warmer
 * tan, with rust-orange lichen patches on the faces that look out, a little pale gray crust and little moss. Its shape is
 * CANYON_CUT, on the wedge and ridge forms.
 */
export const MOSS_ROCK_CANYON: MossRockLook = {
  rind: ['#595757', '#5c5954', '#545352', '#605b54', '#575450'],
  breakFace: ['#665d51', '#61584d', '#6a5f52', '#5c544a', '#645a4e'],
  iron: ['#86522c', '#4e301b'],
  ironAmount: 0.55,
  pore: '#1b1b19',
  lichen: ['#9c9d90', '#85887d', '#36332e', '#8e5530'],
  moss: ['#6f7f3a', '#586b2f'],
  soil: '#3f3126',
  paleCrust: -0.2,
  darkCrust: 0.5,
  orangeDots: 1.2,
  mossCover: -0.07,
};

/** Canyon Tech's breaks: more of them, crisper and blockier than moss rock's, so the boulder reads angular. */
export const CANYON_CUT: MossRockCut = { extra: 4, crisp: 0.55, blocky: 0.7 };

/**
 * Weathered tan granite: warm tan-gray with darker lichen patches and a little rust (the plain Boulder of the catalog,
 * the stones round a pond, a stream and a bubbler, and the tan boulders of the urn fountains).
 */
export const MOSS_ROCK_GRANITE: MossRockLook = {
  rind: ['#524c44', '#4d4840', '#565046', '#4a453e', '#514b42'],
  breakFace: ['#5c544a', '#584f46', '#61574d', '#544d44', '#5c5249'],
  iron: ['#8e623a', '#523822'],
  ironAmount: 0.45,
  pore: '#1c1a17',
  lichen: ['#8d8d80', '#76786b', '#302f2a', '#9a5a2e'],
  moss: ['#5c6828', '#435423'],
  soil: '#3f3126',
  paleCrust: -0.28,
  darkCrust: 1.8,
  orangeDots: 0.5,
  mossCover: -0.05,
};

export type MossRockForm = 'rounded' | 'tall' | 'flat' | 'ridge' | 'wedge';

export interface MossRockSpec {
  /** Length (x), depth (z) and the height above the ground (y), meters. */
  size: [number, number, number];
  /** Share of its full height that is buried. */
  buried: number;
  seed: string;
  /** Moss and lichen on (false: clean stone). */
  moss: boolean;
  look?: MossRockLook;
  /**
   * Rounded (the default), tall (stands on end, steeper sides), flat (a flat top a stream can pour over), ridge (two
   * steep breaks meet in a ridge along the top) or wedge (one big sloped break across the top).
   */
  form?: MossRockForm;
  /** Meters between the mesh's points on a medium rock (default 3.2 mm). Pores and lichen are the shader's, at any spacing. */
  spacing?: number;
  /** A more angular stone than moss rock (a quarried or broken boulder); left out, moss rock's own breaks. */
  cut?: MossRockCut;
  /** At most this many cube-sphere segments a side, however big the rock (caps a big boulder's points). */
  maxSegments?: number;
}

/** How a stone of another kind is broken: more breaks, crisper and blockier than moss rock's. */
export interface MossRockCut {
  /** Breaks added to moss rock's 8 to 11 (on the sides, steep). */
  extra: number;
  /** Scales how worn the breaks' edges are: below 1 crisper. */
  crisp: number;
  /** Added to the old block's squareness (moss rock's is about 2.6 to 3): higher is blockier. */
  blocky: number;
}

const smin = (a: number, b: number, k: number) => {
  if (!(k > 1e-6)) return Math.min(a, b);
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

/**
 * Cube-sphere segments per edge, for about `spacing` meters between points on a rock of this mean half size. A big rock
 * is capped (its points spread wider), and the cap falls with the spacing, so a coarser setting also costs less.
 */
function segmentsFor(meanHalf: number, spacing: number, most = Infinity): number {
  const cap = Math.min(most, Math.round((160 * 0.0032) / spacing));
  return Math.round(Math.min(cap, Math.max(24, ((Math.PI / 2) * meanHalf) / spacing)));
}

const spheres = new Map<number, { pos: Float32Array; index: ArrayLike<number> }>();

/** The welded cube-sphere's unit directions and triangles, shared by every rock of that many segments (a few kept). */
function unitSphere(n: number) {
  const hit = spheres.get(n);
  if (hit) return hit;
  const made = makeSphere(n);
  if (spheres.size >= 6) spheres.delete(spheres.keys().next().value!);
  spheres.set(n, made);
  return made;
}

/** A cube's surface cut into n x n squares per face, welded at the seams, its points pushed out onto the unit sphere. */
function makeSphere(n: number) {
  const m = n + 1;
  const ids = new Map<number, number>();
  const dirs: number[] = [];
  const index: number[] = [];
  const pt = (x: number, y: number, z: number) => {
    const key = (x * m + y) * m + z;
    let id = ids.get(key);
    if (id === undefined) {
      id = dirs.length / 3;
      ids.set(key, id);
      const dx = (2 * x) / n - 1, dy = (2 * y) / n - 1, dz = (2 * z) / n - 1;
      const l = Math.hypot(dx, dy, dz);
      dirs.push(dx / l, dy / l, dz / l);
    }
    return id;
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [0, n]) {
      // (u, v) run over the face; the third coordinate is fixed at the face.
      const at = (u: number, v: number) => (axis === 0 ? pt(side, u, v) : axis === 1 ? pt(v, side, u) : pt(u, v, side));
      // Outward winding: u x v points along +axis, so flip the triangles on the near (0) face.
      const flip = side === 0;
      for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
          const a = at(u, v), b = at(u + 1, v), c = at(u + 1, v + 1), d = at(u, v + 1);
          if (flip) index.push(a, c, b, a, d, c);
          else index.push(a, b, c, a, c, d);
        }
      }
    }
  }
  return { pos: new Float32Array(dirs), index: new Uint32Array(index) };
}

/**
 * What makes one rock unlike the next of its kind, as in a pile of real moss rock: a little lighter or darker, warmer
 * or cooler, rougher or smoother, more or fewer pockets and chips, nearly bare of lichen or crusted with it, more or
 * less rust, dark crust, orange dots and moss. Drawn from its own seed, so the rock's breaks are not changed by it.
 */
interface Character {
  tone: number;
  warm: number;
  rough: number;
  porous: number;
  chipped: number;
  lichen: number;
  dark: number;
  orange: number;
  iron: number;
  moss: number;
}

function character(seed: string): Character {
  // The salt puts the approved up-close sample rock (id 'moss-rock') near the middle of every range.
  const r = rng(`mosschar3803:${seed}`);
  const lich = r();
  return {
    tone: 0.84 + 0.32 * r(),
    warm: (r() - 0.5) * 0.14,
    rough: 0.8 + 0.45 * r(),
    porous: 0.5 + r(),
    chipped: 0.7 + 0.6 * r(),
    // Some rocks nearly bare, most partly crusted, a few covered.
    lichen: lich < 0.15 ? -0.16 : lich > 0.85 ? 0.14 : (lich - 0.5) * 0.18,
    dark: 0.3 + 1.4 * r(),
    orange: 0.2 + 1.6 * r(),
    iron: 0.5 + r(),
    moss: (r() - 0.5) * 0.12,
  };
}

/**
 * Build the boulder with x and z centered, the ground at y = 0 and its top at `size[2]`; the buried part reaches
 * below the ground. Carries `color` (the stone, shaded) and `rkA` (lichen, dark crust and orange dot cover, and the
 * shading, for the material's shader).
 */
export function buildMossRock(spec: MossRockSpec): THREE.BufferGeometry {
  const look = spec.look ?? MOSS_ROCK_TAN;
  const { size } = spec;
  const r = rng(`mossrock:${spec.seed}`);
  const ch = character(spec.seed);
  ch.porous *= look.porous ?? 1;
  const seed = Math.floor(r() * 1e6);
  const total = size[2] / (1 - spec.buried);
  const half = [size[0] / 2, total / 2, size[1] / 2];
  const meanHalf = (half[0] + half[1] + half[2]) / 3;
  const spacing = spec.spacing ?? 0.0032;
  const n = segmentsFor(meanHalf, spacing, spec.maxSegments);
  const form = spec.form ?? 'rounded';
  const sph = unitSphere(n);
  const count = sph.pos.length / 3;
  /** How big this rock is against a medium (22 in) one: the broad shapes scale with it, the pores do not. */
  const big = meanHalf / 0.27;

  // The breaks: planes the stone split along, mostly on the sides, two across the top. Most are fairly crisp, a few worn.
  const planes: { nx: number; ny: number; nz: number; h: number; k: number }[] = [];
  const breaks = 8 + Math.floor(r() * 4) + (spec.cut?.extra ?? 0);
  let a0 = 0;
  for (let k = 0; k < breaks; k++) {
    let a = (k / breaks) * Math.PI * 2 + (r() - 0.5) * 0.9;
    if (k === 0) a0 = a;
    // A ridge's second top break faces the first across the rock.
    if (k === 1 && form === 'ridge') a = a0 + Math.PI;
    // A flat-top rock's top break lies nearly level; a tall one's side breaks stand nearly upright.
    const el =
      k === 0 ? (form === 'flat' ? Math.PI / 2 - r() * 0.08 : form === 'ridge' ? 0.5 + r() * 0.15 : form === 'wedge' ? 0.55 + r() * 0.2 : 0.9 + r() * 0.5)
      : k === 1 ? (form === 'ridge' ? 0.5 + r() * 0.15 : 0.45 + r() * 0.4)
      : form === 'tall' ? (r() - 0.45) * 0.55 : (r() - 0.3) * 1.0;
    const v = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
    const h = k === 0 && form === 'flat' ? 0.66 + r() * 0.06 : (form === 'ridge' && k <= 1) || (form === 'wedge' && k === 0) ? 0.6 + r() * 0.06 : 0.7 + r() * 0.2;
    planes.push({ nx: v.x, ny: v.y, nz: v.z, h, k: (k === 0 && form === 'flat' ? 0.008 : r() < 0.2 ? 0.03 + r() * 0.03 : 0.005 + r() * 0.012) * (spec.cut?.crisp ?? 1) });
  }
  const sq = (form === 'tall' ? 2.9 : 2.6) + r() * 0.4 + (spec.cut?.blocky ?? 0);
  /** The direction the split stepped along (its steps run across it). */
  const sd = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().toArray();
  const ox = r() * 50, oy = r() * 50, oz = r() * 50;
  const lean = ((r() - 0.5) * 6 * Math.PI) / 180, lean2 = ((r() - 0.5) * 6 * Math.PI) / 180;

  const pos = new Float32Array(count * 3);
  /** Per point: how much it is a break (1) or the old rind (0), how deep in a pocket (m), and how near an edge. */
  const breakAt = new Float32Array(count);
  const poreAt = new Float32Array(count);
  const edgeAt = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const dx = sph.pos[i * 3], dy = sph.pos[i * 3 + 1], dz = sph.pos[i * 3 + 2];
    // The old rounded block (its rind), then the breaks.
    const skin = Math.pow(Math.pow(Math.abs(dx), sq) + Math.pow(Math.abs(dy), sq) + Math.pow(Math.abs(dz), sq), -1 / sq);
    let rad = skin, r1 = skin, r2 = 9;
    for (const pl of planes) {
      const dn = pl.nx * dx + pl.ny * dy + pl.nz * dz;
      if (dn <= 1e-3) continue;
      const pr = pl.h / dn;
      if (pr < r1) {
        r2 = r1;
        r1 = pr;
      } else if (pr < r2) r2 = pr;
      rad = smin(rad, pr, pl.k);
    }
    // A break where a plane cut the rind away; an edge where two surfaces nearly tie.
    let brk = smooth(0.0, 0.035, skin - r1);
    const edge = 1 - smooth(0.0, 0.12, (r2 - r1) / r1);
    // The point in meters, before the surface detail.
    let px = dx * rad * half[0], py = dy * rad * half[1], pz = dz * rad * half[2];
    const len = Math.hypot(px, py, pz);
    const ux = px / len, uy = py / len, uz = pz / len;

    // Broad lumps and undulation, warped so they never read as noise.
    const qx = px / big, qy = py / big, qz = pz / big;
    const wx = fbm3f(qx * 3 + ox, qy * 3 + oy, qz * 3 + oz, 2, seed + 21) - 0.5;
    const wy = fbm3f(qx * 3 + oy, qy * 3 + oz, qz * 3 + ox, 2, seed + 22) - 0.5;
    let disp = (fbm3f(qx * 6 + wx * 2 + ox, qy * 6 + wy * 2 + oy, qz * 6 + oz, 3, seed + 23) - 0.5) * 0.012 * big;
    disp += (fbm3f(qx * 2 + ox, qy * 2 + oy, qz * 2 + oz, 2, seed + 26) - 0.5) * 0.05 * big;
    // Grain: rough everywhere, rougher and crumblier along the edges.
    const grain = (fbm3f(px * 38 + oz, py * 38 + ox, pz * 38 + oy, 3, seed + 24) - 0.5) * 0.0036;
    const crumb = spacing < 0.005 ? 1 - Math.abs(noise3f(px * 95 + ox, py * 95 + oy, pz * 95 + oz, seed + 25) * 2 - 1) - 0.5 : 0;
    disp += (grain * (1 + 2.5 * edge) + crumb * 0.0014 * (1 + 3 * edge)) * ch.rough;
    // Knobby, uneven faces at a few centimeters.
    disp += (fbm3f(px * 14 + ox, py * 14 + oz, pz * 14 + oy, 2, seed + 29) - 0.5) * 0.006 * ch.rough;
    // The breaks are rougher than the rind: hackly ripples, and small stepped ledges where the split ran in steps.
    if (brk > 0.01) {
      const rip = (fbm3f(px * 22 + oy, py * 22 + oz, pz * 22 + ox, 3, seed + 27) - 0.5) * 0.008;
      // Steps run roughly parallel across a break, wavering, about 2 cm apart, in patches.
      const st = (px * sd[0] + py * sd[1] + pz * sd[2]) * 45 + (fbm3f(px * 10 + ox, py * 10 + oy, pz * 10 + oz, 2, seed + 28) - 0.5) * 4;
      const saw = Math.floor(st) + smooth(0.72, 1, st - Math.floor(st)) - st;
      const where = smooth(0.42, 0.58, fbm3f(px * 4 + oz, py * 4 + ox, pz * 4 + oy, 2, seed + 30));
      disp += brk * (rip + saw * 0.0034 * where) * ch.rough;
    }
    // Chipped edges: shell-shaped bites out of the line where two faces meet, from big chunks knocked off the corners
    // to small crumbs. A chip shows fresh stone, so it takes the break's colors.
    let chip = 0;
    if (edge > 0.02) {
      chip += smooth(0.15, 0.6, edge) * pits(px + ox * 0.5, py + oy * 0.5, pz + oz * 0.5, 0.11 * Math.sqrt(big), 0.55, 0.35, 0.6, 0.45, seed + 34);
      chip += edge * pits(px + ox, py + oy, pz + oz, 0.05, 0.9, 0.38, 0.66, 0.7, seed + 31);
      chip += edge * pits(px + oy, py + oz, pz + ox, 0.022, 0.8, 0.32, 0.55, 0.65, seed + 32);
      if (spacing < 0.004) chip += edge * pits(px + oz, py + ox, pz + oy, 0.012, 0.4, 0.3, 0.5, 0.35, seed + 35);
      chip *= ch.chipped;
      disp -= chip;
      brk = Math.max(brk, smooth(0.0008, 0.005, chip));
    }
    // Broad, shallow dimples, 4 to 8 cm across, all over.
    disp -= pits(px + oz, py + oy, pz + ox, 0.085, 0.45, 0.25, 0.45, 0.16, seed + 33);
    // Pockets: porosity varies over the stone, some faces pitted, others nearly clean.
    const zone = smooth(0.32, 0.72, fbm3f(qx * 3.5 + 40, qy * 3.5, qz * 3.5 + 11, 3, seed + 41));
    let pore = 0;
    if (zone > 0.02) {
      pore += pits(px + oy, py + oz, pz + ox, 0.06, Math.min(1, 0.14 * zone * ch.porous), 0.12, 0.28, 0.8, seed + 51);
      if (spacing < 0.0055) pore += pits(px + oz, py + ox, pz + oy, 0.022, Math.min(1, 0.24 * zone * ch.porous), 0.14, 0.3, 0.6, seed + 52);
    }
    disp -= pore;
    poreAt[i] = pore;
    breakAt[i] = brk;
    edgeAt[i] = edge;

    px += ux * disp;
    py += uy * disp;
    pz += uz * disp;
    // A slight lean.
    const y1 = py * Math.cos(lean) - pz * Math.sin(lean), z1 = py * Math.sin(lean) + pz * Math.cos(lean);
    const x2 = px * Math.cos(lean2) - y1 * Math.sin(lean2), y2 = px * Math.sin(lean2) + y1 * Math.cos(lean2);
    pos[i * 3] = x2;
    pos[i * 3 + 1] = y2;
    pos[i * 3 + 2] = z1;
  }

  // Fit back to the asked size: top at size[2], the buried foot below the ground.
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, pos[i * 3]); maxX = Math.max(maxX, pos[i * 3]);
    minY = Math.min(minY, pos[i * 3 + 1]); maxY = Math.max(maxY, pos[i * 3 + 1]);
    minZ = Math.min(minZ, pos[i * 3 + 2]); maxZ = Math.max(maxZ, pos[i * 3 + 2]);
  }
  const kx = size[0] / (maxX - minX), kz = size[1] / (maxZ - minZ), ky = total / (maxY - minY);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (pos[i * 3] - (minX + maxX) / 2) * kx;
    pos[i * 3 + 1] = (pos[i * 3 + 1] - minY) * ky - (total - size[2]);
    pos[i * 3 + 2] = (pos[i * 3 + 2] - (minZ + maxZ) / 2) * kz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(sph.index as ArrayLike<number>), 1));
  geo.computeVertexNormals();
  relax(geo, 2);

  const cav = cavity(geo);
  const moss = spec.moss ? mossCushions(geo, cav, size[2], seed, ch.moss + (look.mossCover ?? 0)) : null;
  paint(geo, look, { breakAt, poreAt, edgeAt, cav, moss, lichen: spec.moss }, seed, ch);
  return geo;
}

/** Each point's neighbors along the triangle edges, packed: point i's are nb[deg[i]] to nb[deg[i + 1] - 1] (a few twice). */
function neighbors(geo: THREE.BufferGeometry): { deg: Uint32Array; nb: Uint32Array } {
  const idx = geo.index!.array;
  const n = (geo.getAttribute('position') as THREE.BufferAttribute).count;
  const deg = new Uint32Array(n + 1);
  for (let t = 0; t < idx.length; t++) deg[idx[t] + 1] += 2;
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(0, n), nb = new Uint32Array(deg[n]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c;
    nb[fill[b]++] = a; nb[fill[b]++] = c;
    nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { deg, nb };
}

/**
 * Even out the mesh where the shape is steep (the walls of a chip or a pocket stretch the triangles): each point slides
 * along the surface toward the middle of its neighbors, a little each pass, which keeps the shape but spreads the points.
 */
function relax(geo: THREE.BufferGeometry, passes: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const { deg, nb } = neighbors(geo);
  const p = pos.array as Float32Array;
  const next = new Float32Array(p.length);
  for (let it = 0; it < passes; it++) {
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let ax = 0, ay = 0, az = 0;
      const k0 = deg[i], k1 = deg[i + 1];
      for (let k = k0; k < k1; k++) {
        const j = nb[k];
        ax += p[j * 3]; ay += p[j * 3 + 1]; az += p[j * 3 + 2];
      }
      const m = Math.max(1, k1 - k0);
      let dx = ax / m - p[i * 3], dy = ay / m - p[i * 3 + 1], dz = az / m - p[i * 3 + 2];
      const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= nx * dn; dy -= ny * dn; dz -= nz * dn;
      next[i * 3] = p[i * 3] + dx * 0.5;
      next[i * 3 + 1] = p[i * 3 + 1] + dy * 0.5;
      next[i * 3 + 2] = p[i * 3 + 2] + dz * 0.5;
    }
    p.set(next);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

/** Mesh spacing by the yard's quality: the full detail at Max, coarser on phones (the shader's pores and lichen stay). */
export const MOSS_ROCK_SPACING: Record<Quality, number> = { max: 0.0032, balanced: 0.0042, light: 0.006, draft: 0.009 };

/**
 * The cap on a big boulder's segments for the stones drawn in this build after it was approved on the moss rock shapes
 * (Canyon Tech, the moss rock sold by weight, the urn fountains' boulders): a yard sets many of them, and a 5 ft boulder
 * at the moss rock's own cap (160 at Max) is some 150k points. At 104 it is about 65k (a point every 7 mm or so on a
 * 5 ft rock; pores and lichen are the shader's at any mesh). The cap binds from a mean half size (of the length, depth
 * and whole height) of about 0.21 m at Max and 0.22 m at Balanced: a rock whose sides average about 17 in, so a 22 in
 * medium boulder is capped a little (about 104 segments for its 114) and a head-size or double-head stone not at all.
 */
export const BOULDER_MAX_SEGMENTS: Record<Quality, number> = { max: 104, balanced: 84, light: 72, draft: 56 };

/**
 * The cap for a shared shape drawn as many instances (the stones of a water feature, the plain boulders, a rock
 * border's stones): a stream bank sets some six stones a meter, so each is kept light (about 9,600 points at Max, 19k
 * triangles); the material's pores, pits and lichen carry the close-up detail.
 */
export const FIELD_MAX_SEGMENTS: Record<Quality, number> = { max: 40, balanced: 32, light: 24, draft: 16 };

const kept = new Map<string, THREE.BufferGeometry>();
let keptPoints = 0;
/** About 90 MB of finished rocks at most: a yard of some twenty boulders at Max, rebuilt for an edit elsewhere, finds them all. */
const KEEP_POINTS = 1_200_000;

/**
 * A moss rock, from a small cache: a yard rebuilt because something else in the plan changed does not work its rocks
 * out again. Returns a copy the caller owns (it may move and dispose it).
 */
export function mossRock(spec: MossRockSpec): THREE.BufferGeometry {
  const key = JSON.stringify([spec.seed, spec.size, spec.buried, spec.moss, spec.form ?? 'rounded', spec.spacing ?? 0.0032, spec.look ?? null, spec.cut ?? null, spec.maxSegments ?? null]);
  let g = kept.get(key);
  if (g) {
    kept.delete(key);
    kept.set(key, g);
    return g.clone();
  }
  g = buildMossRock(spec);
  kept.set(key, g);
  keptPoints += g.getAttribute('position').count;
  for (const [k, old] of kept) {
    if (keptPoints <= KEEP_POINTS || kept.size <= 1) break;
    kept.delete(k);
    keptPoints -= old.getAttribute('position').count;
    old.dispose();
  }
  return g.clone();
}

/**
 * How sunk each point is, at two scales: the fine one from its ring of neighbors (pockets, grain), the broad one
 * smoothed over several rings (hollows, the crease under an overhang). Positive in a hollow, negative on a ridge, in
 * units of the mesh spacing.
 */
function cavity(geo: THREE.BufferGeometry): { fine: Float32Array; broad: Float32Array } {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const idx = geo.index!.array;
  const n = pos.count;
  const sum = new Float32Array(n * 3), cnt = new Float32Array(n);
  let edge = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      sum[p * 3] += pos.getX(q); sum[p * 3 + 1] += pos.getY(q); sum[p * 3 + 2] += pos.getZ(q); cnt[p]++;
      sum[q * 3] += pos.getX(p); sum[q * 3 + 1] += pos.getY(p); sum[q * 3 + 2] += pos.getZ(p); cnt[q]++;
    }
    if (t < 3000) edge += Math.hypot(pos.getX(a) - pos.getX(b), pos.getY(a) - pos.getY(b), pos.getZ(a) - pos.getZ(b));
  }
  const spacing = edge / Math.min(1000, idx.length / 3);
  const fine = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) continue;
    const dx = sum[i * 3] / cnt[i] - pos.getX(i), dy = sum[i * 3 + 1] / cnt[i] - pos.getY(i), dz = sum[i * 3 + 2] / cnt[i] - pos.getZ(i);
    fine[i] = (dx * nrm.getX(i) + dy * nrm.getY(i) + dz * nrm.getZ(i)) / spacing;
  }
  // Broad: the fine value spread over the neighbors a few times.
  const { deg, nb } = neighbors(geo);
  let cur = Float32Array.from(fine);
  for (let it = 0; it < 6; it++) {
    const nx = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = cur[i] * 2;
      for (let k = deg[i]; k < deg[i + 1]; k++) s += cur[nb[k]];
      nx[i] = s / (deg[i + 1] - deg[i] + 2);
    }
    cur = nx;
  }
  return { fine, broad: cur.map((v) => v * 4) };
}

/** Moss: cushions in the hollows of the top and low on the shaded side, pushed out as puffy clumps. 0 to 1 per point. */
function mossCushions(geo: THREE.BufferGeometry, cav: { broad: Float32Array }, height: number, seed: number, more: number): Float32Array {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nrm.getY(i);
    const patch = fbm3f(x * 9 + 3, y * 9, z * 9 + 8, 4, seed + 71);
    const hollow = Math.max(0, cav.broad[i]);
    const north = Math.max(0, -nrm.getZ(i)) * (1 - smooth(0.05, 0.4 * height, y));
    const v = patch + 0.3 * Math.max(0, up - 0.35) + 0.35 * hollow + 0.2 * north - 0.9 + more;
    out[i] = smooth(0.0, 0.06, v) * smooth(-0.02, 0.03, y);
  }
  const p = pos.array as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    if (out[i] <= 0) continue;
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const tuft = fbm3f(x * 140, y * 140, z * 140, 2, seed + 72);
    const puff = out[i] * (0.003 + 0.004 * fbm3f(x * 40, y * 40, z * 40, 2, seed + 73) + 0.002 * tuft);
    p[i * 3] += nrm.getX(i) * puff;
    p[i * 3 + 1] += nrm.getY(i) * puff;
    p[i * 3 + 2] += nrm.getZ(i) * puff;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return out;
}

interface Fields {
  breakAt: Float32Array;
  poreAt: Float32Array;
  edgeAt: Float32Array;
  cav: { fine: Float32Array; broad: Float32Array };
  moss: Float32Array | null;
  lichen: boolean;
}

const col = (hex: string) => new THREE.Color(hex);
const mix = (out: THREE.Color, b: THREE.Color, t: number) => out.lerp(b, Math.min(1, Math.max(0, t)));

function pick(cols: THREE.Color[], t: number, out: THREE.Color) {
  const s = Math.min(0.999, Math.max(0, t)) * (cols.length - 1);
  const k = Math.floor(s);
  return out.copy(cols[k]).lerp(cols[Math.min(cols.length - 1, k + 1)], smooth(0, 1, s - k));
}

/** The stone's colors and baked shading per point, and where the shader draws lichen (`rkA`). */
function paint(geo: THREE.BufferGeometry, look: MossRockLook, f: Fields, seed: number, ch: Character) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const rind = look.rind.map(col), brk = look.breakFace.map(col);
  const iron = col(look.iron[0]), ironDark = col(look.iron[1]), pore = col(look.pore), soil = col(look.soil);
  const m0 = col(look.moss[0]), m1 = col(look.moss[1]);
  const colors = new Float32Array(pos.count * 3);
  const rk = new Float32Array(pos.count * 4);
  const c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nrm.getY(i);
    const b = f.breakAt[i];
    // The stone: rind and break colors, each drifting slowly.
    pick(rind, fbm3f(x * 4 + 5, y * 4, z * 4 + 9, 3, seed + 1), c);
    pick(brk, fbm3f(x * 5 + 2, y * 5 + 7, z * 5, 3, seed + 3), c2);
    c.lerp(c2, b);
    // This rock's own tone: a little lighter or darker, warmer or cooler.
    c.multiplyScalar(ch.tone);
    c.r *= 1 + ch.warm;
    c.b *= 1 - ch.warm;
    // Iron stain: orange-tan clouds, mostly on the breaks, darker at their rims, and seeping in along the edges.
    const ir = fbm3f(x * 7 + 30, y * 7, z * 7 + 3, 4, seed + 4);
    const ironK = (look.ironAmount ?? 1) * ch.iron;
    mix(c, iron, (smooth(0.54, 0.7, ir) * (0.3 + 0.7 * b) + f.edgeAt[i] * 0.1) * 0.38 * ironK);
    mix(c, ironDark, smooth(0.6, 0.64, ir) * (1 - smooth(0.66, 0.72, ir)) * 0.3 * b * ironK);
    // Mottling at a few centimeters.
    c.multiplyScalar(0.9 + 0.2 * fbm3f(x * 26 + 1, y * 26, z * 26 + 2, 2, seed + 14) + (noise3f(x * 70, y * 70, z * 70, seed + 15) - 0.5) * 0.08);
    const mo = f.moss ? f.moss[i] : 0;
    if (mo > 0) {
      c2.copy(m0).lerp(m1, fbm3f(x * 60, y * 60, z * 60, 2, seed + 12));
      // Moss is velvety: bright tips and dark between them.
      c2.multiplyScalar(0.8 + 0.4 * noise3f(x * 500, y * 500, z * 500, seed + 13));
      mix(c, c2, Math.min(1, mo * 1.2));
    }
    // Soil splashed up the foot.
    const foot = 1 - smooth(0.0, 0.06, y);
    mix(c, soil, foot * 0.55);
    // The dark inside the pockets.
    mix(c, pore, smooth(0.0005, 0.007, f.poreAt[i]) * 0.6);

    // Shading baked into the stone: dark pockets and hollows, lighter worn edges and ridges, darker under the shoulders.
    const fineCav = f.cav.fine[i], broad = f.cav.broad[i];
    let shade = 1;
    shade *= fineCav > 0 ? 1 - Math.min(0.45, fineCav * 0.6) : 1 + Math.min(0.12, -fineCav * 0.3);
    shade *= broad > 0 ? 1 - Math.min(0.35, broad * 0.5) : 1 + Math.min(0.08, -broad * 0.2);
    shade *= 0.8 + 0.2 * (up * 0.5 + 0.5);
    c.multiplyScalar(shade);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    // Where the lichens grow (drawn by the shader): the pale crust on the rind, the tops and the faces that look out,
    // less on breaks and in hollows, none under moss or at the soil; the dark crust mostly on the top; orange on the sides.
    if (f.lichen) {
      const clear = (1 - Math.min(1, mo * 2)) * smooth(0.03, 0.09, y);
      const wq = fbm3f(x * 9, y * 9 + 3, z * 9, 2, seed + 6) - 0.5;
      const field = fbm3f(x * 4.5 + wq, y * 4.5 - wq, z * 4.5 + wq, 4, seed + 7) + 0.24 * Math.max(0, up) - 0.12 * b - 0.12 * Math.max(0, broad);
      rk[i * 4] = smooth(0.4, 0.68, field + ch.lichen + (look.paleCrust ?? 0)) * clear;
      rk[i * 4 + 1] = Math.min(1, smooth(0.55, 0.72, fbm3f(x * 7 + 50, y * 7, z * 7, 3, seed + 16)) * (0.25 + 0.75 * Math.max(0, up)) * (1 - 0.7 * b) * clear * ch.dark * (look.darkCrust ?? 1));
      rk[i * 4 + 2] = Math.min(1, smooth(0.56, 0.72, fbm3f(x * 6 + 90, y * 6, z * 6, 3, seed + 17)) * (0.35 + 0.4 * (1 - Math.abs(up))) * clear * ch.orange * (look.orangeDots ?? 1));
    }
    rk[i * 4 + 3] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('rkA', new THREE.BufferAttribute(rk, 4));
}

/* ---- The material ------------------------------------------------------------------- */

const glslColor = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/** One material per lichen palette (the stone's own colors are in the vertices). */
const materials = new Map<string, THREE.MeshStandardMaterial>();

/** A moss rock material: its rocks are kept indexed when merged (a rock's points are each shared by six triangles). */
export function isMossRockMaterial(m: THREE.Material): boolean {
  return [...materials.values()].includes(m as THREE.MeshStandardMaterial);
}

/**
 * The moss rock's material. The stone's colors and shading come in the vertices; the shader draws the sand grain, the
 * pin pits and small pores (as relief and dark), and the lichens, from 3D noise in world space, so there are no
 * texture seams. Each layer fades to its average where a pixel is bigger than it.
 */
export function mossRockMaterial(look: MossRockLook = MOSS_ROCK_TAN): THREE.MeshStandardMaterial {
  const key = look.lichen.join(',');
  const had = materials.get(key);
  if (had) return had;
  const [la, lb, ld, lo] = look.lichen.map(glslColor);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rkA;\nvarying vec4 vRkA;\nvarying vec3 vRk;')
      .replace(
        '#include <worldpos_vertex>',
        // Instanced (the stones of a water feature and the plain boulders share a few shapes): each stone's own place, so
        // no two show the same pores and lichen.
        '#include <worldpos_vertex>\nvec4 rkP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrkP = instanceMatrix * rkP;\n#endif\nvRk = (modelMatrix * rkP).xyz;\nvRkA = rkA;',
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRk;
varying vec4 vRkA;
uvec3 rkPcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 rkHash3(vec3 i) { return vec3(rkPcg(uvec3(ivec3(floor(i)) + 65536))) * (1.0 / 4294967295.0); }
float rkHash(vec3 i) { return rkHash3(i).x; }
float rkNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i), rkHash(i + vec3(1, 0, 0)), f.x), mix(rkHash(i + vec3(0, 1, 0)), rkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rkHash(i + vec3(0, 0, 1)), rkHash(i + vec3(1, 0, 1)), f.x), mix(rkHash(i + vec3(0, 1, 1)), rkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Round pits in unit cells: x is the depth profile (0 outside, 1 at the bottom).
float rkPore(vec3 p, float present) {
  vec3 i = floor(p - 0.5);
  float best = 9.0; vec3 bh = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 c = i + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 h = rkHash3(c + 0.37);
    float d = length(c + 0.25 + h * 0.5 - p);
    if (d < best) { best = d; bh = h; }
  }
  if (bh.z > present) return 0.0;
  float r = 0.18 + 0.22 * fract(bh.x * 7.1 + bh.y);
  float t = best / r;
  return t >= 1.0 ? 0.0 : sqrt(1.0 - t * t);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
// How big a pixel is on the stone, and how much of each scale of detail it can show.
float rkFoot = length(fwidth(vRk));
float rkSf = 1.0 - smoothstep(0.0003, 0.0011, rkFoot);
float rkFine = 1.0 - smoothstep(0.0006, 0.0025, rkFoot);
float rkMid = 1.0 - smoothstep(0.0015, 0.006, rkFoot);
vec3 rkStone = diffuseColor.rgb;
// Sand grain: light and dark mineral specks.
float rkG1 = rkNoise(vRk * 900.0 + 21.0), rkG2 = rkNoise(vRk * 820.0 + 2.0), rkG3 = rkNoise(vRk * 760.0);
rkStone *= mix(1.0, (0.86 + 0.28 * rkG3) * (1.0 + 0.3 * smoothstep(0.8, 0.9, rkG1)) * (1.0 - 0.45 * smoothstep(0.2, 0.1, rkG2)), rkFine);
rkStone *= mix(1.0, 0.93 + 0.14 * rkNoise(vRk * 140.0 + 9.0), rkMid);
// Pin pits (1 to 2 mm) in a sandpaper over most of the stone, small pores (2 to 4 mm) and a few bigger ones (4 to 8 mm).
vec3 rkW = vec3(rkNoise(vRk * 55.0), rkNoise(vRk * 55.0 + 7.0), rkNoise(vRk * 55.0 + 13.0)) - 0.5;
float rkCl = rkNoise(vRk * 16.0 + 3.0);
float rkP0 = rkPore(vRk * 560.0 + rkW * 2.5, 0.12 + 0.45 * rkCl) * rkFine;
float rkP1 = rkPore(vRk * 240.0 + rkW * 1.6 + 5.0, 0.05 + 0.25 * rkCl * rkCl) * rkMid;
float rkP2 = rkPore(vRk * 120.0 + rkW + 11.0, 0.02 + 0.12 * rkCl * rkCl) * rkMid;
float rkPf = (1.0 - 0.35 * smoothstep(0.0, 0.8, rkP0)) * (1.0 - 0.5 * smoothstep(0.0, 0.7, rkP1)) * (1.0 - 0.6 * smoothstep(0.0, 0.7, rkP2));
rkStone *= rkPf;
// Lichens, in the stone's own shading. The pale crust: lacy patches whose cover follows rkA.x.
float rkSh = vRkA.w, rkL = 0.0, rkCrack = 0.0;
if (vRkA.x > 0.01) {
  float n = 0.45 * rkNoise(vRk * 70.0) + 0.33 * rkNoise(vRk * 190.0 + 3.1) + 0.22 * mix(0.5, rkNoise(vRk * 480.0 + 7.7), rkFine);
  float thr = 0.9 - 0.42 * vRkA.x, w = 0.012 + 1.5 * fwidth(n);
  rkL = smoothstep(thr - w, thr + w, n);
  // A fringe of loose specks around each patch.
  float sp = rkNoise(vRk * 620.0 + 2.2);
  rkL = max(rkL, smoothstep(0.86, 0.9, sp) * smoothstep(thr - 0.12, thr - 0.02, n) * rkFine);
  vec3 lc = mix(${la}, ${lb}, smoothstep(0.3, 0.7, rkNoise(vRk * 8.0 + 1.0)));
  // Some patches yellower, some grayer; older middles a little browner.
  lc *= mix(vec3(1.0), vec3(1.06, 1.04, 0.86), smoothstep(0.55, 0.8, rkNoise(vRk * 22.0 + 5.0)));
  lc = mix(lc, lc * vec3(0.86, 0.8, 0.7), smoothstep(thr + 0.06, thr + 0.2, n) * 0.6);
  // The crust is cracked into small areoles and bumpy: dark seams, bright tops.
  float ar = rkNoise(vRk * 340.0 + 6.0);
  rkCrack = (1.0 - smoothstep(0.0, 0.07, abs(rkNoise(vRk * 260.0 + 9.0) - 0.5))) * rkFine;
  lc *= mix(1.0, (0.78 + 0.4 * ar) * (0.85 + 0.3 * rkNoise(vRk * 900.0 + 4.0)), rkFine) * (1.0 - 0.3 * rkCrack);
  lc *= mix(0.75, 1.04, smoothstep(thr, thr + 0.08, n));
  // Fruiting discs: tiny brown dots in the older crust.
  float ap = rkPore(vRk * 700.0 + 3.0, 0.25) * smoothstep(thr + 0.05, thr + 0.15, n) * rkFine;
  lc = mix(lc, vec3(0.11, 0.07, 0.04), smoothstep(0.1, 0.5, ap) * 0.85);
  rkStone = mix(rkStone, lc * rkSh * mix(1.0, rkPf, 0.5), rkL);
}
if (vRkA.y > 0.01) {
  float n = 0.6 * rkNoise(vRk * 110.0 + 17.0) + 0.4 * mix(0.5, rkNoise(vRk * 330.0 + 5.0), rkMid);
  float thr = 0.9 - 0.45 * vRkA.y, w = 0.012 + 1.5 * fwidth(n);
  rkStone = mix(rkStone, ${ld} * rkSh * (0.85 + 0.3 * rkNoise(vRk * 500.0)), smoothstep(thr - w, thr + w, n) * (1.0 - 0.6 * rkL));
}
if (vRkA.z > 0.01) {
  float n = 0.5 * rkNoise(vRk * 260.0 + 31.0) + 0.5 * rkNoise(vRk * 90.0 + 8.0);
  float thr = 0.94 - 0.28 * vRkA.z, w = 0.012 + 1.5 * fwidth(n);
  rkStone = mix(rkStone, ${lo} * rkSh, smoothstep(thr - w, thr + w, n) * (1.0 - rkL));
}
diffuseColor.rgb = rkStone;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float h = (rkNoise(vRk * 520.0) - 0.5) * 0.0007 * rkFine + (rkNoise(vRk * 1400.0 + 1.0) - 0.5) * 0.0003 * rkSf + (rkNoise(vRk * 170.0 + 3.0) - 0.5) * 0.0012 * rkMid;
  h -= rkP0 * 0.0003 + rkP1 * 0.0009 + rkP2 * 0.0016;
  h += rkL * (0.0006 + (rkNoise(vRk * 900.0) - 0.5) * 0.0004 * rkFine - rkCrack * 0.0003);
  vec3 dpx = dFdx(vRk), dpy = dFdy(vRk);
  vec2 dh = vec2(dFdx(h) / max(1e-6, length(dpx)), dFdy(h) / max(1e-6, length(dpy)));
  vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
}`,
      );
  };
  m.customProgramCacheKey = () => `mossrock-10:${key}`;
  materials.set(key, m);
  return m;
}
