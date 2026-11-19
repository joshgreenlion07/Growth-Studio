import type { FeatureOption, FeatureSpec } from './catalog';

/*
 * Outdoor kitchens, built the way water features are: the parts are made first, here in Growth Studio, and an island is
 * assembled from them, then placed in a plan like any feature.
 *
 *   Parts      the kitchen component library (KITCHEN_PARTS): grills, griddles, burners, pizza ovens, sinks, the cold
 *              units, access doors, drawers, the propane cabinet, trash pull-out, towel holder, stools, and the counter
 *              and veneer finishes. Each is a parametric part in typical published sizes (overall and cutout, inches)
 *              for popular models; check them against the chosen unit's spec sheet before building. They live in the
 *              Library's Kitchen parts shelf (each shown in a short stub of island) and are building blocks only: they
 *              are in `featureById` (so the Library can draw them) but not in FEATURES, so they are never offered to
 *              Area Planner, the plan editor or the plan reader.
 *   Islands    an island (KitchenIsland) is one or more straight runs of bays (KitchenBay), left to right as you face the
 *              front: each bay a part and its width, or plain counter. Finishes, overhangs, the bar ledge, the light and
 *              the ends belong to the island. Islands are catalog features (KITCHEN_ISLAND_FEATURES, group Kitchens).
 *
 * Built by builder/kitchen/. Sizes from the build spec's kitchen component library (published sizes for popular models,
 * gathered from maker cut sheets and dealer listings; listings disagree by up to about 2 in for the same model).
 */

const IN = 0.0254;

/* ------------------------------------------------------------------ */
/* Finishes                                                             */
/* ------------------------------------------------------------------ */

/** A countertop slab: its stone or concrete and how it is drawn (engine/kitchen-surfaces.ts). */
export interface CounterFinish {
  id: string;
  name: string;
  kind: 'granite' | 'quartz' | 'concrete';
  /** sRGB tones: the ground, then the grains or veins, darkest last. */
  tones: string[];
  /** Polished stone is glossy; sealed concrete and honed stone are not. */
  roughness: number;
  /** Usual slab thickness, inches. */
  thicknessIn: number;
  note: string;
}

export const COUNTER_FINISHES: CounterFinish[] = [
  { id: 'granite-light-gray', name: 'Granite, light gray', kind: 'granite', tones: ['#aeada8', '#cfcdc7', '#8a8985', '#5a5a57', '#232323'], roughness: 0.2, thicknessIn: 1.25, note: 'Light gray polished granite with white, gray and black grains (a Luna Pearl or Bianco Catalina type), 3 cm, sealed' },
  { id: 'granite-steel-gray', name: 'Granite, steel gray', kind: 'granite', tones: ['#5d6064', '#7d8084', '#43464a', '#2b2d30', '#18191b'], roughness: 0.18, thicknessIn: 1.25, note: 'Dark blue-gray polished granite with black and silver grains (a Steel Gray type), 3 cm, sealed' },
  { id: 'granite-absolute-black', name: 'Granite, absolute black', kind: 'granite', tones: ['#1c1c1d', '#2a2a2b', '#161617', '#111112', '#0b0b0b'], roughness: 0.14, thicknessIn: 1.25, note: 'Near-black polished granite, very fine and even, 3 cm, sealed' },
  { id: 'granite-white-pepper', name: 'Granite, white with black grains', kind: 'granite', tones: ['#dedad2', '#f0ede6', '#b8b2a8', '#6e6860', '#1f1d1c'], roughness: 0.2, thicknessIn: 1.25, note: 'Off-white polished granite with gray, black and a few garnet grains (a Bianco Romano or Salt and Pepper type), 3 cm, sealed' },
  { id: 'granite-tan-brown', name: 'Granite, tan brown', kind: 'granite', tones: ['#7b6555', '#a08471', '#5a4639', '#2f241e', '#161211'], roughness: 0.2, thicknessIn: 1.25, note: 'Warm brown polished granite with black and tan grains (a Tan Brown type), 3 cm, sealed' },
  { id: 'quartz-exterior-white', name: 'Exterior quartz, white with gray veins', kind: 'quartz', tones: ['#ecebe7', '#f4f3ef', '#b9b8b4', '#8f8e8a'], roughness: 0.22, thicknessIn: 1.25, note: 'Exterior-rated quartz or sintered surface only (indoor engineered quartz yellows in sun), 3 cm' },
  { id: 'concrete-counter-gray', name: 'Concrete, sealed gray', kind: 'concrete', tones: ['#a7a49e', '#b8b5ae', '#8d8a85', '#6f6c68'], roughness: 0.55, thicknessIn: 1.75, note: 'Precast GFRC or poured concrete, 1 1/2 to 2 in, sealed (a satin sheen)' },
];
export const counterFinish = (id: string | undefined) => COUNTER_FINISHES.find((c) => c.id === id) ?? COUNTER_FINISHES[0];

