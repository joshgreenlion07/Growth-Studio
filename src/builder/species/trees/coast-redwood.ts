import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, jitter, leafQuad, leafTexture, lerp, perp, rng, smoothstep, uvCell, type SpeciesBuilder } from '../kit';
import { cssMix, inCell } from './shared-conifers';
import { WOOD_BEND, emitWood, normalFromHeight, rootFlare, tiled, type Limb } from './shared-trees-a';

/**
 * Coast redwood, Sequoia sempervirens, as it stands in a suburban yard after a few decades: one straight, buttressed
 * trunk in thick, fibrous, red-brown bark furrowed into long braided ridges, clear of live limbs for the first 10 to 12 ft
 * (a few dead stubs), then a narrow cone of many slender branches. The lower branches reach out level, sag and turn up
 * at the tips, with curtains of pendulous sprays; the middle ones spread level; the upper ones sweep up toward a pointed
 * leader. Foliage is in flat sprays of two-ranked needles, dark green with yellow-green new tips.
 *
 * References (numbers they give):
 *  - NC State Extension Plant Toolbox, Sequoia sempervirens (plants.ces.ncsu.edu/plants/sequoia-sempervirens):
 *    60 to 200 ft tall, 15 to 25 ft wide, rapid (about 3 ft a year); young trees pyramidal, losing lower branches with
 *    age; needles flat and pointed, 0.5 to 1 in, spirally set but two-ranked, bright green above with two white bands
 *    beneath; stems slender and usually drooping; bark thick, reddish-brown, deeply furrowed with fibrous scaly ridges,
 *    cinnamon inner bark; the trunk flares at the base; cones about 1 in.
 *  - NC State, 'Soquel': 50 to 90 ft x 15 to 30 ft; horizontal branches that curve upward at the tips.
 *  - Everde Growers, 'Santa Cruz': 70 to 100 ft x 15 to 30 ft.
 *  - California Native Plant Society San Diego, Sequoia sempervirens sheet: 40 to 80 ft high, 30+ ft spread in gardens.
 * Catalog size: 70 ft x 30 ft (21.3 x 9.1 m), the middle of the 60 to 100 ft that a suburban redwood reaches and the 28 to
 * 30 ft canopy circles that Green Lion's blueprint draws for existing redwoods. Place an existing tree with
 * `existing: true` (shown at this mature size) and `scale` 0.6 to 1.4 to match a measured tree (13 to 30 m tall).
 *
 * Looks were checked against a phone video of finished yard work with three existing redwoods behind a 6 ft fence:
 * clear red-brown trunks, dense dark crowns broken into clumps, sky showing between them, and low branches near the
 * camera hanging in flat, drooping sprays with lighter tips.
 */

/* ------------------------------------------------------------------ */
/* Foliage: flat sprays of two-ranked needles                           */
/* ------------------------------------------------------------------ */

const NEEDLE = { dark: '#323a25', mid: '#4a5535', light: '#666f3e', tip: '#939b50', stem: '#585a34', wood: '#5e4029' };

/** One flat, linear needle with a short point, from (x, y) along `ang`, `len` px long and `w` px wide. */
function needle(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, fill: string, keel: string | null) {
  const cx = Math.cos(ang), sy = Math.sin(ang), nx = -sy * w * 0.5, ny = cx * w * 0.5;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x + nx * 0.8, y + ny * 0.8);
  g.lineTo(x + cx * len * 0.82 + nx, y + sy * len * 0.82 + ny);
  g.lineTo(x + cx * len, y + sy * len);
  g.lineTo(x + cx * len * 0.82 - nx, y + sy * len * 0.82 - ny);
  g.lineTo(x - nx * 0.8, y - ny * 0.8);
  g.closePath();
  g.fill();
  if (keel) {
    g.strokeStyle = keel;
    g.lineWidth = Math.max(0.5, w * 0.25);
    g.beginPath();
    g.moveTo(x + cx * len * 0.15, y + sy * len * 0.15);
    g.lineTo(x + cx * len * 0.8, y + sy * len * 0.8);
    g.stroke();
  }
}

