// Validates the middle workshop stages (ALU, register, register_file)
// against real iverilog - these are the ground-truth solutions the
// student-facing templates are derived from.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

const ROOT = path.join(__dirname, "..");
const FIXDIR = path.join(__dirname, "fixtures", "workshop-solutions");

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!pass) failures++;
}

async function simFile(name, steps, clockPeriodNs = 10) {
  const file = path.join(FIXDIR, name);
  const module = parseModule(fs.readFileSync(file, "utf8"));
  if (!module) throw new Error(`failed to parse ${name}`);
  const result = await simulate(module, file, steps, clockPeriodNs, { extensionPath: ROOT });
  if (!result.ok) {
    console.error(result.log);
    throw new Error(`${name} simulation failed`);
  }
  const byName = {};
  for (const sig of result.signals) byName[sig.name] = sig.values;
  return byName;
}

async function main() {
  // --- 03_alu.sv: exercise all four ops ---
  const aluSteps = [
    { a: "4'd6", b: "4'd3", op: "2'b00" }, // ADD -> 9
    { a: "4'd6", b: "4'd3", op: "2'b01" }, // SUB -> 3
    { a: "4'd6", b: "4'd3", op: "2'b10" }, // AND -> 2
    { a: "4'd6", b: "4'd3", op: "2'b11" }, // OR  -> 7
    { a: "4'd5", b: "4'd5", op: "2'b01" }, // SUB -> 0 (zero flag)
  ];
  const alu = await simFile("03_alu.sv", aluSteps);
  console.log("alu result:", alu.result, "zero:", alu.zero);
  check("alu ADD", alu.result[0], "9");
  check("alu SUB", alu.result[1], "3");
  check("alu AND", alu.result[2], "2");
  check("alu OR", alu.result[3], "7");
  check("alu SUB->0 sets zero flag", alu.zero[4], "1");

  // --- 04_register.sv: reset, load, hold ---
  const regSteps = [
    { rst_n: "0", en: "0", d: "8'd0" }, // reset
    { rst_n: "1", en: "1", d: "8'd42" }, // load 42
    { rst_n: "1", en: "0", d: "8'd99" }, // en=0, must hold at 42 despite d changing
    { rst_n: "1", en: "1", d: "8'd7" }, // load 7
  ];
  const reg = await simFile("04_register.sv", regSteps);
  console.log("register q:", reg.q);
  check("register: reset -> 0", reg.q[0], "0");
  check("register: loads d when en=1", reg.q[1], "42");
  check("register: holds value when en=0", reg.q[2], "42");
  check("register: loads new value", reg.q[3], "7");

  // --- 05_register_file.sv: write then read back from two ports ---
  const rfSteps = [
    { rst_n: "0", we: "0", waddr: "0", wdata: "0", raddr1: "0", raddr2: "1" },
    { rst_n: "1", we: "1", waddr: "2'd1", wdata: "8'd11", raddr1: "0", raddr2: "1" },
    { rst_n: "1", we: "1", waddr: "2'd2", wdata: "8'd22", raddr1: "2'd1", raddr2: "2'd2" },
    { rst_n: "1", we: "0", waddr: "0", wdata: "0", raddr1: "2'd1", raddr2: "2'd2" },
  ];
  const rf = await simFile("05_register_file.sv", rfSteps);
  console.log("register_file rdata1:", rf.rdata1, "rdata2:", rf.rdata2);
  check("regfile: reads back reg1=11", rf.rdata1[3], "11");
  check("regfile: reads back reg2=22", rf.rdata2[3], "22");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
