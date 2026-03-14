import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { format, startOfWeek } from "date-fns";
import { log } from "@/lib/logger";

/**
 * GET /api/money/dashboard/summary
 *
 * Lightweight endpoint for the money summary card on the main habit/task
 * dashboard. Must be fast and independent of the full money dashboard.
 *
 * Returns spending pulse: spent today, spent this week, budget total.
 * Fast path: returns { has_accounts: false } if no accounts exist.
 *
 * Query params:
 * - date: YYYY-MM-DD (browser-local date, project convention)
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

    // Parse date param
    const dateParam = request.nextUrl.searchParams.get("date");
    const today = dateParam || format(new Date(), "yyyy-MM-dd");
    const todayDate = new Date(today + "T12:00:00");

    // Fast path: check if any accounts exist
    const { count: accountCount, error: countError } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("household_id", householdId);

    if (countError) throw countError;

    if (!accountCount || accountCount === 0) {
      return NextResponse.json({ has_accounts: false });
    }

    // Compute start of week (Monday)
    const weekStart = format(
      startOfWeek(todayDate, { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );

    // Current month for budget lookup
    const monthDate = `${today.slice(0, 7)}-01`;

    // Parallel queries
    const [todayTxResult, weekTxResult, budgetResult] = await Promise.all([
      // Spent today: sum abs(amount_cents) for negative transactions on today
      supabase
        .from("transactions")
        .select("amount_cents")
        .eq("household_id", householdId)
        .eq("transaction_date", today)
        .lt("amount_cents", 0),

      // Spent this week: sum abs(amount_cents) for negative transactions since week start
      supabase
        .from("transactions")
        .select("amount_cents")
        .eq("household_id", householdId)
        .gte("transaction_date", weekStart)
        .lte("transaction_date", today)
        .lt("amount_cents", 0),

      // Budget total for current month
      supabase
        .from("budgets")
        .select("total_cents")
        .eq("household_id", householdId)
        .eq("month", monthDate)
        .single(),
    ]);

    if (todayTxResult.error) throw todayTxResult.error;
    if (weekTxResult.error) throw weekTxResult.error;

    // Sum absolute values of negative transactions
    const spentTodayCents = (todayTxResult.data || []).reduce(
      (sum: number, t: { amount_cents: number }) =>
        sum + Math.abs(t.amount_cents),
      0
    );

    const spentThisWeekCents = (weekTxResult.data || []).reduce(
      (sum: number, t: { amount_cents: number }) =>
        sum + Math.abs(t.amount_cents),
      0
    );

    // Budget total (null if no budget exists for this month)
    const budgetTotalCents =
      budgetResult.error?.code === "PGRST116"
        ? null
        : budgetResult.error
          ? null
          : budgetResult.data?.total_cents ?? null;

    return NextResponse.json({
      has_accounts: true,
      spent_today_cents: spentTodayCents,
      spent_this_week_cents: spentThisWeekCents,
      budget_total_cents: budgetTotalCents,
    });
  } catch (error) {
    log.error("GET /api/money/dashboard/summary error", error);
    return NextResponse.json(
      { error: "Failed to fetch money summary" },
      { status: 500 }
    );
  }
}
