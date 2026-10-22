#!/bin/bash
# Builds the Mac release into dist/release:
#   Spark-mac-arm64.zip  what install.sh downloads
#   Spark-mac-arm64.dmg  for people who download in a browser
# Both hold the same app, signed with the stable identity, so macOS keeps Spark's permissions
# across updates. Publish with scripts/publish.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run typecheck
npm test
npm run package:mac

APP=dist/mac-arm64/Spark.app
OUT=dist/release
rm -rf "$OUT"
mkdir -p "$OUT/dmg"

ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/Spark-mac-arm64.zip"

ditto "$APP" "$OUT/dmg/Spark.app"
ln -s /Applications "$OUT/dmg/Applications"
hdiutil create -volname Spark -srcfolder "$OUT/dmg" -ov -format ULFO "$OUT/Spark-mac-arm64.dmg" >/dev/null
rm -rf "$OUT/dmg"

(cd "$OUT" && shasum -a 256 Spark-mac-arm64.zip Spark-mac-arm64.dmg > SHA256SUMS-mac.txt)
ls -lh "$OUT"
