import * as THREE from 'three';
import { featureOption } from '../../siteplan/catalog';
import { featureSize } from '../../siteplan/decor';
import { INFRATECH_HOUSING as H, infratechFinishOf, infratechModel } from '../../siteplan/infratech';
import { stainless } from '../kitchen/kit';
import { plainMaterial } from '../materials';
import type { DecorContext } from './kit';

/*
 * An Infratech W or WD series heater (siteplan/infratech.ts), drawn to Infratech's W-Series CAD drawing (Aug 1 2024)
 * and the IN038 manual, with the look of Infratech's own product photos:
 *
 *   housing     the trapezoid "W-shaped" body, 8 3/16 in across the open face and 3 in deep: sides rising about 60
 *               degrees, rounded shoulders, a flat back about 3 in wide (the end view, scaled where it is not
 *               dimensioned), brushed 304 stainless or powder coat, a narrow hem round the opening;
 *   reflector   a mirror-bright faceted trough inside, stopping about 3/8 in in from each long edge;
 *   elements    one (W) or two (WD) quartz tubes along the heater, about 4 in shorter than it, ceramic ends; dark warm
 *               gray when off, orange when on (the tubes are about 3/8 in across, a usual quartz lamp size; WD tubes
 *               about 1 1/4 in apart, read from Infratech's photos: neither is published);
 *   guard       the snap-in wire grill: five rods along the heater on ribs that follow the reflector (one rib on the 33
 *               and 39 in, two on the 48 in, three on the 61 1/4 in, as in Infratech's photos);
 *   end bands   a 2 in polished stainless band across the face at each end, wrapping onto the sides, two screws each;
 *               the raised polished INFRATECH badge on the left band, its letters reading across the face (on the
 *               black finish the bands are black and the name is printed white straight on the band);
 *   end plates  trapezoid plates closing the ends, each with a half-round boss on top where the bracket bolts on;
 *   brackets    the standard stainless swivel brackets: a tapered plate at each end, 6 in wide at the ceiling with a
 *               1 in foot, holding the face 9 3/8 in below it; the heater pivots on the top screw of the boss;
 *   back        the 4 x 2 in junction box (top 5 3/8 in from the face, knock-out 4 7/8 in from the right end) on its
 *               tab, a gasketed lid with two screws, and the white rating labels.
 *
 * Local space: x along the heater, z out of its front (the way it is tilted), y up. The heater hangs from the ceiling
 * `c.ceiling` (a cover's roof), else 9 ft, tilted 30 degrees toward +z, the most Infratech allows on a ceiling.
 */

const IN = 0.0254;
const DEFAULT_CEILING = 9 * 12 * IN;
/** The pivot (the boss's top screw), inches above the face in the heater's own frame. */
const PIVOT_Y = 3.95;

type P2 = [number, number];

/** Points along an arc (center c, radius r) from angle a0 to a1, radians, in (z, y). */
function arc(c: P2, r: number, a0: number, a1: number, n: number): P2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as P2;
  });
}

/**
 * The housing's outer profile (z across, y up from the face), from the +z face edge over the back to the -z edge: the
 * sides rise at 60 degrees toward a 3 in back and turn onto it on a 1.3 in radius; `boss` adds the end plate's
 * half-round boss on the back.
 */
function housingProfile(boss = false): P2[] {
  const w = H.faceIn / 2, d = H.depthIn, r = 1.3;
  const k = 1 / Math.tan(Math.PI / 3);
  const corner = w - d * k;
  // A 120 degree corner: the fillet meets each edge r / tan(60) from the corner.
  const t = r / Math.tan(Math.PI / 3);
  const back = corner - t;
  const center: P2 = [back, d - r];
  const right = arc(center, r, Math.PI / 6, Math.PI / 2, 6);
  const out: P2[] = [[w, 0], ...right];
  if (boss) out.push([1.55, d], ...arc([0, d], 1.55, 0, Math.PI, 14), [-1.55, d]);
  const left = right.map(([z, y]) => [-z, y] as P2).reverse();
  out.push(...left, [-w, 0]);
  return out;
}

