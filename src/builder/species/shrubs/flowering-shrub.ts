import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafPath, leafTexture, lerp, perp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha, faceCard, fitAll, growMound, moundWood, serratePath, sprig, sprigDir, stemBark, tone } from './shared-shrubs-b';

/**
 * The catalog's generic "Flowering shrub" is modeled on Indian hawthorn
 * (Rhaphiolepis indica, a pink variety such as 'Pink Lady'), in bloom. A
 * dense, rounded evergreen mound. Leathery dark green leaves, oval with
 * toothed margins, 2 to 3 in long, crowd toward the twig ends; new growth is
 * bronze. Loose clusters of small five-petal pink flowers with deeper pink
 * centers stand just above the foliage.
 */

function leafTex(): THREE.Texture {
  return leafTexture('hawthorn-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('hawthorn-leaf-tex');
    const leaf = (x: number, y: number, ang: number, len: number, kind: number) => {
      // kind: 0 mature, 1 bronze new growth, 2 pale underside
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const wid = len * (0.44 + r() * 0.08);
      const sh = r();
      const a = kind === 1 ? tone('#4f2f22', '#6a4129', sh) : kind === 2 ? tone('#4d6a3c', '#62804c', sh) : tone('#1c341c', '#294624', sh);
      const b = kind === 1 ? tone('#644030', '#7c5334', sh) : kind === 2 ? tone('#5a7846', '#6f8c56', sh) : tone('#27452a', '#375a2e', sh);
      const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
      grad.addColorStop(0, a);
      grad.addColorStop(0.48, b);
      grad.addColorStop(0.52, tone(a, b, 0.8));
      grad.addColorStop(1, a);
      g.fillStyle = grad;
      serratePath(g, len, wid, 0.56, 22, 0.032, 0.45);
      g.shadowColor = 'rgba(0,10,0,0.5)';
      g.shadowBlur = 8;
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = kind === 1 ? 'rgba(70,35,20,0.6)' : 'rgba(14,28,14,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
      // Leathery sheen.
      g.save();
      g.clip();
      g.fillStyle = kind === 2 ? 'rgba(255,255,255,0.05)' : 'rgba(200,225,190,0.08)';
      g.beginPath();
      g.ellipse(len * 0.55, -wid * 0.2, len * 0.33, wid * 0.11, 0, 0, 6.3);
      g.fill();
      g.restore();
      g.strokeStyle = kind === 1 ? 'rgba(200,160,110,0.8)' : 'rgba(150,180,110,0.85)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(-len * 0.08, 0);
      g.lineTo(len * 0.96, 0);
      g.stroke();
      g.lineWidth = 0.9;
      g.globalAlpha = 0.2;
      g.beginPath();
      for (let i = 1; i <= 7; i++) {
        const t = i / 8.2, vx = len * t;
        const reach = (wid / 2) * 0.82 * Math.sin(Math.PI * Math.pow(t, 1.2));
        for (const s of [-1, 1]) {
          g.moveTo(vx, 0);
          g.quadraticCurveTo(vx + len * 0.06, s * reach * 0.6, vx + len * 0.12, s * reach);
        }
      }
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      const bronze = cell === 3;
      const x0 = S / 2, y0 = S - 3, y1 = S * 0.47;
      const bend = (r() - 0.5) * 30;
      const tx = (t: number) => x0 + bend * t * t, ty = (t: number) => lerp(y0, y1, t);
      const L = S * 0.4;
      const n = 9;
      const list = Array.from({ length: n }, (_, i) => {
        const t = 0.22 + 0.78 * Math.pow(i / (n - 1), 0.75);
        const s = i % 2 ? 1 : -1;
        return { t, ang: s * lerp(1.25, 0.25, Math.pow(t, 2)) + (r() - 0.5) * 0.3, len: L * lerp(0.95, 0.78, t) * (0.85 + r() * 0.3), i };
      });
      // Lower leaves first (behind), twig over them, upper leaves on top.
      for (const l of list.slice(0, 4)) leaf(tx(l.t), ty(l.t), l.ang, l.len, r() < 0.04 ? 2 : 0);
      g.strokeStyle = bronze ? '#7a5038' : '#6a5a40';
      g.lineCap = 'round';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(tx(0), ty(0));
      for (let i = 1; i <= 8; i++) g.lineTo(tx(i / 8), ty(i / 8));
      g.stroke();
      for (const l of list.slice(4)) leaf(tx(l.t), ty(l.t), l.ang, l.len, bronze ? 1 : l.i > 6 && cell === 2 ? 1 : 0);
      // Small new leaves at the growing tip.
      for (let i = 0; i < 3; i++) leaf(tx(1), ty(1), (i - 1) * 0.5 + (r() - 0.5) * 0.2, L * (0.4 + r() * 0.15), bronze || cell === 2 ? 1 : 0);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

function flowerTex(pink: string): THREE.Texture {
  return leafTexture('hawthorn-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('hawthorn-flower-tex');
    const deep = tone(pink, '#8a1f4a', 0.45), pale = tone(pink, '#ffffff', 0.3);
    const flower = (x: number, y: number, size: number, age: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(r() * 6.28);
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate((i / 5) * 6.2832 + (r() - 0.5) * 0.12);
        const grad = g.createLinearGradient(0, 0, size, 0);
        grad.addColorStop(0, tone(deep, pink, 0.3));
        grad.addColorStop(0.35, tone(pink, pale, age * 0.3));
        grad.addColorStop(1, tone(pink, pale, 0.25 + age * 0.45));
        g.fillStyle = grad;
        leafPath(g, size, size * 0.74, 0.6, 0.2);
        g.shadowColor = 'rgba(70,10,40,0.45)';
        g.shadowBlur = 5;
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(190,80,120,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(size * 0.1, 0);
        g.lineTo(size * 0.85, 0);
        g.stroke();
        g.restore();
      }
      // Deep pink eye and stamens.
      g.fillStyle = deep;
      g.beginPath();
      g.arc(0, 0, size * 0.17, 0, 6.3);
      g.fill();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * 6.2832 + r() * 0.3, d = size * (0.28 + r() * 0.16);
        g.strokeStyle = tone(deep, '#c03a66', 0.5);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        g.stroke();
        g.fillStyle = r() < 0.6 ? '#7a2c36' : '#e8c66a';
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, 2.3, 0, 6.3);
        g.fill();
      }
      g.fillStyle = '#c9c46a';
      g.beginPath();
      g.arc(0, 0, size * 0.06, 0, 6.3);
      g.fill();
      g.restore();
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      const n = cell === 3 ? 6 : 9 + Math.floor(r() * 4);
      const spots: { x: number; y: number; s: number; bud: boolean }[] = [];
      for (let tries = 0; tries < 400 && spots.length < n + 7; tries++) {
        const bud = spots.length >= n;
        const a = r() * 6.28, d = Math.sqrt(r()) * S * (cell === 3 ? 0.3 : 0.37);
        const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
        const s = bud ? 15 + r() * 8 : 40 + r() * 9;
        if (spots.every((q) => Math.hypot(q.x - x, q.y - y) > (q.s + s) * 0.78)) spots.push({ x, y, s, bud });
      }
      // Red-brown pedicels from the cluster's stalk.
      g.lineCap = 'round';
      for (const q of spots) {
        g.strokeStyle = tone('#7a3b34', '#9a5a40', r());
        g.lineWidth = 4.5;
        g.beginPath();
        g.moveTo(S / 2, S / 2);
        g.quadraticCurveTo((S / 2 + q.x) / 2 + (r() - 0.5) * 30, (S / 2 + q.y) / 2 + (r() - 0.5) * 30, q.x, q.y);
        g.stroke();
      }
      for (const q of spots.filter((s) => s.bud)) {
        const grad = g.createRadialGradient(q.x - 3, q.y - 3, 1, q.x, q.y, q.s);
        grad.addColorStop(0, tone(pink, pale, 0.3));
        grad.addColorStop(1, deep);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(q.x, q.y, q.s, 0, 6.3);
        g.fill();
      }
      for (const q of spots.filter((s) => !s.bud)) flower(q.x, q.y, q.s, r());
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const L = 0.132;

  const m = growMound(r, { H: H - 0.05, Sp: Sp - 0.12, points: 250, stems: 10, perLimb: 7, centerY: 0.44, under: -0.8, power: 2.4, lump: 0.08, lumpFreq: 3, rough: 0.08, stemRadius: 0.011, arch: 0.04, gnarl: 0.16, twigSegs: 1, early: 0.7 });
  const stemC = col('#5c5144'), limbC = col('#6a5a48'), twigC = col('#77603f');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [7, 5, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.45, 1, Math.pow(d, 2)) * lerp(0.8, 1, clamp(p.y / (H * 0.5))) * (1 - inner * 0.3);
    return jitter(col('#ffffff'), r, 0.02, 0.05, 0.04).multiplyScalar(shade * (0.88 + r() * 0.16));
  };
  const cellFor = (outer: boolean) => (outer && r() < 0.08 ? 3 : Math.floor(r() * 3));
  const cluster = (p: THREE.Vector3, out: THREE.Vector3, birth: number, anchor: THREE.Vector3) => {
    const n = out.clone().lerp(UP, 0.3).add(V((r() - 0.5) * 0.5, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5)).normalize();
    const size = 0.085 + r() * 0.03;
    const c = p.clone().addScaledVector(n, 0.008 + r() * 0.012);
    const tintC = col('#ffffff', 0.8 + r() * 0.12);
    const shadeN = n.clone().lerp(UP, 0.3).normalize();
    const uv = uvCell(2, 2, r() < 0.2 ? 3 : Math.floor(r() * 3));
    faceCard(flowers, c, n, size, r() * 6.28, uv, tintC, birth, anchor, m.sway(p), shadeN);
    // A second card standing in the cluster, so it still reads as a flower head when seen from the side.
    const side = perp(n).applyAxisAngle(n, r() * 6.28);
    faceCard(flowers, c.clone().addScaledVector(n, size * 0.12), side, size * 0.8, r() * 6.28, uv, tintC, birth, anchor, m.sway(p), shadeN);
  };

  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.82 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    // Leafy shoots leaning out of the surface around the twig.
    for (let k = 0; k < 7; k++) {
      const at = along(tw.pts, lerp(0.3, 1, (k + r() * 0.8) / 7)).p;
      const dir = sprigDir(r, out, 0.6 + r() * 0.75, 0.25);
      const len = L * (0.8 + r() * 0.4);
      const birth = born();
      sprig(leaves, r, m, at, dir, len, len, uvCell(2, 2, cellFor(k > 3)), tint(at, 0.15), birth, { curl: 0.1 + r() * 0.45, faceOut: 0.85, normalBend: 0.5 });
      if (k > 2 && out.y > -0.15 && r() < 0.4) cluster(at.clone().addScaledVector(dir, len * 0.75), out, clamp(birth + 0.03), at);
    }
    // The twig's own end shoot, two crossed cards so it reads from any side.
    const dir = out.clone().lerp(UP, 0.3).add(V((r() - 0.5) * 0.4, (r() - 0.5) * 0.2, (r() - 0.5) * 0.4)).normalize();
    const len = L * (0.7 + r() * 0.3);
    sprig(leaves, r, m, end, dir, len, len, uvCell(2, 2, cellFor(true)), tint(end, 0), tw.birth, { cross: true, curl: 0.15, faceOut: 0.4, normalBend: 0.5 });
    if (out.y > -0.15 && r() < 0.65) cluster(end.clone().addScaledVector(dir, len * 0.8), out, clamp(tw.birth + 0.03), end);
  }
  // Inner foliage along the limbs.
  for (const b of m.limbs) {
    for (let k = 0; k < 9; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.8 + r() * 0.7, 0.3);
      sprig(leaves, r, m, at, dir, L * 1.2, L * 1.2, uvCell(2, 2, Math.floor(r() * 3)), tint(at, 1), b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower ?? '#d9739a'),
    bark: { map: stemBark('hawthorn', 0.3) },
    look: { translucency: 0.18, leafRoughness: 0.58, bend: 0.05, flutter: 0.01 },
  };
};
