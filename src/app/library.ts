// The Library: every product Green Lion works with, one card per product (a maker's line, a plant, a feature), each
// opening on a small sample in the 3D view to turn, zoom and look at closely, in each of its colors. Its Approve toggle
// decides what Area Planner offers (see siteplan/approval.ts); approvals are saved by Area Planner, so they can be
// changed only when the studio runs inside it. Generic paver, wall and curb looks are listed apart as testers, to be
// removed as real product lines replace them.
import { roundLb } from '../siteplan/waterrocks';
import * as THREE from 'three';
import type { Studio } from '../engine/studio';
import { FEATURES, MATERIALS, PLANTS, approvalKeyOf, featureById, isApproved, isOutOfArea, isTester, layingName, layingsFor, materialById, outOfAreaNote, type FeatureSpec, type LayingPattern, type MaterialSpec, type PlantSpec } from '../siteplan/catalog';
import { onApprovalsChanged } from '../siteplan/approval';
import { sampleFor, scenesFor, type LibraryItem, type LibrarySample } from './library-samples';
import { swatchFor } from './swatches';
import { wantThumb } from './plantthumbs';
import { wantFeatureThumb } from './featurethumbs';
import { KITCHEN_PARTS, kitchenPartById } from '../siteplan/kitchen';

const FT = 3.28084;
const IN = 0.0254;

/* ------------------------------------------------------------------ */
/* Products                                                             */
/* ------------------------------------------------------------------ */

interface Variant {
  item: LibraryItem;
  /** Chip label: the color name, or the item's own name. */
  label: string;
  swatch: string;
}
interface Product {
  /** Approval key (see approval.ts). */
  key: string;
  name: string;
  sub: string;
  cat: string;
  tester: boolean;
  variants: Variant[];
  mat?: MaterialSpec;
  plant?: PlantSpec;
  feature?: FeatureSpec;
  /** A kitchen part (siteplan/kitchen.ts): a building block for islands, shown here only; nothing to approve. */
  part?: boolean;
}
interface Category {
  id: string;
  label: string;
}

const CATEGORIES: Category[] = [
  { id: 'plants', label: 'Plants' },
  { id: 'trees', label: 'Trees' },
  { id: 'turf', label: 'Turf' },
  { id: 'beds', label: 'Bark, mulch and rock' },
  { id: 'pavers', label: 'Pavers' },
  { id: 'walls', label: 'Walls' },
  { id: 'edging', label: 'Curbs and edging' },
  { id: 'fences', label: 'Fences' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'shade', label: 'Shade and roofs' },
  { id: 'kitchens', label: 'Kitchens' },
  { id: 'kitchen-parts', label: 'Kitchen parts' },
  { id: 'fire', label: 'Fire' },
  { id: 'water', label: 'Water and spa' },
  { id: 'accents', label: 'Accents and furniture' },
  { id: 'testers', label: 'Testers' },
];

/** The category a look belongs in, or null when the Library leaves it out (auto borders). */
function catOf(m: MaterialSpec): string | null {
  if (m.auto || m.id.startsWith('border-of-')) return null;
  if (isTester(m)) return 'testers';
  if (m.use === 'turf') return 'turf';
  if (m.use === 'bed') return 'beds';
  if (m.use === 'wall') return 'walls';
  if (m.use === 'fence') return 'fences';
  if (m.use === 'edging' || m.shelf === 'Paver edge') return 'edging';
  if (m.use === 'hardscape' && m.group === 'Concrete') return 'concrete';
  if (m.use === 'hardscape' && m.group === 'Pavers') return 'pavers';
  // A maker's porcelain (MSI Caldera) sits with the pavers.
  if (m.use === 'hardscape' && m.group === 'Porcelain' && m.maker) return 'pavers';
  return null;
}

