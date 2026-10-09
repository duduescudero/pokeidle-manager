param([ValidateSet('import','read','write','remove')][string]$Action, [ValidateRange(1,4)][int]$Slot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$vaultDirectory = Join-Path $env:LOCALAPPDATA 'PokeidleManager'
[void](New-Item -ItemType Directory -Path $vaultDirectory -Force)
$vaultFile = Join-Path $vaultDirectory "account-$Slot.secret"
if ($Action -eq 'remove') {
  if(Test-Path -LiteralPath $vaultFile){Remove-Item -LiteralPath $vaultFile}
  exit
}
if ($Action -eq 'read') {
  $encrypted = [IO.File]::ReadAllBytes($vaultFile)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Write([Text.Encoding]::UTF8.GetString($plain))
  exit
}
if ($Action -eq 'import') { $json = Get-Clipboard -Raw } else { $json = [Console]::In.ReadToEnd() }
$session = $json | ConvertFrom-Json
if (-not ($session.nick -is [string]) -or -not ($session.token -is [string]) -or -not $session.nick -or -not $session.token) { throw 'Sessão inválida no clipboard.' }
$encrypted = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($json), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$temporary = "$vaultFile.tmp"
[IO.File]::WriteAllBytes($temporary, $encrypted)
Move-Item -LiteralPath $temporary -Destination $vaultFile -Force
if ($Action -eq 'import') { Set-Clipboard -Value ' '; Write-Host "Conta importada no slot $Slot. Clipboard limpo." }
