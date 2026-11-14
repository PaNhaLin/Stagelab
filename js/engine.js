// Keystage audio engine: two parts (main + layer) feeding a shared reverb/delay bus.
//
//  voices -> part.input -> tone (lowpass) -> trem (gain) -> pan -> level -> fxIn
//  fxIn -> dry ---------------------------------------------------------\
//  fxIn -> reverb send -> convolver ------------------------------------->  bus -> expression -> master -> limiter -> out
//  fxIn -> delay send -> ping-pong delay (filtered feedback) ------------/

const MAX_VOICES = 32;       // sounding (not releasing) voices per part
const MAX_TOTAL = 56;        // including voices in their release tail

export const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function holdAt(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

function smooth(param, value, ctx, tau = 0.02) {
  param.setTargetAtTime(value, ctx.currentTime, tau);
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.fx = {};
    this.listeners = new Set();
  }

  get started() {
    return !!this.ctx;
  }

  // Pass an OfflineAudioContext to render without real-time playback (used for level tests).
  async start(offlineCtx) {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = offlineCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };

    this.noise = this.makeNoise(2);
    this.fxIn = g(1);
    this.bus = g(1);

    // dry
    this.dry = g(1);
    this.fxIn.connect(this.dry).connect(this.bus);

    // reverb
    this.revSend = g(0);
    this.convolver = ctx.createConvolver();
    this.fxIn.connect(this.revSend).connect(this.convolver).connect(this.bus);
    this.reverbSize = 0;

    // ping-pong delay
    this.dlySend = g(0);
    this.dlyL = ctx.createDelay(2);
    this.dlyR = ctx.createDelay(2);
    this.dlyFiltL = ctx.createBiquadFilter();
    this.dlyFiltR = ctx.createBiquadFilter();
    for (const f of [this.dlyFiltL, this.dlyFiltR]) {
      f.type = 'lowpass';
      f.frequency.value = 4200;
      f.Q.value = 0.4;
    }
    this.dlyFb = g(0.3);
    const merger = ctx.createChannelMerger(2);
    this.fxIn.connect(this.dlySend).connect(this.dlyL);
    this.dlyL.connect(this.dlyFiltL);
    this.dlyFiltL.connect(this.dlyR);
    this.dlyR.connect(this.dlyFiltR);
    this.dlyFiltR.connect(this.dlyFb).connect(this.dlyL);
    this.dlyFiltL.connect(merger, 0, 0);
    this.dlyFiltR.connect(merger, 0, 1);
    this.dlyOut = g(0.9);
    merger.connect(this.dlyOut).connect(this.bus);
    // a little of the echoes into the reverb, so they sit in the same room
    this.dlyOut.connect(this.revSend);

    // master section
    this.expression = g(1);
    this.master = g(0.8);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.bus.connect(this.expression).connect(this.master).connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.limiter.connect(ctx.destination);

    this.parts = { main: new Part(this, 'main'), layer: new Part(this, 'layer') };
    this.setReverbSize(2.5, true);
    if (!offlineCtx && ctx.state !== 'running') await ctx.resume();
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Synthetic hall impulse: decaying stereo noise that darkens over time.
  setReverbSize(seconds, immediate = false) {
    if (Math.abs(seconds - this.reverbSize) < 0.05) return;
    this.reverbSize = seconds;
    clearTimeout(this._revTimer);
    const build = () => {
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * seconds);
      const pre = Math.floor(sr * 0.012);
      const buf = ctx.createBuffer(2, len + pre, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const env = Math.pow(1 - t, 2.2) * Math.exp(-3 * t);
          const k = 0.55 - 0.45 * t; // one-pole lowpass gets darker towards the tail
          lp += k * (Math.random() * 2 - 1 - lp);
          d[i + pre] = lp * env;
        }
      }
      // normalise so long and short rooms are roughly equally loud
      let sum = 0;
      const d0 = buf.getChannelData(0);
      for (let i = 0; i < d0.length; i++) sum += d0[i] * d0[i];
      const norm = 0.9 / Math.sqrt(sum / 20 + 1e-9);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) d[i] *= norm;
      }
      this.convolver.buffer = buf;
    };
    if (immediate) build();
    else this._revTimer = setTimeout(build, 120);
  }

  setFx(name, value) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.fx[name] = value;
    switch (name) {
      case 'reverb':
        smooth(this.revSend.gain, value * 1.1, ctx);
        break;
      case 'size':
        this.setReverbSize(value);
        break;
      case 'delay':
        smooth(this.dlySend.gain, value * 0.9, ctx);
        break;
      case 'time':
        smooth(this.dlyL.delayTime, value, ctx, 0.05);
        smooth(this.dlyR.delayTime, value, ctx, 0.05);
        break;
      case 'feedback':
        smooth(this.dlyFb.gain, value, ctx);
        break;
    }
  }

  setVolume(v) {
    if (this.ctx) smooth(this.master.gain, v * v * 1.2, this.ctx, 0.03);
  }

  setExpression(v) {
    if (this.ctx) smooth(this.expression.gain, v, this.ctx, 0.03);
  }

  panic() {
    if (!this.ctx) return;
    for (const p of Object.values(this.parts)) p.allNotesOff(true);
    // clear echo and reverb tails
    const t = this.ctx.currentTime;
    for (const gNode of [this.revSend, this.dlySend, this.dlyFb]) {
      const v = gNode.gain.value;
      gNode.gain.cancelScheduledValues(t);
      gNode.gain.setValueAtTime(0, t);
      gNode.gain.setValueAtTime(v, t + 0.6);
    }
  }

  get voiceCount() {
    if (!this.parts) return 0;
    return this.parts.main.activeCount + this.parts.layer.activeCount;
  }

  peakLevel() {
    if (!this.analyser) return 0;
    const buf = (this._meterBuf ||= new Float32Array(this.analyser.fftSize));
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    return peak;
  }
}

