import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { arcPath, crossCards, fitToSize, stemBark } from './shared-perennials';

/**
 * Foxtail fern, Asparagus densiflorus 'Myersii'. A fountain of stiff plumes
 * from a tight crown: each plume is a stem ringed all the way around by short
 * branchlets carrying tufts of needle-like cladodes, tapering to a point, so
 * it reads as a fluffy bottlebrush. Bright apple green, lighter at the
 * growing tips, with a few red berries tucked in.
 */

const S = 256;

/** One branchlet: a short twig with tufts of needles fanning forward. Base at the cell's bottom center. */
function branchlet(g: CanvasRenderingContext2D, r: () => number, dark: boolean) {
  const x0 = S / 2, y0 = S - 2;
  const topY = S * (0.42 + r() * 0.08);
  const lean = (r() - 0.5) * S * 0.12;
  g.lineCap = 'round';
  g.strokeStyle = dark ? '#4a7a22' : '#568a26';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(x0 + lean * 0.3, (y0 + topY) / 2, x0 + lean, topY);
  g.stroke();
  const nodes = 9;
  for (let n = 0; n < nodes; n++) {
    const t = (n + 0.3 + r() * 0.5) / nodes;
    const nx = x0 + lean * t * t, ny = lerp(y0 - 6, topY, t);
    const count = 5 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      // Needles fan out on both sides and forward; the last tuft closes the tip.
      const side = k % 2 ? 1 : -1;
      const a = -Math.PI / 2 + side * (0.1 + r() * (n === nodes - 1 ? 0.7 : 1.25));
      const len = S * (0.3 + r() * 0.16) * lerp(1, 0.85, t);
      const ex = clamp(nx + Math.cos(a) * len, 5, S - 5), ey = Math.max(5, ny + Math.sin(a) * len);
      const bend = (r() - 0.5) * 10;
      const grad = g.createLinearGradient(nx, ny, ex, ey);
      const v = r();
      if (dark) {
        grad.addColorStop(0, v < 0.5 ? '#3c7a1e' : '#438322');
        grad.addColorStop(1, v < 0.5 ? '#4f9226' : '#589b2a');
      } else {
        grad.addColorStop(0, v < 0.5 ? '#438522' : '#4a8d25');
        grad.addColorStop(1, v < 0.3 ? '#579c2a' : v < 0.7 ? '#5fa62d' : '#69b031');
      }
      g.strokeStyle = grad;
      g.lineWidth = 3.4 + r() * 1.2;
      g.beginPath();
      g.moveTo(nx, ny);
      g.quadraticCurveTo((nx + ex) / 2 + bend, (ny + ey) / 2, ex, ey);
      g.stroke();
    }
  }
}

function foxtailAtlas(): THREE.Texture {
  return leafTexture('foxtail-fern-leaves', 1024, 1024, (g) => {
    const r = rng('foxtail-tex');
    // Rows 0 and 1: eight branchlets (row 1 is the darker, older set).
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate((i % 4) * S, Math.floor(i / 4) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      branchlet(g, r, i >= 4);
      g.restore();
    }
    // Row at y 512..640: berries (two cells) in 128 px cells.
    for (let i = 0; i < 2; i++) {
      const cx = 64 + i * 128, cy = 576, rad = 40;
      const grad = g.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, rad);
      grad.addColorStop(0, i ? '#ff8a6a' : '#ff7a5c');
      grad.addColorStop(0.35, i ? '#d92a1c' : '#e23422');
      grad.addColorStop(1, '#8e1410');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(cx - 13, cy - 15, 7, 5, -0.6, 0, Math.PI * 2);
      g.fill();
    }
    // Bottom strip y 640..1024: an opaque mat of needles, wrapped around each plume's solid core
    // so nothing shows through between the branchlets.
    g.fillStyle = '#356b1b';
    g.fillRect(0, 640, 1024, 384);
    for (let i = 0; i < 5000; i++) {
      const x = r() * 1024, y = 640 + r() * 384;
      const a = (r() - 0.5) * 2.4;
      const len = 14 + r() * 26;
      const v = r();
      g.strokeStyle = v < 0.35 ? '#2f6218' : v < 0.7 ? '#3f7a1f' : '#4d8c25';
      g.lineWidth = 2 + r() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  });
}

