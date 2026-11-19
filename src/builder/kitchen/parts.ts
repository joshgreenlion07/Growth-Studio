import * as THREE from 'three';
import { swing } from '../actions';
import { tubeBurner } from '../fire';
import { standsOnFloor, type KitchenPart } from '../../siteplan/kitchen';
import { IN, barHandle, bx, cy, facePlane, namePlate, rbx, slide, stainless, tube, type KitchenMats, type KitchenSink, type Mover } from './kit';

/*
 * The kitchen parts, drawn to their overall and cutout sizes (siteplan/kitchen.ts). All sizes in inches. Each builder
 * gets its bay's place in the island and returns what can be opened by hand.
 *
 * Common details: brushed stainless with its grain running across (left to right) on fronts and tops; a 7/8 in frame
 * flange round every opening with a sleeve back into the cutout; doors and drawer fronts double-walled with softly
 * rounded edges and a 1/8 in shadow gap all round (the dark of the cavity shows in it); bar handles on standoffs; chrome
 * bezels behind the knobs.
 */

export interface PartCtx {
  sink: KitchenSink;
  mats: KitchenMats;
  part: KitchenPart;
  /** The bay's center along the island (x), the veneer face (z), the counter's top and its underside (y). */
  x: number;
  face: number;
  top: number;
  base: number;
  /** The counter's front edge (z) and the base's back face (z). */
  edge: number;
  back: number;
  /** A front part: the top of its frame (y). */
  y: number;
  hinge: 'left' | 'right';
  options: Record<string, boolean>;
  seed: string;
}

type Add = (m: THREE.Material, g: THREE.BufferGeometry) => void;

/** A hinged or sliding group pivoting at a point in inches; its add() takes local-space geometry in meters. */
function pivot(k: PartCtx, x: number, y: number, z: number) {
  return k.sink.hinge(x * IN, y * IN, z * IN);
}

/* ------------------------------------------------------------------ */
/* Fronts: frames, doors, drawers                                       */
/* ------------------------------------------------------------------ */

const FLANGE = 0.875;
const GAP = 0.125;
/** The flange stands this far proud of the veneer; door faces sit flush with it. */
const PROUD = 0.3;

/** The frame round an opening: flange on the face and a sleeve back into the cutout. Returns the clear opening. */
function frame(add: Add, m: KitchenMats, x: number, yTop: number, w: number, h: number, face: number) {
  const z = face + PROUD / 2;
  const y0 = yTop - h;
  add(m.steel, rbx(w, FLANGE, PROUD, x, yTop - FLANGE, z, 0.06));
  add(m.steel, rbx(w, FLANGE, PROUD, x, y0, z, 0.06));
  add(m.steel, rbx(FLANGE, h - 2 * FLANGE, PROUD, x - w / 2 + FLANGE / 2, y0 + FLANGE, z, 0.06));
  add(m.steel, rbx(FLANGE, h - 2 * FLANGE, PROUD, x + w / 2 - FLANGE / 2, y0 + FLANGE, z, 0.06));
  // The sleeve: thin stainless returns 2 in deep inside the opening.
  const iw = w - 2 * FLANGE, ih = h - 2 * FLANGE, sd = 2, t = 0.06;
  add(m.steel, bx(iw, t, sd, x, yTop - FLANGE - t, face - sd / 2));
  add(m.steel, bx(iw, t, sd, x, y0 + FLANGE, face - sd / 2));
  add(m.steel, bx(t, ih, sd, x - iw / 2 + t / 2, y0 + FLANGE, face - sd / 2));
  add(m.steel, bx(t, ih, sd, x + iw / 2 - t / 2, y0 + FLANGE, face - sd / 2));
  return { x0: x - iw / 2, x1: x + iw / 2, y0: y0 + FLANGE, y1: yTop - FLANGE };
}

/** A door leaf x0..x1, y0..y1 (inside the frame, gaps taken off), hinged on `hingeSide`, with its handle. */
function leaf(k: PartCtx, x0: number, x1: number, y0: number, y1: number, hingeSide: 'left' | 'right', handle = true): { group: THREE.Group; add: Add; rig: Mover['rig']; cx: number; cy: number; zf: number } {
  const m = k.mats;
  const zf = k.face + PROUD;
  const w = x1 - x0, h = y1 - y0, t = 0.8;
  const px = hingeSide === 'left' ? x0 : x1;
  const hg = pivot(k, px, y0, zf);
  hg.add(m.steel, rbx(w, h, t, (x0 + x1) / 2, y0, zf - t / 2, 0.14));
  // The back pan of a double-walled door, a little smaller, in the dark of the cavity.
  hg.add(m.inside, bx(w - 2, h - 2, 0.1, (x0 + x1) / 2, y0 + 1, zf - t - 0.05));
  if (handle) {
    const hx = hingeSide === 'left' ? x1 - 1.9 : x0 + 1.9;
    barHandle(hg.add, m.steel, 'y', Math.min(h * 0.55, 13), hx, (y0 + y1) / 2, zf, 1.35, 0.32);
  }
  const rig = swing(hg.group, 'y', hingeSide === 'left' ? -1.7 : 1.7, false);
  return { ...hg, rig, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zf };
}

function singleDoor(k: PartCtx): Mover[] {
  const p = k.part, [w, , h] = p.overall;
  const o = frame(k.sink.add, k.mats, k.x, k.y, w, h, k.face);
  const d = leaf(k, o.x0 + GAP, o.x1 - GAP, o.y0 + GAP, o.y1 - GAP, k.hinge);
  if (p.type === 'propane') propaneVents(k, d, o, k.hinge);
  const free = k.hinge === 'left' ? o.x1 - 2 : o.x0 + 2;
  return [{ kind: 'door', label: p.type === 'propane' ? 'Propane cabinet door' : 'Door', rig: d.rig, anchor: k.sink.anchor(d.group, (free - (k.hinge === 'left' ? o.x0 : o.x1)) * IN, (d.cy - o.y0) * IN, 0.02) }];
}

