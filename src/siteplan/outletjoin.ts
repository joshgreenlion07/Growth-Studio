import { featureById } from './catalog';
import { PVC_CONDUIT_OD, PVC_SWEEP_R, STUB_TAIL, outletChoice, outletStubUps } from './mirador';
import type { SitePlan, UtilityLine, Vec2 } from './types';
import { trenchSpec } from './utilities';

/*
 * Joining the underground electrical runs to the outlets' stub-ups (siteplan/mirador.ts, builder/mirador.ts), so a
 * plan whose conduit lines only end near an outlet (as Area Planner draws them) builds as one run: the line's conduit
 * comes in straight along the elbow's tail and slips into it, the elbow turns toward it at the line's own depth, and the
 * trench is dug on over the elbow to the riser. Derived at build time; the saved plan is never changed.
 */

const IN = 0.0254;
/** A line end this close to a stub-up (meters) is taken as running to it. */
export const JOIN_REACH = 1.5;
/** A utility point of kind 'outlet' this close to an outlet feature's stub-up is that outlet: no marker of its own. */
const POINT_REACH = 1.0;
/** The run's conduit ends this far inside the tail's coupling (inches). */
const SLIP = 0.5;

/** How a stub-up meets its run: the way its elbow turns (unit vector, the feature's local x and z), the depth of the
 *  run's center under grade, and the run's conduit size (inches, outside). */
export interface OutletJoin {
  dir: Vec2;
  depthIn: number;
  tailOD: number;
}

/** A utility line as built: `points` is the trench's route, `pipe` the conduit's when it stops short of it. */
export interface JoinedLine extends UtilityLine {
  pipe?: Vec2[];
}

interface Stub {
  featureId: string;
  /** `${outlet key}:${conduit index}`, the builder's key for it. */
  key: string;
  at: Vec2;
  /** World-to-local turn of the feature (radians, the placement's -rotation). */
  a: number;
  /** Length of the elbow plus tail, meters, from the riser's axis. */
  reach: number;
}

/** Every stub-up in the plan, in plan meters. */
function stubs(plan: SitePlan): Stub[] {
  const out: Stub[] = [];
  for (const f of plan.features) {
    const spec = featureById.get(f.catalogId);
    if (!spec) continue;
    const list = outletStubUps(spec, f.options);
    if (!list.length) continue;
    const a = (-f.rotationDeg * Math.PI) / 180;
    const R = PVC_SWEEP_R[outletChoice((k) => f.options?.[k] ?? spec.options?.find((o) => o.key === k)?.default ?? false).conduit];
    for (const s of list) {
      const x = s.x * IN, z = s.z * IN;
      out.push({ featureId: f.id, key: `${s.key}:${s.k}`, at: [f.position[0] + x * Math.cos(a) + z * Math.sin(a), f.position[1] - x * Math.sin(a) + z * Math.cos(a)], a, reach: (R + STUB_TAIL) * IN });
    }
  }
  return out;
}

const dist = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/**
 * The plan with its electrical lines run on to the stub-ups they end near and the 'outlet' utility points that stand
 * for an outlet feature left out, and each joined stub-up's join (by feature id, then `${outlet key}:${conduit}`).
 */
export function joinOutlets(plan: SitePlan): { plan: SitePlan; joins: Map<string, Map<string, OutletJoin>> } {
  const joins = new Map<string, Map<string, OutletJoin>>();
  const lines = plan.utilities?.lines ?? [];
  const all = stubs(plan);
  if (!all.length || !plan.utilities) return { plan, joins };
  // Candidate pairs (line end, stub-up), nearest first; each end and each stub-up is used once.
  const pairs: { li: number; end: 0 | 1; s: Stub; d: number }[] = [];
  lines.forEach((l, li) => {
    if (l.points.length < 2 || !l.runs.some((r) => r.kind === 'electrical')) return;
    for (const end of [0, 1] as const) {
      const p = end ? l.points[l.points.length - 1] : l.points[0];
      for (const s of all) {
        const d = dist(p, s.at);
        if (d <= JOIN_REACH) pairs.push({ li, end, s, d });
      }
    }
  });
  pairs.sort((x, y) => x.d - y.d);
  const usedEnd = new Set<string>(), usedStub = new Set<Stub>();
  const out: JoinedLine[] = lines.map((l) => ({ ...l, points: [...l.points] }));
  for (const { li, end, s } of pairs) {
    if (usedEnd.has(`${li}:${end}`) || usedStub.has(s)) continue;
    const line = out[li];
    const run = trenchSpec(lines[li]).runs.find((r) => r.run.kind === 'electrical')!;
    // Walk in from that end to the first point clear of the elbow and tail: the run comes in from there.
    const pts = end ? [...line.points].reverse() : [...line.points];
    const pipePts = line.pipe ? (end ? [...line.pipe].reverse() : [...line.pipe]) : pts;
    let i = 0;
    while (i < pts.length && dist(pts[i], s.at) < s.reach + 0.15) i++;
    if (i >= pts.length) continue;
    const from = pts[i];
    const len = dist(from, s.at);
    const d: Vec2 = [(from[0] - s.at[0]) / len, (from[1] - s.at[1]) / len];
    // The conduit ends just inside the tail's coupling; the trench goes on to the riser so it opens over the elbow.
    const tip: Vec2 = [s.at[0] + d[0] * (s.reach - SLIP * IN), s.at[1] + d[1] * (s.reach - SLIP * IN)];
    const keep = pts.slice(i), keepPipe = pipePts.slice(i);
    const trench = [s.at, ...keep], pipe = [tip, ...keepPipe];
    line.points = end ? trench.reverse() : trench;
    line.pipe = end ? pipe.reverse() : pipe;
    usedEnd.add(`${li}:${end}`);
    usedStub.add(s);
    // The elbow turns toward the run (in the feature's own frame), at the run's depth, to the run's conduit size.
    const local: Vec2 = [d[0] * Math.cos(s.a) - d[1] * Math.sin(s.a), d[0] * Math.sin(s.a) + d[1] * Math.cos(s.a)];
    const m = joins.get(s.featureId) ?? new Map<string, OutletJoin>();
    m.set(s.key, { dir: local, depthIn: run.center / IN, tailOD: run.run.od / IN });
    joins.set(s.featureId, m);
  }
  // An 'outlet' utility point at an outlet feature is drawn by the feature: its own marker and riser are left out.
  const points = plan.utilities.points.filter((p) => p.kind !== 'outlet' || !all.some((s) => dist(p.position, s.at) < POINT_REACH));
  return { plan: { ...plan, utilities: { ...plan.utilities, lines: out, points } }, joins };
}

/** The nearest standard PVC trade size to a conduit's outside diameter (inches), for its fittings. */
export function tradeSizeOf(odIn: number): keyof typeof PVC_CONDUIT_OD {
  let best: keyof typeof PVC_CONDUIT_OD = '1/2';
  for (const k of Object.keys(PVC_CONDUIT_OD) as (keyof typeof PVC_CONDUIT_OD)[]) if (Math.abs(PVC_CONDUIT_OD[k] - odIn) < Math.abs(PVC_CONDUIT_OD[best] - odIn)) best = k;
  return best;
}
