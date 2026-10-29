// TANGERINE · the sound.
//
// Twelve layers, each with its own channel: a voice (subtractive synth, held
// strings, drone or bell), a slow drift of tuning, a slow breathing of level, a distance (dry or
// in the rooms) and a tempo-synced ping-pong echo whose repeats darken like tape.
// See "Le son" in the grammar: the shape of a note (ADSR and gate) matters more
// than the richness of its oscillators.
//
// A Graph is one complete instrument on one AudioContext. The live player and the
// offline renderer each build their own, and feed it from their own engine.

import { mulberry32, hashSeed, unit } from './rng.js';
import { SPACES, makeSpaceImpulse } from './space.js';
import { TangerineEngine, LAYERS, HOLD_IDS, driftWave } from './engine.js';
import { MIDI_LAYOUT } from './midi.js';
import { Journal, sliceToMidi } from './journal.js';
import { sliceToAbc, sliceToLeadSheet } from './abc.js';
import { chordName } from './theory.js';
import { BANK } from './samples.js';

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const dbToGain = (db) => (db <= -58 ? 0 : 10 ** (db / 20));
const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);
const lerp = (a, b, x) => a + (b - a) * x;
export const LAYER_IDS = LAYERS.map((layer) => layer.id);

// Echo lengths as fractions of a quarter note.
export const DIVISIONS = {
  '1/16': 0.25, '1/8t': 1 / 3, '1/8': 0.5, '1/4t': 2 / 3, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2, '1/1': 4,
};
export const DIVISION_LABEL = {
  '1/16': 'Sixteenth', '1/8t': 'Eighth triplet', '1/8': 'Eighth', '1/4t': 'Quarter triplet',
  '1/8.': 'Dotted eighth', '1/4': 'Quarter', '1/4.': 'Dotted quarter', '1/2': 'Half', '1/1': 'Whole bar',
};

// Oscillators: [waveform, semitones, cents, gain]. cutoff in Hz at middle C,
// env = how many octaves the filter envelope opens, q = resonance. Optional:
// vibrato { rate (Hz), depth (cents), delay (s) }, drive (soft saturation).
// The bass filter opens little and resonates little: a wide, resonant sweep on
// every short note is what quacks.
export const SOUNDS = {
  bass: {
    moog: { label: 'Moog bass', osc: [['sawtooth', 0, -5, 1], ['sawtooth', 0, 6, 0.8], ['sine', -12, 0, 0.7]], cutoff: 290, env: 1.5, q: 1.8, track: 0.4, gain: 1.1 },
    deep: { label: 'Deep bass', osc: [['sawtooth', 0, -3, 0.7], ['triangle', 0, 3, 0.8], ['sine', -12, 0, 0.8]], cutoff: 240, env: 1, q: 0.9, track: 0.35, gain: 1.25 },
    pulse: { label: 'Pulse bass', osc: [['pulse30', 0, 0, 1], ['sawtooth', 12, 4, 0.2]], cutoff: 320, env: 1.6, q: 2.2, track: 0.4, gain: 1 },
    round: { label: 'Round bass', osc: [['triangle', 0, 0, 1], ['sawtooth', 0, 3, 0.3]], cutoff: 420, env: 2, q: 2, track: 0.3, gain: 1.25 },
  },
  arp: {
    glass: { label: 'Glass', osc: [['square', 0, -4, 0.7], ['sawtooth', 12, 3, 0.35]], cutoff: 900, env: 2.6, q: 9, track: 0.6, gain: 0.8 },
    pluck: { label: 'Pluck', osc: [['sawtooth', 0, -6, 1], ['sawtooth', 0, 6, 0.8]], cutoff: 700, env: 3, q: 4, track: 0.6, gain: 0.75 },
    soft: { label: 'Soft', osc: [['triangle', 0, 0, 1], ['sine', 12, 0, 0.25]], cutoff: 2600, env: 1, q: 1, track: 0.3, gain: 1 },
  },
  motif: {
    lead: { label: 'Lead', osc: [['sawtooth', 0, -7, 0.8], ['pulse30', 0, 7, 0.6]], cutoff: 1300, env: 1.8, q: 4, track: 0.5, gain: 0.6 },
    flute: { label: 'Flute', osc: [['triangle', 0, 0, 1], ['sine', 12, 2, 0.18]], cutoff: 3200, env: 0.6, q: 1, track: 0.3, gain: 0.9 },
    soft: { label: 'Soft', osc: [['sine', 0, 0, 1], ['triangle', 12, 0, 0.2]], cutoff: 4000, env: 0.4, q: 0.7, track: 0.2, gain: 1 },
  },
  pad: {
    strings: { label: 'String ensemble', osc: [['sawtooth', 0, -8, 1], ['sawtooth', 0, 8, 1], ['sawtooth', 12, 0, 0.25]], cutoff: 2400, gain: 0.5 },
    choir: { label: 'Choir', osc: [['sawtooth', 0, -6, 1], ['sawtooth', 0, 6, 1]], formants: [[730, 1], [1090, 0.5], [2440, 0.22]], cutoff: 4200, gain: 1.2 },
    warm: { label: 'Warm', osc: [['triangle', 0, -5, 1], ['triangle', 0, 5, 1], ['sawtooth', 0, 0, 0.18]], cutoff: 1500, gain: 0.8 },
  },
  bells: {
    bell: { label: 'Bell', partials: [[1, 1, 1], [2, 0.32, 0.55], [3, 0.12, 0.35], [5.4, 0.05, 0.18]], gain: 0.55 },
    glass: { label: 'Glass', partials: [[1, 1, 1], [2.76, 0.28, 0.4], [5.4, 0.08, 0.2]], gain: 0.5 },
  },
  cello: {
    cello: { label: 'Cello', osc: [['sawtooth', 0, -4, 1], ['sawtooth', 0, 5, 0.8], ['pulse30', -12, 0, 0.15]], cutoff: 560, env: 0.7, q: 1.1, track: 0.5, gain: 1, vibrato: { rate: 5.3, depth: 9, delay: 0.7 } },
    dark: { label: 'Dark bow', osc: [['triangle', 0, -3, 1], ['sawtooth', 0, 4, 0.5]], cutoff: 420, env: 0.5, q: 0.8, track: 0.4, gain: 1.2, vibrato: { rate: 4.8, depth: 7, delay: 0.9 } },
    synth: { label: 'Synth cello', osc: [['pulse30', 0, -5, 1], ['sawtooth', 0, 5, 0.6]], cutoff: 700, env: 0.9, q: 1.6, track: 0.5, gain: 0.95 },
  },
  seq2: {
    pluck: { label: 'Pluck', osc: [['sawtooth', 0, -5, 1], ['sawtooth', 0, 5, 0.7]], cutoff: 560, env: 2.2, q: 2.5, track: 0.6, gain: 0.8 },
    pulse: { label: 'Pulse', osc: [['pulse30', 0, 0, 1], ['square', 12, 3, 0.2]], cutoff: 750, env: 1.8, q: 2.5, track: 0.5, gain: 0.75 },
    mallet: { label: 'Soft mallet', osc: [['triangle', 0, 0, 1], ['sine', 12, 0, 0.3]], cutoff: 1800, env: 1, q: 1, track: 0.3, gain: 1 },
  },
  lead: {
    tape: { label: 'Tape lead', osc: [['sawtooth', 0, -6, 1], ['square', 0, 6, 0.45]], cutoff: 1500, env: 0.8, q: 1.4, track: 0.5, gain: 0.55, drive: 2.4, vibrato: { rate: 5.6, depth: 12, delay: 0.8 } },
    reed: { label: 'Reed', osc: [['pulse30', 0, -4, 1], ['sawtooth', 12, 3, 0.15]], cutoff: 1300, env: 0.6, q: 1.2, track: 0.5, gain: 0.6, vibrato: { rate: 5, depth: 8, delay: 1 } },
    sine: { label: 'Sine lead', osc: [['sine', 0, 0, 1], ['triangle', 12, 2, 0.2]], cutoff: 4000, env: 0.3, q: 0.7, track: 0.2, gain: 1, vibrato: { rate: 5.2, depth: 10, delay: 0.6 } },
  },
  drone: {
    organ: { label: 'Low organ', osc: [['sine', 0, 0, 1], ['sine', 12, 0, 0.45], ['sine', 19, 0, 0.18], ['triangle', 0, 4, 0.3]], cutoff: 1400, gain: 1.4 },
    saw: { label: 'Saw drone', osc: [['sawtooth', 0, -6, 1], ['sawtooth', 0, 6, 1]], cutoff: 520, gain: 0.8 },
  },
  air: {
    strings: { label: 'Violins', osc: [['sawtooth', 0, -7, 1], ['sawtooth', 0, 7, 1]], cutoff: 3600, gain: 0.42 },
    glass: { label: 'Glass choir', osc: [['triangle', 0, -4, 1], ['sine', 12, 3, 0.3]], cutoff: 5000, gain: 0.8 },
    choir: { label: 'High choir', osc: [['sawtooth', 0, -6, 1], ['sawtooth', 0, 6, 1]], formants: [[800, 1], [1150, 0.45], [2900, 0.25]], cutoff: 5200, gain: 1 },
  },
  theme: {
    flute: { label: 'Tape flute', osc: [['triangle', 0, -3, 1], ['sine', 12, 2, 0.22], ['sawtooth', 0, 4, 0.08]], cutoff: 2200, env: 0.5, q: 0.9, track: 0.3, gain: 0.95, vibrato: { rate: 5.4, depth: 7, delay: 0.5 } },
    voice: { label: 'Soft voice', osc: [['sawtooth', 0, -5, 0.6], ['triangle', 0, 5, 1]], cutoff: 1100, env: 0.4, q: 1.2, track: 0.4, gain: 0.9, vibrato: { rate: 5, depth: 9, delay: 0.7 } },
    ocarina: { label: 'Ocarina', osc: [['sine', 0, 0, 1], ['sine', 12, 3, 0.12]], cutoff: 4000, env: 0.2, q: 0.7, track: 0.2, gain: 1.1, vibrato: { rate: 5.8, depth: 6, delay: 0.4 } },
  },
  pulse: {
    glass: { label: 'Glass pulse', osc: [['square', 0, -3, 0.8], ['sine', 12, 2, 0.3]], cutoff: 1100, env: 2, q: 5, track: 0.5, gain: 0.75 },
    marimba: { label: 'Wood', osc: [['sine', 0, 0, 1], ['triangle', 12, 0, 0.25]], cutoff: 2400, env: 1.2, q: 1, track: 0.3, gain: 1.1 },
    saw: { label: 'Saw pluck', osc: [['sawtooth', 0, -5, 1], ['sawtooth', 7, 5, 0.25]], cutoff: 650, env: 2.4, q: 3, track: 0.6, gain: 0.7 },
  },
};

