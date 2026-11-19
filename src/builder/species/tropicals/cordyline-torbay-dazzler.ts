import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, jitter, lerp, rng, smoothstep, tube, type SpeciesBuilder } from '../kit';
import { archPath, blade, bladeMap, STRIP } from '../grasses/shared-grasses';
import { fitGeo } from '../succulents/shared-succulents';

/**
 * Cordyline australis 'Torbay Dazzler' (variegated New Zealand cabbage palm): a palm-like evergreen with a single,
 * slightly leaning trunk topped by a dense, rounded head of long, narrow, sword-shaped leaves. Each leaf is green with
 * broad creamy-yellow margins and a few thin cream stripes down the green, flushed pink-red along the midrib near its
 * base. The youngest leaves stand straight up in the center of the head, the middle ones radiate out, the oldest arch
 * over and hang, and the dead ones stay on as a straw-brown skirt under the head. The trunk is gray-tan and corky,
 * ringed with old leaf scars.
 *
 * References:
 * - Monrovia, Torbay Dazzler Cordyline (monrovia.com/torbay-dazzler-cordyline.html): palm-like evergreen tree; slow
 *   growing, reaching 15 to 18 ft tall and 8 ft wide; narrow sword-like leaves in ribbons of green and creamy gold with
 *   reddish highlights near the center; fragrant white summer flowers.
 * - RHS (Cordyline australis 'Torbay Dazzler' (v), AGM): 2.5-4 m tall, 1-1.5 m spread, 10-20 years to ultimate size;
 *   terminal tufts of sword-shaped leaves to 60 cm, heavily striped with creamy white.
 * - San Marcos Growers (smgrowers.com/info/Cordyline.asp): Torbay Dazzler has green strap leaves with a strong cream
 *   margin, grows erect and with age forks into more heads; the species has leaves 2-3 ft long and 1-2 in wide.
 * - Wikimedia Commons, "Variegated Torbay Palm Torquay" and the Chicago Botanic Garden bed photos (form and color): a
 *   trunked plant with a rounded head and hanging old leaves; young plants a fountain of cream-and-green blades.
 *
 * Catalog size: 5 gal installed 0.9 m tall x 0.8 m wide; 2.3 m x 1.7 m after ten years (variegated forms grow slower
 * than the species; RHS gives 2.5-4 m in 10-20 years, Monrovia 15-18 ft eventually). Leaves about 0.8 m long and
 * 5-6 cm wide at that size (a little over the references' 1-2 in so they read on screen), a trunk of about 1 m under
 * the head. The model is one plant at all ages, scaled: from a 5 gal it shows a short stem mostly hidden by its hanging
 * lower leaves.
 */

/** Leaf strips: 0 the living leaf in true color, 1 a dead leaf (straw brown). */
function leafMap() {
  return bladeMap('cordyline-torbay-dazzler', {
    fill: '#3f6a28',
    rib: 0.1,
    veins: 0.05,
    extra: (g, x0, x1, h, strip) => {
      const w = x1 - x0;
      if (strip === 1) {
        const grad = g.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, '#6e5a3a');
        grad.addColorStop(0.4, '#a08a5e');
        grad.addColorStop(1, '#b8a676');
        g.fillStyle = grad;
        g.fillRect(x0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          g.fillStyle = i % 2 ? 'rgba(70,52,30,0.25)' : 'rgba(220,206,160,0.25)';
          g.fillRect(x0 + w * (0.05 + i * 0.065), 0, 2, h);
        }
        return;
      }
      // Green center, a little lighter along the midrib.
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, '#284e18');
      grad.addColorStop(0.5, '#345e1e');
      grad.addColorStop(1, '#284e18');
      g.fillStyle = grad;
      g.fillRect(x0, 0, w, h);
      // Broad cream margins, wavering a little along the leaf, and fine cream pinstripes in the green.
      const rows = 48;
      for (let k = 0; k < rows; k++) {
        const y = (h * k) / rows, hh = h / rows + 1;
        const wl = 0.17 + Math.sin(k * 0.45 + 1.3) * 0.025, wr = 0.17 + Math.sin(k * 0.37 + 4.1) * 0.025;
        g.fillStyle = '#d6bf60';
        g.fillRect(x0, y, w * wl, hh);
        g.fillRect(x1 - w * wr, y, w * wr, hh);
        g.fillStyle = '#b8a650';
        g.fillRect(x0 + w * wl, y, w * 0.02, hh);
        g.fillRect(x1 - w * wr - w * 0.02, y, w * 0.02, hh);
      }
      g.fillStyle = 'rgba(214,190,96,0.75)';
      for (const f of [0.3, 0.36, 0.62, 0.69]) g.fillRect(x0 + w * f, 0, 2, h);
      g.fillStyle = 'rgba(214,190,96,0.4)';
      g.fillRect(x0 + w * 0.44, 0, 1.5, h);
      // The pink-red flush along the midrib at the base.
      const flush = g.createLinearGradient(0, h, 0, h * 0.55);
      flush.addColorStop(0, 'rgba(176,74,84,0.75)');
      flush.addColorStop(1, 'rgba(176,74,84,0)');
      g.fillStyle = flush;
      g.fillRect(x0 + w * 0.4, h * 0.55, w * 0.2, h * 0.45);
      // A dry, browned tip on every leaf, as on the real plant.
      const tip = g.createLinearGradient(0, h * 0.035, 0, 0);
      tip.addColorStop(0, 'rgba(160,140,96,0)');
      tip.addColorStop(1, 'rgba(160,140,96,1)');
      g.fillStyle = tip;
      g.fillRect(x0, 0, w, h * 0.035);
    },
  });
}

