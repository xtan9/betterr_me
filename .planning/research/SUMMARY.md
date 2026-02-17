# Project Research Summary

**Project:** BetterR.Me Codebase Hardening
**Domain:** Production Next.js 16 + Supabase habit tracking web app
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

This hardening milestone addresses 20 identified concerns in a production habit tracking web app. The project already has a solid foundation (Next.js 16, Supabase, Zod, TypeScript) but has critical correctness bugs, security gaps, and fragile patterns that emerged during rapid feature development. The recommended approach is a phased remediation prioritized by user impact: fix data correctness bugs first (users see wrong completion rates), then wire existing Zod schemas into API routes (security + consistency), then remove dead code and fragile patterns (maintainability).

The most critical finding is that `shouldTrackOnDate()` returns incorrect values for `times_per_week` and `weekly` frequency types, causing completion rates to show ~43% when they should show ~100%. This bug ripples through stats, insights, streaks, and missed-day calculations. The function has two copies (one in `lib/habits/format.ts`, one private in `lib/db/habit-logs.ts`) that must be fixed atomically. Additionally, API routes perform manual validation instead of using the existing Zod schemas, leaving the API vulnerable to oversized payloads and creating parallel validation paths that drift over time.

Key risks are addressed by fixing bugs in dependency order (frequency logic before stats optimization), creating API-specific schemas with `.partial()` for PATCH routes, and adding a database migration for the `weekly` frequency `day` field that preserves backward compatibility. No new dependencies are needed. This is about wiring existing tools correctly, not adding new ones.

## Key Findings

### Recommended Stack

**No new dependencies required.** The project already has all necessary tools in place. This hardening milestone is about correct wiring, not adding new packages. Full details in [STACK.md](./STACK.md).

**Core technologies (already in use):**
- **Zod 3.25.46**: Schema validation — currently used for forms only; needs wiring into API routes via `.safeParse()`
- **next-themes 0.4.6**: Dark mode — works correctly but has manual DOM workaround that should be removed
- **Tailwind CSS 3.4.x**: Class-based dark mode — configured correctly with `darkMode: ["class"]`
- **Vercel serverless**: Deployment platform — in-memory cache provides zero benefit, HTTP Cache-Control is the correct approach

**Critical finding:** The in-memory `TTLCache` in `lib/cache.ts` is ineffective on Vercel serverless (each cold start = empty cache, concurrent workers = separate caches). The stats route already sets `Cache-Control: private, max-age=300` headers, which is the correct caching mechanism. The in-memory cache should be removed as dead code.

### Expected Features

Full prioritization matrix in [FEATURES.md](./FEATURES.md).

**Must fix (table stakes — P1):**
- **Zod API validation (T1)**: Wire Zod schemas into all 12 API routes, replacing hand-rolled validation
- **Frequency logic (T3, T4)**: Fix `times_per_week` (shows 43% instead of 100%) and `weekly` (hardcoded to Monday)
- **Profile reliability (T8)**: Centralize profile auto-creation fallback (currently only in habits POST route)
- **Non-null assertion (T2)**: Replace `user.email!` with `user.email ?? ''` to handle OAuth edge cases

**Should fix (quality improvements — P2):**
- **Remove cache (D1)**: Delete ineffective in-memory cache, rely on HTTP Cache-Control
- **Theme-switcher (D3)**: Remove manual DOM class manipulation that fights next-themes
- **Performance (D4, D5)**: Replace full task fetch with COUNT(*), cap streak lookback window

**Defer (test coverage — P3):**
- **Test gaps (D8, D10)**: Add unit tests for `/api/habits/[id]/logs` and Zod validation paths
- **Habit count limit (D9)**: Enforce 20-habit limit per user (planned but not enforced)

### Architecture Approach

Full component boundaries and data flow in [ARCHITECTURE.md](./ARCHITECTURE.md).

The codebase follows a clean layered architecture: middleware (session refresh) → API routes (auth + validation) → DB classes (Supabase query wrappers) → Supabase (RLS enforcement). The hardening work focuses on three architectural issues:

