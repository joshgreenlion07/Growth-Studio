import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, clamp, col, jitter, leafPath, leafQuad, leafTexture, lerp, perp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, blobPath, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, rootFlare, tiled } from './shared-trees-a';

/**
 * Crape myrtle, modeled on Lagerstroemia 'Muskogee' grown as a multi-trunk
 * tree: three to five smooth, sinuous trunks rising in a vase, bark that
 * peels in patches of cinnamon, tan and gray-pink, small oval leaves in
 * opposite pairs, and in summer cone-shaped panicles (6 to 10 in) of
 * crinkled light lavender-pink flowers at the branch tips. Shown in bloom.
 */

const LEAF = { dark: '#234319', mid: '#365f22', light: '#4d7a2c', fresh: '#8c7a3a', rib: 'rgba(176,200,120,0.6)', stem: '#8a5a44' };
const PETAL = ['#cf9bd4', '#dcaee0', '#c288c9', '#e6c2e8', '#d4a2d6'];

function ovalLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, rot: number, fresh: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, LEAF.dark);
  grad.addColorStop(0.55, LEAF.mid);
  grad.addColorStop(1, LEAF.light);
  g.fillStyle = grad;
  leafPath(g, len, len * 0.6, 0.48, 0.5);
  g.fill();
  if (fresh > 0.02) {
    g.globalAlpha = fresh * 0.6;
    g.fillStyle = LEAF.fresh;
    g.fill();
    g.globalAlpha = 1;
  }
  const shade = r();
  g.fillStyle = shade < 0.5 ? `rgba(0,0,0,${(0.5 - shade) * 0.4})` : `rgba(255,255,220,${(shade - 0.5) * 0.12})`;
  g.fill();
  g.strokeStyle = LEAF.rib;
  g.lineWidth = Math.max(0.8, len * 0.022);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.93, 0);
  g.stroke();
  g.lineWidth = Math.max(0.5, len * 0.01);
  g.beginPath();
  for (let v = 1; v <= 5; v++) {
    const t = v / 6.5;
    for (const s of [-1, 1]) {
      g.moveTo(len * t, 0);
      g.quadraticCurveTo(len * (t + 0.1), s * len * 0.1, len * (t + 0.17), s * len * 0.2 * Math.sin(Math.PI * Math.min(1, t + 0.25)));
    }
  }
  g.stroke();
  g.restore();
}

/** 1024 atlas, 2 x 2. Cells 0 to 2: leafy shoots with opposite pairs. Cell 3: four quarters, each a twig tip with one or two pairs. */
function crapeLeaves(): THREE.Texture {
  return leafTexture('crape-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('crape-tex');
    g.lineCap = 'round';
    const shootIn = (ox: number, oy: number, Q: number, pairs: number, top: number, leafLen: number) => {
      g.save();
      g.translate(ox, oy);
      g.beginPath();
      g.rect(0, 0, Q, Q);
      g.clip();
      const x0 = Q / 2, y0 = Q, x1 = Q / 2 + (r() - 0.5) * Q * 0.06, y1 = Q * top;
      g.strokeStyle = LEAF.stem;
      g.lineWidth = Q * 0.012;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      for (let n = 0; n < pairs; n++) {
        const t = pairs === 1 ? 1 : 0.1 + (n / (pairs - 1)) * 0.9;
        const last = n === pairs - 1;
        for (const s of [-1, 1]) {
          const a = -Math.PI / 2 + s * (last ? 0.35 + r() * 0.2 : 1.0 - t * 0.3 + (r() - 0.5) * 0.6);
          ovalLeaf(g, r, lerp(x0, x1, t) + s * Q * 0.004, lerp(y0, y1, t + s * 0.02), leafLen * (last ? 0.75 : 0.85 + r() * 0.3), a, last ? 0.4 + r() * 0.4 : 0);
        }
      }
      g.restore();
    };
    shootIn(0, 0, S, 5, 0.26, S * 0.29);
    shootIn(S, 0, S, 4, 0.3, S * 0.32);
    shootIn(0, S, S, 5, 0.3, S * 0.3);
    for (let q = 0; q < 4; q++) shootIn(S + (q % 2) * 256, S + Math.floor(q / 2) * 256, 256, q < 2 ? 2 : 1, q < 2 ? 0.45 : 0.6, 256 * (q < 2 ? 0.4 : 0.5));
  });
}

