import * as THREE from 'three';
import { layingOf, type ConcreteFinish, type StampPattern, type FenceStyle, type LayingPattern, type MaterialSpec, type PaverPattern, type UnitFace, type WallFace, type WallUnit } from '../siteplan/catalog';
import { rng } from '../siteplan/geometry';
import { clamp01, fbm, smooth, vnoise, voronoi } from './noise';
import { hash, hexRGB, maxAnisotropy, mixRGB, mulRGB, paint, paintPreviewing, textureSet, type PBRSet, type RGB } from './textures';
import { WALL_FACES } from './wallfaces';
import { CLOD_MAX, CLOD_TILE, clodField } from './humus-field';
import { boardFaceSet } from './deckboards';
import { EDGE_RANGE, type DetailFace, type PaverEdges } from './paver-detail';

/**
 * Surface recipes: pavers in every laying pattern, concrete finishes, mulch,
 * rock, turf, wall faces and fence boards. All seamless, all in meters.
 */

const IN = 0.0254;
const JOINT_SAND: RGB = [0.5, 0.47, 0.42];

/*
 * A maker's colors come from its swatch photos, which show the stone as it looks lit. In the default afternoon light
 * this renderer shows a horizontal surface about twice as bright as its albedo and bluer (sky fill): measured on
 * Belgard pavers, rendered linear = gain * albedo + offset per channel. So a maker color is turned into the albedo that
 * renders back to the swatch's own color. Hand-picked generic colors were chosen in this light and stay as they are.
 */
const PHOTO_GAIN: RGB = [1.99, 2.25, 2.9];
const PHOTO_OFFSET: RGB = [0.019, 0.018, 0.029];
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
/** The albedo (hex) that renders as this photographed color in the default light. */
export function photoAlbedo(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(toSrgb(Math.max(0.002, (toLin(v / 255) - PHOTO_OFFSET[i]) / PHOTO_GAIN[i])) * 255));
  return '#' + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/**
 * True when a look's palette is read from a maker's swatch photo, so it is turned to albedo. A "same as the main
 * course" border (`border-of-...`) carries its line's photo palette but no maker tag (the tag would list it in the
 * pickers on its own), so it is matched by its id.
 */
const fromPhoto = (spec: MaterialSpec) => !!spec.maker || spec.id.startsWith('border-of-');

function pal(spec: MaterialSpec): RGB[] {
  return spec.palette.map((h) => hexRGB(fromPhoto(spec) ? photoAlbedo(h) : h));
}

/*
 * Wall faces stand upright: they see half the sky and the yard below, so the paving calibration above (tuned on the
 * open, sky-lit top of a paver) leaves them dark and brown. A maker wall's face texture is instead scaled so its
 * average albedo renders back to the swatch photo's average, taken around all four sides of a wall in the default
 * afternoon light (the sunny side reads brighter, the shady side darker): measured, rendered linear = WALL_GAIN * albedo.
 */
const WALL_GAIN: RGB = [1.68, 1.77, 2.0];
/** The swatch photo's average color, in linear light (the mean of the palette's tones). */
function photoMean(spec: MaterialSpec): RGB {
  const s: RGB = [0, 0, 0];
  for (const h of spec.palette) {
    const n = parseInt(h.slice(1), 16);
    [(n >> 16) & 255, (n >> 8) & 255, n & 255].forEach((v, i) => (s[i] += toLin(v / 255) / spec.palette.length));
  }
  return s;
}
/** Linear average albedo for a maker wall's face, so it renders as its swatch photo on an upright face. */
function wallFaceMean(spec: MaterialSpec): RGB {
  return photoMean(spec).map((v, i) => v / WALL_GAIN[i]) as RGB;
}
/** Linear average albedo for a maker stone seen from above (a wall cap), by the paving calibration. */
function topMean(spec: MaterialSpec): RGB {
  return photoMean(spec).map((v, i) => Math.max(0.002, (v - PHOTO_OFFSET[i]) / PHOTO_GAIN[i])) as RGB;
}
/**
 * A maker wall's tones as photographed. In a swatch photo of a wall the darkest of the four tones is mostly joint shadow,
 * so the stones take the lighter tones and the joints the darkest; used as the stone colors it made whole units and
 * blotches far darker than the photo shows. (The face's overall color is then set by wallFaceMean.)
 */
function wallTones(spec: MaterialSpec): { stone: RGB[]; joint: RGB } {
  const t = spec.palette.map(hexRGB);
  return { stone: t.length >= 4 ? t.slice(0, -1) : t, joint: t[t.length - 1] };
}

function pick(p: RGB[], r: number): RGB {
  const i = Math.min(p.length - 1, Math.floor(r * p.length));
  return p[i];
}

/* ------------------------------------------------------------------ */
/* Paver layouts                                                        */
/* ------------------------------------------------------------------ */

/** A piece at a texel: its id and the distance to its nearest edge (meters). */
interface PieceHit {
  id: number;
  edge: number;
  /** Position inside the piece, 0..1 along its length, for wood grain. */
  along: number;
  /** True when the piece runs along v (rotated). */
  rotated: boolean;
  /** Piece length in meters. */
  len: number;
  /** Position inside the piece from its corner, meters (module patterns; a clouded blend is drawn in these). */
  lx?: number;
  ly?: number;
}

interface Layout {
  tile: number;
  at(x: number, y: number): PieceHit;
  /** A module layout's module (Belgard's published patterns), whose joints repeat on its lattice. */
  module?: PieceModule;
}

/** Pack rectangles on a wrapping unit grid; used for ashlar and herringbone-free random patterns. */
function packedLayout(sizesIn: [number, number][], unitIn: number, units: number, seed: string): Layout {
  const r = rng(seed);
  const N = units;
  const owner = new Int32Array(N * N).fill(-1);
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (owner[((y + j) % N) * N + ((x + i) % N)] >= 0) return false;
    return true;
  };
  const options = sizesIn.flatMap(([a, b]) => {
    const w = Math.round(a / unitIn), h = Math.round(b / unitIn);
    return w === h ? [[w, h]] : [[w, h], [h, w]];
  });
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (owner[y * N + x] >= 0) continue;
      // Try sizes in random order, biggest pieces a little more often.
      const order = options.map((o) => ({ o, k: r() * (0.6 + (o[0] * o[1]) / 30) })).sort((a, b) => b.k - a.k);
      let placed = false;
      for (const { o } of order) {
        if (free(x, y, o[0], o[1])) {
          const id = rects.length;
          rects.push({ x, y, w: o[0], h: o[1] });
          for (let j = 0; j < o[1]; j++) for (let i = 0; i < o[0]; i++) owner[((y + j) % N) * N + ((x + i) % N)] = id;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Fill a gap with the largest piece that fits, down to a single unit.
        let w = 1, h = 1;
        while (w < 4 && free(x, y, w + 1, 1)) w++;
        while (h < 4 && free(x, y, w, h + 1)) h++;
        const id = rects.length;
        rects.push({ x, y, w, h });
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) owner[((y + j) % N) * N + ((x + i) % N)] = id;
      }
    }
  }
  const unit = unitIn * IN;
  return {
    tile: N * unit,
    at(x: number, y: number) {
      const gx = x / unit, gy = y / unit;
      const cx = Math.floor(gx) % N, cy = Math.floor(gy) % N;
      const id = owner[cy * N + cx];
      const R = rects[id];
      // Local position in the rect, accounting for wrap.
      let lx = gx - R.x, ly = gy - R.y;
      if (lx < 0) lx += N;
      if (ly < 0) ly += N;
      const edge = Math.min(lx, R.w - lx, ly, R.h - ly) * unit;
      const rotated = R.h > R.w;
      return { id, edge, along: rotated ? ly / R.h : lx / R.w, rotated, len: Math.max(R.w, R.h) * unit };
    },
  };
}

function runningLayout(w: number, h: number, offsetFrac: number, randomOffsets: boolean, rows: number, perRow: number, seed: string): Layout {
  const W = w * IN, H = h * IN;
  const tile = Math.max(perRow * W, rows * H);
  const rowsN = Math.round(tile / H);
  const r = rng(seed);
  const offs = Array.from({ length: rowsN }, (_, i) => (randomOffsets ? Math.floor(r() * 3) / 3 : (i % 2) * offsetFrac) * W);
  return {
    tile,
    at(x: number, y: number) {
      const row = Math.floor(y / H) % rowsN;
      const xs = x + offs[row];
      const col = Math.floor(xs / W);
      const lx = xs - col * W, ly = y - Math.floor(y / H) * H;
      const cols = Math.round(tile / W);
      const id = row * 997 + (((col % cols) + cols) % cols);
      return { id, edge: Math.min(lx, W - lx, ly, H - ly), along: lx / W, rotated: false, len: W, lx, ly };
    },
  };
}

function herringboneLayout(w: number, h: number): Layout {
  // 2:1 bricks on a unit grid: cells with (x - y) mod 4 in {0,1} are
  // horizontal bricks, {2,3} vertical.
  const U = h * IN;
  const L = w * IN;
  const k = Math.round(L / U);
  const period = 2 * k;
  return {
    tile: period * U * 2,
    at(x: number, y: number) {
      const gx = x / U, gy = y / U;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      const v = (((cx - cy) % period) + period) % period;
      if (v < k) {
        // Horizontal brick starting at cx - v.
        const x0 = cx - v;
        const lx = gx - x0, ly = gy - cy;
        return { id: x0 * 131 + cy * 7, edge: Math.min(lx, k - lx, ly, 1 - ly) * U, along: lx / k, rotated: false, len: L };
      }
      // Vertical brick: its bottom cell has v = 2k-1 ... cells stack upward.
      const off = period - 1 - v; // 0 at the bottom cell
      const y0 = cy - off;
      const lx = gx - cx, ly = gy - y0;
      return { id: cx * 131 + y0 * 7 + 50000, edge: Math.min(lx, 1 - lx, ly, k - ly) * U, along: ly / k, rotated: true, len: L };
    },
  };
}

function basketLayout(w: number, h: number): Layout {
  const U = h * IN; // two bricks side by side make a square of w x w
  const S = w * IN;
  return {
    tile: S * 4,
    at(x: number, y: number) {
      const bx = Math.floor(x / S), by = Math.floor(y / S);
      const lx = x - bx * S, ly = y - by * S;
      const vert = (bx + by) % 2 === 0;
      if (vert) {
        const i = Math.floor(lx / U);
        const llx = lx - i * U;
        return { id: bx * 31 + by * 17 + i, edge: Math.min(llx, U - llx, ly, S - ly), along: ly / S, rotated: true, len: S };
      }
      const i = Math.floor(ly / U);
      const lly = ly - i * U;
      return { id: bx * 31 + by * 17 + i + 7000, edge: Math.min(lx, S - lx, lly, U - lly), along: lx / S, rotated: false, len: S };
    },
  };
}

function cobbleLayout(sizes: [number, number][], seed: string): Layout {
  // Rows of equal height, random lengths, wrapped to the tile width.
  const H = sizes[0][1] * IN;
  const lens = sizes.map((s) => s[0] * IN);
  const tile = 72 * IN;
  const rows = Math.round(tile / H);
  const r = rng(seed);
  const rowCuts: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const cuts = [0];
    let acc = 0;
    while (acc < tile - 1e-6) {
      let l = lens[Math.floor(r() * lens.length)];
      if (tile - acc - l < lens[0] * 0.99 && tile - acc - l > 1e-6) l = tile - acc;
      acc = Math.min(tile, acc + l);
      cuts.push(acc);
    }
    const shift = r() * tile;
    rowCuts.push(cuts.map((c) => c + shift));
  }
  return {
    tile,
    at(x: number, y: number) {
      const row = Math.floor(y / H) % rows;
      const cuts = rowCuts[row];
      const shift = cuts[0];
      const xs = ((((x - shift) % tile) + tile) % tile) + shift;
      let k = 0;
      while (k < cuts.length - 2 && xs >= cuts[k + 1]) k++;
      const a = cuts[k], b = cuts[k + 1];
      const ly = y - Math.floor(y / H) * H;
      return { id: row * 101 + k, edge: Math.min(xs - a, b - xs, ly, H - ly), along: (xs - a) / (b - a), rotated: false, len: b - a };
    },
  };
}

/*
 * Belgard's published 3-Piece laying patterns, read from the vector drawings on Belgard's Avalon Slate pattern sheet.
 * Each is one module of pieces [x, y, w, h] (inches) repeated on a lattice v1, v2; P is the smallest square the
 * pattern repeats over, so the texture tiles. Both use the pallet mix by area: 25% 6 x 12, 25% 9 x 12, 50% 12 x 12.
 * A: 12 in wide courses of 6, 9 and 12 in pieces, a 48 x 42 in module. B: a 36 x 30 in module mixing both directions.
 */
interface PieceModule {
  pieces: [number, number, number, number][];
  v1: [number, number];
  v2: [number, number];
  P: number;
  /** Laid at 45 degrees. */
  diagonal?: boolean;
  /** Real inches per inch of the drawing (a maker module a little under nominal, PaverPattern.scale); left out, 1. */
  scale?: number;
}
const THREE_PIECE: Record<'a' | 'b', PieceModule> = {
  a: {
    pieces: [[0, 0, 12, 9], [0, 9, 12, 9], [12, 0, 12, 6], [12, 6, 12, 9], [12, 15, 12, 12], [12, 27, 12, 9], [12, 36, 12, 6], [24, 0, 12, 12], [24, 12, 12, 6], [24, 18, 12, 12], [24, 30, 12, 12], [36, 0, 12, 6], [36, 6, 12, 12], [36, 18, 12, 6], [36, 24, 12, 12], [36, 36, 12, 6]],
    v1: [48, 24], v2: [12, 42], P: 288,
  },
  b: {
    pieces: [[12, 0, 12, 9], [12, 9, 12, 9], [24, 0, 12, 12], [24, 12, 12, 6], [0, 18, 6, 12], [6, 18, 12, 12], [18, 18, 6, 12], [24, 18, 12, 12]],
    v1: [12, -30], v2: [-24, -12], P: 144,
  },
};

/*
 * Antiqued Flat Top's own patterns (6 x 9, 9 x 9 and 9 x 12), traced from Belgard's Antiqued Flat Top pattern sheet
 * (BEL24-D-309009): the highlighted module of each drawing, measured on a 3 in grid.
 * a: 3-Piece Pattern A, 11 pieces repeating on (30, -6) and (9, 27); 25% 6 x 9, 37.5% 9 x 9, 37.5% 9 x 12 by area,
 *    exactly the pallet mix.
 * running3: 3-Piece Running Bond, 9 in courses of 6, 9 and 12 in pieces, four courses of 48 in repeating every 36 in.
 * herringbone: 1-Piece Herringbone of 6 x 9 at 45 degrees, as drawn: one piece each way, repeating on (9, 9) and
 *    (-6, 6), so it repeats square every 18 x sqrt(2) in (the texture holds six of those each way).
 */