const FEATURE_CAT: Record<string, string> = { Shade: 'shade', Kitchens: 'kitchens', Fire: 'fire', Water: 'water', 'Rock library': 'water', 'Spa and sauna': 'water', Accents: 'accents', Lighting: 'accents', Furniture: 'accents' };
const STRUCTURES: { id: 'cover' | 'calroom'; name: string; sub: string }[] = [
  { id: 'cover', name: 'Attached roof', sub: 'Roofed patio on posts' },
  { id: 'calroom', name: 'California room', sub: 'Roofed room, solid walls on its closed sides' },
];

function buildProducts(): Product[] {
  const out: Product[] = [];
  const lines = new Map<string, Product>();
  for (const m of MATERIALS) {
    const cat = catOf(m);
    if (!cat) continue;
    // A maker line's border stones and paver edge belong to the same line; list them only where they are the product.
    if (m.use === 'border' && m.shelf !== 'Paver edge' && !isTester(m)) continue;
    const key = approvalKeyOf(m);
    const v: Variant = { item: { kind: 'material', id: m.id }, label: m.color ?? m.name, swatch: m.palette[1] ?? m.palette[0] };
    if (m.maker && m.line) {
      const lk = `${key}|${cat}`;
      let p = lines.get(lk);
      if (!p) {
        // A line's colors Belgard does not sell in Northern California are a product of their own, off by default.
        const name = m.shelf === 'Paver edge' ? `${m.line} 6 × 9 edge` : m.line;
        p = { key, name: isOutOfArea(m) ? `${name} (out of area)` : name, sub: isOutOfArea(m) ? `${m.maker} · not sold in Northern California` : m.maker, cat, tester: false, variants: [], mat: m };
        lines.set(lk, p);
        out.push(p);
      }
      if (!p.variants.some((x) => x.label === v.label)) p.variants.push(v);
    } else {
      out.push({ key, name: m.name, sub: isTester(m) ? `Generic tester · ${m.group}` : m.matches ?? m.group, cat, tester: isTester(m), variants: [v], mat: m });
    }
  }
  for (const p of PLANTS) {
    out.push({ key: `plant:${p.id}`, name: p.name, sub: p.botanical, cat: p.group === 'Trees' ? 'trees' : 'plants', tester: false, variants: [{ item: { kind: 'plant', id: p.id }, label: p.name, swatch: p.foliage }], plant: p });
  }
  for (const f of FEATURES) {
    // The stepping stone is a Dimensions Slab; it is shown with the pavers.
    const cat = FEATURE_CAT[f.group];
    if (!cat || f.kind === 'steppingStone') continue;
    out.push({ key: `feature:${f.id}`, name: f.name, sub: f.group, cat, tester: false, variants: [{ item: { kind: 'feature', id: f.id }, label: f.name, swatch: '#8a8f86' }], feature: f });
  }
  // Kitchen parts: one card per part, its sizes or colors as its chips. Building blocks for islands, never offered in a
  // plan, so they have no approval of their own.
  const families = new Map<string, Product>();
  for (const kp of KITCHEN_PARTS) {
    let p = families.get(kp.family);
    if (!p) {
      const sub = { dropIn: 'Drops into the counter', front: 'Fits the island front', onCounter: 'Stands on the counter', free: 'Seating', finish: kp.type === 'counter' ? 'Countertop finish' : 'Base veneer' }[kp.mount];
      p = { key: `kitchen-part:${kp.family}`, name: kp.familyName, sub, cat: 'kitchen-parts', tester: false, variants: [], part: true };
      families.set(kp.family, p);
      out.push(p);
    }
    p.variants.push({ item: { kind: 'feature', id: kp.id }, label: kp.label, swatch: '#9aa0a4' });
  }
  for (const s of STRUCTURES) out.push({ key: `structure:${s.id}`, name: s.name, sub: s.sub, cat: 'shade', tester: false, variants: [{ item: { kind: 'structure', id: s.id }, label: s.name, swatch: '#b9b2a6' }] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Pictures                                                             */
/* ------------------------------------------------------------------ */

function picture(box: HTMLElement, item: LibraryItem) {
  const put = (url: string | null) => {
    if (!url || !box.isConnected) return;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    box.replaceChildren(img);
  };
  if (item.kind === 'plant') wantThumb(item.id, put);
  else if (item.kind === 'feature') wantFeatureThumb(item.id, put);
  else if (item.kind === 'material') void swatchFor(item.id).then(put);
}

/* ------------------------------------------------------------------ */
/* Details                                                              */
/* ------------------------------------------------------------------ */

const ft = (m: number) => {
  const v = m * FT;
  return v < 10 ? `${(Math.round(v * 2) / 2).toFixed(1).replace(/\.0$/, '')} ft` : `${Math.round(v)} ft`;
};
const inches = (n: number) => {
  const w = Math.floor(n + 1e-6), f = Math.round((n - w) * 8);
  const frac = f === 0 ? '' : f % 4 === 0 ? ' 1/2' : f % 2 === 0 ? ` ${f / 2}/4` : ` ${f}/8`;
  return `${w || ''}${frac}`.trim() + ' in';
};

function facts(p: Product, v: Variant): [string, string][] {
  const out: [string, string][] = [];
  if (p.plant) {
    const s = p.plant;
    out.push(['Group', s.group], ['Mature size', `${ft(s.matureHeight)} tall, ${ft(s.matureSpread)} wide`], ['Years to mature', String(s.yearsToMature)], ['Nursery size', s.container], ['Spacing', ft(s.spacing)]);
    return out;
  }
  if (p.part) {
    const kp = v.item.kind === 'feature' ? kitchenPartById.get(v.item.id) : undefined;
    if (kp) for (const f of kp.facts) {
      const i = f.indexOf(' ');
      const head = /^(Overall|Cutout|Opening|Bay) /.test(f) ? f.slice(0, i) : '';
      out.push(head ? [head, f.slice(i + 1)] : ['', f]);
    }
    return out;
  }
  if (p.feature) {
    out.push(['Group', p.feature.group], ['Footprint', `${ft(p.feature.footprint[0])} × ${ft(p.feature.footprint[1])}`]);
    if (p.feature.scale) out.push(['Weight', `about ${roundLb(p.feature.scale.lb).toLocaleString('en-US')} lb at its standard size; it scales with the size`]);
    return out;
  }
  const m = v.item.kind === 'material' ? materialById.get(v.item.id) : undefined;
  if (!m) return out;
  if (m.maker) out.push(['Maker', m.maker]);
  if (m.line) out.push(['Line', m.line]);
  if (m.color) out.push(['Color', m.color]);
  const sizes = m.pattern?.sizes;
  if (sizes?.length && (m.use === 'hardscape' || m.use === 'border')) out.push(['Sizes', sizes.map(([a, b]) => `${a} × ${b}`).join(', ') + ' in']);
  if (m.thickness && m.group === 'Pavers') out.push(['Thickness', inches(Math.round((m.thickness / IN) * 8) / 8)]);
  if (m.wall?.unit) out.push(['Course height', inches(m.wall.unit.course)]);
  if (m.turf) out.push(['Pile height', `${m.turf.pileMm} mm`], ['Face weight', `${m.turf.faceOz} oz`]);
  if (m.finish) out.push(['Finish', m.finish[0].toUpperCase() + m.finish.slice(1)]);
  if (m.stamp) out.push(['Stamp pattern', { ashlar: 'Ashlar slate', cobble: 'European fan cobblestone', plank: 'Wood plank' }[m.stamp]]);
  if (m.antique) out.push(['Release', 'Antiqued (darker joints)']);
  const lays = layingsFor(m);
  if (lays.length) out.push(['Laying patterns', lays.map((k) => layingName(m, k)).join(', ')]);
  return out;
}

/* ------------------------------------------------------------------ */
/* The panel                                                            */
/* ------------------------------------------------------------------ */

export interface LibraryHost {
  studio: Studio;
  /** Approvals can be changed (the studio runs inside Area Planner, which saves them). */
  canApprove: () => boolean;
  /** Ask the parent to turn a key on or off; it answers with new approvals. */
  approve: (key: string, on: boolean) => void;
  /** The Library opened or closed. */
  onToggle: (open: boolean) => void;
  /** Its Close button: the host closes it (with the book animation in full screen). Left out, it closes at once. */
  requestClose?: () => void;
}

/** The Library's category names, in order (the contents page of the book in app/librarybook.ts). */
export const libraryCategories = () => CATEGORIES.filter((c) => c.id !== 'testers').map((c) => c.label);

const AGES: { years: number; label: string }[] = [
  { years: 0, label: 'Install' },
  { years: 1, label: '1 yr' },
  { years: 3, label: '3 yr' },
  { years: 5, label: '5 yr' },
  { years: 10, label: '10 yr' },
];
/** Seconds the Approve toggle waits for Area Planner to confirm before it goes back. */
const CONFIRM_MS = 6000;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let state: {
  host: LibraryHost;
  root: HTMLElement;
  products: Product[];
  cat: string;
  query: string;
  showRemoved: boolean;
  product: Product | null;
  variant: Variant | null;
  laying?: LayingPattern;
  scene?: string;
  years: number;
  /** A kitchen part's options as chosen here (its sample is rebuilt with them). */
  partOpts: Record<string, boolean>;
  pose: { eye: THREE.Vector3; target: THREE.Vector3; fov: number } | null;
  token: number;
  /** A sample is being built: the studio's actions are the previous item's until it resolves. */
  building?: boolean;
  waiting: Map<string, { on: boolean; timer: number }>;
  note: string;
  off: () => void;
} | null = null;

export const libraryOpen = () => !!state;

export function openLibrary(host: LibraryHost, root: HTMLElement) {
  if (state) return;
  state = { host, root, products: buildProducts(), cat: 'pavers', query: '', showRemoved: false, product: null, variant: null, years: 3, partOpts: {}, pose: null, token: 0, waiting: new Map(), note: '', off: () => {} };
  state.off = onApprovalsChanged(() => {
    if (!state) return;
    for (const [k, w] of state.waiting) {
      if (isApproved(k) === w.on) {
        clearTimeout(w.timer);
        state.waiting.delete(k);
      }
    }
    render();
  });
  root.hidden = false;
  document.documentElement.classList.add('library-open');
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  // Open on the first product of the first category that has one.
  // The grid opens first; the first product's sample is drawn behind it.
  const first = state.products.find((p) => p.cat === state!.cat && shown(p));
  if (first) select(first, first.variants[0]);
  state.product = null;
  render();
  host.onToggle(true);
}

export function closeLibrary() {
  if (!state) return;
  const { root, host, off, waiting } = state;
  for (const w of waiting.values()) clearTimeout(w.timer);
  off();
  root.removeEventListener('click', onClick);
  root.removeEventListener('input', onInput);
  root.hidden = true;
  root.replaceChildren();
  document.documentElement.classList.remove('library-open');
  state = null;
  host.onToggle(false);
}

/** Approved, or waiting for Area Planner to confirm a change. */
function approvedNow(p: Product): boolean {
  if (p.part) return true;
  const w = state?.waiting.get(p.key);
  return w ? w.on : isApproved(p.key);
}
/** Listed in the browse view: testers that were removed hide unless "Show removed" is on. */
const shown = (p: Product) => !p.tester || approvedNow(p) || !!state?.showRemoved;

function select(p: Product, v: Variant) {
  if (!state) return;
  const changed = state.product !== p;
  state.product = p;
  state.variant = v;
  if (changed) {
    const scenes = scenesFor(v.item);
    state.scene = scenes[0]?.id;
    state.laying = undefined;
    state.years = 3;
    state.partOpts = {};
  }
  show();
}

/** Draw the chosen sample in the 3D view and frame it. */
function show(reframe = true) {
  if (!state?.variant) return;
  const { host, variant } = state;
  let smp: LibrarySample;
  try {
    smp = sampleFor(variant.item, { scene: state.scene, laying: state.laying, years: state.years, ...(state.product?.part ? { options: state.partOpts } : {}) });
  } catch (err) {
    console.error(err);
    state.note = 'This item has no sample yet.';
    return;
  }
  const my = ++state.token;
  state.building = true;
  if (reframe) host.studio.clearHandState('sample:');
  const stale = state.root.querySelector<HTMLElement>('#lib-acts');
  if (stale) stale.innerHTML = '';
  host.studio.setYears(smp.years ?? 3);
  const t = new THREE.Vector3(...smp.target);
  const pose = { eye: t.clone().add(new THREE.Vector3(0.35, 0.62, 1).normalize().multiplyScalar(smp.dist)), target: t, fov: 40 };
  const keep = !reframe && !!state.pose;
  if (!keep) state.pose = pose;
  host.studio.setPlan(smp.plan, keep).then(() => {
    if (state && my === state.token && !keep) host.studio.restorePose(pose);
    if (state && my === state.token) { state.building = false; fillActions(); }
  }, (err) => { console.error(err); if (state && my === state.token) state.building = false; });
}

/** Buttons for what the sample can do by hand (louvers, a door, lights): drawn once the sample is built. */
function fillActions() {
  const box = state?.root.querySelector<HTMLElement>('#lib-acts');
  if (!box || !state?.variant || state.variant.item.kind !== 'feature') return;
  const list = state.building ? [] : state.host.studio.featureActions('sample');
  box.innerHTML = list.length ? `<h4>Try it</h4><div class="lib-chips">${list.map((a) => `<button type="button" data-act="useact" data-val="${esc(a.key)}" aria-pressed="${a.on}">${esc(a.label)}: ${esc(a.words[a.on ? 0 : 1])}</button>`).join('')}</div>` : '';
}

function toggle(p: Product, on: boolean) {
  if (!state) return;
  const s = state;
  if (!s.host.canApprove()) {
    s.note = 'Open the Library from Area Planner’s 3D tab to approve or remove products.';
    render();
    return;
  }
  const prev = s.waiting.get(p.key);
  if (prev) clearTimeout(prev.timer);
  const timer = window.setTimeout(() => {
    if (!state) return;
    state.waiting.delete(p.key);
    state.note = `${p.name} was not saved: Area Planner did not answer. Check you are signed in, then try again.`;
    render();
  }, CONFIRM_MS);
  s.waiting.set(p.key, { on, timer });
  s.note = '';
  s.host.approve(p.key, on);
  render();
}

function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  if (state && t.id === 'lib-q') {
    state.query = t.value;
    renderList();
  }
}

function onClick(e: Event) {
  if (!state) return;
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  const s = state;
  const act = b.dataset.act!, val = b.dataset.val ?? '';
  const prod = () => s.products.find((p) => p.key + '|' + p.cat === val);
  switch (act) {
    case 'close': return s.host.requestClose ? s.host.requestClose() : closeLibrary();
    case 'cat': s.cat = val; s.query = ''; s.product = null; return render();
    case 'open': { const p = prod(); if (p) { select(p, p.variants[0]); render(); } return; }
    case 'back': s.product = null; return render();
    case 'variant': { const v = s.product?.variants[+val]; if (v && s.product) { select(s.product, v); render(); } return; }
    case 'laying': s.laying = val as LayingPattern; show(false); return render();
    case 'scene': s.scene = val; show(true); return render();
    case 'age': s.years = +val; s.host.studio.setYears(+val); return render();
    case 'approve': if (s.product) toggle(s.product, !approvedNow(s.product)); return;
    case 'remove': { const p = prod() ?? s.product; if (p) toggle(p, false); return; }
    case 'restore': { const p = prod() ?? s.product; if (p) toggle(p, true); return; }
    case 'removed': s.showRemoved = !s.showRemoved; return renderList();
    case 'partopt': s.partOpts = { ...s.partOpts, [val]: !(s.partOpts[val] ?? featureById.get(s.variant?.item.id ?? '')?.options?.find((o) => o.key === val)?.default ?? false) }; show(false); return render();
    case 'useact': s.host.studio.toggleFeatureAction('sample', val); fillActions(); return;
    case 'reset': if (s.pose) s.host.studio.restorePose(s.pose); return;
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function render() {
  if (!state) return;
  const s = state;
  const tabs = CATEGORIES.map((c) => `<button type="button" data-act="cat" data-val="${c.id}" aria-pressed="${c.id === s.cat}">${esc(c.label)}</button>`).join('');
  s.root.innerHTML = `
    <div class="lib-head">
      <b class="lib-title">Growth Library</b>
      <span class="lib-mode">${s.host.canApprove() ? 'Approvals are saved through Area Planner' : 'View only here. Approve from Area Planner’s 3D tab'}</span>
      <button type="button" class="btn btn-small" data-act="reset" title="Frame the sample again">Reset view</button>
      <button type="button" class="btn btn-small" data-act="close">Close library</button>
    </div>
    <nav class="lib-tabs" aria-label="Library categories">${tabs}</nav>
    <div class="lib-note" role="status" ${s.note ? '' : 'hidden'}>${esc(s.note)}</div>
    <div class="lib-body">${s.product ? detailHtml() : `<input id="lib-q" class="lib-search" type="search" placeholder="Search ${esc(CATEGORIES.find((c) => c.id === s.cat)?.label.toLowerCase() ?? '')}" aria-label="Search this category" autocomplete="off"><div class="lib-grid" id="lib-grid"></div>`}</div>`;
  if (s.product) { fillDetailPictures(); fillActions(); }
  else {
    const q = s.root.querySelector<HTMLInputElement>('#lib-q');
    if (q) q.value = s.query;
    renderList();
  }
}

function renderList() {
  if (!state || state.product) return;
  const s = state;
  const grid = s.root.querySelector<HTMLElement>('#lib-grid');
  if (!grid) return;
  const words = s.query.toLowerCase().split(/\s+/).filter(Boolean);
  const inCat = s.products.filter((p) => p.cat === s.cat);
  const list = inCat.filter((p) => shown(p) && words.every((w) => `${p.name} ${p.sub} ${p.variants.map((v) => v.label).join(' ')}`.toLowerCase().includes(w)));
  const removed = inCat.filter((p) => p.tester && !approvedNow(p)).length;
  grid.innerHTML = (list.length ? list.map((p, i) => {
    const on = approvedNow(p);
    const badge = p.part ? 'Kitchen part' : p.tester ? (on ? 'Tester' : 'Removed') : on ? 'Approved' : 'Not approved';
    const count = p.variants.length > 1 ? `${p.variants.length} ${p.part && !/^(Countertop|Island veneer)/.test(p.name) ? 'sizes' : 'colors'}` : '';
    return `<div class="lib-card${on ? '' : ' is-off'}">
      <button type="button" class="lib-open" data-act="open" data-val="${esc(p.key + '|' + p.cat)}" aria-label="${esc(p.name)}">
        <span class="lib-pic" data-pic="${i}" style="background:${p.variants[0].swatch}"></span>
        <span class="lib-txt"><b>${esc(p.name)}</b><small>${esc(p.sub)}</small><small>${esc(count)}</small></span>
      </button>
      <span class="lib-badge ${on ? 'on' : 'off'}">${badge}</span>
      ${p.tester ? `<button type="button" class="btn btn-small" data-act="${on ? 'remove' : 'restore'}" data-val="${esc(p.key + '|' + p.cat)}">${on ? 'Remove' : 'Bring back'}</button>` : ''}
    </div>`;
  }).join('') : `<p class="muted">Nothing here${s.query ? ` matches “${esc(s.query)}”` : ''}.</p>`)
    + (s.cat === 'testers' ? `<p class="lib-foot"><button type="button" class="linklike" data-act="removed">${s.showRemoved ? 'Hide removed testers' : `Show removed testers (${removed})`}</button></p>` : '');
  grid.querySelectorAll<HTMLElement>('[data-pic]').forEach((box) => {
    const p = list[+box.dataset.pic!];
    if (p) picture(box, p.variants[0].item);
  });
}

function detailHtml(): string {
  const s = state!;
  const p = s.product!, v = s.variant!;
  const on = approvedNow(p);
  const waiting = s.waiting.has(p.key);
  const m = v.item.kind === 'material' ? materialById.get(v.item.id) : undefined;
  const lays = m ? layingsFor(m) : [];
  const scenes = scenesFor(v.item);
  const approve = p.part
    ? `<span class="muted">A building block for outdoor kitchen islands, kept in Growth Studio only (not offered in plans).</span>`
    : p.tester
    ? `<button type="button" class="btn" data-act="${on ? 'remove' : 'restore'}">${on ? 'Remove this tester' : 'Bring it back'}</button>`
    : `<label class="lib-switch"><input type="checkbox" data-act="approve" ${on ? 'checked' : ''} ${s.host.canApprove() ? '' : 'disabled'}> <span>${waiting ? 'Saving…' : on ? 'Approved for Area Planner' : 'Not approved'}</span></label>`;
  const chips = (act: string, items: { val: string; label: string; on: boolean; sw?: string }[]) =>
    `<div class="lib-chips">${items.map((c) => `<button type="button" data-act="${act}" data-val="${esc(c.val)}" aria-pressed="${c.on}">${c.sw ? `<i style="background:${c.sw}"></i>` : ''}${esc(c.label)}</button>`).join('')}</div>`;
  return `
    <button type="button" class="linklike" data-act="back">← All ${esc(CATEGORIES.find((c) => c.id === p.cat)?.label.toLowerCase() ?? 'products')}</button>
    <div class="lib-detail-head"><span class="lib-pic lib-big" id="lib-big" style="background:${v.swatch}"></span>
      <div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.plant ? p.plant.botanical : p.sub)}</p></div></div>
    ${m && outOfAreaNote(m) ? `<p class="lib-notice"><strong>${esc(outOfAreaNote(m)!)}</strong></p>` : ''}
    <div class="lib-approve">${approve}</div>
    ${p.variants.length > 1 ? `<h4>${p.part && !/^(Countertop|Island veneer)/.test(p.name) ? 'Sizes' : 'Colors'}</h4>${chips('variant', p.variants.map((x, i) => ({ val: String(i), label: x.label, on: x === v, sw: x.swatch })))}` : ''}
    ${lays.length ? `<h4>Laying pattern</h4>${chips('laying', lays.map((k) => ({ val: k, label: layingName(m, k), on: (s.laying ?? lays[0]) === k })))}` : ''}
    ${scenes.length ? `<h4>Show it</h4>${chips('scene', scenes.map((c) => ({ val: c.id, label: c.label, on: (s.scene ?? scenes[0].id) === c.id })))}` : ''}
    ${p.plant ? `<h4>Age</h4>${chips('age', AGES.map((a) => ({ val: String(a.years), label: a.label, on: s.years === a.years })))}` : ''}
    ${p.part && v.item.kind === 'feature' && featureById.get(v.item.id)?.options?.length ? `<h4>Options</h4>${chips('partopt', featureById.get(v.item.id)!.options!.map((o) => ({ val: o.key, label: o.label, on: s.partOpts[o.key] ?? o.default })))}` : ''}
    <div id="lib-acts"></div>
    ${p.part ? `<p class="lib-about">${esc(featureById.get(v.item.id)?.about ?? '')}</p>` : ''}
    <dl class="lib-facts">${facts(p, v).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>
    <p class="muted lib-hint">Drag to turn, scroll or pinch to zoom, right-drag to move.</p>`;
}

function fillDetailPictures() {
  const box = state?.root.querySelector<HTMLElement>('#lib-big');
  if (box && state?.variant) picture(box, state.variant.item);
}
