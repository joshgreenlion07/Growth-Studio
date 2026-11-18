import * as THREE from 'three';
import { GeoBuilder, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { arcPath, crossCards, fitToSize, stemBark } from './shared-perennials';

/**
 * Foxtail fern, Asparagus densiflorus 'Myersii'. A dense, rounded clump of many stiff plumes from a tuberous crown:
 * the inner plumes stand straight up, the outer ones lean out and arch a little. Each plume is a stem clothed all
 * the way round with short branchlets carrying tufts of tiny needle-like cladodes, so it is a soft, round
 * bottle-brush (a "fox tail") about 2-3 in thick, full to about half its length and then tapering to a point.
 * Bright lime to yellow-green, the growing tips paler and yellower, older plumes and the inside of the clump deeper
 * green. Small white flowers and red berries are only an occasional autumn extra on older clumps.
 *
 * References:
 * - Monrovia, Foxtail Fern (monrovia.com/foxtail-fern.html): moderate growth to 2 ft tall, 2-3 ft wide; long,
 *   upright, plume-like stems of soft needle-like leaves, light green.
 * - Everde Growers, Myers Foxtail Fern: 1-3 ft tall x 3-4 ft wide in the ground. Proven Winners: 18 in - 3 ft
 *   tall and wide. RHS: erect to arching stems of fine plume-like foliage, to 50 cm in a pot.
 * - KPU Plant Database (plantdatabase.kpu.ca/Plant/asmy): branches erect, dense, forming cylindrical plumes;
 *   lime green cladodes in threes, mostly 6-9 mm long x about 1 mm wide.
 * - The finished job's photos (5 gal plants, 3 weeks after planting): rounded clumps about 1.5-1.7 ft tall x
 *   2.4-3 ft wide of 25-30 plumes, 2 in thick, bright lime to yellow-green.
 *
 * Targets: mature (3 years) 2.5 ft x 3.5 ft (catalog 0.75 x 1.05 m), about 40 plumes up to 2.5 ft long and 3 in
 * thick; about two thirds of them already there at install (catalog 5 gal 0.5 x 0.75 m, plumes about 20 in x 2 in).
 */

const S = 256;

/**
 * One branchlet as a tuft: a short twig from the cell's bottom center, ringed by tiny needles in threes that fan
 * forward and out, so the card reads as a soft fan of needles (not a leaflet). Painted in light, nearly neutral
 * values; vertex color sets the green.
 */
function tuft(g: CanvasRenderingContext2D, r: () => number) {
  const x0 = S / 2, y0 = S - 6;
  const top = S * (0.42 + r() * 0.08);
  const lean = (r() - 0.5) * S * 0.06;
  g.lineCap = 'round';
  g.strokeStyle = '#b4bca4';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x0 + lean, top);
  g.stroke();
  const nodes = 11;
  for (let n = 0; n < nodes; n++) {
    const t = (n + 0.2 + r() * 0.5) / nodes;
    const nx = x0 + lean * t, ny = lerp(y0 - 4, top, t);
    const count = 9 + Math.floor(r() * 5);
    for (let k = 0; k < count; k++) {
      // Low needles splay wide, high ones point forward; together they fill a fan.
      const spread = lerp(1.35, 0.5, t) * (k / (count - 1) * 2 - 1) + (r() - 0.5) * 0.25;
      const a = -Math.PI / 2 + spread;
      const len = S * (0.16 + r() * 0.26) * lerp(1, 0.7, t);
      const ex = clamp(nx + Math.cos(a) * len, 6, S - 6), ey = Math.max(6, ny + Math.sin(a) * len);
      const bend = (r() - 0.5) * 10;
      const lum = r();
      const grad = g.createLinearGradient(nx, ny, ex, ey);
      grad.addColorStop(0, lum < 0.4 ? '#c2caae' : '#ccd4ba');
      grad.addColorStop(1, lum < 0.3 ? '#c8d0b4' : lum < 0.75 ? '#d0d8bc' : '#d8dec4');
      g.strokeStyle = grad;
      g.lineWidth = 4 + r() * 2;
      g.beginPath();
      g.moveTo(nx, ny);
      g.quadraticCurveTo((nx + ex) / 2 + bend, (ny + ey) / 2, ex, ey);
      g.stroke();
    }
  }
}

