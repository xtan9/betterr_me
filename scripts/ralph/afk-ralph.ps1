[CmdletBinding()]
param(
    [ValidateRange(1, 100)]
    [int]$Iterations = 24,
    [string]$Branch = "codex/ralph-architecture",
    [ValidateRange(60, 86400)][int]$ImplementationTimeoutSeconds = 7200,
    [ValidateRange(60, 7200)][int]$VerificationTimeoutSeconds = 900,
    [ValidateRange(60, 7200)][int]$ReviewTimeoutSeconds = 1800,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$once = Join-Path $PSScriptRoot "ralph-once.ps1"

if ($DryRun) {
    Write-Host "[ralph] Validating one iteration without invoking Codex." -ForegroundColor Cyan
    & $once `
        -Branch $Branch `
        -ImplementationTimeoutSeconds $ImplementationTimeoutSeconds `
        -VerificationTimeoutSeconds $VerificationTimeoutSeconds `
        -ReviewTimeoutSeconds $ReviewTimeoutSeconds `
        -DryRun
    return
}

for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
    Write-Host "[ralph] Iteration $iteration of $Iterations" -ForegroundColor Cyan
    $resultLines = @(& $once `
        -Branch $Branch `
        -ImplementationTimeoutSeconds $ImplementationTimeoutSeconds `
        -VerificationTimeoutSeconds $VerificationTimeoutSeconds `
        -ReviewTimeoutSeconds $ReviewTimeoutSeconds)
    if ($resultLines.Count -eq 0) {
        throw "Ralph iteration returned no machine-readable result."
    }

    $result = $resultLines[-1] | ConvertFrom-Json
    Write-Output ($result | ConvertTo-Json -Compress)

    if ($result.status -eq "queue-complete") {
        Write-Host "[ralph] Queue completed after $($iteration - 1) implementation iterations." -ForegroundColor Green
        return
    }
    if ($result.status -ne "completed") {
        throw "Unexpected Ralph status '$($result.status)'."
    }
}

Write-Warning "Ralph reached the configured limit of $Iterations iterations before observing queue completion. Run the dry-run command to inspect the next issue."