/**
 * A base veneer: an MSI split-face ledger panel color (6 x 24 in panels, with 6 x 18 x 6 in corners) or stucco. Ledger
 * panels give the tones and strip sizes the texture is drawn with (engine/kitchen-surfaces.ts); Silver Travertine and
 * Arctic Golden reuse the textures fitted to MSI's panel photos for the water wall and the wall veneers. The other
 * colors' tones are read from MSI's color descriptions and to be fitted to their panel photos.
 */
export interface VeneerFinish {
  id: string;
  name: string;
  kind: 'ledger' | 'stucco';
  /** The look it is drawn with: a fitted texture of the app's ('silver' or a catalog wall look id), or its own tones. */
  look?: 'silver' | string;
  tones?: string[];
  weights?: number[];
  rowIn?: [number, number];
  pieceIn?: [number, number];
  rust?: number;
  quartz?: boolean;
  /** Average albedo (linear) the texture is scaled to. */
  mean?: [number, number, number];
  /** Panel thickness, inches (it sets the veneer skin). */
  thicknessIn: number;
  note: string;
}

export const VENEER_FINISHES: VeneerFinish[] = [
  { id: 'msi-silver-travertine', name: 'MSI Silver Travertine ledger', kind: 'ledger', look: 'silver', thicknessIn: 1.25, note: 'MSI Silver Travertine Panel 6x24 (LPNLTSIL624), split-face travertine, light silver gray with beige and tan, 3/4 to 1 1/2 in' },
  { id: 'msi-gold-rush', name: 'MSI Gold Rush ledger', kind: 'ledger', tones: ['#b69466', '#9c7650', '#c9ae86', '#7f6046', '#d8c6a6', '#8e7a66', '#a7835c', '#6b5442'], weights: [0.2, 0.16, 0.14, 0.12, 0.1, 0.1, 0.1, 0.08], rowIn: [1.25, 2], pieceIn: [3, 10], rust: 0.8, quartz: true, mean: [0.27, 0.19, 0.11], thicknessIn: 1.25, note: 'MSI Gold Rush Panel 6x24, split-face quartzite, gold and rust with cream and gray' },
  { id: 'msi-alaska-gray', name: 'MSI Alaska Gray ledger', kind: 'ledger', tones: ['#8a8b8c', '#6f7072', '#a3a3a2', '#55575a', '#b9b8b4', '#7b7a76', '#62615f', '#9a968f'], weights: [0.2, 0.17, 0.14, 0.13, 0.1, 0.1, 0.09, 0.07], rowIn: [1.25, 2], pieceIn: [3, 12], rust: 0.1, quartz: true, mean: [0.12, 0.12, 0.12], thicknessIn: 1.25, note: 'MSI Alaska Gray Panel 6x24, split-face quartzite, mid and charcoal gray with silver' },
  { id: 'msi-rustic-gold', name: 'MSI Rustic Gold ledger', kind: 'ledger', tones: ['#8c6a48', '#6d5038', '#a6845e', '#58412f', '#b99b74', '#7a654f', '#9a7550', '#4a3829'], weights: [0.2, 0.16, 0.14, 0.13, 0.1, 0.1, 0.09, 0.08], rowIn: [1.25, 2.25], pieceIn: [3, 10], rust: 0.9, mean: [0.17, 0.115, 0.07], thicknessIn: 1.25, note: 'MSI Rustic Gold Panel 6x24, split-face slate, gold and brown with rust' },
  { id: 'msi-arctic-golden', name: 'MSI Arctic Golden ledger', kind: 'ledger', look: 'msi-arctic-golden-ledger', thicknessIn: 1.25, note: 'MSI Arctic Golden Splitface Panel 6x24 (LPNLQARCGLD624), quartzite, cool white and cream with golden veins' },
  { id: 'stucco-santa-barbara', name: 'Santa Barbara stucco, SW 7029 Agreeable Gray', kind: 'stucco', look: 'stucco-santa-barbara-sw-agreeable-gray', thicknessIn: 0.875, note: 'Smooth trowel stucco over lath and cement board, painted (any color; shown in Sherwin-Williams SW 7029 Agreeable Gray)' },
];
export const veneerFinish = (id: string | undefined) => VENEER_FINISHES.find((v) => v.id === id) ?? VENEER_FINISHES[0];

/* ------------------------------------------------------------------ */
/* Parts                                                                */
/* ------------------------------------------------------------------ */

export type KitchenPartType =
  | 'grill' | 'griddle' | 'sideBurner' | 'pizzaCountertop' | 'pizzaDome' | 'sink'
  | 'fridge' | 'iceMaker' | 'kegerator'
  | 'door' | 'doubleDoor' | 'drawers' | 'propane' | 'trash' | 'towel'
  | 'stool' | 'counter' | 'veneer';

