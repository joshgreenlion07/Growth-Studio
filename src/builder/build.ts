import * as THREE from 'three';
import { featureById, plantById } from '../siteplan/catalog';
import { bounds, centroid, scatterInPolygon } from '../siteplan/geometry';
import { PointGrid, PolygonIndex, PolygonSet, SegmentGrid, inBounds } from '../siteplan/spatial';
import type { PlantPlacement, SitePlan, Vec2 } from '../siteplan/types';
import type { PlanarMirror } from '../engine/water';
import { WATER_LAYER_SKIP } from '../engine/water';
import type { Quality } from '../engine/post';
import { buildConstruction, type BuildStage, type ConstructionBuild } from './construction';
import { buildContext } from './context';
import { buildFeatures, type FeatureBuild, type NightLight } from './features';
import { buildGround, groundModel, WATER_LEVEL, type GroundModel } from './ground';
import { buildHardscape, stepsFootprint } from './hardscape';
import { lineCenter, lineThickness } from './linepath';
import { materialById } from '../siteplan/catalog';
import { buildModels, type ModelAssets } from './models';
import { buildPlants, type PlantLayer } from './plants';
import { poolLayout, type PoolLayout } from './pools';
import { buildStructures } from './structures';
import { buildTurf } from './turf';
import { buildPebbles, type PebbleBuild } from './pebbles';
import { buildHumus, type HumusBuild } from './humus';
import { buildWater, type WaterBuild } from './waterfeatures';

/** SitePlan in, a complete 3D yard out. */

export interface SceneBuild {
  root: THREE.Group;
  gm: GroundModel;
  /** Where each pool sits: its level, coping and the paving cut for it. */
  pools: PoolLayout;
  plants: PlantLayer;
  /** Beds of loose stone drawn stone by stone; update() picks each tile's detail for the camera. */
  pebbles: PebbleBuild;
  /** Black humus beds drawn crumb by crumb; update() picks each tile's detail for the camera. */
  humus: HumusBuild;
  water: WaterBuild;
  features: FeatureBuild;
  /** Uploaded-model files the plan names that have not arrived yet. */
  missingAssets: string[];
  /** Solid surfaces for autofocus and camera collision. */
  surfaces: THREE.Object3D[];
  nightLights: NightLight[];
  glow: THREE.MeshStandardMaterial[];
  /** Falling-water sheets that glow when lit at night. */
  fallMats: THREE.ShaderMaterial[];
  /** Expanded plant placements, including mass-planted beds. */
  plantCount: number;
  /** The yard as it is built: pits, trenches, pipes, base and bedding layers, marking paint and equipment. */
  construction: ConstructionBuild;
  /** Show one build stage. 'finished' (the default) is the finished yard. */
  setStage(stage: BuildStage): void;
  /**
   * Rebuild only the paving, walls, curbs, fences and steps for a plan that differs from the
   * built one in their looks alone (see hardscapeOnlyChange). The rest of the yard is kept.
   */
  restyleHardscape(plan: SitePlan): void;
  setYears(years: number): void;
  dispose(): void;
}

/** Fill beds that ask for mass planting, avoiding hand-placed plants and water. */
export function expandPlants(plan: SitePlan, gm: GroundModel): PlantPlacement[] {
  const out: PlantPlacement[] = [...plan.plants];
  const bodies = bodyGrid(lineBodies(plan));
  // Placed plants by position, so each candidate checks only its neighbors.
  const taken = new PointGrid(1);
  for (const q of out) taken.add(q.position[0], q.position[1]);
  for (const z of plan.zones) {
    if (!z.fill) continue;
    const spec = plantById.get(z.fill.catalogId);
    if (!spec) continue;
    const pts = scatterInPolygon(z.polygon, z.fill.spacing, `${z.id}-fill`, Math.min(z.fill.spacing * 0.4, 0.3));
    pts.forEach((p, i) => {
      if (gm.zoneAt(p) !== z) return;
      if (gm.inWater(p, 0.3)) return;
      if (bodies.grid.someWithin(p[0], p[1], bodies.maxHalf + 0.1, (k, d) => bodies.list[k].half > 0.05 && d < bodies.list[k].half + 0.1)) return;
      if (taken.anyWithin(p[0], p[1], z.fill!.spacing * 0.7)) return;
      out.push({ id: `${z.id}-fill-${i}`, catalogId: spec.id, position: p, source: z.source });
      taken.add(p[0], p[1]);
    });
  }
  return out;
}

