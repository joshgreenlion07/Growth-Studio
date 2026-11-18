// Small sample plans for the Library's 3D visualizer: one catalog item shown on its own, on a small lot with no house
// and no street, the way Area Planner plans arrive. Shown with studio.setPlan(plan), then the camera is set from
// `target` and `dist`. Plan coordinates are meters [x, y]; in 3D, x stays x, plan y is world z, y is up.
import { featureById, layingsFor, materialById, plantById, type LayingPattern, type MaterialSpec } from '../siteplan/catalog';
import type { ExistingStructure, FeaturePlacement, LineItem, SitePlan, Vec2, Zone } from '../siteplan/types';

export type LibraryItem =
  | { kind: 'material'; id: string } // a MaterialSpec id (paver, wall, curb, paver edge, turf, bed fill, concrete, porcelain, ...)
  | { kind: 'plant'; id: string } // a PlantSpec id
  | { kind: 'feature'; id: string } // a FeatureSpec id
  | { kind: 'structure'; id: 'cover' | 'calroom' };
export interface SampleScene { id: string; label: string }
export interface SampleOptions { scene?: string; laying?: LayingPattern; years?: number }
export interface LibrarySample {
  plan: SitePlan;
  /** Camera target, world coordinates [x, y, z]. */
  target: [number, number, number];
  /** Camera distance from the target. */
  dist: number;
  /** Growth years to show (plants); omit for others. */
  years?: number;
}

const FT = 0.3048;
const TEN = 10 * FT;
const S = 'sample' as const;
/** The neutral main course used under a border look and around features and covers. */
const NEUTRAL_PAVER = 'catalina-grana-sonoran-gray';
const BORDER_WIDTH = 0.229;

const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A w x d rectangle centered on (cx, cy), clockwise from the top left. */
const rect = (cx: number, cy: number, w: number, d: number): Vec2[] => [
  [cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2],
];
/** The rectangle spanning x0..x1, y0..y1. */
const box = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const disc = (cx: number, cy: number, r: number, n = 28): Vec2[] =>
  Array.from({ length: n }, (_, i): Vec2 => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);

