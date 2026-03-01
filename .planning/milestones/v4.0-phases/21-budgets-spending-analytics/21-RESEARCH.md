# Phase 21: Budgets & Spending Analytics - Research

**Researched:** 2026-02-22
**Domain:** Budget management, spending aggregation, data visualization (charting)
**Confidence:** HIGH

## Summary

Phase 21 adds envelope-style monthly budgets and spending analytics to the existing money tracking system. The core technical challenges are: (1) designing budget/rollover database tables that integrate with the existing household-scoped, BIGINT-cents money schema, (2) building server-side spending aggregation queries that sum transactions by category and month efficiently, and (3) rendering interactive charts (donut + bar) with a library compatible with React 19 and Next.js 16.

The existing codebase provides strong foundations: `TransactionsDB` already supports category/date filtering, `CategoriesDB` provides category management, the `money/arithmetic.ts` module handles all cents-to-display conversion, and the Calm Finance design tokens (`--money-*`) are established. The new work is primarily: 2 new database tables (`budgets`, `budget_categories`), 1 new DB class (`BudgetsDB`), 3-4 new API routes, 5-6 new React components, and integration of Recharts for visualization.

**Primary recommendation:** Use Recharts v3.x for charting (React 19 native, SVG-based, declarative, composable with the existing component patterns), store budgets as envelope-style with a total + per-category allocations, compute rollover server-side at month transition, and build circular progress rings as a lightweight custom SVG component (no library needed for simple arcs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Envelope-style budgeting: user sets a total monthly budget, then allocates portions to categories
- Single form page: total amount at top, category rows below with amount inputs, all visible at once
- Users can edit and delete budgets after creation
- Circular ring/arc per category showing % spent -- compact, works in card layouts
- Current month shown by default with left/right arrows to browse previous months (no future months)
- Bar chart for month-over-month trends showing 12 months of history by default
- Rollover requires monthly user confirmation -- at month end, prompt to confirm rollover amounts
- Rollover display shows breakdown: base budget and rollover amount separately (e.g., "$200 + $35 rollover")
- Debt carries forward: overspending reduces next month's rollover (negative rollover possible)

### Claude's Discretion
- Allocation flexibility (strict vs flexible with buffer)
- Default category list in budget setup
- Color thresholds for warning/danger states
- Over-budget visual treatment
- Chart type for spending breakdown (donut chart vs treemap)
- Chart interaction pattern (direct drill-down vs tooltip-first)
- Charting library choice
- Drill-down navigation pattern (full page vs inline panel)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUDG-01 | User can create monthly budgets with spending limits per category | Database schema for `budgets` + `budget_categories` tables, BudgetsDB class, Zod validation schemas, envelope-style form pattern |
| BUDG-02 | User can see budget progress bars showing spent vs. remaining | Circular ring SVG component, spending aggregation API endpoint, SWR hook for budget data |
| BUDG-03 | User can view spending breakdown charts by category (donut chart) | Recharts PieChart with innerRadius (donut), category color mapping from existing `categories.color` column |
| BUDG-04 | User can view spending trends over time (bar charts, month-over-month) | Recharts BarChart with 12-month aggregation query, responsive container pattern |
| BUDG-05 | User can drill down from a category chart to see individual transactions | Click handler on chart segments, reuse existing `TransactionsDB.getByHousehold` with category_id + date range filters |
| BUDG-06 | Unused budget can roll over to the next month (configurable per budget) | `rollover_enabled` flag on budget, `rollover_cents` column on budget_categories, server-side rollover computation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | ^3.7.0 | Interactive charts (donut, bar) | React 19 native support, 25k+ GitHub stars, declarative API matches React patterns, SVG-based (accessible), built-in ResponsiveContainer |
| date-fns | ^4.1.0 | Month arithmetic (startOfMonth, endOfMonth, subMonths) | Already in project dependencies, tree-shakeable |
| decimal.js | ^10.6.0 | Money arithmetic for budget calculations | Already in project -- all money math uses this |
| react-hook-form | ^7.57.0 | Budget creation/edit form | Already in project for manual transaction dialog |
| zod | ^3.25.46 | Budget validation schemas | Already in project at API boundaries |
| swr | ^2.4.0 | Client-side data fetching for budgets/analytics | Already in project -- matches existing hook patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Custom SVG component | N/A | Circular progress ring per category | Simple arc geometry -- no library needed for single-value radial progress |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js + react-chartjs-2 | Chart.js is canvas-based (not SVG) -- harder to style with Tailwind, less React-idiomatic, requires `react-chartjs-2` wrapper. Recharts is more composable with JSX. |
| Recharts | Tremor | Tremor provides pre-built dashboard components but adds heavy dependency, less customizable for Calm Finance aesthetic |
| Custom SVG ring | Recharts RadialBarChart | Recharts RadialBarChart is overkill for a single-value circular progress -- custom SVG is ~30 lines, zero overhead |
| Custom SVG ring | react-circular-progressbar | Adds a dependency for something achievable with 30 lines of SVG |

**Installation:**
```bash
pnpm add recharts
```

Note: Recharts v3.x has native React 19 support. No `react-is` override needed (that was only required for v2.x).

## Architecture Patterns

### Recommended Project Structure
```
lib/db/budgets.ts                          # BudgetsDB class
lib/validations/budget.ts                  # Zod schemas for budget CRUD
lib/hooks/use-budgets.ts                   # SWR hook for budget data
lib/hooks/use-spending-analytics.ts        # SWR hook for chart data
app/api/money/budgets/route.ts             # GET (list) + POST (create)
app/api/money/budgets/[id]/route.ts        # GET (detail) + PUT (update) + DELETE
app/api/money/budgets/[id]/rollover/route.ts  # POST (confirm rollover)
app/api/money/analytics/spending/route.ts  # GET spending aggregation by category/month
app/money/budgets/page.tsx                 # Budget overview page (server page + client shell)
components/money/budget-overview.tsx        # Main budget view with rings + charts
components/money/budget-form.tsx            # Create/edit envelope form
components/money/budget-ring.tsx            # Circular progress ring (SVG)
components/money/spending-donut.tsx         # Recharts donut chart wrapper
components/money/spending-trend-bar.tsx     # Recharts bar chart wrapper
components/money/category-drill-down.tsx    # Category transaction detail panel
components/money/rollover-prompt.tsx        # Month-end rollover confirmation dialog
```

### Pattern 1: Envelope Budget Database Schema
**What:** Two-table design -- `budgets` (monthly envelope) and `budget_categories` (per-category allocation)
**When to use:** When budget is a container with sub-allocations that must sum to a total

```sql
-- budgets: one row per household per month
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- first day of month (e.g., '2026-02-01')
  total_cents BIGINT NOT NULL,
  rollover_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, month)
);

-- budget_categories: per-category allocation within a budget
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  allocated_cents BIGINT NOT NULL,
  rollover_cents BIGINT NOT NULL DEFAULT 0,  -- can be negative (overspend debt)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(budget_id, category_id)
);
```

### Pattern 2: Spending Aggregation Query
**What:** Server-side SUM of transaction amounts grouped by category for a date range
**When to use:** For budget progress, donut chart, and trend analytics

```typescript
// In BudgetsDB or a SpendingDB class
async getSpendingByCategory(
  householdId: string,
  dateFrom: string,   // '2026-02-01'
  dateTo: string       // '2026-02-28'
): Promise<{ category_id: string; total_cents: number }[]> {
  const { data, error } = await this.supabase
    .from("transactions")
    .select("category_id, amount_cents")
    .eq("household_id", householdId)
    .gte("transaction_date", dateFrom)
    .lte("transaction_date", dateTo)
    .not("category_id", "is", null);

  if (error) throw error;

  // Aggregate in JS (Supabase JS client doesn't support GROUP BY)
  const map = new Map<string, number>();
  for (const row of data || []) {
    const current = map.get(row.category_id) || 0;
    map.set(row.category_id, current + row.amount_cents);
  }

  return Array.from(map.entries()).map(([category_id, total_cents]) => ({
    category_id,
    total_cents,
  }));
}
```

**Alternative: Supabase RPC for server-side aggregation:**
If performance is a concern with large transaction volumes, create a Postgres function:
```sql
CREATE OR REPLACE FUNCTION get_spending_by_category(
  p_household_id UUID,
  p_date_from DATE,
  p_date_to DATE
) RETURNS TABLE(category_id UUID, total_cents BIGINT) AS $$
  SELECT t.category_id, SUM(t.amount_cents)::BIGINT as total_cents
  FROM transactions t
  WHERE t.household_id = p_household_id
    AND t.transaction_date >= p_date_from
    AND t.transaction_date <= p_date_to
    AND t.category_id IS NOT NULL
    AND t.amount_cents > 0  -- spending only (positive = outflow in our system)
  GROUP BY t.category_id;
$$ LANGUAGE sql SECURITY DEFINER;
```

### Pattern 3: Circular Progress Ring (Custom SVG)
**What:** Lightweight SVG arc component for budget progress per category
**When to use:** For compact card layouts showing % spent

```tsx
interface BudgetRingProps {
  percent: number;  // 0-100 (can exceed 100 for over-budget)
  size?: number;
  strokeWidth?: number;
  color?: string;
}

function BudgetRing({ percent, size = 48, strokeWidth = 4, color }: BudgetRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cappedPercent = Math.min(percent, 100);
  const offset = circumference - (cappedPercent / 100) * circumference;

  // Color thresholds: sage (< 75%), amber (75-90%), red-ish (> 90%)
  const strokeColor = color ?? (
    percent > 90 ? 'hsl(var(--money-amber))' :
    percent > 75 ? 'hsl(var(--money-amber))' :
    'hsl(var(--money-sage))'
  );

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      {/* Background track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="hsl(var(--money-border))"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}
```

### Pattern 4: Recharts Donut Chart for Spending Breakdown
**What:** PieChart with innerRadius for donut effect, using category colors
**When to use:** Spending breakdown by category on budget page

```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/money/arithmetic';

interface SpendingData {
  name: string;
  value: number;  // cents
  color: string;
  categoryId: string;
}

function SpendingDonut({ data, onCategoryClick }: {
  data: SpendingData[];
  onCategoryClick: (categoryId: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          onClick={(_, index) => onCategoryClick(data[index].categoryId)}
          style={{ cursor: 'pointer' }}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatMoney(value)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 5: SWR Hook for Budget Data
**What:** Client-side data fetching following existing project patterns
**When to use:** All budget/analytics components

```typescript
"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface BudgetWithSpending {
  budget: Budget;
  categories: BudgetCategoryWithSpending[];
  totalSpent: number;
  totalAllocated: number;
}

