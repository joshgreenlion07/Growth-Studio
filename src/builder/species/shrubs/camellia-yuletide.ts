import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import {
  buildFrame, frameWood, lumps, normalAt, shellSprigs, simpleBark, sprigCard, swayFn, tipOf, twigBirthLookup, type Shape, type UV,
} from './shared-shrubs-a';
import { cellClip, hardenAlpha, tone } from './shared-shrubs-b';
import { bloom, leafFace, paintGlossLeaf, paintSpray, type GlossLeaf, type SprayStyle } from './shared-glossy';

/**
 * Camellia sasanqua 'Yuletide' (sold as C. sasanqua; the RHS and the American
 * Camellia Society file it as C. x vernalis), in its winter bloom.
 *
 * An upright, dense, compact evergreen shrub, an oval narrowing to a rounded
 * top, on smooth gray-brown stems. Small leathery leaves, 1.5 to 2 in,
 * elliptic with a pointed tip and finely toothed edge, very dark glossy
 * green, alternate in flat sprays along the twigs. Single bright orange-red
 * (scarlet) flowers about 2.5 in across, five to seven broad petals around a
 * dense boss of golden-yellow stamens, open at the twig ends and leaf axils
 * over the whole outside of the plant from November into January, with many
 * round buds still to open.
 *
 * References:
 *  - Monrovia, Yuletide Camellia: 8 to 10 ft tall and wide, upright, moderate
 *    growth; brilliant red single flowers with bright yellow stamens, fall
 *    through winter; glossy dark green leaves.
 *    https://www.monrovia.com/yuletide-camellia.html
 *  - American Camellia Society encyclopedia, 'Yuletide': orange red, small
 *    (2.5 to 3 in), single, golden anthers; upright, dense, medium growth.
 *    https://americancamellias.com/education-and-camellia-care/acs-camellia-encyclopedia/camellias-beginning-with-xy-or-z/yuletide
 *  - NC State Extension, Camellia sasanqua: leaves 1.5 to 3 in, glossy dark
 *    green, serrate; flowers 2 to 3 in, solitary or 2 to 3 in the leaf axils;
 *    6 to 14 ft tall, 5 to 7 ft wide. https://plants.ces.ncsu.edu/plants/camellia-sasanqua/
 *  - Woodlanders and Nature Hills: 'Yuletide' matures 8 to 10 ft.
 * Catalog: 5 gal at 0.75 x 0.45 m, mature 2.4 m tall x 1.8 m wide (8 x 6 ft,
 * the upright end of the references) in about 8 years.
 */

const LEAF: GlossLeaf = {
  base: '#1a3717', dark: '#0a1d09', fresh: '#557a2c', aspect: 0.46, widest: 0.42, tip: 0.78,
  teeth: 16, toothDepth: 0.035, veins: 5, impressed: 0.12, gloss: 0.42, midrib: 'rgba(150,178,108,0.7)',
};
const SPRAY: SprayStyle = { twig: '#5c4c3a', twigW: 0.013, leafLen: 0.37, nodes: 8, angle: 1.05, height: 0.84, petiole: 0.016, side: 2 };

