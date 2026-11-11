import { featureById, materialById, plantById, sizeAt } from '../siteplan/catalog';
import { bounds, distToPolyline, distToSegment, pointInPolygon, uid } from '../siteplan/geometry';
import type { LineKind, SitePlan, Vec2, WaterKind, ZoneKind } from '../siteplan/types';

/**
 * The 2D plan: shows the SitePlan over an optional blueprint, and lets a
 * person select, move, reshape, draw and delete items.
 */

export type Tool =
  | { kind: 'select' }
  | { kind: 'area'; zone: ZoneKind; catalogId: string }
  | { kind: 'line'; line: LineKind; catalogId: string; height: number }
  | { kind: 'water'; water: WaterKind }
  | { kind: 'plant'; catalogId: string }
  | { kind: 'feature'; catalogId: string }
  | { kind: 'boundary' }
  | { kind: 'scale' };

export type ItemRef =
  | { list: 'zones' | 'lines' | 'water' | 'plants' | 'features' | 'structures'; id: string }
  | { list: 'site'; id: 'site' };

export interface Underlay {
  image: HTMLImageElement;
  /** Meters per image pixel. */
  mpp: number;
  /** Plan position of the image's top-left corner. */
  origin: Vec2;
  opacity: number;
}

const HANDLE = 7;

export class PlanEditor {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  plan: SitePlan;
  tool: Tool = { kind: 'select' };
  selected: ItemRef | null = null;
  underlay: Underlay | null = null;
  years = 3;
  /** World-to-screen: screen = (p - pan) * zoom */
  private zoom = 30;
  private pan: Vec2 = [0, 0];
  private draft: Vec2[] = [];
  private hover: Vec2 | null = null;
  private drag: { mode: 'move' | 'vertex' | 'pan' | 'rotate'; start: Vec2; last: Vec2; vertex?: number; moved: boolean } | null = null;
  private dpr = 1;
  private ro: ResizeObserver;
  private colors: Record<string, string> = {};
  onChange: (plan: SitePlan, reason: string) => void = () => {};
  onSelect: (ref: ItemRef | null) => void = () => {};
  onToolDone: () => void = () => {};
  onScale: (a: Vec2, b: Vec2) => void = () => {};
  onStatus: (text: string) => void = () => {};

  constructor(private host: HTMLElement, plan: SitePlan) {
    this.plan = plan;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plan-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Plan view of the yard');
    host.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.bind();
    this.readColors();
    this.resize();
    this.fit();
  }

  readColors() {
    const cs = getComputedStyle(this.host);
    for (const k of ['ink', 'ink-2', 'line', 'accent', 'warn', 'paper', 'grid', 'water', 'select']) this.colors[k] = cs.getPropertyValue(`--plan-${k}`).trim() || '#888';
  }

  setPlan(plan: SitePlan, refit = false) {
    this.plan = plan;
    if (this.selected && !this.find(this.selected)) this.select(null);
    if (refit) this.fit();
    this.draw();
  }

  setTool(t: Tool) {
    this.tool = t;
    this.draft = [];
    this.canvas.style.cursor = t.kind === 'select' ? 'default' : 'crosshair';
    this.status();
    this.draw();
  }

  private status() {
    const t = this.tool;
    const msg =
      t.kind === 'area' ? 'Click to add corners. Click the first point or press Enter to finish. Esc cancels.'
      : t.kind === 'line' ? 'Click to add points. Double-click or press Enter to finish.'
      : t.kind === 'water' ? (t.water === 'stream' || t.water === 'pondless' ? 'Click from the top of the falls down to the end. Enter to finish.' : 'Click to outline the water. Enter to finish.')
      : t.kind === 'plant' ? 'Click to place. Keep clicking to place more.'
      : t.kind === 'feature' ? 'Click to place.'
      : t.kind === 'boundary' ? 'Click the property corners in order. Enter to finish.'
      : t.kind === 'scale' ? 'Click both ends of a length you know on the plan.'
      : 'Click an item to select it. Drag to move. Drag a corner to reshape. Scroll to zoom, drag empty space to pan.';
    this.onStatus(msg);
  }

