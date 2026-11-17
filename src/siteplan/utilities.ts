import { materialById } from './catalog';
import type { UtilityKind, UtilityLine, UtilityPointKind, UtilityRun, Zone } from './types';

/**
 * Underground utilities and what goes under each surface: names, colors, the
 * cover each kind gets when a plan leaves it out, how runs stack in a joint
 * trench, and the base and bedding layers under paving and synthetic grass.
 *
 * Cover is measured from the top of the pipe to finished grade. The numbers a
 * plan carries come from Area Planner's California table (CEC Table 300.5 for
 * electrical, CPC 1210.1.1 for gas, CPC 609.1 for water); the defaults here are
 * only for runs that arrive without one.
 */

export const IN = 0.0254;

export const UTILITY_KIND_NAME: Record<UtilityKind, string> = {
  electrical: 'Electrical',
  lighting: 'Landscape lighting',
  gas: 'Gas',
  irrigation: 'Irrigation',
  water: 'Water',
  drain: 'Drain',
};

export const UTILITY_DEFAULT_COVER: Record<UtilityKind, number> = {
  electrical: 18 * IN,
  lighting: 6 * IN,
  gas: 18 * IN,
  irrigation: 6 * IN,
  water: 12 * IN,
  drain: 12 * IN,
};

/** Marking paint, in the APWA uniform color code: red electric, yellow gas, purple irrigation, blue water, green drain. */
export const UTILITY_PAINT: Record<UtilityKind, string> = {
  electrical: '#d8261c',
  lighting: '#d8261c',
  gas: '#f2c200',
  irrigation: '#7a3fa0',
  water: '#1f5fc4',
  drain: '#2f8f3a',
};

/** The pipe itself: gray Schedule 40 conduit, black low-voltage cable, yellow PE gas pipe, white PVC, blue PEX, black drain pipe. */
export const UTILITY_PIPE: Record<UtilityKind, { color: string; roughness: number }> = {
  electrical: { color: '#80858a', roughness: 0.55 },
  lighting: { color: '#1c1c1c', roughness: 0.45 },
  gas: { color: '#e3b41a', roughness: 0.4 },
  irrigation: { color: '#ebe9e3', roughness: 0.45 },
  water: { color: '#2b63b8', roughness: 0.4 },
  drain: { color: '#262626', roughness: 0.7 },
};

export const UTILITY_POINT_NAME: Record<UtilityPointKind, string> = {
  panel: 'Electrical panel',
  subpanel: 'Sub-panel',
  outlet: 'GFCI outlet',
  junction: 'Pull box',
  transformer: 'Lighting transformer',
  'gas-meter': 'Gas meter',
  'gas-stub': 'Gas stub',
  'water-meter': 'Water meter',
  backflow: 'Backflow preventer',
  controller: 'Irrigation controller',
  valves: 'Valve box',
  'hose-bib': 'Hose bib',
  stub: 'Stub-up',
};

/** Width every trench is shown at, meters: 1.5 ft (Green Lion's choice), so the walls and pipes can be seen. */
export const TRENCH_WIDTH = 18 * IN;

/** In a joint trench, which run goes under when two have the same cover: electrical lowest, low-voltage cable highest. */
const DEPTH_RANK: Record<UtilityKind, number> = { electrical: 0, drain: 1, water: 2, gas: 3, irrigation: 4, lighting: 5 };

export interface PlacedRun {
  run: UtilityRun;
  /** Cover it ends up with in the trench (its own, or deeper to keep the gap), meters. */
  cover: number;
  /** Depth of the pipe's center below grade, meters. */
  center: number;
}

export interface TrenchSpec {
  /** Shallowest first. */
  runs: PlacedRun[];
  /** Trench bottom below grade, meters: the deepest pipe rests on it. */
  depth: number;
  width: number;
  /** Clear gap kept between stacked runs, meters (joint trenches). */
  gap: number;
}

/**
 * Where each run sits in its trench. Runs keep their own cover; in a joint trench they stack shallowest first, and a
 * run that would come closer than the gap to the one above it is pushed down. The trench is cut to the deepest pipe's
 * bottom. Every trench is shown 1.5 ft wide (TRENCH_WIDTH), wider only for a pipe that needs more room.
 */