/** Plume radius along its length, 0..1: full width almost from the base to three quarters, then a pointed tip. */
function plumeProfile(t: number): number {
  return smoothstep(0.015, 0.09, t) * lerp(1, 0.07, Math.pow(clamp((t - 0.74) / 0.26), 1.25));
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const wood = new GeoBuilder();

  const cLight = col('#ffffff'), cMid = col('#eaf2e0'), cOld = col('#d2e2c2');
  const stemCol = col('#5f8a30');
  const cell = (i: number): [number, number, number, number] => [(i % 4) * 0.25, 1 - (Math.floor(i / 4) + 1) * 0.25, (i % 4 + 1) * 0.25, 1 - Math.floor(i / 4) * 0.25];
  const berryUV = (i: number): [number, number, number, number] => [i * 0.125, 1 - 640 / 1024, (i + 1) * 0.125, 1 - 512 / 1024];

  const N = 18;
  for (let i = 0; i < N; i++) {
    // Inner plumes stand up, outer ones arch out and over.
    const ring = i < 4 ? 0 : i < 11 ? 1 : 2;
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const lean0 = ring === 0 ? 0.05 + r() * 0.2 : ring === 1 ? 0.35 + r() * 0.25 : 0.7 + r() * 0.3;
    const lean1 = ring === 0 ? 0.15 + r() * 0.35 : ring === 1 ? 0.75 + r() * 0.35 : 1.25 + r() * 0.35;
    const L = (ring === 0 ? 0.6 + r() * 0.06 : ring === 1 ? 0.5 + r() * 0.1 : 0.42 + r() * 0.08) * (H / 0.6);
    const br = 0.015 + r() * 0.035;
    const base = V(Math.cos(az) * br, 0, Math.sin(az) * br);
    const pts = arcPath(base, az, lean0, lean1, L, 10, r, 0.12);
    // Half the plumes are there at install; the rest come up from the crown over the years.
    const birth = i % 2 === 0 || i < 3 ? 0 : clamp(0.1 + r() * 0.75, 0, 0.85);
    // Plumes present at install are the stoutest, so the young plant still reads as full foxtails.
    const Rmax = (0.037 + r() * 0.004) * (birth === 0 ? 1.08 : 1) * (H / 0.6);
    const anchor = birth > 0 ? base : null;
    const age = r(); // older plumes are deeper green
    const swayAt = (t: number) => clamp(Math.pow(t, 1.4) * (ring === 0 ? 0.75 : 0.6));

    tube(wood, [V(base.x, -0.03, base.z), ...[0, 2, 4, 6, 8, 10].map((k) => pts[k])], 0.0042, 0.0012, 4, stemCol, birth, base, (k) => swayAt(Math.max(0, k - 1) / 5), 1);

    // Core: a solid needle-textured cylinder at half the plume's radius. It hides the stem and
    // closes every gap between branchlets, so the plume is opaque from any angle.
    {
      const sides = 6, rows = 12;
      const a0 = perp(along(pts, 0).dir);
      let prev: number[] | null = null;
      for (let k = 0; k <= rows; k++) {
        const t = k / rows;
        const at = along(pts, t);
        const a = a0.clone().addScaledVector(at.dir, -a0.dot(at.dir)).normalize();
        const b = V().crossVectors(at.dir, a).normalize();
        const rad = Math.max(0.0015, Rmax * 0.36 * plumeProfile(Math.max(t, 0.03)));
        const c = cOld.clone().multiplyScalar(0.5);
        const row: number[] = [];
        for (let q = 0; q <= sides; q++) {
          const ang = (q / sides) * Math.PI * 2;
          const n = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
          n.y += 0.35;
          row.push(leaves.vert(at.p.clone().addScaledVector(n, rad), n.clone().normalize(), t * 0.99 + 0.005, 0.01 + (q / sides) * 0.355, c, birth, anchor ?? at.p, swayAt(t)));
        }
        if (prev) for (let q = 0; q < sides; q++) leaves.quad(prev[q], prev[q + 1], row[q + 1], row[q]);
        prev = row;
      }
    }

    // Branchlets spiral all around the stem, angled forward, shorter toward the tip.
    const count = Math.round(L * 740);
    let spin = r() * 6.28;
    for (let k = 0; k < count; k++) {
      const t = lerp(0.02, 0.995, (k + r()) / count);
      const env = plumeProfile(t);
      if (env < 0.03) continue;
      const at = along(pts, t);
      spin += 2.39996 + (r() - 0.5) * 0.5;
      // Half stand straight out (the fuzzy outline); half lean forward and overlap like shingles (the solid surface).
      const shingle = k % 2 === 0;
      const ang = (shingle ? 0.62 + r() * 0.3 : lerp(1.4, 0.75, smoothstep(0.7, 1, t)) + (r() - 0.5) * 0.3);
      const dir = deflect(at.dir, ang, spin);
      const len = Math.max(0.014, (Rmax * env * (0.92 + r() * 0.2)) / Math.sin(ang));
      const wid = Math.max(0.016, len * (0.95 + r() * 0.2));
      const face = shingle ? dir.clone().addScaledVector(at.dir, -dir.dot(at.dir)).normalize().add(V((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5)).normalize() : V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const tip = smoothstep(0.55, 1, t);
      const c = jitter(cMid.clone().lerp(cOld, age * 0.7 * (1 - tip)).lerp(cLight, tip * 0.6 + r() * 0.15), r, 0.008, 0.03, 0.02);
      const older = r() < 0.3 + age * 0.3 * (1 - tip);
      const s = swayAt(t);
      leafQuad(leaves, at.p, dir, face, len, wid, cell((older ? 4 : 0) + Math.floor(r() * 4)), c, birth, anchor ?? at.p, {
        center: at.p.clone().add(V(0, -Rmax * 1.3, 0)), radii: V(1, 1, 1), normalBend: 0.8, sway0: s, sway1: clamp(s + 0.04),
      });
    }
    // Pointed tip tuft.
    const end = along(pts, 1);
    crossCards(leaves, end.p.clone().addScaledVector(end.dir, -0.012), end.dir, 0.03, 0.02, cell(Math.floor(r() * 4)), cLight, birth, anchor ?? end.p, 2, r() * 3, { sway0: swayAt(1), sway1: swayAt(1) });

    // A few red berries tucked among the needles on some plumes.
    if (i % 4 === 1) {
      const nb = 2 + Math.floor(r() * 3);
      for (let k = 0; k < nb; k++) {
        const t = 0.3 + r() * 0.45;
        const at = along(pts, t);
        const out = deflect(at.dir, 1.57, r() * 6.28);
        if (out.y < -0.2) out.y *= -1;
        const p = at.p.clone().addScaledVector(out, Rmax * plumeProfile(t) * (0.62 + r() * 0.2));
        const d = V(r() - 0.5, 1, r() - 0.5).normalize();
        crossCards(leaves, p.clone().addScaledVector(d, -0.0055), d, 0.011, 0.011, berryUV(k % 2), col('#ffffff'), birth, anchor ?? at.p, 2, r() * 3, { sway0: swayAt(t), sway1: swayAt(t), normalBend: 0 });
      }
    }
  }

  fitToSize([leaves, wood], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    leafMap: foxtailAtlas(),
    bark: { map: stemBark() },
    look: { alphaTest: 0.3, translucency: 0.2, leafRoughness: 0.85, bend: 0.06, flutter: 0.004 },
  };
};
