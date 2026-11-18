import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, jitter, leafQuad, lerp, rng, smoothstep, uvCell, type PlantSpec, type SpeciesGeo } from '../kit';
import { headCards, headWood, growHead, trunkWood, type CitrusStyle, type Head } from './shared-standards';
import { WOOD_BEND, fitBuilders, limbAt } from './shared-trees-a';

/**
 * Citrus standards whose fruit has a shape of its own (the lemon's neck and
 * nipple, the navel orange's navel), built on the shared-standards head:
 * navel-orange.ts and eureka-lemon.ts.
 *
 * Two things differ from buildCitrus in shared-standards:
 *  - Fruit is a lathe from a profile (stem end to apex), not a ball.
 *  - The young head. The foliage shader shrinks the mature tree to the
 *    install size, so a 15 gal tree drawn from the mature head wears leaves
 *    a third of their real size. Here the mature head's leaf cards come in
 *    as the tree grows, and the tree at install wears its own, fewer cards
 *    on the inner limbs, drawn larger so that, shrunk, its leaves are near
 *    their real size and the head is as open as a young nursery tree's. At
 *    maturity those cards sit deep inside the head, in its shade.
 */

/** Fruit outline: radius (fraction of the fruit radius) and height (same units, 0 at the equator, + up) at t, 0 stem end .. 1 apex. */
export type FruitProfile = (t: number) => [number, number];

/** A lathe-turned fruit hanging from its stem end; UVs wrap the given rectangle (top of the cell at the stem end). */
export function latheFruit(
  g: GeoBuilder, c: THREE.Vector3, rad: number, prof: FruitProfile, uv: [number, number, number, number], color: THREE.Color,
  birth: number, anchor: THREE.Vector3, sway: number, segU: number, segV: number, spin: number, tilt: THREE.Vector3,
) {
  const rows: number[][] = [];
  // Axis leans a little off vertical (fruit never hangs perfectly plumb).
  const ax = UP.clone().add(tilt).normalize();
  const s1 = V().crossVectors(ax, V(1, 0, 0.3)).normalize(), s2 = V().crossVectors(ax, s1).normalize();
  const pt = (t: number) => prof(clamp(t));
  for (let j = 0; j <= segV; j++) {
    const t = j / segV;
    const [pr, py] = pt(t);
    // Normal from the profile's slope.
    const e = 0.01;
    const [ra, ya] = pt(t - e), [rb, yb] = pt(t + e);
    const dr = rb - ra, dy = yb - ya;
    const row: number[] = [];
    for (let i = 0; i <= segU; i++) {
      const th = (i / segU) * Math.PI * 2 + spin;
      const radial = s1.clone().multiplyScalar(Math.cos(th)).addScaledVector(s2, Math.sin(th));
      const p = c.clone().addScaledVector(radial, pr * rad).addScaledVector(ax, py * rad);
      // Outline tangent (dr, dy) in the (radial, axis) plane; the outward normal is (dy, -dr).
      let n = radial.clone().multiplyScalar(-dy).addScaledVector(ax, dr);
      if (j === 0) n = ax.clone();
      else if (j === segV) n = ax.clone().negate();
      n.normalize();
      row.push(g.vert(p, n, uv[0] + (uv[2] - uv[0]) * (i / segU), uv[3] + (uv[1] - uv[3]) * t, color, birth, anchor, sway));
    }
    rows.push(row);
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    if (j > 0) g.tri(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1]);
    if (j < segV - 1) g.tri(rows[j][i], rows[j + 1][i + 1], rows[j + 1][i]);
  }
  return pt(0)[1] * rad;
}

export interface VarietyStyle extends CitrusStyle {
  fruitProfile: FruitProfile;
  /**
   * The young head: how deep in the mature head its cards sit (0..1), card size multiplier, spacing along limbs (m),
   * share kept, and `flat` (above 1 keeps it lower than the mature head, so it reads as wide as a young head is).
   */
  young: { depth: number; scale: number; step: number; keep: number; flat: number };
  /** Flower and bud clusters on the young head at install (true size at install). */
  youngBlooms: number;
}

