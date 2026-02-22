# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v4.0 Money Tracking — Phase 19 (Plaid Bank Connection Pipeline)

## Current Position

Phase: 19 of 25 (Plaid Bank Connection Pipeline)
Plan: 1 of 6 in current phase
Status: Executing Phase 19
Last activity: 2026-02-22 — Completed 19-01 (Plaid SDK, migration, server library, DB classes)

Progress: [██░░░░░░░░] 14% v4.0

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
Stopped at: Completed 19-01-PLAN.md
Resume: `/gsd:execute-phase 19` to continue with 19-02-PLAN.md
