#!/usr/bin/env bash
# Builds a full Veriscode installer: a VSCodium fork with Verible and
# Icarus Verilog bundled, and the veriscode-systemverilog /
# veriscode-simulator extensions baked in as built-ins.
#
# This clones and builds the actual VS Code source tree (via VSCodium's
# build pipeline), which needs real internet access and 30-60+ minutes -
# it is meant to run in CI (see .github/workflows/), not in a sandboxed
# dev container. Nothing here has been run to completion in this repo's
# authoring environment; the simulation engine and both extensions were
# instead unit-tested directly (see extensions/veriscode-simulator/test).
#
# Usage: build.sh <linux|windows> [x64]
set -euo pipefail

TARGET_OS="${1:?usage: build.sh <linux|windows> [arch]}"
ARCH="${2:-x64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/.build"
VSCODIUM_DIR="$BUILD_DIR/vscodium"

case "$TARGET_OS" in
  linux) VERIBLE_TARGET="linux-x64" ;;
  windows) VERIBLE_TARGET="win32-x64" ;;
  *) echo "error: unsupported OS '$TARGET_OS' (expected linux or windows)" >&2; exit 1 ;;
esac

echo "==> Fetching bundled toolchains"
"$REPO_ROOT/toolchains/fetch-verible.sh" "$VERIBLE_TARGET"
if [[ "$TARGET_OS" == "windows" ]]; then
  pwsh -NoProfile -File "$REPO_ROOT/toolchains/fetch-icarus-windows.ps1"
else
  echo "    (Linux: Icarus Verilog is pulled in as a package dependency for"
  echo "     .deb/.rpm builds, and built from source for the Flatpak - see"
  echo "     installers/flatpak/. Nothing to stage here.)"
fi

echo "==> Compiling Veriscode extensions"
cd "$REPO_ROOT"
npm ci
npm run compile

echo "==> Cloning VSCodium build pipeline"
mkdir -p "$BUILD_DIR"
if [[ ! -d "$VSCODIUM_DIR" ]]; then
  git clone --depth 1 https://github.com/VSCodium/vscodium.git "$VSCODIUM_DIR"
fi

echo "==> Fetching upstream VS Code source (VSCodium's get_repo.sh)"
cd "$VSCODIUM_DIR"
export SHOULD_BUILD="yes"
export SHOULD_BUILD_REH="no"
export CI_BUILD="no"
export OS_NAME="$TARGET_OS"
export VSCODE_ARCH="$ARCH"
export VSCODE_QUALITY="stable"
export RELEASE_VERSION="${RELEASE_VERSION:-0.1.0-veriscode}"
# shellcheck source=/dev/null
. get_repo.sh

echo "==> Applying Veriscode overlay (branding + built-in extensions)"
"$SCRIPT_DIR/apply-overlay.sh" "$VSCODIUM_DIR"

echo "==> Running VSCodium's build (compiles + packages)"
cd "$VSCODIUM_DIR"
# shellcheck source=/dev/null
. build.sh

echo "==> Done. Packaged installers are under $VSCODIUM_DIR (see its"
echo "    build/windows or build/linux output conventions for the exact path)."
