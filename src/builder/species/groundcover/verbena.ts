import * as THREE from 'three';
import { GeoBuilder, V, along, barkTexture, clamp, col, leafPath, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, domeCard, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';

/**
 * Purple verbena, modeled on Verbena canadensis 'Homestead Purple': a low,
 * vigorous mat about 10 in tall and 3 ft wide. Trailing square stems root as
 * they go and turn up at the tips; they carry opposite pairs of dark green,
 * rough, deeply lobed and toothed leaves 1.5 to 3 in long. Every shoot ends
 * in a rounded 1.5 to 2 in head of vivid purple five-lobed flowers.
 */

const LW = 1024, LH = 1024, C = 512;
/** Leaf atlas, 2 x 2: two trailing sprigs, a short tip sprig, a dense patch of older leaves. */
const cellUV = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, LW, LH);

const GREENS = ['#1f4419', '#254d1c', '#2b5720', '#316024'];
const YOUNG = ['#3d7029', '#487c2e'];

/** A deeply cut verbena leaf: three pairs of forward-pointing toothed lobes and a toothed end lobe. */
function lobedLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, fill: string, dark: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const parts: { t: number; a: number; l: number; w: number }[] = [{ t: 0.04, a: 0, l: 0.96, w: 0.3 }];
  const lobes = [[0.2, 0.95, 0.4], [0.4, 0.82, 0.36], [0.58, 0.7, 0.27], [0.74, 0.6, 0.16]];
  for (const [t, a, l] of lobes) for (const s of [-1, 1]) {
    const ll = l * (0.88 + r() * 0.24), aa = s * (a + (r() - 0.5) * 0.2);
    parts.push({ t, a: aa, l: ll, w: 0.4 });
    // A tooth on the outer flank of each lobe.
    parts.push({ t: t + Math.cos(aa) * ll * 0.45, a: aa + s * 0.55, l: ll * 0.42, w: 0.5 });
    if (l > 0.3) parts.push({ t: t + Math.cos(aa) * ll * 0.5, a: aa - s * 0.5, l: ll * 0.3, w: 0.5 });
  }
  const tracePart = (p: { t: number; a: number; l: number; w: number }) => {
    g.save();
    // Teeth sit on their lobe, not on the midrib.
    const onLobe = parts.indexOf(p) > 0 && p.w === 0.5;
    const par = onLobe ? parts[parts.indexOf(p) - (parts[parts.indexOf(p) - 1].w === 0.5 ? 2 : 1)] : null;
    if (par) {
      g.translate(par.t * len, 0);
      g.rotate(par.a);
      g.translate(par.l * len * 0.45, 0);
      g.rotate(p.a - par.a);
    } else {
      g.translate(p.t * len, 0);
      g.rotate(p.a);
    }
    leafPath(g, p.l * len, p.l * len * p.w, 0.4, 0.9);
    g.restore();
  };
  // Rim first (slightly wider, darker), then the blade.
  g.lineJoin = 'round';
  for (const p of parts) {
    g.save();
    tracePart(p);
    g.restore();
    g.strokeStyle = 'rgba(10,26,8,0.9)';
    g.lineWidth = len * 0.018;
    g.stroke();
  }
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, fill);
  gr.addColorStop(1, fill);
  for (const p of parts) {
    tracePart(p);
    g.fillStyle = gr;
    g.fill();
    if (dark > 0) {
      g.fillStyle = `rgba(6,20,6,${dark})`;
      g.fill();
    }
  }
  // Pale sunken veins: midrib and one into each lobe; the blade puckers between them.
  g.strokeStyle = 'rgba(150,190,110,0.5)';
  g.lineCap = 'round';
  g.lineWidth = len * 0.016;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.93, 0);
  g.stroke();
  g.lineWidth = len * 0.01;
  g.beginPath();
  for (const p of parts) {
    if (p.w !== 0.4) continue;
    g.moveTo(p.t * len, 0);
    g.lineTo(p.t * len + Math.cos(p.a) * p.l * len * 0.8, Math.sin(p.a) * p.l * len * 0.8);
  }
  g.stroke();
  g.restore();
}

