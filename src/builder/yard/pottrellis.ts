import * as THREE from 'three';
import { TALL_POT } from '../../siteplan/yard';
import { box, IN, yardMat, type YardContext } from './kit';

/*
 * The pot and trellis sheet's planting: a tall square pot tapering in to its foot, smooth matte milk-chocolate brown
 * with a crisp flat rim and a small badge near the foot (24 in tall, 15 in square at the top, 10 1/2 in at the base,
 * read from the sheet's photo with 24 in taken as the height), filled to 1 1/2 in under the rim, with a star jasmine
 * on its 48 in metal trellis planted in the middle (the plant star-jasmine-metal-trellis brings the trellis). Local x
 * across the trellis, +z the front (the side the vine faces), base at y = 0.
 */

/** A square frustum, `b` at the foot to `t` at the top (half widths, m), h tall: its four faces, flat-shaded. */
function frustum(b: number, t: number, y0: number, h: number, inward = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(t * Math.SQRT2, b * Math.SQRT2, h, 4, 1, true).rotateY(Math.PI / 4).translate(0, y0 + h / 2, 0);
  const out = g.toNonIndexed();
  g.dispose();
  if (inward) {
    // Turn the faces inside out (for the inner wall seen over the rim).
    const p = out.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k += 3) {
      const x = p.getX(k + 1), y = p.getY(k + 1), z = p.getZ(k + 1);
      p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2));
      p.setXYZ(k + 2, x, y, z);
    }
  }
  out.computeVertexNormals();
  // UVs in meters round and up, for the fine mottle.
  const p = out.getAttribute('position') as THREE.BufferAttribute, uv = out.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) + p.getZ(k), p.getY(k));
  return out;
}

export function potTrellis(c: YardContext) {
  const P = TALL_POT;
  const i = (x: number) => x * IN;
  const pot = yardMat.pot();
  const T = i(P.top / 2), B = i(P.base / 2), H = i(P.h), w = i(P.wall);
  c.add(pot, frustum(B, T, 0, H));
  // The inside wall under the rim, the rim's flat top, and the soil.
  const soilY = H - i(P.soilDrop);
  const tIn = T - w, bIn = tIn - (T - B) * (i(4) / H);
  c.add(pot, frustum(bIn, tIn, H - i(4), i(4), true));
  for (const s of [-1, 1]) {
    c.add(pot, box(2 * T, i(0.12), w, 0, H - i(0.12), s * (T - w / 2)));
    c.add(pot, box(w, i(0.12), 2 * T - 2 * w, s * (T - w / 2), H - i(0.12), 0));
  }
  const soilHalf = tIn - (T - B) * (i(P.soilDrop) / H);
  c.add(yardMat.bedSoil(), box(2 * soilHalf, 0.01, 2 * soilHalf, 0, soilY - 0.01, 0));
  // The small badge near the foot of the front face, set on its slope.
  const slope = (T - B) / H, yb = i(1.6);
  const badge = box(i(1.3), i(0.45), i(0.06), 0, -i(0.225), 0).rotateX(Math.atan(slope)).translate(0, yb + i(0.225), B + slope * (yb + i(0.225)) + i(0.02));
  c.add(yardMat.badge(), badge);
  // The jasmine on its trellis, facing the pot's front.
  if (c.f.planted !== false) c.plant('star-jasmine-metal-trellis', 0, soilY, 0, 0);
}
