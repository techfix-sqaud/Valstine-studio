#!/usr/bin/env bash
# gen-icons.sh — generate macOS .icns and Windows .ico from public/logo.png
# Requires: sips and iconutil (macOS built-ins); .ico generation uses the local png-to-ico package.
set -euo pipefail

SRC="public/logo.png"
ICONSET="build/icon.iconset"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC not found. Place a 1024×1024 PNG at $SRC and retry."
  exit 1
fi

echo "→ Generating macOS iconset…"
mkdir -p "$ICONSET"

sips -z 16   16   "$SRC" --out "$ICONSET/icon_16x16.png"        > /dev/null
sips -z 32   32   "$SRC" --out "$ICONSET/icon_16x16@2x.png"     > /dev/null
sips -z 32   32   "$SRC" --out "$ICONSET/icon_32x32.png"        > /dev/null
sips -z 64   64   "$SRC" --out "$ICONSET/icon_32x32@2x.png"     > /dev/null
sips -z 128  128  "$SRC" --out "$ICONSET/icon_128x128.png"      > /dev/null
sips -z 256  256  "$SRC" --out "$ICONSET/icon_128x128@2x.png"   > /dev/null
sips -z 256  256  "$SRC" --out "$ICONSET/icon_256x256.png"      > /dev/null
sips -z 512  512  "$SRC" --out "$ICONSET/icon_256x256@2x.png"   > /dev/null
sips -z 512  512  "$SRC" --out "$ICONSET/icon_512x512.png"      > /dev/null
sips -z 1024 1024 "$SRC" --out "$ICONSET/icon_512x512@2x.png"   > /dev/null

echo "→ Converting iconset to .icns…"
iconutil -c icns "$ICONSET" -o build/icon.icns

echo "→ Generating Windows .ico…"
./node_modules/.bin/png-to-ico "$SRC" > build/icon.ico

echo "Done. Files written:"
ls -lh build/icon.icns build/icon.ico
