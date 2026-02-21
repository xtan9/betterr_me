# Work Log

Track daily changes and progress on the BetterR.me project.

## 2026-02-21
### Projects & Kanban, Recurring Tasks Polish, Dashboard Fixes

#### Pull Requests Merged
- **PR #283**: feat: v3.0 Projects & Kanban — MERGED
  - Added projects system with Kanban board view
  - Major feature addition for task organization
- **PR #284**: fix: address code review issues from PR #283 — MERGED
  - Follow-up fixes from code review on Projects & Kanban
- **PR #282**: feat: add View All buttons + sort/gray completed habits — MERGED
  - Dashboard habits section now has View All navigation
  - Completed habits sorted to bottom and grayed out
- **PR #280**: feat: RecurrenceRule types, i18n describeRecurrence, test coverage — MERGED
  - Refactored RecurrenceRule to TypeScript discriminated union
  - Added i18n-aware `describeRecurrence()` for all three locales
  - Added test coverage for recurring tasks (DB, API, components)
  - Closes issues #269, #270, #271
- **PR #281**: fix: show completion count for visible tasks only — MERGED

---

## 2026-02-19 – 2026-02-20
### Dashboard Task Fixes & Absence Tracking Improvements

#### Pull Requests Merged
- **PR #275**: fix: hide completed tasks from dashboard "Today's Tasks" — MERGED
- **PR #276**: fix: show tasks completed today in dashboard — MERGED
  - Follow-up to #275: completed-today tasks still visible but styled differently
- **PR #277**: fix: sidebar badge counts include completed tasks and don't refresh — MERGED
- **PR #278**: fix: week-based absence tracking for non-daily habits — MERGED
  - Fixed absence computation for `times_per_week` and `weekly` habits
- **PR #279**: refactor: redesign absence card as dismissable reminder — MERGED
  - Changed absence cards from recovery-focused to gentle dismissable reminders
- **PR #274**: docs: reorganize PRDs and create master PRD V2 — MERGED

---

## 2026-02-18
### Recurring Tasks, UI Redesign & Polish

#### Pull Requests Merged
- **PR #267**: feat: UI style redesign — sidebar, card-on-gray, dark mode polish — MERGED
  - Replaced top nav with collapsible sidebar navigation
  - Card-on-gray layout pattern for content areas
  - Dark mode color refinements
- **PR #268**: feat: recurring tasks — template + on-demand instance generation — MERGED
  - Added recurring task system with template-based design
  - On-demand instance generation (instances created when needed, not upfront)
- **PR #272**: refactor: remove /tasks/recurring page, inline paused banner — MERGED
  - Simplified recurring task UX by removing separate page
- **PR #273**: v2.1 UI Polish & Refinement — MERGED
  - Follow-up polish pass on UI redesign
- **PR #266**: fix: stop full page re-render on habit/task toggle — MERGED
  - Performance fix: isolated re-renders to toggled components only

---

## 2026-02-17
### Codebase Hardening & Performance

#### Pull Requests Merged
- **PR #263**: v1.0 Codebase Hardening — MERGED
  - WeeklyInsight discriminated union refactor
  - Type safety improvements across codebase
- **PR #264**: fix: v1.1 Dashboard Task Fixes — MERGED
  - Bug fixes for dashboard task display
- **PR #265**: Fix slow habit toggle with optimistic UI and double-click protection — MERGED
  - Added optimistic updates for instant UI feedback on habit toggle
  - Double-click protection to prevent duplicate API calls

---

## 2026-02-15 – 2026-02-16
### Weekly Insights, Code Quality & CI

#### Pull Requests Merged
- **PR #256**: feat: add weekly insights computation + API route (#232) — MERGED
  - Behavioral pattern recognition engine for weekly habit/task analysis
  - API route for weekly insight data
- **PR #244**: feat: add weekly insight card to dashboard (#232) — MERGED
  - Dashboard UI card displaying weekly behavioral insights
  - Closes issue #232
