// Verifies every *student-facing* template (with TODOs still blank)
// compiles and simulates without crashing - the whole point of using
// safe placeholder values (e.g. `q <= q;`, `result = 4'b0000;`) instead
// of leaving anything genuinely blank is that a student's very first
// "Simulate" click always works, showing wrong-but-not-broken output
// they can then debug - never a wall of compiler errors before they've
// written a single line themselves.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

const ROOT = path.join(__dirname, "..");
const WORKSHOP_DIR = path.join(ROOT, "templates", "workshop");

const cases = [
  { file: "01_half_adder.sv", steps: [{ a: "1", b: "1" }], clockPeriodNs: 10 },
  { file: "02_full_adder.sv", steps: [{ a: "1", b: "1", cin: "1" }], clockPeriodNs: 10 },
  { file: "03_alu.sv", steps: [{ a: "4'd6", b: "4'd3", op: "2'b01" }], clockPeriodNs: 10 },
  {
    file: "04_register.sv",
    steps: [
      { rst_n: "0", en: "0", d: "0" },
      { rst_n: "1", en: "1", d: "8'd42" },
    ],
    clockPeriodNs: 10,
  },
  {
    file: "05_register_file.sv",
    steps: [
      { rst_n: "0", we: "0", waddr: "0", wdata: "0", raddr1: "0", raddr2: "1" },
      { rst_n: "1", we: "1", waddr: "1", wdata: "8'd9", raddr1: "0", raddr2: "1" },
    ],
    clockPeriodNs: 10,
  },
  {
    file: "06_simple_cpu.sv",
    steps: [
      { rst_n: "0", load_en: "0", load_addr: "0", load_instr: "0" },
      { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" },
      { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" },
    ],
    clockPeriodNs: 10,
  },
];

let failures = 0;

async function main() {
  for (const { file, steps, clockPeriodNs } of cases) {
    const filePath = path.join(WORKSHOP_DIR, file);
    const src = fs.readFileSync(filePath, "utf8");
    const module = parseModule(src);
    if (!module) {
      console.log(`FAIL ${file}: could not parse a module declaration`);
      failures++;
      continue;
    }
    const result = await simulate(module, filePath, steps, clockPeriodNs, { extensionPath: ROOT });
    if (result.ok) {
      console.log(`PASS ${file}: compiled and simulated (with TODOs still blank)`);
    } else {
      console.log(`FAIL ${file}: did not simulate cleanly\n${result.log}`);
      failures++;
    }
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
