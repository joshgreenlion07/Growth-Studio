import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, sprig, sprigDir, stemBark, tone } from '../shrubs/shared-shrubs-b';
import { TAU, rect, type UV } from '../groundcover/shared-groundcovers';
import { arcPath } from './shared-perennials';

/**
 * Catmint 'Walker's Low', Nepeta x faassenii 'Walker's Low' (RHS files it
 * under N. racemosa), in its first flush of bloom.
 *
 * A loose, airy mound: many square, hairy stems rise from the crown, the outer
 * ones leaning out and arching, so the plant sprawls a little wider than it is
 * tall. They carry opposite pairs of small aromatic leaves, about 1 to 1.5 in,
 * ovate with a heart-shaped base and a scalloped (crenate) edge, gray-green
 * and softly hairy with a crinkled, netted surface. The upper half of every
 * stem is a loose spike of whorls (verticillasters) set an inch or so apart,
 * closer toward the tip: each whorl is a ring of gray-violet calyces with
 * small two-lipped flowers about 1/2 in long, lavender-blue with a broad
 * lower lip spotted dark violet. The spikes stand well above the foliage, so
 * from a distance the plant is a lavender-blue haze over gray-green.
 *
 * References and the numbers they give:
 * - Monrovia, Walker's Low Catmint: 2 ft tall, 3 ft wide; fragrant, compact
 *   mound of finely textured gray-green foliage; periwinkle blue flower spikes.
 * - NC State Extension Plant Toolbox, Nepeta x faassenii 'Walker's Low'
 *   (plants.ces.ncsu.edu/plants/nepeta-x-faassenii-walkers-low/): 2 to 2.5 ft
 *   tall, 2.5 to 3 ft wide (spread 18 to 36 in); leaves opposite, ovate to
 *   cordate, crenate, gray/silver-green, hairy, crinkled, 1 to 2 in; flowers
 *   1/2 in, lavender-blue, two-lipped, in loose racemes; square stems;
 *   sterile; reblooms after a midsummer shearing.
 * - Purdue Extension (purdue.edu/hla): up to 36 in tall and about the same in
 *   spread; the name is from the garden it came from, not its height.
 * - RHS, Nepeta racemosa 'Walker's Low' (rhs.org.uk/plants/55055): about
 *   60 cm; aromatic silvery-green leaves; dark blue-mauve flowers from early
 *   summer into autumn if deadheaded; a tight mound or looser, by site.
 * - Wikimedia Commons photos of 'Walker's Low' (Coastal Maine Botanical
 *   Gardens, Chicago Botanic Garden evaluation garden, Leuven Botanical
 *   Garden): the habit, the spike spacing and the spotted lower lips.
 * Size used: installed from a 1 gal at 0.25 m tall x 0.3 m wide; 0.7 m
 * (2.3 ft) tall in flower x 0.9 m (3 ft) wide in two years.
 */

/* ---------------------------- leaf atlas ---------------------------- */

/**
 * Leaf atlas, 1024 x 1024: six leafy shoots (256 x 512, cells 0..5, base at
 * the bottom) and four single opposite leaf pairs on a bit of stem (256 x 256,
 * cells 6..9) for the leafy lower part of the flower stems.
 */
const shootCell = (i: number): UV => rect((i % 4) * 256, Math.floor(i / 4) * 512, 256, 512, 1024, 1024);
const pairCell = (i: number): UV => rect(512 + (i % 2) * 256, 512 + Math.floor(i / 2) * 256, 256, 256, 1024, 1024);

/** A crenate leaf with a heart-shaped base, base at the origin and tip at (len, 0). */
function crenatePath(g: CanvasRenderingContext2D, len: number, wid: number, teeth: number, depth: number) {
  const hw = wid / 2;
  // Widest a third of the way up, rounded into a blunt tip; the base lobes bulge back past the stalk.
  const prof = (t: number) => (t < 0.32 ? Math.pow(Math.sin((t / 0.32) * Math.PI * 0.5), 0.55) : Math.pow(Math.cos(((t - 0.32) / 0.68) * Math.PI * 0.5), 0.85));
  const N = teeth * 8;
  const edge: [number, number][] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const ph = (t * teeth) % 1;
    const scallop = t > 0.06 && t < 0.96 ? 1 - depth + depth * Math.sin(Math.PI * ph) : 1;
    const back = t < 0.18 ? Math.sin((t / 0.18) * Math.PI) * len * 0.07 : 0;
    edge.push([len * t - back, hw * prof(t) * scallop]);
  }
  g.beginPath();
  g.moveTo(0, 0);
  for (const [x, y] of edge) g.lineTo(x, -y);
  for (let i = edge.length - 1; i >= 0; i--) g.lineTo(edge[i][0], edge[i][1]);
  g.closePath();
}

