import * as THREE from 'three';
import { featureSize } from '../../siteplan/decor';
import { rng } from '../../siteplan/geometry';
import { plainMaterial } from '../materials';
import { box, cortenPlate, IN, type DecorContext } from './kit';

/*
 * The corten "tree of life" screen on the job's back fence (its photo): one square laser-cut design across three
 * vertical sheets of weathering steel, bolted to a steel tube frame (posts at the sheet joints and edges, rails at a
 * third and two thirds of the height, set in the ground). Inside a circle nearly as wide as the screen the steel is cut
 * away except for the tree: a thick trunk, branches forking up and out to the rim, roots forking down to it, and a band
 * of small square leaves cut along the top of the crown. Outside the circle the plate is solid. Drawn 7 x 7 ft as
 * built, standing 2 in off the ground; the cut pattern is a mask painted at runtime, not an image.
 */

let mask: THREE.CanvasTexture | null = null;
const MASK = 1024;

/** The cut pattern: white is steel, black is cut through. */
function treeMask(): THREE.CanvasTexture | null {
  if (mask) return mask;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = MASK;
  const g = cv.getContext('2d')!;
  const r = rng('tree-of-life');
  const C = MASK / 2, R = MASK * 0.468;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, MASK, MASK);
  g.save();
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#000';
  g.fillRect(0, 0, MASK, MASK);
  // The crown's top: solid with square leaves cut in it, on a loose grid.
  const crownTop = C - R * 0.6;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, MASK, crownTop);
  g.fillStyle = '#000';
  for (let y = C - R + 30; y < crownTop - 12; y += 50) {
    for (let x = C - R; x < C + R; x += 50) {
      const jx = x + (r() - 0.5) * 12, jy = y + (r() - 0.5) * 12, s = 28 + r() * 14;
      if (Math.hypot(jx - C, jy - C) > R - 30 || r() < 0.22) continue;
      g.fillRect(jx - s / 2, jy - s / 2, s, s);
    }
  }
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // A limb: a curved stroke from (x, y) at heading a (radians from straight up), forking until it reaches the rim.
  const limb = (x: number, y: number, a: number, len: number, w: number, depth: number, down: boolean) => {
    const bend = (r() - 0.5) * 0.3;
    let ex = x + Math.sin(a) * len, ey = y + (down ? 1 : -1) * Math.cos(a) * len;
    const d = Math.hypot(ex - C, ey - C);
    // Up limbs end in the solid band of leaves along the crown's top; everything else at the rim.
    const inCrown = !down && ey < crownTop + 6;
    if (inCrown) ey = crownTop - 4;
    const atRim = d > R - 4 || inCrown;
    if (!inCrown && atRim) {
      // Run the limb on into the rim so it joins the solid plate.
      const k = (R + 6) / d;
      ex = C + (ex - C) * k;
      ey = C + (ey - C) * k;
    }
    const mx = (x + ex) / 2 + Math.cos(a) * len * bend, my = (y + ey) / 2 + Math.sin(a) * len * bend * (down ? -1 : 1);
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const q = (t: number) => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey];
      const [ax, ay] = q(t0), [bx, by] = q(t1);
      g.lineWidth = Math.max(3.5, w * (1 - t0 * 0.35));
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    if (atRim) return;
    if (depth <= 0) {
      // The last twig runs straight on to the rim, tapering.
      const dx = Math.sin(a), dy = (down ? 1 : -1) * Math.cos(a);
      const px = ex - C, py = ey - C;
      let t = -(px * dx + py * dy) + Math.sqrt(Math.max(0, (px * dx + py * dy) ** 2 - (px * px + py * py - (R + 6) * (R + 6))));
      if (!down && dy < 0) t = Math.min(t, (ey - crownTop + 4) / -dy);
      // A slight sweep, tapering in steps toward the rim.
      const sw = (r() - 0.5) * 0.35;
      let px0 = ex, py0 = ey;
      for (let i = 1; i <= 4; i++) {
        const f = i / 4, ang = a + sw * f;
        const qx = ex + Math.sin(ang) * t * f, qy = ey + (down ? 1 : -1) * Math.cos(ang) * t * f;
        g.lineWidth = Math.max(3.5, w * (0.7 - f * 0.3));
        g.beginPath();
        g.moveTo(px0, py0);
        g.lineTo(qx, qy);
        g.stroke();
        px0 = qx;
        py0 = qy;
      }
      return;
    }
    const n = depth > 3 ? 2 : r() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (down ? 0.6 : 0.48) + r() * 0.18;
      const na = a + (n === 2 ? (i ? 1 : -1) * spread * 0.5 : (i - 1) * spread * 0.55) + (r() - 0.5) * 0.15;
      limb(ex, ey, na, len * (0.68 + r() * 0.12), w * 0.66, depth - 1, down);
    }
  };
  // Trunk: a flared column from the root crown to the first fork.
  const base = C + R * 0.24, fork = C - R * 0.16, tw = R * 0.3;
  g.beginPath();
  g.moveTo(C - tw * 0.75, base + R * 0.06);
  g.bezierCurveTo(C - tw * 0.3, base - R * 0.05, C - tw * 0.42, fork + R * 0.12, C - tw * 0.55, fork);
  g.lineTo(C + tw * 0.55, fork);
  g.bezierCurveTo(C + tw * 0.42, fork + R * 0.12, C + tw * 0.3, base - R * 0.05, C + tw * 0.75, base + R * 0.06);
  g.closePath();
  g.fill();
  // Main limbs up and out, then roots down and out.
  for (const a of [-1.2, -0.5, 0.05, 0.55, 1.2]) limb(C + a * tw * 0.35, fork + 6, a, R * 0.22, R * (Math.abs(a) < 0.2 ? 0.1 : 0.12), 3, false);
  for (const a of [-1.3, -0.7, -0.1, 0.45, 1.0, 1.4]) limb(C + Math.max(-1, Math.min(1, a)) * tw * 0.4, base, a, R * 0.2, R * 0.1, 3, true);
  g.restore();
  // Joints between the three sheets.
  g.fillStyle = '#000';
  for (const x of [MASK / 3, (2 * MASK) / 3]) g.fillRect(x - 1, 0, 2, MASK);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  mask = t;
  return t;
}

