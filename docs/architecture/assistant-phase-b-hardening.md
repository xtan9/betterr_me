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

- `tests/lib/ai/horizon-planning.test.ts`: authored golden fortnight, proposed overlap/protected target, wrong travel/duplicate recurring occupancy/new routine refusal, two estimate cases, captured-task fit, edited-task estimate fit, cross-timezone occupancy. Existing boundary/DST tests retained.
- `tests/lib/ai/assistant-orchestrator.test.ts`: period-aware temporary selection, baseline return/expiry, inference precedence, internal `planner engine` guard.
- `tests/app/api/mobile-assistant/route.test.ts`: reselect preferences after resolving future dates with an empty calendar.
- `tests/app/api/mobile-assistant/persistence.integration.test.ts`: real DB multi-day preview/accept/retry/Undo/ownership and session change during generation.
- `supabase/tests/assistant_multiday_conflicts.sql`: calendar/task/priority/timezone changes during preview and before accept. Registered in CI.
- `tests/lib/ai/horizon-planning.live.test.ts`: three opt-in synthetic model evaluations: golden quality, unknown times/assumptions, durable preferences plus temporary gym correction. Uses the production prompt/schema/validator; never applies changes.
- Mobile `GuidedPlanningControl.test.tsx`: revised/withdrawn/rejected/conflicting proposals and end-of-horizon coverage recovery; `AssistantScreen.test.tsx` retains recovery coverage with versioned local state.

Run live tests with `PHASE_B_LIVE=1` and usable `LLM_API_KEY` (optional `LLM_BASE_URL`), using the normal Vitest command. The configured Vercel export returned redacted values and environment injection did not provide a usable key; no successful live-model call is claimed. Full-suite and review results are recorded in the PRs.

Local verification: backend full suite 5,913 passed / 6 opt-in skipped; the subsequent estimate-edit test also passed in the 16-test focused suite. Mobile 300 tests passed across 49 suites. Both typechecks and changed-file lint passed. The two route/PostgREST integration tests passed separately against an isolated database, as did all seven SQL fixtures named above or covering guided planning, capture, confirmed bookings and memory lifecycle. Standards review found no actionable issue; spec review identified an overly permissive live open-space assertion, corrected to measure the 06:00–22:00 waking interval and require two free hours, with explicit sleep, meal, dog-walk, school and gym boundary checks. Live execution remains pending.

## Still required before Phase C

### Follow-up: explicitly unnecessary travel

Authenticated production browser tests passed cross-conversation durable preference reuse, a temporary four-day gym override, and restoration of the six-day baseline for a horizon after expiry. A minimal two-reservation fortnight also passed exact preview, recurrence-coverage recovery, and reject-without-apply. These do not replace full golden-plan quality evaluation.

The same small at-home scenario with "No travel is needed" failed repeatedly at `planning.travelMinutes` with a nonpositive-duration validation error. The generation contract now explicitly describes no travel as `null`, never zero, both in the field's schema description and system instructions. The positive-duration validator is unchanged. A regression verifies that null clears a previous duration, while zero, negative and oversized values still fail; an opt-in real-model regression covers the original no-travel prompt. Production re-verification remains required.

A later golden-preview attempt reached domain validation on its first generation but failed the existing duration check. Safe diagnostics now distinguish a nonpositive interval from a travel block that differs from the confirmed per-leg duration, with no private values. Horizon generation instructions explicitly match both existing rules: each travel leg uses the confirmed duration, and an explicitly requested overnight reservation is split at civil midnight. Neither rejected intervals nor incorrect travel durations are normalized into acceptance. Route regressions assert both failure reasons, sanitized errors, and no proposal storage. The exact production duration subtype remains unproven until re-verification.

### Follow-up: model-independent generation contract

Production browser smoke subsequently exposed timeout, overlap and incomplete-horizon failures (fixed in backend #1033–#1037 and mobile #102–#103), followed by a remaining server-side `ZodError`. Full live sign-off is still outstanding.

The per-date provider schema allowed up to 20 events on each of 14 dates (280 total), while the flattened preview contract allowed only 200. A deterministic 201-event fixture reproduced this mismatch. Both schemas now enforce the same 200-event total, before the SDK returns a generated result. There is no truncation or increased acceptance limit. The existing single schema-regeneration allowance can now recover from this specific failure before proposal storage.

`tests/app/api/mobile-planning/generation.test.ts` uses the real AI SDK with a synthetic model transport: an oversized response is rejected and regenerated once, only the valid 200-event replacement is stored, and two oversized responses store nothing. `horizon-planning.test.ts` checks both sides of the 200/201 boundary. `safe-failure.test.ts` covers direct server-side schema errors with allowlisted field paths; private dates, arbitrary keys, messages and values stay omitted. These are implementation regressions, not a model-quality evaluation or proof of the remaining production error's exact cause. No model selection, timeout, SQL mutation, acceptance or Undo behavior changed in this follow-up.

Run the three live model evaluations with configured credentials and signed-in physical-device smoke. The deterministic/DB evidence is not a substitute for either. No claim of complete production sign-off is made.

Intentionally deferred Phase C: derived current availability, automatic Next Action invocation, proactive notifications, Start/Later/Something else actions, and execution-history-informed recommendations. These are absent from this change.
