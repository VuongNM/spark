#!/bin/bash
# One-time: create a self-signed code-signing identity in a dedicated keychain, so every build
# of Spark has the same signature and macOS keeps its Microphone/Accessibility permissions.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="mike Local Code Signing"
KC="$HOME/Library/Keychains/mike-signing.keychain-db"
PWFILE="build/.signing-keychain-password"
OPENSSL=/opt/homebrew/bin/openssl

if [ -f "$KC" ]; then
  echo "Signing keychain already exists: $KC"
  exit 0
fi

mkdir -p build
umask 077
"$OPENSSL" rand -hex 24 > "$PWFILE"
PW=$(cat "$PWFILE")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

"$OPENSSL" req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -subj "/CN=$NAME" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" 2>/dev/null
P12PW=$("$OPENSSL" rand -hex 16)
"$OPENSSL" pkcs12 -export -legacy -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" -out "$TMP/id.p12" -passout "pass:$P12PW"

security create-keychain -p "$PW" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$PW" "$KC"
security import "$TMP/id.p12" -k "$KC" -P "$P12PW" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PW" "$KC" >/dev/null

echo "Created \"$NAME\" in $KC"