- **PR #254**: fix: address PR #242 review issues (reflection strip) — MERGED
- **PR #257**: fix: correct getWeekKey JSDoc — returns YYYY-MM-DD, not YYYY-WW — MERGED
- **PR #258**: fix: add fallback color for out-of-range task priority — MERGED
- **PR #259**: refactor: separate AbsenceData from HabitWithTodayStatus — MERGED
  - Cleaner type separation for absence tracking data
- **PR #260**: fix: isolate supplementary dashboard queries from core data — MERGED
  - Milestone/log query failures no longer break core dashboard loading
- **PR #261**: test: regenerate visual regression baselines, remove skip — MERGED
- **PR #262**: ci: add concurrency groups to prevent E2E data pollution — MERGED

#### Issues Closed
- #232: H3 — Weekly insight card with behavioral pattern recognition
- #246: Regenerate visual regression test baselines
- #247: Add fallback for priority color lookup
- #248: SWR fetcher should check res.ok before parsing JSON
- #249: Separate supplementary queries from core dashboard Promise.all
- #250: Refactor HabitWithTodayStatus to separate absence fields
- #251: Fix getWeekKey comment
- #252: Investigate times_per_week semantics in absence computation
- #253: Dashboard fetcher doesn't check response.ok

---

## 2026-02-11 – 2026-02-14
### Vertical Depth Features: Milestones, Reflection, Difficulty

#### Pull Requests Merged
- **PR #237**: feat: add absence computation to dashboard API (#229) — MERGED
- **PR #238**: feat: add absence recovery cards to dashboard (#229) — MERGED
  - "Never miss twice" — recovery cards for habits missed yesterday
  - Closes issue #229
- **PR #239**: feat: add milestones table and toggle integration (#230) — MERGED
  - New `milestones` DB table for streak milestone tracking
- **PR #240**: feat: add milestone card and next milestone indicator (#230) — MERGED
  - Dashboard celebration cards when milestones are hit
  - Closes issue #230
- **PR #241**: feat: add completion difficulty column to tasks (#231) — MERGED
  - Backend: difficulty enum on tasks table
- **PR #242**: feat: add reflection strip UI for task completion (#231) — MERGED
  - Post-completion reflection UI for meaningful tasks
  - Closes issue #231

#### Issues Closed
- #227: T1 — "Why This Matters" intention field for tasks
- #228: T4 — "Task Horizon" coming up section on dashboard
- #229: H1 — Absence-aware recovery cards
- #230: H2 — Streak milestones & celebrations
- #231: T3 — Completion reflection strip

---

## 2026-02-10
### Vertical Depth Strategy & Task Enhancements

#### Pull Requests Merged
- **PR #236**: feat: add Coming Up section for tomorrow tasks (#228) — MERGED
  - Dashboard section showing tasks due tomorrow
- **PR #233**: feat: T1 intention field — backend (migration + types + validation) — MERGED
  - Added `intention` text field to tasks for "Why This Matters"
- **PR #234**: feat: T1 intention field — frontend (form + detail + dashboard) — MERGED
  - UI for viewing/editing task intention in forms and detail page
- **PR #235**: feat: add tomorrow tasks to dashboard API (#228) — MERGED
- **PR #245**: fix: E2E seed bug + performance optimization — MERGED
  - Fixed E2E data seeding race condition
  - SSR data fetching, skeleton loading, preconnect hints
- **PR #225**: feat: tasks list page, clickable dashboard tasks, nav restructuring — MERGED
  - Full `/tasks` list page
  - Dashboard tasks now link to detail pages
  - Navigation restructured: Tasks replaces Settings in main nav
  - Closes issues #222, #223, #224
- **PR #226**: docs: Vertical Depth strategy — PRD and Eng Plan — MERGED
  - Product requirements and engineering plan for depth-focused features

---

## 2026-02-09
### Next.js 16 Upgrade, UI/UX Redesign V2 & New Pages

