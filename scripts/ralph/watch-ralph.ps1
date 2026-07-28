[CmdletBinding()]
param(
    [ValidateRange(1, 1000)]
    [int]$Tail = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ralphRoot = Join-Path $env:LOCALAPPDATA "betterr-me-ralph\xtan9_betterr_me"
$liveLog = Join-Path $ralphRoot "live.log"

Write-Host "Waiting for Ralph live output at $liveLog"
while (-not (Test-Path -LiteralPath $liveLog)) {
    Start-Sleep -Seconds 1
}

Get-Content -LiteralPath $liveLog -Tail $Tail -Wait
