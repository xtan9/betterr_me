[CmdletBinding()]
param(
    [string]$Branch = "codex/ralph-architecture",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-RalphStatus {
    param([string]$Message)
    Write-Host "[ralph] $Message" -ForegroundColor Cyan
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$queueFile = Join-Path $PSScriptRoot "architecture-queue.json"
$queueHelper = Join-Path $PSScriptRoot "queue.mjs"
$resultSchema = Join-Path $PSScriptRoot "result.schema.json"
$stateDirectory = Join-Path $repoRoot ".ralph-state"
$progressFile = Join-Path $stateDirectory "progress.json"

$git = Get-Command git -ErrorAction Stop
$node = Get-Command node -ErrorAction Stop
$codex = Get-Command codex -ErrorAction Stop

& $codex.Source login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Codex CLI is not authenticated. Run 'codex login' before starting Ralph."
}

$gitRoot = (& $git.Source -C $repoRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or $gitRoot -ne $repoRoot) {
    throw "Ralph must run from the expected Git repository root: $repoRoot"
}

$currentBranch = (& $git.Source -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $Branch) {
    throw "Expected branch '$Branch' but found '$currentBranch'."
}

$worktreeChanges = @(& $git.Source -C $repoRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the Git worktree."
}
if ($worktreeChanges.Count -gt 0) {
    throw "The worktree must be clean before a Ralph iteration. Changes: $($worktreeChanges -join '; ')"
}

$temporaryProgress = $null
if (Test-Path $progressFile) {
    $selectionProgressFile = $progressFile
}
elseif ($DryRun) {
    $temporaryProgress = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($temporaryProgress, '{"completed":[]}')
    $selectionProgressFile = $temporaryProgress
}
else {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    [System.IO.File]::WriteAllText($progressFile, "{`n  `"completed`": []`n}`n")
    $selectionProgressFile = $progressFile
}

try {
    $selectionJson = & $node.Source $queueHelper next --queue $queueFile --progress $selectionProgressFile
    if ($LASTEXITCODE -ne 0) {
        throw "Queue selection failed."
    }
    $selection = $selectionJson | ConvertFrom-Json
}
finally {
    if ($temporaryProgress -and (Test-Path $temporaryProgress)) {
        Remove-Item -LiteralPath $temporaryProgress -Force
    }
}

if ($selection.complete) {
    Write-RalphStatus "All queued issues are complete."
    Write-Output '{"status":"queue-complete"}'
    return
}

$issue = $selection.issue
$criteria = ($issue.acceptanceCriteria | ForEach-Object { "- [ ] $_" }) -join [Environment]::NewLine
$blockers = if ($issue.blockers.Count -eq 0) {
    "None"
} else {
    ($issue.blockers | ForEach-Object { "#$_" }) -join ", "
}

$promptTemplate = @'
Use the installed $implement skill to implement exactly one approved architecture ticket. Do not select or work on any other ticket.

Repository rules:
- Read and follow AGENTS.md plus any relevant domain documentation before editing.
- Stay on the current branch. Do not create, switch, merge, rebase, push, or open a pull request.
- Do not read, update, comment on, label, or close GitHub issues during this run. The approved snapshot below is authoritative.
- Do not edit scripts/ralph/architecture-queue.json or anything under .ralph-state.
- Preserve unrelated work and avoid speculative changes outside this ticket.

Ticket: #{{ISSUE_NUMBER}} - {{TITLE}}
Tracker URL (reference only): {{URL}}
Blocked by: {{BLOCKERS}}

What to build:
{{WHAT_TO_BUILD}}

Acceptance criteria:
{{ACCEPTANCE_CRITERIA}}

The user has pre-approved this TDD seam:
{{TEST_SEAM}}

Implementation contract:
1. Inspect the current implementation and relevant existing tests.
2. Use red-green TDD at the approved seam where possible, one behavioral slice at a time.
3. Run targeted tests regularly. On this Windows checkout, invoke repository binaries directly when the pnpm wrapper tries to reinstall dependencies (for example, .\node_modules\.bin\vitest.cmd and .\node_modules\.bin\tsc.cmd).
4. Run typechecking and the full relevant test suite before completion. The repository currently has pre-existing TypeScript diagnostics in older tests; do not fix them incidentally, but verify that this ticket introduces no new diagnostics in changed files and record the baseline distinction in your summary.
5. Use the installed $code-review skill to review the complete diff against both repository standards and this ticket. Address all blocking findings.
6. Commit the complete work as exactly one commit whose subject references #{{ISSUE_NUMBER}}. Do not create a commit if tests or review are incomplete.
7. Leave the worktree clean after a successful commit.

If the ticket is ambiguous, unsafe, blocked by missing infrastructure, or cannot pass verification, stop without claiming completion. Explain the blocker in the structured result. Do not weaken tests or bypass safeguards.

Your final response must conform to the supplied JSON schema. Report status="completed" only when the ticket is fully implemented, tests pass, review is complete, exactly one commit exists for this run, and the worktree is clean.
'@

$prompt = $promptTemplate
$prompt = $prompt.Replace("{{ISSUE_NUMBER}}", [string]$issue.issueNumber)
$prompt = $prompt.Replace("{{TITLE}}", [string]$issue.title)
$prompt = $prompt.Replace("{{URL}}", [string]$issue.url)
$prompt = $prompt.Replace("{{BLOCKERS}}", $blockers)
$prompt = $prompt.Replace("{{WHAT_TO_BUILD}}", [string]$issue.whatToBuild)
$prompt = $prompt.Replace("{{ACCEPTANCE_CRITERIA}}", $criteria)
$prompt = $prompt.Replace("{{TEST_SEAM}}", [string]$issue.testSeam)

Write-RalphStatus "Branch: $currentBranch"
Write-RalphStatus "Next issue: #$($issue.issueNumber) - $($issue.title)"
Write-RalphStatus "Approved test seam: $($issue.testSeam)"

if ($DryRun) {
    Write-RalphStatus "Dry run passed; Codex was not invoked and no state was changed."
    Write-Output ($selection | ConvertTo-Json -Depth 10 -Compress)
    return
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$promptFile = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-prompt.txt"
$stdoutLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-stdout.log"
$stderrLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-stderr.log"
$resultFile = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-result.json"
$iterationFile = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-iteration.json"

[System.IO.File]::WriteAllText($promptFile, $prompt)
$beforeSha = (& $git.Source -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the starting commit."
}

Write-RalphStatus "Starting a fresh ephemeral Codex invocation. Logs: $stderrLog"
$codexArguments = @(
    "exec",
    "--ephemeral",
    "--sandbox", "workspace-write",
    "--cd", $repoRoot,
    "--output-schema", $resultSchema,
    "--output-last-message", $resultFile,
    "-"
)

Get-Content -Raw $promptFile |
    & $codex.Source @codexArguments 1> $stdoutLog 2> $stderrLog
$codexExitCode = $LASTEXITCODE

if (Test-Path $stderrLog) {
    Get-Content $stderrLog | Select-Object -Last 40 | ForEach-Object { Write-Host $_ }
}

if ($codexExitCode -ne 0) {
    throw "Codex exited with code $codexExitCode. Inspect $stderrLog and $stdoutLog."
}
if (-not (Test-Path $resultFile)) {
    throw "Codex did not produce the required structured result: $resultFile"
}

try {
    $agentResult = Get-Content -Raw $resultFile | ConvertFrom-Json
}
catch {
    throw "Codex returned an invalid structured result. Inspect $resultFile. $($_.Exception.Message)"
}

$afterSha = (& $git.Source -C $repoRoot rev-parse HEAD).Trim()
$commitCount = [int]((& $git.Source -C $repoRoot rev-list --count "$beforeSha..$afterSha").Trim())
$postRunChanges = @(& $git.Source -C $repoRoot status --porcelain)
$commitMessage = if ($afterSha -ne $beforeSha) {
    (& $git.Source -C $repoRoot log -1 --pretty=%B) -join [Environment]::NewLine
} else {
    ""
}

$iteration = [ordered]@{
    selectedIssueNumber = [int]$issue.issueNumber
    beforeSha = $beforeSha
    afterSha = $afterSha
    commitCount = $commitCount
    worktreeClean = ($postRunChanges.Count -eq 0)
    commitMessage = $commitMessage.Trim()
    agentResult = $agentResult
}
[System.IO.File]::WriteAllText(
    $iterationFile,
    (($iteration | ConvertTo-Json -Depth 10) + [Environment]::NewLine)
)

$gateJson = & $node.Source $queueHelper gate --input $iterationFile
if ($LASTEXITCODE -ne 0) {
    throw "Unable to evaluate the iteration gate. Inspect $iterationFile."
}
$gate = $gateJson | ConvertFrom-Json
if ($gate.canAdvance -ne $true) {
    $gateReason = [string]$gate.reason
    throw "Ralph success gate stopped the iteration: $gateReason"
}

$progress = Get-Content -Raw $progressFile | ConvertFrom-Json
$completed = @($progress.completed | ForEach-Object { [int]$_ })
$completed += [int]$issue.issueNumber
$newProgress = [ordered]@{
    completed = $completed
    lastCompletedIssue = [int]$issue.issueNumber
    lastCommit = $afterSha
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$progressTemp = "$progressFile.tmp"
[System.IO.File]::WriteAllText(
    $progressTemp,
    (($newProgress | ConvertTo-Json -Depth 10) + [Environment]::NewLine)
)
Move-Item -LiteralPath $progressTemp -Destination $progressFile -Force

Write-RalphStatus "Completed issue #$($issue.issueNumber) in commit $afterSha."
Write-Output (([ordered]@{
    status = "completed"
    issueNumber = [int]$issue.issueNumber
    commit = $afterSha
    summary = [string]$agentResult.summary
}) | ConvertTo-Json -Compress)
