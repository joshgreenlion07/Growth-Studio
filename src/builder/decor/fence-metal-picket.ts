import * as THREE from 'three';
import { plainMaterial, segmentBox } from '../materials';

type Vec2 = [number, number];
type Put = (key: string, mat: THREE.Material, geo: THREE.BufferGeometry, shadow?: boolean) => void;

const IN = 0.0254;
const BAY = 1.83;            // posts about every 6 ft
const PICKET = 0.75 * IN;    // 3/4 in square pickets
const OC = 4 * IN;           // about 4 in on center (3 7/8 in clear is the usual 4 in sphere rule)

/**
 * Black powder-coated ornamental metal picket fence (aluminum or steel): flush-top square pickets about
 * 4 in on center between two rails (one just under the top, one near the bottom), square posts every
 * ~6 ft, set on a low concrete mow curb. On a slope each bay steps with the ground (the rails stay level
 * within a bay, the pickets run down to the low end), so nothing floats and nothing is cut.
 * The segment's two ends get heavier posts: the run's end, a corner, or a gate post.
 * Everything goes into a few merged buckets (picket, rail, post, curb), so a long run is a handful of draw calls.
 */
export function metalPicketFence(l: { height: number }, a: Vec2, b: Vec2, height: (p: Vec2) => number, color: string, put: Put, heavyStart: boolean, heavyEnd: boolean) {
  const H = l.height;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-4) return;
  const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const at = (t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const metal = plainMaterial(`metal-picket-${color}`, { color, roughness: 0.62, metalness: 0.3 });
  const concrete = plainMaterial('mow-curb-concrete', { color: '#b7b4ac', roughness: 0.92 });
  const n = Math.max(1, Math.round(len / BAY));
  const rail = 1.5 * IN, railT = 0.9 * IN;

  const post = (t: number, heavy: boolean, gLow: number) => {
    const p = at(t), s = (heavy ? 2.5 : 2) * IN;
    put('post', metal, segmentBox([p[0] - (dir[0] * s) / 2, p[1] - (dir[1] * s) / 2], [p[0] + (dir[0] * s) / 2, p[1] + (dir[1] * s) / 2], s, gLow - 0.12, gLow + H + (heavy ? 0.045 : 0.02)));
    if (heavy) { // a flat cap on the heavy post
      const c = s + 0.012;
      put('post', metal, segmentBox([p[0] - (dir[0] * c) / 2, p[1] - (dir[1] * c) / 2], [p[0] + (dir[0] * c) / 2, p[1] + (dir[1] * c) / 2], c, gLow + H + 0.045, gLow + H + 0.06));
    }
  };

  const lows: number[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const p0 = at(t0), p1 = at(t1);
    // Ground along the bay: the lowest of its ends and middle sets the pickets; the highest sets the curb top.
    const hs = [height(p0), height(at((t0 + t1) / 2)), height(p1)];
    const gLow = Math.min(...hs), gHigh = Math.max(...hs);
    lows.push(gLow);
    // Mow curb: 6 in wide, 3 in above the high ground, buried below the low.
    put('curb', concrete, segmentBox(p0, p1, 6 * IN, gLow - 0.12, gHigh + 3 * IN, 0), true);
    // Rails: one just below the top, one about 4 in off the curb.
    const base = gHigh + 3 * IN;
    const top = gLow + H;
    put('rail', metal, segmentBox(p0, p1, railT, top - 0.2 - rail / 2 + 0.02, top - 0.2 + rail / 2 + 0.02, 0));
    put('rail', metal, segmentBox(p0, p1, railT, base + 0.1, base + 0.1 + rail, 0));
    // Pickets: evenly spread between the posts, flush tops.
    const bayLen = len / n, post = 2 * IN;
    const room = bayLen - post - PICKET;
    const cnt = Math.max(1, Math.floor(room / OC) + 1);
    const step = cnt > 1 ? room / (cnt - 1) : 0;
    for (let i = 0; i < cnt; i++) {
      const d = t0 * len + post / 2 + PICKET / 2 + i * step + (cnt === 1 ? room / 2 : 0);
      const c = at(d / len);
      put('picket', metal, segmentBox([c[0] - (dir[0] * PICKET) / 2, c[1] - (dir[1] * PICKET) / 2], [c[0] + (dir[0] * PICKET) / 2, c[1] + (dir[1] * PICKET) / 2], PICKET, gLow - 0.05, top, 0));
    }
  }
  for (let k = 0; k <= n; k++) {
    const heavy = (k === 0 && heavyStart) || (k === n && heavyEnd);
    post(k / n, heavy, Math.min(lows[Math.min(k, n - 1)], lows[Math.max(k - 1, 0)]));
  }
}
