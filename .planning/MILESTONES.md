# Milestones

## v1.0 Codebase Hardening (Shipped: 2026-02-16)

**Phases completed:** 5 phases, 11 plans, 0 tasks

**Key accomplishments:**
- Fixed frequency correctness: times_per_week 3/3 = 100% (was ~43%), weekly any-day-counts (was Monday-only)
- Wired Zod validation into all 6 API routes, added ensureProfile helper, 20-habit limit, auth redirect allowlist
- Created logger module, removed dead cache (669 lines), hardened all 4 DB constructors, added _warnings to dashboard
- Replaced getUserTasks with COUNT(*) query, added adaptive streak lookback (30→60→120→240→365 days)
- Backfilled 71 tests: logs route (16), Zod schema validation (53), frequency regressions (2)

**Stats:** 116 files changed, +13,330/-1,293 lines, 992 tests passing, 0.83 hours execution time

---

