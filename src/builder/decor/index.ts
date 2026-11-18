import type { DecorKind } from '../../siteplan/decor';
import type { DecorContext } from './kit';
import { cortenPlanterTall } from './planters';
import { cortenTreePanel } from './tree-panel';
import { firePitLinear } from './fire-pit';
import { loungeOttoman, loungeSofa } from './lounge';
import { deckBox } from './deck-box';

/** Builds one decor feature (catalog `DECOR_FEATURES`) into the feature builder's parts. */
export function buildDecor(kind: DecorKind, c: DecorContext) {
  switch (kind) {
    case 'cortenPlanterTall': return cortenPlanterTall(c);
    case 'cortenTreePanel': return cortenTreePanel(c);
    case 'firePitLinear': return firePitLinear(c);
    case 'loungeSofa': return loungeSofa(c);
    case 'loungeOttoman': return loungeOttoman(c);
    case 'deckBox': return deckBox(c);
  }
}

export type { DecorContext } from './kit';
