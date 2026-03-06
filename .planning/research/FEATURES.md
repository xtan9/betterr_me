# Feature Landscape

**Domain:** Personal finance management added to an existing habit/task tracking app (BetterR.Me v4.0)
**Researched:** 2026-02-21
**Overall confidence:** HIGH

Research adapted from standalone moneyy.me feature research (2026-02-20), competitor analysis (Monarch Money, YNAB, Copilot Money, Honeydue, Rocket Money, PocketGuard), and Plaid integration documentation. Adjusted for the reality that this is a feature module within an existing app, not a standalone finance product.

---

## Context: What Exists Today

BetterR.Me is a working habit tracking and task management app with:

- **Auth:** Email/password signup, login, logout (Supabase Auth) -- single-user per account
- **Dashboard:** Habits overview with streaks, tasks due today/tomorrow, milestones
- **Habits:** Create/edit/delete with 5 frequency types, daily completion tracking, streaks, monthly stats
- **Tasks:** Work/Personal sections, named projects with color presets, 4-column kanban boards, drag-and-drop, recurring tasks
- **Settings:** Profile (name, avatar), preferences (week start day, theme, locale)
- **Data export:** Habit data as ZIP
- **i18n:** Three locales (en, zh, zh-TW) using next-intl
- **UI:** shadcn/ui + Radix + Tailwind CSS 3, dark mode via next-themes, semantic design tokens
- **Data layer:** Supabase (Postgres + auth), SWR for client data fetching, DB class pattern with per-request client instances
- **Testing:** 1207+ tests (Vitest + Playwright), 50% coverage threshold

The v4.0 milestone adds an entirely new product domain -- personal finance -- alongside the existing habit and task domains.

### Key Integration Points

| Existing System | How Money Features Touch It |
|---|---|
| **Sidebar navigation** | Add "Money" nav item (or sub-items) to the 3-item flat nav (Dashboard, Habits, Tasks) |
| **Dashboard** | Either extend existing dashboard with a money summary card, or create a separate Money Dashboard page |
| **User profile (profiles table)** | Add money-related preferences (currency, default view, household_id) |
| **Supabase Auth** | Reuse existing auth for money features; add household/couples invitation flow |
| **SWR data fetching** | Extend pattern to money endpoints with appropriate stale times |
| **i18n (3 locales)** | All money UI strings must exist in en, zh, zh-TW |
| **Design tokens** | Money views use existing tokens + "Calm Finance" palette additions |
| **API route pattern** | Money API routes follow same try/catch + Zod validation + DB class pattern |
| **Test infrastructure** | Money features need Vitest unit tests + Playwright e2e, same mocking patterns |

---

## Table Stakes

Features users expect once BetterR.Me claims to offer money tracking. Missing any of these makes the finance section feel broken.