const ANTIQUED: Record<'a' | 'running3' | 'herringbone', PieceModule> = {
  a: {
    pieces: [[0, 0, 9, 6], [9, 0, 9, 12], [18, 0, 9, 9], [27, 0, 12, 9], [18, 9, 12, 9], [30, 9, 9, 9], [9, 12, 9, 9], [18, 18, 6, 9], [24, 18, 9, 9], [33, 18, 6, 9], [9, 21, 9, 6]],
    v1: [30, -6], v2: [9, 27], P: 288,
  },
  running3: {
    pieces: [[0, 0, 9, 9], [9, 0, 12, 9], [21, 0, 9, 9], [30, 0, 6, 9], [36, 0, 12, 9], [6, 9, 6, 9], [12, 9, 6, 9], [18, 9, 9, 9], [27, 9, 6, 9], [33, 9, 9, 9], [42, 9, 12, 9], [0, 18, 6, 9], [6, 18, 9, 9], [15, 18, 6, 9], [21, 18, 9, 9], [30, 18, 6, 9], [36, 18, 12, 9], [3, 27, 9, 9], [12, 27, 6, 9], [18, 27, 9, 9], [27, 27, 12, 9], [39, 27, 12, 9]],
    v1: [48, 0], v2: [0, 36], P: 144,
  },
  // Six repeats each way, so piece colors do not visibly repeat every 2 ft.
  herringbone: { pieces: [[0, 0, 9, 6], [-6, -3, 6, 9]], v1: [9, 9], v2: [-6, 6], P: 6 * 18 * Math.SQRT2, diagonal: true },
};

/*
 * Basalite's two published Premier Smooth patterns, traced from the vector drawings of its Premier Smooth Pattern
 * Brochure (CA, 2023/2025): the gray-shaded repeat of each, in nominal inches (Basalite's drawings are nominal, 55.3 pt
 * to 12 in), on the lattice its copies sit on. Laid out at the real 11.79 in module (PaverPattern.scale).
 * combo3: 3 Piece Combo Pattern, 100% combo: three 6 x 12, two 9 x 12, one 12 x 12, exactly the pallet's 3 : 2 : 1;
 *         repeats on (18, 15) and (12, 42), square every 192 in.
 * combo4: 4 Piece Pattern #4, 73% combo and 27% 12 x 18 by area (the brochure's own split): the same six pieces plus a
 *         12 x 18 laid long side across; repeats on (18, 15) and (-6, 39), square every 264 in.
 */
const BASALITE_MODULES: Record<'combo3' | 'combo4', PieceModule> = {
  combo3: {
    pieces: [[12, 6, 12, 12], [12, 18, 12, 9], [12, 0, 12, 6], [0, 12, 12, 9], [0, 21, 12, 6], [6, 0, 6, 12]],
    v1: [18, 15], v2: [12, 42], P: 192,
  },
  combo4: {
    pieces: [[6, 0, 18, 12], [6, 12, 6, 12], [12, 18, 12, 12], [12, 30, 12, 9], [12, 12, 12, 6], [0, 24, 12, 9], [0, 33, 12, 6]],
    v1: [18, 15], v2: [-6, 39], P: 264,
  },
};

function moduleLayout(m: PieceModule): Layout {
  const det = m.v1[0] * m.v2[1] - m.v1[1] * m.v2[0];
  const P = m.P;
  const R = Math.SQRT1_2;
  // Drawing inches to meters.
  const U = IN * (m.scale ?? 1);
  return {
    module: m,
    tile: P * U,
    at(x: number, y: number) {
      let X = x / U, Y = y / U;
      // A diagonal pattern is drawn square and turned 45 degrees: its lattice holds (P, 0) and (0, P) once turned.
      if (m.diagonal) [X, Y] = [(X + Y) * R, (Y - X) * R];
      // Lattice coordinates of the point, then the copy of the module that holds it.
      const a = Math.floor((X * m.v2[1] - Y * m.v2[0]) / det), b = Math.floor((m.v1[0] * Y - m.v1[1] * X) / det);
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
        const i = a + di, j = b + dj;
        const ox = i * m.v1[0] + j * m.v2[0], oy = i * m.v1[1] + j * m.v2[1];
        const qx = X - ox, qy = Y - oy;
        for (let k = 0; k < m.pieces.length; k++) {
          const [px, py, pw, ph] = m.pieces[k];
          if (qx >= px && qx < px + pw && qy >= py && qy < py + ph) {
            // The id comes from where the piece sits inside the repeat, so the same piece keeps its color across tiles.
            let mx = ox + px + pw / 2, my = oy + py + ph / 2;
            if (m.diagonal) [mx, my] = [(mx - my) * R, (mx + my) * R];
            const cx = (((mx % P) + P) % P), cy = (((my % P) + P) % P);
            const rotated = ph > pw;
            const edge = Math.min(qx - px, px + pw - qx, qy - py, py + ph - qy) * U;
            const along = rotated ? (qy - py) / ph : (qx - px) / pw;
            return { id: Math.round(cx * 2) * 1009 + Math.round(cy * 2), edge, along, rotated, len: Math.max(pw, ph) * U, lx: (qx - px) * U, ly: (qy - py) * U };
          }
        }
      }
      return { id: 0, edge: 0, along: 0, rotated: false, len: 0 };
    },
  };
}

/**
 * The repeat (inches) of a soldier course texture of a x b pavers (a along the edge, b across). It must hold whole
 * pieces both ways, or the band (exactly b wide, from the tile's edge) straddles two rows; so it is a common multiple
 * of a and b, >= 36 in. It holds L / b rows of L / a pieces.
 */
export function soldierTileIn(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const lcm = (a * b) / gcd(Math.round(a * 8), Math.round(b * 8)) * 8;
  return lcm * Math.max(1, Math.ceil(36 / lcm));
}

function layoutFor(p: PaverPattern, seed: string, laying?: LayingPattern): Layout {
  const [a, b] = p.sizes[0];
  const s = p.scale ?? 1;
  // Basalite's own patterns (Premier Smooth), on the maker's real module.
  if (laying === 'combo3' || laying === 'combo4') return moduleLayout({ ...BASALITE_MODULES[laying], scale: s });
  // 1-piece patterns of 6 x 9 (Antiqued Flat Top): half bond, 9 in along the course; or the 45 degree herringbone.
  if (laying === 'running') return runningLayout(9, 6, 0.5, false, 24, 16, seed);
  if (laying === 'herringbone') return moduleLayout(ANTIQUED.herringbone);
  if (laying === 'running3' || (laying === 'a' && p.face === 'antiqued')) return moduleLayout(ANTIQUED[laying]);
  if ((laying === 'a' || laying === 'b') && p.kind === 'ashlar') return moduleLayout(THREE_PIECE[laying]);
  switch (p.kind) {
    case 'running': return runningLayout(a, b, 0.5, false, 12, 6, seed);
    case 'soldier': {
      const L = soldierTileIn(a, b);
      return runningLayout(a * s, b * s, 0, false, Math.round(L / b), Math.round(L / a), seed);
    }
    case 'plank': return runningLayout(a, b, 0.33, true, Math.round(96 / b), Math.max(2, Math.round(96 / a)), seed);
    // A clouded blend repeats every 3 x 3 slabs, so its streaks do not repeat every second slab.
    case 'grid': return runningLayout(a, b, 0, false, p.blend === 'cloud' ? 3 : 2, p.blend === 'cloud' ? 3 : 2, seed);
    case 'herringbone': return herringboneLayout(a, b);
    case 'basket': return basketLayout(a, b);
    case 'cobble': return cobbleLayout(p.sizes, seed);
    case 'ashlar': {
      const unit = p.sizes.some((s) => s[0] % 6 || s[1] % 6) ? 3 : 6;
      return packedLayout(p.sizes, unit, unit === 3 ? 32 : 24, seed);
    }
  }
}

/*
 * A clouded blend (Basalite Premier Slab): the light tone, the two middle tones and the dark tone drift through each
 * slab in broad, soft streaks, all running one way on a slab and a different way on the next (Basalite's swatch photos).
 * Drawn in the slab's own coordinates (meters from its corner): a slab never crosses the texture's edge, so this noise
 * need not tile. `colors` are light, the two middle tones, dark.
 */
function cloudTone(colors: RGB[], lx: number, ly: number, id: number, r1: number, r2: number): RGB {
  // Streaks run roughly along one side of the slab or the other, leaning up to 15 degrees.
  const th = (r1 < 0.5 ? 0 : Math.PI / 2) + (((r1 * 2) % 1) - 0.5) * 0.52;
  const ca = Math.cos(th), sa = Math.sin(th);
  // Along and across the streaks, meters.
  const su = lx * ca + ly * sa, sv = -lx * sa + ly * ca;
  const s = 70 + (id % 89) * 3;
  const nf = (a: number, b: number, k: number) => vnoise(a, b, 1e6, s + k) * 0.55 + vnoise(a * 2.1, b * 2.1, 1e6, s + k + 1) * 0.3 + vnoise(a * 4.3, b * 4.3, 1e6, s + k + 2) * 0.15;
  const warp = (nf(su * 1.6, sv * 1.6, 0) - 0.5) * 0.9;
  // The tones meet in a fine, powdery speckle rather than a clean line: a few millimeters of grain on every threshold.
  const grain = (vnoise(lx * 120, ly * 120, 1e6, s + 40) - 0.5) * 0.09 + (vnoise(lx * 90, ly * 90, 1e6, s + 41) - 0.5) * 0.05;
  // Drifts about 30 to 60 cm long and 6 to 20 cm wide.
  const n1 = nf(su * 1.5, sv * 3.6 + warp, 10) + grain;
  const n2 = nf(su * 1.6 + 3.1, sv * 6 + warp * 1.3, 20) + grain;
  const n3 = nf(su * 1.8 + 7.7, sv * 8 + warp * 1.6, 30) + grain;
  const [light, midA, midB, dark] = [colors[0], colors[1] ?? colors[0], colors[2] ?? colors[1] ?? colors[0], colors[colors.length - 1]];
  // Each slab leans a little lighter or darker overall, as the photo's slabs do.
  let c = mixRGB(midA, light, smooth(0.41, 0.6, n1 + (r2 - 0.5) * 0.12));
  c = mixRGB(c, midB, smooth(0.55, 0.7, n2) * 0.85);
  c = mixRGB(c, dark, smooth(0.57, 0.72, n3) * 0.8);
  return c;
}

/*
 * A face mix (Basalite Premier Smooth): a base tone with drifts of the other tones through each piece, the way the
 * maker's swatch photos show them: drifts a few inches wide and about a foot long running roughly along one side of the
 * piece or the other, crisp, with powdery speckled edges. Each tone covers the share of the face `mix` gives it (read
 * from the photo): tones are laid in order over the base, so tone i shows where its own field passes a threshold and no
 * later tone covers it; the thresholds come from the fields' own spread (MIX_Q), so the shares come out as measured.
 * Drawn in the piece's own coordinates (meters from its corner).
 */
const mixField = (su: number, sv: number, s: number) =>
  vnoise(su, sv, 1e6, s) * 0.62 + vnoise(su * 2.2, sv * 2.2, 1e6, s + 1) * 0.26 + vnoise(su * 4.7, sv * 4.7, 1e6, s + 2) * 0.12;
/** The fields' values, sorted: MIX_Q[k * (n - 1)] is their k-quantile. */
const MIX_Q: number[] = (() => {
  const r = rng('mix-q'), out: number[] = [];
  for (let i = 0; i < 6000; i++) out.push(mixField(r() * 400, r() * 400, 300 + Math.floor(r() * 50) * 3));
  return out.sort((a, b) => a - b);
})();
const mixQuantile = (k: number) => MIX_Q[Math.max(0, Math.min(MIX_Q.length - 1, Math.round(k * (MIX_Q.length - 1))))];
const mixCuts = new Map<string, number[]>();
/** Thresholds for tones 1.. so each covers its share: from the top tone down, the share of what is left uncovered. */
function mixThresholds(mix: number[]): number[] {
  const key = mix.join(',');
  let cut = mixCuts.get(key);
  if (!cut) {
    cut = new Array(mix.length).fill(1);
    let left = 1;
    for (let i = mix.length - 1; i >= 1; i--) {
      const p = Math.min(0.95, mix[i] / Math.max(1e-6, left));
      cut[i] = mixQuantile(1 - p);
      left -= mix[i];
    }
    mixCuts.set(key, cut);
  }
  return cut;
}
function mixTone(colors: RGB[], mix: number[], lx: number, ly: number, id: number, r1: number, r2: number): RGB {
  const cut = mixThresholds(mix);
  // Drifts run along one side of the piece or the other, leaning up to 5 degrees.
  const th = (r1 < 0.5 ? 0 : Math.PI / 2) + (((r1 * 2) % 1) - 0.5) * 0.17;
  const ca = Math.cos(th), sa = Math.sin(th);
  const su = lx * ca + ly * sa, sv = -lx * sa + ly * ca;
  const s = 300 + (id % 50) * 3;
  // A powdery grain on every edge, a couple of millimeters: two scales on lattices turned off the piece's axes, so the
  // grain's square cells never line up with a drift that runs along the piece (they would show as stair steps).
  const g1x = lx * 0.81 - ly * 0.59, g1y = lx * 0.59 + ly * 0.81, g2x = lx * 0.38 + ly * 0.93, g2y = -lx * 0.93 + ly * 0.38;
  const grain = (vnoise(g1x * 170, g1y * 170, 1e6, s + 90) - 0.5) * 0.06 + (vnoise(g2x * 410, g2y * 410, 1e6, s + 91) - 0.5) * 0.035;
  const warp = (vnoise(su * 1.6, sv * 1.6, 1e6, s + 80) - 0.5) * 0.7;
  let c = colors[0];
  for (let i = 1; i < colors.length && i < mix.length; i++) {
    // Patches about 20 to 50 cm along and 6 to 18 cm across.
    const f = mixField(su * 2.3 + i * 7.3, sv * 6.5 + warp + i * 3.1, s + i * 11) + grain + (r2 - 0.5) * 0.03;
    c = mixRGB(c, colors[i], smooth(cut[i] - 0.022, cut[i] + 0.022, f));
  }
  return c;
}

/**
 * The lines whose faces take the close-range detail (engine/paver-detail.ts) so far: field, border, edging and every
 * color of Belgard Avalon Slate, Catalina Grana and Antiqued Flat Top, and Basalite Premier Smooth. Any other line opts in by matching here once its
 * look has been checked with the detail on (its face kind must have a detail recipe).
 */
const DETAIL_LINES = /^(?:border-of-|paver-edge-)?(?:avalon-slate|catalina-grana|antiqued-flat-top|premier-smooth)-/;
function detailFor(spec: MaterialSpec, p: PaverPattern): DetailFace | undefined {
  if (!DETAIL_LINES.test(spec.id) || p.tumbled) return undefined;
  const f = p.face ?? 'textured';
  return f === 'slate' || f === 'smooth' || f === 'textured' || f === 'antiqued' ? f : undefined;
}

function paverSet(spec: MaterialSpec, laying?: LayingPattern): PBRSet {
  const p = spec.pattern!;
  const face = detailFor(spec, p);
  const out = paverMaps(spec, laying);
  if (face) {
    out.set.detail = { face, edges: paverEdges(spec, p, out.lay, out.size, laying) };
    // These maps alone take the renderer's full anisotropic filtering (set before any clone or upload copies it).
    for (const t of [out.set.map, out.set.normalMap, out.set.roughnessMap]) t.anisotropy = maxAnisotropy();
  }
  return out.set;
}

/** True when a catalog look is drawn with the close-range detail (and its border with every texture row, hardscape.ts). */
export const hasPaverDetail = (id: string) => DETAIL_LINES.test(id);

