import { runRecipe } from './texture-recipes';
import { clearTextureSets, type PaintedPixels } from './textures';

/**
 * The texture worker: paints procedural PBR sets off the main thread.
 *
 * Page -> worker  { type: 'paint', id, key, flat: [[r,g,b] albedo, [r,g,b] normal, [r,g,b] roughness], steps }
 * Worker -> page  { type: 'ready' } once loaded
 *                 { type: 'done', id, frames: [{ size, maps: [albedo, normal, roughness] }] }
 *                 { type: 'fail', id, message }
 *
 * Each map is RGBA bytes (an ArrayBuffer, transferred). The last frame is the
 * painted set; the ones before it are the crossfade from the flat stand-in
 * color (`steps` are the blend amounts), at half size to keep them light.
 *
 * Painted sets are kept in IndexedDB (gzip of the raw channels) under the
 * worker's own file name, which carries a content hash in the Vite build, so a
 * returning visitor gets them without painting and a new release paints anew.
 */

interface PaintJob {
  type: 'paint';
  id: number;
  key: string;
  flat: [number, number, number][];
  steps: number[];
}

interface Poster {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
const port = self as unknown as Poster & { onmessage: ((e: MessageEvent) => void) | null };

/** Bump when the stored layout changes. */
const CACHE_FORMAT = 1;
/** The stored sets are trimmed (oldest use first) to this many bytes. */
const CACHE_BUDGET = 256 * 1024 * 1024;
const DEV = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;
const BUILD = `${CACHE_FORMAT}:${self.location.pathname.split('/').pop()}`;

let queue: Promise<void> = Promise.resolve();
port.onmessage = (e: MessageEvent) => {
  const d = e.data as PaintJob;
  if (d?.type !== 'paint') return;
  queue = queue.then(() => run(d));
};
port.postMessage({ type: 'ready' });

async function run(job: PaintJob) {
  try {
    let px = await cacheGet(job.key);
    const fromCache = !!px;
    if (!px) {
      const set = runRecipe(job.key);
      clearTextureSets();
      const img = (t: unknown) => (t as { image?: { pixels?: PaintedPixels } }).image?.pixels;
      px = set ? img(set.map) ?? null : null;
      if (!px || img(set!.normalMap) !== px || img(set!.roughnessMap) !== px) {
        port.postMessage({ type: 'fail', id: job.id, message: `no worker recipe for ${job.key}` });
        return;
      }
    }
    const frames = framesFor(px, job);
    const transfer = frames.flatMap((f) => f.maps);
    port.postMessage({ type: 'done', id: job.id, fromCache, frames }, transfer);
    if (!fromCache) await cachePut(job.key, px);
  } catch (err) {
    port.postMessage({ type: 'fail', id: job.id, message: err instanceof Error ? err.message : String(err) });
  }
}

/* ------------------------------------------------------------------ */
/* Crossfade frames                                                     */

function framesFor(px: PaintedPixels, job: PaintJob) {
  const maps = [px.albedo, px.normal, px.rough];
  const frames: { size: number; maps: ArrayBuffer[] }[] = [];
  if (job.steps.length) {
    const half = px.size >= 512 ? px.size / 2 : px.size;
    const small = half === px.size ? maps : maps.map((m) => downsample(m, px.size));
    for (const t of job.steps) frames.push({ size: half, maps: small.map((m, i) => blend(m, job.flat[i], t)) });
  }
  // The painted maps themselves; copied so the cached arrays stay usable for storing.
  frames.push({ size: px.size, maps: maps.map((m) => m.slice().buffer) });
  return frames;
}

/** 2x2 box filter of a square RGBA map (it tiles, so no edge cases). */
function downsample(src: Uint8ClampedArray, size: number): Uint8ClampedArray {
  const h = size / 2;
  const out = new Uint8ClampedArray(h * h * 4);
  for (let y = 0; y < h; y++) {
    const r0 = y * 2 * size * 4, r1 = r0 + size * 4;
    for (let x = 0; x < h; x++) {
      const a = r0 + x * 8, b = r1 + x * 8, o = (y * h + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = (src[a + c] + src[a + 4 + c] + src[b + c] + src[b + 4 + c] + 2) >> 2;
    }
  }
  return out;
}

function blend(src: Uint8ClampedArray, flat: [number, number, number], t: number): ArrayBuffer {
  const out = new Uint8ClampedArray(src.length);
  const f0 = flat[0] * (1 - t), f1 = flat[1] * (1 - t), f2 = flat[2] * (1 - t);
  for (let o = 0; o < src.length; o += 4) {
    out[o] = f0 + src[o] * t;
    out[o + 1] = f1 + src[o + 1] * t;
    out[o + 2] = f2 + src[o + 2] * t;
    out[o + 3] = 255;
  }
  return out.buffer;
}

/* ------------------------------------------------------------------ */
/* IndexedDB cache                                                      */

const canCache = !DEV && typeof indexedDB !== 'undefined' && typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
let dbp: Promise<IDBDatabase | null> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

function db(): Promise<IDBDatabase | null> {
  if (!canCache) return Promise.resolve(null);
  dbp ??= new Promise<IDBDatabase | null>((ok) => {
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open('growth-studio-textures', 1);
    } catch {
      return ok(null);
    }
    open.onupgradeneeded = () => {
      open.result.createObjectStore('meta', { keyPath: 'k' });
      open.result.createObjectStore('data');
    };
    open.onsuccess = () => ok(open.result);
    open.onerror = () => ok(null);
    open.onblocked = () => ok(null);
  }).then(async (d) => {
    if (d) await prune(d, 0).catch(() => {});
    return d;
  });
  return dbp;
}

interface Meta {
  k: string;
  build: string;
  bytes: number;
  used: number;
}

/** Drop sets from other releases, then the least recently used ones until `adding` more bytes fit the budget. */
async function prune(d: IDBDatabase, adding: number) {
  const metas = await req(d.transaction('meta').objectStore('meta').getAll() as IDBRequest<Meta[]>);
  const drop: string[] = [];
  let total = adding;
  const keep = metas.filter((m) => (m.build === BUILD ? true : (drop.push(m.k), false)));
  for (const m of keep) total += m.bytes;
  keep.sort((a, b) => a.used - b.used);
  for (const m of keep) {
    if (total <= CACHE_BUDGET) break;
    drop.push(m.k);
    total -= m.bytes;
  }
  if (!drop.length) return;
  const tx = d.transaction(['meta', 'data'], 'readwrite');
  for (const k of drop) {
    tx.objectStore('meta').delete(k);
    tx.objectStore('data').delete(k);
  }
  await new Promise<void>((ok) => { tx.oncomplete = tx.onerror = tx.onabort = () => ok(); });
}

async function squeeze(bytes: Uint8Array, mode: 'gzip', pack: boolean): Promise<Uint8Array> {
  const s = pack ? new CompressionStream(mode) : new DecompressionStream(mode);
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(s);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function cacheGet(key: string): Promise<PaintedPixels | null> {
  try {
    const d = await db();
    if (!d) return null;
    const tx = d.transaction(['meta', 'data']);
    const [meta, packed] = (await Promise.all([req(tx.objectStore('meta').get(key)), req(tx.objectStore('data').get(key))])) as [Meta | undefined, ArrayBuffer | undefined];
    if (!meta || meta.build !== BUILD || !packed) return null;
    d.transaction('meta', 'readwrite').objectStore('meta').put({ ...meta, used: Date.now() });
    const raw = await squeeze(new Uint8Array(packed), 'gzip', false);
    // Layout: u32 size, then albedo RGB, normal RGB, roughness (one channel).
    const size = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
    const n = size * size;
    if (raw.length !== 4 + n * 7) return null;
    const albedo = new Uint8ClampedArray(n * 4), normal = new Uint8ClampedArray(n * 4), rough = new Uint8ClampedArray(n * 4);
    let a = 4, b = 4 + n * 3, c = 4 + n * 6;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      albedo[o] = raw[a++]; albedo[o + 1] = raw[a++]; albedo[o + 2] = raw[a++]; albedo[o + 3] = 255;
      normal[o] = raw[b++]; normal[o + 1] = raw[b++]; normal[o + 2] = raw[b++]; normal[o + 3] = 255;
      const r = raw[c++];
      rough[o] = r; rough[o + 1] = r; rough[o + 2] = r; rough[o + 3] = 255;
    }
    return { size, albedo, normal, rough };
  } catch {
    return null;
  }
}

async function cachePut(key: string, px: PaintedPixels) {
  try {
    const d = await db();
    if (!d) return;
    const n = px.size * px.size;
    const raw = new Uint8Array(4 + n * 7);
    new DataView(raw.buffer).setUint32(0, px.size, true);
    let a = 4, b = 4 + n * 3, c = 4 + n * 6;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      raw[a++] = px.albedo[o]; raw[a++] = px.albedo[o + 1]; raw[a++] = px.albedo[o + 2];
      raw[b++] = px.normal[o]; raw[b++] = px.normal[o + 1]; raw[b++] = px.normal[o + 2];
      raw[c++] = px.rough[o];
    }
    const packed = await squeeze(raw, 'gzip', true);
    await prune(d, packed.byteLength);
    const tx = d.transaction(['meta', 'data'], 'readwrite');
    tx.objectStore('data').put(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), key);
    tx.objectStore('meta').put({ k: key, build: BUILD, bytes: packed.byteLength, used: Date.now() } satisfies Meta);
    await new Promise<void>((ok) => { tx.oncomplete = tx.onerror = tx.onabort = () => ok(); });
  } catch {
    // A full disk or private browsing: the set is simply painted again next time.
  }
}