/**
 * How a part sits in an island:
 *   dropIn     in a cutout in the counter, its head above it (grills, griddles, burners, sinks); `cutout` is W x D in the
 *              counter and H below its top. A front-panel unit's cutout is a notch open at the counter's front edge.
 *   front      in an opening in the base's front face (doors, drawers, cold units); `cutout` is W x D x H with H the
 *              opening's height and D the depth it needs behind the face.
 *   onCounter  standing on the counter (a countertop pizza oven, a masonry dome).
 *   free       standing on the patio (stools).
 *   finish     a countertop or veneer finish.
 */
export type KitchenMount = 'dropIn' | 'front' | 'onCounter' | 'free' | 'finish';

export interface KitchenPart {
  id: string;
  /** The Library card it is a size or color of ('grill'), and that card's name. */
  family: string;
  familyName: string;
  type: KitchenPartType;
  mount: KitchenMount;
  /** The chip label within its family: its size ('32 in') or color. */
  label: string;
  name: string;
  /** Overall W x D x H, inches (with the hood or frame). */
  overall: [number, number, number];
  /** The opening it needs, inches (see KitchenMount). */
  cutout?: [number, number, number];
  /** The bay width it takes in an island, inches. */
  bayIn: number;
  /** Burners (and knobs), drawers, door leaves. */
  burners?: number;
  drawers?: number;
  leaves?: 1 | 2;
  /** The default hinge side of a single door, as you face it. */
  hinge?: 'left' | 'right';
  /** A finish part's finish (COUNTER_FINISHES or VENEER_FINISHES id). */
  finish?: string;
  /** Name text on the part (a maker's name, as a plain plate; never a logo). */
  nameText?: string;
  options?: FeatureOption[];
  about: string;
  facts: string[];
}

const fmt = (n: number) => {
  const w = Math.floor(n + 1e-6), f = Math.round((n - w) * 16);
  if (!f) return `${w}`;
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(f, 16);
  return `${w ? w + ' ' : ''}${f / d}/${16 / d}`;
};
const dims = (v: [number, number, number]) => `${fmt(v[0])} W x ${fmt(v[1])} D x ${fmt(v[2])} H in`;

const parts: KitchenPart[] = [];
function part(p: Omit<KitchenPart, 'facts'> & { facts?: string[] }) {
  const facts = [`Overall ${dims(p.overall)}`];
  if (p.cutout) facts.push(p.mount === 'front' ? `Opening ${fmt(p.cutout[0])} W x ${fmt(p.cutout[2])} H in, ${fmt(p.cutout[1])} in deep` : `Cutout ${dims(p.cutout)}`);
  facts.push(`Bay ${fmt(p.bayIn)} in wide`);
  parts.push({ ...p, facts: [...facts, ...(p.facts ?? [])] });
}

