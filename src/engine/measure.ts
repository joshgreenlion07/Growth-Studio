import * as THREE from 'three';
import type { SceneBuild } from '../builder/build';
import { stepCount } from '../builder/hardscape';
import { featureById, materialById, plantById, sizeAt } from '../siteplan/catalog';
import { centroid, fmtFeet, signedArea } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';

/**
 * Measurements overlay, in two levels:
 *   totals  the area of each surface, the total length of each wall, fence and
 *           curb run (walls and fences with their height), and the size of
 *           structures, features and hand-placed plants. Outlines, no edge labels.
 *   edges   all of that plus every straight run labeled, end ticks and lot lines.
 *
 * Lines are 3D (drawn on top of everything so grass never hides them); labels
 * are HTML placed over the canvas each frame, nearest and most important first,
 * skipping any that would overlap one already placed.
 */

type LabelKind = 'area' | 'object' | 'plant' | 'edge' | 'lot';
interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  kind: LabelKind;
  w: number;
  h: number;
}

// When labels collide the lower number wins: areas, then walls, runs and structures, then plants.
const PRIORITY: Record<LabelKind, number> = { area: 0, object: 1, plant: 2, edge: 3, lot: 4 };
export type MeasureMode = 'off' | 'totals' | 'edges';
export const MEASURE_MODES: MeasureMode[] = ['off', 'totals', 'edges'];
const LIFT = 0.09; // above hardscape so the lines sit on the surface
const sqft = (m2: number) => Math.round(m2 * 10.7639).toLocaleString('en-US');

