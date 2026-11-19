import { houseLookLists } from '../siteplan/houselooks';
import { FEATURES, MATERIALS, PLANTS, featureById, featureOption, isAntiqued, isApproved, isOffered, layingName, layingOf, layingsFor, materialById, materialsFor, plantById, sizeAt, swapClassOf, type FeatureGroup, type LayingPattern, type MaterialSpec, type MaterialUse } from '../siteplan/catalog';
import { area, fmtFeet, polylineLength } from '../siteplan/geometry';
import { SAMPLES } from '../siteplan/samples';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { cleanPlan } from '../siteplan/validate';
import { expandPlants } from '../builder/build';
import { BUILD_STAGES, type BuildStage } from '../builder/construction';
import { groundModel } from '../builder/ground';
import { builtLine } from '../builder/linepath';
import { plantPicker } from './plantpicker';
import { wantThumb } from './plantthumbs';
import { lookOf, lookOfPoint, type Look } from './looks';
import { pictureFor, pictureNow, swatchNow } from './swatches';
import { pointKind } from '../siteplan/material-info';
import { padChoices, padLook, padOf } from '../siteplan/pads';
import { LIGHT_COLORS, cleanHex, fixtureSetting } from '../siteplan/truscapes';
import { closeLibrary, libraryCategories, libraryOpen, openLibrary } from './library';
import { LibraryBook } from './librarybook';
import { SceneControls } from './scenecontrols';
import logoUrl from './brand/logo-compact.png';
import { initSecondScreen } from './secondscreen';
import { getApprovals, setApprovals } from '../siteplan/approval';
import { Studio } from '../engine/studio';
// Procedural textures are painted in a worker from here on (see engine/texture-jobs.ts).
import { onTexturesChanged, setTextureRenderer } from '../engine/texture-jobs';
import type { MeasureMode } from '../engine/measure';
import { MOODS, type Mood } from '../engine/sky';
import type { Quality } from '../engine/post';
import { PlanEditor, type Tool } from './planeditor';
import { prepareImage, readPlan, type SourceKind } from './reader';
import { pdfFirstPage } from './pdf';
import { QuickTools } from './quicktools';
import { TouchControls } from './touchcontrols';

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

/**
 * iPad and iPhone (WebKit on iOS and iPadOS, an iPad that reports itself as a Mac included). Their element full screen
 * ends on any quick one-finger swipe down, and a page cannot stop it (WebKit's own dismiss gesture, not a scroll), so
 * dragging to look around or pulling the joystick back would leave it. There the studio's full screen is its fixed
 * layout alone (`section.scene-pane.fs`), never the Fullscreen API; in an embed the parent fills its own page.
 * Any browser there counts (all WebKit), and the "desktop site" mode that reports a Mac. A Mac with no touch does not.
 * navigator.standalone is not used: Mac Safari has it too. Area Planner has the same test.
 */
const APPLE_TOUCH = (() => {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return true;
    if (!/Macintosh/.test(ua)) return false;
    return (navigator.maxTouchPoints || 0) > 1 || 'ontouchend' in document || matchMedia('(any-pointer: coarse)').matches;
  } catch {
    return false;
  }
})();

/**
 * The last touch on the page, ms (performance.now). A full screen that ends within FS_SWIPE_MS of one was ended by the
 * system's swipe down, not by Esc or the exit button, so the studio keeps its full-screen layout. In an embed each
 * touch is also passed to the parent (`{ type: 'touch-input' }`, at most every 300 ms), which does the same.
 */
let lastTouchAt = -1e9;
let touchSentAt = -1e9;
const FS_SWIPE_MS = 1500;
const noteTouch = (e: PointerEvent) => {
  if (e.pointerType !== 'touch') return;
  lastTouchAt = performance.now();
  if (EMBED && embedOrigin && lastTouchAt - touchSentAt > 300) {
    touchSentAt = lastTouchAt;
    window.parent.postMessage({ source: 'growth-studio', type: 'touch-input' }, embedOrigin);
  }
};
window.addEventListener('pointerdown', noteTouch, { capture: true, passive: true });
window.addEventListener('pointermove', noteTouch, { capture: true, passive: true });

/**
 * View-only embed: the parent page shows the 3D view to someone who may look but not change the saved plan (Area
 * Planner's assistant accounts). Set by `?viewer=1` on the embed address and by the parent's
 * `{ type: 'mode', viewer }` message. While on, the studio hides the Library and sends nothing back that would change
 * the plan or the team's settings: no approvals, no feature actions (a door or light used by hand still moves here,
 * as a preview), no dirt marks (the Mark tool is left out of the D-pad). Looking around, build stages, growth, light,
 * measurements, plant labels, the material pointer and Save image all stay. Off by default: today's behavior.
 */
let embedViewer = EMBED && new URLSearchParams(location.search).get('viewer') === '1';
function setViewer(on: boolean) {
  embedViewer = EMBED && on;
  document.documentElement.classList.toggle('viewer', embedViewer);
  if (embedViewer && libraryOpen()) closeLibrary();
  // View-only: no Library, so a held View is a plain tap (use).
  if (studio) studio.nav.onLibrary = embedViewer ? null : libraryHold;
  quick?.setSkip(embedViewer ? ['mark'] : []);
}
if (embedViewer) document.documentElement.classList.add('viewer');

/**
 * Touch mode (iPad, fingers only): on-screen joystick, mode switcher, Home and Use, and finger look and pinch in walk
 * and fly (app/touchcontrols.ts, engine/navigation.ts). In Area Planner it is `?touch=1` on the embed address and the
 * parent's `{ type: 'touch', on }` message. On its own the studio turns it on when the only pointer is coarse (a tablet
 * or phone, no mouse), and the Touch button changes it, kept in localStorage `gs-touch`. Off by default for a mouse and
 * keyboard: nothing changes.
 */
