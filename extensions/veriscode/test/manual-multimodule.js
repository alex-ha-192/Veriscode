// Verifies multi-file compilation: full_adder.sv instantiates half_adder,
// which lives in a sibling file in the same fixtures/multimodule/
// directory - icarusRunner.simulate() must auto-discover and compile it
// alongside the DUT (see siblingSources in icarusRunner.ts). This is the
// mechanism the CPU workshop's multi-module stages depend on.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

async function main() {
  const fixture = path.join(__dirname, "fixtures", "multimodule", "full_adder.sv");
  const src = fs.readFileSync(fixture, "utf8");
  const module = parseModule(src);
  if (!module) throw new Error("failed to parse full_adder module");

  // Combinational (no clock) - one time step per row of the truth table.
  const steps = [
    { a: "0", b: "0", cin: "0" },
    { a: "0", b: "0", cin: "1" },
    { a: "0", b: "1", cin: "0" },
    { a: "0", b: "1", cin: "1" },
    { a: "1", b: "0", cin: "0" },
    { a: "1", b: "0", cin: "1" },
    { a: "1", b: "1", cin: "0" },
    { a: "1", b: "1", cin: "1" },
  ];

  const result = await simulate(module, fixture, steps, 10, { extensionPath: path.join(__dirname, "..") });
  console.log("ok:", result.ok);
  if (!result.ok) {
    console.log(result.log);
    process.exit(1);
  }

  const sum = result.signals.find((s) => s.name === "sum").values;
  const cout = result.signals.find((s) => s.name === "cout").values;
  console.log("sum: ", sum);
  console.log("cout:", cout);

  const expectedSum = ["0", "1", "1", "0", "1", "0", "0", "1"];
  const expectedCout = ["0", "0", "0", "1", "0", "1", "1", "1"];
  const pass =
    JSON.stringify(sum) === JSON.stringify(expectedSum) &&
    JSON.stringify(cout) === JSON.stringify(expectedCout);
  console.log(pass ? "PASS" : "FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
