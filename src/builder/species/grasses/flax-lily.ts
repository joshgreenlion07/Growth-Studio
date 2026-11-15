import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, blade, bladeGroup, bladeMap, fitClump, plume, stalk, STRIP, texRng } from './shared-grasses';

/** Strap leaf strips in true color: green with crisp cream-white margins and the odd cream pinstripe. */
function straps() {
  return bladeMap('dianella-variegata', {
    fill: '#5d8a3e',
    rib: 0.2,
    veins: 0.07,
    extra: (g, x0, x1, h, strip) => {
      const w = x1 - x0;
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, '#4f7c36');
      grad.addColorStop(0.5, '#6a9646');
      grad.addColorStop(1, '#527f38');
      g.fillStyle = grad;
      g.fillRect(x0, 0, w, h);
      g.fillStyle = '#f1edcf';
      const m = w * (strip === 0 ? 0.17 : 0.22);
      g.fillRect(x0, 0, m, h);
      g.fillRect(x1 - m * (strip === 0 ? 1 : 0.7), 0, m, h);
      g.fillStyle = '#e4e6bc';
      if (strip === 0) g.fillRect(x0 + w * 0.36, 0, 2, h);
      else g.fillRect(x0 + w * 0.64, 0, 3, h);
    },
  });
}

/** Two airy sprays: wiry branchlets with small blue starry flowers and glossy blue-purple berries. */
function sprays() {
  return leafTexture('dianella-spray', 256, 256, (g, w, h) => {
    const r = texRng(19);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      g.strokeStyle = '#4a5a3a';
      g.lineCap = 'round';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, h * 0.08);
      g.stroke();
      for (let i = 0; i < 9; i++) {
        const y = lerp(h * 0.86, h * 0.1, i / 8);
        const side = i % 2 ? 1 : -1;
        const reach = cw * (0.42 - (i / 8) * 0.22) * (0.7 + r() * 0.3);
        const ex = cx + side * reach, ey = y - reach * (0.5 + r() * 0.4);
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + side * reach * 0.5, y - reach * 0.1, ex, ey);
        g.stroke();
        for (let k = 0; k < 3; k++) {
          const t = 0.45 + k * 0.27;
          const px = lerp(cx, ex, t) + (r() - 0.5) * 6, py = lerp(y, ey, t) + 5 + r() * 6;
          if ((c === 0) === (r() < 0.7)) {
            // Berry.
            g.fillStyle = ['#3b3fa6', '#4a3aa0', '#2f4bb0'][Math.floor(r() * 3)];
            g.beginPath();
            g.ellipse(px, py, 3.6, 4.4, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(200,210,255,0.75)';
            g.beginPath();
            g.arc(px - 1.1, py - 1.4, 1.1, 0, Math.PI * 2);
            g.fill();
          } else {
            // Six-tepal flower with a yellow center.
            g.fillStyle = ['#6f78d6', '#7a6fd0', '#8a8ae0'][Math.floor(r() * 3)];
            for (let p = 0; p < 6; p++) {
              g.save();
              g.translate(px, py);
              g.rotate((p / 6) * Math.PI * 2);
              g.beginPath();
              g.ellipse(0, -3.6, 1.8, 3.6, 0, 0, Math.PI * 2);
              g.fill();
              g.restore();
            }
            g.fillStyle = '#e6c23a';
            g.beginPath();
            g.arc(px, py, 1.6, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
  });
}

/**
 * Dianella tasmanica 'Variegata' (variegated flax lily): fans of flat,
 * keeled strap leaves about 1 in wide, green with crisp cream-white margins,
 * upright then arching; a few wiry stems carry small blue flowers and
 * blue-purple berries above the leaves.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const white = col('#ffffff');
  const FANS = 20;
  for (let f = 0; f < FANS; f++) {
    const u = (f + 0.5) / FANS;
    const a0 = f * 2.39996, rr = Sp * 0.16 * Math.sqrt(u);
    const crown = V(Math.cos(a0) * rr, -0.004, Math.sin(a0) * rr);
    // Fans face roughly across the radius, and lean outward the farther they sit from the center.
    const fanAz = a0 + Math.PI / 2 + (r() - 0.5) * 1.4;
    const lean = 0.05 + u * 0.25;
    const n = 6 + Math.floor(r() * 3);
    const fanBirth = f < 11 ? 0 : clamp(0.15 + r() * 0.6);
    for (let j = 0; j < n; j++) {
      // Leaves alternate left and right of the fan; outer ones are older, lower and shorter.
      const rank = Math.floor(j / 2), sgn = j % 2 ? 1 : -1;
      const ranks = Math.ceil(n / 2);
      const k = rank / Math.max(1, ranks - 1);
      const inPlane = sgn * (0.07 + k * 0.5 + r() * 0.08);
      // Combine the in-plane splay with the fan's outward lean.
      const dx = Math.cos(fanAz) * Math.sin(inPlane) + Math.cos(a0) * Math.sin(lean);
      const dz = Math.sin(fanAz) * Math.sin(inPlane) + Math.sin(a0) * Math.sin(lean);
      const tilt = clamp(Math.hypot(dx, dz), 0.03, 1.3);
      const az = Math.atan2(dz, dx);
      const len = lerp(0.4, 0.53, r()) * (1 - 0.3 * k) * (rank === 0 ? 0.82 : 1);
      const base = crown.clone().add(V(Math.cos(fanAz) * sgn * rank * 0.006, 0, Math.sin(fanAz) * sgn * rank * 0.006));
      const path = archPath(base, {
        az, tilt, bend: lerp(0.35, 1.0, r()) + k * 0.5, bendPow: 2.0, len, segs: 9, azCurl: (r() - 0.5) * 0.3,
        // The flat of the leaf faces the fan axis, as in a real two-ranked fan.
        roll: (r() - 0.5) * 0.3, twist: (r() - 0.5) * 0.7, floor: 0.01,
      });
      const shade = jitter(white, r, 0, 0, 0.0).multiplyScalar(lerp(1, 0.82, k) * (0.9 + r() * 0.1));
      const old = k > 0.7 && r() < 0.4;
      blade(g, path, {
        wid: lerp(0.021, 0.028, r()), cols: 3, fold: 0.16, baseW: 0.5, widest: 0.35, taper: 2.6,
        cBase: col('#e9e6c0').multiply(shade), cMid: shade, cTip: rank === 0 ? col('#f4ffdc').multiply(shade) : shade,
        cEnd: old ? col('#b89a62') : undefined, ao: 0.55, uv: STRIP[r() < 0.5 ? 0 : 1],
        birth: clamp(fanBirth + (rank === 0 && r() < 0.5 ? 0.15 : 0)), sway: 0.75, nUp: 0.15,
      });
    }
  }
  // A skirt of old, fully dry leaves at the base.
  bladeGroup(g, r, {
    count: 14, len: [0.14, 0.22], wid: [0.014, 0.02], tilt: [1.2, 1.5], bend: [0.1, 0.4], segs: 4, cols: 3, fold: 0.12, crownR: Sp * 0.17,
    cBase: col('#8a7a52'), cMid: [col('#b39c68'), col('#a08a5a')], cTip: [col('#c2ac78')], early: 0.8, sway: 0.3, ao: 0.7, taper: 2.2,
  });
  // Wiry flower stems with open sprays of flowers and berries.
  const N = 5;
  for (let i = 0; i < N; i++) {
    const az = i * 2.39996 + 0.7, rr = Sp * 0.12 * Math.sqrt((i + 0.5) / N);
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const len = lerp(0.4, 0.47, r()), pl = lerp(0.13, 0.17, r());
    const st = archPath(base, { az, tilt: 0.1 + r() * 0.35, bend: 0.15 + r() * 0.3, bendPow: 2, len, segs: 5 });
    const birth = i < 2 ? 0 : clamp(0.25 + r() * 0.5);
    const frac = len / (len + pl);
    stalk(g, st.pts, 0.0018, 0.0011, col('#6a8a48'), col('#4f6040'), birth, (t) => 0.9 * Math.pow(t * frac, 1.5), [0.25, 0.5]);
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.1 + r() * 0.3, len: pl, segs: 2, crowd: 1, roll: r() * 3 });
    plume(fl, pp, pl * 0.8, i % 2 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], col('#ffffff'), birth, end, (t) => 0.9 * Math.pow(clamp(frac + t * (1 - frac)), 1.5), 2);
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: straps(),
    flowerMap: sprays(),
    look: { leafRoughness: 0.45, translucency: 0.3, bend: 0.1, flutter: 0.006 },
  };
};
