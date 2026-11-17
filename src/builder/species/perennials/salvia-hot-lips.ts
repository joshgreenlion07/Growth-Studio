import * as THREE from 'three';
import { GeoBuilder, UP, V, along, clamp, col, deflect, jitter, leafQuad, leafTexture, lerp, perp, rng, tube, uvCell, type SpeciesBuilder } from '../kit';
import { arcPath, fitToSize, stemBark, toothedLeafPath } from './shared-perennials';
import { inCell, rect, type UV } from '../groundcover/shared-groundcovers';

/**
 * Salvia 'Hot Lips', Salvia microphylla 'Hot Lips' (Kew lists it as
 * S. x jamensis), littleleaf sage, in full summer bloom.
 *
 * An airy, twiggy, rounded subshrub: many thin, wiry stems rise and spread
 * from a woody crown, branch in opposite pairs and carry small soft ovate
 * leaves with scalloped edges (about 1 in, deep mid-green, opposite). Every
 * shoot ends in a loose, leafless raceme held above the foliage: pairs of
 * two-lipped flowers about 3/4 to 1 in long at nodes an inch apart, green
 * buds at the tip and empty green calyces below. The flowers are bicolored:
 * white tube and hood, broad cherry-red lower lip. The first flowers are pure
 * red, later ones whiter; in heat they run red, in cool weather white. This
 * shows the classic mix, which reads as a red-and-white haze over the plant.
 *
 * References and the numbers they give:
 * - San Marcos Growers, plant_id=4790
 *   (smgrowers.com/products/plants/plantdisplay.asp?plant_id=4790):
 *   3 to 4 ft tall by 5 ft wide; small ovate deep green leaves, soft and
 *   scalloped; loose terminal racemes; first flowers pure red, later
 *   bicolored "with the lower lip remaining red and the upper white", last
 *   ones pure white; spring to late fall.
 * - UC Landscape Plant Irrigation Trials, UC Davis (uclpit.ucdavis.edu,
 *   "Hot Lips sage"): 3 x 3 ft at maturity; measured 30 x 61 in after two
 *   years in the Davis trial (Central Valley, like Modesto).
 * - Devil Mountain Nursery (devilmountainnursery.com): 2 to 3 ft tall,
 *   3 to 5 ft wide; bright green oval leaves; two-lipped flowers in cherry
 *   red and white.
 * - NC State Extension Plant Toolbox, Salvia microphylla: leaves under 1 in,
 *   ovate, opposite, crenulate; flowers under 1 in in racemes; 'Hot Lips'
 *   "usually white with a red lower lip", the share of red depends on heat.
 * Size used: 0.9 m tall (with flowers) x 1.3 m wide at maturity in two years.
 */

/* ---------------------------- leaf atlas ---------------------------- */

/**
 * 1024 x 1024 leaf atlas, base of every piece at the bottom of its cell:
 * two branchlets (512 x 512, a twig with side shoots, about 15 cm across),
 * four leafy shoots (192 x 512, about 10 cm long) and eight single leaves
 * (128 x 128): deep, mid, young and the paler underside, two of each.
 */
const branchCell = (i: number): UV => rect(i * 512, 0, 512, 512, 1024, 1024);
const shootCell = (i: number): UV => rect(i * 192 + 1, 512, 190, 512, 1024, 1024);
const leafCell = (kind: number, v: number): UV => rect(768 + v * 128, 512 + kind * 128, 128, 128, 1024, 1024);
/** Leaf colors: [base, tip] for deep, mid, young and underside leaves. */
const LEAF_COLS: [string, string][] = [
  ['#3b5f25', '#4a7030'],
  ['#476f2e', '#5a8239'],
  ['#5f8d3a', '#76a050'],
  ['#7f966c', '#93a881'],
];

function salviaLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, ang: number, len: number, wid: number, kind: number, dark = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 2 + ang);
  // Short petiole.
  g.strokeStyle = '#5c763e';
  g.lineWidth = Math.max(1.5, wid * 0.07);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-len * 0.1, 0);
  g.lineTo(len * 0.04, 0);
  g.stroke();
  const [c0, c1] = LEAF_COLS[kind];
  const grad = g.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, c0);
  grad.addColorStop(1, c1);
  toothedLeafPath(g, len, wid, 0.34, 7, 0.13);
  g.fillStyle = grad;
  g.fill();
  g.save();
  g.clip();
  // One half of the blade a little darker: the leaf is folded slightly along its midrib.
  g.fillStyle = 'rgba(10,30,8,0.12)';
  g.fillRect(0, 0, len, wid);
  if (dark > 0) {
    g.fillStyle = `rgba(8,22,6,${dark})`;
    g.fillRect(0, -wid, len, wid * 2);
  }
  // Fine hairs: a faint pale speckle.
  for (let i = 0; i < len * 0.6; i++) {
    g.fillStyle = kind === 3 ? 'rgba(220,230,210,0.18)' : 'rgba(190,215,160,0.12)';
    g.fillRect(r() * len, (r() - 0.5) * wid, 1.2, 1.2);
  }
  // Impressed veins: dark grooves with a light edge (the blade is slightly puckered).
  const veins = (style: string, lw: number, dy: number) => {
    g.strokeStyle = style;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(0, dy);
    g.lineTo(len * 0.92, dy);
    for (let k = 1; k <= 4; k++) {
      const t = 0.1 + k * 0.16;
      for (const s of [-1, 1]) {
        g.moveTo(len * t, dy);
        g.quadraticCurveTo(len * (t + 0.12), s * wid * 0.22 + dy, len * (t + 0.26), s * wid * 0.36 * (1 - t * 0.5) + dy);
      }
    }
    g.stroke();
  };
  veins(kind === 3 ? 'rgba(150,170,140,0.5)' : 'rgba(150,195,115,0.22)', Math.max(1, len * 0.02), 1.2);
  veins(kind === 3 ? 'rgba(60,80,55,0.35)' : 'rgba(14,34,10,0.42)', Math.max(1, len * 0.016), 0);
  g.restore();
  g.restore();
}

/** A leafy shoot from (x0, y0) heading `ang` from straight up, `length` px long, leaves `ll` px long. */
function shoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, length: number, ll: number, sw: number, pairs: number) {
  const bend = (r() - 0.5) * 0.4;
  const pt = (t: number) => {
    const a = ang + bend * t;
    return [x0 + Math.sin(a) * length * t, y0 - Math.cos(a) * length * t, a] as const;
  };
  const info = Array.from({ length: pairs }, (_, i) => ({ t: 0.12 + (i / pairs) * 0.78, len: ll * lerp(1, 0.72, i / pairs) * (0.88 + r() * 0.24) }));
  // Pairs seen edge-on (every other pair): one leaf behind the stem, one in front, both foreshortened.
  for (const [i, w] of info.entries()) {
    if (i % 2 === 0) continue;
    const [x, y, a] = pt(w.t);
    salviaLeaf(g, r, x, y, a + (r() - 0.5) * 0.6, w.len * 0.6, w.len * 0.5, r() < 0.5 ? 0 : 1, 0.25);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const [xa, ya] = pt(i / 8), [xb, yb] = pt((i + 1) / 8);
    g.strokeStyle = i < 3 ? '#6c6a48' : '#6f8446';
    g.lineWidth = lerp(sw, sw * 0.5, i / 8);
    g.beginPath();
    g.moveTo(xa, ya);
    g.lineTo(xb, yb);
    g.stroke();
  }
  for (const [i, w] of info.entries()) {
    const [x, y, a] = pt(w.t);
    if (i % 2 === 0) {
      for (const s of [-1, 1]) salviaLeaf(g, r, x, y, a + s * (0.95 + (r() - 0.5) * 0.4 - w.t * 0.25), w.len, w.len * 0.66, r() < 0.1 ? 3 : r() < 0.55 ? 1 : 0);
    } else {
      salviaLeaf(g, r, x, y, a + (r() - 0.5) * 0.5, w.len * 0.55, w.len * 0.46, 1);
    }
  }
  // Young leaves folded together at the tip.
  const [xe, ye, ae] = pt(1);
  for (const s of [-1, 1]) salviaLeaf(g, r, xe, ye, ae + s * (0.25 + r() * 0.2), ll * 0.45, ll * 0.3, 2);
}

function leafAtlas(): THREE.Texture {
  return leafTexture('salvia-hot-lips-leaves', 1024, 1024, (g) => {
    const r = rng('salvia-hot-lips-leaf-tex');
    // Branchlets: a twig with opposite side shoots and leaves.
    for (let c = 0; c < 2; c++) {
      inCell(g, c * 512, 0, 512, 512, () => {
        const S = 512, ll = 74;
        for (let i = 0; i < 3; i++) {
          const y = S * lerp(0.86, 0.46, i / 2);
          for (const s of [-1, 1]) {
            if (i === 2 && r() < 0.5) continue;
            shoot(g, r, S / 2 + (r() - 0.5) * 6, y, s * (0.55 + r() * 0.35), S * lerp(0.48, 0.32, i / 2) * (0.85 + r() * 0.3), ll * 0.92, 5, 4);
          }
        }
        shoot(g, r, S / 2, S - 2, (r() - 0.5) * 0.12, S * 0.9, ll, 7, 6);
      });
    }
    for (let c = 0; c < 4; c++) inCell(g, c * 192, 512, 192, 512, () => shoot(g, r, 96, 510, (r() - 0.5) * 0.1, 512 * (c === 3 ? 0.62 : 0.9), 96, 6, c === 3 ? 3 : 5));
    for (let k = 0; k < 4; k++) {
      for (let v = 0; v < 2; v++) inCell(g, 768 + v * 128, 512 + k * 128, 128, 128, () => salviaLeaf(g, r, 64, 125, (r() - 0.5) * 0.1, 112, 78, k));
    }
  });
}

