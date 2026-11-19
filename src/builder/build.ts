import * as THREE from 'three';
import { beginMaterialBuild } from './materials';
import { featureById, plantById } from '../siteplan/catalog';
import { bounds, centroid, scatterInPolygon } from '../siteplan/geometry';
import { PointGrid, PolygonIndex, PolygonSet, SegmentGrid, inBounds } from '../siteplan/spatial';
import type { PlantPlacement, SitePlan, Vec2 } from '../siteplan/types';
import type { PlanarMirror } from '../engine/water';
import { WATER_LAYER_SKIP } from '../engine/water';
import type { Quality } from '../engine/post';
import { buildConstruction, buildEquipment, type BuildStage, type ConstructionBuild } from './construction';
import { buildContext } from './context';
import { buildFeatures, type FeatureBuild, type NightLight } from './features';
import type { LandLight } from '../engine/landlights';
import { fixtureSite } from './landscapelights';
import { groundModel, groundSteps, WATER_LEVEL, type GroundModel } from './ground';
import { buildHardscape, stepsFootprint, zoneTop } from './hardscape';
import { onDecks } from './deck';
import { isBoardDeck } from '../siteplan/deckzone';
import { lineCenter, lineThickness } from './linepath';
import { materialById } from '../siteplan/catalog';
import { buildModels, type ModelAssets } from './models';
import { buildPlants, lodGeometry, speciesGeometry, type PlantLayer } from './plants';
import { plantGround, planterPlants } from './decor/planters';
import { coverCeiling } from './decor/patio';
import { CEILING_KINDS } from '../siteplan/decor';
import { poolSteps, type PoolLayout } from './pools';
import { buildStructures } from './structures';
import { COVER_FLOOR_TOP, coverFloorAt } from './coverfloor';
import { buildTurf } from './turf';
import { buildPebbles, type PebbleBuild } from './pebbles';
import { buildHumus, type HumusBuild } from './humus';
import { buildWater, type WaterBuild } from './waterfeatures';
import { cancelTextureGeneration, newTextureGeneration, textureDemand } from '../engine/textures';
import { deferLeafTextures, finishLeafTextures } from './species/kit';

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
  /** Landscape lighting fixtures' beams (engine/landlights.ts). */
  landLights: LandLight[];
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
   * Build the stage views now, hidden (they are otherwise built the first time a stage asks for them), so a later
   * stage change only shows and hides.
   */
  prepareStages(): void;
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
  // Planted features (corten planters) bring their own plants.
  const out: PlantPlacement[] = [...plan.plants, ...planterPlants(plan.features)];
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

