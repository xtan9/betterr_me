# Phase 22: Bills, Goals & Net Worth - Research

**Researched:** 2026-02-23
**Domain:** Recurring transaction detection, savings goal tracking, net worth calculation with charting
**Confidence:** HIGH

## Summary

Phase 22 adds three distinct feature areas to the existing money tracking system: (1) recurring bill/subscription detection using Plaid's `/transactions/recurring/get` API, (2) savings goals with progress visualization, and (3) net worth tracking with historical line charts. All three areas build on the established money architecture (household-scoped tables, BIGINT cents, IN-subquery RLS, SWR hooks, Recharts for charting).

The bill detection feature is the most technically interesting: Plaid's recurring transactions API already does the hard work of identifying recurring payment streams with merchant names, frequencies, amounts, and predicted next dates. Our job is to store these streams, let users confirm/dismiss them, and present them in a calendar view. No custom ML or pattern matching needed.

Savings goals and net worth tracking are straightforward CRUD + computation features. Goals need a new `savings_goals` table with optional linked account tracking. Net worth needs a `net_worth_snapshots` table populated during each Plaid sync (or daily cron) to build the historical line chart. The existing Recharts library (already v3.7.0, used for SpendingTrendBar) handles the LineChart for net worth and donut/ring charts for goals.

**Primary recommendation:** Use Plaid's built-in recurring transaction detection (`transactionsRecurringGet`) rather than building custom pattern matching. Store bill state locally for confirm/dismiss workflow. Snapshot net worth on each account sync for historical tracking.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Auto-detected recurring charges show an inline confirm/dismiss toggle directly in the list -- no modal or separate review queue
- Confirmed bills are fully editable: user can rename, adjust amount, change frequency, and set custom due date
- Users can manually add bills that aren't auto-detected (e.g., cash rent) via a create button with name, amount, frequency, due date
- Bills grouped by frequency: sections for Monthly, Weekly, Annual -- sorted by next due date within each section
- Dismissed bills are recoverable -- they go to a hidden "Dismissed" section the user can browse and re-confirm
- When a bill amount changes (subscription price increase), show a badge/alert with old vs new amount comparison
- Bills show a "paid this month" status by auto-matching against recent transactions in the current billing period
- Summary header at top: total monthly cost with breakdown like "12 bills . 3 pending . $487/mo"
- Bill calendar supports month navigation with arrows to look ahead at future months
- Bill calendar shows individual bill names/icons per day -- no daily aggregate totals
- Progress visualized as ring/donut chart per goal
- Funding supports both options per goal: manual contributions (virtual tracking) OR linked to a real savings account balance
- Deadline tracking uses color-coded status: green (on track), yellow (slightly behind), red (significantly behind) -- based on projected vs target completion date
- Net worth page layout: line chart on top -> assets vs liabilities summary -> account breakdown by type (checking, savings, credit cards, loans)
- Chart timeframe: preset toggle buttons -- 1M, 3M, 6M, 1Y, All (no custom date picker)
- Change indicator: shows amount and percentage change vs last month (or selected period) -- green for up, red for down
- Users can add manual assets (property, vehicle, etc.) with name and estimated value, updated manually alongside Plaid-connected accounts

