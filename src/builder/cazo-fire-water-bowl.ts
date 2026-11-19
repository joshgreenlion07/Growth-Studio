import * as THREE from 'three';
import { clamp01, fbm, vnoise } from '../engine/noise';
import { mulRGB, paint, textureSet, type RGB } from '../engine/textures';
import { rng } from '../siteplan/geometry';
import { ringBurner, type Tongue } from './fire';
import { boxUV, pbrMaterial, plainMaterial } from './materials';
import { clearFallMaterial, sheetGeometry, splashMaterial, type FountainSink } from './pillarfountain';

/*
 * The Outdoor Plus Cazo Fire & Water Bowl, GFRC concrete, 31 in (OPT-31RFW match lit, OPT-31RFWE12V 12 V electronic),
 * drawn to the maker's spec sheet (theoutdoorplus.com, Cazo Fire & Water Bowl spec sheets) and product page:
 *
 *   Bowl     31 in across, 10 in tall, on a 10 in flat base; a straight conical wall up to a flat-topped rim 3 in wide.
 *   Fire     a 12 in 304 stainless single ring burner centered in a stainless fire pan, under lava rock (included),
 *            65,000 BTU, natural gas or propane. The maker does not give a flame height: it is drawn about 12 in.
 *   Water    a copper scupper set into the rim on one side (local +z), projecting past the outer edge, pouring a smooth
 *            sheet; 7-10 GPM. Its width is not given for this model: the maker lists 8 in for the 31 in Cazo water
 *            bowls, and that is what is drawn. How far it projects is not given: drawn 3 in.
 *   Finish   18 GFRC colors; shown in Natural Gray.
 *
 * The maker does not say how it is installed; the water falls to the surface the bowl stands on. Base at y = 0.
 */

const IN = 0.0254;
const R_BASE = 5, R_OUT = 15.5, R_IN = 12.5, H = 10;
/** Lava rock surface (inches up) and the depth of the scupper's notch in the rim. */
const ROCK_Y = 7.4, NOTCH = 1.0;
const SCUPPER_W = 8, SCUPPER_OUT = 3;

/** GFRC in a natural gray: an even, slightly warm mid gray with soft clouding, sand grain and pinholes. */
const gfrcNaturalGray = () => textureSet('cazo:gfrc-natural-gray', () =>
  paint(512, 0.6, 1.4, (u, v) => {
    const cloud = fbm(u, v, 3, 4, 41);
    const grain = vnoise(u * 300, v * 300, 300, 43);
    const pin = vnoise(u * 220, v * 220, 220, 47) > 0.968 ? 1 : 0;
    let c: RGB = mulRGB([0.36, 0.355, 0.34], 0.93 + clamp01(cloud) * 0.12 + grain * 0.04);
    if (pin) c = mulRGB(c, 0.82);
    return { h: grain * 0.5 - pin * 0.6, c, r: 0.8 + grain * 0.08 };
  }),
);

/** A lathe of the profile (inches: radius, height) over angles a0..a0+len, normals smoothed, UVs in meters. */
function lathe(profile: [number, number][], a0 = 0, len = Math.PI * 2, seg = 64): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * IN, y * IN)), seg, a0, len);
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  boxUV(out);
  return out;
}

/**
 * The bowl. LatheGeometry's angle runs from +z toward +x, so the scupper's notch (at +z) is the sector about angle 0
 * (and 2 pi). The notch's half angle is taken at the middle of the rim.
 */
function bowlParts(concrete: THREE.Material, add: (m: THREE.Material, g: THREE.BufferGeometry) => void) {
  const slope = (R_OUT - R_BASE) / H;
  const yNotch = H - NOTCH, rNotch = R_BASE + slope * yNotch;
  const half = Math.asin(SCUPPER_W / 2 / ((R_IN + R_OUT) / 2)) + 0.02;
  // All round: the base and the outer wall to the notch's floor, and the inside from below it down to the rock.
  add(concrete, lathe([[0.01, 0], [R_BASE - 0.25, 0], [R_BASE + 0.1, 0.25], [rNotch, yNotch]]));
  add(concrete, lathe([[R_IN - 0.25, yNotch], [R_IN - 1.0, ROCK_Y - 0.6], [0.01, ROCK_Y - 0.6]]));
  // Outside the notch: the upper wall, the eased rim and the inner wall down to the notch's floor height.
  const rim: [number, number][] = [[rNotch, yNotch], [R_OUT - 0.08, H - 0.08], [R_OUT - 0.25, H], [R_IN + 0.2, H], [R_IN, H - 0.15], [R_IN - 0.25, yNotch]];
  add(concrete, lathe(rim, half, Math.PI * 2 - 2 * half, 60));
  // The notch: its floor across the rim, and its two cut faces.
  add(concrete, lathe([[rNotch, yNotch], [R_IN - 0.25, yNotch]], -half, 2 * half, 6));
  for (const s of [-1, 1]) {
    const a = s * half;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const pts = [[rNotch, yNotch], [R_OUT - 0.25, H], [R_IN + 0.2, H], [R_IN - 0.25, yNotch]].map(([r, y]) => dir.clone().multiplyScalar(r * IN).setY(y * IN));
    // Both windings, so the cut face shows from either side whichever way the sector runs.
    const face = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3], pts[0], pts[2], pts[1], pts[0], pts[3], pts[2]]);
    face.computeVertexNormals();
    boxUV(face);
    add(concrete, face);
  }
}

