# BetterR.Me

## What This Is

A habit tracking web app built with Next.js 16, Supabase, and TypeScript. Supports daily/weekdays/weekly/times_per_week/custom frequency habits, task management, streaks, weekly insights, and data export. Three locales (en, zh, zh-TW), dark mode, deployed to Vercel.

## Core Value

Users see accurate stats, the API rejects bad input, and the codebase is maintainable.

## Requirements

### Validated

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
- ✓ times_per_week frequency shows accurate completion % (3/3 = 100%) — v1.0
- ✓ weekly frequency accepts any day (not hardcoded to Monday) — v1.0
- ✓ Single shouldTrackOnDate source of truth in lib/habits/format.ts — v1.0
- ✓ WeeklyInsight discriminated union for type-safe params — v1.0
- ✓ All API POST/PATCH routes validate with Zod .safeParse() — v1.0
- ✓ Server-side length limits (name:100, desc:500) enforced — v1.0
- ✓ ensureProfile helper for reliable profile auto-creation — v1.0
- ✓ handle_new_user trigger has exception handling — v1.0
- ✓ Auth redirect allowlist on callback and confirm routes — v1.0
- ✓ PATCH routes use .partial() Zod schemas — v1.0
- ✓ 20-habit limit enforced in POST /api/habits — v1.0
- ✓ Logger module replaces all console.error/warn in server code — v1.0
- ✓ Dead cache removed, theme-switcher cleaned, DB constructors hardened — v1.0
- ✓ Dashboard _warnings for computeMissedDays errors — v1.0
- ✓ Dashboard uses COUNT(*) for task count — v1.0
- ✓ Adaptive streak lookback (30→365 days) — v1.0
- ✓ 71 tests backfilled (logs route, Zod schemas, frequency regressions) — v1.0

### Active

#### Current Milestone: v1.1 Dashboard Task Fixes

**Goal:** Fix timezone-dependent task duplication and incorrect completion count on dashboard

**Target fixes:**
- getTodayTasks() uses server time (UTC) instead of client-sent date, causing tasks to appear in both "today" and "tomorrow" sections when Vercel UTC date differs from user's local date
- Completed tasks vanish from dashboard count instead of being tracked (shows "0 of 1" instead of "1 of 2")

### Out of Scope

- Mobile app — web-only
- Rewriting DB layer architecture — only targeted fixes done
- Upgrading major dependencies — separate milestone

## Context

- **Codebase:** ~170 files, Next.js 16 App Router, Supabase backend, deployed to Vercel
- **Test suite:** 992 tests (Vitest + Playwright), 50% coverage threshold
- **Shipped:** v1.0 Codebase Hardening (2026-02-16) — 5 phases, 11 plans, 26 requirements
- **Codebase map:** `.planning/codebase/` (7 documents from 2026-02-15 audit)
- **Known pre-existing:** Vitest picks up .worktrees/ test files (spurious, not blocking)

## Constraints

- **Tech stack:** Next.js 16, Supabase, TypeScript, pnpm
- **i18n:** All user-facing strings in en, zh, zh-TW
- **Test coverage:** Must not decrease from current baseline

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove in-memory cache entirely | Ineffective on Vercel serverless; HTTP Cache-Control handles client caching | ✓ Good — 669 lines removed, HTTP caching preserved |
| Fix trigger + shared ensureProfile() helper | Defense-in-depth: trigger primary, helper catches edge cases | ✓ Good — dual defense with COALESCE fallback |
| Weekly = "any day that week counts" | Per PRD V1.2 §6.2, no day picker needed | ✓ Good — simplified implementation, no migration needed |
| Wire existing Zod schemas into API routes | Schemas existed but unused server-side | ✓ Good — eliminated parallel validation, all 6 routes wired |
| Logger with (msg, error?, context?) signature | Matches future Sentry.captureException API | ✓ Good — one-file swap when Sentry added |
| Adaptive streak lookback (30→365) | Short streaks (majority) need only ~30 days | ✓ Good — reduces data transfer for common case |
| Habit count limit test unlocked from message text | Flexible assertion prevents brittle tests | ✓ Good — asserts 400 + error presence only |

---
*Last updated: 2026-02-16 after v1.1 milestone start*
