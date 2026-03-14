import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { MoneyAccountsDB, RecurringBillsDB, TransactionsDB } from "@/lib/db";
import {
  computeDailySpendingRate,
  computeAvailableMoney,
  computeEndOfMonthBalance,
  projectDailyBalances,
} from "@/lib/money/projections";
import { detectIncomePatterns } from "@/lib/money/income-detection";
import { addDays, format, subDays, endOfMonth, differenceInDays } from "date-fns";
import { log } from "@/lib/logger";
import type {
  ConfirmedIncomePattern,
  DetectedIncome,
  ViewMode,
} from "@/lib/db/types";

/**
 * GET /api/money/dashboard
 *
 * Aggregated dashboard endpoint: balances, upcoming bills, projections, income
 * status. All computed server-side to avoid client-side waterfalls.
 *
 * Query params:
 * - date: YYYY-MM-DD (browser-local date, project convention)
 * - view: mine | household (default: mine)
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

    // Parse query params
    const dateParam = request.nextUrl.searchParams.get("date");
    const today = dateParam || format(new Date(), "yyyy-MM-dd");
    const todayDate = new Date(today + "T12:00:00");
    const view = (request.nextUrl.searchParams.get("view") || "mine") as ViewMode;

    // ---------------------------------------------------------------------------
    // Bulk queries (parallel)
    // ---------------------------------------------------------------------------
    const accountsDB = new MoneyAccountsDB(supabase);
    const billsDB = new RecurringBillsDB(supabase);
    const transactionsDB = new TransactionsDB(supabase);

    const thirtyDaysAgo = format(subDays(todayDate, 30), "yyyy-MM-dd");
    const thirtyDaysFromNow = addDays(todayDate, 30);

    const [allAccounts, allBills, recentTransactions, incomeResult] =
      await Promise.all([
        accountsDB.getByHousehold(householdId),
        billsDB.getByHousehold(householdId),
        transactionsDB.getByHousehold(householdId, {
          dateFrom: thirtyDaysAgo,
          dateTo: today,
          limit: 10000,
        }),
        supabase
          .from("confirmed_income_patterns")
          .select("*")
          .eq("household_id", householdId)
          .eq("needs_reconfirmation", false),
      ]);

    const confirmedPatterns: ConfirmedIncomePattern[] =
      incomeResult.data || [];

    // Compute total balance from all non-hidden accounts
    const totalBalanceCents = allAccounts
      .filter((a) => !a.is_hidden)
      .reduce((sum, a) => sum + a.balance_cents, 0);

    // Filter upcoming bills (active, not dismissed, due in next 30 days)
    const upcomingBills = allBills.filter((b) => {
      if (!b.is_active || b.user_status === "dismissed" || !b.next_due_date)
        return false;
      const due = new Date(b.next_due_date + "T12:00:00");
      return due >= todayDate && due <= thirtyDaysFromNow;
    });

    // ---------------------------------------------------------------------------
    // Server-side computations
    // ---------------------------------------------------------------------------
    const transactions = recentTransactions.transactions;

    const dailySpendingRateCents = computeDailySpendingRate(
      transactions,
      thirtyDaysAgo,
      today
    );

    // Bills due before next payday (or end of month)
    const endOfMonthDate = endOfMonth(todayDate);
    const daysRemaining = differenceInDays(endOfMonthDate, todayDate);

    const upcomingBillsTotalCents = upcomingBills.reduce(
      (sum, b) => sum + Math.abs(b.amount_cents),
      0
    );

    // Available money = balance + sum of bill amounts (bills are negative)
    const availableMoneyCents = computeAvailableMoney(
      totalBalanceCents,
      upcomingBills.map((b) => ({ amount_cents: b.amount_cents }))
    );

    // Expected income this month from confirmed patterns
    let expectedIncomeCents = 0;
    if (confirmedPatterns.length > 0) {
      const monthEnd = format(endOfMonthDate, "yyyy-MM-dd");
      for (const pattern of confirmedPatterns) {
        // Simple estimate: if next_expected_date is within this month, add it
        if (pattern.next_expected_date >= today && pattern.next_expected_date <= monthEnd) {
          expectedIncomeCents += pattern.amount_cents;
        }
      }
    }

    const endOfMonthBalanceCents = computeEndOfMonthBalance(
      totalBalanceCents,
      dailySpendingRateCents,
      daysRemaining,
      upcomingBills.reduce((sum, b) => sum + b.amount_cents, 0), // negative sum
      expectedIncomeCents
    );

    // Project daily balances from today to end of next month
    const projectionEnd = format(
      endOfMonth(addDays(endOfMonthDate, 1)),
      "yyyy-MM-dd"
    );
    const dailyBalances = projectDailyBalances({
      currentBalanceCents: totalBalanceCents,
      upcomingBills: allBills
        .filter(
          (b) =>
            b.is_active &&
            b.user_status !== "dismissed" &&
            b.next_due_date !== null
        )
        .map((b) => ({
          amount_cents: b.amount_cents,
          due_date: b.next_due_date!,
        })),
      dailySpendingRateCents,
      confirmedIncome:
        confirmedPatterns.length > 0
          ? confirmedPatterns.map((p) => ({
              amount_cents: p.amount_cents,
              next_date: p.next_expected_date,
              frequency: p.frequency,
            }))
          : null,
      startDate: today,
      endDate: projectionEnd,
    });

    // ---------------------------------------------------------------------------
    // Income detection (if no confirmed patterns)
    // ---------------------------------------------------------------------------
    let incomeStatus: {
      detected: DetectedIncome[] | null;
      confirmed: ConfirmedIncomePattern[] | null;
      needs_confirmation: boolean;
    } = {
      detected: null,
      confirmed: confirmedPatterns.length > 0 ? confirmedPatterns : null,
      needs_confirmation: false,
    };

    if (confirmedPatterns.length === 0) {
      // Query last 6 months of positive transactions for income detection
      const sixMonthsAgo = format(subDays(todayDate, 180), "yyyy-MM-dd");
      const { transactions: positiveTransactions } =
        await transactionsDB.getByHousehold(householdId, {
          dateFrom: sixMonthsAgo,
          dateTo: today,
          limit: 10000,
        });

      const detected = detectIncomePatterns(positiveTransactions);
      if (detected.length > 0) {
        incomeStatus = {
          detected,
          confirmed: null,
          needs_confirmation: true,
        };
      }
    }

    // ---------------------------------------------------------------------------
    // Response
    // ---------------------------------------------------------------------------
    // View filtering for accounts is not applied to the dashboard aggregation
    // since we need total household balance for projections. The `view` param
    // is accepted for forward compatibility but not used in aggregation logic.
    void view;

    return NextResponse.json({
      available_cents: availableMoneyCents,
      upcoming_bills_total_cents: upcomingBillsTotalCents,
      end_of_month_balance_cents: endOfMonthBalanceCents,
      daily_spending_rate_cents: dailySpendingRateCents,
      daily_balances: dailyBalances,
      upcoming_bills: upcomingBills.map((b) => ({
        merchant_name: b.name,
        amount_cents: b.amount_cents,
        due_date: b.next_due_date,
      })),
      income_status: incomeStatus,
      has_confirmed_income: confirmedPatterns.length > 0,
      confidence_label:
        confirmedPatterns.length > 0
          ? "based on confirmed income"
          : "estimated",
    });
  } catch (error) {
    log.error("GET /api/money/dashboard error", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
