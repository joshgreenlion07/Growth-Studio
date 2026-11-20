// Feature pictures for the Library cards. The renderer (and Three.js scene) is loaded only when a picture is first
// wanted, then pictures are made one at a time so the 3D view stays smooth, and cached for the rest of the session.
import { featureById } from '../siteplan/catalog';

const BIG = 640;
const cache = new Map<string, string>();
const waiting = new Map<string, Set<(url: string) => void>>();
const failed = new Set<string>();
const queue: string[] = [];
let running = false;
let releaseT = 0;

/** The picture if it is ready yet. */
export const featureThumbUrl = (id: string): string | undefined => cache.get(id);

/** The material panel's larger picture of a feature (key `big:<id>` in the same queue and cache). */
export const wantFeaturePicture = (id: string, done: (url: string) => void) => wantFeatureThumb(`big:${id}`, done);

/** Call back with the picture as soon as it exists, and make sure it is queued (`front`: next in line, for pictures
 *  someone is looking at now, such as the planner's feature picker cards on screen). */
export function wantFeatureThumb(id: string, done: (url: string) => void, front = false): void {
  const have = cache.get(id);
  if (have) return done(have);
  if (failed.has(id)) return;
  let set = waiting.get(id);
  if (!set) waiting.set(id, (set = new Set()));
  set.add(done);
  const at = queue.indexOf(id);
  if (front) {
    if (at >= 0) queue.splice(at, 1);
    queue.unshift(id);
  } else if (at < 0) queue.push(id);
  void pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    const r = await import('./featurethumbs-render');
    while (queue.length) {
      const id = queue.shift()!;
      const big = id.startsWith('big:');   // the material panel's larger picture (key `big:<id>`)
      const spec = featureById.get(big ? id.slice(4) : id);
      if (!spec || cache.has(id)) {
        if (!spec) failed.add(id);
        waiting.delete(id);
        continue;
      }
      try {
        const url = r.renderFeatureThumb(spec, big ? BIG : undefined);
        cache.set(id, url);
        for (const f of waiting.get(id) ?? []) f(url);
      } catch (err) {
        failed.add(id);
        console.warn('Feature picture failed for', id, err);
      }
      waiting.delete(id);
      await new Promise((res) => setTimeout(res, 30));
    }
    // keep the WebGL rig a few seconds: the planner's picker asks again as cards scroll into view
    clearTimeout(releaseT);
    releaseT = window.setTimeout(() => { if (!running) r.releaseFeatureThumbRenderer(); }, 5000);
  } catch (err) {
    console.warn('Feature pictures unavailable', err);
    // Nothing more will be drawn this time; a later request tries again.
    queue.length = 0;
    waiting.clear();
  } finally {
    running = false;
  }
}
