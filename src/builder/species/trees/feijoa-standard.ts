import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { cellClip, hardenAlpha } from '../shrubs/shared-shrubs-b';
import { bloom, leafFace, paintGlossLeaf, type GlossLeaf } from '../shrubs/shared-glossy';
import { WOOD_BEND, fitBuilders, limbAt } from './shared-trees-a';
import { citrusBark, growHead, headSkeleton, headWood, laterBelow, trunkWood } from './shared-standards';

/**
 * Pineapple guava, Feijoa sellowiana (Acca sellowiana), trained as a standard:
 * one clean, smooth gray-brown trunk under a dense, rounded head. Leaves
 * opposite, thick and leathery, elliptic to oblong with a blunt tip, 1 1/2 to
 * 3 in, with a smooth edge: the upper side a soft gray-green, a little glossy,
 * with a pale midrib; the underside covered in white felt, so it reads
 * silvery. Leaves stand up and out at angles on the shoots and a share of
 * them show their silver side, which gives the whole head its gray cast.
 * Shown in late spring bloom: single flowers about 1 1/2 in across from the
 * lower leaf axils of the new shoots, four fleshy cupped petals white on the
 * outside and flushed purple-red inside, rolled back at the edges, around a
 * brush of many long crimson stamens tipped with yellow pollen; round gray
 * buds beside them.
 *
 * References and the numbers they give:
 * - Oregon State University Landscape Plants, Feijoa sellowiana
 *   (landscapeplants.oregonstate.edu/plants/feijoa-sellowiana): leaves
 *   opposite, elliptical, 3 to 8 cm long, 2 to 4 cm wide, entire, glossy dark
 *   green above and silvery-white with dense matted hairs below; single
 *   flowers 3 to 4 cm wide from the lowest leaf axils of the season's growth,
 *   four whitish petals with red centers, numerous carmine stamens with
 *   yellow anthers; evergreen shrub or small tree, dense when pruned, takes
 *   training as a hedge, espalier or small tree.
 * - Julia F. Morton, Fruits of Warm Climates (1987), Feijoa
 *   (growables.org/information/TropicalFruit/PineappleGuavaJuliaMorton.htm):
 *   a bushy shrub 3 to 20 ft with spreading branches; leaves opposite, thick,
 *   leathery, smooth and glossy above, silvery-hairy beneath; flowers 1 1/2 in
 *   wide, four fleshy petals white outside and purplish-red inside, a cluster
 *   of many erect stamens with round golden-yellow anthers.
 * Sized to the plan's call-out, a 5 gal standard with a head about 6 ft wide
 * when mature. Size used: a 5 gal standard at 1.2 m tall x 0.5 m wide
 * (about 2 ft of clear trunk); 2.7 m (9 ft) tall x 1.8 m (6 ft) wide in eight
 * years. Leaves 2.4 in average at maturity, flowers 1.6 in across.
 */

/** Upper side: soft gray-green, a little glossy. Underside: white felt, the silver of the head. */
const TOP: GlossLeaf = {
  base: '#4c5e45', dark: '#2c3a28', fresh: '#7d9160', aspect: 0.5, widest: 0.5, tip: 0.15,
  veins: 7, impressed: 0.2, gloss: 0.12, midrib: 'rgba(190,200,170,0.7)',
};
const UNDER: GlossLeaf = {
  base: '#a9b1a3', dark: '#868e80', fresh: '#bcc3b5', aspect: 0.5, widest: 0.5, tip: 0.15,
  veins: 7, impressed: 0.05, gloss: 0.03, midrib: 'rgba(235,238,228,0.9)',
};

