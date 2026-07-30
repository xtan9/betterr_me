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