class Part {
  constructor(engine, name) {
    this.engine = engine;
    this.name = name;
    const ctx = (this.ctx = engine.ctx);
    this.input = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.tone.Q.value = 0.5;
    this.trem = ctx.createGain();
    this.pan = ctx.createStereoPanner();
    this.level = ctx.createGain();
    this.input.connect(this.tone).connect(this.trem).connect(this.pan).connect(this.level).connect(engine.fxIn);

    // motion LFO (tremolo / auto-pan / rotary)
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 4;
    this.tremDepth = ctx.createGain();
    this.tremDepth.gain.value = 0;
    this.panDepth = ctx.createGain();
    this.panDepth.gain.value = 0;
    this.lfo.connect(this.tremDepth).connect(this.trem.gain);
    this.lfo.connect(this.panDepth).connect(this.pan.pan);
    this.lfo.start();

    // pitch: bend (constant, in cents) + vibrato LFO, both summed into every oscillator's detune
    this.bend = ctx.createConstantSource();
    this.bend.offset.value = 0;
    this.bend.start();
    this.vibLfo = ctx.createOscillator();
    this.vibLfo.frequency.value = 5.6;
    this.vibDepth = ctx.createGain();
    this.vibDepth.gain.value = 0;
    this.vibLfo.connect(this.vibDepth);
    this.vibLfo.start();

    this.voices = [];
    this.sustain = false;
    this.preset = null;
    this.params = {};
    this.octave = 0;
    this.monoStack = [];
    this.monoVoice = null;
    this.modWheel = 0;
    this.waves = new Map();
  }

  get activeCount() {
    return this.voices.filter((v) => !v.releasing).length;
  }

  setPreset(preset, params) {
    if (this.preset && this.preset.id !== preset.id) this.allNotesOff(false);
    this.preset = preset;
    this.monoStack = [];
    this.monoVoice = null;
    for (const [k, v] of Object.entries(params)) this.setParam(k, v);
    this.applyMotion();
    this.setMod(this.modWheel);
  }

  setParam(name, value) {
    this.params[name] = value;
    const ctx = this.ctx;
    if (name === 'tone') smooth(this.tone.frequency, value, ctx, 0.03);
    if (name === 'motion') this.applyMotion();
  }

  setLevel(v) {
    smooth(this.level.gain, v, this.ctx, 0.03);
  }

  applyMotion() {
    if (!this.preset) return;
    const ctx = this.ctx;
    const depth = this.params.motion ?? 0;
    const mode = this.preset.voice.motionMode || 'amp';
    let amp = 0;
    let pan = 0;
    if (mode === 'amp') amp = depth * 0.5;
    else if (mode === 'pan') pan = depth * 0.85;
    else if (mode === 'leslie') {
      amp = depth * 0.22;
      pan = depth * 0.6;
    }
    smooth(this.trem.gain, 1 - amp, ctx, 0.05);
    smooth(this.tremDepth.gain, amp, ctx, 0.05);
    smooth(this.panDepth.gain, pan, ctx, 0.05);
    if (mode !== 'leslie') smooth(this.lfo.frequency, this.preset.voice.motionRate || 4, ctx, 0.05);
  }

