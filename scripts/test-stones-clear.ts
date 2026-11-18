// Run: esbuild scripts/test-stones-clear.ts --bundle --platform=node --format=esm --external:three --outfile=out.mjs && node out.mjs
import { placeStones, clearOfSteppingStones } from '../src/builder/pebbles';
import { materialById } from '../src/siteplan/catalog';
import type { FeaturePlacement } from '../src/siteplan/types';

const spec = [...materialById.values()].find((m) => m.pebble && /beach/i.test(m.name + m.id)) ?? [...materialById.values()].find((m) => m.pebble)!;
console.log('fill:', spec.id);
const poly: [number, number][] = [[0, 0], [8, 0], [8, 4], [0, 4]];
const area = { key: 'side', inside: ([x, y]: [number, number]) => x >= 0 && x <= 8 && y >= 0 && y <= 4, height: () => 0, polygon: poly, tint: [1, 1, 1] as [number, number, number] };
const all = placeStones(area, spec);
// A path: 5 stones, staggered, each turned differently.
const feats = [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, catalogId: 'stepping-stone-24', position: [1.5 + i * 1.0, 2 + (i % 2) * 0.15], rotationDeg: i * 23 } as unknown as FeaturePlacement));
const kept = clearOfSteppingStones(all, feats);
const S = 0.6096 / 2, M = 0.01;
const hits = (list: typeof all) => list.filter((s) => feats.some((f) => {
  const a = (-f.rotationDeg * Math.PI) / 180, dx = s.x - f.position[0], dy = s.z - f.position[1];
  const lx = dx * Math.cos(a) - dy * Math.sin(a), lz = dx * Math.sin(a) + dy * Math.cos(a);
  const reach = Math.max(s.len, s.wid) * 0.55 + M;
  return Math.max(Math.abs(lx) - S, 0) ** 2 + Math.max(Math.abs(lz) - S, 0) ** 2 < reach * reach;
})).length;
const under = hits(all);
const same = kept.every((s) => all.includes(s));
console.log({ total: all.length, intersectingBefore: under, intersectingAfter: hits(kept), removed: all.length - kept.length, elsewhereUnchanged: same && all.length - kept.length === under });
if (under === 0 || hits(kept) !== 0 || !same || all.length - kept.length !== under) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
