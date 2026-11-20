import * as THREE from 'three';
import { rng } from '../siteplan/geometry';
import { vnoise } from '../engine/noise';
import type { Quality } from '../engine/post';
import { rockMaterial } from './materials';
import { FIELD_MAX_SEGMENTS, MOSS_ROCK_GRANITE, MOSS_ROCK_SPACING, buildMossRock, mossRockMaterial, type MossRockForm } from './mossrock';

/*
 * Stones placed as instances of a few shared shapes: the plain Boulder of the catalog and the stones of the built water
 * features (round a pond, along a stream's banks, a fall's spill and cheek stones, the head stack, a bubbler's rock).
 * The boulders are moss rock in weathered tan granite (builder/mossrock.ts), each shape fitted to the box of the stone it
 * replaced, so a stone stands where it stood and covers what it covered; the material draws pores and lichen from where
 * each stone is, so no two show the same. Small loose stones (a pondless fall's cobble basin) keep the plain cobble.
 */

const VARIANTS = 5;
/** Moss rock shapes fitted to each plain shape's box, so a long stream bank does not repeat one stone every fifth. */
const ALTERNATES = 3;
const cobbles: THREE.BufferGeometry[] = [];

/** A plain lumpy stone about 1 m across, its foot flattened a little below y = 0 (the cobble, and the boulders' box). */
function cobbleGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(`rock${seed}`);
  const sx = 0.8 + r() * 0.5, sy = 0.45 + r() * 0.3, sz = 0.7 + r() * 0.4;
  const v = new THREE.Vector3();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d =
      vnoise(n.x * 2.2 + seed, n.y * 2.2 + n.z * 1.7, 1e6, seed) * 0.35 +
      vnoise(n.x * 6 + seed * 3, n.z * 6 + n.y * 2, 1e6, seed + 1) * 0.12;
    // Flatten into facets for a fractured look.
    const facet = Math.round(d * 6) / 6;
    const k = 0.75 + (d * 0.6 + facet * 0.4);
    v.set(v.x * sx * k, v.y * sy * k, v.z * sz * k);
    if (v.y < -0.1) v.y = -0.1 + (v.y + 0.1) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
    const c = 0.72 + d * 0.35;
    colors[i * 3] = c * (0.98 + r() * 0.04);
    colors[i * 3 + 1] = c * (0.95 + r() * 0.04);
    colors[i * 3 + 2] = c * 0.9;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** The plain cobble shape `i` (of five). */
export function rockVariant(i: number): THREE.BufferGeometry {
  if (!cobbles.length) for (let k = 0; k < VARIANTS; k++) cobbles.push(cobbleGeometry(k + 1));
  return cobbles[((i % VARIANTS) + VARIANTS) % VARIANTS];
}

/**
 * An instanced boulder's mesh is this much coarser than a lone boulder's at the same quality: one shape is drawn for many
 * stones, built at about 1 m and scaled down to each (so at the stones' own size it is about as fine as a lone rock's).
 */
export const INSTANCED_COARSER = 2.5;

const boulders = new Map<string, THREE.BufferGeometry>();

/**
 * Boulder shape `i` (alternate `alt`) in moss rock: fitted to the box of plain shape `i` (its length, depth, height and
 * the part below y = 0), so every stone keeps the place and size it had. Built once per quality and form, when first
 * needed, and kept; light (FIELD_MAX_SEGMENTS), as one shape is drawn for many stones.
 */
export function boulderVariant(i: number, form: MossRockForm, quality: Quality, alt = 0): THREE.BufferGeometry {
  const v = ((i % VARIANTS) + VARIANTS) % VARIANTS;
  const key = `${v}:${alt}:${form}:${quality}`;
  let g = boulders.get(key);
  if (g) return g;
  const box = rockVariant(v).boundingBox!;
  const total = box.max.y - box.min.y;
  g = buildMossRock({
    size: [box.max.x - box.min.x, box.max.z - box.min.z, box.max.y],
    buried: -box.min.y / total,
    seed: alt ? `field-boulder:${v}:${form}:${alt}` : `field-boulder:${v}:${form}`,
    moss: true,
    form,
    look: MOSS_ROCK_GRANITE,
    spacing: MOSS_ROCK_SPACING[quality] * INSTANCED_COARSER,
    maxSegments: FIELD_MAX_SEGMENTS[quality],
  });
  // Centered as the plain shape was.
  g.translate((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
  g.computeBoundingSphere();
  boulders.set(key, g);
  return g;
}

export interface RockSpot {
  x: number;
  y: number;
  z: number;
  size: number;
  rot: number;
  seed: string;
  /** 'cobble': a small loose stone, kept plain. 'flat': a boulder with a flat top (a fall's spill stone). */
  kind?: 'cobble' | 'flat';
}

/** One instanced mesh per stone shape. `quality`: how fine the boulders' mesh is. */
export function rockField(spots: RockSpot[], name = 'rocks', quality: Quality = 'balanced'): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  if (!spots.length) return group;
  const buckets = new Map<string, { kind: RockSpot['kind']; v: number; alt: number; list: RockSpot[] }>();
  for (const s of spots) {
    // The shape's box is drawn from the seed as it always was, so a stone keeps its proportions; the alternate from
    // the seed apart, so it does not change them.
    const v = Math.floor(rng(s.seed)() * VARIANTS);
    const alt = s.kind === 'cobble' ? 0 : Math.floor(rng(`alt:${s.seed}`)() * ALTERNATES);
    const key = `${s.kind ?? 'boulder'}:${v}:${alt}`;
    const b = buckets.get(key) ?? { kind: s.kind, v, alt, list: [] };
    b.list.push(s);
    buckets.set(key, b);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Color();
  for (const { kind, v, alt, list } of buckets.values()) {
    const cobble = kind === 'cobble';
    const geo = cobble ? rockVariant(v) : boulderVariant(v, kind === 'flat' ? 'flat' : 'rounded', quality, alt);
    const im = new THREE.InstancedMesh(geo, cobble ? rockMaterial() : mossRockMaterial(MOSS_ROCK_GRANITE), list.length);
    im.castShadow = true;
    im.receiveShadow = true;
    list.forEach((s, i) => {
      const r = rng(s.seed);
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, s.rot, (r() - 0.5) * 0.3));
      sc.set(s.size * (0.8 + r() * 0.4), s.size * (0.7 + r() * 0.5), s.size * (0.8 + r() * 0.4));
      t.set(s.x, s.y, s.z);
      m.compose(t, q, sc);
      im.setMatrixAt(i, m);
      // Each boulder a little lighter or darker, warmer or cooler than the next of its shape.
      if (!cobble) {
        const k = 0.9 + r() * 0.2, w = (r() - 0.5) * 0.08;
        im.setColorAt(i, c.setRGB(k * (1 + w), k, k * (1 - w)));
      }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

/** Frees a rock field's instance buffers; the shapes are shared and kept for the next yard. */
export function disposeRockField(field: THREE.Group) {
  for (const o of field.children) if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
}
