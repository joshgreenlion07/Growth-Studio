import * as THREE from 'three';
import {
  GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, smoothstep, tube, uvCell,
  type SpeciesBuilder,
} from '../kit';
import { arc, fibrousBark, frondStyle, inCell, paintCore, paintFrond, polyLen, type ScalePal } from './shared-conifers';

/**
 * Skyrocket juniper, Juniperus scopulorum 'Skyrocket': one of the narrowest
 * upright junipers, a slim flame clothed to the ground and tapering to a thin
 * leader. Branches climb steeply close to the trunk; the foliage is soft and
 * feathery rather than sheared: slender scale-leaf sprays sweeping up and
 * out, silvery gray-green to blue-green (grayer and greener than the steel
 * blue of 'Blue Arrow'), loose at the edge with single sprays standing out of
 * the outline. Shaggy red-brown to gray bark in long strips.
 *
 * References:
 *  - Monrovia, Skyrocket Juniper, https://www.monrovia.com/skyrocket-juniper.html :
 *    "Quickly reaches 15 to 20 ft. tall, 2 to 3 ft. wide", blue-green,
 *    columnar, fast, zones 4-9.
 *  - UConn Plant Database, Juniperus scopulorum,
 *    https://plantdatabase.uconn.edu/detail.php?pid=232 : 'Skyrocket' "grows
 *    rapidly to 15' tall and 2' wide", "a narrow column of tight branches",
 *    "silvery blue foliage"; species scale leaves closely pressed, opposite;
 *    bark reddish brown, sometimes gray, shredding.
 *  - Boething Treeland Farms (California grower),
 *    https://www.boethingtreeland.com/plants/juniperus-virginiana-skyrocket :
 *    15-20 ft x 2-3 ft, silvery blue-green, sold in #5, #15 and #25 cans.
 *  - SelecTree (Cal Poly UFEI), Juniperus scopulorum (tree 762): foliage
 *    bluish green, silver, gray green; bark exfoliating, striated, light gray
 *    or red brown; columnar to conical.
 *  - Nursery sizes: Cornell Farms sells a 15 gal at 6-7 ft; Sooner Plant Farm
 *    a 5 gal at 4-5 ft. The finished job's trees stand about 7-7.5 ft tall and
 *    1.5-2 ft wide three weeks after planting (top near the top of a 6 ft
 *    fence's lattice), a 24" box size.
 * Catalog: 15 gal 1.75 m x 0.36 m (about 5.75 x 1.2 ft); a 24" box scales to
 * 2.3 m x 0.6 m (7.5 x 2 ft), the job's trees. Mature 6.0 m x 0.9 m (about
 * 20 x 3 ft) in 12 years, the top of the references' range for a fast
 * grower in a zone 9 yard.
 */

const PAL: ScalePal = { key: 'skyrocket', dark: '#2b3527', mid: '#4f5c45', light: '#737f63', tip: '#a4ab8c', stem: '#6e4c38' };

/** Silhouette: radius (0..1 of half the spread) at height fraction t. Widest a quarter of the way up, then a long, nearly straight taper to a thin tip. */
const profile = (t: number) => (t < 0.24 ? lerp(0.8, 1, smoothstep(0, 0.24, t)) : Math.pow(Math.max(0, 1 - (t - 0.24) / 0.76), 1.08));

/**
 * 3 x 2 atlas: five loose feathery sprays (base at the bottom of each cell),
 * one long whip in front of a few shaded ones, and in the last cell an opaque
 * shaded patch for the core.
 */
