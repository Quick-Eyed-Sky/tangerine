# Tangerine — sequences in slow light

**An endless vine of electronic sequences and slow, tonal harmony, for your browser. Twelve synthesized layers turn on one clock; the chords move by the notes they share, and now and then the whole vine travels to another key.**

**[▶ Play in your browser →](https://quick-eyed-sky.github.io/tangerine/)** · **[⬇️ Download the latest release →](https://github.com/Quick-Eyed-Sky/tangerine/releases/latest)** · [First opening on a Mac →](docs/first-opening.md)

Short sequences of different lengths keep meeting in new places: a bass of 16 sixteenths, an arpeggio of 12, a high motif of 7 eighths, and a counter sequence of 10 dotted eighths that walks at its own pace against them. Above them, a pad holds each chord for 4 to 16 bars; low strings bow, a long lead sings into a long echo, a slow melody comes back after long rests, bells ring at their own times. Now and then one layer rests and another comes in. No drums: the accents of the sequences are the rhythm.

![Tangerine: on the left the tempo, the form, the harmony, the sequences, slow change, reverb and the Keep panel; on the right the current chord, the vine of notes as they pass, and the twelve layers, each with an on/off switch and a headphone button](docs/tangerine.png)

*Loopra's electric sibling. Every sound is synthesized in the browser.*

## What it does

- **Twelve layers**, each switchable and each with a **headphone button** to hear it alone: bass sequence, arpeggio, high motif, pad, bells, low strings, counter sequence, long lead, drone, high strings, slow melody, echo pulse. Each has three or so sounds, its envelope (attack, decay, sustain, release, gate) and an echo timed to the tempo.
- **Tonal, and travelling.** The harmony stays in a key and a mode, from open fifths to ninths and elevenths. **Key changes** sets how often it moves (per ten minutes, or in a whole thread) and **Distance** how far: another mode on the same notes, the relative key, a fifth away, up to chromatic mediants. Every change goes through a shared chord or a held common tone, so it glides. Nothing rubs: no chord holds a minor ninth or a tritone, and the bass never sits a semitone under the chord.
- **Random** draws a key, a mode and the harmony settings, and says what it drew.
- **It keeps changing, slowly.** *Evolution* changes one detail of one sequence every few dozen passes. *New sequences* come by themselves every 32 bars (or 64, 128, or only with the button). *Slow change* lets note lengths, echoes, brightness, levels and richness wander over minutes, *Sounds change* gives one layer another of its sounds now and then, and *Layers change* lets one layer rest while another comes in, so that as many keep playing: silences come and go, the bass included.
- **Endless, or a thread** of 3 minutes to 2 hours that comes home: twenty-four bars before the end it heads back to the home key, the last chord is held while the layers leave one by one, and the pad fades.
- **Keep what you just heard.** Tangerine always remembers the last 20 minutes: keep the last 30 seconds, minutes, or everything since the start, as **WAV**, **MIDI** (one track per layer, exactly on the grid) and **ABC** (a full score, and a lead sheet with chord symbols). A whole thread can also be made as files, faster than it plays.
- **Live MIDI out** to another app or synthesizer, or MIDI only, as a silent sequencer.
- The same **seed** and settings always give the same vine. *Save setup* keeps them in a small JSON file.

No account, samples, model downloads or package installation. The interface is in English; a French guide is in [LISEZ-MOI.md](LISEZ-MOI.md).

## Start listening

**In your browser:** [quick-eyed-sky.github.io/tangerine](https://quick-eyed-sky.github.io/tangerine/). Click **Start the vine**: browsers wait for a click before making sound. Chrome is recommended (Web MIDI, audio capture).

**On your own computer**, with **Python 3**:

- **On a Mac:** double-click **Tangerine.command** in this folder. It opens Chrome (or your default browser) on `http://127.0.0.1:4250`. Keep its Terminal window open while you listen. If macOS blocks it, see [the first-opening guide](docs/first-opening.md).
- **On macOS or Linux:** open a terminal in this folder and run `./run.sh`, then open the address it prints.

**Space** plays or pauses when you are not using another control. The round arrow next to *Pause* **restarts from zero** with a new seed, key, mode and harmony; the corner button of the vine (or a double click on it) shows it **full screen**.

## The controls

Every slider has a one-line explanation under it in the app. In short:

| Control | What it does |
| --- | --- |
| **Tempo** | 60–140 BPM, 80 at first. The sequences, the echoes and the recorded MIDI all follow it. |
| **The form** | *Endless*, or *a thread of* 3 minutes to 2 hours, which comes home and ends. *Make the thread as files* renders it offline (WAV, MIDI, ABC; beyond 20 minutes, MIDI and ABC only). |
| **Key, Mode** | Where the vine lives. Change them while it plays and it travels there by the gentlest route. |
| **Random** | Draws a key, a mode and the four settings below. |
| **Harmonic richness** | The colour of each chord: fifths and suspended chords, triads, sevenths and 6/9, ninths and elevenths. |
| **Key changes** | How many times key and mode change, per ten minutes or in the whole thread. |
| **Distance** | How far each change goes. |
| **Held bass** | How often the bass keeps the home note while the chords move above it. |
| **Evolution** | How often a sequence changes one detail. |
| **New sequences** | Draws all the patterns again (the harmony stays), now or by themselves every 32 (at first), 64 or 128 bars. |
| **Slow change** | How far the settings drift around where you set them, over minutes. |
| **Sounds change** | Never, now and then, or often: one layer takes another of its sounds. |
| **Layers change** | Never, now and then (about every 32 bars), or often: one layer rests and another comes in, on a chord change. As many as you switched on keep playing. |
| **Reverb · dry–wet, Room size** | How much reverb, and how large the room. |
| **Motion** | The sound breathes: filters, tuning and level move on slow loops; the notes stay the same. |
| **Keep** | The last 30 s to 20 min, or since the start, as WAV, MIDI, ABC and a lead sheet. *Record from now* takes up to 30 minutes. |
| **MIDI out** | Sends the notes of the enabled layers to a port, on channels 1–9 and 11–13. |

## How it is made

Plain HTML, CSS and JavaScript, with Web Audio oscillators, filters, envelopes, ping-pong tape echoes and convolution reverb. `engine.js` decides everything one sixteenth note at a time from the seed: the sequences, the chords, the key changes and the other strands. `theory.js` holds the modes, the chord vocabulary, the voice leading and the modulations. `audio.js` turns it into sound, `journal.js`, `midi.js` and `abc.js` write it down. No build step or runtime dependency.

All synthesis happens in your browser. Settings stay in local storage unless you save a setup file. There are no analytics, remote fonts, external audio services or model calls.

The complete website is **`dist/`**; any static host can serve it, and the browser demo is that folder on GitHub Pages. The Python server only delivers those files. See [PUBLISHING.md](PUBLISHING.md).

Tests, with Node.js 20 or later:

```sh
npm run check
npm test
```

They check the harmony (no rubs, modulations through shared notes, threads that end at home), the sequences, the MIDI and ABC files. The sound itself is for listening.

## Who made this

Jean-Pascal — **[Quick-Eyed Sky](https://www.youtube.com/@QuickEyedSky)** on YouTube, **[QES](https://huggingface.co/QES)** on Hugging Face. Not a programmer: this exists for the pleasure of hearing sequences turn and meet, the way they did on the synthesizer records of the seventies.

If it gives you a good long drift, you can **[buy me a coffee](https://buymeacoffee.com/oFJ5CiY7n)**. Entirely optional, and Tangerine stays exactly as free either way.

## License

MIT — see [LICENSE](LICENSE). You can use, modify and share it under those terms.
