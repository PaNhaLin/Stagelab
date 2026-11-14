import { Engine } from './engine.js';
import { MidiInput } from './midi.js';
import { CATEGORIES, PRESETS, PRESET_BY_ID } from './presets.js';
import { PARAMS, DEFAULT_PARAMS, DEFAULT_GLOBALS, toNorm, fromNorm, formatParam } from './params.js';

const STORE_KEY = 'keystage:v1';
const PART_KEYS = ['tone', 'attack', 'release', 'motion'];
const FX_KEYS = ['reverb', 'size', 'delay', 'time', 'feedback'];
const DEFAULT_MAPPINGS = { 'cc:7': 'param:volume', 'cc:74': 'param:tone', 'cc:91': 'param:reverb' };
const KB_LO = 36;
const KB_HI = 96;
const COMPUTER_KEYS = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

// ------------------------------------------------------------------ state

function loadState() {
  const base = {
    presetId: PRESETS[0].id,
    lastInCat: {},
    overrides: {},
    globals: { ...DEFAULT_GLOBALS },
    layer: { on: false, presetId: 'warm-strings', oct: 0 },
    key: { root: 0, mode: 'major', transpose: true, lock: false },
    mappings: { ...DEFAULT_MAPPINGS },
    midiInput: 'all',
    midiChannel: 0,
    octave: 0,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      Object.assign(base, saved, {
        globals: { ...base.globals, ...saved.globals },
        layer: { ...base.layer, ...saved.layer },
        key: { ...base.key, ...saved.key },
      });
    }
  } catch (e) {
    /* storage unavailable: run with defaults */
  }
  if (!PRESET_BY_ID[base.presetId]) base.presetId = PRESETS[0].id;
  if (!PRESET_BY_ID[base.layer.presetId]) base.layer.presetId = 'warm-strings';
  return base;
}

const state = loadState();
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }, 300);
}

const engine = new Engine();
const midi = new MidiInput({
  noteOn: onMidiNoteOn,
  noteOff: onMidiNoteOff,
  cc: onMidiCC,
  bend: (v) => forParts((p) => p.setBend(v * 200)),
  program: (n) => PRESETS[n] && selectPreset(PRESETS[n].id),
  activity: flashMidiLed,
  devices: renderMidiDevices,
});

const presetParams = (id) => ({ ...DEFAULT_PARAMS, ...PRESET_BY_ID[id].params, ...(state.overrides[id] || {}) });
const factoryParams = (id) => ({ ...DEFAULT_PARAMS, ...PRESET_BY_ID[id].params });
const currentPreset = () => PRESET_BY_ID[state.presetId];
const paramValue = (name) => (PARAMS[name].scope === 'global' ? state.globals[name] : presetParams(state.presetId)[name]);

function forParts(fn) {
  if (!engine.started) return;
  fn(engine.parts.main);
  fn(engine.parts.layer);
}

// ------------------------------------------------------------------ params

function setParam(name, value) {
  const d = PARAMS[name];
  value = clamp(value, d.min, d.max);
  if (d.scope === 'global') {
    state.globals[name] = value;
    if (name === 'volume') engine.setVolume(value);
    if (name === 'layer') applyLayerLevel();
  } else {
    (state.overrides[state.presetId] ||= {})[name] = value;
    if (engine.started) {
      if (d.scope === 'part') engine.parts.main.setParam(name, value);
      else engine.setFx(name, value);
    }
  }
  updateKnob(name);
  if (name === 'time' || name === 'layer') updateLcd();
  save();
}

function applyMain() {
  const preset = currentPreset();
  const p = presetParams(preset.id);
  if (engine.started) {
    engine.parts.main.setPreset(preset, pick(p, PART_KEYS));
    for (const k of FX_KEYS) engine.setFx(k, p[k]);
  }
  for (const name of Object.keys(PARAMS)) updateKnob(name);
  renderCategories();
  renderPresets();
  updateLcd();
}

