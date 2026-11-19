import * as THREE from 'three';
import type { FeatureSpec } from '../../siteplan/catalog';
import type { FeaturePlacement, Vec2 } from '../../siteplan/types';
import { fbm, smooth, vnoise, voronoi } from '../../engine/noise';
import { mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import type { FeatureAction } from '../actions';

/*
 * Shared pieces for the side-yard builders (siteplan/yard.ts): what a builder is handed, a few shape helpers in local
 * feature space (front +z, meters, base at y = 0), and the surfaces the product sheets show: charcoal resin with a
 * fine woodgrain, walnut woodcast door boards, a ribbed black roof, oiled honey hardwood, knotty western red cedar,
 * and a matte brown pot. Every texture is painted here; none is an image.
 */

export { box, rbox, bar, V, IN } from '../decor/kit';

export interface YardContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  /** Add a static part (merged per material). */
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void;
  /** A night light at a local point. */
  light: (x: number, y: number, z: number, color: string, intensity: number, distance: number) => void;
  /** A material that glows at night; the build owns it. */
  glow: (m: THREE.MeshStandardMaterial) => void;
  /** A hinged part turning about a local pivot: its group, and adders taking local geometry and points. */
  hinge: (px: number, py: number, pz: number) => { group: THREE.Group; add: (m: THREE.Material, g: THREE.BufferGeometry) => void; anchor: (x: number, y: number, z: number) => THREE.Object3D };
  /** Something to use by hand (doors): registered for this placement. */
  act: (a: Omit<FeatureAction, 'itemId'>) => void;
  /** An action's anchor at a local point on the fixed part. */
  anchor: (x: number, y: number, z: number) => THREE.Object3D;
  /** A plant standing on the piece (a pot's jasmine): local point, and its heading in the piece's frame. */
  plant: (catalogId: string, x: number, y: number, z: number, heading?: number) => void;
  /** The placement's choice for one of the catalog's on/off options. */
  option: (key: string) => boolean;
}

/** Swap a geometry's UVs (u <-> v): box UVs run the grain along u; a vertical piece wants it along v. */
export function swapUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    uv.setXY(i, uv.getY(i), u);
  }
  return g;
}

/**
 * A prism: a plan outline (local x, z, meters, either winding) from y0 up to y1. Top and bottom UVs are x, z in meters;
 * the sides run along the outline and up.
 */
export function prism(outline: Vec2[], y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  const out = g.toNonIndexed();
  g.dispose();
  out.computeVertexNormals();
  return out;
}

/**
 * A panel whose outline is drawn in a vertical plane (local z across, y up), `t` thick across x and centered on x.
 * Its broad faces get z, y UVs in meters (grain along u runs horizontal).
 */
export function sidePanel(outline: Vec2[], t: number, x: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  // Shape x -> local z, extrusion -> local -x.
  g.rotateY(-Math.PI / 2);
  g.translate(x + t / 2, 0, 0);
  const out = g.toNonIndexed();
  g.dispose();
  out.computeVertexNormals();
  return out;
}

/** A cylinder from a to b, radius r (local points). */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g.toNonIndexed();
}

const set = (key: string, make: () => PBRSet) => () => textureSet(`yard:${key}`, make);
/** A hex color as the painted texture stores it (sRGB, 0 to 1). */
export const srgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const lin = srgb;

/**
 * Suncast's Iron Ore resin: a charcoal gray molded with a fine horizontal woodgrain (long streaks, a few deeper grain
 * lines), the board faces very slightly mottled. Satin.
 */
export const resinIronOre = set('resin-iron-ore', () =>
  paint(512, 0.8, 1.4, (u, v) => {
    const streak = vnoise(u * 4, v * 160, 4, 51) * 0.6 + vnoise(u * 12, v * 480, 12, 52) * 0.4;
    const line = smooth(0.78, 0.92, vnoise(u * 2, v * 96, 2, 53));
    const cloud = fbm(u, v, 3, 3, 54);
    let c = mulRGB(lin('#3d3934'), 0.9 + streak * 0.16 + (cloud - 0.5) * 0.08);
    c = mulRGB(c, 1 - line * 0.25);
    return { h: 0.5 + streak * 0.3 - line * 0.35, c, r: 0.62 + streak * 0.08 };
  }),
);

