import * as THREE from 'three';
import type { Vec2 } from '../siteplan/types';
import { silverTravertineLedgerSet } from '../engine/fountain-surfaces';
import { catalogMaterial, pbrMaterial, plainMaterial } from './materials';
import { sconce } from './cedarwaterwall';
import { agedCopper, boxIn, clearFallMaterial, ledMaterial, linkGlow, sheetGeometry, splashMaterial, streamGeometry, type FountainSink } from './pillarfountain';

/*
 * Two-pillar stucco water wall with a Silver Travertine panel (pondless), drawn from the owner's design drawing for a
 * customer job at the sizes it gives: 13 ft across, two 3 ft 6 in stucco pillars 6 ft tall either side of a 6 ft stone
 * wall, the basin about 2 ft 6 in deep from the wall. Where the drawing gives no size, the parts are Green Lion's usual.
 *
 *   Pillars   CMU, 42 in wide x 24 in deep, Santa Barbara smooth trowel stucco in SW 7029 Agreeable Gray (the owner's
 *             stucco color), under a stucco crown: a band 3/4 in proud and a slab 2 1/2 in proud, 72 in to the top.
 *   Wall      72 in between the pillars, 10 1/2 in thick (8 in block, stone on the front, stucco on the back), its face
 *             7 in behind the pillar fronts. Faced with MSI Silver Travertine Panel 6x24 (LPNLTSIL624, on the supplier
 *             bills) and capped with MSI Arterra Caldera Blanca 13 x 24 x 2 cm coping (LCOPNCALBLA1324), three pieces,
 *             1 1/4 in over each face, its top 64 in up.
 *   Spillway  a Majestic Water Spouts Mosegi in copper, Dark Brown Patina, made 36 in wide (Majestic lists the Mosegi
 *             at 4 and 6 in; larger sizes are its custom order): a 2 in tall box 8 in deep with the back half covered and
 *             an open tray in front whose sides curve down to the floor at the lip. Lip 50 in up, the sheet to the pebbles.
 *   Spouts    two 1 in copper pipes (1 1/4 in outside) with flanges, 29 in either side of center and 33 in up, tipped
 *             down a little, each pouring a rope of water (as on the cedar water wall).
 *   Lights    a Tru-Scapes TSS-AS201 Dual Lamp ("Traditional Up & Down") sconce in Bronze centered on each pillar front,
 *             56 in up, and warm LED pucks in the pebbles where the water lands, lighting the falls from below.
 *   Basin     Belgard Melville Curb in Pearl (a Northern California color), 4 in thick, showing 5 1/2 in, in 24 in units
 *             cut in half to follow an arc from one pillar front to the other, 30 in out from the wall at its middle.
 *             Black Mexican beach pebble 1-2 in inside, kept wet. No open water.
 *
 * Local space: x along the wall, +z out of the front, y up from grade; the footprint (156 x 47 in) is centered.
 */

const IN = 0.0254;
const STUCCO = 'stucco-santa-barbara-sw-agreeable-gray';
const COPING = 'msi-caldera-blanca-coping';
const CURB = 'melville-curb-pearl';
const PEBBLE = 'mexican-beach-pebble-1-2';
const WET_PEBBLE: [number, number, number] = [0.72, 0.6, 0.5];

/** Sizes in inches. */
export const PW = {
  length: 156,
  pillarW: 42,
  pillarD: 24,
  wallW: 72,
  wallD: 10.5,
  /** The stone's face behind the pillar fronts. */
  wallSet: 7,
  stoneT: 1.25,
  copingD: 13,
  copingT: 0.79,
  copingOver: 1.25,
  copingTop: 64,
  pillarBody: 66.5,
  bandTop: 69,
  height: 72,
  bandOut: 0.75,
  slabOut: 2.5,
  /** From the stone's face to the outside of the curb at the middle of the arc. */
  basin: 30,
  curbT: 4,
  curbTop: 5.5,
  curbBottom: -1,
  /** Pieces of curb along the arc (24 in units cut in half). */
  curbPiece: 12,
  pebbleTop: 5,
  spillW: 36,
  spillD: 8,
  spillH: 2,
  /** How far the Mosegi's top cover runs out from its back. */
  cover: 3.75,
  lipY: 50,
  spoutX: 29,
  spoutY: 33,
  sconceY: 56,
};

/** Front to back of the whole feature: the pillars' depth less the wall's setback, plus the basin. */
export const PW_DEPTH = PW.pillarD - PW.wallSet + PW.basin;

