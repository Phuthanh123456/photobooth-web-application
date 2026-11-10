$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $workspace
$node=Join-Path $workspace 'runtime/node.exe'
if(-not (Test-Path -LiteralPath $node)) {$node=(Get-Command node -ErrorAction Stop).Source}
if(Test-Path -LiteralPath (Join-Path $workspace '.local/event-instance.json')) {throw 'Stop Photobooth before changing cloud configuration.'}
Write-Host 'One-time cloud setup. Complete HANDOFF_VI.md first (Render static site + Supabase SQL + dedicated uploader user).'
$project=Read-Host 'Supabase project URL (https://PROJECT.supabase.co)'
$key=Read-Host 'Supabase publishable/anon key (NEVER service_role)'
$email=Read-Host 'Dedicated uploader account email'
$password=Read-Host 'Dedicated uploader password' -AsSecureString
$guest=Read-Host 'Guest site origin (https://NAME.onrender.com)'
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
$config=[ordered]@{projectUrl=$project.Trim();anonKey=$key.Trim();email=$email.Trim();password=$plain;bucket='cap-photos';guestOrigin=$guest.Trim()}
$file=Join-Path $workspace '.local/cloud-config.json'
New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
[IO.File]::WriteAllText($file,($config | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
# The uploader password is local only. Restrict the file DACL without touching the SACL;
# Set-Acl on a newly constructed FileSecurity can require SeSecurityPrivilege on Windows.
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$icacls=Join-Path $env:SystemRoot 'System32/icacls.exe'
$aclResult=& $icacls $file '/inheritance:r' '/grant:r' "*$($identity):F" '*S-1-5-18:F' 2>&1
if($LASTEXITCODE -ne 0) {throw "Could not restrict cloud config permissions: $($aclResult -join ' ')"}
$plain=$null;$config=$null
& $node --import tsx tools/check-cloud.mjs
if($LASTEXITCODE -ne 0) {throw 'Cloud check failed. Fix the account/site/bucket configuration before opening the event.'}
Write-Host 'Cloud configured and upload/read-back/delete verified. Next launch uses durable cloud QR instead of a temporary tunnel.'
