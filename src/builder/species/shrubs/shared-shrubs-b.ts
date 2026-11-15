import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, clamp, leafQuad, lerp, perp, rng, tube, type Branch } from '../kit';

/**
 * Shared code for the mounding shrubs built by `shrubs-b` (westringia, rose,
 * Indian hawthorn, artemisia, lavender).
 *
 * The idea: a dense shrub is defined by its outer shell. `growMound` first
 * scatters twig ends evenly over the plant's envelope, then builds the wood
 * backwards from them: main stems from the crown at the ground, limbs off the
 * stems, a twig to every shell point. Every twig end is therefore connected
 * to the base and the foliage shell has no holes.
 */

/* ------------------------------------------------------------------ */
/* Envelope                                                             */
/* ------------------------------------------------------------------ */

export interface MoundOpts {
  H: number;
  Sp: number;
  /** Twig ends on the shell. */
  points: number;
  /** Main stems from the ground. */
  stems: number;
  /** Shell points per limb (sets how many limbs each stem carries). */
  perLimb?: number;
  /** Height of the widest point, as a fraction of H. Default 0.42. */
  centerY?: number;
  /** Lowest shell direction as sin(elevation) from the center, -1 .. 0. Default -0.8. */
  under?: number;
  /** Superellipse exponent: 2 round, 2.6 boxier and flat-topped. */
  power?: number;
  /** Billow amplitude (0 smooth .. 0.25 lumpy) and lump count scale. */
  lump?: number;
  lumpFreq?: number;
  /** Twig ends are pulled inside the shell by up to this fraction, for a rougher surface. */
  rough?: number;
  /** Stem radius at the ground, meters. */
  stemRadius: number;
  /** Radius of the crown where stems leave the ground. */
  crown?: number;
  /** Positive: stems arch over (start steep, end flat). Negative: tips turn up. */
  arch?: number;
  gnarl?: number;
  /** Share of shell points present at install. Default 0.56. */
  early?: number;
  /** How far along the way to their shell points the stems and limbs reach. */
  stemReach?: number;
  limbReach?: number;
  /** Segments per twig (1 = straight, cheapest). Default 2. */
  twigSegs?: number;
}

export interface Mound {
  H: number;
  Sp: number;
  center: THREE.Vector3;
  radii: THREE.Vector3;
  stems: Branch[];
  limbs: Branch[];
  twigs: Branch[];
  /** Outward surface direction at a point. */
  out(p: THREE.Vector3): THREE.Vector3;
  /** 0 at the center .. 1 at the shell. */
  depth(p: THREE.Vector3): number;
  /** Wind weight at a point. */
  sway(p: THREE.Vector3): number;
}

function curve(r: () => number, a: THREE.Vector3, b: THREE.Vector3, segs: number, arch: number, gnarl: number): THREE.Vector3[] {
  const len = a.distanceTo(b);
  const side = perp(b.clone().sub(a).normalize());
  const g1 = (r() - 0.5) * gnarl * len, g2 = (r() - 0.5) * gnarl * len, ph = r() * 6.28;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t);
    const s = Math.sin(Math.PI * t);
    p.y += s * arch * len;
    p.addScaledVector(side, s * g1 + Math.sin(t * 6.28 + ph) * g2 * 0.5);
    pts.push(p);
  }
  return pts;
}

function atT(pts: THREE.Vector3[], t: number): THREE.Vector3 {
  const x = clamp(t) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(x));
  return pts[i].clone().lerp(pts[i + 1], x - i);
}

