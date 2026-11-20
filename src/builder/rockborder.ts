import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { BORDER_BURIED, BORDER_STONE_RATIO, mossSizeIn, type RockBorderSpec } from '../siteplan/groundrock';
import type { LineItem, Vec2 } from '../siteplan/types';
import type { Quality } from '../engine/post';
import { DOUBLE_HEAD_FORM, borderLook } from './groundrock-looks';
import { MOSS_ROCK_SPACING, buildMossRock, type MossRockLook } from './mossrock';
import { footSink } from './stonegeo';

/*
 * A border of stones laid along an edging line (a material with spec.rockBorder: double-head moss rock round a dry
 * creek). The stones go down the run one at a time, as a crew sets them: each a weight from the look's range (more of
 * the middle weights) made into a size (siteplan/groundrock.ts mossSizeIn), its long side roughly along the line, a few
 * inches from the last one, wandering a little either side, now and then a smaller stone tucked beside a big one. Every
 * stone is its own shape, drawn in fine detail as moss rock (builder/mossrock.ts) and seeded by the line's id and its
 * place on it, so a border keeps its stones when the plan is rebuilt; set a quarter into the ground, sunk on a slope so
 * no gap shows. A border holds many stones (a 35 ft creek edged both sides some 70 of them), so its stones share a few
 * shapes per look (BORDER_SHAPES), built once and kept, each stone an instance turned and stretched to its own size, at
 * a mesh coarser than a lone boulder's (BORDER_COARSER); the material draws pores and lichen from where each stone is, so
 * no two show the same.
 */

/** How much coarser a border stone's mesh is than a lone boulder's at the same quality. */
export const BORDER_COARSER = 1.6;

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

/** Stone shapes per look: a border's stones are these, each turned, sized and set its own way. */
export const BORDER_SHAPES = 8;
const shapes = new Map<string, THREE.BufferGeometry>();
/** The size a border stone shape is built at: the middle stone (about 47 lb), [length, depth, height that shows], m. */
const REF_SIZE = mossSizeIn(47, BORDER_STONE_RATIO, BORDER_BURIED).map((v) => v * IN) as [number, number, number];

/** Border stone shape `v` in look `li` (of borderLook's three), built once per quality and kept. */
function borderShape(li: number, look: MossRockLook, v: number, quality: Quality): THREE.BufferGeometry {
  const key = `${li}:${v}:${quality}`;
  let g = shapes.get(key);
  if (!g) {
    g = buildMossRock({ size: REF_SIZE, buried: BORDER_BURIED, seed: `border-stone:${li}:${v}`, moss: true, form: DOUBLE_HEAD_FORM, look, spacing: MOSS_ROCK_SPACING[quality] * BORDER_COARSER });
    g.computeBoundingSphere();
    shapes.set(key, g);
  }
  return g;
}

/** One stone shape of a border and where each of its stones stands (plan space: x = plan x, z = plan y, y up). */
export interface BorderStones {
  look: MossRockLook;
  /** Shared and kept (never disposed by the yard). */
  shape: THREE.BufferGeometry;
  at: THREE.Matrix4[];
}

/**
 * The border's stones, grouped by shape, for one instanced mesh each (the look's moss rock material). Each stone keeps
 * the place, turn, size and look the line's seed always gave it; its shape is one of BORDER_SHAPES per look, stretched
 * to its size. Empty when the line is too short for a stone.
 */
export function rockBorderStones(l: LineItem, B: RockBorderSpec, height: (p: Vec2) => number, quality: Quality = 'balanced'): BorderStones[] {
  const run = runOf(l.points);
  if (run.length < 0.1) return [];
  const r = rng(`rock-border:${l.id}`);
  const groups = new Map<THREE.BufferGeometry, BorderStones>();
  const looks = [borderLook(0), borderLook(0.5), borderLook(0.9)];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const place = (lb: number, c: Vec2, yaw: number, seed: string) => {
    // A little variety in proportion, stone to stone.
    const ratio: [number, number, number] = [1, BORDER_STONE_RATIO[1] * (0.85 + r() * 0.3), BORDER_STONE_RATIO[2] * (0.8 + r() * 0.4)];
    const [L, D, H] = mossSizeIn(lb, ratio, BORDER_BURIED);
    const size: [number, number, number] = [L * IN, D * IN, H * IN];
    const look = borderLook(r());
    // The shape from the stone's own seed, apart from the line's numbers, so every stone stays where it was.
    const v = Math.floor(rng(`border-shape:${seed}`)() * BORDER_SHAPES);
    const shape = borderShape(looks.indexOf(look), look, v, quality);
    const y0 = height(c);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // The ground about the stone, in its own frame, for setting it into a slope.
    const sink = footSink((x, z) => height([c[0] + x * cs - z * sn, c[1] + x * sn + z * cs]) - y0, size[0], size[1], size[2] * 0.4);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(c[0], y0 - sink, c[1]),
      q.setFromAxisAngle(up, -yaw),
      new THREE.Vector3(size[0] / REF_SIZE[0], size[2] / REF_SIZE[2], size[1] / REF_SIZE[1]),
    );
    const grp = groups.get(shape) ?? { look, shape, at: [] };
    grp.at.push(m);
    groups.set(shape, grp);
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
  return [...groups.values()];
}
