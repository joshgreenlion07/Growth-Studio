// Run: node node_modules/esbuild/bin/esbuild scripts/roofskeleton.test.ts --bundle --platform=node --format=esm --outfile=/tmp/roofskeleton.test.mjs && node /tmp/roofskeleton.test.mjs
import { cleanOutline, offsetOutline, signedArea, straightSkeleton } from '../src/builder/roofskeleton';
import type { Vec2 } from '../src/siteplan/types';

const fails: string[] = [];
const fail = (m: string) => fails.push(m);
const ngon = (k: number, r = 5): Vec2[] => Array.from({ length: k }, (_, i) => [Math.cos((i / k) * Math.PI * 2) * r, Math.sin((i / k) * Math.PI * 2) * r] as Vec2);
const shapes: Record<string, { p: Vec2[]; ridge: number }> = {
  rect: { p: [[0, 0], [20, 0], [20, 10], [0, 10]], ridge: 5 },
  L: { p: [[0, 0], [20, 0], [20, 10], [8, 10], [8, 18], [0, 18]], ridge: 5 },
  T: { p: [[-5, 0], [5, 0], [5, 4], [1, 4], [1, 10], [-1, 10], [-1, 4], [-5, 4]], ridge: 2 },
  U: { p: [[0, 0], [20, 0], [20, 12], [14, 12], [14, 5], [6, 5], [6, 12], [0, 12]], ridge: 3 },
  bay: { p: [[0, 0], [20, 0], [20, 10], [12, 10], [11, 11], [9, 11], [8, 10], [0, 10]], ridge: 5 },
};
for (const [name, { p, ridge }] of Object.entries(shapes)) for (const rev of [false, true]) {
  const q = rev ? [...p].reverse() : p;
  const sk = straightSkeleton(q);
  if (!sk.ok || Math.abs(sk.maxT - ridge) > 1e-6) fail(`${name}${rev ? ' rev' : ''}: ok ${sk.ok}, ridge ${sk.maxT}`);
  const area = sk.pieces.reduce((a, pc) => a + Math.abs(signedArea(pc.pts.map((x) => [x[0], x[1]] as Vec2))), 0);
  if (Math.abs(area - Math.abs(signedArea(q))) > 1e-6 * Math.abs(signedArea(q)) + 1e-6) fail(`${name}: pieces cover ${area}`);
  if (!offsetOutline(q, q.map(() => 0.5))) fail(`${name}: no eave outline`);
}
// Every corner of a convex outline ends in a hip, the last three of each closing region too.
for (const [name, p] of [['triangle', [[0, 0], [10, 0], [3, 7]] as Vec2[]], ['pentagon', ngon(5)], ['64-gon', ngon(64)], ['square', ngon(4)]] as const) {
  const sk = straightSkeleton(p);
  const hips = sk.arcs.filter((a) => a.kind === 'hip').length;
  if (!sk.ok || hips !== p.length) fail(`${name}: ${hips} hips for ${p.length} corners`);
}
// A gable: zero speed on the short ends.
const g = straightSkeleton(shapes.rect.p, [1, 0, 1, 0]);
if (!g.ok || Math.abs(g.maxT - 5) > 1e-6 || g.arcs.some((a) => a.kind === 'hip')) fail('gable rectangle');
// Staircase footprints.
let bad = 0;
for (let s = 0; s < 300; s++) {
  let seed = s * 9301 + 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const W = 10 + rnd() * 15, pts: Vec2[] = [[0, 0], [W, 0]];
  let cy = 0, cx = W;
  const steps = 2 + Math.floor(rnd() * 4);
  for (let i = 0; i < steps; i++) { cy += 2 + rnd() * 5; pts.push([cx, cy]); cx = Math.max(1, cx - (1 + rnd() * (cx / steps))); pts.push([cx, cy]); }
  cy += 2 + rnd() * 4; pts.push([cx, cy], [0, cy]);
  if (!straightSkeleton(cleanOutline(pts).pts).ok) bad++;
}
if (bad) fail(`${bad} staircase footprints failed`);
if (fails.length) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
console.log('PASS');
