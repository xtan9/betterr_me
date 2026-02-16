# BetterR.Me — Codebase Hardening

## What This Is

A maintenance milestone for BetterR.Me, a habit tracking web app built with Next.js 16, Supabase, and TypeScript. This work addresses all technical debt, bugs, security gaps, performance issues, fragile areas, and test coverage gaps identified in the codebase audit — before any new features are built.

## Core Value

Every existing feature works correctly, safely, and is covered by tests. Users see accurate stats, the API rejects bad input, and the codebase is maintainable going forward.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing codebase. -->

- ✓ User can sign up, log in, log out with email/password — existing
- ✓ User can create, edit, delete habits with daily/weekdays/weekly/times_per_week/custom frequency — existing
- ✓ User can toggle habit completion per day — existing
- ✓ User can view dashboard with habits, tasks, streaks, and missed-day indicators — existing
- ✓ User can view habit stats (streaks, weekly/monthly/all-time completion rates) — existing
- ✓ User can view weekly insights — existing
- ✓ User can create, edit, complete, delete tasks — existing
- ✓ User can manage profile and preferences (week start day, theme, locale) — existing
- ✓ User can export habit data as ZIP — existing
- ✓ App supports three locales (en, zh, zh-TW) — existing
- ✓ App supports dark mode — existing
- ✓ Habit milestones and streak badges — existing

### Active

<!-- All 20 concerns from codebase audit. -->

**Tech Debt**

- [ ] Fix `times_per_week` frequency: treated as daily in `shouldTrackOnDate`, deflating completion percentages (issue #98)
- [ ] Fix `weekly` frequency: hardcoded to Monday — add user-chosen day picker, default to creation day for existing habits
- [ ] Wire Zod schemas into API routes: replace hand-rolled validators with `.safeParse()` at every POST/PATCH handler
- [ ] Remove debug `console.log` statements from `theme-switcher.tsx` and `auth/callback/route.ts`
- [ ] Remove in-memory `statsCache` (ineffective on Vercel serverless) — HTTP Cache-Control headers already handle client caching
- [ ] Fix profile auto-creation: investigate Supabase trigger reliability + extract shared `ensureProfile()` helper for defense-in-depth

**Known Bugs**

- [ ] Fix 2 pre-existing test failures in `habit-logs.test.ts` for `times_per_week` (related to issue #98)
- [ ] Fix `WeeklyInsight` type: replace non-discriminated union with discriminated union for type-safe `params` access

**Security**

- [ ] Apply Zod `.safeParse()` at all API boundaries (overlaps with Zod wiring above — covers length limits, prototype pollution)
- [ ] Fix non-null assertion on `user.email!` in profile auto-creation — add guard for absent email
- [ ] Add redirect path allowlist to auth callback for defense-in-depth (current relative-URL guard is functional)

**Performance**

- [ ] Replace `getUserTasks()` with `COUNT(*)` query in dashboard route — avoid fetching all task rows for a count
- [ ] Optimize streak calculation: cap lookback window for short streaks instead of always fetching 365 days

**Fragile Areas**

- [ ] Add error logging to `computeMissedDays` catch block in dashboard — stop silently swallowing errors
- [ ] Fix theme-switcher: remove manual DOM class manipulation, investigate and fix `next-themes` integration
- [ ] Make `HabitLogsDB` constructor require Supabase client in server contexts — prevent silent fallback to browser client

**Test Coverage**

- [ ] Add unit tests for `GET /api/habits/[id]/logs` route
- [ ] Add server-side input length validation (wire Zod schemas — covered by Zod wiring above)
- [ ] Add habit count limit enforcement in API (20 per user as specified in engineering plan)
- [ ] Add tests for Zod validation paths in API routes (covered by Zod wiring above)

### Out of Scope

- New features (new habit types, social features, notifications) — address after hardening
- Mobile app — web-only
- Migration to a different cache provider (Upstash/Redis) — removing cache entirely is sufficient
- Rewriting DB layer architecture — only targeted fixes to constructor patterns
- Upgrading major dependencies — stability milestone, not upgrade milestone

## Context

- **Existing codebase:** ~150 files, Next.js 16 App Router, Supabase backend, deployed to Vercel
- **Codebase map:** `.planning/codebase/` (7 documents from 2026-02-15 audit)
- **Known issue:** #98 tracks `times_per_week` frequency bugs — this milestone resolves it
- **Production environment:** Vercel serverless — in-memory caches are ineffective across instances
- **Test infrastructure:** Vitest (unit/integration) + Playwright (E2E), 50% coverage threshold

## Constraints

- **Tech stack:** No new dependencies unless absolutely necessary — this is a hardening milestone
- **Backwards compatibility:** Existing habits must not break — `weekly` frequency gets `day` field defaulting to Monday (1) for existing records
- **i18n:** Any new user-facing strings (e.g., day picker for weekly habits) must be added to all three locale files
- **Test coverage:** All fixes must include tests. Coverage must not decrease.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove in-memory cache entirely | Ineffective on Vercel serverless; HTTP Cache-Control already handles client caching; no new dependency needed | — Pending |
| Fix trigger + shared ensureProfile() helper | Defense-in-depth: trigger is the right primary mechanism, helper catches edge cases consistently | — Pending |
| User-chosen day for weekly frequency | Only correct approach; `custom` type already stores days in frequency object; default to creation day for existing habits | — Pending |
| Wire existing Zod schemas into API routes | Schemas already exist but aren't used server-side; eliminates parallel validation paths | — Pending |

---
*Last updated: 2026-02-15 after initialization*
