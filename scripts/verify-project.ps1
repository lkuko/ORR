param([string]$WxmlCompiler = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

function Invoke-CheckedCommand {
  param([string]$Executable, [string[]]$Arguments)
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Verification failed: $Executable $($Arguments -join ' ')" }
}

Push-Location $repo
try {
  Invoke-CheckedCommand 'node' @('scripts/check-miniprogram.cjs')
  Push-Location (Join-Path $repo 'server')
  try {
    Invoke-CheckedCommand 'npm' @('test')
    Invoke-CheckedCommand 'npm' @('run', 'test:integration')
  } finally { Pop-Location }
  Push-Location (Join-Path $repo 'admin')
  try { Invoke-CheckedCommand 'npm' @('run', 'build') } finally { Pop-Location }
  if ($WxmlCompiler) {
    if (-not (Test-Path -LiteralPath $WxmlCompiler)) { throw 'WXML compiler path does not exist.' }
    $output = Join-Path $repo '.local/verification'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $files = @(Get-ChildItem pages,components -Filter '*.wxml' -File -Recurse | Resolve-Path -Relative)
    $arguments = @('-o', (Join-Path $output 'wxml.js')) + $files
    Invoke-CheckedCommand $WxmlCompiler $arguments
    Write-Output "WXML compiler passed: $($files.Count) templates."
  } else {
    Write-Output 'WXML compilation skipped. Pass -WxmlCompiler with the developer tool wcc.exe path to include it.'
  }
  Write-Output 'Project verification completed. Cloud deployment and real-device acceptance are separate checks.'
} finally { Pop-Location }
