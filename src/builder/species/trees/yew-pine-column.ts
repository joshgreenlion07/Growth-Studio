import * as THREE from 'three';
import {
  GeoBuilder, UP, V, along, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, smoothstep, tube, uvCell,
  type SpeciesBuilder,
} from '../kit';
import { arc, cssMix, fibrousBark, inCell, polyLen } from './shared-conifers';

/**
 * Fern pine / 'yew pine', Podocarpus gracilior, narrow upright column form: a
 * single central trunk with many short ascending side branches, very dense,
 * clothed to the ground, softly rounded top. Leaves are linear-lanceolate
 * (5-8 cm x 5-7 mm), pointed, blue-green above with a clear midrib, spiralled
 * on the twig; new growth is a lime-yellow flush at the tips.
 */

const DARK = '#14301f', MID = '#21503a', LIGHT = '#34693e', NEW = '#9fbd47', NEW2 = '#c4d25a', STEM = '#6b5a3c';

/** One narrow pointed leaf with midrib, base at (x, y), pointing along ang (canvas radians). */
function paintLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, flush: number, tone: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const body = cssMix(cssMix(DARK, MID, 0.55 + 0.3 * tone), LIGHT, 0.2 * tone);
  const tipC = cssMix(body, NEW, flush);
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, cssMix(body, NEW2, flush * 0.8));
  grad.addColorStop(0.55, body);
  grad.addColorStop(1, tipC);
  const hw = wid / 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.18, -hw * 1.05, len * 0.62, -hw * 1.15, len, 0);
  g.bezierCurveTo(len * 0.62, hw * 1.15, len * 0.18, hw * 1.05, 0, 0);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = cssMix(DARK, '#000000', 0.4);
  g.globalAlpha = 0.5;
  g.lineWidth = 1;
  g.stroke();
  g.globalAlpha = 1;
  // Midrib, paler than the blade.
  g.strokeStyle = cssMix(body, flush > 0.4 ? NEW2 : '#9ab88a', 0.55);
  g.lineWidth = Math.max(1, wid * 0.13);
  g.beginPath();
  g.moveTo(len * 0.04, 0);
  g.lineTo(len * 0.94, 0);
  g.stroke();
  g.restore();
}

