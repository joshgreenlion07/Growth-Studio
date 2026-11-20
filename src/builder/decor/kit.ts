import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FeatureSpec } from '../../siteplan/catalog';
import type { FeaturePlacement } from '../../siteplan/types';
import { clamp01, fbm, vnoise } from '../../engine/noise';
import { mixRGB, mulRGB, paint, textureSet, type PBRSet, type RGB } from '../../engine/textures';
import { boxUV, pbrMaterial, plainMaterial } from '../materials';
import type { FireStyle, Tongue } from '../fire';
import type { FeatureAction } from '../actions';

/*
 * Shared pieces for the decor builders: what a builder is handed, box helpers in local feature space (front +z,
 * meters, base at y = 0), and the surfaces the job photos show (weathering steel plate, charcoal concrete, cushion
 * fabric, wood-look panels, painted fence boards, natural cedar). Every texture is painted here; none is an image.
 */

export interface DecorContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  /** Add a part (merged per material). */
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void;
  /** A night light at a local point. */
  light: (x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker?: boolean) => void;
  /** A fire: flame tongues standing on a burner's shape (builder/fire.ts), lit at dusk and night. */
  fire: (tongues: Tongue[], style?: FireStyle) => void;
  /** A material that glows at night; the build owns it. */
  glow: (m: THREE.MeshStandardMaterial) => void;
  /** Ceiling height over the feature when it stands under a cover (meters above its ground), for ceiling-hung things. */
  ceiling?: number;
  /** How far the surface it stands on is above grade: the top of paving it is set on (0 on turf, beds and bare ground). */
  lift?: number;
  /** Something to use by hand (a heater's switch), registered for this placement. */
  act?: (a: Omit<FeatureAction, 'itemId'>) => void;
  /** An action's anchor at a local point. */
  anchor?: (x: number, y: number, z: number) => THREE.Object3D;
  /** A material made for this placement alone (a heater's elements, switched on and off): the build disposes of it. */
  own?: (m: THREE.Material) => void;
}

export const IN = 0.0254;

/** A box w x h x d with its base at y, centered on x, z. UVs in meters. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

/** A box with rounded edges (radius r), base at y. UVs in meters. */
export function rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number, seg = 3): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, rr));
  boxUV(g);
  g.translate(x, y + h / 2, z);
  return g.index ? g.toNonIndexed() : g;
}

/** A tube (square section s) from a to b in local space. */
export function bar(a: THREE.Vector3, b: THREE.Vector3, s: number, t = s): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.BoxGeometry(s, len, t);
  boxUV(g);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g.toNonIndexed();
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const set = (key: string, make: () => PBRSet) => () => textureSet(`decor:${key}`, make);

/**
 * Weathering steel plate after a few seasons, as on the job's planters and screen: an even rust orange with soft
 * darker clouds, fine speckle, and faint vertical run-off streaks. Satin, not glossy.
 */
export const cortenPlate = set('corten-plate', () =>
  paint(512, 1.0, 0.3, (u, v) => {
    const cloud = fbm(u, v, 3, 5, 11);
    const blot = fbm(u, v, 9, 3, 12);
    const fine = vnoise(u * 160, v * 160, 160, 3);
    // Faint run-off: a few soft, long, slightly darker drips, not a grain.
    const streak = Math.max(0, vnoise(u * 26, v * 1.5, 26, 7) - 0.75) * 0.18;
    let c = mixRGB([0.6, 0.34, 0.19], [0.47, 0.25, 0.14], clamp01(cloud * 1.3 - 0.2));
    c = mixRGB(c, [0.66, 0.4, 0.23], Math.max(0, blot - 0.62) * 1.2);
    c = mulRGB(c, 0.95 + fine * 0.08 - streak);
    return { h: cloud * 0.6 + fine * 0.15, c, r: 0.76 + fine * 0.1 };
  }),
);

/** Glass-fiber reinforced concrete in charcoal: an even dark gray with faint clouding, sand grain and pinholes. */
export const gfrcCharcoal = set('gfrc-charcoal', () =>
  paint(512, 0.6, 1.6, (u, v) => {
    const cloud = fbm(u, v, 3, 4, 21);
    const grain = vnoise(u * 300, v * 300, 300, 5);
    const pin = vnoise(u * 220, v * 220, 220, 9) > 0.965 ? 1 : 0;
    let c: RGB = mulRGB([0.272, 0.265, 0.255], 0.94 + cloud * 0.1 + grain * 0.04);
    if (pin) c = mulRGB(c, 0.85);
    return { h: grain * 0.5 - pin * 0.6, c, r: 0.82 + grain * 0.08 };
  }),
);

