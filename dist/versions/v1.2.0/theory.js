// TANGERINE · the harmony.
//
// Keys, modes, the chord vocabulary and the rules that keep everything tonal.
// Pure functions only: no audio, no randomness. The conductor (engine.js)
// makes its choices from what these functions allow.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
export const MODE_NAMES = Object.keys(MODES);

// How often the conductor travels to each mode. Dorian is the most "Tangerine":
// dark but lit. Ionian is too plain to stay in, Phrygian too dark to stay long.
export const MODE_WEIGHT = { dorian: 1, aeolian: 0.8, lydian: 0.7, mixolydian: 0.7, ionian: 0.45, phrygian: 0.15 };

// The vocabulary. No chord here holds a tritone or a minor ninth above its root;
// its only semitone neighbours (a major seventh, a ninth over a minor third) are
// voiced a major seventh apart by the pad and left out of the moving layers. "level" is the Harmonic complexity at which it
// becomes available: 1 fifths and suspended chords, 2 triads,
// 3 sevenths and 6/9, 4 ninths and elevenths.
export const CHORD_TYPES = [
  { id: 'five', intervals: [0, 7], level: 1, symbol: '5' },
  { id: 'sus2', intervals: [0, 2, 7], level: 1, symbol: 'sus2' },
  { id: 'sus4', intervals: [0, 5, 7], level: 1, symbol: 'sus4' },
  { id: 'major', intervals: [0, 4, 7], level: 2, symbol: '' },
  { id: 'minor', intervals: [0, 3, 7], level: 2, symbol: 'm' },
  { id: 'add9', intervals: [0, 4, 7, 14], level: 2, symbol: 'add9' },
  { id: 'madd9', intervals: [0, 3, 7, 14], level: 2, symbol: 'm(add9)' },
  { id: 'maj7', intervals: [0, 4, 7, 11], level: 3, symbol: 'maj7' },
  { id: 'm7', intervals: [0, 3, 7, 10], level: 3, symbol: 'm7' },
  { id: 'six9', intervals: [0, 4, 7, 9, 14], level: 3, symbol: '6/9' },
  { id: 'sus7', intervals: [0, 5, 7, 10], level: 3, symbol: '7sus4' },
  { id: 'maj9', intervals: [0, 4, 7, 11, 14], level: 4, symbol: 'maj9' },
  { id: 'm9', intervals: [0, 3, 7, 10, 14], level: 4, symbol: 'm9' },
  { id: 'm11', intervals: [0, 3, 7, 10, 14, 17], level: 4, symbol: 'm11' },
];
export const CHORD_TYPE = Object.fromEntries(CHORD_TYPES.map((type) => [type.id, type]));

export const mod12 = (value) => ((value % 12) + 12) % 12;
// Harmonic complexity 0..1 to vocabulary level 1..4.
export const levelFor = (complexity) => Math.min(4, 1 + Math.floor(Math.max(0, Math.min(1, Number(complexity) || 0)) * 4));

export function scalePcs(key) {
  return MODES[key.mode].map((step) => mod12(key.tonic + step));
}

export const sameKey = (a, b) => a.tonic === b.tonic && a.mode === b.mode;

// Number of scale notes that change between two keys: 0 (relative) to 7.
export function keyDistance(a, b) {
  const pcs = new Set(scalePcs(a));
  return 7 - scalePcs(b).filter((pc) => pcs.has(pc)).length;
}

export function makeChord(root, typeId, bass = root) {
  const type = CHORD_TYPE[typeId];
  const pcs = [...new Set(type.intervals.map((step) => mod12(root + step)))];
  return { root: mod12(root), type: typeId, pcs, bass: mod12(bass) };
}

export const sameChord = (a, b) => !!a && !!b && a.root === b.root && a.type === b.type;
export const commonTones = (a, b) => a.pcs.filter((pc) => b.pcs.includes(pc)).length;
export const fitsKey = (chord, key) => {
  const pcs = new Set(scalePcs(key));
  return chord.pcs.every((pc) => pcs.has(pc));
};

// Every chord of the vocabulary, up to a level, that lives entirely in a key.
export function chordsInKey(key, maxLevel) {
  const scale = scalePcs(key);
  const out = [];
  scale.forEach((root, degree) => {
    for (const type of CHORD_TYPES) {
      if (type.level > maxLevel) continue;
      const chord = makeChord(root, type.id);
      if (fitsKey(chord, key)) out.push({ ...chord, degree });
    }
  });
  return out;
}

// A held bass note under a chord is allowed unless it makes a minor ninth or a
// tritone with one of the chord's notes.
export function pedalFits(pedal, chord) {
  return chord.pcs.every((pc) => {
    const interval = mod12(pc - pedal);
    return interval !== 1 && interval !== 6;
  });
}

