import { materialById, type LayingPattern } from '../siteplan/catalog';
import { rockSet } from '../builder/materials';
import { cortenSet, materialTextures, porcelainPanelSet, slabSet, soilTextures, wallCapTextures } from './surfaces';
import { asphalt, bark, poolTile, roofTile, stucco, type PBRSet } from './textures';
import { cl5gRecipe } from '../builder/saunalife-cl5g-textures';
import { ledgerStoneSet, patinaBowlSet, pillarStuccoSet } from './fountain-surfaces';
import { rockGrainSet } from './rock-surfaces';

/**
 * The texture worker's side of `textureSet`: rebuild a set from its cache key
 * alone (the page cannot send the recipe itself). Every key `WORKER_KEYS`
 * accepts must resolve here; anything else returns null and the page paints
 * it on the main thread.
 */
export function runRecipe(key: string): PBRSet | null {
  const mat = /^mat:([^:]+)(?::(.+))?$/.exec(key);
  if (mat) {
    const spec = materialById.get(mat[1]);
    return spec ? materialTextures(spec, mat[2] as LayingPattern | undefined) : null;
  }
  const slab = /^slab:([^:]+)(?::(\d+(?:\.\d+)?))?$/.exec(key);
  if (slab) {
    const spec = materialById.get(slab[1]);
    return spec ? slabSet(spec, slab[2] ? +slab[2] : 24) : null;
  }
  const cap = /^cap:(.+)$/.exec(key);
  if (cap) {
    const spec = materialById.get(cap[1]);
    return spec ? wallCapTextures(spec) : null;
  }
  if (key.startsWith('cl5g-')) return cl5gRecipe(key);
  const named: Record<string, () => PBRSet> = {
    soil: soilTextures,
    corten: cortenSet,
    porcelainPanel: porcelainPanelSet,
    rock: rockSet,
    stucco,
    roofTile,
    bark,
    asphalt,
    poolTile,
    'pf-stucco': pillarStuccoSet,
    'pf-ledger': ledgerStoneSet,
    'pf-bowl': patinaBowlSet,
    'rk-grain': rockGrainSet,
  };
  return named[key]?.() ?? null;
}