/**
 * Suncast's Walnut woodcast: molded resin door boards in a warm mid walnut brown with a vertical grain, cathedral
 * figure here and there, and a V groove between boards. The tile is one door leaf: six boards across (u), grain up (v).
 */
export const BOARDS_PER_TILE = 6;
export const walnutWoodcast = set('walnut-woodcast', () =>
  paint(1024, 0.7733, 1.6, (u, v) => {
    const k = Math.floor(u * BOARDS_PER_TILE), lu = u * BOARDS_PER_TILE - k;
    const groove = Math.min(lu, 1 - lu);
    const g1 = vnoise(u * 72 + k * 3.1, v * 6, 72, 61) * 0.55 + vnoise(u * 216, v * 18, 216, 62) * 0.45;
    // Cathedral figure: bands bent into arches up the board.
    const arch = Math.sin((v * 9 + Math.pow(Math.abs(lu - 0.5) * 2, 2) * 1.6 + k * 0.37) * Math.PI * 2);
    const fig = smooth(0.55, 1, arch) * 0.5;
    let c: RGB = mixRGB(lin('#8a6849'), lin('#6a4a2f'), g1 * 0.7 + fig * 0.4);
    c = mulRGB(c, 0.94 + ((k * 7) % 5) * 0.03);
    const inGroove = groove < 0.02;
    if (inGroove) c = mulRGB(c, 0.45);
    return { h: inGroove ? 0.05 + groove * 8 : 0.7 + g1 * 0.1, c, r: 0.58 + g1 * 0.1 };
  }),
);

/** The black lean-to roof panel: a fine molded texture, faintly streaked down the slope. */
export const roofBlack = set('roof-black', () =>
  paint(256, 0.6, 1.2, (u, v) => {
    const n = vnoise(u * 90, v * 90, 90, 71);
    const s = vnoise(u * 3, v * 60, 3, 72);
    return { h: n * 0.4 + s * 0.2, c: mulRGB(lin('#1f2022'), 0.92 + n * 0.1 + s * 0.05), r: 0.55 + n * 0.1 };
  }),
);

/**
 * Oiled acacia (teak tone), as the bench photo: warm honey orange with darker brown grain lines and streaks, a few
 * paler and darker boards. Grain along u.
 */
export const honeyHardwood = set('honey-hardwood', () =>
  paint(512, 0.9, 1.4, (u, v) => {
    const g1 = vnoise(u * 6, v * 180, 6, 81);
    const g2 = vnoise(u * 18, v * 540, 18, 82);
    const band = smooth(0.7, 0.95, vnoise(u * 3, v * 72, 3, 83));
    const cloud = fbm(u, v, 3, 3, 84);
    let c: RGB = mixRGB(lin('#c08a4c'), lin('#9a6430'), g1 * 0.6 + g2 * 0.3);
    c = mixRGB(c, lin('#6e4320'), band * 0.45);
    c = mulRGB(c, 0.92 + cloud * 0.14);
    return { h: 0.5 + g2 * 0.25 - band * 0.2, c, r: 0.55 + g1 * 0.1 };
  }),
);

/**
 * New western red cedar boards, as the raised bed sheet: orange-tan with salmon and honey streaks, darker grain
 * lines, and small dark knots. Grain along u.
 */
