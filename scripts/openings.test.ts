// Run: node node_modules/esbuild/bin/esbuild scripts/openings.test.ts --bundle --platform=node --format=esm --external:three --outfile=/tmp/openings.test.mjs && node /tmp/openings.test.mjs
import { coverSolids, openingBoxes, planOpenings, recessOf, wallSides, type OpeningBox } from '../src/builder/openingplan';
import { distToEdge, pointInPolygon } from '../src/siteplan/geometry';
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
  const others = all.filter((o) => o !== house && o.kind !== 'cover').map((o) => o.polygon);
  const solids = all.filter((o) => o.kind === 'cover').flatMap(coverSolids);
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
        // Clear of every cover wall, post and header end (a cover's roof alone is fine).
        const need = house.openings ? 0.05 : 0.3;
        for (const q of solids) if (pointInPolygon(c, q) || distToEdge(c, q) < need) fail(`${label}: ${b.kind} too close to a cover wall/post`);
        for (const o of others) if (pointInPolygon([c[0] + sd.out[0] * 0.001, c[1] + sd.out[1] * 0.001], o)) fail(`${label}: ${b.kind} inside a neighbor structure`);
      }
      if (b.y0 < -1e-9 || b.y1 > house.height - 0.1) fail(`${label}: box above the eave (y1 ${b.y1}, H ${house.height})`);
    }
    // Under a cover, below its beam/header (roof underside less 0.55 m header, less 0.1 m); marked openings within 1 m of their mark.
    for (const c of all.filter((o) => o.kind === 'cover')) {
      const under = c.height - (c.room || c.walls?.some(Boolean) ? 0.55 : 0.42) - 0.1;
      for (const tt of [op.t - op.w / 2, op.t, op.t + op.w / 2]) {
        const p: Vec2 = [sd.a[0] + sd.dir[0] * tt + sd.out[0] * 0.3, sd.a[1] + sd.dir[1] * tt + sd.out[1] * 0.3];
        if (pointInPolygon(p, c.polygon) && op.h1 > under + 1e-6) fail(`${label}: opening top ${op.h1} above cover beam ${under}`);
      }
    }
    if (house.openings) {
      const near = house.openings.some((m) => Math.abs((m.at[0] - sd.a[0]) * sd.dir[0] + (m.at[1] - sd.a[1]) * sd.dir[1] - op.t) <= 1.0 + 1e-6);
      if (!near) fail(`${label}: marked opening moved more than 1 m`);
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
const doorsCount = bp.placed.filter((o) => o.type === 'slider' || o.type === 'door').length, windows = bp.placed.filter((o) => o.type === 'window' || o.type === 'picture').length;
if (doorsCount !== 1 || windows < 6) fail(`rect house lost its openings: ${doorsCount} doors, ${windows} windows`);
// The front entry faces away from the yard, with a sidelight each side and two steps' rise.
const yard = planOpenings(big, [big], [6, 20]);
const ent = yard.placed.filter((o) => o.type === 'entry'), sides2 = yard.placed.filter((o) => o.type === 'sidelight');
if (ent.length !== 1 || sides2.length !== 2 || Math.abs(ent[0].h0 - 0.3) > 1e-6 || !yard.entry) fail(`rect house entry: ${ent.length} doors, ${sides2.length} sidelights`);
if (yard.entry && yard.sides.find((s) => s.edge === yard.entry!.edge)!.out[1] > -0.5) fail('entry not on the wall facing away from the yard');
if (yard.sides.find((s) => s.edge === yard.doorEdge)!.out[1] < 0.5) fail('patio door not on the yard side');
// A step against the back wall: a sliding door centered on it, sized to it, on its top.
const stepped = planOpenings(big, [big], [6, 4], [{ a: [4.6, 8.05], b: [7.34, 8.05], top: 0.3 }]);
const sl = stepped.placed.filter((o) => o.type === 'slider');
if (sl.length !== 1 || Math.abs(sl[0].t - 5.97) > 0.05 && Math.abs(sl[0].t - (12 - 5.97)) > 0.05 || Math.abs(sl[0].w - 2.74) > 1e-6 || Math.abs(sl[0].h0 - 0.3) > 1e-6) fail(`step slider: ${JSON.stringify(sl)}`);
// A marked door on that step takes it, standing on the step.
const markedStep = mk('h', 'house', shapes.rect, 3, { openings: [{ kind: 'door', at: [6, 8], width: 2.44, style: 'slider', panels: 2 }] });
const ms = planOpenings(markedStep, [markedStep], [6, 4], [{ a: [4.6, 8.05], b: [7.34, 8.05], top: 0.3 }]);
const msl = ms.placed.filter((o) => o.type === 'slider' || o.type === 'door' || o.type === 'entry');
if (msl.length !== 1 || Math.abs(msl[0].h0 - 0.3) > 1e-6 || Math.abs(msl[0].w - 2.44) > 1e-6) fail(`marked step door: ${JSON.stringify(msl)}`);
// A recess is found whichever way the outline runs; the entry goes in it.
for (const rev of [false, true]) {
  const p = rev ? [...shapes.notched].reverse() : shapes.notched;
  const sds = wallSides(p);
  const back = sds.find((x) => Math.abs(x.a[1] - 1.2) < 1e-9 && Math.abs(x.dir[1]) < 1e-9)!;
  if (Math.abs(recessOf(back, sds) - 1.2) > 1e-9) fail(`recess not found (${rev ? 'reversed' : 'forward'})`);
  if (sds.filter((x) => recessOf(x, sds) > 0).length !== 1) fail('more than one recess');
  const hn = mk('h', 'house', p);
  const en = planOpenings(hn, [hn], [6, 30]).entry;
  if (!en || en.edge !== back.edge) fail(`entry not in the recess (${rev ? 'reversed' : 'forward'}): ${JSON.stringify(en)}`);
}
// A marked garage door alone keeps the automatic windows and doors.
const gm = mk('h', 'house', shapes.rect, 3, { openings: [{ kind: 'door', at: [6, 0], width: 4.88, style: 'garage' }] });
const gp = planOpenings(gm, [gm], [6, 20]);
if (!gp.placed.some((o) => o.type === 'garage') || !gp.placed.some((o) => o.type === 'window') || !gp.placed.some((o) => o.type === 'slider')) fail(`garage door only: ${gp.placed.map((o) => o.type).join(',')}`);
// A chimney keeps its wall clear.
const ch = mk('h', 'house', shapes.rect, 3, { chimney: true });
const cp = planOpenings(ch, [ch], [6, 4]);
if (!cp.chimney) fail('no chimney spot');
else for (const o of cp.placed) if (o.edge === cp.chimney.edge && Math.abs(o.t - cp.chimney.t) < o.w / 2 + 0.75) fail('opening in the chimney');
// Sheds and garages with short walls still get a (narrow) door; low covers lower the windows.
const shed = mk('s', 'shed', rect(0, 0, 2.2, 2), 2.4);
const sp = planOpenings(shed, [shed], [5, 5]);
if (!sp.placed.some((o) => o.h0 < 0.1 && o.w <= 1.0)) fail('short-walled shed has no door');
const lowH = mk('h', 'house', shapes.rect, 3), lowC = mk('c', 'cover', [[0, 8], [12, 8], [12, 11], [0, 11]], 2.6);
const lp = planOpenings(lowH, [lowH, lowC], [6, 4]);
if (lp.placed.some((o) => o.h1 > 2.6 - 0.42 - 0.1 + 1e-6 && lp.sides.find((x) => x.edge === o.edge)!.out[1] > 0.5)) fail('low cover: opening above beam');
console.log(`short shed door: ${sp.placed.some((o) => o.h0 < 0.1)}, low-cover openings: ${lp.placed.length}`);

// An open patio roofed over the whole yard wall keeps the wall's windows and door.
const patio = mk('c', 'cover', [[0, 8], [12, 8], [12, 11], [0, 11]], 3);
const pp = planOpenings(big, [big, patio], [6, 4]);
if (pp.placed.length < 7 || !pp.placed.some((o) => pp.sides.find((s) => s.edge === o.edge)!.out[1] > 0.5)) fail('openings under an open patio were removed');
// A California room whose side wall meets the house: nothing near that wall.
const room = mk('c', 'cover', [[0, 8], [12, 8], [12, 11], [0, 11]], 3, { walls: [false, true, false, true] });
const rp = planOpenings(big, [big, room], [6, 4]);
for (const o of rp.placed) { const sd = rp.sides.find((s) => s.edge === o.edge)!; if (sd.out[1] > 0.5 && (o.t - o.w / 2 < 0.8 || o.t + o.w / 2 > 11.2 + 0)) fail('opening near a room side wall'); }

console.log(`footprint cases checked: ${checked}, openings verified: ${openings}, cases where a cover removed openings: ${skippedByCover}`);
console.log(`unobstructed 12x8 house: ${doorsCount} door, ${windows} windows, entry ${JSON.stringify(bp.entry)}, step slider ${JSON.stringify(sl[0])}`);
if (failures.length) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
console.log('PASS');
