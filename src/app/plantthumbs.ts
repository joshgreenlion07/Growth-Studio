// Plant pictures for the plant picker. The renderer (and Three.js scene) is loaded
// only when a picture is first wanted, then pictures are made one at a time so the
// 3D view stays smooth, and cached for the rest of the session.
import { PLANTS, plantById } from '../siteplan/catalog';

const cache = new Map<string, string>();
const waiting = new Map<string, Set<(url: string) => void>>();
const failed = new Set<string>();
const queue: string[] = [];
let running = false;

/** The picture if it is ready yet. */
export const thumbUrl = (id: string) => cache.get(id);

/** Call back with the picture as soon as it exists, and make sure it is queued. */
export function wantThumb(id: string, done: (url: string) => void) {
  const have = cache.get(id);
  if (have) return done(have);
  if (failed.has(id)) return;
  let set = waiting.get(id);
  if (!set) waiting.set(id, (set = new Set()));
  set.add(done);
  if (!queue.includes(id)) queue.push(id);
  void pump();
}

/** Start making every picture in the background, the given plant first. */
export function prefetchThumbs(first?: string) {
  const order = PLANTS.map((p) => p.id).filter((id) => !cache.has(id) && !failed.has(id) && !queue.includes(id));
  if (first && !cache.has(first) && !failed.has(first)) {
    const i = queue.indexOf(first);
    if (i >= 0) queue.splice(i, 1);
    queue.unshift(first);
  }
  queue.push(...order.filter((id) => id !== first));
  void pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    const r = await import('./plantthumbs-render');
    while (queue.length) {
      const id = queue.shift()!;
      const spec = plantById.get(id);
      if (!spec || cache.has(id)) continue;
      try {
        const url = r.renderThumb(spec);
        cache.set(id, url);
        for (const f of waiting.get(id) ?? []) f(url);
      } catch (err) {
        failed.add(id);
        console.warn('Plant picture failed for', id, err);
      }
      waiting.delete(id);
      await new Promise((res) => setTimeout(res, 30));
    }
    r.releaseThumbRenderer();
  } catch (err) {
    console.warn('Plant pictures unavailable', err);
    queue.length = 0;
  } finally {
    running = false;
  }
}