/**
 * One shoot: a thin green axis from (x, y) along `ang` (canvas radians), `len` px, with two flat ranks of needles
 * standing off it at 70 to 85 degrees, a little forward, spaced so a sliver of light shows between them. Needles are
 * longest in the middle of the shoot and short at its base and tip, so the shoot is a narrow feather. `nl` is the
 * longest needle in px; `age` 0 old .. 1 this year's growth (lighter, yellower).
 */
function shoot(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, nl: number, age0: number, age1: number, tone: number) {
  const bend = (r() - 0.5) * 0.22;
  const at = (t: number): [number, number, number] => {
    const a = ang + bend * t;
    const off = bend * len * 0.5 * t * t;
    return [x + Math.cos(ang) * len * t + Math.cos(ang + Math.PI / 2) * off, y + Math.sin(ang) * len * t + Math.sin(ang + Math.PI / 2) * off, a];
  };
  g.lineCap = 'round';
  g.strokeStyle = cssMix(NEEDLE.stem, NEEDLE.mid, 0.4, tone);
  g.lineWidth = Math.max(1, nl * 0.09);
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 1; i <= 6; i++) {
    const [px, py] = at(i / 6);
    g.lineTo(px, py);
  }
  g.stroke();
  const w = Math.max(1.8, nl * 0.15);
  // One needle per rank every w * 1.75 px: the needles are about 1.5 to 3 mm wide with a small gap between them.
  const n = Math.max(3, Math.round(len / (w * 1.75)));
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i + (s > 0 ? 0.25 : 0.75)) / n;
      const [px, py, a] = at(t);
      const shape = Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)), 0.7);
      const l = nl * shape * (0.85 + r() * 0.25);
      if (l < 2.5) continue;
      const age = clamp(lerp(age0, age1, t) + (r() - 0.5) * 0.2);
      const c = age < 0.6 ? cssMix(NEEDLE.dark, NEEDLE.mid, age / 0.6, tone * (0.85 + r() * 0.3)) : cssMix(NEEDLE.light, NEEDLE.tip, (age - 0.6) / 0.4, tone * (0.9 + r() * 0.2));
      needle(g, px, py, a + s * (1.3 + r() * 0.22) - s * 0.15 * t, l, w * (0.9 + r() * 0.2), c, nl > 9 ? `rgba(214,228,180,${0.16 * tone})` : null);
    }
  }
}

/**
 * A branchlet spray from (x, y) along `ang`, `len` px: a thin twig with narrow side shoots, alternate, every 2.5 to
 * 3.5 cm, angled forward and shortening toward the tip, and the twig's own needled tip. Flat and narrow, like a
 * feather, with daylight between the side shoots.
 */
function spray(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, nl: number, tone: number, sun = 0, reach = 0.34) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const sweep = (r() - 0.5) * 0.12;
  const pt = (t: number): [number, number] => [lerp(x, ex, t) + Math.cos(ang + Math.PI / 2) * sweep * len * t * t, lerp(y, ey, t) + Math.sin(ang + Math.PI / 2) * sweep * len * t * t];
  // The woody twig, thin.
  g.strokeStyle = cssMix(NEEDLE.wood, NEEDLE.stem, 0.5, tone);
  g.lineWidth = Math.max(1.4, nl * 0.13);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 1; i <= 8; i++) g.lineTo(...pt((i / 8) * 0.75));
  g.stroke();
  const gap = nl * (2.1 - sun * 0.5);
  const n = Math.max(3, Math.round((len * 0.72) / gap));
  let side = r() < 0.5 ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const t = lerp(0.05, 0.74, (k + 0.3 + r() * 0.4) / n);
    side = -side;
    if (r() < 0.06) continue;
    const [px, py] = pt(t);
    const sl = len * reach * lerp(1, 0.45, t) * (0.75 + r() * 0.4);
    const sa = ang + side * (lerp(0.85, 0.55, t) - sun * 0.2 + (r() - 0.5) * 0.18);
    shoot(g, r, px, py, sa, sl, nl * (0.85 + r() * 0.25), 0.05, 0.7 + sun * 0.3, tone * (0.88 + r() * 0.24));
  }
  // The twig's own leading shoot.
  const [tx, ty] = pt(0.72);
  shoot(g, r, tx, ty, ang + sweep, len * 0.3, nl, 0.4, 1, tone);
}

