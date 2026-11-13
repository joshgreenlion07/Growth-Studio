import { FEATURES, MATERIALS, PLANTS, featureById, materialById, plantById, sizeAt, type FeatureGroup, type MaterialUse, type PlantGroup } from '../siteplan/catalog';
import { area, fmtFeet, polylineLength } from '../siteplan/geometry';
import { SAMPLES } from '../siteplan/samples';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { cleanPlan } from '../siteplan/validate';
import { expandPlants } from '../builder/build';
import { groundModel } from '../builder/ground';
import { Studio } from '../engine/studio';
import { MOODS, type Mood } from '../engine/sky';
import type { Quality } from '../engine/post';
import { PlanEditor, type Tool } from './planeditor';
import { prepareImage, readPlan, type SourceKind } from './reader';
import { pdfFirstPage } from './pdf';

/* ------------------------------------------------------------------ */
/* Small DOM helpers                                                   */

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c != null) el.append(c);
  return el;
}
const ft = (m: number) => m * 3.28084;
const toM = (f: number) => f / 3.28084;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

interface Claude {
  use(name: string): Promise<unknown>;
}
type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: (input: string, opts?: Record<string, unknown>) => Promise<unknown>;
  limits: () => Promise<{ images?: unknown }>;
};
type Downloads = { save(r: { filename: string; data: Blob | string }): Promise<unknown> };
const claude = (window as unknown as { claude?: Claude }).claude;

/* ------------------------------------------------------------------ */
/* App state                                                           */

/** Embed mode (`?embed=1`): the 3D view alone, in an iframe, fed a plan by the parent page. */
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) document.documentElement.classList.add('embed');

/** Embed mode starts with a bare lot, so no sample yard flashes before the parent's plan arrives. */
const emptyYard = () => cleanPlan({ site: { name: 'Yard', boundary: [[0, 0], [18, 0], [18, 14], [0, 14]] } }).plan;

let plan: SitePlan = EMBED ? emptyYard() : SAMPLES[0].make();
let planName = plan.site.name;
const history: string[] = [];
let future: string[] = [];
let studio: Studio | null = null;
let editor: PlanEditor;
let rebuildTimer = 0;
let sample: SampleFn | null = null;
let downloads: Downloads | null = null;
let isSample = !EMBED;

function snapshot() {
  history.push(JSON.stringify(plan));
  if (history.length > 60) history.shift();
  future = [];
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  future.push(JSON.stringify(plan));
  plan = JSON.parse(prev);
  applyPlan(false);
}

function redo() {
  const next = future.pop();
  if (!next) return;
  history.push(JSON.stringify(plan));
  plan = JSON.parse(next);
  applyPlan(false);
}

function toast(text: string, kind: 'ok' | 'warn' = 'ok') {
  const t = $('#toast');
  t.textContent = text;
  t.dataset.kind = kind;
  t.hidden = false;
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(window.setTimeout(() => (t.hidden = true), 4200));
}

/* ------------------------------------------------------------------ */
/* 3D                                                                   */

function bootStudio() {
  const host = $('#scene');
  try {
    studio = new Studio(host);
  } catch (e) {
    $('#scene-error').hidden = false;
    $('#scene-error').textContent = EMBED
      ? 'This browser could not start 3D (WebGL). Try Chrome or Edge on a computer for the 3D view.'
      : 'This browser could not start 3D (WebGL). The plan view still works. Try Chrome or Edge on a computer for the full 3D view.';
    console.error(e);
    return;
  }
  studio.onViewsChanged = renderViews;
  studio.setPlan(plan);
  $('#loading').hidden = true;
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  $('#updating').hidden = false;
  rebuildTimer = window.setTimeout(() => {
    try {
      studio?.setPlan(plan, true);
    } catch (e) {
      console.error(e);
      toast('Part of the plan could not be built in 3D. Check the last change.', 'warn');
    }
    $('#updating').hidden = true;
    renderPlantList();
  }, 450);
}

function applyPlan(refit: boolean) {
  editor.setPlan(plan, refit);
  renderInspector();
  scheduleRebuild();
  $<HTMLInputElement>('#project-name').value = planName;
  $('#sample-badge').hidden = !isSample;
}

function renderViews() {
  const box = $('#views');
  box.replaceChildren();
  for (const v of studio?.views ?? []) {
    const b = h('button', { type: 'button', class: 'view-btn', text: v.label });
    b.addEventListener('click', () => {
      studio?.goTo(v.id);
      box.querySelectorAll('.view-btn').forEach((x) => x.removeAttribute('aria-pressed'));
      b.setAttribute('aria-pressed', 'true');
    });
    box.append(b);
  }
}

/* ------------------------------------------------------------------ */
/* Plan tools                                                           */

type ToolKey = 'select' | 'area' | 'line' | 'water' | 'plant' | 'feature' | 'boundary' | 'scale';
let toolKey: ToolKey = 'select';
const pick = {
  zone: 'bed' as 'turf' | 'bed' | 'hardscape',
  zoneMat: { turf: 'artificial-turf', bed: 'black-mulch', hardscape: 'paver-ashlar-gray' } as Record<string, string>,
  line: 'fence' as 'wall' | 'fence' | 'edging',
  lineMat: { wall: 'wall-tan-charcoal-cap', fence: 'fence-gray-lattice', edging: 'curb-charcoal' } as Record<string, string>,
  water: 'pondless' as 'pond' | 'pool' | 'fountain' | 'stream' | 'pondless',
  plant: 'italian-cypress',
  feature: 'fire-table',
};

