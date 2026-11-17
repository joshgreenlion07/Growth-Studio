// Swatch pictures for the material panel, made from the 3D material itself: no image files, no maker photos. A
// catalog material's swatch is its painted albedo (the same texture the 3D view uses, painted in the texture worker);
// a plant's is the plant picker's rendered picture; a pool shows its tile. Each is a 256 px JPEG data URL, made once
// per material and kept for the session. Swatches are drawn when the page is idle, from a scaled copy made off the main
// thread (createImageBitmap), so pointing at a new material never costs the frame that notices it.
import { materialById, type LayingPattern } from '../siteplan/catalog';
import { pointKind } from '../siteplan/material-info';
import { materialTextures } from '../engine/surfaces';
import { onTexturesChanged, wantForSwatch } from '../engine/texture-jobs';
import { poolTile, type PBRSet } from '../engine/textures';
import { wantThumb } from './plantthumbs';

const SIZE = 256;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** The swatch if it is made already. */
export const swatchNow = (catalogId: string, laying?: LayingPattern) => cache.get(key(catalogId, laying));

const key = (id: string, laying?: string) => (laying ? `${id}:${laying}` : id);

/** The swatch for what the pointer is on (a catalog material or `<kind>:<id>`), or null when there is none to make. */
export function swatchFor(catalogId: string, laying?: LayingPattern): Promise<string | null> {
  const k = key(catalogId, laying);
  const have = cache.get(k);
  if (have) return Promise.resolve(have);
  let p = pending.get(k);
  if (p) return p;
  p = make(catalogId, laying).then((url) => {
    pending.delete(k);
    if (url) cache.set(k, url);
    return url;
  }, () => {
    pending.delete(k);
    return null;
  });
  pending.set(k, p);
  return p;
}

function make(catalogId: string, laying?: LayingPattern): Promise<string | null> {
  const [kind, id] = pointKind(catalogId);
  if (kind === 'plant') return new Promise((res) => wantThumb(id, res, () => res(null)));
  if (kind === 'water' && id === 'pool') return fromSet(poolTile());
  if (kind !== 'material') return Promise.resolve(null);
  const spec = materialById.get(id);
  return spec ? fromSet(materialTextures(spec, laying)) : Promise.resolve(null);
}

/** The set's albedo once painted (the worker swaps it in place; a stand-in carries `userData.flat` until then). */
function fromSet(set: PBRSet): Promise<string | null> {
  return new Promise((res) => {
    let off: (() => void) | null = null;
    const timer = window.setTimeout(() => done(), 20000);
    const done = () => {
      off?.();
      clearTimeout(timer);
      idle(() => draw(set.map.image as unknown).then(res, () => res(null)));
    };
    const ready = () => !set.map.userData.flat;
    if (ready()) return done();
    wantForSwatch(set);
    off = onTexturesChanged(() => { if (ready()) done(); });
  });
}

/** Run `fn` when the page is idle (soon in any case). */
function idle(fn: () => void) {
  const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 300 });
  else window.setTimeout(fn, 0);
}

/**
 * A square crop of the painted map, scaled to SIZE, as a JPEG. Painted maps arrive as RGBA bytes, rows bottom first
 * (see texture-jobs.ts); maps painted here are canvases.
 */
async function draw(img: unknown): Promise<string | null> {
  if (!img) return null;
  let src: CanvasImageSource | null = null;
  let flip = false;
  let own: ImageBitmap | null = null;
  const raw = img as { data?: ArrayBufferView; width?: number; height?: number };
  if (raw.data instanceof Uint8Array || raw.data instanceof Uint8ClampedArray) {
    const w = raw.width ?? 0;
    if (w < 16 || raw.height !== w) return null;
    const pixels = new ImageData(new Uint8ClampedArray(raw.data.buffer as ArrayBuffer, raw.data.byteOffset, w * w * 4), w, w);
    if (typeof createImageBitmap === 'function') {
      try {
        src = own = await createImageBitmap(pixels, { resizeWidth: SIZE, resizeHeight: SIZE, resizeQuality: 'high', imageOrientation: 'flipY' });
      } catch {
        src = null;
      }
    }
    if (!src) {
      const t = document.createElement('canvas');
      t.width = t.height = w;
      t.getContext('2d')!.putImageData(pixels, 0, 0);
      src = t;
      flip = true;
    }
  } else if (img instanceof ImageData) {
    const t = document.createElement('canvas');
    t.width = img.width;
    t.height = img.height;
    t.getContext('2d')!.putImageData(img, 0, 0);
    src = t;
  } else if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) src = img;
  if (!src) return null;
  const w = (src as { width: number }).width;
  // A stand-in is 2 px across: nothing worth showing.
  if (!w || w < 16) return null;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  if (flip) {
    g.translate(0, SIZE);
    g.scale(1, -1);
  }
  g.drawImage(src, 0, 0, w, w, 0, 0, SIZE, SIZE);
  own?.close();
  return c.toDataURL('image/jpeg', 0.86);
}
