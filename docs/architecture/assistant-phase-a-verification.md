# Phase A verification — 2026-09-20

Source of truth: [Assistant Orchestrator + Memory v1](https://github.com/xtan9/betterr_me_mobile/blob/main/docs/assistant-orchestrator-memory-v1.md). Reviewed backend `3a996d3a` and mobile `a6b0e79`, including subsequent draft-continuity/history-recovery fixes. This verification does not implement Phase B.

## Gaps found and fixed

1. Temporary memory had a hardcoded seven-day lifetime and superseded the durable routine permanently. The additive migration retains one durable baseline and one temporary exception per owner/key. A bounded duration candidate is converted to effective timestamps by the server. One month uses a calendar month, not an invented seven-day expiry. Expired exceptions are excluded and the durable baseline resumes; current-state memory cannot be stored as durable. Existing previously superseded rows are not automatically reactivated.
2. Durable memories could crowd all current constraints out of the bounded context. Active temporary constraints now rank first; an effective temporary exception masks its matching durable baseline. Future and expired entries are excluded without changing their historical records.
3. A literal skip still failed when the model omitted its prose draft. The server now builds a provisional outline from confirmed constraints and explicit unknowns in that case. It does not invent dates, travel, deadlines or calendar reservations. Existing draft continuity and explicit reopening behavior remain covered.
4. Narrow plans received generic sleep/caregiving questions even when the candidate identified a different material question. Rendering now honors questions attached to missing material dimensions, with the existing maximum of three and readiness-based fallback.
5. Internal-language checks missed questions/assumptions and bare “endpoint.” Unfinished streamed phrases could bypass final validation. All composed reply text is checked; partial text holds unfinished sentences. Planning text waits for readiness/calendar validation and next-action text waits for the existing recommendation engine.
6. Mobile still called sending a message “Preview changes,” and omitted calendar context from its disclosure. The companion mobile PR uses conversational send copy in English/Chinese and discloses calendar context. Accept/reject copy and behavior remain unchanged.

## Design and acceptance audit

| Design clause / acceptance criterion | Implementation and evidence | Status |
| --- | --- | --- |
| §§3.1, 4, 10, 14.1–2: one assistant, typed routing, no internal language | Main route retains conversation/capture/planning/next_action/clarification. Route tests cover capture/project edits, ordinary streaming, planning, recommendation-engine invocation and sanitized text/errors. | Automated pass |
| §§3.2, 5, 14.3–5: structured readiness, horizon, ≤3 relevant questions | Civil-date/timezone/range validation; golden missing dates/sleep/pickup; known facts retained; irrelevant narrow-plan questions avoided. | Automated pass; live recognition pending |
| §§3.3, 6, 13 skip, 14.6 | Literal skip produces a prose draft with explicit unknowns even if the model omits draft prose; no task/calendar items. Confirmed-date correction/reopening tests retained. | Automated pass; live prose quality pending |
| §§3.5, 12–13: family boundary, calls stay tasks, decision friction | Golden assertions check reflection of family time, calls/admin as tasks and one clear next action. No model scheduling/apply capability added. | Fixture/contract pass; live semantics pending |
| §§7.1, 7.4–7.6, 13 memory, 14.7 | Real database route flow creates memories in A, supplies them in B, applies temporary correction, selects it in C and retains durable baseline. Selector covers before/during/after validity and crowded contexts. Inference labels retained. | Automated pass |
| §§7.2–7.3, 14.8–9, 14.13 | Two-user SQL lifecycle verifies both directions for conversations/messages/memories/sessions, foreign RPC denial and rollback. History endpoint owner filters/auth tests; JSON and stream errors/logs exclude synthetic private provider details. | Automated pass |
| §8: server-authoritative conversation history | Route integration persists and restores history; existing forged-history, replay, pagination and mobile stopped/retry recovery tests retained. | Automated pass |
| §§3.6, 10 capture/planning, 14.10 | Original preview validator and accept/Undo implementations unchanged. Existing SQL fixtures verify capture, guided planning, confirmed bookings, completion, Stop, Undo, conflicts and atomic rollback. New fixture asserts no task/calendar mutation before accept. Conversation/memory persistence is the specified exception to task/calendar preview requirements. | Automated pass |
| §§9, 11, 14.11 | Native questions/quick replies remain inside Assistant; manual Guided Planning and Next Action controls preserved; mobile golden flow performs no accept RPC for discovery/prose drafts. | Automated pass; physical device smoke pending |
| §13 / 14.12: complete golden scenario | Unit, route, real database persistence and native component flows covered. Opt-in live model evaluation added; no gateway credential configured in the verification environment. | Not yet live-verified |
| §§15–17: phase boundary, compatibility, safety | New migration preserves owner grants, existing rows and RPC signatures. Optional validFor defaults retain compatibility with older callers. No arbitrary SQL/model tools, no changes to apply validators. | Reviewed |

These automated results do not establish live-model or physical-device production readiness. No production data or deployment was changed. Memory is owner-private plaintext, not end-to-end encrypted; infrastructure encryption/access controls are deployment responsibilities.

## Exact regression coverage

- `tests/lib/ai/assistant-orchestrator.test.ts`: temporary interval validation, baseline override/resumption, current-state capacity, skip without model draft, relevant narrow-plan questions, every rendered internal-language surface; existing golden/horizon/correction tests retained.
- `tests/app/api/mobile-assistant/route.test.ts`: chunk-split internal-language rejection, withheld premature planning, private provider errors/logs, existing next-action engine with confirmed interval, JSON/stream skip with missing readiness and draft.
- `tests/app/api/mobile-assistant/persistence.integration.test.ts`: real PostgREST/PostgreSQL A→B→correction→C flow, owner-private history/memory/session reads and zero task/calendar changes. Only provider and token-verifier boundaries are stubbed; JWT role claims still drive real RLS/RPC ownership.
- `supabase/tests/assistant_memory_lifecycle.sql`: durable preferences across conversations, one-month override, preserved baseline, replay, invalid-duration/current-state rejection, late-invalid-update atomic rollback, two-user isolation. Registered in normal SQL acceptance CI with full before/after schema/data residue checks.
- `tests/lib/ai/assistant-phase-a.live.test.ts`: opt-in real-model golden discovery and skip, synthetic data only; excluded by an explicit skip unless `PHASE_A_LIVE=1`.
- Companion mobile `src/components/AssistantScreen.test.tsx`: exact design golden prompt, ≤3 displayed questions, skip quick reply in same conversation, new conversation, no premature accept/apply, natural copy; existing recovery/preview/stream tests retained.

## Reproduction

Normal verification: `pnpm test:run`, `pnpm typecheck`, `pnpm lint`; mobile: `pnpm exec jest --runInBand`, `pnpm typecheck`, `pnpm lint`. Registered SQL checks use `bash scripts/ci/run-sql-fixtures.sh` on the disposable CI database.

The optional route persistence test expects a disposable PostgREST server at exactly `http://127.0.0.1:55443`, with the repository migrations and SQL fixture bootstrap applied. Seed test profile IDs `61600000-0000-0000-0000-000000000001` and `61600000-0000-0000-0000-000000000002` using `sql_fixture_create_auth_user`; no tasks/events for these owners. Configure its JWT secret to `phase-a-disposable-verification-only-secret` (test-only). Set `ASSISTANT_TEST_REST_URL` to that loopback URL, then run `pnpm exec vitest run tests/app/api/mobile-assistant/persistence.integration.test.ts`. Use a fresh disposable database per run. Never point it at production.

For live model verification, configure `LLM_API_KEY` (and the existing gateway URL if needed) in the process environment without printing it, set `PHASE_A_LIVE=1`, then run `pnpm exec vitest run tests/lib/ai/assistant-phase-a.live.test.ts`. An explicit live run fails when the credential is missing rather than claiming a pass. Repeat the golden prompt and correction flow on a signed-in device after deploying the migration/backend; verify exact preview and accept/Undo separately using disposable test data.

## Live follow-up — 2026-09-20

Production commit `56877562` and its migration deployed successfully. Deployed synthetic-account verification then found two gaps that the isolated route tests did not expose:

- The cookie-session proxy omitted `/api/mobile/assistant/history`. Both GET and browser preflight were redirected to web login, so the mobile Assistant could not finish loading. The exact history path now delegates authentication to its existing bearer-authenticated handler. Unrelated paths remain cookie-protected. Regression coverage: `tests/lib/supabase/native-proxy.test.ts` and `e2e/native-assistant-history.spec.ts`, alongside existing unauthorized/foreign-owner history tests.
- Successful live golden replies asked dates, sleep and pickup, and reflected family time, but omitted decision-friction acknowledgment. The planning instructions now explicitly reflect a stated need for a clear next action alongside family and calls-as-tasks constraints. The real-model golden assertions remain in place.

The deployed model also intermittently returned `AI_NoObjectGeneratedError`, including on skip. This is not a verified pass. Safe diagnostics now allowlist finish reason, numeric output-token count and validation-error category without exposing generated text or prompts; `tests/lib/ai/safe-failure.test.ts` verifies disclosure boundaries.

`PHASE_A_DEPLOYED_LIVE=1 node scripts/verify-phase-a-live.mjs` is an explicit production synthetic-account probe. Supply the configured public Supabase URL/key and server-only service key securely in the process environment. It creates only new disposable accounts, invokes the actual deployed Assistant/model, checks history, golden discovery, skip, cross-conversation memory, a one-month override and two-owner isolation, never accepts proposals, then revokes sessions and deletes its accounts. It prints only this synthetic test's replies/results. Do not treat an incomplete or failed run as acceptance evidence. Local model-only evaluation additionally needs usable model credentials; Vercel's exported model values were redacted in this environment.

Physical-iPhone verification remains pending. The browser preview reproduced the history failure with a synthetic signed-in account; browser verification does not replace device verification.

## Phase boundary

Phase B: horizon-wide occupancy generation, coherent dated multi-day calendar scheduling, exact multi-day preview/atomic apply, protected/recurring/overlap/DST multi-day validation. Phase A supplies discovery and provisional prose only. Phase C: automatically derived free windows, proactive notifications, Start/Later/Something else. Encryption, embeddings and conversation summarization remain the documented non-goals.
