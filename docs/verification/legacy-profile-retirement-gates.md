# Legacy Profile retirement-gate evidence

Issue #674 is a verification ticket. It does not retire or modify the legacy
Profile endpoints, helpers, columns, or parent issue. The retirement decision
remains fail-closed until every gate below has evidence.

## Gate results

| Gate | Result | Evidence surface |
| --- | --- | --- |
| Production callers of retained legacy read/write contracts | PASS | `node scripts/ci/legacy-profile-retirement-gates.mjs` and `tests/scripts/legacy-profile-retirement-gates.test.ts` |
| Fourteen consecutive complete production days with zero legacy route traffic | NOT VERIFIED | Vercel runtime-log retention did not cover the requested window; see the observation record below |
| Approved telemetry fields only | PASS | `validateLegacyTelemetryRecord` and the legacy route tests |
| Current Profile contract and route suites with legacy client paths disabled | PASS | Focused Vitest command below; `tests/setup.ts` sets `TEST_LEGACY_PROFILE_CLIENT_PATHS=disabled` |
| Owner commands, revision reconciliation, session isolation, degraded presentation | PASS | Focused Current Profile and Preference suites below |
| Authenticated browser journeys | PENDING ENVIRONMENT | `e2e/current-profile-preferences.spec.ts` blocks retained legacy client paths and requires disposable authenticated E2E state |
| Architecture policy boundaries | PASS | `tests/scripts/current-profile-architecture.test.ts`, the retirement scanner, and the narrow admin role projection |
| Retained legacy implementation paths unchanged | PASS | `changedRetainedLegacyProfilePaths()` against the supplied base commit |

## Repository caller scan

The executable scan covers tracked production TypeScript/JavaScript sources in
`app`, `components`, `hooks`, `lib`, and Supabase functions. It checks every
retained legacy route, legacy `ProfilesDB` read/write method, legacy user-facing
RPC, the compatibility helper, and broad `profiles.select("*")` reads. Route
definitions and the retained compatibility implementation are explicit adapter
exceptions; they are not callers to be retired.

Run:

```bash
node scripts/ci/legacy-profile-retirement-gates.mjs
```

The current output is:

```json
{
  "callers": []
}
```

The retained compatibility helper has no production import or invocation. The
server role check in `lib/auth/admin.ts` was narrowed to `select("role")` so a
hidden broad Profile read cannot satisfy this gate.

## Telemetry contract

Legacy route telemetry is structured with only these application context fields:

```text
route, domain, revision, errorCode, correlationId
```

`route` and `domain` are restricted to the two retained legacy routes and their
matching domains. `revision` is a non-negative safe integer when present,
`errorCode` is from the approved legacy error-code set, and `correlationId` is
an internal UUID v4. Identity Email, raw Preferences, intents, quiet-window
values, user/profile identifiers, request bodies, and error messages are not
accepted telemetry fields.

The evidence validator accepts daily aggregate records only when all fourteen
days are complete, consecutive UTC calendar days and every
`legacyRouteCount` is exactly zero. It never requires or stores raw request
payloads.

## Production observation record

Observation source: Vercel Runtime Logs for project `betterr-me`, production
environment.

Requested rolling query window: `2026-07-18T13:40:07Z` through
`2026-08-01T13:40:07Z`. The required complete-day evidence window is the UTC
calendar interval `2026-07-18T00:00:00Z` through `2026-08-01T00:00:00Z`.

Query: `query="[legacy] deprecated route"`, `since=14d`,
`until=now`, `environment=production`.

Result: the connected Vercel runtime-log surface reported that the requested
window exceeds the project's retention period, so it cannot prove fourteen
days of zero traffic. A separate 24-hour query found no matching legacy log;
that recent result is useful diagnostic evidence but is not substituted for the
required fourteen-day window.

Therefore the fourteen-day gate is deliberately recorded as **NOT VERIFIED**.
The ticket must not claim that legacy Profile retirement is safe until a
durable production telemetry export or an observability source with at least
the full fourteen-day retention produces fourteen complete daily zero-count
records. The requested window and this limitation are also recorded in the
comment on #674 before the pull request is opened.

## Focused verification

The test setup disables legacy client paths while direct compatibility route
tests continue to exercise the retained server adapters:

```bash
pnpm exec vitest run \
  tests/scripts/legacy-profile-retirement-gates.test.ts \
  tests/scripts/current-profile-architecture.test.ts \
  tests/lib/current-profile.test.ts \
  tests/app/api/current-profile/route.test.ts \
  tests/app/dashboard/settings/page.test.tsx \
  tests/lib/preferences/owners.test.ts \
  tests/lib/preferences/commands.test.ts \
  tests/lib/preferences/push-quiet-window.test.ts \
  tests/lib/profile-preference-cache.test.ts \
  tests/lib/hooks/use-current-profile.test.ts \
  tests/lib/hooks/use-profile-theme.test.tsx \
  tests/lib/db/current-profile-projection.test.ts \
  tests/lib/db/notifications.test.ts \
  tests/app/api/preferences/commands.test.ts \
  tests/components/settings/settings-content.test.tsx \
  tests/components/settings/profile-form.test.tsx \
  tests/components/settings/notification-settings.test.tsx \
  tests/components/settings/quiet-hours-settings.test.tsx
```

The primary authenticated browser journey is:

```bash
pnpm exec playwright test e2e/current-profile-preferences.spec.ts --project=chromium
```

It is stateful and intentionally skips production-backed read-only targets. Its
request guards fail the test if either retained legacy client path is requested.

## Retained implementation check

The verification change must not edit the retained legacy paths:

```bash
git diff --name-only 4da4ba73416117acc0e2a0ecfa0b7be962cad073 -- \
  app/api/profile/route.ts \
  app/api/profile/preferences/route.ts \
  lib/db/profiles.ts \
  lib/submit-profile-preference-intent.ts \
  lib/validations/profile.ts \
  lib/types/database.ts
```

The command is expected to produce no output for this ticket. No parent issue
body or acceptance state is edited by the repository change.