#### Pull Requests Merged
- **PR #193**: chore: move skills, plugins & hooks to project scope — MERGED
- **PR #192**: feat: reuse storageState for Playwright auth — MERGED
  - Performance improvement: auth state reused across E2E tests
- **PR #197**: fix: resolve E2E test failures with parallel workers — MERGED
- **PR #196**: fix: add /tasks/new page to resolve 404 — MERGED
- **PR #199**: refactor: introduce POM, reduce responsive redundancy, add visual regression — MERGED
  - Page Object Model pattern for E2E tests
  - Visual regression testing infrastructure
- **PR #200**: docs: Next.js 16 upgrade engineering plan — MERGED
- **PR #201**: docs: UI Design V2 and Engineering Plan V2 — MERGED
- **PR #204**: fix: resolve pre-existing test failures and lint warnings — MERGED
- **PR #203**: feat: upgrade Next.js from 15.5.8 to 16.1.6 — MERGED
  - Major framework upgrade with all tests passing
  - Closes issue #202
- **PR #216**: feat: UI/UX Redesign V2 — MERGED
  - Mobile bottom navigation
  - Lexend display font
  - Emerald primary color system
  - Enhanced stat cards with icon circles
  - Celebration state for all habits complete
  - Habit card monthly progress bar and micro-interactions
  - Fixed broken profile dropdown links and duplicate titles
  - Closes issues #205–#215
- **PR #220**: feat: Profile editing form (name, avatar) — MERGED
  - Settings page profile editing with name and avatar upload
  - Closes issue #218
- **PR #219**: feat: Task detail and edit pages — MERGED
  - `/tasks/[id]` detail page and `/tasks/[id]/edit` page
  - Closes issue #217
- **PR #221**: fix: update e2e tests for task detail/edit pages and profile form — MERGED

#### Issues Closed
- #202: Upgrade Next.js from 15.5.8 to 16.1.6
- #205–#215: UI/UX Redesign V2 sub-issues (mobile nav, font, colors, stat cards, celebrations, progress bar, micro-interactions, profile dropdown fix, duplicate title fix, color alignment)
- #217: Task detail and edit pages
- #218: Profile editing form

---

## 2026-02-08
### Bug Fixes & Cleanup

#### Pull Requests Created
- **PR #181**: Fix: Use local timezone for habit completion dates — MERGED
  - Created `getLocalDateString()` utility in `lib/utils.ts` using browser-local date (not UTC)
  - Updated `dashboard-content.tsx` and `habits-page-content.tsx` to use local date in SWR keys and toggle requests
  - Updated `data-export.tsx` to use local dates for export filenames and date ranges
  - Added `keepPreviousData: true` to SWR configs to prevent skeleton flash at midnight
  - 8 new tests (6 unit for getLocalDateString, 2 SWR key verification)
  - Closes issue #180

- **PR #183**: Refactor: Remove unused timezone preference setting — MERGED
  - Deleted `timezone-selector.tsx` component and its 228-line test file
  - Removed timezone from settings UI, API validation, DB types, i18n (3 locales), and migration default
  - Kept `HabitReminder.timezone` (separate per-reminder feature)
  - Net -433 lines across 12 files
  - Closes issue #182

#### Issues Created
- **#180**: Bug: Habit completion status ignores user timezone (CLOSED by PR #181)
- **#182**: Remove unused timezone preference setting (CLOSED by PR #183)

#### Technical Notes
- Root cause: `new Date().toISOString().split("T")[0]` returns UTC date, not local. At 11pm PST, this returns tomorrow's UTC date.
- Fix: `getLocalDateString()` uses `getFullYear()/getMonth()/getDate()` which return browser-local values
- Timezone preference was stored in DB but never actually used — dead code after switching to client-local dates
- SWR key includes date string, so cache misses at midnight. `keepPreviousData: true` keeps old data visible while fetching.

---

## 2026-02-07
### CI & Dependency Fixes