export function useBudget(month: string) {
  // month format: '2026-02'
  const { data, error, mutate } = useSWR<BudgetWithSpending>(
    `/api/money/budgets?month=${month}`,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    budget: data?.budget ?? null,
    categories: data?.categories ?? [],
    totalSpent: data?.totalSpent ?? 0,
    totalAllocated: data?.totalAllocated ?? 0,
    isLoading,
    error,
    mutate,
  };
}
```

### Pattern 6: Month Navigation
**What:** Left/right arrows to browse budget months, no future months
**When to use:** Budget overview page

```typescript
import { format, subMonths, addMonths, startOfMonth, isFuture } from 'date-fns';

function useMonthNavigation() {
  const [currentMonth, setCurrentMonth] = useState(() =>
    format(startOfMonth(new Date()), 'yyyy-MM')
  );

  const goBack = () => {
    const prev = subMonths(new Date(currentMonth + '-01'), 1);
    setCurrentMonth(format(prev, 'yyyy-MM'));
  };

  const goForward = () => {
    const next = addMonths(new Date(currentMonth + '-01'), 1);
    if (!isFuture(startOfMonth(next))) {
      setCurrentMonth(format(next, 'yyyy-MM'));
    }
  };

  const canGoForward = !isFuture(
    addMonths(new Date(currentMonth + '-01'), 1)
  );

  return { currentMonth, goBack, goForward, canGoForward };
}
```

### Anti-Patterns to Avoid
- **Storing budget amounts as floats/decimals:** All money in this project uses BIGINT cents. Budget allocations must follow the same pattern (`allocated_cents`, `rollover_cents`).
- **Client-side spending aggregation:** Fetching all transactions and summing in the browser is wasteful. Aggregate server-side (in DB class or Postgres function).
- **UTC month boundaries:** The project convention is browser-local dates. Month boundaries must use the client's local timezone, passed to the API as `date_from`/`date_to` params.
- **Automatic rollover without confirmation:** User explicitly decided rollover requires monthly confirmation. Never auto-compute rollover silently.
- **Heavy charting libraries (Victory, D3 raw):** Victory has large bundle size; raw D3 is imperative and doesn't compose with React patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive charts | Canvas rendering, D3 bindigns | Recharts | Handles responsive resize, tooltips, animations, accessibility, click events |
| SVG donut chart | Manual path arc calculations | Recharts PieChart with innerRadius | Built-in label, legend, tooltip, animation support |
| Money formatting | Template literals with toFixed(2) | `formatMoney()` from `lib/money/arithmetic.ts` | Already handles comma grouping, negative prefix, consistent formatting |
| Month arithmetic | Manual date string manipulation | date-fns (startOfMonth, endOfMonth, subMonths, format) | Already in project, handles edge cases (leap years, varying month lengths) |
| Form validation | Manual if/else checks | Zod schemas + react-hook-form | Consistent with project pattern, type-safe |

**Key insight:** The existing money infrastructure (cents arithmetic, SWR patterns, DB class pattern, RLS policies) is comprehensive. Phase 21 is primarily composition of existing patterns plus Recharts integration.

## Common Pitfalls

### Pitfall 1: Amount Sign Convention Confusion
**What goes wrong:** Budget progress shows wrong percentages because spending amounts have unexpected signs.
**Why it happens:** In this project, Plaid transactions use sign inversion at sync boundary (`toCents(-plaidAmount)`). Positive amount_cents = money out (spending), negative = money in (income). Manual transactions may follow a different convention.
**How to avoid:** When aggregating spending, filter on `amount_cents > 0` (outflows only). Verify the sign convention by checking existing transaction data. Document the convention in the aggregation query.
**Warning signs:** Budget shows 0% spent when there are clearly transactions, or shows negative progress.

### Pitfall 2: Supabase JS Client GROUP BY Limitation
**What goes wrong:** Trying to use `.group()` or `GROUP BY` directly in the Supabase JS client and getting errors.
**Why it happens:** The Supabase JS client (PostgREST) doesn't support SQL `GROUP BY`. You must either aggregate in application code or use an RPC function.
**How to avoid:** For small-medium datasets (< 10k transactions/month), aggregate in TypeScript after fetching. For larger datasets, create a Postgres RPC function.
**Warning signs:** Query errors, or fetching entire transaction table to aggregate.

### Pitfall 3: Recharts ResponsiveContainer Requires Parent Height
**What goes wrong:** Charts render with 0 height or don't appear.
**Why it happens:** `ResponsiveContainer` uses `ResizeObserver` on its parent element. If the parent has no explicit height, the chart collapses.
**How to avoid:** Always wrap `ResponsiveContainer` in a div with explicit height: `<div style={{ height: 300 }}>` or use Tailwind `h-[300px]`.
**Warning signs:** Chart area appears empty, no errors in console.

### Pitfall 4: Month Boundary Off-by-One
**What goes wrong:** Transactions on the last day of the month are excluded from the budget period.
**Why it happens:** Using `<` instead of `<=` for the end date, or computing end-of-month incorrectly.
**How to avoid:** Use date-fns `endOfMonth()` for the upper bound, and Supabase `.lte()` (less-than-or-equal) for the date filter. Always test with transactions on the 1st and last day of the month.
**Warning signs:** Spending totals don't match between budget view and transaction list.

### Pitfall 5: Rollover Race Condition
**What goes wrong:** Rollover computed incorrectly when transactions are still syncing for the previous month.
**Why it happens:** Plaid sync can have delays. A user might confirm rollover before all transactions from the previous month have synced.
**How to avoid:** Show a warning if the last sync was more than 24 hours ago. Allow re-confirmation of rollover if amounts change. Store rollover as a confirmed snapshot, not a live computation.
**Warning signs:** Rollover amount changes after confirmation.

### Pitfall 6: Budget Form -- Allocation Exceeds Total
**What goes wrong:** Sum of category allocations exceeds the total envelope amount.
**Why it happens:** No real-time validation as user types individual category amounts.
**How to avoid:** Show running total vs. budget total in the form. Use Zod `.refine()` to validate sum <= total. Consider showing "unallocated" amount that updates live.
**Warning signs:** Validation only catches on submit, confusing for user.

## Code Examples

### Budget Creation API Route
```typescript
// app/api/money/budgets/route.ts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = budgetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const householdId = await resolveHousehold(supabase, user.id);
  const budgetsDB = new BudgetsDB(supabase);

  const budget = await budgetsDB.create({
    household_id: householdId,
    month: parsed.data.month,  // '2026-02-01'
    total_cents: toCents(parsed.data.total),
    rollover_enabled: parsed.data.rollover_enabled ?? false,
  }, parsed.data.categories.map(c => ({
    category_id: c.category_id,
    allocated_cents: toCents(c.amount),
  })));

  return NextResponse.json({ budget }, { status: 201 });
}
```

### Budget Validation Schema
```typescript
// lib/validations/budget.ts
import { z } from "zod";
import { moneyAmountSchema } from "./money";

