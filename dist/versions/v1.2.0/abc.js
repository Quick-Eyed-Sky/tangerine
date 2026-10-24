// TANGERINE · notes as text.
//
// Writes a kept passage as ABC notation (abcnotation.com, standard 2.1): one voice
// per layer that played, sixteenth notes as the unit, the key signature of each key the vine
// travels through, and every note spelled in that key.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const MODE_ABC = { ionian: 'maj', aeolian: 'min', dorian: 'dor', lydian: 'lyd', mixolydian: 'mix', phrygian: 'phr' };
const MODE_STEPS = {
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], ionian: [0, 2, 4, 5, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const mod12 = (v) => ((v % 12) + 12) % 12;
const offset = (pc, letterPc) => mod12(pc - letterPc + 6) - 6;
const VOICES = [
  { layer: 'bass', name: 'Bass sequence', clef: 'bass' },
  { layer: 'arp', name: 'Arpeggio', clef: 'treble' },
  { layer: 'motif', name: 'High motif', clef: 'treble' },
  { layer: 'pad', name: 'Pad', clef: 'treble' },
  { layer: 'bells', name: 'Bells', clef: 'treble' },
  { layer: 'cello', name: 'Low strings', clef: 'bass' },
  { layer: 'seq2', name: 'Counter sequence', clef: 'treble' },
  { layer: 'lead', name: 'Long lead', clef: 'treble' },
  { layer: 'drone', name: 'Drone', clef: 'bass' },
  { layer: 'air', name: 'High strings', clef: 'treble' },
  { layer: 'theme', name: 'Slow melody', clef: 'treble' },
  { layer: 'pulse', name: 'Echo pulse', clef: 'treble' },
];

// How a key is spelled: its tonic name, its signature, and a letter for every note.
export function spellKey(key) {
  const steps = MODE_STEPS[key.mode] || MODE_STEPS.dorian;
  let best = null;
  for (let l = 0; l < 7; l++) {
    const tonicAcc = offset(key.tonic, LETTER_PC[l]);
    if (Math.abs(tonicAcc) > 1) continue;
    const spelling = {};
    const signature = {};
    let count = 0;
    let ok = true;
    let sign = 0;
    steps.forEach((step, i) => {
      const letter = (l + i) % 7;
      const pc = mod12(key.tonic + step);
      const acc = offset(pc, LETTER_PC[letter]);
      if (Math.abs(acc) > 1 || (sign && acc && Math.sign(acc) !== sign)) ok = false;
      if (acc) sign = Math.sign(acc);
      spelling[pc] = { letter, acc };
      signature[letter] = acc;
      if (acc) count++;
    });
    if (ok && (!best || count < best.count)) best = { count, spelling, signature, sign, tonic: LETTERS[l] + (tonicAcc > 0 ? '#' : tonicAcc < 0 ? 'b' : '') };
  }
  return best;
}

export const abcKey = (key) => `${spellKey(key).tonic} ${MODE_ABC[key.mode] || 'dor'}`;

function pitch(midi, spelled, barState) {
  const pc = mod12(midi);
  let { letter, acc } = spelled.spelling[pc] || (() => {
    // A note outside the key: a sharp in sharp keys, a flat otherwise.
    const sharp = spelled.sign >= 0;
    for (let l = 0; l < 7; l++) if (LETTER_PC[l] === mod12(pc + (sharp ? -1 : 1))) return { letter: l, acc: sharp ? 1 : -1 };
    return { letter: 0, acc: 0 };
  })();
  const octave = Math.floor((midi - acc) / 12) - 1;
  const id = `${letter}:${octave}`;
  const current = barState.has(id) ? barState.get(id) : (spelled.signature[letter] || 0);
  let mark = '';
  if (acc !== current) {
    mark = acc === 1 ? '^' : acc === -1 ? '_' : '=';
    barState.set(id, acc);
  }
  const name = LETTERS[letter];
  let text = octave >= 5 ? name.toLowerCase() : name;
  if (octave > 5) text += "'".repeat(octave - 5);
  if (octave < 4) text += ','.repeat(4 - octave);
  return mark + text;
}

const len = (n) => (n === 1 ? '' : String(n));

// events: [{ start, length, notes: [midi] }] in steps, not overlapping, sorted.
function writeVoice(events, { from, to, keys, tempos, symbols = null }) {
  const bars = [];
  let bar = '';
  let barState = new Map();
  let cursor = from;
  let keyIndex = 0;
  let spelled = spellKey(keys[0].key);
  const barStart = (s) => s % 16 === 0;
  const startBar = (s) => {
    while (keyIndex + 1 < keys.length && keys[keyIndex + 1].step <= s) {
      keyIndex++;
      spelled = spellKey(keys[keyIndex].key);
      bar += `[K:${abcKey(keys[keyIndex].key)}]`;
    }
    if (tempos) for (const t of tempos) if (t.step >= s && t.step < s + 16) bar += `[Q:1/4=${Math.round(t.bpm)}]`;
  };
  // Chord symbols ("Dm7") go just before the note or rest where the chord begins.
  let symbolIndex = 0;
  const symbolAt = (s) => {
    if (!symbols) return '';
    let text = '';
    while (symbolIndex < symbols.length && symbols[symbolIndex].step <= s) text = `"${symbols[symbolIndex++].name}"`;
    return text;
  };
  startBar(cursor);
  const emit = (notes, length, tied) => {
    // Splits at bar lines; a held note is tied into the next bar.
    let left = length;
    while (left > 0) {
      const room = 16 - (cursor % 16);
      let n = Math.min(left, room);
      // With chord symbols, a note or rest is cut where the next chord begins.
      if (symbols && symbolIndex < symbols.length && symbols[symbolIndex].step > cursor) n = Math.min(n, symbols[symbolIndex].step - cursor);
      bar += symbolAt(cursor);
      if (!notes.length) bar += `z${len(n)}`;
      else if (notes.length === 1) bar += `${pitch(notes[0], spelled, barState)}${len(n)}${left > n || tied ? '-' : ''}`;
      else bar += `[${notes.map((m) => pitch(m, spelled, barState) + (left > n || tied ? '-' : '')).join('')}]${len(n)}`;
      bar += ' ';
      cursor += n;
      left -= n;
      if (barStart(cursor)) {
        bars.push(bar.trim());
        bar = '';
        barState = new Map();
        if (cursor < to) startBar(cursor);
      }
    }
  };
  for (const event of events) {
    if (event.start >= to) break;
    if (event.start > cursor) emit([], event.start - cursor, false);
    const length = Math.max(1, Math.min(event.length, to - cursor));
    emit(event.notes, length, false);
  }
  if (cursor < to) emit([], to - cursor, false);
  if (bar.trim()) bars.push(bar.trim());
  const lines = [];
  for (let i = 0; i < bars.length; i += 4) lines.push(`${bars.slice(i, i + 4).join(' | ')} |`);
  return lines.join('\n');
}

function monophonic(notes, maxLength = Infinity) {
  const sorted = [...notes].sort((a, b) => a.step - b.step);
  const out = [];
  sorted.forEach((n, i) => {
    if (out.length && out[out.length - 1].start === n.step) return;
    const next = sorted.slice(i + 1).find((m) => m.step > n.step);
    const gap = next ? next.step - n.step : Infinity;
    out.push({ start: n.step, length: Math.max(1, Math.min(Math.round(n.length), gap, maxLength)), notes: [n.note] });
  });
  return out;
}

// Held notes (drone, high strings) as chords: a new chord wherever a note starts or stops.
function heldEvents(notes, to) {
  const cuts = new Set();
  for (const n of notes) { cuts.add(n.step); cuts.add(Math.min(to, n.step + n.length)); }
  const points = [...cuts].filter((c) => c < to).sort((a, b) => a - b);
  const out = [];
  points.forEach((start, i) => {
    const end = points[i + 1] ?? to;
    const sounding = notes.filter((n) => n.step <= start && n.step + n.length > start).map((n) => n.note).sort((a, b) => a - b);
    if (sounding.length && end > start) out.push({ start, length: end - start, notes: sounding });
  });
  return out;
}

export function sliceToAbc(slice, { title = 'Tangerine', subtitle = '' } = {}) {
  const from = Math.floor(slice.start / 16) * 16;
  const to = Math.max(from + 16, Math.ceil(slice.end / 16) * 16);
  const keyChords = slice.chords.filter((c) => c.key);
  const keys = [];
  for (const c of keyChords) {
    const last = keys[keys.length - 1];
    if (!last || last.key.tonic !== c.key.tonic || last.key.mode !== c.key.mode) keys.push({ step: last ? c.step : from, key: c.key });
  }
  if (!keys.length) keys.push({ step: from, key: { tonic: 2, mode: 'dorian' } });
  const pad = slice.chords.map((c, i) => ({ start: c.step, length: (slice.chords[i + 1]?.step ?? slice.end) - c.step, notes: c.pad === false ? [] : c.notes }))
    .filter((c) => c.notes.length && c.length > 0);
  const byLayer = (layer) => slice.notes.filter((n) => n.layer === layer);
  const events = {
    bass: monophonic(byLayer('bass')),
    arp: monophonic(byLayer('arp')),
    motif: monophonic(byLayer('motif')),
    pad,
    bells: monophonic(byLayer('bells'), 8),
    cello: monophonic(byLayer('cello')),
    seq2: monophonic(byLayer('seq2')),
    lead: monophonic(byLayer('lead')),
    drone: heldEvents(byLayer('drone'), slice.end),
    air: heldEvents(byLayer('air'), slice.end),
    theme: monophonic(byLayer('theme')),
    pulse: monophonic(byLayer('pulse')),
  };
  // Only the layers that played; the bass always, so that the tempo marks have a home.
  const voices = VOICES.filter((v) => v.layer === 'bass' || events[v.layer].length);
  const head = [
    'X:1',
    `T:${title}`,
    ...(subtitle ? [`T:${subtitle}`] : []),
    'C:Tangerine',
    'M:4/4',
    'L:1/16',
    `Q:1/4=${Math.round(slice.bpm)}`,
    `%%score (${voices.map((v, i) => i + 1).join(' ')})`,
    ...voices.map((v, i) => `V:${i + 1} name="${v.name}" clef=${v.clef}`),
    `K:${abcKey(keys[0].key)}`,
  ];
  const body = voices.map((v, i) => `[V:${i + 1}]\n${writeVoice(events[v.layer], { from, to, keys, tempos: i === 0 ? slice.tempos : null })}`);
  return `${head.join('\n')}\n${body.join('\n')}\n`;
}

const asciiChord = (name) => name.replace(/♯/g, '#').replace(/♭/g, 'b');

// A lead sheet: one melody (the high motif, or the arpeggio when the motif is off)
// with chord symbols, in the compact shape that YuE2 reads as a plan (--abc-file,
// with --cot full). Its score must stay under about 4,000 tokens: a few minutes.
export function sliceToLeadSheet(slice, { title = 'Tangerine', subtitle = '', chordName = (c) => c.name } = {}) {
  const from = Math.floor(slice.start / 16) * 16;
  const to = Math.max(from + 16, Math.ceil(slice.end / 16) * 16);
  const keys = [];
  for (const c of slice.chords.filter((c) => c.key)) {
    const last = keys[keys.length - 1];
    if (!last || last.key.tonic !== c.key.tonic || last.key.mode !== c.key.mode) keys.push({ step: last ? c.step : from, key: c.key });
  }
  if (!keys.length) keys.push({ step: from, key: { tonic: 2, mode: 'dorian' } });
  const motif = slice.notes.filter((n) => n.layer === 'motif');
  const melody = monophonic(motif.length ? motif : slice.notes.filter((n) => n.layer === 'arp'));
  const symbols = [];
  for (const c of slice.chords) {
    if (!c.notes.length || !c.name) continue;
    const name = asciiChord(chordName(c));
    if (symbols.length && symbols[symbols.length - 1].name === name) continue;
    symbols.push({ step: Math.max(from, c.step), name });
  }
  const head = ['X:1', `T:${title}`, ...(subtitle ? [`T:${subtitle}`] : []), 'M:4/4', 'L:1/16', `Q:1/4=${Math.round(slice.bpm)}`, `K:${abcKey(keys[0].key)}`];
  return `${head.join('\n')}\n${writeVoice(melody, { from, to, keys, tempos: slice.tempos, symbols })}\n`;
}
