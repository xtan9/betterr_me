# Assistant creation completion: server contract

On 2026-10-18 the user prescribed: request task creation → one Accept → concise
“OK，已创建完毕”, with no stale unsaved wording or second calendar preview.

This server change supports the mobile repair with these acceptance criteria:

- History returns current accepted proposals for assistant request IDs on the
  returned page, restricted to the authenticated owner and visible conversation.
  This lets the client render truthful receipts for existing accepted tasks.
- History identifies the last capture/planning workflow so ordinary conversation
  does not revive an older planning preview. Session ownership and recovery
  handles remain available.
- Subsequent AI replies receive the verified current capture state. Accepted
  changes are already saved; historical pending prose must not cause another
  acceptance request or duplicate creation. Pending revisions retain their items.
- Failed reads return unavailable. No schema or task/calendar write behavior
  changes; existing exact approval and idempotency remain authoritative.

Verification: `pnpm exec vitest run tests/app/api/mobile-assistant/history.test.ts
tests/app/api/mobile-assistant/route.test.ts`. The accepted-context and history
receipt tests failed before the repair and passed afterward. Mobile presentation
and native acceptance are tracked in the companion mobile repair.
