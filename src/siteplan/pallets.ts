/**
 * How the makers palletize the pavers in the catalog, for ordering: the square feet one pallet covers and the pieces of
 * each size on it (nominal inches, short side first). Only lines whose pallet is printed on the maker's cut sheet for the
 * region Green Lion buys from are listed; a line left out is ordered by the square foot (ask the yard for its pallet).
 *
 *   Belgard Avalon Slate 3-piece (Pacific cut sheet, rev. 01/2026): 30 sq ft of 12 x 6, 30 of 12 x 9 and 60 of 12 x 12 a
 *     pallet (6, 4 and 6 a layer, 10 layers): 60 + 40 + 60 pieces, 120 sq ft, 3230 lb.
 *   Belgard Catalina Grana 3-piece (Pacific cut sheet): the same 12 x 6, 12 x 9, 12 x 12 layer (6, 4, 6), 120 sq ft a
 *     pallet.
 *   Belgard 6 x 9 x 2 3/8 border stones (Avalon Slate, Catalina Grana; Pacific cut sheets and Belgard's commercial
 *     guide): 30 a layer, 10 layers, 300 pieces, 112.5 sq ft (Catalina Grana border 3020 lb).
 *   Belgard Dimensions 12 60 mm (cut sheets): 40 each of 6 x 12, 12 x 12 and 12 x 18, 120 sq ft.
 *   Basalite Premier Slab (CA cut sheet): 32 slabs, 123 sq ft, 3442 lb.
 *   Basalite Premier Smooth (cut sheet BA-CA 5/24/2024): the combo pallet of 96 6 x 12, 64 9 x 12 and 32 12 x 12,
 *     121.9 sq ft; the 12 x 18 on its own pallet, 64 pieces, 92 sq ft; the 6 x 9 border, 280 pieces, 100 sq ft.
 *   Basalite Premier Slate (its own cut sheet, BA-CA 5/24/2024): the same pallets, the combo 3,378 lb; its 6 x 9 border
 *     pallet is printed as 280 pieces, 120 sq ft.
 */
import type { MaterialSpec } from './catalog';

export interface Pallet {
  /** What the yard calls it: "3-piece pallet", "12 x 18 pallet", "6 x 9 border pallet". */
  label: string;
  /** Square feet one pallet covers, as the maker prints it. */
  sqft: number;
  /** The pieces on one pallet: [short side, long side, count], nominal inches. */
  pieces: [number, number, number][];
  /** Pallet weight, pounds, when the cut sheet gives it. */
  lb?: number;
  /** Where the numbers come from. */
  source: string;
}

const BORDER_69 = (lb?: number, line = 'Belgard'): Pallet => ({ label: '6 x 9 border pallet', sqft: 112.5, pieces: [[6, 9, 300]], ...(lb ? { lb } : {}), source: `${line} 6 x 9 x 2 3/8 in, cut sheet: 300 a pallet, 112.5 sq ft` });

/** The pallets a paver or border look is sold on (the first is the one a pattern is mostly laid from), or none. */
export function palletsFor(m: MaterialSpec, maker: string, line: string): Pallet[] {
  const sizes = m.pattern?.sold ?? m.pattern?.sizes ?? [];
  const has = (a: number, b: number) => sizes.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const border = m.use === 'border';
  if (maker === 'Belgard') {
    if (border && has(6, 9) && (line === 'Avalon Slate' || line === 'Catalina Grana')) return [BORDER_69(line === 'Catalina Grana' ? 3020 : undefined, `Belgard ${line}`)];
    if (!border && line === 'Avalon Slate' && has(6, 12) && has(9, 12) && has(12, 12))
      return [{ label: '3-piece pallet', sqft: 120, pieces: [[6, 12, 60], [9, 12, 40], [12, 12, 60]], lb: 3230, source: 'Belgard Avalon Slate Pacific cut sheet (rev. 01/2026): 30 + 30 + 60 sq ft, 10 layers' }];
    if (!border && line === 'Catalina Grana' && has(6, 12) && has(9, 12) && has(12, 12))
      return [{ label: '3-piece pallet', sqft: 120, pieces: [[6, 12, 60], [9, 12, 40], [12, 12, 60]], source: 'Belgard Catalina Grana Pacific cut sheet: 120 sq ft, 6 + 4 + 6 a layer' }];
    if (!border && line === 'Dimensions 12 60mm' && has(6, 12) && has(12, 12) && has(12, 18))
      return [{ label: '3-piece pallet', sqft: 120, pieces: [[6, 12, 40], [12, 12, 40], [12, 18, 40]], source: 'Belgard Dimensions 12 60 mm cut sheets: 40 of each size, 120 sq ft' }];
  }
  if (maker === 'Basalite') {
    if (line === 'Premier Slab' && !border && sizes.length === 1) return [{ label: 'Pallet', sqft: 123, pieces: [[Math.min(...sizes[0]), Math.max(...sizes[0]), 32]], lb: 3442, source: 'Basalite Premier Slab CA cut sheet: 32 a pallet, 123 sq ft' }];
    if (line === 'Premier Slate') {
      if (border) return [{ label: '6 x 9 border pallet', sqft: 120, pieces: [[6, 9, 280]], source: 'Basalite Premier Slate cut sheet (BA-CA 5/24/2024): 280 a pallet, 120 sq ft' }];
      return [
        { label: '3-piece combo pallet', sqft: 121.9, pieces: [[6, 12, 96], [9, 12, 64], [12, 12, 32]], lb: 3378, source: 'Basalite Premier Slate cut sheet (BA-CA 5/24/2024): 96 + 64 + 32, 121.9 sq ft, 3,378 lb' },
        { label: '12 x 18 pallet', sqft: 92, pieces: [[12, 18, 64]], source: 'Basalite Premier Slate cut sheet (BA-CA 5/24/2024): 64 a pallet, 92 sq ft' },
      ];
    }
    if (line === 'Premier Smooth') {
      if (border) return [{ label: '6 x 9 border pallet', sqft: 100, pieces: [[6, 9, 280]], source: 'Basalite Premier Smooth cut sheet (BA-CA 5/24/2024): 280 a pallet, 100 sq ft' }];
      return [
        { label: '3-piece combo pallet', sqft: 121.9, pieces: [[6, 12, 96], [9, 12, 64], [12, 12, 32]], source: 'Basalite Premier Smooth cut sheet (BA-CA 5/24/2024): 96 + 64 + 32, 121.9 sq ft' },
        { label: '12 x 18 pallet', sqft: 92, pieces: [[12, 18, 64]], source: 'Basalite Premier Smooth cut sheet (BA-CA 5/24/2024): 64 a pallet, 92 sq ft' },
      ];
    }
  }
  return [];
}
