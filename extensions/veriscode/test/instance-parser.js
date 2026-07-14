// Unit tests for instanceParser.ts: real curriculum files (both the true
// positive - full_adder instantiating two half_adders - and the true
// negatives, every other stage, which have zero instances), plus
// synthetic cases specifically targeting the false-positive risks
// (case/unique case, if/else, a plain function call) that motivated
// stripping procedural blocks before scanning.
const fs = require("fs");
const path = require("path");
const { parseInstances } = require("../out/simulation/instanceParser");

const FIXDIR = path.join(__dirname, "fixtures", "workshop-solutions");

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!pass) failures++;
}

function read(name) {
  return fs.readFileSync(path.join(FIXDIR, name), "utf8");
}

// --- True positive: full_adder.sv instantiates two half_adders ---
const fullAdderInstances = parseInstances(read("02_full_adder.sv"));
console.log("full_adder instances:", JSON.stringify(fullAdderInstances, null, 2));
check("full_adder: finds 2 instances", fullAdderInstances.length, 2);
check("full_adder: ha0 is a half_adder", fullAdderInstances[0]?.moduleType, "half_adder");
check("full_adder: ha0 instance name", fullAdderInstances[0]?.instanceName, "ha0");
check("full_adder: ha0.a connects to a", fullAdderInstances[0]?.connections.a, "a");
check("full_adder: ha0.sum connects to sum0", fullAdderInstances[0]?.connections.sum, "sum0");
check("full_adder: ha1 instance name", fullAdderInstances[1]?.instanceName, "ha1");
check("full_adder: ha1.a connects to sum0 (chained)", fullAdderInstances[1]?.connections.a, "sum0");

// --- True negatives: every other stage has zero instances ---
for (const file of ["01_half_adder.sv", "03_alu.sv", "04_register.sv", "05_register_file.sv", "06_simple_cpu.sv"]) {
  const instances = parseInstances(read(file));
  check(`${file}: no false-positive instances (has case/if/always blocks)`, instances.length, 0);
}

// --- Synthetic false-positive traps ---
const caseTrap = parseInstances(`
  module m (input logic [1:0] op, output logic [3:0] y);
    always_comb begin
      unique case (op)
        2'b00: y = 4'd1;
        default: y = 4'd0;
      endcase
    end
  endmodule
`);
check("synthetic: 'unique case (...)' not mistaken for an instance", caseTrap.length, 0);

const ifTrap = parseInstances(`
  module m (input logic en, output logic y);
    always_comb begin
      if (en) y = 1'b1;
      else y = 1'b0;
    end
  endmodule
`);
check("synthetic: if/else not mistaken for an instance", ifTrap.length, 0);

const realInstanceAmongNoise = parseInstances(`
  module m (input logic a, input logic b, output logic y);
    always_comb begin
      case (a)
        1'b0: y = b;
        default: y = 1'b0;
      endcase
    end
    half_adder ha (.a(a), .b(b), .sum(y), .carry());
  endmodule
`);
check("synthetic: real instance still found alongside a case block", realInstanceAmongNoise.length, 1);
check("synthetic: real instance has the right module type", realInstanceAmongNoise[0]?.moduleType, "half_adder");

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
