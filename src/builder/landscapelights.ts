import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FeatureSpec } from '../siteplan/catalog';
import type { FeaturePlacement, SitePlan, Vec2, Zone } from '../siteplan/types';
import { pointInPolygon } from '../siteplan/geometry';
import { FIXTURE_FINISHES, fixtureSetting, type FinishId, type FixtureSpec } from '../siteplan/truscapes';
import { kelvinColor, type LandLight } from '../engine/landlights';
import { boxUV } from './materials';
import { zoneTop } from './hardscape';
import { linePath } from './linepath';

/**
 * Landscape lighting fixtures (TruScapes, siteplan/truscapes.ts), drawn to the maker's published sizes and product
 * photos. Each is built in local space at its mount point (grade for stake and in-grade fixtures, the given height
 * for wall, cap, riser and post fixtures), front facing +z, in inches, then scaled to meters. Aimed heads tilt from
 * straight up toward +z by the placement's tilt; the yaw comes from the placement's rotation.
 *
 * Every fixture returns its beams (engine/landlights.ts) from its lens, and a lens material that glows at night in
 * the fixture's color temperature.
 */

const IN = 0.0254;
type Part = [THREE.Material, THREE.BufferGeometry];

export class FixtureMaterials {
  /** Lenses and lit glass: glow at night (the studio sets their emissive intensity). */
  glow: THREE.MeshStandardMaterial[] = [];
  private finishes = new Map<string, THREE.MeshStandardMaterial>();
  private lenses = new Map<string, THREE.MeshStandardMaterial>();
  private owned: THREE.Material[] = [];

  finish(id: FinishId): THREE.MeshStandardMaterial {
    let m = this.finishes.get(id);
    if (!m) {
      const f = FIXTURE_FINISHES[id] ?? FIXTURE_FINISHES.black;
      m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness });
      m.name = `fixture-${id}`;
      this.finishes.set(id, m);
      this.owned.push(m);
    }
    return m;
  }

  /** A lens or glass that glows: `strength` scales its night glow (1 = a bare LED lens seen head on). */
  lens(kelvin: number, strength = 1, frosted = false, deep = false): THREE.MeshStandardMaterial {
    const key = `${kelvin}|${strength}|${frosted}|${deep}`;
    let m = this.lenses.get(key);
    if (!m) {
      // By day a lens reads as glass over a bright reflector, frosted acrylic as milky gray-white, and the glass of a
      // well light over its deep can as dark. The studio lights a lens at night at 7x its emissive color when the
      // material is light colored and 2.4x when dark, so a dark lens gets a stronger emissive to match.
      const color = deep ? '#3a3c3d' : frosted ? '#cbc8c0' : '#b9bdbf';
      m = new THREE.MeshStandardMaterial({ color, roughness: frosted ? 0.55 : 0.1, metalness: frosted ? 0 : 0.35 });
      if (deep) strength *= 7 / 2.4;
      m.emissive = kelvinColor(kelvin).multiplyScalar(strength);
      m.emissiveIntensity = 0;
      m.name = 'fixture-lens';
      this.lenses.set(key, m);
      this.glow.push(m);
      this.owned.push(m);
    }
    return m;
  }

  /** A dark surface next to the LED (hat underside, shroud inside) that picks up a faint glow at night. */
  spill(kelvin: number, base: string, strength = 0.06): THREE.MeshStandardMaterial {
    const key = `spill|${kelvin}|${base}|${strength}`;
    let m = this.lenses.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0.2 });
      m.emissive = kelvinColor(kelvin).multiplyScalar(strength);
      m.emissiveIntensity = 0;
      this.lenses.set(key, m);
      this.glow.push(m);
      this.owned.push(m);
    }
    return m;
  }

  plain(key: string, color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
    let m = this.finishes.get(`plain:${key}`);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.finishes.set(`plain:${key}`, m);
      this.owned.push(m);
    }
    return m;
  }

  dispose() {
    for (const m of this.owned) m.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (inches)                                            */

/** A turned part from a profile of [radius, height] points, bottom to top. Repeat a point for a hard edge. */
function lathe(profile: [number, number][], seg = 28): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  return g;
}

function cyl(r: number, h: number, y = 0, seg = 24, rTop = r): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, r, h, seg).translate(0, y + h / 2, 0);
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, round = 0): THREE.BufferGeometry {
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)) : new THREE.BoxGeometry(w, h, d);
  boxUV(g);
  return g.translate(x, y + h / 2, z);
}