const TOUCH_KEY = 'gs-touch';
function initialTouch(): boolean {
  if (EMBED) return new URLSearchParams(location.search).get('touch') === '1';
  try {
    const saved = localStorage.getItem(TOUCH_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
  } catch {
    /* storage blocked */
  }
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}
let touchOn = initialTouch();
let touchUI: TouchControls | null = null;
function setTouch(on: boolean, save = false) {
  touchOn = on;
  document.documentElement.classList.toggle('touch-ui', on);
  document.getElementById('btn-touch')?.setAttribute('aria-pressed', String(on));
  studio?.nav.setTouchMode(on);
  touchUI?.setOn(on);
  if (save && !EMBED) {
    try {
      localStorage.setItem(TOUCH_KEY, on ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }
}
document.documentElement.classList.toggle('touch-ui', touchOn);

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
  // Painted maps are uploaded through the view's renderer a slice per frame (see texture-jobs.ts).
  setTextureRenderer(studio.renderer);
  // Painted textures arrive from the worker after the build; redraw when they do.
  onTexturesChanged(() => {
    studio?.invalidate();
    studio?.noteEvent('textures', 'painted maps swapped in');
  });
  if (new URLSearchParams(location.search).get('diag') === '1') {
    studio.showDiagnostics(true);
    $<HTMLInputElement>('#diag').checked = true;
  }
  // Phones and tablets start at a lighter quality; show it in the picker.
  $<HTMLSelectElement>('#quality').value = studio.state.quality;
  studio.nav.onConnect = () => toast(`Controller connected. Left stick moves, right stick looks, triggers zoom, bumpers rise and sink, X steps through the measurements, B shows plant labels, Y shows the material pointer, pressing the right stick locks its material, Menu goes home (hold it to show the buttons), View uses what you aim at (hold it for the Library). D-pad: left and right pick a quick tool (dig layers, ${embedViewer ? '' : 'mark, '}tape measure, light, growth, views), up and down use it.`);
  initQuickTools(studio);
  studio.nav.onDisconnect = () => toast('Controller disconnected.');
  studio.onMeasureChanged = (m) => document.querySelectorAll<HTMLButtonElement>('#measure-modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  // The controller never brings the on-screen buttons back by itself: holding Menu does, and holding View opens or
  // closes the Library (engine/navigation.ts).
  studio.nav.onShowControls = () => sceneControls?.showFor();
  studio.nav.onLibrary = embedViewer ? null : libraryHold;
  studio.onNavModeChanged = (m) => {
    document.querySelectorAll<HTMLButtonElement>('#nav-modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    touchUI?.setMode(m);
  };
  touchUI = new TouchControls(host, () => studio);
  $('#btn-touch').addEventListener('click', () => setTouch(!touchOn, true));
  setTouch(touchOn);
  studio.setPlan(plan).then(showStageNote, () => {});
  $('#loading').hidden = true;
  // Area Planner has its own second screen; the studio on its own gets this one.
  if (!EMBED) initSecondScreen({ studio, plan: () => plan, title: () => planName || plan.site.name, button: $<HTMLButtonElement>('#btn-second'), floatHost: $('#scene'), toast: (t) => toast(t, 'warn') });
}

/* ------------------------------------------------------------------ */
/* Quick tools and plant labels                                         */

const PLANT_LABELS_KEY = 'growth-studio.plant-labels';
let quick: QuickTools | null = null;

function initQuickTools(s: Studio) {
  quick = new QuickTools({ studio: () => studio, setStage: (st) => setStage(st), setMood, setYears, enabled: () => !libraryOpen() }, $('#scene'));
  if (embedViewer) quick.setSkip(['mark']);
  s.onQuick = (dir, held) => quick?.press(dir, held);
  s.onUse = () => quick?.use();
  // Used by hand in the 3D view: a sauna's door or lights are its placement options, so the plan keeps them (here,
  // and in Area Planner through the `action` message, which names the option).
  s.onAction = (a) => {
    if (EMBED) {
      // View-only: the door or light moves here as a preview; the parent is not told, so its plan keeps its options.
      if (embedOrigin && !embedViewer) window.parent.postMessage({ source: 'growth-studio', type: 'action', id: a.itemId, key: a.key, on: a.on, ...(a.option ? { option: a.option } : {}), ...(a.values ? { options: a.values() } : {}) }, embedOrigin);
      return;
    }
    const f = a.option || a.values ? plan.features.find((x) => x.id === a.itemId) : null;
    if (f && (a.option || a.values)) {
      f.options = { ...f.options, ...(a.values ? a.values() : { [a.option!]: a.on }) };
      s.settleAction(a);
      if (editor.selected?.list === 'features' && editor.selected.id === f.id) renderInspector();
    }
  };
  // Sound (engine/audio.ts): a button over the 3D view and a volume slider, kept between visits. It starts only after
  // the first click or key, as browsers require.
  const sound = s.audio;
  const soundBtn = $<HTMLButtonElement>('#btn-sound'), volume = $<HTMLInputElement>('#volume');
  if (sound?.available) {
    const sync = () => {
      soundBtn.setAttribute('aria-pressed', String(sound.on));
      soundBtn.querySelector('.lbl')!.textContent = sound.on ? 'Sound' : 'Sound off';
      volume.value = String(sound.volume);
      volume.disabled = !sound.on;
    };
    sound.onChange = sync;
    sync();
    soundBtn.addEventListener('click', () => sound.setOn(!sound.on));
    volume.addEventListener('input', () => sound.setVolume(+volume.value));
  } else {
    soundBtn.hidden = true;
    $('#sound-group').hidden = true;
  }
  // Plant labels: their own switch (B, N, or the Plants button), apart from the measurements, kept between visits.
  const btn = $<HTMLButtonElement>('#btn-plants');
  btn.addEventListener('click', () => s.setPlantLabels(!s.plantLabels));
  s.onPlantLabelsChanged = (on) => {
    btn.setAttribute('aria-pressed', String(on));
    try {
      localStorage.setItem(PLANT_LABELS_KEY, on ? '1' : '0');
    } catch {
      /* not kept */
    }
  };
  try {
    if (localStorage.getItem(PLANT_LABELS_KEY) === '1') s.setPlantLabels(true);
  } catch {
    /* no storage */
  }
  // Marks thrown with the Mark tool: the parent may keep them (3D world points, meters).
  s.onMarksChanged = (marks) => {
    quick?.marksChanged();
    if (EMBED && embedOrigin && !embedViewer) window.parent.postMessage({ source: 'growth-studio', type: 'marks', marks: marks.map((m) => ({ x: +m.x.toFixed(3), z: +m.z.toFixed(3), y: +m.y.toFixed(3) })) }, embedOrigin);
  };
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  $('#updating').hidden = false;
  rebuildTimer = window.setTimeout(() => {
    try {
      // While the Library is open its sample is on screen; the plan is shown again when it closes.
      if (!libraryOpen()) studio?.setPlan(plan, true).then(showStageNote, () => {});
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

const VIEW_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.3"/></svg>';

/** The camera views over the 3D view: a row of buttons, or one menu when the view is narrow (page.html). */
function renderViews() {
  const box = $('#views');
  box.replaceChildren();
  const views = studio?.views ?? [];
  if (!views.length) return;
  const cap = h('span', { class: 'sc-cap', title: 'Camera views' });
  cap.innerHTML = VIEW_ICON;
  const pick = h('select', { id: 'view-select', 'aria-label': 'Camera view' }, h('option', { value: '', text: 'Views' }));
  const go = (id: string) => {
    studio?.goTo(id);
    box.querySelectorAll('.view-btn').forEach((x) => x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.view === id)));
  };
  box.append(cap);
  for (const v of views) {
    const b = h('button', { type: 'button', class: 'sc-btn view-btn', 'data-view': v.id, 'aria-pressed': 'false', text: v.label });
    b.addEventListener('click', () => go(v.id));
    box.append(b);
    pick.append(h('option', { value: v.id, text: v.label }));
  }
  pick.addEventListener('change', () => {
    if (pick.value) go(pick.value);
    pick.value = '';
    pick.blur();
  });
  box.append(pick);
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
    case 'line': return { kind: 'line', line: pick.line, catalogId: pick.lineMat[pick.line], height: pick.line === 'fence' ? (materialById.get(pick.lineMat.fence)?.fenceHeight ?? 1.83) : pick.line === 'wall' ? 0.6 : 0.1 };
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

/** A maker's hot tub (Cal Spas): its placement can set the cover (`cover`) and leave the steps out (`steps: false`). */
function makerSpa(f: { kind: string; model?: string }): boolean {
  return f.kind === 'hotTub' && !!f.model;
}
const SPA_COVERS = [
  { value: 'open', label: 'Open, on its lifter' },
  { value: 'closed', label: 'Closed, on the spa' },
  { value: 'off', label: 'No cover' },
];

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

// Only offered materials (see OFFERED_LINES in the catalog), plus the current value so a hidden one never silently changes.
const matOptions = (use: MaterialUse, current?: string) => materialsFor(use, current).filter((m) => !m.padSlab || m.id === current).map((m) => ({ value: m.id, label: m.name, group: m.group }));
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
      selectEl('opt-zone-mat', matOptions(pick.zone === 'turf' ? 'turf' : pick.zone === 'bed' ? 'bed' : 'hardscape', pick.zoneMat[pick.zone]), pick.zoneMat[pick.zone], (v) => {
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
      selectEl('opt-line-mat', matOptions(pick.line, pick.lineMat[pick.line]), pick.lineMat[pick.line], (v) => {
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
    box.append(plantPicker({ id: 'opt-plant', label: 'Plant', value: pick.plant, onChange: (v) => {
      pick.plant = v;
      refresh();
    } }));
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

/** A color-changing fixture's light: one of the whites or colors, or a custom color from the picker. */
function lightColorField(f: SitePlan['features'][number], fx: Parameters<typeof fixtureSetting>[0]) {
  const set = fixtureSetting(fx, f.fixture);
  const now = set.color ? `c:${set.color}` : `k:${set.kelvin}`;
  const opts = LIGHT_COLORS.map((o) => ({ value: o.color ? `c:${o.color}` : `k:${o.kelvin}`, label: o.label }));
  const known = opts.some((o) => o.value === now);
  if (!known) opts.push({ value: now, label: set.color ? `Custom ${set.color}` : `${set.kelvin} K` });
  const pick = h('input', { id: 'f-lc-pick', type: 'color', value: set.color ?? '#ffffff', 'aria-label': 'Custom light color' });
  const apply = (v: string) => {
    snapshot();
    const rest = { ...f.fixture };
    delete rest.color;
    delete rest.kelvin;
    if (v.startsWith('c:')) rest.color = cleanHex(v.slice(2)) ?? undefined;
    else if (+v.slice(2) !== fx.kelvin) rest.kelvin = +v.slice(2);
    if (Object.keys(rest).length) f.fixture = rest;
    else delete f.fixture;
    changed('structure'); // re-renders the inspector, so the select and the picker show the new color
  };
  const sel = selectEl('f-lc', opts, now, apply, 'Light color');
  pick.addEventListener('change', () => apply(`c:${pick.value}`));
  return field('Light color', h('span', { style: 'display:flex;gap:6px;align-items:center' }, sel, pick), 'RGBCW lamp: a white or any color.');
}

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
    // A one-slab pad offers only what is sold in its size (else the generic large-format slab), and shows the look it is built in.
    const pad = z.kind === 'hardscape' ? padOf(z) : null;
    const padCur = pad ? padLook(materialById.get(z.catalogId)!, pad.wIn, pad.dIn).id : z.catalogId;
    const zoneMats = pad ? padChoices(pad.wIn, pad.dIn).map((m) => ({ value: m.id, label: m.name, group: m.group })) : matOptions(use, z.catalogId);
    box.append(field('Material', selectEl('z-mat', zoneMats, padCur, (v) => { snapshot(); z.catalogId = v; changed('structure'); }, 'Material')));
    if (pad) box.append(h('p', { class: 'muted', text: `One solid ${Math.round(pad.wIn)} x ${Math.round(pad.dIn)} in slab, no joints. Only products sold in this size are listed.` }));
    if (z.kind === 'hardscape') {
      const zm = materialById.get(z.catalogId);
      const lays = layingsFor(zm);
      if (lays.length) {
        box.append(field('Laying pattern', selectEl('z-laying', lays.map((k) => ({ value: k, label: layingName(zm, k) })), layingOf(zm, z.laying) ?? lays[0], (v) => {
          snapshot();
          z.laying = v as LayingPattern;
          changed();
        }, 'Laying pattern'), isAntiqued(zm) ? "Belgard's Antiqued Flat Top patterns." : 'Belgard 3-piece patterns for the 6 x 12, 9 x 12 and 12 x 12 set.'));
      }
      if (!pad) {
        box.append(field('Border', selectEl('z-border', [{ value: '', label: 'No border' }, ...matOptions('border', z.border?.catalogId)], z.border?.catalogId ?? '', (v) => {
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
    }
    if (z.kind === 'bed') {
      box.append(field('Mass planting', plantPicker({ id: 'z-fill', label: 'Mass planting', value: z.fill?.catalogId ?? '', allowNone: true, onChange: (v) => {
        snapshot();
        z.fill = v ? { catalogId: v, spacing: plantById.get(v)!.spacing } : undefined;
        changed('structure');
      } })));
      if (z.fill) box.append(field('Spacing', numInput('z-sp', ft(z.fill.spacing), 0.5, 0.5, 30, (v) => { snapshot(); z.fill!.spacing = toM(v); changed(); }), 'On center.'));
      box.append(check('z-raised', 'Raised planter', !!z.raised, (v) => {
        snapshot();
        z.raised = v ? { wallCatalogId: 'wall-tan-charcoal-cap', height: 0.6 } : undefined;
        changed('structure');
      }));
      if (z.raised) {
        box.append(
          field('Planter wall', selectEl('z-rw', matOptions('wall', z.raised.wallCatalogId), z.raised.wallCatalogId, (v) => { snapshot(); z.raised!.wallCatalogId = v; changed(); }, 'Planter wall')),
          field('Height', numInput('z-rh', ft(z.raised.height), 0.25, 0.75, 4, (v) => { snapshot(); z.raised!.height = toM(v); changed(); })),
        );
      }
    }
    box.append(h('p', { class: 'muted', text: `${Math.round(ft(1) ** 2 * area(z.polygon)).toLocaleString()} sq ft` }), del);
    return;
  }

  if (sel.list === 'lines') {
    const l = plan.lines.find((x) => x.id === sel.id)!;
    box.append(h('h3', { text: l.kind === 'fence' ? 'Fence' : l.kind === 'wall' ? 'Wall' : l.kind === 'steps' ? 'Steps' : 'Curb or edging' }), confirmAI(l) ?? '');
    box.append(field('Style', selectEl('l-mat', matOptions(l.kind === 'steps' ? 'hardscape' : l.kind, l.catalogId), l.catalogId, (v) => { snapshot(); l.catalogId = v; changed(); }, 'Style')));
    if (l.kind !== 'edging') box.append(field('Height', numInput('l-h', ft(l.height), 0.25, 0.5, l.kind === 'wall' ? 21 : 10, (v) => { snapshot(); l.height = toM(v); changed(); })));
    box.append(h('p', { class: 'muted', text: `${Math.round(ft(polylineLength(builtLine(l, plan.zones))))} linear ft` }), del);
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
    box.append(h('h3', { text: spec.name }), h('p', { class: 'botanical', text: spec.botanical }), confirmAI(p) ?? '');
    box.append(
      field('Plant', plantPicker({ id: 'p-sp', label: 'Plant', value: p.catalogId, onChange: (v) => { snapshot(); p.catalogId = v; changed('structure'); } })),
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
      ...(spec.options ?? []).map((op) => check(`f-op-${op.key}`, op.label, featureOption(spec, f.options, op.key), (v) => { snapshot(); f.options = { ...f.options, [op.key]: v }; changed(); })),
      ...(spec.plantable ? [check('f-planted', 'Planted', f.planted !== false, (v) => { snapshot(); if (v) delete f.planted; else f.planted = false; changed(); })] : []),
      ...(spec.fixture?.rgb ? [lightColorField(f, spec.fixture)] : []),
      ...(makerSpa(spec)
        ? [
            field('Cover', selectEl('f-cover', SPA_COVERS, f.cover ?? 'open', (v) => { snapshot(); f.cover = v as typeof f.cover; changed(); }, 'Cover')),
            check('f-steps', 'Steps', f.steps !== false, (v) => { snapshot(); if (v) delete f.steps; else f.steps = false; changed(); }),
          ]
        : []),
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
    return h('tr', {}, h('td', {}, s.name, h('div', { class: 'botanical', text: s.botanical })), h('td', { class: 'num-cell', text: String(n) }), h('td', { text: s.container }), h('td', { class: 'num-cell', text: `${fmtFeet(s5.height)} × ${fmtFeet(s5.spread)}` }));
  });
  body.replaceChildren(...rows);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  $('#plant-total').textContent = `${total} plants`;
  // Hardscape and surface totals.
  const sq = new Map<string, number>();
  for (const z of plan.zones) sq.set(z.catalogId, (sq.get(z.catalogId) ?? 0) + area(z.polygon) * ft(1) ** 2);
  const lf = new Map<string, number>();
  for (const l of plan.lines) lf.set(l.catalogId, (lf.get(l.catalogId) ?? 0) + ft(polylineLength(builtLine(l, plan.zones))));
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
  const r = await fetch('api/read-plan', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, image: btoa(bin), mediaType: image.type || 'image/jpeg' }) });
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
/* ------------------------------------------------------------------ */
/* Build stages                                                         */

/** Show a build stage, mark it in the dock, and (embedded) tell the parent page unless it asked for it. */
function setStage(stage: BuildStage, tellParent = true) {
  studio?.setStage(stage);
  document.querySelectorAll<HTMLButtonElement>('#stages button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stage === stage)));
  $<HTMLSelectElement>('#stage-select').value = stage;
  $('#stage-out').textContent = BUILD_STAGES.find((s) => s.id === stage)?.label ?? '';
  showStageNote();
  if (tellParent && EMBED && embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'stage', stage }, embedOrigin);
}

/** The note card over the scene: what the stage shows in this plan. Hidden for the finished yard. */
function showStageNote() {
  const stage = studio?.buildStage ?? 'finished';
  const card = $('#stage-card');
  card.hidden = stage === 'finished';
  if (card.hidden) return;
  $('#stage-title').textContent = BUILD_STAGES.find((s) => s.id === stage)?.title ?? '';
  $('#stage-note').textContent = studio?.stageNote(stage) ?? '';
}

function stepStage(by: number) {
  const ids = BUILD_STAGES.map((s) => s.id);
  const i = ids.indexOf(studio?.buildStage ?? 'finished');
  setStage(ids[Math.max(0, Math.min(ids.length - 1, i + by))]);
}

function initStages() {
  $('#btn-library').addEventListener('click', () => setLibrary(!libraryOpen()));
  // The same choice over the 3D view, so it is there in full screen too (the dock is hidden then).
  const pick = $<HTMLSelectElement>('#stage-select');
  for (const s of BUILD_STAGES) pick.append(h('option', { value: s.id, text: s.label }));
  pick.value = 'finished';
  pick.addEventListener('change', () => {
    setStage(pick.value as BuildStage);
    pick.blur();
  });
  const seg = $('#stages');
  for (const s of BUILD_STAGES) {
    const b = h('button', { type: 'button', 'data-stage': s.id, text: s.label, 'aria-pressed': String(s.id === 'finished'), title: `${s.title} ([ and ] step through the stages)` });
    b.addEventListener('click', () => setStage(s.id));
    seg.append(b);
  }
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '[') {
      e.preventDefault();
      stepStage(-1);
    } else if (e.key === ']') {
      e.preventDefault();
      stepStage(1);
    }
  });
}

function initDock() {
  sceneControls = new SceneControls(() => libraryOpen() || libraryBook.busy());
  initStages();
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
  $<HTMLInputElement>('#dof').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    studio?.setLens({ dof: on });
    $('#btn-focus').setAttribute('aria-pressed', String(on));
  });
  // Quick buttons over the 3D view (always in reach, also in full screen and on small screens): focus blur and wind.
  $('#btn-focus').addEventListener('click', () => {
    const box = $<HTMLInputElement>('#dof');
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
  });
  let windWas = 0.55;
  $('#btn-wind').addEventListener('click', () => {
    const r = $<HTMLInputElement>('#wind');
    if (+r.value > 0) windWas = +r.value;
    r.value = String(+r.value > 0 ? 0 : windWas || 0.55);
    r.dispatchEvent(new Event('input'));
  });
  $<HTMLInputElement>('#fstop').addEventListener('input', (e) => studio?.setLens({ fStop: +(e.target as HTMLInputElement).value }));
  $<HTMLInputElement>('#wind').addEventListener('input', (e) => {
    const v = +(e.target as HTMLInputElement).value;
    studio?.setWind(v);
    $('#btn-wind').setAttribute('aria-pressed', String(v > 0));
  });
  $<HTMLInputElement>('#motion').addEventListener('change', (e) => studio?.setMotion((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('#diag').addEventListener('change', (e) => studio?.showDiagnostics((e.target as HTMLInputElement).checked));

  $('#btn-image').addEventListener('click', exportImage);
  initFullscreen();
}

/* ------------------------------------------------------------------ */
/* Full screen and the height meter                                     */

const HM_MAX_FT = 700;
/** Square-root scale, so the first 50 ft (where most yard views are) get room and the top still fits. */
const hmPos = (ft: number) => Math.sqrt(Math.min(HM_MAX_FT, Math.max(0, ft)) / HM_MAX_FT) * 100;

function initFullscreen() {
  const pane = $('section.scene-pane');
  const btn = $<HTMLButtonElement>('#btn-fullscreen');
  const scale = $('#hm-scale'), mark = $('#hm-mark'), value = $('#hm-value');
  for (const ft of [0, 10, 25, 50, 100, 200, 400, 700]) {
    const t = h('div', { class: 'hm-tick', text: `${ft} ft` });
    t.style.bottom = `${hmPos(ft)}%`;
    scale.append(t);
  }

  let on = false, raf = 0, last = -1;
  let pose: ReturnType<Studio['savePose']> | null = null;
  document.querySelectorAll<HTMLButtonElement>('#measure-modes button').forEach((b) => b.addEventListener('click', () => studio?.setMeasureMode(b.dataset.mode as MeasureMode)));
  document.querySelectorAll<HTMLButtonElement>('#nav-modes button').forEach((b) => b.addEventListener('click', () => studio?.setNavMode(b.dataset.mode as 'orbit' | 'walk' | 'fly')));
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!studio) return;
    const ft = Math.round(studio.heightAboveGround() * 3.28084);
    if (ft === last) return;
    last = ft;
    value.textContent = `${ft} ft`;
    mark.style.bottom = `${hmPos(ft)}%`;
  };
  const set = (v: boolean) => {
    if (v === on) return;
    on = v;
    // The Library's book animation belongs to full screen: switching ends it at once, while fsOn still says where
    // it was playing (a skipped close then restores the camera for that layout).
    if (libraryBook.busy()) libraryBook.skip();
    fsOn = on;
    pane.classList.toggle('fs', on);
    // Full screen opens in first person at eye height; leaving it puts the camera back where it was.
    if (studio && libraryOpen()) {
      // Left with the Library open (Esc in the browser's own full screen): the Library keeps its sample on screen,
      // and closing it goes back to the view from before full screen, in orbit.
      if (!on && pose && libraryReturn) libraryReturn = { ...libraryReturn, pose, mode: 'orbit' };
      pose = null;
    } else if (studio) {
      if (on) {
        pose = studio.savePose();
        studio.setNavMode('walk');
      } else {
        studio.setNavMode('orbit');
        if (pose) studio.restorePose(pose);
        pose = null;
      }
    }
    btn.querySelector('.lbl')!.textContent = on ? 'Exit full screen' : 'Full screen';
    btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    btn.setAttribute('aria-pressed', String(on));
    cancelAnimationFrame(raf);
    last = -1;
    if (on) tick();
    window.dispatchEvent(new Event('resize'));
  };
  let viaParent = false;
  const toggle = () => {
    if (!on) {
      set(true);
      // Inside Area Planner, the parent page goes full screen with its own material panel; without an answer
      // within 300 ms, the studio uses the real Fullscreen API itself. The fixed layout above works without either.
      // On iPad and iPhone (APPLE_TOUCH) the studio never calls the Fullscreen API: the parent fills its page, or,
      // with no parent to ask, the layout fills the frame or the page.
      if (EMBED && embedOrigin) {
        const t = APPLE_TOUCH ? 0 : window.setTimeout(() => { parentFullscreen = null; pane.requestFullscreen?.().catch(() => {}); }, 300);
        parentFullscreen = (pon) => { window.clearTimeout(t); viaParent = pon; parentFullscreen = (later) => { if (!later && on) { viaParent = false; set(false); } }; };
        window.parent.postMessage({ source: 'growth-studio', type: 'fullscreen-request' }, embedOrigin);
      } else if (!APPLE_TOUCH) pane.requestFullscreen?.().catch(() => {});
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (viaParent && embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'fullscreen-exit' }, embedOrigin);
      viaParent = false;
      set(false);
    }
  };
  btn.addEventListener('click', toggle);
  // Ended just after a touch: the system's swipe down on a device APPLE_TOUCH missed. The layout stays full screen.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && on && performance.now() - lastTouchAt > FS_SWIPE_MS) set(false); });
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    // Not while the Library is open (its sample is framed for the view it is in); Esc then closes the Library first.
    if (libraryOpen() || libraryBook.busy()) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape' && on && !document.fullscreenElement) {
      // Full screen the parent gave (its own fill, no Fullscreen API): tell it, as the exit button does.
      if (viaParent && embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'fullscreen-exit' }, embedOrigin);
      viaParent = false;
      set(false);
    }
  });
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
  /^https:\/\/area-planner-beta\.vercel\.app$/, // Area Planner (also when the studio is served from it at /studio/)
  // Area Planner on the joshua-jackson Vercel team only: the production alias (area-planner-joshua-jackson),
  // per branch (area-planner-git-<branch>-joshua-jackson) and per deployment (area-planner-<hash>-joshua-jackson).
  // The team suffix cannot be taken by another Vercel account, unlike a bare "area-planner" prefix.
  /^https:\/\/area-planner(-(git-[a-z0-9-]+|[a-z0-9]+))?-joshua-jackson\.vercel\.app$/,
  /^https:\/\/(www\.)?greenlionlandscape\.com$/, // Green Lion's own site
];

const EMBED_EMPTY_NOTE = 'Draw areas in the Design tab to see them here';
/** Messages that arrive closer together than this are applied as one rebuild. */
const EMBED_DEBOUNCE_MS = 150;
/** Largest uploaded model or picture the embed will read. */
const EMBED_ASSET_MAX_BYTES = 60 * 1024 * 1024;

let embedPending: { plan: unknown; name: string; refit: boolean; frame: string } | null = null;
/** The parent's coordinate frame of the last plan built (it changes only with a new plan image or scale). */
let embedLastFrame = '';
let embedTimer = 0;
let embedOrigin = '';
let embedBooted = false;
let embedBuilt = false;
/** Uploaded files already asked for since the last plan, so a rebuild does not ask twice. */
const embedAsked = new Set<string>();

function embedNote(text: string | null) {
  const box = $('#embed-note');
  box.hidden = !text;
  $('p', box).textContent = text ?? '';
}

/** Set while the studio waits for (or runs inside) the parent page's full screen; called with its state. */
let parentFullscreen: ((on: boolean) => void) | null = null;

function embedReply(ok: boolean, extra: { message?: string; warnings?: string[] } = {}) {
  if (embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'built', ok, ...extra }, embedOrigin);
}

function onEmbedMessage(e: MessageEvent) {
  if (e.source !== window.parent || !EMBED_ALLOWED_PARENT_ORIGINS.some((re) => re.test(e.origin))) return;
  const d = e.data as { source?: unknown; type?: unknown; plan?: unknown; name?: unknown; refit?: unknown; frame?: unknown; id?: unknown; item?: unknown; kind?: unknown; data?: unknown; ids?: unknown } | null;
  if (!d || typeof d !== 'object' || d.source !== 'area-planner') return;
  if (d.type === 'asset') {
    // An uploaded file the plan names, sent in answer to `need-asset`. `data: null` means the parent no longer has it.
    if (typeof d.id !== 'string') return;
    const id = d.id, origin = e.origin;
    const reply = (ok: boolean, message?: string) => window.parent.postMessage({ source: 'growth-studio', type: 'asset', id, ok, ...(message ? { message } : {}) }, origin);
    if (!(d.data instanceof Blob) || !studio) return reply(false, 'The file was not sent.');
    if (d.data.size > EMBED_ASSET_MAX_BYTES) return reply(false, 'This file is too large to show in 3D (the limit is 60 MB).');
    studio.addAsset(id, d.kind === 'image' ? 'image' : 'glb', d.data).then(() => reply(true), (err) => reply(false, err instanceof Error ? err.message : String(err)));
    return;
  }
  if (d.type === 'plant-thumbs') {
    // The parent wants pictures of catalog plants (for its plant picker). Each is drawn with the app's own plant
    // builder, one at a time, and sent back as soon as it is ready.
    const origin = e.origin;
    const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === 'string' && plantById.has(x)) : PLANTS.map((p) => p.id);
    for (const id of ids) wantThumb(id, (url) => window.parent.postMessage({ source: 'growth-studio', type: 'plant-thumb', id, url }, origin));
    return;
  }
  if (d.type === 'swatch') {
    // A swatch for a look the parent shows without pointing at it (a color previewed in its panel): the same picture
    // the pointer sends, as { type: 'swatch', id, url } (url null when there is none).
    const origin = e.origin, id = typeof d.id === 'string' ? d.id.slice(0, 120) : '';
    const [sk, sid] = pointKind(id);
    // A catalog material, or a plant or feature (the planner's switch-within-type cards).
    if (!id || !(sk === 'material' ? materialById.has(sid) : sk === 'plant' ? plantById.has(sid) : sk === 'feature' && featureById.has(sid))) return;
    void pictureFor(id).then((url) => window.parent.postMessage({ source: 'growth-studio', type: 'swatch', id, url }, origin));
    return;
  }
  if (d.type === 'look') {
    // The look of a plant or feature the parent offers as a switch for a placed one (so its panel can show it before the
    // switch is saved): the same Look the pointer sends, as { type: 'look', id, material }. `item` is the placed item
    // it would replace, for details that come from the placement (a plant's container).
    const origin = e.origin, id = typeof d.id === 'string' ? d.id.slice(0, 120) : '';
    const [lk, lid] = pointKind(id);
    if (!(lk === 'plant' ? plantById.has(lid) : lk === 'feature' && featureById.has(lid))) return;
    const look = lookOfPoint(id, plan, typeof d.item === 'string' ? d.item.slice(0, 40) : '');
    if (look) window.parent.postMessage({ source: 'growth-studio', type: 'look', id, ...(typeof d.item === 'string' && d.item ? { item: d.item.slice(0, 40) } : {}), material: look }, origin);
    return;
  }
  if (d.type === 'approvals') {
    // The team's approvals, saved by the parent (sent after `ready` and after each change made in the Library).
    embedOrigin ||= e.origin;
    setApprovals((d as { approvals?: { on?: unknown; off?: unknown } }).approvals as { on: string[]; off: string[] } | null ?? null);
    postCatalog(true);
    return;
  }
  if (d.type === 'library') { embedOrigin ||= e.origin; setLibrary(!!(d as { open?: unknown }).open, true); return; }
  if (d.type === 'touch') { setTouch((d as { on?: unknown }).on === true); return; }
  if (d.type === 'mode') { setViewer((d as { viewer?: unknown }).viewer === true); return; }
  if (d.type === 'pointer') { studio?.setPointer(!!(d as { on?: unknown }).on); return; }
  if (d.type === 'point-lock') { studio?.setPointLock(!!(d as { locked?: unknown }).locked); return; }
  if (d.type === 'cover') {
    // A cover picture of the yard for the parent's second screen, from the Overview view.
    const origin = e.origin;
    if (!studio || !embedBuilt) return window.parent.postMessage({ source: 'growth-studio', type: 'cover', ok: false, message: 'The 3D view is not ready yet.' }, origin);
    studio.coverImage(1600).then(
      (data) => window.parent.postMessage({ source: 'growth-studio', type: 'cover', ok: true, data }, origin),
      (err) => window.parent.postMessage({ source: 'growth-studio', type: 'cover', ok: false, message: err instanceof Error ? err.message : String(err) }, origin),
    );
    return;
  }
  if (d.type === 'shot') {
    // A rendering for a client page: one generated view under one light mood, 3:2 unless `aspect` says otherwise.
    // { view, mood, w, aspect, id } -> { type: 'shot', id, ok, data: Blob (JPEG) } or { ..., ok: false, message }.
    const origin = e.origin, q = d as { view?: unknown; mood?: unknown; w?: unknown; aspect?: unknown; id?: unknown };
    const id = typeof q.id === 'string' ? q.id.slice(0, 40) : '';
    const fail = (message: string) => window.parent.postMessage({ source: 'growth-studio', type: 'shot', id, ok: false, message }, origin);
    if (!studio || !embedBuilt) return fail('The 3D view is not ready yet.');
    const mood = MOODS.some((m) => m.id === q.mood) ? (q.mood as Mood) : undefined;
    studio.shot({ view: typeof q.view === 'string' ? q.view.slice(0, 80) : undefined, mood, width: typeof q.w === 'number' && Number.isFinite(q.w) ? q.w : 1600, aspect: typeof q.aspect === 'number' && Number.isFinite(q.aspect) ? q.aspect : 1.5 }).then(
      (data) => window.parent.postMessage({ source: 'growth-studio', type: 'shot', id, ok: true, data }, origin),
      (err) => fail(err instanceof Error ? err.message : String(err)),
    );
    return;
  }
  // The parent hides the 3D tab: stop drawing (plant thumbnails still render), and start again when it is shown.
  if (d.type === 'pause') { studio?.pause(); touchUI?.reset(); return; }
  if (d.type === 'resume') { studio?.resume(); return; }
  if (d.type === 'fullscreen') { parentFullscreen?.(!!(d as { on?: unknown }).on); return; }
  // Cut away was removed (2026-11-19, the owner did not use it); an older parent's message is ignored.
  if (d.type === 'cutaway') return;
  if (d.type === 'stage') {
    // The parent page picked a build stage (its own stage control or a second screen).
    const stage = (d as { stage?: unknown }).stage;
    if (typeof stage === 'string' && BUILD_STAGES.some((s) => s.id === stage)) setStage(stage as BuildStage, false);
    return;
  }
  if (d.type !== 'siteplan') return;
  embedOrigin = e.origin;
  // Keep only the newest plan. A refit asked for by any message in the burst still happens.
  embedPending = { plan: d.plan, name: typeof d.name === 'string' ? d.name : '', refit: d.refit === true || !!embedPending?.refit, frame: typeof d.frame === 'string' ? d.frame : '' };
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
    embedAsked.clear();
    embedLooksForPlan();
    // The parent can name its coordinate frame; while it is unchanged the coordinates have not
    // moved, so the camera stays even when the lot outline grows.
    const sameFrame = !!next.frame && next.frame === embedLastFrame;
    if (libraryOpen()) {
      // The Library's sample stays on screen; this plan is shown when the Library closes.
      embedLastFrame = next.frame;
      embedReply(true, res.warnings.length ? { warnings: res.warnings } : {});
      return;
    }
    const shown = studio.setPlan(plan, embedBuilt && !next.refit && (sameLot || sameFrame));
    embedLastFrame = next.frame;
    embedBuilt = true;
    const utilities = (plan.utilities?.lines.length ?? 0) + (plan.utilities?.points.length ?? 0);
    embedNote(plan.zones.length + plan.lines.length + plan.water.length + plan.plants.length + plan.structures.length + (plan.models?.length ?? 0) + utilities ? null : EMBED_EMPTY_NOTE);
    // `built` goes once the new yard is on screen (its shaders are warmed first), not when building starts.
    const extra = res.warnings.length ? { warnings: res.warnings } : {};
    shown.then(
      () => {
        showStageNote();
        embedReply(true, extra);
      },
      (e) => {
        console.error(e);
        embedNote('This plan could not be shown in 3D.');
        embedReply(false, { message: `The plan could not be shown in 3D (${String(e instanceof Error ? e.message : e).slice(0, 160)}).` });
      },
    );
  } catch (e) {
    console.error(e);
    embedNote('This plan could not be shown in 3D.');
    // Pass the reason along so the parent page can show what went wrong.
    const why = e instanceof Error ? e.message : String(e);
    embedReply(false, { message: `The plan could not be built in 3D (${why.slice(0, 160)}).` });
  }
}