/** Trunk: gray-tan, corky, ringed with old leaf scars. */
function bark(): THREE.Texture {
  return barkTexture('cordyline-trunk', 256, (g, S) => {
    const r = rng('cordyline-trunk');
    g.fillStyle = '#8a7f6c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(60,52,40,${0.06 + r() * 0.12})` : `rgba(190,180,158,${0.06 + r() * 0.12})`;
      g.fillRect(r() * S, r() * S, 2 + r() * 8, 1 + r() * 4);
    }
    const rings = 14;
    for (let k = 0; k < rings; k++) {
      const y = ((k + r() * 0.4) / rings) * S;
      const ph = r() * 6.28;
      for (const [dy, c, lw] of [[0, 'rgba(52,44,34,0.6)', 2.6], [3, 'rgba(196,186,160,0.4)', 1.6]] as [number, string, number][]) {
        g.strokeStyle = c;
        g.lineWidth = lw;
        g.beginPath();
        for (let x = 0; x <= S; x += 4) {
          const yy = y + dy + Math.sin((x / S) * Math.PI * 4 + ph) * 1.2;
          if (x === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder();

  // Built in real meters for a ten-year plant, then fitted to the catalog size.
  const trunkH = 0.85, crownH = 0.12, R0 = 0.065, R1 = 0.048;
  const leanAz = r() * 6.28, lean = 0.06;
  const trunk: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const off = lean * Math.sin(t * Math.PI * 0.6);
    trunk.push(V(Math.cos(leanAz) * off + (r() - 0.5) * 0.008, -0.04 + t * (trunkH + crownH + 0.04), Math.sin(leanAz) * off + (r() - 0.5) * 0.008));
  }
  const top = trunk[trunk.length - 1];
  const swayAt = (p: THREE.Vector3) => clamp(Math.pow(Math.max(0, p.y) / (trunkH + 0.9), 1.4));
  tube(wood, trunk, R0, R1, 12, col('#ffffff', 0.6), 0, trunk[0], (i) => swayAt(trunk[i]) * 0.3, 3);
  // A slightly swollen foot where the trunk meets the ground.
  tube(wood, [V(trunk[0].x, -0.04, trunk[0].z), V(trunk[0].x, 0.06, trunk[0].z)], R0 * 1.5, R0 * 1.05, 12, col('#ffffff', 0.52), 0, trunk[0], () => 0, 1);

  const uvLive = STRIP[0], uvDead = STRIP[1];
  const N = 170;
  for (let i = 0; i < N; i++) {
    // f: 0 the youngest leaf at the top of the crown, 1 the oldest at its bottom.
    const f = (i + r() * 0.6) / N;
    const az = i * 2.39996 + (r() - 0.5) * 0.9;
    // Leaves rise from the crown, the youngest highest; a little out from the axis.
    const y = top.y - crownH * Math.pow(f, 0.85);
    const rr = R1 * lerp(0.3, 1.05, Math.pow(f, 0.6));
    const base = V(top.x + Math.cos(az) * rr, y, top.z + Math.sin(az) * rr);
    // Tilt from vertical: upright spear in the middle, radiating, the oldest past level and hanging.
    const tilt = f < 0.12 ? lerp(0.02, 0.3, f / 0.12) + r() * 0.1 : lerp(0.3, 2.85, Math.pow((f - 0.12) / 0.88, 0.85)) + (r() - 0.5) * 0.4;
    const len = 0.82 * (f < 0.12 ? lerp(0.75, 1.0, f / 0.12) : lerp(1, 1.2, smoothstep(0.7, 1, f))) * (0.8 + r() * 0.3);
    const wid = 0.06 * (0.85 + r() * 0.3) * (f < 0.12 ? 0.75 : 1);
    // Stiff blades: the outer ones bow outward along the length and droop at the tip.
    const bend = lerp(0.05, 0.7, smoothstep(0.1, 0.7, f)) * lerp(1, 0.3, smoothstep(0.75, 1, f)) * (0.5 + r()) + r() * 0.12;
    const path = archPath(base, { az: az + (r() - 0.5) * 0.25, tilt, bend, bendPow: 1.8, len, segs: 7, azCurl: (r() - 0.5) * 0.3, roll: (r() - 0.5) * 0.5, twist: (r() - 0.5) * 0.8, floor: 0.03 });
    // Most leaves are there from install (the hanging ones all are, as on a young plant); others fill in as it grows.
    const birth = f > 0.6 || r() < 0.65 ? 0 : clamp(0.1 + r() * 0.6);
    const shade = lerp(0.82, 1, smoothstep(0, 0.4, f)) * lerp(1, 0.86, smoothstep(0.7, 1, f));
    const tint = jitter(col('#ffffff').lerp(col('#f2ecd0'), smoothstep(0.75, 1, f)), r, 0.006, 0.03, 0.04).multiplyScalar(shade);
    blade(leaves, path, {
      wid, cols: 3, fold: 0.14, baseW: 0.7, widest: 0.3, taper: 1.6,
      cBase: tint.clone().multiplyScalar(0.82), cMid: tint, cTip: tint, ao: 0.7, uv: uvLive, birth, sway: 0.9, nUp: 0.15,
    });
  }
  // Dead leaves kept on as a skirt under the head: they hang down along the trunk. They come as the plant ages.
  for (let i = 0; i < 60; i++) {
    const az = i * 2.39996 + r() * 0.4;
    const y = top.y - crownH - 0.02 - r() * 0.1;
    const base = V(top.x + Math.cos(az) * R1 * 1.1, y, top.z + Math.sin(az) * R1 * 1.1);
    const len = lerp(0.45, 0.7, r());
    const path = archPath(base, { az, tilt: lerp(2.45, 2.85, r()), bend: (r() - 0.5) * 0.3, bendPow: 1.4, len, segs: 4, twist: (r() - 0.5) * 1.2, floor: 0.03 });
    const tint = jitter(col('#ffffff'), r, 0.01, 0.05, 0.08).multiplyScalar(0.72);
    blade(leaves, path, {
      wid: 0.04 + r() * 0.012, cols: 2, fold: 0.1, baseW: 0.7, widest: 0.3, taper: 1.4,
      cBase: tint.clone().multiplyScalar(0.7), cMid: tint, cTip: tint, ao: 0.7, uv: uvDead, birth: clamp(0.3 + r() * 0.5), sway: 0.25,
    });
  }
  // The leaves' wind weight follows height (stiff near the trunk, free at the tips).
  for (let k = 0; k < leaves.count; k++) {
    const p = V(leaves.pos[k * 3], leaves.pos[k * 3 + 1], leaves.pos[k * 3 + 2]);
    const a = V(leaves.anchor[k * 3], leaves.anchor[k * 3 + 1], leaves.anchor[k * 3 + 2]);
    leaves.sway[k] = clamp(swayAt(a) * 0.3 + leaves.sway[k] * 0.7 * clamp(p.distanceTo(a) / 0.75));
  }

  fitGeo([leaves, wood], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    leafMap: leafMap(),
    bark: { map: bark() },
    look: { leafRoughness: 0.5, translucency: 0.3, bend: 0.05, flutter: 0.008, woodShadows: true },
  };
};
