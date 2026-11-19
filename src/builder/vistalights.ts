import * as THREE from 'three';
import { IN, UP, box, cyl, disc, discDown, lathe, type Ctx } from './landscapelights';
import { VISTA_FINISHES } from '../siteplan/vista';
import type { FinishId } from '../siteplan/truscapes';

/**
 * Vista Professional fixtures (siteplan/vista.ts), drawn to Vista's spec sheets and product photos the way
 * builder/landscapelights.ts draws the Tru-Scapes line: in inches in the fixture's own frame (grade at y = 0 for the
 * staked ones, the cabinet's bottom for the transformer, front toward +z), scaled to meters by `buildFixture`.
 *
 * Vista's powder coat is a fine sand texture (finish chart LT1810, product photos): the finish gets a small grain
 * normal map, so close up it reads textured and from the yard it reads matte.
 */

/* ------------------------------------------------------------------ */
/* Finish and helpers                                                   */

let grainTex: THREE.DataTexture | null = null;

/** A tileable grain normal map: blurred noise, the sand texture of a textured powder coat. Made once, kept. */
function grain(): THREE.DataTexture {
  if (grainTex) return grainTex;
  const N = 128;
  let seed = 0x2500;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let h = new Float32Array(N * N).map(() => rnd());
  // Two wrapped box blurs: grains a few texels across.
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + N) % N) * N + ((x + dx + N) % N)];
        o[y * N + x] = s / 9;
      }
    h = o;
  }
  const data = new Uint8Array(N * N * 4);
  const k = 9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const v = new THREE.Vector3(-dx * k, -dy * k, 1).normalize();
      const i = (y * N + x) * 4;
      data[i] = Math.round((v.x * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((v.y * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((v.z * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  grainTex = t;
  return t;
}

/** The placement's finish as Vista makes it (siteplan/vista.ts VISTA_FINISHES), with its grain. */
function vistaFinish(c: Ctx): THREE.MeshStandardMaterial {
  const id = c.finish.name.replace(/^fixture-/, '') as FinishId;
  const f = VISTA_FINISHES[id];
  if (!f) return c.finish;
  const m = c.m.plain(`vista-${id}`, f.color, f.roughness, f.metalness);
  if (!m.normalMap && f.grain > 0) {
    m.normalMap = grain();
    m.normalScale.set(f.grain, f.grain);
    m.name = `fixture-vista-${id}`;
  }
  return m;
}

/**
 * UVs for the grain, in inches / `tile`: each triangle projected on the plane its face looks along (the grain is
 * noise, so the seams between projections do not show). Returns a non-indexed copy.
 */
function grainUV(g: THREE.BufferGeometry, tile = 0.6): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  const p = ng.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    cc.fromBufferAttribute(p, i + 2);
    n.subVectors(cc, b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = v / tile;
    }
  }
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return ng;
}

/** Flat-faceted copy (machined facets): every triangle its own normal. */
function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return ng;
}

/**
 * A round shroud along +y from y0 whose mouth follows a measured profile: `len(w)` is its length at w, measured across
 * the side view from the long side (w = 0, toward -z: the top of an aimed head) to the short side (w = 1, +z).
 * Outside, inside and the rim.
 */
function profileShroud(r: number, wall: number, y0: number, len: (w: number) => number, seg = 48): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const L = (a: number) => len((1 + Math.cos(a)) / 2);
  const ring = (rad: number, a: number, y: number) => new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, n0: THREE.Vector3, n1: THREE.Vector3) => {
    for (const [p, n] of [[p0, n0], [p1, n1], [p2, n1], [p0, n0], [p2, n1], [p3, n0]] as [THREE.Vector3, THREE.Vector3][]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(0, 0);
    }
  };
  const ri = r - wall;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const n0 = new THREE.Vector3(Math.sin(a0), 0, Math.cos(a0)), n1 = new THREE.Vector3(Math.sin(a1), 0, Math.cos(a1));
    const l0 = y0 + L(a0), l1 = y0 + L(a1);
    quad(ring(r, a0, y0), ring(r, a1, y0), ring(r, a1, l1), ring(r, a0, l0), n0, n1);
    quad(ring(ri, a1, y0), ring(ri, a0, y0), ring(ri, a0, l0), ring(ri, a1, l1), n1.clone().negate(), n0.clone().negate());
    quad(ring(ri, a0, l0), ring(r, a0, l0), ring(r, a1, l1), ring(ri, a1, l1), UP, UP);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Piecewise-linear profile through [w, value] points (w ascending, 0 to 1). */
function piecewise(pts: [number, number][]): (w: number) => number {
  return (w) => {
    if (w <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (w <= pts[i][0]) {
        const [w0, v0] = pts[i - 1], [w1, v1] = pts[i];
        return v0 + ((v1 - v0) * (w - w0)) / Math.max(1e-6, w1 - w0);
      }
    }
    return pts[pts.length - 1][1];
  };
}

/* ------------------------------------------------------------------ */
/* BR-2500 bollard                                                      */

/**
 * BR-2500: a 2-1/8 in round extruded post, a clear machined acrylic column lens over a frosted inner sleeve (it glows
 * at night) and a die-cast cap with a shallow dome, on its ABS ground stake. dims: height, d, capH, dome, lensH, coreD;
 * the ring beam: beamLm, spread, cutoff, range (see siteplan/vista.ts).
 */
export function vistaBollard(c: Ctx) {
  const d = c.spec.dims;
  const fin = vistaFinish(c);
  const R = d.d / 2, H = d.height;
  const capBot = H - d.capH;
  const lensBot = capBot - d.lensH;
  // The ABS stake's rim just showing at grade round the post's foot (the aluminum base and stake are buried).
  const abs = c.m.plain('vista-abs', '#141414', 0.82, 0);
  c.parts.push([abs, lathe([[R + 0.02, -0.12], [R + 0.28, -0.08], [R + 0.3, 0.05], [R + 0.02, 0.09]], 36)]);
  // The post, its top edge eased where the lens sits.
  c.parts.push([fin, grainUV(lathe([[R - 0.001, -0.15], [R, -0.15], [R, lensBot - 0.05], [R - 0.025, lensBot - 0.01]], 48))]);
  // Silicone gaskets at both ends of the lens (dark hairlines).
  const gasket = c.m.plain('vista-gasket', '#0d0d0d', 0.9, 0);
  c.parts.push([gasket, cyl(R - 0.02, 0.05, lensBot - 0.03, 48)]);
  c.parts.push([gasket, cyl(R - 0.02, 0.05, capBot - 0.02, 48)]);
  // The frosted inner sleeve, faceted the way the machined acrylic shows it, with the lamp seat and the cap's
  // reflector at its ends: these glow when lit.
  const coreR = d.coreD / 2;
  const core = c.m.lens(c.tone, 0.5, true);
  c.parts.push([core, faceted(new THREE.CylinderGeometry(coreR, coreR, d.lensH - 0.04, 20, 1, true).translate(0, lensBot + d.lensH / 2, 0))]);
  c.parts.push([core, discDown(coreR, capBot - 0.02, 20)]);
  c.parts.push([c.m.spill(c.tone, '#2a2a2a', 0.12), disc(R - 0.03, lensBot + 0.01, 32)]);
  // The clear acrylic column: a glassy shell over the sleeve.
  c.parts.push([acrylic(c), lathe([[R, lensBot], [R, capBot]], 48)]);
  // The cap: straight side, a rolled edge and a shallow dome (dimension drawing).
  const top = H - d.dome;
  c.parts.push([fin, grainUV(lathe([[R - 0.001, capBot], [R, capBot], [R, top - 0.07], [R - 0.02, top - 0.02], [R - 0.07, top], [R * 0.78, top + d.dome * 0.5], [R * 0.45, top + d.dome * 0.85], [0, H]], 48))]);
  // Light: out and down all round from the middle of the column (a ring beam fitted to Vista's photometrics).
  c.lights.push({
    position: new THREE.Vector3(0, lensBot + d.lensH / 2, 0).multiplyScalar(IN),
    direction: new THREE.Vector3(0, -1, 0),
    beamDeg: d.spread,
    cutoffDeg: d.cutoff,
    lumens: d.beamLm,
    kelvin: c.kelvin,
    ...(c.color ? { color: c.color } : {}),
    range: d.range,
    ring: true,
  });
}

/** Clear machined acrylic: a glassy, mostly see-through shell. */
function acrylic(c: Ctx): THREE.MeshStandardMaterial {
  const m = c.m.plain('vista-acrylic', '#eef3f4', 0.05, 0);
  if (!m.transparent) {
    m.transparent = true;
    m.opacity = 0.24;
    m.depthWrite = false;
    m.name = 'fixture-vista-acrylic';
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* GR-5006 up light                                                     */

/**
 * GR-5006 (5006 with the Infinity Knuckle, on the ABS ground stake): a tapered die-cast rear housing, the screwless
 * locking shroud with its curved mouth, clear tempered glass over the MR-16, and the knuckle: a round arm from the
 * housing to the pivot on a square stem block, its 1/2 in NPT stainless stem in the stake. The head tips about the
 * pivot by the placement's tilt toward +z. dims: d, rearD, housingL, armD, armL, shroudLong, shroudShort, lensIn,
 * blockW, blockH, cutoff, range.
 */
export function vistaUplight(c: Ctx) {
  const d = c.spec.dims;
  const fin = vistaFinish(c);
  const R = d.d / 2, rr = d.rearD / 2, ra = d.armD / 2;
  const abs = c.m.plain('vista-abs', '#141414', 0.82, 0);
  const steel = c.m.plain('vista-stem', '#b8bbbd', 0.3, 1);
  const dark = c.m.plain('vista-gasket', '#0d0d0d', 0.9, 0);
  // The stake's hub at grade (the spike is buried).
  c.parts.push([abs, lathe([[0, -0.1], [1.05, -0.1], [1.05, 0.08], [0.72, 0.16], [0.66, 0.36], [0, 0.36]], 32)]);
  // The stainless stem: a few threads showing above the hub.
  const thread: [number, number][] = [[0.4, 0.34]];
  for (let k = 0; k < 4; k++) thread.push([0.42, 0.37 + k * 0.055], [0.38, 0.395 + k * 0.055]);
  thread.push([0.4, 0.6]);
  c.parts.push([steel, lathe(thread, 20)]);
  // The knuckle's square stem block: a lower block (set screw) and the upper part rounded over the pivot, with the
  // Vista name plate on its side (photo).
  const yb = 0.58, yp = yb + d.blockH, bw = d.blockW;
  c.parts.push([fin, grainUV(box(bw, 0.8, bw, 0, yb, 0, 0.16))]);
  c.parts.push([dark, box(bw - 0.12, 0.06, bw - 0.12, 0, yb + 0.78, 0, 0.1)]);
  c.parts.push([fin, grainUV(box(bw, yp - (yb + 0.83), bw, 0, yb + 0.83, 0, 0.16))]);
  c.parts.push([fin, grainUV(new THREE.CylinderGeometry(bw / 2, bw / 2, bw, 28).rotateZ(Math.PI / 2).translate(0, yp, 0))]);
  c.parts.push([dark, cyl(0.09, 0.04, 0, 12).rotateZ(-Math.PI / 2).translate(bw / 2 + 0.005, yb + 0.4, 0)]);
  c.parts.push([fin, grainUV(box(0.03, 0.62, 0.56, bw / 2 + 0.012, yb + 0.92, 0, 0.012))]);

  // The head, built along +y with the pivot at the origin, then tipped and set on the pivot.
  const head: [THREE.Material, THREE.BufferGeometry][] = [];
  // The knuckle arm: round, from a ball at the pivot to the housing's back, with the pivot screw on its side.
  head.push([fin, grainUV(new THREE.SphereGeometry(ra, 24, 16))]);
  head.push([fin, grainUV(cyl(ra, d.armL + 0.05, 0, 28))]);
  head.push([dark, cyl(0.2, 0.05, 0, 16).rotateZ(Math.PI / 2).translate(-ra + 0.03, 0, 0)]);
  head.push([steel, cyl(0.15, 0.04, 0, 6).rotateZ(Math.PI / 2).translate(-ra, 0, 0)]);
  // Rear housing: a cone from its back (2-3/16 in) to the shroud (2-5/8 in), the back edge eased.
  const y1 = d.armL, j = d.armL + d.housingL;
  head.push([fin, grainUV(lathe([[0, y1], [rr - 0.1, y1], [rr - 0.02, y1 + 0.03], [rr, y1 + 0.1], [R, j - 0.02], [R - 0.03, j]], 40))]);
  // The joint where the shroud twists on, and its locking tab (finish chart photos).
  head.push([dark, cyl(R - 0.03, 0.04, j - 0.01, 40)]);
  head.push([fin, grainUV(box(0.09, 0.2, 0.24, R + 0.03, j - 0.1, 0, 0.02))]);
  // The shroud: 2-7/8 in on top, 1-7/8 in underneath, its mouth in the drawings' soft curve.
  const prof = piecewise([[0, d.shroudLong], [0.41, d.shroudLong - 0.48], [0.56, d.shroudLong - 0.62], [1, d.shroudShort]]);
  head.push([fin, grainUV(lathe([[R - 0.03, j + 0.03], [R, j + 0.06]], 40))]);
  head.push([fin, grainUV(profileShroud(R, 0.075, j + 0.06, (w) => prof(w) - 0.06, 56))]);
  // Inside: the locking ring, then the glass over the lamp's optic.
  const gz = j + d.lensIn;
  head.push([fin, new THREE.RingGeometry(R - 0.2, R - 0.07, 40).rotateX(-Math.PI / 2).translate(0, gz + 0.06, 0)]);
  head.push([c.m.lens(c.tone, 1.3), disc(R - 0.2, gz - 0.01, 36)]);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.tilt);
  const mtx = new THREE.Matrix4().compose(new THREE.Vector3(0, yp, 0), q, new THREE.Vector3(1, 1, 1));
  for (const [mat, g] of head) c.parts.push([mat, g.applyMatrix4(mtx)]);
  // The beam starts at the shroud's mouth, so it never lights the cowl.
  const at = new THREE.Vector3(0, j + d.shroudLong + 0.2, 0).applyMatrix4(mtx).multiplyScalar(IN);
  c.lights.push({
    position: at,
    direction: UP.clone().applyQuaternion(q),
    beamDeg: c.beamDeg,
    cutoffDeg: Math.max(d.cutoff, c.beamDeg * 1.6),
    lumens: c.spec.lumens,
    kelvin: c.kelvin,
    ...(c.color ? { color: c.color } : {}),
    range: d.range,
  });
}

/* ------------------------------------------------------------------ */
/* TCS-300 transformer                                                  */

const labelCache = new Map<string, THREE.MeshStandardMaterial | null>();

/** The black label plate's face, as text on a canvas (the maker's name and model as text only, never its logo). */
function tcsLabel(model: string): THREE.MeshStandardMaterial | null {
  if (labelCache.has(model)) return labelCache.get(model)!;
  let m: THREE.MeshStandardMaterial | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 640;
    const g = cv.getContext('2d');
    if (g) {
      g.fillStyle = '#121212';
      g.fillRect(0, 0, 1024, 640);
      g.strokeStyle = '#d8d8d4';
      g.lineWidth = 6;
      g.strokeRect(22, 22, 980, 596);
      g.fillStyle = '#e8e8e4';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '600 44px Helvetica, Arial, sans-serif';
      g.fillText('VISTA PROFESSIONAL OUTDOOR LIGHTING', 512, 92);
      g.font = '800 200px Helvetica, Arial, sans-serif';
      g.fillText('TCS', 512, 250);
      g.font = '600 40px Helvetica, Arial, sans-serif';
      g.fillText('TRANSFORMER CONTROL SYSTEM', 512, 380);
      g.lineWidth = 5;
      g.strokeRect(150, 430, 330, 84);
      g.strokeRect(544, 430, 330, 84);
      g.font = '700 54px Helvetica, Arial, sans-serif';
      g.fillText(model, 315, 474);
      g.font = '500 30px Helvetica, Arial, sans-serif';
      g.fillText('VISTA PROFESSIONAL OUTDOOR LIGHTING', 512, 566);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0 });
      m.name = 'fixture-vista-label';
    }
  }
  labelCache.set(model, m);
  return m;
}

