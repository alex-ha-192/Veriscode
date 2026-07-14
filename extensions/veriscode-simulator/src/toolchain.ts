import * as fs from "fs";
import * as path from "path";

/**
 * Locates a bundled or on-PATH toolchain binary. Bundled binaries live at
 * extension/bin/<platform>-<arch>/<name>[.exe] so packaged installers can
 * ship Icarus Verilog without the user ever installing anything themselves.
 */
export function resolveBinary(
  extensionPath: string,
  name: string,
  overrideSetting: string | undefined
): string | undefined {
  if (overrideSetting && overrideSetting.trim().length > 0) {
    return overrideSetting;
  }

  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const platformDir = `${process.platform}-${process.arch}`;
  const bundled = path.join(extensionPath, "bin", platformDir, exe);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  const pathDirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, exe);
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
