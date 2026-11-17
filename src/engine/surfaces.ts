import * as THREE from 'three';
import { isThreePiece, type ConcreteFinish, type FenceStyle, type LayingPattern, type MaterialSpec, type PaverPattern, type WallFace, type WallUnit } from '../siteplan/catalog';
import { rng } from '../siteplan/geometry';
import { clamp01, fbm, smooth, vnoise, voronoi } from './noise';
import { hash, hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from './textures';

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

function pal(spec: MaterialSpec): RGB[] {
  return spec.palette.map((h) => hexRGB(spec.maker ? photoAlbedo(h) : h));
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
}

interface Layout {
  tile: number;
  at(x: number, y: number): PieceHit;
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
      return { id, edge: Math.min(lx, W - lx, ly, H - ly), along: lx / W, rotated: false, len: W };
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
interface PieceModule { pieces: [number, number, number, number][]; v1: [number, number]; v2: [number, number]; P: number }
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

function moduleLayout(m: PieceModule): Layout {
  const det = m.v1[0] * m.v2[1] - m.v1[1] * m.v2[0];
  const P = m.P;
  return {
    tile: P * IN,
    at(x: number, y: number) {
      const X = x / IN, Y = y / IN;
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
            const cx = ((((ox + px + pw / 2) % P) + P) % P), cy = ((((oy + py + ph / 2) % P) + P) % P);
            const rotated = ph > pw;
            const edge = Math.min(qx - px, px + pw - qx, qy - py, py + ph - qy) * IN;
            const along = rotated ? (qy - py) / ph : (qx - px) / pw;
            return { id: Math.round(cx * 2) * 1009 + Math.round(cy * 2), edge, along, rotated, len: Math.max(pw, ph) * IN };
          }
        }
      }
      return { id: 0, edge: 0, along: 0, rotated: false, len: 0 };
    },
  };
}

function layoutFor(p: PaverPattern, seed: string, laying?: LayingPattern): Layout {
  const [a, b] = p.sizes[0];
  if (laying && laying !== 'random' && p.kind === 'ashlar') return moduleLayout(THREE_PIECE[laying]);
  switch (p.kind) {
    case 'running': return runningLayout(a, b, 0.5, false, 12, 6, seed);
    case 'soldier': {
      // One course of pavers: a pieces along the edge, b across. The tile must hold whole pieces both ways, or the
      // band (exactly b wide, from the tile's edge) straddles two rows; so it is a common multiple of a and b, >= 36 in.
      const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
      const lcm = (a * b) / gcd(Math.round(a * 8), Math.round(b * 8)) * 8;
      const L = lcm * Math.max(1, Math.ceil(36 / lcm));
      return runningLayout(a, b, 0, false, Math.round(L / b), Math.round(L / a), seed);
    }
    case 'plank': return runningLayout(a, b, 0.33, true, Math.round(96 / b), Math.max(2, Math.round(96 / a)), seed);
    case 'grid': return runningLayout(a, b, 0, false, 2, 2, seed);
    case 'herringbone': return herringboneLayout(a, b);
    case 'basket': return basketLayout(a, b);
    case 'cobble': return cobbleLayout(p.sizes, seed);
    case 'ashlar': {
      const unit = p.sizes.some((s) => s[0] % 6 || s[1] % 6) ? 3 : 6;
      return packedLayout(p.sizes, unit, unit === 3 ? 32 : 24, seed);
    }
  }
}