// Cooking.
const GRILLS: [number, [number, number, number], [number, number, number], number, string][] = [
  [30, [30, 25, 22], [28.5, 21.25, 8.5], 3, 'A 30 in class built-in (a Napoleon 500 BI type)'],
  [32, [32, 25.5, 21.5], [30.375, 21.25, 8.5], 4, 'A 32 in class built-in (a Blaze LTE 32 type)'],
  [36, [36, 26, 23], [34.5, 21.25, 8.5], 4, 'A 36 in class built-in (a Lion L75000 type)'],
  [42, [42, 26, 23], [40, 21.25, 8.5], 5, 'A 40 to 42 in class built-in (a Blaze 40 or Napoleon 700 BI type)'],
];
for (const [w, overall, cutout, burners, model] of GRILLS) part({
  id: `kitchen-grill-${w}`, family: 'grill', familyName: 'Built-in gas grill', type: 'grill', mount: 'dropIn', label: `${w} in`, name: `Built-in gas grill, ${w} in`,
  overall, cutout, bayIn: Math.ceil(cutout[0] + 1.5), burners,
  options: [{ key: 'rotisserie', label: 'Rotisserie kit and rear burner', default: false }],
  about: `A ${w} in drop-in gas grill head: a double-walled brushed stainless hood on a rear hinge with a tube handle and a hood thermometer, ${burners} stainless tube burners under flame tamers and hex-rod cooking grates, a control panel with a knob and bezel for each burner and a plain name plate. Option: a rotisserie kit (motor bracket and spit) and an infrared rear burner.`,
  facts: [model, `${burners} burners; propane or natural gas`, '304 brushed stainless', 'Hand tool: lift the hood, light the burners'],
});
const GRIDDLES: [number, [number, number, number], [number, number, number], number, number, string][] = [
  [28, [38.5, 27.5, 15], [38.75, 27.5, 8], 3, 39, 'Blackstone 28 in built-in griddle with hood and insulated jacket (6029 / 6128 propane, 6301 natural gas); cutout from the 6029 manual (minimum cavity)'],
  [36, [46, 28, 15], [45, 27, 8], 4, 46, 'Blackstone 36 in built-in griddle with hood (typical published size)'],
];
for (const [w, overall, cutout, burners, bay, model] of GRIDDLES) part({
  id: `kitchen-griddle-blackstone-${w}`, family: 'griddle', familyName: 'Blackstone built-in griddle', type: 'griddle', mount: 'dropIn', label: `${w} in`, name: `Blackstone built-in griddle, ${w} in`,
  overall, cutout, bayIn: bay, burners, nameText: 'BLACKSTONE',
  about: `Blackstone's ${w} in built-in griddle: a rolled steel cooktop in a stainless surround with a rear grease trough, a black powder-coated hood on a rear hinge, and a brushed stainless front with ${burners} black control knobs on chrome bezels. The name is shown as plain text on the hood.`,
  facts: [model, `Cook surface about ${w === 28 ? '27 1/2 x 21 1/2' : '35 1/2 x 21 1/2'} in; ${burners} burners`, 'Hand tool: lift the hood'],
});
part({
  id: 'kitchen-side-burner-single', family: 'side-burner', familyName: 'Side burner, drop-in', type: 'sideBurner', mount: 'dropIn', label: 'Single', name: 'Side burner, single, drop-in',
  overall: [12.75, 22, 10], cutout: [11.5, 20.5, 8.5], bayIn: 14, burners: 1,
  about: 'A drop-in single side burner: a brushed stainless body and a flat stainless lid on a rear hinge, a cast iron grate over a brass burner, one knob on the front.',
  facts: ['Typical 12 to 13 in wide, 21 to 23 in deep', 'Hand tool: lift the lid'],
});
part({
  id: 'kitchen-side-burner-double', family: 'side-burner', familyName: 'Side burner, drop-in', type: 'sideBurner', mount: 'dropIn', label: 'Double', name: 'Side burner, double, drop-in',
  overall: [27, 21, 10], cutout: [24.5, 20.5, 8.5], bayIn: 28, burners: 2,
  about: 'A drop-in double side burner: two burners under one cast iron grate, a flat stainless lid on a rear hinge, two knobs on the front.',
  facts: ['Typical 26 to 28 in wide, 21 in deep', 'Hand tool: lift the lid'],
});
part({
  id: 'kitchen-pizza-oven-countertop', family: 'pizza-oven', familyName: 'Pizza oven', type: 'pizzaCountertop', mount: 'onCounter', label: 'Countertop, 16 in', name: 'Pizza oven, countertop gas, 16 in stone',
  overall: [25, 23, 14.7], bayIn: 36,
  about: 'A countertop gas pizza oven with a 16 in stone (an Ooni Koda 16 type): a black powder-coated steel shell with a wide, low mouth, an L-shaped burner at the back and side, three folding legs and a control knob at the back.',
  facts: ['Needs about 36 in of clear counter', 'Propane', 'Sits on the counter: no cutout'],
});
part({
  id: 'kitchen-pizza-oven-dome', family: 'pizza-oven', familyName: 'Pizza oven', type: 'pizzaDome', mount: 'onCounter', label: 'Built-in dome, 32 in floor', name: 'Pizza oven, built-in masonry dome, 32 in floor',
  overall: [39, 34, 22], bayIn: 51,
  about: 'A wood-fired masonry dome oven set on the counter (an Alfa or Forno Bravo 28 to 32 in floor type): a stucco-finished dome with an arched mouth trimmed in stainless, a black steel door, and a flue pipe with a cap.',
  facts: ['Floor 32 in across', 'Needs a non-combustible base and 12 in clear on each side', 'Sits on the counter: no cutout'],
});
part({
  id: 'kitchen-sink-bar', family: 'sink', familyName: 'Sink with faucet', type: 'sink', mount: 'dropIn', label: 'Bar sink, 15 in', name: 'Bar sink, 15 in, with gooseneck faucet',
  overall: [17, 17, 7], cutout: [15.5, 15.5, 7], bayIn: 20,
  about: 'An undermount 15 x 15 in brushed stainless bar sink, 6 1/2 in deep, with a single-handle outdoor gooseneck faucet about 13 in tall and a basket strainer.',
  facts: ['Bowl 15 x 15 x 6 1/2 in (outside about 17 x 17)', 'Needs a 20 to 24 in door below', 'Faucet about 13 1/2 in tall, 8 in reach'],
});
part({
  id: 'kitchen-sink-single', family: 'sink', familyName: 'Sink with faucet', type: 'sink', mount: 'dropIn', label: 'Single bowl, 24 in', name: 'Single-bowl outdoor sink, 24 in, with gooseneck faucet',
  overall: [26, 20, 8], cutout: [24.5, 18.5, 8], bayIn: 30,
  about: 'A single-bowl brushed stainless outdoor sink, 24 x 18 x 8 in deep, undermount, with a single-handle gooseneck faucet.',
  facts: ['Bowl 24 x 18 x 8 in', 'Needs a 30 in door below'],
});

