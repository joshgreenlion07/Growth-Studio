import * as THREE from 'three';
import type { SitePlan, Vec2 } from '../siteplan/types';
import type { SceneBuild } from '../builder/build';
import type { BuildStage } from '../builder/construction';

/**
 * Sound for the 3D scenes (Web Audio; the clips are ElevenLabs sound effects, see README "Sound").
 *
 * - Ambience: a daytime backyard loop and a night (crickets) loop, crossfaded with the sky's darkness, so the
 *   Afternoon / Golden hour / Blue hour / Night looks and the time slider all change what you hear.
 * - Positional loops at the yard's own water (ponds, streams, falls, fountains, water walls), fire (lit fires only)
 *   and spa jets (while on). Every source has a distance gain computed here (so it is easy to inspect) and a plain
 *   stereo pan from a PannerNode. Only the few nearest of each kind ever sound (`KINDS[k].max`), the rest cost nothing;
 *   voices fade in and out as the listener moves or a switch changes.
 * - Water switched by hand plays a start or stop one-shot at the water; the loop fades in after the start.
 * - Silent before the Finished build stage, when the tab is hidden, when the planner pauses the view, and until the
 *   first click or key (browsers do not allow sound before that).
 * Per frame it only moves the listener and nudges at most a handful of gains and pans; the nearest-source choice runs
 * about seven times a second.
 */

export type SoundKind = 'trickle' | 'waterfall' | 'fire' | 'spa';

interface KindSpec {
  file: string;
  /** Voices at once (the nearest ones). */
  max: number;
  /** Full level inside this distance (m); it falls as (ref / d) ^ rolloff beyond it. */
  ref: number;
  rolloff: number;
  /** Silent beyond this distance (m). */
  range: number;
  gain: number;
}

const KINDS: Record<SoundKind, KindSpec> = {
  trickle: { file: 'trickle', max: 3, ref: 1.5, rolloff: 1.4, range: 15, gain: 0.5 },
  waterfall: { file: 'waterfall', max: 2, ref: 3, rolloff: 1.2, range: 28, gain: 0.65 },
  fire: { file: 'fire', max: 2, ref: 1.5, rolloff: 1.5, range: 11, gain: 0.6 },
  spa: { file: 'spa', max: 1, ref: 2, rolloff: 1.4, range: 13, gain: 0.5 },
};
const KIND_LIST = Object.keys(KINDS) as SoundKind[];
const AMBIENCE = { day: 0.34, night: 0.3 };
const ONE_SHOT_GAIN = 0.8;
/** Seconds the start sound leads the loop's fade-in. */
const START_LEAD = 1.1;
/** The loop's own end is blended into its start over this long (s), so it never clicks. */
const LOOP_BLEND = 0.35;
const SELECT_EVERY = 0.14;
const PREF_KEY = 'gs-sound';
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;
const LOOPS = ['day', 'night', 'trickle', 'waterfall', 'fire', 'spa'];
const ONE_SHOTS = ['water-on', 'water-off'];

/** Set an audio parameter, ignoring anything that is not a finite number. */
function setParam(p: AudioParam, v: number) {
  if (Number.isFinite(v)) p.value = v;
}

/** Place a panner (older Safari has only setPosition). */
function setPanner(p: PannerNode, x: number, y: number, z: number) {
  if (!Number.isFinite(x + y + z)) return;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
}

interface Emitter {
  id: string;
  kind: SoundKind;
  /** 0..1, how loud this one is next to the others (a pond is quieter than a water wall). */
  level: number;
  /** A fixed point, or a path the nearest point of which is the sound (a stream, a pond's edge). */
  pos?: THREE.Vector3;
  path?: { pts: Vec2[]; closed: boolean; y: number };
  gate: () => boolean;
  /** Hold the loop back until this time (audio clock) after it was switched on by hand. */
  holdUntil: number;
}

interface Voice {
  emitter: Emitter;
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: PannerNode;
  /** Current and wanted gain (0..1 of the master). */
  g: number;
  want: number;
  /** Set when it is being dropped: fades to nothing, then is released. */
  retiring: boolean;
}

