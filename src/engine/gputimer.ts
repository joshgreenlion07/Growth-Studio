/**
 * GPU time of each drawn frame, for the diagnostics readout only (it does nothing unless started). Uses the WebGL2
 * timer query extension where the browser offers it; results arrive a frame or more later and are collected then.
 * A frame whose GPU work takes longer than two display frames at 60 Hz (33 ms) is counted as long: it is the kind of
 * frame a busy GPU or compositor can drop or show late.
 */
interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export const LONG_GPU_MS = 33;

export class GpuFrameTimer {
  private ext: TimerExt | null;
  private pending: WebGLQuery[] = [];
  private spare: WebGLQuery[] = [];
  private open: WebGLQuery | null = null;
  /** Frames timed and frames over LONG_GPU_MS since the last take(), and the longest. */
  timed = 0;
  long = 0;
  worst = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  get available() {
    return !!this.ext;
  }

  begin() {
    if (!this.ext || this.open || this.pending.length > 6) return;
    const q = this.spare.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
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
    const gl = this.gl;
    // A disjoint event (GPU clock change, another app taking the GPU) makes the results in flight meaningless.
    const disjoint = gl.getParameter(this.ext!.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      this.pending.shift();
      this.spare.push(q);
      if (disjoint) continue;
      const ms = ns / 1e6;
      this.timed++;
      if (ms > LONG_GPU_MS) this.long++;
      this.worst = Math.max(this.worst, ms);
    }
  }

  /** The counts since the last call, then start again. */
  take() {
    const r = { timed: this.timed, long: this.long, worst: this.worst };
    this.timed = this.long = 0;
    this.worst = 0;
    return r;
  }

  dispose() {
    for (const q of [...this.pending, ...this.spare]) this.gl.deleteQuery(q);
    if (this.open) this.gl.deleteQuery(this.open);
    this.pending = [];
    this.spare = [];
    this.open = null;
  }
}
