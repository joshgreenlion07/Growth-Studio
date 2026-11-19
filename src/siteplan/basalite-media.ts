/**
 * Basalite's own product page, listed sizes and swatch photo for every Basalite line and color in the catalog, from the
 * California product pages on basalite.com. As with Belgard (belgard-media.ts), the photos are not copied into the app:
 * the material panel loads them live from basalite.com by this address, and falls back to the color swatch if Basalite
 * moves one. Basalite's pages ask for a region first; the page link lands on that picker, then the product.
 */
import type { MakerMedia } from './belgard-media';

export const BASALITE_IMAGE_BASE = 'https://basalite.com/wp-content/uploads/';

export const BASALITE_MEDIA: Record<string, MakerMedia> = {
  'Premier Slab': {
    page: 'https://basalite.com/products/premier-slab-ca/',
    sizes: ['24 x 24: 594 x 594 x 60 mm (23 1/2 x 23 1/2 in x 60 mm)'],
    images: {
      'Midnight Terrace': '2023/09/premier-slab-24x24-midnightterrace.jpg',
      'Bodega Dunes': '2023/09/premier-slab-24x24-bodegadunes.jpg',
      Oceanside: '2023/09/premier-slab-24x24-oceanside.jpg',
      Positano: '2023/09/premier-slab-24x24-positano.jpg',
      Torino: '2023/09/premier-slab-24x24-torino.jpg',
    },
  },
  // Premier Smooth: Basalite's California page, read for the Sacramento region (Northern California).
  'Premier Smooth': {
    page: 'https://basalite.com/products/premier-smooth-ca/',
    sizes: ['6 x 12: 148 x 298 x 60 mm (5.83 x 11.73 in)', '9 x 12: 223 x 298 x 60 mm (8.78 x 11.73 in)', '12 x 12: 298 x 298 x 60 mm (11.73 x 11.73 in)', '12 x 18: 298 x 448 x 60 mm (11.73 x 17.64 in), sold separately', '6 x 9 border: 148 x 223 x 60 mm (5.83 x 8.78 in), sold separately'],
    images: {
      Positano: '2023/09/premier-smooth-positano.jpg',
      Torino: '2023/09/premier-smooth-torino.jpg',
      'Bodega Dunes': '2023/09/premier-smooth-bodega-dunes.jpg',
      'Midnight Terrace': '2025/02/premier-smooth-midnight-terrace.jpg',
      Oceanside: '2023/09/premier-smooth-oceanside.jpg',
      SeaScape: '2025/06/premier-smooth-seascape.jpg',
    },
  },
};

/** The swatch photo URL for a Basalite line and color, if Basalite has one. */
export function basaliteImage(line: string, color: string): string | undefined {
  const p = BASALITE_MEDIA[line]?.images[color];
  return p ? (/^https:/.test(p) ? p : BASALITE_IMAGE_BASE + p) : undefined;
}
