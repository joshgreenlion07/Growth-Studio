import * as THREE from 'three';
import type { BirdbathGlaze } from '../../siteplan/waterfire';
import { fbm, smooth, vnoise } from '../../engine/noise';
import { hexRGB, mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import { alongProfile, IN, lathe, uprightAlbedo, type WaterFireContext } from './kit';

/*
 * Campania International Birdbath 6802 (campaniainternational.com, product specifications; CAMPANIA_6802): glazed
 * ceramic, 20.5 in W x 24 in H, base 10.5 in W, two pieces. The outline below is read from Campania's photos of 6802 in Petrol and
 * Antique Glaze against those three sizes (it is not published): a flared foot 10.5 in across and about 2 3/4 in tall,
 * a band of two rings over it, a straight tapered column from about 8 in across at the band to about 6 in under a
 * collar of two rings 6 3/4 in across, and the basin on the collar: a shallow dome underneath out to a short wall and a
 * rolled rim, the bowl inside about 2 in deep. Hand-applied glazes break paler over the rings and rims and pool darker
 * in the grooves; both are glossy (Antique Glaze a little satin, with a pewter sheen). Still water, about 1 1/2 in
 * deep in the middle, filled by hand (Hand tool: the water can be emptied and filled).
 */

/** A profile point: radius, height (inches), and how thin (+) or pooled (-) the glaze is there. */
type P = [number, number, number?];

const PEDESTAL: P[] = [
  [0, 0], [4.95, 0], [5.2, 0.12], [5.25, 0.4, 0.8], [5.18, 0.75], [4.98, 1.15], [4.7, 1.6], [4.46, 2.05], [4.3, 2.5], [4.24, 2.8, -0.6],
  // The low band: two rings.
  [4.3, 2.92], [4.45, 3.05], [4.5, 3.25, 1], [4.44, 3.45], [4.25, 3.56], [4.17, 3.7, -0.8], [4.22, 3.82], [4.4, 3.94], [4.46, 4.12, 1], [4.4, 4.32], [4.2, 4.45], [4.05, 4.56, -0.5],
  // The column, tapering straight up.
  [4.0, 4.7], [3.75, 8.2], [3.5, 11.7], [3.25, 15.1], [3.0, 18.5, -0.4],
  // The collar: two rings under the basin.
  [3.08, 18.62], [3.25, 18.78], [3.3, 19.0, 1], [3.25, 19.22], [3.08, 19.34], [3.02, 19.46, -0.8], [3.1, 19.58], [3.32, 19.72], [3.38, 20.0, 1], [3.32, 20.3], [3.15, 20.5, 0.6], [3.0, 20.6], [0, 20.6],
];

/** Where the bowl's inner wall meets its floor (the runs stop there). */
const FLOOR: P = [8.7, 22.6, -0.4];

const BASIN: P[] = [
  [0, 20.55], [3.05, 20.55], [3.5, 20.68], [5.0, 20.95], [6.8, 21.3], [8.3, 21.72], [9.4, 22.2], [9.95, 22.75], [10.12, 23.2, -0.3],
  // The rolled rim.
  [10.25, 23.55], [10.25, 23.8, 0.8], [10.12, 23.96, 1], [9.9, 24.0, 1], [9.65, 23.97, 0.8], [9.45, 23.85, 0.6], [9.36, 23.62],
  // The bowl inside.
  [9.2, 23.15], FLOOR, [7.5, 22.2, -0.6], [5.0, 21.98, -0.7], [0, 21.92, -0.7],
];

/** The water's top (inches up) and its radius there, on the bowl's inner wall. */
const WATER_Y = 23.35, WATER_R = 9.25;

/*
 * The glazes. Tones are read from Campania's photos of 6802 (sRGB): Petrol's column, its paler breaks on the rings and
 * rims and its darker pools; Antique Glaze's charcoal and its graphite edges. Each texture is scaled so its average,
 * by the upright-face calibration, renders as the photo's column; a glossy glaze's sheen adds its own light, so the
 * albedo is taken a sixth darker.
 */
interface Glaze {
  ground: RGB;
  light: RGB;
  pool: RGB;
  thin: RGB;
  fleck: RGB;
  mean: RGB;
  rough: number;
  metal: number;
}
const GLAZES: Record<BirdbathGlaze, Glaze> = {
  // Petrol: Campania's photo gives the column (80, 103, 116); buyers report the glaze reads darker than the photos, a
  // deep blue-green, so it is taken about a tenth darker and a touch greener, (72, 96, 102).
  petrol: { ground: hexRGB('#4c6670'), light: hexRGB('#667f80'), pool: hexRGB('#2d4652'), thin: hexRGB('#9eb1ac'), fleck: hexRGB('#2a3430'), mean: uprightAlbedo([72, 96, 102], 0.84), rough: 0.14, metal: 0 },
  'antique-glaze': { ground: hexRGB('#252524'), light: hexRGB('#30302e'), pool: hexRGB('#171716'), thin: hexRGB('#4c4c48'), fleck: hexRGB('#3a3530'), mean: uprightAlbedo([37, 37, 36], 0.84), rough: 0.26, metal: 0.12 },
};

/** Where along a profile (meters) the glaze is thin or pooled, and by how much. */
function marks(profile: P[]): { s: number; w: number }[] {
  const along = alongProfile(profile.map(([r, y]) => [r, y]));
  return profile.flatMap((p, i) => (p[2] ? [{ s: along[i], w: p[2] }] : []));
}

/**
 * A glaze over one piece: broad clouds, runs down the piece (the noise stretched along its profile), fine specks, and
 * the breaks and pools at the profile's marked points. One tile is longer than the piece's whole profile, so they do not
 * repeat up it; `v` is turned into the length along the profile from its first point.
 */
function glazeSet(glaze: BirdbathGlaze, piece: 'pedestal' | 'basin', profile: P[]): PBRSet {
  const G = GLAZES[glaze], T = 1.0;
  const m = marks(profile);
  // The bowl's floor: glaze settles there instead of running, so the runs fade out down the inner wall (they would
  // gather into a star at the middle).
  const along = alongProfile(profile.map(([r, y]) => [r, y]));
  const floorAt = piece === 'basin' ? along[profile.indexOf(FLOOR)] : 1e6;
  return textureSet(`wf-birdbath-${glaze}-${piece}`, () =>
    paint(1024, T, 0.5, (u, v) => {
      const at = (1 - v) * T;
      let thin = 0, pool = 0;
      for (const k of m) {
        const e = Math.exp(-(((at - k.s) / 0.0045) ** 2));
        if (k.w > 0) thin = Math.max(thin, e * k.w);
        else pool = Math.max(pool, e * -k.w);
      }
      const cloud = fbm(u, v, 4, 4, 601), run = fbm(u, v * 0.16, 36, 3, 603), fine = vnoise(u * 360, v * 360, 360, 607);
      let c: RGB = mixRGB(G.ground, G.light, smooth(0.35, 0.75, cloud) * 0.85);
      const runs = 1 - smooth(floorAt - 0.02, floorAt + 0.01, at);
      c = mixRGB(c, G.pool, smooth(0.55, 0.82, run) * 0.6 * runs);
      if (at > floorAt) c = mixRGB(c, G.pool, smooth(floorAt, floorAt + 0.05, at) * 0.35 * (0.6 + 0.4 * cloud));
      c = mixRGB(c, G.thin, thin * (0.75 + 0.25 * fbm(u, v, 24, 3, 609)));
      c = mixRGB(c, G.pool, pool * 0.75);
      if (fine > 0.95) c = mixRGB(c, G.fleck, smooth(0.95, 0.99, fine) * 0.7);
      return { h: 0.5 + (fine - 0.5) * 0.04, c: mulRGB(c, 0.98 + fine * 0.04), r: G.rough + thin * 0.08 };
    }, G.mean),
  );
}

export function birdbath(c: WaterFireContext, glaze: BirdbathGlaze) {
  const { sink } = c;
  const G = GLAZES[glaze];
  const extra = { metalness: G.metal };
  const pts = (p: P[]): [number, number][] => p.map(([r, y]) => [r, y]);
  // The lathes' seams turned to the back.
  sink.add(pbrMaterial(`wf-birdbath-${glaze}-pedestal`, glazeSet(glaze, 'pedestal', PEDESTAL), extra), lathe(pts(PEDESTAL), 1.0, 64).rotateY(Math.PI));
  sink.add(pbrMaterial(`wf-birdbath-${glaze}-basin`, glazeSet(glaze, 'basin', BASIN), extra), lathe(pts(BASIN), 1.0, 96).rotateY(Math.PI));

  // Still water: clear and shallow over the glazed floor, mirroring the sky.
  const water = new THREE.Mesh(new THREE.CircleGeometry(WATER_R * IN, 64).rotateX(-Math.PI / 2).translate(0, WATER_Y * IN, 0),
    plainMaterial('wf-birdbath-water', { color: '#1d2b2a', roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.72 }));
  water.renderOrder = 2;
  sink.object(water);
  c.act({ key: 'fill', label: 'Water', words: ['Full', 'Empty'], anchors: [c.anchor(0, WATER_Y * IN, 0)], on: true, planOn: true, set(on) {
    water.visible = on;
  } });
}