/** A disc facing +y at height y. */
function disc(r: number, y: number, seg = 24): THREE.BufferGeometry {
  return new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** A disc facing -y at height y. */
function discDown(r: number, y: number, seg = 24): THREE.BufferGeometry {
  return new THREE.CircleGeometry(r, seg).rotateX(Math.PI / 2).translate(0, y, 0);
}

/**
 * A round glare shroud: a thin tube along +y from y0 whose front edge is cut on a slant, long on the -z side (the
 * top of an aimed head) and short on the +z side, with its inside and rim.
 */
function slantShroud(r: number, wall: number, y0: number, longLen: number, shortLen: number, seg = 32): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const len = (a: number) => {
    // a = 0 at +z (short side), PI at -z (long side): a smooth slant.
    const t = (1 - Math.cos(a)) / 2;
    return shortLen + (longLen - shortLen) * t;
  };
  const ring = (rad: number, a: number, y: number) => new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3) => {
    for (const [p, n] of [[a, na], [b, nb], [c, nb], [a, na], [c, nb], [d, na]] as [THREE.Vector3, THREE.Vector3][]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(0, 0);
    }
  };
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const n0 = new THREE.Vector3(Math.sin(a0), 0, Math.cos(a0)), n1 = new THREE.Vector3(Math.sin(a1), 0, Math.cos(a1));
    // Outside.
    quad(ring(r, a0, y0), ring(r, a1, y0), ring(r, a1, y0 + len(a1)), ring(r, a0, y0 + len(a0)), n0, n1);
    // Inside (facing in).
    const ri = r - wall;
    quad(ring(ri, a1, y0), ring(ri, a0, y0), ring(ri, a0, y0 + len(a0)), ring(ri, a1, y0 + len(a1)), n1.clone().negate(), n0.clone().negate());
    // Rim.
    const up = new THREE.Vector3(0, 1, 0);
    quad(ring(ri, a0, y0 + len(a0)), ring(r, a0, y0 + len(a0)), ring(r, a1, y0 + len(a1)), ring(ri, a1, y0 + len(a1)), up, up);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A quarter-torus elbow joining a vertical tube (top end at y) to a horizontal one along +z. */
function elbow(r: number, bend: number, y: number, seg = 20): THREE.BufferGeometry {
  // TorusGeometry lies in the XY plane around +z; turn it so the arc runs from straight up to forward (+z).
  const g = new THREE.TorusGeometry(bend, r, 14, seg, Math.PI / 2);
  g.rotateY(Math.PI / 2);
  g.translate(0, y, bend);
  return g;
}

/* ------------------------------------------------------------------ */
/* Fixture builders                                                     */

interface Ctx {
  spec: FixtureSpec;
  finish: THREE.MeshStandardMaterial;
  m: FixtureMaterials;
  kelvin: number;
  beamDeg: number;
  tilt: number; // radians from straight up toward +z
  parts: Part[];
  lights: LandLight[];
}

const UP = new THREE.Vector3(0, 1, 0);

function light(c: Ctx, at: THREE.Vector3, dir: THREE.Vector3, beamDeg: number, cutoffDeg: number, lumens: number, range: number) {
  c.lights.push({ position: at.multiplyScalar(IN), direction: dir.normalize(), beamDeg, cutoffDeg, lumens, kelvin: c.kelvin, range });
}

/** The heavy-duty ground stake's top: a flange at grade with a short threaded riser (the rest is buried). */
function stakeTop(c: Ctx, riser: number): number {
  const stake = c.m.plain('stake', '#161616', 0.75);
  c.parts.push([stake, lathe([[0, -0.05], [1.35, -0.05], [1.35, 0.18], [1.1, 0.32], [0.45, 0.42], [0, 0.42]], 24)]);
  c.parts.push([c.finish, cyl(0.28, riser, 0.4, 12)]);
  return 0.4 + riser;
}

/** An aimed head on a knuckle: built along +y around the pivot, tilted toward +z, placed at `pivot`. */
function aimHead(c: Ctx, pivot: THREE.Vector3, head: Part[], lens: THREE.Vector3, beamDeg: number, cutoffDeg: number, range: number) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.tilt);
  const m = new THREE.Matrix4().compose(pivot, q, new THREE.Vector3(1, 1, 1));
  for (const [mat, g] of head) c.parts.push([mat, g.applyMatrix4(m)]);
  // Knuckle: a short cross barrel at the pivot.
  c.parts.push([c.finish, new THREE.CylinderGeometry(0.42, 0.42, 0.9, 14).rotateZ(Math.PI / 2).translate(pivot.x, pivot.y, pivot.z)]);
  const dir = UP.clone().applyQuaternion(q);
  light(c, lens.clone().applyMatrix4(m), dir, beamDeg, cutoffDeg, c.spec.lumens, range);
}

/**
 * Bullet accent light (TS-B102): a die-cast round body with a slant-cut glare shroud on a knuckle and stake.
 * dims: bodyD, bodyL (rear cap to lens), shroudLong, shroudShort, riser.
 */
