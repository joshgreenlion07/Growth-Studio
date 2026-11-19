import type { SitePlan, Vec2 } from './types';

/**
 * A back and side yard showing the side-yard pieces (siteplan/yard.ts): Belgard Catalina Grana Scandina Gray in its
 * random 3-piece pattern with a soldier border, the 24 in bubbling urn in its pebble circle and paver ring set into
 * the back bed, an 18 in curved Melville Wall sitting wall in Scandina Gray with a Tru-Scapes hardscape light, MSI
 * Caldera Blanca 8 x 47 plank under the patio cover (and a 16 x 47 2 cm paver landing at the side door), tall pots
 * with star jasmine on metal trellises along the fence, a cedar raised bed and a 5 ft bench on gold DG, a star jasmine
 * on its trellis in the ground at the fence, an A/C pad behind a cedar slat screen, and the Suncast shed on its paver
 * pad at the end of the side yard. Feet in the layout, meters in the plan.
 */
export function sampleSideYard(): SitePlan {
  const S = 'sample' as const;
  const F = 0.3048;
  const ft = (pts: [number, number][]): Vec2[] => pts.map(([x, y]) => [x * F, y * F]);
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => ft([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const P = (x: number, y: number): Vec2 => [x * F, y * F];
  // The urn's 7 ft pebble circle: the patio stops at it, its soldier border ringing the pebbles.
  const urn: [number, number] = [8, 3.8], ringR = 3.5;
  const notch: [number, number][] = [];
  for (let k = 0; k <= 16; k++) {
    const dx = Math.sqrt(ringR * ringR - (6 - urn[1]) ** 2);
    const a0 = Math.atan2(6 - urn[1], dx), a1 = Math.PI - a0;
    const a = a0 + ((a1 - a0) * k) / 16;
    notch.push([urn[0] + Math.cos(a) * ringR, urn[1] + Math.sin(a) * ringR]);
  }
  const pav = { catalogId: 'catalina-grana-scandina-gray', laying: 'random' as const, border: { catalogId: 'catalina-grana-border-scandina-gray', width: 0.23 } };
  return {
    schemaVersion: 1,
    site: { name: 'Side yard with shed, raised bed and urn fountain', boundary: rect(0, 0, 22, 48), latitude: 37.95, longitude: -121.29, northAngleDeg: 0 },
    structures: [
      { id: 'house', source: S, kind: 'house', polygon: rect(0, 14, 12, 48), height: 2.75, roof: 'hip' },
      { id: 'patio-cover', source: S, kind: 'cover', polygon: rect(2.5, 10, 11.5, 14), height: 2.6, roof: 'flat' },
    ],
    zones: [
      { id: 'back-bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(0, 0, 22, 6) },
      // The patio: around the urn's ring, and round the covered patio's porcelain.
      { id: 'patio', source: S, kind: 'hardscape', ...pav, polygon: ft([[0, 6], ...notch.reverse(), [22, 6], [22, 14], [16, 14], [11.5, 14], [11.5, 10], [2.5, 10], [2.5, 14], [0, 14]]) },
      { id: 'porcelain', source: S, kind: 'hardscape', catalogId: 'msi-caldera-blanca-plank-8x47', polygon: rect(2.5, 10, 11.5, 14) },
      // The side walk along the house, jogging out round the A/C pad.
      { id: 'walk', source: S, kind: 'hardscape', ...pav, polygon: ft([[12, 14], [16, 14], [16, 30], [18.6, 30], [18.6, 37], [16, 37], [16, 40], [12, 40], [12, 37], [14.6, 37], [14.6, 30], [12, 30]]) },
      { id: 'landing', source: S, kind: 'hardscape', catalogId: 'msi-caldera-blanca-paver-16x47', polygon: rect(12.2, 20, 15.8, 24) },
      { id: 'dg', source: S, kind: 'bed', catalogId: 'decomposed-granite', polygon: rect(16, 14, 22, 30) },
      { id: 'fence-bed', source: S, kind: 'bed', catalogId: 'black-mulch', polygon: rect(18.6, 30, 22, 40) },
      { id: 'ac-pad', source: S, kind: 'hardscape', catalogId: 'concrete-broom', polygon: rect(12, 30.5, 14.5, 36.5) },
      { id: 'shed-pad', source: S, kind: 'hardscape', ...pav, polygon: rect(12.5, 40, 22, 48) },
    ],
    lines: [
      { id: 'fence-back', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: ft([[0, 0], [22, 0]]), height: 1.83 },
      { id: 'fence-side', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: ft([[22, 0], [22, 48]]), height: 1.83 },
      { id: 'fence-left', source: S, kind: 'fence', catalogId: 'fence-board-on-board', points: ft([[0, 0], [0, 14]]), height: 1.83 },
      // The curved sitting wall, 18 in with its cap, concave toward the patio.
      { id: 'sitting-wall', source: S, kind: 'wall', catalogId: 'melville-wall-scandina-gray', points: ft([[15.0, 2.7], [15.62, 2.8], [16.23, 2.97], [16.81, 3.2], [17.36, 3.51], [17.87, 3.88], [18.34, 4.3], [18.75, 4.78], [19.1, 5.3]]), height: 18 * 0.0254 },
    ],
    water: [],
    plants: [
      // A star jasmine on its metal trellis in the ground, at the fence.
      { id: 'jasmine-fence', source: S, catalogId: 'star-jasmine-metal-trellis', position: P(21.55, 34.5) },
    ],
    features: [
      { id: 'urn', source: S, catalogId: 'urn-fountain-bubbler-24-rust', position: P(urn[0], urn[1]), rotationDeg: 0 },
      { id: 'wall-light', source: S, catalogId: 'truscapes-ts-a6000', position: P(17.0, 3.7), rotationDeg: 0 },
      { id: 'pot-1', source: S, catalogId: 'pot-trellis-star-jasmine', position: P(0.95, 7.4), rotationDeg: -90 },
      { id: 'pot-2', source: S, catalogId: 'pot-trellis-star-jasmine', position: P(0.95, 12.6), rotationDeg: -90 },
      { id: 'raised-bed', source: S, catalogId: 'raised-bed-cedar', position: P(19.0, 20.5), rotationDeg: 90 },
      { id: 'bench', source: S, catalogId: 'garden-bench-wood-5ft', position: P(20.9, 26.0), rotationDeg: 90 },
      { id: 'ac-screen', source: S, catalogId: 'ac-screen-cedar-slat', position: P(14.75, 33.5), rotationDeg: -90 },
      { id: 'shed', source: S, catalogId: 'suncast-bms7481-brown', position: P(17.5, 44.6), rotationDeg: 180 },
    ],
  };
}
