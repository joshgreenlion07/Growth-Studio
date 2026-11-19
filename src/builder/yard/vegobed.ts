import * as THREE from 'three';
import { vegoColorOf, VEGO_MODERN_2783 } from '../../siteplan/planterbeds';
import type { Vec2 } from '../../siteplan/types';
import { fbm, vnoise } from '../../engine/noise';
import { mulRGB, paint, textureSet, type RGB } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import { box, IN, prism, srgb, yardMat, type YardContext } from './kit';

/*
 * Vego Garden's 32" Extra Tall Modern Pro 27" x 83" metal raised bed (siteplan/planterbeds.ts has the maker's numbers
 * and where they come from): smooth double-walled powder-coated steel panels, 0.8 in thick, two 39 in panels to a long
 * side meeting over a hidden middle post (only a fine seam shows, as in Vego's photos), a 24 in panel at each end, the
 * panels slotted into rounded aluminum corner posts 2 1/2 in square, flat aluminum caps tamped into the posts (rounded
 * on the outside, chamfered inside, as the manual draws S1 and S2), an aluminum logo plate near one corner of each long
 * side, and planting soil 2 in under the top. Local x along its length, z across, base at y = 0; plants placed in it
 * stand on its soil (decor/planters.ts plantGround through siteplan/yard.ts raisedBedSoil).
 */

/*
 * Upright faces use the engine's wall calibration (WALL_GAIN in engine/surfaces.ts: rendered linear = gain * albedo in
 * the default light), so the paint's average albedo is the swatch's color divided by that gain, as the spa cabinets do.
 */
const UPRIGHT_GAIN: RGB = [1.68, 1.77, 2.0];
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const uprightMean = (hex: string): RGB => srgb(hex).map((c, i) => toLin(c) / UPRIGHT_GAIN[i]) as RGB;

/** Vego's powder coat: an even satin color with a fine orange-peel texture and the faintest mottle. */
function powderCoat(hex: string) {
  return textureSet(`yard:vego-powder-${hex}`, () =>
    paint(256, 0.3, 0.12, (u, v) => {
      const peel = vnoise(u * 90, v * 90, 90, 131) * 0.6 + vnoise(u * 190, v * 190, 190, 132) * 0.4;
      const cloud = fbm(u, v, 3, 3, 133);
      return { h: peel, c: mulRGB(srgb(hex), 0.97 + (cloud - 0.5) * 0.05 + (peel - 0.5) * 0.03), r: 0.52 + peel * 0.08 };
    }, uprightMean(hex)),
  );
}

/** A quarter circle of `n` steps around (cx, cz), radius r, from angle a0 to a1 (plan x, z). */
function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 6): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

export function vegoModernBed(c: YardContext) {
  const v = VEGO_MODERN_2783;
  const own = c.f.size;
  const L = own ? own[0] / IN : v.L, W = own ? own[1] / IN : v.W, H = own ? own[2] / IN : v.H;
  const i = (x: number) => x * IN;
  const color = vegoColorOf(c.spec);
  const coat = pbrMaterial(`yard:vego-powder-${color.swatch}`, powderCoat(color.swatch), { metalness: 0 });
  const plate = plainMaterial('yard:vego-logo-plate', { color: '#a7aaab', roughness: 0.45, metalness: 0.6 });
  const P = v.post, R = v.round, t = v.wall;
  // The panels' outer faces sit a hair inside the posts' (the posts show as a narrow rounded strip at each corner).
  const inset = 0.06;
  const capT = 0.18, postTop = H - 0.12, panelTop = H - 0.02;

  // Corner posts: 2 1/2 in square, the outer corner rounded. Outline in plan (x, z) for the +x, +z corner, mirrored.
  const corner = (sx: number, sz: number): Vec2[] => {
    const x0 = L / 2 - P, z0 = W / 2 - P, x1 = L / 2, z1 = W / 2;
    const pts: Vec2[] = [[x0, z0], [x1, z0], ...arc(x1 - R, z1 - R, R, 0, Math.PI / 2), [x0, z1]];
    return pts.map(([x, z]): Vec2 => [i(x * sx), i(z * sz)]);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    c.add(coat, prism(corner(sx, sz), 0, i(postTop)));
    // The S1 cap: the post's outline, its inner corner chamfered, a little proud all round.
    const g = 0.04, x0 = L / 2 - P - g, z0 = W / 2 - P - g, ch = 0.6;
    const cap: Vec2[] = [[x0 + ch, z0], [L / 2 + g, z0], ...arc(L / 2 + g - R, W / 2 + g - R, R, 0, Math.PI / 2), [x0, W / 2 + g], [x0, z0 + ch]];
    c.add(coat, prism(cap.map(([x, z]): Vec2 => [i(x * sx), i(z * sz)]), i(postTop), i(postTop + capT)));
  }
  // Long sides: two panels each, meeting over the middle post with a fine seam.
  const seam = 0.12;
  const runL = L / 2 - P + 1; // each panel runs 1 in into its post
  for (const sz of [-1, 1]) {
    const zf = sz * (W / 2 - inset - t / 2);
    for (const sx of [-1, 1]) {
      const x0 = seam / 2, x1 = runL;
      c.add(coat, box(i(x1 - x0), i(panelTop), i(t), sx * i((x0 + x1) / 2), 0, i(zf)));
    }
    // The middle post (C5) behind the seam, 4 in along, and its S2 cap, chamfered at its inner corners.
    const zi = W / 2 - inset - 0.05, zo = zi - P;
    c.add(coat, box(i(v.midAlong), i(postTop), i(P - t), 0, 0, sz * i(zo + (P - t) / 2)));
    const a = v.midAlong / 2 + 0.04, ch = 0.6;
    const s2: Vec2[] = [[-a, W / 2 - inset + 0.02], [a, W / 2 - inset + 0.02], [a, zo + ch], [a - ch, zo], [-a + ch, zo], [-a, zo + ch]];
    c.add(coat, prism(s2.map(([x, z]): Vec2 => [i(x), i(z * sz)]), i(postTop), i(postTop + capT)));
    // An aluminum logo plate near the +x corner, a little below the top.
    c.add(plate, box(i(3.6), i(1.1), i(0.05), i(L / 2 - 6.5), i(H - 4.2), sz * i(W / 2 - inset + 0.025)));
  }
  // Ends: one panel each between the corner posts.
  for (const sx of [-1, 1]) {
    const xf = sx * (L / 2 - inset - t / 2);
    c.add(coat, box(i(t), i(panelTop), i(W - 2 * P + 2), i(xf), 0, 0));
  }
  // The soil, 2 in under the top, its surface a little uneven.
  const soilY = H - v.soilDrop;
  const sw = L - 2 * (inset + t), sd = W - 2 * (inset + t);
  const soil = new THREE.PlaneGeometry(i(sw), i(sd), 32, 10).rotateX(-Math.PI / 2);
  const pos = soil.getAttribute('position') as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    pos.setY(k, i(soilY) + Math.sin(x * 9.1 + z * 3.7) * 0.006 + Math.sin(x * 23 - z * 17) * 0.003);
  }
  const uv = soil.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
  soil.computeVertexNormals();
  c.add(yardMat.bedSoil(), soil.toNonIndexed());
  c.add(yardMat.soil(), box(i(sw - 0.1), i(soilY - 0.5), i(sd - 0.1), 0, 0, 0));
}
