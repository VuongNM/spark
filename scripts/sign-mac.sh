#!/bin/bash
# Signs a built Spark.app with the stable local identity (see setup-signing.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${1:-dist/mac-arm64/Spark.app}"
# The identity keeps the app's old name (mike): a new one would change the signature, and every
# Mac would ask for Spark's permissions again.
KC="$HOME/Library/Keychains/mike-signing.keychain-db"
PWFILE="build/.signing-keychain-password"

if [ ! -f "$KC" ] || [ ! -f "$PWFILE" ]; then
  echo "No signing identity yet. Run: bash scripts/setup-signing.sh" >&2
  exit 1
fi

security unlock-keychain -p "$(cat "$PWFILE")" "$KC"
codesign --force --deep --timestamp=none --keychain "$KC" --sign "mike Local Code Signing" "$APP"
codesign --verify --deep --strict "$APP"
echo "Signed $APP"