// Cold.
part({
  id: 'kitchen-fridge-24', family: 'fridge', familyName: 'Outdoor fridge, under-counter', type: 'fridge', mount: 'front', label: '24 in', name: 'Outdoor fridge, 24 in under-counter',
  overall: [23.75, 24, 34], cutout: [24.5, 24, 34.5], bayIn: 25, hinge: 'right',
  about: 'A UL outdoor-rated 24 in under-counter refrigerator (a Blaze, Summerset, True or Lynx type): a brushed stainless door with a recessed pocket handle at the top, a front vent grille, a lit gray liner with wire shelves.',
  facts: ['Front-vented; 1 in total side clearance', 'Hand tool: open the door'],
});
part({
  id: 'kitchen-ice-maker-15', family: 'ice-maker', familyName: 'Ice maker', type: 'iceMaker', mount: 'front', label: '15 in', name: 'Ice maker, 15 in outdoor',
  overall: [15, 24, 34], cutout: [15.5, 24, 34.5], bayIn: 16, hinge: 'left',
  about: 'A 15 in outdoor-rated ice maker: a stainless door with a bar handle over a front vent grille, an ice bin and scoop inside.',
  facts: ['Needs a drain (gravity or pump) and a water line', 'Hand tool: open the door'],
});
part({
  id: 'kitchen-kegerator-24', family: 'kegerator', familyName: 'Kegerator', type: 'kegerator', mount: 'front', label: '24 in, dual tap', name: 'Kegerator, 24 in, dual tap tower',
  overall: [24, 24, 34], cutout: [24.5, 24, 34.5], bayIn: 25, hinge: 'right',
  about: 'A 24 in outdoor kegerator: a stainless door with a bar handle and a front vent grille, a half-barrel keg inside, and a dual-tap stainless tower on the counter above with a drip tray.',
  facts: ['The tap tower stands about 16 in above the counter', 'Hand tool: open the door'],
});

// Doors and drawers (flush-mount brushed stainless, overall size includes the frame).
const DOORS: [number, number, number, number][] = [[14, 20, 12.5, 18.5], [17, 24, 15.5, 22.5], [20, 24, 18.5, 22.5]];
for (const [w, h, cw, ch] of DOORS) part({
  id: `kitchen-door-${w}`, family: 'door', familyName: 'Access door, single', type: 'door', mount: 'front', label: `${w} in`, name: `Access door, single, ${w} x ${h} in`,
  overall: [w, 2, h], cutout: [cw, 21, ch], bayIn: w + 1, leaves: 1, hinge: 'left',
  about: `A flush-mount ${w} x ${h} in brushed stainless access door: a 3/4 in frame flange around the opening, a double-walled door with a shadow gap all round, a concealed hinge and a vertical bar handle on standoffs. Left or right hinge.`,
  facts: ['Hand tool: open the door'],
});
const DOUBLES: [number, number, number, number][] = [[30, 20, 28.5, 18.5], [33, 22, 31.5, 20.5], [36, 20.5, 34.5, 19], [39, 20.5, 37.5, 19], [42, 21, 40.5, 19.5]];
for (const [w, h, cw, ch] of DOUBLES) part({
  id: `kitchen-double-door-${w}`, family: 'double-door', familyName: 'Access doors, double', type: 'doubleDoor', mount: 'front', label: `${w} in`, name: `Access doors, double, ${w} x ${h} in`,
  overall: [w, 2, h], cutout: [cw, 21, ch], bayIn: w, leaves: 2,
  about: `A flush-mount pair of ${w} x ${h} in brushed stainless doors meeting at the center, a vertical bar handle on each beside the seam${w === 39 ? '; the size that goes under a 40 to 42 in grill or a Blackstone 28 in griddle (38 1/2 in wide)' : ''}.`,
  facts: ['Hand tool: open the doors'],
});
const DRAWERS: [number, number, number, number, number][] = [[2, 17, 18, 15.5, 16.5], [2, 30, 13.5, 28.5, 12], [2, 32, 13.5, 30.5, 12], [3, 17, 22, 15.5, 20.5], [3, 30, 22, 28.5, 20.5], [3, 32, 22, 30.5, 20.5]];
for (const [n, w, h, cw, ch] of DRAWERS) part({
  id: `kitchen-drawers-${n}-${w}`, family: `drawers-${n}`, familyName: `${n === 2 ? 'Two' : 'Three'}-drawer unit`, type: 'drawers', mount: 'front', label: `${w} in`, name: `${n === 2 ? 'Two' : 'Three'}-drawer unit, ${w} x ${h} in`,
  overall: [w, 2, h], cutout: [cw, 23, ch], bayIn: w, drawers: n,
  about: `A flush-mount ${w} x ${h} in brushed stainless ${n}-drawer unit: ${n} equal drawers on full-extension slides in a frame flange, shadow gaps between the fronts, a bar pull across each.`,
  facts: ['About 23 in deep', 'Hand tool: open the drawers'],
});
part({
  id: 'kitchen-propane-cabinet-20', family: 'propane', familyName: 'Propane tank cabinet, vented', type: 'propane', mount: 'front', label: '20 in', name: 'Propane tank cabinet, vented, 20 x 24 in',
  overall: [20, 2, 24], cutout: [18.5, 21, 22.5], bayIn: 20, leaves: 1, hinge: 'right',
  about: 'A vented propane tank cabinet: a 20 x 24 in brushed stainless door with two rows of louvered vents low on the latch side and a vertical bar handle, over a pull-out tray holding one 20 lb tank (12 1/4 in across, 18 in tall).',
  facts: ['Holds one 20 lb tank on a pull-out tray', 'Must be vented to the outside', 'Hand tool: open the door'],
});
part({
  id: 'kitchen-trash-pullout-17', family: 'trash', familyName: 'Trash pull-out', type: 'trash', mount: 'front', label: '17 in', name: 'Trash pull-out, 17 x 24 in',
  overall: [17, 2, 24], cutout: [15.5, 22, 22.5], bayIn: 18,
  about: 'A brushed stainless trash pull-out: a door front with a bar pull across the top on full-extension slides, carrying a 32 qt bin.',
  facts: ['32 qt bin, 21 to 23 in deep', 'Hand tool: pull it out'],
});
part({
  id: 'kitchen-paper-towel-holder', family: 'towel', familyName: 'Paper towel holder', type: 'towel', mount: 'front', label: '13 in', name: 'Paper towel holder, flush mount, 13 in',
  overall: [13.5, 5, 7], cutout: [12.25, 5, 5.5], bayIn: 14,
  about: 'A flush-mount brushed stainless paper towel holder: a frame with a rounded opening and a towel roll on a rod. Set high in a bay, over a door or drawers.',
  facts: ['Stacks over a door or drawers in the same bay'],
});

