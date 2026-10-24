// TANGERINE · notes out.
//
// A standard MIDI file writer (format 1, one track per layer) and a "take" that
// collects what the engine plays. The engine counts in sixteenth notes, so a take
// is perfectly on the grid: one step is PPQ / 4 ticks.

export const PPQ = 480;
export const TICKS_PER_STEP = PPQ / 4;

const ascii = (text) => [...text].map((c) => c.charCodeAt(0) & 0x7f);
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];

export function varLen(value) {
  let n = Math.max(0, Math.round(value)) >>> 0;
  const bytes = [n & 0x7f];
  while ((n >>>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

// Appends without spreading: a two-hour track has more bytes than a call can take as arguments.
const append = (out, data) => { for (let i = 0; i < data.length; i++) out.push(data[i]); return out; };
const chunk = (type, data) => append([...ascii(type), ...u32(data.length)], data);

// tracks: [{ name, channel (0-15), program?, events: [{ tick, type: 'on'|'off', note, velocity }] }]
// tempos: [{ tick, bpm }]
export function writeMidiFile({ tracks, tempos = [{ tick: 0, bpm: 120 }], title = 'Tangerine' }) {
  const conductor = [0, 0xff, 0x03, ...varLen(title.length), ...ascii(title)];
  conductor.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  let last = 0;
  for (const { tick, bpm } of [...tempos].sort((a, b) => a.tick - b.tick)) {
    const micro = Math.round(60000000 / bpm);
    conductor.push(...varLen(tick - last), 0xff, 0x51, 3, (micro >>> 16) & 255, (micro >>> 8) & 255, micro & 255);
    last = tick;
  }
  conductor.push(0, 0xff, 0x2f, 0);
  const out = append(chunk('MThd', [...u16(1), ...u16(tracks.length + 1), ...u16(PPQ)]), chunk('MTrk', conductor));
  for (const track of tracks) {
    const ch = track.channel & 15;
    const data = [0, 0xff, 0x03, ...varLen(track.name.length), ...ascii(track.name)];
    if (Number.isInteger(track.program)) data.push(0, 0xc0 | ch, track.program & 127);
    // Note-offs first at equal ticks, so a repeated note is never cut by its own end.
    const events = [...track.events].sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1) - (b.type === 'off' ? -1 : 1));
    let previous = 0;
    for (const event of events) {
      const status = (event.type === 'on' ? 0x90 : 0x80) | ch;
      const velocity = event.type === 'on' ? Math.max(1, Math.min(127, Math.round(event.velocity))) : 64;
      data.push(...varLen(event.tick - previous), status, event.note & 127, velocity);
      previous = event.tick;
    }
    data.push(0, 0xff, 0x2f, 0);
    append(out, chunk('MTrk', data));
  }
  return new Uint8Array(out);
}

// What one layer sends to MIDI: its channel (1-based in the interface, 0-based here)
// and a General MIDI program, so that a plain player gives a fair idea.
export const MIDI_LAYOUT = {
  bass: { channel: 0, program: 38, name: 'Bass sequence' },
  arp: { channel: 1, program: 81, name: 'Arpeggio' },
  motif: { channel: 2, program: 80, name: 'High motif' },
  pad: { channel: 3, program: 49, name: 'Pad' },
  bells: { channel: 4, program: 14, name: 'Bells' },
  cello: { channel: 5, program: 42, name: 'Low strings' },
  seq2: { channel: 6, program: 87, name: 'Counter sequence' },
  lead: { channel: 7, program: 29, name: 'Long lead' },
  drone: { channel: 8, program: 19, name: 'Drone' },
  // Channel 10 is for drums in General MIDI: the high strings take 11.
  air: { channel: 10, program: 48, name: 'High strings' },
  theme: { channel: 11, program: 73, name: 'Slow melody' },
  pulse: { channel: 12, program: 12, name: 'Echo pulse' },
};

export class MidiTake {
  constructor(startStep, bpm) {
    this.startStep = startStep;
    this.tempos = [{ tick: 0, bpm }];
    this.events = Object.fromEntries(Object.keys(MIDI_LAYOUT).map((id) => [id, []]));
    this.held = new Map();
    this.endStep = null;
  }

  tick(step) { return Math.max(0, Math.round((step - this.startStep) * TICKS_PER_STEP)); }

  tempo(step, bpm) {
    const tick = this.tick(step);
    this.tempos = this.tempos.filter((t) => t.tick !== tick);
    this.tempos.push({ tick, bpm });
  }

  note(layer, note, velocity, step, lengthSteps) {
    if (step < this.startStep || !this.events[layer]) return;
    const on = this.tick(step);
    const off = Math.max(on + 1, this.tick(step + lengthSteps));
    this.events[layer].push({ tick: on, type: 'on', note, velocity: Math.round(velocity * 127) });
    this.events[layer].push({ tick: off, type: 'off', note });
  }

  // The pad holds its notes across chords when they are common tones.
  chord(notes, step, velocity = 0.6) {
    if (step < this.startStep) return;
    for (const [note, start] of this.held) {
      if (!notes.includes(note)) {
        this.events.pad.push({ tick: this.tick(start.step), type: 'on', note, velocity: Math.round(start.velocity * 127) });
        this.events.pad.push({ tick: this.tick(step), type: 'off', note });
        this.held.delete(note);
      }
    }
    for (const note of notes) if (!this.held.has(note)) this.held.set(note, { step, velocity });
  }

  finish(endStep) {
    this.endStep = endStep;
    this.chord([], endStep);
    const end = this.tick(endStep);
    const tracks = Object.entries(MIDI_LAYOUT).map(([id, layout]) => ({
      name: layout.name, channel: layout.channel, program: layout.program,
      events: this.events[id].map((e) => (e.type === 'off' ? { ...e, tick: Math.min(e.tick, end) } : e)).filter((e) => e.tick <= end),
    }));
    return writeMidiFile({ tracks, tempos: this.tempos });
  }
}