function currentTool(): Tool {
  switch (toolKey) {
    case 'area': return { kind: 'area', zone: pick.zone, catalogId: pick.zoneMat[pick.zone] };
    case 'line': return { kind: 'line', line: pick.line, catalogId: pick.lineMat[pick.line], height: pick.line === 'fence' ? 1.83 : pick.line === 'wall' ? 0.6 : 0.1 };
    case 'water': return { kind: 'water', water: pick.water };
    case 'plant': return { kind: 'plant', catalogId: pick.plant };
    case 'feature': return { kind: 'feature', catalogId: pick.feature };
    case 'boundary': return { kind: 'boundary' };
    case 'scale': return { kind: 'scale' };
    default: return { kind: 'select' };
  }
}

function setToolKey(k: ToolKey) {
  toolKey = k;
  document.querySelectorAll<HTMLButtonElement>('#tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === k)));
  if (k !== 'select') snapshotPending = true;
  editor.setTool(currentTool());
  renderToolOptions();
}
let snapshotPending = false;

function selectEl(id: string, options: { value: string; label: string; group?: string }[], value: string, onChange: (v: string) => void, label: string) {
  const sel = h('select', { id, 'aria-label': label });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const o of options) {
    const opt = h('option', { value: o.value, text: o.label });
    if (o.group) {
      let g = groups.get(o.group);
      if (!g) {
        g = h('optgroup', { label: o.group });
        groups.set(o.group, g);
        sel.append(g);
      }
      g.append(opt);
    } else sel.append(opt);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

const matOptions = (use: MaterialUse) => MATERIALS.filter((m) => m.use === use).map((m) => ({ value: m.id, label: m.name, group: m.group }));
const plantOptions = () => PLANTS.map((p) => ({ value: p.id, label: p.name, group: p.group as PlantGroup }));
const featureOptions = () => FEATURES.map((f) => ({ value: f.id, label: f.name, group: f.group as FeatureGroup }));

function renderToolOptions() {
  const box = $('#tool-options');
  box.replaceChildren();
  const refresh = () => editor.setTool(currentTool());
  if (toolKey === 'area') {
    box.append(
      selectEl('opt-zone', [{ value: 'hardscape', label: 'Patio or path' }, { value: 'bed', label: 'Planting bed' }, { value: 'turf', label: 'Lawn or turf' }], pick.zone, (v) => {
        pick.zone = v as typeof pick.zone;
        renderToolOptions();
        refresh();
      }, 'Area type'),
      selectEl('opt-zone-mat', matOptions(pick.zone === 'turf' ? 'turf' : pick.zone === 'bed' ? 'bed' : 'hardscape'), pick.zoneMat[pick.zone], (v) => {
        pick.zoneMat[pick.zone] = v;
        refresh();
      }, 'Material'),
    );
  } else if (toolKey === 'line') {
    box.append(
      selectEl('opt-line', [{ value: 'fence', label: 'Fence' }, { value: 'wall', label: 'Wall' }, { value: 'edging', label: 'Curb or edging' }], pick.line, (v) => {
        pick.line = v as typeof pick.line;
        renderToolOptions();
        refresh();
      }, 'Line type'),
      selectEl('opt-line-mat', matOptions(pick.line), pick.lineMat[pick.line], (v) => {
        pick.lineMat[pick.line] = v;
        refresh();
      }, 'Style'),
    );
  } else if (toolKey === 'water') {
    box.append(selectEl('opt-water', [
      { value: 'pondless', label: 'Pondless waterfall' },
      { value: 'stream', label: 'Stream' },
      { value: 'pond', label: 'Pond' },
      { value: 'pool', label: 'Pool' },
      { value: 'fountain', label: 'Fountain basin' },
    ], pick.water, (v) => {
      pick.water = v as typeof pick.water;
      refresh();
    }, 'Water type'));
  } else if (toolKey === 'plant') {
    box.append(selectEl('opt-plant', plantOptions(), pick.plant, (v) => {
      pick.plant = v;
      refresh();
    }, 'Plant'));
  } else if (toolKey === 'feature') {
    box.append(selectEl('opt-feature', featureOptions(), pick.feature, (v) => {
      pick.feature = v;
      refresh();
    }, 'Feature'));
  }
  box.hidden = !box.childElementCount;
}

/* ------------------------------------------------------------------ */
/* Inspector                                                            */

function field(label: string, control: HTMLElement, hint?: string) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control, hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

function numInput(id: string, value: number, step: number, min: number, max: number, onChange: (v: number) => void, unit = 'ft') {
  const inp = h('input', { id, type: 'number', step, min, max, value: +value.toFixed(2), inputmode: 'decimal' });
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  });
  return h('span', { class: 'num' }, inp, h('span', { class: 'unit', text: unit }));
}

function check(id: string, label: string, value: boolean, onChange: (v: boolean) => void) {
  const inp = h('input', { id, type: 'checkbox' });
  inp.checked = value;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'check' }, inp, h('span', { text: label }));
}

function changed(reason = 'edit') {
  editor.setPlan(plan);
  scheduleRebuild();
  if (reason === 'structure') renderInspector();
}

