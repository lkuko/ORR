param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$knownHosts = Join-Path $repo '.local/ssh/campus-known_hosts'
$verificationLog = Join-Path $repo '.local/cloud-verification.log'
if (-not (Test-Path -LiteralPath $knownHosts) -or -not (Test-Path -LiteralPath $verificationLog)) {
    throw 'A verified SSH host key and successful cloud verification log are required.'
}
$matches = @(Get-Content -LiteralPath $verificationLog | Where-Object {
    $_ -match '^BACKUP_RESTORE_VERIFIED: (/opt/campus-internal/backups/(campus-internal-[0-9]{14}-[0-9]+\.sql\.gz)) sha256=([a-f0-9]{64})$'
})
if (-not $matches.Count -or -not (Select-String -LiteralPath $verificationLog -Pattern '^CAMPUS_CLOUD_VERIFIED:' -Quiet)) {
    throw 'No completed cloud backup/restore verification was found.'
}
$record = [regex]::Match($matches[-1], '^BACKUP_RESTORE_VERIFIED: (/opt/campus-internal/backups/(campus-internal-[0-9]{14}-[0-9]+\.sql\.gz)) sha256=([a-f0-9]{64})$')
$remotePath = $record.Groups[1].Value
$filename = $record.Groups[2].Value
$expectedHash = $record.Groups[3].Value
$backupFolder = Join-Path $repo '.local/cloud-backups'
if (-not (Test-Path -LiteralPath $backupFolder)) {
    New-Item -ItemType Directory -Path $backupFolder | Out-Null
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
    Set-Acl -LiteralPath $backupFolder -AclObject $acl
}
$destination = Join-Path $backupFolder $filename
if (Test-Path -LiteralPath $destination) {
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expectedHash) { throw 'An existing backup has a different checksum; refusing overwrite.' }
    Write-Output "Verified existing local backup: $destination"
    return
}
$partial = "$destination.partial"
if (Test-Path -LiteralPath $partial) { throw 'A partial backup exists. Inspect it before retrying.' }
$options = @(
    '-o', 'StrictHostKeyChecking=yes',
    '-o', "UserKnownHostsFile=$knownHosts",
    '-o', 'HostKeyAlgorithms=ssh-ed25519',
    '-o', 'UpdateHostKeys=no',
    '-o', 'ConnectTimeout=10',
    '-o', 'NumberOfPasswordPrompts=1',
    '-P', '22'
)
Write-Host 'Enter the SSH password at the terminal prompt. The backup will be stored privately on this computer.'
& (Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe') @options "root@139.224.111.140:$remotePath" $partial
if ($LASTEXITCODE -ne 0) { throw "Backup transfer failed; inspect $partial before retrying." }
$actual = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expectedHash) { throw "Backup checksum mismatch; inspect $partial before retrying." }
Move-Item -LiteralPath $partial -Destination $destination
Write-Output "OFFSITE_BACKUP_VERIFIED: $destination sha256=$actual"