/** Edge map texel: about 1.2 mm, finer than the narrowest half joint drawn with it (Avalon Slate's, 1.5 mm). */
const EDGE_TEXEL = 0.0012;

/**
 * The joints of a detailed paver for the shader (engine/paver-detail.ts): a map of the distance from each point to its
 * piece's edge, from which the shader draws joints and chamfers sharp at any distance, plus how geometry UVs (meters)
 * find it. A module pattern (Belgard's 3-Piece A and B) repeats its joints on the module's lattice, a cell of 6 to 12
 * sq ft, so its map covers one cell at full detail (one map shared by every color and line laid in it); any other
 * layout's map covers the paver texture's own repeat.
 *
 * The paver texture is painted with rows top first (a canvas, flipped on upload) and samples at texel corners, so a
 * UV point m (meters) shows the layout at (m.u - h, -m.v - h), h half a texel; the map is placed the same way.
 */
function paverEdges(spec: MaterialSpec, p: PaverPattern, lay: Layout, size: number, laying?: LayingPattern): PaverEdges {
  const T = lay.tile, h = T / size / 2;
  // Antiqued Flat Top has no chamfer: its arris is worn round over about 7 mm, unevenly, with chips broken out of it
  // (drawn in the shader, `worn`), as the pattern texture draws it.
  const worn = p.face === 'antiqued';
  const bevel = worn ? 0.007 : p.face === 'smooth' ? 0.0025 : 0.005;
  const common = {
    joint: (p.joint * IN) / 2,
    bevel,
    worn,
    // The paver texture's own joint and chamfer (and an antiqued edge's wear and chips, up to 16 mm in) blur over about
    // a texel and a half past them; nearer the joint than this its color and relief are read from just inside the piece.
    push: bevel + (worn ? 0.016 : 0) + (1.5 * T) / size,
    // Steepest slope across the edge (normal x, y): the crisp chamfers are steep; the worn round of an antiqued arris
    // is gentle (about 2.5 mm over its 7 mm), so it shades softly instead of catching a bright line.
    slope: worn ? 0.5 : p.face === 'smooth' ? 4 : 2.5,
    sand: p.jointSand ? hexRGB(photoAlbedo(p.jointSand)) : mulRGB(JOINT_SAND, 0.9),
  };
  const m = lay.module;
  if (m) {
    // Pattern position in inches X = (m.u - h, -m.v - h) / IN, turned 45 degrees for a diagonal pattern, then lattice
    // coordinates (s, t) with X = s v1 + t v2.
    const det = m.v1[0] * m.v2[1] - m.v1[1] * m.v2[0];
    const L = [m.v2[1] / det, -m.v1[1] / det, -m.v2[0] / det, m.v1[0] / det]; // column-major inverse
    const R = Math.SQRT1_2;
    const D = m.diagonal ? [R, -R, R, R] : [1, 0, 0, 1]; // (X, Y) -> ((X + Y) R, (Y - X) R), column-major
    const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3]];
    const LD = mul(L, D);
    const U = IN * (m.scale ?? 1);
    const M = mul(LD, [1 / U, 0, 0, -1 / U]);
    const o: [number, number] = [-(LD[0] + LD[2]) * (h / U), -(LD[1] + LD[3]) * (h / U)];
    const cell = Math.max(Math.hypot(m.v1[0], m.v1[1]), Math.hypot(m.v2[0], m.v2[1])) * U;
    const n = Math.min(1024, Math.ceil(cell / EDGE_TEXEL));
    const key = `mod:${laying}:${m.pieces.length}:${m.P}:${m.scale ?? 1}:${n}`;
    return { ...common, key, size: n, mapSize: size, e: [M[0], M[1], M[2], M[3]], off: o, paint: () => moduleEdges(m, n) };
  }
  const n = Math.min(2048, Math.ceil(T / EDGE_TEXEL));
  const seeded = p.kind === 'ashlar' || p.kind === 'cobble' || p.kind === 'plank';
  const key = `lay:${p.kind}:${JSON.stringify(p.sizes)}:${p.blend ?? ''}:${laying ?? ''}:${seeded ? spec.id : ''}:${T.toFixed(4)}:${n}`;
  return {
    ...common, key, size: n, mapSize: size, e: [1 / T, 0, 0, -1 / T], off: [-h / T, -h / T],
    paint: () => {
      const out = new Uint8Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = encodeEdge(lay.at(((i + 0.5) / n) * T, ((j + 0.5) / n) * T).edge);
      return out;
    },
  };
}

const encodeEdge = (meters: number) => Math.round(clamp01(meters / EDGE_RANGE) * 255);

/** One lattice cell of a module pattern, n x n: each piece copy is rasterized over the texels it covers. */
function moduleEdges(m: PieceModule, n: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const done = new Uint8Array(n * n);
  const det = m.v1[0] * m.v2[1] - m.v1[1] * m.v2[0];
  const toST = (X: number, Y: number): [number, number] => [(X * m.v2[1] - Y * m.v2[0]) / det, (m.v1[0] * Y - m.v1[1] * X) / det];
  for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
    const ox = di * m.v1[0] + dj * m.v2[0], oy = di * m.v1[1] + dj * m.v2[1];
    for (const [px, py, pw, ph] of m.pieces) {
      const x0 = ox + px, y0 = oy + py;
      const c = [toST(x0, y0), toST(x0 + pw, y0), toST(x0, y0 + ph), toST(x0 + pw, y0 + ph)];
      const i0 = Math.max(0, Math.floor(Math.min(...c.map((q) => q[0])) * n - 1)), i1 = Math.min(n - 1, Math.ceil(Math.max(...c.map((q) => q[0])) * n));
      const j0 = Math.max(0, Math.floor(Math.min(...c.map((q) => q[1])) * n - 1)), j1 = Math.min(n - 1, Math.ceil(Math.max(...c.map((q) => q[1])) * n));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        if (done[k]) continue;
        const s = (i + 0.5) / n, t = (j + 0.5) / n;
        const X = s * m.v1[0] + t * m.v2[0] - x0, Y = s * m.v1[1] + t * m.v2[1] - y0;
        if (X < 0 || X >= pw || Y < 0 || Y >= ph) continue;
        done[k] = 1;
        out[k] = encodeEdge(Math.min(X, pw - X, Y, ph - Y) * IN * (m.scale ?? 1));
      }
    }
  }
  return out;
}

function paverMaps(spec: MaterialSpec, laying?: LayingPattern): { set: PBRSet; lay: Layout; size: number } {
  const p = spec.pattern!;
  // With the close-range detail on, the face's finest grain comes from the detail texture in real size, the same on
  // every piece; painted here it would be stretched with the pattern (a coarse blotch on a large repeat), so it is
  // left at its mean.
  const fine = !detailFor(spec, p);
  const colors = pal(spec);
  // A line's own joint sand (Premier Slab's light, gritty joints), turned to albedo like any maker color.
  const sand: RGB | null = p.jointSand ? hexRGB(photoAlbedo(p.jointSand)) : null;
  const lay = layoutFor(p, spec.id, laying);
  const T = lay.tile;
  const J = (p.joint * IN) / 2;
  const antiqued = p.face === 'antiqued';
  const bevel = p.tumbled ? 0.012 : antiqued ? 0.007 : p.face === 'woodgrain' || p.face === 'smooth' ? 0.0025 : 0.005;
  // A face mix's drifts have crisp, powdery edges: at the small size they read as blocks up close.
  const size = T > 5 || antiqued || p.blend === 'mix' ? 2048 : 1024;
  // Noise frequencies per tile for the antiqued face, whole numbers so the texture stays seamless.
  const F = (m: number) => Math.max(2, Math.round(T / m));
  // The antiqued face's relief is set in real size (1 unit of height is about 4 mm), so a large patio texture and a small
  // border texture shade the same; the other faces keep their per-pixel strengths.
  const relief = antiqued ? (0.004 * size) / T : p.tumbled ? 12 : p.face === 'slate' ? 15 : 9;
  const set = paint(size, T, relief, (u, v) => {
    const x = u * T, y = v * T;
    const hit = lay.at(x, y);
    const id = hit.id;
    const r1 = hash(id, 1.7), r2 = hash(id, 9.3), r3 = hash(id, 4.1);
    // Tumbled pieces have chipped, wavy edges.
    let edge = hit.edge;
    if (p.tumbled) edge -= (vnoise(u * 90, v * 90, 90, 3) - 0.5) * 0.008;
    // Antiqued: the arris is worn unevenly and small chips are broken out of the edges and corners, more on some pieces
    // than others. A chip eats into the piece, so it moves the edge in; corners, near two edges, chip most.
    let chip = 0;
    const rim = edge;
    if (antiqued) {
      const wob = vnoise(u * F(0.05), v * F(0.05), F(0.05), 21) - 0.5;
      const cn = vnoise(u * F(0.03), v * F(0.03), F(0.03), 23) * 0.75 + vnoise(u * F(0.011), v * F(0.011), F(0.011), 29) * 0.25;
      chip = smooth(0.64, 0.76, cn + (r3 - 0.5) * 0.2);
      edge -= Math.max(0, wob) * 0.003 + chip * (0.004 + 0.009 * cn);
    }
    // Joint sand fills only the real joint; a chip is a low notch in the paver, not wider sand.
    const joint = (antiqued ? rim : edge) < J;
    if (joint) {
      const g = vnoise(u * 500, v * 500, 500, 2);
      if (sand) {
        // Light sand with dark grains.
        const speck = vnoise(u * 1400, v * 1400, 1400, 3) > 0.8 ? 0.5 : 1;
        return { h: 0, c: mulRGB(sand, (0.88 + g * 0.2) * speck), r: 1 };
      }
      return { h: 0, c: mulRGB(JOINT_SAND, 0.75 + g * 0.3), r: 1 };
    }
    const bev = antiqued ? 0.12 + 0.88 * smooth(J, J + bevel, edge) : smooth(J, J + bevel, edge);
    let c = pick(colors, r1);
    // Real blends mix two tones inside one piece.
    if (p.blend === 'mix' && p.mix && hit.lx !== undefined && hit.ly !== undefined) {
      c = mixTone(colors, p.mix, hit.lx, hit.ly, id, r1, r2);
    } else if (p.blend !== 'cloud') {
      const mott = fbm(u + r2 * 3.1, v + r3 * 2.7, Math.round(T * 4) || 4, 4, Math.floor(r2 * 50));
      c = mixRGB(c, pick(colors, r2), smooth(0.35, 0.75, mott) * (antiqued ? 0.7 : 0.55));
    } else if (hit.lx !== undefined && hit.ly !== undefined) {
      // A pattern of several sizes (Premier Smooth): the drifts in each piece's own coordinates.
      c = cloudTone(colors, hit.lx, hit.ly, id, r1, r2);
    } else {
      const S = p.sizes[0][0] * IN * (p.scale ?? 1);
      c = cloudTone(colors, x - Math.floor(x / S) * S, y - Math.floor(y / S) * S, id, r1, r2);
    }
    // DuraFusion blends cloud a third tone through the face in soft drifts.
    if (antiqued) c = mixRGB(c, pick(colors, r3), smooth(0.5, 0.85, fbm(u + r1 * 1.3, v + r2 * 2.1, F(0.12), 3, 33 + (id % 11))) * 0.45);
    let h = bev;
    let rough = 0.82;
    if (p.face === 'woodgrain') {
      const g1 = vnoise(hit.rotated ? u * 30 : u * 3, hit.rotated ? v * 3 : v * 30, 1e6, id % 97);
      const g2 = vnoise(hit.rotated ? u * 160 : u * 8, hit.rotated ? v * 8 : v * 160, 1e6, (id % 89) + 3);
      c = mulRGB(c, 0.88 + g1 * 0.14 + g2 * 0.08);
      h = bev * (0.92 + g2 * 0.08);
      rough = 0.55;
    } else if (p.face === 'smooth') {
      const g = fine ? vnoise(u * 300, v * 300, 300, 5) : 0.5;
      c = mulRGB(c, 0.95 + g * 0.08);
      h = bev * (0.97 + g * 0.03);
      rough = 0.7;
    } else if (antiqued) {
      // Antiqued Flat Top: a smooth, gently weathered face. A faint wave across the piece, fine paste with sand grains,
      // a few small dents and pits, worn patches a little lighter and smoother, and chips showing the rougher, lighter
      // broken concrete under the face.
      const und = fbm(u + r2 * 3.3, v + r1 * 2.2, F(0.25), 3, 51);
      // With the close-range detail on, the fine paste and pin holes come from the detail texture in real size.
      const fineG = fine ? vnoise(u * F(0.0035), v * F(0.0035), F(0.0035), 53) : 0.5;
      const vo = voronoi(u, v, F(0.06), 57 + (id % 3));
      // Dents: a few shallow, uneven dings (a noise wobble breaks the round shape), and fewer fine pin holes.
      const dw = (vnoise(u * F(0.008), v * F(0.008), F(0.008), 63) - 0.5) * 0.08;
      const pit = vo.id > 0.9 ? 1 - smooth(0.03, 0.09 + (vo.id - 0.9) * 0.9, vo.f1 + dw) : 0;
      const vo2 = voronoi(u, v, F(0.022), 59);
      const pin = fine && vo2.id > 0.95 ? 1 - smooth(0.04, 0.13, vo2.f1) : 0;
      const wear = smooth(0.55, 0.8, fbm(u + 7.1, v + 3.3, F(0.09), 4, 61 + (id % 7)));
      const broken = chip * (1 - smooth(0.002, 0.02, rim));
      c = mulRGB(c, 1.01 + fineG * 0.05 - pit * 0.08 - pin * 0.06 + wear * 0.04);
      c = mixRGB(c, mulRGB(mixRGB(c, [0.62, 0.6, 0.56], 0.25), 1.04), broken * 0.35);
      h = bev * (0.9 + und * 0.1 + fineG * 0.03 - pit * 0.45 - pin * 0.3 - broken * 0.5);
      rough = 0.64 + fineG * 0.06 + pit * 0.12 + pin * 0.08 + broken * 0.18 - wear * 0.07;
    } else if (p.face === 'slate') {
      // Cleft slate (Avalon Slate): each stone carries its own rippled cleft, ridges a few centimeters apart running
      // roughly along the stone and leaning a little differently on each, broken into a few shallow terraces.
      // Integer wave counts per tile keep the texture seamless.
      const N = Math.max(6, Math.round((T / 0.11) * (0.75 + r1 * 0.5)));
      const tilt = Math.floor(r2 * 7) - 3;
      const fu = hit.rotated ? tilt : N, fv = hit.rotated ? N : tilt;
      const warp = (fbm(u + r3 * 1.9, v + r1 * 2.3, Math.max(2, Math.round(T * 4)), 4, 31 + (id % 13)) - 0.5) * 7;
      const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (fu * u + fv * v) + warp + r3 * 6.28);
      const wave2 = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (Math.round(fu * 2.3) * u + Math.round(fv * 2.3) * v) + warp * 1.6 + r2 * 6.28);
      // The cleft is uneven: ripples come and go across a stone instead of running as even stripes.
      const amt = smooth(0.3, 0.75, fbm(u + r2 * 2.9, v + r3 * 3.7, Math.max(2, Math.round(T * 3.5)), 3, 41 + (id % 7)));
      const rip = amt * (wave * 0.8 + wave2 * 0.2);
      const tn = fbm(u + r3 * 2.3, v + r1 * 1.7, Math.max(2, Math.round(T * 2.5)), 3, 23) * 3;
      const step = (Math.floor(tn) + smooth(0.82, 1, tn - Math.floor(tn))) / 3;
      const g = fine ? vnoise(u * 600, v * 600, 600, 13) : 0.5;
      c = mulRGB(c, 1.05 + rip * 0.04 + step * 0.06 + g * 0.05); // lifted so the rippled face, shaded by its own relief, renders at its swatch color
      h = bev * (0.5 + rip * 0.3 + step * 0.16 + g * 0.04);
      rough = 0.84 - rip * 0.12;
    } else {
      // Textured face: fine aggregate and pores.
      const g = fine ? vnoise(u * 420, v * 420, 420, 7) : 0.5;
      const pore = fine && vnoise(u * 900, v * 900, 900, 11) > 0.88 ? 1 : 0;
      c = mulRGB(c, 0.9 + g * 0.16 - pore * 0.12);
      h = bev * (0.9 + g * 0.1) - pore * 0.05;
      rough = 0.85;
    }
    if (p.tumbled) c = mulRGB(c, 0.85 + 0.15 * smooth(J, J + 0.02, edge));
    return { h, c, r: rough };
  });
  return { set, lay, size };
}

