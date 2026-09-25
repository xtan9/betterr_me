# Phase C: proactive execution

Status: implemented; automated verification complete, native device delivery pending. Notification policy confirmed in conversation: disabled by default, at most three reminders per day, at least two hours apart, within user-selected hours; Later suspends reminders until the selected time and no suitable next action means no notification. Runtime implementation is under verification; device delivery remains a separate gate.

Source of truth: mobile `docs/assistant-orchestrator-memory-v1.md`, sections 10, 11 and 15. Phase C is authorized. This addendum records implementation boundaries that the original five-point phase outline does not specify.

## Preserve the current product

Refreshed baseline: backend `a6adac28` and mobile `e41611c`, fetched and synchronized with remote main on 2026-09-24. Both dedicated Phase C branches were fast-forwarded without rewriting history or changing unrelated worktrees. Never restore the Phase B checkout over current main.

Backend #1043 keeps follow-up questions in a lightweight conversation. Mobile changes since Phase B include text suggestions sent into the active conversation, compact conversational calendar previews, hiding saved previews during unfinished replies, revised history transitions, neutral/accent themes, bubble styling, native menus and Expo SDK updates. These behaviors are regression requirements, not refactoring opportunities.

Manual Next Action remains available. Existing saved-priority/queue order, task fit, recurring coverage, protected occupancy, civil-time validation, owner isolation, AI consent, exact preview, explicit accept, atomic apply, idempotency and Undo must remain intact.

## Execution behavior

1. Derive a candidate current window from server time and fresh owner calendar/routine context. A calendar gap is not proof of personal availability. Display the derived bounds and ask the user to confirm availability without manually entering dates or times. Incomplete recurring coverage must fail safely with the existing manual recovery path.
2. Reuse the existing grounded recommendation selector. Current priorities and explicit task rules outrank inferred preferences. Refresh selection before an execution action; reject stale task/context versions.
3. Start semantics: record an explicit execution start only, without reserving calendar time, marking completion or editing task estimates. Existing calendar-backed work-session history must not be overwritten or conflated with this new interaction.
4. Later semantics: ask for a deferral time and suppress the recommendation until then, with an explicit reviewable change and retry-safe identity. Something else excludes the selected task for the current recommendation round, without silently reordering the saved queue.
5. Execution history may explain or inform recommendations but must never become confirmed durable memory automatically. Explicit corrections and saved priorities win. Lack of action is not evidence of completion or a clinical inference.

## Confirmed notification policy

Disabled by default; explicit opt-in and user-selected reminder hours; at most three generic reminders per day with at least two hours between reminders. Later suspends reminders until the selected time. Do not send when there is no suitable next action. The notification contains no task titles, conversation text or memory content. Opening it enters the same Assistant flow and refreshes availability; delivery does not start work or mutate the plan. Permission denial, logout and disabling reminders must retain normal manual behavior.

The earlier once-per-day proposal is superseded by the subsequent conversation. Frequency can be adjusted later; do not implement the stale limit.

The pre-Phase-C native dependencies did not include a notification SDK. Existing backend delivery is Web Push, which is not evidence of native iOS delivery support. Device-delivery verification and any native dependency/build changes must be stated separately.

## Verification plan

Use the existing authenticated route, native repository/UI, and owner-scoped database command seams used in Phase A/B verification. Begin with current Assistant, planning, conversation history and Next Action regressions to preserve the new baseline.

Add coverage for current-window boundaries, occupied-now, unknown availability, incomplete recurring coverage, timezone/DST/midnight, stale context, task fit, unavailable AI, two-user isolation, action retries and explicit memory precedence. Native tests must cover continuing the current conversation, no duplicate panels, unfinished-response preview hiding, Start/Later/Something else, and preserved manual operation. Notification tests depend on the owner-selected policy.

Run typechecking during implementation and full backend/mobile suites before review. Perform independent standards/spec reviews, then publish PRs. Do not describe push delivery or physical-device behavior as verified unless actually exercised.

## September 24 regression baseline

- Backend #1044 and #1047–#1052: concise one-step replies, at most one necessary discovery question, structured assumptions without an automatic prose inventory, supportive advice distinct from saved-task recommendation, stored explicit language choice surviving translated suggestions, settled-decision acknowledgement and a terminal decline, empty-task rest/small-action choices, and bounded planning without unrelated whole-day questions.
- Cancellation and capture replacement are versioned operations in the existing atomic assistant-turn transaction. Preserve cancelled-session history, immutable retries, superseding the exact pending capture preview, and the same-conversation owner predicates. Never replace these updated SQL functions with a Phase B definition.
- Mobile #138, #142 and #146: Chinese/English planning recovery tests, history-authoritative conversation ownership, no foreign conversation preview, cancelled draft hiding while preserving uncertain commands/Undo, composer available during capture preview, clarification preserving the proposal, replacement failure preserving both command identity and the user edit.
- Mobile #139–#147 and the latest copy/selection change: SwiftUI sheet dismissal/locking and nested behavior, native grouped task/project/calendar editors, native task/language menus, theme controls and selectable chat text. Reuse current platform components; do not introduce the old custom iOS sheet or restore older AssistantScreen markup.
- Phase C must activate only for genuine task-selection intent or explicit notification entry. A generic next-step chip following supportive advice must remain supportive conversation; rest/decline must not trigger a new questionnaire or notification immediately.

