import * as THREE from 'three';

/**
 * Moving the camera without the mouse orbit: an Xbox-style controller (the
 * browser's "standard" mapping) in every mode, plus keyboard and mouse-drag
 * looking in the first-person modes.
 *
 * Modes
 *   orbit  the normal view. Mouse orbits (OrbitControls); a controller flies.
 *   walk   first person at eye height, following the ground.
 *   fly    first person, free to rise and sink.
 *
 * Controller                     Keyboard
 *   Left stick   move              W A S D or arrows (walk / fly)
 *   Right stick  look              drag with the mouse (walk / fly)
 *   RT / LT      walk: zoom lens   wheel
 *                fly/orbit: fly in / out along the view
 *   RB / LB      rise / sink       E / Q (fly)
 *   Hold LS      faster            Shift
 *   A            walk / fly        V
 *   X            measurements      M     (off, totals, every edge)
 *   B            plant labels      N     (on their own, apart from the measurements)
 *   Y            material pointer  P
 *   RS click     lock its material L
 *   Menu         back to start     Home (walk / fly)
 *   D-pad ← →    pick a quick tool  , .   (every mode; see app/quicktools.ts)
 *   D-pad ↑ ↓    use it             = -   (hold ↓ or - to clear)
 *
 * Mouse wheel, trackpad scroll and trackpad pinch (Safari's gesture events,
 * Chrome's ctrl+wheel) zoom in every mode: the orbit distance, the lens when
 * walking, along the view when flying. Zoom and movement are eased with
 * frame-rate-independent curves, so they glide alike at 30, 60 and 120 fps.
 *
 * The camera and its look-at target move together, so OrbitControls carries
 * on from wherever the camera was left.
 */

export type NavMode = 'orbit' | 'walk' | 'fly';
/** A D-pad direction for the quick tools. */
export type QuickDir = 'left' | 'right' | 'up' | 'down';
/** How long ↓ is held before it counts as a long press (clear all), ms. */
export const QUICK_HOLD_MS = 900;
/** Eye height for walking, meters (about 5 ft 5 in). */
export const EYE_HEIGHT = 1.65;

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/* Feel. Rates are per second and used as 1 - exp(-rate * dt), so the glide is the same at 30, 60 or 120 fps. */
/** Stick dead zone (radial, so diagonals are not sticky) and the outer edge treated as full tilt. */
const STICK_DEAD = 0.13, STICK_FULL = 0.95;
/** Response curve: tilt^CURVE, gentle near the middle for fine moves, full speed at the edge. */
const STICK_CURVE = 1.8;
const TRIGGER_DEAD = 0.06;
/** How fast movement reaches the wanted speed, and how fast it coasts to a stop. */
const ACCEL = 7, DECEL = 9;
/** Stick look speed easing. */
const LOOK_EASE = 14;
/** Wheel and trackpad scroll zoom easing; a pinch follows the fingers more tightly. */
const WHEEL_EASE = 13, PINCH_EASE = 28;
/** Orbit distance per wheel pixel (log scale): one mouse notch (100 px) is about 7%. */
const WHEEL_ZOOM = 0.0007;
/** The orbit camera's distance limits (the same as OrbitControls' in studio.ts). */
const ORBIT_MIN = 0.6, ORBIT_MAX = 140;
/** Longest step a frame may take, seconds: after a stall the view moves on instead of jumping. */
const MAX_DT = 0.05;

/** Radial dead zone and response curve for one stick; writes the result into `out`. */
function stick(x: number, y: number, out: { x: number; y: number }) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) {
    out.x = out.y = 0;
    return;
  }
  const k = Math.min(1, (m - STICK_DEAD) / (STICK_FULL - STICK_DEAD));
  const s = Math.pow(k, STICK_CURVE) / m;
  out.x = x * s;
  out.y = y * s;
}

function trigger(v: number) {
  return v < TRIGGER_DEAD ? 0 : (v - TRIGGER_DEAD) / (1 - TRIGGER_DEAD);
}

/** Fraction of the way to close this frame for an exponential ease at `rate` per second. */
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Safari's trackpad pinch events (not in the DOM typings). */
interface GestureEvent extends UIEvent {
  scale: number;
}

