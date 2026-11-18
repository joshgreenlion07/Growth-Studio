// Run: node node_modules/esbuild/bin/esbuild scripts/openings.test.ts --bundle --platform=node --format=esm --external:three --outfile=/tmp/openings.test.mjs && node /tmp/openings.test.mjs
import { openingBoxes, planOpenings, wallSides, type OpeningBox } from '../src/builder/openingplan';
import { pointInPolygon } from '../src/siteplan/geometry';
import type { ExistingStructure, Vec2 } from '../src/siteplan/types';

type Poly = Vec2[];
const rect = (x: number, y: number, w: number, d: number): Poly => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const rot = (p: Poly, a: number): Poly => p.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + 3, x * Math.sin(a) + y * Math.cos(a) - 2] as Vec2);
const shapes: Record<string, Poly> = {
  rect: rect(0, 0, 12, 8),
  small: rect(0, 0, 3.2, 3),
  tiny: rect(0, 0, 1.6, 1.6),
  sliver: rect(0, 0, 14, 2),
  L: [[0, 0], [12, 0], [12, 4], [5, 4], [5, 9], [0, 9]],
  U: [[0, 0], [12, 0], [12, 9], [9, 9], [9, 3.5], [3, 3.5], [3, 9], [0, 9]],
  notched: [[0, 0], [5, 0], [5, 1.2], [7, 1.2], [7, 0], [12, 0], [12, 8], [0, 8]],
  T: [[0, 0], [12, 0], [12, 4], [8, 4], [8, 9], [4, 9], [4, 4], [0, 4]],
  stairs: [[0, 0], [12, 0], [12, 3], [9, 3], [9, 6], [6, 6], [6, 9], [0, 9]],
  narrowSlot: [[0, 0], [12, 0], [12, 8], [6.3, 8], [6.3, 2], [6.1, 2], [6.1, 8], [0, 8]],
};

const mk = (id: string, kind: ExistingStructure['kind'], polygon: Poly, height = 3, extra: Partial<ExistingStructure> = {}): ExistingStructure =>
  ({ id, kind, polygon, height, roof: 'flat', ...extra }) as ExistingStructure;

/** Covers placed against every wall of the house in several ways. */
function covers(house: Poly): Poly[] {
  const out: Poly[] = [];
  for (const sd of wallSides(house)) {
    for (const [from, to, depth, sign] of [[0, 1, 3, 1], [0.2, 0.55, 3, 1], [0.5, 1, 4, 1], [0.4, 0.6, 2, 1], [0.3, 0.7, 2.5, -1], [-0.2, 0.3, 3, 1]] as const) {
      const t0 = sd.len * from, t1 = sd.len * to;
      const P = (t: number, d: number): Vec2 => [sd.a[0] + sd.dir[0] * t + sd.out[0] * d * sign, sd.a[1] + sd.dir[1] * t + sd.out[1] * d * sign];
      out.push([P(t0, 0), P(t1, 0), P(t1, depth), P(t0, depth)]);
    }
  }
  return out;
}

