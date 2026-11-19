import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { featureOption, materialById } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import { photoAlbedo } from '../engine/surfaces';
import { catalogMaterial, plainMaterial } from './materials';
import type { DecorContext } from './decor/kit';

/*
 * A veneer column (catalog features `veneer-column-*`): a core of Basalite 225 Lightweight 16 x 8 x 16 column block
 * (15 5/8 in square, 8 in courses), clad in its wall veneer (the look's own thickness with its setting bed: stacked
 * stone 3/4 in on 1/2 in of mortar, stucco 7/8 in), under a Basalite Column Cap, 24 x 24 x 2 in, its edges chiseled,
 * in Sand or Pewter (option `pewterCap`). The placement's size is the cap and the height to the top of the cap.
 *
 * The veneer's texture runs on round the column (u is the distance round its four faces), so the stone courses carry
 * on unbroken past the corners, as the panels' L corners do.
 */

const IN = 0.0254;
const CORE = 15.625 * IN;
const CAP_T = 2 * IN;
/** Basalite's photos of the cap: Sand and Pewter, read as photo colors (the paving calibration turns them to albedo). */
const CAP_SAND = '#ba9a7b';
const CAP_PEWTER = '#7a7a7b';

/** A box of the column's body: w square, from y0 to y1, its side UVs running round the column, in meters. */
function wrappedBody(w: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, y1 - y0, w);
  g.translate(0, (y0 + y1) / 2, 0);
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), nz = n.getZ(i), ny = n.getY(i);
    let u: number, v: number;
    if (Math.abs(ny) > 0.5) [u, v] = [x, z];
    else if (nz > 0.5) [u, v] = [x + w / 2, y];
    else if (nx > 0.5) [u, v] = [w + (w / 2 - z), y];
    else if (nz < -0.5) [u, v] = [2 * w + (w / 2 - x), y];
    else [u, v] = [3 * w + (z + w / 2), y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g.toNonIndexed();
}

export function veneerColumn(c: DecorContext) {
  const [capW, , H] = featureSize(c.spec, c.f.size, 34 * IN);
  const look = materialById.get(c.spec.veneer ?? '');
  const t = (look?.veneer?.thicknessIn ?? 1.25) * IN;
  const W = CORE + 2 * t;
  const up = c.lift ?? 0;
  const top = up + H - CAP_T;
  // The body from just below grade (no seam shows at the ground) to the underside of the cap.
  c.add(look ? catalogMaterial(look.id) : plainMaterial('veneer-column-plain', { color: '#9a948c', roughness: 0.9 }), wrappedBody(W, up - 0.05, top));
  // The cap: a 2 in slab with softly broken (chiseled) edges, a little wider than the body all round.
  const pewter = featureOption(c.spec, c.f.options, 'pewterCap');
  const cap = new RoundedBoxGeometry(capW, CAP_T, capW, 2, 0.006);
  cap.translate(0, top + CAP_T / 2, 0);
  const capMat = plainMaterial(pewter ? 'basalite-column-cap-pewter' : 'basalite-column-cap-sand', { color: photoAlbedo(pewter ? CAP_PEWTER : CAP_SAND), roughness: 0.86 });
  c.add(capMat, cap.toNonIndexed());
}