/** Leaf atlas: 8 single leaves (128 x 256, cells 0-4 tops, 5 a young top, 6-7 undersides); 4 shaded pairs/whorls below. */
function leafAtlas(): { map: THREE.Texture; leaf: (i: number) => [number, number, number, number]; cluster: (i: number) => [number, number, number, number] } {
  const map = leafTexture('feijoa-standard-leaves', 1024, 512, (g) => {
    const r = rng('feijoa-standard-leaf-tex');
    const fresh = [0, 0, 0.05, 0.1, 0.18, 0.7, 0, 0.1];
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      const st = i >= 6 ? UNDER : TOP;
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...st, aspect: 0.46 + r() * 0.06 }, { fresh: fresh[i], shade: (r() - 0.5) * 0.25 });
      if (i >= 6) {
        // Felt: a fine pale nap over the underside.
        for (let k = 0; k < 300; k++) {
          g.fillStyle = r() < 0.6 ? 'rgba(245,246,238,0.18)' : 'rgba(150,158,140,0.14)';
          g.fillRect(20 + r() * 88, 10 + r() * 240, 2, 2);
        }
      }
      g.restore();
    }
    // Shaded clusters seen from above: a few pairs, some silver undersides among them.
    for (let i = 0; i < 4; i++) {
      cellClip(g, i, 1, 256, 256);
      const n = 8 + Math.floor(r() * 3), a0 = r() * 6.3;
      for (let k = 0; k < n; k++) {
        const st = r() < 0.3 ? UNDER : TOP;
        paintGlossLeaf(g, r, 128, 128, 100 + r() * 18, a0 + k * 2.39996, st, { fresh: 0, shade: -0.05 - r() * 0.15, squash: 0.85 + r() * 0.2 });
      }
      g.restore();
    }
    hardenAlpha(g, 1024, 512);
  });
  const e = 1.5 / 1024;
  return {
    map,
    leaf: (i) => [i / 8 + e, 0.5 + e * 2, (i + 1) / 8 - e, 1 - e * 2],
    cluster: (i) => [i / 4 + e, e * 2, (i + 1) / 4 - e, 0.5 - e * 2],
  };
}

/** Flowers (2 x 2): two open flowers from above, one with its petals rolled further back, and a felted bud. */
function flowerTex(): THREE.Texture {
  return leafTexture('feijoa-standard-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('feijoa-standard-flower-tex');
    const flower = (cx: number, cy: number, roll: number) => {
      cellClip(g, cx, cy, S, S);
      g.translate(S / 2, S / 2);
      const R = S * 0.47, a0 = r() * 6.28;
      // Four broad, cupped petals: purple-red at the base inside, fading to pinkish white at the rim; a
      // rolled-back rim shows the white outer face.
      for (let k = 0; k < 4; k++) {
        g.save();
        g.rotate(a0 + (k * Math.PI) / 2 + (r() - 0.5) * 0.2);
        const len = R * (0.92 + r() * 0.08) * (1 - roll * 0.18), wid = R * 0.78;
        const path = () => {
          g.beginPath();
          g.moveTo(R * 0.08, 0);
          g.bezierCurveTo(len * 0.3, -wid * 0.62, len * 0.95, -wid * 0.55, len, 0);
          g.bezierCurveTo(len * 0.95, wid * 0.55, len * 0.3, wid * 0.62, R * 0.08, 0);
          g.closePath();
        };
        const grad = g.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, '#6e0f2c');
        grad.addColorStop(0.45, '#a6284a');
        grad.addColorStop(0.8, '#d68a9a');
        grad.addColorStop(1, '#f4e6e8');
        path();
        g.fillStyle = grad;
        g.shadowColor = 'rgba(60,20,30,0.45)';
        g.shadowBlur = 14;
        g.fill();
        g.shadowBlur = 0;
        g.shadowColor = 'rgba(0,0,0,0)';
        g.save();
        g.clip();
        // The cupped petal's shading and its rolled-back white rim.
        g.fillStyle = 'rgba(60,10,25,0.18)';
        g.beginPath();
        g.ellipse(len * 0.55, wid * 0.25, len * 0.45, wid * 0.22, 0, 0, 6.3);
        g.fill();
        g.strokeStyle = '#f8f2f0';
        g.lineWidth = lerp(10, 26, roll);
        g.beginPath();
        g.moveTo(len * 0.55, -wid * 0.5);
        g.quadraticCurveTo(len * 1.05, 0, len * 0.55, wid * 0.5);
        g.stroke();
        g.restore();
        g.restore();
      }
      // The brush of stamens: many crimson filaments radiating and standing up, yellow anthers at the tips.
      for (let k = 0; k < 160; k++) {
        const a = r() * 6.28, d = R * (0.12 + Math.sqrt(r()) * 0.5);
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        g.strokeStyle = ['#b3142a', '#9e0f24', '#c41e34'][k % 3];
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.05, Math.sin(a) * R * 0.05);
        g.lineTo(x, y);
        g.stroke();
        g.fillStyle = r() < 0.8 ? '#e8c43a' : '#f2dc6a';
        g.beginPath();
        g.arc(x, y, 5 + r() * 2, 0, 6.3);
        g.fill();
      }
      g.fillStyle = '#7a1428';
      g.beginPath();
      g.arc(0, 0, R * 0.07, 0, 6.3);
      g.fill();
      g.restore();
    };
    flower(0, 0, 0.2);
    flower(1, 0, 0.35);
    flower(0, 1, 0.9);
    // Bud: round and felted gray-white with the sepals' green-gray tips.
    cellClip(g, 1, 1, S, S);
    {
      const cx = S / 2, cy = S * 0.5, R = S * 0.3;
      const grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      grad.addColorStop(0, '#e6e8de');
      grad.addColorStop(0.7, '#b9bfae');
      grad.addColorStop(1, '#8e967f');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, R, 0, 6.3);
      g.fill();
      g.strokeStyle = 'rgba(120,40,60,0.45)';
      g.lineWidth = 4;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(k * 1.5708 + 0.4) * R * 0.9, cy + Math.sin(k * 1.5708 + 0.4) * R * 0.9);
        g.stroke();
      }
    }
    g.restore();
    hardenAlpha(g, 1024, 1024);
  });
}

