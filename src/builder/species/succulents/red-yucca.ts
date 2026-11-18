import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafQuad, leafTexture, lerp, mixCols, perp, rng, smoothstep, uvCell, type SpeciesBuilder } from '../kit';
import { archPath, type Path } from '../grasses/shared-grasses';
import { GOLDEN, fitGeo } from './shared-succulents';

/**
 * Red yucca, Hesperaloe parviflora: a stemless clump of many rosettes of long,
 * narrow, leathery leaves, deeply channeled (U-shaped in section), gray-green,
 * stiff in the lower half and arching over toward the tip, with fine curly white
 * fibers peeling off the margins of the older leaves. From late spring through
 * summer (most of the year in a warm winter) slender rose-red stalks rise well
 * above the leaves and arch at the top, carrying a loose, few-branched raceme of
 * nodding coral-red tubular flowers, yellow inside; buds at the tips, green seed
 * capsules held upright below the open flowers. The plant is modeled in bloom
 * (its signature look); the finished job's February photos show last year's
 * spent stalks, tan with empty pedicels and capsules.
 *
 * References:
 * - NC State Extension Plant Toolbox, https://plants.ces.ncsu.edu/plants/hesperaloe-parviflora :
 *   3-5 ft tall (in flower), 4-6 ft wide; leaves about 1 in wide, 2-3 ft long, blue-green,
 *   leathery, with white filament hairs on the margins, purplish in cold winters; red, pink or
 *   coral tubular flowers with yellow centers on 4-6 ft red stalks; woody black-seeded capsules.
 * - Lady Bird Johnson Wildflower Center, https://www.wildflower.org/plants/result.php?id_plant=HEPA8 :
 *   up to about 5 ft tall in flower; leaves 2-3 ft, ciliate margins; stalk to 5 ft with coral
 *   tubular flowers 35 mm long on arching, wand-like pink stems; blooms March to July.
 * - Monrovia, https://www.monrovia.com/red-yucca.html :
 *   foliage 3-4 ft tall and wide, flower stalks 4-6 ft; slender, narrow leaves; rose-pink to
 *   coral flowers early summer, longer in warm winter regions; moderate growth.
 *
 * Size used: 1.5 m (5 ft) to the top of the flower stalks, foliage about 0.9 m (3 ft) tall and
 * 1.2 m (4 ft) wide, in four years in a Central Valley bed. 5 gal installed at 1.1 m to the stalk
 * tips and 0.7 m wide, foliage about 0.6 m tall, as in the finished job's planters (leaves about
 * 2 ft above the soil and about 2 ft across, last year's stalks to about 3.5-4 ft). Leaves are
 * 0.6-0.9 m long and about 25 mm wide at maturity; flowers 3 cm on 1-1.5 cm pedicels.
 */

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */

/** Leaf strip (u 0..0.5): near white, fibrous lengthwise lines, pale margins, dry tip. Right half: four thread cells. */
const LEAF_U: [number, number] = [0.012, 0.488];
const STALK_UV: [number, number] = [0.25, 0.5];