  // Mod wheel: rotary speed for organs, vibrato for everything else.
  setMod(v) {
    this.modWheel = v;
    if (!this.preset) return;
    const ctx = this.ctx;
    if (this.preset.voice.motionMode === 'leslie') {
      smooth(this.vibDepth.gain, 0, ctx);
      // rotor spin-up / spin-down takes a moment, like the real thing
      smooth(this.lfo.frequency, v > 0.5 ? 6.6 : 0.8, ctx, v > 0.5 ? 0.6 : 1.1);
    } else {
      smooth(this.vibDepth.gain, v * 32, ctx, 0.05);
    }
  }

  setBend(cents) {
    smooth(this.bend.offset, cents, this.ctx, 0.008);
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      for (const v of [...this.voices]) {
        if (v.sustained && !v.keyDown) this.release(v);
      }
    }
  }

  wave(key, make) {
    if (!this.waves.has(key)) this.waves.set(key, make());
    return this.waves.get(key);
  }

  noteOn(key, vel) {
    if (!this.preset) return;
    if (this.preset.voice.mono) return this.monoOn(key, vel);
    const note = key + 12 * this.octave;
    if (note < 0 || note > 127) return;
    // re-striking a note: let the previous one fade quickly
    for (const v of this.voices) {
      if (v.note === note && !v.releasing) this.release(v, 0.12);
    }
    const sounding = this.voices.filter((v) => !v.releasing);
    if (sounding.length >= MAX_VOICES) this.release(sounding[0], 0.02);
    while (this.voices.length >= MAX_TOTAL) this.kill(this.voices[0]);
    const voice = this.build(note, vel);
    voice.key = key;
    voice.keyDown = true;
    this.voices.push(voice);
  }

  noteOff(key) {
    if (!this.preset) return;
    if (this.preset.voice.mono) return this.monoOff(key);
    for (const v of this.voices) {
      if (v.key === key && v.keyDown) {
        v.keyDown = false;
        if (this.sustain) v.sustained = true;
        else this.release(v);
      }
    }
  }

  monoOn(key, vel) {
    this.monoStack = this.monoStack.filter((k) => k !== key);
    this.monoStack.push(key);
    const note = key + 12 * this.octave;
    const mv = this.monoVoice;
    if (mv && !mv.releasing) {
      mv.setFreq(mtof(note), this.preset.voice.glide ?? 0.06);
      mv.note = note;
      mv.key = key;
      mv.keyDown = true;
      mv.sustained = false;
      return;
    }
    const voice = this.build(note, vel);
    voice.key = key;
    voice.keyDown = true;
    this.voices.push(voice);
    this.monoVoice = voice;
  }

  monoOff(key) {
    this.monoStack = this.monoStack.filter((k) => k !== key);
    const mv = this.monoVoice;
    if (!mv || mv.releasing || mv.key !== key) return;
    if (this.monoStack.length) {
      const back = this.monoStack[this.monoStack.length - 1];
      const note = back + 12 * this.octave;
      mv.setFreq(mtof(note), this.preset.voice.glide ?? 0.06);
      mv.note = note;
      mv.key = back;
    } else {
      mv.keyDown = false;
      if (this.sustain) mv.sustained = true;
      else this.release(mv);
    }
  }

  allNotesOff(hard) {
    this.monoStack = [];
    for (const v of [...this.voices]) {
      if (hard) this.kill(v);
      else this.release(v, 0.15);
    }
    if (hard) this.voices = [];
  }

  release(v, time) {
    if (v.releasing) return;
    v.releasing = true;
    if (v === this.monoVoice) this.monoVoice = null;
    const t = this.ctx.currentTime;
    const r = Math.max(0.01, time ?? this.params.release ?? 0.3);
    holdAt(v.amp.gain, t);
    v.amp.gain.setTargetAtTime(0, t, r / 4.5);
    v.stopAt(t + r * 1.3 + 0.05);
  }

  kill(v) {
    v.releasing = true;
    if (v === this.monoVoice) this.monoVoice = null;
    const t = this.ctx.currentTime;
    holdAt(v.amp.gain, t);
    v.amp.gain.setTargetAtTime(0, t, 0.004);
    v.stopAt(t + 0.03);
    this.voices = this.voices.filter((x) => x !== v);
  }

  build(note, vel) {
    const t = this.ctx.currentTime + 0.003;
    const f = mtof(note);
    const builders = { piano: buildPiano, fm: buildFM, organ: buildOrgan, osc: buildOsc };
    const parts = builders[this.preset.engine](this, note, f, vel, t);
    const voice = new Voice(this, note, parts);
    return voice;
  }
}

