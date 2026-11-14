// Web MIDI input. Parses incoming messages and hands them to callbacks.
// Works in Chrome, Edge and Opera (and Firefox with the Web MIDI add-on permission).

export class MidiInput {
  constructor(handlers) {
    this.h = handlers;
    this.access = null;
    this.selected = 'all';
    this.channel = 0; // 0 = omni, 1-16 = that channel only
  }

  get supported() {
    return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  }

  async init() {
    if (!this.supported) throw new Error('Web MIDI is not available in this browser. Use Chrome or Edge.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => {
      this.bind();
      this.h.devices?.(this.inputs());
    };
    this.bind();
    this.h.devices?.(this.inputs());
  }

  inputs() {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name, state: i.state }));
  }

  select(id) {
    this.selected = id;
    this.bind();
  }

  bind() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      const on = this.selected === 'all' || this.selected === input.id;
      input.onmidimessage = on ? (e) => this.handle(e.data) : null;
    }
  }

  handle(data) {
    const [status, d1 = 0, d2 = 0] = data;
    const type = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    if (status >= 0xf0) return; // clock, active sensing, sysex
    if (this.channel && ch !== this.channel) return;
    this.h.activity?.();
    switch (type) {
      case 0x90:
        if (d2 > 0) this.h.noteOn?.(d1, d2 / 127, ch);
        else this.h.noteOff?.(d1, ch);
        break;
      case 0x80:
        this.h.noteOff?.(d1, ch);
        break;
      case 0xb0:
        this.h.cc?.(d1, d2, ch);
        break;
      case 0xe0: {
        const v = ((d2 << 7) | d1) - 8192;
        this.h.bend?.(v / 8192, ch);
        break;
      }
      case 0xc0:
        this.h.program?.(d1, ch);
        break;
    }
  }
}
