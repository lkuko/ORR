param([string]$MySQLBin = (Split-Path (Get-Command mysqld.exe -ErrorAction Stop).Source))
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$local = Join-Path $repo '.local'
$data = Join-Path $local 'mysql-data'
$mysqld = Join-Path $MySQLBin 'mysqld.exe'
New-Item -ItemType Directory -Path $local -Force | Out-Null
if (-not (Test-Path -LiteralPath $data)) {
  & $mysqld --no-defaults --initialize-insecure "--basedir=$(Split-Path $MySQLBin -Parent)" "--datadir=$data" --console 2> (Join-Path $local 'mysql-init.log')
  if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed. See .local/mysql-init.log.' }
}
$expectedExe = [IO.Path]::GetFullPath($mysqld)
$expectedData = [IO.Path]::GetFullPath($data)
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 13306 -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw 'Port 13306 has multiple listener processes; refusing to connect.' }
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
  $dataPattern = '(?i)--datadir="?' + [regex]::Escape($expectedData) + '"?(?:\s|$)'
  if (-not $owner -or
      [IO.Path]::GetFullPath($owner.ExecutablePath) -ne $expectedExe -or
      $owner.CommandLine -notmatch $dataPattern -or
      $owner.CommandLine -notmatch '(?i)--port=13306(?:\s|$)' -or
      $owner.CommandLine -notmatch '(?i)--bind-address="?127\.0\.0\.1"?(?:\s|$)') {
    throw 'Port 13306 is occupied by a process that does not match this project database; refusing to connect.'
  }
} else {
  $process = Start-Process -FilePath $mysqld -ArgumentList @('--no-defaults', "--basedir=`"$(Split-Path $MySQLBin -Parent)`"", "--datadir=`"$data`"", '--port=13306', '--bind-address=127.0.0.1', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--max-connections=60', '--innodb-buffer-pool-size=64M', '--console') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $local 'mysql.out.log') -RedirectStandardError (Join-Path $local 'mysql.err.log')
  Set-Content -LiteralPath (Join-Path $local 'mysql.pid') -Value $process.Id
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 13306 -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) { break }
  Start-Sleep -Milliseconds 500
}
if ($listeners.Count -eq 0) { throw 'Project MySQL did not start on 127.0.0.1:13306. See .local/mysql.err.log.' }
$owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -ne 1) { throw 'Port 13306 has multiple listener processes; refusing to connect.' }
$owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
$dataPattern = '(?i)--datadir="?' + [regex]::Escape($expectedData) + '"?(?:\s|$)'
if (-not $owner -or
    [IO.Path]::GetFullPath($owner.ExecutablePath) -ne $expectedExe -or
    $owner.CommandLine -notmatch $dataPattern -or
    $owner.CommandLine -notmatch '(?i)--port=13306(?:\s|$)' -or
    $owner.CommandLine -notmatch '(?i)--bind-address="?127\.0\.0\.1"?(?:\s|$)') {
  throw 'Port 13306 is occupied by a process that does not match this project database; refusing to connect.'
}
node (Join-Path $repo 'server/src/scripts/setup-local.js')
if ($LASTEXITCODE -ne 0) { throw 'Local database setup failed.' }
