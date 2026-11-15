import * as THREE from 'three';
import { GeoBuilder, V, clamp, jitter, leafTexture, lerp, mixCols, smoothstep } from '../kit';

/** mixCols that also accepts a single-color list (the kit's version needs two or more). */
const pick = (list: THREE.Color[], t: number) => (list.length === 1 ? list[0].clone() : mixCols(list, t));

/**
 * Shared parts for the grasses and grass-like plants: arching blade paths,
 * folded blade ribbons, flower stalks, plume cards, and a fit-to-catalog step.
 *
 * A blade is real geometry: a ribbon along an arching path, 2 or 3 vertices
 * across (3 gives a true V fold along the midrib), tapering to a point. Its
 * texture is a plain strip (midrib, parallel veins, optional variegation)
 * that the vertex color tints from the pale base to the tip.
 */

export interface Path {
  pts: THREE.Vector3[];
  /** Blade frame at each point: `side` across the blade, `up` its upper (inner) face. */
  sides: THREE.Vector3[];
  ups: THREE.Vector3[];
  /** Fraction of the length at each point (points crowd toward the tip, where the arch is). */
  ts: number[];
  /** Angle from vertical at the end, radians. */
  endTilt: number;
  az: number;
}

export interface PathOpts {
  /** Compass direction the blade leans toward, radians. */
  az: number;
  /** Angle from vertical at the base, radians. */
  tilt: number;
  /** Extra angle gained by the tip (the arch), radians. */
  bend: number;
  /** Where the arch concentrates: 1 even, 2+ toward the tip. */
  bendPow?: number;
  len: number;
  segs: number;
  /** Sideways curl of the heading by the tip, radians. */
  azCurl?: number;
  /** Rotation of the blade around its own axis at the base, and extra twist by the tip. */
  roll?: number;
  twist?: number;
  /** Lowest height the path may reach (tips rest on the ground instead of sinking). */
  floor?: number;
  /** How much the points crowd toward the tip (1 = even). Default: even turning angle per segment. */
  crowd?: number;
}

/** An arching path: starts at `base` leaning `tilt` from vertical and bends over by `bend`. */
export function archPath(base: THREE.Vector3, o: PathOpts): Path {
  const pts: THREE.Vector3[] = [], sides: THREE.Vector3[] = [], ups: THREE.Vector3[] = [], ts: number[] = [];
  const p = base.clone();
  // By default points are spread so each segment turns by a similar angle (no visible kinks).
  const sAt = (i: number) => {
    const u = i / o.segs;
    return o.crowd !== undefined ? 1 - Math.pow(1 - u, o.crowd) : lerp(u, Math.pow(u, 1 / pow), 0.7);
  };
  const pow = o.bendPow ?? 1.5;
  const frame = (s: number) => {
    const th = o.tilt + o.bend * Math.pow(s, pow);
    const a = o.az + (o.azCurl ?? 0) * s * s;
    const radial = V(Math.cos(a), 0, Math.sin(a));
    const d = radial.clone().multiplyScalar(Math.sin(th)).add(V(0, Math.cos(th), 0));
    const side0 = V(-Math.sin(a), 0, Math.cos(a));
    const n0 = V(0, Math.sin(th), 0).addScaledVector(radial, -Math.cos(th));
    const rho = (o.roll ?? 0) + (o.twist ?? 0) * s;
    const side = side0.clone().multiplyScalar(Math.cos(rho)).addScaledVector(n0, Math.sin(rho));
    const up = n0.clone().multiplyScalar(Math.cos(rho)).addScaledVector(side0, -Math.sin(rho));
    return { d, side, up };
  };
  for (let i = 0; i <= o.segs; i++) {
    const s = sAt(i);
    if (i > 0) {
      const s0 = sAt(i - 1);
      p.addScaledVector(frame((s + s0) / 2).d, o.len * (s - s0));
      if (o.floor !== undefined && p.y < o.floor) p.y = o.floor;
    }
    const f = frame(s);
    pts.push(p.clone());
    sides.push(f.side);
    ups.push(f.up);
    ts.push(s);
  }
  return { pts, sides, ups, ts, endTilt: o.tilt + o.bend, az: o.az + (o.azCurl ?? 0) };
}

