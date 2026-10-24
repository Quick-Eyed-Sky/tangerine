import test from 'node:test';
import assert from 'node:assert/strict';
import { TangerineEngine, makePattern, LAYERS, LAYER_IDS } from '../dist/engine.js';
import { CHORD_TYPES, chordsInKey, keyDistance, rubs, voiceChord, makeChord, levelFor, pedalFits, mod12, modulationKind } from '../dist/theory.js';

const run = (options, steps) => {
  const engine = new TangerineEngine(options);
  const outs = [];
  for (let i = 0; i < steps; i++) outs.push(engine.step());
  return { engine, outs };
};

test('no chord of the vocabulary holds a minor ninth or a tritone', () => {
  for (const type of CHORD_TYPES) {
    const chord = makeChord(0, type.id);
    for (const a of chord.pcs) for (const b of chord.pcs) assert.ok(![6].includes(mod12(a - b)), `${type.id} has a tritone`);
    assert.ok(!type.intervals.includes(13), `${type.id} has a minor ninth`);
  }
});

test('complexity maps to four vocabulary levels', () => {
  assert.deepEqual([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map(levelFor), [1, 1, 2, 3, 3, 4, 4]);
});

test('the same seed and settings give the same vine', () => {
  const a = run({ seed: 7, wander: 0.8 }, 3000).outs;
  const b = run({ seed: 7, wander: 0.8 }, 3000).outs;
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
  const c = run({ seed: 8, wander: 0.8 }, 3000).outs;
  assert.notDeepEqual(JSON.stringify(a), JSON.stringify(c));
});

test('every arpeggio, motif and bell note is a note of the current chord', () => {
  for (const seed of [1, 2, 3]) {
    const { outs } = run({ seed, wander: 0.9, complexity: 0.9 }, 6000);
    let chord = null;
    for (const out of outs) {
      if (out.harmony) chord = out.harmony.chord;
      for (const e of out.events) if (['arp', 'motif', 'bells'].includes(e.layer)) assert.ok(chord.pcs.includes(mod12(e.midi)), `${e.layer} ${e.midi} outside ${chord.pcs}`);
    }
  }
});

test('the bass never makes a minor ninth or a tritone with the chord above it', () => {
  for (const seed of [4, 5, 6]) {
    const { outs } = run({ seed, wander: 0.9, complexity: 0.8, pedal: 1 }, 6000);
    let chord = null;
    for (const out of outs) {
      if (out.harmony) chord = out.harmony.chord;
      for (const e of out.events) {
        if (e.layer !== 'bass') continue;
        for (const pc of chord.pcs) assert.ok(![1, 6].includes(mod12(pc - e.midi)), `bass ${e.midi} against ${pc}`);
      }
    }
  }
});

test('arpeggio, motif and bells never sound a semitone apart', () => {
  const { outs } = run({ seed: 21, wander: 0.9, complexity: 1 }, 12000);
  let chord = null;
  for (const out of outs) {
    if (out.harmony) chord = out.harmony.chord;
    const pcs = [...new Set(out.events.filter((e) => ['arp', 'motif', 'bells'].includes(e.layer)).map((e) => mod12(e.midi)))];
    for (const a of pcs) for (const b of pcs) assert.ok(mod12(a - b) !== 1, `${a} ${b} in ${chord.pcs}`);
  }
});

test('pad voicings never rub and stay in their register', () => {
  const { outs } = run({ seed: 11, wander: 1, complexity: 1 }, 20000);
  const voicings = outs.filter((o) => o.harmony).map((o) => o.harmony.voicing);
  assert.ok(voicings.length > 20);
  for (const v of voicings) {
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) assert.ok(!rubs(v[i], v[j]), `${v}`);
    assert.ok(v[0] >= 50 && v[v.length - 1] <= 77, `${v}`);
  }
});