/** The reflector's facets (z, y), +z edge to -z edge. */
const REFLECTOR: P2[] = [[3.72, 0.1], [3.15, 0.95], [2.45, 1.75], [1.55, 2.4], [0.5, 2.72], [-0.5, 2.72], [-1.55, 2.4], [-2.45, 1.75], [-3.15, 0.95], [-3.72, 0.1]];

/**
 * A strip along x (inches x0..x1) through a (z, y) polyline, its normals toward `side` (+1 the right of the path's
 * travel, outward for a path running over the top from +z to -z; -1 the other way). Smooth normals across bends
 * under 35 degrees. UVs in meters: u along x, v along the path.
 */
function strip(path: P2[], x0: number, x1: number, side: 1 | -1, smooth = true): THREE.BufferGeometry {
  const segN = path.slice(1).map((b, i) => {
    const a = path[i], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1;
    return [(side * dy) / l, (-side * dz) / l] as P2;
  });
  const vn = (i: number, seg: number): P2 => {
    const own = segN[seg];
    if (!smooth) return own;
    const other = i === seg ? segN[seg - 1] : segN[seg + 1];
    if (!other || own[0] * other[0] + own[1] * other[1] < Math.cos((35 * Math.PI) / 180)) return own;
    const z = own[0] + other[0], y = own[1] + other[1], l = Math.hypot(z, y);
    return [z / l, y / l];
  };
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  let v = 0;
  path.slice(1).forEach((b, s) => {
    const a = path[s], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const na = vn(s, s), nb = vn(s + 1, s);
    const P = (x: number, p: P2, n: P2, vv: number) => { pos.push(x * IN, p[1] * IN, p[0] * IN); nor.push(0, n[1], n[0]); uv.push(x * IN, vv * IN); };
    const quad: [number, P2, P2, number][] = [[x0, a, na, v], [x1, a, na, v], [x1, b, nb, v + len], [x0, b, nb, v + len]];
    // Wind each triangle to face its normal.
    const nz = (na[0] + nb[0]) / 2, ny = (na[1] + nb[1]) / 2;
    const e1 = [x1 - x0, 0, 0], e2 = [0, b[1] - a[1], b[0] - a[0]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[1] * ny + cr[2] * nz < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) P(quad[i][0], quad[i][1], quad[i][2], quad[i][3]);
    v += len;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A flat plate of a (z, y) outline, `t` inches thick, its inner face at x = x0 and its outer face at x0 + s * t. */
function endPlate(outline: P2[], x0: number, t: number, s: 1 | -1): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z * IN, y * IN)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t * IN, bevelEnabled: false, curveSegments: 1 });
  // Shape (z, y) extruded along e: rotate so e runs along -x (x = -e, z = shape x), then place it.
  g.rotateY(-Math.PI / 2);
  if (s > 0) g.translate((x0 + t) * IN, 0, 0);
  else g.translate(x0 * IN, 0, 0);
  return g.index ? g.toNonIndexed() : g;
}

/** A box in inches: w (x) x h (y) x d (z), centered on x, z, its bottom at y. */
function bxi(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w * IN, h * IN, d * IN);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return g.toNonIndexed();
}

/** A cylinder in inches along x, centered at (x, y, z). */
function cyx(r: number, len: number, x: number, y: number, z: number, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * IN, r * IN, len * IN, seg);
  g.rotateZ(-Math.PI / 2);
  g.translate(x * IN, y * IN, z * IN);
  return g.toNonIndexed();
}

/** A round wire (radius r inches) through points (x, y, z) in inches: a straight rod each segment, a ball at each bend. */
function wire(points: [number, number, number][], r: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  points.forEach((p, i) => {
    const a = new THREE.Vector3(...p).multiplyScalar(IN);
    if (i > 0 && i < points.length - 1) out.push(new THREE.SphereGeometry(r * IN, 6, 4).translate(a.x, a.y, a.z).toNonIndexed());
    if (i === 0) return;
    const b = new THREE.Vector3(...points[i - 1]).multiplyScalar(IN);
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r * IN, r * IN, d.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    out.push(g.toNonIndexed());
  });
  return out;
}