// Seating.
part({
  id: 'kitchen-stool-counter', family: 'stool', familyName: 'Stool', type: 'stool', mount: 'free', label: 'Counter, 26 in', name: 'Counter stool, 26 in seat',
  overall: [18, 19, 36], bayIn: 24,
  about: 'An outdoor counter stool for a 36 in counter: a black powder-coated aluminum frame with a footrest, a teak slat seat 26 in high and a low slatted back.',
  facts: ['Seat 26 in high, about 18 in wide', 'Allow 24 in per stool'],
});
part({
  id: 'kitchen-stool-bar', family: 'stool', familyName: 'Stool', type: 'stool', mount: 'free', label: 'Bar, 30 in', name: 'Bar stool, 30 in seat',
  overall: [18, 19, 41], bayIn: 24,
  about: 'An outdoor bar stool for a 42 in bar ledge: the same frame and teak seat at 30 in.',
  facts: ['Seat 30 in high, about 18 in wide', 'Allow 24 in per stool'],
});

// Finishes, each shown on a 4 ft stub of island.
for (const c of COUNTER_FINISHES) part({
  id: `kitchen-counter-${c.id}`, family: 'counter', familyName: 'Countertop', type: 'counter', mount: 'finish', label: c.name.replace(/^[^,]*, /, ''), name: `Countertop, ${c.name.toLowerCase()}`,
  overall: [48, 31.5, 36], bayIn: 48, finish: c.id,
  about: `${c.note}. Eased square edge, 1 1/2 in past the veneer at the front and ends.`,
  facts: [`${fmt(c.thicknessIn)} in thick`, 'Counter 36 in high'],
});
for (const v of VENEER_FINISHES) part({
  id: `kitchen-veneer-${v.id}`, family: 'veneer', familyName: 'Island veneer', type: 'veneer', mount: 'finish', label: v.name.replace(/^MSI /, '').replace(/ ledger$/, ''), name: `Island veneer, ${v.name}`,
  overall: [48, 30, 36], bayIn: 48, finish: v.id,
  about: `${v.note}.`,
  facts: [v.kind === 'ledger' ? '6 x 24 in panels with 6 x 18 x 6 in corners' : 'Usually paired with a stone or tile wainscot', `${fmt(v.thicknessIn)} in over cement board`],
});

export const KITCHEN_PARTS: KitchenPart[] = parts;
export const kitchenPartById = new Map(parts.map((p) => [p.id, p]));

/* ------------------------------------------------------------------ */
/* Islands                                                              */
/* ------------------------------------------------------------------ */

/**
 * One bay of a run, left to right as you face the front. A bay with no part is plain counter over veneer.
 */
export interface KitchenBay {
  /** Width along the run, inches. */
  widthIn: number;
  /** A drop-in or on-counter part in the counter over this bay. */
  top?: string;
  /** What fills the bay's front face, top to bottom (a towel holder over a door). */
  front?: string[];
  /** A single door's hinge side, as you face it (else the part's own). */
  hinge?: 'left' | 'right';
  /** Choices for the bay's parts' options (a grill's rotisserie). */
  options?: Record<string, boolean>;
}

/**
 * A straight run of bays. The first run lies along the island's x axis, its front facing +z. Each later run turns at the
 * end of the one before it (`turn`, as you face the first run's front: 'left' brings it toward you on the left end,
 * 'right' on the right end) and shares the corner square, depthIn on a side, with it: its length is measured from the
 * outside of the corner, and its bays start after the corner.
 */
