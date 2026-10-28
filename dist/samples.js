// TANGERINE II · sampled sounds and colours.
//
// The local launcher lists the folder `samples/` next to it: one folder per
// instrument (any WAV, AIFF, FLAC, OGG or MP3 inside), and `samples/_spaces/`
// for real reverberations (impulse responses). A note name in a file name
// (C3, F#2, Db4) gives its pitch; otherwise the pitch is measured.
//
// A colour chooses, for each layer, the first sound it can find in a list:
// a sampled instrument (by folder name) or one of the synthesized sounds. With
// no samples at all, every colour still plays, in synthesis.

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const AUDIO_FILE = /\.(wav|aiff?|flac|ogg|mp3|m4a)$/i;

// "Choir C3.wav" → 60 (C3 as middle C, as in Logic and Ableton). Libraries differ
// by an octave on this; the measured pitch settles which octave is meant.
export function noteFromName(name) {
  const stem = name.replace(AUDIO_FILE, '');
  const match = stem.match(/(?:^|[^a-z])([a-g])(#|s|b|♯|♭)?(-1|[0-8])(?![0-9])/i);
  if (!match) return null;
  const sign = match[2] ? (/[#s♯]/i.test(match[2]) ? 1 : -1) : 0;
  return 12 * (Number(match[3]) + 2) + NOTE[match[1].toLowerCase()] + sign;
}

// The pitch of a buffer, by autocorrelation over a steady stretch (MIDI, fractional).
export function measurePitch(data, sampleRate) {
  const start = Math.min(data.length - 1, Math.floor(sampleRate * 0.25));
  const size = Math.min(8192, data.length - start);
  if (size < 2048) return null;
  const frame = data.subarray(start, start + size);
  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.min(size >> 1, Math.floor(sampleRate / 30));
  let energy = 0;
  for (let i = 0; i < size; i++) energy += frame[i] * frame[i];
  if (energy < 1e-6) return null;
  const score = (lag) => {
    let sum = 0;
    for (let i = 0; i + lag < size; i++) sum += frame[i] * frame[i + lag];
    return sum / (size - lag);
  };
  const scores = new Float32Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) { scores[lag] = score(lag); best = Math.max(best, scores[lag]); }
  // The first peak close to the best one: avoids answering an octave too low.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (scores[lag] >= 0.9 * best && scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1]) {
      const a = scores[lag - 1]; const b = scores[lag]; const c = scores[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      const hz = sampleRate / (lag + shift);
      return 69 + 12 * Math.log2(hz / 440);
    }
  }
  return null;
}

// Where a held note loops: the steady middle of the sample, on rising zero crossings.
export function loopPoints(data, sampleRate) {
  const seconds = data.length / sampleRate;
  if (seconds < 0.6) return null;
  const rising = (from) => {
    for (let i = Math.max(1, from); i < data.length; i++) if (data[i - 1] <= 0 && data[i] > 0) return i;
    return from;
  };
  const start = rising(Math.floor(data.length * 0.35));
  const end = rising(Math.floor(data.length * 0.85));
  return end - start > sampleRate * 0.2 ? [start / sampleRate, end / sampleRate] : null;
}

// The gain that brings a buffer's loudest 300 ms to a common loudness (RMS), so that
// a long held note and a short decaying one sit like the synths.
function level(buffer, target) {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(buffer.sampleRate * 0.3));
  let loudest = 0;
  for (let start = 0; start < data.length; start += size >> 1) {
    let sum = 0;
    const end = Math.min(data.length, start + size);
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    loudest = Math.max(loudest, sum / Math.max(1, end - start));
  }
  const rms = Math.sqrt(loudest);
  return rms > 1e-5 ? target / rms : 1;
}

const decoder = () => {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return new Offline(1, 1, 48000);
};

export class SampleBank {
  constructor() {
    this.instruments = {};
    this.spaces = {};
    this.status = 'none';
    this.message = '';
  }

  has(name) { return !!this.instruments[name]; }

  // The zone nearest to a note, and how far to transpose it.
  zone(name, midi) {
    const inst = this.instruments[name];
    if (!inst) return null;
    let best = inst.zones[0];
    for (const zone of inst.zones) if (Math.abs(zone.root - midi) < Math.abs(best.root - midi)) best = zone;
    return { ...best, rate: 2 ** ((midi - best.root) / 12), gain: inst.gain };
  }

  async load(indexUrl = '/__tangerine__/samples') {
    this.status = 'loading';
    let index;
    try {
      const response = await fetch(indexUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('no index');
      index = await response.json();
    } catch {
      this.status = 'none';
      this.message = 'No sample folder: the local launcher lists samples/ next to Tangerine.';
      return this;
    }
    const ctx = decoder();
    const decode = async (path) => {
      const data = await (await fetch(path)).arrayBuffer();
      return ctx.decodeAudioData(data);
    };
    const failed = [];
    for (const [name, inst] of Object.entries(index.instruments || {})) {
      const zones = [];
      for (const file of inst.files) {
        try {
          const buffer = await decode(file.url);
          const data = buffer.getChannelData(0);
          const named = file.note ?? noteFromName(file.name);
          const heard = measurePitch(data, buffer.sampleRate);
          const root = named === null ? heard ?? 60 : heard === null ? named : named + 12 * Math.round((heard - named) / 12);
          zones.push({ buffer, root, loop: loopPoints(data, buffer.sampleRate), name: file.name });
        } catch { failed.push(`${name}/${file.name}`); }
      }
      if (!zones.length) continue;
      zones.sort((a, b) => a.root - b.root);
      const gain = (inst.gain ?? 1) * level(zones[Math.floor(zones.length / 2)].buffer, 0.4);
      this.instruments[name] = { name, label: inst.label || name, zones, gain };
    }
    for (const [name, url] of Object.entries(index.spaces || {})) {
      try { this.spaces[name] = await decode(url); } catch { failed.push(`_spaces/${name}`); }
    }
    const count = Object.keys(this.instruments).length;
    this.status = count || Object.keys(this.spaces).length ? 'ready' : 'empty';
    this.message = `${count} sampled instrument${count === 1 ? '' : 's'}, ${Object.keys(this.spaces).length} real space${Object.keys(this.spaces).length === 1 ? '' : 's'}.${failed.length ? ` Could not read: ${failed.slice(0, 4).join(', ')}${failed.length > 4 ? '…' : ''}` : ''}`;
    return this;
  }
}

export const BANK = new SampleBank();

// Sampled sounds as the audio module sees them: SOUNDS[layer]['s:<folder>'].
export const sampledKey = (name) => `s:${name}`;
export function sampledSound(inst) {
  return { label: `${inst.label} (sample)`, sample: inst.name, cutoff: 12000, env: 0.15, q: 0.7, track: 0, gain: 1 };
}

// ---------------------------------------------------------------- colours
//
// Each layer: a list of choices, the first one available wins. 's:name' is a
// sample folder; any other name is a synthesized sound of that layer.
// space: an impulse in samples/_spaces/ (file name without extension) for the vast room.
// global: settings the colour suggests (reverb, tempo); the rest stays yours.

export const COLOURS = {
  synth: {
    label: 'Synthesis (Tangerine 1.3)',
    note: 'Every sound synthesized, as in version 1.3.',
    layers: {},
  },
  phaedra: {
    label: 'Phaedra 1974 · Mellotron, Moog, e-piano',
    note: 'Slow, vintage, grainy: Mellotron choir and strings over a Moog bass. Wet and far.',
    layers: {
      pad: ['s:mellotron-choir', 's:mellotron-strings', 'choir'],
      air: ['s:mellotron-violins', 's:mellotron-strings', 'strings'],
      cello: ['s:mellotron-cello', 'cello'],
      theme: ['s:mellotron-flute', 'flute'],
      lead: ['s:mellotron-flute', 'tape'],
      bass: ['s:moog-bass', 'moog'],
      arp: ['s:moog-sequence', 'pluck'],
      seq2: ['s:moog-sequence', 'pluck'],
      motif: ['s:e-piano', 'soft'],
      bells: ['s:e-piano', 'bell'],
      drone: ['s:mellotron-choir', 'organ'],
      pulse: ['s:e-piano', 'marimba'],
    },
    space: ['church', 'cathedral', 'hall'],
    global: { wet: 0.68, space: 0.8, bpm: 54 },
  },
  stratosfear: {
    label: 'Stratosfear / Exit · Prophet, Jupiter, OB',
    note: 'Polysynth 1976–1983: brassy pads, bright sequences, glassy bells.',
    layers: {
      pad: ['s:prophet-pad', 's:ob-pad', 's:jupiter-pad', 'strings'],
      air: ['s:jupiter-strings', 's:ob-pad', 'glass'],
      cello: ['s:prophet-bass', 'synth'],
      bass: ['s:prophet-bass', 's:jupiter-bass', 'pulse'],
      arp: ['s:jupiter-sequence', 's:prophet-sequence', 'glass'],
      seq2: ['s:prophet-sequence', 's:jupiter-sequence', 'pulse'],
      motif: ['s:prophet-lead', 'lead'],
      lead: ['s:jupiter-lead', 's:prophet-lead', 'tape'],
      theme: ['s:prophet-lead', 'voice'],
      bells: ['s:jupiter-bells', 'glass'],
      drone: ['s:ob-pad', 'saw'],
      pulse: ['s:jupiter-sequence', 'glass'],
    },
    space: ['hall', 'plate'],
    global: { wet: 0.55, space: 0.6, bpm: 96 },
  },
  safari: {
    label: 'Moon Safari · Rhodes, Moog, Solina',
    note: 'Warm and close: e-piano, string machine, round Moog bass. Less reverb.',
    layers: {
      pad: ['s:solina', 's:string-machine', 'warm'],
      air: ['s:solina', 's:string-machine', 'glass'],
      cello: ['s:moog-bass', 'dark'],
      bass: ['s:moog-bass', 'round'],
      arp: ['s:e-piano', 'soft'],
      seq2: ['s:e-piano', 'mallet'],
      motif: ['s:moog-lead', 'flute'],
      lead: ['s:moog-lead', 'sine'],
      theme: ['s:moog-lead', 'ocarina'],
      bells: ['s:e-piano', 'bell'],
      drone: ['s:solina', 'organ'],
      pulse: ['s:e-piano', 'marimba'],
    },
    space: ['room', 'studio'],
    global: { wet: 0.35, space: 0.35, bpm: 84 },
  },
};

// The sound a colour gives one layer, given what is installed (or null: leave it).
export function colourSound(colour, layer, sounds) {
  const choices = COLOURS[colour]?.layers[layer];
  if (!choices) return null;
  return choices.find((name) => sounds[layer][name]) || null;
}

// The sounds "Sounds change" may move between in this colour: its installed samples,
// or its synths when none is installed (a single one: the layer keeps it).
export function colourPool(colour, layer, sounds) {
  const choices = COLOURS[colour]?.layers[layer];
  if (!choices) return null;
  const pool = choices.filter((name) => sounds[layer][name]);
  const sampled = pool.filter((name) => name.startsWith('s:'));
  return sampled.length ? sampled : pool;
}

export function colourSpace(colour) {
  const names = COLOURS[colour]?.space || [];
  return names.map((name) => BANK.spaces[name]).find(Boolean) || null;
}
