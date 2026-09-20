# Assistant orchestration — Phase A

Source of truth: `xtan9/betterr_me_mobile/docs/assistant-orchestrator-memory-v1.md`, section 15, Phase A.

The native Assistant now returns a typed conversational response alongside the existing capture proposal envelope. Planning discovery keeps a civil-date horizon, facts, readiness and assumptions. It asks at most three missing questions; skipping discovery produces a prose draft. This release does not add calendar apply commands. The existing manual planner, capture acceptance, planner revisions and Undo remain authoritative.

`assistant_begin_turn` authenticates ownership, imports legacy history once, appends one user message, and returns bounded persisted model history. `assistant_finish_turn` atomically stores validated memory updates, planning state, the assistant message, and the existing validated capture proposal. Conversation versions reject stale concurrent turns. Request fingerprints and immutable turn responses support retries after provider or network loss. Memory updates cannot overwrite a correction committed after a turn began.

All five new tables use owner SELECT RLS. Direct client writes are revoked. The private RPC implementations use verified `auth.uid()`, fixed search paths, owner checks and server-assigned identities/timestamps; public wrappers use security invoker. Memory corrections supersede rather than relabel old records. Inference remains a distinct kind. Temporary memories use a validated stated duration (seven days when unspecified), overlay durable memories with the same key, and expire from model context without destroying the durable baseline. Durable memories persist across conversations. Context selection is bounded and deterministic; no embeddings are used.

Planning reads the existing planner snapshot before its final response, retaining recurrence/protection information. Snapshot coverage is only asserted for its requested civil day. Phase A never claims multi-day occupancy validation. Next Action reuses `nextActionFacts` only with an explicit availability interval; automatic free-window derivation remains Phase C.

The history endpoint is native JWT only, owner-filtered, paginated, and no-store. Mobile restores server history, carries a conversation ID, and sends just its latest user message thereafter. Local secure storage retains unresolved request and command identities. New conversation leaves durable memories intact. Existing proposal-only responses remain readable during rollout.

Streaming remains negotiated with `Accept: application/x-ndjson`. Only complete, checked provisional sentences are streamed; planning and next-action text waits for capability validation. the final complete event carries the same persisted typed response as JSON, including the existing proposal field for older streaming clients. Cancellation is propagated through both discovery generation passes and checked before persistence. Mobile keeps the immediate user message, editable next draft, Stop control, interrupted reply and serialized recovery storage from the streaming-chat release.

Persisted user/assistant messages carry their server-assigned request identity for reconciliation. Stopped/interrupted bubbles remain local UI state and are overlaid on hydrated history without entering model context. Sanitized stream errors retain permanent conflict/invalid categories so the client can abandon a stale request instead of retrying it forever.

## Rollout and privacy

Apply `20260920033758_assistant_orchestrator_memory.sql` before deploying the backend, then release mobile. Deploying the route without the migration fails closed. No production migration is performed by this implementation task. The old client remains compatible with the proposal envelope; a new client that already has a server conversation requires this backend contract.

Conversation and memory plaintext is owner-private through authorization, not end-to-end encrypted. Normal logs and error responses contain categories only. Use the existing HTTPS/infrastructure encryption and production access controls. A future encryption envelope can be added without changing server ownership or source-message relationships.

## Verification

The checked-in golden prompt exercises three-question readiness, horizon capture, skip drafts and memory context. Provider responses are deterministic fixtures; a live-model check requires a configured gateway key. SQL fixtures cover two authenticated users, anonymous denial, replay, forged history, memory correction, stale turns, and atomic rollback. Existing capture, guided-planning, completion and Undo SQL fixtures also pass in a disposable database. No live user data was changed.