// Starting points from the grammar ("Le son"): times in seconds, sustain and gate 0..1.
export const DEFAULT_LAYERS = {
  bass: { on: true, level: 0.8, sound: 'moog', a: 0.003, d: 0.2, s: 0.1, r: 0.06, gate: 0.27, delay: { div: '1/8', feedback: 0.25, mix: 0.08 } },
  arp: { on: true, level: 0.62, sound: 'glass', a: 0.005, d: 0.38, s: 0.25, r: 0.25, gate: 0.7, delay: { div: '1/8.', feedback: 0.45, mix: 0.38 } },
  motif: { on: true, level: 0.6, sound: 'lead', a: 0.02, d: 0.6, s: 0.45, r: 0.8, gate: 0.85, delay: { div: '1/4', feedback: 0.4, mix: 0.3 } },
  pad: { on: true, level: 0.55, sound: 'strings', a: 2.5, d: 2, s: 0.8, r: 5, gate: 1, delay: { div: '1/2', feedback: 0.2, mix: 0 } },
  bells: { on: true, level: 0.45, sound: 'bell', a: 0.001, d: 5, s: 0, r: 4, gate: 1, delay: { div: '1/4.', feedback: 0.35, mix: 0.25 } },
  cello: { on: true, level: 0.55, sound: 'cello', a: 0.45, d: 1.5, s: 0.85, r: 1.2, gate: 0.96, delay: { div: '1/4', feedback: 0.2, mix: 0 } },
  seq2: { on: true, level: 0.45, sound: 'pluck', a: 0.003, d: 0.25, s: 0.15, r: 0.15, gate: 0.6, delay: { div: '1/8.', feedback: 0.35, mix: 0.2 } },
  lead: { on: true, level: 0.42, sound: 'tape', a: 0.08, d: 1.2, s: 0.7, r: 1.5, gate: 0.92, delay: { div: '1/1', feedback: 0.6, mix: 0.45 } },
  drone: { on: false, level: 0.45, sound: 'organ', a: 4, d: 3, s: 0.9, r: 6, gate: 1, delay: { div: '1/2', feedback: 0.2, mix: 0 } },
  air: { on: false, level: 0.38, sound: 'strings', a: 3, d: 2, s: 0.85, r: 5, gate: 1, delay: { div: '1/4.', feedback: 0.3, mix: 0 } },
  theme: { on: true, level: 0.4, sound: 'flute', a: 0.12, d: 1.6, s: 0.75, r: 1.1, gate: 0.9, delay: { div: '1/4.', feedback: 0.4, mix: 0.3 } },
  pulse: { on: false, level: 0.4, sound: 'glass', a: 0.003, d: 0.3, s: 0.1, r: 0.3, gate: 0.4, delay: { div: '1/8.', feedback: 0.5, mix: 0.45 } },
};
export const ENVELOPE_LIMITS = { a: [0.001, 6], d: [0.02, 10], s: [0, 1], r: [0.01, 10], gate: [0.05, 1] };

// Where each layer stands: 0 at the ears, 1 on the horizon. Pan is -1..1.
const PLACE = {
  bass: { depth: 0.12, pan: 0 }, arp: { depth: 0.45, pan: -0.22 }, motif: { depth: 0.62, pan: 0.28 }, pad: { depth: 0.88, pan: 0 }, bells: { depth: 0.95, pan: 0.1 },
  cello: { depth: 0.3, pan: -0.12 }, seq2: { depth: 0.5, pan: 0.38 }, lead: { depth: 0.58, pan: -0.32 }, drone: { depth: 0.6, pan: 0 }, air: { depth: 0.9, pan: 0.2 },
  theme: { depth: 0.7, pan: 0.24 }, pulse: { depth: 0.55, pan: -0.4 },
};
const DRY_DB = [0, -1.5, -4, -8, -13];
const LOWPASS_HZ = [17000, 13000, 9000, 6000, 3800];
const ROOM_DB = [-34, -22, -14, -12, -16];
const HALL_DB = [-60, -30, -17, -10, -8];
const VAST_DB = [-60, -60, -28, -16, -9];
function anchor(table, depth, logarithmic = false) {
  const x = clamp(depth) * (table.length - 1);
  const i = Math.min(table.length - 2, Math.floor(x));
  const f = x - i;
  return logarithmic ? table[i] * (table[i + 1] / table[i]) ** f : table[i] + (table[i + 1] - table[i]) * f;
}

// motion: 0.7 is the old maximum; drift: how far the settings wander over minutes.
export const DEFAULT_GLOBAL = { bpm: 80, volume: 0.6, wet: 0.5, space: 0.5, motion: 0.7, drift: 0.5 };
const motionOf = (global) => clamp(global.motion) / 0.7;
// The echo repeats as set (0..1) and as heard: never more than 0.72, so it fades.
export const ECHO_MAX = 0.72;

// ---------------------------------------------------------------- one instrument

export class Graph {
  constructor(ctx, { seed = 1, layers, global }) {
    this.ctx = ctx;
    this.seed = seed;
    this.layers = layers;
    this.global = global;
    this.waves = {};
    this.held = Object.fromEntries(HOLD_IDS.map((id) => [id, new Map()]));
    this.lastHold = Object.fromEntries(HOLD_IDS.map((id) => [id, []]));
    this.midiHeld = Object.fromEntries(HOLD_IDS.map((id) => [id, new Set()]));
    this.solo = null;
    this.local = 0;
    this.origin = ctx.currentTime;
    this.midiOut = null;
    this.midiOnly = false;
    this.journal = null;
    this.feed = [];
    this._build();
  }

