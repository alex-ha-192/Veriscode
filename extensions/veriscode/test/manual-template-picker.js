// Verifies the template picker's data (src/templates.ts) and the file-
// copy logic newProject.ts performs for each template kind, without
// needing to mock vscode (newProject.ts itself imports vscode at module
// load, so it can't be required directly from plain node - but
// templates.ts has no vscode dependency, so it's imported directly here
// rather than duplicated). This reimplements the same fs operations
// newProjectCommand does, against a real temp directory, then simulates
// the result with real iverilog for the multi-file cases where a broken
// cross-reference would only show up at compile time.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { TEMPLATES } = require("../out/templates");

const ROOT = path.join(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) failures++;
}

function sanitizeModuleName(name) {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `m_${cleaned}`;
}

function writeSingleRenamed(projectDir, template, moduleName) {
  const srcPath = path.join(TEMPLATES_DIR, template.files[0]);
  const src = fs.readFileSync(srcPath, "utf8");
  const originalName = /\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)/.exec(src)?.[1];
  const renamed = originalName
    ? src.replace(new RegExp(`\\bmodule\\s+${originalName}\\b`), `module ${moduleName}`)
    : src;
  fs.writeFileSync(path.join(projectDir, `${moduleName}.sv`), renamed, "utf8");
}

function copyFilesVerbatim(projectDir, template) {
  for (const relPath of template.files) {
    fs.copyFileSync(path.join(TEMPLATES_DIR, relPath), path.join(projectDir, path.basename(relPath)));
  }
}

async function main() {
  // 1) Every file referenced by every template must actually exist.
  for (const t of TEMPLATES) {
    for (const relPath of t.files) {
      check(`${t.id}: ${relPath} exists`, fs.existsSync(path.join(TEMPLATES_DIR, relPath)));
    }
  }
  check("workshop GUIDE.md exists", fs.existsSync(path.join(TEMPLATES_DIR, "workshop", "GUIDE.md")));

  // 2) "counter" (single-renamed): module gets renamed correctly.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-tmpl-counter-"));
    const moduleName = sanitizeModuleName("blinky");
    const template = TEMPLATES.find((t) => t.id === "counter");
    writeSingleRenamed(dir, template, moduleName);
    const outPath = path.join(dir, `${moduleName}.sv`);
    check("counter: renamed file exists", fs.existsSync(outPath));
    const content = fs.readFileSync(outPath, "utf8");
    check("counter: module renamed to project name", new RegExp(`\\bmodule\\s+${moduleName}\\b`).test(content));
    check("counter: old name gone", !/\bmodule\s+counter\b/.test(content));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3) "full_adder" (files, multi-module): both files land, and the
  //    result actually simulates through real iverilog.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-tmpl-full-adder-"));
    copyFilesVerbatim(dir, TEMPLATES.find((t) => t.id === "full_adder"));
    check("full_adder: half_adder.sv copied", fs.existsSync(path.join(dir, "01_half_adder.sv")));
    check("full_adder: full_adder.sv copied", fs.existsSync(path.join(dir, "02_full_adder.sv")));

    const { parseModule } = require("../out/simulation/portParser");
    const { simulate } = require("../out/simulation/icarusRunner");
    const file = path.join(dir, "02_full_adder.sv");
    const module = parseModule(fs.readFileSync(file, "utf8"));
    const result = await simulate(module, file, [{ a: "1", b: "1", cin: "1" }], 10, { extensionPath: ROOT });
    check("full_adder: scaffolded project actually simulates", result.ok);
    if (!result.ok) console.log(result.log);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4) "cpu-workshop": all six files + GUIDE.md-as-README land, and the
  //    capstone still simulates from within the full scaffolded folder.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-tmpl-workshop-"));
    const template = TEMPLATES.find((t) => t.id === "cpu-workshop");
    copyFilesVerbatim(dir, template);
    fs.copyFileSync(path.join(TEMPLATES_DIR, "workshop", "GUIDE.md"), path.join(dir, "README.md"));
    for (const relPath of template.files) {
      check(`workshop: ${path.basename(relPath)} copied`, fs.existsSync(path.join(dir, path.basename(relPath))));
    }
    check("workshop: README.md (from GUIDE.md) copied", fs.existsSync(path.join(dir, "README.md")));

    const { parseModule } = require("../out/simulation/portParser");
    const { simulate } = require("../out/simulation/icarusRunner");
    const file = path.join(dir, "06_simple_cpu.sv");
    const module = parseModule(fs.readFileSync(file, "utf8"));
    const steps = [
      { rst_n: "0", load_en: "0", load_addr: "0", load_instr: "0" },
      { rst_n: "1", load_en: "0", load_addr: "0", load_instr: "0" },
    ];
    const result = await simulate(module, file, steps, 10, { extensionPath: ROOT });
    check("workshop: capstone simulates from the scaffolded folder", result.ok);
    if (!result.ok) console.log(result.log);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