/** A pan-head screw facing `axis` ('x+', 'x-', 'y+', 'y-'), inches. */
function screw(x: number, y: number, z: number, axis: 'x+' | 'x-' | 'y+' | 'y-', r = 0.12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r * IN, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.55, 1);
  if (axis === 'x+') g.rotateZ(-Math.PI / 2);
  else if (axis === 'x-') g.rotateZ(Math.PI / 2);
  else if (axis === 'y-') g.rotateX(Math.PI);
  g.translate(x * IN, y * IN, z * IN);
  return g.toNonIndexed();
}

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, THREE.Material>();
function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) cache.set(key, (m = make()));
  return m;
}

/*
 * The heater hangs under a roof, facing down, but the studio lights metal with the open sky's reflections (and three
 * applies the scene's environment strength, not a material's own): so its bright metals are drawn with about 0.4 of
 * their reflectance, else, facing the sunlit patio below, they read white. Measured against Infratech's photos.
 */

/** The housing, end plates and brackets: brushed stainless, or the powder coat (a satin, finely textured coat). */
function bodyMaterial(finish: ReturnType<typeof infratechFinishOf>): THREE.Material {
  if (finish.id === 'stainless') {
    return stainless('infratech-ss', '#6d6d6b', 1, 0.7);
  }
  return plainMaterial(`infratech-coat-${finish.id}`, { color: finish.chip, roughness: 0.58, metalness: 0.05 });
}
const polished = () => once('infratech-polished', () => new THREE.MeshPhysicalMaterial({ color: '#8f908f', metalness: 1, roughness: 0.12 }));
const wireMat = () => once('infratech-wire', () => new THREE.MeshPhysicalMaterial({ color: '#959593', metalness: 1, roughness: 0.18 }));
const ceramic = () => plainMaterial('infratech-ceramic', { color: '#e9e4da', roughness: 0.7 });
const label = () => plainMaterial('infratech-label', { color: '#efeeea', roughness: 0.6 });
const gasket = () => plainMaterial('infratech-gasket', { color: '#141414', roughness: 0.8 });
const hole = () => plainMaterial('infratech-hole', { color: '#0d0d0d', roughness: 1 });

/**
 * The INFRATECH name as on the badge: wide-spaced geometric capitals whose A is a crossbar-less triangle with a fade
 * of halftone dots (Infratech's wordmark), black on the polished plate, or white with a clear ground for the black
 * finish. Drawn on a canvas at runtime; null without a document.
 */