function leafSkin(): THREE.Texture {
  return leafTexture('red-yucca-leaf', 512, 1024, (g, w, h) => {
    const r = rng('red-yucca-leaf-skin');
    const lw = w / 2;
    g.fillStyle = '#f1f2ec';
    g.fillRect(0, 0, lw, h);
    // The channel floor is a little darker than the rising sides.
    const grad = g.createLinearGradient(0, 0, lw, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0.02)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.09)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.02)');
    grad.addColorStop(1, 'rgba(255,255,255,0.10)');
    g.fillStyle = grad;
    g.fillRect(0, 0, lw, h);
    // Fine parallel fibers and veins.
    for (let i = 0; i < 70; i++) {
      const x = 6 + r() * (lw - 12);
      g.fillStyle = r() < 0.6 ? `rgba(0,0,0,${0.04 + r() * 0.07})` : `rgba(255,255,255,${0.08 + r() * 0.1})`;
      const y0 = r() * h * 0.3, y1 = h - r() * h * 0.2;
      g.fillRect(x, y0, 1 + r() * 1.5, y1 - y0);
    }
    // Faint waxy bloom in long streaks.
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(235,242,246,0.12)';
      g.fillRect(r() * lw, r() * h, 8 + r() * 20, 80 + r() * 260);
    }
    // Margins: a pale fibrous edge with a thin darker line just inside it.
    g.fillStyle = '#fbfbf6';
    g.fillRect(0, 0, 5, h);
    g.fillRect(lw - 5, 0, 5, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(5, 0, 2, h);
    g.fillRect(lw - 7, 0, 2, h);
    // Dry, hardened tip.
    g.fillStyle = '#a08a68';
    g.fillRect(0, 0, lw, h * 0.018);
    for (let k = 0; k < 10; k++) {
      g.globalAlpha = 1 - (k + 0.5) / 10;
      g.fillRect(0, h * (0.018 + k * 0.002), lw, h * 0.002 + 1);
    }
    g.globalAlpha = 1;
    // Threads: curly white fibers leaving the left edge of each cell (the leaf margin).
    const tx = lw, tw = w - lw, th = h / 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let cell = 0; cell < 4; cell++) {
      const y0 = cell * th;
      const n = 2 + (cell % 2);
      for (let k = 0; k < n; k++) {
        let x = tx + 3, y = y0 + th * (0.2 + 0.6 * (k / Math.max(1, n - 1))) + (r() - 0.5) * 12;
        let a = (r() - 0.5) * 1.0, turn = (r() < 0.5 ? -1 : 1) * (0.08 + r() * 0.08);
        g.strokeStyle = k % 2 ? '#f6f3ea' : '#e9e4d6';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, y);
        const steps = 40 + Math.floor(r() * 30);
        for (let s = 0; s < steps; s++) {
          // Tighten into curls as the thread frays away from the leaf.
          turn = clamp(turn * 1.02 + (r() - 0.5) * 0.05, -0.45, 0.45);
          a += turn;
          x += Math.cos(a) * 4.5;
          y += Math.sin(a) * 4.5;
          if (x > tx + tw - 8 || x < tx + 5 || y < y0 + 8 || y > y0 + th - 8) a = Math.atan2(y0 + th / 2 - y, tx + tw / 2 - x) + (r() - 0.5);
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
 * Flower atlas, four cells side by side, each with the pedicel at the bottom and the flower toward the top:
 * 0 open flower (coral red), 1 open flower (salmon pink, wider mouth), 2 bud, 3 young seed capsule.
 */
function flowerAtlas(): THREE.Texture {
  return leafTexture('red-yucca-flowers', 512, 256, (g, w, h) => {
    const cw = w / 4;
    const r = rng('red-yucca-flower-skin');
    const pedicel = (cx: number, top: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h - 2);
      g.quadraticCurveTo(cx + 3, (h + top) / 2, cx, top);
      g.stroke();
    };
    /** A tubular flower from y0 (base) to y1 (mouth): `wb` wide at the base, `wm` at the mouth, lobes flared by `flare`. */
    const tube = (cx: number, y0: number, y1: number, wb: number, wm: number, flare: number, ramp: string[], lip: string, throat: string) => {
      const L = y0 - y1;
      const half = (t: number) => lerp(wb, wm, Math.pow(t, 0.8)) / 2;
      // Body.
      g.beginPath();
      g.moveTo(cx - half(0), y0);
      for (let k = 0; k <= 20; k++) g.lineTo(cx - half(k / 20), y0 - (L * k) / 20);
      // Three pointed, slightly flaring lobe tips across the mouth.
      const mw = half(1) + flare;
      g.lineTo(cx - mw, y1 - 6);
      g.lineTo(cx - mw * 0.35, y1 + 3);
      g.lineTo(cx, y1 - 9);
      g.lineTo(cx + mw * 0.35, y1 + 3);
      g.lineTo(cx + mw, y1 - 6);
      for (let k = 20; k >= 0; k--) g.lineTo(cx + half(k / 20), y0 - (L * k) / 20);
      g.closePath();
      const grad = g.createLinearGradient(0, y0, 0, y1);
      ramp.forEach((c, i) => grad.addColorStop(i / (ramp.length - 1), c));
      g.fillStyle = grad;
      g.fill();
      g.save();
      g.clip();
      // Round shading across the tube, a highlight left of center.
      const sh = g.createLinearGradient(cx - mw, 0, cx + mw, 0);
      sh.addColorStop(0, 'rgba(60,0,10,0.35)');
      sh.addColorStop(0.32, 'rgba(255,255,255,0.18)');
      sh.addColorStop(0.55, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(60,0,10,0.4)');
      g.fillStyle = sh;
      g.fillRect(cx - mw - 2, y1 - 12, mw * 2 + 4, L + 14);
      // Seams between the tepals.
      g.strokeStyle = 'rgba(90,10,25,0.28)';
      g.lineWidth = 1.5;
      for (const f of [-0.45, 0.1, 0.55]) {
        g.beginPath();
        g.moveTo(cx + f * half(0), y0);
        g.lineTo(cx + f * half(1), y1);
        g.stroke();
      }
      // Lobe tips edged pale yellow, the throat yellow where the mouth opens.
      g.fillStyle = lip;
      g.fillRect(cx - mw - 2, y1 - 12, mw * 2 + 4, 9);
      g.restore();
      g.fillStyle = throat;
      g.beginPath();
      g.ellipse(cx, y1 - 2, half(1) * 0.55, 5, 0, 0, Math.PI * 2);
      g.fill();
      // Stamens just out of the mouth.
      g.strokeStyle = '#f4dc84';
      g.lineWidth = 2;
      for (const dx of [-5, 0, 5]) {
        g.beginPath();
        g.moveTo(cx + dx * 0.6, y1);
        g.lineTo(cx + dx, y1 - 10 - r() * 4);
        g.stroke();
      }
    };
    // 0: coral red.
    pedicel(cw * 0.5, 198, '#b8505a');
    tube(cw * 0.5, 202, 30, 40, 58, 8, ['#b0303f', '#cc3e4e', '#da4c54', '#e46060'], 'rgba(246,206,120,0.85)', '#f2c04e');
    // 1: salmon pink, a little more open.
    pedicel(cw * 1.5, 196, '#c0606a');
    tube(cw * 1.5, 200, 36, 40, 62, 12, ['#bc4052', '#d8565e', '#e46a68', '#ec8274'], 'rgba(248,214,130,0.9)', '#f4c858');
    // 2: bud, slender and closed, deeper rose.
    pedicel(cw * 2.5, 214, '#a8444e');
    g.beginPath();
    g.ellipse(cw * 2.5, 150, 17, 66, 0, 0, Math.PI * 2);
    const bg = g.createLinearGradient(0, 216, 0, 84);
    bg.addColorStop(0, '#9a2c40');
    bg.addColorStop(0.6, '#bc3a4e');
    bg.addColorStop(1, '#c8505a');
    g.fillStyle = bg;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(cw * 2.5 - 4, 140, 3.5, 44, 0, 0, Math.PI * 2);
    g.fill();
    // 3: young capsule, held up, green with a red blush and the dry flower still on top.
    pedicel(cw * 3.5, 170, '#8a6a4a');
    g.beginPath();
    g.ellipse(cw * 3.5, 128, 22, 46, 0, 0, Math.PI * 2);
    const cg = g.createLinearGradient(cw * 3.5 - 22, 0, cw * 3.5 + 22, 0);
    cg.addColorStop(0, '#5e6a34');
    cg.addColorStop(0.4, '#8c9a52');
    cg.addColorStop(1, '#5a5a30');
    g.fillStyle = cg;
    g.fill();
    g.fillStyle = 'rgba(160,50,50,0.25)';
    g.beginPath();
    g.ellipse(cw * 3.5 + 6, 150, 14, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,50,20,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cw * 3.5, 84);
    g.lineTo(cw * 3.5 + 2, 172);
    g.stroke();
    g.strokeStyle = '#a88a66';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cw * 3.5, 84);
    g.lineTo(cw * 3.5 - 3, 58);
    g.moveTo(cw * 3.5, 84);
    g.lineTo(cw * 3.5 + 5, 60);
    g.stroke();
  });
}

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */

/** A channeled leaf along a path: 4 points across, the edges raised toward the upper (inner) face, a U in section. */
function channelLeaf(
  g: GeoBuilder,
  path: Path,
  o: { hw: (t: number) => number; cup: (t: number) => number; c0: THREE.Color; c1: THREE.Color; c2: THREE.Color; birth: number; sway: number; ao: number },
) {
  const xs = [-1, -1 / 3, 1 / 3, 1];
  const anchor = path.pts[0];
  let prev: number[] | null = null;
  const c = new THREE.Color();
  for (let i = 0; i < path.pts.length; i++) {
    const t = path.ts[i];
    const hw = o.hw(t), cup = o.cup(t);
    if (t < 0.07) c.copy(o.c0).lerp(o.c1, t / 0.07);
    else c.copy(o.c1).lerp(o.c2, Math.pow((t - 0.07) / 0.93, 1.3));
    c.multiplyScalar(lerp(o.ao, 1, smoothstep(0, 0.45, t)));
    const sw = o.sway * Math.pow(t, 1.8);
    const row: number[] = [];
    for (const x of xs) {
      const q = path.pts[i].clone().addScaledVector(path.sides[i], x * hw).addScaledVector(path.ups[i], cup * hw * (x * x - 0.4));
      const n = path.ups[i].clone().addScaledVector(path.sides[i], -2 * cup * x * 0.8).normalize();
      row.push(g.vert(q, n, lerp(LEAF_U[0], LEAF_U[1], (x + 1) / 2), lerp(0.004, 0.996, t), c, o.birth, anchor, sw));
    }
    if (prev) for (let k = 0; k < 3; k++) g.quad(prev[k], prev[k + 1], row[k + 1], row[k]);
    prev = row;
  }
}

/** A round stalk with a fixed texture sample (the near-white leaf strip), colored by vertex color. */
function scape(g: GeoBuilder, pts: THREE.Vector3[], r0: number, r1: number, c0: THREE.Color, c1: THREE.Color, birth: number, anchor: THREE.Vector3, sway: (t: number) => number, sides = 5) {
  const n = pts.length - 1;
  let prev: number[] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const e1 = perp(d), e2 = V().crossVectors(d, e1).normalize();
    const rad = lerp(r0, r1, t);
    const c = c0.clone().lerp(c1, t);
    const row: number[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nn = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      row.push(g.vert(pts[i].clone().addScaledVector(nn, rad), nn, STALK_UV[0], STALK_UV[1], c, birth, anchor, sway(t)));
    }
    if (prev) for (let k = 0; k < sides; k++) g.quad(prev[k], prev[(k + 1) % sides], row[(k + 1) % sides], row[k]);
    prev = row;
  }
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const leafMids = [col('#5c735c'), col('#637862'), col('#586e58'), col('#697d63'), col('#5f7564')];
  const sheath = col('#8e8c76'), sheathPink = col('#8e7c72');
  const white = col('#ffffff');
  const threadCell = (i: number): [number, number, number, number] => [0.502, 1 - (i + 1) / 4 + 0.004, 0.996, 1 - i / 4 - 0.004];

  /** Curly fiber card off a leaf margin at fraction t of the leaf. */
  const thread = (path: Path, t: number, hw: number, sgn: number, size: number, birth: number, sway: number) => {
    const i = Math.max(1, Math.min(path.pts.length - 2, Math.round(t * (path.pts.length - 1))));
    const p = path.pts[i].clone().addScaledVector(path.sides[i], sgn * hw * 0.98).addScaledVector(path.ups[i], hw * 0.4);
    const dir = path.pts[i + 1].clone().sub(path.pts[i - 1]).normalize();
    const out = path.sides[i].clone().multiplyScalar(sgn).addScaledVector(path.ups[i], (r() - 0.2) * 1.4).normalize();
    const n = V().crossVectors(out, dir).normalize();
    const cell = threadCell(Math.floor(r() * 4));
    const hh = size, ww = size * 0.5;
    const a = p.clone().addScaledVector(dir, -hh / 2), b = p.clone().addScaledVector(dir, hh / 2);
    const cc = b.clone().addScaledVector(out, ww), d = a.clone().addScaledVector(out, ww);
    const flip = r() < 0.5;
    const va = flip ? cell[3] : cell[1], vb = flip ? cell[1] : cell[3];
    const anchor = path.pts[0];
    const i0 = leaves.vert(a, n, cell[0], va, white, birth, anchor, sway);
    const i1 = leaves.vert(b, n, cell[0], vb, white, birth, anchor, sway);
    const i2 = leaves.vert(cc, n, cell[2], vb, white, birth, anchor, sway);
    const i3 = leaves.vert(d, n, cell[2], va, white, birth, anchor, sway);
    leaves.quad(i0, i1, i2, i3);
  };

  /** One rosette: N leaves spiraling out, the youngest upright in the center, the oldest arching over at the rim. */
  const rosette = (center: THREE.Vector3, N: number, scale: number, birth0: number, lean: number, leanAz: number) => {
    for (let i = 0; i < N; i++) {
      const f = (i + 0.5) / N;
      const az = i * GOLDEN + (r() - 0.5) * 0.3;
      // Offsets lean away from the clump's middle.
      const tilt = clamp(lerp(0.06, 0.98, Math.pow(f, 0.5)) + (r() - 0.5) * 0.16 + lean * Math.cos(az - leanAz), 0.02, 1.25);
      const len = scale * lerp(0.7, 0.9, smoothstep(0, 0.4, f)) * lerp(1, 0.82, smoothstep(0.7, 1, f)) * (0.9 + r() * 0.18);
      const wid = scale * 0.025 * lerp(0.75, 1, smoothstep(0, 0.35, f)) * (0.9 + r() * 0.18);
      const coreR = 0.02 * Math.pow(f, 0.6);
      const base = center.clone().add(V(Math.cos(az) * coreR, -0.004, Math.sin(az) * coreR));
      const old = f > 0.75;
      // Stiff below, arching over in the outer part; old rim leaves bow down hard.
      const bend = lerp(0.14, 1.55, Math.pow(f, 1.0)) * (0.75 + r() * 0.5) + (old && r() < 0.35 ? 0.5 : 0);
      const path = archPath(base, {
        az: az + (r() - 0.5) * 0.3, tilt, bend, bendPow: 2.3, len, segs: 10,
        azCurl: (r() - 0.5) * 0.5, roll: (r() - 0.5) * 0.35, twist: (r() - 0.5) * 0.9, floor: 0.012 + r() * 0.01,
      });
      const mid = jitter(mixCols(leafMids, r()), r, 0.01, 0.05, 0.05).multiplyScalar(old ? 0.9 : 1);
      const tip = mid.clone().lerp(col('#828f76'), 0.35);
      const birth = f < 0.25 || r() < 0.76 ? birth0 : clamp(birth0 + 0.1 + r() * 0.6, 0, 0.9);
      const hw = (t: number) => (wid / 2) * (t < 0.06 ? lerp(1.4, 1, t / 0.06) : t < 0.42 ? 1 : Math.max(0.05, 1 - Math.pow((t - 0.42) / 0.58, 1.1)));
      const sway = clamp(0.25 + 0.35 * f + (r() - 0.5) * 0.1);
      channelLeaf(leaves, path, {
        hw, cup: (t) => lerp(0.75, 0.38, smoothstep(0, 0.8, t)), c0: (r() < 0.4 ? sheathPink : sheath).clone(), c1: mid, c2: tip, birth, sway, ao: 0.55,
      });
      // Fibers on the margins of the older leaves.
      const nT = f < 0.3 ? 0 : f < 0.6 ? (r() < 0.6 ? 1 : 0) : 1 + Math.floor(r() * 2.2);
      for (let k = 0; k < nT; k++) {
        const t = 0.15 + r() * 0.55;
        thread(path, t, hw(t), r() < 0.5 ? -1 : 1, 0.05 + r() * 0.05, birth, sway * Math.pow(t, 1.8));
      }
    }
  };

  // The clump: a main rosette, two close offsets present at install, more filling in around them.
  rosette(V(0, 0, 0), 44, 1, 0, 0, 0);
  const a0 = r() * Math.PI * 2;
  const crowns: [number, number, number, number][] = [
    // [azimuth, radius, leaves, birth]
    [a0, 0.06, 32, 0], [a0 + 2.6, 0.065, 30, 0],
    [a0 + 1.3, 0.12, 26, 0.25], [a0 + 3.9, 0.13, 26, 0.35], [a0 + 5.1, 0.12, 24, 0.5], [a0 + 0.4, 0.15, 22, 0.65],
  ];
  for (const [az, rad, n, b] of crowns) rosette(V(Math.cos(az) * rad, 0, Math.sin(az) * rad), n, lerp(1, 0.9, rad / 0.15), b, 0.15, az);

  /* Flower stalks: a bare scape, then a loose raceme with a few short side branches near its base. */
  const stalkLo = col('#64424a'), stalkHi = col('#9a4456');
  const flowerTints = [col('#ffffff'), col('#fff2f0'), col('#f6ecec')];
  const STALKS: [number, number, number][] = [
    // [azimuth offset, crown radius, birth]
    [0.3, 0.03, 0], [2.4, 0.06, 0], [4.4, 0.05, 0], [1.4, 0.1, 0.3], [3.4, 0.12, 0.45], [5.4, 0.11, 0.6], [0.9, 0.14, 0.75],
  ];
  /** Flowers on a node: pedicels radiating, open flowers nodding, buds ascending, capsules held up. */
  const node = (p: THREE.Vector3, axis: THREE.Vector3, state: number, k: number, birth: number, anchor: THREE.Vector3, sway: number, sz: number) => {
    const count = state === 2 ? 1 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.4 ? 1 : 0);
    let az = r() * Math.PI * 2;
    for (let j = 0; j < count; j++) {
      az += (Math.PI * 2) / count + (r() - 0.5) * 0.6;
      const e1 = perp(axis), e2 = V().crossVectors(axis, e1).normalize();
      const out = e1.multiplyScalar(Math.cos(az)).addScaledVector(e2, Math.sin(az)).normalize();
      let dir: THREE.Vector3, cell: number, L: number, W: number;
      if (state === 0) {
        // Young capsule: erect on its pedicel.
        dir = axis.clone().multiplyScalar(0.8).addScaledVector(out, 0.55).normalize();
        cell = 3; L = 0.042 * sz; W = 0.028 * sz;
      } else if (state === 1) {
        // Open flower: the pedicel spreads, the flower hangs.
        dir = out.clone().multiplyScalar(0.55).add(V(0, -0.85, 0)).addScaledVector(axis, 0.15).normalize();
        cell = r() < 0.6 ? 0 : 1; L = 0.05 * sz; W = 0.024 * sz;
      } else {
        // Bud: ascending, smaller toward the tip.
        dir = axis.clone().multiplyScalar(0.75).addScaledVector(out, 0.65).normalize();
        cell = 2; L = 0.036 * sz * (1 - 0.35 * k); W = 0.016 * sz * (1 - 0.3 * k);
      }
      const base = p.clone().addScaledVector(out, 0.003);
      const tint = jitter(mixCols(flowerTints, r()), r, 0.005, 0.03, 0.04);
      const f1 = perp(dir), f2 = V().crossVectors(dir, f1).normalize();
      for (const face of [f1, f2]) leafQuad(flowers, base, dir, face, L, W, uvCell(4, 1, cell), tint, birth, anchor, { segs: 1, sway0: sway, sway1: sway });
    }
  };
  for (let si = 0; si < STALKS.length; si++) {
    const [azo, rad, birth] = STALKS[si];
    const az = a0 + azo;
    const base = V(Math.cos(az) * rad, 0.02, Math.sin(az) * rad);
    const len = lerp(1.32, 1.5, r()) * (birth > 0.5 ? 0.92 : 1);
    const st = archPath(base, { az: az + (r() - 0.5) * 0.4, tilt: 0.08 + (rad / 0.14) * 0.22 + r() * 0.1, bend: 0.55 + r() * 0.45, bendPow: 2.4, len, segs: 14, crowd: 1, azCurl: (r() - 0.5) * 0.4 });
    const sw = (t: number) => 0.95 * Math.pow(t, 1.5);
    scape(leaves, st.pts, 0.0075, 0.0022, stalkLo, stalkHi, birth, base, sw);
    // The raceme: from 45% of the stalk to its tip. Lowest nodes in seed, the middle in flower, buds at the top.
    const from = 0.45 + r() * 0.05;
    const nodes = 16;
    for (let k = 0; k < nodes; k++) {
      const t = lerp(from, 0.985, k / (nodes - 1));
      const x = t * (st.pts.length - 1);
      const i = Math.min(st.pts.length - 2, Math.floor(x));
      const p = st.pts[i].clone().lerp(st.pts[i + 1], x - i);
      const axis = st.pts[i + 1].clone().sub(st.pts[i]).normalize();
      const u = k / (nodes - 1);
      const state = u < 0.15 ? 0 : u < 0.8 ? 1 : 2;
      node(p, axis, state, state === 2 ? (u - 0.8) / 0.2 : 0, birth, base, sw(t), 1);
    }
    // Side branches near the base of the raceme.
    const nb = 2 + Math.floor(r() * 2.5);
    for (let b = 0; b < nb; b++) {
      const t = from + 0.02 + b * 0.055 + r() * 0.02;
      const x = t * (st.pts.length - 1);
      const i = Math.min(st.pts.length - 2, Math.floor(x));
      const p = st.pts[i].clone().lerp(st.pts[i + 1], x - i);
      const baz = az + b * 2.4 + r();
      const bl = lerp(0.14, 0.28, r()) * (1 - b * 0.18);
      const br = archPath(p, { az: baz, tilt: 0.55 + r() * 0.2, bend: -0.25 + r() * 0.2, bendPow: 1.5, len: bl, segs: 4, crowd: 1 });
      const bsw = (q: number) => sw(t) + (0.95 - sw(t)) * 0.4 * q;
      scape(leaves, br.pts, 0.0028, 0.0015, stalkHi.clone().multiplyScalar(0.9), stalkHi, birth, base, bsw, 4);
      const bn = 3 + Math.floor(bl / 0.07);
      for (let k = 0; k < bn; k++) {
        const q = (k + 0.6) / bn;
        const xq = q * (br.pts.length - 1);
        const iq = Math.min(br.pts.length - 2, Math.floor(xq));
        const pq = br.pts[iq].clone().lerp(br.pts[iq + 1], xq - iq);
        const axis = br.pts[iq + 1].clone().sub(br.pts[iq]).normalize();
        const state = q < 0.25 ? 0 : q < 0.75 ? 1 : 2;
        node(pq, axis, state, state === 2 ? 0.3 : 0, birth, base, bsw(q), 0.92);
      }
    }
  }

  fitGeo([leaves, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafSkin(),
    flowerMap: flowerAtlas(),
    look: { leafRoughness: 0.55, translucency: 0.16, bend: 0.06, flutter: 0.003, alphaTest: 0.4 },
  };
};
