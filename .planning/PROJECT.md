# BetterR.Me

## What This Is

A habit tracking, project management, reflective journaling, and fitness tracking web app built with Next.js 16, Supabase, and TypeScript. Supports habits (daily/weekdays/weekly/times_per_week/custom), task management with Work/Personal sections and named projects, 4-column kanban boards per project, daily journal entries with rich-text editing and mood tracking, writing prompts, calendar/timeline browsing, Hevy-inspired workout logging with exercise library, routine templates, progression charts and personal records, streaks, weekly insights, and data export. Three locales (en, zh, zh-TW), dark mode with semantic design tokens, deployed to Vercel.

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
- ✓ getTodayTasks uses client-sent date parameter (not server-local time) — v1.1
- ✓ Dashboard completed tasks included in "X of Y" count — v1.1
- ✓ No timezone-based task duplication between Today and Tomorrow sections — v1.1
- ✓ All hardcoded color values replaced with semantic design token variables — v2.1
- ✓ All hardcoded spacing values replaced with spacing tokens (gap-card-gap) — v2.1
- ✓ Progress bar track uses bg-muted instead of hardcoded slate — v2.1
- ✓ Sidebar has consistent spacing and padding using design tokens — v2.1
- ✓ Sidebar hover/active states have smooth transitions — v2.1
- ✓ Sidebar icons visually refined with icon containers — v2.1
- ✓ Motivation message restored to colored background style — v2.1
- ✓ Habit checklist footer sticks to card bottom in grid layout — v2.1
- ✓ Task status field (backlog/todo/in_progress/done) with bidirectional is_completed sync — v3.0
- ✓ Existing tasks migrated to section=personal with status derived from is_completed — v3.0
- ✓ Dashboard, recurring tasks, and existing features unchanged after migration — v3.0
- ✓ User can create projects with name, section, and preset color — v3.0
- ✓ User can edit, archive/restore, and delete projects — v3.0
- ✓ Project progress (X/Y tasks done) displayed on project cards — v3.0
- ✓ Task form has section selector and optional project dropdown filtered by section — v3.0
- ✓ Tasks page shows Work/Personal sections with project cards and standalone tasks — v3.0
- ✓ 4-column kanban board per project with drag-and-drop between columns — v3.0
- ✓ Monday.com-style detail modal and column quick-add on kanban board — v3.0
- ✓ All v3.0 UI strings translated in en, zh, zh-TW — v3.0
- ✓ User can create a journal entry for a specific date with rich text (Tiptap editor) — v4.0
- ✓ User can edit and update an existing journal entry — v4.0
- ✓ User can delete a journal entry — v4.0
- ✓ User can select a mood emoji (5-point scale) for each entry — v4.0
- ✓ User sees one entry per day (upsert model) — v4.0
- ✓ User can choose from a library of writing prompts (gratitude, reflection, goals) — v4.0
- ✓ User can skip prompts and write free-form — v4.0
- ✓ Calendar view with mood-colored dot indicators — v4.0
- ✓ Click calendar day to view or create entry — v4.0
- ✓ Timeline feed for chronological browsing — v4.0
- ✓ Sidebar navigation entry for journal — v4.0
- ✓ Dashboard quick-entry journal widget — v4.0
- ✓ Habit/task linking on journal entries — v4.0
- ✓ "On This Day" past reflections — v4.0
- ✓ Journal streak counter — v4.0
- ✓ All journal UI strings translated in en, zh, zh-TW — v4.0
- ✓ Writing prompts available in all three locales — v4.0
- ✓ Exercise library with 92 preset exercises (browse, search, filter by muscle group/equipment) + custom exercises — v5.0
- ✓ Real-time workout logging (start session, add exercises, log sets with weight+reps/bodyweight/duration, mark complete) — v5.0
- ✓ Active workout persists across browser refresh via dual-write (server + localStorage) — v5.0
- ✓ Rest timer with auto-start on set complete, +15s/-15s adjustment, audio beep, tab-switch accuracy — v5.0
- ✓ Routine templates with copy-on-start semantics (create, edit, delete, start workout from routine) — v5.0
- ✓ Save completed workout as new routine template — v5.0
- ✓ Workout history list and detail view with PR badges — v5.0
- ✓ Per-exercise progression charts (max weight/volume over time) with date range selector — v5.0
- ✓ Mid-workout personal record detection with celebratory banner — v5.0
- ✓ Dashboard workout stats widget (last workout date, weekly count) — v5.0
- ✓ Weight unit preference (kg/lbs) in settings, all displays respect choice — v5.0
- ✓ Workouts as top-level sidebar nav item — v5.0
- ✓ All fitness tracking UI strings translated in en, zh, zh-TW — v5.0

