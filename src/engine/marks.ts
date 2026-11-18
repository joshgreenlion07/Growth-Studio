import * as THREE from 'three';
import type { Measurements } from './measure';

/**
 * Two quick tools that draw in the 3D world (see app/quicktools.ts for the controller and keys):
 *
 *   Marks  a dirt clod thrown from the camera along an arc to the point at the center of the view, landing as a
 *          small dirt pile with a bright flag and ring, to point things out on the yard. Kept for the session (they
 *          belong to the scene, not to the yard, so a rebuild keeps them and they never cause one). Instanced: one
 *          draw per part however many marks there are.
 *   Tape   a tape measure: point A, then point B, a line between them and the straight distance in feet and inches.
 *
 * Neither casts shadows or touches the plan.
 */

export interface MarkPoint {
  x: number;
  y: number;
  z: number;
}

export const MAX_MARKS = 200;
const DIRT = 0x6b4a2f;
const FLAG = 0xff6a13;
/** How long the landed pile takes to settle, seconds. */
const POP = 0.22;

/** Feet and inches, to the nearest inch: 12 ft 4 in, 8 in. */
export function ftIn(m: number): string {
  const inches = Math.round(Math.abs(m) / 0.0254);
  const f = Math.floor(inches / 12), i = inches % 12;
  if (!f) return `${i} in`;
  return i ? `${f} ft ${i} in` : `${f} ft`;
}

/** A lumpy dome, the pile a thrown clod leaves. */
function pileGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.13 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 7 + y * 9);
    p.setXYZ(i, x * k, y * 0.42 * (1 + 0.15 * Math.sin(a * 5)), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A pennant on the pole's top, in the pole's own space (the pole runs from y = 0 to 1.1). */
function flagGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.1, 0, 0, 0.82, 0, 0.42, 0.96, 0], 3));
  g.computeVertexNormals();
  return g;
}

export class Marks {
  readonly group = new THREE.Group();
  private list: MarkPoint[] = [];
  private piles: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh;
  private flags: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private clod: THREE.Mesh;
  /** The clod in the air (one at a time; a new throw lands the one in flight at once). */
  private flight: { from: THREE.Vector3; to: THREE.Vector3; h: number; t: number; dur: number } | null = null;
  private popT = -1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private e = new THREE.Euler();
  private lastCam = new THREE.Vector3(Infinity, 0, 0);
  /** Called when a mark lands, is removed or the marks are cleared. */
  onChange: (marks: MarkPoint[]) => void = () => {};