function confirmAI(it: { source?: string; confidence?: number; note?: string }) {
  if (it.source !== 'ai') return null;
  const low = (it.confidence ?? 1) < 0.6;
  const box = h('div', { class: `ai-note ${low ? 'is-low' : ''}` },
    h('p', { text: `${low ? 'Check this. ' : ''}Read from the plan, ${Math.round((it.confidence ?? 0) * 100)}% sure.${it.note ? ` ${it.note}` : ''}` }));
  const b = h('button', { type: 'button', class: 'btn btn-small', text: 'Looks right' });
  b.addEventListener('click', () => {
    snapshot();
    it.source = 'person';
    it.confidence = 1;
    changed('structure');
  });
  box.append(b);
  return box;
}

function renderInspector() {
  const box = $('#inspector');
  box.replaceChildren();
  const sel = editor.selected;
  if (!sel) {
    box.append(h('p', { class: 'muted', text: 'Select an item on the plan to change it, or pick a tool above to draw.' }));
    const flagged = [...plan.zones, ...plan.lines, ...plan.plants, ...plan.features, ...plan.water].filter((x) => x.source === 'ai' && (x.confidence ?? 1) < 0.6).length;
    if (flagged) box.append(h('p', { class: 'ai-note is-low', text: `${flagged} item${flagged > 1 ? 's' : ''} read from the plan need checking. They have an amber outline.` }));
    return;
  }
  const del = h('button', { type: 'button', class: 'btn btn-danger btn-small', text: 'Delete' });
  del.addEventListener('click', () => {
    snapshot();
    editor.deleteSelected();
  });

  if (sel.list === 'site') {
    const s = plan.site;
    const name = h('input', { id: 'site-name', type: 'text', value: s.name });
    name.addEventListener('change', () => { s.name = name.value; planName = name.value; $<HTMLInputElement>('#project-name').value = planName; });
    const edges = s.boundary.map((_, i) => ({ value: String(i), label: `Edge ${i + 1} (${fmtFeet(Math.hypot(s.boundary[(i + 1) % s.boundary.length][0] - s.boundary[i][0], s.boundary[(i + 1) % s.boundary.length][1] - s.boundary[i][1]))})` }));
    box.append(
      h('h3', { text: 'Property' }),
      field('Name', name),
      field('Street side', selectEl('site-street', [{ value: '-1', label: 'No street shown' }, ...edges], String(s.streetEdge ?? -1), (v) => { snapshot(); s.streetEdge = v === '-1' ? undefined : +v; changed(); }, 'Street side')),
      field('North', numInput('site-north', s.northAngleDeg, 5, -360, 360, (v) => { snapshot(); s.northAngleDeg = v; changed(); }, '°'), 'Degrees clockwise from the top of the plan. Sets where the sun comes from.'),
      field('Latitude', numInput('site-lat', s.latitude, 0.01, -60, 60, (v) => { s.latitude = v; changed(); }, '°')),
      h('p', { class: 'muted', text: `Lot area ${Math.round(ft(1) ** 2 * area(s.boundary)).toLocaleString()} sq ft. Use the Property line tool to redraw it.` }),
    );
    return;
  }

  if (sel.list === 'zones') {
    const z = plan.zones.find((x) => x.id === sel.id)!;
    const use: MaterialUse = z.kind === 'turf' ? 'turf' : z.kind === 'bed' ? 'bed' : 'hardscape';
    box.append(h('h3', { text: z.kind === 'turf' ? 'Lawn or turf' : z.kind === 'bed' ? 'Planting bed' : 'Patio or path' }), confirmAI(z) ?? '');
    box.append(field('Material', selectEl('z-mat', matOptions(use), z.catalogId, (v) => { snapshot(); z.catalogId = v; changed(); }, 'Material')));
    if (z.kind === 'hardscape') {
      box.append(field('Border', selectEl('z-border', [{ value: '', label: 'No border' }, ...matOptions('border')], z.border?.catalogId ?? '', (v) => {
        snapshot();
        z.border = v ? { catalogId: v, width: z.border?.width ?? 0.2 } : undefined;
        if (!v) z.borderLights = false;
        changed('structure');
      }, 'Border')));
      if (z.border) {
        box.append(
          field('Border width', numInput('z-bw', z.border.width * 39.37, 1, 3, 24, (v) => { snapshot(); z.border!.width = v / 39.37; changed(); }, 'in')),
          check('z-bl', 'Lights in the border', !!z.borderLights, (v) => { snapshot(); z.borderLights = v; changed(); }),
        );
      }
    }
    if (z.kind === 'bed') {
      box.append(field('Mass planting', selectEl('z-fill', [{ value: '', label: 'None' }, ...plantOptions()], z.fill?.catalogId ?? '', (v) => {
        snapshot();
        z.fill = v ? { catalogId: v, spacing: plantById.get(v)!.spacing } : undefined;
        changed('structure');
      }, 'Mass planting')));
      if (z.fill) box.append(field('Spacing', numInput('z-sp', ft(z.fill.spacing), 0.5, 0.5, 30, (v) => { snapshot(); z.fill!.spacing = toM(v); changed(); }), 'On center.'));
      box.append(check('z-raised', 'Raised planter', !!z.raised, (v) => {
        snapshot();
        z.raised = v ? { wallCatalogId: 'wall-tan-charcoal-cap', height: 0.6 } : undefined;
        changed('structure');
      }));
      if (z.raised) {
        box.append(
          field('Planter wall', selectEl('z-rw', matOptions('wall'), z.raised.wallCatalogId, (v) => { snapshot(); z.raised!.wallCatalogId = v; changed(); }, 'Planter wall')),
          field('Height', numInput('z-rh', ft(z.raised.height), 0.25, 0.75, 4, (v) => { snapshot(); z.raised!.height = toM(v); changed(); })),
        );
      }
    }
    box.append(h('p', { class: 'muted', text: `${Math.round(ft(1) ** 2 * area(z.polygon)).toLocaleString()} sq ft` }), del);
    return;
  }

  if (sel.list === 'lines') {
    const l = plan.lines.find((x) => x.id === sel.id)!;
    box.append(h('h3', { text: l.kind === 'fence' ? 'Fence' : l.kind === 'wall' ? 'Wall' : 'Curb or edging' }), confirmAI(l) ?? '');
    box.append(field('Style', selectEl('l-mat', matOptions(l.kind), l.catalogId, (v) => { snapshot(); l.catalogId = v; changed(); }, 'Style')));
    if (l.kind !== 'edging') box.append(field('Height', numInput('l-h', ft(l.height), 0.25, 0.5, l.kind === 'wall' ? 21 : 10, (v) => { snapshot(); l.height = toM(v); changed(); })));
    box.append(h('p', { class: 'muted', text: `${Math.round(ft(polylineLength(l.points)))} linear ft` }), del);
    return;
  }

  if (sel.list === 'water') {
    const w = plan.water.find((x) => x.id === sel.id)!;
    const names = { pond: 'Pond', pool: 'Pool', fountain: 'Fountain basin', stream: 'Stream', pondless: 'Pondless waterfall' };
    box.append(h('h3', { text: names[w.kind] }), confirmAI(w) ?? '');
    if (w.kind === 'stream' || w.kind === 'pondless') {
      box.append(
        field('Width', numInput('w-w', ft(w.width ?? 0.8), 0.5, 1, 12, (v) => { snapshot(); w.width = toM(v); changed(); })),
        field('Waterfalls', numInput('w-f', w.falls ?? 2, 1, 0, 8, (v) => { snapshot(); w.falls = Math.round(v); changed(); }, 'drops')),
        check('w-l', 'Lights under the falls', w.lights !== false, (v) => { snapshot(); w.lights = v; changed(); }),
      );
    } else {
      box.append(field('Depth', numInput('w-d', ft(w.depth), 0.25, 0.5, 10, (v) => { snapshot(); w.depth = toM(v); changed(); })));
      if (w.kind === 'pool') box.append(check('w-ledge', 'Tanning ledge on the first edge', !!w.ledge, (v) => { snapshot(); w.ledge = v; changed(); }));
    }
    box.append(del);
    return;
  }

  if (sel.list === 'plants') {
    const p = plan.plants.find((x) => x.id === sel.id)!;
    const spec = plantById.get(p.catalogId)!;
    box.append(h('h3', { text: spec.name }), confirmAI(p) ?? '');
    box.append(
      field('Plant', selectEl('p-sp', plantOptions(), p.catalogId, (v) => { snapshot(); p.catalogId = v; changed('structure'); }, 'Plant')),
      check('p-ex', 'Already in the yard (keep current size)', !!p.existing, (v) => { snapshot(); p.existing = v; changed(); }),
    );
    const rows = [0, 1, 3, 5].map((y) => {
      const s = sizeAt(spec, y);
      return h('tr', {}, h('td', { text: y === 0 ? 'Install' : `${y} yr` }), h('td', { text: fmtFeet(s.height) }), h('td', { text: fmtFeet(s.spread) }));
    });
    box.append(
      h('table', { class: 'mini' }, h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Height' }), h('th', { text: 'Width' }))), h('tbody', {}, ...rows)),
      h('p', { class: 'muted', text: `${spec.container} at install. ${spec.evergreen ? 'Evergreen' : 'Deciduous or seasonal'}. Sizes are typical starting values.` }),
      del,
    );
    return;
  }

  if (sel.list === 'features') {
    const f = plan.features.find((x) => x.id === sel.id)!;
    const spec = featureById.get(f.catalogId)!;
    box.append(h('h3', { text: spec.name }), confirmAI(f) ?? '');
    const rot = h('input', { id: 'f-rot', type: 'range', min: 0, max: 359, step: 5, value: ((f.rotationDeg % 360) + 360) % 360 });
    rot.addEventListener('input', () => { f.rotationDeg = +rot.value; editor.draw(); });
    rot.addEventListener('change', () => { snapshot(); changed(); });
    box.append(
      field('Feature', selectEl('f-sp', featureOptions(), f.catalogId, (v) => { snapshot(); f.catalogId = v; changed('structure'); }, 'Feature')),
      field('Turn', rot, 'Or press R on the plan.'),
      h('p', { class: 'muted', text: `${fmtFeet(spec.footprint[0])} by ${fmtFeet(spec.footprint[1])}` }),
      del,
    );
    return;
  }

  if (sel.list === 'structures') {
    const s = plan.structures.find((x) => x.id === sel.id)!;
    box.append(
      h('h3', { text: 'Existing building' }),
      field('Type', selectEl('s-k', [{ value: 'house', label: 'House' }, { value: 'garage', label: 'Garage' }, { value: 'shed', label: 'Shed' }], s.kind, (v) => { snapshot(); s.kind = v as typeof s.kind; changed(); }, 'Type')),
      field('Wall height', numInput('s-h', ft(s.height), 0.5, 6, 30, (v) => { snapshot(); s.height = toM(v); changed(); })),
      del,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Plant list                                                           */

function renderPlantList() {
  const body = $('#plant-list-body');
  if (!body) return;
  const counts = new Map<string, number>();
  for (const p of expandPlants(plan, groundModel(plan))) if (!p.existing) counts.set(p.catalogId, (counts.get(p.catalogId) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const s = plantById.get(id)!;
    const s5 = sizeAt(s, 5);
    return h('tr', {}, h('td', { text: s.name }), h('td', { class: 'num-cell', text: String(n) }), h('td', { text: s.container }), h('td', { class: 'num-cell', text: `${fmtFeet(s5.height)} × ${fmtFeet(s5.spread)}` }));
  });
  body.replaceChildren(...rows);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  $('#plant-total').textContent = `${total} plants`;
  // Hardscape and surface totals.
  const sq = new Map<string, number>();
  for (const z of plan.zones) sq.set(z.catalogId, (sq.get(z.catalogId) ?? 0) + area(z.polygon) * ft(1) ** 2);
  const lf = new Map<string, number>();
  for (const l of plan.lines) lf.set(l.catalogId, (lf.get(l.catalogId) ?? 0) + ft(polylineLength(l.points)));
  $('#material-list-body').replaceChildren(
    ...[...sq.entries()].map(([id, v]) => h('tr', {}, h('td', { text: materialById.get(id)?.name ?? id }), h('td', { class: 'num-cell', text: `${Math.round(v).toLocaleString()} sq ft` }))),
    ...[...lf.entries()].map(([id, v]) => h('tr', {}, h('td', { text: materialById.get(id)?.name ?? id }), h('td', { class: 'num-cell', text: `${Math.round(v)} linear ft` }))),
  );
}

/* ------------------------------------------------------------------ */
/* Reading a plan or photo                                              */

let readCtl: AbortController | null = null;
let readFile: { blob: Blob; url: string; width: number; height: number } | null = null;

async function onReadFile(file: File) {
  const status = $('#read-status');
  status.textContent = 'Opening the file…';
  try {
    const src = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? await pdfFirstPage(file) : file;
    readFile = await prepareImage(src);
    $<HTMLImageElement>('#read-preview').src = readFile.url;
    $('#read-preview-wrap').hidden = false;
    $<HTMLButtonElement>('#read-go').disabled = false;
    $<HTMLButtonElement>('#read-trace').disabled = false;
    status.textContent = '';
  } catch (e) {
    console.error(e);
    status.textContent = 'That file could not be opened. Use a PDF, JPG, PNG or HEIC exported as JPG.';
  }
}

/** Outside Claude: the optional server in server/read-plan-server.mjs. */
async function serverAsk(prompt: string, image: Blob, signal: AbortSignal): Promise<unknown> {
  const buf = new Uint8Array(await image.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const r = await fetch('/api/read-plan', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, image: btoa(bin), mediaType: image.type || 'image/jpeg' }) });
  if (!r.ok) throw { code: r.status === 413 ? 'image_rejected' : 'upstream_error', message: (await r.json().catch(() => ({}))).error };
  return r.json();
}
let serverReader = false;

async function onRead() {
  if (!readFile) return;
  const status = $('#read-status');
  if (!sample && !serverReader) {
    status.textContent = 'Reading plans uses Claude, which is only available when this page is open in Claude. You can still trace the plan by hand.';
    return;
  }
  const kind = ($<HTMLInputElement>('input[name="read-kind"]:checked')?.value ?? 'blueprint') as SourceKind;
  const w = parseFloat($<HTMLInputElement>('#read-w').value), d = parseFloat($<HTMLInputElement>('#read-d').value);
  const req = { kind, notes: $<HTMLTextAreaElement>('#read-notes').value, lotFeet: w > 0 && d > 0 ? { width: w, depth: d } : undefined };
  readCtl = new AbortController();
  const go = $<HTMLButtonElement>('#read-go');
  go.disabled = true;
  $('#read-stop').hidden = false;
  status.textContent = 'Claude is reading the plan. This usually takes 30 to 90 seconds.';
  try {
    const s = sample;
    const result = await readPlan(
      s ? (prompt, image, signal) => s.json(prompt, { images: image, modelTier: 'complex', signal, cache: false }) : serverAsk,
      req, readFile.blob, readCtl.signal,
    );
    snapshot();
    plan = result.plan;
    planName = plan.site.name;
    isSample = false;
    const img = new Image();
    img.src = readFile.url;
    await img.decode().catch(() => {});
    const mpp = result.imageWidthMeters ? result.imageWidthMeters / readFile.width : null;
    editor.underlay = mpp ? { image: img, mpp, origin: [0, 0], opacity: 0.55 } : { image: img, mpp: 0.02, origin: [0, 0], opacity: 0.55 };
    closeDialog();
    applyPlan(true);
    const flagged = [...plan.zones, ...plan.lines, ...plan.plants, ...plan.features, ...plan.water].filter((x) => (x.confidence ?? 1) < 0.6).length;
    toast(`Plan read: ${plan.zones.length} areas, ${plan.plants.length} plants, ${plan.features.length} features.${flagged ? ` ${flagged} need checking.` : ''}${result.warnings.length ? ` ${result.warnings[0]}` : ''}`);
    $<HTMLInputElement>('#underlay-on').checked = true;
    $('#underlay-row').hidden = false;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error(e);
    status.textContent =
      err.code === 'cancelled' ? 'Stopped.'
      : err.code === 'not_granted' ? 'Claude was not allowed for this page, so the plan was not read. You can still trace it by hand.'
      : err.code === 'rate_limited' ? 'Claude is busy or your usage limit was reached. Try again in a few minutes.'
      : err.code === 'invalid_json' ? 'Claude replied, but not in a form the app could read. Try again, or add notes about what the plan shows.'
      : err.code === 'images_unavailable' ? 'This view cannot send images to Claude. Open the page in the Claude app.'
      : 'The plan could not be read. Check your connection and try again.';
  } finally {
    go.disabled = false;
    $('#read-stop').hidden = true;
    readCtl = null;
  }
}

function onTrace() {
  if (!readFile) return;
  const img = new Image();
  img.src = readFile.url;
  img.decode().catch(() => {}).finally(() => {
    // Start with the image about 20 m wide; the Scale tool sets it exactly.
    const w = parseFloat($<HTMLInputElement>('#read-w').value);
    const mpp = w > 0 ? toM(w) / readFile!.width : 20 / readFile!.width;
    editor.underlay = { image: img, mpp, origin: [0, 0], opacity: 0.6 };
    closeDialog();
    editor.fit();
    $<HTMLInputElement>('#underlay-on').checked = true;
    $('#underlay-row').hidden = false;
    setToolKey('scale');
    toast('Click both ends of a length you know on the plan to set the scale, then trace with the tools.');
  });
}

function openDialog() {
  const d = $<HTMLDialogElement>('#read-dialog');
  $('#read-ai-note').hidden = !!sample;
  d.showModal();
}
function closeDialog() {
  $<HTMLDialogElement>('#read-dialog').close();
}

/* ------------------------------------------------------------------ */
/* Save, open, export                                                   */

async function saveFile(filename: string, data: Blob | string) {
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      toast(`Saved ${filename}.`);
      return;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return;
      console.error(e);
    }
  }
  // Outside Claude (local dev or a hosted copy) a normal download works.
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data]) : data);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'yard';

