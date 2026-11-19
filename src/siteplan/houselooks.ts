import type { ExistingStructure, HouseLook } from './types';

/**
 * The colors and finishes a house, garage or shed can be shown in (`structure.look`). These describe the client's own
 * house so the yard reads against it; they are not products Green Lion sells, so they are plain color names, not maker
 * lines. Area Planner keeps a copy of these lists (HOUSE_OPTS in its index.html): change both together.
 *
 * Each list's first entry is the default. `sw` is the swatch (sRGB hex) the material is tinted to.
 */

export interface HouseSwatch { id: string; name: string; sw: string }
export interface RoofBlend extends HouseSwatch {
  /** The tile-to-tile (or shingle-to-shingle) colors of the blend, sRGB hex, mixed by the texture. */
  mix: string[];
}
export interface RoofMaterial { id: 'concrete-flat' | 'concrete-s' | 'shingle' | 'metal'; name: string; short: string; blends: RoofBlend[] }

export const WALL_COLORS: HouseSwatch[] = [
  { id: 'sand', name: 'Sand', sw: '#d8cdb8' },
  { id: 'greige', name: 'Greige (warm tan-taupe)', sw: '#b2a690' },
  { id: 'warm-white', name: 'Warm white', sw: '#e3ddd1' },
  { id: 'beige', name: 'Beige', sw: '#cfbfa3' },
  { id: 'light-gray', name: 'Light gray', sw: '#c7c6c0' },
  { id: 'taupe', name: 'Taupe', sw: '#9f9180' },
  { id: 'sage', name: 'Sage', sw: '#a5aa91' },
  { id: 'cream', name: 'Cream', sw: '#e0d3b4' },
  { id: 'charcoal', name: 'Charcoal', sw: '#56575a' },
];

/** `match` is the wall color itself, a shade darker. */
export const TRIM_COLORS: HouseSwatch[] = [
  { id: 'stone', name: 'Stone', sw: '#d9d3c8' },
  { id: 'white', name: 'White', sw: '#e4e1da' },
  { id: 'cream', name: 'Cream', sw: '#ddd2bb' },
  { id: 'match', name: 'Same as the walls', sw: '' },
  { id: 'tan', name: 'Tan', sw: '#b5a287' },
  { id: 'brown', name: 'Brown', sw: '#5a4636' },
  { id: 'charcoal', name: 'Charcoal', sw: '#3c3d3f' },
];

export const WINDOW_COLORS: HouseSwatch[] = [
  { id: 'white', name: 'White', sw: '#e6e4de' },
  { id: 'almond', name: 'Almond', sw: '#d2c3a6' },
  { id: 'bronze', name: 'Bronze', sw: '#4b3e32' },
  { id: 'black', name: 'Black', sw: '#232325' },
];

