import * as THREE from 'three';
import {
  GeoBuilder, UP, V, along, barkTexture, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, smoothstep, tube, uvCell,
  type PlantSpec, type SpeciesGeo, type SpeciesLook,
} from '../kit';

/**
 * Shared code for the conifers: scale-leaf foliage painting (cypress and
 * juniper sprays), fibrous and scaly bark, a size fitter, and the builder for
 * dense upright scale-leaf conifers (Italian cypress and the two upright
 * junipers).
 */

/* ------------------------------------------------------------------ */
/* Colors                                                               */
/* ------------------------------------------------------------------ */

/** CSS color between two hex colors, scaled by `k` (linear light). */
export function cssMix(a: string, b: string, t: number, k = 1): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), clamp(t)).multiplyScalar(k).getHexString();
}

export interface ScalePal {
  key: string;
  /** Shaded old foliage, typical foliage, sunlit foliage, new tip growth. */
  dark: string;
  mid: string;
  light: string;
  tip: string;
  /** Woody stem inside a spray. */
  stem: string;
}

/* ------------------------------------------------------------------ */
/* Scale-leaf sprays painted on a canvas                                */
/* ------------------------------------------------------------------ */

export interface FrondStyle {
  pal: ScalePal;
  /** Width in px of the ultimate scale-clad cords. */
  cord: number;
  /** Side branchlet angle off its parent, radians, and its random spread. */
  angle: number;
  angleVar: number;
  /** Px between side branchlets on the main axis (tighter on each finer level). */
  spacing: number;
  /** Side branchlet length over parent length at the base, and its multiplier at the parent's tip. */
  ratio: number;
  taper: number;
  /** Branchlets shorter than this many px do not branch again. */
  minLen: number;
  /** 0..1 amount of prickly awl (juvenile) leaves standing off the cords. */
  awl: number;
  /** Waviness of each axis. */
  wave: number;
  /** 0..1 how strongly side branchlets curve back toward their parent's direction (upswept habit). */
  sweep: number;
  /** Chance a side branchlet is missing, for a ragged outline. */
  gaps: number;
  /** Brightness multiplier (below 1 for a shaded back layer). */
  tone: number;
  maxLevel: number;
}

/**
 * Paint one spray of scale foliage: an axis with alternate side branchlets,
 * each branching again, ending in short scale-clad cords. Drawn from (x, y)
 * toward `ang` (canvas radians), `len` px long.
 */
export function paintFrond(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, st: FrondStyle, level = 0, tipness = 0.5, home = ang) {
  const P = st.pal;
  const segs = level === 0 ? 6 : len > 60 ? 4 : 2;
  const pts: [number, number, number][] = [[x, y, ang]];
  let a = ang, px = x, py = y;
  const bend = (r() - 0.5) * st.wave;
  for (let i = 0; i < segs; i++) {
    a += bend / segs + (r() - 0.5) * st.wave * 0.25;
    if (level > 0) a = lerp(a, home, st.sweep / segs * 2);
    px += (Math.cos(a) * len) / segs;
    py += (Math.sin(a) * len) / segs;
    pts.push([px, py, a]);
  }
  const at = (t: number): [number, number, number] => {
    const f = clamp(t) * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
    return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k), pts[i + 1][2]];
  };
  const terminal = level >= st.maxLevel || len < st.minLen;
  const w = st.cord * (level === 0 ? 1.5 : level === 1 ? 1.2 : 1);

  // Own axis first, so the finer branchlets overlap it.
  const c0 = level === 0 ? cssMix(P.stem, P.dark, 0.25, st.tone) : cssMix(P.dark, P.mid, 0.35 + 0.5 * tipness, st.tone);
  const c1 = terminal ? cssMix(P.light, P.tip, 0.25 + 0.75 * tipness * (0.6 + r() * 0.4), st.tone) : cssMix(P.mid, P.light, 0.3 + 0.6 * tipness, st.tone);
  const grad = g.createLinearGradient(x, y, px, py);
  grad.addColorStop(0, c0);
  if (level === 0) grad.addColorStop(0.3, cssMix(P.dark, P.mid, 0.6, st.tone));
  grad.addColorStop(1, c1);
  g.strokeStyle = grad;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 1; i <= segs; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
  if (w >= 2) {
    // Overlapping scales: a beaded highlight and a fine dark notch between scales.
    g.setLineDash([w * 0.55, w * 0.85]);
    g.lineCap = 'butt';
    g.strokeStyle = `rgba(255,255,235,${0.11 * st.tone})`;
    g.lineWidth = w * 0.42;
    g.stroke();
    g.lineDashOffset = w * 0.7;
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = w * 0.9;
    g.setLineDash([w * 0.18, w * 1.22]);
    g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;
    g.lineCap = 'round';
  }
  if (st.awl > 0 && level >= 1) {
    // Awl leaves: short sharp prickles standing off the cord.
    g.strokeStyle = c1;
    g.lineWidth = Math.max(1, st.cord * 0.38);
    g.beginPath();
    const n = Math.round((len / (st.cord * 1.1)) * st.awl);
    for (let i = 0; i < n; i++) {
      const [qx, qy, qa] = at(r());
      const aa = qa + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.5);
      const l = st.cord * (1.3 + r() * 1.3);
      g.moveTo(qx, qy);
      g.lineTo(qx + Math.cos(aa) * l, qy + Math.sin(aa) * l);
    }
    g.stroke();
  }
  if (terminal) return;

  const sp = st.spacing * Math.pow(0.72, level);
  const n = Math.max(2, Math.round(len / sp));
  let side = r() < 0.5 ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const t = lerp(0.1, 0.94, (k + 0.3 + r() * 0.4) / n);
    const [qx, qy, qa] = at(t);
    side = -side;
    if (r() < st.gaps) continue;
    const cl = len * st.ratio * lerp(1, st.taper, t) * (0.6 + r() * 0.75);
    const ca = qa + side * (st.angle + (r() - 0.5) * 2 * st.angleVar);
    paintFrond(g, r, qx, qy, ca, cl, st, level + 1, lerp(tipness * 0.6, 1, t), qa);
  }
}