Refreshed baseline verification: backend Assistant/history/Next Action/planning suites passed 194 tests across seven files; two opt-in database integration tests were skipped (not configured in this run). Full mobile Jest passed 423 tests across 65 suites. Backend and mobile TypeScript checks passed. No runtime code was changed. These checks establish the starting point, not proof of future Phase C implementation, live model behavior, SQL migration execution or real-device delivery.


## Implementation boundary

The derived candidate looks at up to the next 60 elapsed minutes and is cut at the first occupied instant. The UI explicitly labels this bound and asks for confirmation. Existing 15/30/60-minute conversation suggestions are unchanged. The standalone manual Next Action endpoint is unchanged except for an optional selector exclusion input used internally by execution.

Execution feedback uses a separate owner-private table and versioned, idempotent command. Start suppresses repetition for the estimated interval; it is not a completion record or confirmed memory. Later also sets a global reminder snooze. Existing priority order remains authoritative. No task, calendar, planner or durable memory write is introduced by recommendation or execution feedback.

Reminder claims are serialized per owner, respect selected local hours and existing push quiet hours, and consume quota even on uncertain transport failure to prevent duplicate sends. Delivery targets must have a live auth session. The dispatcher reuses existing grounded eligibility and fails closed on missing recurrence/history/quiet-hour context. Service-only read/claim functions are unavailable to authenticated clients. Its generated notification text contains no task or conversation content.

Native delivery requires configured EAS project/platform push credentials and a rebuilt app. Unit tests, SQL fixtures and transport acceptance cannot substitute for physical-device delivery verification. New tables and functions are additive; no previous assistant-turn/planner SQL function is replaced.

## Verification results

- Backend full Vitest: 6,008 passed, 16 opt-in/environment skips. An additional DST-fold/local-midnight regression and the focused execution/SQL-policy suite passed (50 tests). TypeScript and changed-file ESLint passed.
- The additive migration and constrained two-owner fixture ran against an isolated local database. Service-only snapshot, revoked/nonexistent session filtering, snooze, duplicate claim and daily cap assertions passed separately. This is not a production migration or physical-device test.
- Independent standards/spec reviews identified notification entry reuse, recovery-read retry, pre-opt-in snooze and dispatcher fairness gaps; these were fixed with failing-then-passing regression coverage.
- Dispatch checks at most 100 candidates per run, oldest checked first. Progress is stored before slow work so time-budget expiry or repeated failures cannot indefinitely starve later users. Large opt-in populations may require higher dispatch throughput; the per-owner notification cap remains unchanged.
- Native integration is being rebased by merge onto mobile main `40786e1`, preserving the new message context menu, header spacing, project return and iOS form-row fixes. Device push remains gated on EAS/platform credentials and a rebuilt app.

## September 25 ABC browser smoke follow-up

Production A/B was exercised from the mobile web build using the previously authorized main account. The test messages were explicitly fictional and prohibited saving their facts as personal memories. Production discovery reflected family boundaries, calls-as-tasks and decision friction, then asked the date range. Skip produced a provisional draft without task/calendar mutation. The initial draft incorrectly put breakfast before an 08:30 school trip despite an 18:6 window ending at 16:00; an explicit correction restored the 10:00 anchor. A narrow system instruction and opt-in model regression now cover that ordering, but the new instruction is not yet deployed/live-verified.

The specified September 28–October 11 draft exposed Preview calendar plan, but preview generation was still pending at the last browser observation. Browser automation was then blocked by an open Chrome extension UI; no exact-preview acceptance, rejection or Undo was performed in this run. This observation is not full A/B sign-off.

A cross-layer C defect was reproduced: the cookie proxy redirected native execution, reminder settings and the cron dispatcher before their own authentication could run. Six new proxy tests failed before the exact-path fix and passed afterward; similarly named paths remain cookie-protected. An end-to-end API regression covers preflight, missing bearer and cron authorization through the deployed routing layer.

A separate local Supabase stack applied the full migration chain. Real HTTP checks passed for 204 preflight, 401 missing bearer, authenticated 60-minute candidate/confirmation, recommendation, round-only exclusions, Start, identical retry, active-history suppression and Later. Task versions/completion and calendar rows remained unchanged. A second authenticated account could not read the first account's execution feedback or conversation. These are API integration results with seeded synthetic dialogue/tasks, not a live-model or native-notification claim. No production schema changes or test task/calendar mutations were made.

Outstanding: resume browser smoke after dismissing the Chrome extension UI, inspect the two-week preview result, verify capture/reject and remembered preferences, run C's browser controls against the isolated API, and validate physical-device push separately. Mobile integration now includes main 40e5dac (#155–#164).
