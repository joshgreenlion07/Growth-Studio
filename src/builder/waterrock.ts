import * as THREE from 'three';
import { featureOption, type FeatureSpec } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import type { FeaturePlacement } from '../siteplan/types';
import { ROCK_GRAIN_MEAN, rockGrainSet } from '../engine/rock-surfaces';
import { pbrMaterial } from './materials';
import { buildRock, footSink, type GroundAt, type RockLook, type RockShape } from './stonegeo';

/*
 * Moss rock and Canyon Tech boulders (siteplan/waterrocks.ts): each one its own shape (builder/stonegeo.ts), seeded by
 * the placement's id, set about a fifth into the ground. Colors are read from Green Lion's job photos of its falls and
 * beds: moss rock is buff, tan and brown with yellow-green moss on the tops, gray-green crust lichen and rust-orange
 * patches; the Canyon Tech boulder is warm gray and tan, more angular, with rust-orange lichen and little moss.
 */

const MOSS_LOOK: RockLook = {
  stone: ['#7d6849', '#634d35', '#8d7655', '#54453a', '#725f44'],
  streak: '#41362b',
  soil: '#3f3126',
  lichen: '#6f7864',
  lichenAmount: 0.75,
  rust: '#a8531f',
  rustAmount: 0.08,
  moss: ['#5c6828', '#435423'],
  mossAmount: 0.7,
};

const CANYON_LOOK: RockLook = {
  stone: ['#6c6e71', '#78726a', '#5c5e63', '#827868', '#67645e'],
  streak: '#4d4a47',
  soil: '#3f3126',
  lichen: '#b3b8aa',
  lichenAmount: 0.45,
  rust: '#9a5a2e',
  rustAmount: 0.6,
  moss: ['#6f7f3a', '#586b2f'],
  mossAmount: 0.15,
};

/** Blocky, split along flat planes, the corners worn a little: moss rock in its three shapes. */
const ROUNDED: RockShape = { squareness: 2.9, cuts: 6, cutDepth: [0.74, 0.92], edge: 0.07, lump: 0.05, rough: 0.025, pocket: 0.07, lean: 4 };
const TALL: RockShape = { squareness: 3.3, cuts: 7, cutDepth: [0.7, 0.9], edge: 0.06, lump: 0.045, rough: 0.025, pocket: 0.08, lean: 3 };
const FLAT: RockShape = { squareness: 4.6, cuts: 5, cutDepth: [0.78, 0.95], edge: 0.05, flatTop: [0.72, 0.05], lump: 0.04, rough: 0.02, pocket: 0.06, lean: 2 };
/** Crisper: more cuts, sharper edges. */
const CANYON: RockShape = { squareness: 3.6, cuts: 9, cutDepth: [0.64, 0.86], edge: 0.025, lump: 0.035, rough: 0.02, pocket: 0.05, lean: 4 };

const STYLE: Record<string, { shape: RockShape; look: RockLook }> = {
  'moss-rock-rounded': { shape: ROUNDED, look: MOSS_LOOK },
  'moss-rock-tall': { shape: TALL, look: MOSS_LOOK },
  'moss-rock-flat-top': { shape: FLAT, look: MOSS_LOOK },
  'canyon-tech-boulder': { shape: CANYON, look: CANYON_LOOK },
};

/** The one material every boulder shares: the grain texture, tinted by each rock's vertex colors (scaled up for the map's mean). */
export function boulderMaterial(): THREE.MeshStandardMaterial {
  const k = 1 / ROCK_GRAIN_MEAN;
  return pbrMaterial('boulder-grain', rockGrainSet(), { vertexColors: true, color: new THREE.Color().setRGB(k, k, k, THREE.LinearSRGBColorSpace) });
}

export interface WaterRockContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void;
  /** The top of paving the rock is set on (0 on turf, beds and bare ground). */
  lift?: number;
  /** The ground around the feature, for setting a boulder into a slope (see footSink). */
  ground?: GroundAt;
}

/**
 * One boulder's geometry in a catalog boulder's shape and look (`styleId`: a moss rock shape or the Canyon Tech boulder),
 * `size` length x depth x the height that shows, its foot at y 0, for features built of boulders (a boulder waterfall).
 */
export function boulderGeometry(styleId: string, size: [number, number, number], seed: string, moss: boolean, buried = 0.2): THREE.BufferGeometry {
  const st = STYLE[styleId] ?? STYLE['moss-rock-rounded'];
  return buildRock({ shape: st.shape, look: st.look, size, buried, seed, moss });
}

/** A boulder (a moss rock shape or a Canyon Tech boulder), set into the ground at the feature's spot. */
export function buildWaterRock(c: WaterRockContext) {
  const st = STYLE[c.spec.id];
  if (!st) return;
  const size = featureSize(c.spec, c.f.size, 0.4);
  const geo = buildRock({ shape: st.shape, look: st.look, size, buried: c.lift ? 0.04 : 0.2, seed: c.f.id, moss: featureOption(c.spec, c.f.options, 'moss') });
  if (c.lift) geo.translate(0, c.lift, 0);
  else geo.translate(0, -footSink(c.ground, size[0], size[1], size[2] * 0.4), 0);
  c.add(boulderMaterial(), geo);
}
