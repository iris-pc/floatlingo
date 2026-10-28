#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/release/mac-arm64/FloatLingo.app}"

if [ ! -d "$APP" ]; then
  echo "App bundle not found: $APP" >&2
  exit 1
fi

IDENTITY="${CODESIGN_IDENTITY:--}"
if [ "$IDENTITY" = "-" ]; then
  echo "Ad-hoc signing (local development). Set CODESIGN_IDENTITY for distribution."
else
  echo "Signing with: $IDENTITY"
fi

HELPER="$APP/Contents/Resources/SystemAudioCapture.app"
if [ -d "$HELPER" ]; then
  codesign --force --deep --sign "$IDENTITY" \
    --entitlements "$ROOT/build/entitlements.mac.plist" \
    "$HELPER"
fi

codesign --force --deep --sign "$IDENTITY" \
  --entitlements "$ROOT/build/entitlements.mac.plist" \
  "$APP"

codesign --verify --deep --strict "$APP"
echo "Signed: $APP"
