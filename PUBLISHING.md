# Publication notes

Source, release and browser demo for **[Quick-Eyed-Sky/tangerine](https://github.com/Quick-Eyed-Sky/tangerine)**.

## Repository

- **Name:** `tangerine`
- **Description:** An endless vine of electronic sequences and slow tonal harmony, in your browser. Loopra's electric sibling.
- **Website:** https://quick-eyed-sky.github.io/tangerine/
- **License:** MIT, as supplied in `LICENSE`.
- **Suggested topics:** `generative-music`, `sequencer`, `electronic-music`, `web-audio`, `midi`, `javascript`, `browser`.
- **Language:** English for the interface and documentation; a French guide in `LISEZ-MOI.md`.

## Product scope

Tangerine is a synthesis-only instrument. Twelve layers share one clock and one moving, tonal harmony. Each layer can be switched on or off and heard alone with its headphone button. *Layers change* rests one layer and brings in another now and then, keeping as many on. Passages can be kept as WAV, MIDI and ABC, all made in the browser. There is no account, sample, model download, analytics or external audio service.

## Files to include

- `dist/`: the complete static application. This folder is also the browser demo.
- `docs/tangerine.png`: a current screenshot; `docs/first-opening.md`.
- `READ-ME.txt`: first-opening notes, for the download.
- `scripts/serve.py`, `Tangerine.command`, `run.sh`, `tests/`, `tools/` (without `tools/renders/`), `package.json`.
- `README.md`, `LISEZ-MOI.md`, `RELEASE.md`, `PUBLISHING.md`, `LICENSE`, `.gitignore`.
- `.github/workflows/pages.yml`: deploys `dist/` to GitHub Pages.

Keep `old versions/`, `Ecoute/`, `tools/renders/`, `release/`, browser state and personal setup files out of the repository (`.gitignore` already does).

## Before publishing

1. Run `npm run check` and `npm test` (Node.js 20 or later).
2. Double-click `Tangerine.command` on macOS, or run `./run.sh`. Check that the page opens on `http://127.0.0.1:4250` and the footer shows the new version.
3. Listen with the default layers and with all twelve. Solo an enabled and a disabled layer, then return to the mix.
4. Keep a short passage and open its WAV, MIDI and ABC.
5. Save a setup, change controls, load it again.
6. Replace `docs/tangerine.png` if the interface changed.
7. Check that the executable bit is set on `Tangerine.command`, `run.sh` and `scripts/serve.py` (`git ls-files -s` shows `100755`).

## GitHub Pages: the clickable demo

The site is **`dist/`**, not the repository root. The workflow in `.github/workflows/pages.yml` uploads that folder on every push to `main`. Once, after the first push:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab, run *Pages demo* (or push again), wait for the green check.
4. Open https://quick-eyed-sky.github.io/tangerine/ and click **Start the vine**.

The app uses only relative paths, so it works under `/tangerine/`. Web MIDI and audio capture need HTTPS, which Pages provides.

## Commands

From this folder, with Git and a GitHub CLI session signed in as Quick-Eyed-Sky:

```sh
npm run check
npm test
git init -b main
git add .
git status --short
git commit -m "Tangerine 1.2.0: sequences in slow light"
gh repo create Quick-Eyed-Sky/tangerine --public --source=. --remote=origin --push \
  --description "An endless vine of electronic sequences and slow tonal harmony, in your browser. Loopra's electric sibling." \
  --homepage "https://quick-eyed-sky.github.io/tangerine/"
gh repo edit Quick-Eyed-Sky/tangerine --add-topic generative-music,sequencer,electronic-music,web-audio,midi,javascript,browser
gh api -X POST repos/Quick-Eyed-Sky/tangerine/pages -f build_type=workflow
```

The last line turns on Pages with GitHub Actions as its source (the same as step 2 above).

For later versions, commit and push to the existing repository: the demo updates itself.

## Release

Build the download (the source without development captures), then publish it with the prepared text in [RELEASE.md](RELEASE.md):

```sh
sh scripts/release.sh
gh release create v1.2.0 release/Tangerine-v1.2.0.zip release/Tangerine-v1.2.0-SHA256SUMS.txt \
  --repo Quick-Eyed-Sky/tangerine --title "Tangerine 1.2.0 — sequences in slow light" --notes-file RELEASE.md
```

Check the README's download link after the release is online.