### Claude's Discretion
- Bill calendar visual style (month grid vs timeline)
- Day-click interaction pattern (inline expand vs side panel)
- Multi-goal layout (card grid vs stacked list)
- Bill detection algorithm specifics (merchant matching, interval tolerance)
- Savings rate calculation method for projections
- Chart library choice and styling details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | App auto-detects recurring charges from transaction history (merchant + similar amount + regular interval) | Plaid `transactionsRecurringGet` API provides `outflow_streams` with merchant_name, frequency, average_amount, predicted_next_date, and status (MATURE/EARLY_DETECTION). Already in plaid SDK v41.3.0. |
| BILL-02 | User can see a list of all detected bills and subscriptions with amounts and frequency | `recurring_bills` table stores Plaid stream data locally. Bills grouped by frequency sections (Monthly, Weekly, Annual). Summary header shows totals. |
| BILL-03 | User can view a bill calendar showing upcoming charges | Month-grid calendar component using date-fns (already installed v4.1.0) for date math. Each day cell shows bill names/icons. Month navigation via arrows. |
| BILL-04 | User can confirm or dismiss auto-detected bills (false positive handling) | `recurring_bills.user_status` column (confirmed/dismissed/auto). Inline toggle in list. Dismissed section browsable for re-confirmation. |
| GOAL-01 | User can create savings goals with target amount and optional deadline | `savings_goals` table with target_cents, deadline, funding_type (manual/linked). Form with react-hook-form + zod validation. |
| GOAL-02 | User can see visual progress toward each goal (progress bar/ring) | Reuse existing BudgetRing SVG component pattern (custom SVG, ~60 lines). Color-coded by on-track status (green/yellow/red). |
| GOAL-03 | User can track multiple goals simultaneously | Card grid layout showing all goals. SWR hook fetches all household goals. |
| GOAL-04 | Goals can be individual or shared with partner (household-scoped) | Goals table uses household_id FK with IN-subquery RLS (same pattern as budgets, transactions). |
| GOAL-05 | App shows projected completion date based on current savings rate | Calculate savings rate from contribution history. Linear projection: remaining / monthly_rate = months_to_go. Color-code vs deadline. |
| NTWT-01 | User can see total net worth (assets minus liabilities) across all connected accounts | Already computed in `/api/money/accounts` route (sum of all non-hidden account balances). Extend with manual assets. |
| NTWT-02 | Net worth is tracked over time with a line chart | `net_worth_snapshots` table stores daily snapshots. Recharts LineChart (same library as SpendingTrendBar). Timeframe toggle (1M/3M/6M/1Y/All). |
| NTWT-03 | Net worth updates automatically as accounts sync | Hook into existing sync pipeline (lib/plaid/sync.ts) to capture net worth snapshot after each successful sync. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| plaid | 41.3.0 | `transactionsRecurringGet` for bill detection | Already installed; Plaid's own ML does the pattern matching |
| recharts | 3.7.0 | LineChart for net worth, reuse BarChart patterns | Already installed and used for SpendingTrendBar |
| date-fns | 4.1.0 | Date math for calendar grid, month navigation, projections | Already installed; tree-shakeable, immutable |
| decimal.js | 10.6.0 | Money arithmetic (toCents, formatMoney) | Already installed; project convention for all money math |
| react-hook-form | 7.57.0 | Bill edit form, goal creation form | Already installed; project convention for forms |
| zod | 3.25.46 | Validation schemas for bill/goal API endpoints | Already installed; project convention for API validation |
| swr | 2.4.0 | Client data fetching hooks (useBills, useGoals, useNetWorth) | Already installed; project convention for all data fetching |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/ssr | (installed) | Server/admin client for DB operations | All API routes, sync pipeline |
| next-intl | (installed) | i18n for money.bills, money.goals, money.netWorth namespaces | All UI strings |
| lucide-react | (installed) | Icons for bill types, calendar, goals | UI components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plaid recurring API | Custom pattern matching | Plaid API is free (included with Transactions), already handles edge cases (biweekly vs semi-monthly, amount variance). Custom is months of work for worse accuracy. |
| Recharts LineChart | Custom SVG like BudgetRing | LineChart needs axes, tooltips, responsive sizing -- Recharts handles this. BudgetRing pattern only works for simple shapes. |
| date-fns for calendar | Full calendar library (react-big-calendar) | Calendar needs are simple (month grid, bill markers). date-fns + custom grid is lighter than a full calendar dep. |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
lib/db/
  recurring-bills.ts        # RecurringBillsDB class
  savings-goals.ts          # SavingsGoalsDB class
  net-worth-snapshots.ts    # NetWorthSnapshotsDB class
  manual-assets.ts          # ManualAssetsDB class

