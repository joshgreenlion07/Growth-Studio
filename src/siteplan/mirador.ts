import type { FeatureOption, FeatureSpec } from './catalog';

/*
 * Mirador 111 louvered aluminum pergolas, 10 x 10 ft and 10 x 20 ft, with what a customer job hung on them: café
 * string lights and a weatherproof GFCI outlet on a post. Built by `builder/mirador.ts`.
 *
 * Maker: Zhejiang Zhengte Co., Ltd. (Linhai, China), sold as Mirador by Sorara Outdoor Living USA (miradoroutdoor.com)
 * and through Costco, Home Depot, Lowe's and Walmart. The 111 series (Premium / 111A single aluminum louver, Classic /
 * 111S single steel louver, Deluxe / 111DA double aluminum louver) shares one frame; Costco's "Adjustable Louvered
 * Aluminum Pergola" has aluminum louvers. Drawn here as the single-louver 111 frame in Mirador's Charcoal.
 *
 * Where each number comes from:
 * - Mirador's dimension drawing for the 111 10 x 10 and 10 x 20 (the listing drawing, reproduced on a job's blueprint):
 *   posts 5.5 in square, 108.7 in clear between posts, 119.7 in over the posts (234 in long on the 10 x 20), beams
 *   118.6 in over their outer faces and 109.8 in between their inner faces (4.4 in wide, set 0.55 in in from the post
 *   faces), 98.7 in tall, 93.1 in clear under the beams (beams 5.6 in deep), foot plate 6.7 in.
 * - Mirador's 111 instruction manuals (4 pillars and 6 pillars, 23v1.1): 19 louvers on the 10 x 10 and 38 on the 10 x 20
 *   (6 pillars: 4 corner, 2 middle); louver pitch 152.4 mm (6.0 in), from the manuals' pillar-spacing tables (each
 *   step of 609.5 mm adds 4 louvers); louvers on shaft supports in the side beams with a shaft support cover at each
 *   end, an end cap on each louver end, one end cap with a control arm on the driving louver, and connecting strips on
 *   both side beams (single-louver models) pinned to every louver; a gearbox in the side beam turned by a crank that
 *   hangs vertical next to a corner pillar (one on the 10 x 10, two on the 10 x 20, one at each end); a foot plate and
 *   foot plate cover on each pillar ("wide opening facing outwards": the gutter's outlet), 4 M8 x 80 mm anchor bolts
 *   per plate; pillar covers on the tops; drains in the gutters. Mirador's comparison page: 111 louvers open 0 to 93
 *   degrees; colors Charcoal and White.
 * - The job's structural sheet (engineer's foundation plan, for this frame): 30 x 30 x 12 in footing, 12 x 12 x 12 in
 *   pedestal on it, the post on a 6.69 x 6.69 x 1/4 in steel base plate, 4 M10 x 80 mm expansion bolts on a 5.51 in
 *   square, 2 3/4 in embedment.
 * - Read from Mirador's product photos (no published size): the foot plate cover about 7.3 in square and 1 1/2 in
 *   tall, the blade's lips, the crank's length (its handle about 4 1/2 ft up), the gearbox housing.
 */

const IN = 0.0254;

/** The Mirador 111 frame, inches (see the sources above). */
export const MIRADOR_111 = {
  post: 5.5,
  /** Over the posts: across (the louvers' span) and along, by size. */
  across: 119.7,
  along: { '10x10': 119.7, '10x20': 234 } as const,
  /** Beam width (4.4: 118.6 over the beams' faces, 109.8 between them) and depth (98.7 - 93.1). */
  beamW: 4.4,
  beamH: 5.6,
  height: 98.7,
  clearance: 93.1,
  /** Louvers per size and their pitch. */
  louvers: { '10x10': 19, '10x20': 38 } as const,
  pitch: 6.0,
  /** Blade width (a little over the pitch: closed, each overlaps the next) and the open angle. */
  blade: 6.4,
  openDeg: 93,
  /** Foot plate (the engineer's base plate) and its bolt square, the foot plate cover. */
  plate: 6.69,
  plateT: 0.25,
  boltSquare: 5.51,
  cover: 7.3,
  coverH: 1.5,
};

