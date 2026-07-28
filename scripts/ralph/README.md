# Architecture Ralph loop

This is a bounded, fail-safe Codex loop for implementing GitHub issues
[#481–#504](https://github.com/xtan9/betterr_me/issues?q=is%3Aissue+label%3Aready-for-agent+created%3A%3E%3D2026-07-27).
It follows the approved dependency graph, starts a fresh ephemeral Codex context
for one issue at a time, and keeps successful work on the shared
`codex/ralph-architecture` integration branch.

The queue snapshot is local and immutable during a run. Ralph does not update,
close, label, push, or merge anything on GitHub.

## Safety contract

An iteration advances only when all of these are true:

- Codex reports the selected issue complete.
- The implementation reports tests and code review complete.
- An independent full Vitest run passes after the commit.
- The commit introduces no TypeScript diagnostics beyond the captured baseline.
- A separate ephemeral Codex review reports no blocking findings.
- Exactly one new commit was created.
- The commit directly extends the prior integration-branch commit.
- The commit message references the selected issue number.
- The worktree is clean.

Any failed command, malformed result, dirty worktree, ambiguous ticket, missing
infrastructure, or failed success gate stops the loop. Local progress and logs
live under `.ralph-state/`, which Git ignores.

Implementation, verification, and review stages have default time limits of
120, 15, and 30 minutes respectively. The launchers stop the timed-out process
tree rather than allowing one hung stage to consume the whole night. These can
be overridden with the corresponding `*TimeoutSeconds` parameters.

Codex runs with `--ephemeral --sandbox workspace-write`. It does not use the
dangerous approval/sandbox bypass flag.

## Prerequisites

- Start on `codex/ralph-architecture` with a clean worktree.
- Ensure `codex --version` and `codex login status` succeed.
- Keep dependencies installed in `node_modules`.
- Review `architecture-queue.json`; it is the approved offline snapshot of the
  issue descriptions, blockers, acceptance criteria, and TDD seams.

The runnable Vitest baseline is green. The full TypeScript check currently
reports pre-existing diagnostics in older test files, so each iteration must
distinguish that baseline from new diagnostics and may not introduce errors in
its changed scope.

## Supervised shakeout

Run a dry preflight first. This validates Codex authentication, the branch,
clean worktree, tools, queue, progress, and next issue without starting an
agent or changing repository state:

```powershell
.\scripts\ralph\ralph-once.ps1 -DryRun
```

Then run one implementation while watching it:

```powershell
.\scripts\ralph\ralph-once.ps1
```

Inspect the resulting commit and run another supervised iteration. Matt
Pocock's Ralph guidance recommends building confidence with human-in-the-loop
runs before switching to AFK mode.

## Overnight run

After two successful supervised iterations:

```powershell
.\scripts\ralph\afk-ralph.ps1 -Iterations 24
```

The iteration limit bounds runtime and spend. Re-running the same command is
safe: selection resumes from `.ralph-state/progress.json` after confirming its
last completed commit is still an ancestor of the integration branch. A completed queue
returns `queue-complete` without invoking Codex.

To perform only the AFK launcher's preflight:

```powershell
.\scripts\ralph\afk-ralph.ps1 -Iterations 24 -DryRun
```

## Monitoring and recovery

Each invocation writes its prompt, stdout, stderr, structured result, and gate
input under `.ralph-state/`. If the loop stops, inspect the newest files and the
worktree before doing anything else:

```powershell
Get-ChildItem .ralph-state | Sort-Object LastWriteTime -Descending | Select-Object -First 8
git status --short --branch
git log --oneline --decorate -10
```

Do not manually mark an issue complete in `progress.json` unless its verified
commit is already present on the integration branch. GitHub issues should stay
open until the resulting integration work has been reviewed and merged.

## Files

- `architecture-queue.json` — ordered ticket snapshot and blocking graph.
- `queue.mjs` — validated selection and success-gate logic.
- `result.schema.json` — structured final response required from Codex.
- `review.schema.json` — structured result for the independent review gate.
- `ralph-once.ps1` — one fresh Codex iteration.
- `afk-ralph.ps1` — bounded loop around `ralph-once.ps1`.
