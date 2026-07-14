# Veriscode

Veriscode is a customized build of VS Code for learning SystemVerilog: it
bakes in [Verible](https://github.com/chipsalliance/verible) (linting +
formatting) and an interactive, cycle-by-cycle simulator (Icarus Verilog
running invisibly underneath) as built-in extensions, then packages the
whole thing as a Windows installer and a Linux Flatpak - no separate tool
installs, no command line.

The workflow it's built for:

1. **Veriscode: New SystemVerilog Project** - creates a folder with a
   starter `.sv` file, the same way you'd create any new file.
2. Write SystemVerilog. Verible lints it as you type.
3. Click **▶ Simulate** above the module. An interactive timing diagram
   opens: click any input cell to type a value for that signal at that
   clock cycle (`1`, `0`, `x`, `4'hA`, ...), add more cycles, and watch the
   outputs update automatically as Icarus Verilog re-runs in the
   background.

## Try it now (without the full installer)

The full Windows/Flatpak build (below) takes 30-60+ minutes and needs a
real CI runner. You don't need it to try the actual functionality: both
extensions are ordinary VS Code extensions and work in **any existing VS
Code or VSCodium install** today.

```bash
npm install
npm run compile
cd extensions/veriscode-systemverilog && npx @vscode/vsce package --no-dependencies -o ../../dist/ && cd -
cd extensions/veriscode-simulator     && npx @vscode/vsce package --no-dependencies -o ../../dist/ && cd -
```

Then in VS Code: Extensions view → `...` menu → **Install from VSIX...**,
pick both files from `dist/`. You'll also need `iverilog`/`vvp` on your
PATH (`apt install iverilog`, `brew install icarus-verilog`, or the
[Windows installer](https://bleyer.org/icarus/)) and, optionally,
[Verible](https://github.com/chipsalliance/verible/releases) for linting -
the packaged Veriscode build bundles both so end users never have to do
this, but for local extension development it's the fastest loop.

## Architecture

```
veriscode/
  extensions/
    veriscode-systemverilog/   # syntax highlighting + Verible lint/format
    veriscode-simulator/       # project scaffolding + the simulator
  branding/                    # product.json overlay + icons
  toolchains/                  # fetches Verible/Icarus for bundling
  scripts/                     # build.sh: orchestrates the full fork build
  installers/flatpak/          # Flatpak manifest
  .github/workflows/           # CI: fast extension tests + slow full builds
  docs/toolchain-notes.md      # what's been validated vs. not, and why
```

**Why a VSCodium fork instead of a plain extension pack:** the goal is an
installer someone can double-click, with Verible/Icarus already inside -
not a VS Code extension the user has to separately go find and install a
simulator toolchain for. [VSCodium](https://github.com/VSCodium/vscodium)
already solves "build VS Code from source, unbranded, with a real
Windows/Linux packaging pipeline"; Veriscode reuses that pipeline instead
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
  `iverilog`, and packages `.vsix` files as build artifacts. Fast, cheap,
  always on.
- **`.github/workflows/build-windows.yml`** / **`build-linux.yml`**: the
  full installer builds. Manual (`workflow_dispatch`) or on a `v*` tag,
  since each takes the better part of an hour and real bandwidth. These
  are where `scripts/build.sh` and the Flatpak manifest actually get
  exercised on a real internet connection - see `docs/toolchain-notes.md`
  for exactly what that means for confidence level.

## License

MIT - see [LICENSE](LICENSE).
