param([ValidateRange(1024,65535)][int]$Port=3006)
$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
$binary=[IO.Path]::GetFullPath((Join-Path $workspace '.local/bin/cloudflared.exe'))
$originFile=Join-Path $workspace '.local/public-share-origin.txt'
$pidFile=Join-Path $workspace '.local/share-tunnel.pid'
if(-not (Test-Path -LiteralPath $binary)) {throw 'Run python tools/install-cloudflared.py first.'}
if(Test-Path -LiteralPath $pidFile) {
  $previousId=[int](Get-Content -LiteralPath $pidFile -Raw)
  $previous=Get-Process -Id $previousId -ErrorAction SilentlyContinue
  if($previous -and $previous.Path -eq $binary) {
    if(Test-Path -LiteralPath $originFile) {Get-Content -LiteralPath $originFile;exit 0}
    throw 'A share tunnel is already starting. Wait for its origin file.'
  }
}
$stamp=[DateTime]::UtcNow.Ticks
$stdout=Join-Path $workspace ".local/share-tunnel-$stamp.out.log"
$stderr=Join-Path $workspace ".local/share-tunnel-$stamp.err.log"
$child=Start-Process -FilePath $binary -ArgumentList @('tunnel','--url',"http://127.0.0.1:$Port",'--protocol','http2','--no-autoupdate') -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content -LiteralPath $pidFile -Value $child.Id -Encoding ASCII
$deadline=[DateTime]::UtcNow.AddSeconds(45)
while([DateTime]::UtcNow -lt $deadline) {
  $child.Refresh()
  if($child.HasExited) {throw "Share tunnel exited. Inspect $stderr"}
  $logs=(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)+(Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue)
  $match=[regex]::Match($logs,'https://[a-z0-9-]+\.trycloudflare\.com')
  if($match.Success) {
    Set-Content -LiteralPath $originFile -Value $match.Value -Encoding ASCII
    Write-Output $match.Value
    exit 0
  }
  Start-Sleep -Milliseconds 400
}
Stop-Process -Id $child.Id -ErrorAction SilentlyContinue
throw 'Share tunnel did not provide a public URL in time.'
