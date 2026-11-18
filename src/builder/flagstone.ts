import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { FLAGSTONE_PREFIX, materialById, type FeatureSpec, type MaterialSpec } from '../siteplan/catalog';
import { featureSize } from '../siteplan/decor';
import { flagOutline } from '../siteplan/stepping';
import type { FeaturePlacement, Vec2 } from '../siteplan/types';
import { flagFaceSet } from '../engine/surfaces';
import { pbrMaterial } from './materials';
import { footSink, type GroundAt } from './stonegeo';

/*
 * Flagstone pieces for water features (siteplan/waterrocks.ts): a spillway lip stone, a ledge of stacked slabs and an
 * edge piece. They are cut from the same three flagstones, with the same cleft-face texture and the same broken-edge
 * outlines and bevel as the stepping stones (siteplan/stepping.ts, `flagstonePiece` in features.ts): Cold Water Canyon
 * (rhyolite, 2 in), AZ Classic Oak (sandstone, 2 in) and SUI Black Slate (slate, 1 in). The stone is the placement's
 * `materialId`; a piece is as thick as its stone, so the size's own height only sets a ledge's stack.
 */

/** The stone a piece is cut from: the placement's own when it names a flagstone, else AZ Classic Oak (as the steppers). */
export function flagLookOf(f: FeaturePlacement): MaterialSpec {
  const own = f.materialId ? materialById.get(f.materialId) : undefined;
  return own?.flag ? own : materialById.get(`${FLAGSTONE_PREFIX}az-classic-oak`)!;
}

/** The material of a stone's cleft face (shared with the steppers). */
export function flagMaterial(look: MaterialSpec): THREE.Material {
  return pbrMaterial(`flag:${look.id}`, flagFaceSet(look));
}

/** Extrudes an outline into a piece with its top `top` above the local origin (features.ts `flagstonePiece`). */
export type PieceMaker = (outline: Vec2[], look: MaterialSpec, top: number, seed: string) => THREE.BufferGeometry;

export interface FlagContext {
  f: FeaturePlacement;
  spec: FeatureSpec;
  /** Add a part (merged per material). */
  add: (m: THREE.Material, g: THREE.BufferGeometry) => void;
  piece: PieceMaker;
  /** The top of paving the piece is set on (0 on turf, beds and bare ground). */
  lift?: number;
  /** The ground around the piece, for setting it into a slope (see footSink). */
  ground?: GroundAt;
}

const IN = 0.0254;

/** An outline stretched to a box `length` x `depth` and centered on it. */
function fitOutline(outline: Vec2[], length: number, depth: number): Vec2[] {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of outline) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const kx = length / Math.max(1e-6, x1 - x0), kz = depth / Math.max(1e-6, z1 - z0);
  return outline.map(([x, z]) => [(x - (x0 + x1) / 2) * kx, (z - (z0 + z1) / 2) * kz]);
}

/** A cut stone: a rectangle with worn corners (and a rounder front, toward +z). */
function cutOutline(length: number, depth: number, seed: string): Vec2[] {
  const r = rng(`flagcut:${seed}`);
  const a = length / 2, b = depth / 2;
  const pts: Vec2[] = [];
  const corner = (cx: number, cz: number, start: number, rad: number) => {
    for (let k = 0; k <= 4; k++) {
      const t = start + (k / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * rad, cz + Math.sin(t) * rad]);
    }
  };
  const small = Math.min(0.012 + r() * 0.01, b / 3), front = Math.min(0.03 + r() * 0.02, b / 2.2);
  corner(a - front, b - front, 0, front);                  // front right
  corner(-a + front, b - front, Math.PI / 2, front);       // front left
  corner(-a + small, -b + small, Math.PI, small);          // back left
  corner(a - small, -b + small, Math.PI * 1.5, small);     // back right
  return pts;
}

/** Spillway lip stone, ledge of stacked slabs, or edge piece, at the feature's spot. */
export function buildFlagstone(c: FlagContext) {
  const look = flagLookOf(c.f);
  const mat = flagMaterial(look);
  const t = (look.flag?.thicknessIn ?? 2) * IN;
  const [L, D, H] = featureSize(c.spec, c.f.size, 0.05);
  const r = rng(`flagplace:${c.f.id}`);
  // On paving it sits on the paving's top; on the ground it is sunk to the lowest point of its foot.
  const base = c.lift ? c.lift : -footSink(c.ground, L, D, 0.04);

  if (c.spec.kind === 'flagLedge') {
    // Slabs stacked to the height asked, each a little back from the one below and a little off square.
    const n = Math.max(2, Math.min(14, Math.round(H / t)));
    for (let i = 0; i < n; i++) {
      // The stack narrows about a quarter from bottom to top however many slabs it has.
      const up = n > 1 ? i / (n - 1) : 0;
      const li = L * (1 - 0.25 * up) * (0.94 + r() * 0.1), di = D * (1 - 0.3 * up) * (0.92 + r() * 0.12);
      const g = c.piece(fitOutline(flagOutline(`${c.f.id}-${i}`, [li / IN, li / IN]), li, di), look, t, `${c.f.id}-${i}`);
      g.rotateY((r() - 0.5) * 0.16);
      g.translate((r() - 0.5) * L * 0.06, base + i * t, -0.16 * D * up + (r() - 0.5) * D * 0.04);
      c.add(mat, g);
    }
    return;
  }

  if (c.spec.kind === 'flagLip') {
    // A cut stone, its front edge toward +z and dropping a little, as a lip a fall pours over is set.
    const g = c.piece(cutOutline(L, D, c.f.id), look, t, c.f.id);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      // The upper half of the stone only: its underside stays flat on the ground.
      if (pos.getY(i) > t * 0.5 && z > 0) pos.setY(i, pos.getY(i) - 0.008 * Math.max(0, (z / (D / 2) - 0.3) / 0.7) ** 2);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.translate(0, base, 0);
    c.add(mat, g);
    return;
  }

  // Edge piece: one broken stone.
  const g = c.piece(fitOutline(flagOutline(c.f.id, [L / IN, L / IN]), L, D), look, t, c.f.id);
  g.translate(0, base, 0);
  c.add(mat, g);
}
