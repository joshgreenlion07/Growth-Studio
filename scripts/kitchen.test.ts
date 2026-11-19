// Run: node_modules/esbuild/bin/esbuild scripts/kitchen.test.ts --bundle --platform=node --format=esm --outfile=/tmp/kitchen.test.mjs && node /tmp/kitchen.test.mjs
// Every catalog island's bays add up to its runs and every part fits its bay; every part fits the stub it is shown in.
import { KITCHEN_ISLAND_FEATURES, KITCHEN_PARTS, checkIsland, kitchenPartById, partStub } from '../src/siteplan/kitchen';

let bad = 0;
const fail = (msg: string) => { bad++; console.error('FAIL', msg); };
for (const f of KITCHEN_ISLAND_FEATURES) {
  if (!f.island) { fail(`${f.id}: no island`); continue; }
  for (const e of checkIsland(f.island)) fail(`${f.id}: ${e}`);
  const [w, d] = f.footprint;
  if (Math.abs(w / 0.0254 - f.island.runs[0].lengthIn) > 0.01 || Math.abs(d / 0.0254 - f.island.depthIn) > 0.01) fail(`${f.id}: footprint is not the base`);
}
for (const p of KITCHEN_PARTS) {
  if (p.mount !== 'free') for (const e of checkIsland(partStub(p))) fail(`${p.id} stub: ${e}`);
  if (p.cutout && p.mount === 'dropIn' && p.cutout[0] > p.bayIn) fail(`${p.id}: cutout wider than its bay`);
}
if (kitchenPartById.size !== KITCHEN_PARTS.length) fail('duplicate part ids');
console.log(bad ? `${bad} failed` : `ok: ${KITCHEN_ISLAND_FEATURES.length} islands, ${KITCHEN_PARTS.length} parts`);
process.exit(bad ? 1 : 0);