function camelliaAtlas(): { map: THREE.Texture; spray: (i: number) => UV; leaf: (i: number) => UV } {
  const map = leafTexture('camellia-yuletide-leaves', 1024, 1024, (g) => {
    const r = rng('camellia-yuletide-leaf-tex');
    const bud = (x: number, y: number, ang: number) => {
      const bx = x + Math.cos(ang) * 9, by = y + Math.sin(ang) * 9, rad = 7 + r() * 3;
      const grad = g.createRadialGradient(bx - 2, by - 3, 1, bx, by, rad);
      grad.addColorStop(0, '#c23a2c');
      grad.addColorStop(0.45, '#7a3020');
      grad.addColorStop(1, '#3c4a20');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, rad, 0, 6.3);
      g.fill();
    };
    // Sprays: 0-5 plain, 6-7 in shade (inner foliage), 8-11 carrying round flower buds in the axils.
    for (let i = 0; i < 12; i++) {
      cellClip(g, i % 4, Math.floor(i / 4), 256, 256);
      const shaded = i === 6 || i === 7;
      const buds = i >= 8;
      paintSpray(g, r, 256, 256, LEAF, { ...SPRAY, nodes: 7 + Math.floor(r() * 3) }, {
        fresh: shaded ? 0 : r() * 0.25, shade: shaded ? -0.55 : (r() - 0.5) * 0.25,
        axil: buds ? (x, y, a, k, n) => { if (k >= n - 4 && r() < 0.6) bud(x, y, a + (k % 2 ? 1 : -1) * 0.6); } : undefined,
      });
      g.restore();
    }
    // Single leaves for the shoot tips.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(i * 128, 768);
      g.beginPath();
      g.rect(1, 1, 126, 254);
      g.clip();
      paintGlossLeaf(g, r, 64, 252, 244, -Math.PI / 2, { ...LEAF, aspect: 0.44 + r() * 0.06 }, { fresh: [0, 0, 0.05, 0.08, 0.12, 0.18, 0.3, 0.5][i], shade: (r() - 0.5) * 0.25 });
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
  const e = 1.5 / 1024;
  return {
    map,
    spray: (i) => {
      const cx = i % 4, cy = Math.floor(i / 4);
      return [cx / 4 + e, 1 - (cy + 1) / 4 + e, (cx + 1) / 4 - e, 1 - cy / 4 - e];
    },
    leaf: (i) => [i / 8 + e, e, (i + 1) / 8 - e, 0.25 - e],
  };
}

/** Flowers: two open blooms and an older one (top views), and a round bud (side view). */
function flowerTex(red: string, gold: string): THREE.Texture {
  return leafTexture('camellia-yuletide-flowers', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('camellia-yuletide-flower-tex');
    const petal = (ang: number, len: number, wid: number, c: { base: string; mid: string; edge: string }) => {
      g.save();
      g.rotate(ang);
      const grad = g.createRadialGradient(0, 0, len * 0.1, len * 0.2, 0, len);
      grad.addColorStop(0, c.base);
      grad.addColorStop(0.45, c.mid);
      grad.addColorStop(1, c.edge);
      g.fillStyle = grad;
      // Broad obovate petal with a shallow notch and a wavy rim.
      const nt = len * (0.04 + r() * 0.05), sk = (r() - 0.5) * 0.15 * wid;
      g.beginPath();
      g.moveTo(len * 0.05, 0);
      g.bezierCurveTo(len * 0.25, -wid * 0.55, len * 0.78, -wid * 0.72, len * 0.98, -wid * 0.22 + sk);
      g.quadraticCurveTo(len * 1.0, sk, len - nt, sk);
      g.quadraticCurveTo(len * 1.0, sk, len * 0.98, wid * 0.22 + sk);
      g.bezierCurveTo(len * 0.78, wid * 0.72, len * 0.25, wid * 0.55, len * 0.05, 0);
      g.closePath();
      g.shadowColor = 'rgba(50,0,0,0.5)';
      g.shadowBlur = 12;
      g.fill();
      g.shadowBlur = 0;
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(90,0,10,0.18)';
      g.lineWidth = 1.4;
      for (let i = -5; i <= 5; i++) {
        g.beginPath();
        g.moveTo(len * 0.08, 0);
        g.quadraticCurveTo(len * 0.5, i * wid * 0.07, len * 0.97, i * wid * 0.1 + sk);
        g.stroke();
      }
      // Satin sheen on one side of the petal.
      g.fillStyle = 'rgba(255,170,150,0.14)';
      g.beginPath();
      g.ellipse(len * 0.62, -wid * 0.2, len * 0.28, wid * 0.16, 0.2, 0, 6.3);
      g.fill();
      g.restore();
      g.restore();
    };
    const flower = (c: { base: string; mid: string; edge: string }, n: number, anther: string, fil: string) => {
      g.translate(S / 2, S / 2);
      const R = S * 0.48;
      const a0 = r() * 6.28;
      const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
      for (const i of order) petal(a0 + (i / n) * 6.2832 + (r() - 0.5) * 0.25, R * (0.92 + r() * 0.08), R * (0.95 + r() * 0.15), c);
      // Stamen boss: a ring of filaments, golden anthers crowded at the rim, a pale style in the middle.
      g.fillStyle = tone(fil, '#b8860e', 0.45);
      g.beginPath();
      g.arc(0, 0, R * 0.26, 0, 6.3);
      g.fill();
      for (let i = 0; i < 100; i++) {
        const a = r() * 6.28, d0 = R * (0.04 + r() * 0.07), d = R * (0.17 + r() * 0.14);
        g.strokeStyle = tone(fil, '#fff0a0', r() * 0.3);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
        g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        g.stroke();
        g.fillStyle = tone(anther, '#c08010', r() * 0.5);
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 5, 3.6, a, 0, 6.3);
        g.fill();
      }
      g.fillStyle = '#e8e2b0';
      g.beginPath();
      g.arc(0, 0, R * 0.045, 0, 6.3);
      g.fill();
    };
    const fresh = { base: tone(red, '#5a0010', 0.45), mid: red, edge: tone(red, '#f0303c', 0.25) };
    cellClip(g, 0, 0, S, S); flower(fresh, 6, gold, '#f0cc3a'); g.restore();
    cellClip(g, 1, 0, S, S); flower({ ...fresh, edge: tone(red, '#ff4a40', 0.12) }, 7, gold, '#f0cc3a'); g.restore();
    // An older bloom, a little deeper and pinker, its stamens browning.
    const older = { base: tone(red, '#4a0018', 0.5), mid: tone(red, '#c0284c', 0.3), edge: tone(red, '#d84a6a', 0.3) };
    cellClip(g, 0, 1, S, S); flower(older, 6, '#c08a28', '#d8c070'); g.restore();
    // Round bud, side view: red showing above green-brown bracts, on a short stalk.
    cellClip(g, 1, 1, S, S);
    {
      const cx = S / 2, cy = S * 0.5, rad = S * 0.36;
      const grad = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.4, rad * 0.1, cx, cy, rad);
      grad.addColorStop(0, tone(red, '#ff8a70', 0.3));
      grad.addColorStop(0.6, red);
      grad.addColorStop(1, tone(red, '#3a0008', 0.5));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, rad * 0.92, rad, 0, 0, 6.3);
      g.fill();
      for (let i = 0; i < 7; i++) {
        const a = lerp(-1.1, 1.1, i / 6) + (r() - 0.5) * 0.2;
        g.save();
        g.translate(cx + Math.sin(a) * rad * 0.55, cy + rad * 0.55);
        g.rotate(a * 0.8);
        g.fillStyle = tone('#4f5a26', '#6a4a26', r());
        g.beginPath();
        g.ellipse(0, -rad * 0.2, rad * 0.32, rad * 0.5, 0, 0, 6.3);
        g.fill();
        g.strokeStyle = 'rgba(200,190,140,0.35)';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
      g.strokeStyle = '#4a4a28';
      g.lineWidth = 18;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy + rad * 0.9);
      g.lineTo(cx, S - 2);
      g.stroke();
    }
    g.restore();
    hardenAlpha(g, 1024, 1024);
  });
}

