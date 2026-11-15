import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, leafQuad, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { TAU, fitMat, flatCard, inCell, lay, rect, type UV } from './shared-groundcovers';

/**
 * Bronze ajuga, modeled on Ajuga reptans 'Bronze Beauty': a flat evergreen
 * mat of overlapping rosettes that spreads by stolons. Leaves are glossy,
 * crinkled and spoon-shaped, 2 to 3 in long, deep bronze-purple with dark
 * green in the older and shaded leaves. In bloom, upright 4 to 5 in spikes
 * carry whorls of blue-violet two-lipped flowers between bronze bracts.
 */

const LW = 1024, LH = 1024;
/** Leaf atlas: six single leaves (256 x 512) and one whole young rosette seen from above (512 x 512). */
const LEAF_UV: UV[] = [0, 1, 2, 3].map((i) => rect(i * 256, 0, 256, 512, LW, LH)).concat([0, 1].map((i) => rect(i * 256, 512, 256, 512, LW, LH)));
const ROSETTE_UV: UV = rect(512, 512, 512, 512, LW, LH);

interface Tone { base: string; mid: string; tip: string; sheen: string }
const TONES: Tone[] = [
  { base: '#1f2a17', mid: '#301b25', tip: '#3a1d2a', sheen: 'rgba(150,120,140,' }, // bronze-purple
  { base: '#232216', mid: '#33201e', tip: '#3d2223', sheen: 'rgba(160,125,130,' }, // bronze-burgundy
  { base: '#1e2b18', mid: '#2c251d', tip: '#352320', sheen: 'rgba(145,130,135,' }, // chocolate-bronze
  { base: '#1d2f17', mid: '#25321e', tip: '#322426', sheen: 'rgba(135,150,120,' }, // dark green flushed bronze
  { base: '#291a22', mid: '#3a1e2d', tip: '#442234', sheen: 'rgba(170,125,155,' }, // young, brighter purple
  { base: '#1b2916', mid: '#21331b', tip: '#2a2a20', sheen: 'rgba(130,150,120,' }, // old shaded green
];

/** Half width of the spoon-shaped leaf at t along its length (0 base .. 1 tip), as a fraction of the full half width. */
function spoon(t: number): number {
  const petiole = 0.16 + 0.1 * t;
  const x = clamp((t - 0.2) / 0.8);
  const blade = x < 0.6 ? Math.pow(Math.sin((Math.PI / 2) * (x / 0.6)), 0.7) : Math.sqrt(Math.max(0, 1 - ((x - 0.6) / 0.4) ** 2));
  return lerp(petiole, 1, clamp((t - 0.18) / 0.3)) * (t > 0.2 ? (t < 0.6 ? Math.max(blade, 0.18) : blade) : 1);
}

