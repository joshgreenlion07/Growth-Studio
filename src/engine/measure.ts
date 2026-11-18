import * as THREE from 'three';
import type { SceneBuild } from '../builder/build';
import { stepCount } from '../builder/hardscape';
import { featureById, materialById, plantById, sizeAt } from '../siteplan/catalog';
import { centroid, fmtFeet, signedArea } from '../siteplan/geometry';
import type { SitePlan, Vec2 } from '../siteplan/types';
import { OverlayObstacles, insideView } from './overlay';

/**
 * Measurements overlay, in two levels:
 *   totals  the area of each surface, the total length of each wall, fence and
 *           curb run (walls and fences with their height), and the size of
 *           structures and features. Outlines, no edge labels.
 *   edges   all of that plus every straight run labeled, end ticks and lot lines.
 * Dimensions the person drew with the ruler show in both views, named and measured, above everything else.
 *
 * Plant labels (each hand-placed plant's name, height and spread at the current growth year) are a separate
 * switch (setPlants), independent of the level: they can show with the measurements off, and stay hidden with them on.
 *
 * Lines are 3D (drawn on top of everything so grass never hides them); labels
 * are HTML placed over the canvas each frame, nearest and most important first,
 * skipping any that would overlap one already placed, sit under a control drawn over
 * the view, or be cut off by its edge.
 *
 * All labels live in one layer (one composited layer, see .measure-layer in page.html) and
 * are moved by transform and shown or hidden by visibility, never by display: the set of
 * layers drawn over the WebGL canvas stays the same from frame to frame, and no frame needs
 * a new layout.
 */

type LabelKind = 'ruler' | 'area' | 'object' | 'plant' | 'edge' | 'lot';
interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  kind: LabelKind;
  w: number;
  h: number;
  /** Shown in the last placed frame: kept ahead of new ones, so two labels near the limit do not trade places. */
  on: boolean;
  /** Distance to the camera, for this frame's order. */
  d: number;
}

