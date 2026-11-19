import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { featureById, featureOption, materialById, type FeatureKind, type MaterialSpec } from '../siteplan/catalog';
import { steppingOf, stoneLook, stoneOutline, stoneTop } from '../siteplan/stepping';
import { rng } from '../siteplan/geometry';
import type { FeaturePlacement, Vec2 } from '../siteplan/types';
import { cortenSet, flagFaceSet, padSet, porcelainPanelSet, slabSet } from '../engine/surfaces';
import { fallMaterial } from '../engine/water';
import { boxUV, catalogMaterial, pbrMaterial, plainMaterial } from './materials';
import { rockField, type RockSpot } from './rocks';
import type { LandLight } from '../engine/landlights';
import { FixtureMaterials, buildFixture, type FixtureSite } from './landscapelights';
import { buildSaunaLifeCL5G } from './saunalife-cl5g';
import { anchorAt, swing, swings, type FeatureAction } from './actions';
import { buildDecor } from './decor';
import { buildWaterRock } from './waterrock';
import { buildFlagstone, flagLookOf } from './flagstone';
import type { PebbleBed } from './pebbles';
import type { RaisedPlacement } from './plants';
import { patinaBowl, pillarFountain, type FountainSink } from './pillarfountain';
import { cedarWaterWall } from './cedarwaterwall';
import { calSpaTropicalPlus } from './spa-ppz743bc';
import { cazoFireWaterBowl } from './cazo-fire-water-bowl';
import { fireMaterial, fireMesh, lineBurner, ringBurner, tubeBurner, type FireStyle, type Tongue } from './fire';
import { buildFourFall, type FourFallInstance } from './fourfall';
import type { WaterfallGround } from './fourfall/waterfall-feature.js';
import type { Quality } from '../engine/post';

/**
 * Every placeable feature: fire, shade, kitchens, spas, saunas, water walls,
 * planters, screens, lighting and furniture. Built in local space with the
 * front facing +z, then placed and rotated from the SitePlan.
 */

export interface NightLight {
  position: THREE.Vector3;
  color: string;
  intensity: number;
  distance: number;
  flicker: boolean;
  /** A shade structure's light (pergola, gazebo): ranked after fire, water, porch and path lights for the light pool. */
  shade?: boolean;
  /** Switched off by hand in the 3D view (see FeatureBuild.actions): it gives up its place in the light pool. */
  off?: boolean;
  /** A four-fall waterfall's upper-fall light: ranked after fire, water and porch lights (each waterfall's two lowest come first). */
  extra?: boolean;
}

export interface FeatureBuild {
  object: THREE.Group;
  surfaces: THREE.Mesh[];
  lights: NightLight[];
  /** Landscape lighting fixtures' aimed beams (engine/landlights.ts), in world space. */
  landLights: LandLight[];
  /** Emissive parts that glow at night. */
  glow: THREE.MeshStandardMaterial[];
  flames: THREE.Mesh[];
  fallMats: THREE.ShaderMaterial[];
  /** Loose-stone beds that are part of a feature (a pebble basin), drawn stone by stone with the yard's pebbles. */
  pebbleBeds: PebbleBed[];
  /** Plants that stand on a feature (an agave in a bowl planter), placed with the yard's plants. */
  plants: RaisedPlacement[];
  /** What can be used by hand in the 3D view: doors, lids, fires, water, lights (see builder/actions.ts). */
  actions: FeatureAction[];
  /** Four-fall rock waterfalls (builder/fourfall.ts): the studio gives them the sky and ticks them every frame. */
  fourFalls: FourFallInstance[];
  dispose(): void;
}

type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
const IN_M = 0.0254;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

/**
 * A box whose every face starts its texture at its own corner (UVs in meters from 0): with a texture one slab across,
 * the top is exactly that one slab, edge to edge, and no joint of a paving pattern can cross it.
 */
function slabBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute, n = g.getAttribute('normal');
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const du = ny > 0.6 ? w / 2 : nx > 0.6 ? d / 2 : w / 2, dv = ny > 0.6 ? d / 2 : h / 2;
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  }
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 20): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

/** The flagstone texture's tile (surfaces.ts flagFaceSet), meters: each piece takes a part of it that holds it whole. */
const FLAG_TILE = 1.2;

/**
 * One natural flagstone piece: its outline (local meters, x and z) extruded to the stone's thickness with a small
 * broken bevel round the top and bottom edges, the top `top` above the local origin, tipped a fraction of a degree as
 * a set stone is, its face taken from its own spot on the stone's texture.
 */
function flagstonePiece(outline: Vec2[], flag: MaterialSpec, top: number, seed: string): THREE.BufferGeometry {
  const r = rng(`flagpiece:${seed}`);
  const t = (flag.flag?.thicknessIn ?? 2) * 0.0254;
  const bev = Math.min(0.005, t * 0.2);
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 1.2, bevelOffset: -bev * 1.2, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - (t - bev), 0);
  g.rotateX((r() - 0.5) * 0.012);
  g.rotateZ((r() - 0.5) * 0.012);
  // Its own part of the texture: a random spot that keeps the whole piece inside one tile (no seam crosses it).
  let reach = 0;
  for (const [x, z] of outline) reach = Math.max(reach, Math.abs(x), Math.abs(z));
  const room = Math.max(0, FLAG_TILE - 2 * reach - 0.02);
  const ou = reach + 0.01 + r() * room, ov = reach + 0.01 + r() * room;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov);
  g.computeVertexNormals();
  return g;
}

