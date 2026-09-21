# Phase B: multi-day planning

Source of truth: [Assistant Orchestrator + Memory v1](https://github.com/xtan9/betterr_me_mobile/blob/main/docs/assistant-orchestrator-memory-v1.md), sections 6, 10, 15 and 17. Phase A remains compatible; Phase C is excluded.

The Assistant keeps discovery and provisional prose. Once a versioned planning session has confirmed dates, the conversation offers **Preview calendar plan**. This reads the owner's saved facts/readiness/assumptions, loads coverage for every civil day, and generates one dated preview. Unknown dates remain a prose draft. Unknown travel is never invented. The existing one-day manual control remains available.

One envelope contains all dated events and any task changes. Acceptance and Undo use the existing single database transaction, planner revision, fingerprint, expiry, idempotency receipts, protected/recurring identity checks and recovery snapshots. There is no loop of independent day accepts. A late invalid task rolls back earlier days. A changed planning session invalidates its pending preview.

The inherited horizon bound is 90 days between start and end, inclusive. A proposal is bounded to 200 events overall and 20 per civil day, with the existing ten capture items and 128 KiB stored-body bound. Overflow fails closed. Dated previews do not introduce unbounded new routines or automatically rewrite daily priorities; existing routines remain occupancy, and the manual one-day routine flow remains intact. Calendar gaps are explicitly not confirmed availability.

Regression evidence:

- `tests/lib/ai/horizon-planning.test.ts`: dated weekdays/weekends, family time left open, spring DST gaps, later fall fold, later-day recurring overlap, out-of-range dates and unknown travel.
- `tests/app/api/mobile-planning/route.test.ts`: whole-horizon context/coverage, one coherent generation/envelope, later-day conflict with no stored preview, owner-private/stale sessions, server-owned facts bound to session version; original one-day regressions retained.
- `supabase/tests/assistant_multiday_planning.sql`: exact preview without mutation, request fingerprint replay/mismatch, two-user isolation, atomic multi-day accept and replay, Undo/replay, late-day rollback with no receipt, outside-horizon rejection. Registered in SQL acceptance CI.
- Mobile `GuidedPlanningControl.test.tsx`: inline session preview, exact dated changes, explicit single accept, whole-plan Undo. `AssistantScreen.test.tsx`: restored conversation offers preview without generating or mutating anything automatically.

Review fixes preserve confirmed travel, keep accepted-plan Undo and uncertain commands reachable across conversations/reopening, restore a fresh planning-session version after Undo, and hydrate current owner-private session state rather than an obsolete turn snapshot. Regression tests cover each case, including history hydration before previewing again. The manual planner retains its owner-local default date at UTC midnight.

Validation: the backend full suite passed 5,900 tests (two opt-in integration tests skipped), with typecheck and changed-file lint passing. Six SQL acceptance fixtures passed against an isolated schema-only database, including capture, guided planning, confirmed bookings, Assistant memory lifecycle/ownership and multi-day planning. Both independent spec and standards reviews cleared their findings. Mobile full-suite results are recorded in the companion PR.

Live-model multi-day quality and signed-in physical-device verification remain release checks; automated fixtures are not a production sign-off. No production migration or release was performed. Phase C automatic availability, notifications and execution actions are not implemented.