function foxtailAtlas(): THREE.Texture {
  return leafTexture('foxtail-fern-plumes-v2', 1024, 1024, (g) => {
    const r = rng('foxtail-tex-v2');
    // Rows 0 and 1: eight branchlet tufts.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate((i % 4) * S, Math.floor(i / 4) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      tuft(g, r);
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
    // Bottom strip y 640..1024: an opaque mat of needles for each plume's solid core, so no gap shows through.
    g.fillStyle = '#c6ceb4';
    g.fillRect(0, 640, 1024, 384);
    for (let i = 0; i < 9000; i++) {
      const x = r() * 1024, y = 640 + r() * 384;
      const a = (r() - 0.5) * 2.4 - Math.PI / 2;
      const len = 12 + r() * 22;
      const v = r();
      g.strokeStyle = v < 0.3 ? '#949e80' : v < 0.6 ? '#c6ceb2' : v < 0.88 ? '#d8dec6' : '#e8ecd8';
      g.lineWidth = 3 + r() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  });
}

/** Plume radius along its length, 0..1: fills out just above the base, stays full to about half, then a long point. */
function plumeProfile(t: number): number {
  const fill = lerp(0.45, 1, smoothstep(0.0, 0.14, t));
  const taper = 1 - 0.93 * Math.pow(clamp((t - 0.56) / 0.44), 1.25);
  return fill * taper;
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder();
  const wood = new GeoBuilder();

  // Built at a natural scale (the tallest plume about 1 long) and fitted to the catalog size at the end.
  const cTip = col('#aebc4e'), cMid = col('#88a23c'), cOld = col('#708c34'), cCore = col('#84a03a');
  const stemCol = col('#7c9a44');
  const cell = (i: number): [number, number, number, number] => [(i % 4) * 0.25, 1 - (Math.floor(i / 4) + 1) * 0.25, (i % 4 + 1) * 0.25, 1 - Math.floor(i / 4) * 0.25];
  const berryUV = (i: number): [number, number, number, number] => [i * 0.125, 1 - 640 / 1024, (i + 1) * 0.125, 1 - 512 / 1024];
  const R = 0.074;

  const N = 44;
  for (let i = 0; i < N; i++) {
    // 0 a plume in the middle of the clump .. 1 one at its rim (more of them toward the rim, like the crown's area).
    const o = Math.sqrt((i + 0.5) / N);
    const az = i * 2.39996 + (r() - 0.5) * 0.4;
    const lean0 = lerp(0.03, 0.72, Math.pow(o, 1.2)) + (r() - 0.5) * 0.14;
    const lean1 = lean0 + lerp(0.04, 0.55, o * o) + (r() - 0.5) * 0.1;
    const L = lerp(1, 0.62, Math.pow(o, 1.5)) * (0.86 + r() * 0.2);
    const br = 0.15 * o + r() * 0.015;
    const base = V(Math.cos(az) * br, 0, Math.sin(az) * br);
    const pts = arcPath(base, az, lean0, lean1, L, 10, r, 0.06);
    // About two thirds of the plumes are there at install; the rest come up from the crown over the years.
    const birth = r() < 0.68 || i < 4 ? 0 : clamp(0.22 + r() * 0.63, 0, 0.85);
    const anchor = birth > 0 ? base : null;
    const Rp = R * (0.9 + r() * 0.2);
    const age = r(); // older plumes are deeper green
    const swayAt = (t: number) => clamp(Math.pow(t, 1.4) * lerp(0.75, 0.6, o));
    const out = V(Math.cos(az), 0, Math.sin(az)); // away from the clump's middle

    // The bare foot of the stem, mostly hidden in the plume.
    tube(wood, [V(base.x, -0.03, base.z), pts[0], pts[1], pts[2]], 0.006, 0.003, 4, stemCol, birth, base, (k) => swayAt(Math.max(0, k - 1) / 10), 1);

    // Core: a solid, needle-textured cylinder at half the plume's radius. It closes every gap between the
    // branchlets, so the plume is a solid round brush from any angle.
    {
      const sides = 7, rows = 10;
      const a0 = perp(along(pts, 0).dir);
      let prev: number[] | null = null;
      for (let k = 0; k <= rows; k++) {
        const t = lerp(0.03, 1, k / rows);
        const at = along(pts, t);
        const a = a0.clone().addScaledVector(at.dir, -a0.dot(at.dir)).normalize();
        const b = V().crossVectors(at.dir, a).normalize();
        const rad = Math.max(0.002, Rp * 0.72 * plumeProfile(t));
        const shade = lerp(0.55, 1, smoothstep(0.0, 0.55, at.p.y));
        const c = cCore.clone().multiplyScalar(shade);
        const row: number[] = [];
        for (let q = 0; q <= sides; q++) {
          const ang = (q / sides) * Math.PI * 2;
          const n = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
          row.push(leaves.vert(at.p.clone().addScaledVector(n, rad), n.clone().add(V(0, 0.15, 0)).normalize(), t * 0.99 + 0.005, 0.01 + (q / sides) * 0.355, c, birth, anchor ?? at.p, swayAt(t)));
        }
        if (prev) for (let q = 0; q < sides; q++) leaves.quad(prev[q], prev[q + 1], row[q + 1], row[q]);
        prev = row;
      }
    }

    // Branchlets all round the stem, angled toward the tip, shorter toward it.
    const count = Math.round(L * 260);
    for (let k = 0; k < count; k++) {
      const t = lerp(0.03, 0.985, (k + r()) / count);
      const env = plumeProfile(t);
      const at = along(pts, t);
      // Random spin, so a plume seen end-on shows a fuzzy end rather than a spiral.
      const radial = deflect(at.dir, Math.PI / 2, r() * Math.PI * 2);
      // Half lie forward over the surface like shingles (the solid face); half stand out (the soft outline).
      const shingle = k % 5 < 3;
      const ang = shingle ? 0.42 + r() * 0.2 : lerp(1.0, 0.7, smoothstep(0.6, 1, t)) + (r() - 0.5) * 0.3;
      const dir = at.dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(radial, Math.sin(ang)).normalize();
      const root = at.p.clone().addScaledVector(radial, Rp * env * 0.6);
      const len = Math.max(0.012, (Rp * env * (shingle ? 0.45 + r() * 0.2 : 0.3 + r() * 0.2)) / Math.max(0.45, Math.sin(ang)));
      const wid = Math.max(0.014, len * (0.95 + r() * 0.2));
      const tangent = V().crossVectors(at.dir, radial).normalize();
      // Standing tufts face every way between sideways and along the plume, so some face any viewer, even end-on.
      const phi = r() * Math.PI * 0.5;
      const face = shingle ? radial.clone().addScaledVector(tangent, (r() - 0.5) * 0.6).normalize() : tangent.clone().multiplyScalar(Math.cos(phi)).addScaledVector(at.dir, Math.sin(phi)).addScaledVector(radial, (r() - 0.5) * 0.5).normalize();
      // Color: deeper green low in the clump, on older plumes and on the side facing into the clump; pale tips.
      const tip = smoothstep(0.55, 1, t);
      const inward = lerp(0.7, 1, smoothstep(-0.6, 0.3, radial.dot(out)));
      const low = lerp(0.45, 1, smoothstep(0.0, 0.55, at.p.y));
      const c = jitter(cMid.clone().lerp(cOld, age * 0.8 * (1 - tip)).lerp(cTip, tip * 0.45), r, 0.008, 0.03, 0.02).multiplyScalar(inward * low);
      const s = swayAt(t);
      leafQuad(leaves, root, dir, face, len, wid, cell(Math.floor(r() * 8)), c, birth, anchor ?? at.p, {
        center: at.p, radii: V(1, 1, 1), normalBend: 0.85, sway0: s, sway1: clamp(s + 0.03),
      });
    }
    // Pointed tip tuft.
    const end = along(pts, 1);
    crossCards(leaves, end.p.clone().addScaledVector(end.dir, -0.02), end.dir, 0.05, 0.03, cell(Math.floor(r() * 8)), cTip.clone().lerp(cMid, 0.4), birth, anchor ?? end.p, 2, r() * 3, { sway0: swayAt(1), sway1: swayAt(1) });

    // On a few of the older plumes, red berries tucked among the needles; only on an established clump.
    if (i % 6 === 2) {
      const nb = 2 + Math.floor(r() * 3);
      for (let k = 0; k < nb; k++) {
        const t = 0.25 + r() * 0.35;
        const at = along(pts, t);
        const outB = deflect(at.dir, 1.57, r() * 6.28);
        if (outB.y < -0.2) outB.y *= -1;
        const p = at.p.clone().addScaledVector(outB, Rp * plumeProfile(t) * (0.7 + r() * 0.15));
        const d = V(r() - 0.5, 1, r() - 0.5).normalize();
        crossCards(leaves, p.clone().addScaledVector(d, -0.007), d, 0.014, 0.014, berryUV(k % 2), col('#ffffff'), Math.max(birth, 0.8), at.p, 2, r() * 3, { sway0: swayAt(t), sway1: swayAt(t), normalBend: 0 });
      }
    }
  }

  fitToSize([leaves, wood], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    leafMap: foxtailAtlas(),
    bark: { map: stemBark() },
    look: { alphaTest: 0.42, translucency: 0.16, leafRoughness: 0.85, bend: 0.05, flutter: 0.003 },
  };
};
