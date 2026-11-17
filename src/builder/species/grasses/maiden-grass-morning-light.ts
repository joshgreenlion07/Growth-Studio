import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, blade, bladeGroup, bladeMap, fitClump, plume, stalk, STRIP, texRng } from './shared-grasses';

/**
 * Miscanthus sinensis 'Morning Light' in early fall. An upright, vase-shaped
 * clump of leafy stems; along each stem very narrow leaves (about 1/4 in
 * wide) leave the stem at a steep angle and arch over at the tips, so the
 * clump reads as a fine-textured fountain. Each leaf is green with a thin
 * white margin on both edges and a pale midrib, which makes the whole plant
 * look silvery green from a distance. Late and sparse bloom: a few narrow,
 * reddish-copper fans held just above the foliage, opening silvery white.
 *
 * References:
 *  - NC State Extension Plant Toolbox, Miscanthus sinensis 'Morning Light'
 *    (plants.ces.ncsu.edu): upright 3-6 ft tall, spreads 2.5-3 ft in a
 *    rounded clump; leaves very narrow (under 1 in), to about 36 in long,
 *    green with white bands along each margin "giving a silvery effect";
 *    tiny reddish-copper flowers on terminal panicles above the foliage in
 *    mid to late September, becoming fluffy cream to silvery plumes of
 *    8-10 in; straw-colored in winter.
 *  - Rainy Side Gardeners, Miscanthus sinensis 'Morning Light': 4-6 ft tall,
 *    4 ft wide; narrow curved leaves with narrow white margins, silvery
 *    look; coppery plumes in early autumn; fades to tan in winter.
 *  - RHS, Miscanthus sinensis 'Morning Light' (AGM): 1-1.5 m tall,
 *    0.5-1 m wide.
 *  - Fast Growing Trees, Morning Light Miscanthus: 4-5 ft tall, 3-4 ft wide.
 * Catalog: 1.5 m to the plume tips (foliage about 1.25 m), 1.2 m across the
 * arching leaf tips; a 5 gal is about 2 ft of foliage.
 */

/** Two narrow fans of fine racemes: fresh reddish-copper (left) and opening, silvery (right). */
function plumeTex() {
  return leafTexture('miscanthus-morning-light-plume', 256, 512, (g, w, h) => {
    const r = texRng(91);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.995, y1 = h * 0.02;
      const open = c === 1;
      // 12-16 racemes from a short axis near the base, ascending close together.
      const n = 12 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const t0 = 0.02 + r() * 0.3;
        const spread = (r() - 0.5) * 2 * (open ? 0.44 : 0.34);
        const len = (0.68 + r() * 0.3) * (1 - t0 * 0.5);
        const x0 = cx + (r() - 0.5) * 3, ya = lerp(y0, y1, t0);
        const xe = cx + spread * cw * 0.95, ye = lerp(y0, y1, Math.min(1, t0 + len));
        const curve = (t: number) => [lerp(x0, xe, Math.pow(t, 0.8)), lerp(ya, ye, t)];
        g.strokeStyle = open ? 'rgba(160,135,118,0.9)' : 'rgba(105,68,52,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k <= 10; k++) {
          const [x, y] = curve(k / 10);
          if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
        // Spikelets along the raceme, with silky hairs (more and paler on the opening plume).
        for (let k = 0; k < 26; k++) {
          const t = 0.04 + (k / 26) * 0.96;
          const [x, y] = curve(t);
          const side = k % 2 ? 1 : -1;
          g.fillStyle = open
            ? ['#b3a290', '#a28c7a', '#bfae9a', '#94796a'][Math.floor(r() * 4)]
            : ['#7e5444', '#6e4a3c', '#8a6050', '#764e40', '#94705a'][Math.floor(r() * 5)];
          g.beginPath();
          g.ellipse(x + side * 2, y, 2.6, 5, side * 0.25, 0, Math.PI * 2);
          g.fill();
          const hairs = open ? 3 : 1;
          for (let q = 0; q < hairs; q++) {
            g.strokeStyle = open ? 'rgba(212,200,186,0.6)' : 'rgba(160,128,110,0.45)';
            g.lineWidth = 1.1;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + side * (3 + r() * (open ? 12 : 6)), y - 3 - r() * (open ? 10 : 6));
            g.stroke();
          }
        }
      }
    }
  });
}