export const ROOFS: RoofMaterial[] = [
  {
    id: 'concrete-flat', name: 'Flat concrete tile (slate profile)', short: 'Flat concrete tile',
    blends: [
      { id: 'gray-brown', name: 'Gray-brown blend', sw: '#6c665e', mix: ['#756f66', '#665f58', '#7d766c', '#5c5650', '#6f685f'] },
      { id: 'charcoal', name: 'Charcoal blend', sw: '#4b4a49', mix: ['#4e4d4c', '#423f3e', '#5a5856', '#3b3a3a'] },
      { id: 'brown', name: 'Brown blend', sw: '#5e4a3b', mix: ['#644f3f', '#55433a', '#6e5846', '#4b3c33'] },
      { id: 'tan', name: 'Tan blend', sw: '#93806a', mix: ['#9a8670', '#887562', '#a69178', '#7d6c5b'] },
      { id: 'slate-gray', name: 'Slate gray', sw: '#5f6366', mix: ['#62666a', '#585c60', '#6b6f72'] },
    ],
  },
  {
    id: 'concrete-s', name: 'S-tile (barrel profile)', short: 'S-tile',
    blends: [
      { id: 'terracotta', name: 'Terra cotta blend', sw: '#a0573b', mix: ['#a85c3e', '#94503a', '#b56a47', '#8a4a35'] },
      { id: 'mission', name: 'Mission blend (red, brown and tan)', sw: '#8f5b43', mix: ['#a35d40', '#7b5240', '#a07a5b', '#6e4535', '#94634a'] },
      { id: 'sandstone', name: 'Sandstone blend', sw: '#b49a7a', mix: ['#bba07f', '#a68c6e', '#c4ab8b', '#9a8165'] },
      { id: 'brown', name: 'Brown blend', sw: '#64493a', mix: ['#6a4e3d', '#5a4033', '#765a47'] },
    ],
  },
  {
    id: 'shingle', name: 'Architectural shingle', short: 'Shingle',
    blends: [
      { id: 'weathered', name: 'Weathered wood', sw: '#5d564c', mix: ['#665e53', '#4d4740', '#746b5e', '#3f3b36'] },
      { id: 'charcoal', name: 'Charcoal', sw: '#3f4042', mix: ['#454648', '#36373a', '#505153', '#2e2f31'] },
      { id: 'driftwood', name: 'Driftwood', sw: '#776b5c', mix: ['#807364', '#685e52', '#8d7f6d', '#5a5248'] },
      { id: 'brown', name: 'Bark brown', sw: '#4f3f33', mix: ['#56453a', '#45372d', '#615042', '#3a2f27'] },
      { id: 'pewter', name: 'Pewter gray', sw: '#5f6163', mix: ['#66686a', '#55575a', '#717375'] },
    ],
  },
  {
    id: 'metal', name: 'Standing-seam metal', short: 'Standing seam',
    blends: [
      { id: 'charcoal', name: 'Charcoal', sw: '#3d3f42', mix: ['#3d3f42'] },
      { id: 'bronze', name: 'Dark bronze', sw: '#3e3329', mix: ['#3e3329'] },
      { id: 'galvalume', name: 'Galvalume (bare silver)', sw: '#9a9c9c', mix: ['#9a9c9c'] },
      { id: 'slate-gray', name: 'Slate gray', sw: '#5b6267', mix: ['#5b6267'] },
      { id: 'black', name: 'Matte black', sw: '#252628', mix: ['#252628'] },
    ],
  },
];

export const DOOR_COLORS: HouseSwatch[] = [
  { id: 'espresso', name: 'Espresso', sw: '#4a3524' },
  { id: 'black', name: 'Black', sw: '#1f1f20' },
  { id: 'bronze', name: 'Dark bronze', sw: '#3b3129' },
  { id: 'navy', name: 'Navy', sw: '#243246' },
  { id: 'forest', name: 'Forest green', sw: '#2f3f33' },
  { id: 'red', name: 'Barn red', sw: '#6e2a24' },
  { id: 'gray', name: 'Slate gray', sw: '#5d6064' },
  { id: 'oak', name: 'Stained oak', sw: '#7a5634' },
  { id: 'white', name: 'White', sw: '#e2dfd8' },
];

/** `match` is the wall color. */
export const GARAGE_COLORS: HouseSwatch[] = [
  { id: 'white', name: 'White', sw: '#e2e0da' },
  { id: 'almond', name: 'Almond', sw: '#d4c8b2' },
  { id: 'match', name: 'Same as the walls', sw: '' },
  { id: 'taupe', name: 'Taupe', sw: '#a69885' },
  { id: 'bronze', name: 'Bronze', sw: '#4b3e32' },
  { id: 'charcoal', name: 'Charcoal', sw: '#47484b' },
  { id: 'oak', name: 'Wood look (oak)', sw: '#8a6440' },
];

export const GARAGE_STYLES: { id: string; name: string }[] = [
  { id: 'raised', name: 'Raised panel (short panels)' },
  { id: 'long', name: 'Raised panel (long panels)' },
  { id: 'flush', name: 'Flush (smooth sections)' },
  { id: 'ribbed', name: 'Ribbed (grooved sections)' },
  { id: 'carriage', name: 'Carriage house, windows on top' },
];

