#!/usr/bin/env bash
# Downloads the pinned Verible release and stages verible-verilog-lint,
# verible-verilog-format, verible-verilog-ls and verible-verilog-syntax
# into the veriscode-systemverilog extension's bundled bin/ directory, so
# packaged Veriscode installers never need the user to install Verible
# themselves.
#
# Usage: fetch-verible.sh <linux-x64|linux-arm64|win32-x64|darwin-x64|darwin-arm64>
#
# Requires network access (this is meant to run in CI, which has it - the
# sandboxed dev container this repo was authored in deliberately does not).
set -euo pipefail

TARGET="${1:?usage: fetch-verible.sh <linux-x64|linux-arm64|win32-x64|darwin-x64|darwin-arm64>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"

TAG=$(python3 -c "import json;print(json.load(open('$MANIFEST'))['verible']['tag'])")
ASSET=$(python3 -c "import json;print(json.load(open('$MANIFEST'))['verible']['assets']['$TARGET'])")
DEST="$REPO_ROOT/extensions/veriscode-systemverilog/bin/$TARGET"

URL="https://github.com/chipsalliance/verible/releases/download/$TAG/$ASSET"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Fetching Verible $TAG ($TARGET) from $URL"
curl -sSL -o "$WORK/$ASSET" "$URL"

case "$ASSET" in
  *.tar.gz) tar -xzf "$WORK/$ASSET" -C "$WORK" ;;
  *.zip) python3 -m zipfile -e "$WORK/$ASSET" "$WORK" ;;
  *) echo "Unrecognized asset extension: $ASSET" >&2; exit 1 ;;
esac

mkdir -p "$DEST"
EXT=""
[[ "$TARGET" == win32-* ]] && EXT=".exe"

# The release archive extracts to a single top-level "<tag>/bin/" directory.
SRC_BIN=$(find "$WORK" -type d -name bin | head -n1)
if [[ -z "$SRC_BIN" ]]; then
  echo "Could not find a bin/ directory inside the extracted Verible archive" >&2
  exit 1
fi

for name in verible-verilog-lint verible-verilog-format verible-verilog-ls verible-verilog-syntax; do
  src="$SRC_BIN/$name$EXT"
  if [[ -f "$src" ]]; then
    cp "$src" "$DEST/"
    chmod +x "$DEST/$name$EXT" 2>/dev/null || true
    echo "Staged $name$EXT"
  else
    echo "Warning: $name$EXT not found in this Verible release, skipping" >&2
  fi
done

echo "Verible staged at $DEST"