lib/hooks/
  use-bills.ts              # SWR hook for recurring bills
  use-goals.ts              # SWR hook for savings goals
  use-net-worth.ts          # SWR hook for net worth data + snapshots

lib/validations/
  bills.ts                  # Zod schemas for bill API
  goals.ts                  # Zod schemas for goal API

lib/plaid/
  recurring.ts              # Plaid recurring transactions fetch + transform

components/money/
  bills-list.tsx            # Bill list with frequency sections
  bill-row.tsx              # Individual bill with confirm/dismiss toggle
  bill-form.tsx             # Create/edit bill form
  bill-calendar.tsx         # Month grid calendar view
  bill-calendar-day.tsx     # Day cell showing bills
  bill-summary-header.tsx   # Summary stats header
  goal-card.tsx             # Single goal with ring progress
  goal-grid.tsx             # Multi-goal card grid layout
  goal-form.tsx             # Create/edit goal form
  net-worth-chart.tsx       # LineChart for net worth over time
  net-worth-summary.tsx     # Assets vs liabilities breakdown
  net-worth-accounts.tsx    # Account breakdown by type
  manual-asset-form.tsx     # Add/edit manual asset

app/money/bills/page.tsx           # Bills page
app/money/goals/page.tsx           # Goals page
app/money/net-worth/page.tsx       # Net worth page
app/api/money/bills/route.ts       # Bills API (GET/POST)
app/api/money/bills/[id]/route.ts  # Single bill API (PATCH/DELETE)
app/api/money/bills/sync/route.ts  # Trigger Plaid recurring sync
app/api/money/goals/route.ts       # Goals API (GET/POST)
app/api/money/goals/[id]/route.ts  # Single goal API (PATCH/DELETE)
app/api/money/goals/[id]/contributions/route.ts  # Goal contributions
app/api/money/net-worth/route.ts   # Net worth API (GET)
app/api/money/net-worth/snapshots/route.ts  # Historical snapshots
app/api/money/manual-assets/route.ts        # Manual assets CRUD
```

### Pattern 1: Plaid Recurring Transactions Fetch
**What:** Call Plaid's `transactionsRecurringGet` and transform into our bill records
**When to use:** On first bills page load (if no bills exist), and periodically via cron
**Example:**
```typescript
// lib/plaid/recurring.ts
import { createPlaidClient } from "./client";
import { toCents } from "@/lib/money/arithmetic";
import type { RecurringTransactionFrequency, TransactionStreamStatus } from "plaid";

export interface DetectedBill {
  plaid_stream_id: string;
  account_id: string;          // Plaid account ID (needs mapping)
  merchant_name: string | null;
  description: string;
  amount_cents: number;        // Our sign convention: negative = outflow
  frequency: string;           // WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY
  predicted_next_date: string | null;
  first_date: string;
  last_date: string;
  is_active: boolean;
  status: string;              // MATURE | EARLY_DETECTION
  category_primary: string | null;
}

export async function fetchRecurringTransactions(
  accessToken: string
): Promise<{ inflows: DetectedBill[]; outflows: DetectedBill[] }> {
  const plaid = createPlaidClient();

  const response = await plaid.transactionsRecurringGet({
    access_token: accessToken,
  });

  const transform = (stream: TransactionStream): DetectedBill => ({
    plaid_stream_id: stream.stream_id,
    account_id: stream.account_id,
    merchant_name: stream.merchant_name,
    description: stream.description,
    amount_cents: toCents(-(stream.last_amount?.amount ?? 0)), // Invert Plaid sign
    frequency: stream.frequency,
    predicted_next_date: stream.predicted_next_date ?? null,
    first_date: stream.first_date,
    last_date: stream.last_date,
    is_active: stream.is_active,
    status: stream.status,
    category_primary: stream.personal_finance_category?.primary ?? null,
  });

  return {
    inflows: response.data.inflow_streams.map(transform),
    outflows: response.data.outflow_streams.map(transform),
  };
}
```

### Pattern 2: Bill Confirm/Dismiss Workflow
**What:** User toggles bill status between confirmed/dismissed/auto-detected
**When to use:** Inline toggle in bill list row
**Example:**
```typescript
// Inline toggle approach (not modal, per user decision)
// Bill row has a small "Confirm" / "Dismiss" action
// Status transitions:
//   auto -> confirmed (user confirms)
//   auto -> dismissed (user dismisses false positive)
//   dismissed -> confirmed (user re-confirms from dismissed section)
//   confirmed -> dismissed (user un-confirms)