interface Prefs {
  on: boolean;
  volume: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance gain of a source of `kind` at `d` meters. */
export function distanceGain(kind: SoundKind, d: number): number {
  const k = KINDS[kind];
  if (d >= k.range) return 0;
  return Math.pow(k.ref / Math.max(d, k.ref), k.rolloff) * (1 - smooth(k.range * 0.55, k.range, d));
}

/** The point of a path nearest (x, z), written to `out` (x and z), and its distance on the ground. */
function nearestOnPath(path: { pts: Vec2[]; closed: boolean }, x: number, z: number, out: THREE.Vector3): number {
  const { pts, closed } = path;
  let best = Infinity, bx = x, bz = z;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    const px = a[0] + u * dx, pz = a[1] + u * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bx = px; bz = pz; }
  }
  out.set(bx, 0, bz);
  return isFinite(best) ? best : 0;
}

function inside(poly: Vec2[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export class SceneAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private prefs: Prefs = { on: true, volume: 0.6 };
  /** A first click or key has happened. */
  private unlocked = false;
  private paused = false;
  private disposed = false;

  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private failed = false;

  private day: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private night: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private dayG = 0;
  private nightG = 0;
  private dayWant = 0;
  private nightWant = 0;

  private emitters: Emitter[] = [];
  private voices = new Map<string, Voice>();
  private stage: BuildStage = 'finished';
  private sinceSelect = 1;
  private oneShots = new Set<AudioBufferSourceNode>();

  private readonly v = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private lx = 0;
  private ly = 0;
  private lz = 0;
  private night01 = 0;
  private lastT = 0;

  /** Called whenever on/off or volume change (the UI listens). */
  onChange: () => void = () => {};

  constructor() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs>;
        if (typeof p.on === 'boolean') this.prefs.on = p.on;
        if (typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1) this.prefs.volume = p.volume;
      }
    } catch {
      /* no storage: the defaults */
    }
    if (typeof window === 'undefined' || !(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)) {
      this.failed = true;
      return;
    }
    // Browsers allow sound only after a gesture: the first click, key or touch starts it.
    // Only these end a real activation (a touch pointerdown does not on iOS or Android).
    for (const t of GESTURES) window.addEventListener(t, this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                             */

  get on(): boolean {
    return this.prefs.on;
  }

  get volume(): number {
    return this.prefs.volume;
  }

  get available(): boolean {
    return !this.failed;
  }

  setOn(on: boolean) {
    this.prefs.on = on;
    this.save();
    // The button press is itself a gesture.
    if (on) this.unlock();
    this.apply();
    this.onChange();
  }

  setVolume(v: number) {
    this.prefs.volume = Math.min(1, Math.max(0, v));
    this.save();
    this.apply();
    this.onChange();
  }

  /** The planner hides the 3D tab (`pause`) or shows it again (`resume`). */
  setPaused(p: boolean) {
    this.paused = p;
    this.apply();
  }

  private save() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(this.prefs));
    } catch {
      /* not kept */
    }
  }

  private readonly onGesture = () => {
    if (this.unlocked) return;
    this.unlock();
  };

  private stopListening() {
    for (const t of GESTURES) window.removeEventListener(t, this.onGesture, true);
  }

  private readonly onVisibility = () => this.apply();

  /**
   * Called inside a real activation: make the context (once) and try to start it. It counts as unlocked, and the
   * gesture listeners go, only once it is really running; until then every activation tries again.
   */
  private unlock() {
    if (this.failed || this.disposed) return;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'playback' });
      } catch {
        this.failed = true;
        return;
      }
      this.master = this.ctx.createGain();
      setParam(this.master.gain, this.masterLevel());
      this.master.connect(this.ctx.destination);
      // Every clip now, so the first switch of water already has its sounds.
      for (const n of LOOPS) void this.load(n, true);
      for (const n of ONE_SHOTS) void this.load(n, false);
    }
    const ctx = this.ctx;
    if (!this.prefs.on) return;
    void ctx.resume().then(() => {
      if (ctx.state === 'running' && !this.unlocked) {
        this.unlocked = true;
        this.stopListening();
      }
      this.apply();
    }, () => {});
  }

  private masterLevel(): number {
    return this.prefs.volume * this.prefs.volume;
  }

  /** Whether sound should be running now. */
  private wantRunning(): boolean {
    return this.prefs.on && !this.paused && !document.hidden && this.ctx !== null;
  }

  private apply() {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (this.master) setParam(this.master.gain, this.masterLevel());
    if (this.wantRunning()) {
      if (ctx.state !== 'running' && this.unlocked) void ctx.resume().catch(() => {});
      this.sinceSelect = 1;
    } else if (ctx.state === 'running') void ctx.suspend().catch(() => {});
  }

  /* ------------------------------------------------------------------ */
  /* The yard                                                             */

  /** A new yard was built and put on screen: find what sounds in it. */
  setBuild(plan: SitePlan, build: SceneBuild, stage: BuildStage) {
    this.stage = stage;
    const old = this.emitters;
    this.emitters = [];
    const finished = () => this.stage === 'finished';
    const groundAt = (x: number, z: number) => {
      try {
        return build.gm.height([x, z]);
      } catch {
        return 0;
      }
    };
    // Ponds, streams, pondless runs and fountains. Pools are quiet.
    for (const w of plan.water) {
      let pts: Vec2[] | undefined, closed = false, kind: SoundKind = 'trickle', level = 1;
      if (w.kind === 'stream' || w.kind === 'pondless') {
        pts = w.points;
        if ((w.falls ?? 0) >= 2) kind = 'waterfall';
      } else if (w.kind === 'pond' || w.kind === 'fountain') {
        pts = w.polygon;
        closed = true;
        level = w.kind === 'pond' ? 0.55 : 0.85;
      }
      if (!pts || pts.length < 2) continue;
      const c = pts[0];
      this.emitters.push({ id: `water:${w.id}`, kind, level, path: { pts, closed, y: groundAt(c[0], c[1]) + 0.25 }, gate: finished, holdUntil: 0 });
    }
    // What the yard's own features switch: water walls and fountains, fires, spa jets.
    build.root.updateMatrixWorld(true);
    for (const a of build.features.actions) {
      let kind: SoundKind | null = null;
      let level = 1;
      if (a.key === 'water') {
        const f = plan.features.find((x) => x.id === a.itemId);
        kind = f && /water-wall/.test(f.catalogId) ? 'waterfall' : 'trickle';
        level = kind === 'waterfall' ? 0.9 : 0.8;
      } else if (a.key === 'fire' && a.label === 'Fire') kind = 'fire';
      else if (a.key === 'jets') kind = 'spa';
      if (!kind || !a.anchors.length) continue;
      const pos = new THREE.Vector3();
      for (const o of a.anchors) pos.add(o.getWorldPosition(this.v));
      pos.multiplyScalar(1 / a.anchors.length);
      // Spa jets are muffled under a closed cover.
      const cover = a.key === 'jets' ? build.features.actions.find((c) => c.itemId === a.itemId && c.key === 'cover') : undefined;
      this.emitters.push({ id: `${a.itemId}:${a.key}`, kind, level, pos, gate: () => finished() && a.on && (!cover || cover.on), holdUntil: 0 });
    }
    // Voices of sources that are still in the yard play on (no restart); the others fade out over a moment.
    for (const e of this.emitters) {
      const before = old.find((o) => o.id === e.id);
      if (before) e.holdUntil = before.holdUntil;
      const v = this.voices.get(e.id);
      if (v) v.emitter = e;
    }
    for (const [id, v] of this.voices) if (!this.emitters.some((e) => e.id === id)) v.retiring = true;
    this.sinceSelect = 1;
  }

  setStage(stage: BuildStage) {
    this.stage = stage;
    this.sinceSelect = 1;
  }

  /**
   * Something was switched by hand. Water makes its start or stop sound at the water; the loop follows (a fade-in a
   * moment after the start, a fade-out right away on stop).
   */
  noteAction(itemId: string, key: string, on: boolean) {
    const e = this.emitters.find((x) => x.id === `${itemId}:${key}`);
    if (!e || key !== 'water' || this.stage !== 'finished') return;
    const ctx = this.ctx;
    if (!ctx) return;
    e.holdUntil = on ? ctx.currentTime + START_LEAD : 0;
    this.sinceSelect = 1;
    this.playOneShot(on ? 'water-on' : 'water-off', e);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                            */

  /**
   * Move the listener to the view and ease the gains. `orbitTarget` is the orbit camera's look-at point: from orbit
   * the listener stands there (you hear the yard you look at, not the air above it); walking or flying it is the
   * camera itself.
   */
  update(camera: THREE.Camera, night: number, orbitTarget: THREE.Vector3 | null) {
    const ctx = this.ctx;
    if (!ctx || this.disposed || ctx.state !== 'running' || !this.wantRunning()) return;
    // Fades follow the audio clock, not the frame time (which the studio caps and which is long on a slow display).
    const dt = Math.min(0.5, Math.max(0, ctx.currentTime - this.lastT));
    this.lastT = ctx.currentTime;
    this.night01 = night;

    // Listener.
    camera.updateMatrixWorld();
    const lp = orbitTarget ?? camera.getWorldPosition(this.v);
    this.lx = lp.x; this.ly = lp.y; this.lz = lp.z;
    camera.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const l = ctx.listener;
    if (Number.isFinite(this.lx + this.ly + this.lz + this.fwd.x + this.fwd.y + this.fwd.z + this.up.x + this.up.y + this.up.z)) {
      if (l.positionX) {
        l.positionX.value = this.lx; l.positionY.value = this.ly; l.positionZ.value = this.lz;
        l.forwardX.value = this.fwd.x; l.forwardY.value = this.fwd.y; l.forwardZ.value = this.fwd.z;
        l.upX.value = this.up.x; l.upY.value = this.up.y; l.upZ.value = this.up.z;
      } else {
        const old = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
        old.setPosition(this.lx, this.ly, this.lz);
        old.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
      }
    }

    // Ambience.
    const n = smooth(0.08, 0.65, night);
    this.dayWant = AMBIENCE.day * (1 - n);
    this.nightWant = AMBIENCE.night * n;
    this.ensureAmbience();
    const k = 1 - Math.exp(-dt / 1.2);
    this.dayG += (this.dayWant - this.dayG) * k;
    this.nightG += (this.nightWant - this.nightG) * k;
    if (this.day) setParam(this.day.gain.gain, this.dayG);
    if (this.night) setParam(this.night.gain.gain, this.nightG);

    // Which sources sound: a few times a second.
    this.sinceSelect += dt;
    if (this.sinceSelect >= SELECT_EVERY) {
      this.sinceSelect = 0;
      this.select(ctx);
    }
    // Voices: position and gain, every frame (a handful).
    const kf = 1 - Math.exp(-dt / 0.25);
    for (const [id, v] of this.voices) {
      const d = this.place(v.emitter, this.v);
      setPanner(v.pan, this.v.x, this.v.y, this.v.z);
      const held = ctx.currentTime < v.emitter.holdUntil;
      v.want = v.retiring || held ? 0 : distanceGain(v.emitter.kind, d) * v.emitter.level * KINDS[v.emitter.kind].gain;
      // Switching off goes quicker than a distance change.
      v.g += (v.want - v.g) * (v.retiring ? 1 - Math.exp(-dt / 0.35) : kf);
      setParam(v.gain.gain, v.g);
      if (v.retiring && v.g < 0.002) {
        this.releaseVoice(v);
        this.voices.delete(id);
      }
    }
  }

  /** The sound's place for this emitter now (written to `out`), and its distance to the listener. */
  private place(e: Emitter, out: THREE.Vector3): number {
    if (e.pos) out.copy(e.pos);
    else {
      nearestOnPath(e.path!, this.lx, this.lz, out);
      out.y = e.path!.y;
    }
    return Math.hypot(out.x - this.lx, out.y - this.ly, out.z - this.lz);
  }

  /** The nearest few of each kind that are on and in range get voices; the others fade away. */
  private select(ctx: AudioContext) {
    const wanted = new Set<string>();
    const tmp = new THREE.Vector3();
    for (const kind of KIND_LIST) {
      const spec = KINDS[kind];
      const cands: { e: Emitter; d: number }[] = [];
      for (const e of this.emitters) {
        if (e.kind !== kind || !e.gate()) continue;
        // A pond you stand inside of is as loud as it gets.
        const d = e.path && e.path.closed && inside(e.path.pts, this.lx, this.lz) ? 0 : this.place(e, tmp);
        if (d < spec.range) cands.push({ e, d });
      }
      cands.sort((a, b) => a.d - b.d);
      for (const c of cands.slice(0, spec.max)) wanted.add(c.e.id);
    }
    for (const [id, v] of this.voices) if (!wanted.has(id)) v.retiring = true;
    for (const id of wanted) {
      const have = this.voices.get(id);
      if (have) { have.retiring = false; continue; }
      const e = this.emitters.find((x) => x.id === id)!;
      const buf = this.buffers.get(KINDS[e.kind].file);
      if (!buf) { void this.load(KINDS[e.kind].file, true); continue; }
      this.voices.set(id, this.startVoice(ctx, e, buf));
    }
  }

  private startVoice(ctx: AudioContext, e: Emitter, buf: AudioBuffer): Voice {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    // No attenuation from the panner: the distance gain above does that (and can be read back).
    pan.distanceModel = 'linear';
    pan.rolloffFactor = 0;
    src.connect(gain).connect(pan).connect(this.master!);
    // Not every voice of a kind starts at the same moment of the clip.
    src.start(0, Math.random() * buf.duration);
    return { emitter: e, src, gain, pan, g: 0, want: 0, retiring: false };
  }

  private releaseVoice(v: Voice) {
    try { v.src.stop(); } catch { /* already stopped */ }
    v.src.disconnect();
    v.gain.disconnect();
    v.pan.disconnect();
  }

  private dropAllVoices() {
    for (const v of this.voices.values()) this.releaseVoice(v);
    this.voices.clear();
  }

  private ensureAmbience() {
    const ctx = this.ctx!;
    for (const which of ['day', 'night'] as const) {
      if (this[which]) continue;
      const wantNow = which === 'day' ? this.dayWant > 0.01 : this.nightWant > 0.01;
      if (!wantNow) continue;
      const buf = this.buffers.get(which);
      if (!buf) { void this.load(which, true); continue; }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master!);
      src.start(0, Math.random() * buf.duration);
      this[which] = { gain, src };
    }
  }

  private playOneShot(file: string, e: Emitter) {
    const ctx = this.ctx;
    const buf = this.buffers.get(file);
    if (!ctx || !this.wantRunning()) return;
    if (!buf) { void this.load(file, false); return; }
    const out = new THREE.Vector3();
    const d = this.place(e, out);
    const g = distanceGain(e.kind, d) * ONE_SHOT_GAIN;
    if (g < 0.003) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    setParam(gain.gain, g);
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'linear';
    pan.rolloffFactor = 0;
    setPanner(pan, out.x, out.y, out.z);
    src.connect(gain).connect(pan).connect(this.master!);
    this.oneShots.add(src);
    src.onended = () => {
      this.oneShots.delete(src);
      src.disconnect(); gain.disconnect(); pan.disconnect();
    };
    src.start();
  }

  /* ------------------------------------------------------------------ */
  /* Clips                                                                */

  /** Fetch and decode a clip once. Loops get their end blended into their start. */
  private load(name: string, loop: boolean): Promise<void> {
    const have = this.loading.get(name);
    if (have) return have;
    const p = (async () => {
      const ctx = this.ctx;
      if (!ctx) { this.loading.delete(name); return; }
      try {
        const bytes = await clipBytes(name);
        const raw = await ctx.decodeAudioData(bytes);
        this.buffers.set(name, loop ? seamless(ctx, raw, LOOP_BLEND) : raw);
      } catch (e) {
        // Missing or undecodable clip: that sound is skipped, nothing else is affected.
        console.warn(`Sound "${name}" could not be loaded`, e);
        this.loading.delete(name);
      }
    })();
    this.loading.set(name, p);
    return p;
  }

  /** A look at what is sounding, for checks. */
  debug() {
    const ctx = this.ctx;
    const tmp = new THREE.Vector3();
    return {
      supported: !this.failed,
      on: this.prefs.on,
      volume: this.prefs.volume,
      unlocked: this.unlocked,
      paused: this.paused,
      state: ctx?.state ?? 'none',
      master: this.master?.gain.value ?? null,
      night: this.night01,
      day: this.day ? this.day.gain.gain.value : null,
      crickets: this.night ? this.night.gain.gain.value : null,
      listener: [this.lx, this.ly, this.lz].map((n) => +n.toFixed(2)),
      emitters: this.emitters.map((e) => ({ id: e.id, kind: e.kind, on: e.gate(), distance: +this.place(e, tmp).toFixed(2), at: [tmp.x, tmp.y, tmp.z].map((n) => +n.toFixed(1)) })),
      voices: [...this.voices.values()].map((v) => ({
        id: v.emitter.id,
        kind: v.emitter.kind,
        distance: +this.place(v.emitter, tmp).toFixed(2),
        gain: +v.gain.gain.value.toFixed(4),
        want: +v.want.toFixed(4),
        retiring: v.retiring,
      })),
      buffers: [...this.buffers.keys()],
      oneShotsPlaying: this.oneShots.size,
    };
  }

  dispose() {
    this.disposed = true;
    this.stopListening();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.dropAllVoices();
    for (const s of this.oneShots) { try { s.stop(); } catch { /* done */ } }
    this.oneShots.clear();
    for (const a of [this.day, this.night]) if (a) { try { a.src.stop(); } catch { /* done */ } a.src.disconnect(); a.gain.disconnect(); }
    this.day = this.night = null;
    this.buffers.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}

