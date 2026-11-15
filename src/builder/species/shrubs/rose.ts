import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type Branch, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha, fitAll, growMound, moundWood, serratePath, stemBark, tone } from './shared-shrubs-b';

/**
 * Shrub rose of the Knock Out type (Rosa 'Radrazz'), in full bloom. A bushy
 * rounded shrub of upright, slightly arching green canes with red-brown
 * thorns. Alternate compound leaves of 5 to 7 serrated oval leaflets, dark
 * semi-glossy green with red-bronze new growth. Clusters of cherry-red
 * semi-double blooms, about 3 in across, with yellow stamens, and pointed
 * buds wrapped in green sepals.
 */

function leafTex(): THREE.Texture {
  return leafTexture('rose-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('rose-leaf-tex');
    const leaflet = (x: number, y: number, ang: number, len: number, young: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const wid = len * (0.6 + r() * 0.08);
      const sh = r();
      const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
      const a = tone(tone('#243f20', '#34562a', sh), '#5e2f2a', young), b = tone(tone('#34582b', '#446c33', sh), '#7b4a34', young);
      grad.addColorStop(0, a);
      grad.addColorStop(0.5, b);
      grad.addColorStop(1, tone(a, b, 0.4));
      g.fillStyle = grad;
      serratePath(g, len, wid, 0.42, 13, 0.13, 0.75);
      g.fill();
      g.strokeStyle = young > 0.5 ? 'rgba(70,28,28,0.6)' : 'rgba(22,40,20,0.6)';
      g.lineWidth = 1.4;
      g.stroke();
      // Gloss: a soft light band on one half.
      g.save();
      g.clip();
      g.fillStyle = 'rgba(190,215,170,0.13)';
      g.beginPath();
      g.ellipse(len * 0.5, -wid * 0.22, len * 0.36, wid * 0.13, 0, 0, 6.3);
      g.fill();
      g.restore();
      // Midrib and pinnate veins.
      g.strokeStyle = young > 0.5 ? 'rgba(170,110,80,0.75)' : 'rgba(128,160,96,0.8)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.97, 0);
      g.stroke();
      g.lineWidth = 1.1;
      g.beginPath();
      for (let i = 1; i <= 7; i++) {
        const t = i / 8.2, vx = len * t;
        const reach = (wid / 2) * 0.86 * Math.sin(Math.PI * Math.pow(t, 0.75));
        for (const s of [-1, 1]) {
          g.moveTo(vx, 0);
          g.quadraticCurveTo(vx + len * 0.06, s * reach * 0.6, vx + len * 0.11, s * reach);
        }
      }
      g.stroke();
      g.restore();
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      const pairs = cell === 1 ? 3 : 2;
      const young = cell === 3 ? 0.85 : cell === 2 ? 0.22 : 0;
      const L = S * (pairs === 3 ? 0.31 : 0.36) * (cell === 3 ? 0.88 : 1);
      const x0 = S / 2, y0 = S - 3;
      const yTop = S * 0.02 + L;
      const bend = (r() - 0.5) * 30;
      const rx = (t: number) => x0 + bend * Math.sin(t * 1.5), ry = (t: number) => lerp(y0, yTop, t);
      // Rachis and stipules.
      g.strokeStyle = young > 0.5 ? '#7c3f33' : tone('#5d7a3a', '#7a5a3c', r() * 0.6);
      g.lineCap = 'round';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(rx(0), ry(0));
      for (let i = 1; i <= 10; i++) g.lineTo(rx(i / 10), ry(i / 10));
      g.stroke();
      g.fillStyle = young > 0.5 ? '#74453a' : '#4d6f34';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + s * 12, y0 - 14, x0 + s * 15, y0 - 44);
        g.quadraticCurveTo(x0 + s * 4, y0 - 26, x0, y0 - 30);
        g.fill();
      }
      for (let i = 0; i < pairs; i++) {
        const t = lerp(0.3, 1, (i + 0.35) / (pairs + 0.35));
        const len = L * lerp(0.62, 0.9, i / Math.max(1, pairs - 1)) * (0.92 + r() * 0.16);
        for (const s of [-1, 1]) leaflet(rx(t) + s * 4, ry(t), s * (1.12 + (r() - 0.5) * 0.25), len, young);
      }
      leaflet(rx(1), ry(1), (r() - 0.5) * 0.2, L * (0.98 + r() * 0.08), young);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

function flowerTex(pal: { red: string; pink: string }): THREE.Texture {
  return leafTexture('rose-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('rose-flower-tex');
    const petal = (ang: number, r0: number, len: number, wid: number, c: { dark: string; mid: string; edge: string }) => {
      g.save();
      g.rotate(ang);
      g.translate(r0, 0);
      const grad = g.createRadialGradient(0, 0, len * 0.05, len * 0.35, 0, len * 0.95);
      grad.addColorStop(0, c.dark);
      grad.addColorStop(0.5, c.mid);
      grad.addColorStop(1, c.edge);
      g.fillStyle = grad;
      // Broad petal with a shallow notch at the tip.
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.2, -wid * 0.62, len * 0.8, -wid * 0.66, len * 0.98, -wid * 0.2);
      g.quadraticCurveTo(len * 1.02, -wid * 0.06, len * 0.94, 0);
      g.quadraticCurveTo(len * 1.02, wid * 0.06, len * 0.98, wid * 0.2);
      g.bezierCurveTo(len * 0.8, wid * 0.66, len * 0.2, wid * 0.62, 0, 0);
      g.closePath();
      g.shadowColor = 'rgba(40,0,10,0.55)';
      g.shadowBlur = 12;
      g.fill();
      g.shadowBlur = 0;
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(90,5,25,0.22)';
      g.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        g.beginPath();
        g.moveTo(len * 0.05, 0);
        g.quadraticCurveTo(len * 0.5, i * wid * 0.09, len * 0.97, i * wid * 0.13);
        g.stroke();
      }
      // Light catching the rolled petal rim.
      g.strokeStyle = 'rgba(255,120,140,0.16)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(len * 0.8, -wid * 0.5);
      g.quadraticCurveTo(len * 1.0, 0, len * 0.8, wid * 0.5);
      g.stroke();
      g.restore();
      g.restore();
    };
    const bloom = (c: { dark: string; mid: string; edge: string }, stamen: string) => {
      g.translate(S / 2, S / 2);
      const R = S * 0.485;
      const a0 = r() * 6.28;
      for (let i = 0; i < 6; i++) petal(a0 + (i / 6) * 6.283 + (r() - 0.5) * 0.2, R * 0.04, R * 0.96, R * (1.0 + r() * 0.1), c);
      for (let i = 0; i < 5; i++) petal(a0 + 0.5 + (i / 5) * 6.283 + (r() - 0.5) * 0.3, R * 0.03, R * (0.66 + r() * 0.08), R * 0.74, c);
      for (let i = 0; i < 4; i++) petal(a0 + 1.1 + (i / 4) * 6.283 + (r() - 0.5) * 0.4, R * 0.02, R * (0.4 + r() * 0.08), R * 0.46, c);
      // Boss of stamens.
      g.fillStyle = '#7d6a1f';
      g.beginPath();
      g.arc(0, 0, R * 0.13, 0, 6.3);
      g.fill();
      for (let i = 0; i < 90; i++) {
        const a = r() * 6.28, d = R * (0.03 + Math.sqrt(r()) * 0.17);
        g.strokeStyle = 'rgba(214,180,60,0.8)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(Math.cos(a) * d * 0.3, Math.sin(a) * d * 0.3);
        g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        g.stroke();
        g.fillStyle = r() < 0.7 ? stamen : '#b98a22';
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, 3.4 + r() * 1.8, 0, 6.3);
        g.fill();
      }
      g.fillStyle = '#a6b04a';
      g.beginPath();
      g.arc(0, 0, R * 0.035, 0, 6.3);
      g.fill();
    };
    const fresh = { dark: tone(pal.red, '#000000', 0.62), mid: tone(pal.red, '#000000', 0.3), edge: tone(pal.red, '#000000', 0.08) };
    const older = { dark: tone(pal.red, '#000000', 0.5), mid: tone(tone(pal.red, pal.pink, 0.3), '#000000', 0.2), edge: tone(tone(pal.red, pal.pink, 0.6), '#000000', 0.1) };
    cellClip(g, 0, 0, S, S); bloom(fresh, '#f0c93a'); g.restore();
    cellClip(g, 1, 0, S, S); bloom(older, '#d9a732'); g.restore();
    // Side views, stem at the bottom center: a tight bud and a half-open bloom.
    for (let cell = 2; cell < 4; cell++) {
      cellClip(g, cell - 2, 1, S, S);
      const open = cell === 3;
      const cx = S / 2, by = S * 0.78;
      g.strokeStyle = '#5f7a3a';
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, S - 2);
      g.lineTo(cx, by);
      g.stroke();
      // Petals.
      g.save();
      g.translate(cx, by - 30);
      const n = open ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const a = open ? lerp(-1.05, 1.05, i / (n - 1)) : (i - 1) * 0.16;
        const len = open ? S * (0.5 - Math.abs(a) * 0.1) : S * 0.52;
        petal(-Math.PI / 2 + a, 0, len, open ? S * 0.32 : S * 0.2, i % 2 ? fresh : { ...fresh, mid: tone(pal.red, '#000000', 0.12) });
      }
      g.restore();
      // Hip and sepals.
      g.fillStyle = '#4f7234';
      g.beginPath();
      g.ellipse(cx, by - 6, 34, 40, 0, 0, 6.3);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const a = lerp(-1, 1, i / 4) * (open ? 1.25 : 0.42);
        g.save();
        g.translate(cx, by - 18);
        g.rotate(a);
        g.fillStyle = tone('#3f6a2c', '#5d8440', r());
        g.beginPath();
        g.moveTo(-17, 0);
        g.quadraticCurveTo(-20, -S * 0.2, 0, -S * (open ? 0.3 : 0.44));
        g.quadraticCurveTo(20, -S * 0.2, 17, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/** An open bloom as a shallow cup of 8 triangles, facing `n`. */
function cupBloom(g: GeoBuilder, r: () => number, c: THREE.Vector3, n: THREE.Vector3, R: number, uv: [number, number, number, number], color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number) {
  const a = perp(n), b = V().crossVectors(n, a).normalize();
  const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
  const N = 8, roll = r() * 6.28, cup = 0.22 + r() * 0.2;
  const ci = g.vert(c, n, um, vm, color.clone().multiplyScalar(0.82), birth, anchor, sway);
  const ring: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = roll + (i / N) * 6.2832;
    const rad = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t));
    const p = c.clone().addScaledVector(rad, R * 1.04).addScaledVector(n, R * cup * (0.8 + r() * 0.4));
    const tt = (i / N) * 6.2832;
    ring.push(g.vert(p, n.clone().multiplyScalar(0.75).addScaledVector(rad, 0.45).normalize(), um + Math.cos(tt) * ur * 1.04, vm + Math.sin(tt) * vr * 1.04, color, birth, anchor, sway));
  }
  for (let i = 0; i < N; i++) g.tri(ci, ring[i], ring[(i + 1) % N]);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();

  const m = growMound(r, { H: H - 0.06, Sp: Sp - 0.14, points: 130, stems: 9, perLimb: 6, centerY: 0.5, under: -0.55, power: 2.1, lump: 0.1, lumpFreq: 2.6, rough: 0.16, stemRadius: 0.0075, crown: 0.07, arch: 0.02, gnarl: 0.1, stemReach: 0.55, limbReach: 0.55, early: 0.74 });
  const caneOld = col('#6c6f44'), cane = col('#5f8038'), shoot = col('#7a5a3c');
  moundWood(wood, m, (b) => (b.level === 0 ? caneOld.clone().lerp(cane, 0.3) : b.level === 1 ? cane : cane.clone().lerp(shoot, r() * 0.8)), { uvScale: 1, sides: [6, 5, 3] });

  // Thorns: small hooked prickles along the canes.
  const thornC = col('#9a4734');
  const thorns = (b: Branch) => {
    let az = r() * 6.28;
    const n = Math.round(b.length / 0.03);
    for (let k = 0; k < n; k++) {
      const t = (k + r()) / n;
      const at = along(b.pts, t);
      az += 2.4 + r();
      const rad = lerp(b.r0, b.r1, t);
      const side = deflect(at.dir, Math.PI / 2, az);
      const h = 0.006 + r() * 0.004;
      const sw = m.sway(at.p);
      const p0 = at.p.clone().addScaledVector(side, rad * 0.8);
      const i0 = wood.vert(p0.clone().addScaledVector(at.dir, 0.0045), side, 0.1, 0.1, thornC, b.birth, at.p, sw);
      const i1 = wood.vert(p0.clone().addScaledVector(at.dir, -0.0045), side, 0.2, 0.1, thornC, b.birth, at.p, sw);
      const i2 = wood.vert(p0.clone().addScaledVector(side, h).addScaledVector(at.dir, -0.004), side, 0.15, 0.2, thornC.clone().multiplyScalar(1.25), b.birth, at.p, sw);
      wood.tri(i0, i1, i2);
      wood.tri(i0, i2, i1);
    }
  };
  for (const b of [...m.stems, ...m.limbs]) thorns(b);

  // Alternate compound leaves spiralling up every cane and shoot.
  const leafAt = (p: THREE.Vector3, axis: THREE.Vector3, az: number, birth: number, tipness: number) => {
    const d = m.depth(p);
    const dir = deflect(axis, 0.95 + (r() - 0.5) * 0.4, az).add(V(0, 0.15, 0)).normalize();
    const young = tipness > 0.8 && d > 0.75 && r() < 0.55;
    const cell = young ? 3 : r() < 0.2 ? 2 : r() < 0.4 ? 1 : 0;
    const len = (young ? 0.085 : 0.115) * (0.8 + r() * 0.4);
    const shade = lerp(0.5, 1, Math.pow(d, 1.8)) * (0.9 + r() * 0.18);
    const c = jitter(col('#ffffff'), r, 0.02, 0.04, 0.04).multiplyScalar(shade);
    const face = UP.clone().multiplyScalar(0.7).addScaledVector(m.out(p), 0.5).add(V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)).normalize();
    const s = m.sway(p);
    leafQuad(leaves, p, dir, face, len, len * 0.92, uvCell(2, 2, cell), c, birth, p, { segs: 2, curl: 0.25 + r() * 0.45, center: m.center, radii: m.radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.12) });
  };
  const leafy = (b: Branch, from: number, gap: number) => {
    let az = r() * 6.28;
    const n = Math.max(2, Math.round((b.length * (1 - from)) / gap));
    for (let k = 0; k < n; k++) {
      const t = lerp(from, 1, (k + 0.3 + r() * 0.5) / n);
      const at = along(b.pts, t);
      az += 2.4 + (r() - 0.5) * 0.5;
      const birth = b.birth === 0 ? (r() < 0.9 ? 0 : 0.1 + r() * 0.45) : clamp(b.birth + r() * 0.1, 0, 0.9);
      leafAt(at.p, at.dir, az, birth, b.level === 2 ? t : 0);
    }
  };
  for (const b of m.stems) leafy(b, 0.3, 0.03);
  for (const b of m.limbs) leafy(b, 0.1, 0.022);
  for (const b of m.twigs) leafy(b, 0.05, 0.021);

  // Bloom clusters at the shoot tips.
  const pedC = col('#6b8a3e');
  for (const tw of m.twigs) {
    if (r() < 0.2) continue;
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end).lerp(UP, 0.35).normalize();
    const nb = 1 + Math.floor(r() * r() * 5);
    const s = m.sway(end);
    for (let k = 0; k < nb + 2; k++) {
      const bud = k >= nb;
      if (bud && r() < 0.35) continue;
      const d = k === 0 ? out.clone() : deflect(out, 0.45 + r() * 0.6, r() * 6.28);
      const len = (bud ? 0.035 : 0.03) + r() * 0.045;
      const c = end.clone().addScaledVector(d, len);
      const birth = clamp(tw.birth + (k === 0 ? 0.02 : 0.04 + r() * 0.12), 0, 0.92);
      tube(wood, [end, c], 0.0016, 0.0013, 3, pedC, birth, end, () => s, 1);
      const tintC = col('#ffffff', 0.86 + r() * 0.12);
      if (bud) {
        const size = 0.032 + r() * 0.016;
        const base = c.clone().addScaledVector(d, -size * 0.2);
        const uv = uvCell(2, 2, r() < 0.55 ? 2 : 3);
        const f1 = perp(d), f2 = V().crossVectors(d, f1).normalize();
        leafQuad(flowers, base, d, f1, size, size, uv, tintC, birth, end, { sway0: s, sway1: s });
        leafQuad(flowers, base, d, f2, size, size, uv, tintC, birth, end, { sway0: s, sway1: s });
      } else {
        const n = d.clone().lerp(m.out(end), 0.3).add(V((r() - 0.5) * 0.3, 0.1, (r() - 0.5) * 0.3)).normalize();
        cupBloom(flowers, r, c, n, 0.033 + r() * 0.01, uvCell(2, 2, r() < 0.68 ? 0 : 1), tintC, birth, end, s);
      }
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex({ red: spec.flower ?? '#c8203a', pink: spec.flower2 ?? '#e15a7d' }),
    bark: { map: stemBark('cane', 0.12) },
    look: { translucency: 0.35, leafRoughness: 0.45, bend: 0.07, flutter: 0.014 },
  };
};
