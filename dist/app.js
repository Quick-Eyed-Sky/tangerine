import { initStudio } from './studio.js';
import { TangerineAudio, renderOffline, renderNotes, MAX_RENDER_MINUTES, encodeWav, LAYER_IDS, SOUNDS, DIVISIONS, DIVISION_LABEL, DEFAULT_LAYERS, DEFAULT_GLOBAL, ENVELOPE_LIMITS, KEEP_SECONDS, ECHO_MAX } from './audio.js?v=12';
import { LAYERS, SEQ_IDS, HOLD_IDS } from './engine.js';
import { BANK, COLOURS, sampledKey, sampledSound, colourSound, colourPool, colourSpace } from './samples.js';
import { chordName, keyName, MODULATION_LABEL, METHOD_LABEL, KEY_NAMES, MODES, MODE_WEIGHT } from './theory.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'tangerine.setup.v1.3';
const VERSION = '1.3.0';
const COLORS = {
  bass: '#f28a2e', arp: '#ffc77d', motif: '#ff6a4d', pad: '#c9581c', bells: '#f7ead2',
  cello: '#d0703a', seq2: '#ffa24a', lead: '#ff8a70', drone: '#b0683e', air: '#ffdcae',
  theme: '#ffb894', pulse: '#e89a52',
};
const RENEW = [0, 32, 64, 128];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const RECOLOR = [0, 64, 32];
const ROTATE = [0, 32, 16];
const DEFAULT_ENGINE = { key: { tonic: 6, mode: 'lydian' }, complexity: 0.58, wander: 0.35, changes: 6, pedal: 0.56, evolution: 1, renew: 32, recolor: 32, rotate: 32, lengths: { bass: 16, arp: 12, motif: 7, seq2: 10, pulse: 5 } };
const freshSettings = () => ({
  seed: (Math.random() * 4294967296) >>> 0,
  salt: 0,
  engine: JSON.parse(JSON.stringify(DEFAULT_ENGINE)),
  global: { ...DEFAULT_GLOBAL, bpm: 60, drift: 1 },
  layers: JSON.parse(JSON.stringify(DEFAULT_LAYERS)),
  form: { thread: false, minutes: 10 },
  colour: 'synth',
});

const THREAD_MINUTES = [3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120];
const validForm = (form) => ({ thread: form?.thread === true, minutes: THREAD_MINUTES.includes(form?.minutes) ? form.minutes : 10 });

// A saved setup, from this version or an earlier one, as settings (or null).
// Version 1 had five layers, one "Journeys" for how often and how far, and echo
// repeats as heard; Evolution and Motion went only to what is now 70.
// Version 2 had ten layers, and new sequences came only with the button.
function readSetup(value) {
  const unitOk = (x) => Number.isFinite(x) && x >= 0 && x <= 1;
  if (!value || value.format !== 'tangerine-setup' || ![1, 2, 3].includes(value.version)) return null;
  const v = JSON.parse(JSON.stringify(value));
  const first = v.version === 1;
  const e = v.engine;
  const g = v.global;
  if (!e || !g || !v.layers) return null;
  if (first) {
    if (unitOk(e.wander)) e.changes = Math.round(2 + 6 * e.wander);
    if (unitOk(e.evolution)) e.evolution *= 0.7;
    if (unitOk(g.motion)) g.motion *= 0.7;
    for (const l of Object.values(v.layers)) if (l?.delay && Number.isFinite(l.delay.feedback)) l.delay.feedback = Math.min(1, l.delay.feedback / ECHO_MAX);
  }
  if (v.version < 3) e.renew ||= DEFAULT_ENGINE.renew;
  e.renew ??= DEFAULT_ENGINE.renew;
  e.recolor ??= DEFAULT_ENGINE.recolor;
  e.rotate ??= DEFAULT_ENGINE.rotate;
  e.lengths = { ...DEFAULT_ENGINE.lengths, ...(e.lengths || {}) };
  v.global = { ...DEFAULT_GLOBAL, ...g };
  v.layers = Object.fromEntries(LAYER_IDS.map((id) => [id, v.layers[id] ? { ...v.layers[id] } : JSON.parse(JSON.stringify(DEFAULT_LAYERS[id]))]));
  if (!e.key || !Number.isInteger(e.key.tonic) || e.key.tonic < 0 || e.key.tonic > 11 || !MODES[e.key.mode]) return null;
  if (!['complexity', 'wander', 'pedal', 'evolution'].every((n) => unitOk(e[n]))) return null;
  if (!Number.isInteger(e.changes) || e.changes < 0 || e.changes > 12 || !RENEW.includes(e.renew) || !RECOLOR.includes(e.recolor) || !ROTATE.includes(e.rotate)) return null;
  if (!LAYERS.filter((l) => l.kind === 'seq').every((l) => l.lengths.includes(e.lengths[l.id]))) return null;
  if (!(v.global.bpm >= 6 && v.global.bpm <= 140) || !['volume', 'wet', 'space', 'motion', 'drift'].every((n) => unitOk(v.global[n]))) return null;
  if (!Number.isInteger(v.seed) || v.seed < 0 || v.seed > 4294967295) return null;
  for (const id of LAYER_IDS) {
    const l = v.layers[id];
    if (typeof l.on !== 'boolean' || !unitOk(l.level) || !(SOUNDS[id][l.sound] || /^s:[\w.-]+$/.test(l.sound))) return null;
    for (const [name, [lo, hi]] of Object.entries(ENVELOPE_LIMITS)) if (!(l[name] >= lo && l[name] <= hi)) return null;
    if (!l.delay || !DIVISIONS[l.delay.div] || !unitOk(l.delay.mix) || !unitOk(l.delay.feedback)) return null;
  }
  return { seed: v.seed, salt: v.salt || 0, engine: e, global: v.global, layers: v.layers, form: validForm(v.form), colour: COLOURS[v.colour] ? v.colour : 'synth' };
}

let settings = freshSettings();
try {
  settings = readSetup(JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem('tangerine.sol.setup.v1'))) || settings;
} catch { /* A new journey is drawn. */ }

const snapshot = () => ({ format: 'tangerine-setup', version: 3, app: VERSION, ...JSON.parse(JSON.stringify(settings)) });
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); } catch { /* Listening works without storage. */ }
  }, 200);
}

