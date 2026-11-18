import * as THREE from 'three';
import { pointInPolygon } from '../../siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../../siteplan/types';
import { vnoise } from '../../engine/noise';
import { mulRGB, paint, textureSet } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import { bar, box, IN, rbox, V, type DecorContext } from './kit';

/*
 * The job's covered patio (its photo): a white aluminum dining table with eight gray sling chairs, a 39 in Infratech
 * electric heater on the ceiling (the plan's spec sheet: 39 x 8.19 x 6 in, 4000 W, 240 V, stainless, mounted 96-120 in
 * up), and an eight-blade ceiling fan on a short downrod. The heater and fan hang from the roof of a cover they stand
 * under (its `height`), else at 9 ft.
 */

const DEFAULT_CEILING = 9 * 12 * IN;

/** The ceiling height over a point: the underside of the roof of a cover (California patio) it is under. */
export function coverCeiling(structures: ExistingStructure[]): (p: Vec2) => number | undefined {
  const covers = structures.filter((s) => s.kind === 'cover' && s.polygon.length >= 3);
  return (p) => covers.find((s) => pointInPolygon(p, s.polygon))?.height;
}

/** Textilene sling: a fine open weave of gray PVC-coated yarn. */
const slingSet = () => textureSet('decor:sling-mesh', () =>
  paint(256, 0.05, 1.5, (u, v) => {
    const wx = Math.abs(Math.sin(u * Math.PI * 2 * 24)), wy = Math.abs(Math.sin(v * Math.PI * 2 * 24));
    const yarn = Math.max(wx, wy);
    const c = mulRGB([0.24, 0.235, 0.23], 0.65 + yarn * 0.4 + (vnoise(u * 12, v * 12, 12, 51) - 0.5) * 0.04);
    return { h: yarn, c, r: 0.85 };
  }),
);

/** One sling chair at (x, z) facing +z turned by ry: dark aluminum tube frame, splayed legs, arms, high sling back. */
function slingChair(c: DecorContext, x: number, z: number, ry: number, frame: THREE.Material, sling: THREE.Material) {
  const t = 0.022, seatY = 17 * IN, w = 0.56, d = 0.56;
  const parts: [THREE.Material, THREE.BufferGeometry][] = [];
  const p = (m: THREE.Material, g: THREE.BufferGeometry) => parts.push([m, g]);
  for (const sx of [-1, 1]) {
    const xs = sx * w / 2;
    // Side frame: front leg, rear leg rising into the back post, arm.
    p(frame, bar(V(xs * 1.04, 0, d / 2 - 0.02), V(xs, seatY + 0.2, d / 2 - 0.08), t));
    p(frame, bar(V(xs * 1.04, 0, -d / 2 + 0.02), V(xs, seatY, -d / 2 + 0.1), t));
    p(frame, bar(V(xs, seatY, -d / 2 + 0.1), V(xs, 36 * IN, -d / 2 - 0.06), t));
    p(frame, bar(V(xs, seatY + 0.2, d / 2 - 0.08), V(xs, seatY + 0.22, -d / 2 + 0.02), t));
    p(frame, bar(V(xs, seatY, d / 2 - 0.06), V(xs, seatY, -d / 2 + 0.1), t));
  }
  p(frame, bar(V(-w / 2, seatY, d / 2 - 0.06), V(w / 2, seatY, d / 2 - 0.06), t));
  p(frame, bar(V(-w / 2, 36 * IN, -d / 2 - 0.06), V(w / 2, 36 * IN, -d / 2 - 0.06), t));
  // The sling: seat sagging a little, and the back, as thin sheets between the frame tubes.
  const seat = new THREE.PlaneGeometry(w - t, d - 0.16, 4, 4).rotateX(-Math.PI / 2);
  const sp = seat.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) { const sx = sp.getX(i) / (w / 2), sz = sp.getZ(i) / ((d - 0.16) / 2); sp.setY(i, -0.025 * (1 - sx * sx) * (1 - sz * sz)); }
  seat.computeVertexNormals();
  seat.translate(0, seatY + 0.005, 0.02);
  p(sling, seat);
  const back = new THREE.PlaneGeometry(w - t, 36 * IN - seatY - 0.04, 1, 1);
  const lean = Math.atan2(0.16, 36 * IN - seatY);
  back.rotateX(lean).translate(0, (36 * IN + seatY) / 2, -d / 2 + 0.02);
  p(sling, back);
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  for (const [mm, g] of parts) {
    g.applyMatrix4(m);
    if (!g.getAttribute('uv')) continue;
    c.add(mm, g.index ? g.toNonIndexed() : g);
  }
}

