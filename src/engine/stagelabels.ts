import * as THREE from 'three';
import type { BuildStage, StageLabel } from '../builder/construction';
import { OverlayObstacles, insideView } from './overlay';

/**
 * Labels for the build stages: each trench with its cover, each dug-out area with its depth, each layer with its
 * thickness and amount, and the equipment by name. HTML over the canvas, placed each frame like the measurements
 * overlay (nearest first, skipping any that would overlap one already placed, sit under a control or be cut off by
 * the edge of the view; shown and hidden by visibility, in one layer). Shown only in a stage before the finished yard.
 */

interface Placed {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  kind: StageLabel['kind'];
  w: number;
  h: number;
}

const PRIORITY: Record<StageLabel['kind'], number> = { trench: 0, area: 1, point: 2 };

export class StageLabels {
  private layer: HTMLDivElement;
  private labels: Placed[] = [];
  private v = new THREE.Vector3();
  private obstacles: OverlayObstacles;

  constructor(container: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'measure-layer stage-layer';
    this.layer.hidden = true;
    container.appendChild(this.layer);
    this.obstacles = new OverlayObstacles(container, this.layer);
  }

  /** Show the labels for a stage (none for the finished yard). */
  set(all: StageLabel[], stage: BuildStage) {
    this.layer.replaceChildren();
    this.labels = [];
    for (const l of all) {
      if (!l.stages.includes(stage)) continue;
      const el = document.createElement('div');
      el.className = `measure-label stage-label sl-${l.kind}`;
      el.textContent = l.title;
      if (l.sub) {
        const s = document.createElement('span');
        s.textContent = l.sub;
        el.append(s);
      }
      el.style.visibility = 'hidden';
      this.layer.append(el);
      this.labels.push({ el, pos: l.at.clone(), kind: l.kind, w: 0, h: 0 });
    }
    this.layer.hidden = this.labels.length === 0;
  }

  update(camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (this.layer.hidden) return;
    this.obstacles.refresh();
    const ob = this.obstacles.rects;
    const placed: [number, number, number, number][] = [];
    for (let i = 0; i < ob.length; i += 4) placed.push([ob[i], ob[i + 1], ob[i + 2], ob[i + 3]]);
    // Measure new labels first (reads before the writes below).
    for (const l of this.labels) {
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
    }
    const cam = camera.position;
    const order = this.labels.map((l) => ({ l, d: l.pos.distanceTo(cam) })).sort((a, b) => PRIORITY[a.l.kind] - PRIORITY[b.l.kind] || a.d - b.d);
    for (const { l, d } of order) {
      const hide = () => {
        if (l.el.style.visibility !== 'hidden') l.el.style.visibility = 'hidden';
      };
      this.v.copy(l.pos).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width - l.w / 2;
      const y = (-this.v.y * 0.5 + 0.5) * height - l.h / 2;
      if (this.v.z > 1 || this.v.z < -1 || d > 90 || !l.w || !insideView(x, y, l.w, l.h, width, height)) {
        hide();
        continue;
      }
      if (placed.some(([px, py, pw, ph]) => x < px + pw + 4 && x + l.w + 4 > px && y < py + ph + 2 && y + l.h + 2 > py)) {
        hide();
        continue;
      }
      placed.push([x, y, l.w, l.h]);
      if (l.el.style.visibility) l.el.style.visibility = '';
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  dispose() {
    this.layer.remove();
  }
}