function paverSet(spec: MaterialSpec, laying?: LayingPattern): PBRSet {
  const p = spec.pattern!;
  const colors = pal(spec);
  const lay = layoutFor(p, spec.id, laying);
  const T = lay.tile;
  const J = (p.joint * IN) / 2;
  const bevel = p.tumbled ? 0.012 : p.face === 'woodgrain' || p.face === 'smooth' ? 0.0025 : 0.005;
  const size = T > 5 ? 2048 : 1024;
  return paint(size, T, p.tumbled ? 12 : p.face === 'slate' ? 15 : 9, (u, v) => {
    const x = u * T, y = v * T;
    const hit = lay.at(x, y);
    const id = hit.id;
    const r1 = hash(id, 1.7), r2 = hash(id, 9.3), r3 = hash(id, 4.1);
    // Tumbled pieces have chipped, wavy edges.
    let edge = hit.edge;
    if (p.tumbled) edge -= (vnoise(u * 90, v * 90, 90, 3) - 0.5) * 0.008;
    const joint = edge < J;
    if (joint) {
      const g = vnoise(u * 500, v * 500, 500, 2);
      return { h: 0, c: mulRGB(JOINT_SAND, 0.75 + g * 0.3), r: 1 };
    }
    const bev = smooth(J, J + bevel, edge);
    let c = pick(colors, r1);
    // Real blends mix two tones inside one piece.
    const mott = fbm(u + r2 * 3.1, v + r3 * 2.7, Math.round(T * 4) || 4, 4, Math.floor(r2 * 50));
    c = mixRGB(c, pick(colors, r2), smooth(0.35, 0.75, mott) * 0.55);
    let h = bev;
    let rough = 0.82;
    if (p.face === 'woodgrain') {
      const g1 = vnoise(hit.rotated ? u * 30 : u * 3, hit.rotated ? v * 3 : v * 30, 1e6, id % 97);
      const g2 = vnoise(hit.rotated ? u * 160 : u * 8, hit.rotated ? v * 8 : v * 160, 1e6, (id % 89) + 3);
      c = mulRGB(c, 0.88 + g1 * 0.14 + g2 * 0.08);
      h = bev * (0.92 + g2 * 0.08);
      rough = 0.55;
    } else if (p.face === 'smooth') {
      const g = vnoise(u * 300, v * 300, 300, 5);
      c = mulRGB(c, 0.95 + g * 0.08);
      h = bev * (0.97 + g * 0.03);
      rough = 0.7;
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
      const g = vnoise(u * 600, v * 600, 600, 13);
      c = mulRGB(c, 1.05 + rip * 0.04 + step * 0.06 + g * 0.05); // lifted so the rippled face, shaded by its own relief, renders at its swatch color
      h = bev * (0.5 + rip * 0.3 + step * 0.16 + g * 0.04);
      rough = 0.84 - rip * 0.12;
    } else {
      // Textured face: fine aggregate and pores.
      const g = vnoise(u * 420, v * 420, 420, 7);
      const pore = vnoise(u * 900, v * 900, 900, 11) > 0.88 ? 1 : 0;
      c = mulRGB(c, 0.9 + g * 0.16 - pore * 0.12);
      h = bev * (0.9 + g * 0.1) - pore * 0.05;
      rough = 0.85;
    }
    if (p.tumbled) c = mulRGB(c, 0.85 + 0.15 * smooth(J, J + 0.02, edge));
    return { h, c, r: rough };
  });
}

/* ------------------------------------------------------------------ */
/* Concrete                                                             */
/* ------------------------------------------------------------------ */

