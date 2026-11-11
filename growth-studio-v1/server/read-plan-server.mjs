// Optional plan-reading server for hosting Growth Studio outside Claude.
// It keeps the Anthropic API key on the server and answers the same prompt
// the app builds in src/app/reader.ts.
//
//   ANTHROPIC_API_KEY=... node server/read-plan-server.mjs
//   POST /api/read-plan  { prompt: string, image: base64 JPEG/PNG, mediaType: 'image/jpeg' }
//   -> the SitePlan JSON object
//
// Serves dist/ as static files too, so `npm run build:artifact` then this
// server is a complete local deployment.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.GROWTH_STUDIO_MODEL || 'claude-opus-5-5';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const client = new Anthropic();

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1]); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('The reply held no JSON.');
}

async function readBody(req, limit = 25e6) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw Object.assign(new Error('Upload too large.'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/read-plan') {
      const { prompt, image, mediaType } = JSON.parse(await readBody(req));
      if (typeof prompt !== 'string' || typeof image !== 'string') throw Object.assign(new Error('Send prompt and image.'), { status: 400 });
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      });
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(parseJson(text)));
      return;
    }
    // Static files from dist/.
    const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root)) throw Object.assign(new Error('Not found'), { status: 404 });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: status === 500 ? 'The plan could not be read.' : e.message }));
    if (status === 500) console.error(e);
  }
}).listen(PORT, () => console.log(`Growth Studio on http://localhost:${PORT}`));
