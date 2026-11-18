import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, perp, rng, smoothstep, tube, uvCell, type SpeciesBuilder } from '../kit';
import { fitToSize, stemBark } from './shared-perennials';

/**
 * Red primrose, Primula x polyantha / acaulis type, as sold for winter color
 * in 4 in pots: a low rosette of crinkled (bullate), oblong-obovate,
 * bright green leaves narrowing to a winged stalk, with a crowded posy of
 * flat, five-petaled, deep red flowers held just above them on short pale
 * stalks. Each petal is broad and notched at the end; a yellow star-shaped
 * eye surrounds the small round mouth of the tube. A few green buds with red
 * tips wait among the open flowers.
 *
 * References and the numbers they give:
 * - NC State Extension Plant Toolbox (Primula x polyantha): 4-20 in tall and
 *   wide; rosettes of simple dark green leaves; flowers in umbels or solitary,
 *   some with contrasting eyes; late winter into spring.
 * - Horticopia (Primula x polyantha 'Pacific Giants'): 6-8 in tall,
 *   7-9 in spread.
 * - Wikipedia (Primula vulgaris, the primrose parent): leaves 5-25 cm long,
 *   2-6 cm broad, often heavily wrinkled; flowers 2-4 cm across.
 * - RHS (polyanthus 'Francisca'): yellow-eyed flowers 3-4 cm across.
 * - Green Lion job photo (corten planter): about 7 in across, flowers about
 *   1.5 in across, bright yellow-green leaves.
 * Targets here (catalog mature size, one season on): 21 leaves 7.5-11.5 cm
 * long and up to 5.5 cm wide, 14 open flowers about 4 cm across on 8-12 cm
 * stalks, and buds; about 5 in high and 9 in across. At install (4 in pot)
 * about 4 in high and 7 in across, with 10 flowers about 1.3 in across.
 */

