import * as THREE from 'three';
import type { Studio } from '../engine/studio';

/**
 * The Library's opening in full screen (owner's request, 2026-11-19): the camera tilts down to the ground, a Green Lion
 * design book appears closed (Deep green cover, the logo on a Charcoal plate, "Growth Library" in Tinos), its cover
 * swings open with a CSS 3D turn, and the left page grows into the Library panel while the book fades, leaving the
 * panel and the 3D sample. Closing plays it backwards: the panel shrinks into the left page, the cover closes, the
 * yard is rebuilt behind the closed book, and the camera tilts back up to where it was.
 *
 *   open    0      camera tilts down (TILT_MS)            close   0      book shows open, panel shrinks into it
 *           300    book fades and rises in                        280    cover closes (COVER_MS)
 *           780    cover opens (COVER_MS); Library opens          1000   Library closes, the yard is rebuilt
 *           1530   left page grows into the panel                 built  camera tilts up, book fades out
 *           1860   done                                                  +450 done
 *
 * Under 2 s each way (the close waits for the yard to be built). Pressing Library again, holding View or Esc skips to
 * the end. With `prefers-reduced-motion` the panel only fades. Outside full screen none of this runs.
 */
const TILT_MS = 850;
const COVER_MS = 750;
const GROW_MS = 320;
/** Page width to height of the book. */
const PAGE_RATIO = 0.72;

export interface BookHost {
  studio: () => Studio | null;
  /** #library-book, the overlay the book is drawn in (inside the full-screen element). */
  book: HTMLElement;
  /** #library, the Library panel. */
  panel: HTMLElement;
  logo: string;
  categories: () => string[];
}

type Pose = { eye: THREE.Vector3; target: THREE.Vector3; fov: number };

