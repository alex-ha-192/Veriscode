const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

async function main() {
  const fixture = path.join(__dirname, "fixtures", "adder.sv");
  const src = fs.readFileSync(fixture, "utf8");
  const module = parseModule(src);
  if (!module) throw new Error("failed to parse module");

  const steps = [
    { a: "4'd3", b: "4'd4" },
    { a: "4'd15", b: "4'd1" },
    { a: "4'd0", b: "4'd0" },
  ];

  const result = await simulate(module, fixture, steps, 10, { extensionPath: path.join(__dirname, "..") });
  console.log("ok:", result.ok);
  if (!result.ok) {
    console.log(result.log);
    process.exit(1);
  }
  const sum = result.signals.find((s) => s.name === "sum");
  console.log("sum values:", sum.values);
  const expected = ["7", "16", "0"];
  const pass = JSON.stringify(sum.values) === JSON.stringify(expected);
  console.log(pass ? "PASS" : "FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
