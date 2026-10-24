// Renders a passage of Tangerine to WAV + MIDI with headless Chromium.
// node tools/render.mjs --seconds 90 --seed 42 --out tools/renders/name [--minutes 3] [--json '{"global":{"bpm":120}}']
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = playwright;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const seconds = Number(args.seconds || 60);
const seed = Number(args.seed || 42);
const out = args.out || 'renders/test';
const extra = args.json ? JSON.parse(args.json) : {};
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[error]', e.message));
await page.goto(`http://127.0.0.1:${port}/tools/render.html`);
await page.waitForFunction(() => window.ready);
const t0 = Date.now();
const result = await page.evaluate((o) => window.render(o), { seed, seconds, ...(args.minutes ? { minutes: Number(args.minutes) } : {}), ...extra });
console.log(`rendered ${args.minutes ? args.minutes * 60 : seconds}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await mkdir(dirname(resolve(root, out)), { recursive: true });
await writeFile(resolve(root, out + '.wav'), Buffer.from(result.wav, 'base64'));
await writeFile(resolve(root, out + '.mid'), Buffer.from(result.midi, 'base64'));
await writeFile(resolve(root, out + '.abc'), result.abc);
await writeFile(resolve(root, out + '_leadsheet.abc'), result.lead);
await writeFile(resolve(root, out + '.json'), JSON.stringify(result.log, null, 1));
await browser.close();
server.close();