export function trenchSpec(line: UtilityLine): TrenchSpec {
  const gap = line.gap ?? 0.15;
  const order = [...line.runs].sort((a, b) => a.cover - b.cover || DEPTH_RANK[b.kind] - DEPTH_RANK[a.kind]);
  let bottom = -Infinity;
  const runs = order.map((run) => {
    const cover = bottom > -Infinity ? Math.max(run.cover, bottom + gap) : run.cover;
    bottom = cover + run.od;
    return { run, cover, center: cover + run.od / 2 };
  });
  const depth = Math.max(...runs.map((r) => r.cover + r.run.od));
  const widest = Math.max(...line.runs.map((r) => r.od));
  const width = Math.max(TRENCH_WIDTH, widest + 8 * IN);
  return { runs, depth, width, gap };
}

/** A name for a trench: "Gas", or "Gas + Electrical" for a joint trench. */
export function trenchName(line: UtilityLine): string {
  const kinds = [...new Set(line.runs.map((r) => UTILITY_KIND_NAME[r.kind]))];
  return kinds.join(' + ');
}

export type SectionLayerKind = 'base' | 'sand' | 'fines';

export interface SectionLayer {
  kind: SectionLayerKind;
  name: string;
  /** Depth of its top and bottom below grade, meters. */
  top: number;
  bottom: number;
}

export interface ZoneSection {
  /** What the surface is, for labels: "Pavers", "Synthetic grass". */
  surface: string;
  /** Dig depth below grade, meters. */
  depth: number;
  /** Bottom layer first. */
  layers: SectionLayer[];
}

/**
 * What goes under a paving or synthetic grass area, top of the surface at grade or above it. Pavers and flagstone:
 * 4 in of compacted Class II road base under 1 in of bedding sand. Concrete: 4 in of base. Synthetic grass: 3 in of
 * base under 1 in of fines (1/4 in minus). A zone's `layers` changes the depths. Other surfaces (lawn, beds, decks)
 * are not dug out, and get null.
 */
export function zoneSection(z: Zone): ZoneSection | null {
  const spec = materialById.get(z.catalogId);
  if (!spec) return null;
  let base = 0, bed = 0, bedKind: SectionLayerKind = 'sand', surface = '';
  if (z.kind === 'hardscape' && (spec.recipe === 'paver' || spec.recipe === 'flagstone' || spec.recipe === 'cobble')) {
    base = 4 * IN;
    bed = 1 * IN;
    surface = spec.group === 'Porcelain' ? 'Porcelain pavers' : spec.recipe === 'flagstone' ? 'Flagstone' : 'Pavers';
  } else if (z.kind === 'hardscape' && spec.recipe === 'concrete') {
    base = 4 * IN;
    surface = 'Concrete';
  } else if (z.kind === 'turf' && spec.recipe === 'turfArtificial') {
    base = 3 * IN;
    bed = 1 * IN;
    bedKind = 'fines';
    surface = 'Synthetic grass';
  } else return null;
  if (z.layers?.base !== undefined) base = z.layers.base;
  if (z.layers?.bedding !== undefined && bed > 0) bed = z.layers.bedding;
  if (base + bed < 0.01) return null;
  const layers: SectionLayer[] = [];
  if (base > 0) layers.push({ kind: 'base', name: 'Class II base', top: bed, bottom: bed + base });
  if (bed > 0) layers.push({ kind: bedKind, name: bedKind === 'sand' ? 'Bedding sand' : 'Leveling fines', top: 0, bottom: bed });
  return { surface, depth: base + bed, layers };
}

/** Inches, rounded to a quarter: 18, 6.5, 25.25. */
export const inches = (m: number) => {
  const v = Math.round((m / IN) * 4) / 4;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')} in`;
};

/** Cubic yards from cubic meters, to a tenth. */
export const cuyd = (m3: number) => `${(m3 * 1.30795).toFixed(m3 * 1.30795 < 10 ? 1 : 0)} cu yd`;