function lot(name: string, L: number): SitePlan {
  return {
    schemaVersion: 1,
    site: { name, boundary: [[0, 0], [L, 0], [L, L], [0, L]], latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [], zones: [], lines: [], water: [], plants: [], features: [],
  };
}
const lawn = (L: number): Zone => ({ id: 'lawn', source: S, kind: 'turf', catalogId: 'lawn', polygon: box(0, 0, L, L) });

/** A maker paver's own border in the same color: the line's border stone if it sells one, else the matching border look. */
function borderFor(m: MaterialSpec): string | undefined {
  if (!m.maker || !m.color || m.use !== 'hardscape') return undefined;
  const colorSlug = slugOf(m.color);
  if (m.id.endsWith(`-${colorSlug}`)) {
    const own = `${m.id.slice(0, -colorSlug.length - 1)}-border-${colorSlug}`;
    if (materialById.has(own)) return own;
  }
  const auto = `border-of-${m.id}`;
  return materialById.has(auto) ? auto : undefined;
}

const isCurbLike = (m: MaterialSpec) => m.use === 'edging' && (m.recipe === 'curb' || m.recipe === 'steelEdging');
const isPaverEdge = (m: MaterialSpec) => m.use === 'border' && m.shelf === 'Paver edge';

function material(id: string): MaterialSpec {
  const m = materialById.get(id);
  if (!m) throw new Error(`Library sample: no material "${id}" in the catalog`);
  return m;
}

/** The scene choices for an item (first is the default); empty when there is only one way to show it. */
export function scenesFor(item: LibraryItem): SampleScene[] {
  if (item.kind !== 'material') return [];
  const m = material(item.id);
  if (m.use === 'hardscape' && m.group === 'Concrete') return [{ id: 'slab', label: '10 ft slab' }, { id: 'walk', label: 'Walk through lawn' }];
  if (m.use === 'hardscape' && borderFor(m)) return [{ id: 'border', label: 'With its border' }, { id: 'plain', label: 'On its own' }];
  if (isCurbLike(m)) return [{ id: 'turfBed', label: 'With turf and bed' }, { id: 'alone', label: 'On its own' }];
  // A Paver edge look is laid either as a patio's border or as an edging row along a drawn line (README "Paver edging").
  if (isPaverEdge(m)) return [{ id: 'patio', label: 'Around a patio' }, { id: 'row', label: 'As an edging row' }];
  return [];
}

/** The chosen scene when the item offers it, else its default. */
function sceneOf(item: LibraryItem, want?: string): string | undefined {
  const all = scenesFor(item);
  return all.find((s) => s.id === want)?.id ?? all[0]?.id;
}

export function sampleFor(item: LibraryItem, opts: SampleOptions = {}): LibrarySample {
  switch (item.kind) {
    case 'material': return materialSample(item, opts);
    case 'plant': return plantSample(item.id, opts);
    case 'feature': return featureSample(item.id);
    case 'structure': return structureSample(item.id);
    default: throw new Error(`Library sample: unknown item kind "${(item as { kind: string }).kind}"`);
  }
}

function materialSample(item: { kind: 'material'; id: string }, opts: SampleOptions): LibrarySample {
  const m = material(item.id);
  const scene = sceneOf(item, opts.scene);

  if (m.use === 'hardscape' || m.use === 'turf' || m.use === 'bed') {
    const L = 8, c = L / 2;
    const plan = lot(m.name, L);
    const zone: Zone = { id: 'sample', source: S, kind: m.use, catalogId: m.id, polygon: rect(c, c, TEN, TEN) };
    if (m.use === 'hardscape') {
      if (opts.laying && layingsFor(m).includes(opts.laying)) zone.laying = opts.laying;
      const border = scene === 'border' ? borderFor(m) : undefined;
      if (border) zone.border = { catalogId: border, width: BORDER_WIDTH };
    }
    // Patios sit on lawn; turf, bed fills and concrete are shown on bare ground.
    const onLawn = m.use === 'hardscape' && m.group !== 'Concrete';
    if (m.group === 'Concrete' && scene === 'walk') {
      zone.polygon = box(c - 0.9, 0.4, c + 0.9, L - 0.4);
      plan.zones = [lawn(L), zone];
      return { plan, target: [c, 0, c], dist: 5.2 };
    }
    plan.zones = onLawn ? [lawn(L), zone] : [zone];
    return { plan, target: [c, 0, c], dist: 4.4 };
  }

  if (m.use === 'border') {
    const L = 8, c = L / 2;
    const plan = lot(m.name, L);
    if (scene === 'row') {
      plan.zones = [lawn(L)];
      plan.lines = [{ id: 'sample', source: S, kind: 'edging', catalogId: m.id, points: [[c - TEN / 2, c], [c + TEN / 2, c]], height: 0 }];
      return { plan, target: [c, 0, c], dist: 4 };
    }
    plan.zones = [lawn(L), { id: 'patio', source: S, kind: 'hardscape', catalogId: NEUTRAL_PAVER, polygon: rect(c, c, TEN, TEN), border: { catalogId: m.id, width: BORDER_WIDTH } }];
    return { plan, target: [c, 0, c], dist: 4.4 };
  }

  if (m.use === 'wall') {
    const L = 7, c = L / 2;
    const plan = lot(m.name, L);
    const course = m.wall?.unit?.course;
    let height = 0.6;
    if (course && course > 0) {
      const aim = m.shelf === 'Garden walls' ? 18 : 24;
      height = Math.max(1, Math.round(aim / course)) * course * 0.0254;
    }
    plan.zones = [lawn(L), { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: box(c - TEN / 2, c, c + TEN / 2, c + 1.2) }];
    plan.lines = [{ id: 'sample', source: S, kind: 'wall', catalogId: m.id, points: [[c - TEN / 2, c], [c + TEN / 2, c]], height }];
    return { plan, target: [c, Math.min(Math.max(0.3, height * 0.5), 0.9), c], dist: 4 + Math.max(0, height - 0.6) * 1.5 };
  }

  if (m.use === 'edging') {
    const L = 7, c = L / 2;
    const plan = lot(m.name, L);
    const line: LineItem = { id: 'sample', source: S, kind: 'edging', catalogId: m.id, points: [[c - TEN / 2, c], [c + TEN / 2, c]], height: 0.1 };
    plan.lines = [line];
    if (scene === 'turfBed') {
      plan.zones = [
        { id: 'turf', source: S, kind: 'turf', catalogId: 'synthetic-turf', polygon: box(c - TEN / 2, c - 5 * FT, c + TEN / 2, c) },
        { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: box(c - TEN / 2, c, c + TEN / 2, c + 4 * FT) },
      ];
    }
    return { plan, target: [c, 0.3, c], dist: 4 };
  }

  if (m.use === 'fence') {
    const L = 7, c = L / 2;
    const plan = lot(m.name, L);
    plan.zones = [lawn(L)];
    plan.lines = [{ id: 'sample', source: S, kind: 'fence', catalogId: m.id, points: [[c - TEN / 2, c], [c + TEN / 2, c]], height: 1.8 }];
    return { plan, target: [c, 0.9, c], dist: 5.5 };
  }

  throw new Error(`Library sample: material "${m.id}" (use "${m.use}") has no sample`);
}

function plantSample(id: string, opts: SampleOptions): LibrarySample {
  const p = plantById.get(id);
  if (!p) throw new Error(`Library sample: no plant "${id}" in the catalog`);
  const L = Math.max(8, p.matureSpread * 3 + 4), c = L / 2;
  const plan = lot(p.name, L);
  plan.zones = [lawn(L), { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: disc(c, c, Math.max(0.9, p.matureSpread * 0.75)) }];
  plan.plants = [{ id: 'sample', source: S, catalogId: p.id, position: [c, c] }];
  const years = Math.min(10, Math.max(0, opts.years ?? 3));
  return { plan, target: [c, p.matureHeight * 0.45, c], dist: Math.max(p.matureHeight, p.matureSpread) * 1.9 + 1.2, years };
}

function featureSample(id: string): LibrarySample {
  const f = featureById.get(id);
  if (!f) throw new Error(`Library sample: no feature "${id}" in the catalog`);
  const pad = 16 * FT;
  const L = Math.max(10, pad + 4), c = L / 2;
  const plan = lot(f.name, L);
  plan.zones = [lawn(L), { id: 'patio', source: S, kind: 'hardscape', catalogId: NEUTRAL_PAVER, polygon: rect(c, c, pad, pad) }];
  const placed: FeaturePlacement = { id: 'sample', source: S, catalogId: f.id, position: [c, c], rotationDeg: 0 };
  plan.features = [placed];
  const [w, d] = f.footprint;
  return { plan, target: [c, f.group === 'Shade' ? 1.4 : 0.8, c], dist: Math.max(w, d) * 1.8 + 2.5 };
}

function structureSample(id: 'cover' | 'calroom'): LibrarySample {
  if (id !== 'cover' && id !== 'calroom') throw new Error(`Library sample: unknown structure "${id as string}"`);
  const L = 10, c = L / 2;
  const plan = lot(id === 'cover' ? 'Patio cover' : 'California room', L);
  plan.zones = [lawn(L), { id: 'patio', source: S, kind: 'hardscape', catalogId: NEUTRAL_PAVER, polygon: rect(c, c, 14 * FT, 12 * FT) }];
  const cover: ExistingStructure = { id: 'cover', source: S, kind: 'cover', polygon: rect(c, c, 12 * FT, 10 * FT), height: 2.6, roof: 'flat' };
  // California room: solid walls on the back edge (edge 0, away from the default camera) and the left edge (edge 3).
  if (id === 'calroom') cover.walls = [true, false, false, true];
  plan.structures = [cover];
  return { plan, target: [c, 1.3, c], dist: 9 };
}
