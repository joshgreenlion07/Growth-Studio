import * as THREE from 'three';
import { PendingTexture, setTexturePainter, type PBRSet } from './textures';
import { setEdgePainter } from './paver-detail';

/**
 * Page side of the texture worker (textures.worker.ts). Importing this module
 * turns worker painting on; without it every set is painted on the main
 * thread as before.
 *
 * A set requested here is already in use with its flat stand-in maps. Each
 * painted set is swapped in as soon as it is uploaded, at most one set per
 * frame:
 *
 * - Order: the sets of the newest build or restyle first (a color just picked
 *   is painted before anything asked for earlier), then a quick 512 px copy of
 *   every large set before any full-size one.
 * - Workers: up to three paint any set; one more (where there are cores to
 *   spare) takes only quick copies and stored sets, so a color just picked is
 *   on screen in well under a second even while full-size sets are painting.
 * - Stale sets: a yard tells the painter which sets it draws with (see
 *   textureDemand). A set no yard draws with any more (a color previewed and
 *   then replaced) is dropped from the queue; one being painted is stopped
 *   (its worker is replaced) when a wanted set is waiting. It is queued again
 *   if a yard draws with it later.
 * - Upload: the worker sends the maps rows bottom first with their mip levels
 *   already made, so they go to GL as they are (no flip, no ImageData, no
 *   generateMipmap). Each map is copied into a texture of its own in slices of
 *   rows, a few milliseconds per frame; nothing on the GPU touches it until it
 *   is complete, so no slice waits on the GPU. The set's maps are switched to
 *   it once all three are in, so the view never stalls on an upload and never
 *   shows a half-filled map.
 */

/** No crossfade frames: each set goes straight from its flat stand-in to the painted maps. */
const FADE_STEPS: number[] = [];
/** Workers that never say they are ready within this time are given up on. */
const READY_TIMEOUT_MS = 10000;
/** Main-thread time per frame for copying painted maps to the GPU. */
const UPLOAD_BUDGET_MS = 3;
/** Bytes per texSubImage2D call (128 rows of a 1024 px map). */
const CHUNK_BYTES = 512 * 1024;

type Phase = 'preview' | 'full';

interface Job {
  id: number;
  key: string;
  set: PBRSet;
  make: () => PBRSet;
  /** The stand-in colors, for the crossfade frames. */
  flat: number[][];
  /** Build or restyle that asked for it; newer ones are painted first. */
  gen: number;
  /** 'preview' asks for the quick low-resolution copy first. */
  phase: Phase;
  state: 'waiting' | 'running' | 'dropped' | 'done';
  /** A yard draws with it now. */
  demanded: boolean;
  /** A yard drew with it at some point (a set never seen in a yard, e.g. one used through a shader uniform, is never dropped). */
  seen: boolean;
  /** A swatch is waiting for it. */
  swatch: boolean;
  /** Current image width of each map, for the direct (no renderer) swap. */
  sizes: number[];
  /** Textures holding the GL copies the maps show now, released at the next swap. */
  staging: THREE.Texture[] | null;
  t0: number;
  /** Painted maps (a quick copy or the full set) are on screen. */
  shown?: boolean;
  /** Texels of the full set, once a quick copy told (0 before). */
  cost: number;
}

interface Frame {
  size: number;
  maps: ArrayBuffer[];
}

interface Slot {
  w: Worker;
  ready: boolean;
  dead: boolean;
  job: Job | null;
  /** Kept for quick copies (and stored sets): a color just picked never waits behind full-size paints. */
  quick: boolean;
}

interface Level {
  data: Uint8Array;
  width: number;
  height: number;
}

interface StageMap {
  tex: THREE.DataTexture;
  levels: Level[];
  /** Level being copied (-1: storage not made yet) and the next row in it. */
  level: number;
  row: number;
}

interface Apply {
  job: Job;
  /** The frame to show, or null to paint the set here (the worker failed). */
  frame: Frame | null;
  /** The last frame of the set (not a preview or crossfade frame). */
  final: boolean;
  phase: Phase;
  maps: StageMap[] | null;
}

let state: 'unknown' | 'on' | 'off' = 'unknown';
let slots: Slot[] = [];
let nextId = 1;
let gen = 1;
const jobs: Job[] = [];
const bySource = new Map<THREE.Source<unknown>, Job>();
const applying: Apply[] = [];
let raf = 0;
const listeners = new Set<() => void>();
const demands = new Map<object, Set<THREE.Source<unknown>>>();
let renderer: THREE.WebGLRenderer | null = null;