/** A trailing shoot growing up the cell: opposite pairs, each pair turned a quarter turn from the last. */
function sprig(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, pairs: number, top: number) {
  const x0 = w / 2, y0 = h * 0.995, x1 = w / 2 + (r() - 0.5) * w * 0.1, y1 = h * top;
  const sg = g.createLinearGradient(0, y0, 0, y1);
  sg.addColorStop(0, '#5a4a3c');
  sg.addColorStop(0.5, '#4f6a34');
  sg.addColorStop(1, '#6a8a40');
  g.strokeStyle = sg;
  g.lineWidth = w * 0.014;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : 0.08 + (i / pairs) * 0.86;
    const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
    const flatPair = i % 2 === 0;
    for (const s of [-1, 1]) {
      // Pairs lying to the sides show full length; the pairs between them point up and down and look short.
      const a = -Math.PI / 2 + s * (flatPair ? 0.95 + r() * 0.3 : 0.35 + r() * 0.3);
      const len = w * (flatPair ? 0.33 : 0.22) * (0.88 + r() * 0.24) * lerp(1, 0.75, t);
      lobedLeaf(g, r, nx, ny, a, len, GREENS[Math.floor(r() * GREENS.length)], !flatPair ? 0.15 : r() < 0.3 ? 0.12 : 0);
    }
  }
  // Young leaves folded around the tip.
  for (const s of [-1, 1]) lobedLeaf(g, r, x1, y1, -Math.PI / 2 + s * (0.3 + r() * 0.25), w * 0.17, YOUNG[Math.floor(r() * 2)], 0);
}

function leafAtlas(): THREE.Texture {
  return leafTexture('gc-verbena-leaves', LW, LH, (g) => {
    const r = rng('gc-verbena-leaves');
    inCell(g, 0, 0, C, C, (w, h) => sprig(g, r, w, h, 4, 0.2));
    inCell(g, C, 0, C, C, (w, h) => sprig(g, r, w, h, 3, 0.24));
    inCell(g, 0, C, C, C, (w, h) => sprig(g, r, w, h, 2, 0.42));
    inCell(g, C, C, C, C, (w, h) => {
      for (let k = 0; k < 40; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.27;
        lobedLeaf(g, r, w * (0.5 + Math.cos(a) * d), h * (0.5 + Math.sin(a) * d), a + (r() - 0.5) * 2, w * (0.16 + r() * 0.07), GREENS[Math.floor(r() * 3)], r() * 0.25);
      }
    });
  });
}

const FW = 1024, FH = 1024;
const fcell = (i: number): UV => rect((i % 2) * C, Math.floor(i / 2) * C, C, C, FW, FH);
const PURPLES = ['#5c1aa4', '#6520b0', '#6e27ba', '#561898'];

/** One salverform flower from above: five notched lobes, pale eye, dark throat. `sq` flattens it for side views. */
function floret(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number, sq = 1, rot = r() * TAU) {
  g.save();
  g.translate(x, y);
  g.scale(1, sq);
  g.rotate(rot);
  const base = PURPLES[Math.floor(r() * PURPLES.length)];
  for (let k = 0; k < 5; k++) {
    g.save();
    g.rotate((k / 5) * TAU);
    const pg = g.createLinearGradient(0, 0, s, 0);
    pg.addColorStop(0, '#4a1486');
    pg.addColorStop(0.45, base);
    pg.addColorStop(1, '#742ec2');
    g.fillStyle = pg;
    // Each lobe is notched: two overlapping rounded halves.
    for (const q of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 0.56, q * s * 0.13, s * 0.44, s * 0.24, q * 0.28, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(50,10,100,0.55)';
    g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath();
    g.moveTo(s * 0.2, 0);
    g.lineTo(s * 0.86, 0);
    g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(232,214,250,0.95)';
  g.beginPath();
  g.arc(0, 0, s * 0.12, 0, TAU);
  g.fill();
  g.fillStyle = '#35105f';
  g.beginPath();
  g.arc(0, 0, s * 0.07, 0, TAU);
  g.fill();
  g.restore();
}

function bud(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number) {
  g.fillStyle = r() < 0.5 ? '#4f1a8c' : '#5d2a78';
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.34, r() * TAU, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(70,100,50,0.8)';
  g.beginPath();
  g.arc(x, y, s * 0.16, 0, TAU);
  g.fill();
}

function flowerAtlas(): THREE.Texture {
  return leafTexture('gc-verbena-flowers', FW, FH, (g) => {
    const r = rng('gc-verbena-flowers');
    // Cells 0, 1: a full head from above. Cell 3: a younger head, half in bud.
    for (const c of [0, 1, 3]) {
      inCell(g, (c % 2) * C, Math.floor(c / 2) * C, C, C, (w, h) => {
        const cx = w / 2, cy = h / 2, young = c === 3;
        const n0 = young ? 8 : 10 + c;
        for (let k = 0; k < n0; k++) {
          const a = (k / n0) * TAU + r() * 0.2, d = w * (young ? 0.3 : 0.335) * (0.94 + r() * 0.1);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.125 + r() * 0.02));
        }
        const n1 = young ? 0 : 6;
        for (let k = 0; k < n1; k++) {
          const a = (k / n1) * TAU + 0.4 + r() * 0.3, d = w * 0.17 * (0.9 + r() * 0.2);
          floret(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * (0.115 + r() * 0.02));
        }
        const nb = young ? 22 : 7;
        for (let k = 0; k < nb; k++) {
          const a = r() * TAU, d = Math.sqrt(r()) * w * (young ? 0.19 : 0.06);
          bud(g, r, cx + Math.cos(a) * d, cy + Math.sin(a) * d, w * 0.07);
        }
        if (!young) floret(g, r, cx + w * 0.02, cy - h * 0.01, w * 0.1);
      });
    }
    // Cell 2: the head from the side on its stalk: a low dome of flowers on slender purple-green tubes.
    inCell(g, 0, C, C, C, (w, h) => {
      const cx = w / 2, hub = h * 0.62;
      g.strokeStyle = '#4c6a36';
      g.lineWidth = w * 0.022;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, hub);
      g.stroke();
      // A pair of small leaves below the head.
      for (const s of [-1, 1]) lobedLeaf(g, r, cx, h * 0.88, -Math.PI / 2 + s * 1.15, w * 0.3, GREENS[2], 0);
      const rows = [{ n: 6, y: 0.2, sp: 0.36, sq: 0.5 }, { n: 7, y: 0.31, sp: 0.42, sq: 0.62 }, { n: 6, y: 0.43, sp: 0.4, sq: 0.8 }];
      for (const row of rows) {
        for (let k = 0; k < row.n; k++) {
          const u = (k + 0.5) / row.n - 0.5;
          const fx = cx + u * 2 * row.sp * w, fy = h * (row.y + Math.abs(u) * Math.abs(u) * 0.5);
          g.strokeStyle = 'rgba(92,60,110,0.95)';
          g.lineWidth = w * 0.012;
          g.beginPath();
          g.moveTo(cx + u * w * 0.12, hub);
          g.lineTo(fx, fy);
          g.stroke();
          floret(g, r, fx, fy, w * 0.12, row.sq);
        }
      }
    });
  });
}

