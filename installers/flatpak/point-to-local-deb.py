#!/usr/bin/env python3
"""Rewrites the "codium" module's .deb source in the Flatpak manifest to
point at a local file instead of a GitHub Releases URL, so CI can build
and test the Flatpak against the .deb this same workflow run just built,
without needing a real release (and its sha256) to exist yet."""
import yaml

MANIFEST = "com.veriscode.veriscode.yaml"

with open(MANIFEST) as f:
    manifest = yaml.safe_load(f)

for module in manifest["modules"]:
    if module["name"] == "codium":
        for src in module["sources"]:
            if src.get("dest-filename") == "veriscode.deb":
                src.clear()
                src.update({"type": "file", "path": "veriscode_amd64.deb", "dest-filename": "veriscode.deb"})

with open(MANIFEST, "w") as f:
    yaml.safe_dump(manifest, f, sort_keys=False)

print(f"Rewrote {MANIFEST} to use a local .deb source")