/* ------------------------------------------------------------------ */
/* Concrete                                                             */
/* ------------------------------------------------------------------ */

/**
 * A row of Belgard Melville Curb units: smooth, dense precast faces with a tight butt joint every 24 in along the run
 * (u runs along the curb on its faces and top). The tile is two units long.
 */
function curbSet(spec: MaterialSpec): PBRSet {
  const [a, b] = pal(spec);
  const U = 0.6096, T = 2 * U;
  return paint(1024, T, 4, (u, v) => {
    const x = u * T;
    const joint = Math.min(Math.abs(x - U), x, T - x) < 0.0022;
    const unit = x < U ? 0 : 1;
    // Seamless noise over the tile; the second unit is a shade apart, as cast units are.
    const mott = fbm(u, v, 6, 4, 11);
    let c = mixRGB(a, b, mott * 0.8 + unit * 0.12);
    c = mulRGB(c, 0.97 + fbm(u, v, 18, 3, 5) * 0.05);
    if (joint) c = mulRGB(c, 0.42);
    return { h: joint ? 0 : 0.6 + mott * 0.04, c, r: joint ? 0.95 : 0.6 };
  });
}

/*
 * Stamped concrete, made as a stamp mat leaves it: a stone, cobble or plank pattern pressed 3/8 in deep into the
 * colored slab, with the joints and low spots darkened by the antiquing release (spec.antique) when there is one.
 * Every pattern repeats over 96 in (stones, fans and planks vary inside that), painted at about 2.4 mm a pixel.
 */
const STAMP_TILE = 96;

/** A stone, cobble or plank at a point: its id, distance to its nearest joint in inches, and its position along its length (0..1, planks). */
interface StampHit { id: number; edge: number; along: number; across: number; rot: boolean; }
interface StampLayout { at(xIn: number, yIn: number): StampHit; }

/** Random rectangular stone, 12 to 36 in, on a 6 in grid that wraps over the 96 in tile. */
function ashlarStamp(seed: string): StampLayout {
  const lay = packedLayout([[12, 12], [12, 18], [18, 18], [18, 24], [24, 24], [12, 24], [12, 36]], 6, 16, seed);
  return { at(x, y) { const h = lay.at(x * IN, y * IN); return { id: h.id, edge: h.edge / IN, along: h.along, across: 0.5, rot: h.rotated }; } };
}

/**
 * European fan: fans 24 in wide in a staggered lattice (a lower fan overlaps the one above), each of three rings of
 * 4 in stones about 5 to 6 in long, the stones of each ring starting at its own angle so joints never line up.
 */
function fanStamp(): StampLayout {
  const r = 12, R = r * 1.04, ringH = 4;
  return {
    at(X, Y) {
      const j0 = Math.floor(Y / r);
      for (let jj = j0 + 2; jj >= j0 - 2; jj--) {
        const par = jj & 1;
        const i0 = Math.round((X / r - par) / 2);
        let best = -1, bd = 1e9, bcx = 0;
        for (let ii = i0 - 1; ii <= i0 + 1; ii++) {
          const cx = (2 * ii + par) * r, cy = jj * r;
          const d = Math.hypot(X - cx, Y - cy);
          if (d <= R && d < bd) { bd = d; best = ii; bcx = cx; }
        }
        if (best < 0) continue;
        const dx = X - bcx, dy = Y - jj * r;
        const k = Math.min(2, Math.floor(bd / ringH));
        const n = Math.max(5, Math.round((Math.PI * 2 * (k + 0.5) * ringH) / 5.6));
        const fanId = (((best % 4) + 4) % 4) * 8 + (((jj % 8) + 8) % 8);
        const t = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 + hash(fanId, k) ) * n;
        const f = t - Math.floor(t);
        const sector = ((Math.floor(t) % n) + n) % n;
        const radial = Math.min(bd - k * ringH, (k + 1) * ringH - bd);
        const ang = Math.min(f, 1 - f) * ((Math.PI * 2) / n) * bd;
        const edge = Math.min(k === 2 ? Math.min(radial, R - bd) : radial, ang);
        return { id: (fanId * 4 + k) * 64 + sector, edge, along: f, across: (bd - k * ringH) / ringH, rot: false };
      }
      return { id: 0, edge: 0, along: 0, across: 0, rot: false };
    },
  };
}

/** Boards 6 to 8 in wide, in two lengths per row (36 to 60 in) that butt at random, 14 rows over the 96 in tile. */
function plankStamp(seed: string): StampLayout {
  const widths = [6, 7, 8, 6, 7, 6, 8, 7, 6, 8, 7, 6, 8, 6];
  const r = rng(seed);
  const rows = widths.map((w, i) => {
    const first = 36 + Math.floor(r() * 25), off = r() * STAMP_TILE;
    return { w, y0: widths.slice(0, i).reduce((a, b) => a + b, 0), first, off };
  });
  return {
    at(X, Y) {
      let row = rows[0];
      for (const q of rows) if (Y >= q.y0) row = q;
      const ri = rows.indexOf(row);
      const x = (((X - row.off) % STAMP_TILE) + STAMP_TILE) % STAMP_TILE;
      const second = x >= row.first;
      const a = second ? row.first : 0, b = second ? STAMP_TILE : row.first;
      const ly = Y - row.y0;
      return { id: ri * 2 + (second ? 1 : 0), edge: Math.min(ly, row.w - ly, x - a, b - x), along: (x - a) / (b - a), across: ly / row.w, rot: false };
    },
  };
}

function stampedSet(spec: MaterialSpec, stamp: StampPattern): PBRSet {
  const a = hexRGB(spec.palette[0]), b = hexRGB(spec.palette[1] ?? spec.palette[0]);
  const rel = spec.antique ? hexRGB(spec.antique) : null;
  const lay = stamp === 'ashlar' ? ashlarStamp(spec.id.replace(/-antiqued$/, '')) : stamp === 'cobble' ? fanStamp() : plankStamp('plank');
  const TM = STAMP_TILE * IN;
  const joint = stamp === 'cobble' ? 0.5 : stamp === 'plank' ? 0.32 : 0.6; // joint width, in
  const lip = stamp === 'cobble' ? 0.7 : 0.55; // how wide the rounded shoulder into the joint is, in
  return paint(1024, TM, 7, (u, v) => {
    const X = u * STAMP_TILE, Y = v * STAMP_TILE;
    const hit = lay.at(X, Y);
    // The joint wanders a little, as a hand-set mat leaves it.
    const wob = (vnoise(u * 48, v * 48, 48, 21) - 0.5) * 0.3;
    const e = Math.max(0, hit.edge + wob);
    const top = smooth(joint * 0.5, joint * 0.5 + lip, e); // 0 in the joint, 1 on the stone or board
    const sel = hash(hit.id, 5);
    // Texture of the stone face: a split slate cleft for stone and cobble, long grain for planks.
    let face: number, low: number;
    if (stamp === 'plank') {
      const off = Math.floor(hash(hit.id, 9) * 8);
      const warp = vnoise(u * 8 + off, v * 32, 8, 3);
      const rings = 0.5 + 0.5 * Math.sin((hit.across * 9 + warp * 5 + hash(hit.id, 2) * 6) * Math.PI);
      const fiber = vnoise(u * 16, v * 512, 16, 4);
      face = rings * 0.55 + fiber * 0.45;
      low = 1 - face;
    } else {
      const cleft = sel < 0.5 ? vnoise(u * 24, v * 96, 24, 3) : vnoise(u * 96, v * 24, 24, 3);
      const grain = vnoise(u * 256, v * 256, 256, 4);
      face = cleft * 0.6 + grain * 0.4;
      low = 1 - face;
    }
    // Color: the slab's integral color varies stone to stone, then mottles and shades by the face.
    const mott = fbm(u, v, 6, 4, 8);
    let c = mixRGB(a, b, hash(hit.id, 1) * 0.6 + mott * 0.4);
    c = mulRGB(c, 0.93 + hash(hit.id, 3) * 0.12 + (face - 0.5) * (stamp === 'plank' ? 0.2 : 0.16));
    if (rel) {
      // Antiquing release lies in the joints and settles in the low spots of the face (heavier on cobble).
      const settle = smooth(0.45, 0.9, low) * (stamp === 'cobble' ? 0.32 : 0.24) + smooth(0.6, 0, e / lip) * 0.35;
      c = mixRGB(c, rel, Math.min(0.95, settle * top + (1 - top) * 0.85));
    } else {
      c = mulRGB(c, 0.5 + top * 0.5); // joint shadow in the same color, a plain mat's release being the slab itself
    }
    const dome = stamp === 'cobble' ? Math.sqrt(Math.max(0, Math.min(1, e / 2.2))) : 1;
    const relief = stamp === 'plank' ? 0.07 : 0.13;
    const h = top * (0.78 + (hash(hit.id, 7) - 0.5) * 0.07 + face * relief * 1.4) * (0.85 + 0.15 * dome);
    return { h, c, r: top > 0.5 ? 0.58 + low * 0.2 : 0.92 };
  });
}

function concreteSet(spec: MaterialSpec, finish: ConcreteFinish, sawCuts = true): PBRSet {
  // Concrete colors are hand-picked in the render light (not a maker's photo), so they are used as they are.
  const [a, b] = spec.palette.map(hexRGB);
  const T = 3.05; // 10 ft, saw cuts every 5 ft
  if (finish === 'stamped' && spec.stamp) return stampedSet(spec, spec.stamp);
  if (finish === 'stamped') {
    const lay = packedLayout([[12, 12], [12, 24], [24, 24], [24, 36]], 12, 10, spec.id);
    const TT = lay.tile;
    return paint(1024, TT, 10, (u, v) => {
      const hit = lay.at(u * TT, v * TT);
      const groove = smooth(0.004, 0.012, hit.edge);
      const slate = vnoise(u * 40 + hash(hit.id, 2) * 9, v * 14, 1e6, 3) * 0.6 + vnoise(u * 200, v * 200, 200, 4) * 0.4;
      let c = mixRGB(a, b, hash(hit.id, 1) * 0.7 + slate * 0.3);
      c = mulRGB(c, 0.55 + groove * 0.5);
      return { h: groove * (0.7 + slate * 0.3), c, r: 0.6 + slate * 0.2 };
    });
  }
  return paint(1024, T, finish === 'exposed' ? 12 : 5, (u, v) => {
    const x = u * T, y = v * T;
    const jx = Math.min(Math.abs(x - T / 2), x, T - x), jy = Math.min(Math.abs(y - T / 2), y, T - y);
    const joint = sawCuts && Math.min(jx, jy) < 0.004;
    const mott = fbm(u, v, 5, 5, 6);
    let c = mixRGB(a, b, mott);
    let h = 0.6;
    let r = 0.85;
    if (finish === 'broom') {
      const broom = vnoise(u * 900, v * 22, 900, 5);
      c = mulRGB(c, 0.93 + broom * 0.09);
      h = 0.55 + broom * 0.3;
    } else if (finish === 'smooth') {
      const swirl = fbm(u * 1.3, v * 1.3, 12, 3, 9);
      c = mulRGB(c, 0.95 + swirl * 0.08);
      h = 0.6 + swirl * 0.05;
      r = 0.62;
    } else if (finish === 'exposed') {
      const cell = voronoi(u, v, 140, 3, 1);
      const stone = cell.f1 < 0.36;
      const tone = hash(cell.id, 3);
      const sc: RGB = tone < 0.3 ? [0.58, 0.55, 0.5] : tone < 0.55 ? [0.42, 0.38, 0.34] : tone < 0.8 ? [0.66, 0.58, 0.48] : [0.3, 0.29, 0.28];
      c = stone ? mulRGB(sc, 0.85 + (1 - cell.f1 * 2.5) * 0.3) : mulRGB(c, 0.8);
      h = stone ? Math.sqrt(Math.max(0, 1 - (cell.f1 / 0.36) ** 2)) : 0;
      r = stone ? 0.5 : 0.9;
    }
    if (joint) c = mulRGB(c, 0.5);
    return { h: joint ? 0 : h, c, r };
  });
}

/* ------------------------------------------------------------------ */
/* Ground covers                                                        */
/* ------------------------------------------------------------------ */

function lawnSet(spec: MaterialSpec): PBRSet {
  const [acc, base] = pal(spec);
  return paint(512, 3, 6, (u, v) => {
    const big = fbm(u, v, 3, 4, 11);
    const fine = vnoise(u * 160, v * 160, 160, 3);
    const blade = vnoise(u * 300, v * 90, 300, 5);
    let c = mixRGB(base, acc, smooth(0.3, 0.7, big));
    c = mulRGB(c, 0.85 + fine * 0.2 + blade * 0.1);
    return { h: fine * 0.6 + blade * 0.4, c, r: 0.9 };
  });
}

/** The way synthetic turf blades lean (radians, in the ground's x/z plane), shared by the texture and the 3D blades. */
export const TURF_GRAIN = 0.6;

/*
 * Turf colors. photoAlbedo's model (render = gain * albedo + sky fill) was measured on flat pavers in the mid tones; a
 * synthetic lawn is dark, and the final grade (post.ts: filmic ACES curve, saturation 1.04, then contrast 1.08 around
 * mid gray, which clips the darkest tones to black) crushes dark greens and their blue. So a turf color is turned into
 * albedo by running that grade backwards exactly, then taking away the sheen (TURF_FILL) and dividing by the light a sunlit pile receives
 * (TURF_LIGHT, per channel); both fitted by rendering the three MSI turfs top-down in the default afternoon light
 * against their textures' own pixels. A maker's photographed color then
 * renders as that color. Keep the constants in step with post.ts (DEFAULT_LENS and the output shader).
 */
