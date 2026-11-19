// Second screen for the studio on its own (Area Planner has its own): a window, best dragged onto a second display,
// that shows what the material pointer is on: its picture (drawn from the 3D material itself), name, maker and line,
// color, the blend's colors, sizes, face and a few plain facts. With the pointer on nothing it shows the yard's cover
// picture. Where the browser will not open a window (an artifact viewer, a blocked pop-up) the same panel floats over
// the 3D view instead.
import type { Studio } from '../engine/studio';
import type { SitePlan } from '../siteplan/types';
import { lookOfPoint, type Look } from './looks';
import { pictureFor } from './swatches';

/** The window's own page: the studio's colors (light and dark) and type. */
const PAGE_CSS = `
:root { --paper: #f2f0eb; --panel: #fbfaf7; --ink: #1e2621; --ink-2: #5c665e; --line: #d8d4cb; --accent: #2f5b3b; }
@media (prefers-color-scheme: dark) { :root { --paper: #141816; --panel: #1b201d; --ink: #e8ebe7; --ink-2: #a2aaa3; --line: #323a35; --accent: #86b892; color-scheme: dark; } }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.45 "Archivo", "Helvetica Neue", Arial, sans-serif; }
`;
/** The panel itself, in the window or floating over the 3D view (where the page's own color tokens apply). */
const CSS = `
.ss { display: grid; gap: 12px; padding: 16px; }
.ss-pic { width: 100%; aspect-ratio: 4 / 3; border-radius: 6px; border: 1px solid var(--line); background: var(--panel) center / cover no-repeat; overflow: hidden; }
.ss-pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ss h1 { margin: 0; font-size: 22px; line-height: 1.2; }
.ss .sub { margin: 0; color: var(--ink-2); }
.ss-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ss-chips div { display: grid; justify-items: center; gap: 2px; }
.ss-chips i { width: 44px; height: 30px; border-radius: 3px; border: 1px solid var(--line); }
.ss-chips code { font: 11px "IBM Plex Mono", ui-monospace, Menlo, monospace; color: var(--ink-2); }
.ss dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; margin: 0; }
.ss-notice { margin: 0; padding: 4px 0 4px 10px; border-left: 3px solid #c2410c; }
.ss dt { color: var(--ink-2); }
.ss dd { margin: 0; }
.ss ul { margin: 0; padding-left: 18px; }
.ss .hint { color: var(--ink-2); font-size: 13px; margin: 0; }
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function lookHtml(look: Look): string {
  const rows: [string, string][] = [];
  if (look.maker) rows.push(['Maker', look.maker]);
  if (look.line) rows.push(['Line', look.line]);
  if (look.color && look.color !== look.name) rows.push(['Color', look.color]);
  if (look.sizeText?.length) rows.push(['Sizes', look.sizeText.join('; ')]);
  else if (look.sizes?.length) rows.push(['Sizes', look.sizes.map(([a, b]) => `${a} × ${b}`).join(', ') + ' in']);
  if (look.face) rows.push(['Face', look.face]);
  if (look.layings?.length) rows.push(['Laying patterns', look.layings.map((l) => l.name).join(', ')]);
  const sub = look.botanical ? `<em>${esc(look.botanical)}</em>` : esc([look.maker, look.line].filter(Boolean).join(' ') || look.group);
  return `<div class="ss">
    <div class="ss-pic" style="background-color:${esc(look.sw || '#999')}">${look.swatch ? `<img alt="" src="${look.swatch}">` : ''}</div>
    <div><h1>${esc(look.name)}</h1><p class="sub">${sub}</p></div>
    ${look.palette.length ? `<div class="ss-chips">${look.palette.map((c) => `<div><i style="background:${esc(c)}"></i><code>${esc(c)}</code></div>`).join('')}</div>` : ''}
    ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${look.notice ? `<p class="ss-notice"><strong>${esc(look.notice)}</strong></p>` : ''}
    ${look.about ? `<p>${esc(look.about)}</p>` : ''}
    ${look.spec.length ? `<ul>${look.spec.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function welcomeHtml(title: string, cover: string | null): string {
  return `<div class="ss">
    <div class="ss-pic">${cover ? `<img alt="" src="${cover}">` : ''}</div>
    <div><h1>${esc(title)}</h1><p class="sub">Green Lion Growth Studio</p></div>
    <p class="hint">Point at anything in the 3D view to see it here: the crosshair in the middle of the view picks it (P turns the pointer on or off, L locks it).</p>
  </div>`;
}

export interface SecondScreenHost {
  studio: Studio;
  plan: () => SitePlan;
  /** The project name for the welcome page. */
  title: () => string;
  button: HTMLButtonElement;
  /** Where the floating panel goes when no window can be opened. */
  floatHost: HTMLElement;
  /** Shown to the person (a short message). */
  toast: (text: string) => void;
}

export function initSecondScreen(host: SecondScreenHost) {
  let win: Window | null = null;
  let float: HTMLElement | null = null;
  let on = false;
  let cover: string | null = null;
  let current: Look | null = null;
  let poll = 0;
  let pointNow = '';

  const target = (): HTMLElement | null => (win && !win.closed ? win.document.getElementById('ss') : float?.querySelector<HTMLElement>('.ss-body') ?? null);
  const paint = () => {
    const box = target();
    if (!box) return;
    box.innerHTML = current ? lookHtml(current) : welcomeHtml(host.title(), cover);
  };

  const loadCover = () => {
    host.studio.coverImage(1000).then((blob) => {
      if (cover) URL.revokeObjectURL(cover);
      cover = URL.createObjectURL(blob);
      if (!current) paint();
    }, () => {});
  };

  const onPoint = (hit: { id: string; catalogId: string } | null) => {
    if (!on) return;
    const look = hit ? lookOfPoint(hit.catalogId, host.plan(), hit.id) : null;
    current = look;
    const now = (pointNow = hit ? `${hit.id}|${hit.catalogId}` : '');
    paint();
    if (look && hit) {
      void pictureFor(hit.catalogId).then((url) => {
        if (url && on && pointNow === now && current) {
          current = { ...current, swatch: url };
          paint();
        }
      });
    }
  };

  const openWindow = (): boolean => {
    let w: Window | null = null;
    try {
      w = window.open('', 'gs-second-screen', 'popup=yes,width=540,height=860');
    } catch {
      w = null;
    }
    if (!w) return false;
    try {
      w.document.open();
      w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth Studio, second screen</title><style>${PAGE_CSS}${CSS}</style></head><body><main id="ss"></main></body></html>`);
      w.document.close();
    } catch {
      try { w.close(); } catch { /* ignore */ }
      return false;
    }
    win = w;
    poll = window.setInterval(() => { if (!win || win.closed) stop(); }, 1000);
    return true;
  };

  const openFloat = () => {
    float = document.createElement('aside');
    float.className = 'ss-float';
    float.setAttribute('aria-label', 'Second screen');
    float.innerHTML = `<div class="ss-float-head"><b>Second screen</b><button type="button" class="btn btn-small">Close</button></div><style>${CSS}</style><div class="ss-body"></div>`;
    float.querySelector('button')!.addEventListener('click', () => stop());
    host.floatHost.append(float);
  };

  const start = () => {
    on = true;
    current = null;
    if (!openWindow()) {
      openFloat();
      host.toast('This browser kept the second window from opening, so the second screen shows over the 3D view.');
    }
    host.button.setAttribute('aria-pressed', 'true');
    host.studio.onPoint = onPoint;
    host.studio.setPointer(true);
    paint();
    loadCover();
  };

  const stop = () => {
    if (!on) return;
    on = false;
    clearInterval(poll);
    if (win && !win.closed) try { win.close(); } catch { /* ignore */ }
    win = null;
    float?.remove();
    float = null;
    host.button.setAttribute('aria-pressed', 'false');
    host.studio.setPointer(false);
    host.studio.onPoint = () => {};
  };

  host.button.addEventListener('click', () => (on ? stop() : start()));
  window.addEventListener('beforeunload', () => { if (win && !win.closed) win.close(); });
}