function bullet(c: Ctx) {
  const d = c.spec.dims;
  const R = d.bodyD / 2;
  const top = stakeTop(c, d.riser ?? 1.1);
  const head: Part[] = [];
  // Body: rounded rear cap, straight barrel, a thin bead where the shroud twists on.
  // The rear tapers to `taper` of the body's radius (a bullet), with a domed cap.
  const rr = R * (d.taper ?? 0.8);
  head.push([c.finish, lathe([[0, 0], [rr * 0.6, 0.04], [rr * 0.92, 0.22], [rr, 0.45], [R, d.bodyL * 0.55], [R, d.bodyL - 0.2], [R + 0.05, d.bodyL - 0.2], [R + 0.05, d.bodyL], [0, d.bodyL]], 28)]);
  if (d.fins) {
    // Heat-sink fins round the rear half (TS-A100C).
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const fin = new THREE.BoxGeometry(0.1, d.bodyL * 0.42, 0.28).translate(0, d.bodyL * 0.3, 0);
      fin.translate(0, 0, R * 0.92).rotateY(a);
      head.push([c.finish, fin]);
    }
  }
  head.push([c.finish, slantShroud(R + 0.03, 0.07, d.bodyL, d.shroudLong, d.shroudShort, 32)]);
  // Lens over the lamp, set just inside the shroud.
  head.push([c.m.lens(c.kelvin, 1.3), disc(R - 0.12, d.bodyL + 0.02)]);
  // Pivot on the body's underside (+z before tilt), a quarter of the way up.
  const off = new THREE.Vector3(0, -d.bodyL * 0.25, -(R + 0.35));
  for (const [, g] of head) g.translate(off.x, off.y, off.z);
  // The beam starts at the mouth of the shroud, so it never lights the fixture's own cowl.
  const lens = new THREE.Vector3(0, d.bodyL + d.shroudLong + 0.2, 0).add(off);
  aimHead(c, new THREE.Vector3(0, top + 0.35, 0), head, lens, c.beamDeg, Math.min(170, c.beamDeg * 2.4), d.range ?? 10);
}

/**
 * Flood head (TS-B106 high power accent): a short wide can with a slant shroud. Wash head (TS-B105): a wide can
 * with a hood over the top half of a large frosted lens. dims: headD, headL, hoodLong, hoodShort, riser.
 */
function floodHead(c: Ctx, wash: boolean) {
  const d = c.spec.dims;
  const R = d.headD / 2;
  const top = stakeTop(c, d.riser ?? 1.6);
  // Threaded riser up to the knuckle.
  const head: Part[] = [];
  head.push([c.finish, lathe([[0, 0], [R * 0.7, 0.04], [R * 0.95, 0.3], [R, 0.7], [R, d.headL], [0, d.headL]], 32)]);
  if (wash) {
    // A half hood over the -z (upper) side of the lens, deeper at the top.
    head.push([c.finish, slantShroud(R + 0.04, 0.08, d.headL, d.hoodLong, d.hoodShort, 32)]);
    head.push([c.m.lens(c.kelvin, 0.9, true), disc(R - 0.2, d.headL + 0.02, 32)]);
  } else {
    head.push([c.finish, slantShroud(R + 0.04, 0.08, d.headL, d.hoodLong, d.hoodShort, 32)]);
    head.push([c.m.lens(c.kelvin, 1.4), disc(R - 0.25, d.headL + 0.02, 32)]);
  }
  // The wash head's face is an oval, as tall (head-local z, up and down once aimed) as `faceH`.
  const off = new THREE.Vector3(0, -d.headL * 0.35, -((d.faceH ?? d.headD) / 2 + 0.3));
  if (d.faceH) for (const [, g] of head) g.scale(1, 1, d.faceH / d.headD);
  for (const [, g] of head) g.translate(off.x, off.y, off.z);
  const lens = new THREE.Vector3(0, d.headL + d.hoodLong + 0.2, 0).add(off);
  const cutoff = wash ? 170 : Math.min(160, c.beamDeg * 2.2);
  aimHead(c, new THREE.Vector3(0, top + 0.45, 0), head, lens, c.beamDeg, cutoff, d.range ?? (wash ? 7 : 12));
}

/**
 * Path light with a flat hat (TS-B301 Traditional): stem, a flared lamp cup with clear glass, a shallow cone hat
 * (dims.hatD across) and an enclosed top collar. Light goes out all round under the hat.
 * dims: height (overall above grade), stemD, hatD, hatH, collarD, collarH, cupD, cupH.
 */