/** Call `fn` whenever painted maps were swapped in (the view draws on demand, so it must redraw). */
export function onTexturesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The renderer that draws the yard. With it, painted maps are uploaded a slice at a time over several frames; without
 * it they are handed to three.js whole (one upload, in the frame that first draws them).
 */
export function setTextureRenderer(r: THREE.WebGLRenderer | null) {
  renderer = r;
}

/** A swatch waits for this set: paint it even when no yard draws with it (after the sets a yard draws with). */
export function wantForSwatch(set: PBRSet) {
  const job = bySource.get(set.map.source);
  if (!job || job.swatch) return;
  job.swatch = true;
  // Asked for by a swatch alone: painted after every set a yard draws with.
  if (!job.demanded) job.seen = true;
  if (job.state === 'dropped') job.state = 'waiting';
  pump();
}

/** Measurements for tests and the console: `window.__gsTextures`. */
const stats = {
  requested: 0,
  painted: 0,
  previews: 0,
  fromCache: 0,
  fallback: 0,
  /** Edge maps painted by a worker. */
  edges: 0,
  applied: 0,
  /** Sets fully painted and on screen. */
  finals: 0,
  /** Sets showing painted maps (a quick copy or the full set). */
  shown: 0,
  dropped: 0,
  stopped: 0,
  firstMs: 0,
  lastMs: 0,
  workers: 0,
  quickWorkers: 0,
  /** Longest main-thread slice spent uploading or swapping in one frame. */
  maxFrameMs: 0,
  /** The last swaps: key, phase, ms from request to on screen. */
  log: [] as [string, Phase, number][],
  /** Frames where texture work took long: [ms since load, ms, what]. */
  slow: [] as [number, number, string][],
};
let slowWhat = '';
const t0 = performance.now();

function supported(): boolean {
  if (typeof Worker === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('texworker') !== '0';
  } catch {
    return true;
  }
}

function spawn(quick = false): Slot | null {
  try {
    // Written out in full so Vite bundles the worker (and esbuild leaves it alone).
    const w = new Worker(new URL('./textures.worker.ts', import.meta.url), { type: 'module' });
    const slot: Slot = { w, ready: false, dead: false, job: null, quick };
    w.onmessage = (e) => onMessage(slot, e.data);
    w.onerror = (e) => {
      e.preventDefault?.();
      workerDied(slot);
    };
    setTimeout(() => !slot.ready && workerDied(slot), READY_TIMEOUT_MS);
    return slot;
  } catch {
    return null;
  }
}

function start(): boolean {
  if (!supported()) return false;
  const cores = navigator.hardwareConcurrency || 4;
  const n = Math.max(1, Math.min(3, cores - 2));
  // Plus one for quick copies only, where there are cores to spare.
  for (let i = 0; i < n + (cores >= 6 ? 1 : 0); i++) {
    const s = spawn(i >= n);
    if (!s) {
      for (const x of slots) x.w.terminate();
      slots = [];
      return false;
    }
    slots.push(s);
  }
  stats.workers = slots.length;
  stats.quickWorkers = slots.filter((x) => x.quick).length;
  return true;
}

const wanted = (j: Job) => j.demanded || j.swatch || !j.seen;

/** Lower sorts first: sets a yard draws with, newest request, quick copies, oldest id. */
function cmp(a: Job, b: Job): number {
  const ca = a.demanded || !a.seen ? 0 : 1, cb = b.demanded || !b.seen ? 0 : 1;
  if (ca !== cb) return ca - cb;
  if (a.gen !== b.gen) return b.gen - a.gen;
  if (a.phase !== b.phase) return a.phase === 'preview' ? -1 : 1;
  // Full sets: the largest first, so the longest paints start early and the yard is complete sooner.
  if (a.cost !== b.cost) return b.cost - a.cost;
  return a.id - b.id;
}

