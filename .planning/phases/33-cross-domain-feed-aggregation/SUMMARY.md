# Phase 33 — Cross-Domain Feed Aggregation — SUMMARY

## Plan 33-04: Inline Actions, Feed Integration & Tests

### What was done

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | CalendarFeedItem type + DOMAIN_COLORS | `lib/calendar/feed-types.ts` | Done |
| 2 | Feed normalizers + aggregation utilities | `lib/calendar/feed-aggregation.ts` | Done |
| 3 | Unified `/api/calendar/feed` API route | `app/api/calendar/feed/route.ts` | Done |
| 4 | `useCalendarActions` hook for inline mutations | `hooks/use-calendar-actions.ts` | Done |
| 5 | Wire feed + actions into calendar UI | `components/calendar/calendar-page-content.tsx`, `calendar-sidebar.tsx`, `event-chip.tsx`, `event-block.tsx` | Done |
| 6 | i18n strings for inline actions | `i18n/messages/{en,zh,zh-TW}.json` | Done |
| 7 | Tests for feed aggregation, API, and actions | `tests/lib/calendar/feed-aggregation.test.ts`, `tests/app/api/calendar/feed/route.test.ts`, `tests/hooks/use-calendar-actions.test.ts` | Done |
| 8 | Lint fixes | Removed unused code | Done |

### Architecture Decisions

- **Separate feed API**: `/api/calendar/feed` fetches all domain data in parallel, filtered by `layers` query param
- **DomainCalendarEvent**: Extended type carries `_domain`, `_completed`, `_actions`, `_sourceId` metadata for domain rendering
- **Layer state lifted**: enabledLayers state moved from CalendarSidebar to CalendarPageContent for data-fetching coordination
- **Domain colors via CSS variables**: Existing `--calendar-{domain}` / `--calendar-{domain}-muted` variables in globals.css (already defined for both light/dark mode)
- **Inline action dispatch**: useCalendarActions hook wraps existing API endpoints (task toggle, habit toggle, bill dismiss, workout navigation)

### Metrics

- **Tests added**: 40 (2955 -> 2995 total)
- **Files changed**: 11 (5 new, 6 modified)
- **Commits**: 8 atomic commits

### Verification

- All 2995 tests pass (`npx vitest run`)
- ESLint clean on all changed files
- CSS domain color variables already exist in globals.css (both light and dark themes)
