import * as THREE from 'three';
import { swings } from '../actions';
import type { FeatureSpec } from '../../siteplan/catalog';
import { DEFAULT_BAR_LEDGE, counterFinish, frontLineIn, islandBaseOffsetIn, kitchenPartById, partStub, standsOnFloor, veneerFinish, type KitchenIsland, type KitchenPart } from '../../siteplan/kitchen';
import { IN, bx, counterMaterial, kitchenMats, veneerMaterial, type KitchenSink, type Mover } from './kit';
import { buildPart, notched, ownsInside, stool, type PartCtx } from './parts';
import { griddleStation } from './blackstone';

/*
 * An outdoor kitchen island from its bays (siteplan/kitchen.ts). Local space: the base centered on the origin, its
 * front face at z = +depth/2, x along the run, y up from the patio. Inches throughout, meters at the sink.
 *
 *   Base      a veneer skin (the finish's own thickness) on all faces, cut round every front opening; a dark cavity
 *             behind each opening (an open door shows the inside of the island); the deck under the counter is dark.
 *   Counter   one slab, notched at the front for front-panel drop-ins and cut for sinks, with an eased edge; overhangs
 *             at the front, back and finished ends.
 *   Fronts    framed fronts hang from 1 1/2 in under the counter's underside, or just under a grill's or griddle's front
 *             panel (its body hangs in the island behind the frame's top) or a sink's bowl; cold units stand on the patio. Parts stacked in one bay go top down with 1 1/2 in between.
 *   Light     an LED strip under the counter's front overhang (not across the notches), lighting the veneer below it
 *             with a row of soft downward beams.
 *   Bar       the raised bar ledge option: a veneered wall behind the base, a bar top over it, stools behind.
 *   By hand   the hoods and lids, the doors, the drawers and the light each have one action.
 *
 * Only straight islands (one run) are drawn; an L or U island's later runs are skipped for now.
 */

/** Rectangles covering [x0, x1] x [y0, y1] less the holes (each x0, x1, y0, y1). */
function minusHoles(x0: number, x1: number, y0: number, y1: number, holes: [number, number, number, number][]): [number, number, number, number][] {
  const xs = [x0, x1, ...holes.flatMap((h) => [h[0], h[1]])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const cut = holes.filter((h) => mid > h[0] && mid < h[1]).map((h) => [Math.max(y0, h[2]), Math.min(y1, h[3])] as [number, number]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [p, q] of cut) {
      if (p > y + 1e-4) out.push([a, b, y, p]);
      y = Math.max(y, q);
    }
    if (y1 > y + 1e-4) out.push([a, b, y, y1]);
  }
  return out;
}

export interface IslandChoices {
  underLight: boolean;
  barLedge: boolean;
  seed: string;
  /** Options for every bay's parts (a placement's options), over each bay's own. */
  options?: Record<string, boolean>;
}