export class Measurements {
  readonly group = new THREE.Group();
  private layer: HTMLDivElement;
  private labels: Label[] = [];
  private mats = {
    edge: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }),
    lot: new THREE.LineDashedMaterial({ color: 0xffe9a8, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.85, depthTest: false }),
    tick: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }),
  };
  private v = new THREE.Vector3();
  private shown = false;
  private detail = false;

  constructor(container: HTMLElement) {
    this.group.name = 'measurements';
    this.group.visible = false;
    this.group.renderOrder = 999;
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer';
    this.layer.hidden = true;
    container.appendChild(this.layer);
  }

  get visible() {
    return this.shown;
  }

  get mode(): MeasureMode {
    return !this.shown ? 'off' : this.detail ? 'edges' : 'totals';
  }

  /** Show or hide the overlay; call rebuild() after changing between totals and edges. */
  setMode(mode: MeasureMode) {
    this.shown = mode !== 'off';
    this.detail = mode === 'edges';
    this.group.visible = this.shown;
    this.layer.hidden = !this.shown;
  }

  setVisible(on: boolean) {
    this.setMode(on ? (this.detail ? 'edges' : 'totals') : 'off');
  }

  /** Rebuild every line and label from the plan and the built scene (call after a rebuild or growth change). */
  rebuild(plan: SitePlan, build: SceneBuild, years: number) {
    this.clear();
    const gy = (p: Vec2) => Math.max(0, build.gm.height(p));

    // Lot lines, dashed (every-edge view only).
    if (this.detail && plan.site.boundary.length > 2) this.outline(plan.site.boundary, true, gy, 'lot');

    // Surfaces: edge lengths and area.
    for (const z of plan.zones) {
      if (z.polygon.length < 3) continue;
      this.outline(z.polygon, true, gy, 'edge');
      const c = centroid(z.polygon);
      const name = materialById.get(z.catalogId)?.name.split(',')[0] ?? (z.kind === 'turf' ? 'Lawn' : z.kind === 'bed' ? 'Planting bed' : 'Hardscape');
      const lift = z.raised?.height ?? z.elevation ?? 0;
      const raised = lift > 0 ? ` · raised ${fmtFeet(lift)}` : '';
      this.label(`${name}\n${sqft(Math.abs(signedArea(z.polygon)))} sq ft${raised}`, new THREE.Vector3(c[0], gy(c) + LIFT + lift, c[1]), 'area');
    }

    // Water.
    for (const w of plan.water) {
      if (w.polygon && w.polygon.length > 2) {
        this.outline(w.polygon, true, gy, 'edge');
        const c = centroid(w.polygon);
        const kind = w.kind[0].toUpperCase() + w.kind.slice(1);
        this.label(`${kind}\n${sqft(Math.abs(signedArea(w.polygon)))} sq ft · ${fmtFeet(w.depth)} deep`, new THREE.Vector3(c[0], gy(c) + 0.3, c[1]), 'area');
      } else if (w.points && w.points.length > 1) {
        this.outline(w.points, false, gy, 'edge');
      }
    }

    // Walls, fences, edging: the total length of each run (walls and fences with their height),
    // and in the every-edge view each straight run as well.
    for (const l of plan.lines) {
      if (l.points.length < 2) continue;
      const tall = l.kind !== 'edging' ? l.height : 0;
      this.outline(l.points, false, gy, 'edge', tall);
      let total = 0;
      for (let i = 0; i < l.points.length - 1; i++) total += Math.hypot(l.points[i + 1][0] - l.points[i][0], l.points[i + 1][1] - l.points[i][1]);
      // the label sits halfway along the whole run
      let m: Vec2 = l.points[0], walked = 0;
      for (let i = 0; i < l.points.length - 1; i++) {
        const a = l.points[i], b = l.points[i + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (walked + seg >= total / 2) { const t = seg ? (total / 2 - walked) / seg : 0; m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; break; }
        walked += seg;
      }
      if (l.kind === 'steps') {
        const st = stepCount(l.height, l.riser);
        this.label(`Steps · ${st.n} riser${st.n === 1 ? '' : 's'} of ${fmtFeet(st.r)}\n${fmtFeet(total)} wide · ${fmtFeet(l.height)} rise`, new THREE.Vector3(m[0], gy(m) + l.height + 0.25, m[1]), 'object');
        continue;
      }
      const name = l.kind === 'wall' ? 'Wall' : l.kind === 'fence' ? 'Fence' : (materialById.get(l.catalogId)?.name.split(',')[0] ?? 'Edging');
      const text = tall > 0 ? `${name} · ${fmtFeet(tall)} tall\n${fmtFeet(total)} long` : `${name}\n${fmtFeet(total)} long`;
      this.label(text, new THREE.Vector3(m[0], gy(m) + tall + 0.25, m[1]), 'object');
    }

    // Houses, garages, sheds, covers.
    for (const s of plan.structures) {
      if (s.polygon.length < 3) continue;
      this.outline(s.polygon, true, gy, 'edge');
      const c = centroid(s.polygon);
      const name = s.kind === 'cover' ? 'Patio cover' : s.kind[0].toUpperCase() + s.kind.slice(1);
      this.label(`${name} · ${fmtFeet(s.height)} ${s.kind === 'cover' ? 'clear' : 'walls'}\n${sqft(Math.abs(signedArea(s.polygon)))} sq ft`, new THREE.Vector3(c[0], gy(c) + s.height + 0.6, c[1]), 'object');
    }

    // Features: footprint from the catalog, height from the built model.
    const box = new THREE.Box3();
    for (const f of plan.features) {
      const spec = featureById.get(f.catalogId);
      const obj = build.root.getObjectByName(`feature-${f.id}`);
      if (!spec) continue;
      let top = gy(f.position) + 1;
      let tall = '';
      if (obj) {
        box.setFromObject(obj);
        if (!box.isEmpty()) {
          top = box.max.y;
          tall = ` · ${fmtFeet(box.max.y - box.min.y)} tall`;
        }
      }
      this.footprint(f.position, spec.footprint, f.rotationDeg, gy);
      this.label(`${spec.name.split(',')[0]}\n${fmtFeet(spec.footprint[0])} × ${fmtFeet(spec.footprint[1])}${tall}`, new THREE.Vector3(f.position[0], top + 0.3, f.position[1]), 'object');
    }

    // Hand-placed plants (not mass-planted fill): size at the current growth year.
    for (const p of plan.plants) {
      const spec = plantById.get(p.catalogId);
      if (!spec) continue;
      const sz = sizeAt(spec, p.existing ? spec.yearsToMature : years, p.container);
      const k = p.scale ?? 1;
      const h = sz.height * k, s = sz.spread * k;
      this.label(`${spec.name.split(',')[0]}\n${fmtFeet(h)} tall · ${fmtFeet(s)} wide`, new THREE.Vector3(p.position[0], gy(p.position) + h + 0.2, p.position[1]), 'plant');
    }

    for (const o of this.group.children) o.renderOrder = 999;
  }

  /** Draw a polygon or polyline on the ground with a length on each straight run. */
  private outline(pts: Vec2[], closed: boolean, gy: (p: Vec2) => number, kind: 'edge' | 'lot', raise = 0) {
    const ring = closed ? [...pts, pts[0]] : pts;
    const pos: number[] = [];
    for (const p of ring) pos.push(p[0], gy(p) + LIFT + raise, p[1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.Line(geo, kind === 'lot' ? this.mats.lot : this.mats.edge);
    if (kind === 'lot') line.computeLineDistances();
    this.group.add(line);

    // Join nearly straight segments into runs so a curved bed is not covered in tiny labels.
    const runs: { a: Vec2; b: Vec2; len: number }[] = [];
    let start = 0;
    const dir = (i: number) => Math.atan2(ring[i + 1][1] - ring[i][1], ring[i + 1][0] - ring[i][0]);
    for (let i = 1; i <= ring.length - 1; i++) {
      const bend = i < ring.length - 1 ? Math.abs(Math.atan2(Math.sin(dir(i) - dir(i - 1)), Math.cos(dir(i) - dir(i - 1)))) : Infinity;
      if (bend > 0.21) {
        let len = 0;
        for (let j = start; j < i; j++) len += Math.hypot(ring[j + 1][0] - ring[j][0], ring[j + 1][1] - ring[j][1]);
        runs.push({ a: ring[start], b: ring[i], len });
        start = i;
      }
    }
    // The totals view keeps the outline only; edge lengths and end ticks are for the every-edge view.
    if (!this.detail) return;
    for (const r of runs) {
      if (r.len < 0.9) continue;
      const m: Vec2 = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
      this.label(fmtFeet(r.len), new THREE.Vector3(m[0], gy(m) + LIFT + raise + 0.05, m[1]), kind);
      // Small end ticks across the run.
      const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * 0.18, nz = (dx / L) * 0.18;
      for (const e of [r.a, r.b]) {
        const y = gy(e) + LIFT + raise;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e[0] - nx, y, e[1] - nz), new THREE.Vector3(e[0] + nx, y, e[1] + nz)]);
        this.group.add(new THREE.LineSegments(g, this.mats.tick));
      }
    }
  }

  private footprint(c: Vec2, [w, d]: [number, number], rotDeg: number, gy: (p: Vec2) => number) {
    const a = (rotDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const corner = (x: number, z: number): Vec2 => [c[0] + x * ca - z * sa, c[1] + x * sa + z * ca];
    const pts = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2), corner(-w / 2, -d / 2)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], gy(p) + LIFT, p[1])));
    this.group.add(new THREE.Line(geo, this.mats.edge));
  }

  private label(text: string, pos: THREE.Vector3, kind: LabelKind) {
    const el = document.createElement('div');
    el.className = `measure-label ml-${kind === 'plant' ? 'object' : kind}`;
    const [head, ...rest] = text.split('\n');
    el.append(head);
    for (const r of rest) {
      const s = document.createElement('span');
      s.textContent = r;
      el.append(s);
    }
    this.layer.appendChild(el);
    this.labels.push({ el, pos, kind, w: 0, h: 0 });
  }

  /** Place labels for this frame. */
  update(camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (!this.shown) return;
    const placed: [number, number, number, number][] = [];
    const cam = camera.position;
    const order = this.labels
      .map((l) => ({ l, d: l.pos.distanceTo(cam) }))
      .sort((a, b) => PRIORITY[a.l.kind] - PRIORITY[b.l.kind] || a.d - b.d);
    for (const { l, d } of order) {
      this.v.copy(l.pos).project(camera);
      const far = l.kind === 'edge' ? 45 : l.kind === 'lot' ? 80 : 120;
      if (this.v.z > 1 || this.v.z < -1 || d > far || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) {
        l.el.style.display = 'none';
        continue;
      }
      if (!l.w) {
        l.el.style.display = '';
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      const x = (this.v.x * 0.5 + 0.5) * width - l.w / 2;
      const y = (-this.v.y * 0.5 + 0.5) * height - l.h / 2;
      const hit = placed.some(([px, py, pw, ph]) => x < px + pw + 4 && x + l.w + 4 > px && y < py + ph + 2 && y + l.h + 2 > py);
      if (hit) {
        l.el.style.display = 'none';
        continue;
      }
      placed.push([x, y, l.w, l.h]);
      l.el.style.display = '';
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private clear() {
    for (const o of this.group.children) (o as THREE.Line).geometry?.dispose();
    this.group.clear();
    this.labels = [];
    this.layer.replaceChildren();
  }

  dispose() {
    this.clear();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.layer.remove();
  }
}