export interface NavHost {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  canvas: HTMLElement;
  mode(): NavMode;
  /** Ground height under a point. */
  groundAt(x: number, z: number): number;
  /** Called the moment input takes over the camera (cancel tweens, focus picks). */
  onTakeOver(): void;
  stepView(dir: 1 | -1): void;
  home(): void;
  toggleFly(): void;
  toggleMeasure(): void;
  /** The material pointer: a mark at the center of the view that reports the material under it. */
  togglePointer(): void;
  /** Hold the pointer's current material (the panel keeps it while the view moves); again to follow the pointer. */
  togglePointLock(): void;
  /** Plant labels on or off, apart from the measurements. */
  togglePlantLabels(): void;
  /** D-pad for the quick tools: left / right pick one, up / down use it; `held` once ↓ has been held QUICK_HOLD_MS. */
  quick(dir: QuickDir, held: boolean): void;
}

export class Navigation {
  private prev: boolean[] = [];
  private index: number | null = null;
  private keys = new Set<string>();
  private look = { x: 0, y: 0 };
  private drag: { id: number; x: number; y: number } | null = null;
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private view = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private want = new THREE.Vector3();
  private step = new THREE.Vector3();
  private sph = new THREE.Spherical();
  private stickL = { x: 0, y: 0 };
  private stickR = { x: 0, y: 0 };
  /** Eased movement velocity (m/s, world) and stick look rates (rad/s). */
  private vel = new THREE.Vector3();
  private lookVel = { yaw: 0, pitch: 0 };
  /** Zoom still to apply: log of the orbit distance or lens factor, or meters along the view in fly mode. */
  private zoomLeft = 0;
  private zoomEase = WHEEL_EASE;
  private lastMode: NavMode | null = null;
  /** Where this class left the camera last frame, to notice when something else (a view tween) moved it. */
  private lastPos = new THREE.Vector3();
  private lastRadius = 0;
  private lastT = -1;
  /** Safari pinch in progress (its own events), and when it ended: ctrl+wheel then is not a second pinch. */
  private gesture = { on: false, scale: 1, endedAt: 0 };
  private touches = new Set<number>();
  /** When D-pad ↓ went down (ms), and whether its long press has fired. */
  private downAt = 0;
  private downHeld = false;
  onConnect: (name: string) => void = () => {};
  onDisconnect: () => void = () => {};