/** The looks the parent can offer: approved pavers, borders, walls, fences, curbs, maker turf and bed fills. */
/** A look the parent's pickers deal in: paving, borders, walls, fences, curbs, steel edging as sold, maker turf and bed fills. */
const embedKind = (m: MaterialSpec) => (m.use === 'hardscape' && (m.group === 'Pavers' || m.group === 'Porcelain' || m.group === 'Concrete')) || m.use === 'border' || m.use === 'wall' || m.use === 'fence' || (m.use === 'edging' && (m.recipe === 'curb' || !!m.edging)) || (m.use === 'turf' && !!m.turf) || m.use === 'bed';

/** Every catalog material id the plan names anywhere (zone, border, line, cap, feature look...). */
function planMaterialIds(p: SitePlan): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (materialById.has(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(p);
  return out;
}

/** The ids sent in the last looks list (see embedLooks). */
let embedLookIds = new Set<string>();

/**
 * The looks the parent's pickers offer, plus any look the open plan already uses that is no longer offered (a line
 * or color turned off in the Library, or a Belgard color not sold in Northern California), marked `offered: false`:
 * the parent shows such a look as the current choice, so it can be changed to an offered one, and offers it nowhere.
 */
function embedLooks(): Look[] {
  const used = planMaterialIds(plan);
  const out: Look[] = [];
  for (const m of MATERIALS) {
    if (!embedKind(m)) continue;
    const offered = !m.auto && isOffered(m);
    if (!offered && !used.has(m.id)) continue;
    const look = lookOf(m);
    if (!offered) look.offered = false;
    out.push(look);
  }
  embedLookIds = new Set(out.map((l) => l.id));
  return out;
}

/** After a new plan: send the looks again when it uses a look the parent was not sent (one no longer offered). */
function embedLooksForPlan() {
  for (const id of planMaterialIds(plan)) {
    const m = materialById.get(id);
    if (m && embedKind(m) && !embedLookIds.has(id)) {
      window.parent.postMessage({ source: 'growth-studio', type: 'materials', materials: embedLooks() }, embedOrigin || '*');
      return;
    }
  }
}

/**
 * What the parent's own catalogs should offer: approved plants, placeable features and structures, with the
 * approvals themselves. After an approvals change the looks go again too, as `materials`.
 */
function postCatalog(withMaterials: boolean) {
  const to = embedOrigin || '*';
  if (withMaterials) window.parent.postMessage({ source: 'growth-studio', type: 'materials', materials: embedLooks() }, to);
  window.parent.postMessage({
    source: 'growth-studio',
    type: 'catalog',
    approvals: getApprovals(),
    plants: PLANTS.filter((p) => isApproved(`plant:${p.id}`)).map((p) => p.id),
    features: FEATURES.filter((f) => f.kind !== 'steppingStone' && isApproved(`feature:${f.id}`)).map((f) => ({ id: f.id, name: f.name, group: f.group, swap: swapClassOf(f), footprint: f.footprint, ...(f.options ? { options: f.options } : {}), ...(f.sizes ? { sizes: f.sizes, size: f.size ?? 0 } : {}), ...(f.plantable ? { plantable: true } : {}), ...(makerSpa(f) ? { cover: true, steps: true } : {}), ...(f.fixture?.rgb ? { rgb: true } : {}) })),
    structures: { cover: isApproved('structure:cover'), calroom: isApproved('structure:calroom') },
  }, to);
}

/** The camera, movement mode and growth year to go back to when the Library closes. */
type LibraryReturn = { pose: ReturnType<Studio['savePose']>; years: number; mode: Studio['mode'] };
let libraryReturn: LibraryReturn | null = null;
let sceneControls: SceneControls | null = null;
/** A closed Library's way back while the yard is still being rebuilt (reused if the Library opens again meanwhile). */
let pendingReturn: LibraryReturn | null = null;
/** Controller View held: open or close the Library. */
const libraryHold = () => setLibrary(!libraryOpen());
/** Full screen is on (the scene pane's `fs` layout). */
let fsOn = false;
const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
/** The Library's opening and closing in full screen: the camera looks down and a Green Lion design book opens. */
const libraryBook = new LibraryBook({ studio: () => studio, book: $('#library-book'), panel: $('#library'), logo: logoUrl, categories: libraryCategories });

/**
 * Open or close the Library over the 3D view; closing shows the plan again where the camera was. In full screen it
 * opens as a full-screen overlay in the full-screen element (so full screen stays), with the book animation
 * (app/librarybook.ts). Asked again while that plays, it skips to the end; `force` (the parent's message) then also
 * goes on to the asked state.
 */
function setLibrary(open: boolean, force = false) {
  if (!studio) return;
  if (libraryBook.busy()) {
    libraryBook.skip();
    if (!force) return;
  }
  if (open === libraryOpen()) return;
  if (open && embedViewer) return;   // view-only: no Library
  const s = studio;
  if (!open) {
    if (fsOn) libraryBook.close(closeLibrary, reducedMotion());
    else closeLibrary();
    return;
  }
  // Reopened before the yard came back from the last close: go back to that view later, not to the sample's.
  libraryReturn = pendingReturn ?? { pose: s.savePose(), years: s.state.years, mode: s.mode };
  pendingReturn = null;
  s.setPointer(false);
  const show = () => {
    // The Library frames its samples with the orbit camera (walking would pull the camera down to eye height).
    if (s.mode !== 'orbit') s.setNavMode('orbit');
    openLibrary({
      studio: s,
      canApprove: () => EMBED && !!embedOrigin && !embedViewer,
      approve: (key, on) => { if (embedOrigin && !embedViewer) window.parent.postMessage({ source: 'growth-studio', type: 'approve', key, on }, embedOrigin); },
      requestClose: () => setLibrary(false),
      onToggle: (isOpen) => {
        $('#btn-library').setAttribute('aria-pressed', String(isOpen));
        if (EMBED && embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'library', open: isOpen }, embedOrigin);
        if (isOpen) return;
        const back = libraryReturn;
        libraryReturn = null;
        pendingReturn = back;
        if (back) setYears(back.years);
        else libraryBook.skip();
        // Full screen switched meanwhile (the browser's Esc): it has put the camera back itself.
        const fsAt = fsOn;
        s.setPlan(plan, false).then(() => {
          // Opened again while the yard was being rebuilt: the Library's sample is on screen, leave the camera.
          if (libraryOpen()) return;
          if (pendingReturn === back) pendingReturn = null;
          if (back && fsOn === fsAt) {
            // Back to the movement mode it was in (walk in full screen), then the camera: tilted up from the ground
            // by the book in full screen, put straight back otherwise.
            if (back.mode !== s.mode) s.setNavMode(back.mode);
            if (!libraryBook.cameraBack(back.pose)) s.restorePose(back.pose);
          }
          showStageNote();
        }, () => {
          if (pendingReturn === back) pendingReturn = null;
          // The yard could not be rebuilt: do not leave the closed book and its scrim waiting on screen.
          libraryBook.skip();
        });
      },
    }, $('#library'));
  };
  if (fsOn) libraryBook.open(show, reducedMotion());
  else show();
}

