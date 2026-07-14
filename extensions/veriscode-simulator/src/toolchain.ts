import * as fs from "fs";
import * as path from "path";

/**
 * Candidate bundled platform-arch directories to try, in order, for the
 * current OS/arch. Beyond an exact match, this falls back to the same
 * OS's x64 build on architectures whose OS provides transparent x64
 * emulation for unmodified binaries - Windows 11 on ARM (Prism) and
 * Apple Silicon macOS (Rosetta 2) - so a tool with no native arm64 build
 * (e.g. Icarus Verilog on Windows) still works there without needing a
 * separate native build.
 */
function candidatePlatformDirs(): string[] {
  const { platform, arch } = process;
  const exact = `${platform}-${arch}`;
  if (arch === "arm64" && (platform === "win32" || platform === "darwin")) {
    return [exact, `${platform}-x64`];
  }
  return [exact];
}

/**
 * Finds the bundled platform-arch directory (extension/bin/<dir>/) that
 * actually exists for the current machine, trying the emulation fallback
 * above before giving up. Returns undefined if nothing bundled applies -
 * e.g. when running from an unpackaged/dev checkout with no bin/ staged.
 */
export function resolveBundledPlatformDir(extensionPath: string): string | undefined {
  for (const dir of candidatePlatformDirs()) {
    if (fs.existsSync(path.join(extensionPath, "bin", dir))) {
      return dir;
    }
  }
  return undefined;
}

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
  const platformDir = resolveBundledPlatformDir(extensionPath);
  if (platformDir) {
    const bundled = path.join(extensionPath, "bin", platformDir, exe);
    if (fs.existsSync(bundled)) {
      return bundled;
    }
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
