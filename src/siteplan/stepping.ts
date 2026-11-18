import { FLAGSTONE_PREFIX, SLAB_24_PREFIX, materialById, type FeatureSpec, type SteppingStoneType } from './catalog';
import { rng } from './geometry';
import type { FeaturePlacement, Vec2 } from './types';

/*
 * Stepping stones (features of kind 'steppingStone'): what each one is, its color, its outline and how high its top
 * sits. Shared by the builder (builder/features.ts) and the pebble clearing (builder/pebbles.ts).
 *
 *   slab       one Belgard Dimensions Slab, 2 3/8 in thick, sunk to about 1/2 in above grade.
 *   pad        Green Lion poured concrete, 4 in thick, top 1 in above grade.
 *   flagstone  one natural flagstone piece, its own thickness, about 1/2 in above grade.
 */

const IN = 0.0254;

/** A stepping stone feature's type and size (inches); the original 24 x 24 slab when the spec says nothing. */
export function steppingOf(spec: FeatureSpec): { stone: SteppingStoneType; sizeIn: [number, number] } {
  return spec.stepping ?? { stone: 'slab', sizeIn: [24, 24] };
}

/** The default color of each stone type. */
const DEFAULT_LOOK: Record<SteppingStoneType, string> = {
  slab: `${SLAB_24_PREFIX}shaded-gray`,
  pad: 'concrete-broom',
  flagstone: `${FLAGSTONE_PREFIX}az-classic-oak`,
};

/** True when a look can be this type of stone: a Dimensions Slabs color, a concrete look, a flagstone. */
function lookFits(stone: SteppingStoneType, id: string): boolean {
  const m = materialById.get(id);
  if (!m) return false;
  if (stone === 'slab') return id.startsWith(SLAB_24_PREFIX);
  if (stone === 'pad') return m.recipe === 'concrete';
  return !!m.flag;
}

/** The look a stepping stone is drawn in: its own when it names one that fits its type, else the type's default. */
export function stoneLook(f: FeaturePlacement, spec: FeatureSpec): string {
  const { stone } = steppingOf(spec);
  return f.materialId && lookFits(stone, f.materialId) ? f.materialId : DEFAULT_LOOK[stone];
}

/** Top of the stone above the ground at its center, meters. */
export function stoneTop(stone: SteppingStoneType): number {
  return stone === 'pad' ? 0.025 : stone === 'slab' ? 0.013 : 0.0127;
}

/**
 * A natural flagstone piece's outline, meters about its center (x, then local z). A split stone breaks along a few
 * long, nearly straight edges: 5 to 7 main corners at uneven angles round a lopsided oval, then each edge broken into
 * 2 to 4 short runs that bow out a little or chip in a little. Its longest reach is picked from the size range. The
 * same seed always gives the same stone. (Area Planner draws its own outline the same way and sends it.)
 */
export function flagOutline(seed: string, sizeIn: [number, number]): Vec2[] {
  const r = rng(`flag:${seed}`);
  const size = (sizeIn[0] + r() * (sizeIn[1] - sizeIn[0])) * IN;
  const aspect = 0.62 + r() * 0.3;
  const m = 5 + Math.floor(r() * 3);
  // Main corners: uneven angular gaps, radius varied, on an oval.
  const gaps: number[] = [];
  for (let i = 0; i < m; i++) gaps.push(0.55 + r());
  const sum = gaps.reduce((a, b) => a + b, 0);
  const a0 = r() * Math.PI * 2;
  const main: Vec2[] = [];
  let a = a0;
  for (let i = 0; i < m; i++) {
    const rad = 0.82 + r() * 0.26;
    main.push([Math.cos(a) * rad, Math.sin(a) * rad * aspect]);
    a += (gaps[i] / sum) * Math.PI * 2;
  }
  // Break each edge into short runs: points along it pushed out (a slight bow) or in (a chip), never far.
  const pts: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const p = main[i], q = main[(i + 1) % m];
    pts.push(p);
    const ex = q[0] - p[0], ez = q[1] - p[1], L = Math.hypot(ex, ez);
    const nx = ez / L, nz = -ex / L; // outward for a counter-clockwise ring
    const k = 1 + Math.floor(r() * 3);
    const bow = (r() - 0.25) * 0.08;
    for (let j = 1; j <= k; j++) {
      const t = (j + (r() - 0.5) * 0.5) / (k + 1);
      const off = (Math.sin(t * Math.PI) * bow + (r() - 0.6) * 0.07) * L;
      pts.push([p[0] + ex * t + nx * off, p[1] + ez * t + nz * off]);
    }
  }
  // Scale so the longest reach across the stone is its size.
  let reach = 0;
  for (const p of pts) for (const q of pts) reach = Math.max(reach, Math.hypot(p[0] - q[0], p[1] - q[1]));
  const k = size / Math.max(reach, 1e-6);
  return pts.map(([x, y]) => [Math.round(x * k * 10000) / 10000, Math.round(y * k * 10000) / 10000]);
}

/** A stepping stone's outline in its local frame (meters about its center): a slab's or pad's rectangle, or the flagstone's own outline. */
export function stoneOutline(f: FeaturePlacement, spec: FeatureSpec): Vec2[] {
  const st = steppingOf(spec);
  if (st.stone === 'flagstone') return f.outline && f.outline.length >= 3 ? f.outline : flagOutline(f.id, st.sizeIn);
  const hw = spec.footprint[0] / 2, hd = spec.footprint[1] / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
}
