# Keystage

**▶ Play it online: https://panhalin.github.io/Stagelab/** (Chrome or Edge, with or without a MIDI keyboard)
**⬇ Windows app: [download from Releases](https://github.com/PaNhaLin/Stagelab/releases/latest)**

A stage keyboard workstation that runs in the browser. Plug in a USB/MIDI keyboard, open the page, and play pianos, electric pianos, organs, pads, synths and leads, with live control over tone, envelope, motion, reverb and delay.

Every sound is synthesized in real time with the Web Audio API. There are no samples to download or license, no build step and no dependencies, so it also works offline.

> Keystage is an independent open-source project. It is not affiliated with, endorsed by, or derived from StageLab by Dede Albano or Apple MainStage.

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

### Releasing a new version

1. Raise `version` in `package.json` (for example `1.2.1`). Also change the version everywhere it appears: the `keystage-version` meta tag and the two `?v=` tags in `index.html`, and `VERSION` plus the four `?v=` imports in `js/main.js`. These tags make browsers load all of the new files together instead of mixing them with cached old ones. Then push.
2. On GitHub, draft a new release with the matching tag (`v1.0.1`) and save it as a draft.
3. In the **Actions** tab, run **Build Windows release**. GitHub builds the installer and portable exe and attaches them to that draft.
4. Open the draft and click **Publish release**.

The web version on GitHub Pages updates by itself a minute after every push to `main`.

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
| Program change | Selects sound 1–30 |
| Computer keys `A`–`'` / `W E T Y U O P` | White / black keys from middle C |
| `Space` | Sustain while held |
| `\` | Sustain button on/off (latched) |
| `,` / `.` | Key down / up a semitone |
| `Q` | Tonic pad on/off |
| `Z` / `X` | Octave down / up |
| `←` `→` | Previous / next sound |
| `↑` `↓` or `1`–`7` | Change bank |
| `B` | Tap tempo for the delay |
| `M` | Layer on/off |
| `Esc` | Panic (stops all sound and turns Sustain off) |

**Sustain button:** holds every note until you press it again, for players without a pedal. The pedal and `Space` still work; notes are held while either is on.

**Tonic Pad:** an ambient drone that holds the key under everything you play, for worship sets, intros and transitions.
- The power button fades the pad in or out over a few seconds.
- The **12-key grid** (A to A♭) chooses the key. It is the same key used by Transpose and Scale lock, so the pad and your playing always agree. Changing key crossfades the pad smoothly.
- Click the pad name to choose **Warm Pad**, **Air Pad**, **Soft Strings** or **Dark Drone**.
- **Brightness** opens the pad's filter, **Shimmer** adds a soft layer one and two octaves up, and the fader sets the pad's level (double-click resets it to −5 dB).
- The pad plays root, fifth and octave with no third, so it fits both major and minor keys. It has its own long reverb, so it doesn't change when you switch sounds.
- Every grid key, the power button, both knobs and the fader can be assigned with MIDI Learn. Panic also stops the pad.

**Key, Transpose and Scale lock:** pick a key on the Tonic Pad grid (or with `,` and `.`) and choose Major or Minor.
- **Transpose** (on by default): play C major or A minor shapes and hear the chosen key, so G major sounds when you play in C, and E minor when you play in A minor. The shift stays within −6 to +5 semitones.
- **Scale lock:** a note outside the key moves down a semitone to the nearest note in the key, so wrong notes can't happen.
- The on-screen keyboard marks the notes of the key you are playing in, with an orange dot on the root. The display shows the key and the transpose amount, for example `KEY G (−5)`.

Knobs: drag up/down (hold `Shift` for fine control), use the mouse wheel or arrow keys, or double-click to return to the sound's default.

## Sounds

| Bank | Sounds |
| --- | --- |
| Piano | **Recorded Grand** (real piano recordings), Concert Grand, Bright Stage Grand, Felt Piano, Upright Ballad |
| E.Piano | Suitcase EP, Tine Bell EP, Reed EP, Glass FM EP |
| Organ | Gospel Full, Jazz Perc, Soft Worship Organ, Church Pipe |
| Pads | Ambient Swell, Warm Strings, Shimmer Pad, Air Choir, Cinematic Low |
| Synth | Super Stack, Analog Poly, Pluck Keys, Synth Brass |
| Lead | Saw Lead, Square Lead, Soft Sine Lead, Bright Stack Lead (mono, with glide) |
| Stage | Stage Grand (recorded, brighter for a band mix), Stage EP, Stage Clav, Stage Organ |

The Stage bank holds original sounds in the style of a gigging stage keyboard. They are made by Keystage itself and contain no samples or sounds from any keyboard manufacturer.

**Recorded Grand** and **Stage Grand** use 30 recordings of a real grand piano (about 2 MB, loaded when Keystage starts). Each note uses the recording that picked it up best, so it stays full on mono PAs and monitors. Until the recordings have loaded, these two sounds play the synthesized Concert Grand.

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
samples/piano/    recorded piano notes (CC BY 3.0, see CREDITS.txt)
electron/main.js  Windows desktop shell (window, MIDI permission, app:// file serving)
build/            app icon and its generator
package.json      Electron + installer settings
```

### Adding a sound

Add an entry to `PRESETS` in `js/presets.js`. Pick an `engine` (`piano`, `fm`, `organ`, `osc` or `sample`), copy a similar preset's `voice` block and adjust it, and set the default knob values in `params`.

## Credits

- Piano recordings: **Salamander Grand Piano** by Alexander Holm, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The MP3 versions come from the [Tone.js audio collection](https://tonejs.github.io/audio/salamander/). See `samples/piano/CREDITS.txt`. The recordings are not covered by Keystage's MIT license.
