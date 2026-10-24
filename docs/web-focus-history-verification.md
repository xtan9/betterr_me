# Web Focus history verification

Implements mobile [T7 #405](https://github.com/xtan9/betterr_me_mobile/issues/405): authenticated read-only Web inspection of shared Focus and app-limit history.

## Behavior and boundaries

`/focus` uses the existing SidebarShell and verified-cookie page authentication. The sidebar has a Focus entry. Completed sessions and app-limit changes read the existing cookie APIs; the bearer APIs and portable v1 payloads are unchanged. English, simplified Chinese and traditional Chinese messages are included.

Histories are grouped by source journal and, for app limits, by rule. The UI uses recorded device labels, platform names and readable history/limit numbers; internal source, event and rule IDs remain only in grouping and API requests. Numbers follow first receipt order within each view and remain stable as pages append, including for same-label devices and unnamed limits. Source sequence orders changes even when device clocks disagree. The page shows actual before/after values, reasons, source observation time, cloud receipt time and the last Web read time. Baselines explicitly do not establish earlier reset causes. Streak values are never summed. A partial page says “latest loaded”; a complete read says “latest confirmed.” Known sequence gaps remain explicit. The browser cannot know unuploaded device changes and never claims that every device is synchronized.

Pagination is independent for each tab. Identity deduplication and generation fencing prevent repeated pages and stale account responses from inserting duplicate or foreign records. A failed refresh retains confirmed rows. Refresh revisits the most recently requested receipt page, preserving earlier immutable pages while catching new arrivals. Signout, a different owner or a 401 removes both history views. No offline storage, enforcement controls, restoration writes, authorization tokens or grants are added.

Created/resumed rule changes can resolve their continued origin using only the history source/event IDs and the existing cookie continuation endpoint. A missing ordinary-event receipt is distinct from an unavailable capability. The recorded receipt is checked against the selected event/source/rule before display. The source's recorded label and date appear with the same readable history/limit numbers as the loaded rows. If that source has not been loaded, the page says so and uses its recorded label/platform/date without inventing a number. Later source changes remain independent.

## Automated evidence

The public React page tests use real UI components and translations, with HTTP and Auth as the external boundaries. Each behavior was introduced through a failing public test, followed by the production slice. Eight cases cover device grouping, paged retry/deduplication, old-account response fencing, signout, source-sequence ordering under clock skew, independent/unlabeled rules, sequence gaps, lineage retry, ordinary event lineage absence, empty/unavailable and expired-session behavior. The readable-name follow-up checks that same-label histories and separate unnamed limits remain distinguishable, that their numbers survive pagination, and that visible and accessibility markup contain no internal UUIDs. Lineage also reuses the source's readable numbers when its page is loaded later.

The complete Vitest run passed 498 files / 6,203 tests; 6 pre-existing environment-gated files / 21 tests were skipped. No required T7 case is skipped. Sidebar and locale parity tests pass.

After the real Tasks UI compiled its existing routes, Next's generated route check exposed a pre-existing optional `GET(request = ...)` signature in `app/api/categories/route.ts`. A separate integration repair makes its Request argument required, matching the Request Next already supplies. No test caller omitted the argument. TypeScript now passes with the actual generated output retained, scoped ESLint passes, and the follow-up auth/route classification/write-inventory/Focus UI run passes 61 tests. No generated checks were deleted or excluded, and no category runtime policy was changed.

## Guarded real Web journey

Run with the pinned Supabase CLI and an absolute psql path:

```sh
SUPABASE_CLI=/absolute/path/to/supabase \
PSQL_BIN=/absolute/path/to/psql \
node scripts/e2e/run-focus-history.mjs --web
```

The runner requires the disposable local Auth/API at `127.0.0.1:54321` and database at `127.0.0.1:54322/postgres`. It starts only its own Next child on a dynamically selected loopback port, rejecting 8082. The child receives only local public Supabase configuration. No hosted environment files or credentials are copied. Chrome must be installed for the real browser journey.

The journey creates fresh ephemeral users and writes native-shaped Focus/app-limit history through bearer routes. Real Supabase cookie sessions open the actual Web page. It covers 52-session pagination, failures/retry, source reset versus independent continued destination, clean-client lineage, unnamed rules, a 390px viewport, account switching, and existing task create/edit/readback plus unchanged legacy Web messages. Native Assistant history is checked separately so Web chat is not silently migrated. No AI provider call is needed.

All sessions/users and their test rows are removed in `finally`; cleanup verifies zero remaining Auth/profile/history/continuation/task/conversation/message residue. Only the runner-owned server/browser are stopped. Browser screenshots use only disposable test data under `.artifacts/web-focus-history/`; server diagnostics stay in ignored `.artifacts/focus-history-server.log`.

### Legacy local bootstrap prerequisite

The clean migration ledger does not recreate the ambient Supabase privileges on four legacy Web tables. The existing full-CI bootstrap, [`supabase/tests/e2e_local_authenticated_grants.sql`](../supabase/tests/e2e_local_authenticated_grants.sql), is run by `.github/workflows/e2e.yml` against its disposable local database. It covers planner and other legacy domains, but does not include `conversations` or `chat_messages`. It had not been applied for the initial T7 compatibility run, which failed with PostgreSQL 42501 on `public.tasks`; the cookie profile read also lacked permission. This predates T7. Read-only inspection of the existing hosted configuration confirmed authenticated SELECT/INSERT/UPDATE/DELETE with RLS enabled on `profiles`, `tasks`, `conversations` and `chat_messages`.

For this acceptance environment, the coordinating task applied only those four existing-equivalent grants to the guarded local database after asserting all four tables have RLS enabled. No hosted grants, policies, data, migration or other public tables were changed. The maintained `--web` runner checks both these exact table privileges and RLS before creating fixtures, and fails with an actionable prerequisite message. It never grants privileges automatically. After another clean reset, the environment owner must repeat this narrow local bootstrap; do not broaden grants across the public schema or disable RLS to make a test pass.

The readable-name rerun passed the task create/edit/readback checks, but its server log still reported the separate `categories` endpoint's missing local privilege. That table belongs to the existing full-CI bootstrap above. T7's compatibility check establishes the exercised task and chat operations, not that every planner endpoint is error-free; the coordinating task owns the broader CI bootstrap and journey.

## Delivery status

The guarded real Web journey passed all nine acceptance groups, including the preceding T1/T2/T3 native bearer and cookie HTTP journeys. The actual Chrome UI passed 52-session paging, retained-error/retry, independent device/rule streaks, clock skew, continuation lineage after local receipt loss, 390px layout, owner switching and existing planner/legacy-chat compatibility. Screenshots were visually inspected; no runtime page errors were reported. Cleanup confirmed zero test residue and stopped the owned browser and Next child. Evidence is `.artifacts/web-focus-history/acceptance.log`, `sessions.png`, `app-limits.png`, and `narrow.png`.

The first browser assertion encountered both the history alert and Next's global route announcer. Scoping the assertion to the visible history error fixed the test; no product behavior was changed for that selector issue.

Final Spec review identified raw database IDs in the original product copy. The follow-up replaces them with the readable names described above, preserving IDs only internally. Its fresh full suite passed 499 files / 6,210 tests, with the same 6 environment-gated files / 21 tests skipped. Generated Next typechecking and scoped ESLint passed. The expanded real Web journey passed all nine groups again, including same-label devices, two unnamed rules, ID-free accessibility markup and continued-source naming; all three updated screenshots were inspected and cleanup confirmed zero fixture residue. `.artifacts/web-focus-history/acceptance.log` contains this latest run.

The coordinating task owns the final review recheck. No hosted deployment is claimed. T7 adds no native enforcement behavior; mobile persistence/native acceptance is tracked by the separate T1/T2/T3 slices.
