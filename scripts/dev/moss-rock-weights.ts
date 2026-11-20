// Prints each library rock's weight at its standard size (ROCK_LB in src/siteplan/waterrocks.ts) and the average
// fill (rock volume over its box) of the three generic moss rock shapes. Run: node scripts/moss-rock-weights.mjs
import * as THREE from 'three';
import { buildMossRock, MOSS_ROCK_GRAY } from '../../src/builder/mossrock';
import { LIBRARY_ROCKS } from '../../src/siteplan/waterrocks';

const IN = 0.0254, BURIED = 0.2, LB_PER_M3 = 160 * 35.3147;

/** The closed mesh's volume, m³ (signed tetrahedra from the origin). */
function volume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position').array as Float32Array, ix = g.index!.array;
  let v = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

const lb: Record<string, number> = {};
for (const r of LIBRARY_ROCKS) {
  const std = r.ratio.map((k) => Math.round(r.nominal * k) * IN) as [number, number, number];
  const g = buildMossRock({ size: std, buried: BURIED, seed: `library:${r.code}`, moss: false, form: r.form, look: r.shade === 'gray' ? MOSS_ROCK_GRAY : undefined, spacing: 0.006 });
  lb[r.id] = Math.round(volume(g) * LB_PER_M3);
}
console.log(JSON.stringify(lb));
const fill: Record<string, number> = {};
for (const form of ['rounded', 'tall', 'flat'] as const) {
  let sum = 0;
  for (let k = 0; k < 8; k++) {
    const size: [number, number, number] = [0.56, 0.46, 0.38];
    const g = buildMossRock({ size, buried: BURIED, seed: `fill-${k}`, moss: false, form, spacing: 0.006 });
    sum += volume(g) / (size[0] * size[1] * (size[2] / (1 - BURIED)));
  }
  fill[form] = +(sum / 8).toFixed(3);
}
console.log(JSON.stringify(fill));