  constructor(private host: NavHost) {
    window.addEventListener('gamepadconnected', (e) => this.attach(e.gamepad));
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        this.onDisconnect();
      }
    });

    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const first = this.host.mode() !== 'orbit';
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'm') { this.host.toggleMeasure(); return; }
      if (k === 'p') { this.host.togglePointer(); return; }
      if (k === 'l') { this.host.togglePointLock(); return; }
      if (k === 'n') { this.host.togglePlantLabels(); return; }
      if (!first) return;
      if (k === 'v') { this.host.toggleFly(); return; }
      if (k === 'Home') { this.host.home(); return; }
      if (['w', 'a', 's', 'd', 'q', 'e', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => this.keys.clear());

    // Drag to look in first person. A click without movement still reaches the scene's tap-to-pick.
    const c = host.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touches.add(e.pointerId);
      if (this.host.mode() === 'orbit') return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.look.x += e.clientX - this.drag.x;
      this.look.y += e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    // Wheel, trackpad scroll and Chrome's trackpad pinch (a wheel event with ctrlKey) in every mode.
    // Caught on the way down, before OrbitControls, whose own zoom jumps a whole step per event.
    window.addEventListener('wheel', (e) => {
      if (e.target !== c) return;
      e.preventDefault();
      e.stopPropagation();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (e.ctrlKey) {
        // Safari reports its pinch as gesture events; never count one pinch twice.
        if (this.gesture.on || performance.now() - this.gesture.endedAt < 250) return;
        // Chrome: the pinch scale since the last event is exp(-deltaY / 100).
        this.pinch(-THREE.MathUtils.clamp(dy, -30, 30) / 100);
        return;
      }
      this.host.onTakeOver();
      const mode = this.host.mode();
      this.zoomEase = WHEEL_EASE;
      // Orbit: farther or nearer (log distance). Walk: the lens. Fly: along the view, in meters.
      if (mode === 'orbit') this.zoomLeft += dy * WHEEL_ZOOM;
      else if (mode === 'walk') this.zoomLeft += dy * WHEEL_ZOOM * 0.8;
      else this.zoomLeft -= dy * 0.01 * this.flySpeed() * 0.12;
    }, { capture: true, passive: false });

    // Safari's trackpad pinch. preventDefault keeps the page itself from zooming.
    c.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      this.gesture.on = true;
      this.gesture.scale = 1;
    }, { passive: false });
    c.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const s = (e as GestureEvent).scale;
      if (!(s > 0)) return;
      const ratio = s / this.gesture.scale;
      this.gesture.scale = s;
      // A touch screen pinch is OrbitControls' own (touch events); only the trackpad's is handled here.
      if (!this.touches.size) this.pinch(Math.log(ratio));
    }, { passive: false });
    c.addEventListener('gestureend', (e) => {
      e.preventDefault();
      this.gesture.on = false;
      this.gesture.endedAt = performance.now();
    }, { passive: false });
  }

  /** Fingers apart by `logScale` (log of the scale change): closer in, or a longer lens in walk mode. */
  private pinch(logScale: number) {
    if (!logScale) return;
    this.host.onTakeOver();
    this.zoomEase = PINCH_EASE;
    const mode = this.host.mode();
    if (mode === 'fly') this.zoomLeft += logScale * this.flySpeed() * 1.5;
    else this.zoomLeft -= logScale;
  }

  /** Fly speed for the current height: faster high up, so the neighborhood is quick to cross but a bed is not overshot. */
  private flySpeed() {
    const cam = this.host.camera;
    return 3 + Math.max(1, cam.position.y - this.host.groundAt(cam.position.x, cam.position.z)) * 0.9;
  }

  /** Seconds since the last frame, from the frame's own timestamp (the same one requestAnimationFrame gets). */
  private frameDt(hostDt: number): number {
    if (!(hostDt > 0)) return 0; // a still frame (export, resize): nothing moves
    const tl = document.timeline?.currentTime;
    const now = typeof tl === 'number' ? tl : performance.now();
    const dt = this.lastT < 0 ? hostDt : (now - this.lastT) / 1000;
    this.lastT = now;
    return dt > 0 ? Math.min(MAX_DT, dt) : 0;
  }

  get controllerConnected() {
    return this.index !== null;
  }

  private attach(pad: Gamepad) {
    if (this.index !== null) return;
    this.index = pad.index;
    this.prev = [];
    this.onConnect(pad.id);
    // A short buzz to say the controller now drives the camera.
    pad.vibrationActuator?.playEffect('dual-rumble', { duration: 120, strongMagnitude: 0.4, weakMagnitude: 0.6 }).catch(() => {});
  }

  private pad(): Gamepad | null {
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      return null; // blocked by the page's permissions policy
    }
    if (this.index !== null) return pads[this.index] ?? null;
    // Some browsers only fire gamepadconnected after a button press; pick up a pad already there.
    for (const x of pads) {
      if (x && x.connected && x.mapping === 'standard') {
        this.attach(x);
        return x;
      }
    }
    return null;
  }

  /** Read every input and move the camera. `hostDt` > 0 for a live frame; the step itself uses the frame timestamp. */
  update(hostDt: number) {
    const dt = this.frameDt(hostDt);
    if (!dt) return;
    const mode = this.host.mode();
    const first = mode !== 'orbit';
    const cam = this.host.camera, target = this.host.target;
    if (mode !== this.lastMode) {
      this.vel.set(0, 0, 0);
      this.lookVel.yaw = this.lookVel.pitch = 0;
      this.zoomLeft = 0;
      this.lastMode = mode;
    }
    // Something else moved the camera since the last frame (a view tween, the mouse orbit).
    const movedElsewhere = cam.position.distanceToSquared(this.lastPos) > 1e-6;

    let mx = 0, mz = 0, lx = 0, ly = 0, zoom = 0, lift = 0, fast = false;
    const pad = this.pad();
    if (pad) {
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const tapped = (i: number) => b(i) && !this.prev[i];
      stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, this.stickL);
      stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, this.stickR);
      mx = this.stickL.x;
      mz = this.stickL.y;
      lx = this.stickR.x * 2.2;
      ly = this.stickR.y * 1.6;
      zoom = trigger(pad.buttons[BTN.RT]?.value ?? 0) - trigger(pad.buttons[BTN.LT]?.value ?? 0);
      lift = (b(BTN.RB) ? 1 : 0) - (b(BTN.LB) ? 1 : 0);
      fast = b(BTN.LS);
      if (tapped(BTN.X)) this.host.toggleMeasure();
      // B: plant labels, on their own switch apart from the measurements.
      if (tapped(BTN.B)) this.host.togglePlantLabels();
      // Y turns the material pointer on and off.
      if (tapped(BTN.Y)) this.host.togglePointer();
      // Pressing the right stick in holds the pointed material; again lets it follow the pointer.
      if (tapped(BTN.RS)) this.host.togglePointLock();
      // Menu (Start) goes home: the first saved view, or back to the start point in first person.
      if (tapped(BTN.MENU)) this.host.home();
      if (first && tapped(BTN.A)) this.host.toggleFly();
      // D-pad, in every mode: the quick tools. ← → pick a tool, ↑ ↓ use it, ↓ held clears.
      if (tapped(BTN.LEFT)) this.host.quick('left', false);
      if (tapped(BTN.RIGHT)) this.host.quick('right', false);
      if (tapped(BTN.UP)) this.host.quick('up', false);
      if (tapped(BTN.DOWN)) {
        this.host.quick('down', false);
        this.downAt = performance.now();
        this.downHeld = false;
      } else if (b(BTN.DOWN) && !this.downHeld && performance.now() - this.downAt >= QUICK_HOLD_MS) {
        this.downHeld = true;
        this.host.quick('down', true);
      }
      for (let i = 0; i < pad.buttons.length; i++) this.prev[i] = pad.buttons[i].pressed;
    }

    // Keyboard and mouse (first person only).
    let mouseYaw = 0, mousePitch = 0;
    if (first) {
      const k = this.keys;
      mx += (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
      mz += (k.has('s') || k.has('ArrowDown') ? 1 : 0) - (k.has('w') || k.has('ArrowUp') ? 1 : 0);
      lift += (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0);
      fast ||= k.has('Shift');
      // Diagonals no faster than straight.
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      // Drag right to look right, drag up to look up. Direct, not eased: it follows the hand.
      mouseYaw = this.look.x * 0.0035;
      mousePitch = this.look.y * 0.0035;
    }
    this.look.x = this.look.y = 0;
    if (mode === 'walk') lift = 0;

    const input = mx || mz || lx || ly || mouseYaw || mousePitch || Math.abs(zoom) > 0.02 || lift;
    if (input) this.host.onTakeOver();
    // With hands off, a camera moved by something else keeps no leftover glide.
    else if (movedElsewhere) this.vel.set(0, 0, 0);

    // Look: turn the target around the camera. Stick rates ease in and out.
    const le = ease(LOOK_EASE, dt);
    this.lookVel.yaw += (lx - this.lookVel.yaw) * le;
    this.lookVel.pitch += (ly - this.lookVel.pitch) * le;
    if (Math.abs(this.lookVel.yaw) < 1e-4 && !lx) this.lookVel.yaw = 0;
    if (Math.abs(this.lookVel.pitch) < 1e-4 && !ly) this.lookVel.pitch = 0;
    const yaw = this.lookVel.yaw * dt + mouseYaw, pitch = this.lookVel.pitch * dt + mousePitch;
    if (yaw || pitch) {
      const look = this.tmp.subVectors(target, cam.position);
      const dist = Math.max(first ? 3 : 2, look.length());
      this.sph.setFromVector3(look);
      this.sph.theta -= yaw;
      this.sph.phi = THREE.MathUtils.clamp(this.sph.phi + pitch, 0.08, Math.PI - 0.08);
      this.sph.radius = dist;
      look.setFromSpherical(this.sph);
      target.copy(cam.position).add(look);
    }

    // Level forward and right from where the camera faces.
    this.fwd.subVectors(target, cam.position);
    this.view.copy(this.fwd).normalize();
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, cam.up).normalize();

    // The velocity the input asks for, then eased toward it: speeds up and coasts to a stop.
    const want = this.want.set(0, 0, 0);
    const ground = this.host.groundAt(cam.position.x, cam.position.z);
    if (mode === 'walk') {
      const speed = 1.6 * (fast ? 3 : 1);
      want.addScaledVector(this.fwd, -mz * speed).addScaledVector(this.right, mx * speed);
      // Triggers zoom the lens while walking.
      if (Math.abs(zoom) > 0.02) {
        cam.fov = THREE.MathUtils.clamp(cam.fov - zoom * 35 * dt, 18, 75);
        cam.updateProjectionMatrix();
      }
    } else {
      const speed = this.flySpeed() * (fast ? 3 : 1);
      want.addScaledVector(this.fwd, -mz * speed)
        .addScaledVector(this.right, mx * speed)
        .addScaledVector(this.view, zoom * speed * 1.2);
      want.y += lift * speed * 0.6;
    }
    const speeding = want.lengthSq() > this.vel.lengthSq();
    this.vel.lerp(want, ease(speeding ? ACCEL : DECEL, dt));
    if (!input && this.vel.lengthSq() < 1e-6) this.vel.set(0, 0, 0);
    const step = this.step.copy(this.vel).multiplyScalar(dt);

    // Wheel and pinch, eased.
    if (this.zoomLeft) {
      const part = Math.abs(this.zoomLeft) < 1e-4 ? this.zoomLeft : this.zoomLeft * ease(this.zoomEase, dt);
      this.zoomLeft -= part;
      if (mode === 'orbit') this.dolly(part);
      else if (mode === 'walk') {
        cam.fov = THREE.MathUtils.clamp(cam.fov * Math.exp(part), 18, 75);
        cam.updateProjectionMatrix();
      } else step.addScaledVector(this.view, part);
    }

    if (mode === 'walk') {
      // Follow the ground at eye height (eases down after flying).
      step.y = (ground + EYE_HEIGHT - cam.position.y) * ease(6, dt);
    } else {
      // Never below eye height in fly mode; never above the sky the scene is built for.
      if (mode === 'fly' && cam.position.y + step.y < ground + EYE_HEIGHT) {
        step.y = ground + EYE_HEIGHT - cam.position.y;
        if (this.vel.y < 0) this.vel.y = 0;
      }
      if (cam.position.y + step.y > 220) {
        step.y = Math.min(0, step.y);
        if (this.vel.y > 0) this.vel.y = 0;
      }
    }
    if (step.lengthSq() > 0) {
      cam.position.add(step);
      target.add(step);
    }
    this.lastPos.copy(cam.position);
  }

  /** Orbit: move the camera nearer (negative) or farther along its line to the target, by a log factor. */
  private dolly(logFactor: number) {
    const cam = this.host.camera, target = this.host.target;
    const off = this.tmp.subVectors(cam.position, target);
    const r = off.length();
    if (r < 1e-6) return;
    // A view tween or a jump moved the camera since the last step: forget the rest of the zoom.
    if (this.lastRadius && Math.abs(r - this.lastRadius) > r * 0.02) {
      this.zoomLeft = 0;
      this.lastRadius = 0;
      return;
    }
    const next = THREE.MathUtils.clamp(r * Math.exp(logFactor), ORBIT_MIN, ORBIT_MAX);
    if (next === ORBIT_MIN || next === ORBIT_MAX) this.zoomLeft = 0;
    off.multiplyScalar(next / r);
    cam.position.copy(target).add(off);
    this.lastRadius = this.zoomLeft ? next : 0;
  }

  /** Short rumble, for a bump such as switching views or modes. */
  pulse(ms = 60, strength = 0.35) {
    const pad = this.index !== null ? navigator.getGamepads?.()[this.index] : null;
    pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
  }
}
