[CmdletBinding()]
param(
    [ValidateRange(1, 100)]
    [int]$Iterations = 24,
    [ValidateSet("DryRun", "PrOnly", "AutoMerge")]
    [string]$Mode = "PrOnly",
    [ValidateRange(1, 168)]
    [int]$DeadlineHours = 12,
    [ValidateRange(5, 300)]
    [int]$PollSeconds = 30,
    [ValidateRange(60, 14400)]
    [int]$ImplementationTimeoutSeconds = 14400,
    [ValidateRange(60, 14400)]
    [int]$VerificationTimeoutSeconds = 3600,
    [ValidateRange(1, 10)]
    [int]$MaximumControllerErrors = 5,
    [string]$RuntimePath = (Join-Path $env:LOCALAPPDATA "betterr-me-ralph-v2\xtan9_betterr_me"),
    [ValidatePattern("^[^/\s]+/[^/\s]+$")]
    [string]$GitHubRepository = "xtan9/betterr_me",
    [string]$GitHubActor = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$entryPath = Join-Path $PSScriptRoot "v2\production-entry.mjs"
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
    throw "Ralph v2 production entry is missing: $entryPath"
}
if (-not (Test-Path -LiteralPath $repositoryPath -PathType Container)) {
    throw "Ralph v2 repository is missing: $repositoryPath"
}

$arguments = @(
    $entryPath,
    "run",
    "--repository-path", $repositoryPath,
    "--runtime-path", $RuntimePath,
    "--github-repository", $GitHubRepository,
    "--mode", $Mode,
    "--max-issues", $Iterations,
    "--deadline-hours", $DeadlineHours,
    "--poll-seconds", $PollSeconds,
    "--implementation-timeout-seconds", $ImplementationTimeoutSeconds,
    "--verification-timeout-seconds", $VerificationTimeoutSeconds,
    "--max-controller-errors", $MaximumControllerErrors
)
if ($GitHubActor) {
    $arguments += @("--github-actor", $GitHubActor)
}

Write-Host "[ralph-v2] Visible controller terminal. Ctrl+C stops this controller; descendants are containment-bound."
Write-Host "[ralph-v2] Runtime: $RuntimePath"
& $nodePath @arguments
exit $LASTEXITCODE