/**
 * 1024 atlas, 4 x 2 cells of 256 x 512 px (a card is about 0.6 m of branchlet, half as wide, so a needle of 0.4 to
 * 1 in is about 9 to 21 px), each spray's base at the bottom middle of its cell, growing up the cell:
 *  0, 1, 2  shade sprays: narrow feathers of side shoots with long, well-spaced needles;
 *  3        a sun spray from the top of the crown: shorter needles, shoots more upright and yellow-green;
 *  4, 6     pendulous sprays: one long hanging shoot system, narrower, for sprays under the lower limbs;
 *  5        two sprays from one point in a narrow V, for the denser ends of the limbs;
 *  7        an opaque patch of dark mottled foliage for the shaded core of the crown.
 */
function redwoodSprays(): THREE.Texture {
  return leafTexture('coast-redwood-sprays-v2', 1024, 1024, (g, W, H) => {
    const r = rng('coast-redwood-tex-v2');
    const up = -Math.PI / 2;
    const C = (i: number, draw: (w: number, h: number) => void, pad = 2) => inCell(g, W, H, 4, 2, i, draw, pad);
    for (let cell = 0; cell < 3; cell++) C(cell, (w, h) => spray(g, r, w * 0.5, h - 4, up + (r() - 0.5) * 0.08, h * 0.95, 15, 1, 0, 0.36));
    C(3, (w, h) => spray(g, r, w * 0.5, h - 4, up + (r() - 0.5) * 0.06, h * 0.95, 11, 1, 1, 0.32));
    for (const cell of [4, 6]) C(cell, (w, h) => spray(g, r, w * 0.5, h - 4, up + (r() - 0.5) * 0.04, h * 0.96, 14, cell === 4 ? 1 : 0.9, 0, 0.22));
    C(5, (w, h) => {
      spray(g, r, w * 0.5, h - 4, up - 0.2, h * 0.82, 13, 0.85, 0, 0.26);
      spray(g, r, w * 0.5, h - 4, up + 0.2, h * 0.92, 14, 1, 0, 0.26);
    });
    C(7, (w, h) => {
      g.fillStyle = cssMix(NEEDLE.dark, NEEDLE.wood, 0.2, 0.55);
      g.fillRect(-2, -2, w + 4, h + 4);
      for (let i = 0; i < 50; i++) shoot(g, r, r() * w, r() * h, up + (r() - 0.5) * 2.4, 30 + r() * 60, 9, 0, 0.6, 0.45 + r() * 0.35);
    }, 0);
  });
}

/* ------------------------------------------------------------------ */
/* Bark                                                                 */
/* ------------------------------------------------------------------ */

interface Ridge { x: number; w: number; a: number; k: number; ph: number; tone: number }

function ridges(S: number): Ridge[] {
  const r = rng('coast-redwood-ridges');
  const out: Ridge[] = [];
  // Broad braided ridges, 3 to 8 cm wide on a tile 0.8 m around.
  const n = 15;
  for (let i = 0; i < n; i++) out.push({ x: ((i + (r() - 0.5) * 0.6) / n) * S, w: (S / n) * (0.55 + r() * 0.5), a: S * (0.008 + r() * 0.02), k: 1 + Math.floor(r() * 3), ph: r() * 6.28, tone: r() });
  return out;
}

