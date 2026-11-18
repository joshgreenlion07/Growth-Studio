import type { FeaturePlacement, SitePlan, Vec2 } from './types';

/**
 * Every kind of fire side by side on one patio, to see the flames together: the rectangular charcoal concrete fire
 * pit with its 28 in line burner (between two lounge sofas, as on the job it was drawn from), the round stone fire
 * pit with a ring burner under lava rock, the rectangular fire table, The Outdoor Plus Cazo fire and water bowl, and a
 * straight outdoor kitchen whose grill is lit by hand (Hand tool: open the lid, then light the burners). Best seen at
 * Blue hour or Night.
 */
export function sampleFire(): SitePlan {
  const S = 'sample' as const;
  const fenceY = 1.0;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const feat = (id: string, catalogId: string, position: Vec2, rotationDeg = 0): FeaturePlacement => ({ id, source: S, catalogId, position, rotationDeg });
  return {
    schemaVersion: 1,
    site: { name: 'Fire: line burner fire pit, ring fire pit, fire table, fire and water bowl, grill', boundary: rect(0, 0, 14, 10), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [],
    zones: [
      { id: 'bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0.3, fenceY + 0.05, 13.7, 2.1) },
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-gray-charcoal', polygon: rect(0.3, 2.1, 13.7, 9.7), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [
      { id: 'fence', source: S, kind: 'fence', catalogId: 'fence-gray-lattice', points: [[0, fenceY], [14, fenceY]], height: 2.0 },
    ],
    water: [],
    plants: [
      ...[0.9, 3.4, 5.9, 8.4, 10.9, 13.2].map((x, i) => ({ id: `juniper${i}`, source: S, catalogId: 'blue-juniper-column', position: [x, fenceY + 0.5] as Vec2 })),
      ...[2.15, 4.65, 9.65, 12.05].map((x, i) => ({ id: `grass${i}`, source: S, catalogId: 'lomandra', position: [x, fenceY + 0.6] as Vec2 })),
    ],
    features: [
      // The job's lounge: the 60 x 30 in pit between two sofas.
      feat('fire-pit-linear', 'fire-pit-concrete-linear', [3.2, 6.4]),
      feat('sofa-back', 'lounge-sofa-white-aluminum', [3.2, 5.0], 0),
      feat('sofa-front', 'lounge-sofa-white-aluminum', [3.2, 7.8], 180),
      feat('fire-pit-round', 'fire-pit', [7.3, 6.4]),
      feat('fire-table', 'fire-table', [10.9, 6.4]),
      feat('kitchen', 'kitchen-straight', [7.3, 2.65], 0),
      feat('fire-water-bowl', 'top-cazo-fire-water-bowl-31', [12.4, 3.2], 0),
    ],
  };
}
