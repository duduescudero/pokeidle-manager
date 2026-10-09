param([string]$ProjectRoot)
$ErrorActionPreference='Stop'
# GUI-only bootstrap: the same trusted Windows PowerShell host used by the panel.
# The launcher starts the existing backend; it never reads or changes accounts.
if (-not $ProjectRoot) {
  $ProjectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  if(-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'Iniciar.cmd'))) {$ProjectRoot=[IO.Path]::GetFullPath((Join-Path $ProjectRoot '..'))}
}
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -Path (Join-Path $PSScriptRoot '../desktop/desktop-launcher.cs') -ReferencedAssemblies @('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Drawing.dll')
  [DesktopLauncher]::Run($ProjectRoot)
} catch {
  [void][Windows.Forms.MessageBox]::Show('Não foi possível abrir o painel. Execute Iniciar.cmd --console para ver o erro.','PokeidleManager','OK','Warning')
  exit 1
}
