import * as THREE from 'three';
import { featureById, plantById } from '../siteplan/catalog';
import { bounds, centroid, scatterInPolygon } from '../siteplan/geometry';
import { PointGrid, PolygonIndex, PolygonSet, SegmentGrid, inBounds } from '../siteplan/spatial';
import type { PlantPlacement, SitePlan, Vec2 } from '../siteplan/types';
import type { PlanarMirror } from '../engine/water';
import { WATER_LAYER_SKIP } from '../engine/water';
import type { Quality } from '../engine/post';
import { buildContext } from './context';
import { buildFeatures, type FeatureBuild, type NightLight } from './features';
import { buildGround, groundModel, WATER_LEVEL, type GroundModel } from './ground';
import { buildHardscape, stepsFootprint } from './hardscape';
import { lineCenter, lineThickness } from './linepath';
import { buildModels, type ModelAssets } from './models';
import { buildPlants, type PlantLayer } from './plants';
import { poolLayout, type PoolLayout } from './pools';
import { buildStructures } from './structures';
import { buildTurf } from './turf';
import { buildWater, type WaterBuild } from './waterfeatures';

/** SitePlan in, a complete 3D yard out. */

export interface SceneBuild {
  root: THREE.Group;
  gm: GroundModel;
  /** Where each pool sits: its level, coping and the paving cut for it. */
  pools: PoolLayout;
  plants: PlantLayer;
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

export function buildScene(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uNight: { value: number } }, assets: ModelAssets | null = null): SceneBuild {
  const root = new THREE.Group();
  root.name = 'yard';
  const gm = groundModel(plan);
  const ctx = buildContext(plan);
  const pools = poolLayout(plan, WATER_LEVEL);
  const ground = buildGround(plan, gm, quality, pools);
  const hard = buildHardscape(plan, gm.height, pools);
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

  const placements = [...expandPlants(plan, gm), ...ctx.trees];
  // Plants show in water reflections only near water: the reflection of one farther off is
  // small or hidden. Water boxes are padded by the plant's height a few times over.
  const waterBoxes = plan.water.map((w) => {
    const pts = w.polygon ?? w.points ?? [];
    return pts.length ? { b: bounds(pts), pad: (w.width ?? 0) / 2 } : null;
  }).filter((x) => !!x);
  const reflects = (p: Vec2, h: number) => waterBoxes.some(({ b, pad }) => inBounds(b, p[0], p[1], pad + Math.max(6, h * 4)));
  const plants = buildPlants(placements, gm.height, quality !== 'draft', { lod: true, reflects });

  root.add(ctx.object, ground.object, hard.object, structs.object, water.object, features.object, models.object, plants.object);
  if (turf.object) {
    // Lawn blades are left out of reflections for speed.
    turf.object.layers.set(WATER_LAYER_SKIP);
    root.add(turf.object);
  }

  const nightLights: NightLight[] = [
    ...features.lights,
    ...water.lights,
    ...structs.porchLights.slice(0, 2).map((p) => ({ position: p, color: '#ffc27a', intensity: 3.5, distance: 7, flicker: false })),
  ];

  return {
    root,
    gm,
    pools,
    plants,
    water,
    features,
    missingAssets: models.missing,
    surfaces: [...ground.surfaces, ...hard.surfaces, ...structs.surfaces, ...features.surfaces, ...models.surfaces, ...plants.proxies],
    nightLights,
    glow: [...structs.glass, ...features.glow, ...hard.glow],
    fallMats: [...water.fallMats, ...features.fallMats],
    plantCount: placements.length - ctx.trees.length,
    setYears(y: number) {
      plants.setYears(y);
    },
    dispose() {
      ctx.dispose();
      ground.dispose();
      pools.dispose();
      hard.dispose();
      structs.dispose();
      water.dispose();
      features.dispose();
      models.dispose();
      turf.dispose();
      plants.dispose();
    },
  };
}