function leafTex(): THREE.Texture {
  return leafTexture('primrose-red-leaves', 512, 512, (g, w, h) => {
    const r = rng('primrose-leaf-tex');
    const cw = w / 2;
    for (let c = 0; c < 2; c++) {
      g.save();
      g.translate(c * cw, 0);
      g.beginPath();
      g.rect(0, 0, cw, h);
      g.clip();
      const cx = cw / 2, base = h - 2, top = 6;
      const L = base - top, hwMax = cw * 0.47;
      // Outline: a winged stalk widening into an oblong-obovate blade with a rounded end and a finely wavy edge.
      const prof = (t: number) => {
        if (t < 0.25) return lerp(0.12, 0.42, t / 0.25);
        if (t < 0.7) return lerp(0.42, 1, Math.sin((Math.PI / 2) * ((t - 0.25) / 0.45)));
        const u = (t - 0.7) / 0.3;
        return Math.sqrt(Math.max(0, 1 - u * u * u * 0.9 - u * u * 0.1));
      };
      const edge = (t: number, s: number) => {
        const wob = 1 + 0.045 * Math.sin(t * 46 + s * 1.7 + c * 3) + 0.03 * Math.sin(t * 97 + c);
        return cx + s * hwMax * prof(t) * (t > 0.25 ? wob : 1);
      };
      g.beginPath();
      g.moveTo(cx, base);
      for (let k = 0; k <= 120; k++) { const t = k / 120; g.lineTo(edge(t, -1), base - L * t); }
      for (let k = 120; k >= 0; k--) { const t = k / 120; g.lineTo(edge(t, 1), base - L * t); }
      g.closePath();
      const grad = g.createLinearGradient(0, base, 0, top);
      grad.addColorStop(0, '#8aa652');
      grad.addColorStop(0.25, '#58821e');
      grad.addColorStop(0.6, c ? '#466e14' : '#4b7416');
      grad.addColorStop(1, c ? '#50781a' : '#557e1c');
      g.fillStyle = grad;
      g.fill();
      g.save();
      g.clip();
      // Bullate blade: each patch between the sunken veins bulges, lighter on top, darker in the grooves.
      for (let i = 0; i < 520; i++) {
        const t = 0.27 + r() * 0.72, s = (r() - 0.5) * 2;
        const x = cx + s * hwMax * prof(t) * 0.95, y = base - L * t;
        const rad = 4 + r() * 6;
        const rg = g.createRadialGradient(x - 1, y - 1, 0, x, y, rad);
        rg.addColorStop(0, 'rgba(140,190,80,0.32)');
        rg.addColorStop(0.6, 'rgba(100,150,50,0.1)');
        rg.addColorStop(1, 'rgba(40,80,20,0)');
        g.fillStyle = rg;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // Sunken net of veinlets.
      g.strokeStyle = 'rgba(40,78,22,0.5)';
      g.lineWidth = 1.1;
      for (let i = 0; i < 160; i++) {
        const t = 0.27 + r() * 0.7, s = (r() - 0.5) * 2;
        const x = cx + s * hwMax * prof(t) * 0.9, y = base - L * t;
        const a = r() * Math.PI, l = 5 + r() * 9;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
        g.quadraticCurveTo(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      // Side veins: deep grooves arching from the midrib toward the edge.
      for (let i = 0; i < 11; i++) {
        const t0 = 0.28 + i * 0.062;
        for (const s of [-1, 1]) {
          const x1 = cx + s * hwMax * prof(t0 + 0.12) * 0.88, y1 = base - L * Math.min(0.98, t0 + 0.13);
          g.strokeStyle = 'rgba(34,70,18,0.62)';
          g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(cx, base - L * t0);
          g.quadraticCurveTo(cx + s * hwMax * 0.45, base - L * (t0 + 0.02), x1, y1);
          g.stroke();
          g.strokeStyle = 'rgba(190,220,140,0.25)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(cx + s * 2, base - L * t0 - 2);
          g.quadraticCurveTo(cx + s * hwMax * 0.45, base - L * (t0 + 0.02) - 3, x1, y1 - 3);
          g.stroke();
        }
      }
      g.restore();
      // Pale midrib running into the winged stalk.
      g.strokeStyle = '#8ea862';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx, base - L * 0.86);
      g.stroke();
      g.restore();
    }
  });
}

/** 2 x 2: two front faces, the petals' red back, and a plain white cell for buds and calyces (vertex colored). */
function flowerTex(red: string, eye: string): THREE.Texture {
  return leafTexture(`primrose-red-flowers-${red}-${eye}`, 512, 512, (g) => {
    const S = 256;
    const r = rng('primrose-flower-tex');
    const R0 = new THREE.Color(red);
    const css = (c: THREE.Color, k = 1) => `#${c.clone().multiplyScalar(k).getHexString()}`;
    const petals = (cx: number, cy: number, R: number, spin: number, front: boolean, notch: number) => {
      for (let k = 0; k < 5; k++) {
        const a = spin + (k / 5) * Math.PI * 2;
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        // A broad obcordate petal along +x: narrow claw at the center, two rounded lobes at the end.
        const W = R * 0.62;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(R * 0.3, -W * 0.5, R * 0.62, -W * 1.02, R * 0.88, -W * 0.78);
        g.bezierCurveTo(R * 1.02, -W * 0.6, R * 1.0, -W * 0.18, R * (1 - notch), 0);
        g.bezierCurveTo(R * 1.0, W * 0.18, R * 1.02, W * 0.6, R * 0.88, W * 0.78);
        g.bezierCurveTo(R * 0.62, W * 1.02, R * 0.3, W * 0.5, 0, 0);
        g.closePath();
        const grad = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
        grad.addColorStop(0, css(R0, front ? 0.55 : 0.75));
        grad.addColorStop(0.4, css(R0, front ? 0.82 : 0.88));
        grad.addColorStop(0.8, css(R0, front ? 0.9 : 0.88));
        grad.addColorStop(1, css(R0, front ? 0.74 : 0.8));
        g.fillStyle = grad;
        g.fill();
        g.save();
        g.clip();
        // Fine veins fanning out; a darker line where neighbors overlap.
        g.strokeStyle = `rgba(80,0,10,${front ? 0.22 : 0.3})`;
        g.lineWidth = 1.2;
        for (let v = -3; v <= 3; v++) {
          g.beginPath();
          g.moveTo(R * 0.15, 0);
          g.quadraticCurveTo(R * 0.55, v * W * 0.16, R * 0.95, v * W * 0.24 + (r() - 0.5) * 3);
          g.stroke();
        }
        g.strokeStyle = 'rgba(70,0,10,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(R * 0.2, -W * 0.45);
        g.bezierCurveTo(R * 0.5, -W * 0.9, R * 0.75, -W * 0.95, R * 0.88, -W * 0.78);
        g.stroke();
        g.restore();
        g.restore();
      }
    };
    const front = (cx: number, cy: number, spin: number, notch: number, deep: number) => {
      const R = S * 0.48;
      petals(cx, cy, R, spin, true, notch);
      // The yellow eye: a five-pointed star whose rays run a little way up each petal, orange-gold at the heart.
      g.beginPath();
      for (let k = 0; k <= 10; k++) {
        const a = spin + (k / 10) * Math.PI * 2;
        const rr = k % 2 === 0 ? R * 0.4 : R * 0.22;
        if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      const eg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.4);
      eg.addColorStop(0, '#c8860c');
      eg.addColorStop(0.3, eye);
      eg.addColorStop(0.85, eye);
      eg.addColorStop(1, '#e8a81c');
      g.fillStyle = eg;
      g.fill();
      // Soften the star into a rounded eye.
      g.fillStyle = eye;
      g.beginPath();
      g.arc(cx, cy, R * 0.25, 0, Math.PI * 2);
      g.fill();
      // A thin dark-red rim where the eye meets the red.
      g.strokeStyle = css(R0, 0.5 * deep);
      g.globalAlpha = 0.35;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
      // Mouth of the tube with the anthers just showing.
      const mg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.09);
      mg.addColorStop(0, '#4a5216');
      mg.addColorStop(0.6, '#8a8a24');
      mg.addColorStop(1, '#d6a61c');
      g.fillStyle = mg;
      g.beginPath();
      g.arc(cx, cy, R * 0.09, 0, Math.PI * 2);
      g.fill();
    };
    front(S / 2, S / 2, -Math.PI / 2, 0.16, 1);
    front(S * 1.5, S / 2, -Math.PI / 2 + 0.3, 0.1, 0.9);
    // Back: red petals only, a touch duller, no eye.
    petals(S / 2, S * 1.5, S * 0.48, -Math.PI / 2, false, 0.14);
    g.fillStyle = '#ffffff';
    g.fillRect(S + 6, S + 6, S - 12, S - 12);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const crown = V(0, 0.004, 0);
  const sway = (p: THREE.Vector3) => clamp((p.y / H) * 0.45 + (Math.hypot(p.x, p.z) / (Sp / 2)) * 0.3);

  // Leaves: a rosette, the outer ones lying out over the pot rim, the inner ones standing up around the posy.
  const NL = 21;
  for (let i = 0; i < NL; i++) {
    const f = 1 - i / (NL - 1); // 1 the oldest, outside .. 0 the youngest, in the middle
    const az = i * 2.39996 + (r() - 0.5) * 0.3;
    const len = lerp(0.075, 0.115, Math.sqrt(f)) * (0.92 + r() * 0.16);
    const wid = len * (0.47 + r() * 0.06);
    const theta = lerp(0.36, 0.98, f) + (r() - 0.5) * 0.14;
    const droop = lerp(0.25, 0.65, f) * (0.7 + r() * 0.6);
    const fold = 0.22 + r() * 0.08;
    const base = V(Math.cos(az) * 0.007, 0.006 + (1 - f) * 0.006, Math.sin(az) * 0.007);
    const out = V(Math.cos(az), 0, Math.sin(az));
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const birth = i < 16 ? 0 : clamp(0.2 + (i - 16) * 0.13 + r() * 0.1);
    const c = jitter(col('#ffffff'), r, 0.012, 0.05, 0.05).multiplyScalar(lerp(1, 0.82, 1 - f) * (0.9 + r() * 0.12));
    const rows = 9, cols = 7;
    const ids: number[][] = [];
    const grid: THREE.Vector3[][] = [];
    const d = V(0, 1, 0).multiplyScalar(Math.cos(theta)).addScaledVector(out, Math.sin(theta)).normalize();
    const p = base.clone();
    const ph = r() * 6.28;
    for (let a = 0; a < rows; a++) {
      const t = a / (rows - 1);
      if (a > 0) {
        // The blade rises from the stalk, then arches over toward the tip.
        d.applyAxisAngle(side, -(droop * (t * 1.6)) / (rows - 1)).normalize();
        p.addScaledVector(d, len / (rows - 1));
      }
      const n = V().crossVectors(side, d).normalize();
      const row: THREE.Vector3[] = [];
      for (let b = 0; b < cols; b++) {
        const x = (b / (cols - 1)) * 2 - 1;
        const hw = wid / 2;
        // Midrib sunk in a shallow V, the blade puckered between the veins, the margin rippled.
        const pucker = Math.sin(t * 22 + ph) * Math.sin(x * 4.2 + ph) * 0.0016 * smoothstep(0.3, 0.5, t);
        const lift = fold * hw * Math.abs(x) * smoothstep(0.15, 0.4, t) + pucker + (Math.abs(x) > 0.5 ? Math.sin(t * 17 + ph + x * 2) * 0.0035 * smoothstep(0.3, 0.6, t) * (Math.abs(x) - 0.5) * 2 : 0);
        row.push(p.clone().addScaledVector(side, x * hw).addScaledVector(n, lift));
      }
      grid.push(row);
    }
    const u0 = (i % 2) * 0.5;
    for (let a = 0; a < rows; a++) {
      const row: number[] = [];
      for (let b = 0; b < cols; b++) {
        const q = grid[a][b];
        const A = grid[Math.max(0, a - 1)][b], B = grid[Math.min(rows - 1, a + 1)][b];
        const C = grid[a][Math.max(0, b - 1)], D = grid[a][Math.min(cols - 1, b + 1)];
        const nn = V().crossVectors(D.clone().sub(C), B.clone().sub(A)).normalize();
        if (nn.y < 0) nn.multiplyScalar(-1);
        // Darker deep in the rosette.
        const k = lerp(0.7, 1, smoothstep(0, 0.45, a / (rows - 1)));
        row.push(leaves.vert(q, nn, u0 + 0.004 + (b / (cols - 1)) * 0.492, 0.004 + (a / (rows - 1)) * 0.992, c.clone().multiplyScalar(k), birth, birth > 0 ? crown : base, sway(q)));
      }
      ids.push(row);
    }
    for (let a = 0; a < rows - 1; a++) for (let b = 0; b < cols - 1; b++) leaves.quad(ids[a][b], ids[a][b + 1], ids[a + 1][b + 1], ids[a + 1][b]);
  }

  // Flowers: a loose posy above the leaves, each on its own pale hairy stalk from the crown.
  const stalkCol = col('#8fae6a');
  const calyxCol = col('#7ea455');
  const flower = (at: THREE.Vector3, nrm: THREE.Vector3, rad: number, cell: number, birth: number, spin: number) => {
    const n = nrm.clone().normalize();
    const a0 = perp(n), b0 = V().crossVectors(n, a0).normalize();
    const s = sway(at);
    const anchor = birth > 0 ? crown : at;
    const shade = jitter(col('#ffffff'), r, 0.006, 0.03, 0.04);
    // Front: a flat, very shallow saucer; back: the plain red reverse, a hair behind.
    for (const back of [false, true]) {
      const uv = uvCell(2, 2, back ? 2 : cell);
      const um = (uv[0] + uv[2]) / 2, vm = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2, vr = (uv[3] - uv[1]) / 2;
      const off = back ? -0.0007 : 0;
      const mid = flowers.vert(at.clone().addScaledVector(n, off - rad * 0.08), n, um, vm, shade, birth, anchor, s);
      const ring: number[] = [];
      const sides = 10;
      for (let k = 0; k < sides; k++) {
        const ang = spin + (k / sides) * Math.PI * 2;
        const o = a0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0, Math.sin(ang));
        const wav = 0.06 * Math.sin(k * 2.7 + spin * 3) * rad;
        const pq = at.clone().addScaledVector(o, rad).addScaledVector(n, off + wav + rad * 0.05);
        const nn = n.clone().addScaledVector(o, 0.25).normalize();
        ring.push(flowers.vert(pq, nn, um + Math.cos(ang) * ur * 0.98, vm + Math.sin(ang) * vr * 0.98, shade, birth, anchor, s));
      }
      for (let k = 0; k < sides; k++) flowers.tri(mid, ring[k], ring[(k + 1) % sides]);
    }
    // Calyx: a short green cup behind the flower.
    const wc = uvCell(2, 2, 3);
    const wu = (wc[0] + wc[2]) / 2, wv = (wc[1] + wc[3]) / 2;
    const cb = at.clone().addScaledVector(n, -rad * 0.75), ct = at.clone().addScaledVector(n, -rad * 0.08);
    const sides = 5;
    const lo: number[] = [], hi: number[] = [];
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const o = a0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0, Math.sin(ang));
      lo.push(flowers.vert(cb.clone().addScaledVector(o, rad * 0.16), o, wu, wv, calyxCol, birth, anchor, s));
      hi.push(flowers.vert(ct.clone().addScaledVector(o, rad * 0.24), o, wu, wv, calyxCol, birth, anchor, s));
    }
    for (let k = 0; k < sides; k++) flowers.quad(lo[k], lo[(k + 1) % sides], hi[(k + 1) % sides], hi[k]);
    return cb;
  };
  const bud = (at: THREE.Vector3, dir: THREE.Vector3, len: number, birth: number) => {
    const d = dir.clone().normalize();
    const a0 = perp(d), b0 = V().crossVectors(d, a0).normalize();
    const s = sway(at);
    const anchor = birth > 0 ? crown : at;
    const wc = uvCell(2, 2, 3);
    const wu = (wc[0] + wc[2]) / 2, wv = (wc[1] + wc[3]) / 2;
    const prof: [number, number, THREE.Color][] = [[0, 0.18, calyxCol], [0.35, 0.3, calyxCol], [0.62, 0.28, col('#8aa84e')], [0.8, 0.2, col('#9a1a20')], [0.94, 0.1, col('#8a121a')]];
    const sides = 5;
    const rings: number[][] = [];
    for (const [t, f, c] of prof) {
      const ring: number[] = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const o = a0.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0, Math.sin(ang));
        ring.push(flowers.vert(at.clone().addScaledVector(d, len * t).addScaledVector(o, len * f), o, wu, wv, c, birth, anchor, s));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) flowers.quad(rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]);
    const tip = flowers.vert(at.clone().addScaledVector(d, len), d, wu, wv, col('#8a121a'), birth, anchor, s);
    const L = rings.length - 1;
    for (let k = 0; k < sides; k++) flowers.tri(rings[L][k], rings[L][(k + 1) % sides], tip);
  };
  const stalk = (to: THREE.Vector3, birth: number) => {
    const from = crown.clone().add(V((r() - 0.5) * 0.006, 0, (r() - 0.5) * 0.006));
    const mid = V(lerp(from.x, to.x, 0.25), lerp(from.y, to.y, 0.6), lerp(from.z, to.z, 0.25));
    const pts = [from, mid.clone().lerp(from, 0.5), mid, mid.clone().lerp(to, 0.5), to];
    tube(wood, pts, 0.0016, 0.0012, 4, stalkCol, birth, birth > 0 ? crown : from, (i) => sway(pts[i]) * (i / 4), 1);
  };

  const NF = 14;
  for (let i = 0; i < NF; i++) {
    const az = i * 2.39996 + 1.1 + (r() - 0.5) * 0.5;
    const u = Math.sqrt((i + 0.5) / NF);
    const rr = u * 0.064;
    const at = V(Math.cos(az) * rr, lerp(0.12, 0.085, u) + (r() - 0.5) * 0.014, Math.sin(az) * rr);
    const out = V(Math.cos(az), 0, Math.sin(az));
    const nrm = V(0, 1, 0).addScaledVector(out, lerp(0.15, 0.95, u) + (r() - 0.5) * 0.3).add(V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3)).normalize();
    const birth = i < 10 ? 0 : clamp(0.2 + (i - 10) * 0.15);
    const rad = 0.0205 * (0.92 + r() * 0.14);
    const foot = flower(at, nrm, rad, r() < 0.5 ? 0 : 1, birth, r() * 6.28);
    stalk(foot, birth);
  }
  // Buds among the flowers.
  for (let i = 0; i < 4; i++) {
    const az = i * 2.2 + 0.4 + r();
    const rr = 0.012 + r() * 0.025;
    const at = V(Math.cos(az) * rr, 0.07 + r() * 0.02, Math.sin(az) * rr);
    const dir = V(Math.cos(az) * 0.4, 1, Math.sin(az) * 0.4).normalize();
    const birth = i < 2 ? 0 : 0.4 + i * 0.1;
    stalk(at, birth);
    bud(at, dir, 0.019 + r() * 0.005, birth);
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower ?? '#c3141c', spec.flower2 ?? '#f3c22e'),
    bark: { map: stemBark() },
    look: { translucency: 0.3, leafRoughness: 0.62, bend: 0.012, flutter: 0.003, alphaTest: 0.45 },
  };
};
