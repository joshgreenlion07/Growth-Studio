import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type Branch, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, serratePath, stemBark, tone } from './shared-shrubs-b';

/**
 * Groundcover rose Flower Carpet Red (Rosa 'Noare'), in full bloom. A low,
 * spreading mound, wider than tall, of arching canes that lie out toward the
 * ground at the edges; dense, glossy deep green compound leaves of small
 * oval leaflets; and big, many-flowered clusters of semi-double bright red
 * blooms about 2 in across with yellow stamens, so profuse they nearly
 * carpet the top. Unlike the upright Knock Out (`rose`), it is flat-topped
 * and spreading, with smaller, more numerous, truer red flowers.
 *
 * References:
 *  - RHS, Rosa Flower Carpet Red Velvet ('Noare') (GC/S): ground cover
 *    shrub rose; ultimate height and spread 0.5-1 m.
 *  - Everde Growers, Rosa x 'NOAre' Flower Carpet Red: groundcover rose,
 *    mature size 2-3 ft x 3 ft.
 *  - NVK Nurseries, Rosa 'Noare': 60-80 cm tall, 100-120 cm wide.
 *  - Weston Nurseries / Kennedy's plant finder, Flower Carpet Red Rose:
 *    clusters of semi-double red flowers with yellow stamens, glossy green
 *    disease resistant foliage; about 3 ft tall and wide.
 *  - HelpMeFind Roses, Flower Carpet Red: average bloom diameter 2 in.
 * Catalog: 0.75 m tall x 1.0 m wide at maturity; a 2 gal is about 14 x 16 in.
 */