const LEAF: [string, string][] = [
  ['#53664a', '#627459'],
  ['#5e7152', '#6e8061'],
  ['#6b7d5d', '#7c8d6d'],
  ['#7f8e74', '#929f87'],
];

/** One catmint leaf: stalk, gray-green blade with netted, impressed veins and fine pale hairs. `kind` 0 deep .. 3 young/pale. */
function nepetaLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, kind: number, dark = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 2 + ang);
  g.strokeStyle = '#7d876a';
  g.lineWidth = Math.max(1.4, len * 0.045);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.22, 0);
  g.stroke();
  g.translate(len * 0.2, 0);
  const L = len * 0.8, W = L * (0.78 + r() * 0.1);
  const [c0, c1] = LEAF[kind];
  const grad = g.createLinearGradient(0, 0, L, 0);
  grad.addColorStop(0, c0);
  grad.addColorStop(1, c1);
  crenatePath(g, L, W, 6, 0.16);
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  if (dark > 0) {
    g.fillStyle = `rgba(16,26,12,${dark})`;
    g.fillRect(-L, -L, L * 3, L * 2);
  }
  // Netted veins, impressed: dark grooves with a pale rim, so the blade looks crinkled.
  const veins = (style: string, lw: number, dy: number) => {
    g.strokeStyle = style;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(-L * 0.04, dy);
    g.lineTo(L * 0.92, dy);
    for (let k = 0; k < 4; k++) {
      const t = 0.08 + k * 0.19;
      for (const s of [-1, 1]) {
        g.moveTo(L * t, dy);
        g.quadraticCurveTo(L * (t + 0.1), s * W * 0.2 + dy, L * (t + 0.22), s * W * 0.36 * (1 - t * 0.6) + dy);
      }
    }
    g.stroke();
  };
  veins('rgba(200,212,186,0.3)', Math.max(1, L * 0.03), 1);
  veins('rgba(32,44,26,0.45)', Math.max(1, L * 0.02), 0);
  // Fine gray hairs over the blade: a soft pale speckle, denser on young leaves.
  for (let i = 0; i < L * (kind === 3 ? 1.6 : 1.0); i++) {
    g.fillStyle = `rgba(222,228,214,${0.08 + r() * 0.1})`;
    g.fillRect(r() * L, (r() - 0.5) * W, 1.3, 1.3);
  }
  g.restore();
  // A thin pale rim of hairs along the scalloped edge.
  g.strokeStyle = 'rgba(205,214,196,0.35)';
  g.lineWidth = 1.2;
  g.stroke();
  g.restore();
}