/** Wavy vertical path of a ridge; it wraps top to bottom (whole periods). */
function ridgePath(g: CanvasRenderingContext2D, R: Ridge, S: number, dx = 0) {
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const y = (i / 40) * S;
    const x = R.x + dx + R.a * Math.sin((y / S) * Math.PI * 2 * R.k + R.ph) + R.a * 0.5 * Math.sin((y / S) * Math.PI * 2 * (R.k + 2) + R.ph * 1.7);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

/** Thick fibrous cinnamon-red bark in long braided ridges over dark furrows, the ridge tops weathered gray-brown. */
function redwoodBark(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const S = 512;
  const rs = ridges(S);
  const map = barkTexture('coast-redwood-bark', S, (g) => {
    const r = rng('coast-redwood-bark');
    g.fillStyle = '#2e1911';
    g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    for (const R of rs) {
      tiled(g, S, () => {
        // Red-brown body of the ridge, a lighter cinnamon center and a weathered gray top.
        const base = R.tone < 0.35 ? '#6c3920' : R.tone < 0.7 ? '#7a4426' : '#5f341d';
        for (const [wk, c] of [[1, base], [0.7, cssMix(base, '#9a5a30', 0.45)], [0.3, cssMix('#7d6450', base, 0.45)]] as [number, string][]) {
          ridgePath(g, R, S);
          g.strokeStyle = c;
          g.lineWidth = R.w * wk;
          g.stroke();
        }
      });
    }
    // Stringy fibers along the ridges and in the furrows.
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S, len = 20 + r() * 110, dx = (r() - 0.5) * 10;
      const light = r() < 0.45;
      const c = light ? (r() < 0.5 ? '#9a5c3a' : '#857062') : r() < 0.5 ? '#22120b' : '#4e2818';
      const a = light ? 0.18 + r() * 0.25 : 0.2 + r() * 0.3, w = 0.6 + r() * 1.8;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = c;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + dx * 0.5 + (r() - 0.5) * 4, y + len * 0.5, x + dx, y + len);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
  const normalMap = normalFromHeight('coast-redwood-bark-n', S, 3.2, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    for (const R of rs) {
      for (const [wk, v] of [[1, 70], [0.8, 130], [0.58, 190], [0.36, 240]] as [number, number][]) {
        tiled(g, S, () => {
          ridgePath(g, R, S);
          g.strokeStyle = `rgb(${v},${v},${v})`;
          g.lineWidth = R.w * wk;
          g.stroke();
        });
      }
    }
    const r = rng('coast-redwood-bark-nf');
    for (let i = 0; i < 1500; i++) {
      const x = r() * S, y = r() * S, len = 15 + r() * 80, v = r() < 0.5 ? 0 : 255;
      tiled(g, S, () => {
        g.globalAlpha = 0.18;
        g.strokeStyle = `rgb(${v},${v},${v})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 6, y + len);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
  return { map, normalMap };
}

/* ------------------------------------------------------------------ */
/* Tree                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Scale to the catalog size: the top exactly at `H`, and the crown's outer edge (the 97th percentile of the sprays'
 * distance from the trunk, not the one farthest spray tip) at the canopy radius `R`, so the crown reads as wide as the
 * canopy circle drawn on a plan. A few spray tips stick out past it, as on a real tree.
 */
function fitCrown(leaves: GeoBuilder, wood: GeoBuilder, H: number, R: number) {
  let y1 = 1e-3;
  const rad: number[] = [];
  for (const g of [leaves, wood]) for (let i = 0; i < g.pos.length; i += 3) y1 = Math.max(y1, g.pos[i + 1]);
  for (let i = 0; i < leaves.pos.length; i += 3) rad.push(Math.hypot(leaves.pos[i], leaves.pos[i + 2]));
  rad.sort((a, b) => a - b);
  const sx = (R * 0.97) / Math.max(1e-3, rad[Math.floor(rad.length * 0.97)]), sy = H / y1;
  for (const g of [leaves, wood]) for (const arr of [g.pos, g.anchor]) for (let i = 0; i < arr.length; i += 3) {
    arr[i] *= sx;
    arr[i + 1] *= sy;
    arr[i + 2] *= sx;
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  // Live crown from about 16% of the height (3.4 m, 11 ft on a 70 ft tree: limbed up over a walk or a street).
  const clear = H * 0.16;
  /** Silhouette radius at height y: widest a little above the lowest limbs, then a full, rounded taper to the leader. */
  const prof = (y: number) => {
    const t = clamp(y / H);
    const c = clear / H;
    if (t < c) return R * 0.75;
    if (t < 0.3) return R * lerp(0.86, 1, smoothstep(c, 0.3, t));
    return R * Math.max(0.035, Math.pow((1 - t) / 0.7, 0.68));
  };
  const sway = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / H, 1.5) * 0.65 + (Math.hypot(p.x, p.z) / R) * 0.3);
  const limbs: Limb[] = [];
  const cell = (i: number) => uvCell(4, 2, i);

  // Trunk: straight, a slight wander, tapering hard inside the crown, buttressed at the ground.
  const r0 = 0.37 * (H / 21.3);
  {
    const pts: THREE.Vector3[] = [];
    const wx = (r() - 0.5) * 0.25, wz = (r() - 0.5) * 0.25;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(V(Math.sin(t * 4.2 + 1) * wx * t + wx * 0.3 * t, lerp(-0.2, H * 0.985, t), Math.cos(t * 3.4) * wz * t));
    }
    const rad = pts.map((p) => r0 * Math.max(0.018, Math.pow(1 - clamp(p.y / H), 1.05)) * lerp(1, 0.9, smoothstep(0.1, 0.4, p.y / H)));
    const trunk: Limb = { pts, rad, level: 0, birth: 0, parent: -1, length: H, rParent: 0 };
    rootFlare(trunk, 0.85, 1.0);
    limbs.push(trunk);
  }
  const trunkAt = (y: number) => {
    const T = limbs[0];
    const x = clamp((y + 0.2) / (H * 0.985 + 0.2)) * 24;
    const i = Math.min(23, Math.floor(x));
    return { p: T.pts[i].clone().lerp(T.pts[i + 1], x - i), r: lerp(T.rad[i], T.rad[i + 1], x - i) };
  };

  // Dead stubs on the clear trunk, where shaded-out lower limbs broke off.
  for (let k = 0; k < 6; k++) {
    const y = lerp(2, clear * 0.95, r()), az = r() * 6.28;
    const at = trunkAt(y);
    const d = V(Math.cos(az), -0.2 - r() * 0.3, Math.sin(az)).normalize();
    const L = 0.05 + r() * 0.14, sr = 0.016 + r() * 0.016;
    const pts = [at.p.clone(), at.p.clone().addScaledVector(d, at.r * 0.8 + L * 0.5), at.p.clone().addScaledVector(d, at.r * 0.8 + L)];
    limbs.push({ pts, rad: [sr * 1.4, sr, sr * 0.7], level: 4, birth: 0.55, parent: 0, length: L, rParent: at.r });
  }

  const tIn = col('#8a8a72'), tOut = col('#fffaec');
  const depthAt = (p: THREE.Vector3) => clamp(Math.hypot(p.x, p.z) / (prof(p.y) + 0.3));
  const tint = (p: THREE.Vector3, y0: number) => {
    const d = depthAt(p);
    const hT = clamp(y0 / H);
    const shade = lerp(0.5, 1, Math.pow(d, 1.3)) * lerp(0.84, 1.05, smoothstep(0.1, 0.8, hT));
    return jitter(tIn.clone().lerp(tOut, Math.pow(d, 1.2)), r, 0.014, 0.06, 0.06).multiplyScalar(shade);
  };
  /** Outward from the trunk, level. */
  const outAt = (p: THREE.Vector3) => {
    const o = V(p.x, 0, p.z);
    return o.lengthSq() > 1e-6 ? o.normalize() : V(1, 0, 0);
  };

  /** A spray card: base `p`, heading `dir`, upper side roughly `face`. */
  const card = (p: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, len: number, uv: [number, number, number, number], birth: number, y0: number, wid = 0.5, segs = 2, lit = false) => {
    const s = sway(p) * WOOD_BEND;
    const c = lit ? jitter(tOut.clone().multiplyScalar(0.92), r, 0.01, 0.04, 0.04) : tint(p.clone().addScaledVector(dir, len * 0.6), y0);
    leafQuad(leaves, p, dir, face, len, len * wid * (0.85 + r() * 0.3), uv, c, birth, p, {
      segs, curl: 0.2 + r() * 0.4, center: V(0, p.y - 3, 0), radii: V(1, 1, 1), normalBend: 0.5, sway0: s, sway1: clamp(s + 0.08),
    });
  };
  /** Upper side of a spray: up, leaning out of the crown so the sprays show from the ground and from the side. */
  const faceAt = (p: THREE.Vector3, lean: number) => V(0, 1, 0).addScaledVector(outAt(p), lean).add(V((r() - 0.5) * 0.7, (r() - 0.5) * 0.3, (r() - 0.5) * 0.7)).normalize();
  const sprayCell = (hT: number) => cell(r() < smoothstep(0.5, 0.95, hT) * 0.85 ? 3 : Math.floor(r() * 3));

  // The shaded core: an opaque spindle of dark foliage inside the middle of the crown, so it reads dense there and
  // never shows sky through its heart (the upper crown is left open). Normals point down and out, so it only catches dim light.
  {
    const cu = cell(7);
    const rings = 18, sides = 12;
    let prev: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const y = lerp(H * 0.3, H * 0.56, i / rings);
      const row: number[] = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const rr = prof(y) * 0.2 * Math.max(0.05, Math.pow(Math.sin((Math.PI * i) / rings), 0.6)) * (0.88 + 0.24 * Math.sin(a * 3 + i * 1.3));
        const p = V(Math.cos(a) * rr, y, Math.sin(a) * rr);
        const sh = lerp(0.22, 0.34, y / H);
        row.push(leaves.vert(p, V(Math.cos(a) * 0.25, -0.97, Math.sin(a) * 0.25).normalize(), lerp(cu[0] + 0.02, cu[2] - 0.02, (k % 3) / 2), lerp(cu[1] + 0.02, cu[3] - 0.02, (i % 4) / 3), tIn.clone().multiplyScalar(sh), 0, V(0, y, 0), sway(p) * WOOD_BEND));
      }
      // Wound so the outside is the front face: seen from outside, the shader keeps the down-and-out normal.
      if (i > 0) for (let k = 0; k < sides; k++) leaves.quad(prev[k], row[k], row[k + 1], prev[k + 1]);
      prev = row;
    }
  }

  // Main branches up the trunk in a loose spiral.
  const nB = 158;
  let az = r() * 6.28;
  const ph = r() * 6.28;
  for (let i = 0; i < nB; i++) {
    const u = (i + r() * 0.8) / nB;
    // Loose tiers: most limbs gather near tier heights about 1.2 m apart, so the crown shows layers with dark gaps.
    let y0 = lerp(clear, H * 0.955, Math.pow(u, 1.15));
    if (r() < 0.62) y0 = clamp(clear + Math.round((y0 - clear) / 1.2) * 1.2 + (r() - 0.5) * 0.45, clear, H * 0.955);
    const hT = y0 / H;
    az += 2.39996 + (r() - 0.5) * 0.7;
    const low = 1 - smoothstep(0.16, 0.38, hT);
    const high = smoothstep(0.5, 0.92, hT);
    // Reach: to the silhouette, uneven from limb to limb so the outline is clumpy.
    const base = trunkAt(y0);
    // Limbs come in loose clumps: neighbors around the trunk and up it reach about as far, with gaps between.
    const clump = 1 + 0.22 * Math.sin(3 * az + y0 * 0.9 + ph) + 0.12 * Math.sin(5 * az - y0 * 1.7 + ph * 2.1);
    const reach = (prof(y0) - base.r) * clump * (r() < 0.12 ? 0.45 + r() * 0.25 : 0.8 + r() * 0.24);
    const th0 = lerp(lerp(-0.1, 0.05, 1 - low), lerp(0.5, 0.9, r()), high) + (r() - 0.5) * 0.18;
    const L = Math.max(0.35, reach / Math.max(0.55, Math.cos(th0)));
    const sag = lerp(0.08, 0.2, low) * (1 - high) * (0.7 + r() * 0.6);
    const tipUp = lerp(0.07, 0.16, low) * (1 - high * 0.7);
    const ca = Math.cos(az), sa = Math.sin(az);
    const pts: THREE.Vector3[] = [];
    const wig = (r() - 0.5) * 0.16 * L;
    for (let k = 0; k <= 6; k++) {
      const s = k / 6;
      const h = L * s * Math.cos(th0), side = Math.sin(Math.PI * s) * wig;
      const y = y0 + L * (Math.sin(th0) * s - sag * Math.sin(Math.PI * s * 0.85) + tipUp * s * s * s);
      pts.push(V(base.p.x + ca * h - sa * side, y, base.p.z + sa * h + ca * side));
    }
    const br = Math.min(base.r * 0.5, 0.016 + 0.014 * L);
    const birth = r() < 0.82 ? 0 : clamp(0.12 + r() * 0.45, 0, 0.8);
    const bi = limbs.length;
    limbs.push({ pts, rad: pts.map((_, k) => lerp(br, br * 0.2, k / 6)), level: 1, birth, parent: 0, length: L, rParent: base.r });
    const at = (s: number) => {
      const x = clamp(s) * 6, k = Math.min(5, Math.floor(x));
      return { p: pts[k].clone().lerp(pts[k + 1], x - k), dir: pts[k + 1].clone().sub(pts[k]).normalize() };
    };

    // Side branchlets, alternate, spreading level then hanging: they carry most of the sprays.
    const n2 = Math.max(2, Math.round(L / 0.3));
    for (let k = 0; k < n2; k++) {
      const s = lerp(0.2, 0.95, (k + 0.25 + r() * 0.5) / n2);
      const a = at(s);
      const sgn = k % 2 ? 1 : -1;
      const lat = V().crossVectors(a.dir, V(0, 1, 0));
      if (lat.lengthSq() < 1e-4) lat.copy(perp(a.dir));
      lat.normalize().multiplyScalar(sgn);
      const ang = 0.7 + r() * 0.45;
      const d2 = a.dir.clone().setY(a.dir.y * 0.5).normalize().multiplyScalar(Math.cos(ang)).addScaledVector(lat, Math.sin(ang));
      d2.y += lerp(-0.12, 0.25, high) + (r() - 0.5) * 0.2;
      d2.normalize();
      const l2 = clamp(L * 0.45 * (1.12 - s) * (0.7 + r() * 0.6), 0.32, 1.6);
      const droop = l2 * lerp(0.36, 0.08, high) * (0.6 + r() * 0.8);
      const mid = a.p.clone().addScaledVector(d2, l2 * 0.5);
      const end = a.p.clone().addScaledVector(d2, l2).add(V(0, -droop, 0));
      mid.y -= droop * 0.3;
      const lp = [a.p, mid, end];
      const b2 = birth > 0 || r() < 0.82 ? birth : clamp(0.1 + r() * 0.55, 0, 0.85);
      if (l2 > 0.8) limbs.push({ pts: lp, rad: [br * 0.3, br * 0.18, br * 0.08], level: 2, birth: b2, parent: bi, length: l2, rParent: br });
      // Sprays along the branchlet, alternate, drooping to the sides.
      const m = Math.max(1, Math.round(l2 / 0.085));
      // The lower crown is open near the trunk, its sprays toward the ends of the limbs; the upper crown is open between
      // the limbs' end clumps, so sky shows through it.
      const bare = Math.max(low * (1 - s) * 0.9, smoothstep(0.5, 0.92, hT) * lerp(0.42, 0.12, s));
      for (let j = 0; j < m; j++) {
        const t = lerp(0.1, 0.92, (j + r() * 0.7) / m);
        if (r() < bare) continue;
        const q = t < 0.5 ? a.p.clone().lerp(mid, t * 2) : mid.clone().lerp(end, t * 2 - 1);
        const qd = (t < 0.5 ? mid.clone().sub(a.p) : end.clone().sub(mid)).normalize();
        const js = j % 2 ? 1 : -1;
        const lat2 = V().crossVectors(qd, V(0, 1, 0)).normalize().multiplyScalar(js);
        const d3 = qd.clone().multiplyScalar(0.55).addScaledVector(lat2, 0.7).add(V(0, lerp(-0.55, 0.1, high) + (r() - 0.5) * 0.45, 0)).normalize();
        const bb = r() < 0.86 ? b2 : clamp(b2 + 0.1 + r() * 0.4, 0, 0.9);
        card(q, d3, faceAt(q, lerp(0.7, 0.35, high)), lerp(0.6, 0.85, r()) * lerp(1, 0.8, high), sprayCell(hT), bb, y0, 0.5, 1);
      }
      // A clump at the branchlet's end, carrying on its line.
      const ed = end.clone().sub(mid).normalize();
      card(end.clone().addScaledVector(ed, -0.15), ed.clone().add(V(0, 0.1, 0)).normalize(), faceAt(end, 0.6), 0.66 + r() * 0.16, r() < 0.5 ? cell(5) : sprayCell(hT), b2, y0);
      // Pendulous sprays hanging under the lower and middle limbs.
      if (high < 0.7 && r() < lerp(0.3, 0.7, low)) {
        const hp = mid.clone().lerp(end, 0.2 + r() * 0.7);
        const hd = V(d2.x * 0.3, -1, d2.z * 0.3).normalize();
        card(hp, hd, outAt(hp).add(V((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)).normalize(), 0.65 + r() * 0.3, cell(r() < 0.5 ? 4 : 6), b2, y0);
      }
    }
    // Sprays on the outer part of the limb itself, and a dense clump at its upturned tip.
    const nm = Math.max(1, Math.round((L * 0.6) / 0.3));
    for (let k = 0; k < nm; k++) {
      const s = lerp(0.42, 0.96, (k + r()) / nm);
      const a = at(s);
      const sgn = k % 2 ? 1 : -1;
      const lat = V().crossVectors(a.dir, V(0, 1, 0)).normalize().multiplyScalar(sgn);
      const d = a.dir.clone().multiplyScalar(0.7).addScaledVector(lat, 0.6).add(V(0, (r() - 0.6) * 0.5, 0)).normalize();
      card(a.p, d, faceAt(a.p, 0.5), 0.6 + r() * 0.15, sprayCell(hT), birth, y0, 0.5, 1);
    }
    const e = at(1), eb = at(0.86);
    for (let k = 0; k < 3; k++) {
      const d = e.dir.clone().add(V(0, 0.3 + r() * 0.35, 0)).addScaledVector(V().crossVectors(e.dir, V(0, 1, 0)).normalize(), (k - 1) * 0.45).normalize();
      card(eb.p, d, faceAt(eb.p, 0.7), 0.62 + r() * 0.15, k === 1 ? cell(5) : sprayCell(hT), birth, y0);
    }
  }

  // The leader: short upswept shoots around the top meter and a spire of sun sprays.
  for (let k = 0; k < 16; k++) {
    const y = H * lerp(0.92, 0.985, k / 15);
    const at = trunkAt(y);
    const a = r() * 6.28;
    const d = V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
    card(at.p, d, V(Math.cos(a), 0.3, Math.sin(a)).normalize(), 0.48 + r() * 0.12, cell(3), k < 12 ? 0 : 0.2, y, 0.5, 2, true);
  }

  emitWood(wood, limbs, {
    tile: 0.8,
    sway,
    color: (l) => (l.level === 0 ? col('#e2d3c2') : l.level === 1 ? col('#3f3129') : l.level === 4 ? col('#6e6258') : col('#6f6150')),
    sides: (l) => (l.level === 0 ? 18 : l.level === 1 ? (l.rad[0] > 0.045 ? 5 : 4) : 3),
    collar: 0.3,
  });

  fitCrown(leaves, wood, H, R);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: redwoodSprays(),
    bark: redwoodBark(),
    look: { alphaTest: 0.42, translucency: 0.14, leafRoughness: 0.9, bend: 0.4, flutter: 0.008 },
  };
};