const UV4 = (i: number): UV => {
  const e = 1.5 / 1024, cx = i % 2, cy = Math.floor(i / 2);
  return [cx / 2 + e, 1 - (cy + 1) / 2 + e, (cx + 1) / 2 - e, 1 - cy / 2 - e];
};

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const at = camelliaAtlas();

  // Upright oval: widest a little below the middle, tapering to a rounded top, full nearly to the ground.
  const a = (Sp / 2) * 0.95, top = H * 0.97, sPeak = 0.34, c = V(0, H * 0.42, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.8 + 0.2 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.pow(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 2.0)), 0.55);
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.13 * (1 + lumps(p, c, 1.3)) + 0.07 * lumps(p, c, 5.1) + 0.03 * Math.sin(p.y * 5 + Math.atan2(p.z, p.x) * 3));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 7, stemBaseR: 0.12, stemR: 0.026, stemReach: 0.72, arch: 0.28, stemYMin: 0.35, secs: 150, twigs: 540, twigInset: 0.07, wobble: 0.1, early: 0.85 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#ffffff', 0.48), twigCol = col('#5e5040');
  frameWood(wood, frame, { r, sway, twigFrac: 0.4, color: (b) => (b.level === 2 ? twigCol : stemCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const tint = (depth: number, p: THREE.Vector3) => jitter(white, r, 0.01, 0.04, 0.04).multiplyScalar(lerp(1, 0.6, depth) * lerp(0.78, 1, clamp(p.y / (H * 0.6))) * (0.88 + r() * 0.12));
  const birth = twigBirthLookup(frame.twigs);
  // Outer foliage: flat sprays lying along the surface; a quarter carry buds.
  shellSprigs(leaves, r, sh, {
    n: 2100, len: [0.16, 0.22], inset: 0.24, tangent: 0.62, up: 0.3, nb: 0.3, sway, birth, early: 0.75,
    cell: (depth) => at.spray(depth > 0.65 ? 6 + Math.floor(r() * 2) : r() < 0.25 ? 8 + Math.floor(r() * 4) : Math.floor(r() * 6)),
    color: tint,
  });
  // Deep shaded foliage so the bush is solid.
  shellSprigs(leaves, r, sh, {
    n: 450, len: [0.18, 0.24], inset: Sp * 0.28, tangent: 0.5, up: 0.3, nb: 0.6, sway, early: 1, birth: () => 0,
    cell: () => at.spray(6 + Math.floor(r() * 2)),
    color: (depth) => white.clone().multiplyScalar(lerp(0.7, 0.42, depth)),
  });

  // Shoot tips: a few real leaves spiralling up the last inches, then a flower, a bud or a leaf.
  const pedC = col('#4f4a2c');
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    const n = normalAt(sh, p);
    const axis = n.clone().multiplyScalar(0.6).addScaledVector(dir, 0.4).add(V(0, 0.35, 0)).normalize();
    const b0 = clamp(tw.birth + r() * 0.05, 0, 0.9);
    const s = sway(p);
    const lit = white.clone().multiplyScalar((0.86 + r() * 0.14) * lerp(0.8, 1, clamp(p.y / (H * 0.6))));
    let az = r() * 6.28;
    const tip = p.clone().addScaledVector(axis, 0.05);
    for (let k = 0; k < 4; k++) {
      const q = p.clone().lerp(tip, k / 4);
      az += 2.4 + (r() - 0.5) * 0.4;
      const d = deflect(axis, 0.95 - k * 0.1 + (r() - 0.5) * 0.25, az).add(V(0, 0.1, 0)).normalize();
      const len = (0.05 - k * 0.003) * (0.88 + r() * 0.24);
      leafQuad(leaves, q, d, leafFace(d, axis, n, 0.4), len, len * 0.5, at.leaf(k === 3 ? 4 + Math.floor(r() * 4) : Math.floor(r() * 6)), lit, b0, q, { segs: 1, center: c, radii: V(a, H * 0.55, a), normalBend: 0.35, sway0: s, sway1: s });
    }
    tube(wood, [p, tip], 0.0018, 0.0012, 3, twigCol, b0, p, () => s, 2);
    const facing = n.y > -0.45;
    const roll = r();
    if (facing && roll < 0.4) {
      // Open flower, turned out from the bush.
      const fn = n.clone().multiplyScalar(0.62).addScaledVector(axis, 0.38).add(V((r() - 0.5) * 0.3, 0.12, (r() - 0.5) * 0.3)).normalize();
      const R = 0.031 + r() * 0.005;
      const fc = tip.clone().addScaledVector(fn, 0.006);
      const old = r() < 0.18;
      bloom(flowers, fc, fn, R, [{ r: 0.28, h: 0.3 }, { r: 0.33, h: 0.07 }, { r: 1.0, h: 0.2 }], 0.25, 7, UV4(old ? 2 : r() < 0.5 ? 0 : 1), col('#ffffff', 0.86 + r() * 0.12), b0, p, s, r() * 6.28);
    } else if (facing && roll < 0.72) {
      const bd = axis.clone().lerp(UP, 0.2).normalize();
      const size = 0.014 + r() * 0.005;
      tube(wood, [tip, tip.clone().addScaledVector(bd, 0.004)], 0.0016, 0.0014, 3, pedC, b0, p, () => s, 1);
      const f1 = perp(bd), f2 = V().crossVectors(bd, f1).normalize();
      for (const f of [f1, f2]) leafQuad(flowers, tip.clone().addScaledVector(bd, -0.002), bd, f, size * 1.25, size, UV4(3), col('#ffffff', 0.85), b0, p, { sway0: s, sway1: s });
    }
  }

  // A few vigorous shoots standing out of the outline, as on an unsheared plant.
  for (const tw of frame.twigs) {
    const { p, dir } = tipOf(tw);
    if (p.y < H * 0.45 || r() > 0.045) continue;
    const n = normalAt(sh, p);
    const d = n.clone().multiplyScalar(0.5).addScaledVector(dir, 0.3).add(V(0, 0.55, 0)).normalize();
    const len = 0.1 + r() * 0.12;
    const e = p.clone().addScaledVector(d, len).add(V(0, -len * 0.08, 0));
    const b0 = clamp(Math.max(tw.birth, 0.25) + r() * 0.2, 0, 0.9);
    const s0 = sway(p), s1 = clamp(sway(e) + 0.1);
    tube(wood, [p, p.clone().lerp(e, 0.5).add(V(0, len * 0.04, 0)), e], 0.0035, 0.0018, 3, twigCol, b0, p, (i) => lerp(s0, s1, i / 2), 2);
    for (let k = 0; k < 3; k++) {
      const q = p.clone().lerp(e, 0.25 + k * 0.3);
      const sd = deflect(d, 0.45 + r() * 0.3, r() * 6.28);
      const L = 0.15 + r() * 0.05;
      sprigCard(leaves, q, sd, n.clone().add(V(0, 0.4, 0)).normalize(), L, L, at.spray(Math.floor(r() * 6)), white.clone().multiplyScalar(0.9 + r() * 0.1), b0, q, n, 0.5, lerp(s0, s1, 0.5), s1);
    }
    if (r() < 0.6) {
      const fn = n.clone().lerp(d, 0.4).normalize();
      bloom(flowers, e.clone().addScaledVector(fn, 0.008), fn, 0.032, [{ r: 0.28, h: 0.3 }, { r: 0.33, h: 0.07 }, { r: 1.0, h: 0.2 }], 0.25, 7, UV4(r() < 0.5 ? 0 : 1), col('#ffffff', 0.92), b0, e, s1, r() * 6.28);
    }
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(spec.flower ?? '#c4161c', spec.flower2 ?? '#f2c230'),
    bark: { map: simpleBark('camellia-yuletide-bark', '#8f877a', '#625a4e', '#b4ab9b') },
    look: { leafRoughness: 0.66, translucency: 0.14, bend: 0.05, flutter: 0.006, woodShadows: false },
  };
};
