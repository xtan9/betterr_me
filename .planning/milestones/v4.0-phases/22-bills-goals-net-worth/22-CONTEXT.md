# Phase 22: Bills, Goals & Net Worth - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can track recurring charges (auto-detected and manually added), view a bill calendar, save toward financial goals with visual progress, and see their overall net worth over time. Household sharing (Phase 23), AI insights (Phase 24), and data export (Phase 25) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Bill detection & management
- Auto-detected recurring charges show an inline confirm/dismiss toggle directly in the list — no modal or separate review queue
- Confirmed bills are fully editable: user can rename, adjust amount, change frequency, and set custom due date
- Users can manually add bills that aren't auto-detected (e.g., cash rent) via a create button with name, amount, frequency, due date
- Bills grouped by frequency: sections for Monthly, Weekly, Annual — sorted by next due date within each section
- Dismissed bills are recoverable — they go to a hidden "Dismissed" section the user can browse and re-confirm
- When a bill amount changes (subscription price increase), show a badge/alert with old vs new amount comparison
- Bills show a "paid this month" status by auto-matching against recent transactions in the current billing period
- Summary header at top: total monthly cost with breakdown like "12 bills · 3 pending · $487/mo"

### Bill calendar
- Claude's discretion on visual style (month grid vs timeline — pick what fits the Calm Finance design)
- Supports month navigation with arrows to look ahead at future months
- Claude's discretion on day-click interaction (inline expand vs side panel)
- Shows individual bill names/icons per day — no daily aggregate totals

### Savings goals
- Progress visualized as ring/donut chart per goal
- Funding supports both options per goal: manual contributions (virtual tracking) OR linked to a real savings account balance
- Claude's discretion on multi-goal layout (card grid vs stacked list)
- Deadline tracking uses color-coded status: green (on track), yellow (slightly behind), red (significantly behind) — based on projected vs target completion date

### Net worth display
- Page layout: line chart on top → assets vs liabilities summary → account breakdown by type (checking, savings, credit cards, loans)
- Chart timeframe: preset toggle buttons — 1M, 3M, 6M, 1Y, All (no custom date picker)
- Change indicator: shows amount and percentage change vs last month (or selected period) — green for up, red for down
- Users can add manual assets (property, vehicle, etc.) with name and estimated value, updated manually alongside Plaid-connected accounts

### Claude's Discretion
- Bill calendar visual style (month grid vs timeline)
- Day-click interaction pattern (inline expand vs side panel)
- Multi-goal layout (card grid vs stacked list)
- Bill detection algorithm specifics (merchant matching, interval tolerance)
- Savings rate calculation method for projections
- Chart library choice and styling details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the Calm Finance design system established in earlier phases.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-bills-goals-net-worth*
*Context gathered: 2026-02-23*