  _wave(type) {
    if (type !== 'pulse30') return null;
    if (!this.waves[type]) {
      const n = 64;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.3);
      this.waves[type] = this.ctx.createPeriodicWave(real, imag);
    }
    return this.waves[type];
  }

  _build() {
    const ctx = this.ctx;
    this.mix = ctx.createGain();
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 28;
    highpass.Q.value = 0.6;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.35;
    // Make-up gain before the glue compressor, then a safety limiter, then the volume.
    this.mix.gain.value = 2.2;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.out = ctx.createGain();
    this.out.gain.value = this.global.volume;
    this.mix.connect(highpass);
    highpass.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.out);
    this.out.connect(ctx.destination);

    this.rooms = {};
    for (const name of ['room', 'hall', 'vast']) {
      const input = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.normalize = false;
      convolver.buffer = makeSpaceImpulse(ctx, SPACES[name], this.seed, name);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = name === 'room' ? 9000 : name === 'hall' ? 7000 : 5000;
      tone.Q.value = 0.5;
      const back = ctx.createGain();
      input.connect(convolver);
      convolver.connect(tone);
      tone.connect(back);
      back.connect(this.mix);
      this.rooms[name] = { input, convolver, tone, back };
    }

    this.channels = {};
    LAYERS.forEach((def, index) => {
      const id = def.id;
      const place = PLACE[id];
      const input = ctx.createGain();
      const breath = ctx.createGain();
      const level = ctx.createGain();
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.Q.value = 0.4;
      low.frequency.value = anchor(LOWPASS_HZ, place.depth, true);
      const panner = ctx.createStereoPanner();
      panner.pan.value = place.pan;
      const dry = ctx.createGain();
      const sends = { room: ctx.createGain(), hall: ctx.createGain(), vast: ctx.createGain() };
      let head = input;
      if (id === 'pad' || id === 'air') head = this._chorus(input);
      head.connect(breath);
      breath.connect(level);
      level.connect(low);
      low.connect(panner);
      panner.connect(dry);
      dry.connect(this.mix);
      for (const [name, send] of Object.entries(sends)) {
        panner.connect(send);
        send.connect(this.rooms[name].input);
      }
      // A held layer's shared filter: every voice goes through it, and it breathes slowly.
      let holdFilter = null;
      if (HOLD_IDS.includes(id)) {
        holdFilter = ctx.createBiquadFilter();
        holdFilter.type = 'lowpass';
        holdFilter.Q.value = 0.9;
        holdFilter.frequency.value = 2400;
        holdFilter.connect(input);
      }
      const echo = this._echo(level, sends.hall);
      // Slow life: tuning that drifts by a few cents, a level that breathes.
      const random = mulberry32(hashSeed(this.seed, 'life', id));
      const drift = ctx.createGain();
      drift.gain.value = 0;
      const driftLfo = ctx.createOscillator();
      driftLfo.frequency.value = 1 / (17 + 40 * random());
      driftLfo.connect(drift);
      driftLfo.start();
      const breathDepth = ctx.createGain();
      breathDepth.gain.value = 0;
      const breathLfo = ctx.createOscillator();
      breathLfo.frequency.value = 1 / (120 + 240 * random());
      breathLfo.connect(breathDepth);
      breathDepth.connect(breath.gain);
      breathLfo.start();
      this.channels[id] = {
        id, index, input, breath, level, low, panner, dry, sends, echo, drift, driftLfo, breathDepth, breathLfo, holdFilter,
        spiral: { p1: 45 + 150 * random(), f1: 6.283 * random(), p2: 70 + 170 * random(), f2: 6.283 * random() },
      };
    });
    this.applyAll();
  }

  _chorus(input) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.72;
    input.connect(dry);
    dry.connect(out);
    [-0.75, 0, 0.75].forEach((pan, k) => {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.011 + 0.0045 * k;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = [0.31, 0.53, 0.83][k];
      const depth = ctx.createGain();
      depth.gain.value = 0.0022;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      lfo.start();
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      const gain = ctx.createGain();
      gain.gain.value = 0.36;
      input.connect(delay);
      delay.connect(panner);
      panner.connect(gain);
      gain.connect(out);
    });
    return out;
  }

  // Ping-pong: left, right, left... each repeat a little darker and thinner, as on
  // tape, through a soft saturation: however high the repeats are set, they fade.
  _echo(source, hallSend) {
    const ctx = this.ctx;
    const send = ctx.createGain();
    const left = ctx.createDelay(4);
    const right = ctx.createDelay(4);
    const tape = this._tapeCurve();
    const [shadeL, shadeR] = [left, right].map((delay) => {
      const shade = ctx.createBiquadFilter();
      shade.type = 'lowpass'; shade.frequency.value = 3400; shade.Q.value = 0.5;
      const thin = ctx.createBiquadFilter();
      thin.type = 'highpass'; thin.frequency.value = 140; thin.Q.value = 0.5;
      const sat = ctx.createWaveShaper();
      sat.curve = tape;
      delay.connect(shade);
      shade.connect(thin);
      thin.connect(sat);
      return sat;
    });
    const feedbackL = ctx.createGain();
    const feedbackR = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const out = ctx.createGain();
    const toHall = ctx.createGain();
    toHall.gain.value = 0.35;
    source.connect(send);
    send.connect(left);
    shadeL.connect(feedbackL);
    feedbackL.connect(right);
    shadeR.connect(feedbackR);
    feedbackR.connect(left);
    shadeL.connect(merger, 0, 0);
    shadeR.connect(merger, 0, 1);
    merger.connect(out);
    out.connect(this.mix);
    out.connect(toHall);
    toHall.connect(hallSend);
    return { send, left, right, feedbackL, feedbackR, out };
  }

  _tapeCurve(drive = 1.4) {
    const key = `tape${drive}`;
    if (!this.waves[key]) {
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(drive * x) / Math.tanh(drive); }
      this.waves[key] = curve;
    }
    return this.waves[key];
  }

  // Heard: switched on (or the one being listened to alone), and not MIDI only.
  audible(id) {
    if (this.midiOnly) return false;
    if (this.stage && !this.stage.has(id)) return false;
    return this.solo ? this.solo === id : !!this.layers[id].on;
  }

  // A staged entry or exit (a whole piece's intro and outro): only these layers sound,
  // or null: all of them. A layer that leaves fades with its own release, the rest stay as loud.
  setStage(ids, t = this.ctx.currentTime, fade = 0.4) {
    this.stage = ids ? new Set(ids) : null;
    for (const id of LAYER_IDS) {
      const gain = this.channels[id].level.gain;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t); else gain.cancelScheduledValues(t);
      gain.setTargetAtTime(this.audible(id) ? this.layers[id].level : 0, t, fade);
    }
    this.refreshHolds(t);
  }

  // The slow drift of one setting of one layer: a factor around 1.
  _drift(id, name, octaves) {
    const amount = clamp(this.global.drift);
    return amount ? 2 ** (octaves * amount * driftWave(this.seed, this.local, id, name)) : 1;
  }

  _echoNow(id) {
    const s = this.layers[id];
    const feedback = Math.min(ECHO_MAX, ECHO_MAX * clamp(s.delay.feedback) * this._drift(id, 'feedback', 0.3));
    const mix = clamp(s.delay.mix * this._drift(id, 'mix', 0.6));
    // The more it repeats, the lower it comes back: the sum stays about the same.
    return { feedback, level: mix * 0.9 * (1 - 0.65 * feedback) };
  }

  stepSeconds() { return 60 / this.global.bpm / 4; }

  applyAll(immediate = true) {
    for (const id of LAYER_IDS) this.applyLayer(id, immediate);
    this.applyGlobal(immediate);
  }

  _set(param, value, immediate, tc = 0.08) {
    if (immediate) param.value = value;
    else param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  applyLayer(id, immediate = false) {
    const ch = this.channels[id];
    const s = this.layers[id];
    this._set(ch.level.gain, this.audible(id) ? s.level : 0, immediate, 0.12);
    const echo = ch.echo;
    const seconds = Math.min(3.9, 60 / this.global.bpm * DIVISIONS[s.delay.div]);
    this._set(echo.left.delayTime, seconds, immediate, 0.05);
    this._set(echo.right.delayTime, seconds, immediate, 0.05);
    const now = this._echoNow(id);
    this._set(echo.feedbackL.gain, now.feedback, immediate);
    this._set(echo.feedbackR.gain, now.feedback, immediate);
    this._set(echo.send.gain, s.delay.mix > 0 ? 1 : 0, immediate);
    this._set(echo.out.gain, now.level, immediate);
  }

  applyGlobal(immediate = false) {
    const g = this.global;
    this._set(this.out.gain, g.volume, immediate, 0.1);
    const wet = clamp(g.wet);
    const size = clamp(g.space);
    const dryScale = lerp(1.12, 0.62, wet);
    const sendScale = lerp(0.22, 1.9, wet);
    const scale = { room: (1.35 - 0.7 * size) * sendScale, hall: (0.7 + 0.6 * size) * sendScale, vast: (0.3 + 1.3 * size) * sendScale };
    for (const id of LAYER_IDS) {
      const ch = this.channels[id];
      const depth = PLACE[id].depth;
      this._set(ch.dry.gain, dbToGain(anchor(DRY_DB, depth)) * dryScale, immediate, 0.3);
      this._set(ch.sends.room.gain, dbToGain(anchor(ROOM_DB, depth)) * scale.room, immediate, 0.3);
      this._set(ch.sends.hall.gain, dbToGain(anchor(HALL_DB, depth)) * scale.hall, immediate, 0.3);
      this._set(ch.sends.vast.gain, dbToGain(anchor(VAST_DB, depth)) * scale.vast, immediate, 0.3);
      const motion = motionOf(g);
      const sway = Math.min(0.4, (id === 'bass' ? 0.12 : 0.3) * motion);
      this._set(ch.drift.gain, 6 * motion, immediate, 0.5);
      this._set(ch.breathDepth.gain, sway, immediate, 0.5);
      this._set(ch.breath.gain, 1 - sway, immediate, 0.5);
    }
    for (const id of LAYER_IDS) this.applyLayer(id, immediate);
  }

  // The filter spiral: each layer's brightness and note length turn on their own slow loops.
  spiral(id, t) {
    const sp = this.channels[id].spiral;
    const motion = motionOf(this.global);
    const x = t - this.origin;
    return {
      bright: 2 ** (motion * 1.1 * Math.sin(6.2832 * x / sp.p1 + sp.f1)),
      length: 2 ** (motion * 0.7 * Math.sin(6.2832 * x / sp.p2 + sp.f2)),
    };
  }

  // ------------------------------------------------------------ voices

  _oscillator(type, freq, semis, cents, t, drift) {
    const osc = this.ctx.createOscillator();
    const wave = this._wave(type);
    if (wave) osc.setPeriodicWave(wave);
    else osc.type = type;
    osc.frequency.value = freq * 2 ** (semis / 12);
    osc.detune.value = cents;
    if (drift) drift.connect(osc.detune);
    osc.start(t);
    return osc;
  }

  // A sampled sound that is not installed (or not loaded yet) plays the layer's first synth.
  _sound(id, name) {
    const sound = SOUNDS[id][name] || Object.values(SOUNDS[id])[0];
    if (sound.sample && !BANK.has(sound.sample)) return Object.values(SOUNDS[id]).find((x) => !x.sample);
    return sound;
  }

  // One sampled note, as [[source, gain]] like the oscillators: the nearest zone,
  // transposed; it loops on its steady middle when asked to hold.
  // A held sample plays twice, a few cents apart, as an ensemble would: a single one-shot sounds flat.
  _samples(sound, midi, t, drift, hold, sum) {
    const zone = BANK.zone(sound.sample, midi);
    const voices = hold ? [[-6, 0, 0.62], [6, 0.037, 0.62]] : [[0, 0, 1]];
    return voices.map(([cents, offset, level]) => {
      const src = this.ctx.createBufferSource();
      src.buffer = zone.buffer;
      src.playbackRate.value = zone.rate;
      src.detune.value = cents;
      if (hold && zone.loop) { src.loop = true; [src.loopStart, src.loopEnd] = zone.loop; }
      if (drift) drift.connect(src.detune);
      const g = this.ctx.createGain();
      g.gain.value = zone.gain * level;
      src.connect(g);
      g.connect(sum);
      src.start(t, offset);
      return [src, g];
    });
  }

  // A real reverberation for the vast room (an AudioBuffer), or null: the synthesized one.
  // It is brought to the synthesized one's energy, so the Space slider keeps its meaning.
  setSpace(impulse) {
    const vast = this.rooms.vast;
    vast.synthetic ||= vast.convolver.buffer;
    if (!impulse) { vast.convolver.buffer = vast.synthetic; return; }
    const energy = (buffer) => {
      let sum = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) for (const x of buffer.getChannelData(c)) sum += x * x;
      return sum / buffer.numberOfChannels;
    };
    const channels = Math.min(2, impulse.numberOfChannels);
    const copy = this.ctx.createBuffer(channels, impulse.length, impulse.sampleRate);
    const scale = Math.sqrt(energy(vast.synthetic) / Math.max(1e-9, energy(impulse)));
    for (let c = 0; c < channels; c++) {
      const from = impulse.getChannelData(c);
      const to = copy.getChannelData(c);
      for (let i = 0; i < from.length; i++) to[i] = from[i] * scale;
    }
    vast.convolver.buffer = copy;
  }

  playSequenced(id, event, t) {
    const ctx = this.ctx;
    const s = this.layers[id];
    const sound = this._sound(id, s.sound);
    const ch = this.channels[id];
    const acc = event.accent / 7;
    const vel = event.velocity;
    const life = this.spiral(id, t);
    const gate = Math.min(1, s.gate * this._drift(id, 'gate', 0.8));
    const gateSeconds = Math.max(0.01, gate * event.span * this.stepSeconds());
    const tOff = t + gateSeconds;
    if (s.on) {
      this._sendMidi(id, event.midi, vel, t, gateSeconds);
      if (this.journal) this.journal.note(id, event.midi, vel, event.step, gate * event.span);
    }
    if (!this.audible(id)) return;
    const freq = mtof(event.midi);
    const a = Math.max(0.001, s.a * this._drift(id, 'attack', 0.6));
    const d = Math.max(0.01, s.d * life.length * (1 + 0.3 * acc) * this._drift(id, 'decay', 0.8));
    const r = Math.max(0.01, s.r * this._drift(id, 'release', 0.6));
    const tRel = Math.max(tOff, t + a);
    const end = tRel + r * 2 + 0.05;

    const sum = ctx.createGain();
    const zone = sound.sample && BANK.zone(sound.sample, event.midi);
    const long = zone && tRel - t > 0.8 * zone.buffer.duration / zone.rate;
    // Short notes sound softer than the same sample held: they get a lift to sit like the synths.
    const oscs = sound.sample ? this._samples(sound, event.midi, t, ch.drift, long, sum).map(([src, g]) => { g.gain.value *= 2.5; src.stop(end); return [src, g]; }) : sound.osc.map(([type, semis, cents, gain]) => {
      const osc = this._oscillator(type, freq, semis, cents + (unit(this.seed, id, event.step, gain) - 0.5) * 4, t, ch.drift);
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(sum);
      osc.stop(end);
      return [osc, g];
    });
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'lowpass';
    f1.Q.value = sound.q;
    f2.Q.value = 0.7;
    const base = clamp(sound.cutoff * 2 ** (sound.track * (event.midi - 60) / 12) * life.bright * (1 + 0.4 * acc) * this._drift(id, 'bright', 0.5), 40, 16000);
    const peak = clamp(base * 2 ** (sound.env * (0.55 + 0.45 * vel)), 40, 18000);
    for (const f of [f1, f2]) {
      f.frequency.setValueAtTime(base, t);
      f.frequency.linearRampToValueAtTime(peak, t + a);
      if (tRel > t + a) f.frequency.setTargetAtTime(base + (peak - base) * s.s, t + a, d / 3);
      f.frequency.setTargetAtTime(base, tRel, r / 3);
    }
    const vca = ctx.createGain();
    const top = 0.22 * sound.gain * vel * this._drift(id, 'level', 0.35);
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(top, t + a);
    if (tRel > t + a) vca.gain.setTargetAtTime(top * s.s, t + a, d / 3);
    vca.gain.setTargetAtTime(0, tRel, r / 3);
    const extra = [];
    // A bowed or held note: the vibrato comes in after a moment.
    if (sound.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = sound.vibrato.rate * (0.94 + 0.12 * unit(this.seed, id, event.step, 'vib'));
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setTargetAtTime(sound.vibrato.depth, t + sound.vibrato.delay, 0.4);
      lfo.connect(depth);
      for (const [osc] of oscs) depth.connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
      extra.push(lfo, depth);
    }
    sum.connect(f1);
    f1.connect(f2);
    if (sound.drive) {
      const drive = ctx.createWaveShaper();
      drive.curve = this._tapeCurve(sound.drive);
      const trim = ctx.createGain();
      trim.gain.value = 0.7;
      f2.connect(drive);
      drive.connect(trim);
      trim.connect(vca);
      extra.push(drive, trim);
    } else {
      f2.connect(vca);
    }
    vca.connect(ch.input);
    oscs[0][0].onended = () => {
      for (const [osc, g] of oscs) { try { ch.drift.disconnect(osc.detune); } catch {} osc.disconnect(); g.disconnect(); }
      for (const node of [sum, f1, f2, vca, ...extra]) node.disconnect();
    };
    this._feed(id, event.midi, t, gateSeconds);
  }

  playBell(event, t) {
    const ctx = this.ctx;
    const s = this.layers.bells;
    const sound = this._sound('bells', s.sound);
    const ring = Math.max(0.2, s.d * this._drift('bells', 'decay', 0.6));
    if (s.on) {
      this._sendMidi('bells', event.midi, event.velocity, t, Math.min(ring, 2));
      if (this.journal) this.journal.note('bells', event.midi, event.velocity, event.step, 8);
    }
    if (!this.audible('bells')) return;
    const ch = this.channels.bells;
    const freq = mtof(event.midi);
    const vca = ctx.createGain();
    vca.gain.value = 0.16 * sound.gain * event.velocity;
    vca.connect(ch.input);
    const nodes = [vca];
    let last = null;
    if (sound.sample) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.6, t + Math.max(0.001, s.a));
      env.gain.setTargetAtTime(0, t + Math.max(0.001, s.a), ring / 3);
      env.connect(vca);
      const [[src, g]] = this._samples(sound, event.midi, t, ch.drift, false, env);
      src.stop(t + ring * 1.6 + 0.1);
      nodes.push(env, src, g);
      last = src;
    }
    for (const [ratio, gain, length] of sound.sample ? [] : sound.partials) {
      if (freq * ratio > 16000) continue;
      const osc = this._oscillator('sine', freq * ratio, 0, 0, t, ch.drift);
      const env = ctx.createGain();
      const decay = ring * length;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + Math.max(0.001, s.a));
      env.gain.setTargetAtTime(0, t + Math.max(0.001, s.a), decay / 4);
      osc.connect(env);
      env.connect(vca);
      osc.stop(t + decay * 1.3 + 0.1);
      nodes.push(osc, env);
      last = osc;
    }
    if (last) {
      last.onended = () => {
        for (const node of nodes) { if (node instanceof AudioScheduledSourceNode) { try { ch.drift.disconnect(node.detune); } catch {} } node.disconnect(); }
      };
    }
    this._feed('bells', event.midi, t, 1.2);
  }

  // The pad holds a chord until the next one. Common tones are not struck again:
  // they simply carry on, which is what makes a common-tone modulation glide.
  changeChord(notes, t, step, key = null, name = '') {
    if (this.journal && step !== undefined) this.journal.chord(notes, step, key, name, !!this.layers.pad.on);
    this.hold('pad', notes, t);
  }

  // Any held layer (pad, drone, high strings): notes it already holds carry on.
  // step: given when the engine plays it (it is then written down).
  hold(id, notes, t, step) {
    const s = this.layers[id];
    const ch = this.channels[id];
    const voices = this.held[id];
    this.lastHold[id] = [...notes];
    if (this.journal && step !== undefined && id !== 'pad') this.journal.hold(id, s.on ? notes : [], step);
    const audible = this.audible(id);
    for (const [midi, voice] of voices) {
      if (notes.includes(midi) && voice.real === this._sound(id, s.sound) && audible) continue;
      this._release(id, midi, voice, t);
    }
    this._holdMidi(id, s.on ? notes : [], t);
    if (!audible) return;
    const sound = this._sound(id, s.sound);
    ch.holdFilter.frequency.setTargetAtTime(clamp(sound.cutoff * this.spiral(id, t).bright * this._drift(id, 'bright', 0.5), 200, 9000), t, 2.5);
    for (const midi of notes) {
      if (voices.has(midi)) continue;
      voices.set(midi, this._holdVoice(id, midi, sound, s, t));
    }
    this._feed(id, notes, t, 0);
  }

  // After a switch, a solo or a new sound: the held layers take up their notes again.
  refreshHolds(t = this.ctx.currentTime + 0.05) {
    for (const id of HOLD_IDS) this.hold(id, this.lastHold[id], t);
  }

  _holdVoice(id, midi, sound, s, t) {
    const ctx = this.ctx;
    const ch = this.channels[id];
    const freq = mtof(midi);
    const vca = ctx.createGain();
    const top = 0.075 * sound.gain * (midi < 55 && id === 'pad' ? 0.8 : 1) * this._drift(id, 'level', 0.35);
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(top, t + Math.max(0.01, s.a));
    vca.gain.setTargetAtTime(top * Math.max(0.05, s.s), t + Math.max(0.01, s.a), Math.max(0.05, s.d) / 3);
    const sum = ctx.createGain();
    const nodes = [vca, sum];
    const oscs = sound.sample ? this._samples(sound, midi, t, ch.drift, true, sum).map(([src, g]) => { nodes.push(src, g); return src; }) : sound.osc.map(([type, semis, cents, gain]) => {
      const osc = this._oscillator(type, freq, semis, cents, t, ch.drift);
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(sum);
      nodes.push(osc, g);
      return osc;
    });
    if (sound.formants && !sound.sample) {
      for (const [hz, gain] of sound.formants) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = hz;
        band.Q.value = 7;
        const g = ctx.createGain();
        g.gain.value = gain * 2.2;
        sum.connect(band);
        band.connect(g);
        g.connect(vca);
        nodes.push(band, g);
      }
    } else {
      sum.connect(vca);
    }
    vca.connect(ch.holdFilter);
    return { vca, oscs, nodes, sound: s.sound, real: sound, released: false };
  }

  _release(id, midi, voice, t) {
    const r = Math.max(0.05, this.layers[id].r);
    if (voice.vca.gain.cancelAndHoldAtTime) voice.vca.gain.cancelAndHoldAtTime(t);
    else voice.vca.gain.cancelScheduledValues(t);
    voice.vca.gain.setTargetAtTime(0, t, r / 3);
    const ch = this.channels[id];
    voice.oscs.forEach((osc, i) => {
      osc.stop(t + r * 2 + 0.1);
      if (i === 0) {
        osc.onended = () => {
          for (const node of voice.nodes) { if (node instanceof AudioScheduledSourceNode) { try { ch.drift.disconnect(node.detune); } catch {} } node.disconnect(); }
        };
      }
    });
    this.held[id].delete(midi);
  }

  releaseAll(t = this.ctx.currentTime) {
    for (const id of HOLD_IDS) {
      for (const [midi, voice] of [...this.held[id]]) this._release(id, midi, voice, t);
      this._holdMidi(id, [], t);
    }
  }

  // ------------------------------------------------------------ outside

  _feed(layer, midi, t, length) {
    this.feed.push({ layer, midi, t, length });
    if (this.feed.length > 600) this.feed.splice(0, this.feed.length - 600);
  }

  _timestamp(t) {
    const stamp = this.ctx.getOutputTimestamp ? this.ctx.getOutputTimestamp() : null;
    if (stamp && stamp.performanceTime) return stamp.performanceTime + (t - stamp.contextTime) * 1000;
    return performance.now() + (t - this.ctx.currentTime) * 1000;
  }

  _sendMidi(id, midi, velocity, t, seconds) {
    if (!this.midiOut) return;
    const ch = MIDI_LAYOUT[id].channel;
    const at = this._timestamp(t);
    try {
      this.midiOut.send([0x90 | ch, midi, Math.max(1, Math.round(velocity * 127))], at);
      this.midiOut.send([0x80 | ch, midi, 64], at + seconds * 1000);
    } catch { /* A port that disappears is simply skipped. */ }
  }

  _holdMidi(id, notes, t) {
    const held = this.midiHeld[id];
    if (!this.midiOut) { held.clear(); return; }
    const ch = MIDI_LAYOUT[id].channel;
    const at = this._timestamp(t);
    try {
      for (const midi of [...held]) {
        if (!notes.includes(midi)) { this.midiOut.send([0x80 | ch, midi, 64], at); held.delete(midi); }
      }
      for (const midi of notes) {
        if (!held.has(midi)) { this.midiOut.send([0x90 | ch, midi, 76], at); held.add(midi); }
      }
    } catch { /* idem */ }
  }

  // One layer rests, another comes in, both slowly (the chord changes at t).
  rotate({ off, on }, t) {
    this.layers[off].on = false;
    this.layers[on].on = true;
    for (const id of [off, on]) {
      const gain = this.channels[id].level.gain;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t); else gain.cancelScheduledValues(t);
      gain.setTargetAtTime(this.audible(id) ? this.layers[id].level : 0, t, id === off ? 1.2 : 0.8);
    }
    for (const id of [off, on]) if (HOLD_IDS.includes(id)) this.hold(id, this.lastHold[id], t);
  }

  // Plays one step of the engine's output at time t.
  // out.local: the engine's own step (the drift follows it, live and offline alike).
  dispatch(out, t) {
    this.local = out.local ?? out.step;
    if (out.rotate) this.rotate(out.rotate, t);
    if (out.recolor) {
      // Another of the layer's sounds, never the one it has.
      const { layer, pick } = out.recolor;
      // In a colour, a layer only moves between that colour's sounds.
      const pool = this.pools?.[layer] || Object.keys(SOUNDS[layer]).filter((name) => !SOUNDS[layer][name].sample);
      const others = pool.filter((name) => name !== this.layers[layer].sound);
      if (others.length) {
        out.recolor.sound = others[Math.floor(pick * others.length)];
        this.layers[layer].sound = out.recolor.sound;
        if (HOLD_IDS.includes(layer) && !out.events.some((e) => e.layer === layer)) this.hold(layer, this.lastHold[layer], t);
      }
    }
    for (const event of out.events) {
      if (event.layer === 'pad') this.changeChord(event.notes, t, event.step, out.harmony?.key || null, out.harmony ? chordName(out.harmony.chord) : '');
      else if (event.notes) this.hold(event.layer, event.notes, t, event.step);
      else if (event.layer === 'bells') this.playBell(event, t);
      else this.playSequenced(event.layer, event, t);
    }
    if (out.step % 16 === 0) {
      for (const id of HOLD_IDS) {
        if (!this.audible(id)) continue;
        const sound = this._sound(id, this.layers[id].sound);
        this.channels[id].holdFilter.frequency.setTargetAtTime(clamp(sound.cutoff * this.spiral(id, t).bright * this._drift(id, 'bright', 0.5), 200, 9000), t, 2.5);
      }
      // The echoes drift too, a bar at a time.
      for (const id of LAYER_IDS) {
        if (!this.layers[id].delay.mix) continue;
        const now = this._echoNow(id);
        const echo = this.channels[id].echo;
        echo.feedbackL.gain.setTargetAtTime(now.feedback, t, 1);
        echo.feedbackR.gain.setTargetAtTime(now.feedback, t, 1);
        echo.out.gain.setTargetAtTime(now.level, t, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- WAV

export function encodeWav(channels, sampleRate) {
  const frames = channels[0].length;
  const count = channels.length;
  const buffer = new ArrayBuffer(44 + frames * count * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * count * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * count * 2, true);
  let offset = 44;
  let seed = 22222;
  const dither = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const value = Math.max(-1, Math.min(1, channels[c][i] + (dither() - dither()) / 32768));
      view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

// Captured sound is kept as 16-bit samples: twenty minutes of stereo is about 230 MB.
export function encodeWavInt16(left, right, sampleRate) {
  const frames = left.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 4, true);
  const samples = new Int16Array(buffer, 44, frames * 2);
  for (let i = 0; i < frames; i++) { samples[2 * i] = left[i]; samples[2 * i + 1] = right[i]; }
  return new Uint8Array(buffer);
}

// Listens to the master output all the time and hands over quarter-second blocks.
const CAPTURE_SOURCE = `
class TangerineCapture extends AudioWorkletProcessor {
  constructor() { super(); this.size = 12000; this.reset(); }
  reset() { this.left = new Float32Array(this.size); this.right = new Float32Array(this.size); this.n = 0; this.t0 = null; }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const L = input[0], R = input[1] || input[0];
    if (this.t0 === null) this.t0 = currentTime;
    this.left.set(L, this.n); this.right.set(R, this.n); this.n += L.length;
    if (this.n + 128 > this.size) {
      const left = this.left.slice(0, this.n), right = this.right.slice(0, this.n);
      this.port.postMessage({ t0: this.t0, left, right }, [left.buffer, right.buffer]);
      this.reset();
    }
    return true;
  }
}
registerProcessor('tangerine-capture', TangerineCapture);
`;

export const KEEP_SECONDS = 20 * 60;
export const THREAD_TAIL = 9;

// Ten minutes of steps at a tempo: the window in which the key changes are counted.
const windowOf = (bpm) => Math.round(bpm * 4 * 10);

const toInt16 = (data) => {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    out[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return out;
};

// ---------------------------------------------------------------- the player

export class TangerineAudio {
  constructor({ seed = 1, engine = {}, layers = {}, global = {} } = {}) {
    this.seed = seed >>> 0;
    this.layers = Object.fromEntries(LAYER_IDS.map((id) => [id, { ...DEFAULT_LAYERS[id], ...(layers[id] || {}), delay: { ...DEFAULT_LAYERS[id].delay, ...(layers[id]?.delay || {}) } }]));
    this.global = { ...DEFAULT_GLOBAL, ...global };
    this.engineOptions = { ...engine, drift: this.global.drift, window: windowOf(this.global.bpm) };
    this.engine = new TangerineEngine({ seed: this.seed, ...this.engineOptions, active: this.active() });
    this.solo = null;
    this.base = 0;
    this.journal = new Journal();
    this.chunks = [];
    this.ctx = null;
    this.graph = null;
    this.playing = false;
    this.nextStepTime = 0;
    this.visual = [];
    this.listeners = new Set();
    this.recording = null;
    this.midiOut = null;
    this.midiOnly = false;
    this.thread = null;
    this.colour = { pools: null, space: null };
  }

  // A colour's limits on "Sounds change" ({ layer: [sounds] }) and its real space (AudioBuffer or null).
  setColour({ pools = null, space = null } = {}) {
    this.colour = { pools, space };
    if (this.graph) { this.graph.pools = pools; this.graph.setSpace(space); }
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  _emit(item) { for (const listener of this.listeners) listener(item); }

  async _ensure() {
    if (this.ctx) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Context({ latencyHint: 'playback', sampleRate: 48000 });
    this.graph = new Graph(this.ctx, { seed: this.seed, layers: this.layers, global: this.global });
    this.graph.solo = this.solo;
    this.graph.journal = this.journal;
    this.graph.midiOut = this.midiOut;
    this.graph.midiOnly = this.midiOnly;
    this.graph.pools = this.colour.pools;
    this.graph.setSpace(this.colour.space);
    this.graph.applyAll(true);
    try {
      const url = URL.createObjectURL(new Blob([CAPTURE_SOURCE], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(this.ctx, 'tangerine-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      const silent = this.ctx.createGain();
      silent.gain.value = 0;
      this.graph.out.connect(node);
      node.connect(silent);
      silent.connect(this.ctx.destination);
      node.port.onmessage = (e) => this._captured(e.data);
      this.captureReady = true;
    } catch { this.captureReady = false; }
    // A worker clock: timers in a worker are not slowed down when the tab is hidden.
    try {
      const worker = new Worker(URL.createObjectURL(new Blob(['let id=null;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}'], { type: 'application/javascript' })));
      worker.onmessage = () => this._tick();
      this.clock = { start: () => worker.postMessage(25), stop: () => worker.postMessage(0) };
    } catch {
      let id = null;
      this.clock = { start: () => { clearInterval(id); id = setInterval(() => this._tick(), 25); }, stop: () => clearInterval(id) };
    }
  }

  _captured({ t0, left, right }) {
    this.chunks.push({ t0, frames: left.length, left: toInt16(left), right: toInt16(right) });
    // Keep twenty minutes, and everything since a recording began.
    const rate = this.ctx.sampleRate;
    const limit = Math.min(this.ctx.currentTime - KEEP_SECONDS, this.recording ? this.recording.startTime : Infinity);
    while (this.chunks.length && this.chunks[0].t0 + this.chunks[0].frames / rate < limit) this.chunks.shift();
    if (this.chunks.length % 240 === 0) {
      const forget = Math.min(this.ctx.currentTime - KEEP_SECONDS - 60, this.recording ? this.recording.startTime - 60 : Infinity);
      if (forget > 0) this.journal.forgetBefore(this.journal.stepAt(forget));
    }
  }

  get absoluteStep() { return this.base + this.engine.stepIndex; }

  active() { return LAYER_IDS.filter((id) => this.layers[id].on); }

  async start() {
    await this._ensure();
    await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.graph.out.gain.cancelScheduledValues(now);
    this.graph.out.gain.setValueAtTime(0, now);
    this.graph.out.gain.linearRampToValueAtTime(this.global.volume, now + 0.4);
    this.nextStepTime = now + 0.1;
    if (!this.journal.tempos.length) this.journal.tempo(this.absoluteStep, this.global.bpm);
    // Coming back from a pause: the current chord comes back first, and what the drone and strings held.
    if (this.engine.harmony && !this.engine.ending?.done) {
      this.graph.changeChord(this.engine.harmony.voicing, this.nextStepTime, this.absoluteStep, this.engine.harmony.key, chordName(this.engine.harmony.chord));
      for (const id of HOLD_IDS) if (id !== 'pad') this.graph.hold(id, this.graph.lastHold[id], this.nextStepTime);
    }
    this.playing = true;
    this.clock.start();
    this._tick();
  }

  async pause() {
    if (!this.playing) return;
    this.playing = false;
    this.clock.stop();
    const now = this.ctx.currentTime;
    this.graph.out.gain.setTargetAtTime(0, now, 0.08);
    this.graph.releaseAll(now);
    setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 450);
  }

  _tick() {
    if (!this.playing) return;
    const horizon = this.ctx.currentTime + 0.2;
    if (this.nextStepTime < this.ctx.currentTime - 0.5) this.nextStepTime = this.ctx.currentTime + 0.05;
    while (this.nextStepTime < horizon && !this.engine.ending?.done) {
      const out = this.engine.step();
      out.local = out.step;
      out.step += this.base;
      for (const event of out.events) event.step += this.base;
      this.journal.step(out.step, this.nextStepTime);
      this.graph.dispatch(out, this.nextStepTime);
      if (out.harmony || out.mutation || out.renewed || out.recolor || out.rotate) this.visual.push({ t: this.nextStepTime, harmony: out.harmony, mutation: out.mutation, renewed: out.renewed, recolor: out.recolor, rotate: out.rotate, step: out.step });
      if (out.ended) {
        this.thread.endsAt = this.nextStepTime + THREAD_TAIL;
        this.visual.push({ t: this.nextStepTime, ending: true });
      }
      this.nextStepTime += this.graph.stepSeconds();
    }
    const now = this.ctx.currentTime;
    while (this.visual.length && this.visual[0].t <= now) this._emit(this.visual.shift());
    if (this.thread?.endsAt && now >= this.thread.endsAt) {
      this.thread.endsAt = null;
      this._emit({ ended: true, thread: { ...this.thread } });
    }
  }

  get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }
  get feed() { return this.graph ? this.graph.feed : []; }

  setLayer(id, patch) {
    const s = this.layers[id];
    Object.assign(s, patch, patch.delay ? { delay: { ...s.delay, ...patch.delay } } : {});
    for (const name of Object.keys(ENVELOPE_LIMITS)) s[name] = clamp(s[name], ...ENVELOPE_LIMITS[name]);
    if ('on' in patch) this.engine.configure({ active: this.active() });
    if (this.graph) {
      this.graph.applyLayer(id);
      if (HOLD_IDS.includes(id) && ('on' in patch || 'sound' in patch) && this.engine.harmony && this.playing && !this.engine.ending?.done) {
        this.graph.hold(id, this.graph.lastHold[id], this.ctx.currentTime + 0.05);
      }
    }
  }

  // Whole piece: the layers allowed to sound now (null: all). See Graph.setStage.
  setStage(ids, fade) {
    this.stage = ids;
    if (this.graph) this.graph.setStage(ids, this.ctx.currentTime + 0.02, fade);
  }

  // Listen to one layer alone (even one that is switched off), or null: the mix again.
  setSolo(id) {
    this.solo = id && this.layers[id] ? id : null;
    if (!this.graph) return;
    this.graph.solo = this.solo;
    this.graph.applyAll(false);
    if (this.playing && !this.engine.ending?.done) this.graph.refreshHolds();
  }

  setGlobal(patch) {
    const previousBpm = this.global.bpm;
    Object.assign(this.global, patch);
    if (this.graph) this.graph.applyGlobal();
    if (patch.drift !== undefined) { this.engineOptions.drift = patch.drift; this.engine.configure({ drift: patch.drift }); }
    if (patch.bpm) { this.engineOptions.window = windowOf(patch.bpm); this.engine.configure({ window: this.engineOptions.window }); }
    if (patch.bpm && patch.bpm !== previousBpm) {
      if (this.journal.tempos.length) this.journal.tempo(this.absoluteStep, patch.bpm);
      // A thread keeps its length in minutes: the remaining steps follow the new tempo.
      const ending = this.engine.ending;
      if (ending && !ending.done) {
        const left = (ending.endStep - this.engine.stepIndex) * 60 / previousBpm / 4;
        this.engine.setEnding(this.engine.stepIndex + left * patch.bpm * 4 / 60);
      }
    }
  }

  // Harmony and sequence settings: complexity, wander, pedal, evolution (0..1),
  // changes (key changes per ten minutes or per thread), renew (bars, 0: off),
  // key ({ tonic, mode }: the vine travels there), lengths ({ bass: 16, ... }), salt.
  setEngine(patch) {
    const options = this.engineOptions;
    const engine = this.engine;
    const shared = {};
    for (const name of ['complexity', 'wander', 'pedal', 'evolution', 'changes', 'renew', 'recolor', 'rotate']) if (patch[name] !== undefined) shared[name] = options[name] = patch[name];
    engine.configure(shared);
    if (patch.lengths) {
      options.lengths = { ...(options.lengths || {}), ...patch.lengths };
      for (const [id, length] of Object.entries(patch.lengths)) engine.setLength(id, length);
    }
    if (patch.salt !== undefined) { options.salt = patch.salt; engine.setSalt(patch.salt); }
    if (patch.key) {
      options.key = { ...patch.key };
      if (engine.harmony) engine.travelTo(patch.key);
      else engine.home = { ...patch.key };
    }
  }

  // A fresh engine (a new journey, or a thread from its beginning). Absolute steps
  // keep counting, from the next bar line, so that kept passages stay in order.
  _freshEngine() {
    this.base = Math.ceil(this.absoluteStep / 16) * 16 + 16;
    this.engine = new TangerineEngine({ seed: this.seed, ...this.engineOptions, active: this.active() });
  }

  setSeed(seed) {
    this.seed = seed >>> 0;
    this._freshEngine();
    if (this.thread) this.startThread(this.thread.minutes, false);
  }

  // Form: endless (null) or a thread of so many minutes, played from its beginning.
  startThread(minutes, restart = true) {
    if (!minutes) {
      this.thread = null;
      this.engine.setEnding(null);
      return;
    }
    if (restart) this._freshEngine();
    this.thread = { minutes, startStep: this.base, seed: this.seed, endsAt: null };
    this.engine.setEnding(minutes * 60 * this.global.bpm * 4 / 60);
  }

  get threadProgress() {
    const ending = this.engine.ending;
    if (!this.thread || !ending) return null;
    return { done: Math.min(this.engine.stepIndex, ending.endStep), total: ending.endStep, finished: ending.done };
  }

  setMidiOut(port, only = false) {
    this.midiOut = port;
    this.midiOnly = !!port && only;
    if (this.graph) {
      if (!port) for (const id of HOLD_IDS) this.graph._holdMidi(id, [], this.ctx.currentTime);
      this.graph.midiOut = port;
      this.graph.midiOnly = this.midiOnly;
      this.graph.applyAll(false);
      if (this.engine.harmony && this.playing && !this.engine.ending?.done) this.graph.refreshHolds();
    }
  }

  // ------------------------------------------------------------ keeping passages

  get earliestTime() {
    const audio = this.chunks.length ? this.chunks[0].t0 : Infinity;
    const notes = this.journal.stepTimes.length ? this.journal.timeOf(this.journal.firstStep) : Infinity;
    return this.captureReady ? Math.max(Number.isFinite(audio) ? audio : 0, Number.isFinite(notes) ? notes : 0) : notes;
  }

  get heardSeconds() { return this.ctx ? Math.max(0, this.ctx.currentTime - this.earliestTime) : 0; }

  // Keeps [from, to) in context time: sound (if captured), MIDI and ABC, lined up on a step.
  async _keep(from, to, { title = 'Tangerine', subtitle = '' } = {}) {
    if (!this.ctx) return null;
    const startStep = this.journal.stepAt(from);
    const endStep = this.journal.stepAt(to);
    if (endStep <= startStep) return null;
    const t0 = this.journal.timeOf(startStep);
    // Wait until the capture has caught up with the end.
    const rate = this.ctx.sampleRate;
    const caught = () => { const last = this.chunks[this.chunks.length - 1]; return !this.captureReady || !last || last.t0 + last.frames / rate >= to; };
    for (let i = 0; i < 40 && !caught(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    let wav = null;
    if (this.captureReady && this.chunks.length) {
      const frames = Math.max(0, Math.round((to - t0) * rate));
      const left = new Int16Array(frames);
      const right = new Int16Array(frames);
      for (const chunk of this.chunks) {
        const offset = Math.round((chunk.t0 - t0) * rate);
        if (offset + chunk.frames <= 0 || offset >= frames) continue;
        const a = Math.max(0, -offset);
        const b = Math.min(chunk.frames, frames - offset);
        left.set(chunk.left.subarray(a, b), offset + a);
        right.set(chunk.right.subarray(a, b), offset + a);
      }
      wav = encodeWavInt16(left, right, rate);
    }
    const slice = this.journal.slice(startStep, endStep);
    return { wav, midi: sliceToMidi(slice), abc: sliceToAbc(slice, { title, subtitle }), lead: sliceToLeadSheet(slice, { title, subtitle }), seconds: to - t0, startStep, endStep };
  }

  // The last so many seconds (or Infinity: everything still remembered).
  async keepLast(seconds, names) {
    if (!this.ctx) return null;
    const to = this.ctx.currentTime;
    const wanted = to - seconds;
    const from = Math.max(wanted, this.earliestTime);
    const kept = await this._keep(from, to, names);
    if (kept) kept.truncated = Number.isFinite(seconds) && wanted < this.earliestTime - 0.5;
    return kept;
  }

  startRecording() {
    if (!this.playing || this.recording) return false;
    this.recording = { startTime: this.nextStepTime, began: new Date() };
    return true;
  }

  get recordingSeconds() {
    return this.recording ? Math.max(0, this.ctx.currentTime - this.recording.startTime) : 0;
  }

  async stopRecording(names) {
    const recording = this.recording;
    if (!recording) return null;
    const kept = await this._keep(recording.startTime, this.ctx.currentTime, names);
    this.recording = null;
    return kept && { ...kept, began: recording.began };
  }
}

// ---------------------------------------------------------------- offline

// The longest thread rendered as sound: longer ones are too big to hold in memory.
export const MAX_RENDER_MINUTES = 20;

// The notes of a whole thread, without sound: MIDI and ABC of threads of any
// length, in a moment. Same seed and settings, same notes as the sound.
export function renderNotes({ seed = 1, engine = {}, layers = {}, global = {}, minutes = 10, names = {} } = {}) {
  const settings = { ...DEFAULT_GLOBAL, ...global };
  const on = Object.fromEntries(LAYER_IDS.map((id) => [id, { ...DEFAULT_LAYERS[id], ...(layers[id] || {}) }]));
  const player = new TangerineEngine({ seed, ...engine, active: LAYER_IDS.filter((id) => on[id].on), drift: settings.drift, window: windowOf(settings.bpm) });
  player.setEnding(minutes * 60 * settings.bpm * 4 / 60);
  const journal = new Journal();
  journal.tempo(0, settings.bpm);
  const stepSeconds = 60 / settings.bpm / 4;
  for (;;) {
    const out = player.step();
    journal.step(out.step, out.step * stepSeconds);
    if (out.rotate) { on[out.rotate.off].on = false; on[out.rotate.on].on = true; }
    for (const e of out.events) {
      const s = on[e.layer];
      if (e.layer === 'pad') journal.chord(e.notes, e.step, out.harmony?.key || null, out.harmony ? chordName(out.harmony.chord) : '', !!s.on);
      else if (e.notes) journal.hold(e.layer, s.on ? e.notes : [], e.step);
      else if (s.on) journal.note(e.layer, e.midi, e.velocity, e.step, e.layer === 'bells' ? 8 : s.gate * e.span);
    }
    if (out.ended) break;
  }
  const slice = journal.slice(0, player.stepIndex);
  return { midi: sliceToMidi(slice), abc: sliceToAbc(slice, names), lead: sliceToLeadSheet(slice, names), seconds: player.stepIndex * stepSeconds };
}

// Renders without playing it: same seed and settings, from the first step.
// minutes: a thread with its ending (seconds is then ignored); otherwise seconds.
export async function renderOffline({ seed = 1, engine = {}, layers = {}, global = {}, seconds = 60, minutes = null, sampleRate = 48000, onProgress, names = {}, colour = null } = {}) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const settings = { ...DEFAULT_GLOBAL, ...global };
  const length = minutes ? minutes * 60 + THREAD_TAIL : seconds + 3;
  const ctx = new OfflineContext({ numberOfChannels: 2, length: Math.ceil(length * sampleRate), sampleRate });
  const layerSettings = Object.fromEntries(LAYER_IDS.map((id) => [id, { ...DEFAULT_LAYERS[id], ...(layers[id] || {}), delay: { ...DEFAULT_LAYERS[id].delay, ...(layers[id]?.delay || {}) } }]));
  const graph = new Graph(ctx, { seed, layers: layerSettings, global: settings });
  if (colour) { graph.pools = colour.pools; graph.setSpace(colour.space); }
  const player = new TangerineEngine({ seed, ...engine, active: LAYER_IDS.filter((id) => layerSettings[id].on), drift: settings.drift, window: windowOf(settings.bpm) });
  if (minutes) player.setEnding(minutes * 60 * settings.bpm * 4 / 60);
  const journal = new Journal();
  journal.tempo(0, settings.bpm);
  graph.journal = journal;
  const log = [];
  let next = 0.05;
  const stopAt = minutes ? Infinity : seconds;
  let finished = false;
  const scheduleUntil = (horizon) => {
    while (!finished && next < Math.min(horizon, stopAt)) {
      const out = player.step();
      journal.step(out.step, next);
      graph.dispatch(out, next);
      if (out.harmony) log.push({ t: next, step: out.step, harmony: out.harmony });
      if (out.mutation) log.push({ t: next, step: out.step, mutation: out.mutation });
      if (out.ended) finished = true;
      next += graph.stepSeconds();
    }
    if (!minutes && next >= seconds && !finished) { finished = true; graph.releaseAll(next); }
  };
  const chunk = 1;
  scheduleUntil(chunk * 2);
  const plan = (t) => {
    ctx.suspend(t).then(() => {
      scheduleUntil(t + chunk * 2);
      if (onProgress) onProgress(t / length);
      if (t + chunk < length - 0.5) plan(t + chunk);
      ctx.resume();
    });
  };
  plan(chunk);
  const buffer = await ctx.startRendering();
  const slice = journal.slice(0, player.stepIndex);
  return { buffer, midi: sliceToMidi(slice), abc: sliceToAbc(slice, names), lead: sliceToLeadSheet(slice, names), log, engine: player };
}