/** Leaf cards of the young head along the limbs present at install. */
function youngCards(g: GeoBuilder, head: Head, r: () => number, st: VarietyStyle) {
  const { center, radii } = head;
  const tips: { p: THREE.Vector3; out: THREE.Vector3 }[] = [];
  for (const l of head.limbs) {
    if (l.birth > 0.02 || l.level > 2) continue;
    const n = Math.max(1, Math.round(l.length / st.young.step));
    for (let k = 0; k < n; k++) {
      const t = lerp(l.level === 0 ? 0.35 : 0.15, 1, (k + r() * 0.8) / n);
      const at = limbAt(l, t);
      const d = head.depth(at.p);
      const dy = at.p.y - head.center.y;
      const dFlat = head.depth(V(at.p.x, head.center.y + dy * (dy > 0 ? st.young.flat : 1), at.p.z));
      if (dFlat > st.young.depth || r() > st.young.keep) continue;
      const out = head.outward(at.p);
      const lat = V().crossVectors(at.dir, UP);
      if (lat.lengthSq() < 0.01) lat.set(1, 0, 0);
      lat.normalize().multiplyScalar(k % 2 ? 1 : -1);
      const dir = at.dir.clone().multiplyScalar(0.5).addScaledVector(lat, 0.6).addScaledVector(out, 0.5).add(V(0, (r() - 0.3) * 0.6, 0)).normalize();
      // Smaller toward the mature head's surface, where they still show once it is grown.
      let size = lerp(st.card[0], st.card[1], r()) * lerp(st.young.scale, 1 + (st.young.scale - 1) * 0.45, smoothstep(0.62, 0.9, d));
      // Keep the card inside the mature head.
      for (let m = 0; m < 6 && head.depth(at.p.clone().addScaledVector(dir, size)) > 0.96; m++) size *= 0.82;
      const face = out.clone().add(V(0, 0.2, 0)).add(V((r() - 0.5) * 0.7, (r() - 0.5) * 0.5, (r() - 0.5) * 0.7)).normalize();
      const shade = lerp(0.82, 1.02, r()) * lerp(0.86, 1, smoothstep(0.2, 0.7, d));
      const c = new THREE.Color(shade * (0.96 + r() * 0.08), shade, shade * (0.94 + r() * 0.08));
      const cell = d > 0.6 && r() < st.flush * 0.4 ? 2 : r() < 0.2 ? 3 : r() < 0.5 ? 0 : 1;
      const s = head.sway(at.p) * WOOD_BEND;
      leafQuad(g, at.p, dir, face, size, size, uvCell(2, 2, cell), c, 0, at.p, {
        segs: 2, curl: (r() - 0.3) * 0.7, center, radii, normalBend: 0.55, sway0: s, sway1: clamp(s + 0.14),
      });
      tips.push({ p: at.p.clone().addScaledVector(dir, size * 0.7), out });
    }
  }
  return tips;
}