/** One flower: six crinkled petals on thin claws around yellow stamens. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, size: number) {
  const a0 = r() * 6.28;
  const tone = Math.floor(r() * PETAL.length);
  for (let k = 0; k < 6; k++) {
    const a = a0 + (k / 6) * Math.PI * 2 + (r() - 0.5) * 0.3;
    const d = size * (0.5 + r() * 0.12);
    g.fillStyle = PETAL[(tone + (r() < 0.3 ? 1 : 0)) % PETAL.length];
    blobPath(g, r, x + Math.cos(a) * d, y + Math.sin(a) * d, size * 0.36, size * 0.33, 0.42, 8);
    g.fill();
    g.fillStyle = 'rgba(120,60,140,0.22)';
    blobPath(g, r, x + Math.cos(a) * d * 0.8, y + Math.sin(a) * d * 0.8, size * 0.14, size * 0.12, 0.4, 6);
    g.fill();
  }
  g.fillStyle = '#e8c53a';
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.arc(x + (r() - 0.5) * size * 0.4, y + (r() - 0.5) * size * 0.4, Math.max(1, size * 0.055), 0, 6.3);
    g.fill();
  }
}

/** A cone of florets, tip at the top of the box, with round buds toward the tip. */
function panicle(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, squat: number) {
  g.strokeStyle = '#6f7a3c';
  g.lineWidth = w * 0.02;
  g.beginPath();
  g.moveTo(x + w / 2, y + h);
  g.lineTo(x + w / 2, y + h * 0.08);
  g.stroke();
  const half = (t: number) => (w / 2) * 0.86 * Math.pow(Math.sin(Math.PI * Math.pow(t, squat) * 0.82 + 0.12), 0.8);
  const fs = w * 0.12;
  // Back to front: darker first.
  for (let pass = 0; pass < 2; pass++) {
    const n = Math.round((h / fs) * 7);
    for (let i = 0; i < n; i++) {
      const t = 0.1 + r() * 0.84;
      const hw = half(t) - fs * 0.4;
      if (hw <= 0) continue;
      const fx = x + w / 2 + (r() * 2 - 1) * hw, fy = y + h * t;
      if (t < 0.24 && r() < 0.75) {
        // Buds near the tip.
        g.fillStyle = r() < 0.5 ? '#8a9a4e' : '#a8707c';
        g.beginPath();
        g.arc(fx, fy, fs * (0.2 + r() * 0.1), 0, 6.3);
        g.fill();
        continue;
      }
      floret(g, r, fx, fy, fs * (0.8 + r() * 0.5));
      if (pass === 0) {
        g.fillStyle = 'rgba(70,30,90,0.16)';
        g.beginPath();
        g.arc(fx, fy, fs * 1.1, 0, 6.3);
        g.fill();
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    g.fillStyle = r() < 0.5 ? '#8a9a4e' : '#a8707c';
    g.beginPath();
    g.arc(x + w / 2 + (r() - 0.5) * w * 0.1, y + h * (0.04 + r() * 0.1), fs * 0.2, 0, 6.3);
    g.fill();
  }
}

/** 1024 atlas: left half one tall panicle; right top a shorter one; right bottom a round truss seen from above. */
function crapeFlowers(): THREE.Texture {
  return leafTexture('crape-flowers', 1024, 1024, (g) => {
    const r = rng('crape-flower-tex');
    panicle(g, r, 16, 8, 480, 1008, 0.75);
    panicle(g, r, 528, 8, 480, 496, 0.6);
    for (let i = 0; i < 38; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 190;
      floret(g, r, 768 + Math.cos(a) * d, 768 + Math.sin(a) * d, 44 + r() * 26);
    }
  });
}

/** Smooth, mottled bark: tan ground with peeled patches of cinnamon, gray-pink, cream and gray. */
function crapeBark(): THREE.Texture {
  return barkTexture('crape-bark', 512, (g, S) => {
    const r = rng('crape-bark');
    g.fillStyle = '#b3977a';
    g.fillRect(0, 0, S, S);
    const tones = ['#9a6142', '#c3a498', '#d6c3a6', '#a39a8e', '#8a5236', '#c9ad8c', '#b98e7e'];
    for (let i = 0; i < 34; i++) {
      const x = r() * S, y = r() * S, rx = 16 + r() * 34, ry = rx * (3 + r() * 3.5);
      const tone = tones[Math.floor(r() * tones.length)];
      const seed = `cb${i}`;
      tiled(g, S, () => {
        g.globalAlpha = 0.72;
        g.fillStyle = tone;
        blobPath(g, rng(seed), x, y, rx, ry, 0.45, 14);
        g.fill();
        // A thin shadow line where the old layer lifts.
        g.globalAlpha = 0.22;
        g.strokeStyle = '#4a3324';
        g.lineWidth = 1.3;
        g.stroke();
      });
    }
    for (let i = 0; i < 500; i++) {
      const x = r() * S, y = r() * S, len = 12 + r() * 60, light = r() < 0.5, a = 0.04 + r() * 0.08, w = 0.6 + r() * 1.4;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = light ? '#f0e4d0' : '#5a4030';
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y + len);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const crownBase = 0.3;

  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.74, baseR: 0.42, pBot: 1, pTop: 2.4, lump: 0.08, phase: r() * 6 });
  const nTrunks = 5;
  const az0 = r() * 6.28;
  const limbs = growTree(
    r,
    Array.from({ length: nTrunks }, (_, i) => {
      const az = az0 + (i / nTrunks) * Math.PI * 2 + (r() - 0.5) * 0.7;
      const lean = 0.2 + r() * 0.13;
      const rad = H * (0.0095 + r() * 0.003);
      return { base: V(Math.cos(az) * 0.15, -0.12, Math.sin(az) * 0.15), dir: V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean)), length: H * (0.74 + r() * 0.08), r0: rad, r1: rad * 0.22, segs: 6, gnarl: 0.3, up: 0.16 };
    }),
    [
      { perMeter: 1.3, from: 0.33, to: 0.95, angle: 0.5, angleVar: 0.15, len: 0.5, lenVar: 0.2, lenMin: 0.9, taperAlong: 0.75, radius: 0.62, tip: 0.25, segs: 5, gnarl: 0.32, up: 0.22, out: 0.22, early: 1, limit: [0.95, 1], minKeep: 0.6 },
      { perMeter: 4.4, from: 0.2, to: 0.97, angle: 0.6, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.4, lenMax: 1.2, taperAlong: 0.75, radius: 0.55, tip: 0.3, tipMin: 0.004, segs: 3, gnarl: 0.36, up: 0.18, out: 0.12, early: 0.93, opposite: true, smooth: false, limit: [0.94, 1.01], minKeep: 0.35 },
      { perMeter: 8, from: 0.15, to: 0.97, angle: 0.6, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.2, lenMax: 0.5, taperAlong: 0.8, radius: 0.55, tip: 0.5, tipMin: 0.0025, segs: 1, gnarl: 0.2, up: 0.14, early: 0.88, opposite: true, smooth: false, limit: [0.95, 1.03] },
    ],
    env,
  );
  for (const l of limbs) if (l.level === 0) rootFlare(l, 0.5, l.rad[0] * 1.8);

  const center = V(0, H * lerp(crownBase, 1, 0.5), 0), radii = V(R, H * (1 - crownBase) * 0.56, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#93a08c'), tOuter: col('#ffffff'), tNew: col('#fff0c8') });
  const barkCol = col('#ffffff'), twigCol = col('#b08a70');
  emitWood(wood, limbs, {
    tile: 0.5,
    sway: T.sway,
    color: (l) => (l.level >= 3 ? twigCol : l.level === 2 ? barkCol.clone().lerp(twigCol, 0.5) : barkCol),
    sides: (l) => (l.level >= 3 ? 3 : l.level === 2 ? 5 : l.level === 1 ? 8 : 12),
  });

  const shoot = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const s = T.sway(at) * WOOD_BEND;
    leafQuad(leaves, at, dir, T.face(at, 0.4, 0.9), size, size, uvCell(2, 2, Math.floor(r() * 3)), T.tint(at, tipness), T.birth(birth, at), at, { segs: 2, curl: 0.15 + r() * 0.5, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.1) });
  };
  const pair = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const q = Math.floor(r() * 4);
    const u0 = 0.5 + (q % 2) * 0.25, v1 = 0.5 - Math.floor(q / 2) * 0.25;
    const size = q < 2 ? 0.15 + r() * 0.04 : 0.11 + r() * 0.03;
    leafQuad(leaves, at, dir, T.face(at, 0.5, 1.2), size, size, [u0, v1 - 0.25, u0 + 0.25, v1], T.tint(at, tipness), T.birth(birth, at), at, { segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.08) });
  };
  const fTints = [col('#ffffff'), col('#f4e6f6'), col('#e9d6ee')];
  /** A flower panicle at a shoot tip: three crossed cards and a few trusses for body. */
  const bloom = (at: THREE.Vector3, dir: THREE.Vector3, birth: number) => {
    const d = dir.clone().lerp(UP, 0.45).addScaledVector(T.outward(at), 0.25).normalize();
    const len = 0.22 + r() * 0.12, wid = len * (0.52 + r() * 0.1);
    const s = T.sway(at) * WOOD_BEND;
    const shade = lerp(0.72, 1, T.depth(at)) * (0.92 + r() * 0.12);
    const c = jitter(fTints[Math.floor(r() * 3)], r, 0.012, 0.04, 0.03).multiplyScalar(shade);
    const tall = r() < 0.6;
    const uv: [number, number, number, number] = tall ? [0, 0, 0.5, 1] : [0.5, 0.5, 1, 1];
    const L = tall ? len : len * 0.72;
    const a = perp(d), b = V().crossVectors(d, a).normalize();
    const rot = r() * Math.PI;
    for (let k = 0; k < 3; k++) {
      const ang = rot + (k / 3) * Math.PI;
      const face = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      leafQuad(flowers, at, d, face, L, wid, uv, c, birth, at, { segs: 1, center, radii, normalBend: 0.75, sway0: s, sway1: clamp(s + 0.08) });
    }
    for (let k = 0; k < 3; k++) {
      const ang = r() * 6.28;
      const out = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      const p0 = at.clone().addScaledVector(d, L * (0.3 + r() * 0.4));
      leafQuad(flowers, p0, out, d, wid * 0.42, wid * 0.42, [0.5, 0, 1, 0.5], c, birth, at, { segs: 1, center, radii, normalBend: 0.75, sway0: s, sway1: clamp(s + 0.06) });
    }
  };

  for (const l of limbs) {
    if (l.level < 2) continue;
    const twig = l.level === 3;
    const from = twig ? 0.12 : 0.35;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / (twig ? 0.06 : 0.1)));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (T.depth(at.p) < 0.28 + r() * 0.25) continue;
      const sgn = i % 2 ? 1 : -1;
      shoot(at.p, T.side(at.dir, sgn, 0.7, (r() - 0.5) * 0.5), l.birth, t * (twig ? 1 : 0.5), 0.28 + r() * 0.1);
      pair(at.p, T.side(at.dir, -sgn, 0.5, (r() - 0.6) * 0.6), l.birth, t);
    }
    const end = limbAt(l, 1);
    const back = limbAt(l, twig ? 0.5 : 0.9);
    shoot(back.p, end.dir, l.birth, 1, 0.26 + r() * 0.08);
    for (const sgn of [-1, 1]) pair(end.p, T.side(end.dir, sgn, 0.8, 0.1 * r()), l.birth, 1);
    // Flowers on the sunlit shoots: the outside and top of the crown.
    const o = T.outward(end.p);
    if (T.depth(end.p) > 0.62 && (o.y > -0.25 || r() < 0.3) && r() < 0.86) bloom(end.p, end.dir, clamp(l.birth + (r() < 0.75 ? 0 : 0.15 + r() * 0.4), 0, 0.9));
  }

  fitBuilders([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: crapeLeaves(),
    flowerMap: crapeFlowers(),
    bark: { map: crapeBark() },
    look: { translucency: 0.4, leafRoughness: 0.5, bend: 0.3, flutter: 0.028 },
  };
};
