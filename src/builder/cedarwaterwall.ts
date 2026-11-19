import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import type { Vec2 } from '../siteplan/types';
import { silverTravertineLedgerSet } from '../engine/fountain-surfaces';
import { fbm, smooth, vnoise } from '../engine/noise';
import { mixRGB, mulRGB, paint, textureSet, type PBRSet } from '../engine/textures';
import { FIXTURE_FINISHES } from '../siteplan/truscapes';
import { mat as decor } from './decor/kit';
import { pbrMaterial, plainMaterial } from './materials';
import { agedCopper, boxIn, clearFallMaterial, ledMaterial, linkGlow, sheetGeometry, splashMaterial, streamGeometry, type FountainSink } from './pillarfountain';

/*
 * Cedar slat water wall with a Silver Travertine stone panel (pondless), drawn from the owner's design rendering for
 * a customer job, at the sizes the owner gave: the stone panel 6 ft x 6 ft, the cedar slat wings 3 ft wide on each
 * side (12 ft in all), 2 1/2 ft from the back of the wall to the front of the pebbles.
 *
 *   Wall      a 2x4 framed wall 6 in thick clad in horizontal clear cedar 1x4 slats (3 1/2 in faces, 5/8 in gaps, a
 *             dark backer behind the gaps), a header of the same slats over the stone and a 4 in cedar cap beam the full
 *             length. The stone opening is trimmed with cedar returns; the stone sits 1 1/2 in behind the slats. 6 in
 *             leaves a 24 in pebble strip in the 2 1/2 ft depth, so the 24 in pots fit it.
 *   Stone     MSI Silver Travertine Panel 6x24 (LPNLTSIL624), split-face ledger panels 1/2 to 3/4 in thick, bought from
 *             California Landscape Supply; 72 x 72 in, from below the pebbles to the header.
 *   Spillway  a 12 in copper box scupper centered on the stone, its lip 49 in up, standing 4 in off the stone, with a
 *             warm LED in the lip and a sheer sheet falling to the pebbles.
 *   Spouts    two 1 in copper pipes (1 1/4 in outside) with flanges, 24 in either side of center and 36 in up, standing
 *             out 5 1/2 in and tipped down a little, each pouring a rope of water (as on the three-pillar feature).
 *   Lights    a Tru-Scapes TSS-AS201 Dual Lamp ("Traditional Up & Down") sconce in Bronze centered on each wing, 60 in
 *             up: 10 W, 802 lm, about 60 degree beams up and down, set warm (it changes 2700 to 6500 K). And a small warm
 *             LED puck in the pebbles where each fall lands, lighting the water from below.
 *   Pebbles   black Mexican beach pebble, 1-2 in, across the whole front, kept wet near the falls. No open water.
 *   Pots      a PMD (Pottery Manufacturing & Distributing, Gardena CA) 24 x 22 in Cement Egg Pot in White on the pebbles
 *             in front of each wing, planted with a Gardenia 'Veitchii' (an option).
 *
 * Local space: x along the wall, +z out of the front, y up from grade; the footprint (144 x 30 in) is centered.
 */

const IN = 0.0254;
const PEBBLE = 'mexican-beach-pebble-1-2';
const WET_PEBBLE: [number, number, number] = [0.72, 0.6, 0.5];

/** Sizes in inches. */
export const CW = {
  length: 144,
  depth: 30,
  wallD: 6,
  stoneW: 72,
  stoneH: 72,
  /** The stone's face behind the slats' face. */
  stoneBack: 1.5,
  slatH: 3.5,
  slatGap: 0.625,
  slatT: 0.75,
  capH: 4,
  capD: 9.5,
  height: 80.25,
  pebbleTop: 2,
  spillW: 12,
  lipY: 49,
  spoutX: 24,
  spoutY: 36,
  sconceX: 54,
  sconceY: 60,
  potX: 54,
};

/**
 * The PMD 24 x 22 in Cement Egg Pot: 24 in across at its widest, 22 in tall, an egg narrowing to a round rim. PMD does
 * not publish the opening or the base, so the rim (16 1/2 in) and the foot (14 in) are read from its product photo.
 */
