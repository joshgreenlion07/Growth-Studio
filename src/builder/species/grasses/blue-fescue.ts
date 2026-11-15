import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, bladeGroup, bladeMap, fitClump, plume, stalk, texRng } from './shared-grasses';

/** Two narrow, one-sided fescue panicles: buff spikelets on short branchlets. */
function panicles() {
  return leafTexture('fescue-panicle', 128, 256, (g, w, h) => {
    const r = texRng(31);
    for (let c = 0; c < 2; c++) {
      const cx = (c + 0.5) * (w / 2);
      g.strokeStyle = '#b89f6a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, h);
      g.lineTo(cx, h * 0.04);
      g.stroke();
      for (let i = 0; i < 46; i++) {
        const t = Math.pow(r(), 0.8);
        const y = lerp(h * 0.9, h * 0.05, t);
        const side = r() < 0.5 ? -1 : 1;
        const reach = (w / 2) * 0.36 * (1 - t * 0.7) * (0.4 + r() * 0.6);
        const x = cx + side * reach, y2 = y - reach * (0.9 + r());
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(x, y2);
        g.stroke();
        g.fillStyle = ['#d9c692', '#cbb47c', '#e3d3a4', '#bfa873'][Math.floor(r() * 4)];
        g.save();
        g.translate(x, y2);
        g.rotate(side * 0.35);
        g.beginPath();
        g.ellipse(0, -5, 3.2, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  });
}

/**
 * Festuca glauca 'Elijah Blue' (blue fescue): a tight, spiky hemispherical
 * tuft of very fine, stiff, needle-like powder-blue blades, with thin buff
 * flower stalks standing just above it.
 */
export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const blues = [col('#6d8c9e'), col('#7f9fb2'), col('#8eadbd'), col('#74979c')];
  // Dead thatch at the skirt.
  bladeGroup(g, r, {
    count: 70, len: [0.06, 0.1], wid: [0.002, 0.0028], tilt: [1.1, 1.55], bend: [0.1, 0.5], segs: 3, fold: 0.3, crownR: Sp * 0.12,
    cBase: col('#8c7d58'), cMid: [col('#b9a878'), col('#a39468'), col('#c7b98c')], cTip: [col('#cdbf94')], early: 0.8, sway: 0.4, ao: 0.6, taper: 2,
  });
  // The dome of stiff needles.
  bladeGroup(g, r, {
    count: 560, len: [0.13, 0.17], rimLen: 0.7, wid: [0.0022, 0.003], tilt: [0.04, 1.5], tiltPow: 0.62, bend: [0.02, 0.3], bendPow: 1.6, segs: 3, fold: 0.35, crownR: Sp * 0.14,
    cBase: col('#a8ab86'), cMid: blues, cTip: [col('#98b4c2'), col('#88a8b8')], dryTip: 0.2, cDry: col('#c9bd98'),
    early: 0.6, sway: 0.6, ao: 0.42, taper: 2.2, roll: 1.5, azCurl: 0.2, vary: [0.012, 0.05, 0.05],
  });
  // New needles in the heart: bluest and upright.
  bladeGroup(g, r, {
    count: 110, len: [0.13, 0.19], wid: [0.002, 0.0026], tilt: [0.0, 0.5], bend: [0.0, 0.2], segs: 3, fold: 0.35, crownR: Sp * 0.1,
    cBase: col('#a9b596'), cMid: [col('#86a8bc'), col('#94b4c6')], cTip: [col('#a2c0ce')], early: 0.45, sway: 0.6, ao: 0.5, taper: 2.2, roll: 1.5,
  });
  // Flower stalks with narrow buff panicles.
  const buff = col('#c9b27c'), green = col('#9aa98a');
  for (let i = 0; i < 16; i++) {
    const az = i * 2.39996 + r(), rr = Sp * 0.1 * Math.sqrt(r());
    const base = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const len = lerp(0.22, 0.28, r()), pl = lerp(0.04, 0.055, r());
    const tilt = 0.08 + r() * 0.55;
    const st = archPath(base, { az, tilt, bend: 0.1 + r() * 0.2, len, segs: 3, crowd: 1 });
    const birth = i < 5 ? 0 : 0.25 + r() * 0.5;
    const frac = len / (len + pl);
    stalk(g, st.pts, 0.0011, 0.0007, green, buff, birth, (t) => 0.9 * Math.pow(t * frac, 1.5));
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.15 + r() * 0.3, len: pl, segs: 2, crowd: 1, roll: r() * 3 });
    plume(fl, pp, pl * 0.36, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#ffffff'), r, 0, 0, 0.06).multiplyScalar(0.95), birth, end, (t) => 0.9 * Math.pow(clamp(frac + t * (1 - frac)), 1.5));
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: bladeMap('plain'),
    flowerMap: panicles(),
    look: { leafRoughness: 0.82, translucency: 0.15, bend: 0.07, flutter: 0.006 },
  };
};
