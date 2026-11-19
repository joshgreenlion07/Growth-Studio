import * as THREE from 'three';
import { GeoBuilder, clamp, leafTexture, lerp, rng, type SpeciesBuilder } from '../kit';
import { sedumCushion } from './shared-sedum';
import { fitGeo } from './shared-succulents';

/**
 * Blue sedum, modeled on Sedum reflexum (rupestre) 'Blue Spruce': a low,
 * dense, continuous cushion 4 to 6 in tall. Trailing stems lie along the
 * ground and every tip turns up 2 to 3 in, so the plant reads as a carpet of
 * small powdery blue-green bottle-brush tips packed shoulder to shoulder,
 * gently domed in the middle and thinning to prostrate runners at the rim.
 * Mass planted, so each tip is two crossed painted cards plus an end-on
 * rosette card; density carries the look.
 */

/** One plump needle leaf: a capsule with a lit upper side and a shaded lower side. */
function needle(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, shade: number, pink: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const grad = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  const k = (v: number) => Math.round(v * shade);
  grad.addColorStop(0, `rgb(${k(136)},${k(170)},${k(166)})`);
  grad.addColorStop(0.5, `rgb(${k(100)},${k(135)},${k(133)})`);
  grad.addColorStop(1, `rgb(${k(72)},${k(103)},${k(105)})`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -wid * 0.32);
  g.quadraticCurveTo(len * 0.55, -wid * 0.62, len, 0);
  g.quadraticCurveTo(len * 0.55, wid * 0.62, 0, wid * 0.32);
  g.closePath();
  g.fill();
  if (pink > 0) {
    g.fillStyle = `rgba(186,120,128,${pink})`;
    g.beginPath();
    g.arc(len * 0.9, 0, wid * 0.3, 0, 6.3);
    g.fill();
  }
  g.restore();
}

function atlas(): THREE.Texture {
  return leafTexture('blue-sedum', 512, 512, (g) => {
    const r = rng('blue-sedum-tex');
    // Two side-view sprigs, 128 x 512 each: stem base at the bottom, tip at the top.
    for (let cell = 0; cell < 2; cell++) {
      const cx = cell * 128 + 64;
      g.strokeStyle = '#8fa89a';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx, 512);
      g.lineTo(cx, 40);
      g.stroke();
      const n = 150;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); // bottom to top
        const y = 506 - t * 470;
        const ph = i * 2.4 + cell;
        const sx = Math.sin(ph); // -1 left .. 1 right; cos is toward or away from the viewer
        const front = Math.cos(ph);
        const tipTight = clamp((t - 0.82) / 0.18);
        const open = lerp(1.0, 0.25, tipTight) * (0.85 + r() * 0.3);
        const len = lerp(40, 26, tipTight) * (0.8 + r() * 0.4) * lerp(0.75, 1, Math.min(1, t * 4));
        const a = -Math.PI / 2 + sx * open;
        const shade = lerp(0.8, 1.06, (front + 1) / 2) * lerp(0.86, 1.06, t) * (0.94 + r() * 0.12);
        needle(g, cx + sx * 5, y, a, len * lerp(1, 0.75, Math.abs(front) * (1 - Math.abs(sx))), 12, shade, t > 0.9 && r() < 0.3 ? 0.35 : 0);
      }
    }
    // Top-view rosette (a tip seen end-on), upper right.
    const rosette = (cx: number, cy: number, R: number) => {
      const n = 46;
      for (let i = 0; i < n; i++) {
        const f = 1 - i / (n - 1); // outer leaves first, the center last
        const a = i * 2.39996;
        const rad = R * 0.1 * f;
        const len = R * lerp(0.42, 0.98, f) * (0.85 + r() * 0.3);
        needle(g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, a, len, R * lerp(0.16, 0.2, f), lerp(1.1, 0.84, f) * (0.94 + r() * 0.12), f < 0.25 && r() < 0.3 ? 0.3 : 0);
      }
    };
    rosette(384, 128, 118);
    // Lower right: a patch of nine tips seen from above, the cushion's lower layer.
    g.save();
    g.beginPath();
    g.rect(256, 256, 256, 256);
    g.clip();
    for (let k = 0; k < 9; k++) rosette(256 + 46 + (k % 3) * 82 + (r() - 0.5) * 14, 256 + 46 + Math.floor(k / 3) * 82 + (r() - 0.5) * 14, 50);
    g.restore();
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const g = new GeoBuilder();
  sedumCushion(g, r, H, Sp, { tints: ['#ffffff', '#f1f8f5', '#f8f8ee'] });
  fitGeo([g], H, Sp);
  return {
    leaves: g.build(),
    leafMap: atlas(),
    look: { leafRoughness: 0.7, translucency: 0.12, bend: 0.01, flutter: 0.0015, leafShadows: true },
  };
};
