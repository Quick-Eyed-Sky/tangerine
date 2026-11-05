// A vertical film of a track: the note roll climbing a 9:16 frame, the chord and key, the tempo,
// and the journey cards. Recorded live from the canvas and the same audio as the WAV, then sent
// to the track's folder in small pieces. Each film takes one palette, different from the last.

export const FILM_W = 1080;
export const FILM_H = 1920;
const CHUNK = 1_500_000; // The server takes at most 2 MB per request.
const FPS = 30;

export const PALETTES = [
  { id: 'blue', bg0: '#0b2a3a', bg1: '#06141d', ink: '#e9f6f4', accent: '#4fbf9f' },
  { id: 'ember', bg0: '#3a1410', bg1: '#140605', ink: '#f6e3cf', accent: '#e0743c' },
  { id: 'sand', bg0: '#efe0c2', bg1: '#d9c39a', ink: '#2a2118', accent: '#b5573a' },
  { id: 'rose', bg0: '#3b1a33', bg1: '#150812', ink: '#f6dfee', accent: '#e58ac2' },
  { id: 'violet', bg0: '#241c44', bg1: '#0b0a1a', ink: '#e7e1ff', accent: '#9b8cff' },
  { id: 'green', bg0: '#0f3326', bg1: '#06150f', ink: '#e4f7ee', accent: '#6fe0a8' },
  { id: 'ice', bg0: '#dfeef2', bg1: '#b7d4dc', ink: '#12262c', accent: '#2f7f8e' },
  { id: 'crimson', bg0: '#4a0f15', bg1: '#16050a', ink: '#fbe7e0', accent: '#ff6b5a' },
];

let lastPalette = null;
export function pickPalette() {
  const choices = PALETTES.filter((p) => p !== lastPalette);
  lastPalette = choices[Math.floor(Math.random() * choices.length)];
  return lastPalette;
}

// The pitch window follows the notes: three octaves, centred on what has just been played.
let centre = null;
export function resetFilm() { centre = null; }

// Draws one frame, laid out like the interface: time runs left to right, toward the now line,
// and the pitch is spread over three octaves. The chords are listed in a row at the bottom.
// The held layers (pad, drone, air) log a list of pitches at each change: each pitch becomes a
// note that lasts until the next change of its layer.
function expandFeed(feed, now) {
  const notes = [];
  feed.forEach((entry, i) => {
    if (!Array.isArray(entry.midi)) { notes.push(entry); return; }
    const next = feed.find((other, j) => j > i && other.layer === entry.layer);
    const length = (next ? next.t : now) - entry.t;
    for (const midi of entry.midi) notes.push({ layer: entry.layer, midi, t: entry.t, length });
  });
  return notes;
}

export function drawVerticalFrame(g, source) {
  const { palette: p } = source;
  const s = { ...source, feed: expandFeed(source.feed, source.now) };
  const W = FILM_W, H = FILM_H;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, p.bg0);
  grad.addColorStop(1, p.bg1);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const margin = 80;
  const sans = '-apple-system, Helvetica, Arial, sans-serif';

  // Header: the chord, the key and the tempo, then the journey card.
  g.fillStyle = p.ink;
  g.globalAlpha = 0.6;
  g.font = `600 34px ${sans}`;
  g.fillText('TANGERINE II', margin, 110);
  g.globalAlpha = 1;
  let chordSize = 170;
  const chord = s.chord || '—';
  g.font = `600 ${chordSize}px Georgia, "Times New Roman", serif`;
  while (chordSize > 70 && g.measureText(chord).width > W - 2 * margin) {
    chordSize -= 8;
    g.font = `600 ${chordSize}px Georgia, "Times New Roman", serif`;
  }
  g.fillText(chord, margin, 320);
  g.fillStyle = p.accent;
  g.font = `600 46px ${sans}`;
  g.fillText(`${s.key || ''}   ♩ ${s.tempo} bpm`, margin, 396);
  if (s.title) {
    g.font = `600 30px ${sans}`;
    g.fillText(s.title, margin, 470);
    g.fillStyle = p.ink;
    g.font = `400 36px ${sans}`;
    wrap(g, s.body || '', margin, 524, W - 2 * margin, 46, 2);
  }

  // The roll: the same window as the interface, nine seconds, the now line at 90 per cent.
  const top = 660, bottom = 1520, nowX = W * 0.9, px = nowX / 9;
  const xOf = (t) => nowX - (s.now - t) * px;
  const recent = s.feed.filter((n) => n.t <= s.now && n.t > s.now - 9 && !(n.layer === 'bells'));
  if (recent.length) {
    const mean = recent.reduce((sum, n) => sum + n.midi, 0) / recent.length;
    centre = centre === null ? mean : centre + (mean - centre) * 0.04;
  } else if (centre === null) {
    centre = 60;
  }
  const low = centre - 18, span = 36;
  const yOf = (midi) => bottom - (Math.min(low + span, Math.max(low, midi)) - low) / span * (bottom - top);

  g.strokeStyle = p.ink;
  g.lineWidth = 1;
  for (let midi = Math.ceil(low / 12) * 12; midi <= low + span; midi += 12) {
    g.globalAlpha = 0.12;
    g.beginPath(); g.moveTo(margin, yOf(midi) + 0.5); g.lineTo(nowX, yOf(midi) + 0.5); g.stroke();
  }
  g.globalAlpha = 1;

  for (const mark of s.marks) {
    const x = xOf(mark.t);
    if (x < margin || x > nowX) continue;
    g.strokeStyle = mark.modulation ? p.accent : p.ink;
    g.globalAlpha = mark.modulation ? 0.9 : 0.3;
    g.beginPath(); g.moveTo(x + 0.5, top); g.lineTo(x + 0.5, bottom); g.stroke();
    g.globalAlpha = 0.75;
    g.fillStyle = mark.modulation ? p.accent : p.ink;
    g.font = `500 28px ${sans}`;
    g.fillText(mark.name, x + 8, top + 34);
    g.globalAlpha = 1;
  }

  for (const note of s.feed) {
    if (note.t > s.now) continue;
    const x = xOf(note.t);
    if (x < margin - 20 || x > nowX) continue;
    const y = yOf(note.midi);
    g.fillStyle = s.colourOf(note.layer);
    g.globalAlpha = 0.85;
    if (note.layer === 'bells') {
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    } else {
      const length = Math.max(0.06, Math.min(note.length || 0.2, s.now - note.t));
      g.fillRect(x, y - 6, Math.max(8, length * px), 12);
    }
    g.globalAlpha = 1;
  }

  g.fillStyle = p.accent;
  g.fillRect(nowX - 2, top, 4, bottom - top);

  // The chords, as in the interface: the latest one filled, the others outlined.
  const names = s.marks.slice(-8);
  g.font = `500 34px ${sans}`;
  const pills = [];
  let width = 0;
  for (let i = names.length - 1; i >= 0; i--) {
    const w = g.measureText(names[i].name).width + 56;
    if (width + w > W - 2 * margin) break;
    width += w + 16;
    pills.unshift({ ...names[i], w });
  }
  let x = margin;
  const y = 1640, h = 80;
  pills.forEach((pill, i) => {
    const current = i === pills.length - 1;
    pillPath(g, x, y, pill.w, h);
    if (current) {
      g.fillStyle = p.accent;
      g.fill();
      g.fillStyle = p.bg1;
    } else {
      g.strokeStyle = p.ink;
      g.globalAlpha = 0.35;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = p.ink;
    }
    g.textBaseline = 'middle';
    g.fillText(pill.name, x + 28, y + h / 2 + 2);
    g.textBaseline = 'alphabetic';
    x += pill.w + 16;
  });
}

