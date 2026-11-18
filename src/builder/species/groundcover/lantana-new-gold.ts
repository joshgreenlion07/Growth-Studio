import * as THREE from 'three';
import { GeoBuilder, V, along, barkTexture, clamp, col, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { toothedLeafPath } from '../perennials/shared-perennials';
import { TAU, domeCard, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';

/**
 * Lantana 'New Gold', Lantana x hybrida 'New Gold' (L. camara x
 * L. montevidensis), the sterile, spreading gold lantana sold as a
 * groundcover shrub.
 *
 * A low, mounding and spreading shrublet: many square, rough stems arch out
 * from a woody crown and lie over one another, highest in the middle and
 * thinning to single stems at the edge. They carry opposite, decussate
 * pairs of small ovate leaves with round-toothed (crenate) margins, the
 * surface rough and puckered between sunken veins, dark green and dull.
 * From the upper leaf axils rise short stalks with flat-topped, slightly
 * domed heads of small four-lobed golden yellow florets, the outer ring open
 * and the middle still in bud. 'New Gold' sets no berries and blooms so
 * heavily that the mound is spangled gold all over.
 *
 * References and the numbers they give:
 * - Monrovia, New Gold Lantana (monrovia.com/new-gold-lantana.html): 1 to
 *   2 ft tall, spreading 2 to 4 ft wide; moderate growth; brilliant golden
 *   yellow flower clusters spring to fall; textured green foliage.
 * - Clemson HGIC 1162, "Lantana" (hgic.clemson.edu/factsheet/lantana/):
 *   'New Gold' a vigorous spreader to 2 ft tall and 4 ft wide, very heavy
 *   blooming, deep gold, sterile (no berries); lantana heads about 2 in
 *   wide, disc-shaped; leaves coarse, lightly toothed, rough to the touch.
 * - Water Wise Garden Planner, New Gold lantana
 *   (waterwisegardenplanner.org/plants/lantana-x-new-gold/): low, mounding
 *   evergreen shrub from L. camara x L. montevidensis, 2 ft tall by up to
 *   6 ft wide; leaves deep green, 2 to 4 in on vigorous shoots, pungent;
 *   round, ball-like gold heads.
 * - The job photo (a finished job, early February, dusk): a 1 gal plant at
 *   a bed corner showing a bright gold cluster over light green new leaves.
 * Leaves on the low groundcover lantanas run smaller than on L. camara:
 * about 1 to 2 in here; heads 1 to 1.5 in across of 20 or so florets about
 * 1/4 in wide.
 * Size used: installed from a 1 gal at 0.2 m tall x 0.3 m wide; 0.45 m
 * (1.5 ft) tall x 1.2 m (4 ft) wide in two years in a zone 9 bed.
 */

const LW = 1024, LH = 1024, C = 512;
/** Leaf atlas, 2 x 2: two shoots with opposite pairs, a shoot tip, a patch of older leaves. */
const cellUV = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, LW, LH);

const GREENS = ['#24461a', '#2a5020', '#2f5822', '#33601f'];
const YOUNG = ['#4a7a2c', '#568832'];

/** One ovate lantana leaf: short stalk, round teeth, rough puckered surface between sunken veins. */
function lantanaLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, fill: string, dark: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = '#4a5e2e';
  g.lineWidth = len * 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.12, 0);
  g.stroke();
  g.translate(len * 0.1, 0);
  const L = len * 0.9, W = L * (0.56 + r() * 0.06);
  toothedLeafPath(g, L, W, 0.36, 9, 0.16);
  g.fillStyle = fill;
  g.fill();
  g.save();
  g.clip();
  if (dark > 0) {
    g.fillStyle = `rgba(6,20,6,${dark})`;
    g.fillRect(-L, -L, L * 3, L * 2);
  }
  // Puckered cushions between the veins.
  for (let i = 0; i < 70; i++) {
    const px = L * (0.08 + r() * 0.85), py = (r() - 0.5) * W * 0.85, rr = L * (0.025 + r() * 0.035);
    g.fillStyle = `rgba(10,30,8,${0.1 + r() * 0.1})`;
    g.beginPath();
    g.arc(px + rr * 0.3, py + rr * 0.3, rr, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(150,190,110,${0.06 + r() * 0.08})`;
    g.beginPath();
    g.arc(px - rr * 0.2, py - rr * 0.2, rr * 0.6, 0, TAU);
    g.fill();
  }
  // Sunken veins: midrib and five pairs curving toward the tip.
  g.strokeStyle = 'rgba(12,30,8,0.6)';
  g.lineWidth = L * 0.022;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(L * 0.94, 0);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6.3;
    for (const s of [-1, 1]) {
      g.moveTo(L * t, 0);
      g.quadraticCurveTo(L * (t + 0.08), s * W * 0.22, L * (t + 0.2), s * W * 0.36 * Math.sin(Math.PI * Math.min(0.95, t + 0.15)));
    }
  }
  g.stroke();
  g.strokeStyle = 'rgba(140,175,100,0.3)';
  g.lineWidth = L * 0.012;
  g.beginPath();
  g.moveTo(0, -L * 0.012);
  g.lineTo(L * 0.9, -L * 0.012);
  g.stroke();
  g.restore();
  g.restore();
}

/** A shoot growing up the cell: opposite pairs, each pair turned a quarter turn from the last. */
function shoot(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number) {
  const x0 = w / 2, y0 = h * 0.995, x1 = w / 2 + (r() - 0.5) * w * 0.08, y1 = h * top;
  const sg = g.createLinearGradient(0, y0, 0, y1);
  sg.addColorStop(0, '#5e5236');
  sg.addColorStop(0.5, '#4f6233');
  sg.addColorStop(1, '#5f8438');
  g.strokeStyle = sg;
  g.lineWidth = w * 0.016;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : 0.07 + (i / pairs) * 0.86;
    const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
    const flat = i % 2 === 0;
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * (flat ? 1.05 + r() * 0.3 : 0.35 + r() * 0.25);
      const len = w * (flat ? 0.36 : 0.24) * (0.88 + r() * 0.24) * lerp(1, 0.8, t);
      lantanaLeaf(g, r, nx, ny, a, len, GREENS[Math.floor(r() * GREENS.length)], !flat ? 0.14 : r() < 0.3 ? 0.1 : 0);
    }
  }
  for (const s of [-1, 1]) lantanaLeaf(g, r, x1, y1, -Math.PI / 2 + s * (0.3 + r() * 0.25), w * 0.17, YOUNG[Math.floor(r() * 2)], 0);
}

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-lantana-new-gold-leaves', LW, LH, (g) => {
    const r = rng('gc-lantana-leaves');
    inCell(g, 0, 0, C, C, (w, h) => shoot(g, r, w, h, 4, 0.18));
    inCell(g, C, 0, C, C, (w, h) => shoot(g, r, w, h, 3, 0.24));
    inCell(g, 0, C, C, C, (w, h) => shoot(g, r, w, h, 2, 0.42));
    inCell(g, C, C, C, C, (w, h) => {
      for (let k = 0; k < 34; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.27;
        lantanaLeaf(g, r, w * (0.5 + Math.cos(a) * d), h * (0.5 + Math.sin(a) * d), a + (r() - 0.5) * 2, w * (0.17 + r() * 0.07), GREENS[Math.floor(r() * 3)], r() * 0.25);
      }
    });
  });
}

const FW = 1024, FH = 1024;
const fcell = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, FW, FH);

/** One salverform floret from above: four rounded lobes, the lower one largest, a deeper gold throat. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number, gold: THREE.Color, sq = 1, rot = r() * TAU) {
  g.save();
  g.translate(x, y);
  g.scale(1, sq);
  g.rotate(rot);
  const css = (c: THREE.Color) => `#${c.getHexString()}`;
  const tone = gold.clone().lerp(new THREE.Color('#f09a00'), 0.32 + r() * 0.15).multiplyScalar(0.92 + r() * 0.08);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const big = k === 0 ? 1.18 : 1;
    const pg = g.createRadialGradient(0, 0, s * 0.1, 0, 0, s);
    pg.addColorStop(0, css(tone.clone().lerp(new THREE.Color('#d06c00'), 0.55)));
    pg.addColorStop(0.45, css(tone));
    pg.addColorStop(1, css(tone.clone().lerp(new THREE.Color('#ffd23a'), 0.15)));
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(Math.cos(a) * s * 0.5 * big, Math.sin(a) * s * 0.5 * big, s * 0.48 * big, s * 0.42 * big, a, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#c47400';
  g.beginPath();
  g.arc(0, 0, s * 0.09, 0, TAU);
  g.fill();
  g.restore();
}

function bud(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number) {
  g.fillStyle = r() < 0.5 ? '#e0a418' : '#c99a2a';
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.42, r() * TAU, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(120,130,40,0.7)';
  g.beginPath();
  g.arc(x, y, s * 0.16, 0, TAU);
  g.fill();
}

function flowerAtlas(gold: string): THREE.Texture {
  return leafTexture(`gc-lantana-new-gold-flowers-${gold}`, FW, FH, (g) => {
    const r = rng('gc-lantana-flowers');
    const G = new THREE.Color(gold);
    // Cells 0, 1: a full head from above. Cell 3: a young head, mostly buds.
    for (const c of [0, 1, 3]) {
      inCell(g, (c % 2) * C, Math.floor(c / 2) * C, C, C, (w, h) => {
        const cx = w / 2, cy = h / 2, young = c === 3;
        const n0 = young ? 9 : 13 + c;
        for (let k = 0; k < n0; k++) {
          const a = (k / n0) * TAU + r() * 0.2, d = w * (young ? 0.3 : 0.355) * (0.94 + r() * 0.1);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.11 + r() * 0.02), G, 1, a + Math.PI + (r() - 0.5) * 0.6);
        }
        const n1 = young ? 0 : 8;
        for (let k = 0; k < n1; k++) {
          const a = (k / n1) * TAU + 0.3 + r() * 0.3, d = w * 0.2 * (0.9 + r() * 0.2);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.1 + r() * 0.02), G, 1, a + Math.PI);
        }
        const nb = young ? 26 : 9;
        for (let k = 0; k < nb; k++) {
          const a = r() * TAU, d = Math.sqrt(r()) * w * (young ? 0.21 : 0.09);
          bud(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * 0.065);
        }
      });
    }
    // Cell 2: a head from the side on its stalk: a low, rounded dome of florets seen at a slant, on a short stalk.
    inCell(g, 0, C, C, C, (w, h) => {
      const cx = w / 2, base = h * 0.56;
      g.strokeStyle = '#4e6a32';
      g.lineWidth = w * 0.024;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, base);
      g.stroke();
      // Green bracts under the head.
      g.fillStyle = '#56763a';
      g.beginPath();
      g.ellipse(cx, base, w * 0.2, h * 0.035, 0, 0, TAU);
      g.fill();
      // Florets fill a half-ellipse dome, back rows first; the lowest are side-on and the top ones face up.
      const rx = w * 0.4, ry = h * 0.3;
      for (let row = 0; row < 6; row++) {
        const v = 1 - row / 5; // 1 at the base rim .. 0 at the top
        const y = base - ry * Math.sqrt(1 - v * v) - h * 0.02;
        const half = rx * Math.max(0.25, v);
        const n = Math.max(2, Math.round(half / (w * 0.06)));
        for (let k = 0; k < n; k++) {
          const x = cx + ((k + 0.5) / n - 0.5) * 2 * half + (r() - 0.5) * w * 0.02;
          floret(g, r, x, y + (r() - 0.5) * h * 0.02, w * (row === 5 ? 0.075 : 0.09), G, lerp(0.45, 0.9, row / 5));
        }
      }
      for (let k = 0; k < 7; k++) bud(g, r, cx + (r() - 0.5) * w * 0.18, base - ry - h * 0.01 + r() * h * 0.05, w * 0.055);
    });
  });
}

