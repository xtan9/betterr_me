"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  PieChart,
  Receipt,
  Settings,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardMoney } from "@/lib/hooks/use-dashboard-money";
import { DashboardHero } from "@/components/money/dashboard-hero";
import { UpcomingBillsList } from "@/components/money/upcoming-bills-list";
import { CashFlowProjection } from "@/components/money/cash-flow-projection";
import { IncomeConfirmation } from "@/components/money/income-confirmation";
import type { ViewMode } from "@/lib/db/types";

interface MoneyDashboardProps {
  viewMode: ViewMode;
}

/**
 * Main money dashboard orchestrator.
 * Fetches all dashboard data via useDashboardMoney hook and renders
 * the hero row, income confirmation, upcoming bills, and cash flow sections.
 */
export function MoneyDashboard({ viewMode }: MoneyDashboardProps) {
  const t = useTranslations("money");
  const { dashboard, isLoading, mutate } = useDashboardMoney(viewMode);

  // Loading skeleton matching the hero + bills layout
  if (isLoading || !dashboard) {
    return (
      <div className="space-y-4">
        {/* Hero skeleton */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        {/* Bills skeleton */}
        <Skeleton className="h-40 w-full rounded-xl" />
        {/* Cash flow skeleton */}
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const handleConfirmIncome = async (income: {
    merchant_name: string;
    amount_cents: number;
    frequency: string;
    next_expected_date: string;
  }) => {
    await fetch("/api/money/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(income),
    });
    toast.success(t("dashboard.incomeConfirmed"));
    mutate(); // Revalidate dashboard data
  };

  const handleDismissIncome = () => {
    // Dismiss income detection — won't be used for projections
    mutate();
  };

  return (
    <div className="space-y-4">
      {/* 1. Hero: three key numbers — always visible */}
      <DashboardHero
        availableCents={dashboard.available_cents}
        upcomingBillsTotalCents={dashboard.upcoming_bills_total_cents}
        endOfMonthBalanceCents={dashboard.end_of_month_balance_cents}
        confidenceLabel={dashboard.confidence_label}
        hasConfirmedIncome={dashboard.has_confirmed_income}
      />

      {/* 2. Income confirmation — only when needs_confirmation is true */}
      {dashboard.income_status.needs_confirmation &&
        dashboard.income_status.detected && (
          <IncomeConfirmation
            detectedIncome={dashboard.income_status.detected}
            onConfirm={handleConfirmIncome}
            onDismiss={handleDismissIncome}
          />
        )}

      {/* 3. Upcoming bills — urgency section */}
      <UpcomingBillsList bills={dashboard.upcoming_bills} />

      {/* 4. Cash flow projection */}
      <CashFlowProjection
        dailyBalances={dashboard.daily_balances}
        dailySpendingRateCents={dashboard.daily_spending_rate_cents}
      />

      {/* 5. InsightList page="dashboard" — wired in Plan 04 */}

      {/* 6. Quick nav links grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/transactions">
            <Receipt className="mr-2 size-4" />
            {t("transactions.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/budgets">
            <PieChart className="mr-2 size-4" />
            {t("budgets.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/bills">
            <CalendarCheck className="mr-2 size-4" />
            {t("bills.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/goals">
            <Target className="mr-2 size-4" />
            {t("goals.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/net-worth">
            <TrendingUp className="mr-2 size-4" />
            {t("netWorth.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="justify-start" asChild>
          <Link href="/money/settings">
            <Settings className="mr-2 size-4" />
            {t("settings.title")}
            <ArrowRight className="ml-auto size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
