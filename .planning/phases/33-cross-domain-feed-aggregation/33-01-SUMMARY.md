# Plan 33-01 Summary

## What was built

### Feed Types & Aggregation Logic
- `lib/calendar/feed-types.ts` — `CalendarFeedItem` type, `FeedSource` union, `DOMAIN_COLORS` constant mapping each domain to its design-spec color (teal/blue/amber/red/purple)
- `lib/calendar/feed-aggregation.ts` — Pure computation module with 6 exported functions:
  - `aggregateEventsForFeed()` — converts expanded calendar events
  - `aggregateTasksForFeed()` — converts tasks with due_date in range
  - `aggregateHabitsForFeed()` — creates items for each day shouldTrackOnDate returns true, with completion status from logs
  - `aggregateBillsForFeed()` — converts active bills with next_due_date in range
  - `aggregateWorkoutsForFeed()` — converts completed workouts with computed end_time from duration
  - `mergeFeedItems()` — sorts by date, all-day first, then start_time

### Feed API Endpoint
- `app/api/calendar/feed/route.ts` — GET endpoint accepting `start_date`, `end_date`, and optional `layers` parameter
  - Queries all 5 domains in parallel using Promise.all
  - Bills fetched via household resolution (graceful fallback on failure)
  - Server-side layer filtering — only queries enabled domains
  - Returns merged, sorted `CalendarFeedItem[]`

### Calendar UI Integration
- `components/calendar/calendar-page-content.tsx` — Fetches from both `/api/calendar-events` and `/api/calendar/feed`, merges feed items into the event stream
  - Layer toggle state lifted to page content level
  - Feed items converted to ExpandedCalendarEvent shape for existing view rendering
  - Both SWR keys mutated on event save
- `components/calendar/calendar-sidebar.tsx` — All 5 domain layer toggles enabled (removed "coming soon" state)
  - LAYERS exported for use by parent and tests
  - enabledLayers and onToggleLayer now controlled props

### i18n
- Added `calendar.feed.*` keys in all 3 locales (en, zh, zh-TW) for inline action labels

### Tests
- 20 unit tests for all aggregation functions (date filtering, frequency handling, completion status)
- 6 API route tests (auth, validation, multi-domain response, layer filtering, bill failure)
- Fixed 3 existing default-view tests (added LAYERS to mock)

## Metrics
- **New tests:** 26
- **Total tests passing:** 2981
- **Files created:** 5
- **Files modified:** 6
- **Test files:** 242 passing

## Decisions
- Feed items are converted to ExpandedCalendarEvent shape so existing month/week/day views render them without changes
- Bills use `user_status === "confirmed"` as the "paid" indicator (no new DB column needed)
- Workout times extracted from `started_at` ISO string; end_time computed from duration_seconds
- Habits only show for "active" status (paused/archived excluded)
- Layer filtering happens server-side via the `layers` query param
