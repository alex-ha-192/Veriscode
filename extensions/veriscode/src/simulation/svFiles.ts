import * as fs from "fs";
import * as path from "path";

/**
 * Lists .sv/.v files directly inside `dir` (non-recursive - this codebase's
 * "put your files in one folder" model has no subfolder/import mechanism)
 * as absolute paths, sorted. Returns [] if the directory doesn't exist or
 * can't be read rather than throwing, so callers can treat "nothing there"
 * and "directory missing" the same way. Shared by icarusRunner.ts (finding
 * sibling sources to compile alongside a DUT) and moduleLibrary.ts (finding
 * modules to list in the composer's palette) - both used to independently
 * reimplement this same readdir-and-filter.
 */
export function listSvFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /\.(sv|v)$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort();
}