const UV4 = (i: number): [number, number, number, number] => {
  const e = 1.5 / 1024, cx = i % 2, cy = Math.floor(i / 2);
  return [cx / 2 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 2 - e, 1 - cy / 2 - e];
};

export const build: SpeciesBuilder = (spec) => {
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = leafAtlas();

  // A rounded head over about 40 percent of the height of clean trunk; the head settles a little lower with age.
  const head = growHead(spec, r, { trunk: 0.4, bottom: 0.34, round: 2.2, lump: 0.08, shift: 0.05, scaffolds: 1, lean: [0, 0], reach: 0.5, trunkR: 0.04, levels: [] });
  head.limbs = headSkeleton(head, r, 680, 0.72, { scaffolds: 9, sideR: 0.016, twigR: [0.0055, 0.0032] });
  const { H } = head;
  const lowBirth = laterBelow(head);
  trunkWood(wood, head, r, { lean: 0.004, sides: 12 });
  headWood(wood, head, col('#d8d2c6'), col('#8a8c72'), 0.25, 2);

  const white = new THREE.Color(1, 1, 1);
  const lowY = head.trunkTop * 0.85;
  const shade = (p: THREE.Vector3, inner: number) => {
    const d = head.depth(p);
    const low = lerp(0.8, 1, clamp((p.y - lowY) / (H - lowY)));
    return jitter(white, r, 0.01, 0.03, 0.04).multiplyScalar(lerp(0.5, 1.02, Math.pow(d, 1.5)) * low * (1 - inner * 0.25) * (0.9 + r() * 0.12));
  };
  const sway = (p: THREE.Vector3) => head.sway(p) * WOOD_BEND;
  const leaf = (base: THREE.Vector3, dir: THREE.Vector3, axis: THREE.Vector3, len: number, cell: number, c: THREE.Color, birth: number, curl: boolean) => {
    const face = leafFace(dir, axis, head.outward(base), 0.8);
    const s = sway(base);
    leafQuad(leaves, base, dir, face, len, len * 0.5, at.leaf(cell), c, birth, base, {
      segs: curl ? 2 : 1, curl: curl ? 0.1 + r() * 0.25 : 0, center: head.center, radii: head.radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.06),
    });
  };
  // A quarter of the leaves turn their silver underside out.
  const cellOf = (young = false) => (r() < 0.17 ? 6 + Math.floor(r() * 2) : young && r() < 0.5 ? 5 : Math.floor(r() * 5));
  const pair = (p: THREE.Vector3, axis: THREE.Vector3, az: number, ang: number, len: number, c: THREE.Color, birth: number, young = false) => {
    for (const sd of [0, Math.PI]) leaf(p, deflect(axis, ang + (r() - 0.5) * 0.25, az + sd + (r() - 0.5) * 0.3), axis, len * (0.88 + r() * 0.24), cellOf(young), c, birth, r() < 0.5);
  };
  const twigC = col('#8a8a6a'), pedC = col('#9aa088');

  for (const l of head.limbs) {
    if (l.level !== 2) continue;
    const endP = l.pts[l.pts.length - 1];
    const prev = l.pts[l.pts.length - 2];
    const out = head.outward(endP);
    const tdir = endP.clone().sub(prev).normalize();
    const d = head.depth(endP);
    const birth = clamp(l.birth + r() * 0.04, 0, 0.9);
    const axis = out.clone().multiplyScalar(0.6).addScaledVector(tdir, 0.3).add(V((r() - 0.5) * 0.3, 0.35 + r() * 0.2, (r() - 0.5) * 0.3)).normalize();
    const shootLen = 0.1 + r() * 0.05;
    const tip = endP.clone().addScaledVector(axis, shootLen);
    const s = sway(endP);
    tube(wood, [endP, tip], 0.0028, 0.0016, 3, twigC, birth, endP, () => s, 2);
    // Opposite pairs up the shoot, each a quarter turn from the last.
    let az = r() * 6.28;
    const lit = shade(endP, 0);
    const nPairs = 5;
    for (let k = 0; k < nPairs; k++) {
      const t = (k + 0.3) / nPairs;
      const p = endP.clone().lerp(tip, t);
      az += Math.PI / 2;
      pair(p, axis, az, lerp(1.0, 0.55, t), lerp(0.066, 0.05, t), lit.clone().multiplyScalar(lerp(0.9, 1, t)), birth, k === nPairs - 1);
    }
    // Older pairs further down the twig.
    for (const t of l.length > 0.1 ? [0.35, 0.7] : [0.6]) {
      const a = limbAt(l, t);
      az += Math.PI / 2;
      pair(a.p, tdir, az, 1.1, 0.062, shade(a.p, 0.5), birth);
    }
    // Flowers from the lowest leaf axils of the new shoot, on short drooping stalks, mostly on the outside of the head.
    if (d > 0.72 && out.y > -0.5 && r() < 0.6) {
      const nF = r() < 0.4 ? 2 : 1;
      for (let f = 0; f < nF; f++) {
        const base = endP.clone().lerp(tip, 0.12 + f * 0.2);
        const fdir = deflect(axis, 1.2 + r() * 0.4, az + f * Math.PI + Math.PI / 4);
        const c = base.clone().addScaledVector(fdir, 0.025);
        const n = fdir.clone().multiplyScalar(0.55).addScaledVector(out, 0.45).add(V(0, 0.1, 0)).normalize();
        const fb = clamp(birth + 0.02);
        tube(wood, [base, c], 0.0016, 0.0013, 3, pedC, fb, base, () => s, 1);
        if (r() < 0.25) {
          // A bud.
          const bd = n.clone().lerp(UP, 0.3).normalize();
          leafQuad(flowers, c.clone().addScaledVector(bd, -0.006), bd, V(bd.z, 0, -bd.x).normalize(), 0.016, 0.016, UV4(3), col('#ffffff', 0.9), fb, base, { sway0: s, sway1: s });
        } else {
          const R = 0.023 + r() * 0.004;
          bloom(flowers, c, n, R, [{ r: 0.25, h: 0.32 }, { r: 0.6, h: 0.22 }, { r: 1.0, h: 0.06 }], 0.4, 10, UV4(r() < 0.2 ? 2 : r() < 0.5 ? 0 : 1), col('#ffffff', 0.86 + r() * 0.08), fb, base, s, r() * 6.28);
        }
      }
    }
  }

  // Older leaves along the branches and shaded clusters inside the head, so it reads dense.
  for (const l of head.limbs) {
    if (l.level > 1) continue;
    const n = Math.max(1, Math.round(l.length / (l.level === 0 ? 0.1 : 0.07)));
    for (let k = 0; k < n; k++) {
      const t = lerp(l.level === 0 ? 0.15 : 0.3, 1, (k + r() * 0.7) / n);
      const a = limbAt(l, t);
      const d = head.depth(a.p);
      if (d < 0.35 + r() * 0.15) continue;
      const o = head.outward(a.p);
      const b = clamp(l.birth + lowBirth(a.p.y) * 0.4 + (r() < 0.85 ? 0 : 0.1 + r() * 0.4), 0, 0.9);
      if (r() < 0.5) {
        const face = o.clone().lerp(UP, 0.4).add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();
        const dir = V(face.z, 0, -face.x).normalize().applyAxisAngle(face, r() * 6.28);
        const size = 0.24 + r() * 0.08;
        const base = a.p.clone().addScaledVector(dir, -size * 0.5);
        const sw = sway(a.p);
        leafQuad(leaves, base, dir, face, size, size, at.cluster(Math.floor(r() * 4)), shade(a.p, 1), b, a.p, { segs: 1, center: head.center, radii: head.radii, normalBend: 0.6, sway0: sw, sway1: sw });
      } else {
        pair(a.p, a.dir, r() * 6.28, 1.2, 0.066, shade(a.p, 0.7), b);
      }
    }
  }

  fitBuilders([wood, leaves, flowers], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(),
    bark: { map: citrusBark('feijoa-standard-bark', '#6a6254') },
    look: { leafRoughness: 0.72, translucency: 0.15, bend: 0.06, flutter: 0.007 },
  };
};
