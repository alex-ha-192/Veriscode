#!/usr/bin/env bash
# Stages Icarus Verilog (from Homebrew) into the veriscode-simulator
# extension's bundled bin/darwin-<arch>/ directory, using the same -B /
# IVERILOG_VPI_MODULE_PATH relocation trick as the Linux/Windows fetch
# scripts (see icarusRunner.ts) - Homebrew's iverilog also bakes in
# absolute paths to its support directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ARCH=$(uname -m)
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) echo "error: unsupported macOS arch '$ARCH'" >&2; exit 1 ;;
esac

DEST="$REPO_ROOT/extensions/veriscode-simulator/bin/darwin-$NODE_ARCH"
LIB_DEST="$DEST/lib"

if ! command -v iverilog >/dev/null 2>&1; then
  echo "Installing Icarus Verilog via Homebrew..."
  brew install icarus-verilog
fi

mkdir -p "$DEST" "$LIB_DEST"

BREW_PREFIX=$(brew --prefix icarus-verilog)
for bin in iverilog vvp iverilog-vpi; do
  src="$BREW_PREFIX/bin/$bin"
  if [[ -f "$src" ]]; then
    cp "$src" "$DEST/"
    echo "Staged $bin from $src"
  else
    echo "Warning: $bin not found at $src" >&2
  fi
done

# Search by content (a .vpi module) rather than assuming the support
# directory is named "ivl" - that's true for Debian/apt's build but not
# necessarily for Homebrew's, whose install layout isn't documented.
SUPPORT_DIR=$(dirname "$(find "$BREW_PREFIX" -type f -name "*.vpi" 2>/dev/null | head -n1)")
if [[ -z "$SUPPORT_DIR" || "$SUPPORT_DIR" == "." ]]; then
  echo "error: could not find Icarus's .vpi support directory under $BREW_PREFIX" >&2
  exit 1
fi
cp -r "$SUPPORT_DIR/." "$LIB_DEST/"
echo "Staged support files from $SUPPORT_DIR"

echo "Icarus Verilog staged at $DEST"
ls -la "$DEST"