function pathHat(c: Ctx) {
  const d = c.spec.dims;
  const H = d.height;
  const hatTop = H - d.collarH;
  const hatRim = hatTop - d.hatH;
  const cupTop = hatRim + 0.15;
  const cupBot = cupTop - d.cupH;
  c.parts.push([c.finish, cyl(d.stemD / 2, cupBot + 0.05, 0, 14)]);
  // Base fitting at grade.
  c.parts.push([c.finish, cyl(d.stemD / 2 + 0.18, 0.6, 0, 14, d.stemD / 2 + 0.08)]);
  // Lamp cup: a flared collar holding the glass.
  c.parts.push([c.finish, lathe([[d.stemD / 2, cupBot], [d.cupD / 2 * 0.62, cupBot + d.cupH * 0.35], [d.cupD / 2, cupBot + d.cupH * 0.5], [d.cupD / 2, cupBot + d.cupH * 0.55], [d.cupD / 2 * 0.8, cupBot + d.cupH * 0.55]], 24)]);
  // Glass enclosure round the G4 lamp (warm when lit), up into the hat.
  c.parts.push([c.m.lens(c.kelvin, 0.75, true), cyl(d.cupD / 2 * 0.72, cupTop - (cupBot + d.cupH * 0.55) + 0.25, cupBot + d.cupH * 0.55, 20)]);
  // Hat: a shallow cone with a rolled rim, its underside catching the lamp's glow.
  const R = d.hatD / 2, rc = d.collarD / 2;
  c.parts.push([c.finish, lathe([[R, hatRim - 0.06], [R + 0.02, hatRim], [rc, hatTop], [rc, hatTop + 0.001]], 40)]);
  c.parts.push([c.m.spill(c.kelvin, '#2a2622', 0.09), lathe([[rc * 0.98, hatTop - 0.12], [R - 0.04, hatRim - 0.06]], 40)]);
  // Enclosed top collar.
  c.parts.push([c.finish, lathe([[rc, hatTop - 0.05], [rc, H - 0.08], [rc - 0.08, H], [0, H]], 32)]);
  const at = new THREE.Vector3(0, cupBot + d.cupH * 0.85, 0);
  light(c, at, new THREE.Vector3(0, -1, 0), d.spread ?? 150, d.cutoff ?? 176, c.spec.lumens, d.range ?? 4.5);
}

/**
 * Classic path light (TS-B302): stem, a tapered lamp body with frosted glass, a wide cone hat with a dome finial.
 * dims: height, stemD, hatD, hatH, bodyTopD, bodyBotD, bodyH, finialD.
 */
function pathClassic(c: Ctx) {
  const d = c.spec.dims;
  const H = d.height;
  const fin = d.finialD;
  const hatTop = H - (d.finialH ?? fin / 2);
  const hatRim = hatTop - d.hatH;
  const bodyTop = hatRim + d.hatH * 0.45;
  const bodyBot = bodyTop - d.bodyH;
  c.parts.push([c.finish, cyl(d.stemD / 2, bodyBot + 0.1, 0, 14)]);
  c.parts.push([c.finish, cyl(d.stemD / 2 + 0.18, 0.6, 0, 14, d.stemD / 2 + 0.08)]);
  // Tapered body: metal cage at top and bottom, frosted glass between (it glows when lit).
  const rb = d.bodyBotD / 2, rt = d.bodyTopD / 2;
  c.parts.push([c.finish, lathe([[d.stemD / 2, bodyBot], [rb, bodyBot + 0.25], [rb + 0.02, bodyBot + 0.55]], 24)]);
  c.parts.push([c.m.lens(c.kelvin, 0.7, true), lathe([[rb - 0.02, bodyBot + 0.5], [rt - 0.05, bodyTop - 0.35]], 24)]);
  c.parts.push([c.finish, lathe([[rt - 0.1, bodyTop - 0.4], [rt, bodyTop - 0.3], [rt, bodyTop], [rt * 0.6, bodyTop + 0.05]], 24)]);
  const R = d.hatD / 2;
  c.parts.push([c.finish, lathe([[R, hatRim - 0.06], [R + 0.02, hatRim], [fin * 0.55, hatTop], [0.01, hatTop + 0.02]], 40)]);
  c.parts.push([c.m.spill(c.kelvin, '#2a2622', 0.08), lathe([[0.05, hatTop - 0.1], [R - 0.04, hatRim - 0.06]], 40)]);
  // Dome finial.
  const fr = fin / 2, fh = d.finialH ?? fr;
  c.parts.push([c.finish, lathe([[fr * 0.95, hatTop - 0.05], [fr, hatTop + fh * 0.3], [fr * 0.72, hatTop + fh * 0.8], [0, hatTop + fh]], 20)]);
  const at = new THREE.Vector3(0, (bodyBot + bodyTop) / 2, 0);
  light(c, at, new THREE.Vector3(0, -1, 0), d.spread ?? 150, d.cutoff ?? 172, c.spec.lumens, d.range ?? 4.5);
}

/**
 * Modern path lights: a tube rising from grade that turns 90 degrees into a short arm with the LED under its end.
 * TS-B306 is round tube with a bent elbow, TS-B308 square tube with a mitered corner.
 * dims: height (to the top of the arm), tube (diameter or side), arm (reach from the stem's center), lensD.
 */
