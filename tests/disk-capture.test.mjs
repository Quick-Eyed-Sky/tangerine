import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function processor() {
  const messages = [];
  let Capture;
  const context = vm.createContext({
    sampleRate: 8000, Int16Array, Math,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => messages.push(data) }; } },
    registerProcessor: (name, value) => { Capture = value; },
  });
  vm.runInContext(fs.readFileSync(new URL('../dist/disk-capture.js', import.meta.url), 'utf8'), context);
  return { capture: new Capture(), messages };
}

test('disk worklet flushes all stereo frames, including the partial last block', () => {
  const { capture, messages } = processor();
  const left = new Float32Array(128).fill(0.5);
  const right = new Float32Array(128).fill(-0.5);
  for (let i = 0; i < 70; i++) capture.process([[left, right]]);
  capture.port.onmessage({ data: 'stop' });
  const blocks = messages.filter((m) => m.pcm);
  assert.equal(blocks.reduce((n, b) => n + b.frames, 0), 70 * 128);
  assert.equal(messages.at(-1).stopped, true);
  for (const block of blocks) {
    const pcm = new Int16Array(block.pcm);
    for (let i = 0; i < pcm.length; i += 2) {
      assert.equal(pcm[i], 16383);
      assert.equal(pcm[i + 1], -16384);
    }
  }
  const before = messages.length;
  capture.process([[left, right]]);
  assert.equal(messages.length, before);
});

test('disk worklet records silence for an empty input and duplicates mono safely', () => {
  const { capture, messages } = processor();
  capture.process([]);
  capture.process([[new Float32Array(128).fill(2)]]);
  capture.port.onmessage({ data: 'stop' });
  const pcm = new Int16Array(messages[0].pcm);
  assert.equal(messages[0].frames, 256);
  assert.ok(pcm.subarray(0, 256).every((v) => v === 0));
  assert.ok(pcm.subarray(256).every((v) => v === 32767));
});
