#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/native/SystemAudioCapture"
OUT="$ROOT/dist/SystemAudioCapture.app"
CACHE="$SRC/.cache"

mkdir -p "$CACHE/swift-modules" "$CACHE/clang-modules" "$OUT/Contents/MacOS"

echo "Building SystemAudioCapture (release)…"
SWIFT_MODULECACHE_PATH="$CACHE/swift-modules" \
CLANG_MODULE_CACHE_PATH="$CACHE/clang-modules" \
swift build \
  --package-path "$SRC" \
  --scratch-path "$SRC/.build" \
  -c release

cp "$SRC/.build/release/SystemAudioCapture" "$OUT/Contents/MacOS/SystemAudioCapture"
cp "$SRC/Info.plist" "$OUT/Contents/Info.plist"
chmod +x "$OUT/Contents/MacOS/SystemAudioCapture"

# Ad-hoc signature is enough for local use. electron-builder will re-sign nested
# code with the final Developer ID identity when producing a signed build.
codesign --force --deep --sign - "$OUT" >/dev/null 2>&1 || true

echo "Built: $OUT"
echo "Helper executable: $OUT/Contents/MacOS/SystemAudioCapture"
