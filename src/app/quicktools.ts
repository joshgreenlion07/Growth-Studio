import type { Studio } from '../engine/studio';
import { QUICK_HOLD_MS, viewHasKeys, type QuickDir } from '../engine/navigation';
import { MAX_MARKS } from '../engine/marks';
import { BUILD_STAGES, type BuildStage } from '../builder/construction';
import { MOODS, type Mood } from '../engine/sky';
import type { FeatureAction } from '../builder/actions';

/**
 * Quick tools: the controller's D-pad in every camera mode (and keys for the same).
 *   D-pad ← →   (, and .)   pick the tool
 *   D-pad ↑ ↓   (= and -)   use it; holding ↓ (or -) about a second is a long press (Mark: clear all)
 * A small chip at the bottom of the 3D view names the tool and what ↑ and ↓ do, shows on every change and fades.
 *
 * The tools are the one table below (TOOLS): reorder or remove rows freely; the last tool picked is remembered.
 */

export interface QuickHost {
  studio: () => Studio | null;
  /** The app's own setters, so the dock, the Stage menu and the parent page follow. */
  setStage: (s: BuildStage) => void;
  setMood: (m: Mood) => void;
  setYears: (y: number) => void;
  /** False while something else has the 3D view (the Library). */
  enabled: () => boolean;
}

interface QuickTool {
  id: string;
  name: string;
  /** What ↑ and ↓ do, for the chip. */
  up: string;
  down: string;
  /** The tool aims at the center of the view (a small cross shows there). */
  aims?: boolean;
  /** Use the tool: ↑ is 1, ↓ is -1. Returns what to show on the chip (the new state). */
  act: (dir: 1 | -1, s: Studio, h: QuickHost) => string;
  /** ↓ held (long press). */
  hold?: (s: Studio, h: QuickHost) => string;
  /** The state shown when the tool is picked. */
  status: (s: Studio) => string;
  /** Called when the tool is picked. */
  picked?: (s: Studio) => void;
}

/** Stages from the surface down: Finished, Sand, Base rock, Backfill, Trench, Excavate, Demo. */
const DIG = [...BUILD_STAGES].reverse();
const stageLabel = (id: BuildStage) => BUILD_STAGES.find((s) => s.id === id)?.label ?? id;
const YEARS = [0, 1, 3, 5, 10];
const yearLabel = (y: number) => (y === 0 ? 'At install' : y >= 10 ? '10 years' : `${+y.toFixed(1)} year${y === 1 ? '' : 's'}`);
const marksText = (n: number) => `${n} mark${n === 1 ? '' : 's'}${n >= MAX_MARKS ? ' (the most kept; the oldest goes)' : ''}`;

const TOOLS: QuickTool[] = [
  {
    id: 'dig',
    name: 'Dig layers',
    up: 'Back up',
    down: 'Dig deeper',
    picked: (s) => s.prepareStages(),
    status: (s) => stageLabel(s.buildStage),
    act(dir, s, h) {
      const i = DIG.findIndex((x) => x.id === s.buildStage);
      // ▲ backs up toward the finished surface, ▼ digs deeper.
      const next = DIG[Math.max(0, Math.min(DIG.length - 1, i - dir))];
      if (next.id !== s.buildStage) h.setStage(next.id);
      return next.label;
    },
  },
  {
    id: 'mark',
    name: 'Mark',
    up: 'Throw dirt',
    down: 'Remove last (hold: clear all)',
    aims: true,
    status: (s) => marksText(s.markCount),
    act(dir, s) {
      // The count is shown once the clod lands (QuickTools.marksChanged).
      if (dir > 0) return s.throwMark() ? 'Thrown' : 'Aim at the yard';
      return s.removeMark() ? marksText(s.markCount) : 'No marks';
    },
    hold(s) {
      const n = s.clearMarks();
      return n ? 'All marks cleared' : 'No marks';
    },
  },
  {
    id: 'tape',
    name: 'Tape measure',
    up: 'Drop point',
    down: 'Clear',
    aims: true,
    status: (s) => (s.tape.state === 'b' ? s.tape.describe().replace('\n', ' · ') : s.tape.state === 'a' ? 'Point A down: aim at B' : 'Aim at point A'),
    act(dir, s) {
      if (dir < 0) return s.tapeClear() ? 'Cleared' : 'Aim at point A';
      const r = s.tapeDrop();
      if (!r) return 'Aim at the yard';
      return r.state === 'a' ? 'Point A down: aim at B' : r.text.replace('\n', ' · ');
    },
  },
  {
    // Use things by hand: open and close doors and lids, switch fires, water and lights (builder/actions.ts).
    // A click works too while the Hand is picked, and the View button or G uses what you aim at with any tool.
    id: 'hand',
    name: 'Hand',
    up: 'Open / turn on',
    down: 'Close / turn off',
    aims: true,
    status: (s) => {
      const a = s.actionAt();
      return a ? handText(a) : HAND_NONE;
    },
    act(dir, s) {
      const r = s.useAction(dir);
      return r ? handText(r.action) : HAND_NONE;
    },
  },
  {
    id: 'light',
    name: 'Light',
    up: 'Later',
    down: 'Earlier',
    status: (s) => MOODS.find((m) => m.id === s.state.mood)?.label ?? '',
    act(dir, s, h) {
      const i = MOODS.findIndex((m) => m.id === s.state.mood);
      const next = MOODS[Math.max(0, Math.min(MOODS.length - 1, i + dir))];
      if (next.id !== s.state.mood) h.setMood(next.id);
      return next.label;
    },
  },
  {
    id: 'growth',
    name: 'Growth',
    up: 'Older',
    down: 'Younger',
    status: (s) => yearLabel(s.state.years),
    act(dir, s, h) {
      const y = s.state.years;
      // From a slider value between steps, the next step that way.
      const next = dir > 0 ? (YEARS.find((v) => v > y + 1e-6) ?? 10) : ([...YEARS].reverse().find((v) => v < y - 1e-6) ?? 0);
      if (next !== y) h.setYears(next);
      return yearLabel(next);
    },
  },
  {
    id: 'views',
    name: 'Views',
    up: 'Next view',
    down: 'Previous view',
    status: () => 'Saved camera views',
    act: (dir, s) => s.stepView(dir) || 'No saved views',
  },
];

