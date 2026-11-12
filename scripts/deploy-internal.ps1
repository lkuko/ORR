param([switch]$PauseArl, [switch]$PrepareOnly, [switch]$UsePrepared, [switch]$InstallUploaded)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$knownHosts = Join-Path $repo '.local/ssh/campus-known_hosts'
if (-not (Test-Path -LiteralPath $knownHosts)) { throw 'The independently verified SSH host key is missing.' }
if ($UsePrepared) {
    $privateRelease = Get-Content -LiteralPath (Join-Path $repo '.local/latest-internal-release.json') -Raw | ConvertFrom-Json
} else {
    $release = & (Join-Path $PSScriptRoot 'prepare-internal-release.ps1')
    # Restrict the directory before creating files containing real credentials.
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
    foreach ($sid in @($identity, (New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $rights, $inheritance, $propagation, $allow)
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $release.release -AclObject $acl
    $privateJson = & node (Join-Path $PSScriptRoot 'prepare-internal-secrets.cjs') $release.version
    if ($LASTEXITCODE -ne 0) { throw 'Private release preparation failed.' }
    $privateRelease = $privateJson | ConvertFrom-Json
}
if ($privateRelease.version -notmatch '^[a-z0-9][a-z0-9_.-]{0,80}$' -or $privateRelease.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid prepared release metadata.' }
$expectedRelease = Join-Path (Join-Path $repo '.local/releases') $privateRelease.version
if ($privateRelease.archive -ne (Join-Path $expectedRelease 'upload.tar.gz') -or $privateRelease.log -ne (Join-Path $expectedRelease 'deploy.log')) { throw 'Unexpected prepared release paths.' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $privateRelease.archive).Hash.ToLowerInvariant() -ne $privateRelease.sha256) { throw 'Private archive checksum mismatch.' }
if ($PrepareOnly) {
    Write-Output "Prepared release: $($privateRelease.version). No server connection or changes were made."
    return
}
$sshFolder = Join-Path $env:WINDIR 'System32/OpenSSH'
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
$remoteArchive = '/root/campus-internal-' + $privateRelease.version + '.tar.gz'
$pauseMode = if ($PauseArl) { 'pause-arl' } else { 'keep-arl' }
$uploadMode = if ($InstallUploaded) { 'reuse' } else { 'stream' }
$payload = if ($InstallUploaded) { '' } else { [Convert]::ToBase64String([IO.File]::ReadAllBytes($privateRelease.archive)) }
$remoteCommand = @'
set -Eeuo pipefail
exec 2>&1
umask 077
printf 'CAMPUS_SSH_AUTHENTICATED: checking previous installation state.\n'
if [ -e /opt/campus-internal ] || [ -L /opt/campus-internal ]; then
  printf 'CAMPUS_EXISTING_INSTALLATION: no files or services will be changed.\n'
  if [ -f /opt/campus-internal/state/install-complete ]; then printf 'Previous install-complete marker exists.\n'; fi
  docker ps -a --filter label=com.docker.compose.project=campus-internal --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  if [ -f /opt/campus-internal/state/arl-before.tsv ]; then cat /opt/campus-internal/state/arl-before.tsv; fi
  exit 20
fi
printf 'CAMPUS_CONTAINER_INVENTORY:\n'
docker ps -a --filter label=com.docker.compose.project=campus-internal --format '{{.ID}} {{.Names}} {{.Status}}'
printf 'CAMPUS_VOLUME_INVENTORY:\n'
docker volume ls --filter label=com.docker.compose.project=campus-internal --format '{{.Name}}'
container_count=$(docker ps -aq --filter label=com.docker.compose.project=campus-internal | wc -l)
volume_count=$(docker volume ls -q --filter label=com.docker.compose.project=campus-internal | wc -l)
printf 'CAMPUS_RESOURCE_COUNTS: containers=%s volumes=%s\n' "$container_count" "$volume_count"
if [ "$container_count" -ne 0 ] || [ "$volume_count" -ne 0 ]; then
  printf 'CAMPUS_EXISTING_RESOURCES: no changes made; inspect the existing project.\n'
  exit 20
fi
printf 'CAMPUS_PREFLIGHT_CLEAR: no previous campus installation or project resources.\n'
archive='__ARCHIVE__'
if [ -L "$archive" ]; then printf 'Refusing a redirected upload path.\n'; exit 1; fi
if [ '__UPLOAD_MODE__' = stream ]; then
  incoming=$(mktemp /root/campus-upload.XXXXXX)
  if ! base64 --decode --ignore-garbage > "$incoming" <<'CAMPUS_ARCHIVE_BASE64'
__PAYLOAD__
CAMPUS_ARCHIVE_BASE64
  then rm -f -- "$incoming"; exit 1; fi
  actual=$(sha256sum "$incoming" | cut -d ' ' -f 1)
  if [ "$actual" != '__SHA256__' ]; then rm -f -- "$incoming"; printf 'Stream checksum mismatch.\n'; exit 1; fi
  mv -- "$incoming" "$archive"
fi
if [ ! -f "$archive" ]; then printf 'Uploaded archive is missing. Use normal streaming upload after inspection.\n'; exit 1; fi
chmod 600 "$archive"
actual=$(sha256sum "$archive" | cut -d ' ' -f 1)
if [ "$actual" != '__SHA256__' ]; then printf 'Upload checksum mismatch.\n' >&2; exit 1; fi
printf 'CAMPUS_UPLOAD_VERIFIED: archive checksum matches.\n'
work=$(mktemp -d /root/campus-unpack.XXXXXX)
cleanup() {
  status=$?
  case "$work" in /root/campus-unpack.*) rm -rf -- "$work" ;; esac
  if [ "$status" -eq 0 ]; then rm -f -- "$archive"; fi
  exit "$status"
}
trap cleanup EXIT
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$work"
bash "$work/app/deploy/install-internal.sh" "$work" '__VERSION__' '__PAUSE__'
'@
$remoteCommand = $remoteCommand.Replace('__ARCHIVE__', $remoteArchive).Replace('__SHA256__', $privateRelease.sha256).Replace('__VERSION__', $privateRelease.version).Replace('__PAUSE__', $pauseMode).Replace('__UPLOAD_MODE__', $uploadMode).Replace('__PAYLOAD__', $payload).Replace("`r", '')
Write-Host 'One SSH password prompt: enter the password here when prompted, then press Enter.'
Write-Host 'The server first checks for any previous installation; credentials are never printed.'
Add-Content -LiteralPath $privateRelease.log -Encoding UTF8 -Value ("SSH attempt {0}; mode={1}" -f (Get-Date).ToString('o'), $uploadMode)
$previousErrorPreference = $ErrorActionPreference
try {
    # PowerShell 5 represents native stderr as ErrorRecord; preserve it in the log without stopping on progress output.
    $ErrorActionPreference = 'Continue'
    # Send shell source over stdin: Windows native argv parsing must not rewrite Bash quotes.
    $remoteCommand | & (Join-Path $sshFolder 'ssh.exe') @hostOptions -T -p 22 root@139.224.111.140 "tr -d '\r' | bash -s" 2>&1 |
        ForEach-Object { $line = $_.ToString(); Add-Content -LiteralPath $privateRelease.log -Encoding UTF8 -Value $line; Write-Output $line }
    $sshExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorPreference
    $payload = $null
    $remoteCommand = $null
}
Add-Content -LiteralPath $privateRelease.log -Encoding UTF8 -Value "SSH_EXIT_CODE=$sshExit"
if ($sshExit -ne 0) {
    throw "Deployment did not finish. Review $($privateRelease.log) before retrying; existing cloud files are preserved."
}
Write-Host "Deployment log: $($privateRelease.log)"
Write-Host "Administrator username: admin. Password is in your private local file: $($privateRelease.adminPasswordFile)"
Write-Host 'Cloud installation is complete. The SSH tunnel and real-device tests are separate remaining steps.'