/**
 * TCS-300: the 20-gauge stainless cabinet with its front door (a shallow lid over the whole front), the black label
 * plate centered high on the door and Vista's mark pressed into its lower left, the stub WiFi antenna on top, the
 * hasp on the right side, louvers and knockouts on the sides, and the mounting flange below at the back. y = 0 is the
 * flange's bottom (the mount height), z = 0 the wall. dims: width, height, cabinetH, depth, door.
 */
export function vistaTransformer(c: Ctx) {
  const d = c.spec.dims;
  const ss = vistaFinish(c);
  const W = d.width, H = d.cabinetH, D = d.depth, dr = d.door;
  const y0 = d.height - d.cabinetH;
  const dark = c.m.plain('vista-gasket', '#0d0d0d', 0.9, 0);
  const seam = c.m.plain('vista-seam', '#4a4b4c', 0.6, 0.4);
  // The back plate's flange below the cabinet, with its screw holes and center slot.
  c.parts.push([ss, box(W - 0.3, y0 + 0.6, 0.06, 0, 0, 0.03, 0.02)]);
  for (const x of [-4, 4]) c.parts.push([dark, new THREE.CircleGeometry(0.11, 14).translate(x, y0 * 0.5, 0.062)]);
  c.parts.push([dark, box(0.46, 0.16, 0.01, 0, y0 * 0.5 - 0.08, 0.062)]);
  // The cabinet behind the door, a hair narrower, and the door over the front.
  c.parts.push([ss, grainUV(box(W - 0.1, H - 0.08, D - dr + 0.06, 0, y0 + 0.04, (D - dr + 0.06) / 2, 0.05), 3)]);
  c.parts.push([ss, grainUV(box(W, H, dr, 0, y0, D - dr / 2, 0.08), 3)]);
  // The label plate: 4 x 2-1/2 in, its top 2 in under the door's top (drawing).
  const lw = 4, lh = 2.5, ly = y0 + H - 2 - lh;
  const plate = c.m.plain('vista-label-plate', '#121212', 0.45, 0);
  c.parts.push([plate, box(lw, lh, 0.02, 0, ly, D + 0.01, 0.01)]);
  const face = tcsLabel(c.spec.model);
  if (face) c.parts.push([face, new THREE.PlaneGeometry(lw - 0.04, lh - 0.04).translate(0, ly + lh / 2, D + 0.022)]);
  // Vista's mark pressed into the door's lower left: a raised rounded square.
  c.parts.push([ss, box(1.9, 1.7, 0.035, -W / 2 + 2.05, y0 + 0.95, D + 0.012, 0.25)]);
  // The stub WiFi antenna on top near the left, a little behind the middle (photo, side drawing).
  const rubber = c.m.plain('vista-antenna', '#161616', 0.75, 0);
  const ax = -W / 2 + 0.8, az = D - 2.7, top = y0 + H;
  c.parts.push([steel(c), cyl(0.24, 0.16, top, 6).translate(ax, 0, az)]);
  c.parts.push([rubber, lathe([[0.17, 0.0], [0.16, 1.2], [0.12, 1.42], [0, 1.5]], 14).translate(ax, top + 0.16, az)]);
  // The hasp on the right side at the door's edge, about halfway up.
  const hy = y0 + 4.2;
  c.parts.push([steel(c), box(0.06, 1.3, 0.9, W / 2 + 0.03, hy, D - dr - 0.1)]);
  c.parts.push([steel(c), new THREE.TorusGeometry(0.22, 0.05, 8, 16).translate(W / 2 + 0.2, hy + 0.65, D - dr - 0.1)]);
  // Two pressed louvers high on each side, and a 1/2-3/4 in knockout low on each side.
  for (const sx of [-1, 1]) {
    for (const k of [0, 1]) c.parts.push([ss, box(0.06, 0.5, 2.3, sx * ((W - 0.1) / 2 + 0.02), top - 1.75 - k * 0.75, (D - dr) / 2 + 0.2, 0.025)]);
    c.parts.push([seam, new THREE.RingGeometry(0.48, 0.56, 24).rotateY((sx * Math.PI) / 2).translate(sx * ((W - 0.1) / 2 + 0.006), y0 + 1.6, (D - dr) / 2)]);
  }
  // The door's hinges on the left side at the seam.
  for (const hy2 of [y0 + 1.2, top - 1.2]) c.parts.push([steel(c), cyl(0.13, 0.9, hy2 - 0.45, 10).translate(-W / 2 - 0.08, 0, D - dr)]);
}

function steel(c: Ctx): THREE.MeshStandardMaterial {
  return c.m.plain('vista-hardware', '#b5b8ba', 0.3, 1);
}