export function diningSling(c: DecorContext) {
  const [L, D] = c.spec.footprint;
  const white = plainMaterial('decor:white-powder', { color: '#d6d5d1', roughness: 0.45, metalness: 0.1 });
  const frame = plainMaterial('decor:chair-frame', { color: '#3a3a3b', roughness: 0.45, metalness: 0.5 });
  const sling = pbrMaterial('decor:sling', slingSet(), { side: THREE.DoubleSide });
  // Table 84 x 40 x 29 1/2 in: a 1 1/2 in top on a skirt and square legs.
  const tl = 84 * IN, tw = 40 * IN, th = 29.5 * IN;
  c.add(white, rbox(tl, 1.5 * IN, tw, 0.006, 0, th - 1.5 * IN, 0));
  for (const s of [-1, 1]) c.add(white, box(tl - 0.12, 0.06, 0.025, 0, th - 1.5 * IN - 0.06, s * (tw / 2 - 0.06)));
  for (const s of [-1, 1]) c.add(white, box(0.025, 0.06, tw - 0.12, s * (tl / 2 - 0.06), th - 1.5 * IN - 0.06, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(white, box(2.5 * IN, th - 1.5 * IN, 2.5 * IN, sx * (tl / 2 - 0.05), 0, sz * (tw / 2 - 0.05)));
  // Three chairs down each side, one at each end, pulled out a little.
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) slingChair(c, k * 0.68, s * (tw / 2 + 0.22), s > 0 ? Math.PI : 0, frame, sling);
  for (const s of [-1, 1]) slingChair(c, s * (tl / 2 + 0.24), 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, frame, sling);
  void L; void D;
}

/** The Infratech heater, 39 x 8.19 x 6 in, hung on two brackets just under the ceiling, tilted toward +z. */
export function patioHeater(c: DecorContext) {
  const ceil = c.ceiling ?? DEFAULT_CEILING;
  const steel = plainMaterial('decor:stainless', { color: '#b9bcbf', roughness: 0.3, metalness: 0.9 });
  const L = 39 * IN, H = 8.19 * IN, Dp = 6 * IN;
  const glow = new THREE.MeshStandardMaterial({ color: '#3a302a', emissive: new THREE.Color('#ff5a1e'), emissiveIntensity: 0, roughness: 0.5 });
  c.glow(glow);
  const tilt = 0.55;
  const body = rbox(L, Dp, H, 0.008, 0, -Dp / 2, 0, 2);
  const lamp = box(L - 0.08, 0.008, H * 0.45, 0, -Dp / 2 - 0.004, 0);
  for (const [m, g] of [[steel, body], [glow, lamp]] as const) {
    g.rotateX(-tilt);
    g.translate(0, ceil - 0.11, 0);
    c.add(m, g);
  }
  for (const s of [-1, 1]) c.add(steel, box(0.03, 0.1, 0.05, s * L * 0.38, ceil - 0.1, -0.02));
}

/** An eight-blade 60 in ceiling fan in oil-rubbed bronze with a light kit, on a 12 in downrod. */
export function ceilingFan(c: DecorContext) {
  const ceil = c.ceiling ?? DEFAULT_CEILING;
  const bronze = plainMaterial('decor:fan-bronze', { color: '#4a3a2e', roughness: 0.45, metalness: 0.6 });
  const blade = plainMaterial('decor:fan-blade', { color: '#5a4636', roughness: 0.6, metalness: 0.2 });
  const lens = plainMaterial('decor:fan-lens', { color: '#e8e2d6', roughness: 0.3 });
  const y = ceil - 12 * IN - 0.1;
  const cyl = (r0: number, r1: number, h: number, yy: number) => new THREE.CylinderGeometry(r1, r0, h, 18).translate(0, yy + h / 2, 0).toNonIndexed();
  c.add(bronze, cyl(0.06, 0.06, 0.05, ceil - 0.05));
  c.add(bronze, cyl(0.012, 0.012, 12 * IN, y + 0.05));
  c.add(bronze, cyl(0.11, 0.09, 0.1, y - 0.05));
  c.add(lens, cyl(0.07, 0.085, 0.03, y - 0.08));
  const R = 30 * IN;
  for (let k = 0; k < 8; k++) {
    const g = new THREE.BoxGeometry(R - 0.12, 0.006, 0.11);
    g.translate((R - 0.12) / 2 + 0.12, 0, 0);
    g.rotateX(0.12);
    g.rotateY((k / 8) * Math.PI * 2);
    g.translate(0, y, 0);
    c.add(blade, g.toNonIndexed());
  }
}
