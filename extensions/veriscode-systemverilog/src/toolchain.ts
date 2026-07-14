import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Locates a bundled or on-PATH toolchain binary. Bundled binaries live at
 * extension/bin/<platform>-<arch>/<name>[.exe] so packaged installers can
 * ship Verible without the user ever installing anything themselves.
 */
export function resolveBinary(
  context: vscode.ExtensionContext,
  name: string,
  overrideSetting: string | undefined
): string | undefined {
  if (overrideSetting && overrideSetting.trim().length > 0) {
    return overrideSetting;
  }

  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const platformDir = `${process.platform}-${process.arch}`;
  const bundled = path.join(context.extensionPath, "bin", platformDir, exe);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  // Fall back to whatever is on PATH (useful when developing the extension
  // standalone, before it has been baked into a full Veriscode build).
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, exe);
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