/** One crinkled spoon-shaped leaf, base at (x, y), pointing along `ang`. */
function spoonLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, wid: number, tone: Tone) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const hw = wid / 2, N = 44;
  const edge = (t: number, s: number) => {
    // Shallow scallops along the blade margin.
    const scallop = t > 0.3 ? 1 + 0.045 * Math.sin(t * 34 + s) : 1;
    return hw * spoon(t) * scallop;
  };
  g.beginPath();
  g.moveTo(0, -edge(0, 1));
  for (let i = 1; i <= N; i++) g.lineTo((i / N) * len, -edge(i / N, 1));
  for (let i = N; i >= 0; i--) g.lineTo((i / N) * len, edge(i / N, -1));
  g.closePath();
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, tone.base);
  gr.addColorStop(0.45, tone.mid);
  gr.addColorStop(1, tone.tip);
  g.fillStyle = gr;
  g.fill();
  g.save();
  g.clip();
  // Blistered (bullate) surface: a glossy pucker in each bay between the side veins.
  const pairs = 5;
  for (let i = 0; i < pairs; i++) {
    const t0 = 0.3 + (i / pairs) * 0.62, t1 = 0.3 + ((i + 1) / pairs) * 0.62;
    for (const s of [-1, 1]) {
      const cx = len * ((t0 + t1) / 2 + 0.05), cy = s * hw * spoon((t0 + t1) / 2) * 0.48;
      const rad = hw * 0.36;
      const pg = g.createRadialGradient(cx - rad * 0.2, cy - rad * 0.25, 0, cx, cy, rad);
      pg.addColorStop(0, tone.sheen + (0.2 + r() * 0.12) + ')');
      pg.addColorStop(0.6, tone.sheen + '0.05)');
      pg.addColorStop(1, tone.sheen + '0)');
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(cx, cy, rad * 1.25, rad * 0.8, s * 0.5, 0, TAU);
      g.fill();
    }
  }
  // Sunken veins: dark line with a faint light edge beside it.
  const veins = (dx: number, style: string, lw: number) => {
    g.strokeStyle = style;
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, dx);
    g.lineTo(len * 0.95, dx);
    for (let i = 0; i <= pairs; i++) {
      const t = 0.27 + (i / pairs) * 0.6;
      for (const s of [-1, 1]) {
        g.moveTo(len * t, dx);
        g.quadraticCurveTo(len * (t + 0.08), s * hw * spoon(t + 0.08) * 0.55 + dx, len * (t + 0.15), s * hw * spoon(Math.min(1, t + 0.15)) * 0.9 + dx);
      }
    }
    g.stroke();
  };
  veins(len * 0.012, 'rgba(170,140,150,0.12)', len * 0.012);
  veins(0, 'rgba(18,10,14,0.6)', len * 0.014);
  // Darker rolled-under rim.
  g.restore();
  g.strokeStyle = 'rgba(20,12,16,0.55)';
  g.lineWidth = len * 0.014;
  g.stroke();
  g.restore();
}

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-ajuga-leaves', LW, LH, (g) => {
    const r = rng('gc-ajuga-leaves');
    for (let c = 0; c < 6; c++) {
      inCell(g, (c % 4) * 256, Math.floor(c / 4) * 512, 256, 512, (w, h) => {
        spoonLeaf(g, r, w / 2, h * 0.99, -Math.PI / 2, h * 0.97, w * (0.8 + r() * 0.1), TONES[c]);
      });
    }
    inCell(g, 512, 512, 512, 512, (w, h) => {
      // A rosette from above: decussate pairs, each pair turned 90 degrees, shrinking toward the center.
      const tiers = [{ n: 4, len: 0.47, rot: 0.2 }, { n: 4, len: 0.36, rot: 0.2 + Math.PI / 4 }, { n: 2, len: 0.22, rot: 0.9 }, { n: 2, len: 0.13, rot: 0.9 + Math.PI / 2 }];
      tiers.forEach((T, ti) => {
        for (let k = 0; k < T.n; k++) {
          const a = T.rot + (k / T.n) * TAU + (r() - 0.5) * 0.25;
          const tone = ti >= 2 ? TONES[4] : TONES[Math.floor(r() * 4)];
          spoonLeaf(g, r, w / 2 + Math.cos(a) * w * 0.012, h / 2 + Math.sin(a) * h * 0.012, a, w * T.len * (0.92 + r() * 0.12), w * T.len * 0.5, tone);
        }
      });
    });
  });
}

const FW = 512, FH = 512;
const SPIKE_UV: UV[] = [rect(0, 0, 170, 512, FW, FH), rect(170, 0, 170, 512, FW, FH)];
const WHORL_UV: UV[] = [rect(340, 0, 172, 172, FW, FH), rect(340, 172, 172, 172, FW, FH)];