function onMessage(slot: Slot, d: { type: string; id?: number; frames?: Frame[]; fromCache?: boolean; message?: string; full?: number; data?: ArrayBuffer | null }) {
  if (d.type === 'ready') {
    slot.ready = true;
    pump();
    pumpEdges();
    return;
  }
  if (d.type === 'edges') {
    const k = edgeReqs.findIndex((r) => r.id === d.id);
    if (k < 0) return;
    const r = edgeReqs.splice(k, 1)[0];
    stats.edges++;
    r.done(d.data ? new Uint8Array(d.data) : null);
    // The view draws on demand: the overlay turns on with the next frame.
    for (const fn of listeners) fn();
    return;
  }
  const job = slot.job;
  if (!job || d.id !== job.id) return;
  slot.job = null;
  if (d.type === 'preview' && d.frames?.length) {
    stats.previews++;
    queueApply(job, d.frames[d.frames.length - 1], false, 'preview');
    // The full set is painted next, in its turn.
    job.phase = 'full';
    job.cost = (d.full ?? 0) ** 2;
    job.state = wanted(job) ? 'waiting' : 'dropped';
  } else if (d.type === 'done' && d.frames?.length) {
    if (d.fromCache) stats.fromCache++;
    else stats.painted++;
    job.state = 'done';
    // Crossfade frames (none by default), then the painted set.
    d.frames.forEach((f, i) => queueApply(job, f, i === d.frames!.length - 1, 'full'));
  } else {
    if (d.message) console.warn(`Growth Studio: texture worker could not paint ${job.key} (${d.message}); painting it here.`);
    job.state = 'done';
    queueApply(job, null, true, 'full');
  }
  pump();
}

function workerDied(slot: Slot) {
  if (slot.dead) return;
  slot.dead = true;
  slot.w.terminate();
  if (slot.job && slot.job.state === 'running') slot.job.state = 'waiting';
  slot.job = null;
  requeueEdges(slot);
  // The quick-copy worker takes any set once it is the only one left.
  if (!slots.some((s) => !s.dead && !s.quick)) for (const s of slots) s.quick = false;
  if (slots.every((s) => s.dead)) {
    // No worker can run here (old browser, blocked script, a build without the worker file):
    // finish what is pending on the main thread and paint everything there from now on.
    state = 'off';
    const left = jobs.filter((j) => j.state === 'waiting' || j.state === 'dropped');
    if (left.length) console.warn('Growth Studio: texture worker unavailable; painting textures on the main thread.');
    for (const job of left) {
      job.state = 'done';
      queueApply(job, null, true, 'full');
    }
    // Edge maps still waiting are painted here.
    for (const r of edgeReqs.splice(0)) r.done(null);
  } else {
    pump();
    pumpEdges();
  }
}

/** Stop a worker painting a set nobody wants any more, so a wanted one can start now. */
function replace(slot: Slot) {
  const i = slots.indexOf(slot);
  const fresh = spawn(slot.quick);
  if (i < 0 || !fresh) return;
  slot.dead = true;
  slot.w.terminate();
  if (slot.job) slot.job.state = 'dropped';
  slot.job = null;
  slots[i] = fresh;
  stats.stopped++;
  requeueEdges(slot);
  pumpEdges();
}

/* ------------------------------------------------------------------ */
/* Edge maps of detailed pavers (engine/paver-detail.ts)                */

interface EdgeReq {
  id: number;
  src: string;
  done: (data: Uint8Array | null) => void;
  /** The worker painting it (null: waiting for one). */
  slot: Slot | null;
}
const edgeReqs: EdgeReq[] = [];

/**
 * Hand waiting edge maps to workers: an idle full-size worker first, then the one with the least queued; the worker
 * kept for quick copies only when it is the only one, so a color just picked still shows in well under a second.
 */
function pumpEdges() {
  for (const r of edgeReqs) {
    if (r.slot) continue;
    const live = slots.filter((s) => s.ready && !s.dead);
    const pool = live.some((s) => !s.quick) ? live.filter((s) => !s.quick) : live;
    if (!pool.length) return;
    const load = (s: Slot) => edgeReqs.filter((q) => q.slot === s).length + (s.job ? 2 : 0);
    const s = pool.reduce((a, b) => (load(b) < load(a) ? b : a));
    r.slot = s;
    s.w.postMessage({ type: 'edges', id: r.id, src: r.src });
  }
}

/** A worker went away: its edge maps go to another one. */
function requeueEdges(slot: Slot) {
  for (const r of edgeReqs) if (r.slot === slot) r.slot = null;
}

setEdgePainter((src, done) => {
  if (state === 'unknown') state = start() ? 'on' : 'off';
  if (state !== 'on') return false;
  edgeReqs.push({ id: nextId++, src, done, slot: null });
  pumpEdges();
  return true;
});