  constructor() {
    this.group.name = 'marks';
    const dirt = new THREE.MeshStandardMaterial({ color: DIRT, roughness: 1, metalness: 0 });
    const flag = new THREE.MeshBasicMaterial({ color: FLAG, side: THREE.DoubleSide });
    const pole = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
    const ring = new THREE.MeshBasicMaterial({ color: FLAG, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const ringGeo = new THREE.RingGeometry(0.42, 0.53, 40).rotateX(-Math.PI / 2);
    const poleGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.1, 6).translate(0, 0.55, 0);
    this.piles = new THREE.InstancedMesh(pileGeometry(), dirt, MAX_MARKS);
    this.poles = new THREE.InstancedMesh(poleGeo, pole, MAX_MARKS);
    this.flags = new THREE.InstancedMesh(flagGeometry(), flag, MAX_MARKS);
    this.rings = new THREE.InstancedMesh(ringGeo, ring, MAX_MARKS);
    for (const im of [this.piles, this.poles, this.flags, this.rings]) {
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = im.receiveShadow = false;
      this.group.add(im);
    }
    this.rings.renderOrder = 2;
    const clodGeo = new THREE.IcosahedronGeometry(0.11, 1);
    this.clod = new THREE.Mesh(clodGeo, dirt);
    this.clod.visible = false;
    this.clod.frustumCulled = false;
    this.group.add(this.clod);
  }

  get points(): MarkPoint[] {
    return this.list.map((p) => ({ ...p }));
  }

  get count() {
    return this.list.length;
  }

  /**
   * Set each mark back on the surface under it (after the yard was rebuilt). `heightAt` gives the surface height at a
   * point. True if any mark moved; then onChange reports the marks.
   */
  reground(heightAt: (x: number, z: number) => number): boolean {
    let moved = false;
    for (const p of this.list) {
      const y = heightAt(p.x, p.z);
      if (Math.abs(y - p.y) > 1e-3) {
        p.y = y;
        moved = true;
      }
    }
    if (!moved) return false;
    this.layout(true);
    this.onChange(this.points);
    return true;
  }

  /** Something moves (a clod in the air, a pile settling): keep drawing. */
  get animating() {
    return !!this.flight || this.popT >= 0;
  }

  /** Throw a clod from `from` to land at `to`. */
  throw(from: THREE.Vector3, to: THREE.Vector3) {
    if (this.flight) this.land();
    const d = from.distanceTo(to);
    this.flight = { from: from.clone(), to: to.clone(), h: THREE.MathUtils.clamp(d * 0.16, 0.5, 6), t: 0, dur: THREE.MathUtils.clamp(0.35 + d * 0.018, 0.45, 1.1) };
    this.clod.visible = true;
  }

  /** Take away the newest mark (a clod still in the air is dropped instead). */
  removeLast(): boolean {
    if (this.flight) {
      this.flight = null;
      this.clod.visible = false;
      return true;
    }
    if (!this.list.length) return false;
    this.list.pop();
    this.popT = -1;
    this.layout(true);
    this.onChange(this.points);
    return true;
  }

  clear(): number {
    const n = this.list.length + (this.flight ? 1 : 0);
    this.flight = null;
    this.clod.visible = false;
    this.list.length = 0;
    this.popT = -1;
    this.layout(true);
    if (n) this.onChange([]);
    return n;
  }

  /** Move the clod, settle the newest pile, and keep flags a readable size from afar. True while anything moves. */
  update(dt: number, camera: THREE.Camera): boolean {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      this.p.lerpVectors(f.from, f.to, k);
      this.p.y += 4 * f.h * k * (1 - k);
      this.clod.position.copy(this.p);
      this.clod.rotation.set(f.t * 9, f.t * 5, 0);
      if (k >= 1) this.land();
    }
    let popping = false;
    if (this.popT >= 0) {
      this.popT += dt;
      popping = true;
      if (this.popT >= POP) this.popT = -1;
    }
    // Flags and rings grow with distance (piles stay true size), so a mark across the yard is still seen.
    const camMoved = this.lastCam.distanceToSquared(camera.position) > 1e-4;
    if (camMoved || popping) {
      this.lastCam.copy(camera.position);
      this.layout(false);
    }
    return this.animating;
  }

  private land() {
    const f = this.flight!;
    this.flight = null;
    this.clod.visible = false;
    if (this.list.length >= MAX_MARKS) this.list.shift();
    this.list.push({ x: f.to.x, y: f.to.y, z: f.to.z });
    this.popT = 0;
    this.layout(true);
    this.onChange(this.points);
  }

  private layout(force: boolean) {
    const n = this.list.length;
    const cam = this.lastCam;
    for (const im of [this.piles, this.poles, this.flags, this.rings]) im.count = n;
    if (!n) return;
    if (!force && !isFinite(cam.x)) return;
    for (let i = 0; i < n; i++) {
      const p = this.list[i];
      // The newest pile pops up as it lands.
      const pop = i === n - 1 && this.popT >= 0 ? 0.35 + 0.65 * Math.sin((Math.min(1, this.popT / POP) * Math.PI) / 2) : 1;
      const d = isFinite(cam.x) ? Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z) : 10;
      const big = THREE.MathUtils.clamp(d / 22, 1, 4);
      // Each mark turned its own way, so a row of them does not look stamped.
      this.q.setFromEuler(this.e.set(0, (i * 2.399) % (Math.PI * 2), 0));
      this.p.set(p.x, p.y, p.z);
      this.piles.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.setScalar(pop)));
      this.poles.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(big, big * pop, big)));
      this.flags.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(big, big * pop, big)));
      this.p.y += 0.03;
      this.rings.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(big * pop, 1, big * pop)));
    }
    for (const im of [this.piles, this.poles, this.flags, this.rings]) im.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const im of [this.piles, this.poles, this.flags, this.rings]) {
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
      im.dispose();
    }
    this.clod.geometry.dispose();
  }
}

