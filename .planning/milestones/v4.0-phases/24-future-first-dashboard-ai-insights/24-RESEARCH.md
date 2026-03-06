# Phase 24: Future-First Dashboard & AI Insights - Research

**Researched:** 2026-02-24
**Domain:** Forward-looking financial dashboard, cash flow projections, contextual insights engine
**Confidence:** HIGH

## Summary

Phase 24 transforms the `/money` page from a simple hub into a forward-looking financial dashboard and adds contextual, anxiety-aware insights to existing money pages. The phase has no new external dependencies -- it builds entirely on the existing stack (SWR, date-fns, Supabase queries, Calm Finance design tokens) and synthesizes data from phases 20-23: transactions, budgets, bills, goals, and net worth.

The technical core is: (1) a server-side `/api/money/dashboard` endpoint that aggregates account balances, upcoming bills, and income patterns to compute cash flow projections; (2) a server-side `/api/money/insights` endpoint that runs heuristic analysis (spending anomalies, subscription price changes, goal progress) and returns structured insight objects; (3) client components that render these projections with the Calm Finance aesthetic. No LLM/AI API calls are needed -- "AI Insights" means algorithmic pattern detection on the server, surfaced as structured data.

**Primary recommendation:** Build the dashboard API first with projection computation as pure functions (easy to test), then layer UI components on top. Insights are independent of the dashboard and should be a separate API endpoint consumed by each page's existing components.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Dashboard layout & hierarchy**: Combined summary row as hero -- three numbers side-by-side (available now, upcoming bills total, projected end-of-month balance), equal weight, no single dominant metric
- **Visual density**: Calm & spacious -- generous whitespace, large type for key numbers, only essential info visible, consistent with Calm Finance design language
- **Income detection**: Auto-detect recurring deposits, then show a one-time confirmation prompt. User confirms or corrects before projections use the data.
- **Danger zones on bill calendar**: Red/amber date shading -- amber for tight balance dates, red for projected negative balance dates. Visual heat map on calendar.
- **Confidence indicators**: Subtle qualifier text (e.g., "estimated" or "based on last 3 months"), no visual bands or ranges, just context labels
- **Contextual insights tone**: Align with Calm Finance design language already established
- **Insight dismissibility**: User can dismiss individual insights, but they resurface if the same pattern recurs in a future period. Persistent but not nagging.
- **Insight volume**: Max 3-5 insights per page. Show more if relevant activity warrants it.
- **Insight compute**: Server-side API -- dedicated `/api/money/insights` endpoint returns computed insights. Client stays light, insights can be cached.
- **Insight placement**: Embedded in relevant pages (spending anomalies on budgets, subscription alerts on bills, goal progress on goals). No chatbot, no separate insights page.
- **Money summary card content**: Spending pulse -- "$X spent today / $Y this week" with a small progress bar against budget. Activity-focused, not projection-focused.
- **Money summary card visibility**: Auto-show when user has connected accounts. No card if money features unused. No explicit toggle needed.
- **Money summary card loading**: Independent SWR hook so habits/tasks are never blocked by money data.

