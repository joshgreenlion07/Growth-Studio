import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { featureOption, type FeatureSpec } from '../siteplan/catalog';
import { CAFE_LIGHTS, FS_BOX, MIRADOR_111, OUTLET_POST, PERGOLA_OUTLET_Y, PERGOLA_PEDESTAL, PVC_CONDUIT_OD, PVC_SWEEP_R, STUB_TAIL, TAYMAC_COVER, TRENCH_DEPTH, miradorPosts, outletChoice, outletLayout, type ElbowWay, type MiradorSize } from '../siteplan/mirador';
import { featureSize } from '../siteplan/decor';
import { UTILITY_PIPE } from '../siteplan/utilities';
import { tradeSizeOf, type OutletJoin } from '../siteplan/outletjoin';
import type { LandLight } from '../engine/landlights';
import type { FeatureAction } from './actions';
import type { NightLight } from './features';
import { boxUV, catalogMaterial, plainMaterial } from './materials';

/*
 * Mirador 111 louvered pergolas (10 x 10 and 10 x 20), the café string lights hung round their beams, the in-use
 * outlet on a post, and the free-standing 4x4 outlet post. Sizes and sources: siteplan/mirador.ts. Built in inches in
 * the feature's local frame (x along the pergola, z across it, front +z, y up from the paving) and turned into meters.
 */

const IN = 0.0254;
const M = MIRADOR_111;

/** What the builders hand back to the feature build (builder/features.ts), in the feature's local space (meters). */
export interface MiradorSink {
  /** A static part, merged by material. */
  add(m: THREE.Material, g: THREE.BufferGeometry): void;
  /** A mesh of its own (louvers, moving parts); its geometry is disposed with the yard. */
  object(o: THREE.Object3D): void;
  anchor(x: number, y: number, z: number): THREE.Object3D;
  act(a: Omit<FeatureAction, 'itemId'>): void;
  /** A shade structure's night light (ranked last in the light pool). */
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number): NightLight;
  /** An aimed light (engine/landlights.ts) given in local space; returns the world copy that is lit. */
  landLight(l: LandLight): LandLight;
  glow(m: THREE.MeshStandardMaterial): void;
  own(m: THREE.Material): void;
  /** The top of the paving at a local point (meters above the feature's base; 0 off paving): paving is drawn its
   *  thickness above grade. */
  lift(x: number, z: number): number;
  /** A part under grade (a stub-up's elbow), shown with the open trenches; merged parts stay above it. */
  under(m: THREE.Material, g: THREE.BufferGeometry): void;
}

/** A box w x h x d (inches) with its bottom center at (x, y, z) inches, in meters. */
function bx(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w * IN, h * IN, d * IN);
  boxUV(g);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return g.toNonIndexed();
}

/** A cylinder (inches) standing on (x, y, z). */
function cy(r: number, h: number, x: number, y: number, z: number, seg = 12): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r * IN, r * IN, h * IN, seg).translate(x * IN, (y + h / 2) * IN, z * IN).toNonIndexed();
}

/** A rod of radius r (inches) between two points (inches). */
function rod(r: number, a: THREE.Vector3, b: THREE.Vector3, seg = 8): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r * IN, r * IN, d.length() * IN, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const c = a.clone().add(b).multiplyScalar(0.5 * IN);
  return g.translate(c.x, c.y, c.z).toNonIndexed();
}

