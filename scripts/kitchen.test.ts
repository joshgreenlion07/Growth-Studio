// Run: node_modules/esbuild/bin/esbuild scripts/kitchen.test.ts --bundle --platform=node --format=esm --outfile=/tmp/kitchen.test.mjs && node /tmp/kitchen.test.mjs
// Every catalog island fits and its footprint is its counter; every part fits the stub it is shown in; checkIsland
// catches the layouts it should; a plan cannot carry a kitchen part.
import { KITCHEN_ISLAND_FEATURES, KITCHEN_PARTS, LEDGERSTONE_GRIDDLE_ISLAND, checkIsland, islandFootprintIn, kitchenPartById, partStub, type KitchenIsland } from '../src/siteplan/kitchen';
import { cleanPlan } from '../src/siteplan/validate';

let bad = 0;
const fail = (msg: string) => { bad++; console.error('FAIL', msg); };
const IN = 0.0254;
for (const f of KITCHEN_ISLAND_FEATURES) {
  if (!f.island) { fail(`${f.id}: no island`); continue; }
  for (const e of checkIsland(f.island)) fail(`${f.id}: ${e}`);
  const [w, d] = islandFootprintIn(f.island);
  if (Math.abs(f.footprint[0] / IN - w) > 0.01 || Math.abs(f.footprint[1] / IN - d) > 0.01) fail(`${f.id}: footprint is not the counter`);
}
const [cw, cd] = islandFootprintIn(LEDGERSTONE_GRIDDLE_ISLAND);
if (cw !== 129 || cd !== 32.25) fail(`the griddle island's counter is ${cw} x ${cd} in, not 129 x 32.25`);
for (const p of KITCHEN_PARTS) {
  if (p.mount !== 'free') for (const e of checkIsland(partStub(p))) fail(`${p.id} stub: ${e}`);
  if (p.cutout && p.mount === 'dropIn' && Math.max(p.cutout[0], p.overall[0]) > p.bayIn) fail(`${p.id}: wider than its bay`);
}
if (kitchenPartById.size !== KITCHEN_PARTS.length) fail('duplicate part ids');
for (const id of ['kitchen-door-15', 'kitchen-double-door-32', 'kitchen-drawers-2-16', 'kitchen-drawers-3-16', 'kitchen-power-burner', 'kitchen-trash-pullout-double-20', 'kitchen-door-drawer-combo-30', 'kitchen-beverage-center-24']) if (!kitchenPartById.has(id)) fail(`missing ${id}`);
if (kitchenPartById.get('kitchen-stool-bar')?.seatIn !== 30) fail('bar stool seat is not 30 in');

// Layouts checkIsland must reject.
const base = LEDGERSTONE_GRIDDLE_ISLAND;
const withBays = (bays: KitchenIsland['runs'][0]['bays'], more: Partial<KitchenIsland> = {}): KitchenIsland => ({ ...base, ...more, runs: [{ lengthIn: bays.reduce((s, b) => s + b.widthIn, 0), bays }] });
const expectBad = (name: string, isl: KitchenIsland) => { if (!checkIsland(isl).length) fail(`checkIsland passed ${name}`); };
expectBad('a griddle wider than its bay', withBays([{ widthIn: 38.6, top: 'kitchen-griddle-blackstone-28' }]));
expectBad('a pizza dome on a narrow bay', withBays([{ widthIn: 30, top: 'kitchen-pizza-oven-dome' }]));
expectBad('a pizza dome deeper than the counter', withBays([{ widthIn: 51, top: 'kitchen-pizza-oven-dome' }], { depthIn: 24, counter: { ...base.counter, overhangIn: { front: 1.5, back: 0, ends: 1.5 } } }));
expectBad('a zero-width bay', { ...base, runs: [{ lengthIn: 126, bays: [...base.runs[0].bays, { widthIn: 0 }] }] });
expectBad('a negative overhang', { ...base, counter: { ...base.counter, overhangIn: { front: -1, back: 0.75, ends: 1.5 } } });
expectBad('a counter as thick as it is high', { ...base, counter: { ...base.counter, thicknessIn: 36 } });
expectBad('bays that do not add up', { ...base, runs: [{ lengthIn: 120, bays: base.runs[0].bays }] });
expectBad('a door under a sink bowl too tall', withBays([{ widthIn: 20, top: 'kitchen-sink-bar', front: ['kitchen-propane-cabinet-20-tall'] }]));

// A plan carrying a part loses it, with a warning.
const r = cleanPlan({ site: { boundary: [[0, 0], [5, 0], [5, 5], [0, 5]] }, features: [{ id: 'a', catalogId: 'kitchen-grill-32', position: [2, 2] }, { id: 'b', catalogId: 'kitchen-island-ledgerstone-griddle-126', position: [2, 3] }] });
if (r.plan.features.some((f) => f.catalogId.startsWith('kitchen-grill'))) fail('a plan kept a kitchen part');
if (!r.plan.features.some((f) => f.catalogId === 'kitchen-island-ledgerstone-griddle-126')) fail('a plan lost the island');
if (!r.warnings.some((w) => /kitchen part/.test(w))) fail('no warning for a kitchen part');

console.log(bad ? `${bad} failed` : `ok: ${KITCHEN_ISLAND_FEATURES.length} islands, ${KITCHEN_PARTS.length} parts`);
process.exit(bad ? 1 : 0);
