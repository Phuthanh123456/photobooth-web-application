$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $workspace
$node=Join-Path $workspace 'runtime/node.exe'
if(-not (Test-Path -LiteralPath $node)) {$node=(Get-Command node -ErrorAction Stop).Source}
$configFile=Join-Path $workspace '.local/event-config.json'
New-Item -ItemType Directory -Force -Path (Split-Path $configFile) | Out-Null
$config=if(Test-Path -LiteralPath $configFile) {Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json} else {[PSCustomObject]@{}}
if(Test-Path -LiteralPath (Join-Path $workspace '.local/event-instance.json')) {throw 'Stop Photobooth first. Camera setup must have exclusive USB access.'}
Write-Host 'Select your separately installed Nikon SDK directory (contains Module/Win/BinaryFile).'
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description='Select Nikon S-SDKZ-210BF-ALLIN folder'
if($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {throw 'Setup cancelled; no shutter issued.'}
$sdk=$dialog.SelectedPath
if(-not (Test-Path -LiteralPath (Join-Path $sdk 'Module/Win/BinaryFile/ControlServiceLayer.dll'))) {throw 'This folder does not contain the Nikon SDK runtime.'}
$env:NIKON_SDK_ROOT=$sdk
$env:STORAGE_ROOT=Join-Path $workspace 'storage'
Write-Host 'Close NX Tether, connect USB, switch on Z30. Profiles will be checked first.'
& $node --import tsx backend/src/nikon/hardware-cli.ts --setup
if($LASTEXITCODE -ne 0) {throw 'Nikon profile setup failed.'}
Write-Host 'One validation photo is required on this laptop/camera. The next command asks you to type the exact shutter confirmation. It never captures without that confirmation.'
$started=[DateTime]::UtcNow
& $node --import tsx backend/src/nikon/hardware-cli.ts --capture
if($LASTEXITCODE -ne 0) {throw 'Validation did not pass; real sessions remain locked. Inspect the report; do not automatically retry.'}
$reports=Get-ChildItem -LiteralPath (Join-Path $workspace 'storage/hardware-test') -Filter result.json -Recurse | Where-Object {$_.LastWriteTimeUtc -ge $started} | Sort-Object LastWriteTimeUtc -Descending
$report=$reports | Select-Object -First 1
if(-not $report) {throw 'Validation report not found.'}
$result=Get-Content -LiteralPath $report.FullName -Raw | ConvertFrom-Json
if($result.status -ne 'PASSED' -or $result.test -ne 'single-photo' -or $result.shutterCount -ne 1) {throw 'Validation report did not verify exactly one JPEG.'}
$relative='storage/hardware-test/'+$report.Directory.Name+'/result.json'
$config | Add-Member -NotePropertyName sdkRoot -NotePropertyValue $sdk -Force
$config | Add-Member -NotePropertyName validationFile -NotePropertyValue $relative -Force
$config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
Write-Host 'Setup passed. Next time, use Start Photobooth.cmd. No four-photo session was started.'
