import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { SceneBuild } from '../builder/build';
import type { BuildStage } from '../builder/construction';
import { stepCount } from '../builder/hardscape';
import { builtLine } from '../builder/linepath';
import { featureById, materialById, plantById, sizeAt } from '../siteplan/catalog';
import { centroid, fmtFeet, signedArea } from '../siteplan/geometry';
import type { SitePlan, Vec2, Zone } from '../siteplan/types';
import { OverlayObstacles, insideView } from './overlay';

/**
 * Measurements overlay, in two levels:
 *   totals  the area of each surface, the total length of each wall, fence and
 *           curb run (walls and fences with their height), and the size of
 *           structures and features. Outlines, no edge labels.
 *   edges   all of that plus every straight or curved run labeled as a dimension, end ticks and lot lines.
 * Dimensions the person drew with the ruler show in both views, named and measured, above everything else.
 *
 * Plant labels (each hand-placed plant's name, height and spread at the current growth year) are a separate
 * switch (setPlants), independent of the level: they can show with the measurements off, and stay hidden with them on.
 *
 * Every-edge dimensions (and each wall, fence and curb total) belong visibly to what they measure:
 *   - the label sits ON its run: turned along it when the run is near level on screen (up to 30 degrees, never upside
 *     down), level otherwise; if that spot is taken it moves off the run with a short leader back to it, and an area
 *     edge then names its area ("Pavers · 12.5 ft"). A wall, fence or curb always names itself ("Wall 18 in · 35 ft");
 *     an edge two areas share is labeled once with both names.
 *   - it is placed on the part of the run that is on screen (a curve: the point nearest the middle of the view, and
 *     "along curve"), never at a midpoint that may be off screen or behind a wall.
 *   - labeled runs draw bright with end ticks; the rest of the outlines are fainter and fade with distance, and parts
 *     hidden behind walls and buildings show only faintly (one depth-tested pass and one faint pass through).
 *   - a label is dropped when its spot is hidden behind a wall, fence, building or raised bed (a 2D sight test
 *     against their footprints and heights, no raycast), when its run is beyond a distance that grows with the
 *     camera's height, or when its run is under 40 px on screen. The nearest and most important are kept, up to a
 *     limit that scales with the view's size.
 *   - hovering or tapping a label draws its whole run in lime and dims the other labels; a tap on empty space clears it.
 *
 * Lines are 3D: every outline, run and tick is ONE merged LineSegments drawn twice (depth-tested, and faint through
 * everything) whose look per run comes from a small flag texture, so labeling, highlighting and fading never rebuild
 * geometry and the whole overlay is two draw calls. Labels are HTML placed over the canvas each frame, nearest and
 * most important first, skipping any that would overlap one already placed, sit under a control drawn over the view,
 * or be cut off by its edge.
 *
 * All labels live in one layer (one composited layer, see .measure-layer in page.html) and
 * are moved by transform and shown or hidden by visibility, never by display: the set of
 * layers drawn over the WebGL canvas stays the same from frame to frame, and no frame needs
 * a new layout.
 */

type LabelKind = 'ruler' | 'area' | 'object' | 'plant';
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

/** A label tied to a run (or a whole wall, fence or curb line): placed on the part of it that is in view. */
interface Dim {
  el: HTMLDivElement;
  /** The area's name, shown to the left of the length only when the label has to move off its edge. */
  name: HTMLElement | null;
  /** object: a line's two-line total (never turned); edge: one run; lot: one lot line run. */
  kind: 'object' | 'edge' | 'lot';
  /** Runs (geometry ids) drawn bright with it and in lime when it is picked. */
  runs: number[];
  /** The run's path, a few points along it (x, y, z), for the screen work. */
  path: Float32Array;
  curved: boolean;
  /** How much it matters next to others at the same distance. */
  weight: number;
  /** Its own wall, building or raised bed, which never hides it. */
  self: string | null;
  center: THREE.Vector3;
  radius: number;
  w: number;
  h: number;
  nameW: number;
  on: boolean;
  d: number;
  /** Where it was placed this frame (an axis-aligned box, for taps). */
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

/** A wall, fence, building or raised bed: its footprint and top, for the sight test. */
interface Occluder {
  id: string;
  /** x, z, top y per point. */
  p: Float64Array;
  closed: boolean;
  minx: number;
  maxx: number;
  minz: number;
  maxz: number;
  top: number;
}

/** A run found while building, labeled (or not) once every shape is known. */
interface PendingRun {
  pts: Vec2[];
  ys: number[];
  len: number;
  closedLoop: boolean;
  id: number;
  owner: string;
  src: 'zone' | 'water' | 'structure' | 'lot' | 'line';
  name: string;
  weight: number;
}

// When labels collide the lower number wins: the person's own dimensions, then areas, then walls, runs and structures, then plants.
const PRIORITY: Record<LabelKind, number> = { ruler: -1, area: 0, object: 1, plant: 2 };
export type MeasureMode = 'off' | 'totals' | 'edges';
export const MEASURE_MODES: MeasureMode[] = ['off', 'totals', 'edges'];
const LIFT = 0.09; // above hardscape so the lines sit on the surface
const LIME = 0xbfe03a;
/** Flag texture width: run ids are laid out in rows of this many. */
const FW = 512;
/** A run shorter than this on screen gets no label. */
const MIN_PX = 40;
/** Turn a label along its run when the run is at most this steep on screen. */
const TURN_MAX = (30 * Math.PI) / 180;
const sqft = (m2: number) => Math.round(m2 * 10.7639).toLocaleString('en-US');

/** A bed of rock (river rock, pebble, cobble, decomposed granite or gravel), not mulch: it keeps its label while digging. */
function rockBed(z: Zone): boolean {
  const r = materialById.get(z.catalogId)?.recipe;
  return z.kind === 'bed' && (r === 'riverRock' || r === 'blackPebble' || r === 'cobble' || r === 'dg');
}

/** A short name for an area, for edge labels: "Pavers", "Lawn", "Black mulch". */
function zoneShort(z: Zone): string {
  const m = materialById.get(z.catalogId);
  if (z.kind === 'turf') return m?.recipe === 'lawn' ? 'Lawn' : 'Turf';
  if (z.kind === 'hardscape') {
    const r = m?.recipe;
    return r === 'deck' ? 'Deck' : r === 'concrete' ? 'Concrete' : r === 'flagstone' ? 'Flagstone' : 'Pavers';
  }
  const n = (m?.name.split(',')[0] ?? '').replace(/\s*\(.*\)\s*/, '').trim();
  return n && n.length <= 14 ? n : z.kind === 'bed' ? 'Bed' : 'Area';
}

/**
 * Split a polyline into runs at its corners (a turn of more than 12 degrees), so a curved bed or wall is one run,
 * not many tiny ones. A closed ring starts at a corner, so a run never breaks at the drawn first point; a ring with no
 * corner is one run all the way round. Returns point index lists (a closed loop's ends at its start index).
 */
function splitRuns(pts: Vec2[], closed: boolean): number[][] {
  const n = pts.length;
  const corner = (i: number) => {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const d1 = Math.atan2(b[1] - a[1], b[0] - a[0]), d2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    return Math.abs(Math.atan2(Math.sin(d2 - d1), Math.cos(d2 - d1))) > 0.21;
  };
  const cs: number[] = [];
  for (let i = 0; i < n; i++) if ((!closed && (i === 0 || i === n - 1)) || ((closed || (i > 0 && i < n - 1)) && corner(i))) cs.push(i);
  const runs: number[][] = [];
  if (closed) {
    if (!cs.length) {
      const r: number[] = [];
      for (let i = 0; i <= n; i++) r.push(i % n);
      return [r];
    }
    for (let k = 0; k < cs.length; k++) {
      const a = cs[k], b = cs[(k + 1) % cs.length];
      const r: number[] = [];
      for (let i = a; ; i = (i + 1) % n) {
        r.push(i);
        if (r.length > 1 && i === b) break;
      }
      runs.push(r);
    }
    return runs;
  }
  for (let k = 0; k < cs.length - 1; k++) {
    const r: number[] = [];
    for (let i = cs[k]; i <= cs[k + 1]; i++) r.push(i);
    runs.push(r);
  }
  return runs;
}

/** Drop repeated points (and a closed ring's repeated first point). */
function dedupe(pts: Vec2[], closed: boolean): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
  }
  if (closed && out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out;
}

