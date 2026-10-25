# Completed Train synchronization

Backend companion to [mobile #415](https://github.com/xtan9/betterr_me_mobile/issues/415).
The native draft remains local. Finishing freezes one v1 completion; uploading it creates a completed workout and its performed rows atomically. It never occupies or replaces the account's existing Web active workout.

## Wire and persistence

`POST /api/mobile/train/completions` authenticates a captured Supabase user JWT. Cookie, MCP and service credentials do not substitute for that user. The cookie proxy delegates only this exact native route to its own authentication.

```text
{ protocolVersion: 1, operationId: completion.id, completion }
  → owner and envelope checks
  → upload_completed_workout(operationId, completion)
      lock owner + create-completed + operationId
      existing identical document → original receipt
      existing changed document → conflict
      validate v1 + resolve public catalog references
      insert completed workout + ordered entries + performed sets + receipt
```

The v1 document is the mobile `CompletedWorkout`: identity, owner, installation source, start/end timestamps, recorded duration, timezone/day, opaque `planId`, ordered entries with captured bilingual definition/equipment/mode/load convention, and ordered performed sets with canonical kg, repetitions and warmup/working kind. Each entry and set has its own UUID. The initial operation ID equals the completion/workout ID; retries never replace IDs or mutate the frozen payload.

A first upload and every identical retry return HTTP 200 and the same stored receipt:

```json
{
  "protocolVersion": 1,
  "receipt": {
    "operation": "create-completed",
    "operationId": "<completion UUID>",
    "ownerId": "<authenticated account UUID>",
    "workoutId": "<completion UUID>",
    "sourceId": "<installation UUID>",
    "acceptedAt": "<first server acceptance timestamp>"
  }
}
```

Errors are `{ "protocolVersion": 1, "error": { "code": "…" } }`:

| HTTP | Code / meaning |
| --- | --- |
| 400 | `invalid_request`: malformed JSON/envelope/operation UUID |
| 401 | `unauthenticated`: user JWT absent or rejected |
| 403 | `owner_mismatch`: document belongs to another account |
| 422 | `unsupported_version` for the transport; `invalid_completion` for an unsupported/invalid frozen document |
| 409 | `operation_conflict`: accepted operation, changed document; `identity_conflict`: workout/entry/set UUID already exists; `reference_unavailable`: catalog reference no longer resolves to the required public meaning |
| 503 | `unavailable`: authentication infrastructure, RPC or unexpected response failure; no internal database details |

The client retains its local completion and exact pending upload until it validates the matching receipt. An interrupted response may already have committed; retrying the same operation safely recovers the original receipt. Neither conflicts nor remote failures authorize a replacement workout or dropping local history.

`workouts.native_completion` is nullable JSONB. Existing rows remain NULL. A native row retains the exact accepted document, and normalized rows preserve the actual server exercise UUIDs. The captured definition is the history authority after live catalog renames. Native PostgREST `SELECT *` reads expose the raw document; Web/Assistant detail and summaries use its captured definition while retaining `live_exercise` and `recorded_definition` separately. Unsupported recorded versions fail explicitly rather than silently rebuilding history from today's catalog.

`planId` is frozen, unverified provenance only. It is never cast to `routine_id`, used to read a plan, or treated as association/fulfillment authority. #422 must separately validate the owned training occurrence/series/schedule before linking. This upload performs no planner command.

## Database invariants and compatibility

- Receipt rows are owner-readable, privately written and independent of the workout FK. An authorized history deletion retains its create receipt, so a delayed retry cannot resurrect it. Account deletion still removes account-owned receipts.
- Existing authenticated table grants do not bypass native immutability. Parent/child insert/update/delete guards and a deferred projection check protect the accepted document and exact normalized fields. Directly forging a native parent without its private receipt fails. Removing the parent as a whole remains allowed.
- A new completion requires at least one performed set; a warmup-only completion is valid. Existing zero-set completed history remains readable and its idempotent terminal response remains unchanged. The Web terminal command returns a typed invalid outcome for a new empty completion.
- Workout kg and routine target kg widen from `NUMERIC(7,2)` to unconstrained `NUMERIC`; reps/target reps and workout duration widen to `BIGINT`. No legacy identity, null, value or deferred field is backfilled or coerced. Forward inputs are checked before integer casts. `0.123` and every accepted safe-integer repetition survive upload → read → save-as-routine → restart.
- All eight legacy measurement modes, deferred duration/distance/RPE fields, order, notes, rest nulls and existing set kinds remain. Save-as-routine still selects its existing representative normal set. Warmup-only history does not invent a reusable working set. Unknown rest remains NULL and starts no timer.
- Raw large finite numbers are retained; non-finite derived totals are unavailable (`null` aggregate / “—” display), never zero or an infinite personal record. Existing Web pound-input rounding is unchanged and is not used by upload or routine copying.
- The trusted MCP adapter carries the existing verified owner and scopes. `write` is required for start/complete. Its service-only, statically enumerated bridge checks routine/workout/reference ownership, temporarily supplies the verified subject to the original `auth.uid()`-checked RPC, and restores both request claim settings after success and exceptions. It does not change the shared client's headers, loosen ordinary RPC owner checks or offer generic impersonation. Workout/catalog/routine service reads explicitly exclude foreign custom definitions.
- Service table/function grants mirror the read-only audited deployed legacy ACLs, now explicit for new environments. Receipt writes remain private. The one admin SQL fixture is explicitly trusted because it tests service-only behavior; arbitrary fixtures still cannot escalate the constrained runner.

## Reproducible verification

Use the repository's pinned pnpm and Node runtime. The local tools refuse remote API/database targets and do not reset the running database.

```sh
pnpm typecheck
pnpm lint
pnpm test:run
pnpm check:write-inventory
bash scripts/ci/run-sql-fixtures.sh --domain workouts
PSQL_BIN=/absolute/path/to/psql node scripts/ci/verify-train-migration.mjs
SUPABASE_CLI=/absolute/path/to/supabase PSQL_BIN=/absolute/path/to/psql node scripts/e2e/run-train-completion.mjs
```

The migration rehearsal creates and drops only its own uniquely named database. It applies the original fitness DDL/seed and intervening migrations, populates all eight modes/custom definitions/nulls/zero/deferred fields plus 10,032 sets, applies the complete new migration, and compares every old row as JSONB. Local rehearsal: exact preservation passed; DDL transaction took 64 ms on that fixture. This is not a production lock-time estimate.

The HTTP runner starts an isolated loopback Next server with local-only Supabase credentials and an ephemeral MCP issuer secret. It uses actual user JWTs, cookie sessions and signed MCP requests. It proves concurrent duplicate receipts, changed/child collision rollback, numeric extremes, warmup, owner isolation, immutable direct grants, captured-definition reads, cookie save/restart, MCP scope/owner restrictions and retry-after-delete. It deletes only its generated accounts and verifies zero sessions/fitness/receipt residue. Optional `--hold` supplies separate disposable A/B accounts to the coordinating mobile proof in a mode-0600 temporary file; no service key is shared. A sibling release marker or 45-minute bound closes that window and cleans the file/users/server.

Coordinated mobile proof (2026-10-25) passed eight actual SQLite/HTTP cases: SIGKILL before send; after HTTP 200 headers; before local receipt commit; identical frozen retries/first receipt; wrong account; distinct installations; fresh empty install; preserved Web active row; plus captured-definition readback after an actual local preset rename. Native `WorkoutCompletionRepository` and `WorkoutHistoryRepository` were used unchanged. Cookie Web showed the original captured name with the renamed live definition separately. The exact preset name and `updated_at` were restored; generated users, sessions, records and credentials were removed. Native UI acceptance remains the companion mobile PR's gate.

## Rollout

Deploy the migration before enabling native upload. The account-wide Web active index remains in place. Widening can lock/rewrite tables; coordinate deployment and observe lock acquisition on the real workload. Roll back application callers independently if needed, but do not narrow numeric columns or discard accepted receipts/documents: newly valid values may no longer fit the old types. No production mutation was performed during implementation.