export const cedarKnotty = set('cedar-knotty', () =>
  paint(1024, 1.2, 1.6, (u, v) => {
    // Knots: a few small dark ovals the grain bends around.
    const kn = voronoi(u, v, 8, 91);
    const kd = Math.hypot(kn.dx * 0.45, kn.dy * 1.4);
    const knot = kn.id > 0.88 ? 1 - smooth(0.04, 0.1, kd) : 0;
    const bend = kn.id > 0.88 ? Math.exp(-kd * 5) * 0.5 * Math.sign(kn.dy) : 0;
    const g1 = vnoise(u * 8, (v + bend * 0.02) * 240, 8, 92);
    const g2 = vnoise(u * 24, (v + bend * 0.02) * 720, 24, 93);
    const streak = fbm(u * 0.25, v, 4, 3, 94);
    let c: RGB = mixRGB(lin('#c47a45'), lin('#9e5a2e'), g1 * 0.55 + g2 * 0.25);
    c = mixRGB(c, lin('#d18f58'), smooth(0.55, 0.8, streak) * 0.5);
    // A darker ring round each knot, then the knot.
    c = mixRGB(c, lin('#8a5228'), (1 - smooth(0.07, 0.16, kd)) * (kn.id > 0.88 ? 0.5 : 0));
    c = mixRGB(c, lin('#4a2612'), knot * 0.9);
    return { h: 0.5 + g2 * 0.2 - knot * 0.3, c, r: 0.78 + g1 * 0.08 };
  }),
);

/** The tall pot's finish: a smooth matte milk-chocolate brown with the faintest mottle, fiberglass or resin. */
export const potBrown = set('pot-brown', () =>
  paint(256, 0.6, 0.6, (u, v) => {
    const n = fbm(u, v, 4, 4, 101), f = vnoise(u * 160, v * 160, 160, 102);
    return { h: f * 0.2, c: mulRGB(lin('#6e5440'), 0.95 + n * 0.08 + f * 0.03), r: 0.74 };
  }),
);

/** Planting soil in a raised bed: dark brown, crumbly, with small clods, a few lighter specks and bits of bark. */
export const plantingSoil = set('planting-soil', () =>
  paint(512, 0.8, 2.2, (u, v) => {
    const clod = voronoi(u, v, 60, 111);
    const lump = 1 - smooth(0.1, 0.6, clod.f1);
    const fine = vnoise(u * 240, v * 240, 240, 112), cloud = fbm(u, v, 4, 4, 113);
    let c: RGB = mixRGB(lin('#3a2a1e'), lin('#271b12'), cloud * 0.7 + (1 - lump) * 0.3);
    if (clod.id > 0.93) c = mixRGB(c, lin('#6a4e34'), lump * 0.6);
    if (fine > 0.95) c = mixRGB(c, lin('#8a7a66'), 0.5);
    return { h: lump * 0.6 + fine * 0.2, c: mulRGB(c, 0.92 + fine * 0.1), r: 0.95 };
  }),
);

export const yardMat = {
  bedSoil: () => pbrMaterial('yard:planting-soil', plantingSoil()),
  resin: () => pbrMaterial('yard:resin-iron-ore', resinIronOre()),
  walnut: () => pbrMaterial('yard:walnut-woodcast', walnutWoodcast()),
  roof: () => pbrMaterial('yard:roof-black', roofBlack()),
  hardwood: () => pbrMaterial('yard:honey-hardwood', honeyHardwood()),
  cedar: () => pbrMaterial('yard:cedar-knotty', cedarKnotty()),
  pot: () => pbrMaterial('yard:pot-brown', potBrown()),
  plinth: () => plainMaterial('yard:plinth', { color: '#1b1c1e', roughness: 0.7 }),
  inside: () => plainMaterial('yard:shed-inside', { color: '#3a3632', roughness: 0.95 }),
  iron: () => plainMaterial('yard:black-iron', { color: '#151516', roughness: 0.45, metalness: 0.6 }),
  screw: () => plainMaterial('yard:screw', { color: '#3a3530', roughness: 0.5, metalness: 0.7 }),
  soil: () => plainMaterial('yard:bed-soil', { color: '#2e231b', roughness: 1 }),
  badge: () => plainMaterial('yard:pot-badge', { color: '#c9c2b6', roughness: 0.4, metalness: 0.3 }),
};