class Voice {
  constructor(part, note, { amp, out, sources, pitch, setFreq, maxDur }) {
    this.part = part;
    this.note = note;
    this.amp = amp;
    this.out = out;
    this.sources = sources;
    this.pitch = pitch;
    this.setFreq = setFreq || (() => {});
    this.releasing = false;
    this.sustained = false;
    this.keyDown = false;
    for (const p of pitch) {
      part.bend.connect(p);
      part.vibDepth.connect(p);
    }
    out.connect(part.input);
    sources[0].onended = () => this.cleanup();
    if (maxDur) this.stopAt(part.ctx.currentTime + maxDur);
  }

  stopAt(t) {
    for (const s of this.sources) {
      try {
        s.stop(t);
      } catch (e) {
        /* already stopped */
      }
    }
  }

  cleanup() {
    const part = this.part;
    for (const p of this.pitch) {
      try {
        part.bend.disconnect(p);
        part.vibDepth.disconnect(p);
      } catch (e) {
        /* already disconnected */
      }
    }
    try {
      this.out.disconnect();
    } catch (e) {
      /* ignore */
    }
    part.voices = part.voices.filter((v) => v !== this);
    if (part.monoVoice === this) part.monoVoice = null;
  }
}

// ---------------------------------------------------------------- builders

function velCurve(vel, sens = 1, exp = 1.4) {
  const v = Math.pow(clamp(vel, 0, 1), exp);
  return 1 - sens + sens * v;
}

function periodic(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

function noiseBurst(part, t, freq, q, level, decay, dest) {
  const ctx = part.ctx;
  const src = ctx.createBufferSource();
  src.buffer = part.engine.noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = clamp(freq, 80, 12000);
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.setTargetAtTime(0, t, decay);
  src.connect(bp).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + decay * 8 + 0.02);
  return src;
}

// Per-note level correction in dB per octave away from middle C, so sounds stay even across the keyboard.
function keyTilt(v, f) {
  const t = v.tilt;
  if (!t) return 1;
  const oct = Math.log2(f / 261.63);
  const db = oct < 0 ? -oct * (t.lo || 0) : oct * (t.hi || 0);
  return Math.pow(10, db / 20);
}

// String spectrum: 1/n^rolloff, with notches at multiples of the hammer strike position
// (a hammer at 1/8 of the string length barely excites harmonics 8, 16, 24...).
function stringPartials({ count = 32, rolloff = 1.1, strike = 0.125 }) {
  const amps = [];
  for (let n = 1; n <= count; n++) {
    const notch = Math.abs(Math.sin(Math.PI * n * strike)) * 0.85 + 0.15;
    amps.push(notch / Math.pow(n, rolloff));
  }
  return amps;
}

// Stacked-partial piano: bright at the strike, darkening and decaying over time.
// Velocity controls both loudness and how far the lowpass opens, like a real hammer.
function buildPiano(part, note, f, vel, t) {
  const ctx = part.ctx;
  const v = part.preset.voice;
  const P = part.params;
  const wave = part.wave(part.preset.id, () => periodic(ctx, Array.isArray(v.partials) ? v.partials : stringPartials(v.partials)));
  const vb = Math.pow(vel, 1.2) * (v.bright ?? 1); // brightness
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(((note - 64) / 48) * 0.55, -0.6, 0.6);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.2;
  const fStart = clamp(f * (2 + 20 * vb) + 1500 * vb, 250, 18000);
  const fEnd = clamp(f * (1.3 + 4 * vb) + 300 * vb, 180, 12000);
  filt.frequency.setValueAtTime(fStart, t);
  filt.frequency.setTargetAtTime(fEnd, t, 0.25 + (v.decay ?? 6) * 0.06);
  const vv = Math.pow(vel, 1.5);

  const sources = [];
  const pitch = [];
  const dets = v.unison || [0];
  for (const d of dets) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(filt);
    o.start(t);
    sources.push(o);
    pitch.push(o.detune);
  }
  filt.connect(amp);
  if (v.hammer) {
    sources.push(noiseBurst(part, t, f * (v.hammerFreq ?? 4), 0.9, v.hammer * (0.2 + vv) * 0.5, 0.012, amp));
  }

  // about 20 dB between a soft (vel 32) and a full (vel 127) strike
  const peak = ((v.level ?? 0.3) * (0.04 + 0.96 * vel * vel) * keyTilt(v, f)) / Math.sqrt(dets.length);
  const decay = clamp((v.decay ?? 6) * Math.pow(261.6 / f, 0.55), 0.5, 18);
  const a = P.attack ?? 0.002;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  amp.gain.setTargetAtTime(peak * (v.body ?? 0.5), t + a, 0.1);
  amp.gain.setTargetAtTime(0, t + a + 0.3, decay / 4);
  amp.connect(panner);
  return { amp, out: panner, sources, pitch, maxDur: a + 0.3 + decay * 1.6 };
}

