// Measures the moss rock library's weights (see scripts/dev/moss-rock-weights.ts): bundles it with esbuild and runs it.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({ entryPoints: [join(root, 'scripts/dev/moss-rock-weights.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning' });
await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
