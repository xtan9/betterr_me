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
Before each worker starts, the controller builds and validates a read-only,
one-commit Git view of that issue's baseline. This lets Linux Git inspect the
Windows worktree without exposing the controller repository's config, remotes,
reflogs, unrelated history, or writable metadata.

## Modes

- `DryRun` performs authentication and live eligibility checks but makes no
  issue, branch, worktree, PR, or merge change.
- `PrOnly` is the default. It pushes each successful issue to a linked PR,
  waits for required checks, repairs check failures within the shared bounded
  repair budget, then parks the green PR for human review and continues with
  another unrelated issue on the ready dependency frontier. Dependents remain
  blocked until their PR is actually merged.
- `AutoMerge` waits for all reported GitHub checks and required review approvals.
  It merges without bypass only when the diff is classified low risk, the PR is
  conflict-free, and every gate passes. High-risk work must still pass required
  checks (including bounded check-failure repairs) before it is parked for a
  human merge while the single worker continues through unrelated ready issues.

Automatic merging uses a sensitive-scope denylist. Ordinary application,
domain, persistence, and test changes may qualify as low risk after every test,
review, check, conflict, and ambiguity gate passes. Controller and CI changes,
dependencies, authentication and credentials, finance and payments, database
migrations, privileged administration, destructive issue scope, and deployment
or compiler configuration always stop at a PR for human review.

## Prerequisites

- The controller checkout must be clean.
- Windows `git`, `gh`, and `node` must be installed and authenticated.
- WSL2 Ubuntu must contain Linux Node 24 and Codex 0.145.0. At startup the
  controller seeds only the existing Windows `auth.json` into a dedicated,
  worker-owned WSL Codex runtime outside the agent-readable filesystem policy.
  A refreshed runtime credential is preserved across controller restarts; a
  newer Windows credential is recopied after an explicit desktop re-login.
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

## Live monitoring

Ralph writes a redacted, human-readable event stream to the foreground terminal
and to a stable durable log. In another PowerShell window, follow the current
run with:

```powershell
.\scripts\ralph\watch-ralph.ps1
```

The monitor shows controller phases plus filtered Codex agent messages,
commands, file changes, failures, and turn usage. Reasoning events are not
displayed. Each Codex invocation also keeps its unmodified JSONL event stream
beside the existing issue logs for debugging. Live output is observational
only: the structured result file and controller verification gates remain the
authority for commits, PRs, checks, and merges.

Worker model policy is controller-owned and explicit. Implementation and repair
sessions use `gpt-5.6-sol` with high reasoning effort. Initial and final
exhaustive reviews use `gpt-5.6-sol` with xhigh reasoning effort, while bounded
repair-delta reviews use high reasoning effort. Because workers run with
`--ignore-user-config`, personal Codex defaults cannot silently change this
policy.

The exhaustive review uses the immutable `code-review` skill as its review
discipline. The controller launches four separate read-only Codex sessions in
parallel for Standards, Spec, Security/Data Integrity, and Tests/Regression,
then validates and deterministically aggregates their independent reports. A
structured result must prove that every axis, ticket requirement, and changed
file was reviewed, and must include a traceability row for each changed
observable contract. The controller rejects incomplete or internally
inconsistent specialist or aggregate reports. Repair-delta review similarly
launches separate Repair Ledger and Regression specialists.

There is exactly one controller process and one implementation worker at a
time. A process lock prevents a second local controller. A time-limited GitHub
claim comment plus assignment exposes ownership across hosts and resolves a
claim race deterministically.

The active worker uses one reusable `worktrees/current` checkout. Before each
new issue the controller fetches and branches from the latest `origin/main`.
Before publishing, the controller synthesizes the candidate merge with the
latest `origin/main`, rejects conflicts, and checks the merged tree for duplicate
migration timestamps. The issue checkout remains available while required PR
checks run so a failed check can use the same bounded repair loop. Once a PR is
green and parked for a human, or once it is merged, the local worktree, issue
branch, and sanitized Git view are removed. A repair-exhausted
issue with a safe diff
is committed and pushed to a clearly marked draft failed-attempt PR before the
local checkout is removed. The draft records the failed gate and remains
dependency-blocking until a human repairs and merges it. Content that fails the
controller's secret, path, symlink, or history checks is never published; its
local checkout is retained and the whole run stops.

