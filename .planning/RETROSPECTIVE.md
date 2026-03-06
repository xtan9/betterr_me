# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v4.0 — Money Tracking

**Shipped:** 2026-02-28
**Phases:** 9 | **Plans:** 38 | **Tasks:** 74

### What Was Built
- Full personal finance management: Plaid bank connections, transaction management with auto-categorization, budgets with spending analytics
- Bills/subscriptions auto-detection, savings goals with projections, net worth tracking across all accounts
- Household/couples support: partner invitation, mine/household views, account visibility controls, shared budgets/goals
- Future-first dashboard with cash flow projections, income detection, contextual AI insights (anxiety-aware framing)
- Data management: CSV import with column mapping, CSV export, full data deletion with Plaid revocation

### What Worked
- **Phase-per-PR workflow**: Each phase got its own PR (lesson from v3.0's 164-file mega-PR). Much easier to review and merge
- **Milestone audit before completion**: Caught 7 gaps (3 unsatisfied requirements, missing VERIFICATION.md, integration wiring) that were closed in Phase 26
- **Wave-based parallelization**: Plans within phases executed in dependency-ordered waves, maximizing throughput
- **Pure computation modules**: Projections, income detection, and insights as pure functions with no DB imports — easy to test and reason about
- **Calm Finance design system**: Dedicated CSS variables for money views kept finance UI distinct without polluting existing design tokens
- **IN-subquery RLS pattern**: Consistent, performant access control across all 15+ money tables

### What Was Inefficient
- **Phase 23 human verification bottleneck**: 7 items require live two-user testing that couldn't be automated — still pending at milestone completion
- **Milestone audit could have been earlier**: Running audit only after all phases were complete meant gap closure required an extra phase (26). Running audit at ~80% would catch gaps sooner
- **Summary one_liner extraction unreliable**: gsd-tools summary-extract couldn't find one_liners in SUMMARY.md frontmatter, requiring manual accomplishment extraction

### Patterns Established
- **Household-scoped data isolation**: household_id FK + IN-subquery RLS on all money tables; view-mode filtering (mine/household) on all GET endpoints
- **BIGINT cents + decimal.js**: Integer storage, decimal conversion at API boundary, Intl.NumberFormat for display
- **Vault-encrypted secrets**: Plaid tokens stored via Supabase Vault with SECURITY DEFINER wrapper functions
- **SWR deduplication for shared state**: useHousehold() per-component with SWR caching, no React context provider needed
- **Toast action/cancel for merchant rules**: Sonner toast with 10s duration for "apply to all from this merchant?" prompt
- **Server page + client list pattern**: Server component handles i18n header, client component handles SWR data fetching

### Key Lessons
1. **Run milestone audit at ~80% completion**, not 100% — earlier detection means gap closure can be integrated into remaining phases rather than requiring a new one
2. **Household/couples complexity is real**: Phase 23 touched 34 files in a single plan (23-03) — consider splitting multi-user features into smaller plans
3. **Pure computation functions pay off**: lib/money/projections.ts, income-detection.ts, insights.ts are all easily testable and reusable because they have zero DB dependencies
4. **Calm Finance principles reduce scope**: "No aggressive red/green" and "forward-looking framing" prevented feature creep into gamification/anxiety-inducing designs
5. **CSV import should be planned from Phase 20**: TXNS-07 was deferred to Phase 26 but could have been included in Phase 20 transaction infrastructure

### Cost Observations
- Model mix: ~70% opus (planning, execution), ~25% sonnet (verification, integration checking), ~5% haiku (fast exploration)
- Sessions: ~15 sessions over 8 days
- Notable: 38 plans executed in 8 days — average ~5 plans/day, most plans completing in 3-11 minutes

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 11 | Established GSD workflow, TDD patterns |
| v1.1 | 1 | 1 | Smallest milestone — single bug fix batch |
| v2.0 | 9 | 21 | Design token system, sidebar redesign |
| v2.1 | 3 | 6 | Polish milestone pattern established |
| v3.0 | 5 | 12 | Phase-per-PR workflow, kanban complexity |
| v4.0 | 9 | 38 | Largest milestone — full finance feature, milestone audit, gap closure phase |

### Cumulative Quality

| Milestone | Requirements | Plans | Files Changed |
|-----------|-------------|-------|---------------|
| v1.0 | 26 | 11 | 116 |
| v1.1 | 3 | 1 | 19 |
| v2.0 | 28 | 21 | — |
| v2.1 | 8 | 6 | 59 |
| v3.0 | 17 | 12 | 97 |
| v4.0 | 66 | 38 | 323 |

### Top Lessons (Verified Across Milestones)

1. **Phase-per-PR prevents review fatigue** — v3.0's 164-file PR taught this, v4.0 confirmed it works at scale
2. **Milestone audit catches integration gaps** — v4.0 found 7 gaps that would have shipped as bugs without the audit step
3. **Pure computation modules are worth the upfront design** — reusable across phases, easy to test, no mocking needed
4. **Calm Finance / anxiety-aware design is a feature constraint that helps** — reduces scope while improving UX
5. **Wave-based plan execution maximizes throughput** — independent plans run in parallel, dependent ones sequence naturally
