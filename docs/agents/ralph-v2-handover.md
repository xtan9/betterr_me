# Ralph v2 handover

## Status

Ralph v2 is implemented on `codex/ralph-v2-system-test`, but it is not yet
approved for a live GitHub issue run or automatic merging. The branch is a
pause point for review and continued verification.

The existing v1/live Ralph runner was not replaced or started by this work.

## What this branch contains

- A production v2 controller with bounded retries, issue limits, deadlines,
  STOP handling, PR-only and automatic-merge modes, and durable summaries.
- Sequential worker ownership, crash recovery, idempotent issue claims and PR
  effects, dependency-aware issue selection, and cleanup of delivered work.
- Fresh worker, verifier, and reviewer process boundaries plus immutable WSL
  skill/dependency checks.
- Failed-check repair, conflict repair, human gates for ambiguous or high-risk
  work, and preservation of blocked Draft PRs/private artifacts.
- Centralized secret redaction for logs, artifacts, and summaries.
- A release matrix, executable release-proof receipt generator, a combined
  overnight acceptance scenario, and fault-injection recovery coverage.

## Verification completed

- The v2 system suite previously passed 38 files / 211 tests before the final
  hardening changes.
- Focused suites for the final changes passed, including production entry,
  queue audit, GitHub adapter, WSL preflight, overnight acceptance, five repair
  attempts, atomic claim contention, and all eight fault-soak checkpoints.
- A later full system run passed 224 of 225 tests. The sole failure was the
  controller metadata-publication crash-recovery assertion.
- That failed scenario subsequently passed once in isolation and then passed
  five consecutive fresh-process repetitions (10 boundary cases total).
- A final full-suite rerun was intentionally stopped at the user's request
  before it produced a result.

## Remaining release gate

Do not run Ralph v2 against the live issue queue yet. Resume with these steps:

1. Rebase or merge the current remote `main` into this branch and resolve any
   conflicts without weakening the safety contracts.
2. Run the complete v2 system suite with two workers and a JSON report:

   ```powershell
   .\node_modules\.bin\vitest.cmd run --config scripts/ralph/vitest.system.config.mjs --maxWorkers=2 --reporter=json --outputFile=$env:TEMP\ralph-v2-full-report.json
   ```

3. Produce and inspect the release-proof receipt from that successful report:

   ```powershell
   node scripts/ralph/v2/release-proof.mjs --report "$env:TEMP\ralph-v2-full-report.json"
   ```

4. Run the Ralph unit suites and repository-required PR checks.
5. Obtain a final blocker-only code/security/test review against the updated
   `origin/main` merge base.
6. Merge this PR only when all checks and review gates pass.
7. After merge, begin with a supervised, bounded PR-only canary. Automatic
   merging remains disabled until the canary is audited successfully.

## Known investigation point

If the metadata-publication recovery test fails again under full-suite
contention, capture the recovered CLI JSON and state before changing code. A
single isolated retry is not sufficient release evidence, even though repeated
isolated stress has passed.

## Safety boundary

This handover is not authorization to launch AutoMerge or process the live
approved queue. The first live validation must be PR-only, bounded, visible,
and manually audited.