function logoMaterial(onBlack: boolean): THREE.Material | null {
  const key = `infratech-logo-${onBlack ? 'white' : 'black'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 216;
  const g = c.getContext('2d');
  if (!g) return null;
  const ink = onBlack ? '#f2f2ef' : '#121212';
  if (!onBlack) {
    g.fillStyle = '#d9dad9';
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = ink;
  const cap = 92;
  g.font = `500 ${Math.round(cap * 1.38)}px "Century Gothic", Futura, "Avenir Next", Montserrat, "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = 'alphabetic';
  const letters = ['I', 'N', 'F', 'R', 'A', 'T', 'E', 'C', 'H'];
  const widthOf = (ch: string) => (ch === 'A' ? cap * 0.92 : g.measureText(ch).width);
  const inked = letters.reduce((s, ch) => s + widthOf(ch), 0);
  // Wide spacing, as on the badge, but the name always fits 90 percent of the plate.
  const gap = Math.min(cap * 0.62, (c.width * 0.9 - inked) / (letters.length - 1));
  const total = inked + gap * (letters.length - 1);
  let x = (c.width - total) / 2;
  const base = c.height / 2 + cap / 2;
  for (const ch of letters) {
    const w = widthOf(ch);
    if (ch === 'A') {
      // A solid triangle, then halftone dots knocked out of its lower right, larger toward the corner.
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x + w / 2, base - cap);
      g.lineTo(x + w, base);
      g.closePath();
      g.fill();
      g.save();
      g.globalCompositeOperation = onBlack ? 'destination-out' : 'source-over';
      g.fillStyle = onBlack ? '#000' : '#d9dad9';
      const step = cap / 7;
      for (let yy = base - step * 0.6; yy > base - cap * 0.75; yy -= step) {
        for (let xx = x + w - step * 0.7; xx > x + w * 0.35; xx -= step) {
          // Inside the triangle, fading out up and to the left.
          const half = ((base - yy) / cap) * (w / 2);
          if (xx < x + half + step * 0.3 || xx > x + w - half - step * 0.3) continue;
          const f = Math.max(0, 1 - ((x + w - xx) / w) * 1.1 - ((base - yy) / cap) * 0.9);
          if (f <= 0.08) continue;
          g.beginPath();
          g.arc(xx, yy, step * 0.42 * f, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
      g.fillStyle = ink;
    } else g.fillText(ch, x, base);
    x += w + gap;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = onBlack
    ? new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.55, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({ map: t, color: '#a2a2a2', roughness: 0.14, metalness: 1 });
  cache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ */
/* The heater                                                           */
/* ------------------------------------------------------------------ */

export function infratechHeater(c: DecorContext) {
  const ceil = c.ceiling ?? DEFAULT_CEILING;
  const [Lm] = featureSize(c.spec, c.f.size, H.mountIn * IN);
  const dual = featureOption(c.spec, c.f.options, 'dual');
  const model = infratechModel(Lm, dual);
  const L = model.lengthIn, hl = L / 2;
  const finish = infratechFinishOf(c.spec.id);
  const black = finish.id === 'black';
  const body = bodyMaterial(finish);
  const band = black ? body : polished();
  const screwMat = black ? plainMaterial('infratech-screw-black', { color: '#1d1c1b', roughness: 0.4, metalness: 0.5 }) : wireMat();

  // The elements' own material: this placement's switch turns its glow on and off, day or night. The reflector is this
  // placement's too: when on it carries the elements' orange, as the real mirror does.
  const lamp = new THREE.MeshPhysicalMaterial({ color: '#4a423c', roughness: 0.28, metalness: 0.15, emissive: new THREE.Color('#ff3c12'), emissiveIntensity: 0 });
  const mirrorMat = new THREE.MeshPhysicalMaterial({ color: '#8a8a88', metalness: 1, roughness: 0.08, side: THREE.DoubleSide, emissive: new THREE.Color('#ff4a1c'), emissiveIntensity: 0 });
  c.own?.(lamp);
  c.own?.(mirrorMat);

  // Parts in the heater's own frame (inches; face at y = 0, face down), turned about the pivot and hung from the ceiling.
  const tilt = (H.tiltDeg * Math.PI) / 180;
  const toLocal = new THREE.Matrix4()
    .makeTranslation(0, ceil - (H.mountIn - PIVOT_Y) * IN, 0)
    .multiply(new THREE.Matrix4().makeRotationX(-tilt))
    .multiply(new THREE.Matrix4().makeTranslation(0, -PIVOT_Y * IN, 0));
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => c.add(m, g.applyMatrix4(toLocal));
  // The brackets stay square to the ceiling: their frame is the heater's untilted one.
  const fixed = new THREE.Matrix4().makeTranslation(0, ceil - H.mountIn * IN, 0);
  const putFixed = (m: THREE.Material, g: THREE.BufferGeometry) => c.add(m, g.applyMatrix4(fixed));

  // Housing between the end plates, the hem round the opening.
  const plateT = 0.06, brT = 0.075;
  const xIn = hl - brT - plateT;
  const prof = housingProfile();
  put(body, strip(prof, -xIn, xIn, 1));
  const w = H.faceIn / 2;
  for (const s of [-1, 1]) put(body, bxi(2 * xIn, 0.04, w - 3.72, 0, 0, s * (w + 3.72) / 2));
  // End plates with the boss.
  const outline = housingProfile(true);
  put(body, endPlate(outline, xIn, plateT, 1));
  put(body, endPlate(outline, -xIn, plateT, -1));

  // Reflector, elements, guard.
  put(mirrorMat, strip(REFLECTOR, -xIn, xIn, -1, false));
  const glowLen = L - 4, tubeY = 1.45, tubeR = 0.19;
  const tubes = dual ? [-0.625, 0.625] : [0];
  for (const z of tubes) {
    put(lamp, cyx(tubeR, glowLen, 0, tubeY, z, 14));
    for (const s of [-1, 1]) {
      put(ceramic(), cyx(0.3, 0.6, s * (glowLen / 2 + 0.3), tubeY, z, 12));
      // The clip holding the tube's end.
      put(wireMat(), bxi(0.12, tubeY - 0.2, 0.5, s * (glowLen / 2 + 0.45), 0.25, z));
    }
  }
  const gx0 = -hl + 2.1, gx1 = hl - 2.1;
  const rib: P2[] = [[3.78, 0.1], [3.65, 0.22], [2.35, 0.72], [-2.35, 0.72], [-3.65, 0.22], [-3.78, 0.1]];
  for (const [z, y] of [rib[1], rib[2], [0, 0.72] as P2, rib[3], rib[4]]) put(wireMat(), cyx(0.05, gx1 - gx0, 0, y, z, 6));
  const ribs = L > 55 ? 3 : L > 42 ? 2 : 1;
  for (let i = 0; i < ribs; i++) {
    const x = gx0 + ((gx1 - gx0) * (i + 1)) / (ribs + 1);
    for (const g of wire(rib.map(([z, y]) => [x, y, z]), 0.055)) put(wireMat(), g);
  }

  // End bands across the face, wrapping 5/8 in up each side, two screws each; the badge on the left one.
  const bw = 2, by = -0.04;
  const side = Math.PI / 3;
  for (const s of [-1, 1]) {
    const bx = s * (xIn + plateT - bw / 2);
    put(band, bxi(bw, 0.04, H.faceIn + 0.08, bx, by, 0));
    for (const e of [-1, 1]) {
      // A strip from the face edge up the side (60 degrees), just outside the housing.
      const g = bxi(bw, 0.04, 0.62, 0, -0.02, e * 0.31);
      g.rotateX(-e * (Math.PI - side));
      g.translate(bx * IN, 0.02 * IN, e * (w + 0.02) * IN);
      put(band, g);
      put(screwMat, screw(s * (xIn - 0.45), by, e * 3.62, 'y-', 0.11));
    }
  }
  const badgeX = -(xIn + plateT - bw / 2);
  const logo = logoMaterial(black);
  if (black) {
    if (logo) put(logo, new THREE.PlaneGeometry(3.4 * IN, 0.72 * IN).rotateX(Math.PI / 2).rotateY(-Math.PI / 2).translate(badgeX * IN, (by - 0.002) * IN, 0).toNonIndexed());
  } else {
    // The raised plate: a rounded tablet with the name on its face.
    const tab = new THREE.Shape();
    const tw = 0.74, tl = 3.4, tr = 0.16;
    tab.moveTo(-tw / 2 + tr, -tl / 2);
    tab.lineTo(tw / 2 - tr, -tl / 2);
    tab.quadraticCurveTo(tw / 2, -tl / 2, tw / 2, -tl / 2 + tr);
    tab.lineTo(tw / 2, tl / 2 - tr);
    tab.quadraticCurveTo(tw / 2, tl / 2, tw / 2 - tr, tl / 2);
    tab.lineTo(-tw / 2 + tr, tl / 2);
    tab.quadraticCurveTo(-tw / 2, tl / 2, -tw / 2, tl / 2 - tr);
    tab.lineTo(-tw / 2, -tl / 2 + tr);
    tab.quadraticCurveTo(-tw / 2, -tl / 2, -tw / 2 + tr, -tl / 2);
    const tg = new THREE.ExtrudeGeometry(tab, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 4 });
    // Shape x along the heater, shape y across the face; extruded downward from the band.
    tg.rotateX(Math.PI / 2);
    tg.scale(IN, IN, IN);
    tg.translate(badgeX * IN, by * IN, 0);
    put(polished(), tg.index ? tg.toNonIndexed() : tg);
    if (logo) put(logo, new THREE.PlaneGeometry(3.3 * IN, 0.66 * IN).rotateX(Math.PI / 2).rotateY(-Math.PI / 2).translate(badgeX * IN, (by - 0.067) * IN, 0).toNonIndexed());
  }

  // Boss screws: the two lower ones outside the bracket (the top one is the pivot, through the bracket).
  for (const s of [-1, 1]) for (const e of [-1, 1]) put(screwMat, screw(s * (xIn + plateT), 3.28, e * 1.12, s > 0 ? 'x+' : 'x-'));

  // Junction box near the right end on its tab, its lid and knock-out; the rating labels.
  const jb = H.box, jx1 = hl - jb.koFromEndIn, jx0 = jx1 - jb.lengthIn, jc = (jx0 + jx1) / 2;
  const jy0 = H.depthIn + 0.35;
  put(body, bxi(jb.lengthIn + 1.6, 0.06, 0.9, jc, H.depthIn - 0.02, 0));
  put(body, bxi(0.06, jy0 - H.depthIn + 0.02, 1.8, jx0 - 0.4, H.depthIn - 0.02, 0));
  put(body, bxi(jb.lengthIn, jb.topIn - jy0 - 0.12, jb.acrossIn, jc, jy0, 0));
  put(gasket(), bxi(jb.lengthIn + 0.08, 0.05, jb.acrossIn + 0.08, jc, jb.topIn - 0.12, 0));
  put(body, bxi(jb.lengthIn, 0.07, jb.acrossIn, jc, jb.topIn - 0.07, 0));
  for (const s of [-1, 1]) put(screwMat, screw(jc + s * (jb.lengthIn / 2 - 0.35), jb.topIn, s * 0.6, 'y+', 0.09));
  const ko = new THREE.CircleGeometry(0.44 * IN, 18).rotateY(Math.PI / 2).translate((jx1 + 0.002) * IN, ((jy0 + jb.topIn) / 2) * IN, 0);
  put(hole(), ko.toNonIndexed());
  const lx = jx0 - 4.2;
  for (const [lw, ld, dx] of [[2.6, 4.6, 0], [1.3, 6.4, -5.9]] as const) {
    if (lx + dx - ld / 2 < -xIn + 1) continue;
    put(label(), new THREE.PlaneGeometry(ld * IN, lw * IN).rotateX(-Math.PI / 2).translate((lx + dx) * IN, (H.depthIn + 0.004) * IN, 0).toNonIndexed());
  }

  // Swivel brackets, square to the ceiling: a tapered plate at each end, its foot flange folded in, two screws up.
  const bracket: P2[] = [[H.footIn / 2, H.mountIn], [-H.footIn / 2, H.mountIn], ...arc([0, PIVOT_Y + 0.05], 1.0, Math.PI + 0.38, 2 * Math.PI - 0.38, 10)];
  // In the fixed frame the face is at y = 0 untilted and the ceiling at y = mountIn.
  const brMat = finish.id === 'stainless' ? stainless('infratech-ss', '#6d6d6b', 1, 0.7) : body;
  for (const s of [-1, 1]) {
    putFixed(brMat, endPlate(bracket, s * (hl - brT), brT, s > 0 ? 1 : -1));
    putFixed(brMat, bxi(H.flangeIn, brT, H.footIn, s * (hl - H.flangeIn / 2), H.mountIn - brT, 0));
    for (const e of [-1, 1]) putFixed(screwMat, screw(s * (hl - 0.5), H.mountIn - brT, e * 1.9, 'y-', 0.15));
    // The pivot screw through the bracket into the boss.
    putFixed(screwMat, screw(s * hl, PIVOT_Y, 0, s > 0 ? 'x+' : 'x-', 0.14));
  }

  // By hand: switch the elements on and off (the placement's 'on' option).
  const on0 = featureOption(c.spec, c.f.options, 'on');
  const glow = 1.9, halo = 0.1;
  const switchTo = (on: boolean) => { lamp.emissiveIntensity = on ? glow : 0; mirrorMat.emissiveIntensity = on ? halo : 0; };
  switchTo(on0);
  const centre = new THREE.Vector3(0, 0, 0).applyMatrix4(toLocal);
  if (c.act && c.anchor) c.act({
    key: 'heat', label: `Heater (${model.model})`, words: ['On', 'Off'], anchors: [c.anchor(centre.x, centre.y, centre.z)], on: on0, planOn: on0, option: 'on',
    set: switchTo,
  });
}
