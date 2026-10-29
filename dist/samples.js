// TANGERINE II · sampled sounds and colours.
//
// The local launcher lists the sample folder next to it (`samples/`, or
// `../SAMPLES`): instruments named in `instruments.json` (a folder of notes,
// a list of files, or an SFZ file), plus any other folder of samples, one
// instrument per folder. `_spaces/` holds real reverberations. A note name
// in a file name (C3, F#2, Db4) gives its pitch; otherwise the pitch is measured.
//
// Only the index is read at the start: an instrument is decoded when a colour
// or a layer asks for it, so two gigabytes of samples cost nothing until used.
//
// A colour chooses, for each layer, the first sound it can find in a list:
// a sampled instrument (by name) or one of the synthesized sounds. With
// no samples at all, every colour still plays, in synthesis.

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const AUDIO_FILE = /\.(wav|aiff?|flac|ogg|mp3|m4a)$/i;

// "Choir C3.wav", "ViolHi2C5.wav" → MIDI, C3 as middle C (60), as in Logic and
// Ableton. Libraries differ by an octave on this; the measured pitch settles it.
export function noteFromName(name) {
  const stem = name.replace(AUDIO_FILE, '');
  const match = stem.match(/([A-G])(#|b|♯|♭)?(-1|[0-8])$/) || stem.match(/(?:^|[^a-z])([a-g])(#|s|b|♯|♭)?(-1|[0-8])(?![0-9])/i);
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
function level(buffer, target, loop = null) {
  const data = buffer.getChannelData(0);
  // A held sound is heard mostly through its loop: that is what is levelled.
  if (loop) {
    const from = Math.floor(loop[0] * buffer.sampleRate);
    const to = Math.min(data.length, Math.floor(loop[1] * buffer.sampleRate));
    let sum = 0;
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / Math.max(1, to - from));
    if (rms > 1e-5) return target / rms;
  }
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

// One channel is kept: the layers are panned and spread by the mix itself, and it halves the memory.
function mono(ctx, buffer) {
  if (buffer.numberOfChannels === 1) return buffer;
  const out = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const to = out.getChannelData(0);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < to.length; i++) to[i] = 0.5 * (left[i] + right[i]);
  return out;
}

export class SampleBank {
  constructor() {
    this.index = { instruments: {}, spaces: {} };
    this.instruments = {};
    this.pending = {};
    this.spaces = {};
    this.status = 'none';
    this.message = '';
    this.listeners = new Set();
  }

  // Decoded and ready to play.
  has(name) { return !!this.instruments[name]; }
  // Listed in the sample folder (maybe not decoded yet).
  known(name) { return !!this.index.instruments[name]; }
  on(listener) { this.listeners.add(listener); }

  // The zone for a note (its key range, else the nearest root), and how far to transpose it.
  zone(name, midi) {
    const inst = this.instruments[name];
    if (!inst) return null;
    let best = inst.zones.find((z) => z.lo !== undefined && midi >= z.lo && midi <= z.hi);
    if (!best) {
      best = inst.zones[0];
      for (const zone of inst.zones) if (Math.abs(zone.root - midi) < Math.abs(best.root - midi)) best = zone;
    }
    return { ...best, rate: 2 ** ((midi - best.root) / 12), gain: inst.gain };
  }

  // The index only: which instruments and spaces exist.
  async load(indexUrl = '/__tangerine__/samples') {
    this.status = 'loading';
    try {
      const response = await fetch(indexUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('no index');
      this.index = await response.json();
      this.index.instruments ||= {};
      this.index.spaces ||= {};
    } catch {
      this.status = 'none';
      this.message = 'No sample folder: the local launcher looks for samples/ next to Tangerine, or SAMPLES next to its folder.';
      return this;
    }
    const count = Object.keys(this.index.instruments).length;
    const spaces = Object.keys(this.index.spaces).length;
    this.status = count || spaces ? 'ready' : 'empty';
    this.message = `${count} sampled instrument${count === 1 ? '' : 's'} and ${spaces} real space${spaces === 1 ? '' : 's'} found.`;
    return this;
  }

  // Decodes one instrument (once), then tells the listeners.
  require(name) {
    if (this.instruments[name]) return Promise.resolve(this.instruments[name]);
    if (!this.pending[name]) this.pending[name] = this._decode(name).then((inst) => { for (const listener of this.listeners) listener(name, inst); return inst; });
    return this.pending[name];
  }

  async requireSpace(name) {
    if (this.spaces[name] || !this.index.spaces[name]) return this.spaces[name] || null;
    try {
      const ctx = decoder();
      this.spaces[name] = await ctx.decodeAudioData(await (await fetch(this.index.spaces[name])).arrayBuffer());
    } catch { this.spaces[name] = null; }
    return this.spaces[name];
  }

  async _decode(name) {
    const entry = this.index.instruments[name];
    if (!entry) return null;
    const ctx = decoder();
    let files = entry.zones;
    // Mapped zones (an SFZ) are kept whole; a folder of single notes keeps about one every three semitones.
    if (!files.some((f) => f.lo !== undefined) && files.length > 16) {
      const step = Math.max(1, Math.round(files.length / 16));
      files = files.filter((_, i) => i % step === 0);
    }
    const zones = [];
    for (const file of files) {
      try {
        const buffer = mono(ctx, await ctx.decodeAudioData(await (await fetch(file.url)).arrayBuffer()));
        const data = buffer.getChannelData(0);
        const zone = { buffer, lo: file.lo, hi: file.hi, name: file.name };
        if (file.key !== undefined) zone.root = file.key - (file.tune || 0) / 100;
        else {
          zone.named = file.note ?? noteFromName(file.name);
          zone.heard = measurePitch(data, buffer.sampleRate);
        }
        zone.mapped = !!(file.loop && file.rate);
        zone.loop = zone.mapped ? [file.loop[0] / file.rate, file.loop[1] / file.rate] : loopPoints(data, buffer.sampleRate);
        zones.push(zone);
      } catch { /* An unreadable file is left out. */ }
    }
    if (!zones.length) return null;
    // Named notes keep their names; the measurement only says which octave convention the
    // library uses, decided once for the whole instrument (a choir's pitch is easily misheard).
    const shifts = zones.filter((z) => z.named != null && z.heard != null).map((z) => Math.round((z.heard - z.named) / 12)).sort((a, b) => a - b);
    const octave = shifts.length ? shifts[Math.floor(shifts.length / 2)] : 0;
    for (const z of zones) if (z.root === undefined) z.root = z.named != null ? z.named + 12 * octave : z.heard ?? 60;
    zones.sort((a, b) => a.root - b.root);
    const middle = zones[Math.floor(zones.length / 2)];
    const gain = (entry.gain ?? 1) * level(middle.buffer, 0.4, middle.mapped ? middle.loop : null);
    this.instruments[name] = { name, label: entry.label || name, zones, gain };
    return this.instruments[name];
  }
}

export const BANK = new SampleBank();

// Sampled sounds as the audio module sees them: SOUNDS[layer]['s:<folder>'].
export const sampledKey = (name) => `s:${name}`;
export function sampledSound(name, entry) {
  return { label: `${entry.label || name} (sample)`, sample: name, cutoff: 12000, env: 0.15, q: 0.7, track: 0, gain: 1 };
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
    label: 'Phaedra 1974 · Mellotron, Moog',
    note: 'Slow, vintage, grainy: Mellotron choir and orchestra over a Minimoog. Wet and far.',
    layers: {
      pad: ['s:mellotron-choir', 'choir'],
      air: ['s:mellotron-orchestra', 'strings'],
      drone: ['s:mellotron-organ', 'organ'],
      cello: ['s:moog-bowed', 'cello'],
      bass: ['s:minimoog-bass', 'moog'],
      arp: ['s:moog-plucky', 'pluck'],
      seq2: ['s:moog-tri', 'pluck'],
      motif: ['s:minimoog-flute', 'flute'],
      lead: ['s:minimoog-lead', 'tape'],
      theme: ['s:moog-piccolo', 'flute'],
      bells: ['s:minimoog-churchbell', 'bell'],
      pulse: ['s:moog-glassping', 'marimba'],
    },
    space: ['church', 'cathedral', 'hall'],
    global: { wet: 0.68, space: 0.8, bpm: 54 },
  },
  stratosfear: {
    label: 'Stratosfear / Exit · Prophet, Jupiter, OB',
    note: 'Polysynths 1976–1983: lush strings, bright sequences, brassy leads, glassy bells.',
    layers: {
      pad: ['s:ob-lushstrings', 's:prophet-strings', 'strings'],
      air: ['s:jupiter-highstrings', 'glass'],
      drone: ['s:ob-lowpad', 'saw'],
      cello: ['s:moog-bowed', 'synth'],
      bass: ['s:prophet-bass', 'pulse'],
      arp: ['s:jupiter-pulse', 'glass'],
      seq2: ['s:prophet-bleep', 'pulse'],
      motif: ['s:jupiter-mellow', 'lead'],
      lead: ['s:prophet-brass', 'tape'],
      theme: ['s:jupiter-sine', 'voice'],
      bells: ['s:jupiter-bell', 'glass'],
      pulse: ['s:jupiter-microdot', 'glass'],
    },
    space: ['hall', 'plate'],
    global: { wet: 0.55, space: 0.6, bpm: 96 },
  },
  safari: {
    label: 'Moon Safari · string machine, Moog, keys',
    note: 'Warm and close: Juno string machine, Minimoog, a Moog electric piano. Less reverb.',
    layers: {
      pad: ['s:juno-stringmachine', 'warm'],
      air: ['s:juno-elkastrings', 'glass'],
      drone: ['s:juno-drone', 'organ'],
      cello: ['s:moog-bowed', 'dark'],
      bass: ['s:minimoog-softbass', 'round'],
      arp: ['s:moog-roady', 'soft'],
      seq2: ['s:moog-pianish', 'mallet'],
      motif: ['s:minimoog-beautytone', 'flute'],
      lead: ['s:minimoog-simplewave', 'sine'],
      theme: ['s:minimoog-flute', 'ocarina'],
      bells: ['s:moog-longtine', 'bell'],
      pulse: ['s:moog-roady', 'marimba'],
    },
    space: ['room', 'studio'],
    global: { wet: 0.35, space: 0.35, bpm: 84 },
  },
  fairlight: {
    label: 'Fairlight / Zoolook · CMI Series III',
    note: 'Digital 1982–1986: sampled string sections, choir, horns, vibes and kalimba, a little grainy.',
    layers: {
      pad: ['s:fairlight-strings', 'strings'],
      air: ['s:fairlight-violins', 'strings'],
      drone: ['s:fairlight-choir', 'choir'],
      cello: ['s:fairlight-cellos', 'cello'],
      bass: ['s:fairlight-basses', 'deep'],
      arp: ['s:fairlight-kalimba', 'glass'],
      seq2: ['s:fairlight-pizzicato', 'mallet'],
      motif: ['s:fairlight-voice', 'soft'],
      lead: ['s:fairlight-horn', 'reed'],
      theme: ['s:fairlight-recorder', 'flute'],
      bells: ['s:fairlight-vibes', 'glass'],
      pulse: ['s:fairlight-musicbox', 'marimba'],
    },
    space: ['hall', 'church'],
    global: { wet: 0.58, space: 0.65, bpm: 72 },
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

// The colour's real space, decoded (or null: the synthesized one).
export async function colourSpace(colour) {
  const name = (COLOURS[colour]?.space || []).find((n) => BANK.index.spaces[n]);
  return name ? BANK.requireSpace(name) : null;
}

// The sampled instruments a colour plays, as names.
export function colourSamples(colour) {
  return [...new Set(Object.values(COLOURS[colour]?.layers || {}).flat().filter((n) => n.startsWith('s:')).map((n) => n.slice(2)))];
}