/** Leaf strip: green with a thin white margin on each edge and a pale midrib (vertex color only shades it). */
function leafMap() {
  return bladeMap('morning-light', {
    rib: 0.06,
    veins: 0.05,
    extra: (g, x0, x1, h, strip) => {
      const sw = x1 - x0;
      const r = texRng(31 + strip);
      // A thin white margin each side (about 9% of the width) and a pale midrib.
      const m = sw * (strip ? 0.085 : 0.1), rib = sw * 0.035;
      g.fillStyle = strip ? '#52773a' : '#577c3e';
      g.fillRect(x0 + m, 0, sw / 2 - m - rib, h);
      g.fillRect(x0 + sw / 2 + rib, 0, sw / 2 - m - rib, h);
      // Slightly darker toward the midrib, lighter toward the white edge.
      for (const s of [-1, 1]) {
        const gx = g.createLinearGradient(x0 + sw / 2 + s * rib, 0, x0 + sw / 2 + s * (sw / 2 - m), 0);
        gx.addColorStop(0, 'rgba(30,60,20,0.18)');
        gx.addColorStop(1, 'rgba(255,255,255,0.08)');
        g.fillStyle = gx;
        if (s < 0) g.fillRect(x0 + m, 0, sw / 2 - m - rib, h);
        else g.fillRect(x0 + sw / 2 + rib, 0, sw / 2 - m - rib, h);
      }
      // Faint lengthwise streaks in the green.
      for (let i = 0; i < 30; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(20,50,15,0.08)' : 'rgba(230,240,210,0.08)';
        g.fillRect(x0 + m + r() * (sw - 2 * m), r() * h, 1.2, 30 + r() * 120);
      }
    },
  });
}