type BillUserStatus = "auto" | "confirmed" | "dismissed";
```

### Pattern 3: Net Worth Snapshot on Sync
**What:** Capture net worth snapshot after each successful account sync
**When to use:** End of `syncTransactions()` in lib/plaid/sync.ts
**Example:**
```typescript
// After successful sync in sync.ts, compute and store snapshot:
// 1. Sum all non-hidden account balances for the household
// 2. Add manual asset values
// 3. Insert into net_worth_snapshots (one per household per day)
// Use upsert with (household_id, snapshot_date) unique constraint
// to handle multiple syncs per day (keeps latest)
```

### Pattern 4: Savings Rate Projection
**What:** Calculate projected goal completion from contribution history
**When to use:** Goal detail display, goal list cards
**Example:**
```typescript
// For manual funding goals:
//   Get contributions from last 3 months
//   monthly_rate = total_contributions / months_with_data
//   remaining = target_cents - current_cents
//   months_to_go = remaining / monthly_rate
//   projected_date = addMonths(today, months_to_go)
//
// For linked account goals:
//   monthly_rate = (current_balance - balance_3_months_ago) / 3
//   Same projection math
//
// Status colors:
//   green: projected_date <= deadline (or no deadline)
//   yellow: projected_date <= deadline + 30 days
//   red: projected_date > deadline + 30 days
```

### Anti-Patterns to Avoid
- **Building custom recurring detection:** Plaid's API handles merchant matching, interval tolerance, amount variance, and seasonal patterns. Custom solutions will be worse.
- **Storing net worth as computed-only:** Without snapshots, historical net worth requires replaying all balance changes. Store daily snapshots for O(1) chart data retrieval.
- **Using numeric/decimal for money:** Project convention is BIGINT cents. Even for goals and net worth, use integer cents.
- **Fetching Plaid recurring on every page load:** Cache results in DB. Refresh periodically (daily cron or on-demand button), not on every GET.
- **Complex calendar library:** The bill calendar is a month grid showing markers. A full calendar library adds unnecessary weight.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurring charge detection | Pattern matching on transactions | Plaid `transactionsRecurringGet` | Plaid handles biweekly vs semi-monthly, amount variance, seasonal patterns, merchant normalization. Free with Transactions product. |
| Calendar date math | Manual month/day calculations | date-fns `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, `addMonths` | Edge cases: leap years, month-end dates (Jan 31 -> Feb 28), timezone issues |
| Line chart with axes | Custom SVG line chart | Recharts `LineChart` + `ResponsiveContainer` | Axes, tooltips, responsive sizing, animation -- hundreds of lines of SVG math |
| Money formatting | String concatenation | `formatMoney()` from `lib/money/arithmetic.ts` | Already handles negatives, commas, dollar sign, consistent formatting |

**Key insight:** Plaid's recurring transaction detection is the single biggest "don't hand-roll" in this phase. Their algorithm uses transaction history across millions of accounts to identify patterns. Building our own would take months and produce inferior results.

## Common Pitfalls

### Pitfall 1: Plaid Amount Sign Convention
**What goes wrong:** Bill amounts show as positive when they should be negative (expenses), or vice versa
**Why it happens:** Plaid uses positive = outflow (spending), our project uses negative = outflow
**How to avoid:** Always apply `toCents(-plaidAmount)` when converting Plaid recurring stream amounts, same pattern as transaction sync
**Warning signs:** Bills showing as income, or negative values in bill list