// Two-operator FM electric piano with a short high-ratio "tine" modulator for the attack.
function buildFM(part, note, f, vel, t) {
  const ctx = part.ctx;
  const v = part.preset.voice;
  const P = part.params;
  const vv = Math.pow(vel, 1.3);
  const keyScale = clamp(Math.pow(440 / f, 0.35), 0.35, 2.2);

  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  const mf = f * (v.ratio ?? 1);
  mod.frequency.value = mf;
  const mg = ctx.createGain();
  const idx = (v.index ?? 2) * (0.2 + vv * 1.1) * keyScale;
  mg.gain.setValueAtTime(idx * mf, t);
  mg.gain.setTargetAtTime(idx * mf * (v.indexSustain ?? 0.2), t, v.indexDecay ?? 0.5);
  mod.connect(mg).connect(car.frequency);

  const sources = [car, mod];
  const pitch = [car.detune, mod.detune];
  const tf = v.tine ? f * v.tine.ratio : 0;
  // The tine fades out towards the top of the keyboard and is skipped where it would alias.
  if (v.tine && tf < 15000) {
    const tine = ctx.createOscillator();
    tine.frequency.value = tf;
    const tg = ctx.createGain();
    const tineKey = clamp(Math.pow(4000 / tf, 0.7), 0, 1.3) * clamp((15000 - tf) / 5000, 0, 1);
    tg.gain.setValueAtTime(v.tine.index * (0.15 + vv) * keyScale * tineKey * tf, t);
    tg.gain.setTargetAtTime(0, t, v.tine.decay);
    tine.connect(tg).connect(car.frequency);
    sources.push(tine);
    pitch.push(tine.detune);
  }

  const amp = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(((note - 64) / 48) * 0.3, -0.4, 0.4);
  car.connect(amp).connect(panner);

  // about 17 dB between soft and full velocity
  const peak = (v.level ?? 0.3) * (0.06 + 0.94 * Math.pow(vel, 1.8)) * keyTilt(v, f);
  const decay = clamp((v.decay ?? 5) * Math.pow(261.6 / f, 0.5), 0.6, 14);
  const a = P.attack ?? 0.002;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  amp.gain.setTargetAtTime(peak * (v.body ?? 0.6), t + a, 0.15);
  amp.gain.setTargetAtTime(0, t + a + 0.4, decay / 4);
  for (const s of sources) s.start(t);
  return { amp, out: panner, sources, pitch, maxDur: a + 0.4 + decay * 1.6 };
}

// Drawbar organ. Footages map to harmonics of the 16' fundamental.
const DRAWBAR_HARMONICS = [1, 3, 2, 4, 6, 8, 10, 12, 16];

function buildOrgan(part, note, f, vel, t) {
  const ctx = part.ctx;
  const v = part.preset.voice;
  const P = part.params;
  const wave = part.wave(part.preset.id, () => {
    const amps = new Array(16).fill(0);
    v.drawbars.forEach((level, i) => {
      amps[DRAWBAR_HARMONICS[i] - 1] += Math.pow(level / 8, 1.5);
    });
    return periodic(ctx, amps);
  });
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = f / 2;
  const amp = ctx.createGain();
  osc.connect(amp);
  osc.start(t);
  const sources = [osc];
  const pitch = [osc.detune];

  if (v.perc) {
    const po = ctx.createOscillator();
    po.frequency.value = f * v.perc.harm; // 2 = second harmonic, 3 = third harmonic
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(v.perc.level * 0.6, t);
    pg.gain.setTargetAtTime(0, t, v.perc.decay / 3);
    po.connect(pg).connect(amp);
    po.start(t);
    sources.push(po);
    pitch.push(po.detune);
  }
  if (v.click) sources.push(noiseBurst(part, t, 2600, 0.7, v.click * 0.35, 0.003, amp));

  const a = P.attack ?? 0.004;
  const level = v.level ?? 0.18;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(level, t + a);
  return { amp, out: amp, sources, pitch };
}

