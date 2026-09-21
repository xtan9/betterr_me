# Phase B hardening evidence

Source: mobile `docs/assistant-orchestrator-memory-v1.md`, especially §§6, 7, 13–15 and 17. This verification does not authorize or implement Phase C.

## Gaps fixed

- A task reservation could reach preview even when its known estimate exceeded the block (or its estimate was unknown), then fail only at accept. Multi-day preview now rejects it using the exact proposed task estimate, including new/edited tasks. The existing atomic accept validator remains unchanged.
- Memory selection used the current instant even for a future horizon, hiding a durable routine past a temporary exception's expiry. Selection now considers the requested interval; a partial-period exception retains its labelled durable baseline. Discovery reselects after resolving new dates, even with an empty calendar. Inference cannot mask an explicit same-key preference.
- `planner engine` was missing from the internal-language guard.
- Mobile retained an old preview after conversational revision or date withdrawal. It now requires a fresh preview, retaining unresolved commands and accepted-plan recovery. An older local preview without version metadata also requires refresh.
- Mobile recurrence-coverage recovery pointed to the day after the first date rather than the whole horizon. It now points to the day after the final date and preserves retry identity.

## Verification matrix

| Behavior | Evidence and boundary |
|---|---|
| Conversational discovery, skip, remembered preferences | Existing Phase A route/native regressions; real PostgreSQL route integration verifies persistence, correction, new conversation and two-user isolation. |
| One coherent two-week preview | `horizon-planning.test.ts` validates an explicitly authored golden fixture spanning all 14 dates; real route/PostgREST integration accepts one 12-event dated plan in one transaction and compares stored event fields to the preview. Provider output is stubbed in the DB test. |
| School days, Friday childcare, Saturday gym, Sunday rest, family/work boundaries | Authored fixture uses protected school/family/sleep occupancy; Friday work is rejected. The opt-in live suite checks generated gym dates, work boundaries, admin semantics and open space. Live quality is **not yet passed**. |
| Meals, dog walking, eating window, cooking, balanced projects, priority video, one-time outdoor work, flexible cleaning | Confirmed constraints are included in the synthetic model fixture; the authored validator fixture keeps calls/cleaning as seven tasks and uses the specified video/outdoor blocks plus balanced project work. Whether the model reliably produces the intended result remains a live evaluation gate. No dietary recommendation is made. |
| Protected/recurring/overlap/travel | Deterministic multi-day tests reject protected edits, recurring occupancy duplication, proposed overlaps and wrong/unknown travel duration. No new recurring series are supported in dated proposals; existing recurrence identities remain unchanged. |
| Task estimates and pending edits | Domain tests reject missing/oversized estimates; SQL fixtures test later-item failure rollback and task changes invalidating an entire pending plan. Partial-task reservations remain outside the existing acceptance contract. |
| Calendar, priority, timezone and session conflicts | `assistant_multiday_conflicts.sql` tests stale accept/store, no mutation/revision change, failed retry and safe rejection; route+real DB test changes the planning session during model generation and receives 409 with no calendar write. |
| Civil time | Existing spring gap/fall fold, final-midnight, 24:00 and all-day tests retained; new test compares cross-timezone protected occupancy across DST by instant. A horizon has one IANA timezone; travel between timezones within a plan is not newly supported. |
| Exact preview, atomicity, retries, Undo | Existing SQL fixture plus real PostgreSQL route integration verify no task/event mutation before accept, exact persisted fields, one atomic plan, retry idempotency, complete Undo and fresh session handle. |
| Memory expiry/correction | Tests cover full-period temporary override, partial-period baseline return, expired vacation exclusion, explicit preference over inference, and re-selection after new dates. Existing SQL memory lifecycle tests verify durable rows survive temporary correction. |
| Mobile revision, reject, recovery, manual fallback | New native tests cover revised/withdrawn dates, conflict/fresh request, reject-only command and horizon coverage recovery. Existing successful/uncertain accept → conversation → reopen → Undo tests remain. Manual planner/task/calendar suites remain required. Physical-device smoke is pending. |
| Privacy/auth | Ownership/RLS integration and SQL regressions retained; errors use existing sanitized failure metadata. Synthetic live test catches provider errors without printing prompt/output. No production user data or schema is changed for this verification. |

## Exact new/strengthened tests

- `tests/lib/ai/horizon-planning.test.ts`: authored golden fortnight, proposed overlap/protected target, wrong travel/duplicate recurring occupancy/new routine refusal, two estimate cases, captured-task fit, cross-timezone occupancy. Existing boundary/DST tests retained.
- `tests/lib/ai/assistant-orchestrator.test.ts`: period-aware temporary selection, baseline return/expiry, inference precedence, internal `planner engine` guard.
- `tests/app/api/mobile-assistant/route.test.ts`: reselect preferences after resolving future dates with an empty calendar.
- `tests/app/api/mobile-assistant/persistence.integration.test.ts`: real DB multi-day preview/accept/retry/Undo/ownership and session change during generation.
- `supabase/tests/assistant_multiday_conflicts.sql`: calendar/task/priority/timezone changes during preview and before accept. Registered in CI.
- `tests/lib/ai/horizon-planning.live.test.ts`: three opt-in synthetic model evaluations: golden quality, unknown times/assumptions, durable preferences plus temporary gym correction. Uses the production prompt/schema/validator; never applies changes.
- Mobile `GuidedPlanningControl.test.tsx`: revised/withdrawn/rejected/conflicting proposals and end-of-horizon coverage recovery; `AssistantScreen.test.tsx` retains recovery coverage with versioned local state.

Run live tests with `PHASE_B_LIVE=1` and usable `LLM_API_KEY` (optional `LLM_BASE_URL`), using the normal Vitest command. The configured Vercel export returned redacted values and environment injection did not provide a usable key; no successful live-model call is claimed. Full-suite and review results are recorded in the PRs.

## Still required before Phase C

Run the three live model evaluations with configured credentials and signed-in physical-device smoke. The deterministic/DB evidence is not a substitute for either. No claim of complete production sign-off is made.

Intentionally deferred Phase C: derived current availability, automatic Next Action invocation, proactive notifications, Start/Later/Something else actions, and execution-history-informed recommendations. These are absent from this change.