function doubleDoor(k: PartCtx): Mover[] {
  const [w, , h] = k.part.overall;
  const o = frame(k.sink.add, k.mats, k.x, k.y, w, h, k.face);
  const mid = (o.x0 + o.x1) / 2;
  const l = leaf(k, o.x0 + GAP, mid - GAP / 2, o.y0 + GAP, o.y1 - GAP, 'left');
  const r = leaf(k, mid + GAP / 2, o.x1 - GAP, o.y0 + GAP, o.y1 - GAP, 'right');
  const hy = (l.cy - o.y0) * IN;
  return [
    { kind: 'door', label: 'Doors', rig: l.rig, anchor: k.sink.anchor(l.group, (mid - o.x0 - 2) * IN, hy, 0.02) },
    { kind: 'door', label: 'Doors', rig: r.rig, anchor: k.sink.anchor(r.group, (mid - o.x1 + 2) * IN, hy, 0.02) },
  ];
}

/** Two rows of four louvered vent slots, low on the hinge side of a propane cabinet's door. */
function propaneVents(k: PartCtx, d: ReturnType<typeof leaf>, o: { x0: number; x1: number; y0: number }, hingeSide: 'left' | 'right') {
  const sw = 1.5, sh = 0.42, pitchX = 2.05, pitchY = 1.2;
  const right = hingeSide === 'right';
  const xs0 = right ? o.x1 - 2.2 - 3 * pitchX : o.x0 + 2.2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = xs0 + c * pitchX, y = o.y0 + 2.2 + r * pitchY;
    d.add(k.mats.rubber, bx(sw, sh, 0.1, x, y, d.zf + 0.005));
    // A louver lip over each slot, bent out and down.
    const lip = bx(sw + 0.1, 0.1, 0.35, x, y + sh - 0.05, d.zf + 0.17);
    lip.translate(-x * IN, -(y + sh) * IN, -(d.zf + 0.17) * IN);
    lip.rotateX(0.5);
    lip.translate(x * IN, (y + sh) * IN, (d.zf + 0.17) * IN);
    d.add(k.mats.steel, lip);
  }
  // The tank inside on its pull-out tray.
  const tz = k.face - 11;
  k.sink.add(k.mats.steel, bx(o.x1 - o.x0 - 1.5, 0.4, 18, (o.x0 + o.x1) / 2, o.y0 + 0.2, tz));
  for (const s of [-1, 1]) k.sink.add(k.mats.steel, bx(0.4, 1.4, 18, (o.x0 + o.x1) / 2 + s * ((o.x1 - o.x0) / 2 - 1), o.y0 + 0.2, tz));
  propaneTank(k.sink.add, k.mats, (o.x0 + o.x1) / 2, o.y0 + 0.6, tz);
}

