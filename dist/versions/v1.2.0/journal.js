// TANGERINE · the memory.
//
// Everything Tangerine plays is written down as it is scheduled: every note with
// its step, every chord with its key, every tempo, and the time of every step.
// A passage can then be kept after the fact ("the last two minutes", "since the
// start") as MIDI or ABC, and lined up exactly with the sound that was captured.
// Steps are absolute: they keep counting across new journeys and threads.

import { MidiTake } from './midi.js';

const MAX_NOTES = 250000;

export class Journal {
  constructor() {
    this.notes = [];
    this.chords = [];
    this.tempos = [];
    this.stepTimes = [];
    this.firstStep = 0;
  }

  step(step, t) {
    if (!this.stepTimes.length) this.firstStep = step;
    this.stepTimes[step - this.firstStep] = t;
  }

  note(layer, note, velocity, step, length) {
    const entry = { layer, note, velocity, step, length };
    this.notes.push(entry);
    if (this.notes.length > MAX_NOTES) this.notes.splice(0, this.notes.length - MAX_NOTES);
    return entry;
  }

  // A layer that holds notes (drone, high strings): a note shared by two changes
  // carries on; its length is known when it stops.
  hold(layer, notes, step, velocity = 0.6) {
    this.held ||= {};
    const held = (this.held[layer] ||= new Map());
    for (const [midi, entry] of held) {
      if (notes.includes(midi)) continue;
      entry.length = step - entry.step;
      held.delete(midi);
    }
    for (const midi of notes) if (!held.has(midi)) held.set(midi, this.note(layer, midi, velocity, step, Infinity));
  }

  // pad: false when the pad was off (the chord still names the harmony).
  chord(notes, step, key = null, name = '', pad = true) {
    this.chords.push({ notes: [...notes], step, key, name, pad });
  }

  tempo(step, bpm) {
    this.tempos.push({ step, bpm });
  }

  timeOf(step) { return this.stepTimes[step - this.firstStep]; }

  // The first step heard at or after time t (steps are in time order).
  stepAt(t) {
    const times = this.stepTimes;
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] === undefined || times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return this.firstStep + lo;
  }

  get lastStep() { return this.firstStep + this.stepTimes.length; }

  bpmAt(step) {
    let bpm = this.tempos.length ? this.tempos[0].bpm : 120;
    for (const t of this.tempos) if (t.step <= step) bpm = t.bpm;
    return bpm;
  }

  // Everything that starts in [start, end), with the chord already sounding at start.
  slice(start, end) {
    const sounding = [...this.chords].reverse().find((c) => c.step <= start);
    const chords = this.chords.filter((c) => c.step > start && c.step < end);
    if (sounding) chords.unshift({ ...sounding, step: start });
    return {
      start, end,
      bpm: this.bpmAt(start),
      notes: this.notes.filter((n) => n.step >= start && n.step < end),
      chords,
      tempos: this.tempos.filter((t) => t.step > start && t.step < end),
    };
  }

  // Forgets what is older than a step, so that hours of playing stay light.
  forgetBefore(step) {
    if (step <= this.firstStep) return;
    const keepChord = [...this.chords].reverse().find((c) => c.step <= step);
    this.notes = this.notes.filter((n) => n.step >= step);
    this.chords = this.chords.filter((c) => c.step >= step);
    if (keepChord && !this.chords.includes(keepChord)) this.chords.unshift(keepChord);
    const bpm = this.bpmAt(step);
    this.tempos = this.tempos.filter((t) => t.step > step);
    this.tempos.unshift({ step, bpm });
    this.stepTimes = this.stepTimes.slice(step - this.firstStep);
    this.firstStep = step;
  }
}

export function sliceToMidi(slice) {
  const take = new MidiTake(slice.start, slice.bpm);
  for (const t of slice.tempos) take.tempo(t.step, t.bpm);
  for (const c of slice.chords) take.chord(c.pad === false ? [] : c.notes, c.step);
  for (const n of slice.notes) take.note(n.layer, n.note, n.velocity, n.step, Math.min(n.length, slice.end - n.step));
  return take.finish(slice.end);
}