### Pitfall 2: Net Worth Snapshot Gaps
**What goes wrong:** Line chart has gaps when no sync happened for several days
**Why it happens:** Only capturing snapshots on Plaid sync means no data on days without syncs
**How to avoid:** Use a daily cron job that creates snapshots from current account balances. Additionally snapshot on each sync for real-time updates. Carry forward last known value for chart interpolation.
**Warning signs:** Missing data points in line chart, jagged gaps

### Pitfall 3: Bill "Paid" Status False Matches
**What goes wrong:** Bill shows as "paid" when a similar but different transaction matches
**Why it happens:** Matching by merchant + approximate amount can catch unrelated transactions
**How to avoid:** Match using Plaid's `transaction_ids` array on the stream. Each stream already contains the transaction IDs that compose it. For paid-this-period check, look for a transaction_id from the stream that falls in the current billing period.
**Warning signs:** Bills showing as paid when they haven't been, or vice versa

### Pitfall 4: Goal Projection Division by Zero
**What goes wrong:** Crash or NaN when calculating projected completion with zero savings rate
**Why it happens:** New goals with no contributions yet, or linked accounts with flat balance
**How to avoid:** Guard against zero/negative savings rate. Show "Not enough data" or "No progress yet" instead of a projected date.
**Warning signs:** NaN or Infinity in goal completion estimates

### Pitfall 5: Calendar Month Boundary Bills
**What goes wrong:** Bills due on the 31st don't show in February (28/29 days)
**Why it happens:** Naive date math doesn't account for months with fewer days
**How to avoid:** Use date-fns for all date calculations. For bills due on 31st, show on last day of shorter months. Plaid's `predicted_next_date` already handles this correctly.
**Warning signs:** Missing bills at end of short months

### Pitfall 6: Manual Asset Net Worth Double-Counting
**What goes wrong:** Property value counted twice -- once as manual asset, once from a connected account
**Why it happens:** Some institutions (mortgage lenders) report property-adjacent accounts
**How to avoid:** Manual assets are clearly separated in the UI. Users add assets NOT tracked by Plaid (home value, car, etc.). The asset form should clarify "for items not tracked by connected accounts."
**Warning signs:** Net worth seems too high compared to user expectation

## Code Examples

### Database Schema: Recurring Bills Table
```sql
-- Source: Project convention (IN-subquery RLS, BIGINT cents, household-scoped)
CREATE TABLE recurring_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plaid_stream_id TEXT,                          -- NULL for manually added bills
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                            -- merchant_name or user-provided name
  description TEXT,
  amount_cents BIGINT NOT NULL,                  -- negative = outflow (expense)
  frequency TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'ANNUALLY')),
  next_due_date DATE,
  user_status TEXT NOT NULL DEFAULT 'auto'
    CHECK (user_status IN ('auto', 'confirmed', 'dismissed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  plaid_status TEXT,                             -- MATURE, EARLY_DETECTION, TOMBSTONED
  category_primary TEXT,
  previous_amount_cents BIGINT,                  -- for price change detection
  source TEXT NOT NULL DEFAULT 'plaid'
    CHECK (source IN ('plaid', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, plaid_stream_id)
);

CREATE INDEX idx_recurring_bills_household ON recurring_bills(household_id);
CREATE INDEX idx_recurring_bills_next_due ON recurring_bills(household_id, next_due_date);
```

### Database Schema: Savings Goals Table
```sql
CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_cents BIGINT NOT NULL,
  current_cents BIGINT NOT NULL DEFAULT 0,       -- running total of contributions
  deadline DATE,                                 -- optional target date
  funding_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (funding_type IN ('manual', 'linked')),
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  icon TEXT,                                     -- optional emoji/icon
  color TEXT,                                    -- optional color for UI
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  note TEXT,
  contributed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_savings_goals_household ON savings_goals(household_id);
CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id);
CREATE INDEX idx_goal_contributions_date ON goal_contributions(goal_id, contributed_at);
```

