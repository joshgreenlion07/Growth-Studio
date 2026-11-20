import type { FeatureSpec } from './catalog';

/*
 * Blackstone griddles, to Blackstone's published sizes (researched 2026-11-19):
 *
 *   Built-in (drop-in) griddles with hood, the kitchen parts (siteplan/kitchen.ts builds them into islands):
 *     28 in 6128 (propane) / 6301 (natural gas): 33 W x 29 1/4 D x 13 H in, Blackstone's dimension graphic on
 *       https://blackstoneproducts.com/products/28-premium-built-in-griddle-w-hood-natural-gas-ready (Lowe's: 32.75 x
 *       29.13 x 13.22 in, 154 lb). Non-combustible cavity 33.32 x 25.02 x 7.59 in, the 6128 / 6301 owner's manual p. 9
 *       ("a deeper cavity will interfere with the hood"); the front panel stands in a notch at the counter's front.
 *       Cooking surface 27 1/2 x 21 1/2 in (590 sq in), 3 burners and 3 LED knobs (the manual's parts list).
 *     28 in 6029, the same griddle in Blackstone's 304 stainless insulating jacket: 38 1/2 W x 32 D x 15 H in, the
 *       dimension graphic on https://blackstoneproducts.com/products/28-griddle-w-hood-insulation-jacket; cavity
 *       38.75 x 27.5 x 8 in (6029 manual p. 11). The jacket lets it go in a combustible island.
 *     36 in 6138 (propane) / 6303 (natural gas): 40.7 W x 29.13 D x 13.22 H in (Lowe's), cavity 41.28 x 25.02 x
 *       7.59 in (6138 manual p. 4), cooking surface 35 1/2 x 21 1/2 in, 4 burners and 4 LED knobs; the 6128's styling.
 *   The look of all three (Blackstone's product photos): a brushed stainless hood with black end caps and a round
 *   tube handle on two standoffs (no logo on the hood); under it a black vent band with diamond perforations and the
 *   boxed BLACKSTONE badge in the middle; a forward-leaning brushed stainless control panel with charcoal knobs in a
 *   chrome bezel and a white LED ring, the lighting instructions printed at both ends; a black body and side caps; a
 *   rear grease cup. Blackstone publishes no BTU rating for these (retailers list 25,000 to 34,800).
 *
 *   Griddle cooking stations on a cart (catalog features, placed in a plan):
 *     2287 Original 28 in Omnivore Griddle with Hood: 59 W x 26 1/4 D x 37 H in (hood closed), cooking surface
 *       28 3/4 x 18 in (517 sq in), 2 burners, 102 lb: https://blackstoneproducts.com/products/28-omnivore-griddle-whood
 *       and its dimension graphic; two wheels on the left legs, feet on the right (2287 manual, step 01); 24,000 BTU
 *       (WebstaurantStore, Blackstone publishes none).
 *     2322 Original 36 in Omnivore Griddle with Hood: 64 1/2 W x 26 D x 36 1/2 H in, cooking surface 35 3/4 x
 *       21 1/2 in (768 sq in), 4 burners, 135 lb: https://blackstoneproducts.com/products/36-omnivore-griddle-w-hood;
 *       two fixed wheels on the right legs and two locking casters on the left (2322 manual); 38,000 BTU
 *       (WebstaurantStore).
 *   Both: black powder coat; a low rounded hood with the flame emblem and BLACKSTONE embossed on top and a black bar
 *   handle with orange accents; the black front panel with the small white logo and orange flame over a stainless push
 *   igniter, black knobs with orange pointers in orange and white tick arcs, and the big orange BLACKSTONE on a gray
 *   plate below; side shelves (an accessory bin hangs off the right one), a slotted lower shelf with the flame emblem,
 *   the propane tank hook on the left leg, a rear grease cup. Blackstone publishes no shelf, wheel or cooking-height
 *   sizes: those are scaled from its dimension graphics against the published overall sizes.
 */

export interface BlackstoneBuiltIn {
  /** Kitchen part id (KITCHEN_PARTS). */
  id: string;
  /** The part's chip label. */
  label: string;
  models: string;
  /** Overall W x D x H, inches (with the jacket when it has one). */
  overall: [number, number, number];
  /** The griddle alone (in the jacket, or the same as `overall`). */
  griddle: [number, number, number];
  /** The cavity in the island, W x D x H in. */
  cutout: [number, number, number];
  bayIn: number;
  burners: number;
  cook: [number, number];
  jacket: boolean;
  lb: string;
  page: string;
  source: string;
}

