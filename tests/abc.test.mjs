import test from 'node:test';
import assert from 'node:assert/strict';
import { TangerineEngine } from '../dist/engine.js';
import { Journal, sliceToMidi } from '../dist/journal.js';
import { sliceToAbc, sliceToLeadSheet, spellKey, abcKey } from '../dist/abc.js';
import { chordName } from '../dist/theory.js';

// Plays the engine into a journal the way the sound does (without sound).
function journalOf(options, steps, gate = 0.6) {
  const engine = new TangerineEngine(options);
  const journal = new Journal();
  journal.tempo(0, 116);
  for (let i = 0; i < steps; i++) {
    const out = engine.step();
    journal.step(out.step, out.step * 0.13);
    for (const e of out.events) {
      if (e.layer === 'pad') journal.chord(e.notes, e.step, out.harmony?.key || null, out.harmony ? chordName(out.harmony.chord) : '');
      else if (e.notes) journal.hold(e.layer, e.notes, e.step);
      else journal.note(e.layer, e.midi, e.velocity, e.step, e.layer === 'bells' ? 8 : gate * e.span);
    }
  }
  return journal;
}

const duration = (bar) => {
  const clean = bar.replace(/\[[KQ]:[^\]]*\]/g, '');
  let total = 0;
  for (const m of clean.matchAll(/(\[[^\]]+\]|[_^=]*[A-Ga-gz][,']*)(\d*)-?/g)) total += m[2] ? Number(m[2]) : 1;
  return total;
};

test('keys are spelled with the fewest accidentals', () => {
  assert.equal(abcKey({ tonic: 2, mode: 'dorian' }), 'D dor');
  assert.equal(abcKey({ tonic: 3, mode: 'dorian' }), 'Eb dor');
  assert.equal(abcKey({ tonic: 6, mode: 'lydian' }), 'Gb lyd'); // five flats rather than seven sharps
  assert.equal(abcKey({ tonic: 9, mode: 'mixolydian' }), 'A mix');
  assert.equal(abcKey({ tonic: 10, mode: 'aeolian' }), 'Bb min');
  assert.equal(spellKey({ tonic: 2, mode: 'dorian' }).count, 0);
});

test('every bar of every voice lasts exactly one 4/4 bar', () => {
  for (const seed of [1, 2, 3]) {
    const journal = journalOf({ seed, wander: 0.9, complexity: 0.9 }, 16 * 120);
    const abc = sliceToAbc(journal.slice(37, 16 * 110 + 5), { title: 'test' });
    assert.match(abc, /^X:1\nT:test\n/);
    assert.match(abc, /\nL:1\/16\n/);
    const voices = abc.split(/\[V:\d+\]\n/).slice(1);
    assert.equal(voices.length, 12);
    for (const voice of voices) {
      const bars = voice.split('|').map((b) => b.trim()).filter(Boolean);
      assert.ok(bars.length >= 100);
      bars.forEach((bar, i) => assert.equal(duration(bar), 16, `bar ${i}: ${bar}`));
    }
    assert.ok(abc.includes('[K:'), 'key changes are written');
  }
});

test('MIDI from a slice matches the notes of that slice', () => {
  const journal = journalOf({ seed: 5 }, 16 * 20);
  const slice = journal.slice(64, 16 * 12);
  const bytes = sliceToMidi(slice);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  const ons = [...bytes].filter((b, i) => (b & 0xf0) === 0x90 && i > 14).length;
  assert.ok(ons >= slice.notes.length);
  assert.equal(journal.stepAt(64 * 0.13), 64);
  assert.equal(journal.stepAt(64 * 0.13 + 0.01), 65);
});

test('the journal forgets the distant past but keeps the sounding chord', () => {
  const journal = journalOf({ seed: 6 }, 16 * 40);
  journal.forgetBefore(300);
  assert.equal(journal.firstStep, 300);
  assert.ok(journal.notes.every((n) => n.step >= 300));
  assert.ok(journal.chords[0].step <= 300);
  assert.equal(journal.timeOf(300), 300 * 0.13);
});

test('the lead sheet is one melody with chord symbols, every bar complete', () => {
  const journal = journalOf({ seed: 3, wander: 0.8, complexity: 0.7 }, 16 * 90);
  const lead = sliceToLeadSheet(journal.slice(0, 16 * 88), { title: 'test' });
  const body = lead.split(/\nK:[^\n]*\n/)[1];
  assert.ok(!lead.includes('V:'));
  const bars = body.split('|').map((b) => b.trim()).filter(Boolean);
  assert.equal(bars.length, 88);
  bars.forEach((bar, i) => assert.equal(duration(bar.replace(/"[^"]*"/g, '')), 16, `bar ${i}: ${bar}`));
  const symbols = [...lead.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(symbols.length >= 5);
  assert.ok(symbols.every((s) => /^[A-G][#b]?[a-z0-9/#()]*([A-G][#b]?)?$/i.test(s)), symbols.join(' '));
  assert.ok(lead.length < 12000, `${lead.length} characters`);
});
