# Work Log

Track daily changes and progress on the BetterR.me project.

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