function pump() {
  const waiting = jobs.filter((j) => j.state === 'waiting').sort(cmp);
  // Workers for any set first, then the one kept for quick copies.
  for (const s of [...slots.filter((x) => !x.quick), ...slots.filter((x) => x.quick)]) {
    if (!waiting.length) break;
    if (!s.ready || s.dead || s.job) continue;
    const k = s.quick ? waiting.findIndex((j) => j.phase === 'preview') : 0;
    if (k < 0) continue;
    const job = waiting.splice(k, 1)[0];
    job.state = 'running';
    s.job = job;
    s.w.postMessage({ type: 'paint', id: job.id, key: job.key, flat: job.flat, steps: FADE_STEPS, preview: job.phase === 'preview' });
  }
  // Every worker busy and a wanted set waiting: stop one painting a set no yard draws with any more.
  if (waiting.some((j) => j.demanded || !j.seen)) {
    for (const s of slots) {
      if (s.job && !s.dead && !wanted(s.job)) {
        replace(s);
        break;
      }
    }
  }
}

function setDemand(owner: object, sources: Set<THREE.Source<unknown>> | null) {
  if (sources) demands.set(owner, sources);
  else demands.delete(owner);
  for (const j of jobs) {
    if (j.state === 'done') continue;
    const was = j.demanded;
    j.demanded = false;
    for (const s of demands.values()) {
      if (s.has(j.set.map.source)) {
        j.demanded = true;
        break;
      }
    }
    if (j.demanded) {
      j.seen = true;
      // Wanted again (a color picked a second time): to the front with the newest requests.
      if (!was) j.gen = gen;
      if (j.state === 'dropped') j.state = 'waiting';
    } else if (j.state === 'waiting' && !wanted(j)) {
      j.state = 'dropped';
      stats.dropped++;
    }
  }
  pump();
}

function queueApply(job: Job, frame: Frame | null, final: boolean, phase: Phase) {
  // The full set supersedes a quick copy of it not shown yet.
  if (final) {
    for (let i = applying.length - 1; i >= 0; i--) {
      const a = applying[i];
      if (a.job !== job || a.final) continue;
      a.maps?.forEach((m) => m.tex.dispose());
      applying.splice(i, 1);
    }
  }
  applying.push({ job, frame, final, phase, maps: null });
  if (!raf) raf = requestAnimationFrame(tick);
}

/** The set's maps now show `next`: keep finding the job by the source its maps (and the yard's materials) use. */
function rekey(job: Job, next: THREE.Source<unknown>) {
  bySource.delete(job.set.map.source);
  bySource.set(next, job);
}

function tick() {
  raf = 0;
  const start = performance.now();
  let swapped = false;
  // Sets a yard draws with first, newest first.
  applying.sort((a, b) => cmp(a.job, b.job));
  // A set's frames are shown in order: one waiting on its upload holds back the later ones.
  const held = new Set<Job>();
  for (let i = 0; i < applying.length && performance.now() - start < UPLOAD_BUDGET_MS; i++) {
    const a = applying[i];
    if (held.has(a.job)) continue;
    held.add(a.job);
    if (!a.frame) {
      if (swapped) continue;
      stats.fallback++;
      const painted = a.job.make();
      swapImages(a.job, [painted.map.image, painted.normalMap.image, painted.roughnessMap.image]);
    } else if (!renderer) {
      if (swapped) continue;
      swapData(a.job, a.frame);
    } else {
      if (!upload(a, start)) continue;
      if (swapped) continue;
      swapStaged(a.job, a.maps!.map((m) => m.tex));
    }
    swapped = true;
    applying.splice(i--, 1);
    done(a);
  }
  const spent = Math.round(performance.now() - start);
  stats.maxFrameMs = Math.max(stats.maxFrameMs, spent);
  if (spent > 12) stats.slow.push([Math.round(start - t0), spent, slowWhat]);
  slowWhat = '';
  if (swapped) for (const fn of listeners) fn();
  if (applying.length && !raf) raf = requestAnimationFrame(tick);
}

