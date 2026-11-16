// Plant picker: a button showing the chosen plant (picture, common name, botanical
// name) that opens a searchable list. Search matches the common name, the botanical
// name, the group and the catalog id, so "pistache", "chinensis" or "grass" all work.
import { PLANTS, plantById, type PlantGroup, type PlantSpec } from '../siteplan/catalog';
import { prefetchThumbs, wantThumb } from './plantthumbs';

const GROUPS: PlantGroup[] = ['Trees', 'Shrubs', 'Grasses', 'Perennials and color', 'Succulents', 'Tropicals', 'Groundcover'];
const FT = 3.28084;
const fmtFt = (m: number) => {
  const v = m * FT;
  return v < 10 ? `${(Math.round(v * 2) / 2).toFixed(1).replace(/\.0$/, '')} ft` : `${Math.round(v)} ft`;
};

const hay = new Map<string, string>(PLANTS.map((p) => [p.id, `${p.name} ${p.botanical} ${p.group} ${p.id.replace(/-/g, ' ')}`.toLowerCase().replace(/[()',]/g, ' ')]));

/** Every word typed must appear somewhere in the plant's names. */
export function plantMatches(spec: PlantSpec, query: string): boolean {
  const words = query.toLowerCase().replace(/[()',]/g, ' ').split(/\s+/).filter(Boolean);
  const text = hay.get(spec.id) ?? '';
  return words.every((w) => text.includes(w));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A small picture box: a flat swatch of the plant's leaf color until its picture is drawn. */
function pictureBox(spec: PlantSpec | undefined, size: 'sm' | 'md'): HTMLElement {
  const box = el('span', `pp-pic pp-${size}`);
  box.setAttribute('aria-hidden', 'true');
  if (!spec) {
    box.classList.add('pp-none');
    return box;
  }
  box.style.backgroundColor = spec.foliage;
  wantThumb(spec.id, (url) => {
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    box.replaceChildren(img);
  });
  return box;
}

export interface PlantPickerOptions {
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
  /** Adds a "None" row that returns an empty string. */
  allowNone?: boolean;
  noneLabel?: string;
}

export function plantPicker(opts: PlantPickerOptions): HTMLElement {
  const root = el('div', 'pp');
  const btn = el('button', 'pp-btn');
  btn.type = 'button';
  btn.id = opts.id;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', opts.label);
  root.append(btn);

  let value = opts.value;
  const paintButton = () => {
    const spec = plantById.get(value);
    btn.replaceChildren(
      pictureBox(spec, 'md'),
      (() => {
        const t = el('span', 'pp-text');
        t.append(el('span', 'pp-name', spec ? spec.name : opts.noneLabel ?? 'None'));
        if (spec) t.append(el('span', 'pp-bot', spec.botanical));
        return t;
      })(),
      el('span', 'pp-caret', '▾'),
    );
  };
  paintButton();
  // Draw this plant's picture first, then the rest while the person is working.
  prefetchThumbs(plantById.has(value) ? value : undefined);

  let panel: HTMLElement | null = null;
  let closeAll: (() => void) | null = null;

  const open = () => {
    if (panel) return;
    panel = el('div', 'pp-panel');
    const search = el('input', 'pp-search');
    search.type = 'search';
    search.placeholder = 'Search by common or botanical name';
    search.setAttribute('aria-label', 'Search plants');
    search.autocomplete = 'off';
    search.spellcheck = false;
    const status = el('div', 'pp-status');
    status.setAttribute('role', 'status');
    const list = el('div', 'pp-list');
    list.setAttribute('role', 'listbox');
    list.id = `${opts.id}-list`;
    list.setAttribute('aria-label', opts.label);
    search.setAttribute('aria-controls', list.id);
    panel.append(search, status, list);
    document.body.append(panel);
    btn.setAttribute('aria-expanded', 'true');

    let rows: HTMLElement[] = [];
    let active = -1;

    const setActive = (i: number, scroll = true) => {
      if (rows[active]) rows[active].classList.remove('is-active');
      active = i;
      const r = rows[i];
      if (r) {
        r.classList.add('is-active');
        search.setAttribute('aria-activedescendant', r.id);
        if (scroll) r.scrollIntoView({ block: 'nearest' });
      } else search.removeAttribute('aria-activedescendant');
    };

    const choose = (id: string) => {
      value = id;
      paintButton();
      close();
      btn.focus();
      opts.onChange(id);
    };

    const row = (id: string, spec: PlantSpec | undefined, n: number) => {
      const r = el('div', 'pp-row');
      r.id = `${opts.id}-opt-${n}`;
      r.setAttribute('role', 'option');
      r.setAttribute('aria-selected', String(id === value));
      if (id === value) r.classList.add('is-current');
      const t = el('span', 'pp-text');
      t.append(el('span', 'pp-name', spec ? spec.name : opts.noneLabel ?? 'None'));
      if (spec) t.append(el('span', 'pp-bot', spec.botanical));
      r.append(pictureBox(spec, 'sm'), t);
      if (spec) r.append(el('span', 'pp-size', `${fmtFt(spec.matureHeight)} × ${fmtFt(spec.matureSpread)}`));
      r.addEventListener('mousedown', (e) => e.preventDefault());
      r.addEventListener('click', () => choose(id));
      r.addEventListener('mousemove', () => {
        const i = rows.indexOf(r);
        if (i !== active) setActive(i, false);
      });
      return r;
    };

    const fill = () => {
      const q = search.value.trim();
      list.replaceChildren();
      rows = [];
      let count = 0;
      if (opts.allowNone && !q) {
        const r = row('', undefined, rows.length);
        rows.push(r);
        list.append(r);
      }
      for (const g of GROUPS) {
        const items = PLANTS.filter((p) => p.group === g && (!q || plantMatches(p, q)));
        if (!items.length) continue;
        const sec = el('div', 'pp-group');
        sec.setAttribute('role', 'group');
        sec.setAttribute('aria-label', g);
        sec.append(el('div', 'pp-group-name', g));
        for (const p of items) {
          const r = row(p.id, p, rows.length);
          rows.push(r);
          sec.append(r);
          count++;
        }
        list.append(sec);
      }
      if (!rows.length) list.append(el('div', 'pp-empty', `No plant matches “${q}”.`));
      status.textContent = q ? `${count} ${count === 1 ? 'plant' : 'plants'} found` : `${PLANTS.length} plants`;
      const cur = rows.findIndex((r) => r.classList.contains('is-current'));
      setActive(q ? (rows.length ? 0 : -1) : cur >= 0 ? cur : rows.length ? 0 : -1);
    };

    const place = () => {
      if (!panel) return;
      const b = btn.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(Math.max(b.width, 340), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, b.left), window.innerWidth - width - margin);
      const below = window.innerHeight - b.bottom - margin;
      const above = b.top - margin;
      const useBelow = below >= 280 || below >= above;
      const room = Math.max(160, useBelow ? below : above);
      panel.style.width = `${width}px`;
      panel.style.left = `${left}px`;
      panel.style.maxHeight = `${Math.min(460, room)}px`;
      if (useBelow) {
        panel.style.top = `${b.bottom + 4}px`;
        panel.style.bottom = '';
      } else {
        panel.style.bottom = `${window.innerHeight - b.top + 4}px`;
        panel.style.top = '';
      }
    };

    const onDocDown = (e: Event) => {
      const t = e.target as Node;
      if (panel && !panel.contains(t) && !btn.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        btn.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (rows.length) setActive(Math.min(rows.length - 1, active + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (rows.length) setActive(Math.max(0, active - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = rows[active];
        if (r) r.click();
      }
    };
    const onResize = () => place();

    search.addEventListener('input', fill);
    search.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    // If the button leaves the page (the options box is rebuilt) while the list is open, close it too.
    const gone = new MutationObserver(() => {
      if (!btn.isConnected) close();
    });
    gone.observe(document.body, { childList: true, subtree: true });
    closeAll = () => {
      gone.disconnect();
      document.removeEventListener('pointerdown', onDocDown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      panel?.remove();
      panel = null;
      btn.setAttribute('aria-expanded', 'false');
      closeAll = null;
    };
    fill();
    place();
    search.focus();
    rows[active]?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => closeAll?.();

  btn.addEventListener('click', () => (panel ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !panel) {
      e.preventDefault();
      open();
    }
  });
  return root;
}