function applyLayer() {
  const { on, presetId, oct } = state.layer;
  $('#layerBtn').setAttribute('aria-pressed', String(on));
  $('#layerSelect').value = presetId;
  $$('[data-layer-oct]').forEach((b) => b.classList.toggle('active', Number(b.dataset.layerOct) === oct));
  if (engine.started) {
    const part = engine.parts.layer;
    if (on) {
      part.octave = oct;
      part.setPreset(PRESET_BY_ID[presetId], pick(factoryParams(presetId), PART_KEYS));
    } else {
      part.allNotesOff(false);
    }
    applyLayerLevel();
  }
  updateLcd();
}

function applyLayerLevel() {
  if (engine.started) engine.parts.layer.setLevel(state.layer.on ? state.globals.layer * 1.2 : 0);
}

// ------------------------------------------------------------------ selection

function selectPreset(id) {
  const preset = PRESET_BY_ID[id];
  if (!preset) return;
  state.presetId = id;
  state.lastInCat[preset.cat] = id;
  applyMain();
  save();
}

function selectCategory(cat) {
  const id = state.lastInCat[cat] || PRESETS.find((p) => p.cat === cat).id;
  selectPreset(id);
}

function stepPreset(dir) {
  const i = PRESETS.findIndex((p) => p.id === state.presetId);
  selectPreset(PRESETS[(i + dir + PRESETS.length) % PRESETS.length].id);
}

function stepCategory(dir) {
  const i = CATEGORIES.findIndex((c) => c.id === currentPreset().cat);
  selectCategory(CATEGORIES[(i + dir + CATEGORIES.length) % CATEGORIES.length].id);
}

function toggleLayer(force) {
  state.layer.on = force ?? !state.layer.on;
  applyLayer();
  save();
}

let taps = [];
function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  taps = taps.slice(-5);
  if (taps.length >= 2) {
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setParam('time', avg / 1000);
  }
  const btn = $('#tapBtn');
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 90);
}

function panic() {
  engine.panic();
  held.clear();
  keyCounts.clear();
  $$('.key.down').forEach((k) => k.classList.remove('down'));
  sustainLatch = false;
  setSustain(false);
  toast('All sound stopped');
}

const ACTIONS = {
  'prev-preset': () => stepPreset(-1),
  'next-preset': () => stepPreset(1),
  'prev-cat': () => stepCategory(-1),
  'next-cat': () => stepCategory(1),
  tap: tapTempo,
  layer: () => toggleLayer(),
  sustain: () => toggleSustainLatch(),
  'key-up': () => setKey({ root: (state.key.root + 1) % 12 }),
  'key-down': () => setKey({ root: (state.key.root + 11) % 12 }),
  transpose: () => setKey({ transpose: !state.key.transpose }),
  'scale-lock': () => setKey({ lock: !state.key.lock }),
  panic,
};

function runTarget(target) {
  const [kind, id] = target.split(':');
  if (kind === 'action') ACTIONS[id]?.();
  else if (kind === 'preset') selectPreset(id);
  else if (kind === 'cat') selectCategory(id);
}

// ------------------------------------------------------------------ notes

const held = new Map(); // "source:key" -> transposed note sent to the parts
const keyCounts = new Map(); // key -> how many sources hold it (for the on-screen keyboard)

function noteOn(key, vel, src) {
  if (!engine.started) return;
  const id = src + ':' + key;
  if (held.has(id)) noteOff(key, src);
  const sent = lockToScale(key) + keyShift() + 12 * state.octave;
  if (sent < 0 || sent > 127) return;
  held.set(id, sent);
  engine.parts.main.noteOn(sent, vel);
  if (state.layer.on) engine.parts.layer.noteOn(sent, vel);
  markKey(key, 1);
}

function noteOff(key, src) {
  const id = src + ':' + key;
  if (!held.has(id)) return;
  const sent = held.get(id);
  held.delete(id);
  engine.parts.main.noteOff(sent);
  engine.parts.layer.noteOff(sent);
  markKey(key, -1);
}