function skyrocketAtlas(): THREE.Texture {
  return leafTexture('skyrocket-juniper-sprays', 1024, 1024, (g, W, H) => {
    const r = rng('skyrocket-tex');
    const base = { cord: 3.6, angle: 0.4, angleVar: 0.16, spacing: 26, ratio: 0.48, taper: 0.3, minLen: 24, awl: 0.12, wave: 0.32, sweep: 0.62, gaps: 0.18, maxLevel: 3 };
    for (let cell = 0; cell < 5; cell++) {
      inCell(g, W, H, 3, 2, cell, (w, h) => {
        const back = frondStyle(PAL, { ...base, tone: 0.52 });
        const mid = frondStyle(PAL, { ...base, tone: 0.76 });
        const front = frondStyle(PAL, { ...base, cord: 3.1 });
        const x0 = w / 2, y0 = h - 7;
        const up = -Math.PI / 2;
        const lean = (r() - 0.5) * 0.16;
        for (const s of [-1, 1, 0]) paintFrond(g, r, x0 + s * 6, y0, up + lean + s * (0.22 + r() * 0.2), h * (0.5 + r() * 0.3), back);
        const s1 = r() < 0.5 ? -1 : 1;
        paintFrond(g, r, x0 + s1 * 3, y0, up + lean + s1 * (0.12 + r() * 0.14), h * (0.55 + r() * 0.25), mid);
        if (cell % 2) paintFrond(g, r, x0 - s1 * 3, y0, up + lean - s1 * (0.16 + r() * 0.14), h * (0.5 + r() * 0.25), front, 0, 0.6);
        // The whip: one long slender spray up the middle, its tips silvery.
        paintFrond(g, r, x0, y0, up + lean * 0.5 + s1 * 0.04, h * (0.84 + r() * 0.12), front, 0, 0.75);
      });
    }
    inCell(g, W, H, 3, 2, 5, (w, h) => paintCore(g, r, w, h, PAL, 0.55), 0);
  });
}

/**
 * Scale finished parts to the catalog size: height to the top, and spread to the bulk of the foliage (its
 * 98.5th percentile radius) rather than to the few sprays that stand out of it, as a nursery measures it.
 */
