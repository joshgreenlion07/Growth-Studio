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
};

/** The swatch photo URL for a Basalite line and color, if Basalite has one. */
export function basaliteImage(line: string, color: string): string | undefined {
  const p = BASALITE_MEDIA[line]?.images[color];
  return p ? (/^https?:/.test(p) ? p : BASALITE_IMAGE_BASE + p) : undefined;
}
