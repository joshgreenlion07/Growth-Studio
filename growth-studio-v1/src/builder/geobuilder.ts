import * as THREE from 'three';

/** Accumulates vertices with the attributes the foliage shaders expect. */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  birth: number[] = [];
  anchor: number[] = [];
  sway: number[] = [];
  idx: number[] = [];

  get count() {
    return this.pos.length / 3;
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.birth.push(birth);
    this.anchor.push(anchor.x, anchor.y, anchor.z);
    this.sway.push(sway);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aBirth', new THREE.Float32BufferAttribute(this.birth, 1));
    g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(this.anchor, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _t = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();

/**
 * A tapered tube along a polyline of points. Used for trunks, branches,
 * grass stems. `sway(i)` gives the bend weight at point i.
 */
export function tube(
  g: GeoBuilder,
  pts: THREE.Vector3[],
  r0: number,
  r1: number,
  sides: number,
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: (i: number) => number,
  uvScale = 1,
) {
  const rings: number[][] = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    _t.subVectors(b, a).normalize();
    // Any perpendicular basis.
    _b.set(0, 1, 0);
    if (Math.abs(_t.dot(_b)) > 0.9) _b.set(1, 0, 0);
    _n.crossVectors(_t, _b).normalize();
    _b.crossVectors(_n, _t).normalize();
    const r = r0 + (r1 - r0) * (i / (pts.length - 1));
    const ring: number[] = [];
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const nn = new THREE.Vector3().copy(_n).multiplyScalar(nx).addScaledVector(_b, ny);
      _p.copy(pts[i]).addScaledVector(nn, r);
      ring.push(g.vert(_p, nn, (s / sides) * uvScale, (len / (2 * Math.PI * Math.max(r0, 0.01))) * 0.25 * uvScale, color, birth, anchor, sway(i)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      g.quad(rings[i][s], rings[i + 1][s], rings[i + 1][s + 1], rings[i][s + 1]);
    }
  }
}

/**
 * A camera-independent leaf card: a quad of size w x h centered at `c`,
 * oriented by `q`, with normals bent outward from `center` for soft,
 * volumetric canopy shading.
 */
export function card(
  g: GeoBuilder,
  c: THREE.Vector3,
  q: THREE.Quaternion,
  w: number,
  h: number,
  uvRect: [number, number, number, number],
  color: THREE.Color,
  birth: number,
  anchor: THREE.Vector3,
  sway: number,
  center: THREE.Vector3 | null,
  radii: THREE.Vector3 | null,
  normalBend = 0.75,
) {
  const corners: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const uvs: [number, number][] = [[uvRect[0], uvRect[1]], [uvRect[2], uvRect[1]], [uvRect[2], uvRect[3]], [uvRect[0], uvRect[3]]];
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const ids: number[] = [];
  for (let k = 0; k < 4; k++) {
    const p = new THREE.Vector3(corners[k][0] * w, corners[k][1] * h, 0).applyQuaternion(q).add(c);
    let n = face.clone();
    if (center && radii) {
      const o = p.clone().sub(center);
      o.set(o.x / radii.x, o.y / radii.y, o.z / radii.z).normalize();
      n = face.clone().multiplyScalar(1 - normalBend).addScaledVector(o, normalBend).normalize();
    }
    ids.push(g.vert(p, n, uvs[k][0], uvs[k][1], color, birth, anchor, sway));
  }
  g.quad(ids[0], ids[1], ids[2], ids[3]);
}
