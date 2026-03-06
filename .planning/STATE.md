# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v4.0 Money Tracking — Phase 19 complete, ready for Phase 20

## Current Position

Phase: 19 of 25 (Plaid Bank Connection Pipeline) -- COMPLETE
Plan: 6 of 6 in current phase
Status: Phase 19 complete
Last activity: 2026-02-22 — Completed 19-06 (Manual transaction dialog, validation tests, human verification)

Progress: [███░░░░░░░] 25% v4.0

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 11
- Average duration: 5min
- Total execution time: 0.83 hours

**v1.1 Velocity:**
- Total plans completed: 1
- Execution time: ~10min

**v2.1 Velocity:**
- Total plans completed: 6
- Execution time: ~63min

**v3.0 Velocity:**
- Total plans completed: 12
- Total tasks: 25
- Total execution time: ~49min
- Files changed: 97 (+12,769/-156 lines)

**v4.0 Velocity:**
- 19-01: 4min, 2 tasks, 14 files
- 19-02: 5min, 3 tasks (TDD), 3 files
- 19-03: 5min, 2 tasks, 19 files
- 19-04: 6min, 2 tasks, 11 files
- 19-05: 5min, 2 tasks, 10 files
- 19-06: 2min, 2 tasks, 8 files

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log with outcomes.
Recent decisions affecting current work:

- Keep Supabase for money features (no Better Auth+Drizzle+Neon)
- Plaid for bank connections (12,000+ US institutions)
- decimal.js for money arithmetic (integer cents in DB)
- Calm Finance design for money views only (muted teal/amber)
- No billing in v4.0 (build features first)
- Couples/household from day one (household_id in schema from first migration)
- [18-01] All money amounts BIGINT cents, converted via decimal.js at API boundary
- [18-01] IN-subquery RLS pattern for all money tables (99.78% faster than joins)
- [18-01] Categories SELECT allows NULL household_id for system defaults
- [18-01] Intl.NumberFormat("en-US") for consistent money formatting in Node.js
- [18-02] Wallet icon for Money nav (clean lines, recognizable, matches existing icon style)
- [18-02] Money nav position: Dashboard > Habits > Tasks > Money
- [18-02] Empty state designed as welcoming landing page, not error/broken state
- [19-01] Vault wrapper functions (SECURITY DEFINER) for PostgREST RPC access to Plaid secrets
- [19-01] Sign inversion at sync boundary: toCents(-plaidAmount) for Plaid->DB convention
- [19-01] Liability balance negation during exchange (credit/loan = negative in our system)
- [19-01] MoneyAccount naming avoids collision with JS Account / auth Account types
- [19-02] @vitest-environment node for jose v6 tests (jsdom Uint8Array polyfill incompatible)
- [19-02] Fail-closed webhook verification pattern (try-catch returns false on any error)
- [19-03] Webhook always returns 200 even on internal errors to prevent Plaid retries
- [19-03] Disconnect gracefully handles Plaid revocation errors (log but continue)
- [19-03] deriveSyncStatus helper derives UI state from connection fields (syncing/synced/stale/error)
- [19-03] Cron auth: Bearer CRON_SECRET header verification pattern
- [19-04] ConnectionWithAccounts extends BankConnection with accounts array and sync_status for SWR
- [19-04] PlaidLinkButton eager link_token fetch on mount for faster UX
- [19-04] DisconnectDialog uses two action buttons (keep/delete) for clarity
- [19-04] Dismissable error banner auto-resets when connections change (new errors detected)
- [19-05] Server page + client list pattern: server i18n header wrapping client SWR component
- [19-05] OAuth redirect auto-opens Plaid Link with receivedRedirectUri on mount
- [19-05] MoneyPageShell shows live net worth summary or empty state (replaced coming-soon)
- [19-06] ManualTransactionDialog uses react-hook-form + zodResolver with manualTransactionSchema
- [19-06] Cash account option (value: 'cash') in account selector for unbanked transactions
- [19-06] Manual entry button in AccountsEmptyState alongside Plaid Link for discoverability
- [19-06] react-plaid-link added as project dependency

### Pending Todos

None.

### Blockers/Concerns

- Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)
- @dnd-kit/core v6 + React 19 peer dep mismatch requires pnpm config (cosmetic, works correctly)
- Plaid API costs ~$1-2/connected account/month — monitor unit economics
- Plaid access tokens must be encrypted at rest from first migration
- Household data isolation (RLS + application-layer) critical for couples feature
- Supabase `numeric` type causes silent float precision loss — use BIGINT cents only
- Plaid webhook endpoint bypasses Supabase auth — needs service-role client + JWT verification
- Phase 19 (Plaid) flagged HIGH for research before planning
- Phase 23 (Household/Couples) flagged MEDIUM for research (invite token strategy)
- Phase 24 (Dashboard/AI) flagged HIGH for research (cash flow projections, constrained LLM)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 19-06-PLAN.md (Phase 19 complete)
Resume: `/gsd:execute-phase 20` to start Phase 20 (Transaction Management & Categorization)
