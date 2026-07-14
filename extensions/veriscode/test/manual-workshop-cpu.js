// Validates the CPU workshop capstone's *solution* logic against real
// iverilog: reset, run the built-in demo program (ACC = mem[8]+mem[9],
// store at mem[10], halt), then use the load_en mechanism to overwrite
// mem[0..3] with a new tiny program and confirm it runs too. This is the
// ground truth the student-facing TODO template is derived from - if this
// ever stops passing, the workshop is broken.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { buildDefaultSteps } = require("../out/simulation/defaultSteps");
const { simulate } = require("../out/simulation/icarusRunner");

const ROOT = path.join(__dirname, "..");
const FIXTURE = path.join(__dirname, "fixtures", "workshop-solutions", "06_simple_cpu.sv");

async function run(steps) {
  const src = fs.readFileSync(FIXTURE, "utf8");
  const module = parseModule(src);
  const result = await simulate(module, FIXTURE, steps, 10, { extensionPath: ROOT });
  if (!result.ok) {
    console.error(result.log);
    throw new Error("simulation failed");
  }
  const byName = {};
  for (const sig of result.signals) byName[sig.name] = sig.values;
  return byName;
}

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!pass) failures++;
}

async function main() {
  const module = parseModule(fs.readFileSync(FIXTURE, "utf8"));
  console.log(
    "ports:",
    module.ports.map((p) => `${p.direction} ${p.name}${p.resetPolarity ? ` (${p.resetPolarity})` : ""}`)
  );

  // 1) Built-in demo program: LDA 8; ADD 9; STA 10; HALT.
  //    mem[8]=3, mem[9]=5 -> expect acc=8, mem[10]=8 (not directly
  //    observable - mem isn't a port - but acc/halted prove it ran).
  const defaultSteps = buildDefaultSteps(module, 8).map((s) => ({ ...s, load_en: "0", load_addr: "0", load_instr: "0" }));
  const demo = await run(defaultSteps);
  console.log("demo trace: pc=", demo.pc, "acc=", demo.acc, "halted=", demo.halted);
  check("demo program: halted by cycle 7", demo.halted[7], "1");
  check("demo program: acc = 3 + 5 = 8", demo.acc[7], "8");

  // 2) Interactively load a *different* program via load_en, matching
  //    what a student does from the simulator grid: pause in reset,
  //    write four instructions, release, run.
  //    Program: LDA 8; SUB 9; STA 11; HALT - mem[8]=10, mem[9]=4 -> acc=6.
  const loadSteps = [
    { rst_n: "0", load_en: "0", load_addr: "0", load_instr: "0" }, // cycle 0: reset
    { rst_n: "1", load_en: "1", load_addr: "0", load_instr: "8'b0001_1000" }, // LDA 8
    { rst_n: "1", load_en: "1", load_addr: "1", load_instr: "8'b0011_1001" }, // SUB 9
    { rst_n: "1", load_en: "1", load_addr: "2", load_instr: "8'b0100_1011" }, // STA 11
    { rst_n: "1", load_en: "1", load_addr: "3", load_instr: "8'b1111_0000" }, // HALT
    { rst_n: "1", load_en: "1", load_addr: "8", load_instr: "8'd10" }, // mem[8] = 10
    { rst_n: "1", load_en: "1", load_addr: "9", load_instr: "8'd4" }, // mem[9] = 4
    { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" }, // release -> executes LDA
    { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" }, // SUB
    { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" }, // STA
    { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" }, // HALT
  ];
  const loaded = await run(loadSteps);
  console.log("loaded trace: pc=", loaded.pc, "acc=", loaded.acc, "halted=", loaded.halted);
  check("loaded program: halted by last cycle", loaded.halted[10], "1");
  check("loaded program: acc = 10 - 4 = 6", loaded.acc[10], "6");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