### Claude's Discretion
- Section order below the summary row hero
- Empty/low-data state approach for the dashboard
- Projection timeframe (next paycheck vs rolling 30 days vs end-of-month)
- Insight tone (within Calm Finance language)
- Money summary card placement on main dashboard
- Money summary card tap behavior (navigate vs expand)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Default money home view shows forward-looking financial picture | Replaces current MoneyPageShell with dashboard layout; hero summary row + sections below |
| DASH-02 | Dashboard shows available money until next paycheck | Income pattern detection from transactions + current balance - upcoming bills computation |
| DASH-03 | Dashboard shows upcoming bills for next 30 days with total amounts | Reuse existing useBills hook data, filter active+confirmed bills with next_due_date within 30 days |
| DASH-04 | Dashboard shows projected end-of-month balance at current spending pace | Current balance + projected income - projected bills - projected discretionary spending (based on current month's daily average) |
| DASH-05 | Income patterns auto-detected from transaction history | Server-side analysis of positive amount_cents transactions, grouped by merchant_name + frequency detection |
| DASH-06 | Smart bill calendar with projected balance overlay and danger-zone highlighting | Extend existing BillCalendar with balance projection per day and red/amber CSS classes |
| DASH-07 | Money summary card on existing BetterR.Me habit/task dashboard | New `MoneySummaryCard` component with independent SWR hook, added to DashboardContent |
| AIML-01 | App surfaces spending anomalies with context | Server-side computation: compare current month category spending vs 3-month rolling average |
| AIML-02 | App detects subscription price increases and alerts user | Already tracked in recurring_bills.previous_amount_cents; surface via insights endpoint |
| AIML-03 | App shows progress toward goals with projected completion date | Already computed in goals API (GoalWithProjection); surface as insight on goals page |
| AIML-04 | Insights embedded in relevant pages, not chatbot | Insights component renders structured data from API, mounted on each page |
| AIML-05 | Insights use anxiety-aware, progress-framing language consistent with Calm Finance | i18n strings using progress framing ("up 15% from your 3-month average" not "you overspent") |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| date-fns | 4.x (already installed) | Date math for projections, intervals, bill scheduling | Already used extensively in bill-calendar, budget-overview, goals API |
| SWR | 2.x (already installed) | Client data fetching with dedup, caching, keepPreviousData | All money hooks use this pattern; deduplication means shared hooks are free |
| decimal.js | (already installed) | Money arithmetic | Project standard: integer cents in DB, formatMoney for display |
| Zod | (already installed) | API input validation | All API routes use Zod schemas at boundaries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (already installed) | Icons for dashboard cards | Consistent with existing money UI |
| sonner | (already installed) | Toast notifications | Income confirmation prompt feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side insight computation | Edge AI / LLM API | Massive overkill, adds latency + cost + hallucination risk. Simple heuristics are sufficient and predictable. |
| Custom projection math | Financial library (e.g., financial.js) | Unnecessary dependency; our projections are simple arithmetic on integer cents |
| Separate insights page | In-page contextual cards | User decided: embedded in relevant pages, no chatbot or separate page |

**Installation:**
No new dependencies needed. All libraries are already installed.

## Architecture Patterns

### Recommended Project Structure
```
lib/
  money/
    arithmetic.ts          # existing (formatMoney, toCents, etc.)
    projections.ts         # NEW: pure functions for cash flow projection
    income-detection.ts    # NEW: pure functions for income pattern detection
    insights.ts            # NEW: pure functions for insight computation

lib/hooks/
    use-dashboard-money.ts # NEW: SWR hook for /api/money/dashboard
    use-insights.ts        # NEW: SWR hook for /api/money/insights
    use-money-summary.ts   # NEW: SWR hook for money summary card on main dashboard

app/api/money/
    dashboard/route.ts     # NEW: dashboard summary + projections endpoint
    insights/route.ts      # NEW: contextual insights endpoint
    income/route.ts        # NEW: income pattern detection + confirmation

components/money/
    money-dashboard.tsx       # NEW: replaces MoneyPageShell internals
    dashboard-hero.tsx        # NEW: three-number summary row
    upcoming-bills-list.tsx   # NEW: next-30-days bill preview
    cash-flow-projection.tsx  # NEW: projected balance section
    income-confirmation.tsx   # NEW: one-time income prompt
    insight-card.tsx          # NEW: reusable contextual insight card
    smart-bill-calendar.tsx   # NEW: enhanced calendar with balance overlay

components/dashboard/
    money-summary-card.tsx    # NEW: spending pulse card for habits/tasks dashboard
```

### Pattern 1: Pure Projection Functions (Testable Core)
**What:** Extract all financial computation as pure functions in `lib/money/projections.ts`. API routes call these functions; unit tests validate edge cases without HTTP.
**When to use:** Any calculation involving balances, spending rates, or date projections.
**Example:**
```typescript
// lib/money/projections.ts

interface ProjectionInput {
  currentBalanceCents: number;
  upcomingBills: { amount_cents: number; due_date: string }[];
  dailySpendingRateCents: number;
  confirmedIncome: { amount_cents: number; next_date: string }[] | null;
  endDate: string; // projection end date
}

interface DailyBalance {
  date: string;
  projected_balance_cents: number;
  has_income: boolean;
  bill_total_cents: number;
}

/**
 * Project daily balances from today to endDate.
 * Pure function: no DB calls, no side effects.
 */
export function projectDailyBalances(input: ProjectionInput): DailyBalance[] {
  // Walk forward day by day from today to endDate
  // Subtract daily spending rate
  // Subtract bills on their due dates
  // Add income on confirmed pay dates
  // Return array of daily balance snapshots
}

/**
 * Compute "available until next paycheck" metric.
 * = current balance - bills due before next paycheck
 */
export function computeAvailableMoney(
  currentBalanceCents: number,
  billsDueBeforePayday: { amount_cents: number }[],
  nextPayDate: string | null,
): number {
  // If no confirmed income, use end-of-month as fallback
}
```

### Pattern 2: Server-Side Insights as Structured Data
**What:** The `/api/money/insights` endpoint runs heuristic checks and returns a flat array of typed insight objects. Each insight has a `type`, `page` (where it should render), `severity`, and pre-formatted message parts (not a raw string -- allows i18n).
**When to use:** All contextual insights.
**Example:**
```typescript
// lib/money/insights.ts

type InsightType =
  | "spending_anomaly"      // AIML-01
  | "subscription_increase" // AIML-02
  | "goal_progress"         // AIML-03
  | "low_balance_warning"
  | "bill_upcoming";

type InsightPage = "dashboard" | "budgets" | "bills" | "goals";
type InsightSeverity = "info" | "attention" | "positive";

interface Insight {
  id: string; // deterministic hash for dismiss tracking
  type: InsightType;
  page: InsightPage;
  severity: InsightSeverity;
  // Structured data for i18n rendering (not raw text)
  data: Record<string, string | number>;
  // e.g., { category: "Groceries", percent_change: 15, period: "3-month avg" }
}
```

### Pattern 3: Independent SWR Hook for Money Summary Card
**What:** The money summary card on `/dashboard` uses its own SWR key (`/api/money/dashboard/summary`) completely independent of the habits/tasks data flow. SWR deduplication ensures no double-fetching if multiple components use the same key.
**When to use:** Money summary card on the main dashboard.
**Example:**
```typescript
// lib/hooks/use-money-summary.ts
"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface MoneySummary {
  spent_today_cents: number;
  spent_this_week_cents: number;
  budget_total_cents: number | null;
  has_accounts: boolean;
}

export function useMoneySummary() {
  const { data, error } = useSWR<MoneySummary>(
    "/api/money/dashboard/summary",
    fetcher,
    {
      // Don't block: if money fails, dashboard works fine
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      refreshInterval: 300_000, // 5 min refresh is fine for spending pulse
    }
  );

  return {
    summary: data ?? null,
    isLoading: !data && !error,
    hasAccounts: data?.has_accounts ?? false,
  };
}
```

### Pattern 4: Income Pattern Detection Algorithm
**What:** Detect recurring income deposits by analyzing positive-amount transactions. Group by merchant_name, detect frequency (biweekly, semi-monthly, monthly), and compute confidence based on consistency.
**When to use:** DASH-05 income detection.
**Example:**
```typescript
// lib/money/income-detection.ts

interface DetectedIncome {
  merchant_name: string;
  amount_cents: number; // median of detected amounts
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";
  confidence: number; // 0-1, based on consistency
  last_occurrence: string;
  next_predicted: string;
}

/**
 * Detect recurring income from transaction history.
 * Pure function: takes transaction array, returns detected patterns.
 *
 * Algorithm:
 * 1. Filter positive amount transactions (income, not expenses)
 * 2. Group by normalized merchant_name
 * 3. For each group with 3+ occurrences:
 *    a. Compute intervals between consecutive dates
 *    b. Detect frequency pattern (7d = weekly, 14d = biweekly, 15d = semi-monthly, 30d = monthly)
 *    c. Compute confidence = consistency of intervals / expected interval
 * 4. Return patterns with confidence >= 0.7
 */
export function detectIncomePatterns(
  transactions: { merchant_name: string | null; amount_cents: number; transaction_date: string }[]
): DetectedIncome[] {
  // Implementation
}
```

### Pattern 5: Dismissible Insights with Period-Aware Resurfacing
**What:** Dismissed insights are tracked in a DB table `dismissed_insights` keyed by (household_id, insight_id, period). The insight_id is a deterministic hash of the insight type + parameters. When the period changes (e.g., new month for spending anomalies), the insight resurfaces because the period key changed.
**When to use:** AIML-04/AIML-05 dismissibility requirement.
**Example:**
```typescript
// Insight ID is deterministic:
// spending_anomaly:groceries:2026-02 -> unique per category per month
// subscription_increase:netflix:2026-02 -> unique per bill per detection month
// This means dismissing "Groceries up 15%" in February won't suppress it in March
```

### Pattern 6: Danger Zone CSS for Bill Calendar
**What:** Extend BillCalendarDay with projected balance data. Apply Calm Finance color tokens for danger zones: `--money-caution` (existing, muted coral) for red zones, `--money-amber` (existing) for tight balance dates.
**When to use:** DASH-06 smart bill calendar.
**Example:**
```typescript
// The existing BillCalendarDay already has isToday, isCurrentMonth styling.
// Add a new `projectedBalanceCents` prop and `balanceStatus` derived prop:

type BalanceStatus = "safe" | "tight" | "danger";

// safe = projected balance > 2x daily spending rate (no highlight)
// tight = projected balance > 0 but < 2x daily spending rate (amber)
// danger = projected balance <= 0 (red/caution)

// CSS classes:
// tight: bg-[hsl(var(--money-amber-light))] border-l-2 border-l-[hsl(var(--money-amber))]
// danger: bg-red-50 dark:bg-red-950/20 border-l-2 border-l-[hsl(var(--money-caution))]
```

### Anti-Patterns to Avoid
- **Loading waterfall on dashboard:** Do NOT fetch dashboard data sequentially (accounts, then bills, then projections). Use a single `/api/money/dashboard` endpoint that aggregates server-side and returns one response.
- **Blocking habits/tasks with money data:** The money summary card MUST use its own SWR hook. Never add money data to the DashboardData type or the `/api/dashboard` route.
- **Raw text insights:** Do NOT return pre-formatted English strings from the insights API. Return structured data objects so the client can render with i18n translations.
- **Over-engineering projections:** Do NOT build a financial modeling engine. Simple arithmetic (balance - bills - daily_rate * days) is sufficient and predictable.
- **Aggressive red/green colors:** Calm Finance uses muted tones (--money-sage, --money-amber, --money-caution). Never use bright red/green for financial data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date arithmetic for projections | Custom date math | date-fns `addDays`, `eachDayOfInterval`, `differenceInDays` | Already used in bill-calendar; handles edge cases (month boundaries, DST) |
| Money formatting | Template literals | `formatMoney()` from `lib/money/arithmetic.ts` | Project standard, handles negatives, comma grouping, consistent across app |
| Bill frequency normalization | Manual switch statements | `MONTHLY_MULTIPLIER` map from `app/api/money/bills/route.ts` | Already computed and tested; extract to shared utility |
| SWR data fetching | Custom fetch + useState | SWR hooks with `keepPreviousData` | Project standard, handles caching, dedup, error states |

**Key insight:** This phase is 90% data synthesis and 10% new UI. Almost all the raw data (transactions, bills, goals, budgets, account balances) already exists and is accessible via existing DB classes and hooks. The value is in computation and presentation, not data acquisition.

## Common Pitfalls

### Pitfall 1: Sign Convention Confusion
**What goes wrong:** Projections compute wrong balances because expenses and income have different signs in the DB.
**Why it happens:** This project uses negative amount_cents for outflows (expenses) and positive for inflows (income). Bills are stored as negative cents. Easy to double-negate.
**How to avoid:** All projection functions should document sign convention at the top. Use `Math.abs()` when displaying bill amounts. Income transactions have `amount_cents > 0`.
**Warning signs:** Dashboard shows negative "available money" when user has plenty of balance, or bills show as zero.

### Pitfall 2: Empty State Cascade
**What goes wrong:** Dashboard shows skeleton/error when one data source is empty (e.g., no bills, no budget, no income detected).
**Why it happens:** Projections depend on multiple data sources. If any is missing, naive code errors out.
**How to avoid:** Every projection function must handle partial data gracefully. No bills? Projection only uses spending rate. No detected income? Show "available until end of month" instead of "until next paycheck". No budget? Skip spending pulse progress bar.
**Warning signs:** New user with connected accounts but no bills/budgets sees broken dashboard.

### Pitfall 3: Insight ID Collisions
**What goes wrong:** Dismissing one insight accidentally dismisses another, or insights never resurface.
**Why it happens:** Insight IDs not deterministic or not period-scoped.
**How to avoid:** Insight ID = hash of (type, relevant_entity_id, period). Period is month for spending anomalies, detection_date for subscription increases.
**Warning signs:** User dismisses "Groceries up 15%" and "Dining out up 20%" also disappears.

### Pitfall 4: Dashboard API N+1 Queries
**What goes wrong:** Dashboard endpoint is slow because it makes separate DB queries for each bill, each account, etc.
**Why it happens:** Composing from existing DB class methods that each make their own queries.
**How to avoid:** Dashboard API should make bulk queries: one for all accounts, one for all active bills, one for recent transactions (aggregated). Use existing `getByHousehold()` methods that return all data in one call.
**Warning signs:** Dashboard takes 2+ seconds to load; Supabase logs show 10+ queries per request.

### Pitfall 5: Timezone Mismatch in Projections
**What goes wrong:** Bill projected on wrong day, spending "today" shows yesterday's data.
**Why it happens:** Server runs in UTC, user is in local timezone. Dates computed server-side may be off by a day.
**How to avoid:** Dashboard API accepts a `date` query param from the client (matching project convention). All date comparisons use this date as "today". This is the same pattern used by `/api/dashboard?date=`.
**Warning signs:** Late-night users see tomorrow's bills as "today" or miss today's spending.

### Pitfall 6: Money Summary Card Blocking Dashboard
**What goes wrong:** Main dashboard (habits/tasks) shows loading spinner because money data is slow or fails.
**Why it happens:** Money data fetched in the same SWR call as habits/tasks.
**How to avoid:** Money summary card uses its own independent SWR hook with `shouldRetryOnError: false`. If money API fails, the card simply doesn't render. The rest of the dashboard is unaffected.
**Warning signs:** Users without bank connections see slow/broken dashboard.

## Code Examples

Verified patterns from the existing codebase:

### Existing SWR Hook Pattern (from use-bills.ts)
```typescript
// All money hooks follow this exact pattern:
export function useBills(view: ViewMode = "mine") {
  const { data, error, mutate } = useSWR<BillsResponse>(
    `/api/money/bills?view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );
  const isLoading = !data && !error;
  return { bills: data?.bills ?? [], summary: data?.summary ?? null, isLoading, error, mutate };
}
```

### Existing Bill Frequency Normalization (from bills/route.ts)
```typescript
// Already computed -- extract to shared util for dashboard use
const MONTHLY_MULTIPLIER: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
  ANNUALLY: 1 / 12,
};
```

### Existing Bill Date Projection (from bill-calendar.tsx)
```typescript
// getBillDatesInMonth already exists for projecting bill due dates
// Can be reused/adapted for projecting bills in the next 30 days
function getBillDatesInMonth(bill: RecurringBill, monthStart: Date, monthEnd: Date): Date[] {
  // Handles WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, ANNUALLY
}
```

### Existing API Route Pattern (from bills/route.ts)
```typescript
// All money API routes follow this exact pattern:
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const householdId = await resolveHousehold(supabase, user.id);
    // ... business logic ...
    return NextResponse.json({ data });
  } catch (error) {
    log.error("GET /api/money/... error", error);
    return NextResponse.json({ error: "Failed to ..." }, { status: 500 });
  }
}
```

### Existing Dashboard Content Layout (from dashboard-content.tsx)
```typescript
// The main dashboard renders sections in a space-y-6 vertical layout:
// 1. Greeting card
// 2. Weekly insight card (conditional)
// 3. Motivation message (conditional)
// 4. Absence recovery cards (conditional)
// 5. Daily snapshot stats (conditional)
// 6. Milestone celebrations (conditional)
// 7. Main content grid (xl:grid-cols-2): Habits | Tasks
//
// Money summary card should slot in between sections,
// conditionally rendered when hasAccounts is true.
```

### Existing Calm Finance CSS Tokens (from globals.css)
```css
/* Light mode */
--money-sage: 155 25% 55%;
--money-sage-light: 155 20% 92%;
--money-amber: 35 60% 55%;
--money-amber-light: 35 40% 92%;
--money-caution: 15 65% 55%;
--money-surface: 155 10% 98%;
--money-border: 155 15% 88%;

