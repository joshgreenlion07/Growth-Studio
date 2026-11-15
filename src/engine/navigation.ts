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
 * Controller                     Keyboard (walk / fly)
 *   Left stick   move              W A S D or arrows
 *   Right stick  look              drag with the mouse
 *   RT / LT      walk: zoom lens   wheel
 *                fly/orbit: fly in / out along the view
 *   RB / LB      rise / sink       E / Q (fly)
 *   Hold LS      faster            Shift
 *   A            walk / fly        V
 *   X            measurements      M
 *   Y            back to start     Home
 *   D-pad ← →    saved views (orbit only)
 *
 * The camera and its look-at target move together, so OrbitControls carries
 * on from wherever the camera was left.
 */

export type NavMode = 'orbit' | 'walk' | 'fly';
/** Eye height for walking, meters (about 5 ft 5 in). */
export const EYE_HEIGHT = 1.65;

const DEAD = 0.15;
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/** Stick value with a dead zone, rescaled so it still reaches 1. Squared for fine control near the middle. */
function axis(v: number): number {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  const k = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * k * k;
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
}

export class Navigation {
  private prev: boolean[] = [];
  private index: number | null = null;
  private keys = new Set<string>();
  private look = { x: 0, y: 0 };
  private wheel = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private sph = new THREE.Spherical();
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
    const end = (e: PointerEvent) => { if (this.drag && e.pointerId === this.drag.id) this.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      if (this.host.mode() === 'orbit') return;
      e.preventDefault();
      this.wheel += e.deltaY;
    }, { passive: false });
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
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return null; // blocked by the page's permissions policy
    }
    if (this.index !== null) return pads[this.index] ?? null;
    // Some browsers only fire gamepadconnected after a button press; pick up a pad already there.
    const p = pads.find((x) => x && x.connected && x.mapping === 'standard') ?? null;
    if (p) this.attach(p);
    return p;
  }

  /** Read every input and move the camera. dt in seconds. */
  update(dt: number) {
    const mode = this.host.mode();
    const first = mode !== 'orbit';
    let mx = 0, mz = 0, lx = 0, ly = 0, zoom = 0, lift = 0, fast = false;

    const pad = this.pad();
    if (pad) {
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const val = (i: number) => pad.buttons[i]?.value ?? 0;
      const tapped = (i: number) => b(i) && !this.prev[i];
      mx = axis(pad.axes[0] ?? 0);
      mz = axis(pad.axes[1] ?? 0);
      lx = axis(pad.axes[2] ?? 0) * 2.2;
      ly = axis(pad.axes[3] ?? 0) * 1.6;
      zoom = val(BTN.RT) - val(BTN.LT);
      lift = (b(BTN.RB) ? 1 : 0) - (b(BTN.LB) ? 1 : 0);
      fast = b(BTN.LS);
      if (tapped(BTN.X)) this.host.toggleMeasure();
      if (first) {
        if (tapped(BTN.A)) this.host.toggleFly();
        if (tapped(BTN.Y)) this.host.home();
      } else {
        if (tapped(BTN.RIGHT)) this.host.stepView(1);
        if (tapped(BTN.LEFT)) this.host.stepView(-1);
        if (tapped(BTN.Y)) this.host.home();
      }
      this.prev = pad.buttons.map((x) => x.pressed);
    }

    // Keyboard and mouse (first person only).
    let mouseYaw = 0, mousePitch = 0;
    if (first) {
      const k = this.keys;
      mx += (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
      mz += (k.has('s') || k.has('ArrowDown') ? 1 : 0) - (k.has('w') || k.has('ArrowUp') ? 1 : 0);
      lift += (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0);
      fast ||= k.has('Shift');
      mx = THREE.MathUtils.clamp(mx, -1, 1);
      mz = THREE.MathUtils.clamp(mz, -1, 1);
      // Drag right to look right, drag up to look up.
      mouseYaw = this.look.x * 0.0035;
      mousePitch = this.look.y * 0.0035;
      zoom -= this.wheel * 0.01;
    }
    this.look.x = this.look.y = 0;
    this.wheel = 0;

    const cam = this.host.camera, target = this.host.target;
    const ground = this.host.groundAt(cam.position.x, cam.position.z);
    const moving = mx || mz || lx || ly || mouseYaw || mousePitch || Math.abs(zoom) > 0.02 || (lift && mode !== 'walk');
    if (moving) this.host.onTakeOver();

    // Look: turn the target around the camera.
    const yaw = lx * dt + mouseYaw, pitch = ly * dt + mousePitch;
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
    const view = this.fwd.clone().normalize();
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, cam.up).normalize();

    const step = new THREE.Vector3();
    if (mode === 'walk') {
      const speed = 1.6 * (fast ? 3 : 1);
      step.addScaledVector(this.fwd, -mz * speed * dt).addScaledVector(this.right, mx * speed * dt);
      // Triggers and the wheel zoom the lens while walking.
      if (Math.abs(zoom) > 0.02) {
        cam.fov = THREE.MathUtils.clamp(cam.fov - zoom * 35 * dt, 18, 75);
        cam.updateProjectionMatrix();
      }
      // Follow the ground at eye height (eases down after flying).
      const want = ground + EYE_HEIGHT;
      step.y = (want - cam.position.y) * Math.min(1, dt * 6);
    } else {
      const height = Math.max(1, cam.position.y - ground);
      // Faster when high up, so the neighborhood is quick to cross but a planting bed is not overshot.
      const speed = (3 + height * 0.9) * (fast ? 3 : 1);
      step.addScaledVector(this.fwd, -mz * speed * dt)
        .addScaledVector(this.right, mx * speed * dt)
        .addScaledVector(view, zoom * speed * 1.2 * dt);
      step.y += lift * speed * 0.6 * dt;
      // Never below eye height in fly mode; never above the sky the scene is built for.
      if (mode === 'fly' && cam.position.y + step.y < ground + EYE_HEIGHT) step.y = ground + EYE_HEIGHT - cam.position.y;
      if (cam.position.y + step.y > 220) step.y = Math.min(0, step.y);
    }
    if (step.lengthSq() > 0) {
      cam.position.add(step);
      target.add(step);
    }
  }

  /** Short rumble, for a bump such as switching views or modes. */
  pulse(ms = 60, strength = 0.35) {
    const pad = this.index !== null ? navigator.getGamepads?.()[this.index] : null;
    pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
  }
}
