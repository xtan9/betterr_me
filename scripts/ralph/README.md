# Betterr.me GitHub Ralph controller

This controller processes the approved architecture queue one issue at a time.
For every issue it reconciles live GitHub state, claims the issue, creates an
isolated branch and worktree from the latest `origin/main`, starts a fresh
ephemeral Codex worker, independently verifies the result, and opens a linked
pull request.

The implementation worker has no GitHub role. It runs without network access,
with a filtered command environment, cannot write outside its issue worktree,
and is instructed to leave the diff uncommitted. The controller—running outside
that worktree—alone owns state, commits, pushes, PRs, checks, and merges.

## Modes

- `DryRun` performs authentication and live eligibility checks but makes no
  issue, branch, worktree, PR, or merge change.
- `PrOnly` is the default. It claims and implements one issue, pushes it, opens
  a linked PR, writes the summary, and stops for a human.
- `AutoMerge` waits for required GitHub checks and required review approvals.
  It merges without bypass only when the diff is classified low risk, the PR is
  conflict-free, and every gate passes. High-risk work always stops at a PR.

Automatic merging uses a narrow allowlist. Only pure calendar/reminder domain
modules, their validations, and their focused tests may qualify as low risk.
Every other path—including application routes, persistence, controller, CI,
dependencies, authentication, finance, migrations, and configuration—stops at
a PR for human review.

## Prerequisites

- The controller checkout must be clean.
- Windows `git`, `gh`, and `node` must be installed and authenticated.
- WSL2 Ubuntu must contain Linux Node 24 and Codex 0.145.0, with Codex reading
  the existing Windows login through `CODEX_HOME=/mnt/c/Users/steve/.codex`.
- A Linux dependency tree matching `pnpm-lock.yaml` must exist read-only at
  `/var/lib/betterr-me-ralph/deps-source/node_modules`, with its root-owned
  content fingerprint at `/var/lib/betterr-me-ralph/deps.content.sha256`.
- Immutable copies of the `implement`, `tdd`, and `code-review` skills must
  exist below `/var/lib/betterr-me-ralph/worker-home/.agents/skills`.
- The authenticated GitHub account must be allowed to assign issues, push
  branches, create PRs, read branch protection, and merge normally.

Repository policy normally routes issue operations through the GitHub issue
connector. That connector is unavailable to a standalone overnight process, so
this controller uses the authenticated GitHub CLI as an explicit fallback for
live reads and the claim assignment/comment. The WSL worker runs under a
deny-by-default Linux filesystem profile, cannot read the Windows Codex/GitHub
credential directories, and never receives that authority.

## Supervised proving run

```powershell
.\scripts\ralph\ralph-once.ps1 -Mode DryRun
.\scripts\ralph\ralph-once.ps1 -Mode PrOnly
```

Inspect the first PR and the durable summary before enabling automatic merge.

## Sequential run

PR-only (default and recommended while proving the controller):

```powershell
.\scripts\ralph\afk-ralph.ps1 -Iterations 24 -Mode PrOnly
```

Limited automatic merge:

```powershell
.\scripts\ralph\afk-ralph.ps1 -Iterations 24 -Mode AutoMerge
```

There is exactly one controller process and one implementation worker at a
time. A process lock prevents a second local controller. A time-limited GitHub
claim comment plus assignment exposes ownership across hosts and resolves a
claim race deterministically.

## Recovery

Durable state, prompts, verification logs, PR metadata, and summaries live
outside every worker at:

```text
%LOCALAPPDATA%\betterr-me-ralph\xtan9_betterr_me
```

State advances atomically through selection, claim, worktree creation,
implementation, verification, commit, push, PR, checks, and merge. Re-running
the same command reconciles the recorded branch, worktree, commit, PR, and
merged SHA instead of starting duplicate work.

Implementation, verification, review, and required-check waits are bounded.
Only transient network and rate-limit failures are retried, with a bounded
attempt count and backoff. Tests, review findings, ambiguity, conflicts, and
policy denials are never retried automatically.

The claim lease must be more than one hour longer than the longest configured
stage timeout. Invalid combinations fail during argument validation, before a
GitHub write.

## Kill switch

Create this file to stop the active child process tree and prevent the next
stage from starting:

```powershell
New-Item -ItemType File "$env:LOCALAPPDATA\betterr-me-ralph\xtan9_betterr_me\STOP"
```

Remove it only when you deliberately want to resume:

```powershell
Remove-Item "$env:LOCALAPPDATA\betterr-me-ralph\xtan9_betterr_me\STOP"
```

## Final summary

Every stop or completion refreshes:

- `overnight-summary.json` for automation;
- `overnight-summary.md` for human review.

The summary records merged PRs, human gates, failures, in-progress issues, and
the exact stop reason.
