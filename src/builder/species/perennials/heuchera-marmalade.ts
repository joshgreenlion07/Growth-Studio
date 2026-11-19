import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, tube, type SpeciesBuilder } from '../kit';
import { bezPath, crossCards, fitToSize, stemBark } from './shared-perennials';

/**
 * Coral bells, Heuchera 'Marmalade' (Terra Nova): a low, dense, evergreen mound
 * of long-stalked leaves from a central crown. The blades are rounded and
 * heart-shaped at the base, 3 to 4 in across, cut into five to seven shallow
 * scalloped lobes with heavily ruffled, wavy edges. The upper side is shiny
 * orange-amber to copper and russet, darker toward the center along
 * palmate veins; the young leaves in the middle come in pinkish peach. The
 * undersides are a strong rose-red to hot pink, and because the margins
 * curl and ruffle, that color shows as a rim around most leaves and wherever a
 * leaf tips up. In late spring thin, wiry, dark red-brown stems rise well
 * above the mound with loose sprays of tiny cream bells.
 *
 * References and the numbers they give:
 * - Gertens plant finder, Marmalade Coral Bells
 *   (plants.gertens.com/12070009/Plant/3609/Marmalade_Coral_Bells): about 12 in
 *   tall, 18 in with the flowers, 20 in wide; leaves shiny umber to deep
 *   sienna, emerging pink in spring, turning coppery-bronze, with hot pink
 *   undersides; dainty spikes of bell-shaped flowers, late spring to early
 *   summer; dense foliage to the ground.
 * - Botanical Interests, Marmalade Heuchera (botanicalinterests.com/products/marmalade-heuchera):
 *   10 to 12 in tall, 16 to 18 in wide.
 * Size used: a 1 gal at 0.22 m tall (in flower) x 0.25 m wide; 0.45 m (18 in)
 * in flower x 0.5 m (20 in) wide in two years, the leafy mound about 10 to 12 in of
 * that.
 */

const TAU = Math.PI * 2;
type UV = [number, number, number, number];