const panelMats = new Map<string, THREE.MeshStandardMaterial>();
function panelMaterial(w: number, h: number): THREE.MeshStandardMaterial {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}`;
  let m = panelMats.get(key);
  if (m) return m;
  const set = cortenPlate();
  const map = set.map.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(w / set.tileMeters, h / set.tileMeters);
  map.needsUpdate = true;
  const alphaMap = treeMask();
  m = new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, ...(alphaMap ? { alphaMap, alphaTest: 0.5 } : {}) });
  panelMats.set(key, m);
  return m;
}

export function cortenTreePanel(c: DecorContext) {
  const [W, , H] = featureSize(c.spec, c.f.size, 84 * IN);
  const lift = 2 * IN;
  const sheet = new THREE.PlaneGeometry(W, H);
  sheet.translate(0, lift + H / 2, 0.012);
  c.add(panelMaterial(W, H), sheet.toNonIndexed());
  // The frame behind: 2 in square steel posts at the edges and sheet joints into the ground, rails at the thirds.
  const steel = plainMaterial('decor:frame-steel', { color: '#5a3320', roughness: 0.8, metalness: 0.2 });
  const tube = 2 * IN;
  for (const k of [0, 1, 2, 3]) c.add(steel, box(tube, lift + H - 0.01, tube, -W / 2 + tube / 2 + (k * (W - tube)) / 3, -0.3, -tube / 2));
  for (const f of [1 / 3, 2 / 3]) c.add(steel, box(W - tube, IN, IN, 0, lift + H * f - IN / 2, -IN / 2));
}