/* Dark mode */
--money-sage: 155 20% 50%;
--money-sage-light: 155 15% 16%;
--money-amber: 35 50% 55%;
--money-amber-light: 35 30% 16%;
--money-caution: 15 55% 45%;
--money-surface: 155 8% 15%;
--money-border: 155 10% 22%;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full-page financial dashboards with complex charts | Forward-looking summary with 3 key numbers | Mint shutdown (2024) / new fintech trends | Users want quick answers ("am I ok?"), not chart museums |
| AI chatbot for financial advice | Contextual embedded insights | SEC/FINRA concerns + user confusion | Insights appear where relevant, no conversational overhead |
| Separate insights page | Embedded insights on relevant pages | User decision (CONTEXT.md) | Each page shows only its relevant insights |
| Real-time projections recalculated on every render | Server-computed projections cached via SWR | Project SWR pattern | Reduces client-side computation; SWR handles stale-while-revalidate |

**Deprecated/outdated:**
- None applicable. This phase builds on established project patterns.

## Open Questions

1. **Dismissed insights storage: DB table vs localStorage?**
   - What we know: User decision says "dismiss individual insights, resurface if pattern recurs in future period." This implies cross-device persistence (DB table).
   - What's unclear: Whether localStorage is acceptable for MVP (simpler) or DB is required from day one.
   - Recommendation: Use a `dismissed_insights` DB table (household_id, insight_id, dismissed_at). It's a simple table, and cross-device consistency matters for couples households. A few extra rows per household is negligible.

