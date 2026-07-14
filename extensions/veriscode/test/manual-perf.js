// Performance regression test: a full compile+simulate cycle for the
// workshop's largest design (the CPU) should stay comfortably fast -
// each cell edit in the simulator panel triggers exactly one of these
// (debounced - see SET_VALUE_DEBOUNCE_MS in panel.ts). Measured baseline
// on this sandbox's amd64 dev container was ~15ms; the threshold here is
// deliberately very generous (30x+ that) so this only catches a gross
// regression (e.g. an accidental O(n^2) or a blocking call reintroduced
// into the hot path) rather than flaking on ordinary shared-CI-runner
// variance, especially on the arm64 matrix leg.
const path = require("path");
const fs = require("fs");
const { parseModule } = require("../out/simulation/portParser");
const { simulate } = require("../out/simulation/icarusRunner");

const ROOT = path.join(__dirname, "..");
const THRESHOLD_MS = 500;
const RUNS = 6;

async function main() {
  const file = path.join(ROOT, "test", "fixtures", "workshop-solutions", "06_simple_cpu.sv");
  const module = parseModule(fs.readFileSync(file, "utf8"));
  const steps = Array.from({ length: 12 }, (_, i) => ({
    rst_n: i === 0 ? "0" : "1",
    load_en: "0",
    load_addr: "0",
    load_instr: "0",
  }));

  // Warm-up run, excluded from timing (first spawn pays OS/fs caching costs).
  const warm = await simulate(module, file, steps, 10, { extensionPath: ROOT });
  if (!warm.ok) {
    console.error(warm.log);
    process.exit(1);
  }

  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const result = await simulate(module, file, steps, 10, { extensionPath: ROOT });
    times.push(Date.now() - t0);
    if (!result.ok) {
      console.error(result.log);
      process.exit(1);
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`simulate() latency over ${RUNS} runs (ms):`, times);
  console.log(`avg: ${avg.toFixed(1)}ms, max: ${Math.max(...times)}ms, threshold: ${THRESHOLD_MS}ms`);

  const pass = avg < THRESHOLD_MS;
  console.log(pass ? "PASS" : "FAIL (regression: simulation got significantly slower)");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
