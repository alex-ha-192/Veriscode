// Unit test for reset-polarity detection and the reset-pulse default
// step generation (webview/panel.ts's buildDefaultSteps, extracted to
// simulation/defaultSteps.ts specifically so it's testable without
// vscode). Run with: node test/default-steps.js (after `npm run compile`)
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { buildDefaultSteps, backfillSteps } = require("../out/simulation/defaultSteps");

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!pass) failures++;
}

// counter.sv: rst_n (active-low reset), en (not reset-like), clk (excluded).
const counterSrc = fs.readFileSync(path.join(__dirname, "fixtures", "counter.sv"), "utf8");
const counterModule = parseModule(counterSrc);
const rstPort = counterModule.ports.find((p) => p.name === "rst_n");
const enPort = counterModule.ports.find((p) => p.name === "en");
check("rst_n detected as active-low reset", rstPort.resetPolarity, "active-low");
check("en not detected as reset-like", enPort.resetPolarity, undefined);

const steps = buildDefaultSteps(counterModule, 4);
check("cycle 0: reset asserted (rst_n=0), en=0", steps[0], { rst_n: "0", en: "0" });
check("cycle 1: reset released (rst_n=1), en=0", steps[1], { rst_n: "1", en: "0" });
check("cycle 2: reset stays released", steps[2], { rst_n: "1", en: "0" });
check("cycle 3: reset stays released", steps[3], { rst_n: "1", en: "0" });

// Active-high naming convention.
const activeHighModule = parseModule(`
  module foo (
    input logic clk,
    input logic reset,
    input logic data_in
  );
  endmodule
`);
const resetPort = activeHighModule.ports.find((p) => p.name === "reset");
check("bare 'reset' detected as active-high", resetPort.resetPolarity, "active-high");
const activeHighSteps = buildDefaultSteps(activeHighModule, 2);
check("active-high: cycle 0 asserted (reset=1)", activeHighSteps[0].reset, "1");
check("active-high: cycle 1 released (reset=0)", activeHighSteps[1].reset, "0");

// Data ports that merely contain the "rst"/"reset" substring must NOT be
// misdetected as resets (the whole point of token-anchored matching).
const falsePositiveModule = parseModule(`
  module bar (
    input  logic       clk,
    input  logic [7:0] burst_len,
    input  logic       first_word,
    input  logic       worst_case,
    input  logic       preset_value
  );
  endmodule
`);
for (const name of ["burst_len", "first_word", "worst_case", "preset_value"]) {
  const p = falsePositiveModule.ports.find((x) => x.name === name);
  check(`'${name}' not misdetected as reset`, p.resetPolarity, undefined);
}

// Common reset spellings and their polarities.
const spellings = {
  rst: "active-high",
  rst_n: "active-low",
  rstn: "active-low",
  reset_n: "active-low",
  resetn: "active-low",
  nrst: "active-low",
  arst: "active-high",
  aresetn: "active-low",
  reset_b: "active-low",
  rst_ni: "active-low",
};
for (const [name, expected] of Object.entries(spellings)) {
  const m = parseModule(`module t (input logic clk, input logic ${name}); endmodule`);
  const p = m.ports.find((x) => x.name === name);
  check(`'${name}' -> ${expected}`, p && p.resetPolarity, expected);
}

// backfillSteps: a port introduced after the step table already exists
// (e.g. editing the file mid-session to add a new input) must get a
// default value, not be left undefined - undefined reaches the testbench
// generator as a crash (see testbenchGenerator.js's sanitizeValue).
const backfillModule = parseModule(`
  module baz (
    input logic clk,
    input logic rst_n,
    input logic new_port
  );
  endmodule
`);
const partialSteps = [{ rst_n: "0" }, { rst_n: "1" }, { rst_n: "1" }];
backfillSteps(backfillModule, partialSteps);
check("backfill: existing values untouched", partialSteps.map((s) => s.rst_n), ["0", "1", "1"]);
check("backfill: new port filled with default", partialSteps.map((s) => s.new_port), ["0", "0", "0"]);

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