/** What the Hand says about an action: 'Sauna door: Open'. */
const handText = (a: FeatureAction) => `${a.label}: ${a.words[a.on ? 0 : 1]}`;
const HAND_NONE = 'Aim at a door, lid, fire, water or light';

const STORE_KEY = 'growth-studio.quick-tool';
/** How long the chip stays after the last change, ms. */
const SHOW_MS = 2000;

export class QuickTools {
  private index = 0;
  private chip: HTMLDivElement;
  private aim: HTMLDivElement;
  private aimLabel: HTMLSpanElement;
  private aimTimer = 0;
  private hideTimer = 0;
  /** The aim cross shows only once the tools have been used this session (not just because one was remembered). */
  private used = false;
  private keyHold = 0;
  /** A clod is in the air: show the count when it lands. */
  private landing = false;

  constructor(private host: QuickHost, private scene: HTMLElement) {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      const i = TOOLS.findIndex((t) => t.id === saved);
      if (i >= 0) this.index = i;
    } catch {
      /* no storage (private window, sandboxed frame) */
    }
    this.chip = document.createElement('div');
    this.chip.className = 'quick-hud';
    this.chip.setAttribute('role', 'status');
    this.chip.setAttribute('aria-live', 'polite');
    this.aim = document.createElement('div');
    this.aim.className = 'quick-aim';
    this.aim.setAttribute('aria-hidden', 'true');
    this.aimLabel = document.createElement('span');
    this.aim.append(this.aimLabel);
    scene.append(this.chip, this.aim);
    this.keys();
  }

  get tool(): string {
    return TOOLS[this.index].id;
  }

  /** Tools left out of the D-pad cycle (view-only embed: the Mark tool). The tool in hand moves on if it is one. */
  private skip = new Set<string>();
  setSkip(ids: string[]) {
    this.skip = new Set(ids.filter((id) => TOOLS.some((t) => t.id === id)));
    if (this.skip.size >= TOOLS.length) this.skip.clear();
    if (this.skip.has(TOOLS[this.index].id)) this.index = this.step(this.index, 1);
  }
  private step(from: number, by: 1 | -1) {
    let i = from;
    do i = (i + by + TOOLS.length) % TOOLS.length;
    while (this.skip.has(TOOLS[i].id) && i !== from);
    return i;
  }

  /** A D-pad press (from the controller, or the keys below). */
  press(dir: QuickDir, held = false) {
    const s = this.host.studio();
    if (!s || !this.host.enabled()) return;
    this.used = true;
    if (this.skip.has(TOOLS[this.index].id)) this.index = this.step(this.index, 1);
    const t = TOOLS[this.index];
    if (dir === 'left' || dir === 'right') {
      this.index = this.step(this.index, dir === 'right' ? 1 : -1);
      const n = TOOLS[this.index];
      try {
        localStorage.setItem(STORE_KEY, n.id);
      } catch {
        /* not kept */
      }
      n.picked?.(s);
      s.handActive = n.id === 'hand';
      if (!s.handActive) s.renderer.domElement.style.cursor = '';
      this.show(n.status(s));
      this.watchAim();
      return;
    }
    if (held) {
      if (dir === 'down' && t.hold) this.show(t.hold(s, this.host));
      return;
    }
    const text = t.act(dir === 'up' ? 1 : -1, s, this.host);
    this.landing = t.id === 'mark' && dir === 'up' && text === 'Thrown';
    this.show(text);
  }

  /** The View button or G: use what the view is on, whatever tool is picked. */
  use() {
    const s = this.host.studio();
    if (!s || !this.host.enabled()) return;
    const r = s.useAction(0);
    this.flash(r ? handText(r.action) : HAND_NONE);
  }

  /** While the Hand is picked, name what the aim cross is on, a few times a second. */
  private watchAim() {
    clearInterval(this.aimTimer);
    this.aimLabel.textContent = '';
    if (TOOLS[this.index].id !== 'hand') return;
    this.aimTimer = window.setInterval(() => {
      const s = this.host.studio();
      if (!s || TOOLS[this.index].id !== 'hand') return this.watchAim();
      const a = s.actionAt();
      const text = a ? handText(a) : '';
      if (this.aimLabel.textContent !== text) this.aimLabel.textContent = text;
    }, 200);
  }

  /** The chip with one line only (the View button / G, which work with any tool). */
  private flash(state: string) {
    const st = document.createElement('div');
    st.className = 'qh-state';
    st.textContent = state;
    this.chip.replaceChildren(st);
    this.place();
    this.chip.classList.add('on');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.chip.classList.remove('on'), SHOW_MS);
  }

  /** The marks changed: after a throw, show the count as it is once the clod has landed. */
  marksChanged() {
    const s = this.host.studio();
    if (!this.landing || !s || TOOLS[this.index].id !== 'mark') return;
    this.landing = false;
    this.show(marksText(s.markCount));
  }

  /** Show the chip with the tool, what ↑ and ↓ do, and `state`; it fades after a moment. */
  private show(state: string) {
    const t = TOOLS[this.index];
    const line = (cls: string, ...kids: (Node | string)[]) => {
      const d = document.createElement('div');
      d.className = cls;
      d.append(...kids);
      return d;
    };
    const b = document.createElement('b');
    b.textContent = t.name;
    const st = document.createElement('b');
    st.textContent = state;
    this.chip.replaceChildren(
      line('qh-tool', '◀  ', b, '  ▶'),
      line('qh-act', `▲ ${t.up}   ▼ ${t.down}`),
      ...(state ? [line('qh-state', st)] : []),
    );
    // Shown and hidden by visibility only (no fade): the set of layers drawn over the canvas never changes.
    this.place();
    this.chip.classList.add('on');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.chip.classList.remove('on'), SHOW_MS);
    this.aim.classList.toggle('on', this.used && !!t.aims);
  }

  /** Bottom center, raised above the stage note and the full-screen key hint when they would be under it. */
  private place() {
    const sr = this.scene.getBoundingClientRect();
    const w = this.chip.offsetWidth;
    const left = sr.left + (sr.width - w) / 2, right = left + w;
    let bottom = 16;
    for (const id of ['stage-card', 'nav-hint']) {
      const el = document.getElementById(id);
      if (!el || el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.left < right + 8 && r.right > left - 8) bottom = Math.max(bottom, sr.bottom - r.top + 8);
    }
    this.chip.style.bottom = `${Math.round(bottom)}px`;
  }

  /** , and . pick the tool; = (or +) and - use it; - held is the long press. */
  private keys() {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (typing(e) || !viewHasKeys(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const dir: QuickDir | null = k === ',' || k === '<' ? 'left' : k === '.' || k === '>' ? 'right' : k === '=' || k === '+' ? 'up' : k === '-' || k === '_' ? 'down' : null;
      if (!dir) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(dir);
      if (dir === 'down') {
        clearTimeout(this.keyHold);
        this.keyHold = window.setTimeout(() => this.press('down', true), QUICK_HOLD_MS);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === '-' || e.key === '_') clearTimeout(this.keyHold);
    });
    window.addEventListener('blur', () => clearTimeout(this.keyHold));
  }
}
