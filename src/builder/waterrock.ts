import * as THREE from 'three';
import { featureOption, type FeatureSpec } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import type { FeaturePlacement } from '../siteplan/types';
import { ROCK_GRAIN_MEAN, rockGrainSet } from '../engine/rock-surfaces';
import { pbrMaterial } from './materials';
import { MOSS_ROCK_GRAY, MOSS_ROCK_SPACING, mossRock, mossRockMaterial, type MossRockLook, type MossRockSpec } from './mossrock';
import type { Quality } from '../engine/post';
import { buildRock, footSink, type GroundAt, type RockLook, type RockShape } from './stonegeo';
import { BORDER_STONE, GARDEN_BOULDER, MOSS_BOULDER, SHOWPIECE, borderLook } from './groundrock-looks';
import { BOULDER_BURIED, BORDER_BURIED } from '../siteplan/groundrock';
import { rng } from '../siteplan/geometry';

/*
 * Moss rock and Canyon Tech boulders (siteplan/waterrocks.ts): each one its own shape, seeded by the placement's id, set
 * about a fifth into the ground. The three moss rock shapes of the water features are drawn in fine detail
 * (builder/mossrock.ts: broken, chipped, porous tan-brown stone with pale yellow-green crust lichen, matched to Green
 * Lion's job photos and the moss rock Northern California yards sell). The Canyon Tech boulder and the moss rock sold by
 * weight (siteplan/groundrock.ts) use builder/stonegeo.ts: the Canyon Tech is warm gray and tan, more angular, with
 * rust-orange lichen and little moss.
 */

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

/** Crisper: more cuts, sharper edges. */
const CANYON: RockShape = { squareness: 3.6, cuts: 9, cutDepth: [0.64, 0.86], edge: 0.025, lump: 0.035, rough: 0.02, pocket: 0.05, lean: 4 };

type Style = { shape: RockShape; look: RockLook | ((h: number) => RockLook); buried?: number } | { form: NonNullable<MossRockSpec['form']>; look?: MossRockLook; buried?: number };

/** Each boulder's build: a moss rock form (builder/mossrock.ts), or a shape and look for builder/stonegeo.ts. */
const STYLE: Record<string, Style> = {
  'moss-rock-rounded': { form: 'rounded' },
  'moss-rock-tall': { form: 'tall' },
  'moss-rock-flat-top': { form: 'flat' },
  'moss-rock-rounded-gray': { form: 'rounded', look: MOSS_ROCK_GRAY },
  'moss-rock-tall-gray': { form: 'tall', look: MOSS_ROCK_GRAY },
  'moss-rock-flat-top-gray': { form: 'flat', look: MOSS_ROCK_GRAY },
  'canyon-tech-boulder': { shape: CANYON, look: CANYON_LOOK },
  // Moss rock by weight (siteplan/groundrock.ts), in the tan-gray of a customer job's finished yard.
  'moss-rock-double-head': { shape: BORDER_STONE, look: borderLook, buried: BORDER_BURIED },
  'moss-rock-garden-boulder': { shape: GARDEN_BOULDER, look: MOSS_BOULDER, buried: BOULDER_BURIED },
  'moss-rock-showpiece-boulder': { shape: SHOWPIECE, look: MOSS_BOULDER, buried: BOULDER_BURIED },
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
  /** The yard's quality: how fine a moss rock's mesh is. */
  quality?: Quality;
}

/** A boulder (a moss rock shape or a Canyon Tech boulder), set into the ground at the feature's spot. */
export function buildWaterRock(c: WaterRockContext) {
  const st = STYLE[c.spec.id];
  if (!st) return;
  const size = featureSize(c.spec, c.f.size, 0.4);
  const buried = c.lift ? 0.04 : st.buried ?? 0.2, moss = featureOption(c.spec, c.f.options, 'moss');
  let geo: THREE.BufferGeometry, mat: THREE.Material;
  if ('form' in st) {
    geo = mossRock({ size, buried, seed: c.f.id, moss, form: st.form, look: st.look, spacing: MOSS_ROCK_SPACING[c.quality ?? 'balanced'] });
    mat = mossRockMaterial(st.look);
  } else {
    const look = typeof st.look === 'function' ? st.look(rng(`look:${c.f.id}`)()) : st.look;
    geo = buildRock({ shape: st.shape, look, size, buried, seed: c.f.id, moss });
    mat = boulderMaterial();
  }
  if (c.lift) geo.translate(0, c.lift, 0);
  else geo.translate(0, -footSink(c.ground, size[0], size[1], size[2] * 0.4), 0);
  c.add(mat, geo);
}
