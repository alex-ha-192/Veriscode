// Manual demo (not part of the automated test suite): shows exactly what
// a brand-new user sees on their first, unedited "Simulate" click against
// the bundled default.sv template - i.e. buildDefaultSteps() run for
// real through the full simulate() pipeline.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { buildDefaultSteps } = require("../out/simulation/defaultSteps");
const { simulate } = require("../out/simulation/icarusRunner");

async function main() {
  const fixture = path.join(__dirname, "fixtures", "counter.sv");
  const src = fs.readFileSync(fixture, "utf8");
  const module = parseModule(src);
  const steps = buildDefaultSteps(module, 6);
  console.log("default steps:", steps);

  const result = await simulate(module, fixture, steps, 10, { extensionPath: path.join(__dirname, "..") });
  console.log("ok:", result.ok);
  if (!result.ok) {
    console.log("log:", result.log);
    process.exit(1);
  }
  for (const sig of result.signals) {
    console.log(`${sig.name} (${sig.direction}):`, sig.values);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
