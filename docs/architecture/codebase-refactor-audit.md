# Codebase refactor audit — 2026-10-22

## Request and scope

The request was to inspect every file for oversized modules, poor design, and
duplication, then thoroughly refactor and clean up. This is a behavior-preserving
maintenance change, based on main at
`051bfd48a586fe3c1b0c3539f60ade4200cba31d`.

All 2,221 tracked files were inventoried. Production TypeScript/JavaScript was
scanned for module size, large declarations, duplicate function bodies, and
import dependencies. The concentrated findings were then read alongside their
callers, tests, and relevant ADRs. This is a structural audit plus focused manual
review, not a claim that every line of historical material was manually reviewed.

The acceptance criteria are:

- Keep existing import paths and exported interfaces available.
- Preserve visible behavior, translations, financial formulas, local-date
  handling, authentication, error outcomes, and database request payloads.
- Separate responsibilities where a module mixes state, validation,
  presentation, and persistence. Keep one owner for each mutation or lifecycle.
- Consolidate repeated behavior when the callers share the same semantics.
- Introduce no runtime import cycles, dependencies, database migrations, or
  product features.
- Pass type-checking, lint, the existing full test suite, and relevant browser
  flows. Update architecture checks to follow moved declarations while retaining
  the boundaries they enforce.

## Structural changes

Line counts include imports, comments, and compatibility re-exports. Smaller
entry files are an outcome of separating responsibilities, not a size limit.

| Existing module | Before | After | Extracted responsibilities |
| --- | ---: | ---: | --- |
| Household Runway Interview | 5,385 | 633 | Model, protocol, projections, answers, stages, draft validation, assessment, rendering, state transitions, inputs, navigation, draft operations, Plan operations |
| Household Runway Runtime | 2,592 | 1,036 | Contracts, intent validation, public view types, restoration, snapshot projection, capability execution |
| Household Runway component | 1,603 | 310 | Shell, shared fields, stage routing, income, assets, expenses, review |
| Recurring Task lifecycle | 2,215 | 1,091 | Contracts, in-memory persistence, Series projection, validation, Coverage, outcomes, metrics, idempotency |
| Recurring Task capabilities | 1,041 | 490 | Contracts, outcome mapping, opaque Series versions |
| Workout writes | 1,512 | 438 | Contracts, validation, persistence |
| Habit writes | 1,341 | 472 | Contracts, validation, reminder configuration, persistence |
| Task commands | 1,090 | 516 | Contracts, input translation, outcomes, ordinary persistence |
| Scheduling writes | 873 | 107 | Contracts, validation, persistence |
| Journal writes | 774 | 138 | Contracts, validation, persistence |
| Project writes | 647 | 118 | Contracts, validation, persistence |
| Current Profile hook | 683 | 514 | Pure revision-aware cache reconciliation |

The Interview dispatcher remains the entry point for its state machine. The
Runtime still owns startup, message ordering, retries, and disposal. Its effect
executor receives the current locale and disposal state through callbacks, so
asynchronous work observes current state rather than captured initial values.
The five-method public Runtime interface is unchanged.

The Recurring Task lifecycle retains atomic mutation coordination in one class.
It was not divided by an arbitrary line threshold: its remaining command methods
share revision, transaction, and idempotency invariants. The authenticated
capability factory remains the supported public entry point.

Each write module keeps its existing command class and production factory.
Validation and persistence implementations are siblings inside the same domain;
HTTP and AI callers continue importing the existing write boundary.

These changes follow ADRs 0005, 0010, 0011, and 0012 without changing their decisions.

## Repeated behavior consolidated

- Six preference database adapters share RPC error normalization, preserving the
  message and optional database error code.
- Insights reuses the existing local week-start calculation.
- Both chat persistence consumers share the same JSON request/error helper.
- Exercise search and workout selection share filtering and grouping, preserving
  catalog order and object references.
- Both Task list views share counts and case-insensitive filtering.
- Ordinary Task execution and replay share RPC payload construction; they still
  call their separate atomic and replay procedures.
- Calendar grid and current-time marker share their vertical scale in an
  independent module, removing their existing import cycle.

## Material retained deliberately

Historical SQL migrations, stored-data fixtures, legacy Runway migration
defaults, archived planning records, and screenshots describe past states.
They are not rewritten to resemble the current implementation. In particular,
legacy migration defaults must not inherit future changes to current defaults.

The database type catalog, translation dictionaries, and cohesive domain tables
are large because they enumerate a shared vocabulary. Splitting them solely to
lower line counts would add navigation without isolating a responsibility.
Managed shadcn components and generated artifacts were left under their existing
owners.

Existing focused API routes, query adapters, mobile features, unrelated scripts, and
unrelated documentation did not need changes for these findings. Domain
validators that only look similar remain separate when their error contracts or
accepted input differ. Test scenarios and fixtures remain colocated with the
behavior they exercise.

## CI compatibility repair

The PR run exposed an existing environment mismatch: ubuntu-latest selected
Ubuntu 26.04, but the locked Playwright 1.58.1 browser registry has no downloads
for that OS. SQL acceptance fixtures passed; browser installation failed before
app verification began. Pin the three workflows that run Playwright (E2E,
cross-browser smoke, and snapshot updates) to supported Ubuntu 24.04. This keeps
the installed dependencies and all test gates intact. The extracted Current
Profile cache also belongs to the existing settings CI ownership rule, retaining
its full browser verification selection when it changes independently.

## Verification evidence

- Full Vitest run: 500 files passed; 6,126 tests passed, 21 skipped, zero failures.
- Full TypeScript check and production build passed.
- Public Household Runway browser checks: 24 passed across desktop and mobile;
  two authenticated-only cases skipped in the public projects.
- Full ESLint run: zero errors; four existing warnings in unchanged files.
- Comparing the original exported names at every changed entry path found no
  additions or removals.
- Across the twelve decomposed modules, 857 of 859 top-level declarations retain
  their exact source after normalizing line endings and the added internal
  export modifier. The two intentionally changed declarations are the Runtime
  composition factory (effect extraction) and ordinary Task persistence (shared
  atomic/replay request construction).
- The static runtime import graph for app, components, and lib has no cycles
  after cleanup. The baseline had the calendar grid/current-time-marker cycle.
- Architecture tests now inspect the extracted contracts and include the moved
  Task command internals and all Household Runway components and internal
  Interview/Runtime modules in their scans.
- The Current Profile architecture suite caches immutable source text rather than
  rereading every file for every pattern. Its slowest check passed in 123 ms after
  caching versus 2,260 ms beforehand on the same machine; all assertions remain.

The pull request records final build, affected-suite reruns, browser results, and
the independent standards/spec review. No new product decisions or unresolved
product questions were introduced.