/** `site`: the finished surface and wall faces lighting fixtures stand on or snap to (builder/landscapelights.ts). */
export function buildFeatures(features: FeaturePlacement[], height: (p: Vec2) => number, ceiling?: (p: Vec2) => number | undefined, lift?: (p: Vec2) => number, site?: FixtureSite, quality: Quality = 'light', bedLook?: (f: FeaturePlacement) => WaterfallGround | null): FeatureBuild {
  const group = new THREE.Group();
  group.name = 'features';
  const surfaces: THREE.Mesh[] = [];
  const lights: NightLight[] = [];
  const landLights: LandLight[] = [];
  const fixtureMats = new FixtureMaterials();
  const flames: THREE.Mesh[] = [];
  const fallMats: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const rocks: RockSpot[] = [];
  const owned: THREE.Material[] = [];
  const pebbleBeds: PebbleBed[] = [];
  const raised: RaisedPlacement[] = [];
  const extraGlow: THREE.MeshStandardMaterial[] = [];
  const actions: FeatureAction[] = [];
  const fourFalls: FourFallInstance[] = [];

  // Shared materials.
  const mat = {
    cedar: catalogMaterial('wood-deck', { color: new THREE.Color('#ecdccb') }),
    teak: plainMaterial('teak', { color: '#a88765', roughness: 0.75 }),
    stone: catalogMaterial('wall-gray-block'),
    stacked: catalogMaterial('wall-stacked-stone'),
    ledge: catalogMaterial('wall-ledgestone'),
    darkLedge: catalogMaterial('wall-dark-stacked'),
    plaster: catalogMaterial('wall-plaster'),
    stucco: catalogMaterial('wall-stucco'),
    granite: plainMaterial('granite', { color: '#3a3532', roughness: 0.25, metalness: 0.05 }),
    graniteLight: plainMaterial('granite-light', { color: '#8a7f73', roughness: 0.3 }),
    steel: plainMaterial('stainless', { color: '#c4c8cc', roughness: 0.22, metalness: 0.95 }),
    black: plainMaterial('powder-black', { color: '#1d1d1e', roughness: 0.45, metalness: 0.5 }),
    alum: plainMaterial('alum-dark', { color: '#2c2d2f', roughness: 0.4, metalness: 0.6 }),
    bronze: plainMaterial('bronze', { color: '#3a2f27', roughness: 0.4, metalness: 0.75 }),
    brass: plainMaterial('brass', { color: '#8c7444', roughness: 0.35, metalness: 0.85 }),
    copper: plainMaterial('copper', { color: '#9a5a36', roughness: 0.35, metalness: 0.9 }),
    patina: plainMaterial('patina', { color: '#3f6e63', roughness: 0.55, metalness: 0.4 }),
    concrete: catalogMaterial('concrete-smooth'),
    glassFire: plainMaterial('fire-glass', { color: '#24384a', roughness: 0.1, metalness: 0.3 }),
    lava: plainMaterial('lava', { color: '#2a2422', roughness: 0.95 }),
    shell: plainMaterial('spa-shell', { color: '#d9dcdc', roughness: 0.2 }),
    spaCab: plainMaterial('spa-cabinet', { color: '#4a4542', roughness: 0.7 }),
    spaWater: plainMaterial('spa-water', { color: '#2f8aa0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }),
    saunaWood: plainMaterial('sauna-wood', { color: '#b5875c', roughness: 0.7 }),
    shingle: catalogMaterial('composite-gray', { color: new THREE.Color('#6a6a6a') }),
    glass: plainMaterial('sauna-glass', { color: '#1d2a30', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }),
    corten: pbrMaterial('corten', cortenSet()),
    porcelain: pbrMaterial('porcelainPanel', porcelainPanelSet()),
    pebble: catalogMaterial('black-pebble'),
    fabric: plainMaterial('fabric-gray', { color: '#8d8a84', roughness: 0.95 }),
    cushion: plainMaterial('cushion', { color: '#d8d2c6', roughness: 0.95 }),
    canvas: plainMaterial('umbrella', { color: '#e6dfd2', roughness: 0.9, side: THREE.DoubleSide }),
    soil: plainMaterial('planter-soil', { color: '#2b241f', roughness: 1 }),
    whiteMetal: plainMaterial('white-metal', { color: '#e9e9e6', roughness: 0.4, metalness: 0.2 }),
    grate: plainMaterial('grill-grate', { color: '#1a1a1a', roughness: 0.6, metalness: 0.6 }),
    inside: plainMaterial('cabinet-inside', { color: '#1b1b1c', roughness: 0.9 }),
  };
  const lampGlow = new THREE.MeshStandardMaterial({ color: '#f3e7cf', emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, roughness: 0.4 });
  const spaGlow = new THREE.MeshStandardMaterial({ color: '#7fd0e0', emissive: new THREE.Color('#5ec8ff'), emissiveIntensity: 0, roughness: 0.1, transparent: true, opacity: 0.85 });
  // LED strips in a louvered roof (SunVilla Stratus): a milky diffuser by day, a warm white line at night.
  const ledGlow = new THREE.MeshStandardMaterial({ color: '#aaa69f', emissive: new THREE.Color('#ffc890'), emissiveIntensity: 0, roughness: 0.5 });
  // SunVilla Stratus frame: aluminum with a matte, finely textured charcoal powder coat.
  const stratusFrame = plainMaterial('stratus-charcoal', { color: '#48494b', roughness: 0.66, metalness: 0.12 });
  owned.push(lampGlow, spaGlow, ledGlow);
  // Night glow of the decor builders (fire glass), owned by this build.
  const decorGlow: THREE.MeshStandardMaterial[] = [];
  // Glowing parts of maker products built in their own files (shared, cached materials: not disposed here).
  const makerGlow = new Set<THREE.MeshStandardMaterial>();
  const falls = fallMaterial();
  fallMats.push(falls);
  // Whether any water wall sheet uses the shared fall material (only then does it keep the view drawing every frame).
  let fallsUsed = false;

  for (let f of features) {
    const spec = featureById.get(f.catalogId);
    if (!spec) continue;
    if (spec.fixture && site) f = site.place(f, spec.fixture);
    const o = new THREE.Group();
    const parts: Parts = new Map();
    const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
      const list = parts.get(m) ?? [];
      list.push(g.index ? g.toNonIndexed() : g);
      parts.set(m, list);
    };
    const y0 = height(f.position);
    const local = (x: number, y: number, z: number) => {
      const a = (-f.rotationDeg * Math.PI) / 180;
      return new THREE.Vector3(f.position[0] + x * Math.cos(a) + z * Math.sin(a), y0 + y, f.position[1] - x * Math.sin(a) + z * Math.cos(a));
    };
    const shade = spec.group === 'Shade';
    const light = (x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker = false) =>
      lights.push({ position: local(x, y, z), color, intensity, distance, flicker, ...(shade ? { shade: true } : {}) });
    // Each feature's fire has its own flame material (one per style), so it can be lit or put out by hand on its own.
    const fireMats = new Map<FireStyle, THREE.ShaderMaterial>();
    const fire = (tongues: Tongue[], style: FireStyle = 'gas') => {
      let m = fireMats.get(style);
      if (!m) {
        m = fireMaterial(style);
        owned.push(m);
        fireMats.set(style, m);
      }
      const fl = fireMesh(tongues, m);
      // A grill burns only when it is lit by hand.
      if (style === 'grill') fl.userData.manual = true;
      geos.push(fl.geometry);
      o.add(fl);
      flames.push(fl);
    };
    const sheet = (w: number, h: number, x: number, y: number, z: number) => {
      fallsUsed = true;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), falls);
      s.position.set(x, y, z);
      s.renderOrder = 3;
      geos.push(s.geometry);
      o.add(s);
    };
    // Hinged parts (doors, lids): a group turning about its pivot (local point), with its own merged meshes.
    const hinges: [THREE.Group, Parts][] = [];
    const hinge = (px: number, py: number, pz: number) => {
      const g = new THREE.Group();
      g.position.set(px, py, pz);
      o.add(g);
      const hp: Parts = new Map();
      hinges.push([g, hp]);
      // Geometry is given in the feature's local space and moved into the hinge's.
      const hadd = (m: THREE.Material, geo: THREE.BufferGeometry) => {
        const list = hp.get(m) ?? [];
        list.push((geo.index ? geo.toNonIndexed() : geo).translate(-px, -py, -pz));
        hp.set(m, list);
      };
      const raw = (m: THREE.Material, geo: THREE.BufferGeometry) => {
        const list = hp.get(m) ?? [];
        list.push(geo.index ? geo.toNonIndexed() : geo);
        hp.set(m, list);
      };
      return { group: g, add: hadd, raw };
    };
    const act = (a: Omit<FeatureAction, 'itemId'>) => actions.push({ itemId: f.id, ...a });
    const lights0 = lights.length, flames0 = flames.length, falls0 = fallMats.length, glow0 = extraGlow.length;
    const r = rng(f.id);
    // What the water feature and bowl planter builders (pillarfountain.ts) hand back, in this feature's local space.
    const sink: FountainSink = {
      add,
      object(m) {
        o.add(m);
        if (m instanceof THREE.Mesh) geos.push(m.geometry);
      },
      light: (x, y, z, color, intensity, distance) => light(x, y, z, color, intensity, distance),
      glow: (m) => extraGlow.push(m),
      fall: (m) => fallMats.push(m),
      own: (m) => owned.push(m),
      pebbles(catalogId, outline, holes, topIn, tint) {
        const plan = (pts: Vec2[]): Vec2[] => pts.map(([x, z]) => {
          const w = local(x * IN_M, 0, z * IN_M);
          return [w.x, w.z];
        });
        pebbleBeds.push({ id: `${f.id}-pebbles-${pebbleBeds.length}`, catalogId, polygon: plan(outline), holes: holes.map(plan), y: y0 + topIn * IN_M, tint });
      },
      plant(catalogId, x, y, z, size) {
        const w = local(x, y, z);
        raised.push({ id: `${f.id}-plant-${raised.length}`, source: f.source, catalogId, position: [w.x, w.z], existing: true, scale: size, baseY: w.y, detail: 1 / size });
      },
    };
    const kind: FeatureKind = spec.kind;
    const [W, D] = spec.footprint;

    switch (kind) {
      case 'firePit': {
        const ring = new THREE.CylinderGeometry(0.62, 0.66, 0.4, 28, 1, true).translate(0, 0.2, 0);
        const inner = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 28, 1, true).translate(0, 0.2, 0);
        inner.scale(-1, 1, 1);
        const top = new THREE.RingGeometry(0.44, 0.68, 28, 1).rotateX(-Math.PI / 2).translate(0, 0.4, 0);
        for (const g of [ring, inner]) {
          const uv = g.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 0.4);
        }
        add(mat.stacked, ring);
        add(mat.stacked, inner);
        add(mat.graniteLight, top);
        add(mat.lava, cyl(0.46, 0.46, 0.18, 0, 0, 0, 24));
        // A 16 in ring burner under the lava rock.
        fire(ringBurner(0.2, 0.18, 0.5, f.id));
        light(0, 0.8, 0, '#ff9a4a', 9, 9, true);
        break;
      }
      case 'fireTable': {
        add(mat.alum, box(W, 0.5, D, 0, 0, 0));
        add(mat.granite, box(W + 0.04, 0.04, D + 0.04, 0, 0.5, 0));
        add(mat.glassFire, box(W * 0.62, 0.02, 0.18, 0, 0.53, 0));
        // A line burner down the middle of the glass channel.
        fire(lineBurner(W * 0.56, 0.54, 0.27, f.id, { across: 0.03 }));
        light(0, 0.75, 0, '#ff9a4a', 6, 7, true);
        break;
      }
      case 'pergolaWood': {
        const H = 2.7;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.cedar, box(0.15, H, 0.15, sx * (W / 2 - 0.15), 0, sz * (D / 2 - 0.15)));
        for (const sz of [-1, 1]) add(mat.cedar, box(W + 0.5, 0.24, 0.08, 0, H - 0.12, sz * (D / 2 - 0.15)));
        for (let x = -W / 2 - 0.1; x <= W / 2 + 0.1; x += 0.42) add(mat.cedar, box(0.06, 0.18, D + 0.5, x, H + 0.12, 0));
        for (let z = -D / 2; z <= D / 2; z += 0.3) add(mat.cedar, box(W + 0.3, 0.05, 0.05, 0, H + 0.3, z));
        break;
      }
      case 'pergolaLouvered': {
        if (spec.model === 'stratus') {
          const led = ledGlow.clone();
          owned.push(led);
          extraGlow.push(led);
          const own = lights.length;
          // Three poses: the old fixed 22 degrees (nothing chosen), fully open, closed flat. The planner keeps only on/off
          // options that differ from their defaults (both false here), so open and closed each have a key of their own.
          const start = featureOption(spec, f.options, 'louversOpen') ? 'open' : featureOption(spec, f.options, 'louversClosed') ? 'closed' : 'tilt';
          const st = stratusPergola(W, D, stratusFrame, led, add, light, o, start);
          for (const g of st.geos) geos.push(g);
          for (const c of o.children) if (c instanceof THREE.InstancedMesh) surfaces.push(c);
          const roofLights = lights.slice(own);
          // The two are told apart by where the aim is: the LED strips are the lights, the blades between them the louvers.
          const at = (xs: number[], y: number) => xs.flatMap((x) => [-1, 1].map((z) => anchorAt(o, x, y, z * st.span / 3)));
          actions.push({ itemId: f.id, key: 'louvers', label: 'Louvers', words: ['Open', 'Closed'], anchors: at(st.bladeXs, st.y), on: start === 'open', planOn: start === 'open', option: 'louversOpen',
            values: () => ({ louversOpen: st.state() === 'open', louversClosed: st.state() === 'closed' }), ...st.rig });
          act({ key: 'lights', label: 'Pergola lights', words: ['On', 'Off'], anchors: at(st.stripXs, st.y - 0.03), on: true, planOn: true, lights: true, set(on) {
            led.userData.off = !on;
            for (const l of roofLights) l.off = !on;
          } });
          break;
        }
        const H = 2.75;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.alum, box(0.18, H, 0.18, sx * (W / 2 - 0.09), 0, sz * (D / 2 - 0.09)));
        for (const sz of [-1, 1]) add(mat.alum, box(W, 0.26, 0.12, 0, H, sz * (D / 2 - 0.06)));
        for (const sx of [-1, 1]) add(mat.alum, box(0.12, 0.26, D, sx * (W / 2 - 0.06), H, 0));
        // Louvers, tilted half open.
        for (let x = -W / 2 + 0.2; x < W / 2 - 0.1; x += 0.2) {
          const g = new THREE.BoxGeometry(0.17, 0.02, D - 0.24);
          g.rotateZ(0.6);
          g.translate(x, H + 0.15, 0);
          add(mat.alum, g.toNonIndexed());
        }
        light(0, H - 0.1, 0, '#ffd1a0', 2.5, 6);
        break;
      }
      case 'gazebo': {
        const H = 2.5;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          add(mat.black, box(0.12, H, 0.12, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1)));
          add(mat.fabric, box(0.04, H - 0.2, 0.5, sx * (W / 2 - 0.12), 0.1, sz * (D / 2 - 0.4)));
        }
        add(mat.black, box(W, 0.12, D, 0, H, 0));
        const roof = new THREE.ConeGeometry(W * 0.78, 0.7, 4, 1).rotateY(Math.PI / 4).translate(0, H + 0.47, 0);
        add(mat.alum, roof.toNonIndexed());
        const cap = new THREE.ConeGeometry(W * 0.22, 0.25, 4, 1).rotateY(Math.PI / 4).translate(0, H + 0.95, 0);
        add(mat.alum, cap.toNonIndexed());
        light(0, H - 0.2, 0, '#ffd1a0', 2.2, 5);
        break;
      }
      case 'bistroSet': {
        add(mat.black, cyl(0.03, 0.03, 0.72, 0, 0, 0, 8));
        add(plainMaterial('mosaic', { color: '#c9a77d', roughness: 0.4 }), cyl(0.32, 0.32, 0.03, 0, 0.72, 0, 20));
        for (const a of [0.6, 0.6 + Math.PI]) {
          const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
          add(mat.black, box(0.4, 0.03, 0.4, x, 0.45, z));
          add(mat.black, box(0.04, 0.45, 0.04, x, 0, z));
          add(mat.black, box(0.4, 0.45, 0.03, x + Math.cos(a) * 0.2, 0.48, z + Math.sin(a) * 0.2).rotateY(0));
        }
        break;
      }
      case 'umbrella': {
        add(mat.black, cyl(0.025, 0.025, 2.4, 0, 0, 0, 8));
        add(mat.black, cyl(0.3, 0.3, 0.06, 0, 0, 0, 16));
        const cone = new THREE.ConeGeometry(W / 2, 0.55, 8, 1, true).translate(0, 2.25, 0);
        add(mat.canvas, cone.toNonIndexed());
        break;
      }
      case 'kitchenStraight':
      case 'kitchenL': {
        const depth = 0.75, Hc = 0.9;
        const runs: { x: number; z: number; w: number; d: number }[] = [{ x: 0, z: -(D - depth) / 2, w: W, d: depth }];
        if (kind === 'kitchenL') runs.push({ x: W / 2 - depth / 2, z: depth / 2 - 0.05, w: depth, d: D - depth + 0.1 });
        for (const rn of runs) {
          add(mat.stacked, box(rn.w, Hc, rn.d, rn.x, 0, rn.z));
          add(mat.granite, box(rn.w + 0.05, 0.04, rn.d + 0.05, rn.x, Hc, rn.z));
        }
        if (kind === 'kitchenL') {
          // Raised bar on the outside of the short leg.
          add(mat.stacked, box(0.22, 0.25, D - depth, W / 2 - 0.11, Hc + 0.04, depth / 2 - 0.05));
          add(mat.granite, box(0.45, 0.04, D - depth + 0.1, W / 2 + 0.06, Hc + 0.29, depth / 2 - 0.05));
        }
        const fz = -(D - depth) / 2 + depth / 2 + 0.005;
        // Grill: the firebox on the counter, its grate, and the hood hinged along its back top edge (lifts by hand).
        const gx = -W * 0.18, gz = -(D - depth) / 2, gd = depth * 0.85;
        grillFirebox(add, fire, light, mat, gx, Hc, gz, 0.85, 0.2, gd, f.id);
        const hood = hinge(gx, Hc + 0.2, gz - gd / 2);
        hood.add(mat.steel, box(0.86, 0.18, gd, gx, Hc + 0.2, gz));
        hood.add(mat.steel, new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8).rotateZ(Math.PI / 2).translate(gx, Hc + 0.3, gz + gd / 2 + 0.05).toNonIndexed());
        for (const sx of [-0.28, 0.28]) hood.add(mat.steel, box(0.02, 0.02, 0.05, gx + sx, Hc + 0.29, gz + gd / 2 + 0.025));
        act({ key: 'lid', label: 'Grill lid', words: ['Open', 'Closed'], anchors: [anchorAt(hood.group, 0, 0.1, gd)], on: false, planOn: false, ...swing(hood.group, 'x', -1.3, false) });
        // Doors: a pair under the grill, a cabinet and the fridge, hinged at their outer edges, opening out; a dark
        // inside shows behind each one when it is open.
        const leaf = (w: number, h: number, x0: number, y: number, hingeLeft: boolean) => {
          const hg = hinge(hingeLeft ? x0 : x0 + w, 0, fz);
          hg.add(mat.steel, box(w, h, 0.02, x0 + w / 2, y, fz));
          hg.add(mat.steel, box(0.02, h * 0.5, 0.025, hingeLeft ? x0 + w - 0.05 : x0 + 0.05, y + h * 0.25, fz + 0.02));
          add(mat.inside, box(w - 0.02, h - 0.02, 0.002, x0 + w / 2, y + 0.01, fz - 0.003));
          return swing(hg.group, 'y', hingeLeft ? -1.75 : 1.75, false);
        };
        const doorList = [leaf(0.4, 0.55, gx - 0.4, 0.15, true), leaf(0.4, 0.55, gx, 0.15, false), leaf(0.55, 0.65, W * 0.12 - 0.275, 0.1, false), leaf(0.42, 0.55, -W * 0.42 - 0.21, 0.15, true)];
        act({ key: 'doors', label: 'Kitchen doors', words: ['Open', 'Closed'], anchors: [anchorAt(o, gx, 0.42, fz), anchorAt(o, W * 0.12, 0.42, fz), anchorAt(o, -W * 0.42, 0.42, fz)], on: false, planOn: false, ...swings(doorList) });
        add(mat.steel, box(0.42, 0.15, 0.02, W * 0.36, 0.55, fz));
        add(mat.steel, box(0.42, 0.15, 0.02, W * 0.36, 0.35, fz));
        add(mat.steel, box(0.45, 0.03, 0.36, W * 0.25, Hc + 0.01, -(D - depth) / 2));
        add(mat.steel, cyl(0.012, 0.012, 0.3, W * 0.25, Hc, -(D - depth) / 2 - 0.22, 8));
        light(-W * 0.18, Hc + 0.6, -(D - depth) / 2 + 0.5, '#ffd1a0', 1.5, 4);
        break;
      }
      case 'hotTub': {
        if (spec.model === 'ppz-743bc') {
          const water = (m: THREE.Material, g: THREE.BufferGeometry) => {
            const w = new THREE.Mesh(g, m);
            w.renderOrder = 2;
            geos.push(g);
            o.add(w);
          };
          // Height of the ground or deck under a local point, relative to the spa's base (the steps stand on it).
          const under = (x: number, z: number) => {
            const p = local(x, 0, z);
            return height([p.x, p.z]) - y0;
          };
          const parts = new Map<string, THREE.Group>();
          const effects: THREE.Mesh[] = [];
          const sink = {
            add, water, under, light: (x: number, y: number, z: number, c: string, i: number, d: number) => light(x, y, z, c, i, d),
            part(key: string, pivot?: [number, number, number]) {
              const h = hinge(...(pivot ?? [0, 0, 0]));
              parts.set(key, h.group);
              return { add: h.add, object: h.group, own: (g: THREE.BufferGeometry, mesh?: THREE.Mesh) => { geos.push(g); if (mesh) surfaces.push(mesh); } };
            },
            effect(m: THREE.Mesh) {
              o.add(m);
              geos.push(m.geometry);
              effects.push(m);
              owned.push(m.material as THREE.Material);
            },
          };
          const own = lights.length;
          const spa = calSpaTropicalPlus(W, D, { cover: f.cover ?? 'open', steps: f.steps !== false }, sink);
          for (const g of spa.glow) makerGlow.add(g);
          // By hand: the cover, the jets (bubbles and steam) and the lights.
          const spaLights = lights.slice(own);
          const at = (list: [number, number, number][]) => list.map(([x, y, z]) => anchorAt(o, x, y, z));
          const c = spa.controls;
          if (c.cover) {
            const cv = c.cover;
            const openAt = at(cv.anchors(true)), closedAt = at(cv.anchors(false));
            const a: FeatureAction = { itemId: f.id, key: 'cover', label: 'Spa cover', words: ['Open', 'Closed'], anchors: cv.open ? openAt : closedAt, on: cv.open, planOn: cv.open, set(on, instant) {
              cv.set(on, instant);
              a.anchors = on ? openAt : closedAt;
            } };
            if (cv.tick) a.tick = cv.tick;
            actions.push(a);
          }
          act({ key: 'jets', label: 'Jets', words: ['On', 'Off'], anchors: at(c.jets.anchors), on: false, planOn: false, set: (on) => c.jets.set(on), frame: (dt) => c.jets.frame(dt) });
          const lightsSet = (on: boolean) => {
            c.lights.set(on);
            for (const l of spaLights) l.off = !on;
          };
          lightsSet(true);
          act({ key: 'lights', label: 'Spa lights', words: ['On', 'Off'], anchors: at(c.lights.anchors), on: true, planOn: true, lights: true, set: lightsSet });
          break;
        }
        const H = 0.92;
        add(mat.spaCab, box(W, H, D, 0, 0, 0));
        add(mat.shell, box(W + 0.04, 0.06, D + 0.04, 0, H, 0));
        const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.25, D - 0.25).rotateX(-Math.PI / 2).translate(0, H + 0.04, 0), spaGlow);
        geos.push(water.geometry);
        o.add(water);
        add(mat.shell, box(W - 0.6, 0.02, 0.35, 0, H - 0.1, D / 2 - 0.35));
        light(0, H + 0.3, 0, '#7fd8ff', 1.8, 3.5);
        break;
      }
      case 'saunaBarrel': {
        const R = W / 2, L = D;
        const barrel = new THREE.CylinderGeometry(R, R, L, 28, 1, true).rotateX(Math.PI / 2).translate(0, R + 0.12, 0);
        const uv = barrel.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * L);
        add(mat.saunaWood, barrel);
        const ends = [L / 2, -L / 2].map((z) => new THREE.CircleGeometry(R * 0.96, 28).translate(0, R + 0.12, z));
        add(mat.saunaWood, ends[1]);
        add(mat.glass, ends[0]);
        for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) add(mat.black, new THREE.TorusGeometry(R + 0.01, 0.015, 6, 32).translate(0, R + 0.12, z).toNonIndexed());
        for (const z of [-L / 2 + 0.35, L / 2 - 0.35]) add(mat.saunaWood, box(W * 0.9, 0.12, 0.12, 0, 0, z));
        add(mat.saunaWood, box(0.08, 1.7, 0.04, 0, 0.15, L / 2 + 0.01));
        light(0, 1.1, L / 2 + 0.3, '#ffcf8a', 1.4, 3);
        break;
      }
      case 'saunaCube': {
        if (spec.model === 'saunalife-cl5g') {
          const s = buildSaunaLifeCL5G({ doorOpen: featureOption(spec, f.options, 'doorOpen'), lightsOn: featureOption(spec, f.options, 'lightsOn') });
          for (const [m, g] of s.parts) add(m, g);
          for (const m of s.extras) {
            geos.push(m.geometry);
            o.add(m);
            surfaces.push(m);
          }
          const own = lights.length;
          for (const l of s.lights) light(l.x, l.y, l.z, l.color, l.intensity, l.distance);
          const saunaLights = lights.slice(own);
          owned.push(...s.owned);
          // The glass door on its hinge, and the LED bars with their switch inside: both can be used by hand.
          const d = hinge(s.door.pivot.x, s.door.pivot.y, s.door.pivot.z);
          for (const [m, g] of s.door.parts) d.raw(m, g);
          d.group.add(s.door.glass);
          geos.push(s.door.glass.geometry);
          surfaces.push(s.door.glass);
          const doorOpen = featureOption(spec, f.options, 'doorOpen'), lightsOn = featureOption(spec, f.options, 'lightsOn');
          act({ key: 'door', label: 'Sauna door', words: ['Open', 'Closed'], anchors: [s.door.handle, s.door.mid].map((p) => anchorAt(d.group, p.x, p.y, p.z)), on: doorOpen, planOn: doorOpen, option: 'doorOpen', ...swing(d.group, 'y', s.door.openAngle, doorOpen, 1.1) });
          const lightsSet = (on: boolean) => {
            s.setLights(on);
            for (const l of saunaLights) l.off = !on;
          };
          lightsSet(lightsOn);
          act({ key: 'lights', label: 'Sauna lights', words: ['On', 'Off'], anchors: s.lightAnchors.map((p) => anchorAt(o, p.x, p.y, p.z)), on: lightsOn, planOn: lightsOn, option: 'lightsOn', lights: true, set: lightsSet });
          break;
        }
        const Hh = 2.1;
        add(mat.saunaWood, box(W - 0.16, Hh - 0.2, D - 0.16, 0, 0.1, 0));
        // Rounded black frame: four corner posts and a perimeter frame.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat.black, cyl(0.1, 0.1, Hh, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1), 12));
        add(mat.black, box(W, 0.12, D, 0, Hh - 0.12, 0));
        add(mat.black, box(W, 0.1, D, 0, 0, 0));
        add(mat.shingle, box(W + 0.1, 0.06, D + 0.1, 0, Hh, 0));
        add(mat.glass, box(W - 0.3, Hh - 0.35, 0.02, 0, 0.12, D / 2 - 0.07));
        add(mat.black, box(0.04, Hh - 0.35, 0.03, 0, 0.12, D / 2 - 0.06));
        light(0, 1.2, D / 2 + 0.2, '#ffcf8a', 1.4, 3);
        break;
      }
      case 'waterWallPlaster': {
        // Two plaster columns, a split-face travertine panel with a sheer spillway,
        // copper spouts, copper bowls on top, black pebble basin with a charcoal border.
        const colW = 0.8, colH = 2.4, panelW = W - colW * 2 - 0.1;
        for (const sx of [-1, 1]) {
          add(mat.plaster, box(colW, colH, 0.7, sx * (W / 2 - colW / 2), 0, -D / 2 + 0.35));
          add(mat.patina, cyl(0.22, 0.32, 0.22, sx * (W / 2 - colW / 2), colH, -D / 2 + 0.35, 20));
          add(mat.soil, cyl(0.29, 0.29, 0.02, sx * (W / 2 - colW / 2), colH + 0.19, -D / 2 + 0.35, 16));
          add(mat.copper, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8).rotateX(Math.PI / 2).translate(sx * (panelW / 2 + 0.05), 0.9, -D / 2 + 0.78).toNonIndexed());
          sheet(0.05, 0.85, sx * (panelW / 2 + 0.05), 0.88, -D / 2 + 0.85);
        }
        add(mat.ledge, box(panelW, 2.0, 0.4, 0, 0, -D / 2 + 0.2));
        add(mat.copper, box(0.7, 0.04, 0.18, 0, 1.25, -D / 2 + 0.47));
        sheet(0.66, 1.18, 0, 1.24, -D / 2 + 0.56);
        add(mat.pebble, box(W - 0.2, 0.05, D - 0.75, 0, 0, D / 2 - (D - 0.75) / 2 - 0.1));
        for (const [w, d, x, z] of [[W, 0.15, 0, D / 2 - 0.075], [0.15, D - 0.6, -W / 2 + 0.075, 0.15], [0.15, D - 0.6, W / 2 - 0.075, 0.15]] as const) add(catalogMaterial('border-charcoal-wide'), box(w, 0.2, d, x, 0, z));
        light(0, 0.15, -D / 2 + 0.7, '#ffcf8a', 2.5, 3.5);
        break;
      }
      case 'waterWallPorcelain': {
        add(mat.alum, box(W, 1.9, 0.25, 0, 0, -D / 2 + 0.125));
        add(mat.porcelain, box(W - 0.12, 1.78, 0.02, 0, 0.06, -D / 2 + 0.26));
        add(mat.steel, box(W * 0.6, 0.03, 0.12, 0, 1.55, -D / 2 + 0.32));
        sheet(W * 0.58, 1.5, 0, 1.54, -D / 2 + 0.35);
        add(mat.pebble, box(W, 0.04, D - 0.3, 0, 0, 0.15));
        add(catalogMaterial('border-charcoal-wide'), box(W + 0.15, 0.18, 0.15, 0, 0, D / 2));
        light(0, 0.12, -D / 2 + 0.5, '#ffd8a8', 2, 3);
        break;
      }
      case 'waterWallStucco': {
        // Stucco side walls with up-down sconces, dark stacked-stone center, raised spill basin.
        const colW = 0.9, H = 2.2;
        for (const sx of [-1, 1]) {
          add(mat.stucco, box(colW, H, 0.6, sx * (W / 2 - colW / 2), 0, -D / 2 + 0.3));
          add(mat.black, cyl(0.04, 0.04, 0.32, sx * (W / 2 - colW / 2), 1.5, -D / 2 + 0.64, 10));
          light(sx * (W / 2 - colW / 2), 1.8, -D / 2 + 0.8, '#ffc27a', 1.6, 2.6);
          light(sx * (W / 2 - colW / 2), 1.3, -D / 2 + 0.8, '#ffc27a', 1.6, 2.6);
        }
        add(mat.darkLedge, box(W - colW * 2, H - 0.1, 0.4, 0, 0, -D / 2 + 0.2));
        add(mat.stucco, box(W - 0.2, 0.75, 0.55, 0, 0, -D / 2 + 0.75));
        add(mat.steel, box(0.55, 0.03, 0.1, 0, 1.4, -D / 2 + 0.44));
        sheet(0.52, 0.66, 0, 1.4, -D / 2 + 0.48);
        sheet(0.4, 0.62, 0, 0.72, -D / 2 + 1.04);
        add(mat.pebble, box(W - 0.3, 0.05, 0.5, 0, 0, D / 2 - 0.3));
        add(mat.concrete, box(W, 0.3, 0.12, 0, 0, D / 2 - 0.06));
        light(0, 0.3, -D / 2 + 1.1, '#ffcf8a', 2.4, 3);
        break;
      }
      case 'cortenScreen': {
        add(mat.corten, box(W, 1.8, 0.01, 0, 0.05, 0));
        add(mat.black, box(0.05, 1.9, 0.05, -W / 2, 0, 0));
        add(mat.black, box(0.05, 1.9, 0.05, W / 2, 0, 0));
        break;
      }
      case 'cortenPlanter': {
        add(mat.corten, box(W, 0.7, D, 0, 0, 0));
        add(mat.soil, box(W - 0.04, 0.02, D - 0.04, 0, 0.66, 0));
        break;
      }
      case 'cortenPlanterTall':
      case 'cortenTreePanel':
      case 'firePitLinear':
      case 'loungeSofa':
      case 'loungeOttoman':
      case 'deckBox':
      case 'diningSling':
      case 'patioHeater':
      case 'ceilingFan': {
        // Decor and furniture from a finished job (builder/decor/), drawn to its photos.
        buildDecor(kind, { f, spec, add, light, fire, glow: (m) => { owned.push(m); decorGlow.push(m); }, ceiling: ceiling?.(f.position), lift: lift?.(f.position) });
        break;
      }
      case 'mossRock':
      case 'canyonBoulder': {
        // Moss rock and Canyon Tech boulders (builder/waterrock.ts): each its own shape, set partly buried.
        buildWaterRock({ f, spec, add, lift: lift?.(f.position), ground: (x, z) => { const w = local(x, 0, z); return height([w.x, w.z]) - y0; } });
        break;
      }
      case 'flagLip':
      case 'flagLedge':
      case 'flagEdge': {
        // Flagstone pieces for water features (builder/flagstone.ts).
        buildFlagstone({ f, spec, add, piece: flagstonePiece, lift: lift?.(f.position), ground: (x, z) => { const w = local(x, 0, z); return height([w.x, w.z]) - y0; } });
        break;
      }
      case 'blackPlanter': {
        add(mat.black, box(W, 0.6, D, 0, 0, 0));
        add(mat.soil, box(W - 0.04, 0.02, D - 0.04, 0, 0.56, 0));
        break;
      }
      case 'copperBowl': {
        const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.12, 0), new THREE.Vector2(0.3, 0.04), new THREE.Vector2(0.37, 0.22), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.33, 0.29)], 24);
        add(mat.copper, bowl.toNonIndexed());
        add(mat.pebble, cyl(0.33, 0.33, 0.02, 0, 0.26, 0, 20));
        light(0.5, 0.05, 0.5, '#ffc27a', 1.2, 2);
        break;
      }
      case 'fourFall': {
        // The four-fall rock waterfall (builder/fourfall.ts): its own rock, soil, water and falls, in one module.
        // Set in a bed, the edge of its soil fades into the bed's color and meets the bed flush (fourfall.ts fourFallBed).
        const ff = buildFourFall(f, spec, quality, (x, z) => { const w = local(x, 0, z); return height([w.x, w.z]) - y0; }, bedLook?.(f) ?? null);
        o.add(ff.group);
        surfaces.push(...ff.surfaces);
        fourFalls.push(ff.inst);
        const wf = ff.inst.wf;
        // The two lowest falls' lights, nearest the patio, rank with the other feature lights; the two upper ones after
        // fire, water and porch lights, so a waterfall takes at most two places in a contested light pool (build.ts).
        const own = ff.lights.map((l, i) => {
          light(l.x, l.y, l.z, l.color, l.intensity, l.distance);
          const n = lights[lights.length - 1];
          if (i < ff.lights.length - 2) n.extra = true;
          return n;
        });
        // The pump: the falls and their spray stop, the pools go still (the pools keep their water).
        act({ key: 'water', label: 'Water', words: ['On', 'Off'], anchors: ff.falls.map((p) => anchorAt(o, p.x, p.y, p.z)), on: true, planOn: true, set(on) {
          wf.setFlowing(on);
        } });
        const lit = featureOption(spec, f.options, 'fallLights');
        const setLights = (on: boolean) => {
          ff.inst.lightsOn = on;
          for (const l of own) l.off = !on;
        };
        setLights(lit);
        act({ key: 'light', label: 'Fall lights', words: ['On', 'Off'], option: 'fallLights', anchors: ff.falls.map((p) => anchorAt(o, p.x, p.y - 0.4, p.z + 0.3)), on: lit, planOn: lit, lights: true, set: setLights });
        break;
      }
      case 'pillarFountain': {
        pillarFountain(sink, f.id, featureOption(spec, f.options, 'bowls'));
        break;
      }
      case 'cedarWaterWall': {
        cedarWaterWall(sink, f.id, featureOption(spec, f.options, 'pots'));
        break;
      }
      case 'fireWaterBowl': {
        cazoFireWaterBowl(sink, (t) => fire(t), (x, y, z, c, i, d) => light(x, y, z, c, i, d, true), f.id);
        break;
      }
      case 'patinaBowl': {
        patinaBowl(sink, f.id, 0, 0, 0, f.planted !== false);
        break;
      }
      case 'trellisCable': {
        for (const sx of [-1, 1]) add(mat.black, box(0.08, 2.0, 0.08, sx * W / 2, 0, 0));
        for (let k = 0; k < 6; k++) add(mat.steel, box(W, 0.006, 0.006, 0, 0.35 + k * 0.28, 0));
        break;
      }
      case 'trellisGrid': {
        for (let k = 0; k <= 4; k++) add(mat.black, box(0.02, 1.8, 0.02, -W / 2 + (k * W) / 4, 0.1, 0));
        for (let k = 0; k <= 8; k++) add(mat.black, box(W, 0.02, 0.02, 0, 0.1 + k * 0.22, 0));
        break;
      }
      case 'steppingPad': {
        add(catalogMaterial('concrete-smooth'), box(W, 0.06, D, 0, 0, 0));
        break;
      }
      case 'steppingStone': {
        const st = steppingOf(spec), look = materialById.get(stoneLook(f, spec))!;
        if (st.stone === 'slab') {
          // One 2 3/8 in slab, solid edge to edge (no joint crosses it), set into the ground with its top about half an
          // inch proud: its own single-slab texture, lined up so the stone's top is exactly one slab.
          const [wIn, dIn] = st.sizeIn;
          const key = wIn === 24 && dIn === 24 ? `slab:${look.id}` : `slab:${look.id}:${wIn}x${dIn}`;
          add(pbrMaterial(key, slabSet(look, wIn, dIn)), slabBox(W, 0.06, D, 0, stoneTop('slab') - 0.06, 0));
        } else if (st.stone === 'pad') {
          // A poured pad: 4 in of concrete in its line's finish and color, no saw cuts, the top 1 in above grade.
          const g = new THREE.BoxGeometry(W, 0.1, D).translate(0, stoneTop('pad') - 0.05, 0).toNonIndexed();
          boxUV(g);
          add(pbrMaterial(`pad:${look.id}`, padSet(look)), g);
        } else {
          add(pbrMaterial(`flag:${look.id}`, flagFaceSet(look)), flagstonePiece(stoneOutline(f, spec), look, stoneTop('flagstone'), f.id));
        }
        break;
      }
      case 'puttingCup': {
        add(mat.whiteMetal, cyl(0.055, 0.055, 0.01, 0, 0.005, 0, 16));
        add(plainMaterial('cup-hole', { color: '#0c0c0c', roughness: 1 }), cyl(0.05, 0.05, 0.012, 0, 0.006, 0, 16));
        break;
      }
      case 'boulder': {
        rocks.push({ x: f.position[0], y: y0 - 0.08, z: f.position[1], size: 1.0 + r() * 0.5, rot: (f.rotationDeg * Math.PI) / 180, seed: f.id });
        continue;
      }
      case 'pathLight': {
        add(mat.brass, cyl(0.02, 0.02, 0.55, 0, 0, 0, 10));
        const hat = new THREE.ConeGeometry(0.16, 0.1, 18, 1, true).translate(0, 0.62, 0);
        add(mat.brass, hat.toNonIndexed());
        const lampMat = lampGlow.clone();
        owned.push(lampMat);
        extraGlow.push(lampMat);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10).translate(0, 0.56, 0), lampMat);
        geos.push(lamp.geometry);
        o.add(lamp);
        light(0, 0.45, 0, '#ffc98a', 1.4, 3.5);
        break;
      }
      case 'spotLight': {
        add(mat.bronze, new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10).rotateX(-0.5).translate(0, 0.12, 0).toNonIndexed());
        add(mat.bronze, cyl(0.01, 0.01, 0.1, 0, 0, 0, 6));
        light(0, 0.4, -0.15, '#ffd29a', 3, 4);
        break;
      }
      case 'landscapeLight': {
        // A maker's lighting fixture (builder/landscapelights.ts): its body in the picked finish, a lens that glows
        // at night, and its beam(s), turned and placed with the feature.
        const fx = buildFixture(spec, f, fixtureMats, y0, site ? site.surface(f.position) : y0);
        // Its own copy of each lens, so this fixture can be switched off by hand on its own.
        const lenses = new Map<THREE.Material, THREE.MeshStandardMaterial>();
        for (const [m, g] of fx.parts) {
          if (!fixtureMats.glow.includes(m as THREE.MeshStandardMaterial)) {
            add(m, g);
            continue;
          }
          let c = lenses.get(m);
          if (!c) {
            c = (m as THREE.MeshStandardMaterial).clone();
            owned.push(c);
            extraGlow.push(c);
            lenses.set(m, c);
          }
          add(c, g);
        }
        const a = (-f.rotationDeg * Math.PI) / 180;
        const beams = fx.lights.map((l) => ({ ...l, position: local(l.position.x, l.position.y, l.position.z), direction: l.direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a) }));
        landLights.push(...beams);
        if (beams.length) act({ key: 'light', label: spec.name, words: ['On', 'Off'], anchors: [anchorAt(o, 0, 0.25, 0)], on: true, planOn: true, lights: true, set(on) {
          for (const b of beams) b.off = !on;
          for (const c of lenses.values()) c.userData.off = !on;
        } });
        break;
      }
      case 'bench': {
        for (let k = 0; k < 4; k++) add(mat.teak, box(1.5, 0.04, 0.1, 0, 0.42, -0.17 + k * 0.115));
        for (const sx of [-0.6, 0.6]) add(mat.teak, box(0.08, 0.42, 0.4, sx, 0, 0));
        break;
      }
      case 'loungeSet': {
        // Sofa plus two chairs around a low table.
        add(mat.fabric, box(2.2, 0.4, 0.85, 0, 0, -D / 2 + 0.43));
        add(mat.fabric, box(2.2, 0.35, 0.2, 0, 0.4, -D / 2 + 0.1));
        add(mat.cushion, box(2.0, 0.12, 0.65, 0, 0.4, -D / 2 + 0.5));
        for (const sx of [-1, 1]) {
          add(mat.fabric, box(0.85, 0.4, 0.85, sx * (W / 2 - 0.43), 0, 0.5));
          add(mat.cushion, box(0.7, 0.12, 0.7, sx * (W / 2 - 0.43), 0.4, 0.5));
        }
        add(mat.granite, box(1.1, 0.38, 0.6, 0, 0, 0.1));
        break;
      }
      case 'diningSet': {
        add(mat.alum, box(1.9, 0.04, 0.95, 0, 0.72, 0));
        for (const sx of [-0.85, 0.85]) for (const sz of [-0.4, 0.4]) add(mat.alum, box(0.05, 0.72, 0.05, sx, 0, sz));
        for (let k = 0; k < 6; k++) {
          const side = k < 3 ? -1 : 1;
          const x = -0.6 + (k % 3) * 0.6;
          add(mat.alum, box(0.48, 0.05, 0.48, x, 0.45, side * 0.75));
          add(mat.alum, box(0.48, 0.45, 0.04, x, 0.5, side * 0.98));
          for (const lx of [-0.2, 0.2]) for (const lz of [-0.2, 0.2]) add(mat.alum, box(0.03, 0.45, 0.03, x + lx, 0, side * 0.75 + lz));
        }
        break;
      }
    }
    handActions(f.id, o, spec.group === 'Lighting', lights.slice(lights0), flames.slice(flames0), new Set<THREE.Material>([falls, ...fallMats.slice(falls0)]), extraGlow.slice(glow0), actions);
    for (const [target, map] of [[o, parts] as const, ...hinges]) {
      for (const [m, list] of map) {
        const merged = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        if (!merged) continue;
        geos.push(merged);
        const mesh = new THREE.Mesh(merged, m);
        mesh.castShadow = !(m as THREE.MeshStandardMaterial).transparent;
        mesh.receiveShadow = true;
        target.add(mesh);
        surfaces.push(mesh);
      }
    }
    o.position.set(f.position[0], y0, f.position[1]);
    o.rotation.y = (-f.rotationDeg * Math.PI) / 180;
    o.userData.itemId = f.id;
    if (spec.kind === 'steppingStone') {
      // What the material pointer reports for a stepping stone: its slab, concrete or flagstone, and color.
      o.userData.part = 'stone';
      o.userData.catalogId = stoneLook(f, spec);
    }
    if (spec.kind === 'flagLip' || spec.kind === 'flagLedge' || spec.kind === 'flagEdge') {
      // The same for a water feature's flagstone piece: the flagstone it is cut from.
      o.userData.part = 'stone';
      o.userData.catalogId = flagLookOf(f).id;
    }
    o.name = `feature-${f.id}`;
    group.add(o);
  }
  group.add(rockField(rocks, 'boulders'));

  return {
    object: group,
    surfaces,
    lights,
    landLights,
    glow: [lampGlow, spaGlow, ledGlow, ...extraGlow, ...decorGlow, ...makerGlow, ...fixtureMats.glow],
    flames,
    // The shared fall material unused (no water wall) is no moving water: left out, a yard of furniture can rest.
    fallMats: fallMats.filter((m) => m !== falls || fallsUsed),
    pebbleBeds,
    plants: raised,
    actions,
    fourFalls,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of owned) m.dispose();
      fixtureMats.dispose();
      for (const m of fallMats) m.dispose();
      // Each waterfall's own meshes and materials; the rock and cobble shapes they share stay for the next yard.
      for (const ff of fourFalls) ff.wf.dispose();
    },
  };
}