function markKey(key, delta) {
  const n = Math.max(0, (keyCounts.get(key) || 0) + delta);
  keyCounts.set(key, n);
  const el = keyEls.get(key);
  if (el) el.classList.toggle('down', n > 0);
}

// Sustain comes from two places: the pedal / Space key (held) and the on-screen button (latched).
// Notes are held while either one is on.
let sustainPedal = false;
let sustainLatch = false;
function applySustain() {
  const on = sustainPedal || sustainLatch;
  forParts((p) => p.setSustain(on));
  $('#lcdSus').classList.toggle('on', on);
  $('#sustainBtn').setAttribute('aria-pressed', String(sustainLatch));
}

function setSustain(on) {
  sustainPedal = on;
  applySustain();
}

function toggleSustainLatch(force) {
  sustainLatch = force ?? !sustainLatch;
  applySustain();
}

// ------------------------------------------------------------------ key and scale

const NOTE_NAMES = ['C', 'C♯/D♭', 'D', 'E♭', 'E', 'F', 'F♯/G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const SHORT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

// Transpose: you play C major (or A minor) shapes and hear the chosen key.
// The shift is kept within -6..+5 semitones so the keyboard never jumps far.
function keyShift() {
  const k = state.key;
  if (!k.transpose) return 0;
  const s = k.mode === 'major' ? k.root : k.root - 9;
  return ((((s + 6) % 12) + 12) % 12) - 6;
}

// The tonic and scale of the keys you physically play. With Transpose on that is
// always C major / A minor; with it off it is the chosen key itself.
function playedTonic() {
  const k = state.key;
  if (k.transpose) return k.mode === 'major' ? 0 : 9;
  return k.root;
}

function playedScale() {
  const t = playedTonic();
  return SCALES[state.key.mode].map((i) => (t + i) % 12);
}

// Scale lock: a note outside the key moves down a semitone to the nearest note in it.
// (In major and natural minor scales both neighbours of an outside note are in the scale.)
function lockToScale(n) {
  if (!state.key.lock) return n;
  const pcs = playedScale();
  return pcs.includes(((n % 12) + 12) % 12) ? n : n - 1;
}

// Notes already held keep the pitch they started with; their note-off uses that same pitch.
function setKey(changes) {
  Object.assign(state.key, changes);
  renderKey();
  save();
}

function keyLabel() {
  const k = state.key;
  return SHORT_NAMES[k.root] + (k.mode === 'minor' ? 'm' : '');
}

function renderKey() {
  const k = state.key;
  $('#keyRoot').value = String(k.root);
  $$('[data-key-mode]').forEach((b) => b.classList.toggle('active', b.dataset.keyMode === k.mode));
  $('#transposeBtn').setAttribute('aria-pressed', String(k.transpose));
  $('#lockBtn').setAttribute('aria-pressed', String(k.lock));
  const pcs = playedScale();
  const tonic = playedTonic();
  for (const [n, el] of keyEls) {
    el.classList.toggle('in-scale', pcs.includes(n % 12) && n % 12 !== tonic);
    el.classList.toggle('scale-root', n % 12 === tonic);
  }
  updateLcd();
}

function setOctave(o) {
  state.octave = clamp(o, -3, 3);
  updateLcd();
  save();
}

// ------------------------------------------------------------------ MIDI

let learning = false;
let armed = null; // { target, el }
const lastCC = {};

function onMidiNoteOn(note, vel) {
  if (learning && armed) {
    if (armed.target.startsWith('param:')) {
      toast('Knobs need a knob or fader (CC), not a key');
      return;
    }
    return assignMapping('note:' + note);
  }
  const mapped = state.mappings['note:' + note];
  if (mapped) return runTarget(mapped);
  noteOn(note, vel, 'midi');
}

function onMidiNoteOff(note) {
  if (state.mappings['note:' + note]) return;
  noteOff(note, 'midi');
}

function onMidiCC(cc, val) {
  if (learning && armed) {
    // ignore the "release" message of a button so it does not steal the mapping
    if (!armed.target.startsWith('param:') && val === 0) return;
    return assignMapping('cc:' + cc);
  }
  const mapped = state.mappings['cc:' + cc];
  if (mapped) {
    const norm = val / 127;
    if (mapped.startsWith('param:')) {
      const name = mapped.slice(6);
      setParam(name, fromNorm(name, norm));
    } else {
      // buttons fire once when the control crosses the middle going up
      const prev = lastCC[cc] ?? 0;
      if (norm >= 0.5 && prev < 0.5) runTarget(mapped);
    }
    lastCC[cc] = norm;
    return;
  }
  switch (cc) {
    case 1:
      forParts((p) => p.setMod(val / 127));
      break;
    case 11:
      engine.setExpression(val / 127);
      break;
    case 64:
      setSustain(val >= 64);
      break;
    case 120:
      panic();
      break;
    case 123:
      forParts((p) => p.allNotesOff(false));
      break;
  }
}

async function initMidi() {
  const status = $('#midiStatus');
  if (!midi.supported) {
    status.textContent = 'MIDI needs Chrome or Edge';
    return;
  }
  try {
    midi.channel = state.midiChannel;
    midi.selected = state.midiInput;
    await midi.init();
  } catch (e) {
    status.textContent = 'MIDI blocked';
    toast('MIDI access was blocked. Allow it in the browser’s site settings to use a keyboard.');
  }
}

function renderMidiDevices(list) {
  const sel = $('#midiInput');
  sel.innerHTML = '<option value="all">All MIDI inputs</option>';
  for (const d of list) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    sel.appendChild(o);
  }
  if (state.midiInput !== 'all' && !list.some((d) => d.id === state.midiInput)) {
    // device unplugged: fall back to all inputs for now, keep the saved choice
    sel.value = 'all';
    midi.select('all');
  } else {
    sel.value = state.midiInput;
  }
  $('#midiStatus').textContent = list.length ? `${list.length} device${list.length > 1 ? 's' : ''}` : 'No MIDI device';
}

