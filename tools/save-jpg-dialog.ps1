param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$request = Get-Content -LiteralPath $RequestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$owner = New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$dialog = New-Object System.Windows.Forms.SaveFileDialog
try {
  $dialog.Title = 'Save your CAP photobooth photo'
  $dialog.Filter = 'JPEG image (*.jpg)|*.jpg'
  $dialog.DefaultExt = 'jpg'
  $dialog.AddExtension = $true
  $dialog.OverwritePrompt = $true
  $dialog.CheckPathExists = $true
  $dialog.ValidateNames = $true
  $dialog.RestoreDirectory = $true
  $dialog.FileName = [string]$request.fileName
  if (Test-Path -LiteralPath $request.directory -PathType Container) { $dialog.InitialDirectory = [string]$request.directory }
  $owner.Show()
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    @{ status='selected'; path=$dialog.FileName; overwriteConfirmed=(Test-Path -LiteralPath $dialog.FileName) } | ConvertTo-Json -Compress | Write-Output
  } else { @{ status='cancelled' } | ConvertTo-Json -Compress | Write-Output }
} finally { $dialog.Dispose(); $owner.Close(); $owner.Dispose() }
