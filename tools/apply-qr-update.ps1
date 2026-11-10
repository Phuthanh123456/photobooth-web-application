param([string]$AppDirectory)
$ErrorActionPreference='Stop'
Write-Host 'CAP - Immediate QR update'
Write-Host 'Finish the current session and run Stop Photobooth.cmd before installing.'
if(-not $AppDirectory) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description='Select the existing CAP-Photobooth-Windows folder containing Start Photobooth.cmd'
  $dialog.ShowNewFolderButton=$false
  if($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {exit 0}
  $AppDirectory=$dialog.SelectedPath
}
$appRoot=[IO.Path]::GetFullPath($AppDirectory).TrimEnd('\')
if(-not (Test-Path -LiteralPath (Join-Path $appRoot 'Start Photobooth.cmd')) -or -not (Test-Path -LiteralPath (Join-Path $appRoot 'backend/src/index.ts'))) {throw 'Select the original application folder, not the update folder.'}
$instance=Join-Path $appRoot '.local/event-instance.json'
if(Test-Path -LiteralPath $instance) {
  $record=Get-Content -LiteralPath $instance -Raw | ConvertFrom-Json
  $live=$false
  try {
    $reply=Invoke-WebRequest -Uri ('http://127.0.0.1:{0}/event-control/status' -f $record.port) -Headers @{'x-cap-stop-token'=$record.token} -UseBasicParsing -TimeoutSec 3
    $live=$reply.StatusCode -eq 200
  } catch { }
  if($live -or (Get-Process -Id $record.pid -ErrorAction SilentlyContinue)) {throw 'Photobooth is still running. Use Stop Photobooth.cmd, wait until stopped, then run this update again.'}
}
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'payload-manifest.json') -Raw | ConvertFrom-Json
$items=@()
foreach($entry in $manifest) {
  $relative=[string]$entry.file
  if($relative -notmatch '^(backend/src/(cloud-share|server)\.ts|tools/check-cloud\.mjs|shared/src/index\.ts|frontend/dist/[A-Za-z0-9_./-]+)$' -or $relative -match '(^|/)\.\.(/|$)') {throw 'Invalid update file path.'}
  $source=Join-Path (Join-Path $PSScriptRoot 'payload') $relative
  if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.sha256) {throw ('Update checksum failed: '+$relative)}
  $target=[IO.Path]::GetFullPath((Join-Path $appRoot $relative))
  if(-not $target.StartsWith($appRoot+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Update target is outside the application.'}
  $items+=@{Source=$source;Target=$target;Relative=$relative}
}
$backup=Join-Path $appRoot ('.local/updates/qr-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($item in $items) {
  if(Test-Path -LiteralPath $item.Target) {
    $saved=Join-Path $backup $item.Relative
    New-Item -ItemType Directory -Force -Path (Split-Path $saved -Parent) | Out-Null
    Copy-Item -LiteralPath $item.Target -Destination $saved
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $item.Target -Parent) | Out-Null
  Copy-Item -LiteralPath $item.Source -Destination $item.Target -Force
}
Write-Host 'Update installed. Camera setup, cloud login and saved photos are preserved.' -ForegroundColor Green
Write-Host ('Now open: '+(Join-Path $appRoot 'Start Photobooth.cmd'))
Write-Host 'Refresh the iPad Display page. QR appears after composition; the guest page waits for upload.'
