import { FEATURES, LAYING_PATTERNS, LEGACY_IDS, MATERIALS, PLANTS, featureById, isOffered, materialById, plantById, type LayingPattern } from './catalog';
import { area, uid } from './geometry';
import type {
  ExistingStructure, FeaturePlacement, ItemSource, LineItem, ModelPlacement, PlantPlacement, Ruler, SitePlan, UtilityKind, UtilityLine,
  UtilityPoint, UtilityPointKind, UtilityRun, Vec2, WaterFeature, Zone,
} from './types';
import { UTILITY_DEFAULT_COVER, UTILITY_KIND_NAME, UTILITY_POINT_NAME } from './utilities';

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

/**
 * A list of points. Polygons close themselves, so a repeated closing point is
 * dropped. For a line (`closedRun`) it is kept: a wall, fence or curb whose
 * last point repeats the first is a closed run, and the repeat is what draws
 * the closing segment.
 */
function pts(v: unknown, min: number, closedRun = false): Vec2[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map(vec).filter((p): p is Vec2 => p !== null);
  if (out.length > 2 && !closedRun) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out.length >= min ? out : null;
}

/** A deck zone's layout (see DeckLayout): only the known keys, in range. */
function readDeck(d: Record<string, unknown>): NonNullable<Zone['deck']> {
  const out: NonNullable<Zone['deck']> = {};
  if (d.pattern === 'straight' || d.pattern === 'diagonal' || d.pattern === 'chevron') out.pattern = d.pattern;
  if (d.angleDeg !== undefined && d.angleDeg !== null) out.angleDeg = num(d.angleDeg, 0, -360, 360);
  if (d.boardIn !== undefined && d.boardIn !== null) out.boardIn = num(d.boardIn, 5.5, 2.5, 12);
  if (typeof d.frame === 'boolean') out.frame = d.frame;
  if (typeof d.divider === 'boolean') out.divider = d.divider;
  if (typeof d.fascia === 'boolean') out.fascia = d.fascia;
  if (d.tub === 'level' || d.tub === 'sunk') out.tub = d.tub;
  if (d.seamOffset !== undefined && d.seamOffset !== null) out.seamOffset = num(d.seamOffset, 0, -30, 30);
  if (Array.isArray(d.holes)) {
    const hs = d.holes.map((h) => pts(h, 3)).filter((h): h is Vec2[] => !!h && area(h) > 0.01).slice(0, 20);
    if (hs.length) out.holes = hs;
  }
  return out;
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
    const fake = use === 'turf' && /synth|artificial|fake|astro/.test(lower);
    // "grass" is in Synthetic grass's name, but a plain grass id means a natural lawn: only a fake-sounding id may match it.
    const near = (m: (typeof MATERIALS)[number]) => m.use === use && (fake || m.id !== 'synthetic-turf') && (m.id.includes(lower) || m.name.toLowerCase().includes(lower));
    // A close name prefers an offered material (OFFERED_LINES); an exact id above is always kept, offered or not.
    const hit = MATERIALS.find((m) => near(m) && isOffered(m)) ?? MATERIALS.find(near);
    if (hit) return hit.id;
    // Fake grass under another name must not fall back to natural lawn.
    if (fake) {
      warnings.push(`${label}: "${id}" isn't in the catalog, so it uses Synthetic grass.`);
      return 'synthetic-turf';
    }
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
    const kind = it.kind === 'garage' || it.kind === 'shed' || it.kind === 'cover' ? it.kind : 'house';
    const st: ExistingStructure = {
      ...base(it, kind), kind, polygon,
      height: num(it.height, kind === 'shed' ? 2.4 : kind === 'cover' ? 2.7 : 3.0, 2, 9),
      roof: kind === 'cover' || it.roof === 'flat' ? 'flat' : 'hip',
    };
    if (kind !== 'cover' && Array.isArray(it.openings)) {
      st.openings = [];
      for (const op of arr(it.openings).slice(0, 80)) {
        const at = vec(op.at);
        if (!at) continue;
        const ok = op.kind === 'door' ? 'door' : 'window';
        st.openings.push({ kind: ok, at, width: num(op.width, ok === 'door' ? 0.9 : 1.2, 0.3, 8) });
      }
    }
    if (kind === 'cover' && it.walls !== undefined && it.walls !== null) {
      // One entry per edge. A repeated closing point was dropped from the polygon, so its extra entry goes too.
      const raw = Array.isArray(it.walls) ? it.walls : null;
      // A point that could not be read was dropped too, and then the edges no longer line up with the entries.
      const given = Array.isArray(it.polygon) ? it.polygon.map(vec) : [];
      const lost = given.some((p) => p === null);
      const closed = !lost && given.length === polygon.length + 1;
      const w = raw && closed && raw.length === polygon.length + 1 ? raw.slice(0, -1) : raw;
      if (!lost && w && w.length === polygon.length && w.every((x) => typeof x === 'boolean')) {
        st.walls = w as boolean[];
      } else {
        warnings.push(lost
          ? `Cover "${st.id}": a corner could not be read, so its walls can't be matched to its edges and it is shown open on every side.`
          : `Cover "${st.id}": walls needs one true or false per edge (${polygon.length}), so it is shown open on every side.`);
      }
    }
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
    if (kind === 'hardscape' && it.elevation !== undefined && it.elevation !== null) {
      const e = num(it.elevation, 0, 0, 3);
      if (e > 0.005) z.elevation = e;
    }
    if (LAYING_PATTERNS.includes(it.laying as LayingPattern)) z.laying = it.laying as LayingPattern;
    const ly = it.layers as Record<string, unknown> | undefined;
    if (kind !== 'bed' && ly && typeof ly === 'object') {
      const out: NonNullable<Zone['layers']> = {};
      if (ly.base !== undefined && ly.base !== null) out.base = num(ly.base, 0.1, 0, 0.6);
      if (ly.bedding !== undefined && ly.bedding !== null) out.bedding = num(ly.bedding, 0.025, 0, 0.15);
      if (out.base !== undefined || out.bedding !== undefined) z.layers = out;
    }
    const dk = it.deck as Record<string, unknown> | undefined;
    if (kind === 'hardscape' && dk && typeof dk === 'object') z.deck = readDeck(dk);
    const bd = it.border as Record<string, unknown> | undefined;
    if (kind === 'hardscape' && bd && typeof bd === 'object') {
      z.border = { catalogId: pickMaterial(bd.catalogId, 'border', 'border-charcoal', warnings, 'Border'), width: num(bd.width, 0.2, 0.08, 0.6) };
      if (bd.course === 'sailor') z.border.course = 'sailor';
      if (it.borderLights === true) z.borderLights = true;
    }
    const rs = it.raised as Record<string, unknown> | undefined;
    if (kind === 'bed' && rs && typeof rs === 'object') {
      z.raised = { wallCatalogId: pickMaterial(rs.wallCatalogId, 'wall', 'wall-tan-charcoal-cap', warnings, 'Planter wall'), height: num(rs.height, 0.6, 0.2, 1.2) };
    }
    plan.zones.push(z);
  }

  for (const it of arr(o.lines)) {
    const points = pts(it.points, 2, true);
    if (!points) continue;
    const kind = it.kind === 'fence' || it.kind === 'edging' || it.kind === 'steps' ? it.kind : 'wall';
    // Steps are built from a hardscape material (the paving they lead up to).
    const use = kind === 'steps' ? 'hardscape' : kind;
    const fallback = kind === 'fence' ? 'fence-board-on-board' : kind === 'edging' ? 'curb-charcoal' : kind === 'steps' ? 'concrete-broom' : 'wall-gray-block';
    const l: LineItem = {
      ...base(it, kind), kind, points,
      // Paver edging names a paver border look (use 'border'); every other line a material of its own kind.
      catalogId: kind === 'edging' && materialById.get(legacy(it.catalogId) as string)?.use === 'border' ? (legacy(it.catalogId) as string) : pickMaterial(it.catalogId, use, fallback, warnings, 'Line material'),
      // Retaining walls run up to 20 ft (6.1 m); fences and curbs stay under 3.5 m.
      height: num(it.height, kind === 'fence' ? 1.8 : kind === 'edging' ? 0.05 : 0.5, 0.02, kind === 'wall' ? 6.5 : kind === 'steps' ? 3 : 3.5),
    };
    if (kind === 'steps') {
      l.riser = num(it.riser, 0.1524, 0.08, 0.2);
      l.tread = num(it.tread, 0.3, 0.2, 0.6);
    }
    if (kind === 'wall' && (it.cap === 'same' || it.cap === 'midnight')) l.cap = it.cap;
    if (kind === 'fence' && (it.topper === 'lattice' || it.topper === 'cap')) l.topper = it.topper;
    // Curbs: how much stands above grade (0 to the unit's full 6 1/2 in). Paver edging: soldier or sailor course.
    if (kind === 'edging' && it.reveal !== undefined) l.reveal = num(it.reveal, 0.0762, 0, 0.1651);
    if (kind === 'edging' && (it.course === 'soldier' || it.course === 'sailor')) l.course = it.course;
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
      if (kind === 'pool' && it.coping !== undefined && it.coping !== null) w.coping = num(it.coping, 0.25, 0, 1);
    }
    plan.water.push(w);
  }

  for (const it of arr(o.plants)) {
    const position = vec(it.position);
    if (!position) continue;
    const p: PlantPlacement = { ...base(it, 'plant'), catalogId: pickPlant(it.catalogId, warnings), position };
    if (it.existing === true) p.existing = true;
    if (it.scale !== undefined) p.scale = num(it.scale, 1, 0.6, 1.4);
    if (typeof it.container === 'string' && ['1g', '2g', '5g', '15g', '24b', '36b', '48b'].includes(it.container)) p.container = it.container as PlantPlacement['container'];
    plan.plants.push(p);
  }

  for (const it of arr(o.features)) {
    const position = vec(it.position);
    if (!position) continue;
    const id = pickFeature(it.catalogId, warnings);
    if (!id) continue;
    const f: FeaturePlacement = { ...base(it, 'feature'), catalogId: id, position, rotationDeg: num(it.rotationDeg, 0, -360, 360) };
    if (typeof it.materialId === 'string' && materialById.get(it.materialId)?.use === 'hardscape') f.materialId = it.materialId;
    const offered = featureById.get(id)?.options;
    if (offered && it.options && typeof it.options === 'object') {
      const o: Record<string, boolean> = {};
      for (const { key } of offered) if (typeof (it.options as Record<string, unknown>)[key] === 'boolean') o[key] = (it.options as Record<string, boolean>)[key];
      if (Object.keys(o).length) f.options = o;
    }
    if (Array.isArray(it.size) && it.size.length === 3 && it.size.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) f.size = [num(it.size[0], 1, 0.1, 6), num(it.size[1], 1, 0.02, 6), num(it.size[2], 1, 0.05, 4)];
    if (it.planted === false) f.planted = false;
    if (it.cover === 'open' || it.cover === 'closed' || it.cover === 'off') f.cover = it.cover;
    if (typeof it.steps === 'boolean') f.steps = it.steps;
    plan.features.push(f);
  }

  const models: ModelPlacement[] = [];
  for (const it of arr(o.models)) {
    const polygon = pts(it.polygon, 3);
    if (!polygon || area(polygon) < 0.02 || typeof it.asset !== 'string' || !it.asset || it.asset.length > 200) continue;
    const m: ModelPlacement = {
      ...base(it, 'model'),
      polygon,
      asset: it.asset,
      kind: it.kind === 'image' ? 'image' : 'glb',
      turn: (((Math.round(num(it.turn, 0)) % 4) + 4) % 4) as ModelPlacement['turn'],
      fit: it.fit === 'stretch' ? 'stretch' : 'contain',
    };
    if (it.height !== undefined && it.height !== null) m.height = num(it.height, 1, 0.1, 12);
    models.push(m);
  }
  if (models.length) plan.models = models;

  const rulers: Ruler[] = [];
  for (const it of arr(o.rulers)) {
    const a = vec(it.a), b = vec(it.b);
    if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.02) continue;
    const r: Ruler = { id: typeof it.id === 'string' && it.id ? it.id : uid('ruler'), a, b };
    if (typeof it.label === 'string' && it.label.trim()) r.label = it.label.trim().slice(0, 60);
    rulers.push(r);
    if (rulers.length >= 300) break;
  }
  if (rulers.length) plan.rulers = rulers;

  const u = o.utilities as Record<string, unknown> | undefined;
  if (u && typeof u === 'object') {
    const lines: UtilityLine[] = [], points: UtilityPoint[] = [];
    for (const it of arr(u.lines)) {
      const points2 = pts(it.points, 2, true);
      if (!points2) continue;
      let len = 0;
      for (let i = 1; i < points2.length; i++) len += Math.hypot(points2[i][0] - points2[i - 1][0], points2[i][1] - points2[i - 1][1]);
      if (len < 0.05) continue;
      const runs: UtilityRun[] = [];
      for (const r of arr(it.runs)) {
        const kind = typeof r.kind === 'string' && r.kind in UTILITY_DEFAULT_COVER ? (r.kind as UtilityKind) : null;
        if (!kind) {
          warnings.push('A utility run of an unknown kind was left out.');
          continue;
        }
        const run: UtilityRun = {
          kind,
          label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 80) : UTILITY_KIND_NAME[kind],
          od: num(r.od, 0.027, 0.005, 0.3),
          cover: num(r.cover, UTILITY_DEFAULT_COVER[kind], 0, 3),
        };
        if (typeof r.code === 'string' && r.code.trim()) run.code = r.code.trim().slice(0, 120);
        if (r.tracer === true) run.tracer = true;
        runs.push(run);
        if (runs.length >= 6) break;
      }
      if (!runs.length) continue;
      const line: UtilityLine = { ...base(it, 'utility'), points: points2, runs };
      if (it.gap !== undefined && it.gap !== null) line.gap = num(it.gap, 0.15, 0, 1);
      lines.push(line);
      if (lines.length >= 300) break;
    }
    for (const it of arr(u.points)) {
      const position = vec(it.position);
      if (!position) continue;
      if (typeof it.kind !== 'string' || !(it.kind in UTILITY_POINT_NAME)) {
        warnings.push('A utility point of an unknown kind was left out.');
        continue;
      }
      const pt: UtilityPoint = { ...base(it, 'utility-point'), kind: it.kind as UtilityPointKind, position };
      if (typeof it.label === 'string' && it.label.trim()) pt.label = it.label.trim().slice(0, 60);
      if (it.rotationDeg !== undefined && it.rotationDeg !== null) pt.rotationDeg = num(it.rotationDeg, 0, -360, 360);
      points.push(pt);
      if (points.length >= 300) break;
    }
    if (lines.length || points.length) plan.utilities = { lines, points };
  }

  return { plan, warnings: [...new Set(warnings)] };
}
