# Phase 20: Transaction Management & Categorization - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see, search, filter, and understand all their transactions with accurate auto-categorization using Plaid PFCv2 categories, the ability to correct mistakes via merchant rules that stick, custom categories shared across household, and transaction splitting. CSV import is deferred to a future phase.

</domain>

<decisions>
## Implementation Decisions

### Transaction list layout
- Claude's discretion on layout style (compact table vs card rows) — research competitor patterns (Mint, Monarch, Copilot, Lunch Money) and pick what fits Calm Finance design system
- Transactions grouped by date with sticky date headers (Today, Yesterday, Jan 15, etc.)
- Amounts show both color and sign: green +$500 for income, red -$42.50 for spending

### Transaction detail view
- Claude's discretion on detail interaction pattern (inline expand vs side panel vs bottom sheet) — research competitor patterns and pick the best fit
- Detail view should support category override, notes, split info, and account info

### Search & filter experience
- Top horizontal filter bar above the transaction list, always visible
- Active filters displayed as removable chips below the filter bar (e.g. ✘ Category: Food, ✘ Jan 1–Jan 31) with a "Clear all" button
- Search is instant with ~300ms debounce — filters results as user types
- All filters persist in URL query params (?category=food&dateFrom=2026-01-01) — bookmarkable, survives refresh
- Filters: date range, amount range, category, account, keyword search

### Category management
- Categories have emoji/icon + color dot for visual identification (e.g. 🍔 Food = green, 🚗 Transport = blue)
- When user overrides a transaction's category, a toast/popover asks: "Always categorize [merchant] as [category]?" — user confirms to create merchant rule, or skips
- Create/assign categories inline from transaction detail view
- Manage categories (hide defaults, view merchant rules) in a lightweight money settings section
- Custom categories are household-scoped (shared between partners)

### Transaction splitting
- Claude's discretion on split UI pattern — pick the simplest effective approach
- Split amounts must total the original transaction amount

### Claude's Discretion
- Transaction list layout style (research competitors first)
- Transaction detail interaction pattern (research competitors first)
- Transaction split UI design
- Loading skeletons and empty states
- Exact spacing, typography, and Calm Finance token usage
- Pagination UX (cursor-based, load-more vs infinite scroll)
- Mobile-specific adaptations

</decisions>

<specifics>
## Specific Ideas

- User wants competitor research (Mint, Monarch, Copilot, Lunch Money) to inform layout and detail view decisions
- Date grouping with sticky headers for chronological browsing
- Green/red color + sign for amounts is a firm preference — maximum clarity on income vs spending
- Merchant rule creation should be prompted, not silent — user wants control over when rules are created

</specifics>

<deferred>
## Deferred Ideas

- CSV import (TXNS-07) — user wants to defer this to a future phase; remove from Phase 20 scope
- Manual transaction entry (TXNS-08) — already exists from Phase 19 (manual entry dialog on accounts page)

</deferred>

---

*Phase: 20-transaction-management-categorization*
*Context gathered: 2026-02-22*