/*
 * SunVilla Stratus 10 x 13 ft motorized pergola, to SunVilla's overall size: W along x (157.3 in), D along z
 * (118.7 in), 98.6 in to the top of the frame. Proportions read from SunVilla's product photos (no part sizes are
 * published): square posts about 5 in on square base plates about 8 in, flush with the outside of a deep fascia beam
 * band (about 6 1/2 in) that runs round the top; the long beams are made in two lengths with a joint at mid-span.
 * The louvers (about 6 in at a 5.9 in pitch) span the short way between the long beams on pivots just under the beam
 * top, driven by a 20 V battery motor from a post-mounted button panel (flat and sealed shut to vertical); every fourth one carries an LED strip on its underside. An internal gutter rail runs inside
 * each long beam. One warm light under the roof lights the space at night.
 */
/** The Stratus louvers' open angle. SunVilla does not publish it; motorized louvers of this kind turn to vertical. */
const STRATUS_OPEN = Math.PI / 2;

function stratusPergola(
  W: number,
  D: number,
  frame: THREE.Material,
  led: THREE.Material,
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void,
  light: (x: number, y: number, z: number, color: string, intensity: number, distance: number) => void,
  out: THREE.Object3D,
  start: 'tilt' | 'open' | 'closed',
) {
  const H = 98.6 * IN_M;
  const post = 0.127, beamH = 0.165, beamT = 0.095;
  const plate = 0.205, plateH = 0.014;
  const px = W / 2 - post / 2, pz = D / 2 - post / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // Base plate with a low chamfered cover, the post to the top of the beam band, and a flat cap.
    add(frame, box(plate, plateH, plate, sx * px, 0, sz * pz));
    add(frame, box(post + 0.05, 0.016, post + 0.05, sx * px, plateH, sz * pz));
    add(frame, box(post, H - plateH, post, sx * px, plateH, sz * pz));
  }
  // Fascia beams, outer faces flush with the posts. The long beams (along x) have a joint at mid-span.
  const yb = H - beamH;
  const longL = W - 2 * post;
  const gap = 0.004;
  for (const sz of [-1, 1]) {
    const z = sz * (D / 2 - beamT / 2);
    for (const side of [-1, 1]) add(frame, box(longL / 2 - gap / 2, beamH, beamT, side * (longL / 4 + gap / 4), yb, z));
    // The joint's backing, set in so the seam reads as a thin dark line.
    add(frame, box(gap * 3, beamH - 0.01, beamT - 0.012, 0, yb + 0.005, z - sz * 0.006));
    // Internal gutter rail inside the long beam, under the louver pivots.
    add(frame, box(longL, 0.05, 0.05, 0, yb - 0.01, sz * (D / 2 - beamT - 0.025)));
  }
  for (const sx of [-1, 1]) add(frame, box(beamT, beamH, D - 2 * post, sx * (W / 2 - beamT / 2), yb, 0));
  // Louvers: span between the gutter rails, pivot just under the top of the beams, tilted partly open (22 degrees).
  const inner = W - 2 * beamT - 0.02;
  const pitch = 0.15;
  const n = Math.floor(inner / pitch);
  const yPivot = H - 0.075;
  // Closed the blades lie flat and meet along their edges (a 3 mm joint under a drip lip that hangs below it).
  const blade = 0.147, thick = 0.02, span = D - 2 * beamT - 0.1;
  // All blades share one geometry per material and are drawn as instances turned about their own pivot line.
  const bladeGeo = mergeGeometries([
    new THREE.BoxGeometry(blade, thick, span),
    new THREE.BoxGeometry(blade * 0.35, 0.006, span).translate(0, thick / 2 + 0.003, 0),
    new THREE.BoxGeometry(0.006, 0.036, span).translate(blade / 2 - 0.001, -0.012, 0),
  ].map((g) => g.toNonIndexed()), false)!;
  const stripGeo = new THREE.CylinderGeometry(0.011, 0.011, span - 0.12, 8).rotateX(Math.PI / 2).translate(0, -thick / 2 - 0.004, 0).toNonIndexed();
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(-((n - 1) * pitch) / 2 + i * pitch);
  const ledIdx = xs.map((_, i) => i).filter((i) => i % 4 === 0);
  const bladeMesh = new THREE.InstancedMesh(bladeGeo, frame, n);
  const stripMesh = new THREE.InstancedMesh(stripGeo, led, ledIdx.length);
  for (const m of [bladeMesh, stripMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    out.add(m);
  }
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mtx = new THREE.Matrix4();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pose = (angle: number) => {
    q.setFromAxisAngle(zAxis, angle);
    xs.forEach((x, i) => bladeMesh.setMatrixAt(i, mtx.compose(pos.set(x, yPivot, 0), q, one)));
    ledIdx.forEach((i, k) => stripMesh.setMatrixAt(k, mtx.compose(pos.set(xs[i], yPivot, 0), q, one)));
    bladeMesh.instanceMatrix.needsUpdate = true;
    stripMesh.instanceMatrix.needsUpdate = true;
  };
  // Drive: t runs 0 (flat) to 1 (open); a plan that never chose starts at the old fixed 22 degrees.
  let t = start === 'tilt' ? 22 / 90 : start === 'open' ? 1 : 0, target = start === 'open' ? 1 : 0, touched = start !== 'tilt';
  const ease = (v: number) => v * v * (3 - 2 * v);
  const apply = () => pose(STRATUS_OPEN * ease(t));
  apply();
  const state = () => (!touched ? 'tilt' : target === 1 ? 'open' : 'closed');
  const rig: Pick<FeatureAction, 'set' | 'tick'> = {
    set(next, instant) {
      target = next ? 1 : 0;
      touched = true;
      if (instant) { t = target; apply(); }
    },
    tick(dt) {
      if (t === target) return false;
      const step = dt / 2.6;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
      return true;
    },
  };
  // End caps and pivot brackets on the gutter rails.
  for (const x of xs) for (const sz of [-1, 1]) add(frame, box(0.05, 0.045, 0.03, x, yPivot - 0.035, sz * (span / 2 + 0.015)));
  // The strips' light on the patio and furniture, from well under the roof so the louvers themselves stay dark between
  // them. One light per pergola: the scene's light pool is small (see build.ts), the strips themselves glow regardless.
  light(0, H - 1.0, 0, '#ffc98f', 2.8, 6);
  return { rig, state, geos: [bladeGeo, stripGeo], stripXs: ledIdx.map((i) => xs[i]), bladeXs: xs.filter((_, i) => i % 4 === 2), y: yPivot, span };
}