// Any two notes rub when they are a semitone (or a minor ninth) apart, or a tritone.
export function rubs(a, b) {
  const distance = Math.abs(a - b);
  return distance === 1 || distance === 13 || distance === 25 || mod12(distance) === 6;
}

export function chordName(chord) {
  const base = `${NOTE_NAMES[chord.root]}${CHORD_TYPE[chord.type].symbol}`;
  return chord.bass !== chord.root ? `${base}/${NOTE_NAMES[chord.bass]}` : base;
}

export const modeLabel = (mode) => (mode === 'aeolian' ? 'minor' : mode === 'ionian' ? 'major' : mode);
export const keyName = (key) => `${NOTE_NAMES[key.tonic]} ${modeLabel(key.mode)}`;

// What kind of journey a key change is (see the grammar: "Les types de modulations").
export function modulationKind(from, to) {
  const shift = mod12(to.tonic - from.tonic);
  if (shift === 0) return 'modal';
  if (keyDistance(from, to) === 0) return 'relative';
  if (from.mode === to.mode && shift === 7) return 'fifth';
  if (from.mode === to.mode && shift === 5) return 'fourth';
  if ([3, 4, 8, 9].includes(shift)) return keyDistance(from, to) >= 2 ? 'mediant' : 'near';
  if (shift === 2 || shift === 10) return 'step';
  return 'far';
}

export const MODULATION_LABEL = {
  modal: 'Modal shift',
  relative: 'Relative key',
  fifth: 'Up a fifth',
  fourth: 'Up a fourth',
  mediant: 'Chromatic mediant',
  near: 'Neighbour key',
  step: 'A step away',
  far: 'Far key',
};

export const METHOD_LABEL = {
  pivot: 'through a shared chord',
  common: 'on a held common tone',
  direct: 'directly',
};

// The pad: chooses where each note of the chord sits so that every voice moves
// as little as possible from the previous chord, nothing rubs, and the low end
// stays clear. Returns MIDI note numbers, low to high.
export function voiceChord(chord, previous = [], { low = 50, high = 77, maxVoices = 5 } = {}) {
  let pcs = [...chord.pcs];
  if (pcs.length > maxVoices) {
    const fifth = mod12(chord.root + 7);
    pcs = pcs.filter((pc) => pc !== fifth);
  }
  pcs = pcs.slice(0, maxVoices);
  const options = pcs.map((pc) => {
    const list = [];
    for (let midi = low; midi <= high; midi++) if (mod12(midi) === pc) list.push(midi);
    return list;
  });
  const centre = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : (low + high) / 2 - 1;
  let best = null;
  let bestCost = Infinity;
  const pick = [];
  const visit = (index) => {
    if (index === options.length) {
      const notes = [...pick].sort((a, b) => a - b);
      for (let i = 0; i < notes.length; i++) {
        for (let j = i + 1; j < notes.length; j++) {
          if (rubs(notes[i], notes[j]) || notes[i] === notes[j]) return;
        }
      }
      let cost = 0;
      // Movement: every new note from its nearest previous note.
      if (previous.length) {
        for (const note of notes) cost += Math.min(...previous.map((old) => Math.abs(old - note)));
      } else {
        cost += Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - centre) * 0.8;
      }
      // Low clutter: close intervals under F3 sound muddy.
      for (let i = 0; i + 1 < notes.length; i++) {
        if (notes[i] < 57 && notes[i + 1] - notes[i] < 5) cost += 6;
      }
      // A gentle pull back to the middle, so the pad does not creep up or down over hours.
      cost += Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - (low + high) / 2) * 0.35;
      const span = notes[notes.length - 1] - notes[0];
      if (span > 26) cost += (span - 26) * 1.5;
      if (span < 9 && notes.length > 2) cost += (9 - span);
      // The root in the lowest voice gives weight; keep it likely.
      if (mod12(notes[0]) !== chord.root) cost += 1.5;
      if (cost < bestCost) { bestCost = cost; best = notes; }
      return;
    }
    for (const midi of options[index]) {
      pick.push(midi);
      visit(index + 1);
      pick.pop();
    }
  };
  visit(0);
  return best || options.map((list) => list[Math.floor(list.length / 2)]).sort((a, b) => a - b);
}

// The notes of a chord laid out upward from a starting note, for arpeggios and motifs.
export function chordLadder(chord, from, span = 24) {
  const out = [];
  for (let midi = from; midi < from + span; midi++) if (chord.pcs.includes(mod12(midi))) out.push(midi);
  return out;
}