/** Back of the pillars, front of the pillars, face of the stone, z in inches. */
const zBack = -PW_DEPTH / 2;
const zP = zBack + PW.pillarD;
const zW = zP - PW.wallSet;

/** The Mosegi's finish: Majestic's Dark Brown Patina, a hand-applied dark brown over the copper. */
const mosegiFinish = () => plainMaterial('pw-mosegi-dark-brown', { color: '#3d2716', roughness: 0.55, metalness: 0.3 });

/**
 * The basin's arc: its inner face runs from one pillar's inner front corner to the other's, through a point PW.curbT in
 * from the outside of the curb at the middle. Circle center (0, zc) in inches, inner and outer radius, and each edge's
 * angle where it meets the pillar fronts.
 */
function basinArc() {
  const half = PW.wallW / 2;
  const s = zW + PW.basin - PW.curbT - zP;
  const rIn = (half * half + s * s) / (2 * s);
  const zc = zP + s - rIn;
  const rOut = rIn + PW.curbT;
  return { zc, rIn, rOut, aIn: Math.asin((zP - zc) / rIn), aOut: Math.asin((zP - zc) / rOut) };
}

/** A prism standing on the ground: a plan outline in inches [x, z], from y0 to y1 inches, its top edges eased. */
function prismIn(outline: Vec2[], y0: number, y1: number, ease = 0): THREE.BufferGeometry {
  // The shape is drawn in (x, -z) and extruded up its normal; turning it -90 degrees about x stands it on the ground.
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * IN, -z * IN)));
  const h = (y1 - y0) * IN, e = ease * IN;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - 2 * e),
    bevelEnabled: e > 0,
    bevelThickness: e,
    bevelSize: e,
    bevelOffset: -e,
    bevelSegments: 2,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 * IN + e, 0);
  return g.index ? g.toNonIndexed() : g;
}

/** A side of the Mosegi: full height under the cover, then curving down to the floor at the lip; `t` thick along x. */
function mosegiSide(x: number, t: number): THREE.BufferGeometry {
  const D = PW.spillD * IN, H = PW.spillH * IN, c = PW.cover * IN, r = D - c;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(D, 0);
  // A quarter ellipse from the floor at the lip up to the top at the cover's edge.
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * (Math.PI / 2);
    shape.lineTo(c + r * Math.cos(a), H * Math.sin(a));
  }
  shape.lineTo(0, H);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t * IN, bevelEnabled: false });
  // Shape x runs out from the wall (z), shape y up; the extrusion runs along -x after the turn.
  g.rotateY(-Math.PI / 2);
  g.translate(x * IN, (PW.lipY - 0.125) * IN, zW * IN);
  return g.index ? g.toNonIndexed() : g;
}