/** A 20 lb propane tank, 12 1/4 in across and 18 in tall: foot ring, body, shoulder, collar with handle holes, valve. */
export function propaneTank(add: Add, m: KitchenMats, x: number, y: number, z: number) {
  const r = 6.125;
  add(m.tank, cy(5.2, 5.2, 1.6, x, y, z, 'y', 28));
  add(m.tank, cy(r, r, 10.4, x, y + 1.6, z, 'y', 32));
  const dome = new THREE.SphereGeometry(r * IN, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.55, 1);
  dome.translate(x * IN, (y + 12) * IN, z * IN);
  add(m.tank, dome.toNonIndexed());
  const bottom = new THREE.SphereGeometry(r * IN, 32, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bottom.scale(1, 0.3, 1);
  bottom.translate(x * IN, (y + 1.6) * IN, z * IN);
  add(m.tank, bottom.toNonIndexed());
  const collar = new THREE.CylinderGeometry(3.6 * IN, 3.6 * IN, 3.8 * IN, 28, 1, true);
  collar.translate(x * IN, (y + 16.3) * IN, z * IN);
  add(m.tank, collar.toNonIndexed());
  add(m.brass, cy(0.55, 0.55, 2.2, x, y + 14.8, z, 'y', 12));
  add(m.knob, cy(1.1, 1.1, 0.45, x, y + 17, z, 'y', 16));
}

function drawers(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, [w, , h] = p.overall, n = p.drawers ?? 2;
  const o = frame(k.sink.add, m, k.x, k.y, w, h, k.face);
  const fh = (o.y1 - o.y0 - (n + 1) * GAP) / n;
  const zf = k.face + PROUD, t = 0.8, depth = 18;
  const out: Mover[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = o.y1 - GAP - (i + 1) * fh - i * GAP;
    const g = pivot(k, k.x, y0, zf);
    const fw = o.x1 - o.x0 - 2 * GAP;
    g.add(m.steel, rbx(fw, fh, t, k.x, y0, zf - t / 2, 0.14));
    barHandle(g.add, m.steel, 'x', Math.min(fw - 5, 22), k.x, y0 + fh * 0.6, zf, 1.3, 0.32);
    // The drawer box behind its front: stainless sides and back, a dark bottom.
    const bw = fw - 1.5, bh = Math.max(3, fh - 1.6), bz = zf - t - depth / 2;
    for (const s of [-1, 1]) g.add(m.steel, bx(0.08, bh, depth, k.x + s * (bw / 2), y0 + 0.6, bz));
    g.add(m.steel, bx(bw, bh, 0.08, k.x, y0 + 0.6, zf - t - depth));
    g.add(m.inside, bx(bw, 0.1, depth, k.x, y0 + 0.6, bz));
    out.push({ kind: 'drawer', label: 'Drawers', rig: slide(g.group, 'z', 15 * IN, false, 0.7, i * 0.12), anchor: k.sink.anchor(g.group, 0, fh * 0.6 * IN, 0.03) });
  }
  return out;
}

function trash(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, [w, , h] = p.overall;
  const o = frame(k.sink.add, m, k.x, k.y, w, h, k.face);
  const zf = k.face + PROUD, t = 0.8;
  const fw = o.x1 - o.x0 - 2 * GAP, fh = o.y1 - o.y0 - 2 * GAP, y0 = o.y0 + GAP;
  const g = pivot(k, k.x, y0, zf);
  g.add(m.steel, rbx(fw, fh, t, k.x, y0, zf - t / 2, 0.14));
  barHandle(g.add, m.steel, 'x', Math.min(fw - 4, 11), k.x, y0 + fh - 2.2, zf, 1.3, 0.32);
  // The bin on its frame.
  const bz = zf - t - 10;
  g.add(m.steel, bx(fw - 1.5, 0.3, 19, k.x, y0 + 0.5, bz));
  const nb = p.bins ?? 1, bw = nb > 1 ? (fw - 3) / nb - 0.6 : Math.min(12, fw - 2.5);
  for (let i = 0; i < nb; i++) {
    const bxx = nb > 1 ? k.x - (fw - 3) / 2 + ((i + 0.5) * (fw - 3)) / nb : k.x;
    g.add(m.bin, bx(bw, fh - 4, 17, bxx, y0 + 0.8, bz));
    g.add(m.rubber, bx(bw + 0.6, 0.5, 17.6, bxx, y0 + fh - 3.3, bz));
  }
  return [{ kind: 'drawer', label: nb > 1 ? 'Trash and recycle pull-out' : 'Trash pull-out', rig: slide(g.group, 'z', 16 * IN, false, 0.8), anchor: k.sink.anchor(g.group, 0, (fh - 2.2) * IN, 0.03) }];
}

/** A door and drawer combo: a full-width drawer over a pair of doors in one frame. */
function combo(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, [w, , h] = p.overall;
  const o = frame(k.sink.add, m, k.x, k.y, w, h, k.face);
  const zf = k.face + PROUD, t = 0.8;
  const fw = o.x1 - o.x0 - 2 * GAP, dh = Math.min(6, (o.y1 - o.y0) * 0.3), y0 = o.y1 - GAP - dh;
  const g = pivot(k, k.x, y0, zf);
  g.add(m.steel, rbx(fw, dh, t, k.x, y0, zf - t / 2, 0.14));
  barHandle(g.add, m.steel, 'x', Math.min(fw - 6, 18), k.x, y0 + dh * 0.55, zf, 1.3, 0.32);
  const bw = fw - 1.5, depth = 16;
  for (const s2 of [-1, 1]) g.add(m.steel, bx(0.08, dh - 1.4, depth, k.x + s2 * (bw / 2), y0 + 0.6, zf - t - depth / 2));
  g.add(m.inside, bx(bw, 0.1, depth, k.x, y0 + 0.6, zf - t - depth / 2));
  const mid = (o.x0 + o.x1) / 2, top = y0 - GAP;
  const l = leaf(k, o.x0 + GAP, mid - GAP / 2, o.y0 + GAP, top, 'left');
  const r = leaf(k, mid + GAP / 2, o.x1 - GAP, o.y0 + GAP, top, 'right');
  const hy = (l.cy - o.y0) * IN;
  return [
    { kind: 'drawer', label: 'Drawers', rig: slide(g.group, 'z', 13 * IN, false, 0.7), anchor: k.sink.anchor(g.group, 0, dh * 0.55 * IN, 0.03) },
    { kind: 'door', label: 'Doors', rig: l.rig, anchor: k.sink.anchor(l.group, (mid - o.x0 - 2) * IN, hy, 0.02) },
    { kind: 'door', label: 'Doors', rig: r.rig, anchor: k.sink.anchor(r.group, (mid - o.x1 + 2) * IN, hy, 0.02) },
  ];
}

function towel(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, [w, , h] = p.overall;
  const o = frame(k.sink.add, m, k.x, k.y, w, h, k.face);
  // A rounded recess and the roll on its rod.
  const cx = (o.x0 + o.x1) / 2, cyy = (o.y0 + o.y1) / 2;
  k.sink.add(m.cavity, bx(o.x1 - o.x0, o.y1 - o.y0, 4.6, cx, o.y0, k.face - 2.3));
  k.sink.add(m.towel, cy(2.2, 2.2, o.x1 - o.x0 - 1.2, cx, cyy, k.face - 2.1, 'x', 28));
  k.sink.add(m.chrome, cy(0.25, 0.25, o.x1 - o.x0 - 0.2, cx, cyy, k.face - 2.1, 'x', 10));
  // The sheet hanging out of the slot.
  k.sink.add(m.towel, bx(o.x1 - o.x0 - 1.6, 1.6, 0.05, cx, o.y0 - 0.2, k.face + 0.2));
  return [];
}

/* ------------------------------------------------------------------ */
/* Cold                                                                 */
/* ------------------------------------------------------------------ */

function coldUnit(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, [w, , h] = p.overall, d = Math.min(22, p.overall[1] - 2);
  const x = k.x, zf = k.face + 1.2;
  const add = k.sink.add;
  // Cabinet sides and top, just inside the opening.
  add(m.steel, bx(w, 0.06, d, x, h - 0.06, k.face - d / 2));
  for (const s of [-1, 1]) add(m.steel, bx(0.06, h, d, x + s * (w / 2 - 0.03), 0, k.face - d / 2));
  // Kick grille: a dark panel with stainless slats and a plain plate.
  const gh = 4.2;
  add(m.rubber, bx(w - 0.4, gh, 0.2, x, 0.4, k.face + 0.4));
  for (let i = 0; i < 6; i++) add(m.steel, rbx(w - 1.2, 0.28, 0.5, x, 0.85 + i * 0.6, k.face + 0.6, 0.08));
  add(m.plate, rbx(3.2, 0.9, 0.18, x, gh - 1.3, k.face + 0.92, 0.06));
  // Liner, shelves and what is kept inside.
  const iw = w - 2.4, ih = h - gh - 2.4, iz = k.face - 1 - (d - 3) / 2, iy = gh + 1;
  const liner = new THREE.BoxGeometry(iw * IN, ih * IN, (d - 3) * IN).translate(x * IN, (iy + ih / 2) * IN, iz * IN).toNonIndexed();
  add(linerIn(), liner);
  if (p.type === 'iceMaker') {
    add(m.liner, bx(iw - 0.6, ih * 0.45, d - 5, x, iy, iz));
    for (let i = 0; i < 30; i++) {
      const a = (i * 2.399) % (Math.PI * 2), rr = ((i * 0.37) % 1) * (iw / 2 - 2);
      const cube = bx(1.1, 1.1, 1.1, x + Math.cos(a) * rr, iy + ih * 0.45, iz + Math.sin(a) * rr * 0.9);
      add(m.ice, cube);
    }
  } else if (p.type === 'kegerator') {
    const kz = iz;
    add(m.steel, cy(8, 8, 23, x, iy, kz, 'y', 32));
    for (const yy of [iy + 2, iy + 21]) add(m.chrome, cy(8.25, 8.25, 0.4, x, yy, kz, 'y', 32));
    add(m.knob, cy(1.3, 1.3, 1.6, x, iy + 23, kz, 'y', 16));
  } else {
    for (const yy of [iy + ih * 0.36, iy + ih * 0.7]) {
      for (let i = 0; i <= 10; i++) add(m.chrome, cy(0.09, 0.09, d - 5, x - iw / 2 + 1 + (i * (iw - 2)) / 10, yy, iz, 'z', 6));
      add(m.chrome, cy(0.14, 0.14, iw - 1, x, yy, iz + (d - 5) / 2, 'x', 6));
    }
    // A few cans and bottles.
    for (let i = 0; i < 5; i++) add(i % 2 ? m.steel : m.glass, cy(1.3, 1.3, 4.8, x - iw / 2 + 2.4 + i * 3, iy + ih * 0.36 + 0.2, iz + 2, 'y', 16));
    for (let i = 0; i < 3; i++) add(m.glass, cy(1.5, 1.2, 9.5, x - iw / 2 + 3 + i * 3.6, iy + 0.2, iz + 1, 'y', 16));
  }
  // The door.
  const dw = w - 0.3, dh = h - gh - 0.6, dy = gh + 0.3;
  const hingeSide = k.hinge;
  const px = hingeSide === 'left' ? x - dw / 2 : x + dw / 2;
  const g = pivot(k, px, dy, zf);
  if (p.type === 'beverage') {
    // A stainless frame round a tinted glass panel: the lit shelves show through.
    const fr = 2.2;
    g.add(m.steel, rbx(dw, fr, 1.6, x, dy + dh - fr, zf - 0.8, 0.3));
    g.add(m.steel, rbx(dw, fr + 0.8, 1.6, x, dy, zf - 0.8, 0.3));
    for (const sx of [-1, 1]) g.add(m.steel, rbx(fr, dh - 2 * fr - 0.8, 1.6, x + sx * (dw / 2 - fr / 2), dy + fr + 0.8, zf - 0.8, 0.2));
    g.add(m.glass, bx(dw - 2 * fr + 0.4, dh - 2 * fr, 0.3, x, dy + fr + 0.4, zf - 0.9));
  } else {
    g.add(m.steel, rbx(dw, dh, 1.6, x, dy, zf - 0.8, 0.3));
    g.add(linerDoor(), bx(dw - 2.2, dh - 2.2, 0.4, x, dy + 1.1, zf - 2));
  }
  g.add(m.rubber, bx(dw - 0.6, dh - 0.6, 0.25, x, dy + 0.3, zf - 1.7));
  if (p.type === 'fridge') {
    // Recessed pocket handle across the top.
    g.add(m.rubber, bx(dw - 3, 0.9, 0.2, x, dy + dh - 1.9, zf + 0.02));
    g.add(m.steel, rbx(dw - 3, 0.35, 0.7, x, dy + dh - 2.25, zf + 0.15, 0.1));
  } else {
    const hx = hingeSide === 'left' ? x + dw / 2 - 1.8 : x - dw / 2 + 1.8;
    barHandle(g.add, m.steel, 'y', 16, hx, dy + dh * 0.58, zf, 1.4, 0.34);
  }
  if (p.type === 'kegerator') tapTower(k);
  const ax = (hingeSide === 'left' ? dw - 2 : -(dw - 2)) * IN;
  return [{ kind: 'door', label: p.type === 'fridge' ? 'Fridge door' : p.type === 'iceMaker' ? 'Ice maker door' : p.type === 'beverage' ? 'Beverage centre door' : 'Kegerator door', rig: swing(g.group, 'y', hingeSide === 'left' ? -1.75 : 1.75, false), anchor: k.sink.anchor(g.group, ax, dh * 0.6 * IN, 0.03) }];
}

let linerInMat: THREE.MeshStandardMaterial | null = null;
const linerIn = () => (linerInMat ??= new THREE.MeshStandardMaterial({ color: '#d9dbdc', roughness: 0.5, side: THREE.BackSide, emissive: new THREE.Color('#2a2c2e') }));
let linerDoorMat: THREE.MeshStandardMaterial | null = null;
const linerDoor = () => (linerDoorMat ??= new THREE.MeshStandardMaterial({ color: '#cfd1d2', roughness: 0.5 }));

/** The kegerator's dual-tap tower on the counter, with its drip tray. */
function tapTower(k: PartCtx) {
  const m = k.mats, add = k.sink.add, x = k.x, z = k.edge - 8, y = k.top;
  add(m.steel, cy(2.6, 2.6, 0.5, x, y, z, 'y', 28));
  add(m.steel, cy(1.5, 1.5, 13, x, y + 0.5, z, 'y', 24));
  add(m.steel, cy(1.5, 1.5, 9, x, y + 14.2, z, 'x', 24));
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(1.5 * IN, 20, 10);
    e.translate((x + s * 4.5) * IN, (y + 14.2) * IN, z * IN);
    add(m.steel, e.toNonIndexed());
    add(m.chrome, cy(0.5, 0.45, 2.6, x + s * 2.6, y + 13.6, z + 2.2, 'z', 12));
    add(m.chrome, cy(0.25, 0.35, 1.2, x + s * 2.6, y + 12.6, z + 3.2, 'y', 10));
    add(m.knob, cy(0.45, 0.55, 4.2, x + s * 2.6, y + 14.4, z + 2.9, 'y', 12));
  }
  add(m.steel, rbx(12, 0.8, 4.5, x, y, z + 5.2, 0.15));
  add(m.rubber, bx(11, 0.1, 3.5, x, y + 0.75, z + 5.2));
}

