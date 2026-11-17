import * as THREE from 'three';

/**
 * Keeps the live view smooth on slower GPUs without changing the still picture.
 *
 * - Motion: whether the camera is moving, from how many pixels a second the view slides (turning, walking, zooming),
 *   with a dead band so a slow glide at the end of a drag does not flip it back and forth.
 * - Depth of field fades out while the camera moves (its pass is skipped once faded) and back in once it settles.
 * - Render scale: while the camera moves, the scene is drawn at a lower resolution (each axis 0.6 to 1 of the full
 *   size) chosen from the GPU's own time per frame (the shared timer in gputimer.ts) or, without that, from the
 *   frame interval. The moving scale changes in small steps, only from frames drawn while moving, with a band
 *   between stepping down and up, so it settles. Once the camera stops, the scale eases back to full size, so a
 *   still view is always drawn at full resolution; it never changes while the view is still.
 */

/**
 * GPU time per frame the moving scale aims for, and the band around it (milliseconds): above GPU_HIGH it steps
 * down toward GPU_TARGET; below GPU_LOW it tries one step up (a step adds about a millisecond at most), and goes
 * back, and stops trying for a while, if that was too much. Part of a frame does not shrink with the scale (the
 * plants' and ground's vertices), so the band is narrow and stepping up is tried, not predicted.
 */
const GPU_TARGET = 9.5;
const GPU_HIGH = 11.5;
const GPU_LOW = 9.2;
/** Without the GPU timer: frame intervals (milliseconds) that count as too slow and as smooth. */
const FRAME_SLOW = 21;
const FRAME_SMOOTH = 17.6;
export const MIN_SCALE = 0.6;
/** The view counts as moving above this many pixels a second, and as settled below SETTLE_PX for SETTLE_S. */
const MOVE_PX = 60;
const SETTLE_PX = 20;
const SETTLE_S = 0.15;

export class FrameBudget {
  /** Render scale for this frame (each axis). */
  scale = 1;
  /** Render scale used while the camera moves (learned). */
  moveScale = 1;
  /** Depth of field shown, 0 to 1. */
  dof = 1;
  moving = false;
  /** Smoothed GPU time of moving frames at the moving scale (ms), 0 until measured. */
  gpuMs = 0;
  /** Latest GPU time of any frame (ms). */
  lastGpuMs = 0;
  /** Smoothed frame interval of moving frames (ms). */
  frameMs = 0;
  /** Adaptive scale on (off at the Max setting, where the full picture is wanted even in motion). */
  adaptive = true;
  /** When set to an array, each measured GPU frame time is pushed onto it (tests). */
  log: { ms: number; scale: number; moving: boolean }[] | null = null;
  /** The moving scale changed (from, to), for the diagnostics log. */
  onChange: (from: number, to: number, why: string) => void = () => {};

  /** GPU frame times arrive through gpuFrame() (gputimer.ts); without them the frame interval is used. */
  timed = false;
  /** Smoothed main-thread time of drawing a live frame (ms), from cpuFrame(). */
  cpuMs = 0;
  private samples = 0;
  private upAt = -1e9;
  private upBlockedUntil = 0;
  private stillFor = 0;
  private fastFrames = 0;
  private prevEye = new THREE.Vector3();
  private prevDir = new THREE.Vector3();
  private prevFov = 0;
  private dir = new THREE.Vector3();
  private hasPrev = false;

  /** Still moving, or easing back to the full still picture: keep drawing. */
  get settling() {
    return this.moving || this.scale < 1 || this.dof < 1;
  }

  /**
   * One timed frame's GPU time (ms) and what it was drawn with (from the shared GPU timer, a frame or two late).
   * Only moving frames drawn at the current moving scale say how that scale performs.
   */
  gpuFrame(ms: number, scale: number, moving: boolean) {
    this.lastGpuMs = ms;
    this.log?.push({ ms, scale, moving });
    if (this.log && this.log.length > 2000) this.log.splice(0, 1000);
    if (moving && Math.abs(scale - this.moveScale) < 0.005) this.sample(ms);
  }

  /** Main-thread time Studio spent drawing the last live frame (ms). */
  cpuFrame(ms: number) {
    this.cpuMs = this.cpuMs ? this.cpuMs + (ms - this.cpuMs) * 0.1 : ms;
  }

  /** Recent GPU times of moving frames at the moving scale; decisions use their median, so a one-off spike (a texture upload, a shadow redraw) does not count. */
  private win: number[] = [];

  private sample(ms: number) {
    this.win.push(ms);
    if (this.win.length > 30) this.win.shift();
    const sorted = this.win.slice().sort((a, b) => a - b);
    this.gpuMs = sorted[sorted.length >> 1];
    this.samples = this.win.length;
  }

