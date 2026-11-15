import * as THREE from 'three';
import { GeoBuilder, V, clamp, leafQuad, lerp, type LeafOpts } from '../kit';

/**
 * Shared pieces for the mat-forming groundcovers (ajuga, verbena, creeping
 * myoporum): atlas rectangles, cards laid on the mat, trailing-stem runners,
 * dome cards for flower heads, and an exact fit to the catalog size.
 */

export const TAU = Math.PI * 2;
export type UV = [number, number, number, number];

/** UV rectangle of a canvas pixel rectangle (base of the leaf at the canvas bottom, tip at the top). */
export function rect(x: number, y: number, w: number, h: number, W: number, H: number): UV {
  return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
}

/** Paint inside one atlas cell, clipped, with the origin at the cell's top-left. */
export function inCell(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: (w: number, h: number) => void) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(1, 1, w - 2, h - 2);
  g.clip();
  draw(w, h);
  g.restore();
}

/**
 * A card lying on the mat: starts at `base`, heads along azimuth `az`,
 * pitched up by `pitch` and rolled around its own axis by `roll`.
 */
export function lay(
  g: GeoBuilder, base: THREE.Vector3, az: number, pitch: number, roll: number, len: number, wid: number, uv: UV,
  color: THREE.Color, birth: number, o: LeafOpts = {}, anchor?: THREE.Vector3,
) {
  const cp = Math.cos(pitch);
  const dir = V(Math.cos(az) * cp, Math.sin(pitch), Math.sin(az) * cp);
  const side = V(-Math.sin(az), 0, Math.cos(az));
  const up = V().crossVectors(side, dir).normalize();
  const face = up.multiplyScalar(Math.cos(roll)).addScaledVector(side, Math.sin(roll));
  leafQuad(g, base, dir, face, len, wid, uv, color, birth, anchor ?? base, o);
}

/**
 * A shallow dome (4 triangles around a raised center) for a flower head seen
 * from above: centered at `c`, facing `n`, `size` across.
 */
export function domeCard(
  g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, spin: number, size: number, droop: number, uv: UV,
  color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number,
) {
  const nn = n.clone().normalize();
  const a0 = Math.abs(nn.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
  const ax = V().crossVectors(nn, a0).normalize();
  const bx = V().crossVectors(nn, ax).normalize();
  const a = ax.clone().multiplyScalar(Math.cos(spin)).addScaledVector(bx, Math.sin(spin));
  const b = V().crossVectors(nn, a).normalize();
  const h = size / 2;
  const mid = g.vert(c, nn, (uv[0] + uv[2]) / 2, (uv[1] + uv[3]) / 2, color, birth, anchor, sway);
  const ids: number[] = [];
  const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [x, y] of cs) {
    const p = c.clone().addScaledVector(a, x * h).addScaledVector(b, y * h).addScaledVector(nn, -droop * size);
    const pn = nn.clone().addScaledVector(a, x * 0.55).addScaledVector(b, y * 0.55).normalize();
    ids.push(g.vert(p, pn, x < 0 ? uv[0] : uv[2], y < 0 ? uv[1] : uv[3], color, birth, anchor, sway));
  }
  for (let k = 0; k < 4; k++) g.tri(mid, ids[k], ids[(k + 1) % 4]);
}

/** A flat square card centered at `c`, facing `n` (small flowers seen from above). */
export function flatCard(
  g: GeoBuilder, c: THREE.Vector3, n: THREE.Vector3, spin: number, size: number, uv: UV,
  color: THREE.Color, birth: number, anchor: THREE.Vector3, sway: number,
) {
  const nn = n.clone().normalize();
  const a0 = Math.abs(nn.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
  const ax = V().crossVectors(nn, a0).normalize();
  const bx = V().crossVectors(nn, ax).normalize();
  const a = ax.clone().multiplyScalar(Math.cos(spin)).addScaledVector(bx, Math.sin(spin));
  const b = V().crossVectors(nn, a).normalize();
  const h = size / 2;
  const ids: number[] = [];
  const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [x, y] of cs) {
    const p = c.clone().addScaledVector(a, x * h).addScaledVector(b, y * h);
    ids.push(g.vert(p, nn, x < 0 ? uv[0] : uv[2], y < 0 ? uv[1] : uv[3], color, birth, anchor, sway));
  }
  g.quad(ids[0], ids[1], ids[2], ids[3]);
}