let ledTimer;
function flashMidiLed() {
  const led = $('#midiLed');
  led.classList.add('on');
  clearTimeout(ledTimer);
  ledTimer = setTimeout(() => led.classList.remove('on'), 70);
}

// ------------------------------------------------------------------ MIDI learn

function setLearning(on) {
  learning = on;
  document.body.classList.toggle('learning', on);
  $('#learnBtn').setAttribute('aria-pressed', String(on));
  $('#clearMapsBtn').hidden = !on;
  disarm();
  $('#learnHint').textContent = on ? 'Click a knob or button, then move a knob or press a button on your controller.' : '';
}

function arm(target, el) {
  disarm();
  armed = { target, el };
  el.classList.add('armed');
  $('#learnHint').textContent = `Waiting for MIDI for “${targetLabel(target)}”…`;
  $('#unmapBtn').hidden = !Object.values(state.mappings).includes(target);
}

function disarm() {
  if (armed) armed.el.classList.remove('armed');
  armed = null;
  $('#unmapBtn').hidden = true;
}

function assignMapping(source) {
  const target = armed.target;
  for (const [k, v] of Object.entries(state.mappings)) if (v === target) delete state.mappings[k];
  state.mappings[source] = target;
  toast(`${sourceLabel(source)} → ${targetLabel(target)}`);
  disarm();
  $('#learnHint').textContent = 'Mapped. Click another control, or turn MIDI Learn off.';
  renderMapBadges();
  save();
}

function sourceLabel(source) {
  const [kind, n] = source.split(':');
  return kind === 'cc' ? `CC ${n}` : `Note ${n}`;
}