**Major fixes:**
1. **DB class constructors** — Currently have optional `supabase?: SupabaseClient` parameter that silently falls back to browser client on the server. Fix: make parameter required (like `InsightsDB` and `HabitMilestonesDB` already do correctly)
2. **API route boilerplate** — Every route repeats identical auth check and manual validation. Fix: extract `withAuth()` wrapper and `parseBody()` helper for consistent error handling
3. **Validation schema gaps** — Zod schemas exist for forms but not API routes. Forms require all fields; PATCH routes accept partial updates. Fix: create `habitUpdateSchema = habitFormSchema.partial()` for PATCH

**Patterns to apply:**
- **Required dependency injection**: No optional constructor parameters with fallbacks
- **Wrapper functions for cross-cutting concerns**: `withAuth()` replaces 12 copies of auth boilerplate
- **Graceful degradation with warnings**: Dashboard returns `_warnings` array when supplementary queries fail

### Critical Pitfalls

Full pitfall details and recovery strategies in [PITFALLS.md](./PITFALLS.md).

1. **Frequency logic fix breaks existing stats retroactively** — `shouldTrackOnDate()` has two copies that must be fixed atomically. Eight tests assert the current (incorrect) behavior. Fix all consumers + all tests simultaneously or stats become internally contradictory.

2. **Database migration for weekly frequency day field corrupts existing habits** — Adding `day` to `{"type": "weekly"}` JSONB requires backward-compatible migration. Fix: make `day` optional in TypeScript (`day?: number`), default to 1 (Monday) when absent, use `||` JSONB merge in migration.

3. **Zod schema wiring creates two incompatible validation paths** — Form schema requires all fields; PATCH route needs partial updates. Fix: use `habitFormSchema.partial()` for PATCH, verify at least one field provided with `Object.keys(result.data).length > 0`.

4. **Tests asserting current (incorrect) behavior block bug fixes** — Multiple tests explicitly assert the wrong behavior as "correct". Fix: write correct tests first (red), then fix production code (green). Update tests atomically with fixes.

5. **next-themes manual DOM workaround masks a configuration bug** — Component manually adds/removes CSS classes, fighting next-themes' internal script. Fix: investigate root cause (likely hydration timing), remove workaround only after verifying theme switching works in minimal reproduction.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order and prioritizes user-visible correctness bugs.

### Phase 1: Security and Validation

**Rationale:** Security gaps are highest risk. Wiring Zod schemas is the single highest-leverage fix because it resolves security (no server-side length limits), code quality (eliminates parallel validation paths), and enables test coverage later.

**Delivers:**
- All 12 API routes use Zod validation via `parseBody()` helper
- No server-side length limits gap (name max 100, description max 500)
- Profile auto-creation centralized in `ensureProfile()` helper
- Auth callback redirect allowlist added (defense-in-depth)

**Addresses:**
- T1: Wire Zod schemas into all API routes
- T2: Fix `user.email!` non-null assertion (folded into T8)
- T8: Fix profile auto-creation reliability
- D7: Add redirect path allowlist

**Avoids:** Pitfall 3 (Zod partial update breakage) by creating `habitUpdateSchema = habitFormSchema.partial()`

**Research flag:** Standard pattern, well-documented. No additional research needed.

### Phase 2: Correctness Bugs

**Rationale:** Users see wrong data. Most user-visible problem. Both frequency bugs touch the same function (`shouldTrackOnDate`), so they must be done together. The `weekly` frequency fix requires a database migration, which must be completed in this phase.

**Delivers:**
- `times_per_week` completion rates show 100% when 3 of 3 required completions done (not 43%)
- `weekly` frequency tracks configurable day (not hardcoded Monday)
- 2 pre-existing test failures resolved (symptoms of T3)
- `WeeklyInsight` type uses discriminated union for type-safe narrowing

**Addresses:**
- T3: Fix `times_per_week` frequency logic
- T4: Fix `weekly` frequency hardcoded to Monday (requires migration)
- T5: Fix 2 pre-existing test failures
- T7: Fix `WeeklyInsight` discriminated union type

