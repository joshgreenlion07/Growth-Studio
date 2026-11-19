// Builds dist/growth-studio.html: one self-contained page with the app,
// three.js and pdf.js inlined. Used for the published demo and for any host
// that wants a single file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [join(root, 'src/app/main.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  write: false,
  legalComments: 'none',
  // The one brand image (the Green Lion logo on the Library's book cover) goes in as a data URL, like the sounds.
  loader: { '.png': 'dataurl' },
  logLevel: 'warning',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const worker = readFileSync(join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8').replace(/<\/script/gi, '<\\/script');
const page = readFileSync(join(root, 'src/app/page.html'), 'utf8');
// The sound clips (public/sounds, ElevenLabs sound effects) go in as base64, so the single file needs no other files.
const sounds = {};
for (const f of readdirSync(join(root, 'public/sounds')).filter((n) => n.endsWith('.mp3'))) sounds[f.slice(0, -4)] = readFileSync(join(root, 'public/sounds', f)).toString('base64');
const html = `${page}\n<script id="pdf-worker" type="text/plain">${worker}</script>\n<script id="sound-data" type="application/json">${JSON.stringify(sounds)}</script>\n<script>${js}</script>\n`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/growth-studio.html'), html);
// A full document for opening directly in a browser.
writeFileSync(join(root, 'dist/index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`);
console.log(`dist/growth-studio.html ${(html.length / 1e6).toFixed(2)} MB`);