export interface BladeOpts {
  wid: number;
  /** 2 = flat ribbon with folded normals, 3 = real V fold along the midrib. */
  cols?: 2 | 3;
  fold?: number;
  /** Width profile: fraction of full width at the base, where it is widest, and how sharply it tapers. */
  baseW?: number;
  widest?: number;
  taper?: number;
  cBase: THREE.Color;
  cMid: THREE.Color;
  cTip: THREE.Color;
  /** Color of the very tip (dry tips on old blades). */
  cEnd?: THREE.Color;
  /** Darkening at the base where blades shade each other, 0..1 (1 = none). */
  ao?: number;
  uv: [number, number, number, number];
  birth: number;
  /** Wind weight at the tip. */
  sway: number;
  /** Bias of the normals toward straight up, for softer shading. */
  nUp?: number;
}

/** A blade ribbon along a path. */
export function blade(g: GeoBuilder, path: Path, o: BladeOpts) {
  const n = path.pts.length - 1;
  const cols = o.cols ?? 2;
  const fold = o.fold ?? 0.25;
  const baseW = o.baseW ?? 0.55, widest = o.widest ?? 0.3, taper = o.taper ?? 1.4;
  const anchor = path.pts[0];
  const ao = o.ao ?? 0.6;
  let prev: number[] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = path.ts[i];
    const wf = t < widest ? lerp(baseW, 1, Math.sin((t / widest) * Math.PI * 0.5)) : Math.max(0.05, 1 - Math.pow((t - widest) / (1 - widest), taper));
    const w = o.wid * wf;
    const c = t < 0.22 ? o.cBase.clone().lerp(o.cMid, t / 0.22) : o.cMid.clone().lerp(o.cTip, Math.pow((t - 0.22) / 0.78, 1.4));
    if (o.cEnd && i === n) c.copy(o.cEnd);
    c.multiplyScalar(lerp(ao, 1, smoothstep(0, 0.5, t)));
    const sw = o.sway * Math.pow(t, 1.6);
    const side = path.sides[i], up = path.ups[i];
    const row: number[] = [];
    for (let k = 0; k < cols; k++) {
      const x = cols === 3 ? k / 2 - 0.5 : k - 0.5;
      const q = path.pts[i].clone().addScaledVector(side, x * w);
      if (cols === 3 && k === 1) q.addScaledVector(up, -w * fold);
      const nn = up.clone().addScaledVector(side, -Math.sign(x) * fold * 2.2);
      nn.y += o.nUp ?? 0.25;
      nn.normalize();
      row.push(g.vert(q, nn, lerp(o.uv[0], o.uv[2], x + 0.5), lerp(o.uv[1], o.uv[3], t), c, o.birth, anchor, sw));
    }
    if (prev) for (let k = 0; k < cols - 1; k++) g.quad(prev[k], prev[k + 1], row[k + 1], row[k]);
    prev = row;
  }
}

/* ------------------------------------------------------------------ */
/* Clumps of blades                                                     */
/* ------------------------------------------------------------------ */

export interface BladeGroup {
  count: number;
  len: [number, number];
  wid: [number, number];
  /** Angle from vertical at the base: center blades get the first, rim blades the second. */
  tilt: [number, number];
  /** Bias toward the first tilt value (1 even, 2 = more upright blades). */
  tiltPow?: number;
  bend: [number, number];
  bendPow?: number;
  segs: number;
  cols?: 2 | 3;
  fold?: number;
  /** Radius of the crown disc the blades rise from. */
  crownR: number;
  /** Colors: base of the blade, a list of typical blade colors, and tip colors. */
  cBase: THREE.Color;
  cMid: THREE.Color[];
  cTip: THREE.Color[];
  /** Chance of a dry straw tip. */
  dryTip?: number;
  cDry?: THREE.Color;
  /** Fraction present at install. */
  early?: number;
  sway?: number;
  ao?: number;
  baseW?: number;
  widest?: number;
  taper?: number;
  roll?: number;
  twist?: number;
  azCurl?: number;
  /** Length multiplier for rim blades relative to center ones. */
  rimLen?: number;
  /** Hue, saturation, lightness jitter. */
  vary?: [number, number, number];
  floor?: number;
  crowd?: number;
}

