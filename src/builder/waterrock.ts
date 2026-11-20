import * as THREE from 'three';
import { featureOption, type FeatureSpec } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import type { FeaturePlacement } from '../siteplan/types';
import { BOULDER_MAX_SEGMENTS, CANYON_CUT, MOSS_ROCK_CANYON, MOSS_ROCK_GRAY, MOSS_ROCK_SPACING, mossRock, mossRockMaterial, type MossRockCut, type MossRockForm, type MossRockLook } from './mossrock';
import { libraryRockById } from '../siteplan/waterrocks';
import type { Quality } from '../engine/post';
import { footSink, type GroundAt } from './stonegeo';
import { DOUBLE_HEAD_FORM, GARDEN_BOULDER_FORM, MOSS_BOULDER, SHOWPIECE_FORM, borderLook } from './groundrock-looks';
import { BOULDER_BURIED, BORDER_BURIED } from '../siteplan/groundrock';
import { rng } from '../siteplan/geometry';

/*
 * Moss rock and Canyon Tech boulders (siteplan/waterrocks.ts) and the moss rock sold by weight (siteplan/groundrock.ts):
 * each one its own shape, seeded by the placement's id, set partly into the ground. All are drawn in fine detail by
 * builder/mossrock.ts (broken, chipped, porous stone with crust lichen, matched to Green Lion's job photos and the moss
 * rock Northern California yards sell), each in its own stone: tan-brown or dark gray moss rock; the Canyon Tech warm
 * gray and tan, angular (more and crisper breaks, the wedge and ridge forms), with rust-orange lichen and little moss;
 * the moss rock by weight in the light tan-gray of a customer job's finished yard (builder/groundrock-looks.ts).
 */

/** `capped`: a stone drawn in many places in a yard, its segments capped for big sizes (BOULDER_MAX_SEGMENTS). */
type Style = { form: MossRockForm | ((h: number) => MossRockForm); look?: MossRockLook | ((h: number) => MossRockLook); buried?: number; seed?: string; cut?: MossRockCut; capped?: boolean };

/** A Canyon Tech boulder's form: mostly a wedge or a ridge, now and then a blocky rounded one. `h` is in [0, 1). */
const canyonForm = (h: number): MossRockForm => (h < 0.42 ? 'wedge' : h < 0.8 ? 'ridge' : 'rounded');

/** Each boulder's build: a moss rock form and look (builder/mossrock.ts), a fixed choice or one drawn per placement. */
const STYLE: Record<string, Style> = {
  'moss-rock-rounded': { form: 'rounded' },
  'moss-rock-tall': { form: 'tall' },
  'moss-rock-flat-top': { form: 'flat' },
  'moss-rock-rounded-gray': { form: 'rounded', look: MOSS_ROCK_GRAY },
  'moss-rock-tall-gray': { form: 'tall', look: MOSS_ROCK_GRAY },
  'moss-rock-flat-top-gray': { form: 'flat', look: MOSS_ROCK_GRAY },
  'canyon-tech-boulder': { form: canyonForm, look: MOSS_ROCK_CANYON, cut: CANYON_CUT, capped: true },
  // Moss rock by weight (siteplan/groundrock.ts), in the tan-gray of a customer job's finished yard.
  'moss-rock-double-head': { form: DOUBLE_HEAD_FORM, look: borderLook, buried: BORDER_BURIED, capped: true },
  'moss-rock-garden-boulder': { form: GARDEN_BOULDER_FORM, look: MOSS_BOULDER, buried: BOULDER_BURIED, capped: true },
  'moss-rock-showpiece-boulder': { form: SHOWPIECE_FORM, look: MOSS_BOULDER, buried: BOULDER_BURIED, capped: true },
};

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

/** A library rock (siteplan/waterrocks.ts): one rock, its own seed, the same wherever it is placed. */
function libraryStyle(id: string): Style | undefined {
  const r = libraryRockById.get(id);
  return r ? { form: r.form, look: r.shade === 'gray' ? MOSS_ROCK_GRAY : undefined, seed: `library:${r.code}` } : undefined;
}

/** A boulder (a moss rock shape, a Canyon Tech boulder or moss rock by weight), set into the ground at the feature's spot. */
export function buildWaterRock(c: WaterRockContext) {
  const st = STYLE[c.spec.id] ?? libraryStyle(c.spec.id);
  if (!st) return;
  const size = featureSize(c.spec, c.f.size, 0.4);
  const buried = c.lift ? 0.04 : st.buried ?? 0.2, moss = featureOption(c.spec, c.f.options, 'moss');
  // A look or form drawn per placement takes the number the old build drew it from, so a saved rock keeps its stone.
  const look = typeof st.look === 'function' ? st.look(rng(`look:${c.f.id}`)()) : st.look;
  const form = typeof st.form === 'function' ? st.form(rng(`form:${c.f.id}`)()) : st.form;
  const q = c.quality ?? 'balanced';
  const geo = mossRock({ size, buried, seed: st.seed ?? c.f.id, moss, form, look, cut: st.cut, spacing: MOSS_ROCK_SPACING[q], maxSegments: st.capped ? BOULDER_MAX_SEGMENTS[q] : undefined });
  if (c.lift) geo.translate(0, c.lift, 0);
  else geo.translate(0, -footSink(c.ground, size[0], size[1], size[2] * 0.4), 0);
  c.add(mossRockMaterial(look), geo);
}
