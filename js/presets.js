// Factory sounds. Every sound is synthesized in real time with the Web Audio API,
// so there are no samples to download or license.
//
// engine: 'piano'  additive piano model (stacked partials, damped filter, hammer noise)
//         'fm'     two-operator FM electric piano with a short "tine" transient
//         'organ'  drawbar organ with percussion and key click
//         'osc'    subtractive synth (unison oscillators, filter envelope, optional formants)

export const CATEGORIES = [
  { id: 'piano', label: 'Piano' },
  { id: 'epiano', label: 'E.Piano' },
  { id: 'organ', label: 'Organ' },
  { id: 'pad', label: 'Pads' },
  { id: 'synth', label: 'Synth' },
  { id: 'lead', label: 'Lead' },
];

// partials: { count, rolloff (higher = darker), strike (hammer position along the string) }
export const PRESETS = [
  // ---------------- Piano ----------------
  {
    id: 'concert-grand', name: 'Concert Grand', cat: 'piano', engine: 'piano',
    voice: { partials: { count: 32, rolloff: 1.15, strike: 0.125 }, unison: [-1.5, 1.5], bright: 1.25, hammer: 0.35, decay: 7, body: 0.5, level: 0.32 },
    params: { release: 0.35, reverb: 0.22, size: 2.6 },
  },
  {
    id: 'stage-grand', name: 'Bright Stage Grand', cat: 'piano', engine: 'piano',
    voice: { partials: { count: 32, rolloff: 0.95, strike: 0.11 }, unison: [-2, 2], bright: 1.4, hammer: 0.5, decay: 6, body: 0.55, level: 0.45 },
    params: { release: 0.25, reverb: 0.16, size: 1.8 },
  },
  {
    id: 'felt-piano', name: 'Felt Piano', cat: 'piano', engine: 'piano',
    voice: { partials: { count: 16, rolloff: 1.7, strike: 0.14 }, unison: [-3, 3], bright: 0.7, hammer: 0.12, hammerFreq: 1.5, decay: 4.5, body: 0.6, level: 0.28 },
    params: { release: 0.6, reverb: 0.35, size: 4, tone: 6000 },
  },
  {
    id: 'upright', name: 'Upright Ballad', cat: 'piano', engine: 'piano',
    voice: { partials: { count: 28, rolloff: 1.05, strike: 0.16 }, unison: [-5, 0, 4.5], bright: 1.1, hammer: 0.4, decay: 4.5, body: 0.45, level: 0.32 },
    params: { release: 0.25, reverb: 0.18, size: 1.6 },
  },

  // ---------------- Electric piano ----------------
  {
    id: 'suitcase-ep', name: 'Suitcase EP', cat: 'epiano', engine: 'fm',
    voice: { ratio: 1, index: 1.9, indexSustain: 0.18, indexDecay: 0.45, tine: { ratio: 14, index: 0.6, decay: 0.035 }, decay: 5, body: 0.65, level: 0.18, motionMode: 'pan', motionRate: 4.2 },
    params: { release: 0.3, motion: 0.45, reverb: 0.2, size: 2 },
  },
  {
    id: 'tine-bell', name: 'Tine Bell EP', cat: 'epiano', engine: 'fm',
    voice: { ratio: 1, index: 1.3, indexSustain: 0.15, indexDecay: 0.4, tine: { ratio: 14, index: 1.6, decay: 0.09 }, decay: 5.5, body: 0.6, level: 0.27, motionMode: 'pan', motionRate: 3.2 },
    params: { release: 0.35, motion: 0.3, reverb: 0.26, size: 2.8, delay: 0.12, time: 0.42, feedback: 0.28 },
  },
  {
    id: 'reed-ep', name: 'Reed EP', cat: 'epiano', engine: 'fm',
    voice: { ratio: 1, index: 3.2, indexSustain: 0.4, indexDecay: 0.25, tine: { ratio: 3, index: 0.7, decay: 0.12 }, decay: 3.2, body: 0.7, level: 0.31, motionMode: 'amp', motionRate: 5.5 },
    params: { release: 0.18, motion: 0.25, reverb: 0.14, size: 1.5 },
  },
  {
    id: 'glass-ep', name: 'Glass FM EP', cat: 'epiano', engine: 'fm',
    voice: { ratio: 1, index: 1, indexSustain: 0.2, indexDecay: 0.6, tine: { ratio: 14, index: 2.6, decay: 0.15 }, decay: 6, body: 0.55, level: 0.27, motionMode: 'pan', motionRate: 0.7 },
    params: { release: 0.5, motion: 0.6, reverb: 0.3, size: 3.5, delay: 0.15, time: 0.5, feedback: 0.35 },
  },

  // ---------------- Organ ----------------
  {
    id: 'gospel-organ', name: 'Gospel Full', cat: 'organ', engine: 'organ',
    voice: { drawbars: [8, 8, 8, 8, 0, 0, 0, 0, 8], click: 0.5, perc: null, level: 0.32, motionMode: 'leslie' },
    params: { attack: 0.004, release: 0.04, motion: 0.7, reverb: 0.15, size: 1.8 },
  },
  {
    id: 'jazz-perc', name: 'Jazz Perc', cat: 'organ', engine: 'organ',
    voice: { drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0], click: 0.6, perc: { harm: 3, level: 0.24, decay: 0.25 }, level: 0.2, motionMode: 'leslie' },
    params: { attack: 0.003, release: 0.03, motion: 0.6, reverb: 0.12, size: 1.5 },
  },
  {
    id: 'soft-organ', name: 'Soft Worship Organ', cat: 'organ', engine: 'organ',
    voice: { drawbars: [0, 0, 8, 6, 0, 0, 0, 0, 0], click: 0.1, perc: null, level: 0.2, motionMode: 'leslie' },
    params: { attack: 0.06, release: 0.25, motion: 0.5, reverb: 0.3, size: 3 },
  },
  {
    id: 'church-pipe', name: 'Church Pipe', cat: 'organ', engine: 'organ',
    voice: { drawbars: [6, 0, 8, 7, 4, 5, 0, 3, 4], click: 0, perc: null, level: 0.2, motionMode: 'amp', motionRate: 5 },
    params: { attack: 0.09, release: 0.6, motion: 0, reverb: 0.45, size: 6 },
  },

  // ---------------- Pads ----------------
  {
    id: 'ambient-swell', name: 'Ambient Swell', cat: 'pad', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 4, spread: 16, gain: 1 }, { type: 'triangle', oct: -1, gain: 0.5 }],
      filter: { cutoff: 700, key: 0.4, q: 0.8, env: 1400, a: 1.6, d: 2.5, s: 0.5, vel: 0.3 },
      amp: { d: 1, s: 1 }, velSens: 0.3, level: 0.13, motionMode: 'pan', motionRate: 0.25,
    },
    params: { attack: 1.4, release: 3, motion: 0.4, reverb: 0.45, size: 6, delay: 0.15, time: 0.5, feedback: 0.4 },
  },
  {
    id: 'warm-strings', name: 'Warm Strings', cat: 'pad', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 5, spread: 22, gain: 1 }],
      filter: { cutoff: 1800, key: 0.6, q: 0.5, env: 1500, a: 0.5, d: 1.2, s: 0.6, vel: 0.6 },
      amp: { d: 1, s: 1 }, velSens: 0.6, level: 0.13, tilt: { lo: 2.2, hi: 1.6 }, motionMode: 'pan', motionRate: 0.18,
    },
    params: { attack: 0.35, release: 1.2, motion: 0.25, reverb: 0.35, size: 3.5, tone: 9000 },
  },
  {
    id: 'shimmer', name: 'Shimmer Pad', cat: 'pad', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 4, spread: 12, gain: 0.8 }, { type: 'sine', oct: 1, gain: 0.35 }, { type: 'triangle', oct: 1, semi: 7, gain: 0.18 }],
      filter: { cutoff: 2600, key: 0.3, q: 0.6, env: 2500, a: 2, d: 3, s: 0.7, vel: 0.2 },
      amp: { d: 1, s: 1 }, velSens: 0.25, level: 0.18, motionMode: 'pan', motionRate: 0.12,
    },
    params: { attack: 1.1, release: 4, motion: 0.5, reverb: 0.6, size: 9, delay: 0.22, time: 0.6, feedback: 0.5 },
  },
  {
    id: 'air-choir', name: 'Air Choir', cat: 'pad', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 3, spread: 14, gain: 1 }],
      formants: [700, 1150, 2800], formantQ: 4, formantBody: 0.22,
      filter: { cutoff: 5000, key: 0, q: 0.3, env: 0, a: 0.1, d: 1, s: 1, vel: 0 },
      amp: { d: 1, s: 1 }, velSens: 0.4, level: 0.4, tilt: { lo: 3 }, motionMode: 'amp', motionRate: 4.8,
    },
    params: { attack: 0.5, release: 1.8, motion: 0.12, reverb: 0.5, size: 5 },
  },
  {
    id: 'deep-pad', name: 'Cinematic Low', cat: 'pad', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 3, spread: 10, gain: 0.8 }, { type: 'sine', oct: -1, gain: 0.8 }],
      filter: { cutoff: 380, key: 0.3, q: 2, env: 700, a: 2.5, d: 3, s: 0.4, vel: 0.4 },
      amp: { d: 1, s: 1 }, velSens: 0.4, level: 0.12, motionMode: 'pan', motionRate: 0.1,
    },
    params: { attack: 1.8, release: 4, motion: 0.3, reverb: 0.5, size: 7 },
  },

  // ---------------- Synth ----------------
  {
    id: 'super-stack', name: 'Super Stack', cat: 'synth', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 7, spread: 34, gain: 1 }, { type: 'sawtooth', oct: -1, gain: 0.35 }],
      filter: { cutoff: 2200, key: 0.5, q: 0.6, env: 5000, a: 0.005, d: 0.6, s: 0.5, vel: 0.5 },
      amp: { d: 1, s: 1 }, velSens: 0.4, level: 0.15, tilt: { lo: 0.8, hi: 1.6 },
    },
    params: { attack: 0.005, release: 0.45, reverb: 0.28, size: 3, delay: 0.18, time: 0.375, feedback: 0.3 },
  },
  {
    id: 'analog-poly', name: 'Analog Poly', cat: 'synth', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 2, spread: 8, gain: 1 }, { type: 'square', oct: -1, gain: 0.3 }],
      filter: { cutoff: 600, key: 0.6, q: 3, env: 3500, a: 0.004, d: 0.35, s: 0.3, vel: 0.7 },
      amp: { d: 1.2, s: 0.8 }, velSens: 0.6, level: 0.21, motionMode: 'pan', motionRate: 0.6,
    },
    params: { attack: 0.004, release: 0.35, motion: 0.3, reverb: 0.2, size: 2.2 },
  },
  {
    id: 'pluck-keys', name: 'Pluck Keys', cat: 'synth', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 3, spread: 12, gain: 1 }, { type: 'sine', oct: 1, gain: 0.25 }],
      filter: { cutoff: 350, key: 0.7, q: 2.5, env: 7000, a: 0.002, d: 0.18, s: 0, vel: 0.8 },
      amp: { d: 0.9, s: 0 }, velSens: 0.7, level: 0.35,
    },
    params: { attack: 0.002, release: 0.4, reverb: 0.25, size: 2.5, delay: 0.25, time: 0.375, feedback: 0.38 },
  },
  {
    id: 'synth-brass', name: 'Synth Brass', cat: 'synth', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 3, spread: 10, gain: 1 }],
      filter: { cutoff: 500, key: 0.6, q: 1.2, env: 3200, a: 0.12, d: 0.6, s: 0.55, vel: 0.7 },
      amp: { d: 1, s: 0.9 }, velSens: 0.6, level: 0.28,
    },
    params: { attack: 0.03, release: 0.3, reverb: 0.22, size: 2.2 },
  },

  // ---------------- Lead ----------------
  {
    id: 'saw-lead', name: 'Saw Lead', cat: 'lead', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 2, spread: 9, gain: 1 }, { type: 'square', oct: -1, gain: 0.3 }],
      filter: { cutoff: 1400, key: 0.6, q: 1.8, env: 4000, a: 0.005, d: 0.4, s: 0.5, vel: 0.5 },
      amp: { d: 1, s: 1 }, velSens: 0.3, level: 0.37, mono: true, glide: 0.07,
    },
    params: { attack: 0.004, release: 0.2, reverb: 0.18, size: 2, delay: 0.22, time: 0.375, feedback: 0.32 },
  },
  {
    id: 'square-lead', name: 'Square Lead', cat: 'lead', engine: 'osc',
    voice: {
      oscs: [{ type: 'square', gain: 1 }, { type: 'square', detune: 7, gain: 0.5 }],
      filter: { cutoff: 1800, key: 0.5, q: 1, env: 2500, a: 0.005, d: 0.3, s: 0.6, vel: 0.4 },
      amp: { d: 1, s: 1 }, velSens: 0.3, level: 0.22, mono: true, glide: 0.05,
    },
    params: { attack: 0.004, release: 0.18, reverb: 0.15, size: 1.8, delay: 0.18, time: 0.3, feedback: 0.28 },
  },
  {
    id: 'soft-lead', name: 'Soft Sine Lead', cat: 'lead', engine: 'osc',
    voice: {
      oscs: [{ type: 'sine', gain: 1 }, { type: 'triangle', oct: 1, gain: 0.15 }],
      filter: { cutoff: 4000, key: 0.2, q: 0.5, env: 0, a: 0.01, d: 1, s: 1, vel: 0 },
      amp: { d: 1, s: 1 }, velSens: 0.5, level: 0.36, mono: true, glide: 0.1,
    },
    params: { attack: 0.03, release: 0.4, reverb: 0.35, size: 3.5, delay: 0.25, time: 0.45, feedback: 0.35 },
  },
  {
    id: 'bright-lead', name: 'Bright Stack Lead', cat: 'lead', engine: 'osc',
    voice: {
      oscs: [{ type: 'sawtooth', unison: 4, spread: 18, gain: 1 }, { type: 'sawtooth', oct: 1, gain: 0.25 }],
      filter: { cutoff: 3000, key: 0.4, q: 0.8, env: 4000, a: 0.005, d: 0.5, s: 0.7, vel: 0.4 },
      amp: { d: 1, s: 1 }, velSens: 0.3, level: 0.3, tilt: { hi: 1.3 }, mono: true, glide: 0.04,
    },
    params: { attack: 0.004, release: 0.25, reverb: 0.22, size: 2.4, delay: 0.2, time: 0.375, feedback: 0.3 },
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