/* ------------------------------------------------------------------ */
/* Cooking                                                              */
/* ------------------------------------------------------------------ */

/** A row of knobs on a front panel at height y, stainless or black, with chrome bezels. */
function knobs(add: Add, m: KitchenMats, xs: number[], y: number, zf: number, black: boolean) {
  for (const x of xs) {
    add(m.chrome, cy(1.6, 1.6, 0.18, x, y, zf + 0.09, 'z', 32));
    const body = black ? m.knob : m.steel;
    add(body, cy(1.15, 1.0, 1.1, x, y, zf + 0.18 + 0.55, 'z', 28));
    add(body, rbx(0.38, 1.9, 0.5, x, y - 0.95, zf + 1.25 + 0.2, 0.12));
    // Indicator line.
    add(black ? m.chrome : m.knob, bx(0.12, 0.6, 0.06, x, y + 0.25, zf + 1.48));
  }
}

const spread = (n: number, w: number, x: number) => Array.from({ length: n }, (_, i) => x - w / 2 + ((i + 0.5) * w) / n);

/** The burners' tubes and flames, front to back, in a firebox spanning x0..x1, at y, z0..z1 (back to front). */
function burnerTubes(k: PartCtx, xs: number[], y: number, z0: number, z1: number) {
  const r = 0.55;
  xs.forEach((bxx, i) => {
    k.sink.add(k.mats.steel, cy(r, r, z1 - z0, bxx, y, (z0 + z1) / 2, 'z', 12));
    const a = new THREE.Vector3(bxx * IN, (y + r * 0.8) * IN, (z0 + 0.8) * IN), b = new THREE.Vector3(bxx * IN, (y + r * 0.8) * IN, (z1 - 0.8) * IN);
    k.sink.fire(tubeBurner(a, b, 0.04, `${k.seed}-burner${i}`, 0.022, r * IN * 0.6), 'grill');
  });
}