type GrillMats = Record<'steel' | 'grate' | 'black' | 'inside', THREE.Material>;

/**
 * A built-in gas grill's firebox standing on the counter at (x, y, z), w x h x d: a hollow stainless box with a dark
 * inside, four burner tubes running front to back with a row of short blue flames each side of their crown, a grate
 * of bars over them, and a knob for each burner on the front. The flames burn only when the grill is lit by hand.
 */
function grillFirebox(add: (m: THREE.Material, g: THREE.BufferGeometry) => void, fire: (t: Tongue[], style?: FireStyle) => void,
  light: (x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker?: boolean) => void,
  mat: GrillMats, x: number, y: number, z: number, w: number, h: number, d: number, seed: string) {
  const t = 0.012;
  add(mat.steel, box(w, 0.01, d, x, y, z));
  for (const s of [-1, 1]) {
    add(mat.steel, box(w, h, t, x, y, z + s * (d / 2 - t / 2)));
    add(mat.steel, box(t, h, d - 2 * t, x + s * (w / 2 - t / 2), y, z));
    // The dark, heat-stained inside of the walls.
    add(mat.inside, box(w - 2 * t, h - 0.03, 0.003, x, y + 0.01, z + s * (d / 2 - t - 0.0015)));
    add(mat.inside, box(0.003, h - 0.03, d - 2 * t, x + s * (w / 2 - t - 0.0015), y + 0.01, z));
  }
  add(mat.inside, box(w - 2 * t, 0.004, d - 2 * t, x, y + 0.01, z));
  // Burners: tubes 1 in across, ports along their crown.
  const len = d - 0.1, ty = y + 0.06, r = 0.0127;
  const xs = [-0.36, -0.12, 0.12, 0.36].map((k) => x + k * (w - 2 * t));
  xs.forEach((bx, k) => {
    add(mat.black, new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2).translate(bx, ty, z).toNonIndexed());
    const a = new THREE.Vector3(bx, ty + r * 0.75, z - len / 2 + 0.025), b = new THREE.Vector3(bx, ty + r * 0.75, z + len / 2 - 0.025);
    fire(tubeBurner(a, b, 0.04, `${seed}-burner${k}`, 0.022, r * 0.6), 'grill');
    // Its knob on the front.
    add(mat.steel, new THREE.CylinderGeometry(0.021, 0.023, 0.026, 18).rotateX(Math.PI / 2).translate(bx, y + 0.1, z + d / 2 + 0.013).toNonIndexed());
  });
  // The grate: bars front to back, flush with the firebox top, on two cross rails.
  const gw = w - 2 * t - 0.01, pitch = 0.019;
  const n = Math.floor(gw / pitch);
  for (let i = 0; i <= n; i++) add(mat.grate, box(0.007, 0.012, d - 2 * t - 0.01, x - (n * pitch) / 2 + i * pitch, y + h - 0.012, z));
  for (const s of [-1, 1]) add(mat.grate, box(gw, 0.008, 0.012, x, y + h - 0.02, z + s * (d / 2 - 0.06)));
  // The burners' glow on the grate, the open hood and whatever stands near: soft, from well above the grate.
  light(x, y + h + 0.55, z + 0.1, '#ffa860', 0.5, 2.2, true);
}