async function exportImage() {
  if (!studio) return;
  const btn = $<HTMLButtonElement>('#btn-image');
  btn.disabled = true;
  toast('Rendering a 4K image…');
  try {
    const blob = await studio.exportStill(3840);
    const yrs = studio.state.years;
    await saveFile(`${slug(planName)}-${yrs === 0 ? 'install' : `${yrs}yr`}.png`, blob);
  } catch (e) {
    console.error(e);
    toast('The image could not be rendered. Try the Balanced quality setting.', 'warn');
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Wire up                                                              */

function setMood(m: Mood) {
  studio?.setMood(m);
  document.querySelectorAll<HTMLButtonElement>('#moods button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === m)));
}

function setYears(y: number) {
  studio?.setYears(y);
  if (!EMBED) {
    editor.years = y;
    editor.draw();
  }
  $<HTMLInputElement>('#growth').value = String(y);
  $('#growth-out').textContent = y === 0 ? 'At install' : y >= 10 ? '10 years' : `${+y.toFixed(1)} year${y === 1 ? '' : 's'}`;
  document.querySelectorAll<HTMLButtonElement>('#growth-steps button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.y! === y)));
  if (!EMBED && editor.selected?.list === 'plants') renderInspector();
}

/** The scene controls under the 3D view. Used by the full app and by embed mode. */
function initDock() {
  // Growth.
  const growth = $<HTMLInputElement>('#growth');
  growth.addEventListener('input', () => setYears(+growth.value));
  document.querySelectorAll<HTMLButtonElement>('#growth-steps button').forEach((b) => b.addEventListener('click', () => setYears(+b.dataset.y!)));

  // Light.
  const moods = $('#moods');
  for (const m of MOODS) {
    const b = h('button', { type: 'button', 'data-mood': m.id, text: m.label });
    b.addEventListener('click', () => setMood(m.id));
    moods.append(b);
  }
  const month = $<HTMLSelectElement>('#month');
  month.addEventListener('change', () => studio?.setDate(new Date(new Date().getFullYear(), +month.value, 21)));

  // Camera and quality.
  $<HTMLSelectElement>('#quality').addEventListener('change', (e) => studio?.setQuality((e.target as HTMLSelectElement).value as Quality));
  $<HTMLInputElement>('#dof').addEventListener('change', (e) => studio?.setLens({ dof: (e.target as HTMLInputElement).checked }));
  $<HTMLInputElement>('#fstop').addEventListener('input', (e) => studio?.setLens({ fStop: +(e.target as HTMLInputElement).value }));
  $<HTMLInputElement>('#wind').addEventListener('input', (e) => studio?.setWind(+(e.target as HTMLInputElement).value));
  $<HTMLInputElement>('#motion').addEventListener('change', (e) => studio?.setMotion((e.target as HTMLInputElement).checked));

  $('#btn-image').addEventListener('click', exportImage);
}

/* ------------------------------------------------------------------ */
/* Embed mode                                                           */

/**
 * Pages allowed to send a plan to the embedded studio (matched against the
 * full `event.origin` of each message). Messages from anywhere else are
 * ignored silently. Add a line here when Area Planner gets a new home.
 */
const EMBED_ALLOWED_PARENT_ORIGINS: RegExp[] = [
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, // local development, any port
  /^https:\/\/area-planner-beta\.vercel\.app$/, // Area Planner beta
  /^https:\/\/area-planner[a-z0-9-]*\.vercel\.app$/, // Area Planner production and preview deployments
  /^https:\/\/([a-z0-9-]+\.)*greenlionlandscape\.com$/, // Green Lion's own site and subdomains
];

const EMBED_EMPTY_NOTE = 'Draw areas in the Design tab to see them here';
/** Messages that arrive closer together than this are applied as one rebuild. */
const EMBED_DEBOUNCE_MS = 150;

let embedPending: { plan: unknown; name: string; refit: boolean } | null = null;
let embedTimer = 0;
let embedOrigin = '';
let embedBooted = false;
let embedBuilt = false;

function embedNote(text: string | null) {
  const box = $('#embed-note');
  box.hidden = !text;
  $('p', box).textContent = text ?? '';
}

function embedReply(ok: boolean, extra: { message?: string; warnings?: string[] } = {}) {
  if (embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'built', ok, ...extra }, embedOrigin);
}

function onEmbedMessage(e: MessageEvent) {
  if (e.source !== window.parent || !EMBED_ALLOWED_PARENT_ORIGINS.some((re) => re.test(e.origin))) return;
  const d = e.data as { source?: unknown; type?: unknown; plan?: unknown; name?: unknown; refit?: unknown } | null;
  if (!d || typeof d !== 'object' || d.source !== 'area-planner' || d.type !== 'siteplan') return;
  embedOrigin = e.origin;
  // Keep only the newest plan. A refit asked for by any message in the burst still happens.
  embedPending = { plan: d.plan, name: typeof d.name === 'string' ? d.name : '', refit: d.refit === true || !!embedPending?.refit };
  clearTimeout(embedTimer);
  if (studio) $('#updating').hidden = false;
  embedTimer = window.setTimeout(applyEmbedPlan, EMBED_DEBOUNCE_MS);
}

function applyEmbedPlan() {
  // A plan that arrives before the studio has started waits for it.
  if (!embedBooted || !embedPending) return;
  const next = embedPending;
  embedPending = null;
  $('#updating').hidden = true;
  if (!studio) return embedReply(false, { message: 'This browser could not start 3D (WebGL).' });
  if (!next.plan || typeof next.plan !== 'object') return embedReply(false, { message: 'The message did not include a plan.' });
  try {
    const res = cleanPlan(next.plan);
    // Without a refit the camera stays put, but only while the lot outline is the same.
    // The parent's origin moves with what is drawn, so a new outline means every
    // coordinate may have shifted and the old camera could be looking at bare ground.
    const sameLot = JSON.stringify(res.plan.site.boundary) === JSON.stringify(plan.site.boundary);
    plan = res.plan;
    planName = next.name.trim().slice(0, 80) || plan.site.name;
    studio.setPlan(plan, embedBuilt && !next.refit && sameLot);
    embedBuilt = true;
    embedNote(plan.zones.length + plan.lines.length + plan.water.length ? null : EMBED_EMPTY_NOTE);
    embedReply(true, res.warnings.length ? { warnings: res.warnings } : {});
  } catch (e) {
    console.error(e);
    embedNote('This plan could not be shown in 3D.');
    // Pass the reason along so the parent page can show what went wrong.
    const why = e instanceof Error ? e.message : String(e);
    embedReply(false, { message: `The plan could not be built in 3D (${why.slice(0, 160)}).` });
  }
}

function initEmbed() {
  initDock();
  // Save image is the one top-bar action kept; it moves into the dock.
  $('.dock').append(h('div', { class: 'dock-group dock-end' }, $('#btn-image')));
  embedNote(EMBED_EMPTY_NOTE);
  window.addEventListener('message', onEmbedMessage);

  const boot = () => {
    if (embedBooted) return;
    bootStudio();
    setYears(3);
    setMood('afternoon');
    embedBooted = true;
    // Tell the parent it can send a plan. Nothing private is in this message.
    // The paver looks the parent can offer for a clicked paver area, so its list always matches the catalog.
    const looks = MATERIALS.filter((m) => (m.use === 'hardscape' && (m.group === 'Pavers' || m.group === 'Porcelain')) || m.use === 'border' || m.use === 'wall').map((m) => ({ id: m.id, name: m.name, use: m.use, line: m.matches ?? '' }));
    window.parent.postMessage({ source: 'growth-studio', type: 'ready', materials: looks }, '*');
    if (studio) studio.onPick = (id) => { if (embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'select', id }, embedOrigin); };
    applyEmbedPlan();
  };
  // The timer covers a frame that is not being painted yet (a hidden tab or panel).
  requestAnimationFrame(boot);
  window.setTimeout(boot, 400);

  if (claude?.use) claude.use('downloads').then((d) => { downloads = (d as Downloads) ?? null; }).catch(() => {});
  (window as unknown as { __gs: unknown }).__gs = { get studio() { return studio; }, get plan() { return plan; } };
}

function init() {
  // Samples.
  const sampleSel = $<HTMLSelectElement>('#sample-select');
  for (const s of SAMPLES) sampleSel.append(h('option', { value: s.id, text: s.name }));
  sampleSel.addEventListener('change', () => {
    const s = SAMPLES.find((x) => x.id === sampleSel.value);
    if (!s) return;
    snapshot();
    plan = s.make();
    planName = plan.site.name;
    isSample = true;
    editor.underlay = null;
    $('#underlay-row').hidden = true;
    applyPlan(true);
  });

  editor = new PlanEditor($('#plan'), plan);
  editor.onChange = (_p, reason) => {
    if (reason !== 'edit' || !snapshotPending) {
      /* history handled by callers */
    }
    scheduleRebuild();
    renderInspector();
  };
  editor.onSelect = () => renderInspector();
  editor.onToolDone = () => setToolKey('select');
  editor.onStatus = (t) => ($('#plan-status').textContent = t);
  editor.onScale = (a: Vec2, b: Vec2) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const row = $('#scale-row');
    row.hidden = false;
    const inp = $<HTMLInputElement>('#scale-ft');
    inp.value = '';
    inp.focus();
    const apply = () => {
      const f = parseFloat(inp.value);
      if (!(f > 0) || !(d > 0)) return;
      const k = toM(f) / d;
      // Scale the underlay and the whole plan together about the origin.
      if (editor.underlay) editor.underlay.mpp *= k;
      const sc = (p: Vec2) => { p[0] *= k; p[1] *= k; };
      plan.site.boundary.forEach(sc);
      for (const z of plan.zones) z.polygon.forEach(sc);
      for (const s of plan.structures) s.polygon.forEach(sc);
      for (const l of plan.lines) l.points.forEach(sc);
      for (const w of plan.water) { w.polygon?.forEach(sc); w.points?.forEach(sc); }
      for (const p of plan.plants) sc(p.position);
      for (const f2 of plan.features) sc(f2.position);
      row.hidden = true;
      setToolKey('select');
      editor.fit();
      scheduleRebuild();
      toast(`Scale set: that line is ${f} ft.`);
    };
    $('#scale-apply').onclick = apply;
    inp.onkeydown = (e) => { if (e.key === 'Enter') apply(); };
  };
  // Snapshot before any edit made on the plan canvas.
  editor.canvas.addEventListener('pointerdown', () => snapshot(), true);

  document.querySelectorAll<HTMLButtonElement>('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => setToolKey(b.dataset.tool as ToolKey)));
  setToolKey('select');

  initDock();

  // Underlay.
  $<HTMLInputElement>('#underlay-on').addEventListener('change', (e) => {
    if (editor.underlay) editor.underlay.opacity = (e.target as HTMLInputElement).checked ? +$<HTMLInputElement>('#underlay-op').value : 0;
    editor.draw();
  });
  $<HTMLInputElement>('#underlay-op').addEventListener('input', (e) => {
    if (editor.underlay) editor.underlay.opacity = +(e.target as HTMLInputElement).value;
    editor.draw();
  });

  // Top bar.
  $<HTMLInputElement>('#project-name').addEventListener('change', (e) => { planName = (e.target as HTMLInputElement).value; plan.site.name = planName; });
  $('#btn-read').addEventListener('click', openDialog);
  $('#btn-save').addEventListener('click', () => saveFile(`${slug(planName)}.siteplan.json`, JSON.stringify(plan, null, 2)));
  const openInput = $<HTMLInputElement>('#open-file');
  $('#btn-open').addEventListener('click', () => openInput.click());
  openInput.addEventListener('change', async () => {
    const f = openInput.files?.[0];
    openInput.value = '';
    if (!f) return;
    try {
      const res = cleanPlan(JSON.parse(await f.text()));
      snapshot();
      plan = res.plan;
      planName = plan.site.name;
      isSample = false;
      editor.underlay = null;
      applyPlan(true);
      toast(res.warnings.length ? `Opened. ${res.warnings[0]}` : 'Opened.');
    } catch {
      toast('That file is not a Growth Studio plan.', 'warn');
    }
  });
  $('#btn-new').addEventListener('click', () => {
    snapshot();
    plan = cleanPlan({ site: { name: 'New yard', boundary: [[0, 0], [18, 0], [18, 14], [0, 14]], streetEdge: 2 } }).plan;
    planName = 'New yard';
    isSample = false;
    editor.underlay = null;
    applyPlan(true);
    setToolKey('boundary');
  });
  $('#btn-plantlist').addEventListener('click', () => {
    renderPlantList();
    $<HTMLDialogElement>('#plant-dialog').showModal();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => (b.closest('dialog') as HTMLDialogElement).close()));

  // Read dialog.
  const fileIn = $<HTMLInputElement>('#read-file');
  fileIn.addEventListener('change', () => fileIn.files?.[0] && onReadFile(fileIn.files[0]));
  const drop = $('#read-drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) onReadFile(f);
  });
  $('#read-go').addEventListener('click', onRead);
  $('#read-stop').addEventListener('click', () => readCtl?.abort());
  $('#read-trace').addEventListener('click', onTrace);

  // Keyboard: undo and redo.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  });
  $('#btn-undo').addEventListener('click', undo);

  // Mobile: switch between plan and 3D.
  document.querySelectorAll<HTMLButtonElement>('#mobile-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      document.body.dataset.pane = b.dataset.pane!;
      document.querySelectorAll('#mobile-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      window.dispatchEvent(new Event('resize'));
    }),
  );

  $<HTMLInputElement>('#project-name').value = planName;
  renderInspector();
  renderPlantList();
  requestAnimationFrame(() => {
    bootStudio();
    setYears(3);
    setMood('afternoon');
  });

  // Capabilities, when opened inside Claude.
  if (!claude?.use && location.protocol.startsWith('http')) {
    // Hosted with the plan-reading server: it answers OPTIONS-free POSTs only, so probe with a tiny bad request.
    fetch('/api/read-plan', { method: 'POST', body: '{}' }).then((r) => { serverReader = r.status === 400; $('#read-ai-note').hidden = serverReader; }).catch(() => {});
  }
  if (claude?.use) {
    claude.use('sample').then((s) => { sample = (s as SampleFn) ?? null; $('#read-ai-note').hidden = !!sample; }).catch(() => {});
    claude.use('downloads').then((d) => { downloads = (d as Downloads) ?? null; }).catch(() => {});
  }
  (window as unknown as { __gs: unknown }).__gs = { get studio() { return studio; }, get plan() { return plan; }, editor };
  void clone;
}

if (EMBED) initEmbed();
else init();
