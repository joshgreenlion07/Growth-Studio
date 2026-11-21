/**
 * Auto-hide for the controls over the 3D view (owner's request, 2026-11-19): the camera views, the control groups,
 * the full-screen key hint and the height meter fade and slide off screen after IDLE_MS with no mouse, touch or key
 * input, and come back at once on any of them. The page's CSS does the moving (`html.ui-idle` in page.html).
 *
 * Rules
 * - Mouse moves, the wheel, a touch or click anywhere on the page, and any key bring them back.
 * - Controller input does not (the owner drives with a controller and wants a clean view). Holding Menu shows them for
 *   SHOW_MS (`showFor`, wired in main.ts from engine/navigation.ts).
 * - They stay while the pointer is over one of them, while a menu or field in them has the focus (an open select),
 *   while keyboard focus is on one of them, and while `keep()` says so (the Library, a dialog, the Library's book).
 * - Touch mode: the on-screen joystick, rise buttons and the Orbit / Walk / Fly bar never hide (hiding them would leave
 *   a finger with nothing to hold). Touching them does not bring the top buttons back, so walking with the stick keeps
 *   the view clear; a tap anywhere else does.
 * - The quick-tool chip and the material pointer label are not part of this; they show and hide on their own.
 * - `prefers-reduced-motion`: they still hide, without the slide or fade (page.html).
 */
export const IDLE_MS = 2500;
/** How long holding the controller's Menu button shows the controls. */
export const SHOW_MS = 4000;

/** The parts that hide, and where the pointer counts as being "over the controls". */
const PARTS = '#views, .scene-tools, #fs-group, #nav-hint, #height-meter';
/** Touch controls that never hide and never wake the rest. */
const STAY = '.tc-stick, .tc-rise, .tc-bar';

export class SceneControls {
  private timer = 0;
  private holdUntil = 0;
  private hover = false;
  private last = { x: NaN, y: NaN };
  private root = document.documentElement;

  constructor(private keep: () => boolean) {
    // Mouse and pen moves; a still pointer over content that changed underneath it (Chrome can send a move then) is not one.
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.clientX === this.last.x && e.clientY === this.last.y) return;
      this.last = { x: e.clientX, y: e.clientY };
      this.wake();
    }, { passive: true, capture: true });
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.target instanceof Element && e.target.closest(STAY)) return;
      this.wake();
    }, { passive: true, capture: true });
    window.addEventListener('wheel', () => this.wake(), { passive: true, capture: true });
    window.addEventListener('keydown', () => this.wake(), { capture: true });
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'touch') this.hover = e.target instanceof Element && !!e.target.closest(PARTS);
    }, { passive: true });
    // Out of the window (no element to go to): nothing is under the pointer any more.
    document.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget) this.hover = false;
    }, { passive: true });
    window.addEventListener('blur', () => (this.hover = false));
    this.schedule(IDLE_MS);
  }

  /** Show them now and hide again after IDLE_MS without input. */
  wake() {
    if (this.root.classList.contains('ui-idle')) this.root.classList.remove('ui-idle');
    this.schedule(IDLE_MS);
  }

  /** Show them for `ms` whatever else happens (the controller's held Menu button). */
  showFor(ms = SHOW_MS) {
    this.holdUntil = performance.now() + ms;
    this.root.classList.remove('ui-idle');
    this.schedule(ms);
  }

  private busy() {
    if (performance.now() < this.holdUntil || this.hover || this.keep()) return true;
    if (document.querySelector('dialog[open]')) return true;
    const f = document.activeElement;
    return !!f && f !== document.body && !!f.closest(PARTS) && (f.tagName === 'SELECT' || f.matches(':focus-visible'));
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.busy()) return this.schedule(600);
      this.root.classList.add('ui-idle');
    }, ms);
  }
}
