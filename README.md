# Veriscode

Veriscode adds Verible (linting + formatting) and an interactive,
cycle-by-cycle SystemVerilog simulator (Icarus Verilog running invisibly
underneath) to VS Code, as two extensions - no separate tool installs, no
command line.

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

## Install

Two ordinary VS Code extensions - install into any VS Code, VSCodium,
Cursor, etc., on Windows, macOS, or Linux, via **Install from VSIX...**
in the Extensions view.

**The bundled, self-contained build** (recommended) packages Verible +
Icarus Verilog for Windows, macOS (Intel + Apple Silicon), and Linux all
into the same `.vsix` - `resolveBinary()` in each extension picks the
right one for whatever OS it's actually running on at runtime, so the end
user never installs or even sees Verible/Icarus directly.
`.github/workflows/build-universal-vsix.yml` builds this: a matrix job
stages Verible (one job - it ships prebuilt static binaries for every
platform already) and Icarus Verilog (one job per OS, since that needs a
real per-platform install), then a final job merges everything into one
checkout and packages both `.vsix` files once. Trigger it manually
(`workflow_dispatch`) or by pushing a `v*` tag; the built files show up
as a workflow artifact.

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

## Architecture

```
veriscode/
  extensions/
    veriscode-systemverilog/   # syntax highlighting + Verible lint/format
    veriscode-simulator/       # project scaffolding + the simulator
  toolchains/                  # fetches Verible/Icarus for bundling
  .github/workflows/           # CI: extension tests + universal vsix build
  docs/toolchain-notes.md      # what's been validated vs. not, and why
```

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
- **`.github/workflows/build-universal-vsix.yml`**: the release build -
  assembles the portable, all-platforms-bundled `.vsix` described above.
  Manual (`workflow_dispatch`) or on a `v*` tag.

## License

MIT - see [LICENSE](LICENSE).
