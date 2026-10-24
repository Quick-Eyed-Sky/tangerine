#!/bin/sh
# Tangerine: starts the local server for this folder and opens it in the browser.
cd "$(dirname "$0")" && exec python3 scripts/serve.py --open "$@"
