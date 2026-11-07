param([switch]$RunTests)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$sdkRoot = $env:NIKON_SDK_ROOT
if (-not $sdkRoot -or -not (Test-Path -LiteralPath (Join-Path $sdkRoot 'Module/Win/HeaderFile/Maid3.h'))) { throw 'Set NIKON_SDK_ROOT to the extracted S-SDKZ-210BF-ALLIN directory.' }
$buildDir = Join-Path $workspace 'native/build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
$zigPath = Join-Path $workspace '.local/toolchain/ziglang/zig.exe'
$sourceFile = if ($RunTests) { 'native/tests/readiness.cpp' } else { 'native/bridge.cpp' }
$targetName = if ($RunTests) { 'readiness-test' } else { 'nikon-bridge' }
if (Test-Path -LiteralPath $zigPath) {
  python (Join-Path $workspace 'tools/prepare-sdk-compat.py')
  if ($LASTEXITCODE -ne 0) { throw 'SDK compatibility preparation failed' }
  & $zigPath c++ -target x86_64-windows-gnu -std=c++17 -O2 -fms-extensions -Wno-ignored-attributes -Wno-comment -DNOMINMAX -DCSLAYER "-I$workspace/.local/sdk-compat" "-I$sdkRoot/Module/Win/HeaderFile" (Join-Path $workspace $sourceFile) -lcrypt32 -o (Join-Path $buildDir "$targetName.exe")
} else {
  cmake -S (Join-Path $workspace 'native') -B $buildDir -A x64
  if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed; install VS 2022 C++ Build Tools, Windows SDK and CMake.' }
  cmake --build $buildDir --config Release --target $targetName
  if ($LASTEXITCODE -eq 0) { Copy-Item -LiteralPath (Join-Path $buildDir "Release/$targetName.exe") -Destination (Join-Path $buildDir "$targetName.exe") }
}
if ($LASTEXITCODE -ne 0) { throw 'Native bridge build failed' }
Write-Host "Built $buildDir/$targetName.exe. No SDK files were copied into this repository."
if ($RunTests) {
  & (Join-Path $buildDir "$targetName.exe")
  if ($LASTEXITCODE -ne 0) { throw 'Native readiness regression failed' }
}
