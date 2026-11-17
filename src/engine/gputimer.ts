/**
 * GPU time of each drawn live frame, from the WebGL2 timer query extension where the browser offers it. Results arrive
 * a frame or more later and are collected then. One timer serves two readers: the adaptive render scale
 * (framebudget.ts, through `onFrame`, with what the frame was drawn at) and the diagnostics readout (`take`).
 * A frame whose GPU work takes longer than two display frames at 60 Hz (33 ms) is counted as long: it is the kind of
 * frame a busy GPU or compositor can drop or show late.
 */
interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export const LONG_GPU_MS = 33;

/** What a timed frame was drawn with, handed back with its time. */
export interface FrameTag {
  scale: number;
  moving: boolean;
}

export class GpuFrameTimer {
  private ext: TimerExt | null = null;
  private pending: { q: WebGLQuery; tag: FrameTag }[] = [];
  private spare: WebGLQuery[] = [];
  private open: { q: WebGLQuery; tag: FrameTag } | null = null;
  /** Frames timed and frames over LONG_GPU_MS since the last take(), and the longest. */
  timed = 0;
  long = 0;
  worst = 0;
  /** The latest frame's GPU time (ms). */
  last = 0;
  /** Each timed frame's GPU time (ms) with its tag, as it arrives. */
  onFrame: (ms: number, tag: FrameTag) => void = () => {};

  constructor(private gl: WebGL2RenderingContext) {
    try {
      this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    } catch {
      this.ext = null;
    }
  }

  get available() {
    return !!this.ext;
  }

  /** Start timing a frame. While the GPU is several frames behind, fewer frames are timed (none are dropped). */
  begin(tag: FrameTag) {
    this.collect();
    if (!this.ext || this.open || this.pending.length > 6) return;
    const q = this.spare.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = { q, tag: { ...tag } };
  }

  end() {
    if (!this.ext) return;
    if (this.open) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.open);
      this.open = null;
    }
    this.collect();
  }

  private collect() {
    if (!this.ext) return;
    const gl = this.gl;
    // A disjoint event (GPU clock change, another app taking the GPU) makes the results in flight meaningless.
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number;
      this.pending.shift();
      this.spare.push(p.q);
      if (disjoint || !(ns > 0)) continue;
      const ms = ns / 1e6;
      this.last = ms;
      this.timed++;
      if (ms > LONG_GPU_MS) this.long++;
      this.worst = Math.max(this.worst, ms);
      this.onFrame(ms, p.tag);
    }
  }

  /** The counts since the last call, then start again. */
  take() {
    const r = { timed: this.timed, long: this.long, worst: this.worst };
    this.timed = this.long = 0;
    this.worst = 0;
    return r;
  }

  /** After a lost and restored WebGL context: queries from before are gone (not deleted, they no longer exist). */
  reset() {
    this.pending = [];
    this.spare = [];
    this.open = null;
  }

  dispose() {
    for (const p of this.pending) this.gl.deleteQuery(p.q);
    for (const q of this.spare) this.gl.deleteQuery(q);
    if (this.open) this.gl.deleteQuery(this.open.q);
    this.reset();
  }
}
