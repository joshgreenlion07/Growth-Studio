// Run: esbuild scripts/test-stones-clear.ts --bundle --platform=node --format=esm --external:three --outfile=out.mjs && node out.mjs
import { placeStones, clearOfSteppingStones } from '../src/builder/pebbles';
import { materialById } from '../src/siteplan/catalog';
import type { FeaturePlacement } from '../src/siteplan/types';

let fail = false;
for (const key of ['half-1', '1-2', '2-3']) {
const spec = materialById.get(`mexican-beach-pebble-${key}`)!;
console.log('fill:', spec.id);
const poly: [number, number][] = [[0, 0], [8, 0], [8, 4], [0, 4]];
const area = { key: 'side', inside: ([x, y]: [number, number]) => x >= 0 && x <= 8 && y >= 0 && y <= 4, height: () => 0, polygon: poly, tint: [1, 1, 1] as [number, number, number] };
const all = placeStones(area, spec);
// A path: 5 stones, staggered, each turned differently.
const feats = [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, catalogId: 'stepping-stone-24', position: [1.5 + i * 1.0, 2 + (i % 2) * 0.15], rotationDeg: i * 23 } as unknown as FeaturePlacement));
const kept = clearOfSteppingStones(all, feats, () => 0);
const S = 0.6096 / 2, TOP = 0.013;
const rel = (s: (typeof all)[0], f: FeaturePlacement) => {
  const a = (-f.rotationDeg * Math.PI) / 180, dx = s.x - f.position[0], dy = s.z - f.position[1];
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
};
// Same top estimate as the filter (tip rise included).
const top = (s: (typeof all)[0]) => s.y + 0.56 * (s.thick * Math.max(Math.cos(s.tipX) * Math.cos(s.tipZ), 0) + Math.max(s.len, s.wid) * (Math.abs(Math.sin(s.tipX)) + Math.abs(Math.sin(s.tipZ))));
// Pebbles over a slab face (center inside the slab inset 4 mm) with top above the slab top.
const poking = (list: typeof all) => list.filter((s) => feats.some((f) => { const [x, z] = rel(s, f); return Math.abs(x) < S - 0.004 && Math.abs(z) < S - 0.004 && top(s) > TOP; })).length;
// The first version: every piece whose circle touched the slab + 1 cm.
const oldRule = all.filter((s) => feats.some((f) => { const [x, z] = rel(s, f); const r = Math.max(s.len, s.wid) * 0.55 + 0.01; return Math.max(Math.abs(x) - S, 0) ** 2 + Math.max(Math.abs(z) - S, 0) ** 2 < r * r; })).length;
const removed = all.length - kept.length;
const same = kept.every((s) => all.includes(s));
console.log({ total: all.length, removedNow: removed, removedFirstVersion: oldRule, poking_before: poking(all), poking_after: poking(kept), keptAreOriginals: same });
if (poking(kept) !== 0 || !same || removed >= oldRule || all.length - kept.length !== all.filter((q) => !kept.includes(q)).length) fail = true;
}
console.log(fail ? 'FAIL' : 'PASS');
if (fail) process.exit(1);
