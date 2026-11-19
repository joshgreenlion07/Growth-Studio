import type { FeaturePlacement, SitePlan, Vec2 } from './types';

/**
 * The maker water and fire pieces (siteplan/waterfire.ts) on the surfaces a customer job's design book sets them on:
 * the Stone Forest flat-topped basalt fountain in a pebble bed that runs into a Basalite Premier Smooth patio
 * (Midnight Terrace, Charcoal border), with boulders round it and a Tru-Scapes up light; the Campania glazed birdbath
 * in Petrol and in Antique Glaze in a bark bed with blue fescue and Lomandra; and The Outdoor Plus Florence fire pit in
 * Chocolate in the middle of a crushed rock seating area (Lodi 3/8 in) edged with black steel. Best seen at Golden hour
 * and at Night (Hand tool: water, birdbath water, fire).
 */
export function sampleWaterFire(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const feat = (id: string, catalogId: string, position: Vec2, rotationDeg = 0, more: Partial<FeaturePlacement> = {}): FeaturePlacement => ({ id, source: S, catalogId, position, rotationDeg, ...more });
  const FENCE = 0.6;
  // The patio wraps round the front of the fountain's pebble bed (a notch 2.6 m wide, 1.9 m into the patio, its front
  // corners rounded as in the design book).
  const notch: Vec2[] = [];
  const nx0 = 2.0, nx1 = 4.6, ny0 = 3.2, ny1 = 5.1, rc = 0.55;
  notch.push([nx0, ny0]);
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * (Math.PI / 2);
    notch.push([nx0 + rc + Math.cos(a) * rc, ny1 - rc - Math.sin(a) * rc]);
  }
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * 1.5 + (k / 8) * (Math.PI / 2);
    notch.push([nx1 - rc + Math.cos(a) * rc, ny1 - rc - Math.sin(a) * rc]);
  }
  notch.push([nx1, ny0]);
  const W = 9 * (11.79 / 12) * 0.0254;
  // The seating area: 15 ft 3 in x 14 ft as in the design book, a rounded oval of crushed rock.
  const seat: Vec2[] = [];
  const cx = 13.2, cy = 4.7, rx = 4.65 / 2, ry = 4.27 / 2;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // A superellipse: squarer than an ellipse, as the drawn seating area.
    seat.push([cx + Math.sign(c) * Math.abs(c) ** 0.7 * rx, cy + Math.sign(s) * Math.abs(s) ** 0.7 * ry]);
  }
  return {
    schemaVersion: 1,
    site: { name: 'Water and fire: basalt fountain, glazed birdbaths, Florence fire pit', boundary: rect(0, 0, 16.2, 9.6), latitude: 37.95, longitude: -121.29, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bark', source: S, kind: 'bed', catalogId: 'walk-on-bark', polygon: rect(0, FENCE, 16.2, 9.6) },
      { id: 'pebble', source: S, kind: 'bed', catalogId: 'yosemite-tan-1-5', polygon: [[0.5, FENCE + 0.1], [6.6, FENCE + 0.1], [6.6, ny0], ...notch.slice().reverse(), [0.5, ny0]] },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'premier-smooth-midnight-terrace', laying: 'combo3', polygon: [[0.5, ny0], ...notch, [6.6, ny0], [6.6, 8.9], [0.5, 8.9]], border: { catalogId: 'premier-smooth-border-charcoal', width: W } },
      { id: 'seating', source: S, kind: 'bed', catalogId: 'crushed-gravel-3-8', polygon: seat },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, FENCE - 0.05], [16.2, FENCE - 0.05]], height: 1.85 },
      { id: 'seat-edge', source: S, kind: 'edging', catalogId: 'steel-edging-black-3-16', points: [...seat, seat[0]], height: 0.05 },
    ],
    water: [],
    plants: [
      ...[[7.6, 3.1], [9.1, 2.4], [10.1, 3.8], [8.0, 6.6], [10.2, 7.2]].map((p, i) => ({ id: `fescue${i}`, source: S, catalogId: 'blue-fescue', position: p as Vec2 })),
      ...[[8.4, 1.5], [10.4, 1.6], [12.4, 1.5], [14.2, 1.5], [1.3, 1.5], [5.6, 1.6]].map((p, i) => ({ id: `lomandra${i}`, source: S, catalogId: 'lomandra', position: p as Vec2 })),
    ],
    features: [
      // The fountain at the front of its bed; its own basin bed is off (the plan's pebble bed is there).
      feat('basalt-fountain', 'stone-forest-nf81-flat-top-basalt-fountain', [3.3, 3.75], 0, { options: { bed: false } }),
      // Boulders round it as in the design book: moss rocks with their moss off.
      feat('rock-left', 'moss-rock-rounded', [2.45, 3.35], 30, { options: { moss: false } }),
      feat('rock-right', 'moss-rock-flat-top', [4.2, 3.3], -20, { options: { moss: false } }),
      feat('rock-back', 'moss-rock-tall', [3.6, 2.7], 70, { options: { moss: false } }),
      // An up light in the pebbles 16 in in front of the stone, aimed low across its face.
      feat('fountain-light', 'truscapes-ts-b102', [3.3, 4.5], 180, { fixture: { tiltDeg: 55, finish: 'bronze' } }),
      // The birdbaths in the bark bed.
      feat('birdbath-petrol', 'campania-birdbath-6802-petrol', [8.6, 4.4]),
      feat('birdbath-antique', 'campania-birdbath-6802-antique-glaze', [9.8, 5.8]),
      feat('bath-light', 'truscapes-ts-b301', [7.7, 5.2], 0, { fixture: { finish: 'bronze' } }),
      // The fire pit in the middle of the seating area.
      feat('fire-pit', 'top-florence-fire-pit-42-chocolate', [cx, cy]),
    ],
  };
}
