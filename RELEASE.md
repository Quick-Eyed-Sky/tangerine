# Tangerine 1.3.0 — more room to play

Tangerine is an endless vine of electronic sequences and slow, tonal harmony, made entirely in your browser. Twelve synthesized layers turn on one clock, and the harmony travels by the notes the chords share. No drums, samples, accounts or external audio services.

**[▶ Play the demo](https://quick-eyed-sky.github.io/tangerine/)** · **Download `Tangerine-v1.3.0.zip` under Assets below** · [French guide](https://github.com/Quick-Eyed-Sky/tangerine/blob/main/LISEZ-MOI.md)

## New in 1.3

- **A layout for large screens, laptops and phones.** Compose on the left, animated score and layers in the centre, space and recording on the right. On phones, switch between Play, Compose and Keep & Record while the music continues.
- **Full-screen animated score on phones**, in portrait and landscape, with Play/Pause and a return button, including a page-filling fallback when native fullscreen is unavailable.
- **6–140 BPM**, starting at 60 BPM. Go much slower for long, spacious sequences.
- **New journey next to playback.** Draw another seed with your harmony and settings intact. The round restart button also resets the timer and draws a new harmony.
- **Clearer Keep & Record.** Recover the recent past, or begin a recording from now. “All available” explicitly means the buffer of up to twenty minutes.
- **Continuous WAV recording in the local download.** Audio is written progressively to your computer until you stop, with consecutive one-hour WAV files for long sessions. You can also capture the audio of an already playing Chrome tab without reloading it.
- **The same musical engine and synthesis as 1.2.** This release improves the interface, starting setup and recording workflow.

## Online or local?

The GitHub Pages demo offers recent-passage downloads and browser recording for up to thirty minutes. Continuous recording to disk uses the **local download and its Python server**; it is audio-only. MIDI and ABC remain available for recent passages.

Unzip the download, keep the folder together and double-click **Tangerine.command** on a Mac, or run `./run.sh`. Python 3 is needed; there are no packages to install. Keep the Terminal open. Long recordings go into the dated folders inside **Recordings/**, next to the launcher. Keep the computer awake and finish with **Stop & finish files**.

At very slow tempos, short timed threads are unavailable because the unchanged engine requires at least twelve bars. Echo delay keeps its existing 3.9-second maximum. Phone audio behaviour depends on the browser and system; on iPhone, check silent mode and media volume if needed.

## Keep 1.2

The [1.2 release and original download](https://github.com/Quick-Eyed-Sky/tangerine/releases/tag/v1.2.0) and [source tag](https://github.com/Quick-Eyed-Sky/tangerine/tree/v1.2.0) remain unchanged. You can also [open the archived 1.2 demo](https://quick-eyed-sky.github.io/tangerine/versions/v1.2.0/).

The ZIP has a separate SHA-256 file under Assets. The source contains the original musical/export tests, recording tests and checks for the slow tempo range. The engine and synthesis files are unchanged from 1.2.

Jean-Pascal — [Quick-Eyed Sky](https://www.youtube.com/@QuickEyedSky) · [QES](https://huggingface.co/QES). MIT license.

If Tangerine gives you a good long drift, you can [buy me a coffee](https://buymeacoffee.com/oFJ5CiY7n). Entirely optional.
