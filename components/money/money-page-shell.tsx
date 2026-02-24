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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useHousehold } from "@/lib/hooks/use-household";
import { formatMoney } from "@/lib/money/arithmetic";
import { AccountsEmptyState } from "@/components/money/accounts-empty-state";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";

export function MoneyPageShell() {
  const t = useTranslations("money");
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const { connections, netWorthCents, isLoading } = useAccounts(viewMode);

  // Only show skeleton on initial load (no data yet)
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  // Empty state for new users
  if (connections.length === 0) {
    return <AccountsEmptyState />;
  }

  // Quick summary linking to /money/accounts
  return (
    <div className="space-y-4">
      {/* Mine/Household tabs */}
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />

      <div className="rounded-xl border border-money-border bg-money-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("accounts.netWorth")}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(netWorthCents)}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/money/accounts">
              {t("accounts.title")}
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          {connections.length}{" "}
          {connections.length === 1
            ? "connected account"
            : "connected accounts"}
        </div>
      </div>

      {/* Navigation links */}
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
