import { materialById } from './catalog';
import { DECK_DEFAULTS } from './decking';
import type { Zone } from './types';

/** True for a hardscape zone laid in a maker's deck boards (built board by board, see builder/deck.ts). */
export function isBoardDeck(z: Zone): boolean {
  return z.kind === 'hardscape' && !!materialById.get(z.catalogId)?.board;
}

/** Top of a deck's boards above grade, meters: its elevation, else the default; never below one board on sleepers. */
export function deckHeight(z: Zone): number {
  const b = materialById.get(z.catalogId)?.board;
  const min = (b ? b.thicknessIn * 0.0254 : 0.024) + 0.025;
  return Math.max(min, Math.min(3, z.elevation ?? DECK_DEFAULTS.height));
}

/** Top of a deck zone in the scene: its height, plus the hair per zone every paving zone gets (see zoneTop). */
export function deckTopOf(z: Zone, index: number): number {
  return deckHeight(z) + index * 0.0015;
}
