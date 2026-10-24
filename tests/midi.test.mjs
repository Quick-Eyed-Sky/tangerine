import test from 'node:test';
import assert from 'node:assert/strict';
import { writeMidiFile, varLen, MidiTake, TICKS_PER_STEP } from '../dist/midi.js';

// A small reader, enough to check what the writer wrote.
function readMidi(bytes) {
  let p = 0;
  const str = (n) => String.fromCharCode(...bytes.slice(p, (p += n)));
  const u32 = () => ((bytes[p++] << 24) | (bytes[p++] << 16) | (bytes[p++] << 8) | bytes[p++]) >>> 0;
  const u16 = () => (bytes[p++] << 8) | bytes[p++];
  const vl = () => { let v = 0; let b; do { b = bytes[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; };
  assert.equal(str(4), 'MThd');
  assert.equal(u32(), 6);
  const format = u16(); const count = u16(); const ppq = u16();
  const tracks = [];
  for (let t = 0; t < count; t++) {
    assert.equal(str(4), 'MTrk');
    const end = u32() + p;
    let tick = 0; const events = [];
    while (p < end) {
      tick += vl();
      const status = bytes[p++];
      if (status === 0xff) { const type = bytes[p++]; const len = vl(); events.push({ tick, meta: type, data: bytes.slice(p, p + len) }); p += len; }
      else if ((status & 0xf0) === 0xc0) { events.push({ tick, program: bytes[p++] }); }
      else { events.push({ tick, status, note: bytes[p++], velocity: bytes[p++] }); }
    }
    tracks.push(events);
  }
  return { format, ppq, tracks };
}

test('variable-length quantities', () => {
  assert.deepEqual(varLen(0), [0]);
  assert.deepEqual(varLen(127), [127]);
  assert.deepEqual(varLen(128), [0x81, 0]);
  assert.deepEqual(varLen(0x3fff), [0xff, 0x7f]);
});

test('a take writes a format 1 file: tempo track plus one track per layer, on the grid', () => {
  const take = new MidiTake(100, 116);
  take.note('bass', 38, 1, 100, 0.45);
  take.note('arp', 62, 0.5, 101, 0.7);
  take.chord([50, 57, 65], 100);
  take.tempo(116, 120);
  take.chord([50, 55, 67], 132);
  take.note('bells', 81, 0.6, 99, 8); // before the take: ignored
  const { format, ppq, tracks } = readMidi(take.finish(164));
  assert.equal(format, 1);
  assert.equal(ppq, 480);
  assert.equal(tracks.length, 13);
  const tempos = tracks[0].filter((e) => e.meta === 0x51);
  assert.deepEqual(tempos.map((e) => e.tick), [0, 16 * TICKS_PER_STEP]);
  const bass = tracks[1].filter((e) => e.status);
  assert.deepEqual(bass.map((e) => [e.tick, e.status, e.note]), [[0, 0x90, 38], [54, 0x80, 38]]);
  assert.equal(bass[0].velocity, 127);
  const arp = tracks[2].filter((e) => e.status);
  assert.equal(arp[0].tick, 120);
  assert.equal(arp[0].status, 0x91);
  // The pad: 50 is held across both chords; 57 and 65 end at the change, 55 and 67 begin.
  const pad = tracks[4].filter((e) => e.status);
  const ons = pad.filter((e) => e.status === 0x93).map((e) => [e.note, e.tick]).sort((a, b) => a[0] - b[0]);
  const offs = pad.filter((e) => e.status === 0x83).map((e) => [e.note, e.tick]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(ons, [[50, 0], [55, 3840], [57, 0], [65, 0], [67, 3840]]);
  assert.deepEqual(offs, [[50, 7680], [55, 7680], [57, 3840], [65, 3840], [67, 7680]]);
  assert.equal(tracks[5].filter((e) => e.status).length, 0);
});

test('note-offs come before note-ons at the same tick', () => {
  const bytes = writeMidiFile({ tracks: [{ name: 'x', channel: 0, events: [{ tick: 0, type: 'on', note: 60, velocity: 100 }, { tick: 120, type: 'on', note: 60, velocity: 100 }, { tick: 120, type: 'off', note: 60 }, { tick: 240, type: 'off', note: 60 }] }] });
  const { tracks } = readMidi(bytes);
  const notes = tracks[1].filter((e) => e.status);
  assert.deepEqual(notes.map((e) => e.status), [0x90, 0x80, 0x90, 0x80]);
});

test('a two-hour thread is written as notes: MIDI and ABC, without sound', async () => {
  const { renderNotes } = await import('../dist/audio.js');
  const result = renderNotes({ seed: 7, minutes: 120, global: { bpm: 80 } });
  assert.ok(Math.abs(result.seconds - 7200) < 1);
  const { tracks } = readMidi(result.midi);
  assert.equal(tracks.length, 13);
  assert.ok(tracks[1].filter((e) => e.status === 0x90).length > 10000);
  assert.ok(result.abc.includes('[K:'));
});
