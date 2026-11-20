import { INFRATECH_SIZES } from './infratech';
import type { SitePlan, Vec2 } from './types';

/**
 * Infratech heaters and Blackstone griddles to their makers' sizes (siteplan/infratech.ts, siteplan/blackstone.ts): a
 * 9 ft patio roof with four W / WD heaters in four lengths and finishes (all but the white one switched on), the
 * ledgerstone island with its Blackstone 28 in 6128 griddle, and the 28 and 36 in Blackstone
 * cooking stations on their carts beside the roof. Hand tool: each heater's switch, the griddle hoods.
 */
export function sampleHeatersGriddles(): SitePlan {
  const S = 'sample' as const;
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const heater = (id: string, catalogId: string, x: number, size: number, dual: boolean, on: boolean) =>
    ({ id, source: S, catalogId, position: [x, 2.2] as Vec2, rotationDeg: 0, size: INFRATECH_SIZES[size].size, options: { dual, on } });
  return {
    schemaVersion: 1,
    site: { name: 'Patio heaters and Blackstone griddles', boundary: rect(0, 0, 16, 12), latitude: 37.64, longitude: -120.99, northAngleDeg: 0 },
    structures: [{ id: 'patio-cover', source: S, kind: 'cover', polygon: rect(1, 1, 11, 5), height: 2.74, roof: 'flat' }],
    zones: [
      { id: 'patio', source: S, kind: 'hardscape', catalogId: 'catalina-grana-sonoran-gray', polygon: rect(0.5, 0.5, 15.5, 11.5), border: { catalogId: 'catalina-grana-border-midnight', width: 0.23 } },
    ],
    lines: [],
    water: [],
    plants: [],
    features: [
      heater('heater-33', 'infratech-heater-white', 2.4, 0, false, false),
      heater('heater-39', 'infratech-heater-39', 4.7, 1, true, true),
      heater('heater-48', 'infratech-heater-black', 7.1, 2, false, true),
      heater('heater-61', 'infratech-heater-bronze', 9.6, 3, true, true),
      { id: 'island', source: S, catalogId: 'kitchen-island-ledgerstone-griddle-126', position: [6, 8], rotationDeg: 0 },
      { id: 'station-36', source: S, catalogId: 'blackstone-griddle-station-36', position: [13.4, 2.6], rotationDeg: 0 },
      { id: 'station-28', source: S, catalogId: 'blackstone-griddle-station-28', position: [13.4, 6.2], rotationDeg: 0 },
    ],
  };
}