export interface KitchenRun {
  lengthIn: number;
  bays: KitchenBay[];
  turn?: 'left' | 'right';
}

export interface KitchenIsland {
  /** 'straight' (one run), 'L' (two) or 'U' (three). The builder draws straight islands; L and U are kept in the data. */
  shape: 'straight' | 'L' | 'U';
  runs: KitchenRun[];
  /** Base depth (veneer face to veneer face), inches. */
  depthIn: number;
  /** Floor to the counter's top, inches. */
  counterHeightIn: number;
  counter: {
    finish: string;
    /** Slab thickness, inches (else the finish's own). */
    thicknessIn?: number;
    /** Past the veneer at the front, back and ends, inches. */
    overhangIn: { front: number; back: number; ends: number };
    edge: 'eased' | 'bullnose' | 'chiseled';
  };
  veneer: string;
  /**
   * A raised bar ledge behind the base: a veneered pony wall `wallIn` thick standing on the patio behind the base, its
   * top `heightIn` from the floor, the bar top running `overhangIn` past it on the seating side.
   */
  barLedge?: { heightIn: number; wallIn: number; overhangIn: number; stools?: number; stool?: string };
  /** An LED strip under the counter's front overhang, washing the veneer. */
  light?: { kelvin: number; lumensPerFt: number };
  /** What is at each end: 'finished' (veneer wraps it, counter overhangs) or 'wall' (butts a wall). */
  ends: { left: 'finished' | 'wall'; right: 'finished' | 'wall' };
  /** Fuel the cooking parts run on (noted, not drawn). */
  fuel: 'propane' | 'natural gas';
}

/** The tops of an island's framed fronts (doors, drawers) line up this far under the counter's top, inches. */
export const FRONT_DROP = 6.75;

/** Problems with an island's layout, in words (empty when it fits). */
export function checkIsland(isl: KitchenIsland): string[] {
  const out: string[] = [];
  const top = isl.counterHeightIn;
  isl.runs.forEach((run, ri) => {
    const corner = ri > 0 ? isl.depthIn : 0;
    const sum = run.bays.reduce((s, b) => s + b.widthIn, 0) + corner;
    if (Math.abs(sum - run.lengthIn) > 0.01) out.push(`Run ${ri + 1}: bays add up to ${sum} in, the run is ${run.lengthIn} in`);
    for (const b of run.bays) {
      const t = b.top ? kitchenPartById.get(b.top) : undefined;
      if (b.top && !t) out.push(`Unknown part ${b.top}`);
      if (t?.cutout && t.cutout[0] > b.widthIn + 0.01) out.push(`${t.name}: its ${t.cutout[0]} in cutout is wider than its ${b.widthIn} in bay`);
      if (t?.cutout && t.cutout[1] > isl.depthIn + isl.counter.overhangIn.front) out.push(`${t.name}: its ${t.cutout[1]} in cutout is deeper than the counter`);
      let h = 0, floor = false;
      for (const id of b.front ?? []) {
        const p = kitchenPartById.get(id);
        if (!p) { out.push(`Unknown part ${id}`); continue; }
        if (p.overall[0] > b.widthIn + 0.01) out.push(`${p.name} is wider than its ${b.widthIn} in bay`);
        if (p.type === 'fridge' || p.type === 'iceMaker' || p.type === 'kegerator') floor = true;
        h += p.overall[2] + (h ? 1.5 : 0);
      }
      // Framed fronts hang from a line FRONT_DROP under the counter's top; cold units stand on the patio under the counter.
      const below = floor ? top - 1.25 : top - FRONT_DROP;
      if (h > below + 0.01) out.push(`Bay of ${b.widthIn} in: its fronts (${h} in) do not fit under the counter (${below.toFixed(2)} in)`);
      if (floor && (b.front?.length ?? 0) > 1) out.push(`Bay of ${b.widthIn} in: a cold unit takes the whole bay`);
    }
  });
  if (isl.shape === 'straight' && isl.runs.length !== 1) out.push('A straight island has one run');
  return out;
}

/* ------------------------------------------------------------------ */
/* Catalog features                                                     */
/* ------------------------------------------------------------------ */

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

/**
 * A straight island of 10 ft 6 in from a customer design: left to right, 17 1/2 in of counter, a 32 in three-drawer unit,
 * a Blackstone 28 in built-in griddle (38 1/2 in wide, 38 3/4 x 27 1/2 x 8 in cutout) over 39 in double doors, a 20 in
 * vented propane cabinet, 17 1/2 in of counter. The design drew the griddle in a 28 in bay with 23 in counters; the
 * real griddle needs 39 in, so the island stays 126 in and the end counters were shortened (the owner's decision).
 * Light gray granite with a 1 1/2 in overhang, MSI Silver Travertine ledger on all four sides, an LED strip under the
 * front overhang, propane.
 */
