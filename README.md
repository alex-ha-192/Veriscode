# Veriscode

Veriscode adds Verible (linting + formatting) and an interactive,
cycle-by-cycle SystemVerilog simulator (Icarus Verilog running invisibly
underneath) to VS Code, as two built-in extensions - no separate tool
installs, no command line.

The workflow it's built for:

1. **File → New File... → SystemVerilog Project**, or the same command
   from the Veriscode icon in the Activity Bar - creates a folder with a
   starter `.sv` file, the same way you'd create any new file.
2. Write SystemVerilog. Verible lints it as you type. The Veriscode
   sidebar panel (its own Activity Bar icon, PlatformIO-style) shows the
   active file's module and port list live as you edit.
3. Click **▶ Simulate** above the module (or from the sidebar). An
   interactive timing diagram opens: click any input cell to type a value
   for that signal at that clock cycle (`1`, `0`, `x`, `4'hA`, ...), add
   more cycles, and watch the outputs update automatically as Icarus
   Verilog re-runs in the background.

The sidebar (`extensions/veriscode-simulator/src/webview/sidebarView.ts`)
is deliberately a compact launcher/status panel, not the diagram itself -
a wide per-cycle grid doesn't fit usefully in a narrow sidebar, so the
actual simulation still opens as its own editor-area tab, the way
PlatformIO's sidebar is a task list in front of its full-tab PIO Home
rather than trying to cram everything into the sidebar.

## Distribution: one portable `.vsix`

The primary, verified distribution path is a **single `.vsix` per
extension that bundles Verible + Icarus Verilog for Windows, macOS
(Intel + Apple Silicon), and Linux all together** - `resolveBinary()` in
each extension picks the right one for whatever OS it's actually running
on. Install it once via **Install from VSIX...** in any existing VS Code,
VSCodium, or Cursor, on any of the three platforms, and everything (lint,
format, simulate) just works - the end user never sees Verible or Icarus
directly.

`.github/workflows/build-universal-vsix.yml` builds this: a matrix job
stages Verible (a single job - it ships prebuilt static binaries for
every platform already) and Icarus Verilog (one job per OS, since that
needs a real per-platform install/build), then a final job merges
everything into one checkout and packages both `.vsix` files once.

This bundling mechanism - and specifically the trickiest part of it,
relocating Icarus Verilog's binaries (which bake in absolute paths to
their own support directory, via `-B` at compile time and
`IVERILOG_VPI_MODULE_PATH` at run time; see `icarusRunner.ts`) - was
**verified for real** in this repo's dev sandbox: `iverilog`/`vvp` were
copied out of their normal `/usr/bin` install into the extension's
`bin/linux-x64/` layout, the system copies were then deleted entirely,
and the simulation engine's test suite still passed correctly using only
the relocated copy. The Windows/macOS legs use the identical mechanism
but couldn't be exercised the same way in this sandbox (no Windows/macOS
runner, no Chocolatey/Homebrew network access there) - see
`docs/toolchain-notes.md`.

### Try it now, without waiting on CI

```bash
npm install
npm run compile
cd extensions/veriscode-systemverilog && npx @vscode/vsce package --no-dependencies -o ../../dist/ && cd -
cd extensions/veriscode-simulator     && npx @vscode/vsce package --no-dependencies -o ../../dist/ && cd -
```