/** Esc skips the Library's animation, or closes the Library (before full screen sees it). */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return;
  // Only an Esc meant for the 3D view or the Library: never a dialog's, nor one typed elsewhere on the page.
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t instanceof Element && t !== document.body && t !== document.documentElement && !t.closest('#library, #scene')) return;
  if (libraryBook.busy()) libraryBook.skip();
  else if (libraryOpen()) setLibrary(false);
  else return;
  e.preventDefault();
}, true);

function initEmbed() {
  initDock();
  // Save image is the one top-bar action kept; it moves into the dock.
  $('.dock').append(h('div', { class: 'dock-group dock-end' }, $('#btn-image')));
  embedNote(EMBED_EMPTY_NOTE);
  window.addEventListener('message', onEmbedMessage);
  // `i` belongs to the parent page (its info panel); pass it on, since the 3D view has the keyboard after a click.
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (!embedOrigin || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'i' || e.key === 'I') window.parent.postMessage({ source: 'growth-studio', type: 'key', key: 'i' }, embedOrigin);
  });

  const boot = () => {
    if (embedBooted) return;
    bootStudio();
    setYears(3);
    setMood('afternoon');
    embedBooted = true;
    // Tell the parent it can send a plan. Nothing private is in this message.
    // The paver looks the parent can offer for a clicked paver area, so its list always matches the catalog.
    // Only offered looks: a maker paver or wall line is listed once it is mapped in depth (OFFERED_LINES in the catalog).
    window.parent.postMessage({ source: 'growth-studio', type: 'ready', materials: embedLooks(), houseLooks: houseLookLists() }, '*');
    postCatalog(false);
    if (studio) studio.onNeedAsset = (id) => {
      if (!embedOrigin || embedAsked.has(id)) return;
      embedAsked.add(id);
      window.parent.postMessage({ source: 'growth-studio', type: 'need-asset', id }, embedOrigin);
    };
    if (studio) studio.onPick = (id) => { if (embedOrigin && !libraryOpen()) window.parent.postMessage({ source: 'growth-studio', type: 'select', id }, embedOrigin); };
    // The material pointer (controller Y or P): tell the parent what it is on, with the material's details.
    if (studio) {
      studio.onPointer = (on) => { if (embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'pointer', on }, embedOrigin); };
      studio.onPointLock = (locked) => { if (embedOrigin) window.parent.postMessage({ source: 'growth-studio', type: 'point-lock', locked }, embedOrigin); };
      // Everything the pointer lands on has a look: catalog surfaces, lawn and beds, plants, water, structures and
      // features. The look goes at once; a swatch drawn from the 3D material follows in a second `point` message for
      // the same item, if the pointer is still on it.
      let pointNow = '';
      // The pointer reports from inside a frame: the look and the swatch are worked out after it (the newest hit wins).
      let pointHit: Parameters<NonNullable<Studio['onPoint']>>[0] | undefined;
      let pointTimer = 0;
      studio.onPoint = (hit) => {
        pointHit = hit;
        if (!pointTimer) pointTimer = window.setTimeout(() => {
          pointTimer = 0;
          sendPoint(pointHit ?? null);
        }, 0);
      };
      const sendPoint = (hit: Parameters<NonNullable<Studio['onPoint']>>[0]) => {
        if (!embedOrigin || libraryOpen()) return;
        const origin = embedOrigin;
        const zone = hit ? plan.zones.find((z) => z.id === hit.id) : undefined;
        const laying = hit?.part === 'main' && zone ? layingOf(materialById.get(hit.catalogId), zone.laying) : undefined;
        const look = hit ? lookOfPoint(hit.catalogId, plan, hit.id, hit.sub) : null;
        const send = (material: Look | null) => window.parent.postMessage({ source: 'growth-studio', type: 'point', id: hit?.id ?? null, part: hit?.part ?? null, ...(hit?.sub ? { sub: hit.sub } : {}), material }, origin);
        const now = (pointNow = hit ? `${hit.id}|${hit.part}|${hit.catalogId}|${hit.sub ?? ''}` : '');
        if (!look || !hit) return send(look);
        // The panel's large picture when it is made; meanwhile the small swatch if that is, and the large one follows.
        const big = pictureNow(hit.catalogId, laying);
        if (big) return send({ ...look, swatch: big });
        const small = swatchNow(hit.catalogId, laying);
        send(small ? { ...look, swatch: small } : look);
        void pictureFor(hit.catalogId, laying).then((url) => { if (url && pointNow === now && embedOrigin === origin) send({ ...look, swatch: url }); });
      };
    }
    applyEmbedPlan();
  };
  // The timer covers a frame that is not being painted yet (a hidden tab or panel).
  requestAnimationFrame(boot);
  window.setTimeout(boot, 400);

  if (claude?.use) claude.use('downloads').then((d) => { downloads = (d as Downloads) ?? null; }).catch(() => {});
  (window as unknown as { __gs: unknown }).__gs = { get studio() { return studio; }, get plan() { return plan; }, book: libraryBook };
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
    fetch('api/read-plan', { method: 'POST', body: '{}' }).then((r) => { serverReader = r.status === 400; $('#read-ai-note').hidden = serverReader; }).catch(() => {});
  }
  if (claude?.use) {
    claude.use('sample').then((s) => { sample = (s as SampleFn) ?? null; $('#read-ai-note').hidden = !!sample; }).catch(() => {});
    claude.use('downloads').then((d) => { downloads = (d as Downloads) ?? null; }).catch(() => {});
  }
  (window as unknown as { __gs: unknown }).__gs = { get studio() { return studio; }, get plan() { return plan; }, book: libraryBook, editor };
  void clone;
}

if (EMBED) initEmbed();
else init();
