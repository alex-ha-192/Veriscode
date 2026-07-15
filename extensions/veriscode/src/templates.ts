import * as path from "path";

export type TemplateKind = "single-renamed" | "files" | "workshop";

export interface TemplateOption {
  id: string;
  label: string;
  description: string;
  kind: TemplateKind;
  /**
   * Source file(s) relative to the extension's templates/ directory.
   * - "single-renamed": exactly one file; its module and filename are
   *   renamed to match the project name (the general-purpose starter).
   * - "files": copied verbatim, filenames and module names untouched -
   *   for designs that reference each other by a fixed module name
   *   (e.g. full_adder instantiating half_adder), renaming would break
   *   the cross-reference.
   * - "workshop": every file in templates/workshop/, copied verbatim,
   *   plus a generated guide (see newProject.ts).
   */
  files: string[];
}

export const TEMPLATES: TemplateOption[] = [
  {
    id: "counter",
    label: "Counter",
    description: "A synchronous counter with reset/enable - the simplest way to see the simulator in action.",
    kind: "single-renamed",
    files: ["default.sv"],
  },
  {
    id: "half_adder",
    label: "Half Adder",
    description: "The smallest possible circuit: two inputs, a sum and a carry-out. One TODO to fill in.",
    kind: "files",
    files: [path.join("workshop", "01_half_adder.sv")],
  },
  {
    id: "full_adder",
    label: "Full Adder (multi-module)",
    description: "A full adder built from two half adders - your first multi-file design.",
    kind: "files",
    files: [path.join("workshop", "01_half_adder.sv"), path.join("workshop", "02_full_adder.sv")],
  },
  {
    id: "cpu-workshop",
    label: "Workshop: Build a Simple CPU",
    description: "Six guided stages, half adder to a working 8-bit CPU. ~1-2 hours, no HDL experience needed.",
    kind: "workshop",
    files: [
      path.join("workshop", "01_half_adder.sv"),
      path.join("workshop", "02_full_adder.sv"),
      path.join("workshop", "03_alu.sv"),
      path.join("workshop", "04_register.sv"),
      path.join("workshop", "05_register_file.sv"),
      path.join("workshop", "06_simple_cpu.sv"),
    ],
  },
];
