$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$pidFile = Join-Path $repo '.local/mysql.pid'
$data = Join-Path $repo '.local/mysql-data'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No project MySQL PID file; nothing stopped.'; exit 0 }
$id = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $id"
if (-not $process) { Remove-Item -LiteralPath $pidFile -Force; Write-Output 'Project MySQL process already stopped.'; exit 0 }
if ($process.Name -ne 'mysqld.exe' -or $process.CommandLine -notlike "*$data*") { throw 'PID does not match this project database; refusing to stop it.' }
Stop-Process -Id $id
Remove-Item -LiteralPath $pidFile -Force
Write-Output 'Stopped this project MySQL instance.'