/** The job's pedestal under each post (engineer's sheet): 12 in square; its top stands 1/2 in proud of the paving. */
export const PERGOLA_PEDESTAL = { size: 12, reveal: 0.5, footing: 30 };

export type MiradorSize = keyof typeof MIRADOR_111.louvers;

/**
 * Café string lights, 120 V plug-in, commercial grade (the design calls for one 100 ft set on the 10 x 20 and one
 * 55 ft set on the 10 x 10 and shows globe bulbs). PartyLights.com commercial grade suspended medium-base stringer,
 * black 14 AWG cord, sockets every 24 in, each suspender hanging 4 in from the cord to the bottom of its socket: the
 * 100 ft set has 50 sockets and an 8 ft lead (KMS100BK... series); the 48 ft set (24 sockets, 12 in lead and tail,
 * end-to-end connectable) is the nearest real length to the 55 ft the design asks for. Bulbs: PartyLights LED G50
 * (LEDPFLG50), a 2 in glass globe on a medium E26 base, 0.8 W, 2700 K, rated like an 11 W incandescent (about 60 lm,
 * an estimate: lumens are not published).
 */
export const CAFE_LIGHTS = {
  spacing: 24,
  /** Suspender from the cord to the bottom of the socket. */
  drop: 4,
  cordOD: 0.3,
  socket: { d: 1.25, h: 1.6 },
  bulb: { d: 2.0, h: 3.0, kelvin: 2700, lumens: 60 },
  sets: {
    '10x20': { lengthFt: 100, sockets: 50, leadIn: 96, name: '100 ft, 50 sockets' },
    '10x10': { lengthFt: 48, sockets: 24, leadIn: 12, name: '48 ft, 24 sockets' },
  } as const,
};

/**
 * The weatherproof outlet, as Green Lion mounts one: a gray PVC FS weatherproof box screwed to the post face by its
 * mounting feet, a GFCI receptacle in it, the TayMac in-use cover Green Lion uses (1-gang or 2-gang) on it, and gray PVC
 * conduit from the box's bottom hubs straight down the post face into the ground, held by two-hole PVC straps, each
 * turning in a 90 degree sweep elbow at the trench depth toward the underground run. The box and cover are drawn for the
 * look (the owner's call: reference only); the conduit follows what a job's blueprint calls for (size and schedule are
 * choices).
 *
 * - Cover, 1-gang: TayMac (Hubbell) EXTRA DUTY MM420C, clear polycarbonate, 16-in-1, 2 3/4 in deep in use, 5.88 in tall
 *   x 4.5 in wide x 3.05 in actual depth, lid hinged at the top, lockable tab (1/4 in shackle), horizontal or vertical
 *   mount, attached gasket: https://www.hubbell.com/taymac/en/products/1-gang-weatherproof-in-use-cover-extra-duty-series-16-in-1-2-34-in-deep-clear/p/19635978
 *   It is the cover in TayMac's kit MKG420CS (cover, weatherproof box, 15 A WR/TR self-test GFCI) that Lowe's sells as
 *   item 690018: https://www.lowes.com/pd/TayMac-1-Gang-Rectangle-Plastic-Electrical-Box-Cover/999968881 (kit 5.89 x 4.53
 *   in, 5.1 in deep on the box).
 * - Cover, 2-gang: TayMac EXTRA DUTY MM2420C, clear polycarbonate, 55-in-1, 2 3/4 in deep in use, 5.5 in tall x 5.43 in
 *   wide x 3.07 in actual depth: https://www.hubbell.com/taymac/en/products/2-gang-weatherproof-in-use-cover-extra-duty-series-55-in-1-2-34-in-deep-clear/p/19635966
 * - Box, 1-gang: Carlon (ABB) E982DFN, PVC, gray, shallow 1-gang FSS (two 1/2 in hubs in one end), 4.54 x 2.8 in, 2.42 in
 *   deep, 18 cu in, mounting feet; the same box is made with 3/4 and 1 in hubs (E982EFN, E982FFN by Carlon's naming).
 * - Box, 2-gang: Carlon E9812D, PVC, gray, 2-gang FSC, 4.62 x 4.62 in, 1.98 in deep, 32 cu in, 1/2 in hubs (one each end;
 *   the top one plugged), so one conduit runs down from it.
 * - Receptacle: the kit's Hubbell WR/TR self-test GFCI (decorator face 1.31 x 2.62 in), white.
 * - Conduit: gray PVC, trade size 1/2, 3/4 or 1 in (0.840, 1.050, 1.315 in outside, the same for Schedule 40 and 80);
 *   two-hole PVC straps, one at mid-height and one just above grade. The owner's photo shows 1/2 in Schedule 40; a job's
 *   electrical notes may call for Schedule 80 1 in stub-ups, so both are choices.
 */