### Database Schema: Net Worth Snapshots + Manual Assets
```sql
CREATE TABLE net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_cents BIGINT NOT NULL,              -- net worth = assets - liabilities
  assets_cents BIGINT NOT NULL DEFAULT 0,   -- sum of positive balances + manual assets
  liabilities_cents BIGINT NOT NULL DEFAULT 0,  -- sum of negative balances (abs value)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, snapshot_date)
);

CREATE TABLE manual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_cents BIGINT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'other'
    CHECK (asset_type IN ('property', 'vehicle', 'investment', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_net_worth_snapshots_household ON net_worth_snapshots(household_id, snapshot_date);
CREATE INDEX idx_manual_assets_household ON manual_assets(household_id);
```

### Recharts LineChart for Net Worth
```typescript
// Source: Recharts docs (Context7), project SpendingTrendBar pattern
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatMoney } from "@/lib/money/arithmetic";

interface NetWorthDataPoint {
  date: string;     // "Jan 2026", "Feb 2026"
  total: number;    // cents
  assets: number;   // cents
  liabilities: number;  // cents (positive value for display)
}

// Custom tooltip following SpendingTrendBar pattern
function NetWorthTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="tabular-nums" style={{ color: entry.color }}>
          {entry.name}: {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
}

// LineChart with Calm Finance design tokens
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--money-border))" />
    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={55} />
    <Tooltip content={<NetWorthTooltip />} />
    <Line type="monotone" dataKey="total" stroke="hsl(var(--money-sage))" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

### Reusing BudgetRing Pattern for Goal Progress
```typescript
// Source: components/money/budget-ring.tsx (existing project pattern)
// Reuse the same custom SVG ring approach:
// - size/strokeWidth props for flexibility
// - Color based on goal status (green/yellow/red per user decision)
// - Percent = (current_cents / target_cents) * 100

function getGoalColor(projectedDate: Date | null, deadline: Date | null): string {
  if (!deadline) return "hsl(var(--money-sage))";          // green, no deadline
  if (!projectedDate) return "hsl(var(--money-amber))";    // yellow, can't project

  const daysLate = differenceInDays(projectedDate, deadline);
  if (daysLate <= 0) return "hsl(var(--money-sage))";      // green, on track
  if (daysLate <= 30) return "hsl(var(--money-amber))";    // yellow, slightly behind
  return "hsl(var(--money-caution))";                       // red, significantly behind
}
```

### Bill Calendar Month Grid
```typescript
// Source: date-fns docs for calendar grid generation
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths,
} from "date-fns";

function getCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  return eachDayOfInterval({ start, end });
}

// Each day cell checks which bills fall on that date
// Bills with predicted_next_date matching the day get displayed
// For future months, project forward from next_due_date by frequency
```

### Plaid Recurring API Call Pattern
```typescript
// Source: Plaid SDK types (plaid v41.3.0, verified in node_modules)
// Method: plaidClient.transactionsRecurringGet(request)
// Request: { access_token: string, account_ids?: string[] }
// Response: { inflow_streams: TransactionStream[], outflow_streams: TransactionStream[] }
//
// TransactionStream fields we use:
//   stream_id, account_id, merchant_name, description,
//   frequency (WEEKLY|BIWEEKLY|SEMI_MONTHLY|MONTHLY|ANNUALLY),
//   last_amount.amount, average_amount.amount,
//   predicted_next_date, first_date, last_date,
//   is_active, status (MATURE|EARLY_DETECTION|TOMBSTONED),
//   personal_finance_category.primary
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom pattern matching for recurring bills | Plaid `/transactions/recurring/get` API | Available since Plaid API 2020-09-14 | No custom ML needed; Plaid handles edge cases across millions of accounts |
| Compute net worth on every request | Snapshot-based historical tracking | Standard practice in fintech apps | O(1) chart queries vs O(n) balance replays |
| Full calendar library for bill display | Custom month grid + date-fns | date-fns v4 (2024) | Tree-shakeable, no extra deps, simpler than react-big-calendar |
| Recharts v2 | Recharts v3.7.0 (already installed) | v3 released 2024 | Better TypeScript support, smaller bundle, same API |