const POT = { height: 22, max: 24, rim: 16.5, foot: 14, soil: 20.5 };
/** Gardenia 'Veitchii' kept about 2 ft tall and 20 in across in the pot. */
const GARDENIA_SIZE = 0.62;

/** Back of the wall, front of the slats and of the stone, z in inches. */
const zBack = -CW.depth / 2;
const zFace = zBack + CW.wallD;
const zStone = zFace - CW.stoneBack;

/**
 * The pots' surface: PMD's White cement, a warm off-white sandblasted to show its fine aggregate, so it reads speckled
 * (small darker and lighter grains) with soft cloudy variation from the cast. Matte.
 */
function potSet(): PBRSet {
  return textureSet('ww-pot', () =>
    paint(512, 0.5, 2, (u, v) => {
      const cloud = fbm(u, v, 3, 4, 91), grain = vnoise(u * 420, v * 420, 420, 92), speck = vnoise(u * 260 + 3, v * 260, 260, 95);
      let c = mixRGB([0.6, 0.575, 0.535], [0.54, 0.515, 0.475], cloud);
      c = mulRGB(c, 0.96 + (grain - 0.5) * 0.08);
      // Exposed aggregate: a scatter of dark and pale grains.
      if (speck > 0.9) c = mulRGB(c, 1 - 0.38 * smooth(0.9, 0.97, speck));
      else if (speck < 0.06) c = mulRGB(c, 1.06);
      return { h: 0.5 + (grain - 0.5) * 0.4 - (speck > 0.9 ? 0.3 : 0), c, r: 0.86 };
    }),
  );
}

/**
 * The pot's outline from the foot up (inches): an egg, widest a little below the middle, closing in to the foot below
 * and the rim above along one ellipse each, then a small rounded lip and the inside a few inches down.
 */
function potGeometry(): THREE.BufferGeometry {
  const { height: H, max, rim, foot } = POT;
  const R = max / 2, yc = H * 0.46;
  const below = yc / Math.sqrt(1 - (foot / 2 / R) ** 2), above = (H - 0.8 - yc) / Math.sqrt(1 - (rim / 2 / R) ** 2);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0.25), new THREE.Vector2(foot / 2 - 0.5, 0), new THREE.Vector2(foot / 2, 0.25)];
  for (let i = 1; i <= 20; i++) {
    const y = (i / 20) * (H - 0.8);
    const k = (y - yc) / (y < yc ? below : above);
    pts.push(new THREE.Vector2(R * Math.sqrt(Math.max(0, 1 - k * k)), y));
  }
  pts.push(new THREE.Vector2(rim / 2 + 0.25, H - 0.45), new THREE.Vector2(rim / 2 + 0.1, H), new THREE.Vector2(rim / 2 - 0.6, H - 0.05), new THREE.Vector2(rim / 2 - 0.9, H - 3));
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * IN, p.y * IN)), 56);
  // UVs in meters round and up, for the cast surface.
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, Math.atan2(pos.getZ(i), pos.getX(i)) * R * IN, pos.getY(i));
  return g.toNonIndexed();
}

/**
 * The Tru-Scapes TSS-AS201 Dual Lamp sconce ("Traditional Up & Down"), Bronze: a 3 1/8 x 2 in mounting plate on the wall
 * and a 2 3/8 in cylinder 5 3/8 in tall standing 3 1/4 in off the wall (its far side), a glass lens in each open end
 * throwing light up and down. Sizes in inches from the maker's spec sheet and its 3D model.
 */
const TRU_SCONCE = { body: 2.375, len: 5.375, stand: 3.25, plateH: 3.125, plateW: 2, plateT: 0.4, lens: 2.2 };

