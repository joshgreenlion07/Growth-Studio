import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, jitter, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { arcPath, bezPath, crossCards, fitToSize, funnelFlower, sheet, stemBark } from './shared-perennials';
import { inCell, rect, type UV } from '../groundcover/shared-groundcovers';

/**
 * Polyanthus primrose, Primula x polyantha (bedding strains such as Pacific
 * Giants), red with a yellow eye, as sold in 4 in pots for winter color.
 *
 * A flat rosette of tongue-shaped leaves, narrow at the base where they run
 * into a pale winged stalk and broadest near the rounded tip, heavily
 * crinkled (the blade puckers between sunken veins), the margin finely and
 * irregularly toothed; bright mid green with a pale midrib. Out of the
 * middle rise short stout stalks carrying loose umbels of flat, five-petaled
 * flowers, each petal notched at the tip, scarlet red with a sharp golden
 * yellow star in the middle, held just above the leaves; some flowers come
 * singly on their own stalks, with green calyx-wrapped buds among them.
 *
 * References and the numbers they give:
 * - NVK Nurseries, Primula polyantha 'Pacific Giant Mix', red
 *   (nvknurseries.com/plant/Primula-polyantha-Red-Pacific-Giant-Mix):
 *   15 to 20 cm (6 to 8 in) tall and wide; flowers about 5 cm (2 in)
 *   across, red with a yellow eye, in clusters on short sturdy stems just
 *   above the foliage; leaves dark green, oval, heavily corrugated.
 * - Royal Horticultural Society, Primula 'Crescendo Bright Red' (Pr/Poly)
 *   (rhs.org.uk/plants/124252): umbels of bright red flowers with a large
 *   yellow eye in late winter and spring; basal rosette of simple leaves.
 * - NC State Extension Plant Toolbox, Primula x polyantha
 *   (plants.ces.ncsu.edu/plants/primula-x-polyantha/): a clumping
 *   rosette perennial grown as an annual in warm summers; flowers solitary
 *   or in umbels on erect stems; late winter into spring.
 * - The job photo (a finished job, early February, dusk): a 4 in pot plant
 *   in a corten planter, bright green crinkled leaves in a low rosette with
 *   eight or so 1 to 1.5 in flowers just above them.
 * Size used: installed from a 4 in pot at 0.12 m tall (with flowers) x
 * 0.18 m wide; 0.18 x 0.25 m by the end of its first season.
 */

/* ---------------------------- leaf atlas ---------------------------- */

const LW = 1024, LH = 512, CW = 256;
/** Leaf atlas: four 256 x 512 cells, the leaf base at the cell bottom, the tip at the top. */
const leafCell = (i: number): UV => rect(i * CW, 0, CW, LH, LW, LH);