**Deprecated/outdated:**
- Plaid's `category` and `category_id` on TransactionStream: deprecated in favor of `personal_finance_category` (PFCv2). Our project already uses PFCv2.
- `is_user_modified` on TransactionStream: always returns `false` now (deprecated by Plaid).

## Open Questions

1. **Plaid Recurring API Rate Limits**
   - What we know: Plaid's recurring endpoint is included with the Transactions product at no extra cost. The method exists in SDK v41.3.0.
   - What's unclear: Whether Plaid has specific rate limits on `/transactions/recurring/get` separate from general API limits. The standard Plaid rate limit is 100 requests/minute.
   - Recommendation: Call it once per bank connection per day (via cron), not on every page load. Cache results in `recurring_bills` table. LOW risk since our user base is small.

2. **Net Worth Snapshot Frequency**
   - What we know: We need daily snapshots for the line chart. Plaid syncs happen via cron (once/day) and on-demand.
   - What's unclear: Should we also snapshot on manual asset value changes?
   - Recommendation: Snapshot on: (a) daily cron, (b) after successful Plaid sync, (c) after manual asset CRUD. Use upsert on (household_id, snapshot_date) so multiple snapshots per day just keep the latest.

3. **Linked Account Goal Balance Tracking**
   - What we know: Users can link a goal to a savings account. The goal's current_cents should reflect the account balance.
   - What's unclear: Should linked goals auto-update on every sync, or only when user explicitly refreshes?
   - Recommendation: Auto-update on sync. When a linked account's balance changes, update the goal's current_cents = account.balance_cents. This is the user's expectation for "linked."

## Sources

### Primary (HIGH confidence)
- Plaid SDK v41.3.0 TypeScript types (`node_modules/plaid/dist/api.d.ts`) -- verified `TransactionStream`, `TransactionsRecurringGetRequest/Response`, `RecurringTransactionFrequency`, `TransactionStreamStatus` interfaces
- `/websites/plaid` Context7 -- Plaid `/transactions/recurring/get` API documentation, response schema, frequency values, status lifecycle
- `/recharts/recharts` Context7 -- LineChart API, ResponsiveContainer, Tooltip customization, XAxis/YAxis formatting
- Existing codebase: `lib/plaid/sync.ts`, `lib/money/arithmetic.ts`, `components/money/spending-trend-bar.tsx`, `components/money/budget-ring.tsx`, `lib/db/budgets.ts` -- established patterns

### Secondary (MEDIUM confidence)
- `/websites/plaid` Context7 -- Historical balance data structure from Assets API (relevant for understanding balance tracking approaches)
- `/websites/plaid` Context7 -- Liabilities API structure (relevant for understanding credit/loan account handling in net worth)

### Tertiary (LOW confidence)
- None -- all findings verified against installed SDK types and Context7 docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in prior phases
- Architecture: HIGH -- patterns follow established codebase conventions (DB class, SWR hook, API route, component)
- Plaid recurring API: HIGH -- verified method signature and types directly from installed plaid v41.3.0 SDK
- Bill detection: HIGH -- Plaid does the detection; we just store and present results
- Goals: HIGH -- straightforward CRUD with calculation layer
- Net worth charting: HIGH -- Recharts LineChart verified via Context7, similar to existing SpendingTrendBar
- Pitfalls: MEDIUM -- based on fintech domain knowledge and Plaid API understanding, some edge cases may surface during implementation

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days -- stable libraries, stable Plaid API)
