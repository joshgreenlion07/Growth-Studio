import { serratePath } from './shared-trees-a';

/**
 * Leaf painting shared by the Sango-kaku and lace-leaf Japanese maples
 * (Acer palmatum): a palmate blade of 5, 7 or 9 lobes radiating from the
 * petiole joint, each lobe either toothed (the species and most upright
 * cultivars) or cut again into narrow toothed segments (var. dissectum).
 */

export interface PalmateColors {
  /** Blade colors: at the joint, the body, the lobe tips. */
  dark: string;
  mid: string;
  light: string;
  /** Color the youngest leaves at the shoot tips lean toward. */
  fresh: string;
  /** Red edge on young leaves (optional). */
  edge?: string;
  vein: string;
}

export interface PalmateOpts {
  lobes: 5 | 7 | 9;
  /** Lobe width as a fraction of its length (0.2 narrow .. 0.3 broad). */
  width: number;
  /** How far the sinuses cut toward the joint, 0..1 (0.66 = two thirds). */
  cut: number;
  /** Tooth depth, 0..0.3. */
  teeth: number;
  /** 0 shaded .. 1 sunlit. */
  shade: number;
  /** New growth, 0..1. */
  fresh: number;
  /** Lace-leaf: each lobe is cut into narrow toothed segments, 0 (no) .. 1 (finely). */
  dissect?: number;
}

const LOBE_SETS: Record<number, { ang: number[]; len: number[] }> = {
  5: { ang: [0, 0.78, 1.62], len: [1, 0.84, 0.46] },
  7: { ang: [0, 0.6, 1.2, 1.85], len: [1, 0.88, 0.63, 0.34] },
  9: { ang: [0, 0.44, 0.88, 1.34, 1.86], len: [1, 0.96, 0.84, 0.64, 0.4] },
};

/** One lobe cut into narrow forward-pointing segments along a thin midrib, base at the origin, tip at (len, 0). */
function dissectedLobe(g: CanvasRenderingContext2D, r: () => number, len: number, fine: number) {
  const rib = len * 0.035;
  g.beginPath();
  g.moveTo(0, -rib * 0.6);
  g.lineTo(len * 0.96, -rib * 0.25);
  g.lineTo(len, 0);
  g.lineTo(len * 0.96, rib * 0.25);
  g.lineTo(0, rib * 0.6);
  g.closePath();
  g.fill();
  const pairs = Math.round(lerp(5, 8, fine));
  for (let i = 0; i < pairs; i++) {
    const t = 0.16 + (i / pairs) * 0.76;
    const segLen = len * (0.34 - 0.2 * t) * (0.85 + r() * 0.3);
    for (const s of [-1, 1]) {
      g.save();
      g.translate(len * t, 0);
      g.rotate(s * (0.62 + (r() - 0.5) * 0.25 - t * 0.18));
      serratePath(g, segLen, segLen * 0.26, 0.4, 3 + Math.round(fine * 2), 0.32, 1.2);
      g.fill();
      g.restore();
    }
  }
}

/** Paint one palmate leaf with its petiole joint at (x, y) and the middle lobe pointing along `rot`, `size` px long. */
export function palmateLeaf(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, size: number, rot: number, c: PalmateColors, o: PalmateOpts) {
  const set = LOBE_SETS[o.lobes];
  const half = set.ang.length - 1;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // Draw the side lobes first so the middle one sits on top.
  const order: number[] = [];
  for (let k = half; k >= 1; k--) order.push(-k, k);
  order.push(0);
  for (const k of order) {
    const a = Math.abs(k);
    const len = size * set.len[a] * (0.94 + r() * 0.12);
    g.save();
    g.rotate(Math.sign(k) * (set.ang[a] + (r() - 0.5) * 0.08));
    // Shade and the new-growth flush are mixed into the colors up front.
    const tone = (hex: string) => {
      let rgb = mixRgb(hexRgb(hex), hexRgb(c.fresh), clamp01(o.fresh * 0.7));
      rgb = o.shade < 0.5 ? rgb.map((v) => v * (1 - (0.5 - o.shade) * 0.45)) : mixRgb(rgb, [255, 255, 235], (o.shade - 0.5) * 0.08);
      return `rgb(${rgb.map((v) => Math.round(v)).join(',')})`;
    };
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, tone(c.dark));
    grad.addColorStop(0.5, tone(c.mid));
    grad.addColorStop(1, tone(c.light));
    g.fillStyle = grad;
    const teeth = Math.max(5, Math.round(11 * set.len[a]));
    if (o.dissect) {
      dissectedLobe(g, r, len, o.dissect);
    } else {
      // Lobes stay narrow at the base so the sinuses cut deep, as `cut` asks.
      serratePath(g, len, len * o.width * 2, lerp(0.55, 0.38, o.cut), teeth, o.teeth, 1.45);
      g.fill();
      if (c.edge && o.fresh > 0.3) {
        // Red margin on young leaves, kept inside the blade.
        g.save();
        g.clip();
        g.globalAlpha = (o.fresh - 0.3) * 0.9;
        g.strokeStyle = c.edge;
        g.lineWidth = Math.max(2, size * 0.06);
        g.stroke();
        g.restore();
      }
    }
    // Midrib and a few side veins.
    g.strokeStyle = c.vein;
    g.lineWidth = Math.max(0.7, size * 0.011);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.93, 0);
    g.stroke();
    if (!o.dissect) {
      g.lineWidth = Math.max(0.5, size * 0.005);
      g.beginPath();
      for (let v = 1; v <= 4; v++) {
        const t = 0.25 + v * 0.13;
        for (const s of [-1, 1]) {
          g.moveTo(len * t, 0);
          g.lineTo(len * (t + 0.1), s * len * o.width * 0.6 * (1 - Math.abs(t - 0.45)));
        }
      }
      g.stroke();
    }
    g.restore();
  }
  g.restore();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function hexRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i] - v) * t);
}