/** Solution-dyed acrylic cushion fabric, light warm gray, in a fine basket weave. */
export const cushionFabric = set('cushion-fabric', () =>
  paint(256, 0.12, 1.2, (u, v) => {
    const wx = Math.sin(u * Math.PI * 2 * 48), wy = Math.sin(v * Math.PI * 2 * 48);
    const weave = (wx > 0) !== (wy > 0) ? Math.abs(wx) : Math.abs(wy);
    const slub = vnoise(u * 24, v * 96, 24, 2);
    const c = mulRGB([0.55, 0.54, 0.515], 0.94 + weave * 0.06 + (slub - 0.5) * 0.04);
    return { h: weave, c, r: 0.95 };
  }),
);

/** Light wood-look panel (an HPL or resin teak look) in horizontal slats about 4 in wide with fine grooves. */
export const woodPanel = set('wood-panel', () =>
  paint(512, 0.61, 2, (u, v) => {
    const y = v * 0.61;
    const k = Math.floor(y / 0.1016);
    const ly = y - k * 0.1016;
    const groove = ly < 0.003;
    const grain = vnoise(u * 9 + k * 13, v * 160, 9, 4) * 0.6 + vnoise(u * 40, v * 400 + k * 7, 40, 6) * 0.4;
    let c = mixRGB([0.6, 0.53, 0.39], [0.51, 0.45, 0.32], grain);
    c = mulRGB(c, 0.96 + ((k * 37) % 5) * 0.012);
    if (groove) c = mulRGB(c, 0.72);
    return { h: groove ? 0.3 : 0.7 + grain * 0.3, c, r: 0.62 + grain * 0.1 };
  }),
);

/** Fence boards painted a medium cool gray: flat paint with the wood grain still showing faintly through it. */
export const paintedBoard = set('painted-board', () =>
  paint(512, 1.2, 1.6, (u, v) => {
    const grain = vnoise(u * 30, v * 200, 30, 15) * 0.6 + vnoise(u * 90, v * 600, 90, 16) * 0.4;
    const c = mulRGB([0.37, 0.373, 0.375], 0.96 + grain * 0.06);
    return { h: grain, c, r: 0.82 };
  }),
);

/**
 * One painted 1x6 board across one tile (5 1/2 in): the same paint, with its eased edges darker where paint pools and
 * the boards meet, so each board reads. A board box's face UVs run across it centered on 0, so its edges are the
 * middle of the tile.
 */
export const BOARD_TILE = 5.5 * IN;
export const paintedBoardFace = set('painted-board-face', () =>
  paint(256, BOARD_TILE, 1.4, (u, v) => {
    const grain = vnoise(u * 3, v * 40, 3, 17) * 0.6 + vnoise(u * 9, v * 120, 9, 18) * 0.4;
    const e = Math.abs(u - 0.5);
    const edge = e < 0.035 ? 0.62 + (e / 0.035) * 0.3 : 1;
    const c = mulRGB([0.37, 0.373, 0.375], (0.96 + grain * 0.06) * edge);
    return { h: e < 0.035 ? e / 0.035 : 1, c, r: 0.82 };
  }),
);

/** Natural (unpainted, lightly weathered) western red cedar: warm orange-tan with darker grain lines. */
export const cedarNatural = set('cedar-natural', () =>
  paint(512, 1.2, 2, (u, v) => {
    const g1 = vnoise(u * 14, v * 180, 14, 25);
    const g2 = vnoise(u * 60, v * 500, 60, 26);
    const cloud = fbm(u, v, 3, 3, 27);
    let c = mixRGB([0.66, 0.4, 0.23], [0.53, 0.31, 0.17], g1 * 0.6 + g2 * 0.4);
    c = mulRGB(c, 0.92 + cloud * 0.14);
    return { h: g1 * 0.6 + g2 * 0.4, c, r: 0.78 };
  }),
);

export const mat = {
  corten: () => pbrMaterial('decor:corten', cortenPlate()),
  cortenInside: () => pbrMaterial('decor:corten-inside', cortenPlate(), { color: new THREE.Color(0.72, 0.68, 0.66) }),
  gfrc: () => pbrMaterial('decor:gfrc', gfrcCharcoal()),
  fabric: () => pbrMaterial('decor:fabric', cushionFabric()),
  wood: () => pbrMaterial('decor:wood-panel', woodPanel()),
  painted: () => pbrMaterial('decor:painted-board', paintedBoard()),
  board: () => pbrMaterial('decor:painted-board-face', paintedBoardFace()),
  cedar: () => pbrMaterial('decor:cedar', cedarNatural()),
  whiteFrame: () => plainMaterial('decor:white-powder', { color: '#c9c8c3', roughness: 0.45, metalness: 0.1 }),
  soil: () => plainMaterial('planter-soil', { color: '#2b241f', roughness: 1 }),
  steelDark: () => plainMaterial('decor:steel-dark', { color: '#2d2724', roughness: 0.6, metalness: 0.5 }),
};
