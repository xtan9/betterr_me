# App-limit continuation verification

Implements the backend portion of mobile [T3 #401](https://github.com/xtan9/betterr_me_mobile/issues/401), “Continue a recovered streak with explicit source and device confirmation”. See the [frozen v1 contract](app-limit-continuation-contract.md).

## Scope and deployment status

The migration was created with pinned Supabase CLI 2.109.1 and iterated only against the disposable local Supabase database on port 54322. No hosted service or production data was changed. A clean migration-ledger run remains an integration gate; the development iteration does not mark that gate complete.

The API stores portable user-reported history and confirmation receipts. It cannot attest local Screen Time authorization, selection, enforcement, or exclusion of the partial application day. Native prepare/review/save/apply and actual UI acceptance are separate required gates. The server never transfers an application token or unlock grant.

## Database and HTTP evidence

The first constrained SQL test failed because the public continuation command did not exist. After the command/read slice passed, the apply-event test failed because an altered restored current count was accepted; receipt-bound validation made it pass. The canonical registered fixture `app_limit_continuations.sql` now verifies:

- Positive paused source recovery with stable confirmation identity and immutable replay.
- Source and destination version checks; both allowance dimensions cannot exceed source or existing pristine destination settings.
- Known source gaps block continuation, including a received post-gap reset; closing the gap preserves the latest reset as non-continuable.
- A later source reset does not rewrite an already confirmed independent destination receipt.
- Exact recorded current/best, label, settings, before snapshot, source, rule and sequence are required for a receipt-bound apply event.
- Pending confirmations do not appear as applied lineage. The accepted event supplies clean-client source provenance without a locally retained operation ID.
- Owner RLS isolation, strict native-state/owner field rejection, immutable direct-write denial and anonymous denial.
- Existing session-only Focus history remains unchanged.

Run the registered constrained fixture with:

```sh
bash scripts/ci/run-sql-fixtures.sh --fixture app_limit_continuations.sql
```

The real HTTP journey uses the established guarded local runner:

```sh
node scripts/e2e/run-focus-history.mjs --continuations
```

It includes the existing T1 and T2 journeys, then creates independent ephemeral sources, concurrently confirms one operation, recovers a discarded response, validates a native apply event, replays its upload, and resolves lineage using only a clean client's history row. Native bearer and real web-cookie reads agree. Foreign account lookup, looser settings, unknown native fields, stale source checkpoints, and post-gap resets are rejected. All eight acceptance groups passed. Cleanup revoked ephemeral sessions, deleted their Auth users and verified zero remaining profile/history/continuation rows; only the runner's Next child was stopped. See [shared runner isolation rules](focus-history-verification.md#signed-in-http-acceptance).

Twenty-four public route tests verify adapters, query/body bounds and strictness, missing lineage, malformed server data, auth failures, and actionable errors. TypeScript, scoped ESLint and delivery write-inventory checks pass. Local security/performance advisors report no app-limit findings (five security and 123 performance warnings are unrelated baseline issues).

After merging backend integration `ed345550` (including the Google snapshot companion), the complete Vitest run passed 497 files / 6,196 tests, with 6 existing environment-gated files / 21 tests skipped. No required continuation test is skipped.