export const LEDGERSTONE_GRIDDLE_ISLAND: KitchenIsland = {
  shape: 'straight',
  runs: [{
    lengthIn: 126,
    bays: [
      { widthIn: 17.5 },
      { widthIn: 32, front: ['kitchen-drawers-3-32'] },
      { widthIn: 39, top: 'kitchen-griddle-blackstone-28', front: ['kitchen-double-door-39'] },
      { widthIn: 20, front: ['kitchen-propane-cabinet-20'] },
      { widthIn: 17.5 },
    ],
  }],
  depthIn: 30,
  counterHeightIn: 36,
  counter: { finish: 'granite-light-gray', overhangIn: { front: 1.5, back: 1.5, ends: 1.5 }, edge: 'eased' },
  veneer: 'msi-silver-travertine',
  light: { kelvin: 3000, lumensPerFt: 150 },
  ends: { left: 'finished', right: 'finished' },
  fuel: 'propane',
};

/** The raised bar ledge an island takes when its `barLedge` option is on (and it has none of its own). */
export const DEFAULT_BAR_LEDGE: NonNullable<KitchenIsland['barLedge']> = { heightIn: 42, wallIn: 6, overhangIn: 12, stools: 4, stool: 'kitchen-stool-bar' };

export const KITCHEN_ISLAND_FEATURES: FeatureSpec[] = [
  F({
    id: 'kitchen-island-ledgerstone-griddle-126', name: 'Ledgerstone griddle island, 10 ft 6 in', group: 'Kitchens', kind: 'kitchenIsland', footprint: [126 * IN, 30 * IN],
    island: LEDGERSTONE_GRIDDLE_ISLAND,
    options: [{ key: 'underLight', label: 'Under-counter light on', default: true }, { key: 'barLedge', label: 'Raised bar ledge behind, 42 in, with stools', default: false }],
    about: 'A straight 10 ft 6 in outdoor kitchen island: a Blackstone 28 in built-in griddle over double access doors, a three-drawer unit on its left and a vented propane cabinet on its right, light gray granite on a base clad in MSI Silver Travertine ledger stone on all four sides, with an LED strip under the counter\'s front edge.',
    facts: [
      '126 in long x 30 in deep base, counter 36 in high (129 x 33 in of granite, 1 1/2 in overhang)',
      'Bays left to right: counter 17 1/2 in, three-drawer unit 32 in, griddle 39 in, propane cabinet 20 in, counter 17 1/2 in',
      'Blackstone 28 in built-in griddle, 38 1/2 in wide (cutout 38 3/4 x 27 1/2 x 8 in), over 39 x 20 1/2 in double doors; propane',
      'Three-drawer unit 32 x 22 in; propane cabinet 20 x 24 in, vented, 20 lb tank on a pull-out tray',
      'Light gray granite, 3 cm, eased edge; MSI Silver Travertine Panel 6x24 (LPNLTSIL624) on all sides',
      'LED strip under the front overhang, 3000 K',
      'Option: a 42 in raised bar ledge on a 6 in wall behind the base, 12 in overhang, four bar stools',
      'Hand tool: griddle hood, doors, drawers, under-counter light',
    ],
  }),
];

/** Parts as features the builder and the Library can draw (never offered in a plan; see the top of this file). */
export const KITCHEN_PART_FEATURES: FeatureSpec[] = parts.map((p) => {
  const [w, d] = partFootprint(p);
  return F({ id: p.id, name: p.name, group: 'Kitchens', kind: 'kitchenPart', footprint: [w * IN, d * IN], kitchenPart: p.id, options: p.options, about: p.about, facts: p.facts });
});

/** The stub of island a part is shown in (its Library sample), inches [length, depth]. */
export function partFootprint(p: KitchenPart): [number, number] {
  if (p.mount === 'free') return [p.overall[0], p.overall[1]];
  return [partStub(p).runs[0].lengthIn, 30];
}

/** A short island a part is shown in on its own: its bay with a little counter each side. */
export function partStub(p: KitchenPart): KitchenIsland {
  const side = 8;
  let bays: KitchenBay[];
  if (p.mount === 'finish') bays = [{ widthIn: 48 }];
  else if (p.mount === 'dropIn' || p.mount === 'onCounter') bays = [{ widthIn: side }, { widthIn: p.bayIn, top: p.id }, { widthIn: side }];
  else bays = [{ widthIn: side }, { widthIn: p.bayIn, front: [p.id] }, { widthIn: side }];
  const lengthIn = bays.reduce((s, b) => s + b.widthIn, 0);
  return {
    ...LEDGERSTONE_GRIDDLE_ISLAND,
    runs: [{ lengthIn, bays }],
    counter: { ...LEDGERSTONE_GRIDDLE_ISLAND.counter, finish: p.type === 'counter' ? p.finish! : LEDGERSTONE_GRIDDLE_ISLAND.counter.finish },
    veneer: p.type === 'veneer' ? p.finish! : LEDGERSTONE_GRIDDLE_ISLAND.veneer,
    light: undefined,
  };
}
