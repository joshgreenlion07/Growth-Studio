import * as THREE from 'three';

/**
 * Soft rings on the ground for double-tap to walk (iPad, walk mode; see Studio.walkToTap): a faint small one where the
 * first tap lands, and a larger one at the destination that widens and fades while the camera glides there.
 */
const RING = new THREE.RingGeometry(0.8, 1, 56).rotateX(-Math.PI / 2);

interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t0: number; dur: number; r0: number; r1: number; a: number }

export class TapMarks {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];

  constructor() {
    this.group.name = 'tap-marks';
  }

  /** A ring on the ground at `at` (its y is the ground): 'hint' for the first tap, 'target' for the destination. */
  show(at: THREE.Vector3, kind: 'hint' | 'target' | 'beacon', now = performance.now(), dur = kind === 'hint' ? 350 : kind === 'beacon' ? 1800 : 1300) {
    const mat = new THREE.MeshBasicMaterial({ color: kind === 'hint' ? 0xf5f2ea : 0xafe414, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(RING, mat);
    mesh.position.set(at.x, at.y + 0.03, at.z);
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    if (kind === 'hint') this.rings.push({ mesh, mat, t0: now, dur, r0: 0.16, r1: 0.26, a: 0.5 });
    // Client mode: a soft pulse under something that can be used (a fire, water, a light, a door).
    else if (kind === 'beacon') this.rings.push({ mesh, mat, t0: now, dur, r0: 0.6, r1: 1.4, a: 0.45 });
    else this.rings.push({ mesh, mat, t0: now, dur, r0: 0.22, r1: 0.5, a: 0.9 });
    this.update(now);
  }

  /** Animate the rings; true while any is still on screen (keep drawing). */
  update(now: number): boolean {
    if (!this.rings.length) return false;
    this.rings = this.rings.filter((r) => {
      const k = (now - r.t0) / r.dur;
      if (k >= 1) {
        this.group.remove(r.mesh);
        r.mat.dispose();
        return false;
      }
      const grow = 1 - Math.pow(1 - Math.max(0, k), 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * grow);
      // Quick in, slow out.
      r.mat.opacity = r.a * Math.min(1, k / 0.12) * (1 - Math.max(0, (k - 0.35) / 0.65));
      return true;
    });
    return true;
  }

  clear() {
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      r.mat.dispose();
    }
    this.rings = [];
  }
}
