import * as THREE from 'three';
import { featureById, plantById } from '../siteplan/catalog';
import { centroid, distToEdge, pointInPolygon, scatterInPolygon } from '../siteplan/geometry';
import type { PlantPlacement, SitePlan, Vec2 } from '../siteplan/types';
import type { PlanarMirror } from '../engine/water';
import { WATER_LAYER_SKIP } from '../engine/water';
import type { Quality } from '../engine/post';
import { buildContext } from './context';
import { buildFeatures, type FeatureBuild, type NightLight } from './features';
import { buildGround, groundModel, type GroundModel } from './ground';
import { buildHardscape } from './hardscape';
import { buildPlants, type PlantLayer } from './plants';
import { buildStructures } from './structures';
import { buildTurf } from './turf';
import { buildWater, type WaterBuild } from './waterfeatures';

/** SitePlan in, a complete 3D yard out. */

export interface SceneBuild {
  root: THREE.Group;
  gm: GroundModel;
  plants: PlantLayer;
  water: WaterBuild;
  features: FeatureBuild;
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
  for (const z of plan.zones) {
    if (!z.fill) continue;
    const spec = plantById.get(z.fill.catalogId);
    if (!spec) continue;
    const pts = scatterInPolygon(z.polygon, z.fill.spacing, `${z.id}-fill`, Math.min(z.fill.spacing * 0.4, 0.3));
    pts.forEach((p, i) => {
      if (gm.zoneAt(p) !== z) return;
      if (gm.inWater(p, 0.3)) return;
      if (out.some((q) => Math.hypot(q.position[0] - p[0], q.position[1] - p[1]) < z.fill!.spacing * 0.7)) return;
      out.push({ id: `${z.id}-fill-${i}`, catalogId: spec.id, position: p, source: z.source });
    });
  }
  return out;
}

export function buildScene(plan: SitePlan, quality: Quality, mirror: PlanarMirror | null, sky: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uNight: { value: number } }): SceneBuild {
  const root = new THREE.Group();
  root.name = 'yard';
  const gm = groundModel(plan);
  const ctx = buildContext(plan);
  const ground = buildGround(plan, gm, quality);
  const hard = buildHardscape(plan, gm.height);
  const siteC = centroid(plan.site.boundary);
  const structs = buildStructures([...plan.structures, ...ctx.neighbors], siteC);
  const water = buildWater(plan, gm, mirror, sky);
  const features = buildFeatures(plan.features, gm.height);

  const blocked = (p: Vec2) => {
    if (gm.inWater(p, 0.2)) return true;
    const z = gm.zoneAt(p);
    if (z && z.kind !== 'turf') return true;
    for (const s of plan.structures) if (pointInPolygon(p, s.polygon) || distToEdge(p, s.polygon) < 0.05) return true;
    for (const l of plan.lines) {
      for (let i = 0; i < l.points.length - 1; i++) {
        const a = l.points[i], b = l.points[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (ll || 1)));
        if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < (l.kind === 'wall' ? 0.2 : 0.06)) return true;
      }
    }
    for (const f of plan.features) {
      const spec = featureById.get(f.catalogId);
      if (!spec || spec.kind === 'pergolaWood' || spec.kind === 'pergolaLouvered' || spec.kind === 'pathLight' || spec.kind === 'spotLight' || spec.kind === 'puttingCup' || spec.kind === 'umbrella') continue;
      if (Math.hypot(p[0] - f.position[0], p[1] - f.position[1]) < Math.max(...spec.footprint) * 0.55) return true;
    }
    return false;
  };
  const turf = buildTurf(plan, gm, quality, blocked);

  const placements = [...expandPlants(plan, gm), ...ctx.trees];
  const plants = buildPlants(placements, gm.height, quality !== 'draft');

  root.add(ctx.object, ground.object, hard.object, structs.object, water.object, features.object, plants.object);
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
    plants,
    water,
    features,
    surfaces: [...ground.surfaces, ...hard.surfaces, ...structs.surfaces, ...features.surfaces, ...plants.proxies],
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
      hard.dispose();
      structs.dispose();
      water.dispose();
      features.dispose();
      turf.dispose();
      plants.dispose();
    },
  };
}