/** One two-lipped ajuga flower from the side or front: short tube, big three-lobed lower lip. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, s: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const blues = ['#4a45c2', '#5650cf', '#4338b0', '#6258d6'];
  g.fillStyle = blues[Math.floor(r() * blues.length)];
  // Tube.
  g.beginPath();
  g.ellipse(s * 0.25, 0, s * 0.3, s * 0.13, 0, 0, TAU);
  g.fill();
  // Lower lip: a broad notched middle lobe and two side lobes.
  for (const [a, l, w] of [[0, 0.62, 0.3], [-0.75, 0.42, 0.2], [0.75, 0.42, 0.2]] as const) {
    g.save();
    g.translate(s * 0.45, 0);
    g.rotate(a);
    g.beginPath();
    g.ellipse(s * l * 0.5, 0, s * l * 0.55, s * w, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  // Darker veins and a pale throat.
  g.strokeStyle = 'rgba(40,25,120,0.8)';
  g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath();
  for (const a of [-0.18, 0, 0.18]) {
    g.moveTo(s * 0.45, 0);
    g.lineTo(s * 0.45 + Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
  }
  g.stroke();
  g.fillStyle = 'rgba(205,200,250,0.85)';
  g.beginPath();
  g.ellipse(s * 0.5, 0, s * 0.09, s * 0.06, 0, 0, TAU);
  g.fill();
  g.restore();
}

function bract(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, purple: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.3, -len * 0.34, len * 0.8, -len * 0.26, len, 0);
  g.bezierCurveTo(len * 0.8, len * 0.26, len * 0.3, len * 0.34, 0, 0);
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, '#34402a');
  gr.addColorStop(1, purple > 0.5 ? '#5a2e4c' : '#473040');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(20,12,18,0.6)';
  g.lineWidth = Math.max(1, len * 0.03);
  g.stroke();
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.9, 0);
  g.stroke();
  g.restore();
}

function flowerAtlas(): THREE.Texture {
  return leafTexture('gc-ajuga-flowers', FW, FH, (g) => {
    const r = rng('gc-ajuga-flowers');
    for (let c = 0; c < 2; c++) {
      inCell(g, c * 170, 0, 170, 512, (w, h) => {
        // Side view of a spike: square stem, six to eight whorls closing up toward the top.
        const cx = w / 2;
        g.strokeStyle = '#4a3340';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx, h);
        g.lineTo(cx, h * 0.08);
        g.stroke();
        const whorls = 7 + c;
        for (let i = 0; i < whorls; i++) {
          const t = i / (whorls - 1);
          const y = lerp(h * 0.86, h * 0.07, Math.pow(t, 0.85));
          const reach = lerp(w * 0.46, w * 0.2, t);
          for (const s of [-1, 1]) bract(g, cx, y + 6, s > 0 ? 0.25 : Math.PI - 0.25, reach * (1.0 + r() * 0.1), t);
          const n = 5;
          for (let k = 0; k < n; k++) {
            const u = (k + 0.5) / n - 0.5;
            const a = -Math.PI / 2 + u * 2.7 + (r() - 0.5) * 0.2;
            floret(g, r, cx + u * reach * 0.5, y - 2, a - 0.25 * Math.sign(u) * -1, reach * (0.6 + r() * 0.15) * (1 - t * 0.25));
          }
        }
        // Tight purple buds at the tip.
        for (let k = 0; k < 6; k++) {
          g.fillStyle = k % 2 ? '#4a3a9a' : '#57304f';
          g.beginPath();
          g.ellipse(cx + (r() - 0.5) * 16, h * 0.035 + r() * 18, 6, 9, 0, 0, TAU);
          g.fill();
        }
      });
    }
    for (let c = 0; c < 2; c++) {
      inCell(g, 340, c * 172, 172, 172, (w, h) => {
        // A whorl from above: bracts in a cross, flowers radiating between them.
        for (let k = 0; k < 4; k++) bract(g, w / 2, h / 2, (k / 4) * TAU + c * 0.6, w * 0.46, k % 2);
        const n = 8 + c * 2;
        for (let k = 0; k < n; k++) floret(g, r, w / 2, h / 2, (k / n) * TAU + r() * 0.3, w * (0.34 + r() * 0.08));
        g.fillStyle = '#4a3a9a';
        g.beginPath();
        g.arc(w / 2, h / 2, w * 0.07, 0, TAU);
        g.fill();
      });
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const center = V(0, -Sp * 0.8, 0), radii = V(1, 1, 1);
  const leafTop = H * 0.42; // foliage stays about 2 in high; the spikes make the rest
  const swayAt = (y: number) => clamp(y / H) * 0.85;

  // Rosettes packed on a jittered spiral; stolons carry smaller, younger ones out to a ragged edge.
  interface Ros { p: THREE.Vector3; size: number; rho: number; birth: number; young: number }
  const rosettes: Ros[] = [];
  const N = 74;
  for (let i = 0; i < N; i++) {
    const rho = Math.sqrt((i + 0.5) / N) * 0.84;
    const a = i * 2.39996 + (r() - 0.5) * 0.7;
    const d = rho * R + (r() - 0.5) * 0.02;
    const edge = clamp((rho - 0.6) / 0.25);
    rosettes.push({ p: V(Math.cos(a) * d, 0.004 + (1 - rho) * 0.012 * r(), Math.sin(a) * d), size: lerp(0.066, 0.048, edge) * (0.85 + r() * 0.3), rho, birth: rho < 0.55 || r() < 0.3 ? 0 : clamp((rho - 0.5) * 1.6 + r() * 0.15, 0.1, 0.8), young: edge * 0.5 });
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + r() * 0.5, d = R * (0.88 + r() * 0.1);
    rosettes.push({ p: V(Math.cos(a) * d, 0.003, Math.sin(a) * d), size: 0.03 + r() * 0.014, rho: 0.95, birth: 0.45 + r() * 0.4, young: 1 });
  }

  const white = col('#ffffff');
  for (const ro of rosettes) {
    const spin = r() * TAU;
    const shadeR = 0.88 + r() * 0.2;
    // Three tiers of opposite pairs: the outer leaves lie almost flat, the inner stand up.
    const tiers = [
      { n: 5, len: 1, pitch: 0.12, lift: 0 },
      { n: 4, len: 0.82, pitch: 0.5, lift: 0.1 },
    ];
    tiers.forEach((T, ti) => {
      for (let k = 0; k < T.n; k++) {
        const az = spin + ti * 0.7 + (k / T.n) * TAU + (r() - 0.5) * 0.5;
        const len = ro.size * T.len * (0.85 + r() * 0.3);
        const pitch = T.pitch + (r() - 0.3) * 0.3;
        // Bronze-purple dominates; green shows in the low, older leaves; young rosettes are brighter purple.
        const q = r();
        const cell = ro.young > 0.7 && q < 0.6 ? 4 : ti === 0 ? (q < 0.3 ? 3 : q < 0.42 ? 5 : Math.floor(r() * 3)) : q < 0.2 ? 4 : q < 0.3 ? 3 : Math.floor(r() * 3);
        const c = white.clone().multiplyScalar(shadeR * (ti === 0 ? 0.8 + r() * 0.2 : 0.95 + r() * 0.2));
        const base = ro.p.clone().add(V(Math.cos(az) * ro.size * 0.04, ro.size * T.lift, Math.sin(az) * ro.size * 0.04));
        const s0 = swayAt(base.y);
        lay(leaves, base, az, pitch, (r() - 0.5) * 0.5, len, len * 0.52, LEAF_UV[cell], c, ro.birth, { segs: 2, curl: pitch * 1.4 + 0.35 + r() * 0.35, center, radii, normalBend: 0.3, sway0: s0, sway1: clamp(s0 + 0.3) }, ro.p);
      }
    });
    // The crowded young leaves at the heart, as one small card seen from above.
    const hs = ro.size * 0.8;
    const hp = ro.p.clone().add(V(0, ro.size * 0.36, 0));
    const haz = r() * TAU;
    const hb = hp.clone().add(V(-Math.cos(haz) * hs * 0.5, 0, -Math.sin(haz) * hs * 0.5));
    lay(leaves, hb, haz, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, hs, hs, ROSETTE_UV, white.clone().multiplyScalar(0.9 + r() * 0.15), ro.birth, { segs: 1, center, radii, normalBend: 0.3, sway0: swayAt(hp.y), sway1: swayAt(hp.y) }, ro.p);
  }

  // Old, shaded leaves on the soil under the rosettes close the gaps.
  for (let k = 0; k < 34; k++) {
    const rho = Math.sqrt(r()) * 0.8, a = r() * TAU, az = r() * TAU, sz = 0.15 + r() * 0.05;
    const p = V(Math.cos(a) * rho * R, 0.003, Math.sin(a) * rho * R);
    const b = p.clone().add(V(-Math.cos(az) * sz * 0.5, 0, -Math.sin(az) * sz * 0.5));
    lay(leaves, b, az, 0, 0, sz, sz, ROSETTE_UV, white.clone().multiplyScalar(0.42 + r() * 0.12), rho < 0.55 ? 0 : 0.3 + r() * 0.3, { segs: 1, center, radii, normalBend: 0.3, sway0: 0, sway1: 0 }, p);
  }

  // Flower spikes rise from the older rosettes.
  const fcol = col('#ffffff');
  for (const ro of rosettes) {
    if (ro.rho > 0.82 || r() > 0.27) continue;
    const h = H * (0.78 + r() * 0.26);
    const lean = V((r() - 0.5) * 0.24, 1, (r() - 0.5) * 0.24).normalize();
    const w = h * 0.27;
    const a0 = r() * TAU;
    const birth = ro.birth > 0 ? ro.birth : r() < 0.55 ? 0 : 0.15 + r() * 0.5;
    const base = ro.p.clone().add(V(0, ro.size * 0.2, 0));
    const uv = SPIKE_UV[Math.floor(r() * 2)];
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * Math.PI / 2;
      leafQuad(flowers, base, lean, V(Math.cos(a), 0, Math.sin(a)), h, w, uv, fcol, birth, base, { segs: 1, sway0: swayAt(base.y), sway1: swayAt(base.y + h) });
    }
    for (const t of [0.5, 0.74, 0.93]) {
      const p = base.clone().addScaledVector(lean, h * t);
      flatCard(flowers, p, lean, r() * TAU, w * lerp(0.85, 0.5, t), WHORL_UV[Math.floor(r() * 2)], fcol, birth, base, swayAt(p.y));
    }
  }

  // Foliage and flowers are fitted separately: leaves to the spread, spikes to the height.
  for (let i = 1; i < leaves.pos.length; i += 3) leaves.pos[i] = Math.min(leaves.pos[i], leafTop * 1.25);
  fitMat([leaves, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    look: { leafRoughness: 0.5, translucency: 0.15, bend: 0.02, flutter: 0.003 },
  };
};