export const TAYMAC_COVER = {
  1: { model: 'MM420C', w: 4.5, h: 5.88, d: 3.05 },
  2: { model: 'MM2420C', w: 5.43, h: 5.5, d: 3.07 },
} as const;
export const FS_BOX = {
  1: { model: 'Carlon E982DFN', w: 2.8, h: 4.54, d: 2.42, hubs: 2 },
  2: { model: 'Carlon E9812D', w: 4.62, h: 4.62, d: 1.98, hubs: 1 },
} as const;
/** PVC conduit outside diameters by trade size (inches). */
export const PVC_CONDUIT_OD = { '1/2': 0.84, '3/4': 1.05, '1': 1.315 } as const;
export type ConduitSize = keyof typeof PVC_CONDUIT_OD;

/**
 * PVC 90 degree sweep elbows' radius by trade size (inches, NEMA TC 2 standard radius), and the trench depth the
 * stub-up's elbow turns at (a job's electrical notes: conduit in a trench 12 in deep).
 */
export const PVC_SWEEP_R = { '1/2': 4.0, '3/4': 4.5, '1': 5.75 } as const;
export const TRENCH_DEPTH = 12;

/** Which way a stub-up's elbow turns under grade, in the feature's local frame (x along, z toward its front). */
export type ElbowWay = 'front' | 'back' | 'left' | 'right';

/**
 * An outlet's choices on its placement: 2-gang, conduit size and schedule, one conduit or two (in and out), and the
 * way the elbow turns to meet the underground run (defaults: 1-gang, 1/2 in Schedule 40, two conduits, elbow to the
 * front). A 1 in stub-up meets a 3/4 in Schedule 40 underground run through a reducing coupling (a job's notes: 3/4 in
 * Schedule 40 underground, Schedule 80 1 in stub-ups); smaller stub-ups run on underground at their own size.
 */
export function outletChoice(opt: (k: string) => boolean): { gang: 1 | 2; conduit: ConduitSize; schedule80: boolean; two: boolean; elbow: ElbowWay } {
  return {
    gang: opt('twoGang') ? 2 : 1,
    conduit: opt('conduit1in') ? '1' : opt('conduit34in') ? '3/4' : '1/2',
    schedule80: opt('schedule80'),
    two: !opt('singleConduit'),
    elbow: opt('elbowLeft') ? 'left' : opt('elbowRight') ? 'right' : opt('elbowBack') ? 'back' : 'front',
  };
}

/** How far a stub-up's tail runs on from the end of its elbow's bend (inches): bell, a short length and the coupling. */
export const STUB_TAIL = 8.2;

/**
 * Where an outlet's conduits drop (inches, across the box from its center, and out from the post face): the hubs in the
 * box's bottom (two side by side in the 1-gang FSS, widened for the larger conduits; one in the 2-gang), the ones used
 * (the second only when the run goes on), and how far out from the face each drops: the box's mid-depth, or kicked
 * out to clear something proud of the face low down (`clearD`, a foot plate cover). Builder and join share it.
 */
export function outletLayout(choice: ReturnType<typeof outletChoice>, clearD?: number) {
  const box = FS_BOX[choice.gang];
  const r = PVC_CONDUIT_OD[choice.conduit] / 2, hubR = r + 0.17;
  const bw = box.hubs === 2 ? Math.max(box.w, 4 * hubR + 0.3) : box.w;
  const hubXs = box.hubs === 2 ? [-1, 1].map((s) => s * (hubR + 0.12)) : [0];
  const runXs = choice.two && hubXs.length === 2 ? hubXs : [hubXs[hubXs.length - 1]];
  const zc = box.d / 2;
  const zOut = clearD !== undefined ? Math.max(zc, clearD + r + 0.06) : zc;
  return { box, r, hubR, bw, hubXs, runXs, zc, zOut };
}

