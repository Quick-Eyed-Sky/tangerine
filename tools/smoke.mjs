// Opens the app, plays, records a few seconds, and saves a screenshot.
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const url = process.argv[2] || 'http://127.0.0.1:4250/';
const shot = process.argv[3] || 'tools/renders/screen.png';
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.click('#transport');
await page.waitForTimeout(3000);
await page.click('#recordButton');
await page.waitForTimeout(5000);
await page.click('#recordButton');
await page.waitForTimeout(1500);
// Solo one layer, then back to the mix; a random harmony; new sequences by themselves.
await page.click('[aria-label="Listen to Low strings only"]');
await page.waitForTimeout(1500);
const solo = await page.evaluate(() => ({ solo: window.tangerine.audio.solo, panel: !document.getElementById('soloPanel').hidden }));
console.log('solo', JSON.stringify(solo));
await page.click('#returnToMix');
await page.click('#randomHarmony');
console.log('random', await page.textContent('#randomNote'));
await page.selectOption('#renew', '32');
await page.waitForTimeout(1000);
// Layers change: force one at the next step, on a chord change.
const before = await page.evaluate(() => document.querySelectorAll('.layer:not(.off)').length);
await page.evaluate(() => { const e = window.tangerine.audio.engine; e.nextRotateAt = e.stepIndex; e.harmony.endStep = e.stepIndex + 2; });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ on: document.querySelectorAll('.layer:not(.off)').length, toast: document.getElementById('toast').textContent, note: document.getElementById('rotateNote').textContent }));
console.log('rotate', before, JSON.stringify(after));
await page.selectOption('#keepLength', '30');
await page.click('#keepButton');
await page.waitForTimeout(1500);
const state = await page.evaluate(() => ({
  playing: window.tangerine.audio.playing,
  chord: document.getElementById('chordName').textContent,
  key: document.getElementById('keyLine').textContent,
  takes: [...document.querySelectorAll('#takes a')].map((a) => a.download),
  feed: window.tangerine.audio.feed.length,
  step: window.tangerine.audio.engine.stepIndex,
}));
console.log(JSON.stringify(state));
// Turn on all "shape & echo" panels for the screenshot of one card.
await page.evaluate(() => document.querySelector('details').setAttribute('open', ''));
await page.screenshot({ path: shot, fullPage: true });
// The take's WAV length.
const sizes = await page.evaluate(async () => Promise.all([...document.querySelectorAll('#takes a')].map(async (a) => (await (await fetch(a.href)).arrayBuffer()).byteLength)));
console.log('take sizes', sizes);
console.log('errors', errors);
await browser.close();
