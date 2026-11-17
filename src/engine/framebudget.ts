import * as THREE from 'three';

/**
 * Keeps the live view smooth on slower GPUs without changing the still picture.
 *
 * - Motion: whether the camera is moving, from how many pixels a second the view slides (turning, walking, zooming),
 *   with a dead band so a slow glide at the end of a drag does not flip it back and forth.
 * - Depth of field fades out while the camera moves (its pass is skipped once faded) and back in once it settles.
 * - Render scale: while the camera moves, the scene is drawn at a lower resolution (each axis 0.6 to 1 of the full
 *   size) chosen from the GPU's own time per frame (EXT_disjoint_timer_query_webgl2) or, without that, from the
 *   frame interval. The moving scale changes in small steps, only from frames drawn while moving, with a band
 *   between stepping down and up, so it settles. Once the camera stops, the scale eases back to full size, so a
 *   still view is always drawn at full resolution; it never changes while the view is still.
 */

/** GPU time per frame the moving scale aims for, and the band around it (milliseconds). */
const GPU_TARGET = 11;
const GPU_HIGH = 13;
const GPU_LOW = 8;
/** Without the GPU timer: frame intervals (milliseconds) that count as too slow and as smooth. */
const FRAME_SLOW = 21;
const FRAME_SMOOTH = 17.6;
export const MIN_SCALE = 0.6;
/** The view counts as moving above this many pixels a second, and as settled below SETTLE_PX for SETTLE_S. */
const MOVE_PX = 60;
const SETTLE_PX = 20;
const SETTLE_S = 0.15;

interface PendingQuery {
  q: WebGLQuery;
  scale: number;
  moving: boolean;
}

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

  private gl: WebGL2RenderingContext | null;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private pending: PendingQuery[] = [];
  private active: PendingQuery | null = null;
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

  constructor(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    try {
      this.ext = (this.gl?.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.ext) ?? null;
    } catch {
      this.ext = null;
    }
  }

  /** Still moving, or easing back to the full still picture: keep drawing. */
  get settling() {
    return this.moving || this.scale < 1 || this.dof < 1;
  }

  get timed() {
    return !!this.ext;
  }

  /** Start timing the GPU work of one live frame. */
  begin() {
    this.collect();
    // While the GPU is several frames behind, time fewer frames rather than drop answers that are on their way.
    if (!this.ext || !this.gl || this.active || this.pending.length >= 6) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = { q, scale: this.scale, moving: this.moving };
  }

  end() {
    if (!this.ext || !this.gl || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    // A stalled driver never answers: do not let queries pile up.
    while (this.pending.length > 12) this.gl.deleteQuery(this.pending.shift()!.q);
  }

  /** Results of earlier frames that are ready (a frame or two later). */
  private collect(): void {
    const gl = this.gl, ext = this.ext;
    if (!gl || !ext) return;
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(p.q);
      if (disjoint || !(ms > 0)) continue;
      this.lastGpuMs = ms;
      this.log?.push({ ms, scale: p.scale, moving: p.moving });
      if (this.log && this.log.length > 2000) this.log.splice(0, 1000);
      // Only moving frames drawn at the current moving scale say how that scale performs.
      if (p.moving && Math.abs(p.scale - this.moveScale) < 0.005) this.sample(ms);
    }
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
    this.collect();
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
      if (!this.ext) {
        // Frame interval while drawing every frame (a hidden or throttled page gives nothing useful above 50 ms).
        const ms = dt * 1000;
        if (ms < 50 && Math.abs(this.scale - this.moveScale) < 0.005) {
          this.frameMs = this.samples ? this.frameMs + (ms - this.frameMs) * 0.1 : ms;
          this.samples++;
        }
        if (this.samples >= 15 && this.frameMs > FRAME_SLOW) this.setMove(this.moveScale - 0.1, `${this.frameMs.toFixed(1)} ms frames`, now);
        else if (this.samples >= 120 && this.frameMs < FRAME_SMOOTH && this.moveScale < 1 && now > this.upBlockedUntil) this.setMove(this.moveScale + 0.05, 'smooth', now);
      } else if (this.samples >= 10 && this.gpuMs > GPU_HIGH) {
        // Most of the frame scales with the pixel count; step at most 0.15 at a time.
        const ideal = this.moveScale * Math.sqrt(GPU_TARGET / this.gpuMs);
        this.setMove(Math.max(this.moveScale - 0.15, Math.min(this.moveScale - 0.05, ideal)), `GPU ${this.gpuMs.toFixed(1)} ms`, now);
      } else if (this.samples >= 30 && this.gpuMs < GPU_LOW && this.moveScale < 1 && now > this.upBlockedUntil) {
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
    const gpu = this.ext ? `GPU ${this.lastGpuMs.toFixed(1)} ms` : 'GPU timer n/a';
    return `render scale ${this.scale.toFixed(2)} (moving ${this.moveScale.toFixed(2)}${this.adaptive ? '' : ', fixed'})  ${this.moving ? 'moving' : 'still'}  ${gpu}  depth of field ${this.dof.toFixed(2)}`;
  }

  /** After a lost and restored WebGL context: queries from before are gone. */
  reset() {
    this.pending = [];
    this.active = null;
  }

  dispose() {
    if (this.gl) for (const p of this.pending) this.gl.deleteQuery(p.q);
    this.pending = [];
  }
}