export function buildIsland(sink: KitchenSink, isl: KitchenIsland, ch: IslandChoices) {
  const m = kitchenMats();
  const run = isl.runs[0];
  const L = run.lengthIn, D = isl.depthIn, top = isl.counterHeightIn;
  const cf = counterFinish(isl.counter.finish), vf = veneerFinish(isl.veneer);
  const t = isl.counter.thicknessIn ?? cf.thicknessIn, base = top - t, tv = vf.thicknessIn;
  const face = D / 2, back = -D / 2;
  const bar = ch.barLedge ? isl.barLedge ?? DEFAULT_BAR_LEDGE : undefined;
  const oh = { ...isl.counter.overhangIn };
  if (bar) oh.back = 0;
  const endL = isl.ends.left === 'finished' ? oh.ends : 0, endR = isl.ends.right === 'finished' ? oh.ends : 0;
  const edge = face + oh.front;
  const veneer = veneerMaterial(vf.id), counter = counterMaterial(cf.id);
  const add = sink.add;

  // Bays and what is in them.
  let x = -L / 2;
  const bays = run.bays.map((b) => {
    const cx = x + b.widthIn / 2;
    x += b.widthIn;
    const topPart = b.top ? kitchenPartById.get(b.top) : undefined;
    const fronts = (b.front ?? []).map((id) => kitchenPartById.get(id)).filter((p): p is KitchenPart => !!p);
    return { b, cx, x0: cx - b.widthIn / 2, x1: cx + b.widthIn / 2, topPart, fronts };
  });

  // Where every front part goes, and the openings in the face.
  const holes: [number, number, number, number][] = [];
  const cavities: [number, number, number, number, number][] = [];
  const placed: { part: KitchenPart; bay: (typeof bays)[number]; y: number }[] = [];
  for (const bay of bays) {
    let y = frontLineIn(isl, bay.b);
    for (const p of bay.fronts) {
      const cut = p.cutout ?? [p.overall[0] - 1.5, 21, p.overall[2] - 1.5];
      if (standsOnFloor(p)) {
        holes.push([bay.cx - cut[0] / 2, bay.cx + cut[0] / 2, 0, Math.min(base - 0.1, cut[2])]);
        placed.push({ part: p, bay, y: p.overall[2] });
        continue;
      }
      const h = p.overall[2], cy0 = y - h / 2 - cut[2] / 2;
      holes.push([bay.cx - cut[0] / 2, bay.cx + cut[0] / 2, cy0, cy0 + cut[2]]);
      if (!ownsInside(p)) cavities.push([bay.cx, cut[0], cy0, cut[2], Math.min(cut[1], D - 2 * tv - 1)]);
      placed.push({ part: p, bay, y });
      y -= h + 1.5;
    }
  }

  // The base: veneer skin round the front's openings, the back, the ends; the dark deck under the counter.
  for (const [a, b, y0, y1] of minusHoles(-L / 2, L / 2, 0, base, holes)) add(veneer, bx(b - a, y1 - y0, tv, (a + b) / 2, y0, face - tv / 2));
  add(veneer, bx(L, base, tv, 0, 0, back + tv / 2));
  for (const s of [-1, 1] as const) {
    const fin = (s < 0 ? isl.ends.left : isl.ends.right) === 'finished';
    add(fin ? veneer : m.core, bx(tv, base, D - 2 * tv, s * (L / 2 - tv / 2), 0, 0));
  }
  add(m.inside, bx(L - 2 * tv, 0.1, D - 2 * tv, 0, base - 0.12, 0));
  for (const [cx, w, y0, h, d] of cavities) {
    const g = new THREE.BoxGeometry(w * IN, h * IN, d * IN).translate(cx * IN, (y0 + h / 2) * IN, (face - d / 2 + 0.01) * IN).toNonIndexed();
    add(m.cavity, g);
  }

  // The counter: one slab with notches and cut-outs, eased edge.
  const cx0 = -L / 2 - endL, cx1 = L / 2 + endR, cz0 = back - oh.back, cz1 = edge;
  const notches: [number, number, number][] = [];
  const cuts: [number, number, number, number][] = [];
  for (const bay of bays) {
    const p = bay.topPart;
    if (!p?.cutout || p.mount !== 'dropIn') continue;
    if (notched(p)) notches.push([bay.cx - p.cutout[0] / 2, bay.cx + p.cutout[0] / 2, edge - p.cutout[1]]);
    else if (p.type === 'sink') {
      const z1 = edge - 3.5;
      cuts.push([bay.cx - p.cutout[0] / 2, bay.cx + p.cutout[0] / 2, z1 - p.cutout[1], z1]);
    }
  }
  notches.sort((a, b) => a[0] - b[0]);
  const shape = new THREE.Shape();
  // Shape space: (x, -z), so the slab's front edge is at the bottom of the shape.
  const P = (px: number, pz: number) => new THREE.Vector2(px * IN, -pz * IN);
  const pts: THREE.Vector2[] = [P(cx0, cz0), P(cx0, cz1)];
  for (const [a, b, zb] of notches) pts.push(P(a, cz1), P(a, zb), P(b, zb), P(b, cz1));
  pts.push(P(cx1, cz1), P(cx1, cz0));
  shape.setFromPoints(pts);
  for (const [a, b, z0, z1] of cuts) shape.holes.push(new THREE.Path([P(a, z0), P(b, z0), P(b, z1), P(a, z1)]));
  const bev = isl.counter.edge === 'bullnose' ? 0.45 : 0.14;
  const slab = new THREE.ExtrudeGeometry(shape, { depth: (t - 2 * bev) * IN, bevelEnabled: true, bevelThickness: bev * IN, bevelSize: bev * IN, bevelOffset: -bev * IN, bevelSegments: isl.counter.edge === 'bullnose' ? 5 : 2, curveSegments: 1 });
  slab.rotateX(-Math.PI / 2);
  slab.translate(0, (base + bev) * IN, 0);
  const sg = slab.index ? slab.toNonIndexed() : slab;
  sg.computeVertexNormals();
  // UVs in meters, the top's from its plan position.
  {
    const p = sg.getAttribute('position'), n = sg.getAttribute('normal');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const [a, b] = ay > 0.6 ? [p.getX(i), p.getZ(i)] : ax > 0.6 ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
      uv[i * 2] = a;
      uv[i * 2 + 1] = b;
    }
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  add(counter, sg);

  // The parts.
  const movers: Mover[] = [];
  const ctx = (part: KitchenPart, bay: (typeof bays)[number], y: number): PartCtx => {
    const opts: Record<string, boolean> = {};
    for (const o of part.options ?? []) opts[o.key] = o.default;
    Object.assign(opts, bay.b.options, ch.options);
    return { sink, mats: m, part, x: bay.cx, face, top, base, edge, back: back - oh.back, y, hinge: bay.b.hinge ?? part.hinge ?? 'left', options: opts, seed: `${ch.seed}-${part.id}-${bay.cx}` };
  };
  for (const bay of bays) if (bay.topPart) movers.push(...buildPart(ctx(bay.topPart, bay, top)));
  for (const pl of placed) movers.push(...buildPart(ctx(pl.part, pl.bay, pl.y)));

  // The LED strip under the front overhang, and its light on the veneer.
  if (isl.light && oh.front > 0.5) {
    const led = new THREE.MeshStandardMaterial({ color: '#f4efe4', emissive: new THREE.Color(isl.light.kelvin <= 3000 ? '#ffd2a0' : '#fff1dc'), emissiveIntensity: 0, roughness: 0.4 });
    sink.own(led);
    sink.glow(led);
    const ranges = minusHoles(cx0 + 1, cx1 - 1, 0, 1, notches.map(([a, b]) => [a - 0.5, b + 0.5, -1, 2]));
    const beams: { off?: boolean }[] = [];
    const zs = face + Math.min(0.75, oh.front / 2);
    for (const [a, b] of ranges) {
      add(m.plate, bx(b - a, 0.25, 0.7, (a + b) / 2, base - 0.27, zs));
      add(led, bx(b - a - 0.2, 0.06, 0.42, (a + b) / 2, base - 0.33, zs));
      // Beams kept a few inches in from the strip's ends, off the corners of the appliances' front panels.
      const a2 = a + 3, b2 = b - 3;
      const n = Math.max(1, Math.round((b2 - a2) / 12));
      for (let i = 0; i < n; i++) {
        const lx = a2 + ((i + 0.5) * (b2 - a2)) / n;
        const beam = { position: new THREE.Vector3(lx * IN, (base - 0.6) * IN, (zs + 0.2) * IN), direction: new THREE.Vector3(0, -1, -0.2).normalize(), beamDeg: 110, cutoffDeg: 165, lumens: (isl.light.lumensPerFt * (b - a)) / 12 / n, kelvin: isl.light.kelvin, range: 1.1 };
        beams.push(sink.landLight(beam));
      }
    }
    const setLight = (on: boolean) => {
      led.userData.off = !on;
      for (const bm of beams) bm.off = !on;
    };
    setLight(ch.underLight);
    sink.act({ key: 'light', label: 'Under-counter light', words: ['On', 'Off'], option: 'underLight', anchors: ranges.map(([a, b]) => sink.anchor(null, ((a + b) / 2) * IN, (base - 2) * IN, (face + 1) * IN)), on: ch.underLight, planOn: ch.underLight, lights: true, set: setLight });
  }

  // The raised bar ledge behind the base, and its stools.
  if (bar) {
    const wy = bar.heightIn - t, wz = back - bar.wallIn / 2;
    add(veneer, bx(L, wy, bar.wallIn, 0, 0, wz));
    const bt = new THREE.BoxGeometry((cx1 - cx0) * IN, t * IN, (bar.wallIn + bar.overhangIn + oh.front) * IN);
    bt.translate(((cx0 + cx1) / 2) * IN, (wy + t / 2) * IN, (back - bar.wallIn - bar.overhangIn + (bar.wallIn + bar.overhangIn + oh.front) / 2) * IN);
    const btg = bt.toNonIndexed();
    {
      const p = btg.getAttribute('position'), n = btg.getAttribute('normal');
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const ay = Math.abs(n.getY(i)), ax = Math.abs(n.getX(i));
        const [a, b] = ay > 0.6 ? [p.getX(i), p.getZ(i)] : ax > 0.6 ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
        uv[i * 2] = a + 0.3;
        uv[i * 2 + 1] = b + 0.2;
      }
      btg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    add(counter, btg);
    const sp = kitchenPartById.get(bar.stool ?? 'kitchen-stool-bar');
    const n = bar.stools ?? 0;
    if (sp && n > 0) {
      const sz = back - bar.wallIn - bar.overhangIn + 2;
      for (let i = 0; i < n; i++) {
        const sx = -L / 2 + ((i + 0.5) * L) / n;
        // Built facing +z: the seated face the bar, the stool's back away from it.
        stool(add, m, sp, sx, sz);
      }
    }
  }

  // By hand.
  const byKind = (k: Mover['kind'][]) => movers.filter((v) => k.includes(v.kind));
  const groups: [string, Mover[], [string, string]][] = [
    ['hood', byKind(['hood', 'lid']), ['Open', 'Closed']],
    ['doors', byKind(['door']), ['Open', 'Closed']],
    ['drawers', byKind(['drawer']), ['Open', 'Closed']],
  ];
  for (const [key, list, words] of groups) {
    if (!list.length) continue;
    const labels = [...new Set(list.map((v) => v.label))];
    const label = key === 'hood' ? (labels.length === 1 ? labels[0] : 'Hoods and lids') : key === 'doors' ? (labels.length === 1 && labels[0] !== 'Door' ? labels[0] : 'Cabinet doors') : labels.length === 1 ? labels[0] : 'Drawers';
    sink.act({ key, label, words, anchors: list.map((v) => v.anchor), on: false, planOn: false, ...swings(list.map((v) => v.rig)) });
  }
}