| Feature | Why Expected | Complexity | Dependencies on Existing App | Notes |
|---------|--------------|------------|------------------------------|-------|
| **Plaid bank account connection** | Every modern finance tool syncs automatically. Manual-only feels broken in 2026. Core data pipeline for everything else. | HIGH | Reuse Supabase Auth user_id. New plaid_items, accounts tables. New API routes for link-token and exchange-token. | Plaid free tier = 200 Items. OAuth required for major banks. Need webhook endpoint on Vercel. Cost: ~$0.30-$1.50/connected-account/month at scale. |
| **Transaction list with search and filter** | Core interaction loop. Users must find, review, and understand their spending. This is the "home screen" of the money section. | MEDIUM | New `/money/transactions` page. SWR for client-side pagination. Reuse existing page layout patterns (sidebar-layout). | Date range, amount range, category, account, keyword search. Cursor-based pagination (not OFFSET) because transaction tables grow fast. |
| **Auto-categorization with manual override** | Mint trained a generation to expect this. Without it, users categorize hundreds of transactions by hand and abandon the product. | MEDIUM | Depends on Plaid transaction data being present. New categories table (system defaults + user custom). | Use Plaid PFCv2 (shipped Dec 2025, claims >90% primary accuracy) as base. Build merchant-name rule system: user corrects "AMZN MKTP US" to Shopping, all future AMZN MKTP US auto-categorize. No custom ML in v4.0. |
| **Custom categories** | Auto-categorization is never perfect. Users need "Dining Out" separate from "Groceries", or domain-specific categories like "Dog expenses." | LOW | New user_categories table with household_id scoping. | Allow creation + editing. System categories cannot be deleted, only hidden. Custom categories are household-scoped (shared between partners). |
| **Monthly budgets per category with progress bars** | Core budgeting loop. YNAB, Monarch, Copilot all have this. Without budgets, transaction data has no context. | MEDIUM | Depends on working categorization. New budgets table. New `/money/budgets` page. | Show spent vs. remaining per category. Support rollover (unused budget carries to next month) as a per-budget toggle. Budget period = calendar month. |
| **Spending breakdown charts** | The primary "aha moment" -- visual spending by category is what convinces users the tool is valuable. Every competitor has this. | MEDIUM | Depends on categorized transactions. Chart library needed (recharts or similar). Reuse existing Tailwind/shadcn styling. | Donut chart by category. Bar chart over time. Category drill-down to individual transactions. Month-over-month comparison. Compute server-side (SQL aggregations), not client-side. |
| **Bill and subscription auto-detection** | Rocket Money popularized this. Monarch, Copilot, Simplifi all detect recurring charges. Users expect to see "Netflix $15.99/mo" without manually entering it. | MEDIUM | Depends on 2-3 months of transaction history for pattern detection. Algorithm runs server-side after each sync. | Detect recurring charges by merchant name + similar amount + regular interval. Show due dates, amounts, frequency. Start detection after ~60 days of data. False positive handling: user can dismiss/confirm detected bills. |
| **Savings goals with progress** | Monarch, Copilot, YNAB all have goals. Users want to save for a vacation, emergency fund, or down payment and see progress. | MEDIUM | New goals table. Optional link to specific account balance. New `/money/goals` page. | Target amount + optional deadline. Visual progress bar/ring. "At current pace, you'll reach this by [date]" projection. Goals can be individual or shared (household). |
| **Net worth tracking** | Once accounts are connected, summing assets minus liabilities is trivial and expected. Monarch, Copilot, Fina all show this. | LOW | Depends on connected accounts with balance data. Simple aggregation. | Sum all account balances (checking + savings + investment = assets; credit cards + loans = liabilities). Track over time with a line chart. Updates automatically on each Plaid sync. |
| **CSV/manual transaction import** | Fallback for institutions Plaid doesn't cover. Critical for users uncomfortable connecting banks. Also the free-tier-friendly path (no Plaid cost per user). | MEDIUM | New import flow in UI. Duplicate detection against existing transactions. Reuse existing data-export component patterns. | CSV column mapping with auto-detect for common formats (Mint export, bank CSV). Manual single-transaction entry form for cash purchases. Source field on transactions: 'plaid' vs 'manual' vs 'csv'. |
| **Account management page** | Users need to see which accounts are connected, their balances, sync status, and the ability to disconnect. | LOW | New `/money/accounts` page. Reads from accounts + plaid_items tables. | Show: institution name, account mask (last 4 digits), type, balance, last sync time, health status. Actions: disconnect, re-authenticate (Plaid Update Mode), manual refresh. |
| **Money section in sidebar** | Users need to navigate to money features. Current sidebar has Dashboard, Habits, Tasks. Money needs its own entry point. | LOW | Modify `app-sidebar.tsx` to add money nav items. Add i18n keys. | Single "Money" top-level nav item expanding to sub-pages (Overview, Transactions, Budgets, etc.) or just a Money link leading to a money dashboard with sub-navigation. |
| **Data export for transactions** | Users must own their data. BetterR.Me already exports habit data as ZIP; transaction export follows naturally. | LOW | Extend existing export infrastructure (`lib/export/`). Add money data to export options. | CSV export of transactions with all fields. Period selectable. Include categories and account names. |

---

## Differentiators

Features that set BetterR.Me apart. Not expected in a finance module, but high-value. Aligned with "Calm Finance" philosophy and couples-first positioning from the moneyy.me vision.