Then in VS Code: Extensions view → `...` menu → **Install from VSIX...**,
pick both files from `dist/`. Without the CI-built universal `.vsix`,
you'll also need `iverilog`/`vvp` on your PATH yourself (`apt install
iverilog`, `brew install icarus-verilog`, or the [Windows
installer](https://bleyer.org/icarus/)) and, optionally,
[Verible](https://github.com/chipsalliance/verible/releases) for linting -
this is the fastest loop for local extension development.

## A fully standalone branded app (secondary, less-verified path)

There's a second, heavier path in this repo for turning Veriscode into
its own branded desktop app (a VSCodium fork, packaged as a Windows
`.exe` and a Linux Flatpak) rather than something installed into an
existing VS Code - see "Building a standalone app" below. It's more work
for the same underlying functionality, so the portable `.vsix` above is
the recommended way to actually use Veriscode today; the fork path is
there for whenever a fully separate, marketplace-free app is worth the
extra build complexity.

## Architecture

```
veriscode/
  extensions/
    veriscode-systemverilog/   # syntax highlighting + Verible lint/format
    veriscode-simulator/       # project scaffolding + the simulator
  toolchains/                  # fetches Verible/Icarus for bundling
  branding/                    # product.json overlay + icons (fork path only)
  scripts/                     # build.sh: orchestrates the full fork build
  installers/flatpak/          # Flatpak manifest (fork path only)
  .github/workflows/           # CI: extension tests, universal vsix, fork builds
  docs/toolchain-notes.md      # what's been validated vs. not, and why
```

## Building a standalone app (VSCodium fork)

**Why a VSCodium fork instead of just the extension pack:** for a fully
separate branded app - an installer someone can double-click with no
existing VS Code required - [VSCodium](https://github.com/VSCodium/vscodium)
already solves "build VS Code from source, unbranded, with a real
Windows/Linux packaging pipeline"; this path reuses that pipeline instead
of reinventing it, and layers three things on top:

1. **Branding** - `branding/product.overlay.json` gets merged onto
   VSCodium's own `product.json` before its build runs (VSCodium's
   `prepare_vscode.sh` merges its root `product.json` onto `vscode/`'s;
   overlaying ours onto VSCodium's wins that merge). See
   `scripts/apply-overlay.sh`.
2. **Built-in extensions** - `extensions/veriscode-*` get copied into
   `vscode/extensions/` before the compile step, the same mechanism VS
   Code uses to ship its own Git/Markdown/etc. built-ins. They're always
   active; nothing to install from a marketplace.
3. **Bundled toolchains** - `toolchains/fetch-verible.sh` and
   `toolchains/fetch-icarus-windows.ps1` stage real Verible/Icarus
   binaries into each extension's `bin/` directory before packaging, so
   the shipped installer is fully self-contained. (Linux gets Icarus via
   a package dependency for the `.deb`, and a from-source Flatpak module
   for the sandboxed build - see `docs/toolchain-notes.md`.)

`scripts/build.sh linux|windows` runs the whole pipeline: fetch
toolchains → compile our extensions → clone VSCodium → apply the overlay →
run VSCodium's own build/package scripts unmodified.

### How simulation actually works

There's no live cosimulation/FIFO trickery - deliberately, for
portability and simplicity. Every time you edit a signal's value for a
cycle, the simulator panel (`extensions/veriscode-simulator/src/webview/`)
regenerates a small testbench that drives *all* cycles up to that point
with the values you've entered so far
(`src/simulation/testbenchGenerator.ts`), recompiles and reruns the whole
thing with `iverilog`/`vvp` (`src/simulation/icarusRunner.ts`), parses the
resulting VCD (`src/simulation/vcdParser.ts`), and re-renders the
diagram. It's a full recompile per edit rather than a stateful
simulation, which is slower than "real" interactive simulation but
trivially correct, cross-platform, and fast enough for the tiny designs
this is meant for.

## CI

- **`.github/workflows/ci.yml`** runs on every push/PR: compiles both
  extensions, runs the simulation engine's smoke tests against a real
  `iverilog`, and packages (non-bundled) `.vsix` files as build artifacts.
  Fast, cheap, always on.
- **`.github/workflows/build-universal-vsix.yml`**: the recommended
  release build - assembles the portable, all-platforms-bundled `.vsix`
  described above. Manual (`workflow_dispatch`) or on a `v*` tag.
- **`.github/workflows/build-windows.yml`** / **`build-linux.yml`**: the
  standalone-app installer builds (VSCodium fork path). Manual or on a
  `v*` tag, since each takes the better part of an hour and real
  bandwidth. These are where `scripts/build.sh` and the Flatpak manifest
  actually get exercised on a real internet connection - see
  `docs/toolchain-notes.md` for exactly what that means for confidence
  level.

## License

MIT - see [LICENSE](LICENSE).