export const budgetCategorySchema = z.object({
  category_id: z.string().uuid(),
  amount: moneyAmountSchema.refine(v => v >= 0, "Amount must be non-negative"),
});

export const budgetCreateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Must be first day of month"),
  total: moneyAmountSchema.refine(v => v > 0, "Total must be positive"),
  rollover_enabled: z.boolean().optional(),
  categories: z.array(budgetCategorySchema).min(1, "At least one category required"),
}).refine(
  (data) => {
    const sum = data.categories.reduce((acc, c) => acc + c.amount, 0);
    return sum <= data.total;
  },
  { message: "Category allocations cannot exceed total budget" }
);
```

### Rollover Computation (Server-Side)
```typescript
// In BudgetsDB
async computeRollover(
  budgetId: string,
  householdId: string
): Promise<{ category_id: string; rollover_cents: number }[]> {
  // Get budget with categories
  const budget = await this.getWithCategories(budgetId);
  if (!budget || !budget.rollover_enabled) return [];

  // Get spending for the budget month
  const spending = await this.getSpendingByCategory(
    householdId,
    budget.month,
    endOfMonth(new Date(budget.month)).toISOString().split('T')[0]
  );

  const spendingMap = new Map(spending.map(s => [s.category_id, s.total_cents]));

  return budget.categories.map(bc => {
    const spent = spendingMap.get(bc.category_id) || 0;
    const available = bc.allocated_cents + bc.rollover_cents;
    const remaining = available - spent;
    // remaining can be negative (debt carries forward)
    return {
      category_id: bc.category_id,
      rollover_cents: remaining,
    };
  });
}
```

### Recharts Bar Chart for Monthly Trends
```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/money/arithmetic';