  fit() {
    const pts = [...this.plan.site.boundary];
    if (this.underlay) {
      const u = this.underlay;
      pts.push(u.origin, [u.origin[0] + u.image.naturalWidth * u.mpp, u.origin[1] + u.image.naturalHeight * u.mpp]);
    }
    const b = bounds(pts);
    const w = this.canvas.clientWidth || 400, h = this.canvas.clientHeight || 300;
    const pad = 28;
    this.zoom = Math.max(4, Math.min((w - pad * 2) / Math.max(1, b.maxX - b.minX), (h - pad * 2) / Math.max(1, b.maxY - b.minY)));
    this.pan = [b.minX - (w / this.zoom - (b.maxX - b.minX)) / 2, b.minY - (h / this.zoom - (b.maxY - b.minY)) / 2];
    this.draw();
  }

  private fitted = false;

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const first = !this.fitted && w > 50 && h > 50;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (first) {
      this.fitted = true;
      this.fit();
    }
    this.draw();
  }

  private toWorld(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / this.zoom + this.pan[0], (e.clientY - r.top) / this.zoom + this.pan[1]];
  }

  private sx(p: Vec2): [number, number] {
    return [(p[0] - this.pan[0]) * this.zoom, (p[1] - this.pan[1]) * this.zoom];
  }

  /* -------------------------------------------------------------- */
  /* Selection helpers                                                */

  find(ref: ItemRef): { polygon?: Vec2[]; points?: Vec2[]; position?: Vec2 } | null {
    if (ref.list === 'site') return { polygon: this.plan.site.boundary };
    const list = this.plan[ref.list] as { id: string }[];
    return (list.find((x) => x.id === ref.id) as never) ?? null;
  }

  select(ref: ItemRef | null) {
    this.selected = ref;
    this.onSelect(ref);
    this.draw();
  }

  private hit(p: Vec2): ItemRef | null {
    const tol = 8 / this.zoom;
    const pl = this.plan;
    for (let i = pl.features.length - 1; i >= 0; i--) {
      const f = pl.features[i];
      const spec = featureById.get(f.catalogId);
      const r = spec ? Math.max(spec.footprint[0], spec.footprint[1]) / 2 : 0.5;
      if (Math.hypot(p[0] - f.position[0], p[1] - f.position[1]) < Math.max(r * 0.8, tol * 1.5)) return { list: 'features', id: f.id };
    }
    for (let i = pl.plants.length - 1; i >= 0; i--) {
      const pt = pl.plants[i];
      const spec = plantById.get(pt.catalogId);
      const r = spec ? sizeAt(spec, this.years).spread / 2 : 0.3;
      if (Math.hypot(p[0] - pt.position[0], p[1] - pt.position[1]) < Math.max(r, tol * 1.5)) return { list: 'plants', id: pt.id };
    }
    for (let i = pl.lines.length - 1; i >= 0; i--) if (distToPolyline(p, pl.lines[i].points) < tol + 0.1) return { list: 'lines', id: pl.lines[i].id };
    for (let i = pl.water.length - 1; i >= 0; i--) {
      const w = pl.water[i];
      if (w.polygon && pointInPolygon(p, w.polygon)) return { list: 'water', id: w.id };
      if (w.points && distToPolyline(p, w.points) < (w.width ?? 0.8) / 2 + tol) return { list: 'water', id: w.id };
    }
    for (let i = pl.structures.length - 1; i >= 0; i--) if (pointInPolygon(p, pl.structures[i].polygon)) return { list: 'structures', id: pl.structures[i].id };
    for (let i = pl.zones.length - 1; i >= 0; i--) if (pointInPolygon(p, pl.zones[i].polygon)) return { list: 'zones', id: pl.zones[i].id };
    const B = pl.site.boundary;
    for (let i = 0; i < B.length; i++) if (distToSegment(p, B[i], B[(i + 1) % B.length]) < tol) return { list: 'site', id: 'site' };
    return null;
  }

  private vertexAt(p: Vec2): number {
    if (!this.selected) return -1;
    const it = this.find(this.selected);
    const pts = it?.polygon ?? it?.points;
    if (!pts) return -1;
    const tol = HANDLE / this.zoom + 0.02;
    return pts.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
  }

  deleteSelected() {
    const s = this.selected;
    if (!s || s.list === 'site') return;
    const list = this.plan[s.list] as { id: string }[];
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list.splice(i, 1);
    this.select(null);
    this.onChange(this.plan, 'delete');
  }

  /* -------------------------------------------------------------- */
  /* Input                                                            */

  private bind() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toWorld(e);
      this.zoom = Math.max(3, Math.min(400, this.zoom * Math.pow(1.0015, -e.deltaY)));
      const after = this.toWorld(e);
      this.pan = [this.pan[0] + before[0] - after[0], this.pan[1] + before[1] - after[1]];
      this.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      c.focus({ preventScroll: true });
      c.setPointerCapture(e.pointerId);
      const p = this.toWorld(e);
      const t = this.tool;
      if (e.button === 1 || e.button === 2 || e.altKey) {
        this.drag = { mode: 'pan', start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false };
        return;
      }
      if (t.kind === 'select') {
        const v = this.vertexAt(p);
        if (v >= 0) {
          this.drag = { mode: 'vertex', start: p, last: p, vertex: v, moved: false };
          return;
        }
        const h = this.hit(p);
        if (h) {
          if (!this.selected || this.selected.id !== h.id || this.selected.list !== h.list) this.select(h);
          this.drag = { mode: 'move', start: p, last: p, moved: false };
        } else {
          this.select(null);
          this.drag = { mode: 'pan', start: [e.clientX, e.clientY], last: [e.clientX, e.clientY], moved: false };
        }
        return;
      }
      if (t.kind === 'plant') {
        const id = uid('plant');
        this.plan.plants.push({ id, catalogId: t.catalogId, position: p, source: 'person' });
        this.selected = { list: 'plants', id };
        this.onSelect(this.selected);
        this.onChange(this.plan, 'add');
        this.draw();
        return;
      }
      if (t.kind === 'feature') {
        const id = uid('feature');
        this.plan.features.push({ id, catalogId: t.catalogId, position: p, rotationDeg: 0, source: 'person' });
        this.onChange(this.plan, 'add');
        this.setTool({ kind: 'select' });
        this.select({ list: 'features', id });
        this.onToolDone();
        return;
      }
      if (t.kind === 'scale') {
        this.draft.push(p);
        if (this.draft.length === 2) {
          const [a, b] = this.draft;
          this.draft = [];
          this.onScale(a, b);
        }
        this.draw();
        return;
      }
      // Multi-point tools.
      const closing = (t.kind === 'area' || t.kind === 'boundary' || (t.kind === 'water' && t.water !== 'stream' && t.water !== 'pondless')) && this.draft.length >= 3 && Math.hypot(p[0] - this.draft[0][0], p[1] - this.draft[0][1]) < 10 / this.zoom;
      if (closing) {
        this.finishDraft();
        return;
      }
      this.draft.push(p);
      this.draw();
    });

    c.addEventListener('pointermove', (e) => {
      const p = this.toWorld(e);
      this.hover = p;
      const d = this.drag;
      if (d) {
        if (d.mode === 'pan') {
          this.pan = [this.pan[0] - (e.clientX - d.last[0]) / this.zoom, this.pan[1] - (e.clientY - d.last[1]) / this.zoom];
          d.last = [e.clientX, e.clientY];
          d.moved = true;
        } else if (this.selected) {
          const dx = p[0] - d.last[0], dy = p[1] - d.last[1];
          if (Math.abs(p[0] - d.start[0]) + Math.abs(p[1] - d.start[1]) > 2 / this.zoom) d.moved = true;
          if (!d.moved) return;
          const it = this.find(this.selected);
          if (it) {
            if (d.mode === 'vertex' && d.vertex !== undefined) {
              const pts = it.polygon ?? it.points!;
              pts[d.vertex] = [pts[d.vertex][0] + dx, pts[d.vertex][1] + dy];
            } else {
              for (const pts of [it.polygon, it.points]) if (pts) for (const q of pts) { q[0] += dx; q[1] += dy; }
              if (it.position) { it.position[0] += dx; it.position[1] += dy; }
            }
            this.markPerson(this.selected);
          }
          d.last = p;
        }
      }
      this.draw();
    });

    c.addEventListener('pointerup', () => {
      const d = this.drag;
      this.drag = null;
      if (d && d.moved && d.mode !== 'pan') this.onChange(this.plan, 'edit');
    });

    c.addEventListener('dblclick', () => {
      if (this.draft.length >= 2) {
        // The dblclick's second click already added a point; drop the duplicate.
        this.draft.pop();
        this.finishDraft();
      }
    });

    c.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.draft.length) this.draft = [];
        else if (this.tool.kind !== 'select') {
          this.setTool({ kind: 'select' });
          this.onToolDone();
        } else this.select(null);
        this.draw();
      } else if (e.key === 'Enter') this.finishDraft();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.tool.kind === 'select') {
        e.preventDefault();
        this.deleteSelected();
      } else if (e.key === 'r' && this.selected?.list === 'features') {
        const f = this.plan.features.find((x) => x.id === this.selected!.id);
        if (f) {
          f.rotationDeg = (f.rotationDeg + 15) % 360;
          this.onChange(this.plan, 'edit');
          this.draw();
        }
      }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private markPerson(ref: ItemRef) {
    if (ref.list === 'site') return;
    const it = (this.plan[ref.list] as { id: string; source?: string; confidence?: number }[]).find((x) => x.id === ref.id);
    if (it && it.source === 'ai') {
      it.source = 'person';
      it.confidence = 1;
    }
  }

  private finishDraft() {
    const t = this.tool;
    const pts = this.draft;
    this.draft = [];
    if (t.kind === 'area' && pts.length >= 3) {
      const id = uid(t.zone);
      this.plan.zones.push({ id, kind: t.zone, catalogId: t.catalogId, polygon: pts, source: 'person' });
      this.selected = { list: 'zones', id };
    } else if (t.kind === 'line' && pts.length >= 2) {
      const id = uid(t.line);
      this.plan.lines.push({ id, kind: t.line, catalogId: t.catalogId, points: pts, height: t.height, source: 'person' });
      this.selected = { list: 'lines', id };
    } else if (t.kind === 'water') {
      const id = uid(t.water);
      if ((t.water === 'stream' || t.water === 'pondless') && pts.length >= 2) {
        this.plan.water.push({ id, kind: t.water, points: pts, width: 0.75, depth: t.water === 'pondless' ? 0.12 : 0.25, falls: t.water === 'pondless' ? 3 : 2, lights: true, source: 'person' });
        this.selected = { list: 'water', id };
      } else if (pts.length >= 3) {
        this.plan.water.push({ id, kind: t.water, polygon: pts, depth: t.water === 'pool' ? 1.6 : t.water === 'fountain' ? 0.4 : 0.7, source: 'person' });
        this.selected = { list: 'water', id };
      }
    } else if (t.kind === 'boundary' && pts.length >= 3) {
      this.plan.site.boundary = pts;
      this.selected = { list: 'site', id: 'site' };
    } else {
      this.draw();
      return;
    }
    this.onSelect(this.selected);
    this.onChange(this.plan, 'add');
    this.setTool({ kind: 'select' });
    this.onToolDone();
  }

  /* -------------------------------------------------------------- */
  /* Drawing                                                          */

  private matColor(id: string, fallback: string): string {
    if (this.colors[`m:${id}`]) return this.colors[`m:${id}`];
    const m = materialById.get(id);
    const c = m ? m.palette[Math.floor(m.palette.length / 2)] : fallback;
    this.colors[`m:${id}`] = c;
    return c;
  }

  draw() {
    const g = this.g, C = this.colors, z = this.zoom;
    const W = this.canvas.width, H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const path = (pts: Vec2[], close: boolean) => {
      g.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = this.sx(p);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      if (close) g.closePath();
    };

    // Grid every 5 ft.
    const step = 1.524;
    const x0 = Math.floor(this.pan[0] / step) * step, y0 = Math.floor(this.pan[1] / step) * step;
    const w = this.canvas.clientWidth / z, h = this.canvas.clientHeight / z;
    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = x0; x < this.pan[0] + w; x += step) {
      const [sx] = this.sx([x, 0]);
      g.moveTo(Math.round(sx) + 0.5, 0);
      g.lineTo(Math.round(sx) + 0.5, this.canvas.clientHeight);
    }
    for (let y = y0; y < this.pan[1] + h; y += step) {
      const [, sy] = this.sx([0, y]);
      g.moveTo(0, Math.round(sy) + 0.5);
      g.lineTo(this.canvas.clientWidth, Math.round(sy) + 0.5);
    }
    g.stroke();

    if (this.underlay) {
      const u = this.underlay;
      const [ux, uy] = this.sx(u.origin);
      g.globalAlpha = u.opacity;
      g.drawImage(u.image, ux, uy, u.image.naturalWidth * u.mpp * z, u.image.naturalHeight * u.mpp * z);
      g.globalAlpha = 1;
    }
    const fade = this.underlay ? 0.55 : 0.9;

    // Property line.
    path(this.plan.site.boundary, true);
    g.setLineDash([8, 5]);
    g.strokeStyle = C.ink;
    g.lineWidth = 1.5;
    g.stroke();
    g.setLineDash([]);

    const lowConf = (it: { source?: string; confidence?: number }) => it.source === 'ai' && (it.confidence ?? 1) < 0.6;
    const flag = (draw: () => void) => {
      g.save();
      g.strokeStyle = C.warn;
      g.lineWidth = 2.5;
      g.setLineDash([5, 4]);
      draw();
      g.stroke();
      g.restore();
    };

    for (const zn of this.plan.zones) {
      path(zn.polygon, true);
      g.globalAlpha = fade;
      g.fillStyle = this.matColor(zn.catalogId, '#999');
      g.fill();
      g.globalAlpha = 1;
      if (zn.border) {
        g.strokeStyle = this.matColor(zn.border.catalogId, '#444');
        g.lineWidth = Math.max(2, zn.border.width * z);
        g.stroke();
      }
      if (zn.raised) {
        g.strokeStyle = this.matColor(zn.raised.wallCatalogId, '#888');
        g.lineWidth = Math.max(2, 0.25 * z);
        g.stroke();
      }
      if (lowConf(zn)) flag(() => path(zn.polygon, true));
    }
    for (const s of this.plan.structures) {
      path(s.polygon, true);
      g.fillStyle = C['ink-2'];
      g.globalAlpha = 0.35;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = C.ink;
      g.lineWidth = 1.5;
      g.stroke();
      const b = bounds(s.polygon);
      const [cx, cy] = this.sx([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
      g.fillStyle = C.ink;
      g.font = '600 11px var(--font-ui, sans-serif)';
      g.textAlign = 'center';
      g.fillText(s.kind === 'house' ? 'House' : s.kind === 'garage' ? 'Garage' : 'Shed', cx, cy + 4);
    }
    for (const wt of this.plan.water) {
      g.fillStyle = C.water;
      g.strokeStyle = C.water;
      if (wt.polygon) {
        path(wt.polygon, true);
        g.globalAlpha = 0.75;
        g.fill();
        g.globalAlpha = 1;
      } else if (wt.points) {
        path(wt.points, false);
        g.lineWidth = Math.max(3, (wt.width ?? 0.8) * z);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.globalAlpha = 0.75;
        g.stroke();
        g.globalAlpha = 1;
        const [hx, hy] = this.sx(wt.points[0]);
        g.fillStyle = C.ink;
        g.beginPath();
        g.arc(hx, hy, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const l of this.plan.lines) {
      path(l.points, false);
      g.strokeStyle = this.matColor(l.catalogId, '#666');
      g.lineWidth = l.kind === 'wall' ? Math.max(3, 0.3 * z) : l.kind === 'fence' ? 3 : 2;
      g.lineCap = 'butt';
      g.stroke();
      if (lowConf(l)) flag(() => path(l.points, false));
    }
    for (const f of this.plan.features) {
      const spec = featureById.get(f.catalogId);
      const [fw, fd] = spec?.footprint ?? [0.6, 0.6];
      const [cx, cy] = this.sx(f.position);
      g.save();
      g.translate(cx, cy);
      g.rotate((f.rotationDeg * Math.PI) / 180);
      g.fillStyle = C['ink-2'];
      g.globalAlpha = 0.55;
      g.fillRect((-fw / 2) * z, (-fd / 2) * z, fw * z, fd * z);
      g.globalAlpha = 1;
      g.strokeStyle = C.ink;
      g.lineWidth = 1;
      g.strokeRect((-fw / 2) * z, (-fd / 2) * z, fw * z, fd * z);
      // Front marker.
      g.beginPath();
      g.moveTo(-4, (fd / 2) * z - 2);
      g.lineTo(4, (fd / 2) * z - 2);
      g.stroke();
      g.restore();
      if (lowConf(f)) flag(() => {
        g.beginPath();
        g.arc(cx, cy, (Math.max(fw, fd) / 2) * z + 4, 0, Math.PI * 2);
      });
    }
    for (const pt of this.plan.plants) {
      const spec = plantById.get(pt.catalogId);
      if (!spec) continue;
      const r = Math.max(2.5, (sizeAt(spec, pt.existing ? 99 : this.years).spread / 2) * z);
      const [cx, cy] = this.sx(pt.position);
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = spec.foliage;
      g.globalAlpha = 0.8;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 1;
      g.stroke();
      if (r > 6) {
        g.beginPath();
        g.moveTo(cx - 2, cy);
        g.lineTo(cx + 2, cy);
        g.moveTo(cx, cy - 2);
        g.lineTo(cx, cy + 2);
        g.stroke();
      }
      if (lowConf(pt)) flag(() => {
        g.beginPath();
        g.arc(cx, cy, r + 3, 0, Math.PI * 2);
      });
    }

    // Selection.
    if (this.selected) {
      const it = this.find(this.selected);
      if (it) {
        g.strokeStyle = C.select;
        g.lineWidth = 2;
        const pts = it.polygon ?? it.points;
        if (pts) {
          path(pts, !!it.polygon);
          g.stroke();
          for (const q of pts) {
            const [x, y] = this.sx(q);
            g.fillStyle = C.paper;
            g.fillRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
            g.strokeRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
          }
        } else if (it.position) {
          const [x, y] = this.sx(it.position);
          g.beginPath();
          g.arc(x, y, 12, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }

    // Draft.
    if (this.draft.length) {
      const pts = this.hover ? [...this.draft, this.hover] : this.draft;
      path(pts, false);
      g.strokeStyle = C.accent;
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      g.stroke();
      g.setLineDash([]);
      for (const q of this.draft) {
        const [x, y] = this.sx(q);
        g.fillStyle = C.accent;
        g.fillRect(x - 3, y - 3, 6, 6);
      }
      if (this.tool.kind === 'scale' && this.hover) {
        const d = Math.hypot(this.hover[0] - this.draft[0][0], this.hover[1] - this.draft[0][1]);
        const [x, y] = this.sx(this.hover);
        g.fillStyle = C.ink;
        g.font = '12px var(--font-mono, monospace)';
        g.fillText(`${(d * 3.28084).toFixed(1)} ft now`, x + 10, y - 8);
      }
    }

    // Scale bar.
    const bar = this.zoom > 20 ? 3.048 : 6.096;
    const bx = 16, by = this.canvas.clientHeight - 18;
    g.strokeStyle = C.ink;
    g.fillStyle = C.ink;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + bar * z, by);
    g.moveTo(bx, by - 4);
    g.lineTo(bx, by + 4);
    g.moveTo(bx + bar * z, by - 4);
    g.lineTo(bx + bar * z, by + 4);
    g.stroke();
    g.font = '11px var(--font-mono, monospace)';
    g.textAlign = 'left';
    g.fillText(`${bar > 4 ? 20 : 10} ft`, bx + bar * z + 6, by + 4);
  }

  dispose() {
    this.ro.disconnect();
    this.canvas.remove();
  }
}
