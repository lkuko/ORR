param(
    [string]$LanAddress = '',
    [switch]$Preview,
    [switch]$VerifyCloud
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$knownHosts = Join-Path $repo '.local/ssh/campus-known_hosts'
if (-not (Test-Path -LiteralPath $knownHosts)) {
    throw 'The verified host-key file is missing. Verify the host fingerprint before connecting.'
}
if ($LanAddress) {
    $address = $null
    if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$address) -or $address.AddressFamily -ne 'InterNetwork') {
        throw 'LanAddress must be a local IPv4 address.'
    }
    $octets = $address.GetAddressBytes()
    $private = $octets[0] -eq 10 -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or ($octets[0] -eq 192 -and $octets[1] -eq 168)
    if (-not $private) { throw 'LanAddress must be a private LAN address, never 0.0.0.0 or a public address.' }
    $localAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -eq $LanAddress -and $_.AddressState -eq 'Preferred' }
    if (-not $localAddress) { throw 'LanAddress is not currently assigned to this computer.' }
}
$arguments = @(
    '-T', '-p', '22',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$knownHosts",
    '-o', 'HostKeyAlgorithms=ssh-ed25519',
    '-o', 'UpdateHostKeys=no',
    '-o', 'ConnectTimeout=10',
    '-o', 'NumberOfPasswordPrompts=1',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-L', '127.0.0.1:18080:127.0.0.1:18080'
)
if (-not $VerifyCloud) { $arguments += '-N' }
if ($LanAddress) { $arguments += @('-L', "${LanAddress}:18080:127.0.0.1:18080") }
$arguments += 'root@139.224.111.140'
if ($VerifyCloud) { $arguments += "tr -d '\r' | bash -s" }
if ($Preview) {
    Write-Output ('ssh.exe ' + (($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '))
    return
}
$occupied = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 18080 })
if ($occupied.Count) { throw 'Local port 18080 is already in use. Check the owner before starting another tunnel.' }
Write-Host 'Administrator URL after login: http://127.0.0.1:18080'
if ($LanAddress) { Write-Host "Phone development API after login: http://${LanAddress}:18080/api/v1" }
Write-Host 'Keep this terminal open. Press Ctrl+C to close the tunnel. Do not enter passwords in chat.'
if ($VerifyCloud) {
    $verification = (Get-Content -LiteralPath (Join-Path $repo 'deploy/verify-internal.sh') -Raw).Replace("`r", '')
    $verification += "`nprintf 'CAMPUS_TUNNEL_READY: keep this terminal open.\n'`nexec sleep infinity`n"
    $log = Join-Path $repo '.local/cloud-verification.log'
    Add-Content -LiteralPath $log -Encoding UTF8 -Value ("Cloud verification attempt {0}" -f (Get-Date).ToString('o'))
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $verification | & (Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe') @arguments 2>&1 |
            ForEach-Object { $line = $_.ToString(); Add-Content -LiteralPath $log -Encoding UTF8 -Value $line; Write-Output $line }
        $sshExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    if ($sshExit -ne 0) { throw "Cloud verification or tunnel failed. Review $log before retrying." }
} else {
    & (Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe') @arguments
}
if ($LASTEXITCODE -ne 0) { throw 'SSH tunnel exited with an error.' }
