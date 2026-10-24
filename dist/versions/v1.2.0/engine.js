// TANGERINE · the vine.
//
// Two strands turning at different speeds:
//   - the rhythmic strand: short sequences of different lengths on one clock,
//     which drift apart and meet again (16, 12 and 7 steps meet every 336 steps);
//   - the harmonic strand: a conductor that holds a chord for 4 to 16 bars, moves
//     to a neighbour that keeps notes in common, and now and then travels to a new
//     key through a shared chord or a held common tone.
// A sequence is written in chord degrees, not notes, so it follows the harmony
// without being rewritten. Every few dozen passes one sequence changes one detail.
//
// Around them, seven more strands: a bowed low line, a counter sequence at another
// speed (dotted eighths against sixteenths), a long lead for a long echo, a drone
// on the home note, high strings above the pad, a slow melody that comes back
// now and then, and a pulse of quarter notes that its echo fills in.
// Now and then one layer rests and another comes in: as many keep playing.
//
// Everything is decided here, one sixteenth note at a time, from the seed alone:
// the same seed and settings always give the same vine. No audio in this file.

import { mulberry32, hashSeed } from './rng.js';
import {
  MODES, MODE_WEIGHT, CHORD_TYPE, mod12, levelFor, scalePcs, keyDistance, sameKey,
  makeChord, sameChord, commonTones, fitsKey, chordsInKey, pedalFits, rubs,
  voiceChord, chordLadder, modulationKind,
} from './theory.js';

export const STEPS_PER_BAR = 16;

