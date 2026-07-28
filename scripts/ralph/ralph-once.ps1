[CmdletBinding()]
param(
    [string]$Branch = "codex/ralph-architecture",
    [ValidateRange(60, 86400)][int]$ImplementationTimeoutSeconds = 7200,
    [ValidateRange(60, 7200)][int]$VerificationTimeoutSeconds = 900,
    [ValidateRange(60, 7200)][int]$ReviewTimeoutSeconds = 1800,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-RalphStatus {
    param([string]$Message)
    Write-Host "[ralph] $Message" -ForegroundColor Cyan
}

function Invoke-RedirectedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StandardOutput,
        [Parameter(Mandatory = $true)][string]$StandardError,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [string]$StandardInput
    )

    $quotedArguments = ($Arguments | ForEach-Object {
        '"' + ([string]$_).Replace('"', '\"') + '"'
    }) -join " "
    $startParameters = @{
        FilePath = $FilePath
        ArgumentList = $quotedArguments
        WorkingDirectory = $WorkingDirectory
        RedirectStandardOutput = $StandardOutput
        RedirectStandardError = $StandardError
        NoNewWindow = $true
        PassThru = $true
    }
    if ($StandardInput) {
        $startParameters.RedirectStandardInput = $StandardInput
    }

    $process = Start-Process @startParameters
    # PowerShell 5.1 can leave ExitCode unset unless the native process handle
    # is opened before waiting on a Start-Process -PassThru result.
    $null = $process.Handle
    $exited = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $exited) {
        try {
            & taskkill.exe /PID $process.Id /T /F *> $null
        }
        catch {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        throw "Process timed out after $TimeoutSeconds seconds: $FilePath"
    }
    $process.WaitForExit()
    return $process.ExitCode
}