/** UV rectangles of the two blade strips in a `bladeMap` texture. */
export const STRIP: [number, number, number, number][] = [
  [0.03, 0.01, 0.47, 0.99],
  [0.53, 0.01, 0.97, 0.99],
];

/** Add a group of blades radiating from the crown. */
export function bladeGroup(g: GeoBuilder, r: () => number, o: BladeGroup) {
  const vary = o.vary ?? [0.012, 0.06, 0.05];
  for (let i = 0; i < o.count; i++) {
    const u = Math.pow((i + r()) / o.count, o.tiltPow ?? 1);
    const az = i * 2.39996 + (r() - 0.5) * 0.9;
    const rr = o.crownR * clamp(0.25 * r() + 0.8 * u);
    const base = V(Math.cos(az) * rr, -0.004, Math.sin(az) * rr);
    const tilt = lerp(o.tilt[0], o.tilt[1], u) + (r() - 0.5) * 0.12;
    const len = lerp(o.len[0], o.len[1], r()) * lerp(1, o.rimLen ?? 1, u);
    const path = archPath(base, {
      az: az + (r() - 0.5) * 0.5,
      tilt,
      bend: lerp(o.bend[0], o.bend[1], r()),
      bendPow: (o.bendPow ?? 1.6) * (0.8 + r() * 0.4),
      len,
      segs: o.segs,
      azCurl: (r() - 0.5) * 2 * (o.azCurl ?? 0.35),
      roll: (r() - 0.5) * 2 * (o.roll ?? 0.5),
      twist: (r() - 0.5) * 2 * (o.twist ?? 0.5),
      floor: o.floor ?? 0.004 + r() * 0.01,
      crowd: o.crowd,
    });
    const mid = jitter(pick(o.cMid, r()), r, vary[0], vary[1], vary[2]);
    const tip = mid.clone().lerp(pick(o.cTip, r()), 0.75);
    blade(g, path, {
      wid: lerp(o.wid[0], o.wid[1], r()),
      cols: o.cols,
      fold: o.fold,
      baseW: o.baseW,
      widest: o.widest,
      taper: o.taper,
      cBase: o.cBase.clone().lerp(mid, 0.3),
      cMid: mid,
      cTip: tip,
      cEnd: o.cDry && r() < (o.dryTip ?? 0) ? o.cDry : undefined,
      ao: o.ao,
      uv: STRIP[r() < 0.5 ? 0 : 1],
      birth: r() < (o.early ?? 0.58) ? 0 : clamp(0.1 + r() * 0.5 + u * 0.25, 0, 0.85),
      sway: o.sway ?? 0.8,
    });
  }
}

export interface StripPaint {
  /** Called per strip (0 or 1) after the base shading, to add variegation or stripes. x0..x1 is the strip. */
  extra?: (g: CanvasRenderingContext2D, x0: number, x1: number, h: number, strip: number) => void;
  /** Base fill, default near white (the vertex color supplies the hue). */
  fill?: string;
  /** Midrib and vein darkness 0..1. */
  rib?: number;
  veins?: number;
}

/**
 * Blade texture: two opaque strips side by side, each a blade seen flat with
 * a midrib groove, fine parallel veins and slightly darker edges.
 */