function done(a: Apply) {
  const job = a.job;
  stats.applied++;
  stats.lastMs = Math.round(performance.now() - t0);
  stats.firstMs ||= stats.lastMs;
  stats.log.push([job.key, a.phase, Math.round(performance.now() - job.t0)]);
  if (!job.shown) {
    job.shown = true;
    stats.shown++;
  }
  if (stats.log.length > 40) stats.log.shift();
  for (const t of [job.set.map, job.set.normalMap, job.set.roughnessMap]) delete t.userData.flat;
  if (!a.final) return;
  stats.finals++;
  for (const t of [job.set.map, job.set.normalMap, job.set.roughnessMap]) {
    const p = t as PendingTexture;
    p.group?.clear();
    p.group = null;
  }
  bySource.delete(job.set.map.source);
  const i = jobs.indexOf(job);
  if (i >= 0) jobs.splice(i, 1);
}

/** A map's levels from the worker's buffer: the full-size map, then each mip level down to 1 px (see textures.worker.ts). */
function levelsOf(buf: ArrayBuffer, size: number): Level[] {
  const out: Level[] = [];
  let at = 0;
  for (let s = size; s >= 1; s >>= 1) {
    out.push({ data: new Uint8Array(buf, at, s * s * 4), width: s, height: s });
    at += s * s * 4;
  }
  return out;
}