function targetLabel(target) {
  const [kind, id] = target.split(':');
  if (kind === 'param') {
    const d = PARAMS[id];
    return d.group === 'sound' || d.group === 'master' ? d.label : `${d.group[0].toUpperCase() + d.group.slice(1)} ${d.label}`;
  }
  if (kind === 'preset') return PRESET_BY_ID[id].name;
  if (kind === 'cat') return CATEGORIES.find((c) => c.id === id).label + ' bank';
  return { 'prev-preset': 'Previous sound', 'next-preset': 'Next sound', 'prev-cat': 'Previous bank', 'next-cat': 'Next bank', tap: 'Tap tempo', layer: 'Layer on/off', panic: 'Panic', sustain: 'Sustain on/off', 'key-up': 'Key up', 'key-down': 'Key down', transpose: 'Transpose on/off', 'scale-lock': 'Scale lock on/off' }[id] || id;
}

function renderMapBadges() {
  const byTarget = {};
  for (const [src, tgt] of Object.entries(state.mappings)) {
    const [kind, n] = src.split(':');
    byTarget[tgt] = (kind === 'cc' ? 'CC' : 'N') + n;
  }
  $$('[data-learn]').forEach((el) => {
    const m = byTarget[el.dataset.learn];
    if (m) el.dataset.map = m;
    else delete el.dataset.map;
  });
}

// ------------------------------------------------------------------ UI: categories + presets

function renderCategories() {
  const wrap = $('#categories');
  if (!wrap.children.length) {
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'cat';
      b.textContent = c.label;
      b.dataset.cat = c.id;
      b.dataset.learn = 'cat:' + c.id;
      b.addEventListener('click', () => selectCategory(c.id));
      wrap.appendChild(b);
    }
  }
  const cat = currentPreset().cat;
  for (const b of wrap.children) {
    const on = b.dataset.cat === cat;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
  renderMapBadges();
}

