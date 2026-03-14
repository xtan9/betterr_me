"use client";

import { useHousehold } from "@/lib/hooks/use-household";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";
import { NetWorthChart } from "@/components/money/net-worth-chart";
import { NetWorthSummary } from "@/components/money/net-worth-summary";
import { NetWorthAccounts } from "@/components/money/net-worth-accounts";

/**
 * Client wrapper for net worth page that provides household view tabs.
 * The individual sub-components (Chart, Summary, Accounts) call their own
 * SWR hooks internally. Since useHousehold state is per-component instance,
 * we pass viewMode down as a prop for coordinated view switching.
 */
export function NetWorthPageContent() {
  const { viewMode, setViewMode, isMultiMember } = useHousehold();

  return (
    <div className="space-y-6">
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />
      <NetWorthChart view={viewMode} />
      <NetWorthSummary view={viewMode} />
      <NetWorthAccounts view={viewMode} />
    </div>
  );
}
