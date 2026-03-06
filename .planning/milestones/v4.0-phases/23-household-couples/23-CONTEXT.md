# Phase 23: Household & Couples - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Two partners (or small group up to 5) can share a household with combined and individual financial views. Users control what each member sees via account-level and transaction-level privacy settings. Partner 1 uses the app solo from day one; additional members join asynchronously without disrupting existing data.

</domain>

<decisions>
## Implementation Decisions

### Invitation & joining flow
- Invite delivery method: Claude's discretion (email link, code, or hybrid)
- If invited partner already has a BetterR.Me account with solo money data, their existing accounts and transactions merge into the household tagged as "mine"
- Household size: up to a small group (3-5 members), not strictly two
- One household owner manages invites
- Owner can remove members AND members can leave voluntarily
- Removed/leaving members keep their personal data but lose access to shared views

### Privacy & visibility controls
- Three account visibility levels: "mine" (private), "ours" (shared), "hidden" (balance-only)
- "Hidden" means: partner sees account name + balance, but cannot see any transactions
- Either household member can change any account's visibility (not restricted to account owner)
- New accounts default to "mine" — user explicitly shares them
- When changing an account from "mine" to "ours": future transactions become visible to partners; historical transactions are NOT visible by default but visibility can be changed
- Transaction-level hiding: individual transactions can be hidden from household view entirely
- Transaction-level sharing: individual transactions on a "mine" account can be marked as shared, appearing in the household view
- In shared views, partners see transactions as **category + amount only** — no merchant name, notes, or other details
- No notifications or audit logs for visibility changes — privacy changes are silent

### Combined vs individual views
- Switching between personal and household views via **tabs on each page** (Mine / Household)
- Tabs only appear after a second member joins the household — solo users see the current single view with no tabs
- Household tab defaults to flat merge of all visible accounts; optional filter/group-by to see per-member breakdown
- Which money pages get tabs: Claude's discretion

### Shared vs individual budgets/goals
- Only the budget/goal creator can edit shared budgets; other members see them read-only
- Shared budgets track spending only from accounts marked "ours" (not individually shared transactions)
- Shared savings goals track progress from "ours" accounts only
- Individual budgets are completely private — never visible to other household members

### Claude's Discretion
- Invite delivery mechanism (email link vs code vs hybrid)
- Which money pages get the Mine / Household tabs
- Technical implementation of merge flow for existing accounts
- Tab design and page-level UX details
- Error states and edge case handling

</decisions>

<specifics>
## Specific Ideas

- Transaction privacy is strict by default: partners only see category + amount, never merchant name or notes
- "Hidden" accounts show name + balance but zero transaction access — designed for accounts like personal credit cards where the partner should know the balance for net worth purposes but not the spending details
- The system should feel private-by-default: new accounts are "mine", historical transactions stay hidden when sharing, and individual budgets are invisible to partners

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-household-couples*
*Context gathered: 2026-02-23*