/** A placement's on/off option, or its default (catalog's featureOption, kept here so this file needs no runtime import). */
function optionOf(spec: FeatureSpec, options: Record<string, boolean> | undefined, key: string): boolean {
  return options?.[key] ?? spec.options?.find((o) => o.key === key)?.default ?? false;
}

/**
 * Every stub-up a placed outlet feature drops into the ground, in its local frame (inches: x along, z toward its
 * front): which outlet (`key`: a pergola post's option key, or 'post'), which conduit of it (`k`), and the riser's
 * axis. Empty for features without outlets.
 */
export function outletStubUps(spec: FeatureSpec, options: Record<string, boolean> | undefined): { key: string; k: number; x: number; z: number }[] {
  const opt = (k: string) => optionOf(spec, options, k);
  const choice = outletChoice(opt);
  if (spec.kind === 'outletPost') {
    const lay = outletLayout(choice);
    return lay.runXs.map((x, k) => ({ key: 'post', k, x, z: OUTLET_POST.size / 2 + lay.zc }));
  }
  if (spec.model !== 'mirador-111') return [];
  const size: MiradorSize = spec.id.endsWith('10x20') ? '10x20' : '10x10';
  const lay = outletLayout(choice, opt('footCovers') ? (MIRADOR_111.cover - MIRADOR_111.post) / 2 : undefined);
  return miradorPosts(size).filter((p) => opt(p.key)).flatMap((p) => {
    const sz = Math.sign(p.z) || 1;
    return lay.runXs.map((x, k) => ({ key: p.key, k, x: p.x + x, z: p.z + sz * (MIRADOR_111.post / 2 + lay.zOut) }));
  });
}

/** On a pergola post the box's center stands 24 in above the paving. */
export const PERGOLA_OUTLET_Y = 24;

/**
 * The free-standing outlet post: a pressure-treated 4x4 (3 1/2 in actual), set in a concrete-filled hole, cut square
 * on top, 30 to 36 in above grade (32 in as usual); the box's top 3 1/2 in under the post top.
 */
export const OUTLET_POST = { size: 3.5, heights: [30, 32, 34, 36], height: 32, boxDrop: 3.5 };

const outletOptions = (): FeatureOption[] => [
  { key: 'twoGang', label: '2-gang box and cover (TayMac MM2420C)', default: false },
  { key: 'conduit34in', label: 'Conduit 3/4 in', default: false },
  { key: 'conduit1in', label: 'Conduit 1 in', default: false },
  { key: 'schedule80', label: 'Conduit Schedule 80 (off: Schedule 40)', default: false },
  { key: 'singleConduit', label: 'One conduit (end of the run; off: in and out)', default: false },
  { key: 'elbowLeft', label: 'Underground elbow turns left', default: false },
  { key: 'elbowRight', label: 'Underground elbow turns right', default: false },
  { key: 'elbowBack', label: 'Underground elbow turns back, under the post', default: false },
];

/** The pergola's posts, local inches (x along, z across; front is +z), with the option key of an outlet on each. */
export function miradorPosts(size: MiradorSize): { x: number; z: number; key: string; label: string }[] {
  const L = MIRADOR_111.along[size], W = MIRADOR_111.across, p = MIRADOR_111.post;
  const px = L / 2 - p / 2, pz = W / 2 - p / 2;
  const out = [
    { x: -px, z: pz, key: 'outletFL', label: 'front left' },
    { x: px, z: pz, key: 'outletFR', label: 'front right' },
    { x: -px, z: -pz, key: 'outletBL', label: 'back left' },
    { x: px, z: -pz, key: 'outletBR', label: 'back right' },
  ];
  if (size === '10x20') out.push({ x: 0, z: pz, key: 'outletFM', label: 'front middle' }, { x: 0, z: -pz, key: 'outletBM', label: 'back middle' });
  return out;
}

export type ElectricKind = 'outletPost';

/** The class each switches within (catalog SWAP_CLASS). */
export const ELECTRIC_SWAP: Record<ElectricKind, string> = { outletPost: 'Outlets' };

const F = (s: Omit<FeatureSpec, 'placeholder'>): FeatureSpec => ({ ...s, placeholder: true });