export function growMound(r: () => number, o: MoundOpts): Mound {
  const { H, Sp } = o;
  const cy = (o.centerY ?? 0.42) * H;
  const center = V(0, cy, 0);
  const radii = V(Sp / 2, H - cy, Sp / 2);
  const pw = o.power ?? 2.2;
  const lump = o.lump ?? 0, lf = o.lumpFreq ?? 3;
  const lv = [0, 1, 2, 3].map(() => V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(lf * (0.7 + r() * 0.8)));
  const lph = lv.map(() => r() * 6.28);
  const shell = (d: THREE.Vector3): number => {
    const ry = d.y >= 0 ? H - cy : cy;
    const a = Math.pow(Math.hypot(d.x, d.z) / (Sp / 2), pw) + Math.pow(Math.abs(d.y) / ry, pw);
    let k = 1;
    if (lump) {
      let n = 0;
      for (let i = 0; i < 4; i++) n += Math.sin(d.dot(lv[i]) + lph[i]);
      k = 1 + lump * (n / 4 - 0.35);
    }
    return (1 / Math.pow(a, 1 / pw)) * k;
  };
  const under = o.under ?? -0.8;

  // Shell points on a Fibonacci spiral (even coverage), skipping the underside.
  const pts: { p: THREE.Vector3; birth: number }[] = [];
  const total = Math.round(o.points / ((1 - under) / 2));
  const off = r() * 6.28;
  for (let i = 0; i < total; i++) {
    const y = 1 - (2 * (i + 0.5)) / total;
    if (y < under) break;
    const rad = Math.sqrt(1 - y * y), th = i * 2.39996 + off;
    const d = V(Math.cos(th) * rad, y, Math.sin(th) * rad);
    d.x += (r() - 0.5) * 0.08; d.y += (r() - 0.5) * 0.08; d.z += (r() - 0.5) * 0.08;
    d.normalize();
    const p = center.clone().addScaledVector(d, shell(d) * (1 - (o.rough ?? 0.08) * r()));
    p.y = Math.max(p.y, 0.012 + r() * 0.02 * H);
    const late = clamp(0.1 + 0.75 * (0.55 * r() + 0.45 * clamp(p.y / H)));
    pts.push({ p, birth: r() < (o.early ?? 0.56) ? 0 : late });
  }

  // Main stems: assign every shell point to the stem that points most nearly at it.
  const K = o.stems;
  const crown = o.crown ?? Sp * 0.04;
  const sdir: THREE.Vector3[] = [];
  for (let k = 0; k < K; k++) {
    const y = lerp(0.97, 0.12, (k + 0.5) / K);
    const rad = Math.sqrt(1 - y * y), th = k * 2.39996 + off * 1.7;
    sdir.push(V(Math.cos(th) * rad, y, Math.sin(th) * rad));
  }
  const origin = V(0, 0, 0);
  const groups: number[][] = sdir.map(() => []);
  pts.forEach((q, i) => {
    const d = q.p.clone().sub(origin).normalize();
    let best = 0, bd = -2;
    for (let k = 0; k < K; k++) {
      const x = d.dot(sdir[k]);
      if (x > bd) { bd = x; best = k; }
    }
    groups[best].push(i);
  });

  const stems: Branch[] = [], limbs: Branch[] = [], twigs: Branch[] = [];
  const perLimb = o.perLimb ?? 7;
  const arch = o.arch ?? 0.06, gn = o.gnarl ?? 0.12;
  groups.forEach((grp, k) => {
    if (!grp.length) return;
    const cen = V();
    for (const i of grp) cen.add(pts[i].p);
    cen.multiplyScalar(1 / grp.length);
    const flat = V(sdir[k].x, 0, sdir[k].z);
    if (flat.lengthSq() > 1e-6) flat.normalize();
    const base = flat.clone().multiplyScalar(crown * (0.3 + r() * 0.7)).add(V(0, -0.05, 0));
    const end = base.clone().lerp(cen, o.stemReach ?? 0.5);
    const spts = curve(r, base, end, 5, arch, gn);
    const stemBirth = Math.min(...grp.map((i) => pts[i].birth));
    const sr = o.stemRadius * (0.8 + r() * 0.4);
    const stem: Branch = { pts: spts, r0: sr, r1: sr * 0.5, level: 0, birth: stemBirth, length: base.distanceTo(end), parent: -1 };
    stems.push(stem);

    // Split the stem's shell points into limbs (a few rounds of k-means).
    const m = Math.max(1, Math.round(grp.length / perLimb));
    let cents = Array.from({ length: m }, (_, j) => pts[grp[Math.floor(((j + 0.5) * grp.length) / m)]].p.clone());
    let owner: number[] = [];
    for (let it = 0; it < 4; it++) {
      owner = grp.map((i) => {
        let b = 0, bd = Infinity;
        cents.forEach((c, j) => {
          const dd = c.distanceToSquared(pts[i].p);
          if (dd < bd) { bd = dd; b = j; }
        });
        return b;
      });
      cents = cents.map((c, j) => {
        const s = V();
        let n = 0;
        grp.forEach((i, gi) => { if (owner[gi] === j) { s.add(pts[i].p); n++; } });
        return n ? s.multiplyScalar(1 / n) : c;
      });
    }
    cents.forEach((c, j) => {
      const mine = grp.filter((_, gi) => owner[gi] === j);
      if (!mine.length) return;
      const t = 0.45 + r() * 0.55;
      const a = atT(spts, t);
      const e = a.clone().lerp(c, o.limbReach ?? 0.6);
      const lr = Math.max(0.0012, lerp(stem.r0, stem.r1, t) * 0.62);
      const lpts = curve(r, a, e, 4, arch * 0.6, gn * 1.2);
      const limb: Branch = { pts: lpts, r0: lr, r1: lr * 0.5, level: 1, birth: Math.min(...mine.map((i) => pts[i].birth)), length: a.distanceTo(e), parent: stems.length - 1 };
      limbs.push(limb);
      for (const i of mine) {
        const tt = 0.3 + r() * 0.7;
        const ta = atT(lpts, tt);
        const tr = Math.max(0.0009, lerp(limb.r0, limb.r1, tt) * 0.55);
        twigs.push({ pts: curve(r, ta, pts[i].p, o.twigSegs ?? 2, arch * 0.4, gn * 1.5), r0: tr, r1: tr * 0.45, level: 2, birth: pts[i].birth, length: ta.distanceTo(pts[i].p), parent: limbs.length - 1 });
      }
    });
  });

  const r2 = V(radii.x * radii.x, radii.y * radii.y, radii.z * radii.z);
  return {
    H, Sp, center, radii, stems, limbs, twigs,
    out: (p) => {
      const d = p.clone().sub(center);
      d.set(d.x / r2.x, d.y / (d.y >= 0 ? r2.y : cy * cy), d.z / r2.z);
      return d.lengthSq() < 1e-9 ? UP.clone() : d.normalize();
    },
    depth: (p) => {
      const d = p.clone().sub(center);
      if (d.lengthSq() < 1e-9) return 0;
      const len = d.length();
      return clamp(len / shell(d.multiplyScalar(1 / len)));
    },
    sway: (p) => clamp(Math.pow(clamp(p.y / H), 1.3) * 0.62 + (Math.hypot(p.x, p.z) / (Sp / 2)) * 0.3),
  };
}