function pathModern(c: Ctx, square: boolean) {
  const d = c.spec.dims;
  const t = d.tube, H = d.height, arm = d.arm;
  if (square) {
    c.parts.push([c.finish, box(t, H, t, 0, 0, 0, 0.04)]);
    c.parts.push([c.finish, box(t, t, arm, 0, H - t, arm / 2 - t / 2 + 0.001, 0.04)]);
    // Fixed base plate at grade.
    c.parts.push([c.finish, box(t + 0.5, 0.35, t + 0.5, 0, 0, 0, 0.05)]);
  } else {
    const bend = t * 1.1;
    c.parts.push([c.finish, cyl(t / 2, H - t / 2 - bend, 0, 16)]);
    c.parts.push([c.finish, elbow(t / 2, bend, H - t / 2 - bend, 16)]);
    c.parts.push([c.finish, new THREE.CylinderGeometry(t / 2, t / 2, arm - bend, 16).rotateX(Math.PI / 2).translate(0, H - t / 2, bend + (arm - bend) / 2)]);
    c.parts.push([c.finish, disc(t / 2, 0).rotateX(Math.PI / 2).translate(0, H - t / 2, arm)]);
    c.parts.push([c.finish, cyl(t / 2 + 0.2, 0.5, 0, 16, t / 2 + 0.06)]);
  }
  // The LED under the end of the arm: a short barrel with its lens facing down.
  const lz = arm - t * 0.6;
  const ly = H - t;
  if (square) {
    // A frosted panel in the underside of the block arm.
    c.parts.push([c.m.lens(c.kelvin, 0.9, true), box(t * 0.7, 0.04, d.lensD * 2.2, 0, ly - 0.03, lz - d.lensD * 0.4)]);
  } else {
    c.parts.push([c.finish, cyl(d.lensD / 2 + 0.06, 0.28, ly - 0.28, 16).translate(0, 0, lz)]);
    c.parts.push([c.m.lens(c.kelvin, 1.2), discDown(d.lensD / 2, ly - 0.29).translate(0, 0, lz)]);
  }
  const spread = d.spread ?? 130;
  light(c, new THREE.Vector3(0, ly - 0.35, lz), new THREE.Vector3(0, -1, 0), spread, d.cutoff ?? Math.min(172, spread * 1.35), c.spec.lumens, d.range ?? 4.5);
}

/**
 * In-grade well light: a buried can with only its flange ring and lens at grade. TS-B201 has a flat lens with the
 * lamp aimed inside; TS-B203 adds a slant "eyelid" shroud above the lens.
 * dims: flangeD, lensD, eyelid (height of the eyelid's long side, 0 for none), eyelidShort.
 */
function well(c: Ctx) {
  const d = c.spec.dims;
  const R = d.flangeD / 2;
  c.parts.push([c.finish, lathe([[R, 0.02], [R, 0.12], [R - 0.15, 0.22], [d.lensD / 2 + 0.05, 0.2], [d.lensD / 2, 0.05]], 36)]);
  // Clear glass over the lamp and its dark reflector.
  c.parts.push([c.m.lens(c.kelvin, d.eyelid ? 0.4 : 0.3, false, true), disc(d.lensD / 2, 0.06, 32)]);
  if (d.eyelid) c.parts.push([c.finish, slantShroud(d.lensD / 2 + 0.12, 0.08, 0.15, d.eyelid, d.eyelidShort ?? 0.3, 32)]);
  // The lamp inside tilts with the aim (up to about 15-20 degrees inside the can).
  const dir = UP.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), c.tilt);
  light(c, new THREE.Vector3(0, (d.eyelid ?? 0) + 0.4, 0), dir, c.beamDeg, Math.min(150, c.beamDeg * 2.2), c.spec.lumens, d.range ?? 10);
}

/**
 * Hardscape (cap) light: a thin mounting plate slid under a wall cap, and a slim head that hangs down in front of
 * the wall face with the LED along its underside, washing down the face. Mounted at the cap joint (mount height).
 * dims: length, plateD (depth under the cap), plateT, headH, headD.
 */
function hardscape(c: Ctx) {
  const d = c.spec.dims;
  const L = d.length;
  // The wall face is at z = 0, the underside of the cap at y = 0. The plate slides into the joint under the cap and
  // reaches just past the face; the head hangs under its front edge, inside the cap's overhang.
  const z0 = 0.1, zf = z0 + d.headD;
  c.parts.push([c.finish, box(L * 0.92, d.plateT, d.plateD, 0, -d.plateT, zf - d.plateD / 2)]);
  c.parts.push([c.finish, box(L, d.headH, d.headD, 0, -d.headH - d.plateT + 0.02, z0 + d.headD / 2, 0.08)]);
  // LED lens strip along the head's underside.
  c.parts.push([c.m.lens(c.kelvin, 0.22, true), box(L * 0.8, 0.04, d.headD * 0.45, 0, -d.headH - d.plateT - 0.0, z0 + d.headD * 0.45)]);
  const at = new THREE.Vector3(0, -d.headH - d.plateT - 0.7, z0 + d.headD * 0.6);
  // Down the wall face: aimed slightly back toward the wall (-z).
  light(c, at, new THREE.Vector3(0, -1, -0.18), c.beamDeg, Math.min(176, c.beamDeg * 1.35), c.spec.lumens, d.range ?? 2.6);
}

