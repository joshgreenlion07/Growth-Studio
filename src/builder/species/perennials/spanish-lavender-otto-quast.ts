import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, jitter, leafPath, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, fitAll, growMound, hardenAlpha, moundWood, sprig, sprigDir, stemBark, tone } from '../shrubs/shared-shrubs-b';

/**
 * Spanish lavender, Lavandula stoechas 'Otto Quast', in full spring bloom.
 *
 * A compact, dense, rounded mound of upright leafy shoots. Leaves are narrow
 * (linear-lanceolate), about 1 in long, gray-green and finely felted, crowded
 * in opposite pairs with tufts in the axils, so each shoot looks bushy. The
 * flower heads are the signature: short, fat, four-sided heads about 1 to
 * 1.5 in long, packed with dark blackish-purple fertile bracts and tiny
 * deep purple florets, each crowned by two to four upright petal-like
 * magenta-purple bracts ("rabbit ears") up to an inch long. They stand on
 * short stems just above the foliage and cover the whole top of the mound.
 * Unlike lavandin (the catalog's 'lavender'), there are no long wands and no
 * slender spikes.
 *
 * References and the numbers they give:
 * - San Marcos Growers, plant_id=949
 *   (smgrowers.com/products/plants/plantdisplay.asp?plant_id=949): dense
 *   shrub 1 to 2 ft tall by 2 to 3 ft wide; gray-green lanceolate leaves
 *   1 in long; tight spikes of small purple flowers on short stalks, crowned
 *   by several 1 in or larger purple petal-like bracts; blooms most of the
 *   year, strongest April to August.
 * - UC Davis Arboretum, "Otto Quast Spanish lavender"
 *   (arboretum.ucdavis.edu/node/28196, an Arboretum All-Star for the
 *   Central Valley): 2 to 3 ft tall, 3 to 4 ft wide.
 * - Devil Mountain Nursery (devilmountainnursery.com): 2 to 3 ft by
 *   2 to 3 ft; linear gray-green foliage; plump dark purple flower heads
 *   topped with large light purple flag-like bracts.
 * Size used (catalog): 0.75 m tall with the heads x 0.9 m wide.
 */

