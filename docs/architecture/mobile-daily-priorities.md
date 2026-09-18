# Issue 6: Today and dated priorities

Approved scope: issue #6, ios-mvp-spec.md and CONTEXT.md. Original A: restrained evergreen priority deck, current commitments, upcoming agenda, collapsed history, persistent tabs. Use existing native typography and accessible explicit previous/next controls. No A+ metrics or automatic selection.

Shared schema ownership remains in the web repository. Add daily_priority_state keyed by owner and civil date, containing ordered task references and a UUID version; immutable receipts make retries safe. Preserve all legacy task/calendar fields. No backfill, task copies, automatic rollover or event creation. Missing day means empty/null version. Completed references stay selected. Creating a priority creates its task and dated reference in one transaction.

Authenticated priority_snapshot and priority_command use auth.uid(), exact expected day version, owner-validated task references and immutable operation ID/payload. Serialize per-owner priority commands; reject duplicate IDs and changed retries. Client tables are read-only under owner RLS. Private definer implementation with public invoker wrappers follows existing action-queue architecture. A new day always requires selection; an old retry replays the original day only.

Today uses the existing shared calendar timezone/civil recurrence adapter. Current means start <= now < end. Merge occupied intervals when calculating gaps; all-day commitments occupy their actual interval. Show every current overlap. Timer targets the next event boundary or local midnight; foreground/tab entry refresh server data. Clock passage only changes presentation. A gap never asserts availability.

Seams already approved in the MVP spec: authenticated command/readback with real isolated Auth/PostgREST/PostgreSQL, deterministic time/zone functions, selected native screen interactions and browser smoke. Cover founder 11:50, overlaps, midnight, restart, private reads/references, replay and stale writes. Native export is compilation evidence; hosted-account and physical-iPhone validation remain explicit release gates.

Rollback clients first; retain additive tables and receipts without expiry. Do not deploy to the shared hosted account as part of local checks. Subsequent Stop/Complete/Undo slices will use separate linked commands; issue 6 does not complete tasks or end work.