/** Segments by grid cell, to find which outlines lie along a run (shared edges, an area edge under a wall). */
class SegGrid {
  private cells = new Map<number, number[]>();
  private segs: number[] = [];
  private owners: string[] = [];
  private static C = 0.5;
  private key(ix: number, iz: number) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }
  add(pts: Vec2[], closed: boolean, owner: string) {
    const n = pts.length, R = 0.3, C = SegGrid.C;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const s = this.owners.length;
      this.owners.push(owner);
      this.segs.push(a[0], a[1], b[0], b[1]);
      const x0 = Math.floor((Math.min(a[0], b[0]) - R) / C), x1 = Math.floor((Math.max(a[0], b[0]) + R) / C);
      const z0 = Math.floor((Math.min(a[1], b[1]) - R) / C), z1 = Math.floor((Math.max(a[1], b[1]) + R) / C);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) continue;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = this.key(x, z);
        const c = this.cells.get(k);
        if (c) c.push(s);
        else this.cells.set(k, [s]);
      }
    }
  }
  /** Owners with a segment within r of p. */
  near(p: Vec2, r: number, out: Set<string>) {
    out.clear();
    const c = this.cells.get(this.key(Math.floor(p[0] / SegGrid.C), Math.floor(p[1] / SegGrid.C)));
    if (!c) return out;
    for (const s of c) {
      const ax = this.segs[s * 4], az = this.segs[s * 4 + 1], bx = this.segs[s * 4 + 2], bz = this.segs[s * 4 + 3];
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - ax) * ex + (p[1] - az) * ez) / L2)) : 0;
      if (Math.hypot(ax + ex * t - p[0], az + ez * t - p[1]) <= r) out.add(this.owners[s]);
    }
    return out;
  }
}

