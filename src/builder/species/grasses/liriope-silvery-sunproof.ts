import { GeoBuilder, V, clamp, col, jitter, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { archPath, bladeGroup, bladeMap, fitClump, plume, stalk, texRng } from './shared-grasses';

/**
 * Liriope muscari 'Silvery Sunproof' (variegated lilyturf): a low, arching
 * fountain of narrow strap leaves, dark green striped lengthwise with cream-white
 * to pale yellow (broad pale margins on some blades, fine pinstripes on others),
 * so the tuft reads green-and-cream, paler in sun. In late summer, short spikes
 * of small lilac flowers stand among and just above the leaves.
 *
 * References:
 * - NC State Extension Plant Toolbox, https://plants.ces.ncsu.edu/plants/liriope-muscari-silvery-sunproof :
 *   1 ft 3 in - 1 ft 6 in tall and wide; narrow grass-like linear leaves with yellow to white margins
 *   and light silvery striping; racemes of pale violet-purple (lavender) flowers in late summer;
 *   blue-black berries; clumping, slow.
 * - Monrovia, https://www.monrovia.com/silvery-sunproof-lilyturf.html :
 *   15-18 in tall and wide; boldly variegated green and cream striped foliage, arching fountain form;
 *   purple to soft lilac spikes in summer.
 * - Devil Mountain Nursery (N. California), https://devilmountainnursery.com/liriope-muscari-silvery-sunproof :
 *   15-18 in tall x 14-18 in wide; dark green leaves with yellow to white edges that fade to
 *   white-green or yellow-green in sun; lilac spikes late summer to early fall; metallic black fruit.
 * - Leaves about 1/4-1/2 in wide (cultivar descriptions); the species is 1-1.5 ft long.
 *
 * Size used: 1 gal installed at about 0.2 m tall x 0.3 m wide (the finished job's pebble-bed tufts,
 * leaves flopped out over the stones); mature 0.38 m x 0.45 m in three years. Leaves 8-11 mm wide.
 */

/** Strap leaf strips in true color: strip 0 boldly striped with cream margins, strip 1 green with fine cream lines. */
function straps() {
  return bladeMap('liriope-silvery-sunproof', {
    fill: '#264c20',
    rib: 0.1,
    veins: 0.06,
    extra: (g, x0, x1, h, strip) => {
      const w = x1 - x0;
      const r = texRng(strip ? 53 : 29);
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, '#22461d');
      grad.addColorStop(0.5, '#2c5626');
      grad.addColorStop(1, '#23481e');
      g.fillStyle = grad;
      g.fillRect(x0, 0, w, h);
      const cream = '#d9d59a', pale = '#b8c084';
      if (strip === 0) {
        // Cream margins, one a little wider, and a couple of pale lines through the green.
        g.fillStyle = cream;
        g.fillRect(x0, 0, w * 0.11, h);
        g.fillRect(x1 - w * 0.075, 0, w * 0.075, h);
        g.fillStyle = pale;
        for (const [u, bw] of [[0.3, 0.03], [0.66, 0.035]] as [number, number][]) g.fillRect(x0 + w * u, 0, w * bw, h);
      } else {
        // Mostly green: thin cream edges and hairline stripes.
        g.fillStyle = cream;
        g.fillRect(x0, 0, w * 0.05, h);
        g.fillRect(x1 - w * 0.04, 0, w * 0.04, h);
        g.fillStyle = pale;
        for (const u of [0.24, 0.71]) g.fillRect(x0 + w * u + (r() - 0.5) * 2, 0, 1.5, h);
      }
    },
  });
}