/** Tubes for a mound's wood. `color(b, level)` gives the vertex color (it multiplies the bark). */
export function moundWood(g: GeoBuilder, m: Mound, color: (b: Branch) => THREE.Color, o: { twigs?: boolean; sides?: [number, number, number]; uvScale?: number } = {}) {
  const sides = o.sides ?? [7, 5, 3];
  const all = [...m.stems, ...m.limbs, ...(o.twigs === false ? [] : m.twigs)];
  for (const b of all) tube(g, b.pts, b.r0, b.r1, sides[b.level], color(b), b.birth, b.pts[0], (i) => m.sway(b.pts[i]), o.uvScale ?? 1);
}

/* ------------------------------------------------------------------ */
/* Sprigs                                                               */
/* ------------------------------------------------------------------ */

/** A direction leaning `spread` radians away from `out`, at a random azimuth, lifted toward the light. */
export function sprigDir(r: () => number, out: THREE.Vector3, spread: number, lift = 0.2): THREE.Vector3 {
  const a = perp(out), b = V().crossVectors(out, a).normalize();
  const az = r() * Math.PI * 2;
  return out.clone().multiplyScalar(Math.cos(spread)).addScaledVector(a, Math.sin(spread) * Math.cos(az)).addScaledVector(b, Math.sin(spread) * Math.sin(az)).add(V(0, lift, 0)).normalize();
}

