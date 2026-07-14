#!/usr/bin/env bash
# Applies the Veriscode overlay onto a freshly-cloned VSCodium build tree:
# rebrands product.json and injects our two built-in extensions. Must run
# after VSCodium's own get_repo.sh (so ./vscode exists) and before its
# build.sh (which merges VSCODIUM_DIR/product.json onto vscode/product.json
# and copies VSCODIUM_DIR/src/<quality>/* over vscode/ - see build.sh for
# why this ordering matters).
#
# Usage: apply-overlay.sh <path-to-vscodium-checkout>
set -euo pipefail

VSCODIUM_DIR="${1:?usage: apply-overlay.sh <path-to-vscodium-checkout>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -d "$VSCODIUM_DIR/vscode" ]]; then
  echo "error: $VSCODIUM_DIR/vscode not found - run get_repo.sh first" >&2
  exit 1
fi

echo "==> Rebranding product.json"
# VSCodium's own prepare_vscode.sh later runs:
#   jq -s '.[0] * .[1]' vscode/product.json ../product.json
# i.e. it merges *its own* root product.json on top of vscode's, with the
# root file winning. So to rebrand, we merge our overlay onto that root
# file now, before prepare_vscode.sh (invoked from build.sh) runs.
jq -s '.[0] * .[1]' "$VSCODIUM_DIR/product.json" "$REPO_ROOT/branding/product.overlay.json" \
  > "$VSCODIUM_DIR/product.json.veriscode"
mv "$VSCODIUM_DIR/product.json.veriscode" "$VSCODIUM_DIR/product.json"

echo "==> Injecting built-in extensions"
mkdir -p "$VSCODIUM_DIR/vscode/extensions"
for ext in veriscode-systemverilog veriscode-simulator; do
  rm -rf "$VSCODIUM_DIR/vscode/extensions/$ext"
  cp -r "$REPO_ROOT/extensions/$ext" "$VSCODIUM_DIR/vscode/extensions/$ext"
  # Built-in extensions ship compiled; source/tests aren't needed in the tree.
  rm -rf "$VSCODIUM_DIR/vscode/extensions/$ext/src" \
         "$VSCODIUM_DIR/vscode/extensions/$ext/test" \
         "$VSCODIUM_DIR/vscode/extensions/$ext/node_modules"
done

echo "==> Best-effort icon rebrand"
# VSCodium copies its own branded icons from src/<quality>/... into vscode/
# as part of prepare_vscode.sh, which runs *after* this script. To have our
# icons win, we overwrite them at the source, before that copy happens -
# but only where a matching file already exists, so a wrong path guess
# skips gracefully instead of failing the whole build.
ICON_SRC="$REPO_ROOT/branding/icons"
if [[ -d "$ICON_SRC" ]]; then
  for quality_dir in "$VSCODIUM_DIR/src/stable" "$VSCODIUM_DIR/src/insider"; do
    [[ -d "$quality_dir" ]] || continue
    while IFS= read -r -d '' target; do
      base="$(basename "$target")"
      if [[ -f "$ICON_SRC/$base" ]]; then
        cp "$ICON_SRC/$base" "$target"
        echo "  replaced $target"
      fi
    done < <(find "$quality_dir" \( -iname "code.ico" -o -iname "code.icns" -o -iname "code.png" -o -iname "*.svg" \) -print0 2>/dev/null)
  done
fi

echo "==> Overlay applied to $VSCODIUM_DIR"
