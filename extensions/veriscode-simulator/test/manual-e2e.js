// Manual end-to-end smoke test (not part of the vscode extension test
// suite): parses counter.sv, drives it through 6 hand-authored cycles, runs
// it through real iverilog/vvp, and prints the sampled waveform. Run with:
//   node out/../test/manual-e2e.js   (after `npm run compile`)
const path = require("path");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

async function main() {
  const fixture = path.join(__dirname, "fixtures", "counter.sv");
  const fs = require("fs");
  const src = fs.readFileSync(fixture, "utf8");
  const module = parseModule(src);
  if (!module) throw new Error("failed to parse module");
  console.log("Parsed module:", JSON.stringify(module.ports, null, 2));

  const steps = [
    { rst_n: "0", en: "0" },
    { rst_n: "1", en: "0" },
    { rst_n: "1", en: "1" },
    { rst_n: "1", en: "1" },
    { rst_n: "1", en: "0" },
    { rst_n: "1", en: "1" },
  ];

  const result = await simulate(module, fixture, steps, 10, { extensionPath: path.join(__dirname, "..") });
  console.log("ok:", result.ok);
  console.log("log:\n", result.log);
  console.log("signals:", JSON.stringify(result.signals, null, 2));

  if (!result.ok) process.exit(1);

  // steps: [rst_n=0,en=0] [rst_n=1,en=0] [rst_n=1,en=1] [rst_n=1,en=1] [rst_n=1,en=0] [rst_n=1,en=1]
  const countSignal = result.signals.find((s) => s.name === "count");
  const expected = ["0", "0", "1", "2", "2", "3"];
  if (!countSignal) throw new Error("no 'count' signal in output");
  console.log("count values:", countSignal.values, "expected:", expected);
  const okCount = JSON.stringify(countSignal.values) === JSON.stringify(expected);
  console.log(okCount ? "PASS" : "FAIL");
  process.exit(okCount ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
