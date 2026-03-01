# BetterR.Me

## What This Is

A habit tracking, project management, and personal finance web app built with Next.js 16, Supabase, and TypeScript. Supports habits (daily/weekdays/weekly/times_per_week/custom), task management with Work/Personal sections and named projects, 4-column kanban boards per project, streaks, weekly insights, and data export. Full money tracking with Plaid bank connections, transaction management with auto-categorization, monthly budgets with spending analytics, bill/subscription detection, savings goals, net worth tracking, couples/household support with privacy controls, future-first dashboard with cash flow projections, and contextual AI insights. Three locales (en, zh, zh-TW), dark mode with semantic design tokens, deployed to Vercel.

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
- ✓ Household schema with RLS, money arithmetic (BIGINT cents + decimal.js), admin client, lazy household creation — v4.0
- ✓ Plaid bank connections: OAuth flow, Vault-encrypted tokens, JWT/ES256 webhook verification, cursor-based sync, Vercel Cron — v4.0
- ✓ Transaction list with search, filters (date/amount/category/account), cursor pagination — v4.0
- ✓ Auto-categorization (16 PFCv2 categories), merchant rules, category overrides, custom categories, transaction splitting — v4.0
- ✓ CSV import with column mapping, duplicate detection, and manual transaction entry — v4.0
- ✓ Monthly budgets per category with progress rings, donut/bar charts, drill-down, and rollover — v4.0
- ✓ Bill auto-detection from transaction patterns, bill calendar, manual bill entry — v4.0
- ✓ Savings goals with target/deadline, progress rings, projected completion dates — v4.0
- ✓ Net worth tracking (assets minus liabilities) with line chart over time, manual assets — v4.0
- ✓ Household/couples: partner invitation, mine/household views, account visibility (mine/ours/hidden), shared budgets/goals — v4.0
- ✓ Future-first dashboard: available money, upcoming bills, projected balance, income detection — v4.0
- ✓ Contextual AI insights: spending anomalies, price increases, goal progress, anxiety-aware framing — v4.0
- ✓ Money summary card on main BetterR.Me dashboard — v4.0
- ✓ CSV export with date range, full data deletion with Plaid revocation — v4.0
- ✓ Calm Finance design tokens for money views (muted teal/amber, no red/green) — v4.0
- ✓ All money UI strings in en, zh, zh-TW — v4.0

### Active

(No active requirements — next milestone not yet defined)

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
- AI chatbot for financial advice — SEC/FINRA compliance risk, LLM hallucination liability
- Bill negotiation service — operational complexity, legal liability
- Investment advisory / robo-advisor — SEC/FINRA registration required
- Multi-currency support — massive complexity, US-focused for now
- Automatic bill payment — money transmitter licensing, ACH complexity
- Envelope budgeting (YNAB-style) — high complexity, niche audience
- Receipt scanning / OCR — specialized feature, separate scope
- Stripe/freemium billing — build features first, add billing in future milestone

## Context

- **Codebase:** 77,070 LOC TypeScript, 323+ files, Next.js 16 App Router, Supabase backend, deployed to Vercel
- **Test suite:** 1207+ tests (Vitest + Playwright), 50% coverage threshold
- **Shipped:** v1.0 Codebase Hardening (2026-02-16) — 5 phases, 11 plans, 26 requirements
- **Shipped:** v1.1 Dashboard Task Fixes (2026-02-17) — 1 phase, 1 plan, 3 requirements
- **Shipped:** v2.0 UI Style Redesign (2026-02-17) — 9 phases, 21 plans, 28 requirements
- **Shipped:** v2.1 UI Polish & Refinement (2026-02-18) — 3 phases, 6 plans, 8 requirements
- **Shipped:** v3.0 Projects & Kanban (2026-02-21) — 5 phases, 12 plans, 17 requirements
- **Shipped:** v4.0 Money Tracking (2026-02-28) — 9 phases, 38 plans, 66 requirements
- **Money feature origin:** Brainstormed as separate "moneyy.me" project, incorporated into BetterR.Me
- **Codebase map:** `.planning/codebase/` (7 documents from 2026-02-15 audit — may need refresh after v4.0)
- **Known:** Vitest picks up .worktrees/ test files (spurious, not blocking)
- **Known:** @dnd-kit/core v6 + React 19 peer dep mismatch (cosmetic, works correctly)
- **Known:** Plaid API costs ~$1-2/connected account/month — monitor unit economics
- **Known:** 7 household human verification items pending live two-user testing

## Constraints

- **Tech stack:** Next.js 16, Supabase, TypeScript, pnpm
- **Bank data:** Plaid API for account connections
- **Money arithmetic:** decimal.js for all currency calculations (never native JS floats)
- **Design:** Calm Finance principles for money views (muted tones, forward-looking framing)
- **Billing:** No Stripe/freemium in this milestone — all features free
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
| next/dynamic ssr:false for KanbanBoard | Avoid hydration issues with drag-and-drop library | ✓ Good — fixes Next.js 16 build, clean client-only boundary |

| Keep Supabase for money features | BetterR.Me already uses Supabase auth+DB; no need for Better Auth+Drizzle+Neon | ✓ Good — unified auth/DB, Vault for Plaid encryption, RLS for data isolation |
| Plaid for bank connections | Best US coverage (12,000+ institutions), industry standard | ✓ Good — OAuth flow, webhooks, PFCv2 categorization all working |
| Calm Finance for money views only | BetterR.Me design + Calm Finance principles (no red/green, forward framing) for finance UI | ✓ Good — muted teal/amber palette, anxiety-aware language, users feel calm not judged |
| No billing in v4.0 | Build features first, add Stripe/freemium in future milestone | ✓ Good — 66 features shipped without billing complexity |
| decimal.js for money arithmetic | JavaScript floats break at 0.1 + 0.2; financial data requires exact arithmetic | ✓ Good — BIGINT cents in DB, decimal.js at API boundary, zero precision errors |
| Couples/household from day one | Core differentiator; household_id in schema from first migration | ✓ Good — mine/ours/hidden views, shared budgets/goals, solo-to-couple transition seamless |
| IN-subquery RLS pattern | 99.78% faster than JOIN-based RLS per Supabase docs | ✓ Good — all money tables use this pattern, consistent and performant |
| Plaid access tokens in Supabase Vault | Encryption at rest required for financial data | ✓ Good — Vault wrapper functions with SECURITY DEFINER for PostgREST access |
| Cursor-based Plaid sync | Idempotent partial progress, safe for serverless timeouts | ✓ Good — sync_cursor persisted per connection, Vercel Cron handles background |
| Pure computation modules for insights | No DB imports in lib/money/projections, income-detection, insights | ✓ Good — testable pure functions, all inputs are typed args |
| SWR deduplication for household state | useHousehold() per-component, no context provider needed | ✓ Good — simpler than React context, SWR handles cache automatically |

---
*Last updated: 2026-02-28 after v4.0 milestone completed*
