import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, bladeGroup, bladeMap, fitClump, plume, stalk, texRng } from './shared-grasses';

/** Two flower spikes: whorled clusters of bead-like violet flowers, dark buds at the top, a few berries low. */
function spikes() {
  return leafTexture('liriope-spike', 128, 512, (g, w, h) => {
    const r = texRng(91);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.99, y1 = h * 0.02;
      // Central axis (purple-green).
      g.strokeStyle = '#5a4a78';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx, y1);
      g.stroke();
      const n = 20;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = lerp(y0 - 6, y1 + 14, t);
        const open = 1 - t; // lower whorls open, upper still buds
        const beads = 7 + Math.floor(r() * 3);
        for (let k = 0; k < beads; k++) {
          const a = (k / beads) * Math.PI * 2 + r();
          const side = Math.cos(a);
          const rad = (5 + r() * 9) * (1 - 0.35 * t);
          const x = cx + side * rad + (r() - 0.5) * 3;
          const yy = y + Math.sin(a) * 6 + (r() - 0.5) * 5;
          const R = 3.4 + r() * 1.5 - t * 0.7;
          const hue = ['#7a4fb4', '#8a62c4', '#6c43a6', '#9a74cf', '#5e3a96'][Math.floor(r() * 5)];
          const bud = ['#4a2f7a', '#563a88', '#3e2a6c'][Math.floor(r() * 3)];
          g.fillStyle = r() < open * 0.9 ? hue : bud;
          g.beginPath();
          g.ellipse(x, yy, R, R * 1.1, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.22)';
          g.beginPath();
          g.ellipse(x - R * 0.3, yy - R * 0.35, R * 0.35, R * 0.28, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // Bud tuft at the tip.
      for (let k = 0; k < 6; k++) {
        g.fillStyle = '#4a2f7a';
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * 8, h * 0.03 + k * 4, 3.4, 3.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/**
 * Liriope muscari 'Big Blue' / 'Evergreen Giant' (lilyturf): a dense evergreen
 * fountain of glossy dark green strap leaves, with stout upright spikes of
 * grape-hyacinth-like violet flowers in late summer standing just above the foliage.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const base = col('#8a7f86'); // purplish-white clasping bases
  // Main fountain: strap leaves arch out and the tips droop.
  bladeGroup(g, r, {
    count: 280, len: [0.27, 0.36], rimLen: 0.9, wid: [0.017, 0.023], tilt: [0.2, 1.0], tiltPow: 0.9, bend: [0.9, 1.6], bendPow: 1.5, segs: 5, fold: 0.18, crownR: Sp * 0.06,
    cBase: base, cMid: [col('#17361c'), col('#1d4220'), col('#14301a')], cTip: [col('#1f4a22'), col('#285a28')],
    early: 0.58, sway: 0.7, ao: 0.42, taper: 2.0, baseW: 0.45, widest: 0.4, vary: [0.01, 0.07, 0.05],
  });
  // Shorter inner blades filling the heart.
  bladeGroup(g, r, {
    count: 50, len: [0.18, 0.26], wid: [0.013, 0.017], tilt: [0.05, 0.45], bend: [0.6, 1.2], bendPow: 1.8, segs: 4, fold: 0.18, crownR: Sp * 0.04,
    cBase: base, cMid: [col('#245026'), col('#2c5c2a')], cTip: [col('#34682f')], early: 0.5, sway: 0.6, ao: 0.5, taper: 2.0, baseW: 0.45,
  });
  // Low skirt of outer leaves that spill sideways, so neighbors knit into one border.
  bladeGroup(g, r, {
    count: 55, len: [0.28, 0.36], wid: [0.016, 0.021], tilt: [0.85, 1.15], bend: [0.7, 1.2], bendPow: 1.4, segs: 5, fold: 0.18, crownR: Sp * 0.07,
    cBase: base, cMid: [col('#17361c'), col('#1d4220')], cTip: [col('#24512a')], early: 0.6, sway: 0.7, ao: 0.5, taper: 2.0, baseW: 0.45, floor: 0.012,
  });
  // Flower spikes.
  const N = 18;
  const stemLo = col('#6c5a78'), stemHi = col('#5a4a7c');
  const tall = H;
  for (let i = 0; i < N; i++) {
    const az = i * 2.39996 + r() * 0.5, rr = Sp * 0.055 * Math.sqrt((i + 0.5) / N) * 2 + 0.01;
    const b = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const len = tall * lerp(0.72, 0.9, r());
    const pl = len * 0.6;
    const stemLen = len - pl;
    const tilt = 0.08 + (rr / (Sp * 0.2)) * 0.12 + r() * 0.1;
    const st = archPath(b, { az, tilt, bend: 0.05 + r() * 0.15, len: stemLen, segs: 4, crowd: 1 });
    const birth = i % 3 === 0 ? 0.05 : clamp(0.2 + r() * 0.55);
    const frac = stemLen / len;
    const sw = (t: number) => 0.9 * Math.pow(t, 1.5);
    stalk(g, st.pts, 0.0032, 0.0026, stemLo, stemHi, birth, (t) => sw(t * frac));
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.1 + r() * 0.1, len: pl, segs: 4, crowd: 1, roll: r() * 3 });
    plume(fl, pp, 0.034, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#ffffff'), r, 0.01, 0.03, 0.06), birth, end, (t) => sw(clamp(frac + t * (1 - frac))), 3);
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: bladeMap('plain'),
    flowerMap: spikes(),
    look: { leafRoughness: 0.32, translucency: 0.2, bend: 0.04, flutter: 0.004 },
  };
};
