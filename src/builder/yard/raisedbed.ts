import * as THREE from 'three';
import { featureSize } from '../../siteplan/decor';
import { RAISED_BED } from '../../siteplan/yard';
import type { Vec2 } from '../../siteplan/types';
import { box, IN, prism, rod, swapUV, V, yardMat, type YardContext } from './kit';

/*
 * The free-standing custom cedar raised bed of the raised bed sheet (6 ft L x 3 ft W x 18 in H): 4x4 corner posts
 * (3 1/2 in) flush with the sides, two courses of cedar 2x boards on each side between them (about 8 1/4 in each, so
 * the bed is 18 in with the cap), a flat 2x6 cap (5 1/2 in) mitered at the corners and overhanging the outside 1 in,
 * exterior screws showing at the board ends and the miters, and planting soil 2 in under the cap. Natural western red
 * cedar. Local x along its length, z across, base at y = 0; plants placed in it stand on its soil (decor/planters.ts
 * plantGround).
 */

export function cedarRaisedBed(c: YardContext) {
  const [Wm, Dm, Hm] = featureSize(c.spec, c.f.size, 18 * IN);
  const W = Wm / IN, D = Dm / IN, H = Hm / IN;
  const i = (x: number) => x * IN;
  const cedar = yardMat.cedar(), screw = yardMat.screw();
  const post = 3.5, bd = RAISED_BED.board, capT = 1.5, capW = 5.5, over = 1;
  const wallH = H - capT, course = wallH / 2;
  // Corner posts.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(cedar, swapUV(box(i(post), i(wallH), i(post), sx * i(W / 2 - post / 2), 0, sz * i(D / 2 - post / 2))));
  // Two courses of boards between the posts, outer faces flush with them; a fine line between the courses.
  const heads = (x: number, y: number, z: number, nx: number, nz: number) => {
    for (const dy of [-0.3, 0.3]) c.add(screw, rod(V(i(x), i(y + dy * course), i(z)), V(i(x + nx * 0.06), i(y + dy * course), i(z + nz * 0.06)), i(0.17), 8));
  };
  for (let k = 0; k < 2; k++) {
    const y = k * course + 0.12, h = course - 0.24;
    for (const sz of [-1, 1]) {
      c.add(cedar, box(i(W - 2 * post), i(h), i(bd), 0, i(y), sz * i(D / 2 - bd / 2)));
      for (const sx of [-1, 1]) heads(sx * (W / 2 - post - 1.2), y + h / 2, sz * (D / 2), 0, sz);
    }
    for (const sx of [-1, 1]) {
      c.add(cedar, swapUV(box(i(bd), i(h), i(D - 2 * post), sx * i(W / 2 - bd / 2), i(y), 0)));
      for (const sz of [-1, 1]) heads(sx * (W / 2), y + h / 2, sz * (D / 2 - post - 1.2), sx, 0);
    }
  }
  // Mitered cap, a hair apart at the miters.
  const ox = W / 2 + over, oz = D / 2 + over, ix = ox - capW, iz = oz - capW, g = 0.04;
  const long: Vec2[] = [[-ox + g, oz], [ox - g, oz], [ix - g, iz], [-ix + g, iz]];
  const short: Vec2[] = [[ox, -oz + g], [ox, oz - g], [ix, iz - g], [ix, -iz + g]];
  for (const s of [1, -1]) {
    c.add(cedar, prism(long.map(([x, z]): Vec2 => [i(x), i(s * z)]), i(wallH), i(H)));
    c.add(cedar, swapUV(prism(short.map(([x, z]): Vec2 => [i(s * x), i(z)]), i(wallH), i(H))));
  }
  // Two screws through the cap into each post.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const d of [-0.9, 0.9]) {
    const x = sx * (W / 2 - post / 2) + d * 0.6, z = sz * (D / 2 - post / 2) - d * 0.6;
    c.add(screw, rod(V(i(x), i(H), i(z)), V(i(x), i(H + 0.05), i(z)), i(0.17), 8));
  }
  // The soil, 2 in under the cap, its top a little uneven.
  const soilY = H - RAISED_BED.soilDrop;
  const soil = new THREE.PlaneGeometry(i(W - 2 * bd), i(D - 2 * bd), 24, 12).rotateX(-Math.PI / 2);
  const pos = soil.getAttribute('position') as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    pos.setY(k, i(soilY) + Math.sin(x * 9.1 + z * 3.7) * 0.006 + Math.sin(x * 23 - z * 17) * 0.003);
  }
  const uv = soil.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
  soil.computeVertexNormals();
  c.add(yardMat.bedSoil(), soil.toNonIndexed());
  // The soil's body down to the ground (seen through the gaps at the miters and from above at an angle).
  c.add(yardMat.soil(), box(i(W - 2 * bd - 0.1), i(soilY - 0.5), i(D - 2 * bd - 0.1), 0, 0, 0));
}
