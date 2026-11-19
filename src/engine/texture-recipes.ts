import { materialById, type LayingPattern } from '../siteplan/catalog';
import { rockSet } from '../builder/materials';
import { cortenSet, flagFaceSet, materialTextures, padSet, paverEdgePixels, porcelainPanelSet, slabSet, soilTextures, wallCapTextures } from './surfaces';
import { asphalt, bark, poolTile, roofTile, stucco, type PBRSet } from './textures';
import { cl5gRecipe } from '../builder/saunalife-cl5g-textures';
import { ledgerStoneSet, patinaBowlSet, pillarStuccoSet, silverTravertineLedgerSet } from './fountain-surfaces';
import { rockGrainSet } from './rock-surfaces';
import { houseStucco, roofRecipe } from './house-surfaces';

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
  // slab:<look> (24 x 24), slab:<look>:<side> (a square slab, e.g. a pad), slab:<look>:<w>x<d>
  const slab = /^slab:([^:]+)(?::(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?)?$/.exec(key);
  if (slab) {
    const spec = materialById.get(slab[1]);
    return spec ? (slab[2] ? slabSet(spec, +slab[2], slab[3] ? +slab[3] : +slab[2]) : slabSet(spec)) : null;
  }
  const pad = /^pad:(.+)$/.exec(key);
  if (pad) {
    const spec = materialById.get(pad[1]);
    return spec ? padSet(spec) : null;
  }
  const flag = /^flag:(.+)$/.exec(key);
  if (flag) {
    const spec = materialById.get(flag[1]);
    return spec ? flagFaceSet(spec) : null;
  }
  const cap = /^cap:(.+)$/.exec(key);
  if (cap) {
    const spec = materialById.get(cap[1]);
    return spec ? wallCapTextures(spec) : null;
  }
  if (key.startsWith('cl5g-')) return cl5gRecipe(key);
  if (key.startsWith('house-roof:')) return roofRecipe(key.slice('house-roof:'.length));
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
    'ww-ledger-silver': silverTravertineLedgerSet,
    'pf-bowl': patinaBowlSet,
    'rk-grain': rockGrainSet,
    'house-stucco': houseStucco,
  };
  return named[key]?.() ?? null;
}

/**
 * The worker's side of a detailed paver's edge map (engine/paver-detail.ts): `src` is PaverEdges.src, the look's
 * catalog id and laying pattern ("id|laying"). Null when the look has no edge map.
 */
export function runEdgeRecipe(src: string): Uint8Array | null {
  const [id, laying] = src.split('|');
  const spec = materialById.get(id);
  return spec ? paverEdgePixels(spec, (laying || undefined) as LayingPattern | undefined) : null;
}
