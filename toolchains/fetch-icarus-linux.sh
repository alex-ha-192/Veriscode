#!/usr/bin/env bash
# Stages Icarus Verilog (from apt) into the veriscode-simulator extension's
# bundled bin/linux-x64/ directory, so a single portable .vsix works
# without the end user installing anything. Uses the same -B /
# IVERILOG_VPI_MODULE_PATH relocation trick as the Windows fetch script
# (see icarusRunner.ts) since apt's iverilog also bakes in absolute paths
# to its support directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$REPO_ROOT/extensions/veriscode-simulator/bin/linux-x64"
LIB_DEST="$DEST/lib"

if ! command -v iverilog >/dev/null 2>&1; then
  echo "Installing Icarus Verilog via apt..."
  sudo apt-get update -qq
  sudo apt-get install -y iverilog
fi

mkdir -p "$DEST" "$LIB_DEST"

for bin in iverilog vvp iverilog-vpi; do
  src=$(command -v "$bin")
  cp "$src" "$DEST/"
  echo "Staged $bin from $src"
done

# The support directory (target .conf/.tgt files + .vpi modules) lives
# under /usr/lib/<triplet>/ivl on Debian/Ubuntu.
SUPPORT_DIR=$(dirname "$(find /usr/lib -maxdepth 3 -type d -name ivl 2>/dev/null | head -n1)")/ivl
if [[ ! -d "$SUPPORT_DIR" ]]; then
  echo "error: could not find Icarus's ivl support directory under /usr/lib" >&2
  exit 1
fi
cp -r "$SUPPORT_DIR/." "$LIB_DEST/"
echo "Staged support files from $SUPPORT_DIR"

echo "Icarus Verilog staged at $DEST"
ls -la "$DEST"
