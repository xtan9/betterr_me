# Phase 21: Budgets & Spending Analytics - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can set monthly spending limits per category and see where their money goes through visual charts. Includes budget creation (envelope-style), progress tracking with circular rings, spending breakdown and trend charts, category drill-down to transactions, and configurable rollover. Bills, goals, net worth, and AI insights are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Budget creation flow
- Envelope-style budgeting: user sets a total monthly budget, then allocates portions to categories
- Claude's Discretion: whether allocation must be exact or can leave unallocated buffer
- Claude's Discretion: which categories to show by default (used vs all)
- Single form page: total amount at top, category rows below with amount inputs, all visible at once
- Users can edit and delete budgets after creation

### Progress & alerts
- Circular ring/arc per category showing % spent — compact, works in card layouts
- Claude's Discretion: color threshold breakpoints (warning and danger levels)
- Claude's Discretion: over-budget visual treatment
- Current month shown by default with left/right arrows to browse previous months (no future months)

### Chart design & interaction
- Claude's Discretion: donut chart vs treemap for spending breakdown
- Bar chart for month-over-month trends showing 12 months of history by default
- Claude's Discretion: chart interaction pattern (direct drill-down vs tooltip-first)
- Claude's Discretion: charting library selection (Recharts, Chart.js, or other based on stack fit)

### Drill-down & rollover
- Claude's Discretion: drill-down UX (full page vs inline panel)
- Rollover requires monthly user confirmation — at month end, prompt to confirm rollover amounts
- Rollover display shows breakdown: base budget and rollover amount separately (e.g., "$200 + $35 rollover")
- Debt carries forward: overspending reduces next month's rollover (negative rollover possible)

### Claude's Discretion
- Allocation flexibility (strict vs flexible with buffer)
- Default category list in budget setup
- Color thresholds for warning/danger states
- Over-budget visual treatment
- Chart type for spending breakdown
- Chart interaction pattern
- Charting library choice
- Drill-down navigation pattern

</decisions>

<specifics>
## Specific Ideas

- Envelope-style budgeting was explicitly chosen over per-category independent budgets
- Circular rings chosen over horizontal progress bars for a more compact, modern feel
- 12-month trend view to show seasonal spending patterns
- Monthly rollover confirmation gives users control without being fully automatic
- Debt carries forward to enforce accountability — no free resets after overspending

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-budgets-spending-analytics*
*Context gathered: 2026-02-22*
