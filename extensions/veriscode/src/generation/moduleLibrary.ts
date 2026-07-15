import * as fs from "fs";
import { parseModule } from "../simulation/portParser";
import { listSvFiles } from "../simulation/svFiles";
import { ParsedModule } from "../simulation/types";

export interface LibraryModule {
  module: ParsedModule;
  /** Absolute path to the .sv/.v file this module was parsed from. */
  filePath: string;
}

/**
 * Scans `folder` (non-recursive - matches the rest of this codebase's "put
 * your files in one folder, no import system" teaching model) for .sv/.v
 * files and parses each with the same lightweight parser used everywhere
 * else. Files with no `module ... (...)` declaration are silently skipped;
 * this is a convenience listing for the composer's palette, not a build
 * step, so a stray non-module file just doesn't show up.
 */
export function listModulesInFolder(folder: string): LibraryModule[] {
  const modules: LibraryModule[] = [];
  for (const filePath of listSvFiles(folder)) {
    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const module = parseModule(text);
    if (module) {
      modules.push({ module, filePath });
    }
  }
  return modules;
}
