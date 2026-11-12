param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$knownHosts = Join-Path $repo '.local/ssh/campus-known_hosts'
if (-not (Test-Path -LiteralPath $knownHosts)) {
    throw 'The independently verified host-key file is missing. Verify the fingerprint before connecting.'
}
$ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$report = Join-Path $repo '.local/server-inspection.txt'
$remoteScript = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'inspect-server.sh') -Raw).Replace("`r`n", "`n")
$arguments = @(
    '-T', '-p', '22',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$knownHosts",
    '-o', 'HostKeyAlgorithms=ssh-ed25519',
    '-o', 'UpdateHostKeys=no',
    '-o', 'ConnectTimeout=10',
    '-o', 'NumberOfPasswordPrompts=1',
    'root@139.224.111.140', "tr -d '\r' | bash -s"
)
Write-Host 'Enter the SSH password only at the SSH prompt. It is not saved in the report.'
$remoteScript | & $ssh @arguments | Tee-Object -FilePath $report
if ($LASTEXITCODE -ne 0) { throw 'SSH inspection failed. No server changes were requested.' }
Write-Host "Read-only report saved: $report"
