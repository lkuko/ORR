param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$previousApiBase = $env:VITE_API_BASE_URL
try {
    $env:VITE_API_BASE_URL = '/api/v1'
    & npm --prefix (Join-Path $repo 'admin') run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Local administrator UI build failed.' }
} finally {
    if ($null -eq $previousApiBase) { Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue }
    else { $env:VITE_API_BASE_URL = $previousApiBase }
}
$arguments = @((Join-Path $PSScriptRoot 'prepare-internal-release.cjs'))
if ($Version) { $arguments += $Version }
$result = & node @arguments
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
return ($result | ConvertFrom-Json)
