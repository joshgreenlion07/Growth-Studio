/**
 * Shared rules for HTML labels placed over the 3D canvas (measurements and build-stage labels).
 *
 * Labels must not sit under the buttons and readouts drawn over the view (the buttons are see-through, so a label
 * under one reads as drawn over it), and must not be cut in half by the edge of the view. The controls are found
 * from the view's own children, so a new control is avoided without being listed here.
 */

/** Keep this far (CSS px) from the edge of the view and from each control. */
export const EDGE_GAP = 4;
const REFRESH_MS = 250;

export class OverlayObstacles {
  /** x, y, w, h of each control, in the label layer's coordinates. */
  rects: number[] = [];
  private at = -Infinity;
  private key = '';

  constructor(
    private container: HTMLElement,
    private layer: HTMLElement,
  ) {}

  /**
   * Re-read where the controls are, at most a few times a second (the reads are cheap: labels move by transform and
   * show and hide by visibility, so layout is clean when this runs). Returns true if they moved since the last read.
   */
  refresh(now = performance.now()): boolean {
    if (now - this.at < REFRESH_MS) return false;
    this.at = now;
    const base = this.layer.getBoundingClientRect();
    if (!base.width || !base.height) return false;
    const view = base.width * base.height;
    const out: number[] = [];
    const add = (r: DOMRect) => {
      if (r.width < 1 || r.height < 1) return;
      out.push(r.left - base.left - EDGE_GAP, r.top - base.top - EDGE_GAP, r.width + 2 * EDGE_GAP, r.height + 2 * EDGE_GAP);
    };
    for (const el of Array.from(this.container.children) as HTMLElement[]) {
      if (el === this.layer || el.tagName === 'CANVAS' || el.classList.contains('measure-layer') || el.hidden) continue;
      const r = el.getBoundingClientRect();
      // A zero-size anchor (the material pointer) or a full-view wrapper (a centered note): its children are what show.
      if (r.width * r.height < 1 || r.width * r.height > view * 0.5) {
        for (const c of Array.from(el.children)) add(c.getBoundingClientRect());
      } else add(r);
    }
    const key = out.map((n) => Math.round(n)).join(',');
    const moved = key !== this.key;
    this.key = key;
    this.rects = out;
    return moved;
  }
}

/** True if a label at x, y (top left) of size w × h is wholly inside the view, clear of its edges. */
export function insideView(x: number, y: number, w: number, h: number, width: number, height: number) {
  return x >= EDGE_GAP && y >= EDGE_GAP && x + w <= width - EDGE_GAP && y + h <= height - EDGE_GAP;
}