const TURF_LIGHT: RGB = [1.63, 1.66, 2.5];
/** Light a pile shows whatever its color (sky sheen off the blades), added before the grade. Fitted with TURF_LIGHT. */
const TURF_FILL: RGB = [0.011, 0.018, 0];
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
function inv3(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const D = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [[(e * i - f * h) / D, (c * h - b * i) / D, (b * f - c * e) / D], [(f * g - d * i) / D, (a * i - c * g) / D, (c * d - a * f) / D], [(d * h - e * g) / D, (b * g - a * h) / D, (a * e - b * d) / D]];
}
const ACES_IN_INV = inv3(ACES_IN), ACES_OUT_INV = inv3(ACES_OUT);
const mul3 = (m: number[][], v: number[]) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
/** The inverse of the ACES fit's RRT/ODT curve (post.ts RRTAndODTFit), one channel. */
function rrtInv(y: number): number {
  const A = 1 - 0.983729 * y, B = 0.0245786 - 0.43295 * y, C = -0.000090537 - 0.238081 * y;
  return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
}
/** How a sunlit pile of this linear albedo shows on screen (linear display), the grade of post.ts run forward. */
function turfShown(a: RGB): RGB {
  const v = mul3(ACES_OUT, mul3(ACES_IN, a.map((x, k) => (x * TURF_LIGHT[k] + TURF_FILL[k]) / 0.6)).map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081))).map((x) => Math.min(1, Math.max(0, x)));
  const l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  return v.map((x) => Math.min(1, Math.max(0, (l + (x - l) * 1.04 - 0.5) * 1.08 + 0.5))) as RGB;
}
/** The linear albedo a maker's turf color (sRGB hex, as photographed in sun) is drawn with. */
export function turfAlbedo(hex: string): RGB {
  return gradeAlbedo(hex, TURF_LIGHT, TURF_FILL);
}

/**
 * Loose stones (spec.pebble): the same grade run backwards, with the light a stone's sunlit top receives. Fitted by
 * rendering the Mexican beach pebble beds top-down in the default afternoon light.
 */
const ROCK_LIGHT: RGB = [1.85, 2.0, 2.65];
const ROCK_FILL: RGB = [0.008, 0.01, 0.016];
/** The linear albedo a stone color (sRGB hex, as photographed in daylight) is drawn with. */
export function rockAlbedo(hex: string): RGB {
  return gradeAlbedo(hex, ROCK_LIGHT, ROCK_FILL);
}

/** The linear albedo that shows on screen as `hex` under `light` (per channel) plus `fill`, in the default grade. */
function gradeAlbedo(hex: string, light: RGB, fill: RGB): RGB {
  const c = new THREE.Color(hex);
  const D = [c.r, c.g, c.b].map((v) => Math.min(0.9, v));
  // contrast, then saturation, backwards (exposure 1, no vignette at the center)
  let A = D.map((v) => (v - 0.5) / 1.08 + 0.5);
  const l = 0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2];
  A = A.map((v) => l + (v - l) / 1.04);
  const scene = mul3(ACES_IN_INV, mul3(ACES_OUT_INV, A).map(rrtInv)).map((v) => v * 0.6);
  return scene.map((v, k) => Math.min(0.95, Math.max(0.0005, (v - fill[k]) / light[k]))) as RGB;
}
const turfPaint = (hex: string): RGB => turfAlbedo(hex).map((v) => toSrgb(v)) as RGB;

/**
 * A maker's synthetic turf seen from above, blade by blade (spec.turf): curled thatch over the dark backing first, then
 * tens of thousands of blades in the two yarn colors, each leaning along the grain (spread +-40 degrees), dark at its base
 * and lighter at the tip, drawn with a height test so blades lie over each other as they do in the roll. About 1 mm a
 * pixel over a 1 m tile, wrapped so it tiles. The whole is scaled to the maker's swatch tone. While only being previewed
 * it is a flat stand-in of the same tone.
 */
function makerTurfSet(spec: MaterialSpec): PBRSet {
  const T = spec.turf!;
  const mean = turfAlbedo(T.mean);
  const S = 1024, TILE = 1.0, pxPerM = S / TILE;
  if (paintPreviewing()) return paint(S, TILE, 4, () => ({ h: 0.5, c: turfPaint(T.mean), r: 0.72 }), mean);
  const C = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const yarn = T.yarn.map(turfPaint), tip = turfPaint(T.tip), thatch = T.thatch.map(turfPaint);
  const r = rng(`turf:${spec.id}`);
  // The backing and the deep gaps between tufts.
  const gap = mulRGB(mixRGB(thatch[1], yarn[0], 0.5), 0.32);
  for (let i = 0; i < S * S; i++) { C[i * 3] = gap[0]; C[i * 3 + 1] = gap[1]; C[i * 3 + 2] = gap[2]; H[i] = 0; R[i] = 0.9; }
  const put = (x: number, y: number, h: number, c: RGB, rough: number) => {
    const i = (((y % S) + S) % S) * S + (((x % S) + S) % S);
    if (h < H[i]) return;
    H[i] = h; C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; R[i] = rough;
  };
  // A stroke from (x, y) heading `a` (radians), `len` px long, `w` px wide, turning by `bend` over its length; col(t) and
  // ht(t) give its color and height at t (0 base .. 1 tip).
  const stroke = (x: number, y: number, a: number, len: number, w: number, bend: number, col: (t: number) => RGB, ht: (t: number) => number, rough: number) => {
    const n = Math.max(2, Math.ceil(len / 0.6));
    for (let k = 0; k <= n; k++) {
      const t = k / n, aa = a + bend * t, px = x + Math.cos(a + bend * t * 0.5) * len * t, py = y + Math.sin(a + bend * t * 0.5) * len * t;
      const c = col(t), h = ht(t), hw = Math.max(0.5, w * (1 - t * 0.6)) / 2;
      for (let s = -hw; s <= hw + 1e-6; s += 0.7) put(Math.round(px - Math.sin(aa) * s), Math.round(py + Math.cos(aa) * s), h, c, rough);
    }
  };
  const pile = (T.pileMm / 1000) * pxPerM;
  // Thatch: short curly fibers near the backing, wheat and green.
  const nThatch = Math.round(S * S * (0.006 + T.thatchShow * 0.03));
  for (let i = 0; i < nThatch; i++) {
    const c0 = thatch[r() < 0.6 ? 0 : 1], k = 0.75 + r() * 0.5, h0 = 0.08 + r() * 0.22;
    stroke(r() * S, r() * S, r() * Math.PI * 2, pile * (0.15 + r() * 0.25), 1, (r() - 0.5) * 6, () => mulRGB(c0, k), (t) => h0 + t * 0.05, 0.85);
  }
  // Blades: about one per 22 px for a 70 oz face weight.
  const nBlades = Math.round(((S * S) / 22) * (T.faceOz / 70));
  for (let i = 0; i < nBlades; i++) {
    const y0 = yarn[r() < 0.5 ? 0 : 1], k = 0.82 + r() * 0.3;
    // Leaning blades show most of their length from above, upright ones little of it.
    const lean = 0.25 + r() * 0.75, len = pile * (0.25 + lean * 0.6) * (0.85 + r() * 0.25);
    // The canvas is flipped onto the ground (rows run against +z), so the grain is mirrored here to match the blades.
    const a = -TURF_GRAIN + (r() - 0.5) * 1.4 + (r() < 0.12 ? Math.PI : 0), top = 0.55 + r() * 0.45;
    const w = T.blade === 'D' ? 1.4 : T.blade === 'W' ? 1.7 : 1.5 + r() * 0.4;
    stroke(r() * S, r() * S, a, len, w, (r() - 0.5) * 0.5,
      (t) => mulRGB(mixRGB(y0, tip, Math.max(0, t - 0.55) * 1.2), k * (0.5 + 0.62 * t)),
      (t) => (0.25 + t * 0.75) * top, 0.55 + r() * 0.15);
  }
  // Tone: scale the albedo (red and green, blue following) until the texture's average as shown on screen, pixel by
  // pixel through the grade, equals the maker's photographed color. Matching the plain average instead leaves a dark, speckled pile too
  // bright, since the grade's toe lifts the speckle. Fitted on a sample of pixels.
  const want = new THREE.Color(T.mean), target = [want.r, want.g, want.b];
  const toLinV = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const sample: RGB[] = [];
  for (let i = 0; i < S * S; i += 61) sample.push([toLinV(C[i * 3]), toLinV(C[i * 3 + 1]), toLinV(C[i * 3 + 2])]);
  const k: RGB = [1, 1, 1];
  for (let it = 0; it < 14; it++) {
    const m = [0, 0, 0];
    for (const a of sample) { const d = turfShown([a[0] * k[0], a[1] * k[1], a[2] * k[2]]); m[0] += d[0]; m[1] += d[1]; m[2] += d[2]; }
    for (let c = 0; c < 2; c++) k[c] *= Math.min(3, Math.max(0.33, ((target[c] + 0.003) / (m[c] / sample.length + 0.003)) ** 0.8));
    // Blue follows red and green, keeping the yarn's own hue: in a dark green it sits where the grade clips, too touchy to fit.
    k[2] = Math.sqrt(k[0] * k[1]);
  }
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) C[i * 3 + c] = toSrgb(Math.min(1, toLinV(C[i * 3 + c]) * k[c]));
  void mean;
  return paint(S, TILE, 3, (u, v) => {
    const i = Math.min(S - 1, Math.floor(v * S)) * S + Math.min(S - 1, Math.floor(u * S));
    return { h: H[i], c: [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]], r: R[i] };
  });
}

function turfSet(spec: MaterialSpec): PBRSet {
  if (spec.turf) return makerTurfSet(spec);
  const [acc, base] = pal(spec);
  if (spec.id === 'synthetic-turf') {
    // Synthetic grass: an even pile of fine blades in one green, no thatch or patches.
    return paint(512, 2, 4, (u, v) => {
      const fine = vnoise(u * 260, v * 260, 260, 3);
      const blade = vnoise(u * 520, v * 160, 520, 6);
      const c = mulRGB(mixRGB(base, acc, 0.55 + fine * 0.12), 0.96 + blade * 0.08);
      return { h: fine * 0.5 + blade * 0.5, c, r: 0.8 };
    });
  }
  return paint(512, 2, 4, (u, v) => {
    const fine = vnoise(u * 220, v * 220, 220, 3);
    const thatch = vnoise(u * 400, v * 400, 400, 8);
    let c = mixRGB(base, acc, 0.45 + fine * 0.3);
    // Tan thatch shows through at the base.
    c = mixRGB(c, [0.42, 0.38, 0.22], thatch > 0.8 ? 0.35 : 0);
    return { h: fine, c, r: 0.85 };
  });
}

function soilSet(): PBRSet {
  const a: RGB = [0.46, 0.43, 0.3], b: RGB = [0.38, 0.4, 0.24], d: RGB = [0.48, 0.4, 0.3];
  return paint(512, 7, 4, (u, v) => {
    const n = fbm(u, v, 3, 5, 2);
    const grain = vnoise(u * 180, v * 180, 180, 7);
    const dirt = smooth(0.55, 0.8, fbm(u, v, 5, 4, 9));
    let c = mixRGB(a, b, n);
    c = mixRGB(c, d, dirt * 0.5);
    c = mulRGB(c, 0.92 + grain * 0.12);
    return { h: n * 0.5 + grain * 0.5, c, r: 0.95 };
  });
}

/* ------------------------------------------------------------------ */
/* Build-stage layers: what a crew digs into and fills with              */
/* ------------------------------------------------------------------ */

export type BuildLayer = 'cut' | 'backfill' | 'base' | 'sand' | 'fines';

/**
 * cut: freshly dug native soil (trench and excavation walls and floors), drier and lighter than the topsoil.
 * backfill: trench spoil put back and compacted, darker and lumpier. base: Class II road base, gray-brown
 * crushed rock with fines. sand: washed bedding sand under pavers. fines: 1/4 in minus screenings under
 * synthetic grass.
 */
function buildLayerSet(kind: BuildLayer): PBRSet {
  switch (kind) {
    case 'cut': {
      const a: RGB = [0.5, 0.42, 0.31], b: RGB = [0.42, 0.35, 0.26];
      return paint(512, 1.6, 3, (u, v) => {
        const n = fbm(u, v, 4, 5, 21);
        const grain = vnoise(u * 200, v * 200, 200, 22);
        const clod = voronoi(u, v, 40, 23, 0.9);
        const lump = smooth(0.35, 0.05, clod.f1) * 0.25;
        let c = mixRGB(a, b, n);
        c = mulRGB(c, 0.88 + grain * 0.14 + lump * 0.2);
        return { h: n * 0.4 + grain * 0.3 + lump, c, r: 0.97 };
      });
    }
    case 'backfill': {
      const a: RGB = [0.4, 0.33, 0.25], b: RGB = [0.33, 0.28, 0.21];
      return paint(512, 1.2, 9, (u, v) => {
        const n = fbm(u, v, 5, 4, 31);
        const clod = voronoi(u, v, 34, 32, 1);
        const lump = smooth(0.42, 0.0, clod.f1);
        let c = mixRGB(a, b, n * 0.8 + clod.id * 0.2);
        c = mulRGB(c, 0.8 + lump * 0.3);
        return { h: lump * 0.7 + n * 0.3, c, r: 0.96 };
      });
    }
    case 'base': {
      const a: RGB = [0.47, 0.45, 0.41], b: RGB = [0.37, 0.35, 0.32];
      return paint(512, 0.9, 10, (u, v) => {
        const g = vnoise(u * 300, v * 300, 300, 41);
        const peb = voronoi(u, v, 90, 42, 1);
        const stone = smooth(0.42, 0.12, peb.f1) * (peb.id > 0.45 ? 1 : 0);
        let c = mixRGB(a, b, fbm(u, v, 5, 3, 43) * 0.7);
        c = mulRGB(c, 0.86 + g * 0.16);
        c = mixRGB(c, mixRGB([0.66, 0.63, 0.58], [0.36, 0.34, 0.31], hash(peb.id, 44)), stone * 0.85);
        return { h: g * 0.3 + stone * 0.8, c, r: 0.94 - stone * 0.08 };
      });
    }
    case 'sand': {
      const a: RGB = [0.6, 0.52, 0.4], b: RGB = [0.53, 0.46, 0.35];
      return paint(512, 0.8, 3, (u, v) => {
        const g = vnoise(u * 360, v * 360, 360, 51);
        const n = fbm(u, v, 6, 3, 52);
        const c = mulRGB(mixRGB(a, b, n), 0.92 + g * 0.12);
        return { h: g * 0.6 + n * 0.4, c, r: 0.98 };
      });
    }
    case 'fines': {
      const a: RGB = [0.52, 0.47, 0.4], b: RGB = [0.43, 0.39, 0.33];
      return paint(512, 0.9, 5, (u, v) => {
        const g = vnoise(u * 320, v * 320, 320, 61);
        const peb = voronoi(u, v, 140, 62, 1);
        const chip = smooth(0.3, 0.08, peb.f1) * (peb.id > 0.7 ? 1 : 0);
        let c = mulRGB(mixRGB(a, b, fbm(u, v, 5, 3, 63)), 0.9 + g * 0.14);
        c = mixRGB(c, [0.42, 0.39, 0.35], chip * 0.6);
        return { h: g * 0.5 + chip * 0.5, c, r: 0.96 };
      });
    }
  }
}

export const buildLayerTextures = (kind: BuildLayer) => textureSet(`layer:${kind}`, () => buildLayerSet(kind));