const options = (size: MiradorSize): FeatureOption[] => [
  { key: 'louversOpen', label: 'Louvers fully open', default: false },
  { key: 'louversClosed', label: 'Louvers closed (flat)', default: false },
  { key: 'cafeLights', label: `Café string lights, 120 V (${CAFE_LIGHTS.sets[size].name})`, default: false },
  ...miradorPosts(size).map((p) => ({ key: p.key, label: `Weatherproof outlet on the ${p.label} post`, default: false })),
  ...outletOptions(),
  { key: 'footCovers', label: 'Foot plate covers (off: show the base plates and anchors)', default: true },
];

const PAGE = 'https://www.miradoroutdoor.com/pages/pergolas-comparison';

export const MIRADOR_FEATURES: FeatureSpec[] = [
  F({
    id: 'mirador-111-10x10', name: 'Mirador 111 10 x 10 ft louvered pergola, Charcoal', group: 'Shade', kind: 'pergolaLouvered', model: 'mirador-111',
    footprint: [MIRADOR_111.along['10x10'] * IN, MIRADOR_111.across * IN], maker: 'Mirador (Zhejiang Zhengte)', page: PAGE,
    about: 'Mirador 111: a freestanding aluminum pergola with a crank-operated louvered roof (19 louvers that turn from closed flat to 93 degrees open), gutters in the beams draining out through the posts, on four 5.5 in posts.',
    facts: ['119.7 x 119.7 in over the posts, 98.7 in tall, 93.1 in clear under the beams', '5.5 in square posts, 108.7 in clear between them; beams 4.4 x 5.6 in', '19 louvers at a 6 in pitch, 0 to 93 degrees, one crank', 'Powder-coated aluminum, Charcoal; 6.7 in foot plates with covers'],
    options: options('10x10'),
  }),
  F({
    id: 'mirador-111-10x20', name: 'Mirador 111 10 x 20 ft louvered pergola, Charcoal', group: 'Shade', kind: 'pergolaLouvered', model: 'mirador-111',
    footprint: [MIRADOR_111.along['10x20'] * IN, MIRADOR_111.across * IN], maker: 'Mirador (Zhejiang Zhengte)', page: PAGE,
    about: 'Mirador 111 in the 6-pillar 10 x 20 size: two 10 x 10 bays under one louvered roof (38 louvers, two cranks), corner and middle posts, gutters in the beams draining out through the posts.',
    facts: ['234 x 119.7 in over the posts, 98.7 in tall, 93.1 in clear under the beams', 'Six 5.5 in square posts (4 corner, 2 middle), bays 108.7 in clear', '38 louvers at a 6 in pitch, 0 to 93 degrees, two cranks', 'Powder-coated aluminum, Charcoal; 6.7 in foot plates with covers'],
    options: options('10x20'),
  }),
  F({
    id: 'outlet-post-4x4-in-use', name: 'Outlet post, 4x4 with TayMac in-use GFCI outlet', group: 'Accents', kind: 'outletPost',
    footprint: [OUTLET_POST.size * IN, OUTLET_POST.size * IN], maker: 'TayMac (Hubbell)', page: 'https://www.hubbell.com/taymac/en/products/1-gang-weatherproof-in-use-cover-extra-duty-series-16-in-1-2-34-in-deep-clear/p/19635978',
    sizes: OUTLET_POST.heights.map((h) => ({ label: `${h} in above grade`, size: [OUTLET_POST.size * IN, OUTLET_POST.size * IN, h * IN] as [number, number, number] })),
    size: OUTLET_POST.heights.indexOf(OUTLET_POST.height),
    about: 'A free-standing outdoor outlet in a bed, the way Green Lion sets one: a pressure-treated 4x4 in a concrete-filled hole, a gray PVC FS box on its face with a GFCI under a clear TayMac EXTRA DUTY in-use cover, and two gray PVC conduits down the post into the ground.',
    facts: ['Pressure-treated 4x4 (3 1/2 in), 32 in above grade (30 to 36), cut square', 'Carlon E982DFN gray PVC FS box, two 1/2 in hubs on the bottom', 'TayMac MM420C clear in-use cover, 2 3/4 in deep (2-gang MM2420C as a choice)', '1/2 in Schedule 40 PVC conduit (3/4, 1 in, Schedule 80 as choices), two-hole straps, sweep elbow 12 in down'],
    options: outletOptions(),
  }),
];