/** Two flower spikes: whorls of small bead-like lilac flowers, paler than 'Big Blue', with darker buds at the top. */
function spikes() {
  return leafTexture('liriope-silvery-sunproof-spike', 128, 512, (g, w, h) => {
    const r = texRng(117);
    for (let c = 0; c < 2; c++) {
      const cw = w / 2, cx = (c + 0.5) * cw;
      const y0 = h * 0.99, y1 = h * 0.02;
      g.strokeStyle = '#6e5e88';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx, y1);
      g.stroke();
      const n = 18;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = lerp(y0 - 6, y1 + 14, t);
        const open = 1 - t;
        const beads = 6 + Math.floor(r() * 3);
        for (let k = 0; k < beads; k++) {
          const a = (k / beads) * Math.PI * 2 + r();
          const rad = (5 + r() * 8) * (1 - 0.35 * t);
          const x = cx + Math.cos(a) * rad + (r() - 0.5) * 3;
          const yy = y + Math.sin(a) * 6 + (r() - 0.5) * 5;
          const R = 3.3 + r() * 1.4 - t * 0.7;
          const hue = ['#b39ae0', '#a68cd8', '#c0aae6', '#9c84d0', '#b8a2e2'][Math.floor(r() * 5)];
          const bud = ['#7a5fb4', '#6c52a6', '#8468bc'][Math.floor(r() * 3)];
          g.fillStyle = r() < open * 0.9 ? hue : bud;
          g.beginPath();
          g.ellipse(x, yy, R, R * 1.1, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.28)';
          g.beginPath();
          g.ellipse(x - R * 0.3, yy - R * 0.35, R * 0.35, R * 0.28, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      for (let k = 0; k < 5; k++) {
        g.fillStyle = '#6c52a6';
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * 7, h * 0.03 + k * 4, 3.2, 3.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder(), fl = new GeoBuilder();
  const base = col('#d9d2cc'); // pale, faintly purplish clasping bases
  // Main fountain: strap leaves rise, arch out and lay their tips down.
  bladeGroup(g, r, {
    count: 260, len: [0.27, 0.36], rimLen: 0.88, wid: [0.0085, 0.011], tilt: [0.18, 0.98], tiltPow: 0.9, bend: [1.0, 1.8], bendPow: 1.5, segs: 7, fold: 0.16, crownR: Sp * 0.06,
    cBase: base, cMid: [col('#ffffff'), col('#f2f4ee'), col('#e8ece4')], cTip: [col('#f6f8f0'), col('#eef2e8')],
    dryTip: 0.1, cDry: col('#c9b88a'), early: 0.58, sway: 0.7, ao: 0.42, taper: 2.0, baseW: 0.45, widest: 0.4, vary: [0.004, 0.03, 0.07],
  });
  // Shorter, more upright young leaves in the heart.
  bladeGroup(g, r, {
    count: 55, len: [0.2, 0.28], wid: [0.007, 0.0095], tilt: [0.05, 0.45], bend: [0.6, 1.2], bendPow: 1.8, segs: 5, fold: 0.16, crownR: Sp * 0.04,
    cBase: base, cMid: [col('#ffffff'), col('#f8faf2')], cTip: [col('#fbfcf6')], early: 0.5, sway: 0.6, ao: 0.5, taper: 2.0, baseW: 0.45,
  });
  // Low skirt of outer leaves spilling sideways, so neighbors knit into one border.
  bladeGroup(g, r, {
    count: 60, len: [0.26, 0.33], wid: [0.008, 0.0105], tilt: [0.85, 1.12], bend: [0.7, 1.2], bendPow: 1.4, segs: 5, fold: 0.16, crownR: Sp * 0.07,
    cBase: base, cMid: [col('#e6eae0'), col('#dce2d6')], cTip: [col('#e4e8dc')], dryTip: 0.2, cDry: col('#c2b282'),
    early: 0.6, sway: 0.7, ao: 0.5, taper: 2.0, baseW: 0.45, floor: 0.012,
  });
  // Flower spikes, standing among and just above the leaves.
  const N = 11;
  const stemLo = col('#7a6a84'), stemHi = col('#6c5a8a');
  for (let i = 0; i < N; i++) {
    const az = i * 2.39996 + r() * 0.5, rr = Sp * 0.05 * Math.sqrt((i + 0.5) / N) * 2 + 0.01;
    const b = V(Math.cos(az) * rr, 0, Math.sin(az) * rr);
    const len = H * lerp(0.66, 0.86, r());
    const pl = len * 0.55;
    const stemLen = len - pl;
    const tilt = 0.1 + (rr / (Sp * 0.2)) * 0.14 + r() * 0.12;
    const st = archPath(b, { az, tilt, bend: 0.05 + r() * 0.15, len: stemLen, segs: 4, crowd: 1 });
    const birth = i % 4 === 0 ? 0.05 : clamp(0.2 + r() * 0.55);
    const frac = stemLen / len;
    const sw = (t: number) => 0.9 * Math.pow(t, 1.5);
    // Stalks sample the cream margin of strip 0, so their vertex color shows true.
    stalk(g, st.pts, 0.0028, 0.0022, stemLo, stemHi, birth, (t) => sw(t * frac), [0.05, 0.5]);
    const end = st.pts[st.pts.length - 1];
    const pp = archPath(end, { az: st.az, tilt: st.endTilt, bend: 0.1 + r() * 0.1, len: pl, segs: 4, crowd: 1, roll: r() * 3 });
    plume(fl, pp, 0.03, r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], jitter(col('#ffffff'), r, 0.01, 0.03, 0.06), birth, end, (t) => sw(clamp(frac + t * (1 - frac))), 3);
  }
  fitClump([g, fl], H, Sp);
  return {
    leaves: g.build(),
    flowers: fl.build(),
    leafMap: straps(),
    flowerMap: spikes(),
    look: { leafRoughness: 0.5, translucency: 0.25, bend: 0.05, flutter: 0.004 },
  };
};
