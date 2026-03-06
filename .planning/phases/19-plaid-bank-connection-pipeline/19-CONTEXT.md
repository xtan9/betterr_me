# Phase 19: Plaid Bank Connection Pipeline - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can connect real bank accounts through Plaid Link OAuth and see transactions flow in automatically via webhooks + Vercel Cron. Manual transaction entry is the fallback for cash purchases or users who prefer not to connect a bank. CSV import is explicitly out of scope — removed from the app entirely.

</domain>

<decisions>
## Implementation Decisions

### Connection flow
- Entry point and empty state: Claude's discretion (pick best approach based on existing codebase patterns)
- After successful Plaid Link OAuth: redirect back to /money/accounts showing newly connected accounts with a success toast
- On Plaid Link failure (user cancel, bank unavailable): show error/cancellation toast, user stays on accounts page, can retry immediately
- Unlimited bank connections — no cap on number of institutions a user can connect

### Account display & status
- Accounts grouped by institution — bank name header with individual accounts listed underneath (e.g., Chase → Checking, Savings, Credit Card)
- Current balance only per account — no available balance or credit limit shown
- Overall net worth summary at top of accounts page (assets minus liabilities) AND per-institution subtotals within each group
- Sync status shown as visible text badge per account: "Synced" / "Stale" / "Error"

### Manual transaction entry
- No CSV import — feature removed from the app. Only Plaid + manual entry
- Manual entry surfaced as secondary option — Plaid is the primary CTA; manual entry in a dropdown or "Other options" section
- Manual entry opens as a modal/dialog — quick entry without leaving the page
- Required fields: amount, description, date, category
- User picks which account the transaction belongs to (including a "Cash" option for unbanked transactions)

### Sync communication
- Initial sync after connecting: account cards show loading/syncing state with spinner until first sync completes
- Sync errors (e.g., bank login expired): error badge on affected account card AND a dismissable banner at top of accounts page
- Re-sync button directly on each account card — always visible, not hidden in a menu
- Disconnect flow: confirmation dialog asks whether to keep or delete previously synced transactions

### Claude's Discretion
- Exact empty state design for first-time user with no accounts
- Plaid Link UI wrapper and loading states during OAuth redirect
- Account card visual design (within Calm Finance design system)
- Re-sync button styling and placement within the card
- Manual entry form layout and validation UX

</decisions>

<specifics>
## Specific Ideas

- Build Plaid integration production-ready (not sandbox-only) — user may charge for the app as a SaaS product
- Design the Plaid integration layer cleanly so swapping providers later isn't painful
- Plaid charges per "item" (bank login), not per account — architecture should track items vs accounts

</specifics>

<deferred>
## Deferred Ideas

- CSV import — explicitly removed from the app, not just deferred. Do not build CSV import in any phase.
- Monetization / subscription pricing — user considering SaaS model ($5-10/month) but decision is separate from implementation
- Provider abstraction layer for swapping Plaid with alternatives (Teller, MX, etc.) — nice-to-have, not required for Phase 19

</deferred>

---

*Phase: 19-plaid-bank-connection-pipeline*
*Context gathered: 2026-02-21*