/** The blade's outline in a cell: lobed and scalloped, heart-shaped where the petiole joins at the bottom. */
function bladePath(g: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, R: number, lobes: number) {
  const ph = r() * TAU, N = 220;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    // th = 0 points down (the sinus), going around through the top.
    const th = (i / N) * TAU;
    const fromSinus = Math.min(th, TAU - th) / Math.PI; // 0 at the sinus .. 1 at the top
    const lobe = 0.07 * Math.cos(lobes * (th - Math.PI) + 0.2 * Math.sin(ph + th));
    const scallop = 0.03 * Math.abs(Math.sin(th * lobes * 2.5 + ph));
    const ruffle = 0.012 * Math.sin(th * 23 + ph * 2);
    const sinus = 1 - 0.55 * Math.exp(-Math.pow(fromSinus / 0.09, 2));
    const rad = R * (0.9 + lobe + scallop + ruffle) * sinus;
    const x = cx + Math.sin(th) * rad, y = cy + Math.cos(th) * rad;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

interface Pal { center: string; mid: string; edge: string; rim: string; vein: string }
/** Upper sides: copper-russet centers, orange-amber blade, lighter amber edge, the rose underside showing as a rim. */
const TOPS: Pal[] = [
  { center: '#5a1c0c', mid: '#a4461a', edge: '#c46c24', rim: '#9a2a40', vein: 'rgba(80,16,10,0.6)' },
  { center: '#64220e', mid: '#b4561e', edge: '#d0802c', rim: '#a43248', vein: 'rgba(90,20,12,0.55)' },
  { center: '#4c160a', mid: '#8e3a16', edge: '#b05a20', rim: '#8a2238', vein: 'rgba(70,12,8,0.6)' },
  { center: '#6e2a12', mid: '#bc6424', edge: '#d89036', rim: '#a8384e', vein: 'rgba(96,24,14,0.5)' },
  // Young leaves from the heart of the crown: pinkish peach.
  { center: '#8a3a26', mid: '#c06a44', edge: '#d88c5c', rim: '#b04a62', vein: 'rgba(110,36,26,0.45)' },
];
const UNDER: Pal = { center: '#6a1430', mid: '#962840', edge: '#b0445a', rim: '#b85a70', vein: 'rgba(220,150,165,0.35)' };

/**
 * Leaf atlas, 1024 x 512, cells 256 x 256: 0-4 upper sides, 5-6 undersides, 7 a shaded old leaf;
 * the blade's base (where the petiole joins) at the bottom center of each cell.
 */
function leafAtlas(): { map: THREE.Texture; uv: (i: number) => UV } {
  const map = leafTexture('heuchera-marmalade-leaves', 1024, 512, (g) => {
    const r = rng('heuchera-marmalade-leaf-tex');
    for (let i = 0; i < 8; i++) {
      const x0 = (i % 4) * 256, y0 = Math.floor(i / 4) * 256;
      const pal = i < 5 ? TOPS[i] : i < 7 ? UNDER : TOPS[2];
      g.save();
      g.translate(x0, y0);
      g.beginPath();
      g.rect(1, 1, 254, 254);
      g.clip();
      const cx = 128, cy = 132, R = 112;
      const lobes = 5 + Math.floor(r() * 3);
      bladePath(g, r, cx, cy, R, lobes);
      g.fillStyle = pal.rim;
      g.fill();
      // The blade inside the rim, a little smaller and ruffled the same way.
      g.save();
      g.clip();
      bladePath(g, rng(`hm-inner-${i}`), cx, cy - 1, R * 0.95, lobes);
      const grad = g.createRadialGradient(cx, cy + R * 0.75, R * 0.05, cx, cy, R);
      grad.addColorStop(0, pal.center);
      grad.addColorStop(0.45, pal.mid);
      grad.addColorStop(1, pal.edge);
      g.fillStyle = grad;
      g.fill();
      // Palmate veins from the sinus, darkened along their length.
      g.strokeStyle = pal.vein;
      g.lineCap = 'round';
      for (let k = 0; k < lobes; k++) {
        const a = Math.PI + ((k + 0.5) / lobes - 0.5) * 2.9;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(cx, cy + R * 0.72);
        g.quadraticCurveTo(cx + Math.sin(a) * R * 0.4, cy + R * 0.72 + Math.cos(a) * R * 0.45, cx + Math.sin(a) * R * 0.86, cy + R * 0.72 + Math.cos(a) * R * 1.5);
        g.stroke();
        g.lineWidth = 2;
        for (let j = 0; j < 4; j++) {
          const t = 0.3 + j * 0.15;
          const px = cx + Math.sin(a) * R * 0.86 * t, py = cy + R * 0.72 + Math.cos(a) * R * 1.5 * t;
          for (const sd of [-1, 1]) {
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + Math.sin(a + sd * 0.8) * R * 0.18, py + Math.cos(a + sd * 0.8) * R * 0.2);
            g.stroke();
          }
        }
      }
      // Ruffles: light and dark bands where the blade waves, and a glossy sheen on the upper side.
      for (let k = 0; k < 26; k++) {
        const a = r() * TAU, d = R * (0.55 + r() * 0.35);
        g.fillStyle = r() < 0.5 ? 'rgba(255,225,170,0.14)' : 'rgba(60,10,0,0.16)';
        g.beginPath();
        g.ellipse(cx + Math.sin(a) * d, cy + Math.cos(a) * d, R * 0.16, R * 0.05, -a, 0, TAU);
        g.fill();
      }
      if (i < 5) {
        const sh = g.createLinearGradient(cx - R, cy - R, cx + R * 0.4, cy + R * 0.2);
        sh.addColorStop(0, 'rgba(255,240,210,0.18)');
        sh.addColorStop(0.6, 'rgba(255,240,210,0)');
        g.fillStyle = sh;
        g.fillRect(0, 0, 256, 256);
      }
      if (i === 7) {
        g.fillStyle = 'rgba(30,10,0,0.35)';
        g.fillRect(0, 0, 256, 256);
      }
      g.restore();
      // The petiole stub at the sinus.
      g.strokeStyle = i < 5 ? '#6a2a1c' : '#8a2a3a';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx, cy + R * 0.66);
      g.lineTo(cx, 254);
      g.stroke();
      g.restore();
    }
  });
  const e = 1.5;
  return { map, uv: (i) => [((i % 4) * 256 + e) / 1024, 1 - (Math.floor(i / 4) * 256 + 256 - e) / 512, ((i % 4) * 256 + 256 - e) / 1024, 1 - (Math.floor(i / 4) * 256 + e) / 512] };
}

