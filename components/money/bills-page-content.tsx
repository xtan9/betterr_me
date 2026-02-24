"use client";

import { useTranslations } from "next-intl";
import { List, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillsList } from "@/components/money/bills-list";
import { BillCalendar } from "@/components/money/bill-calendar";
import { SmartBillCalendar } from "@/components/money/smart-bill-calendar";
import { InsightList } from "@/components/money/insight-list";
import { useHousehold } from "@/lib/hooks/use-household";
import { useBills } from "@/lib/hooks/use-bills";
import { useDashboardMoney } from "@/lib/hooks/use-dashboard-money";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";

export function BillsPageContent() {
  const t = useTranslations("money.bills");
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const { bills } = useBills(viewMode);
  // Fetch dashboard data for smart calendar projection overlay.
  // SWR caching means if user visited /money first, data is already warm.
  const { dashboard } = useDashboardMoney(viewMode);

  // Use SmartBillCalendar when projection data is available, fall back to regular
  const hasProjectionData =
    dashboard &&
    dashboard.daily_balances &&
    dashboard.daily_balances.length > 0;

  return (
    <div className="space-y-4">
      {/* Subscription alerts (AIML-02) */}
      <InsightList page="bills" className="mb-4" />

      {/* Mine/Household tabs */}
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <List className="mr-1.5 size-4" />
            {t("listView")}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Calendar className="mr-1.5 size-4" />
            {t("calendarView")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <BillsList />
        </TabsContent>

        <TabsContent value="calendar">
          {hasProjectionData ? (
            <SmartBillCalendar
              bills={bills}
              dailyBalances={dashboard.daily_balances}
              dailySpendingRateCents={dashboard.daily_spending_rate_cents}
            />
          ) : (
            <BillCalendar bills={bills} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