/**
 * Surface riser / step light on a vertical face (TS-A501 3 in, TS-A1001 6 in): a slim bar with LEDs along its
 * underside lighting the tread below. dims: length, height, depth.
 */
function riser(c: Ctx) {
  const d = c.spec.dims;
  c.parts.push([c.finish, box(d.length, d.height, d.depth, 0, -d.height / 2, d.depth / 2, Math.min(0.12, d.height * 0.3))]);
  const n = d.leds ?? 1;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -d.length * 0.38 + (i / (n - 1)) * d.length * 0.76;
    c.parts.push([c.m.lens(c.kelvin, 0.3), box(n === 1 ? d.length * 0.18 : 0.22, 0.03, d.depth * 0.5, x, -d.height / 2 - 0.015, d.depth * 0.55)]);
  }
  light(c, new THREE.Vector3(0, -d.height / 2 - 0.3, d.depth + 0.5), new THREE.Vector3(0, -0.75, 1), c.beamDeg, Math.min(176, c.beamDeg * 1.4), c.spec.lumens, d.range ?? 2.2);
}

/**
 * Paver light (TS-HPL / TS-MHPL): an inverted-T bar set between pavers of the soldier or sailor course with its
 * lens flush with the paving, shining up and out. dims: length, width (lens bar), height (below grade, hidden), foot.
 */
function paver(c: Ctx) {
  const d = c.spec.dims;
  // An inverted T set between pavers: only the lens bar's top shows, flush with the paving, in a thin metal frame.
  c.parts.push([c.finish, box(d.length, 0.04, d.width, 0, -0.02, 0)]);
  c.parts.push([c.m.lens(c.kelvin, 0.35, true), box(d.length - 0.16, 0.045, d.width - 0.16, 0, -0.02, 0)]);
  light(c, new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, 1, 0), c.beamDeg, 176, c.spec.lumens, d.range ?? 3);
}

/**
 * Dot light (TS-15DOT / TS-25DOT / TS-M15DOT / TS-M25DOT): a round light in a core-drilled hole, its slightly domed
 * ring flush on the surface. Set in paving or decking it faces up; tilted 90 degrees it sits in a riser or wall face.
 * The traditional dots carry a half-hood eyebrow on the back side. dims: faceD, lensD, eyebrow (height, 0 for none).
 */
function dot(c: Ctx) {
  const d = c.spec.dims;
  const parts: Part[] = [];
  parts.push([c.finish, lathe([[d.faceD / 2, 0], [d.faceD / 2, 0.04], [d.faceD / 2 - 0.15, 0.1], [d.lensD / 2 + 0.04, 0.09], [d.lensD / 2, 0.02]], 32)]);
  parts.push([c.m.lens(c.kelvin, 0.5, true), disc(d.lensD / 2, 0.03, 24)]);
  if (d.eyebrow) parts.push([c.finish, slantShroud(d.lensD / 2 + 0.14, 0.06, 0.05, d.eyebrow, 0.02, 28)]);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.tilt);
  for (const [mat, g] of parts) c.parts.push([mat, g.applyQuaternion(q)]);
  // Up (or out of the face), leaning away from the eyebrow.
  const dir = new THREE.Vector3(0, 1, d.eyebrow ? 0.25 : 0).applyQuaternion(q);
  light(c, new THREE.Vector3(0, 0.25, 0).applyQuaternion(q), dir, c.beamDeg, Math.min(170, c.beamDeg * 2), c.spec.lumens, d.range ?? 3);
}

/** Puck light (TS-25WMA): a slim disc on a riser or post face, its upper half a closed hood, light out the bottom. */
function puck(c: Ctx) {
  const d = c.spec.dims;
  const R = d.faceD / 2;
  const g = lathe([[R, 0], [R, d.depth - 0.1], [R * 0.9, d.depth], [0, d.depth]], 32).rotateX(Math.PI / 2);
  c.parts.push([c.finish, g]);
  // The slot under the hood.
  c.parts.push([c.m.lens(c.kelvin, 0.3, true), box(R * 1.2, 0.05, d.depth * 0.6, 0, -R * 0.35, d.depth * 0.55)]);
  light(c, new THREE.Vector3(0, -R * 0.6, d.depth + 0.5), new THREE.Vector3(0, -1, 0.5), c.beamDeg, 176, c.spec.lumens, d.range ?? 2.2);
}

/**
 * Walkway wash (TS-A6500C): a hooded rectangular head on two stakes, the LED strip under its front lip washing a
 * walk. dims: length, headH, headD, legH.
 */
