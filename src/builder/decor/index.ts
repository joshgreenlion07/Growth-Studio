import { CEILING_KINDS, type DecorKind } from '../../siteplan/decor';
import type { DecorContext } from './kit';
import { cortenPlanterTall } from './planters';
import { cortenTreePanel } from './tree-panel';
import { firePitLinear } from './fire-pit';
import { loungeOttoman, loungeSofa } from './lounge';
import { deckBox } from './deck-box';
import { ceilingFan, diningSling, patioHeater } from './patio';

/**
 * Builds one decor feature (catalog `DECOR_FEATURES`) into the feature builder's parts. A piece set on paving stands on
 * the paving's top (`lift`), not on the grade under it; ceiling-hung pieces keep the cover's own height.
 */
export function buildDecor(kind: DecorKind, c0: DecorContext) {
  const up = CEILING_KINDS.includes(kind) ? 0 : (c0.lift ?? 0);
  const c: DecorContext = up ? {
    ...c0,
    add: (m, g) => c0.add(m, g.translate(0, up, 0)),
    light: (x, y, z, ...rest) => c0.light(x, y + up, z, ...rest),
    fire: (tongues, style) => c0.fire(tongues.map((t) => ({ ...t, y: t.y + up })), style),
  } : c0;
  switch (kind) {
    case 'cortenPlanterTall': return cortenPlanterTall(c);
    case 'cortenTreePanel': return cortenTreePanel(c);
    case 'firePitLinear': return firePitLinear(c);
    case 'loungeSofa': return loungeSofa(c);
    case 'loungeOttoman': return loungeOttoman(c);
    case 'deckBox': return deckBox(c);
    case 'diningSling': return diningSling(c);
    case 'patioHeater': return patioHeater(c);
    case 'ceilingFan': return ceilingFan(c);
  }
}

export type { DecorContext } from './kit';