/** Scale finished parts so the whole plant is exactly `H` tall and `Sp` wide (positions and anchors). */
export function fitMat(parts: GeoBuilder[], H: number, Sp: number) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = 0.001;
  for (const g of parts) for (let i = 0; i < g.pos.length; i += 3) {
    x0 = Math.min(x0, g.pos[i]); x1 = Math.max(x1, g.pos[i]);
    z0 = Math.min(z0, g.pos[i + 2]); z1 = Math.max(z1, g.pos[i + 2]);
    y1 = Math.max(y1, g.pos[i + 1]);
  }
  const sx = Sp / Math.max(x1 - x0, z1 - z0), sy = H / y1;
  for (const g of parts) for (const arr of [g.pos, g.anchor]) for (let i = 0; i < arr.length; i += 3) {
    arr[i] *= sx;
    arr[i + 1] = Math.max(0.003, arr[i + 1] * sy);
    arr[i + 2] *= sx;
  }
}

/* ------------------------------------------------------------------ */
/* Trailing stems                                                       */
/* ------------------------------------------------------------------ */

export interface Runner {
  pts: THREE.Vector3[];
  level: number;
  length: number;
  /** 0 hugging the ground .. 1 riding on top of the mat. */
  layer: number;
}

export interface RunnerOpts {
  /** Primary stems from the crown. */
  n: number;
  /** Mat radius, meters. */
  R: number;
  step: number;
  /** Heading wander per step, radians. */
  wander: number;
  /** Primaries stop between reachMin * R and R, so the edge is ragged. */
  reachMin: number;
  /** Side branch levels: spacing along the parent, angle off it, length range. */
  levels: { every: number; angle: number; len: [number, number] }[];
  /** Height of a stem point: rho = distance from the crown / R. */
  y: (rho: number, layer: number) => number;
}

/** Stems that radiate from the crown and creep outward, branching alternately. */
export function growRunners(r: () => number, o: RunnerOpts): Runner[] {
  const out: Runner[] = [];
  const walk = (x: number, z: number, heading: number, maxLen: number, reach: number, level: number, layer: number) => {
    const flat: { x: number; z: number; h: number }[] = [{ x, z, h: heading }];
    let len = 0;
    while (len < maxLen && Math.hypot(x, z) < reach) {
      heading += (r() - 0.5) * o.wander;
      // Lean back toward straight out so stems never loop into the crown.
      const radial = Math.atan2(z, x);
      let d = radial - heading;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      heading += d * 0.1;
      x += Math.cos(heading) * o.step;
      z += Math.sin(heading) * o.step;
      len += o.step;
      flat.push({ x, z, h: heading });
    }
    if (flat.length < 2) return;
    out.push({ pts: flat.map((p) => V(p.x, o.y(Math.hypot(p.x, p.z) / o.R, layer), p.z)), level, length: len, layer });
    const L = o.levels[level];
    if (!L) return;
    let side = r() < 0.5 ? 1 : -1;
    for (let s = L.every * (0.4 + r() * 0.6); s < len - o.step; s += L.every * (0.7 + r() * 0.6)) {
      const p = flat[Math.min(flat.length - 1, Math.round(s / o.step))];
      side = -side;
      walk(p.x, p.z, p.h + side * (L.angle + (r() - 0.5) * 0.4), lerp(L.len[0], L.len[1], r()), o.R * (0.82 + r() * 0.18), level + 1, clamp(layer + (r() - 0.3) * 0.5));
    }
  };
  for (let i = 0; i < o.n; i++) {
    const az = ((i + r() * 0.8) / o.n) * TAU;
    walk(Math.cos(az) * 0.01, Math.sin(az) * 0.01, az, 99, o.R * (i % 3 === 0 ? 1 : lerp(o.reachMin, 1, r())), 0, r() * 0.5);
  }
  return out;
}

/** Heading (azimuth in the ground plane) of a direction. */
export const heading = (d: THREE.Vector3) => Math.atan2(d.z, d.x);