function concreteSet(spec: MaterialSpec, finish: ConcreteFinish): PBRSet {
  const [a, b] = pal(spec);
  const T = 3.05; // 10 ft, saw cuts every 5 ft
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
    const joint = Math.min(jx, jy) < 0.004;
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

function turfSet(spec: MaterialSpec): PBRSet {
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

/** Rounded stones packed together: river rock, black pebble, cobble. */
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
  if ((face === 'smoothUnit' || face === 'roughHewn') && spec.wall?.unit) return unitWallSet(spec, face, spec.wall.unit);
  // Block walls.
  const smoothFace = face === 'smoothBlock';
  const lay = smoothFace ? cobbleLayout([[18, 6], [12, 6], [24, 6]], spec.id) : runningLayout(16, 6, 0.5, false, 8, 3, spec.id);
  const T = lay.tile;
  return paint(1024, T, smoothFace ? 6 : 13, (u, v) => {
    const hit = lay.at(u * T, v * T);
    const mortar = hit.edge < 0.004;
    const split = smoothFace ? vnoise(u * 300, v * 300, 300, 3) * 0.3 : fbm(u, v, 24, 4, 3 + (hit.id % 20));
    let c = pick(colors, hash(hit.id, 1));
    c = mulRGB(c, smoothFace ? 0.94 + split * 0.15 : 0.8 + split * 0.35);
    if (mortar) c = mulRGB(colors[colors.length - 1], 0.7);
    return { h: mortar ? 0 : 0.4 + smooth(0.004, 0.012, hit.edge) * 0.4 + split * (smoothFace ? 0.1 : 0.6), c, r: smoothFace ? 0.8 : 0.92 };
  });
}

/**
 * A maker's wall in its real units: courses of `unit.course` inches, each laid with the unit's face lengths at random
 * (running joints), course lines level with the ground. 'smoothUnit' is a smooth, crisp face with tight joints and a
 * small chamfer; 'roughHewn' is a deeply split stone face, pitched at its edges, with a shallower virtual joint
 * inside each unit so one unit reads as two stones.
 */
function unitWallSet(spec: MaterialSpec, face: 'smoothUnit' | 'roughHewn', unit: WallUnit): PBRSet {
  const colors = pal(spec);
  const r = rng(`${spec.id}:units`);
  const rough = face === 'roughHewn';
  const H = unit.course * IN;
  const rows = Math.max(6, Math.round(72 / unit.course));
  const T = rows * H; // square tile, a whole number of courses tall
  const V0 = 0.08; // wall faces map v = height above grade + 0.08 m
  const courses = Array.from({ length: rows }, () => {
    const cuts = [0];
    const splits: number[] = [];
    let x = 0;
    while (x < T - 1e-6) {
      let l = unit.lengths[Math.floor(r() * unit.lengths.length)] * IN;
      if (T - x - l < unit.lengths[0] * IN * 0.5) l = T - x; // the last unit in the tile closes the row
      splits.push(unit.split ? unit.split[Math.floor(r() * unit.split.length)] * IN : -1);
      x = Math.min(T, x + l);
      cuts.push(x);
    }
    return { cuts, splits, shift: r() * T };
  });
  const J = (rough ? 0.18 : 0.1) * IN; // half joint
  return paint(1024, T, rough ? 18 : 6, (u, v) => {
    const yy = ((((v * T - V0) % T) + T) % T);
    const ri = Math.min(rows - 1, Math.floor(yy / H));
    const row = courses[ri];
    const xs = ((((u * T - row.shift) % T) + T) % T);
    let k = 0;
    while (k < row.cuts.length - 2 && xs >= row.cuts[k + 1]) k++;
    const a = row.cuts[k], b = row.cuts[k + 1], ly = yy - ri * H;
    const id = ri * 97 + k;
    let edge = Math.min(xs - a, b - xs, ly, H - ly);
    const sp = row.splits[k];
    const vj = sp > 0 && sp < b - a - 0.02 ? Math.abs(xs - a - sp) : 1;
    if (rough) edge -= (vnoise(u * 160, v * 160, 160, 7) - 0.5) * 0.0025; // slightly uneven arrises
    if (edge < J) {
      const g = vnoise(u * 400, v * 400, 400, 2);
      return { h: 0, c: mulRGB(colors[colors.length - 1], 0.55 + g * 0.12), r: 1 };
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
  });
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

/** The cap of a rough-hewn wall: the same porous, flecked stone, 18 in pieces along the wall, with no courses. */
export function wallCapTextures(spec: MaterialSpec): PBRSet {
  return textureSet(`cap:${spec.id}`, () => {
    const colors = pal(spec).map((c) => mulRGB(c, 0.92));
    const T = 72 * IN, L = 18 * IN, J = 0.12 * IN;
    return paint(1024, T, 15, (u, v) => {
      const x = u * T, k = Math.floor(x / L);
      const edge = Math.min(x - k * L, (k + 1) * L - x);
      if (edge < J) return { h: 0.05, c: mulRGB(colors[colors.length - 1], 0.5), r: 1 };
      return roughStone(u, v, T, 500 + k, colors, edge + 0.02, J, 1);
    });
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
  const painted = style === 'grayLattice' || style === 'vinyl';
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

/** Textures for a catalog material. `laying` picks the laying pattern of a 3-piece paver set (Pattern A when left out). */
export function materialTextures(spec: MaterialSpec, laying?: LayingPattern): PBRSet {
  const lay: LayingPattern | undefined = isThreePiece(spec) ? laying ?? 'a' : undefined;
  return textureSet(`mat:${spec.id}${lay ? `:${lay}` : ''}`, () => {
    switch (spec.recipe) {
      case 'lawn': return lawnSet(spec);
      case 'turfArtificial': return turfSet(spec);
      case 'mulch': return mulchSet(spec);
      case 'dg': return dgSet(spec);
      case 'riverRock': return stonesSet(spec, 13, 1.0, 0.3);
      case 'blackPebble': return stonesSet(spec, 22, 1.0, 0.65);
      case 'cobble': return stonesSet(spec, 7, 1.2, 0.25);
      case 'paver': return paverSet(spec, lay);
      case 'concrete': return concreteSet(spec, spec.finish ?? 'broom');
      case 'flagstone': return flagstoneSet(spec);
      case 'deck': return deckSet(spec);
      case 'wall': return wallSet(spec, spec.wall?.face ?? 'splitFace');
      case 'fence': return fenceSet(spec, spec.fence ?? 'boardOnBoard');
      case 'curb': return concreteSet(spec, 'smooth');
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
