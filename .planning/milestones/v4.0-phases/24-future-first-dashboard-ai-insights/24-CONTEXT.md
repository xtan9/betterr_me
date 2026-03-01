# Phase 24: Future-First Dashboard & AI Insights - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Forward-looking money dashboard at `/money` with cash flow projections, income detection, and contextual insights embedded in existing money pages. Plus a money summary card on the main BetterR.Me habit/task dashboard. No new financial features — this surfaces and synthesizes data from phases 20-23.

</domain>

<decisions>
## Implementation Decisions

### Dashboard layout & hierarchy
- Combined summary row as the hero: three numbers side-by-side — available now, upcoming bills total, projected end-of-month balance — equal weight, no single dominant metric
- Calm & spacious visual density: generous whitespace, large type for key numbers, only essential info visible — consistent with Calm Finance design language
- Section order below hero: Claude's discretion based on data available
- Empty/low-data state: Claude's discretion — graceful approach based on what data exists

### Cash flow projections
- Income detection: auto-detect recurring deposits, then show a one-time confirmation prompt ("Looks like you get paid $X every 2 weeks from [employer]. Sound right?"). User confirms or corrects before projections use the data.
- Danger zones on bill calendar: red/amber date shading — amber for tight balance dates, red for projected negative balance dates. Visual heat map on the calendar.
- Confidence indicators: subtle qualifier text (e.g., "estimated" or "based on last 3 months") — no visual bands or ranges, just context labels
- Projection timeframe: Claude's discretion on whether to project to next paycheck, rolling 30 days, or end of month

### Contextual insights
- Tone: Claude's discretion — align with Calm Finance design language already established
- Dismissibility: user can dismiss individual insights, but they resurface if the same pattern recurs in a future period. Persistent but not nagging.
- Volume: max 3-5 insights per page. Show more if relevant activity warrants it.
- Compute architecture: server-side API — dedicated `/api/money/insights` endpoint returns computed insights. Client stays light, insights can be cached.
- Placement: embedded in relevant pages (spending anomalies on budgets, subscription alerts on bills, goal progress on goals page) — no chatbot, no separate insights page

### Money summary card on main dashboard
- Content: spending pulse — "$X spent today / $Y this week" with a small progress bar against budget. Activity-focused, not projection-focused.
- Placement: Claude's discretion based on existing dashboard layout
- Tap behavior: Claude's discretion on navigate vs expand
- Visibility: auto-show when user has connected accounts. No card if money features unused. No explicit toggle needed.
- Loading: independent SWR hook so habits/tasks are never blocked by money data

### Claude's Discretion
- Section order below the summary row hero
- Empty/low-data state approach for the dashboard
- Projection timeframe (next paycheck vs rolling 30 days vs end-of-month)
- Insight tone (within Calm Finance language)
- Money summary card placement on main dashboard
- Money summary card tap behavior (navigate vs expand)

</decisions>

<specifics>
## Specific Ideas

- Summary row should feel like a financial "at a glance" — three equal-weight numbers, not one hero metric
- Calendar danger zones use color shading (red/amber) directly on dates, not a separate chart overlay
- Income confirmation is a one-time prompt, not a recurring nag — once confirmed, it's used until the pattern changes
- Insights resurface monthly if the same pattern recurs, but a dismissed insight for January's groceries spike doesn't reappear for January — only if February also spikes
- Money summary card on main dashboard is activity-focused (spending pulse), not projection-focused — different framing than /money dashboard

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-future-first-dashboard-ai-insights*
*Context gathered: 2026-02-24*