Independent-review product-security findings are ticket-local: repairable
findings use the bounded repair loop, while non-repairable findings may be
published only as a blocked draft after the controller's content and path
safety checks pass. The queue then continues with an unrelated ready issue.
Safety findings—including secret detection, forbidden scope or paths, unsafe
links or history, and controller-integrity failures—still stop the entire run.

Candidate changes beyond the approved ticket are not terminal safety findings
when the exact safe repair is to remove or revert those extra changes to the
issue base. They use the bounded repair loop. Here, forbidden scope means that
completing the ticket itself requires changes outside its approved boundary.

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

Before selecting new work, Ralph also reconciles every open PR recorded in its
durable state. It fingerprints the exact PR head and check generation, repairs
controller-owned metadata, reruns cancelled GitHub Actions checks, and batches
all remaining failed-check evidence into one bounded coding repair. Pending and
completed actions are recorded before and after each side effect so a restart
resumes rather than duplicates it. Check reruns have their own bounded budget;
they do not consume coding repair attempts. A repaired PR still passes the
normal check, review, conflict, risk, and merge gates. A green failed draft may
re-enter one bounded, exhaustive verification and review cycle when its original
blocker is a worker or ticket-specific verification finding. Ralph promotes the
draft only after that cycle passes; safety, ambiguity, controller infrastructure,
explicitly non-repairable findings, exhausted attempts, and high-risk merges
remain human-gated. Unrelated ready issues may continue.

Ticket-specific infrastructure and protected-scope blockers do not consume a
coding attempt merely to re-verify a new, green PR head. Safe in-scope changes
completed before either blocker are committed and pushed to the draft instead
of leaving a dirty worktree that stops the queue. A protected workflow or
controller change still requires supervised handling; Ralph never grants an
ordinary issue worker write access to `.github/**` or `scripts/ralph/**`.

Ticket-specific PostgreSQL fixtures opt into the controller-owned disposable
database gate by placing the exact marker `-- ralph-ci: true` in their first 12
lines. `scripts/ci/run-ralph-sql-tests.sh` discovers marked fixtures in stable
path order, rejects psql meta-commands and dangerous server/role primitives,
clears the process environment, and runs accepted fixtures as a dedicated
non-superuser role. Both local-Supabase PR jobs execute them with
`ON_ERROR_STOP=1`. This gives ordinary workers a narrow test-data-only path to
request real database verification without granting workflow, controller, or
secret authority.

Controller-executed SQL and its enforcement code are immutable to ticket
workers. The worker sandbox mounts `.github/**`, `scripts/ralph/**`, the Ralph
SQL runner and policy, `supabase/tests/e2e_local_authenticated_grants.sql`, and
`supabase/tests/finance_cushion_rls.sql` read-only. Database migrations,
`supabase/config.toml`, and `supabase/seed.sql` are also controller-protected
because CI necessarily applies them with elevated database authority; migration
tickets remain supervised Drafts instead of delegating that authority to
ordinary issue content. The controller independently
rejects any resulting diff that reaches one of those paths before committing or
publishing a failed attempt. Marked fixtures may use procedural assertion blocks
because they run only with the cleared environment and constrained
`ralph_ci_test` database role; direct connection APIs and privilege-bearing
constructs remain rejected by policy.

Implementation, verification, review, and required-check waits are bounded.
Transient network and rate-limit failures use a bounded retry count and
backoff. Concrete test, TypeScript, independent-review, required-PR-check, and
full-suite timeout findings may use up to `MaximumRepairAttempts` genuinely
fresh, isolated repair sessions before the issue is parked. An exhaustive
review persists every finding in a durable ledger so one repair session can
address the complete batch. A durable pending/completed handshake prevents a
crash-partial repair from entering verification; recovery starts another fresh,
bounded repair until a worker completes. Ralph then runs controller-owned related tests,
TypeScript comparison, and a high-effort delta review against that ledger. A
successful repair still has to pass the full Vitest suite, TypeScript
comparison, and a final xhigh exhaustive review before publication. The default
full-suite timeout is 3600 seconds. Ambiguity, unsafe scope,
conflicts, ownership failures, and policy denials are never repaired or retried
automatically. A failed or human-gated issue does not unblock its dependents,
but it also does not prevent the controller from selecting an unrelated ready
issue. Controller, infrastructure, non-test timeout, and kill-switch failures
still stop the whole run.

The claim lease must be more than one hour longer than the longest cumulative
span between ownership checks. Invalid combinations fail during argument
validation, before a GitHub write.

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
