#!/bin/sh
# Build this version only; never remove older release assets.
set -e
cd "$(dirname "$0")/.."
exec python3 scripts/release.py