**Avoids:**
- Pitfall 1 (frequency logic fix breaks stats) by fixing both copies of `shouldTrackOnDate` atomically
- Pitfall 2 (migration corrupts JSONB) by making `day` optional in TypeScript, using `||` merge
- Pitfall 4 (tests blocking fixes) by updating all 8 tests simultaneously with production code

**Uses:** Zod schemas from Phase 1 (for `weekly` frequency `day` field validation)

**Research flag:** Needs migration testing on staging. Otherwise standard.

### Phase 3: Fragility and Code Quality

**Rationale:** These don't cause user-visible bugs but make the system unreliable or harder to debug. Low complexity, high leverage for maintainability.

**Delivers:**
- In-memory `statsCache` removed (dead code on serverless)
- Debug `console.log` statements removed (3 in theme-switcher, 1 in auth callback)
- Theme-switcher manual DOM workaround removed (after verifying next-themes works correctly)
- `HabitLogsDB` constructor requires Supabase client (prevents silent browser client fallback)
- Dashboard errors logged (not silently swallowed)

**Addresses:**
- T6: Add error logging to `computeMissedDays` catch block
- D1: Remove in-memory `statsCache`
- D2: Remove debug `console.log` statements
- D3: Fix theme-switcher DOM workaround
- D6: Make `HabitLogsDB` constructor require Supabase client

**Avoids:** Pitfall 3 (cache removal without cleanup) by grepping all import sites and removing atomically

**Research flag:** Standard patterns. D3 (theme-switcher) may need minimal reproduction to verify root cause.

### Phase 4: Performance

**Rationale:** Performance fixes depend on correctness fixes being done first (D5 depends on T3+T4). These are optimizations, not bugs. Users are not blocked.

**Delivers:**
- Dashboard COUNT(*) query for total tasks (not full fetch)
- Streak calculation caps lookback to `current_streak + buffer` days

**Addresses:**
- D4: Replace `getUserTasks()` with `COUNT(*)` query in dashboard
- D5: Optimize streak calculation lookback window

**Research flag:** Standard SQL patterns. No additional research needed.

### Phase 5: Test Coverage

**Rationale:** Tests validate all fixes above. Writing tests last ensures they cover final corrected behavior, not intermediate states. D10 specifically requires T1 (Zod wiring) to be complete.

**Delivers:**
- Unit tests for `GET /api/habits/[id]/logs` route
- Habit count limit enforcement (20 per user)
- Tests for Zod validation paths in all API routes

**Addresses:**
- D8: Add unit tests for `GET /api/habits/[id]/logs`
- D9: Add habit count limit enforcement
- D10: Add tests for Zod validation paths

**Research flag:** Standard testing patterns. No additional research needed.

### Phase Ordering Rationale

- **Security first**: T1 (Zod validation) is foundational because it creates the API schemas used in later phases
- **Correctness second**: Bugs must be fixed before optimizations. Optimizing incorrect logic wastes effort
- **Dependencies respected**: T4 (weekly frequency) requires migration before code that reads `frequency.day` is deployed. D5 (streak optimization) requires T3+T4 (frequency logic correct) first
- **Atomic updates**: T3+T4 touch the same function and must be done together. T2+T8 touch the same code (profile auto-creation)
- **Test coverage last**: D10 requires T1 complete. Tests validate final behavior, not intermediate states

### Research Flags

**Phases likely needing deeper research:**
- **Phase 2 (Correctness)**: Migration testing on staging required. Needs validation that `frequency || '{"day": 1}'::jsonb` preserves existing fields

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Validation)**: Zod `.safeParse()` + `withAuth()` wrapper are documented patterns
- **Phase 3 (Code Quality)**: Cache removal, console.log cleanup are trivial
- **Phase 4 (Performance)**: COUNT(*) and lookback cap are standard SQL/algorithmic patterns
- **Phase 5 (Testing)**: Unit test patterns are well-established

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official docs. Zod usage confirmed via Dub.co engineering blog + Zod API docs. Vercel Cache-Control behavior from authoritative Vercel docs |
| Features | HIGH | All 20 features derived from direct codebase analysis. Prioritization follows industry consensus (Atlassian Technical Debt Guide, SEI/CMU recommendations). Dependencies verified via code inspection |
| Architecture | HIGH | Current architecture analyzed via direct file inspection. Proposed patterns (`withAuth`, required DI) are Next.js community standards. Supabase client patterns verified against official docs |
| Pitfalls | HIGH | All 6 critical pitfalls derived from actual code structure (two `shouldTrackOnDate` copies, JSONB schema-less nature, Zod form vs API schemas). Supabase trigger failure pattern confirmed via GitHub issue #37497 |