function mulchSet(spec: MaterialSpec): PBRSet {
  const [a, b] = pal(spec);
  return paint(512, 1.4, 14, (u, v) => {
    const cell = voronoi(u, v, 48, 4, 1);
    const ang = cell.id * Math.PI;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ru = (u * ca - v * sa) * 48, rv = (u * sa + v * ca) * 48;
    const fiber = vnoise(ru * 3, rv * 22, 1e6, 3);
    const edge = smooth(0.0, 0.18, cell.f2 - cell.f1);
    const h = edge * (0.55 + 0.45 * fiber) * (0.6 + cell.id * 0.4);
    let c = mixRGB(b, a, cell.id * 0.8 + fiber * 0.2);
    c = mulRGB(c, 0.55 + 0.6 * edge * (0.75 + fiber * 0.25));
    return { h, c, r: 0.9 };
  });
}

function dgSet(spec: MaterialSpec): PBRSet {
  const [a, b] = pal(spec);
  return paint(512, 1.2, 8, (u, v) => {
    const g = vnoise(u * 260, v * 260, 260, 1);
    const g2 = vnoise(u * 120, v * 120, 120, 2);
    const peb = voronoi(u, v, 70, 3, 1);
    const stone = smooth(0.3, 0.15, peb.f1) * (peb.id > 0.82 ? 1 : 0);
    let c = mixRGB(a, b, fbm(u, v, 4, 3, 5) * 0.8);
    c = mulRGB(c, 0.85 + g * 0.18 + g2 * 0.08);
    c = mixRGB(c, mixRGB([0.85, 0.82, 0.76], [0.4, 0.37, 0.33], hash(peb.id, 3)), stone * 0.7);
    return { h: g * 0.35 + g2 * 0.3 + stone * 0.6, c, r: 0.96 - stone * 0.15 };
  });
}

/**
 * A soil fill (spec.crumb: black humus, compost, dirt) as the ground paints it: the clod relief of humus-field.ts (the same the 3D bed surface is
 * raised by, so the two agree) in soft dark browns. Clod tops a little drier and lighter, the fines between them a
 * little darker and velvety, never black; a few short, dark shreds of bark; a very rare pale fleck. Matched to `mean`.
 * Carries the bed's lumps by its normals where the 3D surface has sunk away (past ~12 m) and in every hollow.
 */
function humusGroundSet(spec: MaterialSpec): PBRSet {
  const C = spec.crumb!;
  const soil = C.soil.map((x) => hexRGB(x.c));
  const cum: number[] = [];
  C.soil.reduce((t, x) => (cum.push(t + x.share), t + x.share), 0);
  const pickSoil = (h: number) => soil[Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v))];
  const fiber = C.fiber.map(hexRGB);
  const speck = C.speck.map(hexRGB);
  const m = hexRGB(C.mean);
  const mean: RGB = [toLin(m[0]), toLin(m[1]), toLin(m[2])];
  // Normals at about half the relief's true slope: soft, as crumbly soil reads.
  const px = CLOD_TILE / 1024;
  return paint(1024, CLOD_TILE, 0.55 / (2 * px), (u, v) => {
    const f = clodField(u, v, C.style);
    const soft = vnoise(u * 9, v * 9, 9, 61), velvet = vnoise(u * 70, v * 70, 70, 62);
    let c = mixRGB(soil[2], soil[1], 0.35 + soft * 0.5);
    if (f.id >= 0) c = mixRGB(c, pickSoil(f.id), 0.25);
    // Drier, lighter clod tops; darker but still brown down in the fines.
    c = mulRGB(c, (0.86 + 0.2 * f.top) * (0.95 + 0.07 * velvet));
    let h = f.h;
    // A few short shreds of dark bark, lying in the hollows.
    const fc = voronoi(u, v, 18, 63, 1);
    if (fc.id > 1 - 0.38 * C.style.fibers && f.top < 0.6) {
      const ang = fc.id * Math.PI * 9, ca = Math.cos(ang), sa = Math.sin(ang);
      const along = (fc.dx * ca + fc.dy * sa) / 0.3, across = (-fc.dx * sa + fc.dy * ca) * 70 + Math.sin(along * 2.5 + fc.id * 20) * 1.2;
      const strand = smooth(1, 0.4, Math.abs(across)) * smooth(1, 0.5, Math.abs(along));
      if (strand > 0) {
        const light = fc.id > 1 - 0.38 * C.style.fibers * C.style.lightFibers;
        c = mixRGB(c, mulRGB(fiber[light ? 1 + Math.floor(hash(fc.id, 9) * 2) : hash(fc.id, 8) > 0.5 ? 3 : 0], 0.8 + 0.2 * velvet), strand * (light ? 0.8 : 0.6));
        h += strand * 0.0006;
      }
    }
    // Perlite: a very rare, tiny pale fleck.
    const sp = voronoi(u, v, 300, 64, 1);
    if (sp.id > 0.9985) c = mixRGB(c, speck[1], smooth(0.18, 0.06, sp.f1) * 0.6);
    // The roughness channel carries the clod height instead (the ground's humus layer is matte by a constant): the 3D
    // bed surface is raised by it, so it stands exactly where this texture's normals say.
    return { h, c, r: f.h / CLOD_MAX };
  }, mean);
}

/** Rounded stones packed together: river rock, black pebble, cobble. */
/**
 * The ground under a bed of loose stones (spec.pebble): the same stones packed tight, at their size, in their colors and
 * shares, darker in the gaps. It shows between the 3D stones and in their place where they are too small to draw.
 */
function pebbleGroundSet(spec: MaterialSpec): PBRSet {
  const P = spec.pebble!;
  const avg = ((P.minIn + P.maxIn) / 2) * 0.0254;
  const lin = P.colors.map((x) => rockAlbedo(x.c).map((v) => toSrgb(v)) as RGB);
  const cum: number[] = [];
  P.colors.reduce((s, x) => (cum.push(s + x.share), s + x.share), 0);
  const pickC = (h: number) => lin[Math.max(0, cum.findIndex((v) => h * cum[cum.length - 1] <= v))];
  const form = P.form ?? 'pebble';
  // Chips are long and narrow: their cells are counted by width, then stretched along each chip.
  const across = form === 'chip' ? avg * ((P.wide[0] + P.wide[1]) / 2) : avg;
  const cells = Math.max(6, Math.round(1 / (across * 0.85)));
  // Scaled to the stones' average color, so a bed reads the same where its 3D stones give way to this texture.
  const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const avgLin = [0, 1, 2].map((k) => P.colors.reduce((s, x) => s + x.share * toLin(parseInt(x.c.slice(1 + 2 * k, 3 + 2 * k), 16) / 255), 0));
  const mean = rockAlbedo('#' + avgLin.map((v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, '0')).join(''));
  return paint(1024, 1, 8, (u, v) => {
    if (form === 'crushed') {
      // Angular pieces: each cell a stone with two or three flat broken faces, lit by their tilt, dark in the gaps.
      const cell = voronoi(u, v, cells, 17, 0.9);
      // Distance to the cell's border (Voronoi cells are polygons: angular stones), 0 at a gap.
      const edge = Math.min(1, (cell.f2 - cell.f1) / 0.45);
      if (edge < 0.07) return { h: 0, c: mulRGB(lin[lin.length - 1], 0.55), r: 1 };
      const a1 = hash(cell.id, 3) * Math.PI * 2;
      const facet = Math.cos(Math.atan2(cell.dy, cell.dx) - a1) > 0 ? 1 : 0;
      const tilt = (hash(cell.id, 8 + facet) - 0.5) * 0.5;
      const grain = vnoise(u * 700, v * 700, 700, 9);
      const c = mulRGB(pickC(hash(cell.id, 7)), (0.78 + tilt + Math.min(1, edge * 3) * 0.12) * (0.94 + grain * 0.1));
      return { h: Math.min(1, edge * 2.2) * (0.7 + facet * 0.3), c, r: 0.85 + grain * 0.1 };
    }
    if (form === 'chip') {
      // Flat chips overlapping: long cells along each chip's own direction, grain along it, darker under the next one.
      const cell = voronoi(u, v, cells, 19, 0.95);
      const ang = hash(cell.id, 5) * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const along = cell.dx * ca - cell.dy * sa, acr = (cell.dx * sa + cell.dy * ca) * 2.6;
      const d = Math.hypot(along * 0.55, acr) / (0.45 + hash(cell.id, 1) * 0.1);
      if (d >= 1) return { h: 0.05, c: mulRGB(lin[lin.length - 1], 0.45), r: 1 };
      const fib = vnoise(u * 40 + along * 3, v * 40 + acr * 9, 40, 6);
      const c = mulRGB(pickC(hash(cell.id, 7)), (0.7 + (1 - d) * 0.3) * (0.88 + fib * 0.2));
      return { h: 0.4 + (1 - d) * 0.5 + fib * 0.1, c, r: 0.92 };
    }
    const cell = voronoi(u, v, cells, 13, 0.85);
    const ang = hash(cell.id, 5) * Math.PI;
    const ex = cell.dx * Math.cos(ang) - cell.dy * Math.sin(ang);
    const ey = (cell.dx * Math.sin(ang) + cell.dy * Math.cos(ang)) * 1.3;
    const d = Math.hypot(ex, ey) / (0.46 + hash(cell.id, 1) * 0.08);
    const dome = Math.sqrt(Math.max(0, 1 - d * d));
    const pit = vnoise(u * 900, v * 900, 900, 4);
    if (dome <= 0) return { h: 0, c: mulRGB(lin[0], 0.45), r: 1 };
    const c = mulRGB(pickC(hash(cell.id, 7)), (0.62 + dome * 0.42) * (0.94 + pit * 0.1));
    return { h: dome, c, r: 0.72 + pit * 0.15 };
  }, mean);
}

function stonesSet(spec: MaterialSpec, cells: number, tile: number, gloss: number): PBRSet {
  const colors = pal(spec);
  return paint(512, tile, 10, (u, v) => {
    const cell = voronoi(u, v, cells, 6, 0.85);
    const rad = 0.44 + hash(cell.id, 1) * 0.1;
    // Elongated stones: stretch along a per-stone direction.
    const ang = hash(cell.id, 5) * Math.PI;
    const ex = cell.dx * Math.cos(ang) - cell.dy * Math.sin(ang);
    const ey = (cell.dx * Math.sin(ang) + cell.dy * Math.cos(ang)) * 1.35;
    const d = Math.hypot(ex, ey) / rad;
    const dome = Math.sqrt(Math.max(0, 1 - d * d));
    const inStone = dome > 0;
    let c = pick(colors, hash(cell.id, 7));
    const speck = vnoise(u * 220, v * 220, 220, 4);
    c = mulRGB(c, (0.72 + dome * 0.22) * (0.92 + speck * 0.12));
    if (!inStone) c = mulRGB(colors[colors.length - 1], 0.6);
    return { h: dome, c, r: inStone ? 1 - gloss * (0.5 + dome * 0.5) : 1 };
  });
}

/* ------------------------------------------------------------------ */
/* Walls                                                                */
/* ------------------------------------------------------------------ */

function wallSet(spec: MaterialSpec, face: WallFace): PBRSet {
  const colors = pal(spec);
  if (face === 'plaster') {
    const [a, b] = colors;
    return paint(512, 2.4, 3, (u, v) => {
      const m = fbm(u, v, 3, 5, 4);
      const trowel = fbm(u * 1.7 + m, v * 0.9, 6, 4, 9);
      const c = mulRGB(mixRGB(a, b, smooth(0.3, 0.8, trowel)), 0.92 + m * 0.14);
      return { h: trowel * 0.3, c, r: 0.7 - trowel * 0.15 };
    });
  }
  if (face === 'ledgestone' || face === 'stackedStone') {
    const ledge = face === 'ledgestone';
    const r = rng(spec.id);
    const T = 1.2;
    // Courses of random height, pieces of random length.
    const rows: { y0: number; h: number; cuts: number[] }[] = [];
    let y = 0;
    while (y < T - 0.01) {
      let h = ledge ? (1 + Math.floor(r() * 3)) * IN * 1.2 : (2 + r() * 3) * IN;
      if (T - y - h < 0.02) h = T - y;
      const cuts = [0];
      let x = 0;
      while (x < T - 1e-6) {
        let l = (ledge ? 6 + r() * 12 : 4 + r() * 10) * IN;
        if (T - x - l < 0.05) l = T - x;
        x += l;
        cuts.push(x);
      }
      const shift = r() * T;
      rows.push({ y0: y, h, cuts: cuts.map((c) => c + shift) });
      y += h;
    }
    return paint(1024, T, ledge ? 9 : 10, (u, v) => {
      const yy = v * T;
      let ri = rows.findIndex((rw) => yy >= rw.y0 && yy < rw.y0 + rw.h);
      if (ri < 0) ri = rows.length - 1;
      const rw = rows[ri];
      const shift = rw.cuts[0];
      const xs = ((((u * T - shift) % T) + T) % T) + shift;
      let k = 0;
      while (k < rw.cuts.length - 2 && xs >= rw.cuts[k + 1]) k++;
      const edge = Math.min(xs - rw.cuts[k], rw.cuts[k + 1] - xs, yy - rw.y0, rw.y0 + rw.h - yy);
      const id = ri * 131 + k;
      const split = fbm(u * 2 + hash(id, 3), v * 6, 16, 4, (id % 50) + 1);
      const depth = hash(id, 8) * 0.4;
      const gap = edge < 0.003 + split * 0.003;
      let c = mixRGB(pick(colors, hash(id, 2)), colors[0], 0.25);
      c = mulRGB(c, 0.88 + split * 0.2);
      if (gap) c = mulRGB(colors[colors.length - 1], 0.5);
      return { h: gap ? 0 : 0.5 + depth * 0.6 + split * 0.35, c, r: 0.9 };
    });
  }
  if ((face === 'smoothUnit' || face === 'roughHewn' || face in WALL_FACES) && spec.wall?.unit) return unitWallSet(spec, face as 'smoothUnit' | 'roughHewn' | UnitFace, spec.wall.unit);
  // Block walls. A maker's block takes its stone-to-stone variation from the swatch tones as photographed (wallTones)
  // and its overall color from the photo (wallFaceMean), like the unit walls below.
  const smoothFace = face === 'smoothBlock';
  const lay = smoothFace ? cobbleLayout([[18, 6], [12, 6], [24, 6]], spec.id) : runningLayout(16, 6, 0.5, false, 8, 3, spec.id);
  const T = lay.tile;
  const { stone: tones, joint } = spec.maker ? wallTones(spec) : { stone: colors, joint: colors[colors.length - 1] };
  return paint(1024, T, smoothFace ? 6 : 13, (u, v) => {
    const hit = lay.at(u * T, v * T);
    const mortar = hit.edge < 0.004;
    const split = smoothFace ? vnoise(u * 300, v * 300, 300, 3) * 0.3 : fbm(u, v, 24, 4, 3 + (hit.id % 20));
    let c = pick(tones, hash(hit.id, 1));
    c = mulRGB(c, smoothFace ? 0.94 + split * 0.15 : 0.8 + split * 0.35);
    if (mortar) c = mulRGB(joint, 0.7);
    return { h: mortar ? 0 : 0.4 + smooth(0.004, 0.012, hit.edge) * 0.4 + split * (smoothFace ? 0.1 : 0.6), c, r: smoothFace ? 0.8 : 0.92 };
  }, spec.maker ? wallFaceMean(spec) : undefined);
}

