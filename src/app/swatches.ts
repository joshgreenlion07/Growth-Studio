// Swatch pictures for the material panel, made from the 3D material itself: no image files, no maker photos. A
// catalog material's swatch is its painted albedo (the same texture the 3D view uses, painted in the texture worker);
// a plant's is the plant picker's rendered picture; a pool shows its tile. Each is a 256 px JPEG data URL, made once
// per material and kept for the session. Swatches are drawn when the page is idle, from the painted map's 256 px mip
// level (made in the texture worker), so pointing at a new material never costs the frame that notices it.
import { materialById, type LayingPattern } from '../siteplan/catalog';
import { pointKind } from '../siteplan/material-info';
import { materialTextures } from '../engine/surfaces';
import { onTexturesChanged, wantForSwatch } from '../engine/texture-jobs';
import type * as THREE from 'three';
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
      idle(() => res(draw(set.map)));
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
  if (ric) ric(fn, { timeout: 120 });
  else window.setTimeout(fn, 0);
}

/**
 * A square crop of the painted map, scaled to SIZE, as a JPEG. Maps painted in the worker carry their mip chain (RGBA
 * bytes, rows bottom first, see texture-jobs.ts): the level nearest SIZE is drawn, a few hundred kilobytes at most.
 * Maps painted here are canvases.
 */
function draw(tex: THREE.Texture): string | null {
  const img = tex.image as unknown;
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  type Level = { data?: unknown; width: number; height: number };
  const levels = (tex.mipmaps ?? []) as unknown as Level[];
  const raw = levels.length ? levels : [img as Level];
  if (raw[0]?.data instanceof Uint8Array || raw[0]?.data instanceof Uint8ClampedArray) {
    const lv = raw.find((l) => l.width <= SIZE) ?? raw[raw.length - 1];
    const w = lv.width;
    // A stand-in is 2 px across: nothing worth showing.
    if (raw[0].width < 16 || !lv.data || lv.height !== w) return null;
    const t = document.createElement('canvas');
    t.width = t.height = w;
    t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(lv.data as Uint8Array), w, w), 0, 0);
    // Rows are bottom first: draw it upside down.
    g.translate(0, SIZE);
    g.scale(1, -1);
    g.drawImage(t, 0, 0, w, w, 0, 0, SIZE, SIZE);
    return c.toDataURL('image/jpeg', 0.86);
  }
  let src: CanvasImageSource | null = null;
  if (img instanceof ImageData) {
    const t = document.createElement('canvas');
    t.width = img.width;
    t.height = img.height;
    t.getContext('2d')!.putImageData(img, 0, 0);
    src = t;
  } else if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) src = img;
  if (!src) return null;
  const w = (src as { width: number }).width;
  if (!w || w < 16) return null;
  g.drawImage(src, 0, 0, w, w, 0, 0, SIZE, SIZE);
  return c.toDataURL('image/jpeg', 0.86);
}
