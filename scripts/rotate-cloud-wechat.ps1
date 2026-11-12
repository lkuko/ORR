param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$knownHosts = Join-Path $repo '.local/ssh/campus-known_hosts'
if (-not (Test-Path -LiteralPath $knownHosts)) { throw 'The independently verified SSH host key is missing.' }

$id = 'wechat-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$rotation = Join-Path (Join-Path $repo '.local/rotations') $id
New-Item -ItemType Directory -Path $rotation -Force:$false | Out-Null

# Restrict the directory before the Node helper writes the private credentials.
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagation = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
$rights = [System.Security.AccessControl.FileSystemRights]::FullControl
foreach ($sid in @($identity, (New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $rights, $inheritance, $propagation, $allow)))
}
Set-Acl -LiteralPath $rotation -AclObject $acl

$metadataJson = & node (Join-Path $PSScriptRoot 'prepare-wechat-rotation.cjs') $id
if ($LASTEXITCODE -ne 0) { throw 'Private WeChat rotation preparation failed.' }
$metadata = $metadataJson | ConvertFrom-Json
if ($metadata.id -ne $id -or $metadata.appId -notmatch '^wx[a-f0-9]{16}$' -or $metadata.sha256 -notmatch '^[a-f0-9]{64}$' -or
    $metadata.archive -ne (Join-Path $rotation 'wechat-rotation.tar.gz') -or $metadata.log -ne (Join-Path $rotation 'rotation.log')) {
    throw 'Unexpected rotation package metadata.'
}
$actualHash = (Get-FileHash -LiteralPath $metadata.archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $metadata.sha256) { throw 'Rotation archive checksum mismatch.' }
Write-Host "Verified matching mini-program and server AppID: $($metadata.appId)"
if ($PrepareOnly) {
    Write-Output "Prepared private rotation package: $rotation. No server connection or changes were made."
    return
}

$hostOptions = @(
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$knownHosts",
    '-o', 'HostKeyAlgorithms=ssh-ed25519',
    '-o', 'UpdateHostKeys=no',
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=6',
    '-o', 'NumberOfPasswordPrompts=1'
)
$payload = [Convert]::ToBase64String([IO.File]::ReadAllBytes($metadata.archive))
$remoteCommand = @'
set -Eeuo pipefail
exec 2>&1
umask 077
root=/opt/campus-internal
if [[ ! -f $root/state/install-complete || ! -f $root/secrets/compose.env ]]; then
  printf 'CAMPUS_ROTATION_PREFLIGHT_FAILED: installation is incomplete.\n' >&2
  exit 1
fi
printf 'CAMPUS_ROTATION_PREFLIGHT_OK: preparing a verified private package.\n'
work=$(mktemp -d /root/campus-wechat.XXXXXX)
cleanup() {
  status=$?
  case "$work" in /root/campus-wechat.*) rm -rf -- "$work" ;; esac
  exit "$status"
}
trap cleanup EXIT
base64 --decode --ignore-garbage > "$work/incoming.tar.gz" <<'CAMPUS_WECHAT_ARCHIVE_BASE64'
__PAYLOAD__
CAMPUS_WECHAT_ARCHIVE_BASE64
actual=$(sha256sum "$work/incoming.tar.gz" | cut -d ' ' -f 1)
[[ $actual == '__SHA256__' ]] || { printf 'Rotation archive checksum mismatch.\n' >&2; exit 1; }
tar --no-same-owner --no-same-permissions -xzf "$work/incoming.tar.gz" -C "$work"
bash -n "$work/deploy/rotate-wechat.sh"
bash -n "$work/deploy/rollback-wechat.sh"
bash "$work/deploy/rotate-wechat.sh" "$work" '__APP_ID__'
'@
$remoteCommand = $remoteCommand.Replace('__PAYLOAD__', $payload).Replace('__SHA256__', $metadata.sha256).Replace('__APP_ID__', $metadata.appId).Replace("`r", '')
Write-Host 'Enter the SSH password only at the terminal prompt. The API will restart briefly; database and admin credentials stay in place.'
Add-Content -LiteralPath $metadata.log -Encoding UTF8 -Value ("SSH rotation attempt {0}; AppID={1}" -f (Get-Date).ToString('o'), $metadata.appId)
$previousErrorPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $remoteCommand | & (Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe') @hostOptions -T -p 22 root@139.224.111.140 "tr -d '\r' | bash -s" 2>&1 |
        ForEach-Object { $line = $_.ToString(); Add-Content -LiteralPath $metadata.log -Encoding UTF8 -Value $line; Write-Output $line }
    $sshExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorPreference
    $payload = $null
    $remoteCommand = $null
}
Add-Content -LiteralPath $metadata.log -Encoding UTF8 -Value "SSH_EXIT_CODE=$sshExit"
if ($sshExit -ne 0) { throw "WeChat rotation failed. Review $($metadata.log); do not repeat until the rollback state is checked." }
if (-not (Select-String -LiteralPath $metadata.log -Pattern '^CAMPUS_WECHAT_ROTATION_COMPLETE:' -Quiet)) {
    throw "SSH exited without a rotation completion marker. Review $($metadata.log)."
}
Write-Output "Cloud WeChat credentials now match AppID $($metadata.appId). Rotation log: $($metadata.log)"