2. **Income confirmation storage**
   - What we know: User confirmed "one-time prompt, once confirmed it's used until pattern changes"
   - What's unclear: Exact schema for storing confirmed income patterns.
   - Recommendation: New `confirmed_income_patterns` table (household_id, merchant_name, amount_cents, frequency, next_expected_date, confirmed_at). If the detected pattern changes significantly (amount differs >10% or frequency changes), mark as "needs reconfirmation" and prompt again.

3. **Projection timeframe (Claude's discretion)**
   - What we know: Options are next paycheck, rolling 30 days, or end of month.
   - Recommendation: **End of current month as default, with "until next paycheck" when income is confirmed.** Rationale: end-of-month is universally meaningful (rent, bills cycle monthly), and "until next paycheck" becomes available once income is detected + confirmed, providing a more actionable metric.

4. **Dashboard section order below hero (Claude's discretion)**
   - Recommendation: (1) Upcoming bills next 7 days (urgency), (2) Cash flow projection / balance trend, (3) Quick nav links to sub-pages. Rationale: "what's happening soon" is most actionable.

5. **Money summary card placement on main dashboard (Claude's discretion)**
   - Recommendation: Place between the Motivation Message and the Daily Snapshot stats. It's contextual (how am I doing financially today?) and fits naturally between motivation and stats. If the user has no connected accounts, the card simply doesn't render.

6. **Money summary card tap behavior (Claude's discretion)**
   - Recommendation: Navigate to `/money`. Simple, predictable, consistent with how other dashboard elements work (habit clicks go to /habits, task clicks go to /tasks).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `components/money/money-page-shell.tsx` -- current /money page structure to be replaced
- Codebase analysis: `components/money/bill-calendar.tsx` -- existing bill date projection logic to extend
- Codebase analysis: `app/api/money/bills/route.ts` -- existing MONTHLY_MULTIPLIER and computeSummary patterns
- Codebase analysis: `app/api/money/goals/route.ts` -- existing projection computation (computeProjection, computeMonthlyRate)
- Codebase analysis: `components/dashboard/dashboard-content.tsx` -- existing dashboard layout for money card placement
- Codebase analysis: `lib/db/types.ts` -- all money types (RecurringBill, Transaction, BudgetWithCategories, etc.)
- Codebase analysis: `lib/hooks/use-*.ts` -- all existing SWR hook patterns
- Context7: `/vercel/swr-site` -- SWR deduplication, conditional fetching, isLoading vs isValidating
- Context7: `/date-fns/date-fns` -- date-fns v4 API for projection calculations

### Secondary (MEDIUM confidence)
- User CONTEXT.md decisions -- locked implementation choices for dashboard and insights

### Tertiary (LOW confidence)
- None. All findings verified against codebase and Context7.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all libraries already in use
- Architecture: HIGH -- patterns derived directly from existing codebase conventions (SWR hooks, API route structure, DB class pattern, Calm Finance tokens)
- Pitfalls: HIGH -- identified from analyzing existing code patterns and sign conventions
- Projections algorithm: MEDIUM -- financial projection logic is straightforward but edge cases (partial data, empty states) need careful handling during implementation
- Income detection: MEDIUM -- algorithm is well-defined but hasn't been tested against real Plaid transaction data

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable domain, no external dependency changes expected)