| Feature | Value Proposition | Complexity | Dependencies on Existing App | Notes |
|---------|-------------------|------------|------------------------------|-------|
| **Couples/household multi-user** | Honeydue is the only couples-first finance app and it is feature-weak (no desktop, poor auto-categorization). Monarch bolts couples on. Copilot has no partner support. Ground-up household architecture is the core differentiator of this entire feature set. | HIGH | Requires household_id on ALL money tables. New households table. Invitation flow (email). Two separate Supabase Auth users linked by household_id. Existing BetterR.Me features (habits, tasks) remain single-user -- household only applies to money. | Each partner has own login. Shared household view for combined spending/budgets/net-worth. Per-account privacy: "mine" (only I see), "ours" (both see), "hidden" (partner sees balance only). Individual + shared budgets. Partner 1 can use the app solo; Partner 2 joins asynchronously. |
| **Future-first dashboard** | No competitor defaults to forward-looking. All show "where money went." Answering "Am I going to be okay this month?" is genuinely novel. | HIGH | Depends on: bill detection (recurring outflows), income detection (recurring inflows), projection engine (extrapolate spending pace). New `/money` overview page replacing or augmenting the standard dashboard. | Show: available money until next paycheck, upcoming bills for next 30 days, projected end-of-month balance. Calendar-based cash flow visualization. This is the signature feature -- the money "home page" should default to this. |
| **Contextual AI insights (not a chatbot)** | Monarch/Copilot added chatbot-style AI. Surface-level. Proactive insights woven into the UI are more valuable: they appear where relevant, not in a separate chat window. | HIGH | Depends on: sufficient transaction history (2+ months), working categorization, spending trend data. LLM API calls (OpenAI/Anthropic) for natural language generation. | Examples: "Your grocery spending is up 15% vs your 3-month average" on the spending chart. "This Netflix subscription increased $3 since last year" on the bills page. "At your current savings rate, you'll hit your vacation goal 2 weeks early" on the goals page. Embedded, not chatbot. |
| **"Calm Finance" design language** | No competitor explicitly addresses financial anxiety in their design. Red/green color coding and deficit-focused language trigger stress. This is a UX differentiator, not a feature. | MEDIUM | Extend existing BetterR.Me design tokens with Calm Finance palette. Add new semantic tokens for money views. All money UI components follow these principles. | Warm amber/slate instead of aggressive red/green for over/under-budget. Forward-looking language: "You have $X remaining" not "You overspent by $X." Progress framing: "You've saved 60% of your goal" not "You still need $Y." Gentle notifications. This applies across ALL money UI, not a single component. |
| **Smart bill calendar** | Beyond listing upcoming bills: a calendar view with projected balance overlaid, highlighting days where balance dips dangerously low. Combines bill tracking + cash flow. | MEDIUM | Depends on: bill detection, future-first projection engine. Calendar UI component. | Calendar with bill markers. Balance projection line drawn across the month. "Danger zone" highlighting when projected balance drops below a configurable threshold. This is the visual form of the future-first dashboard concept. |
| **Integrated life dashboard** | BetterR.Me uniquely combines habits + tasks + money. No competitor has all three. A unified dashboard showing "habits on track, tasks due today, money healthy" is genuinely novel. | MEDIUM | Extends existing dashboard with money summary card(s). Reuse DashboardData pattern with money fields. | Existing dashboard shows habits + tasks. Add a money summary: available balance, upcoming bills, budget status. Not a replacement -- an augmentation. The full money dashboard is a separate page; the integrated dashboard shows highlights. |
| **Partner spending comparisons** | Unique to couples apps. "You spent $X on dining, your partner spent $Y" with neutral, informational framing (not competitive). | LOW | Depends on: couples household, categorized transactions. Simple query grouping by user_id within household. | Side-by-side category breakdowns. Neutral tone aligned with Calm Finance. Only available in household view, not individual view. |
| **Anxiety-aware onboarding** | Finance apps throw users into a full dashboard immediately. Step-by-step, one-thing-at-a-time onboarding that shows value before asking for bank credentials. | MEDIUM | New onboarding flow for money features. Could be a guided wizard or progressive disclosure. | "Connect one account first" then "Here's your spending breakdown" then "Want to set a budget?" then "Invite your partner." Each step demonstrates value before requesting more. |

---

## Anti-Features