const corners = (b: OpeningBox): Vec2[] => {
  const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz) || 1;
  const u: Vec2 = [dx / l, dz / l], v: Vec2 = [-u[1], u[0]];
  const h = l / 2 + b.extend, c: Vec2 = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
  const pts: Vec2[] = [];
  for (const [s, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([c[0] + u[0] * h * s + v[0] * (b.thick / 2) * k, c[1] + u[1] * h * s + v[1] * (b.thick / 2) * k]);
  return pts;
};

let checked = 0, openings = 0, failures: string[] = [], skippedByCover = 0;
const fail = (m: string) => { if (failures.length < 25) failures.push(m); else if (failures.length === 25) failures.push('...'); };

function check(label: string, house: ExistingStructure, all: ExistingStructure[]) {
  const plan = planOpenings(house, all, [4, 3]);
  const others = all.filter((o) => o !== house).map((o) => o.polygon);
  const sideOf = new Map(plan.sides.map((s) => [s.edge, s]));
  const byEdge = new Map<number, typeof plan.placed>();
  for (const op of plan.placed) {
    openings++;
    const sd = sideOf.get(op.edge)!;
    (byEdge.get(op.edge) ?? byEdge.set(op.edge, []).get(op.edge)!).push(op);
    for (const b of openingBoxes(sd, op)) {
      for (const c of corners(b)) {
        const along = (c[0] - sd.a[0]) * sd.dir[0] + (c[1] - sd.a[1]) * sd.dir[1];
        const off = (c[0] - sd.a[0]) * sd.out[0] + (c[1] - sd.a[1]) * sd.out[1];
        // Inside the edge with clearance (marked openings keep 0.2 - the sill/bar lengthening 0.08).
        const minAlong = house.openings ? 0.07 : 0.3;
        if (along < minAlong || along > sd.len - minAlong) fail(`${label}: ${b.kind} past wall end (along ${along.toFixed(2)} of ${sd.len.toFixed(2)})`);
        // Flush in the wall plane: inner face within 1 cm of the wall face, never sunk into the wall or floating.
        if (off < 0.01 - 0.01 - 1e-6 || off > 0.12 + 1e-6) fail(`${label}: ${b.kind} off wall plane (${off.toFixed(3)})`);
        // Never inside this or another footprint.
        if (pointInPolygon([c[0] + sd.out[0] * 0.001, c[1] + sd.out[1] * 0.001], house.polygon)) fail(`${label}: ${b.kind} corner inside own walls`);
        for (const o of others) if (pointInPolygon([c[0] + sd.out[0] * 0.001, c[1] + sd.out[1] * 0.001], o)) fail(`${label}: ${b.kind} inside a neighbor structure`);
      }
      if (b.y0 < -1e-9 || b.y1 > house.height - 0.1) fail(`${label}: box above the eave (y1 ${b.y1}, H ${house.height})`);
    }
    // Wall plane check at the middle of the pane: the point just behind the glass is wall (inside), just in front is outside.
    const mid: Vec2 = [sd.a[0] + sd.dir[0] * op.t, sd.a[1] + sd.dir[1] * op.t];
    if (!pointInPolygon([mid[0] - sd.out[0] * 0.05, mid[1] - sd.out[1] * 0.05], house.polygon)) fail(`${label}: nothing behind the glass`);
  }
  for (const list of byEdge.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
    if (Math.abs(list[i].t - list[j].t) < list[i].w / 2 + list[j].w / 2 - 1e-6) fail(`${label}: openings overlap`);
  checked++;
  return plan;
}

for (const [name, base] of Object.entries(shapes)) {
  for (const reversed of [false, true]) for (const angle of [0, 0.6, 2.2]) for (const kind of ['house', 'shed', 'garage'] as const) for (const height of [3, 2.4, 2.1]) {
    const poly0 = rot(base, angle);
    const poly = reversed ? [...poly0].reverse() : poly0;
    const h = mk('h', kind, poly, height);
    check(`${name}${reversed ? ' rev' : ''} a${angle} ${kind} H${height}`, h, [h]);
    if (height !== 3) continue;
    for (const cp of covers(poly)) {
      for (const cw of [false, true]) {
        const cover = mk('c', 'cover', cw ? [...cp].reverse() : cp, 3, { walls: cw ? [true, true, true, true] : undefined });
        const plan = check(`${name}${reversed ? ' rev' : ''} a${angle} ${kind} + cover`, h, [h, cover]);
        const alone = planOpenings(h, [h], [4, 3]);
        if (plan.placed.length < alone.placed.length) skippedByCover++;
      }
    }
    // Hand-marked openings, some on corners and short edges.
    const marks = [];
    for (const sd of wallSides(poly)) for (const f of [0, 0.02, 0.5, 1]) marks.push({ kind: (f === 0.5 ? 'door' : 'window') as 'door' | 'window', at: [sd.a[0] + sd.dir[0] * sd.len * f, sd.a[1] + sd.dir[1] * sd.len * f] as Vec2, width: f === 0.5 ? 2.4 : 1.6 });
    const hm = mk('h', kind, poly, height, { openings: marks });
    check(`${name}${reversed ? ' rev' : ''} a${angle} ${kind} marked`, hm, [hm]);
    const cover = mk('c', 'cover', covers(poly)[0], 3);
    check(`${name}${reversed ? ' rev' : ''} a${angle} ${kind} marked+cover`, hm, [hm, cover]);
  }
}

// Sanity: an unobstructed generous house still gets its door and windows (the fix must not strip everything).
const big = mk('h', 'house', shapes.rect);
const bp = planOpenings(big, [big], [6, 4]);
const doorsCount = bp.placed.filter((o) => o.h0 < 0.1).length, windows = bp.placed.length - doorsCount;
if (doorsCount !== 1 || windows < 6) fail(`rect house lost its openings: ${doorsCount} doors, ${windows} windows`);
// A cover along the whole yard wall moves the door elsewhere.
const patio = mk('c', 'cover', [[0, 8], [12, 8], [12, 11], [0, 11]], 3);
const pp = planOpenings(big, [big, patio], [6, 4]);
if (pp.placed.some((o) => pp.sides.find((s) => s.edge === o.edge)!.out[1] > 0.5)) fail('openings still on the wall under the cover');

console.log(`footprint cases checked: ${checked}, openings verified: ${openings}, cases where a cover removed openings: ${skippedByCover}`);
console.log(`unobstructed 12x8 house: ${doorsCount} door, ${windows} windows`);
if (failures.length) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
console.log('PASS');