/** Roof pitches offered (rise in 12). */
export const PITCHES = [4, 5, 6, 8] as const;
export const DEFAULT_PITCH = 5;
export const DEFAULT_EAVE = 0.5;

const pick = <T extends { id: string }>(list: T[], id: string | undefined): T => list.find((x) => x.id === id) ?? list[0];

/** A look with every key filled in (unknown ids give the defaults). */
export interface ResolvedLook {
  wall: HouseSwatch;
  trim: HouseSwatch;
  window: HouseSwatch;
  roof: RoofMaterial;
  roofColor: RoofBlend;
  door: HouseSwatch;
  garage: HouseSwatch;
  garageStyle: { id: string; name: string };
  blinds: boolean;
  /** Swatch colors with `match` worked out. */
  trimSw: string;
  garageSw: string;
}

/** A shade of an sRGB hex color (k < 1 darker). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveLook(look: HouseLook | undefined): ResolvedLook {
  const l = look ?? {};
  const wall = pick(WALL_COLORS, l.wall);
  const roof = pick(ROOFS, l.roof);
  const trim = pick(TRIM_COLORS, l.trim);
  const garage = pick(GARAGE_COLORS, l.garage);
  return {
    wall, trim, roof,
    window: pick(WINDOW_COLORS, l.window),
    roofColor: pick(roof.blends, l.roofColor),
    door: pick(DOOR_COLORS, l.door),
    garage,
    garageStyle: pick(GARAGE_STYLES, l.garageStyle),
    blinds: l.blinds !== false,
    trimSw: trim.id === 'match' ? shade(wall.sw, 0.9) : trim.sw,
    garageSw: garage.id === 'match' ? wall.sw : garage.sw,
  };
}

/** Only known keys and ids (a roof color must be one of its roof's blends); null when nothing is left. */
export function cleanLook(v: unknown): HouseLook | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out: HouseLook = {};
  const has = (list: { id: string }[], x: unknown): x is string => typeof x === 'string' && list.some((e) => e.id === x);
  if (has(WALL_COLORS, o.wall)) out.wall = o.wall;
  if (has(TRIM_COLORS, o.trim)) out.trim = o.trim;
  if (has(WINDOW_COLORS, o.window)) out.window = o.window;
  if (has(ROOFS, o.roof)) out.roof = o.roof;
  const roof = pick(ROOFS, out.roof);
  if (has(roof.blends, o.roofColor)) out.roofColor = o.roofColor;
  if (has(DOOR_COLORS, o.door)) out.door = o.door;
  if (has(GARAGE_COLORS, o.garage)) out.garage = o.garage;
  if (has(GARAGE_STYLES, o.garageStyle)) out.garageStyle = o.garageStyle;
  if (typeof o.blinds === 'boolean') out.blinds = o.blinds;
  return Object.keys(out).length ? out : null;
}

/** Nearest offered pitch. */
export const snapPitch = (p: number) => PITCHES.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a), DEFAULT_PITCH as number);

/** The roof's description, e.g. "Hip roof, flat concrete tile, Gray-brown blend, 5 in 12". */
export function roofText(s: ExistingStructure): string {
  const r = resolveLook(s.look);
  if (s.kind === 'cover') return 'Flat roof';
  const shape = s.roof === 'gable' ? 'Gable roof' : s.roof === 'flat' ? 'Flat roof' : 'Hip roof';
  return `${shape}, ${r.roof.short.toLowerCase()}, ${r.roofColor.name}${s.roof === 'flat' ? '' : `, ${snapPitch(s.pitch ?? DEFAULT_PITCH)} in 12`}`;
}

/** Every list, for the embed `ready` message (`houseLooks`), so a parent can check its own copy. */
export function houseLookLists() {
  return {
    wall: WALL_COLORS, trim: TRIM_COLORS, window: WINDOW_COLORS,
    roof: ROOFS.map((r) => ({ id: r.id, name: r.name, blends: r.blends.map(({ id, name, sw }) => ({ id, name, sw })) })),
    door: DOOR_COLORS, garage: GARAGE_COLORS, garageStyle: GARAGE_STYLES, pitch: [...PITCHES],
  };
}
