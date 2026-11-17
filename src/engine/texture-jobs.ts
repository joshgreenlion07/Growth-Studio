import { PendingTexture, setTexturePainter, type PBRSet } from './textures';

/**
 * Page side of the texture worker (textures.worker.ts). Importing this module
 * turns worker painting on; without it every set is painted on the main
 * thread as before.
 *
 * A set requested here is already in use with its flat stand-in maps. Painted
 * sets are held until the worker queue is empty (or HOLD_MS has passed) and
 * then swapped in together in one frame, so the yard changes once instead of
 * popping surface by surface (one pop, and a crossfade, per set read as
 * flicker and stutter on a full plan).
 *
 * Painted pixels arrive as RGBA ArrayBuffers (transferred, no copy) and are
 * uploaded as ImageData. Unlike ImageBitmap, ImageData honours `flipY` and the
 * color-space settings in every browser, so the maps land exactly as the
 * canvas-painted ones did.
 */

/** No crossfade frames: each set goes straight from its flat stand-in to the painted maps. */
const FADE_STEPS: number[] = [];
/** Longest a painted set waits for the rest of the queue before it is shown anyway (a slow worker never stalls the view). */
const HOLD_MS = 1500;
/** Workers that never say they are ready within this time are given up on. */
const READY_TIMEOUT_MS = 10000;

interface Job {
  id: number;
  key: string;
  set: PBRSet;
  make: () => PBRSet;
  /** Current image width of each map, to know when the GL texture must be reallocated. */
  sizes: number[];
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
}

interface Apply {
  job: Job;
  /** Worker frames (the painted set is the last), or null to paint the set here (the worker failed). */
  frames: Frame[] | null;
  /** When the painted set came back (performance.now()). */
  due: number;
}

let state: 'unknown' | 'on' | 'off' = 'unknown';
let slots: Slot[] = [];
let nextId = 1;
const waiting: Job[] = [];
const applying: Apply[] = [];
let raf = 0;
const listeners = new Set<() => void>();

/** Call `fn` whenever painted maps were swapped in (the view draws on demand, so it must redraw). */
export function onTexturesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Measurements for tests and the console: `window.__gsTextures`. */
const stats = { requested: 0, painted: 0, fromCache: 0, fallback: 0, firstMs: 0, lastMs: 0, workers: 0 };
const t0 = performance.now();

function supported(): boolean {
  if (typeof Worker === 'undefined' || typeof ImageData === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('texworker') !== '0';
  } catch {
    return true;
  }
}

function start(): boolean {
  if (!supported()) return false;
  const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
  try {
    for (let i = 0; i < n; i++) {
      // Written out in full so Vite bundles the worker (and esbuild leaves it alone).
      const w = new Worker(new URL('./textures.worker.ts', import.meta.url), { type: 'module' });
      const slot: Slot = { w, ready: false, dead: false, job: null };
      w.onmessage = (e) => onMessage(slot, e.data);
      w.onerror = (e) => {
        e.preventDefault?.();
        workerDied(slot);
      };
      slots.push(slot);
    }
  } catch {
    for (const s of slots) s.w.terminate();
    slots = [];
    return false;
  }
  stats.workers = slots.length;
  setTimeout(() => slots.forEach((s) => !s.ready && workerDied(s)), READY_TIMEOUT_MS);
  return true;
}

function onMessage(slot: Slot, d: { type: string; id?: number; frames?: Frame[]; fromCache?: boolean; message?: string }) {
  if (d.type === 'ready') {
    slot.ready = true;
    pump();
    return;
  }
  const job = slot.job;
  if (!job || d.id !== job.id) return;
  slot.job = null;
  if (d.type === 'done' && d.frames?.length) {
    if (d.fromCache) stats.fromCache++;
    else stats.painted++;
    queueApply(job, d.frames);
  } else {
    if (d.message) console.warn(`Growth Studio: texture worker could not paint ${job.key} (${d.message}); painting it here.`);
    queueApply(job, null);
  }
  pump();
}

function workerDied(slot: Slot) {
  if (slot.dead) return;
  slot.dead = true;
  slot.w.terminate();
  if (slot.job) waiting.unshift(slot.job);
  slot.job = null;
  if (slots.every((s) => s.dead)) {
    // No worker can run here (old browser, blocked script, a build without the worker file):
    // finish what is pending on the main thread and paint everything there from now on.
    state = 'off';
    if (waiting.length) console.warn('Growth Studio: texture worker unavailable; painting textures on the main thread.');
    for (const job of waiting.splice(0)) queueApply(job, null);
  } else pump();
}

function pump() {
  for (const s of slots) {
    if (!s.ready || s.dead || s.job || !waiting.length) continue;
    const job = waiting.shift()!;
    s.job = job;
    const flat = [job.set.map, job.set.normalMap, job.set.roughnessMap].map((t) => (t.userData.flat as number[]) ?? [128, 128, 128]);
    s.w.postMessage({ type: 'paint', id: job.id, key: job.key, flat, steps: FADE_STEPS });
  }
}

function queueApply(job: Job, frames: Frame[] | null) {
  applying.push({ job, frames, due: performance.now() });
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  const busy = waiting.length > 0 || slots.some((sl) => !sl.dead && sl.job);
  const oldest = applying.reduce((m, a) => Math.min(m, a.due), Infinity);
  if (applying.length && (!busy || now - oldest >= HOLD_MS)) {
    // Everything painted so far lands in this one frame.
    for (const a of applying.splice(0)) {
      if (!a.frames) {
        stats.fallback++;
        const painted = a.job.make();
        swap(a.job, [painted.map.image, painted.normalMap.image, painted.roughnessMap.image] as TexImageSource[], true);
      } else {
        const f = a.frames[a.frames.length - 1];
        swap(a.job, f.maps.map((m) => new ImageData(new Uint8ClampedArray(m), f.size, f.size)), true);
        a.frames.length = 0;
      }
      finish(a.job);
    }
    for (const fn of listeners) fn();
  }
  if (applying.length && !raf) raf = requestAnimationFrame(tick);
}

/** Put new images into a set's maps and every clone of them. */
function swap(job: Job, images: TexImageSource[], flipY: boolean) {
  const maps = [job.set.map, job.set.normalMap, job.set.roughnessMap];
  maps.forEach((t, i) => {
    const img = images[i] as { width: number };
    const group = (t as PendingTexture).group ?? new Set([t]);
    // A new size needs a new GL texture (three allocates immutable storage), so release the old one.
    const resize = img.width !== job.sizes[i];
    for (const g of group) {
      if (resize) g.dispose();
      g.flipY = flipY;
      g.needsUpdate = true;
    }
    // Clones share the original's image source, so this reaches them all.
    t.image = img;
    job.sizes[i] = img.width;
  });
}

function finish(job: Job) {
  for (const t of [job.set.map, job.set.normalMap, job.set.roughnessMap]) {
    const p = t as PendingTexture;
    p.group?.clear();
    p.group = null;
    delete t.userData.flat;
  }
  stats.lastMs = Math.round(performance.now() - t0);
  stats.firstMs ||= stats.lastMs;
}

setTexturePainter({
  available() {
    if (state === 'unknown') state = start() ? 'on' : 'off';
    return state === 'on';
  },
  request(key, set, make) {
    stats.requested++;
    waiting.push({ id: nextId++, key, set, make, sizes: [2, 2, 2] });
    pump();
  },
});

(globalThis as { __gsTextures?: unknown }).__gsTextures = stats;