/* --------------------------- flower atlas --------------------------- */

/**
 * 1024 x 512, eight 256 x 256 cells (uvCell(4, 2, i)):
 * 0..2 a flower in profile (bicolor, mostly red, white), base at the bottom,
 * the axis straight up, the hood toward +x (the card puts +x to world up);
 * 3..5 the same seen face-on, hood up; 6 an empty calyx; 7 a bud.
 */
const RED = '#d8122e', RED_DK = '#a80c26', RED_LT = '#ec3550';
const WHITE = '#f8f6f4', PINK = '#f1c9d2';

type Mix = 'bi' | 'red' | 'white';

function profileFlower(g: CanvasRenderingContext2D, r: () => number, mix: Mix) {
  const L = 236, X = (u: number) => 128 + u * L, Y = (a: number) => 252 - a * L;
  // Pedicel and calyx: a ribbed green tube with two short lips, purple at the tips.
  const calyx = () => {
    g.beginPath();
    g.moveTo(X(-0.025), Y(0));
    g.lineTo(X(-0.07), Y(0.33));
    g.lineTo(X(-0.04), Y(0.4));
    g.lineTo(X(-0.01), Y(0.34));
    g.lineTo(X(0.03), Y(0.39));
    g.lineTo(X(0.075), Y(0.32));
    g.lineTo(X(0.025), Y(0));
    g.closePath();
    const cg = g.createLinearGradient(0, Y(0), 0, Y(0.4));
    cg.addColorStop(0, '#6f8a48');
    cg.addColorStop(0.75, '#5f7a3e');
    cg.addColorStop(1, '#73506a');
    g.fillStyle = cg;
    g.fill();
    g.strokeStyle = 'rgba(40,60,25,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const u of [-0.03, 0, 0.03]) {
      g.moveTo(X(u * 0.5), Y(0.04));
      g.lineTo(X(u), Y(0.33));
    }
    g.stroke();
  };
  const tubeCol = mix === 'red' ? '#e36a7e' : WHITE;
  // Corolla tube, curving slightly up toward the hood.
  g.beginPath();
  g.moveTo(X(-0.045), Y(0.28));
  g.quadraticCurveTo(X(-0.06), Y(0.5), X(-0.03), Y(0.64));
  g.lineTo(X(0.09), Y(0.62));
  g.quadraticCurveTo(X(0.07), Y(0.45), X(0.045), Y(0.28));
  g.closePath();
  g.fillStyle = tubeCol;
  g.fill();
  // Hood (upper lip): a hairy hooded arch, white or flushed pink at the tip.
  const hood = g.createLinearGradient(0, Y(0.55), 0, Y(0.98));
  hood.addColorStop(0, tubeCol);
  hood.addColorStop(0.7, mix === 'red' ? RED_LT : WHITE);
  hood.addColorStop(1, mix === 'bi' ? PINK : mix === 'red' ? RED : WHITE);
  g.fillStyle = hood;
  g.beginPath();
  g.moveTo(X(0.0), Y(0.58));
  g.quadraticCurveTo(X(0.2), Y(0.7), X(0.17), Y(0.88));
  g.quadraticCurveTo(X(0.14), Y(0.99), X(0.06), Y(0.97));
  g.quadraticCurveTo(X(0.03), Y(0.82), X(-0.02), Y(0.66));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(160,140,150,0.35)';
  g.lineWidth = 1.2;
  g.stroke();
  // Style curling out of the hood tip.
  g.strokeStyle = '#b02a6a';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(X(0.07), Y(0.95));
  g.quadraticCurveTo(X(0.04), Y(1.01), X(-0.01), Y(0.985));
  g.stroke();
  // Lower lip: broad, flaring forward, then hanging down.
  const lipCol = mix === 'white' ? WHITE : RED;
  const lg = g.createLinearGradient(X(0), 0, X(-0.42), 0);
  lg.addColorStop(0, mix === 'bi' ? WHITE : mix === 'white' ? WHITE : RED_DK);
  lg.addColorStop(mix === 'bi' ? 0.22 : 0.1, lipCol);
  lg.addColorStop(1, mix === 'white' ? '#fbeef0' : RED_LT);
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(X(0.02), Y(0.6));
  g.quadraticCurveTo(X(-0.02), Y(0.84), X(-0.16), Y(0.93));
  g.quadraticCurveTo(X(-0.3), Y(1.0), X(-0.42), Y(0.9));
  g.quadraticCurveTo(X(-0.47), Y(0.78), X(-0.38), Y(0.7));
  g.quadraticCurveTo(X(-0.2), Y(0.62), X(-0.06), Y(0.57));
  g.closePath();
  g.fill();
  // The lip's notch and a shaded fold, so it reads as a drooping petal.
  g.strokeStyle = mix === 'white' ? 'rgba(200,180,190,0.6)' : 'rgba(120,8,28,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(-0.1), Y(0.68));
  g.quadraticCurveTo(X(-0.25), Y(0.8), X(-0.4), Y(0.82));
  g.stroke();
  if (mix === 'white') {
    // White flowers keep a faint red blush at the lip edge.
    g.strokeStyle = 'rgba(225,60,90,0.35)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(X(-0.42), Y(0.9));
    g.quadraticCurveTo(X(-0.47), Y(0.78), X(-0.38), Y(0.7));
    g.stroke();
  }
  calyx();
}

