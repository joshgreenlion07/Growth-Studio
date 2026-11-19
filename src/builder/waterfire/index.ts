import { birdbathGlazeOf, type WaterFireKind } from '../../siteplan/waterfire';
import { lifted, type WaterFireContext } from './kit';
import { basaltFountain } from './basalt';
import { birdbath } from './birdbath';
import { florenceFirePit } from './florence';

/**
 * Builds one of the maker water and fire pieces (siteplan/waterfire.ts) into the feature builder's parts. Set on paving
 * it stands on the paving's top (`lift`), not on the grade under it: its water, flames, lights, pebbles and Hand-tool
 * anchors move up with it. In a bed it stands at grade, its foot a little down in the bed's pebbles, bark or rock.
 */
export function buildWaterFire(kind: WaterFireKind, c0: WaterFireContext, lift = 0) {
  const c = lifted(c0, lift);
  switch (kind) {
    case 'basaltFountain': return basaltFountain(c);
    case 'birdbath': return birdbath(c, birdbathGlazeOf(c.spec));
    case 'roundFirePit': return florenceFirePit(c);
  }
}

export type { WaterFireContext } from './kit';
