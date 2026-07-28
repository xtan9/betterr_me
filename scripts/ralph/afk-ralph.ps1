[CmdletBinding()]
param(
    [ValidateRange(1, 100)]
    [int]$Iterations = 24,
    [ValidateSet("DryRun", "PrOnly", "AutoMerge")]
    [string]$Mode = "PrOnly",
    [ValidateRange(60, 86400)][int]$ImplementationTimeoutSeconds = 7200,
    [ValidateRange(60, 7200)][int]$VerificationTimeoutSeconds = 900,
    [ValidateRange(60, 7200)][int]$ReviewTimeoutSeconds = 1800,
    [ValidateRange(60, 14400)][int]$CheckTimeoutSeconds = 3600,
    [ValidateRange(5, 300)][int]$PollSeconds = 30,
    [ValidateRange(1, 10)][int]$MaximumTransientAttempts = 3,
    [ValidateRange(1, 5)][int]$MaximumRepairAttempts = 2,
    [ValidateRange(1, 168)][int]$ClaimLeaseHours = 24,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($DryRun) {
    $Mode = "DryRun"
}

$controller = Join-Path $PSScriptRoot "controller.mjs"
$node = (Get-Command node.exe -ErrorAction Stop).Source

& $node $controller run `
    --mode $Mode `
    --issue-limit $Iterations `
    --implementation-timeout-seconds $ImplementationTimeoutSeconds `
    --verification-timeout-seconds $VerificationTimeoutSeconds `
    --review-timeout-seconds $ReviewTimeoutSeconds `
    --check-timeout-seconds $CheckTimeoutSeconds `
    --poll-seconds $PollSeconds `
    --maximum-transient-attempts $MaximumTransientAttempts `
    --maximum-repair-attempts $MaximumRepairAttempts `
    --claim-lease-hours $ClaimLeaseHours

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