  private setMove(next: number, why: string, now: number) {
    next = Math.round(THREE.MathUtils.clamp(next, MIN_SCALE, 1) * 20) / 20;
    if (next === this.moveScale) return;
    const from = this.moveScale;
    // Stepping down soon after stepping up: that step was too far; don't try it again for a while.
    if (next < from && now - this.upAt < 2500) this.upBlockedUntil = now + 20000;
    if (next > from) this.upAt = now;
    this.moveScale = next;
    this.samples = 0;
    this.win.length = 0;
    this.gpuMs = 0;
    this.frameMs = 0;
    this.onChange(from, next, why);
  }

  /**
   * Once per drawn live frame, before drawing: the camera's motion since the last frame, `dt` seconds ago, in a view
   * `viewPx` device pixels tall, `focus` meters to what the eye is on.
   */
  update(cam: THREE.PerspectiveCamera, dt: number, viewPx: number, focus: number, now: number) {
    cam.getWorldDirection(this.dir);
    const eye = cam.position;
    let px = 0;
    if (this.hasPrev && dt > 0) {
      const pxPerRad = viewPx / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      const turn = this.dir.angleTo(this.prevDir);
      const slide = eye.distanceTo(this.prevEye) / Math.max(1, focus);
      const zoom = Math.abs(THREE.MathUtils.degToRad(cam.fov - this.prevFov));
      px = ((turn + slide + zoom) * pxPerRad) / dt;
    }
    this.prevEye.copy(eye);
    this.prevDir.copy(this.dir);
    this.prevFov = cam.fov;
    this.hasPrev = true;
    if (dt <= 0) return;

    // Moving takes two frames in a row: a cut to a saved view (one frame) is not motion.
    if (px > MOVE_PX) {
      if (this.fastFrames++ >= 1) this.moving = true;
      this.stillFor = 0;
    } else if (px < SETTLE_PX) {
      this.fastFrames = 0;
      this.stillFor += dt;
      if (this.stillFor >= SETTLE_S) this.moving = false;
    }

    // Depth of field: out quickly as motion starts, back in over about 0.4 s once settled.
    this.dof = this.moving ? Math.max(0, this.dof - dt * 6) : Math.min(1, this.dof + dt * 2.5);

    // Learn the moving scale from moving frames only.
    if (this.moving && this.adaptive) {
      if (!this.timed) {
        // Frame interval while drawing every frame (a hidden or throttled page gives nothing useful above 50 ms).
        const ms = dt * 1000;
        if (ms < 50 && Math.abs(this.scale - this.moveScale) < 0.005) {
          this.frameMs = this.samples ? this.frameMs + (ms - this.frameMs) * 0.1 : ms;
          this.samples++;
        }
        // Slow frames are blamed on the GPU (and the scale lowered) only when the page's own work per frame is well
        // under the frame interval; frames slow because of work on the main thread would not get faster.
        const gpuBound = this.cpuMs > 0 && this.cpuMs < this.frameMs * 0.6;
        if (this.samples >= 15 && this.frameMs > FRAME_SLOW && gpuBound) this.setMove(this.moveScale - 0.1, `${this.frameMs.toFixed(1)} ms frames, ${this.cpuMs.toFixed(1)} ms of script`, now);
        else if (this.samples >= 120 && this.frameMs < FRAME_SMOOTH && this.moveScale < 1 && now > this.upBlockedUntil) this.setMove(this.moveScale + 0.05, 'smooth', now);
      } else if (this.samples >= 10 && this.gpuMs > GPU_HIGH) {
        // Most of the frame scales with the pixel count; step at most 0.15 at a time.
        const ideal = this.moveScale * Math.sqrt(GPU_TARGET / this.gpuMs);
        this.setMove(Math.max(this.moveScale - 0.15, Math.min(this.moveScale - 0.05, ideal)), `GPU ${this.gpuMs.toFixed(1)} ms`, now);
      } else if (this.samples >= 30 && this.gpuMs < GPU_LOW && this.moveScale < 1 && now > this.upBlockedUntil) {
        // Thirty frames (half a second of motion) at this scale with room to spare.
        this.setMove(this.moveScale + 0.05, `GPU ${this.gpuMs.toFixed(1)} ms`, now);
      }
    }
    if (!this.adaptive && this.moveScale !== 1) this.setMove(1, 'adaptive off', now);

    // The scale used: the moving scale while moving (eased down over about 0.1 s), full size once still.
    const goal = this.moving && this.adaptive ? this.moveScale : 1;
    if (this.scale > goal) this.scale = Math.max(goal, this.scale - dt * 3);
    else if (this.scale < goal) this.scale = Math.min(goal, this.scale + dt * (this.moving ? 1 : 1.6));
    // Snap the last bit, so the moving scale is hit exactly and its samples count.
    if (Math.abs(this.scale - goal) < 0.01) this.scale = goal;
  }

  /** One line for the diagnostics readout. */
  describe(): string {
    const gpu = this.timed ? `GPU ${this.lastGpuMs.toFixed(1)} ms` : 'GPU timer n/a';
    return `render scale ${this.scale.toFixed(2)} (moving ${this.moveScale.toFixed(2)}${this.adaptive ? '' : ', fixed'})  ${this.moving ? 'moving' : 'still'}  ${gpu}  depth of field ${this.dof.toFixed(2)}`;
  }
}
