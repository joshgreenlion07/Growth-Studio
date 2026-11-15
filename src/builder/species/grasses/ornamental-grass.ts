import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, blade, bladeGroup, bladeMap, fitClump, plume, stalk, STRIP, texRng } from './shared-grasses';

/** Two narrow, feathery wheat-tan plumes: short ascending branchlets packed with small spikelets. */
function plumes() {
  return leafTexture('calamagrostis-plume', 128, 512, (g, w, h) => {
    const r = texRng(53);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.995, y1 = h * 0.02;
      const env = (t: number) => Math.pow(Math.sin(Math.PI * clamp(0.1 + t * 0.88)), 0.7);
      for (let i = 0; i < 80; i++) {
        const t = i / 79;
        g.fillStyle = 'rgba(205,178,120,0.85)';
        g.beginPath();
        g.ellipse(cx, lerp(y0, y1, t), cw * 0.2 * env(t) + 1, h * 0.014, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#b3945a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx, y1);
      g.stroke();
      for (let i = 0; i < 800; i++) {
        const t = r();
        const y = lerp(y0, y1, t);
        const side = r() < 0.5 ? -1 : 1;
        const reach = cw * 0.4 * env(t) * Math.pow(r(), 0.7);
        const x = cx + side * reach, yy = y - reach * (1.6 + r() * 1.4);
        g.fillStyle = ['#d9c084', '#c9aa6a', '#e6d29a', '#b89858', '#d2b676'][Math.floor(r() * 5)];
        g.save();
        g.translate(x, yy);
        g.rotate(side * (0.15 + r() * 0.25));
        g.beginPath();
        g.ellipse(0, 0, 1.7, 6.5, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  });
}

/**
 * The catalog's generic "ornamental grass", modeled on feather reed grass,
 * Calamagrostis x acutiflora 'Karl Foerster': a strictly upright, narrow
 * clump of mid-green arching blades to about 3 ft, with many stiff vertical
 * stems carrying narrow, feathery wheat-tan plumes to 5 ft.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const straw = col('#c9b27a');
  // Old basal blades, shorter and bent out low.
  bladeGroup(g, r, {
    count: 70, len: [0.25, 0.38], wid: [0.008, 0.011], tilt: [0.35, 0.8], bend: [0.6, 1.3], bendPow: 1.5, segs: 6, fold: 0.22, crownR: Sp * 0.12,
    cBase: col('#a39a62'), cMid: [col('#6f8a40'), col('#9a965a'), col('#5f8238')], cTip: [col('#b3a468'), col('#7a9444')], dryTip: 0.5, cDry: straw,
    early: 0.85, sway: 0.6, ao: 0.5, taper: 1.7,
  });
  // The upright sheaf: straight for most of its length, arching out at the tips.
  bladeGroup(g, r, {
    count: 340, len: [0.72, 1.02], wid: [0.01, 0.014], rimLen: 0.75, tilt: [0.02, 0.2], tiltPow: 1.0, bend: [0.3, 0.85], bendPow: 3, segs: 8, fold: 0.22, crownR: Sp * 0.13,
    cBase: col('#b0b070'), cMid: [col('#557f32'), col('#628e3a'), col('#709a42')], cTip: [col('#7fa648'), col('#6a963e')], dryTip: 0.1, cDry: straw,
    early: 0.55, sway: 0.8, ao: 0.5, taper: 1.8,
  });
  // Flowering stems: stiff and vertical, each with a couple of flag leaves and a narrow plume.
  const stemLo = col('#7a9848'), stemHi = col('#c4a868');
  const N = 42;
  for (let i = 0; i < N; i++) {
    const az = i * 2.39996 + r() * 0.6, rr = Sp * 0.12 * Math.sqrt((i + 0.5) / N);
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const pl = lerp(0.24, 0.32, r());
    const len = lerp(1.0, 1.2, r());
    const tilt = 0.015 + (rr / (Sp * 0.12)) * 0.08 + r() * 0.03;
    const st = archPath(base, { az, tilt, bend: (r() - 0.3) * 0.08, len, segs: 5, crowd: 1, azCurl: (r() - 0.5) * 0.2 });
    const birth = i % 4 === 0 ? 0 : clamp(0.15 + r() * 0.6);
    const frac = len / (len + pl);
    const sw = (t: number) => Math.pow(t, 1.5);
    stalk(g, st.pts, 0.0034, 0.002, stemLo, stemHi, birth, (t) => sw(t * frac));
    for (let k = 0; k < 2; k++) {
      const t = 0.22 + k * 0.2 + r() * 0.1;
      const at = st.pts[0].clone().lerp(st.pts[st.pts.length - 1], t);
      const mid = jitter(col('#648e3a'), r, 0.012, 0.06, 0.05);
      const leaf = archPath(at, { az: az + (r() - 0.5) * 3, tilt: 0.12 + r() * 0.15, bend: 0.6 + r() * 1.0, bendPow: 2.2, len: 0.25 + r() * 0.15, segs: 5 });
      blade(g, leaf, { wid: 0.008, fold: 0.22, cBase: col('#a8ac6c'), cMid: mid, cTip: mid.clone().lerp(col('#86aa4c'), 0.5), uv: STRIP[k], birth, sway: 0.4, ao: 0.9, taper: 1.6 });
      // The blade tip moves with the stem it sits on.
      const base0 = g.sway.length - (5 + 1) * 2;
      for (let q = base0; q < g.sway.length; q++) g.sway[q] = clamp(sw(t * frac) + g.sway[q] * 0.3);
    }
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: (r() - 0.4) * 0.12, len: pl, segs: 2, crowd: 1, roll: r() * 3 });
    plume(fl, pp, pl * 0.2, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#fff6e6'), r, 0.01, 0.03, 0.06), birth, end, (t) => sw(clamp(frac + t * (1 - frac))));
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: bladeMap('plain'),
    flowerMap: plumes(),
    look: { leafRoughness: 0.6, translucency: 0.35, bend: 0.2, flutter: 0.014 },
  };
};
