# Opening Tangerine for the first time on a Mac

[← Back to the README](../README.md)

Tangerine is a free, open-source browser instrument. The download contains readable JavaScript, a small Python server and a `.command` launcher. It is not a signed or notarized Mac application bundle. If you only want to listen, the [browser version](https://quick-eyed-sky.github.io/tangerine/) needs no download at all.

## Open the downloaded copy

1. Unzip the release and keep the whole folder together.
2. Double-click **Tangerine.command**. It opens a Terminal window and then Chrome (or your default browser) on `http://127.0.0.1:4250`. Keep that Terminal window open while you listen.
3. Click **Start the vine** in the browser. The click is required before the browser makes sound.

The footer identifies this release as **v1.2.0**.

## If macOS asks you to confirm

A downloaded launcher may be marked as coming from the internet. macOS can ask for confirmation or block software whose developer it cannot verify. That warning does not establish whether a download is safe; review the source and check that it came from the intended repository.

If you trust the download and macOS offers this option, try opening the launcher once, then go to **System Settings → Privacy & Security**, scroll to **Security**, and choose **Open Anyway** for the blocked launcher. Confirm the final **Open** prompt. Apple describes this process in [Safely open apps on your Mac](https://support.apple.com/en-us/102445).

This guide does not apply to a message saying that a file contains malware or is damaged. Check the download and the source instead of treating those messages as the usual first-opening confirmation.

## Another way to start

With Python 3 installed, open Terminal in the unzipped folder and run:

```sh
./run.sh
```

or `python3 scripts/serve.py --open`. If Terminal says `python3` cannot be found, install Python 3 from [python.org](https://www.python.org/downloads/macos/), then try again. Tangerine needs no Python packages or model downloads.

## After an update

Run the launcher inside the new folder. An older tab does not update merely because a new archive was unzipped. Your settings live in the browser for the address you open; save a setup file to carry them to another copy, port or browser.

The server listens only on your own computer. It delivers the files in `dist/`; synthesis happens in the browser.
