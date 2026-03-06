"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useHousehold } from "@/lib/hooks/use-household";
import { AccountsEmptyState } from "@/components/money/accounts-empty-state";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";
import { MoneyDashboard } from "@/components/money/money-dashboard";

export function MoneyPageShell() {
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const { connections, isLoading } = useAccounts(viewMode);

  // Only show skeleton on initial load (no data yet)
  if (isLoading) {
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
        {/* Nav skeleton */}
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

  // Connected users see the forward-looking dashboard
  return (
    <div className="space-y-4">
      {/* Mine/Household tabs */}
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />

      {/* Dashboard handles its own data fetching via useDashboardMoney */}
      <MoneyDashboard viewMode={viewMode} />
    </div>
  );
}