#### Pull Requests Created
- **PR #170**: Lighthouse CI improvements — shared config, settings page, auth tests — MERGED
  - Fixed credential check order in `lighthouse-auth.js` (path check before cred check)
  - Added test for public paths not requiring credentials
  - 10 total tests for lighthouse auth

- **PR #178**: Refactor: Use two-job pattern for workflow secret checks — MERGED
  - Replaced inline `if:` conditions with reusable two-job pattern (check-secrets → conditional job)

- **PR #179**: Feat: Migrate to unified radix-ui package — MERGED
  - Regenerated `pnpm-lock.yaml` to match `"radix-ui": "^1.4.3"` in package.json
  - All 652 tests passed
  - Replaced PR #177 which had lockfile/package.json mismatch

#### E2E Test Fixes
- **PR #171**: Fix stale selectors in create-habit tests — MERGED
- **PR #172**: Fix habit completion toggle tests with stable selectors — MERGED
- **PR #173**: Prevent horizontal overflow on mobile viewports — MERGED
- **PR #174**: Fix accessibility keyboard nav and touch target tests — MERGED
- **PR #175**: Fix mobile responsive layout tests — MERGED

#### Issues Addressed
- #153: Lighthouse CI improvements
- #162: Refactor workflow secret checks
- #165-168: E2E test failures (selectors, toggles, overflow, a11y, responsive)
- #176: Upgrade Radix UI

---

## 2026-02-06
### Stats & Infrastructure

#### Pull Requests Created
- **PR #152**: Optimize stats calculation with COUNT queries and composite index — MERGED
- **PR #155**: Refactor E2E workflow to skip steps instead of entire job — MERGED
- **PR #158**: Fix dashboard showing welcome screen after habit creation — MERGED
- **PR #159**: Migrate API routes from DB singletons to server-client instances — MERGED
- **PR #160**: Fix performance workflow to skip steps instead of job — MERGED
- **PR #161**: Run chromium-only E2E on PRs, full matrix on main/schedule — MERGED
- **PR #163**: Show both habit and task CTAs in dashboard empty state — MERGED

#### Issues Addressed
- #154: Refactor API routes from DB singletons to server-client instances
- #156: E2E tests timeout in CI
- #157: Dashboard shows welcome screen after creating first habit

---

## 2026-02-05
### Epic 7: Settings & Polish (In Progress)

#### Pull Requests Created
- **PR #115**: Add timezone selector to Settings page (SET-001) - MERGED
  - Created `/dashboard/settings` page with timezone configuration
  - Added TimezoneSelector component with searchable dropdown (Command/Popover pattern)
  - Added Settings link to main navigation
  - Full i18n support (en, zh, zh-TW)
  - Added ResizeObserver and scrollIntoView mocks for cmdk testing
  - 12 tests for TimezoneSelector component
  - Uses existing `/api/profile/preferences` endpoint for persistence

- **PR #116**: Add week start day setting (SET-002) - MERGED
  - Added WeekStartSelector component with Sunday/Monday toggle
  - Integrated into Settings page below timezone
  - Full i18n support (en, zh, zh-TW)
  - 9 tests for WeekStartSelector component
  - Stores preference as week_start_day (0=Sunday, 1=Monday)

- **PR #117**: Add data export feature (SET-003)
  - Added CSV export utilities for habits and logs
  - Server-side export API endpoint (/api/export)
  - DataExport component with export buttons
  - Full i18n support (en, zh, zh-TW)
  - 17 tests (10 CSV utilities, 7 component tests)
  - CSV format compatible with Excel/Google Sheets

#### Issues Addressed
- #100: SET-001 - Add timezone selector to Settings UI
- #101: SET-002 - Add week start day setting
- #102: SET-003 - Implement data export (CSV)

#### Technical Notes
- Used `Intl.supportedValuesOf("timeZone")` for IANA timezone list
- Displays timezone with GMT offset (e.g., "America / New York (GMT-5)")
- SWR for data fetching with automatic revalidation

---

### Epic 5: Habit Pages (Complete)

