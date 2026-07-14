// Unit test for the win32/darwin arm64->x64 emulation fallback in
// toolchain.ts's resolveBundledPlatformDir(). Run with:
//   node test/toolchain-fallback.js   (after `npm run compile`)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveBundledPlatformDir } = require("../out/toolchain");

function withPlatform(platform, arch, fn) {
  const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const realArch = Object.getOwnPropertyDescriptor(process, "arch");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  Object.defineProperty(process, "arch", { value: arch, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, "platform", realPlatform);
    Object.defineProperty(process, "arch", realArch);
  }
}

let failures = 0;
function check(label, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: got ${actual}, expected ${expected}`);
  if (!pass) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veriscode-toolchain-test-"));
fs.mkdirSync(path.join(tmp, "bin", "win32-x64"), { recursive: true });
fs.mkdirSync(path.join(tmp, "bin", "darwin-arm64"), { recursive: true });
fs.mkdirSync(path.join(tmp, "bin", "linux-x64"), { recursive: true });

withPlatform("win32", "x64", () => {
  check("win32-x64 exact match", resolveBundledPlatformDir(tmp), "win32-x64");
});

withPlatform("win32", "arm64", () => {
  // No win32-arm64 dir staged - must fall back to win32-x64 (Prism emulation).
  check("win32-arm64 falls back to win32-x64", resolveBundledPlatformDir(tmp), "win32-x64");
});

withPlatform("darwin", "arm64", () => {
  // darwin-arm64 IS staged here - must prefer it over any x64 fallback.
  check("darwin-arm64 exact match preferred", resolveBundledPlatformDir(tmp), "darwin-arm64");
});

withPlatform("darwin", "x64", () => {
  check("darwin-x64 with no staged dir returns undefined", resolveBundledPlatformDir(tmp), undefined);
});

withPlatform("linux", "arm64", () => {
  // No emulation fallback exists for Linux - must return undefined, not linux-x64.
  check("linux-arm64 has no fallback (unlike win32/darwin)", resolveBundledPlatformDir(tmp), undefined);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