/** True when `p` is inside a placed feature's footprint (width x depth, turned by rotationDeg as features.ts turns it), padded. */
function inFootprint(p: Vec2, at: Vec2, rotationDeg: number, [w, d]: [number, number], pad: number): boolean {
  // features.ts places local (x, z) at (x cos a + z sin a, -x sin a + z cos a), a = -rotation; this is its inverse.
  const a = (-rotationDeg * Math.PI) / 180, dx = p[0] - at[0], dy = p[1] - at[1];
  const lx = dx * Math.cos(a) - dy * Math.sin(a), lz = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad;
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

type SkyUniforms = { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uNight: { value: number } };

/** Build a yard in one go (the main thread is busy until it is done). */
export function buildScene(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: SkyUniforms, assets: ModelAssets | null = null): SceneBuild {
  const steps = sceneSteps(plan, quality, mirror, sky, assets);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

export interface BuildSliceOptions {
  /** True once the result is no longer wanted (a newer plan came): the build stops at its next pause and gives null. */
  stale?: () => boolean;
  /** Main-thread time per slice. */
  budgetMs?: number;
  /** The build stage the yard opens at: anything but 'finished' builds the construction views as part of the build. */
  stage?: BuildStage;
}

/**
 * Build a yard a few milliseconds at a time, so the yard on screen keeps drawing (and the page keeps responding)
 * while the next one is built. Each step of the build (the ground, the paving, one plant species...) runs whole;
 * between steps the build pauses whenever its slice is used up, and waits for a frame when one is due.
 */
export async function buildSceneAsync(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: SkyUniforms, assets: ModelAssets | null, opts: BuildSliceOptions = {}): Promise<SceneBuild | null> {
  const budget = opts.budgetMs ?? 8;
  const meta = { gen: 0 };
  const steps = sceneSteps(plan, quality, mirror, sky, assets, opts.stage, meta);
  const frames = frameClock();
  const t0 = performance.now();
  const timing: [string, number][] = [];
  try {
    let slice = performance.now();
    for (;;) {
      const a = performance.now();
      const r = steps.next();
      timing.push([r.done ? 'finish' : r.value, Math.round(performance.now() - a)]);
      if (r.done) {
        // For the console and tests: each step's main-thread time, and the whole build's.
        (globalThis as { __gsBuild?: unknown }).__gsBuild = { ms: Math.round(performance.now() - t0), longest: timing.reduce((m, x) => (x[1] > m[1] ? x : m), ['', 0]), steps: timing };
        return r.value;
      }
      if (performance.now() - slice < budget) continue;
      await frames.pause();
      if (opts.stale?.()) {
        steps.return(undefined as never);
        // Paint jobs only this build asked for are not painted ahead of the newer build's.
        cancelTextureGeneration(meta.gen);
        return null;
      }
      slice = performance.now();
    }
  } catch (e) {
    cancelTextureGeneration(meta.gen);
    throw e;
  } finally {
    frames.stop();
  }
}

/**
 * Pauses between build slices: a frame is let through when one is due (16 ms or more since the last), otherwise the
 * build goes on at once after other waiting tasks. A hidden page draws no frames: then it never waits for one.
 */
function frameClock() {
  let last = performance.now();
  let on = true;
  let raf = 0;
  const tick = () => {
    last = performance.now();
    if (on) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  const queue: (() => void)[] = [];
  if (channel) channel.port1.onmessage = () => queue.shift()?.();
  const soon = () =>
    new Promise<void>((res) => {
      if (!channel) return void setTimeout(res, 0);
      queue.push(res);
      channel.port2.postMessage(0);
    });
  return {
    pause(): Promise<void> {
      const since = performance.now() - last;
      // No frame due yet, or none coming (a hidden page or panel draws none): go on at once.
      if (since < 16 || since > 100 || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return soon();
      const seen = last;
      return new Promise<void>((res) => {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          res();
        };
        const wait = () => (last !== seen ? go() : requestAnimationFrame(() => setTimeout(go, 0)));
        wait();
        setTimeout(go, 50);
      });
    },
    stop() {
      on = false;
      cancelAnimationFrame(raf);
      channel?.port1.close();
    },
  };
}

/** The build, step by step: each `yield` is a place it may pause. */
function* sceneSteps(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: SkyUniforms, assets: ModelAssets | null, openStage: BuildStage = 'finished', meta: { gen: number } = { gen: 0 }): Generator<string, SceneBuild, void> {
  // Sets this yard asks for are painted before any asked for earlier.
  beginMaterialBuild();
  meta.gen = newTextureGeneration();
  const root = new THREE.Group();
  root.name = 'yard';
  const gm = groundModel(plan);
  const ctx = buildContext(plan);
  yield 'context';
  const pools = yield* poolSteps(plan, WATER_LEVEL);
  yield 'pools';
  const ground = yield* groundSteps(plan, gm, quality, pools);
  yield 'ground';
  // The stage shown (see setStage below) and the plants' age.
  let stage: BuildStage = 'finished';
  let years = 3;
  // The construction views (pits, trenches, pipes, base and bedding) are built the first time a stage or the cutaway
  // asks for them; the finished yard shows only the utility equipment.
  const equip = buildEquipment(plan, ground.surface);
  const constructionRoot = new THREE.Group();
  constructionRoot.name = 'construction';
  if (equip.object) constructionRoot.add(equip.object);
  let built: ConstructionBuild | null = null;
  const site = (): ConstructionBuild => {
    if (built) return built;
    const c = buildConstruction(plan, ground.surface, quality, false);
    built = c;
    constructionRoot.add(c.object);
    // New meshes join the yard's layers as the rest did (shadows): the caller re-tags after setStage.
    if (c.cut) {
      ground.stage.uCut.value = c.cut.texture;
      ground.stage.uCutBox.value.copy(c.cut.box);
    }
    c.setStage(stage);
    return c;
  };
  const construction: ConstructionBuild = {
    object: constructionRoot,
    get cut() {
      return built ? built.cut : null;
    },
    get labels() {
      return built ? built.labels : [];
    },
    get notes() {
      return site().notes;
    },
    setStage(st: BuildStage) {
      if (st !== 'finished' || built) site().setStage(st);
    },
    section(st: BuildStage, plane: THREE.Plane) {
      return site().section(st, plane);
    },
    dispose() {
      built?.dispose();
      equip.dispose();
    },
  };
  if (openStage !== 'finished') {
    site();
    yield 'construction';
  }
  let hard = buildHardscape(plan, gm.height, pools);
  yield 'hardscape';
  const siteC = centroid(plan.site.boundary);
  const structs = buildStructures([...plan.structures, ...ctx.neighbors], siteC, plan);
  yield 'structures';
  const water = buildWater(plan, gm, mirror, sky, pools);
  // Features and models placed on a composite deck stand on its boards (a hot tub is set into it); lighting
  // fixtures also stand on paving and snap to wall faces (builder/landscapelights.ts).
  const standOn = onDecks(plan, gm.height);
  // Decor set on paving stands on its top too (paving is drawn its thickness above grade); decks are in standOn.
  // Where a cover's concrete floor shows (nothing drawn over it), it stands on the floor.
  // Lighting fixtures also stand on paving and snap to wall faces (builder/landscapelights.ts).
  const onFloor = coverFloorAt(plan.structures, plan);
  const pavingTop = (p: Vec2) => {
    const z = gm.zoneAt(p);
    if (z && z.kind === 'hardscape') return isBoardDeck(z) ? 0 : zoneTop(z, plan.zones.indexOf(z));
    return onFloor(p) ? COVER_FLOOR_TOP : 0;
  };
  const features = buildFeatures(plan.features, standOn, coverCeiling(plan.structures), pavingTop, fixtureSite(plan, standOn));
  const models = buildModels(plan.models ?? [], standOn, assets);
  yield 'water, features, models';

  const bodies = bodyGrid(lineBodies(plan));
  // Everything turf blades stay off, indexed once: they are tested for every blade.
  // A cover blocks them only where its posts and walls stand and where its concrete floor shows: turf drawn for
  // the cover (which replaces the floor) grows under the roof.
  const structIdx = [...plan.structures.filter((s) => s.kind !== 'cover' && s.polygon.length >= 3).map((s) => s.polygon), ...structs.solids].map((poly) => new PolygonIndex(poly));
  const stepsIdx = new PolygonSet(plan.lines.filter((l) => l.kind === 'steps').flatMap((l) => stepsFootprint(l, plan.zones)));
  const modelIdx = new PolygonSet((plan.models ?? []).map((m) => m.polygon));
  const blocked = (p: Vec2) => {
    if (gm.inWater(p, 0.2)) return true;
    if (onFloor(p)) return true;
    const z = gm.zoneAt(p);
    if (z && z.kind !== 'turf') return true;
    for (const s of structIdx) if (inBounds(s.box, p[0], p[1], 0.05) && (s.contains(p[0], p[1]) || s.dist(p[0], p[1], 0.05) < 0.05)) return true;
    if (stepsIdx.any(p[0], p[1])) return true;
    if (bodies.grid.someWithin(p[0], p[1], Math.max(0.06, bodies.maxHalf + 0.05), (k, d) => d < Math.max(0.06, bodies.list[k].half + 0.05))) return true;
    if (modelIdx.any(p[0], p[1])) return true;
    for (const f of plan.features) {
      const spec = featureById.get(f.catalogId);
      if (!spec || spec.kind === 'pergolaWood' || spec.kind === 'pergolaLouvered' || spec.kind === 'pathLight' || spec.kind === 'spotLight' || spec.kind === 'puttingCup' || spec.kind === 'umbrella' || (CEILING_KINDS as readonly string[]).includes(spec.kind)) continue;
      // The long water features and the bowls clear only their own footprint (a circle would bald the lawn around it).
      if (spec.kind === 'pillarFountain' || spec.kind === 'cedarWaterWall' || spec.kind === 'patinaBowl') {
        if (inFootprint(p, f.position, f.rotationDeg, spec.footprint, 0.05)) return true;
        continue;
      }
      // A feature set to its own size (a boulder, a planter) clears for that size, not the catalog's default.
      if (Math.hypot(p[0] - f.position[0], p[1] - f.position[1]) < Math.max(...(f.size ? [f.size[0], f.size[1]] : spec.footprint)) * 0.55) return true;
    }
    return false;
  };
  const turf = buildTurf(plan, gm, quality, blocked);
  yield 'turf';
  const pebbles = buildPebbles(plan, gm, quality, features.pebbleBeds);
  yield 'pebbles';
  const humus = buildHumus(plan, gm, ground.surface, quality);
  yield 'soil fills';

  // Plants that stand on features (bowl planters on a water feature's pillars) come with the features.
  const placements = [...expandPlants(plan, gm), ...ctx.trees, ...features.plants];
  yield 'placements';
  // Each species' model (and its lower-detail copies) is made once per session and kept: make the new ones a species
  // per step, so the plant layer below only places them.
  // A species' leaf textures are read back and color-bled in steps of their own (finishLeafTextures), so no single step
  // holds the page for long; they are all finished before the plants are placed.
  const species = new Set(placements.map((p) => p.catalogId));
  deferLeafTextures(true);
  try {
    for (const id of species) {
      const spec = plantById.get(id);
      if (!spec) continue;
      const geo = speciesGeometry(spec);
      yield `species ${id}`;
      yield* finishLeafTextures();
      for (const [g, part] of [[geo.leaves, 'leaf'], [geo.wood, 'wood'], [geo.flowers, 'flower']] as const) {
        if (!g) continue;
        lodGeometry(g, part, 1);
        lodGeometry(g, part, 2);
      }
      yield `plant detail ${id}`;
    }
    yield* finishLeafTextures();
  } finally {
    deferLeafTextures(false);
  }
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
  const plants = buildPlants(placements, plantGround(plan.features, gm.height, (p) => standOn(p) - gm.height(p) + pavingTop(p)), quality !== 'draft', { lod: true, reflects, shadowTexel });
  yield 'plants';

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

  // The studio has a small pool of point lights, filled in this order: fire, path and other feature lights, water,
  // porch, then shade structures (pergolas, gazebos) last, so a yard of pergolas cannot push the others out. A pergola
  // left without a light still shows its glowing LED strips.
  const nightLights: NightLight[] = [
    ...features.lights.filter((l) => !l.shade),
    ...water.lights,
    ...structs.porchLights.slice(0, 2).map((p) => ({ position: p, color: '#ffc27a', intensity: 3.5, distance: 7, flicker: false })),
    ...features.lights.filter((l) => l.shade),
  ];

  tagPointables(plan, [structs.object, water.object, features.object, models.object]);
  // The site ground carries lawn, beds and rock painted from the plan: the pointer asks the ground model which zone a hit is in.
  for (const g of ground.surfaces) g.userData.pointGround = true;
  const surfaces = [...ground.surfaces, ...hard.surfaces, ...structs.surfaces, ...features.surfaces, ...models.surfaces, ...plants.proxies];
  const glow = [...structs.glass, ...features.glow, ...hard.glow];

  // Build stages: before the yard is finished only plants that were already there (and the neighbors' trees) stand.
  // They are built the first time a stage asks for them.
  let standing: PlantLayer | null = null;
  const ensureStanding = () => {
    if (standing) return;
    standing = buildPlants([...plan.plants.filter((p) => p.existing), ...ctx.trees], gm.height, quality !== 'draft', { reflects, shadowTexel });
    standing.object.name = 'plants-standing';
    standing.setYears(years);
    standing.object.visible = stage !== 'finished';
    root.add(standing.object);
  };
  // Paving, walls, curbs and steps come in at Finished; fences stand through every stage (they are there
  // before the work starts and stay up during it).
  const showHard = () => {
    hard.object.visible = true;
    for (const c of hard.object.children) c.visible = stage === 'finished' || c.userData.lineKind === 'fence';
  };
  const applyStage = () => {
    const fin = stage === 'finished';
    showHard();
    for (const f of structs.floors) f.visible = fin;
    if (turf.object) turf.object.visible = fin;
    if (pebbles.object) pebbles.object.visible = fin;
    if (humus.object) humus.object.visible = fin;
    features.object.visible = fin;
    models.object.visible = fin;
    plants.object.visible = fin;
    if (!fin) ensureStanding();
    if (standing) standing.object.visible = !fin;
    ground.stage.uSoil.value = fin ? 0 : 1;
    const cut = fin ? null : site().cut;
    const open = !cut ? 0 : stage === 'trench' ? 2 : stage === 'excavate' || stage === 'backfill' || stage === 'base' || stage === 'bedding' ? 1 : 0;
    ground.stage.uCutCh.value.set(open === 1 ? 1 : 0, open === 2 ? 1 : 0);
    construction.setStage(stage);
  };

  const build: SceneBuild = {
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
    landLights: features.landLights,
    glow,
    fallMats: [...water.fallMats, ...features.fallMats],
    plantCount: placements.length - ctx.trees.length,
    construction,
    setStage(s: BuildStage) {
      stage = s;
      applyStage();
    },
    prepareStages() {
      // Asking for the notes builds the construction views (at the stage shown, so hidden at Finished).
      void construction.notes;
      ensureStanding();
    },
    restyleHardscape(next: SitePlan) {
      newTextureGeneration();
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
      showHard();
      // The colors this replaced are no longer drawn: their paint jobs are dropped.
      textureDemand(build, root);
    },
    setYears(y: number) {
      years = y;
      plants.setYears(y);
      standing?.setYears(y);
    },
    dispose() {
      textureDemand(build, null);
      // A yard dropped before it was shown (a newer plan came while it warmed up) leaves no paint jobs at the front.
      cancelTextureGeneration(meta.gen);
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
  textureDemand(build, root);
  return build;
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