#### Pull Requests Created
- **PR #86**: Dashboard Integration with Real Data (DASH-005/006/007)
  - Created DashboardContent client component with SWR data fetching
  - Added loading skeleton (DASH-007)
  - Added empty state for new users (DASH-006)
  - i18n translations for greeting, empty, loading, error states
  - 5 tests

- **PR #87**: Habits List Page and Navbar Navigation (PG-001, PG-005)
  - Created HabitsPageContent with tabs (active/paused/archived)
  - Created MainNav component with active state styling
  - Updated dashboard and habits layouts
  - 5 tests

- **PR #88**: Create and Edit Habit Pages (PG-002, PG-004)
  - `/habits/new` page with CreateHabitContent
  - `/habits/[id]/edit` page with EditHabitContent
  - SWR data fetching for edit with loading/error states
  - 11 tests

- **PR #89**: Habit Detail Page (PG-003)
  - `/habits/[id]` page with streak counter, stats, heatmap
  - Pause/Resume, Archive, Delete actions
  - Reuses StreakCounter and Heatmap30Day components
  - 7 tests

- **PR #90**: i18n Audit (PG-006)
  - Fixed hardcoded category and frequency labels
  - Added getFrequencyTranslation() helper for i18n
  - Updated habit-card and habit-row components

#### Review Comments Added
All PRs reviewed with code review notes:
- Layout duplication between dashboard and habits (follow-up refactor suggested)
- Error handling uses console.error (toast notifications suggested)
- Confirmation dialogs use window.confirm (AlertDialog suggested)
- Mobile navigation hidden (follow-up task)

### Issues Closed by PRs
- #75, #76, #77 (DASH-005/006/007)
- #79, #83 (PG-001, PG-005)
- #80, #82 (PG-002, PG-004)
- #81 (PG-003)
- #84 (PG-006)

---

## 2026-01-31
- Set up Figma MCP (Model Context Protocol) integration for design-to-code workflow
- Explored Figma Code Connect capabilities
- Researched Claude Pro subscription model and rate limits
- Debugged terminal keybindings (shift+enter for multi-line input)
- Installed `git-daily-work-report` skill for automated daily work summaries
- Created WORKLOG.md for tracking daily development progress

## 2026-01-30
### Feature Development
- **API Routes Implementation (#6)**
  - Built REST API for profile management (`/api/profile`, `/api/profile/preferences`)
  - Implemented Tasks API with full CRUD operations (`/api/tasks`, `/api/tasks/[id]`)
  - Added task toggle endpoint for quick complete/incomplete actions
  - Implemented query parameter filtering (status, priority, date ranges)
  - Refactored to use query params instead of separate endpoints
  - Total: 11 files changed, 1,146 insertions

### Testing & Quality Assurance
- **Frontend Tests (#7)**
  - Added comprehensive login form tests (186 lines)
  - Covered form validation, user interactions, error handling
- **API Route Tests**
  - Profile API tests (107 lines)
  - Profile preferences tests (107 lines)
  - Tasks CRUD tests (139 lines)
  - Tasks special routes tests (137 lines)
  - Individual task operations tests (131 lines)

### Database Layer (#4)
- Created database utility functions in `/lib/db/`
  - `profiles.ts` - Profile query utilities (60 lines)
  - `tasks.ts` - Task query utilities (179 lines)
- Defined comprehensive TypeScript types (`database.ts` - 289 lines)
- Set up Vitest testing framework with mock Supabase client
- Added database utilities tests (362 lines total)
- Total: 12 files, 2,791 insertions

### CI/CD
- Set up GitHub Actions workflow for automated testing
- Configured test pipeline for continuous integration

### Bug Fixes
- Fixed Vercel PR check issues (TypeScript configuration updates)

## 2026-01-29
- Database Schema - Initial Setup (#2)
- Project initialization with Next.js 15 and Supabase

---

## Format
- Use `## YYYY-MM-DD` for each day
- Bullet points for changes, features, or discoveries
- Reference PRs with `#N` format
- Update when making significant changes or at end of day
