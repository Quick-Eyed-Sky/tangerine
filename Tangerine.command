#!/bin/zsh
# Tangerine: double-click to listen.
# Starts the small local server for this folder and opens it in Chrome.
# A copy that is already running is detected and simply reopened.
set -e

TANGERINE_DIR="${0:A:h}"
cd "$TANGERINE_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  print 'Tangerine needs Python 3. Install it, then open this launcher again.'
  exit 1
fi

# Chrome when it is installed; otherwise the default browser.
if [ -d "/Applications/Google Chrome.app" ]; then
  export BROWSER='open -a "Google Chrome" %s'
fi

exec python3 "$TANGERINE_DIR/scripts/serve.py" --port 4250 --open