function walkwayWash(c: Ctx) {
  const d = c.spec.dims;
  const steel = c.m.plain('stainless-leg', '#b8bbbe', 0.35, 1);
  for (const sx of [-1, 1]) c.parts.push([steel, cyl(0.16, d.legH + 0.1, 0, 10).translate(sx * d.length * 0.38, 0, 0)]);
  const tilt = (12 * Math.PI) / 180;
  const head = box(d.length, d.headH, d.headD, 0, -d.headH / 2, 0, 0.1).rotateX(-tilt).translate(0, d.legH + d.headH / 2, 0);
  c.parts.push([c.finish, head]);
  c.parts.push([c.m.lens(c.kelvin, 0.3, true), box(d.length * 0.78, 0.04, 0.5, 0, 0, d.headD * 0.25).rotateX(-tilt).translate(0, d.legH - 0.03, 0)]);
  light(c, new THREE.Vector3(0, d.legH - 0.2, d.headD * 0.3), new THREE.Vector3(0, -0.8, 1), c.beamDeg, 170, c.spec.lumens, d.range ?? 4);
}

/**
 * Transformer (TS-T75 ... TS-T400): a weatherproof stainless steel cabinet with a hinged front, a vented bottom and
 * the photo eye on its side, mounted on a wall or post with its bottom about a foot above grade.
 * dims: width, height, depth.
 */
function transformer(c: Ctx) {
  const d = c.spec.dims;
  const W = d.width, H = d.height, D = d.depth;
  c.parts.push([c.finish, box(W, H, D, 0, 0, D / 2, 0.12)]);
  // Door seam and hinge side, a raised label plate, the timer/photo eye pod and the conduit knockouts below.
  const seam = c.m.plain('cabinet-seam', '#4a4c4e', 0.6, 0.5);
  c.parts.push([seam, box(W - 0.6, H - 0.6, 0.04, 0, 0.3, D + 0.005)]);
  c.parts.push([c.finish, box(W - 0.7, H - 0.7, 0.06, 0, 0.35, D + 0.02, 0.05)]);
  c.parts.push([seam, cyl(0.25, 0.4, -0.4, 12).translate(-W * 0.25, 0, D / 2)]);
  c.parts.push([seam, cyl(0.25, 0.4, -0.4, 12).translate(W * 0.25, 0, D / 2)]);
  const dark = c.m.plain('photo-eye', '#1d1d1d', 0.5, 0);
  if (d.plastic) {
    // Black plastic case: vertical cooling ribs on the front.
    for (let k = 0; k < 9; k++) c.parts.push([c.finish, box(0.16, H * 0.62, 0.18, -W / 2 + 0.45 + (k * (W - 0.9)) / 8, H * 0.3, D + 0.06)]);
  } else {
    c.parts.push([dark, new THREE.CylinderGeometry(0.45, 0.45, 0.8, 14).rotateZ(Math.PI / 2).translate(W / 2 + 0.4, H * 0.75, D * 0.5)]);
    c.parts.push([dark, new THREE.SphereGeometry(0.38, 12, 8).translate(W / 2 + 0.85, H * 0.75, D * 0.5)]);
  }
  // Timer display window (astronomical timer) or the app control panel (WiFi model).
  if (d.timer) c.parts.push([dark, box(W * 0.5, H * 0.14, 0.05, 0, H * 0.48, D + 0.04, 0.02)]);
  if (d.app) c.parts.push([dark, box(W * 0.42, W * 0.32, 0.05, 0, H * 0.5, D + 0.04, 0.08)]);
}

const BUILDERS: Record<FixtureSpec['family'], (c: Ctx) => void> = {
  bullet,
  flood: (c) => floodHead(c, false),
  wash: (c) => floodHead(c, true),
  pathHat,
  pathClassic,
  pathModernRound: (c) => pathModern(c, false),
  pathModernSquare: (c) => pathModern(c, true),
  well,
  hardscape,
  riser,
  paver,
  dot,
  puck,
  walkwayWash,
  transformer,
};

/** Default mount heights (m above grade) for fixtures fixed to a face, when the placement gives none. */
const MOUNT_DEFAULT: Partial<Record<FixtureSpec['mount'], number>> = { cap: 0.45, face: 0.2, wall: 0.3 };

/** Where a fixture fixed to a wall goes: the point on the wall's face, the way the face looks, and the cap's underside. */
interface WallFace {
  at: Vec2;
  out: Vec2;
  capBottom: number;
}

/** The yard as the fixtures need it: the finished surface, and the wall faces cap and face lights snap to. */
export interface FixtureSite {
  surface(p: Vec2): number;
  /**
   * A cap or face light placed near a wall or raised planter without a mount height (as Area Planner places them)
   * moves onto the nearest face within 0.75 m, turns to face out from it, and takes the cap's underside as its
   * height (a face light takes its default height on that face). Others come back unchanged.
   */
  place(f: FeaturePlacement, fx: FixtureSpec): FeaturePlacement;
}