### Active

(No active requirements — start next milestone with `/gsd:new-milestone`)

### Out of Scope

- Mobile app — web-only
- Rewriting DB layer architecture — only targeted fixes done
- Upgrading major dependencies — separate milestone
- Replacing window.confirm() with AlertDialog — separate polish milestone
- Dark mode card-on-gray depth fix — requires design decision on dark surface hierarchy
- Custom date/time picker components — native inputs functional, separate effort
- Mobile sidebar improvements — current mobile sheet works, separate scope
- Kanban intra-column reorder (KANB-03) — user decided cards auto-sort by priority
- Completion reflection on drag-to-Done (KANB-04) — user decided tasks move silently
- Task intention display on kanban cards (KANB-05) — user decided no intention on cards
- Kanban keyboard navigation (KANB-06) — deferred to future accessibility milestone
- Touch-optimized drag-and-drop (KANB-07) — deferred to mobile polish
- Custom kanban columns / user-defined statuses — fixed 4-column model for personal use
- WIP limits, swimlanes, automations — team-oriented features, not aligned with solo use
- Subtasks, time tracking, card attachments — scope creep for personal task management
- AI-generated prompts or summaries — no AI API integration planned; static prompt library sufficient
- Voice-to-text journal entries — requires speech API, out of scope for web-first
- Journal entry sharing/export — data export exists for habits; journal export deferred
- Mood notification reminders — no push notification infrastructure
- Photo/file uploads to journal — no file storage infrastructure (Supabase Storage not configured)
- Superset grouping (pair exercises back-to-back) — deferred to v5.1+
- Muscle group distribution chart — deferred to v5.1+
- Estimated 1RM as PR type — requires formula selection, deferred
- Workout streak tracking — deferred to v5.1+
- Social feed / sharing / leaderboards — single-user app
- AI workout generation — premature for v5.0
- Cardio distance/pace/route tracking — web can't access GPS
- Workout programs / periodization — complex program engine, premature

## Context

