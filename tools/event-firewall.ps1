param([ValidateRange(1024,65535)][int]$Port=5180)
$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
$configFile=Join-Path $workspace '.local/event-config.json'
if(Test-Path -LiteralPath $configFile) {
  $config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
  if($config.frontendPort) {$Port=[int]$config.frontendPort}
}
if($Port -lt 1024 -or $Port -gt 65535) {throw 'Invalid event port.'}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Right-click Allow iPad Network.cmd and choose Run as administrator once.'
  exit 1
}
$ruleName="CAP-Photobooth-Display-$Port"
if(-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name $ruleName -DisplayName "CAP Photobooth iPad display ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Private | Out-Null
}
Write-Host "Only TCP $Port on Private local networks is allowed. Set your trusted phone hotspot connection to Private in Windows."
Write-Host 'Keep the firewall enabled. Backend/camera ports are not opened.'