/** A texture for one painted map, with the stand-in's sampling settings and the painted mip chain (no GPU-made mips). */
function mapTexture(src: THREE.Texture, levels: Level[], name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(levels[0].data, levels[0].width, levels[0].height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels as unknown as THREE.DataTexture['mipmaps'];
  tex.generateMipmaps = false;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.magFilter = src.magFilter;
  tex.minFilter = src.minFilter;
  tex.anisotropy = src.anisotropy;
  tex.colorSpace = src.colorSpace;
  tex.internalFormat = src.internalFormat;
  tex.premultiplyAlpha = false;
  tex.flipY = false;
  tex.unpackAlignment = 4;
  tex.name = name;
  return tex;
}

/**
 * Copy the frame's maps to GL textures of their own, a slice of rows at a time. True once all three are complete.
 * The storage is made without pixels and nothing on the GPU reads it (no generateMipmap: the levels come painted)
 * until every level is in, so no slice waits for the GPU to finish a frame.
 */
function upload(a: Apply, start: number): boolean {
  const r = renderer!;
  const f = a.frame!;
  if (!a.maps) {
    const src = [a.job.set.map, a.job.set.normalMap, a.job.set.roughnessMap];
    a.maps = f.maps.map((buf, i) => {
      const levels = levelsOf(buf, f.size);
      return { tex: mapTexture(src[i], levels, `${a.job.key}#${i}`), levels, level: -1, row: 0 };
    });
  }
  const gl = r.getContext() as WebGL2RenderingContext;
  const st = r.state as unknown as {
    bindTexture(type: number, tex: WebGLTexture | null | undefined): void;
    pixelStorei(name: number, value: number | boolean): void;
  };
  for (const m of a.maps) {
    while (m.level < m.levels.length) {
      if (performance.now() - start >= UPLOAD_BUDGET_MS) return false;
      if (m.level < 0) {
        // Storage for every level, without the pixels: those follow in slices.
        m.tex.source.dataReady = false;
        m.tex.needsUpdate = true;
        const i0 = performance.now();
        r.initTexture(m.tex);
        if (performance.now() - i0 > 8) slowWhat += `init${m.levels[0].width}:${Math.round(performance.now() - i0)} `;
        m.tex.source.dataReady = true;
        m.level = 0;
        continue;
      }
      const glTex = (r.properties.get(m.tex) as { __webglTexture?: WebGLTexture }).__webglTexture;
      if (!glTex) {
        // Lost (context restored): let three.js upload the whole map when it is drawn.
        m.level = m.levels.length;
        m.tex.needsUpdate = true;
        break;
      }
      const lv = m.levels[m.level], w = lv.width;
      const rows = Math.min(w - m.row, Math.max(1, Math.floor(CHUNK_BYTES / (w * 4))));
      st.bindTexture(gl.TEXTURE_2D, glTex);
      st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      st.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      const c0 = performance.now();
      gl.texSubImage2D(gl.TEXTURE_2D, m.level, 0, m.row, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, lv.data, m.row * w * 4);
      const cd = performance.now() - c0;
      if (cd > 8) slowWhat += `sub${w}:${Math.round(cd)} `;
      m.row += rows;
      if (m.row >= w) {
        m.level++;
        m.row = 0;
      }
    }
  }
  return true;
}

/** Every texture showing one of the set's maps: the map and its clones (materials clone maps to set the repeat). */
function members(t: THREE.Texture): Set<THREE.Texture> {
  return (t as PendingTexture).group ?? new Set([t]);
}

/** Show `like`'s pixels (its source and mip chain) in `g`. */
function share(g: THREE.Texture, like: THREE.Texture, flipY: boolean, isData: boolean) {
  // Release the GL copy it used (three.js keys GL textures by source and settings), then take the new one.
  g.dispose();
  g.source = like.source;
  g.mipmaps = like.mipmaps;
  g.generateMipmaps = like.generateMipmaps;
  g.flipY = flipY;
  (g as { isDataTexture?: boolean }).isDataTexture = isData;
}

/** Point the set's maps (and every clone) at the uploaded textures. Nothing is uploaded again: they share its GL copy. */
function swapStaged(job: Job, staged: THREE.DataTexture[]) {
  const maps = [job.set.map, job.set.normalMap, job.set.roughnessMap];
  rekey(job, staged[0].source);
  maps.forEach((t, i) => {
    for (const g of members(t)) share(g, staged[i], false, true);
    job.sizes[i] = staged[i].image.width;
  });
  job.staging?.forEach((t) => t.dispose());
  job.staging = staged;
}

/** Without the view's renderer: hand three.js the pixels and let it upload them when it next draws. */
function swapData(job: Job, f: Frame) {
  const maps = [job.set.map, job.set.normalMap, job.set.roughnessMap];
  const texs = maps.map((t, i) => mapTexture(t, levelsOf(f.maps[i], f.size), `${job.key}#${i}`));
  rekey(job, texs[0].source);
  maps.forEach((t, i) => {
    for (const g of members(t)) share(g, texs[i], false, true);
    t.needsUpdate = true;
    job.sizes[i] = f.size;
  });
  job.staging?.forEach((t) => t.dispose());
  job.staging = null;
}

/** Painted here (canvases, rows top first; three.js makes the mip levels). */
function swapImages(job: Job, images: unknown[]) {
  const maps = [job.set.map, job.set.normalMap, job.set.roughnessMap];
  const texs = images.map((img) => {
    const t = new THREE.Texture(img as HTMLCanvasElement);
    t.generateMipmaps = true;
    return t;
  });
  rekey(job, texs[0].source);
  maps.forEach((t, i) => {
    for (const g of members(t)) share(g, texs[i], true, false);
    t.needsUpdate = true;
    job.sizes[i] = (images[i] as { width: number }).width;
  });
  job.staging?.forEach((t) => t.dispose());
  job.staging = null;
}

setTexturePainter({
  available() {
    if (state === 'unknown') state = start() ? 'on' : 'off';
    return state === 'on';
  },
  request(key, set, make) {
    stats.requested++;
    const flat = [set.map, set.normalMap, set.roughnessMap].map((t) => (t.userData.flat as number[]) ?? [128, 128, 128]);
    const job: Job = { id: nextId++, key, set, make, flat, gen, phase: 'preview', state: 'waiting', demanded: false, seen: false, swatch: false, sizes: [2, 2, 2], staging: null, t0: performance.now(), cost: 0 };
    jobs.push(job);
    bySource.set(set.map.source, job);
    pump();
  },
  nextGeneration() {
    return ++gen;
  },
  cancelGeneration(g: number) {
    for (const j of jobs) {
      if (j.gen !== g || j.state === 'done' || j.demanded || j.swatch) continue;
      // As if a yard had drawn with it and let it go: dropped from the queue until something asks for it again.
      j.seen = true;
      if (j.state === 'waiting') {
        j.state = 'dropped';
        stats.dropped++;
      }
    }
    pump();
  },
  demand: setDemand,
});

(globalThis as { __gsTextures?: unknown }).__gsTextures = Object.assign(stats, {
  /** Sets a yard draws with that are not fully painted and on screen yet. */
  pendingDemanded: () => jobs.filter((j) => j.demanded).map((j) => `${j.key}:${j.phase}:${j.state}`),
  /** Every set not fully painted yet: key, phase, state, generation, demanded/seen/swatch. */
  pending: () => jobs.map((j) => `${j.key}:${j.phase}:${j.state}:g${j.gen}:${j.demanded ? 'D' : ''}${j.seen ? 'S' : ''}${j.swatch ? 'W' : ''}`),
});