Features to explicitly NOT build. Either wrong for BetterR.Me's context, premature, legally risky, or scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **AI chatbot for financial advice** | SEC/FINRA compliance risk. LLM hallucinations with financial advice cause real harm. Liability exposure. Conflicts with the "contextual insights" differentiator. | Contextual AI insights embedded in the UI. Show what is happening and why. Never recommend specific financial actions. "Your utility bill spiked" not "You should switch providers." |
| **Bill negotiation / cancellation service** | Rocket Money charges 35-60% of savings. Requires human agents or complex integrations. Legal liability. Not a software feature, it is a service business. | Surface the insight: "This subscription increased $3/month since you signed up." Let users act on it themselves. |
| **Investment advisory / robo-advisor** | SEC/FINRA registration required. Different product category entirely. Massive compliance burden. | Read-only investment account tracking via Plaid. Show portfolio value and allocation for net worth. No buy/sell recommendations. |
| **Real-time chat between partners** | Turns a finance tool into a messaging app. Massive scope (notifications, message storage, read receipts). Partners already have iMessage/WhatsApp. | Transaction commenting or emoji reactions. Shared notes on budget categories. Lightweight, asynchronous. |
| **Gamification (streaks, badges, leaderboards for money)** | BetterR.Me has habit streaks, but applying gamification to finances conflicts with Calm Finance philosophy. "7-day spending streak!" creates anxiety. Financial competition between partners is toxic. | Gentle progress celebrations. "You're ahead of your savings goal this month." Milestone acknowledgments, not performance scores. Notably, habit streaks stay -- they make sense for habits, not money. |
| **Multi-currency support** | Massive complexity: exchange rates, conversion timing, reporting currency, edge cases multiply with couples in different countries. | US-focused for v4.0. Plaid's US institution coverage is the constraint. Add later if demand warrants it. |
| **Automatic bill payment / money movement** | Money transmitter licensing required. ACH integration complexity. Liability for failed/wrong payments. Entirely different risk profile from read-only finance tracking. | Bill reminders and due date alerts. Link to pay at the biller's site. "Your electric bill of $127 is due in 3 days." |
| **Social features / financial community** | Privacy nightmare. Financial comparison triggers anxiety. Moderation burden. | None. Possibly anonymous aggregated benchmarks in far future: "Households like yours typically spend X on groceries." |
| **Native mobile apps (iOS/Android)** | Doubles development effort. BetterR.Me is web-only. PWA capabilities cover most mobile use cases. | Responsive web that feels native on mobile. Optimize for mobile Safari and Chrome. Same approach as existing habit/task features. |
| **Separate "moneyy.me" branding/domain** | The original plan was a standalone app. But maintaining two codebases, two auth systems, two deployments is wasteful. BetterR.Me already has the infrastructure. | Money features live inside BetterR.Me as a first-class section alongside Habits and Tasks. Single codebase, single deployment, single auth. |
| **Envelope budgeting (YNAB-style)** | "Give every dollar a job" methodology requires fundamentally different UX -- users assign income to categories before spending. High complexity, niche audience. Most users want category limits, not income allocation. | Standard category-limit budgeting. Set a target per category per month. Show progress. Support rollover. This is what Monarch, Copilot, and most competitors do. |
| **Receipt scanning / OCR** | Monarch added this in 2026 but it is a specialized feature requiring camera integration, OCR pipeline, and transaction matching. Out of scope. | Manual transaction entry form for cash purchases not covered by Plaid. |
| **Stripe/freemium billing** | PROJECT.md explicitly states: "No billing in v4.0." Build features first, validate them, add monetization in a future milestone. | All v4.0 features are free. Household sharing, AI insights, and unlimited accounts are natural future upgrade triggers. |

---

## Feature Dependencies

```
[Supabase Auth (existing)] --------> [All money features]

[New DB schema: households, plaid_items, accounts, transactions, categories, budgets, goals, bills]
    |
    +--> [Plaid Link integration] (connect bank accounts)
    |       |
    |       +--> [Plaid webhook handler + transaction sync]
    |               |
    |               +--> [Transaction list with search/filter]
    |               |       |
    |               |       +--> [Auto-categorization (Plaid PFCv2 + merchant rules)]
    |               |       |       |
    |               |       |       +--> [Monthly budgets per category]
    |               |       |       |       |
    |               |       |       |       +--> [Budget progress tracking + charts]
    |               |       |       |       +--> [Spending breakdown charts]
    |               |       |       |
    |               |       |       +--> [Spending trends / reports]
    |               |       |
    |               |       +--> [Bill & subscription auto-detection]
    |               |       |       |
    |               |       |       +--> [Bill calendar & reminders]
    |               |       |       +--> [Future-first dashboard] (also needs income detection)
    |               |       |
    |               |       +--> [Net worth tracking]
    |               |
    |               +--> [Account management page]
    |
    +--> [CSV/manual import] (alternative data input, no Plaid dependency)
    |       |
    |       +--> [Same downstream: transaction list, categorization, budgets, etc.]
    |
    +--> [Household/couples multi-user]
    |       |
    |       +--> [Partner invitation flow]
    |       +--> [Privacy controls (mine/theirs/ours per account)]
    |       +--> [Shared + individual budgets]
    |       +--> [Shared savings goals]
    |       +--> [Partner spending comparisons]
    |
    +--> [Savings goals] (needs account balances OR manual tracking)

[Auto-categorization] + [Spending trends] + [2+ months of data]
    |
    +--> [Contextual AI insights]

[Bill detection] + [Income detection]
    |
    +--> [Cash flow projection engine]
          |
          +--> [Future-first dashboard]
          +--> [Smart bill calendar with balance overlay]

[Existing dashboard]
    |
    +--> [Money summary card on integrated dashboard] (needs account balances + budget status)
```