let renderedCat = null;
function renderPresets() {
  const wrap = $('#presets');
  const cat = currentPreset().cat;
  if (renderedCat !== cat) {
    renderedCat = cat;
    wrap.innerHTML = '';
    PRESETS.forEach((p, i) => {
      if (p.cat !== cat) return;
      const b = document.createElement('button');
      b.className = 'preset';
      b.dataset.id = p.id;
      b.dataset.learn = 'preset:' + p.id;
      b.innerHTML = `<span class="num">P-${String(i + 1).padStart(2, '0')}</span><span class="name"></span><span class="tag"></span>`;
      b.querySelector('.name').textContent = p.name;
      b.querySelector('.tag').textContent =
        p.engine === 'sample' ? 'Recorded piano' : p.voice.mono ? 'Mono · glide' : p.engine === 'organ' ? 'Mod wheel: rotary speed' : '';
      b.addEventListener('click', () => selectPreset(p.id));
      wrap.appendChild(b);
    });
  }
  for (const b of wrap.children) {
    const on = b.dataset.id === state.presetId;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
  renderMapBadges();
}

function renderLayerSelect() {
  const sel = $('#layerSelect');
  for (const c of CATEGORIES) {
    const g = document.createElement('optgroup');
    g.label = c.label;
    for (const p of PRESETS.filter((x) => x.cat === c.id)) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
}

function updateLcd() {
  const p = currentPreset();
  const idx = PRESETS.indexOf(p);
  $('#lcdCat').textContent = CATEGORIES.find((c) => c.id === p.cat).label.toUpperCase();
  $('#lcdNum').textContent = 'P-' + String(idx + 1).padStart(2, '0');
  $('#lcdName').textContent = p.name;
  const L = state.layer;
  $('#lcdLayer').textContent = L.on
    ? `+ ${PRESET_BY_ID[L.presetId].name}${L.oct ? (L.oct > 0 ? ' +1 oct' : ' −1 oct') : ''} · ${Math.round(state.globals.layer * 100)}%`
    : 'Layer off';
  $('#lcdBpm').textContent = Math.round(60 / paramValue('time')) + ' BPM';
  $('#lcdOct').textContent = 'OCT ' + (state.octave > 0 ? '+' : '') + state.octave;
  const shift = keyShift();
  $('#lcdKey').textContent =
    'KEY ' + keyLabel() + (shift ? ` (${shift > 0 ? '+' : ''}${shift})` : '') + (state.key.lock ? ' LOCK' : '');
}

// ------------------------------------------------------------------ UI: knobs

const knobs = {};
const R = 22;
const C = 2 * Math.PI * R;

function buildKnobs() {
  for (const [name, d] of Object.entries(PARAMS)) {
    const container = $(`.group[data-group="${d.group}"] .knobs`);
    const wrap = document.createElement('div');
    wrap.className = 'knob-wrap';
    wrap.dataset.learn = 'param:' + name;
    const id = 'knob-' + name;
    wrap.innerHTML = `
      <div class="knob" id="${id}" tabindex="0" role="slider" aria-label="${targetLabel('param:' + name)}" aria-valuemin="0" aria-valuemax="100">
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <circle class="track" cx="30" cy="30" r="${R}" fill="none" stroke-width="5" stroke-linecap="round"
            stroke-dasharray="${0.75 * C} ${C}" transform="rotate(135 30 30)"/>
          <circle class="value-arc" cx="30" cy="30" r="${R}" fill="none" stroke-width="5" stroke-linecap="round"
            stroke-dasharray="0 ${C}" transform="rotate(135 30 30)"/>
          <circle class="cap" cx="30" cy="30" r="16" stroke-width="1"/>
          <line class="pointer" x1="30" y1="30" x2="30" y2="17" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="knob-label">${d.label}</span>
      <span class="knob-value"></span>`;
    container.appendChild(wrap);
    const el = wrap.querySelector('.knob');
    knobs[name] = { el, arc: wrap.querySelector('.value-arc'), pointer: wrap.querySelector('.pointer'), value: wrap.querySelector('.knob-value') };
    attachKnob(name, el);
  }
}

function attachKnob(name, el) {
  let startY = 0;
  let startN = 0;
  const setNorm = (n) => setParam(name, fromNorm(name, clamp(n, 0, 1)));
  el.addEventListener('pointerdown', (e) => {
    if (learning) return;
    el.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startN = toNorm(name, paramValue(name));
    el.focus();
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    const range = e.shiftKey ? 800 : 200;
    setNorm(startN + (startY - e.clientY) / range);
  });
  el.addEventListener('dblclick', () => {
    if (learning) return;
    const d = PARAMS[name];
    setParam(name, d.scope === 'global' ? DEFAULT_GLOBALS[name] : factoryParams(state.presetId)[name]);
  });
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setNorm(toNorm(name, paramValue(name)) - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.025));
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    const n = toNorm(name, paramValue(name));
    const steps = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 };
    if (e.key in steps) setNorm(n + steps[e.key]);
    else if (e.key === 'Home') setNorm(0);
    else if (e.key === 'End') setNorm(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
}

function updateKnob(name) {
  const k = knobs[name];
  if (!k) return;
  const v = paramValue(name);
  const n = toNorm(name, v);
  k.arc.setAttribute('stroke-dasharray', `${0.75 * C * n} ${C}`);
  k.pointer.setAttribute('transform', `rotate(${-135 + 270 * n} 30 30)`);
  const text = formatParam(name, v);
  k.value.textContent = text;
  k.el.setAttribute('aria-valuenow', String(Math.round(n * 100)));
  k.el.setAttribute('aria-valuetext', text);
}

// ------------------------------------------------------------------ UI: keyboard

const keyEls = new Map();
const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);

