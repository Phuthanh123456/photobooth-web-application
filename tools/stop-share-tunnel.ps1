$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
$binary=[IO.Path]::GetFullPath((Join-Path $workspace '.local/bin/cloudflared.exe'))
$pidFile=Join-Path $workspace '.local/share-tunnel.pid'
if(Test-Path -LiteralPath $pidFile) {
  $tunnelProcessId=[int](Get-Content -LiteralPath $pidFile -Raw)
  $child=Get-Process -Id $tunnelProcessId -ErrorAction SilentlyContinue
  if($child) {
    if([IO.Path]::GetFullPath($child.Path) -ne $binary) {throw 'Recorded PID is not the workspace share tunnel; refusing to stop another process.'}
    Stop-Process -Id $tunnelProcessId
  }
  Remove-Item -LiteralPath $pidFile
}
Write-Output 'Photobooth public share tunnel stopped.'