/** Looking down at the ground just ahead of where the camera stands; the eye stays. */
export function lookDownPose(s: Studio, from: Pose): Pose {
  const eye = from.eye.clone();
  const dir = from.target.clone().sub(eye);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  const h = Math.max(0.3, eye.y - s.groundHeight(eye.x, eye.z));
  const t = eye.clone().addScaledVector(dir, Math.max(0.6, h * 0.36));
  t.y = s.groundHeight(t.x, t.z);
  return { eye, target: t, fov: from.fov };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A run of timed steps and animations that can be skipped to its end at any moment. */
class Run {
  constructor(private k = 1) {}
  private timers: number[] = [];
  private anims: Animation[] = [];
  private steps: { run: () => void; done: boolean }[] = [];
  private skipping = false;
  ended = false;
  /** Called once at the end, skipped or not. */
  onEnd: (skipped: boolean) => void = () => {};
  get skipped() {
    return this.skipping;
  }
  at(ms: number, run: () => void) {
    const st = { run, done: false };
    this.steps.push(st);
    if (this.skipping) this.fire(st);
    else this.timers.push(window.setTimeout(() => this.fire(st), ms * this.k));
  }
  /** A step that waits for something outside (the yard being built); `go` is called with a function that fires it. */
  later(run: () => void) {
    const st = { run, done: false };
    this.steps.push(st);
    return () => this.fire(st);
  }
  anim(el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(0.45, 0, 0.2, 1)') {
    const a = el.animate(frames, { duration: ms * this.k, easing, fill: 'forwards' });
    this.anims.push(a);
    if (this.skipping) a.finish();
    return a;
  }
  skip() {
    this.timers.forEach(clearTimeout);
    this.skipping = true;
    for (const a of this.anims) a.finish();
    for (const st of this.steps) this.fire(st);
  }
  /** Drop every animation's held end state (the elements go back to their own styles). */
  clear() {
    this.timers.forEach(clearTimeout);
    for (const a of this.anims) a.cancel();
    this.anims = [];
  }
  private fire(st: { run: () => void; done: boolean }) {
    if (st.done || this.ended) return;
    st.done = true;
    st.run();
  }
}

export class LibraryBook {
  /** Slows the whole sequence down this many times (for looking at it frame by frame in a test; 1 in the app). */
  timeScale = 1;
  private run: Run | null = null;
  /** Set while closing: the camera's way back is the book's to play once the yard is built. */
  private back: ((pose: Pose) => void) | null = null;
  private parts: { scrim: HTMLElement; stage: HTMLElement; book: HTMLElement; cover: HTMLElement; left: HTMLElement } | null = null;

  constructor(private host: BookHost) {}

  busy() {
    return !!this.run;
  }

  /** Skip whatever is playing to its end. */
  skip() {
    this.run?.skip();
  }

  /** The yard is back after closing: where the camera goes. False when the book is not waiting for it. */
  cameraBack(pose: Pose): boolean {
    const b = this.back;
    if (!b) return false;
    this.back = null;
    b(pose);
    return true;
  }

  open(openLib: () => void, reduced: boolean) {
    const { panel } = this.host;
    const r = (this.run = new Run(this.timeScale));
    if (reduced) {
      openLib();
      r.anim(panel, [{ opacity: 0 }, { opacity: 1 }], 220, 'ease-out');
      r.at(240, () => this.end(r));
      return;
    }
    const s = this.host.studio();
    const p = this.build();
    document.documentElement.classList.add('lib-anim');
    if (s) s.tweenToPose(lookDownPose(s, s.savePose()), TILT_MS * this.timeScale);
    this.layout(false);
    r.at(300, () => {
      r.anim(p.scrim, [{ opacity: 0 }, { opacity: 1 }], 480, 'ease-out');
      r.anim(p.stage, [{ opacity: 0, transform: 'translateY(26px) scale(0.9)' }, { opacity: 1, transform: 'none' }], 480, 'cubic-bezier(0.2, 0.7, 0.2, 1)');
    });
    r.at(780, () => {
      // The Library opens behind the book now, so its sample is built while the cover turns.
      openLib();
      panel.classList.add('lib-hold');
      r.anim(p.cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], COVER_MS);
      r.anim(p.book, [{ transform: this.shift(true) }, { transform: 'none' }], COVER_MS);
    });
    r.at(780 + COVER_MS, () => {
      panel.classList.remove('lib-hold');
      // The page grows over the book as the book fades.
      panel.classList.add('lib-over');
      const from = p.left.getBoundingClientRect(), to = panel.getBoundingClientRect();
      if (to.width && to.height && from.width) {
        const dx = from.left - to.left, dy = from.top - to.top, sx = from.width / to.width, sy = from.height / to.height;
        r.anim(panel, [{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: '0 0', transform: 'none' }], GROW_MS, 'cubic-bezier(0.2, 0.7, 0.2, 1)');
      }
      r.anim(p.stage, [{ opacity: 1 }, { opacity: 0 }], GROW_MS - 40, 'ease-in');
      r.anim(p.scrim, [{ opacity: 1 }, { opacity: 0 }], GROW_MS, 'ease-in');
    });
    r.at(780 + COVER_MS + GROW_MS + 10, () => this.end(r));
  }

  close(closeLib: () => void, reduced: boolean) {
    const { panel } = this.host;
    const r = (this.run = new Run(this.timeScale));
    if (reduced) {
      r.anim(panel, [{ opacity: 1 }, { opacity: 0 }], 180, 'ease-in');
      r.at(190, () => {
        closeLib();
        this.end(r);
      });
      return;
    }
    const p = this.build();
    document.documentElement.classList.add('lib-anim');
    this.layout(true);
    r.anim(p.scrim, [{ opacity: 0 }, { opacity: 1 }], 260, 'ease-out');
    r.anim(p.stage, [{ opacity: 0 }, { opacity: 1 }], 220, 'ease-out');
    panel.classList.add('lib-over');
    const from = panel.getBoundingClientRect(), to = p.left.getBoundingClientRect();
    if (from.width && from.height && to.width) {
      const dx = to.left - from.left, dy = to.top - from.top, sx = to.width / from.width, sy = to.height / from.height;
      r.anim(panel, [{ transformOrigin: '0 0', transform: 'none', opacity: 1 }, { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 }], 260, 'cubic-bezier(0.45, 0, 0.6, 1)');
    }
    r.at(270, () => {
      panel.classList.add('lib-hold');
      r.anim(p.cover, [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }], COVER_MS - 50);
      r.anim(p.book, [{ transform: 'none' }, { transform: this.shift(true) }], COVER_MS - 50);
    });
    // The Library closes behind the closed book and the yard is rebuilt; once it is on screen (main.ts calls
    // cameraBack) the camera tilts up from the ground and the book goes.
    let pose: Pose | null = null;
    let done = () => {};
    r.at(270 + COVER_MS - 50, () => {
      this.back = (pp) => {
        pose = pp;
        done();
      };
      closeLib();
    });
    done = r.later(() => {
      const s = this.host.studio();
      if (s && pose && !r.skipped) {
        s.restorePose(lookDownPose(s, pose));
        s.tweenToPose(pose, TILT_MS * this.timeScale);
      }
      r.anim(p.stage, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(0.94)' }], 320, 'ease-in');
      r.anim(p.scrim, [{ opacity: 1 }, { opacity: 0 }], 420, 'ease-in');
      r.at(440, () => this.end(r));
    });
    // Skipped: no tilt. Before the yard is back, main.ts puts the camera straight back (cameraBack returns false);
    // during the tilt, it jumps to its end.
    r.onEnd = (skipped) => {
      const s = this.host.studio();
      if (skipped && pose && s) s.restorePose(pose);
    };
    r.at(30000, () => this.end(r));
  }

  private end(r: Run) {
    if (r.ended) return;
    r.ended = true;
    r.clear();
    if (this.run === r) this.run = null;
    this.back = null;
    this.host.panel.classList.remove('lib-hold', 'lib-over');
    this.host.book.hidden = true;
    document.documentElement.classList.remove('lib-anim');
    r.onEnd(r.skipped);
  }

  /** Spread offset: closed, the book is shifted so the cover (the right half) sits in the middle. */
  private shift(closed: boolean) {
    return closed ? 'translateX(calc(var(--bk-p) * -0.5))' : 'none';
  }

  /** Size the book to the screen and set its resting state (open or closed). */
  private layout(open: boolean) {
    const p = this.parts!;
    const box = this.host.book.parentElement!.getBoundingClientRect();
    const pw = Math.round(Math.min(box.width * 0.3, box.height * 0.66 * PAGE_RATIO, 440));
    this.host.book.style.setProperty('--bk-p', `${pw}px`);
    this.host.book.style.setProperty('--bk-h', `${Math.round(pw / PAGE_RATIO)}px`);
    this.host.book.hidden = false;
    p.cover.style.transform = open ? 'rotateY(-180deg)' : 'rotateY(0deg)';
    p.book.style.transform = this.shift(!open);
    p.scrim.style.opacity = '0';
    p.stage.style.opacity = '0';
  }

  private build() {
    if (this.parts) return this.parts;
    const root = this.host.book;
    const cats = this.host.categories().map((c) => `<li>${esc(c)}</li>`).join('');
    root.innerHTML = `
      <div class="bk-scrim"></div>
      <div class="bk-stage"><div class="bk-persp"><div class="bk-book">
        <div class="bk-page bk-right">
          <p class="bk-kicker">Contents</p>
          <ul class="bk-toc">${cats}</ul>
        </div>
        <div class="bk-cover">
          <div class="bk-face bk-front">
            <div class="bk-plate"><img src="${this.host.logo}" alt="Green Lion"></div>
            <div class="bk-title">Growth Library</div>
            <div class="bk-rule"></div>
            <div class="bk-sub">Green Lion design book</div>
          </div>
          <div class="bk-face bk-back">
            <p class="bk-kicker">Green Lion Landscape</p>
            <div class="bk-title bk-title-ink">Growth Library</div>
            <p class="bk-note">Every plant, material and feature in 3D.</p>
          </div>
        </div>
      </div></div></div>`;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.parts = { scrim: q('.bk-scrim'), stage: q('.bk-stage'), book: q('.bk-book'), cover: q('.bk-cover'), left: q('.bk-back') };
    return this.parts;
  }
}