export interface SprigOpts {
  cross?: boolean;
  curl?: number;
  segs?: number;
  /** How strongly the card turns its face to the outside of the shrub, 0..1. */
  faceOut?: number;
  normalBend?: number;
  fold?: number;
  swayTip?: number;
}

/** A sprig card (optionally two crossed cards) growing from `at` along `dir`. */
export function sprig(
  g: GeoBuilder, r: () => number, m: Mound, at: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number,
  uv: [number, number, number, number], color: THREE.Color, birth: number, o: SprigOpts = {},
) {
  const out = m.out(at);
  const fo = o.faceOut ?? 0.7;
  const face = out.clone().multiplyScalar(fo).add(V((r() - 0.5) * (1 - fo) * 2, (r() - 0.5) * (1 - fo) * 2 + 0.25, (r() - 0.5) * (1 - fo) * 2)).normalize();
  if (face.dot(out) < 0) face.negate();
  const s = m.sway(at);
  const lo = { segs: o.segs ?? 2, curl: o.curl ?? 0.2, fold: o.fold, center: m.center, radii: m.radii, normalBend: o.normalBend ?? 0.6, sway0: s, sway1: clamp(s + (o.swayTip ?? 0.12)) };
  leafQuad(g, at, dir, face, len, wid, uv, color, birth, at, lo);
  if (o.cross) {
    const face2 = V().crossVectors(dir, face).normalize();
    // Keep the front of the card toward the outside, so it is lit like the shell around it.
    if (face2.dot(out) < 0) face2.negate();
    leafQuad(g, at, dir, face2, len, wid, uv, color, birth, at, { ...lo, curl: 0 });
  }
}

/** A flat card centered at `c` facing `n` (flowers seen face-on), `size` across. */
export function faceCard(
  g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, size: number, roll: number, uv: [number, number, number, number],
  color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number, shadeN?: THREE.Vector3,
) {
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const x = a.clone().multiplyScalar(Math.cos(roll)).addScaledVector(b, Math.sin(roll));
  const y = V().crossVectors(n, x).normalize();
  const nn = shadeN ?? n;
  const h = size / 2;
  const i0 = g.vert(c.clone().addScaledVector(x, -h).addScaledVector(y, -h), nn, uv[0], uv[1], color, birth, anchor, sway);
  const i1 = g.vert(c.clone().addScaledVector(x, h).addScaledVector(y, -h), nn, uv[2], uv[1], color, birth, anchor, sway);
  const i2 = g.vert(c.clone().addScaledVector(x, h).addScaledVector(y, h), nn, uv[2], uv[3], color, birth, anchor, sway);
  const i3 = g.vert(c.clone().addScaledVector(x, -h).addScaledVector(y, h), nn, uv[0], uv[3], color, birth, anchor, sway);
  g.quad(i0, i1, i2, i3);
}

/* ------------------------------------------------------------------ */
/* Fit to the catalog size                                              */
/* ------------------------------------------------------------------ */