function sconce(sink: FountainSink, x: number, y: number, z: number) {
  const s = TRU_SCONCE;
  const f = FIXTURE_FINISHES.bronze;
  const finish = plainMaterial('ww-sconce-bronze', { color: f.color, roughness: f.roughness, metalness: f.metalness });
  sink.add(finish, boxIn(s.plateW, s.plateH, s.plateT, x, y - s.plateH / 2, z + s.plateT / 2));
  // The arm from the plate to the back of the cylinder.
  const cz = z + s.stand - s.body / 2, armD = cz - z - s.plateT;
  sink.add(finish, boxIn(1.1, 1.4, armD + 0.3, x, y - 0.7, z + s.plateT + armD / 2));
  const body = new THREE.CylinderGeometry((s.body / 2) * IN, (s.body / 2) * IN, s.len * IN, 32, 1, true).translate(x * IN, y * IN, cz * IN);
  sink.add(finish, body.toNonIndexed());
  // Lenses at both open ends, set a little inside the tube; they glow at night.
  const lens = ledMaterial();
  sink.own(lens);
  sink.glow(lens);
  for (const sy of [-1, 1]) {
    const disc = new THREE.CircleGeometry((s.lens / 2) * IN, 28).rotateX((sy * -Math.PI) / 2).translate(x * IN, (y + sy * (s.len / 2 - 0.3)) * IN, cz * IN);
    sink.add(lens, disc.toNonIndexed());
    // The wash on the cedar: about half the 802 lm each way, a soft light just off the wall above and below.
    sink.light(x * IN, (y + sy * (s.len / 2 + 7)) * IN, (z + 2) * IN, '#ffc27a', 0.55, 1.1);
  }
}