let audio = new TangerineAudio({ seed: settings.seed, engine: { ...settings.engine, key: { ...settings.engine.key }, salt: settings.salt }, layers: settings.layers, global: settings.global });
let elapsed = 0;
let startedAt = null;
let toastTimer;
let trail = [];
let marks = [];
let travelling = null;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}
const time = (seconds) => { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const paintRange = (input) => input.style.setProperty('--range', `${100 * (input.value - input.min) / (input.max - input.min)}%`);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => a * b / gcd(a, b);

// ---------------------------------------------------------------- global controls

const sliders = [
  { id: 'bpm', get: () => settings.global.bpm, set: (v) => { settings.global.bpm = v; audio.setGlobal({ bpm: v }); }, show: (v) => `${v} <small>BPM</small>` },
  { id: 'complexity', get: () => Math.round(settings.engine.complexity * 100), set: (v) => { settings.engine.complexity = v / 100; audio.setEngine({ complexity: v / 100 }); } },
  { id: 'wander', get: () => Math.round(settings.engine.wander * 100), set: (v) => { settings.engine.wander = v / 100; audio.setEngine({ wander: v / 100 }); } },
  { id: 'changes', get: () => settings.engine.changes, set: (v) => { settings.engine.changes = v; audio.setEngine({ changes: v }); }, show: (v) => `${v} <small>${settings.form.thread ? 'IN THE THREAD' : 'PER 10 MIN'}</small>` },
  { id: 'drift', get: () => Math.round(settings.global.drift * 100), set: (v) => { settings.global.drift = v / 100; audio.setGlobal({ drift: v / 100 }); } },
  { id: 'pedal', get: () => Math.round(settings.engine.pedal * 100), set: (v) => { settings.engine.pedal = v / 100; audio.setEngine({ pedal: v / 100 }); } },
  { id: 'evolution', get: () => Math.round(settings.engine.evolution * 100), set: (v) => { settings.engine.evolution = v / 100; audio.setEngine({ evolution: v / 100 }); } },
  { id: 'wet', get: () => Math.round(settings.global.wet * 100), set: (v) => { settings.global.wet = v / 100; audio.setGlobal({ wet: v / 100 }); } },
  { id: 'space', get: () => Math.round(settings.global.space * 100), set: (v) => { settings.global.space = v / 100; audio.setGlobal({ space: v / 100 }); } },
  { id: 'motion', get: () => Math.round(settings.global.motion * 100), set: (v) => { settings.global.motion = v / 100; audio.setGlobal({ motion: v / 100 }); } },
  { id: 'volume', get: () => Math.round(settings.global.volume * 100), set: (v) => { settings.global.volume = v / 100; audio.setGlobal({ volume: v / 100 }); } },
];
for (const slider of sliders) {
  $(slider.id).addEventListener('input', (event) => {
    slider.set(Number(event.target.value));
    renderControls();
    persist();
  });
}

function syncThreadLength() {
  const minimum = 48 / settings.global.bpm;
  const allowed = THREAD_MINUTES.filter((n) => n >= minimum);
  if (!allowed.includes(settings.form.minutes)) settings.form.minutes = allowed[0];
  for (const option of $('threadMinutes').options) option.disabled = Number(option.value) < minimum;
  $('threadMinutes').value = String(settings.form.minutes);
  $('formReadout').textContent = settings.form.thread ? `${settings.form.minutes} MIN THREAD` : 'ENDLESS';
  $('slowTempoHint').hidden = settings.global.bpm >= 16;
  $('slowTempoHint').textContent = `Very slow tempo: a timed thread needs at least twelve bars (${Math.ceil(minimum * 10) / 10} minutes at this tempo). Shorter lengths are unavailable. Echo delay keeps its existing 3.9-second maximum.`;
}
function renderControls() {
  for (const slider of sliders) {
    const value = slider.get();
    $(slider.id).value = value;
    $(`${slider.id}Value`).innerHTML = slider.show ? slider.show(value) : value;
  }
  document.querySelectorAll('input[type="range"]').forEach(paintRange);
  $('key').value = KEY_NAMES[settings.engine.key.tonic];
  $('mode').value = settings.engine.key.mode;
  const wet = settings.global.wet;
  $('placeReadout').textContent = wet < 0.25 ? 'DRY' : wet < 0.6 ? 'HALF WET' : wet < 0.85 ? 'WET' : 'COSMIC';
  const l = settings.engine.lengths;
  const meet = lcm(lcm(l.bass, l.arp), l.motif * 2);
  const all = [[l.seq2 * 3, 'seq2'], [l.pulse * 4, 'pulse']].reduce((m, [n, id]) => (settings.layers[id].on ? lcm(m, n) : m), meet);
  $('cycleReadout').textContent = `MEET EVERY ${all}`;
  $('renew').value = String(settings.engine.renew);
  $('recolor').value = String(settings.engine.recolor);
  $('rotate').value = String(settings.engine.rotate);
  const drift = settings.global.drift;
  $('driftReadout').textContent = drift === 0 ? 'STILL' : drift < 0.4 ? 'GENTLE' : drift < 0.75 ? 'DRIFTING' : 'WANDERING';
  $('seedValue').textContent = settings.seed;
  const on = LAYER_IDS.filter((id) => settings.layers[id].on).length;
  $('enabledBadge').textContent = `${on} ON · ${LAYER_IDS.length}`;
  $('rotateNote').textContent = settings.engine.rotate
    ? `${on} of ${LAYER_IDS.length} keep playing. Switch layers on or off to change how many.`
    : 'Each layer stays as you set it.';
  $('newJourney').disabled = !!audio.recording;
  syncThreadLength();
  window.dispatchEvent(new Event('tangerine:controls'));
}

function changeKey() {
  const key = { tonic: KEY_NAMES.indexOf($('key').value), mode: $('mode').value };
  settings.engine.key = key;
  audio.setEngine({ key });
  travelling = audio.engine.harmony ? key : null;
  renderKeyReadout();
  if (travelling && audio.playing) notify(`On the way to ${keyName(key)}, by the gentlest route.`);
  persist();
}
$('key').addEventListener('change', changeKey);
$('mode').addEventListener('change', changeKey);

function renderKeyReadout() {
  const current = audio.engine.harmony?.key || settings.engine.key;
  $('keyReadout').textContent = travelling ? `→ ${keyName(travelling).toUpperCase()}` : keyName(current).toUpperCase();
}

// Random: a key, a mode and the four harmony settings, said out loud.
function drawHarmony() {
  const pick = (items, weightOf) => { let x = Math.random() * items.reduce((t, i) => t + weightOf(i), 0); return items.find((i) => (x -= weightOf(i)) < 0) || items[0]; };
  const key = { tonic: Math.floor(Math.random() * 12), mode: pick(Object.keys(MODES), (m) => MODE_WEIGHT[m] || 0.5) };
  const round = (x) => Math.round(x * 100) / 100;
  const drawn = { complexity: round(0.35 + 0.65 * Math.random()), changes: 1 + Math.floor(Math.random() * 10), wander: round(0.2 + 0.8 * Math.random()), pedal: round(0.6 * Math.random() ** 2) };
  Object.assign(settings.engine, drawn);
  audio.setEngine(drawn);
  $('key').value = KEY_NAMES[key.tonic];
  $('mode').value = key.mode;
  $('randomNote').textContent = `Drawn: ${keyName(key)} · richness ${Math.round(drawn.complexity * 100)} · ${drawn.changes} key changes · distance ${Math.round(drawn.wander * 100)} · held bass ${Math.round(drawn.pedal * 100)}.`;
  return key;
}

$('randomHarmony').addEventListener('click', () => {
  drawHarmony();
  changeKey();
  renderControls();
  persist();
});

$('recolor').addEventListener('change', (e) => {
  settings.engine.recolor = Number(e.target.value);
  audio.setEngine({ recolor: settings.engine.recolor });
  persist();
});

$('rotate').addEventListener('change', (e) => {
  settings.engine.rotate = Number(e.target.value);
  audio.setEngine({ rotate: settings.engine.rotate });
  renderControls();
  persist();
});

$('renew').addEventListener('change', (e) => {
  settings.engine.renew = Number(e.target.value);
  audio.setEngine({ renew: settings.engine.renew });
  persist();
});

$('newSequences').addEventListener('click', () => {
  settings.salt = (settings.salt + 1) % 1000000;
  audio.setEngine({ salt: settings.salt });
  notify('New sequences. They start on their next turn.');
  persist();
});

$('newJourney').addEventListener('click', () => {
  if (audio.recording) return;
  settings.seed = (Math.random() * 4294967296) >>> 0;
  audio.setSeed(settings.seed);
  trail = [];
  marks = [];
  travelling = null;
  renderTrail();
  renderControls();
  notify(audio.playing ? 'New seed; your harmony and settings stay. The next note starts the new journey.' : 'New seed ready; your harmony and settings stay.');
  persist();
});

// ---------------------------------------------------------------- layers

const ENVELOPE_FIELDS = [
  { name: 'a', label: 'Attack', log: true },
  { name: 'd', label: 'Decay', log: true },
  { name: 's', label: 'Sustain' },
  { name: 'r', label: 'Release', log: true },
  { name: 'gate', label: 'Gate · note length' },
];
const toSlider = (name, value) => {
  const [lo, hi] = ENVELOPE_LIMITS[name];
  return ENVELOPE_FIELDS.find((f) => f.name === name).log ? Math.round(100 * Math.log(value / lo) / Math.log(hi / lo)) : Math.round(100 * (value - lo) / (hi - lo));
};
const fromSlider = (name, x) => {
  const [lo, hi] = ENVELOPE_LIMITS[name];
  return ENVELOPE_FIELDS.find((f) => f.name === name).log ? lo * (hi / lo) ** (x / 100) : lo + (hi - lo) * x / 100;
};
const showEnvelope = (name, value) => (['s', 'gate'].includes(name) ? `${Math.round(value * 100)} %` : value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(value < 10 ? 1 : 0)} s`);

const cards = {};
const STEP_NAME = { 1: '', 2: ' (eighths)', 3: ' (dotted eighths)', 4: ' (quarters)' };
const LAYER_INFO = { cello: 'BOWED · FOLLOWS THE CHORDS', lead: 'LONG NOTES · LONG ECHO', theme: 'A SHORT THEME · LONG RESTS', drone: 'THE HOME NOTE, WHEN IT FITS', air: 'ABOVE THE PAD', bells: 'SIX VOICES · OWN TIMES' };
for (const def of LAYERS) {
  const id = def.id;
  const card = document.createElement('article');
  card.className = 'layer';
  card.style.setProperty('--hue', COLORS[id]);
  const soundOptions = Object.entries(SOUNDS[id]).map(([value, sound]) => `<option value="${value}">${sound.label}</option>`).join('');
  const lengthField = def.kind === 'seq'
    ? `<label>Length<select data-field="length">${def.lengths.map((n) => `<option value="${n}">${n} steps${STEP_NAME[def.div]}</option>`).join('')}</select></label>`
    : `<label>Echo<select data-field="div">${Object.keys(DIVISIONS).map((d) => `<option value="${d}">${DIVISION_LABEL[d]}</option>`).join('')}</select></label>`;
  const echoDivision = def.kind === 'seq'
    ? `<label>Echo length<select data-field="div">${Object.keys(DIVISIONS).map((d) => `<option value="${d}">${DIVISION_LABEL[d]}</option>`).join('')}</select></label>` : '';
  const envelope = ENVELOPE_FIELDS.filter((f) => !(f.name === 'gate' && !['seq', 'line'].includes(def.kind)) && !(f.name === 's' && id === 'bells'))
    .map((f) => `<div><label class="slider-label"><span>${f.label}</span><output data-out="${f.name}"></output></label><input type="range" min="0" max="100" data-env="${f.name}"></div>`).join('');
  card.innerHTML = `
    <div class="layer-top">
      <svg class="ring" viewBox="0 0 46 46" aria-hidden="true"></svg>
      <div class="layer-title"><strong>${def.name}</strong><small data-info></small></div>
      <button class="solo-button" type="button" aria-pressed="false" aria-label="Listen to ${def.name} only" title="Listen to ${def.name} only"><svg aria-hidden="true"><use href="#headphones"/></svg></button>
      <button class="switch" type="button" role="switch" aria-label="${def.name}">ON</button>
    </div>
    <button class="edit-layer" type="button" aria-expanded="false" aria-controls="edit-${id}">Edit sound &amp; shape <span>+</span></button><div id="edit-${id}" class="layer-fields"><label>Sound<select data-field="sound">${soundOptions}</select></label>${lengthField}</div>
    <label class="slider-label"><span>Level</span><output data-out="level"></output></label><input type="range" min="0" max="100" data-field="level">
    <details><summary>SHAPE &amp; ECHO</summary>
      <div class="mini-grid">${envelope}</div>
      ${echoDivision ? `<div class="layer-fields one">${echoDivision}</div>` : ''}
      <div class="mini-grid">
        <div><label class="slider-label"><span>Echo repeats</span><output data-out="feedback"></output></label><input type="range" min="0" max="100" data-field="feedback"></div>
        <div><label class="slider-label"><span>Echo level</span><output data-out="mix"></output></label><input type="range" min="0" max="100" data-field="mix"></div>
      </div>
    </details>`;
  $('layerList').append(card);
  const update = (patch) => {
    Object.assign(settings.layers[id], patch, patch.delay ? { delay: { ...settings.layers[id].delay, ...patch.delay } } : {});
    audio.setLayer(id, patch);
    renderLayer(id);
    renderControls();
    persist();
  };
  card.querySelector('.switch').addEventListener('click', () => update({ on: !settings.layers[id].on }));
  card.querySelector('.solo-button').addEventListener('click', () => {
    audio.setSolo(audio.solo === id ? null : id);
    renderSolo();
  });
  card.querySelector('[data-field="sound"]').addEventListener('change', (e) => update({ sound: e.target.value }));
  card.querySelectorAll('[data-field="div"]').forEach((el) => el.addEventListener('change', (e) => update({ delay: { div: e.target.value } })));
  card.querySelector('[data-field="level"]').addEventListener('input', (e) => update({ level: Number(e.target.value) / 100 }));
  card.querySelector('[data-field="feedback"]').addEventListener('input', (e) => update({ delay: { feedback: Number(e.target.value) / 100 } }));
  // Echo repeats are a share of the safe maximum: at 100 % they still fade.
  card.querySelector('[data-field="mix"]').addEventListener('input', (e) => update({ delay: { mix: Number(e.target.value) / 100 } }));
  card.querySelectorAll('[data-env]').forEach((el) => el.addEventListener('input', (e) => update({ [el.dataset.env]: fromSlider(el.dataset.env, Number(e.target.value)) })));
  const length = card.querySelector('[data-field="length"]');
  if (length) {
    length.addEventListener('change', (e) => {
      const value = Number(e.target.value);
      settings.engine.lengths[id] = value;
      audio.setEngine({ lengths: { [id]: value } });
      renderLayer(id);
      renderControls();
      persist();
    });
  }
  card.querySelectorAll('input[type="range"]').forEach((input, index) => {
    const label = input.previousElementSibling;
    input.id = `layer-${id}-${index}`;
    if (label?.tagName === 'LABEL') { label.htmlFor = input.id; input.setAttribute('aria-label', `${label.querySelector('span')?.textContent || 'Parameter'} — ${def.name}`); }
  });
  cards[id] = { card, ring: card.querySelector('.ring'), info: card.querySelector('[data-info]'), def, lastSig: '' };
}

function renderLayer(id) {
  const { card, def } = cards[id];
  const s = settings.layers[id];
  card.classList.toggle('off', !s.on);
  const sw = card.querySelector('.switch');
  sw.setAttribute('aria-checked', String(s.on));
  sw.textContent = s.on ? 'ON' : 'OFF';
  card.querySelector('[data-field="sound"]').value = s.sound;
  card.querySelectorAll('[data-field="div"]').forEach((el) => { el.value = s.delay.div; });
  const length = card.querySelector('[data-field="length"]');
  if (length) length.value = settings.engine.lengths[id];
  const set = (field, value, shown) => {
    const input = card.querySelector(`[data-field="${field}"]`);
    if (input) input.value = value;
    const out = card.querySelector(`[data-out="${field}"]`);
    if (out) out.textContent = shown;
  };
  set('level', Math.round(s.level * 100), Math.round(s.level * 100));
  set('feedback', Math.round(s.delay.feedback * 100), `${Math.round(s.delay.feedback * 100)} %`);
  set('mix', Math.round(s.delay.mix * 100), s.delay.mix === 0 ? 'off' : Math.round(s.delay.mix * 100));
  card.querySelectorAll('[data-env]').forEach((el) => {
    el.value = toSlider(el.dataset.env, s[el.dataset.env]);
    card.querySelector(`[data-out="${el.dataset.env}"]`).textContent = showEnvelope(el.dataset.env, s[el.dataset.env]);
  });
  card.querySelectorAll('input[type="range"]').forEach(paintRange);
  if (def.kind === 'seq') cards[id].info.textContent = `${settings.engine.lengths[id]} STEPS${STEP_NAME[def.div].toUpperCase()} · ${(SOUNDS[id][s.sound]?.label || 'Sample').toUpperCase()}`;
  else if (LAYER_INFO[id]) cards[id].info.textContent = LAYER_INFO[id];
}

function renderSolo() {
  const solo = audio.solo;
  $('soloPanel').hidden = !solo;
  $('soloName').textContent = solo ? cards[solo].def.name : '';
  for (const id of LAYER_IDS) {
    const button = cards[id].card.querySelector('.solo-button');
    const name = cards[id].def.name;
    button.setAttribute('aria-pressed', String(solo === id));
    button.title = solo === id ? `Return to your mix · ${name}` : `Listen to ${name} only`;
    button.setAttribute('aria-label', button.title);
    cards[id].card.classList.toggle('soloed', solo === id);
    cards[id].card.classList.toggle('solo-silenced', !!solo && solo !== id);
  }
  renderTransport();
}
$('returnToMix').addEventListener('click', () => { audio.setSolo(null); renderSolo(); });

// Rings: one dot per step, the lit one is playing; for the pad, the notes of the chord.
function drawRing(id, position, harmony) {
  const { ring } = cards[id];
  let sig;
  let html = '';
  const color = COLORS[id];
  if (position) {
    const { index, length, pattern } = position;
    sig = `${index}|${length}|${pattern.map((p) => (p.on ? p.idx + 1 : 0)).join('')}`;
    if (sig === cards[id].lastSig) return;
    for (let i = 0; i < length; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / length;
      const x = 23 + 17 * Math.cos(angle);
      const y = 23 + 17 * Math.sin(angle);
      const on = pattern[i]?.on;
      const lit = i === index && audio.playing;
      html += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${lit ? 3.4 : on ? 2.2 : 1.2}" fill="${on || lit ? color : '#4a382a'}" opacity="${lit ? 1 : on ? 0.55 : 1}"/>`;
    }
  } else if (HOLD_IDS.includes(id)) {
    const notes = id === 'pad' ? harmony?.voicing || [] : audio.graph?.lastHold[id] || [];
    sig = notes.join(',');
    if (sig === cards[id].lastSig) return;
    notes.forEach((midi, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * (midi % 12) / 12;
      html += `<line x1="23" y1="23" x2="${(23 + 18 * Math.cos(angle)).toFixed(1)}" y2="${(23 + 18 * Math.sin(angle)).toFixed(1)}" stroke="${color}" stroke-width="${i === 0 ? 2.2 : 1.4}" opacity="${0.5 + 0.1 * i}"/>`;
    });
    html += '<circle cx="23" cy="23" r="19" fill="none" stroke="#4a382a"/>';
  } else if (id !== 'bells') {
    // A bowed or held line: a slow wave.
    sig = 'line';
    if (sig === cards[id].lastSig) return;
    const points = Array.from({ length: 25 }, (_, i) => `${(5 + 36 * i / 24).toFixed(1)},${(23 + (id === 'lead' ? 9 : 6) * Math.sin(i / 24 * Math.PI * (id === 'lead' ? 3 : 2))).toFixed(1)}`).join(' ');
    html = `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" opacity=".75"/><circle cx="23" cy="23" r="19" fill="none" stroke="#4a382a"/>`;
  } else {
    sig = 'bells';
    if (sig === cards[id].lastSig) return;
    for (let i = 0; i < 6; i++) {
      const angle = 2 * Math.PI * i / 6;
      html += `<circle cx="${(23 + 13 * Math.cos(angle)).toFixed(1)}" cy="${(23 + 13 * Math.sin(angle)).toFixed(1)}" r="${2 + (i % 3)}" fill="none" stroke="${color}" opacity=".6"/>`;
    }
  }
  cards[id].lastSig = sig;
  ring.innerHTML = html;
}

