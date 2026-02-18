# Phase 5: Dashboard Page Migration - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the existing dashboard page to the card-on-gray visual system. All current dashboard functionality (greeting, motivation, absence cards, stat cards, milestones, habit checklist, tasks today, weekly insight) continues working identically. This phase replaces hardcoded colors with design tokens, wraps bare content in cards, and adjusts the responsive grid for sidebar coexistence. No new features, no new data, no new components beyond what's needed for the migration.

</domain>

<decisions>
## Implementation Decisions

### Card wrapping strategy
- Greeting section (time-based greeting + subtitle) gets wrapped in a white card -- it's currently bare text
- Motivation message gets its own separate card (not merged into greeting card)
- Absence recovery cards keep their warning/accent color styling but migrate to design tokens (no hardcoded slate/emerald colors)
- Weekly insight card keeps its distinct styling, migrated to design tokens
- Milestone celebration cards keep their celebratory gradient treatment, migrated to design tokens
- Habit checklist and tasks today are already in Card components -- migrate any hardcoded colors to tokens

### Stat cards presentation
- DailySnapshot stat cards remain as individual floating cards (not grouped in a parent card)
- Each stat keeps its distinct accent color (blue for active habits, emerald for progress, orange for streak)
- Stat cards switch from custom div with hardcoded styles to shadcn Card component with design tokens (bg-card, border-border)
- Cards get subtle shadow (shadow-sm) for depth on the gray background

### Greeting & PageHeader
- Dashboard does NOT use the PageHeader component -- it keeps its own custom greeting style
- Greeting uses the Chameleon-measured text-page-title token (24px) for consistency with the extracted design system
- Wave emoji (👋) stays in the greeting
- Greeting card uses standard Chameleon card styling (same bg-card/border/shadow as other cards, no special accent)

### Responsive grid behavior
- Habits/tasks 2-column grid breakpoint shifts from lg (1024px) to xl (1280px) to account for sidebar width
- Stat cards grid stays at md (768px) for 3-column layout -- compact enough with sidebar
- Mobile layout (<768px) stays single-column stacking as today

### Claude's Discretion
- Mobile layout adjustments if needed for card-on-gray system
- Max-width for dashboard content area (1400px default or adjusted based on visual testing)
- Any spacing/padding adjustments needed for cards on the gray background to feel spacious

</decisions>

<specifics>
## Specific Ideas

- "Make it the same as in Chameleon" -- greeting card and overall dashboard should match Chameleon's dashboard aesthetic
- All hardcoded color references (bg-white, dark:bg-slate-900, border-slate-200, etc.) must be replaced with design tokens from Phase 1
- The card-on-gray depth separation is the primary visual goal -- white cards floating on the gray --page background

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 05-dashboard-page-migration*
*Context gathered: 2026-02-16*
