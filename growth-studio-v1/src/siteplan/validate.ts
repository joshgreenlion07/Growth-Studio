import { FEATURES, LEGACY_IDS, MATERIALS, PLANTS, featureById, materialById, plantById } from './catalog';
import { area, uid } from './geometry';
import type {
  ExistingStructure, FeaturePlacement, ItemSource, LineItem, PlantPlacement, SitePlan, Vec2, WaterFeature, Zone,
} from './types';

export interface CleanResult {
  plan: SitePlan;
  /** Plain-language notes about what was fixed or dropped. */
  warnings: string[];
}

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function vec(v: unknown): Vec2 | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0], NaN), y = num(v[1], NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  if (v && typeof v === 'object' && 'x' in v && 'y' in v) {
    const o = v as { x: unknown; y: unknown };
    const x = num(o.x, NaN), y = num(o.y, NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
}

function pts(v: unknown, min: number): Vec2[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map(vec).filter((p): p is Vec2 => p !== null);
  // Drop a repeated closing point.
  if (out.length > 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out.length >= min ? out : null;
}

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

function base(o: Record<string, unknown>, prefix: string) {
  const src = o.source;
  const source: ItemSource = src === 'ai' || src === 'person' || src === 'sample' ? src : 'person';
  const out: { id: string; source: ItemSource; confidence?: number; note?: string } = {
    id: typeof o.id === 'string' && o.id ? o.id : uid(prefix),
    source,
  };
  if (o.confidence !== undefined) out.confidence = num(o.confidence, 1, 0, 1);
  if (typeof o.note === 'string' && o.note.trim()) out.note = o.note.trim().slice(0, 240);
  return out;
}

const legacy = (id: unknown) => (typeof id === 'string' && LEGACY_IDS[id] ? LEGACY_IDS[id] : id);

function pickMaterial(raw: unknown, use: string, fallback: string, warnings: string[], label: string): string {
  const id = legacy(raw);
  if (typeof id === 'string' && materialById.get(id)?.use === use) return id;
  if (typeof id === 'string') {
    // Accept a close name match ("pavers" -> first paver).
    const lower = id.toLowerCase();
    const hit = MATERIALS.find((m) => m.use === use && (m.id.includes(lower) || m.name.toLowerCase().includes(lower)));
    if (hit) return hit.id;
    warnings.push(`${label}: "${id}" isn't in the catalog, so it uses ${materialById.get(fallback)!.name}.`);
  }
  return fallback;
}

function pickPlant(raw: unknown, warnings: string[]): string {
  const id = legacy(raw);
  if (typeof id === 'string' && plantById.has(id)) return id;
  if (typeof id === 'string') {
    const lower = id.toLowerCase();
    const hit = PLANTS.find((p) => p.id.includes(lower) || p.name.toLowerCase().includes(lower) || lower.includes(p.form.toLowerCase()));
    if (hit) return hit.id;
    warnings.push(`Plant "${id}" isn't in the catalog, so it shows as boxwood. Check it.`);
  }
  return 'boxwood';
}

function pickFeature(raw: unknown, warnings: string[]): string | null {
  const id = legacy(raw);
  if (typeof id === 'string' && featureById.has(id)) return id;
  if (typeof id === 'string') {
    const lower = id.toLowerCase().replace(/[\s_]/g, '-');
    const hit = FEATURES.find((f) => f.id.includes(lower) || lower.includes(f.id) || f.name.toLowerCase().includes(id.toLowerCase()));
    if (hit) return hit.id;
    warnings.push(`Feature "${id}" isn't in the catalog and was left out.`);
  }
  return null;
}

/** Turn any JSON (an AI reply, a saved file) into a valid SitePlan. */
export function cleanPlan(input: unknown): CleanResult {
  const warnings: string[] = [];
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const s = (o.site && typeof o.site === 'object' ? o.site : {}) as Record<string, unknown>;

  let boundary = pts(s.boundary, 3);
  if (!boundary || area(boundary) < 4) {
    warnings.push('No usable property outline was found, so a 60 by 46 ft lot was assumed. Redraw it to match.');
    boundary = [[0, 0], [18, 0], [18, 14], [0, 14]];
  }

  const plan: SitePlan = {
    schemaVersion: 1,
    site: {
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 80) : 'Untitled yard',
      boundary,
      latitude: num(s.latitude, 37.64, -66, 66),
      longitude: num(s.longitude, -120.99, -180, 180),
      northAngleDeg: num(s.northAngleDeg, 0, -360, 360),
    },
    structures: [],
    zones: [],
    lines: [],
    water: [],
    plants: [],
    features: [],
  };
  if (s.streetEdge !== undefined && s.streetEdge !== null) {
    const e = Math.round(num(s.streetEdge, -1));
    if (e >= 0 && e < boundary.length) plan.site.streetEdge = e;
  }

  for (const it of arr(o.structures)) {
    const polygon = pts(it.polygon, 3);
    if (!polygon || area(polygon) < 2) continue;
    const kind = it.kind === 'garage' || it.kind === 'shed' ? it.kind : 'house';
    const st: ExistingStructure = {
      ...base(it, kind), kind, polygon,
      height: num(it.height, kind === 'shed' ? 2.4 : 3.0, 2, 9),
      roof: it.roof === 'flat' ? 'flat' : 'hip',
    };
    plan.structures.push(st);
  }

  for (const it of arr(o.zones)) {
    const polygon = pts(it.polygon, 3);
    if (!polygon || area(polygon) < 0.05) continue;
    const kind = it.kind === 'turf' || it.kind === 'hardscape' ? it.kind : 'bed';
    const fallback = kind === 'turf' ? 'lawn' : kind === 'hardscape' ? 'paver-ashlar-gray' : 'black-mulch';
    const z: Zone = { ...base(it, kind), kind, polygon, catalogId: pickMaterial(it.catalogId, kind === 'turf' ? 'turf' : kind === 'hardscape' ? 'hardscape' : 'bed', fallback, warnings, 'Zone material') };
    const f = it.fill as Record<string, unknown> | undefined;
    if (kind === 'bed' && f && typeof f === 'object' && f.catalogId) {
      const pid = pickPlant(f.catalogId, warnings);
      z.fill = { catalogId: pid, spacing: num(f.spacing, plantById.get(pid)!.spacing, 0.25, 10) };
    }
    const bd = it.border as Record<string, unknown> | undefined;
    if (kind === 'hardscape' && bd && typeof bd === 'object') {
      z.border = { catalogId: pickMaterial(bd.catalogId, 'border', 'border-charcoal', warnings, 'Border'), width: num(bd.width, 0.2, 0.08, 0.6) };
      if (it.borderLights === true) z.borderLights = true;
    }
    const rs = it.raised as Record<string, unknown> | undefined;
    if (kind === 'bed' && rs && typeof rs === 'object') {
      z.raised = { wallCatalogId: pickMaterial(rs.wallCatalogId, 'wall', 'wall-tan-charcoal-cap', warnings, 'Planter wall'), height: num(rs.height, 0.6, 0.2, 1.2) };
    }
    plan.zones.push(z);
  }

  for (const it of arr(o.lines)) {
    const points = pts(it.points, 2);
    if (!points) continue;
    const kind = it.kind === 'fence' || it.kind === 'edging' ? it.kind : 'wall';
    const use = kind;
    const fallback = kind === 'fence' ? 'fence-board-on-board' : kind === 'edging' ? 'curb-charcoal' : 'wall-gray-block';
    const l: LineItem = {
      ...base(it, kind), kind, points,
      catalogId: pickMaterial(it.catalogId, use, fallback, warnings, 'Line material'),
      height: num(it.height, kind === 'fence' ? 1.8 : kind === 'edging' ? 0.05 : 0.5, 0.02, 3.5),
    };
    plan.lines.push(l);
  }

  for (const it of arr(o.water)) {
    const kind = it.kind === 'pool' || it.kind === 'fountain' || it.kind === 'stream' || it.kind === 'pondless' ? it.kind : 'pond';
    const w: WaterFeature = { ...base(it, kind), kind, depth: num(it.depth, kind === 'pool' ? 1.6 : kind === 'fountain' ? 0.4 : 0.6, 0.1, 3) };
    if (kind === 'stream' || kind === 'pondless') {
      const points = pts(it.points, 2);
      if (!points) continue;
      w.points = points;
      w.width = num(it.width, 0.8, 0.3, 4);
      w.depth = Math.min(w.depth, kind === 'pondless' ? 0.15 : 0.4);
      w.falls = Math.round(num(it.falls, kind === 'pondless' ? 3 : 2, 0, 8));
      if (it.lights === false) w.lights = false;
      else if (it.lights === true) w.lights = true;
    } else {
      const polygon = pts(it.polygon, 3);
      if (!polygon || area(polygon) < 0.2) continue;
      w.polygon = polygon;
      if (kind === 'pool' && it.ledge === true) w.ledge = true;
    }
    plan.water.push(w);
  }

  for (const it of arr(o.plants)) {
    const position = vec(it.position);
    if (!position) continue;
    const p: PlantPlacement = { ...base(it, 'plant'), catalogId: pickPlant(it.catalogId, warnings), position };
    if (it.existing === true) p.existing = true;
    if (it.scale !== undefined) p.scale = num(it.scale, 1, 0.6, 1.4);
    plan.plants.push(p);
  }

  for (const it of arr(o.features)) {
    const position = vec(it.position);
    if (!position) continue;
    const id = pickFeature(it.catalogId, warnings);
    if (!id) continue;
    const f: FeaturePlacement = { ...base(it, 'feature'), catalogId: id, position, rotationDeg: num(it.rotationDeg, 0, -360, 360) };
    plan.features.push(f);
  }

  return { plan, warnings: [...new Set(warnings)] };
}