function stemBark(): THREE.Texture {
  return barkTexture('gc-verbena-stem', 32, (g, S) => {
    g.fillStyle = '#3c5428';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(110,70,80,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 8, 0, 3, S);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const flowers = new GeoBuilder();
  const wood = new GeoBuilder();
  const center = V(0, -Sp * 0.6, 0), radii = V(1, 1, 1);

  // A low mound: stems pile up over the crown and thin to single runners at the edge.
  const mound = (rho: number) => H * 0.74 * Math.pow(clamp(1 - rho * rho), 0.55);
  const runners = growRunners(r, {
    n: 11,
    R,
    step: 0.035,
    wander: 0.5,
    reachMin: 0.72,
    levels: [
      { every: 0.085, angle: 0.8, len: [0.1, 0.3] },
      { every: 0.09, angle: 0.85, len: [0.05, 0.13] },
    ],
    y: (rho, layer) => 0.008 + mound(rho) * (0.15 + 0.85 * layer),
  });

  const swayAt = (y: number) => clamp(y / H) * 0.85;
  const birthAt = (rho: number) => (rho < 0.6 || r() < 0.3 ? 0 : clamp((rho - 0.6) * 2 + r() * 0.15, 0.08, 0.85));
  const white = col('#ffffff');
  const stemCol = col('#ffffff');
  const fl = col('#ffffff', 0.72);

  const head = (tip: THREE.Vector3, dir: THREE.Vector3, birth: number) => {
    // The shoot turns up and holds its flower head just clear of the leaves.
    const rise = 0.018 + r() * 0.014;
    const out = V(dir.x, 0, dir.z).normalize();
    const c = tip.clone().addScaledVector(out, 0.012 + r() * 0.015).add(V(0, rise, 0));
    const size = 0.043 + r() * 0.012;
    const n = V(out.x * (0.1 + r() * 0.3) + (r() - 0.5) * 0.25, 1, out.z * (0.1 + r() * 0.3) + (r() - 0.5) * 0.25).normalize();
    const q = r();
    const s1 = swayAt(c.y);
    domeCard(flowers, c, n, r() * TAU, size, 0.11, fcell(q < 0.42 ? 0 : q < 0.84 ? 1 : 3), fl, birth, tip, s1);
    const a = r() * TAU;
    const stalkDir = c.clone().sub(tip).normalize();
    const L = size * 1.2;
    leafQuad(flowers, c.clone().addScaledVector(stalkDir, -L * 0.9), stalkDir, V(Math.cos(a), 0, Math.sin(a)), L, L, fcell(2), fl.clone().multiplyScalar(0.92), birth, tip, { segs: 1, sway0: swayAt(tip.y), sway1: s1 });
  };

  for (const run of runners) {
    const n = Math.max(1, Math.round(run.length / 0.037));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const t = (k + r() * 0.5) / n;
      const at = along(run.pts, t);
      side = -side;
      const rho = Math.hypot(at.p.x, at.p.z) / R;
      const edge = clamp((rho - 0.72) / 0.28);
      const last = k === n - 1;
      const len = (last ? 0.1 : 0.125) * (0.85 + r() * 0.3);
      const pitch = lerp(0.12 + r() * 0.85 * (0.25 + run.layer), 0.03 + r() * 0.12, edge) + (last ? 0.25 : 0);
      const shade = lerp(0.58, 1.0, clamp(run.layer * 0.85 + edge * 0.5 + r() * 0.25)) * (0.92 + r() * 0.16);
      const b = birthAt(rho);
      const s0 = swayAt(at.p.y);
      lay(leaves, at.p, heading(at.dir) + (last ? 0 : side * (0.3 + r() * 0.6)), pitch, (r() - 0.5) * 0.7, len, len, cellUV(last ? 2 : Math.floor(r() * 2)), white.clone().multiplyScalar(shade), b, { segs: 2, curl: pitch * 1.3 + r() * 0.25, center, radii, normalBend: 0.5, sway0: s0, sway1: clamp(s0 + 0.2) });
      // Side shoots along the upper stems also flower, so the whole mound is covered.
      if (!last && run.layer > 0.3 && r() < 0.22) head(at.p.clone().add(V((r() - 0.5) * 0.03, 0.012, (r() - 0.5) * 0.03)), at.dir, clamp(b + r() * 0.1, 0, 0.9));
    }
    const end = along(run.pts, 1);
    const erho = Math.hypot(end.p.x, end.p.z) / R;
    if (r() < 0.9) head(end.p, end.dir, birthAt(erho));
    if (run.level === 0) {
      const pts = run.pts.filter((_, i) => i % 3 === 0 || i === run.pts.length - 1);
      tube(wood, pts, 0.0022, 0.0013, 4, stemCol, 0, pts[0], (i) => swayAt(pts[i].y));
    }
  }

  // Upright flowering shoots over the middle of the mound, each with its own leafy sprig.
  for (let k = 0; k < 34; k++) {
    const rho = Math.sqrt(r()) * 0.62, a = r() * TAU, az = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.008 + mound(rho) * (0.7 + r() * 0.3), Math.sin(a) * rho * R);
    const b = birthAt(rho);
    const len = 0.1 * (0.85 + r() * 0.3), pitch = 0.5 + r() * 0.5;
    const s0 = swayAt(p.y);
    const base = p.clone().add(V(-Math.cos(az) * len * 0.75 * Math.cos(pitch), -len * 0.75 * Math.sin(pitch), -Math.sin(az) * len * 0.75 * Math.cos(pitch)));
    lay(leaves, base, az, pitch, (r() - 0.5) * 0.5, len, len, cellUV(2), white.clone().multiplyScalar(0.9 + r() * 0.15), b, { segs: 2, curl: 0.5, center, radii, normalBend: 0.5, sway0: clamp(s0 - 0.2), sway1: s0 });
    head(p, V(Math.cos(az), 0, Math.sin(az)), b);
  }

  // Older shaded leaves on the soil under the mound.
  for (let k = 0; k < 64; k++) {
    const low = k < 26;
    const rho = Math.sqrt(r()) * (low ? 0.8 : 0.66), a = r() * TAU, az = r() * TAU, sz = 0.2 + r() * 0.06;
    const p = V(Math.cos(a) * rho * R, 0.005 + mound(rho) * (low ? 0.08 : 0.3 + r() * 0.4), Math.sin(a) * rho * R);
    const base = p.clone().add(V(-Math.cos(az) * sz * 0.5, 0, -Math.sin(az) * sz * 0.5));
    lay(leaves, base, az, 0.02, 0, sz, sz, cellUV(3), col('#ffffff', low ? 0.42 + r() * 0.12 : 0.62 + r() * 0.14), birthAt(rho), { segs: 1, center, radii, normalBend: 0.5, sway0: 0, sway1: 0 }, p);
  }

  // The crown: a short woody stub where the stems meet.
  tube(wood, [V(0, 0, 0), V(0, 0.02, 0)], 0.006, 0.004, 5, stemCol, 0, V(), () => 0);

  fitMat([leaves, flowers, wood], H, Sp);
  return {
    leaves: leaves.build(),
    flowers: flowers.build(),
    wood: wood.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    bark: { map: stemBark() },
    look: { leafRoughness: 0.72, translucency: 0.3, bend: 0.03, flutter: 0.005 },
  };
};