- **Codebase:** ~400+ files, ~57,500 LOC TypeScript, Next.js 16 App Router, Supabase backend, deployed to Vercel
- **Test suite:** Vitest + Playwright, 50% coverage threshold
- **Shipped:** v1.0 Codebase Hardening (2026-02-16) — 5 phases, 11 plans, 26 requirements
- **Shipped:** v1.1 Dashboard Task Fixes (2026-02-17) — 1 phase, 1 plan, 3 requirements
- **Shipped:** v2.0 UI Style Redesign (2026-02-17) — 9 phases, 21 plans, 28 requirements
- **Shipped:** v2.1 UI Polish & Refinement (2026-02-18) — 3 phases, 6 plans, 8 requirements
- **Shipped:** v3.0 Projects & Kanban (2026-02-21) — 5 phases, 12 plans, 17 requirements
- **Shipped:** v4.0 Journal (2026-02-24) — 7 phases, 13 plans, 17 requirements
- **Shipped:** v5.0 Fitness Tracking (2026-02-27) — 6 phases, 20 plans, 36 requirements
- **Codebase map:** `.planning/codebase/` (7 documents from 2026-02-15 audit)
- **Known:** Vitest picks up .worktrees/ test files (spurious, not blocking)
- **Known:** @dnd-kit/core v6 + React 19 peer dep mismatch (cosmetic, works correctly)
- **Known:** v3.0 + v4.0 + v5.0 DB migrations must be applied to production Supabase

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
| getTodayTasks accepts client date param | Server-local time wrong on Vercel (UTC ≠ user timezone) | ✓ Good — all 3 call sites pass client date, no duplication |
| Include completed tasks in getTodayTasks | Removing completed tasks breaks "X of Y" dashboard count | ✓ Good — single array for both total and completed count |
| Raw HSL convention for CSS custom properties | Matches existing shadcn/ui token pattern, enables opacity modifiers | ✓ Good — 56 tokens defined, all components migrated |
| Flat sidebar nav (remove collapsible groups) | Chameleon reference uses flat list, cleaner UX with 3 items | ✓ Good — simpler code, cleaner visual hierarchy |
| Task categories reuse habit category tokens | Same visual intent (work=learning blue, personal=wellness purple) | ✓ Good — unified token system, no category token duplication |
| Sidebar width 224px with 60px collapsed rail | Matched Chameleon reference measurements | ✓ Good — pixel-matched design reference |
| API-layer is_completed/status sync (not DB trigger) | Testable in unit tests, explicit sync points | ✓ Good — 23 TDD tests, sync-at-mutation-point pattern |
| Float-based sort_order for kanban | Single-row updates for reordering, no renumbering | ✓ Good — 65536.0 gap spacing, infrastructure for future reorder |
| @dnd-kit/core v6 over @dnd-kit/react v0.3.x | Stable API vs pre-1.0 experimental | ✓ Good — reliable drag-drop, well-documented |
| SWR as single source of truth for kanban state | No dual local+server state, optimistic mutations with rollback | ✓ Good — clean data flow, rollbackOnError:true handles failures |
| ON DELETE SET NULL for project_id FK | Deleted projects orphan tasks as standalone, not cascade delete | ✓ Good — preserves task history, user expectation |
| Section change clears project_id silently | No confirmation needed, natural form behavior | ✓ Good — clean UX, no modal interruption |
| next/dynamic ssr:false for KanbanBoard and Tiptap | Avoid hydration issues with complex client libraries | ✓ Good — fixes Next.js 16 build, clean client-only boundary |
| Tiptap JSONB storage over TEXT | Rich text needs structure for rendering, not plain text | ✓ Good — lossless round-trip, enables content extraction |
| Supabase .upsert() with onConflict for journal | One-entry-per-day at DB level, no client-side race conditions | ✓ Good — atomic enforcement, POST always returns 201 |
| Debounced autosave (2s) with sendBeacon fallback | Balance save frequency vs API load; sendBeacon catches nav-away | ✓ Good — reliable save with minimal network chatter |
| Hardcoded prompts with i18n keys (not database) | Static content, no admin UI needed, i18n via existing system | ✓ Good — zero runtime overhead, culturally appropriate translations |
| Dashboard widget routes to /journal (not inline editing) | Keep widget simple, journal page is the writing surface | ✓ Good — clear separation, widget as entry point |
| Streak starts from yesterday if today has no entry | Preserves count during the day before user writes | ✓ Good — no "streak reset" anxiety during the day |
| On This Day fixed offsets (30d, 90d, 1y) | Predictable, meaningful reflection intervals | ✓ Good — simple computation, relatable time periods |
| Link chip colors by type (teal/blue/purple) | GitHub-label-style visual grouping by entity type | ✓ Good — instant visual category recognition |
| i18n parity test (bidirectional key check) | Catch missing and orphan keys automatically | ✓ Good — prevents locale drift, catches both directions |
| Canonical kg storage (weight_kg NUMERIC(7,2)) | Prevents data corruption on unit switches; convert to user preference on display only | ✓ Good — clean separation of storage vs display |
| Seed preset exercises via migration SQL | Avoids 5s+ latency the lazy-seed pattern would cause at 80-120 rows | ✓ Good — 92 exercises seeded, zero runtime cost |
| Dual-write active workout (server + localStorage) | Prevents session loss on browser refresh/crash | ✓ Good — seamless resume with fallback |
| On-demand PR computation (no personal_records table) | Acceptable for <500 workouts per exercise; avoids expensive backfill | ✓ Good — simple, correct, deferrable optimization |
| Copy-on-start for routine → workout | Editing routine after starting workout doesn't affect in-progress session | ✓ Good — clean data isolation |
| EXERCISE_FIELD_MAP for type-aware tracking | Single source of truth for which fields apply to each exercise type | ✓ Good — reused across workout logger, routines, history, PR detection |
| Remove in_progress guard from save-as-routine | Exercises and sets exist regardless of workout status | ✓ Good — fixed finish dialog timing bug |

---
*Last updated: 2026-02-27 after v4.0 Journal + v5.0 Fitness Tracking milestones merged*