/**
 * A maker's wall in its real units: courses of `unit.course` inches, course lines level with the ground, laid by
 * `unit.pattern` (the maker's repeating courses) or else `unit.bond`: the face lengths mixed at random (running joints),
 * one length shifted half a unit each course, or one length stacked with its joints in line. Units with
 * `unit.halfShift` are two half-height faces, the upper one offset along the wall (Lamina). 'smoothUnit' is a smooth,
 * crisp face with tight joints and a small chamfer; 'roughHewn' is a deeply split stone face, pitched at its edges,
 * with a shallower virtual joint inside each unit so one unit reads as two stones; the other faces have their own
 * recipes in ./wallfaces.
 */
function unitWallSet(spec: MaterialSpec, face: 'smoothUnit' | 'roughHewn' | UnitFace, unit: WallUnit): PBRSet {
  // The swatch tones as photographed set the stone-to-stone variation (wallTones); the face's overall color is then
  // matched to the photo (wallFaceMean), so a palette with a very dark or light tone no longer pulls the whole wall off.
  const { stone: colors, joint } = spec.maker ? wallTones(spec) : (() => { const p = pal(spec); return { stone: p, joint: p[p.length - 1] }; })();
  const r = rng(`${spec.id}:units`);
  const recipe = face === 'smoothUnit' || face === 'roughHewn' ? null : WALL_FACES[face];
  const rough = face === 'roughHewn';
  const pattern = unit.pattern?.length ? unit.pattern : null;
  const bond = pattern ? 'pattern' : unit.bond ?? 'random';
  const period = pattern ? pattern[0].lengths.reduce((a, b) => a + b, 0) : unit.lengths[0];
  const H = unit.course * IN;
  // A square tile, a whole number of courses tall (about 6 ft, at least two courses: an 18 in tile of 36 in panels would
  // spread 1,024 texels over 18 ft and blur fine detail). Half and stack bonds and patterns repeat seamlessly
  // only when the tile holds whole units (or whole pattern repeats) across, a half bond an even number of courses and a
  // pattern a whole number of its courses, so those take the next size that does.
  let rows = Math.max(2, Math.round(72 / unit.course));
  if (bond !== 'random') {
    for (let n = rows; n <= rows * 3; n++) {
      const across = (n * unit.course) / period;
      const fits = bond === 'pattern' ? n % pattern!.length === 0 : bond === 'stack' || n % 2 === 0;
      if (Math.abs(across - Math.round(across)) < 1e-6 && fits) {
        rows = n;
        break;
      }
    }
  }
  const T = rows * H;
  // Wall faces map v = height above grade + 0.08 m, and the painted texture is flipped on upload (row 0 at the top), so a
  // texel's height above grade is (1 - v) * T - 0.08: courses then start at grade and a recipe's y runs up the wall.
  const V0 = 0.08;
  const start = r() * unit.lengths[0] * IN; // where the bonded courses' joints fall along the wall
  const course = (ri: number) => {
    const cuts = [0];
    const splits: number[] = [];
    const seq = pattern ? pattern[ri % pattern.length].lengths : null;
    let x = 0, i = 0;
    while (x < T - 1e-6) {
      let l = (seq ? seq[i++ % seq.length] : unit.lengths[bond === 'random' ? Math.floor(r() * unit.lengths.length) : 0]) * IN;
      if (!seq && T - x - l < unit.lengths[0] * IN * 0.5) l = T - x; // the last unit in the tile closes the row
      splits.push(unit.split ? unit.split[Math.floor(r() * unit.split.length)] * IN : -1);
      x = Math.min(T, x + l);
      cuts.push(x);
    }
    const shift = pattern ? pattern[ri % pattern.length].start * IN
      : bond === 'random' ? r() * T : start + (bond === 'half' && ri % 2 ? unit.lengths[0] * IN * 0.5 : 0);
    return { cuts, splits, shift };
  };
  // With two offset halves each course is laid twice, the upper half's joints `halfShift` along from the lower's.
  const halves = unit.halfShift !== undefined;
  const courses = Array.from({ length: rows }, (_, ri) => course(ri));
  const J = (rough ? 0.18 : 0.1) * IN; // half joint
  return paint(1024, T, recipe ? recipe.normal : rough ? 18 : 6, (u, v) => {
    const yy = (((((1 - v) * T - V0) % T) + T) % T);
    const ri = Math.min(rows - 1, Math.floor(yy / H));
    const row = courses[ri];
    let ly = yy - ri * H;
    let hh = H, half = -1, off = 0;
    if (halves) {
      half = ly >= H / 2 ? 1 : 0;
      hh = H / 2;
      ly -= half * hh;
      off = half * unit.halfShift! * IN;
    }
    const xs = ((((u * T - row.shift - off) % T) + T) % T);
    let k = 0;
    while (k < row.cuts.length - 2 && xs >= row.cuts[k + 1]) k++;
    const a = row.cuts[k], b = row.cuts[k + 1];
    const id = ri * 97 + k + (half > 0 ? 50 : 0);
    let edge = Math.min(xs - a, b - xs, ly, hh - ly);
    const sp = row.splits[k];
    if (recipe) {
      return recipe.texel({ u, v, T, id, x: xs - a, y: ly, w: b - a, h: hh, edge, split: sp > 0 && sp < b - a - 0.02 ? sp : -1, half, stone: colors, joint });
    }
    const vj = sp > 0 && sp < b - a - 0.02 ? Math.abs(xs - a - sp) : 1;
    if (rough) edge -= (vnoise(u * 160, v * 160, 160, 7) - 0.5) * 0.0025; // slightly uneven arrises
    if (edge < J) {
      const g = vnoise(u * 400, v * 400, 400, 2);
      return { h: 0, c: mulRGB(joint, 0.55 + g * 0.12), r: 1 };
    }
    let c = pick(colors, hash(id, 1));
    c = mixRGB(c, pick(colors, hash(id, 5)), 0.35 * fbm(u + hash(id, 2) * 3, v + hash(id, 3) * 3, Math.round(T * 3), 3, id % 40));
    if (!rough) {
      // Smooth, sharp face: a small chamfer at each edge, fine sand texture, a faint trowel cloud.
      const g = vnoise(u * 500, v * 500, 500, 11);
      const cloud = fbm(u + hash(id, 4), v, Math.round(T * 5), 3, 17);
      const bev = smooth(J, J + 0.004, edge);
      c = mulRGB(c, 0.93 + cloud * 0.08 + g * 0.04);
      return { h: bev * (0.94 + g * 0.04), c, r: 0.72 + cloud * 0.08 };
    }
    return roughStone(u, v, T, id, colors, edge, J, vj);
  }, spec.maker ? (wallFaceMean(spec).map((m) => m * (recipe?.lift ?? 1)) as RGB) : undefined);
}

/**
 * Rough-hewn concrete stone (Highland Stone), as in Belgard's photos: a lumpy split face with a few broad planes,
 * pitched and chipped at the arrises, full of small pits, flecked with light and dark aggregate, and colored in soft
 * blotches of the blend's tones inside each stone. `edge` is the distance to the stone's edge (m), `vj` the distance
 * to its virtual joint (the shallower groove that makes one unit read as two stones).
 */
function roughStone(u: number, v: number, T: number, id: number, colors: RGB[], edge: number, J: number, vj: number) {
  const n = colors.length;
  const light = colors[0], dark = colors[n - 1];
  // The virtual joint reads like a narrower real joint, each side pitched like its own stone.
  if (vj < J * 0.7) return { h: 0.04, c: mulRGB(dark, 0.6), r: 1 };
  const e = Math.min(edge, vj + J * 0.3);
  const big = fbm(u + hash(id, 6) * 5, v + hash(id, 7) * 5, Math.max(2, Math.round(T * 3)), 4, 30 + (id % 25));
  const plane = 1 - Math.abs(big - 0.5) * 2;
  const mid = fbm(u + hash(id, 8), v, Math.max(4, Math.round(T * 12)), 3, 60 + (id % 13));
  const grit = vnoise(u * 900, v * 900, 900, 19);
  const chip = (vnoise(u * 90, v * 90, 90, 23) - 0.5) * 0.006;
  const pitch = smooth(J, J + 0.014 + big * 0.014, e + chip);
  // Pores: a scatter of small pits, and a finer one.
  const p1 = voronoi(u, v, Math.round(T * 120), 41);
  const r1 = 0.14 + hash(p1.id, 9) * 0.2;
  const pit = hash(p1.id, 4) < 0.5 ? 1 - smooth(r1 * 0.55, r1, p1.f1) : 0;
  const p2 = voronoi(u, v, Math.round(T * 300), 43);
  const pit2 = hash(p2.id, 5) < 0.45 ? 1 - smooth(0.12, 0.24, p2.f1) : 0;
  // Aggregate flecks, light and dark.
  const s1 = voronoi(u, v, Math.round(T * 200), 47);
  const fleck = s1.f1 < 0.2 ? (hash(s1.id, 6) < 0.55 ? 1 : -1) : 0;
  // Soft blotches of the blend's tones, a charcoal and a warm tan beyond the swatch's own range.
  const b1 = fbm(u + hash(id, 2) * 7, v + hash(id, 3) * 7, Math.max(3, Math.round(T * 4)), 4, 70 + (id % 31));
  const b2 = fbm(u + hash(id, 10) * 7, v + hash(id, 11) * 7, Math.max(3, Math.round(T * 6)), 4, 90 + (id % 29));
  let c = mixRGB(light, dark, smooth(0.3, 0.72, b1));
  c = mixRGB(c, mulRGB(dark, 0.78), smooth(0.58, 0.74, b2) * 0.55);
  c = mixRGB(c, [light[0] * 1.07, light[1] * 1.0, light[2] * 0.9], smooth(0.4, 0.26, b2) * 0.55);
  // The edge rolls off to a rounded arris rather than dropping to the joint, so it catches light instead of a dark rim.
  const h = Math.max(0, 0.22 + pitch * (0.16 + plane * 0.28 + mid * 0.22 + grit * 0.1) - pit * 0.3 - pit2 * 0.13);
  // Pitched edges fall into shade from their own shape, so only a light darkening here; the whole face a touch deeper.
  c = mulRGB(c, 0.76 + h * 0.26 + grit * 0.08);
  c = mulRGB(c, (1 - pit * 0.42) * (1 - pit2 * 0.22));
  if (fleck > 0) c = mixRGB(c, [0.86, 0.84, 0.8], 0.45);
  else if (fleck < 0) c = mulRGB(c, 0.62);
  return { h, c, r: 0.95 + pit * 0.05 };
}

/**
 * One slab on its own, as a stepping stone: the slab's face filling the tile edge to edge (the tile is the slab), with
 * its small chamfer all round and no joint, in the line's colors on the same calibration as its paving, softly clouded
 * with a fine sand grain. `wIn` x `dIn` is the slab (inches, along u and v); a long slab's tile is its long side, and it
 * takes the part of it from u = 0 and (the canvas being flipped onto the mesh) from v = 1 down. A one-slab paver pad
 * (builder/hardscape.ts) uses a square one, any side.
 */
export function slabSet(spec: MaterialSpec, wIn = 24, dIn = wIn): PBRSet {
  const key = wIn === 24 && dIn === 24 ? `slab:${spec.id}` : wIn === dIn ? `slab:${spec.id}:${wIn}` : `slab:${spec.id}:${wIn}x${dIn}`;
  return textureSet(key, () => {
    const colors = pal(spec);
    const n = colors.length;
    const T = Math.max(wIn, dIn) * IN, W = wIn * IN, D = dIn * IN;
    return paint(512, T, 5, (u, v) => {
      const x = u * T, y = (1 - v) * T;
      // distance to the slab's edge, m (outside the slab, where the tile runs past a short side: the edge itself)
      const e = Math.max(0, Math.min(x, W - x, y, D - y));
      const bev = smooth(0, 0.006, e); // a 1/4 in chamfer
      const cloud = fbm(u, v, 3, 4, 31), patch = fbm(u + 0.3, v + 0.7, 5, 3, 35);
      const grain = vnoise(u * 400, v * 400, 400, 33), fine = vnoise(u * 140, v * 140, 140, 34);
      let c = mixRGB(colors[0], colors[Math.min(n - 1, 1)], cloud);
      c = mixRGB(c, colors[Math.min(n - 1, 2)], smooth(0.55, 0.85, patch) * 0.5);
      c = mulRGB(c, (0.94 + grain * 0.06 + fine * 0.03) * (0.82 + bev * 0.18));
      return { h: bev * (0.96 + grain * 0.03), c, r: 0.72 + grain * 0.1 };
    });
  });
}

/** A poured stepping pad's face: its concrete look with no saw cuts (a pad of 4 ft or less needs none). */
export function padSet(spec: MaterialSpec): PBRSet {
  return textureSet(`pad:${spec.id}`, () => concreteSet(spec, spec.finish === 'stamped' && !spec.stamp ? 'broom' : spec.finish ?? 'broom', false));
}

/**
 * A natural flagstone's split (cleft) face, for a piece set on its own: no joints, the stone's own relief and color,
 * on the paving calibration. 1.2 m tiles; each piece takes its own part of the tile (builder/features.ts).
 *   sandstone  (AZ Classic Oak) cream to buff with tan swirls along its bedding, a faint pink mottle, peeled layers.
 *   rhyolite   (Cold Water Canyon) porous reddish brown to black, pitted, with pale gray-green and dark crusts of
 *              lichen and a little moss in the low spots.
 *   slate      (SUI Black Slate) charcoal to black, lightly riven in long shallow steps, fine streaks, a rare rust stain.
 */