export const BLACKSTONE_BUILT_INS: BlackstoneBuiltIn[] = [
  {
    id: 'kitchen-griddle-blackstone-28', label: '28 in in its jacket (6029)', models: '6029 (propane)',
    overall: [38.5, 32, 15], griddle: [33, 29.25, 13.22], cutout: [38.75, 27.5, 8], bayIn: 39, burners: 3, cook: [27.5, 21.5], jacket: true,
    lb: '206 lb (Blackstone store data)', page: 'https://blackstoneproducts.com/products/28-griddle-w-hood-insulation-jacket',
    source: 'Blackstone 6029 dimension graphic (38 1/2 x 32 x 15 in) and manual (cavity 38.75 x 27.5 x 8 in)',
  },
  {
    id: 'kitchen-griddle-blackstone-28-6128', label: '28 in (6128 / 6301)', models: '6128 (propane) / 6301 (natural gas)',
    overall: [33, 29.25, 13.22], griddle: [33, 29.25, 13.22], cutout: [33.32, 25.02, 7.59], bayIn: 34, burners: 3, cook: [27.5, 21.5], jacket: false,
    lb: '154 lb (Lowe\'s)', page: 'https://blackstoneproducts.com/products/28-premium-built-in-griddle-w-hood-natural-gas-ready',
    source: 'Blackstone 6301 dimension graphic (33 x 29 1/4 x 13 in; Lowe\'s 13.22 in) and 6128 / 6301 manual (cavity 33.32 x 25.02 x 7.59 in)',
  },
  {
    id: 'kitchen-griddle-blackstone-36', label: '36 in (6138 / 6303)', models: '6138 (propane) / 6303 (natural gas)',
    overall: [40.7, 29.13, 13.22], griddle: [40.7, 29.13, 13.22], cutout: [41.28, 25.02, 7.59], bayIn: 42, burners: 4, cook: [35.5, 21.5], jacket: false,
    lb: '163 lb (Lowe\'s)', page: 'https://www.lowes.com/pd/Blackstone-36-in-Drop-in-Griddle/5015633745',
    source: 'Lowe\'s 6138 / 6303 listing (40.7 x 29.13 x 13.22 in) and the 6138 manual (cavity 41.28 x 25.02 x 7.59 in)',
  },
];
export const blackstoneBuiltIn = (partId: string) => BLACKSTONE_BUILT_INS.find((b) => b.id === partId);

export interface BlackstoneCart {
  id: string;
  model: string;
  name: string;
  /** Overall W x D x H, inches, hood closed. */
  overall: [number, number, number];
  cook: [number, number];
  burners: number;
  btu: number;
  lb: number;
  /** Wheels: two on the left legs and feet on the right (28 in), or locking casters left and fixed wheels right (36 in). */
  wheels: 'left' | 'all';
  page: string;
  /** Scaled from Blackstone's dimension graphic (not published): side shelves' widths (left, right), the plate's height. */
  shelvesIn: [number, number];
  plateIn: number;
}

export const BLACKSTONE_CARTS: BlackstoneCart[] = [
  {
    id: 'blackstone-griddle-station-28', model: '2287', name: 'Blackstone Original 28 in Omnivore griddle with hood (2287), on its cart',
    overall: [59, 26.25, 37], cook: [28.75, 18], burners: 2, btu: 24000, lb: 102, wheels: 'left',
    page: 'https://blackstoneproducts.com/products/28-omnivore-griddle-whood', shelvesIn: [16.5, 10.75], plateIn: 32.5,
  },
  {
    id: 'blackstone-griddle-station-36', model: '2322', name: 'Blackstone Original 36 in Omnivore griddle with hood (2322), on its cart',
    overall: [64.5, 26, 36.5], cook: [35.75, 21.5], burners: 4, btu: 38000, lb: 135, wheels: 'all',
    page: 'https://blackstoneproducts.com/products/36-omnivore-griddle-w-hood', shelvesIn: [14, 9.5], plateIn: 32,
  },
];
export const blackstoneCart = (featureId: string) => BLACKSTONE_CARTS.find((c) => c.id === featureId);

const IN = 0.0254;
const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });
const frac = (n: number) => {
  const w = Math.floor(n), f = Math.round((n - w) * 4);
  return f ? `${w} ${['', '1/4', '1/2', '3/4'][f]}` : `${w}`;
};

export const BLACKSTONE_CART_FEATURES: FeatureSpec[] = BLACKSTONE_CARTS.map((c) => F({
  id: c.id, name: c.name, group: 'Kitchens', kind: 'griddleStation', footprint: [c.overall[0] * IN, c.overall[1] * IN],
  maker: 'Blackstone', page: c.page,
  options: [{ key: 'tank', label: 'Propane tank (20 lb) on its hook', default: true }],
  about: `Blackstone's Original ${c.cook[0] > 30 ? 36 : 28} in Omnivore griddle cooking station with hood (${c.model}): a ${frac(c.cook[0])} x ${frac(c.cook[1])} in rolled steel cooktop with wind guards over ${c.burners} burners, a low black rounded hood with the flame emblem and BLACKSTONE embossed on top and an orange-accented bar handle, the black front panel with ${c.burners} knobs, the push igniter and the orange BLACKSTONE on its gray plate, side shelves with an accessory bin, a slotted lower shelf, ${c.wheels === 'left' ? 'two wheels on the left legs and feet on the right' : 'locking casters on the left and fixed wheels on the right'}, and a 20 lb tank on the hook at the left leg.`,
  facts: [
    `${frac(c.overall[0])} W x ${frac(c.overall[1])} D x ${frac(c.overall[2])} H in with the hood closed (Blackstone)`,
    `Cooking surface ${frac(c.cook[0])} x ${frac(c.cook[1])} in; ${c.burners} burners, about ${c.btu.toLocaleString('en-US')} BTU (retailer listing; Blackstone publishes none); propane`,
    `${c.lb} lb`,
    'Black powder coat; rear grease cup; propane tank hangs on the left leg',
    'Shelf widths and the cooking height are scaled from Blackstone\'s dimension graphic (not published)',
    'Hand tool: lift the hood',
  ],
}));
