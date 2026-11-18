import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafTexture, lerp, perp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { stemBark } from '../perennials/shared-perennials';
import { GOLDEN, fitGeo, paintSkin, smoothNormals, solidLeaf, tipSway, type LeafStation } from './shared-succulents';

/**
 * Red yucca, Hesperaloe parviflora: a stemless clump of several rosettes of
 * long, very narrow, stiff but arching gray-green leaves, deeply channeled
 * above, with fine curly white threads peeling from the margins and a dry
 * tan point. Thin, nearly bare flower stalks rise well above the leaves and
 * carry small coral-red tubular buds and flowers in loose clusters along
 * their upper half, opening from the bottom up; the lowest set small green
 * pods. Stalks are olive-tan low down, flushed rose toward the top.
 *
 * References and the numbers they give:
 * - Lady Bird Johnson Wildflower Center (wildflower.org, HEPA8): leaves
 *   2-3 ft long, blue-green (plum-tinted in winter), linear, ciliate edges,
 *   crowded in a basal rosette; flowers coral, tubular, about 35 mm long, on
 *   pink, wand-like, arching stalks that rise about 5 ft; plant up to about
 *   5 ft tall in flower.
 * - Wikipedia (Hesperaloe parviflora): narrow channeled leaves with a fringe
 *   of white, thread-like fibers along the edges; branching, reddish-tinted
 *   inflorescences up to 1.5 m long; clumps 3-6 ft high and about as wide.
 * - Henderson County / Missouri Botanical Garden Plant Finder text
 *   (txmg.org): red to pink tubular flowers in branching inflorescences on
 *   red flower stalks 4-6 ft tall, well above the foliage clump.
 * - City of Austin Grow Green plant guide (red yucca): 2-4 ft tall, spread
 *   up to 4 ft.
 * - Green Lion job photo (corten planter, 5 gal): a dense fountain of leaves
 *   about 2 ft high and 30-33 in across with 3-4 thin stalks to about
 *   4-4.5 ft above the soil, buds mostly closed.
 * Targets here: leaves up to about 0.8 m long and 2 cm wide; after four
 * years the leaves stand about 0.75 m high and 1.25 m (4 ft) across, with
 * nine stalks to 1.5 m. At install (5 gal) about 0.65 m of leaves, 0.85 m
 * across, four stalks to about 1.3 m. The catalog height is the plant in
 * flower, as for the daylilies.
 */

const TOP: [number, number] = [0.008, 0.367];
const BOT: [number, number] = [0.383, 0.742];