export function flagFaceSet(spec: MaterialSpec): PBRSet {
  return textureSet(`flag:${spec.id}`, () => {
    // The colors are the stone as photographed, so they go through the same calibration as a maker's swatch.
    const alb = (h: string) => hexRGB(photoAlbedo(h));
    const colors = spec.palette.map(alb);
    const n = colors.length;
    const stone = spec.flag?.stone ?? 'sandstone';
    const lichenPale = alb('#a3a291'), lichenDark = alb('#2c2b26'), moss = alb('#646a3a');
    const rust = alb('#7a5640');
    return paint(1024, 1.2, stone === 'slate' ? 4 : 7, (u, v) => {
      const grain = vnoise(u * 600, v * 600, 600, 71), fine = vnoise(u * 180, v * 180, 180, 72);
      if (stone === 'sandstone') {
        // Bedding swirls: bands bent by a slow warp; layers peeled off in broad flakes (terraced relief).
        const warp = fbm(u, v, 2, 4, 73);
        const band = 0.5 + 0.5 * Math.sin((v * 5 + warp * 3.2) * Math.PI * 2);
        const flake = fbm(u + 0.4, v, 3, 5, 74);
        const step = Math.floor(flake * 5) / 5, rise = smooth(0, 0.06, flake * 5 - Math.floor(flake * 5));
        let c = mixRGB(colors[0], colors[1], smooth(0.25, 0.85, band));
        c = mixRGB(c, colors[2], smooth(0.62, 0.9, fbm(u, v + 0.3, 4, 4, 75)) * 0.55);
        c = mixRGB(c, colors[Math.min(3, n - 1)], smooth(0.6, 0.8, fbm(u + 0.7, v + 0.2, 3, 3, 76)) * 0.5);
        // The "oak" grain: thin tan to rust lines swirling along the bedding.
        const g = (v * 11 + warp * 4.5 + fbm(u, v, 6, 3, 78) * 0.6) % 1;
        const line = smooth(0.09, 0.0, Math.abs(g - 0.5)) * (0.55 + 0.45 * fbm(u + 0.2, v + 0.9, 5, 3, 79));
        c = mixRGB(c, mulRGB(colors[2], 0.82), line * 0.42);
        const iron = vnoise(u * 90, v * 90, 90, 77) > 0.93 ? 1 : 0;
        if (iron) c = mixRGB(c, rust, 0.35);
        c = mulRGB(c, 0.9 + grain * 0.08 + fine * 0.05 + (rise - 1) * 0.04);
        return { h: step * 0.5 + rise * 0.08 + grain * 0.04 + fine * 0.05, c, r: 0.86 + grain * 0.08 };
      }
      if (stone === 'rhyolite') {
        // Porous lava: a rough, lumpy face with small dark vesicles; lichen crusts in scalloped patches, moss in hollows.
        const lump = fbm(u, v, 5, 5, 81);
        const vc = voronoi(u, v, 140, 82, 0.9);
        const pore = smooth(0.12, 0.05, vc.f1) * (hash(vc.id, 3) > 0.55 ? 1 : 0);
        let c = mixRGB(colors[0], colors[1], smooth(0.3, 0.7, fbm(u + 0.2, v, 3, 4, 83)));
        c = mixRGB(c, colors[2], smooth(0.55, 0.85, fbm(u, v + 0.6, 4, 4, 84)) * 0.7);
        c = mixRGB(c, colors[Math.min(3, n - 1)], smooth(0.7, 0.9, fbm(u + 0.5, v + 0.5, 6, 3, 85)) * 0.5);
        c = mulRGB(c, (0.86 + lump * 0.2 + grain * 0.08) * (1 - pore * 0.55));
        // Lichen grows in round rosettes 1 to 3 cm across with scalloped rims, scattered (some areas bare), pale
        // gray-green, with smaller dark ones; moss only in a few hollows.
        const scallop = vnoise(u * 300, v * 300, 300, 87);
        const lc = voronoi(u, v, 36, 86, 0.9), lr = 0.18 + hash(lc.id, 5) * 0.22;
        const patchy = smooth(0.38, 0.6, fbm(u, v, 3, 3, 90));
        const pale = hash(lc.id, 6) > 0.55 ? smooth(lr + 0.04, lr - 0.02, lc.f1 + scallop * 0.06) * patchy : 0;
        if (pale > 0) c = mixRGB(c, mulRGB(lichenPale, 0.8 + scallop * 0.35), pale * 0.75);
        const dc = voronoi(u + 0.37, v + 0.61, 70, 88, 0.9);
        const dark = hash(dc.id, 7) > 0.7 ? smooth(0.2, 0.14, dc.f1 + scallop * 0.05) : 0;
        if (dark > 0) c = mixRGB(c, lichenDark, dark * 0.7);
        const low = smooth(0.4, 0.3, lump) * smooth(0.7, 0.74, fbm(u, v, 20, 3, 89));
        if (low > 0) c = mixRGB(c, mulRGB(moss, 0.8 + grain * 0.4), low * 0.7);
        return { h: lump * 0.7 + grain * 0.12 - pore * 0.35 + pale * 0.04, c, r: 0.92 + grain * 0.06 - pale * 0.04 };
      }
      // Slate: long shallow riven steps along the cleavage, fine streaks, a soft sheen.
      const riv = fbm(u * 0.6, v * 2.2, 3, 4, 91);
      const step = Math.floor(riv * 6) / 6, edge = smooth(0, 0.05, riv * 6 - Math.floor(riv * 6));
      const streak = vnoise(u * 8, v * 120, 1e6, 92);
      let c = mixRGB(colors[0], colors[1], smooth(0.3, 0.75, fbm(u, v, 3, 4, 93)));
      c = mixRGB(c, colors[2], smooth(0.6, 0.85, riv) * 0.6);
      c = mixRGB(c, colors[Math.min(3, n - 1)], (1 - edge) * 0.5);
      const stain = smooth(0.74, 0.82, fbm(u + 0.4, v + 0.1, 3, 4, 94));
      if (stain > 0) c = mixRGB(c, rust, stain * 0.45);
      c = mulRGB(c, 0.92 + streak * 0.08 + grain * 0.05);
      return { h: step * 0.4 + edge * 0.05 + streak * 0.03 + grain * 0.02, c, r: 0.84 + grain * 0.06 + stain * 0.06 };
    });
  });
}

/** The cap of a rough-hewn wall: the same porous, flecked stone, 18 in pieces along the wall, with no courses. */
export function wallCapTextures(spec: MaterialSpec): PBRSet {
  return textureSet(`cap:${spec.id}`, () => {
    // Seen from above, so its average follows the paving calibration (a touch deeper than the face's photo).
    const generic = pal(spec).map((c) => mulRGB(c, 0.92));
    const { stone: colors, joint } = spec.maker ? wallTones(spec) : { stone: generic, joint: generic[generic.length - 1] };
    const T = 72 * IN, L = 18 * IN, J = 0.12 * IN;
    return paint(1024, T, 15, (u, v) => {
      const x = u * T, k = Math.floor(x / L);
      const edge = Math.min(x - k * L, (k + 1) * L - x);
      if (edge < J) return { h: 0.05, c: mulRGB(joint, 0.5), r: 1 };
      return roughStone(u, v, T, 500 + k, colors, edge + 0.02, J, 1);
    }, spec.maker ? (topMean(spec).map((v) => v * 0.92) as RGB) : undefined);
  });
}

/* ------------------------------------------------------------------ */
/* Fences                                                               */
/* ------------------------------------------------------------------ */

function fenceSet(spec: MaterialSpec, style: FenceStyle): PBRSet {
  const colors = pal(spec);
  if (style === 'chainlinkSlat') {
    const [a, b] = colors;
    return paint(512, 1.2, 4, (u, v) => {
      const x = u * 1.2;
      const k = Math.floor(x / 0.06);
      const lx = x - k * 0.06;
      // Slats woven through diamond mesh: a thin dark line at each slat edge
      // and the galvanized wire showing in a diagonal pattern.
      const edge = lx < 0.004;
      const d1 = ((u + v) * 24) % 1, d2 = ((u - v + 24) * 24) % 1;
      const wire = (d1 < 0.04 || d2 < 0.04) && (k + Math.floor(v * 24)) % 2 === 0;
      let c = mixRGB(a, b, hash(k, 2) * 0.6 + vnoise(u * 8, v * 40, 1e6, 3) * 0.4);
      if (edge) c = mulRGB(c, 0.55);
      if (wire) c = [0.62, 0.63, 0.62];
      return { h: edge ? 0.2 : wire ? 1 : 0.6, c, r: wire ? 0.4 : 0.7 };
    });
  }
  if (style === 'metalPicket') {
    // Library tile: dark pickets and two rails on a light background (the fence itself is built from geometry).
    const metal = colors[0] ?? [0.1, 0.1, 0.11];
    return paint(256, 0.4, 1, (u, v) => {
      const px = (u * 4) % 1, picket = px > 0.3 && px < 0.55 && v > 0.04 && v < 0.96;
      const rail = (v > 0.2 && v < 0.29) || (v > 0.74 && v < 0.83);
      const on = picket || rail;
      return { h: on ? 1 : 0, c: on ? metal : [0.86, 0.85, 0.82], r: on ? 0.6 : 0.9 };
    });
  }
  const painted = style === 'grayLattice' || style === 'grayBoardLattice' || style === 'vinyl';
  const horizontal = style === 'horizontal';
  const bw = style === 'horizontal' ? 0.14 : style === 'vinyl' ? 0.15 : 0.14;
  const gap = style === 'horizontal' ? 0.012 : style === 'dogEar' ? 0.006 : style === 'vinyl' ? 0.002 : 0.0035;
  const T = bw * 12;
  return paint(512, T, style === 'vinyl' ? 3 : 6, (u, v) => {
    const a = horizontal ? v * T : u * T;
    const b = horizontal ? u : v;
    const k = Math.floor(a / bw);
    const la = a - k * bw;
    const isGap = la < gap;
    // Board-on-board: every other board sits in front and casts a shadow line.
    const front = style === 'boardOnBoard' && k % 2 === 0;
    const grainA = horizontal ? u * 300 : u * 18 + k * 7;
    const grainB = horizontal ? v * 18 + k * 7 : v * 220;
    const grain = painted ? 0.5 : vnoise(grainA, grainB, 1e6, 4) * 0.5 + vnoise(grainA * 0.4 + k, grainB * 0.15, 1e6, 6) * 0.5;
    const knot = !painted && vnoise(u * 30 + k * 3, b * 12, 1e6, 9) > 0.92 ? 1 : 0;
    let c = pick(colors, hash(k, 3));
    c = mulRGB(c, painted ? 0.96 + grain * 0.05 : 0.8 + grain * 0.3 - knot * 0.25);
    if (style === 'boardOnBoard' && !front && la < 0.012) c = mulRGB(c, 0.6);
    if (isGap) c = [0.05, 0.045, 0.04];
    const h = isGap ? 0 : (front ? 1 : 0.7) * (painted ? 1 : 0.85 + grain * 0.15);
    return { h, c, r: style === 'vinyl' ? 0.45 : 0.85 };
  });
}

function latticeTexture(color: string): THREE.Texture {
  const set = textureSet(`lattice:${color}`, () => {
    const base = hexRGB(color);
    const p = paint(256, 0.3, 4, (u, v) => {
      const d1 = ((u + v) * 4) % 1, d2 = ((u - v + 4) * 4) % 1;
      const s1 = d1 < 0.22, s2 = d2 < 0.22;
      const on = s1 || s2;
      const c = on ? mulRGB(base, s1 && s2 ? 0.85 : 0.95 + vnoise(u * 40, v * 40, 40, 3) * 0.1) : [0, 0, 0] as RGB;
      return { h: on ? 1 : 0, c, r: on ? 0.8 : 0 };
    });
    return p;
  });
  return set.roughnessMap;
}

/** Alpha mask for diagonal lattice (white = solid). */
export function latticeAlpha(): THREE.Texture {
  return latticeTexture('#ffffff');
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                             */
/* ------------------------------------------------------------------ */

/** Textures for a catalog material. `laying` picks the laying pattern of a paver that offers patterns (its first when left out). */
export function materialTextures(spec: MaterialSpec, laying?: LayingPattern): PBRSet {
  const lay = layingOf(spec, laying);
  return textureSet(`mat:${spec.id}${lay ? `:${lay}` : ''}`, () => {
    switch (spec.recipe) {
      case 'lawn': return lawnSet(spec);
      case 'turfArtificial': return turfSet(spec);
      case 'mulch': return mulchSet(spec);
      case 'dg': return spec.crumb ? humusGroundSet(spec) : dgSet(spec);
      case 'riverRock': return stonesSet(spec, 13, 1.0, 0.3);
      case 'blackPebble': return spec.pebble ? pebbleGroundSet(spec) : stonesSet(spec, 22, 1.0, 0.65);
      case 'cobble': return stonesSet(spec, 7, 1.2, 0.25);
      case 'paver': return paverSet(spec, lay);
      case 'concrete': return concreteSet(spec, spec.finish ?? 'broom');
      case 'flagstone': return flagstoneSet(spec);
      case 'deck': return deckSet(spec);
      case 'wall': return wallSet(spec, spec.wall?.face ?? 'splitFace');
      case 'fence': return fenceSet(spec, spec.fence ?? 'boardOnBoard');
      case 'curb': return curbSet(spec);
      case 'steelEdging': return steelSet(spec);
    }
  });
}

function flagstoneSet(spec: MaterialSpec): PBRSet {
  const colors = pal(spec);
  // Set in decomposed granite: wider gaps filled with DG instead of mortar.
  const inDg = spec.id.includes('dg');
  return paint(1024, 2.2, 10, (u, v) => {
    const cell = voronoi(u, v, 6, 12, 0.95);
    const gap = cell.f2 - cell.f1;
    const inStone = gap > (inDg ? 0.16 : 0.07);
    if (!inStone && inDg) {
      const g = vnoise(u * 400, v * 400, 400, 2);
      return { h: g * 0.2, c: mulRGB([0.68, 0.6, 0.48], 0.85 + g * 0.2), r: 0.97 };
    }
    const layers = vnoise(u * 60 + cell.id * 9, v * 14, 1e6, 6);
    const speck = vnoise(u * 400, v * 400, 400, 9);
    let c = pick(colors, hash(cell.id, 2));
    c = mulRGB(c, 0.84 + layers * 0.2 + speck * 0.06);
    if (!inStone) c = mulRGB([0.55, 0.5, 0.42], 0.6 + speck * 0.4);
    return { h: inStone ? smooth(0.07, 0.14, gap) * (0.85 + layers * 0.15) : speck * 0.15, c, r: inStone ? 0.72 : 0.95 };
  });
}

function deckSet(spec: MaterialSpec): PBRSet {
  // A maker's deck board: the board face alone (the deck is built board by board, builder/deck.ts).
  if (spec.board) return boardFaceSet(spec.board, pal(spec), topMean(spec));
  const colors = pal(spec);
  const Bw = 0.14, T = 2.24;
  return paint(1024, T, 6, (u, v) => {
    const x = u * T, y = v * T;
    const b = Math.floor(x / Bw);
    const lx = x - b * Bw;
    const ly = (y + hash(b, 1) * T) % 1.12;
    const gap = lx < 0.006 || ly < 0.004;
    const grain = vnoise(u * 40 + b * 13, v * 3, 1e6, 2) * 0.6 + vnoise(u * 300, v * 8, 1e6, 3) * 0.4;
    let c = pick(colors, hash(b, 7));
    c = mulRGB(c, 0.85 + grain * 0.3);
    if (gap) c = [0.08, 0.06, 0.05];
    return { h: gap ? 0 : 0.8 + grain * 0.2, c, r: gap ? 1 : 0.62 + grain * 0.12 };
  });
}

function steelSet(spec: MaterialSpec): PBRSet {
  const [a, b] = pal(spec);
  return paint(256, 1, 3, (u, v) => {
    const n = fbm(u, v, 6, 5, 4);
    return { h: n, c: mulRGB(mixRGB(a, b, n), 0.9 + n * 0.3), r: 0.6 + n * 0.3 };
  });
}

export const soilTextures = () => textureSet('soil', soilSet);

/** Corten steel: rust with darker streaks. */
export function cortenSet(): PBRSet {
  return textureSet('corten', () =>
    paint(512, 1.2, 4, (u, v) => {
      const n = fbm(u, v, 5, 5, 3);
      const streak = vnoise(u * 60, v * 4, 60, 8);
      const c = mixRGB([0.52, 0.25, 0.12], [0.33, 0.15, 0.08], n * 0.7 + streak * 0.3);
      return { h: n, c, r: 0.75 + n * 0.2 };
    }),
  );
}

/** Large-format porcelain panel with soft veining, for water walls. */
export function porcelainPanelSet(): PBRSet {
  return textureSet('porcelainPanel', () =>
    paint(512, 1.2, 2, (u, v) => {
      const flow = fbm(u * 0.6 + fbm(u, v, 3, 3, 2) * 0.5, v * 2.2, 3, 5, 6);
      const c = mixRGB([0.64, 0.62, 0.58], [0.5, 0.48, 0.45], smooth(0.35, 0.7, flow));
      return { h: 0.5, c, r: 0.35 };
    }),
  );
}

export { clamp01 };