export class Measurements {
  readonly group = new THREE.Group();
  /** Called when the overlay needs a new frame that the camera check cannot see (a label hovered or picked). */
  onRedraw: () => void = () => {};
  private layer: HTMLDivElement;
  private labels: Label[] = [];
  private dims: Dim[] = [];
  /** Shared by both passes of the run lines: the flag texture, the pick, the fade distance and the lime. */
  private u = {
    uFlags: { value: null as THREE.DataTexture | null },
    uSel: { value: 0 },
    uFar: { value: 40 },
    uLime: { value: new THREE.Color(LIME) },
  };
  private mats = {
    lot: new THREE.LineDashedMaterial({ color: 0xffe9a8, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.85, depthTest: false }),
    ruler: new THREE.LineBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 1, depthTest: false }),
    near: this.runMaterial(false),
    through: this.runMaterial(true),
    pick: new LineMaterial({ color: LIME, linewidth: 3.5, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
  };
  private v = new THREE.Vector3();
  private lastPV = new THREE.Matrix4();
  private pv = new THREE.Matrix4();
  private lastW = 0;
  private lastH = 0;
  private placed: number[] = [];
  private order: Label[] = [];
  private dimOrder: Dim[] = [];
  private shown = false;
  private detail = false;
  private plantsOn = false;
  /** Labels other tools pin in this layer (the tape measure): placed before all others, kept across rebuilds. */
  private pinned = new Map<HTMLElement, Label>();
  private obstacles: OverlayObstacles;
  private gy: (p: Vec2) => number = () => 0;

  // Run lines, gathered while building and merged at the end.
  private gPos: number[] = [];
  private gDim: number[] = [];
  private gKind: number[] = [];
  /** Each run's full path (x, y, z), by run id, for the lime highlight. Id 0 is "no run". */
  private runPts: Float32Array[] = [new Float32Array(0)];
  private flags = new Uint8Array(FW);
  private flagsNext = new Uint8Array(FW);
  private pending: PendingRun[] = [];
  private occ: Occluder[] = [];
  private leaders: HTMLDivElement[] = [];
  private pickLine: LineSegments2 | null = null;
  /** The label picked by a tap (stays) and the one under the mouse (goes when the mouse leaves it). */
  private sel: Dim | null = null;
  private hov: Dim | null = null;
  /** Pieces of the run on screen this frame: sx0, sy0, sx1, sy1, 1/w0, 1/w1, world x0, y0, z0, x1, y1, z1. */
  private pc = new Float64Array(12 * 64);
  private npc = 0;
  /** Time of the last update() that placed labels, ms (for the diagnostics). */
  lastMs = 0;

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

  /**
   * The run lines' material: white, brighter on labeled runs (flag 1) with their end ticks, lime on the picked one
   * (flag 2), the rest fading with distance. `through` is the faint pass drawn through walls and plants.
   */
  private runMaterial(through: boolean) {
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: !through, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u, { uThrough: { value: through ? 1 : 0 } });
      sh.vertexShader =
        'attribute float aDim;\nattribute float aKind;\nuniform sampler2D uFlags;\nvarying float vFlag;\nvarying float vKind;\nvarying float vDist;\n' +
        sh.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          { int id = int(aDim + 0.5); vFlag = texelFetch(uFlags, ivec2(id % ${FW}, id / ${FW}), 0).r * 255.0; }
          vKind = aKind;
          vDist = length(mvPosition.xyz);
          // Pulled a little toward the camera along its own ray: the same place on screen, but it wins over grass
          // blades and the ground between mesh points, while a wall still hides it.
          mvPosition.xyz *= 1.0 - min(0.15, vDist * 0.02) / max(vDist, 0.001);
          gl_Position = projectionMatrix * mvPosition;`,
        );
      sh.fragmentShader =
        'uniform float uSel;\nuniform float uFar;\nuniform float uThrough;\nuniform vec3 uLime;\nvarying float vFlag;\nvarying float vKind;\nvarying float vDist;\n' +
        sh.fragmentShader.replace(
          '#include <opaque_fragment>',
          `float lab = step(0.5, vFlag), pick = step(1.5, vFlag);
          // outline, tick (labeled runs only), lot line (drawn dashed elsewhere; here only when picked)
          float a = vKind < 0.5 ? mix(0.5, 1.0, lab) : vKind < 1.5 ? lab : pick;
          a *= max(mix(1.0, 0.12, smoothstep(uFar * 0.8, uFar * 2.2, vDist)), lab);
          a *= mix(1.0, mix(0.3, 1.0, pick), uSel);
          a *= mix(1.0, mix(0.12, 0.6, pick), uThrough);
          outgoingLight = mix(outgoingLight, uLime, pick);
          diffuseColor.a *= a;
          if (diffuseColor.a < 0.004) discard;
          #include <opaque_fragment>`,
        );
    };
    return m;
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

  /**
   * Show `el` at `pos` in this layer (null takes it away). It goes before every other label, so they keep clear of
   * it, and it stays through rebuilds. Call again after changing its text, so it is measured again.
   */
  pin(el: HTMLDivElement, pos: THREE.Vector3 | null) {
    let l = this.pinned.get(el);
    if (!pos) {
      if (l) {
        this.pinned.delete(el);
        el.remove();
      }
    } else if (!l) {
      l = { el, pos: pos.clone(), kind: 'ruler', w: 0, h: 0, on: false, d: 0 };
      this.pinned.set(el, l);
      el.style.visibility = 'hidden';
      this.layer.appendChild(el);
    } else {
      l.pos.copy(pos);
      l.w = 0;
    }
    this.sync();
  }

  private sync() {
    this.lastPV.elements[0] = NaN;
    this.group.visible = this.visible;
    this.layer.hidden = !this.visible && !this.pinned.size;
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

  /**
   * The build stage shown. Before Finished (the dig stages) only what matters to the dig keeps its label: Melville
   * curb, rock beds, the person's own ruler dimensions, and plants that were already there.
   */
  stage: BuildStage = 'finished';

  /** Rebuild every line and label from the plan and the built scene (call after a rebuild or growth change). */
  rebuild(plan: SitePlan, build: SceneBuild, years: number) {
    this.clear();
    const gy = (p: Vec2) => Math.max(0, build.gm.height(p));
    this.gy = gy;
    if (this.plantsOn) this.plantLabels(plan, years, gy);
    if (this.shown) this.measurements(plan, build, gy);
    this.finishRuns();
    for (const o of this.group.children) if (!o.renderOrder) o.renderOrder = 999;
  }

  /** Hand-placed plants (not mass-planted fill): name and size at the current growth year. */
  private plantLabels(plan: SitePlan, years: number, gy: (p: Vec2) => number) {
    for (const p of plan.plants) {
      if (this.stage !== 'finished' && !p.existing) continue;
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
    const dig = this.stage !== 'finished';
    const grid = new SegGrid();

    // Dimensions drawn with the ruler: a line with end ticks, named and measured. Shown in both views.
    for (const r of plan.rulers ?? []) this.ruler(r.a, r.b, r.label, gy);

    // What hides labels behind it: walls, fences, buildings and raised beds, as footprints with a top.
    for (const [i, l] of plan.lines.entries()) {
      if (l.kind !== 'wall' && l.kind !== 'fence') continue;
      const pts = builtLine(l, plan.zones);
      if (pts.length > 1) this.occluder(`L${i}`, pts, false, l.height, gy);
    }
    for (const [k, s] of plan.structures.entries()) if (s.kind !== 'cover' && s.polygon.length > 2) this.occluder(`S${k}`, s.polygon, true, s.height, gy);
    for (const [j, z] of plan.zones.entries()) if (z.raised && z.polygon.length > 2) this.occluder(`Z${j}`, z.polygon, true, z.raised.height, gy);

    // Lot lines, dashed (every-edge view only).
    if (this.detail && !dig && plan.site.boundary.length > 2) {
      const b = dedupe(plan.site.boundary, true);
      const pos: number[] = [];
      for (const p of [...b, b[0]]) pos.push(p[0], gy(p) + LIFT, p[1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.Line(geo, this.mats.lot);
      line.computeLineDistances();
      this.group.add(line);
      this.runs(b, true, gy, 0, 'lot', 'lot', 'Lot line', 0.5, 2);
    }

    // Surfaces: edge lengths and area.
    for (const [j, z] of plan.zones.entries()) {
      if (z.polygon.length < 3) continue;
      if (dig && !rockBed(z)) continue;
      const c = centroid(z.polygon);
      const name = materialById.get(z.catalogId)?.name.split(',')[0] ?? (z.kind === 'turf' ? 'Lawn' : z.kind === 'bed' ? 'Planting bed' : 'Hardscape');
      const lift = z.raised?.height ?? z.elevation ?? 0;
      const pts = dedupe(z.polygon, true);
      grid.add(pts, true, `Z${j}`);
      this.runs(pts, true, gy, lift, 'zone', `Z${j}`, zoneShort(z), z.kind === 'hardscape' ? 1.3 : 1);
      const raised = lift > 0 ? ` · raised ${fmtFeet(lift)}` : '';
      this.label(`${name}\n${sqft(Math.abs(signedArea(z.polygon)))} sq ft${raised}`, new THREE.Vector3(c[0], gy(c) + LIFT + lift, c[1]), 'area');
    }

    // Water.
    for (const [i, w] of (dig ? [] : plan.water).entries()) {
      const kind = w.kind[0].toUpperCase() + w.kind.slice(1);
      if (w.polygon && w.polygon.length > 2) {
        // A pool set in a raised area is outlined and labeled at its own level.
        const lift = build.pools.byId.get(w.id)?.lift ?? 0;
        this.runs(dedupe(w.polygon, true), true, gy, lift, 'water', `W${i}`, kind, 1.1);
        const c = centroid(w.polygon);
        this.label(`${kind}\n${sqft(Math.abs(signedArea(w.polygon)))} sq ft · ${fmtFeet(w.depth)} deep`, new THREE.Vector3(c[0], gy(c) + 0.3 + lift, c[1]), 'area');
      } else if (w.points && w.points.length > 1) {
        this.runs(dedupe(w.points, false), false, gy, 0, 'water', `W${i}`, kind, 1);
      }
    }

    // Walls, fences, edging: the total length of each run (walls and fences with their height), on the line itself,
    // and in the every-edge view each straight or curved stretch of it as well.
    for (const [i, l] of plan.lines.entries()) {
      if (dig && !(l.kind === 'edging' && materialById.get(l.catalogId)?.recipe === 'curb')) continue;
      // Curbs as built: on the seam they follow, which is where they are measured.
      const pts = dedupe(builtLine(l, plan.zones), false);
      if (pts.length < 2) continue;
      grid.add(pts, false, `L${i}`);
      if (l.points.length > 1) grid.add(l.points, false, `L${i}`);
      const tall = l.kind !== 'edging' ? l.height : 0;
      let total = 0;
      for (let k = 0; k < pts.length - 1; k++) total += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      if (l.kind === 'steps') {
        this.runs(pts, false, gy, tall, 'line', `L${i}`, '', 0, 0);
        // the label sits halfway along the whole run
        let m: Vec2 = pts[0], walked = 0;
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (walked + seg >= total / 2) { const t = seg ? (total / 2 - walked) / seg : 0; m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; break; }
          walked += seg;
        }
        const st = stepCount(l.height, l.riser);
        const inch = (m: number) => { const q = Math.round((m / 0.0254) * 4), w = Math.floor(q / 4), f = ['', '1/4', '1/2', '3/4'][q % 4]; return `${w || !f ? w : ''}${f ? (w ? ' ' : '') + f : ''} in`; };
        const risers = st.full ? `${st.full} riser${st.full === 1 ? '' : 's'} of ${inch(st.r)}${st.last ? ` + 1 of ${inch(st.last)}` : ''}` : `1 riser of ${inch(st.last)}`;
        this.label(`Steps · ${risers}\n${fmtFeet(total)} wide · ${inch(l.height)} rise`, new THREE.Vector3(m[0], gy(m) + l.height + 0.25, m[1]), 'object');
        continue;
      }
      const spec = materialById.get(l.catalogId);
      const name = l.kind === 'wall' ? 'Wall' : l.kind === 'fence' ? 'Fence' : (spec?.name.split(',')[0] ?? 'Edging');
      const short = l.kind === 'wall' || l.kind === 'fence' ? `${name} ${fmtFeet(tall)}` : name.length <= 16 ? name : spec?.recipe === 'curb' ? 'Curb' : 'Edging';
      const first = this.pending.length;
      this.runs(pts, false, gy, tall, 'line', `L${i}`, short, 1.6);
      const mine = this.pending.slice(first);
      const curved = mine.length > 1 || mine.some((r) => this.isCurved(r.pts, r.len));
      const along = mine.length === 1 && curved ? 'along curve' : 'long';
      const text = tall > 0 ? `${name} · ${fmtFeet(tall)} tall\n${fmtFeet(total)} ${along}` : `${name}\n${fmtFeet(total)} ${along}`;
      const path: number[] = [];
      for (const p of pts) path.push(p[0], gy(p) + LIFT + tall + 0.2, p[1]);
      this.dim(text, null, 'object', mine.map((r) => r.id), path, curved, 3, l.kind === 'edging' ? null : `L${i}`);
      // One stretch: the total says it all.
      if (mine.length === 1) mine[0].weight = 0;
    }

    // Houses, garages, sheds, covers.
    for (const [k, s] of (dig ? [] : plan.structures).entries()) {
      if (s.polygon.length < 3) continue;
      const name = s.kind === 'cover' ? (s.room === true || s.walls?.some((w) => w) ? 'California room' : 'Patio cover') : s.kind[0].toUpperCase() + s.kind.slice(1);
      this.runs(dedupe(s.polygon, true), true, gy, 0, 'structure', `S${k}`, s.kind === 'cover' ? 'Cover' : name, 0.7);
      const c = centroid(s.polygon);
      this.label(`${name} · ${fmtFeet(s.height)} ${s.kind === 'cover' ? 'clear' : 'walls'}\n${sqft(Math.abs(signedArea(s.polygon)))} sq ft`, new THREE.Vector3(c[0], gy(c) + s.height + 0.6, c[1]), 'object');
    }

    // Features: footprint from the catalog, height from the built model.
    const box = new THREE.Box3();
    for (const f of dig ? [] : plan.features) {
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

    if (this.detail) this.edgeLabels(plan, grid);
  }

  private occluder(id: string, pts: Vec2[], closed: boolean, height: number, gy: (p: Vec2) => number) {
    const p = new Float64Array(pts.length * 3);
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, top = -Infinity;
    pts.forEach((q, i) => {
      const y = gy(q) + height;
      p[i * 3] = q[0];
      p[i * 3 + 1] = q[1];
      p[i * 3 + 2] = y;
      minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); minz = Math.min(minz, q[1]); maxz = Math.max(maxz, q[1]); top = Math.max(top, y);
    });
    this.occ.push({ id, p, closed, minx: minx - 0.2, maxx: maxx + 0.2, minz: minz - 0.2, maxz: maxz + 0.2, top });
  }

  private isCurved(pts: Vec2[], len: number) {
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1e-6) return true;
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / L);
    return dev > Math.max(0.12, 0.025 * len);
  }

  /**
   * Draw a polygon or polyline's runs into the merged run lines (kind 0 an outline, 2 a lot line drawn only when
   * picked), and note each run for labeling. `weight` 0 draws without a label.
   */
  private runs(pts: Vec2[], closed: boolean, gy: (p: Vec2) => number, raise: number, src: PendingRun['src'], owner: string, name: string, weight: number, kind = 0) {
    if (pts.length < 2) return;
    // Runs get their own id where they may be labeled or picked (the every-edge view, and lines in both views).
    const ided = (this.detail || src === 'line') && weight > 0;
    for (const idx of splitRuns(pts, closed)) {
      const rp = idx.map((i) => pts[i]);
      const ys = rp.map((p) => gy(p) + LIFT + raise);
      let len = 0;
      for (let k = 0; k < rp.length - 1; k++) len += Math.hypot(rp[k + 1][0] - rp[k][0], rp[k + 1][1] - rp[k][1]);
      const id = ided ? this.runPts.length : 0;
      const full = new Float32Array(rp.length * 3);
      rp.forEach((p, k) => full.set([p[0], ys[k], p[1]], k * 3));
      if (id) this.runPts.push(full);
      for (let k = 0; k < rp.length - 1; k++) this.seg(full, k, k + 1, id, kind);
      const closedLoop = closed && idx[0] === idx[idx.length - 1];
      // End ticks across the run, in the every-edge view: square to the run's own end, so a curve's ticks stay true.
      if (this.detail && id && !closedLoop && len >= 0.9) {
        const tick = (e: number, o: number) => {
          const dx = rp[o][0] - rp[e][0], dz = rp[o][1] - rp[e][1], L = Math.hypot(dx, dz) || 1;
          const nx = (-dz / L) * 0.28, nz = (dx / L) * 0.28;
          this.gPos.push(rp[e][0] - nx, ys[e], rp[e][1] - nz, rp[e][0] + nx, ys[e], rp[e][1] + nz);
          this.gDim.push(id, id);
          this.gKind.push(1, 1);
        };
        tick(0, 1);
        tick(rp.length - 1, rp.length - 2);
      }
      if (id) this.pending.push({ pts: rp, ys, len, closedLoop, id, owner, src, name, weight });
    }
  }

  private seg(p: Float32Array, a: number, b: number, id: number, kind: number) {
    this.gPos.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    this.gDim.push(id, id);
    this.gKind.push(kind, kind);
  }

  /**
   * Label the runs, once every outline is known: an area edge under a wall, fence or curb is left to that line's
   * label, an edge two areas share is labeled once with both names, a building or lot edge along anything else is
   * left to that.
   */
  private edgeLabels(plan: SitePlan, grid: SegGrid) {
    const near = new Set<string>();
    const zoneNames = new Map<string, string>();
    for (const [j, z] of plan.zones.entries()) zoneNames.set(`Z${j}`, zoneShort(z));
    for (const r of this.pending) {
      if (r.len < 0.9 || !r.weight) continue;
      // Who lies along the whole run: tested at five points on it.
      let along: Set<string> | null = null;
      let walked = 0, k = 0;
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const target = f * r.len;
        while (k < r.pts.length - 2 && walked + Math.hypot(r.pts[k + 1][0] - r.pts[k][0], r.pts[k + 1][1] - r.pts[k][1]) < target) {
          walked += Math.hypot(r.pts[k + 1][0] - r.pts[k][0], r.pts[k + 1][1] - r.pts[k][1]);
          k++;
        }
        const a = r.pts[k], b = r.pts[k + 1], s = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(1, Math.max(0, (target - walked) / s));
        grid.near([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r.src === 'line' ? 0.05 : 0.22, near);
        if (!along) along = new Set(near);
        else for (const o of along) if (!near.has(o)) along.delete(o);
        if (!along.size) break;
      }
      along?.delete(r.owner);
      const others = along ? [...along] : [];
      const lines = others.filter((o) => o[0] === 'L');
      const zones = others.filter((o) => o[0] === 'Z');
      if (r.src !== 'line' && lines.length) continue;
      if ((r.src === 'structure' || r.src === 'lot') && zones.length) continue;
      let names: string[] = [];
      if (r.src === 'zone') {
        // Shared with an area drawn earlier: that one labels it.
        if (zones.some((o) => +o.slice(1) < +r.owner.slice(1))) continue;
        names = [r.name, ...zones.map((o) => zoneNames.get(o) ?? '')].filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 2);
      }
      const tag = r.closedLoop ? ' around' : this.isCurved(r.pts, r.len) ? ' along curve' : '';
      const len = `${fmtFeet(r.len)}${tag}`;
      // Lines, buildings and lot lines always say what they are; an area edge only when shared or moved off its edge.
      const named = r.src === 'line' || r.src === 'structure' || r.src === 'lot' || names.length > 1;
      const text = !named ? len : `${names.length > 1 ? names.join(' / ') : r.name} · ${len}`;
      const path: number[] = [];
      const n = r.pts.length, step = Math.max(1, Math.ceil((n - 1) / 23));
      for (let i = 0; i < n; i += step) path.push(r.pts[i][0], r.ys[i] + 0.04, r.pts[i][1]);
      if ((n - 1) % step) path.push(r.pts[n - 1][0], r.ys[n - 1] + 0.04, r.pts[n - 1][1]);
      const w = r.weight * (1 + Math.min(r.len, 15) / 30);
      this.dim(text, named ? null : `${r.name} · `, r.src === 'lot' ? 'lot' : 'edge', [r.id], path, r.closedLoop || this.isCurved(r.pts, r.len), w, r.owner);
    }
  }

  private dim(text: string, name: string | null, kind: Dim['kind'], runs: number[], path: number[], curved: boolean, weight: number, self: string | null) {
    const el = document.createElement('div');
    el.className = kind === 'object' ? 'measure-label ml-object ml-dim-total' : `measure-label ml-dim${kind === 'lot' ? ' ml-lot' : ''}`;
    const [head, ...rest] = text.split('\n');
    el.append(head);
    for (const r of rest) {
      const s = document.createElement('span');
      s.textContent = r;
      el.append(s);
    }
    let nm: HTMLElement | null = null;
    if (name) {
      nm = document.createElement('b');
      nm.className = 'ml-name';
      nm.textContent = name;
      nm.style.visibility = 'hidden';
      el.append(nm);
    }
    el.style.visibility = 'hidden';
    this.layer.appendChild(el);
    const p = new Float32Array(path);
    const box = new THREE.Box3();
    for (let i = 0; i < p.length; i += 3) box.expandByPoint(this.v.set(p[i], p[i + 1], p[i + 2]));
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(this.v).length() / 2;
    this.dims.push({ el, name: nm, kind, runs, path: p, curved, weight, self, center, radius, w: 0, h: 0, nameW: 0, on: false, d: 0, bx: 0, by: 0, bw: 0, bh: 0 });
    this.lastPV.elements[0] = NaN;
  }

  /** Merge the run lines into one geometry, drawn twice, and size the flag texture. */
  private finishRuns() {
    const n = this.runPts.length;
    const rows = Math.max(1, Math.ceil(n / FW));
    this.flags = new Uint8Array(FW * rows);
    this.flagsNext = new Uint8Array(FW * rows);
    const tex = new THREE.DataTexture(this.flags, FW, rows, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.u.uFlags.value = tex;
    if (this.gPos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.gPos, 3));
      geo.setAttribute('aDim', new THREE.Float32BufferAttribute(this.gDim, 1));
      geo.setAttribute('aKind', new THREE.Float32BufferAttribute(this.gKind, 1));
      const through = new THREE.LineSegments(geo, this.mats.through);
      through.renderOrder = 998;
      const near = new THREE.LineSegments(geo, this.mats.near);
      near.renderOrder = 999;
      through.frustumCulled = near.frustumCulled = false;
      this.group.add(through, near);
    }
    // Leaders for labels moved off their run: as many as could show at once.
    const want = this.dims.length ? Math.min(this.dims.length, 48) : 0;
    for (let i = 0; i < want; i++) {
      const d = document.createElement('div');
      d.className = 'ml-leader';
      d.style.visibility = 'hidden';
      this.layer.appendChild(d);
      this.leaders.push(d);
    }
    this.gPos = [];
    this.gDim = [];
    this.gKind = [];
    this.pending = [];
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
    const pts = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
    const full = new Float32Array(12);
    pts.forEach((p, i) => full.set([p[0], gy(p) + LIFT, p[1]], i * 3));
    for (let i = 0; i < 4; i++) this.seg(full, i, (i + 1) % 4, 0, 0);
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

  /** The label under a point on the page (client coordinates), if one is showing there. */
  private dimAt(cx: number, cy: number): Dim | null {
    if (this.layer.hidden || !this.dims.length) return null;
    const x = cx - this.obstacles.originX, y = cy - this.obstacles.originY;
    let best: Dim | null = null;
    for (const d of this.dims) {
      // A finger is wider than a pointer: a few pixels of slack round each label.
      if (d.on && x >= d.bx - 4 && x <= d.bx + d.bw + 4 && y >= d.by - 4 && y <= d.by + d.bh + 4) best = d;
    }
    return best;
  }

  /** The mouse moved over the view (null: it left). Returns true when it is over a label. */
  hover(cx: number | null, cy = 0): boolean {
    const d = cx === null ? null : this.dimAt(cx, cy);
    if (d !== this.hov) {
      this.hov = d;
      this.highlight();
    }
    return !!d;
  }

  /** A tap or click on the view: on a label it picks that label's run (again: lets it go) and returns true; elsewhere it lets go. */
  tap(cx: number, cy: number): boolean {
    const d = this.dimAt(cx, cy);
    const next = d && d !== this.sel ? d : null;
    if (next !== this.sel) {
      this.sel = next;
      this.highlight();
    }
    return !!d;
  }

  /** Show the picked (or hovered) run in lime and dim the other labels. Only runs when the pick changes. */
  private highlight() {
    const p = this.hov ?? this.sel;
    for (const d of this.dims) d.el.classList.toggle('ml-sel', d === p);
    this.layer.classList.toggle('ml-has-sel', !!p);
    this.u.uSel.value = p ? 1 : 0;
    if (this.pickLine) {
      this.group.remove(this.pickLine);
      this.pickLine.geometry.dispose();
      this.pickLine = null;
    }
    if (p) {
      const seg: number[] = [];
      for (const id of p.runs) {
        const f = this.runPts[id];
        for (let i = 0; i + 5 < f.length; i += 3) seg.push(f[i], f[i + 1] + 0.02, f[i + 2], f[i + 3], f[i + 4] + 0.02, f[i + 5]);
      }
      if (seg.length) {
        const g = new LineSegmentsGeometry();
        g.setPositions(seg);
        this.pickLine = new LineSegments2(g, this.mats.pick);
        this.pickLine.renderOrder = 1000;
        this.pickLine.frustumCulled = false;
        this.group.add(this.pickLine);
      }
    }
    this.lastPV.elements[0] = NaN;
    this.onRedraw();
  }

  /** Place labels for this frame (only when the view or the labels changed). */
  update(camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (!this.visible && !this.pinned.size) return;
    // Controls that moved (a panel opened, the window resized) re-place the labels even with the view still.
    const moved = this.obstacles.refresh();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!moved && this.pv.equals(this.lastPV) && width === this.lastW && height === this.lastH) return;
    const t0 = performance.now();
    this.lastPV.copy(this.pv);
    this.lastW = width;
    this.lastH = height;
    const cam = camera.position;
    // Measure new labels (all reads, before any write below). Hidden labels keep their layout, so this is one
    // layout at most, the first frame after labels were added.
    for (const l of [...this.pinned.values(), ...this.labels]) {
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      l.d = l.pos.distanceTo(cam);
    }
    for (const d of this.dims) {
      if (!d.w) {
        d.w = d.el.offsetWidth;
        d.h = d.el.offsetHeight;
        d.nameW = d.name ? d.name.offsetWidth : 0;
      }
    }
    const order = this.order;
    order.length = 0;
    if (this.visible) for (const l of this.labels) order.push(l);
    else for (const l of this.labels) if (l.on) {
      // Measurements and plant labels off, a pinned label still shown: their labels go.
      l.el.style.visibility = 'hidden';
      l.on = false;
    }
    order.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || Number(b.on) - Number(a.on) || a.d - b.d);
    // Pinned labels (the tape measure) are placed first, so the others keep clear of them.
    order.unshift(...this.pinned.values());
    const placed = this.placed;
    // The controls over the view count as labels already placed, so no label goes under one.
    placed.length = 0;
    for (const n of this.obstacles.rects) placed.push(n);
    for (const l of order) {
      this.v.copy(l.pos).project(camera);
      const far = l.kind === 'ruler' ? 250 : 120;
      const x = (this.v.x * 0.5 + 0.5) * width - l.w / 2;
      const y = (-this.v.y * 0.5 + 0.5) * height - l.h / 2;
      // Only whole labels: one that would be cut by the edge of the view is not shown.
      const show = !(this.v.z > 1 || this.v.z < -1 || l.d > far || !l.w) && insideView(x, y, l.w, l.h, width, height) && this.free(x, y, l.w, l.h, l.on);
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
    this.placeDims(camera, width, height);
    this.lastMs = performance.now() - t0;
  }

  /** True if a box at x, y of w × h overlaps nothing placed (a label already showing needs no extra clear space). */
  private free(x: number, y: number, w: number, h: number, on: boolean) {
    const placed = this.placed;
    const mx = on ? 0 : 6, my = on ? 0 : 4;
    for (let i = 0; i < placed.length; i += 4) {
      const px = placed[i], py = placed[i + 1], pw = placed[i + 2], ph = placed[i + 3];
      if (x < px + pw + mx && x + w + mx > px && y < py + ph + my && y + h + my > py) return false;
    }
    return true;
  }

  /** Place the run labels: on the visible part of each run, nearest and most important first. */
  private placeDims(camera: THREE.PerspectiveCamera, W: number, H: number) {
    const cam = camera.position;
    const active = this.shown && this.dims.length > 0;
    // Farther labels show from higher up: the distance limit grows with the camera's height over the ground.
    const lift = cam.y - this.gy([cam.x, cam.z]);
    const far = Math.min(90, Math.max(16, 12 + 2.4 * Math.max(lift, 1.2)));
    this.u.uFar.value = far;
    this.mats.pick.resolution.set(W, H);
    const cap = Math.max(8, Math.min(32, Math.round((W * H) / 30000)));
    const pick = this.hov ?? this.sel;
    const order = this.dimOrder;
    order.length = 0;
    if (active) for (const d of this.dims) {
      d.d = Math.max(0, d.center.distanceTo(cam) - d.radius);
      const limit = d.kind === 'object' ? Math.max(60, far * 1.8) : d.kind === 'lot' ? far * 1.4 : far;
      if (d.d <= limit || d === pick) order.push(d);
      else this.hideDim(d);
    }
    // Totals of walls, fences and curbs first, then the runs by distance over importance; what showed last frame
    // keeps a head start so labels near the limit do not trade places, and the picked one always goes first.
    const score = (d: Dim) => (d === pick ? -1e9 : d.kind === 'object' ? -1e6 : 0) + ((d.d + 2) / d.weight) * (d.on ? 0.7 : 1);
    order.sort((a, b) => score(a) - score(b));
    let shown = 0, lead = 0;
    const flags = this.flagsNext;
    flags.fill(0);
    for (const d of order) {
      if (d.kind !== 'object' && shown >= cap && d !== pick) {
        this.hideDim(d);
        continue;
      }
      const used = this.placeDim(d, cam, W, H, lead < this.leaders.length ? this.leaders[lead] : null);
      if (!used) {
        this.hideDim(d);
        continue;
      }
      if (used === 2) lead++;
      if (d.kind !== 'object') shown++;
      for (const id of d.runs) flags[id] = 1;
    }
    for (let i = lead; i < this.leaders.length; i++) if (this.leaders[i].style.visibility !== 'hidden') this.leaders[i].style.visibility = 'hidden';
    if (pick) for (const id of pick.runs) flags[id] = 2;
    let changed = false;
    for (let i = 0; i < flags.length; i++) if (flags[i] !== this.flags[i]) { changed = true; break; }
    if (changed && this.u.uFlags.value) {
      this.flags.set(flags);
      this.u.uFlags.value.needsUpdate = true;
    }
  }

  private hideDim(d: Dim) {
    if (d.on) d.el.style.visibility = 'hidden';
    d.on = false;
  }

  /**
   * The parts of a path on screen this frame, into this.pc: each segment cut at the near plane and at the view's
   * edges. Returns their length in pixels.
   */
  private visiblePieces(path: Float32Array, W: number, H: number): number {
    const e = this.pv.elements, NEAR = 0.05, M = 8;
    this.npc = 0;
    let total = 0;
    for (let i = 0; i + 5 < path.length; i += 3) {
      let ax = path[i], ay = path[i + 1], az = path[i + 2], bx = path[i + 3], by = path[i + 4], bz = path[i + 5];
      let wa = e[3] * ax + e[7] * ay + e[11] * az + e[15], wb = e[3] * bx + e[7] * by + e[11] * bz + e[15];
      if (wa < NEAR && wb < NEAR) continue;
      if (wa < NEAR) {
        const t = (NEAR - wa) / (wb - wa);
        ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t; wa = NEAR;
      } else if (wb < NEAR) {
        const t = (NEAR - wb) / (wa - wb);
        bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t; wb = NEAR;
      }
      const sxa = ((e[0] * ax + e[4] * ay + e[8] * az + e[12]) / wa * 0.5 + 0.5) * W, sya = (-(e[1] * ax + e[5] * ay + e[9] * az + e[13]) / wa * 0.5 + 0.5) * H;
      const sxb = ((e[0] * bx + e[4] * by + e[8] * bz + e[12]) / wb * 0.5 + 0.5) * W, syb = (-(e[1] * bx + e[5] * by + e[9] * bz + e[13]) / wb * 0.5 + 0.5) * H;
      // Cut to the view (Liang-Barsky).
      const dx = sxb - sxa, dy = syb - sya;
      let u0 = 0, u1 = 1, ok = true;
      const cut = (p: number, q: number) => {
        if (p === 0) { if (q < 0) ok = false; return; }
        const r = q / p;
        if (p < 0) { if (r > u1) ok = false; else if (r > u0) u0 = r; } else if (r < u0) ok = false; else if (r < u1) u1 = r;
      };
      cut(-dx, sxa - M); cut(dx, W - M - sxa); cut(-dy, sya - M); cut(dy, H - M - sya);
      if (!ok || u1 - u0 < 1e-6) continue;
      // Screen fractions back to the world, perspective correct (1/w is linear on screen).
      const iwa = 1 / wa, iwb = 1 / wb;
      const iw0 = (1 - u0) * iwa + u0 * iwb, iw1 = (1 - u1) * iwa + u1 * iwb;
      const t0 = (u0 * iwb) / iw0, t1 = (u1 * iwb) / iw1;
      if ((this.npc + 1) * 12 > this.pc.length) {
        const g = new Float64Array(this.pc.length * 2);
        g.set(this.pc);
        this.pc = g;
      }
      const o = this.npc * 12;
      const pc = this.pc;
      pc[o] = sxa + dx * u0; pc[o + 1] = sya + dy * u0; pc[o + 2] = sxa + dx * u1; pc[o + 3] = sya + dy * u1;
      pc[o + 4] = iw0; pc[o + 5] = iw1;
      pc[o + 6] = ax + (bx - ax) * t0; pc[o + 7] = ay + (by - ay) * t0; pc[o + 8] = az + (bz - az) * t0;
      pc[o + 9] = ax + (bx - ax) * t1; pc[o + 10] = ay + (by - ay) * t1; pc[o + 11] = az + (bz - az) * t1;
      total += Math.hypot(pc[o + 2] - pc[o], pc[o + 3] - pc[o + 1]);
      this.npc++;
    }
    return total;
  }

  /** The point `s` pixels along the visible pieces: screen x, y, the run's angle there, and its world point (in this.v). */
  private along(s: number, out: number[]) {
    const pc = this.pc;
    for (let k = 0; k < this.npc; k++) {
      const o = k * 12;
      const L = Math.hypot(pc[o + 2] - pc[o], pc[o + 3] - pc[o + 1]);
      if (s > L && k < this.npc - 1) { s -= L; continue; }
      const f = L ? Math.min(1, Math.max(0, s / L)) : 0;
      const iw = (1 - f) * pc[o + 4] + f * pc[o + 5];
      const t = (f * pc[o + 5]) / iw;
      out[0] = pc[o] + (pc[o + 2] - pc[o]) * f;
      out[1] = pc[o + 1] + (pc[o + 3] - pc[o + 1]) * f;
      out[2] = Math.atan2(pc[o + 3] - pc[o + 1], pc[o + 2] - pc[o]);
      this.v.set(pc[o + 6] + (pc[o + 9] - pc[o + 6]) * t, pc[o + 7] + (pc[o + 10] - pc[o + 7]) * t, pc[o + 8] + (pc[o + 11] - pc[o + 8]) * t);
      return;
    }
  }

  /** How far along the visible pieces (pixels) the point nearest the middle of the view is. */
  private nearestCenter(W: number, H: number): number {
    const pc = this.pc, cx = W / 2, cy = H / 2;
    let best = Infinity, at = 0, walked = 0;
    for (let k = 0; k < this.npc; k++) {
      const o = k * 12, dx = pc[o + 2] - pc[o], dy = pc[o + 3] - pc[o + 1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      const f = L2 ? Math.min(1, Math.max(0, ((cx - pc[o]) * dx + (cy - pc[o + 1]) * dy) / L2)) : 0;
      const d = Math.hypot(pc[o] + dx * f - cx, pc[o + 1] + dy * f - cy);
      if (d < best) { best = d; at = walked + f * L; }
      walked += L;
    }
    return at;
  }

  /** Is the world point q hidden from the camera by a wall, fence, building or raised bed (not its own)? */
  private occluded(q: THREE.Vector3, cam: THREE.Vector3, self: string | null): boolean {
    const px = cam.x, pz = cam.z, dx = q.x - px, dz = q.z - pz, L = Math.hypot(dx, dz);
    if (L < 0.3) return false;
    // Not what stands right at the point (the wall an edge runs along): only what is between.
    const tMax = 1 - 0.12 / L;
    const minx = Math.min(px, q.x), maxx = Math.max(px, q.x), minz = Math.min(pz, q.z), maxz = Math.max(pz, q.z), low = Math.min(cam.y, q.y);
    for (const o of this.occ) {
      if (o.id === self || o.maxx < minx || o.minx > maxx || o.maxz < minz || o.minz > maxz || low > o.top) continue;
      const p = o.p, n = p.length / 3, segs = o.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 3], az = p[i * 3 + 1], ex = p[j * 3] - ax, ez = p[j * 3 + 1] - az;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = ax - px, wz = az - pz;
        const t = (wx * ez - wz * ex) / den;
        if (t <= 0 || t >= tMax) continue;
        const s = (wx * dz - wz * dx) / den;
        if (s < 0 || s > 1) continue;
        const top = p[i * 3 + 2] + s * (p[j * 3 + 2] - p[i * 3 + 2]);
        if (cam.y + t * (q.y - cam.y) < top - 0.03) return true;
      }
    }
    return false;
  }

  private at = [0, 0, 0];

  /**
   * Place one run label. Returns 0 (not shown), 1 (on its run) or 2 (moved off it, using `leader`).
   * Tries the run's middle on screen (a curve: the point nearest the middle of the view), then a little either way
   * along it, then beside it with a leader.
   */
  private placeDim(d: Dim, cam: THREE.Vector3, W: number, H: number, leader: HTMLDivElement | null): 0 | 1 | 2 {
    const vis = this.visiblePieces(d.path, W, H);
    if (vis < (d.kind === 'object' ? 1 : MIN_PX)) return 0;
    const mid = d.curved || d.kind === 'object' ? this.nearestCenter(W, H) : vis / 2;
    const lo = vis * 0.08, hi = vis * 0.92;
    const slide = Math.max(50, vis * 0.2);
    const tries = [mid, mid - slide, mid + slide];
    const at = this.at;
    let anchor = -1;
    let ax = 0, ay = 0, ang = 0;
    for (const s0 of tries) {
      const s = Math.min(hi, Math.max(lo, s0));
      this.along(s, at);
      if (this.occluded(this.v, cam, d.self)) continue;
      if (anchor < 0) {
        anchor = s;
        ax = at[0]; ay = at[1]; ang = at[2];
      }
      // On the run: turned along it if it is near level on screen, else level, centered on it.
      let a = at[2];
      if (a > Math.PI / 2) a -= Math.PI;
      else if (a <= -Math.PI / 2) a += Math.PI;
      const turn = d.kind !== 'object' && Math.abs(a) <= TURN_MAX ? a : 0;
      const c = Math.abs(Math.cos(turn)), sn = Math.abs(Math.sin(turn));
      const bw = d.w * c + d.h * sn, bh = d.w * sn + d.h * c;
      const x = at[0] - bw / 2, y = at[1] - bh / 2;
      if (insideView(x, y, bw, bh, W, H) && this.free(x, y, bw, bh, d.on)) {
        this.showDim(d, x, y, bw, bh, turn, false);
        return 1;
      }
    }
    if (anchor < 0 || !leader) return 0;
    // Beside the run, level, with a leader back to it; an area edge now says which area it is.
    const named = !!d.name;
    const bw = d.w + (named ? d.nameW : 0), bh = d.h;
    let nx = -Math.sin(ang), ny = Math.cos(ang);
    if (ny > 0) { nx = -nx; ny = -ny; }
    for (const k of [1, -1, 2, -2]) {
      const half = Math.abs(nx) * bw / 2 + Math.abs(ny) * bh / 2;
      const off = (Math.abs(k) === 1 ? 16 : 40) + half;
      const cx = ax + nx * off * Math.sign(k), cy = ay + ny * off * Math.sign(k);
      const x = cx - bw / 2, y = cy - bh / 2;
      if (!insideView(x, y, bw, bh, W, H) || !this.free(x, y, bw, bh, false)) continue;
      this.showDim(d, x, y, bw, bh, 0, named);
      // From the box's edge to the run.
      const lx = ax - cx, ly = ay - cy;
      const f = Math.min(Math.abs(lx) > 1e-6 ? bw / 2 / Math.abs(lx) : Infinity, Math.abs(ly) > 1e-6 ? bh / 2 / Math.abs(ly) : Infinity);
      const sx = cx + lx * f, sy = cy + ly * f;
      const len = Math.hypot(ax - sx, ay - sy);
      leader.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) rotate(${Math.atan2(ay - sy, ax - sx).toFixed(3)}rad) scaleX(${(len / 100).toFixed(3)})`;
      if (leader.style.visibility === 'hidden') leader.style.visibility = '';
      return 2;
    }
    return 0;
  }

  /** Show a run label with its box at x, y (bw × bh, axis aligned), turned by `turn`, with its area's name or not. */
  private showDim(d: Dim, x: number, y: number, bw: number, bh: number, turn: number, named: boolean) {
    this.placed.push(x, y, bw, bh);
    d.bx = x; d.by = y; d.bw = bw; d.bh = bh;
    if (!d.on) d.el.style.visibility = '';
    d.on = true;
    if (d.name) {
      const v = named ? 'inherit' : 'hidden';
      if (d.name.style.visibility !== v) d.name.style.visibility = v;
    }
    // The element is the length alone (its name hangs off its left side), turned about its own center.
    const cx = x + bw / 2 + (named ? d.nameW / 2 : 0), cy = y + bh / 2;
    const ex = cx - d.w / 2, ey = cy - d.h / 2;
    d.el.style.transform = turn ? `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${turn.toFixed(3)}rad)` : `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px)`;
  }

  private clear() {
    for (const o of this.group.children) (o as THREE.Line).geometry?.dispose();
    this.group.clear();
    this.pickLine = null;
    this.labels = [];
    this.dims = [];
    this.leaders = [];
    this.occ = [];
    this.runPts = [new Float32Array(0)];
    this.sel = this.hov = null;
    this.u.uSel.value = 0;
    this.layer.classList.remove('ml-has-sel');
    this.u.uFlags.value?.dispose();
    this.u.uFlags.value = null;
    this.layer.replaceChildren(...[...this.pinned.keys()]);
  }

  dispose() {
    this.clear();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.layer.remove();
  }
}