function pillPath(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  g.closePath();
}

function wrap(g, text, x, y, width, lineHeight, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > width && line) {
      g.fillText(line, x, y + row * lineHeight);
      row++;
      if (row >= maxLines) return;
      line = word;
    } else {
      line = test;
    }
  }
  if (line && row < maxLines) g.fillText(line, x, y + row * lineHeight);
}

// Records the canvas and the output of the audio graph. Pieces go to the server as they come.
export class VerticalFilm {
  constructor({ audio, sid, palette, base, colourOf, frame }) {
    this.audio = audio;
    this.sid = sid;
    this.palette = palette;
    this.base = base;
    this.colourOf = colourOf;
    this.frame = frame; // Returns the state to draw for the current moment.
    this.pending = [];
    this.sequence = 0;
    this.uploads = Promise.resolve();
    this.name = null;
  }

  static mimeType() {
    const choices = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    return choices.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
  }

  async start() {
    resetFilm();
    const mime = VerticalFilm.mimeType();
    if (!mime) throw new Error('This browser cannot record video.');
    this.name = `${this.base}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
    this.canvas = document.createElement('canvas');
    this.canvas.width = FILM_W;
    this.canvas.height = FILM_H;
    this.g = this.canvas.getContext('2d');
    this.tap = this.audio.ctx.createMediaStreamDestination();
    this.audio.graph.out.connect(this.tap);
    const stream = this.canvas.captureStream(FPS);
    for (const track of this.tap.stream.getAudioTracks()) stream.addTrack(track);
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
    this.recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      this.pending.push(event.data);
      this.uploads = this.uploads.then(() => this.flush(false)).catch((error) => { this.error = error; });
    };
    const stopped = new Promise((resolve) => { this.recorder.onstop = resolve; });
    this.stopped = stopped;
    this.timer = setInterval(() => this.paint(), 1000 / FPS);
    this.paint();
    this.recorder.start(1000);
  }

  paint() {
    const state = this.frame();
    drawVerticalFrame(this.g, { ...state, palette: this.palette, colourOf: this.colourOf });
  }

  // Sends whatever is waiting, in pieces of at most CHUNK bytes. Not final: keeps the last piece.
  async flush(final) {
    let size = this.pending.reduce((sum, blob) => sum + blob.size, 0);
    while (size >= CHUNK || (final && size > 0)) {
      const all = new Blob(this.pending);
      const head = all.slice(0, Math.min(CHUNK, all.size));
      const rest = all.slice(head.size);
      this.pending = rest.size ? [rest] : [];
      size = rest.size;
      await this.upload(head);
    }
  }

  async upload(blob) {
    const url = `/__tangerine__/recordings/${encodeURIComponent(this.sid)}/video?sequence=${this.sequence}&name=${encodeURIComponent(this.name)}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await blob.arrayBuffer() });
    if (!response.ok) throw new Error('The film could not be saved beside the recording.');
    this.sequence++;
  }

  async stop() {
    clearInterval(this.timer);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    await this.stopped;
    this.audio.graph.out.disconnect(this.tap);
    await this.uploads;
    this.uploads = this.uploads.then(() => this.flush(true));
    await this.uploads;
    if (this.error) throw this.error;
    return this.name;
  }
}