// ---------------------------------------------------------------- harmony display

function renderTrail() {
  $('chordTrail').innerHTML = trail.slice(-9).map((h) => `<li class="${h.modulation ? 'mod' : ''}" title="${keyName(h.key)}">${chordName(h.chord)}</li>`).join('');
}

function onVisual(item) {
  if (item.harmony) {
    const h = item.harmony;
    trail.push(h);
    if (trail.length > 40) trail.shift();
    marks.push({ t: item.t, name: chordName(h.chord), modulation: !!h.modulation });
    if (marks.length > 20) marks.shift();
    $('chordName').textContent = chordName(h.chord);
    $('vineChord').textContent = chordName(h.chord);
    $('vineKey').textContent = keyName(h.key).toUpperCase();
    const held = h.chord.bass !== h.chord.root;
    $('keyLine').innerHTML = `<b>${keyName(h.key)}</b>${held ? ' · the bass holds the home note' : ''}`;
    const journey = $('journey');
    if (h.modulation) {
      const m = h.modulation;
      journey.innerHTML = `<strong>${MODULATION_LABEL[m.kind].toUpperCase()}</strong>${keyName(m.from)} → ${keyName(m.to)}, ${METHOD_LABEL[m.method]}.`;
      journey.classList.remove('fresh'); void journey.offsetWidth; journey.classList.add('fresh');
      if (travelling && travelling.tonic === h.key.tonic && travelling.mode === h.key.mode) travelling = null;
    } else if (h.pivotFor) {
      journey.innerHTML = `<strong>A SHARED CHORD</strong>This chord belongs to ${keyName(h.pivotFor.from)} and to ${keyName(h.pivotFor.to)}: the door to the next key.`;
    }
    renderKeyReadout();
    renderTrail();
    cards.pad.info.textContent = chordName(h.chord).toUpperCase();
  }
  if (item.mutation) {
    const card = cards[item.mutation.layer]?.card;
    if (card) { card.animate([{ borderColor: COLORS[item.mutation.layer] }, { borderColor: '#382a1f' }], { duration: 2400 }); }
  }
  if (item.recolor?.sound) {
    const { layer, sound } = item.recolor;
    settings.layers[layer].sound = sound;
    renderLayer(layer);
    cards[layer].card.animate([{ borderColor: COLORS[layer] }, { borderColor: '#382a1f' }], { duration: 3200 });
    if (settings.layers[layer].on) notify(`${cards[layer].def.name} changes its sound: ${SOUNDS[layer][sound].label}.`);
    persist();
  }
  if (item.rotate) {
    const { off, on } = item.rotate;
    settings.layers[off].on = false;
    settings.layers[on].on = true;
    for (const id of [off, on]) {
      renderLayer(id);
      cards[id].card.animate([{ borderColor: COLORS[id] }, { borderColor: '#382a1f' }], { duration: 3200 });
    }
    renderControls();
    notify(`${cards[off].def.name} rests. ${cards[on].def.name} comes in.`);
    persist();
  }
  if (item.renewed) {
    for (const id of SEQ_IDS) cards[id].card.animate([{ borderColor: COLORS[id] }, { borderColor: '#382a1f' }], { duration: 3200 });
    notify('New sequences, by themselves.');
  }
}
audio.on(onVisual);