/** Line bodies in a segment grid, tagged with their index in `list`. */
function bodyGrid(list: { a: Vec2; b: Vec2; half: number }[]) {
  return { list, grid: new SegmentGrid(list.map((s, tag) => ({ a: s.a, b: s.b, tag }))), maxHalf: list.reduce((m, s) => Math.max(m, s.half), 0) };
}

/** Every wall, fence, curb and edging segment where it is built (walls and curbs along their
    moved, mitered center line), with half its thickness. */
function lineBodies(plan: SitePlan): { a: Vec2; b: Vec2; half: number }[] {
  return plan.lines.flatMap((l) => {
    if (l.kind === 'steps') return [];
    const c = lineCenter(l, plan.zones), half = lineThickness(l) / 2;
    return c.slice(1).map((b, i) => ({ a: c[i], b, half }));
  });
}

/**
 * True when `next` differs from `prev` only in materials that change nothing outside the
 * paving and lines themselves: a paving area's material or border (same thickness), a wall,
 * curb, fence, edging or steps material (same body thickness), a wall cap or a fence topper.
 * Everything else that depends on those (pool levels, turf and planting clear of walls) then
 * stays as built.
 */
export function hardscapeOnlyChange(prev: SitePlan, next: SitePlan): boolean {
  if (prev.zones.length !== next.zones.length || prev.lines.length !== next.lines.length) return false;
  const thick = (id: string) => materialById.get(id)?.thickness ?? 0.07;
  // Something must have changed: the same plan again (a quality change, an uploaded model) needs a full build.
  let changed = false;
  for (let i = 0; i < prev.zones.length; i++) {
    const a = prev.zones[i], b = next.zones[i];
    if (a.border?.catalogId !== b.border?.catalogId) changed = true;
    if (a.catalogId === b.catalogId) continue;
    changed = true;
    if (a.kind !== 'hardscape' || b.kind !== 'hardscape' || thick(a.catalogId) !== thick(b.catalogId)) return false;
  }
  for (let i = 0; i < prev.lines.length; i++) {
    const a = prev.lines[i], b = next.lines[i];
    if (a.cap !== b.cap || a.topper !== b.topper) changed = true;
    if (a.catalogId === b.catalogId) continue;
    changed = true;
    if (a.kind !== b.kind || lineThickness(a) !== lineThickness(b)) return false;
  }
  if (!changed) return false;
  // Otherwise the two must match exactly.
  const strip = (p: SitePlan) =>
    JSON.stringify({
      ...p,
      zones: p.zones.map((z) => ({ ...z, catalogId: z.kind === 'hardscape' ? '' : z.catalogId, border: z.border && { ...z.border, catalogId: '' } })),
      lines: p.lines.map((l) => ({ ...l, catalogId: '', cap: undefined, topper: undefined })),
    });
  return strip(prev) === strip(next);
}