/** Lava rock: porous chunks 3/4 to 2 in, black to dark rust, heaped a little over the burner. */
export function lavaRock(radius: number, y: number, seed: string): THREE.BufferGeometry {
  const r = rng(seed);
  const unit = new THREE.DodecahedronGeometry(1, 0).toNonIndexed();
  const up = unit.getAttribute('position'), un = unit.getAttribute('normal');
  const n0 = up.count;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), tr = new THREE.Vector3();
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), nm = new THREE.Matrix3();
  const step = 1.15 * IN;
  for (let layer = 0; layer < 2; layer++) {
    for (let x = -radius; x <= radius; x += step) {
      for (let z = -radius; z <= radius; z += step) {
        const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
        const d = Math.hypot(px, pz) / radius;
        if (d > 0.98) continue;
        const s = (0.38 + r() * 0.5) * IN;
        tr.set(px, y + layer * 0.45 * IN + (1 - d * d) * 0.5 * IN + s * 0.3, pz);
        e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
        q.setFromEuler(e);
        sc.set(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.3), s * (0.8 + r() * 0.4));
        m.compose(tr, q, sc);
        nm.getNormalMatrix(m);
        const tone = r();
        const c: RGB = tone < 0.55 ? [0.05, 0.045, 0.042] : tone < 0.85 ? [0.09, 0.06, 0.05] : [0.16, 0.08, 0.055];
        for (let v = 0; v < n0; v++) {
          p.fromBufferAttribute(up, v).applyMatrix4(m);
          nn.fromBufferAttribute(un, v).applyMatrix3(nm).normalize();
          pos.push(p.x, p.y, p.z);
          nor.push(nn.x, nn.y, nn.z);
          col.push(...c);
        }
      }
    }
  }
  unit.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/**
 * Builds the bowl into the feature's parts. `fire` adds flame tongues and `fireLight` the fire's flickering night light;
 * the water's materials go through `sink` (so the Hand tool can turn it off).
 */
export function cazoFireWaterBowl(sink: FountainSink, fire: (t: Tongue[]) => void, fireLight: (x: number, y: number, z: number, color: string, intensity: number, distance: number) => void, seed: string) {
  const concrete = pbrMaterial('cazo:gfrc', gfrcNaturalGray());
  bowlParts(concrete, sink.add);
  sink.add(plainMaterial('cazo:lava-rock', { color: '#ffffff', roughness: 0.97, vertexColors: true }), lavaRock((R_IN - 1.3) * IN, (ROCK_Y - 0.6) * IN, `${seed}-lava`));
  // The fire: the 12 in ring under the rock.
  const top = (ROCK_Y + 0.6) * IN;
  fire(ringBurner(6 * IN, top, 0.3, seed));
  fireLight(0, H * IN + 0.4, 0, '#ff9a4a', 5, 6);

  // The scupper: a copper channel in the notch, its floor on the notch, its sides up past the rim, out past the wall.
  const copper = plainMaterial('cazo:copper', { color: '#a5653d', roughness: 0.32, metalness: 0.9 });
  const yF = (H - NOTCH) * IN, t = 0.06 * IN;
  const z0 = (R_IN - 1.2) * IN, z1 = (R_OUT + SCUPPER_OUT) * IN, w = SCUPPER_W * IN;
  const plate = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed();
    boxUV(g);
    sink.add(copper, g);
  };
  plate(w, t, z1 - z0, 0, yF + t / 2, (z0 + z1) / 2);
  for (const s of [-1, 1]) plate(t * 1.5, (NOTCH + 0.6) * IN, z1 - z0, s * (w / 2 - t * 0.75), yF + ((NOTCH + 0.6) * IN) / 2, (z0 + z1) / 2);
  // Water: a thin film running along the channel, then a sheet off its lip, landing in a soft splash.
  const water = clearFallMaterial();
  sink.fall(water);
  const film = new THREE.Mesh(new THREE.PlaneGeometry(w - 4 * t, z1 - z0 - 0.01).rotateX(-Math.PI / 2).translate(0, yF + t + 0.003, (z0 + z1) / 2), water);
  film.renderOrder = 3;
  sink.object(film);
  const lip = new THREE.Vector3(0, yF + t + 0.002, z1 + 0.002);
  const sheet = new THREE.Mesh(sheetGeometry(lip, 0.01, w - 6 * t, w * 0.82, 0.5), water);
  sheet.renderOrder = 3;
  sink.object(sheet);
  const land = lip.z + 0.5 * Math.sqrt((2 * lip.y) / 9.81);
  const splash = splashMaterial();
  sink.own(splash);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, 7 * IN).rotateX(-Math.PI / 2), splash);
  foam.position.set(0, 0.012, land);
  foam.renderOrder = 3;
  sink.object(foam);
}
