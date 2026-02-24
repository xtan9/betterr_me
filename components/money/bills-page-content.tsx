"use client";

import { useTranslations } from "next-intl";
import { List, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillsList } from "@/components/money/bills-list";
import { BillCalendar } from "@/components/money/bill-calendar";
import { useHousehold } from "@/lib/hooks/use-household";
import { useBills } from "@/lib/hooks/use-bills";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";

export function BillsPageContent() {
  const t = useTranslations("money.bills");
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const { bills } = useBills(viewMode);

  return (
    <div className="space-y-4">
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
          <BillCalendar bills={bills} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