/** Flower atlas, 512 x 512: two loose sprays of tiny cream bells on dark wiry stalks, side view, base at the bottom. */
function flowerTex(): THREE.Texture {
  return leafTexture('heuchera-marmalade-flowers', 512, 512, (g) => {
    const r = rng('heuchera-marmalade-flower-tex');
    for (let s = 0; s < 2; s++) {
      const cx = 128 + s * 256;
      g.strokeStyle = '#4a1c16';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, 512);
      g.quadraticCurveTo(cx + (r() - 0.5) * 20, 260, cx + (r() - 0.5) * 14, 10);
      g.stroke();
      // Short side branches up the top half, each with a few nodding bells.
      for (let k = 0; k < 11; k++) {
        const t = k / 10;
        const y = lerp(300, 18, t);
        const sd = k % 2 ? 1 : -1;
        const len = lerp(44, 12, t) * (0.8 + r() * 0.4);
        const ex = cx + sd * len, ey = y - len * 0.35;
        g.strokeStyle = '#5a241c';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(ex, ey);
        g.stroke();
        for (let b = 0; b < 2; b++) {
          const bx = lerp(cx, ex, 0.45 + b * 0.27) + (r() - 0.5) * 6, by = lerp(y, ey, 0.45 + b * 0.27) + 7;
          g.fillStyle = ['#eee6c8', '#e4dcb8', '#f4eed6'][b];
          g.beginPath();
          g.ellipse(bx, by, 4.5, 6, (r() - 0.5) * 0.6, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(120,60,40,0.5)';
          g.beginPath();
          g.ellipse(bx, by - 5, 4, 2.5, 0, 0, TAU);
          g.fill();
        }
      }
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  const at = leafAtlas();
  const moundH = H * 0.58, R = Sp / 2;
  const petCol = col('#5a2a20');
  const white = new THREE.Color(1, 1, 1);

  // Leaves on a golden-angle spiral: the oldest lie out low at the rim, the youngest stand up small in the middle.
  const N = 92;
  for (let i = 0; i < N; i++) {
    const u = 1 - i / N; // 1 outer and oldest .. 0 heart
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const reach = R * lerp(0.12, 0.7, Math.pow(u, 0.75)) * (0.88 + r() * 0.2);
    const tipY = moundH * lerp(0.88, 0.26, Math.pow(u, 0.7)) * (0.88 + r() * 0.18);
    const blade = lerp(0.085, 0.12, u) * (0.88 + r() * 0.2) * (Sp / 0.5);
    const crown = V(Math.cos(az) * 0.008, 0.01, Math.sin(az) * 0.008);
    const end = V(Math.cos(az) * reach * 0.7, tipY * 0.82, Math.sin(az) * reach * 0.7);
    const ctrl = V(Math.cos(az) * reach * 0.2, tipY * 0.95, Math.sin(az) * reach * 0.2);
    const pet = bezPath(crown, ctrl, end, 5);
    const birth = u > 0.45 ? 0 : clamp(0.12 + (0.45 - u) * 1.2 + r() * 0.2, 0, 0.85);
    const swayEnd = clamp(0.25 + 0.5 * (end.y / moundH));
    tube(wood, pet, 0.0018, 0.0013, 3, petCol, birth, crown, (k) => swayEnd * (k / 5), 1);
    // The blade leans out and a little up from the petiole end; old outer leaves lie flatter.
    const out = V(Math.cos(az), 0, Math.sin(az));
    const pitch = lerp(0.32, 0.02, u) + (r() - 0.5) * 0.2;
    const dir = out.clone().multiplyScalar(Math.cos(pitch)).add(V(0, Math.sin(pitch), 0)).normalize();
    const face = V(0, 1, 0).addScaledVector(out, -Math.sin(pitch) * 0.9).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    const base = end.clone().addScaledVector(dir, -blade * 0.12);
    const shade = lerp(0.95, 0.72, u * 0.6) * (0.9 + r() * 0.15);
    const topCell = u < 0.18 ? 4 : u > 0.9 && r() < 0.4 ? 7 : Math.floor(r() * 4);
    const c = jitter(white.clone().multiplyScalar(shade), r, 0.01, 0.04, 0.03);
    const o = { segs: 3, curl: -0.25 + r() * 0.7, fold: 0.1 + r() * 0.12, sway0: swayEnd, sway1: clamp(swayEnd + 0.12) };
    leafQuad(leaves, base, dir, face, blade, blade, at.uv(topCell), c, birth, end, o);
    // The rose underside: the same blade a few millimeters below, seen from under a tipped-up leaf (the material is
    // two-sided, so from below it shows instead of the upper side's back).
    const below = base.clone().addScaledVector(face, -0.004);
    leafQuad(leaves, below, dir, face, blade * 0.96, blade * 0.96, at.uv(5 + (i % 2)), c.clone().multiplyScalar(0.92), birth, end, o);
  }

  // Flower stalks: thin, nearly upright, well above the mound, a loose spray on the upper part.
  const nS = 6;
  for (let i = 0; i < nS; i++) {
    const az = (i / nS) * TAU + r() * 0.6;
    const d = R * (0.05 + r() * 0.22);
    const base = V(Math.cos(az) * d * 0.3, 0.02, Math.sin(az) * d * 0.3);
    const top = V(Math.cos(az) * d, H * (0.86 + r() * 0.14), Math.sin(az) * d);
    const dir = top.clone().sub(base).normalize();
    const len = top.distanceTo(base);
    const birth = i < 3 ? 0 : clamp(0.2 + r() * 0.5, 0, 0.85);
    crossCards(flowers, base, dir, len, len * 0.3, i % 2 ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1], white.clone().multiplyScalar(0.92 + r() * 0.08), birth, base, 2, r() * 3, { segs: 2, curl: (r() - 0.5) * 0.2, sway0: 0.1, sway1: 0.85 });
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: at.map,
    flowerMap: flowerTex(),
    bark: { map: stemBark() },
    look: { translucency: 0.2, leafRoughness: 0.82, bend: 0.03, flutter: 0.005, leafShadows: true },
  };
};