### Dependency Notes

1. **DB schema is the foundation.** Everything depends on the money-specific tables existing. The schema must include `household_id` on every money table from the first migration -- retrofitting multi-tenancy is extremely painful.

2. **Two parallel data input paths.** Plaid and CSV/manual import feed the same transaction table. The rest of the app should not care where a transaction came from. Design the `transactions` table with a `source` field ('plaid' | 'csv' | 'manual') but the downstream features (budgets, charts, bills) are source-agnostic.

3. **Categorization unlocks the entire budgeting stack.** Without categorized transactions, budgets and spending charts require manual entry for every transaction, which kills engagement. Plaid PFCv2 + merchant rules is the minimum viable categorization.

4. **Bill detection enables the future-first dashboard.** The signature differentiator requires detecting recurring outflows AND income patterns to project forward. This is why bill detection is table stakes but the dashboard is a differentiator.

5. **Household must be in the schema from day one.** Even if the UI for couples is built in a later phase, every money table must have `household_id` from the first migration. Adding it retroactively requires migrating every row of every table.

6. **AI insights require data maturity.** Contextual insights are meaningless with only 2 weeks of transaction data. Ship this feature last, after users have accumulated 2+ months of history.

7. **Existing features are unaffected.** Habits and tasks remain single-user. Household scope applies only to money tables. The existing `profiles` table gains a `household_id` FK but existing queries are unchanged.

---

## Integration with Existing BetterR.Me Features

### Navigation Structure

Current sidebar: Dashboard | Habits | Tasks

Recommended addition:
```
Dashboard    (existing -- add money summary card)
Habits       (existing -- unchanged)
Tasks        (existing -- unchanged)
Money        (new top-level -- click to expand/navigate)
  Overview   (future-first dashboard / money home)
  Transactions
  Budgets
  Bills
  Goals
  Accounts
```

The sidebar currently supports 3 items with badge counts. Adding "Money" as a 4th top-level item fits naturally. The sub-navigation within Money can be handled as secondary nav within the money layout (tab bar or left sub-nav), keeping the sidebar clean.

### Dashboard Integration

Two approaches, recommend both:

1. **Existing dashboard gets a money summary card** alongside habit and task cards. Shows: total available balance, budget status (on track / over in N categories), upcoming bills this week. This is low complexity and high value.

2. **Money Overview page is the dedicated money dashboard** with the future-first view, detailed charts, and full financial picture. This is the full-featured money home.

### Shared UI Patterns

| Pattern | Existing Usage | Money Usage |
|---|---|---|
| Card grid layout | Habit cards, project cards | Account cards, budget category cards, goal cards |
| Progress bars | Habit monthly completion rate | Budget spent/remaining, savings goal progress |
| SWR + keepPreviousData | Habit/task data with date in key | Transaction data with date filters in key |
| Zod validation at API boundary | All existing POST/PATCH routes | All money API routes (transactions, budgets, goals) |
| DB class pattern | HabitsDB, TasksDB, ProjectsDB | TransactionsDB, BudgetsDB, AccountsDB, GoalsDB, BillsDB |
| i18n message keys | common.nav, habits.*, tasks.* | money.* namespace for all money strings |
| Design tokens | bg-card, text-muted-foreground, etc. | Same tokens + Calm Finance additions (warm amber for over-budget, muted green for healthy) |

### Data Layer Integration

Money features follow the exact same pattern as habits and tasks:

```typescript
// API route pattern (same as existing)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const transactionsDB = new TransactionsDB(supabase);
    const transactions = await transactionsDB.getTransactions(user.household_id, filters);
    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

Key difference from existing patterns: money queries filter by `household_id` (from the user's profile), not `user_id` directly. This enables the couples/household feature.

---

## MVP Recommendation

Given that this is a feature addition to an existing app (not a standalone launch), the MVP should prioritize getting transaction data visible quickly and demonstrating value before adding complexity.

### Phase 1: Schema + Plaid Pipeline + Accounts

Minimum to get financial data flowing:

1. Database migration: households, plaid_items, accounts, transactions, categories tables (all with household_id)
2. Plaid Link integration: create-link-token, exchange-public-token, store encrypted access_token
3. Plaid webhook receiver + transaction sync (Inngest or Vercel Cron for background processing)
4. Account management page: see connected accounts, balances, sync status
5. Sidebar navigation: add "Money" section
6. CSV import as alternative data input (first-class, not afterthought)

### Phase 2: Transactions + Categorization

The core interaction loop:

7. Transaction list page with search, filter, pagination
8. Auto-categorization using Plaid PFCv2 + merchant-name rule system
9. Manual category override (user corrections train future assignments)
10. Custom category creation
11. Spending breakdown charts (donut + bar)

### Phase 3: Budgets + Bills + Goals

The "management" layer:

12. Monthly budgets per category with progress bars
13. Budget rollover toggle
14. Bill & subscription auto-detection from transaction patterns
15. Bill list with due dates and amounts
16. Savings goals with progress visualization
17. Net worth tracking (aggregate account balances)

### Phase 4: Household/Couples

The differentiator:

18. Household creation and partner invitation flow
19. Per-account privacy controls (mine / ours / hidden)
20. Shared household view (combined spending, budgets, net worth)
21. Individual + shared budgets
22. Shared savings goals

### Phase 5: Intelligence + Future-First

The advanced layer (requires data maturity):

23. Income pattern detection
24. Cash flow projection engine
25. Future-first dashboard (money overview page)
26. Smart bill calendar with balance overlay
27. Contextual AI insights embedded in relevant pages
28. Money summary card on existing dashboard

### Defer to future milestones:

- **Partner spending comparisons:** Needs mature couples usage first
- **Advanced reporting:** Custom date ranges, YoY, tax categories
- **Anxiety-aware onboarding wizard:** Optimize after watching real usage
- **2FA / TOTP:** Add when user base grows
- **Email notifications for bills/budgets:** Add after bill detection is reliable
- **Stripe billing / freemium tier:** Separate milestone entirely

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| DB schema with household_id | Foundation | MEDIUM | P0 | 1 |
| Plaid bank connection | HIGH | HIGH | P1 | 1 |
| CSV/manual import | HIGH | MEDIUM | P1 | 1 |
| Transaction list + search | HIGH | MEDIUM | P1 | 2 |
| Auto-categorization (Plaid PFCv2 + rules) | HIGH | MEDIUM | P1 | 2 |
| Spending breakdown charts | HIGH | MEDIUM | P1 | 2 |
| Monthly budgets per category | HIGH | MEDIUM | P1 | 3 |
| Net worth tracking | MEDIUM | LOW | P1 | 3 |
| Bill & subscription detection | HIGH | MEDIUM | P2 | 3 |
| Savings goals + progress | MEDIUM | MEDIUM | P2 | 3 |
| Account management page | MEDIUM | LOW | P1 | 1 |
| Sidebar + money navigation | Foundation | LOW | P0 | 1 |
| Custom categories | MEDIUM | LOW | P1 | 2 |
| Couples/household multi-user | HIGH | HIGH | P2 | 4 |
| Privacy controls (mine/ours/hidden) | MEDIUM | MEDIUM | P2 | 4 |
| Data export (transactions CSV) | MEDIUM | LOW | P2 | 3 |
| Future-first dashboard | HIGH | HIGH | P3 | 5 |
| Contextual AI insights | HIGH | HIGH | P3 | 5 |
| Smart bill calendar | MEDIUM | MEDIUM | P3 | 5 |
| Dashboard money summary card | MEDIUM | LOW | P2 | 5 |
| Calm Finance design tokens | MEDIUM (UX) | LOW | P1 | 1 |

**Priority key:**
- P0: Foundation -- everything else depends on it
- P1: Must have for the money feature to feel complete
- P2: Should have, adds significant value
- P3: Differentiators, build after core is solid

---

## Calm Finance Design Principles (Cross-Cutting)

These are not a feature -- they are constraints that apply to every money UI component.

| Principle | Implementation | Example |
|---|---|---|
| **No aggressive red/green** | Use warm amber/ochre for over-budget, muted teal/sage for on-track. Leverage existing BetterR.Me design token system. | Budget progress bar: sage green when under 80%, warm amber when 80-100%, muted coral when over. Never bright red. |
| **Forward-looking language** | UI copy emphasizes what's ahead, not what's behind. | "You have $340 remaining this month" not "You've spent $660 of your $1000 budget." |
| **Progress framing** | Show how far you've come, not how far you have to go. | Savings goal: "You've saved 60% of your vacation fund!" not "You still need $2,000." |
| **Gentle notifications** | No alarming language or urgent styling for financial alerts. | "Your grocery spending is trending higher than usual this month" not "WARNING: Budget exceeded!" |
| **No financial judgment** | Especially in couples view -- never frame one partner's spending as "worse." | "Sarah: $120 dining. Alex: $80 dining." Not "Sarah spent 50% more than Alex on dining." |

---

## Competitor Feature Gap Analysis (BetterR.Me Context)

| Feature | Monarch ($15/mo) | YNAB ($15/mo) | Copilot ($13/mo) | Honeydue (Free) | BetterR.Me v4.0 |
|---------|-------------------|---------------|-------------------|-----------------|-----------------|
| Habits + Tasks + Money | No | No | No | No | **Yes -- unique** |
| Bank sync | Yes | Yes | Yes | Yes | Yes (Plaid) |
| Couples | Bolt-on | Shared budget only | No | Yes (primary) | Ground-up household |
| Forward-looking dashboard | Spending forecast | "Age of money" | Cash flow chart | No | **Future-first (signature)** |
| AI insights | Chatbot | No | AI suggestions | No | Contextual, embedded |
| Calm/anxiety-aware design | No | No | No | No | **Yes (Calm Finance)** |
| Free tier | No | No (trial only) | No (trial only) | Yes | Yes (no billing in v4.0) |
| Web app | Yes | Yes | New in 2026 | No (mobile only) | Yes (web-first) |

The unique positioning: **BetterR.Me is the only product that combines habit tracking, task management, and personal finance in one app with ground-up couples support, a forward-looking dashboard, and anxiety-aware design.**

---

## Sources

### Competitor & Market Research (MEDIUM confidence -- web search, multiple sources corroborating)
- [NerdWallet: Best Budget Apps 2026](https://www.nerdwallet.com/finance/learn/best-budget-apps)
- [CNBC Select: Best Budgeting Apps 2026](https://www.cnbc.com/select/best-budgeting-apps/)
- [Monarch Money: What's New](https://www.monarch.com/whats-new)
- [FinanceBuzz: Monarch Money Review 2026](https://financebuzz.com/monarch-money-review)
- [NerdWallet: Honeydue Review](https://www.nerdwallet.com/finance/learn/honeydue-app-review)
- [U.S. News: Best Budget Apps for Couples](https://money.usnews.com/money/personal-finance/articles/best-budget-apps-for-couples)

### Technical (HIGH confidence -- official documentation)
- [Plaid Transactions Documentation](https://plaid.com/docs/transactions/)
- [Plaid Link Overview](https://plaid.com/docs/link/)
- [Plaid AI-Enhanced Transaction Categorization (PFCv2)](https://plaid.com/blog/ai-enhanced-transaction-categorization/)
- [Plaid Pricing](https://plaid.com/pricing/)

### Prior Research (HIGH confidence -- direct source)
- moneyy.me FEATURES.md (2026-02-20) -- standalone finance app feature research, adapted for integration context
- moneyy.me REQUIREMENTS.md (2026-02-20) -- formal requirements, mapped to phases
- moneyy.me ARCHITECTURE.md (2026-02-20) -- system architecture patterns
- moneyy.me PITFALLS.md (2026-02-20) -- domain pitfalls and prevention strategies

---
*Feature research for: BetterR.Me v4.0 Money Tracking (personal finance as a feature module within existing habit/task app)*
*Researched: 2026-02-21*