function Merge-ProcessLogs {
    param(
        [Parameter(Mandatory = $true)][string[]]$Paths,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $lines = @()
    foreach ($path in $Paths) {
        if (Test-Path $path) {
            $lines += @(Get-Content $path)
        }
    }
    [System.IO.File]::WriteAllLines($Destination, [string[]]$lines)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$queueFile = Join-Path $PSScriptRoot "architecture-queue.json"
$queueHelper = Join-Path $PSScriptRoot "queue.mjs"
$resultSchema = Join-Path $PSScriptRoot "result.schema.json"
$reviewSchema = Join-Path $PSScriptRoot "review.schema.json"
$stateDirectory = Join-Path $repoRoot ".ralph-state"
$progressFile = Join-Path $stateDirectory "progress.json"

$git = Get-Command git -ErrorAction Stop
$node = Get-Command node -ErrorAction Stop
$codexCommand = Get-Command codex -ErrorAction Stop

if ($codexCommand.CommandType -eq "ExternalScript" -and $codexCommand.Source.EndsWith("codex.ps1")) {
    $codexScript = Join-Path (Split-Path $codexCommand.Source -Parent) "node_modules\@openai\codex\bin\codex.js"
    if (-not (Test-Path $codexScript)) {
        throw "Unable to locate the Codex CLI entrypoint beside $($codexCommand.Source)."
    }
    $codexExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    $codexPrefixArguments = @($codexScript)
} else {
    $codexExecutable = $codexCommand.Source
    $codexPrefixArguments = @()
}

$authStdout = [System.IO.Path]::GetTempFileName()
$authStderr = [System.IO.Path]::GetTempFileName()
try {
    $authArguments = @($codexPrefixArguments) + @("login", "status")
    $authExitCode = Invoke-RedirectedProcess `
        -FilePath $codexExecutable `
        -Arguments $authArguments `
        -WorkingDirectory $repoRoot `
        -StandardOutput $authStdout `
        -StandardError $authStderr `
        -TimeoutSeconds 60
    if ($authExitCode -ne 0) {
        throw "Codex CLI is not authenticated. Run 'codex login' before starting Ralph."
    }
}
finally {
    Remove-Item -LiteralPath $authStdout, $authStderr -Force -ErrorAction SilentlyContinue
}

$gitRootText = (& $git.Source -C $repoRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the Git repository root."
}
$gitRoot = (Resolve-Path -LiteralPath $gitRootText).Path
if (-not [string]::Equals($gitRoot, $repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
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

    try {
        $savedProgress = Get-Content -Raw $progressFile | ConvertFrom-Json
    }
    catch {
        throw "Ralph progress is not valid JSON: $progressFile"
    }
    if (-not $savedProgress.PSObject.Properties["completed"] -or $savedProgress.completed -isnot [array]) {
        throw "Ralph progress must contain a completed array. Inspect $progressFile."
    }
    $savedCompleted = @($savedProgress.completed)
    if ($savedCompleted.Count -gt 0) {
        $lastCommitProperty = $savedProgress.PSObject.Properties["lastCommit"]
        if (-not $lastCommitProperty -or -not [string]$savedProgress.lastCommit) {
            throw "Ralph progress contains completed issues but no lastCommit. Inspect $progressFile."
        }
        if (
            -not $savedProgress.PSObject.Properties["lastCompletedIssue"] -or
            [int]$savedProgress.lastCompletedIssue -ne [int]$savedCompleted[-1]
        ) {
            throw "Ralph progress lastCompletedIssue does not match the completed queue. Inspect $progressFile."
        }

        $previousErrorPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $git.Source -C $repoRoot merge-base --is-ancestor ([string]$savedProgress.lastCommit) HEAD *> $null
        $savedCommitIsAncestor = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $previousErrorPreference
        if (-not $savedCommitIsAncestor) {
            throw "Ralph progress points to a commit that is not present on the current branch. Inspect $progressFile before continuing."
        }
    }
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
    Write-RalphStatus "Dry run passed; no agent was started and no repository state was changed."
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
$verificationStdoutLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-verification-stdout.log"
$verificationStderrLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-verification-stderr.log"
$reviewPromptFile = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-review-prompt.txt"
$reviewStdoutLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-review-stdout.log"
$reviewStderrLog = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-review-stderr.log"
$reviewResultFile = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-review-result.json"
$typecheckBeforeStdout = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-before-stdout.log"
$typecheckBeforeStderr = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-before-stderr.log"
$typecheckBeforeCombined = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-before.log"
$typecheckAfterStdout = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-after-stdout.log"
$typecheckAfterStderr = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-after-stderr.log"
$typecheckAfterCombined = Join-Path $stateDirectory "$timestamp-issue-$($issue.issueNumber)-typecheck-after.log"

[System.IO.File]::WriteAllText($promptFile, $prompt)
$beforeSha = (& $git.Source -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the starting commit."
}

$typeScriptCompiler = Join-Path $repoRoot "node_modules\typescript\lib\tsc.js"
if (-not (Test-Path $typeScriptCompiler)) {
    throw "Unable to locate TypeScript at $typeScriptCompiler. Install dependencies before running Ralph."
}
Write-RalphStatus "Capturing the pre-implementation TypeScript diagnostic baseline."
$null = Invoke-RedirectedProcess `
    -FilePath $node.Source `
    -Arguments @($typeScriptCompiler, "--noEmit", "--pretty", "false") `
    -WorkingDirectory $repoRoot `
    -StandardOutput $typecheckBeforeStdout `
    -StandardError $typecheckBeforeStderr `
    -TimeoutSeconds $VerificationTimeoutSeconds
Merge-ProcessLogs `
    -Paths @($typecheckBeforeStdout, $typecheckBeforeStderr) `
    -Destination $typecheckBeforeCombined

Write-RalphStatus "Starting a fresh ephemeral Codex invocation. Logs: $stderrLog"
$codexArguments = @($codexPrefixArguments) + @(
    "exec",
    "--ephemeral",
    "--sandbox", "workspace-write",
    "--cd", $repoRoot,
    "--output-schema", $resultSchema,
    "--output-last-message", $resultFile,
    "-"
)

$codexExitCode = Invoke-RedirectedProcess `
    -FilePath $codexExecutable `
    -Arguments $codexArguments `
    -WorkingDirectory $repoRoot `
    -StandardInput $promptFile `
    -StandardOutput $stdoutLog `
    -StandardError $stderrLog `
    -TimeoutSeconds $ImplementationTimeoutSeconds

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
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the post-run commit."
}
$postRunBranch = (& $git.Source -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the post-run branch."
}
$commitCountText = (& $git.Source -C $repoRoot rev-list --count "$beforeSha..$afterSha").Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to count the commits created by the iteration."
}
$commitCount = [int]$commitCountText
$directParent = if ($afterSha -ne $beforeSha) {
    (& $git.Source -C $repoRoot rev-parse "$afterSha^").Trim()
} else {
    ""
}
if ($afterSha -ne $beforeSha -and $LASTEXITCODE -ne 0) {
    throw "Unable to verify the parent of the new commit."
}
$commitSubject = if ($afterSha -ne $beforeSha) {
    (& $git.Source -C $repoRoot log -1 --pretty=%s).Trim()
} else {
    ""
}
if ($afterSha -ne $beforeSha -and $LASTEXITCODE -ne 0) {
    throw "Unable to read the new commit subject."
}
$preVerificationChanges = @(& $git.Source -C $repoRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the post-agent worktree."
}

if ($preVerificationChanges.Count -gt 0) {
    throw "Codex left a dirty worktree. Inspect the changes before continuing."
}
if ($postRunBranch -ne $Branch) {
    throw "Codex left the integration branch. Expected '$Branch' but found '$postRunBranch'."
}
if ($directParent -ne $beforeSha) {
    throw "The new commit does not directly extend the starting commit. Inspect Git history before continuing."
}
if ($commitCount -ne 1) {
    throw "Codex created $commitCount commits; exactly one is required."
}

$vitestScript = Join-Path $repoRoot "node_modules\vitest\vitest.mjs"
if (-not (Test-Path $vitestScript)) {
    throw "Unable to locate Vitest at $vitestScript. Install dependencies before running Ralph."
}
Write-RalphStatus "Running the independent full Vitest suite."
$verificationExitCode = Invoke-RedirectedProcess `
    -FilePath $node.Source `
    -Arguments @($vitestScript, "run") `
    -WorkingDirectory $repoRoot `
    -StandardOutput $verificationStdoutLog `
    -StandardError $verificationStderrLog `
    -TimeoutSeconds $VerificationTimeoutSeconds
if ($verificationExitCode -ne 0) {
    throw "Independent tests failed with code $verificationExitCode. Inspect $verificationStdoutLog and $verificationStderrLog."
}

Write-RalphStatus "Comparing post-implementation TypeScript diagnostics to the baseline."
$null = Invoke-RedirectedProcess `
    -FilePath $node.Source `
    -Arguments @($typeScriptCompiler, "--noEmit", "--pretty", "false") `
    -WorkingDirectory $repoRoot `
    -StandardOutput $typecheckAfterStdout `
    -StandardError $typecheckAfterStderr `
    -TimeoutSeconds $VerificationTimeoutSeconds
Merge-ProcessLogs `
    -Paths @($typecheckAfterStdout, $typecheckAfterStderr) `
    -Destination $typecheckAfterCombined
$diagnosticComparisonJson = & $node.Source $queueHelper compare-diagnostics --before $typecheckBeforeCombined --after $typecheckAfterCombined
if ($LASTEXITCODE -ne 0) {
    throw "Unable to compare TypeScript diagnostics."
}
$diagnosticComparison = $diagnosticComparisonJson | ConvertFrom-Json
if (@($diagnosticComparison.newDiagnostics).Count -gt 0) {
    $newDiagnosticSummary = @($diagnosticComparison.newDiagnostics) -join "; "
    throw "The iteration introduced new TypeScript diagnostics: $newDiagnosticSummary"
}

$reviewPrompt = @"
Review commit $afterSha only. This is an independent, read-only gate for issue #$($issue.issueNumber): $($issue.title).

What the ticket must deliver:
$($issue.whatToBuild)

Acceptance criteria:
$criteria

Approved test seam:
$($issue.testSeam)

Check the commit against AGENTS.md, repository standards, the acceptance criteria, correctness, regressions, and missing tests. Report only blocking correctness/spec/standards findings. Do not edit files. Return status=pass with an empty blockingFindings array only when no blocking finding remains.
"@
[System.IO.File]::WriteAllText($reviewPromptFile, $reviewPrompt)
$reviewArguments = @($codexPrefixArguments) + @(
    "exec",
    "review",
    "--ephemeral",
    "--commit", $afterSha,
    "--output-schema", $reviewSchema,
    "--output-last-message", $reviewResultFile,
    "-"
)
Write-RalphStatus "Running an independent Codex review of commit $afterSha."
$reviewExitCode = Invoke-RedirectedProcess `
    -FilePath $codexExecutable `
    -Arguments $reviewArguments `
    -WorkingDirectory $repoRoot `
    -StandardInput $reviewPromptFile `
    -StandardOutput $reviewStdoutLog `
    -StandardError $reviewStderrLog `
    -TimeoutSeconds $ReviewTimeoutSeconds
if ($reviewExitCode -ne 0) {
    throw "Independent review failed to run. Inspect $reviewStdoutLog and $reviewStderrLog."
}
try {
    $independentReview = Get-Content -Raw $reviewResultFile | ConvertFrom-Json
}
catch {
    throw "Independent review returned invalid structured output. Inspect $reviewResultFile."
}

$postRunChanges = @(& $git.Source -C $repoRoot status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the final worktree."
}
$finalBranch = (& $git.Source -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the final branch."
}
$finalHead = (& $git.Source -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the final HEAD."
}

$iteration = [ordered]@{
    selectedIssueNumber = [int]$issue.issueNumber
    beforeSha = $beforeSha
    afterSha = $afterSha
    commitCount = $commitCount
    branchMatches = ($postRunBranch -eq $Branch -and $finalBranch -eq $Branch)
    directParentMatches = ($directParent -eq $beforeSha)
    headMatches = ($finalHead -eq $afterSha)
    worktreeClean = ($postRunChanges.Count -eq 0)
    commitSubject = $commitSubject
    verificationExitCode = $verificationExitCode
    independentReview = $independentReview
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