// When labels collide the lower number wins: the person's own dimensions, then areas, then walls, runs and structures, then plants.
const PRIORITY: Record<LabelKind, number> = { ruler: -1, area: 0, object: 1, plant: 2, edge: 3, lot: 4 };
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
    ruler: new THREE.LineBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 1, depthTest: false }),
  };
  private v = new THREE.Vector3();
  private lastPV = new THREE.Matrix4();
  private pv = new THREE.Matrix4();
  private lastW = 0;
  private lastH = 0;
  private placed: number[] = [];
  private order: Label[] = [];
  private shown = false;
  private detail = false;
  private plantsOn = false;
  private obstacles: OverlayObstacles;

  constructor(container: HTMLElement) {
    this.group.name = 'measurements';
    this.group.visible = false;
    this.group.renderOrder = 999;
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer';
    this.layer.hidden = true;
    container.appendChild(this.layer);
    this.obstacles = new OverlayObstacles(container, this.layer);
  }

  /** Anything to draw: measurements, plant labels, or both (rebuild() is needed while this is true). */
  get visible() {
    return this.shown || this.plantsOn;
  }

  get plants() {
    return this.plantsOn;
  }

  /** Show or hide the plant labels, apart from the measurements; call rebuild() after turning them on. */
  setPlants(on: boolean) {
    this.plantsOn = on;
    this.sync();
  }

  private sync() {
    this.lastPV.elements[0] = NaN;
    this.group.visible = this.visible;
    this.layer.hidden = !this.visible;
  }

  get mode(): MeasureMode {
    return !this.shown ? 'off' : this.detail ? 'edges' : 'totals';
  }

  /** Show or hide the overlay; call rebuild() after changing between totals and edges. */
  setMode(mode: MeasureMode) {
    this.shown = mode !== 'off';
    this.detail = mode === 'edges';
    this.sync();
  }

  setVisible(on: boolean) {
    this.setMode(on ? (this.detail ? 'edges' : 'totals') : 'off');
  }

  /** Rebuild every line and label from the plan and the built scene (call after a rebuild or growth change). */
  rebuild(plan: SitePlan, build: SceneBuild, years: number) {
    this.clear();
    const gy = (p: Vec2) => Math.max(0, build.gm.height(p));
    if (this.plantsOn) this.plantLabels(plan, years, gy);
    if (this.shown) this.measurements(plan, build, gy);
    for (const o of this.group.children) o.renderOrder = 999;
  }

  /** Hand-placed plants (not mass-planted fill): name and size at the current growth year. */
  private plantLabels(plan: SitePlan, years: number, gy: (p: Vec2) => number) {
    for (const p of plan.plants) {
      const spec = plantById.get(p.catalogId);
      if (!spec) continue;
      const sz = sizeAt(spec, p.existing ? spec.yearsToMature : years, p.container);
      const k = p.scale ?? 1;
      const h = sz.height * k, s = sz.spread * k;
      this.label(`${spec.name.split(',')[0]}\n${fmtFeet(h)} tall · ${fmtFeet(s)} wide`, new THREE.Vector3(p.position[0], gy(p.position) + h + 0.2, p.position[1]), 'plant');
    }
  }

  /** Areas, edges, walls and runs, structures, features and the person's own rulers. */
  private measurements(plan: SitePlan, build: SceneBuild, gy: (p: Vec2) => number) {

    // Dimensions drawn with the ruler: a line with end ticks, named and measured. Shown in both views.
    for (const r of plan.rulers ?? []) this.ruler(r.a, r.b, r.label, gy);

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
        // A pool set in a raised area is outlined and labeled at its own level.
        const lift = build.pools.byId.get(w.id)?.lift ?? 0;
        this.outline(w.polygon, true, gy, 'edge', lift);
        const c = centroid(w.polygon);
        const kind = w.kind[0].toUpperCase() + w.kind.slice(1);
        this.label(`${kind}\n${sqft(Math.abs(signedArea(w.polygon)))} sq ft · ${fmtFeet(w.depth)} deep`, new THREE.Vector3(c[0], gy(c) + 0.3 + lift, c[1]), 'area');
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
        const inch = (m: number) => { const q = Math.round((m / 0.0254) * 4), w = Math.floor(q / 4), f = ['', '1/4', '1/2', '3/4'][q % 4]; return `${w || !f ? w : ''}${f ? (w ? ' ' : '') + f : ''} in`; };
        const risers = st.full ? `${st.full} riser${st.full === 1 ? '' : 's'} of ${inch(st.r)}${st.last ? ` + 1 of ${inch(st.last)}` : ''}` : `1 riser of ${inch(st.last)}`;
        this.label(`Steps · ${risers}\n${fmtFeet(total)} wide · ${inch(l.height)} rise`, new THREE.Vector3(m[0], gy(m) + l.height + 0.25, m[1]), 'object');
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
      const name = s.kind === 'cover' ? (s.walls?.some((w) => w) ? 'California room' : 'Patio cover') : s.kind[0].toUpperCase() + s.kind.slice(1);
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

  /** A ruler dimension: the line follows the ground, with a tick across each end and the label halfway along. */
  private ruler(a: Vec2, b: Vec2, label: string | undefined, gy: (p: Vec2) => number) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.02) return;
    const steps = Math.max(1, Math.min(40, Math.ceil(len / 0.6)));
    const line: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      line.push(new THREE.Vector3(p[0], gy(p) + LIFT + 0.04, p[1]));
    }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), this.mats.ruler));
    const nx = (-(b[1] - a[1]) / len) * 0.28, nz = ((b[0] - a[0]) / len) * 0.28;
    for (const e of [a, b]) {
      const y = gy(e) + LIFT + 0.04;
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e[0] - nx, y, e[1] - nz), new THREE.Vector3(e[0] + nx, y, e[1] + nz)]);
      this.group.add(new THREE.LineSegments(g, this.mats.ruler));
    }
    const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.label(label ? `${label}\n${fmtFeet(len)}` : fmtFeet(len), new THREE.Vector3(m[0], gy(m) + LIFT + 0.3, m[1]), 'ruler');
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
    el.className = `measure-label ml-${kind}`;
    const [head, ...rest] = text.split('\n');
    el.append(head);
    for (const r of rest) {
      const s = document.createElement('span');
      s.textContent = r;
      el.append(s);
    }
    el.style.visibility = 'hidden';
    this.layer.appendChild(el);
    this.labels.push({ el, pos, kind, w: 0, h: 0, on: false, d: 0 });
    this.lastPV.elements[0] = NaN;
  }

  /** Place labels for this frame (only when the view or the labels changed). */
  update(camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (!this.visible) return;
    // Controls that moved (a panel opened, the window resized) re-place the labels even with the view still.
    const moved = this.obstacles.refresh();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!moved && this.pv.equals(this.lastPV) && width === this.lastW && height === this.lastH) return;
    this.lastPV.copy(this.pv);
    this.lastW = width;
    this.lastH = height;
    const cam = camera.position;
    // Measure new labels (all reads, before any write below). Hidden labels keep their layout, so this is one
    // layout at most, the first frame after labels were added.
    for (const l of this.labels) {
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      l.d = l.pos.distanceTo(cam);
    }
    const order = this.order;
    order.length = 0;
    for (const l of this.labels) order.push(l);
    order.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || Number(b.on) - Number(a.on) || a.d - b.d);
    const placed = this.placed;
    // The controls over the view count as labels already placed, so no label goes under one.
    placed.length = 0;
    for (const n of this.obstacles.rects) placed.push(n);
    for (const l of order) {
      this.v.copy(l.pos).project(camera);
      const far = l.kind === 'edge' ? 45 : l.kind === 'lot' ? 80 : l.kind === 'ruler' ? 250 : 120;
      const x = (this.v.x * 0.5 + 0.5) * width - l.w / 2;
      const y = (-this.v.y * 0.5 + 0.5) * height - l.h / 2;
      // Only whole labels: one that would be cut by the edge of the view is not shown.
      let show = !(this.v.z > 1 || this.v.z < -1 || l.d > far || !l.w) && insideView(x, y, l.w, l.h, width, height);
      if (show) {
        // A label already showing stays until it truly overlaps; a new one needs a little clear space.
        const mx = l.on ? 0 : 6, my = l.on ? 0 : 4;
        for (let i = 0; i < placed.length; i += 4) {
          const px = placed[i], py = placed[i + 1], pw = placed[i + 2], ph = placed[i + 3];
          if (x < px + pw + mx && x + l.w + mx > px && y < py + ph + my && y + l.h + my > py) {
            show = false;
            break;
          }
        }
      }
      if (!show) {
        if (l.on) l.el.style.visibility = 'hidden';
        l.on = false;
        continue;
      }
      placed.push(x, y, l.w, l.h);
      if (!l.on) l.el.style.visibility = '';
      l.on = true;
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
