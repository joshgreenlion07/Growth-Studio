import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, bladeGroup, bladeMap, fitClump, plume, stalk, texRng } from './shared-grasses';

/**
 * Pennisetum (now Cenchrus) alopecuroides 'Little Bunny', a true dwarf fountain grass: a low, tight, rounded tuft of
 * narrow, deep green blades that arch over evenly, with short creamy-beige "bunny tail" bottlebrushes (about 1.5-2 in)
 * on thin stems held just above the foliage from late summer, drying buff to tan.
 *
 * References:
 * - Walters Gardens / perennials.com (Pennisetum alopecuroides 'Little Bunny'): 25-30 cm (10-12 in) tall, 30-45 cm
 *   (12-18 in) spread; a low tufted mound of deep green leaves; creamy-beige bottlebrush spikes turning buff or tan,
 *   late summer to mid fall; leaves bright golden-yellow in fall; flower heads small.
 * - NC State Extension Plant Toolbox (Cenchrus alopecuroides, dwarf fountain grass; 'Little Bunny' listed as a dwarf
 *   cultivar): 12 to 18 in tall.
 * - English Gardens plant library (Little Bunny Dwarf Fountain Grass): 14 in tall, 18 in spread.
 * - Wikimedia Commons, "Pennisetum alopecuroides Little Bunny" 1zz and 2zz (D. Stang): fine deep green blades, short
 *   fuzzy cream to pale pinkish-buff spikes with long fine bristles.
 *
 * Catalog size: 1 gal installed 0.2 m x 0.22 m; mature 0.38 m tall to the plume tips (foliage about 0.28 m) x 0.45 m
 * wide in two years.
 */

/** Two short, fat bottlebrush spikes: a dense core of spikelets with fine bristles, cream to pale buff. */
function bunnyTails() {
  return leafTexture('pennisetum-little-bunny-brush', 256, 384, (g, w, h) => {
    const r = texRng(91);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.97, y1 = h * 0.04;
      const env = (t: number) => Math.pow(Math.sin(Math.PI * clamp(0.04 + t * 0.92)), 0.45);
      for (let i = 0; i < 50; i++) {
        const t = i / 49;
        g.fillStyle = 'rgba(222,210,180,0.6)';
        g.beginPath();
        g.ellipse(cx, lerp(y0, y1, t), cw * 0.24 * env(t), h * 0.025, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.lineCap = 'round';
      for (let i = 0; i < 800; i++) {
        const t = r();
        const y = lerp(y0, y1, t);
        const side = r() < 0.5 ? -1 : 1;
        const ang = 0.4 + r() * 0.7;
        const len = cw * (0.22 + r() * 0.24) * env(t);
        const tone = r();
        g.strokeStyle = tone < 0.4 ? 'rgba(246,240,222,0.95)' : tone < 0.8 ? 'rgba(230,218,190,0.95)' : 'rgba(206,186,166,0.9)';
        g.lineWidth = 1 + r() * 0.9;
        g.beginPath();
        g.moveTo(cx + side * r() * cw * 0.05, y);
        g.lineTo(cx + side * Math.sin(ang) * len, y - Math.cos(ang) * len);
        g.stroke();
      }
      for (let i = 0; i < 200; i++) {
        const t = r();
        g.fillStyle = ['#c9b495', '#bba48c', '#d6c4a2', '#b09a8a'][Math.floor(r() * 4)];
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * cw * 0.22 * env(t), lerp(y0, y1, t), 2.4, 5, (r() - 0.5) * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const straw = col('#c4ad72');
  // Skirt: short old blades, some dry.
  bladeGroup(g, r, {
    count: 90, len: [0.14, 0.2], wid: [0.0045, 0.0055], tilt: [0.85, 1.25], bend: [0.5, 1.0], bendPow: 1.4, segs: 5, fold: 0.25, crownR: Sp * 0.08,
    cBase: col('#968a54'), cMid: [col('#4c7432'), col('#7e8244'), col('#46702e')], cTip: [col('#9a9254'), col('#628a3a')], dryTip: 0.4, cDry: straw,
    early: 0.8, sway: 0.6, ao: 0.5, taper: 1.9,
  });
  // The low rounded tuft of fine arching blades.
  bladeGroup(g, r, {
    count: 560, len: [0.3, 0.38], rimLen: 0.7, wid: [0.0055, 0.007], tilt: [0.12, 1.0], tiltPow: 0.8, bend: [1.1, 1.8], bendPow: 1.5, segs: 7, fold: 0.25, crownR: Sp * 0.07,
    cBase: col('#8a8e50'), cMid: [col('#2e5c1c'), col('#36641e'), col('#3c6c22')], cTip: [col('#4a7a2a'), col('#426e26')], dryTip: 0.08, cDry: straw,
    early: 0.55, sway: 0.85, ao: 0.5, taper: 2.1,
  });
  bladeGroup(g, r, {
    count: 100, len: [0.28, 0.34], wid: [0.005, 0.006], tilt: [0.02, 0.3], bend: [0.8, 1.4], bendPow: 1.8, segs: 6, fold: 0.25, crownR: Sp * 0.04,
    cBase: col('#929a5a'), cMid: [col('#3e7424'), col('#467c28')], cTip: [col('#548a2e')], early: 0.45, sway: 0.85, ao: 0.6, taper: 1.8,
  });
  // Flower stems through the foliage, each ending in a short bunny-tail brush just above it.
  const stemLo = col('#7a9a4c'), stemHi = col('#bcae7c');
  const N = 40;
  for (let i = 0; i < N; i++) {
    const u = (i + r()) / N;
    const az = i * 2.39996 + r() * 0.6, rr = Sp * 0.06 * Math.sqrt(r());
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const tilt = lerp(0.05, 0.6, Math.pow(u, 0.8));
    const len = lerp(0.27, 0.31, r()) * lerp(1, 0.82, u), pl = lerp(0.035, 0.045, r());
    const st = archPath(base, { az, tilt, bend: 0.25 + r() * 0.3, bendPow: 2, len, segs: 4, azCurl: (r() - 0.5) * 0.3, floor: 0.02 });
    const birth = i % 3 === 0 ? 0 : clamp(0.15 + r() * 0.55);
    const frac = len / (len + pl);
    stalk(g, st.pts, 0.0014, 0.0009, stemLo, stemHi, birth, (t) => Math.pow(t * frac, 1.5));
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.15 + r() * 0.3, bendPow: 1, len: pl, segs: 2, crowd: 1, roll: r() * 3, floor: 0.02 });
    plume(fl, pp, pl * 0.46, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#b4a68c'), r, 0.01, 0.03, 0.05), birth, end, (t) => Math.pow(clamp(frac + t * (1 - frac)), 1.5));
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: bladeMap('plain'),
    flowerMap: bunnyTails(),
    look: { leafRoughness: 0.55, translucency: 0.35, bend: 0.08, flutter: 0.008 },
  };
};
