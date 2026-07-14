# Installs Icarus Verilog via Chocolatey on a Windows CI runner, then
# copies the resulting binaries + support files (target .conf/.tgt files,
# .vpi modules, MinGW runtime DLLs) into the veriscode extension's
# bundled bin/win32-x64/ directory, so the packaged Windows installer never
# needs the end user to install anything themselves.
#
# Icarus bakes absolute paths to its support directory into both the
# iverilog binary and every .vvp file it compiles, so at runtime Veriscode
# passes `-B <lib>` to iverilog and sets IVERILOG_VPI_MODULE_PATH for vvp
# (see icarusRunner.ts) - this script's only job is to lay the files out
# predictably at bin/win32-x64/{iverilog.exe,vvp.exe,*.dll} and
# bin/win32-x64/lib/{*.vpi,*.conf,*.tgt,...}.
#
# Only targets win32-x64 - there's no native Chocolatey/Icarus build for
# Windows on ARM. toolchain.ts's resolveBinary() falls back to this x64
# build on win32-arm64 machines instead, which runs transparently under
# Windows 11's built-in x64 emulation (Prism).
#
# Requires network access - meant to run in GitHub Actions (windows-latest),
# not in the sandboxed Linux dev container this repo was authored in.

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path "$PSScriptRoot\.."
$Dest = Join-Path $RepoRoot "extensions\veriscode\bin\win32-x64"
$LibDest = Join-Path $Dest "lib"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path $LibDest | Out-Null

Write-Host "Installing Icarus Verilog via Chocolatey..."
choco install iverilog -y --no-progress | Write-Host

$SearchRoots = @(
  "C:\iverilog",
  "C:\Program Files\iverilog",
  "C:\Program Files (x86)\iverilog",
  "$env:ChocolateyInstall\lib\iverilog"
) | Where-Object { Test-Path $_ }

if ($SearchRoots.Count -eq 0) {
  throw "Could not find an Icarus Verilog install directory after 'choco install iverilog'."
}

function Find-First($roots, $filter) {
  foreach ($root in $roots) {
    $found = Get-ChildItem -Path $root -Recurse -Filter $filter -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found }
  }
  return $null
}

$IverilogExe = Find-First $SearchRoots "iverilog.exe"
$VvpExe = Find-First $SearchRoots "vvp.exe"
if (-not $IverilogExe -or -not $VvpExe) {
  throw "Could not locate iverilog.exe/vvp.exe under: $($SearchRoots -join ', ')"
}
$BinDir = $IverilogExe.Directory.FullName
Write-Host "Found Icarus binaries in $BinDir"

Copy-Item "$BinDir\*.exe" -Destination $Dest -Force
Copy-Item "$BinDir\*.dll" -Destination $Dest -Force -ErrorAction SilentlyContinue

# The support directory holds target codegen (.tgt/.conf) and VPI modules
# (.vpi); it's usually a sibling "lib\ivl" or "ivl" directory next to bin/.
$SupportDir = Get-ChildItem -Path ($SearchRoots) -Recurse -Filter "*.vpi" -File -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty DirectoryName
if (-not $SupportDir) {
  throw "Could not locate Icarus's .vpi support directory."
}
Write-Host "Found Icarus support directory in $SupportDir"
Copy-Item "$SupportDir\*" -Destination $LibDest -Recurse -Force

Write-Host "Icarus Verilog staged at $Dest"
Get-ChildItem $Dest | Format-Table Name, Length