export const LAYERS = [
  { id: 'bass', name: 'Bass sequence', kind: 'seq', length: 16, div: 1, lengths: [8, 9, 10, 11, 12, 13, 14, 15, 16] },
  { id: 'arp', name: 'Arpeggio', kind: 'seq', length: 12, div: 1, lengths: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
  { id: 'motif', name: 'High motif', kind: 'seq', length: 7, div: 2, lengths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { id: 'pad', name: 'Pad', kind: 'pad' },
  { id: 'bells', name: 'Bells', kind: 'bells' },
  { id: 'cello', name: 'Low strings', kind: 'line' },
  { id: 'seq2', name: 'Counter sequence', kind: 'seq', length: 10, div: 3, lengths: [5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { id: 'lead', name: 'Long lead', kind: 'line' },
  { id: 'drone', name: 'Drone', kind: 'hold' },
  { id: 'air', name: 'High strings', kind: 'hold' },
  { id: 'theme', name: 'Slow melody', kind: 'line' },
  { id: 'pulse', name: 'Echo pulse', kind: 'seq', length: 5, div: 4, lengths: [3, 4, 5, 6, 7, 9] },
];
export const SEQ_IDS = LAYERS.filter((layer) => layer.kind === 'seq').map((layer) => layer.id);
// Layers that hold notes across chords, like the pad: a note shared by two chords carries on.
export const HOLD_IDS = ['pad', 'drone', 'air'];
export const LAYER_IDS = LAYERS.map((layer) => layer.id);
// When a thread closes, the layers leave in this order (bars into the last eight).
const LEAVING_BAR = { lead: 1, theme: 1, motif: 2, seq2: 3, pulse: 3, arp: 4, bass: 6, bells: 7 };
// Ten minutes of sixteenth notes at the default tempo: the window of the key changes.
export const DEFAULT_WINDOW = 80 * 4 * 10;

// A slow wave for the drift: two long sines per name, -1..1, the same for a given seed.
const waves = new Map();
export function driftWave(seed, step, ...name) {
  const id = `${seed}|${name.join('|')}`;
  let w = waves.get(id);
  if (!w) {
    const random = mulberry32(hashSeed(seed, 'drift', ...name));
    w = { p1: 1400 + 2600 * random(), p2: 2300 + 4200 * random(), f1: 6.2832 * random(), f2: 6.2832 * random() };
    waves.set(id, w);
  }
  return 0.6 * Math.sin(6.2832 * step / w.p1 + w.f1) + 0.4 * Math.sin(6.2832 * step / w.p2 + w.f2);
}

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const BARS = [4, 6, 8, 8, 12, 16];
const BELL_PERIODS = [41, 53, 67, 79, 97, 109];

function weighted(random, items, weightOf) {
  let total = 0;
  const weights = items.map((item) => { const w = Math.max(0, weightOf(item)); total += w; return w; });
  if (!(total > 0)) return items[0];
  let x = random() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}

function typeWeight(typeId, level) {
  const type = CHORD_TYPE[typeId];
  if (typeId === 'five') return level === 1 ? 0.5 : 0.08;
  if (typeId === 'sus7') return type.level <= level ? 0.45 : 0;
  if (type.level === level) return 1;
  if (type.level === level - 1) return 0.55;
  return 0.25;
}

// ---------------------------------------------------------------- sequences

const ARP_SHAPES = {
  up: (i) => i,
  updown: (i, n) => { const span = Math.max(2, Math.min(5, n - 1)); const p = i % (2 * span); return p <= span ? p : 2 * span - p; },
  broken: (i) => [0, 2, 1, 3, 2, 4, 3, 5][i % 8] + 2 * Math.floor(i / 8),
  pedal: (i) => (i % 2 === 0 ? 0 : 2 + Math.floor(i / 2) % 4),
  wide: (i) => (i * 2) % 7,
  fall: (i, n) => Math.max(0, Math.min(6, n) - 1 - (i % Math.min(6, n))),
};

export function makePattern(layerId, length, seed, salt = 0) {
  const random = mulberry32(hashSeed(seed, 'pattern', layerId, length, salt));
  const steps = [];
  if (layerId === 'bass') {
    const density = 0.62 + 0.33 * random();
    for (let i = 0; i < length; i++) {
      const on = i === 0 || random() < density;
      const idx = i === 0 ? 0 : weighted(random, [0, 1, 2, 3], (v) => [0.55, 0.22, 0.2, 0.03][v]);
      const accent = i === 0 ? 7 : i % 4 === 0 ? 4 + Math.floor(random() * 3) : 1 + Math.floor(random() * 3);
      steps.push({ on, idx, oct: 0, accent });
    }
  } else if (layerId === 'arp') {
    const shapeName = weighted(random, Object.keys(ARP_SHAPES), () => 1);
    const shape = ARP_SHAPES[shapeName];
    const start = Math.floor(random() * 2);
    for (let i = 0; i < length; i++) {
      const on = i === 0 || random() > 0.1;
      const idx = Math.max(0, Math.min(7, shape(i, length) + start));
      const accent = i === 0 ? 6 : i % 3 === 0 ? 4 : 1 + Math.floor(random() * 3);
      steps.push({ on, idx, oct: 0, accent });
    }
  } else if (layerId === 'pulse') {
    // One note a quarter, the echo fills in: nearly always on, close steps.
    let idx = 1 + Math.floor(random() * 3);
    for (let i = 0; i < length; i++) {
      const on = i === 0 || random() < 0.85;
      if (i > 0) idx = Math.max(0, Math.min(5, idx + weighted(random, [-1, 0, 1, 2], (v) => [1, 0.5, 1, 0.3][v + 1])));
      steps.push({ on, idx, oct: 0, accent: i === 0 ? 6 : 3 + Math.floor(random() * 3) });
    }
  } else if (layerId === 'seq2') {
    // Low and high in turns, the octave leaps of an analogue sequencer.
    for (let i = 0; i < length; i++) {
      const on = i === 0 || random() < 0.8;
      const idx = i % 2 === 0 ? weighted(random, [0, 1, 2], (v) => [0.6, 0.25, 0.15][v]) : weighted(random, [3, 4, 5], (v) => [0.5, 0.3, 0.2][v]);
      steps.push({ on, idx, oct: 0, accent: i === 0 ? 6 : i % 2 === 0 ? 3 + Math.floor(random() * 3) : 1 + Math.floor(random() * 3) });
    }
  } else {
    let idx = 2 + Math.floor(random() * 2);
    for (let i = 0; i < length; i++) {
      const on = i === 0 || random() < 0.58;
      if (i > 0) idx = Math.max(0, Math.min(6, idx + weighted(random, [-2, -1, 1, 2], (v) => (Math.abs(v) === 1 ? 1 : 0.4))));
      steps.push({ on, idx, oct: 0, accent: i === 0 ? 6 : 2 + Math.floor(random() * 4) });
    }
  }
  const minimum = Math.ceil(length * (layerId === 'motif' ? 0.35 : 0.5));
  for (let i = 1; steps.filter((s) => s.on).length < minimum && i < length; i += 2) steps[i].on = true;
  return steps;
}

// The slow melody: four to six notes in chord degrees, the last one long.
export function makeTheme(seed, salt = 0) {
  const random = mulberry32(hashSeed(seed, 'theme', salt));
  const count = 4 + Math.floor(random() * 3);
  let idx = 2 + Math.floor(random() * 3);
  const notes = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) idx = Math.max(0, Math.min(7, idx + weighted(random, [-2, -1, 1, 2], (v) => (Math.abs(v) === 1 ? 1 : 0.45))));
    const length = i === count - 1 ? weighted(random, [16, 24], () => 1) : weighted(random, [4, 8, 8, 12, 16], () => 1);
    notes.push({ idx, length });
  }
  return notes;
}

// ---------------------------------------------------------------- the engine

export class TangerineEngine {
  // changes: key changes per window (endless) or per thread; wander: how far they go;
  // renew: new sequences by themselves every so many bars (0: never); drift: 0..1;
  // recolor: about every so many bars one layer changes its sound (0: never);
  // rotate: about every so many bars one layer rests and another comes in (0: never);
  // active: the layers switched on (the rotation keeps as many on).
  constructor({ seed = 1, key = { tonic: 2, mode: 'dorian' }, complexity = 1, wander = 1, changes = 8, pedal = 0, evolution = 0.7, renew = 0, recolor = 0, rotate = 0, active = LAYER_IDS, drift = 0, window = DEFAULT_WINDOW, lengths = {}, salt = 0 } = {}) {
    this.seed = seed >>> 0;
    this.home = { tonic: mod12(key.tonic), mode: MODES[key.mode] ? key.mode : 'dorian' };
    this.settings = { complexity: clamp(complexity), wander: clamp(wander), changes: clamp(Math.round(changes), 0, 12), pedal: clamp(pedal), evolution: clamp(evolution), renew: Math.max(0, Math.round(renew) || 0), recolor: Math.max(0, Math.round(recolor) || 0), rotate: Math.max(0, Math.round(rotate) || 0), drift: clamp(drift) };
    this.active = LAYER_IDS.filter((id) => active.includes(id));
    this.window = window > 0 ? window : DEFAULT_WINDOW;
    this.salt = salt;
    this.lengths = Object.fromEntries(LAYERS.filter((l) => l.kind === 'seq').map((l) => [l.id, lengths[l.id] || l.length]));
    this.reset();
  }

  reset() {
    this.stepIndex = 0;
    this.conductor = mulberry32(hashSeed(this.seed, 'conductor', this.salt));
    this.mutator = mulberry32(hashSeed(this.seed, 'mutation', this.salt));
    this.harmony = null;
    this.history = [];
    this.plan = [];
    this.chordsInKey = 0;
    this.chordsSinceTonic = 0;
    this.ending = null;
    this.nextModulationAt = this._drawModulationGap();
    this.voicing = [];
    this.lastMutationStep = -999;
    this.renewals = 0;
    this.nextRenewAt = this.settings.renew ? this.settings.renew * STEPS_PER_BAR : Infinity;
    this.colours = mulberry32(hashSeed(this.seed, 'recolor', this.salt));
    this.nextRecolorAt = this._drawRecolor(0);
    this.rotation = mulberry32(hashSeed(this.seed, 'rotate', this.salt));
    this.nextRotateAt = this._drawRotate(0);
    this.since = {};
    this.layers = {};
    for (const layer of LAYERS.filter((l) => l.kind === 'seq')) this._buildLayer(layer.id);
    this.bellOffsets = BELL_PERIODS.map((period, i) => Math.floor(mulberry32(hashSeed(this.seed, 'bell', i))() * period));
    this.lines = {
      cello: { random: mulberry32(hashSeed(this.seed, 'line', 'cello', this.salt)), nextAt: Infinity, midi: null },
      lead: { random: mulberry32(hashSeed(this.seed, 'line', 'lead', this.salt)), nextAt: 8 * STEPS_PER_BAR, idx: 3 },
      theme: { random: mulberry32(hashSeed(this.seed, 'line', 'theme', this.salt)), nextAt: 12 * STEPS_PER_BAR, notes: makeTheme(this.seed, this.salt), at: 0 },
    };
  }

  // A setting as it is now: the drift moves richness, distance and the held bass
  // slowly around where they were set.
  _now(name) {
    const range = { complexity: 0.22, wander: 0.2, pedal: 0.3 }[name] || 0;
    return clamp(this.settings[name] + range * this.settings.drift * driftWave(this.seed, this.stepIndex, 'engine', name));
  }

  _level() { return levelFor(this._now('complexity')); }

  _patternSalt() { return this.renewals ? `${this.salt}.${this.renewals}` : this.salt; }

  _buildLayer(id) {
    const def = LAYERS.find((l) => l.id === id);
    const length = this.lengths[id];
    this.layers[id] = {
      id, length, div: def.div,
      pattern: makePattern(id, length, this.seed, this._patternSalt()),
      cycles: 0,
      mutateAfter: this._drawMutationGap(),
      pendingLength: null,
    };
  }

  _drawMutationGap() {
    // 64 passes when fixed, 14 at 70 %, about 7 when restless.
    const base = 64 * (14 / 64) ** (this.settings.evolution / 0.7);
    return Math.round(base + base * 0.5 * this.mutator());
  }

  // The step of the next key change: so many per window when endless, so many in
  // the whole thread (before it heads home) when it has an ending.
  _drawModulationGap(from = this.stepIndex) {
    const n = this.settings.changes;
    if (!(n > 0) || this.ending?.homing) return Infinity;
    const span = this.ending ? Math.max(8 * STEPS_PER_BAR, this.ending.homeBy) / (n + 0.5) : this.window / n;
    return from + Math.round(span * (0.75 + 0.5 * this.conductor()));
  }

  _drawRecolor(from) {
    const bars = this.settings.recolor;
    return bars ? from + Math.round(bars * STEPS_PER_BAR * (0.75 + 0.5 * this.colours())) : Infinity;
  }

  _drawRotate(from) {
    const bars = this.settings.rotate;
    return bars ? from + Math.round(bars * STEPS_PER_BAR * (0.75 + 0.5 * this.rotation())) : Infinity;
  }

  // One layer rests, another comes in: the one that has played longest, most
  // often, and the one that has rested longest. Never the one that just left.
  _rotate(s) {
    const resting = LAYER_IDS.filter((id) => !this.active.includes(id));
    if (!this.active.length || !resting.length) return null;
    const age = (id) => Math.min(256, (s - (this.since[id] ?? -64 * STEPS_PER_BAR)) / STEPS_PER_BAR);
    const off = weighted(this.rotation, this.active, (id) => 4 + age(id));
    const on = weighted(this.rotation, resting, (id) => (age(id) < 8 ? 0.2 : 4 + age(id)));
    this.active = LAYER_IDS.filter((id) => id === on || (id !== off && this.active.includes(id)));
    this.since[off] = this.since[on] = s;
    return { off, on };
  }

  configure(settings = {}) {
    for (const name of ['complexity', 'wander', 'pedal', 'evolution', 'drift']) {
      if (settings[name] !== undefined) this.settings[name] = clamp(settings[name]);
    }
    if (settings.window > 0) this.window = settings.window;
    if (settings.changes !== undefined) {
      this.settings.changes = clamp(Math.round(settings.changes), 0, 12);
      this.nextModulationAt = this._drawModulationGap();
    }
    if (settings.recolor !== undefined) {
      this.settings.recolor = Math.max(0, Math.round(settings.recolor) || 0);
      this.nextRecolorAt = this._drawRecolor(this.stepIndex);
    }
    if (settings.rotate !== undefined) {
      this.settings.rotate = Math.max(0, Math.round(settings.rotate) || 0);
      this.nextRotateAt = this._drawRotate(this.stepIndex);
    }
    if (Array.isArray(settings.active)) this.active = LAYER_IDS.filter((id) => settings.active.includes(id));
    if (settings.renew !== undefined) {
      this.settings.renew = Math.max(0, Math.round(settings.renew) || 0);
      this.nextRenewAt = this.settings.renew ? this.stepIndex + this.settings.renew * STEPS_PER_BAR : Infinity;
    }
  }

  // A new length starts at the layer's next cycle, so nothing jumps mid-phrase.
  setLength(id, length) {
    const def = LAYERS.find((l) => l.id === id);
    if (!def || def.kind !== 'seq' || !def.lengths.includes(length)) return false;
    this.lengths[id] = length;
    this.layers[id].pendingLength = length;
    return true;
  }

  // New sequences (same harmony): every pattern is drawn again.
  setSalt(salt) {
    this.salt = salt;
    this._redraw();
  }

  _redraw() {
    for (const id of SEQ_IDS) {
      const layer = this.layers[id];
      layer.pattern = makePattern(id, layer.length, this.seed, this._patternSalt());
    }
    this.lines.theme.notes = makeTheme(this.seed, this._patternSalt());
    this.lines.theme.at = 0;
  }

  get key() { return this.harmony?.key || this.home; }

  // ------------------------------------------------------------ harmony

  _chordFor(key, chord, s, extra = {}) {
    const bars = weighted(this.conductor, BARS, (b) => (this.settings.wander > 0.7 && b > 8 ? 0.5 : 1));
    let bass = chord.root;
    if (chord.root !== key.tonic && this.conductor() < this._now('pedal') && pedalFits(key.tonic, chord)) bass = key.tonic;
    const full = { ...makeChord(chord.root, chord.type, bass), degree: chord.degree };
    this.voicing = voiceChord(full, this.voicing);
    let endStep = s + (extra.pivotFor && this.ending?.homing ? Math.min(bars, 4) : bars) * STEPS_PER_BAR;
    if (this.ending) endStep = Math.min(endStep, s < this.ending.finalStart ? this.ending.finalStart : this.ending.endStep);
    return { key, chord: full, startStep: s, endStep, voicing: [...this.voicing], ...extra };
  }

  _nextInKey(key) {
    const level = this._level();
    const current = this.harmony?.chord;
    let candidates = chordsInKey(key, level).filter((c) => !sameChord(c, current));
    if (!candidates.length) candidates = chordsInKey(key, 4);
    const recent = this.history.slice(-3).map((h) => h.chord);
    return weighted(this.conductor, candidates, (c) => {
      let w = typeWeight(c.type, level);
      if (current) {
        const shared = commonTones(c, current);
        w *= [0.05, 0.45, 1, 1.3, 1.4, 1.5, 1.5][Math.min(6, shared)];
        if (c.root === current.root) w *= 0.35;
      }
      if (c.degree === 0) w *= this.chordsSinceTonic >= 3 ? 3 : 0.9;
      if (recent.some((r) => sameChord(r, c))) w *= 0.3;
      return w;
    });
  }

  _chooseDestination() {
    const from = this.key;
    const wander = this._now('wander');
    const maxDistance = 1 + Math.round(wander * 3);
    const candidates = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of Object.keys(MODES)) {
        const to = { tonic, mode };
        if (sameKey(to, from)) continue;
        if (mode === 'phrygian' && wander < 0.6) continue;
        const distance = keyDistance(from, to);
        if (distance > maxDistance) continue;
        candidates.push({ to, distance, kind: modulationKind(from, to) });
      }
    }
    if (!candidates.length) return null;
    const bonus = { modal: 1.3, relative: 1.2, fifth: 1.2, fourth: 1.1, near: 1, mediant: 0.5 + wander, step: 0.6, far: 0.4 };
    const recentKeys = this.history.slice(-24).map((h) => h.key);
    return weighted(this.conductor, candidates, (c) => {
      let w = MODE_WEIGHT[c.to.mode] * Math.exp(-1.1 * Math.max(0, c.distance - 1)) * bonus[c.kind];
      if (recentKeys.some((k) => sameKey(k, c.to))) w *= 0.5;
      return w;
    });
  }

  // A thread of a given length: 24 bars before the end the vine heads home, the
  // last 8 bars hold the home chord while the layers leave one by one (motif,
  // arpeggio, bass, bells), and at the end the pad lets go. null: endless again.
  setEnding(endStep) {
    if (endStep === null || endStep === undefined) { this.ending = null; return; }
    const end = Math.max(this.stepIndex + 12 * STEPS_PER_BAR, Math.round(endStep / STEPS_PER_BAR) * STEPS_PER_BAR);
    this.ending = { endStep: end, finalStart: end - 8 * STEPS_PER_BAR, homeBy: end - 24 * STEPS_PER_BAR, homing: false, done: false };
    this.nextModulationAt = this._drawModulationGap();
  }

  // Steers the vine toward a key chosen by the listener: the journey starts at the
  // next bar line and uses the same means (a shared chord, or a held common tone).
  travelTo(key) {
    const to = { tonic: mod12(key.tonic), mode: MODES[key.mode] ? key.mode : 'dorian' };
    this.home = to;
    if (!this.harmony || sameKey(to, this.key)) { this.plan = []; return; }
    this.plan = this._planModulation({ to, kind: modulationKind(this.key, to) });
    const nextBar = Math.ceil((this.stepIndex + 1) / STEPS_PER_BAR) * STEPS_PER_BAR + STEPS_PER_BAR;
    this.harmony.endStep = Math.min(this.harmony.endStep, nextBar);
    this.nextModulationAt = this._drawModulationGap(nextBar);
  }

  _planModulation(chosen = null) {
    const destination = chosen || this._chooseDestination();
    if (!destination) return [];
    const from = this.key;
    const to = destination.to;
    const level = this._level();
    const current = this.harmony.chord;
    const arrivals = chordsInKey(to, level).filter((c) => c.degree === 0);
    const record = { from, to, kind: destination.kind };
    const pivots = chordsInKey(to, level).filter((c) => fitsKey(c, from) && !sameChord(c, current) && commonTones(c, current) >= 2);
    if (pivots.length) {
      const pivot = weighted(this.conductor, pivots, (c) => typeWeight(c.type, level) * (1 + commonTones(c, current)) * (c.degree === 0 ? 0.3 : 1));
      // The arrival keeps a note of the pivot when it can.
      const near = arrivals.filter((c) => commonTones(c, pivot) >= 1);
      const arrival = weighted(this.conductor, near.length ? near : arrivals, (c) => typeWeight(c.type, level) * (0.2 + commonTones(c, pivot)));
      return [
        { key: from, chord: pivot, extra: { pivotFor: { ...record, method: 'pivot' } } },
        { key: to, chord: arrival, extra: { modulation: { ...record, method: 'pivot' } } },
      ];
    }
    const sharing = chordsInKey(to, level).filter((c) => commonTones(c, current) >= 1);
    if (sharing.length) {
      const arrival = weighted(this.conductor, sharing, (c) => typeWeight(c.type, level) * commonTones(c, current) * (c.degree === 0 ? 3 : 0.6));
      return [{ key: to, chord: arrival, extra: { modulation: { ...record, method: 'common' } } }];
    }
    return [{ key: to, chord: weighted(this.conductor, arrivals, (c) => typeWeight(c.type, level)), extra: { modulation: { ...record, method: 'direct' } } }];
  }

  _advanceHarmony(s) {
    let next;
    if (!this.harmony) {
      const home = this.home;
      const level = this._level();
      const tonic = weighted(this.conductor, chordsInKey(home, level).filter((c) => c.degree === 0), (c) => typeWeight(c.type, level));
      next = this._chordFor(home, tonic, s);
    } else if (this.ending && s >= this.ending.finalStart) {
      // A journey home still under way arrives now, on the final chord.
      const pending = this.plan.length ? this.plan[this.plan.length - 1] : null;
      const key = pending ? pending.key : this.key;
      if (!pending && this.harmony.chord.degree === 0 && this.harmony.chord.type !== 'five' && sameKey(this.harmony.key, key)) {
        // Already on the home chord: it simply stays to the end.
        next = { ...this.harmony, startStep: s, endStep: this.ending.endStep, final: true, modulation: undefined, pivotFor: undefined };
      } else {
        const level = this._level();
        const tonics = chordsInKey(key, level).filter((c) => c.degree === 0 && c.type !== 'five');
        const final = weighted(this.conductor, tonics.length ? tonics : chordsInKey(key, 4).filter((c) => c.degree === 0), (c) => typeWeight(c.type, level) * (['sus2', 'major', 'minor', 'add9', 'madd9', 'six9'].includes(c.type) ? 2 : 0.6));
        this.plan = [];
        this.harmony = { ...this.harmony, chord: { ...this.harmony.chord } };
        next = this._chordFor(key, final, s, { final: true, ...(pending?.extra?.modulation ? { modulation: pending.extra.modulation } : {}) });
        next.chord.bass = next.chord.root;
        next.endStep = this.ending.endStep;
      }
    } else {
      if (this.ending && s >= this.ending.homeBy && !this.ending.homing) {
        this.ending.homing = true;
        this.nextModulationAt = Infinity;
        this.plan = sameKey(this.key, this.home) ? [] : this._planModulation({ to: this.home, kind: modulationKind(this.key, this.home) });
      }
      if (!this.plan.length && s >= this.nextModulationAt) {
        this.plan = this._planModulation();
        this.nextModulationAt = this._drawModulationGap(s);
      }
      if (this.plan.length) {
        const item = this.plan.shift();
        next = this._chordFor(item.key, item.chord, s, item.extra);
      } else {
        next = this._chordFor(this.key, this._nextInKey(this.key), s);
      }
    }
    if (next.modulation) this.chordsInKey = 0;
    else this.chordsInKey++;
    this.chordsSinceTonic = next.chord.degree === 0 ? 0 : this.chordsSinceTonic + 1;
    this.harmony = next;
    this.history.push({ key: next.key, chord: next.chord });
    if (this.history.length > 64) this.history.shift();
    return next;
  }

  // ------------------------------------------------------------ notes

  _bassNote(idx, chord) {
    const bass = 33 + mod12(chord.bass - 33);
    if (idx === 1) {
      const fifth = mod12(chord.bass + 7);
      // Not when a chord note would sit a minor ninth or a tritone above it.
      const ok = chord.pcs.every((pc) => ![1, 6].includes(mod12(pc - fifth)));
      return ok ? bass + 7 : bass;
    }
    if (idx === 2) return bass + 12;
    if (idx === 3) {
      const third = chord.pcs.find((pc) => [3, 4].includes(mod12(pc - chord.root)));
      const ok = third !== undefined && chord.bass === chord.root && chord.pcs.every((pc) => ![1, 6].includes(mod12(pc - third)));
      return ok ? bass + mod12(third - chord.bass) : bass + 12;
    }
    return bass;
  }

  // The notes the moving layers may use: the whole chord, except a colour note that
  // sits a semitone from another chord note (the ninth of a minor ninth chord, the
  // major seventh). The pad keeps it, voiced a major seventh apart; a running
  // arpeggio with echoes would make it rub.
  _melodicPcs(chord) {
    const core = chord.pcs.filter((pc) => [0, 3, 4, 5, 7].includes(mod12(pc - chord.root)));
    const kept = [...core];
    for (const pc of chord.pcs) {
      if (kept.includes(pc)) continue;
      if (kept.every((other) => ![1, 11].includes(mod12(pc - other)))) kept.push(pc);
    }
    return kept;
  }

  _ladderNote(chord, idx, oct, from, span, ceiling) {
    const ladder = chordLadder({ pcs: this._melodicPcs(chord) }, from, span);
    if (!ladder.length) return null;
    let midi = ladder[idx % ladder.length] + 12 * Math.floor(idx / ladder.length) + 12 * oct;
    while (midi > ceiling) midi -= 12;
    while (midi < from - 12) midi += 12;
    return midi;
  }

  _mutate(layer, s) {
    const random = this.mutator;
    const steps = layer.pattern;
    const kind = weighted(random, ['toggle', 'move', 'octave', 'accent'], (k) => (k === 'octave' && layer.id === 'bass' ? 0 : 1));
    const i = 1 + Math.floor(random() * Math.max(1, steps.length - 1));
    const step = steps[Math.min(i, steps.length - 1)];
    if (kind === 'toggle') {
      const onCount = steps.filter((x) => x.on).length;
      if (step.on && onCount > Math.ceil(steps.length * 0.4)) step.on = false;
      else step.on = true;
    } else if (kind === 'move') {
      const top = layer.id === 'bass' ? 2 : 6;
      step.idx = Math.max(0, Math.min(top, step.idx + (random() < 0.5 ? -1 : 1)));
      step.on = true;
    } else if (kind === 'octave') {
      step.oct = step.oct === 0 ? (random() < 0.5 ? 1 : -1) : 0;
    } else {
      step.accent = Math.max(0, Math.min(7, step.accent + (random() < 0.5 ? -2 : 2)));
    }
    this.lastMutationStep = s;
    return { layer: layer.id, change: kind, step: Math.min(i, steps.length - 1) };
  }

  // Produces everything that starts on the next sixteenth note.
  step() {
    const s = this.stepIndex++;
    const out = { step: s, harmony: null, events: [], mutation: null };
    if (this.ending && s >= this.ending.endStep) {
      if (!this.ending.done) for (const id of HOLD_IDS) out.events.push({ layer: id, step: s, notes: [], span: 0 });
      this.ending.done = true;
      out.ended = true;
      return out;
    }
    const leaving = (id) => this.ending && LEAVING_BAR[id] !== undefined && s >= this.ending.finalStart + LEAVING_BAR[id] * STEPS_PER_BAR;
    if (!this.harmony || s >= this.harmony.endStep) {
      out.harmony = this._advanceHarmony(s);
      const h = out.harmony;
      const span = h.endStep - s;
      out.events.push({ layer: 'pad', step: s, notes: h.voicing, span });
      out.events.push({ layer: 'drone', step: s, notes: this._droneNotes(h), span });
      out.events.push({ layer: 'air', step: s, notes: this._airNotes(h), span });
      this.lines.cello.nextAt = s;
      // New sequences by themselves, on a chord change, so that they come with it.
      if (s >= this.nextRenewAt && !h.final) {
        this.renewals++;
        this._redraw();
        this.nextRenewAt = s + this.settings.renew * STEPS_PER_BAR;
        out.renewed = this.renewals;
      }
      // Now and then one layer takes another of its sounds, also on a chord change.
      if (s >= this.nextRecolorAt && !h.final) {
        out.recolor = { layer: LAYERS[Math.floor(this.colours() * LAYERS.length)].id, pick: this.colours() };
        this.nextRecolorAt = this._drawRecolor(s);
      }
      // And one layer rests while another comes in.
      if (s >= this.nextRotateAt && !h.final) {
        out.rotate = this._rotate(s);
        this.nextRotateAt = this._drawRotate(s);
      }
    }
    const chord = this.harmony.chord;
    for (const id of SEQ_IDS) {
      const layer = this.layers[id];
      if (s % layer.div !== 0) continue;
      const slot = s / layer.div;
      const cycleStep = layer.pattern.length ? slot % layer.length : 0;
      if (cycleStep === 0 && s > 0) {
        if (layer.pendingLength && layer.pendingLength !== layer.length) {
          layer.length = layer.pendingLength;
          layer.pattern = makePattern(id, layer.length, this.seed, this._patternSalt());
          layer.cycles = 0;
        } else {
          layer.cycles++;
        }
        layer.pendingLength = null;
        // One detail every few dozen passes, never two layers at once.
        if (layer.cycles >= layer.mutateAfter && s - this.lastMutationStep >= 2 * STEPS_PER_BAR) {
          out.mutation = this._mutate(layer, s);
          layer.cycles = 0;
          layer.mutateAfter = this._drawMutationGap();
        }
      }
      const index = ((Math.floor(s / layer.div) % layer.length) + layer.length) % layer.length;
      const note = layer.pattern[index];
      if (!note?.on || leaving(id)) continue;
      let midi;
      if (id === 'bass') midi = this._bassNote(note.idx, chord);
      else if (id === 'arp') midi = this._ladderNote(chord, note.idx, note.oct, 55, 26, 86);
      else if (id === 'seq2') midi = this._ladderNote(chord, note.idx, note.oct, 45, 24, 72);
      else if (id === 'pulse') midi = this._ladderNote(chord, note.idx, note.oct, 60, 20, 81);
      else midi = this._ladderNote(chord, note.idx, note.oct, 67, 22, 93);
      if (midi === null) continue;
      out.events.push({ layer: id, step: s, midi, accent: note.accent, velocity: 0.45 + 0.55 * note.accent / 7, span: layer.div, index });
    }
    BELL_PERIODS.forEach((period, k) => {
      if ((s + this.bellOffsets[k]) % period !== 0 || s === 0 || leaving('bells')) return;
      const midi = this._ladderNote(chord, k + 1, 0, 74, 20, 96);
      if (midi === null || out.events.some((e) => e.layer === 'bells' && e.midi === midi)) return;
      out.events.push({ layer: 'bells', step: s, midi, accent: 3, velocity: 0.5 + 0.1 * (k % 3), span: period });
    });
    const cello = this._celloNote(s);
    if (cello) out.events.push(cello);
    const lead = leaving('lead') ? null : this._leadNote(s);
    if (lead) out.events.push(lead);
    const theme = leaving('theme') ? null : this._themeNote(s);
    if (theme) out.events.push(theme);
    return out;
  }

  // ------------------------------------------------------------ the other strands

  // The drone holds the home note (and its fifth) for as long as it fits the chord.
  _droneNotes(h) {
    const tonic = h.key.tonic;
    const chord = h.chord;
    const fits = (pc) => chord.pcs.every((other) => ![1, 6].includes(mod12(other - pc)));
    if (!(chord.pcs.includes(tonic) || pedalFits(tonic, chord)) || !fits(tonic)) return [];
    const low = 38 + mod12(tonic - 38);
    const fifth = mod12(tonic + 7);
    return fits(fifth) ? [low, low + 7] : [low];
  }

  // High strings: the two top notes of the pad, an octave higher.
  _airNotes(h) {
    const top = h.voicing.slice(-2);
    return top.map((m) => (m + 12 <= 93 ? m + 12 : m));
  }

  // The bowed low line: a chord note at each chord, and a second one halfway
  // through a long chord, close to the last.
  _celloNote(s) {
    const line = this.lines.cello;
    if (s < line.nextAt || !this.harmony) return null;
    const h = this.harmony;
    const length = h.endStep - h.startStep;
    const half = h.startStep + Math.round(length / 2 / STEPS_PER_BAR) * STEPS_PER_BAR;
    const end = s === h.startStep && length >= 8 * STEPS_PER_BAR && half < h.endStep ? half : h.endStep;
    line.nextAt = end;
    const chord = h.chord;
    const pcs = this._melodicPcs(chord);
    const options = [];
    for (let midi = 36; midi <= 55; midi++) if (pcs.includes(mod12(midi))) options.push(midi);
    if (!options.length) return null;
    const previous = line.midi ?? 45;
    const midi = weighted(line.random, options, (m) => {
      const d = Math.abs(m - previous);
      let w = d === 0 ? (s === h.startStep ? 1 : 0.2) : d <= 2 ? 2.4 : d <= 5 ? 1.6 : d <= 7 ? 0.7 : 0.2;
      if (mod12(m) === chord.root) w *= 1.4;
      if (m > 50) w *= 0.6;
      return w;
    });
    line.midi = midi;
    return { layer: 'cello', step: s, midi, accent: 4, velocity: 0.62, span: end - s };
  }

  // The long lead: long notes and long rests on the quarter notes, moving by
  // neighbouring chord notes, never across a chord change.
  _leadNote(s) {
    const line = this.lines.lead;
    if (s < line.nextAt || s % 4 !== 0 || !this.harmony) return null;
    const random = line.random;
    const left = this.harmony.endStep - s;
    if (left < 4) { line.nextAt = this.harmony.endStep; return null; }
    if (random() < 0.32) {
      line.nextAt = s + Math.min(left, weighted(random, [8, 16, 24, 32], () => 1));
      return null;
    }
    const length = Math.min(left, weighted(random, [8, 12, 16, 24, 32], (n) => (n === 16 ? 1.5 : 1)));
    line.idx = Math.max(0, Math.min(7, line.idx + weighted(random, [-2, -1, 0, 1, 2], (v) => [0.35, 1, 0.3, 1, 0.35][v + 2])));
    const midi = this._ladderNote(this.harmony.chord, line.idx, 0, 62, 20, 84);
    line.nextAt = s + length;
    if (midi === null) return null;
    return { layer: 'lead', step: s, midi, accent: 5, velocity: 0.55 + 0.25 * random(), span: length };
  }

  // The slow melody: its theme, then a long rest (two to eight bars), then the
  // theme again, now and then with one note moved. A note never crosses a chord
  // change: it waits for the next chord instead.
  _themeNote(s) {
    const line = this.lines.theme;
    if (s < line.nextAt || s % 4 !== 0 || !this.harmony) return null;
    const random = line.random;
    if (line.at >= line.notes.length) {
      line.at = 0;
      if (random() < 0.35) {
        const note = line.notes[Math.floor(random() * (line.notes.length - 1))];
        note.idx = Math.max(0, Math.min(7, note.idx + (random() < 0.5 ? -1 : 1)));
      }
      line.nextAt = s + weighted(random, [2, 4, 4, 6, 8], () => 1) * STEPS_PER_BAR;
      return null;
    }
    const left = this.harmony.endStep - s;
    if (left < 4) { line.nextAt = this.harmony.endStep; return null; }
    const { idx, length: wanted } = line.notes[line.at++];
    const length = Math.min(left, wanted);
    line.nextAt = s + length;
    const midi = this._ladderNote(this.harmony.chord, idx, 0, 64, 20, 86);
    if (midi === null) return null;
    return { layer: 'theme', step: s, midi, accent: 4, velocity: 0.5 + 0.2 * random(), span: length };
  }

  // Where each sequence is in its cycle, for the display.
  positions(stepIndex = this.stepIndex) {
    return Object.fromEntries(SEQ_IDS.map((id) => {
      const layer = this.layers[id];
      return [id, { index: ((Math.floor(stepIndex / layer.div) % layer.length) + layer.length) % layer.length, length: layer.length, pattern: layer.pattern }];
    }));
  }
}

export const tonicOf = (name) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(name);
export { scalePcs };