export function buildScene(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uNight: { value: number } }, assets: ModelAssets | null = null): SceneBuild {
  const root = new THREE.Group();
  root.name = 'yard';
  const gm = groundModel(plan);
  const ctx = buildContext(plan);
  const pools = poolLayout(plan, WATER_LEVEL);
  const ground = buildGround(plan, gm, quality, pools);
  const construction = buildConstruction(plan, ground.surface, quality);
  if (construction.cut) {
    ground.stage.uCut.value = construction.cut.texture;
    ground.stage.uCutBox.value.copy(construction.cut.box);
  }
  let hard = buildHardscape(plan, gm.height, pools);
  const siteC = centroid(plan.site.boundary);
  const structs = buildStructures([...plan.structures, ...ctx.neighbors], siteC);
  const water = buildWater(plan, gm, mirror, sky, pools);
  const features = buildFeatures(plan.features, gm.height);
  const models = buildModels(plan.models ?? [], gm.height, assets);

  const bodies = bodyGrid(lineBodies(plan));
  // Everything turf blades stay off, indexed once: they are tested for every blade.
  const structIdx = plan.structures.filter((s) => s.polygon.length >= 3).map((s) => new PolygonIndex(s.polygon));
  const stepsIdx = new PolygonSet(plan.lines.filter((l) => l.kind === 'steps').flatMap((l) => stepsFootprint(l, plan.zones)));
  const modelIdx = new PolygonSet((plan.models ?? []).map((m) => m.polygon));
  const blocked = (p: Vec2) => {
    if (gm.inWater(p, 0.2)) return true;
    const z = gm.zoneAt(p);
    if (z && z.kind !== 'turf') return true;
    for (const s of structIdx) if (inBounds(s.box, p[0], p[1], 0.05) && (s.contains(p[0], p[1]) || s.dist(p[0], p[1], 0.05) < 0.05)) return true;
    if (stepsIdx.any(p[0], p[1])) return true;
    if (bodies.grid.someWithin(p[0], p[1], Math.max(0.06, bodies.maxHalf + 0.05), (k, d) => d < Math.max(0.06, bodies.list[k].half + 0.05))) return true;
    if (modelIdx.any(p[0], p[1])) return true;
    for (const f of plan.features) {
      const spec = featureById.get(f.catalogId);
      if (!spec || spec.kind === 'pergolaWood' || spec.kind === 'pergolaLouvered' || spec.kind === 'pathLight' || spec.kind === 'spotLight' || spec.kind === 'puttingCup' || spec.kind === 'umbrella') continue;
      if (Math.hypot(p[0] - f.position[0], p[1] - f.position[1]) < Math.max(...spec.footprint) * 0.55) return true;
    }
    return false;
  };
  const turf = buildTurf(plan, gm, quality, blocked);
  const pebbles = buildPebbles(plan, gm, quality);
  const humus = buildHumus(plan, gm, ground.surface, quality);

  const placements = [...expandPlants(plan, gm), ...ctx.trees];
  // Plants show in water reflections only near water: the reflection of one farther off is
  // small or hidden. Water boxes are padded by three times the plant's height (4 m at least).
  const waterBoxes = plan.water.map((w) => {
    const pts = w.polygon ?? w.points ?? [];
    return pts.length ? { b: bounds(pts), pad: (w.width ?? 0) / 2 } : null;
  }).filter((x) => !!x);
  const reflects = (p: Vec2, h: number) => waterBoxes.some(({ b, pad }) => inBounds(b, p[0], p[1], pad + Math.max(4, h * 3)));
  // Shadow map texel size, as Studio.fitShadow frames the sun's view and applyQuality sizes the map.
  const sb = bounds(plan.site.boundary);
  const shadowTexel = (Math.hypot(sb.maxX - sb.minX, sb.maxY - sb.minY) + 20) / (quality === 'max' ? 4096 : quality === 'balanced' ? 2048 : 1024);
  const plants = buildPlants(placements, gm.height, quality !== 'draft', { lod: true, reflects, shadowTexel });

  root.add(ctx.object, ground.object, construction.object, hard.object, structs.object, water.object, features.object, models.object, plants.object);
  if (turf.object) {
    // Lawn blades are left out of reflections for speed.
    turf.object.layers.set(WATER_LAYER_SKIP);
    root.add(turf.object);
  }
  if (pebbles.object) {
    // Stones are left out of reflections too: a few centimeters each, they would only shimmer there.
    pebbles.object.traverse((o) => o.layers.set(WATER_LAYER_SKIP));
    root.add(pebbles.object);
  }
  if (humus.object) {
    // Crumbs are left out of reflections too: millimeters each, they would only shimmer there.
    humus.object.traverse((o) => o.layers.set(WATER_LAYER_SKIP));
    root.add(humus.object);
  }

  const nightLights: NightLight[] = [
    ...features.lights,
    ...water.lights,
    ...structs.porchLights.slice(0, 2).map((p) => ({ position: p, color: '#ffc27a', intensity: 3.5, distance: 7, flicker: false })),
  ];

  tagPointables(plan, [structs.object, water.object, features.object, models.object]);
  // The site ground carries lawn, beds and rock painted from the plan: the pointer asks the ground model which zone a hit is in.
  for (const g of ground.surfaces) g.userData.pointGround = true;
  const surfaces = [...ground.surfaces, ...hard.surfaces, ...structs.surfaces, ...features.surfaces, ...models.surfaces, ...plants.proxies];
  const glow = [...structs.glass, ...features.glow, ...hard.glow];

  // Build stages: before the yard is finished only plants that were already there (and the neighbors' trees) stand.
  // They are built the first time a stage asks for them.
  let stage: BuildStage = 'finished';
  let years = 3;
  let standing: PlantLayer | null = null;
  const applyStage = () => {
    const fin = stage === 'finished';
    hard.object.visible = fin;
    if (turf.object) turf.object.visible = fin;
    if (pebbles.object) pebbles.object.visible = fin;
    if (humus.object) humus.object.visible = fin;
    features.object.visible = fin;
    models.object.visible = fin;
    plants.object.visible = fin;
    if (!fin && !standing) {
      standing = buildPlants([...plan.plants.filter((p) => p.existing), ...ctx.trees], gm.height, quality !== 'draft', { reflects, shadowTexel });
      standing.object.name = 'plants-standing';
      standing.setYears(years);
      root.add(standing.object);
    }
    if (standing) standing.object.visible = !fin;
    ground.stage.uSoil.value = fin ? 0 : 1;
    const open = !construction.cut ? 0 : stage === 'trench' ? 2 : stage === 'excavate' || stage === 'backfill' || stage === 'base' || stage === 'bedding' ? 1 : 0;
    ground.stage.uCutCh.value.set(open === 1 ? 1 : 0, open === 2 ? 1 : 0);
    construction.setStage(stage);
  };

  return {
    root,
    gm,
    pools,
    plants,
    pebbles,
    humus,
    water,
    features,
    missingAssets: models.missing,
    surfaces,
    nightLights,
    glow,
    fallMats: [...water.fallMats, ...features.fallMats],
    plantCount: placements.length - ctx.trees.length,
    construction,
    setStage(s: BuildStage) {
      stage = s;
      applyStage();
    },
    restyleHardscape(next: SitePlan) {
      const old = hard;
      hard = buildHardscape(next, gm.height, pools);
      root.remove(old.object);
      root.add(hard.object);
      const swap = <T>(list: T[], from: T[], to: T[]) => {
        const keep = list.filter((x) => !from.includes(x));
        list.length = 0;
        list.push(...keep, ...to);
      };
      swap(surfaces, old.surfaces, hard.surfaces);
      swap(glow, old.glow, hard.glow);
      old.dispose();
      hard.object.visible = stage === 'finished';
    },
    setYears(y: number) {
      years = y;
      plants.setYears(y);
      standing?.setYears(y);
    },
    dispose() {
      ctx.dispose();
      ground.dispose();
      construction.dispose();
      standing?.dispose();
      pools.dispose();
      hard.dispose();
      structs.dispose();
      water.dispose();
      features.dispose();
      models.dispose();
      turf.dispose();
      pebbles.dispose();
      humus.dispose();
      plants.dispose();
    },
  };
}

/**
 * What the material pointer reports for built items that are not a catalog material's surface: each object that names
 * its plan item (userData.itemId) but no part gets one, with a `<kind>:<id>` catalogId (see pointKind in
 * siteplan/material-info.ts). Paving, walls, curbs, fences, steps and stepping stones tag themselves; lawn and beds
 * are found through the ground model, and plants through their proxies.
 */
function tagPointables(plan: SitePlan, roots: THREE.Object3D[]) {
  const what = new Map<string, [string, string]>();
  for (const s of plan.structures) what.set(s.id, ['structure', `structure:${s.kind}`]);
  for (const w of plan.water) what.set(w.id, ['water', `water:${w.kind}`]);
  for (const f of plan.features) what.set(f.id, ['feature', `feature:${f.catalogId}`]);
  for (const m of plan.models ?? []) what.set(m.id, ['model', `model:${m.kind}`]);
  for (const r of roots) r.traverse((o) => {
    const id = o.userData.itemId;
    if (typeof id !== 'string' || typeof o.userData.part === 'string') return;
    const w = what.get(id);
    if (!w) return;
    o.userData.part = w[0];
    o.userData.catalogId = w[1];
  });
}