// ---------------------------------------------------------------- the vine

const canvas = $('vine');
const g = canvas.getContext('2d');
const WINDOW = 9;
function drawVine() {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const now = audio.currentTime;
  const nowX = w * 0.9;
  const px = nowX / WINDOW;
  const xOf = (t) => nowX - (now - t) * px;
  const yOf = (midi) => h - 14 - (clamp(midi, 28, 100) - 28) / 72 * (h - 34);
  // Faint octave lines.
  g.strokeStyle = '#2a1f17';
  g.lineWidth = 1;
  for (let midi = 36; midi <= 96; midi += 12) { g.beginPath(); g.moveTo(0, yOf(midi) + 0.5); g.lineTo(w, yOf(midi) + 0.5); g.stroke(); }
  // Chord changes.
  g.font = '9px ui-monospace, Menlo, monospace';
  for (const mark of marks) {
    const x = xOf(mark.t);
    if (x < -60 || x > w) continue;
    g.strokeStyle = mark.modulation ? '#f28a2e88' : '#4a382a';
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke();
    g.fillStyle = mark.modulation ? '#ffbb6b' : '#ab9580';
    if (x <= nowX) g.fillText(mark.name, x + 5, 13);
  }
  const feed = audio.feed;
  // The held layers: soft bands from one change to the next.
  for (const id of HOLD_IDS) {
    const holds = feed.filter((f) => f.layer === id);
    holds.forEach((hold, i) => {
      const end = holds[i + 1] ? holds[i + 1].t : now;
      const x0 = Math.max(0, xOf(hold.t));
      const x1 = Math.min(nowX, xOf(end));
      if (x1 < 0 || x0 > nowX) return;
      g.fillStyle = `${COLORS[id]}33`;
      for (const midi of hold.midi) g.fillRect(x0, yOf(midi) - 3, x1 - x0, 6);
    });
  }
  for (const note of feed) {
    if (HOLD_IDS.includes(note.layer)) continue;
    const x = xOf(note.t);
    if (x > nowX || x < -40 || note.t > now) continue;
    const y = yOf(note.midi);
    if (note.layer === 'bells') {
      const age = clamp((now - note.t) / 6, 0, 1);
      g.fillStyle = `rgba(247,234,210,${0.9 - 0.7 * age})`;
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(247,234,210,${0.35 - 0.3 * age})`;
      g.beginPath(); g.arc(x, y, 3 + 18 * age, 0, Math.PI * 2); g.stroke();
      continue;
    }
    const width = Math.max(2, Math.min(note.length, now - note.t) * px);
    const fresh = now - note.t < 0.12;
    g.fillStyle = COLORS[note.layer];
    g.globalAlpha = fresh ? 1 : 0.75;
    const thick = h > 420 ? 6 : 4;
    g.fillRect(x, y - thick / 2, width, thick);
    if (fresh) { g.globalAlpha = 0.35; g.fillRect(x - 2, y - thick / 2 - 3, width + 4, thick + 6); }
    g.globalAlpha = 1;
  }
  g.strokeStyle = '#f28a2e';
  g.globalAlpha = 0.6;
  g.beginPath(); g.moveTo(nowX + 0.5, 0); g.lineTo(nowX + 0.5, h); g.stroke();
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- transport

function currentStep() {
  if (!audio.playing || !audio.graph) return audio.engine.stepIndex;
  const ahead = Math.max(0, Math.ceil((audio.nextStepTime - audio.currentTime) / audio.graph.stepSeconds()));
  return Math.max(0, audio.engine.stepIndex - ahead);
}

function renderTransport() {
  const playing = audio.playing;
  const finished = !!audio.engine.ending?.done;
  $('transport').setAttribute('aria-pressed', String(playing));
  $('transport').querySelector('use').setAttribute('href', playing ? '#pause' : '#play');
  $('transportText').textContent = playing ? 'Pause' : finished ? 'Play the thread again' : elapsed > 0 ? 'Carry on' : settings.form.thread ? 'Start the thread' : 'Start the vine';
  $('transportDot').classList.toggle('playing', playing);
  $('focusPlay').textContent = playing ? 'Pause' : 'Play';
  $('focusPlay').setAttribute('aria-pressed', String(playing));
  $('sourceName').textContent = settings.form.thread ? `A thread of ${settings.form.minutes} minutes · seed ${settings.seed}` : 'Sequences · one moving harmony';
  const anyOn = LAYER_IDS.some((id) => settings.layers[id].on);
  const solo = audio.solo ? cards[audio.solo].def.name : null;
  if (solo) $('sourceName').textContent = `Solo · ${solo}`;
  $('playStatus').textContent = solo ? (playing ? 'One layer alone. Your mix is waiting.' : 'Solo, paused. Your mix is waiting.') : !anyOn ? 'All layers are off. Let one in.'
    : settings.global.volume === 0 ? 'Volume is at zero.'
      : playing ? (audio.engine.ending && audio.engine.stepIndex >= audio.engine.ending.finalStart ? 'The thread is closing: the layers are leaving.' : 'The sequences are turning.')
        : finished ? 'The thread is complete.' : elapsed > 0 ? 'Paused. The vine will wait.' : 'Ready when you are.';
  $('recordPassageButton').setAttribute('aria-pressed', String(!!audio.recording));
  $('memoryRecordText').textContent = audio.recording ? 'Stop and keep' : 'Record a passage';
  $('formEndless').setAttribute('aria-checked', String(!settings.form.thread));
  $('formThread').setAttribute('aria-checked', String(settings.form.thread));
  $('threadMinutes').value = String(settings.form.minutes);
  $('formReadout').textContent = settings.form.thread ? `${settings.form.minutes} MIN THREAD` : 'ENDLESS';
  $('threadBar').hidden = !settings.form.thread;
  const long = settings.form.minutes > MAX_RENDER_MINUTES;
  $('renderText').textContent = rendering ? $('renderText').textContent : long ? 'Make the thread as notes (MIDI, ABC)' : 'Make the thread as files';
  $('formHint').textContent = settings.form.thread
    ? `Plays from its beginning. Twenty-four bars before the end it heads home; the last eight bars hold the home chord while the layers leave.${long ? ' Longer than 20 minutes: at the end, the last 20 minutes are kept as sound; the whole thread can be made as notes.' : ''}`
    : 'Like Loopra: it never ends. Or a thread: it comes home, the layers leave one by one, and the last chord fades.';
  renderControls();
}

async function toggle() {
  try {
    if (audio.playing) {
      await audio.pause();
      elapsed += (performance.now() - startedAt) / 1000;
      startedAt = null;
    } else {
      if (settings.form.thread && (audio.engine.ending?.done || !audio.thread)) {
        audio.startThread(settings.form.minutes);
        resetDisplay();
        elapsed = 0;
      }
      await audio.start();
      startedAt = performance.now();
    }
  } catch (error) {
    notify(error.message || 'The sound could not start. Please try again.');
  }
  renderTransport();
}
$('transport').addEventListener('click', toggle);

// Restart: from zero, with a new seed, a new key and mode and new harmony settings.
// The layers, their sounds and the tempo stay as they are.
async function restart() {
  if (audio.recording) { notify('Stop the recording first: it would be cut.'); return; }
  const key = drawHarmony();
  settings.engine.key = key;
  settings.seed = (Math.random() * 4294967296) >>> 0;
  settings.salt = 0;
  audio.setEngine({ key, salt: 0 });
  if (audio.graph) audio.graph.releaseAll(audio.currentTime);
  audio.setSeed(settings.seed);
  resetDisplay();
  elapsed = 0;
  startedAt = audio.playing ? performance.now() : null;
  if (!audio.playing) await toggle();
  notify(`From zero: ${keyName(key)}, seed ${settings.seed}.`);
  renderKeyReadout();
  renderTransport();
  persist();
}
$('restart').addEventListener('click', (e) => { e.currentTarget.blur(); restart(); });

// The vine, full screen (Esc leaves it; a double click too).
const vineFrame = $('vineFrame');
const fullElement = () => document.fullscreenElement || document.webkitFullscreenElement;
let focusHome = null;
let focusSibling = null;
let previousFocus = null;
function leaveFocus() {
  if (!vineFrame.classList.contains('is-focused')) return;
  vineFrame.classList.remove('is-focused');
  document.body.classList.remove('focus-active');
  document.querySelector('.app-shell').inert = false;
  document.querySelector('.mobile-nav').inert = false;
  focusHome.insertBefore(vineFrame, focusSibling);
  previousFocus?.focus();
  onFullscreen();
}
function enterFocus() {
  previousFocus = document.activeElement;
  focusHome = vineFrame.parentNode;
  focusSibling = vineFrame.nextSibling;
  document.body.append(vineFrame);
  vineFrame.classList.add('is-focused');
  document.body.classList.add('focus-active');
  document.querySelector('.app-shell').inert = true;
  document.querySelector('.mobile-nav').inert = true;
  $('fullscreen').focus();
  onFullscreen();
}
function toggleFullscreen() {
  if (vineFrame.classList.contains('is-focused')) { leaveFocus(); return; }
  if (fullElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const mobile = window.innerWidth <= 740 || document.body.classList.contains('preview-phone');
  const native = vineFrame.requestFullscreen || vineFrame.webkitRequestFullscreen;
  if (mobile || !native) { enterFocus(); return; }
  try { const result = native.call(vineFrame); result?.catch(() => enterFocus()); }
  catch { enterFocus(); }
}
$('fullscreen').addEventListener('click', (e) => { e.currentTarget.blur(); toggleFullscreen(); });
canvas.addEventListener('dblclick', toggleFullscreen);
const onFullscreen = () => {
  const on = fullElement() === vineFrame || vineFrame.classList.contains('is-focused');
  $('fullscreen').querySelector('use').setAttribute('href', on ? '#shrink' : '#expand');
  $('fullscreen').setAttribute('aria-label', on ? 'Back to the studio' : 'Show the score full screen');
  $('fullscreen').title = on ? 'Back to the studio (Esc)' : 'Full-screen animated score';
};
document.addEventListener('fullscreenchange', onFullscreen);
document.addEventListener('webkitfullscreenchange', onFullscreen);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') leaveFocus(); });
$('focusPlay').addEventListener('click', toggle);
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  if (event.target.closest('input, select, textarea, button, summary, dialog')) return;
  event.preventDefault();
  toggle();
});

function resetDisplay() {
  trail = [];
  marks = [];
  travelling = null;
  renderTrail();
}

// ---------------------------------------------------------------- the form

function setForm(thread) {
  settings.form.thread = thread;
  if (!thread) audio.startThread(null);
  else if (audio.playing) {
    // A thread starts from its beginning: same seed, same settings.
    audio.startThread(settings.form.minutes);
    resetDisplay();
    elapsed = 0;
    startedAt = performance.now();
    notify(`A thread of ${settings.form.minutes} minutes begins with the next note.`);
  }
  renderTransport();
  persist();
}
$('formEndless').addEventListener('click', () => setForm(false));
$('formThread').addEventListener('click', () => setForm(true));
$('threadMinutes').addEventListener('change', (e) => {
  settings.form.minutes = Number(e.target.value);
  if (settings.form.thread && audio.thread) {
    // Same thread, new length: the ending moves, the beginning stays.
    audio.engine.setEnding(settings.form.minutes * 60 * settings.global.bpm * 4 / 60);
    audio.thread.minutes = settings.form.minutes;
  }
  renderTransport();
  persist();
});

let rendering = false;
const RECORD_LIMIT = 30 * 60;
let stopping = false;
$('renderThread').addEventListener('click', async () => {
  if (rendering) return;
  rendering = true;
  $('renderThread').disabled = true;
  const minutes = settings.form.minutes;
  const began = new Date();
  try {
    if (audio.playing) { await audio.pause(); elapsed += (performance.now() - startedAt) / 1000; startedAt = null; renderTransport(); }
    const subtitle = `seed ${settings.seed} · ${minutes} min thread`;
    if (minutes > MAX_RENDER_MINUTES) {
      // Too long to hold as sound: the notes of the whole thread, in a moment.
      const result = renderNotes({
        seed: settings.seed, minutes,
        engine: { ...settings.engine, key: { ...settings.engine.key }, salt: settings.salt },
        layers: settings.layers, global: settings.global,
        names: { title: 'Tangerine', subtitle },
      });
      addTake({ ...result, wav: null, began }, `thread${minutes}min_notes`, `Thread ${minutes} min · notes`);
      notify('The whole thread as notes: MIDI and ABC, under Keep. Sound is made for threads up to 20 minutes.');
      throw null;
    }
    notify(`Making a thread of ${minutes} minutes, faster than it plays. Keep this tab in front.`);
    const result = await renderOffline({
      seed: settings.seed, minutes,
      engine: { ...settings.engine, key: { ...settings.engine.key }, salt: settings.salt },
      layers: settings.layers, global: settings.global,
      names: { title: 'Tangerine', subtitle },
      colour: audio.colour,
      onProgress: (x) => { $('renderText').textContent = `Making the thread… ${Math.round(100 * x)} %`; },
    });
    const wav = encodeWav([result.buffer.getChannelData(0), result.buffer.getChannelData(1)], result.buffer.sampleRate);
    addTake({ wav, midi: result.midi, abc: result.abc, lead: result.lead, seconds: result.buffer.duration, began }, `thread${minutes}min`, `Thread ${minutes} min`);
    notify('The thread is ready: WAV, MIDI and ABC, under Keep.');
  } catch (error) {
    if (error) notify(error.message || 'The thread could not be made.');
  }
  $('renderThread').disabled = false;
  rendering = false;
  renderTransport();
});

// ---------------------------------------------------------------- keeping passages

const takes = [];
const stamp = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
};
const sizeOf = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);
const blobUrl = (data, type) => URL.createObjectURL(new Blob([data], { type }));

function addTake(result, suffix, label) {
  const base = `Tangerine_${stamp(result.began || new Date())}_seed${settings.seed}_${suffix}`;
  takes.unshift({
    base, label, seconds: result.seconds,
    wav: result.wav && blobUrl(result.wav, 'audio/wav'), wavSize: result.wav?.length || 0,
    midi: blobUrl(result.midi, 'audio/midi'),
    abc: blobUrl(result.abc, 'text/vnd.abc'),
    lead: result.lead && blobUrl(result.lead, 'text/vnd.abc'),
  });
  // Old takes give their memory back.
  for (const old of takes.splice(8)) for (const url of [old.wav, old.midi, old.abc, old.lead]) if (url) URL.revokeObjectURL(url);
  renderTakes();
}

function renderTakes() {
  $('takes').innerHTML = takes.map((t) => `<li><strong title="${t.base}">${t.label} · ${time(t.seconds)}</strong>${t.wav ? `<a href="${t.wav}" download="${t.base}.wav" title="${sizeOf(t.wavSize)}">WAV</a>` : ''}<a href="${t.midi}" download="${t.base}.mid">MIDI</a><a class="abc" href="${t.abc}" download="${t.base}.abc" title="The full score: one voice per layer that played">ABC</a>${t.lead ? `<a class="abc" href="${t.lead}" download="${t.base}_leadsheet.abc" title="Melody and chord symbols, for YuE2 (--abc-file)">LEAD</a>` : ''}</li>`).join('');
}

const keepLabel = { 30: 'Last 30 s', 60: 'Last minute', 120: 'Last 2 min', 300: 'Last 5 min', 600: 'Last 10 min', 1200: 'Last 20 min', all: 'Available memory (max 20 min)' };
const keepSuffix = { 30: 'last30s', 60: 'last1min', 120: 'last2min', 300: 'last5min', 600: 'last10min', 1200: 'last20min', all: 'sincestart' };
const names = () => ({ title: 'Tangerine', subtitle: `seed ${settings.seed} · ${new Date().toLocaleString()}` });

$('keepButton').addEventListener('click', async () => {
  const choice = $('keepLength').value;
  if (!audio.ctx || audio.heardSeconds < 1) { notify('Nothing to keep yet: start the vine first.'); return; }
  $('keepButton').disabled = true;
  try {
    const seconds = choice === 'all' ? Infinity : Number(choice);
    const result = await audio.keepLast(seconds, names());
    if (!result) throw new Error('Nothing to keep yet.');
    addTake({ ...result, began: new Date(Date.now() - result.seconds * 1000) }, keepSuffix[choice], keepLabel[choice]);
    notify(result.truncated ? `Kept ${time(result.seconds)}: that is all Tangerine has heard so far.` : `Kept: WAV, MIDI and ABC, just below.${result.wav ? '' : ' (No sound capture in this browser: MIDI and ABC only.)'}`);
  } catch (error) {
    notify(error.message || 'This passage could not be kept.');
  }
  $('keepButton').disabled = false;
});

async function finishRecording() {
  $('memoryRecordText').textContent = 'Saving…';
  const result = await audio.stopRecording(names());
  if (!result) return;
  addTake(result, 'take', 'Take');
  notify('Take kept: WAV, MIDI and ABC, just below.');
}

$('recordPassageButton').addEventListener('click', async () => {
  try {
    if (audio.recording) await finishRecording();
    else {
      if (!audio.playing) await toggle();
      audio.startRecording();
    }
  } catch (error) {
    notify(error.message || 'Recording could not start.');
  }
  renderTransport();
});

// When a thread ends, it is kept whole, and the player rests.
audio.on(onThreadEnd);
async function onThreadEnd(item) {
  if (!item.ended) return;
  // A long thread: what is still remembered, the last twenty minutes.
  const from = Math.max(audio.journal.timeOf(item.thread.startStep) ?? 0, audio.earliestTime);
  if (audio.recording) await finishRecording();
  const result = await audio._keep(from, audio.currentTime, { title: 'Tangerine', subtitle: `seed ${item.thread.seed} · ${item.thread.minutes} min thread` });
  if (audio.playing) { await audio.pause(); elapsed += (performance.now() - startedAt) / 1000; startedAt = null; }
  if (result) {
    addTake({ ...result, began: new Date(Date.now() - result.seconds * 1000) }, `thread${item.thread.minutes}min`, `Thread ${item.thread.minutes} min`);
    notify(result.seconds + 1 < item.thread.minutes * 60 ? 'Thread complete. The available ending (up to 20 minutes) is under recent passages.' : 'Thread complete. Its download links are under recent passages.');
  }
  renderTransport();
}

// ---------------------------------------------------------------- MIDI out

let midiAccess = null;
async function loadPorts() {
  if (midiAccess || !navigator.requestMIDIAccess) {
    if (!navigator.requestMIDIAccess) notify('This browser has no Web MIDI. Chrome does.');
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess();
    const fill = () => {
      const current = $('midiPort').value;
      $('midiPort').innerHTML = '<option value="">Nothing (off)</option>' + [...midiAccess.outputs.values()].map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
      $('midiPort').value = [...midiAccess.outputs.keys()].includes(current) ? current : '';
      if (!midiAccess.outputs.size) $('midiPort').innerHTML += '<option disabled>No MIDI port found</option>';
    };
    fill();
    midiAccess.onstatechange = fill;
  } catch {
    notify('MIDI access was refused.');
  }
}
$('midiPort').addEventListener('pointerdown', loadPorts);
$('midiPort').addEventListener('focus', loadPorts);
function applyMidi() {
  const port = midiAccess && $('midiPort').value ? midiAccess.outputs.get($('midiPort').value) : null;
  audio.setMidiOut(port || null, $('midiOnly').checked);
  $('midiReadout').textContent = port ? (audio.midiOnly ? 'MIDI ONLY' : 'ON') : 'OFF';
}
$('midiPort').addEventListener('change', applyMidi);
$('midiOnly').addEventListener('change', applyMidi);

// ---------------------------------------------------------------- setup files

$('saveSetup').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Tangerine_setup_seed${settings.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('loadSetup').addEventListener('click', () => $('setupFile').click());
$('setupFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const loaded = readSetup(JSON.parse(await file.text()));
    if (!loaded) throw new Error();
    if (window.tangerine.diskRecorder?.active && window.tangerine.diskRecorder.sourceName === 'This vine') { notify('Stop the disk recording before loading another setup.'); return; }
    if (audio.recording) await finishRecording();
    const wasPlaying = audio.playing;
    if (wasPlaying) await audio.pause();
    settings = loaded;
    const old = audio;
    audio = new TangerineAudio({ seed: settings.seed, engine: { ...settings.engine, key: { ...settings.engine.key }, salt: settings.salt }, layers: settings.layers, global: settings.global });
    audio.on(onVisual);
    audio.on(onThreadEnd);
    applyColourLimits();
    if (old.ctx) setTimeout(() => old.ctx.close(), 600);
    trail = []; marks = []; travelling = null;
    renderTrail();
    renderSolo();
    LAYER_IDS.forEach(renderLayer);
    renderControls();
    persist();
    if (wasPlaying) { await audio.start(); startedAt = performance.now(); }
    renderTransport();
    notify('Setup loaded: the same seed gives the same vine.');
  } catch {
    notify('This is not a Tangerine setup. Choose a file saved by Tangerine.');
  }
});

// ---------------------------------------------------------------- about

$('helpButton').addEventListener('click', () => $('about').showModal());
$('closeAbout').addEventListener('click', () => $('about').close());
$('aboutDone').addEventListener('click', () => $('about').close());

// ---------------------------------------------------------------- frame

function frame() {
  const seconds = elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  $('elapsed').textContent = time(seconds);
  if (settings.form.thread) {
    const p = audio.threadProgress;
    $('threadFill').style.width = p ? `${(100 * Math.max(0, currentStep()) / p.total).toFixed(2)}%` : '0%';
  }
  const heard = audio.heardSeconds;
  $('heardReadout').textContent = heard < 1 ? 'NOTHING YET' : heard >= KEEP_SECONDS - 1 ? 'LAST 20 MIN' : `${time(heard)} HEARD`;
  if (audio.recording && audio.recordingSeconds >= RECORD_LIMIT && !stopping) {
    // Half an hour of sound is about 350 MB in memory: the take is kept and the recording stops.
    stopping = true;
    finishRecording().then(() => { stopping = false; notify('Takes stop at 30 minutes. This one is kept, just below.'); renderTransport(); });
  }
  if (audio.recording) $('memoryRecordTime').textContent = time(audio.recordingSeconds);
  else if ($('memoryRecordTime').textContent !== '0:00' && !audio.recording) $('memoryRecordTime').textContent = '0:00';
  const positions = audio.engine.positions(currentStep());
  for (const id of SEQ_IDS) drawRing(id, positions[id]);
  for (const id of LAYER_IDS) if (!SEQ_IDS.includes(id)) drawRing(id, null, audio.engine.harmony);
  drawVine();
  drawHelix(performance.now() / 1000);
  requestAnimationFrame(frame);
}

// The fruit's segments are a double helix: two strands and their rungs, turning while the vine plays.
let helixPhase = 0;
let helixLast = 0;
function drawHelix(now) {
  const dt = Math.min(0.1, now - helixLast);
  helixLast = now;
  if (audio.playing) helixPhase += dt * 0.9;
  else if (helixPhase && $('helix').childElementCount) return;
  // Inside a disc of radius 20: the strands narrow towards the poles, like the segments of a fruit.
  const at = (i, offset) => {
    const y = 3 + 34 * i / 24;
    const half = Math.sqrt(Math.max(0, 400 - (y - 20) ** 2)) * 0.62;
    return [20 + half * Math.sin(i / 24 * Math.PI * 3 + helixPhase + offset), y];
  };
  const strand = (offset) => Array.from({ length: 25 }, (_, i) => at(i, offset).map((v) => v.toFixed(2)).join(',')).join(' ');
  let rungs = '';
  for (let i = 2; i < 24; i += 2) {
    const [x1, y] = at(i, 0);
    const [x2] = at(i, Math.PI);
    rungs += `<line x1="${x1.toFixed(2)}" y1="${y.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#14100c" stroke-width="1" opacity=".38"/>`;
  }
  $('helix').innerHTML = `${rungs}<polyline points="${strand(0)}" fill="none" stroke="#14100c" stroke-width="1.6" stroke-linecap="round" opacity=".7"/><polyline points="${strand(Math.PI)}" fill="none" stroke="#fff3df" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>`;
}

// ---------------------------------------------------------------- colours (Tangerine II)
//
// A colour picks each layer's sound (samples when installed, synths otherwise),
// a real reverberation for the vast room, and suggests reverb and tempo.

function soundOptions(id) {
  return Object.entries(SOUNDS[id]).filter(([, sound]) => !sound.sample || BANK.has(sound.sample))
    .map(([value, sound]) => `<option value="${value}">${sound.label}</option>`).join('');
}
function applyColourLimits() {
  const name = settings.colour;
  const pools = Object.fromEntries(LAYER_IDS.map((id) => [id, colourPool(name, id, SOUNDS)]).filter(([, pool]) => pool));
  audio.setColour({ pools: Object.keys(pools).length ? pools : null, space: colourSpace(name) });
}
function renderColour() {
  const colour = COLOURS[settings.colour];
  $('colour').value = settings.colour;
  $('colourReadout').textContent = colour.label.split(' · ')[0].toUpperCase();
  const missing = LAYER_IDS.filter((id) => (colour.layers[id] || []).some((n) => n.startsWith('s:')) && !colourSound(settings.colour, id, SOUNDS)?.startsWith('s:'));
  const samples = BANK.status === 'loading' ? 'Looking for samples…' : BANK.message;
  $('colourNote').textContent = `${colour.note} ${samples}${missing.length && settings.colour !== 'synth' ? ` Synthesized for now: ${missing.map((id) => cards[id].def.name).join(', ')}.` : ''}`;
}
function applyColour(name) {
  settings.colour = name;
  const colour = COLOURS[name];
  for (const id of LAYER_IDS) {
    const sound = colourSound(name, id, SOUNDS) || (name === 'synth' ? DEFAULT_LAYERS[id].sound : null);
    if (sound && sound !== settings.layers[id].sound) { settings.layers[id].sound = sound; audio.setLayer(id, { sound }); }
  }
  if (colour.global) { Object.assign(settings.global, colour.global); audio.setGlobal(colour.global); }
  applyColourLimits();
  LAYER_IDS.forEach(renderLayer);
  renderControls();
  syncThreadLength();
  renderColour();
  persist();
}
$('colour').innerHTML = Object.entries(COLOURS).map(([value, c]) => `<option value="${value}">${c.label}</option>`).join('');
$('colour').addEventListener('change', (e) => { applyColour(e.target.value); notify(`Colour: ${COLOURS[e.target.value].label}.`); });

LAYER_IDS.forEach(renderLayer);
renderControls();
renderColour();
BANK.load().then(() => {
  for (const inst of Object.values(BANK.instruments)) for (const id of LAYER_IDS) SOUNDS[id][sampledKey(inst.name)] = sampledSound(inst);
  for (const id of LAYER_IDS) {
    const select = cards[id].card.querySelector('[data-field="sound"]');
    select.innerHTML = soundOptions(id);
    // A saved sampled sound whose folder is gone: back to the layer's usual sound.
    if (!select.querySelector(`option[value="${CSS.escape(settings.layers[id].sound)}"]`)) { settings.layers[id].sound = DEFAULT_LAYERS[id].sound; audio.setLayer(id, { sound: settings.layers[id].sound }); }
  }
  applyColourLimits();
  LAYER_IDS.forEach(renderLayer);
  renderColour();
});
renderKeyReadout();
renderSolo();
requestAnimationFrame(frame);
window.tangerine = { get audio() { return audio; }, get settings() { return settings; } };

const studio = initStudio({ getAudio: () => audio, notify });
window.tangerine.diskRecorder = studio.recorder;
