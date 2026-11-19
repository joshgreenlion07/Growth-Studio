import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { TAU, fitMat, growRunners, heading, inCell, lay, rect, type UV } from './shared-groundcovers';

/**
 * Spotted dead nettle, Lamium maculatum 'White Nancy': a low, spreading mat of
 * square trailing stems that root as they go. Leaves in opposite pairs on
 * short stalks, heart-shaped to broadly ovate, 1 to 1 1/2 in, with blunt
 * round teeth; the blade is silver all over except a narrow dark green edge
 * and a faint green midrib. Short upright shoots carry two or three whorls of
 * pure white two-lipped flowers, the upper lip a hood, in late spring and
 * early summer. Shown in bloom.
 *
 * References and the numbers they give:
 * - RHS, Lamium maculatum 'White Nancy' (rhs.org.uk/plants/90876): a
 *   spreading perennial to 20 cm forming a wide mat of heart-shaped silvery
 *   leaves narrowly edged with dark green; short spikes of pure white flowers;
 *   spread 0.5 to 1 m; Award of Garden Merit; shade.
 * - Gertens plant finder, White Nancy Lamium (plants.gertens.com/12070009/Plant/2677/White_Nancy_Lamium):
 *   about 8 in tall, 18 in wide; oval leaves that stay silver with distinct
 *   forest green edges all season; white flower spikes above the leaves, mid
 *   spring to early fall.
 * Size used: a 4 in pot at 0.08 m tall x 0.15 m wide; 0.2 m (8 in) tall in
 * flower x 0.6 m (2 ft) wide in two years.
 */

const LW = 512, LH = 512;
/** Leaf atlas: four leaves in 256 cells, base at the bottom center (0-2 silver, 3 shaded underleaf). */
const LEAF_UV: UV[] = [0, 1, 2, 3].map((i) => rect((i % 2) * 256, Math.floor(i / 2) * 256, 256, 256, LW, LH));

function leafPath(g: CanvasRenderingContext2D, cx: number, by: number, L: number, teeth: number, ph: number) {
  // A heart-shaped blade from (cx, by) up to its tip at (cx, by - L), widest at about a third.
  const N = 120;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1 + 0.25 * Math.exp(-Math.pow((t - 0.12) / 0.1, 2)));
    const tooth = t > 0.06 && t < 0.95 ? 1 - 0.09 * Math.abs(Math.sin(t * teeth * Math.PI + ph)) : 1;
    pts.push([L * 0.42 * w * tooth, t]);
  }
  g.beginPath();
  g.moveTo(cx, by - L * 0.08);
  for (const [x, t] of pts) g.lineTo(cx + x, by - L * 0.08 - t * L * 0.92 + Math.sin(t * Math.PI) * 0);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0], by - L * 0.08 - pts[i][1] * L * 0.92);
  g.closePath();
}

function leafAtlas(): THREE.Texture {
  return leafTexture('lamium-white-nancy-leaves', LW, LH, (g) => {
    const r = rng('lamium-white-nancy-leaf-tex');
    const silvers = ['#a3afa7', '#99a69d', '#adb8b0', '#74817a'];
    for (let i = 0; i < 4; i++) {
      inCell(g, (i % 2) * 256, Math.floor(i / 2) * 256, 256, 256, (w, h) => {
        const cx = w / 2, by = h - 4, L = h * 0.94, ph = r() * 3;
        // The green edge first, then the silver blade a little inside it.
        leafPath(g, cx, by, L, 9, ph);
        g.fillStyle = i === 3 ? '#26401f' : '#2f5a2a';
        g.fill();
        g.save();
        g.translate(cx, by - L * 0.05);
        g.scale(0.88, 0.9);
        g.translate(-cx, -(by - L * 0.05));
        leafPath(g, cx, by, L, 9, ph);
        const grad = g.createLinearGradient(0, by, 0, by - L);
        grad.addColorStop(0, silvers[i]);
        grad.addColorStop(0.6, silvers[i]);
        grad.addColorStop(1, i === 3 ? '#66726b' : '#bcc6be');
        g.fillStyle = grad;
        g.fill();
        g.restore();
        // A faint green midrib and side veins, and the slightly pebbled surface.
        g.save();
        leafPath(g, cx, by, L, 9, ph);
        g.clip();
        g.strokeStyle = 'rgba(70,110,70,0.5)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx, by - L * 0.08);
        g.lineTo(cx, by - L * 0.92);
        g.stroke();
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(80,115,80,0.3)';
        for (let k = 1; k <= 5; k++) {
          const y = by - L * (0.1 + k * 0.14);
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx, y);
            g.quadraticCurveTo(cx + s * L * 0.15, y - L * 0.04, cx + s * L * 0.3 * Math.sin(Math.PI * (1 - k / 6.5)), y - L * 0.1);
            g.stroke();
          }
        }
        for (let k = 0; k < 120; k++) {
          g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(40,60,45,0.1)';
          g.beginPath();
          g.arc(cx + (r() - 0.5) * L * 0.75, by - r() * L, 3 + r() * 4, 0, TAU);
          g.fill();
        }
        g.restore();
        // Petiole stub.
        g.strokeStyle = '#5f7a52';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx, by - L * 0.1);
        g.lineTo(cx, h);
        g.stroke();
      });
    }
  });
}