/** The water wall, built into `sink` in local space (front +z). */
export function cedarWaterWall(sink: FountainSink, seed: string, pots: boolean) {
  const cedar = decor.cedar();
  const backer = plainMaterial('ww-backer', { color: '#16110d', roughness: 0.95 });
  const stone = pbrMaterial('ww-ledger-silver', silverTravertineLedgerSet());
  const copper = agedCopper();
  const L = CW.length, half = L / 2, sw = CW.stoneW / 2;
  const top = CW.height - CW.capH;
  const r = rng(seed);

  // The wall's body behind the slats: dark backer board (it shows in the gaps) on the framing, on the wings and over
  // the stone; behind the stone, the wall stops at the stone's backer.
  const bd = CW.wallD - CW.slatT - 0.2, wingW = half - sw;
  for (const sx of [-1, 1]) sink.add(backer, boxIn(wingW, top + 1, bd, sx * (sw + wingW / 2), -1, zBack + bd / 2));
  sink.add(backer, boxIn(CW.stoneW, top - CW.stoneH, bd, 0, CW.stoneH, zBack + bd / 2));
  sink.add(backer, boxIn(CW.stoneW, CW.stoneH + 1, zStone - 1 - zBack, 0, -1, (zBack + zStone - 1) / 2));
  // Slats: the wings full height, the header over the stone; each board a little different in its grain offset.
  const pitch = CW.slatH + CW.slatGap;
  const slat = (x0: number, x1: number, y0: number) => {
    const w = x1 - x0;
    sink.add(cedar, boxIn(w, CW.slatH, CW.slatT, (x0 + x1) / 2, y0, zFace - CW.slatT / 2, r() * 1.2, r() * 0.5));
  };
  // Courses from the cap down, so the top board meets the cap and any short gap falls under the pebbles.
  for (let y = top - CW.slatH; y > -CW.slatH + 1; y -= pitch) {
    if (y + CW.slatH <= CW.stoneH + 0.3) {
      slat(-half, -sw, y);
      slat(sw, half, y);
    } else slat(-half, half, y);
  }
  // Returns: cedar trim lining the stone opening (sides and head), and the wall's end faces.
  const ret = CW.stoneBack + 0.5;
  for (const sx of [-1, 1]) sink.add(cedar, boxIn(0.75, CW.stoneH + 0.5, ret, sx * (sw - 0.375), -1, zFace - ret / 2, 0.37 * sx, 0));
  sink.add(cedar, boxIn(CW.stoneW, 0.75, ret, 0, CW.stoneH - 0.25, zFace - ret / 2, 0.2, 0));
  for (const sx of [-1, 1]) sink.add(cedar, boxIn(0.75, top + 1, CW.wallD, sx * (half - 0.375), -1, zBack + CW.wallD / 2, 0.81, 0.3 * sx));
  // Cap beam the full length, standing a little proud of the slats.
  sink.add(cedar, boxIn(L + 1, CW.capH, CW.capD, 0, top, zBack + CW.capD / 2 - 0.25, 0.53, 0.11));

  // The stone panel, 3/4 in veneer on its backer, from below the pebbles to the header trim.
  sink.add(stone, boxIn(CW.stoneW - 1.5, CW.stoneH + 1, 1, 0, -1, zStone - 0.5, 0.18, 0.04));
  // Wet stone below the falls (the splash keeps it dark).
  const wetStone = plainMaterial('ww-wet-stone', { color: '#2f2a24', roughness: 0.35, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  sink.add(wetStone, new THREE.PlaneGeometry(CW.stoneW * 0.62 * IN, 9 * IN).translate(0, (CW.pebbleTop + 4.5) * IN, (zStone + 0.04) * IN).toNonIndexed());

  const splash = splashMaterial();
  sink.fall(splash);
  const puck = (x: number, z: number, water: THREE.ShaderMaterial | null) => {
    // A small warm LED in the pebbles where the water lands; it lights the fall from below.
    const led = ledMaterial();
    sink.own(led);
    sink.glow(led);
    if (water) linkGlow(led, water);
    sink.add(led, new THREE.CircleGeometry(1.1 * IN, 18).rotateX(-Math.PI / 2).translate(x * IN, (CW.pebbleTop + 0.35) * IN, z * IN).toNonIndexed());
    sink.light(x * IN, (CW.pebbleTop + 4) * IN, (z + 1) * IN, '#ffbf73', 1.1, 1.6);
  };

  // Center spillway: a 12 in copper box scupper standing 4 in off the stone, LED in the lip, the sheet.
  {
    const out = 4, boxH = 3.5;
    sink.add(copper, boxIn(CW.spillW + 1, boxH, out, 0, CW.lipY, zStone + out / 2));
    sink.add(copper, boxIn(CW.spillW + 1.2, 0.35, 0.6, 0, CW.lipY - 0.1, zStone + out - 0.1));
    sink.add(plainMaterial('pf-spill-mouth', { color: '#0c0b0a', roughness: 0.9 }), boxIn(CW.spillW - 0.6, 0.2, 0.15, 0, CW.lipY + 0.05, zStone + out - 0.35));
    const led = ledMaterial();
    sink.own(led);
    sink.glow(led);
    sink.add(led, boxIn(CW.spillW - 1, 0.18, 0.8, 0, CW.lipY - 0.28, zStone + out - 0.6));
    const water = clearFallMaterial();
    linkGlow(led, water);
    sink.fall(water);
    const lip = new THREE.Vector3(0, (CW.lipY + 0.05) * IN, (zStone + out + 0.15) * IN);
    const sheet = new THREE.Mesh(sheetGeometry(lip, (CW.pebbleTop + 0.4) * IN, (CW.spillW - 0.6) * IN, 7.5 * IN, 0.45), water);
    sheet.renderOrder = 3;
    sink.object(sheet);
    sheet.geometry.computeBoundingBox();
    const land = sheet.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(11 * IN, 5 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(0, (CW.pebbleTop + 0.6) * IN, land.max.z - 0.5 * IN);
    foam.renderOrder = 3;
    sink.object(foam);
    sink.light(0, (CW.lipY - 2) * IN, (zStone + 9) * IN, '#ffc27a', 1.7, 2.2);
    puck(0, land.max.z / IN + 1.5, water);
  }

  // Side spouts: 1 in copper pipe with a flange on the stone, tipped 5 degrees down, each pouring a rope of water.
  for (const sx of [-1, 1]) {
    const x = sx * CW.spoutX, y = CW.spoutY;
    const tilt = (5 * Math.PI) / 180, len = 5.5;
    const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    const pipe = new THREE.CylinderGeometry(0.625 * IN, 0.625 * IN, len * IN, 14, 1, true);
    pipe.rotateX(Math.PI / 2 + tilt);
    const base = new THREE.Vector3(x, y, zStone).multiplyScalar(IN);
    const mid = base.clone().addScaledVector(dir, (len / 2) * IN);
    pipe.translate(mid.x, mid.y, mid.z);
    sink.add(copper, pipe.toNonIndexed());
    const flange = new THREE.CylinderGeometry(1.6 * IN, 1.6 * IN, 0.35 * IN, 24).rotateX(Math.PI / 2).translate(base.x, base.y, base.z + 0.17 * IN);
    sink.add(copper, flange.toNonIndexed());
    const mouth = base.clone().addScaledVector(dir, len * IN);
    const bore = new THREE.CircleGeometry(0.5 * IN, 12);
    bore.lookAt(dir);
    bore.translate(mouth.x, mouth.y, mouth.z);
    sink.add(plainMaterial('pf-spill-mouth', { color: '#0c0b0a', roughness: 0.9 }), bore.toNonIndexed());
    const water = clearFallMaterial();
    sink.fall(water);
    const stream = new THREE.Mesh(streamGeometry(mouth.clone().addScaledVector(dir, -0.002), dir, 0.42, (CW.pebbleTop + 0.3) * IN, 0.42 * IN), water);
    stream.renderOrder = 3;
    sink.object(stream);
    stream.geometry.computeBoundingBox();
    const bb = stream.geometry.boundingBox!;
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(4 * IN, 4 * IN).rotateX(-Math.PI / 2), splash);
    foam.position.set(x * IN, (CW.pebbleTop + 0.6) * IN, bb.max.z);
    foam.renderOrder = 3;
    sink.object(foam);
    puck(x, bb.max.z / IN + 0.5, water);
  }

  // Sconces centered on each wing.
  for (const sx of [-1, 1]) sconce(sink, sx * CW.sconceX, CW.sconceY, zFace);

  // Pebbles: the whole front from the slats out, around the pots.
  const front = CW.depth / 2, pad = 0.4;
  // Each pot's back half an inch off the slats; a 24 in pot just fills the 24 in strip.
  const potZ = zFace + POT.max / 2 + 0.5;
  const holes: Vec2[][] = pots ? [-1, 1].map((sx) => circleIn(sx * CW.potX, potZ, POT.foot / 2 + pad + 2)) : [];
  sink.add(plainMaterial('ww-basin-floor', { color: '#141311', roughness: 1 }), boxIn(L, CW.pebbleTop - 0.5 + 1, front - zFace, 0, -1, (front + zFace) / 2));
  sink.pebbles(PEBBLE, rectIn(-half, zFace, half, front), holes, CW.pebbleTop, WET_PEBBLE);

  if (pots) {
    const pot = potGeometry();
    const potMat = pbrMaterial('ww-pot', potSet());
    const soil = plainMaterial('planter-soil', { color: '#2b241f', roughness: 1 });
    for (const sx of [-1, 1]) {
      const g = pot.clone().translate(sx * CW.potX * IN, (CW.pebbleTop - 0.5) * IN, potZ * IN);
      sink.add(potMat, g);
      sink.add(soil, new THREE.CircleGeometry((POT.rim / 2 - 0.6) * IN, 32).rotateX(-Math.PI / 2).translate(sx * CW.potX * IN, (CW.pebbleTop - 0.5 + POT.soil) * IN, potZ * IN).toNonIndexed());
      sink.plant('gardenia-veitchii', sx * CW.potX * IN, (CW.pebbleTop - 0.5 + POT.soil) * IN - 0.01, potZ * IN, GARDENIA_SIZE);
    }
    pot.dispose();
  }
}

function rectIn(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

function circleIn(x: number, z: number, rad: number): Vec2[] {
  return Array.from({ length: 20 }, (_, i): Vec2 => [x + Math.cos((i / 20) * Math.PI * 2) * rad, z + Math.sin((i / 20) * Math.PI * 2) * rad]);
}