/**
 * Leafy stems rising in a vase, each with alternate leaves that arch out and
 * over; a skirt of basal leaves; a few late plumes on stems just above the
 * foliage.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const straw = col('#c8b58a');
  const crownR = Sp * 0.15;
  // Vertex colors only shade and vary the painted leaf (green with white edges).
  const cBase = col('#b8b28e'), cMid = [col('#c2c8a8'), col('#b8c09e'), col('#c8caae'), col('#bcc4a2')], cTip = [col('#c6c6a8'), col('#bec4a0')];

  // Basal leaves: the outer, older skirt, arching out and down low.
  bladeGroup(g, r, {
    count: 70, len: [0.45, 0.7], wid: [0.009, 0.011], tilt: [0.35, 0.95], bend: [1.6, 2.4], bendPow: 1.4, segs: 6, fold: 0.2, crownR,
    cBase, cMid: cMid.map((c) => c.clone().multiplyScalar(0.9)), cTip, dryTip: 0.25, cDry: straw,
    early: 0.7, sway: 0.75, ao: 0.45, taper: 1.6, rimLen: 0.85,
  });

  const stemC0 = col('#8a9468'), stemC1 = col('#7f9268'), stemDry = col('#b49a7a');
  /** Alternate leaves up a stem, two-ranked with a slow twist, arching out and over. */
  const leavesUp = (st: { pts: THREE.Vector3[] }, base: THREE.Vector3, az: number, tilt: number, birth: number, nodes: number, top: number, sw: (t: number) => number) => {
    let side = r() * Math.PI * 2;
    for (let k = 0; k < nodes; k++) {
      const t = lerp(0.12, top, (k + 0.3 * r()) / (nodes - 0.6));
      const at = st.pts[0].clone().lerp(st.pts[st.pts.length - 1], clamp(t));
      side += Math.PI + (r() - 0.5) * 0.7;
      // Leaves lean out mostly to the outside of the clump.
      const laz = az + Math.sin(side) * 1.2 + (r() - 0.5) * 0.4;
      const upper = clamp(t);
      const len = lerp(0.78, 0.56, upper) * (0.85 + r() * 0.3);
      const leaf = archPath(at, {
        az: laz,
        tilt: tilt + lerp(0.45, 0.18, upper) + r() * 0.2,
        bend: lerp(2.3, 1.55, upper) + (r() - 0.5) * 0.4,
        bendPow: 1.05 + r() * 0.3,
        len,
        segs: 7,
        roll: (r() - 0.5) * 0.8,
        twist: (r() - 0.5) * 1.2,
        floor: 0.01 + r() * 0.02,
      });
      const mid = jitter(cMid[Math.floor(r() * cMid.length)], r, 0.02, 0.05, 0.04);
      const before = g.sway.length;
      blade(g, leaf, {
        wid: lerp(0.0095, 0.0125, r()), fold: 0.22,
        cBase: cBase.clone().lerp(mid, 0.4), cMid: mid, cTip: mid.clone().lerp(cTip[Math.floor(r() * 2)], 0.6),
        cEnd: r() < 0.12 ? straw : undefined,
        uv: STRIP[r() < 0.5 ? 0 : 1], birth: clamp(birth + (upper > 0.8 ? 0.05 : 0)), sway: 0.6, ao: lerp(0.55, 0.95, upper), taper: 1.5, baseW: 0.7,
      });
      // The leaf moves with the stem it sits on, and collapses onto the stem base before it is born.
      const s0 = sw(t);
      for (let q = before; q < g.sway.length; q++) g.sway[q] = clamp(s0 + g.sway[q] * 0.7);
      for (let q = before * 3; q < g.anchor.length; q += 3) { g.anchor[q] = base.x; g.anchor[q + 1] = base.y; g.anchor[q + 2] = base.z; }
    }
  };

  // Leafy stems: upright in the middle, leaning out toward the rim (the vase).
  const N = 128;
  for (let i = 0; i < N; i++) {
    const u = Math.pow((i + r()) / N, 0.85);
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const rr = crownR * clamp(0.15 + 0.85 * u + (r() - 0.5) * 0.2);
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const tilt = lerp(0.05, 0.62, u) + (r() - 0.5) * 0.08;
    const slen = lerp(0.85, 0.5, u) * (0.85 + r() * 0.25);
    const st = archPath(base, { az, tilt, bend: 0.08 + u * 0.25 + r() * 0.08, bendPow: 1.5, len: slen, segs: 3, crowd: 1, azCurl: (r() - 0.5) * 0.2 });
    const birth = r() < 0.5 - u * 0.15 ? 0 : clamp(0.1 + r() * 0.5 + u * 0.2, 0, 0.85);
    const sw = (t: number) => Math.pow(t, 1.4) * 0.55;
    stalk(g, st.pts, 0.0024, 0.0015, stemC0, stemC1, birth, sw);
    leavesUp(st, base, az, tilt, birth, 5 + Math.floor(r() * 3), 1, sw);
  }

  // A few late flowering stems: leafy below, bare and straw-tinted above, the plume held just over the leaves.
  const NP = 6;
  for (let i = 0; i < NP; i++) {
    const az = i * 2.39996 + r() * 0.5, rr = crownR * (0.3 + 0.6 * Math.sqrt(r()));
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const pl = lerp(0.2, 0.25, r());
    const len = lerp(0.9, 1.0, r());
    const tilt = 0.08 + r() * 0.2;
    const st = archPath(base, { az, tilt, bend: 0.05 + r() * 0.12, len, segs: 4, crowd: 1, azCurl: (r() - 0.5) * 0.2 });
    const birth = clamp(0.35 + r() * 0.45);
    const frac = len / (len + pl);
    const sw = (t: number) => Math.pow(t, 1.5) * 0.7;
    const mid = Math.floor(st.pts.length * 0.6);
    stalk(g, st.pts.slice(0, mid + 1), 0.0032, 0.0026, stemC0, stemC1, birth, (t) => sw(t * frac * (mid / (st.pts.length - 1))));
    stalk(g, st.pts.slice(mid), 0.0026, 0.002, stemC1, stemDry, birth, (t) => sw(lerp(mid / (st.pts.length - 1), 1, t) * frac), [0.25, 0.5], base);
    leavesUp(st, base, az, tilt, birth, 4, 0.62, (t) => sw(t * frac));
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.3 + r() * 0.4, bendPow: 1.5, len: pl, segs: 3, crowd: 1, roll: r() * 3 });
    const fresh = i % 3 !== 0;
    plume(fl, pp, pl * 0.62, fresh ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#ffffff'), r, 0.01, 0.03, 0.05), birth, base, (t) => sw(clamp(frac + t * (1 - frac))));
  }

  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: leafMap(),
    flowerMap: plumeTex(),
    look: { leafRoughness: 0.7, translucency: 0.35, bend: 0.18, flutter: 0.014 },
  };
};