function grill(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [W, , H] = p.overall, [cw, cd, ch] = p.cutout!;
  const x = k.x, top = k.top, n = p.burners ?? 4;
  const rot = !!k.options.rotisserie;
  const zFront = k.edge + 0.5, zBack = k.edge - cd + 0.5;
  // Body in the cutout, behind the veneer.
  add(m.steel, bx(cw - 0.5, ch, zFront - 2.5 - zBack, x, top - ch, (zBack + zFront - 2.5) / 2));
  // Control panel: a deep brushed band over the counter's edge, knobs on chrome bezels, a plain name plate.
  const ph = 7.5, py = top - 6.5;
  add(m.steel, rbx(W, ph, zFront - k.face, x, py, (zFront + k.face) / 2, 0.3));
  const kx = spread(n + (rot ? 1 : 0), W - 6, x);
  knobs(add, m, kx, py + 3.4, zFront, false);
  add(m.plate, rbx(Math.min(8, W * 0.22), 1.1, 0.2, x, py + ph - 1.6, zFront + 0.05, 0.08));
  // The firebox above the counter: a rim, dark walls inside.
  const fz0 = zBack + 0.5, fz1 = zFront - 2.2, fw = W - 1.5, rimH = 4;
  for (const s of [-1, 1]) add(m.steel, rbx(0.6, rimH, fz1 - fz0, x + s * (fw / 2 - 0.3), top, (fz0 + fz1) / 2, 0.1));
  add(m.steel, rbx(fw, rimH, 0.6, x, top, fz0 + 0.3, 0.1));
  add(m.steel, rbx(fw, rimH - 1, 0.6, x, top, fz1 - 0.3, 0.1));
  add(m.inside, bx(fw - 1.4, 0.1, fz1 - fz0 - 1.2, x, top - 3, (fz0 + fz1) / 2));
  for (const s of [-1, 1]) add(m.inside, bx(0.1, rimH + 3, fz1 - fz0 - 1.2, x + s * (fw / 2 - 0.7), top - 3, (fz0 + fz1) / 2));
  add(m.inside, bx(fw - 1.4, rimH + 3, 0.1, x, top - 3, fz0 + 0.7));
  // Burners, flame tamers and the hex-rod grates.
  const bxs = spread(n, fw - 4, x);
  burnerTubes(k, bxs, top - 1.6, fz0 + 1.2, fz1 - 0.8);
  for (const bxx of bxs) for (const s of [-1, 1]) {
    const g = bx(1.7, 0.06, fz1 - fz0 - 2, bxx + s * 0.62, top + 0.25, (fz0 + fz1) / 2);
    g.translate(-(bxx + s * 0.62) * IN, -(top + 0.25) * IN, 0);
    g.rotateZ(-s * 0.7);
    g.translate((bxx + s * 0.62) * IN, (top + 0.25) * IN, 0);
    add(m.steel, g);
  }
  const sections = W >= 40 ? 4 : 3, gw = (fw - 1.6) / sections;
  for (let si = 0; si < sections; si++) {
    const sx = x - (fw - 1.6) / 2 + gw * (si + 0.5);
    const rods = Math.floor((gw - 0.8) / 0.62);
    for (let i = 0; i <= rods; i++) add(m.steel, cy(0.17, 0.17, fz1 - fz0 - 1.4, sx - (rods * 0.62) / 2 + i * 0.62, top + rimH - 1.0, (fz0 + fz1) / 2, 'z', 6));
    for (const s of [-1, 1]) add(m.steel, bx(gw - 0.3, 0.3, 0.3, sx, top + rimH - 1.35, (fz0 + fz1) / 2 + s * ((fz1 - fz0) / 2 - 1.4)));
  }
  if (rot) {
    // Infrared rear burner on the back wall, motor bracket at the side, the spit across.
    add(m.ceramic, bx(fw * 0.7, 3.2, 0.3, x, top + rimH + 1.4, fz0 + 0.9));
    add(m.steel, bx(fw * 0.7 + 1.2, 4.2, 0.5, x, top + rimH + 0.9, fz0 + 0.6));
    add(m.frame, rbx(3.4, 3.2, 3.6, x - W / 2 - 2.1, top + rimH + 5.3, fz0 + 6, 0.3));
    add(m.steel, bx(1.6, 5.2, 0.3, x - W / 2 - 0.6, top + rimH + 3.4, fz0 + 6));
    add(m.chrome, cy(0.22, 0.22, W + 4, x + 0.5, top + rimH + 6.9, fz0 + 6, 'x', 10));
    for (const s of [-1, 1]) add(m.chrome, cy(1.4, 0.2, 2.2, x + s * (W * 0.25), top + rimH + 6.9, fz0 + 6, 'x', 12));
  }
  // The hood: a double-walled stainless shell, a short front band rising into a curved top, on a hinge at the back.
  const hd = fz1 - fz0 + 0.8, hh = H - ch - rimH, band = 2.6, hy = top + rimH, hz0 = fz0 - 0.4;
  const hood = pivot(k, x, hy, hz0);
  const shape = new THREE.Shape();
  const prof: [number, number][] = [[0, 0], [hd, 0], [hd, band]];
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    prof.push([hd * Math.cos(a) * 0.98 + 0.02 * hd, band + (hh - band) * Math.sin(a)]);
  }
  prof.push([0, hh]);
  shape.moveTo(prof[0][0] * IN, prof[0][1] * IN);
  for (const [s, t] of prof.slice(1)) shape.lineTo(s * IN, t * IN);
  const hw = W - 0.8;
  const hg = new THREE.ExtrudeGeometry(shape, { depth: hw * IN, bevelEnabled: true, bevelThickness: 0.12 * IN, bevelSize: 0.12 * IN, bevelOffset: -0.12 * IN, bevelSegments: 2, curveSegments: 1 });
  // Shape x is depth (toward the front), y is height; extruded along x.
  hg.rotateY(-Math.PI / 2);
  hg.translate((x + hw / 2) * IN, hy * IN, hz0 * IN);
  hg.computeVertexNormals();
  const hn = hg.index ? hg.toNonIndexed() : hg;
  hood.add(m.steel, uvFromPositions(hn));
  hood.add(m.plate, bx(hw - 0.6, 0.05, hd - 0.6, x, hy - 0.08, hz0 + hd / 2));
  const hzF = hz0 + hd;
  barHandle(hood.add, m.steel, 'x', hw * 0.72, x, hy + band + 2.6, hzF - 0.6, 2.2, 0.42);
  // Thermometer on the curve, its face square to it.
  const a = 0.42, nz = (hh - band) * Math.cos(a), ny = hd * Math.sin(a), l = Math.hypot(nz, ny);
  const tzz = hz0 + hd * Math.cos(a) * 0.98 + 0.02 * hd, tyy = hy + band + (hh - band) * Math.sin(a);
  const phi = Math.atan2(nz / l, ny / l);
  for (const [mm, r, t] of [[m.chrome, 1.5, 0.22], [m.knob, 1.15, 0.3]] as const) {
    const g = new THREE.CylinderGeometry(r * IN, r * IN, t * IN, 28).rotateX(phi);
    g.translate(x * IN, tyy * IN, tzz * IN);
    hood.add(mm, g.toNonIndexed());
  }
  return [{ kind: 'hood', label: 'Grill hood', rig: swing(hood.group, 'x', -1.25, false), anchor: k.sink.anchor(hood.group, 0, (band + 3) * IN, (hd + 2) * IN) }];
}