test('chords last 4 to 16 bars and start on a bar line', () => {
  const { outs } = run({ seed: 3 }, 8000);
  for (const h of outs.filter((o) => o.harmony).map((o) => o.harmony)) {
    const bars = (h.endStep - h.startStep) / 16;
    assert.ok(bars >= 1 && bars <= 16, `${bars}`);
    assert.equal(h.startStep % 16, 0);
  }
});

test('a modulation goes through a shared chord or a held common tone, within the allowed distance', () => {
  let count = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { outs } = run({ seed, wander: 0.5 }, 20000);
    let previous = null;
    for (const out of outs) {
      const h = out.harmony;
      if (!h) continue;
      if (h.modulation) {
        count++;
        assert.ok(keyDistance(h.modulation.from, h.modulation.to) <= 1 + Math.round(0.5 * 3));
        if (h.modulation.method === 'pivot') assert.ok(previous.pivotFor, 'a pivot chord comes first');
        if (h.modulation.method !== 'direct') assert.ok(h.chord.pcs.some((pc) => previous.chord.pcs.includes(pc)), 'a note is shared');
      }
      previous = h;
    }
  }
  assert.ok(count >= 5, `only ${count} modulations`);
});

test('with Key changes at zero the vine never leaves home', () => {
  const { outs } = run({ seed: 9, changes: 0, key: { tonic: 9, mode: 'aeolian' } }, 20000);
  for (const out of outs) if (out.harmony) assert.deepEqual(out.harmony.key, { tonic: 9, mode: 'aeolian' });
});

test('travelTo reaches the chosen key within a few bars', () => {
  const engine = new TangerineEngine({ seed: 5, wander: 0 });
  for (let i = 0; i < 100; i++) engine.step();
  engine.travelTo({ tonic: 7, mode: 'lydian' });
  let arrived = null;
  for (let i = 0; i < 16 * 40 && !arrived; i++) {
    const out = engine.step();
    if (out.harmony?.modulation) arrived = out;
  }
  assert.ok(arrived, 'no arrival');
  assert.deepEqual(arrived.harmony.key, { tonic: 7, mode: 'lydian' });
});

test('sequences keep their lengths and the three of them meet every 336 steps', () => {
  const engine = new TangerineEngine({ seed: 2 });
  const p = engine.positions(336);
  assert.deepEqual([p.bass.index, p.arp.index, p.motif.index], [0, 0, 0]);
  assert.equal(engine.positions(42).motif.index, 0);
  assert.equal(engine.positions(42).bass.index, 10);
});

test('a new length starts on the next cycle', () => {
  const engine = new TangerineEngine({ seed: 2 });
  for (let i = 0; i < 5; i++) engine.step();
  engine.setLength('bass', 9);
  assert.equal(engine.layers.bass.length, 16);
  for (let i = 5; i < 17; i++) engine.step();
  assert.equal(engine.layers.bass.length, 9);
});

test('mutations: one layer at a time, rarely', () => {
  const { outs } = run({ seed: 4, evolution: 1 }, 20000);
  const steps = outs.filter((o) => o.mutation).map((o) => o.step);
  assert.ok(steps.length > 10);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] >= 32);
  const still = run({ seed: 4, evolution: 0 }, 20000).outs.filter((o) => o.mutation).length;
  assert.ok(still < steps.length);
});

test('patterns are never empty and always start with a note', () => {
  for (const def of LAYERS.filter((l) => l.kind === 'seq')) {
    for (const length of def.lengths) {
      for (let salt = 0; salt < 20; salt++) {
        const p = makePattern(def.id, length, 99, salt);
        assert.equal(p.length, length);
        assert.ok(p[0].on);
        assert.ok(p.filter((s) => s.on).length >= Math.ceil(length * 0.35));
      }
    }
  }
});