function buildKeyboard() {
  const kb = $('#keyboard');
  const whites = [];
  for (let n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push(n);
  const w = 100 / whites.length;
  let wi = 0;
  for (let n = KB_LO; n <= KB_HI; n++) {
    const el = document.createElement('div');
    el.dataset.note = n;
    if (isBlack(n)) {
      el.className = 'key black';
      el.style.left = `${wi * w - w * 0.31}%`;
      el.style.width = `${w * 0.62}%`;
    } else {
      el.className = 'key white';
      el.style.left = `${wi * w}%`;
      el.style.width = `${w}%`;
      if (n % 12 === 0) el.innerHTML = `<span class="c-label">C${n / 12 - 1}</span>`;
      wi++;
    }
    kb.appendChild(el);
    keyEls.set(n, el);
  }

  const pointers = new Map();
  const keyAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key');
    return el && kb.contains(el) ? el : null;
  };
  const velAt = (e, el) => {
    const r = el.getBoundingClientRect();
    return clamp(0.35 + 0.65 * ((e.clientY - r.top) / r.height), 0.2, 1);
  };
  kb.addEventListener('pointerdown', (e) => {
    const el = keyAt(e);
    if (!el) return;
    e.preventDefault();
    kb.setPointerCapture(e.pointerId);
    const n = Number(el.dataset.note);
    pointers.set(e.pointerId, n);
    noteOn(n, velAt(e, el), 'p' + e.pointerId);
  });
  kb.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const el = keyAt(e);
    const prev = pointers.get(e.pointerId);
    const n = el ? Number(el.dataset.note) : null;
    if (n === prev) return;
    noteOff(prev, 'p' + e.pointerId);
    pointers.set(e.pointerId, n);
    if (n !== null) noteOn(n, velAt(e, el), 'p' + e.pointerId);
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const n = pointers.get(e.pointerId);
    if (n !== null) noteOff(n, 'p' + e.pointerId);
    pointers.delete(e.pointerId);
  };
  kb.addEventListener('pointerup', end);
  kb.addEventListener('pointercancel', end);
}

// ------------------------------------------------------------------ computer keyboard

function bindComputerKeys() {
  const typing = (e) => e.target.closest?.('select, input, textarea') || e.ctrlKey || e.metaKey || e.altKey;
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'Escape') {
      if (learning) setLearning(false);
      else panic();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) setSustain(true);
      return;
    }
    if (e.code in COMPUTER_KEYS) {
      e.preventDefault();
      if (!e.repeat) noteOn(60 + COMPUTER_KEYS[e.code], 0.8, 'qwerty');
      return;
    }
    if (e.repeat) return;
    const nav = {
      ArrowLeft: () => stepPreset(-1),
      ArrowRight: () => stepPreset(1),
      ArrowUp: () => stepCategory(-1),
      ArrowDown: () => stepCategory(1),
      KeyZ: () => setOctave(state.octave - 1),
      KeyX: () => setOctave(state.octave + 1),
      KeyB: tapTempo,
      KeyM: () => toggleLayer(),
      Comma: ACTIONS['key-down'],
      Period: ACTIONS['key-up'],
      Backslash: () => toggleSustainLatch(),
    };
    if (e.code in nav) {
      e.preventDefault();
      nav[e.code]();
    } else if (/^Digit[1-7]$/.test(e.code)) {
      selectCategory(CATEGORIES[Number(e.code.slice(5)) - 1].id);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      setSustain(false);
    } else if (e.code in COMPUTER_KEYS) {
      noteOff(60 + COMPUTER_KEYS[e.code], 'qwerty');
    }
  });
  // releasing everything if the window loses focus avoids stuck notes
  window.addEventListener('blur', () => {
    for (const id of [...held.keys()]) {
      const [src, key] = id.split(':');
      if (src === 'qwerty') noteOff(Number(key), src);
    }
  });
}

// ------------------------------------------------------------------ misc UI

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function meterLoop() {
  const peak = engine.peakLevel();
  const db = 20 * Math.log10(peak + 1e-6);
  $('#meterFill').style.width = `${clamp((db + 48) / 48, 0, 1) * 100}%`;
  $('#voiceCount').textContent = engine.voiceCount + ' v';
  requestAnimationFrame(meterLoop);
}