/** A twig with spiralled leaves: base at the bottom centre of the cell, growing up. */
function paintSprig(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, big: number) {
  const x0 = w / 2, y0 = h - 6;
  const lean = (r() - 0.5) * 0.25;
  const L = h * (0.8 + r() * 0.12);
  const leafL = h * 0.27 * big, leafW = leafL * 0.105;
  const axis = (t: number): [number, number, number] => {
    const a = -Math.PI / 2 + lean + Math.sin(t * 3 + lean * 9) * 0.05;
    return [x0 + Math.cos(-Math.PI / 2 + lean) * L * t * 0.0 + Math.sin(t * 2.2 + lean * 8) * w * 0.04 + lean * L * t * 0.5, y0 - L * t, a];
  };
  const leafRound = (px: number, py: number, base: number, t: number, nl: number) => {
    for (let k = 0; k < nl; k++) {
      // Spiral: alternate sides with foreshortened ones in between.
      const side = (k % 2 ? 1 : -1);
      const spread = 0.55 + r() * 0.5;
      const droop = 0.12 + r() * 0.2;
      const fore = k >= 2 ? 0.55 + r() * 0.25 : 1;
      const a = base + side * spread + side * droop * -0.3 + droop;
      const flush = clamp((t - 0.62) * 2.2 + (r() - 0.5) * 0.25);
      paintLeaf(g, px, py, a, leafL * fore * (0.85 + r() * 0.25) * lerp(1, 0.7, t * t), leafW * (0.9 + r() * 0.25), flush, r());
    }
  };
  // Twig itself, with side twiglets that carry their own leaves.
  const draw = (t0: number, t1: number, up: boolean) => {
    for (let i = 0; i < 2; i++) {
      g.strokeStyle = cssMix(STEM, MID, i ? 0.5 : 0.1);
      g.lineWidth = i ? 1.4 : 2.8 * (1 - t0 * 0.4);
      g.lineCap = 'round';
      g.beginPath();
      for (let s = 0; s <= 10; s++) {
        const [px, py] = axis(lerp(t0, t1, s / 10));
        if (!s) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      if (!up) break;
    }
  };
  // Draw back-to-front: leaves behind the twig first.
  const n = 16;
  const sub: { t: number; sgn: number; len: number }[] = [];
  for (let i = 0; i < 3 + Math.floor(r() * 2); i++) sub.push({ t: 0.18 + i * 0.17 + r() * 0.06, sgn: i % 2 ? 1 : -1, len: 0.34 + r() * 0.15 });
  for (const s of sub) {
    const [px, py, a] = axis(s.t);
    const sa = a + s.sgn * (0.75 + r() * 0.2);
    const sl = L * s.len;
    const ex = px + Math.cos(sa) * sl, ey = py + Math.sin(sa) * sl;
    g.strokeStyle = cssMix(STEM, MID, 0.3);
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(ex, ey);
    g.stroke();
    const m = 6;
    for (let k = 1; k <= m; k++) {
      const q = k / m;
      leafRound(lerp(px, ex, q), lerp(py, ey, q), sa + (-Math.PI / 2 - sa) * 0.45, 0.35 + q * 0.5, 2);
    }
    // Terminal pair.
    leafRound(ex, ey, sa + (-Math.PI / 2 - sa) * 0.45, 0.95, 3);
  }
  draw(0, 1, true);
  for (let i = 0; i < n; i++) {
    const t = 0.06 + (i / (n - 1)) * 0.94;
    const [px, py, a] = axis(t);
    leafRound(px, py, a, t, i > 12 ? 3 : 2);
  }
  leafRound(...(axis(1).slice(0, 2) as [number, number]), axis(1)[2], 1, 3);
}

function atlas(): THREE.Texture {
  return leafTexture('yewpine-atlas', 1024, 1024, (g, W, H) => {
    const r = rng('yewpine-atlas');
    for (let c = 0; c < 6; c++) {
      inCell(g, W, H, 4, 2, c, (w, h) => paintSprig(g, r, w, h, c < 3 ? 1 : 0.9), 2);
    }
    // Single leaves, two per cell.
    inCell(g, W, H, 4, 2, 6, (w, h) => {
      paintLeaf(g, w * 0.3, h - 8, -Math.PI / 2 - 0.05, h * 0.88, w * 0.24, 0.15, 0.6);
      paintLeaf(g, w * 0.72, h - 8, -Math.PI / 2 + 0.08, h * 0.8, w * 0.22, 0.75, 0.3);
    }, 0);
    // Dense dark core patch.
    inCell(g, W, H, 4, 2, 7, (w, h) => {
      g.fillStyle = cssMix(DARK, '#000000', 0.45);
      g.fillRect(-2, -2, w + 4, h + 4);
      for (let i = 0; i < 260; i++) {
        paintLeaf(g, r() * w, r() * h, -Math.PI / 2 + (r() - 0.5) * 2.4, 40 + r() * 40, 7, 0, r() * 0.4);
      }
    }, 0);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight * 0.955, R = (spec.matureSpread / 2) * 0.66;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const profile = (t: number) => {
    if (t < 0.25) return lerp(0.8, 1, smoothstep(0, 0.25, t));
    if (t < 0.84) return lerp(1, 0.7, (t - 0.25) / 0.59);
    return 0.7 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.84) / 0.16, 2))) + 0.05;
  };
  const prof = (y: number) => Math.max(0.03, profile(clamp(y / H))) * R;
  const sway = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / H, 1.7) * 0.85 + (Math.hypot(p.x, p.z) / R) * 0.12 * (p.y / H));
  const white = col('#8f857b'), twigCol = col('#8d7b62');
  const tIn = col('#a6bfa0'), tOut = col('#ffffff');
  const trunkR = 0.055;
  const clear = 0.04;

  // Trunk.
  const trunk: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    trunk.push(V(Math.sin(t * 5 + 1) * R * 0.04 * t, lerp(-0.1, H * 0.985, t), Math.cos(t * 4) * R * 0.04 * t));
  }
  tube(wood, trunk, trunkR, trunkR * 0.08, 9, white, 0, V(), (i) => sway(trunk[i]), 2);
  tube(wood, [V(0, -0.1, 0), V(0, 0.02, 0), V(0, trunkR * 1.8, 0)], trunkR * 1.6, trunkR * 0.98, 9, white, 0, V(), () => 0, 2);

  // Shaded core.
  const cu = uvCell(4, 2, 7);
  {
    const rings = 14, sides = 9;
    let prev: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const y = lerp(0.2, H * 0.95, i / rings);
      const row: number[] = [];
      for (let s = 0; s <= sides; s++) {
        const az = (s / sides) * Math.PI * 2;
        const rr = prof(y) * 0.45 * (i === 0 ? 0.1 : 1) * (0.9 + 0.2 * Math.sin(az * 3 + i * 1.7));
        const p = V(Math.cos(az) * rr, y, Math.sin(az) * rr);
        const sh = lerp(0.5, 0.8, clamp(y / H + 0.2));
        row.push(leaves.vert(p, V(Math.cos(az) * 0.3, -0.95, Math.sin(az) * 0.3).normalize(), lerp(cu[0] + 0.01, cu[2] - 0.01, s % 2), lerp(cu[1] + 0.01, cu[3] - 0.01, i % 2), tIn.clone().multiplyScalar(sh), 0, V(0, y, 0), sway(p)));
      }
      if (i > 0) for (let s = 0; s < sides; s++) leaves.quad(prev[s], prev[s + 1], row[s + 1], row[s]);
      prev = row;
    }
  }

  // Sprig and single-leaf cards.
  const sprig = (base: THREE.Vector3, axis: THREE.Vector3, birth: number, big: number, single = false) => {
    const rad = Math.hypot(base.x, base.z);
    const out = rad > 1e-4 ? V(base.x / rad, 0, base.z / rad) : V(1, 0, 0);
    const len = (single ? lerp(0.07, 0.1, r()) : lerp(0.19, 0.28, r())) * big;
    const dir = V(0, 0.45, 0).addScaledVector(axis, 0.55).addScaledVector(out, 0.2 + r() * 0.75)
      .add(V((r() - 0.5) * 0.5, (r() - 0.5) * 0.35, (r() - 0.5) * 0.5)).normalize();
    const face = out.clone().applyAxisAngle(dir, (r() - 0.5) * 3).add(V(0, 0.2, 0)).normalize();
    const tipP = base.clone().addScaledVector(dir, len);
    const depth = clamp(Math.hypot(tipP.x, tipP.z) / prof(tipP.y));
    const hT = clamp(base.y / H);
    const shade = lerp(0.55, 1, Math.pow(depth, 1.5)) * lerp(0.9, 1.05, hT);
    const c = jitter(tIn.clone().lerp(tOut, Math.pow(depth, 1.2)), r, 0.015, 0.06, 0.06).multiplyScalar(shade);
    const s0 = sway(base);
    const cell = single ? 6 : Math.floor(r() * 6);
    leafQuad(leaves, base, dir, face, len, single ? len * 0.5 : len * 0.52 * (0.9 + r() * 0.25), uvCell(4, 2, cell), c, birth, base, {
      segs: 2, curl: (r() - 0.55) * 0.3, center: V(0, base.y - R * 0.5, 0), radii: V(1, 1, 1), normalBend: 0.55, sway0: s0, sway1: clamp(s0 + 0.04),
    });
  };
  const dress = (pts: THREE.Vector3[], from: number, birth: number, late: number, perM: number) => {
    const L = polyLen(pts);
    const n = Math.max(1, Math.round(L * (1 - from) * perM));
    for (let k = 0; k < n; k++) {
      const a = along(pts, lerp(from, 1, (k + r()) / n));
      const b = r() < 0.85 ? birth : clamp(birth + 0.1 + r() * late, 0, 0.9);
      sprig(a.p, a.dir, b, 1);
      if (r() < 0.6) sprig(a.p, a.dir, b, 1, true);
    }
    const e = along(pts, 1);
    sprig(e.p, e.dir, birth, 1.12);
  };

  const NB = 330, NS = 30;
  let az = r() * 6.28;
  for (let i = 0; i < NB; i++) {
    const skirt = i < NS;
    const u = clamp((i - NS + r()) / (NB - NS));
    const y0 = skirt ? clear + r() * 0.3 : lerp(0.25, H * 0.95, Math.pow(u, 1.25));
    az += 2.39996 + (r() - 0.5) * 0.5;
    const rise = (skirt ? 0.05 + r() * 0.3 : lerp(0.3, 0.75, r())) * lerp(1, 0.5, smoothstep(0.8, 1, y0 / H));
    const yt = Math.min(H * 0.975, y0 + rise);
    const rt = prof(yt) * (skirt ? 0.5 + 0.4 * r() : 0.55 + 0.4 * r());
    const ca = Math.cos(az), sa = Math.sin(az);
    const tb = along(trunk, clamp((y0 + 0.1) / (H * 0.985 + 0.1))).p;
    const pts = arc(tb, V(ca * rt * 0.9, y0 + (yt - y0) * 0.3, sa * rt * 0.9), V(ca * rt, yt, sa * rt), 3);
    const birth = r() < 0.65 ? 0 : clamp(0.1 + r() * 0.5 + (y0 / H) * 0.25, 0, 0.85);
    const br = lerp(0.014, 0.006, y0 / H) * (0.8 + r() * 0.4);
    tube(wood, pts, br, br * 0.35, y0 < H * 0.25 ? 5 : 3, twigCol, birth, pts[0], (k) => sway(pts[k]), 1.5);
    dress(pts, skirt ? 0.05 : 0.25, birth, 0.4, skirt ? 32 : 10);
    const L = polyLen(pts);
    const nt = Math.round(L * 5);
    for (let k = 0; k < nt; k++) {
      const a = along(pts, lerp(0.3, 0.97, (k + r()) / nt));
      const ta = az + (r() - 0.5) * 3.4;
      const d = V(Math.cos(ta), 0, Math.sin(ta)).multiplyScalar(0.5).addScaledVector(a.dir, 0.55).add(V(0, 0.45, 0)).normalize();
      const rr = Math.hypot(a.p.x, a.p.z);
      const tl = Math.min(0.2 * (0.6 + r() * 0.8), Math.max(0.04, prof(a.p.y) * 0.95 - rr) * 2 + 0.05);
      const end = a.p.clone().addScaledVector(d, tl);
      const er = Math.hypot(end.x, end.z), lim = prof(end.y) * 0.95;
      if (er > lim) { end.x *= lim / er; end.z *= lim / er; }
      const tp = [a.p, a.p.clone().lerp(end, 0.5), end];
      const tb2 = r() < 0.8 ? birth : clamp(birth + 0.15 + r() * 0.4, 0, 0.88);
      tube(wood, tp, br * 0.45, br * 0.2, 3, twigCol, tb2, a.p, (q) => sway(tp[q]), 1);
      dress(tp, 0.1, tb2, 0.3, 9);
    }
  }
  // Leader.
  for (let k = 0; k < 12; k++) sprig(V((r() - 0.5) * 0.05, H * lerp(0.9, 0.98, k / 11), (r() - 0.5) * 0.05), UP, k < 7 ? 0 : 0.3, 0.9);

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: atlas(),
    bark: { map: fibrousBark('yewpine', '#7a6d60', '#4a3f35', '#a39888') },
    look: { translucency: 0.2, leafRoughness: 0.55, bend: 0.2, flutter: 0.008 },
  };
};