function leafTex(): THREE.Texture {
  return leafTexture('nepeta-walkers-low-leaves', 1024, 1024, (g) => {
    const r = rng('nepeta-walkers-low-leaf-tex');
    const stem = (x0: number, y0: number, len: number, bend: number, w0: number) => {
      const sx = (t: number) => x0 + bend * t * t, sy = (t: number) => y0 - len * t;
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = tone('#7c8268', '#93a07e', (i / 10) * 1.4);
        g.lineWidth = lerp(w0, w0 * 0.55, i / 10);
        g.beginPath();
        g.moveTo(sx(i / 10), sy(i / 10));
        g.lineTo(sx((i + 1) / 10), sy((i + 1) / 10));
        g.stroke();
      }
      return [sx, sy] as const;
    };
    for (let c = 0; c < 6; c++) {
      cellClip(g, c % 4, Math.floor(c / 4), 256, 512);
      const short = c >= 4;
      const len = 512 * (short ? 0.62 : 0.86), bend = (r() - 0.5) * 30;
      const nodes = short ? 4 : 6;
      const info = Array.from({ length: nodes }, (_, i) => ({ t: 0.1 + (i / nodes) * 0.84, len: (118 - i * 8) * (0.88 + r() * 0.24) }));
      const sx = (t: number) => 128 + bend * t * t, sy = (t: number) => 510 - len * t;
      // Pairs at right angles to the flat ones point toward and away from the viewer: short, behind the stem.
      for (const [i, w] of info.entries()) if (i % 2 === 1) for (const s of [-1, 1]) nepetaLeaf(g, r, sx(w.t), sy(w.t), s * (0.25 + r() * 0.2), w.len * 0.62, r() < 0.5 ? 0 : 1, 0.18);
      stem(128, 510, len, bend, 7);
      for (const [i, w] of info.entries()) {
        if (i % 2 === 1) continue;
        for (const s of [-1, 1]) nepetaLeaf(g, r, sx(w.t), sy(w.t), s * (1.05 + (r() - 0.5) * 0.35 - w.t * 0.3), w.len, r() < 0.12 ? 3 : r() < 0.55 ? 1 : 2);
        // Small leafy shoots in the axils.
        if (r() < 0.6) for (const s of [-1, 1]) nepetaLeaf(g, r, sx(w.t), sy(w.t), s * (0.45 + r() * 0.2), w.len * 0.45, 3);
      }
      // Young leaves folded together at the tip.
      for (const s of [-1, 1]) nepetaLeaf(g, r, sx(1), sy(1), s * (0.3 + r() * 0.2), 62, 3);
      g.restore();
    }
    for (let c = 0; c < 4; c++) {
      g.save();
      g.translate(512 + (c % 2) * 256, 512 + Math.floor(c / 2) * 256);
      g.beginPath();
      g.rect(1, 1, 254, 254);
      g.clip();
      stem(128, 254, 250, 0, 6);
      for (const s of [-1, 1]) nepetaLeaf(g, r, 128, 200, s * (1.1 + (r() - 0.5) * 0.3), 100 + r() * 20, c < 2 ? 1 : 2);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/* --------------------------- flower atlas --------------------------- */

/**
 * Flower atlas, 1024 x 512, eight 256 x 256 cells: one whorl of the spike
 * seen from the side, the stem running up the middle and the node at the
 * bottom third. 0..2 and 6..7 open whorls, 3 a young whorl (mostly buds),
 * 4 the tip of the spike in bud, 5 a spent whorl (calyces only).
 */
const whorlCell = (i: number): UV => rect((i % 4) * 256, Math.floor(i / 4) * 256, 256, 256, 1024, 512);

function flowerTex(blue: string, deep: string): THREE.Texture {
  return leafTexture('nepeta-walkers-low-flowers', 1024, 512, (g) => {
    const r = rng('nepeta-walkers-low-flower-tex');
    const light = tone(blue, '#e4e0fa', 0.2), dark = tone(deep, '#2a1660', 0.35);
    const calyxC = (k: number) => tone('#7f7a8e', '#6a5a86', k);
    /** A hairy, ribbed calyx tube from (0,0) pointing up the local y-axis (negative), `l` long. */
    const calyx = (l: number, open: boolean) => {
      const w = l * 0.34;
      const cg = g.createLinearGradient(0, 0, 0, -l);
      cg.addColorStop(0, '#7d8a6c');
      cg.addColorStop(0.45, calyxC(r()));
      cg.addColorStop(1, tone('#6e5a8e', '#8a7aa4', r()));
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(-w * 0.35, 0);
      g.quadraticCurveTo(-w * 0.62, -l * 0.6, -w * (open ? 0.6 : 0.42), -l);
      // Five short teeth at the mouth.
      for (let k = 0; k <= 4; k++) g.lineTo(lerp(-w * 0.6, w * 0.6, k / 4) * (open ? 1 : 0.7), -l - (k % 2 === 0 ? l * 0.1 : 0));
      g.quadraticCurveTo(w * 0.62, -l * 0.6, w * 0.35, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(210,205,225,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      for (const u of [-0.25, 0, 0.25]) {
        g.moveTo(u * w * 0.5, -l * 0.1);
        g.lineTo(u * w, -l * 0.92);
      }
      g.stroke();
    };
    /** One flower in profile from the node: calyx, curved corolla tube, small upper lip, broad spotted lower lip. */
    const flower = (x: number, y: number, ang: number, l: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      calyx(l * 0.42, true);
      // Corolla tube, slightly curved and flaring.
      const tc = tone(blue, light, 0.05 + r() * 0.25);
      g.fillStyle = tc;
      g.beginPath();
      g.moveTo(-l * 0.06, -l * 0.36);
      g.quadraticCurveTo(-l * 0.09, -l * 0.62, -l * 0.02, -l * 0.78);
      g.lineTo(l * 0.12, -l * 0.74);
      g.quadraticCurveTo(l * 0.08, -l * 0.55, l * 0.06, -l * 0.36);
      g.closePath();
      g.fill();
      // Upper lip: two small erect rounded lobes.
      g.fillStyle = tone(blue, deep, 0.1 + r() * 0.2);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(l * 0.02 + s * l * 0.07, -l * 0.86, l * 0.08, l * 0.12, s * 0.35, 0, Math.PI * 2);
        g.fill();
      }
      // Lower lip: a broad, cupped, toothed middle lobe hanging forward, two small side lobes.
      const lg = g.createRadialGradient(l * 0.08, -l * 0.74, l * 0.02, l * 0.16, -l * 0.72, l * 0.26);
      lg.addColorStop(0, light);
      lg.addColorStop(0.3, blue);
      lg.addColorStop(1, tone(blue, deep, 0.35));
      g.fillStyle = lg;
      g.beginPath();
      g.ellipse(l * 0.17, -l * 0.7, l * 0.2, l * 0.14, 0.5, 0, Math.PI * 2);
      g.fill();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(l * 0.06 + s * l * 0.1, -l * 0.76, l * 0.07, l * 0.05, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Dark violet spots on the lower lip.
      g.fillStyle = dark;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.arc(l * (0.1 + r() * 0.16), -l * (0.66 + r() * 0.1), Math.max(1, l * 0.018), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    const bud = (x: number, y: number, ang: number, l: number, show: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      if (show > 0) {
        g.fillStyle = tone(blue, deep, 0.3 + r() * 0.3);
        g.beginPath();
        g.ellipse(0, -l * (0.5 + show * 0.2), l * 0.1, l * (0.16 + show * 0.12), 0, 0, Math.PI * 2);
        g.fill();
      }
      calyx(l * 0.55, false);
      g.restore();
    };
    const stalk = (cx: number) => {
      g.strokeStyle = '#8c967c';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, 255);
      g.lineTo(cx, 0);
      g.stroke();
    };
    const bracts = (cx: number, y: number) => {
      // A pair of tiny leafy bracts under the whorl.
      for (const s of [-1, 1]) {
        g.save();
        g.translate(cx, y);
        g.rotate(s * 1.15);
        g.fillStyle = tone('#6f7c62', '#879479', r());
        g.beginPath();
        g.ellipse(0, -16, 6, 16, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    };
    for (let c = 0; c < 8; c++) {
      cellClip(g, c % 4, Math.floor(c / 4), 256, 256);
      const cx = 128, node = 172;
      stalk(cx);
      if (c === 4) {
        // The spike tip: a tight, tapering cluster of buds in gray-violet calyces.
        for (let k = 0; k < 16; k++) {
          const t = k / 15;
          const y = lerp(214, 40, t);
          const spread = lerp(40, 8, t);
          bud(cx + (r() - 0.5) * spread * 2, y, (r() - 0.5) * 1.0, lerp(70, 38, t), t < 0.4 ? 0.6 : t < 0.7 ? 0.3 : 0);
        }
        g.restore();
        continue;
      }
      bracts(cx, node + 4);
      const spent = c === 5, young = c === 3;
      // Back row first (shorter, foreshortened), then the flowers facing out to the sides.
      const n = spent ? 9 : young ? 10 : 8 + (c % 3);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const side = u < 0.5 ? -1 : 1;
        const ang = side * lerp(0.15, 1.15, Math.abs(u - 0.5) * 2) + (r() - 0.5) * 0.25;
        const l = (spent ? 64 : 118) * (0.85 + r() * 0.25) * (k % 2 ? 0.86 : 1);
        if (spent) bud(cx + (r() - 0.5) * 10, node, ang, l, 0);
        else if (young && r() < 0.7) bud(cx + (r() - 0.5) * 10, node, ang * 0.7, l * 0.62, 0.4 + r() * 0.6);
        else if (r() < 0.12) bud(cx + (r() - 0.5) * 10, node, ang * 0.8, l * 0.6, 0.7);
        else flower(cx + (r() - 0.5) * 10, node, ang, l);
      }
      // One or two facing the viewer: the broad lower lip seen from the front.
      if (!spent && !young) {
        for (let k = 0; k < (c % 2) + 1; k++) {
          const fx = cx + (r() - 0.5) * 30, fy = node - 66 - r() * 18;
          g.fillStyle = light;
          g.beginPath();
          g.ellipse(fx, fy + 8, 22, 15, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = tone(blue, light, 0.2);
          for (const s of [-1, 1]) {
            g.beginPath();
            g.ellipse(fx + s * 10, fy - 10, 9, 12, s * 0.3, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = tone(light, '#ffffff', 0.4);
          g.beginPath();
          g.ellipse(fx, fy + 2, 6, 4.5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = dark;
          for (let q = 0; q < 8; q++) {
            g.beginPath();
            g.arc(fx + (r() - 0.5) * 22, fy + 4 + r() * 14, 1.6, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      g.restore();
    }
    hardenAlpha(g, 1024, 512);
  });
}

/* ------------------------------ builder ------------------------------ */

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const L = 0.1;

  // The leafy mound is about half the height; the flower spikes rise out of it and lean outward.
  const m = growMound(r, { H: H * 0.55, Sp: Sp * 0.98, points: 270, stems: 16, perLimb: 7, centerY: 0.26, under: -0.6, power: 2.5, lump: 0.1, rough: 0.14, stemRadius: 0.0045, crown: 0.06, arch: 0.04, gnarl: 0.2, twigSegs: 1, early: 0.62 });
  const crownC = col('#6f6a56'), stemC = col('#7f8a6c'), twigC = col('#8e9a7c');
  moundWood(wood, m, (b) => (b.level === 0 ? crownC : b.level === 1 ? stemC : twigC), { uvScale: 2, sides: [5, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.52, 1, Math.pow(d, 1.8)) * lerp(0.8, 1, clamp(p.y / (m.H * 0.6))) * (1 - inner * 0.28);
    return jitter(col('#eef0e8'), r, 0.015, 0.04, 0.04).multiplyScalar(shade * (0.88 + r() * 0.14));
  };

  const spikeC = col('#76825f');
  /** A flowering stem: leafy for its lower 40 percent, then whorls set farther apart low down and crowded toward the bud tip. */
  const flowerStem = (base: THREE.Vector3, out: THREE.Vector3, birth: number) => {
    const rad = V(base.x, 0, base.z);
    const rho = clamp(rad.length() / (m.Sp / 2));
    rad.lengthSq() > 1e-8 ? rad.normalize() : rad.set(1, 0, 0);
    const az = Math.atan2(rad.z, rad.x) + (r() - 0.5) * 0.5;
    // Center stems stand nearly upright; outer ones lean out and arch over a little at the tip.
    const lean0 = lerp(0.15, 1.0, Math.pow(rho, 1.3)) + (r() - 0.5) * 0.3 + Math.max(0, -out.y) * 0.3;
    const lean1 = lean0 + 0.15 + r() * 0.3;
    const len = H * (0.36 + r() * 0.14) * lerp(1, 0.72, rho);
    const pts = arcPath(base, az, Math.max(0.05, lean0), lean1, len, 6, r, 0.08);
    const sw = (p: THREE.Vector3) => clamp(m.sway(base) + (p.distanceTo(base) / len) * 0.7);
    tube(wood, pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1), 0.0016, 0.001, 3, spikeC, birth, base, (i) => sw(pts[Math.min(pts.length - 1, i * 2)]), 1);
    // Leaf pairs on the lower stem, each pair a quarter turn from the last.
    const t0 = 0.4 + r() * 0.08;
    let roll = r() * TAU;
    for (let k = 0; k < 5; k++) {
      const t = lerp(0.04, t0 - 0.03, k / 4);
      const at = along(pts, t);
      roll += Math.PI / 2;
      const a = perp(at.dir);
      const face = a.clone().applyAxisAngle(at.dir, roll);
      const sz = 0.065 * lerp(1, 0.7, k / 4) * (0.85 + r() * 0.3);
      leafQuad(leaves, at.p.clone().addScaledVector(at.dir, -sz * 0.2), at.dir, face, sz, sz, pairCell(Math.floor(r() * 4)), tint(at.p, 0).multiplyScalar(1.04), birth, base, { segs: 1, sway0: sw(at.p), sway1: sw(at.p) });
    }
    // The whorls.
    const n = 9 + Math.floor(r() * 4);
    const spentLow = r() < 0.35 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const t = lerp(t0, 0.985, 1 - Math.pow(1 - u, 1.45));
      const at = along(pts, t);
      const wl = lerp(0.026, 0.014, u) * (0.9 + r() * 0.2);
      const cell = k === n - 1 ? 4 : k >= n - 3 ? 3 : k < spentLow ? 5 : [0, 1, 2, 6, 7][Math.floor(r() * 5)];
      const b0 = at.p.clone().addScaledVector(at.dir, -wl * 0.33);
      const f1 = perp(at.dir).applyAxisAngle(at.dir, r() * Math.PI), f2 = V().crossVectors(at.dir, f1).normalize();
      const c = jitter(col('#ffffff', 0.9 + r() * 0.12), r, 0.01, 0.03, 0.03);
      const s = sw(at.p);
      for (const f of [f1, f2]) leafQuad(flowers, b0, at.dir, f, wl, wl * (cell === 4 ? 0.8 : 1.1), whorlCell(cell), c, clamp(birth + (k > n - 3 ? 0.02 : 0)), base, { segs: 1, sway0: s, sway1: clamp(s + 0.04), center: m.center, radii: V(m.radii.x * 1.6, H, m.radii.z * 1.6), normalBend: 0.25 });
    }
    return pts;
  };

  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    for (let k = 0; k < 5; k++) {
      const at = along(tw.pts, lerp(0.3, 1, (k + r() * 0.8) / 5)).p;
      const dir = sprigDir(r, out, 0.25 + r() * 0.6, 0.45);
      const len = L * (0.75 + r() * 0.45);
      sprig(leaves, r, m, at, dir, len, len * 0.5, shootCell(Math.floor(r() * 4)), tint(at, 0.1), born(), { cross: k % 2 === 0, curl: (r() - 0.3) * 0.5, faceOut: 0.72 });
    }
    const dir = out.clone().lerp(UP, 0.45).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    sprig(leaves, r, m, end, dir, L * (0.6 + r() * 0.25), L * 0.36, shootCell(4 + Math.floor(r() * 2)), tint(end, 0), tw.birth, { cross: true, curl: 0.1, faceOut: 0.4 });
    // Flowering stems from the shoot tips over the top and the upper sides of the mound.
    if (out.y > -0.25) {
      const ns = out.y > 0.35 ? (r() < 0.55 ? 2 : 1) : r() < 0.8 ? 1 : 0;
      for (let k = 0; k < ns; k++) {
        const base = along(tw.pts, 0.35 + r() * 0.45).p.add(V((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02));
        flowerStem(base, out, clamp(tw.birth + (k ? 0.05 + r() * 0.3 : 0.02), 0, 0.9));
      }
    }
  }
  // Inner foliage along the limbs so the mound is not hollow.
  for (const b of m.limbs) {
    for (let k = 0; k < 6; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.6 + r() * 0.7, 0.4);
      sprig(leaves, r, m, at, dir, L * 1.15, L * 0.6, shootCell(Math.floor(r() * 4)), tint(at, 1), b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower ?? '#7c7ad0', spec.flower2 ?? '#5048a8'),
    bark: { map: stemBark('nepeta', 0.15) },
    look: { translucency: 0.3, leafRoughness: 0.88, bend: 0.1, flutter: 0.012 },
  };
};