/** The tape measure: two points and the straight distance between them, drawn over everything. */
export class Tape {
  readonly group = new THREE.Group();
  private a: THREE.Vector3 | null = null;
  private b: THREE.Vector3 | null = null;
  private bar: THREE.Mesh;
  private ends: THREE.Mesh[];
  private label: HTMLDivElement;
  private v = new THREE.Vector3();
  private mid = new THREE.Vector3();

  /** The distance label lives in the measurements' label layer, placed with (and ahead of) its labels. */
  constructor(private measure: Measurements) {
    this.group.name = 'tape';
    this.group.renderOrder = 999;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc94d, depthTest: false, depthWrite: false, transparent: true });
    // A unit bar along +y, stretched and turned between the points.
    this.bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8).translate(0, 0.5, 0), mat);
    const endGeo = new THREE.SphereGeometry(0.07, 12, 8);
    this.ends = [new THREE.Mesh(endGeo, mat), new THREE.Mesh(endGeo, mat)];
    for (const o of [this.bar, ...this.ends]) {
      o.renderOrder = 999;
      o.frustumCulled = false;
      o.visible = false;
      this.group.add(o);
    }
    this.label = document.createElement('div');
    this.label.className = 'measure-label ml-ruler tape-label';
  }

  /** 'a' after the first point, 'b' with the distance after the second; a third starts over. */
  get state(): 'none' | 'a' | 'b' {
    return this.b ? 'b' : this.a ? 'a' : 'none';
  }

  get distance(): number {
    return this.a && this.b ? this.a.distanceTo(this.b) : 0;
  }

  /** The distance as text: straight, and level run and rise when the ground slopes. */
  describe(): string {
    if (!this.a || !this.b) return '';
    const rise = Math.abs(this.b.y - this.a.y);
    const run = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z);
    return rise > 0.15 ? `${ftIn(this.distance)}\n${ftIn(run)} level · ${ftIn(rise)} rise` : ftIn(this.distance);
  }

  drop(p: THREE.Vector3): 'a' | 'b' {
    if (!this.a || this.b) {
      this.a = p.clone();
      this.b = null;
    } else this.b = p.clone();
    this.layout();
    return this.b ? 'b' : 'a';
  }

  clear(): boolean {
    const had = !!this.a;
    this.a = this.b = null;
    this.layout();
    return had;
  }

  private layout() {
    const [ea, eb] = this.ends;
    ea.visible = !!this.a;
    eb.visible = !!this.b;
    this.bar.visible = !!(this.a && this.b);
    if (this.a) ea.position.copy(this.a).y += 0.05;
    if (this.b) eb.position.copy(this.b).y += 0.05;
    if (this.a && this.b) {
      const dir = this.v.subVectors(eb.position, ea.position);
      const len = dir.length();
      this.bar.position.copy(ea.position);
      this.bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.bar.scale.set(1, len, 1);
      const [head, ...rest] = this.describe().split('\n');
      this.label.replaceChildren(head);
      for (const r of rest) {
        const s = document.createElement('span');
        s.textContent = r;
        this.label.append(s);
      }
      this.mid.addVectors(ea.position, eb.position).multiplyScalar(0.5).y += 0.35;
    }
    this.measure.pin(this.label, this.a && this.b ? this.mid : null);
  }

  dispose() {
    this.bar.geometry.dispose();
    this.ends[0].geometry.dispose();
    (this.bar.material as THREE.Material).dispose();
    this.measure.pin(this.label, null);
  }
}