test('modulation kinds are named as in the grammar', () => {
  assert.equal(modulationKind({ tonic: 2, mode: 'dorian' }, { tonic: 2, mode: 'aeolian' }), 'modal');
  assert.equal(modulationKind({ tonic: 0, mode: 'ionian' }, { tonic: 9, mode: 'aeolian' }), 'relative');
  assert.equal(modulationKind({ tonic: 0, mode: 'ionian' }, { tonic: 7, mode: 'ionian' }), 'fifth');
  assert.equal(modulationKind({ tonic: 0, mode: 'ionian' }, { tonic: 8, mode: 'ionian' }), 'mediant');
  assert.ok(!pedalFits(0, makeChord(1, 'major')));
  assert.ok(chordsInKey({ tonic: 2, mode: 'dorian' }, 4).length > 15);
  assert.ok(voiceChord(makeChord(0, 'm11')).length <= 5);
});

test('a thread comes home, thins out and ends on the home chord', () => {
  for (const seed of [1, 2, 3, 4, 11, 12, 13, 14, 15, 16]) {
    const engine = new TangerineEngine({ seed, wander: 0.8, complexity: 0.62, key: { tonic: 2, mode: 'dorian' } });
    const end = 1856;
    engine.setEnding(end);
    let last = null;
    let ended = null;
    const layersAt = {};
    for (let i = 0; i < end + 10 && !ended; i++) {
      const out = engine.step();
      if (out.harmony) last = out.harmony;
      for (const e of out.events) layersAt[e.layer] = out.step;
      if (out.ended) ended = out;
    }
    assert.ok(ended, 'the thread ends');
    assert.equal(ended.step, end);
    assert.ok(last.final, 'the last chord is the final one');
    assert.equal(last.chord.degree, 0);
    assert.deepEqual(last.key, { tonic: 2, mode: 'dorian' });
    assert.equal(last.startStep, end - 128);
    assert.ok(layersAt.motif < end - 128 + 32 && layersAt.arp < end - 128 + 64 && layersAt.bass < end - 128 + 96);
    assert.equal(engine.step().events.length, 0);
  }
});

test('the new strands play notes of the chord, and the drone never rubs', () => {
  for (const seed of [31, 32, 33]) {
    const { outs } = run({ seed, complexity: 1, wander: 1, changes: 10, drift: 1 }, 12000);
    let chord = null;
    const seen = new Set();
    for (const out of outs) {
      if (out.harmony) chord = out.harmony.chord;
      for (const e of out.events) {
        seen.add(e.layer);
        if (['cello', 'lead', 'seq2', 'theme', 'pulse'].includes(e.layer)) assert.ok(chord.pcs.includes(mod12(e.midi)), `${e.layer} ${e.midi} outside ${chord.pcs}`);
        if (e.layer === 'air') for (const m of e.notes) assert.ok(chord.pcs.includes(mod12(m)));
        if (e.layer === 'drone') for (const m of e.notes) for (const pc of chord.pcs) assert.ok(![1, 6].includes(mod12(pc - m)), `drone ${m} against ${pc}`);
      }
    }
    for (const id of ['cello', 'seq2', 'lead', 'drone', 'air', 'theme', 'pulse']) assert.ok(seen.has(id), `${id} never played`);
  }
});

test('a held line never crosses a chord change', () => {
  const { outs } = run({ seed: 41 }, 10000);
  let end = 0;
  for (const out of outs) {
    if (out.harmony) end = out.harmony.endStep;
    for (const e of out.events) if (['cello', 'lead', 'theme'].includes(e.layer)) assert.ok(e.step + e.span <= end, `${e.layer} at ${e.step} lasts past ${end}`);
  }
});