/** A kitchen feature: an island, or one part shown on its own (a stub of island round it, or a stool on its own). */
export function buildKitchenFeature(sink: KitchenSink, spec: FeatureSpec, options: Record<string, boolean> | undefined, seed: string) {
  const opt = (key: string) => options?.[key] ?? spec.options?.find((o) => o.key === key)?.default ?? false;
  if (spec.kind === 'griddleStation') {
    griddleStation(sink, spec, options, seed);
    return;
  }
  if (spec.kind === 'kitchenIsland' && spec.island) {
    buildIsland(shifted(sink, islandBaseOffsetIn(spec.island)), spec.island, { underLight: opt('underLight'), barLedge: opt('barLedge'), seed, options });
    return;
  }
  const part = spec.kitchenPart ? kitchenPartById.get(spec.kitchenPart) : undefined;
  if (!part) return;
  if (part.mount === 'free') {
    stool(sink.add, kitchenMats(), part, 0, 0);
    return;
  }
  const stub = partStub(part);
  buildIsland(shifted(sink, islandBaseOffsetIn(stub)), stub, { underLight: false, barLedge: false, seed, options });
}

/**
 * A sink that moves everything by (dx, dz) inches: the island is built about its base and placed so its counter slab
 * (the footprint) is centered on the placement.
 */
function shifted(sink: KitchenSink, [dxIn, dzIn]: [number, number]): KitchenSink {
  const dx = dxIn * IN, dz = dzIn * IN;
  if (!dx && !dz) return sink;
  return {
    ...sink,
    add: (m, g) => sink.add(m, g.translate(dx, 0, dz)),
    hinge: (px, py, pz) => {
      const h = sink.hinge(px + dx, py, pz + dz);
      return { group: h.group, add: (m, g) => h.add(m, g.translate(dx, 0, dz)) };
    },
    anchor: (parent, x, y, z) => (parent ? sink.anchor(parent, x, y, z) : sink.anchor(null, x + dx, y, z + dz)),
    fire: (t, style) => sink.fire(t.map((g) => ({ ...g, x: g.x + dx, z: g.z + dz })), style),
    light: (x, y, z, ...rest) => sink.light(x + dx, y, z + dz, ...rest),
    landLight: (l) => sink.landLight({ ...l, position: l.position.clone().add(new THREE.Vector3(dx, 0, dz)) }),
  };
}