function stemBark(): THREE.Texture {
  return barkTexture('gc-lantana-stem', 32, (g, S) => {
    g.fillStyle = '#5a5638';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(80,100,50,0.4)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 8, 0, 3, S);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const wood = new GeoBuilder();
  const center = V(0, -Sp * 0.45, 0), radii = V(1, 1, 1);

  // A rounded mound: stems pile up over the crown and thin to single arching stems at the edge.
  const mound = (rho: number) => H * 0.86 * Math.pow(clamp(1 - rho * rho), 0.62);
  const runners = growRunners(r, {
    n: 14,
    R,
    step: 0.04,
    wander: 0.45,
    reachMin: 0.74,
    levels: [
      { every: 0.075, angle: 0.75, len: [0.12, 0.32] },
      { every: 0.08, angle: 0.85, len: [0.06, 0.15] },
    ],
    y: (rho, layer) => 0.012 + mound(rho) * (0.22 + 0.78 * layer),
  });

  const swayAt = (y: number) => clamp(y / H) * 0.7;
  const birthAt = (rho: number) => (rho < 0.55 || r() < 0.3 ? 0 : clamp((rho - 0.55) * 2 + r() * 0.15, 0.08, 0.85));
  const white = col('#ffffff');
  const fl = col('#ffffff', 0.8);

  const head = (tip: THREE.Vector3, dir: THREE.Vector3, birth: number, big = 0) => {
    // A short axillary stalk lifts the head just clear of the leaves.
    const rise = 0.02 + r() * 0.015;
    const out = V(dir.x, 0, dir.z).normalize();
    const c = tip.clone().addScaledVector(out, 0.01 + r() * 0.012).add(V(0, rise, 0));
    const size = (0.037 + r() * 0.01) * (1 + big);
    const n = V(out.x * (0.15 + r() * 0.3) + (r() - 0.5) * 0.25, 1, out.z * (0.15 + r() * 0.3) + (r() - 0.5) * 0.25).normalize();
    const q = r();
    const s1 = swayAt(c.y);
    domeCard(flowers, c, n, r() * TAU, size, 0.16, fcell(q < 0.42 ? 0 : q < 0.82 ? 1 : 3), fl, birth, tip, s1);
    const a = r() * TAU;
    const stalkDir = c.clone().sub(tip).normalize();
    const L = size * 0.95;
    leafQuad(flowers, c.clone().addScaledVector(stalkDir, -L * 0.85), stalkDir, V(Math.cos(a), 0, Math.sin(a)), L, L, fcell(2), fl.clone().multiplyScalar(0.92), birth, tip, { segs: 1, sway0: swayAt(tip.y), sway1: s1 });
  };

  for (const run of runners) {
    const n = Math.max(1, Math.round(run.length / 0.03));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const t = (k + r() * 0.5) / n;
      const at = along(run.pts, t);
      side = -side;
      const rho = Math.hypot(at.p.x, at.p.z) / R;
      const edge = clamp((rho - 0.74) / 0.26);
      const last = k === n - 1;
      const len = (last ? 0.095 : 0.12) * (0.85 + r() * 0.3);
      const pitch = lerp(0.15 + r() * 0.8 * (0.25 + run.layer), 0.05 + r() * 0.15, edge) + (last ? 0.25 : 0);
      const shade = lerp(0.58, 1.0, clamp(run.layer * 0.85 + edge * 0.5 + r() * 0.25)) * (0.9 + r() * 0.16);
      const b = birthAt(rho);
      const s0 = swayAt(at.p.y);
      lay(leaves, at.p, heading(at.dir) + (last ? 0 : side * (0.3 + r() * 0.6)), pitch, (r() - 0.5) * 0.7, len, len, cellUV(last ? 2 : Math.floor(r() * 2)), white.clone().multiplyScalar(shade), b, { segs: 2, curl: pitch * 1.2 + r() * 0.25, center, radii, normalBend: 0.5, sway0: s0, sway1: clamp(s0 + 0.15) });
      // 'New Gold' flowers from the upper leaf axils all along the shoots, so the whole mound is spangled.
      if (!last && run.layer > 0.25 && r() < 0.3) head(at.p.clone().add(V((r() - 0.5) * 0.03, 0.012, (r() - 0.5) * 0.03)), at.dir, clamp(b + r() * 0.1, 0, 0.9));
    }
    const end = along(run.pts, 1);
    const erho = Math.hypot(end.p.x, end.p.z) / R;
    if (r() < 0.92) head(end.p, end.dir, birthAt(erho));
    if (run.level === 0) {
      const pts = run.pts.filter((_, i) => i % 3 === 0 || i === run.pts.length - 1);
      tube(wood, pts, 0.004, 0.0018, 4, white, 0, pts[0], (i) => swayAt(pts[i].y));
    }
  }

  // Upright flowering shoots over the top of the mound, each with its own leafy tip.
  for (let k = 0; k < 64; k++) {
    const rho = Math.sqrt(r()) * 0.66, a = r() * TAU, az = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.012 + mound(rho) * (0.72 + r() * 0.28), Math.sin(a) * rho * R);
    const b = birthAt(rho);
    const len = 0.1 * (0.85 + r() * 0.3), pitch = 0.5 + r() * 0.5;
    const s0 = swayAt(p.y);
    const base = p.clone().add(V(-Math.cos(az) * len * 0.75 * Math.cos(pitch), -len * 0.75 * Math.sin(pitch), -Math.sin(az) * len * 0.75 * Math.cos(pitch)));
    lay(leaves, base, az, pitch, (r() - 0.5) * 0.5, len, len, cellUV(2), white.clone().multiplyScalar(0.9 + r() * 0.15), b, { segs: 2, curl: 0.5, center, radii, normalBend: 0.5, sway0: clamp(s0 - 0.2), sway1: s0 });
    head(p, V(Math.cos(az), 0, Math.sin(az)), b);
  }

  // The young plant's own heads over the top of the crown: present from install, so a 1 gal already reads gold. They
  // run to the 2 in end of the range, since at install the whole plant is drawn at a quarter of its mature width.
  for (let k = 0; k < 34; k++) {
    const rho = Math.sqrt((k + r()) / 34) * 0.74, a = k * 2.39996 + r() * 0.5;
    const p = V(Math.cos(a) * rho * R, 0.012 + mound(rho) * (0.86 + r() * 0.1), Math.sin(a) * rho * R);
    head(p, V(Math.cos(a), 0, Math.sin(a)), 0, 0.25);
  }

  // Older shaded leaves deep in the mound and on the soil under it.
  for (let k = 0; k < 70; k++) {
    const low = k < 26;
    const rho = Math.sqrt(r()) * (low ? 0.82 : 0.66), a = r() * TAU, az = r() * TAU, sz = 0.2 + r() * 0.06;
    const p = V(Math.cos(a) * rho * R, 0.006 + mound(rho) * (low ? 0.06 : 0.3 + r() * 0.4), Math.sin(a) * rho * R);
    const base = p.clone().add(V(-Math.cos(az) * sz * 0.5, 0, -Math.sin(az) * sz * 0.5));
    lay(leaves, base, az, 0.02, 0, sz, sz, cellUV(3), col('#ffffff', low ? 0.42 + r() * 0.12 : 0.6 + r() * 0.14), birthAt(rho), { segs: 1, center, radii, normalBend: 0.5, sway0: 0, sway1: 0 }, p);
  }

  // The woody crown.
  tube(wood, [V(0, 0, 0), V(0, 0.03, 0)], 0.012, 0.008, 6, white, 0, V(), () => 0);

  fitMat([leaves, flowers, wood], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    wood: wood.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(spec.flower ?? '#f6c21a'),
    bark: { map: stemBark() },
    look: { leafRoughness: 0.78, translucency: 0.28, bend: 0.025, flutter: 0.004 },
  };
};