**Overall confidence:** HIGH

All research grounded in actual codebase analysis. External sources used to verify patterns (Zod, next-themes, Vercel caching) match established best practices. No speculative recommendations.

### Gaps to Address

Minor gaps that need attention during planning:

- **next-themes workaround root cause**: Component has manual DOM class manipulation that may or may not be necessary. Needs minimal reproduction to determine if it's a real next-themes bug or a configuration issue. Low risk — worst case is reverting to the current workaround.

- **Weekly frequency UI for day picker**: Once `day` field is added to `{"type": "weekly"}` frequency, the habit form needs a day-of-week picker. i18n required (all 3 locales). Design not researched — assume standard dropdown with "Monday" through "Sunday".

- **Migration rollback strategy**: If the `frequency || '{"day": 1}'::jsonb` migration fails mid-execution on a large dataset, what is the rollback path? Supabase supports point-in-time recovery but bounded to backup retention. Migration should be idempotent (safe to re-run).

- **Zod validation error format consistency**: Currently each route has different error messages. After wiring Zod, all routes will return `{ error: "Validation failed", details: { field: [...messages] } }`. Frontend may need updates to display structured errors instead of single error string.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: all files in `lib/db/`, `app/api/`, `lib/validations/`, `lib/habits/`, `lib/cache.ts`, `components/theme-switcher.tsx`, `app/layout.tsx`, `tests/`
- Existing planning docs: `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/TESTING.md`
- [Vercel Cache-Control Headers docs](https://vercel.com/docs/headers/cache-control-headers) — authoritative source on `private` vs `s-maxage`, CDN behavior
- [Supabase issue #37497](https://github.com/supabase/supabase/issues/37497) — trigger failure blocks signup, misleading error
- [Supabase discussion #6518](https://github.com/orgs/supabase/discussions/6518) — `on_auth_user_created` trigger can block signups
- [next-themes GitHub README](https://github.com/pacocoursey/next-themes) — `attribute="class"` handles DOM class toggling automatically
- [shadcn/ui Dark Mode guide](https://ui.shadcn.com/docs/dark-mode/next) — canonical next-themes + Tailwind setup
- [Zod API docs: discriminatedUnion](https://zod.dev/api) — performance benefit over `z.union`

### Secondary (MEDIUM confidence)
- [Dub.co: Using Zod to validate Next.js API Route Handlers](https://dub.co/blog/zod-api-validation) — `.safeParse()` pattern with error formatting (verified against Zod docs)
- [Next.js: Building APIs with App Router](https://nextjs.org/blog/building-apis-with-nextjs) — `withAuth` pattern recommendation
- [Vercel: Caching Serverless Function Responses](https://vercel.com/docs/functions/serverless-functions/edge-caching) — `stale-while-revalidate` directive
- [Vercel Fluid Compute blog](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts) — in-memory state preservation on warm instances
- [Atlassian Technical Debt Guide](https://www.atlassian.com/agile/software-development/technical-debt) — remediation prioritization (security → correctness → performance → tests)
- [SEI/CMU Technical Debt Recommendations](https://www.sei.cmu.edu/blog/5-recommendations-to-help-your-organization-manage-technical-debt/) — technical debt management strategies

### Tertiary (LOW confidence)
- [Zod issue #2106](https://github.com/colinhacks/zod/issues/2106) — `z.switch` proposed but not yet shipped (informational only, does not affect recommendations)
- [GitHub Discussion: Vercel Serverless Cache Behavior](https://github.com/vercel/next.js/discussions/87842) — in-memory cache limitations (confirmed via Vercel docs)

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
