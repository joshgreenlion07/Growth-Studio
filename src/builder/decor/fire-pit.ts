import * as THREE from 'three';
import { featureSize } from '../../siteplan/decor';
import { rng } from '../../siteplan/geometry';
import { photoAlbedo } from '../../engine/surfaces';
import { boxUV, pbrMaterial, plainMaterial } from '../materials';
import { lineBurner } from '../fire';
import { box, gfrcCharcoal, IN, mat, type DecorContext } from './kit';

/*
 * The job's custom gas fire pit (plan note: "custom 5' L fire pit, 300,000 BTU"): a low rectangular body of charcoal
 * glass-fiber concrete with softly eased edges, floating on a plinth set in about 3 1/4 in all round. Measured from
 * its photo against the lounge set: 60 x 30 in, 12 1/2 in tall (an 8 1/2 in body on a 4 in plinth). The burner pan
 * is about 65% of the length and 41% of the width (39 x 12 1/2 in), 1 3/4 in deep, filled with reflective fire glass
 * over a 28 in line burner down its middle; the flames stand along the burner, tallest over the middle. At night the
 * glass bed glows and the fire lights the seating.
 * Local x runs along the length.
 */

const PLINTH_H = 4 * IN;
const PAN_DEPTH = 1.75 * IN;

export function firePitLinear(c: DecorContext) {
  const [L, Wd, H] = featureSize(c.spec, c.f.size, 12.5 * IN);
  const inset = Math.min(3.25 * IN, Wd * 0.11);
  const concrete = mat.gfrc();
  const edge = 0.008;
  // Plinth, of the same concrete, toned down for the shade under the body's overhang (the renderer has no occlusion).
  c.add(pbrMaterial('decor:gfrc-shade', gfrcCharcoal(), { color: new THREE.Color(0.66, 0.66, 0.66) }), box(L - 2 * inset, PLINTH_H + 0.01, Wd - 2 * inset, 0, 0, 0));
  // Body: one casting with eased edges, open through the top for the burner pan (the pan floor closes it).
  const Lp = L * 0.65, Wp = Wd * 0.41;
  const yTopSolid = H - PAN_DEPTH;
  c.add(concrete, bodyCasting(L, Wd, H - PLINTH_H, Lp, Wp, edge, PLINTH_H));
  // The pan: a thin steel liner on the opening's walls and floor, a dark ember bed, then the glass.
  const liner = plainMaterial('decor:pan-liner', { color: '#5b544d', roughness: 0.38, metalness: 0.8 });
  const lt = 0.004;
  for (const s of [-1, 1]) {
    c.add(liner, box(Lp, PAN_DEPTH, lt, 0, yTopSolid, s * (Wp / 2 - lt / 2)));
    c.add(liner, box(lt, PAN_DEPTH, Wp, s * (Lp / 2 - lt / 2), yTopSolid, 0));
  }
  const ember = new THREE.MeshStandardMaterial({ color: '#2b2522', emissive: new THREE.Color('#ff7a2e'), emissiveIntensity: 0, roughness: 0.9 });
  c.glow(ember);
  const bedY = yTopSolid + 0.004;
  c.add(ember, box(Lp - 2 * lt, 0.006, Wp - 2 * lt, 0, yTopSolid - 0.002, 0));
  c.add(glassMaterial(), fireGlass(Lp - 2 * lt - 0.006, Wp - 2 * lt - 0.006, bedY, H - bedY - 0.006, `${c.f.id}-glass`));
  // Flame: a line burner down the middle of the pan, 28 in on the 60 in pit (the run the owner measured on the job's pit), scaled with
  // the pit's length on the other sizes. Its flames stand along the whole run, tallest over the middle (about 13 in
  // there, as in the job photo) and lower toward the ends.
  const top = H - 0.012;
  const run = Math.min(Lp - 4 * IN, (28 * IN * L) / (60 * IN));
  c.fire(lineBurner(run, top, 0.38, c.f.id, { across: Math.min(0.025, Wp * 0.08) }));
  c.light(0, H + 0.45, 0, '#ff9a4a', 6.5, 7.5, true);
}

/** A rounded-edge rectangular block w x d x h with a rectangular opening lw x ld through it, base at y. */
function bodyCasting(w: number, d: number, h: number, lw: number, ld: number, r: number, y: number): THREE.BufferGeometry {
  const rect = (hw: number, hd: number) => [new THREE.Vector2(-hw, -hd), new THREE.Vector2(hw, -hd), new THREE.Vector2(hw, hd), new THREE.Vector2(-hw, hd)];
  const shape = new THREE.Shape(rect(w / 2 - r, d / 2 - r));
  shape.holes.push(new THREE.Path(rect(lw / 2 + r, ld / 2 + r).reverse()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y + r, 0);
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  boxUV(out);
  return out;
}

/** Reflective fire glass: clear-silver chips that mirror the sky by day and the flame at night. */
function glassMaterial() {
  return plainMaterial('decor:fire-glass', { color: photoAlbedo('#aca69e'), roughness: 0.12, metalness: 0.85, vertexColors: true });
}

/** Faceted glass chips about 5/8 in in one close layer over a w x d bed, mounded a little toward the middle. */
function fireGlass(w: number, d: number, y: number, room: number, seed: string): THREE.BufferGeometry {
  const r = rng(seed);
  const unit = new THREE.IcosahedronGeometry(1, 0);
  const n0 = unit.getAttribute('position').count;
  const step = 0.0135;
  const nx = Math.max(2, Math.round(w / step)), nz = Math.max(2, Math.round(d / step));
  const count = nx * nz;
  const pos = new Float32Array(count * n0 * 3), nor = new Float32Array(count * n0 * 3), uv = new Float32Array(count * n0 * 2), col = new Float32Array(count * n0 * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), tr = new THREE.Vector3();
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), nm = new THREE.Matrix3();
  const up = unit.getAttribute('position'), un = unit.getAttribute('normal');
  let k = 0;
  for (let layer = 0; layer < 1; layer++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -w / 2 + ((i + 0.5 + (r() - 0.5) * 0.8) / nx) * w;
        const z = -d / 2 + ((j + 0.5 + (r() - 0.5) * 0.8) / nz) * d;
        const mound = 1 - Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2)) ** 4;
        const s = 0.006 + r() * 0.0035;
        const yy = y + s * 0.6 + layer * 0.006 + mound * Math.min(room * 0.35, 0.01);
        e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
        q.setFromEuler(e);
        sc.set(s * (0.9 + r() * 0.5), s * (0.55 + r() * 0.3), s * (0.9 + r() * 0.4));
        tr.set(x, yy, z);
        m.compose(tr, q, sc);
        nm.getNormalMatrix(m);
        // A few chips catch the light brighter; a few read darker in their gaps.
        const tone = r() < 0.15 ? 0.3 + r() * 0.3 : 0.75 + r() * 0.5;
        for (let v = 0; v < n0; v++) {
          p.fromBufferAttribute(up, v).applyMatrix4(m);
          nn.fromBufferAttribute(un, v).applyMatrix3(nm).normalize();
          const o = (k * n0 + v) * 3;
          pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
          nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
          col[o] = col[o + 1] = col[o + 2] = tone;
        }
        k++;
      }
    }
  }
  unit.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * n0 * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, k * n0 * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, k * n0 * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, k * n0 * 3), 3));
  return g;
}