function leafTex(): THREE.Texture {
  return leafTexture('flower-carpet-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('flower-carpet-leaf-tex');
    const leaflet = (x: number, y: number, ang: number, len: number, young: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const wid = len * (0.62 + r() * 0.08);
      const sh = r();
      const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
      const a = tone(tone('#173416', '#21421d', sh), '#5a2a26', young), b = tone(tone('#24481f', '#2f5626', sh), '#74402e', young);
      grad.addColorStop(0, a);
      grad.addColorStop(0.5, b);
      grad.addColorStop(1, tone(a, b, 0.4));
      g.fillStyle = grad;
      serratePath(g, len, wid, 0.45, 12, 0.12, 0.7);
      g.fill();
      g.strokeStyle = young > 0.5 ? 'rgba(70,28,28,0.6)' : 'rgba(14,30,14,0.65)';
      g.lineWidth = 1.3;
      g.stroke();
      // Glossy: a crisp light band along one half, and a fainter one on the other.
      g.save();
      g.clip();
      g.fillStyle = 'rgba(205,230,190,0.2)';
      g.beginPath();
      g.ellipse(len * 0.52, -wid * 0.2, len * 0.34, wid * 0.11, 0.05, 0, 6.3);
      g.fill();
      g.fillStyle = 'rgba(205,230,190,0.08)';
      g.beginPath();
      g.ellipse(len * 0.5, wid * 0.18, len * 0.3, wid * 0.1, -0.05, 0, 6.3);
      g.fill();
      g.restore();
      // Midrib and pinnate veins, slightly sunken.
      g.strokeStyle = young > 0.5 ? 'rgba(160,100,80,0.7)' : 'rgba(110,150,90,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.96, 0);
      g.stroke();
      g.lineWidth = 0.9;
      g.beginPath();
      for (let i = 1; i <= 6; i++) {
        const t = i / 7.2, vx = len * t;
        const reach = (wid / 2) * 0.84 * Math.sin(Math.PI * Math.pow(t, 0.8));
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
      const pairs = cell === 1 || cell === 2 ? 3 : 2;
      const young = cell === 3 ? 0.75 : 0;
      const L = S * (pairs === 3 ? 0.27 : 0.32) * (cell === 3 ? 0.9 : 1);
      const x0 = S / 2, y0 = S - 3;
      const yTop = S * 0.03 + L;
      const bend = (r() - 0.5) * 30;
      const rx = (t: number) => x0 + bend * Math.sin(t * 1.5), ry = (t: number) => lerp(y0, yTop, t);
      g.strokeStyle = young > 0.5 ? '#6e3a30' : tone('#4f6e34', '#6e5436', r() * 0.5);
      g.lineCap = 'round';
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(rx(0), ry(0));
      for (let i = 1; i <= 10; i++) g.lineTo(rx(i / 10), ry(i / 10));
      g.stroke();
      for (let i = 0; i < pairs; i++) {
        const t = lerp(0.3, 1, (i + 0.35) / (pairs + 0.35));
        const len = L * lerp(0.66, 0.92, i / Math.max(1, pairs - 1)) * (0.92 + r() * 0.16);
        for (const s of [-1, 1]) leaflet(rx(t) + s * 4, ry(t), s * (1.15 + (r() - 0.5) * 0.25), len, young);
      }
      leaflet(rx(1), ry(1), (r() - 0.5) * 0.2, L * (0.98 + r() * 0.08), young);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/** Cells 0, 1: open semi-double blooms face-on (fresh, and older with more stamens showing). 2: bud. 3: opening bloom from the side. */
function flowerTex(red: string, red2: string): THREE.Texture {
  return leafTexture('flower-carpet-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('flower-carpet-flower-tex');
    type Pal = { dark: string; mid: string; edge: string };
    const petal = (ang: number, r0: number, len: number, wid: number, c: Pal) => {
      g.save();
      g.rotate(ang);
      g.translate(r0, 0);
      const grad = g.createRadialGradient(0, 0, len * 0.05, len * 0.3, 0, len * 0.95);
      grad.addColorStop(0, c.dark);
      grad.addColorStop(0.45, c.mid);
      grad.addColorStop(1, c.edge);
      g.fillStyle = grad;
      // Broad, rounded petal with a slight notch and a wavy rim.
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.18, -wid * 0.66, len * 0.82, -wid * 0.7, len * 0.98, -wid * 0.18);
      g.quadraticCurveTo(len * 1.02, -wid * 0.05, len * 0.93, 0);
      g.quadraticCurveTo(len * 1.02, wid * 0.05, len * 0.98, wid * 0.18);
      g.bezierCurveTo(len * 0.82, wid * 0.7, len * 0.18, wid * 0.66, 0, 0);
      g.closePath();
      g.shadowColor = 'rgba(50,0,8,0.55)';
      g.shadowBlur = 10;
      g.fill();
      g.shadowBlur = 0;
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(80,0,12,0.2)';
      g.lineWidth = 1.4;
      for (let i = -4; i <= 4; i++) {
        g.beginPath();
        g.moveTo(len * 0.05, 0);
        g.quadraticCurveTo(len * 0.5, i * wid * 0.09, len * 0.97, i * wid * 0.13);
        g.stroke();
      }
      // Velvety sheen near the rim.
      g.strokeStyle = 'rgba(255,60,60,0.12)';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(len * 0.78, -wid * 0.5);
      g.quadraticCurveTo(len * 1.0, 0, len * 0.78, wid * 0.5);
      g.stroke();
      g.restore();
      g.restore();
    };
    const bloom = (c: Pal, stamens: number) => {
      g.translate(S / 2, S / 2);
      const R = S * 0.48;
      const a0 = r() * 6.28;
      // Semi-double: an outer ring of broad petals, a second ring, and a few inner ones around an open eye.
      for (let i = 0; i < 6; i++) petal(a0 + (i / 6) * 6.283 + (r() - 0.5) * 0.2, R * 0.05, R * 0.95, R * (0.95 + r() * 0.1), c);
      for (let i = 0; i < 6; i++) petal(a0 + 0.5 + (i / 6) * 6.283 + (r() - 0.5) * 0.3, R * 0.06, R * (0.7 + r() * 0.08), R * 0.72, c);
      for (let i = 0; i < 5; i++) petal(a0 + 1.1 + (i / 5) * 6.283 + (r() - 0.5) * 0.4, R * 0.08, R * (0.46 + r() * 0.06), R * 0.5, c);
      for (let i = 0; i < 4; i++) petal(a0 + 1.9 + (i / 4) * 6.283 + (r() - 0.5) * 0.4, R * 0.1, R * (0.27 + r() * 0.05), R * 0.3, { ...c, edge: tone(c.edge, '#000000', 0.15) });
      // A small boss of yellow stamens in the open eye.
      g.fillStyle = '#6a5a18';
      g.beginPath();
      g.arc(0, 0, R * 0.1, 0, 6.3);
      g.fill();
      for (let i = 0; i < stamens; i++) {
        const a = r() * 6.28, d = R * (0.03 + Math.sqrt(r()) * 0.13);
        g.strokeStyle = 'rgba(220,190,70,0.85)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(Math.cos(a) * d * 0.3, Math.sin(a) * d * 0.3);
        g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        g.stroke();
        g.fillStyle = r() < 0.75 ? '#f3cd2e' : '#d9a828';
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, 2.8 + r() * 1.6, 0, 6.3);
        g.fill();
      }
      g.fillStyle = '#a8b04a';
      g.beginPath();
      g.arc(0, 0, R * 0.04, 0, 6.3);
      g.fill();
    };
    const fresh: Pal = { dark: tone(red, '#2a0006', 0.6), mid: tone(red, '#000000', 0.18), edge: tone(red, '#e8141e', 0.25) };
    const older: Pal = { dark: tone(red, '#2a0006', 0.55), mid: tone(tone(red, red2, 0.4), '#000000', 0.25), edge: tone(tone(red, red2, 0.5), '#000000', 0.12) };
    cellClip(g, 0, 0, S, S); bloom(fresh, 60); g.restore();
    cellClip(g, 1, 0, S, S); bloom(older, 85); g.restore();
    for (let cell = 2; cell < 4; cell++) {
      cellClip(g, cell - 2, 1, S, S);
      const open = cell === 3;
      const cx = S / 2, by = S * 0.78;
      g.strokeStyle = '#4f6e32';
      g.lineWidth = 14;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, S - 2);
      g.lineTo(cx, by);
      g.stroke();
      g.save();
      g.translate(cx, by - 26);
      const n = open ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const a = open ? lerp(-1.1, 1.1, i / (n - 1)) : (i - 1) * 0.18;
        petal(-Math.PI / 2 + a, 0, open ? S * (0.48 - Math.abs(a) * 0.1) : S * 0.48, open ? S * 0.3 : S * 0.2, i % 2 ? fresh : { ...fresh, mid: tone(red, '#000000', 0.05) });
      }
      g.restore();
      g.fillStyle = '#426a2c';
      g.beginPath();
      g.ellipse(cx, by - 6, 30, 36, 0, 0, 6.3);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const a = lerp(-1, 1, i / 4) * (open ? 1.25 : 0.42);
        g.save();
        g.translate(cx, by - 16);
        g.rotate(a);
        g.fillStyle = tone('#365e26', '#557c3a', r());
        g.beginPath();
        g.moveTo(-15, 0);
        g.quadraticCurveTo(-18, -S * 0.18, 0, -S * (open ? 0.28 : 0.4));
        g.quadraticCurveTo(18, -S * 0.18, 15, 0);
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
  const N = 8, roll = r() * 6.28, cup = 0.2 + r() * 0.18;
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

  // A low, flat-topped mound whose canes arch out and lie down toward the ground at the rim.
  const m = growMound(r, { H: H - 0.04, Sp: Sp - 0.1, points: 150, stems: 11, perLimb: 6, centerY: 0.2, under: -0.32, power: 2.45, lump: 0.12, lumpFreq: 2.8, rough: 0.14, stemRadius: 0.0065, crown: 0.06, arch: 0.2, gnarl: 0.12, stemReach: 0.6, limbReach: 0.6, early: 0.68 });
  const caneOld = col('#5f6a3e'), cane = col('#557a34'), shoot = col('#6e4a36');
  moundWood(wood, m, (b) => (b.level === 0 ? caneOld.clone().lerp(cane, 0.35) : b.level === 1 ? cane : cane.clone().lerp(shoot, r() * 0.7)), { uvScale: 1, sides: [5, 4, 3] });

  // Small hooked prickles along the canes.
  const thornC = col('#8a4434');
  for (const b of [...m.stems, ...m.limbs]) {
    let az = r() * 6.28;
    const n = Math.round(b.length / 0.035);
    for (let k = 0; k < n; k++) {
      const t = (k + r()) / n;
      const at = along(b.pts, t);
      az += 2.4 + r();
      const rad = lerp(b.r0, b.r1, t);
      const side = deflect(at.dir, Math.PI / 2, az);
      const h = 0.005 + r() * 0.003;
      const sw = m.sway(at.p);
      const p0 = at.p.clone().addScaledVector(side, rad * 0.8);
      const i0 = wood.vert(p0.clone().addScaledVector(at.dir, 0.004), side, 0.1, 0.1, thornC, b.birth, at.p, sw);
      const i1 = wood.vert(p0.clone().addScaledVector(at.dir, -0.004), side, 0.2, 0.1, thornC, b.birth, at.p, sw);
      const i2 = wood.vert(p0.clone().addScaledVector(side, h).addScaledVector(at.dir, -0.0035), side, 0.15, 0.2, thornC.clone().multiplyScalar(1.25), b.birth, at.p, sw);
      wood.tri(i0, i1, i2);
      wood.tri(i0, i2, i1);
    }
  }

  // Alternate compound leaves up every cane and shoot, held out flat toward the light.
  const leafAt = (p: THREE.Vector3, axis: THREE.Vector3, az: number, birth: number, tipness: number) => {
    const d = m.depth(p);
    const dir = deflect(axis, 1.0 + (r() - 0.5) * 0.4, az).add(V(0, 0.12, 0)).normalize();
    const young = tipness > 0.8 && d > 0.75 && r() < 0.4;
    const cell = young ? 3 : r() < 0.3 ? 1 : r() < 0.45 ? 2 : 0;
    const len = (young ? 0.075 : 0.095) * (0.8 + r() * 0.4);
    const shade = lerp(0.48, 1, Math.pow(d, 1.8)) * (0.9 + r() * 0.18);
    const c = jitter(col('#ffffff'), r, 0.02, 0.04, 0.04).multiplyScalar(shade);
    const face = UP.clone().multiplyScalar(0.8).addScaledVector(m.out(p), 0.45).add(V((r() - 0.5) * 0.45, 0, (r() - 0.5) * 0.45)).normalize();
    const s = m.sway(p);
    leafQuad(leaves, p, dir, face, len, len * 0.92, uvCell(2, 2, cell), c, birth, p, { segs: 2, curl: 0.2 + r() * 0.35, center: m.center, radii: m.radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.1) });
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
  for (const b of m.stems) leafy(b, 0.35, 0.03);
  for (const b of m.limbs) leafy(b, 0.1, 0.022);
  for (const b of m.twigs) leafy(b, 0.05, 0.02);

  // Big flower clusters at the shoot tips: several open blooms around a few buds, heaviest on top.
  const pedC = col('#5e7e38');
  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const o = m.out(end);
    if (o.y < -0.3 || r() < 0.3) continue;
    const out = o.clone().lerp(UP, 0.45).normalize();
    const nb = 3 + Math.floor(r() * (o.y > 0.3 ? 6 : 3));
    const s = m.sway(end);
    for (let k = 0; k < nb + 2; k++) {
      const bud = k >= nb;
      if (bud && r() < 0.4) continue;
      const d = k === 0 ? out.clone() : deflect(out, 0.45 + r() * 0.65, r() * 6.28);
      const len = (bud ? 0.03 : 0.028) + r() * 0.04;
      const c = end.clone().addScaledVector(d, len);
      const birth = clamp(tw.birth + (k === 0 ? 0.02 : 0.04 + r() * 0.12), 0, 0.92);
      tube(wood, [end, c], 0.0014, 0.0011, 3, pedC, birth, end, () => s, 1);
      const tintC = col('#ffffff', 0.86 + r() * 0.12);
      if (bud) {
        const size = 0.024 + r() * 0.01;
        const base = c.clone().addScaledVector(d, -size * 0.2);
        const uv = uvCell(2, 2, r() < 0.55 ? 2 : 3);
        const f1 = perp(d), f2 = V().crossVectors(d, f1).normalize();
        leafQuad(flowers, base, d, f1, size, size, uv, tintC, birth, end, { sway0: s, sway1: s });
        leafQuad(flowers, base, d, f2, size, size, uv, tintC, birth, end, { sway0: s, sway1: s });
      } else {
        const n = d.clone().lerp(o, 0.3).add(V((r() - 0.5) * 0.3, 0.15, (r() - 0.5) * 0.3)).normalize();
        cupBloom(flowers, r, c, n, 0.024 + r() * 0.005, uvCell(2, 2, r() < 0.7 ? 0 : 1), tintC, birth, end, s);
      }
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower ?? '#c8102e', spec.flower2 ?? '#e8404f'),
    bark: { map: stemBark('flower-carpet', 0.12) },
    look: { translucency: 0.3, leafRoughness: 0.48, bend: 0.06, flutter: 0.012 },
  };
};
