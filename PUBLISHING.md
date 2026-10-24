# Publishing Tangerine 1.3.0

Repository: Quick-Eyed-Sky/tangerine. Public demo: https://quick-eyed-sky.github.io/tangerine/.

## Preservation

Keep the existing v1.2.0 Git tag, release and assets. Do not force-update or delete them. The 1.3 commit descends from the current main commit. `dist/versions/v1.2.0/` is the unchanged original demo; `docs/versions/` retains the old documentation. Settings for the 1.3 interface use their own storage key, without overwriting the old demo's settings.

## Checks

```sh
npm run check
npm test
npm run test:recording
```

Verify the UI on a large screen, laptop and phone-sized viewport. Test 6 BPM (one sixteenth note every 2.5 seconds), save/load a setup below 60 BPM, New journey versus restart, and full-screen portrait/landscape. The existing engine needs twelve bars for a timed thread, so very short durations are unavailable at slow tempos. Its existing echo delay ceiling is unchanged.

Test the hosted mode separately using a static server and `?demo=1`. It must work under `/tangerine/`, without the Python recording API. The toolbar's Record button must start/stop browser passage capture, and the interface must explain the 30-minute limit. Continuous recording is a local-download feature.

The local Python launcher must still write readable WAV files to Recordings/ progressively and finalize them on Stop. No recordings, private JSON setups, personal browser state or caches belong in the source or release.

## Screenshot

`docs/tangerine.png` is the current 1.3 desktop screenshot supplied by Jean-Pascal. The previous screenshot is preserved as `docs/versions/v1.2.0-tangerine.png`. Do not include private recordings in release images or assets.

## Package

```sh
sh scripts/release.sh
```

This builds `release/Tangerine-v1.3.0.zip` and `release/Tangerine-v1.3.0-SHA256SUMS.txt`, containing the application, local server, launchers, documentation and tests. It excludes recordings, caches and development captures. Build 1.3 separately; keep any previous release assets intact.

## Publish

1. Commit the verified source to main without rewriting history. The existing Pages workflow uploads dist/.
2. Wait for the Pages deployment to succeed. Check the footer says v1.3.0 at the public URL, and check the archived 1.2 URL still works.
3. Create a new GitHub release with tag **v1.3.0**, targeting the verified main commit. Use **Tangerine 1.3.0 — more room to play** as the title and RELEASE.md as its text.
4. Attach the ZIP and SHA-256 file. Publish it as the latest stable release, leaving v1.2.0 untouched.
5. Check the README download link, release assets and demo links.

For a configured GitHub CLI session, the release step is:

```sh
gh release create v1.3.0 release/Tangerine-v1.3.0.zip release/Tangerine-v1.3.0-SHA256SUMS.txt --repo Quick-Eyed-Sky/tangerine --title "Tangerine 1.3.0 — more room to play" --notes-file RELEASE.md
```

GitHub Pages hosts static files only. Do not advertise the local Python recording API as a hosted feature. The original 1.2 musical, synthesis and export modules are kept byte-identical in 1.3.