function skin(): THREE.Texture {
  return leafTexture('red-yucca-hesperaloe', 512, 1024, (g, w, h) => {
    const r = rng('red-yucca-skin');
    const fw = 192;
    // Upper (channel) face: gray-green with fine lengthwise fibers and a faint bloom; pale clasping base, dry tan point.
    paintSkin(g, 0, fw, h, {
      r,
      ramp: ['#908e66', '#4f5e40', '#3f5236', '#3d5035', '#415237', '#505a40'],
      bloom: { n: 140, color: 'rgba(170,186,172,1)', alpha: 0.1, size: 16 },
      streaks: { n: 520, dark: '#2e3f2a', light: '#74876c', alpha: 0.24 },
      margin: [{ w: 0.03, color: '#b9b8a0' }, { w: 0.02, color: '#76846c' }],
      marginFlare: 1.4,
      tip: { color: '#8a7656', frac: 0.035, soft: 0.04 },
    });
    // Lower (keel) face: a little paler and grayer.
    paintSkin(g, fw, fw, h, {
      r,
      ramp: ['#9a9872', '#5a684c', '#4a5c41', '#485a40', '#4c5c42', '#586248'],
      bloom: { n: 180, color: 'rgba(182,196,182,1)', alpha: 0.13, size: 18 },
      streaks: { n: 520, dark: '#3b4e38', light: '#8a9c84', alpha: 0.22 },
      margin: [{ w: 0.03, color: '#b9b8a0' }],
      marginFlare: 1.4,
      tip: { color: '#8a7656', frac: 0.035, soft: 0.04 },
    });
    // Threads: fine curly white fibers peeling from the margin, four cells stacked in the right-hand strip.
    const tx = 2 * fw, tw = w - tx, th = h / 4;
    g.lineCap = 'round';
    for (let cell = 0; cell < 4; cell++) {
      const y0 = cell * th;
      const n = 2 + (cell % 2);
      for (let k = 0; k < n; k++) {
        let x = tx + 3, y = y0 + th * (0.2 + 0.6 * (k / Math.max(1, n - 1)) + (r() - 0.5) * 0.1);
        let a = (r() - 0.5) * 0.9, turn = (r() - 0.5) * 0.3;
        g.strokeStyle = k % 2 ? '#f3f1e6' : '#e4e0d0';
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(x, y);
        const steps = 40 + Math.floor(r() * 30);
        for (let s = 0; s < steps; s++) {
          turn = clamp(turn + (r() - 0.5) * 0.12, -0.34, 0.34);
          a += turn;
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          if (x > tx + tw - 8 || x < tx + 6 || y < y0 + 8 || y > y0 + th - 8) a = Math.atan2(y0 + th / 2 - y, tx + tw / 2 - x) + (r() - 0.5);
          x = clamp(x, tx + 4, tx + tw - 5);
          y = clamp(y, y0 + 5, y0 + th - 5);
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  });
}

/**
 * A closed spindle along `dir` (bud, pod, or a tubular flower when `open`):
 * rings at the given (t, radius fraction) stations, a point at the end
 * unless open. Normals come from the surface.
 */
function spindle(
  g: GeoBuilder,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  rad: number,
  prof: [number, number][],
  sides: number,
  color: (t: number) => THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: number,
  open = false,
) {
  const d = dir.clone().normalize();
  const a = perp(d), b = V().crossVectors(d, a).normalize();
  const v0 = g.count, i0 = g.idx.length;
  const up = V(0, 1, 0);
  const rings: number[][] = [];
  for (const [t, f] of prof) {
    const c = base.clone().addScaledVector(d, len * t);
    const cl = color(t);
    const ring: number[] = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const o = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      ring.push(g.vert(c.addScaledVector(o, rad * f).clone(), up, 0, 0, cl, birth, anchor, sway));
      c.addScaledVector(o, -rad * f);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) g.quad(rings[i][s], rings[i][(s + 1) % sides], rings[i + 1][(s + 1) % sides], rings[i + 1][s]);
  }
  if (!open) {
    const L = rings.length - 1;
    const tip = g.vert(base.clone().addScaledVector(d, len), up, 0, 0, color(1), birth, anchor, sway);
    for (let s = 0; s < sides; s++) g.tri(rings[L][s], rings[L][(s + 1) % sides], tip);
  }
  smoothNormals(g, v0, i0);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const fresh = col('#ffffff'), old = col('#e2dcc4'), young = col('#eef3ea');
  const white = col('#ffffff');

  const thread = (st: LeafStation, sgn: number, size: number, birth: number, anchor: THREE.Vector3) => {
    const o = st.p.clone().addScaledVector(st.side, sgn * st.hw * 0.95).addScaledVector(st.up, st.hw * 0.3);
    const outv = st.side.clone().multiplyScalar(sgn).addScaledVector(st.up, (r() - 0.2) * 1.3).addScaledVector(st.dir, (r() - 0.5) * 0.5).normalize();
    const al = st.dir.clone().addScaledVector(st.up, (r() - 0.5) * 0.5).normalize();
    const n = V().crossVectors(outv, al).normalize();
    const cell = Math.floor(r() * 4);
    const u0 = 0.756, u1 = 0.996, v1 = 1 - cell / 4 - 0.004, v0 = 1 - (cell + 1) / 4 + 0.004;
    const flip = r() < 0.5;
    const hh = size, ww = size * 0.5;
    const a = o.clone().addScaledVector(al, -hh / 2), b = o.clone().addScaledVector(al, hh / 2);
    const c = b.clone().addScaledVector(outv, ww), d = a.clone().addScaledVector(outv, ww);
    const va = flip ? v1 : v0, vb = flip ? v0 : v1;
    const i0 = leaves.vert(a, n, u0, va, white, birth, anchor, st.sway);
    const i1 = leaves.vert(b, n, u0, vb, white, birth, anchor, st.sway);
    const i2 = leaves.vert(c, n, u1, vb, white, birth, anchor, st.sway);
    const i3 = leaves.vert(d, n, u1, va, white, birth, anchor, st.sway);
    leaves.quad(i0, i1, i2, i3);
  };

  /** One rosette of the clump: young leaves upright in the middle, older ones arching out and over. */
  const rosette = (center: THREE.Vector3, scale: number, N: number, birth0: number, lean: number, leanAz: number) => {
    const L = 0.8 * scale, W = 0.021 * lerp(0.85, 1, scale);
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const az = i * GOLDEN + (r() - 0.5) * 0.3;
      let theta = lerp(0.04, 0.58, Math.pow(f, 1.1)) + (r() - 0.5) * 0.12;
      theta = clamp(theta + lean * Math.cos(az - leanAz), 0.02, 1.4);
      const len = L * lerp(0.6, 1, smoothstep(0, 0.4, f)) * lerp(1, 0.8, smoothstep(0.7, 1, f)) * (0.86 + r() * 0.24);
      const wid = W * lerp(0.75, 1, smoothstep(0, 0.35, f)) * (0.88 + r() * 0.24);
      const coreR = 0.022 * scale * Math.pow(f, 0.6);
      const base = center.clone().add(V(Math.cos(az) * coreR, lerp(0.05, 0.008, Math.pow(f, 0.7)) * scale, Math.sin(az) * coreR));
      const tint = jitter(young.clone().lerp(fresh, smoothstep(0, 0.3, f)).lerp(old, smoothstep(0.7, 1, f) * 0.6), r, 0.012, 0.05, 0.05);
      const birth = f < 0.2 || r() < 0.72 ? birth0 : clamp(birth0 + 0.1 + r() * 0.7, 0, 0.9);
      // Stiff near the base, bending more toward the tip; the outer leaves arch right over.
      // Leaves that already start low arch less, so the tips hang just clear of the ground.
      const arch = lerp(0.2, 1.45, f) * (0.75 + r() * 0.5) * (1 - 0.4 * smoothstep(0.7, 1.1, theta));
      const kink = f > 0.45 && f < 0.8 && r() < 0.08 ? 0.6 + r() * 0.6 : 0;
      const kinkAt = 0.4 + r() * 0.35;
      const swT = tipSway(base.y + Math.cos(theta) * len * 0.8, Math.hypot(base.x, base.z) + Math.sin(theta) * len, H * 0.6, Sp);
      const st = solidLeaf(leaves, {
        base, az, theta, len,
        halfWidth: (t) => (wid / 2) * (t < 0.06 ? lerp(1.4, 1, t / 0.06) : 0.04 + 0.96 * (1 - Math.pow((t - 0.06) / 0.94, 2.1))),
        thick: (t) => wid * lerp(0.34, 0.1, Math.pow(t, 0.6)),
        cup: (t) => lerp(0.55, 1.05, smoothstep(0, 0.5, t)),
        bend: (t) => arch * (0.3 + 2.1 * Math.pow(t, 1.3)) + (kink ? kink * 6 * Math.exp(-Math.pow((t - kinkAt) / 0.12, 2)) * 0.6 : 0),
        twist: (r() - 0.5) * 0.9,
        yaw: (r() - 0.5) * 0.25,
        segs: f < 0.25 ? 4 : 5,
        cols: 3,
        tipLen: len * 0.025,
        uvTop: TOP,
        uvBot: BOT,
        vBlade: 0.97,
        color: tint,
        shade: (t) => lerp(0.42, 1, smoothstep(0, 0.4, t)),
        birth,
        anchor: base,
        sway0: 0,
        sway1: swT,
      });
      // Curly threads, mostly on the older leaves.
      const nThreads = f < 0.15 ? 0 : r() < 0.45 ? 1 : r() < 0.6 ? 2 : 0;
      for (let k = 0; k < nThreads; k++) {
        const s = st[1 + Math.floor(r() * (st.length - 3))];
        thread(s, r() < 0.5 ? -1 : 1, 0.035 + r() * 0.035, birth, base);
      }
    }
  };

  // The clump: a main rosette with three close offsets (a 5 gal plant), more filling in as it grows.
  const crowns: { c: THREE.Vector3; az: number; birth: number }[] = [];
  const a0 = r() * Math.PI * 2;
  rosette(V(0, 0, 0), 1, 34, 0, 0, 0);
  crowns.push({ c: V(0, 0, 0), az: a0, birth: 0 });
  for (let k = 0; k < 3; k++) {
    const az = a0 + k * 2.1 + (r() - 0.5) * 0.4, rr = 0.075 + r() * 0.02;
    const c = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    rosette(c, 0.88 + r() * 0.08, 26, 0, 0.12, az);
    crowns.push({ c, az, birth: 0 });
  }
  for (let k = 0; k < 3; k++) {
    const az = a0 + 1.05 + k * 2.1 + (r() - 0.5) * 0.4, rr = 0.13 + r() * 0.03;
    const c = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const b = 0.3 + k * 0.2;
    rosette(c, 0.7 + r() * 0.06, 18, b, 0.18, az);
    crowns.push({ c, az, birth: b });
  }

  // Flower stalks: one from each of the four install crowns, more as the clump fills.
  const stalkBark = (t: number) => col('#8e9468').lerp(col('#a48e6e'), smoothstep(0.1, 0.55, t)).lerp(col('#a8645a'), smoothstep(0.5, 1, t));
  const budCol = (k: number) => (t: number) => col('#a8524a').lerp(col('#c2423a'), smoothstep(0.1, 0.5, t)).lerp(col('#7e2426'), smoothstep(0.7, 1, t)).multiplyScalar(k);
  const flowerCol = (t: number) => col('#c75a48').lerp(col('#e2735c'), smoothstep(0.2, 0.8, t)).lerp(col('#e7c06a'), smoothstep(0.86, 1, t));
  const podCol = (t: number) => col('#74844c').lerp(col('#8c9658'), smoothstep(0.2, 0.8, t)).lerp(col('#7a5a3c'), smoothstep(0.9, 1, t));
  const plan: { crown: number; birth: number }[] = [
    { crown: 0, birth: 0 }, { crown: 1, birth: 0 }, { crown: 2, birth: 0 }, { crown: 3, birth: 0 },
    { crown: 0, birth: 0.35 }, { crown: 4, birth: 0.45 }, { crown: 5, birth: 0.6 }, { crown: 2, birth: 0.7 }, { crown: 6, birth: 0.8 },
  ];
  const swayAt = (y: number) => clamp(Math.pow(y / H, 1.6) * 1.1);

  /** Flower clusters along a raceme from t0 to the tip of the path. */
  const raceme = (pts: THREE.Vector3[], t0: number, birth: number, anchor: THREE.Vector3, rad0: number, mature: boolean, budsOnly: boolean) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
    const span = total * (1 - t0);
    let az = r() * 6.28;
    let s = 0;
    while (s < span) {
      const u = s / span; // 0 the lowest cluster .. 1 the tip
      const t = t0 + (1 - t0) * u;
      const at = along(pts, t);
      s += lerp(0.042, 0.02, u) * (0.8 + r() * 0.4);
      const n = u > 0.8 ? 1 : 1 + Math.floor(r() * (u < 0.4 ? 2.4 : 1.8));
      for (let k = 0; k < n; k++) {
        az += GOLDEN + (r() - 0.5) * 0.5;
        const sw = swayAt(at.p.y);
        const stage = budsOnly ? 1 : u + (r() - 0.5) * 0.25;
        const pedDir = deflect(at.dir, lerp(1.1, 0.55, u) + (r() - 0.5) * 0.3, az);
        const pedLen = lerp(0.016, 0.006, u) * (0.8 + r() * 0.4);
        const foot = at.p.clone().addScaledVector(pedDir, rad0 * 0.6);
        // Pedicels show on the open lower clusters; up top the buds sit almost on the stalk.
        const tipP = u < 0.5 ? foot.clone().addScaledVector(pedDir, pedLen) : foot;
        if (u < 0.5) tube(wood, [foot, tipP], 0.0009, 0.0007, 3, col('#a2625a'), birth, anchor, () => sw, 1);
        if (mature && stage < 0.12 && r() < 0.8) {
          // Lowest clusters: small green seed pods, upright.
          const d = pedDir.clone().lerp(at.dir, 0.6).normalize();
          spindle(flowers, tipP, d, 0.018 + r() * 0.006, 0.0062, [[0, 0.35], [0.2, 0.85], [0.55, 1], [0.85, 0.7]], 6, podCol, birth, anchor, sw);
        } else if (!budsOnly && stage < 0.3 && r() < 0.3) {
          // Open flowers nod: a slim coral tube flaring a little at the mouth, pale yellow inside.
          const d = pedDir.clone().multiplyScalar(0.6).add(V(0, -1, 0)).normalize();
          spindle(flowers, tipP, d, 0.028 + r() * 0.006, 0.0042, [[0, 0.5], [0.15, 0.85], [0.55, 1], [0.85, 1.1], [1, 1.6]], 6, flowerCol, birth, anchor, sw, true);
        } else {
          // Buds: ascending, plump coral spindles, smaller toward the tip.
          const d = pedDir.clone().lerp(at.dir, 0.55).normalize();
          const bl = lerp(0.02, 0.009, u) * (0.85 + r() * 0.3);
          spindle(flowers, tipP, d, bl, lerp(0.0036, 0.0023, u), [[0, 0.45], [0.3, 0.95], [0.72, 0.9]], 4, budCol(0.85 + r() * 0.25), birth, anchor, sw);
        }
      }
    }
  };

  for (const p of plan) {
    const cr = crowns[p.crown];
    const base = cr.c.clone().add(V((r() - 0.5) * 0.02, 0.03, (r() - 0.5) * 0.02));
    const out = Math.hypot(cr.c.x, cr.c.z) > 0.01 ? Math.atan2(cr.c.z, cr.c.x) : r() * 6.28;
    const lean0 = 0.07 + r() * 0.12 + (p.crown > 0 ? 0.1 : 0);
    const lean1 = lean0 + 0.06 + r() * 0.12;
    const az = out + (r() - 0.5) * 0.8;
    const SL = H * (p.crown === 0 && p.birth === 0 ? 0.99 : lerp(0.74, 0.96, r()));
    const segs = 12;
    const pts: THREE.Vector3[] = [base.clone()];
    const q = base.clone();
    let wob = 0;
    for (let i = 0; i < segs; i++) {
      const lean = lerp(lean0, lean1, (i + 0.5) / segs);
      wob += (r() - 0.5) * 0.08;
      q.add(V(Math.cos(az + wob) * Math.sin(lean), Math.cos(lean), Math.sin(az + wob) * Math.sin(lean)).multiplyScalar(SL / segs));
      pts.push(q.clone());
    }
    const birth = Math.max(p.birth, cr.birth);
    const anchor = base.clone();
    const r0 = 0.0052, r1 = 0.0018;
    // One unbroken tube (so distant levels of detail keep or drop the stalk whole), then shade it from olive-tan
    // at the base to rose at the top, ring by ring.
    const sides = 5, v0 = wood.count;
    tube(wood, pts, r0, r1, sides, stalkBark(0), birth, anchor, (k) => swayAt(pts[k].y), 1);
    for (let i = v0; i < wood.count; i++) {
      const c = stalkBark(Math.floor((i - v0) / (sides + 1)) / segs);
      wood.col[i * 3] = c.r;
      wood.col[i * 3 + 1] = c.g;
      wood.col[i * 3 + 2] = c.b;
    }
    const mature = p.birth > 0 || p.crown === 0;
    const rStart = lerp(0.5, 0.58, r());
    raceme(pts, rStart, birth, anchor, lerp(r0, r1, rStart), mature, false);
    // Older stalks branch: a short arm or two off the lower raceme.
    if ((p.birth > 0 && r() < 0.6) || p.crown === 1) {
      const nb = 1 + (r() < 0.35 ? 1 : 0);
      for (let k = 0; k < nb; k++) {
        const t = rStart + 0.02 + k * 0.08 + r() * 0.05;
        const at = along(pts, t);
        const d = deflect(at.dir, 0.42 + r() * 0.2, r() * 6.28);
        const bl = 0.12 + r() * 0.1;
        const mid = at.p.clone().addScaledVector(d, bl * 0.5);
        const bp = [at.p.clone(), mid, mid.clone().addScaledVector(d.clone().lerp(at.dir, 0.5).normalize(), bl * 0.5)];
        const rb = lerp(r0, r1, t) * 0.6;
        tube(wood, bp, rb, rb * 0.5, 4, stalkBark(0.85), birth, anchor, (i) => swayAt(bp[i].y), 1);
        raceme(bp, 0.25, birth, anchor, rb, false, false);
      }
    }
  }

  fitGeo([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: skin(),
    flowerMap: null,
    bark: { map: stemBark() },
    look: { leafRoughness: 0.72, translucency: 0.15, bend: 0.05, flutter: 0.002, alphaTest: 0.35, woodShadows: true },
  };
};
