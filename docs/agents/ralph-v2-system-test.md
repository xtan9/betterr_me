# Ralph v2 system-test contract

## Purpose

Ralph v2 is accepted through observable delivery behaviour, not through tests of
its internal scheduler or state representation. The system test launches the
same public orchestration interface used by the CLI, performs real Git and
worktree operations against a temporary bare remote, and substitutes only the
GitHub, Codex, verification, and clock boundaries.

The production Ralph v1 controller remains unchanged and inactive while v2 is
developed beside it.

## Public seam

The orchestration module exposes a small interface:

```js
createRalphRuntime(options)
runCli(["run" | "status" | "stop", ...options], { runtime, stdout, stderr })
```

Importing either module must not read or write the filesystem, acquire a lock,
access the network, or start a process. `runCli()` returns an exit code and all
durable behaviour stays behind the runtime interface.

The production CLI is a thin composition root over this interface. System
tests call the same interface with real Git and deterministic external
adapters. Later crash tests launch it in a fresh Node process.

The worker boundary is session-oriented. `startOrAttach()` is one atomic
capability keyed by the controller-generated session ID: it returns a durable
completion receipt, waits on that exact live session, or starts it exactly
once. It may never implement “not completed, therefore spawn.” `terminate()`
must return an authoritative receipt only after the complete process tree is
dead. These guarantees belong to the production worker supervisor and are
tested with real child processes, not assumed from an in-memory mock.

The system suite has a dedicated Node configuration and is excluded from the
normal application suite so candidate verification cannot recursively launch
Ralph. Import purity is checked in a poisoned fresh process before orchestration
is trusted.

## Permanent invariants

1. At most one implementation worker owns a writable checkout.
2. Every issue generation starts at an exact observed `origin/main` commit.
3. A commit, verification receipt, pushed head, and pull request must describe
   the same candidate generation.
4. Protected or secret-bearing content is never committed, pushed, included in
   a pull-request body, or emitted to logs.
5. An issue-scoped failure never stops unrelated ready work.
6. Repeating or recovering an external effect never creates a duplicate claim,
   branch, commit, pull request, check rerun, or merge.
7. Success removes the reusable worktree and local issue branch. A failure
   returns a reviewable remote Draft or an explicitly resumable private
   artifact without contaminating the next checkout.
8. Only an explicit stop, a run deadline, or a controller-integrity failure may
   end an otherwise runnable queue.

## Vertical slice 1: one safe Draft

Given one approved, ready issue and a worker that creates one allowed source
file, `run --mode PrOnly --max-issues 1` must:

1. claim the issue exactly once;
2. create a worktree from the exact remote `main` commit;
3. run exactly one implementation worker;
4. bind passing verification to the candidate Git tree;
5. create and push exactly one commit and branch;
6. create exactly one linked Draft pull request for that pushed head;
7. clean the worktree and local issue branch;
8. expose `published` with no active worker lease through `status`.

Running the same command again must not duplicate any of those effects.
The repeat and subsequent `status` call must each construct a fresh runtime from
the same durable directory; retaining state only in memory is not acceptable.

## Vertical slice 2: the issue #499 regression

The same worker additionally creates empty `package-lock.json`, `yarn.lock`,
and `supabase/seed.sql` files that did not exist at the base commit. Ralph must
discard those known sandbox placeholders before constructing the candidate,
publish the allowed source change, clean up, and continue rather than stopping.

A non-empty protected edit is a separate scenario: it must be quarantined from
publication, produce exact evidence, release the implementation lane safely,
and allow an unrelated ready issue to proceed.

## Later vertical slices

After the first two slices pass, the same seam will be extended one behaviour
at a time for intent/receipt crash recovery, two-issue queue progress, bounded
repair, failed and cancelled checks, base movement and conflicts, manual GitHub
actions, kill-switch behaviour, hostile issue content, randomized fault
injection, Windows/WSL contracts, and a live GitHub PR-only canary.

## Release acceptance matrix

Ralph v2 is not eligible for a live queue merely because its happy path is
green. The dedicated system suite must exercise every row below through the
public CLI in fresh processes. A skipped scenario is an incomplete release,
not a passing gate.

| Area | Required observable scenarios |
| --- | --- |
| Selection | Dependency-frontier order; claimed, closed, and unapproved issues excluded; one blocked route does not block an unrelated route; a manually merged PR is reconciled before selecting more work. |
| Ownership | Atomic GitHub claim race; one local controller; one writable implementation session; recovery attaches to a surviving session and never starts a duplicate. |
| Freshness | Every generation begins at the exact latest remote `main`; a moved base is adopted and fully reverified; a conflicting base enters bounded conflict repair; the next issue starts from the preceding merge. |
| Worker | Every implementation and repair is a fresh isolated Codex session using the immutable `implement` and `tdd` disciplines; the worker has no GitHub or network credentials, receives an allowlisted environment, and cannot alter controller or verification assets. |
| Verification | Related tests, TypeScript diagnostics, the full suite, and exhaustive independent review are bound to one candidate tree; every changed contract, file, and review axis has evidence; repair reviews close every durable finding. |
| Repairs | One complete finding batch per attempt; default maximum five coding attempts; interrupted attempts are never completed; check reruns and transient retries have separate bounds; exhaustion produces a safe reviewable Draft or a private safety artifact and releases the queue. |
| Pull requests | Exactly one linked PR per generation; title and body conventions are controller-owned; all reported required checks are terminal and successful; generic failed-check evidence returns to bounded repair; cancelled checks use bounded reruns; repeated recovery is idempotent. |
| Merge | `PrOnly` never merges; `AutoMerge` merges only a current, conflict-free, low-risk, unambiguous head with passing verification, exhaustive review, required approvals, and all required checks; high-risk, ambiguous, conflicted, or failed work remains human-gated. |
| Stop and bounds | Dry-run has no writes; issue limit, run deadline, phase timeouts, retry bounds, and STOP are enforced; STOP terminates a non-cooperative child tree within a bound and prevents the next irreversible stage; startup reconciles a stopped in-flight generation. |
| Recovery | Hard crashes immediately after every Git, GitHub, worker, and verifier effect recover exactly once; stale and partially written locks recover safely; PID reuse cannot impersonate the owner; tampered state, worktree, ancestry, remote head, or receipt fails closed. |
| Safety | Hostile issue text cannot alter policy, prompts, models, commands, paths, environment, credentials, gates, or PR metadata; secret-bearing, symlinked, protected-path, and unverified-history candidates are never committed or pushed and stop when containment cannot be proved. |
| Cleanup and reporting | A published or merged generation removes its local worktree, branch, and private views; blocked artifacts remain exact and reviewable; every exit atomically refreshes machine and human summaries with merged, parked, failed, active, and stop-reason entries. |
| Platform | The same acceptance suite passes on Windows; WSL worker composition proves immutable dependencies and skills, credential isolation, bounded process-tree control, and live redacted streaming; a fault-injection soak leaves no duplicates or leaked worker. |

The final pre-release proof is a multi-issue overnight simulation combining
success, repair, failed checks, base movement, conflict repair, high risk,
ambiguity, manual merge, controller restart, and an unrelated dependency route.
It must drain every eligible route sequentially and produce an exact summary.
Only then may a supervised live GitHub `PrOnly` canary run; automatic merging is
enabled only after that canary is audited.