function primroseLeaves(): THREE.Texture {
  return leafTexture('primrose-red-leaves', LW, LH, (g) => {
    const r = rng('primrose-leaf-tex');
    const looks: [string, string, string][] = [
      ['#80aa58', '#3f7c25', '#4d8a2e'],
      ['#78a250', '#3a7522', '#47842a'],
      ['#86b05c', '#468430', '#559434'],
      ['#8cb862', '#4f8e34', '#5f9c3c'],
    ];
    for (let c = 0; c < 4; c++) {
      inCell(g, c * CW, 0, CW, LH, (w, h) => {
        const [stalk, body, tipCol] = looks[c];
        const cx = w / 2;
        // Tongue outline: winged stalk, broadest about 70 % up, rounded tip, small irregular teeth.
        const N = 60;
        const prof = (t: number) => {
          const wing = 0.13 + 0.87 * Math.pow(clamp(t / 0.72), 1.35);
          const tip = t > 0.72 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.72) / 0.28, 2))) : 1;
          return Math.min(wing, tip);
        };
        const right: [number, number][] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const tooth = t > 0.25 && t < 0.98 ? 1 + 0.035 * (1 - ((t * 34 + c) % 1)) + 0.02 * Math.sin(t * 9 + c) : 1;
          right.push([(w * 0.46) * prof(t) * tooth, h - 2 - t * (h - 8)]);
        }
        g.beginPath();
        g.moveTo(cx, h - 2);
        for (const [x, y] of right) g.lineTo(cx + x, y);
        for (let i = right.length - 1; i >= 0; i--) g.lineTo(cx - right[i][0], right[i][1]);
        g.closePath();
        const gr = g.createLinearGradient(0, h, 0, 0);
        gr.addColorStop(0, stalk);
        gr.addColorStop(0.3, body);
        gr.addColorStop(1, tipCol);
        g.fillStyle = gr;
        g.fill();
        g.save();
        g.clip();
        // Puckered blade: raised cushions between the veins, lit on one side, shaded on the other.
        for (let i = 0; i < 900; i++) {
          const x = cx + (r() - 0.5) * w * 0.9, y = h * (0.05 + r() * 0.75);
          const rad = 2.5 + r() * 4.5;
          // Each cushion: a lit upper edge and a shaded lower one.
          g.fillStyle = `rgba(20,55,10,${0.08 + r() * 0.08})`;
          g.beginPath();
          g.ellipse(x + 1.5, y + 1.5, rad, rad * 0.75, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(190,230,140,${0.07 + r() * 0.08})`;
          g.beginPath();
          g.ellipse(x - 1, y - 1, rad * 0.7, rad * 0.5, 0, 0, Math.PI * 2);
          g.fill();
        }
        // Sunken pale veins: forward-angled laterals and a network between them.
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(170,210,120,0.55)';
        g.lineWidth = 1.6;
        for (let k = 0; k < 13; k++) {
          const y0 = h * (0.86 - k * 0.062);
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx, y0);
            g.quadraticCurveTo(cx + s * w * 0.18, y0 - h * 0.03, cx + s * w * 0.42, y0 - h * 0.09);
            g.stroke();
          }
        }
        g.strokeStyle = 'rgba(25,60,15,0.18)';
        g.lineWidth = 1;
        for (let k = 0; k < 140; k++) {
          const x = cx + (r() - 0.5) * w * 0.8, y = h * (0.08 + r() * 0.72);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 22, y + (r() - 0.5) * 22);
          g.stroke();
        }
        g.restore();
        // Broad pale midrib running out of the stalk.
        const mid = g.createLinearGradient(0, h, 0, 0);
        mid.addColorStop(0, 'rgba(205,230,170,0.95)');
        mid.addColorStop(0.5, 'rgba(185,220,145,0.75)');
        mid.addColorStop(1, 'rgba(170,210,130,0.3)');
        g.strokeStyle = mid;
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx, h);
        g.lineTo(cx, h * 0.06);
        g.stroke();
      });
    }
  });
}

/* --------------------------- flower atlas --------------------------- */

const FS = 256;
/** Flower atlas, 2 x 2 cells of 256: three flower faces and a bud. */
const flowerCell = (i: number): UV => rect((i % 2) * FS, Math.floor(i / 2) * FS, FS, FS, FS * 2, FS * 2);

function primroseFlowers(red: string, eye: string): THREE.Texture {
  return leafTexture(`primrose-red-flowers-${red}-${eye}`, FS * 2, FS * 2, (g) => {
    const r = rng('primrose-flower-tex');
    const R = new THREE.Color(red), Y = new THREE.Color(eye);
    const css = (c: THREE.Color) => `#${c.getHexString()}`;
    const face = (k: number) => {
      const cx = FS / 2, cy = FS / 2, rad = FS * 0.47;
      const tone = R.clone().multiplyScalar(k === 2 ? 0.82 : k === 1 ? 0.92 : 1);
      // Five broad petals, each notched at the tip, overlapping into a flat disc.
      const spin = r() * 6.28;
      for (let p = 0; p < 5; p++) {
        const a = spin + (p / 5) * Math.PI * 2;
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        const gr = g.createRadialGradient(0, 0, rad * 0.15, 0, 0, rad);
        gr.addColorStop(0, css(tone.clone().multiplyScalar(0.7)));
        gr.addColorStop(0.45, css(tone));
        gr.addColorStop(1, css(tone.clone().multiplyScalar(0.86)));
        g.fillStyle = gr;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.ellipse(rad * 0.56, s * rad * 0.17, rad * 0.43, rad * 0.3, s * 0.32, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.ellipse(rad * 0.4, 0, rad * 0.36, rad * 0.34, 0, 0, Math.PI * 2);
        g.fill();
        // Faint veins and the shadow line of the notch.
        g.strokeStyle = 'rgba(90,0,10,0.25)';
        g.lineWidth = 1.2;
        for (const d of [-0.18, 0, 0.18]) {
          g.beginPath();
          g.moveTo(rad * 0.2, 0);
          g.lineTo(rad * 0.9, d * rad);
          g.stroke();
        }
        g.restore();
      }
      // The yellow eye: a five-pointed star whose points run into the petals, a thin deeper ring, a green-gold throat.
      g.save();
      g.translate(cx, cy);
      g.rotate(spin);
      g.beginPath();
      for (let q = 0; q <= 10; q++) {
        const a = (q / 10) * Math.PI * 2;
        const rr = rad * (q % 2 === 0 ? 0.37 : 0.24);
        if (q === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      const ey = g.createRadialGradient(0, 0, 0, 0, 0, rad * 0.37);
      ey.addColorStop(0, css(Y.clone().lerp(new THREE.Color('#c88a00'), 0.4)));
      ey.addColorStop(0.5, css(Y));
      ey.addColorStop(1, css(Y.clone().lerp(new THREE.Color('#ffe060'), 0.3)));
      g.fillStyle = ey;
      g.fill();
      g.strokeStyle = 'rgba(150,40,0,0.35)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#7d8a28';
      g.beginPath();
      g.arc(0, 0, rad * 0.06, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    for (let k = 0; k < 3; k++) {
      inCell(g, (k % 2) * FS, Math.floor(k / 2) * FS, FS, FS, () => face(k));
    }
    // A bud from the side: red tip from a pale green, ribbed calyx. Base at the cell bottom.
    inCell(g, FS, FS, FS, FS, (w, h) => {
      const x = w / 2;
      g.fillStyle = css(R.clone().multiplyScalar(0.8));
      g.beginPath();
      g.ellipse(x, h * 0.35, w * 0.16, h * 0.26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7fa856';
      g.beginPath();
      g.moveTo(x - w * 0.07, h);
      g.quadraticCurveTo(x - w * 0.24, h * 0.6, x - w * 0.19, h * 0.42);
      g.lineTo(x - w * 0.1, h * 0.5);
      g.lineTo(x, h * 0.38);
      g.lineTo(x + w * 0.1, h * 0.5);
      g.lineTo(x + w * 0.19, h * 0.42);
      g.quadraticCurveTo(x + w * 0.24, h * 0.6, x + w * 0.07, h);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(60,100,30,0.6)';
      g.lineWidth = 2;
      for (const d of [-0.08, 0, 0.08]) {
        g.beginPath();
        g.moveTo(x + d * w * 0.5, h);
        g.lineTo(x + d * w * 1.6, h * 0.48);
        g.stroke();
      }
    });
  });
}

/* ----------------------------- geometry ----------------------------- */

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const k = Sp / 0.25, ky = H / 0.18;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const crown = V(0, 0.006 * ky, 0);

  // Rosette: young leaves stand up in the middle, older ones lie flat with their tips on the soil.
  const NL = 24;
  for (let i = 0; i < NL; i++) {
    const f = (i + 0.5) / NL; // 0 young/inner .. 1 old/outer
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const out = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const len = lerp(0.1, 0.12, Math.pow(f, 0.6)) * (0.9 + r() * 0.2) * k;
    const W = len * (0.46 + r() * 0.06);
    const e0 = lerp(1.38, 0.72, f) + (r() - 0.5) * 0.15;
    const droop = lerp(0.85, 1.25, f) + r() * 0.25;
    const base = V(Math.cos(az) * 0.006 * k, 0.004 * ky, Math.sin(az) * 0.006 * k);
    const rows = 7, cols = 5;
    const ph = r() * 6.28, crinkle = (0.0028 + r() * 0.0012) * k, cup = 0.12 + r() * 0.12, twist = (r() - 0.5) * 0.4;
    const grid: THREE.Vector3[][] = [];
    const p = base.clone();
    for (let a = 0; a < rows; a++) {
      const t = a / (rows - 1);
      const e = e0 - droop * Math.pow(t, 1.3);
      const d = out.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0));
      if (a > 0) p.addScaledVector(d, len / (rows - 1));
      let up = V().crossVectors(side, d).normalize().multiplyScalar(-1);
      if (up.y < 0) up.multiplyScalar(-1);
      const s = side.clone().applyAxisAngle(d, twist * t);
      const row: THREE.Vector3[] = [];
      for (let b = 0; b < cols; b++) {
        const x = b / (cols - 1) - 0.5;
        const edge = Math.abs(x) * 2;
        const blade = clamp((t - 0.15) / 0.3);
        // The blade cups along the midrib and puckers into small waves at the margin.
        const lift = (edge * edge * cup * W * 0.5 + Math.sin(t * 17 + ph + x * 9) * crinkle * (0.4 + edge)) * blade;
        row.push(p.clone().addScaledVector(s, x * W).addScaledVector(up, lift));
      }
      grid.push(row);
    }
    // Keep the old leaves' tips on or just above the soil.
    for (const row of grid) for (const q of row) q.y = Math.max(q.y, 0.004 * ky);
    const tone = jitter(col('#ffffff', lerp(1, 0.8, f) * (0.9 + r() * 0.14)), r, 0.012, 0.05, 0.03);
    const birth = i < 6 && i % 2 === 1 ? clamp(0.3 + r() * 0.4, 0, 0.85) : i >= NL - 4 ? clamp(0.4 + r() * 0.4, 0, 0.85) : 0;
    const sw = (a: number) => clamp(Math.pow(a / (rows - 1), 1.4) * lerp(0.4, 0.2, f));
    sheet(leaves, grid, leafCell(i % 4), (a) => tone.clone().multiplyScalar(lerp(0.78, 1, clamp(a / 3))), birth, birth > 0 ? crown : base, sw);
  }

  // Flowers: stalks from the crown, some carrying a loose umbel, some a single flower.
  const stalkCol = col('#86a65e'), calyxCol = col('#6f9a48');
  const flower = (at: THREE.Vector3, nrm: THREE.Vector3, birth: number, anchor: THREE.Vector3, sway: number) => {
    const rad = (0.021 + r() * 0.004) * k;
    const tone = jitter(col('#ffffff', 0.9 + r() * 0.1), r, 0.006, 0.03, 0.02);
    funnelFlower(flowers, at, nrm, rad, rad * 0.18, flowerCell(Math.floor(r() * 3)), tone, birth, anchor, sway, 8, r() * 6.28);
    // The tubular green calyx behind the flower.
    tube(wood, [at.clone().addScaledVector(nrm, -0.012 * k), at.clone().addScaledVector(nrm, -rad * 0.15)], 0.0028 * k, 0.0034 * k, 5, calyxCol, birth, anchor, () => sway, 1);
  };
  const bud = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, anchor: THREE.Vector3, sway: number) => {
    crossCards(flowers, at, dir, 0.017 * k, 0.017 * k, flowerCell(3), col('#ffffff', 0.92), birth, anchor, 2, r() * 3, { sway0: sway, sway1: sway, normalBend: 0 });
  };
  const scapes: { n: number; h: number; lean: number; birth: number; single: boolean }[] = [
    { n: 5, h: 0.112, lean: 0.12, birth: 0, single: false },
    { n: 4, h: 0.1, lean: 0.36, birth: 0, single: false },
    { n: 4, h: 0.098, lean: 0.4, birth: 0, single: false },
    { n: 1, h: 0.125, lean: 0.5, birth: 0, single: true },
    { n: 1, h: 0.118, lean: 0.55, birth: 0, single: true },
    { n: 1, h: 0.13, lean: 0.3, birth: 0, single: true },
    { n: 4, h: 0.105, lean: 0.45, birth: 0.45, single: false },
    { n: 1, h: 0.12, lean: 0.6, birth: 0.6, single: true },
    { n: 1, h: 0.115, lean: 0.5, birth: 0.35, single: true },
  ];
  scapes.forEach((sc, i) => {
    const az = i * 2.39996 + 0.9 + (r() - 0.5) * 0.4;
    const out = V(Math.cos(az), 0, Math.sin(az));
    const base = V(Math.cos(az) * 0.004 * k, 0.004 * ky, Math.sin(az) * 0.004 * k);
    const L = (sc.h * 0.9 + (r() - 0.5) * 0.012) * ky;
    const pts = arcPath(base, az, sc.lean * 0.6, sc.lean * (sc.single ? 1.5 : 1.1), L, 5, r, 0.06);
    const top = pts[pts.length - 1];
    const anchor = sc.birth > 0 ? crown : base;
    const swTop = 0.55 + r() * 0.2;
    tube(wood, pts, (sc.single ? 0.0016 : 0.0024) * k, 0.0016 * k, 4, stalkCol, sc.birth, anchor, (q) => swTop * Math.pow(q / 5, 1.4), 1);
    const dir = top.clone().sub(pts[pts.length - 2]).normalize();
    if (sc.single) {
      flower(top, dir.clone().lerp(UP, 0.35).add(out.clone().multiplyScalar(0.2)).normalize(), sc.birth, anchor, swTop);
      return;
    }
    // Umbel: short pedicels fanning out from the top of the stalk, plus a bud or two.
    let a = r() * 6.28;
    for (let q = 0; q < sc.n + 1; q++) {
      a += (Math.PI * 2) / (sc.n + 1) + (r() - 0.5) * 0.5;
      const pd = deflect(UP, 0.75 + r() * 0.35, a).add(out.clone().multiplyScalar(0.25)).normalize();
      const pl = (0.026 + r() * 0.012) * k;
      const end = top.clone().addScaledVector(pd, pl);
      tube(wood, bezPath(top, top.clone().addScaledVector(pd, pl * 0.4).add(V(0, pl * 0.3, 0)), end, 2), 0.0011 * k, 0.0009 * k, 3, stalkCol, sc.birth, anchor, () => swTop, 1);
      if (q === sc.n) bud(end, pd.clone().lerp(UP, 0.4).normalize(), sc.birth, anchor, swTop);
      else flower(end, pd.clone().lerp(UP, 0.5).normalize(), sc.birth, anchor, swTop);
    }
  });

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: primroseLeaves(),
    flowerMap: primroseFlowers(spec.flower ?? '#cf1020', spec.flower2 ?? '#f5c400'),
    bark: { map: stemBark() },
    look: { translucency: 0.4, leafRoughness: 0.66, bend: 0.025, flutter: 0.004 },
  };
};
