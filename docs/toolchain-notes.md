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

## Written from research, not yet run end-to-end

These depend on outbound access this sandbox doesn't have (GitHub
releases, Chocolatey, Homebrew) and/or a platform this sandbox isn't
(Windows, macOS). They're grounded in real, fetched documentation (cited
in code comments) rather than guesses, but expect the first CI run of
`build-universal-vsix.yml` to need a fixup pass:

- `toolchains/fetch-verible.sh` - asset naming was confirmed against a real
  Verible release page, but the archive's internal `bin/` layout is
  discovered at run time (`find ... -type d -name bin`) rather than
  hardcoded, specifically to tolerate this.
- `toolchains/fetch-icarus-windows.ps1` - the Chocolatey package's install
  layout isn't documented publicly; the script searches several plausible
  install roots rather than assuming one.
- `toolchains/fetch-icarus-macos.sh` - same idea via Homebrew; `brew
  --prefix` plus a `find` for the `ivl` support directory, rather than a
  hardcoded path, for the same reason.

If a CI run fails on one of these, the fix is almost always: inspect the
step's log and adjust the one wrong path/flag, then re-run - the Linux leg
of the same mechanism is fully verified (see above), so the overall
approach is sound even where a specific path guess needs a tweak.