function frontFlower(g: CanvasRenderingContext2D, r: () => number, mix: Mix) {
  const cx = 128, cy = 112;
  const lipCol = mix === 'white' ? WHITE : RED;
  // Lower lip: two small side lobes and a broad, notched middle lobe.
  for (const s of [-1, 1]) {
    g.fillStyle = mix === 'white' ? '#f6eef0' : RED_DK;
    g.beginPath();
    g.ellipse(cx + s * 70, cy + 32, 42, 30, s * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  const lg = g.createRadialGradient(cx, cy + 20, 8, cx, cy + 70, 130);
  lg.addColorStop(0, mix === 'red' ? RED_DK : WHITE);
  lg.addColorStop(mix === 'bi' ? 0.3 : 0.12, lipCol);
  lg.addColorStop(1, mix === 'white' ? '#fbe9ee' : RED_LT);
  g.fillStyle = lg;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 34, cy + 82, 56, 60, s * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(cx, cy + 50, 74, 52, 0, 0, Math.PI * 2);
  g.fill();
  // Nectar guides fanning down the lip.
  g.strokeStyle = mix === 'white' ? 'rgba(220,120,150,0.35)' : 'rgba(130,6,30,0.4)';
  g.lineWidth = 2;
  g.beginPath();
  for (let k = -3; k <= 3; k++) {
    g.moveTo(cx + k * 4, cy + 22);
    g.quadraticCurveTo(cx + k * 12, cy + 60, cx + k * 22, cy + 112);
  }
  g.stroke();
  // Throat and the hood over it.
  g.fillStyle = mix === 'red' ? '#c2405a' : '#ead8dc';
  g.beginPath();
  g.ellipse(cx, cy + 12, 22, 16, 0, 0, Math.PI * 2);
  g.fill();
  const hg = g.createLinearGradient(0, cy - 90, 0, cy + 5);
  hg.addColorStop(0, mix === 'bi' ? PINK : mix === 'red' ? RED : WHITE);
  hg.addColorStop(0.45, mix === 'red' ? RED_LT : WHITE);
  hg.addColorStop(1, mix === 'red' ? '#e36a7e' : WHITE);
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(cx - 30, cy + 6);
  g.quadraticCurveTo(cx - 38, cy - 70, cx, cy - 92);
  g.quadraticCurveTo(cx + 38, cy - 70, cx + 30, cy + 6);
  g.quadraticCurveTo(cx, cy - 4, cx - 30, cy + 6);
  g.fill();
  g.strokeStyle = 'rgba(160,140,150,0.35)';
  g.lineWidth = 1.2;
  g.stroke();
}

function calyxCell(g: CanvasRenderingContext2D, bud: boolean) {
  const L = 236, X = (u: number) => 128 + u * L, Y = (a: number) => 252 - a * L;
  g.strokeStyle = '#6a8444';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(X(0), Y(0));
  g.lineTo(X(0), Y(0.2));
  g.stroke();
  if (bud) {
    // The closed corolla pushing out of the calyx: white with a red tip.
    const bg = g.createLinearGradient(0, Y(0.5), 0, Y(0.98));
    bg.addColorStop(0, WHITE);
    bg.addColorStop(0.55, '#f2c2cc');
    bg.addColorStop(1, RED);
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(X(0.01), Y(0.74), 0.085 * L, 0.24 * L, 0.08, 0, Math.PI * 2);
    g.fill();
  }
  const cg = g.createLinearGradient(0, Y(0.15), 0, Y(0.68));
  cg.addColorStop(0, '#6f8a48');
  cg.addColorStop(0.7, '#5c773c');
  cg.addColorStop(1, '#76506a');
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(X(-0.04), Y(0.16));
  g.quadraticCurveTo(X(-0.13), Y(0.42), X(-0.12), Y(0.62));
  g.lineTo(X(-0.07), Y(0.7));
  g.lineTo(X(-0.02), Y(0.6));
  g.lineTo(X(0.05), Y(0.68));
  g.lineTo(X(0.12), Y(0.58));
  g.quadraticCurveTo(X(0.12), Y(0.4), X(0.04), Y(0.16));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,60,25,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  for (const u of [-0.06, 0, 0.06]) {
    g.moveTo(X(u * 0.4), Y(0.2));
    g.lineTo(X(u), Y(0.6));
  }
  g.stroke();
}

function flowerAtlas(): THREE.Texture {
  return leafTexture('salvia-hot-lips-flowers', 1024, 512, (g) => {
    const r = rng('salvia-hot-lips-flower-tex');
    const mixes: Mix[] = ['bi', 'red', 'white'];
    const cell = (i: number, draw: () => void) => {
      g.save();
      g.translate((i % 4) * 256, Math.floor(i / 4) * 256);
      g.beginPath();
      g.rect(1, 1, 254, 254);
      g.clip();
      draw();
      g.restore();
    };
    mixes.forEach((m, i) => cell(i, () => profileFlower(g, r, m)));
    mixes.forEach((m, i) => cell(3 + i, () => frontFlower(g, r, m)));
    cell(6, () => calyxCell(g, false));
    cell(7, () => calyxCell(g, true));
  });
}

/* ------------------------------ builder ------------------------------ */

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const leaves = new GeoBuilder(), wood = new GeoBuilder(), flowers = new GeoBuilder();
  // The leafy dome is about two thirds of the height; racemes stand above it.
  const Hf = H * 0.64, Rf = Sp * 0.46;
  const sw = (p: THREE.Vector3) => clamp(Math.pow(clamp(p.y / H), 1.25) * 0.85 + (Math.hypot(p.x, p.z) / (Sp / 2)) * 0.15);
  const woodyC = col('#857a62'), stemC = col('#74804e'), racemeC = col('#6c7448');
  const center = V(0, Hf * 0.45, 0), radii = V(Rf, Hf * 0.7, Rf);

  /** World-up with its component along `d` removed: the card side that should point up. */
  const upPerp = (d: THREE.Vector3) => {
    const u = UP.clone().addScaledVector(d, -d.y);
    return u.lengthSq() < 1e-6 ? perp(d) : u.normalize();
  };

  const shadeAt = (p: THREE.Vector3, inner = 0) => {
    // Darker deep inside the dome and low down, where little light reaches.
    const d = clamp(Math.sqrt(Math.pow(Math.hypot(p.x, p.z) / Rf, 2) + Math.pow((p.y - Hf * 0.3) / (Hf * 0.8), 2)));
    return lerp(0.62, 1, Math.pow(d, 1.6)) * lerp(0.86, 1, clamp(p.y / Hf)) * (1 - inner * 0.2);
  };

  const leafAt = (p: THREE.Vector3, dir: THREE.Vector3, len: number, kind: number, birth: number, anchor: THREE.Vector3) => {
    // Leaves hold their upper side toward the sky, tipped a little outward.
    const face = upPerp(dir).lerp(V(p.x, 0, p.z).normalize(), 0.25).normalize();
    const c = jitter(col('#ffffff', shadeAt(p) * (0.9 + r() * 0.15)), r, 0.012, 0.04, 0.04);
    leafQuad(leaves, p, dir, face, len, len, leafCell(kind, r() < 0.5 ? 0 : 1), c, birth, anchor, { segs: 1, center, radii, normalBend: 0.35, sway0: sw(p), sway1: clamp(sw(p) + 0.06) });
  };

  /** A leafy card (shoot or branchlet) from `at` along `dir`, its face turned toward the sky and outward. */
  const leafCard = (at: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, uv: UV, birth: number, anchor: THREE.Vector3, inner: number, cross = false) => {
    const out = V(at.x, 0, at.z).normalize();
    const face = upPerp(dir).lerp(out, 0.35 + r() * 0.3).add(V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)).normalize();
    const c = jitter(col('#ffffff', shadeAt(at, inner) * (0.88 + r() * 0.15)), r, 0.012, 0.04, 0.04);
    const o = { segs: 2, curl: 0.15 + r() * 0.35, center, radii, normalBend: 0.45, sway0: sw(at), sway1: clamp(sw(at) + 0.1) };
    leafQuad(leaves, at, dir, face, len, wid, uv, c, birth, anchor, o);
    if (cross) leafQuad(leaves, at, dir, V().crossVectors(dir, face).normalize(), len, wid, uv, c.clone().multiplyScalar(0.92), birth, anchor, { ...o, curl: 0 });
  };

  /** Opposite leaf pairs along a stem, each pair a quarter turn from the last, with leafy shoots in many axils. */
  const leafyStem = (pts: THREE.Vector3[], len: number, t0: number, t1: number, size: number, birth: number, anchor: THREE.Vector3, shoots: number) => {
    const n = Math.max(2, Math.round(((t1 - t0) * len) / 0.045));
    let roll = r() * 6.28;
    for (let k = 0; k < n; k++) {
      const t = lerp(t0, t1, (k + 0.3 + r() * 0.4) / n);
      const at = along(pts, t);
      roll += Math.PI / 2 + (r() - 0.5) * 0.4;
      const a = perp(at.dir), b = V().crossVectors(at.dir, a).normalize();
      const up = k / Math.max(1, n - 1);
      const late = birth > 0 ? birth : up > 0.6 && r() < 0.5 ? clamp(0.2 + r() * 0.5) : 0;
      for (const s of [-1, 1]) {
        const out = a.clone().multiplyScalar(Math.cos(roll) * s).addScaledVector(b, Math.sin(roll) * s);
        const dir = out.clone().addScaledVector(at.dir, 0.55 + r() * 0.3).add(V(0, -0.15, 0)).normalize();
        const sz = size * lerp(1, 0.75, up) * (0.85 + r() * 0.3);
        leafAt(at.p, dir, sz, r() < 0.1 ? 3 : r() < 0.15 ? 2 : r() < 0.55 ? 0 : 1, late, birth > 0 ? anchor : at.p);
        // A short leafy shoot from the axil, angled up and out.
        if (r() < shoots) {
          const sd = out.clone().multiplyScalar(0.75).addScaledVector(at.dir, 0.7).add(V(0, 0.3, 0)).normalize();
          const sl = (0.085 + r() * 0.045) * lerp(1, 0.75, up);
          const sb = birth > 0 ? birth : r() < 0.6 ? 0 : clamp(0.15 + r() * 0.6);
          leafCard(at.p, sd, sl, sl * 0.375, shootCell(Math.floor(r() * 4)), sb, birth > 0 ? anchor : at.p, 0.2);
        }
      }
    }
  };

  /** Branchlets: twigs with side shoots that make up the bulk of the leafy dome. */
  const branchlets = (pts: THREE.Vector3[], t0: number, t1: number, count: number, size: number, birth: number, anchor: THREE.Vector3) => {
    for (let k = 0; k < count; k++) {
      const t = lerp(t0, t1, (k + r()) / count);
      const at = along(pts, t);
      const out = V(at.p.x, 0, at.p.z).normalize();
      const d = deflect(at.dir, 0.5 + r() * 0.5, r() * 6.28).lerp(out, 0.3).add(V(0, 0.2, 0)).normalize();
      const L = size * (0.8 + r() * 0.4);
      const bb = birth > 0 ? clamp(birth + r() * 0.1, 0, 0.9) : r() < 0.8 ? 0 : clamp(0.1 + r() * 0.6);
      leafCard(at.p, d, L, L, branchCell(r() < 0.5 ? 0 : 1), bb, birth > 0 ? anchor : at.p, 1 - t, r() < 0.35);
    }
  };

  /** A loose raceme: empty calyces below, one or two nodes of open flowers, buds at the tip. */
  const raceme = (base: THREE.Vector3, dir0: THREE.Vector3, len: number, birth: number, anchor: THREE.Vector3) => {
    const az = Math.atan2(dir0.z, dir0.x);
    const lean0 = Math.acos(clamp(dir0.y, -1, 1));
    const pts = arcPath(base, az, Math.min(lean0, 0.7), 0.08 + r() * 0.25, len, 5, r, 0.1);
    const rp = [pts[0], pts[2], pts[4], pts[5]];
    tube(wood, rp, 0.0011, 0.0007, 3, racemeC, birth, anchor, (i) => sw(rp[i]), 1);
    const nodes = 5 + Math.floor(r() * 3);
    // Which nodes are in flower: the lower part has finished, the tip is still in bud.
    const open0 = Math.max(1, nodes - 4 - Math.floor(r() * 2));
    const open1 = Math.min(nodes - 2, open0 + (r() < 0.7 ? 2 : 1));
    let roll = r() * 6.28;
    // Each raceme leans toward one color: most bicolor, some redder (the first flowers), a few white.
    const q = r();
    const pick = (): number => {
      const x = r();
      if (q < 0.25) return x < 0.65 ? 1 : 0;
      if (q < 0.32) return x < 0.6 ? 2 : 0;
      return x < 0.74 ? 0 : x < 0.93 ? 1 : 2;
    };
    for (let k = 0; k < nodes; k++) {
      const t = lerp(0.3, 0.97, k / (nodes - 1));
      const at = along(pts, t);
      roll += Math.PI / 2 + (r() - 0.5) * 0.3;
      const a = perp(at.dir), b = V().crossVectors(at.dir, a).normalize();
      for (const s of [-1, 1]) {
        const out = a.clone().multiplyScalar(Math.cos(roll) * s).addScaledVector(b, Math.sin(roll) * s);
        const p = at.p.clone();
        const sway = sw(p);
        const tone = 0.92 + r() * 0.1;
        if (k >= open0 && k <= open1) {
          if (r() < 0.12) continue;
          // An open flower: held out sideways, nodding a little.
          const d = out.clone().addScaledVector(at.dir, 0.25 + r() * 0.3).add(V(0, (r() - 0.6) * 0.3, 0)).normalize();
          const m = pick();
          const L = 0.025 + r() * 0.005;
          const u = upPerp(d);
          const face = V().crossVectors(u, d).normalize();
          const c = jitter(col('#ffffff', tone), r, 0.006, 0.03, 0.02);
          leafQuad(flowers, p, d, face, L, L, uvCell(4, 2, m), c, birth, anchor, { segs: 1, sway0: sway, sway1: sway });
          // The face of the flower: lip and hood seen down the throat.
          const fc = p.clone().addScaledVector(d, L * 0.66).addScaledVector(u, -L * 0.1);
          const fs = L * 0.82;
          const x = V().crossVectors(u, d).normalize();
          const n = d.clone().lerp(UP, 0.35).normalize();
          const i0 = flowers.vert(fc.clone().addScaledVector(x, -fs / 2).addScaledVector(u, -fs * 0.56), n, ...uvAt(3 + m, 0, 0), c, birth, anchor, sway);
          const i1 = flowers.vert(fc.clone().addScaledVector(x, fs / 2).addScaledVector(u, -fs * 0.56), n, ...uvAt(3 + m, 1, 0), c, birth, anchor, sway);
          const i2 = flowers.vert(fc.clone().addScaledVector(x, fs / 2).addScaledVector(u, fs * 0.44), n, ...uvAt(3 + m, 1, 1), c, birth, anchor, sway);
          const i3 = flowers.vert(fc.clone().addScaledVector(x, -fs / 2).addScaledVector(u, fs * 0.44), n, ...uvAt(3 + m, 0, 1), c, birth, anchor, sway);
          flowers.quad(i0, i1, i2, i3);
        } else {
          // Empty calyces below the open flowers, buds above them.
          const bud = k > open1;
          const d = out.clone().multiplyScalar(bud ? 0.35 : 0.6).addScaledVector(at.dir, 1).normalize();
          const L = bud ? 0.011 + (nodes - k) * 0.002 : 0.012;
          const u = upPerp(d);
          leafQuad(flowers, p, d, V().crossVectors(u, d).normalize(), L, L, uvCell(4, 2, bud ? 7 : 6), col('#ffffff', tone * 0.9), birth, anchor, { segs: 1, sway0: sway, sway1: sway });
        }
      }
    }
  };
  const uvAt = (cell: number, u: number, v: number): [number, number] => {
    const c = uvCell(4, 2, cell);
    return [lerp(c[0], c[2], u), lerp(c[1], c[3], v)];
  };

  /** Scale a path about its base so its end lands on the leafy dome (times k). */
  const toDome = (pts: THREE.Vector3[], k: number) => {
    const b = pts[0], e = pts[pts.length - 1].clone().sub(b);
    const s = k / Math.sqrt(Math.pow(Math.hypot(e.x, e.z) / Rf, 2) + Math.pow(Math.max(0.01, e.y + b.y) / Hf, 2));
    for (const p of pts) p.sub(b).multiplyScalar(s).add(b);
    return pts;
  };

  const N = 36;
  for (let i = 0; i < N; i++) {
    const f = Math.sqrt((i + 0.5) / N);
    const az = i * 2.39996 + (r() - 0.5) * 0.5;
    const base = V(Math.cos(az) * 0.07 * f, 0, Math.sin(az) * 0.07 * f);
    // Center stems rise straight; outer ones lean out low, then turn up, so the dome meets the ground.
    const lean0 = lerp(0.15, 1.45, Math.pow(f, 0.8)) + (r() - 0.5) * 0.2;
    const lean1 = lerp(0.08, 0.85, f) + (r() - 0.5) * 0.15;
    const pts = toDome(arcPath(base, az, lean0, lean1, 1, 7, r, 0.14), 0.84 + r() * 0.16);
    const L = pts[0].distanceTo(pts[pts.length - 1]) * 1.05;
    // Half the stems are there in the nursery can; the rest come as the plant fills out.
    const birth = i % 3 !== 2 ? 0 : clamp(0.08 + r() * 0.6, 0, 0.8);
    const anchor = base;
    const r0 = 0.0042 + r() * 0.0012;
    const split = 3;
    tube(wood, pts.slice(0, split + 1), r0, r0 * 0.62, 5, woodyC, birth, anchor, (q) => sw(pts[q]), 1);
    tube(wood, pts.slice(split), r0 * 0.62, r0 * 0.3, 4, stemC, birth, anchor, (q) => sw(pts[q + split]), 1);
    leafyStem(pts, L, lerp(0.22, 0.08, f), 0.98, 0.026, birth, anchor, 0.55);
    branchlets(pts, 0.28, 0.92, 3, 0.15, birth, anchor);

    // Side branches in opposite pairs from the upper stem, each ending in its own raceme.
    const nb = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const t = lerp(0.3, 0.82, (k + r() * 0.6) / nb);
      const at = along(pts, t);
      const d = deflect(at.dir, 0.45 + r() * 0.35, r() * 6.28);
      if (d.y < 0.1) d.y = 0.1 + r() * 0.2;
      d.normalize();
      const baz = Math.atan2(d.z, d.x), bl0 = Math.acos(clamp(d.y, -1, 1));
      const bpts = toDome(arcPath(at.p, baz, bl0, Math.max(0.05, bl0 - 0.5), 1, 4, r, 0.12), 0.8 + r() * 0.22);
      const bl = bpts[0].distanceTo(bpts[bpts.length - 1]) * 1.05;
      if (bl < 0.04) continue;
      const bb = birth > 0 ? clamp(birth + r() * 0.15, 0, 0.85) : r() < 0.6 ? 0 : clamp(0.12 + r() * 0.55);
      tube(wood, bpts, Math.max(0.0012, lerp(r0, r0 * 0.3, t) * 0.7), 0.0009, 3, stemC, bb, at.p, (q) => sw(bpts[q]), 1);
      leafyStem(bpts, bl, 0.1, 0.98, 0.023, bb, at.p, 0.45);
      if (bl > 0.12) branchlets(bpts, 0.3, 0.8, 1, 0.13, bb, at.p);
      const e = bpts[bpts.length - 1], ed = e.clone().sub(bpts[bpts.length - 2]).normalize();
      if (e.y > Hf * 0.3) raceme(e, ed.lerp(UP, 0.55).normalize(), H * (0.17 + r() * 0.13) * lerp(0.7, 1, clamp(e.y / Hf)), bb, at.p);
    }
    const e = pts[pts.length - 1], ed = e.clone().sub(pts[pts.length - 2]).normalize();
    raceme(e, ed.lerp(UP, lerp(0.7, 0.45, f)).normalize(), H * (0.2 + r() * 0.14) * lerp(0.6, 1, clamp(e.y / Hf)), birth, anchor);
  }

  // Low stems arching out near the ground carry the skirt of the mound.
  for (let i = 0; i < 12; i++) {
    const az = (i / 12) * Math.PI * 2 + r() * 0.4;
    const base = V(Math.cos(az) * 0.06, 0, Math.sin(az) * 0.06);
    const pts = toDome(arcPath(base, az, 1.5 + (r() - 0.5) * 0.1, 0.95 + r() * 0.3, 1, 6, r, 0.12), 0.88 + r() * 0.12);
    const L = pts[0].distanceTo(pts[pts.length - 1]) * 1.05;
    const birth = i % 2 === 0 ? 0 : clamp(0.15 + r() * 0.5);
    tube(wood, pts, 0.0035, 0.0012, 4, woodyC, birth, base, (q) => sw(pts[q]), 1);
    leafyStem(pts, L, 0.08, 0.98, 0.026, birth, base, 0.6);
    branchlets(pts, 0.3, 0.9, 2, 0.14, birth, base);
    const e = pts[pts.length - 1], ed = e.clone().sub(pts[pts.length - 2]).normalize();
    if (r() < 0.6) raceme(e, ed.lerp(UP, 0.6).normalize(), H * (0.12 + r() * 0.1), birth, base);
  }

  fitToSize([leaves, wood, flowers], H, Sp);
  return {
    leaves: leaves.build(),
    wood: wood.build(),
    flowers: flowers.build(),
    leafMap: leafAtlas(),
    flowerMap: flowerAtlas(),
    bark: { map: stemBark() },
    look: { translucency: 0.4, leafRoughness: 0.72, bend: 0.08, flutter: 0.01 },
  };
};