export function bladeMap(key: string, o: StripPaint = {}): THREE.Texture {
  return leafTexture(`blade-${key}`, 128, 512, (g, w, h) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let s = 0; s < 2; s++) {
      const x0 = (s * w) / 2, x1 = ((s + 1) * w) / 2, sw = x1 - x0;
      g.fillStyle = o.fill ?? '#f4f4f0';
      g.fillRect(x0, 0, sw, h);
      o.extra?.(g, x0, x1, h, s);
      // Soft edge shade and a lighter band either side of the midrib.
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.16)');
      grad.addColorStop(0.2, 'rgba(0,0,0,0)');
      grad.addColorStop(0.8, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = grad;
      g.fillRect(x0, 0, sw, h);
      const veins = o.veins ?? 0.1;
      for (let i = 1; i < 9; i++) {
        g.fillStyle = `rgba(0,0,0,${veins * (0.5 + rnd())})`;
        g.fillRect(x0 + (sw * i) / 9 + (rnd() - 0.5) * 2, 0, 1, h);
      }
      g.fillStyle = `rgba(0,0,0,${o.rib ?? 0.22})`;
      g.fillRect(x0 + sw * 0.5 - 1.5, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x0 + sw * 0.5 + 1.5, 0, 1.5, h);
      // Faint lengthwise mottling.
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
        g.fillRect(x0 + rnd() * sw, rnd() * h, 2 + rnd() * 4, 20 + rnd() * 60);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Stalks and plumes                                                    */
/* ------------------------------------------------------------------ */

/** A thin three-sided stalk along a path, colored c0 at the base to c1 at the top. */
export function stalk(
  g: GeoBuilder,
  pts: THREE.Vector3[],
  r0: number,
  r1: number,
  c0: THREE.Color,
  c1: THREE.Color,
  birth: number,
  sway: (t: number) => number,
  uv: [number, number] = [0.25, 0.5],
  anchor: THREE.Vector3 = pts[0],
) {
  const n = pts.length - 1;
  let prev: number[] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const a = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const e1 = V().crossVectors(d, a).normalize(), e2 = V().crossVectors(d, e1).normalize();
    const rad = lerp(r0, r1, t);
    const c = c0.clone().lerp(c1, t);
    const row: number[] = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2;
      const nn = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang));
      row.push(g.vert(pts[i].clone().addScaledVector(nn, rad), nn, uv[0], uv[1], c, birth, anchor, sway(t)));
    }
    if (prev) for (let k = 0; k < 3; k++) g.quad(prev[k], prev[(k + 1) % 3], row[(k + 1) % 3], row[k]);
    prev = row;
  }
}

/**
 * A plume or seed head: `planes` crossed textured ribbons along a path, so it
 * reads as a solid brush from every side. `wid(t)` is the full width along it.
 */
export function plume(
  g: GeoBuilder,
  path: Path,
  wid: number,
  uv: [number, number, number, number],
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: (t: number) => number,
  planes = 2,
) {
  const n = path.pts.length - 1;
  for (let pl = 0; pl < planes; pl++) {
    const ang = (pl / planes) * Math.PI;
    let prev: number[] | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const side = path.sides[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(path.ups[i], Math.sin(ang));
      const nn = path.ups[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(path.sides[i], -Math.sin(ang));
      // Light the brush softly from above whichever way the card faces.
      nn.multiplyScalar(0.5).add(V(0, 0.7, 0)).normalize();
      const a = g.vert(path.pts[i].clone().addScaledVector(side, -wid / 2), nn, uv[0], lerp(uv[1], uv[3], t), color, birth, anchor, sway(t));
      const b = g.vert(path.pts[i].clone().addScaledVector(side, wid / 2), nn, uv[2], lerp(uv[1], uv[3], t), color, birth, anchor, sway(t));
      if (prev) g.quad(prev[0], prev[1], b, a);
      prev = [a, b];
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fit to the catalog size                                              */
/* ------------------------------------------------------------------ */

/**
 * Scale finished geometry so its bounding box is exactly `height` tall and
 * `spread` wide (positions and anchors). Build close to size first: this is
 * only the last few percent.
 */
export function fitClump(parts: GeoBuilder[], height: number, spread: number) {
  let maxY = 0.001, minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const g of parts) {
    for (let i = 0; i < g.pos.length; i += 3) {
      maxY = Math.max(maxY, g.pos[i + 1]);
      minX = Math.min(minX, g.pos[i]);
      maxX = Math.max(maxX, g.pos[i]);
      minZ = Math.min(minZ, g.pos[i + 2]);
      maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sx = spread / Math.max(maxX - minX, maxZ - minZ), sy = height / maxY;
  for (const g of parts) {
    for (let i = 0; i < g.pos.length; i += 3) {
      g.pos[i] *= sx;
      g.pos[i + 1] *= sy;
      g.pos[i + 2] *= sx;
      g.anchor[i] *= sx;
      g.anchor[i + 1] *= sy;
      g.anchor[i + 2] *= sx;
    }
  }
  return { sx, sy };
}

/** Deterministic small random generator for texture painting. */
export function texRng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