/** A thin sheet of water running along the Mosegi's open tray to its lip (the falling-water shader, laid flat). */
function trayWater(w: number, z0: number, z1: number, y: number): THREE.BufferGeometry {
  const nx = 8, nz = 4, pos: number[] = [], uv: number[] = [], edge: number[] = [], end: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const s = i / nx - 0.5, z = z0 + ((z1 - z0) * j) / nz;
    pos.push(s * w * IN, y * IN, z * IN);
    uv.push(s * w * IN, (z - z0) * IN);
    edge.push(Math.abs(s) * 2);
    end.push(0);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The water wall, built into `sink` in local space (front +z). */
export function pillarWaterWall(sink: FountainSink) {
  const stucco = catalogMaterial(STUCCO);
  const stone = pbrMaterial('ww-ledger-silver', silverTravertineLedgerSet());
  const coping = catalogMaterial(COPING);
  const curb = catalogMaterial(CURB);
  const copper = agedCopper();
  const mouth = plainMaterial('pf-spill-mouth', { color: '#0c0b0a', roughness: 0.9 });
  const half = PW.wallW / 2;

  // Pillars: the stucco body, then the crown's band and slab, each a little wider all round; a soft round on the edges.
  for (const sx of [-1, 1]) {
    const x = sx * (half + PW.pillarW / 2), zc = zP - PW.pillarD / 2, k = sx > 0 ? 1 : 0;
    sink.add(stucco, boxIn(PW.pillarW, PW.pillarBody + 2, PW.pillarD, x, -2, zc, 0.41 * k + 0.2, 0.67 * k, 0.375));
    const band = 2 * PW.bandOut, slab = 2 * PW.slabOut;
    sink.add(stucco, boxIn(PW.pillarW + band, PW.bandTop - PW.pillarBody, PW.pillarD + band, x, PW.pillarBody, zc, 0.13 + k, 0.29, 0.3));
    sink.add(stucco, boxIn(PW.pillarW + slab, PW.height - PW.bandTop, PW.pillarD + slab, x, PW.bandTop, zc, 0.57 + k, 0.83, 0.4));
  }

  // The wall between them: the stone on the front, from below the pebbles to the coping, on a stucco-backed block wall.
  const wallTop = PW.copingTop - PW.copingT;
  const coreD = PW.wallD - PW.stoneT;
  sink.add(stucco, boxIn(PW.wallW, wallTop + 2, coreD, 0, -2, zW - PW.stoneT - coreD / 2, 0.35, 0.12));
  sink.add(stone, boxIn(PW.wallW - 0.1, wallTop + 1, PW.stoneT, 0, -1, zW - PW.stoneT / 2, 0.18, 0.04));
  // Coping: three 24 in pieces with 1/8 in joints, the bullnose 1 1/4 in over the stone, as much over the back.
  const piece = PW.wallW / 3;
  for (let k = 0; k < 3; k++) {
    const x = -half + piece * (k + 0.5);
    sink.add(coping, boxIn(piece - 0.125, PW.copingT, PW.copingD, x, wallTop, zW + PW.copingOver - PW.copingD / 2, 0.61 * k, 0.2, 0.2));
  }

  // Wet stone low on the wall where the splash keeps it dark.
  const wetStone = plainMaterial('ww-wet-stone', { color: '#2f2a24', roughness: 0.35, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  sink.add(wetStone, new THREE.PlaneGeometry(PW.wallW * 0.9 * IN, 8 * IN).translate(0, (PW.pebbleTop + 4) * IN, (zW + 0.04) * IN).toNonIndexed());

  const splash = splashMaterial();
  sink.fall(splash);
  const puck = (x: number, z: number, water: THREE.ShaderMaterial | null) => {
    // A small warm LED in the pebbles where the water lands; it lights the fall from below.
    const led = ledMaterial();
    sink.own(led);
    sink.glow(led);
    if (water) linkGlow(led, water);
    sink.add(led, new THREE.CircleGeometry(1.1 * IN, 18).rotateX(-Math.PI / 2).translate(x * IN, (PW.pebbleTop + 0.35) * IN, z * IN).toNonIndexed());
    sink.light(x * IN, (PW.pebbleTop + 4) * IN, (z + 1) * IN, '#ffbf73', 1.1, 1.6);
  };

  // The Mosegi spillway, 36 in: floor, back, the cover over its back half, the two curved sides, and the dark mouth
  // under the cover where the water comes out of the baffle.
  {
    const fin = mosegiFinish();
    const W = PW.spillW, D = PW.spillD, H = PW.spillH, t = 0.125, y0 = PW.lipY - t;
    sink.add(fin, boxIn(W, t, D, 0, y0, zW + D / 2));
    sink.add(fin, boxIn(W, H, t, 0, y0, zW + t / 2));
    sink.add(fin, boxIn(W, t, PW.cover, 0, y0 + H - t, zW + PW.cover / 2));
    sink.add(fin, mosegiSide(-W / 2 + t, t));
    sink.add(fin, mosegiSide(W / 2, t));
    sink.add(mouth, boxIn(W - 2 * t, H - 2 * t, 0.1, 0, PW.lipY, zW + PW.cover - 0.15));
    const water = clearFallMaterial();
    sink.fall(water);
    const tray = new THREE.Mesh(trayWater(W - 2 * t - 0.1, zW + PW.cover - 0.1, zW + D, PW.lipY + 0.3), water);
    tray.renderOrder = 3;
    sink.object(tray);
    const lip = new THREE.Vector3(0, (PW.lipY + 0.3) * IN, (zW + D + 0.1) * IN);
    const sheet = new THREE.Mesh(sheetGeometry(lip, (PW.pebbleTop + 0.4) * IN, (W - 0.6) * IN, (W - 3) * IN, 0.5), water);
    sheet.renderOrder = 3;
    sink.object(sheet);
    sheet.geometry.computeBoundingBox();
    const land = sheet.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry((W - 4) * IN, 5 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(0, (PW.pebbleTop + 0.6) * IN, land.max.z - 0.5 * IN);
    foam.renderOrder = 3;
    sink.object(foam);
    for (const x of [-10, 10]) puck(x, land.max.z / IN + 1.5, water);
  }

  // Side spouts: 1 in copper pipe with a flange on the stone, tipped 5 degrees down, each pouring a rope of water.
  for (const sx of [-1, 1]) {
    const x = sx * PW.spoutX, y = PW.spoutY;
    const tilt = (5 * Math.PI) / 180, len = 5.5;
    const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    const pipe = new THREE.CylinderGeometry(0.625 * IN, 0.625 * IN, len * IN, 14, 1, true);
    pipe.rotateX(Math.PI / 2 + tilt);
    const base = new THREE.Vector3(x, y, zW).multiplyScalar(IN);
    const mid = base.clone().addScaledVector(dir, (len / 2) * IN);
    pipe.translate(mid.x, mid.y, mid.z);
    sink.add(copper, pipe.toNonIndexed());
    const flange = new THREE.CylinderGeometry(1.6 * IN, 1.6 * IN, 0.35 * IN, 24).rotateX(Math.PI / 2).translate(base.x, base.y, base.z + 0.17 * IN);
    sink.add(copper, flange.toNonIndexed());
    const end = base.clone().addScaledVector(dir, len * IN);
    const bore = new THREE.CircleGeometry(0.5 * IN, 12);
    bore.lookAt(dir);
    bore.translate(end.x, end.y, end.z);
    sink.add(mouth, bore.toNonIndexed());
    const water = clearFallMaterial();
    sink.fall(water);
    const stream = new THREE.Mesh(streamGeometry(end.clone().addScaledVector(dir, -0.002), dir, 0.42, (PW.pebbleTop + 0.3) * IN, 0.42 * IN), water);
    stream.renderOrder = 3;
    sink.object(stream);
    stream.geometry.computeBoundingBox();
    const bb = stream.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(4 * IN, 4 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(x * IN, (PW.pebbleTop + 0.6) * IN, bb.max.z);
    foam.renderOrder = 3;
    sink.object(foam);
    puck(x, bb.max.z / IN + 0.5, water);
  }

  // Sconces centered on the pillar fronts.
  for (const sx of [-1, 1]) sconce(sink, sx * (half + PW.pillarW / 2), PW.sconceY, zP);

  // The basin's curb: half units along the arc, each a straight piece between joints 1/8 in wide, its ends butting the
  // pillar fronts.
  const A = basinArc();
  const pt = (r: number, a: number): Vec2 => [r * Math.cos(a), A.zc + r * Math.sin(a)];
  const mid = (A.rIn + A.rOut) / 2;
  const n = Math.max(4, Math.round((mid * (Math.PI - 2 * (A.aIn + A.aOut) / 2)) / PW.curbPiece));
  const angle = (a0: number, k: number) => a0 + ((Math.PI - 2 * a0) * k) / n;
  const gap = 0.0625;
  for (let k = 0; k < n; k++) {
    let p0 = pt(A.rIn, angle(A.aIn, k)), p1 = pt(A.rIn, angle(A.aIn, k + 1));
    let q1 = pt(A.rOut, angle(A.aOut, k + 1)), q0 = pt(A.rOut, angle(A.aOut, k));
    // Pull each end in by half a joint (not at the pillars).
    const pull = (a: Vec2, b: Vec2, d: number): Vec2 => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [a[0] + ((b[0] - a[0]) / l) * d, a[1] + ((b[1] - a[1]) / l) * d];
    };
    if (k > 0) [p0, q0] = [pull(p0, p1, gap), pull(q0, q1, gap)];
    if (k < n - 1) [p1, q1] = [pull(p1, p0, gap), pull(q1, q0, gap)];
    sink.add(curb, prismIn([p0, p1, q1, q0], PW.curbBottom, PW.curbTop, 0.2));
  }

  // Inside the basin: the floor under the stones and the pebbles, from the stone out to the curb.
  const inner = (inset: number): Vec2[] => {
    const out: Vec2[] = [[-half + inset, zW + inset], [half - inset, zW + inset]];
    const a0 = Math.asin((zP - A.zc) / (A.rIn - inset));
    for (let k = 0; k <= 24; k++) out.push(pt(A.rIn - inset, a0 + ((Math.PI - 2 * a0) * k) / 24));
    return out.map(([x, z]): Vec2 => [Math.max(-half + inset, Math.min(half - inset, x)), z]);
  };
  sink.add(plainMaterial('ww-basin-floor', { color: '#141311', roughness: 1 }), prismIn(inner(0.05), -1, PW.pebbleTop - 0.5));
  sink.pebbles(PEBBLE, inner(0.4), [], PW.pebbleTop, WET_PEBBLE);
}
