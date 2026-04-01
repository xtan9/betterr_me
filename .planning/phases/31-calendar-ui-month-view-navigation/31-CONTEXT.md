# Phase 31: Calendar UI — Month View & Navigation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

First visible calendar page with month grid, sidebar with mini-cal and layer toggles, and core navigation (prev/next, today, view switcher). This phase delivers the Month view only — Day and Week views are separate phases. No event creation/editing UI in this phase (API-only from Phase 30).

</domain>

<decisions>
## Implementation Decisions

### Page Structure
- **D-01:** New route at `app/calendar/page.tsx` (server component) with a client component `CalendarPage` that manages view state and date navigation.
- **D-02:** Layout follows the existing app pattern — uses the shared sidebar layout from `app/dashboard/layout.tsx` or equivalent. Calendar gets its own sidebar content (mini-cal + layer toggles).
- **D-03:** Add "Calendar" to the main sidebar navigation (next to Dashboard, Habits, Tasks, etc.).

### Month Grid
- **D-04:** Standard 7-column month grid (Sun-Mon-Tue-Wed-Thu-Fri-Sat headers, respecting user's `week_start_day` preference from profile).
- **D-05:** Day cells show up to 3 event chips with "+N more" overflow pill when more events exist.
- **D-06:** Clicking a day cell navigates to Day view for that date (deep link via URL param).
- **D-07:** Today's cell has a visual highlight (e.g., teal ring/background using primary design token).
- **D-08:** Days outside the current month are shown dimmed.

### Navigation Header
- **D-09:** Header bar with: "Today" button (left), prev/next arrows, month+year title (center), Day/Week/Month pill toggle (right).
- **D-10:** Day/Week/Month toggle is a pill group (similar to shadcn Tabs or ToggleGroup). Month is active in this phase; Day/Week are placeholder stubs that navigate but show "Coming soon" or empty state.
- **D-11:** URL-driven state: `?view=month&date=2026-04-01` so navigation is shareable and back-button works.

### Sidebar
- **D-12:** Left sidebar content: mini month calendar (reuse shadcn `Calendar` component), layer toggle checkboxes for domain visibility (Events, Tasks, Habits, Bills, Workouts).
- **D-13:** Layer toggles use domain color coding from design spec (teal=events, blue=tasks, amber=habits, red=bills, purple=workouts). Only "Events" layer is functional in this phase — others are visual placeholders.
- **D-14:** "+ New Event" button in sidebar — placeholder in this phase (no event form yet).

### Data Fetching
- **D-15:** Use SWR to fetch events from `GET /api/calendar-events?start_date=...&end_date=...` for the displayed month range. SWR key includes the date range for automatic refetch on navigation.
- **D-16:** Fetch the full month plus padding days (e.g., if month starts on Wednesday, fetch from the preceding Sunday to include visible days from prior month).

### Responsive Design
- **D-17:** Desktop: sidebar visible, full month grid. Mobile: sidebar hidden (collapsible or sheet), month grid with compact day cells.
- **D-18:** Default view: Week on desktop, Day on mobile (per design spec). Phase 31 implements Month view — the default view routing is a stub that shows Month for now.

### Design Tokens
- **D-19:** Use existing BetterR.Me design tokens throughout. Primary teal for event color, `rounded-xl` for cards, semantic dark mode variables. No custom colors.
- **D-20:** Event chips: small rounded pills with domain color left border or background. Follow the design spec color mapping.

### i18n
- **D-21:** All UI strings (month names, day abbreviations, "Today", "Events", etc.) must use `useTranslations()` with keys in all 3 locale files (en, zh, zh-TW).

### Claude's Discretion
- Component file organization (flat vs nested in `components/calendar/`)
- Exact chip sizing and overflow behavior details
- Mini calendar interaction (click to navigate month)
- Animation/transition between months

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Full design spec including Calendar UI section, design tokens, domain color coding, view layouts

### Existing UI Patterns
- `app/dashboard/page.tsx` — Reference for page structure with sidebar
- `app/habits/page.tsx` — Reference for domain page with SWR data fetching
- `components/ui/calendar.tsx` — Shadcn mini calendar component (reuse for sidebar)
- `components/ui/toggle-group.tsx` — Shadcn toggle group (if exists, for view switcher)
- `components/layouts/sidebar-nav.tsx` — Sidebar navigation for adding Calendar link

### API (Phase 30 outputs)
- `app/api/calendar-events/route.ts` — GET endpoint with date range params + recurrence expansion
- `lib/calendar/recurrence.ts` — `ExpandedCalendarEvent` type (what the API returns)

### i18n
- `i18n/messages/en.json` — English locale (add calendar keys)
- `i18n/messages/zh.json` — Chinese simplified locale
- `i18n/messages/zh-TW.json` — Chinese traditional locale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/calendar.tsx` — Shadcn Calendar component for mini month picker in sidebar
- `components/ui/button.tsx`, `badge.tsx`, `toggle-group.tsx` — For navigation controls
- `lib/fetcher.ts` — SWR fetcher function
- Design token CSS variables in `globals.css` — All colors, spacing, typography ready

### Established Patterns
- SWR with date-based keys for data fetching (habits, tasks use this)
- `useTranslations()` for all UI text
- Client components with `"use client"` directive
- Dark mode via CSS variables (class-based, `next-themes`)
- Responsive: Tailwind breakpoints (`md:`, `lg:`)

### Integration Points
- Sidebar navigation: add Calendar link
- `app/calendar/` — new route directory
- `components/calendar/` — new component directory
- `lib/calendar/recurrence.ts` — `ExpandedCalendarEvent` type for rendering

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the design spec — follow BetterR.Me's existing UI patterns with the calendar-specific design tokens documented in the spec.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 31-calendar-ui-month-view-navigation*
*Context gathered: 2026-04-01 via --auto mode*
