import type { NavMode } from '../engine/navigation';
import type { Studio } from '../engine/studio';

/**
 * Touch mode: on-screen controls for a tablet with no keyboard or controller (`html.touch-ui`, set by main.ts).
 *
 *   mode switcher   Orbit / Walk / Fly, a Home button and a Use button, bottom center
 *   joystick        bottom left, walk and fly: analog movement (Navigation.setVirtualStick)
 *   rise / sink     bottom right, fly only: hold to climb or sink (Navigation.setVirtualRise)
 *
 * Looking, orbiting and zooming are fingers on the scene itself (OrbitControls in orbit, Navigation in walk and fly).
 * Every control here only moves the camera or uses what the view is on; none changes the plan, so it is the same for
 * view-only accounts. Buttons are at least 44 px and never stop an event's propagation, so the sound unlock
 * (engine/audio.ts) still hears the first touch. Looks are in page.html under `.tc-`.
 */

/** Joystick travel from its center, as a share of the ring's width (52 px on the 132 px ring; smaller rings travel less). */
const STICK_TRAVEL = 0.4;

export class TouchControls {
  private root: HTMLElement;
  private knob: HTMLElement;
  private stick: HTMLElement;
  private modeBtns: HTMLButtonElement[] = [];
  private stickId = -1;
  private rise = { up: false, down: false };
  private on = false;
  private riseIds = { up: -1, down: -1 };

  constructor(container: HTMLElement, private studio: () => Studio | null) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    this.root = el('div', 'tc-root');
    this.root.dataset.mode = 'orbit';

    // Mode switcher, Home and Use.
    const bar = el('div', 'tc-bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Touch controls');
    const seg = el('div', 'tc-seg');
    for (const [mode, label] of [['orbit', 'Orbit'], ['walk', 'Walk'], ['fly', 'Fly']] as const) {
      const b = el('button', 'tc-btn', label);
      b.type = 'button';
      b.dataset.mode = mode;
      b.setAttribute('aria-pressed', String(mode === 'orbit'));
      b.addEventListener('click', () => this.studio()?.setNavMode(mode));
      this.modeBtns.push(b);
      seg.append(b);
    }
    const home = el('button', 'tc-btn tc-solo', 'Home');
    home.type = 'button';
    home.title = 'Back to the start';
    home.addEventListener('click', () => this.studio()?.goHome());
    const use = el('button', 'tc-btn tc-solo', 'Use');
    use.type = 'button';
    use.title = 'Use what the middle of the view is on: open a door or lid, switch a fire, water or light';
    use.addEventListener('click', () => this.studio()?.onUse());
    bar.append(seg, home, use);

    // Joystick.
    this.stick = el('div', 'tc-stick');
    this.stick.setAttribute('aria-label', 'Move');
    this.knob = el('div', 'tc-knob');
    this.stick.append(this.knob);
    this.stick.addEventListener('pointerdown', (e) => {
      if (this.stickId >= 0) return;
      this.stickId = e.pointerId;
      this.stick.setPointerCapture?.(e.pointerId);
      this.moveStick(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e);
    });
    const letGo = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.releaseStick();
    };
    this.stick.addEventListener('pointerup', letGo);
    this.stick.addEventListener('pointercancel', letGo);
    this.stick.addEventListener('lostpointercapture', letGo);

    // Rise and sink (fly).
    const lift = el('div', 'tc-rise');
    const ids = { up: -1, down: -1 };
    this.riseIds = ids;
    const mk = (key: 'up' | 'down', label: string, title: string) => {
      const b = el('button', 'tc-btn tc-hold', label);
      b.type = 'button';
      b.title = title;
      b.addEventListener('pointerdown', (e) => {
        if (ids[key] >= 0) return;
        ids[key] = e.pointerId;
        b.setPointerCapture?.(e.pointerId);
        this.rise[key] = true;
        b.classList.add('on');
        this.sendRise();
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== ids[key]) return;
        ids[key] = -1;
        this.rise[key] = false;
        b.classList.remove('on');
        this.sendRise();
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      return b;
    };
    lift.append(mk('up', '▲', 'Hold to rise'), mk('down', '▼', 'Hold to sink'));

    this.root.append(bar, this.stick, lift);
    container.append(this.root);

    // iOS Safari ignores user-scalable=no: stop its page pinch and the long-press menu while touch mode is on.
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => { if (this.on) e.preventDefault(); }, { passive: false });
    // A drag on the scene or a touch control never scrolls or bounces the page (touch-action does this too; this
    // covers WebKit versions that let a touchmove through). Other parts of the pane, like scrolling panels, keep theirs.
    container.addEventListener('touchmove', (e) => {
      const t = e.target as Element | null;
      if (this.on && e.cancelable && t && (t.tagName === 'CANVAS' || this.root.contains(t))) e.preventDefault();
    }, { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    container.addEventListener('contextmenu', (e) => { if (this.on) e.preventDefault(); });
    // Nothing keeps pushing while the page is out of sight.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    window.addEventListener('blur', () => this.releaseAll());
  }

  /** Touch controls shown or hidden (the page's `html.touch-ui` class does the showing). */
  setOn(on: boolean) {
    this.on = on;
    if (!on) this.releaseAll();
  }

  /** The page is paused or hidden: let go of everything on screen. */
  reset() {
    this.releaseAll();
  }

  /** The movement mode changed: show the joystick (walk, fly) and the rise buttons (fly) as they apply. */
  setMode(m: NavMode) {
    this.root.dataset.mode = m;
    document.documentElement.classList.toggle('tc-first', m !== 'orbit');
    for (const b of this.modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    this.releaseAll();
  }

  private moveStick(e: PointerEvent) {
    const r = this.stick.getBoundingClientRect();
    const R = Math.max(30, r.width * STICK_TRAVEL);
    this.stick.classList.add('on');
    let x = (e.clientX - (r.left + r.width / 2)) / R;
    let y = (e.clientY - (r.top + r.height / 2)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.knob.style.transform = `translate(${x * R}px, ${y * R}px)`;
    this.studio()?.nav.setVirtualStick(x, y);
  }

  private releaseStick() {
    this.stickId = -1;
    this.stick.classList.remove('on');
    this.knob.style.transform = '';
    this.studio()?.nav.setVirtualStick(0, 0);
  }

  private sendRise() {
    this.studio()?.nav.setVirtualRise(this.rise.up === this.rise.down ? 0 : this.rise.up ? 1 : -1);
  }

  private releaseAll() {
    this.releaseStick();
    this.rise.up = this.rise.down = false;
    this.riseIds.up = this.riseIds.down = -1;
    this.root.querySelectorAll('.tc-hold').forEach((b) => b.classList.remove('on'));
    this.sendRise();
  }
}
