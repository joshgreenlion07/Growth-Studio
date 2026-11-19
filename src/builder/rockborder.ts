import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../siteplan/geometry';
import { BORDER_BURIED, BORDER_STONE_RATIO, mossSizeIn, type RockBorderSpec } from '../siteplan/groundrock';
import type { LineItem, Vec2 } from '../siteplan/types';
import { BORDER_STONE, borderLook } from './groundrock-looks';
import { buildRock, footSink } from './stonegeo';

/*
 * A border of stones laid along an edging line (a material with spec.rockBorder: double-head moss rock round a dry
 * creek). The stones go down the run one at a time, as a crew sets them: each a weight from the look's range (more of
 * the middle weights) made into a size (siteplan/groundrock.ts mossSizeIn), its long side roughly along the line, a few
 * inches from the last one, wandering a little either side, now and then a smaller stone tucked beside a big one. Every
 * stone is its own shape (builder/stonegeo.ts), seeded by the line's id and its place on it, so a border keeps its stones
 * when the plan is rebuilt; set a quarter into the ground, sunk on a slope so no gap shows.
 */

const IN = 0.0254;

interface Run {
  /** Point and unit direction at a distance along the line. */
  at(s: number): { p: Vec2; d: Vec2 };
  length: number;
}

function runOf(points: Vec2[]): Run {
  const seg: { a: Vec2; d: Vec2; len: number; s0: number }[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    seg.push({ a, d: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len, s0: total });
    total += len;
  }
  return {
    length: total,
    at(s) {
      const k = seg.find((g) => s <= g.s0 + g.len) ?? seg[seg.length - 1];
      const t = Math.max(0, Math.min(k.len, s - k.s0));
      return { p: [k.a[0] + k.d[0] * t, k.a[1] + k.d[1] * t], d: k.d };
    },
  };
}

/**
 * The border's stones as one geometry in plan space (x = plan x, z = plan y, y up from the ground under each stone),
 * colored per vertex, for the shared boulder material. Null when the line is too short for a stone.
 */
export function rockBorderGeometry(l: LineItem, B: RockBorderSpec, height: (p: Vec2) => number): THREE.BufferGeometry | null {
  const run = runOf(l.points);
  if (run.length < 0.1) return null;
  const r = rng(`rock-border:${l.id}`);
  const parts: THREE.BufferGeometry[] = [];
  const place = (lb: number, c: Vec2, yaw: number, seed: string) => {
    // A little variety in proportion, stone to stone.
    const ratio: [number, number, number] = [1, BORDER_STONE_RATIO[1] * (0.85 + r() * 0.3), BORDER_STONE_RATIO[2] * (0.8 + r() * 0.4)];
    const [L, D, H] = mossSizeIn(lb, ratio, BORDER_BURIED);
    const size: [number, number, number] = [L * IN, D * IN, H * IN];
    const geo = buildRock({ shape: BORDER_STONE, look: borderLook(r()), size, buried: BORDER_BURIED, seed, moss: true });
    const y0 = height(c);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // The ground about the stone, in its own frame, for setting it into a slope.
    const sink = footSink((x, z) => height([c[0] + x * cs - z * sn, c[1] + x * sn + z * cs]) - y0, size[0], size[1], size[2] * 0.4);
    geo.rotateY(-yaw);
    geo.translate(c[0], y0 - sink, c[1]);
    parts.push(geo);
    return size;
  };
  const closed = l.points.length > 2 && l.points[0][0] === l.points[l.points.length - 1][0] && l.points[0][1] === l.points[l.points.length - 1][1];
  let s = closed ? 0 : 0.04;
  let n = 0;
  while (s < run.length - 0.05) {
    const lb = B.lb[0] + (B.lb[1] - B.lb[0]) * ((r() + r()) / 2);
    const len = mossSizeIn(lb, BORDER_STONE_RATIO, BORDER_BURIED)[0] * IN;
    const mid = s + len / 2;
    if (!closed && mid + len * 0.35 > run.length) break;
    if (closed && mid + len / 2 > run.length) break;
    const { p, d } = run.at(Math.min(mid, run.length));
    const off = (r() - 0.5) * 2 * B.wanderIn * IN;
    const c: Vec2 = [p[0] - d[1] * off, p[1] + d[0] * off];
    const turn = (r() - 0.5) * 0.7;
    const yaw = Math.atan2(d[1], d[0]) + turn;
    const size = place(lb, c, yaw, `${l.id}:${n++}`);
    // Now and then a smaller stone tucked against a big one, on one side of the line.
    if (r() < B.pairs) {
      const side = r() < 0.5 ? 1 : -1;
      const small = Math.max(B.lb[0] * 0.5, lb * (0.25 + r() * 0.2));
      const sd = mossSizeIn(small, BORDER_STONE_RATIO, BORDER_BURIED)[1] * IN;
      const o = side * (size[1] / 2 + sd * 0.35);
      const a = (r() - 0.5) * len * 0.5;
      place(small, [c[0] - d[1] * o + d[0] * a, c[1] + d[0] * o + d[1] * a], yaw + (r() - 0.5) * 1.2, `${l.id}:${n++}`);
    }
    // On to the next: this stone's length along the line (it is turned a little), then the gap.
    const gap = (B.gapIn[0] + (B.gapIn[1] - B.gapIn[0]) * r()) * IN;
    s += len * Math.abs(Math.cos(turn)) + size[1] * Math.abs(Math.sin(turn)) * 0.5 + gap;
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}