/** Build a citrus standard with shaped fruit and a young head. */
export function buildCitrusVariety(spec: PlantSpec, st: VarietyStyle): SpeciesGeo {
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), extra = new GeoBuilder();
  const head = growHead(spec, r, st.head);
  const { H } = head;

  trunkWood(wood, head, r, { graft: H * 0.07, lean: 0.006 });
  headWood(wood, head, col(st.barkTint), col(st.twigTint), 0.25);

  const tips = headCards(leaves, head, r, {
    card: st.card,
    step: st.step,
    cell: (tip, d, out) => (tip && d > 0.78 && out.y > -0.2 && r() < st.flush ? 2 : r() < 0.18 ? 3 : r() < 0.5 ? 0 : 1),
  });
  // The mature head's cards fill in as the tree grows (6 vertices a card); the young head stands in at install.
  for (let v = 0; v < leaves.birth.length; v += 6) {
    const b = Math.max(leaves.birth[v], 0.12 + r() * 0.3);
    for (let k = 0; k < 6 && v + k < leaves.birth.length; k++) leaves.birth[v + k] = b;
  }
  const young = youngCards(leaves, head, r, st);

  const inset = (u: [number, number, number, number]): [number, number, number, number] => [u[0] + 0.012, u[1] + 0.02, u[2] - 0.012, u[3] - 0.02];
  const fruitCells = st.fruit.cells;
  const wsum = fruitCells.reduce((a, c) => a + c[1], 0);
  const outer = tips.filter((t) => head.depth(t.p) > 0.75);
  const tipToward = (az: number, rel: number) => {
    const ce = Math.sqrt(Math.max(0, 1 - rel * rel));
    const want = V(Math.cos(az) * ce, rel, Math.sin(az) * ce);
    let best = outer[0], bd = -2;
    for (let k = 0; k < 60; k++) {
      const t = outer[Math.floor(r() * outer.length)];
      const d = head.outward(t.p).dot(want);
      if (d > bd) { bd = d; best = t; }
    }
    return best;
  };

  // Fruit: hanging at the outside of the mature head, mostly low, in ones to threes.
  let nFruit = 0;
  for (let i = 0; nFruit < st.fruit.count && outer.length && i < st.fruit.count; i++) {
    const t = tipToward(i * 2.39996 + r() * 0.5, lerp(-0.85, st.fruit.top, Math.pow(r(), 1.3)));
    const d = head.depth(t.p);
    const s = head.sway(t.p) * WOOD_BEND;
    const out = head.outward(t.p);
    const k = r() < 0.55 ? 1 : r() < 0.7 ? 2 : 3;
    let pick = r() * wsum, cell = fruitCells[0][0];
    for (const [ci, w] of fruitCells) { if ((pick -= w) <= 0) { cell = ci; break; } }
    const birth = clamp(Math.max(t.birth, head.lowBirth(t.p.y) + 0.05, 0.1 + r() * 0.7), 0, 0.85);
    const hz = V(out.x, 0, out.z).normalize();
    const c0 = t.p.clone();
    for (let m = 0; m < 30 && head.depth(c0) < 0.97; m++) c0.addScaledVector(hz, 0.02);
    for (let j = 0; j < k && nFruit < st.fruit.count; j++) {
      // Green fruit (cell 2) are younger, so smaller.
      const rad = lerp(st.fruit.rad[0], st.fruit.rad[1], r()) * (cell === 2 ? 0.7 + r() * 0.25 : 1);
      const c = c0.clone().addScaledVector(hz, st.surface - rad).add(V((r() - 0.5) * rad * 3, -rad * (1.4 + j * 1.8) - r() * 0.04, (r() - 0.5) * rad * 3));
      const tint = new THREE.Color(1, 0.96 + r() * 0.06, 0.94 + r() * 0.08).multiplyScalar(lerp(0.85, 1.02, d));
      const tilt = V((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35);
      const top = latheFruit(extra, c, rad, st.fruitProfile, inset(uvCell(4, 2, cell)), tint, birth, t.p, s, st.fruit.segs[0], st.fruit.segs[1], r() * 6, tilt);
      leafQuad(extra, c.clone().add(V(-rad * 0.42, top * 0.96, 0)), V(1, 0, 0), UP, rad * 0.84, rad * 0.84, inset(uvCell(4, 2, 3)), col('#ffffff'), birth, t.p, { sway0: s, sway1: s });
      nFruit++;
    }
  }

  // Blossom and bud clusters on the mature head's surface, coming with it.
  const bloom = (p: THREE.Vector3, out: THREE.Vector3, size: number, birth: number, anchor: THREE.Vector3, clusters = false) => {
    const s = head.sway(p) * WOOD_BEND;
    const side = V().crossVectors(out, UP);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    // Young-head clusters face out more (seen from the side on a small tree); the rest face the sky a little.
    const face = out.clone().add(V((r() - 0.5) * 0.4, clusters ? 0.12 : 0.5, (r() - 0.5) * 0.4)).normalize();
    const cell = clusters ? (r() < 0.5 ? 5 : r() < 0.4 ? 6 : 7) : r() < 0.3 ? 4 : r() < 0.5 ? 5 : r() < 0.6 ? 6 : 7;
    const kk = cell === 4 ? 0.6 : 1;
    leafQuad(extra, p.clone().addScaledVector(side, (-size * kk) / 2), side, face, size * kk, size * kk, inset(uvCell(4, 2, cell)), jitter(col('#ffffff'), r, 0, 0, 0.03), birth, anchor, { sway0: s, sway1: s });
  };
  for (let i = 0; i < st.blooms && outer.length; i++) {
    const t = tipToward(i * 2.39996 + 1 + r() * 0.5, lerp(-0.5, 0.95, r()));
    const out = head.outward(t.p);
    const p = t.p.clone();
    for (let m = 0; m < 30 && head.depth(p) < 0.97; m++) p.addScaledVector(out, 0.02);
    p.addScaledVector(out, st.surface * (0.6 + r() * 0.6)).add(V((r() - 0.5) * 0.1, (r() - 0.5) * 0.08, (r() - 0.5) * 0.1));
    bloom(p, out, lerp(st.bloomSize[0], st.bloomSize[1], r()), clamp(0.15 + r() * 0.6, 0, 0.85), t.p);
  }
  // And on the young head at install, at the shoot tips.
  const upper = young.filter((y) => y.out.y > -0.3);
  for (let i = 0; i < st.youngBlooms && upper.length; i++) {
    const y = upper[Math.floor(r() * upper.length)];
    bloom(y.p.clone().addScaledVector(y.out, 0.03), y.out, lerp(st.bloomSize[0], st.bloomSize[1], r()) * st.young.scale, 0, y.p, true);
  }

  fitBuilders([wood, leaves, extra], H, spec.matureSpread);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: extra.build(),
    leafMap: st.leaves(),
    flowerMap: st.fruitMap(),
    bark: { map: st.bark() },
    look: st.look,
  };
}
