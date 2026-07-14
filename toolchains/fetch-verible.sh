#!/usr/bin/env bash
# Downloads the pinned Verible release and stages verible-verilog-lint,
# verible-verilog-format, verible-verilog-ls and verible-verilog-syntax
# into the veriscode extension's bundled bin/ directory, so
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
DEST="$REPO_ROOT/extensions/veriscode/bin/$TARGET"

URL="https://github.com/chipsalliance/verible/releases/download/$TAG/$ASSET"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Fetching Verible $TAG ($TARGET) from $URL"
curl -sSL -o "$WORK/$ASSET" "$URL"

case "$ASSET" in
  *.tar.gz) tar -xzf "$WORK/$ASSET" -C "$WORK" ;;
  *.zip)
    # Prefer `unzip`: it converts backslash path separators to real
    # subdirectories on extract, which some Windows-built zips rely on.
    # Python's zipfile module treats backslashes as a literal filename
    # character on POSIX, which silently produces a flat mess of
    # oddly-named files instead of a bin/ subdirectory - fall back to it
    # only if unzip genuinely isn't available.
    if command -v unzip >/dev/null 2>&1; then
      unzip -oq "$WORK/$ASSET" -d "$WORK"
    else
      python3 -m zipfile -e "$WORK/$ASSET" "$WORK"
    fi
    ;;
  *) echo "Unrecognized asset extension: $ASSET" >&2; exit 1 ;;
esac

mkdir -p "$DEST"
EXT=""
[[ "$TARGET" == win32-* ]] && EXT=".exe"

# Search by binary name rather than assuming a "<tag>/bin/" layout -
# archive structure (and path-separator handling) has varied across
# releases/platforms, and this is robust to all of it.
for name in verible-verilog-lint verible-verilog-format verible-verilog-ls verible-verilog-syntax; do
  src=$(find "$WORK" -type f -iname "*${name}${EXT}" | head -n1)
  if [[ -n "$src" ]]; then
    cp "$src" "$DEST/$name$EXT"
    chmod +x "$DEST/$name$EXT" 2>/dev/null || true
    echo "Staged $name$EXT (from $src)"
  else
    echo "Warning: $name$EXT not found in this Verible release, skipping" >&2
  fi
done

echo "Verible staged at $DEST"
