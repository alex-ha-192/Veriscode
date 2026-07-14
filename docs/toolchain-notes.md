# Toolchain & sandbox notes

This documents what was actually validated while building Veriscode, versus
what's written correctly-to-the-best-of-research but only exercisable in
CI (which has real internet access; the dev sandbox this repo was authored
in does not - outbound requests to `github.com` and Chocolatey are blocked
there by an egress policy, `apt` and `registry.npmjs.org`/`pypi.org` are
allowed).

## Validated locally, with a real toolchain

- **The simulation engine** (`extensions/veriscode-simulator/src/simulation/`):
  port parsing (including parameterized widths like `[WIDTH-1:0]`),
  testbench generation, VCD parsing, and sample-time alignment were run
  end-to-end against a real `iverilog`/`vvp` (installed via `apt` in the
  sandbox) for both a clocked design (`test/fixtures/counter.sv`) and a
  combinational one (`test/fixtures/adder.sv`) - see
  `test/manual-e2e*.js`, and `.github/workflows/ci.yml`, which runs the
  same checks on every push.
- **Both extensions compile cleanly** under `tsc --strict` and **package**
  into valid `.vsix` files via `@vscode/vsce`. You can sideload these into
  any existing VS Code or VSCodium install today - see the root README's
  "Try it now" section - without waiting for a full Veriscode build.
- The `-B`/`IVERILOG_VPI_MODULE_PATH` relocation handling in
  `icarusRunner.ts` (based on a documented Icarus Verilog portability
  issue, steveicarus/iverilog#1344) was **verified for real**, not just
  compiled: `toolchains/fetch-icarus-linux.sh` copied the sandbox's
  `iverilog`/`vvp`/support-directory out of `/usr/bin` and `/usr/lib` into
  the extension's `bin/linux-x64/` layout, the original `/usr/bin`
  binaries were then deleted entirely, and the simulation engine's test
  suite still passed using only the relocated copy. The Windows/macOS
  legs (`fetch-icarus-windows.ps1`, `fetch-icarus-macos.sh`) use the
  identical mechanism but couldn't be exercised the same way here (no
  Windows/macOS runner, no Chocolatey/Homebrew network access in this
  sandbox).

## Fixed after the first real CI run

Two layout guesses turned out wrong once actually run on real Windows/macOS
CI (this sandbox has no way to exercise either), both now fixed by
searching for content instead of assuming a name/structure:

- `toolchains/fetch-verible.sh` (win32-x64 leg): assumed the archive
  contained a `bin/` directory; `python3 -m zipfile` doesn't convert
  backslash path separators on POSIX, so a Windows-built zip using
  `bin\name.exe`-style entries extracted as oddly-named flat files
  instead of a real subdirectory, and the `find -type d -name bin` search
  found nothing. Fixed by preferring `unzip` (which does convert
  backslashes) when available, and - more importantly - no longer
  depending on a `bin/` directory existing at all: each binary is now
  found by `find -iname "*<name><ext>"` directly, regardless of archive
  layout.
- `toolchains/fetch-icarus-macos.sh` / `fetch-icarus-linux.sh`: assumed
  Icarus's support directory is named `ivl` - true for Debian/apt (which
  is how the Linux leg was verified locally, see below), but Homebrew's
  build doesn't use that name, and it's plausible other distros don't
  either. Fixed by searching for a `.vpi` file's containing directory
  instead of a specific directory name - a `.vpi` module is the one thing
  guaranteed to be in that directory regardless of what it's called.
  (`fetch-icarus-windows.ps1` already used this content-based approach
  from the start, which is why it didn't hit the same bug.)

## Validated with a real toolchain

- **The simulation engine** (`extensions/veriscode-simulator/src/simulation/`):
  port parsing (including parameterized widths like `[WIDTH-1:0]`),
  testbench generation, VCD parsing, and sample-time alignment were run
  end-to-end against a real `iverilog`/`vvp` (installed via `apt` in the
  sandbox) for both a clocked design (`test/fixtures/counter.sv`) and a
  combinational one (`test/fixtures/adder.sv`) - see
  `test/manual-e2e*.js`, and `.github/workflows/ci.yml`, which runs the
  same checks on every push, on both amd64 and arm64 Linux runners.
- **Both extensions compile cleanly** under `tsc --strict` and **package**
  into valid `.vsix` files via `@vscode/vsce`. You can sideload these into
  any existing VS Code or VSCodium install today - see the root README's
  "Try it now" section - without waiting for a full Veriscode build.
- The `-B`/`IVERILOG_VPI_MODULE_PATH` relocation handling in
  `icarusRunner.ts` (based on a documented Icarus Verilog portability
  issue, steveicarus/iverilog#1344) was **verified for real**, not just
  compiled: `toolchains/fetch-icarus-linux.sh` copied the sandbox's
  `iverilog`/`vvp`/support-directory out of `/usr/bin` and `/usr/lib` into
  the extension's `bin/linux-x64/` layout, the original `/usr/bin`
  binaries were then deleted entirely, and the simulation engine's test
  suite still passed using only the relocated copy.
- The win32/darwin arm64→x64 emulation fallback in `toolchain.ts`
  (`resolveBundledPlatformDir`) is covered by
  `test/toolchain-fallback.js`, including the negative case: Linux arm64
  must *not* fall back to an x64 binary, since no transparent emulation
  exists there.

## Still unverified

- The Windows/macOS Icarus fetch scripts' actual output (not just their
  logic) - the fixes above address the specific failures reported from a
  real CI run, but haven't been re-run end-to-end here (no
  Windows/macOS/Chocolatey/Homebrew access in this sandbox). If another
  layout surprise shows up, the fix is almost always the same shape:
  inspect the failing step's log, stop assuming a specific name/structure,
  search by content instead.