/**
 * The fires by the light of day: lit from dusk. A fire put out by hand (userData.force false) stays out; one lit by
 * hand (true) burns in daylight too. A grill's burners stay off until lit by hand.
 */
export function setFlames(fb: FeatureBuild, on: number) {
  for (const f of fb.flames) {
    const force = f.userData.force as boolean | undefined;
    // A grill (userData.manual) burns only when lit by hand.
    const v = force === false ? 0 : force === true ? Math.max(on, 0.9) : f.userData.manual ? 0 : on;
    f.visible = v > 0.02;
    (f.material as THREE.ShaderMaterial).uniforms.uOn.value = v;
  }
}

/**
 * The hand actions every feature gets from what it was built with: a fire (its flames and their flickering light),
 * water (the falling sheets, streams and splash of a water wall or fountain), and, for lighting fixtures, the light
 * (its night lights and lamp glow).
 */
function handActions(itemId: string, o: THREE.Object3D, fixture: boolean, own: NightLight[], flames: THREE.Mesh[], falls: Set<THREE.Material>, glow: THREE.MeshStandardMaterial[], out: FeatureAction[]) {
  if (flames.length) {
    const fireLights = own.filter((l) => l.flicker);
    // A grill starts off, its light with it.
    const manual = flames.every((fl) => fl.userData.manual);
    if (manual) for (const l of fireLights) l.off = true;
    const p = flames[0].position;
    out.push({ itemId, key: 'fire', label: manual ? 'Grill burners' : 'Fire', words: ['On', 'Off'], anchors: [anchorAt(o, p.x, p.y + 0.2, p.z)], on: !manual, planOn: !manual, lights: true, set(on) {
      for (const fl of flames) fl.userData.force = on;
      for (const l of fireLights) l.off = !on;
    } });
  }
  const water: THREE.Mesh[] = [];
  o.traverse((m) => {
    if (m instanceof THREE.Mesh && falls.has(m.material as THREE.Material)) water.push(m);
  });
  if (water.length) {
    const anchors = water.map((m) => {
      m.geometry.computeBoundingBox();
      const c = m.geometry.boundingBox!.getCenter(new THREE.Vector3()).add(m.position);
      return anchorAt(o, c.x, c.y, c.z);
    });
    out.push({ itemId, key: 'water', label: 'Water', words: ['On', 'Off'], anchors, on: true, planOn: true, set(on) {
      for (const m of water) m.visible = on;
    } });
  }
  if (fixture && own.length) {
    out.push({ itemId, key: 'light', label: 'Light', words: ['On', 'Off'], anchors: [anchorAt(o, 0, 0.45, 0)], on: true, planOn: true, lights: true, set(on) {
      for (const l of own) l.off = !on;
      for (const m of glow) m.userData.off = !on;
    } });
  }
}