/** UVs in meters from final positions (extruded and lathed shells). */
function uvFromPositions(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [a, b] = ay > 0.6 ? [p.getX(i), p.getZ(i)] : ax > 0.6 ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = a;
    uv[i * 2 + 1] = b;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function griddle(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [W0, D, H] = p.overall, [cw, cd, ch] = p.cutout!;
  // Front and surround at least as wide as the cutout, so no slot of the notch shows beside them.
  const W = Math.max(W0, cw + 0.25);
  const x = k.x, top = k.top, n = p.knobs ?? p.burners ?? 3;
  const zFront = k.edge + 0.5, zBack = zFront - D;
  add(m.steel, bx(Math.min(cw, W0) - 0.6, ch, zFront - 2.5 - (k.edge - cd + 0.5), x, top - ch, (zFront - 2.5 + k.edge - cd + 0.5) / 2));
  // Front: a brushed band with black knobs on chrome bezels.
  const ph = 8, py = top - 6.5;
  add(m.steel, rbx(W, ph, zFront - k.face, x, py, (zFront + k.face) / 2, 0.3));
  knobs(add, m, spread(n, Math.min(W - 8, n * 7.5), x), py + 3.6, zFront, true);
  // The surround: a stainless deck round the cooktop, side and back walls, the rear grease trough.
  const sz0 = zBack + 1, sz1 = zFront - 1.8;
  add(m.steel, rbx(W - 0.4, 1.5, sz1 - sz0, x, top, (sz0 + sz1) / 2, 0.15));
  const pw = W >= 44 ? 35.5 : 27.5, pd = 21.5;
  const pz = (sz0 + sz1) / 2 + 0.8;
  add(m.griddle, rbx(pw, 0.4, pd, x, top + 1.5, pz, 0.08));
  for (const s of [-1, 1]) add(m.steel, rbx(0.35, 1.8, pd + 0.5, x + s * (pw / 2 + 0.2), top + 1.5, pz, 0.08));
  add(m.steel, rbx(pw + 0.8, 1.8, 0.35, x, top + 1.5, pz - pd / 2 - 0.2, 0.08));
  add(m.rubber, bx(pw * 0.9, 0.1, 1.1, x, top + 1.52, pz - pd / 2 - 1.1));
  // The hood: black powder-coated steel on a back hinge, the maker's name as a plain plate on its front.
  // A full-width hood, about 7 in tall, as on the design.
  const hw = W - 1.2, hd = sz1 - sz0 - 0.6, hh = Math.max(H - ch - 1.6, 7), hy = top + 1.6, hz0 = sz0 + 0.3;
  const hood = pivot(k, x, hy, hz0);
  hood.add(m.black, rbx(hw, hh, hd, x, hy, hz0 + hd / 2, 0.9));
  hood.add(m.inside, bx(hw - 1.8, 0.05, hd - 1.8, x, hy - 0.06, hz0 + hd / 2));
  hood.add(m.frame, rbx(hw * 0.5, 0.7, 0.9, x, hy + hh * 0.18, hz0 + hd + 0.25, 0.25));
  const label = p.nameText ? namePlate(p.nameText) : null;
  if (label) hood.add(label, facePlane(11.5, 1.45, x, hy + hh * 0.62, hz0 + hd + 0.01));
  return [{ kind: 'hood', label: 'Griddle hood', rig: swing(hood.group, 'x', -1.3, false), anchor: k.sink.anchor(hood.group, 0, hh * 0.5 * IN, (hd + 1) * IN) }];
}

function sideBurner(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [W, D] = p.overall, [cw, cd, ch] = p.cutout!;
  const x = k.x, top = k.top, n = p.burners ?? 1, power = p.type === 'powerBurner';
  const zFront = k.edge + 0.5, zBack = zFront - D;
  add(m.steel, bx(cw - 0.4, ch, zFront - 2.5 - (k.edge - cd + 0.5), x, top - ch, (zFront - 2.5 + k.edge - cd + 0.5) / 2));
  add(m.steel, rbx(W, 5, zFront - k.face, x, top - 4, (zFront + k.face) / 2, 0.25));
  knobs(add, m, spread(n, W - 4, x), top - 1.6, zFront, false);
  const z0 = zBack + 0.5, z1 = zFront - 1.6;
  add(m.steel, rbx(W, 0.8, z1 - z0, x, top, (z0 + z1) / 2, 0.12));
  add(m.inside, bx(W - 1.5, 0.1, z1 - z0 - 1.5, x, top + 0.82, (z0 + z1) / 2));
  const cxs = spread(n, W - 2, x), cz = (z0 + z1) / 2;
  for (const bxx of cxs) {
    const ring = new THREE.TorusGeometry((power ? 4.4 : 2.4) * IN, (power ? 0.6 : 0.45) * IN, 8, 32).rotateX(Math.PI / 2).translate(bxx * IN, (top + 1.4) * IN, cz * IN);
    add(m.brass, ring.toNonIndexed());
    add(m.castIron, cy(power ? 2.2 : 1.3, power ? 2.5 : 1.5, 0.6, bxx, top + 0.9, cz, 'y', 20));
  }
  // Cast iron grate: a ring of bars over each burner and two rails.
  for (const bxx of cxs) for (let i = 0; i < 4; i++) {
    const g = bx(power ? 15 : 9, power ? 0.7 : 0.5, power ? 0.7 : 0.5, bxx, top + 2.0, cz);
    g.translate(-bxx * IN, 0, -cz * IN).rotateY((i * Math.PI) / 4).translate(bxx * IN, 0, cz * IN);
    add(m.castIron, g);
  }
  for (const s of [-1, 1]) add(m.castIron, bx(W - 1.4, 0.6, 0.6, x, top + 1.5, cz + s * 5));
  const lid = pivot(k, x, top + 0.8, z0);
  const lh = 2.6;
  lid.add(m.steel, rbx(W - 0.2, lh, z1 - z0, x, top + 0.8, (z0 + z1) / 2, 0.35));
  lid.add(m.inside, bx(W - 1, 0.05, z1 - z0 - 0.8, x, top + 0.75, (z0 + z1) / 2));
  return [{ kind: 'lid', label: 'Burner lid', rig: swing(lid.group, 'x', -1.55, false), anchor: k.sink.anchor(lid.group, 0, lh * IN, (z1 - z0) * IN) }];
}

function sink(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [ow, od] = p.overall, [cw, cd, ch] = p.cutout!;
  const x = k.x, top = k.top;
  const bz1 = k.edge - 3.5, bz0 = bz1 - cd, bzc = (bz0 + bz1) / 2;
  // The bowl, seen from inside; a rolled rim just under the counter's cut edge; the strainer.
  const bowl = new THREE.BoxGeometry((cw - 0.3) * IN, ch * IN, (cd - 0.3) * IN).translate(x * IN, (top - 1.25 - ch / 2) * IN, bzc * IN).toNonIndexed();
  add(bowlIn(), bowl);
  add(m.steel, bx(cw + 1.2, 0.08, cd + 1.2, x, top - 1.3, bzc));
  add(m.chrome, cy(1.75, 1.75, 0.12, x, top - 1.25 - ch + 0.02, bzc, 'y', 28));
  add(m.rubber, cy(1.2, 1.2, 0.13, x, top - 1.25 - ch + 0.02, bzc, 'y', 24));
  // Gooseneck faucet behind the bowl, single lever on its side.
  const fz = bz0 - 2.2;
  void ow; void od;
  add(m.chrome, cy(1.25, 1.1, 1.0, x, top, fz, 'y', 24));
  add(m.chrome, tube([[x, top + 0.8, fz], [x, top + 8, fz], [x, top + 12.6, fz + 2.3], [x, top + 12.4, fz + 6.2], [x, top + 9.4, fz + 8.2]], 0.5, 12, 40));
  add(m.chrome, cy(0.62, 0.55, 1.6, x, top + 7.9, fz + 8.3, 'y', 16));
  add(m.chrome, cy(0.5, 0.5, 1.6, x + 1.3, top + 4.5, fz, 'x', 12));
  add(m.chrome, cy(0.25, 0.25, 3.4, x + 2.2, top + 4.6, fz + 1.6, 'z', 10));
  return [];
}

let bowlMat: THREE.MeshStandardMaterial | null = null;
function bowlIn(): THREE.MeshStandardMaterial {
  if (bowlMat) return bowlMat;
  const s = stainless('bowl', '#a3a8ad', 1, 0.5).clone();
  s.side = THREE.BackSide;
  bowlMat = s;
  return s;
}

function pizzaCountertop(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [W, D, H] = p.overall;
  const x = k.x, y = k.top, z = (k.edge + k.back) / 2 + 1;
  const legH = 2.6, bodyH = H - legH;
  for (const [lx, lz] of [[-W / 2 + 3, D / 2 - 3], [W / 2 - 3, D / 2 - 3], [0, -D / 2 + 3]]) add(m.frame, rbx(1.2, legH + 0.5, 1.2, x + lx, y, z + lz, 0.3));
  // The shell: a side profile (low over the mouth, rising in a curve toward the back) drawn across the width, its
  // edges well rounded; the wide, low mouth across the front with the stone floor showing in it.
  const mouthTop = 5.2, r = 1.4;
  const prof: [number, number][] = [[-D / 2, 0], [D / 2, 0], [D / 2, mouthTop]];
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    prof.push([D / 2 - (D * 0.78) * (1 - Math.cos(a)), mouthTop + (bodyH - mouthTop) * Math.sin(a)]);
  }
  prof.push([-D / 2, bodyH - 0.5]);
  const sh = new THREE.Shape(prof.map(([pz, py]) => new THREE.Vector2(pz * IN, py * IN)));
  const body = new THREE.ExtrudeGeometry(sh, { depth: (W - 2 * r) * IN, bevelEnabled: true, bevelThickness: r * IN, bevelSize: r * IN, bevelOffset: -r * IN, bevelSegments: 4, curveSegments: 1 });
  body.rotateY(-Math.PI / 2);
  body.translate((x + (W - 2 * r) / 2) * IN, (y + legH) * IN, z * IN);
  body.computeVertexNormals();
  add(m.black, uvFromPositions(body.index ? body.toNonIndexed() : body));
  const mw = 17.5, mh = 3.4, my = y + legH + 0.9;
  add(m.rubber, rbx(mw, mh, 0.6, x, my, z + D / 2 - 0.15, 0.8));
  add(m.firebrick, bx(mw - 1, 0.25, 3, x, my, z + D / 2 - 1.6));
  add(m.frame, rbx(mw + 1.6, 0.5, 0.5, x, my + mh + 0.2, z + D / 2 + 0.1, 0.2));
  add(m.knob, cy(1.3, 1.1, 1.6, x + W / 2 - 3, y + legH + bodyH * 0.35, z - D / 2 - 0.6, 'z', 20));
  return [];
}