/** Scale finished builders so the plant is exactly H tall and Sp wide. */
export function fitAll(builders: GeoBuilder[], H: number, Sp: number) {
  let maxY = 1e-6, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const g of builders) {
    for (let i = 0; i < g.pos.length; i += 3) {
      minX = Math.min(minX, g.pos[i]); maxX = Math.max(maxX, g.pos[i]);
      maxY = Math.max(maxY, g.pos[i + 1]);
      minZ = Math.min(minZ, g.pos[i + 2]); maxZ = Math.max(maxZ, g.pos[i + 2]);
    }
  }
  const sx = Sp / Math.max(maxX - minX, maxZ - minZ), sy = H / maxY;
  for (const g of builders) {
    for (const arr of [g.pos, g.anchor]) {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] *= sx;
        arr[i + 1] *= arr[i + 1] > 0 ? sy : 1;
        arr[i + 2] *= sx;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Painting helpers                                                     */
/* ------------------------------------------------------------------ */

export const css = (c: THREE.Color) => `#${c.getHexString()}`;

/** A color between two hex colors, with a little random lightness. */
export function tone(a: string, b: string, t: number, r?: () => number, dl = 0.05): string {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), clamp(t));
  if (r) {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, clamp(hsl.l + (r() - 0.5) * 2 * dl));
  }
  return css(c);
}

/**
 * Trace an oval leaf with forward-pointing teeth, base at the origin, tip at
 * (len, 0). `teeth` per side; `depth` is tooth depth as a fraction of the
 * half width.
 */
export function serratePath(g: CanvasRenderingContext2D, len: number, wid: number, widest = 0.45, teeth = 12, depth = 0.1, tipSharp = 0.6) {
  const hw = wid / 2;
  const prof = (t: number) => {
    const a = t < widest ? Math.pow(Math.sin((Math.PI / 2) * (t / widest)), 0.75) : Math.pow(Math.cos((Math.PI / 2) * ((t - widest) / (1 - widest))), lerp(0.6, 1.2, tipSharp));
    return a;
  };
  const N = teeth * 5;
  const edge: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const fr = (t * teeth) % 1;
    const tooth = t < 0.12 ? 1 : 1 - depth * (1 - fr);
    edge.push([len * t, hw * prof(t) * tooth]);
  }
  g.beginPath();
  g.moveTo(0, 0);
  for (const [x, y] of edge) g.lineTo(x, -y);
  for (let i = edge.length - 1; i >= 0; i--) g.lineTo(edge[i][0], edge[i][1]);
  g.closePath();
}

/** Clip to atlas cell (cx, cy) of size cw x ch and move the origin to its top-left. Call g.restore() after. */
export function cellClip(g: CanvasRenderingContext2D, cx: number, cy: number, cw: number, ch: number) {
  g.save();
  g.translate(cx * cw, cy * ch);
  g.beginPath();
  g.rect(1, 1, cw - 2, ch - 2);
  g.clip();
}

/**
 * Make every pixel fully opaque or fully clear. Call it last in a texture's
 * draw function. The canvas leaves faint, nearly transparent pixels around
 * anti-aliased shapes whose color is unreliable (often near white); the kit's
 * color bleed only fills pixels with zero alpha, so those faint pixels would
 * show as pale outlines once the texture is filtered.
 */
export function hardenAlpha(g: CanvasRenderingContext2D, w: number, h: number, cut = 120) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= cut ? 255 : 0;
  g.putImageData(img, 0, 0);
}

/** A light, faintly streaked bark that vertex colors tint to the real stem color. */
export function stemBark(key: string, dark = 0.2): THREE.Texture {
  return barkTexture(`shrubs-b-bark-${key}`, 128, (g, S) => {
    const r = rng(`shrubs-b-bark-${key}`);
    g.fillStyle = '#d9d9d6';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      const x = r() * S, y = r() * S, len = 6 + r() * 40;
      g.strokeStyle = r() < 0.55 ? `rgba(40,36,30,${dark * (0.3 + r())})` : `rgba(255,255,255,${0.1 + r() * 0.25})`;
      g.lineWidth = 0.5 + r() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + len);
      g.stroke();
    }
  });
}
