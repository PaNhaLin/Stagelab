// Parameter definitions shared by the engine, the knobs and MIDI learn.
// scope: 'part'   -> belongs to the selected sound (saved per preset)
//        'fx'     -> reverb/delay settings (saved per preset, applied globally)
//        'global' -> not tied to a preset

export const PARAMS = {
  tone:     { label: 'Tone',     group: 'sound',  scope: 'part',   min: 200,   max: 20000, curve: 'exp', unit: 'hz' },
  attack:   { label: 'Attack',   group: 'sound',  scope: 'part',   min: 0.001, max: 4,     curve: 'exp', unit: 's' },
  release:  { label: 'Release',  group: 'sound',  scope: 'part',   min: 0.02,  max: 8,     curve: 'exp', unit: 's' },
  motion:   { label: 'Motion',   group: 'sound',  scope: 'part',   min: 0,     max: 1,     curve: 'lin', unit: '%' },
  reverb:   { label: 'Mix',      group: 'reverb', scope: 'fx',     min: 0,     max: 1,     curve: 'lin', unit: '%' },
  size:     { label: 'Size',     group: 'reverb', scope: 'fx',     min: 0.4,   max: 10,    curve: 'exp', unit: 's' },
  delay:    { label: 'Mix',      group: 'delay',  scope: 'fx',     min: 0,     max: 1,     curve: 'lin', unit: '%' },
  time:     { label: 'Time',     group: 'delay',  scope: 'fx',     min: 0.05,  max: 1.5,   curve: 'exp', unit: 'ms' },
  feedback: { label: 'Feedback', group: 'delay',  scope: 'fx',     min: 0,     max: 0.9,   curve: 'lin', unit: '%' },
  volume:   { label: 'Volume',   group: 'master', scope: 'global', min: 0,     max: 1,     curve: 'lin', unit: '%' },
  layer:    { label: 'Layer',    group: 'master', scope: 'global', min: 0,     max: 1,     curve: 'lin', unit: '%' },
};

export const DEFAULT_PARAMS = {
  tone: 20000, attack: 0.002, release: 0.3, motion: 0,
  reverb: 0.2, size: 2.5, delay: 0, time: 0.375, feedback: 0.3,
};

export const DEFAULT_GLOBALS = { volume: 0.8, layer: 0.5 };

export function toNorm(name, value) {
  const d = PARAMS[name];
  const v = Math.min(d.max, Math.max(d.min, value));
  if (d.curve === 'exp') return Math.log(v / d.min) / Math.log(d.max / d.min);
  return (v - d.min) / (d.max - d.min);
}

export function fromNorm(name, n) {
  const d = PARAMS[name];
  const x = Math.min(1, Math.max(0, n));
  if (d.curve === 'exp') return d.min * Math.pow(d.max / d.min, x);
  return d.min + (d.max - d.min) * x;
}

export function formatParam(name, value) {
  const d = PARAMS[name];
  switch (d.unit) {
    case 'hz':
      if (name === 'tone' && value >= 19500) return 'Open';
      return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : Math.round(value) + ' Hz';
    case 's':
      return value < 1 ? Math.round(value * 1000) + ' ms' : value.toFixed(1) + ' s';
    case 'ms':
      return Math.round(value * 1000) + ' ms';
    default:
      return Math.round(((value - d.min) / (d.max - d.min)) * 100) + '%';
  }
}