export function fixtureSite(plan: SitePlan, height: (p: Vec2) => number): FixtureSite {
  const surface = finishedSurface(plan.zones, height);
  type Face = { a: Vec2; b: Vec2; d0: number; d1: number; half: number; cap: number };
  const faces: Face[] = [];
  for (const l of plan.lines) {
    if (l.kind !== 'wall') continue;
    const path = linePath(l, plan.zones);
    for (let i = 0; i + 1 < path.pts.length; i++) faces.push({ a: path.pts[i], b: path.pts[i + 1], d0: path.dOut[i], d1: path.dIn[i + 1], half: path.thick / 2, cap: l.height });
  }
  // Raised planters: the wall's outer face is the zone's outline; the cap sits 5 cm below the top.
  for (const z of plan.zones) {
    if (!z.raised || z.polygon.length < 3) continue;
    const n = z.polygon.length;
    for (let i = 0; i < n; i++) faces.push({ a: z.polygon[i], b: z.polygon[(i + 1) % n], d0: 0, d1: 0, half: 0, cap: Math.max(0.2, Math.min(1.2, z.raised.height)) - 0.05 });
  }
  const nearest = (p: Vec2): WallFace | null => {
    let best: WallFace | null = null, bestD = 0.75;
    for (const f of faces) {
      const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1], len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const t = Math.max(0, Math.min(len, (p[0] - f.a[0]) * ux + (p[1] - f.a[1]) * uy));
      const qx = f.a[0] + ux * t, qy = f.a[1] + uy * t;
      const across = (p[0] - qx) * nx + (p[1] - qy) * ny;
      const d = f.d0 + (f.d1 - f.d0) * (t / len);
      // A raised planter's outline: the outside is the side the point is on, unless that side is inside the zone.
      let side = across >= d ? 1 : -1;
      if (f.half === 0) {
        const z = plan.zones.find((zz) => zz.raised && zz.polygon.includes(f.a));
        if (z && pointInPolygon([qx + nx * side * 0.05, qy + ny * side * 0.05], z.polygon)) side = -side;
      }
      const face = d + side * f.half;
      const gap = Math.abs(across - face);
      if (gap < bestD) {
        bestD = gap;
        best = { at: [qx + nx * (face + side * 0.002), qy + ny * (face + side * 0.002)], out: [nx * side, ny * side], capBottom: f.cap };
      }
    }
    return best;
  };
  return {
    surface,
    place(f, fx) {
      if ((fx.mount !== 'cap' && fx.mount !== 'face') || f.fixture?.mountHeight !== undefined || !faces.length) return f;
      const w = nearest(f.position);
      if (!w) return f;
      const rotationDeg = (-Math.atan2(w.out[0], w.out[1]) * 180) / Math.PI;
      const mountHeight = fx.mount === 'cap' ? w.capBottom : Math.min(w.capBottom - 0.08, MOUNT_DEFAULT.face ?? 0.2);
      return { ...f, position: w.at, rotationDeg, fixture: { ...f.fixture, mountHeight } };
    },
  };
}

/**
 * The finished surface at a point: the top of the paving where a paving zone covers it, else the ground. Fixtures
 * set in the ground (stake, in-grade) stand on it; ones on walls, caps and risers count their height from the
 * ground the wall stands on.
 */
export function finishedSurface(zones: Zone[], height: (p: Vec2) => number): (p: Vec2) => number {
  const paving = zones.map((z, i) => ({ z, top: zoneTop(z, i) })).filter(({ z }) => z.kind === 'hardscape' && z.polygon.length > 2);
  return (p) => {
    let top = 0;
    for (const { z, top: t } of paving) if (t > top && pointInPolygon(p, z.polygon)) top = t;
    return height(p) + top;
  };
}

/**
 * `ground`: the ground height under the placement (where the feature group stands); `surface`: the finished surface
 * there. Fixtures in the ground stand on the surface. Mount heights of fixtures on walls, caps and risers count from
 * the yard's grade (0), as wall and cap heights do.
 */
export function buildFixture(spec: FeatureSpec, f: FeaturePlacement, m: FixtureMaterials, ground = 0, surface = ground): { parts: Part[]; lights: LandLight[] } {
  const fx = spec.fixture;
  if (!fx) return { parts: [], lights: [] };
  const set = fixtureSetting(fx, f.fixture);
  const c: Ctx = {
    spec: fx,
    finish: m.finish(set.finish),
    m,
    kelvin: set.kelvin,
    beamDeg: set.beamDeg,
    tilt: (set.tiltDeg * Math.PI) / 180,
    parts: [],
    lights: [],
  };
  BUILDERS[fx.family](c);
  // Inches to meters, and up to the mount height for fixtures on a face, cap or wall.
  const inGround = fx.mount === 'stake' || fx.mount === 'grade';
  const lift = inGround ? surface - ground : (set.mountHeight ?? MOUNT_DEFAULT[fx.mount] ?? 0) - ground;
  const s = new THREE.Matrix4().makeScale(IN, IN, IN).premultiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
  for (const [, g] of c.parts) {
    g.applyMatrix4(s);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  for (const l of c.lights) l.position.y += lift;
  return { parts: c.parts, lights: c.lights };
}
