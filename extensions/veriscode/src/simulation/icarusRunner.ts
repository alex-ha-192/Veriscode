import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveBinary, resolveBundledPlatformDir } from "../toolchain";
import { generateTestbench, sampleTimeForStep } from "./testbenchGenerator";
import { parseVcd, sampleSignal } from "./vcdParser";
import { ParsedModule, SimStep, SimulationResult, WaveformSignal } from "./types";

export interface IcarusPaths {
  extensionPath: string;
  iverilogOverride?: string;
  vvpOverride?: string;
}

/**
 * A multi-module design (e.g. a CPU built from an ALU + register + memory,
 * each in its own file) needs every source file compiled together, not
 * just the one currently open. Rather than requiring students to manage a
 * file list or `\`include`, every other .sv/.v file that lives next to the
 * DUT is compiled alongside it automatically - "put your files in the same
 * folder" is the whole mental model, deliberately simple. Icarus resolves
 * instantiated submodules by name across all compiled units regardless of
 * which file they're declared in, so this is enough for the DUT to
 * instantiate any sibling module without extra ceremony.
 */
function siblingSources(modulePath: string): string[] {
  const dir = path.dirname(modulePath);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /\.(sv|v)$/i.test(f))
    .map((f) => path.join(dir, f))
    .filter((p) => path.resolve(p) !== path.resolve(modulePath))
    .sort();
}

/**
 * Bundled Icarus installs ship a "lib" support directory next to the
 * binaries (ivlpp/ivl/code generators and .vpi modules). Icarus bakes
 * absolute paths to that directory into both the iverilog binary's
 * defaults and into every compiled .vvp file - relocating the bundle
 * requires telling iverilog where to look at compile time (-B) *and*
 * telling vvp where to look at run time (IVERILOG_VPI_MODULE_PATH),
 * since the path baked into the .vvp file itself won't be valid on the
 * end user's machine. See https://github.com/steveicarus/iverilog/issues/1344.
 */
function bundledSupportDir(extensionPath: string): string | undefined {
  // Must resolve to the *same* platform directory resolveBinary() picked
  // (including its win32/darwin arm64->x64 emulation fallback) - the
  // support dir has to match whichever binary actually got launched.
  const platformDir = resolveBundledPlatformDir(extensionPath);
  if (!platformDir) return undefined;
  const dir = path.join(extensionPath, "bin", platformDir, "lib");
  return fs.existsSync(dir) ? dir : undefined;
}

function run(
  bin: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = cp.spawn(bin, args, { cwd, windowsHide: true, env: env ?? process.env });
    let output = "";
    child.stdout?.on("data", (d) => (output += d.toString()));
    child.stderr?.on("data", (d) => (output += d.toString()));
    child.on("error", (err) => resolve({ code: -1, output: `Failed to launch ${bin}: ${err.message}` }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

/**
 * Compiles the DUT + a generated testbench with Icarus Verilog, runs it,
 * and samples the resulting VCD at one point per requested step.
 */
export async function simulate(
  module: ParsedModule,
  modulePath: string,
  steps: SimStep[],
  clockPeriodNs: number,
  paths: IcarusPaths
): Promise<SimulationResult> {
  const iverilog = resolveBinary(paths.extensionPath, "iverilog", paths.iverilogOverride);
  const vvp = resolveBinary(paths.extensionPath, "vvp", paths.vvpOverride);
  if (!iverilog || !vvp) {
    return {
      ok: false,
      log:
        "Could not find the bundled Icarus Verilog toolchain (iverilog/vvp).\n" +
        "If you're running this extension standalone (outside a full Veriscode install), " +
        "install Icarus Verilog and make sure it's on your PATH.",
      signals: [],
    };
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-sim-"));
  const tbPath = path.join(workDir, "__veriscode_tb.sv");
  const vvpOutPath = path.join(workDir, "sim.vvp");
  const vcdPath = path.join(workDir, "waves.vcd");
  const supportDir = bundledSupportDir(paths.extensionPath);

  try {
    const tbSource = generateTestbench(module, steps, { dutPath: modulePath, vcdPath, clockPeriodNs });
    fs.writeFileSync(tbPath, tbSource, "utf8");

    const compileArgs = supportDir ? ["-B", supportDir] : [];
    compileArgs.push("-g2012", "-o", vvpOutPath, modulePath, ...siblingSources(modulePath), tbPath);
    const compile = await run(iverilog, compileArgs, workDir);
    if (compile.code !== 0) {
      return { ok: false, log: compile.output || "iverilog compilation failed.", signals: [] };
    }

    const vvpEnv = supportDir
      ? { ...process.env, IVERILOG_VPI_MODULE_PATH: supportDir }
      : process.env;
    const sim = await run(vvp, [vvpOutPath], workDir, vvpEnv);
    if (sim.code !== 0) {
      return { ok: false, log: sim.output || "vvp simulation failed.", signals: [] };
    }

    if (!fs.existsSync(vcdPath)) {
      return { ok: false, log: sim.output + "\n(no VCD was produced)", signals: [] };
    }

    const vcdText = fs.readFileSync(vcdPath, "utf8");
    const parsed = parseVcd(vcdText);

    const sampleTimes = steps.map((_, i) => sampleTimeForStep(i, module, clockPeriodNs));

    const signals: WaveformSignal[] = [];
    for (const port of module.ports) {
      const vcdVar = parsed.vars.find((v) => v.name === port.name);
      if (!vcdVar) continue;
      signals.push({
        name: port.name,
        direction: port.direction,
        width: port.width,
        values: sampleSignal(parsed, vcdVar.id, sampleTimes),
      });
    }

    return { ok: true, log: compile.output + sim.output, signals };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