function pizzaDome(k: PartCtx): Mover[] {
  const p = k.part, m = k.mats, add = k.sink.add;
  const [W, D, H] = p.overall;
  const x = k.x, y = k.top, z = (k.edge + k.back) / 2;
  // Hearth slab, the dome, and the entry arch in front of it.
  add(m.dome, bx(W + 2, 2.5, D + 1, x, y, z));
  const dome = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale((W / 2) * IN, (H - 2.5) * IN, (D / 2 - 3) * IN);
  dome.translate(x * IN, (y + 2.5) * IN, (z - 3) * IN);
  add(m.dome, uvFromPositions(dome.toNonIndexed()));
  const ew = 24, eh = 15.5, ed = 7, ez = z + D / 2 - ed / 2 - 0.5;
  add(m.dome, rbx(ew, eh, ed, x, y + 2.5, ez, 0.8));
  // The mouth: an arch of dark, a stainless trim round it, a black door leaning beside.
  const aw = 18, ah = 11;
  const arch = new THREE.Shape();
  arch.moveTo(-aw / 2 * IN, 0);
  arch.lineTo(aw / 2 * IN, 0);
  arch.lineTo(aw / 2 * IN, (ah - aw / 2 * 0.55) * IN);
  arch.absellipse(0, (ah - aw / 2 * 0.55) * IN, aw / 2 * IN, aw / 2 * 0.55 * IN, 0, Math.PI, false, 0);
  arch.lineTo(-aw / 2 * IN, 0);
  const ag = new THREE.ShapeGeometry(arch, 16).translate(x * IN, (y + 2.6) * IN, (ez + ed / 2 + 0.02) * IN);
  add(m.rubber, ag.toNonIndexed());
  const trim: [number, number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    trim.push([x + Math.cos(a) * (aw / 2 + 0.4), y + 2.6 + (ah - aw / 2 * 0.55) + Math.sin(a) * (aw / 2 * 0.55 + 0.4), ez + ed / 2 + 0.25]);
  }
  add(m.steel, tube([[x - aw / 2 - 0.4, y + 2.6, ez + ed / 2 + 0.25], ...trim, [x + aw / 2 + 0.4, y + 2.6, ez + ed / 2 + 0.25]], 0.35, 8, 60));
  add(m.firebrick, bx(aw - 1, 0.3, 4, x, y + 2.5, ez + ed / 2 - 1.8));
  // Flue and cap on the entry.
  add(m.frame, cy(3, 3, 13, x, y + 2.5 + eh, ez - 0.5, 'y', 24));
  const cap = new THREE.ConeGeometry(5 * IN, 3 * IN, 24).translate(x * IN, (y + 2.5 + eh + 15) * IN, (ez - 0.5) * IN);
  add(m.frame, cap.toNonIndexed());
  for (const s of [-1, 1]) add(m.frame, bx(0.3, 2, 0.3, x + s * 2.4, y + 2.5 + eh + 13, ez - 0.5));
  return [];
}