/** Leaf atlas: eight leafy shoots in 256 x 512 cells, base at the bottom. */
function leafTex(): THREE.Texture {
  return leafTexture('otto-quast-leaves', 1024, 1024, (g) => {
    const cw = 256, ch = 512;
    const r = rng('otto-quast-leaf-tex');
    const leaf = (x: number, y: number, ang: number, len: number, wid: number, young: number, sh: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, tone(tone('#3f5636', '#506846', sh), '#6a8159', young));
      grad.addColorStop(1, tone(tone('#526b46', '#647d56', sh), '#82976f', young));
      g.fillStyle = grad;
      leafPath(g, len, wid, 0.5, 0.25);
      g.fill();
      // Felted, pale rolled-under margin and a sunken midrib.
      g.strokeStyle = 'rgba(160,176,148,0.4)';
      g.lineWidth = 1.4;
      g.stroke();
      g.strokeStyle = 'rgba(48,64,44,0.55)';
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(len * 0.04, 0);
      g.lineTo(len * 0.92, 0);
      g.stroke();
      g.restore();
    };
    for (let cell = 0; cell < 8; cell++) {
      cellClip(g, cell % 4, Math.floor(cell / 4), cw, ch);
      const short = cell >= 6;
      const x0 = cw / 2, y0 = ch - 2, top = ch * (short ? 0.42 : 0.12 + r() * 0.08);
      const bend = (r() - 0.5) * 26;
      const sx = (t: number) => x0 + bend * t * t, sy = (t: number) => lerp(y0, top, t);
      const nodes = short ? 7 : 11;
      const info = Array.from({ length: nodes }, (_, i) => ({ t: 0.04 + (i / nodes) * 0.92, len: (118 - i * 3.5) * (0.85 + r() * 0.3), sh: r() }));
      // Pairs pointing toward and away from the viewer: short, behind the stem.
      for (const w of info.filter((_, i) => i % 2 === 1)) leaf(sx(w.t), sy(w.t), (r() - 0.5) * 0.5, w.len * 0.6, 17, 0, w.sh * 0.4);
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = tone('#7e785e', '#93a084', (i / 10) * 1.6);
        g.lineWidth = lerp(9, 5, i / 10);
        g.beginPath();
        g.moveTo(sx(i / 10), sy(i / 10));
        g.lineTo(sx((i + 1) / 10), sy((i + 1) / 10));
        g.stroke();
      }
      for (const w of info) {
        const young = w.t > 0.78 ? 0.7 : 0;
        for (const s of [-1, 1]) {
          leaf(sx(w.t), sy(w.t), s * (0.42 + (r() - 0.5) * 0.35 - w.t * 0.12), w.len * (0.9 + r() * 0.2), 17 + r() * 5, young, clamp(w.sh + (r() - 0.5) * 0.3));
          // Tufts of small leaves in the axils make the shoot bushy.
          if (r() < 0.85) leaf(sx(w.t), sy(w.t), s * (0.18 + r() * 0.25), w.len * (0.4 + r() * 0.2), 12, 0.6, r());
        }
      }
      // A rosette of young leaves at the tip.
      for (let i = 0; i < 5; i++) leaf(sx(1), sy(1), (i - 2) * 0.26 + (r() - 0.5) * 0.15, 52 + r() * 28, 13, 0.85, 0.5 + r() * 0.5);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/**
 * Flower atlas, 512 x 512:
 * cells 0..1 (uvCell(4, 2, i), top row left): the head's surface, wrapped
 * around the barrel (u around, v base to top); cells 4..7 (bottom row):
 * single bracts (base at the bottom); cells 2..3: peduncle and a bud head.
 */
function flowerTex(bract: string): THREE.Texture {
  return leafTexture('otto-quast-flowers', 512, 512, (g) => {
    const r = rng('otto-quast-flower-tex');
    const cw = 128, ch = 256;
    // Head surface: four ranks of overlapping, rounded fertile bracts, dark
    // purple-black with a hoary sheen, tiny deep violet florets between them.
    for (let c = 0; c < 2; c++) {
      cellClip(g, c, 0, cw, ch);
      g.fillStyle = '#1a0c22';
      g.fillRect(0, 0, cw, ch);
      const rows = 9;
      for (let row = 0; row < rows; row++) {
        for (let k = 0; k < 4; k++) {
          const x = ((k + (row % 2) * 0.5) / 4) * cw + (r() - 0.5) * 6;
          const y = ch - (row + 0.6) * (ch / rows) + (r() - 0.5) * 6;
          for (const dx of [0, cw, -cw]) {
            const gg = g.createRadialGradient(x + dx, y - 6, 2, x + dx, y, 22);
            gg.addColorStop(0, tone('#4e2c5c', '#6a4a72', r() * 0.6));
            gg.addColorStop(0.6, '#2e1636');
            gg.addColorStop(1, '#180a1e');
            g.fillStyle = gg;
            g.beginPath();
            g.ellipse(x + dx, y, 19, 15, 0, 0, Math.PI * 2);
            g.fill();
            // Fine hairs catching the light along each bract's rim.
            g.strokeStyle = 'rgba(205,185,210,0.2)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.ellipse(x + dx, y + 1, 17, 13, 0, Math.PI * 1.1, Math.PI * 1.9);
            g.stroke();
          }
          // A floret peeking out above the bract: a tiny dark violet star.
          if (r() < (c === 0 ? 0.45 : 0.25)) {
            const fx = x + (r() - 0.5) * 12, fy = y - 13;
            g.fillStyle = tone('#34175c', '#4c2280', r());
            for (let p = 0; p < 5; p++) {
              const a = (p / 5) * Math.PI * 2 + r();
              g.beginPath();
              g.ellipse(fx + Math.cos(a) * 3.5, fy + Math.sin(a) * 3.5, 3.4, 2.4, a, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
      }
      g.restore();
    }
    // Cell 2: peduncle (gray-green, felted). Cell 3: a young head, greener at the base.
    cellClip(g, 2, 0, cw, ch);
    g.fillStyle = '#87927a';
    g.fillRect(0, 0, cw, ch);
    g.restore();
    cellClip(g, 3, 0, cw, ch);
    const yg = g.createLinearGradient(0, ch, 0, 0);
    yg.addColorStop(0, '#5a6450');
    yg.addColorStop(0.5, '#2c1a34');
    yg.addColorStop(1, '#1c0e24');
    g.fillStyle = yg;
    g.fillRect(0, 0, cw, ch);
    g.restore();
    // Bracts: obovate flags, narrowed at the base, with fine veins and a wavy edge.
    for (let c = 0; c < 4; c++) {
      cellClip(g, c, 1, cw, ch);
      g.translate(cw / 2, ch - 2);
      g.rotate(-Math.PI / 2);
      const len = ch * (0.94 - (c % 2) * 0.08), wid = cw * (0.78 + (c % 2) * 0.1);
      const bg = g.createLinearGradient(0, 0, len, 0);
      bg.addColorStop(0, tone(bract, '#3a1a50', 0.55));
      bg.addColorStop(0.25, tone(bract, '#3a1a50', 0.12));
      bg.addColorStop(0.7, bract);
      bg.addColorStop(1, tone(bract, '#d6a6ec', 0.25 + (c === 3 ? 0.15 : 0)));
      g.fillStyle = bg;
      leafPath(g, len, wid, 0.7, 0.05);
      g.fill();
      g.save();
      g.clip();
      g.strokeStyle = tone(bract, '#401858', 0.5);
      g.globalAlpha = 0.45;
      g.lineWidth = 1.6;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(len * 0.05, 0);
        g.quadraticCurveTo(len * 0.5, k * wid * 0.07, len * 0.97, k * wid * 0.12);
        g.stroke();
      }
      // A soft sheen down one side: the bract is slightly cupped.
      g.globalAlpha = 0.18;
      g.fillStyle = '#ffffff';
      g.fillRect(len * 0.3, -wid * 0.45, len * 0.7, wid * 0.22);
      g.restore();
      g.restore();
    }
    hardenAlpha(g, 512, 512);
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();
  const L = 0.1, W = 0.05;

  // The leafy mound is about 80% of the height; the heads ride just above it.
  const m = growMound(r, { H: H * 0.8, Sp: Sp * 0.94, points: 270, stems: 12, perLimb: 8, centerY: 0.42, under: -0.8, power: 2.3, lump: 0.06, rough: 0.08, stemRadius: 0.008, crown: 0.06, arch: 0.0, gnarl: 0.14, twigSegs: 1, early: 0.62 });
  const stemC = col('#6e6352'), limbC = col('#857d68'), twigC = col('#99a08a');
  moundWood(wood, m, (b) => (b.level === 0 ? stemC : b.level === 1 ? limbC : twigC), { uvScale: 2, sides: [6, 4, 3] });

  const tint = (p: THREE.Vector3, inner: number) => {
    const d = m.depth(p);
    const shade = lerp(0.5, 1, Math.pow(d, 2)) * lerp(0.8, 1, clamp(p.y / (m.H * 0.5))) * (1 - inner * 0.3);
    return jitter(col('#f6f7f0'), r, 0.02, 0.05, 0.04).multiplyScalar(shade * (0.9 + r() * 0.14));
  };

  const headUV = (k: number) => uvCell(4, 2, k);
  /**
   * One flower head: a short felted stalk, a fat four-sided barrel of dark
   * bracts (a 5-sided spindle, solid), and 2 to 4 petal bracts on top.
   */
  const head = (base: THREE.Vector3, dir: THREE.Vector3, birth: number) => {
    const stalk = 0.025 + r() * 0.035;
    const hl = 0.03 + r() * 0.012, hr = hl * (0.28 + r() * 0.05);
    const p0 = base.clone().addScaledVector(dir, stalk);
    const s0 = m.sway(base), s1 = clamp(s0 + 0.25);
    tube(wood, [base, p0], 0.0016, 0.0013, 3, col('#8e997e'), birth, base, (i) => (i ? s1 : s0), 1);
    const young = r() < 0.12;
    const uv = headUV(young ? 3 : r() < 0.5 ? 0 : 1);
    const a = perp(dir), b = V().crossVectors(dir, a).normalize();
    // Four-sided like the real head (its bracts stand in four ranks).
    const S = 4, spin = r() * 6.28;
    const prof: [number, number][] = [[0.12, 0.72], [0.45, 1.0], [0.86, 0.9]];
    const c = jitter(col('#ffffff', 0.92 + r() * 0.1), r, 0.01, 0.04, 0.04);
    const ring = (t: number, rad: number) => {
      const ids: number[] = [];
      for (let k = 0; k <= S; k++) {
        const ang = spin + (k / S) * Math.PI * 2;
        const o = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
        const n = o.clone().addScaledVector(dir, (0.5 - t) * 0.9).normalize();
        ids.push(flowers.vert(p0.clone().addScaledVector(dir, t * hl).addScaledVector(o, rad * hr), n, lerp(uv[0], uv[2], k / S), lerp(uv[1], uv[3], t), c, birth, base, s1));
      }
      return ids;
    };
    const um = (uv[0] + uv[2]) / 2;
    const bot = flowers.vert(p0.clone().addScaledVector(dir, -hl * 0.02), dir.clone().negate(), um, uv[1], c, birth, base, s1);
    const top = flowers.vert(p0.clone().addScaledVector(dir, hl * 0.96), dir.clone(), um, uv[3], c, birth, base, s1);
    const rings = prof.map(([t, rad]) => ring(t, rad));
    for (let k = 0; k < S; k++) flowers.tri(bot, rings[0][k + 1], rings[0][k]);
    for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < S; k++) flowers.quad(rings[j][k], rings[j][k + 1], rings[j + 1][k + 1], rings[j + 1][k]);
    for (let k = 0; k < S; k++) flowers.tri(top, rings[rings.length - 1][k], rings[rings.length - 1][k + 1]);
    if (young) return;
    // The "rabbit ears": 2 to 4 upright bracts flaring a little outward.
    const nb = r() < 0.2 ? 2 : r() < 0.75 ? 3 : 4;
    const az0 = r() * 6.28;
    const tipP = p0.clone().addScaledVector(dir, hl * 0.9);
    for (let k = 0; k < nb; k++) {
      const az = az0 + (k / nb) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const o = a.clone().multiplyScalar(Math.cos(az)).addScaledVector(b, Math.sin(az));
      const bl = 0.018 + r() * 0.01;
      const bd = dir.clone().multiplyScalar(Math.cos(0.3 + r() * 0.35)).addScaledVector(o, Math.sin(0.3 + r() * 0.35)).normalize();
      const bc = jitter(col('#ffffff', 0.92 + r() * 0.1), r, 0.012, 0.04, 0.04);
      leafQuad(flowers, tipP.clone().addScaledVector(o, hr * 0.35), bd, o, bl, bl * (0.55 + r() * 0.1), uvCell(4, 2, 4 + Math.floor(r() * 4)), bc, birth, base, { segs: 1, curl: 0, sway0: s1, sway1: clamp(s1 + 0.05), center: null, radii: null });
    }
  };

  for (const tw of m.twigs) {
    const end = tw.pts[tw.pts.length - 1];
    const out = m.out(end);
    const born = () => (tw.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.4) : clamp(tw.birth + r() * 0.1, 0, 0.9));
    for (let k = 0; k < 4; k++) {
      const at = along(tw.pts, lerp(0.3, 1, (k + r() * 0.8) / 4)).p;
      const dir = sprigDir(r, out, 0.25 + r() * 0.55, 0.5);
      const len = L * (0.75 + r() * 0.45);
      sprig(leaves, r, m, at, dir, len, W * (len / L), uvCell(4, 2, Math.floor(r() * 8)), tint(at, 0.1), born(), { cross: k % 3 === 0, curl: (r() - 0.4) * 0.4, faceOut: 0.75 });
    }
    const dir = out.clone().lerp(UP, 0.45).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    sprig(leaves, r, m, end, dir, L * (0.8 + r() * 0.3), W, uvCell(4, 2, 6 + Math.floor(r() * 2)), tint(end, 0), tw.birth, { cross: true, curl: 0.1, faceOut: 0.4 });
    // Heads on short stalks from the shoot tips over the whole top and upper sides.
    if (out.y > -0.15) {
      const n = out.y > 0.3 ? 2 + (r() < 0.35 ? 1 : 0) : r() < 0.75 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const base = along(tw.pts, 0.8 + r() * 0.2).p.add(V((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.03));
        const hd = out.clone().lerp(UP, 0.6 + r() * 0.3).add(V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3)).normalize();
        head(base, hd, clamp(tw.birth + (k ? 0.05 + r() * 0.3 : 0.02), 0, 0.9));
      }
    }
  }
  // Inner foliage along the limbs so the mound is not hollow.
  for (const b of m.limbs) {
    for (let k = 0; k < 5; k++) {
      const at = along(b.pts, 0.2 + r() * 0.8).p;
      const dir = sprigDir(r, m.out(at), 0.6 + r() * 0.7, 0.4);
      sprig(leaves, r, m, at, dir, L * 1.2, W * 1.3, uvCell(4, 2, Math.floor(r() * 6)), tint(at, 1), b.birth === 0 ? (r() < 0.9 ? 0 : r() * 0.5) : b.birth, { segs: 1, curl: 0, faceOut: 0.8 });
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: flowerTex(spec.flower2 ?? '#8e4ab8'),
    bark: { map: stemBark('otto-quast', 0.2) },
    look: { translucency: 0.25, leafRoughness: 0.85, bend: 0.06, flutter: 0.01 },
  };
};
