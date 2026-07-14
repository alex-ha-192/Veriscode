#!/usr/bin/env bash
# Stages Icarus Verilog (from apt) into the veriscode-simulator extension's
# bundled bin/linux-<arch>/ directory, so a single portable .vsix works
# without the end user installing anything. Uses the same -B /
# IVERILOG_VPI_MODULE_PATH relocation trick as the Windows/macOS fetch
# scripts (see icarusRunner.ts) since apt's iverilog also bakes in
# absolute paths to its support directory. Arch-detected via `uname -m`
# so the same script works unmodified on both amd64 and arm64 runners.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "error: unsupported Linux arch '$(uname -m)'" >&2; exit 1 ;;
esac

DEST="$REPO_ROOT/extensions/veriscode-simulator/bin/linux-$NODE_ARCH"
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
# under /usr/lib/<triplet>/ivl on Debian/Ubuntu (triplet varies by arch,
# e.g. x86_64-linux-gnu vs aarch64-linux-gnu - discovered rather than
# hardcoded for exactly that reason).
SUPPORT_DIR=$(find /usr/lib -maxdepth 3 -type d -name ivl 2>/dev/null | head -n1)
if [[ -z "$SUPPORT_DIR" ]]; then
  echo "error: could not find Icarus's ivl support directory under /usr/lib" >&2
  exit 1
fi
cp -r "$SUPPORT_DIR/." "$LIB_DEST/"
echo "Staged support files from $SUPPORT_DIR"

echo "Icarus Verilog staged at $DEST"
ls -la "$DEST"