/** A two-lipped dead nettle flower in side view: hooded upper lip, small spreading lower lip, short tube. */
function floret(g: CanvasRenderingContext2D, x: number, y: number, s: number, side: number, shade: number) {
  g.save();
  g.translate(x, y);
  g.scale(side, 1);
  const v = Math.round(lerp(222, 252, shade));
  g.fillStyle = `rgb(${v},${v},${Math.round(v * 0.97)})`;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.5, -s * 0.15, s * 0.75, -s * 0.75);
  g.quadraticCurveTo(s * 1.15, -s * 0.85, s * 1.05, -s * 0.35);
  g.quadraticCurveTo(s * 0.8, -s * 0.12, s * 0.55, s * 0.05);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.02);
  g.quadraticCurveTo(s * 0.95, s * 0.05, s * 1.0, s * 0.3);
  g.quadraticCurveTo(s * 0.7, s * 0.32, s * 0.4, s * 0.12);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(170,175,150,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(s * 0.2, -s * 0.02);
  g.quadraticCurveTo(s * 0.6, -s * 0.3, s * 0.85, -s * 0.7);
  g.stroke();
  g.restore();
}

/** Flower atlas, 512 x 512: two short spikes side view (256 x 512, base at the bottom), the leaf pair under each whorl. */
function flowerAtlas(): THREE.Texture {
  return leafTexture('lamium-white-nancy-flowers', 512, 512, (g) => {
    const r = rng('lamium-white-nancy-flower-tex');
    for (let s = 0; s < 2; s++) {
      inCell(g, s * 256, 0, 256, 512, (w, h) => {
        const cx = w / 2;
        g.strokeStyle = '#7c9466';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx, h);
        g.lineTo(cx, h * 0.06);
        g.stroke();
        const whorls = 3 + s;
        for (let i = 0; i < whorls; i++) {
          const t = i / (whorls - 1);
          const y = lerp(h * 0.78, h * 0.12, t);
          // The small silver leaf pair below the whorl.
          if (i < 2) for (const sd of [-1, 1]) {
            g.fillStyle = '#c8d0cb';
            g.beginPath();
            g.ellipse(cx + sd * 40, y + 30, 40, 18, sd * -0.4, 0, TAU);
            g.fill();
            g.strokeStyle = '#2f5a2a';
            g.lineWidth = 4;
            g.stroke();
          }
          const n = 6;
          for (let k = 0; k < n; k++) {
            const sd = k % 2 ? 1 : -1;
            floret(g, cx + sd * (6 + r() * 10), y + (r() - 0.5) * 14, lerp(70, 48, t) * (0.85 + r() * 0.25), sd, 0.6 + r() * 0.4);
          }
          if (i === whorls - 1) for (let k = 0; k < 4; k++) {
            g.fillStyle = '#dfe6d2';
            g.beginPath();
            g.ellipse(cx + (k - 1.5) * 9, y - 22 - r() * 12, 7, 12, (k - 1.5) * 0.3, 0, TAU);
            g.fill();
          }
        }
      });
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const center = V(0, -Sp * 0.9, 0), radii = V(1, 1, 1);
  const matTop = H * 0.45; // the leafy mat is about 3 to 4 in; the flower shoots make the rest
  const stemCol = col('#8aa070');
  const white = new THREE.Color(1, 1, 1);

  const runners = growRunners(r, {
    n: 20, R: R * 0.96, step: 0.018, wander: 0.5, reachMin: 0.55,
    levels: [{ every: 0.045, angle: 0.8, len: [0.08, 0.2] }, { every: 0.05, angle: 0.7, len: [0.04, 0.1] }],
    // Stems mound up a little in the middle and lie down at the edge.
    y: (rho, layer) => matTop * lerp(0.55, 0.12, Math.pow(rho, 1.2)) * (0.6 + layer * 0.6),
  });

  for (const ru of runners) {
    const birth = (p: THREE.Vector3) => {
      const rho = Math.hypot(p.x, p.z) / R;
      return rho < 0.32 ? 0 : clamp((rho - 0.3) * 1.25 + r() * 0.08, 0, 0.9);
    };
    // The stem in short pieces, each appearing with the leaves on it, so the young plant shows no bare runners.
    for (let k = 0; k < ru.pts.length - 1; k += 3) {
      const seg = ru.pts.slice(k, Math.min(ru.pts.length, k + 4));
      if (seg.length > 1) tube(wood, seg, 0.0018, 0.0014, 3, stemCol, birth(seg[seg.length - 1]), seg[0], () => 0.15, 1);
    }
    // Leaf pairs at nodes along the stem, crossing, on short stalks; leaves smaller toward the growing tip.
    let flip = r() * TAU;
    for (let k = 1; k < ru.pts.length; k++) {
      const p = ru.pts[k];
      const prev = ru.pts[k - 1];
      const hd = heading(p.clone().sub(prev));
      const t = k / (ru.pts.length - 1);
      flip += Math.PI / 2;
      const size = lerp(0.044, 0.028, t * t) * (0.85 + r() * 0.3);
      const b = birth(p);
      for (const sd of [-1, 1]) {
        const az = hd + sd * (Math.PI / 2 - 0.35 + Math.sin(flip) * 0.35) + (r() - 0.5) * 0.3;
        const pitch = 0.22 + r() * 0.35;
        const cell = r() < 0.1 ? 3 : Math.floor(r() * 3);
        const c = jitter(white.clone().multiplyScalar(0.74 + r() * 0.18), r, 0.004, 0.02, 0.03);
        lay(leaves, p.clone().add(V(0, 0.003, 0)), az, pitch, (r() - 0.5) * 0.4, size, size * 0.9, LEAF_UV[cell], c, b, { segs: 2, curl: 0.3 + r() * 0.3, center, radii, normalBend: 0.35, sway0: 0.15, sway1: 0.3 }, p);
      }
    }
    // Short flowering shoots turn up from nodes along the older stems, scattered over the mat.
    if (ru.level < 2) for (let k = 3; k < ru.pts.length; k += 7) {
      if (r() > 0.2) continue;
      const tip = ru.pts[k];
      const lean = V((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize();
      const h = H * (0.42 + r() * 0.22);
      const fb = clamp(birth(tip) + 0.05);
      const uv: UV = r() < 0.5 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1];
      for (let q = 0; q < 2; q++) {
        const a = r() * TAU + q * Math.PI / 2;
        leafQuad(flowers, tip, lean, V(Math.cos(a), 0, Math.sin(a)), h, h * 0.42, uv, white.clone().multiplyScalar(0.94 + r() * 0.06), fb, tip, { segs: 1, sway0: 0.2, sway1: 0.6 });
      }
    }
  }

  // Shaded old leaves on the soil under the mat fill the gaps.
  for (let k = 0; k < 160; k++) {
    const rho = Math.sqrt(r()) * 0.85, a = r() * TAU;
    const p = V(Math.cos(a) * rho * R, 0.004, Math.sin(a) * rho * R);
    const s = 0.04 + r() * 0.012;
    lay(leaves, p, r() * TAU, 0.05, 0, s, s * 0.9, LEAF_UV[3], white.clone().multiplyScalar(0.6 + r() * 0.15), rho < 0.4 ? 0 : 0.3 + r() * 0.4, { segs: 1, center, radii, normalBend: 0.3, sway0: 0.05, sway1: 0.1 }, p);
  }

  for (let i = 1; i < leaves.pos.length; i += 3) leaves.pos[i] = Math.min(leaves.pos[i], matTop);
  fitMat([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    look: { leafRoughness: 0.72, translucency: 0.25, bend: 0.02, flutter: 0.004 },
  };
};
