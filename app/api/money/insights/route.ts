import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import {
  BudgetsDB,
  CategoriesDB,
  RecurringBillsDB,
  SavingsGoalsDB,
} from "@/lib/db";
import {
  computeSpendingAnomalies,
  computeSubscriptionAlerts,
  computeGoalInsights,
  computeInsights,
} from "@/lib/money/insights";
import { insightDismissSchema } from "@/lib/validations/money";
import { format, addMonths } from "date-fns";
import { log } from "@/lib/logger";
import type { InsightPage, GoalWithProjection } from "@/lib/db/types";

/**
 * GET /api/money/insights
 *
 * Returns computed contextual insights filtered by page and excluding
 * previously dismissed items.
 *
 * Query params:
 * - page: "dashboard" | "budgets" | "bills" | "goals" (optional filter)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);

    const page = request.nextUrl.searchParams.get("page") as InsightPage | null;
    const now = new Date();
    const currentMonthStr = format(now, "yyyy-MM");
    const currentMonthDate = `${currentMonthStr}-01`;
    const nextMonthDate = format(addMonths(new Date(currentMonthDate), 1), "yyyy-MM-dd");

    // Parallel data fetching
    const budgetsDB = new BudgetsDB(supabase);
    const categoriesDB = new CategoriesDB(supabase);
    const billsDB = new RecurringBillsDB(supabase);
    const goalsDB = new SavingsGoalsDB(supabase);

    const [
      currentSpendingRaw,
      historicalSpendingRaw,
      categories,
      bills,
      goals,
      dismissedResult,
    ] = await Promise.all([
      // Current month spending by category
      budgetsDB.getSpendingByCategory(householdId, currentMonthDate, nextMonthDate),

      // Previous 3 months spending by category (for historical average)
      Promise.all(
        [1, 2, 3].map(async (monthsAgo) => {
          const monthStart = format(
            addMonths(new Date(currentMonthDate), -monthsAgo),
            "yyyy-MM-dd"
          );
          const monthEnd = format(
            addMonths(new Date(monthStart), 1),
            "yyyy-MM-dd"
          );
          return budgetsDB.getSpendingByCategory(householdId, monthStart, monthEnd);
        })
      ),

      // Categories for name lookup
      categoriesDB.getVisible(householdId),

      // Recurring bills for subscription alerts
      billsDB.getByHousehold(householdId),

      // Goals for progress insights
      goalsDB.getByHousehold(householdId),

      // Dismissed insight IDs
      supabase
        .from("dismissed_insights")
        .select("insight_id")
        .eq("household_id", householdId),
    ]);

    if (dismissedResult.error) throw dismissedResult.error;

    const dismissedIds = new Set(
      (dismissedResult.data || []).map(
        (d: { insight_id: string }) => d.insight_id
      )
    );

    // Build category name lookup
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    // Enrich current month spending with category names
    const currentMonthSpending = currentSpendingRaw.map((s) => ({
      category_name: categoryMap.get(s.category_id) ?? "Unknown",
      amount_cents: s.total_cents,
    }));

    // Compute historical average per category
    const historyByCat = new Map<string, number[]>();
    for (const monthData of historicalSpendingRaw) {
      for (const s of monthData) {
        const name = categoryMap.get(s.category_id) ?? "Unknown";
        if (!historyByCat.has(name)) historyByCat.set(name, []);
        historyByCat.get(name)!.push(s.total_cents);
      }
    }

    const historicalAverage = Array.from(historyByCat.entries()).map(
      ([category_name, amounts]) => ({
        category_name,
        avg_cents: Math.round(
          amounts.reduce((sum, a) => sum + a, 0) / amounts.length
        ),
      })
    );

    // Compute all insight types
    const spendingAnomalies = computeSpendingAnomalies(
      currentMonthSpending,
      historicalAverage,
      currentMonthStr
    );

    const subscriptionAlerts = computeSubscriptionAlerts(bills);

    // Build GoalWithProjection array for goal insights
    // We need projected_date and current_cents/target_cents which getByHousehold provides
    const goalsWithProjections: GoalWithProjection[] = goals.map((goal) => ({
      ...goal,
      projected_date: null, // Simplified: goal insights only check progress %
      monthly_rate_cents: 0,
      status_color: "green" as const,
    }));

    // For goals that have a deadline, do a rough projection
    for (const gwp of goalsWithProjections) {
      if (gwp.deadline && gwp.current_cents < gwp.target_cents) {
        // Fetch contributions for each goal to compute rate
        const contributions = await goalsDB.getContributions(gwp.id);
        if (contributions.length > 0) {
          const threeMonthsAgo = addMonths(now, -3);
          const recentContribs = contributions.filter(
            (c) => new Date(c.contributed_at) >= threeMonthsAgo
          );
          if (recentContribs.length > 0) {
            const totalCents = recentContribs.reduce(
              (sum, c) => sum + c.amount_cents,
              0
            );
            const earliest = new Date(
              Math.min(
                ...recentContribs.map((c) =>
                  new Date(c.contributed_at).getTime()
                )
              )
            );
            const monthsWithData = Math.max(
              1,
              (now.getTime() - earliest.getTime()) /
                (30.44 * 24 * 60 * 60 * 1000)
            );
            const monthlyRate = totalCents / monthsWithData;
            if (monthlyRate > 0) {
              const remaining = gwp.target_cents - gwp.current_cents;
              const monthsToGo = remaining / monthlyRate;
              gwp.projected_date = format(
                addMonths(now, Math.ceil(monthsToGo)),
                "yyyy-MM-dd"
              );
            }
          }
        }
      }
    }

    const goalInsights = computeGoalInsights(goalsWithProjections);

    // Merge, filter dismissed, sort, and limit
    let insights = computeInsights({
      spendingAnomalies,
      subscriptionAlerts,
      goalInsights,
      dismissedIds,
    });

    // Filter by page if specified
    if (page) {
      insights = insights.filter((i) => i.page === page);
    }

    return NextResponse.json({ insights });
  } catch (error) {
    log.error("GET /api/money/insights error", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/insights
 *
 * Dismiss an insight by ID. Inserts into dismissed_insights table.
 * ON CONFLICT DO NOTHING for idempotency.
 *
 * Body:
 * - insight_id: string
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = insightDismissSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Insert dismissed insight (ON CONFLICT DO NOTHING for idempotency)
    const { error: insertError } = await supabase
      .from("dismissed_insights")
      .upsert(
        {
          household_id: householdId,
          insight_id: parsed.data.insight_id,
        },
        { onConflict: "household_id,insight_id" }
      );

    if (insertError) throw insertError;

    return NextResponse.json({ dismissed: true });
  } catch (error) {
    log.error("POST /api/money/insights error", error);
    return NextResponse.json(
      { error: "Failed to dismiss insight" },
      { status: 500 }
    );
  }
}
