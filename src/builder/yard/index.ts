import type { YardKind } from '../../siteplan/yard';
import type { YardContext } from './kit';
import { suncastShed } from './shed';
import { gardenBench } from './bench';
import { cedarRaisedBed } from './raisedbed';
import { potTrellis } from './pottrellis';
import { slatScreen } from './screen';

/**
 * Builds one side-yard piece (siteplan/yard.ts) into the feature builder's parts. A piece set on paving (the shed on
 * its paver pad) stands on the paving's top (`lift`), not on the grade under it: every part, hinge, anchor, light and
 * plant moves up with it.
 */
export function buildYard(kind: YardKind, c0: YardContext, lift = 0) {
  const up = lift;
  const c: YardContext = up ? {
    ...c0,
    add: (m, g) => c0.add(m, g.translate(0, up, 0)),
    light: (x, y, z, ...rest) => c0.light(x, y + up, z, ...rest),
    hinge: (px, py, pz) => {
      const h = c0.hinge(px, py + up, pz);
      return { group: h.group, add: (m, g) => h.add(m, g.translate(0, up, 0)), anchor: (x, y, z) => h.anchor(x, y + up, z) };
    },
    anchor: (x, y, z) => c0.anchor(x, y + up, z),
    plant: (id, x, y, z, heading) => c0.plant(id, x, y + up, z, heading),
  } : c0;
  switch (kind) {
    case 'shedResin': return suncastShed(c);
    case 'gardenBench': return gardenBench(c);
    case 'raisedBedCedar': return cedarRaisedBed(c);
    case 'potTrellis': return potTrellis(c);
    case 'slatScreen': return slatScreen(c);
  }
}

export type { YardContext } from './kit';