/** Run `draw` clipped to a cell of a cols x rows atlas, origin at the cell's top-left. */
export function inCell(g: CanvasRenderingContext2D, W: number, H: number, cols: number, rows: number, i: number, draw: (w: number, h: number) => void, pad = 5) {
  const cw = W / cols, ch = H / rows;
  g.save();
  g.translate((i % cols) * cw, Math.floor(i / cols) * ch);
  g.beginPath();
  g.rect(pad, pad, cw - pad * 2, ch - pad * 2);
  g.clip();
  draw(cw, ch);
  g.restore();
}

/** An opaque patch of dark, mottled foliage (for the shaded core inside dense conifers). */
export function paintCore(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, P: ScalePal, tone = 0.5) {
  g.fillStyle = cssMix(P.dark, P.stem, 0.25, tone);
  g.fillRect(-2, -2, w + 4, h + 4);
  g.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const x = r() * w, y = r() * h, a = -Math.PI / 2 + (r() - 0.5) * 1.6, l = 8 + r() * 26;
    g.strokeStyle = cssMix(P.dark, r() < 0.2 ? P.stem : P.mid, r() * 0.7, tone * (0.6 + r() * 0.7));
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

export const frondStyle = (pal: ScalePal, o: Partial<FrondStyle> = {}): FrondStyle => ({
  pal, cord: 4.5, angle: 0.5, angleVar: 0.12, spacing: 26, ratio: 0.5, taper: 0.35, minLen: 34, awl: 0, wave: 0.25, sweep: 0.3, gaps: 0.12, tone: 1, maxLevel: 3, ...o,
});

/**
 * 3 x 2 atlas (1024 px) for upright scale-leaf conifers: five plumes of
 * upright sprays (base at the bottom of each cell) and, in the last cell, an
 * opaque patch for the shaded core.
 */
export function plumeAtlas(P: ScalePal, style: Partial<FrondStyle> = {}): THREE.Texture {
  return leafTexture(`conifer-plume-${P.key}`, 1024, 1024, (g, W, H) => {
    const r = rng(`plume-${P.key}`);
    for (let cell = 0; cell < 5; cell++) {
      inCell(g, W, H, 3, 2, cell, (w, h) => {
        const back = frondStyle(P, { ...style, tone: 0.5 });
        const mid = frondStyle(P, { ...style, tone: 0.75 });
        const front = frondStyle(P, style);
        const x0 = w / 2, y0 = h - 7;
        const up = -Math.PI / 2;
        const lean = (r() - 0.5) * 0.12;
        for (const s of [-1, 1, 0]) paintFrond(g, r, x0 + s * 8, y0, up + lean + s * (0.16 + r() * 0.2), h * (0.5 + r() * 0.35), back);
        const s1 = r() < 0.5 ? -1 : 1;
        paintFrond(g, r, x0 + s1 * 4, y0, up + lean + s1 * (0.2 + r() * 0.14), h * (0.45 + r() * 0.3), mid);
        paintFrond(g, r, x0 - s1 * 4, y0, up + lean - s1 * (0.14 + r() * 0.16), h * (0.55 + r() * 0.3), front, 0, 0.6);
        paintFrond(g, r, x0, y0, up + lean + s1 * 0.05, h * (0.8 + r() * 0.14), front, 0, 0.7);
      });
    }
    inCell(g, W, H, 3, 2, 5, (w, h) => paintCore(g, r, w, h, P), 0);
  });
}

/* ------------------------------------------------------------------ */
/* Bark                                                                 */
/* ------------------------------------------------------------------ */

/** Fibrous, stringy bark in long vertical strips (cypress, juniper). */
export function fibrousBark(key: string, base: string, dark: string, light: string): THREE.Texture {
  return barkTexture(`conifer-bark-${key}`, 256, (g, S) => {
    const r = rng(`bark-${key}`);
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const x = r() * S, y = r() * S, len = 30 + r() * 150;
      g.strokeStyle = r() < 0.55 ? cssMix(dark, base, r() * 0.5) : cssMix(light, base, r() * 0.6);
      g.globalAlpha = 0.25 + r() * 0.45;
      g.lineWidth = 0.8 + r() * 2.6;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + (r() - 0.5) * 8, y + len * 0.3, x + (r() - 0.5) * 8, y + len * 0.7, x + (r() - 0.5) * 6, y + len);
      g.stroke();
      if (y + len > S) {
        g.beginPath();
        g.moveTo(x, y - S);
        g.lineTo(x + (r() - 0.5) * 6, y + len - S);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

/** Gray-brown bark broken into small scaly plates (spruce). */
export function scalyBark(key: string, base: string, dark: string, light: string): THREE.Texture {
  return barkTexture(`conifer-bark-${key}`, 256, (g, S) => {
    const r = rng(`bark-${key}`);
    g.fillStyle = dark;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) {
      const x = r() * S, y = r() * S, w = 9 + r() * 14, h = 12 + r() * 22;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        if (x + ox + w < 0 || x + ox - w > S || y + oy + h < 0 || y + oy - h > S) continue;
        g.fillStyle = cssMix(base, r() < 0.5 ? light : dark, r() * 0.55);
        g.beginPath();
        g.ellipse(x + ox, y + oy, w / 2, h / 2, (r() - 0.5) * 0.5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(20,16,12,0.45)';
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */

/** Scale finished parts so their bounding box is exactly height x spread. */
export function fitToSize(parts: GeoBuilder[], height: number, spread: number) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = 1e-4;
  for (const g of parts) for (let i = 0; i < g.pos.length; i += 3) {
    x0 = Math.min(x0, g.pos[i]); x1 = Math.max(x1, g.pos[i]);
    z0 = Math.min(z0, g.pos[i + 2]); z1 = Math.max(z1, g.pos[i + 2]);
    y1 = Math.max(y1, g.pos[i + 1]);
  }
  const sx = spread / Math.max(1e-4, x1 - x0, z1 - z0), sy = height / y1;
  for (const g of parts) for (const arr of [g.pos, g.anchor]) for (let i = 0; i < arr.length; i += 3) {
    arr[i] *= sx; arr[i + 1] *= sy; arr[i + 2] *= sx;
  }
}

/** Quadratic bezier polyline. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, segs: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    out.push(V(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z));
  }
  return out;
}

const tri = (x: number) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);

export const polyLen = (pts: THREE.Vector3[]) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);

/* ------------------------------------------------------------------ */
/* Dense upright scale-leaf conifer                                     */
/* ------------------------------------------------------------------ */

export interface UprightParams {
  pal: ScalePal;
  style?: Partial<FrondStyle>;
  /** Silhouette: radius (0..1 of half the spread) at height fraction t. */
  profile: (t: number) => number;
  /** Number of main branches off the trunk. */
  branches: number;
  /** How far a branch climbs from where it leaves the trunk to its tip, meters [min, max]. */
  rise: [number, number];
  /** Side twigs per meter of branch, and their length in meters. */
  twigsPerM: number;
  twigLen: number;
  /** Spray cards per meter of branch or twig. */
  cardsPerM: number;
  /** Spray card length [min, max] in meters, and width over length. */
  cardLen: [number, number];
  cardAspect: number;
  /** 0..1 how strongly sprays stand vertical (rest follows the twig and leans outward). */
  upright: number;
  /** 0..1 how much sprays splay outward at random (shaggy outline). */
  shag: number;
  /** Radius of the opaque shaded core, as a fraction of the silhouette. */
  core: number;
  /** Trunk radius at the ground and bare trunk height, meters. */
  trunkR: number;
  clear: number;
  /** Vertex tints: deep interior and sunlit outside. */
  tintInner: string;
  tintOuter: string;
  bark: THREE.Texture;
  look?: SpeciesLook;
}

export function buildUpright(spec: PlantSpec, o: UprightParams): SpeciesGeo {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const prof = (y: number) => Math.max(0.02, o.profile(clamp(y / H))) * R;
  const sway = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / H, 1.7) * 0.85 + (Math.hypot(p.x, p.z) / R) * 0.12 * (p.y / H));
  const white = col('#ffffff'), twigCol = col('#9a8f86');
  const tIn = col(o.tintInner), tOut = col(o.tintOuter);

  // Trunk.
  const trunk: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    trunk.push(V(Math.sin(t * 5 + 1) * R * 0.03 * t, lerp(-0.12, H * 0.985, t), Math.cos(t * 4) * R * 0.03 * t));
  }
  tube(wood, trunk, o.trunkR, o.trunkR * 0.06, 9, white, 0, V(), (i) => sway(trunk[i]), 2);
  // Root flare.
  tube(wood, [V(0, -0.1, 0), V(0, 0.02, 0), V(0, o.trunkR * 1.6, 0)], o.trunkR * 1.7, o.trunkR * 0.98, 9, white, 0, V(), () => 0, 2);

  // Shaded core so the plant is never see-through.
  const coreUV = uvCell(3, 2, 5);
  const cu0 = coreUV[0] + 0.02, cu1 = coreUV[2] - 0.02, cv0 = coreUV[1] + 0.02, cv1 = coreUV[3] - 0.02;
  if (o.core > 0) {
    const rings = 16, sides = 10;
    let prev: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const y = lerp(o.clear + R * 0.3, H * 0.96, i / rings);
      const row: number[] = [];
      for (let s = 0; s <= sides; s++) {
        const az = (s / sides) * Math.PI * 2;
        const rr = prof(y) * o.core * (i === 0 ? 0.05 : i === 1 ? 0.6 : 1) * (0.9 + 0.2 * Math.sin(az * 3 + i * 1.7));
        const p = V(Math.cos(az) * rr, y, Math.sin(az) * rr);
        const shade = lerp(0.4, 0.7, clamp(y / H + 0.2));
        // Normals point down so the core only ever catches dim bounce light.
        row.push(leaves.vert(p, V(Math.cos(az) * 0.3, -0.95, Math.sin(az) * 0.3).normalize(), lerp(cu0, cu1, tri(s * 3 / sides)), lerp(cv0, cv1, tri(i * 0.7)), tIn.clone().multiplyScalar(shade), 0, V(0, y, 0), sway(p)));
      }
      if (i > 0) for (let s = 0; s < sides; s++) leaves.quad(prev[s], prev[s + 1], row[s + 1], row[s]);
      prev = row;
    }
  }

  const spray = (base: THREE.Vector3, axis: THREE.Vector3, birth: number, big: number) => {
    const rad = Math.hypot(base.x, base.z);
    const out = rad > 1e-4 ? V(base.x / rad, 0, base.z / rad) : V(1, 0, 0);
    const len = lerp(o.cardLen[0], o.cardLen[1], r()) * big;
    const dir = V(0, o.upright, 0).addScaledVector(axis, 1 - o.upright).addScaledVector(out, 0.12 + o.shag * r() * 0.9)
      .add(V((r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.3)).normalize();
    // Face outward, rolled at random around the spray's own axis so edges never line up.
    const face = out.clone().applyAxisAngle(dir, (r() - 0.5) * 2.2).add(V(0, 0.15, 0)).normalize();
    const tipP = base.clone().addScaledVector(dir, len);
    const depth = clamp(Math.hypot(tipP.x, tipP.z) / prof(tipP.y));
    const hT = clamp(base.y / H);
    const shade = lerp(0.5, 1, Math.pow(depth, 1.6)) * lerp(0.86, 1.04, hT);
    const c = jitter(tIn.clone().lerp(tOut, Math.pow(depth, 1.3)), r, 0.012, 0.05, 0.05).multiplyScalar(shade);
    const s0 = sway(base);
    leafQuad(leaves, base, dir, face, len, len * o.cardAspect * (0.85 + r() * 0.3), uvCell(3, 2, Math.floor(r() * 5)), c, birth, base, {
      segs: 2, curl: (r() - 0.6) * 0.35, center: V(0, base.y - R * 0.6, 0), radii: V(1, 1, 1), normalBend: 0.6, sway0: s0, sway1: clamp(s0 + 0.05),
    });
  };

  const dress = (pts: THREE.Vector3[], from: number, birth: number, late: number) => {
    const L = polyLen(pts);
    const n = Math.max(1, Math.round(L * (1 - from) * o.cardsPerM));
    for (let k = 0; k < n; k++) {
      const a = along(pts, lerp(from, 1, (k + r()) / n));
      spray(a.p, a.dir, r() < 0.86 ? birth : clamp(birth + 0.1 + r() * late, 0, 0.9), 1);
    }
    const e = along(pts, 1);
    spray(e.p, e.dir, birth, 1.12);
  };

  const nSkirt = Math.round(o.branches * Math.min(0.25, ((o.rise[0] + o.rise[1]) / 2 / H) * 1.25));
  const skirt0 = (i: number) => i < nSkirt;
  let az = r() * 6.28;
  for (let i = 0; i < o.branches; i++) {
    // More branches where the plant is wide.
    const u = clamp((i - nSkirt + r()) / (o.branches - nSkirt));
    const y0 = skirt0(i) ? o.clear * (0.5 + r()) : lerp(o.clear, H * 0.95, Math.pow(u, 1.08));
    az += 2.39996 + (r() - 0.5) * 0.5;
    // The lowest branches reach out low to skirt the base; the rest climb.
    const skirt = skirt0(i);
    const rise = lerp(o.rise[0], o.rise[1], r()) * lerp(1, 0.55, smoothstep(0.8, 1, y0 / H)) * (skirt ? 0.08 + r() * 0.92 : 1);
    const yt = Math.min(H * 0.975, y0 + rise);
    const rt = prof(yt) * (skirt ? 0.45 + 0.35 * r() : 0.36 + 0.36 * r());
    const ca = Math.cos(az), sa = Math.sin(az);
    const tb = along(trunk, clamp((y0 + 0.12) / (H * 0.985 + 0.12))).p;
    const pts = arc(tb, V(ca * rt * 0.95, y0 + (yt - y0) * 0.3, sa * rt * 0.95), V(ca * rt, yt, sa * rt), 3);
    const birth = r() < 0.72 ? 0 : clamp(0.1 + r() * 0.5 + (y0 / H) * 0.25, 0, 0.85);
    const br = lerp(0.12, 0.05, y0 / H) * o.trunkR * (0.7 + r() * 0.5);
    tube(wood, pts, br, br * 0.3, y0 < H * 0.2 ? 5 : 3, twigCol, birth, pts[0], (k) => sway(pts[k]), 1.5);
    dress(pts, 0.3, birth, 0.4);
    // Side twigs.
    const L = polyLen(pts);
    const nt = Math.round(L * o.twigsPerM);
    for (let k = 0; k < nt; k++) {
      const a = along(pts, lerp(0.3, 0.97, (k + r()) / nt));
      const ta = az + (r() - 0.5) * 3.4;
      const rr = Math.hypot(a.p.x, a.p.z);
      const room = Math.max(0.03, prof(a.p.y) * 0.9 - rr);
      const d = V(Math.cos(ta), 0, Math.sin(ta)).multiplyScalar(0.55).addScaledVector(a.dir, 0.5).add(V(0, 0.45, 0)).normalize();
      const tl = Math.min(o.twigLen * (0.6 + r() * 0.8), room * 2.2 + 0.08);
      const end = a.p.clone().addScaledVector(d, tl);
      const er = Math.hypot(end.x, end.z), lim = prof(end.y) * 0.9;
      if (er > lim) { end.x *= lim / er; end.z *= lim / er; }
      const tp = [a.p, a.p.clone().lerp(end, 0.5).add(V(0, -tl * 0.06, 0)), end];
      const tbirth = r() < 0.8 ? birth : clamp(birth + 0.15 + r() * 0.4, 0, 0.88);
      dress(tp, 0.15, tbirth, 0.3);
    }
  }
  // The leader.
  for (let k = 0; k < 10; k++) spray(V((r() - 0.5) * 0.04, H * lerp(0.9, 0.975, k / 9), (r() - 0.5) * 0.04), UP, k < 6 ? 0 : 0.3, 0.9);

  fitToSize([leaves, wood], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: plumeAtlas(o.pal, o.style),
    bark: { map: o.bark },
    look: { translucency: 0.12, leafRoughness: 0.8, bend: 0.22, flutter: 0.006, ...o.look },
  };
}