/** A square frustum (inches): `b` across at the bottom, `t` at the top, h tall, standing on (x, y, z). */
function frustum(b: number, t: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry((t / Math.SQRT2) * IN, (b / Math.SQRT2) * IN, h * IN, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return g.toNonIndexed();
}

/** The materials, cached by key (shared by every pergola in the yard, not disposed per build). */
function materials() {
  return {
    // Mirador Charcoal: a matte, finely textured dark gray powder coat (maker's photos).
    frame: plainMaterial('mirador-charcoal', { color: '#2e2f32', roughness: 0.6, metalness: 0.2 }),
    cap: plainMaterial('mirador-end-cap', { color: '#202123', roughness: 0.7, metalness: 0.05 }),
    dark: plainMaterial('mirador-drain', { color: '#0e0e0f', roughness: 0.95 }),
    plate: plainMaterial('galv-plate', { color: '#8e9194', roughness: 0.48, metalness: 0.7 }),
    bolt: plainMaterial('zinc-bolt', { color: '#b8bbbe', roughness: 0.35, metalness: 0.85 }),
    grip: plainMaterial('crank-grip', { color: '#141415', roughness: 0.55 }),
    // The pedestals' cast concrete, a plain gray (the smooth concrete look, toned down from its light patio finish).
    concrete: catalogMaterial('concrete-smooth', { color: new THREE.Color('#b4b1aa') }),
    rubber: plainMaterial('cord-black', { color: '#141415', roughness: 0.6, metalness: 0.02 }),
    lampBase: plainMaterial('lamp-base', { color: '#b7b2a6', roughness: 0.35, metalness: 0.8 }),
    // Gray PVC (Carlon boxes and fittings, Schedule 40 and the darker Schedule 80 conduit), the clear polycarbonate
    // TayMac cover, its black gasket, the white GFCI face.
    pvc: plainMaterial('pvc-gray', { color: '#686c70', roughness: 0.5, metalness: 0.02 }),
    pvc80: plainMaterial('pvc-gray-80', { color: '#55595c', roughness: 0.5, metalness: 0.02 }),
    // Under grade, Schedule 40 in the same gray the build stages draw an underground electrical run in (UTILITY_PIPE),
    // so a stub-up's elbow and tail read as one run with the trench's conduit.
    ug: plainMaterial('pvc-underground', { ...UTILITY_PIPE.electrical, metalness: 0 }),
    strap: plainMaterial('pvc-strap', { color: '#686c70', roughness: 0.5, metalness: 0.02, side: THREE.DoubleSide }),
    clear: plainMaterial('taymac-clear', { color: '#c9d3d9', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    gasket: plainMaterial('gasket-black', { color: '#1a1a1b', roughness: 0.8 }),
    device: plainMaterial('gfci-white', { color: '#eeeeea', roughness: 0.4 }),
    // Pressure-treated lumber (MCA): a light brown with a faint green cast.
    pt: plainMaterial('pt-4x4', { color: '#6a5b40', roughness: 0.9 }),
  };
}
type Mats = ReturnType<typeof materials>;

/* ------------------------------------------------------------------ */
/* The pergola                                                         */
/* ------------------------------------------------------------------ */

/** Mirador 111 louvers: the untouched pose (a plan that never chose), half open. */
const TILT_DEG = 45;

export function buildMirador(sink: MiradorSink, spec: FeatureSpec, options: Record<string, boolean> | undefined, joins?: Map<string, OutletJoin>) {
  const size: MiradorSize = spec.id.endsWith('10x20') ? '10x20' : '10x10';
  const mats = materials();
  const opt = (k: string) => featureOption(spec, options, k);
  const L = M.along[size], W = M.across, P = M.post;
  const posts = miradorPosts(size);
  // The posts stand on pedestals 1/2 in proud of the paving (the highest paving under any post, so the frame is level).
  const base = Math.max(...posts.map((p) => sink.lift(p.x * IN, p.z * IN) / IN)) + PERGOLA_PEDESTAL.reveal;
  const top = base + M.height;
  const beamBot = base + M.clearance;
  const beamTop = top - 0.1;
  const covers = opt('footCovers');

  // Posts on their pedestals: the 12 in concrete pedestal 1/2 in proud of the paving (its lower part and the 30 in
  // footing are under it), the 1/4 in base plate with four anchor bolts, the foot plate cover over them with the
  // gutter's outlet on its outer face, the post, and the pillar cover on top.
  for (const p of posts) {
    const sz = Math.sign(p.z) || 1;
    sink.add(mats.concrete, bx(PERGOLA_PEDESTAL.size, 8 + base, PERGOLA_PEDESTAL.size, p.x, -8, p.z));
    sink.add(mats.plate, bx(M.plate, M.plateT, M.plate, p.x, base, p.z));
    for (const bxs of [-1, 1]) for (const bzs of [-1, 1]) {
      const x = p.x + (bxs * M.boltSquare) / 2, z = p.z + (bzs * M.boltSquare) / 2;
      sink.add(mats.bolt, cy(0.38, 0.08, x, base + M.plateT, z, 14));
      sink.add(mats.bolt, cy(0.3, 0.32, x, base + M.plateT + 0.08, z, 6));
      sink.add(mats.bolt, cy(0.17, 0.55, x, base + M.plateT + 0.08, z, 8));
    }
    if (covers) {
      sink.add(mats.frame, bx(M.cover, M.coverH - 0.45, M.cover, p.x, base, p.z));
      sink.add(mats.frame, frustum(M.cover, P + 0.25, 0.45, p.x, base + M.coverH - 0.45, p.z));
      // The outlet: a dark opening low on the cover's outer face.
      sink.add(mats.dark, bx(2.4, 0.55, 0.06, p.x, base + 0.12, p.z + sz * (M.cover / 2 + 0.01)));
    }
    sink.add(mats.frame, bx(P, top - 0.15 - (base + M.plateT), P, p.x, base + M.plateT, p.z));
    sink.add(mats.frame, bx(P + 0.06, 0.08, P + 0.06, p.x, top - 0.15, p.z));
    sink.add(mats.frame, frustum(P + 0.06, P - 0.5, 0.07, p.x, top - 0.07, p.z));
  }

  // Beams: 4.4 in wide, 5.6 in deep, outer faces 0.55 in in from the posts'. Each has its gutter on the inside: the
  // outer part runs full height, the inner part stops 1.9 in down (the gutter floor) with a lip at the inner face.
  const gutterFloor = beamTop - 1.9;
  const beam = (along: 'x' | 'z', len: number, at: number, side: number) => {
    const outer = (along === 'x' ? W : L) / 2 - 0.55;
    const parts: [number, number, number, number][] = [
      // [thickness across, inner edge offset from the outer face, bottom, top]
      [2.4, 0, beamBot, beamTop],
      [2.0, 2.4, beamBot, gutterFloor],
      [0.22, M.beamW - 0.22, gutterFloor, gutterFloor + 0.75],
    ];
    for (const [t, off, y0, y1] of parts) {
      const c = side * (outer - off - t / 2);
      const g = along === 'x' ? bx(len, y1 - y0, t, at, y0, c) : bx(t, y1 - y0, len, c, y0, at);
      sink.add(mats.frame, g);
    }
  };
  for (const sz of [-1, 1]) beam('x', L - 1.1, 0, sz);
  for (const sx of [-1, 1]) beam('z', W - 1.1 - 2 * M.beamW, 0, sx);
  // The 10 x 20's side beams are two lengths joined over the middle posts: the seam reads as a thin dark line.
  if (size === '10x20') for (const sz of [-1, 1]) sink.add(mats.dark, bx(0.06, beamTop - beamBot - 0.2, 0.05, P / 2 + 0.6, beamBot + 0.1, sz * (W / 2 - 0.55 + 0.01)));

  // Louvers: n blades at a 6 in pitch spanning between the side beams' inner faces, each turning about its own
  // center line just under the beam top. Closed they lie flat, the down-turned lip of each over the up-turned lip of
  // the next.
  const n = M.louvers[size];
  const innerZ = W / 2 - 0.55 - M.beamW;
  const capT = 0.6;
  const span = 2 * innerZ - 2 * capT;
  const yPivot = beamTop - 1.25;
  const half = M.blade / 2;
  const bladeGeo = mergeGeometries([
    bx(M.blade - 0.1, 0.08, span, -0.05, -0.04, 0),
    // Down-turned drip lip on the +x edge, up-turned lip on the -x edge, a shallow stiffening rib near the up lip.
    bx(0.08, 0.5, span, half - 0.14, -0.46, 0),
    bx(0.08, 0.5, span, -half + 0.04, -0.04, 0),
    bx(0.3, 0.1, span, -half + 0.9, 0.04, 0),
  ], false)!;
  // End caps with the pin that sits in the shaft support.
  const capGeo = mergeGeometries([-1, 1].flatMap((s) => [
    bx(M.blade - 0.6, 0.62, capT, -0.05, -0.36, s * (span / 2 + capT / 2)),
    new THREE.CylinderGeometry(0.2 * IN, 0.2 * IN, 0.8 * IN, 8).rotateX(Math.PI / 2).translate(0, 0, s * (span / 2 + capT + 0.3) * IN).toNonIndexed(),
  ]), false)!;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push((-(n - 1) / 2 + i) * M.pitch);
  const bladeMesh = new THREE.InstancedMesh(bladeGeo, mats.frame, n);
  const capMesh = new THREE.InstancedMesh(capGeo, mats.cap, n);
  for (const m of [bladeMesh, capMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sink.object(m);
  }
  // Shaft support covers in each side beam's gutter, one at every louver end.
  for (const x of xs) for (const sz of [-1, 1]) sink.add(mats.cap, bx(1.1, 0.9, 1.0, x, gutterFloor, sz * (innerZ + 0.75)));

  // Connecting strips (single-louver models have one in each side beam): a flat bar pinned to every louver's end cap
  // arm, 0.9 in under the pivot when closed, so it slides along and rises as the louvers turn.
  const arm = 0.9;
  const strips = new THREE.Mesh(mergeGeometries([-1, 1].map((sz) => bx((n - 1) * M.pitch + 1.2, 0.7, 0.14, 0, -0.35, sz * (innerZ + 1.45))), false)!, mats.frame);
  strips.castShadow = true;
  sink.object(strips);

  // Cranks: a gearbox under the side beam with the crank coupler, the crank rod hanging next to a corner post and a
  // Z-bent handle at its foot. One crank on the 10 x 10, one at each end of the 10 x 20 (each drives half the louvers).
  const crankZ = -(innerZ - 0.7);
  const crankXs = size === '10x20' ? [-1, 1].map((s) => s * (L / 2 - P - 2.2)) : [-(L / 2 - P - 2.2)];
  const crankY = base + 54;
  const cranks: THREE.Group[] = [];
  for (const cx of crankXs) {
    sink.add(mats.frame, bx(2.4, 2.0, 1.6, cx, beamBot - 1.6, crankZ + 0.2));
    sink.add(mats.frame, bx(1.0, 0.6, 1.0, cx, beamBot - 2.2, crankZ));
    const g = new THREE.Group();
    g.position.set(cx * IN, 0, crankZ * IN);
    const parts = [
      cy(0.42, 1.3, 0, beamBot - 3.5, 0, 12),
      cy(0.27, beamBot - 3.5 - crankY, 0, crankY, 0, 10),
      rod(0.27, new THREE.Vector3(0, crankY + 0.2, 0), new THREE.Vector3(4.2, crankY - 0.6, 0)),
      cy(0.27, 1.0, 4.2, crankY - 1.4, 0, 10),
    ];
    const crankMesh = new THREE.Mesh(mergeGeometries(parts, false)!, mats.frame);
    const gripMesh = new THREE.Mesh(cy(0.5, 4.2, 4.2, crankY - 5.6, 0, 14), mats.grip);
    for (const m of [crankMesh, gripMesh]) {
      m.castShadow = true;
      g.add(m);
    }
    sink.object(g);
    cranks.push(g);
  }

  // Drive: t runs 0 (flat) to 1 (open, 93 degrees); the cranks turn with it (a dozen turns end to end).
  const open = (M.openDeg * Math.PI) / 180;
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mtx = new THREE.Matrix4();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pose = (t: number) => {
    const a = open * t;
    q.setFromAxisAngle(zAxis, a);
    xs.forEach((x, i) => {
      mtx.compose(pos.set(x * IN, yPivot * IN, 0), q, one);
      bladeMesh.setMatrixAt(i, mtx);
      capMesh.setMatrixAt(i, mtx);
    });
    bladeMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    strips.position.set(arm * Math.sin(a) * IN, (yPivot - arm * Math.cos(a)) * IN, 0);
    for (const c of cranks) c.rotation.y = t * Math.PI * 24;
  };
  const start = opt('louversOpen') ? 'open' : opt('louversClosed') ? 'closed' : 'tilt';
  const ease = (v: number) => v * v * (3 - 2 * v);
  // The eased drive's position for the untouched pose.
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) ease((lo + hi) / 2) < TILT_DEG / M.openDeg ? (lo = (lo + hi) / 2) : (hi = (lo + hi) / 2);
  let t = start === 'tilt' ? lo : start === 'open' ? 1 : 0, target = start === 'open' ? 1 : 0, touched = start !== 'tilt';
  const apply = () => pose(ease(t));
  apply();
  const blades = [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)].flatMap((i) => [-1, 1].map((s) => sink.anchor(xs[i] * IN, yPivot * IN, (s * span * IN) / 4)));
  sink.act({
    key: 'louvers', label: 'Louvers', words: ['Open', 'Closed'], anchors: blades, on: start === 'open', planOn: start === 'open', option: 'louversOpen',
    values: () => ({ louversOpen: touched && target === 1, louversClosed: touched && target === 0 }),
    set(next, instant) {
      target = next ? 1 : 0;
      touched = true;
      if (instant) {
        t = target;
        apply();
      }
    },
    tick(dt) {
      if (t === target) return false;
      const step = dt / 4;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
      return true;
    },
  });

  // Weatherproof outlets on the posts the plan picks, on each post's outer face (front or back); the conduit runs down
  // the face and kicks out over the foot plate cover into the pedestal.
  const choice = outletChoice(opt);
  const outletPosts = posts.filter((p) => opt(p.key));
  const outlets = outletPosts.map((p) => {
    const sz = Math.sign(p.z) || 1;
    return outlet(sink, mats, p.x, p.z + sz * (P / 2), sz, base + PERGOLA_OUTLET_Y, base - PERGOLA_PEDESTAL.reveal, choice, covers ? { y: base + M.coverH, d: (M.cover - P) / 2 } : undefined, (k) => joins?.get(`${p.key}:${k}`));
  });

  if (opt('cafeLights')) {
    const startPost = outletPosts[0] ?? posts.find((p) => p.key === 'outletBL')!;
    cafeLights(sink, mats, size, L, W, beamBot, base, startPost, outlets[0]);
  }
}

/* ------------------------------------------------------------------ */
/* Café string lights                                                    */
/* ------------------------------------------------------------------ */

/** sinh(x) / x = r, solved for x (r > 1): a hanging cord's shape for its length over its span. */
function catenaryX(r: number): number {
  let x = Math.sqrt(6 * (r - 1));
  for (let i = 0; i < 30; i++) {
    const f = Math.sinh(x) / x - r;
    const d = (Math.cosh(x) * x - Math.sinh(x)) / (x * x);
    x = Math.max(1e-4, x - f / d);
  }
  return x;
}

/**
 * The set plugged into the outlet on `post` (or hanging down that post to a plug when it has none): the lead comes
 * out of the in-use cover's bottom, up the post's outer face and under the beam, then the cord runs round the
 * underside of the beams, clipped up at every socket and at the corners, sagging between. Sockets come every 24 in of
 * cord; those that fall on the lead's run up the post hang there. Every bulb glows at night; groups of five light the
 * paving as one aimed light each, and one soft light lights the louvers.
 */
function cafeLights(sink: MiradorSink, mats: Mats, size: MiradorSize, L: number, W: number, beamBot: number, base: number, post: { x: number; z: number }, plug?: OutletPlug) {
  const set = CAFE_LIGHTS.sets[size];
  const P = M.post;
  const sz = Math.sign(post.z) || 1, sxIn = post.x === 0 ? 1 : -Math.sign(post.x);
  const faceZ = post.z + sz * (P / 2);
  // Up the post's side face toward the pergola's middle, an inch in from the outer corner.
  const riserX = post.x + sxIn * (P / 2 + 0.2), riserZ = faceZ - sz * 1.0;
  const hookY = beamBot - 0.35;
  const xr = L / 2 - 0.55 - M.beamW - 0.35, zr = W / 2 - 0.55 - M.beamW - 0.35;
  const sx0 = Math.max(-xr, Math.min(xr, riserX));
  // The lead: from the plug in the outlet's lower receptacle out of the cover's bottom, round the post corner, up
  // the side face, in under the beam to the rectangle the cord runs round. With no outlet it comes up from the paving.
  const lead: THREE.Vector3[] = plug
    ? [plug.plug, plug.exit, plug.exit.clone().add(new THREE.Vector3(sxIn * 0.8, -1.2, 0)), new THREE.Vector3(riserX + sxIn * 0.1, plug.exit.y - 0.8, faceZ + sz * 0.35)]
    : [new THREE.Vector3(riserX, base + 0.3, riserZ)];
  lead.push(
    new THREE.Vector3(riserX, (plug ? plug.exit.y : base) + 1.5, riserZ),
    new THREE.Vector3(riserX, hookY - 0.6, riserZ),
    new THREE.Vector3(riserX, hookY, riserZ - sz * 1.0),
    new THREE.Vector3(sx0, hookY, sz * zr),
  );
  const leadLen: number[] = [0];
  for (let i = 1; i < lead.length; i++) leadLen.push(leadLen[i - 1] + lead[i].distanceTo(lead[i - 1]));
  const riserLen = leadLen[leadLen.length - 1];
  const atLead = (c: number) => {
    let i = 1;
    while (i < lead.length - 1 && leadLen[i] < c) i++;
    const f = (c - leadLen[i - 1]) / Math.max(1e-6, leadLen[i] - leadLen[i - 1]);
    return lead[i - 1].clone().lerp(lead[i], Math.min(1, Math.max(0, f)));
  };

  // The rectangle under the beams' inner edges, from the start point round and back.
  const rect: [number, number][] = [[-xr, -zr], [xr, -zr], [xr, zr], [-xr, zr]];
  // The start lies on the front (z = +zr) or back (z = -zr) side; go round from it.
  const edge = sz > 0 ? 2 : 0;
  const loop: [number, number][] = [[sx0, sz * zr]];
  for (let k = 1; k <= 4; k++) loop.push(rect[(edge + k) % 4]);
  loop.push([sx0, sz * zr]);
  const segLen: number[] = [0];
  for (let i = 1; i < loop.length; i++) segLen.push(segLen[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  const Pm = segLen[segLen.length - 1];
  const at = (u: number): [number, number] => {
    let i = 1;
    while (i < loop.length - 1 && segLen[i] < u) i++;
    const f = (u - segLen[i - 1]) / Math.max(1e-6, segLen[i] - segLen[i - 1]);
    return [loop[i - 1][0] + (loop[i][0] - loop[i - 1][0]) * f, loop[i - 1][1] + (loop[i][1] - loop[i - 1][1]) * f];
  };

  // Sockets every 24 in of cord from the end of the lead; those short of the beam hang on the post.
  const sockets: THREE.Vector3[] = [];
  let nRiser = 0;
  for (let k = 0; k < set.sockets; k++) {
    const c = set.leadIn + k * CAFE_LIGHTS.spacing;
    if (c >= riserLen) break;
    sockets.push(atLead(c));
    nRiser++;
  }
  const nRun = set.sockets - nRiser;
  const s = Pm / nRun;
  const ratio = Math.max(1.0001, CAFE_LIGHTS.spacing / s);
  const cx = catenaryX(ratio);
  const hooks: number[] = [];
  for (let j = 0; j < nRun; j++) hooks.push((j + 0.5) * s);
  for (const u of hooks) {
    const [x, z] = at(u);
    sockets.push(new THREE.Vector3(x, hookY, z));
  }
  // Supports: the start, every hook, every corner; the cord sags between each pair with the same shape, and its
  // capped tail runs on a few inches past the last socket.
  const supports = [0, ...hooks, ...segLen.slice(1, -1)].sort((a, b) => a - b);
  const path: THREE.Vector3[] = [...lead.slice(0, -1)];
  for (let k = 0; k + 1 < supports.length; k++) {
    const u0 = supports[k], u1 = supports[k + 1];
    if (u1 - u0 < 1e-3) continue;
    const sp = u1 - u0, a = sp / (2 * cx);
    const steps = Math.max(2, Math.ceil(sp / 1.6));
    for (let i = 0; i < steps; i++) {
      const u = u0 + (sp * i) / steps;
      const [x, z] = at(u);
      path.push(new THREE.Vector3(x, hookY + a * (Math.cosh((u - u0 - sp / 2) / a) - Math.cosh(cx)), z));
    }
  }
  const last = supports[supports.length - 1], tailEnd = Math.min(Pm - 0.5, last + 10);
  for (const u of [last, (last + tailEnd) / 2, tailEnd]) {
    const [x, z] = at(u);
    path.push(new THREE.Vector3(x, hookY - (u - last) * 0.08, z));
  }
  const curve = new THREE.CatmullRomCurve3(path.map((p) => p.clone().multiplyScalar(IN)), false, 'centripetal');
  const tube = new THREE.TubeGeometry(curve, Math.ceil(path.length * 1.2), (CAFE_LIGHTS.cordOD / 2) * IN, 5, false);
  sink.add(mats.rubber, tube.toNonIndexed());

  // Clips at the hooks and corners, under the beam.
  for (const u of [...hooks, ...segLen.slice(1, -1)]) {
    const [x, z] = at(u);
    sink.add(mats.rubber, bx(0.5, 0.3, 0.6, x, hookY + 0.05, z));
  }

  // Suspended sockets: the drop, the socket body (its bottom 4 in under the cord), the E26 base and the G50 globe.
  const bulb = new THREE.MeshStandardMaterial({ color: '#f6f1e6', emissive: new THREE.Color('#ffc887'), emissiveIntensity: 0, roughness: 0.18, metalness: 0 });
  sink.own(bulb);
  sink.glow(bulb);
  const globes: THREE.BufferGeometry[] = [];
  const sk = CAFE_LIGHTS.socket, bl = CAFE_LIGHTS.bulb;
  for (const p of sockets) {
    const bottom = p.y - CAFE_LIGHTS.drop;
    sink.add(mats.rubber, cy(0.14, CAFE_LIGHTS.drop - sk.h, p.x, bottom + sk.h, p.z, 6));
    sink.add(mats.rubber, cy(sk.d / 2, sk.h, p.x, bottom, p.z, 10));
    sink.add(mats.lampBase, cy(0.5, 0.75, p.x, bottom - 0.75, p.z, 10));
    globes.push(new THREE.SphereGeometry((bl.d / 2) * IN, 12, 9).translate(p.x * IN, (bottom - 0.6 - bl.d / 2) * IN, p.z * IN).toNonIndexed());
  }
  sink.add(bulb, mergeGeometries(globes, false)!);

  // Light: five bulbs to one wide aimed light pointing down, and one soft light under the roof.
  const down = new THREE.Vector3(0, -1, 0);
  const pool: LandLight[] = [];
  for (let k = 0; k < sockets.length; k += 5) {
    const g = sockets.slice(k, k + 5);
    const c = g.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / g.length);
    pool.push(sink.landLight({ position: new THREE.Vector3(c.x * IN, (c.y - 6.5) * IN, c.z * IN), direction: down.clone(), beamDeg: 150, cutoffDeg: 178, lumens: bl.lumens * g.length, kelvin: bl.kelvin, range: 6.5 }));
  }
  const roof = sink.light(0, (beamBot - 10) * IN, 0, '#ffc98f', size === '10x20' ? 2.2 : 1.6, size === '10x20' ? 6.5 : 5);
  const anchors = [0, Math.floor(sockets.length / 3), Math.floor((2 * sockets.length) / 3), sockets.length - 1].map((i) => sink.anchor(sockets[i].x * IN, (sockets[i].y - 5) * IN, sockets[i].z * IN));
  sink.act({
    key: 'stringLights', label: 'String lights', words: ['On', 'Off'], anchors, on: true, planOn: true, lights: true,
    set(on) {
      bulb.userData.off = !on;
      for (const l of pool) l.off = !on;
      roof.off = !on;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Outlets                                                              */
/* ------------------------------------------------------------------ */

/** Where a string light's plug sits in an outlet and where its cord leaves the cover (local inches). */
interface OutletPlug {
  plug: THREE.Vector3;
  exit: THREE.Vector3;
}

/**
 * A Green Lion outdoor outlet on a post face at (x, faceZ) inches facing `sz` (+1 front, -1 back), its box centered
 * `centerY` above the local origin, grade at `ground` (siteplan/mirador.ts for the products and sizes): the gray PVC FS
 * box on its mounting feet, the GFCI (two on the 2-gang), the clear TayMac cover (black gasket, hood, hinge along the
 * top, lockable tab at the bottom), and the conduit from each bottom hub straight down the face into the ground with
 * two two-hole straps. `clear`: something proud of the face low down (a foot plate cover, `d` in off the face up to
 * `y`) that the conduit kicks out over.
 */
function outlet(sink: MiradorSink, mats: Mats, x: number, faceZ: number, sz: number, centerY: number, ground: number,
  choice: ReturnType<typeof outletChoice>, clear?: { y: number; d: number }, joinOf?: (k: number) => OutletJoin | undefined): OutletPlug {
  const cv = TAYMAC_COVER[choice.gang];
  const z = (d: number) => faceZ + sz * d;
  // Hubs, the conduits used and how far out they drop: shared with the run join (siteplan/mirador.ts outletLayout).
  const lay = outletLayout(choice, clear?.d);
  const { box, r, hubR, bw, zc, zOut } = lay;
  const boxBot = centerY - box.h / 2, boxTop = centerY + box.h / 2;
  sink.add(mats.pvc, bx(bw, box.h, box.d, x, boxBot, z(box.d / 2)));
  // Mounting feet top and bottom, screwed to the post.
  for (const s of [-1, 1]) {
    const fy = s > 0 ? boxTop : boxBot - 0.6;
    sink.add(mats.pvc, bx(1.1, 0.6, 0.16, x, fy, z(0.08)));
    sink.add(mats.bolt, rod(0.17, new THREE.Vector3(x, fy + 0.3, z(0.16)), new THREE.Vector3(x, fy + 0.3, z(0.24)), 10));
  }
  // Hubs: two in the bottom of the 1-gang FSS; one each end of the 2-gang FSC, the top one closed with a plug.
  const hubXs = lay.hubXs.map((h) => x + h);
  // Conduits: one per hub used (the second, out to the next outlet, only when the run goes on).
  const runXs = lay.runXs.map((h) => x + h);
  for (const hx of hubXs) sink.add(mats.pvc, cy(hubR, 0.7, hx, boxBot - 0.7, z(box.d / 2), 16));
  if (box.hubs === 1) {
    sink.add(mats.pvc, cy(hubR, 0.7, x, boxTop, z(box.d / 2), 16));
    sink.add(mats.pvc, cy(hubR + 0.05, 0.12, x, boxTop + 0.7, z(box.d / 2), 16));
  }
  // The cover: gasket, the device(s), the clear hood with its hinge and lockable tab.
  const front = box.d;
  sink.add(mats.gasket, bx(cv.w, cv.h, 0.12, x, centerY - cv.h / 2, z(front + 0.06)));
  const devXs = choice.gang === 2 ? [x - 0.905, x + 0.905] : [x];
  for (const dx of devXs) {
    sink.add(mats.device, bx(1.31, 2.62, 0.28, dx, centerY - 1.31, z(front + 0.12 + 0.14)));
    for (const s of [-1, 1]) sink.add(mats.gasket, bx(0.5, 0.36, 0.04, dx, centerY + s * 0.82 - 0.18, z(front + 0.42)));
    for (const s of [-1, 1]) sink.add(mats.device, bx(0.42, 0.22, 0.12, dx + s * 0.3, centerY - 0.11, z(front + 0.46)));
  }
  const shape = new THREE.Shape();
  const hw = cv.w / 2 - 0.12, hh = cv.h / 2 - 0.15, rr = 0.55;
  shape.moveTo(-hw + rr, -hh);
  shape.lineTo(hw - rr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  shape.lineTo(hw, hh - rr);
  shape.quadraticCurveTo(hw, hh, hw - rr, hh);
  shape.lineTo(-hw + rr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  shape.lineTo(-hw, -hh + rr);
  shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  const depth = cv.d - 0.12 - 0.3;
  const hood = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.1, bevelOffset: -0.1, bevelSegments: 2, curveSegments: 4 });
  hood.translate(0, 0, 0.12);
  hood.scale(IN, IN, IN);
  if (sz < 0) hood.rotateY(Math.PI);
  hood.translate(x * IN, centerY * IN, faceZ * IN);
  sink.add(mats.clear, hood);
  sink.add(mats.clear, new THREE.CylinderGeometry(0.2 * IN, 0.2 * IN, (cv.w - 0.6) * IN, 10).rotateZ(Math.PI / 2).translate(x * IN, (centerY + cv.h / 2 - 0.1) * IN, z(front + 0.55) * IN).toNonIndexed());
  sink.add(mats.clear, bx(0.7, 0.6, 0.28, x, centerY - cv.h / 2 - 0.45, z(front + cv.d - 0.5)));
  // Conduit, one from each bottom hub, straight down the face; over a foot plate cover it kicks out to clear it.
  const conduitMat = choice.schedule80 ? mats.pvc80 : mats.pvc;
  const top = boxBot - 0.7;
  const kickTop = clear ? clear.y + 3.5 : 0, kickBot = clear ? clear.y + 1.0 : 0;
  const low = clear ? kickTop + 0.5 : ground + 2.5;
  const mid = (top + low) / 2;
  // The elbow's horizontal leg is centered TRENCH_DEPTH under the native grade (the feature's origin), where the build
  // stages lay an underground run's conduit (its cover plus half its size below the ground); paving is drawn above it.
  // A stub-up joined to an underground run (siteplan/outletjoin.ts) turns toward it at its depth instead.
  const R = PVC_SWEEP_R[choice.conduit];
  // The way each elbow turns (local x, z): the second conduit of a run going on sideways turns the other way.
  const way = (w: ElbowWay): [number, number] => (w === 'left' ? [-1, 0] : w === 'right' ? [1, 0] : w === 'back' ? [0, -sz] : [0, sz]);
  const joined = runXs.map((_, k) => joinOf?.(k));
  for (const [k, hx] of runXs.entries()) {
    const j = joined[k];
    const elbowAt = -(j ? j.depthIn : TRENCH_DEPTH) + R;
    const zr = zOut > zc + 0.01 ? zOut : zc;
    if (zOut > zc + 0.01) {
      sink.add(conduitMat, cy(r, top - kickTop, hx, kickTop, z(zc), 16));
      sink.add(conduitMat, rod(r, new THREE.Vector3(hx, kickTop + 0.05, z(zc)), new THREE.Vector3(hx, kickBot - 0.05, z(zOut)), 16));
      sink.add(conduitMat, cy(r, kickBot - ground, hx, ground, z(zOut), 16));
    } else sink.add(conduitMat, cy(r, top - ground, hx, ground, z(zc), 16));
    // Under grade the stub-up goes on down to its elbow (drawn with the trench; the finished yard's ground hides it).
    sink.under(conduitMat, cy(r, ground + 2 - elbowAt, hx, elbowAt, z(zr), 16));
    // Unjoined: the placement's elbow option (or, beside a joined one, the way opposite it, the run going on).
    const w = k === 1 && (choice.elbow === 'left' || choice.elbow === 'right') ? (choice.elbow === 'left' ? 'right' : 'left') : choice.elbow;
    const other = joined[1 - k];
    const dir: [number, number] = j ? [j.dir[0], j.dir[1]] : other ? [-other.dir[0], -other.dir[1]] : way(w);
    underground(sink, mats, choice, new THREE.Vector3(hx, elbowAt, z(zr)), dir, j ? j.tailOD : undefined);
    // Two-hole straps: a saddle round the conduit with a leg back to the face and an ear each side screwed on.
    for (const sy0 of [mid, low]) {
      const sy = sy0 + (k % 2) * 1.4 - 0.37;
      const saddle = new THREE.CylinderGeometry((r + 0.06) * IN, (r + 0.06) * IN, 0.75 * IN, 14, 1, true, -Math.PI / 2, Math.PI);
      if (sz < 0) saddle.rotateY(Math.PI);
      sink.add(mats.strap, saddle.translate(hx * IN, (sy + 0.375) * IN, z(zc) * IN).toNonIndexed());
      for (const s of [-1, 1]) {
        sink.add(mats.strap, bx(0.07, 0.75, zc, hx + s * (r + 0.05), sy, z(zc / 2)));
        sink.add(mats.strap, bx(0.6, 0.75, 0.07, hx + s * (r + 0.36), sy, z(0.035)));
        sink.add(mats.bolt, rod(0.13, new THREE.Vector3(hx + s * (r + 0.4), sy + 0.375, z(0.07)), new THREE.Vector3(hx + s * (r + 0.4), sy + 0.375, z(0.14)), 8));
      }
    }
  }
  // A string light's plug in the lower receptacle; its cord leaves through the opening in the cover's bottom.
  const plug = new THREE.Vector3(devXs[0], centerY - 0.82, z(front + 0.6));
  sink.add(mats.rubber, bx(0.95, 0.95, 0.9, plug.x, plug.y - 0.47, z(front + 0.88)));
  return { plug: new THREE.Vector3(plug.x, plug.y - 0.4, z(front + 1.4)), exit: new THREE.Vector3(plug.x, centerY - cv.h / 2 - 0.1, z(front + 1.4)) };
}

/**
 * Under grade: the stub-up's 90 degree sweep elbow from `from` (the bend's top, local inches) turning along `dir` (a
 * unit vector in the feature's x and z), its horizontal leg at the run's depth, then a short length at the stub-up's
 * size and a coupling ending STUB_TAIL in from the bend's end. The run's conduit (`tailOD`, its outside size; left out,
 * 3/4 in Schedule 40 after a 1 in stub-up, else the stub-up's own) slips into that coupling, through a reducer when the
 * sizes differ; the underground line (plan.utilities) carries on from there.
 */
function underground(sink: MiradorSink, mats: Mats, choice: ReturnType<typeof outletChoice>, from: THREE.Vector3, dir: [number, number], tailOD?: number) {
  const od = PVC_CONDUIT_OD[choice.conduit], r = od / 2, R = PVC_SWEEP_R[choice.conduit];
  const mat = choice.schedule80 ? mats.pvc80 : mats.ug;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2);
    const out = R * (1 - Math.cos(t));
    pts.push(new THREE.Vector3((from.x + dir[0] * out) * IN, (from.y - R * Math.sin(t)) * IN, (from.z + dir[1] * out) * IN));
  }
  sink.under(mat, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r * IN, 12, false).toNonIndexed());
  const end = new THREE.Vector3(from.x + dir[0] * R, from.y - R, from.z + dir[1] * R);
  const at = (d: number) => end.clone().add(new THREE.Vector3(dir[0] * d, 0, dir[1] * d));
  // The elbow's belled end and a short length at the stub-up's size.
  sink.under(mat, rod(r + 0.08, at(0), at(1.4), 14));
  const run = tailOD ?? PVC_CONDUIT_OD[choice.conduit === '1' ? '3/4' : choice.conduit];
  const r2 = PVC_CONDUIT_OD[tradeSizeOf(run)] / 2;
  if (Math.abs(r2 - r) > 0.01) {
    // A reducing coupling from the stub-up's size to the run's, the run's conduit slipping into its far end.
    sink.under(mat, rod(r, at(1.4), at(6), 14));
    sink.under(mats.ug, rod(Math.max(r, r2) + 0.1, at(6), at(7.4), 14));
    sink.under(mats.ug, rod(r2 + 0.09, at(7.4), at(STUB_TAIL), 14));
  } else {
    sink.under(mat, rod(r, at(1.4), at(7.4), 14));
    sink.under(mats.ug, rod(r + 0.09, at(7.4), at(STUB_TAIL), 14));
  }
}

/**
 * The free-standing outlet post: a pressure-treated 4x4, `h` in above grade (its placement's size, else 32 in), cut
 * square, set in concrete, the outlet on its front face with the box's top 3 1/2 in under the post top.
 */
export function buildOutletPost(sink: MiradorSink, spec: FeatureSpec, options: Record<string, boolean> | undefined, own?: [number, number, number], joins?: Map<string, OutletJoin>) {
  const mats = materials();
  const s = OUTLET_POST.size;
  const h = featureSize(spec, own, OUTLET_POST.height * IN)[2] / IN;
  const g = sink.lift(0, 0) / IN;
  sink.add(mats.pt, bx(s, h + 6, s, 0, g - 6, 0));
  const choice = outletChoice((k) => featureOption(spec, options, k));
  const box = FS_BOX[choice.gang];
  outlet(sink, mats, 0, s / 2, 1, g + h - OUTLET_POST.boxDrop - box.h / 2, g, choice, undefined, (k) => joins?.get(`post:${k}`));
}