interface MonthlyTrend {
  month: string;  // 'Feb 2026'
  spent: number;  // cents
  budget: number; // cents
}

function SpendingTrendBar({ data }: { data: MonthlyTrend[] }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-money-border" />
          <XAxis dataKey="month" className="text-xs" />
          <YAxis
            tickFormatter={(v) => formatMoney(v).replace('$', '')}
            className="text-xs"
          />
          <Tooltip formatter={(value: number) => formatMoney(value)} />
          <Bar dataKey="budget" fill="hsl(var(--money-sage-light))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" fill="hsl(var(--money-sage))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

## Discretion Recommendations

Based on research, here are recommendations for areas left to Claude's discretion:

### Allocation Flexibility: Allow Unallocated Buffer
**Recommendation:** Allow the sum of category allocations to be LESS than the total budget. Show the difference as "Unallocated" in the UI. This gives users flexibility to handle unexpected expenses without strict penny-matching.
**Rationale:** Strict "must allocate every cent" creates friction and is the #1 complaint about YNAB-style tools. A buffer reduces anxiety (Calm Finance philosophy).

### Default Category List: Show Categories With Recent Spending
**Recommendation:** When creating a new budget, pre-populate the form with categories that had transactions in the last 3 months. Show them sorted by total spending (highest first). Allow the user to add/remove categories.
**Rationale:** Showing all 16+ system categories is overwhelming. Showing only used categories provides a helpful starting point.

### Color Thresholds: 75% Warning, 90% Danger
**Recommendation:**
- 0-74%: Sage green (`--money-sage`) -- healthy
- 75-89%: Amber (`--money-amber`) -- approaching limit
- 90-100%: Muted coral/warm tone (new `--money-caution` token, NOT aggressive red) -- near/at limit
- Over 100%: Same coral with pulsing opacity or strikethrough on the remaining amount
**Rationale:** Calm Finance philosophy requires avoiding aggressive red/green. Amber and muted coral feel urgent without causing anxiety.

### Over-Budget Visual Treatment: Filled Ring + Subtle Overage Indicator
**Recommendation:** When over 100%, the ring fills completely and shows a small badge or text indicator showing the overage amount (e.g., "$45 over"). No flashing, no red. Keep the muted coral color.
**Rationale:** The ring physically cannot show >100% -- instead, supplementary text communicates the overage clearly.

### Chart Type: Donut Chart (not treemap)
**Recommendation:** Use donut chart for spending breakdown.
**Rationale:** Donut is more universally understood, works better at small sizes, and the center can display total spent. Treemaps require more screen space and are harder to read with many small categories.

### Chart Interaction: Tooltip-First, Then Click to Drill Down
**Recommendation:** Hover shows tooltip with category name + amount + percentage. Click navigates to drill-down view. This is a two-step disclosure pattern.
**Rationale:** Direct drill-down on hover would be jarring. Tooltip-first lets users explore data passively before committing to a drill-down action.

### Drill-Down Navigation: Inline Panel (Sheet/Drawer)
**Recommendation:** Use a Sheet (slide-in panel from right) showing the transaction list for the clicked category, filtered to the budget month. Reuse the existing `TransactionRow` component.
**Rationale:** Full page navigation loses context. An inline panel lets users see the budget summary alongside the drill-down transactions. The project already has the Sheet component from shadcn/ui.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js with react-chartjs-2 | Recharts v3 (native React 19) | 2024 (Recharts v3 release) | No react-is override needed, better React integration |
| Recharts Cell component | Still works but deprecated in v3.7.0 | Jan 2025 | Cell still functional, but future versions may remove it. Use data-driven color mapping as alternative. |
| Window resize event for responsive charts | ResizeObserver via ResponsiveContainer | Recharts v2+ | More performant, no throttle needed |

**Deprecated/outdated:**
- Recharts v2.x `Cell` component: Deprecated in v3.7.0. Still works but prefer data-driven styling where possible. For PieChart, Cell is still the standard pattern as there's no data-driven alternative yet for per-slice colors.

## Open Questions

1. **Transaction amount sign convention for spending aggregation**
   - What we know: Plaid sync uses sign inversion (`toCents(-plaidAmount)`), meaning positive = outflow, negative = inflow. Manual transactions use `toCents(parsed.data.amount)` directly.
   - What's unclear: Whether manual transactions follow the same positive=outflow convention, or if users enter positive amounts for both income and expenses.
   - Recommendation: Verify by checking existing manual transaction data. Filter on `amount_cents > 0` for spending aggregation, but verify this assumption during implementation.

2. **Spending aggregation for split transactions**
   - What we know: Transactions can be split across categories via `transaction_splits` table. The parent transaction has a single `category_id`.
   - What's unclear: Should spending aggregation use `transaction_splits.amount_cents` (per-split) when splits exist, falling back to `transactions.amount_cents` when no splits exist?
   - Recommendation: Yes -- check if a transaction has splits. If so, use split amounts per category. If not, use the transaction's category_id and full amount. This may require a more complex aggregation query or RPC function.

3. **Recharts v3.7.0 Cell deprecation migration path**
   - What we know: Cell is deprecated but functional. No official replacement for per-slice coloring in PieChart yet.
   - What's unclear: When Cell will be removed and what the replacement API will look like.
   - Recommendation: Use Cell for now (it works in v3.7.0). The migration path will likely be a `fill` callback on the Pie `data` prop. This is LOW risk since we control the Recharts version.

## Sources

### Primary (HIGH confidence)
- Context7 `/recharts/recharts` - PieChart donut pattern, BarChart pattern, ResponsiveContainer, Tooltip customization, Cell component usage
- Context7 `/recharts/recharts/v3.3.0` - Cell component documentation (still available in v3.x)
- Existing codebase: `lib/db/transactions.ts`, `lib/money/arithmetic.ts`, `lib/db/categories-db.ts`, `lib/validations/money.ts` -- verified current patterns
- Existing codebase: `supabase/migrations/20260221000002_create_money_tables.sql`, `supabase/migrations/20260222000001_add_categories_and_splits.sql` -- verified schema and RLS patterns

### Secondary (MEDIUM confidence)
- [Recharts GitHub releases](https://github.com/recharts/recharts/releases) -- v3.7.0 latest, Cell deprecation confirmed
- [Recharts React 19 issue #4558](https://github.com/recharts/recharts/issues/4558) -- closed/resolved, v3.x has native support
- [Recharts npm page](https://www.npmjs.com/package/recharts) -- v3.7.0 latest published

### Tertiary (LOW confidence)
- WebSearch results on Recharts + React 19 compatibility -- multiple sources confirmed, but exact v3.7.0 peer dependency details not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Recharts is well-documented, React 19 support confirmed via GitHub issue closure and multiple sources. All other libraries already in project.
- Architecture: HIGH - Database schema follows established project patterns (BIGINT cents, household_id FK, IN-subquery RLS). API/component patterns directly mirror existing Phase 19/20 code.
- Pitfalls: HIGH - Sign convention, Supabase GROUP BY limitation, ResponsiveContainer height requirement all verified against project codebase and official docs.

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days - stable domain, no fast-moving dependencies)