function bindUi() {
  $$('[data-action]').forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.action]()));
  $('#panicBtn').addEventListener('click', panic);
  $('#tapBtn').addEventListener('click', tapTempo);
  $('#sustainBtn').addEventListener('click', () => toggleSustainLatch());
  $('#transposeBtn').addEventListener('click', ACTIONS.transpose);
  $('#lockBtn').addEventListener('click', ACTIONS['scale-lock']);
  const keySel = $('#keyRoot');
  NOTE_NAMES.forEach((name, i) => keySel.insertAdjacentHTML('beforeend', `<option value="${i}">${name}</option>`));
  keySel.addEventListener('change', () => setKey({ root: Number(keySel.value) }));
  $$('[data-key-mode]').forEach((b) => b.addEventListener('click', () => setKey({ mode: b.dataset.keyMode })));
  $('#layerBtn').addEventListener('click', () => toggleLayer());
  $('#layerSelect').addEventListener('change', (e) => {
    state.layer.presetId = e.target.value;
    applyLayer();
    save();
  });
  $$('[data-layer-oct]').forEach((b) =>
    b.addEventListener('click', () => {
      state.layer.oct = Number(b.dataset.layerOct);
      applyLayer();
      save();
    }),
  );
  $('#resetSound').addEventListener('click', () => {
    delete state.overrides[state.presetId];
    applyMain();
    save();
    toast(`${currentPreset().name} restored`);
  });
  $('#octDown').addEventListener('click', () => setOctave(state.octave - 1));
  $('#octUp').addEventListener('click', () => setOctave(state.octave + 1));

  $('#learnBtn').addEventListener('click', () => setLearning(!learning));
  $('#unmapBtn').addEventListener('click', () => {
    if (!armed) return;
    for (const [k, v] of Object.entries(state.mappings)) if (v === armed.target) delete state.mappings[k];
    toast(`Mapping removed from ${targetLabel(armed.target)}`);
    disarm();
    renderMapBadges();
    save();
  });
  $('#clearMapsBtn').addEventListener('click', () => {
    state.mappings = {};
    renderMapBadges();
    save();
    toast('All MIDI mappings cleared');
  });
  // In learn mode, clicking a learnable control arms it instead of using it.
  document.addEventListener(
    'click',
    (e) => {
      if (!learning) return;
      const el = e.target.closest('[data-learn]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      arm(el.dataset.learn, el);
    },
    true,
  );

  const chSel = $('#midiChannel');
  for (let c = 1; c <= 16; c++) chSel.insertAdjacentHTML('beforeend', `<option value="${c}">Ch ${c}</option>`);
  chSel.value = String(state.midiChannel);
  chSel.addEventListener('change', () => {
    state.midiChannel = Number(chSel.value);
    midi.channel = state.midiChannel;
    save();
  });
  $('#midiInput').addEventListener('change', (e) => {
    state.midiInput = e.target.value;
    midi.select(state.midiInput);
    save();
  });

  $('#startBtn').addEventListener('click', start);
}

async function start() {
  const btn = $('#startBtn');
  btn.disabled = true;
  try {
    await engine.start();
  } catch (e) {
    btn.disabled = false;
    toast('Could not start audio: ' + e.message);
    return;
  }
  $('#start').classList.add('hidden');
  engine.setVolume(state.globals.volume);
  // the recorded piano is about 2 MB; start loading it straight away
  engine.listeners.add((event, name, err) => {
    if (event === 'samples-ready' && currentPreset().voice.set === name) toast('Recorded piano ready');
    if (event === 'samples-error') toast('Could not load the recorded piano; using the synthesized grand instead');
  });
  engine.loadSamples('piano');
  applyMain();
  applyLayer();
  meterLoop();
  initMidi();
}

// ------------------------------------------------------------------ boot

// The desktop app (Electron) is allowed to play sound without a click, so skip the start screen.
const isDesktop = /\bElectron\//.test(navigator.userAgent);
if (isDesktop) {
  document.documentElement.classList.add('desktop');
  $('#start').classList.add('hidden');
}

buildKnobs();
buildKeyboard();
renderLayerSelect();
bindUi();
bindComputerKeys();
applyMain();
applyLayer();
renderKey();
if (isDesktop) {
  // fall back to the start screen if audio could not start on its own
  start().then(() => {
    if (!engine.started) $('#start').classList.remove('hidden');
  });
}

// expose for debugging in the browser console
window.keystage = { engine, midi, state, selectPreset, noteOn, noteOff };
