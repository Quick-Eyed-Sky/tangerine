#!/bin/sh
# Builds release/Tangerine-v<version>.zip and its SHA-256 file, from this folder.
set -e
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json)
name="Tangerine-v$version"
rm -rf "release/$name" "release/$name.zip"
mkdir -p "release/$name"
for item in dist docs scripts tests tools Tangerine.command run.sh package.json README.md LISEZ-MOI.md READ-ME.txt RELEASE.md PUBLISHING.md LICENSE .gitignore; do
  cp -R "$item" "release/$name/"
done
rm -rf "release/$name/tools/renders" "release/$name/scripts/__pycache__"
find "release/$name" -name '.DS_Store' -delete
cd release
zip -qrX "$name.zip" "$name"
rm -rf "$name"
shasum -a 256 "$name.zip" > "$name-SHA256SUMS.txt" 2>/dev/null || sha256sum "$name.zip" > "$name-SHA256SUMS.txt"
echo "release/$name.zip"
cat "$name-SHA256SUMS.txt"