function fitBulk(parts: GeoBuilder[], foliage: GeoBuilder, height: number, spread: number) {
  const rad: number[] = [];
  let y1 = 1e-4;
  for (let i = 0; i < foliage.pos.length; i += 3) rad.push(Math.hypot(foliage.pos[i], foliage.pos[i + 2]));
  for (const g of parts) for (let i = 1; i < g.pos.length; i += 3) y1 = Math.max(y1, g.pos[i]);
  rad.sort((a, b) => a - b);
  const sx = spread / 2 / Math.max(1e-4, rad[Math.floor(rad.length * 0.985)]), sy = height / y1;
  for (const g of parts) for (const arr of [g.pos, g.anchor]) for (let i = 0; i < arr.length; i += 3) {
    arr[i] *= sx; arr[i + 1] *= sy; arr[i + 2] *= sx;
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, R = spec.matureSpread / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const prof = (y: number) => Math.max(0.02, profile(clamp(y / H))) * R;
  const sway = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / H, 1.6) * 0.85 + (Math.hypot(p.x, p.z) / R) * 0.15 * (p.y / H));
  const white = col('#ffffff'), twigCol = col('#8f8378');
  const tIn = col('#87897b'), tOut = col('#ffffff');
  const trunkR = 0.065, clear = 0.04;

  // Trunk, a little sinuous, and its root flare.
  const trunk: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    trunk.push(V(Math.sin(t * 5 + 1) * R * 0.04 * t, lerp(-0.12, H * 0.99, t), Math.cos(t * 4) * R * 0.04 * t));
  }
  tube(wood, trunk, trunkR, trunkR * 0.05, 9, white, 0, V(), (i) => sway(trunk[i]), 2);
  tube(wood, [V(0, -0.1, 0), V(0, 0.02, 0), V(0, trunkR * 1.6, 0)], trunkR * 1.6, trunkR * 0.98, 9, white, 0, V(), () => 0, 2);

  // Shaded core, thinner than in the sheared columns: the plant is loose, but never see-through in the middle.
  const coreUV = uvCell(3, 2, 5);
  const cu0 = coreUV[0] + 0.02, cu1 = coreUV[2] - 0.02, cv0 = coreUV[1] + 0.02, cv1 = coreUV[3] - 0.02;
  const tri = (x: number) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);
  {
    const rings = 18, sides = 9;
    let prev: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const y = lerp(0.12, H * 0.93, i / rings);
      const row: number[] = [];
      for (let s = 0; s <= sides; s++) {
        const az = (s / sides) * Math.PI * 2;
        const rr = prof(y) * 0.42 * (i === 0 ? 0.05 : i === 1 ? 0.6 : 1) * (0.85 + 0.3 * Math.sin(az * 3 + i * 1.9));
        const p = V(Math.cos(az) * rr, y, Math.sin(az) * rr);
        const shade = lerp(0.3, 0.55, clamp(y / H + 0.15));
        row.push(leaves.vert(p, V(Math.cos(az) * 0.3, -0.95, Math.sin(az) * 0.3).normalize(), lerp(cu0, cu1, tri(s * 3 / sides)), lerp(cv0, cv1, tri(i * 0.7)), tIn.clone().multiplyScalar(shade), 0, V(0, y, 0), sway(p)));
      }
      if (i > 0) for (let s = 0; s < sides; s++) leaves.quad(prev[s], prev[s + 1], row[s + 1], row[s]);
      prev = row;
    }
  }

  /** One spray card from `base` along `axis`; `out` pushes it outward from the trunk; `big` scales its length. */
  const spray = (base: THREE.Vector3, axis: THREE.Vector3, birth: number, big: number, upright: number, splay: number) => {
    const rad = Math.hypot(base.x, base.z);
    const out = rad > 1e-4 ? V(base.x / rad, 0, base.z / rad) : V(1, 0, 0);
    // Sprays there at install are longer: the young tree is shorter by more than it is narrower, so they shrink most.
    const len = lerp(0.24, 0.4, r()) * big * (birth < 0.05 ? 1.25 : 0.85);
    const dir = V(0, upright, 0).addScaledVector(axis, 1 - upright).addScaledVector(out, splay)
      .add(V((r() - 0.5) * 0.35, (r() - 0.5) * 0.2, (r() - 0.5) * 0.35)).normalize();
    const face = out.clone().applyAxisAngle(dir, (r() - 0.5) * 2.4).add(V(0, 0.12, 0)).normalize();
    const tipP = base.clone().addScaledVector(dir, len);
    const depth = clamp(Math.hypot(tipP.x, tipP.z) / prof(tipP.y));
    const hT = clamp(base.y / H);
    const shade = lerp(0.36, 1, Math.pow(depth, 1.5)) * lerp(0.86, 1.04, hT);
    const c = jitter(tIn.clone().lerp(tOut, Math.pow(depth, 1.2)), r, 0.015, 0.06, 0.06).multiplyScalar(shade);
    const s0 = sway(base);
    leafQuad(leaves, base, dir, face, len, len * 0.5 * (0.85 + r() * 0.3), uvCell(3, 2, Math.floor(r() * 5)), c, birth, base, {
      segs: 2, curl: (r() - 0.55) * 0.4, center: V(0, base.y - R * 0.6, 0), radii: V(1, 1, 1), normalBend: 0.55, sway0: s0, sway1: clamp(s0 + 0.06),
    });
  };

  /** Sprays along a branch or twig, plus the one at its end. */
  const dress = (pts: THREE.Vector3[], from: number, perM: number, birth: number, late: number) => {
    const L = polyLen(pts);
    const n = Math.max(1, Math.round(L * (1 - from) * perM));
    for (let k = 0; k < n; k++) {
      const a = along(pts, lerp(from, 1, (k + r()) / n));
      spray(a.p, a.dir, r() < 0.85 ? birth : clamp(birth + 0.1 + r() * late, 0, 0.9), 1, 0.7, 0.12 + r() * 0.3);
    }
    const e = along(pts, 1);
    spray(e.p, e.dir, birth, 1.1, 0.72, 0.15);
  };

  // Main branches: steep, climbing close to the trunk, more of them low where the plant is widest.
  const nBranch = 400;
  let az = r() * 6.28;
  for (let i = 0; i < nBranch; i++) {
    // The first tenth are the skirt: short low limbs reaching out near the ground, so the base is full.
    const low = i < nBranch * 0.1;
    const u = (i + r()) / nBranch;
    const y0 = low ? clear + r() * H * 0.05 : lerp(clear, H * 0.93, Math.pow(u, 1.15));
    az += 2.39996 + (r() - 0.5) * 0.5;
    const rise = (low ? lerp(0.15, 0.55, r()) : lerp(0.7, 1.7, r())) * lerp(1, 0.45, smoothstep(0.75, 1, y0 / H));
    const yt = Math.min(H * 0.97, y0 + rise);
    const rt = prof(yt) * (low ? 0.6 + 0.3 * r() : 0.55 + 0.4 * r());
    const ca = Math.cos(az), sa = Math.sin(az);
    const tb = along(trunk, clamp((y0 + 0.12) / (H * 0.99 + 0.12))).p;
    const pts = arc(tb, V(ca * rt * 0.9, y0 + (yt - y0) * 0.25, sa * rt * 0.9), V(ca * rt, yt, sa * rt), 3);
    const birth = r() < 0.7 ? 0 : clamp(0.1 + r() * 0.5 + (y0 / H) * 0.25, 0, 0.85);
    const br = lerp(0.14, 0.05, y0 / H) * trunkR * (0.7 + r() * 0.5);
    tube(wood, pts, br, br * 0.3, y0 < H * 0.2 ? 5 : 3, twigCol, birth, pts[0], (k) => sway(pts[k]), 1.5);
    dress(pts, 0.3, 7, birth, 0.4);
    // Side twigs, most toward the branch end.
    const L = polyLen(pts);
    const nt = Math.round(L * 4.5);
    for (let k = 0; k < nt; k++) {
      const a = along(pts, lerp(0.35, 0.97, (k + r()) / nt));
      const ta = az + (r() - 0.5) * 3.2;
      const rr = Math.hypot(a.p.x, a.p.z);
      const room = Math.max(0.03, prof(a.p.y) * 0.98 - rr);
      const d = V(Math.cos(ta), 0, Math.sin(ta)).multiplyScalar(0.45).addScaledVector(a.dir, 0.5).add(V(0, 0.55, 0)).normalize();
      const tl = Math.min(0.3 * (0.6 + r() * 0.8), room * 2.4 + 0.08);
      const end = a.p.clone().addScaledVector(d, tl);
      const er = Math.hypot(end.x, end.z), lim = prof(end.y) * 0.98;
      if (er > lim) { end.x *= lim / er; end.z *= lim / er; }
      const tp = [a.p, a.p.clone().lerp(end, 0.5).add(V(0, -tl * 0.05, 0)), end];
      const tbirth = r() < 0.8 ? birth : clamp(birth + 0.15 + r() * 0.4, 0, 0.88);
      dress(tp, 0.2, 7, tbirth, 0.3);
    }
  }

  // Whips: long single sprays rooted inside the outline that stand out of it, up and out, so the edge is ragged.
  for (let i = 0; i < 70; i++) {
    const y = H * lerp(0.06, 0.9, Math.pow(r(), 1.1));
    const a2 = r() * 6.28;
    const rr = prof(y) * (0.85 + r() * 0.15);
    const base = V(Math.cos(a2) * rr, y, Math.sin(a2) * rr);
    const out = V(Math.cos(a2), 0, Math.sin(a2));
    spray(base, V(0, 1, 0).addScaledVector(out, 0.4).normalize(), r() < 0.75 ? 0 : 0.2 + r() * 0.5, 1.1 + r() * 0.45, 0.6, 0.3 + r() * 0.3);
  }

  // The leader: a thin pointed top of narrow upright sprays.
  for (let k = 0; k < 16; k++) {
    const y = H * lerp(0.86, 0.975, k / 15);
    spray(V((r() - 0.5) * 0.04, y, (r() - 0.5) * 0.04), UP, k < 11 ? 0 : 0.3, 0.9, 0.96, 0.02);
  }

  fitBulk([leaves, wood], leaves, H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: skyrocketAtlas(),
    bark: { map: fibrousBark('skyrocket', '#6e5444', '#3b2a20', '#a08a78') },
    look: { translucency: 0.14, leafRoughness: 0.78, bend: 0.2, flutter: 0.008, alphaTest: 0.42 },
  };
};
