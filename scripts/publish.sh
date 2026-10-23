#!/bin/bash
# Publishes v<package.json version> on GitHub with the Mac files from scripts/release-mac.sh.
#   bash scripts/publish.sh "Ghi chú cho bản này (tiếng Việt)"
# The notes are followed by the install command, so every release page says how to get it.
# Publishing the release starts .github/workflows/windows.yml, which builds and attaches the
# Windows installer a few minutes later.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="v$(node -p "require('./package.json').version")"
OUT=dist/release
for f in Spark-mac-arm64.zip Spark-mac-arm64.dmg SHA256SUMS-mac.txt; do
  [ -f "$OUT/$f" ] || { echo "Missing $OUT/$f. Run scripts/release-mac.sh first." >&2; exit 1; }
done

NOTES="${1:-}"
[ -n "$NOTES" ] && NOTES="$NOTES"$'\n\n'
NOTES="${NOTES}Cài hoặc cập nhật: \`curl -fsSL https://vuongnm.github.io/spark/install.sh | bash\` · Hướng dẫn: https://vuongnm.github.io/spark/"

gh release create "$VERSION" "$OUT"/Spark-mac-arm64.zip "$OUT"/Spark-mac-arm64.dmg "$OUT"/SHA256SUMS-mac.txt \
  --title "Spark $VERSION" --notes "$NOTES"