// Subtractive synth: unison oscillators -> (formants) -> lowpass with envelope -> amp.
function buildOsc(part, note, f, vel, t) {
  const ctx = part.ctx;
  const v = part.preset.voice;
  const P = part.params;
  const mix = ctx.createGain();
  const sources = [];
  const pitch = [];
  const oscFreqs = [];

  for (const spec of v.oscs) {
    const count = spec.unison || 1;
    const mult = Math.pow(2, (spec.oct || 0) + (spec.semi || 0) / 12);
    const g = ctx.createGain();
    g.gain.value = (spec.gain ?? 1) / Math.sqrt(count);
    g.connect(mix);
    for (let i = 0; i < count; i++) {
      const o = ctx.createOscillator();
      o.type = spec.type || 'sawtooth';
      o.frequency.value = f * mult;
      const spread = count > 1 ? (spec.spread || 0) * ((i / (count - 1)) * 2 - 1) : 0;
      o.detune.value = (spec.detune || 0) + spread;
      if (count > 1) {
        const p = ctx.createStereoPanner();
        p.pan.value = ((i / (count - 1)) * 2 - 1) * 0.7;
        o.connect(p).connect(g);
      } else {
        o.connect(g);
      }
      o.start(t);
      sources.push(o);
      pitch.push(o.detune);
      oscFreqs.push({ o, mult });
    }
  }

  let head = mix;
  if (v.formants) {
    const sum = ctx.createGain();
    // a little unfiltered signal keeps low and high notes from disappearing between the formants
    const body = ctx.createGain();
    body.gain.value = v.formantBody ?? 0;
    mix.connect(body).connect(sum);
    v.formants.forEach((fr, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = v.formantQ ?? 6;
      const fg = ctx.createGain();
      fg.gain.value = [1, 0.6, 0.3][i] ?? 0.3;
      mix.connect(bp).connect(fg).connect(sum);
    });
    head = sum;
  }

  const fl = v.filter;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = fl.q ?? 0.7;
  const vv = Math.pow(vel, 1.3);
  const nyq = ctx.sampleRate / 2 - 100;
  const base = clamp(fl.cutoff * Math.pow(f / 261.6, fl.key ?? 0.5), 40, nyq);
  const envAmt = (fl.env ?? 0) * (1 - (fl.vel ?? 0) + (fl.vel ?? 0) * vv);
  const peakF = clamp(base + envAmt, 40, nyq);
  const susF = clamp(base + envAmt * (fl.s ?? 0.5), 40, nyq);
  filt.frequency.setValueAtTime(base, t);
  filt.frequency.linearRampToValueAtTime(peakF, t + (fl.a ?? 0.01));
  filt.frequency.setTargetAtTime(susF, t + (fl.a ?? 0.01), (fl.d ?? 0.5) / 3);
  head.connect(filt);

  const amp = ctx.createGain();
  filt.connect(amp);
  const peak = (v.level ?? 0.15) * velCurve(vel, v.velSens ?? 0.5, 1.3) * keyTilt(v, f);
  const a = P.attack ?? 0.005;
  const env = v.amp || { d: 1, s: 1 };
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  if ((env.s ?? 1) < 1) amp.gain.setTargetAtTime(peak * env.s, t + a, (env.d ?? 1) / 3);

  const setFreq = (nf, glide) => {
    const now = ctx.currentTime;
    for (const { o, mult } of oscFreqs) {
      holdAt(o.frequency, now);
      o.frequency.setTargetAtTime(nf * mult, now, Math.max(0.001, glide / 3));
    }
  };
  const maxDur = (env.s ?? 1) === 0 ? a + (env.d ?? 1) * 3 + 0.5 : undefined;
  return { amp, out: amp, sources, pitch, setFreq, maxDur };
}