test('key changes: so many per window when endless, so many in a thread', () => {
  const count = (outs) => outs.filter((o) => o.harmony?.modulation).length;
  const window = 4640;
  const endless = count(run({ seed: 51, changes: 6, window }, window * 3).outs);
  assert.ok(endless >= 12 && endless <= 24, `${endless} changes in three windows`);
  for (const seed of [52, 53, 54]) {
    const engine = new TangerineEngine({ seed, changes: 3 });
    engine.setEnding(16 * 160);
    const outs = [];
    while (!engine.ending.done) outs.push(engine.step());
    const away = outs.filter((o) => o.harmony?.modulation && !(o.step >= engine.ending.homeBy)).length;
    assert.ok(away >= 2 && away <= 4, `seed ${seed}: ${away} changes before heading home`);
  }
});

test('new sequences come by themselves on a chord change, the same way every time', () => {
  const a = run({ seed: 61, renew: 32 }, 16 * 200).outs.filter((o) => o.renewed).map((o) => [o.step, !!o.harmony]);
  const b = run({ seed: 61, renew: 32 }, 16 * 200).outs.filter((o) => o.renewed).map((o) => [o.step, !!o.harmony]);
  assert.ok(a.length >= 4);
  assert.deepEqual(a, b);
  assert.ok(a.every(([, onChord]) => onChord));
});

test('sounds change now and then, on a chord change, the same way every time', () => {
  const pick = (outs) => outs.filter((o) => o.recolor).map((o) => [o.step, o.recolor.layer, !!o.harmony]);
  const a = pick(run({ seed: 71, recolor: 32 }, 16 * 300).outs);
  assert.deepEqual(a, pick(run({ seed: 71, recolor: 32 }, 16 * 300).outs));
  assert.ok(a.length >= 5, `${a.length} changes`);
  assert.ok(a.every(([, , onChord]) => onChord));
  assert.equal(pick(run({ seed: 71, recolor: 0 }, 16 * 300).outs).length, 0);
});

test('the slow melody comes back after rests, and the echo pulse keeps to the quarter notes', () => {
  const { outs } = run({ seed: 81 }, 16 * 240);
  const theme = outs.flatMap((o) => o.events.filter((e) => e.layer === 'theme'));
  const pulse = outs.flatMap((o) => o.events.filter((e) => e.layer === 'pulse'));
  assert.ok(theme.length >= 20, `${theme.length} melody notes`);
  assert.ok(theme.every((e) => e.step % 4 === 0 && e.span >= 4 && e.midi >= 52 && e.midi <= 86));
  // Phrases: rests of two bars or more between them.
  const gaps = theme.slice(1).map((e, i) => e.step - (theme[i].step + theme[i].span));
  assert.ok(gaps.filter((g) => g >= 32).length >= 4);
  assert.ok(pulse.length >= 100 && pulse.every((e) => e.step % 4 === 0 && e.span === 4));
});

test('layers change: as many stay on, every layer gets its turn, the same way every time', () => {
  const active = ['bass', 'arp', 'motif', 'pad', 'bells', 'cello', 'seq2', 'lead', 'theme'];
  const pick = (outs) => outs.filter((o) => o.rotate).map((o) => [o.step, o.rotate.off, o.rotate.on, !!o.harmony]);
  const a = pick(run({ seed: 91, rotate: 16, active }, 16 * 600).outs);
  assert.deepEqual(a, pick(run({ seed: 91, rotate: 16, active }, 16 * 600).outs));
  assert.ok(a.length >= 20, `${a.length} changes`);
  let on = new Set(active);
  const played = new Set(active);
  for (const [, off, enter, onChord] of a) {
    assert.ok(onChord && on.has(off) && !on.has(enter) && off !== enter);
    on.delete(off); on.add(enter); played.add(enter);
    assert.equal(on.size, active.length);
  }
  assert.deepEqual([...played].sort(), [...LAYER_IDS].sort());
  assert.ok(a.some(([, off]) => off === 'bass'), 'the bass rests too');
  assert.equal(pick(run({ seed: 91, rotate: 0, active }, 16 * 600).outs).length, 0);
  assert.equal(pick(run({ seed: 91, rotate: 16 }, 16 * 600).outs).length, 0, 'all on: nothing to swap');
});
