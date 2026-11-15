import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, bladeGroup, bladeMap, fitClump, plume, stalk, texRng } from './shared-grasses';

/** Two fuzzy bottlebrush spikes: a dense core of spikelets with long fine bristles, buff to creamy white. */
function bottlebrush() {
  return leafTexture('pennisetum-brush', 256, 512, (g, w, h) => {
    const r = texRng(77);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.985, y1 = h * 0.03;
      const env = (t: number) => Math.pow(Math.sin(Math.PI * clamp(0.06 + t * 0.9)), 0.55);
      // Soft body so the brush stays solid at a distance.
      for (let i = 0; i < 60; i++) {
        const t = i / 59;
        g.fillStyle = 'rgba(216,200,166,0.62)';
        g.beginPath();
        g.ellipse(cx, lerp(y0, y1, t), cw * 0.2 * env(t), h * 0.02, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Bristles.
      g.lineCap = 'round';
      for (let i = 0; i < 900; i++) {
        const t = r();
        const y = lerp(y0, y1, t);
        const side = r() < 0.5 ? -1 : 1;
        const ang = 0.35 + r() * 0.75;
        const len = cw * (0.2 + r() * 0.26) * env(t);
        const tone = r();
        g.strokeStyle = tone < 0.3 ? 'rgba(244,236,214,0.95)' : tone < 0.7 ? 'rgba(226,210,176,0.95)' : tone < 0.9 ? 'rgba(200,176,150,0.95)' : 'rgba(176,140,140,0.9)';
        g.lineWidth = 1 + r() * 0.9;
        g.beginPath();
        g.moveTo(cx + side * r() * cw * 0.05, y);
        g.lineTo(cx + side * Math.sin(ang) * len, y - Math.cos(ang) * len);
        g.stroke();
      }
      // Spikelets along the core, tinged purple-brown.
      for (let i = 0; i < 260; i++) {
        const t = r();
        const y = lerp(y0, y1, t);
        g.fillStyle = ['#b79a7c', '#a88a7e', '#c9b08c', '#9a7f78'][Math.floor(r() * 4)];
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * cw * 0.2 * env(t), y, 2.2, 5, (r() - 0.5) * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/**
 * Pennisetum alopecuroides 'Hameln' (dwarf fountain grass): a rounded
 * fountain of narrow, arching deep green blades, with many fuzzy bottlebrush
 * spikes (buff to creamy white, 3 to 5 in long) arching out just above it.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const straw = col('#c4ad72');
  bladeGroup(g, r, {
    count: 100, len: [0.22, 0.3], wid: [0.006, 0.008], tilt: [0.8, 1.2], bend: [0.5, 1.1], bendPow: 1.4, segs: 5, fold: 0.25, crownR: Sp * 0.09,
    cBase: col('#9a8e58'), cMid: [col('#56803a'), col('#8a8a48'), col('#4a7430')], cTip: [col('#a89a58'), col('#6a9040')], dryTip: 0.45, cDry: straw,
    early: 0.8, sway: 0.7, ao: 0.5, taper: 1.9,
  });
  bladeGroup(g, r, {
    count: 380, len: [0.72, 0.92], rimLen: 0.6, wid: [0.007, 0.01], tilt: [0.08, 0.85], tiltPow: 0.85, bend: [1.2, 1.9], bendPow: 1.5, segs: 8, fold: 0.25, crownR: Sp * 0.08,
    cBase: col('#a6ab68'), cMid: [col('#467a2e'), col('#528a34'), col('#5f963a')], cTip: [col('#6ea040'), col('#5a9036')], dryTip: 0.1, cDry: straw,
    early: 0.55, sway: 0.9, ao: 0.5, taper: 2.2,
  });
  bladeGroup(g, r, {
    count: 70, len: [0.6, 0.8], wid: [0.005, 0.007], tilt: [0.02, 0.3], bend: [1.0, 1.7], bendPow: 1.8, segs: 7, fold: 0.25, crownR: Sp * 0.045,
    cBase: col('#b0b870'), cMid: [col('#64a03a'), col('#72ac42')], cTip: [col('#80b84a')], early: 0.45, sway: 0.9, ao: 0.6, taper: 1.8,
  });
  // Flower stems fan out through the foliage, each ending in a bottlebrush that nods outward.
  const stemLo = col('#7c9a4c'), stemHi = col('#b9a878');
  const N = 46;
  for (let i = 0; i < N; i++) {
    const u = (i + r()) / N;
    const az = i * 2.39996 + r() * 0.6, rr = Sp * 0.07 * Math.sqrt(r());
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const tilt = lerp(0.06, 0.7, Math.pow(u, 0.8));
    const len = lerp(0.66, 0.8, r()) * lerp(1, 0.72, u), pl = lerp(0.1, 0.14, r());
    const st = archPath(base, { az, tilt, bend: 0.55 + r() * 0.45, bendPow: 2, len, segs: 5, azCurl: (r() - 0.5) * 0.3, floor: 0.02 });
    const birth = i % 4 === 0 ? 0 : clamp(0.2 + r() * 0.55);
    const frac = len / (len + pl);
    stalk(g, st.pts, 0.002, 0.0012, stemLo, stemHi, birth, (t) => Math.pow(t * frac, 1.5));
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.25 + r() * 0.45, bendPow: 1, len: pl, segs: 3, crowd: 1, roll: r() * 3, floor: 0.02 });
    plume(fl, pp, pl * 0.36, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#fff8ee'), r, 0.01, 0.03, 0.05), birth, end, (t) => Math.pow(clamp(frac + t * (1 - frac)), 1.5));
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: bladeMap('plain'),
    flowerMap: bottlebrush(),
    look: { leafRoughness: 0.55, translucency: 0.35, bend: 0.16, flutter: 0.012 },
  };
};