let inlineClips: Record<string, string> | null | undefined;

/** The clip's file: inlined in the single-file build (`#sound-data`, parsed once), else next to the page under `sounds/`. */
async function clipBytes(name: string): Promise<ArrayBuffer> {
  if (inlineClips === undefined) {
    inlineClips = null;
    const el = typeof document !== 'undefined' ? document.getElementById('sound-data') : null;
    if (el?.textContent) {
      try {
        inlineClips = JSON.parse(el.textContent) as Record<string, string>;
      } catch {
        /* use the files */
      }
    }
  }
  const b64 = inlineClips?.[name];
  if (b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const r = await fetch(new URL(`sounds/${name}.mp3`, document.baseURI).href);
  if (!r.ok) throw new Error(`${name}.mp3: ${r.status}`);
  return r.arrayBuffer();
}

/**
 * A loop with no seam: the last `blend` seconds are folded into the first (equal-power crossfade) and cut off, so the
 * end of the buffer runs straight into its start.
 */
function seamless(ctx: BaseAudioContext, src: AudioBuffer, blend: number): AudioBuffer {
  const x = Math.min(Math.floor(blend * src.sampleRate), Math.floor(src.length / 3));
  const m = src.length - x;
  const out = ctx.createBuffer(src.numberOfChannels, m, src.sampleRate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const a = src.getChannelData(c), o = out.getChannelData(c);
    o.set(a.subarray(0, m));
    for (let i = 0; i < x; i++) {
      const t = (i + 0.5) / x;
      o[i] = a[i] * Math.sin(t * Math.PI / 2) + a[m + i] * Math.cos(t * Math.PI / 2);
    }
  }
  return out;
}