/** A stool, its seat front facing +z, centered at (x, z) on the patio. */
export function stool(add: Add, m: KitchenMats, part: KitchenPart, x: number, z: number) {
  const seatY = part.seatIn ?? part.overall[2] - 10, sw = 17, sd = 16;
  const leg = 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = x + sx * (sw / 2 - 0.8), lz = z + sz * (sd / 2 - 0.8);
    // Legs splay out a little toward the floor.
    const g = bx(leg, seatY - 0.9, leg, 0, 0, 0);
    g.rotateZ(sx * 0.035).rotateX(-sz * 0.035);
    g.translate((lx + sx * 0.3) * IN, 0, (lz + sz * 0.3) * IN);
    add(m.frame, g);
  }
  // Seat frame and teak slats, footrest ring, back posts and slats.
  add(m.frame, bx(sw, 1, sd, x, seatY - 1.9, z));
  for (let i = 0; i < 5; i++) add(m.teak, rbx(sw + 0.4, 0.8, 2.9, x, seatY - 0.9, z - sd / 2 + 1.6 + i * 3.2, 0.2));
  const fy = Math.max(7, seatY - 16);
  for (const s of [-1, 1]) {
    add(m.frame, bx(sw + 0.4, 0.8, 0.8, x, fy, z + s * (sd / 2 - 0.4)));
    add(m.frame, bx(0.8, 0.8, sd + 0.4, x + s * (sw / 2 - 0.4), fy, z));
  }
  for (const s of [-1, 1]) add(m.frame, bx(1, 10, 1, x + s * (sw / 2 - 0.8), seatY - 0.9, z - sd / 2 + 0.6));
  for (const yy of [seatY + 4.2, seatY + 7.4]) add(m.teak, rbx(sw - 0.6, 2.6, 0.8, x, yy, z - sd / 2 + 0.5, 0.2));
}

/** Build a part into its bay. */
export function buildPart(k: PartCtx): Mover[] {
  switch (k.part.type) {
    case 'grill': return grill(k);
    case 'griddle': return griddle(k);
    case 'sideBurner':
    case 'powerBurner': return sideBurner(k);
    case 'sink': return sink(k);
    case 'pizzaCountertop': return pizzaCountertop(k);
    case 'pizzaDome': return pizzaDome(k);
    case 'fridge':
    case 'iceMaker':
    case 'kegerator':
    case 'beverage': return coldUnit(k);
    case 'door':
    case 'propane': return singleDoor(k);
    case 'doubleDoor': return doubleDoor(k);
    case 'drawers': return drawers(k);
    case 'combo': return combo(k);
    case 'trash': return trash(k);
    case 'towel': return towel(k);
    default: return [];
  }
}

/** Front parts that stand on the patio inside their opening (the cold units). */
/** Front parts whose builder makes its own inside (no cavity behind the opening). */
export const ownsInside = (p: KitchenPart) => standsOnFloor(p) || p.type === 'towel';
/** Drop-in parts whose front panel hangs over the counter's edge (their cutout is a notch open at the front). */
export const notched = (p: KitchenPart) => p.type === 'grill' || p.type === 'griddle' || p.type === 'sideBurner';
