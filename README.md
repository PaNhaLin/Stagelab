# Keystage

A stage keyboard workstation that runs in the browser. Plug in a USB/MIDI keyboard, open the page, and play pianos, electric pianos, organs, pads, synths and leads, with live control over tone, envelope, motion, reverb and delay.

Every sound is synthesized in real time with the Web Audio API. There are no samples to download or license, no build step and no dependencies, so it also works offline.

## Windows desktop app

Keystage also ships as a Windows app (built with Electron, which bundles its own Chrome engine, so Web Audio and Web MIDI behave exactly as in Chrome).

- **Install:** run `dist/Keystage-Setup-1.0.0.exe`. It adds Start menu and desktop shortcuts. Windows SmartScreen may warn that the app is from an unknown publisher because the installer isn't code-signed; choose *More info → Run anyway*.
- **No install:** `dist/Keystage-Portable-1.0.0.exe` runs from a USB stick or any folder.

What's different from the browser version:

- Sound starts immediately; there's no Start button, and MIDI access is granted without a prompt.
- The window fills the screen on laptops, and the on-screen keyboard uses the leftover height.
- `F11` toggles full screen. `Alt` shows the menu (zoom, reload, quit).
- The display won't go to sleep while Keystage is open, and audio keeps running when the window is in the background.
- Settings and MIDI mappings are saved in `%APPDATA%\Keystage`.

To work on the desktop app:

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist
```

`npm start` runs the app from source. `npm run dist` rebuilds the installer and portable exe in `dist/`. To change the icon, edit `build/make-icon.mjs` and run `npm run icon`.

## Run it in a browser

Browsers only allow MIDI and audio on `localhost` or `https`, so serve the folder rather than opening `index.html` directly:

```bash
python -m http.server 5173 --bind 127.0.0.1
```

Then open <http://localhost:5173> in **Chrome or Edge** (Web MIDI is not available in Safari), click **Start**, and allow MIDI access when the browser asks.

## Playing

| Input | What it does |
| --- | --- |
| MIDI keys | Velocity-sensitive notes |
| Sustain pedal (CC 64) | Sustain |
| Mod wheel (CC 1) | Vibrato; on organs it switches the rotary speaker slow/fast |
| Expression pedal (CC 11) | Volume swells |
| Pitch bend | ±2 semitones |
| Program change | Selects sound 1–24 |
| Computer keys `A`–`'` / `W E T Y U O P` | White / black keys from middle C |
| `Space` | Sustain |
| `Z` / `X` | Octave down / up |
| `←` `→` | Previous / next sound |
| `↑` `↓` or `1`–`6` | Change bank |
| `B` | Tap tempo for the delay |
| `M` | Layer on/off |
| `Esc` | Panic (stops all sound) |

Knobs: drag up/down (hold `Shift` for fine control), use the mouse wheel or arrow keys, or double-click to return to the sound's default.

## Sounds

| Bank | Sounds |
| --- | --- |
| Piano | Concert Grand, Bright Stage Grand, Felt Piano, Upright Ballad |
| E.Piano | Suitcase EP, Tine Bell EP, Reed EP, Glass FM EP |
| Organ | Gospel Full, Jazz Perc, Soft Worship Organ, Church Pipe |
| Pads | Ambient Swell, Warm Strings, Shimmer Pad, Air Choir, Cinematic Low |
| Synth | Super Stack, Analog Poly, Pluck Keys, Synth Brass |
| Lead | Saw Lead, Square Lead, Soft Sine Lead, Bright Stack Lead (mono, with glide) |

Each sound remembers its own knob settings, including reverb and delay. **reset** restores the factory values.

**Layer** plays a second sound together with the main one (for example piano + Warm Strings), with its own octave and a Layer level knob.

## MIDI Learn

1. Click **MIDI Learn**.
2. Click any knob, sound, bank, Tap, Layer, Panic or navigation button.
3. Move a knob or fader, or press a button or pad, on your controller.

Knobs need a CC control. Buttons can be learned from CC buttons or from pads that send notes. A small badge shows each mapping. While a control is selected you can remove its mapping, and **Clear all mappings** starts over. Out of the box CC 7 → Volume, CC 74 → Tone, CC 91 → Reverb.

Settings and mappings are saved in the browser (`localStorage`).

## Project layout

```
index.html        page structure
styles.css        dark stage theme
js/main.js        UI, note routing, MIDI learn, saving
js/engine.js      audio engine: voices, parts, reverb, ping-pong delay, limiter
js/presets.js     the sound library
js/params.js      knob ranges and formatting
js/midi.js        Web MIDI input
electron/main.js  Windows desktop shell (window, MIDI permission, app:// file serving)
build/            app icon and its generator
package.json      Electron + installer settings
```

### Adding a sound

Add an entry to `PRESETS` in `js/presets.js`. Pick an `engine` (`piano`, `fm`, `organ` or `osc`), copy a similar preset's `voice` block and adjust it, and set the default knob values in `params`.
